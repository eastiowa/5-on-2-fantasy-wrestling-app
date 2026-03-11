-- ============================================================
-- Migration 004: Auto-create profile on signup
-- Run this in your Supabase SQL Editor.
--
-- Creates a trigger on auth.users so that whenever a new user
-- signs up (email/password, OAuth, magic link, etc.) a matching
-- row is inserted into public.profiles automatically with:
--   role = 'team_manager'  (commissioner can promote via User Roles page)
--   email = auth user email
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', NULL),
    'team_manager'
  )
  ON CONFLICT (id) DO NOTHING;   -- safe to re-run; won't overwrite existing profiles
  RETURN NEW;
END;
$$;

-- Attach the trigger to auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- Back-fill: create profile rows for any existing auth users
-- that don't have one yet (e.g. the commissioner who signed up
-- before this trigger was added).
-- ============================================================
INSERT INTO public.profiles (id, email, display_name, role)
SELECT
  au.id,
  au.email,
  COALESCE(au.raw_user_meta_data->>'full_name', au.raw_user_meta_data->>'name', NULL),
  'team_manager'
FROM auth.users au
LEFT JOIN public.profiles p ON p.id = au.id
WHERE p.id IS NULL;
