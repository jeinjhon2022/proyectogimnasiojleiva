import type { Env } from '../env';
import { authenticate, requireRole } from '../authenticate';
import { errorResponse, jsonResponse, readJsonBody } from '../http';
import {
  createMemberSchema,
  listMembersQuerySchema,
  updateMemberSchema,
} from '../validation/members';
import {
  createMember,
  deactivateMember,
  getMemberById,
  listMembers,
  updateMember,
  type MemberDetail,
  type MemberSummary,
} from '../members-repo';
import { isMemberAssignedToTrainer } from '../routines-repo';
import { buildWelcomeEmail } from '../emails';
import { sendEmailWithResend } from '../resend';

// Matriz de permisos (PLAN.md sección 7): recepcionista y admin administran socios sin
// restricciones. Entrenador (desde la Fase 8, con routine_assignments ya existente):
// puede buscar socios (para asignarles una rutina nueva) pero sin ver correo/teléfono,
// y solo ve el detalle completo de los socios que ya tiene asignados.
const STAFF_ROLES = ['admin', 'receptionist'] as const;
const SEARCH_ROLES = ['admin', 'receptionist', 'trainer'] as const;

function toMemberSummaryDto(member: MemberSummary, hideContactInfo: boolean) {
  return {
    id: member.id,
    memberCode: member.memberCode,
    fullName: member.fullName,
    email: hideContactInfo ? null : member.email,
    phone: hideContactInfo ? null : member.phone,
    isActive: member.isActive,
  };
}

function toMemberDto(member: MemberDetail) {
  return {
    id: member.id,
    memberCode: member.memberCode,
    fullName: member.fullName,
    email: member.email,
    phone: member.phone,
    birthDate: member.birthDate,
    joinDate: member.joinDate,
    isActive: member.isActive,
    notes: member.notes,
    createdAt: member.createdAt,
    updatedAt: member.updatedAt,
  };
}

export async function handleListMembers(request: Request, env: Env): Promise<Response> {
  const auth = await authenticate(request, env);
  if (auth.kind === 'unauthenticated')
    return errorResponse(401, 'UNAUTHENTICATED', 'Se requiere iniciar sesión');
  if (auth.kind === 'unauthorized' || !requireRole(auth.user, SEARCH_ROLES)) {
    return errorResponse(403, 'FORBIDDEN', 'No tienes permiso para ver la lista de socios');
  }

  const url = new URL(request.url);
  const parsed = listMembersQuerySchema.safeParse({
    page: url.searchParams.get('page') ?? undefined,
    pageSize: url.searchParams.get('pageSize') ?? undefined,
    q: url.searchParams.get('q') ?? undefined,
  });
  if (!parsed.success) {
    return errorResponse(
      422,
      'VALIDATION_ERROR',
      parsed.error.issues[0]?.message ?? 'Parámetros inválidos',
    );
  }

  const result = await listMembers(env.DB, parsed.data);
  // El entrenador puede buscar socios (para asignarles una rutina), pero sin ver su
  // correo/teléfono — solo obtiene esos datos cuando el socio ya le está asignado.
  const hideContactInfo = auth.user.role === 'trainer';
  return jsonResponse({
    ...result,
    items: result.items.map((item) => toMemberSummaryDto(item, hideContactInfo)),
  });
}

export async function handleCreateMember(request: Request, env: Env): Promise<Response> {
  const auth = await authenticate(request, env);
  if (auth.kind === 'unauthenticated')
    return errorResponse(401, 'UNAUTHENTICATED', 'Se requiere iniciar sesión');
  if (auth.kind === 'unauthorized' || !requireRole(auth.user, STAFF_ROLES)) {
    return errorResponse(403, 'FORBIDDEN', 'No tienes permiso para registrar socios');
  }

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = createMemberSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return errorResponse(
      422,
      'VALIDATION_ERROR',
      parsed.error.issues[0]?.message ?? 'Datos inválidos',
    );
  }

  try {
    const member = await createMember(env.DB, parsed.data, auth.user.id);

    // Best-effort: se espera el envío (los Workers pueden cancelar I/O pendiente tras
    // devolver la respuesta si no se usa ctx.waitUntil), pero un fallo de correo nunca
    // hace fallar el alta del socio (CLAUDE.md sección 11).
    try {
      const { subject, html } = buildWelcomeEmail(member.fullName);
      await sendEmailWithResend({ to: member.email, subject, html }, env.RESEND_API_KEY);
    } catch {
      // No se expone al cliente ni se reintenta: el alta del socio ya es válida.
    }

    return jsonResponse(toMemberDto(member), { status: 201 });
  } catch {
    // Típicamente un choque de UNIQUE (correo duplicado). CLAUDE.md sección 8: no
    // exponer detalles internos del error al cliente.
    return errorResponse(409, 'CONFLICT', 'Ya existe un socio con ese correo');
  }
}

export async function handleGetMember(request: Request, env: Env, id: string): Promise<Response> {
  const auth = await authenticate(request, env);
  if (auth.kind === 'unauthenticated')
    return errorResponse(401, 'UNAUTHENTICATED', 'Se requiere iniciar sesión');
  if (auth.kind === 'unauthorized')
    return errorResponse(403, 'FORBIDDEN', 'No tienes permiso para ver este socio');

  if (!requireRole(auth.user, STAFF_ROLES)) {
    // Entrenador: acceso al detalle completo solo si el socio ya le está asignado
    // (PLAN.md sección 7). Cualquier otro rol (member) no tiene acceso por esta ruta.
    const isAssignedTrainer =
      auth.user.role === 'trainer' && (await isMemberAssignedToTrainer(env.DB, auth.user.id, id));
    if (!isAssignedTrainer)
      return errorResponse(403, 'FORBIDDEN', 'No tienes permiso para ver este socio');
  }

  const member = await getMemberById(env.DB, id);
  if (!member) return errorResponse(404, 'MEMBER_NOT_FOUND', 'No se encontró el socio solicitado');

  return jsonResponse(toMemberDto(member));
}

export async function handleUpdateMember(
  request: Request,
  env: Env,
  id: string,
): Promise<Response> {
  const auth = await authenticate(request, env);
  if (auth.kind === 'unauthenticated')
    return errorResponse(401, 'UNAUTHENTICATED', 'Se requiere iniciar sesión');
  if (auth.kind === 'unauthorized' || !requireRole(auth.user, STAFF_ROLES)) {
    return errorResponse(403, 'FORBIDDEN', 'No tienes permiso para editar socios');
  }

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = updateMemberSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return errorResponse(
      422,
      'VALIDATION_ERROR',
      parsed.error.issues[0]?.message ?? 'Datos inválidos',
    );
  }

  const updated = await updateMember(env.DB, id, parsed.data, auth.user.id);
  if (!updated) return errorResponse(404, 'MEMBER_NOT_FOUND', 'No se encontró el socio solicitado');

  return jsonResponse(toMemberDto(updated));
}

export async function handleDeactivateMember(
  request: Request,
  env: Env,
  id: string,
): Promise<Response> {
  const auth = await authenticate(request, env);
  if (auth.kind === 'unauthenticated')
    return errorResponse(401, 'UNAUTHENTICATED', 'Se requiere iniciar sesión');
  // Solo Administrador (CLAUDE.md sección 5 / PLAN.md sección 7): la recepcionista no
  // puede desactivar socios.
  if (auth.kind === 'unauthorized' || !requireRole(auth.user, ['admin'])) {
    return errorResponse(403, 'FORBIDDEN', 'Solo un administrador puede desactivar socios');
  }

  const updated = await deactivateMember(env.DB, id, auth.user.id);
  if (!updated) return errorResponse(404, 'MEMBER_NOT_FOUND', 'No se encontró el socio solicitado');

  return jsonResponse(toMemberDto(updated));
}
