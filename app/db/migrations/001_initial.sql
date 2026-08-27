PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS accounts (
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

CREATE TABLE IF NOT EXISTS securities (
  id TEXT PRIMARY KEY,
  market TEXT NOT NULL CHECK (market IN ('TWSE', 'TPEX', 'US')),
  exchange TEXT,
  symbol TEXT NOT NULL,
  provider_symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  security_type TEXT NOT NULL CHECK (security_type IN ('stock', 'etf')),
  quote_currency TEXT NOT NULL,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (market, symbol)
) STRICT;

CREATE TABLE IF NOT EXISTS account_positions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  security_id TEXT NOT NULL REFERENCES securities(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('active', 'sold')),
  first_seen_at TEXT NOT NULL,
  sold_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_account_positions_active
ON account_positions(account_id, security_id)
WHERE status = 'active';

CREATE TABLE IF NOT EXISTS snapshots (
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
) STRICT;

CREATE TABLE IF NOT EXISTS snapshot_accounts (
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

CREATE TABLE IF NOT EXISTS snapshot_fx_rates (
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

CREATE TABLE IF NOT EXISTS cash_balances (
  id TEXT PRIMARY KEY,
  snapshot_account_id TEXT NOT NULL REFERENCES snapshot_accounts(id) ON DELETE CASCADE,
  currency TEXT NOT NULL,
  amount TEXT NOT NULL,
  fx_rate_id TEXT REFERENCES snapshot_fx_rates(id) ON DELETE RESTRICT,
  value_twd TEXT NOT NULL,
  UNIQUE (snapshot_account_id, currency)
) STRICT;

CREATE TABLE IF NOT EXISTS snapshot_positions (
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
  updated_at TEXT NOT NULL,
  UNIQUE (snapshot_account_id, position_id)
) STRICT;

CREATE TABLE IF NOT EXISTS position_sales (
  id TEXT PRIMARY KEY,
  position_id TEXT NOT NULL UNIQUE REFERENCES account_positions(id) ON DELETE RESTRICT,
  result_snapshot_id TEXT NOT NULL REFERENCES snapshots(id) ON DELETE RESTRICT,
  sold_at TEXT NOT NULL,
  quantity TEXT NOT NULL,
  sale_price TEXT,
  currency TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS quote_cache (
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

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS idx_snapshots_captured_at
ON snapshots(captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_snapshot_accounts_account_snapshot
ON snapshot_accounts(account_id, snapshot_id);

CREATE INDEX IF NOT EXISTS idx_snapshot_positions_security_account
ON snapshot_positions(security_id, snapshot_account_id);

CREATE INDEX IF NOT EXISTS idx_quote_cache_lookup
ON quote_cache(market, symbol, quote_as_of DESC);

PRAGMA user_version = 1;
PRAGMA optimize;
