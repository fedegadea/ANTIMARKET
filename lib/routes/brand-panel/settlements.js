// GET /api/brand-panel/settlements — settlement history for the logged-in brand.
// ?id=&format=csv downloads the settlement detail.
import { db } from '../../db.js';
import { json, err } from '../../http.js';
import { settlementCsv } from '../../settle.js';
import { resolveStore } from './_store.js';

export async function GET(request) {
  const { store, errorResponse } = await resolveStore(request, 'id');
  if (errorResponse) return errorResponse;

  const supa = db();
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
