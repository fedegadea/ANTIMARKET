// Tienda Nube API client.
// DOCS: https://tiendanube.github.io/api-documentation/intro
//   Base URL: https://api.tiendanube.com/{version}/{store_id}
//   Auth: "Authorization: Bearer {token}" + mandatory User-Agent.
// DOCS: https://tiendanube.github.io/api-documentation/authentication
//   Authorize: https://www.tiendanube.com/apps/{app_id}/authorize?state=...
//   Token: POST https://www.tiendanube.com/apps/authorize/token
import { db } from './db.js';
import { decryptToken } from './crypto.js';

const API_VERSION = '2025-03';
const USER_AGENT = 'Anti Market (federicosegundogadea@gmail.com)';

export function authorizeUrl(state) {
  return `https://www.tiendanube.com/apps/${process.env.TN_APP_ID}/authorize?state=${encodeURIComponent(state)}`;
}

export async function exchangeCode(code) {
  const res = await fetch('https://www.tiendanube.com/apps/authorize/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': USER_AGENT },
    body: JSON.stringify({
      client_id: process.env.TN_APP_ID,
      client_secret: process.env.TN_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(`TN token exchange failed: ${res.status} ${JSON.stringify(data)}`);
  }
  // DOCS: response = { access_token, token_type, scope, user_id } where user_id is the store id.
  return { accessToken: data.access_token, tnStoreId: Number(data.user_id ?? data.store_id) };
}

// Low-level fetch against a store's API. `store` is a stores row (encrypted token).
// On 401 the token was revoked (app uninstalled) -> suspend store and flag it.
export async function tnFetch(store, path, { method = 'GET', body, query } = {}) {
  const token = decryptToken(store.access_token);
  const url = new URL(`https://api.tiendanube.com/${API_VERSION}/${store.tn_store_id}${path}`);
  for (const [k, v] of Object.entries(query || {})) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      'user-agent': USER_AGENT,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    await db().from('stores').update({ status: 'suspended', token_invalid: true }).eq('id', store.id);
    throw new Error(`TN 401 for store ${store.slug}: token invalid, store suspended`);
  }
  if (res.status === 404) return { status: 404, data: null, headers: res.headers };
  if (res.status === 429) {
    // Leaky bucket: wait for reset and retry once.
    const wait = Number(res.headers.get('x-rate-limit-reset') || 1000);
    await new Promise((r) => setTimeout(r, Math.min(wait, 5000)));
    return tnFetch(store, path, { method, body, query });
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`TN ${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  return { status: res.status, data, headers: res.headers };
}

// TN multilanguage fields come as {"es": "..."} objects (or plain strings on single-language stores).
export function localized(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'object') return v.es ?? v.pt ?? v.en ?? Object.values(v)[0] ?? null;
  return String(v);
}

export async function listAllProducts(store) {
  const all = [];
  let page = 1;
  for (;;) {
    const { status, data } = await tnFetch(store, '/products', {
      query: { page, per_page: 200 },
    });
    if (status === 404 || !Array.isArray(data) || data.length === 0) break;
    all.push(...data);
    if (data.length < 200) break;
    page += 1;
    if (page > 100) break; // hard cap: 20k products
  }
  return all;
}

export async function getStoreInfo(store) {
  const { data } = await tnFetch(store, '/store');
  return data;
}

export async function getProduct(store, tnProductId) {
  const { data } = await tnFetch(store, `/products/${tnProductId}`);
  return data;
}

export async function getOrder(store, tnOrderId) {
  const { data } = await tnFetch(store, `/orders/${tnOrderId}`);
  return data;
}

// DOCS: https://tiendanube.github.io/api-documentation/resources/webhook
export async function registerWebhooks(store) {
  const base = process.env.PUBLIC_BASE_URL;
  const events = [
    'product/created', 'product/updated', 'product/deleted',
    'order/created', 'order/paid', 'order/cancelled',
    'app/uninstalled',
  ];
  const { data: existing } = await tnFetch(store, '/webhooks');
  const have = new Set((existing || []).map((w) => `${w.event}|${w.url}`));
  const url = `${base}/api/tn/webhook`;
  const results = [];
  for (const event of events) {
    if (have.has(`${event}|${url}`)) continue;
    try {
      const { data } = await tnFetch(store, '/webhooks', { method: 'POST', body: { event, url } });
      results.push({ event, id: data?.id });
    } catch (e) {
      results.push({ event, error: e.message });
    }
  }
  return results;
}

// DOCS: https://tiendanube.github.io/api-documentation/resources/coupon
export async function createCoupon(store, code, pct) {
  const body = pct > 0
    ? { code, type: 'percentage', value: String(pct), max_uses: 1 }
    : { code, type: 'absolute', value: '0.01', max_uses: 1 }; // 0%: marker-only coupon (min value TN accepts)
  const { data } = await tnFetch(store, '/coupons', { method: 'POST', body });
  return data;
}

// DOCS: https://tiendanube.github.io/api-documentation/resources/draft-order
// Draft order returns checkout_url — our Fase A checkout handoff mechanism.
// `shippingAddress` (optional) prefills the buyer's address at checkout so they
// load it once and it carries into every brand. `identification` = DNI/CUIT.
export async function createDraftOrder(store, {
  items, contactName, contactLastname, contactEmail, contactPhone, identification, shippingAddress,
}) {
  const body = {
    contact_name: contactName,
    contact_lastname: contactLastname || '-',
    contact_email: contactEmail,
    ...(contactPhone ? { contact_phone: contactPhone } : {}),
    ...(identification ? { contact_identification: identification } : {}),
    payment_status: 'unpaid',
    sale_channel: 'anti-market',
    note: 'Pedido iniciado en Anti Market',
    products: items.map((i) => ({ variant_id: i.tn_variant_id, quantity: i.qty })),
  };
  // Only attach the address if we have at least street + city/locality; a partial
  // address is worse than none (TN may reject it).
  const addr = buildShippingAddress(shippingAddress);
  if (addr) body.shipping_address = addr;
  const { data } = await tnFetch(store, '/draft_orders', { method: 'POST', body });
  return data;
}

// Map our stored address to TN's shipping_address shape. Returns null if there's
// not enough to be useful, so the caller can skip it cleanly.
function buildShippingAddress(a) {
  if (!a) return null;
  const street = (a.street || '').trim();
  const city = (a.city || a.locality || '').trim();
  if (!street || !city) return null;
  const addr = {
    address: street,
    ...(a.number ? { number: String(a.number).trim() } : {}),
    ...(a.floor ? { floor: String(a.floor).trim() } : {}),
    ...(a.locality ? { locality: String(a.locality).trim() } : {}),
    city,
    ...(a.province ? { province: String(a.province).trim() } : {}),
    ...(a.zipcode ? { zipcode: String(a.zipcode).trim() } : {}),
    country: (a.country || 'AR').trim().toUpperCase().slice(0, 2),
  };
  return addr;
}
