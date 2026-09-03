import { z } from 'zod';

export const createExerciseSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es obligatorio').max(200),
  description: z.string().trim().max(2000).optional(),
  muscleGroup: z.string().trim().max(100).optional(),
});

export type CreateExerciseBody = z.infer<typeof createExerciseSchema>;

const routineExerciseInputSchema = z.object({
  exerciseId: z.string().trim().min(1, 'exerciseId es obligatorio'),
  sets: z.coerce.number().int().positive().optional(),
  reps: z.coerce.number().int().positive().optional(),
  durationSeconds: z.coerce.number().int().positive().optional(),
  distanceMeters: z.coerce.number().positive().optional(),
  restSeconds: z.coerce.number().int().min(0).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const createRoutineSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es obligatorio').max(200),
  description: z.string().trim().max(2000).optional(),
  // El orden de este arreglo define routine_exercises.position.
  exercises: z
    .array(routineExerciseInputSchema)
    .min(1, 'La rutina debe incluir al menos un ejercicio')
    .max(50),
});

export type CreateRoutineBody = z.infer<typeof createRoutineSchema>;

export const assignRoutineSchema = z.object({
  memberId: z.string().trim().min(1, 'memberId es obligatorio'),
});

export type AssignRoutineBody = z.infer<typeof assignRoutineSchema>;

export const listRoutinesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListRoutinesQuery = z.infer<typeof listRoutinesQuerySchema>;
