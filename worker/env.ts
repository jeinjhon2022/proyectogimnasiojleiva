// Tipo de los bindings/secretos del Worker. Vive en su propio archivo para que
// tanto index.ts como los módulos de auth/rutas puedan importarlo sin ciclos.
export interface Env {
  DB: D1Database;
  // Secretos (nunca con prefijo VITE_). Local: .dev.vars. Remoto: `wrangler secret put`.
  CLERK_SECRET_KEY: string;
  RESEND_API_KEY: string;
  // No es secreta (los DSN de Sentry están pensados para ser públicos), pero se maneja
  // igual que las demás para mantener un solo patrón. Vacía en local = Sentry no envía nada.
  SENTRY_DSN: string;
}
