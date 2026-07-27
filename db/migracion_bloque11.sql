-- Bloque 11 — Demora de envío por marca (la marca declara su estimación).
-- Pegar en Supabase → SQL Editor → Run. Idempotente. Requiere migracion_bloque7.sql (vista con outlet).
alter table stores add column if not exists shipping_min_days int;
alter table stores add column if not exists shipping_max_days int;

-- Recreamos la vista pública agregando la demora de la marca AL FINAL (Postgres no
-- permite reordenar columnas de una vista existente).
create or replace view catalog_products as
select
  p.id, p.slug, p.name, p.category, p.featured, p.created_at,
  s.id  as store_id,
  s.name as store_name,
  s.slug as store_slug,
  s.brand_color,
  (select i.src from product_images i where i.product_id = p.id order by i.position asc limit 1) as image,
  (select min(v.price) from variants v where v.product_id = p.id and v.stock > 0) as price,
  (select min(v.promotional_price) from variants v
     where v.product_id = p.id and v.stock > 0 and v.promotional_price is not null) as promotional_price,
  (select array_agg(distinct v.size) from variants v where v.product_id = p.id and v.stock > 0) as sizes,
  p.outlet,
  s.shipping_min_days,
  s.shipping_max_days
from products p
join stores s on s.id = p.store_id
where p.published
  and s.status = 'active'
  and exists (select 1 from variants v where v.product_id = p.id and v.stock > 0);
