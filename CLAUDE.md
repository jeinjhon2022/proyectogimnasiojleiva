# CLAUDE.md - Proyecto de aplicación para gimnasio

## 1. Propósito del proyecto

Este repositorio contiene una aplicación web progresiva, o PWA, para administrar un gimnasio.

La primera versión debe permitir:

1. Iniciar sesión de forma segura.
2. Registrar y administrar socios.
3. Administrar membresías y vencimientos.
4. Registrar pagos manuales.
5. Controlar asistencias.
6. Crear y asignar rutinas.
7. Mostrar un panel administrativo.
8. Permitir que cada socio consulte únicamente su propia información.

La aplicación debe funcionar correctamente en celulares y computadoras. Debe diseñarse primero para dispositivos móviles y poder instalarse como PWA desde el navegador.

No se desarrollarán inicialmente aplicaciones nativas separadas para Android e iOS.

---

## 2. Objetivo del MVP

El recorrido principal que debe funcionar de principio a fin es:

1. Un administrador inicia sesión.
2. Registra un socio.
3. Asigna una membresía al socio.
4. Registra un pago manual.
5. Registra una asistencia.
6. Consulta el estado y vencimiento de la membresía.
7. Un entrenador crea y asigna una rutina.
8. El socio inicia sesión y consulta su membresía, asistencia y rutina.

No implementar funciones adicionales hasta que este recorrido tenga pruebas y funcione correctamente.

---

## 3. Stack tecnológico

Utilizar preferentemente:

- React
- Vite
- TypeScript en modo estricto
- Tailwind CSS
- shadcn/ui para componentes reutilizables
- Lucide para iconos
- React Router para navegación
- Zod para validación
- Cloudflare Workers para backend y API
- Cloudflare D1 para base de datos SQL
- Cloudflare R2 para imágenes y documentos privados
- Clerk para autenticación y gestión de sesiones
- Cloudflare Turnstile para protección contra bots
- Resend para correos transaccionales
- Sentry para monitoreo de errores
- Wrangler para desarrollo y despliegue en Cloudflare
- GitHub para control de versiones
- GitHub Actions para verificaciones y despliegues controlados
- Vitest para pruebas unitarias
- Playwright para pruebas de los recorridos principales, cuando corresponda
- Bruno o archivos equivalentes versionables para probar la API

No añadir nuevas bibliotecas si una dependencia existente resuelve el problema adecuadamente.

Antes de añadir una dependencia:

1. Explicar para qué se necesita.
2. Verificar que sea compatible con Cloudflare Workers.
3. Evitar dependencias abandonadas o innecesariamente grandes.
4. Revisar su impacto en seguridad y tamaño del proyecto.

---

## 3.1 Restricciones de costo — todo gratuito por ahora

Mientras no se indique lo contrario de forma explícita, este proyecto debe operar **completamente dentro de los planes gratuitos** de cada servicio. No se trata solo de "elegir el plan free al crear la cuenta": ninguna decisión de diseño, migración o dependencia debe asumir ni requerir un plan de pago.

Límites de referencia a respetar (verificar la cifra vigente en el panel de cada proveedor antes de confiar en un número exacto, ya que cambian con el tiempo):

- **Cloudflare Workers**: plan Free — límite diario de solicitudes y de CPU time por invocación. No usar Durable Objects, colas (Queues) de pago ni funciones que el dashboard marque como "requiere plan pago".
- **Cloudflare D1**: plan Free — límite de almacenamiento total y de filas leídas/escritas por día. Diseñar consultas con índices para no desperdiciar cuota, y paginar siempre.
- **Cloudflare R2**: plan Free — límite de almacenamiento y de operaciones Clase A/B por mes. R2 no cobra egreso de datos incluso en el plan free, pero sí las operaciones y el almacenamiento por encima del umbral.
- **Cloudflare Turnstile**: gratuito sin límite relevante para este proyecto.
- **Clerk**: plan Free — límite de usuarios activos mensuales (MAU). Para un solo gimnasio en fase de piloto este límite no debería alcanzarse, pero si el número de socios activos se acerca al umbral del plan, detenerse y avisar al usuario en vez de habilitar el upgrade.
- **Resend**: plan Free — límite de correos por día y por mes. Los correos definidos en la sección 11 son pocos y de bajo volumen; si un módulo nuevo generara envíos masivos, detenerse y consultar antes de implementarlo.
- **Sentry**: plan Free/Developer — límite de eventos de error por mes y de integrantes de equipo. Suficiente para un solo desarrollador en el MVP.
- **GitHub**: repositorio privado con minutos de GitHub Actions limitados al mes en el plan free. Mantener los workflows de CI eficientes (cache de dependencias, evitar jobs redundantes) para no agotar la cuota.

Reglas:

- Ante cualquier elección entre una solución "ideal" que requiera un plan de pago y una alternativa gratuita razonable, elegir la alternativa gratuita y explicar la diferencia.
- Nunca ejecutar un upgrade de plan, activar un add-on de pago, ni introducir un servicio de terceros sin verificar primero que tiene un nivel gratuito suficiente.
- Si una función pedida por el usuario no es viable dentro de los límites gratuitos actuales, detenerse y explicarlo en vez de habilitar el plan de pago por cuenta propia.
- Monitorear de forma consciente el uso frente a estos límites (por ejemplo, evitar loops de reintentos, webhooks duplicados o consultas sin límite que consuman cuota gratuita innecesariamente).

---

## 4. Arquitectura general

La arquitectura esperada es:

Usuario
-> Aplicación React/PWA
-> Clerk identifica al usuario
-> Turnstile protege acciones públicas o sensibles
-> Cloudflare Worker procesa la API
-> El Worker verifica sesión, rol y permisos
-> Zod valida los datos recibidos
-> D1 almacena datos estructurados
-> R2 almacena imágenes o documentos
-> Resend envía correos transaccionales
-> Sentry recibe errores sanitizados

El frontend nunca debe conectarse directamente a D1 ni utilizar secretos privados.

Toda acción protegida debe pasar por el Worker.

---

## 5. Roles y permisos

La aplicación tendrá inicialmente estos roles:

### Administrador

Puede:

- Administrar usuarios y socios.
- Crear, modificar y desactivar membresías.
- Registrar pagos manuales.
- Consultar reportes.
- Registrar y consultar asistencias.
- Crear y asignar rutinas.
- Cambiar roles.
- Desactivar cuentas.
- Configurar datos generales del gimnasio.

### Recepcionista

Puede:

- Registrar y editar información básica de socios.
- Registrar pagos manuales.
- Crear o renovar membresías según las reglas autorizadas.
- Registrar asistencias.
- Consultar estados y vencimientos.

No puede:

- Cambiar roles.
- Modificar configuraciones de seguridad.
- Eliminar historiales financieros.
- Acceder a secretos o configuración del sistema.

### Entrenador

Puede:

- Consultar los socios que tenga permitido atender.
- Crear rutinas.
- Asignar y actualizar rutinas.
- Registrar observaciones relacionadas con el entrenamiento.
- Consultar el progreso necesario para preparar rutinas.

No puede:

- Administrar pagos.
- Cambiar roles.
- Consultar información financiera innecesaria.

### Socio

Puede:

- Consultar y actualizar información básica permitida de su perfil.
- Consultar el estado de su membresía.
- Consultar su historial de asistencia.
- Consultar su rutina.
- Registrar su progreso cuando esta función esté habilitada.

Un socio nunca puede consultar o modificar datos de otro socio.

### Reglas de autorización

- Nunca confiar en el rol enviado por el navegador.
- El Worker debe obtener y verificar la identidad y el rol mediante una fuente confiable.
- Ocultar botones en el frontend mejora la experiencia, pero no constituye seguridad.
- Cada endpoint protegido debe verificar autenticación y autorización.
- Las consultas a D1 deben restringirse según el usuario y el rol.
- Añadir pruebas para accesos permitidos y rechazados.

---

## 6. Módulos del MVP

### 6.1 Autenticación

- Inicio de sesión.
- Cierre de sesión.
- Recuperación segura de acceso mediante el proveedor.
- Perfil básico.
- Protección de rutas.
- Verificación de sesión en el Worker.
- Control de permisos por rol.

No programar un sistema propio de contraseñas en el MVP si Clerk puede resolverlo.

### 6.2 Socios

- Lista paginada.
- Búsqueda por nombre, correo, teléfono o código de socio.
- Registro.
- Edición.
- Activación y desactivación.
- Vista de detalle.
- Estado de membresía.
- Fecha de inscripción.
- Contacto básico.
- Registro de auditoría para cambios importantes.

No eliminar físicamente socios que tengan pagos, membresías o asistencias relacionadas.

### 6.3 Membresías

- Tipos de membresía.
- Fecha de inicio.
- Fecha de vencimiento.
- Precio acordado.
- Estado: pendiente, activa, vencida, suspendida o cancelada.
- Renovación.
- Historial de membresías.
- Avisos próximos al vencimiento.

No sobrescribir una membresía histórica durante una renovación. Crear el registro correspondiente y conservar el historial.

### 6.4 Pagos manuales

Métodos iniciales:

- Efectivo.
- Transferencia.
- Tarjeta procesada físicamente en el establecimiento.
- Otro método definido por el administrador.

Registrar:

- Socio.
- Membresía relacionada.
- Importe.
- Moneda.
- Método.
- Fecha.
- Referencia opcional.
- Usuario que registró el pago.
- Estado.
- Observación.

No almacenar:

- Números completos de tarjetas.
- Códigos CVV.
- Credenciales bancarias.
- Imágenes de tarjetas.

Los pagos no deben eliminarse físicamente. Una corrección se realiza mediante anulación o ajuste con motivo, fecha y usuario responsable.

### 6.5 Asistencia

- Registro manual.
- Registro mediante QR en una fase posterior o cuando el flujo manual sea estable.
- Fecha y hora.
- Socio.
- Punto o dispositivo de registro, si aplica.
- Usuario responsable cuando sea manual.
- Prevención razonable de duplicados accidentales.
- Historial por socio.
- Resumen diario y mensual.

El QR no debe contener datos personales. Debe contener un identificador opaco o token verificable.

### 6.6 Rutinas

- Catálogo de ejercicios.
- Creación de rutinas.
- Asignación a socios.
- Series.
- Repeticiones.
- Tiempo o distancia cuando corresponda.
- Descanso.
- Notas técnicas.
- Orden de ejercicios.
- Estado de la rutina.
- Fecha de asignación.
- Historial de cambios importantes.

Evitar instrucciones médicas o recomendaciones que excedan la función administrativa de la aplicación.

### 6.7 Panel administrativo

Mostrar inicialmente:

- Socios activos.
- Membresías por vencer.
- Membresías vencidas.
- Asistencias del día.
- Pagos registrados en el período seleccionado.
- Accesos rápidos a socios, membresías, pagos y asistencia.

Las cifras del panel deben provenir del backend y respetar permisos.

---

## 7. Modelo inicial de datos

Crear migraciones SQL para las entidades necesarias. El modelo puede incluir:

- users
- members
- membership_plans
- memberships
- payments
- attendance
- routines
- exercises
- routine_exercises
- routine_assignments
- audit_logs
- gym_settings (mínimo desde la Fase 2, aunque sea un único registro; ver regla de zona horaria abajo)

En una fase posterior se puede incluir:

- progress_entries
- notifications
- email_events
- locations

### Reglas para el esquema

- Utilizar claves primarias estables.
- Utilizar claves foráneas cuando D1 y el diseño lo permitan.
- Añadir índices en campos usados para búsqueda, relaciones, estados y fechas.
- Utilizar restricciones para valores obligatorios y estados permitidos.
- Evitar almacenar información duplicada sin justificación.
- Estrategia de fechas y zonas horarias (obligatoria desde el inicio, no queda abierta): almacenar siempre en UTC, en columnas de tipo timestamp/ISO 8601. `gym_settings.timezone` guarda la zona horaria del gimnasio (por ejemplo "America/Bogota"); la conversión a hora local ocurre únicamente al mostrar información (frontend o al construir una respuesta), nunca al almacenar.
- Guardar fechas de auditoría como created_at y updated_at.
- Considerar created_by y updated_by en operaciones sensibles.
- No utilizar datos personales reales en seeds, fixtures o pruebas.
- Utilizar transacciones cuando una operación afecte múltiples registros relacionados. En Cloudflare D1 esto se implementa mediante sentencias por lotes (`db.batch()`), ya que D1 no soporta `BEGIN`/`COMMIT` interactivo de múltiples sentencias; diseñar cada operación multi-registro como un batch atómico desde el principio.
- Nunca modificar el esquema manualmente en producción. Usar migraciones.

Antes de crear una migración destructiva, detenerse y explicar:

1. Qué datos pueden afectarse.
2. Cómo se hará una copia de seguridad.
3. Cómo se revertirá el cambio.
4. Qué pruebas se ejecutarán.

---

## 8. Diseño de API

Utilizar rutas consistentes, versionables y protegidas.

Ejemplos conceptuales:

GET /api/health
GET /api/members
POST /api/members
GET /api/members/:id
PATCH /api/members/:id
POST /api/members/:id/deactivate
GET /api/memberships
POST /api/memberships
POST /api/memberships/:id/renew
GET /api/payments
POST /api/payments
POST /api/payments/:id/void
GET /api/attendance
POST /api/attendance
GET /api/routines
POST /api/routines
POST /api/routines/:id/assign
GET /api/me
GET /api/me/membership
GET /api/me/attendance
GET /api/me/routine

### Reglas para endpoints

- Validar parámetros, query strings y cuerpos con Zod.
- Responder con códigos HTTP correctos.
- Usar un formato consistente de errores.
- No devolver trazas internas ni detalles sensibles.
- Implementar paginación y límites.
- Evitar consultas o exportaciones sin límite.
- Verificar propiedad del recurso para endpoints de socios.
- Registrar auditoría en operaciones financieras o administrativas importantes.
- Considerar idempotencia en pagos, renovaciones y asistencias.
- Añadir protección contra abuso donde corresponda.

Formato sugerido de error:

{
"error": {
"code": "MEMBER_NOT_FOUND",
"message": "No se encontró el socio solicitado",
"requestId": "identificador-de-solicitud"
}
}

No incluir información confidencial en el mensaje.

---

## 9. PWA y experiencia móvil

La aplicación debe:

- Tener manifiesto web.
- Tener iconos adecuados.
- Ser instalable cuando sea posible.
- Funcionar correctamente en pantallas pequeñas.
- Mostrar estados de carga, error, éxito y ausencia de resultados.
- Tener formularios accesibles.
- Mantener controles táctiles con tamaño suficiente.
- Mostrar confirmaciones antes de acciones sensibles.
- Gestionar de manera clara la pérdida de conexión.

No implementar modo offline para pagos, cambios de membresía o acciones financieras sin un diseño específico de sincronización e idempotencia.

Puede permitirse lectura limitada en caché de contenido no sensible, pero nunca mostrar datos privados de otro usuario por errores de caché.

---

## 10. Seguridad obligatoria

### Secretos

- Nunca escribir secretos directamente en el código.
- Nunca guardar secretos en Git.
- Utilizar secretos de Cloudflare o variables de entorno apropiadas.
- Mantener un archivo .env.example sin valores reales.
- Añadir archivos locales sensibles a .gitignore.
- No mostrar secretos en logs, capturas, errores o documentación pública.

Variables conceptuales:

CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
RESEND_API_KEY=
SENTRY_DSN=
TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=

El nombre exacto debe adecuarse a la integración utilizada.

### Validación

- Validar datos en el frontend para mejorar la experiencia.
- Volver a validar todos los datos en el Worker.
- No confiar en identificadores, precios, roles o fechas calculados únicamente en el navegador.
- Normalizar correos, teléfonos y cadenas cuando corresponda.
- Limitar tamaños de archivos y textos.

### Autenticación y sesiones

- Preferir cookies seguras o mecanismos oficiales del proveedor.
- Verificar emisor, audiencia, firma y vigencia de tokens según la documentación del proveedor.
- No guardar tokens sensibles en lugares inseguros si existe una alternativa más segura.
- Implementar cierre de sesión y revocación según lo permita el proveedor.
- No crear autenticación casera para el MVP.
- Mantenerse dentro del plan Free de Clerk (ver sección 3.1); si el proyecto se acerca al límite de usuarios activos mensuales del plan gratuito, detenerse y avisar antes de que ocurra un cobro o una degradación del servicio.

### Archivos en R2

- Las fotos de perfil, progreso y documentos privados no deben ser públicos por defecto.
- El Worker debe verificar identidad y permisos antes de entregar archivos privados.
- Utilizar URLs temporales o descargas autorizadas cuando corresponda.
- Validar tipo real, extensión y tamaño de archivos.
- Generar nombres internos que no revelen datos personales.

### Turnstile

- Utilizar Turnstile en formularios públicos o acciones expuestas a bots.
- La validación visual del frontend no es suficiente.
- Verificar siempre el token en el Worker antes de aceptar la operación.
- No exponer la clave secreta en el navegador.

### Registros y monitoreo

- No registrar contraseñas.
- No registrar tokens completos.
- No registrar datos de tarjetas.
- Evitar enviar datos personales innecesarios a Sentry.
- Sanitizar errores antes de enviarlos a servicios externos.
- Utilizar identificadores internos o seudónimos cuando sea posible.

### Datos personales

Recopilar únicamente la información necesaria para operar el gimnasio.

No añadir información médica detallada, documentos de identidad, fotografías de progreso u otros datos sensibles sin:

- Justificación funcional.
- Consentimiento adecuado.
- Controles de acceso.
- Política de retención.
- Posibilidad de corrección o eliminación cuando legalmente corresponda.
- Revisión de las obligaciones de privacidad aplicables al negocio.

---

## 11. Correos con Resend

Agregar correos únicamente después de que el módulo relacionado funcione correctamente.

Correos iniciales permitidos:

- Bienvenida.
- Confirmación de renovación.
- Membresía próxima a vencer.
- Membresía vencida.
- Nueva rutina asignada.

Reglas:

- No enviar correos durante pruebas a destinatarios reales.
- Utilizar una dirección o modo seguro de prueba.
- Evitar duplicados mediante registros o claves de idempotencia.
- Incluir información mínima necesaria.
- No incluir información financiera sensible.
- Registrar entregas y errores sin guardar contenido privado innecesario.
- Separar correos transaccionales de marketing.
- No enviar marketing sin consentimiento y mecanismo de cancelación adecuado.
- Mantenerse dentro del límite diario/mensual del plan Free de Resend (ver sección 3.1).

---

## 12. Sentry y observabilidad

Integrar Sentry cuando exista una primera versión funcional.

Configurar:

- Captura de errores del frontend.
- Captura de errores del Worker cuando sea compatible.
- Identificador de versión o release.
- Entorno: development, preview o production.
- Sanitización de datos personales.
- Muestreo razonable.

Cada solicitud importante debe poder relacionarse con un requestId sin exponer información privada.

No considerar resuelto un error únicamente porque desapareció de la pantalla. Revisar logs, reproducirlo y añadir una prueba cuando corresponda.

Mantener el volumen de eventos dentro del límite del plan Free de Sentry (ver sección 3.1); usar muestreo si es necesario para no excederlo.

---

## 13. Flujo de trabajo con Git

Ramas sugeridas:

- main: producción estable.
- develop: integración y pruebas.
- feature/nombre: función específica.
- fix/nombre: corrección específica.

Reglas:

- No trabajar directamente en main salvo una corrección controlada y justificada.
- Hacer commits pequeños y descriptivos.
- No incluir secretos ni archivos generados innecesarios.
- Ejecutar verificaciones antes de fusionar cambios.
- No usar git push --force sin una instrucción explícita y una justificación.
- No usar git reset --hard sin explicar qué se perderá.
- No borrar ramas o etiquetas sin autorización.
- Mantener los workflows de GitHub Actions eficientes (cache de dependencias, jobs necesarios únicamente) para no agotar los minutos incluidos en el plan Free (ver sección 3.1).

Formato sugerido de commits:

feat: agrega registro de socios
fix: evita asistencia duplicada
security: valida permisos en pagos
refactor: centraliza manejo de errores
chore: actualiza configuración de pruebas

---

## 14. Despliegues y entornos

Mantener al menos:

- Desarrollo local.
- Preview o pruebas.
- Producción.

Reglas:

- No desplegar en producción sin instrucción explícita.
- No aplicar migraciones de producción automáticamente sin revisar su impacto.
- Las variables y bases de datos de desarrollo no deben mezclarse con producción.
- Utilizar datos ficticios en desarrollo.
- Ejecutar pruebas, linter, comprobación de tipos y build antes de publicar.
- Documentar los pasos de reversión.
- Conservar una versión estable anterior.
- Mantener todos los entornos dentro de los planes gratuitos descritos en la sección 3.1.

Nunca ejecutar automáticamente sin revisión:

- wrangler deploy a producción.
- DROP TABLE.
- DELETE sin condición.
- migraciones destructivas.
- git push --force.
- rm -rf sobre directorios del proyecto.
- rotación o eliminación de secretos.
- activación de un plan de pago o add-on en cualquier proveedor.

---

## 15. Pruebas mínimas

Añadir pruebas enfocadas en comportamiento y seguridad.

### Autenticación y permisos

- Usuario no autenticado recibe rechazo.
- Socio puede consultar su información.
- Socio no puede consultar información de otro socio.
- Entrenador no puede registrar pagos.
- Recepcionista no puede cambiar roles.
- Administrador puede ejecutar acciones autorizadas.

### Socios

- Creación con datos válidos.
- Rechazo de datos inválidos.
- Búsqueda y paginación.
- Desactivación sin pérdida de historial.

### Membresías

- Fechas válidas.
- Renovación conserva historial.
- Detección de membresía vencida.
- Rechazo de precios negativos.

### Pagos

- Registro válido.
- Rechazo de cantidades negativas o cero cuando no correspondan.
- Prevención de duplicados mediante idempotencia.
- Anulación conserva el registro original.
- Auditoría del usuario responsable.

### Asistencia

- Registro válido.
- Prevención de duplicados accidentales.
- Rechazo para socio inexistente o inactivo según las reglas del negocio.

### Rutinas

- Creación y asignación.
- Socio consulta únicamente su rutina.
- Entrenador accede solo a la información permitida.

### Recorrido de extremo a extremo

1. Administrador inicia sesión.
2. Crea socio.
3. Asigna membresía.
4. Registra pago.
5. Registra asistencia.
6. Asigna rutina.
7. Socio inicia sesión y consulta sus datos.

---

## 16. Criterios de calidad

- TypeScript estricto.
- Evitar any; si es inevitable, justificarlo.
- Componentes pequeños y enfocados.
- Evitar duplicación de lógica.
- Separar lógica de presentación, negocio y acceso a datos.
- Manejar errores de forma consistente.
- Usar nombres descriptivos.
- Añadir comentarios solo cuando expliquen decisiones, no código obvio.
- Mantener accesibilidad básica.
- Diseñar primero para celular.
- Evitar consultas N+1 o lecturas innecesarias.
- Paginar listas.
- No devolver campos que el consumidor no necesita.
- Mantener README y documentación actualizados.

---

## 17. Procedimiento de Claude Code para cada tarea

Antes de modificar archivos:

1. Leer este archivo completo.
2. Leer PLAN.md, README.md y la documentación relacionada.
3. Revisar el estado de Git.
4. Inspeccionar la implementación existente.
5. Identificar los archivos que podrían cambiar.
6. Explicar brevemente el plan.
7. Señalar riesgos, migraciones o decisiones de seguridad.

Durante la implementación:

1. Trabajar en una sola función o módulo por tarea.
2. Realizar cambios pequeños y coherentes.
3. No reescribir archivos no relacionados.
4. No cambiar el stack sin justificarlo.
5. No eliminar funcionalidad existente para ocultar errores.
6. No desactivar TypeScript, linter o pruebas para conseguir que el build pase.
7. No utilizar datos reales.

Al finalizar:

1. Ejecutar pruebas relacionadas.
2. Ejecutar todas las pruebas cuando sea razonable.
3. Ejecutar comprobación de tipos.
4. Ejecutar linter.
5. Ejecutar build.
6. Revisar git diff.
7. Resumir los archivos modificados.
8. Explicar decisiones importantes.
9. Informar pruebas ejecutadas y resultados.
10. Indicar riesgos, supuestos y tareas pendientes.
11. No desplegar ni hacer push sin instrucción explícita.

Si alguna verificación falla:

- No afirmar que la tarea está terminada.
- Explicar el fallo.
- Corregirlo si pertenece al alcance.
- Si no pertenece al alcance, documentarlo claramente.

---

## 18. Plan de implementación por fases

### Fase 0: descubrimiento

Crear o actualizar PLAN.md con:

- Objetivos.
- Alcance del MVP.
- Usuarios.
- Reglas del negocio.
- Arquitectura.
- Modelo de datos.
- Matriz de permisos.
- Pantallas.
- Endpoints.
- Riesgos.
- Criterios de aceptación.

No escribir la aplicación hasta revisar el plan.

### Fase 1: estructura base

Configurar:

- React.
- Vite.
- TypeScript.
- Tailwind CSS.
- Cloudflare Workers.
- Wrangler.
- ESLint y formato.
- Vitest.
- README.md.
- .env.example.
- Endpoint GET /api/health.
- Página inicial sencilla.

No implementar todavía todos los módulos.

### Fase 2: D1 y esquema

- Diseñar las tablas, incluyendo gym_settings con la zona horaria del gimnasio.
- Crear migraciones SQL.
- Crear índices.
- Añadir seeds ficticios solo para desarrollo.
- Probar migraciones localmente.
- Documentar copia de seguridad y reversión.

### Fase 3: autenticación y roles

- Integrar Clerk (plan Free).
- Proteger rutas del frontend.
- Verificar sesión en el Worker.
- Implementar política de permisos.
- Añadir pruebas de autorización.
- No confiar solo en el frontend.

### Fase 4: módulo de socios

- Lista.
- Búsqueda.
- Paginación.
- Alta.
- Edición.
- Desactivación.
- Detalle.
- Validaciones.
- Permisos.
- Pruebas.

### Fase 5: membresías

- Planes.
- Asignación.
- Fechas.
- Estado.
- Renovación (recepcionista solo al precio vigente del plan; cambios de precio requieren Administrador).
- Vencimientos.
- Historial.
- Aviso de vencimiento próximo por correo (Resend, plan Free) — único correo del MVP; se adelanta desde la Fase 9 porque es un requisito confirmado del MVP, no un servicio adicional.
- Pruebas (incluida la prueba de que el aviso no se duplica).

### Fase 6: pagos manuales

- Registro.
- Métodos.
- Referencias.
- Auditoría.
- Anulación.
- Idempotencia.
- Reportes básicos.
- Pruebas.

### Fase 7: asistencia

- Registro manual.
- Prevención de duplicados.
- Historial.
- Resúmenes.
- QR posteriormente.
- Pruebas.

### Fase 8: rutinas

- Ejercicios.
- Rutinas.
- Asignaciones.
- Vista del entrenador.
- Vista del socio.
- Pruebas.

### Fase 9: servicios adicionales

Después de estabilizar los módulos principales:

- Turnstile.
- Resend (correos restantes: bienvenida, confirmación de renovación, membresía vencida, nueva rutina asignada; el aviso de vencimiento próximo ya se integró en la Fase 5).
- Sentry.
- R2.
- PWA completa.
- GitHub Actions.

Todos dentro de sus respectivos planes gratuitos (ver sección 3.1).

### Fase 10: piloto

- Usar datos ficticios primero.
- Probar con un grupo controlado.
- Recopilar fallos y necesidades reales.
- Corregir problemas antes de ampliar usuarios.
- Definir respaldo, soporte y política de privacidad antes del uso general.
- Antes de ampliar el número de usuarios reales, verificar que se sigue dentro de los límites gratuitos de todos los servicios (sección 3.1).

---

## 19. Funciones fuera del alcance inicial

No implementar en el MVP salvo instrucción explícita:

- Pagos en línea con tarjeta.
- Almacenamiento de datos de tarjetas.
- Reconocimiento facial.
- Control biométrico.
- Integración con torniquetes.
- Aplicaciones nativas separadas.
- Integraciones con relojes inteligentes.
- Recomendaciones médicas.
- Planes nutricionales automáticos.
- Inteligencia artificial para prescribir rutinas.
- Contabilidad completa.
- Nómina.
- Inventario complejo.
- Chat en tiempo real.
- WhatsApp Business API.
- Notificaciones push avanzadas.
- Modo offline para acciones financieras.
- Cualquier servicio o plan que tenga costo (ver sección 3.1).

Estas funciones requieren análisis, costos y controles adicionales.

---

## 20. Prompt inicial para planificación

Usar este texto como primera tarea si PLAN.md no existe:

Quiero construir una aplicación web progresiva para administrar un gimnasio.

El stack principal será React, Vite, TypeScript, Tailwind CSS, Cloudflare Workers, Cloudflare D1, Cloudflare R2, Clerk, Turnstile, Zod, Resend, Sentry y GitHub, todos en sus planes gratuitos.

Los roles serán administrador, recepcionista, entrenador y socio.

La primera versión tendrá inicio de sesión, registro y edición de socios, membresías, pagos manuales, control de asistencia, rutinas y panel administrativo.

Primero analiza los requisitos y crea PLAN.md. No escribas todavía la aplicación, no instales dependencias, no despliegues y no modifiques archivos no relacionados.

Incluye en PLAN.md:

- Arquitectura.
- Módulos.
- Modelo de datos.
- Matriz de permisos.
- Rutas de API.
- Pantallas.
- Riesgos de seguridad y privacidad.
- Orden de implementación.
- Criterios de aceptación.
- Estrategia de pruebas.
- Estrategia de respaldo y reversión.
- Preguntas o supuestos que deban resolverse.

---

## 21. Plantilla para solicitar cada módulo

Usar y adaptar esta plantilla:

Lee CLAUDE.md, PLAN.md y el código actual.

Implementa únicamente el módulo de [NOMBRE DEL MODULO].

Alcance:

- [FUNCION 1]
- [FUNCION 2]
- [FUNCION 3]

Requisitos:

- Validación de frontend y backend con Zod.
- Autenticación y permisos verificados en el Worker.
- Diseño adaptable para celular.
- Estados de carga, error, éxito y ausencia de datos.
- Paginación cuando corresponda.
- Auditoría para acciones sensibles.
- Pruebas unitarias y de permisos.
- No usar datos personales reales.
- No modificar módulos no relacionados.
- No desplegar en producción.

Antes de modificar, presenta un plan breve y señala cualquier migración o riesgo.

Al terminar:

1. Ejecuta pruebas.
2. Ejecuta comprobación de tipos.
3. Ejecuta linter.
4. Ejecuta build.
5. Revisa git diff.
6. Resume archivos modificados.
7. Informa resultados y tareas pendientes.

---

## 22. Definición de terminado

Una función no se considera terminada hasta que:

- Cumple sus criterios de aceptación.
- Tiene validación de servidor.
- Tiene autorización de servidor.
- Maneja errores y estados de interfaz.
- Funciona en celular y computadora.
- Tiene pruebas razonables.
- Pasa comprobación de tipos.
- Pasa linter.
- Pasa build.
- No expone secretos.
- No introduce datos reales en pruebas.
- Está documentada.
- No introduce ni requiere un plan de pago en ningún servicio.
- El resumen final declara cualquier limitación conocida.

---

## 23. Prioridad de decisiones

Cuando existan varias soluciones, priorizar en este orden:

1. Seguridad y privacidad.
2. Integridad de datos.
3. Claridad y facilidad de mantenimiento.
4. Experiencia del usuario.
5. Compatibilidad con Cloudflare.
6. Facilidad de pruebas.
7. Rendimiento suficiente para el MVP.
8. Costo cero: mantenerse dentro de los planes gratuitos de cada servicio (sección 3.1). Nunca habilitar un plan de pago, upgrade o funcionalidad que lo requiera sin autorización explícita del usuario.
9. Rapidez de implementación.

No sacrificar seguridad o integridad de datos para terminar más rápido. Tampoco sacrificar la restricción de costo cero para ganar rapidez o comodidad: ante la duda, detenerse y preguntar antes de asumir un gasto.
