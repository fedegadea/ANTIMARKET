-- Anti Market — Bloque 6: tablas de talle por CATEGORÍA o por PRODUCTO.
-- Pegar en Supabase → SQL Editor → Run. Idempotente. Requiere migracion_bloque3.sql.

-- una tabla puede ser por categoría (aplica a todos los productos de esa categoría)
-- o por producto (aplica solo a los productos elegidos).
alter table size_charts alter column category drop not null;
alter table size_charts add column if not exists scope text not null default 'category';

-- asignación de una tabla a productos puntuales (scope = 'products')
create table if not exists size_chart_products (
  chart_id uuid not null references size_charts(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  primary key (chart_id, product_id)
);
-- cada producto tiene a lo sumo una tabla propia
create unique index if not exists size_chart_products_product_uidx on size_chart_products(product_id);
create index if not exists size_chart_products_chart_idx on size_chart_products(chart_id);
alter table size_chart_products enable row level security;
