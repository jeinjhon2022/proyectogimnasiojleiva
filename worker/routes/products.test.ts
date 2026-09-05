import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../env';
import type { Product } from '../products-repo';

const authenticateMock = vi.fn();
vi.mock('../authenticate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../authenticate')>();
  return { ...actual, authenticate: (...args: unknown[]) => authenticateMock(...args) };
});

const listProductsMock = vi.fn();
const getProductByIdMock = vi.fn();
const createProductMock = vi.fn();
const updateProductMock = vi.fn();
const adjustStockMock = vi.fn();
const setProductActiveMock = vi.fn();
const sellProductMock = vi.fn();
const listProductSalesMock = vi.fn();
const getProductSalesSummaryMock = vi.fn();

vi.mock('../products-repo', () => ({
  listProducts: (...args: unknown[]) => listProductsMock(...args),
  getProductById: (...args: unknown[]) => getProductByIdMock(...args),
  createProduct: (...args: unknown[]) => createProductMock(...args),
  updateProduct: (...args: unknown[]) => updateProductMock(...args),
  adjustStock: (...args: unknown[]) => adjustStockMock(...args),
  setProductActive: (...args: unknown[]) => setProductActiveMock(...args),
  sellProduct: (...args: unknown[]) => sellProductMock(...args),
  listProductSales: (...args: unknown[]) => listProductSalesMock(...args),
  getProductSalesSummary: (...args: unknown[]) => getProductSalesSummaryMock(...args),
}));

const getOpenSessionMock = vi.fn();
vi.mock('../cash-repo', () => ({
  getOpenSession: (...args: unknown[]) => getOpenSessionMock(...args),
}));

vi.mock('../gym-settings-repo', () => ({
  getGymTimezone: vi.fn().mockResolvedValue('America/Bogota'),
  todayInTimezone: vi.fn().mockReturnValue('2026-09-04'),
}));

const {
  handleListProducts,
  handleGetProductsSummary,
  handleCreateProduct,
  handleUpdateProduct,
  handleAdjustStock,
  handleDeactivateProduct,
  handleActivateProduct,
  handleSellProduct,
  handleListProductSales,
} = await import('./products');

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

const sampleProduct: Product = {
  id: 'product_1',
  name: 'Agua 600ml',
  description: null,
  price: 1.5,
  stock: 20,
  minStockAlert: 5,
  isActive: true,
  createdAt: '2026-09-04T00:00:00.000Z',
  updatedAt: '2026-09-04T00:00:00.000Z',
};

beforeEach(() => {
  authenticateMock.mockReset();
  listProductsMock.mockReset();
  getProductByIdMock.mockReset();
  createProductMock.mockReset();
  updateProductMock.mockReset();
  adjustStockMock.mockReset();
  setProductActiveMock.mockReset();
  sellProductMock.mockReset();
  listProductSalesMock.mockReset();
  getProductSalesSummaryMock.mockReset();
  getOpenSessionMock.mockReset();
  getOpenSessionMock.mockResolvedValue(null);
});

describe('GET /api/products', () => {
  it('responde 403 para un entrenador', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: trainer });
    const response = await handleListProducts(new Request('https://x.test/api/products'), fakeEnv);
    expect(response.status).toBe(403);
  });

  it('responde 200 para recepcionista', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: receptionist });
    listProductsMock.mockResolvedValue({ items: [sampleProduct], total: 1, page: 1, pageSize: 50 });
    const response = await handleListProducts(new Request('https://x.test/api/products'), fakeEnv);
    expect(response.status).toBe(200);
  });
});

describe('GET /api/products/summary', () => {
  it('responde 200 con los KPIs del día', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: admin });
    getProductSalesSummaryMock.mockResolvedValue({
      totalToday: 15,
      quantityToday: 3,
      activeProductCount: 2,
    });
    const response = await handleGetProductsSummary(
      new Request('https://x.test/api/products/summary'),
      fakeEnv,
    );
    expect(response.status).toBe(200);
  });
});

describe('POST /api/products', () => {
  function makeRequest(body: unknown) {
    return new Request('https://x.test/api/products', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  it('responde 403 para un entrenador', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: trainer });
    const response = await handleCreateProduct(makeRequest({ name: 'X', price: 1 }), fakeEnv);
    expect(response.status).toBe(403);
  });

  it('responde 422 con precio inválido', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: admin });
    const response = await handleCreateProduct(makeRequest({ name: 'X', price: -1 }), fakeEnv);
    expect(response.status).toBe(422);
  });

  it('responde 201 con datos válidos', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: receptionist });
    createProductMock.mockResolvedValue(sampleProduct);
    const response = await handleCreateProduct(
      makeRequest({ name: 'Agua 600ml', price: 1.5 }),
      fakeEnv,
    );
    expect(response.status).toBe(201);
  });
});

describe('PATCH /api/products/:id', () => {
  it('responde 404 si no existe', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: admin });
    updateProductMock.mockResolvedValue(null);
    const response = await handleUpdateProduct(
      new Request('https://x.test/api/products/no-existe', {
        method: 'PATCH',
        body: JSON.stringify({ price: 2 }),
      }),
      fakeEnv,
      'no-existe',
    );
    expect(response.status).toBe(404);
  });

  it('responde 200 con datos válidos', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: admin });
    updateProductMock.mockResolvedValue({ ...sampleProduct, price: 2 });
    const response = await handleUpdateProduct(
      new Request('https://x.test/api/products/product_1', {
        method: 'PATCH',
        body: JSON.stringify({ price: 2 }),
      }),
      fakeEnv,
      'product_1',
    );
    expect(response.status).toBe(200);
  });
});

describe('POST /api/products/:id/stock', () => {
  function makeRequest(body: unknown) {
    return new Request('https://x.test/api/products/product_1/stock', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  it('responde 409 si el ajuste dejaría el stock en negativo', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: admin });
    adjustStockMock.mockResolvedValue({ kind: 'would_go_negative' });
    const response = await handleAdjustStock(
      makeRequest({ delta: -100, reason: 'Conteo físico' }),
      fakeEnv,
      'product_1',
    );
    expect(response.status).toBe(409);
  });

  it('responde 200 con un ajuste válido', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: receptionist });
    adjustStockMock.mockResolvedValue({ kind: 'ok', product: { ...sampleProduct, stock: 30 } });
    const response = await handleAdjustStock(
      makeRequest({ delta: 10, reason: 'Reposición' }),
      fakeEnv,
      'product_1',
    );
    expect(response.status).toBe(200);
  });
});

describe('POST /api/products/:id/deactivate y /activate', () => {
  it('deactivate responde 404 si no existe', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: admin });
    setProductActiveMock.mockResolvedValue(null);
    const response = await handleDeactivateProduct(
      new Request('https://x.test/api/products/no-existe/deactivate', { method: 'POST' }),
      fakeEnv,
      'no-existe',
    );
    expect(response.status).toBe(404);
  });

  it('activate responde 200', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: admin });
    setProductActiveMock.mockResolvedValue({ ...sampleProduct, isActive: true });
    const response = await handleActivateProduct(
      new Request('https://x.test/api/products/product_1/activate', { method: 'POST' }),
      fakeEnv,
      'product_1',
    );
    expect(response.status).toBe(200);
  });
});

describe('POST /api/products/:id/sell', () => {
  function makeRequest(body: unknown) {
    return new Request('https://x.test/api/products/product_1/sell', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  it('responde 403 para un entrenador', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: trainer });
    const response = await handleSellProduct(
      makeRequest({ quantity: 1, method: 'cash' }),
      fakeEnv,
      'product_1',
    );
    expect(response.status).toBe(403);
    expect(sellProductMock).not.toHaveBeenCalled();
  });

  it('responde 404 si el producto no existe', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: admin });
    getProductByIdMock.mockResolvedValue(null);
    const response = await handleSellProduct(
      makeRequest({ quantity: 1, method: 'cash' }),
      fakeEnv,
      'no-existe',
    );
    expect(response.status).toBe(404);
  });

  it('responde 409 con stock insuficiente', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: admin });
    getProductByIdMock.mockResolvedValue(sampleProduct);
    sellProductMock.mockResolvedValue({ kind: 'insufficient_stock', available: 2 });
    const response = await handleSellProduct(
      makeRequest({ quantity: 50, method: 'cash' }),
      fakeEnv,
      'product_1',
    );
    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('INSUFFICIENT_STOCK');
  });

  it('responde 201 y ata la venta a la caja abierta cuando hay una', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: receptionist });
    getProductByIdMock.mockResolvedValue(sampleProduct);
    getOpenSessionMock.mockResolvedValue({ id: 'cash_1' });
    sellProductMock.mockResolvedValue({
      kind: 'ok',
      sale: {
        id: 'sale_1',
        productId: 'product_1',
        productName: 'Agua 600ml',
        quantity: 2,
        unitPrice: 1.5,
        total: 3,
        method: 'cash',
        cashSessionId: 'cash_1',
        createdBy: receptionist.id,
        createdAt: '2026-09-04T12:00:00.000Z',
      },
      product: { ...sampleProduct, stock: 18 },
    });

    const response = await handleSellProduct(
      makeRequest({ quantity: 2, method: 'cash' }),
      fakeEnv,
      'product_1',
    );

    expect(response.status).toBe(201);
    expect(sellProductMock).toHaveBeenCalledWith(
      fakeEnv.DB,
      { productId: 'product_1', quantity: 2, method: 'cash', cashSessionId: 'cash_1' },
      receptionist.id,
    );
  });
});

describe('GET /api/products/sales', () => {
  it('responde 403 para un entrenador', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: trainer });
    const response = await handleListProductSales(
      new Request('https://x.test/api/products/sales'),
      fakeEnv,
    );
    expect(response.status).toBe(403);
  });

  it('responde 200 con el historial', async () => {
    authenticateMock.mockResolvedValue({ kind: 'authenticated', user: admin });
    listProductSalesMock.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
    const response = await handleListProductSales(
      new Request('https://x.test/api/products/sales'),
      fakeEnv,
    );
    expect(response.status).toBe(200);
  });
});
