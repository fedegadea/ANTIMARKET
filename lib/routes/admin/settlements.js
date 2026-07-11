// Admin — settlements: list, mark paid, CSV, overdue visibility.
import { db, userFromRequest, isAdminEmail } from '../../db.js';
import { json, err, readJson, isUuid } from '../../http.js';
import { settlementCsv } from '../../settle.js';

async function requireAdmin(request) {
  const user = await userFromRequest(request);
  return user && isAdminEmail(user.email) ? user : null;
}

export async function GET(request) {
  if (!(await requireAdmin(request))) return err(403, 'admin only');
  const supa = db();
  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  if (id && url.searchParams.get('format') === 'csv') {
    const { data: settlement } = await supa.from('settlements').select('*').eq('id', id).maybeSingle();
    if (!settlement) return err(404, 'not found');
    const csv = await settlementCsv(settlement);
    return new Response(csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="antimarket-liquidacion-${settlement.period_start}.csv"`,
      },
    });
  }

  const { data: settlements } = await supa
    .from('settlements')
    .select('*, stores(name, slug)')
    .order('created_at', { ascending: false })
    .limit(300);
  return json({ settlements: settlements || [] });
}

export async function PATCH(request) {
  if (!(await requireAdmin(request))) return err(403, 'admin only');
  const body = await readJson(request);
  if (!body || !isUuid(body.id)) return err(400, 'invalid id');

  const patch = {};
  if (body.action === 'mark_paid') {
    patch.status = 'paid';
    patch.paid_at = new Date().toISOString();
  } else if (body.action === 'dispute') {
    patch.status = 'disputed';
  } else {
    return err(400, 'invalid action');
  }

  const { data: settlement, error } = await db().from('settlements').update(patch).eq('id', body.id).select('*').single();
  if (error) return err(500, 'update failed');
  return json({ settlement });
}
