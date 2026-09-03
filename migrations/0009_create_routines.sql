CREATE TABLE routines (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  created_by TEXT NOT NULL REFERENCES users (id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_routines_status ON routines (status);
CREATE INDEX idx_routines_created_by ON routines (created_by);

CREATE TRIGGER routines_set_updated_at
AFTER UPDATE ON routines
FOR EACH ROW
BEGIN
  UPDATE routines SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;
