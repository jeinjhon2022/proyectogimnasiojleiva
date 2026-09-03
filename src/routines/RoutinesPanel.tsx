import { useEffect, useState, type FormEvent } from 'react';
import {
  ApiError,
  assignRoutine,
  createExercise,
  createRoutine,
  listExercises,
  listMembers,
  listRoutines,
  type CreateRoutineExerciseInput,
  type Exercise,
  type Member,
  type RoutineSummary,
  type TokenGetter,
} from '../api';

const STATUS_LABELS: Record<RoutineSummary['status'], string> = {
  draft: 'Borrador',
  active: 'Activa',
  archived: 'Archivada',
};

interface RoutinesPanelProps {
  getToken: TokenGetter;
}

// Módulo de rutinas (Fase 8): catálogo de ejercicios, creación de rutinas y asignación
// a socios. Visible para admin/trainer (App.tsx); el Worker vuelve a exigir el rol.
export default function RoutinesPanel({ getToken }: RoutinesPanelProps) {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [routines, setRoutines] = useState<RoutineSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    Promise.all([listExercises(getToken), listRoutines(getToken)])
      .then(([exercisesData, routinesData]) => {
        if (cancelled) return;
        setExercises(exercisesData.items);
        setRoutines(routinesData.items);
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setLoadError(
            error instanceof ApiError ? error.message : 'No se pudo cargar el módulo de rutinas',
          );
      });

    return () => {
      cancelled = true;
    };
  }, [getToken, reloadToken]);

  const reload = () => setReloadToken((value) => value + 1);

  return (
    <section className="w-full max-w-3xl text-left">
      <h2 className="mb-4 text-lg font-semibold">Rutinas</h2>

      {loadError && (
        <p role="alert" className="mb-3 text-red-600">
          {loadError}
        </p>
      )}

      <ExerciseCatalog exercises={exercises} getToken={getToken} onCreated={reload} />
      <CreateRoutineForm exercises={exercises} getToken={getToken} onCreated={reload} />
      <RoutinesList routines={routines} getToken={getToken} />
    </section>
  );
}

function ExerciseCatalog({
  exercises,
  getToken,
  onCreated,
}: {
  exercises: Exercise[];
  getToken: TokenGetter;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createExercise(getToken, name);
      setName('');
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo agregar el ejercicio');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-4 rounded border border-slate-300 p-3">
      <h3 className="mb-2 text-sm font-semibold">Catálogo de ejercicios</h3>
      <p className="mb-2 text-sm text-slate-600">
        {exercises.map((exercise) => exercise.name).join(', ') || 'Todavía no hay ejercicios.'}
      </p>
      <form onSubmit={(event) => void handleSubmit(event)} className="flex gap-2">
        <input
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Nuevo ejercicio (ej. Sentadilla)"
          aria-label="Nombre del ejercicio"
          className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded border border-slate-300 px-3 py-1 text-sm disabled:opacity-40"
        >
          Agregar
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-1 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

interface DraftExerciseRow {
  exerciseId: string;
  sets: string;
  reps: string;
  restSeconds: string;
}

function CreateRoutineForm({
  exercises,
  getToken,
  onCreated,
}: {
  exercises: Exercise[];
  getToken: TokenGetter;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [rows, setRows] = useState<DraftExerciseRow[]>([
    { exerciseId: '', sets: '', reps: '', restSeconds: '' },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateRow(index: number, patch: Partial<DraftExerciseRow>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const parsedExercises: CreateRoutineExerciseInput[] = [];
    for (const row of rows) {
      if (!row.exerciseId) continue;
      const exercise: CreateRoutineExerciseInput = { exerciseId: row.exerciseId };
      if (row.sets) exercise.sets = Number(row.sets);
      if (row.reps) exercise.reps = Number(row.reps);
      if (row.restSeconds) exercise.restSeconds = Number(row.restSeconds);
      parsedExercises.push(exercise);
    }

    if (parsedExercises.length === 0) {
      setError('Agrega al menos un ejercicio con su plan');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await createRoutine(getToken, { name, exercises: parsedExercises });
      setName('');
      setRows([{ exerciseId: '', sets: '', reps: '', restSeconds: '' }]);
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo crear la rutina');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      className="mb-4 flex flex-col gap-2 rounded border border-slate-300 p-3"
    >
      <h3 className="text-sm font-semibold">Nueva rutina</h3>
      <label className="text-sm">
        Nombre
        <input
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
        />
      </label>

      {rows.map((row, index) => (
        <div key={index} className="flex flex-wrap items-center gap-2">
          <select
            value={row.exerciseId}
            onChange={(event) => updateRow(index, { exerciseId: event.target.value })}
            aria-label={`Ejercicio ${index + 1}`}
            className="rounded border border-slate-300 px-1 py-0.5 text-sm"
          >
            <option value="">Elegir ejercicio…</option>
            {exercises.map((exercise) => (
              <option key={exercise.id} value={exercise.id}>
                {exercise.name}
              </option>
            ))}
          </select>
          <input
            type="number"
            min="1"
            value={row.sets}
            onChange={(event) => updateRow(index, { sets: event.target.value })}
            placeholder="Series"
            aria-label={`Series del ejercicio ${index + 1}`}
            className="w-20 rounded border border-slate-300 px-1 py-0.5 text-sm"
          />
          <input
            type="number"
            min="1"
            value={row.reps}
            onChange={(event) => updateRow(index, { reps: event.target.value })}
            placeholder="Reps"
            aria-label={`Repeticiones del ejercicio ${index + 1}`}
            className="w-20 rounded border border-slate-300 px-1 py-0.5 text-sm"
          />
          <input
            type="number"
            min="0"
            value={row.restSeconds}
            onChange={(event) => updateRow(index, { restSeconds: event.target.value })}
            placeholder="Descanso (s)"
            aria-label={`Descanso del ejercicio ${index + 1}`}
            className="w-28 rounded border border-slate-300 px-1 py-0.5 text-sm"
          />
        </div>
      ))}

      <button
        type="button"
        onClick={() =>
          setRows((current) => [
            ...current,
            { exerciseId: '', sets: '', reps: '', restSeconds: '' },
          ])
        }
        className="self-start text-sm text-blue-700 underline"
      >
        Agregar otro ejercicio
      </button>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="self-start rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? 'Guardando…' : 'Crear rutina'}
      </button>
    </form>
  );
}

function RoutinesList({
  routines,
  getToken,
}: {
  routines: RoutineSummary[];
  getToken: TokenGetter;
}) {
  const [assigningId, setAssigningId] = useState<string | null>(null);

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">Rutinas creadas</h3>
      {routines.length === 0 && <p className="text-sm text-slate-600">Todavía no hay rutinas.</p>}
      <ul className="flex flex-col gap-2">
        {routines.map((routine) => (
          <li key={routine.id} className="rounded border border-slate-300 p-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span>
                {routine.name} ·{' '}
                <span className="text-slate-500">{STATUS_LABELS[routine.status]}</span>
              </span>
              <button
                type="button"
                onClick={() =>
                  setAssigningId((current) => (current === routine.id ? null : routine.id))
                }
                className="text-blue-700 underline"
              >
                {assigningId === routine.id ? 'Cancelar' : 'Asignar'}
              </button>
            </div>
            {assigningId === routine.id && (
              <AssignRoutineForm
                routineId={routine.id}
                getToken={getToken}
                onDone={() => setAssigningId(null)}
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function AssignRoutineForm({
  routineId,
  getToken,
  onDone,
}: {
  routineId: string;
  getToken: TokenGetter;
  onDone: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  async function handleSearch(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const data = await listMembers(getToken, { page: 1, pageSize: 10, q: query });
      setResults(data.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo buscar socios');
    }
  }

  async function handleAssign(memberId: string, memberName: string) {
    setBusy(true);
    setError(null);
    try {
      await assignRoutine(getToken, routineId, memberId);
      setConfirmation(`Rutina asignada a ${memberName}.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo asignar la rutina');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 border-t border-slate-200 pt-2">
      <form onSubmit={(event) => void handleSearch(event)} className="mb-2 flex gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar socio por nombre o código"
          aria-label="Buscar socio"
          className="w-full rounded border border-slate-300 px-2 py-0.5 text-sm"
        />
        <button type="submit" className="rounded border border-slate-300 px-2 py-0.5 text-sm">
          Buscar
        </button>
      </form>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {confirmation && <p className="text-sm text-green-700">{confirmation}</p>}

      {results.length > 0 && (
        <ul className="flex flex-col gap-1">
          {results.map((member) => (
            <li key={member.id} className="flex items-center justify-between gap-2 text-sm">
              <span>
                {member.fullName} ({member.memberCode})
              </span>
              <button
                type="button"
                onClick={() => void handleAssign(member.id, member.fullName)}
                disabled={busy}
                className="text-blue-700 underline disabled:opacity-50"
              >
                Asignar
              </button>
            </li>
          ))}
        </ul>
      )}

      <button type="button" onClick={onDone} className="mt-2 text-sm text-slate-600 underline">
        Cerrar
      </button>
    </div>
  );
}
