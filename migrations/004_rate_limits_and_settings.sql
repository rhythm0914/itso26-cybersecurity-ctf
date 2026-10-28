-- Migration 004: rate limiting and competition settings.

CREATE TABLE IF NOT EXISTS rate_limits (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  key        TEXT NOT NULL,
  action     TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_key_action_created
  ON rate_limits(key, action, created_at DESC);

CREATE TABLE IF NOT EXISTS competition_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO competition_settings (key, value, updated_at)
VALUES ('registration_open', '1', strftime('%s','now') * 1000);
INSERT OR IGNORE INTO competition_settings (key, value, updated_at)
VALUES ('max_team_size', '3', strftime('%s','now') * 1000);
INSERT OR IGNORE INTO competition_settings (key, value, updated_at)
VALUES ('competition_status', 'registration', strftime('%s','now') * 1000);
INSERT OR IGNORE INTO competition_settings (key, value, updated_at)
VALUES ('competition_started_at', '', strftime('%s','now') * 1000);
INSERT OR IGNORE INTO competition_settings (key, value, updated_at)
VALUES ('competition_ended_at', '', strftime('%s','now') * 1000);
INSERT OR IGNORE INTO competition_settings (key, value, updated_at)
VALUES ('competition_duration_ms', '5400000', strftime('%s','now') * 1000);