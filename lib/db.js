import { createClient } from '@supabase/supabase-js';

let _admin = null;

// Service-role client. ONLY for serverless code — never expose to the browser.
export function db() {
  if (!_admin) {
    _admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _admin;
}

// Resolve the Supabase auth user behind a Bearer token (brand panel / admin).
export async function userFromRequest(request) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  const { data, error } = await db().auth.getUser(token);
  if (error || !data?.user?.email) return null;
  return data.user;
}

export function isAdminEmail(email) {
  const list = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return !!email && list.includes(email.toLowerCase());
}
