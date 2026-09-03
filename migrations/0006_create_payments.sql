-- Los pagos nunca se borran físicamente; una corrección es una anulación (status = 'voided')
-- con motivo, o un pago de ajuste nuevo (PLAN.md sección 4 / CLAUDE.md sección 6.4).
CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members (id),
  membership_id TEXT REFERENCES memberships (id),
  amount REAL NOT NULL CHECK (amount > 0), -- USD
  method TEXT NOT NULL CHECK (method IN ('cash', 'transfer', 'card_in_person', 'other')),
  payment_date TEXT NOT NULL,
  reference TEXT,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'voided')),
  void_reason TEXT,
  observation TEXT,
  -- Evita duplicados por reintentos de red al registrar un pago (CLAUDE.md sección 8).
  idempotency_key TEXT UNIQUE,
  created_by TEXT NOT NULL REFERENCES users (id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (status = 'voided' AND void_reason IS NOT NULL) OR
    (status = 'completed' AND void_reason IS NULL)
  )
);

CREATE INDEX idx_payments_member_id ON payments (member_id);
CREATE INDEX idx_payments_payment_date ON payments (payment_date);
CREATE INDEX idx_payments_status ON payments (status);

CREATE TRIGGER payments_set_updated_at
AFTER UPDATE ON payments
FOR EACH ROW
BEGIN
  UPDATE payments SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;
