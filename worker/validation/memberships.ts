import { z } from 'zod';
import { dateOnly, moneyNonNegative } from './shared';

// 10 años: ninguna membresía real dura más que eso, así se atrapa un typo como
// "3650" en vez de "365" antes de que genere una fecha de vencimiento absurda.
const MAX_DURATION_DAYS = 3650;

export const createMembershipPlanSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es obligatorio').max(200),
  durationDays: z.coerce
    .number()
    .int()
    .min(1, 'La duración debe ser mayor a 0')
    .max(MAX_DURATION_DAYS, `La duración no puede superar ${MAX_DURATION_DAYS} días`),
  price: moneyNonNegative, // USD
});

export type CreateMembershipPlanBody = z.infer<typeof createMembershipPlanSchema>;

export const createMembershipSchema = z.object({
  memberId: z.string().trim().min(1, 'memberId es obligatorio'),
  planId: z.string().trim().min(1, 'planId es obligatorio'),
  startDate: dateOnly.optional(),
  // Precio distinto al del plan vigente: solo Administrador puede usarlo (se valida en la ruta).
  priceOverride: moneyNonNegative.optional(),
});

export type CreateMembershipBody = z.infer<typeof createMembershipSchema>;

export const renewMembershipSchema = z.object({
  // Si no se envía, se reutiliza el plan de la membresía que se renueva.
  planId: z.string().trim().min(1).optional(),
  // Si no se envía, arranca el día siguiente al vencimiento de la membresía anterior.
  startDate: dateOnly.optional(),
  priceOverride: moneyNonNegative.optional(),
});

export type RenewMembershipBody = z.infer<typeof renewMembershipSchema>;

export const listMembershipsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  memberId: z.string().trim().min(1).optional(),
  status: z.enum(['pending', 'active', 'expired', 'suspended', 'cancelled']).optional(),
});

export type ListMembershipsQuery = z.infer<typeof listMembershipsQuerySchema>;
