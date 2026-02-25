-- ============================================================
-- Applications: form-based application model
-- Tables: applications, application_answers, application_reviews
-- ============================================================

-- ---------- applications ----------
CREATE TABLE public.applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  fund_id uuid NOT NULL REFERENCES public.funds(id),
  criteria_set_id uuid NOT NULL REFERENCES public.criteria_sets(id),
  questions_set_id uuid NOT NULL REFERENCES public.questions_sets(id),
  title text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted_for_review', 'reviewing', 'reviewed')),
  review_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX idx_applications_user_id ON public.applications(user_id);
CREATE INDEX idx_applications_fund_id ON public.applications(fund_id);

-- ---------- application_answers ----------
CREATE TABLE public.application_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  question_id text NOT NULL,
  answer_text text NOT NULL DEFAULT '',
  field_type text NOT NULL DEFAULT 'text_long'
    CHECK (field_type IN ('text_short', 'text_long', 'dropdown', 'radio', 'checkbox')),
  selected_options jsonb,
  last_reviewed_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(application_id, question_id)
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.application_answers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX idx_application_answers_application_id ON public.application_answers(application_id);

-- ---------- application_reviews ----------
CREATE TABLE public.application_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  review_number integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'analysing', 'cross_referencing', 'scoring', 'completed', 'failed')),
  progress jsonb NOT NULL DEFAULT '{}',
  results jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(application_id, review_number)
);

CREATE INDEX idx_application_reviews_application_id ON public.application_reviews(application_id);

-- ============================================================
-- Row Level Security
-- ============================================================

-- applications: users CRUD own only
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own applications"
  ON public.applications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own applications"
  ON public.applications FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own applications"
  ON public.applications FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own applications"
  ON public.applications FOR DELETE
  USING (auth.uid() = user_id);

-- application_answers: access via application ownership
ALTER TABLE public.application_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own application answers"
  ON public.application_answers FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.applications
    WHERE applications.id = application_answers.application_id
      AND applications.user_id = auth.uid()
  ));

CREATE POLICY "Users can create own application answers"
  ON public.application_answers FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.applications
    WHERE applications.id = application_answers.application_id
      AND applications.user_id = auth.uid()
  ));

CREATE POLICY "Users can update own application answers"
  ON public.application_answers FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.applications
    WHERE applications.id = application_answers.application_id
      AND applications.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete own application answers"
  ON public.application_answers FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.applications
    WHERE applications.id = application_answers.application_id
      AND applications.user_id = auth.uid()
  ));

-- application_reviews: access via application ownership
ALTER TABLE public.application_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own application reviews"
  ON public.application_reviews FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.applications
    WHERE applications.id = application_reviews.application_id
      AND applications.user_id = auth.uid()
  ));

CREATE POLICY "Users can create own application reviews"
  ON public.application_reviews FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.applications
    WHERE applications.id = application_reviews.application_id
      AND applications.user_id = auth.uid()
  ));

CREATE POLICY "Users can update own application reviews"
  ON public.application_reviews FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.applications
    WHERE applications.id = application_reviews.application_id
      AND applications.user_id = auth.uid()
  ));
