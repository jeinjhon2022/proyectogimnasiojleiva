export interface Exercise {
  id: string;
  name: string;
  description: string | null;
  muscleGroup: string | null;
  // Enlace a un GIF/video corto de demostración (YouTube, o un archivo propio en R2).
  // No generado por IA — ver la nota de la migración 0020.
  demoUrl: string | null;
  isActive: boolean;
}

interface ExerciseRow {
  id: string;
  name: string;
  description: string | null;
  muscle_group: string | null;
  demo_url: string | null;
  is_active: number;
}

function mapExercise(row: ExerciseRow): Exercise {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    muscleGroup: row.muscle_group,
    demoUrl: row.demo_url,
    isActive: row.is_active === 1,
  };
}

const EXERCISE_SELECT =
  'SELECT id, name, description, muscle_group, demo_url, is_active FROM exercises';

export async function listExercises(db: D1Database): Promise<Exercise[]> {
  const result = await db.prepare(`${EXERCISE_SELECT} ORDER BY name ASC`).all<ExerciseRow>();
  return result.results.map(mapExercise);
}

export async function getExerciseById(db: D1Database, id: string): Promise<Exercise | null> {
  const row = await db.prepare(`${EXERCISE_SELECT} WHERE id = ?`).bind(id).first<ExerciseRow>();
  return row ? mapExercise(row) : null;
}

export interface CreateExerciseInput {
  name: string;
  description?: string | undefined;
  muscleGroup?: string | undefined;
  demoUrl?: string | undefined;
}

export async function createExercise(
  db: D1Database,
  input: CreateExerciseInput,
): Promise<Exercise> {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  await db
    .prepare(
      'INSERT INTO exercises (id, name, description, muscle_group, demo_url, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)',
    )
    .bind(
      id,
      input.name,
      input.description ?? null,
      input.muscleGroup ?? null,
      input.demoUrl ?? null,
      now,
      now,
    )
    .run();

  const created = await getExerciseById(db, id);
  if (!created) throw new Error('No se pudo leer el ejercicio recién creado');
  return created;
}

export interface UpdateExerciseInput {
  name?: string | undefined;
  description?: string | null | undefined;
  muscleGroup?: string | null | undefined;
  demoUrl?: string | null | undefined;
}

// Edición del catálogo — sobre todo pensada para agregarle el enlace de demostración a
// un ejercicio que ya existía antes de esta función.
export async function updateExercise(
  db: D1Database,
  id: string,
  patch: UpdateExerciseInput,
): Promise<Exercise | null> {
  const current = await getExerciseById(db, id);
  if (!current) return null;

  const name = patch.name ?? current.name;
  const description = patch.description !== undefined ? patch.description : current.description;
  const muscleGroup = patch.muscleGroup !== undefined ? patch.muscleGroup : current.muscleGroup;
  const demoUrl = patch.demoUrl !== undefined ? patch.demoUrl : current.demoUrl;

  await db
    .prepare(
      'UPDATE exercises SET name = ?, description = ?, muscle_group = ?, demo_url = ? WHERE id = ?',
    )
    .bind(name, description, muscleGroup, demoUrl, id)
    .run();

  return getExerciseById(db, id);
}
