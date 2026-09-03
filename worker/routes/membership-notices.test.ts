import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../env';

const authenticateMock = vi.fn();
vi.mock('../authenticate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../authenticate')>();
  return { ...actual, authenticate: (...args: unknown[]) => authenticateMock(...args) };
});

const runExpiryNoticeJobMock = vi.fn();
const runExpiredNoticeJobMock = vi.fn();
vi.mock('../jobs/expiry-notices', () => ({
  runExpiryNoticeJob: (...args: unknown[]) => runExpiryNoticeJobMock(...args),
  runExpiredNoticeJob: (...args: unknown[]) => runExpiredNoticeJobMock(...args),
}));

const { handleRunExpiryNotices } = await import('./membership-notices');

const fakeEnv = {} as Env;
const admin = {
  id: 'user_admin',
  role: 'admin',
  email: 'a@test.dev',
  fullName: 'Admin',
  isActive: true,
};
const receptionist = {
  id: 'user_recep',
  role: 'receptionist',
  email: 'r@test.dev',
  fullName: 'Recep',
  isActive: true,
};

beforeEach(() => {
  authenticateMock.mockReset();
  runExpiryNoticeJobMock.mockReset();
  runExpiredNoticeJobMock.mockReset();
});

describe('POST /api/membership-notices/run', () => {
  it('responde 401 sin autenticación', async () => {
    authenticateMock.mockResolvedValue({ kind: 'unauthenticated' });
    const response = await handleRunExpiryNotices(
      new Request('https://x.test', { method: 'POST' }),
      fakeEnv,
    );
    expect(response.status).toBe(401);
  });

  it('responde 403 para recepcionista (solo admin dispara el envío)', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: receptionist });
    const response = await handleRunExpiryNotices(
      new Request('https://x.test', { method: 'POST' }),
      fakeEnv,
    );
    expect(response.status).toBe(403);
    expect(runExpiryNoticeJobMock).not.toHaveBeenCalled();
    expect(runExpiredNoticeJobMock).not.toHaveBeenCalled();
  });

  it('responde 200 con el resultado de ambos jobs para admin', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: admin });
    runExpiryNoticeJobMock.mockResolvedValue({ sent: 2, failed: 0 });
    runExpiredNoticeJobMock.mockResolvedValue({ sent: 1, failed: 0 });

    const response = await handleRunExpiryNotices(
      new Request('https://x.test', { method: 'POST' }),
      fakeEnv,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { expiringSoon: unknown; expired: unknown };
    expect(body).toEqual({ expiringSoon: { sent: 2, failed: 0 }, expired: { sent: 1, failed: 0 } });
  });
});
