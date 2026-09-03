import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../env';
import { createFakeUsersD1, type FakeUserRow } from '../test-utils';

// Se simula el verificador de Clerk a nivel de módulo para no depender de red real;
// los casos con verificador inyectado están cubiertos en ../authenticate.test.ts.
vi.mock('../clerk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../clerk')>();
  return {
    ...actual,
    verifyClerkSession: vi.fn(async (token: string) =>
      token === 'valid-token' ? { clerkUserId: 'clerk_1' } : null,
    ),
  };
});

const { handleGetMe } = await import('./me');

const activeAdmin: FakeUserRow = {
  id: 'user_1',
  clerk_user_id: 'clerk_1',
  email: 'admin@example.test',
  full_name: 'Admin Demo',
  role: 'admin',
  is_active: 1,
};

function makeEnv(): Env {
  return {
    DB: createFakeUsersD1([activeAdmin]),
    CLERK_SECRET_KEY: 'test-secret',
    RESEND_API_KEY: 'test-key',
  };
}

describe('GET /api/me', () => {
  it('responde 401 sin token', async () => {
    const response = await handleGetMe(new Request('https://example.com/api/me'), makeEnv());
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('UNAUTHENTICATED');
  });

  it('responde 401 con un token inválido', async () => {
    const request = new Request('https://example.com/api/me', {
      headers: { Authorization: 'Bearer no-valido' },
    });
    const response = await handleGetMe(request, makeEnv());
    expect(response.status).toBe(401);
  });

  it('responde 200 con el perfil del usuario autenticado, sin exponer clerk_user_id', async () => {
    const request = new Request('https://example.com/api/me', {
      headers: { Authorization: 'Bearer valid-token' },
    });
    const response = await handleGetMe(request, makeEnv());
    expect(response.status).toBe(200);

    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toEqual({
      id: 'user_1',
      email: 'admin@example.test',
      fullName: 'Admin Demo',
      role: 'admin',
    });
  });
});
