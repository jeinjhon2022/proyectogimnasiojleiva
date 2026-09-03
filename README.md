# App Gym Oferta

PWA para administrar un gimnasio: socios, membresías, pagos manuales, asistencia, rutinas y panel administrativo.

Estado actual: **Fase 1 — estructura base**. Ver [`PLAN.md`](./PLAN.md) para el plan completo por fases y [`CLAUDE.md`](./CLAUDE.md) para las reglas del proyecto (stack, seguridad, restricciones de costo).

## Stack

React + Vite + TypeScript (estricto) + Tailwind CSS, con un único Cloudflare Worker que sirve tanto el frontend (assets estáticos) como la API (`/api/*`), vía [`@cloudflare/vite-plugin`](https://github.com/cloudflare/workers-sdk). Todo el proyecto está pensado para operar dentro de los planes gratuitos de cada servicio (ver `CLAUDE.md` sección 3.1).

## Requisitos

- Node.js 20+ (probado con Node 26).
- Cuenta de Cloudflare (gratuita) para desplegar — no necesaria para desarrollo local.

## Scripts

| Comando                | Qué hace                                                                                      |
| ---------------------- | --------------------------------------------------------------------------------------------- |
| `npm run dev`          | Levanta el servidor de desarrollo (frontend + Worker) con recarga en caliente.                |
| `npm run build`        | Genera el build de producción (`dist/`).                                                      |
| `npm run preview`      | Sirve el build de producción localmente.                                                      |
| `npm run deploy`       | Build + `wrangler deploy` (**requiere autorización explícita**; no ejecutar sin que se pida). |
| `npm run lint`         | Linter (ESLint).                                                                              |
| `npm run format`       | Formatea el código (Prettier).                                                                |
| `npm run format:check` | Verifica formato sin modificar archivos.                                                      |
| `npm run typecheck`    | Comprobación de tipos de TypeScript (frontend, Worker y config, por separado).                |
| `npm run test`         | Ejecuta las pruebas unitarias (Vitest).                                                       |

## Estructura

```
src/            Frontend (React)
worker/         API (Cloudflare Worker) — código y pruebas
wrangler.jsonc  Configuración de despliegue en Cloudflare
CLAUDE.md       Reglas del proyecto para trabajar con Claude Code
PLAN.md         Plan de implementación por fases, modelo de datos, permisos, riesgos
```

## Variables de entorno

Hay dos archivos de ejemplo, con una distinción importante de seguridad:

- [`.env.example`](./.env.example) → copiar a `.env`. Solo variables **públicas** que Vite expone al navegador (prefijo `VITE_`). Ahora mismo: `VITE_CLERK_PUBLISHABLE_KEY`.
- [`.dev.vars.example`](./.dev.vars.example) → copiar a `.dev.vars`. Secretos que **solo** ve el Worker en desarrollo local (nunca `VITE_`). Ahora mismo: `CLERK_SECRET_KEY`.

Ninguno de los dos (`.env`, `.dev.vars`) se sube a git. En remoto, los secretos se configuran con `wrangler secret put <NOMBRE>`, nunca en un archivo.

## Autenticación (Fase 3)

La app usa [Clerk](https://clerk.com) (plan Free) para identidad; el rol de cada usuario (`admin`/`receptionist`/`trainer`/`member`) se resuelve siempre en el Worker consultando la tabla `users` de D1 por `clerk_user_id` — nunca se confía en un rol enviado por el cliente (`CLAUDE.md` sección 5).

Para probarlo en local:

1. Crear una aplicación en Clerk (instancia de desarrollo) con **Email + Password** habilitado. Evitar el inicio de sesión por teléfono/SMS: tiene costo por uso incluso en el plan Free.
2. Copiar `.env.example` → `.env` y poner ahí la **Publishable key** (`pk_test_...`).
3. Copiar `.dev.vars.example` → `.dev.vars` y poner ahí la **Secret key** (`sk_test_...`).
4. `npm run dev`, crear una cuenta desde la pantalla de sign-in.
5. Como todavía no existe una pantalla para crear usuarios (llega en la Fase 4, módulo de socios), hay que enlazar manualmente esa cuenta de Clerk con una fila de `users` en D1. Copiar el "User ID" desde el dashboard de Clerk (Users → clic en el usuario, empieza con `user_...`) y ejecutar:

   ```bash
   npx wrangler d1 execute app-gym-oferta-db --local --command \
     "UPDATE users SET clerk_user_id = '<pega aquí el user id de Clerk>' WHERE id = 'user_admin_1';"
   ```

   Esto reutiliza la fila de administrador ficticia del seed (`db/seeds/dev_seed.sql`). Volver a iniciar sesión en la app: debería mostrar el perfil con rol "Administrador".

## Socios (Fase 4)

CRUD de socios (`/api/members`), visible en la app solo para `admin`/`receptionist` (el Worker vuelve a exigir el rol en cada request). Un socio nuevo se crea sin cuenta de Clerk todavía — su fila en `users` usa un `clerk_user_id` placeholder (`unclaimed:<id>`, ver `worker/users-repo.ts`). La primera vez que esa persona inicia sesión en Clerk con el mismo correo (ya verificado), `worker/authenticate.ts` la vincula automáticamente; no hace falta ningún paso manual para socios creados desde la Fase 4 en adelante (el paso manual de la sección anterior solo aplicó para la primera cuenta de administrador, creada antes de que existiera este módulo).

**Actualizado en Fase 8**: el entrenador ya puede buscar socios (`GET /api/members`, sin correo/teléfono) para elegir a quién asignar una rutina, y ver el detalle completo (`GET /api/members/:id`) solo de los socios que ya tiene asignados — ver sección de Rutinas más abajo.

## Membresías (Fase 5)

`membership_plans` (`/api/membership-plans`, solo Administrador crea) y `memberships` (`/api/memberships`, asignar/renovar). Reglas clave:

- Asignar o renovar al precio del plan: `admin` y `receptionist`. Fijar un precio distinto (`priceOverride`): solo `admin`.
- El estado (`pending`/`active`/`expired`) se calcula a partir de las fechas cada vez que se lee, en la zona horaria del gimnasio (`gym_settings.timezone`) — no depende de ningún job que lo mantenga actualizado. `suspended`/`cancelled` quedan reservados para una acción manual futura, sin endpoint todavía.
- `start_date`/`end_date` de una membresía son **fecha únicamente** (`YYYY-MM-DD`), a diferencia de `payment_date`/`checked_in_at` que sí son timestamp completo — una membresía vence un día calendario, no a una hora exacta.
- Renovar siempre crea una fila nueva (`renewed_from_id` apunta a la anterior); la membresía anterior nunca se modifica.

### Aviso de vencimiento por correo

`worker/jobs/expiry-notices.ts` corre diario vía Cron Trigger (`wrangler.jsonc`, 12:00 UTC) y también manualmente en `POST /api/membership-notices/run` (solo Administrador — útil para probar sin esperar al cron). Busca membresías que vencen dentro de `EXPIRY_NOTICE_WINDOW_DAYS` (3 días por defecto) y aún no tienen `expiry_notice_sent_at`, envía el correo por Resend y marca el envío (nunca se duplica).

**Importante — restricción real de Resend, verificada:** mientras se use el remitente de prueba `onboarding@resend.dev` (sin verificar un dominio propio), Resend **solo entrega a la dirección de correo con la que se creó la cuenta de Resend** — cualquier otro destinatario responde `403 validation_error`. Esto significa que, en este estado, los avisos reales a socios (con sus propios correos) **no se entregarán** hasta verificar un dominio propio en resend.com/domains y cambiar `FROM_ADDRESS` en `worker/resend.ts` a una dirección de ese dominio. El código y el cron ya están listos; falta ese paso cuando el gimnasio tenga un dominio propio.

## Pagos manuales (Fase 6)

`/api/payments`: registrar (`admin`/`receptionist`), anular (**solo `admin`**, con motivo obligatorio — nunca se borra un pago), listar, y `GET /api/payments/summary` (total y desglose por método, **solo `admin`** — acceso "limitado" de recepcionista a reportes financieros, PLAN.md sección 7).

- **Idempotencia real**: si se envía `idempotencyKey` y ya existe un pago con esa clave, se devuelve el pago existente (200) en vez de crear uno nuevo — protege contra reintentos de red duplicando un cobro. Verificado en vivo.
- Nunca se almacenan datos de tarjetas (número completo, CVV) — el método `card_in_person` solo registra que se cobró con tarjeta físicamente, nada más.
- UI: dentro de cada socio, botón "Pagos" muestra el historial reciente y un formulario de alta; "Anular" solo aparece para `admin`.

## Asistencia (Fase 7)

`/api/attendance` (registrar/listar, `admin`/`receptionist`), `/api/attendance/summary` (hoy y últimos 30 días), `/api/me/attendance` (el socio ve solo su propio historial — `memberId` nunca viene del cliente, siempre se resuelve desde la cuenta autenticada).

- **Prevención de duplicados verificada en vivo**: un segundo registro del mismo socio dentro de 1 hora responde `409 DUPLICATE_ATTENDANCE` en vez de crear una fila nueva.
- El registro de asistencia es inmutable (sin `updated_at`, sin edición ni borrado).
- UI: botón "Asistencia" dentro de cada socio (últimas visitas + registrar ahora); el panel de socios muestra el conteo de hoy y de los últimos 30 días.
- **Límite de esta verificación**: probé `GET /api/me/attendance` en su camino de error (cuenta sin perfil de socio → 404) contra la base real, pero no su camino de éxito con una cuenta de socio real logueada — eso está cubierto por pruebas automatizadas (mocks), no en vivo, porque hubiera requerido crear otra cuenta de Clerk.

## Rutinas (Fase 8) — cierra el recorrido MVP

`/api/exercises` (catálogo), `/api/routines` (crear con ejercicios anidados en un solo request, en el orden en que se envían), `/api/routines/:id/assign` — todo `admin`/`trainer`. Un entrenador solo ve sus propias rutinas en la lista (`admin` las ve todas).

- **Retrofit importante**: ahora que existe `routine_assignments`, el entrenador puede: (1) buscar socios vía `GET /api/members`, pero la respuesta le oculta `email`/`phone` (solo ve `id`, `memberCode`, `fullName`, `isActive`) — sin esto no tenía forma de encontrar a quién asignarle una rutina nueva; (2) ver el detalle completo de un socio (`GET /api/members/:id`) **solo si** ya tiene una rutina asignada con/por él (`isMemberAssignedToTrainer`, verificado con pruebas automatizadas).
- **Vacío que encontré y corregí sobre la marcha**: `GET /api/me/membership` estaba en `PLAN.md` desde la Fase 5 pero nunca lo implementé. Se agregó junto con esta fase.
- El socio ahora ve todo su recorrido en una sola vista (`src/member/MemberDashboard.tsx`): membresía, asistencia y rutina — completando el recorrido de extremo a extremo de `PLAN.md` sección 2.
- **Verificado en vivo**: creación de ejercicios, creación de rutina con 2 ejercicios (orden `position` correcto), rechazo de rutina sin ejercicios (422), asignación a un socio (confirmada en `routine_assignments`), y el camino de error de `GET /api/me/membership` y `GET /api/me/routine` (cuenta sin perfil de socio → 404).
- **Límite declarado**: no verifiqué en vivo el acceso de un entrenador real (rol `trainer`) ni el camino de éxito de las vistas de autoservicio del socio — habría requerido crear más cuentas de Clerk. Cubierto por pruebas automatizadas.

## PWA y correos restantes (Fase 9, parte 1)

**PWA completa**: `public/manifest.webmanifest`, `public/icon.svg` (placeholder — reemplazar por el logo real del gimnasio antes del piloto), `public/sw.js` (service worker mínimo: cachea el app shell con estrategia red-primero, **nunca cachea `/api/*`**, evitando el riesgo de mostrar datos privados desactualizados o de otro usuario). El SW solo se registra en build de producción (`import.meta.env.PROD`), nunca en `npm run dev`, para no romper el recargado en caliente de Vite. Se agregó también `OfflineBanner` (aviso visible cuando `navigator.onLine` es falso).

**Correos restantes de Resend** (`worker/emails.ts`): bienvenida (al crear un socio), confirmación de renovación, nueva rutina asignada — disparados desde sus rutas respectivas, siempre "best-effort" (`try/catch`: un fallo de correo nunca hace fallar la acción principal). Además, **membresía vencida**: nuevo job diario (`runExpiredNoticeJob`, mismo Cron Trigger que el aviso de vencimiento próximo) que revisa membresías vencidas en los últimos `EXPIRED_NOTICE_LOOKBACK_DAYS` (7) días y aún no notificadas — requirió una migración nueva (`0013`, `ALTER TABLE ... ADD COLUMN`, segura y directa, sin la complejidad de la Fase 5 con `NOT NULL`).

**Decisión técnica importante**: los correos "best-effort" se **esperan** (`await`) antes de responder, en vez de dispararse sin esperar — en Cloudflare Workers, una promesa no esperada y sin `ctx.waitUntil()` puede cancelarse en cuanto se envía la respuesta, así que "fire-and-forget" real habría sido poco confiable sin pasar `ctx` por toda la cadena de rutas.

**Verificado en vivo**: renové una membresía con el correo del socio de prueba apuntando temporalmente a una dirección real — la confirmación de renovación se entregó correctamente. Bienvenida y rutina asignada comparten el mismo código y patrón (probados con pruebas automatizadas, no en vivo individualmente, por la misma restricción de sandbox de Resend ya documentada).

**Pendiente de que confirmes**: la calidad de los 5 correos (contenido, tono) — son texto plano en HTML simple, sin diseño de marca.

## Sentry (Fase 9, parte 2)

Captura de errores en frontend (`@sentry/react`, con `ErrorBoundary` alrededor de la app) y Worker (`@sentry/cloudflare`, envuelve `fetch` y `scheduled` — captura también fallos del cron de avisos de membresía).

- **Nunca activo en desarrollo local a propósito**: el frontend solo inicializa Sentry en build de producción (`import.meta.env.PROD`); el Worker solo envía si `SENTRY_DSN` está configurado (`.dev.vars` lo deja vacío deliberadamente). Así los errores de `npm run dev` nunca ensucian el dashboard de Sentry.
- `sendDefaultPii: false` y `tracesSampleRate: 0` en ambos — solo errores, sin IP/datos de usuario ni trazas de performance por ahora (CLAUDE.md sección 10 y 12).
- El DSN **no es secreto** (está diseñado para ir en el bundle del navegador), pero se maneja con el mismo patrón que los demás por consistencia.
- **Pendiente para cuando se despliegue de verdad** (Fase 10): distinguir `environment` (`development`/`preview`/`production`) — por ahora está fijo en el código porque no existen todavía despliegues reales que distinguir.
- **No verificado en vivo**: como nada está desplegado, no hay forma de confirmar que un error real llegue al dashboard de Sentry hasta el primer deploy.

## Endpoint de salud

`GET /api/health` responde `{ "status": "ok", "timestamp": "<ISO 8601 UTC>" }`. Sirve para confirmar que el frontend y el Worker están correctamente conectados.

`GET /api/me` (protegido, requiere `Authorization: Bearer <token de sesión de Clerk>`) responde el perfil básico del usuario autenticado: `{ "id", "email", "fullName", "role" }`. `401` sin token o con token inválido; `403` si el token es válido pero no hay una fila correspondiente (o activa) en `users`.

## Base de datos (D1)

El esquema vive en `migrations/` (una tabla por archivo, numeradas). Todas las fechas se guardan en UTC como texto ISO 8601; `gym_settings.timezone` define la zona horaria del gimnasio solo para mostrar información. La moneda es única (USD).

```bash
npm run db:migrate:local   # aplica todas las migraciones pendientes a la base local
npm run db:seed:local      # carga datos ficticios de desarrollo (nunca datos reales)
```

`npm run db:migrate:remote` existe pero **no debe ejecutarse sin revisión y respaldo previos** — ver [`db/BACKUP_AND_ROLLBACK.md`](./db/BACKUP_AND_ROLLBACK.md). Ese mismo documento explica cómo revertir un cambio de esquema, ya que D1 no tiene "down migrations" automáticas.

**Actualizado en Fase 9**: la base real ya existe en Cloudflare (`wrangler.jsonc` tiene su `database_id` real) con las 13 migraciones aplicadas. El Worker **todavía no está desplegado** — la base real solo se creó y migró, sin `wrangler deploy`, a la espera de instrucción explícita para ese paso.
