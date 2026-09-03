-- Marca el envío del correo "membresía vencida" (Fase 9), evitando reenviarlo en
-- corridas posteriores del job diario. ADD COLUMN es una operación segura y directa
-- en SQLite (a diferencia de quitar NOT NULL, que requiere reconstruir la tabla).
ALTER TABLE memberships ADD COLUMN expired_notice_sent_at TEXT;

CREATE INDEX idx_memberships_expired_notice_sent_at ON memberships (expired_notice_sent_at);
