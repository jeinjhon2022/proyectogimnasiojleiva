import type { Env } from '../env';
import { authenticate, requireRole } from '../authenticate';
import { errorResponse, jsonResponse, readJsonBody } from '../http';
import { createExerciseSchema, updateExerciseSchema } from '../validation/routines';
import { createExercise, listExercises, updateExercise } from '../exercises-repo';

// Quien arma rutinas necesita el catálogo: Administrador y Entrenador (CLAUDE.md sección 5).
const ROUTINE_ROLES = ['admin', 'trainer'] as const;

export async function handleListExercises(request: Request, env: Env): Promise<Response> {
  const auth = await authenticate(request, env);
  if (auth.kind === 'unauthenticated')
    return errorResponse(401, 'UNAUTHENTICATED', 'Se requiere iniciar sesión');
  if (auth.kind === 'unauthorized' || !requireRole(auth.user, ROUTINE_ROLES)) {
    return errorResponse(403, 'FORBIDDEN', 'No tienes permiso para ver el catálogo de ejercicios');
  }

  const exercises = await listExercises(env.DB);
  return jsonResponse({ items: exercises });
}

export async function handleCreateExercise(request: Request, env: Env): Promise<Response> {
  const auth = await authenticate(request, env);
  if (auth.kind === 'unauthenticated')
    return errorResponse(401, 'UNAUTHENTICATED', 'Se requiere iniciar sesión');
  if (auth.kind === 'unauthorized' || !requireRole(auth.user, ROUTINE_ROLES)) {
    return errorResponse(403, 'FORBIDDEN', 'No tienes permiso para crear ejercicios');
  }

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = createExerciseSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return errorResponse(
      422,
      'VALIDATION_ERROR',
      parsed.error.issues[0]?.message ?? 'Datos inválidos',
    );
  }

  const exercise = await createExercise(env.DB, parsed.data);
  return jsonResponse(exercise, { status: 201 });
}

// Pensada sobre todo para agregarle el enlace de demostración a un ejercicio que ya
// existía en el catálogo antes de que este campo existiera.
export async function handleUpdateExercise(
  request: Request,
  env: Env,
  id: string,
): Promise<Response> {
  const auth = await authenticate(request, env);
  if (auth.kind === 'unauthenticated')
    return errorResponse(401, 'UNAUTHENTICATED', 'Se requiere iniciar sesión');
  if (auth.kind === 'unauthorized' || !requireRole(auth.user, ROUTINE_ROLES)) {
    return errorResponse(403, 'FORBIDDEN', 'No tienes permiso para editar ejercicios');
  }

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = updateExerciseSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return errorResponse(
      422,
      'VALIDATION_ERROR',
      parsed.error.issues[0]?.message ?? 'Datos inválidos',
    );
  }

  const updated = await updateExercise(env.DB, id, parsed.data);
  if (!updated)
    return errorResponse(404, 'EXERCISE_NOT_FOUND', 'No se encontró el ejercicio indicado');
  return jsonResponse(updated);
}
