-- ============================================================
-- Organisations as first-class entities
-- ============================================================

-- 1. Create organisations table
CREATE TABLE public.organisations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  url text,
  description text,
  approved boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.organisations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 2. Indexes
-- Partial unique index: only one approved org per name (case-insensitive)
CREATE UNIQUE INDEX idx_organisations_name_approved
  ON public.organisations (lower(name)) WHERE approved = true;

-- FTS index for search
CREATE INDEX idx_organisations_name_fts
  ON public.organisations USING GIN (to_tsvector('english', name));

-- 3. RLS
ALTER TABLE public.organisations ENABLE ROW LEVEL SECURITY;

-- Authenticated users can see approved orgs or their own (approved or not)
CREATE POLICY "organisations_select"
  ON public.organisations FOR SELECT
  TO authenticated
  USING (approved = true OR created_by = auth.uid());

-- Authenticated users can insert their own orgs
CREATE POLICY "organisations_insert"
  ON public.organisations FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

-- Creators can update their own orgs (admin name-edit-after-approval enforced in API)
CREATE POLICY "organisations_update"
  ON public.organisations FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid());

-- ============================================================
-- 4. Migrate existing funder_organisation text data
-- ============================================================

-- Create one org per distinct funder_organisation (case-insensitive),
-- using created_by/created_at of the earliest fund with that org name. Auto-approved.
INSERT INTO public.organisations (name, approved, created_by, created_at)
SELECT funder_organisation, true, created_by, created_at
FROM (
  SELECT DISTINCT ON (lower(funder_organisation))
    funder_organisation, created_by, created_at
  FROM public.funds
  WHERE funder_organisation IS NOT NULL AND funder_organisation <> ''
  ORDER BY lower(funder_organisation), created_at ASC
) sub;

-- 5. Add FK column to funds
ALTER TABLE public.funds
  ADD COLUMN organisation_id uuid REFERENCES public.organisations(id) ON DELETE SET NULL;

-- 6. Map existing funds to their new org records
UPDATE public.funds f
SET organisation_id = o.id
FROM public.organisations o
WHERE lower(f.funder_organisation) = lower(o.name);

-- 7. Drop old text column and its FTS index
DROP INDEX IF EXISTS idx_funds_org_fts;
ALTER TABLE public.funds DROP COLUMN funder_organisation;

-- ============================================================
-- 8. Partial unique index on funds (published only, with org)
-- ============================================================
CREATE UNIQUE INDEX idx_funds_name_org_published
  ON public.funds (lower(name), organisation_id)
  WHERE published = true AND organisation_id IS NOT NULL;
