import { useEffect, useState, type FormEvent } from 'react';
import { Loader2, Plus, Search, UserPlus } from 'lucide-react';
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
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input, Label, Select } from '../components/ui/input';
import { Badge, type BadgeTone } from '../components/ui/badge';

const STATUS_LABELS: Record<RoutineSummary['status'], string> = {
  draft: 'Borrador',
  active: 'Activa',
  archived: 'Archivada',
};

const STATUS_TONE: Record<RoutineSummary['status'], BadgeTone> = {
  draft: 'default',
  active: 'success',
  archived: 'warning',
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
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="flex flex-col gap-6">
        <ExerciseCatalog exercises={exercises} getToken={getToken} onCreated={reload} />
        <CreateRoutineForm exercises={exercises} getToken={getToken} onCreated={reload} />
      </div>
      <Card className="h-fit">
        <CardHeader>
          <CardTitle>Rutinas creadas</CardTitle>
        </CardHeader>
        <CardContent>
          {loadError && (
            <p role="alert" className="mb-3 text-sm text-danger">
              {loadError}
            </p>
          )}
          <RoutinesList routines={routines} getToken={getToken} />
        </CardContent>
      </Card>
    </div>
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
    <Card>
      <CardHeader>
        <CardTitle>Catálogo de ejercicios</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {exercises.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {exercises.map((exercise) => (
              <Badge key={exercise.id}>{exercise.name}</Badge>
            ))}
          </div>
        ) : (
          <p className="text-sm text-chalk-muted">Todavía no hay ejercicios.</p>
        )}
        <form onSubmit={(event) => void handleSubmit(event)} className="flex gap-2">
          <Input
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Nuevo ejercicio (ej. Sentadilla)"
            aria-label="Nombre del ejercicio"
          />
          <Button type="submit" variant="outline" disabled={busy}>
            <Plus className="h-4 w-4" /> Agregar
          </Button>
        </form>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
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
    <Card>
      <CardHeader>
        <CardTitle>Nueva rutina</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-3">
          <div>
            <Label htmlFor="routine-name">Nombre</Label>
            <Input
              id="routine-name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-1"
            />
          </div>

          <div className="flex flex-col gap-2">
            {rows.map((row, index) => (
              <div
                key={index}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-line p-2"
              >
                <Select
                  value={row.exerciseId}
                  onChange={(event) => updateRow(index, { exerciseId: event.target.value })}
                  aria-label={`Ejercicio ${index + 1}`}
                  className="w-auto flex-1"
                >
                  <option value="">Elegir ejercicio…</option>
                  {exercises.map((exercise) => (
                    <option key={exercise.id} value={exercise.id}>
                      {exercise.name}
                    </option>
                  ))}
                </Select>
                <Input
                  type="number"
                  min="1"
                  value={row.sets}
                  onChange={(event) => updateRow(index, { sets: event.target.value })}
                  placeholder="Series"
                  aria-label={`Series del ejercicio ${index + 1}`}
                  className="w-20"
                />
                <Input
                  type="number"
                  min="1"
                  value={row.reps}
                  onChange={(event) => updateRow(index, { reps: event.target.value })}
                  placeholder="Reps"
                  aria-label={`Repeticiones del ejercicio ${index + 1}`}
                  className="w-20"
                />
                <Input
                  type="number"
                  min="0"
                  value={row.restSeconds}
                  onChange={(event) => updateRow(index, { restSeconds: event.target.value })}
                  placeholder="Descanso (s)"
                  aria-label={`Descanso del ejercicio ${index + 1}`}
                  className="w-28"
                />
              </div>
            ))}
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={() =>
              setRows((current) => [
                ...current,
                { exerciseId: '', sets: '', reps: '', restSeconds: '' },
              ])
            }
          >
            <Plus className="h-4 w-4" /> Agregar otro ejercicio
          </Button>

          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}

          <div className="flex justify-end">
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Crear rutina
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
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

  if (routines.length === 0) {
    return <p className="text-sm text-chalk-muted">Todavía no hay rutinas.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {routines.map((routine) => (
        <li key={routine.id} className="rounded-lg border border-line p-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 font-medium text-chalk">
              {routine.name}
              <Badge tone={STATUS_TONE[routine.status]}>{STATUS_LABELS[routine.status]}</Badge>
            </span>
            <Button
              variant={assigningId === routine.id ? 'secondary' : 'outline'}
              size="sm"
              onClick={() =>
                setAssigningId((current) => (current === routine.id ? null : routine.id))
              }
            >
              <UserPlus className="h-4 w-4" /> Asignar
            </Button>
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
    <div className="mt-3 border-t border-line pt-3">
      <form onSubmit={(event) => void handleSearch(event)} className="mb-2 flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-chalk-faint" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar socio por nombre o código"
            aria-label="Buscar socio"
            className="pl-9"
          />
        </div>
        <Button type="submit" variant="outline" size="sm">
          Buscar
        </Button>
      </form>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {confirmation && <p className="text-sm text-success">{confirmation}</p>}

      {results.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {results.map((member) => (
            <li key={member.id} className="flex items-center justify-between gap-2 text-sm">
              <span>
                {member.fullName} ({member.memberCode})
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void handleAssign(member.id, member.fullName)}
              >
                Asignar
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={onDone}>
        Cerrar
      </Button>
    </div>
  );
}
