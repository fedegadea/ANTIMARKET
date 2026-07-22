// Attribution engine (section 5). Attribution is technical, never declarative:
// every commission traces to a concrete TN order with match evidence.
import { db } from './db.js';
import { normalizePhone } from './http.js';

const WINDOW_DAYS = 7;
const REDIRECT_WINDOW_HOURS = 72;

function isoDaysAgo(days) {
  return new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
}

function roundHalfUp(n) {
  return Math.round(n * 100) / 100;
}

// Persist (or refresh) a TN order into our orders table. Returns the row.
export async function upsertOrderFromTN(store, tnOrder) {
  const supa = db();
  const row = {
    store_id: store.id,
    tn_order_id: tnOrder.id,
    tn_order_number: String(tnOrder.number ?? tnOrder.id),
    status: tnOrder.status || 'open',
    payment_status: tnOrder.payment_status || null,
    total: Number(tnOrder.total) || 0,
    currency: tnOrder.currency || 'ARS',
    customer_email: tnOrder.contact_email || tnOrder.customer?.email || null,
    customer_phone: normalizePhone(tnOrder.contact_phone || tnOrder.customer?.phone),
    coupon_codes: (tnOrder.coupon || []).map((c) => (typeof c === 'string' ? c : c.code)).filter(Boolean),
    placed_at: tnOrder.created_at || new Date().toISOString(),
    raw: tnOrder,
  };
  const { data, error } = await supa
    .from('orders')
    .upsert(row, { onConflict: 'store_id,tn_order_id' })
    .select('*')
    .single();
  if (error) throw new Error(`order upsert failed (tn ${tnOrder.id}): ${error.message}`);
  return data;
}

// Order line items as tn_variant_ids, for checkout_redirect overlap matching.
function orderVariantIds(order) {
  return new Set((order.raw?.products || []).map((p) => Number(p.variant_id)).filter(Boolean));
}

// Main entry: called on order/paid (or order/created when it arrives already paid).
export async function attributeOrder(order) {
  const supa = db();

  // paid orders only accrue commission (golden rule: never charge unpaid/cancelled)
  if (order.payment_status !== 'paid') return null;

  const { data: existing } = await supa.from('attributions').select('id').eq('order_id', order.id).maybeSingle();
  if (existing) return existing; // one order = max one attribution

  const { data: store } = await supa.from('stores').select('*').eq('id', order.store_id).single();
  if (!store) return null;

  const match = await findMatch(supa, order, store);
  if (!match) return null; // organic sale of the brand — we charge nothing

  const channel = await resolveChannel(supa, order, match);
  const rate = Number(channel === 'agent' ? store.commission_agent : store.commission_shopping);
  const amount = roundHalfUp(Number(order.total) * rate);

  const { data: attribution, error } = await supa.from('attributions').insert({
    order_id: order.id,
    store_id: order.store_id,
    session_id: match.session_id || null,
    customer_id: match.customer_id || null,
    channel,
    match_method: match.method,
    matched_touch_id: match.touch_id || null,
    commission_rate: rate,
    commission_amount: amount,
    status: 'accrued',
  }).select('*').single();
  if (error) {
    // unique violation = concurrent webhook already attributed it; anything else bubbles up
    if (error.code === '23505') return null;
    throw new Error(`attribution insert failed: ${error.message}`);
  }
  console.log(`[attribution] order ${order.tn_order_number} (${store.slug}) -> ${channel} via ${match.method}, $${amount}`);
  return attribution;
}

// Matching in strict priority order (section 5).
async function findMatch(supa, order, store) {
  // 1) coupon: our AM- prefixed codes
  const amCoupon = (order.coupon_codes || []).find((c) => c && c.toUpperCase().startsWith('AM-'));
  if (amCoupon) {
    const { data: touch } = await supa
      .from('touches')
      .select('id, session_id, sessions(customer_id)')
      .eq('coupon_code', amCoupon.toUpperCase())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (touch) {
      return { method: 'coupon', touch_id: touch.id, session_id: touch.session_id, customer_id: touch.sessions?.customer_id };
    }
  }

  // 2) checkout_redirect within 72h with item overlap
  const orderVariants = orderVariantIds(order);
  const { data: redirects } = await supa
    .from('touches')
    .select('id, session_id, items, created_at, sessions(customer_id)')
    .eq('store_id', order.store_id)
    .eq('kind', 'checkout_redirect')
    .gte('created_at', new Date(Date.now() - REDIRECT_WINDOW_HOURS * 3600 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(200);
  for (const t of redirects || []) {
    const touchVariants = (t.items || []).map((i) => Number(i.tn_variant_id)).filter(Boolean);
    const overlaps = touchVariants.some((v) => orderVariants.has(v));
    // DECISIÓN: if the order has no line-item variant ids (fields-filtered fetch), fall back
    // to matching any redirect to this store in-window — still session-scoped evidence.
    if (overlaps || (orderVariants.size === 0 && touchVariants.length > 0)) {
      return { method: 'checkout_redirect', touch_id: t.id, session_id: t.session_id, customer_id: t.sessions?.customer_id };
    }
  }

  // 3) email match within 7 days
  if (order.customer_email) {
    const { data: customer } = await supa
      .from('customers')
      .select('id')
      .ilike('email', order.customer_email)
      .maybeSingle();
    if (customer) {
      const touch = await latestCustomerTouch(supa, customer.id, order.store_id);
      if (touch) return { method: 'email', touch_id: touch.id, session_id: touch.session_id, customer_id: customer.id };
    }
  }

  // 4) phone match within 7 days
  if (order.customer_phone) {
    const { data: customer } = await supa
      .from('customers')
      .select('id')
      .eq('phone', order.customer_phone)
      .maybeSingle();
    if (customer) {
      const touch = await latestCustomerTouch(supa, customer.id, order.store_id);
      if (touch) return { method: 'phone', touch_id: touch.id, session_id: touch.session_id, customer_id: customer.id };
    }
  }

  return null;
}

async function latestCustomerTouch(supa, customerId, storeId) {
  const { data: sessions } = await supa.from('sessions').select('id').eq('customer_id', customerId);
  const ids = (sessions || []).map((s) => s.id);
  if (!ids.length) return null;
  const { data: touch } = await supa
    .from('touches')
    .select('id, session_id')
    .eq('store_id', storeId)
    .in('session_id', ids)
    .gte('created_at', isoDaysAgo(WINDOW_DAYS))
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return touch;
}

// Agent work prevails over browsing: any agent touch in-window for that store/session -> agent channel.
async function resolveChannel(supa, order, match) {
  if (!match.session_id) return 'shopping';
  const { data: agentTouches } = await supa
    .from('touches')
    .select('id')
    .eq('store_id', order.store_id)
    .eq('session_id', match.session_id)
    .eq('channel', 'agent')
    .gte('created_at', isoDaysAgo(WINDOW_DAYS))
    .limit(1);
  return agentTouches?.length ? 'agent' : 'shopping';
}

// ---- Anti Market order (Combo A): bind a paid TN order to its checkout segment ----
// TN preserves the id across draft->paid, so the segment we created at checkout
// carries draft_order_id == this paid order's tn_order_id. Recompute the umbrella
// order's status so the guided page can show "this brand already paid".
async function recomputeGroupStatus(supa, groupId) {
  const { data: segs } = await supa
    .from('order_group_segments')
    .select('payment_status')
    .eq('group_id', groupId);
  if (!segs || !segs.length) return;
  const total = segs.length;
  const paid = segs.filter((s) => s.payment_status === 'paid').length;
  const cancelled = segs.filter((s) => s.payment_status === 'cancelled').length;
  let status = 'open';
  if (paid > 0 && paid + cancelled >= total) status = 'complete';
  else if (paid > 0) status = 'partial';
  else if (cancelled >= total) status = 'cancelled';
  await supa.from('order_groups')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', groupId);
}

export async function markSegmentPaid(order) {
  if (order.payment_status !== 'paid') return;
  const supa = db();
  const { data: seg } = await supa
    .from('order_group_segments')
    .select('id, group_id, payment_status')
    .eq('store_id', order.store_id)
    .eq('draft_order_id', order.tn_order_id)
    .maybeSingle();
  if (!seg || seg.payment_status === 'paid') return;
  await supa.from('order_group_segments').update({
    payment_status: 'paid',
    tn_order_id: order.tn_order_id,
    paid_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', seg.id);
  await recomputeGroupStatus(supa, seg.group_id);
  console.log(`[order-group] segment paid: store ${order.store_id}, tn order ${order.tn_order_id}`);
}

export async function markSegmentCancelled(order) {
  const supa = db();
  const { data: seg } = await supa
    .from('order_group_segments')
    .select('id, group_id, payment_status')
    .eq('store_id', order.store_id)
    .eq('draft_order_id', order.tn_order_id)
    .maybeSingle();
  if (!seg || seg.payment_status === 'cancelled') return;
  await supa.from('order_group_segments').update({
    payment_status: 'cancelled',
    updated_at: new Date().toISOString(),
  }).eq('id', seg.id);
  await recomputeGroupStatus(supa, seg.group_id);
}

// order/cancelled: never charge a cancelled sale.
export async function reverseOrderAttribution(order) {
  const supa = db();
  const { data: attribution } = await supa
    .from('attributions')
    .select('id, status')
    .eq('order_id', order.id)
    .maybeSingle();
  if (!attribution || attribution.status === 'reversed') return;
  // settled -> stays linked to its settlement; next settle run picks it up as a credit note
  await supa.from('attributions').update({ status: 'reversed' }).eq('id', attribution.id);
  console.log(`[attribution] reversed for order ${order.tn_order_number} (was ${attribution.status})`);
}
