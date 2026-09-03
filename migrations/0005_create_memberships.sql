-- Historial de membresías por socio; una renovación SIEMPRE inserta un registro nuevo,
-- nunca sobrescribe uno existente (PLAN.md sección 4 / CLAUDE.md sección 6.3).
CREATE TABLE memberships (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members (id),
  plan_id TEXT NOT NULL REFERENCES membership_plans (id),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  -- USD. Puede diferir de membership_plans.price solo cuando lo registra un Administrador
  -- (la recepcionista únicamente puede usar el precio vigente del plan; PLAN.md sección 4).
  price_agreed REAL NOT NULL CHECK (price_agreed >= 0),
  status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'expired', 'suspended', 'cancelled')),
  renewed_from_id TEXT REFERENCES memberships (id),
  -- Marca el envío del correo de aviso de vencimiento; evita reenviarlo (PLAN.md secciones 4 y 10).
  expiry_notice_sent_at TEXT,
  created_by TEXT NOT NULL REFERENCES users (id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (end_date > start_date)
);

CREATE INDEX idx_memberships_member_id ON memberships (member_id);
CREATE INDEX idx_memberships_status ON memberships (status);
CREATE INDEX idx_memberships_end_date ON memberships (end_date);
CREATE INDEX idx_memberships_expiry_notice_sent_at ON memberships (expiry_notice_sent_at);

CREATE TRIGGER memberships_set_updated_at
AFTER UPDATE ON memberships
FOR EACH ROW
BEGIN
  UPDATE memberships SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;
