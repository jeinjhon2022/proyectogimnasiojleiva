import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../env';
import type { RoutineAssignment, RoutineDetail } from '../routines-repo';
import type { MemberDetail } from '../members-repo';

const authenticateMock = vi.fn();
vi.mock('../authenticate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../authenticate')>();
  return { ...actual, authenticate: (...args: unknown[]) => authenticateMock(...args) };
});

const listRoutinesMock = vi.fn();
const getRoutineByIdMock = vi.fn();
const createRoutineMock = vi.fn();
const assignRoutineMock = vi.fn();
const getActiveAssignmentForMemberMock = vi.fn();
vi.mock('../routines-repo', () => ({
  listRoutines: (...args: unknown[]) => listRoutinesMock(...args),
  getRoutineById: (...args: unknown[]) => getRoutineByIdMock(...args),
  createRoutine: (...args: unknown[]) => createRoutineMock(...args),
  assignRoutine: (...args: unknown[]) => assignRoutineMock(...args),
  getActiveAssignmentForMember: (...args: unknown[]) => getActiveAssignmentForMemberMock(...args),
}));

const getMemberByIdMock = vi.fn();
const getMemberByUserIdMock = vi.fn();
const sendEmailWithResendMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../resend', () => ({
  sendEmailWithResend: (...args: unknown[]) => sendEmailWithResendMock(...args),
}));

vi.mock('../members-repo', () => ({
  getMemberById: (...args: unknown[]) => getMemberByIdMock(...args),
  getMemberByUserId: (...args: unknown[]) => getMemberByUserIdMock(...args),
}));

const {
  handleListRoutines,
  handleGetRoutine,
  handleCreateRoutine,
  handleAssignRoutine,
  handleGetMyRoutine,
} = await import('./routines');

const fakeEnv = {} as Env;
const admin = {
  id: 'user_admin',
  role: 'admin',
  email: 'a@test.dev',
  fullName: 'Admin',
  isActive: true,
};
const trainer = {
  id: 'user_trainer',
  role: 'trainer',
  email: 't@test.dev',
  fullName: 'Trainer',
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

const sampleRoutine: RoutineDetail = {
  id: 'routine_1',
  name: 'Fuerza básica',
  description: null,
  status: 'draft',
  createdBy: 'user_trainer',
  exercises: [
    {
      id: 're1',
      exerciseId: 'ex1',
      exerciseName: 'Sentadilla',
      position: 0,
      sets: 4,
      reps: 8,
      durationSeconds: null,
      distanceMeters: null,
      restSeconds: 90,
      notes: null,
    },
  ],
};

const sampleAssignment: RoutineAssignment = {
  id: 'assign_1',
  routineId: 'routine_1',
  routineName: 'Fuerza básica',
  memberId: 'member_1',
  assignedBy: 'user_trainer',
  assignedAt: '2026-09-02T00:00:00.000Z',
  status: 'active',
};

const sampleMember = { id: 'member_1', isActive: true } as MemberDetail;

beforeEach(() => {
  authenticateMock.mockReset();
  listRoutinesMock.mockReset();
  getRoutineByIdMock.mockReset();
  createRoutineMock.mockReset();
  assignRoutineMock.mockReset();
  getActiveAssignmentForMemberMock.mockReset();
  getMemberByIdMock.mockReset();
  getMemberByUserIdMock.mockReset();
  sendEmailWithResendMock.mockClear();
});

describe('GET /api/routines', () => {
  it('responde 403 para recepcionista', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: receptionist });
    const response = await handleListRoutines(new Request('https://x.test/api/routines'), fakeEnv);
    expect(response.status).toBe(403);
  });

  it('filtra por createdBy cuando el usuario es entrenador (solo "mis rutinas")', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: trainer });
    listRoutinesMock.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });

    await handleListRoutines(new Request('https://x.test/api/routines'), fakeEnv);

    expect(listRoutinesMock).toHaveBeenCalledWith(
      fakeEnv.DB,
      expect.objectContaining({ createdBy: trainer.id }),
    );
  });

  it('no filtra por createdBy para admin (ve todas)', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: admin });
    listRoutinesMock.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });

    await handleListRoutines(new Request('https://x.test/api/routines'), fakeEnv);

    expect(listRoutinesMock).toHaveBeenCalledWith(
      fakeEnv.DB,
      expect.objectContaining({ createdBy: undefined }),
    );
  });
});

describe('GET /api/routines/:id', () => {
  it('responde 404 si no existe', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: trainer });
    getRoutineByIdMock.mockResolvedValue(null);
    const response = await handleGetRoutine(
      new Request('https://x.test/api/routines/no-existe'),
      fakeEnv,
      'no-existe',
    );
    expect(response.status).toBe(404);
  });

  it('responde 200 con el detalle (incluye ejercicios)', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: admin });
    getRoutineByIdMock.mockResolvedValue(sampleRoutine);
    const response = await handleGetRoutine(
      new Request('https://x.test/api/routines/routine_1'),
      fakeEnv,
      'routine_1',
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as RoutineDetail;
    expect(body.exercises).toHaveLength(1);
  });
});

describe('POST /api/routines', () => {
  function makeRequest(body: unknown) {
    return new Request('https://x.test/api/routines', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  it('responde 403 para un socio', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: memberUser });
    const response = await handleCreateRoutine(
      makeRequest({ name: 'X', exercises: [{ exerciseId: 'ex1' }] }),
      fakeEnv,
    );
    expect(response.status).toBe(403);
  });

  it('responde 422 sin ejercicios', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: trainer });
    const response = await handleCreateRoutine(makeRequest({ name: 'X', exercises: [] }), fakeEnv);
    expect(response.status).toBe(422);
  });

  it('responde 201 para entrenador con datos válidos', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: trainer });
    createRoutineMock.mockResolvedValue(sampleRoutine);

    const response = await handleCreateRoutine(
      makeRequest({ name: 'Fuerza básica', exercises: [{ exerciseId: 'ex1', sets: 4, reps: 8 }] }),
      fakeEnv,
    );

    expect(response.status).toBe(201);
  });
});

describe('POST /api/routines/:id/assign', () => {
  it('responde 403 para recepcionista', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: receptionist });
    const request = new Request('https://x.test/api/routines/routine_1/assign', {
      method: 'POST',
      body: JSON.stringify({ memberId: 'member_1' }),
    });
    const response = await handleAssignRoutine(request, fakeEnv, 'routine_1');
    expect(response.status).toBe(403);
    expect(assignRoutineMock).not.toHaveBeenCalled();
  });

  it('responde 404 si la rutina no existe', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: trainer });
    getRoutineByIdMock.mockResolvedValue(null);
    const request = new Request('https://x.test/api/routines/no-existe/assign', {
      method: 'POST',
      body: JSON.stringify({ memberId: 'member_1' }),
    });
    const response = await handleAssignRoutine(request, fakeEnv, 'no-existe');
    expect(response.status).toBe(404);
  });

  it('responde 404 si el socio no existe', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: trainer });
    getRoutineByIdMock.mockResolvedValue(sampleRoutine);
    getMemberByIdMock.mockResolvedValue(null);
    const request = new Request('https://x.test/api/routines/routine_1/assign', {
      method: 'POST',
      body: JSON.stringify({ memberId: 'no-existe' }),
    });
    const response = await handleAssignRoutine(request, fakeEnv, 'routine_1');
    expect(response.status).toBe(404);
  });

  it('responde 201 con datos válidos', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: trainer });
    getRoutineByIdMock.mockResolvedValue(sampleRoutine);
    getMemberByIdMock.mockResolvedValue(sampleMember);
    assignRoutineMock.mockResolvedValue(sampleAssignment);

    const request = new Request('https://x.test/api/routines/routine_1/assign', {
      method: 'POST',
      body: JSON.stringify({ memberId: 'member_1' }),
    });
    const response = await handleAssignRoutine(request, fakeEnv, 'routine_1');

    expect(response.status).toBe(201);
  });
});

describe('GET /api/me/routine', () => {
  it('responde 404 si la cuenta no tiene perfil de socio', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: admin });
    getMemberByUserIdMock.mockResolvedValue(null);
    const response = await handleGetMyRoutine(
      new Request('https://x.test/api/me/routine'),
      fakeEnv,
    );
    expect(response.status).toBe(404);
  });

  it('responde 404 si el socio no tiene una rutina activa', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: memberUser });
    getMemberByUserIdMock.mockResolvedValue(sampleMember);
    getActiveAssignmentForMemberMock.mockResolvedValue(null);
    const response = await handleGetMyRoutine(
      new Request('https://x.test/api/me/routine'),
      fakeEnv,
    );
    expect(response.status).toBe(404);
  });

  it('responde 200 con la rutina activa del socio', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: memberUser });
    getMemberByUserIdMock.mockResolvedValue(sampleMember);
    getActiveAssignmentForMemberMock.mockResolvedValue(sampleAssignment);
    getRoutineByIdMock.mockResolvedValue(sampleRoutine);

    const response = await handleGetMyRoutine(
      new Request('https://x.test/api/me/routine'),
      fakeEnv,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { routine: RoutineDetail };
    expect(body.routine.name).toBe('Fuerza básica');
  });
});
