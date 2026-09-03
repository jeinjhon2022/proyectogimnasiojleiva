import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../env';
import type { Exercise } from '../exercises-repo';

const authenticateMock = vi.fn();
vi.mock('../authenticate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../authenticate')>();
  return { ...actual, authenticate: (...args: unknown[]) => authenticateMock(...args) };
});

const listExercisesMock = vi.fn();
const createExerciseMock = vi.fn();
vi.mock('../exercises-repo', () => ({
  listExercises: (...args: unknown[]) => listExercisesMock(...args),
  createExercise: (...args: unknown[]) => createExerciseMock(...args),
}));

const { handleListExercises, handleCreateExercise } = await import('./exercises');

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

const sampleExercise: Exercise = {
  id: 'ex1',
  name: 'Sentadilla',
  description: null,
  muscleGroup: 'piernas',
  isActive: true,
};

beforeEach(() => {
  authenticateMock.mockReset();
  listExercisesMock.mockReset();
  createExerciseMock.mockReset();
});

describe('GET /api/exercises', () => {
  it('responde 403 para recepcionista', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: receptionist });
    const response = await handleListExercises(
      new Request('https://x.test/api/exercises'),
      fakeEnv,
    );
    expect(response.status).toBe(403);
  });

  it('responde 200 para entrenador', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: trainer });
    listExercisesMock.mockResolvedValue([sampleExercise]);
    const response = await handleListExercises(
      new Request('https://x.test/api/exercises'),
      fakeEnv,
    );
    expect(response.status).toBe(200);
  });
});

describe('POST /api/exercises', () => {
  it('responde 422 sin nombre', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: admin });
    const request = new Request('https://x.test/api/exercises', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const response = await handleCreateExercise(request, fakeEnv);
    expect(response.status).toBe(422);
  });

  it('responde 201 para entrenador con datos válidos', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: trainer });
    createExerciseMock.mockResolvedValue(sampleExercise);
    const request = new Request('https://x.test/api/exercises', {
      method: 'POST',
      body: JSON.stringify({ name: 'Sentadilla' }),
    });
    const response = await handleCreateExercise(request, fakeEnv);
    expect(response.status).toBe(201);
  });
});
