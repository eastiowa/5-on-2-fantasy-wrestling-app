-- ============================================================
-- Migration 010 — Per-user athlete flags (private scouting notes)
-- Run in Supabase SQL Editor
-- ============================================================

-- Each user can tag any athlete as 'stud', 'ok', or 'pud'.
-- One flag per (user, athlete) pair. RLS ensures complete privacy
-- so no user can ever read another user's flags.

CREATE TABLE IF NOT EXISTS public.athlete_flags (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  athlete_id  UUID NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  flag        TEXT NOT NULL CHECK (flag IN ('stud', 'ok', 'pud')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, athlete_id)
);

-- ── Row Level Security ─────────────────────────────────────────────────────
ALTER TABLE public.athlete_flags ENABLE ROW LEVEL SECURITY;

-- Each user can select, insert, update, and delete only their own rows.
CREATE POLICY "Users manage own flags"
  ON public.athlete_flags
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
