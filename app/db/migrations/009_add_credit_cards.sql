PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS credit_card_accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  issuer TEXT NOT NULL,
  currency TEXT NOT NULL,
  shared_credit_limit TEXT NOT NULL,
  statement_day_of_month INTEGER CHECK (statement_day_of_month BETWEEN 1 AND 31),
  payment_day_of_month INTEGER CHECK (payment_day_of_month BETWEEN 1 AND 31),
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive', 'closed')),
  note TEXT,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS credit_cards (
  id TEXT PRIMARY KEY,
  credit_card_account_id TEXT NOT NULL REFERENCES credit_card_accounts(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  last_four TEXT CHECK (last_four IS NULL OR length(last_four) = 4),
  network TEXT CHECK (network IN ('visa', 'mastercard', 'jcb', 'amex', 'unionpay', 'other')),
  holder_type TEXT CHECK (holder_type IN ('primary', 'additional')),
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive', 'closed')),
  note TEXT,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS idx_credit_cards_account
ON credit_cards(credit_card_account_id, status, name);

CREATE TABLE IF NOT EXISTS snapshot_credit_card_accounts (
  id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
  credit_card_account_id TEXT NOT NULL REFERENCES credit_card_accounts(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  issuer TEXT NOT NULL,
  currency TEXT NOT NULL,
  shared_credit_limit TEXT NOT NULL,
  statement_day_of_month INTEGER CHECK (statement_day_of_month BETWEEN 1 AND 31),
  payment_day_of_month INTEGER CHECK (payment_day_of_month BETWEEN 1 AND 31),
  account_status TEXT NOT NULL CHECK (account_status IN ('active', 'inactive', 'closed')),
  note TEXT,
  statement_period TEXT NOT NULL,
  statement_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  statement_amount TEXT NOT NULL,
  payment_amount TEXT NOT NULL,
  payment_date TEXT,
  remaining_installment_principal TEXT NOT NULL,
  overpayment_balance TEXT NOT NULL,
  statement_outstanding TEXT NOT NULL,
  utilization_pct TEXT,
  fx_rate_id TEXT REFERENCES snapshot_fx_rates(id) ON DELETE RESTRICT,
  statement_amount_twd TEXT NOT NULL,
  liability_value_twd TEXT NOT NULL,
  credit_asset_value_twd TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (snapshot_id, credit_card_account_id)
) STRICT;

CREATE INDEX IF NOT EXISTS idx_snapshot_credit_cards_account_snapshot
ON snapshot_credit_card_accounts(credit_card_account_id, snapshot_id);

ALTER TABLE snapshots ADD COLUMN total_credit_card_liabilities_twd TEXT NOT NULL DEFAULT '0';
ALTER TABLE snapshots ADD COLUMN total_credit_card_credits_twd TEXT NOT NULL DEFAULT '0';

PRAGMA user_version = 9;
PRAGMA optimize;
