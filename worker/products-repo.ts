export interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  stock: number;
  minStockAlert: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ProductRow {
  id: string;
  name: string;
  description: string | null;
  price: number;
  stock: number;
  min_stock_alert: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}

function mapProduct(row: ProductRow): Product {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    price: row.price,
    stock: row.stock,
    minStockAlert: row.min_stock_alert,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const PRODUCT_SELECT = `
  SELECT id, name, description, price, stock, min_stock_alert, is_active, created_at, updated_at
  FROM products
`;

export async function getProductById(db: D1Database, id: string): Promise<Product | null> {
  const row = await db.prepare(`${PRODUCT_SELECT} WHERE id = ?`).bind(id).first<ProductRow>();
  return row ? mapProduct(row) : null;
}

export type ProductStatusFilter = 'all' | 'active' | 'inactive';

export interface ListProductsParams {
  page: number;
  pageSize: number;
  status?: ProductStatusFilter | undefined;
}

export interface ListProductsResult {
  items: Product[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listProducts(
  db: D1Database,
  params: ListProductsParams,
): Promise<ListProductsResult> {
  const { page, pageSize, status } = params;
  const offset = (page - 1) * pageSize;

  const whereClause =
    status && status !== 'all' ? `WHERE is_active = ${status === 'active' ? 1 : 0}` : '';

  const countRow = await db
    .prepare(`SELECT COUNT(*) as total FROM products ${whereClause}`)
    .first<{ total: number }>();
  const result = await db
    .prepare(`${PRODUCT_SELECT} ${whereClause} ORDER BY name ASC LIMIT ? OFFSET ?`)
    .bind(pageSize, offset)
    .all<ProductRow>();

  return { items: result.results.map(mapProduct), total: countRow?.total ?? 0, page, pageSize };
}

export interface CreateProductInput {
  name: string;
  description?: string | undefined;
  price: number;
  stock: number;
  minStockAlert: number;
}

export async function createProduct(
  db: D1Database,
  input: CreateProductInput,
  actorUserId: string,
): Promise<Product> {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  await db.batch([
    db
      .prepare(
        'INSERT INTO products (id, name, description, price, stock, min_stock_alert, is_active, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)',
      )
      .bind(
        id,
        input.name,
        input.description ?? null,
        input.price,
        input.stock,
        input.minStockAlert,
        actorUserId,
        now,
        now,
      ),
    db
      .prepare(
        "INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, metadata, created_at) VALUES (?, ?, 'product.create', 'product', ?, ?, ?)",
      )
      .bind(crypto.randomUUID(), actorUserId, id, JSON.stringify({ name: input.name }), now),
  ]);

  const created = await getProductById(db, id);
  if (!created) throw new Error('No se pudo leer el producto recién creado');
  return created;
}

export interface UpdateProductInput {
  name?: string | undefined;
  description?: string | null | undefined;
  price?: number | undefined;
  minStockAlert?: number | undefined;
}

// Edición de datos del producto (no del stock — eso es adjustStock, con motivo).
export async function updateProduct(
  db: D1Database,
  id: string,
  patch: UpdateProductInput,
  actorUserId: string,
): Promise<Product | null> {
  const current = await getProductById(db, id);
  if (!current) return null;

  const name = patch.name ?? current.name;
  const description = patch.description !== undefined ? patch.description : current.description;
  const price = patch.price ?? current.price;
  const minStockAlert = patch.minStockAlert ?? current.minStockAlert;
  const now = new Date().toISOString();

  await db.batch([
    db
      .prepare(
        'UPDATE products SET name = ?, description = ?, price = ?, min_stock_alert = ? WHERE id = ?',
      )
      .bind(name, description, price, minStockAlert, id),
    db
      .prepare(
        "INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, metadata, created_at) VALUES (?, ?, 'product.update', 'product', ?, ?, ?)",
      )
      .bind(
        crypto.randomUUID(),
        actorUserId,
        id,
        JSON.stringify({ fields: Object.keys(patch) }),
        now,
      ),
  ]);

  return getProductById(db, id);
}

export async function setProductActive(
  db: D1Database,
  id: string,
  isActive: boolean,
  actorUserId: string,
): Promise<Product | null> {
  const current = await getProductById(db, id);
  if (!current) return null;
  if (current.isActive === isActive) return current; // idempotente

  const now = new Date().toISOString();
  await db.batch([
    db.prepare('UPDATE products SET is_active = ? WHERE id = ?').bind(isActive ? 1 : 0, id),
    db
      .prepare(
        "INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, metadata, created_at) VALUES (?, ?, ?, 'product', ?, NULL, ?)",
      )
      .bind(
        crypto.randomUUID(),
        actorUserId,
        isActive ? 'product.activate' : 'product.deactivate',
        id,
        now,
      ),
  ]);

  return getProductById(db, id);
}

export type StockAdjustResult =
  { kind: 'ok'; product: Product } | { kind: 'not_found' } | { kind: 'would_go_negative' };

// Corrección manual de inventario (reposición, conteo físico, merma) — siempre con
// motivo. delta puede ser negativo; nunca se permite que el stock quede por debajo de 0.
export async function adjustStock(
  db: D1Database,
  id: string,
  delta: number,
  reason: string,
  actorUserId: string,
): Promise<StockAdjustResult> {
  const current = await getProductById(db, id);
  if (!current) return { kind: 'not_found' };

  const newStock = current.stock + delta;
  if (newStock < 0) return { kind: 'would_go_negative' };

  const now = new Date().toISOString();
  await db.batch([
    db.prepare('UPDATE products SET stock = ? WHERE id = ?').bind(newStock, id),
    db
      .prepare(
        "INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, metadata, created_at) VALUES (?, ?, 'product.adjust_stock', 'product', ?, ?, ?)",
      )
      .bind(crypto.randomUUID(), actorUserId, id, JSON.stringify({ delta, reason, newStock }), now),
  ]);

  const updated = await getProductById(db, id);
  if (!updated) throw new Error('No se pudo leer el producto tras ajustar el stock');
  return { kind: 'ok', product: updated };
}

export type ProductSaleMethod = 'cash' | 'transfer' | 'card_in_person' | 'other';

export interface ProductSale {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
  method: ProductSaleMethod;
  cashSessionId: string | null;
  createdBy: string;
  createdAt: string;
}

interface ProductSaleRow {
  id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total: number;
  method: string;
  cash_session_id: string | null;
  created_by: string;
  created_at: string;
}

function mapSale(row: ProductSaleRow): ProductSale {
  return {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    quantity: row.quantity,
    unitPrice: row.unit_price,
    total: row.total,
    method: row.method as ProductSaleMethod,
    cashSessionId: row.cash_session_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

const SALE_SELECT = `
  SELECT s.id, s.product_id, p.name AS product_name, s.quantity, s.unit_price, s.total,
         s.method, s.cash_session_id, s.created_by, s.created_at
  FROM product_sales s
  JOIN products p ON p.id = s.product_id
`;

export type SellProductResult =
  | { kind: 'ok'; sale: ProductSale; product: Product }
  | { kind: 'not_found' }
  | { kind: 'inactive' }
  | { kind: 'insufficient_stock'; available: number };

export interface SellProductInput {
  productId: string;
  quantity: number;
  method: ProductSaleMethod;
  cashSessionId?: string | undefined;
}

// Vende N unidades: descuenta stock y registra la venta en un solo batch atómico
// (CLAUDE.md sección 7). No permite vender más unidades de las que hay en stock.
export async function sellProduct(
  db: D1Database,
  input: SellProductInput,
  actorUserId: string,
): Promise<SellProductResult> {
  const product = await getProductById(db, input.productId);
  if (!product) return { kind: 'not_found' };
  if (!product.isActive) return { kind: 'inactive' };
  if (product.stock < input.quantity) {
    return { kind: 'insufficient_stock', available: product.stock };
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const total = product.price * input.quantity;

  await db.batch([
    db
      .prepare('UPDATE products SET stock = stock - ? WHERE id = ?')
      .bind(input.quantity, input.productId),
    db
      .prepare(
        'INSERT INTO product_sales (id, product_id, quantity, unit_price, total, method, cash_session_id, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(
        id,
        input.productId,
        input.quantity,
        product.price,
        total,
        input.method,
        input.cashSessionId ?? null,
        actorUserId,
        now,
      ),
    db
      .prepare(
        "INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, metadata, created_at) VALUES (?, ?, 'product.sell', 'product_sale', ?, ?, ?)",
      )
      .bind(
        crypto.randomUUID(),
        actorUserId,
        id,
        JSON.stringify({ productId: input.productId, quantity: input.quantity, total }),
        now,
      ),
  ]);

  const [sale, updatedProduct] = await Promise.all([
    db.prepare(`${SALE_SELECT} WHERE s.id = ?`).bind(id).first<ProductSaleRow>(),
    getProductById(db, input.productId),
  ]);
  if (!sale || !updatedProduct) throw new Error('No se pudo leer la venta recién registrada');
  return { kind: 'ok', sale: mapSale(sale), product: updatedProduct };
}

export interface ListProductSalesParams {
  page: number;
  pageSize: number;
  dateFrom?: string | undefined; // YYYY-MM-DD
  dateTo?: string | undefined;
}

export interface ListProductSalesResult {
  items: ProductSale[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listProductSales(
  db: D1Database,
  params: ListProductSalesParams,
): Promise<ListProductSalesResult> {
  const { page, pageSize, dateFrom, dateTo } = params;
  const offset = (page - 1) * pageSize;

  const conditions: string[] = [];
  const queryParams: unknown[] = [];
  if (dateFrom) {
    conditions.push('s.created_at >= ?');
    queryParams.push(dateFrom);
  }
  if (dateTo) {
    conditions.push('s.created_at <= ?');
    queryParams.push(`${dateTo}T23:59:59.999Z`);
  }
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countRow = await db
    .prepare(`SELECT COUNT(*) as total FROM product_sales s ${whereClause}`)
    .bind(...queryParams)
    .first<{ total: number }>();
  const result = await db
    .prepare(`${SALE_SELECT} ${whereClause} ORDER BY s.created_at DESC LIMIT ? OFFSET ?`)
    .bind(...queryParams, pageSize, offset)
    .all<ProductSaleRow>();

  return { items: result.results.map(mapSale), total: countRow?.total ?? 0, page, pageSize };
}

export async function listSalesByCashSession(
  db: D1Database,
  cashSessionId: string,
): Promise<ProductSale[]> {
  const result = await db
    .prepare(`${SALE_SELECT} WHERE s.cash_session_id = ? ORDER BY s.created_at DESC`)
    .bind(cashSessionId)
    .all<ProductSaleRow>();
  return result.results.map(mapSale);
}

export interface ProductSalesSummary {
  totalToday: number;
  quantityToday: number;
  activeProductCount: number;
}

// KPIs para el encabezado del módulo (PLAN.md — Productos): ventas de hoy en USD,
// unidades vendidas hoy, y cuántos productos activos hay en el catálogo.
export async function getProductSalesSummary(
  db: D1Database,
  today: string,
): Promise<ProductSalesSummary> {
  const [salesRow, productsRow] = await Promise.all([
    db
      .prepare(
        'SELECT COALESCE(SUM(total), 0) as total, COALESCE(SUM(quantity), 0) as quantity FROM product_sales WHERE created_at >= ? AND created_at <= ?',
      )
      .bind(`${today}T00:00:00.000Z`, `${today}T23:59:59.999Z`)
      .first<{ total: number; quantity: number }>(),
    db
      .prepare('SELECT COUNT(*) as count FROM products WHERE is_active = 1')
      .first<{ count: number }>(),
  ]);

  return {
    totalToday: salesRow?.total ?? 0,
    quantityToday: salesRow?.quantity ?? 0,
    activeProductCount: productsRow?.count ?? 0,
  };
}
