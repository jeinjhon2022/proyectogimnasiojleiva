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

// Estado de membresía tal como lo devuelve GET /api/members para cada socio (pestañas
// Todos/Activos/Por vencer/Vencidos). 'none' = todavía no tiene ninguna membresía.
export type MemberListStatus =
  'none' | 'pending' | 'active' | 'expiring' | 'expired' | 'suspended' | 'cancelled';

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
  // Cédula/DNI, para el check-in de kiosco. Opcional: puede no estar cargada todavía.
  nationalId: string | null;
  // Solo vienen en la lista (GET /api/members); el detalle (GET /api/members/:id) no
  // los incluye todavía.
  membershipStatus?: MemberListStatus;
  debt?: number;
}

export interface MemberStatusCounts {
  all: number;
  active: number;
  expiring: number;
  expired: number;
  debt: number;
}

export interface MembersPage {
  items: Member[];
  total: number;
  page: number;
  pageSize: number;
  statusCounts: MemberStatusCounts;
}

export type MemberStatusFilter = 'all' | 'active' | 'expiring' | 'expired' | 'debt';

export interface ListMembersParams {
  page: number;
  pageSize: number;
  q?: string | undefined;
  membershipStatus?: MemberStatusFilter | undefined;
}

export function listMembers(
  getToken: TokenGetter,
  params: ListMembersParams,
): Promise<MembersPage> {
  const search = new URLSearchParams();
  search.set('page', String(params.page));
  search.set('pageSize', String(params.pageSize));
  if (params.q) search.set('q', params.q);
  if (params.membershipStatus) search.set('membershipStatus', params.membershipStatus);
  return apiFetch<MembersPage>(getToken, `/api/members?${search.toString()}`);
}

export interface CreateMemberInput {
  fullName: string;
  email: string;
  phone?: string | undefined;
  birthDate?: string | undefined;
  nationalId?: string | undefined;
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
  nationalId?: string | null;
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
  // Derivados de los pagos completados de esta membresía (nunca se guardan aparte).
  amountPaid: number;
  debt: number;
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
  membershipId: string | null;
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
  membershipId?: string | undefined;
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
  memberFullName: string;
  checkedInAt: string;
  source: 'manual' | 'qr';
}

export interface ListAttendanceParams {
  // Sin memberId: lista global (staff), usada por ejemplo en "últimos ingresos" del kiosco.
  memberId?: string | undefined;
  page?: number;
  pageSize?: number;
}

export function listAttendance(
  getToken: TokenGetter,
  params: ListAttendanceParams,
): Promise<{ items: AttendanceRecord[]; total: number }> {
  const search = new URLSearchParams();
  if (params.memberId) search.set('memberId', params.memberId);
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

export interface KioskCheckInResult {
  attendance: AttendanceRecord;
  member: { id: string; fullName: string; memberCode: string; phone: string | null };
  membership: { planName: string; endDate: string; debt: number };
}

// Check-in de kiosco por cédula/DNI (worker/routes/attendance.ts: POST /api/attendance/check-in).
// A diferencia de createAttendance, valida que la membresía esté vigente.
export function kioskCheckIn(
  getToken: TokenGetter,
  nationalId: string,
): Promise<KioskCheckInResult> {
  return apiFetch<KioskCheckInResult>(getToken, '/api/attendance/check-in', {
    method: 'POST',
    body: JSON.stringify({ nationalId }),
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
  debt: number;
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

// ---------- Caja diaria ----------

export type CashSessionStatus = 'open' | 'closed';
export type CashMovementType = 'manual_income' | 'manual_expense';
export type CashMovementMethod = PaymentMethod;

export interface CashSession {
  id: string;
  status: CashSessionStatus;
  initialBalance: number;
  openedBy: string;
  openedAt: string;
  closedBy: string | null;
  closedAt: string | null;
  countedCash: number | null;
  notes: string | null;
}

export interface CashMovement {
  id: string;
  sessionId: string;
  type: CashMovementType;
  amount: number;
  method: CashMovementMethod;
  description: string;
  createdAt: string;
}

export interface CashSessionPayment {
  id: string;
  memberId: string;
  memberFullName: string;
  amount: number;
  method: CashMovementMethod;
  paymentDate: string;
}

export interface CashSessionProductSale {
  id: string;
  productName: string;
  quantity: number;
  total: number;
  method: CashMovementMethod;
  createdAt: string;
}

export interface CashSessionSummary {
  session: CashSession;
  paymentIncomeByMethod: Record<CashMovementMethod, number>;
  totalPaymentIncome: number;
  productSaleIncomeByMethod: Record<CashMovementMethod, number>;
  totalProductSaleIncome: number;
  manualIncomeByMethod: Record<CashMovementMethod, number>;
  totalManualIncome: number;
  manualExpenseByMethod: Record<CashMovementMethod, number>;
  totalManualExpense: number;
  totalIncomes: number;
  totalExpenses: number;
  expectedCash: number;
  movements: CashMovement[];
  payments: CashSessionPayment[];
  productSales: CashSessionProductSale[];
}

export function getCurrentCashSession(
  getToken: TokenGetter,
): Promise<{ session: null } | CashSessionSummary> {
  return apiFetch(getToken, '/api/cash/current');
}

export function openCashSession(
  getToken: TokenGetter,
  initialBalance: number,
): Promise<CashSession> {
  return apiFetch<CashSession>(getToken, '/api/cash/sessions', {
    method: 'POST',
    body: JSON.stringify({ initialBalance }),
  });
}

export function closeCashSession(
  getToken: TokenGetter,
  sessionId: string,
  input: { countedCash: number; notes?: string | undefined },
): Promise<CashSessionSummary> {
  return apiFetch<CashSessionSummary>(getToken, `/api/cash/sessions/${sessionId}/close`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function listCashSessions(
  getToken: TokenGetter,
  params: { page?: number; pageSize?: number },
): Promise<{ items: CashSession[]; total: number; page: number; pageSize: number }> {
  const search = new URLSearchParams();
  search.set('page', String(params.page ?? 1));
  search.set('pageSize', String(params.pageSize ?? 20));
  return apiFetch(getToken, `/api/cash/sessions?${search.toString()}`);
}

export function getCashSession(
  getToken: TokenGetter,
  sessionId: string,
): Promise<CashSessionSummary> {
  return apiFetch(getToken, `/api/cash/sessions/${sessionId}`);
}

export function createCashMovement(
  getToken: TokenGetter,
  input: {
    type: CashMovementType;
    amount: number;
    method: CashMovementMethod;
    description: string;
  },
): Promise<CashMovement> {
  return apiFetch<CashMovement>(getToken, '/api/cash/movements', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

// ---------- Productos y stock ----------

export interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  stock: number;
  minStockAlert: number;
  isActive: boolean;
}

export type ProductStatusFilter = 'all' | 'active' | 'inactive';

export function listProducts(
  getToken: TokenGetter,
  params: { page?: number; pageSize?: number; status?: ProductStatusFilter } = {},
): Promise<{ items: Product[]; total: number; page: number; pageSize: number }> {
  const search = new URLSearchParams();
  search.set('page', String(params.page ?? 1));
  search.set('pageSize', String(params.pageSize ?? 50));
  if (params.status) search.set('status', params.status);
  return apiFetch(getToken, `/api/products?${search.toString()}`);
}

export interface ProductSalesSummary {
  totalToday: number;
  quantityToday: number;
  activeProductCount: number;
}

export function getProductsSummary(getToken: TokenGetter): Promise<ProductSalesSummary> {
  return apiFetch(getToken, '/api/products/summary');
}

export interface CreateProductInput {
  name: string;
  description?: string | undefined;
  price: number;
  stock: number;
  minStockAlert: number;
}

export function createProduct(getToken: TokenGetter, input: CreateProductInput): Promise<Product> {
  return apiFetch<Product>(getToken, '/api/products', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export interface UpdateProductInput {
  name?: string;
  description?: string | null;
  price?: number;
  minStockAlert?: number;
}

export function updateProduct(
  getToken: TokenGetter,
  id: string,
  patch: UpdateProductInput,
): Promise<Product> {
  return apiFetch<Product>(getToken, `/api/products/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function adjustProductStock(
  getToken: TokenGetter,
  id: string,
  input: { delta: number; reason: string },
): Promise<Product> {
  return apiFetch<Product>(getToken, `/api/products/${id}/stock`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function deactivateProduct(getToken: TokenGetter, id: string): Promise<Product> {
  return apiFetch<Product>(getToken, `/api/products/${id}/deactivate`, { method: 'POST' });
}

export function activateProduct(getToken: TokenGetter, id: string): Promise<Product> {
  return apiFetch<Product>(getToken, `/api/products/${id}/activate`, { method: 'POST' });
}

export interface ProductSale {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
  method: CashMovementMethod;
  createdAt: string;
}

export interface SellProductResult {
  sale: ProductSale;
  product: Product;
}

export function sellProduct(
  getToken: TokenGetter,
  productId: string,
  input: { quantity: number; method: CashMovementMethod },
): Promise<SellProductResult> {
  return apiFetch<SellProductResult>(getToken, `/api/products/${productId}/sell`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function listProductSales(
  getToken: TokenGetter,
  params: { page?: number; pageSize?: number } = {},
): Promise<{ items: ProductSale[]; total: number; page: number; pageSize: number }> {
  const search = new URLSearchParams();
  search.set('page', String(params.page ?? 1));
  search.set('pageSize', String(params.pageSize ?? 20));
  return apiFetch(getToken, `/api/products/sales?${search.toString()}`);
}
