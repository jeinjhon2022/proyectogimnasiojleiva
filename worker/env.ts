// Tipo de los bindings/secretos del Worker. Vive en su propio archivo para que
// tanto index.ts como los módulos de auth/rutas puedan importarlo sin ciclos.
export interface Env {
  DB: D1Database;
  // Secretos (nunca con prefijo VITE_). Local: .dev.vars. Remoto: `wrangler secret put`.
  CLERK_SECRET_KEY: string;
  RESEND_API_KEY: string;
}
