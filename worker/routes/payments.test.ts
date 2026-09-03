import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../env';
import type { Payment } from '../payments-repo';
import type { MemberDetail } from '../members-repo';

const authenticateMock = vi.fn();
vi.mock('../authenticate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../authenticate')>();
  return { ...actual, authenticate: (...args: unknown[]) => authenticateMock(...args) };
});

const listPaymentsMock = vi.fn();
const getPaymentByIdMock = vi.fn();
const createPaymentMock = vi.fn();
const voidPaymentMock = vi.fn();
const findPaymentByIdempotencyKeyMock = vi.fn();
const getPaymentsSummaryMock = vi.fn();
vi.mock('../payments-repo', () => ({
  listPayments: (...args: unknown[]) => listPaymentsMock(...args),
  getPaymentById: (...args: unknown[]) => getPaymentByIdMock(...args),
  createPayment: (...args: unknown[]) => createPaymentMock(...args),
  voidPayment: (...args: unknown[]) => voidPaymentMock(...args),
  findPaymentByIdempotencyKey: (...args: unknown[]) => findPaymentByIdempotencyKeyMock(...args),
  getPaymentsSummary: (...args: unknown[]) => getPaymentsSummaryMock(...args),
}));

const getMemberByIdMock = vi.fn();
vi.mock('../members-repo', () => ({
  getMemberById: (...args: unknown[]) => getMemberByIdMock(...args),
}));

const {
  handleListPayments,
  handleGetPaymentsSummary,
  handleGetPayment,
  handleCreatePayment,
  handleVoidPayment,
} = await import('./payments');

const fakeEnv = {} as Env;
const admin = {
  id: 'user_admin',
  role: 'admin',
  email: 'a@test.dev',
  fullName: 'Admin',
  isActive: true,
};
const receptionist = {
  id: 'user_recep',
  role: 'receptionist',
  email: 'r@test.dev',
  fullName: 'Recep',
  isActive: true,
};
const trainer = {
  id: 'user_trainer',
  role: 'trainer',
  email: 't@test.dev',
  fullName: 'Trainer',
  isActive: true,
};
const sampleMember = { id: 'member_1' } as MemberDetail;

const samplePayment: Payment = {
  id: 'payment_1',
  memberId: 'member_1',
  memberFullName: 'Socio Uno',
  membershipId: null,
  amount: 40,
  method: 'cash',
  paymentDate: '2026-09-02T10:00:00.000Z',
  reference: null,
  status: 'completed',
  voidReason: null,
  observation: null,
  createdBy: 'user_recep',
  createdAt: '2026-09-02T10:00:00.000Z',
  updatedAt: '2026-09-02T10:00:00.000Z',
};

beforeEach(() => {
  authenticateMock.mockReset();
  listPaymentsMock.mockReset();
  getPaymentByIdMock.mockReset();
  createPaymentMock.mockReset();
  voidPaymentMock.mockReset();
  findPaymentByIdempotencyKeyMock.mockReset();
  getPaymentsSummaryMock.mockReset();
  getMemberByIdMock.mockReset();
});

describe('GET /api/payments', () => {
  it('responde 403 para un entrenador', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: trainer });
    const response = await handleListPayments(new Request('https://x.test/api/payments'), fakeEnv);
    expect(response.status).toBe(403);
  });

  it('responde 200 para recepcionista', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: receptionist });
    listPaymentsMock.mockResolvedValue({ items: [samplePayment], total: 1, page: 1, pageSize: 20 });
    const response = await handleListPayments(new Request('https://x.test/api/payments'), fakeEnv);
    expect(response.status).toBe(200);
  });
});

describe('GET /api/payments/summary', () => {
  it('responde 403 para recepcionista (reporte agregado es solo admin)', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: receptionist });
    const response = await handleGetPaymentsSummary(
      new Request('https://x.test/api/payments/summary'),
      fakeEnv,
    );
    expect(response.status).toBe(403);
    expect(getPaymentsSummaryMock).not.toHaveBeenCalled();
  });

  it('responde 200 para admin', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: admin });
    getPaymentsSummaryMock.mockResolvedValue({
      totalAmount: 40,
      countByMethod: { cash: 1, transfer: 0, card_in_person: 0, other: 0 },
      amountByMethod: { cash: 40, transfer: 0, card_in_person: 0, other: 0 },
      voidedCount: 0,
    });
    const response = await handleGetPaymentsSummary(
      new Request('https://x.test/api/payments/summary'),
      fakeEnv,
    );
    expect(response.status).toBe(200);
  });
});

describe('POST /api/payments', () => {
  function makeRequest(body: unknown) {
    return new Request('https://x.test/api/payments', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  it('responde 403 para un entrenador', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: trainer });
    const response = await handleCreatePayment(
      makeRequest({ memberId: 'member_1', amount: 40, method: 'cash' }),
      fakeEnv,
    );
    expect(response.status).toBe(403);
    expect(createPaymentMock).not.toHaveBeenCalled();
  });

  it('responde 422 con importe inválido', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: admin });
    const response = await handleCreatePayment(
      makeRequest({ memberId: 'member_1', amount: -1, method: 'cash' }),
      fakeEnv,
    );
    expect(response.status).toBe(422);
  });

  it('responde 404 si el socio no existe', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: admin });
    getMemberByIdMock.mockResolvedValue(null);
    const response = await handleCreatePayment(
      makeRequest({ memberId: 'no-existe', amount: 40, method: 'cash' }),
      fakeEnv,
    );
    expect(response.status).toBe(404);
  });

  it('responde 201 con datos válidos', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: receptionist });
    getMemberByIdMock.mockResolvedValue(sampleMember);
    createPaymentMock.mockResolvedValue(samplePayment);

    const response = await handleCreatePayment(
      makeRequest({ memberId: 'member_1', amount: 40, method: 'cash' }),
      fakeEnv,
    );

    expect(response.status).toBe(201);
  });

  it('idempotencia: con una clave ya usada, devuelve el pago existente sin crear otro', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: receptionist });
    findPaymentByIdempotencyKeyMock.mockResolvedValue(samplePayment);

    const response = await handleCreatePayment(
      makeRequest({ memberId: 'member_1', amount: 40, method: 'cash', idempotencyKey: 'clave-1' }),
      fakeEnv,
    );

    expect(response.status).toBe(200);
    expect(createPaymentMock).not.toHaveBeenCalled();
    expect(getMemberByIdMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/payments/:id/void', () => {
  it('responde 403 para recepcionista (solo admin anula)', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: receptionist });
    const request = new Request('https://x.test/api/payments/payment_1/void', {
      method: 'POST',
      body: JSON.stringify({ reason: 'Error' }),
    });
    const response = await handleVoidPayment(request, fakeEnv, 'payment_1');
    expect(response.status).toBe(403);
    expect(voidPaymentMock).not.toHaveBeenCalled();
  });

  it('responde 422 sin motivo', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: admin });
    const request = new Request('https://x.test/api/payments/payment_1/void', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const response = await handleVoidPayment(request, fakeEnv, 'payment_1');
    expect(response.status).toBe(422);
  });

  it('responde 404 si el pago no existe', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: admin });
    voidPaymentMock.mockResolvedValue(null);
    const request = new Request('https://x.test/api/payments/no-existe/void', {
      method: 'POST',
      body: JSON.stringify({ reason: 'Error' }),
    });
    const response = await handleVoidPayment(request, fakeEnv, 'no-existe');
    expect(response.status).toBe(404);
  });

  it('responde 200 para admin con motivo válido', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: admin });
    voidPaymentMock.mockResolvedValue({
      ...samplePayment,
      status: 'voided',
      voidReason: 'Error de registro',
    });
    const request = new Request('https://x.test/api/payments/payment_1/void', {
      method: 'POST',
      body: JSON.stringify({ reason: 'Error de registro' }),
    });
    const response = await handleVoidPayment(request, fakeEnv, 'payment_1');
    expect(response.status).toBe(200);
    const body = (await response.json()) as { status: string };
    expect(body.status).toBe('voided');
  });
});

describe('GET /api/payments/:id', () => {
  it('responde 404 si no existe', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: admin });
    getPaymentByIdMock.mockResolvedValue(null);
    const response = await handleGetPayment(
      new Request('https://x.test/api/payments/no-existe'),
      fakeEnv,
      'no-existe',
    );
    expect(response.status).toBe(404);
  });
});
