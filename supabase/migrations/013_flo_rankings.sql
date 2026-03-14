-- ============================================================
-- 5 on 2 Fantasy Wrestling — FlowWrestling Rankings
-- Adds flo_ranking column to athletes table and
-- flowrestling_url / flo_last_scraped_at to scrape_settings.
-- Run this in your Supabase SQL Editor.
-- ============================================================

-- ── Add flo_ranking to athletes ───────────────────────────────────────────────
ALTER TABLE public.athletes
  ADD COLUMN IF NOT EXISTS flo_ranking INTEGER;  -- per-weight-class rank on FlowWrestling (NULL = not ranked / not yet scraped)

COMMENT ON COLUMN public.athletes.flo_ranking IS
  'FlowWrestling per-weight-class ranking (1 = #1 in their weight). NULL if not ranked or not yet scraped.';

-- ── Extend scrape_settings with FlowWrestling fields ─────────────────────────
ALTER TABLE public.scrape_settings
  ADD COLUMN IF NOT EXISTS flowrestling_url          TEXT,        -- base rankings collection URL
  ADD COLUMN IF NOT EXISTS flo_auto_scrape_enabled   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS flo_last_scraped_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS flo_last_scrape_status    TEXT NOT NULL DEFAULT 'idle'
    CHECK (flo_last_scrape_status IN ('idle','ok','error')),
  ADD COLUMN IF NOT EXISTS flo_last_scrape_message   TEXT;

COMMENT ON COLUMN public.scrape_settings.flowrestling_url IS
  'FlowWrestling rankings collection URL (e.g. https://www.flowrestling.org/rankings/14300895-2025-26-ncaa-di-wrestling-rankings)';
