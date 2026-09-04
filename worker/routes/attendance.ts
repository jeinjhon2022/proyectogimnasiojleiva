import type { Env } from '../env';
import { authenticate, requireRole } from '../authenticate';
import { errorResponse, jsonResponse, readJsonBody } from '../http';
import {
  createAttendanceSchema,
  kioskCheckInSchema,
  listAttendanceQuerySchema,
  listMyAttendanceQuerySchema,
} from '../validation/attendance';
import { createAttendance, getAttendanceSummary, listAttendance } from '../attendance-repo';
import { getGymTimezone, todayInTimezone } from '../gym-settings-repo';
import { getMemberById, getMemberByNationalId, getMemberByUserId } from '../members-repo';
import { listMemberships } from '../memberships-repo';

const STAFF_ROLES = ['admin', 'receptionist'] as const;

export async function handleListAttendance(request: Request, env: Env): Promise<Response> {
  const auth = await authenticate(request, env);
  if (auth.kind === 'unauthenticated')
    return errorResponse(401, 'UNAUTHENTICATED', 'Se requiere iniciar sesión');
  if (auth.kind === 'unauthorized' || !requireRole(auth.user, STAFF_ROLES)) {
    return errorResponse(403, 'FORBIDDEN', 'No tienes permiso para ver asistencias');
  }

  const url = new URL(request.url);
  const parsed = listAttendanceQuerySchema.safeParse({
    page: url.searchParams.get('page') ?? undefined,
    pageSize: url.searchParams.get('pageSize') ?? undefined,
    memberId: url.searchParams.get('memberId') ?? undefined,
    dateFrom: url.searchParams.get('dateFrom') ?? undefined,
    dateTo: url.searchParams.get('dateTo') ?? undefined,
  });
  if (!parsed.success) {
    return errorResponse(
      422,
      'VALIDATION_ERROR',
      parsed.error.issues[0]?.message ?? 'Parámetros inválidos',
    );
  }

  const result = await listAttendance(env.DB, parsed.data);
  return jsonResponse(result);
}

export async function handleGetAttendanceSummary(request: Request, env: Env): Promise<Response> {
  const auth = await authenticate(request, env);
  if (auth.kind === 'unauthenticated')
    return errorResponse(401, 'UNAUTHENTICATED', 'Se requiere iniciar sesión');
  if (auth.kind === 'unauthorized' || !requireRole(auth.user, STAFF_ROLES)) {
    return errorResponse(403, 'FORBIDDEN', 'No tienes permiso para ver el resumen de asistencia');
  }

  const timezone = await getGymTimezone(env.DB);
  const today = todayInTimezone(timezone);
  const summary = await getAttendanceSummary(env.DB, today);
  return jsonResponse(summary);
}

export async function handleCreateAttendance(request: Request, env: Env): Promise<Response> {
  const auth = await authenticate(request, env);
  if (auth.kind === 'unauthenticated')
    return errorResponse(401, 'UNAUTHENTICATED', 'Se requiere iniciar sesión');
  if (auth.kind === 'unauthorized' || !requireRole(auth.user, STAFF_ROLES)) {
    return errorResponse(403, 'FORBIDDEN', 'No tienes permiso para registrar asistencia');
  }

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = createAttendanceSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return errorResponse(
      422,
      'VALIDATION_ERROR',
      parsed.error.issues[0]?.message ?? 'Datos inválidos',
    );
  }

  const member = await getMemberById(env.DB, parsed.data.memberId);
  if (!member) return errorResponse(404, 'MEMBER_NOT_FOUND', 'No se encontró el socio indicado');
  if (!member.isActive) return errorResponse(409, 'MEMBER_INACTIVE', 'El socio está desactivado');

  const result = await createAttendance(env.DB, {
    memberId: parsed.data.memberId,
    checkedInAt: parsed.data.checkedInAt,
    recordedBy: auth.user.id,
  });

  if (result.kind === 'duplicate') {
    return errorResponse(
      409,
      'DUPLICATE_ATTENDANCE',
      `Ya se registró una asistencia reciente para este socio (${result.lastCheckedInAt})`,
    );
  }

  return jsonResponse(result.attendance, { status: 201 });
}

// POST /api/attendance/check-in: check-in de kiosco por cédula/DNI (un solo campo,
// pensado para un teclado numérico en pantalla) en vez de elegir al socio de una lista.
// A diferencia de POST /api/attendance (usada desde la fila del socio en el panel de
// socios), aquí sí se exige que la membresía esté vigente — es el flujo de acceso real
// al gimnasio, no un registro administrativo retroactivo.
export async function handleKioskCheckIn(request: Request, env: Env): Promise<Response> {
  const auth = await authenticate(request, env);
  if (auth.kind === 'unauthenticated')
    return errorResponse(401, 'UNAUTHENTICATED', 'Se requiere iniciar sesión');
  if (auth.kind === 'unauthorized' || !requireRole(auth.user, STAFF_ROLES)) {
    return errorResponse(403, 'FORBIDDEN', 'No tienes permiso para registrar ingresos');
  }

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = kioskCheckInSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return errorResponse(
      422,
      'VALIDATION_ERROR',
      parsed.error.issues[0]?.message ?? 'Datos inválidos',
    );
  }

  const member = await getMemberByNationalId(env.DB, parsed.data.nationalId);
  if (!member) {
    return errorResponse(404, 'MEMBER_NOT_FOUND', 'No se encontró un socio con esa identificación');
  }
  if (!member.isActive) return errorResponse(409, 'MEMBER_INACTIVE', 'El socio está desactivado');

  const timezone = await getGymTimezone(env.DB);
  const today = todayInTimezone(timezone);
  const memberships = await listMemberships(
    env.DB,
    { memberId: member.id, page: 1, pageSize: 1 },
    today,
  );
  const latest = memberships.items[0] ?? null;

  if (!latest) {
    return errorResponse(
      409,
      'NO_MEMBERSHIP',
      `${member.fullName} no tiene una membresía asignada`,
    );
  }
  if (latest.status !== 'active') {
    const reason =
      latest.status === 'pending'
        ? `su membresía todavía no empieza (desde ${latest.startDate})`
        : `su membresía "${latest.planName}" está ${
            { expired: 'vencida', suspended: 'suspendida', cancelled: 'cancelada' }[latest.status]
          }`;
    return errorResponse(409, 'MEMBERSHIP_NOT_ACTIVE', `${member.fullName}: ${reason}`);
  }

  const result = await createAttendance(env.DB, { memberId: member.id, recordedBy: auth.user.id });
  if (result.kind === 'duplicate') {
    return errorResponse(
      409,
      'DUPLICATE_ATTENDANCE',
      `${member.fullName} ya registró un ingreso reciente (${result.lastCheckedInAt})`,
    );
  }

  return jsonResponse(
    {
      attendance: result.attendance,
      member: { id: member.id, fullName: member.fullName, memberCode: member.memberCode },
      membership: { planName: latest.planName, endDate: latest.endDate },
    },
    { status: 201 },
  );
}

// GET /api/me/attendance: el socio solo ve su propio historial; memberId nunca viene
// del cliente (CLAUDE.md sección 5, "un socio nunca consulta datos de otro socio").
export async function handleGetMyAttendance(request: Request, env: Env): Promise<Response> {
  const auth = await authenticate(request, env);
  if (auth.kind === 'unauthenticated')
    return errorResponse(401, 'UNAUTHENTICATED', 'Se requiere iniciar sesión');
  if (auth.kind === 'unauthorized') return errorResponse(403, 'FORBIDDEN', 'No tienes permiso');

  const member = await getMemberByUserId(env.DB, auth.user.id);
  if (!member)
    return errorResponse(
      404,
      'MEMBER_NOT_FOUND',
      'No se encontró un perfil de socio para tu cuenta',
    );

  const url = new URL(request.url);
  const parsed = listMyAttendanceQuerySchema.safeParse({
    page: url.searchParams.get('page') ?? undefined,
    pageSize: url.searchParams.get('pageSize') ?? undefined,
  });
  if (!parsed.success) {
    return errorResponse(
      422,
      'VALIDATION_ERROR',
      parsed.error.issues[0]?.message ?? 'Parámetros inválidos',
    );
  }

  const result = await listAttendance(env.DB, { ...parsed.data, memberId: member.id });
  return jsonResponse(result);
}
