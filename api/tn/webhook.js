// POST /api/tn/webhook — single receiver for all TN webhooks.
// DOCS: https://tiendanube.github.io/api-documentation/resources/webhook
//   HMAC-SHA256 of the RAW body with the app's client secret,
//   header: x-linkedstore-hmac-sha256. Payload: { store_id, event, id }.
import { db } from '../../lib/db.js';
import { hmacSha256Hex, safeEqual } from '../../lib/crypto.js';
import { syncSingleProduct } from '../../lib/sync.js';
import { getOrder } from '../../lib/tn.js';
import { upsertOrderFromTN, attributeOrder, reverseOrderAttribution } from '../../lib/attribution.js';

async function log(entry) {
  try {
    await db().from('webhook_log').insert(entry);
  } catch (e) {
    console.error(`[webhook_log] ${e.message}`);
  }
}

export async function POST(request) {
  const rawBody = await request.text();

  // 1) HMAC verification — invalid signature is a hard 401.
  const signature = request.headers.get('x-linkedstore-hmac-sha256') || '';
  const expected = hmacSha256Hex(process.env.TN_CLIENT_SECRET, rawBody);
  if (!safeEqual(signature, expected)) {
    await log({ status: 'invalid_hmac', detail: `sig=${signature.slice(0, 12)}...` });
    return new Response('invalid signature', { status: 401 });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response('bad json', { status: 400 });
  }
  const { store_id: tnStoreId, event, id: resourceId } = payload;

  // 2) v1: inline processing (<5s típico). Reply after routing.
  const supa = db();
  const { data: store } = await supa.from('stores').select('*').eq('tn_store_id', tnStoreId).maybeSingle();
  if (!store) {
    await log({ tn_store_id: tnStoreId, event, resource_id: resourceId, status: 'ignored', detail: 'unknown store' });
    return new Response('ok', { status: 200 });
  }

  try {
    switch (event) {
      case 'product/created':
      case 'product/updated': {
        await syncSingleProduct(store, resourceId);
        break;
      }
      case 'product/deleted': {
        await supa.from('products')
          .update({ published: false, updated_at: new Date().toISOString() })
          .eq('store_id', store.id)
          .eq('tn_product_id', resourceId);
        break;
      }
      case 'order/created':
      case 'order/paid': {
        const tnOrder = await getOrder(store, resourceId);
        if (tnOrder) {
          const order = await upsertOrderFromTN(store, tnOrder);
          await attributeOrder(order); // no-ops unless payment_status === 'paid'
        }
        break;
      }
      case 'order/cancelled': {
        const tnOrder = await getOrder(store, resourceId);
        if (tnOrder) {
          const order = await upsertOrderFromTN(store, tnOrder);
          await reverseOrderAttribution(order);
        }
        break;
      }
      case 'app/uninstalled': {
        await supa.from('stores').update({ status: 'suspended', token_invalid: true }).eq('id', store.id);
        break;
      }
      default: {
        await log({ tn_store_id: tnStoreId, event, resource_id: resourceId, status: 'ignored', detail: 'unhandled event' });
        return new Response('ok', { status: 200 });
      }
    }
    await log({ tn_store_id: tnStoreId, event, resource_id: resourceId, status: 'ok' });
    return new Response('ok', { status: 200 });
  } catch (e) {
    console.error(`[webhook ${event}] ${e.message}`);
    await log({ tn_store_id: tnStoreId, event, resource_id: resourceId, status: 'error', detail: e.message.slice(0, 400) });
    // 500 so TN retries — reconcile cron is the final safety net either way.
    return new Response('error', { status: 500 });
  }
}
