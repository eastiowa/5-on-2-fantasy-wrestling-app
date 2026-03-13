-- ============================================================
-- 5 on 2 Fantasy Wrestling — Scrape Settings
-- Stores TrackWrestling tournament URL and auto-sync state.
-- Run this in your Supabase SQL Editor.
-- ============================================================

CREATE TABLE public.scrape_settings (
  id                   UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  trackwrestling_url   TEXT,                          -- full tournament bracket URL
  auto_scrape_enabled  BOOLEAN     NOT NULL DEFAULT FALSE,
  last_scraped_at      TIMESTAMPTZ,                   -- timestamp of last successful run
  last_scrape_status   TEXT        NOT NULL DEFAULT 'idle'
                         CHECK (last_scrape_status IN ('idle','ok','error')),
  last_scrape_message  TEXT,                          -- human-readable result or error
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Single-row table — insert the seed row
INSERT INTO public.scrape_settings (id) VALUES (uuid_generate_v4());

-- ── RLS ────────────────────────────────────────────────────────────────────────
ALTER TABLE public.scrape_settings ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read (so the commissioner dashboard can show status)
CREATE POLICY "Scrape settings readable by authenticated users"
  ON public.scrape_settings FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Only commissioner can update via session-authenticated routes
CREATE POLICY "Commissioner can manage scrape settings"
  ON public.scrape_settings FOR ALL
  USING (public.get_user_role() = 'commissioner');

-- ── Realtime ──────────────────────────────────────────────────────────────────
-- Enables the commissioner scores page to reactively show last_scraped_at
ALTER PUBLICATION supabase_realtime ADD TABLE public.scrape_settings;
