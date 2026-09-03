import { createClerkClient, verifyToken } from '@clerk/backend';

export interface VerifiedSession {
  clerkUserId: string;
}

// Firma inyectable: permite reemplazar el verificador real por uno simulado en pruebas
// (ver authenticate.test.ts), sin golpear la red de Clerk.
export type SessionVerifier = (token: string, secretKey: string) => Promise<VerifiedSession | null>;

export function getBearerToken(request: Request): string | null {
  const header = request.headers.get('Authorization');
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

// Verificador real: valida firma, emisor y vigencia del JWT de sesión de Clerk
// (CLAUDE.md sección 10, "Autenticación y sesiones").
export const verifyClerkSession: SessionVerifier = async (token, secretKey) => {
  try {
    const payload = await verifyToken(token, { secretKey });
    if (!payload.sub) return null;
    return { clerkUserId: payload.sub };
  } catch {
    // Token inválido, expirado o con firma incorrecta: se trata como no autenticado,
    // nunca se exponen detalles del error al cliente.
    return null;
  }
};

export interface ClerkProfile {
  email: string;
}

// Firma inyectable, igual que SessionVerifier (ver authenticate.test.ts).
export type ClerkProfileFetcher = (
  clerkUserId: string,
  secretKey: string,
) => Promise<ClerkProfile | null>;

// Solo se usa cuando el token es válido pero el clerk_user_id no coincide con ninguna
// fila de `users` (primer login de un socio creado por staff, Fase 4). Se exige que el
// correo esté VERIFICADO en Clerk antes de vincular una cuenta — nunca basta con que
// "diga" ese correo (CLAUDE.md sección 10, "Validación").
export const fetchClerkProfile: ClerkProfileFetcher = async (clerkUserId, secretKey) => {
  try {
    const client = createClerkClient({ secretKey });
    const user = await client.users.getUser(clerkUserId);
    const primary = user.emailAddresses.find(
      (address) =>
        address.id === user.primaryEmailAddressId && address.verification?.status === 'verified',
    );
    return primary ? { email: primary.emailAddress } : null;
  } catch {
    return null;
  }
};
