// /api/tn/privacy — LGPD/compliance webhooks required by the TN partner portal.
// Three topics, one handler, discriminated by ?topic=:
//   store_redact           — store uninstalled 48h+ ago; wipe its credentials.
//   customers_redact       — erase a specific customer's personal data.
//   customers_data_request — customer asked for their data; log for manual reply.
//
// DOCS: same HMAC scheme as the main webhook — SHA256 of the RAW body with the
//   app client secret, header x-linkedstore-hmac-sha256.
import { db } from '../../db.js';
import { hmacSha256Hex, safeEqual } from '../../crypto.js';

async function log(entry) {
  try { await db().from('webhook_log').insert(entry); } catch (e) { console.error(`[privacy log] ${e.message}`); }
}

// GET: TN may probe the URL when saving the app config — answer 200 so it validates.
export async function GET() {
  return new Response('ok', { status: 200 });
}

export async function POST(request) {
  const rawBody = await request.text();

  // HMAC gate (same as the main webhook).
  const signature = request.headers.get('x-linkedstore-hmac-sha256') || '';
  const expected = hmacSha256Hex(process.env.TN_CLIENT_SECRET, rawBody);
  if (!safeEqual(signature, expected)) {
    await log({ event: 'privacy', status: 'invalid_hmac', detail: `sig=${signature.slice(0, 12)}…` });
    return new Response('invalid signature', { status: 401 });
  }

  let payload = {};
  try { payload = JSON.parse(rawBody || '{}'); } catch { /* keep {} */ }

  const topic = new URL(request.url).searchParams.get('topic') || payload.topic || 'unknown';
  const supa = db();

  try {
    if (topic === 'customers_redact') {
      // Erase the customer's personal data. Attribution rows keep working by id.
      const email = (payload.customer?.email || payload.email || '').toLowerCase() || null;
      const phone = payload.customer?.phone || payload.phone || null;
      if (email) {
        await supa.from('customers').update({
          email: null, phone: null, name: null, style_notes: null,
          size_top: null, size_bottom: null, size_shoes: null,
        }).ilike('email', email);
      } else if (phone) {
        await supa.from('customers').update({ email: null, phone: null, name: null }).eq('phone', phone);
      }
    } else if (topic === 'store_redact') {
      // Store gone: drop credentials, keep the row for settlement history integrity.
      const tnStoreId = payload.store_id || payload.store?.id || null;
      if (tnStoreId) {
        await supa.from('stores').update({ status: 'removed', token_invalid: true }).eq('tn_store_id', tnStoreId);
      }
    }
    // customers_data_request: nothing to erase — logged below for a manual export.

    await log({ event: `privacy/${topic}`, status: 'ok' });
    return new Response('ok', { status: 200 });
  } catch (e) {
    console.error(`[privacy ${topic}] ${e.message}`);
    await log({ event: `privacy/${topic}`, status: 'error', detail: e.message.slice(0, 300) });
    return new Response('error', { status: 500 });
  }
}
