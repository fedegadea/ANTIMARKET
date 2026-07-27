-- Bloque 9 — Reseñas de productos (con moderación).
create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  store_id uuid references stores(id) on delete set null,
  customer_id uuid references customers(id) on delete set null,
  author_name text,
  stars int not null check (stars between 1 and 5),
  body text,
  status text not null default 'pending',   -- pending | approved | hidden
  created_at timestamptz not null default now()
);
create index if not exists reviews_product_idx on reviews(product_id, status);
create index if not exists reviews_status_idx on reviews(status, created_at desc);
