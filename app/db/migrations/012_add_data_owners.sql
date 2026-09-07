ALTER TABLE accounts ADD COLUMN owner_key TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE loans ADD COLUMN owner_key TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE credit_card_accounts ADD COLUMN owner_key TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE snapshots ADD COLUMN owner_key TEXT NOT NULL DEFAULT 'legacy';

CREATE INDEX idx_accounts_owner_active
ON accounts(owner_key, archived_at, name);

CREATE INDEX idx_loans_owner_active
ON loans(owner_key, archived_at, name);

CREATE INDEX idx_credit_card_accounts_owner
ON credit_card_accounts(owner_key, archived_at, name);

CREATE INDEX idx_snapshots_owner_captured
ON snapshots(owner_key, captured_at DESC, created_at DESC);

PRAGMA user_version = 12;
