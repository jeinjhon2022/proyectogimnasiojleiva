import { z } from 'zod';

// Controles de ingreso de datos compartidos entre módulos (CLAUDE.md sección 8:
// "Validar parámetros, query strings y cuerpos con Zod" + sección 10: normalizar y
// acotar). Antes cada archivo de validación definía su propia versión suelta de
// fecha/dinero; centralizarlos evita que un módulo tenga un control más flojo que otro
// por descuido, y deja un solo lugar para ajustar límites.

// No basta con el formato: "2026-13-45" cumple \d{4}-\d{2}-\d{2} pero no es una fecha
// real. Se valida reconstruyendo la fecha y comparando que coincida exactamente
// (Date normaliza "13" a "enero del año siguiente" en vez de fallar).
export const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato esperado: YYYY-MM-DD')
  .refine((value) => {
    const parts = value.split('-');
    const year = Number(parts[0]);
    const month = Number(parts[1]);
    const day = Number(parts[2]);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }, 'La fecha no existe en el calendario');

// Techo generoso (nunca debería bloquear un cobro real de gimnasio) que igual atrapa el
// error típico de escribir de más un cero por accidente.
const MAX_REASONABLE_AMOUNT = 100_000;

function hasAtMostTwoDecimals(value: number): boolean {
  // No basta con redondear y comprobar que sea entero (eso "acepta" cualquier cosa,
  // 19.999 redondeado a centavos da 2000). Se compara contra el redondeo con una
  // tolerancia mínima, solo para absorber el error de precisión normal de floats
  // (19.99 * 100 no da exactamente 1999 en JS).
  const cents = value * 100;
  return Math.abs(cents - Math.round(cents)) < 1e-9;
}

// USD, con centavos. Reutilizado por precios de plan, pagos, etc. — `positive` decide
// si se admite 0 (p.ej. un plan de cortesía) o se exige mayor a 0 (p.ej. un pago).
function money(positive: boolean) {
  return z.coerce
    .number()
    .refine((value) => (positive ? value > 0 : value >= 0), {
      message: positive ? 'El importe debe ser mayor a 0' : 'El importe no puede ser negativo',
    })
    .refine((value) => value <= MAX_REASONABLE_AMOUNT, {
      message: `El importe no puede superar ${MAX_REASONABLE_AMOUNT.toLocaleString('en-US')}`,
    })
    .refine(hasAtMostTwoDecimals, 'El importe admite máximo dos decimales');
}

export const moneyPositive = money(true);
export const moneyNonNegative = money(false);

// Formato libre entre países (espacios, +, guiones, paréntesis), solo se exige que
// tenga una cantidad razonable de dígitos reales (7 a 15, como E.164) — importa que sea
// válido de verdad porque ahora alimenta el enlace de recordatorio por WhatsApp
// (worker/routes/attendance.ts, check-in de kiosco): un teléfono basura hace que ese
// enlace simplemente no aparezca, sin romper nada más.
export const phone = z
  .string()
  .trim()
  .min(1)
  .max(50)
  .regex(/^[0-9+()\-.\s]+$/, 'El teléfono solo admite números, espacios, +, - y paréntesis')
  .refine((value) => {
    const digits = value.replace(/\D/g, '');
    return digits.length >= 7 && digits.length <= 15;
  }, 'El teléfono debe tener entre 7 y 15 dígitos');
