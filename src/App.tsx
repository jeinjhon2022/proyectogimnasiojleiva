import { useEffect, useState } from 'react';
import { SignedIn, SignedOut, SignIn, UserButton, useAuth } from '@clerk/clerk-react';
import { AlertTriangle, Dumbbell, Loader2 } from 'lucide-react';
import MembersPanel from './members/MembersPanel';
import RoutinesPanel from './routines/RoutinesPanel';
import MemberDashboard from './member/MemberDashboard';
import OfflineBanner from './OfflineBanner';
import { Badge } from './components/ui/badge';
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
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <OfflineBanner />
      <SignedOut>
        <SignInScreen />
      </SignedOut>
      <SignedIn>
        <AuthenticatedHome />
      </SignedIn>
    </div>
  );
}

function SignInScreen() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <div className="flex items-center gap-2 text-slate-900">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-white">
          <Dumbbell className="h-6 w-6" />
        </div>
        <span className="text-xl font-bold tracking-tight">Gimnasio</span>
      </div>
      <SignIn />
    </main>
  );
}

function AppHeader({ fullName, role }: { fullName: string; role: Role }) {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white">
            <Dumbbell className="h-5 w-5" />
          </div>
          <span className="text-lg font-bold tracking-tight text-slate-900">Gimnasio</span>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <p className="text-sm font-medium leading-tight text-slate-900">{fullName}</p>
            <Badge tone="info" className="mt-0.5">
              {ROLE_LABELS[role]}
            </Badge>
          </div>
          <UserButton />
        </div>
      </div>
    </header>
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

  if (state.kind === 'loading') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 text-slate-500">
        <Loader2 className="h-6 w-6 animate-spin" />
        <p role="status" className="text-sm">
          Cargando tu perfil…
        </p>
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 p-6 text-center">
        <AlertTriangle className="h-8 w-8 text-red-500" />
        <p role="alert" className="max-w-sm text-sm text-red-600">
          No se pudo cargar tu perfil: {state.message}
        </p>
      </div>
    );
  }

  return (
    <>
      <AppHeader fullName={state.data.fullName} role={state.data.role} />
      <main className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-6">
        {/* Ocultar esto en el frontend es solo UX: el Worker vuelve a exigir el rol
            en cada request de /api/members (CLAUDE.md sección 5). */}
        {(state.data.role === 'admin' || state.data.role === 'receptionist') && (
          <MembersPanel getToken={getToken} role={state.data.role} />
        )}

        {(state.data.role === 'admin' || state.data.role === 'trainer') && (
          <RoutinesPanel getToken={getToken} />
        )}

        {state.data.role === 'member' && <MemberDashboard getToken={getToken} />}
      </main>
    </>
  );
}
