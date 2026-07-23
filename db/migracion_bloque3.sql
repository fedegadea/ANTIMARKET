-- Anti Market — Bloque 3: (A) autofill de dirección en el checkout, (B) tablas de talle.
-- Pegar TODO en Supabase → SQL Editor → Run. Idempotente.
-- Requiere haber corrido antes migracion_bloque1.sql (columna auth_user_id, tabla customers).

-- (A) Dirección del cliente en formato Tienda Nube. Se precarga en el checkout de
--     cada marca (draft order). Se completan desde el perfil una sola vez.
alter table customers add column if not exists identification   text;   -- DNI / CUIT
alter table customers add column if not exists address_street   text;   -- calle
alter table customers add column if not exists address_number   text;   -- número
alter table customers add column if not exists address_floor     text;  -- piso / depto
alter table customers add column if not exists address_locality  text;  -- localidad / barrio
alter table customers add column if not exists address_city      text;  -- ciudad
alter table customers add column if not exists address_province  text;  -- provincia
alter table customers add column if not exists address_zipcode   text;  -- código postal
alter table customers add column if not exists address_country   text default 'AR';

-- (B) Tablas de talle por marca y categoría interna. La marca carga una tabla por
--     categoría (jeans, remeras, …) y aplica a todos sus productos de esa categoría.
create table if not exists size_charts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  category text not null,                          -- categoría interna (misma taxonomía que products.category)
  title text,                                      -- ej: "Guía de talles — Jeans"
  columns text[] not null default '{}',            -- ej: ['Talle','Cintura','Cadera','Largo']
  rows jsonb not null default '[]',                -- ej: [['38','72','94','100'], ['40','76','98','101']]
  note text,                                       -- aclaración libre (cómo medir, etc.)
  updated_at timestamptz not null default now(),
  unique (store_id, category)
);
create index if not exists size_charts_store_idx on size_charts(store_id);
alter table size_charts enable row level security;
