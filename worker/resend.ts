// Cliente mínimo de Resend (sin SDK: un solo endpoint, no justifica una dependencia
// nueva — CLAUDE.md sección 3, "antes de añadir una dependencia").
export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

// Firma inyectable: permite reemplazar el envío real por uno simulado en pruebas,
// igual que SessionVerifier/ClerkProfileFetcher (worker/clerk.ts).
export type EmailSender = (input: SendEmailInput, apiKey: string) => Promise<void>;

// Remitente de prueba de Resend: no requiere verificar un dominio propio (gratuito).
// Cambiar por un dominio propio verificado antes de usar esto con socios reales.
const FROM_ADDRESS = 'Gimnasio <onboarding@resend.dev>';

export const sendEmailWithResend: EmailSender = async (input, apiKey) => {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: input.to,
      subject: input.subject,
      html: input.html,
    }),
  });

  if (!response.ok) {
    // No se expone el cuerpo de la respuesta de Resend (podría incluir detalles
    // internos); solo se registra el estado para diagnóstico (CLAUDE.md sección 10).
    throw new Error(`Resend respondió con estado ${response.status}`);
  }
};
