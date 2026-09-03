import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  Activity,
  Banknote,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Loader2,
  Pencil,
  Plus,
  Search,
  UserX,
} from 'lucide-react';
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
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Dialog } from '../components/ui/dialog';
import { Input, Label, Select } from '../components/ui/input';
import { Badge, type BadgeTone } from '../components/ui/badge';
import { cn } from '../lib/utils';

const PAGE_SIZE = 10;

// Cifra del marcador: null mientras no hay dato (todavía no cargó), en vez de
// mostrar un cero engañoso.
function ScoreboardStat({
  label,
  value,
  className,
}: {
  label: string;
  value: number | null;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-0.5 px-4 py-3', className)}>
      <span className="font-mono text-2xl font-semibold tabular-nums text-chalk">
        {value === null ? '—' : value}
      </span>
      <span className="font-mono text-[10px] uppercase tracking-wider text-chalk-muted">
        {label}
      </span>
    </div>
  );
}

const METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  card_in_person: 'Tarjeta (presencial)',
  other: 'Otro',
};

const MEMBERSHIP_STATUS_TONE: Record<MembershipStatus, BadgeTone> = {
  pending: 'warning',
  active: 'success',
  expired: 'danger',
  suspended: 'warning',
  cancelled: 'default',
};

const MEMBERSHIP_STATUS_LABEL: Record<MembershipStatus, string> = {
  pending: 'Pendiente',
  active: 'Activa',
  expired: 'Vencida',
  suspended: 'Suspendida',
  cancelled: 'Cancelada',
};

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
  const [showCreateDialog, setShowCreateDialog] = useState(false);
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
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <div>
          <CardTitle>Socios</CardTitle>
          <CardDescription>Gestión de socios del gimnasio</CardDescription>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4" />
          Nuevo socio
        </Button>
      </CardHeader>

      {/* Marcador estilo tablero de sala de pesas: cifras reales del día en mono,
          en vez del párrafo de resumen genérico. */}
      <div className="grid grid-cols-2 divide-x divide-line border-b border-line sm:grid-cols-3">
        <ScoreboardStat label="Socios" value={state.kind === 'success' ? state.data.total : null} />
        <ScoreboardStat label="Asistencias hoy" value={attendanceSummary?.today ?? null} />
        <ScoreboardStat
          label="Últimos 30 días"
          value={attendanceSummary?.last30Days ?? null}
          className="hidden sm:block"
        />
      </div>

      <CardContent className="flex flex-col gap-4">
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-chalk-faint" />
            <Input
              type="text"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Buscar por nombre, correo, teléfono o código"
              aria-label="Buscar socios"
              className="pl-9"
            />
          </div>
          <Button type="submit" variant="outline">
            Buscar
          </Button>
        </form>

        {state.kind === 'loading' && (
          <p role="status" className="flex items-center gap-2 py-6 text-sm text-chalk-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando socios…
          </p>
        )}

        {state.kind === 'error' && (
          <p role="alert" className="py-6 text-sm text-danger">
            {state.message}
          </p>
        )}

        {state.kind === 'success' && state.data.items.length === 0 && (
          <p className="py-6 text-center text-sm text-chalk-muted">
            No hay socios que coincidan con la búsqueda.
          </p>
        )}

        {state.kind === 'success' && state.data.items.length > 0 && (
          <>
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-raised font-mono text-[10px] uppercase tracking-wider text-chalk-muted">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Código</th>
                    <th className="px-4 py-2.5 font-medium">Nombre</th>
                    <th className="px-4 py-2.5 font-medium">Correo</th>
                    <th className="px-4 py-2.5 font-medium">Teléfono</th>
                    <th className="px-4 py-2.5 font-medium">Estado</th>
                    <th className="px-4 py-2.5 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
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

            <div className="flex items-center justify-between text-sm text-chalk-muted">
              <span>
                Página {state.data.page} de{' '}
                {Math.max(1, Math.ceil(state.data.total / state.data.pageSize))} ({state.data.total}{' '}
                socios)
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                >
                  <ChevronLeft className="h-4 w-4" /> Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page * PAGE_SIZE >= state.data.total}
                  onClick={() => setPage((value) => value + 1)}
                >
                  Siguiente <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>

      <Dialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        title="Nuevo socio"
      >
        <CreateMemberForm
          getToken={getToken}
          onCreated={() => {
            setShowCreateDialog(false);
            setPage(1);
            reload();
          }}
        />
      </Dialog>
    </Card>
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
    <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-3">
      <div>
        <Label htmlFor="new-member-name">Nombre completo</Label>
        <Input
          id="new-member-name"
          required
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          className="mt-1"
        />
      </div>
      <div>
        <Label htmlFor="new-member-email">Correo</Label>
        <Input
          id="new-member-email"
          required
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="mt-1"
        />
      </div>
      <div>
        <Label htmlFor="new-member-phone">Teléfono (opcional)</Label>
        <Input
          id="new-member-phone"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          className="mt-1"
        />
      </div>

      {submitState.kind === 'error' && (
        <p role="alert" className="text-sm text-danger">
          {submitState.message}
        </p>
      )}

      <div className="mt-1 flex justify-end">
        <Button type="submit" disabled={submitState.kind === 'submitting'}>
          {submitState.kind === 'submitting' && <Loader2 className="h-4 w-4 animate-spin" />}
          Guardar socio
        </Button>
      </div>
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

type Section = null | 'membership' | 'payments' | 'attendance';

function MemberRow({ member, getToken, plans, role, onChanged }: MemberRowProps) {
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [openSection, setOpenSection] = useState<Section>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  function toggleSection(section: Section) {
    setOpenSection((current) => (current === section ? null : section));
  }

  return (
    <>
      <tr className="hover:bg-surface-raised">
        <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-chalk-muted">
          {member.memberCode}
        </td>
        <td className="px-4 py-2.5 font-medium text-chalk">{member.fullName}</td>
        <td className="px-4 py-2.5 text-chalk-muted">{member.email ?? '—'}</td>
        <td className="px-4 py-2.5 text-chalk-muted">{member.phone ?? '—'}</td>
        <td className="px-4 py-2.5">
          <Badge tone={member.isActive ? 'success' : 'default'}>
            {member.isActive ? 'Activo' : 'Inactivo'}
          </Badge>
        </td>
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              title="Editar"
              aria-label="Editar"
              onClick={() => setShowEditDialog(true)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant={openSection === 'membership' ? 'secondary' : 'ghost'}
              size="icon"
              title="Membresía"
              aria-label="Membresía"
              aria-pressed={openSection === 'membership'}
              onClick={() => toggleSection('membership')}
            >
              <CreditCard className="h-4 w-4" />
            </Button>
            <Button
              variant={openSection === 'payments' ? 'secondary' : 'ghost'}
              size="icon"
              title="Pagos"
              aria-label="Pagos"
              aria-pressed={openSection === 'payments'}
              onClick={() => toggleSection('payments')}
            >
              <Banknote className="h-4 w-4" />
            </Button>
            <Button
              variant={openSection === 'attendance' ? 'secondary' : 'ghost'}
              size="icon"
              title="Asistencia"
              aria-label="Asistencia"
              aria-pressed={openSection === 'attendance'}
              onClick={() => toggleSection('attendance')}
            >
              <Activity className="h-4 w-4" />
            </Button>
            {member.isActive && role === 'admin' && (
              <Button
                variant="ghost"
                size="icon"
                title="Desactivar"
                aria-label="Desactivar"
                disabled={busy}
                onClick={() => void handleDeactivate()}
                className="text-danger hover:bg-danger-soft"
              >
                <UserX className="h-4 w-4" />
              </Button>
            )}
          </div>
          {error && (
            <p role="alert" className="mt-1 text-xs text-danger">
              {error}
            </p>
          )}
        </td>
      </tr>

      {openSection && (
        <tr className="bg-surface-raised">
          <td colSpan={6} className="p-3">
            <div className="rounded-lg border border-line bg-ink p-4">
              {openSection === 'membership' && (
                <MembershipSection memberId={member.id} plans={plans} getToken={getToken} />
              )}
              {openSection === 'payments' && (
                <PaymentsSection memberId={member.id} role={role} getToken={getToken} />
              )}
              {openSection === 'attendance' && (
                <AttendanceSection memberId={member.id} getToken={getToken} onChanged={onChanged} />
              )}
            </div>
          </td>
        </tr>
      )}

      <Dialog
        open={showEditDialog}
        onClose={() => setShowEditDialog(false)}
        title={`Editar a ${member.fullName}`}
      >
        <EditMemberForm
          member={member}
          getToken={getToken}
          onSaved={() => {
            setShowEditDialog(false);
            onChanged();
          }}
        />
      </Dialog>
    </>
  );
}

function EditMemberForm({
  member,
  getToken,
  onSaved,
}: {
  member: Member;
  getToken: TokenGetter;
  onSaved: () => void;
}) {
  const [fullName, setFullName] = useState(member.fullName);
  const [email, setEmail] = useState(member.email ?? '');
  const [phone, setPhone] = useState(member.phone ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await updateMember(getToken, member.id, { fullName, email, phone: phone || null });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar el cambio');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-3">
      <div>
        <Label htmlFor="edit-member-name">Nombre completo</Label>
        <Input
          id="edit-member-name"
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          className="mt-1"
        />
      </div>
      <div>
        <Label htmlFor="edit-member-email">Correo</Label>
        <Input
          id="edit-member-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="mt-1"
        />
      </div>
      <div>
        <Label htmlFor="edit-member-phone">Teléfono</Label>
        <Input
          id="edit-member-phone"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          className="mt-1"
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-1 flex justify-end">
        <Button type="submit" disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Guardar cambios
        </Button>
      </div>
    </form>
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

  if (state.kind === 'loading') {
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-chalk-muted">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando membresía…
      </p>
    );
  }
  if (state.kind === 'error') {
    return (
      <p role="alert" className="text-sm text-danger">
        {state.message}
      </p>
    );
  }

  const { latest } = state;
  const activePlans = plans.filter((plan) => plan.isActive);

  return (
    <div className="flex flex-col gap-3 text-sm">
      {latest ? (
        <div className="flex flex-wrap items-center gap-2">
          <span>
            Plan <strong>{latest.planName}</strong> · vigencia {latest.startDate} a {latest.endDate}{' '}
            · USD {latest.priceAgreed}
          </span>
          <Badge tone={MEMBERSHIP_STATUS_TONE[latest.status]}>
            {MEMBERSHIP_STATUS_LABEL[latest.status]}
          </Badge>
        </div>
      ) : (
        <p className="text-chalk-muted">Sin membresía asignada todavía.</p>
      )}

      {actionError && (
        <p role="alert" className="text-danger">
          {actionError}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={selectedPlanId}
          onChange={(event) => setSelectedPlanId(event.target.value)}
          aria-label="Elegir plan de membresía"
          className="w-auto"
        >
          <option value="">Elegir plan…</option>
          {activePlans.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.name} (USD {plan.price}, {plan.durationDays} días)
            </option>
          ))}
        </Select>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !selectedPlanId}
          onClick={() => void handleAssign()}
        >
          Asignar
        </Button>
        {latest && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void handleRenew(latest.id)}
          >
            Renovar (mismo plan)
          </Button>
        )}
      </div>
    </div>
  );
}

function PaymentsSection({
  memberId,
  role,
  getToken,
}: {
  memberId: string;
  role: Role;
  getToken: TokenGetter;
}) {
  const [state, setState] = useState<
    | { kind: 'loading' }
    | { kind: 'error'; message: string }
    | { kind: 'success'; payments: Payment[] }
  >({ kind: 'loading' });
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
    <div className="flex flex-col gap-3 text-sm">
      {state.kind === 'loading' && (
        <p role="status" className="flex items-center gap-2 text-chalk-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando pagos…
        </p>
      )}
      {state.kind === 'error' && (
        <p role="alert" className="text-danger">
          {state.message}
        </p>
      )}
      {state.kind === 'success' && state.payments.length === 0 && (
        <p className="text-chalk-muted">Sin pagos registrados todavía.</p>
      )}

      {state.kind === 'success' && state.payments.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {state.payments.map((payment) => (
            <li key={payment.id} className="flex flex-wrap items-center gap-2">
              <span>
                USD {payment.amount} · {METHOD_LABELS[payment.method]} ·{' '}
                {payment.paymentDate.slice(0, 10)}
              </span>
              <Badge tone={payment.status === 'voided' ? 'danger' : 'success'}>
                {payment.status === 'voided' ? `Anulado (${payment.voidReason})` : 'Completado'}
              </Badge>
              {payment.status === 'completed' && role === 'admin' && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto p-0 text-danger underline hover:bg-transparent hover:text-danger"
                  disabled={busy}
                  onClick={() => void handleVoid(payment.id)}
                >
                  Anular
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {actionError && (
        <p role="alert" className="text-danger">
          {actionError}
        </p>
      )}

      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="flex flex-wrap items-center gap-2"
      >
        <Input
          type="number"
          min="0.01"
          step="0.01"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder="Importe USD"
          aria-label="Importe del pago en USD"
          required
          className="w-28"
        />
        <Select
          value={method}
          onChange={(event) => setMethod(event.target.value as PaymentMethod)}
          aria-label="Método de pago"
          className="w-auto"
        >
          {Object.entries(METHOD_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <Input
          value={reference}
          onChange={(event) => setReference(event.target.value)}
          placeholder="Referencia (opcional)"
          aria-label="Referencia del pago"
          className="w-40"
        />
        <Button type="submit" size="sm" variant="outline" disabled={busy}>
          Registrar pago
        </Button>
      </form>
    </div>
  );
}

function AttendanceSection({
  memberId,
  getToken,
  onChanged,
}: {
  memberId: string;
  getToken: TokenGetter;
  onChanged: () => void;
}) {
  const [state, setState] = useState<
    | { kind: 'loading' }
    | { kind: 'error'; message: string }
    | { kind: 'success'; records: AttendanceRecord[] }
  >({ kind: 'loading' });
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
    <div className="flex flex-col gap-3 text-sm">
      {state.kind === 'loading' && (
        <p role="status" className="flex items-center gap-2 text-chalk-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando asistencia…
        </p>
      )}
      {state.kind === 'error' && (
        <p role="alert" className="text-danger">
          {state.message}
        </p>
      )}
      {state.kind === 'success' && state.records.length === 0 && (
        <p className="text-chalk-muted">Sin asistencias registradas todavía.</p>
      )}

      {state.kind === 'success' && state.records.length > 0 && (
        <ul className="flex flex-col gap-1">
          {state.records.map((record) => (
            <li key={record.id}>{new Date(record.checkedInAt).toLocaleString('es')}</li>
          ))}
        </ul>
      )}

      {actionError && (
        <p role="alert" className="text-danger">
          {actionError}
        </p>
      )}

      <Button
        size="sm"
        variant="outline"
        className="self-start"
        disabled={busy}
        onClick={() => void handleRegister()}
      >
        Registrar asistencia ahora
      </Button>
    </div>
  );
}
