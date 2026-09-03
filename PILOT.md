# Piloto (Fase 10)

Este documento define cómo se prueba la aplicación con un grupo controlado antes de
abrirla a todos los socios reales del gimnasio (CLAUDE.md sección 18).

## Documentos relacionados

- [`PRIVACY_POLICY.md`](./PRIVACY_POLICY.md) — borrador, pendiente de revisión legal.
- [`SUPPORT.md`](./SUPPORT.md) — a quién escribir si algo falla durante el piloto.
- [`db/BACKUP_AND_ROLLBACK.md`](./db/BACKUP_AND_ROLLBACK.md) — respaldo (incluye la
  rutina semanal para el piloto, sección 5).
- [`README.md`](./README.md) — estado técnico de cada módulo, fase por fase.

## Checklist antes de invitar al primer socio real

No usar datos reales de personas hasta marcar todo esto:

- [ ] El Worker está desplegado (`wrangler deploy`) — **no se ha hecho todavía**, sigue
      pendiente de instrucción explícita (CLAUDE.md sección 14).
- [ ] Los secretos de producción están configurados con `wrangler secret put`
      (`CLERK_SECRET_KEY`, `RESEND_API_KEY`, `SENTRY_DSN`) — **no se ha hecho
      todavía**, requiere el despliegue primero.
- [ ] Clerk está en modo de producción (no solo instancia de desarrollo) si se va a
      usar con socios reales — revisar en el dashboard de Clerk.
- [ ] Resend tiene un dominio propio verificado (`resend.com/domains`) — mientras use
      `onboarding@resend.dev`, los correos a socios reales **no se entregan** (ver
      README.md, sección de membresías).
- [ ] `PRIVACY_POLICY.md` fue revisado por un abogado y ya no dice "BORRADOR".
- [ ] Se definió quién es el/la administrador(a) real del gimnasio en el sistema (no
      la cuenta de prueba `admin@example.test` del seed).
- [ ] Se hizo un respaldo manual de la base antes de registrar al primer socio real
      (`db/BACKUP_AND_ROLLBACK.md` sección 5).

## Cómo se prueba (grupo controlado)

1. **Datos ficticios primero** — ya es como se ha trabajado durante todo el
   desarrollo (seed de `db/seeds/dev_seed.sql`, nunca datos reales en pruebas).
2. **Grupo controlado**: definir con el gimnasio cuántas personas participan en el
   piloto y por cuánto tiempo antes de decidir si se amplía — esto lo decide el
   negocio, no queda fijado aquí.
3. **Recopilar fallos y necesidades reales**: usar `SUPPORT.md` como canal único
   durante esta etapa. Cada problema reportado debería terminar en una de estas dos
   categorías:
   - Un bug → corregirlo, con su prueba correspondiente, antes de seguir ampliando.
   - Una función que falta y que el piloto reveló como necesaria → evaluarla como una
     fase nueva (no meterla a la fuerza en lo ya construido).
4. **No ampliar usuarios hasta que el recorrido principal funcione sin sobresaltos**
   para el grupo controlado (CLAUDE.md sección 2).

## Qué falta técnicamente para pasar de "piloto" a "uso general"

Esto es la lista honesta de lo que **no** está hecho todavía y sí se necesitaría antes
de abrir la app a todos los socios de un gimnasio real:

- Desplegar el Worker a producción (con revisión y aprobación explícitas).
- Verificar un dominio propio en Resend para que los correos lleguen a destinatarios
  reales.
- Revisión legal de `PRIVACY_POLICY.md` (y de `SUPPORT.md` si el volumen de soporte
  crece más allá de "un correo").
- Decidir si se necesita Turnstile (si en algún momento se agrega un formulario
  público) o R2 (si se agregan fotos de perfil/documentos) — ninguno de los dos tiene
  un caso de uso todavía.
- Confirmar que el volumen real de socios sigue dentro de los límites gratuitos de
  cada servicio (CLAUDE.md sección 3.1) — con ~100 socios hay margen amplio, pero
  vale la pena revisarlo si el gimnasio crece mucho más de lo estimado.
