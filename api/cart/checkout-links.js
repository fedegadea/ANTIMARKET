// POST /api/cart/checkout-links — groups the local cart by store and returns
// one checkout handoff per brand (Fase A: payment happens in each brand's store).
//
// DOCS: TN has no documented Shopify-style cart permalink (option a in spec 4.4).
// DOCS: https://tiendanube.github.io/api-documentation/resources/draft-order
//   Draft orders return checkout_url -> that's our primary mechanism (option b).
// DECISIÓN: the handoff screen asks for name+email once (required by draft orders);
//   this doubles as strong email evidence for attribution. If the draft order
//   fails for a store, we fall back to direct product links (option c).
//
// Body: { anon_id, buyer: { name, email, phone? }, items: [{ variant_id, qty }] }
import { db } from '../../lib/db.js';
import { json, err, readJson, str, isEmail, isUuid, posInt, normalizePhone } from '../../lib/http.js';
import { createDraftOrder } from '../../lib/tn.js';

export async function POST(request) {
  const body = await readJson(request);
  if (!body) return err(400, 'invalid body');

  const anonId = str(body.anon_id, { max: 80 });
  const items = Array.isArray(body.items) ? body.items.slice(0, 50) : [];
  if (!anonId || !items.length) return err(400, 'anon_id and items required');

  const buyerName = str(body.buyer?.name, { max: 80 });
  const buyerEmail = isEmail(body.buyer?.email) ? body.buyer.email.toLowerCase() : null;
  const buyerPhone = normalizePhone(body.buyer?.phone);
  if (!buyerName || !buyerEmail) return err(400, 'buyer name and email required');

  for (const item of items) {
    if (!isUuid(item.variant_id) || !posInt(item.qty, { max: 20 })) return err(400, 'invalid item');
  }

  const supa = db();

  // resolve variants -> products -> stores (in-stock, active stores only)
  const { data: variants, error } = await supa
    .from('variants')
    .select('id, tn_variant_id, price, promotional_price, stock, size, color, products(id, name, slug, tn_handle, store_id, published, stores(id, name, slug, logo_url, tn_url, status, tn_store_id, access_token))')
    .in('id', items.map((i) => i.variant_id));
  if (error) return err(500, 'catalog error');

  // session + customer link (email is attribution gold)
  const { data: session } = await supa
    .from('sessions')
    .upsert({ anon_id: anonId, last_seen_at: new Date().toISOString() }, { onConflict: 'anon_id' })
    .select('id, customer_id')
    .single();

  let customerId = session?.customer_id || null;
  const { data: customer } = await supa
    .from('customers')
    .upsert({ email: buyerEmail }, { onConflict: 'email' })
    .select('id, name, phone')
    .single();
  if (customer) {
    customerId = customer.id;
    const patch = {};
    if (!customer.name && buyerName) patch.name = buyerName;
    if (!customer.phone && buyerPhone) patch.phone = buyerPhone;
    if (Object.keys(patch).length) await supa.from('customers').update(patch).eq('id', customer.id);
    if (session && session.customer_id !== customer.id) {
      await supa.from('sessions').update({ customer_id: customer.id }).eq('id', session.id);
    }
  }

  // group by store
  const byStore = new Map();
  for (const item of items) {
    const v = (variants || []).find((x) => x.id === item.variant_id);
    if (!v || !v.products?.published || v.products.stores?.status !== 'active') continue;
    if (v.stock <= 0) continue; // never sell what's out of stock
    const store = v.products.stores;
    if (!byStore.has(store.id)) byStore.set(store.id, { store, items: [] });
    byStore.get(store.id).items.push({
      variant_id: v.id,
      tn_variant_id: v.tn_variant_id,
      qty: Math.min(item.qty, v.stock),
      name: v.products.name,
      product_slug: v.products.slug,
      tn_handle: v.products.tn_handle,
      size: v.size,
      color: v.color,
      unit_price: Number(v.promotional_price ?? v.price),
    });
  }
  if (!byStore.size) return err(400, 'no available items');

  const groups = [];
  for (const { store, items: storeItems } of byStore.values()) {
    const subtotal = storeItems.reduce((acc, i) => acc + i.unit_price * i.qty, 0);

    // touch FIRST — checkout_redirect is top-priority attribution evidence
    if (session) {
      await supa.from('touches').insert({
        session_id: session.id,
        store_id: store.id,
        channel: 'shopping',
        kind: 'checkout_redirect',
        items: storeItems.map((i) => ({ variant_id: i.variant_id, tn_variant_id: i.tn_variant_id, qty: i.qty })),
      });
    }

    let checkoutUrl = null;
    let mode = 'draft_order';
    try {
      const [firstName, ...rest] = buyerName.split(/\s+/);
      const draft = await createDraftOrder(store, {
        items: storeItems,
        contactName: firstName,
        contactLastname: rest.join(' ') || '-',
        contactEmail: buyerEmail,
        contactPhone: buyerPhone,
      });
      checkoutUrl = draft?.checkout_url || null;
    } catch (e) {
      console.warn(`[checkout-links] draft order failed for ${store.slug}: ${e.message}`);
    }
    if (!checkoutUrl) {
      // fallback (c): direct link to the first product in the brand's own store
      mode = 'product_link';
      const first = storeItems[0];
      checkoutUrl = first.tn_handle
        ? `${store.tn_url.replace(/\/$/, '')}/productos/${first.tn_handle}/`
        : store.tn_url;
    }

    groups.push({
      store_id: store.id,
      store_name: store.name,
      store_logo: store.logo_url,
      items: storeItems.map(({ tn_variant_id, tn_handle, ...pub }) => pub),
      subtotal: Math.round(subtotal * 100) / 100,
      checkout_url: checkoutUrl,
      mode,
    });
  }

  return json({ groups, multi_store: groups.length > 1 });
}
