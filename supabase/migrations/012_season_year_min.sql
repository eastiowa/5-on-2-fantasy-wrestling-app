-- ============================================================
-- Relax the minimum year constraint on the seasons table.
-- Original: CHECK (year >= 2020)
-- Updated:  CHECK (year >= 2010)   — accommodates seasons back to 2010+
--           (first 5 on 2 season was 2017)
-- Run this in your Supabase SQL Editor.
-- ============================================================

-- The auto-generated constraint name is "seasons_year_check"
ALTER TABLE public.seasons
  DROP CONSTRAINT IF EXISTS seasons_year_check;

ALTER TABLE public.seasons
  ADD CONSTRAINT seasons_year_check CHECK (year >= 2010);
