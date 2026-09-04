import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../env';
import type { AttendanceRecord } from '../attendance-repo';
import type { MemberDetail } from '../members-repo';

const authenticateMock = vi.fn();
vi.mock('../authenticate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../authenticate')>();
  return { ...actual, authenticate: (...args: unknown[]) => authenticateMock(...args) };
});

const listAttendanceMock = vi.fn();
const createAttendanceMock = vi.fn();
const getAttendanceSummaryMock = vi.fn();
vi.mock('../attendance-repo', () => ({
  listAttendance: (...args: unknown[]) => listAttendanceMock(...args),
  createAttendance: (...args: unknown[]) => createAttendanceMock(...args),
  getAttendanceSummary: (...args: unknown[]) => getAttendanceSummaryMock(...args),
}));

const getMemberByIdMock = vi.fn();
const getMemberByUserIdMock = vi.fn();
const getMemberByNationalIdMock = vi.fn();
vi.mock('../members-repo', () => ({
  getMemberById: (...args: unknown[]) => getMemberByIdMock(...args),
  getMemberByUserId: (...args: unknown[]) => getMemberByUserIdMock(...args),
  getMemberByNationalId: (...args: unknown[]) => getMemberByNationalIdMock(...args),
}));

const listMembershipsMock = vi.fn();
vi.mock('../memberships-repo', () => ({
  listMemberships: (...args: unknown[]) => listMembershipsMock(...args),
}));

vi.mock('../gym-settings-repo', () => ({
  getGymTimezone: vi.fn().mockResolvedValue('America/Bogota'),
  todayInTimezone: vi.fn().mockReturnValue('2026-09-02'),
}));

const {
  handleListAttendance,
  handleGetAttendanceSummary,
  handleCreateAttendance,
  handleKioskCheckIn,
  handleGetMyAttendance,
} = await import('./attendance');

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
const trainer = {
  id: 'user_trainer',
  role: 'trainer',
  email: 't@test.dev',
  fullName: 'Trainer',
  isActive: true,
};
const memberUser = {
  id: 'user_member',
  role: 'member',
  email: 'm@test.dev',
  fullName: 'Member',
  isActive: true,
};

const sampleMember = { id: 'member_1', isActive: true } as MemberDetail;

const sampleKioskMember = {
  id: 'member_1',
  memberCode: 'SOC-0001',
  fullName: 'Socio Uno',
  isActive: true,
} as MemberDetail;

function sampleMembership(
  status: 'active' | 'expired' | 'pending' | 'suspended' | 'cancelled',
  debt = 0,
) {
  return {
    id: 'ms_1',
    memberId: 'member_1',
    planId: 'plan_1',
    planName: 'Mensual',
    startDate: '2026-08-01',
    endDate: '2026-09-30',
    priceAgreed: 50,
    status,
    renewedFromId: null,
    expiryNoticeSentAt: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    amountPaid: 50 - debt,
    debt,
  };
}

const sampleAttendance: AttendanceRecord = {
  id: 'att_1',
  memberId: 'member_1',
  memberFullName: 'Socio Uno',
  checkedInAt: '2026-09-02T10:00:00.000Z',
  source: 'manual',
  recordedBy: 'user_recep',
};

beforeEach(() => {
  authenticateMock.mockReset();
  listAttendanceMock.mockReset();
  createAttendanceMock.mockReset();
  getAttendanceSummaryMock.mockReset();
  getMemberByIdMock.mockReset();
  getMemberByUserIdMock.mockReset();
  getMemberByNationalIdMock.mockReset();
  listMembershipsMock.mockReset();
});

describe('GET /api/attendance', () => {
  it('responde 403 para un socio', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: memberUser });
    const response = await handleListAttendance(
      new Request('https://x.test/api/attendance'),
      fakeEnv,
    );
    expect(response.status).toBe(403);
  });

  it('responde 200 para recepcionista', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: receptionist });
    listAttendanceMock.mockResolvedValue({
      items: [sampleAttendance],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    const response = await handleListAttendance(
      new Request('https://x.test/api/attendance'),
      fakeEnv,
    );
    expect(response.status).toBe(200);
  });
});

describe('GET /api/attendance/summary', () => {
  it('responde 403 para un entrenador', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: trainer });
    const response = await handleGetAttendanceSummary(
      new Request('https://x.test/api/attendance/summary'),
      fakeEnv,
    );
    expect(response.status).toBe(403);
  });

  it('responde 200 con el resumen para admin', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: admin });
    getAttendanceSummaryMock.mockResolvedValue({ today: 3, last30Days: 40 });
    const response = await handleGetAttendanceSummary(
      new Request('https://x.test/api/attendance/summary'),
      fakeEnv,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { today: number };
    expect(body.today).toBe(3);
  });
});

describe('POST /api/attendance', () => {
  function makeRequest(body: unknown) {
    return new Request('https://x.test/api/attendance', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  it('responde 403 para un entrenador', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: trainer });
    const response = await handleCreateAttendance(makeRequest({ memberId: 'member_1' }), fakeEnv);
    expect(response.status).toBe(403);
    expect(createAttendanceMock).not.toHaveBeenCalled();
  });

  it('responde 404 si el socio no existe', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: admin });
    getMemberByIdMock.mockResolvedValue(null);
    const response = await handleCreateAttendance(makeRequest({ memberId: 'no-existe' }), fakeEnv);
    expect(response.status).toBe(404);
  });

  it('responde 409 si el socio está desactivado', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: admin });
    getMemberByIdMock.mockResolvedValue({ ...sampleMember, isActive: false });
    const response = await handleCreateAttendance(makeRequest({ memberId: 'member_1' }), fakeEnv);
    expect(response.status).toBe(409);
    expect(createAttendanceMock).not.toHaveBeenCalled();
  });

  it('responde 409 si el repositorio detecta un duplicado reciente', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: receptionist });
    getMemberByIdMock.mockResolvedValue(sampleMember);
    createAttendanceMock.mockResolvedValue({
      kind: 'duplicate',
      lastCheckedInAt: '2026-09-02T09:30:00.000Z',
    });

    const response = await handleCreateAttendance(makeRequest({ memberId: 'member_1' }), fakeEnv);

    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('DUPLICATE_ATTENDANCE');
  });

  it('responde 201 con datos válidos', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: receptionist });
    getMemberByIdMock.mockResolvedValue(sampleMember);
    createAttendanceMock.mockResolvedValue({ kind: 'created', attendance: sampleAttendance });

    const response = await handleCreateAttendance(makeRequest({ memberId: 'member_1' }), fakeEnv);

    expect(response.status).toBe(201);
  });
});

describe('POST /api/attendance/check-in', () => {
  function makeRequest(body: unknown) {
    return new Request('https://x.test/api/attendance/check-in', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  it('responde 403 para un entrenador', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: trainer });
    const response = await handleKioskCheckIn(makeRequest({ nationalId: '12345678' }), fakeEnv);
    expect(response.status).toBe(403);
    expect(getMemberByNationalIdMock).not.toHaveBeenCalled();
  });

  it('responde 422 sin nationalId', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: receptionist });
    const response = await handleKioskCheckIn(makeRequest({}), fakeEnv);
    expect(response.status).toBe(422);
  });

  it('responde 404 si no hay socio con esa identificación', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: receptionist });
    getMemberByNationalIdMock.mockResolvedValue(null);
    const response = await handleKioskCheckIn(makeRequest({ nationalId: '000' }), fakeEnv);
    expect(response.status).toBe(404);
  });

  it('responde 409 si el socio está desactivado', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: receptionist });
    getMemberByNationalIdMock.mockResolvedValue({ ...sampleKioskMember, isActive: false });
    const response = await handleKioskCheckIn(makeRequest({ nationalId: '12345678' }), fakeEnv);
    expect(response.status).toBe(409);
    expect(listMembershipsMock).not.toHaveBeenCalled();
  });

  it('responde 409 sin membresía asignada', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: receptionist });
    getMemberByNationalIdMock.mockResolvedValue(sampleKioskMember);
    listMembershipsMock.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 1 });
    const response = await handleKioskCheckIn(makeRequest({ nationalId: '12345678' }), fakeEnv);
    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('NO_MEMBERSHIP');
    expect(createAttendanceMock).not.toHaveBeenCalled();
  });

  it('responde 409 con membresía vencida', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: admin });
    getMemberByNationalIdMock.mockResolvedValue(sampleKioskMember);
    listMembershipsMock.mockResolvedValue({
      items: [sampleMembership('expired')],
      total: 1,
      page: 1,
      pageSize: 1,
    });
    const response = await handleKioskCheckIn(makeRequest({ nationalId: '12345678' }), fakeEnv);
    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('MEMBERSHIP_NOT_ACTIVE');
    expect(createAttendanceMock).not.toHaveBeenCalled();
  });

  it('responde 409 si ya hay un ingreso reciente (duplicado)', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: admin });
    getMemberByNationalIdMock.mockResolvedValue(sampleKioskMember);
    listMembershipsMock.mockResolvedValue({
      items: [sampleMembership('active')],
      total: 1,
      page: 1,
      pageSize: 1,
    });
    createAttendanceMock.mockResolvedValue({
      kind: 'duplicate',
      lastCheckedInAt: '2026-09-02T09:30:00.000Z',
    });
    const response = await handleKioskCheckIn(makeRequest({ nationalId: '12345678' }), fakeEnv);
    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('DUPLICATE_ATTENDANCE');
  });

  it('responde 201 con membresía activa', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: admin });
    getMemberByNationalIdMock.mockResolvedValue(sampleKioskMember);
    listMembershipsMock.mockResolvedValue({
      items: [sampleMembership('active')],
      total: 1,
      page: 1,
      pageSize: 1,
    });
    createAttendanceMock.mockResolvedValue({ kind: 'created', attendance: sampleAttendance });

    const response = await handleKioskCheckIn(makeRequest({ nationalId: '12345678' }), fakeEnv);

    expect(response.status).toBe(201);
    const body = (await response.json()) as { member: { fullName: string } };
    expect(body.member.fullName).toBe('Socio Uno');
  });

  it('responde 201 con membresía activa pero deuda pendiente (no bloquea el ingreso)', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: admin });
    getMemberByNationalIdMock.mockResolvedValue(sampleKioskMember);
    listMembershipsMock.mockResolvedValue({
      items: [sampleMembership('active', 20)],
      total: 1,
      page: 1,
      pageSize: 1,
    });
    createAttendanceMock.mockResolvedValue({ kind: 'created', attendance: sampleAttendance });

    const response = await handleKioskCheckIn(makeRequest({ nationalId: '12345678' }), fakeEnv);

    expect(response.status).toBe(201);
    const body = (await response.json()) as { membership: { debt: number } };
    expect(body.membership.debt).toBe(20);
  });
});

describe('GET /api/me/attendance', () => {
  it('responde 401 sin autenticación', async () => {
    authenticateMock.mockResolvedValue({ kind: 'unauthenticated' });
    const response = await handleGetMyAttendance(
      new Request('https://x.test/api/me/attendance'),
      fakeEnv,
    );
    expect(response.status).toBe(401);
  });

  it('responde 404 si la cuenta autenticada no tiene perfil de socio', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: admin });
    getMemberByUserIdMock.mockResolvedValue(null);
    const response = await handleGetMyAttendance(
      new Request('https://x.test/api/me/attendance'),
      fakeEnv,
    );
    expect(response.status).toBe(404);
  });

  it('responde 200 y fuerza memberId al propio, ignorando cualquier otro filtro', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: memberUser });
    getMemberByUserIdMock.mockResolvedValue(sampleMember);
    listAttendanceMock.mockResolvedValue({
      items: [sampleAttendance],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    const response = await handleGetMyAttendance(
      new Request('https://x.test/api/me/attendance?memberId=otro-socio'),
      fakeEnv,
    );

    expect(response.status).toBe(200);
    expect(listAttendanceMock).toHaveBeenCalledWith(
      fakeEnv.DB,
      expect.objectContaining({ memberId: 'member_1' }),
    );
  });
});
