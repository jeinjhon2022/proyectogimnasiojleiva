import { describe, expect, it } from 'vitest';
import {
  adjustStockSchema,
  createProductSchema,
  listProductsQuerySchema,
  sellProductSchema,
  updateProductSchema,
} from './products';

describe('createProductSchema', () => {
  it('acepta datos válidos y usa 0 por defecto para stock/minStockAlert', () => {
    const result = createProductSchema.safeParse({ name: 'Agua 600ml', price: 1.5 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.stock).toBe(0);
      expect(result.data.minStockAlert).toBe(0);
    }
  });

  it('rechaza sin nombre', () => {
    expect(createProductSchema.safeParse({ price: 1.5 }).success).toBe(false);
  });

  it('rechaza precio negativo', () => {
    expect(createProductSchema.safeParse({ name: 'X', price: -1 }).success).toBe(false);
  });

  it('rechaza stock negativo', () => {
    expect(createProductSchema.safeParse({ name: 'X', price: 1, stock: -5 }).success).toBe(false);
  });
});

describe('updateProductSchema', () => {
  it('rechaza un objeto vacío', () => {
    expect(updateProductSchema.safeParse({}).success).toBe(false);
  });

  it('acepta un solo campo', () => {
    expect(updateProductSchema.safeParse({ price: 2 }).success).toBe(true);
  });
});

describe('adjustStockSchema', () => {
  it('acepta un delta positivo (reposición) o negativo (merma) con motivo', () => {
    expect(adjustStockSchema.safeParse({ delta: 10, reason: 'Reposición' }).success).toBe(true);
    expect(adjustStockSchema.safeParse({ delta: -2, reason: 'Producto vencido' }).success).toBe(
      true,
    );
  });

  it('rechaza delta cero', () => {
    expect(adjustStockSchema.safeParse({ delta: 0, reason: 'X' }).success).toBe(false);
  });

  it('rechaza sin motivo', () => {
    expect(adjustStockSchema.safeParse({ delta: 5, reason: '' }).success).toBe(false);
  });
});

describe('sellProductSchema', () => {
  it('acepta una venta válida', () => {
    expect(sellProductSchema.safeParse({ quantity: 2, method: 'cash' }).success).toBe(true);
  });

  it('rechaza cantidad cero o negativa', () => {
    expect(sellProductSchema.safeParse({ quantity: 0, method: 'cash' }).success).toBe(false);
    expect(sellProductSchema.safeParse({ quantity: -1, method: 'cash' }).success).toBe(false);
  });

  it('rechaza cantidad no entera', () => {
    expect(sellProductSchema.safeParse({ quantity: 1.5, method: 'cash' }).success).toBe(false);
  });
});

describe('listProductsQuerySchema', () => {
  it('usa status=active por defecto (catálogo solo muestra vendibles)', () => {
    const result = listProductsQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.status).toBe('active');
  });

  it('rechaza un status fuera de la lista', () => {
    expect(listProductsQuerySchema.safeParse({ status: 'discontinued' }).success).toBe(false);
  });
});
