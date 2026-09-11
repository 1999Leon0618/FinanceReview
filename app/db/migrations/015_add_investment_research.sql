PRAGMA foreign_keys = ON;

ALTER TABLE quote_cache ADD COLUMN previous_close TEXT;
ALTER TABLE quote_cache ADD COLUMN change_value TEXT;
ALTER TABLE quote_cache ADD COLUMN change_percent TEXT;
ALTER TABLE quote_cache ADD COLUMN volume TEXT;
ALTER TABLE quote_cache ADD COLUMN market_session TEXT;

CREATE TABLE watchlist_items (
  id TEXT PRIMARY KEY,
  owner_key TEXT NOT NULL,
  security_id TEXT NOT NULL REFERENCES securities(id) ON DELETE RESTRICT,
  origin TEXT NOT NULL CHECK (origin IN ('holding', 'manual', 'report')),
  is_enabled INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0, 1)),
  first_seen_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (owner_key, security_id)
) STRICT;

CREATE TABLE research_notes (
  id TEXT PRIMARY KEY,
  owner_key TEXT NOT NULL,
  market_scope TEXT NOT NULL CHECK (market_scope IN ('TW', 'US')),
  note_type TEXT NOT NULL CHECK (note_type IN ('premarket', 'intraday', 'postmarket')),
  report_date TEXT NOT NULL,
  trading_date TEXT NOT NULL,
  as_of TEXT NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT,
  summary TEXT,
  no_relevant_content INTEGER NOT NULL DEFAULT 0 CHECK (no_relevant_content IN (0, 1)),
  content_json TEXT NOT NULL,
  content_schema_version INTEGER NOT NULL DEFAULT 1,
  revision INTEGER NOT NULL DEFAULT 1,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (owner_key, market_scope, note_type, trading_date, title)
) STRICT;

CREATE TABLE research_note_revisions (
  id TEXT PRIMARY KEY,
  owner_key TEXT NOT NULL,
  note_id TEXT NOT NULL REFERENCES research_notes(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT,
  summary TEXT,
  no_relevant_content INTEGER NOT NULL CHECK (no_relevant_content IN (0, 1)),
  content_json TEXT NOT NULL,
  content_schema_version INTEGER NOT NULL,
  saved_at TEXT NOT NULL,
  UNIQUE (note_id, revision)
) STRICT;

CREATE TABLE research_note_sources (
  id TEXT PRIMARY KEY,
  owner_key TEXT NOT NULL,
  note_id TEXT NOT NULL REFERENCES research_notes(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  block_id TEXT,
  watchlist_item_id TEXT REFERENCES watchlist_items(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  publisher TEXT NOT NULL,
  url TEXT NOT NULL,
  published_at TEXT NOT NULL,
  accessed_at TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE research_quote_snapshots (
  id TEXT PRIMARY KEY,
  owner_key TEXT NOT NULL,
  note_id TEXT NOT NULL REFERENCES research_notes(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  block_id TEXT NOT NULL,
  watchlist_item_id TEXT NOT NULL REFERENCES watchlist_items(id) ON DELETE RESTRICT,
  view_name TEXT NOT NULL CHECK (view_name IN ('card', 'kline')),
  market TEXT NOT NULL,
  symbol TEXT NOT NULL,
  security_name TEXT NOT NULL,
  currency TEXT NOT NULL,
  price TEXT,
  previous_close TEXT,
  change_value TEXT,
  change_percent TEXT,
  volume TEXT,
  quote_as_of TEXT,
  quote_source TEXT,
  quote_status TEXT,
  market_session TEXT,
  candles_json TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (note_id, revision, block_id)
) STRICT;

CREATE TABLE research_todos (
  id TEXT PRIMARY KEY,
  owner_key TEXT NOT NULL,
  market_scope TEXT NOT NULL CHECK (market_scope IN ('TW', 'US')),
  title TEXT NOT NULL,
  details TEXT,
  scheduled_for TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'completed')),
  requires_note INTEGER NOT NULL DEFAULT 1 CHECK (requires_note IN (0, 1)),
  note_id TEXT REFERENCES research_notes(id) ON DELETE SET NULL,
  failure_reason TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE research_todo_watchlist_items (
  id TEXT PRIMARY KEY,
  todo_id TEXT NOT NULL REFERENCES research_todos(id) ON DELETE CASCADE,
  watchlist_item_id TEXT NOT NULL REFERENCES watchlist_items(id) ON DELETE RESTRICT,
  UNIQUE (todo_id, watchlist_item_id)
) STRICT;

CREATE INDEX idx_watchlist_owner_enabled
ON watchlist_items(owner_key, is_enabled, updated_at DESC);

CREATE INDEX idx_research_notes_owner_date
ON research_notes(owner_key, market_scope, trading_date DESC, note_type);

CREATE INDEX idx_research_sources_note
ON research_note_sources(note_id, published_at DESC);

CREATE INDEX idx_research_revisions_note
ON research_note_revisions(note_id, revision DESC);

CREATE INDEX idx_research_todos_owner_status
ON research_todos(owner_key, status, scheduled_for, created_at DESC);

PRAGMA user_version = 15;
PRAGMA optimize;
