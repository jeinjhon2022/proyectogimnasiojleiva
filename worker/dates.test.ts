import { describe, expect, it } from 'vitest';
import { addDays } from './dates';

describe('addDays', () => {
  it('suma días dentro del mismo mes', () => {
    expect(addDays('2026-01-15', 30)).toBe('2026-02-14');
  });

  it('cruza el fin de año correctamente', () => {
    expect(addDays('2025-12-20', 15)).toBe('2026-01-04');
  });

  it('con 0 días devuelve la misma fecha', () => {
    expect(addDays('2026-03-01', 0)).toBe('2026-03-01');
  });

  it('acepta días negativos (retrocede)', () => {
    expect(addDays('2026-09-02', -29)).toBe('2026-08-04');
  });
});
