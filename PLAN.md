# PLAN.md - Plan de implementación (Fase 0)

> Generado a partir de CLAUDE.md. No se ha escrito código de aplicación todavía. Este documento debe revisarse y aprobarse (o corregirse) antes de iniciar la Fase 1.

---

## 1. Objetivos

- Dar a un gimnasio una herramienta única para administrar socios, membresías, pagos manuales, asistencia y rutinas, reemplazando hojas de cálculo o procesos manuales.
- Permitir que cada socio consulte su propia información (membresía, asistencia, rutina) sin intervención del personal.
- Operar como PWA instalable, mobile-first, sin apps nativas separadas.
- Mantener el proyecto **100% dentro de planes gratuitos** de todos los servicios mientras dure la fase de piloto (ver CLAUDE.md sección 3.1).
- Priorizar seguridad e integridad de datos por encima de velocidad de entrega (CLAUDE.md sección 23).

## 2. Alcance del MVP

Recorrido de extremo a extremo que debe funcionar antes de agregar cualquier función adicional:

1. Un administrador inicia sesión.
2. Registra un socio.
3. Asigna una membresía al socio.
4. Registra un pago manual.
5. Registra una asistencia.
6. Consulta el estado y vencimiento de la membresía.
7. Un entrenador crea y asigna una rutina.
8. El socio inicia sesión y consulta su membresía, asistencia y rutina.

Módulos incluidos en el MVP: autenticación, socios, membresías, pagos manuales, asistencia (registro manual), rutinas, panel administrativo, y **un único correo transaccional**: aviso de membresía próxima a vencer (Resend, plan Free) — confirmado como requisito del MVP.

Explícitamente **fuera** del MVP: pagos en línea, QR de asistencia (se agrega después de que el registro manual esté estable), el resto de correos transaccionales (bienvenida, confirmación de renovación, membresía vencida, rutina asignada), Sentry, Turnstile, R2, PWA completa (manifiesto/íconos básicos sí, offline avanzado no). Estos se abordan en la Fase 9, una vez estabilizados los módulos principales.

Supuestos de negocio confirmados: un solo gimnasio (single-tenant), moneda única USD, interfaz solo en español, aproximadamente 100 socios en el piloto.

## 3. Usuarios

| Rol           | Descripción                                                            |
| ------------- | ---------------------------------------------------------------------- |
| Administrador | Dueño o encargado general del gimnasio. Control total.                 |
| Recepcionista | Personal de mostrador. Opera socios, pagos y asistencia del día a día. |
| Entrenador    | Crea y asigna rutinas, consulta solo los socios que atiende.           |
| Socio         | Cliente del gimnasio. Solo ve su propia información.                   |

**Confirmado: un solo gimnasio** en el piloto (single-tenant). No se modela multi-sede en el MVP.

## 4. Reglas del negocio

- Un socio no se elimina físicamente si tiene pagos, membresías o asistencias asociadas; se desactiva (`is_active = false`).
- Una renovación de membresía crea un nuevo registro en `memberships`; nunca sobrescribe el anterior. El historial completo siempre queda disponible.
- **Recepcionista solo puede renovar/crear una membresía al precio vigente del plan** (`membership_plans.price`), sin aplicar descuentos ni modificar el precio manualmente. Cualquier precio distinto al del plan (descuento, cortesía, ajuste) requiere rol Administrador y queda registrado en `audit_logs` con el motivo.
- Un pago no se borra; una corrección es una anulación (`payments.status = 'voided'`) con motivo, fecha y usuario responsable, o un pago de ajuste nuevo. **Solo Administrador puede anular un pago.**
- No se almacenan datos de tarjetas (números completos, CVV) bajo ninguna circunstancia.
- Moneda única: todos los importes (`membership_plans.price`, `payments.amount`) se manejan en USD; no hay conversión de divisas ni selección de moneda por transacción.
- La asistencia previene duplicados accidentales: un segundo registro del mismo socio dentro de **1 hora** desde el último se rechaza (o se advierte) en vez de crear una fila nueva.
- Todas las fechas se almacenan en UTC. La zona horaria del gimnasio vive en `gym_settings.timezone` y solo se aplica al mostrar información (CLAUDE.md sección 7).
- El rol de cada usuario se determina siempre en el Worker a partir de una fuente confiable (Clerk + tabla `users`), nunca desde un valor enviado por el navegador.
- Toda operación financiera o administrativa sensible (crear/anular pago, cambiar rol, desactivar socio, renovar membresía) genera un registro en `audit_logs`.
- Cuando una membresía entra en la ventana de "próxima a vencer" (por defecto, **3 días** antes de `end_date` — ajustable, ver sección 14), se envía un único correo de aviso al socio; el envío queda marcado en `memberships.expiry_notice_sent_at` para no duplicarlo en corridas posteriores del proceso.

## 5. Arquitectura

```
Usuario (navegador / PWA instalada)
  -> React + Vite + TypeScript (frontend, mobile-first, Tailwind + shadcn/ui)
  -> Clerk (identifica al usuario, plan Free)
  -> Cloudflare Worker (API, valida sesión + rol + permisos en cada request)
       -> Zod (validación de entrada)
       -> D1 (datos estructurados, vía db.batch() para operaciones multi-registro)
       -> R2 (fase 9: fotos/documentos privados)
  -> Resend (Fase 5: solo aviso de vencimiento próximo; el resto de correos en fase 9)
  -> Sentry (fase 9: errores sanitizados)

Cloudflare Worker Cron Trigger (plan Free, ejecución diaria)
  -> consulta memberships con end_date en la ventana de aviso y expiry_notice_sent_at nulo
  -> envía el correo vía Resend
  -> marca memberships.expiry_notice_sent_at para no reenviar
```

Reglas fijas:

- El frontend nunca accede a D1 directamente ni maneja secretos privados.
- Toda ruta protegida pasa por el Worker, que revalida identidad y rol en cada llamada (no confía en el estado del cliente).
- Entornos: local (D1 local vía Wrangler, Clerk en modo test) → preview → producción. Nunca se mezclan datos ni variables entre entornos.

## 6. Modelo de datos

Todas las tablas incluyen `id` (TEXT, UUID), `created_at` y `updated_at` (UTC, ISO 8601) salvo que se indique lo contrario. `created_by`/`updated_by` se agregan en tablas con operaciones sensibles.

### gym_settings

Un único registro (single-tenant confirmado; no se modela más de una sede en el MVP).

- `id`, `name`, `timezone` (ej. "America/Bogota"), `currency` (fijo: "USD"), `created_at`, `updated_at`.

### users

Refleja la identidad de Clerk + el rol interno.

- `id`, `clerk_user_id` (único, índice), `email` (único), `full_name`, `role` (`admin` | `receptionist` | `trainer` | `member`), `is_active`, `created_at`, `updated_at`.

### members

Datos de socio, separados de `users` porque un socio siempre tiene `users.role = 'member'` pero puede tener datos propios de negocio.

- `id`, `user_id` (FK a users, único), `member_code` (único, índice), `phone`, `birth_date`, `join_date`, `is_active`, `notes`, `created_at`, `updated_at`.
- Índices: `member_code`, `is_active`, búsqueda por nombre/correo/teléfono (vía `users`).

### membership_plans

Catálogo de tipos de membresía (ej. "Mensual", "Trimestral").

- `id`, `name`, `duration_days`, `price` (USD), `is_active`, `created_at`, `updated_at`. Sin columna de moneda: el gimnasio opera en una única moneda (`gym_settings.currency = 'USD'`), así que repetirla por fila sería duplicación sin justificación.

### memberships

Historial de membresías por socio; nunca se sobrescribe.

- `id`, `member_id` (FK, índice), `plan_id` (FK), `start_date`, `end_date`, `price_agreed` (USD; puede diferir de `membership_plans.price` solo si lo registra un Administrador), `status` (`pending`|`active`|`expired`|`suspended`|`cancelled`), `renewed_from_id` (FK opcional a la membresía anterior), `expiry_notice_sent_at` (timestamp opcional, marca el envío del correo de vencimiento para evitar duplicados), `created_by`, `created_at`, `updated_at`.
- Índices: `member_id`, `status`, `end_date` (para detectar vencimientos y para el Cron Trigger de avisos), `expiry_notice_sent_at`.

### payments

- `id`, `member_id` (FK, índice), `membership_id` (FK, opcional), `amount` (USD), `method` (`cash`|`transfer`|`card_in_person`|`other`), `payment_date`, `reference` (opcional), `status` (`completed`|`voided`), `void_reason` (opcional), `observation` (opcional), `created_by`, `created_at`, `updated_at`.
- Índices: `member_id`, `payment_date`, `status`.
- Idempotencia: `idempotency_key` (único, opcional) para evitar duplicados por reintentos de red.

### attendance

- `id`, `member_id` (FK, índice), `checked_in_at` (UTC), `source` (`manual`|`qr`), `recorded_by` (FK a users, para registro manual), `location_id` (opcional, futuro), `created_at`.
- Índice compuesto `(member_id, checked_in_at)` para detectar duplicados recientes y construir historial.

### exercises

Catálogo de ejercicios.

- `id`, `name`, `description`, `muscle_group` (opcional), `is_active`, `created_at`, `updated_at`.

### routines

- `id`, `name`, `description`, `status` (`draft`|`active`|`archived`), `created_by` (FK trainer), `created_at`, `updated_at`.

### routine_exercises

Ejercicios dentro de una rutina, con orden.

- `id`, `routine_id` (FK, índice), `exercise_id` (FK), `position` (orden; se evita el nombre "order", palabra reservada en SQL), `sets`, `reps`, `duration_seconds` (opcional), `distance_meters` (opcional), `rest_seconds`, `notes`.

### routine_assignments

Asignación de una rutina a un socio.

- `id`, `routine_id` (FK, índice), `member_id` (FK, índice), `assigned_by` (FK trainer), `assigned_at`, `status` (`active`|`completed`|`cancelled`), `created_at`, `updated_at`.

### audit_logs

- `id`, `actor_user_id` (FK), `action` (ej. `payment.void`, `member.deactivate`, `role.change`), `entity_type`, `entity_id`, `metadata` (JSON, sin datos sensibles), `created_at`.
- Índice: `(entity_type, entity_id)`, `created_at`.

Reservado para fase posterior (no crear migraciones aún): `progress_entries`, `notifications`, `email_events`, `locations`.

## 7. Matriz de permisos

| Acción                        | Admin | Recepcionista                | Entrenador                          | Socio                             |
| ----------------------------- | ----- | ---------------------------- | ----------------------------------- | --------------------------------- |
| Ver lista de socios           | ✅    | ✅                           | Solo los asignados                  | ❌                                |
| Crear/editar socio            | ✅    | ✅                           | ❌                                  | Solo su propio perfil básico      |
| Desactivar socio              | ✅    | ❌                           | ❌                                  | ❌                                |
| Crear/renovar membresía       | ✅    | ✅ (solo al precio del plan) | ❌                                  | ❌                                |
| Ver estado de membresía       | ✅    | ✅                           | ❌ (salvo lo necesario para rutina) | Solo la propia                    |
| Registrar pago                | ✅    | ✅                           | ❌                                  | ❌                                |
| Anular pago                   | ✅    | ❌                           | ❌                                  | ❌                                |
| Ver reportes financieros      | ✅    | Limitado                     | ❌                                  | ❌                                |
| Registrar asistencia          | ✅    | ✅                           | ❌                                  | ❌ (o autoregistro futuro vía QR) |
| Ver asistencia propia         | ✅    | ✅                           | Solo asignados                      | Solo la propia                    |
| Crear/asignar rutina          | ✅    | ❌                           | ✅                                  | ❌                                |
| Ver rutina propia             | ✅    | ❌                           | Solo asignados                      | Solo la propia                    |
| Cambiar roles                 | ✅    | ❌                           | ❌                                  | ❌                                |
| Configurar datos del gimnasio | ✅    | ❌                           | ❌                                  | ❌                                |

Regla dura: toda fila se verifica en el Worker, nunca solo ocultando botones en el frontend.

## 8. Pantallas

**Compartidas**

- Login (Clerk).
- Estado de carga / error / sin conexión.

**Administrador / Recepcionista**

- Dashboard (socios activos, membresías por vencer/vencidas, asistencias del día, pagos del período).
- Lista de socios (búsqueda, paginación) → Detalle de socio (membresía, pagos, asistencia).
- Alta / edición de socio.
- Asignación y renovación de membresía.
- Registro de pago / historial de pagos / anulación.
- Registro de asistencia del día.

**Entrenador**

- Lista de socios asignados.
- Catálogo de ejercicios.
- Crear/editar rutina.
- Asignar rutina a socio.

**Socio**

- Mi membresía (estado, vencimiento).
- Mi asistencia (historial).
- Mi rutina.
- Mi perfil (datos básicos editables).

## 9. Endpoints (MVP)

| Método | Ruta                        | Roles                                                                                         |
| ------ | --------------------------- | --------------------------------------------------------------------------------------------- |
| GET    | /api/health                 | público                                                                                       |
| GET    | /api/members                | admin, receptionist, trainer (entrenador: búsqueda sin correo/teléfono, para asignar rutinas) |
| POST   | /api/members                | admin, receptionist                                                                           |
| GET    | /api/members/:id            | admin, receptionist, trainer (si asignado — implementado en Fase 8)                           |
| PATCH  | /api/members/:id            | admin, receptionist                                                                           |
| POST   | /api/members/:id/deactivate | admin                                                                                         |
| GET    | /api/membership-plans       | admin, receptionist                                                                           |
| POST   | /api/membership-plans       | admin (define precios y duración)                                                             |
| GET    | /api/memberships            | admin, receptionist                                                                           |
| GET    | /api/memberships/:id        | admin, receptionist                                                                           |
| POST   | /api/memberships            | admin, receptionist (precio distinto al del plan: solo admin)                                 |
| POST   | /api/memberships/:id/renew  | admin, receptionist (ídem)                                                                    |
| GET    | /api/payments               | admin, receptionist                                                                           |
| GET    | /api/payments/:id           | admin, receptionist                                                                           |
| GET    | /api/payments/summary       | admin (reporte agregado; recepcionista solo ve pagos individuales)                            |
| POST   | /api/payments               | admin, receptionist                                                                           |
| POST   | /api/payments/:id/void      | admin                                                                                         |
| GET    | /api/attendance             | admin, receptionist                                                                           |
| GET    | /api/attendance/summary     | admin, receptionist (resumen diario/mensual)                                                  |
| POST   | /api/attendance             | admin, receptionist                                                                           |
| GET    | /api/exercises              | admin, trainer                                                                                |
| POST   | /api/exercises              | admin, trainer                                                                                |
| GET    | /api/routines               | admin, trainer (entrenador ve solo las que creó)                                              |
| GET    | /api/routines/:id           | admin, trainer                                                                                |
| POST   | /api/routines               | admin, trainer                                                                                |
| POST   | /api/routines/:id/assign    | admin, trainer                                                                                |
| GET    | /api/me                     | cualquier usuario autenticado                                                                 |
| GET    | /api/me/membership          | member                                                                                        |
| GET    | /api/me/attendance          | member                                                                                        |
| GET    | /api/me/routine             | member                                                                                        |

Todas responden con el formato de error de CLAUDE.md sección 8 y aplican paginación en listas.

## 10. Riesgos

| Riesgo                                                                                          | Mitigación                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Confiar en rol/identidad enviados por el cliente                                                | Verificación de sesión y rol en cada request del Worker, con pruebas de acceso rechazado.                                                                              |
| Exceder límites del plan gratuito de D1/Workers/Clerk/Resend/Sentry                             | Sección 3.1 de CLAUDE.md: monitoreo consciente, paginación, consultas indexadas, alerta antes de acercarse al límite.                                                  |
| D1 no soporta transacciones interactivas tradicionales                                          | Diseñar operaciones multi-tabla como `db.batch()` desde el inicio (ej. crear pago + actualizar estado de membresía).                                                   |
| Errores de zona horaria en vencimientos de membresía                                            | Almacenamiento estricto en UTC + conversión solo en la capa de presentación usando `gym_settings.timezone`.                                                            |
| Registro de asistencia duplicado por doble clic o reintento de red                              | Índice compuesto `(member_id, checked_in_at)` + ventana de deduplicación en el Worker.                                                                                 |
| Pérdida de historial financiero por edición/borrado                                             | Prohibir DELETE físico en `payments` y `memberships`; solo anulación/nuevo registro + auditoría.                                                                       |
| Correo de vencimiento duplicado (el Cron Trigger corre más de una vez sobre la misma membresía) | Verificar `expiry_notice_sent_at IS NULL` antes de enviar y marcarlo en la misma operación (idealmente vía `db.batch()` con el registro de envío).                     |
| Exceder el límite diario/mensual del plan Free de Resend                                        | Con ~100 socios el volumen de avisos de vencimiento es bajo (a lo sumo unos pocos por día); igual se debe loguear el conteo y alertar si se acerca al límite del plan. |
| Filtración de datos de un socio a otro por caché o bug de autorización                          | Pruebas explícitas de "socio no puede ver a otro socio"; nunca cachear respuestas de `/api/me/*` de forma compartida.                                                  |
| Fuga de secretos (Clerk, Resend, Sentry)                                                        | Secretos solo como variables de entorno de Cloudflare; `.env.example` sin valores reales; nunca en Git.                                                                |

## 11. Criterios de aceptación (MVP)

El MVP se considera aceptable cuando, con datos ficticios:

1. El recorrido de extremo a extremo (sección 2) se ejecuta sin errores manuales.
2. Un socio autenticado no puede leer ni modificar datos de otro socio (verificado con prueba automatizada).
3. Un pago y una membresía no pueden eliminarse físicamente desde ningún endpoint.
4. Las fechas de vencimiento se calculan correctamente independientemente de la zona horaria del navegador del usuario.
5. Todas las pruebas de la sección 15 de CLAUDE.md pasan.
6. TypeScript estricto, linter y build pasan sin desactivar reglas.
7. Ningún secreto aparece en el repositorio ni en logs.
8. El uso de cada servicio permanece dentro de su plan gratuito (validado también para ~100 socios).
9. Un socio recibe el correo de membresía próxima a vencer una sola vez por vencimiento (sin duplicados), verificado con prueba automatizada.

## 12. Estrategia de pruebas

- **Vitest**: pruebas unitarias de validaciones Zod, reglas de negocio (cálculo de vencimiento, prevención de duplicados, idempotencia de pagos) y funciones puras del Worker.
- **Pruebas de autorización**: por cada endpoint protegido, al menos un caso "permitido" y uno "rechazado" por rol (matriz de la sección 7).
- **Playwright**: recorrido de extremo a extremo de la sección 2, ejecutado contra el entorno local/preview con datos ficticios.
- **Bruno**: colección versionada en el repo con una petición por endpoint, incluyendo casos de error esperados (401/403/404/422).
- **Idempotencia del aviso de vencimiento**: prueba que ejecuta el proceso del Cron Trigger dos veces sobre la misma membresía y confirma que Resend se invoca (o se simula) una sola vez.
- Ninguna prueba usa datos personales reales ni envía correos a destinatarios reales (modo de prueba/mock de Resend).

## 13. Estrategia de respaldo y reversión

- Migraciones D1 versionadas en el repositorio; nunca se modifica el esquema manualmente en producción.
- Antes de cualquier migración destructiva: exportar los datos afectados (`wrangler d1 export`), documentar el impacto y el paso de reversión concreto (migración inversa o restauración del export).
- Cada despliegue a producción se hace desde una revisión de Git identificable (tag o commit), de forma que revertir código sea `git revert` o desplegar el tag anterior.
- Los pagos y membresías, al no borrarse físicamente, son recuperables por diseño incluso sin restaurar un backup completo.
- No se automatiza `wrangler deploy` a producción; siempre requiere instrucción explícita (CLAUDE.md sección 14).

## 14. Preguntas o supuestos que deben resolverse

Resueltas por el usuario:

1. **Un solo gimnasio** (single-tenant). No se modela `locations` en el MVP.
2. **Moneda única: USD**, sin conversión de divisas.
3. **Interfaz solo en español.**
4. **Reglas de renovación de recepcionista**: decisión tomada en este plan (sección 4) — solo al precio vigente del plan; cualquier otro precio requiere Administrador. Se puede ajustar más adelante si el negocio lo requiere.
5. **Anulación de pagos: solo Administrador.**
6. **Ventana de duplicados de asistencia: 1 hora.**
7. **El aviso de membresía próxima a vencer sí envía correo** (Resend, plan Free), adelantado a la Fase 5 en vez de esperar a la Fase 9.
8. **Volumen esperado: ~100 socios.** Confirmado que cabe con amplio margen en los planes Free de Clerk (hasta 10,000 MAU), D1, R2, Resend (unos pocos correos de vencimiento por día frente a un límite de cientos/día) y Sentry. No se prevé riesgo de tope en el piloto.

Pendiente, con un valor por defecto ya asumido (ajustable si se indica lo contrario):

9. **¿Con cuántos días de anticipación se envía el aviso de vencimiento?** Se asumió **3 días antes** de `end_date` (ver sección 4 y campo `memberships.expiry_notice_sent_at`). Si se prefiere otro número (por ejemplo 5 o 7 días), es un cambio de una sola constante antes de implementar la Fase 5.

Ninguna pregunta restante bloquea el inicio de la Fase 1 (estructura base).
