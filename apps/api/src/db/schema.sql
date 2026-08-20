-- REAP schema.
--
-- Applied idempotently at boot. SQLite is deliberate: the whole database is a
-- single file, so a reviewer can clone the repo and have working persistence
-- with no service to install. The repository layer is the only code that
-- touches SQL, which keeps a future swap to Postgres contained.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS properties (
  id             TEXT PRIMARY KEY,
  address        TEXT    NOT NULL,
  city           TEXT    NOT NULL,
  neighborhood   TEXT,
  price          INTEGER NOT NULL CHECK (price >= 0),
  bedrooms       INTEGER NOT NULL CHECK (bedrooms >= 0),
  bathrooms      REAL    NOT NULL CHECK (bathrooms >= 0),
  sqft           INTEGER NOT NULL CHECK (sqft >= 0),
  lot_size_sqft  INTEGER,
  year_built     INTEGER,
  property_type  TEXT    NOT NULL,
  status         TEXT    NOT NULL,
  listed_at      TEXT    NOT NULL,
  description    TEXT,
  -- JSON array. SQLite has no array type and the list is short and read whole.
  features       TEXT    NOT NULL DEFAULT '[]',
  created_at     TEXT    NOT NULL,
  updated_at     TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_properties_status ON properties (status);

CREATE TABLE IF NOT EXISTS leads (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  email           TEXT NOT NULL,
  phone           TEXT,
  side            TEXT NOT NULL,
  stage           TEXT NOT NULL,
  temperature     TEXT NOT NULL,
  source          TEXT,
  property_id     TEXT REFERENCES properties (id) ON DELETE SET NULL,
  budget_min      INTEGER,
  budget_max      INTEGER,
  notes           TEXT,
  last_contact_at TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads (stage);
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads (email);

CREATE TABLE IF NOT EXISTS activities (
  id                TEXT PRIMARY KEY,
  status            TEXT NOT NULL,
  -- Provider-native message id. UNIQUE gives us idempotent ingestion: polling
  -- the same inbox twice cannot produce duplicate approval requests.
  external_id       TEXT NOT NULL UNIQUE,
  from_name         TEXT NOT NULL,
  from_email        TEXT NOT NULL,
  subject           TEXT NOT NULL,
  body              TEXT NOT NULL,
  received_at       TEXT NOT NULL,
  intent            TEXT NOT NULL,
  sentiment         INTEGER NOT NULL,
  confidence        INTEGER NOT NULL,
  classifier        TEXT NOT NULL,
  signals           TEXT NOT NULL DEFAULT '[]',
  rationale         TEXT NOT NULL DEFAULT '[]',
  proposed_actions  TEXT NOT NULL DEFAULT '[]',
  -- JSON object or NULL for activities that send no email.
  draft             TEXT,
  lead_id           TEXT REFERENCES leads (id) ON DELETE SET NULL,
  property_id       TEXT REFERENCES properties (id) ON DELETE SET NULL,
  created_at        TEXT NOT NULL,
  resolved_at       TEXT,
  error             TEXT,
  -- JSON array of guard findings. Empty for an ordinary activity; a critical
  -- entry here is what places the row in 'held'.
  risk              TEXT NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_activities_status ON activities (status);
CREATE INDEX IF NOT EXISTS idx_activities_created ON activities (created_at DESC);

CREATE TABLE IF NOT EXISTS documents (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL,
  filename    TEXT NOT NULL UNIQUE,
  property_id TEXT REFERENCES properties (id) ON DELETE SET NULL,
  size_bytes  INTEGER NOT NULL,
  created_at  TEXT NOT NULL
);

-- Append-only. Nothing in the application issues UPDATE or DELETE against this
-- table; the compliance story for an AI acting on an agent's behalf depends on
-- the record being immutable.
CREATE TABLE IF NOT EXISTS audit_entries (
  id           TEXT PRIMARY KEY,
  at           TEXT NOT NULL,
  actor        TEXT NOT NULL,
  action       TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id   TEXT NOT NULL,
  summary      TEXT NOT NULL,
  detail       TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_entries (at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_subject ON audit_entries (subject_id);
