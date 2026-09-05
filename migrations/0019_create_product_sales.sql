-- Venta de producto: evento inmutable (sin UPDATE ni DELETE, igual que
-- attendance/cash_movements). unit_price y total quedan fijos al momento de vender
-- aunque el precio del producto cambie después. Se ata a la caja abierta al momento de
-- la venta (nunca la decide el cliente) para que el arqueo la incluya, igual que
-- payments.cash_session_id — nunca se bloquea la venta por no haber caja abierta.
CREATE TABLE product_sales (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products (id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price REAL NOT NULL CHECK (unit_price >= 0),
  total REAL NOT NULL CHECK (total >= 0),
  method TEXT NOT NULL CHECK (method IN ('cash', 'transfer', 'card_in_person', 'other')),
  cash_session_id TEXT REFERENCES cash_sessions (id),
  created_by TEXT NOT NULL REFERENCES users (id),
  created_at TEXT NOT NULL
);

CREATE INDEX idx_product_sales_product_id ON product_sales (product_id);
CREATE INDEX idx_product_sales_cash_session_id ON product_sales (cash_session_id);
CREATE INDEX idx_product_sales_created_at ON product_sales (created_at);
