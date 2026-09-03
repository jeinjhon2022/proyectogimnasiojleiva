import { useEffect, useState } from 'react';

// Gestión clara de la pérdida de conexión (CLAUDE.md sección 9). No intenta ocultar
// el problema con datos en caché silenciosos: avisa explícitamente.
export default function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
    }
    function handleOffline() {
      setIsOnline(false);
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div role="status" className="w-full bg-amber-100 px-4 py-2 text-center text-sm text-amber-900">
      Sin conexión — algunos datos podrían no estar actualizados hasta que vuelvas a estar en línea.
    </div>
  );
}
