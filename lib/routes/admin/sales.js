// Admin — Ventas: sales attributed to Anti Market, per brand and as a feed.
// Source of truth is `attributions` (one per attributed paid order), joined to
// the order (amount, buyer) and the store (brand). Small volume early on, so we
// aggregate in JS rather than fighting PostgREST for a GROUP BY.
import { db, userFromRequest, isAdminEmail } from '../../db.js';
import { json, err } from '../../http.js';

async function requireAdmin(request) {
  const user = await userFromRequest(request);
  return user && isAdminEmail(user.email) ? user : null;
}

export async function GET(request) {
  if (!(await requireAdmin(request))) return err(403, 'admin only');
  const supa = db();

  const { data: rows, error } = await supa
    .from('attributions')
    .select('commission_amount, commission_rate, channel, status, created_at, ' +
            'stores(name, slug), ' +
            'orders(total, currency, customer_email, customer_phone, tn_order_number, placed_at)')
    .order('created_at', { ascending: false })
    .limit(1000);
  if (error) return err(500, 'sales error');

  const list = rows || [];

  // per-brand rollup
  const brands = {};
  let gmv = 0, commission = 0, orderCount = 0;
  for (const r of list) {
    if (r.status === 'reversed') continue;               // don't count reversed credits
    orderCount += 1;
    const name = r.stores?.name || '—';
    const slug = r.stores?.slug || name;
    const total = Number(r.orders?.total || 0);
    const comm = Number(r.commission_amount || 0);
    gmv += total; commission += comm;
    const b = brands[slug] || (brands[slug] = { brand: name, orders: 0, gmv: 0, commission: 0, agent: 0, shopping: 0 });
    b.orders += 1; b.gmv += total; b.commission += comm;
    if (r.channel === 'agent') b.agent += 1; else b.shopping += 1;
  }

  const byBrand = Object.values(brands).sort((a, b) => b.gmv - a.gmv);

  // recent sales feed (most recent 200)
  const feed = list.slice(0, 200).map((r) => ({
    date: r.orders?.placed_at || r.created_at,
    brand: r.stores?.name || '—',
    order_number: r.orders?.tn_order_number || null,
    total: Number(r.orders?.total || 0),
    currency: r.orders?.currency || 'ARS',
    commission: Number(r.commission_amount || 0),
    channel: r.channel,
    status: r.status,
    customer: r.orders?.customer_email || r.orders?.customer_phone || '—',
  }));

  return json({
    totals: { orders: orderCount, gmv, commission },
    by_brand: byBrand,
    sales: feed,
  });
}
