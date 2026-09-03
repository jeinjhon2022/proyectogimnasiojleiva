-- Datos de socio, separados de users porque un socio siempre tiene users.role = 'member'
-- pero además tiene datos propios de negocio (código, teléfono, fecha de inscripción, etc.).
CREATE TABLE members (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users (id),
  member_code TEXT NOT NULL UNIQUE,
  phone TEXT,
  birth_date TEXT, -- fecha (YYYY-MM-DD), sin componente de hora
  join_date TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_members_member_code ON members (member_code);
CREATE INDEX idx_members_is_active ON members (is_active);

CREATE TRIGGER members_set_updated_at
AFTER UPDATE ON members
FOR EACH ROW
BEGIN
  UPDATE members SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;
