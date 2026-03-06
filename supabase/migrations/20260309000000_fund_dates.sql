-- Add optional submission date window to funds
ALTER TABLE public.funds
  ADD COLUMN opens_at timestamptz,
  ADD COLUMN closes_at timestamptz;
