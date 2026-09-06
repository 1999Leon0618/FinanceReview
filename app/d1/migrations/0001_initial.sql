-- 由 scripts/generate-d1-migration.mjs 依本機 schema 產生。
-- D1 migration 不使用 PRAGMA user_version 或明確 BEGIN/COMMIT。
CREATE TABLE account_positions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  security_id TEXT NOT NULL REFERENCES securities(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('active', 'sold')),
  first_seen_at TEXT NOT NULL,
  sold_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  institution TEXT,
  account_type TEXT NOT NULL CHECK (account_type IN ('bank', 'brokerage', 'cash')),
  account_reference TEXT,
  default_currency TEXT NOT NULL DEFAULT 'TWD',
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE cash_balances (
  id TEXT PRIMARY KEY,
  snapshot_account_id TEXT NOT NULL REFERENCES snapshot_accounts(id) ON DELETE CASCADE,
  currency TEXT NOT NULL,
  amount TEXT NOT NULL,
  fx_rate_id TEXT REFERENCES snapshot_fx_rates(id) ON DELETE RESTRICT,
  value_twd TEXT NOT NULL,
  UNIQUE (snapshot_account_id, currency)
) STRICT;

CREATE TABLE credit_card_accounts (
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

CREATE TABLE credit_cards (
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

CREATE TABLE loans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  institution TEXT,
  loan_type TEXT NOT NULL CHECK (loan_type IN ('mortgage', 'personal', 'auto', 'student', 'credit', 'other')),
  currency TEXT NOT NULL,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
, account_id TEXT REFERENCES accounts(id) ON DELETE RESTRICT) STRICT;

CREATE TABLE position_sales (
  id TEXT PRIMARY KEY,
  position_id TEXT NOT NULL UNIQUE REFERENCES account_positions(id) ON DELETE RESTRICT,
  result_snapshot_id TEXT NOT NULL REFERENCES snapshots(id) ON DELETE RESTRICT,
  sold_at TEXT NOT NULL,
  quantity TEXT NOT NULL,
  sale_price TEXT,
  currency TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL
, settlement_account_id TEXT REFERENCES accounts(id) ON DELETE RESTRICT, fee TEXT, tax TEXT, gross_proceeds TEXT, net_proceeds TEXT, cost_basis TEXT, realized_pnl TEXT, fx_rate TEXT, realized_pnl_twd TEXT) STRICT;

CREATE TABLE quote_cache (
  id TEXT PRIMARY KEY,
  market TEXT NOT NULL,
  symbol TEXT NOT NULL,
  price TEXT NOT NULL,
  currency TEXT NOT NULL,
  quote_as_of TEXT NOT NULL,
  source TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  UNIQUE (market, symbol, quote_as_of, source)
) STRICT;

CREATE TABLE "securities" (
  id TEXT PRIMARY KEY,
  market TEXT NOT NULL CHECK (market IN ('TWSE', 'TPEX', 'US', 'FUND', 'FUTURES')),
  exchange TEXT,
  symbol TEXT NOT NULL,
  provider_symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  security_type TEXT NOT NULL CHECK (security_type IN ('stock', 'etf', 'fund', 'future')),
  quote_currency TEXT NOT NULL,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (market, symbol)
) STRICT;

CREATE TABLE snapshot_accounts (
  id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  institution TEXT,
  account_type TEXT NOT NULL CHECK (account_type IN ('bank', 'brokerage', 'cash')),
  account_reference TEXT,
  default_currency TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (snapshot_id, account_id)
) STRICT;

CREATE TABLE snapshot_cash_flows (
  id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
  flow_type TEXT NOT NULL CHECK (flow_type IN (
    'capital_contribution',
    'capital_withdrawal',
    'income',
    'fee_tax',
    'other_inflow',
    'other_outflow'
  )),
  amount_twd TEXT NOT NULL,
  note TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE snapshot_commits (
  snapshot_id TEXT PRIMARY KEY REFERENCES snapshots(id) ON DELETE CASCADE,
  committed_at TEXT NOT NULL
) STRICT;

CREATE TABLE snapshot_credit_card_accounts (
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

CREATE TABLE snapshot_fx_rates (
  id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
  base_currency TEXT NOT NULL,
  quote_currency TEXT NOT NULL DEFAULT 'TWD',
  rate TEXT NOT NULL,
  rate_as_of TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('YAHOO', 'MANUAL', 'CARRIED_FORWARD')),
  status TEXT NOT NULL CHECK (status IN ('fresh', 'stale', 'manual')),
  overridden_by_user INTEGER NOT NULL DEFAULT 0 CHECK (overridden_by_user IN (0, 1)),
  fetched_at TEXT NOT NULL,
  UNIQUE (snapshot_id, base_currency, quote_currency)
) STRICT;

CREATE TABLE snapshot_loans (
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
  updated_at TEXT NOT NULL, payment_day_of_month INTEGER
CHECK (payment_day_of_month BETWEEN 1 AND 31), snapshot_account_id TEXT REFERENCES snapshot_accounts(id) ON DELETE CASCADE,
  UNIQUE (snapshot_id, loan_id)
) STRICT;

CREATE TABLE snapshot_positions (
  id TEXT PRIMARY KEY,
  snapshot_account_id TEXT NOT NULL REFERENCES snapshot_accounts(id) ON DELETE CASCADE,
  position_id TEXT NOT NULL REFERENCES account_positions(id) ON DELETE RESTRICT,
  security_id TEXT NOT NULL REFERENCES securities(id) ON DELETE RESTRICT,
  market TEXT NOT NULL,
  symbol TEXT NOT NULL,
  security_name TEXT NOT NULL,
  security_type TEXT NOT NULL,
  quote_currency TEXT NOT NULL,
  quantity TEXT NOT NULL,
  average_cost TEXT NOT NULL,
  market_price TEXT NOT NULL,
  quote_as_of TEXT NOT NULL,
  quote_source TEXT NOT NULL CHECK (quote_source IN ('TWSE', 'TPEX', 'YAHOO', 'MANUAL')),
  quote_status TEXT NOT NULL CHECK (quote_status IN ('fresh', 'stale', 'manual')),
  quote_note TEXT,
  fx_rate_id TEXT REFERENCES snapshot_fx_rates(id) ON DELETE RESTRICT,
  cost_value_quote TEXT NOT NULL,
  market_value_quote TEXT NOT NULL,
  cost_value_twd TEXT NOT NULL,
  market_value_twd TEXT NOT NULL,
  unrealized_pnl_twd TEXT NOT NULL,
  unrealized_return_pct TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL, position_side TEXT CHECK (position_side IN ('long', 'short')), contract_multiplier TEXT, contract_expiry TEXT,
  UNIQUE (snapshot_account_id, position_id)
) STRICT;

CREATE TABLE snapshots (
  id TEXT PRIMARY KEY,
  captured_at TEXT NOT NULL,
  base_snapshot_id TEXT REFERENCES snapshots(id) ON DELETE SET NULL,
  raw_input TEXT NOT NULL,
  parser_model TEXT NOT NULL,
  parser_schema_version INTEGER NOT NULL,
  total_cash_twd TEXT NOT NULL,
  total_securities_twd TEXT NOT NULL,
  total_asset_value_twd TEXT NOT NULL,
  total_cost_twd TEXT NOT NULL,
  unrealized_pnl_twd TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
, total_liabilities_twd TEXT NOT NULL DEFAULT '0', net_worth_twd TEXT NOT NULL DEFAULT '0', total_credit_card_liabilities_twd TEXT NOT NULL DEFAULT '0', total_credit_card_credits_twd TEXT NOT NULL DEFAULT '0') STRICT;

CREATE UNIQUE INDEX idx_account_positions_active
ON account_positions(account_id, security_id)
WHERE status = 'active';

CREATE INDEX idx_credit_cards_account
ON credit_cards(credit_card_account_id, status, name);

CREATE INDEX idx_loans_account ON loans(account_id);

CREATE INDEX idx_quote_cache_lookup
ON quote_cache(market, symbol, quote_as_of DESC);

CREATE INDEX idx_snapshot_accounts_account_snapshot
ON snapshot_accounts(account_id, snapshot_id);

CREATE INDEX idx_snapshot_cash_flows_snapshot
ON snapshot_cash_flows(snapshot_id, sort_order);

CREATE INDEX idx_snapshot_credit_cards_account_snapshot
ON snapshot_credit_card_accounts(credit_card_account_id, snapshot_id);

CREATE INDEX idx_snapshot_loans_account ON snapshot_loans(snapshot_account_id);

CREATE INDEX idx_snapshot_loans_loan_snapshot
ON snapshot_loans(loan_id, snapshot_id);

CREATE INDEX idx_snapshot_positions_security_account
ON snapshot_positions(security_id, snapshot_account_id);

CREATE INDEX idx_snapshots_captured_at
ON snapshots(captured_at DESC);

INSERT OR IGNORE INTO app_settings(key, value_json, updated_at) VALUES
  ('baseCurrency', '"TWD"', CURRENT_TIMESTAMP),
  ('defaultRange', '"6m"', CURRENT_TIMESTAMP),
  ('usQuoteProvider', '"yahoo-finance2"', CURRENT_TIMESTAMP);
