-- Catálogo de ejercicios reutilizable entre rutinas.
CREATE TABLE exercises (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  muscle_group TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_exercises_is_active ON exercises (is_active);

CREATE TRIGGER exercises_set_updated_at
AFTER UPDATE ON exercises
FOR EACH ROW
BEGIN
  UPDATE exercises SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;
