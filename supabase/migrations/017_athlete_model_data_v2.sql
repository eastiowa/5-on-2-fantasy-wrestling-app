-- ============================================================
-- Migration 017 — athlete_model_data: add columns for the
-- updated simulation CSV format (ncaa_scoring_timed_placement)
--
-- New CSV columns added in this version:
--   ncaa_expected_placement_points   — expected placement pts
--   ncaa_expected_advancement_points — expected advancement wins pts
--   ncaa_expected_bonus_points       — expected bonus pts
--   ncaa_expected_team_points_timed  — timed variant of total exp pts
--
--   Round-conditional expected placement points
--   (expected placement pts if this athlete wins the given round):
--   exp_pts_qf_win         — wins championship quarterfinal
--   exp_pts_sf_win         — wins championship semifinal
--   exp_pts_champ_win      — wins the championship final
--   exp_pts_blood_win      — wins blood round (consolation)
--   exp_pts_wb_qf_win      — wins wrestleback quarterfinal
--   exp_pts_wb_sf_win      — wins wrestleback semifinal
--   exp_pts_3rd_win        — wins 3rd-place bout
--   exp_pts_5th_win        — wins 5th-place bout
--   exp_pts_7th_win        — wins 7th-place bout
--
--   Milestone probabilities:
--   prob_secures_finals    — P(reaches championship final)
--   prob_secures_aa        — P(All-American via blood round)
--   prob_secures_top6      — P(top-6 finish via wrestleback QF)
--   prob_secures_top4      — P(top-4 finish via wrestleback SF)
-- ============================================================

-- Expected point breakdowns
alter table athlete_model_data
  add column if not exists ncaa_expected_placement_points   float,
  add column if not exists ncaa_expected_advancement_points float,
  add column if not exists ncaa_expected_bonus_points       float,
  add column if not exists ncaa_expected_team_points_timed  float,
  add column if not exists ncaa_points_rank_in_weight       int;

-- Round-conditional expected PLACEMENT points
-- (used by conditionalExpectedRemaining() for more accurate in-tournament projections)
alter table athlete_model_data
  add column if not exists exp_pts_qf_win      float,
  add column if not exists exp_pts_sf_win      float,
  add column if not exists exp_pts_champ_win   float,
  add column if not exists exp_pts_blood_win   float,
  add column if not exists exp_pts_wb_qf_win   float,
  add column if not exists exp_pts_wb_sf_win   float,
  add column if not exists exp_pts_3rd_win     float,
  add column if not exists exp_pts_5th_win     float,
  add column if not exists exp_pts_7th_win     float;

-- Milestone probabilities
alter table athlete_model_data
  add column if not exists prob_secures_finals float,
  add column if not exists prob_secures_aa     float,
  add column if not exists prob_secures_top6   float,
  add column if not exists prob_secures_top4   float;
