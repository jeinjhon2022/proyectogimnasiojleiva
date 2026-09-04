import { z } from 'zod';

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato esperado: YYYY-MM-DD');

// Cédula/DNI: formato libre (varía por país), solo se acota longitud y caracteres
// razonables (dígitos, letras, guiones y puntos — cédulas y pasaportes los usan).
const nationalId = z
  .string()
  .trim()
  .min(3, 'La identificación es muy corta')
  .max(30)
  .regex(/^[A-Za-z0-9.-]+$/, 'La identificación solo admite letras, números, puntos y guiones');

export const createMemberSchema = z.object({
  fullName: z.string().trim().min(1, 'El nombre es obligatorio').max(200),
  email: z.string().trim().toLowerCase().email('Correo inválido').max(320),
  phone: z.string().trim().min(1).max(50).optional(),
  birthDate: dateOnly.optional(),
  joinDate: dateOnly.optional(),
  notes: z.string().trim().max(2000).optional(),
  nationalId: nationalId.optional(),
});

export type CreateMemberBody = z.infer<typeof createMemberSchema>;

// Todos los campos opcionales (edición parcial), pero se exige al menos uno presente.
export const updateMemberSchema = z
  .object({
    fullName: z.string().trim().min(1).max(200).optional(),
    email: z.string().trim().toLowerCase().email('Correo inválido').max(320).optional(),
    phone: z.string().trim().min(1).max(50).nullable().optional(),
    birthDate: dateOnly.nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
    nationalId: nationalId.nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Debe incluir al menos un campo para actualizar',
  });

export type UpdateMemberBody = z.infer<typeof updateMemberSchema>;

export const listMembersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().min(1).max(200).optional(),
  membershipStatus: z.enum(['all', 'active', 'expiring', 'expired']).default('all'),
});

export type ListMembersQuery = z.infer<typeof listMembersQuerySchema>;
