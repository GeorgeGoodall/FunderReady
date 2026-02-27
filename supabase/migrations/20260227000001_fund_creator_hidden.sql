-- Add creator_hidden flag to funds table.
-- When true, the fund is hidden from the creator's "My Funds" list but remains
-- in the database and visible to other authenticated users if published.
ALTER TABLE public.funds
  ADD COLUMN creator_hidden boolean NOT NULL DEFAULT false;
