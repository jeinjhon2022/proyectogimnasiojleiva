import { useEffect, useState } from 'react';
import {
  ApiError,
  getAttendanceSummary,
  getMyAttendance,
  getMyMembership,
  getMyRoutine,
  type AttendanceRecord,
  type MembershipStatus,
  type MyMembership,
  type MyRoutineResponse,
  type TokenGetter,
} from '../api';

const STATUS_LABELS: Record<MembershipStatus, string> = {
  pending: 'Pendiente',
  active: 'Activa',
  expired: 'Vencida',
  suspended: 'Suspendida',
  cancelled: 'Cancelada',
};

interface MemberDashboardProps {
  getToken: TokenGetter;
}

// Vista del socio (recorrido MVP completo — PLAN.md sección 2): su membresía, su
// asistencia y su rutina, todo de solo lectura y siempre resuelto por el Worker a
// partir de su propia cuenta (nunca eligiendo un memberId).
export default function MemberDashboard({ getToken }: MemberDashboardProps) {
  return (
    <div className="flex w-full max-w-md flex-col gap-6 text-left">
      <MyMembershipSection getToken={getToken} />
      <MyAttendanceSection getToken={getToken} />
      <MyRoutineSection getToken={getToken} />
    </div>
  );
}

type MembershipState =
  | { kind: 'loading' }
  | { kind: 'none' }
  | { kind: 'error'; message: string }
  | { kind: 'success'; data: MyMembership };

function MyMembershipSection({ getToken }: { getToken: TokenGetter }) {
  const [state, setState] = useState<MembershipState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    getMyMembership(getToken)
      .then((data) => {
        if (!cancelled) setState({ kind: 'success', data });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 404) {
          setState({ kind: 'none' });
        } else {
          setState({
            kind: 'error',
            message: error instanceof ApiError ? error.message : 'No se pudo cargar tu membresía',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  return (
    <section>
      <h2 className="mb-2 text-lg font-semibold">Mi membresía</h2>
      {state.kind === 'loading' && <p role="status">Cargando…</p>}
      {state.kind === 'none' && (
        <p className="text-sm">Todavía no tienes una membresía registrada.</p>
      )}
      {state.kind === 'error' && (
        <p role="alert" className="text-sm text-red-600">
          {state.message}
        </p>
      )}
      {state.kind === 'success' && (
        <p className="text-sm">
          Plan <strong>{state.data.planName}</strong> — {STATUS_LABELS[state.data.status]} ·
          vigencia {state.data.startDate} a {state.data.endDate}
        </p>
      )}
    </section>
  );
}

type AttendanceState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'success'; records: AttendanceRecord[]; today: number };

function MyAttendanceSection({ getToken }: { getToken: TokenGetter }) {
  const [state, setState] = useState<AttendanceState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getMyAttendance(getToken, { page: 1, pageSize: 5 }),
      getAttendanceSummary(getToken).catch(() => null),
    ])
      .then(([attendanceData, summary]) => {
        if (!cancelled)
          setState({ kind: 'success', records: attendanceData.items, today: summary?.today ?? 0 });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            kind: 'error',
            message: error instanceof ApiError ? error.message : 'No se pudo cargar tu asistencia',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  return (
    <section>
      <h2 className="mb-2 text-lg font-semibold">Mi asistencia</h2>
      {state.kind === 'loading' && <p role="status">Cargando…</p>}
      {state.kind === 'error' && (
        <p role="alert" className="text-sm text-red-600">
          {state.message}
        </p>
      )}
      {state.kind === 'success' && state.records.length === 0 && (
        <p className="text-sm">Sin visitas registradas todavía.</p>
      )}
      {state.kind === 'success' && state.records.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm">
          {state.records.map((record) => (
            <li key={record.id}>{new Date(record.checkedInAt).toLocaleString('es')}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

type RoutineState =
  | { kind: 'loading' }
  | { kind: 'none' }
  | { kind: 'error'; message: string }
  | { kind: 'success'; data: MyRoutineResponse };

function MyRoutineSection({ getToken }: { getToken: TokenGetter }) {
  const [state, setState] = useState<RoutineState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    getMyRoutine(getToken)
      .then((data) => {
        if (!cancelled) setState({ kind: 'success', data });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 404) {
          setState({ kind: 'none' });
        } else {
          setState({
            kind: 'error',
            message: error instanceof ApiError ? error.message : 'No se pudo cargar tu rutina',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  return (
    <section>
      <h2 className="mb-2 text-lg font-semibold">Mi rutina</h2>
      {state.kind === 'loading' && <p role="status">Cargando…</p>}
      {state.kind === 'none' && <p className="text-sm">Todavía no tienes una rutina asignada.</p>}
      {state.kind === 'error' && (
        <p role="alert" className="text-sm text-red-600">
          {state.message}
        </p>
      )}
      {state.kind === 'success' && (
        <div>
          <p className="mb-2 text-sm text-slate-600">
            {state.data.routine.name} — asignada el {state.data.assignedAt.slice(0, 10)}
          </p>
          <ol className="flex flex-col gap-2">
            {state.data.routine.exercises.map((exercise) => (
              <li key={exercise.id} className="rounded border border-slate-300 p-2 text-sm">
                <p className="font-medium">{exercise.exerciseName}</p>
                <p className="text-slate-600">
                  {exercise.sets ? `${exercise.sets} series` : ''}
                  {exercise.reps ? ` × ${exercise.reps} reps` : ''}
                  {exercise.restSeconds ? ` · ${exercise.restSeconds}s descanso` : ''}
                </p>
                {exercise.notes && <p className="text-slate-500">{exercise.notes}</p>}
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
