import { z } from 'zod';

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato esperado: YYYY-MM-DD');

export const createMembershipPlanSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es obligatorio').max(200),
  durationDays: z.coerce.number().int().min(1, 'La duración debe ser mayor a 0'),
  price: z.coerce.number().min(0, 'El precio no puede ser negativo'), // USD
});

export type CreateMembershipPlanBody = z.infer<typeof createMembershipPlanSchema>;

export const createMembershipSchema = z.object({
  memberId: z.string().trim().min(1, 'memberId es obligatorio'),
  planId: z.string().trim().min(1, 'planId es obligatorio'),
  startDate: dateOnly.optional(),
  // Precio distinto al del plan vigente: solo Administrador puede usarlo (se valida en la ruta).
  priceOverride: z.coerce.number().min(0, 'El precio no puede ser negativo').optional(),
});

export type CreateMembershipBody = z.infer<typeof createMembershipSchema>;

export const renewMembershipSchema = z.object({
  // Si no se envía, se reutiliza el plan de la membresía que se renueva.
  planId: z.string().trim().min(1).optional(),
  // Si no se envía, arranca el día siguiente al vencimiento de la membresía anterior.
  startDate: dateOnly.optional(),
  priceOverride: z.coerce.number().min(0, 'El precio no puede ser negativo').optional(),
});

export type RenewMembershipBody = z.infer<typeof renewMembershipSchema>;

export const listMembershipsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  memberId: z.string().trim().min(1).optional(),
  status: z.enum(['pending', 'active', 'expired', 'suspended', 'cancelled']).optional(),
});

export type ListMembershipsQuery = z.infer<typeof listMembershipsQuerySchema>;
