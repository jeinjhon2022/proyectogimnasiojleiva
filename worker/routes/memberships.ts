import type { Env } from '../env';
import { authenticate, requireRole } from '../authenticate';
import { errorResponse, jsonResponse, readJsonBody } from '../http';
import {
  createMembershipSchema,
  listMembershipsQuerySchema,
  renewMembershipSchema,
} from '../validation/memberships';
import {
  createMembership,
  getMembershipById,
  listMemberships,
  renewMembership,
} from '../memberships-repo';
import { getMembershipPlanById } from '../membership-plans-repo';
import { getGymTimezone, todayInTimezone } from '../gym-settings-repo';
import { getMemberById, getMemberByUserId } from '../members-repo';
import { buildRenewalConfirmationEmail } from '../emails';
import { sendEmailWithResend } from '../resend';

const STAFF_ROLES = ['admin', 'receptionist'] as const;

async function resolveToday(db: D1Database): Promise<string> {
  const timezone = await getGymTimezone(db);
  return todayInTimezone(timezone);
}

export async function handleListMemberships(request: Request, env: Env): Promise<Response> {
  const auth = await authenticate(request, env);
  if (auth.kind === 'unauthenticated')
    return errorResponse(401, 'UNAUTHENTICATED', 'Se requiere iniciar sesión');
  if (auth.kind === 'unauthorized' || !requireRole(auth.user, STAFF_ROLES)) {
    return errorResponse(403, 'FORBIDDEN', 'No tienes permiso para ver membresías');
  }

  const url = new URL(request.url);
  const parsed = listMembershipsQuerySchema.safeParse({
    page: url.searchParams.get('page') ?? undefined,
    pageSize: url.searchParams.get('pageSize') ?? undefined,
    memberId: url.searchParams.get('memberId') ?? undefined,
    status: url.searchParams.get('status') ?? undefined,
  });
  if (!parsed.success) {
    return errorResponse(
      422,
      'VALIDATION_ERROR',
      parsed.error.issues[0]?.message ?? 'Parámetros inválidos',
    );
  }

  const today = await resolveToday(env.DB);
  const result = await listMemberships(env.DB, parsed.data, today);
  return jsonResponse(result);
}

export async function handleGetMembership(
  request: Request,
  env: Env,
  id: string,
): Promise<Response> {
  const auth = await authenticate(request, env);
  if (auth.kind === 'unauthenticated')
    return errorResponse(401, 'UNAUTHENTICATED', 'Se requiere iniciar sesión');
  if (auth.kind === 'unauthorized' || !requireRole(auth.user, STAFF_ROLES)) {
    return errorResponse(403, 'FORBIDDEN', 'No tienes permiso para ver esta membresía');
  }

  const today = await resolveToday(env.DB);
  const membership = await getMembershipById(env.DB, id, today);
  if (!membership)
    return errorResponse(404, 'MEMBERSHIP_NOT_FOUND', 'No se encontró la membresía indicada');

  return jsonResponse(membership);
}

// GET /api/me/membership: el socio ve solo su membresía más reciente; memberId nunca
// viene del cliente (CLAUDE.md sección 5). Faltaba desde la Fase 5 — PLAN.md ya la
// tenía listada en el endpoint table; se completa ahora, junto con /api/me/routine.
export async function handleGetMyMembership(request: Request, env: Env): Promise<Response> {
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

  const today = await resolveToday(env.DB);
  const result = await listMemberships(
    env.DB,
    { page: 1, pageSize: 1, memberId: member.id },
    today,
  );
  const membership = result.items[0];
  if (!membership)
    return errorResponse(404, 'MEMBERSHIP_NOT_FOUND', 'Todavía no tienes una membresía registrada');

  return jsonResponse(membership);
}

export async function handleCreateMembership(request: Request, env: Env): Promise<Response> {
  const auth = await authenticate(request, env);
  if (auth.kind === 'unauthenticated')
    return errorResponse(401, 'UNAUTHENTICATED', 'Se requiere iniciar sesión');
  if (auth.kind === 'unauthorized' || !requireRole(auth.user, STAFF_ROLES)) {
    return errorResponse(403, 'FORBIDDEN', 'No tienes permiso para asignar membresías');
  }

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = createMembershipSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return errorResponse(
      422,
      'VALIDATION_ERROR',
      parsed.error.issues[0]?.message ?? 'Datos inválidos',
    );
  }

  // Solo Administrador puede fijar un precio distinto al del plan (PLAN.md sección 4).
  if (parsed.data.priceOverride !== undefined && !requireRole(auth.user, ['admin'])) {
    return errorResponse(
      403,
      'FORBIDDEN',
      'Solo un administrador puede fijar un precio distinto al del plan',
    );
  }

  const member = await getMemberById(env.DB, parsed.data.memberId);
  if (!member) return errorResponse(404, 'MEMBER_NOT_FOUND', 'No se encontró el socio indicado');

  const plan = await getMembershipPlanById(env.DB, parsed.data.planId);
  if (!plan || !plan.isActive)
    return errorResponse(404, 'PLAN_NOT_FOUND', 'No se encontró un plan activo con ese id');

  const price = parsed.data.priceOverride ?? plan.price;
  const today = await resolveToday(env.DB);

  const membership = await createMembership(
    env.DB,
    {
      memberId: parsed.data.memberId,
      planId: parsed.data.planId,
      startDate: parsed.data.startDate,
      price,
    },
    plan,
    auth.user.id,
    today,
  );

  return jsonResponse(membership, { status: 201 });
}

export async function handleRenewMembership(
  request: Request,
  env: Env,
  id: string,
): Promise<Response> {
  const auth = await authenticate(request, env);
  if (auth.kind === 'unauthenticated')
    return errorResponse(401, 'UNAUTHENTICATED', 'Se requiere iniciar sesión');
  if (auth.kind === 'unauthorized' || !requireRole(auth.user, STAFF_ROLES)) {
    return errorResponse(403, 'FORBIDDEN', 'No tienes permiso para renovar membresías');
  }

  // El cuerpo es opcional: sin él, se renueva con el mismo plan y precio vigente.
  const parsedBody = await readJsonBody(request, { allowEmpty: true });
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = renewMembershipSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return errorResponse(
      422,
      'VALIDATION_ERROR',
      parsed.error.issues[0]?.message ?? 'Datos inválidos',
    );
  }

  if (parsed.data.priceOverride !== undefined && !requireRole(auth.user, ['admin'])) {
    return errorResponse(
      403,
      'FORBIDDEN',
      'Solo un administrador puede fijar un precio distinto al del plan',
    );
  }

  const today = await resolveToday(env.DB);
  const existing = await getMembershipById(env.DB, id, today);
  if (!existing)
    return errorResponse(404, 'MEMBERSHIP_NOT_FOUND', 'No se encontró la membresía indicada');

  const planId = parsed.data.planId ?? existing.planId;
  const plan = await getMembershipPlanById(env.DB, planId);
  if (!plan || !plan.isActive)
    return errorResponse(404, 'PLAN_NOT_FOUND', 'No se encontró un plan activo con ese id');

  const price = parsed.data.priceOverride ?? plan.price;

  const renewed = await renewMembership(
    env.DB,
    id,
    { planId: parsed.data.planId, startDate: parsed.data.startDate, price },
    auth.user.id,
    today,
  );

  if (!renewed)
    return errorResponse(404, 'MEMBERSHIP_NOT_FOUND', 'No se encontró la membresía indicada');

  // Best-effort (ver nota en members.ts sobre por qué se espera el envío).
  try {
    const member = await getMemberById(env.DB, renewed.memberId);
    if (member) {
      const { subject, html } = buildRenewalConfirmationEmail(
        member.fullName,
        renewed.planName,
        renewed.startDate,
        renewed.endDate,
      );
      await sendEmailWithResend({ to: member.email, subject, html }, env.RESEND_API_KEY);
    }
  } catch {
    // No se expone al cliente ni se reintenta: la renovación ya es válida.
  }

  return jsonResponse(renewed, { status: 201 });
}
