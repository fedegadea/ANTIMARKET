-- Anti Market — Bloque 1 (identidad del cliente: favoritos, marcas favoritas, login).
-- Pegar TODO esto en Supabase → SQL Editor → Run. Es idempotente: se puede correr varias veces.

-- 1) Vincular cada cliente con su cuenta de Supabase Auth (login email + contraseña)
alter table customers add column if not exists auth_user_id uuid unique;

-- 2) Favoritos (el corazón de cada producto). Funcionan anónimos por anon_id
--    y se fusionan al customer_id cuando la clienta inicia sesión.
create table if not exists favorites (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete cascade,
  anon_id text,
  product_id uuid not null references products(id) on delete cascade,
  created_at timestamptz not null default now()
);
create unique index if not exists favorites_customer_uidx on favorites(customer_id, product_id) where customer_id is not null;
create unique index if not exists favorites_anon_uidx on favorites(anon_id, product_id) where anon_id is not null and customer_id is null;
create index if not exists favorites_customer_idx on favorites(customer_id);

-- 3) Marcas favoritas ("seguir marca")
create table if not exists favorite_stores (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete cascade,
  anon_id text,
  store_id uuid not null references stores(id) on delete cascade,
  created_at timestamptz not null default now()
);
create unique index if not exists fav_stores_customer_uidx on favorite_stores(customer_id, store_id) where customer_id is not null;
create unique index if not exists fav_stores_anon_uidx on favorite_stores(anon_id, store_id) where anon_id is not null and customer_id is null;

-- 4) RLS deny-by-default (solo el backend con service_role escribe/lee)
alter table favorites enable row level security;
alter table favorite_stores enable row level security;
