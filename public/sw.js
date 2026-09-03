// Service worker mínimo: solo cachea el "app shell" (HTML/JS/CSS estáticos) para que
// la app cargue offline tras la primera visita. Nunca cachea /api/* — mostrar datos
// desactualizados o de otro usuario por un fallo de caché sería peor que un error de
// red visible (CLAUDE.md sección 9).
const CACHE_NAME = 'gym-shell-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (url.pathname.startsWith('/api/')) return;
  if (event.request.method !== 'GET') return;

  // Red primero, caché como respaldo solo si no hay conexión.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request)),
  );
});
