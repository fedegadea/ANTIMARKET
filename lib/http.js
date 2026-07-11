// Shared helpers for Vercel Web Handler functions (Request -> Response).

export function json(data, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });
}

export function err(status, message) {
  return json({ error: message }, { status });
}

// Public catalog cache policy (section 13.4)
export const CACHE_PUBLIC = { 'cache-control': 's-maxage=60, stale-while-revalidate=300' };

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export function getCookie(request, name) {
  const cookie = request.headers.get('cookie') || '';
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function clientIp(request) {
  return (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
}

// --- minimal validation (no deps; zod allowed by spec but not needed) ---
export function str(v, { max = 500 } = {}) {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t || t.length > max) return null;
  return t;
}

export function optStr(v, opts) {
  if (v === undefined || v === null || v === '') return null;
  return str(v, opts);
}

export function isEmail(v) {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) && v.length <= 254;
}

export function isHexColor(v) {
  return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
}

export function posInt(v, { max = 1000000 } = {}) {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0 || n > max) return null;
  return n;
}

export function isUuid(v) {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

// Normalize AR phone to E.164-ish: digits only, drop leading 0 and "15", ensure 549 prefix (section 5).
export function normalizePhone(raw) {
  if (!raw) return null;
  let d = String(raw).replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('549')) return d.length >= 12 ? d : null;
  if (d.startsWith('54')) d = d.slice(2);
  if (d.startsWith('0')) d = d.slice(1);
  // drop mobile "15" after area code: heuristic — remove first occurrence of '15' right after 2-4 digit area code
  d = d.replace(/^(\d{2,4})15(\d{6,8})$/, '$1$2');
  if (d.length < 10) return null;
  return '549' + d;
}

// Route dispatcher for dynamic-segment functions (api/x/[y].js) — keeps us
// under Vercel Hobby's 12-functions-per-deployment limit by folding each
// group of endpoints into a single function.
export function dispatcher(modules) {
  const handle = (method) => async (request) => {
    const parts = new URL(request.url).pathname.split('/').filter(Boolean);
    const key = parts[parts.length - 1].replace(/\.js$/, '');
    const mod = modules[key];
    if (!mod) return err(404, 'not found');
    const fn = mod[method];
    if (!fn) return err(405, 'method not allowed');
    return fn(request);
  };
  return { GET: handle('GET'), POST: handle('POST'), PATCH: handle('PATCH') };
}

// Guard for cron endpoints: Vercel sends "Authorization: Bearer ${CRON_SECRET}".
export function isCronAuthorized(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}
