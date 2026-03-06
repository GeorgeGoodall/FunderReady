-- Credit-based billing migration
-- Replaces simple review counting with a credit system:
--   - Adds 'basic' subscription tier
--   - Renames usage columns from reviews to credits
--   - Adds purchased_credits to profiles
--   - Adds credits_charged to application_reviews
--   - Creates credit_purchases table
--   - Replaces submit_review, rollback_usage RPCs
--   - Adds deduct_credits and increment_purchased_credits RPCs

-- 1. Add 'basic' to subscription_tier CHECK constraint on profiles
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_subscription_tier_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_subscription_tier_check
  CHECK (subscription_tier IN ('free', 'basic', 'pro'));

-- 2. Add purchased_credits to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS purchased_credits integer NOT NULL DEFAULT 0;

-- 3. Rename usage columns: reviews → credits
ALTER TABLE public.usage
  RENAME COLUMN reviews_used TO credits_used;
ALTER TABLE public.usage
  RENAME COLUMN reviews_limit TO credits_limit;

-- 4. Add credits_charged to application_reviews
ALTER TABLE public.application_reviews
  ADD COLUMN IF NOT EXISTS credits_charged integer NOT NULL DEFAULT 0;

-- 5. Create credit_purchases table
CREATE TABLE IF NOT EXISTS public.credit_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  credits integer NOT NULL,
  amount_pence integer NOT NULL,
  pack_type text NOT NULL CHECK (pack_type IN ('standard', 'pro')),
  stripe_payment_intent_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.credit_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own credit purchases"
  ON public.credit_purchases FOR SELECT
  USING (auth.uid() = user_id);

-- 6. Replace submit_review RPC — credit-aware version
CREATE OR REPLACE FUNCTION submit_review(
  p_application_id UUID,
  p_user_id UUID,
  p_review_number INT,
  p_questions_set_id UUID,
  p_criteria_set_id UUID,
  p_period TEXT,
  p_default_limit INT DEFAULT 0,
  p_estimated_credits_low INT DEFAULT 0
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
    application_id, review_number, status, questions_set_id, criteria_set_id
  )
  VALUES (
    p_application_id, p_review_number, 'pending', p_questions_set_id, p_criteria_set_id
  )
  RETURNING id INTO v_review_id;

  UPDATE public.applications
  SET status = 'submitted_for_review',
      review_count = p_review_number
  WHERE id = p_application_id;

  RETURN QUERY SELECT v_review_id, p_review_number;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Create deduct_credits RPC
CREATE OR REPLACE FUNCTION deduct_credits(
  p_user_id UUID,
  p_review_id UUID,
  p_credits INT,
  p_period TEXT
)
RETURNS TABLE(period_deducted INT, purchased_deducted INT) AS $$
DECLARE
  v_period_available INT;
  v_purchased INT;
  v_actual_credits INT;
  v_from_period INT;
  v_from_purchased INT;
BEGIN
  SELECT GREATEST(0, credits_limit - credits_used + bonus_reviews)
  INTO v_period_available
  FROM public.usage
  WHERE user_id = p_user_id AND period = p_period
  FOR UPDATE;

  SELECT purchased_credits INTO v_purchased
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  v_actual_credits := LEAST(p_credits, COALESCE(v_period_available, 0) + COALESCE(v_purchased, 0));

  v_from_period := LEAST(v_actual_credits, COALESCE(v_period_available, 0));
  v_from_purchased := v_actual_credits - v_from_period;

  IF v_from_period > 0 THEN
    UPDATE public.usage
    SET credits_used = credits_used + v_from_period
    WHERE user_id = p_user_id AND period = p_period;
  END IF;

  IF v_from_purchased > 0 THEN
    UPDATE public.profiles
    SET purchased_credits = GREATEST(0, purchased_credits - v_from_purchased)
    WHERE id = p_user_id;
  END IF;

  UPDATE public.application_reviews
  SET credits_charged = v_actual_credits
  WHERE id = p_review_id;

  RETURN QUERY SELECT v_from_period, v_from_purchased;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Replace rollback_usage RPC
CREATE OR REPLACE FUNCTION rollback_usage(p_user_id UUID)
RETURNS void AS $$
DECLARE
  v_review RECORD;
BEGIN
  SELECT ar.id, ar.credits_charged, a.user_id
  INTO v_review
  FROM public.application_reviews ar
  JOIN public.applications a ON a.id = ar.application_id
  WHERE a.user_id = p_user_id
  AND ar.status = 'failed'
  AND ar.credits_charged > 0
  ORDER BY ar.created_at DESC
  LIMIT 1;

  IF v_review IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.application_reviews
  SET credits_charged = 0
  WHERE id = v_review.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Create increment_purchased_credits RPC
CREATE OR REPLACE FUNCTION increment_purchased_credits(
  p_user_id UUID,
  p_credits INT
)
RETURNS void AS $$
BEGIN
  UPDATE public.profiles
  SET purchased_credits = purchased_credits + p_credits
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
