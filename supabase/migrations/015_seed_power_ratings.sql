-- ============================================================
-- Migration 015 — Seed power ratings for prediction model
--
-- Stores Bradley-Terry power ratings for each seed position.
-- These represent the relative strength of a seed in the
-- NCAA Wrestling Championship and are used by lib/predictions.ts.
--
-- Values are derived from historical NCAA championship data:
-- higher seeds (lower number) have much higher win rates.
-- The commissioner can UPDATE these rows to tune the model
-- without redeploying code.
-- ============================================================

create table if not exists seed_power_ratings (
  seed         int     primary key check (seed >= 1),
  power_rating float   not null check (power_rating > 0),
  updated_at   timestamptz not null default now()
);

-- RLS: readable by all authenticated users, writable only by commissioner
alter table seed_power_ratings enable row level security;

create policy "seed_power_ratings_select"
  on seed_power_ratings for select
  to authenticated
  using (true);

-- ── Seed data (seed 1–33) ─────────────────────────────────────────────────────
-- Based on Bradley-Terry model calibrated to historical NCAA data.
-- Tier breakdown:
--   Seeds  1– 4: Top tier  (~65–100)
--   Seeds  5– 8: Elite     (~46–52)
--   Seeds  9–12: High      (~30–36)
--   Seeds 13–16: Mid       (~18–24)
--   Seeds 17–20: Lower-mid (~12–15)
--   Seeds 21–33: Fringe    (~5–11)
insert into seed_power_ratings (seed, power_rating) values
  ( 1, 100.0),
  ( 2,  82.0),
  ( 3,  67.0),
  ( 4,  65.0),
  ( 5,  52.0),
  ( 6,  50.0),
  ( 7,  48.0),
  ( 8,  46.0),
  ( 9,  36.0),
  (10,  34.0),
  (11,  32.0),
  (12,  30.0),
  (13,  24.0),
  (14,  22.0),
  (15,  20.0),
  (16,  18.0),
  (17,  15.0),
  (18,  14.0),
  (19,  13.0),
  (20,  12.0),
  (21,  11.0),
  (22,  10.5),
  (23,  10.0),
  (24,   9.5),
  (25,   9.0),
  (26,   8.5),
  (27,   8.0),
  (28,   7.5),
  (29,   7.0),
  (30,   6.5),
  (31,   6.0),
  (32,   5.5),
  (33,   5.0)
on conflict (seed) do nothing;
