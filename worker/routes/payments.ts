import type { Env } from '../env';
import { authenticate, requireRole } from '../authenticate';
import { errorResponse, jsonResponse, readJsonBody } from '../http';
import {
  createPaymentSchema,
  listPaymentsQuerySchema,
  paymentsSummaryQuerySchema,
  voidPaymentSchema,
} from '../validation/payments';
import {
  createPayment,
  findPaymentByIdempotencyKey,
  getPaymentById,
  getPaymentsSummary,
  listPayments,
  voidPayment,
} from '../payments-repo';
import { getMemberById } from '../members-repo';

const STAFF_ROLES = ['admin', 'receptionist'] as const;

export async function handleListPayments(request: Request, env: Env): Promise<Response> {
  const auth = await authenticate(request, env);
  if (auth.kind === 'unauthenticated')
    return errorResponse(401, 'UNAUTHENTICATED', 'Se requiere iniciar sesión');
  if (auth.kind === 'unauthorized' || !requireRole(auth.user, STAFF_ROLES)) {
    return errorResponse(403, 'FORBIDDEN', 'No tienes permiso para ver pagos');
  }

  const url = new URL(request.url);
  const parsed = listPaymentsQuerySchema.safeParse({
    page: url.searchParams.get('page') ?? undefined,
    pageSize: url.searchParams.get('pageSize') ?? undefined,
    memberId: url.searchParams.get('memberId') ?? undefined,
    status: url.searchParams.get('status') ?? undefined,
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

  const result = await listPayments(env.DB, parsed.data);
  return jsonResponse(result);
}

// Reporte agregado (CLAUDE.md sección 6.7): la recepcionista tiene acceso "limitado" a
// reportes financieros (PLAN.md sección 7) — por ahora eso significa que este endpoint
// agregado es exclusivo de Administrador; la recepcionista sigue viendo pagos individuales.
export async function handleGetPaymentsSummary(request: Request, env: Env): Promise<Response> {
  const auth = await authenticate(request, env);
  if (auth.kind === 'unauthenticated')
    return errorResponse(401, 'UNAUTHENTICATED', 'Se requiere iniciar sesión');
  if (auth.kind === 'unauthorized' || !requireRole(auth.user, ['admin'])) {
    return errorResponse(403, 'FORBIDDEN', 'No tienes permiso para ver reportes financieros');
  }

  const url = new URL(request.url);
  const parsed = paymentsSummaryQuerySchema.safeParse({
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

  const summary = await getPaymentsSummary(env.DB, parsed.data.dateFrom, parsed.data.dateTo);
  return jsonResponse(summary);
}

export async function handleGetPayment(request: Request, env: Env, id: string): Promise<Response> {
  const auth = await authenticate(request, env);
  if (auth.kind === 'unauthenticated')
    return errorResponse(401, 'UNAUTHENTICATED', 'Se requiere iniciar sesión');
  if (auth.kind === 'unauthorized' || !requireRole(auth.user, STAFF_ROLES)) {
    return errorResponse(403, 'FORBIDDEN', 'No tienes permiso para ver este pago');
  }

  const payment = await getPaymentById(env.DB, id);
  if (!payment) return errorResponse(404, 'PAYMENT_NOT_FOUND', 'No se encontró el pago indicado');
  return jsonResponse(payment);
}

export async function handleCreatePayment(request: Request, env: Env): Promise<Response> {
  const auth = await authenticate(request, env);
  if (auth.kind === 'unauthenticated')
    return errorResponse(401, 'UNAUTHENTICATED', 'Se requiere iniciar sesión');
  if (auth.kind === 'unauthorized' || !requireRole(auth.user, STAFF_ROLES)) {
    return errorResponse(403, 'FORBIDDEN', 'No tienes permiso para registrar pagos');
  }

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = createPaymentSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return errorResponse(
      422,
      'VALIDATION_ERROR',
      parsed.error.issues[0]?.message ?? 'Datos inválidos',
    );
  }

  // Idempotencia (CLAUDE.md sección 8): un reintento con la misma clave devuelve el
  // pago ya creado en vez de duplicarlo.
  if (parsed.data.idempotencyKey) {
    const existing = await findPaymentByIdempotencyKey(env.DB, parsed.data.idempotencyKey);
    if (existing) return jsonResponse(existing, { status: 200 });
  }

  const member = await getMemberById(env.DB, parsed.data.memberId);
  if (!member) return errorResponse(404, 'MEMBER_NOT_FOUND', 'No se encontró el socio indicado');

  try {
    const payment = await createPayment(env.DB, parsed.data, auth.user.id);
    return jsonResponse(payment, { status: 201 });
  } catch {
    return errorResponse(409, 'CONFLICT', 'No se pudo registrar el pago');
  }
}

export async function handleVoidPayment(request: Request, env: Env, id: string): Promise<Response> {
  const auth = await authenticate(request, env);
  if (auth.kind === 'unauthenticated')
    return errorResponse(401, 'UNAUTHENTICATED', 'Se requiere iniciar sesión');
  // Solo Administrador puede anular pagos (CLAUDE.md sección 5 / PLAN.md sección 4).
  if (auth.kind === 'unauthorized' || !requireRole(auth.user, ['admin'])) {
    return errorResponse(403, 'FORBIDDEN', 'Solo un administrador puede anular pagos');
  }

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = voidPaymentSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return errorResponse(
      422,
      'VALIDATION_ERROR',
      parsed.error.issues[0]?.message ?? 'Datos inválidos',
    );
  }

  const voided = await voidPayment(env.DB, id, parsed.data.reason, auth.user.id);
  if (!voided) return errorResponse(404, 'PAYMENT_NOT_FOUND', 'No se encontró el pago indicado');

  return jsonResponse(voided);
}
