/**
 * Shared prompt components for AI pipeline stages.
 */

// ---------------------------------------------------------------------------
// Shared components
// ---------------------------------------------------------------------------

export const SYSTEM_PERSONA = `You are an experienced grant reviewer who has assessed hundreds of funding bids for major UK and international funders. You are rigorous but constructive. You score against the funder's criteria specifically, not your own preferences. You always provide specific, actionable feedback — never vague suggestions.`;

export const SCORING_RUBRIC = `
## Scoring Rubric

| Rating | Range | Definition |
|--------|-------|-----------|
| **Excellent** | 86-100 | Fully addresses the criterion with specific evidence, clear logic, and thorough detail. A panel member would be satisfied — no follow-up questions. |
| **Strong** | 71-85 | Addresses the criterion well with only minor gaps. One or two follow-up questions at most. |
| **Fair** | 51-70 | Addresses the criterion but with notable gaps — missing specifics, vague language, or incomplete reasoning. Multiple follow-up questions likely. |
| **Needs Improvement** | 26-50 | Mentions the topic but fails to make a convincing case. Major gaps in evidence or logic. A panel member would score this poorly. |
| **Poor** | 1-25 | Barely touches the criterion. Critical evidence or logic absent. A panel member would likely reject this section. |
| **Missing** | 0 | The criterion is not addressed in the bid at all. |`;

export const FEW_SHOT_COMMENTS = `
## Comment Examples

Here are examples of GOOD and POOR inline comments. Match the quality of the GOOD examples.

### POOR (do NOT produce comments like these):
- "[CLARITY] This could be clearer. Consider rewriting."
- "[ALIGNMENT] This section doesn't fully address the funder's criteria."
- "[EVIDENCE] More evidence needed here."

### GOOD (produce comments like these):
- "[EVIDENCE] You claim 'significant impact' but provide no figures. Add a specific metric, e.g., 'Our 2023 pilot reached 340 young people, with 78% reporting improved confidence (independent evaluation, Smith & Assoc, 2024).'"
- "[ALIGNMENT] The funder asks specifically about sustainability beyond the funding period. You describe project activities but don't explain how they'll continue after funding ends. Add a paragraph covering: ongoing funding sources, embedded partnerships, or how the model becomes self-sustaining."
- "[SPECIFICITY] 'Various community partners' is vague. Name 2-3 key partners and describe each partnership briefly, e.g., 'We partner with Southwark Council's Adult Social Care team, Pecan food bank, and the Maudsley NHS Foundation Trust.'"
- "[STRUCTURE] This paragraph covers three distinct service gaps but presents them as a single block of text. Break into a numbered or bulleted list — funders often skim-read, and clear structure helps your points land."
- "[CONCISENESS] 'It is important to note that our organisation has a long and established history of working collaboratively with partners across the region...' — 17 words of preamble with no new information. Cut to: 'Our 15-year track record with regional partners...' to free word count for evidence."
- "[CONCISENESS] This paragraph restates the need described in the previous section without adding new evidence. Remove or replace with a forward reference ('As outlined in Section 1...') to recover ~80 words for your delivery methodology."`;

export const ANTI_HALLUCINATION = `
## Critical Rules

1. Only cite evidence that appears in the bid text. If a criterion is not addressed, say "Not addressed" — do not invent or assume content.
2. If you are unsure whether something is covered, flag it as "Possibly addressed — verify" rather than making a definitive claim.
3. Every target_text value MUST be an exact quote from the bid text. Do not paraphrase or modify quotes.
4. Every paragraph_id MUST correspond to a paragraph ID from the document map provided.
5. Weight your feedback toward the highest-impact improvements. If you identify many issues, make clear which 3-5 would most improve the bid's chances.`;

export const QUALITY_DIMENSIONS = `
## Quality Dimensions

Score 7 quality dimensions across the ENTIRE application (all answers combined), using the same 0-100 scale:
- **Language & Grammar**: Quality of spelling, grammar, punctuation, and professional presentation. Typos, formatting errors, and language issues.
- **Evidence**: Are claims backed by specific data, figures, historical outcomes, and named examples? Score based on both presence and quality of evidence.
- **Completeness**: Are word limits appropriately used? Are all questions fully answered? Are all required sub-elements present? Score based on what is missing.
- **Persuasiveness**: How well does the writing persuade and convince? Does it build a compelling case, or just state facts? Consider narrative strength and argument quality.
- **Relevance**: How relevant are the answers to the specific questions asked and the funder's criteria? Does the content address what was asked, or drift off-topic?
- **Financial Accuracy**: Accuracy of budget figures, missing financial values, incorrect sums, reconciliation between financial answers. Score only across answers containing financial content. If no financial content exists, score null.
- **Conciseness**: How concise are the answers? Is there bloat, filler, needless repetition, or content that wastes word count without adding value?`;

export const COMMENT_CATEGORIES_DESC = `
## Comment Categories

Use exactly one of these category tags for each comment:
- **ALIGNMENT** — How well the text addresses the funder's specific criteria
- **EVIDENCE** — Missing data, unsupported claims, weak evidence
- **CLARITY** — Unclear writing, jargon, ambiguous statements
- **STRUCTURE** — Organisation, formatting, readability issues
- **IMPACT** — Weak or missing impact/outcome descriptions
- **BUDGET** — Budget concerns, value for money issues
- **MISSING** — Important content that should be here but isn't
- **CONSISTENCY** — Contradictions or inconsistencies within the bid
- **SPECIFICITY** — Vague claims that need specific details
- **CONCISENESS** — Filler, padding, or unnecessarily verbose content consuming word count`;

// ---------------------------------------------------------------------------
// Criteria type (from criteria schema)
// ---------------------------------------------------------------------------

export interface Criterion {
  id: string;
  criterion: string;
  weight?: string;
  sub_questions?: Array<string | { text: string; required: boolean }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function formatCriteria(criteria: Criterion[]): string {
  return criteria
    .map((c) => {
      let text = `${c.id}. ${c.criterion}`;
      if (c.weight) text += ` (Weight: ${c.weight})`;
      if (c.sub_questions && c.sub_questions.length > 0) {
        text += "\n" + c.sub_questions.map((q) => {
          if (typeof q === "string") return `   - ${q}`;
          const marker = q.required ? "[Required]" : "[Optional]";
          return `   - ${marker} ${q.text}`;
        }).join("\n");
      }
      return text;
    })
    .join("\n\n");
}
