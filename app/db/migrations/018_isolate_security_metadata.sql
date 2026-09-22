PRAGMA foreign_keys = ON;

ALTER TABLE snapshot_positions ADD COLUMN provider_symbol TEXT;
ALTER TABLE watchlist_items ADD COLUMN provider_symbol TEXT;
ALTER TABLE watchlist_items ADD COLUMN display_name TEXT;
ALTER TABLE watchlist_items ADD COLUMN display_security_type TEXT;
ALTER TABLE watchlist_items ADD COLUMN display_quote_currency TEXT;

PRAGMA user_version = 18;
PRAGMA optimize;
