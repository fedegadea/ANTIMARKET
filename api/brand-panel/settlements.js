// GET /api/brand-panel/settlements — settlement history for the logged-in brand.
// ?id=&format=csv downloads the settlement detail.
import { db, userFromRequest } from '../../lib/db.js';
import { json, err } from '../../lib/http.js';
import { settlementCsv } from '../../lib/settle.js';

export async function GET(request) {
  const user = await userFromRequest(request);
  if (!user) return err(401, 'login required');

  const supa = db();
  const { data: store } = await supa
    .from('stores')
    .select('id')
    .ilike('contact_email', user.email)
    .maybeSingle();
  if (!store) return err(403, 'no store for this account');

  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  if (id && url.searchParams.get('format') === 'csv') {
    const { data: settlement } = await supa.from('settlements').select('*').eq('id', id).eq('store_id', store.id).maybeSingle();
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
    .select('*')
    .eq('store_id', store.id)
    .order('period_start', { ascending: false });

  return json({
    settlements: settlements || [],
    // payment data shown in the panel (section 8.3)
    payment_info: {
      alias: process.env.PAYMENT_ALIAS || 'ANTIMARKET.MP',
      holder: 'Anti Market',
      note: 'Transferencia dentro de los 10 días de emitida la liquidación.',
    },
  });
}
