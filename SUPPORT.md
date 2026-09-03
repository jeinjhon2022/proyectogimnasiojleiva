# Soporte durante el piloto

Este documento define qué pasa cuando algo falla mientras el gimnasio prueba la
aplicación con un grupo controlado, antes de abrirla a todos los socios (CLAUDE.md
sección 18, Fase 10).

## Contacto

Durante el piloto, todo reporte de problema pasa por:

**john.jairo.leiva@gmail.com**

No hay todavía un canal de soporte separado (chat, WhatsApp, formulario) — para el
tamaño del piloto (grupo controlado, no todos los socios) un solo correo es
suficiente. Si el piloto se amplía, esto debería revisarse.

## Qué reportar

Cuando algo no funcione, pedir siempre:

1. Qué se intentaba hacer (ej. "registrar un pago", "ver mi rutina").
2. Qué pasó en vez de lo esperado (mensaje de error exacto si lo hay).
3. Con qué rol se estaba (administrador, recepción, entrenador, socio).
4. Fecha y hora aproximada.

Esto es lo mínimo para poder reproducir el problema y revisar los registros de Sentry
correspondientes a ese momento.

## Expectativa de respuesta (informal, solo para el piloto)

- Algo que bloquea completamente el uso (no se puede iniciar sesión, no se puede
  registrar un pago): mejor esfuerzo el mismo día.
- Todo lo demás: sin plazo formal durante el piloto — se prioriza según impacto.

Esto es deliberadamente informal porque es un piloto con datos ficticios/grupo
controlado. Antes de abrir la app a todos los socios, esta sección debería
convertirse en un compromiso de soporte real (con plazos y, probablemente, más de una
persona respondiendo).

## Antes de escalar un problema

1. Confirmar si el problema es reproducible (¿pasa siempre, o solo una vez?).
2. Revisar Sentry (dashboard del proyecto) para ver si el error ya quedó registrado
   con más contexto técnico.
3. Si el problema involucra datos que parecen incorrectos o perdidos, **no intentar
   corregirlo manualmente en la base de datos** sin antes respaldarla — ver
   [`db/BACKUP_AND_ROLLBACK.md`](./db/BACKUP_AND_ROLLBACK.md).

## Qué NO hacer durante el piloto

- No registrar socios reales cuyo consentimiento de privacidad no se haya resuelto
  todavía (ver [`PRIVACY_POLICY.md`](./PRIVACY_POLICY.md) — sigue siendo un borrador).
- No compartir credenciales de administrador con el grupo de prueba; cada persona
  debe tener su propia cuenta y rol.
- No desplegar cambios de código sin correr la verificación completa (`npm run
typecheck && npm run lint && npm run test && npm run build`) — el CI de GitHub
  Actions ya lo hace automáticamente en cada push, pero conviene confirmarlo antes de
  decirle a alguien del piloto "ya está arreglado".
