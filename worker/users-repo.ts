export type Role = 'admin' | 'receptionist' | 'trainer' | 'member';

export interface UserRecord {
  id: string;
  clerkUserId: string;
  email: string;
  fullName: string;
  role: Role;
  isActive: boolean;
}

interface UserRow {
  id: string;
  clerk_user_id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: number;
}

function mapRow(row: UserRow): UserRecord {
  return {
    id: row.id,
    clerkUserId: row.clerk_user_id,
    email: row.email,
    fullName: row.full_name,
    role: row.role as Role,
    isActive: row.is_active === 1,
  };
}

// `clerk_user_id` es NOT NULL UNIQUE, pero un socio puede crearse (Fase 4) antes de
// tener cuenta de Clerk. Se usa este placeholder único en vez de permitir NULL, para
// no tener que tocar la migración ya aplicada (PLAN.md sección 14). authenticate.ts
// lo reemplaza por el id real la primera vez que esa persona inicia sesión con el
// mismo correo, ya verificado en Clerk.
const UNCLAIMED_PREFIX = 'unclaimed:';

export function makeUnclaimedClerkId(userId: string): string {
  return `${UNCLAIMED_PREFIX}${userId}`;
}

// Fuente confiable del rol (CLAUDE.md sección 5): nunca se confía en un rol enviado
// por el cliente; siempre se resuelve consultando esta tabla por el id verificado de Clerk.
export async function findUserByClerkId(
  db: D1Database,
  clerkUserId: string,
): Promise<UserRecord | null> {
  const row = await db
    .prepare(
      'SELECT id, clerk_user_id, email, full_name, role, is_active FROM users WHERE clerk_user_id = ?',
    )
    .bind(clerkUserId)
    .first<UserRow>();

  return row ? mapRow(row) : null;
}

// Busca una fila creada por staff (Fase 4) que todavía no reclamó su cuenta de Clerk.
export async function findUnclaimedUserByEmail(
  db: D1Database,
  email: string,
): Promise<UserRecord | null> {
  const row = await db
    .prepare(
      'SELECT id, clerk_user_id, email, full_name, role, is_active FROM users WHERE email = ? AND clerk_user_id LIKE ?',
    )
    .bind(email, `${UNCLAIMED_PREFIX}%`)
    .first<UserRow>();

  return row ? mapRow(row) : null;
}

export async function claimUserAccount(
  db: D1Database,
  userId: string,
  clerkUserId: string,
): Promise<void> {
  await db
    .prepare('UPDATE users SET clerk_user_id = ? WHERE id = ?')
    .bind(clerkUserId, userId)
    .run();
}
