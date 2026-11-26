CREATE TABLE IF NOT EXISTS private_duels (
  id TEXT PRIMARY KEY,
  external_id TEXT NOT NULL UNIQUE,
  revision INTEGER NOT NULL,
  state TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
