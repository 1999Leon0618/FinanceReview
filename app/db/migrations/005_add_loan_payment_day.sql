PRAGMA foreign_keys = ON;

ALTER TABLE snapshot_loans ADD COLUMN payment_day_of_month INTEGER
CHECK (payment_day_of_month BETWEEN 1 AND 31);

PRAGMA user_version = 5;
PRAGMA optimize;
