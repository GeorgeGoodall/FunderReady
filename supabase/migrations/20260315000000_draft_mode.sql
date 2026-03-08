-- Add is_draft to application_reviews
ALTER TABLE public.application_reviews
  ADD COLUMN IF NOT EXISTS is_draft boolean NOT NULL DEFAULT false;

-- Update submit_review RPC to accept and store p_is_draft
CREATE OR REPLACE FUNCTION submit_review(
  p_application_id UUID,
  p_user_id UUID,
  p_review_number INT,
  p_questions_set_id UUID,
  p_criteria_set_id UUID,
  p_period TEXT,
  p_default_limit INT DEFAULT 0,
  p_estimated_credits_low INT DEFAULT 0,
  p_is_draft BOOLEAN DEFAULT false
)
RETURNS TABLE(review_id UUID, review_number INT) AS $$
DECLARE
  v_review_id UUID;
  v_credits_used INT;
  v_credits_limit INT;
  v_bonus INT;
  v_purchased INT;
  v_available INT;
BEGIN
  INSERT INTO public.usage (user_id, period, credits_used, credits_limit, bonus_reviews)
  VALUES (p_user_id, p_period, 0, p_default_limit, 0)
  ON CONFLICT (user_id, period) DO NOTHING;

  SELECT u.credits_used, u.credits_limit, u.bonus_reviews
  INTO v_credits_used, v_credits_limit, v_bonus
  FROM public.usage u
  WHERE u.user_id = p_user_id AND u.period = p_period
  FOR UPDATE;

  SELECT purchased_credits INTO v_purchased
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  v_available := GREATEST(0, v_credits_limit - v_credits_used) + v_bonus + COALESCE(v_purchased, 0);

  IF v_available < p_estimated_credits_low THEN
    RAISE EXCEPTION 'INSUFFICIENT_CREDITS';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.application_reviews ar
    JOIN public.applications a ON a.id = ar.application_id
    WHERE a.user_id = p_user_id
    AND ar.status IN ('pending', 'analysing', 'cross_referencing', 'scoring')
  ) THEN
    RAISE EXCEPTION 'REVIEW_IN_PROGRESS';
  END IF;

  INSERT INTO public.application_reviews (
    application_id, review_number, status, questions_set_id, criteria_set_id, is_draft
  )
  VALUES (
    p_application_id, p_review_number, 'pending', p_questions_set_id, p_criteria_set_id, p_is_draft
  )
  RETURNING id INTO v_review_id;

  UPDATE public.applications
  SET status = 'submitted_for_review',
      review_count = p_review_number
  WHERE id = p_application_id;

  RETURN QUERY SELECT v_review_id, p_review_number;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
