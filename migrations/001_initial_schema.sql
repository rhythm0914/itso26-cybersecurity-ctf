-- Migration 001: initial CTF team database schema

CREATE TABLE IF NOT EXISTS teams (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  school       TEXT NOT NULL DEFAULT '',
  created_at   INTEGER NOT NULL,
  started_at   INTEGER,
  ended_at     INTEGER
);

CREATE INDEX IF NOT EXISTS idx_teams_created_at ON teams(created_at);

CREATE TABLE IF NOT EXISTS team_members (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id     TEXT NOT NULL,
  slot_index  INTEGER NOT NULL CHECK (slot_index IN (0,1,2)),
  name        TEXT NOT NULL,
  is_ready    INTEGER NOT NULL DEFAULT 0,
  joined_at   INTEGER NOT NULL,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_team_members_team_slot ON team_members(team_id, slot_index);
CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON team_members(team_id);

CREATE TABLE IF NOT EXISTS join_codes (
  code        TEXT PRIMARY KEY,
  team_id     TEXT NOT NULL,
  expires_at  INTEGER NOT NULL,
  max_uses    INTEGER NOT NULL DEFAULT 2,
  uses_left   INTEGER NOT NULL DEFAULT 2,
  created_at  INTEGER NOT NULL,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_join_codes_team_id ON join_codes(team_id);

CREATE TABLE IF NOT EXISTS team_solutions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id       TEXT NOT NULL,
  challenge_id  TEXT NOT NULL,
  solved_at     INTEGER NOT NULL,
  points        INTEGER NOT NULL DEFAULT 0,
  hints_used    TEXT NOT NULL DEFAULT '[]',
  attempts_used INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_team_solutions_team_challenge ON team_solutions(team_id, challenge_id);
CREATE INDEX IF NOT EXISTS idx_team_solutions_team_id ON team_solutions(team_id);
