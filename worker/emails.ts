// Plantillas de los correos transaccionales restantes (Fase 9). El aviso de
// vencimiento próximo ya vive en worker/jobs/expiry-notices.ts (Fase 5).
// CLAUDE.md sección 11: información mínima necesaria, sin datos financieros.
export interface EmailContent {
  subject: string;
  html: string;
}

export function buildWelcomeEmail(memberFullName: string): EmailContent {
  return {
    subject: 'Bienvenido al gimnasio',
    html: `
      <p>Hola ${memberFullName},</p>
      <p>Ya quedaste registrado como socio. Cuando quieras usar la app, inicia sesión con este mismo correo.</p>
      <p>Gimnasio</p>
    `.trim(),
  };
}

export function buildRenewalConfirmationEmail(
  memberFullName: string,
  planName: string,
  startDate: string,
  endDate: string,
): EmailContent {
  return {
    subject: 'Confirmación de renovación de membresía',
    html: `
      <p>Hola ${memberFullName},</p>
      <p>Renovamos tu membresía "${planName}". Nueva vigencia: del ${startDate} al ${endDate}.</p>
      <p>Gimnasio</p>
    `.trim(),
  };
}

export function buildRoutineAssignedEmail(
  memberFullName: string,
  routineName: string,
): EmailContent {
  return {
    subject: 'Nueva rutina asignada',
    html: `
      <p>Hola ${memberFullName},</p>
      <p>Tu entrenador te asignó una nueva rutina: "${routineName}". Consúltala en la app.</p>
      <p>Gimnasio</p>
    `.trim(),
  };
}

export function buildMembershipExpiredEmail(
  memberFullName: string,
  planName: string,
): EmailContent {
  return {
    subject: 'Tu membresía venció',
    html: `
      <p>Hola ${memberFullName},</p>
      <p>Tu membresía "${planName}" ya venció. Acércate a recepción para renovarla.</p>
      <p>Gimnasio</p>
    `.trim(),
  };
}
