-- Registro de asistencia. Es un evento inmutable (no se edita ni se borra), por eso
-- no tiene updated_at ni trigger. La prevención de duplicados (ventana de 1 hora,
-- PLAN.md sección 4) se aplica en el Worker usando el índice compuesto de abajo.
CREATE TABLE attendance (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members (id),
  checked_in_at TEXT NOT NULL, -- UTC ISO 8601
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'qr')),
  recorded_by TEXT REFERENCES users (id), -- el Worker exige este valor cuando source = 'manual'
  created_at TEXT NOT NULL
);

CREATE INDEX idx_attendance_member_checked_in ON attendance (member_id, checked_in_at);
