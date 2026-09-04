import { describe, expect, it } from 'vitest';
import { createMemberSchema, listMembersQuerySchema, updateMemberSchema } from './members';

describe('createMemberSchema', () => {
  it('acepta datos válidos y normaliza el correo a minúsculas', () => {
    const result = createMemberSchema.safeParse({
      fullName: '  Ana Pérez  ',
      email: 'Ana@Example.TEST',
      phone: '+57 300 0000000',
      birthDate: '1995-05-01',
      joinDate: '2026-01-15',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fullName).toBe('Ana Pérez');
      expect(result.data.email).toBe('ana@example.test');
    }
  });

  it('rechaza sin nombre', () => {
    const result = createMemberSchema.safeParse({ email: 'a@test.dev' });
    expect(result.success).toBe(false);
  });

  it('rechaza un correo inválido', () => {
    const result = createMemberSchema.safeParse({ fullName: 'X', email: 'no-es-correo' });
    expect(result.success).toBe(false);
  });

  it('rechaza una fecha con formato incorrecto', () => {
    const result = createMemberSchema.safeParse({
      fullName: 'X',
      email: 'a@test.dev',
      birthDate: '01/05/1995',
    });
    expect(result.success).toBe(false);
  });

  it('acepta sin los campos opcionales', () => {
    const result = createMemberSchema.safeParse({ fullName: 'X', email: 'a@test.dev' });
    expect(result.success).toBe(true);
  });

  it('rechaza un teléfono que no es un teléfono (alimenta el enlace de WhatsApp del check-in)', () => {
    const result = createMemberSchema.safeParse({
      fullName: 'X',
      email: 'a@test.dev',
      phone: 'no tengo teléfono',
    });
    expect(result.success).toBe(false);
  });
});

describe('updateMemberSchema', () => {
  it('rechaza un objeto vacío (nada para actualizar)', () => {
    const result = updateMemberSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('acepta un solo campo', () => {
    const result = updateMemberSchema.safeParse({ phone: '+57 300 1111111' });
    expect(result.success).toBe(true);
  });

  it('permite poner a null un campo opcional (borrarlo)', () => {
    const result = updateMemberSchema.safeParse({ phone: null });
    expect(result.success).toBe(true);
  });
});

describe('listMembersQuerySchema', () => {
  it('aplica valores por defecto cuando no se envía nada', () => {
    const result = listMembersQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.pageSize).toBe(20);
    }
  });

  it('convierte los parámetros de query string (texto) a número', () => {
    const result = listMembersQuerySchema.safeParse({ page: '2', pageSize: '10' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(2);
      expect(result.data.pageSize).toBe(10);
    }
  });

  it('rechaza page menor a 1', () => {
    const result = listMembersQuerySchema.safeParse({ page: '0' });
    expect(result.success).toBe(false);
  });

  it('rechaza pageSize mayor al límite (evita exportaciones sin límite)', () => {
    const result = listMembersQuerySchema.safeParse({ pageSize: '500' });
    expect(result.success).toBe(false);
  });
});
