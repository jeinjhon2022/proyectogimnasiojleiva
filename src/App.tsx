import { useEffect, useState, type ReactNode } from 'react';
import { SignedIn, SignedOut, SignIn, UserButton, useAuth } from '@clerk/clerk-react';
import {
  AlertTriangle,
  ClipboardList,
  Dumbbell,
  Fingerprint,
  LayoutGrid,
  Loader2,
  Package,
  Users,
  Wallet,
} from 'lucide-react';
import MembersPanel from './members/MembersPanel';
import RoutinesPanel from './routines/RoutinesPanel';
import MemberDashboard from './member/MemberDashboard';
import KioskCheckIn from './attendance/KioskCheckIn';
import CashRegisterPanel from './cash/CashRegisterPanel';
import ProductsPanel from './products/ProductsPanel';
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

// Dirección visual (frontend-design skill): en vez del SaaS oscuro genérico
// (negro puro + un solo acento ácido), la paleta y tipografía toman el vocabulario
// de una sala de pesas real — carbón cálido, tiza, y el naranja de una placa/cinta
// de advertencia — con una fuente de afiche condensada (Anton) para títulos y una
// mono (IBM Plex Mono) para cifras, como el marcador de un gimnasio. Ver src/index.css.
interface NavItem {
  id: string;
  label: string;
  icon: typeof Users;
}

function navItemsForRole(role: Role): NavItem[] {
  switch (role) {
    case 'admin':
      return [
        { id: 'checkin', label: 'Check-in', icon: Fingerprint },
        { id: 'socios', label: 'Socios', icon: Users },
        { id: 'caja', label: 'Caja', icon: Wallet },
        { id: 'productos', label: 'Productos', icon: Package },
        { id: 'rutinas', label: 'Rutinas', icon: ClipboardList },
      ];
    case 'receptionist':
      return [
        { id: 'checkin', label: 'Check-in', icon: Fingerprint },
        { id: 'socios', label: 'Socios', icon: Users },
        { id: 'caja', label: 'Caja', icon: Wallet },
        { id: 'productos', label: 'Productos', icon: Package },
      ];
    case 'trainer':
      return [{ id: 'rutinas', label: 'Rutinas', icon: ClipboardList }];
    case 'member':
      return [
        { id: 'mi-membresia', label: 'Mi membresía', icon: LayoutGrid },
        { id: 'mi-asistencia', label: 'Mi asistencia', icon: ClipboardList },
        { id: 'mi-rutina', label: 'Mi rutina', icon: Dumbbell },
      ];
    default:
      return [];
  }
}

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function BrandMark() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-accent text-on-accent">
        <Dumbbell className="h-5 w-5" strokeWidth={2.5} />
      </div>
      <span className="font-display text-xl uppercase leading-none tracking-wide text-chalk">
        Gimnasio
      </span>
    </div>
  );
}

export default function App() {
  return (
    <div className="min-h-screen bg-ink text-chalk">
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
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-6">
      <BrandMark />
      <SignIn
        appearance={{
          variables: {
            colorPrimary: '#ff4d1f',
            colorBackground: '#ffffff',
            colorInputBackground: '#f1f3ee',
            colorInputText: '#211d17',
            colorText: '#211d17',
            colorTextSecondary: '#6f6656',
            colorNeutral: '#6f6656',
            borderRadius: '0.375rem',
            fontFamily: 'Inter, sans-serif',
          },
        }}
      />
    </main>
  );
}

function AppShell({
  role,
  fullName,
  children,
}: {
  role: Role;
  fullName: string;
  children: ReactNode;
}) {
  const navItems = navItemsForRole(role);

  return (
    <div className="md:flex md:min-h-screen">
      {/* Sidebar: solo en escritorio, con enlaces a las secciones que realmente
          existen en la página (no hay rutas separadas todavía). */}
      <aside className="hidden md:sticky md:top-0 md:flex md:h-screen md:w-56 md:flex-shrink-0 md:flex-col md:border-r md:border-line md:bg-surface-raised">
        <div className="border-b border-line p-4">
          <BrandMark />
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => scrollToSection(item.id)}
              className="flex items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-medium text-chalk-muted transition-colors hover:bg-surface hover:text-chalk"
            >
              <item.icon className="h-4 w-4 shrink-0 text-accent" />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-2.5 border-t border-line p-4">
          <UserButton />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-chalk">{fullName}</p>
            <Badge tone="info" className="mt-1">
              {ROLE_LABELS[role]}
            </Badge>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barra superior: siempre visible; en móvil hace las veces de sidebar. */}
        <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur md:bg-transparent md:backdrop-blur-none">
          <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6 md:hidden">
            <BrandMark />
            <div className="flex items-center gap-2">
              <Badge tone="info">{ROLE_LABELS[role]}</Badge>
              <UserButton />
            </div>
          </div>
          {navItems.length > 0 && (
            <div className="flex gap-2 overflow-x-auto border-t border-line px-4 py-2 sm:px-6 md:hidden">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => scrollToSection(item.id)}
                  className="flex shrink-0 items-center gap-1.5 rounded-sm border border-line px-3 py-1.5 font-mono text-xs uppercase tracking-wide text-chalk-muted hover:border-accent hover:text-chalk"
                >
                  <item.icon className="h-3.5 w-3.5" />
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </header>

        <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-4 sm:p-6">
          {children}
        </main>
      </div>
    </div>
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
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 text-chalk-muted">
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
        <AlertTriangle className="h-8 w-8 text-danger" />
        <p role="alert" className="max-w-sm text-sm text-danger">
          No se pudo cargar tu perfil: {state.message}
        </p>
      </div>
    );
  }

  const { role, fullName } = state.data;

  return (
    <AppShell role={role} fullName={fullName}>
      {/* Ocultar esto en el frontend es solo UX: el Worker vuelve a exigir el rol
          en cada request de /api/members (CLAUDE.md sección 5). */}
      {(role === 'admin' || role === 'receptionist') && (
        <div id="checkin">
          <KioskCheckIn getToken={getToken} />
        </div>
      )}

      {(role === 'admin' || role === 'receptionist') && (
        <div id="socios">
          <MembersPanel getToken={getToken} role={role} />
        </div>
      )}

      {(role === 'admin' || role === 'receptionist') && (
        <div id="caja">
          <CashRegisterPanel getToken={getToken} />
        </div>
      )}

      {(role === 'admin' || role === 'receptionist') && (
        <div id="productos">
          <ProductsPanel getToken={getToken} />
        </div>
      )}

      {(role === 'admin' || role === 'trainer') && (
        <div id="rutinas">
          <RoutinesPanel getToken={getToken} />
        </div>
      )}

      {role === 'member' && <MemberDashboard getToken={getToken} />}
    </AppShell>
  );
}
