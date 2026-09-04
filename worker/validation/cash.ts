import { z } from 'zod';
import { moneyNonNegative, moneyPositive } from './shared';

export const openCashSessionSchema = z.object({
  initialBalance: moneyNonNegative,
});

export type OpenCashSessionBody = z.infer<typeof openCashSessionSchema>;

export const closeCashSessionSchema = z.object({
  countedCash: moneyNonNegative,
  notes: z.string().trim().max(2000).optional(),
});

export type CloseCashSessionBody = z.infer<typeof closeCashSessionSchema>;

export const createCashMovementSchema = z.object({
  type: z.enum(['manual_income', 'manual_expense']),
  amount: moneyPositive,
  method: z.enum(['cash', 'transfer', 'card_in_person', 'other']),
  description: z.string().trim().min(1, 'La descripción es obligatoria').max(500),
});

export type CreateCashMovementBody = z.infer<typeof createCashMovementSchema>;

export const listCashSessionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListCashSessionsQuery = z.infer<typeof listCashSessionsQuerySchema>;
