-- ---------------------------------------------------------------------------
-- Fund sharing: rename published → approved, add shared column
-- ---------------------------------------------------------------------------

-- Rename published → approved
ALTER TABLE public.funds RENAME COLUMN published TO approved;

-- Add shared column (user opt-in to community sharing)
ALTER TABLE public.funds ADD COLUMN IF NOT EXISTS shared BOOLEAN NOT NULL DEFAULT false;

-- Backfill: any fund that was previously published (now approved=true) should also be shared
UPDATE public.funds SET shared = true WHERE approved = true;

-- Drop old RLS policy that references published
DROP POLICY IF EXISTS "Visible funds readable by authenticated users" ON public.funds;

-- New visibility policy: approved+shared funds visible to all authenticated users, otherwise only creator
CREATE POLICY "Visible funds readable by authenticated users"
  ON public.funds FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND rejected = false
    AND (
      (shared = true AND approved = true)
      OR created_by = auth.uid()
    )
  );
