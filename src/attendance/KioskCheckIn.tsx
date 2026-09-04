import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Delete, Fingerprint, Loader2, XCircle } from 'lucide-react';
import {
  ApiError,
  getAttendanceSummary,
  kioskCheckIn,
  listAttendance,
  listMembers,
  type AttendanceRecord,
  type AttendanceSummary,
  type KioskCheckInResult,
  type Member,
  type TokenGetter,
} from '../api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';

const KEYPAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'];

type CheckInState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'success'; data: KioskCheckInResult }
  | { kind: 'error'; message: string };

interface KioskCheckInProps {
  getToken: TokenGetter;
}

// Dashboard de check-in tipo kiosco (idea tomada de la referencia "GymAdmin" que
// compartió el usuario, adaptada a lo que ya existe en este gimnasio real): teclado
// numérico en pantalla para ingresar la cédula/DNI, valida que la membresía esté
// vigente y registra la asistencia, con feedback inmediato de éxito o error.
export default function KioskCheckIn({ getToken }: KioskCheckInProps) {
  const [nationalId, setNationalId] = useState('');
  const [state, setState] = useState<CheckInState>({ kind: 'idle' });
  const [reloadToken, setReloadToken] = useState(0);

  const refreshPanels = useCallback(() => setReloadToken((value) => value + 1), []);

  function handleKeyPress(key: string) {
    if (state.kind === 'submitting') return;
    if (key === 'C') {
      setNationalId('');
    } else if (key === '⌫') {
      setNationalId((current) => current.slice(0, -1));
    } else {
      setNationalId((current) => (current.length < 30 ? current + key : current));
    }
  }

  async function handleSubmit() {
    const trimmed = nationalId.trim();
    if (!trimmed) return;
    setState({ kind: 'submitting' });
    try {
      const data = await kioskCheckIn(getToken, trimmed);
      setState({ kind: 'success', data });
      setNationalId('');
      refreshPanels();
    } catch (error) {
      setState({
        kind: 'error',
        message: error instanceof ApiError ? error.message : 'No se pudo registrar el ingreso',
      });
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader className="flex-row items-center gap-2">
          <Fingerprint className="h-5 w-5 text-accent" />
          <CardTitle>Check-in</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-5 py-8">
          <Input
            value={nationalId}
            onChange={(event) => setNationalId(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void handleSubmit();
            }}
            placeholder="Cédula / DNI"
            aria-label="Número de identificación"
            autoFocus
            className="h-14 max-w-xs text-center font-mono text-2xl tracking-widest"
          />

          <div className="grid grid-cols-3 gap-2">
            {KEYPAD_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => handleKeyPress(key)}
                aria-label={key === '⌫' ? 'Borrar' : key === 'C' ? 'Limpiar' : key}
                className="flex h-16 w-16 items-center justify-center rounded-md border border-line bg-surface-raised font-mono text-xl font-semibold text-chalk transition-colors hover:border-accent active:scale-95"
              >
                {key === '⌫' ? <Delete className="h-5 w-5" /> : key}
              </button>
            ))}
          </div>

          <Button
            className="h-12 w-full max-w-xs text-sm"
            disabled={!nationalId.trim() || state.kind === 'submitting'}
            onClick={() => void handleSubmit()}
          >
            {state.kind === 'submitting' && <Loader2 className="h-4 w-4 animate-spin" />}
            Registrar ingreso
          </Button>

          <div className="min-h-[4.5rem] w-full max-w-sm" aria-live="polite">
            {state.kind === 'success' && (
              <div className="flex items-start gap-3 rounded-md border border-success bg-success-soft p-3">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
                <div className="text-sm">
                  <p className="font-semibold text-chalk">{state.data.member.fullName}</p>
                  <p className="text-chalk-muted">
                    {state.data.member.memberCode} · Plan {state.data.membership.planName}
                  </p>
                  <p className="text-chalk-muted">
                    Ingreso registrado{' '}
                    {new Date(state.data.attendance.checkedInAt).toLocaleTimeString('es')}
                  </p>
                </div>
              </div>
            )}
            {state.kind === 'error' && (
              <div
                role="alert"
                className="flex items-start gap-3 rounded-md border border-danger bg-danger-soft p-3"
              >
                <XCircle className="h-5 w-5 shrink-0 text-danger" />
                <p className="text-sm text-chalk">{state.message}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-6">
        <TodaySummaryCard getToken={getToken} reloadToken={reloadToken} />
        <RecentCheckInsCard getToken={getToken} reloadToken={reloadToken} />
        <UpcomingExpirationsCard getToken={getToken} />
      </div>
    </div>
  );
}

function TodaySummaryCard({
  getToken,
  reloadToken,
}: {
  getToken: TokenGetter;
  reloadToken: number;
}) {
  const [summary, setSummary] = useState<AttendanceSummary | null>(null);

  useEffect(() => {
    getAttendanceSummary(getToken)
      .then(setSummary)
      .catch(() => setSummary(null));
  }, [getToken, reloadToken]);

  return (
    <Card>
      <CardContent className="flex items-center justify-around py-5">
        <div className="text-center">
          <p className="font-mono text-3xl font-semibold tabular-nums text-chalk">
            {summary?.today ?? '—'}
          </p>
          <p className="font-mono text-[10px] uppercase tracking-wider text-chalk-muted">
            Ingresos hoy
          </p>
        </div>
        <div className="text-center">
          <p className="font-mono text-3xl font-semibold tabular-nums text-chalk">
            {summary?.last30Days ?? '—'}
          </p>
          <p className="font-mono text-[10px] uppercase tracking-wider text-chalk-muted">
            Últimos 30 días
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function RecentCheckInsCard({
  getToken,
  reloadToken,
}: {
  getToken: TokenGetter;
  reloadToken: number;
}) {
  const [records, setRecords] = useState<AttendanceRecord[] | null>(null);

  useEffect(() => {
    listAttendance(getToken, { page: 1, pageSize: 6 })
      .then((data) => setRecords(data.items))
      .catch(() => setRecords(null));
  }, [getToken, reloadToken]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Últimos ingresos</CardTitle>
      </CardHeader>
      <CardContent>
        {records === null && (
          <p role="status" className="flex items-center gap-2 text-sm text-chalk-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
          </p>
        )}
        {records !== null && records.length === 0 && (
          <p className="text-sm text-chalk-muted">Sin ingresos todavía hoy.</p>
        )}
        {records !== null && records.length > 0 && (
          <ul className="flex flex-col gap-2 text-sm">
            {records.map((record) => (
              <li key={record.id} className="flex items-center justify-between gap-2">
                <span className="truncate text-chalk">{record.memberFullName}</span>
                <span className="shrink-0 font-mono text-xs text-chalk-muted">
                  {new Date(record.checkedInAt).toLocaleTimeString('es', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function UpcomingExpirationsCard({ getToken }: { getToken: TokenGetter }) {
  const [members, setMembers] = useState<Member[] | null>(null);

  useEffect(() => {
    listMembers(getToken, { page: 1, pageSize: 5, membershipStatus: 'expiring' })
      .then((data) => setMembers(data.items))
      .catch(() => setMembers(null));
  }, [getToken]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Vencimientos próximos</CardTitle>
      </CardHeader>
      <CardContent>
        {members === null && (
          <p role="status" className="flex items-center gap-2 text-sm text-chalk-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
          </p>
        )}
        {members !== null && members.length === 0 && (
          <p className="text-sm text-chalk-muted">Nadie por vencer en los próximos días.</p>
        )}
        {members !== null && members.length > 0 && (
          <ul className="flex flex-col gap-2 text-sm">
            {members.map((member) => (
              <li key={member.id} className="flex items-center justify-between gap-2">
                <span className="truncate text-chalk">{member.fullName}</span>
                <Badge tone="warning">Por vencer</Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
