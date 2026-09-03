// Utilidades solo para pruebas: un D1 falso mínimo que reconoce las formas concretas
// de consulta usadas en worker/users-repo.ts (no es un motor SQL real).
// No usar fuera de archivos *.test.ts.
export interface FakeUserRow {
  id: string;
  clerk_user_id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: number;
}

export function createFakeUsersD1(initialUsers: FakeUserRow[]): D1Database {
  const users = initialUsers.map((user) => ({ ...user }));

  return {
    prepare(sql: string) {
      const normalized = sql.trim().toUpperCase();
      return {
        bind(...params: unknown[]) {
          return {
            async first<T>(): Promise<T | null> {
              if (normalized.includes('WHERE CLERK_USER_ID = ?')) {
                const [clerkUserId] = params as [string];
                const match = users.find((user) => user.clerk_user_id === clerkUserId);
                return (match ?? null) as T | null;
              }
              if (normalized.includes('CLERK_USER_ID LIKE ?')) {
                const [email, likePattern] = params as [string, string];
                const prefix = likePattern.replace(/%$/, '');
                const match = users.find(
                  (user) => user.email === email && user.clerk_user_id.startsWith(prefix),
                );
                return (match ?? null) as T | null;
              }
              throw new Error(`createFakeUsersD1: consulta first() no soportada: ${sql}`);
            },
            async run(): Promise<{ success: boolean; meta: { changes: number } }> {
              if (normalized.startsWith('UPDATE USERS SET CLERK_USER_ID = ?')) {
                const [clerkUserId, id] = params as [string, string];
                const user = users.find((existing) => existing.id === id);
                if (user) user.clerk_user_id = clerkUserId;
                return { success: true, meta: { changes: user ? 1 : 0 } };
              }
              throw new Error(`createFakeUsersD1: consulta run() no soportada: ${sql}`);
            },
          };
        },
      };
    },
  } as unknown as D1Database;
}
