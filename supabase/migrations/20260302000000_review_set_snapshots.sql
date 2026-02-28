-- Add questions_set_id and criteria_set_id to application_reviews
-- so historical reviews always reference the correct sets, even after
-- the application's set is swapped.
ALTER TABLE public.application_reviews
  ADD COLUMN IF NOT EXISTS questions_set_id uuid REFERENCES public.questions_sets(id),
  ADD COLUMN IF NOT EXISTS criteria_set_id  uuid REFERENCES public.criteria_sets(id);
