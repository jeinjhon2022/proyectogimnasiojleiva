CREATE TABLE routine_assignments (
  id TEXT PRIMARY KEY,
  routine_id TEXT NOT NULL REFERENCES routines (id),
  member_id TEXT NOT NULL REFERENCES members (id),
  assigned_by TEXT NOT NULL REFERENCES users (id),
  assigned_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_routine_assignments_routine_id ON routine_assignments (routine_id);
CREATE INDEX idx_routine_assignments_member_id ON routine_assignments (member_id);

CREATE TRIGGER routine_assignments_set_updated_at
AFTER UPDATE ON routine_assignments
FOR EACH ROW
BEGIN
  UPDATE routine_assignments SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;
