-- ============================================================
-- Funds, Criteria Sets, Questions Sets
-- Extract criteria & questions into fund-linked, versioned tables
-- ============================================================

-- ---------- is_admin on profiles ----------
ALTER TABLE public.profiles ADD COLUMN is_admin boolean NOT NULL DEFAULT false;

-- ---------- funds ----------
CREATE TABLE public.funds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  funder_organisation text,
  url text,
  notes text,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.funds
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ---------- criteria_sets ----------
CREATE TABLE public.criteria_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id uuid NOT NULL REFERENCES public.funds(id) ON DELETE CASCADE,
  label text,
  name text NOT NULL,
  description text,
  criteria_json jsonb NOT NULL,
  approved boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- questions_sets ----------
CREATE TABLE public.questions_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id uuid NOT NULL REFERENCES public.funds(id) ON DELETE CASCADE,
  label text,
  questions_json jsonb NOT NULL,
  overall_word_limit integer,
  approved boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- reviews: add FK columns ----------
ALTER TABLE public.reviews
  ADD COLUMN fund_id uuid REFERENCES public.funds(id) ON DELETE SET NULL,
  ADD COLUMN criteria_set_id uuid REFERENCES public.criteria_sets(id) ON DELETE SET NULL,
  ADD COLUMN questions_set_id uuid REFERENCES public.questions_sets(id) ON DELETE SET NULL;

-- ============================================================
-- Indexes
-- ============================================================

-- Full-text search on funds
CREATE INDEX idx_funds_name_fts ON public.funds
  USING GIN (to_tsvector('english', name));
CREATE INDEX idx_funds_org_fts ON public.funds
  USING GIN (to_tsvector('english', coalesce(funder_organisation, '')));

-- B-tree for set lookups by fund
CREATE INDEX idx_criteria_sets_fund_id ON public.criteria_sets(fund_id);
CREATE INDEX idx_questions_sets_fund_id ON public.questions_sets(fund_id);

-- Reviews by fund
CREATE INDEX idx_reviews_fund_id ON public.reviews(fund_id);

-- ============================================================
-- Row Level Security
-- ============================================================

-- funds: public read, authenticated insert, creator can update
ALTER TABLE public.funds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view funds"
  ON public.funds FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can create funds"
  ON public.funds FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Creator can update own funds"
  ON public.funds FOR UPDATE
  USING (auth.uid() = created_by);

-- criteria_sets: public read, authenticated insert, admin can update approved
ALTER TABLE public.criteria_sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view criteria sets"
  ON public.criteria_sets FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can create criteria sets"
  ON public.criteria_sets FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Admin can update criteria sets"
  ON public.criteria_sets FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  );

-- questions_sets: public read, authenticated insert, admin can update approved
ALTER TABLE public.questions_sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view questions sets"
  ON public.questions_sets FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can create questions sets"
  ON public.questions_sets FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Admin can update questions sets"
  ON public.questions_sets FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  );
