-- Migration 003: join requests, team messages, notifications, announcements, audit logs.

-- ----------------------------------------------------------------------------
-- team_join_requests
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS team_join_requests (
  id         TEXT PRIMARY KEY,
  team_id    TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  message    TEXT NOT NULL DEFAULT '',
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  reviewed_by TEXT,
  reviewed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_join_requests_team_user ON team_join_requests(team_id, user_id);
CREATE INDEX IF NOT EXISTS idx_join_requests_team_status ON team_join_requests(team_id, status);
CREATE INDEX IF NOT EXISTS idx_join_requests_user_status ON team_join_requests(user_id, status);

-- ----------------------------------------------------------------------------
-- team_messages
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS team_messages (
  id         TEXT PRIMARY KEY,
  team_id    TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  username   TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_team_messages_team_created ON team_messages(team_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_team_messages_user ON team_messages(user_id);

-- ----------------------------------------------------------------------------
-- notifications
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  type       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL DEFAULT '',
  data       TEXT NOT NULL DEFAULT '{}',
  read_at    INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read_at, created_at DESC);

-- ----------------------------------------------------------------------------
-- announcements
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS announcements (
  id         TEXT PRIMARY KEY,
  author_id  TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  published  INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_announcements_published_created ON announcements(published, created_at DESC);

-- ----------------------------------------------------------------------------
-- audit_logs
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id         TEXT PRIMARY KEY,
  actor_id   TEXT,
  actor_username TEXT,
  action     TEXT NOT NULL,
  target_type TEXT,
  target_id  TEXT,
  detail     TEXT NOT NULL DEFAULT '{}',
  ip         TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id);