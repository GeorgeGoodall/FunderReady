-- Add application_format to funds
ALTER TABLE public.funds
  ADD COLUMN application_format text NOT NULL DEFAULT 'question_form',
  ADD CONSTRAINT funds_application_format_check
    CHECK (application_format IN ('question_form', 'structured_doc', 'unstructured_doc'));

-- Make applications.questions_set_id nullable (unstructured_doc funds have no questions set)
ALTER TABLE public.applications
  ALTER COLUMN questions_set_id DROP NOT NULL;
