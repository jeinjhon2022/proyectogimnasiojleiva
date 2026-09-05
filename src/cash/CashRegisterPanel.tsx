import { useEffect, useState, type FormEvent } from 'react';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  History,
  Loader2,
  Lock,
  LockOpen,
  Wallet,
} from 'lucide-react';
import {
  ApiError,
  closeCashSession,
  createCashMovement,
  getCashSession,
  getCurrentCashSession,
  listCashSessions,
  openCashSession,
  type CashMovementMethod,
  type CashMovementType,
  type CashSession,
  type CashSessionSummary,
  type TokenGetter,
} from '../api';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Dialog } from '../components/ui/dialog';
import { Input, Label, Select } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { cn } from '../lib/utils';

const METHOD_LABELS: Record<CashMovementMethod, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  card_in_person: 'Tarjeta (presencial)',
  other: 'Otro',
};

interface CashRegisterPanelProps {
  getToken: TokenGetter;
}

type Tab = 'today' | 'history';

// Módulo de caja diaria: apertura/cierre con arqueo de efectivo obligatorio. Los pagos
// de socios (cuotas, cobros de deuda) ya viven en `payments` — esta pantalla los suma
// a la caja abierta en vez de duplicarlos en una tabla aparte (CLAUDE.md sección 7).
export default function CashRegisterPanel({ getToken }: CashRegisterPanelProps) {
  const [tab, setTab] = useState<Tab>('today');

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <div>
          <CardTitle>Caja</CardTitle>
          <CardDescription>Apertura, movimientos y cierre con arqueo</CardDescription>
        </div>
        <div className="flex gap-1.5">
          <Button
            variant={tab === 'today' ? 'secondary' : 'ghost'}
            size="sm"
            aria-pressed={tab === 'today'}
            onClick={() => setTab('today')}
          >
            <Wallet className="h-4 w-4" /> Caja del día
          </Button>
          <Button
            variant={tab === 'history' ? 'secondary' : 'ghost'}
            size="sm"
            aria-pressed={tab === 'history'}
            onClick={() => setTab('history')}
          >
            <History className="h-4 w-4" /> Historial
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {tab === 'today' ? (
          <TodaySession getToken={getToken} />
        ) : (
          <SessionHistory getToken={getToken} />
        )}
      </CardContent>
    </Card>
  );
}

function StatTile({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-md border p-3',
        highlight ? 'border-accent bg-accent-soft' : 'border-line bg-surface-raised',
      )}
    >
      <p className="font-mono text-xl font-semibold tabular-nums text-chalk">
        USD {value.toFixed(2)}
      </p>
      <p className="font-mono text-[10px] uppercase tracking-wider text-chalk-muted">{label}</p>
    </div>
  );
}

type TodayState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'closed' }
  | { kind: 'open'; summary: CashSessionSummary };

function TodaySession({ getToken }: { getToken: TokenGetter }) {
  const [state, setState] = useState<TodayState>({ kind: 'loading' });
  const [reloadToken, setReloadToken] = useState(0);
  const [showIncomeDialog, setShowIncomeDialog] = useState(false);
  const [showExpenseDialog, setShowExpenseDialog] = useState(false);
  const [showCloseDialog, setShowCloseDialog] = useState(false);

  const reload = () => setReloadToken((value) => value + 1);

  useEffect(() => {
    let cancelled = false;
    getCurrentCashSession(getToken)
      .then((data) => {
        if (cancelled) return;
        if (data.session === null) setState({ kind: 'closed' });
        else setState({ kind: 'open', summary: data as CashSessionSummary });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            kind: 'error',
            message: error instanceof ApiError ? error.message : 'No se pudo cargar la caja',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [getToken, reloadToken]);

  if (state.kind === 'loading') {
    return (
      <p role="status" className="flex items-center gap-2 py-6 text-sm text-chalk-muted">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando caja…
      </p>
    );
  }
  if (state.kind === 'error') {
    return (
      <p role="alert" className="py-6 text-sm text-danger">
        {state.message}
      </p>
    );
  }
  if (state.kind === 'closed') {
    return <OpenSessionForm getToken={getToken} onOpened={reload} />;
  }

  const { summary } = state;
  const { session } = summary;

  // "Movimientos del día": pagos de socios + movimientos manuales, mezclados por hora.
  const feed = [
    ...summary.payments.map((payment) => ({
      id: payment.id,
      timestamp: payment.paymentDate,
      kind: 'income' as const,
      origin: `Pago — ${payment.memberFullName}`,
      method: payment.method,
      amount: payment.amount,
    })),
    ...summary.productSales.map((sale) => ({
      id: sale.id,
      timestamp: sale.createdAt,
      kind: 'income' as const,
      origin: `Venta — ${sale.productName} x${sale.quantity}`,
      method: sale.method,
      amount: sale.total,
    })),
    ...summary.movements.map((movement) => ({
      id: movement.id,
      timestamp: movement.createdAt,
      kind: movement.type === 'manual_income' ? ('income' as const) : ('expense' as const),
      origin: movement.description,
      method: movement.method,
      amount: movement.amount,
    })),
  ].sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <Badge tone="success">
          <LockOpen className="h-3 w-3" /> Caja abierta desde{' '}
          {new Date(session.openedAt).toLocaleTimeString('es', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Badge>
        <Button variant="destructive" size="sm" onClick={() => setShowCloseDialog(true)}>
          <Lock className="h-4 w-4" /> Cerrar caja
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatTile label="Saldo inicial" value={session.initialBalance} />
        <StatTile label="Ingresos" value={summary.totalIncomes} />
        <StatTile label="Egresos" value={summary.totalExpenses} />
        <StatTile label="Efectivo esperado" value={summary.expectedCash} highlight />
      </div>

      <div className="flex gap-2">
        <Button size="sm" onClick={() => setShowIncomeDialog(true)}>
          <ArrowUpCircle className="h-4 w-4" /> Agregar ingreso
        </Button>
        <Button size="sm" variant="outline" onClick={() => setShowExpenseDialog(true)}>
          <ArrowDownCircle className="h-4 w-4" /> Agregar egreso
        </Button>
      </div>

      <div>
        <h4 className="mb-2 font-mono text-xs uppercase tracking-wider text-chalk-muted">
          Movimientos del día
        </h4>
        {feed.length === 0 ? (
          <p className="text-sm text-chalk-muted">Sin movimientos todavía.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
            {feed.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-2 p-2.5 text-sm">
                <div className="min-w-0">
                  <p className="truncate text-chalk">{item.origin}</p>
                  <p className="font-mono text-xs text-chalk-muted">
                    {new Date(item.timestamp).toLocaleTimeString('es', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}{' '}
                    · {METHOD_LABELS[item.method]}
                  </p>
                </div>
                <span
                  className={cn(
                    'shrink-0 font-mono text-sm font-semibold',
                    item.kind === 'income' ? 'text-success' : 'text-danger',
                  )}
                >
                  {item.kind === 'income' ? '+' : '-'}USD {item.amount.toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog
        open={showIncomeDialog}
        onClose={() => setShowIncomeDialog(false)}
        title="Agregar ingreso manual"
      >
        <MovementForm
          getToken={getToken}
          type="manual_income"
          onDone={() => {
            setShowIncomeDialog(false);
            reload();
          }}
        />
      </Dialog>
      <Dialog
        open={showExpenseDialog}
        onClose={() => setShowExpenseDialog(false)}
        title="Agregar egreso manual"
      >
        <MovementForm
          getToken={getToken}
          type="manual_expense"
          onDone={() => {
            setShowExpenseDialog(false);
            reload();
          }}
        />
      </Dialog>
      <Dialog open={showCloseDialog} onClose={() => setShowCloseDialog(false)} title="Cerrar caja">
        <CloseSessionForm
          getToken={getToken}
          session={session}
          expectedCash={summary.expectedCash}
          onDone={() => {
            setShowCloseDialog(false);
            reload();
          }}
        />
      </Dialog>
    </div>
  );
}

function OpenSessionForm({ getToken, onOpened }: { getToken: TokenGetter; onOpened: () => void }) {
  const [initialBalance, setInitialBalance] = useState('0');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = Number(initialBalance);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setError('Ingresa un saldo inicial válido (0 o mayor)');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await openCashSession(getToken, parsed);
      onOpened();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo abrir la caja');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-4 py-8 text-center">
      <Lock className="h-8 w-8 text-chalk-faint" />
      <div>
        <p className="font-medium text-chalk">No hay una caja abierta</p>
        <p className="text-sm text-chalk-muted">
          Abre la caja del día para poder registrar pagos, ingresos y egresos.
        </p>
      </div>
      <form onSubmit={(event) => void handleSubmit(event)} className="flex items-end gap-2">
        <div>
          <Label htmlFor="initial-balance">Saldo inicial (USD)</Label>
          <Input
            id="initial-balance"
            type="number"
            min="0"
            step="0.01"
            value={initialBalance}
            onChange={(event) => setInitialBalance(event.target.value)}
            className="mt-1 w-32"
          />
        </div>
        <Button type="submit" disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          <LockOpen className="h-4 w-4" /> Abrir caja
        </Button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function MovementForm({
  getToken,
  type,
  onDone,
}: {
  getToken: TokenGetter;
  type: CashMovementType;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<CashMovementMethod>('cash');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError('Ingresa un importe válido (mayor a 0)');
      return;
    }
    if (!description.trim()) {
      setError('Describe el motivo del movimiento');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createCashMovement(getToken, {
        type,
        amount: parsedAmount,
        method,
        description: description.trim(),
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo registrar el movimiento');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-3">
      <div>
        <Label htmlFor="movement-description">Descripción</Label>
        <Input
          id="movement-description"
          required
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder={
            type === 'manual_income' ? 'Ej. venta de agua' : 'Ej. compra de papel higiénico'
          }
          className="mt-1"
        />
      </div>
      <div className="flex gap-2">
        <div>
          <Label htmlFor="movement-amount">Importe (USD)</Label>
          <Input
            id="movement-amount"
            type="number"
            min="0.01"
            max="100000"
            step="0.01"
            required
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="mt-1 w-32"
          />
        </div>
        <div>
          <Label htmlFor="movement-method">Método</Label>
          <Select
            id="movement-method"
            value={method}
            onChange={(event) => setMethod(event.target.value as CashMovementMethod)}
            className="mt-1"
          >
            {Object.entries(METHOD_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-1 flex justify-end">
        <Button type="submit" disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Registrar {type === 'manual_income' ? 'ingreso' : 'egreso'}
        </Button>
      </div>
    </form>
  );
}

function CloseSessionForm({
  getToken,
  session,
  expectedCash,
  onDone,
}: {
  getToken: TokenGetter;
  session: CashSession;
  expectedCash: number;
  onDone: () => void;
}) {
  const [countedCash, setCountedCash] = useState(expectedCash.toFixed(2));
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedCounted = Number(countedCash);
  const difference = Number.isFinite(parsedCounted) ? parsedCounted - expectedCash : null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!Number.isFinite(parsedCounted) || parsedCounted < 0) {
      setError('Ingresa el efectivo contado (0 o mayor)');
      return;
    }
    const confirmed = window.confirm(
      difference !== null && Math.abs(difference) > 0.009
        ? `Hay una diferencia de USD ${difference.toFixed(2)} contra lo esperado. ¿Cerrar la caja de todas formas?`
        : '¿Cerrar la caja? No se podrán registrar más movimientos en esta sesión.',
    );
    if (!confirmed) return;

    setBusy(true);
    setError(null);
    try {
      await closeCashSession(getToken, session.id, {
        countedCash: parsedCounted,
        notes: notes.trim() || undefined,
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cerrar la caja');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-3">
      <p className="text-sm text-chalk-muted">
        Efectivo esperado en caja:{' '}
        <strong className="text-chalk">USD {expectedCash.toFixed(2)}</strong>
      </p>
      <div>
        <Label htmlFor="counted-cash">Efectivo contado (arqueo)</Label>
        <Input
          id="counted-cash"
          type="number"
          min="0"
          step="0.01"
          required
          value={countedCash}
          onChange={(event) => setCountedCash(event.target.value)}
          className="mt-1 w-40"
        />
      </div>
      {difference !== null && (
        <Badge tone={Math.abs(difference) <= 0.009 ? 'success' : 'warning'} className="w-fit">
          Diferencia: {difference >= 0 ? '+' : ''}
          USD {difference.toFixed(2)}
        </Badge>
      )}
      <div>
        <Label htmlFor="close-notes">Notas (opcional)</Label>
        <Input
          id="close-notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Ej. faltante por vuelto mal dado"
          className="mt-1"
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-1 flex justify-end">
        <Button type="submit" variant="destructive" disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Confirmar cierre
        </Button>
      </div>
    </form>
  );
}

function SessionHistory({ getToken }: { getToken: TokenGetter }) {
  const [state, setState] = useState<
    | { kind: 'loading' }
    | { kind: 'error'; message: string }
    | { kind: 'success'; items: CashSession[] }
  >({ kind: 'loading' });
  const [selected, setSelected] = useState<CashSessionSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    listCashSessions(getToken, { page: 1, pageSize: 30 })
      .then((data) => {
        if (!cancelled) setState({ kind: 'success', items: data.items });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            kind: 'error',
            message: error instanceof ApiError ? error.message : 'No se pudo cargar el historial',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  async function handleSelect(id: string) {
    try {
      const summary = await getCashSession(getToken, id);
      setSelected(summary);
    } catch {
      // el error se ignora: la fila simplemente no abre el detalle
    }
  }

  if (state.kind === 'loading') {
    return (
      <p role="status" className="flex items-center gap-2 py-6 text-sm text-chalk-muted">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando historial…
      </p>
    );
  }
  if (state.kind === 'error') {
    return (
      <p role="alert" className="py-6 text-sm text-danger">
        {state.message}
      </p>
    );
  }
  if (state.items.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-chalk-muted">Todavía no hay cajas cerradas.</p>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-raised font-mono text-[10px] uppercase tracking-wider text-chalk-muted">
            <tr>
              <th className="px-4 py-2.5 font-medium">Apertura</th>
              <th className="px-4 py-2.5 font-medium">Saldo inicial</th>
              <th className="px-4 py-2.5 font-medium">Estado</th>
              <th className="px-4 py-2.5 font-medium">Efectivo contado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {state.items.map((session) => (
              <tr
                key={session.id}
                className="cursor-pointer hover:bg-surface-raised"
                onClick={() => void handleSelect(session.id)}
              >
                <td className="px-4 py-2.5 text-chalk">
                  {new Date(session.openedAt).toLocaleString('es')}
                </td>
                <td className="px-4 py-2.5 font-mono text-chalk-muted">
                  USD {session.initialBalance.toFixed(2)}
                </td>
                <td className="px-4 py-2.5">
                  <Badge tone={session.status === 'open' ? 'success' : 'default'}>
                    {session.status === 'open' ? 'Abierta' : 'Cerrada'}
                  </Badge>
                </td>
                <td className="px-4 py-2.5 font-mono text-chalk-muted">
                  {session.countedCash === null ? '—' : `USD ${session.countedCash.toFixed(2)}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog
        open={selected !== null}
        onClose={() => setSelected(null)}
        title="Detalle de la caja"
        className="max-w-2xl"
      >
        {selected && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <StatTile label="Saldo inicial" value={selected.session.initialBalance} />
              <StatTile label="Ingresos" value={selected.totalIncomes} />
              <StatTile label="Egresos" value={selected.totalExpenses} />
              <StatTile
                label={
                  selected.session.status === 'closed' ? 'Efectivo contado' : 'Efectivo esperado'
                }
                value={selected.session.countedCash ?? selected.expectedCash}
                highlight
              />
            </div>
            {selected.session.notes && (
              <p className="text-sm text-chalk-muted">Notas: {selected.session.notes}</p>
            )}
          </div>
        )}
      </Dialog>
    </>
  );
}
