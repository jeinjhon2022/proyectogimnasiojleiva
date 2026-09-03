import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ClerkProvider } from '@clerk/clerk-react';
import * as Sentry from '@sentry/react';
import App from './App';
import './index.css';

// Solo en build de producción: en dev no queremos que los errores de desarrollo
// lleguen a Sentry (CLAUDE.md sección 12). El DSN no es secreto, pero igual no tiene
// sentido enviarlo si no hay nada real que monitorear todavía (nada desplegado, Fase 9).
if (import.meta.env.PROD && import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    // TODO(Fase 10): distinguir preview/production cuando existan entornos reales.
    environment: 'production',
    tracesSampleRate: 0, // solo captura de errores por ahora, sin trazas de performance
    sendDefaultPii: false, // nunca IP/datos de usuario por defecto (CLAUDE.md sección 10)
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('No se encontró el elemento #root en index.html');
}

// La publishable key es pública (no es un secreto); ver .env.example.
const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

createRoot(rootElement).render(
  <StrictMode>
    {clerkPublishableKey ? (
      <Sentry.ErrorBoundary
        fallback={
          <main className="flex min-h-screen flex-col items-center justify-center gap-2 bg-slate-50 p-6 text-center text-slate-900">
            <h1 className="text-xl font-semibold text-red-600">Ocurrió un error inesperado</h1>
            <p className="text-sm text-slate-600">
              Intenta recargar la página. Ya quedó registrado.
            </p>
          </main>
        }
      >
        <ClerkProvider publishableKey={clerkPublishableKey}>
          <App />
        </ClerkProvider>
      </Sentry.ErrorBoundary>
    ) : (
      <main className="flex min-h-screen flex-col items-center justify-center gap-2 bg-slate-50 p-6 text-center text-slate-900">
        <h1 className="text-xl font-semibold text-red-600">Falta configurar Clerk</h1>
        <p className="max-w-md text-sm text-slate-600">
          Define <code>VITE_CLERK_PUBLISHABLE_KEY</code> en un archivo <code>.env</code> local (ver{' '}
          <code>.env.example</code>) y vuelve a iniciar <code>npm run dev</code>.
        </p>
      </main>
    )}
  </StrictMode>,
);

// Solo en build de producción: en dev, un service worker cacheando módulos rompería
// el recargado en caliente de Vite.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // No es crítico: la app sigue funcionando sin soporte offline del app shell.
    });
  });
}
