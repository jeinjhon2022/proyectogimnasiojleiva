import { z } from 'zod';
import { dateOnly } from './shared';

// Backdatear un check-in olvidado es un caso real (staff registrando la asistencia de
// ayer), pero sin límites un typo de año ("2062" en vez de "2026") queda guardado como
// si nada. Una ventana amplia (1 año atrás, 1 día adelante) no molesta el uso normal.
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const isoDateTime = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Fecha/hora inválida')
  .refine((value) => {
    const timestamp = Date.parse(value);
    const now = Date.now();
    return timestamp >= now - ONE_YEAR_MS && timestamp <= now + ONE_DAY_MS;
  }, 'La fecha debe estar dentro del último año y no puede ser futura');

export const createAttendanceSchema = z.object({
  memberId: z.string().trim().min(1, 'memberId es obligatorio'),
  // Si no se envía, se usa el momento actual (caso normal: registrar "ahora mismo").
  checkedInAt: isoDateTime.optional(),
});

export type CreateAttendanceBody = z.infer<typeof createAttendanceSchema>;

// Check-in de kiosco (busca al socio por cédula/DNI en vez de elegirlo de una lista).
export const kioskCheckInSchema = z.object({
  nationalId: z.string().trim().min(1, 'Ingresa un número de identificación').max(30),
});

export type KioskCheckInBody = z.infer<typeof kioskCheckInSchema>;

export const listAttendanceQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  memberId: z.string().trim().min(1).optional(),
  dateFrom: dateOnly.optional(),
  dateTo: dateOnly.optional(),
});

export type ListAttendanceQuery = z.infer<typeof listAttendanceQuerySchema>;

// Para GET /api/me/attendance: el socio no elige memberId (siempre es el suyo), solo pagina.
export const listMyAttendanceQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListMyAttendanceQuery = z.infer<typeof listMyAttendanceQuerySchema>;
