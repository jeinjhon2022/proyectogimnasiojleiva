import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../env';
import type { MemberDetail } from '../members-repo';

const authenticateMock = vi.fn();

vi.mock('../authenticate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../authenticate')>();
  return {
    ...actual,
    authenticate: (...args: unknown[]) => authenticateMock(...args),
  };
});

const listMembersMock = vi.fn();
const createMemberMock = vi.fn();
const getMemberByIdMock = vi.fn();
const updateMemberMock = vi.fn();
const deactivateMemberMock = vi.fn();

vi.mock('../members-repo', () => ({
  listMembers: (...args: unknown[]) => listMembersMock(...args),
  createMember: (...args: unknown[]) => createMemberMock(...args),
  getMemberById: (...args: unknown[]) => getMemberByIdMock(...args),
  updateMember: (...args: unknown[]) => updateMemberMock(...args),
  deactivateMember: (...args: unknown[]) => deactivateMemberMock(...args),
}));

const isMemberAssignedToTrainerMock = vi.fn();
const sendEmailWithResendMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../resend', () => ({
  sendEmailWithResend: (...args: unknown[]) => sendEmailWithResendMock(...args),
}));

vi.mock('../routines-repo', () => ({
  isMemberAssignedToTrainer: (...args: unknown[]) => isMemberAssignedToTrainerMock(...args),
}));

const {
  handleListMembers,
  handleCreateMember,
  handleGetMember,
  handleUpdateMember,
  handleDeactivateMember,
} = await import('./members');

const fakeEnv = {} as Env;

const admin = {
  id: 'user_admin',
  clerkUserId: 'clerk_admin',
  email: 'admin@test.dev',
  fullName: 'Admin',
  role: 'admin',
  isActive: true,
};
const receptionist = {
  id: 'user_recep',
  clerkUserId: 'clerk_recep',
  email: 'r@test.dev',
  fullName: 'Recep',
  role: 'receptionist',
  isActive: true,
};
const trainer = {
  id: 'user_trainer',
  clerkUserId: 'clerk_trainer',
  email: 't@test.dev',
  fullName: 'Trainer',
  role: 'trainer',
  isActive: true,
};
const memberUser = {
  id: 'user_member',
  clerkUserId: 'clerk_member',
  email: 'm@test.dev',
  fullName: 'Member',
  role: 'member',
  isActive: true,
};

const sampleMember: MemberDetail = {
  id: 'member_1',
  memberCode: 'SOC-0001',
  fullName: 'Socio Uno',
  email: 'socio1@test.dev',
  phone: null,
  birthDate: null,
  joinDate: '2026-01-01',
  isActive: true,
  notes: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  authenticateMock.mockReset();
  listMembersMock.mockReset();
  createMemberMock.mockReset();
  getMemberByIdMock.mockReset();
  updateMemberMock.mockReset();
  deactivateMemberMock.mockReset();
  isMemberAssignedToTrainerMock.mockReset();
  sendEmailWithResendMock.mockClear();
});

describe('GET /api/members', () => {
  it('responde 401 sin autenticación', async () => {
    authenticateMock.mockResolvedValue({ kind: 'unauthenticated' });
    const response = await handleListMembers(new Request('https://x.test/api/members'), fakeEnv);
    expect(response.status).toBe(401);
  });

  it('responde 200 para un entrenador, pero sin correo/teléfono (Fase 8: puede buscar para asignar rutinas)', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: trainer });
    listMembersMock.mockResolvedValue({
      items: [
        {
          id: 'member_1',
          memberCode: 'SOC-0001',
          fullName: 'Socio Uno',
          email: 'socio1@test.dev',
          phone: '555',
          isActive: true,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    const response = await handleListMembers(new Request('https://x.test/api/members'), fakeEnv);

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      items: Array<{ email: string | null; phone: string | null }>;
    };
    expect(body.items[0]?.email).toBeNull();
    expect(body.items[0]?.phone).toBeNull();
  });

  it('responde 403 para un socio', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: memberUser });
    const response = await handleListMembers(new Request('https://x.test/api/members'), fakeEnv);
    expect(response.status).toBe(403);
  });

  it('responde 200 para admin, parseando page/pageSize/q', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: admin });
    listMembersMock.mockResolvedValue({ items: [], total: 0, page: 2, pageSize: 10 });

    const response = await handleListMembers(
      new Request('https://x.test/api/members?page=2&pageSize=10&q=ana'),
      fakeEnv,
    );

    expect(response.status).toBe(200);
    expect(listMembersMock).toHaveBeenCalledWith(fakeEnv.DB, { page: 2, pageSize: 10, q: 'ana' });
  });

  it('responde 422 con parámetros inválidos (evita exportaciones sin límite)', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: receptionist });
    const response = await handleListMembers(
      new Request('https://x.test/api/members?pageSize=1000'),
      fakeEnv,
    );
    expect(response.status).toBe(422);
  });
});

describe('POST /api/members', () => {
  function makeRequest(body: unknown) {
    return new Request('https://x.test/api/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('responde 403 para un entrenador', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: trainer });
    const response = await handleCreateMember(
      makeRequest({ fullName: 'X', email: 'x@test.dev' }),
      fakeEnv,
    );
    expect(response.status).toBe(403);
    expect(createMemberMock).not.toHaveBeenCalled();
  });

  it('responde 422 con datos inválidos (falta el correo)', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: admin });
    const response = await handleCreateMember(makeRequest({ fullName: 'X' }), fakeEnv);
    expect(response.status).toBe(422);
    expect(createMemberMock).not.toHaveBeenCalled();
  });

  it('responde 201 con datos válidos', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: receptionist });
    createMemberMock.mockResolvedValue(sampleMember);

    const response = await handleCreateMember(
      makeRequest({ fullName: 'Socio Uno', email: 'socio1@test.dev' }),
      fakeEnv,
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as { memberCode: string };
    expect(body.memberCode).toBe('SOC-0001');
    expect(createMemberMock).toHaveBeenCalledWith(
      fakeEnv.DB,
      expect.objectContaining({ fullName: 'Socio Uno', email: 'socio1@test.dev' }),
      receptionist.id,
    );
  });

  it('responde 409 si el repositorio lanza (típicamente correo duplicado)', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: admin });
    createMemberMock.mockRejectedValue(new Error('UNIQUE constraint failed'));

    const response = await handleCreateMember(
      makeRequest({ fullName: 'X', email: 'dup@test.dev' }),
      fakeEnv,
    );
    expect(response.status).toBe(409);
  });
});

describe('GET /api/members/:id', () => {
  it('responde 404 si no existe', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: admin });
    getMemberByIdMock.mockResolvedValue(null);
    const response = await handleGetMember(
      new Request('https://x.test/api/members/no-existe'),
      fakeEnv,
      'no-existe',
    );
    expect(response.status).toBe(404);
  });

  it('responde 200 con el detalle para recepcionista', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: receptionist });
    getMemberByIdMock.mockResolvedValue(sampleMember);
    const response = await handleGetMember(
      new Request('https://x.test/api/members/member_1'),
      fakeEnv,
      'member_1',
    );
    expect(response.status).toBe(200);
  });

  it('responde 403 para un entrenador sin este socio asignado (Fase 8)', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: trainer });
    isMemberAssignedToTrainerMock.mockResolvedValue(false);
    const response = await handleGetMember(
      new Request('https://x.test/api/members/member_1'),
      fakeEnv,
      'member_1',
    );
    expect(response.status).toBe(403);
    expect(getMemberByIdMock).not.toHaveBeenCalled();
  });

  it('responde 200 para un entrenador con este socio asignado', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: trainer });
    isMemberAssignedToTrainerMock.mockResolvedValue(true);
    getMemberByIdMock.mockResolvedValue(sampleMember);
    const response = await handleGetMember(
      new Request('https://x.test/api/members/member_1'),
      fakeEnv,
      'member_1',
    );
    expect(response.status).toBe(200);
  });
});

describe('PATCH /api/members/:id', () => {
  it('responde 422 si el cuerpo no trae ningún campo', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: admin });
    const request = new Request('https://x.test/api/members/member_1', {
      method: 'PATCH',
      body: JSON.stringify({}),
    });
    const response = await handleUpdateMember(request, fakeEnv, 'member_1');
    expect(response.status).toBe(422);
  });

  it('responde 404 si el socio no existe', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: admin });
    updateMemberMock.mockResolvedValue(null);
    const request = new Request('https://x.test/api/members/no-existe', {
      method: 'PATCH',
      body: JSON.stringify({ phone: '+57 300 0000000' }),
    });
    const response = await handleUpdateMember(request, fakeEnv, 'no-existe');
    expect(response.status).toBe(404);
  });

  it('responde 200 con el detalle actualizado', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: receptionist });
    updateMemberMock.mockResolvedValue({ ...sampleMember, phone: '+57 300 0000000' });
    const request = new Request('https://x.test/api/members/member_1', {
      method: 'PATCH',
      body: JSON.stringify({ phone: '+57 300 0000000' }),
    });
    const response = await handleUpdateMember(request, fakeEnv, 'member_1');
    expect(response.status).toBe(200);
  });
});

describe('POST /api/members/:id/deactivate', () => {
  it('responde 403 para recepcionista (solo admin puede desactivar)', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: receptionist });
    const response = await handleDeactivateMember(
      new Request('https://x.test/api/members/member_1/deactivate', { method: 'POST' }),
      fakeEnv,
      'member_1',
    );
    expect(response.status).toBe(403);
    expect(deactivateMemberMock).not.toHaveBeenCalled();
  });

  it('responde 200 para admin', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: admin });
    deactivateMemberMock.mockResolvedValue({ ...sampleMember, isActive: false });
    const response = await handleDeactivateMember(
      new Request('https://x.test/api/members/member_1/deactivate', { method: 'POST' }),
      fakeEnv,
      'member_1',
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { isActive: boolean };
    expect(body.isActive).toBe(false);
  });
});
