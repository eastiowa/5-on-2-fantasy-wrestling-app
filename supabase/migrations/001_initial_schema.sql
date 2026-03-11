-- ============================================================
-- 5 on 2 Fantasy Wrestling League — Initial Schema
-- Run this in your Supabase SQL Editor
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- PROFILES (extends Supabase auth.users)
-- ============================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  role TEXT NOT NULL CHECK (role IN ('commissioner', 'team_manager')) DEFAULT 'team_manager',
  team_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TEAMS
-- ============================================================
CREATE TABLE public.teams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  manager_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  draft_position INTEGER CHECK (draft_position BETWEEN 1 AND 10),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add FK from profiles → teams after teams is created
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_team_id_fkey
  FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE SET NULL;

-- ============================================================
-- ATHLETES
-- ============================================================
CREATE TABLE public.athletes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  weight INTEGER NOT NULL CHECK (weight IN (125, 133, 141, 149, 157, 165, 174, 184, 197, 285)),
  school TEXT NOT NULL,
  seed INTEGER NOT NULL CHECK (seed > 0),
  is_drafted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- DRAFT SETTINGS (single row)
-- ============================================================
CREATE TABLE public.draft_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'paused', 'complete')) DEFAULT 'pending',
  current_pick_number INTEGER DEFAULT 1,
  pick_timer_seconds INTEGER DEFAULT 90,
  pick_started_at TIMESTAMPTZ,
  auto_skip_on_timeout BOOLEAN DEFAULT TRUE,
  snake_enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert the single settings row
INSERT INTO public.draft_settings (id) VALUES (uuid_generate_v4());

-- ============================================================
-- DRAFT PICKS
-- ============================================================
CREATE TABLE public.draft_picks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pick_number INTEGER NOT NULL,
  round INTEGER NOT NULL,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  athlete_id UUID NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  picked_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (athlete_id),
  UNIQUE (pick_number)
);

-- ============================================================
-- SCORES
-- ============================================================
CREATE TABLE public.scores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  athlete_id UUID NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  championship_wins INTEGER DEFAULT 0,
  consolation_wins INTEGER DEFAULT 0,
  bonus_points DECIMAL(5,2) DEFAULT 0,
  placement INTEGER CHECK (placement BETWEEN 1 AND 8),
  placement_points DECIMAL(5,2) DEFAULT 0,
  total_points DECIMAL(6,2) GENERATED ALWAYS AS (
    (championship_wins * 1.0) + (consolation_wins * 0.5) + bonus_points + placement_points
  ) STORED,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (athlete_id, event)
);

-- ============================================================
-- ANNOUNCEMENTS
-- ============================================================
CREATE TABLE public.announcements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- DRAFT WISHLIST
-- ============================================================
CREATE TABLE public.draft_wishlist (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  athlete_id UUID NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (team_id, athlete_id)
);

-- ============================================================
-- DRAFT CHAT MESSAGES
-- ============================================================
CREATE TABLE public.draft_chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sender_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  sender_name TEXT NOT NULL,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('commissioner', 'team_manager', 'system')),
  message TEXT NOT NULL CHECK (LENGTH(message) <= 500),
  is_system BOOLEAN DEFAULT FALSE,
  is_pinned BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_athletes_weight ON public.athletes(weight);
CREATE INDEX idx_athletes_seed ON public.athletes(seed);
CREATE INDEX idx_athletes_is_drafted ON public.athletes(is_drafted);
CREATE INDEX idx_draft_picks_team ON public.draft_picks(team_id);
CREATE INDEX idx_draft_picks_pick_number ON public.draft_picks(pick_number);
CREATE INDEX idx_scores_athlete ON public.scores(athlete_id);
CREATE INDEX idx_wishlist_team ON public.draft_wishlist(team_id, rank);
CREATE INDEX idx_chat_created ON public.draft_chat_messages(created_at);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.athletes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.draft_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.draft_picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.draft_wishlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.draft_chat_messages ENABLE ROW LEVEL SECURITY;

-- Helper function to get current user role
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Helper function to get current user team_id
CREATE OR REPLACE FUNCTION public.get_user_team_id()
RETURNS UUID AS $$
  SELECT team_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- PROFILES policies
CREATE POLICY "Public profiles are viewable by all" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Commissioner can insert profiles" ON public.profiles FOR INSERT WITH CHECK (public.get_user_role() = 'commissioner');

-- TEAMS policies
CREATE POLICY "Teams are viewable by all" ON public.teams FOR SELECT USING (true);
CREATE POLICY "Commissioner can manage teams" ON public.teams FOR ALL USING (public.get_user_role() = 'commissioner');

-- ATHLETES policies
CREATE POLICY "Athletes are viewable by all" ON public.athletes FOR SELECT USING (true);
CREATE POLICY "Commissioner can manage athletes" ON public.athletes FOR ALL USING (public.get_user_role() = 'commissioner');

-- DRAFT SETTINGS policies
CREATE POLICY "Draft settings viewable by all" ON public.draft_settings FOR SELECT USING (true);
CREATE POLICY "Commissioner can manage draft settings" ON public.draft_settings FOR ALL USING (public.get_user_role() = 'commissioner');

-- DRAFT PICKS policies
CREATE POLICY "Draft picks viewable by all" ON public.draft_picks FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert picks (validated in API)" ON public.draft_picks FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Commissioner can manage picks" ON public.draft_picks FOR ALL USING (public.get_user_role() = 'commissioner');

-- SCORES policies
CREATE POLICY "Scores viewable by all" ON public.scores FOR SELECT USING (true);
CREATE POLICY "Commissioner can manage scores" ON public.scores FOR ALL USING (public.get_user_role() = 'commissioner');

-- ANNOUNCEMENTS policies
CREATE POLICY "Announcements viewable by all" ON public.announcements FOR SELECT USING (true);
CREATE POLICY "Commissioner can manage announcements" ON public.announcements FOR ALL USING (public.get_user_role() = 'commissioner');

-- WISHLIST policies
CREATE POLICY "Teams can view their own wishlist" ON public.draft_wishlist FOR SELECT USING (
  public.get_user_role() = 'commissioner' OR team_id = public.get_user_team_id()
);
CREATE POLICY "Teams can manage their own wishlist" ON public.draft_wishlist FOR ALL USING (
  public.get_user_role() = 'commissioner' OR team_id = public.get_user_team_id()
);

-- CHAT policies
CREATE POLICY "Chat messages viewable by authenticated users" ON public.draft_chat_messages FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can send messages" ON public.draft_chat_messages FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Commissioner can delete messages" ON public.draft_chat_messages FOR DELETE USING (public.get_user_role() = 'commissioner');
CREATE POLICY "Commissioner can update messages (pin)" ON public.draft_chat_messages FOR UPDATE USING (public.get_user_role() = 'commissioner');

-- ============================================================
-- REALTIME — enable realtime on these tables
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.draft_picks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.draft_settings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.draft_chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.draft_wishlist;
ALTER PUBLICATION supabase_realtime ADD TABLE public.athletes;
