import { makeUnclaimedClerkId } from './users-repo';
import { addDays } from './dates';
import { computeDisplayStatus } from './memberships-repo';
import { EXPIRY_NOTICE_WINDOW_DAYS } from './jobs/expiry-notices';

export interface MemberDetail {
  id: string;
  memberCode: string;
  fullName: string;
  email: string;
  phone: string | null;
  birthDate: string | null;
  joinDate: string;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  // Cédula/DNI, para el check-in de kiosco (buscar por identificación). Opcional:
  // los socios existentes no lo tienen cargado hasta que alguien lo complete.
  nationalId: string | null;
}

// Estado de membresía tal como se muestra en la lista de socios (filtro por pestañas).
// Distinto de MembershipStatus (memberships-repo.ts): agrega 'expiring' (activa y más
// próxima a vencer, mismo umbral que el aviso por correo) y 'none' (sin membresía
// asignada todavía), y se calcula solo a partir de la membresía más reciente del socio.
export type MemberMembershipStatus =
  'none' | 'pending' | 'active' | 'expiring' | 'expired' | 'suspended' | 'cancelled';

export interface MemberSummary {
  id: string;
  memberCode: string;
  fullName: string;
  email: string;
  phone: string | null;
  isActive: boolean;
  membershipStatus: MemberMembershipStatus;
  // Deuda de la membresía más reciente (0 si no tiene ninguna o ya está saldada).
  // Independiente de membershipStatus: un socio puede estar "Activo" y tener deuda.
  debt: number;
}

export interface CreateMemberInput {
  fullName: string;
  email: string;
  phone?: string | undefined;
  birthDate?: string | undefined;
  joinDate?: string | undefined;
  notes?: string | undefined;
  nationalId?: string | undefined;
}

export interface UpdateMemberInput {
  fullName?: string | undefined;
  email?: string | undefined;
  phone?: string | null | undefined;
  birthDate?: string | null | undefined;
  notes?: string | null | undefined;
  nationalId?: string | null | undefined;
}

// 'debt' es una dimensión aparte de las demás (un socio "Activo" puede tener deuda):
// al filtrar por 'debt' se ignora el estado de fechas y se muestra a quien deba > 0.
export type MemberListStatusFilter = 'all' | 'active' | 'expiring' | 'expired' | 'debt';

export interface ListMembersParams {
  page: number;
  pageSize: number;
  q?: string | undefined;
  membershipStatus?: MemberListStatusFilter | undefined;
}

// Conteos por pestaña (Todos/Activos/Por vencer/Vencidos/Con deuda) sobre el mismo
// conjunto que ya coincide con la búsqueda `q`, calculados en la misma consulta que trae
// la lista para no gastar lecturas de D1 extra por cada pestaña.
export interface MemberStatusCounts {
  all: number;
  active: number;
  expiring: number;
  expired: number;
  debt: number;
}

export interface ListMembersResult {
  items: MemberSummary[];
  total: number;
  page: number;
  pageSize: number;
  statusCounts: MemberStatusCounts;
}

const MEMBER_CODE_PREFIX = 'SOC-';
const MEMBER_CODE_WIDTH = 4;

// Pura: dado el último código existente (o ninguno), calcula el siguiente.
// Separada de la consulta a D1 para poder probarla sin base de datos.
export function nextMemberCode(lastCode: string | null): string {
  const lastNumber = lastCode ? Number.parseInt(lastCode.slice(MEMBER_CODE_PREFIX.length), 10) : 0;
  const next = (Number.isFinite(lastNumber) ? lastNumber : 0) + 1;
  return `${MEMBER_CODE_PREFIX}${String(next).padStart(MEMBER_CODE_WIDTH, '0')}`;
}

async function generateNextMemberCode(db: D1Database): Promise<string> {
  const row = await db
    .prepare('SELECT member_code FROM members ORDER BY member_code DESC LIMIT 1')
    .first<{ member_code: string }>();
  return nextMemberCode(row?.member_code ?? null);
}

interface MemberDetailRow {
  id: string;
  member_code: string;
  phone: string | null;
  birth_date: string | null;
  join_date: string;
  is_active: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  full_name: string;
  email: string;
  national_id: string | null;
}

function mapDetail(row: MemberDetailRow): MemberDetail {
  return {
    id: row.id,
    memberCode: row.member_code,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    birthDate: row.birth_date,
    joinDate: row.join_date,
    isActive: row.is_active === 1,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    nationalId: row.national_id,
  };
}

const MEMBER_DETAIL_SELECT = `
  SELECT m.id, m.member_code, m.phone, m.birth_date, m.join_date, m.is_active, m.notes,
         m.created_at, m.updated_at, m.national_id, u.full_name, u.email
  FROM members m
  JOIN users u ON u.id = m.user_id
`;

export async function getMemberById(db: D1Database, id: string): Promise<MemberDetail | null> {
  const row = await db
    .prepare(`${MEMBER_DETAIL_SELECT} WHERE m.id = ?`)
    .bind(id)
    .first<MemberDetailRow>();
  return row ? mapDetail(row) : null;
}

// Búsqueda para el check-in de kiosco (PLAN.md — módulo de asistencia): por cédula/DNI
// exacta en vez de recorrer la lista. `nationalId` es opcional en members, así que un
// socio sin ese dato cargado nunca puede "encontrarse" por accidente con un WHERE = ''.
export async function getMemberByNationalId(
  db: D1Database,
  nationalId: string,
): Promise<MemberDetail | null> {
  const row = await db
    .prepare(`${MEMBER_DETAIL_SELECT} WHERE m.national_id = ?`)
    .bind(nationalId)
    .first<MemberDetailRow>();
  return row ? mapDetail(row) : null;
}

// Resuelve el perfil de socio a partir del id de `users` (para endpoints de autoservicio
// como GET /api/me/attendance — CLAUDE.md sección 5, "un socio nunca ve datos de otro").
export async function getMemberByUserId(
  db: D1Database,
  userId: string,
): Promise<MemberDetail | null> {
  const row = await db
    .prepare(`${MEMBER_DETAIL_SELECT} WHERE m.user_id = ?`)
    .bind(userId)
    .first<MemberDetailRow>();
  return row ? mapDetail(row) : null;
}

interface MemberListRow {
  id: string;
  member_code: string;
  phone: string | null;
  full_name: string;
  email: string;
  is_active: number;
  ms_status: string | null;
  ms_start_date: string | null;
  ms_end_date: string | null;
  ms_price_agreed: number | null;
  ms_amount_paid: number;
}

// Deriva el estado de membresía de la lista de socios a partir de su membresía más
// reciente (o 'none' si nunca tuvo una). Reutiliza computeDisplayStatus para no duplicar
// la regla pending/active/expired, y añade 'expiring' con el mismo umbral que el aviso
// de vencimiento por correo (EXPIRY_NOTICE_WINDOW_DAYS) para que la pestaña "Por vencer"
// de la lista coincida con cuándo se le avisa al socio.
export function computeMemberListStatus(
  row: Pick<MemberListRow, 'ms_status' | 'ms_start_date' | 'ms_end_date'>,
  today: string,
): MemberMembershipStatus {
  if (!row.ms_status || !row.ms_start_date || !row.ms_end_date) return 'none';
  const status = computeDisplayStatus(row.ms_status, row.ms_start_date, row.ms_end_date, today);
  if (status === 'active' && row.ms_end_date <= addDays(today, EXPIRY_NOTICE_WINDOW_DAYS)) {
    return 'expiring';
  }
  return status;
}

// Misma cuenta que Membership.debt (memberships-repo.ts), pero a partir de la fila ya
// traída en la lista de socios en vez de una consulta aparte.
function computeMemberListDebt(row: Pick<MemberListRow, 'ms_price_agreed' | 'ms_amount_paid'>) {
  if (row.ms_price_agreed === null) return 0;
  return Math.max(0, row.ms_price_agreed - row.ms_amount_paid);
}

// Búsqueda por nombre, correo, teléfono o código de socio (PLAN.md sección 6.2), paginada,
// con filtro opcional por estado de membresía (pestañas Todos/Activos/Por vencer/Vencidos).
// El estado no vive en una columna (se deriva de fechas, igual que en listMemberships), así
// que — mismo criterio ya aceptado ahí — se trae la membresía más reciente de cada socio
// que coincide con la búsqueda en una sola consulta (sin límite de página todavía) y el
// filtro/paginado por estado se resuelve en memoria. Aceptable al volumen esperado
// (~100 socios, PLAN.md sección 14); los conteos por pestaña salen de la misma pasada,
// sin lecturas adicionales a D1.
export async function listMembers(
  db: D1Database,
  params: ListMembersParams,
  today: string,
): Promise<ListMembersResult> {
  const { page, pageSize, q, membershipStatus } = params;
  const trimmedQuery = q?.trim();

  const whereClause = trimmedQuery
    ? 'WHERE u.full_name LIKE ? OR u.email LIKE ? OR m.phone LIKE ? OR m.member_code LIKE ? OR m.national_id LIKE ?'
    : '';
  const likeParam = `%${trimmedQuery}%`;
  const whereParams = trimmedQuery ? [likeParam, likeParam, likeParam, likeParam, likeParam] : [];

  const listResult = await db
    .prepare(
      `SELECT m.id, m.member_code, m.phone, u.full_name, u.email, m.is_active,
              ms.status AS ms_status, ms.start_date AS ms_start_date, ms.end_date AS ms_end_date,
              ms.price_agreed AS ms_price_agreed,
              COALESCE(
                (SELECT SUM(p.amount) FROM payments p
                 WHERE p.membership_id = ms.id AND p.status = 'completed'),
                0
              ) AS ms_amount_paid
       FROM members m
       JOIN users u ON u.id = m.user_id
       LEFT JOIN memberships ms ON ms.id = (
         SELECT id FROM memberships WHERE member_id = m.id ORDER BY start_date DESC LIMIT 1
       )
       ${whereClause}
       ORDER BY u.full_name ASC`,
    )
    .bind(...whereParams)
    .all<MemberListRow>();

  const withStatus: MemberSummary[] = listResult.results.map((row) => ({
    id: row.id,
    memberCode: row.member_code,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    isActive: row.is_active === 1,
    membershipStatus: computeMemberListStatus(row, today),
    debt: computeMemberListDebt(row),
  }));

  const statusCounts: MemberStatusCounts = {
    all: withStatus.length,
    active: 0,
    expiring: 0,
    expired: 0,
    debt: 0,
  };
  for (const item of withStatus) {
    if (item.membershipStatus === 'active') statusCounts.active += 1;
    else if (item.membershipStatus === 'expiring') statusCounts.expiring += 1;
    else if (item.membershipStatus === 'expired') statusCounts.expired += 1;
    if (item.debt > 0) statusCounts.debt += 1;
  }

  const filtered =
    membershipStatus && membershipStatus !== 'all'
      ? withStatus.filter((item) =>
          membershipStatus === 'debt' ? item.debt > 0 : item.membershipStatus === membershipStatus,
        )
      : withStatus;

  const offset = (page - 1) * pageSize;
  const items = filtered.slice(offset, offset + pageSize);

  return { items, total: filtered.length, page, pageSize, statusCounts };
}

// Crea el socio: fila en users (rol member, sin cuenta de Clerk todavía) + fila en
// members + auditoría, en un solo batch atómico (CLAUDE.md sección 7, D1 usa db.batch()
// en vez de BEGIN/COMMIT interactivo).
export async function createMember(
  db: D1Database,
  input: CreateMemberInput,
  actorUserId: string,
): Promise<MemberDetail> {
  const now = new Date().toISOString();
  const userId = crypto.randomUUID();
  const memberId = crypto.randomUUID();
  const memberCode = await generateNextMemberCode(db);
  const joinDate = input.joinDate ?? (now.slice(0, 10) as string);

  await db.batch([
    db
      .prepare(
        'INSERT INTO users (id, clerk_user_id, email, full_name, role, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)',
      )
      .bind(userId, makeUnclaimedClerkId(userId), input.email, input.fullName, 'member', now, now),
    db
      .prepare(
        'INSERT INTO members (id, user_id, member_code, phone, birth_date, join_date, is_active, notes, national_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)',
      )
      .bind(
        memberId,
        userId,
        memberCode,
        input.phone ?? null,
        input.birthDate ?? null,
        joinDate,
        input.notes ?? null,
        input.nationalId ?? null,
        now,
        now,
      ),
    db
      .prepare(
        "INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, metadata, created_at) VALUES (?, ?, 'member.create', 'member', ?, ?, ?)",
      )
      .bind(crypto.randomUUID(), actorUserId, memberId, JSON.stringify({ memberCode }), now),
  ]);

  const created = await getMemberById(db, memberId);
  if (!created) throw new Error('No se pudo leer el socio recién creado');
  return created;
}

// Edición parcial: solo escribe las tablas cuyos campos vinieron en el patch.
// No permite cambiar member_code ni join_date (fuera del alcance de la Fase 4).
export async function updateMember(
  db: D1Database,
  id: string,
  patch: UpdateMemberInput,
  actorUserId: string,
): Promise<MemberDetail | null> {
  const current = await getMemberById(db, id);
  if (!current) return null;

  const userRow = await db
    .prepare('SELECT user_id FROM members WHERE id = ?')
    .bind(id)
    .first<{ user_id: string }>();
  if (!userRow) return null;

  const now = new Date().toISOString();
  const statements = [];

  if (patch.fullName !== undefined || patch.email !== undefined) {
    const fullName = patch.fullName ?? current.fullName;
    const email = patch.email ?? current.email;
    statements.push(
      db
        .prepare('UPDATE users SET full_name = ?, email = ? WHERE id = ?')
        .bind(fullName, email, userRow.user_id),
    );
  }

  const memberFieldsChanged =
    patch.phone !== undefined ||
    patch.birthDate !== undefined ||
    patch.notes !== undefined ||
    patch.nationalId !== undefined;
  if (memberFieldsChanged) {
    const phone = patch.phone !== undefined ? patch.phone : current.phone;
    const birthDate = patch.birthDate !== undefined ? patch.birthDate : current.birthDate;
    const notes = patch.notes !== undefined ? patch.notes : current.notes;
    const nationalId = patch.nationalId !== undefined ? patch.nationalId : current.nationalId;
    statements.push(
      db
        .prepare(
          'UPDATE members SET phone = ?, birth_date = ?, notes = ?, national_id = ? WHERE id = ?',
        )
        .bind(phone, birthDate, notes, nationalId, id),
    );
  }

  if (statements.length === 0) return current;

  statements.push(
    db
      .prepare(
        "INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, metadata, created_at) VALUES (?, ?, 'member.update', 'member', ?, ?, ?)",
      )
      .bind(
        crypto.randomUUID(),
        actorUserId,
        id,
        JSON.stringify({ fields: Object.keys(patch) }),
        now,
      ),
  );

  await db.batch(statements);

  return getMemberById(db, id);
}

// Desactivación (CLAUDE.md sección 6.2 y 5): nunca se borra físicamente. Además de
// members.is_active, se desactiva también users.is_active para que esa persona ya no
// pueda iniciar sesión ni consultar su membresía/asistencia/rutina.
export async function deactivateMember(
  db: D1Database,
  id: string,
  actorUserId: string,
): Promise<MemberDetail | null> {
  const current = await getMemberById(db, id);
  if (!current) return null;
  if (!current.isActive) return current; // idempotente: ya estaba desactivado

  const userRow = await db
    .prepare('SELECT user_id FROM members WHERE id = ?')
    .bind(id)
    .first<{ user_id: string }>();
  if (!userRow) return null;

  const now = new Date().toISOString();

  await db.batch([
    db.prepare('UPDATE members SET is_active = 0 WHERE id = ?').bind(id),
    db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').bind(userRow.user_id),
    db
      .prepare(
        "INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, metadata, created_at) VALUES (?, ?, 'member.deactivate', 'member', ?, NULL, ?)",
      )
      .bind(crypto.randomUUID(), actorUserId, id, now),
  ]);

  return getMemberById(db, id);
}
