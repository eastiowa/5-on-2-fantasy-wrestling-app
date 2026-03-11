-- ============================================================
-- 006_invite_tokens.sql
-- Custom shareable invite tokens — lets commissioners generate
-- a link without knowing the manager's email in advance.
-- The manager opens the link, registers with any email they
-- choose, and is automatically assigned to the team.
-- ============================================================

CREATE TABLE IF NOT EXISTS invite_tokens (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 64-char hex token, URL-safe, cryptographically random
  token         TEXT        UNIQUE NOT NULL
                              DEFAULT encode(gen_random_bytes(32), 'hex'),
  team_id       UUID        NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  created_by    UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- valid for 7 days by default
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  -- filled when consumed
  used_at       TIMESTAMPTZ,
  used_by_email TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invite_tokens_token_idx
  ON invite_tokens(token);

CREATE INDEX IF NOT EXISTS invite_tokens_team_id_idx
  ON invite_tokens(team_id);

-- ── Row Level Security ───────────────────────────────────────
ALTER TABLE invite_tokens ENABLE ROW LEVEL SECURITY;

-- Commissioners can create / read / delete tokens
CREATE POLICY "commissioners_manage_invite_tokens"
  ON invite_tokens FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'commissioner'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'commissioner'
    )
  );
-- Note: token validation on the join page uses the service-role
-- (admin) client, which bypasses RLS, so no public read policy
-- is needed here.
