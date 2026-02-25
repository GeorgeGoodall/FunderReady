-- ---------------------------------------------------------------------------
-- Fund visibility: add published flag
-- Published funds visible to all authenticated users
-- Unpublished funds visible only to creator
-- ---------------------------------------------------------------------------

-- Add published column (default false for new funds)
ALTER TABLE public.funds ADD COLUMN IF NOT EXISTS published BOOLEAN NOT NULL DEFAULT false;

-- Auto-publish funds that already exist (they were already visible to everyone)
UPDATE public.funds SET published = true WHERE published = false;

-- Drop existing SELECT policy and replace with visibility-aware one
DROP POLICY IF EXISTS "Anyone authenticated can view funds" ON public.funds;

CREATE POLICY "Visible funds readable by authenticated users"
  ON public.funds FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (published = true OR created_by = auth.uid())
  );

-- Admin can publish/unpublish any fund
CREATE POLICY "Admin can update any fund"
  ON public.funds FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );
