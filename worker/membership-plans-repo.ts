export interface MembershipPlan {
  id: string;
  name: string;
  durationDays: number;
  price: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface MembershipPlanRow {
  id: string;
  name: string;
  duration_days: number;
  price: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}

function mapPlan(row: MembershipPlanRow): MembershipPlan {
  return {
    id: row.id,
    name: row.name,
    durationDays: row.duration_days,
    price: row.price,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listMembershipPlans(db: D1Database): Promise<MembershipPlan[]> {
  const result = await db
    .prepare(
      'SELECT id, name, duration_days, price, is_active, created_at, updated_at FROM membership_plans ORDER BY name ASC',
    )
    .all<MembershipPlanRow>();
  return result.results.map(mapPlan);
}

export async function getMembershipPlanById(
  db: D1Database,
  id: string,
): Promise<MembershipPlan | null> {
  const row = await db
    .prepare(
      'SELECT id, name, duration_days, price, is_active, created_at, updated_at FROM membership_plans WHERE id = ?',
    )
    .bind(id)
    .first<MembershipPlanRow>();
  return row ? mapPlan(row) : null;
}

export interface CreateMembershipPlanInput {
  name: string;
  durationDays: number;
  price: number;
}

// Solo Administrador puede crear planes (define la política de precios del gimnasio;
// CLAUDE.md sección 5).
export async function createMembershipPlan(
  db: D1Database,
  input: CreateMembershipPlanInput,
  actorUserId: string,
): Promise<MembershipPlan> {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  await db.batch([
    db
      .prepare(
        'INSERT INTO membership_plans (id, name, duration_days, price, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)',
      )
      .bind(id, input.name, input.durationDays, input.price, now, now),
    db
      .prepare(
        "INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, metadata, created_at) VALUES (?, ?, 'membership_plan.create', 'membership_plan', ?, ?, ?)",
      )
      .bind(
        crypto.randomUUID(),
        actorUserId,
        id,
        JSON.stringify({ name: input.name, price: input.price }),
        now,
      ),
  ]);

  const created = await getMembershipPlanById(db, id);
  if (!created) throw new Error('No se pudo leer el plan recién creado');
  return created;
}
