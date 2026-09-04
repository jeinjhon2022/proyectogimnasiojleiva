import { describe, expect, it } from 'vitest';
import { computeMemberListStatus, nextMemberCode } from './members-repo';

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

describe('computeMemberListStatus', () => {
  it('es "none" cuando el socio nunca tuvo una membresía', () => {
    expect(
      computeMemberListStatus(
        { ms_status: null, ms_start_date: null, ms_end_date: null },
        '2026-09-02',
      ),
    ).toBe('none');
  });

  it('es "active" cuando falta para vencer más que la ventana de aviso', () => {
    expect(
      computeMemberListStatus(
        { ms_status: 'active', ms_start_date: '2026-08-01', ms_end_date: '2026-10-01' },
        '2026-09-02',
      ),
    ).toBe('active');
  });

  it('es "expiring" dentro de la ventana de aviso (EXPIRY_NOTICE_WINDOW_DAYS)', () => {
    expect(
      computeMemberListStatus(
        { ms_status: 'active', ms_start_date: '2026-08-01', ms_end_date: '2026-09-04' },
        '2026-09-02',
      ),
    ).toBe('expiring');
  });

  it('es "expired" un día después de vencer', () => {
    expect(
      computeMemberListStatus(
        { ms_status: 'active', ms_start_date: '2026-08-01', ms_end_date: '2026-09-01' },
        '2026-09-02',
      ),
    ).toBe('expired');
  });

  it('respeta "suspended"/"cancelled" guardados, sin importar las fechas', () => {
    expect(
      computeMemberListStatus(
        { ms_status: 'suspended', ms_start_date: '2026-01-01', ms_end_date: '2026-12-31' },
        '2026-09-02',
      ),
    ).toBe('suspended');
  });
});
