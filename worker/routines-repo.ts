export type RoutineStatus = 'draft' | 'active' | 'archived';

export interface RoutineSummary {
  id: string;
  name: string;
  description: string | null;
  status: RoutineStatus;
  createdBy: string;
}

export interface RoutineExerciseDetail {
  id: string;
  exerciseId: string;
  exerciseName: string;
  position: number;
  sets: number | null;
  reps: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
  restSeconds: number | null;
  notes: string | null;
}

export interface RoutineDetail extends RoutineSummary {
  exercises: RoutineExerciseDetail[];
}

interface RoutineRow {
  id: string;
  name: string;
  description: string | null;
  status: string;
  created_by: string;
}

function mapRoutineRow(row: RoutineRow): RoutineSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status as RoutineStatus,
    createdBy: row.created_by,
  };
}

interface RoutineExerciseRow {
  id: string;
  exercise_id: string;
  exercise_name: string;
  position: number;
  sets: number | null;
  reps: number | null;
  duration_seconds: number | null;
  distance_meters: number | null;
  rest_seconds: number | null;
  notes: string | null;
}

function mapRoutineExerciseRow(row: RoutineExerciseRow): RoutineExerciseDetail {
  return {
    id: row.id,
    exerciseId: row.exercise_id,
    exerciseName: row.exercise_name,
    position: row.position,
    sets: row.sets,
    reps: row.reps,
    durationSeconds: row.duration_seconds,
    distanceMeters: row.distance_meters,
    restSeconds: row.rest_seconds,
    notes: row.notes,
  };
}

async function getRoutineExercises(
  db: D1Database,
  routineId: string,
): Promise<RoutineExerciseDetail[]> {
  const result = await db
    .prepare(
      `SELECT re.id, re.exercise_id, e.name AS exercise_name, re.position, re.sets, re.reps,
              re.duration_seconds, re.distance_meters, re.rest_seconds, re.notes
       FROM routine_exercises re
       JOIN exercises e ON e.id = re.exercise_id
       WHERE re.routine_id = ?
       ORDER BY re.position ASC`,
    )
    .bind(routineId)
    .all<RoutineExerciseRow>();
  return result.results.map(mapRoutineExerciseRow);
}

export async function getRoutineById(db: D1Database, id: string): Promise<RoutineDetail | null> {
  const row = await db
    .prepare('SELECT id, name, description, status, created_by FROM routines WHERE id = ?')
    .bind(id)
    .first<RoutineRow>();
  if (!row) return null;

  const exercises = await getRoutineExercises(db, id);
  return { ...mapRoutineRow(row), exercises };
}

export interface ListRoutinesParams {
  page: number;
  pageSize: number;
  // Para "mis rutinas" del entrenador (no aplica a Administrador, que ve todas).
  createdBy?: string | undefined;
}

export interface ListRoutinesResult {
  items: RoutineSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listRoutines(
  db: D1Database,
  params: ListRoutinesParams,
): Promise<ListRoutinesResult> {
  const { page, pageSize, createdBy } = params;
  const offset = (page - 1) * pageSize;
  const whereClause = createdBy ? 'WHERE created_by = ?' : '';
  const queryParams = createdBy ? [createdBy] : [];

  const countRow = await db
    .prepare(`SELECT COUNT(*) as total FROM routines ${whereClause}`)
    .bind(...queryParams)
    .first<{ total: number }>();

  const result = await db
    .prepare(
      `SELECT id, name, description, status, created_by FROM routines ${whereClause} ORDER BY name ASC LIMIT ? OFFSET ?`,
    )
    .bind(...queryParams, pageSize, offset)
    .all<RoutineRow>();

  return { items: result.results.map(mapRoutineRow), total: countRow?.total ?? 0, page, pageSize };
}

export interface CreateRoutineExerciseInput {
  exerciseId: string;
  sets?: number | undefined;
  reps?: number | undefined;
  durationSeconds?: number | undefined;
  distanceMeters?: number | undefined;
  restSeconds?: number | undefined;
  notes?: string | undefined;
}

export interface CreateRoutineInput {
  name: string;
  description?: string | undefined;
  exercises: CreateRoutineExerciseInput[];
}

// Crea la rutina y sus ejercicios en un solo batch atómico (CLAUDE.md sección 7).
// El orden del arreglo `exercises` define routine_exercises.position.
export async function createRoutine(
  db: D1Database,
  input: CreateRoutineInput,
  actorUserId: string,
): Promise<RoutineDetail> {
  const now = new Date().toISOString();
  const routineId = crypto.randomUUID();

  const statements = [
    db
      .prepare(
        "INSERT INTO routines (id, name, description, status, created_by, created_at, updated_at) VALUES (?, ?, ?, 'draft', ?, ?, ?)",
      )
      .bind(routineId, input.name, input.description ?? null, actorUserId, now, now),
  ];

  input.exercises.forEach((exercise, index) => {
    statements.push(
      db
        .prepare(
          `INSERT INTO routine_exercises
             (id, routine_id, exercise_id, position, sets, reps, duration_seconds, distance_meters, rest_seconds, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          routineId,
          exercise.exerciseId,
          index,
          exercise.sets ?? null,
          exercise.reps ?? null,
          exercise.durationSeconds ?? null,
          exercise.distanceMeters ?? null,
          exercise.restSeconds ?? null,
          exercise.notes ?? null,
        ),
    );
  });

  statements.push(
    db
      .prepare(
        "INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, metadata, created_at) VALUES (?, ?, 'routine.create', 'routine', ?, ?, ?)",
      )
      .bind(
        crypto.randomUUID(),
        actorUserId,
        routineId,
        JSON.stringify({ name: input.name, exerciseCount: input.exercises.length }),
        now,
      ),
  );

  await db.batch(statements);

  const created = await getRoutineById(db, routineId);
  if (!created) throw new Error('No se pudo leer la rutina recién creada');
  return created;
}

export type RoutineAssignmentStatus = 'active' | 'completed' | 'cancelled';

export interface RoutineAssignment {
  id: string;
  routineId: string;
  routineName: string;
  memberId: string;
  assignedBy: string;
  assignedAt: string;
  status: RoutineAssignmentStatus;
}

interface RoutineAssignmentRow {
  id: string;
  routine_id: string;
  routine_name: string;
  member_id: string;
  assigned_by: string;
  assigned_at: string;
  status: string;
}

function mapAssignment(row: RoutineAssignmentRow): RoutineAssignment {
  return {
    id: row.id,
    routineId: row.routine_id,
    routineName: row.routine_name,
    memberId: row.member_id,
    assignedBy: row.assigned_by,
    assignedAt: row.assigned_at,
    status: row.status as RoutineAssignmentStatus,
  };
}

const ASSIGNMENT_SELECT = `
  SELECT ra.id, ra.routine_id, r.name AS routine_name, ra.member_id, ra.assigned_by, ra.assigned_at, ra.status
  FROM routine_assignments ra
  JOIN routines r ON r.id = ra.routine_id
`;

// No sobrescribe: cada asignación es una fila nueva, conservando el historial
// (CLAUDE.md sección 6.6, "historial de cambios importantes").
export async function assignRoutine(
  db: D1Database,
  routineId: string,
  memberId: string,
  actorUserId: string,
): Promise<RoutineAssignment> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.batch([
    db
      .prepare(
        "INSERT INTO routine_assignments (id, routine_id, member_id, assigned_by, assigned_at, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'active', ?, ?)",
      )
      .bind(id, routineId, memberId, actorUserId, now, now, now),
    db
      .prepare(
        "INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, metadata, created_at) VALUES (?, ?, 'routine.assign', 'routine_assignment', ?, ?, ?)",
      )
      .bind(crypto.randomUUID(), actorUserId, id, JSON.stringify({ routineId, memberId }), now),
  ]);

  const row = await db
    .prepare(`${ASSIGNMENT_SELECT} WHERE ra.id = ?`)
    .bind(id)
    .first<RoutineAssignmentRow>();
  if (!row) throw new Error('No se pudo leer la asignación recién creada');
  return mapAssignment(row);
}

// La más reciente activa; si un socio tiene varias históricas, esta es "su rutina" actual.
export async function getActiveAssignmentForMember(
  db: D1Database,
  memberId: string,
): Promise<RoutineAssignment | null> {
  const row = await db
    .prepare(
      `${ASSIGNMENT_SELECT} WHERE ra.member_id = ? AND ra.status = 'active' ORDER BY ra.assigned_at DESC LIMIT 1`,
    )
    .bind(memberId)
    .first<RoutineAssignmentRow>();
  return row ? mapAssignment(row) : null;
}

// Retrofit de la Fase 4/6 (PLAN.md sección 7, "entrenador: solo los socios asignados"):
// ¿este entrenador tiene alguna relación con este socio, ya sea porque creó la rutina
// que tiene asignada o porque él mismo hizo la asignación?
export async function isMemberAssignedToTrainer(
  db: D1Database,
  trainerId: string,
  memberId: string,
): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1 FROM routine_assignments ra
       JOIN routines r ON r.id = ra.routine_id
       WHERE ra.member_id = ? AND (r.created_by = ? OR ra.assigned_by = ?)
       LIMIT 1`,
    )
    .bind(memberId, trainerId, trainerId)
    .first();
  return row !== null;
}
