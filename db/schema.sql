-- ============================================================
-- ANTI MARKET — schema v1 (idempotent migration)
-- Run in Supabase SQL editor. Safe to re-run.
-- DECISIÓN: commission is a flat 6.5% for both channels (owner's
-- amendment; was 7% then 5%, spec v1.0 said 5%/10%). Channel is still
-- tracked per attribution for analytics and brand reporting.
-- ============================================================

create extension if not exists pgcrypto;

-- ============ STORES (brands in the network) ============
create table if not exists stores (
  id uuid primary key default gen_random_uuid(),
  tn_store_id bigint unique not null,           -- Tienda Nube store id
  access_token text not null,                    -- OAuth token, AES-256-GCM encrypted at app layer (section 13)
  name text not null,
  slug text unique not null,
  legal_name text,
  cuit text,
  contact_email text not null,
  contact_phone text,
  category text not null default 'moda' check (category in ('moda','wellness','gourmet','deco','belleza','accesorios')),
  tn_url text not null,
  status text not null default 'pending'
    check (status in ('pending','active','suspended','removed')),
  -- curated branding of the virtual store
  logo_url text,
  cover_url text,
  brand_color text,                              -- hex, validated at app layer
  tagline text,
  bio text,
  branding_approved boolean not null default false,
  commission_shopping numeric(4,3) not null default 0.065,
  commission_agent numeric(4,3) not null default 0.065,
  settlement_threshold_ars numeric(12,2) not null default 300000,
  -- agent backup coupons: default discount pct (0 = coupon is attribution marker only)
  coupon_discount_pct numeric(4,1) not null default 5.0,
  -- per-store TN category -> internal category mapping, edited in admin: {"<tn_category_id>": "vestidos"}
  tn_category_map jsonb not null default '{}',
  -- system health
  token_invalid boolean not null default false,
  last_sync_at timestamptz,
  last_sync_stats jsonb,
  installed_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============ MIRRORED CATALOG ============
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  tn_product_id bigint not null,
  slug text not null,
  tn_handle text,                                -- TN storefront handle, for direct links to the brand's store
  name text not null,
  description text,
  category text,                                 -- internal taxonomy
  tn_categories jsonb,
  tags text[],
  published boolean not null default true,
  featured boolean not null default false,       -- "Elegidos de la semana" (admin-curated)
  outlet boolean not null default false,         -- brand-curated: shown in the Outlet section
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, tn_product_id)
);

create table if not exists variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  tn_variant_id bigint not null,
  sku text,
  size text,                                     -- normalized (XS..XXL, 34-52, 'único')
  color text,
  price numeric(12,2) not null,
  promotional_price numeric(12,2),
  stock integer not null default 0,
  raw_attributes jsonb,
  updated_at timestamptz not null default now(),
  unique (product_id, tn_variant_id)
);

create table if not exists product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  tn_image_id bigint,
  src text not null,
  position integer not null default 0
);

create index if not exists idx_products_store on products(store_id);
create index if not exists idx_products_category on products(category) where published;
create index if not exists idx_products_slug on products(slug);
create index if not exists idx_variants_stock on variants(product_id) where stock > 0;

-- ============ CUSTOMERS, SESSIONS, TOUCHES (attribution) ============
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  phone text unique,                             -- normalized E.164 (549..., no "15")
  name text,
  size_top text, size_bottom text, size_shoes text,
  style_notes text,
  opt_in_marketing boolean not null default false,
  created_at timestamptz not null default now()
);

-- Link a customer to their Supabase Auth account (email+password login).
alter table customers add column if not exists auth_user_id uuid unique;

-- Customer shipping address (Tienda Nube format) — prefilled into each brand's
-- draft-order checkout so the buyer loads it once (see api/cart/checkout-links).
alter table customers add column if not exists identification   text;
alter table customers add column if not exists address_street   text;
alter table customers add column if not exists address_number   text;
alter table customers add column if not exists address_floor     text;
alter table customers add column if not exists address_locality  text;
alter table customers add column if not exists address_city      text;
alter table customers add column if not exists address_province  text;
alter table customers add column if not exists address_zipcode   text;
alter table customers add column if not exists address_country   text default 'AR';

-- Favorites (the heart on each product) and favorite brands. Work anonymously
-- by anon_id and get merged into customer_id on login (see /api/account/sync).
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

create table if not exists favorite_stores (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete cascade,
  anon_id text,
  store_id uuid not null references stores(id) on delete cascade,
  created_at timestamptz not null default now()
);
create unique index if not exists fav_stores_customer_uidx on favorite_stores(customer_id, store_id) where customer_id is not null;
create unique index if not exists fav_stores_anon_uidx on favorite_stores(anon_id, store_id) where anon_id is not null and customer_id is null;

-- Size charts per brand + internal category. One table per (store, category);
-- products inherit the chart matching their category (see api/catalog/product).
create table if not exists size_charts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  category text,                                   -- set for category-scoped charts; null for product-scoped
  scope text not null default 'category',          -- 'category' | 'products'
  title text,
  columns text[] not null default '{}',
  rows jsonb not null default '[]',
  note text,
  updated_at timestamptz not null default now(),
  unique (store_id, category)                       -- nulls are distinct, so many product charts per store are fine
);
create index if not exists size_charts_store_idx on size_charts(store_id);

-- assignment of a product-scoped chart to specific products
create table if not exists size_chart_products (
  chart_id uuid not null references size_charts(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  primary key (chart_id, product_id)
);
create unique index if not exists size_chart_products_product_uidx on size_chart_products(product_id);
create index if not exists size_chart_products_chart_idx on size_chart_products(chart_id);

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  anon_id text unique not null,                  -- first-party cookie am_sid, 1 year
  customer_id uuid references customers(id),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists touches (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id),
  store_id uuid not null references stores(id),
  channel text not null check (channel in ('shopping','agent')),
  kind text not null check (kind in ('view_product','add_to_cart','checkout_redirect','agent_recommendation','agent_cart')),
  product_id uuid references products(id),
  variant_id uuid references variants(id),
  coupon_code text,
  -- for checkout_redirect: snapshot of cart items sent to that store [{variant_id, tn_variant_id, qty}]
  items jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_touches_attribution on touches(store_id, session_id, created_at desc);
create index if not exists idx_touches_coupon on touches(coupon_code) where coupon_code is not null;

-- ============ ORDERS & ATTRIBUTIONS ============
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id),
  tn_order_id bigint not null,
  tn_order_number text,
  status text not null,                          -- raw TN: open/closed/cancelled + payment_status tracked in raw
  payment_status text,
  total numeric(12,2) not null,
  currency text not null default 'ARS',
  customer_email text,
  customer_phone text,
  coupon_codes text[],
  placed_at timestamptz not null,
  raw jsonb not null,
  created_at timestamptz not null default now(),
  unique (store_id, tn_order_id)
);

create table if not exists attributions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid unique not null references orders(id),
  store_id uuid not null references stores(id),
  session_id uuid references sessions(id),
  customer_id uuid references customers(id),
  channel text not null check (channel in ('shopping','agent')),
  match_method text not null check (match_method in ('coupon','checkout_redirect','email','phone')),
  matched_touch_id uuid references touches(id),
  commission_rate numeric(4,3) not null,
  commission_amount numeric(12,2) not null,
  status text not null default 'accrued'
    check (status in ('accrued','reversed','settled')),
  settlement_id uuid,
  -- if reversed AFTER being settled, the credit note lands in this later settlement
  reversal_settlement_id uuid,
  created_at timestamptz not null default now()
);

-- ============ ANTI MARKET ORDER (Combo A: guided cross-brand checkout) ============
-- The "AM order" is the umbrella a shopper confirms in Anti Market. It fans out
-- into one segment per brand; each segment is a TN draft order whose checkout is
-- completed in that brand's store. TN preserves the id across draft->paid order,
-- so a segment binds to its paid order by draft_order_id == tn_order_id.
create table if not exists order_groups (
  id uuid primary key default gen_random_uuid(),
  public_token text unique not null,               -- unguessable handle for the /pedido URL (no auth)
  anon_id text,
  session_id uuid references sessions(id),
  customer_id uuid references customers(id),
  buyer_name text,
  buyer_email text,
  buyer_phone text,
  status text not null default 'open'
    check (status in ('open','partial','complete','cancelled')),
  total numeric(12,2) not null default 0,
  store_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_order_groups_token on order_groups(public_token);
create index if not exists idx_order_groups_session on order_groups(session_id, created_at desc);

create table if not exists order_group_segments (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references order_groups(id) on delete cascade,
  store_id uuid not null references stores(id),
  position int not null,                           -- 1..N pay order in the guided flow
  items jsonb not null,                            -- [{variant_id, name, variant_label, qty, unit_price}]
  subtotal numeric(12,2) not null default 0,
  mode text not null default 'draft_order'
    check (mode in ('draft_order','product_link')),
  draft_order_id bigint,                           -- TN draft order id == future paid order id
  checkout_url text,
  tn_order_id bigint,                              -- set when paid (equals draft_order_id)
  payment_status text not null default 'pending'
    check (payment_status in ('pending','paid','cancelled')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, store_id)
);
create index if not exists idx_segments_group on order_group_segments(group_id, position);
create index if not exists idx_segments_draft on order_group_segments(draft_order_id) where draft_order_id is not null;

-- ============ SETTLEMENTS ============
create table if not exists settlements (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id),
  period_start date not null,
  period_end date not null,
  total_sales numeric(12,2) not null,
  total_commission numeric(12,2) not null,
  status text not null default 'issued'
    check (status in ('issued','paid','overdue','disputed')),
  due_date date not null,                        -- issued + 10 calendar days
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

do $$ begin
  alter table attributions add constraint fk_settlement
    foreign key (settlement_id) references settlements(id);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table attributions add constraint fk_reversal_settlement
    foreign key (reversal_settlement_id) references settlements(id);
exception when duplicate_object then null; end $$;

-- ============ BRAND APPLICATIONS (30 cap) ============
create table if not exists brand_applications (
  id uuid primary key default gen_random_uuid(),
  brand_name text not null,
  contact_name text not null,
  email text not null,
  instagram text,
  tn_url text,
  category text not null,
  monthly_orders_estimate text,
  why text,
  ip_hash text,                                  -- sha256(ip) for rate limiting, never the raw IP
  status text not null default 'waitlist'
    check (status in ('waitlist','invited','approved','rejected')),
  created_at timestamptz not null default now()
);

-- ============ AGENT CONVERSATIONS ============
create table if not exists agent_conversations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid unique not null references sessions(id),
  messages jsonb not null default '[]',          -- [{role, content, ts}]
  needs_human boolean not null default false,
  needs_human_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============ WEBHOOK LOG ============
create table if not exists webhook_log (
  id uuid primary key default gen_random_uuid(),
  tn_store_id bigint,
  event text,
  resource_id bigint,
  status text not null,                          -- ok | error | invalid_hmac | ignored
  detail text,
  created_at timestamptz not null default now()
);
create index if not exists idx_webhook_log_created on webhook_log(created_at desc);

-- ============ RLS ============
alter table stores enable row level security;
alter table products enable row level security;
alter table variants enable row level security;
alter table product_images enable row level security;
alter table customers enable row level security;
alter table favorites enable row level security;          -- deny-by-default: only /api/account (service role)
alter table favorite_stores enable row level security;
alter table size_charts enable row level security;        -- served/edited only via service-role routes
alter table size_chart_products enable row level security;
alter table sessions enable row level security;
alter table touches enable row level security;
alter table orders enable row level security;
alter table order_groups enable row level security;          -- deny-by-default: only service role (our API) touches these
alter table order_group_segments enable row level security;
alter table attributions enable row level security;
alter table settlements enable row level security;
alter table brand_applications enable row level security;
alter table agent_conversations enable row level security;
alter table webhook_log enable row level security;

-- Public (anon key): read-only over published catalog of active stores.
drop policy if exists public_products on products;
create policy public_products on products for select
  using (published and exists (select 1 from stores s where s.id = store_id and s.status = 'active'));

drop policy if exists public_variants on variants;
create policy public_variants on variants for select
  using (exists (select 1 from products p join stores s on s.id = p.store_id
                 where p.id = product_id and p.published and s.status = 'active'));

drop policy if exists public_images on product_images;
create policy public_images on product_images for select
  using (exists (select 1 from products p join stores s on s.id = p.store_id
                 where p.id = product_id and p.published and s.status = 'active'));

drop policy if exists public_stores on stores;
create policy public_stores on stores for select
  using (status = 'active');
-- IMPORTANT: the frontend must query the stores_public VIEW, never the table:
-- the view exposes only safe columns (no access_token, cuit, emails).

create or replace view stores_public as
  select id, name, slug, category, logo_url, cover_url, brand_color, tagline, bio, tn_url
  from stores where status = 'active';

-- Brands (Supabase users whose email = stores.contact_email): read only their own rows.
drop policy if exists brand_own_orders on orders;
create policy brand_own_orders on orders for select
  using (store_id in (select id from stores where contact_email = auth.jwt()->>'email'));

drop policy if exists brand_own_attributions on attributions;
create policy brand_own_attributions on attributions for select
  using (store_id in (select id from stores where contact_email = auth.jwt()->>'email'));

drop policy if exists brand_own_settlements on settlements;
create policy brand_own_settlements on settlements for select
  using (store_id in (select id from stores where contact_email = auth.jwt()->>'email'));

-- Everything else (writes, customers, tokens, admin) goes through service role
-- in serverless functions. No write policies for anon/authenticated.

-- ============ CATALOG VIEW (server-side reads) ============
-- Aggregated public catalog: only published products of active stores
-- with at least one in-stock variant. Queried with service role from /api/catalog/*.
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
