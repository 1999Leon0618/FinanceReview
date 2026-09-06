PRAGMA foreign_keys = ON;

UPDATE loans AS loan
SET account_id = (
  SELECT account.id
  FROM accounts AS account
  WHERE loan.institution IS NOT NULL
    AND (
      instr(lower(account.name), lower(loan.institution)) > 0
      OR instr(lower(loan.institution), lower(account.name)) > 0
    )
  ORDER BY length(account.name) DESC
  LIMIT 1
)
WHERE account_id IS NULL;

UPDATE snapshot_loans AS loan
SET snapshot_account_id = (
  SELECT account.id
  FROM snapshot_accounts AS account
  WHERE account.snapshot_id = loan.snapshot_id
    AND loan.institution IS NOT NULL
    AND (
      instr(lower(account.name), lower(loan.institution)) > 0
      OR instr(lower(loan.institution), lower(account.name)) > 0
    )
  ORDER BY length(account.name) DESC
  LIMIT 1
)
WHERE snapshot_account_id IS NULL;

PRAGMA user_version = 7;
PRAGMA optimize;
