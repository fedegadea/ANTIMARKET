// GET /api/catalog/brands — active brands (safe columns only) + network count.
import { db } from '../../db.js';
import { json, err, CACHE_PUBLIC } from '../../http.js';

export async function GET(request) {
  const url = new URL(request.url);
  const slug = url.searchParams.get('slug');

  const supa = db();
  let query = supa
    .from('stores')
    .select('id, name, slug, category, logo_url, cover_url, brand_color, tagline, bio, tn_url')
    .eq('status', 'active')
    .order('name');
  if (slug) query = query.eq('slug', slug);

  const { data, error } = await query;
  if (error) return err(500, 'brands error');
  if (slug && !data?.length) return err(404, 'not found');

  return json({ brands: data || [], count: data?.length || 0 }, { headers: CACHE_PUBLIC });
}
