export type PaymentMethod = 'cash' | 'transfer' | 'card_in_person' | 'other';
export type PaymentStatus = 'completed' | 'voided';

export interface Payment {
  id: string;
  memberId: string;
  memberFullName: string;
  membershipId: string | null;
  amount: number;
  method: PaymentMethod;
  paymentDate: string;
  reference: string | null;
  status: PaymentStatus;
  voidReason: string | null;
  observation: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

interface PaymentRow {
  id: string;
  member_id: string;
  member_full_name: string;
  membership_id: string | null;
  amount: number;
  method: string;
  payment_date: string;
  reference: string | null;
  status: string;
  void_reason: string | null;
  observation: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

function mapPayment(row: PaymentRow): Payment {
  return {
    id: row.id,
    memberId: row.member_id,
    memberFullName: row.member_full_name,
    membershipId: row.membership_id,
    amount: row.amount,
    method: row.method as PaymentMethod,
    paymentDate: row.payment_date,
    reference: row.reference,
    status: row.status as PaymentStatus,
    voidReason: row.void_reason,
    observation: row.observation,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const PAYMENT_SELECT = `
  SELECT p.id, p.member_id, u.full_name AS member_full_name, p.membership_id, p.amount, p.method,
         p.payment_date, p.reference, p.status, p.void_reason, p.observation, p.created_by,
         p.created_at, p.updated_at
  FROM payments p
  JOIN members m ON m.id = p.member_id
  JOIN users u ON u.id = m.user_id
`;

export async function getPaymentById(db: D1Database, id: string): Promise<Payment | null> {
  const row = await db.prepare(`${PAYMENT_SELECT} WHERE p.id = ?`).bind(id).first<PaymentRow>();
  return row ? mapPayment(row) : null;
}

export async function findPaymentByIdempotencyKey(
  db: D1Database,
  key: string,
): Promise<Payment | null> {
  const row = await db
    .prepare(`${PAYMENT_SELECT} WHERE p.idempotency_key = ?`)
    .bind(key)
    .first<PaymentRow>();
  return row ? mapPayment(row) : null;
}

export interface ListPaymentsParams {
  page: number;
  pageSize: number;
  memberId?: string | undefined;
  status?: PaymentStatus | undefined;
  dateFrom?: string | undefined; // YYYY-MM-DD, inclusive
  dateTo?: string | undefined; // YYYY-MM-DD, inclusive
}

export interface ListPaymentsResult {
  items: Payment[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listPayments(
  db: D1Database,
  params: ListPaymentsParams,
): Promise<ListPaymentsResult> {
  const { page, pageSize, memberId, status, dateFrom, dateTo } = params;
  const offset = (page - 1) * pageSize;

  const conditions: string[] = [];
  const queryParams: unknown[] = [];
  if (memberId) {
    conditions.push('p.member_id = ?');
    queryParams.push(memberId);
  }
  if (status) {
    conditions.push('p.status = ?');
    queryParams.push(status);
  }
  if (dateFrom) {
    conditions.push('p.payment_date >= ?');
    queryParams.push(dateFrom);
  }
  if (dateTo) {
    // payment_date es timestamp completo; comparar por prefijo de fecha requiere el
    // límite superior del día para incluirlo entero.
    conditions.push('p.payment_date <= ?');
    queryParams.push(`${dateTo}T23:59:59.999Z`);
  }
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countRow = await db
    .prepare(`SELECT COUNT(*) as total FROM payments p ${whereClause}`)
    .bind(...queryParams)
    .first<{ total: number }>();

  const result = await db
    .prepare(`${PAYMENT_SELECT} ${whereClause} ORDER BY p.payment_date DESC LIMIT ? OFFSET ?`)
    .bind(...queryParams, pageSize, offset)
    .all<PaymentRow>();

  return { items: result.results.map(mapPayment), total: countRow?.total ?? 0, page, pageSize };
}

export interface CreatePaymentInput {
  memberId: string;
  membershipId?: string | undefined;
  amount: number;
  method: PaymentMethod;
  paymentDate?: string | undefined;
  reference?: string | undefined;
  observation?: string | undefined;
  idempotencyKey?: string | undefined;
  // La caja abierta al momento de cobrar, si había una (worker/routes/payments.ts la
  // resuelve sola; nunca la decide el cliente). Un pago nunca se bloquea por no haber
  // caja abierta — solo queda sin aparecer en ningún arqueo de caja.
  cashSessionId?: string | undefined;
}

// Nunca se sobrescribe ni se borra un pago (CLAUDE.md sección 6.4): esta función solo
// inserta. La corrección es voidPayment (anulación) o un pago de ajuste nuevo.
export async function createPayment(
  db: D1Database,
  input: CreatePaymentInput,
  actorUserId: string,
): Promise<Payment> {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const paymentDate = input.paymentDate ?? now;

  await db.batch([
    db
      .prepare(
        `INSERT INTO payments
           (id, member_id, membership_id, amount, method, payment_date, reference, status, observation, idempotency_key, cash_session_id, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        input.memberId,
        input.membershipId ?? null,
        input.amount,
        input.method,
        paymentDate,
        input.reference ?? null,
        input.observation ?? null,
        input.idempotencyKey ?? null,
        input.cashSessionId ?? null,
        actorUserId,
        now,
        now,
      ),
    db
      .prepare(
        "INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, metadata, created_at) VALUES (?, ?, 'payment.create', 'payment', ?, ?, ?)",
      )
      .bind(
        crypto.randomUUID(),
        actorUserId,
        id,
        JSON.stringify({ amount: input.amount, method: input.method }),
        now,
      ),
  ]);

  const created = await getPaymentById(db, id);
  if (!created) throw new Error('No se pudo leer el pago recién creado');
  return created;
}

// Anulación (CLAUDE.md sección 6.4): nunca DELETE. Solo Administrador puede llamarla
// (verificado en la ruta). Idempotente: anular dos veces no falla ni pisa el motivo.
export async function voidPayment(
  db: D1Database,
  id: string,
  reason: string,
  actorUserId: string,
): Promise<Payment | null> {
  const existing = await getPaymentById(db, id);
  if (!existing) return null;
  if (existing.status === 'voided') return existing;

  const now = new Date().toISOString();

  await db.batch([
    db
      .prepare("UPDATE payments SET status = 'voided', void_reason = ? WHERE id = ?")
      .bind(reason, id),
    db
      .prepare(
        "INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, metadata, created_at) VALUES (?, ?, 'payment.void', 'payment', ?, ?, ?)",
      )
      .bind(crypto.randomUUID(), actorUserId, id, JSON.stringify({ reason }), now),
  ]);

  return getPaymentById(db, id);
}

export interface PaymentsSummary {
  totalAmount: number;
  countByMethod: Record<PaymentMethod, number>;
  amountByMethod: Record<PaymentMethod, number>;
  voidedCount: number;
}

function emptyMethodRecord(): Record<PaymentMethod, number> {
  return { cash: 0, transfer: 0, card_in_person: 0, other: 0 };
}

// Reporte básico para el panel administrativo (CLAUDE.md sección 6.7): total cobrado
// y desglose por método en el período, excluyendo pagos anulados.
export async function getPaymentsSummary(
  db: D1Database,
  dateFrom?: string,
  dateTo?: string,
): Promise<PaymentsSummary> {
  const conditions: string[] = [];
  const queryParams: unknown[] = [];
  if (dateFrom) {
    conditions.push('payment_date >= ?');
    queryParams.push(dateFrom);
  }
  if (dateTo) {
    conditions.push('payment_date <= ?');
    queryParams.push(`${dateTo}T23:59:59.999Z`);
  }
  const dateFilter = conditions.length > 0 ? `${conditions.join(' AND ')} AND ` : '';

  const completedRows = await db
    .prepare(`SELECT method, amount FROM payments WHERE ${dateFilter}status = 'completed'`)
    .bind(...queryParams)
    .all<{ method: string; amount: number }>();

  const voidedCountRow = await db
    .prepare(`SELECT COUNT(*) as c FROM payments WHERE ${dateFilter}status = 'voided'`)
    .bind(...queryParams)
    .first<{ c: number }>();

  const countByMethod = emptyMethodRecord();
  const amountByMethod = emptyMethodRecord();
  let totalAmount = 0;

  for (const row of completedRows.results) {
    const method = row.method as PaymentMethod;
    countByMethod[method] += 1;
    amountByMethod[method] += row.amount;
    totalAmount += row.amount;
  }

  return { totalAmount, countByMethod, amountByMethod, voidedCount: voidedCountRow?.c ?? 0 };
}
