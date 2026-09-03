import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  ApiError,
  createAttendance,
  createMember,
  createMembership,
  createPayment,
  deactivateMember,
  getAttendanceSummary,
  listAttendance,
  listMemberships,
  listMembers,
  listMembershipPlans,
  listPayments,
  renewMembership,
  updateMember,
  voidPayment,
  type AttendanceRecord,
  type AttendanceSummary,
  type Member,
  type Membership,
  type MembershipPlan,
  type MembershipStatus,
  type MembersPage,
  type Payment,
  type PaymentMethod,
  type Role,
  type TokenGetter,
} from '../api';

const METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  card_in_person: 'Tarjeta (presencial)',
  other: 'Otro',
};

const STATUS_LABELS: Record<MembershipStatus, string> = {
  pending: 'Pendiente',
  active: 'Activa',
  expired: 'Vencida',
  suspended: 'Suspendida',
  cancelled: 'Cancelada',
};

const PAGE_SIZE = 10;

type ListState =
  { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'success'; data: MembersPage };

interface MembersPanelProps {
  getToken: TokenGetter;
  role: Role;
}

// Módulo de socios (Fase 4): lista con búsqueda y paginación, alta, edición y
// desactivación. Solo se monta para admin/receptionist (ver App.tsx); el Worker
// vuelve a verificar el permiso en cada request de todas formas (CLAUDE.md sección 5).
export default function MembersPanel({ getToken, role }: MembersPanelProps) {
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [state, setState] = useState<ListState>({ kind: 'loading' });
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [attendanceSummary, setAttendanceSummary] = useState<AttendanceSummary | null>(null);

  const reload = useCallback(() => setReloadToken((value) => value + 1), []);

  useEffect(() => {
    listMembershipPlans(getToken)
      .then((data) => setPlans(data.items))
      .catch(() => setPlans([])); // sección de membresía muestra su propio error si hace falta un plan
  }, [getToken]);

  useEffect(() => {
    getAttendanceSummary(getToken)
      .then(setAttendanceSummary)
      .catch(() => setAttendanceSummary(null)); // resumen es informativo; un fallo aquí no bloquea el resto
  }, [getToken, reloadToken]);

  useEffect(() => {
    let cancelled = false;

    // No se resetea a "loading" aquí: mientras llega la respuesta se sigue mostrando
    // la última lista cargada (evita el parpadeo en cada cambio de página/búsqueda).
    // El estado inicial ya es "loading" (ver useState arriba).
    listMembers(getToken, { page, pageSize: PAGE_SIZE, q: query || undefined })
      .then((data) => {
        if (!cancelled) setState({ kind: 'success', data });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            kind: 'error',
            message:
              error instanceof ApiError ? error.message : 'No se pudo cargar la lista de socios',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [getToken, page, query, reloadToken]);

  function handleSearchSubmit(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setQuery(searchInput.trim());
  }

  return (
    <section className="w-full max-w-3xl text-left">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Socios</h2>
          {attendanceSummary && (
            <p className="text-xs text-slate-500">
              Asistencias hoy: {attendanceSummary.today} · últimos 30 días:{' '}
              {attendanceSummary.last30Days}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowCreateForm((value) => !value)}
          className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
        >
          {showCreateForm ? 'Cancelar' : 'Nuevo socio'}
        </button>
      </div>

      {showCreateForm && (
        <CreateMemberForm
          getToken={getToken}
          onCreated={() => {
            setShowCreateForm(false);
            setPage(1);
            reload();
          }}
        />
      )}

      <form onSubmit={handleSearchSubmit} className="mb-3 flex gap-2">
        <input
          type="text"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Buscar por nombre, correo, teléfono o código"
          aria-label="Buscar socios"
          className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
        />
        <button type="submit" className="rounded border border-slate-300 px-3 py-1 text-sm">
          Buscar
        </button>
      </form>

      {state.kind === 'loading' && <p role="status">Cargando socios…</p>}

      {state.kind === 'error' && (
        <p role="alert" className="text-red-600">
          {state.message}
        </p>
      )}

      {state.kind === 'success' && state.data.items.length === 0 && (
        <p>No hay socios que coincidan con la búsqueda.</p>
      )}

      {state.kind === 'success' && state.data.items.length > 0 && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-300 text-left">
                  <th className="py-1 pr-2">Código</th>
                  <th className="py-1 pr-2">Nombre</th>
                  <th className="py-1 pr-2">Correo</th>
                  <th className="py-1 pr-2">Teléfono</th>
                  <th className="py-1 pr-2">Estado</th>
                  <th className="py-1 pr-2">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {state.data.items.map((member) => (
                  <MemberRow
                    key={member.id}
                    member={member}
                    getToken={getToken}
                    plans={plans}
                    role={role}
                    onChanged={reload}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
            <span>
              Página {state.data.page} de{' '}
              {Math.max(1, Math.ceil(state.data.total / state.data.pageSize))} ({state.data.total}{' '}
              socios)
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
              >
                Anterior
              </button>
              <button
                type="button"
                disabled={page * PAGE_SIZE >= state.data.total}
                onClick={() => setPage((value) => value + 1)}
                className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
              >
                Siguiente
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

interface CreateMemberFormProps {
  getToken: TokenGetter;
  onCreated: () => void;
}

type SubmitState = { kind: 'idle' } | { kind: 'submitting' } | { kind: 'error'; message: string };

function CreateMemberForm({ getToken, onCreated }: CreateMemberFormProps) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [submitState, setSubmitState] = useState<SubmitState>({ kind: 'idle' });

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitState({ kind: 'submitting' });
    try {
      await createMember(getToken, { fullName, email, phone: phone || undefined });
      onCreated();
    } catch (error) {
      setSubmitState({
        kind: 'error',
        message: error instanceof ApiError ? error.message : 'No se pudo registrar el socio',
      });
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-4 flex flex-col gap-2 rounded border border-slate-300 p-3"
    >
      <label className="text-sm">
        Nombre completo
        <input
          required
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
        />
      </label>
      <label className="text-sm">
        Correo
        <input
          required
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
        />
      </label>
      <label className="text-sm">
        Teléfono (opcional)
        <input
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
        />
      </label>

      {submitState.kind === 'error' && (
        <p role="alert" className="text-sm text-red-600">
          {submitState.message}
        </p>
      )}

      <button
        type="submit"
        disabled={submitState.kind === 'submitting'}
        className="self-start rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {submitState.kind === 'submitting' ? 'Guardando…' : 'Guardar socio'}
      </button>
    </form>
  );
}

interface MemberRowProps {
  member: Member;
  getToken: TokenGetter;
  plans: MembershipPlan[];
  role: Role;
  onChanged: () => void;
}

function MemberRow({ member, getToken, plans, role, onChanged }: MemberRowProps) {
  const [editing, setEditing] = useState(false);
  const [showMembership, setShowMembership] = useState(false);
  const [showPayments, setShowPayments] = useState(false);
  const [showAttendance, setShowAttendance] = useState(false);
  const [fullName, setFullName] = useState(member.fullName);
  // MembersPanel solo se monta para admin/receptionist (App.tsx), que siempre ven el
  // correo real; el `?? ''` es solo para que el tipo cierre con la vista de entrenador.
  const [email, setEmail] = useState(member.email ?? '');
  const [phone, setPhone] = useState(member.phone ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setBusy(true);
    setError(null);
    try {
      await updateMember(getToken, member.id, { fullName, email, phone: phone || null });
      setEditing(false);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar el cambio');
    } finally {
      setBusy(false);
    }
  }

  // Acción sensible: se confirma antes de ejecutarla (CLAUDE.md sección 9).
  async function handleDeactivate() {
    const confirmed = window.confirm(
      `¿Desactivar a ${member.fullName}? También bloquea su acceso a la app.`,
    );
    if (!confirmed) return;

    setBusy(true);
    setError(null);
    try {
      await deactivateMember(getToken, member.id);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo desactivar al socio');
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <tr className="border-b border-slate-200">
        <td className="py-1 pr-2">{member.memberCode}</td>
        <td className="py-1 pr-2">
          <input
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            className="w-full rounded border border-slate-300 px-1 py-0.5 text-sm"
          />
        </td>
        <td className="py-1 pr-2">
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded border border-slate-300 px-1 py-0.5 text-sm"
          />
        </td>
        <td className="py-1 pr-2">
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            className="w-full rounded border border-slate-300 px-1 py-0.5 text-sm"
          />
        </td>
        <td className="py-1 pr-2">{member.isActive ? 'Activo' : 'Inactivo'}</td>
        <td className="py-1 pr-2">
          <div className="flex flex-col gap-1">
            {error && (
              <span role="alert" className="text-red-600">
                {error}
              </span>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={busy}
                className="text-blue-700 underline disabled:opacity-50"
              >
                Guardar
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                disabled={busy}
                className="text-slate-600 underline"
              >
                Cancelar
              </button>
            </div>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <>
      <tr className="border-b border-slate-200">
        <td className="py-1 pr-2">{member.memberCode}</td>
        <td className="py-1 pr-2">{member.fullName}</td>
        <td className="py-1 pr-2">{member.email}</td>
        <td className="py-1 pr-2">{member.phone ?? '—'}</td>
        <td className="py-1 pr-2">{member.isActive ? 'Activo' : 'Inactivo'}</td>
        <td className="py-1 pr-2">
          <div className="flex flex-col gap-1">
            {error && (
              <span role="alert" className="text-red-600">
                {error}
              </span>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="text-blue-700 underline"
              >
                Editar
              </button>
              <button
                type="button"
                onClick={() => setShowMembership((value) => !value)}
                className="text-blue-700 underline"
              >
                {showMembership ? 'Ocultar membresía' : 'Membresía'}
              </button>
              <button
                type="button"
                onClick={() => setShowPayments((value) => !value)}
                className="text-blue-700 underline"
              >
                {showPayments ? 'Ocultar pagos' : 'Pagos'}
              </button>
              <button
                type="button"
                onClick={() => setShowAttendance((value) => !value)}
                className="text-blue-700 underline"
              >
                {showAttendance ? 'Ocultar asistencia' : 'Asistencia'}
              </button>
              {member.isActive && role === 'admin' && (
                <button
                  type="button"
                  onClick={() => void handleDeactivate()}
                  disabled={busy}
                  className="text-red-700 underline disabled:opacity-50"
                >
                  Desactivar
                </button>
              )}
            </div>
          </div>
        </td>
      </tr>
      {showMembership && (
        <tr className="border-b border-slate-200 bg-slate-50">
          <td colSpan={6} className="p-2">
            <MembershipSection memberId={member.id} plans={plans} getToken={getToken} />
          </td>
        </tr>
      )}
      {showPayments && (
        <tr className="border-b border-slate-200 bg-slate-50">
          <td colSpan={6} className="p-2">
            <PaymentsSection memberId={member.id} role={role} getToken={getToken} />
          </td>
        </tr>
      )}
      {showAttendance && (
        <tr className="border-b border-slate-200 bg-slate-50">
          <td colSpan={6} className="p-2">
            <AttendanceSection memberId={member.id} getToken={getToken} onChanged={onChanged} />
          </td>
        </tr>
      )}
    </>
  );
}

interface MembershipSectionProps {
  memberId: string;
  plans: MembershipPlan[];
  getToken: TokenGetter;
}

type MembershipSectionState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'success'; latest: Membership | null };

// Muestra la membresía más reciente del socio y permite asignar una (si no tiene) o
// renovarla (mismo plan, precio vigente). Cambiar de plan o forzar un precio distinto
// se hace por ahora directamente contra la API (fuera del alcance de esta UI mínima).
function MembershipSection({ memberId, plans, getToken }: MembershipSectionProps) {
  const [state, setState] = useState<MembershipSectionState>({ kind: 'loading' });
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    listMemberships(getToken, { memberId, page: 1, pageSize: 1 })
      .then((data) => {
        if (!cancelled) setState({ kind: 'success', latest: data.items[0] ?? null });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            kind: 'error',
            message: error instanceof ApiError ? error.message : 'No se pudo cargar la membresía',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [memberId, getToken, reloadToken]);

  async function handleAssign() {
    if (!selectedPlanId) return;
    setBusy(true);
    setActionError(null);
    try {
      await createMembership(getToken, { memberId, planId: selectedPlanId });
      setReloadToken((value) => value + 1);
    } catch (error) {
      setActionError(error instanceof ApiError ? error.message : 'No se pudo asignar la membresía');
    } finally {
      setBusy(false);
    }
  }

  async function handleRenew(membershipId: string) {
    setBusy(true);
    setActionError(null);
    try {
      await renewMembership(getToken, membershipId);
      setReloadToken((value) => value + 1);
    } catch (error) {
      setActionError(error instanceof ApiError ? error.message : 'No se pudo renovar la membresía');
    } finally {
      setBusy(false);
    }
  }

  if (state.kind === 'loading') return <p role="status">Cargando membresía…</p>;
  if (state.kind === 'error') {
    return (
      <p role="alert" className="text-red-600">
        {state.message}
      </p>
    );
  }

  const { latest } = state;
  const activePlans = plans.filter((plan) => plan.isActive);

  return (
    <div className="flex flex-col gap-2 text-sm">
      {latest ? (
        <p>
          Plan <strong>{latest.planName}</strong> — {STATUS_LABELS[latest.status]} · vigencia{' '}
          {latest.startDate} a {latest.endDate} · USD {latest.priceAgreed}
        </p>
      ) : (
        <p>Sin membresía asignada todavía.</p>
      )}

      {actionError && (
        <p role="alert" className="text-red-600">
          {actionError}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={selectedPlanId}
          onChange={(event) => setSelectedPlanId(event.target.value)}
          aria-label="Elegir plan de membresía"
          className="rounded border border-slate-300 px-1 py-0.5"
        >
          <option value="">Elegir plan…</option>
          {activePlans.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.name} (USD {plan.price}, {plan.durationDays} días)
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void handleAssign()}
          disabled={busy || !selectedPlanId}
          className="rounded border border-slate-300 px-2 py-0.5 disabled:opacity-40"
        >
          Asignar
        </button>
        {latest && (
          <button
            type="button"
            onClick={() => void handleRenew(latest.id)}
            disabled={busy}
            className="rounded border border-slate-300 px-2 py-0.5 disabled:opacity-40"
          >
            Renovar (mismo plan)
          </button>
        )}
      </div>
    </div>
  );
}

interface PaymentsSectionProps {
  memberId: string;
  role: Role;
  getToken: TokenGetter;
}

type PaymentsSectionState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'success'; payments: Payment[] };

// Últimos pagos del socio + alta de un pago nuevo. Anular (CLAUDE.md sección 5) solo
// se ofrece a Administrador; ocultarlo en el frontend es solo UX, el Worker lo exige igual.
function PaymentsSection({ memberId, role, getToken }: PaymentsSectionProps) {
  const [state, setState] = useState<PaymentsSectionState>({ kind: 'loading' });
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [reference, setReference] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    listPayments(getToken, { memberId, page: 1, pageSize: 5 })
      .then((data) => {
        if (!cancelled) setState({ kind: 'success', payments: data.items });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            kind: 'error',
            message: error instanceof ApiError ? error.message : 'No se pudieron cargar los pagos',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [memberId, getToken, reloadToken]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setActionError('Ingresa un importe válido (mayor a 0)');
      return;
    }

    setBusy(true);
    setActionError(null);
    try {
      await createPayment(getToken, {
        memberId,
        amount: parsedAmount,
        method,
        reference: reference || undefined,
      });
      setAmount('');
      setReference('');
      setReloadToken((value) => value + 1);
    } catch (error) {
      setActionError(error instanceof ApiError ? error.message : 'No se pudo registrar el pago');
    } finally {
      setBusy(false);
    }
  }

  async function handleVoid(paymentId: string) {
    const reason = window.prompt('Motivo de la anulación:');
    if (!reason) return;

    setBusy(true);
    setActionError(null);
    try {
      await voidPayment(getToken, paymentId, reason);
      setReloadToken((value) => value + 1);
    } catch (error) {
      setActionError(error instanceof ApiError ? error.message : 'No se pudo anular el pago');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 text-sm">
      {state.kind === 'loading' && <p role="status">Cargando pagos…</p>}
      {state.kind === 'error' && (
        <p role="alert" className="text-red-600">
          {state.message}
        </p>
      )}
      {state.kind === 'success' && state.payments.length === 0 && (
        <p>Sin pagos registrados todavía.</p>
      )}

      {state.kind === 'success' && state.payments.length > 0 && (
        <ul className="flex flex-col gap-1">
          {state.payments.map((payment) => (
            <li key={payment.id} className="flex flex-wrap items-center gap-2">
              <span>
                USD {payment.amount} · {METHOD_LABELS[payment.method]} ·{' '}
                {payment.paymentDate.slice(0, 10)}
              </span>
              <span className={payment.status === 'voided' ? 'text-red-600' : 'text-green-700'}>
                {payment.status === 'voided' ? `Anulado (${payment.voidReason})` : 'Completado'}
              </span>
              {payment.status === 'completed' && role === 'admin' && (
                <button
                  type="button"
                  onClick={() => void handleVoid(payment.id)}
                  disabled={busy}
                  className="text-red-700 underline disabled:opacity-50"
                >
                  Anular
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {actionError && (
        <p role="alert" className="text-red-600">
          {actionError}
        </p>
      )}

      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="flex flex-wrap items-center gap-2"
      >
        <input
          type="number"
          min="0.01"
          step="0.01"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder="Importe USD"
          aria-label="Importe del pago en USD"
          required
          className="w-28 rounded border border-slate-300 px-1 py-0.5"
        />
        <select
          value={method}
          onChange={(event) => setMethod(event.target.value as PaymentMethod)}
          aria-label="Método de pago"
          className="rounded border border-slate-300 px-1 py-0.5"
        >
          {Object.entries(METHOD_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <input
          value={reference}
          onChange={(event) => setReference(event.target.value)}
          placeholder="Referencia (opcional)"
          aria-label="Referencia del pago"
          className="rounded border border-slate-300 px-1 py-0.5"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded border border-slate-300 px-2 py-0.5 disabled:opacity-40"
        >
          Registrar pago
        </button>
      </form>
    </div>
  );
}

interface AttendanceSectionProps {
  memberId: string;
  getToken: TokenGetter;
  onChanged: () => void;
}

type AttendanceSectionState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'success'; records: AttendanceRecord[] };

// Registro manual de asistencia + últimas visitas del socio. La ventana de duplicados
// (1 hora, PLAN.md sección 4) la aplica el Worker; aquí solo se muestra el error tal cual.
function AttendanceSection({ memberId, getToken, onChanged }: AttendanceSectionProps) {
  const [state, setState] = useState<AttendanceSectionState>({ kind: 'loading' });
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    listAttendance(getToken, { memberId, page: 1, pageSize: 5 })
      .then((data) => {
        if (!cancelled) setState({ kind: 'success', records: data.items });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            kind: 'error',
            message: error instanceof ApiError ? error.message : 'No se pudo cargar la asistencia',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [memberId, getToken, reloadToken]);

  async function handleRegister() {
    setBusy(true);
    setActionError(null);
    try {
      await createAttendance(getToken, memberId);
      setReloadToken((value) => value + 1);
      onChanged(); // refresca el resumen "asistencias hoy" del panel
    } catch (error) {
      setActionError(
        error instanceof ApiError ? error.message : 'No se pudo registrar la asistencia',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 text-sm">
      {state.kind === 'loading' && <p role="status">Cargando asistencia…</p>}
      {state.kind === 'error' && (
        <p role="alert" className="text-red-600">
          {state.message}
        </p>
      )}
      {state.kind === 'success' && state.records.length === 0 && (
        <p>Sin asistencias registradas todavía.</p>
      )}

      {state.kind === 'success' && state.records.length > 0 && (
        <ul className="flex flex-col gap-1">
          {state.records.map((record) => (
            <li key={record.id}>{new Date(record.checkedInAt).toLocaleString('es')}</li>
          ))}
        </ul>
      )}

      {actionError && (
        <p role="alert" className="text-red-600">
          {actionError}
        </p>
      )}

      <button
        type="button"
        onClick={() => void handleRegister()}
        disabled={busy}
        className="self-start rounded border border-slate-300 px-2 py-0.5 disabled:opacity-40"
      >
        Registrar asistencia ahora
      </button>
    </div>
  );
}
