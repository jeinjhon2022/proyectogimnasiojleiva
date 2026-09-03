import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../env';
import type { MembershipPlan } from '../membership-plans-repo';

const authenticateMock = vi.fn();
vi.mock('../authenticate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../authenticate')>();
  return { ...actual, authenticate: (...args: unknown[]) => authenticateMock(...args) };
});

const listMembershipPlansMock = vi.fn();
const createMembershipPlanMock = vi.fn();
vi.mock('../membership-plans-repo', () => ({
  listMembershipPlans: (...args: unknown[]) => listMembershipPlansMock(...args),
  createMembershipPlan: (...args: unknown[]) => createMembershipPlanMock(...args),
}));

const { handleListMembershipPlans, handleCreateMembershipPlan } =
  await import('./membership-plans');

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

const samplePlan: MembershipPlan = {
  id: 'plan_1',
  name: 'Mensual',
  durationDays: 30,
  price: 40,
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  authenticateMock.mockReset();
  listMembershipPlansMock.mockReset();
  createMembershipPlanMock.mockReset();
});

describe('GET /api/membership-plans', () => {
  it('responde 401 sin autenticación', async () => {
    authenticateMock.mockResolvedValue({ kind: 'unauthenticated' });
    const response = await handleListMembershipPlans(
      new Request('https://x.test/api/membership-plans'),
      fakeEnv,
    );
    expect(response.status).toBe(401);
  });

  it('responde 200 con la lista para recepcionista', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: receptionist });
    listMembershipPlansMock.mockResolvedValue([samplePlan]);
    const response = await handleListMembershipPlans(
      new Request('https://x.test/api/membership-plans'),
      fakeEnv,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { items: MembershipPlan[] };
    expect(body.items).toHaveLength(1);
  });
});

describe('POST /api/membership-plans', () => {
  function makeRequest(body: unknown) {
    return new Request('https://x.test/api/membership-plans', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  it('responde 403 para recepcionista (solo admin crea planes)', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: receptionist });
    const response = await handleCreateMembershipPlan(
      makeRequest({ name: 'X', durationDays: 30, price: 10 }),
      fakeEnv,
    );
    expect(response.status).toBe(403);
    expect(createMembershipPlanMock).not.toHaveBeenCalled();
  });

  it('responde 422 con datos inválidos', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: admin });
    const response = await handleCreateMembershipPlan(
      makeRequest({ name: 'X', durationDays: 0, price: 10 }),
      fakeEnv,
    );
    expect(response.status).toBe(422);
  });

  it('responde 201 para admin con datos válidos', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: admin });
    createMembershipPlanMock.mockResolvedValue(samplePlan);
    const response = await handleCreateMembershipPlan(
      makeRequest({ name: 'Mensual', durationDays: 30, price: 40 }),
      fakeEnv,
    );
    expect(response.status).toBe(201);
  });
});
