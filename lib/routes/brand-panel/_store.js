// Shared store resolver for the brand panel. A brand user is matched by
// stores.contact_email == their login email. An ADMIN can act on any store by
// passing ?store=<slug> (so the owner can manage/onboard brands without needing
// each brand's inbox). Returns { store } or { errorResponse }.
import { db, userFromRequest, isAdminEmail } from '../../db.js';
import { err } from '../../http.js';

export async function resolveStore(request, columns) {
  const cols = columns || 'id';
  const user = await userFromRequest(request);
  if (!user) return { errorResponse: err(401, 'login required') };

  const supa = db();
  const storeSlug = new URL(request.url).searchParams.get('store');

  // admin override: manage a specific store by slug
  if (storeSlug && isAdminEmail(user.email)) {
    const { data } = await supa.from('stores').select(cols).eq('slug', storeSlug).maybeSingle();
    if (!data) return { errorResponse: err(404, 'store not found') };
    return { store: data, user, asAdmin: true };
  }

  // brand user: match by their contact email
  const { data } = await supa.from('stores').select(cols).ilike('contact_email', user.email).maybeSingle();
  if (!data) return { errorResponse: err(403, 'no store for this account'), user };
  return { store: data, user };
}
