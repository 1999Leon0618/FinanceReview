PRAGMA foreign_keys = ON;

ALTER TABLE loans ADD COLUMN account_id TEXT REFERENCES accounts(id) ON DELETE RESTRICT;
ALTER TABLE snapshot_loans ADD COLUMN snapshot_account_id TEXT REFERENCES snapshot_accounts(id) ON DELETE CASCADE;

UPDATE loans AS loan
SET account_id = (
  SELECT account.id
  FROM accounts AS account
  WHERE loan.institution IS NOT NULL
    AND account.institution IS NOT NULL
    AND (
      lower(trim(loan.institution)) = lower(trim(account.institution))
      OR instr(lower(loan.institution), lower(account.institution)) > 0
      OR instr(lower(account.institution), lower(loan.institution)) > 0
    )
  ORDER BY length(account.institution) DESC
  LIMIT 1
)
WHERE account_id IS NULL;

UPDATE snapshot_loans AS loan
SET snapshot_account_id = (
  SELECT account.id
  FROM snapshot_accounts AS account
  WHERE account.snapshot_id = loan.snapshot_id
    AND loan.institution IS NOT NULL
    AND account.institution IS NOT NULL
    AND (
      lower(trim(loan.institution)) = lower(trim(account.institution))
      OR instr(lower(loan.institution), lower(account.institution)) > 0
      OR instr(lower(account.institution), lower(loan.institution)) > 0
    )
  ORDER BY length(account.institution) DESC
  LIMIT 1
)
WHERE snapshot_account_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_loans_account ON loans(account_id);
CREATE INDEX IF NOT EXISTS idx_snapshot_loans_account ON snapshot_loans(snapshot_account_id);

PRAGMA user_version = 6;
PRAGMA optimize;
