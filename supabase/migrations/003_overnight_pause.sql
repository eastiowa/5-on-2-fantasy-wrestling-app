-- ============================================================
-- Migration 003: Overnight Pause + Pick Timer in Seconds (extended)
-- Run AFTER 002_seasons.sql
-- ============================================================

-- Extend pick_timer_seconds max to 7200 (2 hours = 120 min × 60 sec).
-- Drop the old CHECK if one exists, then add a broader one.
ALTER TABLE public.draft_settings
  DROP CONSTRAINT IF EXISTS draft_settings_pick_timer_seconds_check;

ALTER TABLE public.draft_settings
  ADD CONSTRAINT draft_settings_pick_timer_seconds_check
  CHECK (pick_timer_seconds >= 0 AND pick_timer_seconds <= 7200);

-- ── Overnight pause columns ──────────────────────────────────────────────────
-- overnight_pause_enabled: when TRUE, the draft auto-pauses during the window
-- pause_start_hour: hour (0-23, America/Chicago) when the pause begins
-- pause_end_hour:   hour (0-23, America/Chicago) when the pause ends / draft resumes
-- Default window: 10 PM → 8 AM Central
ALTER TABLE public.draft_settings
  ADD COLUMN IF NOT EXISTS overnight_pause_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pause_start_hour        INTEGER NOT NULL DEFAULT 22
    CHECK (pause_start_hour BETWEEN 0 AND 23),
  ADD COLUMN IF NOT EXISTS pause_end_hour          INTEGER NOT NULL DEFAULT 8
    CHECK (pause_end_hour BETWEEN 0 AND 23);
