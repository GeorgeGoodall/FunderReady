-- Add rejected + rejection_reason to all four tables
ALTER TABLE public.organisations
  ADD COLUMN IF NOT EXISTS rejected boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

ALTER TABLE public.funds
  ADD COLUMN IF NOT EXISTS rejected boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

ALTER TABLE public.criteria_sets
  ADD COLUMN IF NOT EXISTS rejected boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

ALTER TABLE public.questions_sets
  ADD COLUMN IF NOT EXISTS rejected boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

-- Enforce organisation_id NOT NULL on funds (orphans already assigned)
ALTER TABLE public.funds ALTER COLUMN organisation_id SET NOT NULL;

-- Add admin DELETE policies
CREATE POLICY "Admin can delete funds"
  ON public.funds FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );

CREATE POLICY "Admin can delete criteria sets"
  ON public.criteria_sets FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );

CREATE POLICY "Admin can delete questions sets"
  ON public.questions_sets FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- Add admin UPDATE + DELETE policies for organisations
CREATE POLICY "Admin can update organisations"
  ON public.organisations FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );

CREATE POLICY "Admin can delete organisations"
  ON public.organisations FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- Update organisations SELECT to exclude rejected
DROP POLICY IF EXISTS "organisations_select" ON public.organisations;
CREATE POLICY "organisations_select"
  ON public.organisations FOR SELECT TO authenticated
  USING (
    rejected = false
    AND (approved = true OR created_by = auth.uid())
  );

-- Update funds SELECT to exclude rejected
DROP POLICY IF EXISTS "Visible funds readable by authenticated users" ON public.funds;
CREATE POLICY "Visible funds readable by authenticated users"
  ON public.funds FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND rejected = false
    AND (published = true OR created_by = auth.uid())
  );
