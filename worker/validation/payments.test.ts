import { describe, expect, it } from 'vitest';
import { createPaymentSchema, listPaymentsQuerySchema, voidPaymentSchema } from './payments';

describe('createPaymentSchema', () => {
  it('acepta datos válidos con solo lo obligatorio', () => {
    const result = createPaymentSchema.safeParse({ memberId: 'm1', amount: 40, method: 'cash' });
    expect(result.success).toBe(true);
  });

  it('rechaza un importe cero o negativo', () => {
    expect(
      createPaymentSchema.safeParse({ memberId: 'm1', amount: 0, method: 'cash' }).success,
    ).toBe(false);
    expect(
      createPaymentSchema.safeParse({ memberId: 'm1', amount: -5, method: 'cash' }).success,
    ).toBe(false);
  });

  it('rechaza un método que no está en la lista permitida', () => {
    const result = createPaymentSchema.safeParse({ memberId: 'm1', amount: 40, method: 'bitcoin' });
    expect(result.success).toBe(false);
  });

  it('acepta los 4 métodos definidos', () => {
    for (const method of ['cash', 'transfer', 'card_in_person', 'other']) {
      expect(createPaymentSchema.safeParse({ memberId: 'm1', amount: 10, method }).success).toBe(
        true,
      );
    }
  });
});

describe('voidPaymentSchema', () => {
  it('exige un motivo no vacío', () => {
    expect(voidPaymentSchema.safeParse({ reason: '' }).success).toBe(false);
    expect(voidPaymentSchema.safeParse({}).success).toBe(false);
  });

  it('acepta un motivo válido', () => {
    expect(voidPaymentSchema.safeParse({ reason: 'Pago duplicado' }).success).toBe(true);
  });
});

describe('listPaymentsQuerySchema', () => {
  it('aplica valores por defecto', () => {
    const result = listPaymentsQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.pageSize).toBe(20);
    }
  });

  it('rechaza un status inválido', () => {
    expect(listPaymentsQuerySchema.safeParse({ status: 'reembolsado' }).success).toBe(false);
  });
});
