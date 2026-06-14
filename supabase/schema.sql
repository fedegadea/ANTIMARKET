-- ════════════════════════════════════════════════════════
-- ANTI MARKET — Supabase Schema + RLS
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ════════════════════════════════════════════════════════

-- ── 1. PROFILES (extiende auth.users) ────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id      UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  nombre  TEXT,
  email   TEXT,
  rol     TEXT NOT NULL DEFAULT 'comprador' CHECK (rol IN ('comprador','marca','admin')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Auto-crear perfil al registrarse
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, nombre, email, rol)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nombre', split_part(NEW.email,'@',1)),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'rol','comprador')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ── 2. BRANDS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brands (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID REFERENCES profiles(id) ON DELETE CASCADE,
  nombre                TEXT NOT NULL,
  slug                  TEXT UNIQUE NOT NULL,
  logo_url              TEXT,
  descripcion           TEXT,
  instagram             TEXT,
  sitio_web             TEXT,
  categorias            TEXT[] DEFAULT '{}',
  estado_verificacion   TEXT NOT NULL DEFAULT 'pendiente'
                        CHECK (estado_verificacion IN ('pendiente','aprobada','rechazada')),
  suscripcion_estado    TEXT NOT NULL DEFAULT 'trial'
                        CHECK (suscripcion_estado IN ('activa','inactiva','trial','suspendida')),
  destacada             BOOLEAN DEFAULT false,
  created_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS brands_slug_idx    ON brands(slug);
CREATE INDEX IF NOT EXISTS brands_estado_idx  ON brands(estado_verificacion);
CREATE INDEX IF NOT EXISTS brands_user_id_idx ON brands(user_id);

-- ── 3. PRODUCTS ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id    UUID REFERENCES brands(id) ON DELETE CASCADE NOT NULL,
  nombre      TEXT NOT NULL,
  descripcion TEXT,
  precio      NUMERIC NOT NULL CHECK (precio >= 0),
  moneda      TEXT DEFAULT 'ARS',
  imagenes    JSONB DEFAULT '[]',
  stock       INTEGER DEFAULT 0,
  categoria   TEXT,
  activo      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS products_brand_idx ON products(brand_id);
CREATE INDEX IF NOT EXISTS products_activo_idx ON products(activo);

-- ── 4. ORDERS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    UUID REFERENCES products(id),
  brand_id      UUID REFERENCES brands(id),
  comprador_id  UUID REFERENCES profiles(id),
  cantidad      INTEGER NOT NULL DEFAULT 1 CHECK (cantidad > 0),
  total         NUMERIC NOT NULL CHECK (total >= 0),
  estado        TEXT NOT NULL DEFAULT 'pendiente'
                CHECK (estado IN ('pendiente','confirmada','enviada','entregada')),
  datos_envio   JSONB DEFAULT '{}',
  notas         TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS orders_brand_idx    ON orders(brand_id);
CREATE INDEX IF NOT EXISTS orders_buyer_idx    ON orders(comprador_id);

-- ── 5. VERIFICATION REQUESTS ─────────────────────────────
CREATE TABLE IF NOT EXISTS verification_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id          UUID REFERENCES brands(id) ON DELETE CASCADE NOT NULL UNIQUE,
  estado            TEXT NOT NULL DEFAULT 'pendiente'
                    CHECK (estado IN ('pendiente','aprobada','rechazada')),
  notas_admin       TEXT,
  fecha_solicitud   TIMESTAMPTZ DEFAULT now(),
  fecha_resolucion  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS verif_estado_idx ON verification_requests(estado);

-- ── 6. ITEMS (vidriera — reemplaza products en la UI) ────────
CREATE TABLE IF NOT EXISTS items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id       UUID REFERENCES brands(id) ON DELETE CASCADE NOT NULL,
  nombre         TEXT NOT NULL,
  descripcion    TEXT,
  imagen_url     TEXT,
  link_saliente  TEXT,
  orden          INTEGER DEFAULT 0,
  activo         BOOLEAN DEFAULT true,
  created_at     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS items_brand_idx  ON items(brand_id);
CREATE INDEX IF NOT EXISTS items_activo_idx ON items(activo);

-- ── 7. OUTBOUND CLICKS ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS outbound_clicks (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id    UUID REFERENCES items(id) ON DELETE CASCADE,
  brand_id   UUID REFERENCES brands(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS clicks_brand_idx ON outbound_clicks(brand_id);

-- ── 8. EMAIL SUBSCRIBERS ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_subscribers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── 9. NEWS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS news (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id   UUID REFERENCES brands(id) ON DELETE CASCADE NOT NULL,
  titulo     TEXT NOT NULL,
  contenido  TEXT,
  imagen_url TEXT,
  activa     BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS news_brand_idx ON news(brand_id);

-- ── 10. BRANDS: nuevas columnas ──────────────────────────────
ALTER TABLE brands ADD COLUMN IF NOT EXISTS banner_url    TEXT;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS color_acento  TEXT DEFAULT '#ffffff';

-- ════════════════════════════════════════════════════════
-- RLS
-- ════════════════════════════════════════════════════════
ALTER TABLE profiles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE brands               ENABLE ROW LEVEL SECURITY;
ALTER TABLE products             ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders               ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_requests ENABLE ROW LEVEL SECURITY;

-- helpers
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rol = 'admin')
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- PROFILES
CREATE POLICY "profiles_select_own" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "profiles_admin"      ON profiles FOR ALL   USING (is_admin());

-- BRANDS
CREATE POLICY "brands_public_read" ON brands FOR SELECT USING (
  estado_verificacion = 'aprobada'
  AND suscripcion_estado IN ('activa','trial')
);
CREATE POLICY "brands_owner_all"   ON brands FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "brands_admin"       ON brands FOR ALL USING (is_admin());

-- PRODUCTS
CREATE POLICY "products_public_read" ON products FOR SELECT USING (
  activo = true
  AND EXISTS (
    SELECT 1 FROM brands
    WHERE brands.id = products.brand_id
      AND brands.estado_verificacion = 'aprobada'
      AND brands.suscripcion_estado IN ('activa','trial')
  )
);
CREATE POLICY "products_owner_all" ON products FOR ALL USING (
  EXISTS (SELECT 1 FROM brands WHERE brands.id = products.brand_id AND brands.user_id = auth.uid())
);
CREATE POLICY "products_admin"     ON products FOR ALL USING (is_admin());

-- ORDERS
CREATE POLICY "orders_buyer_read"  ON orders FOR SELECT USING (auth.uid() = comprador_id);
CREATE POLICY "orders_buyer_insert" ON orders FOR INSERT WITH CHECK (auth.uid() = comprador_id);
CREATE POLICY "orders_brand_read"  ON orders FOR SELECT USING (
  EXISTS (SELECT 1 FROM brands WHERE brands.id = orders.brand_id AND brands.user_id = auth.uid())
);
CREATE POLICY "orders_brand_update" ON orders FOR UPDATE USING (
  EXISTS (SELECT 1 FROM brands WHERE brands.id = orders.brand_id AND brands.user_id = auth.uid())
);
CREATE POLICY "orders_admin"       ON orders FOR ALL USING (is_admin());

-- VERIFICATION REQUESTS
CREATE POLICY "verif_owner_read"   ON verification_requests FOR SELECT USING (
  EXISTS (SELECT 1 FROM brands WHERE brands.id = verification_requests.brand_id AND brands.user_id = auth.uid())
);
CREATE POLICY "verif_owner_insert" ON verification_requests FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM brands WHERE brands.id = verification_requests.brand_id AND brands.user_id = auth.uid())
);
CREATE POLICY "verif_admin"        ON verification_requests FOR ALL USING (is_admin());

-- ── RLS: ITEMS ───────────────────────────────────────────────
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "items_public_read" ON items FOR SELECT USING (
  activo = true
  AND EXISTS (
    SELECT 1 FROM brands
    WHERE brands.id = items.brand_id
      AND brands.estado_verificacion = 'aprobada'
  )
);
CREATE POLICY "items_owner_all" ON items FOR ALL USING (
  EXISTS (SELECT 1 FROM brands WHERE brands.id = items.brand_id AND brands.user_id = auth.uid())
);
CREATE POLICY "items_admin" ON items FOR ALL USING (is_admin());

-- ── RLS: OUTBOUND CLICKS ─────────────────────────────────────
ALTER TABLE outbound_clicks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clicks_insert_all"  ON outbound_clicks FOR INSERT WITH CHECK (true);
CREATE POLICY "clicks_brand_read"  ON outbound_clicks FOR SELECT USING (
  EXISTS (SELECT 1 FROM brands WHERE brands.id = outbound_clicks.brand_id AND brands.user_id = auth.uid())
);
CREATE POLICY "clicks_admin"       ON outbound_clicks FOR ALL USING (is_admin());

-- ── RLS: EMAIL SUBSCRIBERS ───────────────────────────────────
ALTER TABLE email_subscribers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subscribers_insert_all" ON email_subscribers FOR INSERT WITH CHECK (true);
CREATE POLICY "subscribers_admin"      ON email_subscribers FOR ALL USING (is_admin());

-- ── RLS: NEWS ────────────────────────────────────────────────
ALTER TABLE news ENABLE ROW LEVEL SECURITY;
CREATE POLICY "news_public_read" ON news FOR SELECT USING (
  activa = true
  AND EXISTS (
    SELECT 1 FROM brands
    WHERE brands.id = news.brand_id
      AND brands.estado_verificacion = 'aprobada'
  )
);
CREATE POLICY "news_owner_all" ON news FOR ALL USING (
  EXISTS (SELECT 1 FROM brands WHERE brands.id = news.brand_id AND brands.user_id = auth.uid())
);
CREATE POLICY "news_admin" ON news FOR ALL USING (is_admin());
