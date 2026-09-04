// Punto de entrada del Worker (API). Enruta a los módulos en worker/routes/*.
import * as Sentry from '@sentry/cloudflare';
import type { Env } from './env';
import { errorResponse, jsonResponse } from './http';
import { handleGetMe } from './routes/me';
import {
  handleCreateMember,
  handleDeactivateMember,
  handleGetMember,
  handleListMembers,
  handleUpdateMember,
} from './routes/members';
import { handleCreateMembershipPlan, handleListMembershipPlans } from './routes/membership-plans';
import {
  handleCreateMembership,
  handleGetMembership,
  handleGetMyMembership,
  handleListMemberships,
  handleRenewMembership,
} from './routes/memberships';
import { handleRunExpiryNotices } from './routes/membership-notices';
import { runExpiredNoticeJob, runExpiryNoticeJob } from './jobs/expiry-notices';
import {
  handleCreatePayment,
  handleGetPayment,
  handleGetPaymentsSummary,
  handleListPayments,
  handleVoidPayment,
} from './routes/payments';
import {
  handleCreateAttendance,
  handleGetAttendanceSummary,
  handleGetMyAttendance,
  handleKioskCheckIn,
  handleListAttendance,
} from './routes/attendance';
import { handleCreateExercise, handleListExercises } from './routes/exercises';
import {
  handleAssignRoutine,
  handleCreateRoutine,
  handleGetMyRoutine,
  handleGetRoutine,
  handleListRoutines,
} from './routes/routines';

export type { Env };

export async function handleApiRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === '/api/health') {
    if (request.method !== 'GET') {
      return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Método no permitido');
    }
    return jsonResponse({ status: 'ok', timestamp: new Date().toISOString() });
  }

  if (url.pathname === '/api/me') {
    if (request.method !== 'GET') {
      return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Método no permitido');
    }
    return handleGetMe(request, env);
  }

  if (url.pathname === '/api/me/membership') {
    if (request.method !== 'GET') {
      return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Método no permitido');
    }
    return handleGetMyMembership(request, env);
  }

  if (url.pathname === '/api/me/attendance') {
    if (request.method !== 'GET') {
      return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Método no permitido');
    }
    return handleGetMyAttendance(request, env);
  }

  if (url.pathname === '/api/me/routine') {
    if (request.method !== 'GET') {
      return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Método no permitido');
    }
    return handleGetMyRoutine(request, env);
  }

  const deactivateMemberMatch = url.pathname.match(/^\/api\/members\/([^/]+)\/deactivate$/);
  if (deactivateMemberMatch) {
    const id = deactivateMemberMatch[1];
    if (!id) return errorResponse(404, 'NOT_FOUND', 'Recurso no encontrado');
    if (request.method !== 'POST')
      return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Método no permitido');
    return handleDeactivateMember(request, env, id);
  }

  const memberDetailMatch = url.pathname.match(/^\/api\/members\/([^/]+)$/);
  if (memberDetailMatch) {
    const id = memberDetailMatch[1];
    if (!id) return errorResponse(404, 'NOT_FOUND', 'Recurso no encontrado');
    if (request.method === 'GET') return handleGetMember(request, env, id);
    if (request.method === 'PATCH') return handleUpdateMember(request, env, id);
    return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Método no permitido');
  }

  if (url.pathname === '/api/members') {
    if (request.method === 'GET') return handleListMembers(request, env);
    if (request.method === 'POST') return handleCreateMember(request, env);
    return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Método no permitido');
  }

  if (url.pathname === '/api/membership-plans') {
    if (request.method === 'GET') return handleListMembershipPlans(request, env);
    if (request.method === 'POST') return handleCreateMembershipPlan(request, env);
    return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Método no permitido');
  }

  const renewMembershipMatch = url.pathname.match(/^\/api\/memberships\/([^/]+)\/renew$/);
  if (renewMembershipMatch) {
    const id = renewMembershipMatch[1];
    if (!id) return errorResponse(404, 'NOT_FOUND', 'Recurso no encontrado');
    if (request.method !== 'POST')
      return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Método no permitido');
    return handleRenewMembership(request, env, id);
  }

  const membershipDetailMatch = url.pathname.match(/^\/api\/memberships\/([^/]+)$/);
  if (membershipDetailMatch) {
    const id = membershipDetailMatch[1];
    if (!id) return errorResponse(404, 'NOT_FOUND', 'Recurso no encontrado');
    if (request.method === 'GET') return handleGetMembership(request, env, id);
    return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Método no permitido');
  }

  if (url.pathname === '/api/memberships') {
    if (request.method === 'GET') return handleListMemberships(request, env);
    if (request.method === 'POST') return handleCreateMembership(request, env);
    return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Método no permitido');
  }

  if (url.pathname === '/api/membership-notices/run') {
    if (request.method !== 'POST')
      return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Método no permitido');
    return handleRunExpiryNotices(request, env);
  }

  if (url.pathname === '/api/payments/summary') {
    if (request.method !== 'GET')
      return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Método no permitido');
    return handleGetPaymentsSummary(request, env);
  }

  const voidPaymentMatch = url.pathname.match(/^\/api\/payments\/([^/]+)\/void$/);
  if (voidPaymentMatch) {
    const id = voidPaymentMatch[1];
    if (!id) return errorResponse(404, 'NOT_FOUND', 'Recurso no encontrado');
    if (request.method !== 'POST')
      return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Método no permitido');
    return handleVoidPayment(request, env, id);
  }

  const paymentDetailMatch = url.pathname.match(/^\/api\/payments\/([^/]+)$/);
  if (paymentDetailMatch) {
    const id = paymentDetailMatch[1];
    if (!id) return errorResponse(404, 'NOT_FOUND', 'Recurso no encontrado');
    if (request.method !== 'GET')
      return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Método no permitido');
    return handleGetPayment(request, env, id);
  }

  if (url.pathname === '/api/payments') {
    if (request.method === 'GET') return handleListPayments(request, env);
    if (request.method === 'POST') return handleCreatePayment(request, env);
    return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Método no permitido');
  }

  if (url.pathname === '/api/attendance/summary') {
    if (request.method !== 'GET')
      return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Método no permitido');
    return handleGetAttendanceSummary(request, env);
  }

  if (url.pathname === '/api/attendance/check-in') {
    if (request.method !== 'POST')
      return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Método no permitido');
    return handleKioskCheckIn(request, env);
  }

  if (url.pathname === '/api/attendance') {
    if (request.method === 'GET') return handleListAttendance(request, env);
    if (request.method === 'POST') return handleCreateAttendance(request, env);
    return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Método no permitido');
  }

  if (url.pathname === '/api/exercises') {
    if (request.method === 'GET') return handleListExercises(request, env);
    if (request.method === 'POST') return handleCreateExercise(request, env);
    return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Método no permitido');
  }

  const assignRoutineMatch = url.pathname.match(/^\/api\/routines\/([^/]+)\/assign$/);
  if (assignRoutineMatch) {
    const id = assignRoutineMatch[1];
    if (!id) return errorResponse(404, 'NOT_FOUND', 'Recurso no encontrado');
    if (request.method !== 'POST')
      return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Método no permitido');
    return handleAssignRoutine(request, env, id);
  }

  const routineDetailMatch = url.pathname.match(/^\/api\/routines\/([^/]+)$/);
  if (routineDetailMatch) {
    const id = routineDetailMatch[1];
    if (!id) return errorResponse(404, 'NOT_FOUND', 'Recurso no encontrado');
    if (request.method !== 'GET')
      return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Método no permitido');
    return handleGetRoutine(request, env, id);
  }

  if (url.pathname === '/api/routines') {
    if (request.method === 'GET') return handleListRoutines(request, env);
    if (request.method === 'POST') return handleCreateRoutine(request, env);
    return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Método no permitido');
  }

  return errorResponse(404, 'NOT_FOUND', 'Recurso no encontrado');
}

const handler = {
  fetch(request, env) {
    return handleApiRequest(request, env);
  },
  // Cron Trigger diario (wrangler.jsonc) — aviso de membresías próximas a vencer.
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(runExpiryNoticeJob(env));
    ctx.waitUntil(runExpiredNoticeJob(env));
  },
} satisfies ExportedHandler<Env>;

// withSentry instrumenta fetch y scheduled automáticamente (captura excepciones no
// controladas). Con SENTRY_DSN vacío (caso local, .dev.vars no lo define) el SDK queda
// desactivado y no envía nada — así los errores de desarrollo nunca llegan a Sentry.
export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    // TODO(Fase 10): distinguir development/preview/production cuando existan
    // entornos reales de despliegue (CLAUDE.md sección 12).
    environment: 'development',
    tracesSampleRate: 0, // solo captura de errores por ahora, sin trazas de performance
    sendDefaultPii: false, // nunca IP/datos de usuario por defecto (CLAUDE.md sección 10)
  }),
  handler,
);
