import { z } from 'zod';
import { moneyNonNegative } from './shared';

// Techo generoso: nunca debería chocar con el inventario real de un gimnasio, pero
// atrapa un cero de más al cargar stock inicial o al vender.
const MAX_QUANTITY = 100_000;

export const createProductSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es obligatorio').max(200),
  description: z.string().trim().max(2000).optional(),
  price: moneyNonNegative,
  stock: z.coerce.number().int().min(0).max(MAX_QUANTITY).default(0),
  minStockAlert: z.coerce.number().int().min(0).max(MAX_QUANTITY).default(0),
});

export type CreateProductBody = z.infer<typeof createProductSchema>;

export const updateProductSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    price: moneyNonNegative.optional(),
    minStockAlert: z.coerce.number().int().min(0).max(MAX_QUANTITY).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Debe incluir al menos un campo para actualizar',
  });

export type UpdateProductBody = z.infer<typeof updateProductSchema>;

export const adjustStockSchema = z.object({
  // Positivo para reposición, negativo para merma/corrección a la baja.
  delta: z.coerce
    .number()
    .int()
    .refine((value) => value !== 0, 'El ajuste no puede ser cero')
    .refine(
      (value) => Math.abs(value) <= MAX_QUANTITY,
      `El ajuste no puede superar ${MAX_QUANTITY} unidades`,
    ),
  reason: z.string().trim().min(1, 'El motivo es obligatorio').max(500),
});

export type AdjustStockBody = z.infer<typeof adjustStockSchema>;

export const sellProductSchema = z.object({
  quantity: z.coerce.number().int().positive('La cantidad debe ser mayor a 0').max(MAX_QUANTITY),
  method: z.enum(['cash', 'transfer', 'card_in_person', 'other']),
});

export type SellProductBody = z.infer<typeof sellProductSchema>;

export const listProductsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  status: z.enum(['all', 'active', 'inactive']).default('active'),
});

export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;

const dateOnlyForSales = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato esperado: YYYY-MM-DD');

export const listProductSalesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  dateFrom: dateOnlyForSales.optional(),
  dateTo: dateOnlyForSales.optional(),
});

export type ListProductSalesQuery = z.infer<typeof listProductSalesQuerySchema>;
