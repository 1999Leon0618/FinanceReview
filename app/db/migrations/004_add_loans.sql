PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS loans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  institution TEXT,
  loan_type TEXT NOT NULL CHECK (loan_type IN ('mortgage', 'personal', 'auto', 'student', 'credit', 'other')),
  currency TEXT NOT NULL,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS snapshot_loans (
  id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
  loan_id TEXT NOT NULL REFERENCES loans(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  institution TEXT,
  loan_type TEXT NOT NULL CHECK (loan_type IN ('mortgage', 'personal', 'auto', 'student', 'credit', 'other')),
  currency TEXT NOT NULL,
  original_principal TEXT,
  outstanding_principal TEXT NOT NULL,
  annual_interest_rate TEXT,
  rate_type TEXT CHECK (rate_type IN ('fixed', 'floating')),
  monthly_payment TEXT,
  next_payment_date TEXT,
  start_date TEXT,
  end_date TEXT,
  note TEXT,
  fx_rate_id TEXT REFERENCES snapshot_fx_rates(id) ON DELETE RESTRICT,
  value_twd TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (snapshot_id, loan_id)
) STRICT;

CREATE INDEX IF NOT EXISTS idx_snapshot_loans_loan_snapshot
ON snapshot_loans(loan_id, snapshot_id);

ALTER TABLE snapshots ADD COLUMN total_liabilities_twd TEXT NOT NULL DEFAULT '0';
ALTER TABLE snapshots ADD COLUMN net_worth_twd TEXT NOT NULL DEFAULT '0';

UPDATE snapshots SET net_worth_twd = total_asset_value_twd;

PRAGMA user_version = 4;
PRAGMA optimize;
