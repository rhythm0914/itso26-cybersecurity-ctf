-- Migration 005: challenge flags and attempts tracking
CREATE TABLE IF NOT EXISTS challenge_flags (
  challenge_id TEXT PRIMARY KEY,
  flag_hash TEXT NOT NULL,
  case_sensitive INTEGER NOT NULL DEFAULT 1,
  points INTEGER NOT NULL,
  difficulty TEXT NOT NULL,
  is_tiebreaker INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS challenge_attempts (
  team_id TEXT NOT NULL,
  challenge_id TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  locked INTEGER NOT NULL DEFAULT 0,
  first_solved_at INTEGER,
  PRIMARY KEY (team_id, challenge_id)
);
CREATE TABLE IF NOT EXISTS challenge_hints (
  team_id TEXT NOT NULL,
  challenge_id TEXT NOT NULL,
  hint_index INTEGER NOT NULL,
  unlocked_at INTEGER NOT NULL,
  PRIMARY KEY (team_id, challenge_id, hint_index)
);
CREATE TABLE IF NOT EXISTS competition_state (
  team_id TEXT PRIMARY KEY,
  started_at INTEGER,
  ends_at INTEGER,
  ended INTEGER NOT NULL DEFAULT 0,
  last_reset_by TEXT
);
ALTER TABLE team_members ADD COLUMN role TEXT NOT NULL DEFAULT 'member';
