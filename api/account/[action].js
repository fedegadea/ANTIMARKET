// /api/account/* — the customer's own space: profile, favorites, favorite
// brands, email capture (lead) and login sync. One function, routed by the last
// path segment (Hobby function-count limit).
//
// Identity: a Bearer token (Supabase Auth) means a logged-in customer; otherwise
// we fall back to anon_id (first-party cookie) so favorites work without an
// account. On login the anon rows are merged into the customer (see `sync`).
import { db, userFromRequest } from '../../lib/db.js';
import { json, err, readJson, str, isEmail, isUuid, normalizePhone } from '../../lib/http.js';

// Resolve (and lazily link/create) the customer behind a Bearer token.
async function customerFromToken(supa, request) {
  const user = await userFromRequest(request);
  if (!user) return null;
  const email = String(user.email).toLowerCase();

  let { data: c } = await supa.from('customers').select('*').eq('auth_user_id', user.id).maybeSingle();
  if (c) return c;

  ({ data: c } = await supa.from('customers').select('*').ilike('email', email).maybeSingle());
  if (c) {
    await supa.from('customers').update({ auth_user_id: user.id }).eq('id', c.id);
    return { ...c, auth_user_id: user.id };
  }
  const { data: created } = await supa.from('customers')
    .insert({ email, auth_user_id: user.id }).select('*').single();
  return created;
}

// The "owner" filter for favorites: customer if logged in, else anon.
function owner(customer, anonId) {
  return customer ? { col: 'customer_id', val: customer.id } : { col: 'anon_id', val: anonId };
}

const ADDRESS_FIELDS = ['identification', 'address_street', 'address_number', 'address_floor',
  'address_locality', 'address_city', 'address_province', 'address_zipcode', 'address_country'];

const PUBLIC_CUSTOMER = (c) => ({
  email: c.email, name: c.name || null, phone: c.phone || null,
  size_top: c.size_top || null, size_bottom: c.size_bottom || null, size_shoes: c.size_shoes || null,
  style_notes: c.style_notes || null, opt_in_marketing: !!c.opt_in_marketing,
  ...Object.fromEntries(ADDRESS_FIELDS.map((f) => [f, c[f] || null])),
});

export async function GET(request) {
  const action = new URL(request.url).pathname.split('/').filter(Boolean).pop();
  const supa = db();
  const anonId = str(new URL(request.url).searchParams.get('anon_id'), { max: 80 });
  const customer = await customerFromToken(supa, request);

  if (action === 'profile') {
    if (!customer) return err(401, 'not logged in');
    return json({ customer: PUBLIC_CUSTOMER(customer) });
  }

  if (action === 'favorites') {
    const o = owner(customer, anonId);
    if (!o.val) return json({ product_ids: [] });
    const { data } = await supa.from('favorites').select('product_id').eq(o.col, o.val);
    return json({ product_ids: (data || []).map((r) => r.product_id) });
  }

  if (action === 'favorite-stores') {
    const o = owner(customer, anonId);
    if (!o.val) return json({ store_ids: [] });
    const { data } = await supa.from('favorite_stores').select('store_id').eq(o.col, o.val);
    return json({ store_ids: (data || []).map((r) => r.store_id) });
  }

  // ---- personalized picks: "Nuestra selección para {nombre}" ----
  if (action === 'for-you') {
    if (!customer) return err(401, 'not logged in');
    const LIMIT = 12;
    const wantSizes = [customer.size_top, customer.size_bottom, customer.size_shoes].filter(Boolean);

    const [{ data: favStores }, { data: favProds }] = await Promise.all([
      supa.from('favorite_stores').select('store_id').eq('customer_id', customer.id),
      supa.from('favorites').select('product_id').eq('customer_id', customer.id),
    ]);
    const storeIds = (favStores || []).map((r) => r.store_id);
    const exclude = new Set((favProds || []).map((r) => r.product_id));

    const picked = new Map();
    const add = (rows) => { for (const r of rows || []) { if (!exclude.has(r.id) && !picked.has(r.id)) picked.set(r.id, r); } };

    // 1) from their favorite brands (newest / featured first)
    if (storeIds.length) {
      const { data } = await supa.from('catalog_products').select('*')
        .in('store_id', storeIds).order('featured', { ascending: false }).order('created_at', { ascending: false }).limit(30);
      add(data);
    }
    // 2) cross-brand, matching their sizes (discovery)
    if (picked.size < LIMIT && wantSizes.length) {
      const { data } = await supa.from('catalog_products').select('*')
        .overlaps('sizes', wantSizes).order('featured', { ascending: false }).order('created_at', { ascending: false }).limit(30);
      add(data);
    }
    // 3) fill with our featured picks, then latest
    if (picked.size < LIMIT) {
      const { data } = await supa.from('catalog_products').select('*').eq('featured', true).limit(20);
      add(data);
    }
    if (picked.size < LIMIT) {
      const { data } = await supa.from('catalog_products').select('*').order('created_at', { ascending: false }).limit(20);
      add(data);
    }

    return json({
      name: customer.name || null,
      personalized: storeIds.length > 0 || wantSizes.length > 0,
      products: [...picked.values()].slice(0, LIMIT),
    });
  }

  return err(404, 'unknown action');
}

export async function POST(request) {
  const action = new URL(request.url).pathname.split('/').filter(Boolean).pop();
  const body = (await readJson(request)) || {};
  const supa = db();
  const anonId = str(body.anon_id, { max: 80 });
  const customer = await customerFromToken(supa, request);

  // ---- capture a lead: just an email, from the minimal pop-up ----
  if (action === 'lead') {
    const email = isEmail(body.email) ? body.email.toLowerCase() : null;
    if (!email) return err(400, 'email required');
    const { data: existing } = await supa.from('customers').select('id').ilike('email', email).maybeSingle();
    if (existing) {
      await supa.from('customers').update({ opt_in_marketing: true }).eq('id', existing.id);
    } else {
      await supa.from('customers').insert({ email, opt_in_marketing: true });
    }
    // tie to the session so the same person is recognized later
    if (anonId) {
      const { data: c } = await supa.from('customers').select('id').ilike('email', email).maybeSingle();
      if (c) await supa.from('sessions').update({ customer_id: c.id }).eq('anon_id', anonId);
    }
    return json({ ok: true });
  }

  // ---- toggle a favorite product ----
  if (action === 'favorites') {
    if (!isUuid(body.product_id)) return err(400, 'product_id required');
    const o = owner(customer, anonId);
    if (!o.val) return err(400, 'anon_id or login required');
    const { data: found } = await supa.from('favorites')
      .select('id').eq(o.col, o.val).eq('product_id', body.product_id).maybeSingle();
    if (found) {
      const { error } = await supa.from('favorites').delete().eq('id', found.id);
      if (error) return err(500, 'could not remove favorite');
      return json({ favorite: false });
    }
    const { error } = await supa.from('favorites').insert({ [o.col]: o.val, product_id: body.product_id });
    if (error) return err(500, 'could not save favorite');
    return json({ favorite: true });
  }

  // ---- toggle a favorite brand ----
  if (action === 'favorite-stores') {
    if (!isUuid(body.store_id)) return err(400, 'store_id required');
    const o = owner(customer, anonId);
    if (!o.val) return err(400, 'anon_id or login required');
    const { data: found } = await supa.from('favorite_stores')
      .select('id').eq(o.col, o.val).eq('store_id', body.store_id).maybeSingle();
    if (found) {
      const { error } = await supa.from('favorite_stores').delete().eq('id', found.id);
      if (error) return err(500, 'could not remove favorite brand');
      return json({ favorite: false });
    }
    const { error } = await supa.from('favorite_stores').insert({ [o.col]: o.val, store_id: body.store_id });
    if (error) return err(500, 'could not save favorite brand');
    return json({ favorite: true });
  }

  // ---- merge anonymous favorites into the account on login ----
  if (action === 'sync') {
    if (!customer) return err(401, 'not logged in');
    if (anonId) {
      await mergeFavorites(supa, 'favorites', 'product_id', anonId, customer.id);
      await mergeFavorites(supa, 'favorite_stores', 'store_id', anonId, customer.id);
      await supa.from('sessions').update({ customer_id: customer.id }).eq('anon_id', anonId);
    }
    return json({ customer: PUBLIC_CUSTOMER(customer) });
  }

  // ---- update profile (name, phone, sizes, style, opt-in) ----
  if (action === 'profile') {
    if (!customer) return err(401, 'not logged in');
    const patch = {};
    if (body.name !== undefined) patch.name = str(body.name, { max: 80 });
    if (body.phone !== undefined) patch.phone = normalizePhone(body.phone);
    for (const k of ['size_top', 'size_bottom', 'size_shoes']) {
      if (body[k] !== undefined) patch[k] = str(body[k], { max: 16 });
    }
    if (body.style_notes !== undefined) patch.style_notes = str(body.style_notes, { max: 2000 });
    if (body.opt_in_marketing !== undefined) patch.opt_in_marketing = !!body.opt_in_marketing;
    for (const f of ADDRESS_FIELDS) {
      if (body[f] !== undefined) patch[f] = str(body[f], { max: 120 });
    }
    if (Object.keys(patch).length) {
      const { error } = await supa.from('customers').update(patch).eq('id', customer.id);
      if (error) return err(500, 'could not save');
    }
    const { data: fresh } = await supa.from('customers').select('*').eq('id', customer.id).single();
    return json({ customer: PUBLIC_CUSTOMER(fresh) });
  }

  return err(404, 'unknown action');
}

// Move anon rows to the customer, skipping ones the customer already has.
async function mergeFavorites(supa, table, keyCol, anonId, customerId) {
  const { data: anonRows } = await supa.from(table).select(`id, ${keyCol}`).eq('anon_id', anonId).is('customer_id', null);
  if (!anonRows || !anonRows.length) return;
  const { data: mine } = await supa.from(table).select(keyCol).eq('customer_id', customerId);
  const have = new Set((mine || []).map((r) => r[keyCol]));
  for (const row of anonRows) {
    if (have.has(row[keyCol])) {
      await supa.from(table).delete().eq('id', row.id);            // duplicate: drop the anon one
    } else {
      await supa.from(table).update({ customer_id: customerId, anon_id: null }).eq('id', row.id);
    }
  }
}
