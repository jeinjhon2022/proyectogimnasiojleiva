import type { Env } from '../env';
import { authenticate, requireRole } from '../authenticate';
import { errorResponse, jsonResponse, readJsonBody } from '../http';
import {
  assignRoutineSchema,
  createRoutineSchema,
  listRoutinesQuerySchema,
} from '../validation/routines';
import {
  assignRoutine,
  createRoutine,
  getActiveAssignmentForMember,
  getRoutineById,
  listRoutines,
} from '../routines-repo';
import { getMemberById, getMemberByUserId } from '../members-repo';
import { buildRoutineAssignedEmail } from '../emails';
import { sendEmailWithResend } from '../resend';

const ROUTINE_ROLES = ['admin', 'trainer'] as const;

export async function handleListRoutines(request: Request, env: Env): Promise<Response> {
  const auth = await authenticate(request, env);
  if (auth.kind === 'unauthenticated')
    return errorResponse(401, 'UNAUTHENTICATED', 'Se requiere iniciar sesión');
  if (auth.kind === 'unauthorized' || !requireRole(auth.user, ROUTINE_ROLES)) {
    return errorResponse(403, 'FORBIDDEN', 'No tienes permiso para ver rutinas');
  }

  const url = new URL(request.url);
  const parsed = listRoutinesQuerySchema.safeParse({
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

  // Un entrenador ve sus propias rutinas; Administrador las ve todas (PLAN.md sección 7).
  const createdBy = auth.user.role === 'trainer' ? auth.user.id : undefined;
  const result = await listRoutines(env.DB, { ...parsed.data, createdBy });
  return jsonResponse(result);
}

export async function handleGetRoutine(request: Request, env: Env, id: string): Promise<Response> {
  const auth = await authenticate(request, env);
  if (auth.kind === 'unauthenticated')
    return errorResponse(401, 'UNAUTHENTICATED', 'Se requiere iniciar sesión');
  if (auth.kind === 'unauthorized' || !requireRole(auth.user, ROUTINE_ROLES)) {
    return errorResponse(403, 'FORBIDDEN', 'No tienes permiso para ver esta rutina');
  }

  const routine = await getRoutineById(env.DB, id);
  if (!routine) return errorResponse(404, 'ROUTINE_NOT_FOUND', 'No se encontró la rutina indicada');
  return jsonResponse(routine);
}

export async function handleCreateRoutine(request: Request, env: Env): Promise<Response> {
  const auth = await authenticate(request, env);
  if (auth.kind === 'unauthenticated')
    return errorResponse(401, 'UNAUTHENTICATED', 'Se requiere iniciar sesión');
  if (auth.kind === 'unauthorized' || !requireRole(auth.user, ROUTINE_ROLES)) {
    return errorResponse(403, 'FORBIDDEN', 'No tienes permiso para crear rutinas');
  }

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = createRoutineSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return errorResponse(
      422,
      'VALIDATION_ERROR',
      parsed.error.issues[0]?.message ?? 'Datos inválidos',
    );
  }

  try {
    const routine = await createRoutine(env.DB, parsed.data, auth.user.id);
    return jsonResponse(routine, { status: 201 });
  } catch {
    return errorResponse(422, 'VALIDATION_ERROR', 'Uno de los ejercicios indicados no existe');
  }
}

export async function handleAssignRoutine(
  request: Request,
  env: Env,
  routineId: string,
): Promise<Response> {
  const auth = await authenticate(request, env);
  if (auth.kind === 'unauthenticated')
    return errorResponse(401, 'UNAUTHENTICATED', 'Se requiere iniciar sesión');
  if (auth.kind === 'unauthorized' || !requireRole(auth.user, ROUTINE_ROLES)) {
    return errorResponse(403, 'FORBIDDEN', 'No tienes permiso para asignar rutinas');
  }

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = assignRoutineSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return errorResponse(
      422,
      'VALIDATION_ERROR',
      parsed.error.issues[0]?.message ?? 'Datos inválidos',
    );
  }

  const routine = await getRoutineById(env.DB, routineId);
  if (!routine) return errorResponse(404, 'ROUTINE_NOT_FOUND', 'No se encontró la rutina indicada');

  const member = await getMemberById(env.DB, parsed.data.memberId);
  if (!member) return errorResponse(404, 'MEMBER_NOT_FOUND', 'No se encontró el socio indicado');
  if (!member.isActive) return errorResponse(409, 'MEMBER_INACTIVE', 'El socio está desactivado');

  const assignment = await assignRoutine(env.DB, routineId, parsed.data.memberId, auth.user.id);

  // Best-effort (ver nota en members.ts sobre por qué se espera el envío).
  try {
    const { subject, html } = buildRoutineAssignedEmail(member.fullName, routine.name);
    await sendEmailWithResend({ to: member.email, subject, html }, env.RESEND_API_KEY);
  } catch {
    // No se expone al cliente ni se reintenta: la asignación ya es válida.
  }

  return jsonResponse(assignment, { status: 201 });
}

// GET /api/me/routine: el socio ve solo su rutina activa; memberId nunca viene del
// cliente (CLAUDE.md sección 5).
export async function handleGetMyRoutine(request: Request, env: Env): Promise<Response> {
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

  const assignment = await getActiveAssignmentForMember(env.DB, member.id);
  if (!assignment)
    return errorResponse(404, 'ROUTINE_NOT_FOUND', 'Todavía no tienes una rutina asignada');

  const routine = await getRoutineById(env.DB, assignment.routineId);
  if (!routine)
    return errorResponse(404, 'ROUTINE_NOT_FOUND', 'Todavía no tienes una rutina asignada');

  return jsonResponse({ assignedAt: assignment.assignedAt, routine });
}
