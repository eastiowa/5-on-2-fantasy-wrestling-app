-- ============================================================
-- Migration 018 — Add calibrated_points column to
--                 athlete_model_data
--
-- calibrated_points is the final output of the calibrated
-- prediction model (fantasy_wrestling_calibrated_model.csv).
-- It is stored here AND copied into mc_expected_points so that
-- all existing projection logic automatically uses the
-- calibrated value without further changes.
--
-- Additional new fields from the calibrated model CSV:
--   record_confidence         — confidence weight for record
--   bonus_emphasis_multiplier — multiplier applied to bonus pts
--   expected_bonus_per_win    — expected bonus points per win
-- ============================================================

alter table athlete_model_data
  add column if not exists calibrated_points         float,
  add column if not exists record_confidence         float,
  add column if not exists bonus_emphasis_multiplier float,
  add column if not exists expected_bonus_per_win    float;
