import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ClerkProvider } from '@clerk/clerk-react';
import App from './App';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('No se encontró el elemento #root en index.html');
}

// La publishable key es pública (no es un secreto); ver .env.example.
const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

createRoot(rootElement).render(
  <StrictMode>
    {clerkPublishableKey ? (
      <ClerkProvider publishableKey={clerkPublishableKey}>
        <App />
      </ClerkProvider>
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
