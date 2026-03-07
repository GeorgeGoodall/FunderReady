-- Fix critical bugs: rollback_usage restore, cancel_review RPC,
-- topup idempotency constraint, auto-approve race condition indexes.

-- ============================================================
-- Fix 1: Track credit split on application_reviews so
--         rollback_usage can correctly restore both buckets.
-- ============================================================

-- 1a. Add split-tracking columns to application_reviews.
ALTER TABLE public.application_reviews
  ADD COLUMN IF NOT EXISTS period_credits_charged SMALLINT NOT NULL DEFAULT 0;

ALTER TABLE public.application_reviews
  ADD COLUMN IF NOT EXISTS purchased_credits_charged SMALLINT NOT NULL DEFAULT 0;

-- 1b. Replace deduct_credits to populate the two new columns.
--     Logic is unchanged from the original except:
--       - period_credits_charged and purchased_credits_charged are now
--         persisted on the review row (in addition to credits_charged).
CREATE OR REPLACE FUNCTION deduct_credits(
  p_user_id  UUID,
  p_review_id UUID,
  p_credits  INT,
  p_period   TEXT
)
RETURNS TABLE(period_deducted INT, purchased_deducted INT) AS $$
DECLARE
  v_period_available INT;
  v_purchased        INT;
  v_actual_credits   INT;
  v_from_period      INT;
  v_from_purchased   INT;
BEGIN
  -- Lock usage row and compute available period credits
  SELECT GREATEST(0, credits_limit - credits_used + bonus_reviews)
  INTO v_period_available
  FROM public.usage
  WHERE user_id = p_user_id AND period = p_period
  FOR UPDATE;

  -- Lock profiles row and read purchased balance
  SELECT purchased_credits
  INTO v_purchased
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  -- Clamp to what is actually available (never deduct more than owned)
  v_actual_credits  := LEAST(p_credits,
                             COALESCE(v_period_available, 0) +
                             COALESCE(v_purchased, 0));

  -- Split: use period allowance first, then purchased credits
  v_from_period     := LEAST(v_actual_credits, COALESCE(v_period_available, 0));
  v_from_purchased  := v_actual_credits - v_from_period;

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

  -- Store all three figures on the review row so rollback_usage can invert
  UPDATE public.application_reviews
  SET credits_charged           = v_actual_credits,
      period_credits_charged    = v_from_period,
      purchased_credits_charged = v_from_purchased
  WHERE id = p_review_id;

  RETURN QUERY SELECT v_from_period, v_from_purchased;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 1c. Replace rollback_usage — now actually restores credits.
--     Finds the most-recent failed review for this user that still has
--     credits recorded, restores the split amounts to the correct buckets,
--     then zeros all three charged columns so a second call is a no-op.
CREATE OR REPLACE FUNCTION rollback_usage(p_user_id UUID)
RETURNS void AS $$
DECLARE
  v_review RECORD;
  v_period TEXT;
BEGIN
  -- Find the most-recent failed review that has not yet been refunded
  SELECT ar.id,
         ar.credits_charged,
         ar.period_credits_charged,
         ar.purchased_credits_charged
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

  -- Determine which billing period this review was submitted in so we
  -- can credit back to the correct usage row.  The review's created_at
  -- is used to derive the period string (YYYY-MM format).
  SELECT to_char(ar.created_at AT TIME ZONE 'UTC', 'YYYY-MM')
  INTO v_period
  FROM public.application_reviews ar
  WHERE ar.id = v_review.id;

  -- Restore period credits: decrement credits_used on the usage row.
  IF v_review.period_credits_charged > 0 THEN
    UPDATE public.usage
    SET credits_used = GREATEST(0, credits_used - v_review.period_credits_charged)
    WHERE user_id = p_user_id AND period = v_period;
  END IF;

  -- Restore purchased credits: add back to profiles balance.
  IF v_review.purchased_credits_charged > 0 THEN
    UPDATE public.profiles
    SET purchased_credits = purchased_credits + v_review.purchased_credits_charged
    WHERE id = p_user_id;
  END IF;

  -- Zero out all three charged columns so this row is not refunded twice.
  UPDATE public.application_reviews
  SET credits_charged           = 0,
      period_credits_charged    = 0,
      purchased_credits_charged = 0
  WHERE id = v_review.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Fix 2: cancel_review — atomic cancel while still queued.
-- ============================================================

CREATE OR REPLACE FUNCTION cancel_review(
  p_application_id UUID,
  p_user_id        UUID
)
RETURNS text  -- 'ok' | 'not_queued' | 'not_found'
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status
  FROM public.applications
  WHERE id = p_application_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;

  IF v_status <> 'submitted_for_review' THEN
    RETURN 'not_queued';
  END IF;

  -- Fail any pending review rows for this application
  UPDATE public.application_reviews
  SET status        = 'failed',
      error_message = 'Cancelled by user'
  WHERE application_id = p_application_id
    AND status = 'pending';

  -- Return application to draft so the user can resubmit
  UPDATE public.applications
  SET status = 'draft'
  WHERE id = p_application_id;

  RETURN 'ok';
END;
$$;

GRANT EXECUTE ON FUNCTION cancel_review(UUID, UUID) TO authenticated;

-- ============================================================
-- Fix 3: Topup idempotency — unique constraint on
--         credit_purchases.stripe_payment_intent_id
-- ============================================================

-- stripe_payment_intent_id already exists on the table from the
-- credit_based_billing migration (column was declared nullable).
-- ADD COLUMN IF NOT EXISTS is harmless if it is already present.
ALTER TABLE public.credit_purchases
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;

-- Unique constraint prevents duplicate webhook deliveries from
-- crediting a user twice for the same Stripe payment.
ALTER TABLE public.credit_purchases
  ADD CONSTRAINT credit_purchases_payment_intent_unique
  UNIQUE (stripe_payment_intent_id);

-- ============================================================
-- Fix 4: Auto-approve race condition — one approved set per fund
-- ============================================================

-- Prevent two concurrent admin approvals from both setting
-- approved = true for the same fund on criteria_sets.
CREATE UNIQUE INDEX IF NOT EXISTS criteria_sets_one_approved_per_fund
  ON public.criteria_sets (fund_id)
  WHERE approved = true;

-- Same guard for questions_sets.
CREATE UNIQUE INDEX IF NOT EXISTS questions_sets_one_approved_per_fund
  ON public.questions_sets (fund_id)
  WHERE approved = true;
