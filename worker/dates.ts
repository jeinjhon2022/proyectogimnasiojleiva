// Utilidades de fecha compartidas entre repos (fechas YYYY-MM-DD, sin componente de hora).
// Admite días negativos (retrocede) gracias a setUTCDate.
export function addDays(dateOnly: string, days: number): string {
  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
