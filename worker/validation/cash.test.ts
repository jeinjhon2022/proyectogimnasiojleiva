import { describe, expect, it } from 'vitest';
import { closeCashSessionSchema, createCashMovementSchema, openCashSessionSchema } from './cash';

describe('openCashSessionSchema', () => {
  it('acepta un saldo inicial de 0', () => {
    expect(openCashSessionSchema.safeParse({ initialBalance: 0 }).success).toBe(true);
  });

  it('rechaza un saldo inicial negativo', () => {
    expect(openCashSessionSchema.safeParse({ initialBalance: -10 }).success).toBe(false);
  });

  it('exige initialBalance', () => {
    expect(openCashSessionSchema.safeParse({}).success).toBe(false);
  });
});

describe('closeCashSessionSchema', () => {
  it('acepta el arqueo sin notas', () => {
    expect(closeCashSessionSchema.safeParse({ countedCash: 150.5 }).success).toBe(true);
  });

  it('rechaza efectivo contado negativo', () => {
    expect(closeCashSessionSchema.safeParse({ countedCash: -1 }).success).toBe(false);
  });
});

describe('createCashMovementSchema', () => {
  it('acepta un ingreso manual válido', () => {
    const result = createCashMovementSchema.safeParse({
      type: 'manual_income',
      amount: 20,
      method: 'cash',
      description: 'Venta de agua',
    });
    expect(result.success).toBe(true);
  });

  it('rechaza sin descripción (la exige CLAUDE.md sección 6.4: justificación)', () => {
    expect(
      createCashMovementSchema.safeParse({
        type: 'manual_expense',
        amount: 20,
        method: 'cash',
        description: '',
      }).success,
    ).toBe(false);
  });

  it('rechaza un importe cero o negativo', () => {
    expect(
      createCashMovementSchema.safeParse({
        type: 'manual_income',
        amount: 0,
        method: 'cash',
        description: 'X',
      }).success,
    ).toBe(false);
  });

  it('rechaza un tipo fuera de manual_income/manual_expense', () => {
    expect(
      createCashMovementSchema.safeParse({
        type: 'membership_payment',
        amount: 20,
        method: 'cash',
        description: 'X',
      }).success,
    ).toBe(false);
  });
});
