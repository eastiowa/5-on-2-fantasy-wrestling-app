-- ============================================================
-- Migration 014 — Prediction projections tables
--
-- athlete_projections: per-athlete expected points remaining
--   and projected final score. Recomputed after every score sync.
--
-- team_projections: per-team projected final score and
--   championship win probability (0.0–1.0). Recomputed after
--   every score sync via Monte Carlo simulation.
-- ============================================================

-- ── Add bracket_status to the scores table ───────────────────────────────────
-- Stores the athlete's current bracket position as scraped from TrackWrestling.
-- Used by the prediction engine to know which paths remain open.
alter table scores
  add column if not exists bracket_status text not null default 'unknown';
  -- 'championship' | 'consolation' | 'placed' | 'eliminated' | 'unknown'

-- ── athlete_projections ───────────────────────────────────────────────────────
create table if not exists athlete_projections (
  id                       uuid primary key default gen_random_uuid(),
  season_id                uuid not null references seasons(id) on delete cascade,
  athlete_id               uuid not null references athletes(id) on delete cascade,

  -- Current bracket position (mirrors scores table for convenience)
  bracket_status           text not null default 'unknown',
    -- 'championship' | 'consolation' | 'placed' | 'eliminated' | 'unknown'
  championship_round       int  not null default 0,  -- wins in championship bracket
  consolation_round        int  not null default 0,  -- wins in consolation bracket

  -- Model output
  expected_points_remaining float not null default 0,
  projected_total           float not null default 0,

  last_computed_at         timestamptz not null default now(),

  unique (season_id, athlete_id)
);

create index if not exists athlete_projections_season_idx
  on athlete_projections (season_id);

create index if not exists athlete_projections_athlete_idx
  on athlete_projections (athlete_id);

-- RLS: readable by all authenticated users, writable only by service role
alter table athlete_projections enable row level security;

create policy "athlete_projections_select"
  on athlete_projections for select
  to authenticated
  using (true);

-- ── team_projections ──────────────────────────────────────────────────────────
create table if not exists team_projections (
  id                uuid primary key default gen_random_uuid(),
  season_id         uuid not null references seasons(id) on delete cascade,
  team_id           uuid not null references teams(id)   on delete cascade,

  -- Model output
  projected_total   float not null default 0,
  win_probability   float not null default 0,  -- 0.0 to 1.0

  last_computed_at  timestamptz not null default now(),

  unique (season_id, team_id)
);

create index if not exists team_projections_season_idx
  on team_projections (season_id);

create index if not exists team_projections_team_idx
  on team_projections (team_id);

-- RLS: readable by all authenticated users, writable only by service role
alter table team_projections enable row level security;

create policy "team_projections_select"
  on team_projections for select
  to authenticated
  using (true);
