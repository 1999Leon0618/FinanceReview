PRAGMA foreign_keys = OFF;

BEGIN IMMEDIATE;

CREATE TABLE securities_v2 (
  id TEXT PRIMARY KEY,
  market TEXT NOT NULL CHECK (market IN ('TWSE', 'TPEX', 'US', 'FUND')),
  exchange TEXT,
  symbol TEXT NOT NULL,
  provider_symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  security_type TEXT NOT NULL CHECK (security_type IN ('stock', 'etf', 'fund')),
  quote_currency TEXT NOT NULL,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (market, symbol)
) STRICT;

INSERT INTO securities_v2 (
  id, market, exchange, symbol, provider_symbol, name, security_type,
  quote_currency, archived_at, created_at, updated_at
)
SELECT
  id, market, exchange, symbol, provider_symbol, name, security_type,
  quote_currency, archived_at, created_at, updated_at
FROM securities;

DROP TABLE securities;
ALTER TABLE securities_v2 RENAME TO securities;

PRAGMA user_version = 2;

COMMIT;

PRAGMA foreign_keys = ON;
PRAGMA foreign_key_check;
