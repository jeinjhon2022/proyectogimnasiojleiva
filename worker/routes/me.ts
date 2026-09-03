import type { Env } from '../env';
import { authenticate } from '../authenticate';
import { errorResponse, jsonResponse } from '../http';

// GET /api/me — perfil básico del usuario autenticado (CLAUDE.md sección 6.1, PLAN.md sección 9).
export async function handleGetMe(request: Request, env: Env): Promise<Response> {
  const auth = await authenticate(request, env);

  if (auth.kind === 'unauthenticated') {
    return errorResponse(401, 'UNAUTHENTICATED', 'Se requiere iniciar sesión');
  }
  if (auth.kind === 'unauthorized') {
    return errorResponse(403, 'FORBIDDEN', 'Tu cuenta no está habilitada en el sistema');
  }

  const { user } = auth;
  return jsonResponse({
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
  });
}
