-- Review feedback: thumbs up/down per feedback item
CREATE TABLE review_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id UUID NOT NULL REFERENCES application_reviews(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_path TEXT NOT NULL CHECK (length(item_path) <= 500),
  item_type TEXT NOT NULL CHECK (item_type IN ('inline_comment', 'criteria_score', 'strength', 'weakness', 'cross_reference_summary', 'cross_reference_finding')),
  sentiment TEXT NOT NULL CHECK (sentiment IN ('up', 'down')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(review_id, user_id, item_path)
);

-- Indexes on FK columns for query performance
CREATE INDEX idx_review_feedback_review_user ON review_feedback(review_id, user_id);
CREATE INDEX idx_review_feedback_user_id ON review_feedback(user_id);

-- Auto-update updated_at on row changes
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON review_feedback
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- RLS: users can only manage feedback on reviews belonging to their own applications
ALTER TABLE review_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own feedback"
  ON review_feedback FOR SELECT USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM application_reviews ar
      JOIN applications a ON a.id = ar.application_id
      WHERE ar.id = review_feedback.review_id
        AND a.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own feedback"
  ON review_feedback FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM application_reviews ar
      JOIN applications a ON a.id = ar.application_id
      WHERE ar.id = review_feedback.review_id
        AND a.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own feedback"
  ON review_feedback FOR UPDATE USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM application_reviews ar
      JOIN applications a ON a.id = ar.application_id
      WHERE ar.id = review_feedback.review_id
        AND a.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own feedback"
  ON review_feedback FOR DELETE USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM application_reviews ar
      JOIN applications a ON a.id = ar.application_id
      WHERE ar.id = review_feedback.review_id
        AND a.user_id = auth.uid()
    )
  );
