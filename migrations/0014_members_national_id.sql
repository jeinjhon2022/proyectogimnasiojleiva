-- Cédula/DNI del socio, para el check-in de kiosco (buscar por identificación en vez
-- de elegirlo de una lista). Columna nueva, nullable: no afecta socios existentes.
-- Única solo cuando no es NULL (un socio puede no tener el dato cargado todavía).
ALTER TABLE members ADD COLUMN national_id TEXT;

CREATE UNIQUE INDEX idx_members_national_id ON members(national_id) WHERE national_id IS NOT NULL;
