-- Anti Market — Bloque 7: sección Outlet.
-- Pegar en Supabase → SQL Editor → Run. Idempotente.
-- Cada marca marca (desde su panel) qué prendas en descuento suma al Outlet.

alter table products add column if not exists outlet boolean not null default false;

-- exponer `outlet` en la vista pública del catálogo.
-- NOTA: con "create or replace view" la columna nueva DEBE ir al final (Postgres
-- no permite reordenar/renombrar columnas de una vista existente).
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
  p.outlet
from products p
join stores s on s.id = p.store_id
where p.published
  and s.status = 'active'
  and exists (select 1 from variants v where v.product_id = p.id and v.stock > 0);
