# Copia de seguridad y reversión (D1)

Cloudflare D1 **no tiene "down migrations" automáticas**: `wrangler d1 migrations apply` solo aplica migraciones hacia adelante, en orden, y registra cuáles ya corrieron en la tabla interna `d1_migrations`. No existe un comando que deshaga la última migración. Por eso, para cualquier cambio de esquema —y sobre todo uno destructivo— el procedimiento es siempre: **respaldar antes, y si algo sale mal, revertir con una migración nueva o restaurando el respaldo.**

Esto aplica la regla de CLAUDE.md sección 7: antes de una migración destructiva, explicar qué datos pueden afectarse, cómo se respalda, cómo se revierte y qué pruebas se ejecutan.

## 1. Antes de aplicar una migración (local)

```bash
npm run db:migrate:local
```

Local no necesita respaldo previo porque los datos son ficticios (seed) y desechables: si algo sale mal, se borra `.wrangler/state` y se vuelve a migrar desde cero.

```bash
rm -rf .wrangler/state
npm run db:migrate:local
npm run db:seed:local
```

## 2. Antes de aplicar una migración remota (producción o preview)

**Nunca ejecutar esto sin revisión y autorización explícita (CLAUDE.md sección 14).**

1. Exportar un respaldo completo:

   ```bash
   npx wrangler d1 export app-gym-oferta-db --remote --output=./db/backups/pre_migration_$(date +%Y%m%d%H%M%S).sql
   ```

2. Revisar el contenido de la migración nueva y confirmar qué tablas/columnas/filas puede afectar.
3. Aplicar la migración:

   ```bash
   npx wrangler d1 migrations apply app-gym-oferta-db --remote
   ```

4. Verificar el resultado (consultas de sanity check, conteos de filas antes/después).

Los archivos de `./db/backups/` no se suben a git (ver `.gitignore`); son un respaldo local en el equipo de quien ejecuta el despliegue. Para un respaldo más duradero, copiar el archivo exportado a un lugar seguro fuera del repositorio (no a R2 en un bucket público).

## 3. Cómo revertir

### Si la migración remota falló a mitad de camino o el esquema quedó mal

- **No editar nunca una migración ya aplicada** (CLAUDE.md sección 7: nunca modificar el esquema manualmente en producción). En su lugar, crear una migración nueva con el número siguiente (ej. `0013_revert_x.sql`) que deshaga explícitamente el cambio (`DROP TABLE`, `ALTER TABLE ... DROP COLUMN`, etc., según corresponda).
- Si la migración nueva tampoco es viable (por ejemplo, ya se perdieron datos), restaurar desde el respaldo del paso 1:

  ```bash
  # En una base nueva o vaciando las tablas afectadas primero:
  npx wrangler d1 execute app-gym-oferta-db --remote --file=./db/backups/<archivo>.sql
  ```

  Restaurar un export completo sobre una base que ya tiene datos puede chocar con restricciones UNIQUE/PRIMARY KEY; en la práctica esto casi siempre significa restaurar sobre una base D1 nueva y volver a apuntar el binding, no sobre la misma base en caliente. Por eso el respaldo previo (paso 1) es la mitigación real, no la restauración en caliente.

### Pagos y membresías

Estos nunca se borran físicamente (`payments`, `memberships` — CLAUDE.md sección 6.3/6.4), así que son recuperables por diseño incluso sin restaurar un backup completo: una anulación o un estado histórico erróneo se corrige con una fila nueva o un `UPDATE` de estado, nunca con `DELETE`.

## 4. Qué pruebas ejecutar después de migrar

- `npm run db:migrate:local` sin errores.
- `npm run db:seed:local` sin errores (valida que las migraciones nuevas no rompen los `INSERT` del seed).
- Consultas de sanity check con `wrangler d1 execute ... --local --command "SELECT ..."` sobre las tablas afectadas.
- Cuando exista código de aplicación que use la tabla afectada: sus pruebas correspondientes (Vitest / Playwright, según PLAN.md sección 12).

## 5. Respaldo periódico durante el piloto (no solo antes de migrar)

Lo de arriba cubre respaldar antes de un cambio de esquema. Durante el piloto, con
socios reales usando la app día a día, hace falta además un respaldo **rutinario**
—independiente de si hay una migración o no— por si algo se corrompe por error humano
o un bug no relacionado con el esquema.

**Para el tamaño de este piloto (grupo controlado, ~100 socios), un respaldo manual
semanal es suficiente** — no se justifica construir todavía una tubería automatizada a
R2 (eso solo tiene sentido si el volumen de datos o el número de usuarios crece mucho
más; CLAUDE.md sección 3, "no añadir complejidad antes de necesitarla").

Rutina sugerida (quien administre el piloto, una vez por semana):

```bash
npx wrangler d1 export app-gym-oferta-db --remote --output=respaldo_$(date +%Y%m%d).sql
```

Guardar ese archivo fuera del repositorio, en un lugar con copia de seguridad propia
(ej. una carpeta de Google Drive/iCloud personal, **no** un repositorio público) —
contiene datos personales reales de socios, así que debe tratarse con el mismo
cuidado que cualquier otro documento sensible del gimnasio. Conservar al menos las
últimas 4 semanas; los más viejos se pueden borrar.

Si en algún momento el piloto crece lo suficiente para justificar automatizar esto,
la opción natural es un Cron Trigger adicional que arme un `SELECT *` de cada tabla y
lo guarde en R2 — en ese momento sí tendría un caso de uso real (ver README.md,
sección sobre Turnstile/R2 diferidos).
