-- Expand application_answers.field_type CHECK constraint to include all
-- field types supported by FormField: number, date, time, email, url, phone,
-- radio_other, checkbox_other (previously only text_short/long/dropdown/radio/checkbox).
ALTER TABLE application_answers
  DROP CONSTRAINT IF EXISTS application_answers_field_type_check;

ALTER TABLE application_answers
  ADD CONSTRAINT application_answers_field_type_check
  CHECK (field_type IN (
    'text_short', 'text_long',
    'number', 'date', 'time',
    'email', 'url', 'phone',
    'dropdown', 'radio', 'radio_other',
    'checkbox', 'checkbox_other'
  ));
