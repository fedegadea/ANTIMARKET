// /api/cart/checkout-links — the Anti Market order (Combo A: guided cross-brand checkout).
//
//   POST  → build the AM order: one segment per brand, each a TN draft order
//           (checkout_url). Persists an order_group + segments and returns a
//           public_token that drives the guided /pedido flow.
//   GET ?token=… → current state of an order group (which brands are paid),
//           polled by the guided checkout page.
//
// DOCS: https://tiendanube.github.io/api-documentation/resources/draft-order
//   Draft order returns checkout_url; the paid order keeps the SAME id, so a
//   segment binds to its payment by draft_order_id == tn_order_id (see webhook).
// DECISIÓN: name+email asked once (draft orders require it) and doubles as strong
//   email evidence for attribution. If a store's draft order fails, that segment
//   falls back to a direct product link.
//
// POST body: { anon_id, buyer: { name, email, phone? }, items: [{ variant_id, qty }] }
import { randomBytes } from 'node:crypto';
import { db } from '../../lib/db.js';
import { json, err, readJson, str, isEmail, isUuid, posInt, normalizePhone } from '../../lib/http.js';
import { createDraftOrder } from '../../lib/tn.js';

function newToken() {
  return randomBytes(24).toString('base64url'); // 32 urlsafe chars, unguessable
}

// Shape a segment row for the client (never leaks tn ids or tokens).
function publicSegment(seg) {
  return {
    store_id: seg.store_id,
    store_name: seg.store_name,
    store_logo: seg.store_logo || null,
    position: seg.position,
    items: seg.items,
    subtotal: seg.subtotal,
    checkout_url: seg.checkout_url,
    mode: seg.mode,
    payment_status: seg.payment_status,
  };
}

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

  // group by store, preserving cart order (Map keeps insertion order = pay order)
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
      variant_label: [v.size, v.color].filter(Boolean).join(' · ') || 'Único',
      unit_price: Number(v.promotional_price ?? v.price),
    });
  }
  if (!byStore.size) return err(400, 'no available items');

  // create the umbrella order group up front (so segments can reference it)
  const token = newToken();
  const orderTotal = Array.from(byStore.values()).reduce(
    (acc, g) => acc + g.items.reduce((s, i) => s + i.unit_price * i.qty, 0), 0);
  const { data: group, error: gErr } = await supa.from('order_groups').insert({
    public_token: token,
    anon_id: anonId,
    session_id: session?.id || null,
    customer_id: customerId,
    buyer_name: buyerName,
    buyer_email: buyerEmail,
    buyer_phone: buyerPhone,
    status: 'open',
    total: Math.round(orderTotal * 100) / 100,
    store_count: byStore.size,
  }).select('id, public_token').single();
  if (gErr) return err(500, 'could not create order');

  const segments = [];
  let position = 0;
  for (const { store, items: storeItems } of byStore.values()) {
    position += 1;
    const subtotal = Math.round(storeItems.reduce((acc, i) => acc + i.unit_price * i.qty, 0) * 100) / 100;

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
    let draftOrderId = null;
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
      draftOrderId = draft?.id ? Number(draft.id) : null; // == future paid order id
    } catch (e) {
      console.warn(`[checkout-links] draft order failed for ${store.slug}: ${e.message}`);
    }
    if (!checkoutUrl) {
      // fallback: direct link to the first product in the brand's own store
      mode = 'product_link';
      draftOrderId = null;
      const first = storeItems[0];
      checkoutUrl = first.tn_handle
        ? `${store.tn_url.replace(/\/$/, '')}/productos/${first.tn_handle}/`
        : store.tn_url;
    }

    // items snapshot for the segment (public-safe: no tn ids)
    const itemsSnapshot = storeItems.map((i) => ({
      variant_id: i.variant_id,
      name: i.name,
      variant_label: i.variant_label,
      qty: i.qty,
      unit_price: i.unit_price,
    }));

    await supa.from('order_group_segments').insert({
      group_id: group.id,
      store_id: store.id,
      position,
      items: itemsSnapshot,
      subtotal,
      mode,
      draft_order_id: draftOrderId,
      checkout_url: checkoutUrl,
      payment_status: 'pending',
    });

    segments.push(publicSegment({
      store_id: store.id, store_name: store.name, store_logo: store.logo_url,
      position, items: itemsSnapshot, subtotal, checkout_url: checkoutUrl,
      mode, payment_status: 'pending',
    }));
  }

  return json({
    token: group.public_token,
    total: Math.round(orderTotal * 100) / 100,
    multi_store: segments.length > 1,
    segments,
  });
}

// GET ?token=… — poll the state of an order group (guided checkout page).
export async function GET(request) {
  const token = str(new URL(request.url).searchParams.get('token'), { max: 64 });
  if (!token) return err(400, 'token required');

  const supa = db();
  const { data: group } = await supa
    .from('order_groups')
    .select('id, public_token, buyer_name, buyer_email, status, total, store_count, created_at')
    .eq('public_token', token)
    .maybeSingle();
  if (!group) return err(404, 'order not found');

  const { data: rows } = await supa
    .from('order_group_segments')
    .select('store_id, position, items, subtotal, mode, checkout_url, payment_status, paid_at, stores(name, logo_url)')
    .eq('group_id', group.id)
    .order('position', { ascending: true });

  const segments = (rows || []).map((s) => publicSegment({
    store_id: s.store_id,
    store_name: s.stores?.name || 'Marca',
    store_logo: s.stores?.logo_url,
    position: s.position,
    items: s.items,
    subtotal: Number(s.subtotal),
    checkout_url: s.checkout_url,
    mode: s.mode,
    payment_status: s.payment_status,
  }));

  const paid = segments.filter((s) => s.payment_status === 'paid').length;
  return json({
    token: group.public_token,
    buyer_name: group.buyer_name,
    status: group.status,
    total: Number(group.total),
    paid_count: paid,
    store_count: group.store_count,
    multi_store: group.store_count > 1,
    segments,
  });
}
