-- Migration 002: user accounts, sessions, verification/reset tokens,
-- and team extensions for the full platform.

-- ----------------------------------------------------------------------------
-- users
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL,
  email         TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'participant' CHECK (role IN ('participant','organizer','admin')),
  email_verified INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(lower(username));
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(lower(email));
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- ----------------------------------------------------------------------------
-- sessions (server-side, expiring)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

-- ----------------------------------------------------------------------------
-- email verification tokens (hashed at rest)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at    INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user ON email_verification_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_expires ON email_verification_tokens(expires_at);

-- ----------------------------------------------------------------------------
-- password reset tokens (hashed at rest)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at    INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires ON password_reset_tokens(expires_at);

-- ----------------------------------------------------------------------------
-- teams extensions (additive only; preserves existing rows)
-- ----------------------------------------------------------------------------
ALTER TABLE teams ADD COLUMN slug            TEXT;
ALTER TABLE teams ADD COLUMN motto           TEXT;
ALTER TABLE teams ADD COLUMN description     TEXT;
ALTER TABLE teams ADD COLUMN recruitment     INTEGER NOT NULL DEFAULT 1;
ALTER TABLE teams ADD COLUMN max_size        INTEGER NOT NULL DEFAULT 3;
ALTER TABLE teams ADD COLUMN captain_user_id TEXT;
ALTER TABLE teams ADD COLUMN status          TEXT NOT NULL DEFAULT 'open';
ALTER TABLE teams ADD COLUMN updated_at     INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS idx_teams_slug ON teams(lower(slug));

-- ----------------------------------------------------------------------------
-- team_members extensions
-- ----------------------------------------------------------------------------
ALTER TABLE team_members ADD COLUMN user_id TEXT;
ALTER TABLE team_members ADD COLUMN is_captain INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON team_members(user_id);