import { listSalesByCashSession } from './products-repo';

export type CashSessionStatus = 'open' | 'closed';
export type CashMovementType = 'manual_income' | 'manual_expense';
export type CashMovementMethod = 'cash' | 'transfer' | 'card_in_person' | 'other';

export interface CashSession {
  id: string;
  status: CashSessionStatus;
  initialBalance: number;
  openedBy: string;
  openedAt: string;
  closedBy: string | null;
  closedAt: string | null;
  countedCash: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CashSessionRow {
  id: string;
  status: string;
  initial_balance: number;
  opened_by: string;
  opened_at: string;
  closed_by: string | null;
  closed_at: string | null;
  counted_cash: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

function mapSession(row: CashSessionRow): CashSession {
  return {
    id: row.id,
    status: row.status as CashSessionStatus,
    initialBalance: row.initial_balance,
    openedBy: row.opened_by,
    openedAt: row.opened_at,
    closedBy: row.closed_by,
    closedAt: row.closed_at,
    countedCash: row.counted_cash,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SESSION_SELECT = `
  SELECT id, status, initial_balance, opened_by, opened_at, closed_by, closed_at,
         counted_cash, notes, created_at, updated_at
  FROM cash_sessions
`;

export async function getOpenSession(db: D1Database): Promise<CashSession | null> {
  const row = await db
    .prepare(`${SESSION_SELECT} WHERE status = 'open' LIMIT 1`)
    .first<CashSessionRow>();
  return row ? mapSession(row) : null;
}

export async function getSessionById(db: D1Database, id: string): Promise<CashSession | null> {
  const row = await db.prepare(`${SESSION_SELECT} WHERE id = ?`).bind(id).first<CashSessionRow>();
  return row ? mapSession(row) : null;
}

export interface ListSessionsParams {
  page: number;
  pageSize: number;
}

export interface ListSessionsResult {
  items: CashSession[];
  total: number;
  page: number;
  pageSize: number;
}

// Historial de cajas (más reciente primero), para revisar cierres anteriores.
export async function listSessions(
  db: D1Database,
  params: ListSessionsParams,
): Promise<ListSessionsResult> {
  const { page, pageSize } = params;
  const offset = (page - 1) * pageSize;

  const countRow = await db
    .prepare('SELECT COUNT(*) as total FROM cash_sessions')
    .first<{ total: number }>();
  const result = await db
    .prepare(`${SESSION_SELECT} ORDER BY opened_at DESC LIMIT ? OFFSET ?`)
    .bind(pageSize, offset)
    .all<CashSessionRow>();

  return {
    items: result.results.map(mapSession),
    total: countRow?.total ?? 0,
    page,
    pageSize,
  };
}

// Abre una caja nueva. El índice único parcial en cash_sessions(status) WHERE
// status='open' (migración 0015) es la garantía real contra dos aperturas simultáneas;
// esta verificación previa solo da un mensaje de error legible en el caso normal.
export async function openSession(
  db: D1Database,
  initialBalance: number,
  actorUserId: string,
): Promise<CashSession> {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  await db.batch([
    db
      .prepare(
        "INSERT INTO cash_sessions (id, status, initial_balance, opened_by, opened_at, created_at, updated_at) VALUES (?, 'open', ?, ?, ?, ?, ?)",
      )
      .bind(id, initialBalance, actorUserId, now, now, now),
    db
      .prepare(
        "INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, metadata, created_at) VALUES (?, ?, 'cash_session.open', 'cash_session', ?, ?, ?)",
      )
      .bind(crypto.randomUUID(), actorUserId, id, JSON.stringify({ initialBalance }), now),
  ]);

  const created = await getSessionById(db, id);
  if (!created) throw new Error('No se pudo leer la caja recién abierta');
  return created;
}

export interface CashMovement {
  id: string;
  sessionId: string;
  type: CashMovementType;
  amount: number;
  method: CashMovementMethod;
  description: string;
  createdBy: string;
  createdAt: string;
}

interface CashMovementRow {
  id: string;
  session_id: string;
  type: string;
  amount: number;
  method: string;
  description: string;
  created_by: string;
  created_at: string;
}

function mapMovement(row: CashMovementRow): CashMovement {
  return {
    id: row.id,
    sessionId: row.session_id,
    type: row.type as CashMovementType,
    amount: row.amount,
    method: row.method as CashMovementMethod,
    description: row.description,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export interface CreateCashMovementInput {
  sessionId: string;
  type: CashMovementType;
  amount: number;
  method: CashMovementMethod;
  description: string;
}

// Movimiento manual (ingreso u egreso con justificación) — inmutable, sin edición ni
// borrado (mismo criterio que attendance/audit_logs). La ruta ya verificó que la caja
// indicada está abierta antes de llamar esto.
export async function createCashMovement(
  db: D1Database,
  input: CreateCashMovementInput,
  actorUserId: string,
): Promise<CashMovement> {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  await db
    .prepare(
      'INSERT INTO cash_movements (id, session_id, type, amount, method, description, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(
      id,
      input.sessionId,
      input.type,
      input.amount,
      input.method,
      input.description,
      actorUserId,
      now,
    )
    .run();

  const row = await db
    .prepare(
      'SELECT id, session_id, type, amount, method, description, created_by, created_at FROM cash_movements WHERE id = ?',
    )
    .bind(id)
    .first<CashMovementRow>();
  if (!row) throw new Error('No se pudo leer el movimiento recién creado');
  return mapMovement(row);
}

export async function listMovementsBySession(
  db: D1Database,
  sessionId: string,
): Promise<CashMovement[]> {
  const result = await db
    .prepare(
      'SELECT id, session_id, type, amount, method, description, created_by, created_at FROM cash_movements WHERE session_id = ? ORDER BY created_at DESC',
    )
    .bind(sessionId)
    .all<CashMovementRow>();
  return result.results.map(mapMovement);
}

export interface CashPaymentRow {
  id: string;
  member_id: string;
  member_full_name: string;
  amount: number;
  method: string;
  payment_date: string;
}

export interface CashSessionSummary {
  session: CashSession;
  // Ingresos por pagos de socios (cuotas y cobros de deuda) atados a esta caja.
  paymentIncomeByMethod: Record<CashMovementMethod, number>;
  totalPaymentIncome: number;
  // Ingresos por venta de productos atados a esta caja.
  productSaleIncomeByMethod: Record<CashMovementMethod, number>;
  totalProductSaleIncome: number;
  manualIncomeByMethod: Record<CashMovementMethod, number>;
  totalManualIncome: number;
  manualExpenseByMethod: Record<CashMovementMethod, number>;
  totalManualExpense: number;
  totalIncomes: number;
  totalExpenses: number;
  // Solo lo que de verdad está en el cajón físico: inicial + efectivo cobrado - efectivo
  // pagado, sin importar transferencia/tarjeta (esos nunca entran ni salen del cajón).
  expectedCash: number;
  movements: CashMovement[];
  payments: Array<{
    id: string;
    memberId: string;
    memberFullName: string;
    amount: number;
    method: CashMovementMethod;
    paymentDate: string;
  }>;
  productSales: Array<{
    id: string;
    productName: string;
    quantity: number;
    total: number;
    method: CashMovementMethod;
    createdAt: string;
  }>;
}

function emptyMethodRecord(): Record<CashMovementMethod, number> {
  return { cash: 0, transfer: 0, card_in_person: 0, other: 0 };
}

// Todo lo que necesita la pantalla de Caja (abierta o ya cerrada): desglose por método
// de los pagos de socios y de los movimientos manuales, y el efectivo esperado en el
// cajón para comparar contra el arqueo al cerrar.
export async function getSessionSummary(
  db: D1Database,
  session: CashSession,
): Promise<CashSessionSummary> {
  const paymentsResult = await db
    .prepare(
      `SELECT p.id, p.member_id, u.full_name AS member_full_name, p.amount, p.method, p.payment_date
       FROM payments p
       JOIN members m ON m.id = p.member_id
       JOIN users u ON u.id = m.user_id
       WHERE p.cash_session_id = ? AND p.status = 'completed'
       ORDER BY p.payment_date DESC`,
    )
    .bind(session.id)
    .all<CashPaymentRow>();

  const movements = await listMovementsBySession(db, session.id);
  const productSales = await listSalesByCashSession(db, session.id);

  const paymentIncomeByMethod = emptyMethodRecord();
  for (const row of paymentsResult.results) {
    paymentIncomeByMethod[row.method as CashMovementMethod] += row.amount;
  }
  const totalPaymentIncome = Object.values(paymentIncomeByMethod).reduce((a, b) => a + b, 0);

  const productSaleIncomeByMethod = emptyMethodRecord();
  for (const sale of productSales) {
    productSaleIncomeByMethod[sale.method] += sale.total;
  }
  const totalProductSaleIncome = Object.values(productSaleIncomeByMethod).reduce(
    (a, b) => a + b,
    0,
  );

  const manualIncomeByMethod = emptyMethodRecord();
  const manualExpenseByMethod = emptyMethodRecord();
  for (const movement of movements) {
    if (movement.type === 'manual_income') manualIncomeByMethod[movement.method] += movement.amount;
    else manualExpenseByMethod[movement.method] += movement.amount;
  }
  const totalManualIncome = Object.values(manualIncomeByMethod).reduce((a, b) => a + b, 0);
  const totalManualExpense = Object.values(manualExpenseByMethod).reduce((a, b) => a + b, 0);

  const totalIncomes = totalPaymentIncome + totalProductSaleIncome + totalManualIncome;
  const totalExpenses = totalManualExpense;

  const expectedCash =
    session.initialBalance +
    paymentIncomeByMethod.cash +
    productSaleIncomeByMethod.cash +
    manualIncomeByMethod.cash -
    manualExpenseByMethod.cash;

  return {
    session,
    paymentIncomeByMethod,
    totalPaymentIncome,
    productSaleIncomeByMethod,
    totalProductSaleIncome,
    manualIncomeByMethod,
    totalManualIncome,
    manualExpenseByMethod,
    totalManualExpense,
    totalIncomes,
    totalExpenses,
    expectedCash,
    movements,
    productSales: productSales.map((sale) => ({
      id: sale.id,
      productName: sale.productName,
      quantity: sale.quantity,
      total: sale.total,
      method: sale.method,
      createdAt: sale.createdAt,
    })),
    payments: paymentsResult.results.map((row) => ({
      id: row.id,
      memberId: row.member_id,
      memberFullName: row.member_full_name,
      amount: row.amount,
      method: row.method as CashMovementMethod,
      paymentDate: row.payment_date,
    })),
  };
}

export interface CloseSessionInput {
  countedCash: number;
  notes?: string | undefined;
}

// Cierra la caja: congela el resumen (vía audit_logs, porque cash_sessions ya no
// permite reabrirse ni editarse) y guarda el arqueo. La diferencia contra lo esperado
// se calcula al vuelo cuando se consulta, nunca se "corrige" counted_cash después.
export async function closeSession(
  db: D1Database,
  session: CashSession,
  input: CloseSessionInput,
  actorUserId: string,
): Promise<CashSession> {
  const now = new Date().toISOString();

  await db.batch([
    db
      .prepare(
        "UPDATE cash_sessions SET status = 'closed', closed_by = ?, closed_at = ?, counted_cash = ?, notes = ? WHERE id = ?",
      )
      .bind(actorUserId, now, input.countedCash, input.notes ?? null, session.id),
    db
      .prepare(
        "INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, metadata, created_at) VALUES (?, ?, 'cash_session.close', 'cash_session', ?, ?, ?)",
      )
      .bind(
        crypto.randomUUID(),
        actorUserId,
        session.id,
        JSON.stringify({ countedCash: input.countedCash }),
        now,
      ),
  ]);

  const closed = await getSessionById(db, session.id);
  if (!closed) throw new Error('No se pudo leer la caja recién cerrada');
  return closed;
}
