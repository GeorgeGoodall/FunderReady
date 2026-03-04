-- Atomic submit-for-review RPC function.
-- Performs usage check-and-increment, review creation, and application status update
-- in a single transaction to prevent race conditions.

CREATE OR REPLACE FUNCTION submit_review(
  p_application_id UUID,
  p_user_id UUID,
  p_review_number INT,
  p_questions_set_id UUID,
  p_criteria_set_id UUID,
  p_period TEXT,
  p_default_limit INT DEFAULT 10
)
RETURNS TABLE (
  review_id UUID,
  review_number INT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_review_id UUID;
  v_rows_updated INT;
BEGIN
  -- Step 1: Ensure usage row exists for this period
  INSERT INTO usage (user_id, period, reviews_used, reviews_limit, bonus_reviews)
  VALUES (p_user_id, p_period, 0, p_default_limit, 0)
  ON CONFLICT (user_id, period) DO NOTHING;

  -- Step 2: Atomic check-and-increment usage
  UPDATE usage
  SET reviews_used = reviews_used + 1
  WHERE user_id = p_user_id
    AND period = p_period
    AND reviews_used < reviews_limit + COALESCE(bonus_reviews, 0);

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  IF v_rows_updated = 0 THEN
    RAISE EXCEPTION 'USAGE_LIMIT_EXCEEDED';
  END IF;

  -- Step 3: Create application_reviews row
  INSERT INTO application_reviews (
    application_id,
    review_number,
    status,
    progress,
    questions_set_id,
    criteria_set_id
  ) VALUES (
    p_application_id,
    p_review_number,
    'pending',
    '{}'::jsonb,
    p_questions_set_id,
    p_criteria_set_id
  )
  RETURNING id INTO v_review_id;

  -- Step 4: Update application status and review count
  UPDATE applications
  SET status = 'submitted_for_review',
      review_count = p_review_number
  WHERE id = p_application_id;

  -- Return result
  RETURN QUERY SELECT v_review_id, p_review_number;
END;
$$;
