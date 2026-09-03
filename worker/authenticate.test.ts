import { describe, expect, it } from 'vitest';
import { authenticate, requireRole } from './authenticate';
import { createFakeUsersD1, type FakeUserRow } from './test-utils';
import type { Env } from './env';
import type { ClerkProfileFetcher, SessionVerifier } from './clerk';
import type { UserRecord } from './users-repo';

const activeAdmin: FakeUserRow = {
  id: 'user_1',
  clerk_user_id: 'clerk_1',
  email: 'admin@example.test',
  full_name: 'Admin Demo',
  role: 'admin',
  is_active: 1,
};

const inactiveMember: FakeUserRow = {
  id: 'user_2',
  clerk_user_id: 'clerk_2',
  email: 'socio@example.test',
  full_name: 'Socio Inactivo',
  role: 'member',
  is_active: 0,
};

const unclaimedMember: FakeUserRow = {
  id: 'user_3',
  clerk_user_id: 'unclaimed:user_3',
  email: 'nuevo@example.test',
  full_name: 'Socio Nuevo',
  role: 'member',
  is_active: 1,
};

function makeEnv(users: FakeUserRow[] = [activeAdmin, inactiveMember, unclaimedMember]): Env {
  return {
    DB: createFakeUsersD1(users),
    CLERK_SECRET_KEY: 'test-secret',
    RESEND_API_KEY: 'test-key',
  };
}

// Verificador simulado: nunca golpea la red real de Clerk.
function fakeVerifier(tokenToClerkId: Record<string, string>): SessionVerifier {
  return async (token) => {
    const clerkUserId = tokenToClerkId[token];
    return clerkUserId ? { clerkUserId } : null;
  };
}

// Por defecto no hay perfil (simula que Clerk no devuelve nada / no aplica), salvo que
// una prueba concreta lo necesite para probar la vinculación automática.
function fakeProfileFetcher(clerkIdToEmail: Record<string, string> = {}): ClerkProfileFetcher {
  return async (clerkUserId) => {
    const email = clerkIdToEmail[clerkUserId];
    return email ? { email } : null;
  };
}

describe('authenticate', () => {
  it('rechaza cuando no hay header Authorization', async () => {
    const request = new Request('https://example.com/api/me');
    const result = await authenticate(request, makeEnv(), fakeVerifier({}), fakeProfileFetcher());
    expect(result.kind).toBe('unauthenticated');
  });

  it('rechaza un header Authorization sin el esquema Bearer', async () => {
    const request = new Request('https://example.com/api/me', {
      headers: { Authorization: 'Basic algo' },
    });
    const result = await authenticate(request, makeEnv(), fakeVerifier({}), fakeProfileFetcher());
    expect(result.kind).toBe('unauthenticated');
  });

  it('rechaza un token que Clerk no puede verificar', async () => {
    const request = new Request('https://example.com/api/me', {
      headers: { Authorization: 'Bearer invalido' },
    });
    const result = await authenticate(request, makeEnv(), fakeVerifier({}), fakeProfileFetcher());
    expect(result.kind).toBe('unauthenticated');
  });

  it('rechaza un token válido sin fila correspondiente y sin perfil de Clerk que lo resuelva', async () => {
    const request = new Request('https://example.com/api/me', {
      headers: { Authorization: 'Bearer tok' },
    });
    const result = await authenticate(
      request,
      makeEnv(),
      fakeVerifier({ tok: 'clerk_desconocido' }),
      fakeProfileFetcher(),
    );
    expect(result.kind).toBe('unauthorized');
  });

  it('rechaza un usuario desactivado aunque el token sea válido', async () => {
    const request = new Request('https://example.com/api/me', {
      headers: { Authorization: 'Bearer tok' },
    });
    const result = await authenticate(
      request,
      makeEnv(),
      fakeVerifier({ tok: 'clerk_2' }),
      fakeProfileFetcher(),
    );
    expect(result.kind).toBe('unauthorized');
  });

  it('autentica correctamente a un usuario activo y resuelve su rol desde D1', async () => {
    const request = new Request('https://example.com/api/me', {
      headers: { Authorization: 'Bearer tok' },
    });
    const result = await authenticate(
      request,
      makeEnv(),
      fakeVerifier({ tok: 'clerk_1' }),
      fakeProfileFetcher(),
    );
    expect(result.kind).toBe('authenticated');
    if (result.kind === 'authenticated') {
      expect(result.user.role).toBe('admin');
      expect(result.user.email).toBe('admin@example.test');
    }
  });

  it('vincula automáticamente una cuenta de socio sin clerk_user_id real, por correo verificado', async () => {
    const env = makeEnv();
    const request = new Request('https://example.com/api/me', {
      headers: { Authorization: 'Bearer tok' },
    });

    const result = await authenticate(
      request,
      env,
      fakeVerifier({ tok: 'clerk_nuevo' }),
      fakeProfileFetcher({ clerk_nuevo: 'nuevo@example.test' }),
    );

    expect(result.kind).toBe('authenticated');
    if (result.kind === 'authenticated') {
      expect(result.user.id).toBe('user_3');
      expect(result.user.clerkUserId).toBe('clerk_nuevo');
    }

    // La vinculación quedó persistida: un segundo request ya no necesita el fetcher de perfil.
    const secondRequest = new Request('https://example.com/api/me', {
      headers: { Authorization: 'Bearer tok2' },
    });
    const secondResult = await authenticate(
      secondRequest,
      env,
      fakeVerifier({ tok2: 'clerk_nuevo' }),
      fakeProfileFetcher(),
    );
    expect(secondResult.kind).toBe('authenticated');
  });

  it('no vincula por correo si Clerk no lo reporta como verificado (o no hay perfil)', async () => {
    const request = new Request('https://example.com/api/me', {
      headers: { Authorization: 'Bearer tok' },
    });
    const result = await authenticate(
      request,
      makeEnv(),
      fakeVerifier({ tok: 'clerk_nuevo' }),
      fakeProfileFetcher(), // sin mapeo: simula que Clerk no devolvió un correo verificado
    );
    expect(result.kind).toBe('unauthorized');
  });
});

describe('requireRole', () => {
  const admin = { role: 'admin' } as UserRecord;
  const member = { role: 'member' } as UserRecord;

  it('permite cuando el rol del usuario está en la lista permitida', () => {
    expect(requireRole(admin, ['admin', 'receptionist'])).toBe(true);
  });

  it('rechaza cuando el rol del usuario no está en la lista permitida', () => {
    expect(requireRole(member, ['admin', 'receptionist'])).toBe(false);
  });
});
