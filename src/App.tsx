import { useEffect, useState } from 'react';
import { SignedIn, SignedOut, SignIn, UserButton, useAuth } from '@clerk/clerk-react';
import MembersPanel from './members/MembersPanel';
import RoutinesPanel from './routines/RoutinesPanel';
import MemberDashboard from './member/MemberDashboard';
import OfflineBanner from './OfflineBanner';
import type { Role } from './api';

interface MeResponse {
  id: string;
  email: string;
  fullName: string;
  role: Role;
}

type LoadState =
  { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'success'; data: MeResponse };

const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrador',
  receptionist: 'Recepcionista',
  trainer: 'Entrenador',
  member: 'Socio',
};

// Autenticación (Fase 3) + perfil básico, socios (Fase 4), membresías (Fase 5), pagos
// (Fase 6), asistencia (Fase 7, dentro de socios) y rutinas (Fase 8).
export default function App() {
  return (
    <main className="flex min-h-screen flex-col items-center gap-4 bg-slate-50 text-center text-slate-900">
      <OfflineBanner />
      <div className="flex w-full flex-col items-center gap-4 p-6">
        <SignedOut>
          <h1 className="text-2xl font-semibold">Gimnasio</h1>
          <SignIn />
        </SignedOut>
        <SignedIn>
          <AuthenticatedHome />
        </SignedIn>
      </div>
    </main>
  );
}

function AuthenticatedHome() {
  const { getToken } = useAuth();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      try {
        const token = await getToken();
        const response = await fetch('/api/me', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });

        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            error?: { message?: string };
          } | null;
          throw new Error(
            body?.error?.message ?? `El servidor respondió con estado ${response.status}`,
          );
        }

        const data = (await response.json()) as MeResponse;
        if (!cancelled) setState({ kind: 'success', data });
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : 'Error desconocido';
          setState({ kind: 'error', message });
        }
      }
    }

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [getToken]);

  return (
    <div className="flex flex-col items-center gap-4">
      <UserButton />

      {state.kind === 'loading' && <p role="status">Cargando tu perfil…</p>}

      {state.kind === 'error' && (
        <p role="alert" className="text-red-600">
          No se pudo cargar tu perfil: {state.message}
        </p>
      )}

      {state.kind === 'success' && (
        <div className="flex w-full flex-col items-center gap-6">
          <div>
            <p className="text-lg font-medium">Hola, {state.data.fullName}</p>
            <p className="text-sm text-slate-600">Rol: {ROLE_LABELS[state.data.role]}</p>
          </div>

          {/* Ocultar esto en el frontend es solo UX: el Worker vuelve a exigir el rol
              en cada request de /api/members (CLAUDE.md sección 5). */}
          {(state.data.role === 'admin' || state.data.role === 'receptionist') && (
            <MembersPanel getToken={getToken} role={state.data.role} />
          )}

          {(state.data.role === 'admin' || state.data.role === 'trainer') && (
            <RoutinesPanel getToken={getToken} />
          )}

          {state.data.role === 'member' && <MemberDashboard getToken={getToken} />}
        </div>
      )}
    </div>
  );
}
