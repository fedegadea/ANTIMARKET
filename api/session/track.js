// POST /api/session/track — upserts the anonymous session and records touches.
// Body: { anon_id, kind?, store_id?, product_id?, variant_id? }
import { db } from '../../lib/db.js';
import { json, err, readJson, str, isUuid } from '../../lib/http.js';

const SHOPPING_KINDS = ['view_product', 'add_to_cart'];

export async function POST(request) {
  const body = await readJson(request);
  if (!body) return err(400, 'invalid body');

  const anonId = str(body.anon_id, { max: 80 });
  if (!anonId || !/^[a-zA-Z0-9-]{8,80}$/.test(anonId)) return err(400, 'invalid anon_id');

  const supa = db();
  const { data: session, error } = await supa
    .from('sessions')
    .upsert({ anon_id: anonId, last_seen_at: new Date().toISOString() }, { onConflict: 'anon_id' })
    .select('id, customer_id')
    .single();
  if (error) return err(500, 'session error');

  // touch is optional: a bare ping just refreshes last_seen
  const kind = body.kind ? str(body.kind, { max: 30 }) : null;
  if (kind) {
    if (!SHOPPING_KINDS.includes(kind)) return err(400, 'invalid kind'); // agent kinds are server-emitted only
    if (!isUuid(body.store_id)) return err(400, 'store_id required');
    const touch = {
      session_id: session.id,
      store_id: body.store_id,
      channel: 'shopping',
      kind,
      product_id: isUuid(body.product_id) ? body.product_id : null,
      variant_id: isUuid(body.variant_id) ? body.variant_id : null,
    };
    const { error: te } = await supa.from('touches').insert(touch);
    if (te) {
      // bad FK (deleted product etc.) shouldn't break the page
      console.warn(`[track] touch insert failed: ${te.message}`);
    }
  }

  return json({ ok: true, session_id: session.id });
}
