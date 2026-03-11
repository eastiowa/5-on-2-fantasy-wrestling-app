-- ============================================================
-- Migration 005: Quick Links
-- Stores commissioner-managed links shown on the Standings page.
-- Run AFTER 001_initial_schema.sql
-- ============================================================

CREATE TABLE public.quick_links (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  label      TEXT        NOT NULL,
  url        TEXT        NOT NULL,
  sort_order INTEGER     NOT NULL DEFAULT 0,
  is_active  BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_quick_links_sort ON public.quick_links (sort_order ASC, created_at ASC);

-- Seed with the two existing hardcoded links
INSERT INTO public.quick_links (label, url, sort_order) VALUES
  ('Team Manager Login',       '/login',  1),
  ('NCAA Tournament Bracket',  '#',       2);

-- ── Row Level Security ──────────────────────────────────────────────────────
ALTER TABLE public.quick_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Quick links viewable by all"
  ON public.quick_links FOR SELECT USING (true);

CREATE POLICY "Commissioner can manage quick links"
  ON public.quick_links FOR ALL USING (public.get_user_role() = 'commissioner');
