CREATE TABLE IF NOT EXISTS app_users (
  owner_key TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  role TEXT NOT NULL CHECK (role IN ('user', 'admin')),
  requested_at TEXT NOT NULL,
  reviewed_at TEXT,
  reviewed_by_owner_key TEXT,
  last_seen_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS idx_app_users_status_requested
ON app_users(status, requested_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_single_admin
ON app_users(role) WHERE role = 'admin';
