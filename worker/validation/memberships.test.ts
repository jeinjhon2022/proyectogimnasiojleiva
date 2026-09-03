import { describe, expect, it } from 'vitest';
import {
  createMembershipPlanSchema,
  createMembershipSchema,
  listMembershipsQuerySchema,
  renewMembershipSchema,
} from './memberships';

describe('createMembershipPlanSchema', () => {
  it('acepta datos válidos', () => {
    const result = createMembershipPlanSchema.safeParse({
      name: 'Mensual',
      durationDays: 30,
      price: 40,
    });
    expect(result.success).toBe(true);
  });

  it('rechaza duración cero o negativa', () => {
    expect(
      createMembershipPlanSchema.safeParse({ name: 'X', durationDays: 0, price: 10 }).success,
    ).toBe(false);
    expect(
      createMembershipPlanSchema.safeParse({ name: 'X', durationDays: -5, price: 10 }).success,
    ).toBe(false);
  });

  it('rechaza precio negativo', () => {
    expect(
      createMembershipPlanSchema.safeParse({ name: 'X', durationDays: 30, price: -1 }).success,
    ).toBe(false);
  });
});

describe('createMembershipSchema', () => {
  it('acepta solo memberId y planId (el resto es opcional)', () => {
    const result = createMembershipSchema.safeParse({ memberId: 'm1', planId: 'p1' });
    expect(result.success).toBe(true);
  });

  it('rechaza sin memberId', () => {
    expect(createMembershipSchema.safeParse({ planId: 'p1' }).success).toBe(false);
  });

  it('rechaza una fecha de inicio mal formada', () => {
    expect(
      createMembershipSchema.safeParse({ memberId: 'm1', planId: 'p1', startDate: '10-01-2026' })
        .success,
    ).toBe(false);
  });
});

describe('renewMembershipSchema', () => {
  it('acepta un objeto vacío (todo tiene valor por defecto)', () => {
    expect(renewMembershipSchema.safeParse({}).success).toBe(true);
  });

  it('acepta priceOverride', () => {
    const result = renewMembershipSchema.safeParse({ priceOverride: 35 });
    expect(result.success).toBe(true);
  });

  it('rechaza priceOverride negativo', () => {
    expect(renewMembershipSchema.safeParse({ priceOverride: -1 }).success).toBe(false);
  });
});

describe('listMembershipsQuerySchema', () => {
  it('aplica valores por defecto', () => {
    const result = listMembershipsQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.pageSize).toBe(20);
    }
  });

  it('rechaza un status que no es uno de los permitidos', () => {
    expect(listMembershipsQuerySchema.safeParse({ status: 'vencidisima' }).success).toBe(false);
  });

  it('acepta cada status válido', () => {
    for (const status of ['pending', 'active', 'expired', 'suspended', 'cancelled']) {
      expect(listMembershipsQuerySchema.safeParse({ status }).success).toBe(true);
    }
  });
});
