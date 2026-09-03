import { makeUnclaimedClerkId } from './users-repo';

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
}

export interface MemberSummary {
  id: string;
  memberCode: string;
  fullName: string;
  email: string;
  phone: string | null;
  isActive: boolean;
}

export interface CreateMemberInput {
  fullName: string;
  email: string;
  phone?: string | undefined;
  birthDate?: string | undefined;
  joinDate?: string | undefined;
  notes?: string | undefined;
}

export interface UpdateMemberInput {
  fullName?: string | undefined;
  email?: string | undefined;
  phone?: string | null | undefined;
  birthDate?: string | null | undefined;
  notes?: string | null | undefined;
}

export interface ListMembersParams {
  page: number;
  pageSize: number;
  q?: string | undefined;
}

export interface ListMembersResult {
  items: MemberSummary[];
  total: number;
  page: number;
  pageSize: number;
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
  };
}

const MEMBER_DETAIL_SELECT = `
  SELECT m.id, m.member_code, m.phone, m.birth_date, m.join_date, m.is_active, m.notes,
         m.created_at, m.updated_at, u.full_name, u.email
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
}

// Búsqueda por nombre, correo, teléfono o código de socio (PLAN.md sección 6.2), paginada.
export async function listMembers(
  db: D1Database,
  params: ListMembersParams,
): Promise<ListMembersResult> {
  const { page, pageSize, q } = params;
  const offset = (page - 1) * pageSize;
  const trimmedQuery = q?.trim();

  const whereClause = trimmedQuery
    ? 'WHERE u.full_name LIKE ? OR u.email LIKE ? OR m.phone LIKE ? OR m.member_code LIKE ?'
    : '';
  const likeParam = `%${trimmedQuery}%`;
  const whereParams = trimmedQuery ? [likeParam, likeParam, likeParam, likeParam] : [];

  const countRow = await db
    .prepare(
      `SELECT COUNT(*) as total FROM members m JOIN users u ON u.id = m.user_id ${whereClause}`,
    )
    .bind(...whereParams)
    .first<{ total: number }>();

  const listResult = await db
    .prepare(
      `SELECT m.id, m.member_code, m.phone, u.full_name, u.email, m.is_active
       FROM members m
       JOIN users u ON u.id = m.user_id
       ${whereClause}
       ORDER BY u.full_name ASC
       LIMIT ? OFFSET ?`,
    )
    .bind(...whereParams, pageSize, offset)
    .all<MemberListRow>();

  const items: MemberSummary[] = listResult.results.map((row) => ({
    id: row.id,
    memberCode: row.member_code,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    isActive: row.is_active === 1,
  }));

  return { items, total: countRow?.total ?? 0, page, pageSize };
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
        'INSERT INTO members (id, user_id, member_code, phone, birth_date, join_date, is_active, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)',
      )
      .bind(
        memberId,
        userId,
        memberCode,
        input.phone ?? null,
        input.birthDate ?? null,
        joinDate,
        input.notes ?? null,
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
    patch.phone !== undefined || patch.birthDate !== undefined || patch.notes !== undefined;
  if (memberFieldsChanged) {
    const phone = patch.phone !== undefined ? patch.phone : current.phone;
    const birthDate = patch.birthDate !== undefined ? patch.birthDate : current.birthDate;
    const notes = patch.notes !== undefined ? patch.notes : current.notes;
    statements.push(
      db
        .prepare('UPDATE members SET phone = ?, birth_date = ?, notes = ? WHERE id = ?')
        .bind(phone, birthDate, notes, id),
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
