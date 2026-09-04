import { useEffect, useState } from 'react';
import { CalendarCheck, ClipboardList, IdCard, Loader2 } from 'lucide-react';
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
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge, type BadgeTone } from '../components/ui/badge';

const STATUS_LABELS: Record<MembershipStatus, string> = {
  pending: 'Pendiente',
  active: 'Activa',
  expired: 'Vencida',
  suspended: 'Suspendida',
  cancelled: 'Cancelada',
};

const STATUS_TONE: Record<MembershipStatus, BadgeTone> = {
  pending: 'warning',
  active: 'success',
  expired: 'danger',
  suspended: 'warning',
  cancelled: 'default',
};

interface MemberDashboardProps {
  getToken: TokenGetter;
}

// Vista del socio (recorrido MVP completo — PLAN.md sección 2): su membresía, su
// asistencia y su rutina, todo de solo lectura y siempre resuelto por el Worker a
// partir de su propia cuenta (nunca eligiendo un memberId).
export default function MemberDashboard({ getToken }: MemberDashboardProps) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
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
    <Card id="mi-membresia">
      <CardHeader className="flex-row items-center gap-2">
        <IdCard className="h-5 w-5 text-accent" />
        <CardTitle>Mi membresía</CardTitle>
      </CardHeader>
      <CardContent>
        {state.kind === 'loading' && (
          <p role="status" className="flex items-center gap-2 text-sm text-chalk-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
          </p>
        )}
        {state.kind === 'none' && (
          <p className="text-sm text-chalk-muted">Todavía no tienes una membresía registrada.</p>
        )}
        {state.kind === 'error' && (
          <p role="alert" className="text-sm text-danger">
            {state.message}
          </p>
        )}
        {state.kind === 'success' && (
          <div className="flex flex-col gap-2 text-sm">
            <p>
              Plan <strong>{state.data.planName}</strong>
            </p>
            <div className="flex flex-wrap gap-1.5">
              <Badge tone={STATUS_TONE[state.data.status]} className="w-fit">
                {STATUS_LABELS[state.data.status]}
              </Badge>
              {state.data.debt > 0 && (
                <Badge tone="danger" className="w-fit">
                  Debe USD {state.data.debt}
                </Badge>
              )}
            </div>
            <p className="text-chalk-muted">
              Vigencia: {state.data.startDate} a {state.data.endDate}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
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
    <Card id="mi-asistencia">
      <CardHeader className="flex-row items-center gap-2">
        <CalendarCheck className="h-5 w-5 text-accent" />
        <CardTitle>Mi asistencia</CardTitle>
      </CardHeader>
      <CardContent>
        {state.kind === 'loading' && (
          <p role="status" className="flex items-center gap-2 text-sm text-chalk-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
          </p>
        )}
        {state.kind === 'error' && (
          <p role="alert" className="text-sm text-danger">
            {state.message}
          </p>
        )}
        {state.kind === 'success' && state.records.length === 0 && (
          <p className="text-sm text-chalk-muted">Sin visitas registradas todavía.</p>
        )}
        {state.kind === 'success' && state.records.length > 0 && (
          <ul className="flex flex-col gap-1.5 text-sm text-chalk-muted">
            {state.records.map((record) => (
              <li key={record.id}>{new Date(record.checkedInAt).toLocaleString('es')}</li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
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
    <Card id="mi-rutina">
      <CardHeader className="flex-row items-center gap-2">
        <ClipboardList className="h-5 w-5 text-accent" />
        <CardTitle>Mi rutina</CardTitle>
      </CardHeader>
      <CardContent>
        {state.kind === 'loading' && (
          <p role="status" className="flex items-center gap-2 text-sm text-chalk-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
          </p>
        )}
        {state.kind === 'none' && (
          <p className="text-sm text-chalk-muted">Todavía no tienes una rutina asignada.</p>
        )}
        {state.kind === 'error' && (
          <p role="alert" className="text-sm text-danger">
            {state.message}
          </p>
        )}
        {state.kind === 'success' && (
          <div>
            <p className="mb-2 text-sm text-chalk-muted">
              {state.data.routine.name} — asignada el {state.data.assignedAt.slice(0, 10)}
            </p>
            <ol className="flex flex-col gap-2">
              {state.data.routine.exercises.map((exercise) => (
                <li key={exercise.id} className="rounded-lg border border-line p-2.5 text-sm">
                  <p className="font-medium text-chalk">{exercise.exerciseName}</p>
                  <p className="text-chalk-muted">
                    {exercise.sets ? `${exercise.sets} series` : ''}
                    {exercise.reps ? ` × ${exercise.reps} reps` : ''}
                    {exercise.restSeconds ? ` · ${exercise.restSeconds}s descanso` : ''}
                  </p>
                  {exercise.notes && <p className="text-chalk-faint">{exercise.notes}</p>}
                </li>
              ))}
            </ol>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
