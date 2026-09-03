-- Registro de auditoría para operaciones sensibles (CLAUDE.md sección 5 y PLAN.md sección 4).
-- Es un log inmutable: sin updated_at ni trigger. metadata nunca debe contener datos sensibles
-- (contraseñas, tokens completos, datos de tarjetas) — CLAUDE.md sección 10.
CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT NOT NULL REFERENCES users (id),
  action TEXT NOT NULL, -- ej. "payment.void", "member.deactivate", "role.change"
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  metadata TEXT, -- JSON serializado
  created_at TEXT NOT NULL
);

CREATE INDEX idx_audit_logs_entity ON audit_logs (entity_type, entity_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs (created_at);
