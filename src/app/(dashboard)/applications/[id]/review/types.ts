// ---------------------------------------------------------------------------
// Shared types for the review page
// ---------------------------------------------------------------------------

export interface AnswerInlineComment {
  target_text: string;
  category: string;
  issue: string;
  suggestion: string;
}

export interface AnswerAnalysis {
  question_id: string;
  inline_comments: AnswerInlineComment[];
  criteria_relevance: Array<{
    criterion_id: string;
    relevance: string;
    notes?: string;
    confidence?: string;
  }>;
  strengths: string[];
  weaknesses: string[];
  answer_score: string;
  word_count_assessment?: {
    actual: number;
    limit?: number;
    status: string;
  };
}

export interface CriterionScore {
  criterion_id: string;
  criterion: string;
  score: string;
  bid_evidence: string[];
  gaps: string[];
  summary: string;
}

export interface AnswerScore {
  question_id: string;
  question_text: string;
  score: string;
  summary: string;
}

export interface CrossReferenceFinding {
  type: string;
  description: string;
  sections_involved: string[];
  criteria_involved?: string[];
  severity: string;
  suggestion?: string;
  confidence?: string;
}

export interface GapCriterion {
  criterion_id: string;
  criterion: string;
  related_disabled_question_ids: string[];
  related_disabled_question_texts: string[];
}

export interface CrossReference {
  findings: CrossReferenceFinding[];
  overall_coherence: string;
  summary: string;
  gap_criteria?: GapCriterion[];
}

export interface QualityDimension {
  dimension: string;
  score: number | null;
  summary: string;
}

export interface ImprovementAppendixItem {
  criterion_id: string;
  criterion: string;
  what_funder_wants: string;
  how_bid_addresses: string;
  whats_missing: string;
  example_language?: string;
  gap_type?: "quick_fix" | "structural_gap";
}

export interface ApplicationScoring {
  answer_scores: AnswerScore[];
  criteria_scores: CriterionScore[];
  overall_score: number;
  overall_descriptor: string;
  submission_readiness: string;
  top_strengths: string[];
  top_improvements: string[];
  improvement_appendix?: ImprovementAppendixItem[];
  quality_dimensions?: QualityDimension[];
}

export interface ReviewResults {
  answer_feedback: Record<string, AnswerAnalysis>;
  cross_reference: CrossReference;
  scoring: ApplicationScoring;
  projected_score?: number;
  gap_count?: number;
  total_criteria_count?: number;
  disabled_questions?: Array<{ question_id: string; question_text: string }>;
}

export interface ApplicationReviewClientProps {
  application: {
    id: string;
    title: string | null;
    status: string;
    review_count: number;
    fund_id: string;
  };
  fund: { id: string; name: string; organisation: { id: string; name: string } | null } | null;
  questions: Array<{ id: string; question: string; guidance?: string; word_count_max?: number }>;
  criteria: Array<{ id: string; criterion: string }>;
  answers: Array<{ question_id: string; answer_text: string; last_reviewed_text: string | null; is_disabled?: boolean | null }>;
  review: {
    id: string;
    review_number: number;
    status: string;
    progress: Record<string, unknown> | null;
    results: Record<string, unknown> | null;
    error_message: string | null;
    created_at: string;
  } | null;
  isHistorical?: boolean;
  defaultTab?: TabId;
}

export type TabId = "summary" | "answers" | "cross-ref";
