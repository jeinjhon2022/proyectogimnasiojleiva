import type { Env } from '../env';
import { getGymTimezone, todayInTimezone } from '../gym-settings-repo';
import {
  findMembershipsNeedingExpiryNotice,
  findRecentlyExpiredMemberships,
  markExpiredNoticeSent,
  markExpiryNoticeSent,
} from '../memberships-repo';
import { buildMembershipExpiredEmail } from '../emails';
import { sendEmailWithResend, type EmailSender } from '../resend';

// Días de anticipación del aviso (PLAN.md sección 4/14, valor asumido por defecto).
export const EXPIRY_NOTICE_WINDOW_DAYS = 3;

export function buildExpiryNoticeEmail(
  memberFullName: string,
  planName: string,
  endDate: string,
): { subject: string; html: string } {
  return {
    subject: 'Tu membresía está por vencer',
    html: `
      <p>Hola ${memberFullName},</p>
      <p>Tu membresía "${planName}" vence el ${endDate}. Acércate a recepción para renovarla y no perder continuidad.</p>
      <p>Gimnasio</p>
    `.trim(),
  };
}

export interface RunExpiryNoticesResult {
  sent: number;
  failed: number;
}

// Se ejecuta desde el Cron Trigger diario (worker/index.ts, scheduled()) y también
// manualmente vía POST /api/membership-notices/run (solo Administrador). `sendEmail`
// es inyectable para pruebas (por defecto, Resend real) — mismo patrón que
// SessionVerifier/ClerkProfileFetcher en worker/clerk.ts.
export async function runExpiryNoticeJob(
  env: Env,
  sendEmail: EmailSender = sendEmailWithResend,
): Promise<RunExpiryNoticesResult> {
  const timezone = await getGymTimezone(env.DB);
  const today = todayInTimezone(timezone);
  const candidates = await findMembershipsNeedingExpiryNotice(
    env.DB,
    today,
    EXPIRY_NOTICE_WINDOW_DAYS,
  );

  let sent = 0;
  let failed = 0;

  for (const candidate of candidates) {
    const { subject, html } = buildExpiryNoticeEmail(
      candidate.memberFullName,
      candidate.planName,
      candidate.endDate,
    );

    try {
      await sendEmail({ to: candidate.memberEmail, subject, html }, env.RESEND_API_KEY);
      await markExpiryNoticeSent(env.DB, candidate.membershipId, new Date().toISOString());
      sent += 1;
    } catch {
      // Un fallo individual no detiene el resto del lote. expiry_notice_sent_at sigue
      // NULL, así que se reintenta solo en la próxima corrida del job.
      failed += 1;
    }
  }

  return { sent, failed };
}

// Cuántos días hacia atrás se buscan membresías recién vencidas (Fase 9). Evita un
// envío masivo de una sola vez sobre historial viejo; con la corrida diaria, "ayer"
// es lo normal — esto es solo un margen de seguridad ante un día sin corrida.
export const EXPIRED_NOTICE_LOOKBACK_DAYS = 7;

// Aviso de "membresía vencida" (CLAUDE.md sección 11). Job separado del de vencimiento
// próximo: candidatos y columna de idempotencia distintos.
export async function runExpiredNoticeJob(
  env: Env,
  sendEmail: EmailSender = sendEmailWithResend,
): Promise<RunExpiryNoticesResult> {
  const timezone = await getGymTimezone(env.DB);
  const today = todayInTimezone(timezone);
  const candidates = await findRecentlyExpiredMemberships(
    env.DB,
    today,
    EXPIRED_NOTICE_LOOKBACK_DAYS,
  );

  let sent = 0;
  let failed = 0;

  for (const candidate of candidates) {
    const { subject, html } = buildMembershipExpiredEmail(
      candidate.memberFullName,
      candidate.planName,
    );

    try {
      await sendEmail({ to: candidate.memberEmail, subject, html }, env.RESEND_API_KEY);
      await markExpiredNoticeSent(env.DB, candidate.membershipId, new Date().toISOString());
      sent += 1;
    } catch {
      failed += 1;
    }
  }

  return { sent, failed };
}
