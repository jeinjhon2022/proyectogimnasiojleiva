-- Configuración general del gimnasio. Single-tenant (PLAN.md sección 14): se espera un único registro.
CREATE TABLE gym_settings (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  timezone TEXT NOT NULL, -- IANA, ej. "America/Bogota". Todas las fechas se guardan en UTC; esto es solo para mostrarlas (CLAUDE.md sección 7).
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'), -- fijo por decisión de negocio (PLAN.md sección 14)
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TRIGGER gym_settings_set_updated_at
AFTER UPDATE ON gym_settings
FOR EACH ROW
BEGIN
  UPDATE gym_settings SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;
