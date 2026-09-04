import type { Env } from '../env';
import { authenticate, requireRole } from '../authenticate';
import { errorResponse, jsonResponse, readJsonBody } from '../http';
import {
  closeCashSessionSchema,
  createCashMovementSchema,
  listCashSessionsQuerySchema,
  openCashSessionSchema,
} from '../validation/cash';
import {
  closeSession,
  createCashMovement,
  getOpenSession,
  getSessionById,
  getSessionSummary,
  listSessions,
  openSession,
} from '../cash-repo';

// Caja diaria (PLAN.md — módulo de caja): admin y recepcionista comparten el mismo
// permiso que ya tienen para pagos (CLAUDE.md sección 5), porque abrir/cerrar caja y
// registrar movimientos manuales es una tarea operativa del día a día, no financiera
// sensible reservada solo a Administrador.
const STAFF_ROLES = ['admin', 'receptionist'] as const;

// GET /api/cash/current: la caja abierta ahora mismo (o null si no hay ninguna), con su
// resumen en vivo. Es lo primero que necesita el panel de Caja al montarse.
export async function handleGetCurrentSession(request: Request, env: Env): Promise<Response> {
  const auth = await authenticate(request, env);
  if (auth.kind === 'unauthenticated')
    return errorResponse(401, 'UNAUTHENTICATED', 'Se requiere iniciar sesión');
  if (auth.kind === 'unauthorized' || !requireRole(auth.user, STAFF_ROLES)) {
    return errorResponse(403, 'FORBIDDEN', 'No tienes permiso para ver la caja');
  }

  const session = await getOpenSession(env.DB);
  if (!session) return jsonResponse({ session: null });

  const summary = await getSessionSummary(env.DB, session);
  return jsonResponse(summary);
}

export async function handleOpenCashSession(request: Request, env: Env): Promise<Response> {
  const auth = await authenticate(request, env);
  if (auth.kind === 'unauthenticated')
    return errorResponse(401, 'UNAUTHENTICATED', 'Se requiere iniciar sesión');
  if (auth.kind === 'unauthorized' || !requireRole(auth.user, STAFF_ROLES)) {
    return errorResponse(403, 'FORBIDDEN', 'No tienes permiso para abrir la caja');
  }

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = openCashSessionSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return errorResponse(
      422,
      'VALIDATION_ERROR',
      parsed.error.issues[0]?.message ?? 'Datos inválidos',
    );
  }

  const existing = await getOpenSession(env.DB);
  if (existing) {
    return errorResponse(409, 'CASH_SESSION_ALREADY_OPEN', 'Ya hay una caja abierta');
  }

  const session = await openSession(env.DB, parsed.data.initialBalance, auth.user.id);
  return jsonResponse(session, { status: 201 });
}

export async function handleCloseCashSession(
  request: Request,
  env: Env,
  id: string,
): Promise<Response> {
  const auth = await authenticate(request, env);
  if (auth.kind === 'unauthenticated')
    return errorResponse(401, 'UNAUTHENTICATED', 'Se requiere iniciar sesión');
  if (auth.kind === 'unauthorized' || !requireRole(auth.user, STAFF_ROLES)) {
    return errorResponse(403, 'FORBIDDEN', 'No tienes permiso para cerrar la caja');
  }

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = closeCashSessionSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return errorResponse(
      422,
      'VALIDATION_ERROR',
      parsed.error.issues[0]?.message ?? 'Datos inválidos',
    );
  }

  const session = await getSessionById(env.DB, id);
  if (!session) return errorResponse(404, 'CASH_SESSION_NOT_FOUND', 'No se encontró esa caja');
  if (session.status === 'closed') {
    return errorResponse(409, 'CASH_SESSION_ALREADY_CLOSED', 'Esa caja ya está cerrada');
  }

  const closed = await closeSession(env.DB, session, parsed.data, auth.user.id);
  const summary = await getSessionSummary(env.DB, closed);
  return jsonResponse(summary);
}

export async function handleListCashSessions(request: Request, env: Env): Promise<Response> {
  const auth = await authenticate(request, env);
  if (auth.kind === 'unauthenticated')
    return errorResponse(401, 'UNAUTHENTICATED', 'Se requiere iniciar sesión');
  if (auth.kind === 'unauthorized' || !requireRole(auth.user, STAFF_ROLES)) {
    return errorResponse(403, 'FORBIDDEN', 'No tienes permiso para ver el historial de caja');
  }

  const url = new URL(request.url);
  const parsed = listCashSessionsQuerySchema.safeParse({
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

  const result = await listSessions(env.DB, parsed.data);
  return jsonResponse(result);
}

export async function handleGetCashSession(
  request: Request,
  env: Env,
  id: string,
): Promise<Response> {
  const auth = await authenticate(request, env);
  if (auth.kind === 'unauthenticated')
    return errorResponse(401, 'UNAUTHENTICATED', 'Se requiere iniciar sesión');
  if (auth.kind === 'unauthorized' || !requireRole(auth.user, STAFF_ROLES)) {
    return errorResponse(403, 'FORBIDDEN', 'No tienes permiso para ver esta caja');
  }

  const session = await getSessionById(env.DB, id);
  if (!session) return errorResponse(404, 'CASH_SESSION_NOT_FOUND', 'No se encontró esa caja');

  const summary = await getSessionSummary(env.DB, session);
  return jsonResponse(summary);
}

// POST /api/cash/movements: ingreso o egreso manual, siempre atado a la caja abierta
// (nunca a una que ya cerró — "no permitir cobros si la caja está cerrada").
export async function handleCreateCashMovement(request: Request, env: Env): Promise<Response> {
  const auth = await authenticate(request, env);
  if (auth.kind === 'unauthenticated')
    return errorResponse(401, 'UNAUTHENTICATED', 'Se requiere iniciar sesión');
  if (auth.kind === 'unauthorized' || !requireRole(auth.user, STAFF_ROLES)) {
    return errorResponse(403, 'FORBIDDEN', 'No tienes permiso para registrar movimientos de caja');
  }

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = createCashMovementSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return errorResponse(
      422,
      'VALIDATION_ERROR',
      parsed.error.issues[0]?.message ?? 'Datos inválidos',
    );
  }

  const openCash = await getOpenSession(env.DB);
  if (!openCash) {
    return errorResponse(
      409,
      'CASH_SESSION_NOT_OPEN',
      'No hay una caja abierta — ábrela antes de registrar movimientos',
    );
  }

  const movement = await createCashMovement(
    env.DB,
    { sessionId: openCash.id, ...parsed.data },
    auth.user.id,
  );
  return jsonResponse(movement, { status: 201 });
}
