-- ============================================================
-- Migration 016 — Athlete model data (pre-tournament simulation)
--
-- Stores the per-athlete results from an external Monte Carlo
-- simulation (mc_full_results_2026.csv format).
--
-- Key columns:
--   mc_p1–mc_p8       MC placement probability distribution
--   mc_expected_points MC expected fantasy points (best pre-tournament estimate)
--   ws_elo            Wrestler Elo rating (replaces generic seed_power_ratings
--                     for athletes that have model data)
--   win_rate          Historical win rate
--   bonus_rate        Historical bonus-point win rate
--
-- The commissioner uploads a new CSV before each tournament via
-- POST /api/projections/upload-model.  The route matches rows to
-- athletes by (normalised_name, weight) and sets athlete_id.
-- Rows that cannot be matched have athlete_id = null and are
-- surfaced back to the commissioner as "unmatched".
-- ============================================================

create table if not exists athlete_model_data (
  id          uuid primary key default gen_random_uuid(),
  season_id   uuid not null references seasons(id) on delete cascade,

  -- Foreign key to matched athlete (null if name-matching failed)
  athlete_id  uuid references athletes(id) on delete cascade,

  -- Raw identifiers from the CSV (used for matching + display)
  csv_name    text not null,
  csv_school  text,
  weight      int  not null,
  seed        int,

  -- Skill metrics
  ws_elo      float,   -- Wrestler Elo rating
  win_rate    float,   -- Historical win rate  0.0–1.0
  bonus_rate  float,   -- Historical bonus-point rate  0.0–1.0
  model_score float,   -- Combined model score (higher = better)
  value_tier  text,    -- e.g. "Over-seeded/neutral", "Slight value"
  salary      int,     -- DFS salary (informational)

  -- Monte Carlo placement probability distribution (sums ≤ 1.0)
  mc_p1  float not null default 0,
  mc_p2  float not null default 0,
  mc_p3  float not null default 0,
  mc_p4  float not null default 0,
  mc_p5  float not null default 0,
  mc_p6  float not null default 0,
  mc_p7  float not null default 0,
  mc_p8  float not null default 0,
  mc_top8 float not null default 0,     -- probability of placing at all
  mc_expected_points float not null default 0,  -- pre-tournament expected pts

  -- DFS scoring proxies (informational, not used by engine)
  cash_score  float,
  gpp_score   float,
  value_score float,

  uploaded_at timestamptz not null default now(),

  -- One row per athlete per season
  unique (season_id, csv_name, weight)
);

create index if not exists athlete_model_data_season_idx
  on athlete_model_data (season_id);

create index if not exists athlete_model_data_athlete_idx
  on athlete_model_data (athlete_id);

-- RLS: readable by all authenticated users, writable only by service role
alter table athlete_model_data enable row level security;

create policy "athlete_model_data_select"
  on athlete_model_data for select
  to authenticated
  using (true);
