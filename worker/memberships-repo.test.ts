import { describe, expect, it } from 'vitest';
import { computeDisplayStatus } from './memberships-repo';

describe('computeDisplayStatus', () => {
  it('es "pending" cuando la fecha de inicio todavía no llega', () => {
    expect(computeDisplayStatus('active', '2026-09-10', '2026-10-10', '2026-09-05')).toBe(
      'pending',
    );
  });

  it('es "active" el mismo día que empieza', () => {
    expect(computeDisplayStatus('active', '2026-09-10', '2026-10-10', '2026-09-10')).toBe('active');
  });

  it('es "active" el mismo día que vence (el día de vencimiento cuenta como vigente)', () => {
    expect(computeDisplayStatus('active', '2026-09-10', '2026-10-10', '2026-10-10')).toBe('active');
  });

  it('es "expired" un día después de vencer', () => {
    expect(computeDisplayStatus('active', '2026-09-10', '2026-10-10', '2026-10-11')).toBe(
      'expired',
    );
  });

  it('respeta "cancelled"/"suspended" guardados, sin importar las fechas', () => {
    expect(computeDisplayStatus('cancelled', '2026-01-01', '2026-12-31', '2026-06-01')).toBe(
      'cancelled',
    );
    expect(computeDisplayStatus('suspended', '2026-01-01', '2026-12-31', '2026-06-01')).toBe(
      'suspended',
    );
  });
});
