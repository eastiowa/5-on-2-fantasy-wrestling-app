-- ============================================================
-- 5 on 2 Fantasy Wrestling League — Annual Seasons Migration
-- Run this AFTER 001_initial_schema.sql
-- ============================================================

-- ============================================================
-- SEASONS
-- Central anchor for all annual league data.
-- One row per year; exactly one row may be is_current = TRUE.
-- ============================================================
CREATE TABLE public.seasons (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  year        INTEGER     NOT NULL UNIQUE CHECK (year >= 2020),
  label       TEXT        NOT NULL,          -- e.g. "2024-25 Season"
  status      TEXT        NOT NULL
                CHECK (status IN ('setup', 'drafting', 'active', 'complete'))
                DEFAULT 'setup',
  is_current  BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Only one season can be "current" at a time
CREATE UNIQUE INDEX idx_seasons_one_current
  ON public.seasons (is_current)
  WHERE is_current = TRUE;

-- ============================================================
-- TEAM_SEASONS
-- Per-season metadata for each franchise:
--   • draft_position (set by commissioner before each draft)
--   • final_placement (written when season is archived)
--   • total_points   (snapshot of final points at season end)
-- Replaces teams.draft_position, which is dropped below.
-- ============================================================
CREATE TABLE public.team_seasons (
  id               UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id          UUID         NOT NULL REFERENCES public.teams(id)   ON DELETE CASCADE,
  season_id        UUID         NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  draft_position   INTEGER      CHECK (draft_position   BETWEEN 1 AND 10),
  final_placement  INTEGER      CHECK (final_placement  BETWEEN 1 AND 10),
  total_points     DECIMAL(8,2) DEFAULT 0,
  created_at       TIMESTAMPTZ  DEFAULT NOW(),
  UNIQUE (team_id,  season_id),
  UNIQUE (season_id, draft_position),   -- no two teams share a slot in the same draft
  UNIQUE (season_id, final_placement)   -- no ties in final placement (commissioner resolves)
);

-- ============================================================
-- ADD season_id TO ALL SEASON-SCOPED TABLES
-- ============================================================

-- Athletes are uploaded fresh every year (rosters change annually)
ALTER TABLE public.athletes
  ADD COLUMN season_id UUID REFERENCES public.seasons(id) ON DELETE CASCADE;

-- Unique constraint so upsert on (name, weight, season_id) works correctly
-- (the old UNIQUE (name, weight) constraint, if any, should be dropped first)
ALTER TABLE public.athletes
  DROP CONSTRAINT IF EXISTS athletes_name_weight_key;

CREATE UNIQUE INDEX IF NOT EXISTS athletes_name_weight_season_idx
  ON public.athletes (name, weight, season_id)
  WHERE season_id IS NOT NULL;

-- One draft_settings row per season (replaces single-row design)
ALTER TABLE public.draft_settings
  ADD COLUMN season_id UUID REFERENCES public.seasons(id) ON DELETE CASCADE;

-- Draft picks belong to a season
ALTER TABLE public.draft_picks
  ADD COLUMN season_id UUID REFERENCES public.seasons(id) ON DELETE CASCADE;

-- Scores belong to a season
ALTER TABLE public.scores
  ADD COLUMN season_id UUID REFERENCES public.seasons(id) ON DELETE CASCADE;

-- Wishlist is per-season (athletes change each year)
ALTER TABLE public.draft_wishlist
  ADD COLUMN season_id UUID REFERENCES public.seasons(id) ON DELETE CASCADE;

-- Chat log is per-season draft
ALTER TABLE public.draft_chat_messages
  ADD COLUMN season_id UUID REFERENCES public.seasons(id) ON DELETE CASCADE;

-- Announcements can be season-scoped (NULL = global/pinned permanently)
ALTER TABLE public.announcements
  ADD COLUMN season_id UUID REFERENCES public.seasons(id) ON DELETE SET NULL;

-- ============================================================
-- REMOVE draft_position FROM teams
-- Draft order is now stored per-season in team_seasons.
-- ============================================================
ALTER TABLE public.teams DROP COLUMN IF EXISTS draft_position;

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_seasons_status        ON public.seasons(status);
CREATE INDEX idx_seasons_year          ON public.seasons(year DESC);
CREATE INDEX idx_team_seasons_season   ON public.team_seasons(season_id);
CREATE INDEX idx_team_seasons_team     ON public.team_seasons(team_id);
CREATE INDEX idx_athletes_season       ON public.athletes(season_id);
CREATE INDEX idx_draft_settings_season ON public.draft_settings(season_id);
CREATE INDEX idx_draft_picks_season    ON public.draft_picks(season_id);
CREATE INDEX idx_scores_season         ON public.scores(season_id);
CREATE INDEX idx_wishlist_season       ON public.draft_wishlist(season_id);
CREATE INDEX idx_chat_season           ON public.draft_chat_messages(season_id);
CREATE INDEX idx_announcements_season  ON public.announcements(season_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE public.seasons     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_seasons ENABLE ROW LEVEL SECURITY;

-- Seasons: readable by everyone, writable only by commissioner
CREATE POLICY "Seasons viewable by all"
  ON public.seasons FOR SELECT USING (true);
CREATE POLICY "Commissioner can manage seasons"
  ON public.seasons FOR ALL USING (public.get_user_role() = 'commissioner');

-- Team seasons: readable by everyone, writable only by commissioner
CREATE POLICY "Team seasons viewable by all"
  ON public.team_seasons FOR SELECT USING (true);
CREATE POLICY "Commissioner can manage team seasons"
  ON public.team_seasons FOR ALL USING (public.get_user_role() = 'commissioner');

-- ============================================================
-- REALTIME
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.seasons;
ALTER PUBLICATION supabase_realtime ADD TABLE public.team_seasons;

-- ============================================================
-- HELPER: get the current active season id
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_current_season_id()
RETURNS UUID AS $$
  SELECT id FROM public.seasons WHERE is_current = TRUE LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;
