import type { Env } from './env';
import {
  fetchClerkProfile,
  getBearerToken,
  verifyClerkSession,
  type ClerkProfileFetcher,
  type SessionVerifier,
} from './clerk';
import {
  claimUserAccount,
  findUnclaimedUserByEmail,
  findUserByClerkId,
  type Role,
  type UserRecord,
} from './users-repo';

export type AuthResult =
  | { kind: 'unauthenticated' }
  // Token válido pero sin fila correspondiente en `users`, o cuenta desactivada.
  | { kind: 'unauthorized' }
  | { kind: 'authenticated'; user: UserRecord };

// Combina: extraer el token -> verificarlo contra Clerk -> resolver el rol en D1.
// `verifier` y `profileFetcher` son inyectables solo para pruebas; en producción
// siempre son verifyClerkSession / fetchClerkProfile.
export async function authenticate(
  request: Request,
  env: Env,
  verifier: SessionVerifier = verifyClerkSession,
  profileFetcher: ClerkProfileFetcher = fetchClerkProfile,
): Promise<AuthResult> {
  const token = getBearerToken(request);
  if (!token) return { kind: 'unauthenticated' };

  const session = await verifier(token, env.CLERK_SECRET_KEY);
  if (!session) return { kind: 'unauthenticated' };

  const existing = await findUserByClerkId(env.DB, session.clerkUserId);
  if (existing) {
    if (!existing.isActive) return { kind: 'unauthorized' };
    return { kind: 'authenticated', user: existing };
  }

  // Primer login de alguien cuyo registro de socio ya existía (creado por staff en la
  // Fase 4) pero todavía no tenía cuenta de Clerk vinculada: se vincula ahora por
  // correo, exigiendo que Clerk lo tenga verificado.
  const profile = await profileFetcher(session.clerkUserId, env.CLERK_SECRET_KEY);
  if (!profile) return { kind: 'unauthorized' };

  const unclaimed = await findUnclaimedUserByEmail(env.DB, profile.email);
  if (!unclaimed || !unclaimed.isActive) return { kind: 'unauthorized' };

  await claimUserAccount(env.DB, unclaimed.id, session.clerkUserId);
  return { kind: 'authenticated', user: { ...unclaimed, clerkUserId: session.clerkUserId } };
}

// Verificación de autorización por rol (CLAUDE.md sección 5): se usa en cada endpoint
// protegido, nunca ocultando solo botones en el frontend.
export function requireRole(user: UserRecord, allowedRoles: readonly Role[]): boolean {
  return allowedRoles.includes(user.role);
}
