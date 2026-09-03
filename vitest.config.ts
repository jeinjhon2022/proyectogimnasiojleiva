import { defineConfig } from 'vitest/config';

// Configuración mínima para pruebas unitarias (Vitest) de la Fase 1.
// No usa el plugin de Cloudflare: las pruebas de esta fase son funciones puras
// (el handler de /api/health) que no requieren el runtime real de Workers.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: ['node_modules', 'dist', '.wrangler'],
  },
});
