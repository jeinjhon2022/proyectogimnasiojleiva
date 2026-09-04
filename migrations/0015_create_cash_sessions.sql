-- Caja diaria (arqueo obligatorio): una sesión por jornada de caja. A lo sumo una
-- abierta a la vez (índice único parcial más abajo) — abrir una nueva exige cerrar la
-- anterior primero. No se borran ni se editan tras cerrarse (CLAUDE.md sección 7):
-- una corrección se anota en `notes`, nunca se sobrescribe counted_cash.
CREATE TABLE cash_sessions (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  initial_balance REAL NOT NULL CHECK (initial_balance >= 0),
  opened_by TEXT NOT NULL REFERENCES users (id),
  opened_at TEXT NOT NULL,
  closed_by TEXT REFERENCES users (id),
  closed_at TEXT,
  -- Arqueo: efectivo que el staff contó físicamente al cerrar (para comparar contra lo
  -- esperado, calculado en el momento a partir de pagos + movimientos manuales).
  counted_cash REAL CHECK (counted_cash IS NULL OR counted_cash >= 0),
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (status = 'open' AND closed_at IS NULL AND closed_by IS NULL AND counted_cash IS NULL) OR
    (status = 'closed' AND closed_at IS NOT NULL AND closed_by IS NOT NULL AND counted_cash IS NOT NULL)
  )
);

-- Garantiza a nivel de base de datos que nunca haya dos cajas abiertas al mismo tiempo,
-- incluso si dos solicitudes de apertura llegan casi simultáneas.
CREATE UNIQUE INDEX idx_cash_sessions_single_open ON cash_sessions (status) WHERE status = 'open';
CREATE INDEX idx_cash_sessions_opened_at ON cash_sessions (opened_at);

CREATE TRIGGER cash_sessions_set_updated_at
AFTER UPDATE ON cash_sessions
FOR EACH ROW
BEGIN
  UPDATE cash_sessions SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;
