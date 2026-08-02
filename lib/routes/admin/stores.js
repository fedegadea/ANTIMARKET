// Admin — stores: approve, suspend, branding, category map, featured products, health.
import { db, userFromRequest, isAdminEmail } from '../../db.js';
import { json, err, readJson, str, optStr, isHexColor, isUuid } from '../../http.js';

async function requireAdmin(request) {
  const user = await userFromRequest(request);
  return user && isAdminEmail(user.email) ? user : null;
}

export async function GET(request) {
  if (!(await requireAdmin(request))) return err(403, 'admin only');
  const supa = db();
  const url = new URL(request.url);

  // products of one store (for featured curation + category mapping context)
  const productsOf = url.searchParams.get('products');
  if (productsOf && isUuid(productsOf)) {
    const { data: products } = await supa
      .from('products')
      .select('id, name, category, featured, published, tn_categories')
      .eq('store_id', productsOf)
      .eq('published', true)
      .order('name')
      .limit(500);
    return json({ products: products || [] });
  }

  const { data: stores } = await supa
    .from('stores')
    .select('id, tn_store_id, name, slug, contact_email, category, tn_url, status, logo_url, cover_url, brand_color, tagline, bio, branding_approved, tn_category_map, coupon_discount_pct, token_invalid, last_sync_at, last_sync_stats, installed_at')
    .order('created_at', { ascending: false });

  // system health extras (section 9.5)
  const { data: failures } = await supa
    .from('webhook_log')
    .select('tn_store_id, event, status, detail, created_at')
    .in('status', ['error', 'invalid_hmac'])
    .order('created_at', { ascending: false })
    .limit(30);

  const active = (stores || []).filter((s) => s.status === 'active').length;
  return json({ stores: stores || [], active, webhook_failures: failures || [] });
}

// POST { action: 'sign-upload', filename, contentType } →
// URL firmada para subir logo/banner DIRECTO a Supabase Storage desde el
// browser (sin pasar por Vercel: sin límite de 4.5MB). Devuelve también la
// URL pública final para guardar en logo_url / cover_url.
const MEDIA_BUCKET = 'brand-media';
export async function POST(request) {
  if (!(await requireAdmin(request))) return err(403, 'admin only');
  const body = await readJson(request);
  if (!body || body.action !== 'sign-upload') return err(400, 'invalid body');
  const contentType = String(body.contentType || '');
  if (!/^image\//.test(contentType)) return err(400, 'solo imágenes');
  const supa = db();

  // Bucket público: si no existe todavía, se crea acá mismo.
  await supa.storage.createBucket(MEDIA_BUCKET, { public: true }).catch(() => {});

  const ext = (String(body.filename || '').match(/\.([a-z0-9]{2,5})$/i)?.[1] || 'jpg').toLowerCase();
  const path = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;
  const { data, error } = await supa.storage.from(MEDIA_BUCKET).createSignedUploadUrl(path);
  if (error) return err(500, 'no se pudo firmar la subida: ' + error.message);
  return json({
    signedUrl: data.signedUrl,
    token: data.token,
    path,
    publicUrl: process.env.SUPABASE_URL + '/storage/v1/object/public/' + MEDIA_BUCKET + '/' + path,
  });
}

export async function PATCH(request) {
  if (!(await requireAdmin(request))) return err(403, 'admin only');
  const body = await readJson(request);
  if (!body) return err(400, 'invalid body');
  const supa = db();

  // featured toggle on a product
  if (body.product_id) {
    if (!isUuid(body.product_id)) return err(400, 'invalid product_id');
    const { error } = await supa.from('products').update({ featured: !!body.featured }).eq('id', body.product_id);
    if (error) return err(500, 'update failed');
    return json({ ok: true });
  }

  if (!isUuid(body.id)) return err(400, 'invalid store id');
  const patch = {};

  if (body.action === 'approve') {
    // Selección curada y limitada, sin tope numérico fijo: el filtro es la
    // curaduría, no un número. Aprobar activa la marca sin cap.
    patch.status = 'active';
  } else if (body.action === 'suspend') {
    patch.status = 'suspended';
  } else if (body.action === 'remove') {
    patch.status = 'removed';
  }

  for (const key of ['name', 'tagline']) {
    if (body[key] !== undefined) patch[key] = optStr(body[key], { max: 120 });
  }
  if (body.bio !== undefined) patch.bio = optStr(body.bio, { max: 2000 });
  for (const key of ['logo_url', 'cover_url']) {
    if (body[key] !== undefined) patch[key] = optStr(body[key], { max: 500 });
  }
  if (body.brand_color !== undefined) {
    patch.brand_color = isHexColor(body.brand_color) ? body.brand_color : null;
  }
  // Categoría de la marca: libre — el admin puede crear nuevas. Se normaliza
  // a slug (minúsculas, sin acentos, guiones) para que las URLs y filtros
  // queden consistentes. Requiere migracion_bloque13 (saca el CHECK fijo).
  if (body.category !== undefined) {
    const slug = String(body.category || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
      .slice(0, 40);
    if (slug) patch.category = slug;
  }
  if (body.contact_email !== undefined) patch.contact_email = optStr(body.contact_email, { max: 200 });
  if (body.branding_approved !== undefined) patch.branding_approved = !!body.branding_approved;
  if (body.coupon_discount_pct !== undefined) {
    const pct = Number(body.coupon_discount_pct);
    if (pct >= 0 && pct <= 50) patch.coupon_discount_pct = pct;
  }
  if (body.tn_category_map !== undefined && typeof body.tn_category_map === 'object') {
    patch.tn_category_map = body.tn_category_map;
  }

  if (!Object.keys(patch).length) return err(400, 'nothing to update');
  const { data: store, error } = await supa.from('stores').update(patch).eq('id', body.id)
    .select('id, name, slug, status, branding_approved').single();
  if (error) return err(500, 'update failed');
  return json({ store });
}
