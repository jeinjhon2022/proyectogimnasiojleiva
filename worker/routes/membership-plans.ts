import type { Env } from '../env';
import { authenticate, requireRole } from '../authenticate';
import { errorResponse, jsonResponse, readJsonBody } from '../http';
import { createMembershipPlanSchema } from '../validation/memberships';
import { createMembershipPlan, listMembershipPlans } from '../membership-plans-repo';

const STAFF_ROLES = ['admin', 'receptionist'] as const;

export async function handleListMembershipPlans(request: Request, env: Env): Promise<Response> {
  const auth = await authenticate(request, env);
  if (auth.kind === 'unauthenticated')
    return errorResponse(401, 'UNAUTHENTICATED', 'Se requiere iniciar sesión');
  if (auth.kind === 'unauthorized' || !requireRole(auth.user, STAFF_ROLES)) {
    return errorResponse(403, 'FORBIDDEN', 'No tienes permiso para ver los planes de membresía');
  }

  const plans = await listMembershipPlans(env.DB);
  return jsonResponse({ items: plans });
}

export async function handleCreateMembershipPlan(request: Request, env: Env): Promise<Response> {
  const auth = await authenticate(request, env);
  if (auth.kind === 'unauthenticated')
    return errorResponse(401, 'UNAUTHENTICATED', 'Se requiere iniciar sesión');
  // Solo Administrador define planes y precios (CLAUDE.md sección 5).
  if (auth.kind === 'unauthorized' || !requireRole(auth.user, ['admin'])) {
    return errorResponse(403, 'FORBIDDEN', 'Solo un administrador puede crear planes de membresía');
  }

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = createMembershipPlanSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return errorResponse(
      422,
      'VALIDATION_ERROR',
      parsed.error.issues[0]?.message ?? 'Datos inválidos',
    );
  }

  const plan = await createMembershipPlan(env.DB, parsed.data, auth.user.id);
  return jsonResponse(plan, { status: 201 });
}
