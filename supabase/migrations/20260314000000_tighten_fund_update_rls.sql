-- ---------------------------------------------------------------------------
-- Tighten creator update RLS: prevent self-approval via browser client
-- The original policy (20260225000000_funds_and_sets.sql) had no WITH CHECK,
-- allowing creators to set approved=true directly from the browser client.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Creator can update own funds" ON public.funds;

CREATE POLICY "Creator can update own funds"
  ON public.funds FOR UPDATE
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by AND approved = false AND rejected = false);
