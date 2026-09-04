import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../env';
import type { Membership } from '../memberships-repo';
import type { MembershipPlan } from '../membership-plans-repo';
import type { MemberDetail } from '../members-repo';

const authenticateMock = vi.fn();
vi.mock('../authenticate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../authenticate')>();
  return { ...actual, authenticate: (...args: unknown[]) => authenticateMock(...args) };
});

const listMembershipsMock = vi.fn();
const getMembershipByIdMock = vi.fn();
const createMembershipMock = vi.fn();
const renewMembershipMock = vi.fn();
vi.mock('../memberships-repo', () => ({
  listMemberships: (...args: unknown[]) => listMembershipsMock(...args),
  getMembershipById: (...args: unknown[]) => getMembershipByIdMock(...args),
  createMembership: (...args: unknown[]) => createMembershipMock(...args),
  renewMembership: (...args: unknown[]) => renewMembershipMock(...args),
}));

const getMembershipPlanByIdMock = vi.fn();
vi.mock('../membership-plans-repo', () => ({
  getMembershipPlanById: (...args: unknown[]) => getMembershipPlanByIdMock(...args),
}));

const getMemberByIdMock = vi.fn();
const getMemberByUserIdMock = vi.fn();
vi.mock('../members-repo', () => ({
  getMemberById: (...args: unknown[]) => getMemberByIdMock(...args),
  getMemberByUserId: (...args: unknown[]) => getMemberByUserIdMock(...args),
}));

const sendEmailWithResendMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../resend', () => ({
  sendEmailWithResend: (...args: unknown[]) => sendEmailWithResendMock(...args),
}));

vi.mock('../gym-settings-repo', () => ({
  getGymTimezone: vi.fn().mockResolvedValue('America/Bogota'),
  todayInTimezone: vi.fn().mockReturnValue('2026-09-02'),
}));

const {
  handleListMemberships,
  handleGetMembership,
  handleCreateMembership,
  handleRenewMembership,
  handleGetMyMembership,
} = await import('./memberships');

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
const memberUser = {
  id: 'user_member',
  role: 'member',
  email: 'm@test.dev',
  fullName: 'Member',
  isActive: true,
};
const sampleMemberProfile = { id: 'member_1' } as MemberDetail;
const trainer = {
  id: 'user_trainer',
  role: 'trainer',
  email: 't@test.dev',
  fullName: 'Trainer',
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

const sampleMember = { id: 'member_1' } as MemberDetail;

const sampleMembership: Membership = {
  id: 'membership_1',
  memberId: 'member_1',
  planId: 'plan_1',
  planName: 'Mensual',
  startDate: '2026-09-02',
  endDate: '2026-10-02',
  priceAgreed: 40,
  status: 'active',
  renewedFromId: null,
  expiryNoticeSentAt: null,
  createdAt: '2026-09-02T00:00:00.000Z',
  updatedAt: '2026-09-02T00:00:00.000Z',
  amountPaid: 40,
  debt: 0,
};

beforeEach(() => {
  authenticateMock.mockReset();
  listMembershipsMock.mockReset();
  getMembershipByIdMock.mockReset();
  createMembershipMock.mockReset();
  renewMembershipMock.mockReset();
  getMembershipPlanByIdMock.mockReset();
  getMemberByIdMock.mockReset();
  getMemberByUserIdMock.mockReset();
  sendEmailWithResendMock.mockClear();
});

describe('GET /api/memberships', () => {
  it('responde 403 para un entrenador', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: trainer });
    const response = await handleListMemberships(
      new Request('https://x.test/api/memberships'),
      fakeEnv,
    );
    expect(response.status).toBe(403);
  });

  it('responde 200 para admin', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: admin });
    listMembershipsMock.mockResolvedValue({
      items: [sampleMembership],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    const response = await handleListMemberships(
      new Request('https://x.test/api/memberships'),
      fakeEnv,
    );
    expect(response.status).toBe(200);
  });
});

describe('POST /api/memberships', () => {
  function makeRequest(body: unknown) {
    return new Request('https://x.test/api/memberships', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  it('responde 403 para un entrenador', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: trainer });
    const response = await handleCreateMembership(
      makeRequest({ memberId: 'm1', planId: 'p1' }),
      fakeEnv,
    );
    expect(response.status).toBe(403);
    expect(createMembershipMock).not.toHaveBeenCalled();
  });

  it('responde 404 si el socio no existe', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: admin });
    getMemberByIdMock.mockResolvedValue(null);
    const response = await handleCreateMembership(
      makeRequest({ memberId: 'no-existe', planId: 'plan_1' }),
      fakeEnv,
    );
    expect(response.status).toBe(404);
  });

  it('responde 404 si el plan no existe o está inactivo', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: admin });
    getMemberByIdMock.mockResolvedValue(sampleMember);
    getMembershipPlanByIdMock.mockResolvedValue({ ...samplePlan, isActive: false });
    const response = await handleCreateMembership(
      makeRequest({ memberId: 'member_1', planId: 'plan_1' }),
      fakeEnv,
    );
    expect(response.status).toBe(404);
  });

  it('responde 403 si recepcionista intenta fijar un precio distinto al del plan', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: receptionist });
    const response = await handleCreateMembership(
      makeRequest({ memberId: 'member_1', planId: 'plan_1', priceOverride: 20 }),
      fakeEnv,
    );
    expect(response.status).toBe(403);
    expect(createMembershipMock).not.toHaveBeenCalled();
  });

  it('usa el precio del plan cuando recepcionista no manda priceOverride', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: receptionist });
    getMemberByIdMock.mockResolvedValue(sampleMember);
    getMembershipPlanByIdMock.mockResolvedValue(samplePlan);
    createMembershipMock.mockResolvedValue(sampleMembership);

    const response = await handleCreateMembership(
      makeRequest({ memberId: 'member_1', planId: 'plan_1' }),
      fakeEnv,
    );

    expect(response.status).toBe(201);
    expect(createMembershipMock).toHaveBeenCalledWith(
      fakeEnv.DB,
      expect.objectContaining({ price: 40 }),
      samplePlan,
      receptionist.id,
      '2026-09-02',
    );
  });

  it('permite a admin fijar un precio distinto al del plan', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: admin });
    getMemberByIdMock.mockResolvedValue(sampleMember);
    getMembershipPlanByIdMock.mockResolvedValue(samplePlan);
    createMembershipMock.mockResolvedValue({ ...sampleMembership, priceAgreed: 25 });

    const response = await handleCreateMembership(
      makeRequest({ memberId: 'member_1', planId: 'plan_1', priceOverride: 25 }),
      fakeEnv,
    );

    expect(response.status).toBe(201);
    expect(createMembershipMock).toHaveBeenCalledWith(
      fakeEnv.DB,
      expect.objectContaining({ price: 25 }),
      samplePlan,
      admin.id,
      '2026-09-02',
    );
  });
});

describe('POST /api/memberships/:id/renew', () => {
  it('acepta un cuerpo vacío (usa el mismo plan y precio vigente)', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: admin });
    getMembershipByIdMock.mockResolvedValue(sampleMembership);
    getMembershipPlanByIdMock.mockResolvedValue(samplePlan);
    renewMembershipMock.mockResolvedValue({
      ...sampleMembership,
      id: 'membership_2',
      renewedFromId: 'membership_1',
    });

    const request = new Request('https://x.test/api/memberships/membership_1/renew', {
      method: 'POST',
    });
    const response = await handleRenewMembership(request, fakeEnv, 'membership_1');

    expect(response.status).toBe(201);
    const body = (await response.json()) as { renewedFromId: string };
    expect(body.renewedFromId).toBe('membership_1');
  });

  it('responde 404 si la membresía a renovar no existe', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: admin });
    getMembershipByIdMock.mockResolvedValue(null);
    const request = new Request('https://x.test/api/memberships/no-existe/renew', {
      method: 'POST',
    });
    const response = await handleRenewMembership(request, fakeEnv, 'no-existe');
    expect(response.status).toBe(404);
  });

  it('responde 403 para un entrenador', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: trainer });
    const request = new Request('https://x.test/api/memberships/membership_1/renew', {
      method: 'POST',
    });
    const response = await handleRenewMembership(request, fakeEnv, 'membership_1');
    expect(response.status).toBe(403);
    expect(renewMembershipMock).not.toHaveBeenCalled();
  });
});

describe('GET /api/memberships/:id', () => {
  it('responde 404 si no existe', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: admin });
    getMembershipByIdMock.mockResolvedValue(null);
    const response = await handleGetMembership(
      new Request('https://x.test/api/memberships/no-existe'),
      fakeEnv,
      'no-existe',
    );
    expect(response.status).toBe(404);
  });

  it('responde 200 con el detalle', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: receptionist });
    getMembershipByIdMock.mockResolvedValue(sampleMembership);
    const response = await handleGetMembership(
      new Request('https://x.test/api/memberships/membership_1'),
      fakeEnv,
      'membership_1',
    );
    expect(response.status).toBe(200);
  });
});

describe('GET /api/me/membership', () => {
  it('responde 404 si la cuenta no tiene perfil de socio', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: admin });
    getMemberByUserIdMock.mockResolvedValue(null);
    const response = await handleGetMyMembership(
      new Request('https://x.test/api/me/membership'),
      fakeEnv,
    );
    expect(response.status).toBe(404);
  });

  it('responde 404 si el socio no tiene ninguna membresía registrada', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: memberUser });
    getMemberByUserIdMock.mockResolvedValue(sampleMemberProfile);
    listMembershipsMock.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 1 });
    const response = await handleGetMyMembership(
      new Request('https://x.test/api/me/membership'),
      fakeEnv,
    );
    expect(response.status).toBe(404);
  });

  it('responde 200 con la membresía más reciente del socio', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: memberUser });
    getMemberByUserIdMock.mockResolvedValue(sampleMemberProfile);
    listMembershipsMock.mockResolvedValue({
      items: [sampleMembership],
      total: 1,
      page: 1,
      pageSize: 1,
    });

    const response = await handleGetMyMembership(
      new Request('https://x.test/api/me/membership'),
      fakeEnv,
    );

    expect(response.status).toBe(200);
    expect(listMembershipsMock).toHaveBeenCalledWith(
      fakeEnv.DB,
      expect.objectContaining({ memberId: 'member_1' }),
      '2026-09-02',
    );
  });
});
