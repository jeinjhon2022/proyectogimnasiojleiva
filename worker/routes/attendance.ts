import type { Env } from '../env';
import { authenticate, requireRole } from '../authenticate';
import { errorResponse, jsonResponse, readJsonBody } from '../http';
import {
  createAttendanceSchema,
  listAttendanceQuerySchema,
  listMyAttendanceQuerySchema,
} from '../validation/attendance';
import { createAttendance, getAttendanceSummary, listAttendance } from '../attendance-repo';
import { getGymTimezone, todayInTimezone } from '../gym-settings-repo';
import { getMemberById, getMemberByUserId } from '../members-repo';

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
