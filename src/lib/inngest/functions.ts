import { NonRetriableError } from "inngest";
import { inngest } from "./client";
import { createServiceClient } from "@/lib/supabase/server";
import { parseBid } from "@/lib/pipeline/parse-bid";
import { callClaude } from "@/lib/ai/anthropic";
import {
  PreFlightSchema,
  SectionAnalysisSchema,
  CrossReferenceSchema,
  ScoringSchema,
  QuestionMappingSchema,
  type SectionAnalysis,
  type CrossReference,
  type Scoring,
} from "@/lib/pipeline/schemas";
import type { QuestionsSet } from "@/lib/schemas/criteria";
import { matchQuestionsToSections } from "@/lib/pipeline/question-matcher";
import {
  buildPreFlightPrompt,
  buildSectionAnalysisPrompt,
  buildSectionAnalysisSystemPrompt,
  buildCrossReferencePrompt,
  buildScoringPrompt,
  buildScoringSystemPrompt,
  buildQuestionMappingPrompt,
  createSkippedSectionAnalysis,
  splitLargeSection,
  mergeSectionAnalyses,
  MIN_SECTION_WORDS,
  MAX_BID_WORDS,
  MAX_SECTION_WORDS,
  type Criterion,
  type WordCountContext,
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
    onFailure: async ({ event }) => {
      const { reviewId } = event.data.event.data;
      if (reviewId) {
        await markFailed(
          reviewId,
          "The review pipeline encountered an unexpected error. Please try again."
        );
      }
    },
  },
  { event: "review/submitted" },
  async ({ event, step }) => {
    const { reviewId, userId, completeDraft = true } = event.data;

    // -----------------------------------------------------------------------
    // Load review metadata (join through criteria_sets / questions_sets)
    // -----------------------------------------------------------------------
    const reviewData = await step.run("load-review", async () => {
      const supabase = createServiceClient();
      const { data, error } = await supabase
        .from("reviews")
        .select(
          "bid_file_name, bid_file_path, model_tier, criteria_set_id, questions_set_id, criteria_json, questions_json"
        )
        .eq("id", reviewId)
        .single();

      if (error || !data) throw new NonRetriableError(`Review not found: ${reviewId}`);

      // Load criteria from set table (new path) or fall back to inline JSONB (legacy)
      let criteriaFromSet: Criterion[] | null = null;
      if (data.criteria_set_id) {
        const { data: cs } = await supabase
          .from("criteria_sets")
          .select("criteria_json")
          .eq("id", data.criteria_set_id)
          .single();
        if (cs?.criteria_json) {
          criteriaFromSet = cs.criteria_json as unknown as Criterion[];
        }
      }

      // Load questions from set table (new path) or fall back to inline JSONB (legacy)
      let questionsFromSet: QuestionsSet | null = null;
      if (data.questions_set_id) {
        const { data: qs } = await supabase
          .from("questions_sets")
          .select("questions_json, overall_word_limit")
          .eq("id", data.questions_set_id)
          .single();
        if (qs?.questions_json) {
          questionsFromSet = {
            questions: qs.questions_json as unknown as QuestionsSet["questions"],
            overall_word_limit: qs.overall_word_limit ?? undefined,
          };
        }
      }

      return {
        bid_file_name: data.bid_file_name,
        bid_file_path: data.bid_file_path,
        model_tier: data.model_tier,
        // New path: criteria from set; legacy fallback: inline JSONB
        criteria: criteriaFromSet ?? (data.criteria_json as { criteria: Criterion[] })?.criteria ?? [],
        // New path: questions from set; legacy fallback: inline JSONB
        questionsSet: questionsFromSet ?? (data.questions_json as QuestionsSet | null),
      };
    });

    const model = MODEL_MAP[reviewData.model_tier] ?? MODEL_MAP.sonnet;
    const criteria = reviewData.criteria;
    const questionsSet = reviewData.questionsSet;

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
        throw new NonRetriableError(`Failed to download bid: ${downloadError?.message}`);
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
    // Word count gate — reject bids exceeding the limit
    // -----------------------------------------------------------------------
    if (parsedBid.metadata.total_words > MAX_BID_WORDS) {
      await step.run("reject-too-large", async () => {
        await markFailed(
          reviewId,
          `This bid is approximately ${parsedBid.metadata.total_words.toLocaleString()} words, which exceeds our ${MAX_BID_WORDS.toLocaleString()} word limit. Please submit a shorter document or split it into parts.`
        );
      });
      return { reviewId, status: "failed", reason: "Bid too large" };
    }

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
    // Step 2.5: Question matching (when questions provided)
    // -----------------------------------------------------------------------
    let wordCountContext: WordCountContext | undefined;

    if (questionsSet?.questions?.length) {
      const matchResult = await step.run("question-matching", async () => {
        const result = matchQuestionsToSections(parsedBid, questionsSet.questions);

        // AI fallback for low-confidence matching
        if (result.match_confidence === "low") {
          const mappingPrompt = buildQuestionMappingPrompt(
            parsedBid.sections.map((s) => ({ id: s.id, title: s.title })),
            questionsSet.questions.map((q) => ({ id: q.id, question: q.question }))
          );
          const mapping = await callClaude({
            prompt: mappingPrompt,
            schema: QuestionMappingSchema,
            model: MODEL_MAP.haiku,
            maxTokens: 1024,
          });

          // Clear sequential fallback assignments so AI can fully replace them
          for (const section of result.sections) {
            section.question_id = undefined;
            section.word_count_min = undefined;
            section.word_count_max = undefined;
          }

          // Apply AI mappings to sections
          for (const m of mapping.mappings) {
            const section = result.sections.find((s) => s.id === m.section_id);
            const question = questionsSet.questions.find((q) => q.id === m.question_id);
            if (section && question) {
              section.question_id = question.id;
              section.word_count_min = question.word_count_min;
              section.word_count_max = question.word_count_max;
            }
          }
        }

        await updateProgress(reviewId, "parsing", {
          question_matching_completed: Date.now(),
          match_confidence: result.match_confidence,
        });

        return result;
      });

      // Replace sections with question-matched versions
      parsedBid.sections = matchResult.sections;

      // Compute word count context
      const matchedQuestionIds = new Set(
        parsedBid.sections.map((s) => s.question_id).filter(Boolean)
      );
      const unmatchedWithLimits = questionsSet.questions
        .filter((q) => !matchedQuestionIds.has(q.id) && (q.word_count_max || q.word_count_min))
        .map((q) => ({
          question_id: q.id,
          question_text: q.question,
          word_count_min: q.word_count_min,
          word_count_max: q.word_count_max,
        }));

      wordCountContext = {
        overall_word_limit: questionsSet.overall_word_limit,
        overall_word_count: parsedBid.metadata.total_words,
        sections: parsedBid.sections.map((s) => {
          const question = questionsSet.questions.find((q) => q.id === s.question_id);
          return {
            section_id: s.id,
            question_id: s.question_id,
            question_text: question?.question,
            word_count: s.word_count,
            word_count_min: s.word_count_min,
            word_count_max: s.word_count_max,
            utilization: s.word_count_max ? s.word_count / s.word_count_max : 0,
          };
        }),
        unmatched_questions_with_limits: unmatchedWithLimits.length > 0 ? unmatchedWithLimits : undefined,
      };
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

      // Dynamic max_tokens based on section size
      const sectionMaxTokens = section.word_count > 5000 ? 32768
        : section.word_count > 2000 ? 16384
        : 8192;

      // Large sections get split into chunks
      if (section.word_count > MAX_SECTION_WORDS) {
        const subSections = splitLargeSection(section, parsedBid.paragraphs);
        const partAnalyses: SectionAnalysis[] = [];

        for (const sub of subSections) {
          const subSection: typeof section = {
            ...section,
            paragraph_ids: sub.paragraphIds,
            word_count: sub.wordCount,
          };
          const chunkMaxTokens = sub.wordCount > 5000 ? 32768
            : sub.wordCount > 2000 ? 16384
            : 8192;

          const partResult = await step.run(
            `section-analysis-${section.id}-part-${sub.partIndex}`,
            async () => {
              await updateProgress(reviewId, "analysing", {
                analysis_started: Date.now(),
              });

              const prompt = buildSectionAnalysisPrompt(parsedBid, subSection, completeDraft, wordCountContext);
              const result = await callClaude({
                prompt,
                systemPrompt: sectionSystemPrompt,
                schema: SectionAnalysisSchema,
                model,
                maxTokens: chunkMaxTokens,
                allowPartial: true,
              });

              return result;
            }
          );

          if (partResult) {
            partAnalyses.push(partResult);
          } else {
            // Truncated — add placeholder
            partAnalyses.push({
              section_id: section.id,
              inline_comments: [],
              criteria_relevance: [],
              strengths: ["[Analysis truncated — section chunk too large for full review]"],
              weaknesses: [],
              questions_for_later_sections: [],
            });
          }
        }

        const merged = mergeSectionAnalyses(section.id, partAnalyses);

        await step.run(`section-analysis-${section.id}-progress`, async () => {
          await updateProgress(reviewId, "analysing", {
            [`section_${section.id}_completed`]: Date.now(),
            sections_completed: sectionAnalyses.length + 1,
            sections_total: parsedBid.sections.length,
          });
        });

        sectionAnalyses.push(merged);
      } else {
        // Normal-sized section — single call
        const analysis = await step.run(
          `section-analysis-${section.id}`,
          async () => {
            await updateProgress(reviewId, "analysing", {
              analysis_started: Date.now(),
            });

            const prompt = buildSectionAnalysisPrompt(parsedBid, section, completeDraft, wordCountContext);
            const result = await callClaude({
              prompt,
              systemPrompt: sectionSystemPrompt,
              schema: SectionAnalysisSchema,
              model,
              maxTokens: sectionMaxTokens,
              allowPartial: true,
            });

            await updateProgress(reviewId, "analysing", {
              [`section_${section.id}_completed`]: Date.now(),
              sections_completed: sectionAnalyses.length + 1,
              sections_total: parsedBid.sections.length,
            });

            return result;
          }
        );

        if (analysis) {
          sectionAnalyses.push(analysis);
        } else {
          // Truncated — add placeholder
          sectionAnalyses.push({
            section_id: section.id,
            inline_comments: [],
            criteria_relevance: [],
            strengths: ["[Analysis truncated — section too large for full review]"],
            weaknesses: [],
            questions_for_later_sections: [],
          });
        }
      }
    }

    // -----------------------------------------------------------------------
    // Step 4: Cross-reference
    // -----------------------------------------------------------------------
    await step.run("cross-reference-progress", async () => {
      await updateProgress(reviewId, "cross_referencing", { crossref_started: Date.now() });
    });

    const crossReference: CrossReference = await step.run("cross-reference", async () => {

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
    await step.run("scoring-progress", async () => {
      await updateProgress(reviewId, "scoring", { scoring_started: Date.now() });
    });

    const scoring: Scoring = await step.run("scoring", async () => {

      const prompt = buildScoringPrompt(parsedBid, sectionAnalyses, crossReference, criteria, completeDraft, wordCountContext);
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
    await step.run("generate-doc-progress", async () => {
      await updateProgress(reviewId, "generating", { generation_started: Date.now() });
    });

    const outputPath = await step.run("generate-doc", async () => {

      const bidName = reviewData.bid_file_name.replace(/\.docx$/i, "");
      const docBuffer = await generateReviewDoc(parsedBid, sectionAnalyses, scoring, bidName, wordCountContext);

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

      // Save results
      const { error: resultsError } = await supabase
        .from("review_results")
        .update({
          results: {
            section_analyses: sectionAnalyses,
            cross_reference: crossReference,
            scoring,
          },
        })
        .eq("review_id", reviewId);

      if (resultsError) {
        console.error("Failed to save review results:", resultsError);
      }

      return filePath;
    });

    // Mark completed in a separate step so it always runs even if generate-doc
    // retried after a partial failure (upload succeeded but DB update didn't)
    await step.run("mark-completed", async () => {
      const supabase = createServiceClient();
      const { error: statusError } = await supabase
        .from("reviews")
        .update({ status: "completed", output_file_path: outputPath })
        .eq("id", reviewId);

      if (statusError) {
        throw new Error(`Failed to mark review as completed: ${statusError.message}`);
      }

      await updateProgress(reviewId, "completed", { generation_completed: Date.now() });
    });

    return { reviewId, status: "completed", outputPath };
  }
);
