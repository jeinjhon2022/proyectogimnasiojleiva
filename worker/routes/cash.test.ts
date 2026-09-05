import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../env';
import type { CashSession, CashSessionSummary } from '../cash-repo';

const authenticateMock = vi.fn();
vi.mock('../authenticate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../authenticate')>();
  return { ...actual, authenticate: (...args: unknown[]) => authenticateMock(...args) };
});

const getOpenSessionMock = vi.fn();
const getSessionByIdMock = vi.fn();
const getSessionSummaryMock = vi.fn();
const listSessionsMock = vi.fn();
const openSessionMock = vi.fn();
const closeSessionMock = vi.fn();
const createCashMovementMock = vi.fn();

vi.mock('../cash-repo', () => ({
  getOpenSession: (...args: unknown[]) => getOpenSessionMock(...args),
  getSessionById: (...args: unknown[]) => getSessionByIdMock(...args),
  getSessionSummary: (...args: unknown[]) => getSessionSummaryMock(...args),
  listSessions: (...args: unknown[]) => listSessionsMock(...args),
  openSession: (...args: unknown[]) => openSessionMock(...args),
  closeSession: (...args: unknown[]) => closeSessionMock(...args),
  createCashMovement: (...args: unknown[]) => createCashMovementMock(...args),
}));

const {
  handleGetCurrentSession,
  handleOpenCashSession,
  handleCloseCashSession,
  handleListCashSessions,
  handleGetCashSession,
  handleCreateCashMovement,
} = await import('./cash');

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

const sampleSession: CashSession = {
  id: 'cash_1',
  status: 'open',
  initialBalance: 100,
  openedBy: 'user_admin',
  openedAt: '2026-09-04T12:00:00.000Z',
  closedBy: null,
  closedAt: null,
  countedCash: null,
  notes: null,
  createdAt: '2026-09-04T12:00:00.000Z',
  updatedAt: '2026-09-04T12:00:00.000Z',
};

const sampleSummary: CashSessionSummary = {
  session: sampleSession,
  paymentIncomeByMethod: { cash: 0, transfer: 0, card_in_person: 0, other: 0 },
  totalPaymentIncome: 0,
  productSaleIncomeByMethod: { cash: 0, transfer: 0, card_in_person: 0, other: 0 },
  totalProductSaleIncome: 0,
  manualIncomeByMethod: { cash: 0, transfer: 0, card_in_person: 0, other: 0 },
  totalManualIncome: 0,
  manualExpenseByMethod: { cash: 0, transfer: 0, card_in_person: 0, other: 0 },
  totalManualExpense: 0,
  totalIncomes: 0,
  totalExpenses: 0,
  expectedCash: 100,
  movements: [],
  payments: [],
  productSales: [],
};

beforeEach(() => {
  authenticateMock.mockReset();
  getOpenSessionMock.mockReset();
  getSessionByIdMock.mockReset();
  getSessionSummaryMock.mockReset();
  listSessionsMock.mockReset();
  openSessionMock.mockReset();
  closeSessionMock.mockReset();
  createCashMovementMock.mockReset();
});

describe('GET /api/cash/current', () => {
  it('responde 403 para un entrenador', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: trainer });
    const response = await handleGetCurrentSession(
      new Request('https://x.test/api/cash/current'),
      fakeEnv,
    );
    expect(response.status).toBe(403);
  });

  it('responde 200 con session:null cuando no hay caja abierta', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: admin });
    getOpenSessionMock.mockResolvedValue(null);
    const response = await handleGetCurrentSession(
      new Request('https://x.test/api/cash/current'),
      fakeEnv,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { session: null };
    expect(body.session).toBeNull();
    expect(getSessionSummaryMock).not.toHaveBeenCalled();
  });

  it('responde 200 con el resumen cuando hay una caja abierta', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: receptionist });
    getOpenSessionMock.mockResolvedValue(sampleSession);
    getSessionSummaryMock.mockResolvedValue(sampleSummary);
    const response = await handleGetCurrentSession(
      new Request('https://x.test/api/cash/current'),
      fakeEnv,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { session: CashSession };
    expect(body.session.id).toBe('cash_1');
  });
});

describe('POST /api/cash/sessions', () => {
  function makeRequest(body: unknown) {
    return new Request('https://x.test/api/cash/sessions', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  it('responde 403 para un entrenador', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: trainer });
    const response = await handleOpenCashSession(makeRequest({ initialBalance: 50 }), fakeEnv);
    expect(response.status).toBe(403);
    expect(openSessionMock).not.toHaveBeenCalled();
  });

  it('responde 422 con initialBalance negativo', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: admin });
    const response = await handleOpenCashSession(makeRequest({ initialBalance: -5 }), fakeEnv);
    expect(response.status).toBe(422);
  });

  it('responde 409 si ya hay una caja abierta', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: admin });
    getOpenSessionMock.mockResolvedValue(sampleSession);
    const response = await handleOpenCashSession(makeRequest({ initialBalance: 50 }), fakeEnv);
    expect(response.status).toBe(409);
    expect(openSessionMock).not.toHaveBeenCalled();
  });

  it('responde 201 cuando no hay ninguna caja abierta', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: receptionist });
    getOpenSessionMock.mockResolvedValue(null);
    openSessionMock.mockResolvedValue(sampleSession);
    const response = await handleOpenCashSession(makeRequest({ initialBalance: 100 }), fakeEnv);
    expect(response.status).toBe(201);
    expect(openSessionMock).toHaveBeenCalledWith(fakeEnv.DB, 100, receptionist.id);
  });
});

describe('POST /api/cash/sessions/:id/close', () => {
  function makeRequest(body: unknown) {
    return new Request('https://x.test/api/cash/sessions/cash_1/close', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  it('responde 404 si la caja no existe', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: admin });
    getSessionByIdMock.mockResolvedValue(null);
    const response = await handleCloseCashSession(
      makeRequest({ countedCash: 100 }),
      fakeEnv,
      'cash_1',
    );
    expect(response.status).toBe(404);
  });

  it('responde 409 si ya estaba cerrada', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: admin });
    getSessionByIdMock.mockResolvedValue({ ...sampleSession, status: 'closed' });
    const response = await handleCloseCashSession(
      makeRequest({ countedCash: 100 }),
      fakeEnv,
      'cash_1',
    );
    expect(response.status).toBe(409);
    expect(closeSessionMock).not.toHaveBeenCalled();
  });

  it('responde 200 con el resumen final al cerrar', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: admin });
    getSessionByIdMock.mockResolvedValue(sampleSession);
    const closedSession = { ...sampleSession, status: 'closed' as const, countedCash: 95 };
    closeSessionMock.mockResolvedValue(closedSession);
    getSessionSummaryMock.mockResolvedValue({ ...sampleSummary, session: closedSession });

    const response = await handleCloseCashSession(
      makeRequest({ countedCash: 95, notes: 'Faltaron 5' }),
      fakeEnv,
      'cash_1',
    );

    expect(response.status).toBe(200);
    expect(closeSessionMock).toHaveBeenCalledWith(
      fakeEnv.DB,
      sampleSession,
      { countedCash: 95, notes: 'Faltaron 5' },
      admin.id,
    );
  });
});

describe('GET /api/cash/sessions', () => {
  it('responde 403 para un entrenador', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: trainer });
    const response = await handleListCashSessions(
      new Request('https://x.test/api/cash/sessions'),
      fakeEnv,
    );
    expect(response.status).toBe(403);
  });

  it('responde 200 con el historial', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: admin });
    listSessionsMock.mockResolvedValue({ items: [sampleSession], total: 1, page: 1, pageSize: 20 });
    const response = await handleListCashSessions(
      new Request('https://x.test/api/cash/sessions'),
      fakeEnv,
    );
    expect(response.status).toBe(200);
  });
});

describe('GET /api/cash/sessions/:id', () => {
  it('responde 404 si no existe', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: admin });
    getSessionByIdMock.mockResolvedValue(null);
    const response = await handleGetCashSession(
      new Request('https://x.test/api/cash/sessions/no-existe'),
      fakeEnv,
      'no-existe',
    );
    expect(response.status).toBe(404);
  });

  it('responde 200 con el resumen', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: receptionist });
    getSessionByIdMock.mockResolvedValue(sampleSession);
    getSessionSummaryMock.mockResolvedValue(sampleSummary);
    const response = await handleGetCashSession(
      new Request('https://x.test/api/cash/sessions/cash_1'),
      fakeEnv,
      'cash_1',
    );
    expect(response.status).toBe(200);
  });
});

describe('POST /api/cash/movements', () => {
  function makeRequest(body: unknown) {
    return new Request('https://x.test/api/cash/movements', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  it('responde 403 para un entrenador', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: trainer });
    const response = await handleCreateCashMovement(
      makeRequest({ type: 'manual_income', amount: 10, method: 'cash', description: 'X' }),
      fakeEnv,
    );
    expect(response.status).toBe(403);
  });

  it('responde 409 si no hay caja abierta', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: admin });
    getOpenSessionMock.mockResolvedValue(null);
    const response = await handleCreateCashMovement(
      makeRequest({ type: 'manual_income', amount: 10, method: 'cash', description: 'X' }),
      fakeEnv,
    );
    expect(response.status).toBe(409);
    expect(createCashMovementMock).not.toHaveBeenCalled();
  });

  it('responde 201 y ata el movimiento a la caja abierta', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: receptionist });
    getOpenSessionMock.mockResolvedValue(sampleSession);
    createCashMovementMock.mockResolvedValue({
      id: 'mov_1',
      sessionId: 'cash_1',
      type: 'manual_expense',
      amount: 15,
      method: 'cash',
      description: 'Compra de papel higiénico',
      createdBy: receptionist.id,
      createdAt: '2026-09-04T12:30:00.000Z',
    });

    const response = await handleCreateCashMovement(
      makeRequest({
        type: 'manual_expense',
        amount: 15,
        method: 'cash',
        description: 'Compra de papel higiénico',
      }),
      fakeEnv,
    );

    expect(response.status).toBe(201);
    expect(createCashMovementMock).toHaveBeenCalledWith(
      fakeEnv.DB,
      {
        sessionId: 'cash_1',
        type: 'manual_expense',
        amount: 15,
        method: 'cash',
        description: 'Compra de papel higiénico',
      },
      receptionist.id,
    );
  });
});
