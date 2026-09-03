import { addDays } from './dates';
import { getMembershipPlanById, type MembershipPlan } from './membership-plans-repo';

export type MembershipStatus = 'pending' | 'active' | 'expired' | 'suspended' | 'cancelled';

export interface Membership {
  id: string;
  memberId: string;
  planId: string;
  planName: string;
  startDate: string;
  endDate: string;
  priceAgreed: number;
  status: MembershipStatus;
  renewedFromId: string | null;
  expiryNoticeSentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface MembershipRow {
  id: string;
  member_id: string;
  plan_id: string;
  plan_name: string;
  start_date: string;
  end_date: string;
  price_agreed: number;
  status: string;
  renewed_from_id: string | null;
  expiry_notice_sent_at: string | null;
  created_at: string;
  updated_at: string;
}

// pending/active/expired se recalculan siempre a partir de las fechas al leer, en vez
// de depender de un job que mantenga la columna `status` al día. `suspended`/`cancelled`
// son overrides manuales (reservados; no hay endpoint para fijarlos en esta fase) y se
// respetan tal cual están guardados. `today` es la fecha (YYYY-MM-DD) en la zona horaria
// del gimnasio, no en UTC crudo.
export function computeDisplayStatus(
  storedStatus: string,
  startDate: string,
  endDate: string,
  today: string,
): MembershipStatus {
  if (storedStatus === 'suspended' || storedStatus === 'cancelled') return storedStatus;
  if (today < startDate) return 'pending';
  if (today > endDate) return 'expired';
  return 'active';
}

function computeInitialStatus(startDate: string, today: string): 'pending' | 'active' {
  return today < startDate ? 'pending' : 'active';
}

function mapMembership(row: MembershipRow, today: string): Membership {
  return {
    id: row.id,
    memberId: row.member_id,
    planId: row.plan_id,
    planName: row.plan_name,
    startDate: row.start_date,
    endDate: row.end_date,
    priceAgreed: row.price_agreed,
    status: computeDisplayStatus(row.status, row.start_date, row.end_date, today),
    renewedFromId: row.renewed_from_id,
    expiryNoticeSentAt: row.expiry_notice_sent_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const MEMBERSHIP_SELECT = `
  SELECT ms.id, ms.member_id, ms.plan_id, mp.name AS plan_name, ms.start_date, ms.end_date,
         ms.price_agreed, ms.status, ms.renewed_from_id, ms.expiry_notice_sent_at,
         ms.created_at, ms.updated_at
  FROM memberships ms
  JOIN membership_plans mp ON mp.id = ms.plan_id
`;

export async function getMembershipById(
  db: D1Database,
  id: string,
  today: string,
): Promise<Membership | null> {
  const row = await db
    .prepare(`${MEMBERSHIP_SELECT} WHERE ms.id = ?`)
    .bind(id)
    .first<MembershipRow>();
  return row ? mapMembership(row, today) : null;
}

export interface ListMembershipsParams {
  page: number;
  pageSize: number;
  memberId?: string | undefined;
  status?: MembershipStatus | undefined;
}

export interface ListMembershipsResult {
  items: Membership[];
  total: number;
  page: number;
  pageSize: number;
}

// El estado no vive tal cual en la columna (se deriva de fechas), así que filtrar por
// status y paginar correctamente requiere hacerlo en memoria tras calcularlo. Con el
// volumen esperado (~100 socios, PLAN.md sección 14) esto es aceptable; si el historial
// creciera mucho, esto debería moverse a paginación por SQL con una columna de estado
// mantenida por un job.
export async function listMemberships(
  db: D1Database,
  params: ListMembershipsParams,
  today: string,
): Promise<ListMembershipsResult> {
  const { page, pageSize, memberId, status } = params;

  const whereClause = memberId ? 'WHERE ms.member_id = ?' : '';
  const queryParams = memberId ? [memberId] : [];

  const result = await db
    .prepare(`${MEMBERSHIP_SELECT} ${whereClause} ORDER BY ms.start_date DESC`)
    .bind(...queryParams)
    .all<MembershipRow>();

  let items = result.results.map((row) => mapMembership(row, today));
  if (status) items = items.filter((membership) => membership.status === status);

  const total = items.length;
  const offset = (page - 1) * pageSize;

  return { items: items.slice(offset, offset + pageSize), total, page, pageSize };
}

export interface CreateMembershipInput {
  memberId: string;
  planId: string;
  startDate?: string | undefined;
  price: number; // ya resuelto por la ruta (precio del plan, o el override si el actor es admin)
}

// Una asignación siempre crea un registro nuevo (CLAUDE.md sección 6.3): nunca hay
// UPDATE de fechas/precio sobre una membresía existente.
export async function createMembership(
  db: D1Database,
  input: CreateMembershipInput,
  plan: MembershipPlan,
  actorUserId: string,
  today: string,
): Promise<Membership> {
  const startDate = input.startDate ?? today;
  const endDate = addDays(startDate, plan.durationDays);
  const status = computeInitialStatus(startDate, today);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  await db.batch([
    db
      .prepare(
        'INSERT INTO memberships (id, member_id, plan_id, start_date, end_date, price_agreed, status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(
        id,
        input.memberId,
        input.planId,
        startDate,
        endDate,
        input.price,
        status,
        actorUserId,
        now,
        now,
      ),
    db
      .prepare(
        "INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, metadata, created_at) VALUES (?, ?, 'membership.create', 'membership', ?, ?, ?)",
      )
      .bind(
        crypto.randomUUID(),
        actorUserId,
        id,
        JSON.stringify({ planId: input.planId, price: input.price }),
        now,
      ),
  ]);

  const created = await getMembershipById(db, id, today);
  if (!created) throw new Error('No se pudo leer la membresía recién creada');
  return created;
}

export interface RenewMembershipInput {
  planId?: string | undefined;
  startDate?: string | undefined;
  price: number; // ya resuelto por la ruta
}

// Renovar SIEMPRE inserta una fila nueva con renewed_from_id apuntando a la anterior;
// la membresía anterior no se toca (conserva su historial intacto).
export async function renewMembership(
  db: D1Database,
  membershipId: string,
  input: RenewMembershipInput,
  actorUserId: string,
  today: string,
): Promise<Membership | null> {
  const existing = await getMembershipById(db, membershipId, today);
  if (!existing) return null;

  const planId = input.planId ?? existing.planId;
  const plan = await getMembershipPlanById(db, planId);
  if (!plan) throw new Error('El plan indicado no existe');

  const startDate = input.startDate ?? addDays(existing.endDate, 1);
  const endDate = addDays(startDate, plan.durationDays);
  const status = computeInitialStatus(startDate, today);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  await db.batch([
    db
      .prepare(
        'INSERT INTO memberships (id, member_id, plan_id, start_date, end_date, price_agreed, status, renewed_from_id, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(
        id,
        existing.memberId,
        planId,
        startDate,
        endDate,
        input.price,
        status,
        existing.id,
        actorUserId,
        now,
        now,
      ),
    db
      .prepare(
        "INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, metadata, created_at) VALUES (?, ?, 'membership.renew', 'membership', ?, ?, ?)",
      )
      .bind(
        crypto.randomUUID(),
        actorUserId,
        id,
        JSON.stringify({ renewedFromId: existing.id, planId, price: input.price }),
        now,
      ),
  ]);

  const created = await getMembershipById(db, id, today);
  if (!created) throw new Error('No se pudo leer la membresía renovada');
  return created;
}

export interface MembershipExpiryCandidate {
  membershipId: string;
  memberEmail: string;
  memberFullName: string;
  endDate: string;
  planName: string;
}

// Membresías por vencer que todavía no recibieron el aviso (PLAN.md secciones 4 y 10).
// Se compara contra la columna `status` cruda (no la calculada) solo para excluir
// overrides manuales explícitos; el rango de fechas ya garantiza que estén vigentes.
export async function findMembershipsNeedingExpiryNotice(
  db: D1Database,
  today: string,
  noticeWindowDays: number,
): Promise<MembershipExpiryCandidate[]> {
  const noticeDate = addDays(today, noticeWindowDays);

  const result = await db
    .prepare(
      `SELECT ms.id AS membership_id, u.email AS member_email, u.full_name AS member_full_name,
              ms.end_date, mp.name AS plan_name
       FROM memberships ms
       JOIN members m ON m.id = ms.member_id
       JOIN users u ON u.id = m.user_id
       JOIN membership_plans mp ON mp.id = ms.plan_id
       WHERE ms.expiry_notice_sent_at IS NULL
         AND ms.status NOT IN ('cancelled', 'suspended')
         AND ms.end_date >= ?
         AND ms.end_date <= ?`,
    )
    .bind(today, noticeDate)
    .all<{
      membership_id: string;
      member_email: string;
      member_full_name: string;
      end_date: string;
      plan_name: string;
    }>();

  return result.results.map((row) => ({
    membershipId: row.membership_id,
    memberEmail: row.member_email,
    memberFullName: row.member_full_name,
    endDate: row.end_date,
    planName: row.plan_name,
  }));
}

// Marca el envío para no duplicarlo en corridas posteriores del job (idempotencia).
export async function markExpiryNoticeSent(
  db: D1Database,
  membershipId: string,
  sentAt: string,
): Promise<void> {
  await db
    .prepare('UPDATE memberships SET expiry_notice_sent_at = ? WHERE id = ?')
    .bind(sentAt, membershipId)
    .run();
}

export interface MembershipExpiredCandidate {
  membershipId: string;
  memberEmail: string;
  memberFullName: string;
  endDate: string;
  planName: string;
}

// Membresías que vencieron recientemente y todavía no recibieron el aviso de
// vencimiento (Fase 9). `lookbackDays` acota la ventana hacia atrás (evita un envío
// masivo de una sola vez sobre membresías vencidas desde antes de existir esta
// función; con la corrida diaria del cron, "ayer" es suficiente en operación normal).
export async function findRecentlyExpiredMemberships(
  db: D1Database,
  today: string,
  lookbackDays: number,
): Promise<MembershipExpiredCandidate[]> {
  const earliestDate = addDays(today, -lookbackDays);
  const latestDate = addDays(today, -1); // si vence hoy, todavía no cuenta como vencida

  const result = await db
    .prepare(
      `SELECT ms.id AS membership_id, u.email AS member_email, u.full_name AS member_full_name,
              ms.end_date, mp.name AS plan_name
       FROM memberships ms
       JOIN members m ON m.id = ms.member_id
       JOIN users u ON u.id = m.user_id
       JOIN membership_plans mp ON mp.id = ms.plan_id
       WHERE ms.expired_notice_sent_at IS NULL
         AND ms.status NOT IN ('cancelled', 'suspended')
         AND ms.end_date >= ?
         AND ms.end_date <= ?`,
    )
    .bind(earliestDate, latestDate)
    .all<{
      membership_id: string;
      member_email: string;
      member_full_name: string;
      end_date: string;
      plan_name: string;
    }>();

  return result.results.map((row) => ({
    membershipId: row.membership_id,
    memberEmail: row.member_email,
    memberFullName: row.member_full_name,
    endDate: row.end_date,
    planName: row.plan_name,
  }));
}

export async function markExpiredNoticeSent(
  db: D1Database,
  membershipId: string,
  sentAt: string,
): Promise<void> {
  await db
    .prepare('UPDATE memberships SET expired_notice_sent_at = ? WHERE id = ?')
    .bind(sentAt, membershipId)
    .run();
}
