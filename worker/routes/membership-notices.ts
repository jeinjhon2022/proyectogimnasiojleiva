import type { Env } from '../env';
import { authenticate, requireRole } from '../authenticate';
import { errorResponse, jsonResponse } from '../http';
import { runExpiredNoticeJob, runExpiryNoticeJob } from '../jobs/expiry-notices';

// Dispara manualmente los mismos jobs que corre el Cron Trigger diario (aviso de
// vencimiento próximo + aviso de membresía vencida). Útil para probar sin esperar al
// cron, y como mecanismo de recuperación si un día falló. Solo Administrador (envía
// correos reales a socios).
export async function handleRunExpiryNotices(request: Request, env: Env): Promise<Response> {
  const auth = await authenticate(request, env);
  if (auth.kind === 'unauthenticated')
    return errorResponse(401, 'UNAUTHENTICATED', 'Se requiere iniciar sesión');
  if (auth.kind === 'unauthorized' || !requireRole(auth.user, ['admin'])) {
    return errorResponse(
      403,
      'FORBIDDEN',
      'Solo un administrador puede disparar los avisos de membresía',
    );
  }

  const [expiringSoon, expired] = await Promise.all([
    runExpiryNoticeJob(env),
    runExpiredNoticeJob(env),
  ]);
  return jsonResponse({ expiringSoon, expired });
}
