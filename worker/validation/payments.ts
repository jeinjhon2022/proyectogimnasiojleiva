import { z } from 'zod';
import { dateOnly, moneyPositive } from './shared';

const isoDateTime = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Fecha/hora inválida');

export const createPaymentSchema = z.object({
  memberId: z.string().trim().min(1, 'memberId es obligatorio'),
  membershipId: z.string().trim().min(1).optional(),
  amount: moneyPositive, // USD
  method: z.enum(['cash', 'transfer', 'card_in_person', 'other']),
  // Si no se envía, se usa el momento actual.
  paymentDate: isoDateTime.optional(),
  reference: z.string().trim().max(200).optional(),
  observation: z.string().trim().max(2000).optional(),
  // Evita duplicados por reintentos de red (CLAUDE.md sección 8).
  idempotencyKey: z.string().trim().min(1).max(200).optional(),
});

export type CreatePaymentBody = z.infer<typeof createPaymentSchema>;

export const voidPaymentSchema = z.object({
  reason: z.string().trim().min(1, 'El motivo de anulación es obligatorio').max(500),
});

export type VoidPaymentBody = z.infer<typeof voidPaymentSchema>;

export const listPaymentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  memberId: z.string().trim().min(1).optional(),
  status: z.enum(['completed', 'voided']).optional(),
  dateFrom: dateOnly.optional(),
  dateTo: dateOnly.optional(),
});

export type ListPaymentsQuery = z.infer<typeof listPaymentsQuerySchema>;

export const paymentsSummaryQuerySchema = z.object({
  dateFrom: dateOnly.optional(),
  dateTo: dateOnly.optional(),
});

export type PaymentsSummaryQuery = z.infer<typeof paymentsSummaryQuerySchema>;
