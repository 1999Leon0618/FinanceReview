PRAGMA foreign_keys = OFF;

BEGIN IMMEDIATE;

CREATE TABLE securities_v3 (
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

INSERT INTO securities_v3 (
  id, market, exchange, symbol, provider_symbol, name, security_type,
  quote_currency, archived_at, created_at, updated_at
)
SELECT
  id, market, exchange, symbol, provider_symbol, name, security_type,
  quote_currency, archived_at, created_at, updated_at
FROM securities;

DROP TABLE securities;
ALTER TABLE securities_v3 RENAME TO securities;

ALTER TABLE snapshot_positions
ADD COLUMN position_side TEXT CHECK (position_side IN ('long', 'short'));

ALTER TABLE snapshot_positions
ADD COLUMN contract_multiplier TEXT;

ALTER TABLE snapshot_positions
ADD COLUMN contract_expiry TEXT;

PRAGMA user_version = 3;

COMMIT;

PRAGMA foreign_keys = ON;
PRAGMA foreign_key_check;
