-- Nivel de dificultad del ejercicio, para poder ordenar/agrupar el catálogo y armar
-- rutinas apropiadas para cada socio. Nullable: los ejercicios existentes sin nivel
-- simplemente no se agrupan bajo ninguno ("Sin nivel") en vez de romper.
ALTER TABLE exercises ADD COLUMN level TEXT CHECK (level IS NULL OR level IN ('beginner', 'intermediate', 'advanced'));
