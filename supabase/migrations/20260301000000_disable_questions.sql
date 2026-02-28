ALTER TABLE public.application_answers
  ADD COLUMN IF NOT EXISTS is_disabled boolean NOT NULL DEFAULT false;
