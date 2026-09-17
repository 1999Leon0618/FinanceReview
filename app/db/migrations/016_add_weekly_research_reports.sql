PRAGMA foreign_keys = ON;

ALTER TABLE watchlist_items ADD COLUMN removed_at TEXT;

CREATE TABLE research_preferences (
  id TEXT PRIMARY KEY,
  owner_key TEXT NOT NULL UNIQUE,
  report_language TEXT NOT NULL DEFAULT 'zh-TW' CHECK (report_language IN ('zh-TW', 'en', 'ja')),
  investment_goal TEXT,
  investment_horizon TEXT CHECK (investment_horizon IN ('short', 'medium', 'long')),
  risk_tolerance TEXT CHECK (risk_tolerance IN ('low', 'medium', 'high')),
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE research_credentials (
  owner_key TEXT PRIMARY KEY,
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE weekly_research_reports (
  id TEXT PRIMARY KEY,
  owner_key TEXT NOT NULL,
  week_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('scheduled', 'manual')),
  language TEXT NOT NULL CHECK (language IN ('zh-TW', 'en', 'ja')),
  model TEXT NOT NULL,
  content_json TEXT NOT NULL,
  evidence_json TEXT NOT NULL
) STRICT;

CREATE INDEX idx_weekly_reports_owner_date
ON weekly_research_reports(owner_key, generated_at DESC);
CREATE UNIQUE INDEX idx_weekly_reports_scheduled_once
ON weekly_research_reports(owner_key, week_start) WHERE trigger_type = 'scheduled';

PRAGMA user_version = 16;
PRAGMA optimize;
