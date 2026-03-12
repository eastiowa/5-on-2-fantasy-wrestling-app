-- 008_draft_start_date.sql
-- Adds an optional draft_start_date to draft_settings so the commissioner
-- can schedule the draft and all users see a countdown.
ALTER TABLE draft_settings
  ADD COLUMN IF NOT EXISTS draft_start_date TIMESTAMPTZ;
