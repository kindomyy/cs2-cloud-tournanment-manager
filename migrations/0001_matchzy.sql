CREATE TABLE IF NOT EXISTS matchzy_maps (
  external_id TEXT NOT NULL,
  map_number INTEGER NOT NULL CHECK(map_number BETWEEN 0 AND 2),
  round_count INTEGER NOT NULL,
  completed INTEGER NOT NULL CHECK(completed IN (0,1)),
  finalized INTEGER NOT NULL CHECK(finalized IN (0,1)),
  snapshot TEXT NOT NULL,
  PRIMARY KEY(external_id, map_number)
);
