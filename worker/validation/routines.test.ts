import { describe, expect, it } from 'vitest';
import {
  assignRoutineSchema,
  createExerciseSchema,
  createRoutineSchema,
  updateExerciseSchema,
} from './routines';

describe('createExerciseSchema', () => {
  it('acepta solo el nombre', () => {
    expect(createExerciseSchema.safeParse({ name: 'Sentadilla' }).success).toBe(true);
  });

  it('rechaza sin nombre', () => {
    expect(createExerciseSchema.safeParse({}).success).toBe(false);
  });

  it('acepta un enlace de demostración válido', () => {
    expect(
      createExerciseSchema.safeParse({
        name: 'Sentadilla',
        demoUrl: 'https://youtube.com/watch?v=abc',
      }).success,
    ).toBe(true);
  });

  it('rechaza un enlace de demostración que no es una URL', () => {
    expect(
      createExerciseSchema.safeParse({ name: 'Sentadilla', demoUrl: 'no es un link' }).success,
    ).toBe(false);
  });
});

describe('updateExerciseSchema', () => {
  it('rechaza un objeto vacío', () => {
    expect(updateExerciseSchema.safeParse({}).success).toBe(false);
  });

  it('acepta solo demoUrl (agregar el enlace a un ejercicio ya existente)', () => {
    expect(
      updateExerciseSchema.safeParse({ demoUrl: 'https://youtube.com/watch?v=abc' }).success,
    ).toBe(true);
  });

  it('permite poner demoUrl en null (quitarlo)', () => {
    expect(updateExerciseSchema.safeParse({ demoUrl: null }).success).toBe(true);
  });
});

describe('createRoutineSchema', () => {
  it('acepta una rutina con un ejercicio', () => {
    const result = createRoutineSchema.safeParse({
      name: 'Rutina básica',
      exercises: [{ exerciseId: 'ex1', sets: 4, reps: 8 }],
    });
    expect(result.success).toBe(true);
  });

  it('rechaza una rutina sin ejercicios', () => {
    expect(createRoutineSchema.safeParse({ name: 'Vacía', exercises: [] }).success).toBe(false);
  });

  it('rechaza sin nombre', () => {
    expect(createRoutineSchema.safeParse({ exercises: [{ exerciseId: 'ex1' }] }).success).toBe(
      false,
    );
  });

  it('rechaza un ejercicio sin exerciseId', () => {
    expect(createRoutineSchema.safeParse({ name: 'X', exercises: [{ sets: 4 }] }).success).toBe(
      false,
    );
  });

  it('rechaza series/repeticiones fuera de un rango real (probable error de tipeo)', () => {
    expect(
      createRoutineSchema.safeParse({ name: 'X', exercises: [{ exerciseId: 'ex1', sets: 51 }] })
        .success,
    ).toBe(false);
    expect(
      createRoutineSchema.safeParse({ name: 'X', exercises: [{ exerciseId: 'ex1', reps: 1001 }] })
        .success,
    ).toBe(false);
    expect(
      createRoutineSchema.safeParse({ name: 'X', exercises: [{ exerciseId: 'ex1', sets: 4 }] })
        .success,
    ).toBe(true);
  });
});

describe('assignRoutineSchema', () => {
  it('exige memberId', () => {
    expect(assignRoutineSchema.safeParse({}).success).toBe(false);
    expect(assignRoutineSchema.safeParse({ memberId: 'm1' }).success).toBe(true);
  });
});
