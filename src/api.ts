// Cliente HTTP mínimo hacia la API (worker/). Cada llamada obtiene un token de sesión
// de Clerk fresco vía el `getToken` que pasa el componente (useAuth().getToken()).
export interface ApiErrorBody {
  error: { code: string; message: string };
}

export class ApiError extends Error {
  code: string;
  status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export type TokenGetter = () => Promise<string | null>;
export type Role = 'admin' | 'receptionist' | 'trainer' | 'member';

async function apiFetch<T>(
  getToken: TokenGetter,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = await getToken();

  const response = await fetch(path, {
    ...init,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiError(
      response.status,
      body?.error.code ?? 'UNKNOWN',
      body?.error.message ?? `Error ${response.status}`,
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export interface Member {
  id: string;
  memberCode: string;
  fullName: string;
  // null cuando lo consulta un entrenador que todavía no tiene este socio asignado
  // (Fase 8: puede buscar para elegir a quién asignar una rutina, sin ver contacto).
  email: string | null;
  phone: string | null;
  birthDate: string | null;
  joinDate: string;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MembersPage {
  items: Member[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ListMembersParams {
  page: number;
  pageSize: number;
  q?: string | undefined;
}

export function listMembers(
  getToken: TokenGetter,
  params: ListMembersParams,
): Promise<MembersPage> {
  const search = new URLSearchParams();
  search.set('page', String(params.page));
  search.set('pageSize', String(params.pageSize));
  if (params.q) search.set('q', params.q);
  return apiFetch<MembersPage>(getToken, `/api/members?${search.toString()}`);
}

export interface CreateMemberInput {
  fullName: string;
  email: string;
  phone?: string | undefined;
  birthDate?: string | undefined;
}

export function createMember(getToken: TokenGetter, input: CreateMemberInput): Promise<Member> {
  return apiFetch<Member>(getToken, '/api/members', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export interface UpdateMemberInput {
  fullName?: string;
  email?: string;
  phone?: string | null;
}

export function updateMember(
  getToken: TokenGetter,
  id: string,
  patch: UpdateMemberInput,
): Promise<Member> {
  return apiFetch<Member>(getToken, `/api/members/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function deactivateMember(getToken: TokenGetter, id: string): Promise<Member> {
  return apiFetch<Member>(getToken, `/api/members/${id}/deactivate`, { method: 'POST' });
}

export interface MembershipPlan {
  id: string;
  name: string;
  durationDays: number;
  price: number;
  isActive: boolean;
}

export function listMembershipPlans(getToken: TokenGetter): Promise<{ items: MembershipPlan[] }> {
  return apiFetch(getToken, '/api/membership-plans');
}

export type MembershipStatus = 'pending' | 'active' | 'expired' | 'suspended' | 'cancelled';

export interface Membership {
  id: string;
  memberId: string;
  planId: string;
  planName: string;
  startDate: string;
  endDate: string;
  priceAgreed: number;
  status: MembershipStatus;
  renewedFromId: string | null;
}

export interface ListMembershipsParams {
  memberId: string;
  page?: number;
  pageSize?: number;
}

export function listMemberships(
  getToken: TokenGetter,
  params: ListMembershipsParams,
): Promise<{ items: Membership[]; total: number }> {
  const search = new URLSearchParams();
  search.set('memberId', params.memberId);
  search.set('page', String(params.page ?? 1));
  search.set('pageSize', String(params.pageSize ?? 1));
  return apiFetch(getToken, `/api/memberships?${search.toString()}`);
}

export function createMembership(
  getToken: TokenGetter,
  input: { memberId: string; planId: string },
): Promise<Membership> {
  return apiFetch<Membership>(getToken, '/api/memberships', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function renewMembership(getToken: TokenGetter, membershipId: string): Promise<Membership> {
  return apiFetch<Membership>(getToken, `/api/memberships/${membershipId}/renew`, {
    method: 'POST',
    body: '{}',
  });
}

export type PaymentMethod = 'cash' | 'transfer' | 'card_in_person' | 'other';
export type PaymentStatus = 'completed' | 'voided';

export interface Payment {
  id: string;
  memberId: string;
  amount: number;
  method: PaymentMethod;
  paymentDate: string;
  reference: string | null;
  status: PaymentStatus;
  voidReason: string | null;
}

export interface ListPaymentsParams {
  memberId: string;
  page?: number;
  pageSize?: number;
}

export function listPayments(
  getToken: TokenGetter,
  params: ListPaymentsParams,
): Promise<{ items: Payment[]; total: number }> {
  const search = new URLSearchParams();
  search.set('memberId', params.memberId);
  search.set('page', String(params.page ?? 1));
  search.set('pageSize', String(params.pageSize ?? 5));
  return apiFetch(getToken, `/api/payments?${search.toString()}`);
}

export interface CreatePaymentInput {
  memberId: string;
  amount: number;
  method: PaymentMethod;
  reference?: string | undefined;
}

export function createPayment(getToken: TokenGetter, input: CreatePaymentInput): Promise<Payment> {
  return apiFetch<Payment>(getToken, '/api/payments', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function voidPayment(
  getToken: TokenGetter,
  paymentId: string,
  reason: string,
): Promise<Payment> {
  return apiFetch<Payment>(getToken, `/api/payments/${paymentId}/void`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export interface AttendanceRecord {
  id: string;
  memberId: string;
  checkedInAt: string;
  source: 'manual' | 'qr';
}

export interface ListAttendanceParams {
  memberId: string;
  page?: number;
  pageSize?: number;
}

export function listAttendance(
  getToken: TokenGetter,
  params: ListAttendanceParams,
): Promise<{ items: AttendanceRecord[]; total: number }> {
  const search = new URLSearchParams();
  search.set('memberId', params.memberId);
  search.set('page', String(params.page ?? 1));
  search.set('pageSize', String(params.pageSize ?? 5));
  return apiFetch(getToken, `/api/attendance?${search.toString()}`);
}

export function createAttendance(
  getToken: TokenGetter,
  memberId: string,
): Promise<AttendanceRecord> {
  return apiFetch<AttendanceRecord>(getToken, '/api/attendance', {
    method: 'POST',
    body: JSON.stringify({ memberId }),
  });
}

export interface AttendanceSummary {
  today: number;
  last30Days: number;
}

export function getAttendanceSummary(getToken: TokenGetter): Promise<AttendanceSummary> {
  return apiFetch(getToken, '/api/attendance/summary');
}

export interface MyMembership {
  status: MembershipStatus;
  planName: string;
  startDate: string;
  endDate: string;
}

export function getMyMembership(getToken: TokenGetter): Promise<MyMembership> {
  return apiFetch(getToken, '/api/me/membership');
}

export function getMyAttendance(
  getToken: TokenGetter,
  params: { page?: number; pageSize?: number } = {},
): Promise<{ items: AttendanceRecord[]; total: number }> {
  const search = new URLSearchParams();
  search.set('page', String(params.page ?? 1));
  search.set('pageSize', String(params.pageSize ?? 5));
  return apiFetch(getToken, `/api/me/attendance?${search.toString()}`);
}

export interface Exercise {
  id: string;
  name: string;
  description: string | null;
  muscleGroup: string | null;
  isActive: boolean;
}

export function listExercises(getToken: TokenGetter): Promise<{ items: Exercise[] }> {
  return apiFetch(getToken, '/api/exercises');
}

export function createExercise(getToken: TokenGetter, name: string): Promise<Exercise> {
  return apiFetch<Exercise>(getToken, '/api/exercises', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export type RoutineStatus = 'draft' | 'active' | 'archived';

export interface RoutineSummary {
  id: string;
  name: string;
  description: string | null;
  status: RoutineStatus;
}

export interface RoutineExerciseDetail {
  id: string;
  exerciseId: string;
  exerciseName: string;
  position: number;
  sets: number | null;
  reps: number | null;
  restSeconds: number | null;
  notes: string | null;
}

export interface RoutineDetail extends RoutineSummary {
  exercises: RoutineExerciseDetail[];
}

export function listRoutines(
  getToken: TokenGetter,
  params: { page?: number; pageSize?: number } = {},
): Promise<{ items: RoutineSummary[]; total: number }> {
  const search = new URLSearchParams();
  search.set('page', String(params.page ?? 1));
  search.set('pageSize', String(params.pageSize ?? 20));
  return apiFetch(getToken, `/api/routines?${search.toString()}`);
}

export interface CreateRoutineExerciseInput {
  exerciseId: string;
  sets?: number;
  reps?: number;
  restSeconds?: number;
}

export interface CreateRoutineInput {
  name: string;
  exercises: CreateRoutineExerciseInput[];
}

export function createRoutine(
  getToken: TokenGetter,
  input: CreateRoutineInput,
): Promise<RoutineDetail> {
  return apiFetch<RoutineDetail>(getToken, '/api/routines', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function assignRoutine(
  getToken: TokenGetter,
  routineId: string,
  memberId: string,
): Promise<unknown> {
  return apiFetch(getToken, `/api/routines/${routineId}/assign`, {
    method: 'POST',
    body: JSON.stringify({ memberId }),
  });
}

export interface MyRoutineResponse {
  assignedAt: string;
  routine: RoutineDetail;
}

export function getMyRoutine(getToken: TokenGetter): Promise<MyRoutineResponse> {
  return apiFetch(getToken, '/api/me/routine');
}
