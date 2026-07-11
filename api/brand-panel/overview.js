// GET /api/brand-panel/overview — month summary + attributed orders for the logged-in brand.
// Auth: Supabase OTP; the user's email must match stores.contact_email.
import { db, userFromRequest } from '../../lib/db.js';
import { json, err } from '../../lib/http.js';

export async function GET(request) {
  const user = await userFromRequest(request);
  if (!user) return err(401, 'login required');

  const supa = db();
  const { data: store } = await supa
    .from('stores')
    .select('id, name, slug, status, commission_shopping, commission_agent')
    .ilike('contact_email', user.email)
    .maybeSingle();
  if (!store) return err(403, 'no store for this account');

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const { data: attributions } = await supa
    .from('attributions')
    .select('id, channel, match_method, commission_rate, commission_amount, status, created_at, orders(tn_order_number, total, placed_at, payment_status)')
    .eq('store_id', store.id)
    .order('created_at', { ascending: false })
    .limit(500);

  const rows = (attributions || []).filter((a) => a.status !== 'reversed');
  const month = rows.filter((a) => new Date(a.created_at) >= monthStart);

  const summary = {
    month_sales: sum(month.map((a) => Number(a.orders?.total || 0))),
    month_sales_shopping: sum(month.filter((a) => a.channel === 'shopping').map((a) => Number(a.orders?.total || 0))),
    month_sales_agent: sum(month.filter((a) => a.channel === 'agent').map((a) => Number(a.orders?.total || 0))),
    month_orders: month.length,
    month_commission_accrued: sum(month.filter((a) => a.status === 'accrued').map((a) => Number(a.commission_amount))),
  };

  // daily series for the simple chart (current month)
  const daily = {};
  for (const a of month) {
    const day = (a.orders?.placed_at || a.created_at).slice(0, 10);
    daily[day] = (daily[day] || 0) + Number(a.orders?.total || 0);
  }

  return json({
    store: { name: store.name, slug: store.slug, status: store.status },
    summary,
    daily_sales: Object.entries(daily).sort().map(([date, total]) => ({ date, total })),
    orders: (attributions || []).slice(0, 100).map((a) => ({
      tn_order_number: a.orders?.tn_order_number,
      placed_at: a.orders?.placed_at,
      total: Number(a.orders?.total || 0),
      channel: a.channel,
      match_method: a.match_method,
      commission: Number(a.commission_amount),
      status: a.status,
    })),
  });
}

function sum(list) {
  return Math.round(list.reduce((acc, n) => acc + n, 0) * 100) / 100;
}
