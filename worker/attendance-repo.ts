import { addDays } from './dates';

export type AttendanceSource = 'manual' | 'qr';

export interface AttendanceRecord {
  id: string;
  memberId: string;
  memberFullName: string;
  checkedInAt: string;
  source: AttendanceSource;
  recordedBy: string | null;
}

interface AttendanceRow {
  id: string;
  member_id: string;
  member_full_name: string;
  checked_in_at: string;
  source: string;
  recorded_by: string | null;
}

function mapAttendance(row: AttendanceRow): AttendanceRecord {
  return {
    id: row.id,
    memberId: row.member_id,
    memberFullName: row.member_full_name,
    checkedInAt: row.checked_in_at,
    source: row.source as AttendanceSource,
    recordedBy: row.recorded_by,
  };
}

const ATTENDANCE_SELECT = `
  SELECT a.id, a.member_id, u.full_name AS member_full_name, a.checked_in_at, a.source, a.recorded_by
  FROM attendance a
  JOIN members m ON m.id = a.member_id
  JOIN users u ON u.id = m.user_id
`;

export async function getAttendanceById(
  db: D1Database,
  id: string,
): Promise<AttendanceRecord | null> {
  const row = await db
    .prepare(`${ATTENDANCE_SELECT} WHERE a.id = ?`)
    .bind(id)
    .first<AttendanceRow>();
  return row ? mapAttendance(row) : null;
}

// Ventana de prevención de duplicados (PLAN.md sección 4, decidida por el usuario: 1 hora).
export const DUPLICATE_WINDOW_MINUTES = 60;

async function findRecentAttendance(
  db: D1Database,
  memberId: string,
  sinceIso: string,
): Promise<AttendanceRecord | null> {
  const row = await db
    .prepare(
      `${ATTENDANCE_SELECT} WHERE a.member_id = ? AND a.checked_in_at >= ? ORDER BY a.checked_in_at DESC LIMIT 1`,
    )
    .bind(memberId, sinceIso)
    .first<AttendanceRow>();
  return row ? mapAttendance(row) : null;
}

export interface CreateAttendanceInput {
  memberId: string;
  checkedInAt?: string | undefined;
  recordedBy: string;
}

export type CreateAttendanceResult =
  | { kind: 'created'; attendance: AttendanceRecord }
  | { kind: 'duplicate'; lastCheckedInAt: string };

// La asistencia es un evento inmutable (sin updated_at ni edición posterior —
// CLAUDE.md sección 7). Antes de insertar, se verifica que no haya un registro del
// mismo socio dentro de la ventana de duplicados.
export async function createAttendance(
  db: D1Database,
  input: CreateAttendanceInput,
): Promise<CreateAttendanceResult> {
  const checkedInAt = input.checkedInAt ?? new Date().toISOString();
  const windowStart = new Date(
    new Date(checkedInAt).getTime() - DUPLICATE_WINDOW_MINUTES * 60_000,
  ).toISOString();

  const recent = await findRecentAttendance(db, input.memberId, windowStart);
  if (recent) {
    return { kind: 'duplicate', lastCheckedInAt: recent.checkedInAt };
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db
    .prepare(
      'INSERT INTO attendance (id, member_id, checked_in_at, source, recorded_by, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .bind(id, input.memberId, checkedInAt, 'manual', input.recordedBy, now)
    .run();

  const created = await getAttendanceById(db, id);
  if (!created) throw new Error('No se pudo leer la asistencia recién creada');
  return { kind: 'created', attendance: created };
}

export interface ListAttendanceParams {
  page: number;
  pageSize: number;
  memberId?: string | undefined;
  dateFrom?: string | undefined; // YYYY-MM-DD, inclusive
  dateTo?: string | undefined; // YYYY-MM-DD, inclusive
}

export interface ListAttendanceResult {
  items: AttendanceRecord[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listAttendance(
  db: D1Database,
  params: ListAttendanceParams,
): Promise<ListAttendanceResult> {
  const { page, pageSize, memberId, dateFrom, dateTo } = params;
  const offset = (page - 1) * pageSize;

  const conditions: string[] = [];
  const queryParams: unknown[] = [];
  if (memberId) {
    conditions.push('a.member_id = ?');
    queryParams.push(memberId);
  }
  if (dateFrom) {
    conditions.push('a.checked_in_at >= ?');
    queryParams.push(dateFrom);
  }
  if (dateTo) {
    conditions.push('a.checked_in_at <= ?');
    queryParams.push(`${dateTo}T23:59:59.999Z`);
  }
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countRow = await db
    .prepare(`SELECT COUNT(*) as total FROM attendance a ${whereClause}`)
    .bind(...queryParams)
    .first<{ total: number }>();

  const result = await db
    .prepare(`${ATTENDANCE_SELECT} ${whereClause} ORDER BY a.checked_in_at DESC LIMIT ? OFFSET ?`)
    .bind(...queryParams, pageSize, offset)
    .all<AttendanceRow>();

  return { items: result.results.map(mapAttendance), total: countRow?.total ?? 0, page, pageSize };
}

export interface AttendanceSummary {
  today: number;
  last30Days: number;
}

// Resumen diario y mensual (CLAUDE.md sección 6.5). `today` es la fecha en la zona
// horaria del gimnasio (no UTC crudo) — ver worker/gym-settings-repo.ts.
export async function getAttendanceSummary(
  db: D1Database,
  today: string,
): Promise<AttendanceSummary> {
  const todayStart = `${today}T00:00:00.000Z`;
  const todayEnd = `${addDays(today, 1)}T00:00:00.000Z`;
  const monthStart = `${addDays(today, -29)}T00:00:00.000Z`;

  const todayRow = await db
    .prepare('SELECT COUNT(*) as c FROM attendance WHERE checked_in_at >= ? AND checked_in_at < ?')
    .bind(todayStart, todayEnd)
    .first<{ c: number }>();

  const monthRow = await db
    .prepare('SELECT COUNT(*) as c FROM attendance WHERE checked_in_at >= ? AND checked_in_at < ?')
    .bind(monthStart, todayEnd)
    .first<{ c: number }>();

  return { today: todayRow?.c ?? 0, last30Days: monthRow?.c ?? 0 };
}
