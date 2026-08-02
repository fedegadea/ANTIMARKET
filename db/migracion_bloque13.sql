-- ============================================================================
-- BLOQUE 13 — Categoría libre por marca
--
-- La columna stores.category existía pero con un CHECK que solo permitía
-- 6 valores fijos. Ahora el admin puede asignar cualquier categoría o crear
-- una nueva, así que el candado sobra. Se mantiene NOT NULL + default.
--
-- Correr en Supabase (Anti Market) → SQL Editor → Run. Idempotente.
-- ============================================================================

alter table public.stores drop constraint if exists stores_category_check;

-- Verificación (no debe devolver filas):
-- select conname from pg_constraint
--   where conrelid = 'public.stores'::regclass and conname = 'stores_category_check';
