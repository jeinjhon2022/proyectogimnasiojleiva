-- Catálogo de tipos de membresía. Sin columna de moneda: el gimnasio opera en una
-- única moneda (USD, gym_settings.currency) por decisión de negocio (PLAN.md sección 14).
CREATE TABLE membership_plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  duration_days INTEGER NOT NULL CHECK (duration_days > 0),
  price REAL NOT NULL CHECK (price >= 0), -- USD
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_membership_plans_is_active ON membership_plans (is_active);

CREATE TRIGGER membership_plans_set_updated_at
AFTER UPDATE ON membership_plans
FOR EACH ROW
BEGIN
  UPDATE membership_plans SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;
