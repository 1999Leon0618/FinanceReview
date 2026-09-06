CREATE TABLE IF NOT EXISTS snapshot_commits (
  snapshot_id TEXT PRIMARY KEY REFERENCES snapshots(id) ON DELETE CASCADE,
  committed_at TEXT NOT NULL
) STRICT;

INSERT OR IGNORE INTO snapshot_commits(snapshot_id, committed_at)
SELECT id, updated_at FROM snapshots;

PRAGMA user_version = 11;
