PRAGMA foreign_keys = ON;

CREATE TABLE scheduled_report_jobs (
  owner_key TEXT NOT NULL,
  week_start TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL CHECK (state IN ('running', 'failed', 'completed')),
  lease_until TEXT,
  next_retry_at TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (owner_key, week_start)
) STRICT;

PRAGMA user_version = 18;
PRAGMA optimize;
