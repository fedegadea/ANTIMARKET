// Admin — Carritos abandonados: guided-checkout order_groups that started but
// never completed (status open|partial), with the buyer's data and how far each
// brand segment got. 'partial' = paid some brands but not all.
import { db, userFromRequest, isAdminEmail } from '../../db.js';
import { json, err } from '../../http.js';

async function requireAdmin(request) {
  const user = await userFromRequest(request);
  return user && isAdminEmail(user.email) ? user : null;
}

export async function GET(request) {
  if (!(await requireAdmin(request))) return err(403, 'admin only');
  const supa = db();

  // only carts older than ~30 min are really "abandoned"; anything newer might
  // still be mid-checkout. We still return all non-complete for visibility, but
  // flag the fresh ones so the UI can separate them.
  const { data: groups, error } = await supa
    .from('order_groups')
    .select('id, public_token, buyer_name, buyer_email, buyer_phone, status, total, store_count, ' +
            'created_at, updated_at, ' +
            'order_group_segments(store_id, position, subtotal, payment_status, checkout_url, ' +
            'stores(name, slug))')
    .in('status', ['open', 'partial'])
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) return err(500, 'carts error');

  const now = Date.now();
  const carts = (groups || []).map((g) => {
    const segs = (g.order_group_segments || []).sort((a, b) => a.position - b.position);
    const paid = segs.filter((s) => s.payment_status === 'paid').length;
    return {
      id: g.id,
      token: g.public_token,
      buyer_name: g.buyer_name || null,
      buyer_email: g.buyer_email || null,
      buyer_phone: g.buyer_phone || null,
      status: g.status,
      total: Number(g.total || 0),
      store_count: g.store_count,
      paid_count: paid,
      created_at: g.created_at,
      minutes_ago: Math.round((now - new Date(g.created_at).getTime()) / 60000),
      brands: segs.map((s) => ({
        brand: s.stores?.name || '—',
        subtotal: Number(s.subtotal || 0),
        payment_status: s.payment_status,
      })),
    };
  });

  return json({ carts });
}
