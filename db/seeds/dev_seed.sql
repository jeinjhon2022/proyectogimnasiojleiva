-- Datos ficticios SOLO para desarrollo local. Nunca ejecutar contra una base remota/producción
-- y nunca reemplazar estos valores por datos reales de personas (CLAUDE.md secciones 7 y 10).
-- Ejecutar con: npm run db:seed:local
-- Cubre el recorrido de extremo a extremo de PLAN.md sección 2, para poder probarlo manualmente
-- o con Playwright una vez existan las pantallas.

INSERT INTO gym_settings (id, name, timezone, currency, created_at, updated_at) VALUES
  ('default', 'Gimnasio Demo', 'America/Bogota', 'USD', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

INSERT INTO users (id, clerk_user_id, email, full_name, role, is_active, created_at, updated_at) VALUES
  ('user_admin_1', 'clerk_test_admin_1', 'admin@example.test', 'Admin Demo', 'admin', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('user_reception_1', 'clerk_test_reception_1', 'recepcion@example.test', 'Recepción Demo', 'receptionist', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('user_trainer_1', 'clerk_test_trainer_1', 'entrenador@example.test', 'Entrenador Demo', 'trainer', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('user_member_1', 'clerk_test_member_1', 'socio1@example.test', 'Socio Uno', 'member', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

INSERT INTO members (id, user_id, member_code, phone, birth_date, join_date, is_active, created_at, updated_at) VALUES
  ('member_1', 'user_member_1', 'SOC-0001', '+57 300 0000000', '1995-05-01', '2026-01-15', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

INSERT INTO membership_plans (id, name, duration_days, price, is_active, created_at, updated_at) VALUES
  ('plan_monthly', 'Mensual', 30, 40.00, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

-- start_date/end_date son fecha únicamente (YYYY-MM-DD), no timestamp: una membresía
-- vence un día calendario, no a una hora específica (ver worker/memberships-repo.ts).
INSERT INTO memberships (id, member_id, plan_id, start_date, end_date, price_agreed, status, created_by, created_at, updated_at) VALUES
  ('membership_1', 'member_1', 'plan_monthly', '2026-08-15', '2026-09-14', 40.00, 'active', 'user_reception_1', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

INSERT INTO payments (id, member_id, membership_id, amount, method, payment_date, status, created_by, created_at, updated_at) VALUES
  ('payment_1', 'member_1', 'membership_1', 40.00, 'cash', '2026-08-15T00:00:00.000Z', 'completed', 'user_reception_1', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

INSERT INTO attendance (id, member_id, checked_in_at, source, recorded_by, created_at) VALUES
  ('attendance_1', 'member_1', '2026-08-20T14:30:00.000Z', 'manual', 'user_reception_1', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

INSERT INTO exercises (id, name, description, muscle_group, is_active, created_at, updated_at) VALUES
  ('exercise_squat', 'Sentadilla', 'Sentadilla con barra', 'piernas', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('exercise_bench', 'Press de banca', 'Press de banca plano', 'pecho', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

INSERT INTO routines (id, name, description, status, created_by, created_at, updated_at) VALUES
  ('routine_1', 'Rutina de fuerza básica', 'Rutina inicial de 2 ejercicios', 'active', 'user_trainer_1', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

INSERT INTO routine_exercises (id, routine_id, exercise_id, position, sets, reps, rest_seconds) VALUES
  ('routine_exercise_1', 'routine_1', 'exercise_squat', 0, 4, 8, 90),
  ('routine_exercise_2', 'routine_1', 'exercise_bench', 1, 4, 8, 90);

INSERT INTO routine_assignments (id, routine_id, member_id, assigned_by, assigned_at, status, created_at, updated_at) VALUES
  ('routine_assignment_1', 'routine_1', 'member_1', 'user_trainer_1', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'active', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
