import { describe, expect, it } from 'vitest';
import { handleApiRequest } from './index';
import { createFakeUsersD1 } from './test-utils';
import type { Env } from './env';

// /api/health y la ruta 404 no tocan D1 ni Clerk; un Env mínimo basta.
const fakeEnv: Env = {
  DB: createFakeUsersD1([]),
  CLERK_SECRET_KEY: 'test-secret',
  RESEND_API_KEY: 'test-key',
};

describe('GET /api/health', () => {
  it('responde 200 con estado ok y un timestamp ISO válido', async () => {
    const response = await handleApiRequest(new Request('https://example.com/api/health'), fakeEnv);

    expect(response.status).toBe(200);
    const body = (await response.json()) as { status: string; timestamp: string };
    expect(body.status).toBe('ok');
    expect(() => new Date(body.timestamp).toISOString()).not.toThrow();
  });

  it('rechaza métodos distintos de GET', async () => {
    const response = await handleApiRequest(
      new Request('https://example.com/api/health', { method: 'POST' }),
      fakeEnv,
    );

    expect(response.status).toBe(405);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('METHOD_NOT_ALLOWED');
  });
});

describe('rutas /api/* desconocidas', () => {
  it('responde 404 con el formato de error estándar', async () => {
    const response = await handleApiRequest(
      new Request('https://example.com/api/no-existe'),
      fakeEnv,
    );

    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message.length).toBeGreaterThan(0);
  });
});
