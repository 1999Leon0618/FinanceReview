PRAGMA foreign_keys = ON;

UPDATE snapshot_credit_card_accounts AS card_snapshot
SET due_date = (
  SELECT
    strftime(
      '%Y-%m-',
      COALESCE(card_snapshot.payment_date, snapshot.captured_at)
    ) || printf(
      '%02d',
      MIN(
        card_snapshot.payment_day_of_month,
        CAST(
          strftime(
            '%d',
            date(
              COALESCE(card_snapshot.payment_date, snapshot.captured_at),
              'start of month',
              '+1 month',
              '-1 day'
            )
          ) AS INTEGER
        )
      )
    ) || 'T00:00:00.000Z'
  FROM snapshots AS snapshot
  WHERE snapshot.id = card_snapshot.snapshot_id
)
WHERE card_snapshot.payment_day_of_month IS NOT NULL;

PRAGMA user_version = 10;
PRAGMA optimize;
