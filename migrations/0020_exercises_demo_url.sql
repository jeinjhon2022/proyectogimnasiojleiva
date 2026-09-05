-- Enlace de demostración (GIF/video corto) para que el socio vea cómo hacer el
-- ejercicio al abrir su rutina. Columna nueva, nullable: no afecta ejercicios
-- existentes. Deliberadamente un enlace (YouTube, o un archivo propio subido a
-- Cloudflare R2) y no generación de imágenes con IA — eso tendría costo real y no está
-- en el stack aprobado (CLAUDE.md sección 3.1).
ALTER TABLE exercises ADD COLUMN demo_url TEXT;
