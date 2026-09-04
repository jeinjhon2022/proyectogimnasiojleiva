-- Movimientos manuales de caja (ingreso u egreso con justificación) — distintos de los
-- pagos de socios, que ya viven en `payments` y se atan a la caja mediante
-- payments.cash_session_id (migración 0017). Un movimiento es un evento inmutable, igual
-- que attendance/audit_logs: no hay UPDATE ni DELETE, solo INSERT.
CREATE TABLE cash_movements (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES cash_sessions (id),
  type TEXT NOT NULL CHECK (type IN ('manual_income', 'manual_expense')),
  amount REAL NOT NULL CHECK (amount > 0),
  method TEXT NOT NULL CHECK (method IN ('cash', 'transfer', 'card_in_person', 'other')),
  description TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users (id),
  created_at TEXT NOT NULL
);

CREATE INDEX idx_cash_movements_session_id ON cash_movements (session_id);
