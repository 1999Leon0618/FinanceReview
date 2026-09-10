ALTER TABLE app_users ADD COLUMN application_reason TEXT;
ALTER TABLE app_users ADD COLUMN submitted_at TEXT;
ALTER TABLE app_users ADD COLUMN admin_note TEXT;

UPDATE app_users
SET submitted_at = requested_at
WHERE status IN ('approved', 'rejected') OR role = 'admin';
