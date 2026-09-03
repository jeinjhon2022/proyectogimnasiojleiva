export interface Exercise {
  id: string;
  name: string;
  description: string | null;
  muscleGroup: string | null;
  isActive: boolean;
}

interface ExerciseRow {
  id: string;
  name: string;
  description: string | null;
  muscle_group: string | null;
  is_active: number;
}

function mapExercise(row: ExerciseRow): Exercise {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    muscleGroup: row.muscle_group,
    isActive: row.is_active === 1,
  };
}

export async function listExercises(db: D1Database): Promise<Exercise[]> {
  const result = await db
    .prepare(
      'SELECT id, name, description, muscle_group, is_active FROM exercises ORDER BY name ASC',
    )
    .all<ExerciseRow>();
  return result.results.map(mapExercise);
}

export async function getExerciseById(db: D1Database, id: string): Promise<Exercise | null> {
  const row = await db
    .prepare('SELECT id, name, description, muscle_group, is_active FROM exercises WHERE id = ?')
    .bind(id)
    .first<ExerciseRow>();
  return row ? mapExercise(row) : null;
}

export interface CreateExerciseInput {
  name: string;
  description?: string | undefined;
  muscleGroup?: string | undefined;
}

export async function createExercise(
  db: D1Database,
  input: CreateExerciseInput,
): Promise<Exercise> {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  await db
    .prepare(
      'INSERT INTO exercises (id, name, description, muscle_group, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)',
    )
    .bind(id, input.name, input.description ?? null, input.muscleGroup ?? null, now, now)
    .run();

  const created = await getExerciseById(db, id);
  if (!created) throw new Error('No se pudo leer el ejercicio recién creado');
  return created;
}
