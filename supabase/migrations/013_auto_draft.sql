-- Add auto_draft flag to teams
-- When true, the system will automatically pick for this team when it's their turn.
ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS auto_draft BOOLEAN NOT NULL DEFAULT FALSE;
