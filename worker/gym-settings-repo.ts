// La fecha de "hoy" para decidir vencimientos se calcula en la zona horaria del
// gimnasio, nunca en UTC crudo (CLAUDE.md sección 7 / PLAN.md sección 4): todo se
// almacena en UTC, pero "¿ya venció?" es una pregunta que depende de la hora local.
export async function getGymTimezone(db: D1Database): Promise<string> {
  const row = await db
    .prepare('SELECT timezone FROM gym_settings LIMIT 1')
    .first<{ timezone: string }>();
  return row?.timezone ?? 'UTC';
}

// Formato en-CA da YYYY-MM-DD directamente, sin necesidad de reordenar manualmente.
export function todayInTimezone(timezone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
