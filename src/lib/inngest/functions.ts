import { inngest } from "./client";
import { createServiceClient } from "@/lib/supabase/server";
import { parseBid } from "@/lib/pipeline/parse-bid";
import { callClaude } from "@/lib/ai/anthropic";
import {
  PreFlightSchema,
  SectionAnalysisSchema,
  CrossReferenceSchema,
  ScoringSchema,
  type SectionAnalysis,
  type CrossReference,
  type Scoring,
} from "@/lib/pipeline/schemas";
import {
  buildPreFlightPrompt,
  buildSectionAnalysisPrompt,
  buildSectionAnalysisSystemPrompt,
  buildCrossReferencePrompt,
  buildScoringPrompt,
  buildScoringSystemPrompt,
  createSkippedSectionAnalysis,
  MIN_SECTION_WORDS,
  type Criterion,
} from "@/lib/pipeline/prompt-templates";
import { generateReviewDoc } from "@/lib/pipeline/generate-review";

// ---------------------------------------------------------------------------
// Model mapping
// ---------------------------------------------------------------------------

const MODEL_MAP: Record<string, string> = {
  haiku: "claude-haiku-4-5-20251001",
  sonnet: "claude-sonnet-4-6",
};

// ---------------------------------------------------------------------------
// Helper: update review status + progress
// ---------------------------------------------------------------------------

async function updateProgress(
  reviewId: string,
  status: string,
  progressUpdate: Record<string, unknown>
) {
  const supabase = createServiceClient();

  // Update reviews.status
  await supabase.from("reviews").update({ status }).eq("id", reviewId);

  // Merge into review_results.progress
  const { data: existing } = await supabase
    .from("review_results")
    .select("progress")
    .eq("review_id", reviewId)
    .single();

  const progress = { ...(existing?.progress as Record<string, unknown> ?? {}), ...progressUpdate };
  await supabase.from("review_results").update({ progress }).eq("review_id", reviewId);
}

async function markFailed(reviewId: string, errorMessage: string) {
  const supabase = createServiceClient();
  await supabase
    .from("reviews")
    .update({ status: "failed", error_message: errorMessage })
    .eq("id", reviewId);
}

// ---------------------------------------------------------------------------
// Pipeline function
// ---------------------------------------------------------------------------

export const reviewSubmitted = inngest.createFunction(
  {
    id: "review-submitted",
    concurrency: { key: "event.data.userId", limit: 1 },
    retries: 3,
  },
  { event: "review/submitted" },
  async ({ event, step }) => {
    const { reviewId, userId, completeDraft = true } = event.data;

    // -----------------------------------------------------------------------
    // Load review metadata
    // -----------------------------------------------------------------------
    const reviewData = await step.run("load-review", async () => {
      const supabase = createServiceClient();
      const { data, error } = await supabase
        .from("reviews")
        .select("bid_file_name, bid_file_path, criteria_json, model_tier")
        .eq("id", reviewId)
        .single();

      if (error || !data) throw new Error(`Review not found: ${reviewId}`);
      return data;
    });

    const model = MODEL_MAP[reviewData.model_tier] ?? MODEL_MAP.sonnet;
    const criteria = (reviewData.criteria_json as { criteria: Criterion[] })?.criteria ?? [];

    // -----------------------------------------------------------------------
    // Step 1: Parse bid
    // -----------------------------------------------------------------------
    const parsedBid = await step.run("parse-bid", async () => {
      await updateProgress(reviewId, "parsing", { parse_started: Date.now() });

      const supabase = createServiceClient();
      const { data: fileData, error: downloadError } = await supabase.storage
        .from("bid-uploads")
        .download(reviewData.bid_file_path);

      if (downloadError || !fileData) {
        throw new Error(`Failed to download bid: ${downloadError?.message}`);
      }

      const arrayBuffer = await fileData.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const result = await parseBid(buffer, reviewData.bid_file_name);

      await updateProgress(reviewId, "parsing", {
        parse_completed: Date.now(),
        total_sections: result.sections.length,
        total_paragraphs: result.metadata.total_paragraphs,
        total_words: result.metadata.total_words,
      });

      return result;
    });

    // -----------------------------------------------------------------------
    // Step 2: Pre-flight check
    // -----------------------------------------------------------------------
    const preflight = await step.run("preflight-check", async () => {
      await updateProgress(reviewId, "parsing", { preflight_started: Date.now() });

      const prompt = buildPreFlightPrompt(parsedBid);
      const result = await callClaude({
        prompt,
        schema: PreFlightSchema,
        model: MODEL_MAP.haiku, // Always use Haiku for preflight (cheap + fast)
        maxTokens: 512,
      });

      await updateProgress(reviewId, "parsing", {
        preflight_completed: Date.now(),
        preflight: result,
      });

      return result;
    });

    // Check preflight result — reject if not a bid
    // If completeDraft is false (user marked as WIP), skip the substantive check
    if (!preflight.is_bid || (completeDraft && !preflight.substantive)) {
      await step.run("reject-non-bid", async () => {
        const reason =
          preflight.rejection_reason || "Document does not appear to be a substantive funding bid.";
        await markFailed(reviewId, reason);
      });
      return { reviewId, status: "failed", reason: preflight.rejection_reason };
    }

    // -----------------------------------------------------------------------
    // Step 3: Section analysis (sequential — one per section)
    // -----------------------------------------------------------------------
    const sectionAnalyses: SectionAnalysis[] = [];
    const sectionSystemPrompt = buildSectionAnalysisSystemPrompt(criteria);

    for (const section of parsedBid.sections) {
      // Skip trivial sections (< MIN_SECTION_WORDS) — no Claude call needed
      if (section.word_count < MIN_SECTION_WORDS) {
        sectionAnalyses.push(createSkippedSectionAnalysis(section));
        continue;
      }

      const analysis = await step.run(
        `section-analysis-${section.id}`,
        async () => {
          await updateProgress(reviewId, "analysing", {
            analysis_started: Date.now(),
          });

          const prompt = buildSectionAnalysisPrompt(parsedBid, section, completeDraft);
          const result = await callClaude({
            prompt,
            systemPrompt: sectionSystemPrompt,
            schema: SectionAnalysisSchema,
            model,
            maxTokens: 16384,
          });

          await updateProgress(reviewId, "analysing", {
            [`section_${section.id}_completed`]: Date.now(),
            sections_completed: sectionAnalyses.length + 1,
            sections_total: parsedBid.sections.length,
          });

          return result;
        }
      );

      sectionAnalyses.push(analysis);
    }

    // -----------------------------------------------------------------------
    // Step 4: Cross-reference
    // -----------------------------------------------------------------------
    const crossReference: CrossReference = await step.run("cross-reference", async () => {
      await updateProgress(reviewId, "cross_referencing", { crossref_started: Date.now() });

      const prompt = buildCrossReferencePrompt(parsedBid, sectionAnalyses, criteria, completeDraft);
      const result = await callClaude({
        prompt,
        schema: CrossReferenceSchema,
        model,
        maxTokens: 16384,
      });

      await updateProgress(reviewId, "cross_referencing", { crossref_completed: Date.now() });

      return result;
    });

    // -----------------------------------------------------------------------
    // Step 5: Scoring
    // -----------------------------------------------------------------------
    const scoringSystemPrompt = buildScoringSystemPrompt();
    const scoring: Scoring = await step.run("scoring", async () => {
      await updateProgress(reviewId, "scoring", { scoring_started: Date.now() });

      const prompt = buildScoringPrompt(parsedBid, sectionAnalyses, crossReference, criteria, completeDraft);
      const result = await callClaude({
        prompt,
        systemPrompt: scoringSystemPrompt,
        schema: ScoringSchema,
        model,
        maxTokens: 16384,
      });

      await updateProgress(reviewId, "scoring", { scoring_completed: Date.now() });

      return result;
    });

    // -----------------------------------------------------------------------
    // Step 6: Generate review document
    // -----------------------------------------------------------------------
    const outputPath = await step.run("generate-doc", async () => {
      await updateProgress(reviewId, "generating", { generation_started: Date.now() });

      const bidName = reviewData.bid_file_name.replace(/\.docx$/i, "");
      const docBuffer = await generateReviewDoc(parsedBid, sectionAnalyses, scoring, bidName);

      // Upload to Supabase Storage
      const supabase = createServiceClient();
      const filePath = `${userId}/${reviewId}/review-output.docx`;

      const { error: uploadError } = await supabase.storage
        .from("review-outputs")
        .upload(filePath, docBuffer, {
          contentType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          upsert: true,
        });

      if (uploadError) {
        throw new Error(`Failed to upload review: ${uploadError.message}`);
      }

      // Save results + mark completed
      await supabase
        .from("review_results")
        .update({
          results: {
            section_analyses: sectionAnalyses,
            cross_reference: crossReference,
            scoring,
          },
        })
        .eq("review_id", reviewId);

      await supabase
        .from("reviews")
        .update({ status: "completed", output_file_path: filePath })
        .eq("id", reviewId);

      await updateProgress(reviewId, "completed", { generation_completed: Date.now() });

      return filePath;
    });

    return { reviewId, status: "completed", outputPath };
  }
);
