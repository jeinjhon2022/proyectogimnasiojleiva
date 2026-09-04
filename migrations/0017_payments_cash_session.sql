-- Ata (opcionalmente) un pago a la caja que estaba abierta cuando se registró, para que
-- "Movimientos del día" e "Ingresos" de la caja puedan incluir los pagos de socios sin
-- duplicar esa información en cash_movements. NULL cuando no había caja abierta en ese
-- momento (un pago nunca se bloquea por eso, ver worker/routes/payments.ts).
ALTER TABLE payments ADD COLUMN cash_session_id TEXT REFERENCES cash_sessions (id);

CREATE INDEX idx_payments_cash_session_id ON payments (cash_session_id);
