import { describe, expect, it } from 'vitest';
import { dateOnly, moneyNonNegative, moneyPositive, phone } from './shared';

describe('dateOnly', () => {
  it('acepta una fecha real', () => {
    expect(dateOnly.safeParse('2026-09-04').success).toBe(true);
  });

  it('rechaza un mes o día que no existe, aunque cumpla el formato', () => {
    expect(dateOnly.safeParse('2026-13-01').success).toBe(false); // mes 13
    expect(dateOnly.safeParse('2026-02-30').success).toBe(false); // febrero no tiene 30
    expect(dateOnly.safeParse('2026-04-31').success).toBe(false); // abril no tiene 31
  });

  it('acepta el 29 de febrero en año bisiesto y lo rechaza si no lo es', () => {
    expect(dateOnly.safeParse('2028-02-29').success).toBe(true); // 2028 es bisiesto
    expect(dateOnly.safeParse('2026-02-29').success).toBe(false); // 2026 no lo es
  });

  it('rechaza un formato distinto a YYYY-MM-DD', () => {
    expect(dateOnly.safeParse('04/09/2026').success).toBe(false);
    expect(dateOnly.safeParse('2026-9-4').success).toBe(false);
  });
});

describe('moneyPositive / moneyNonNegative', () => {
  it('moneyPositive rechaza cero y negativos; moneyNonNegative acepta cero', () => {
    expect(moneyPositive.safeParse(0).success).toBe(false);
    expect(moneyPositive.safeParse(-5).success).toBe(false);
    expect(moneyNonNegative.safeParse(0).success).toBe(true);
    expect(moneyNonNegative.safeParse(-5).success).toBe(false);
  });

  it('rechaza un importe irreal (probable error de tipeo)', () => {
    expect(moneyPositive.safeParse(100_001).success).toBe(false);
    expect(moneyPositive.safeParse(100_000).success).toBe(true);
  });

  it('rechaza más de dos decimales', () => {
    expect(moneyPositive.safeParse(19.999).success).toBe(false);
    expect(moneyPositive.safeParse(19.99).success).toBe(true);
    expect(moneyPositive.safeParse(20).success).toBe(true);
  });
});

describe('phone', () => {
  it('acepta formatos comunes con separadores', () => {
    expect(phone.safeParse('+57 300 1234567').success).toBe(true);
    expect(phone.safeParse('(300) 123-4567').success).toBe(true);
  });

  it('rechaza texto que no es un teléfono', () => {
    expect(phone.safeParse('no tengo').success).toBe(false);
  });

  it('rechaza muy pocos o demasiados dígitos', () => {
    expect(phone.safeParse('123').success).toBe(false); // 3 dígitos
    expect(phone.safeParse('1234567890123456').success).toBe(false); // 16 dígitos
    expect(phone.safeParse('1234567').success).toBe(true); // 7 dígitos, el mínimo
  });
});
