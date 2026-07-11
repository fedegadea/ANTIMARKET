// Admin — stores: approve, suspend, branding, category map, featured products, health.
import { db, userFromRequest, isAdminEmail } from '../../lib/db.js';
import { json, err, readJson, str, optStr, isHexColor, isUuid } from '../../lib/http.js';

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
  return json({ stores: stores || [], active, cap: 30, webhook_failures: failures || [] });
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
    // cap check: 30 brands max, no exceptions — that's the product
    const { count } = await supa.from('stores').select('id', { count: 'exact', head: true }).eq('status', 'active');
    if ((count || 0) >= 30) return err(409, 'cupo completo: 30/30');
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
  if (body.category !== undefined && ['moda', 'wellness', 'gourmet', 'deco', 'belleza', 'accesorios'].includes(body.category)) {
    patch.category = body.category;
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
