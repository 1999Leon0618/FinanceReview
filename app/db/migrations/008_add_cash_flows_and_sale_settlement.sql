PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS snapshot_cash_flows (
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

CREATE INDEX IF NOT EXISTS idx_snapshot_cash_flows_snapshot
ON snapshot_cash_flows(snapshot_id, sort_order);

ALTER TABLE position_sales ADD COLUMN settlement_account_id TEXT REFERENCES accounts(id) ON DELETE RESTRICT;
ALTER TABLE position_sales ADD COLUMN fee TEXT;
ALTER TABLE position_sales ADD COLUMN tax TEXT;
ALTER TABLE position_sales ADD COLUMN gross_proceeds TEXT;
ALTER TABLE position_sales ADD COLUMN net_proceeds TEXT;
ALTER TABLE position_sales ADD COLUMN cost_basis TEXT;
ALTER TABLE position_sales ADD COLUMN realized_pnl TEXT;
ALTER TABLE position_sales ADD COLUMN fx_rate TEXT;
ALTER TABLE position_sales ADD COLUMN realized_pnl_twd TEXT;

PRAGMA user_version = 8;
PRAGMA optimize;
