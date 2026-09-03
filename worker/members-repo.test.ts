import { describe, expect, it } from 'vitest';
import { nextMemberCode } from './members-repo';

describe('nextMemberCode', () => {
  it('genera SOC-0001 cuando no hay ningún código previo', () => {
    expect(nextMemberCode(null)).toBe('SOC-0001');
  });

  it('incrementa el número manteniendo el relleno de ceros', () => {
    expect(nextMemberCode('SOC-0001')).toBe('SOC-0002');
    expect(nextMemberCode('SOC-0009')).toBe('SOC-0010');
    expect(nextMemberCode('SOC-0099')).toBe('SOC-0100');
  });

  it('no se rompe con un código mal formado (trata el número como 0)', () => {
    expect(nextMemberCode('SOC-abc')).toBe('SOC-0001');
  });
});
