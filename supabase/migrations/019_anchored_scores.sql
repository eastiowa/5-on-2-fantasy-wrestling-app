-- ============================================================
-- Migration 019 — Add anchored score columns to athlete_model_data
--
-- From final_hard_anchor_with_explicit_nonAA_2026.csv:
--
-- anchored_score_if_place_1..8
--   The model's expected total fantasy score if this athlete
--   finishes at that placement.  Used by conditionalExpectedRemaining()
--   to compute precise in-tournament projections:
--     conditional_expected = Σ P(p|alive) × anchored_score_if_place_p
--
-- anchored_score_if_nonaa
--   Expected points for a non-All-American (DNP) athlete (~1.75).
--
-- anchored_expected_points_with_nonaa (PRIMARY)
--   Pre-tournament weighted sum across all placements including nonAA.
--   This is the top-priority source for mc_expected_points.
--
-- anchored_expected_points
--   Anchored expected points before explicit nonAA adjustment.
--
-- nonaa_explicit_points
--   Explicit points assigned to the nonAA (no placement) outcome.
--
-- Additional model metadata:
--   matches_wrestled, form_score, elite_score, elite_boost
-- ============================================================

alter table athlete_model_data
  add column if not exists anchored_score_if_place_1    float,
  add column if not exists anchored_score_if_place_2    float,
  add column if not exists anchored_score_if_place_3    float,
  add column if not exists anchored_score_if_place_4    float,
  add column if not exists anchored_score_if_place_5    float,
  add column if not exists anchored_score_if_place_6    float,
  add column if not exists anchored_score_if_place_7    float,
  add column if not exists anchored_score_if_place_8    float,
  add column if not exists anchored_score_if_nonaa      float,
  add column if not exists anchored_expected_points     float,
  add column if not exists anchored_expected_points_with_nonaa float,
  add column if not exists nonaa_explicit_points        float,
  add column if not exists matches_wrestled             int,
  add column if not exists form_score                   float,
  add column if not exists elite_score                  float,
  add column if not exists elite_boost                  float;
