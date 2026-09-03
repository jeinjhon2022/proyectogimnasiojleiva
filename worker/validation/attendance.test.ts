import { describe, expect, it } from 'vitest';
import { createAttendanceSchema, listAttendanceQuerySchema } from './attendance';

describe('createAttendanceSchema', () => {
  it('acepta solo memberId (checkedInAt es opcional, usa "ahora")', () => {
    expect(createAttendanceSchema.safeParse({ memberId: 'm1' }).success).toBe(true);
  });

  it('rechaza sin memberId', () => {
    expect(createAttendanceSchema.safeParse({}).success).toBe(false);
  });

  it('rechaza un checkedInAt que no es una fecha válida', () => {
    expect(
      createAttendanceSchema.safeParse({ memberId: 'm1', checkedInAt: 'no-es-fecha' }).success,
    ).toBe(false);
  });

  it('acepta un checkedInAt ISO válido', () => {
    expect(
      createAttendanceSchema.safeParse({ memberId: 'm1', checkedInAt: '2026-09-02T10:00:00.000Z' })
        .success,
    ).toBe(true);
  });
});

describe('listAttendanceQuerySchema', () => {
  it('aplica valores por defecto', () => {
    const result = listAttendanceQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.pageSize).toBe(20);
    }
  });

  it('rechaza pageSize por encima del límite', () => {
    expect(listAttendanceQuerySchema.safeParse({ pageSize: '500' }).success).toBe(false);
  });
});
