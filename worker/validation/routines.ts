import { z } from 'zod';

export const createExerciseSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es obligatorio').max(200),
  description: z.string().trim().max(2000).optional(),
  muscleGroup: z.string().trim().max(100).optional(),
});

export type CreateExerciseBody = z.infer<typeof createExerciseSchema>;

// Techos generosos que nunca deberían chocar con una rutina real, pero atrapan un
// típico error de tipeo (un cero de más) antes de que llegue a la base de datos.
const routineExerciseInputSchema = z.object({
  exerciseId: z.string().trim().min(1, 'exerciseId es obligatorio'),
  sets: z.coerce.number().int().positive().max(50).optional(),
  reps: z.coerce.number().int().positive().max(1000).optional(),
  durationSeconds: z.coerce.number().int().positive().max(36_000).optional(), // 10 horas
  distanceMeters: z.coerce.number().positive().max(1_000_000).optional(), // 1000 km
  restSeconds: z.coerce.number().int().min(0).max(3600).optional(), // 1 hora
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
