// GET /api/catalog/products — public listing over the catalog_products view.
// Query: cat, talle, marca (store slug), min, max, featured=1, order=novedades|precio_asc|precio_desc, page
import { db } from '../../lib/db.js';
import { json, err, CACHE_PUBLIC } from '../../lib/http.js';

const PAGE_SIZE = 24;

export async function GET(request) {
  const url = new URL(request.url);
  const q = (k) => url.searchParams.get(k);

  const supa = db();
  let query = supa.from('catalog_products').select('*', { count: 'exact' });

  if (q('cat')) query = query.eq('category', q('cat'));
  if (q('marca')) query = query.eq('store_slug', q('marca'));
  if (q('talle')) query = query.contains('sizes', [q('talle')]);
  if (q('featured') === '1') query = query.eq('featured', true);
  const min = Number(q('min'));
  const max = Number(q('max'));
  if (min > 0) query = query.gte('price', min);
  if (max > 0) query = query.lte('price', max);

  switch (q('order')) {
    case 'precio_asc': query = query.order('price', { ascending: true }); break;
    case 'precio_desc': query = query.order('price', { ascending: false }); break;
    default: query = query.order('created_at', { ascending: false });
  }

  const page = Math.max(1, Number(q('page')) || 1);
  query = query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  const { data, count, error } = await query;
  if (error) return err(500, 'catalog error');

  return json(
    { products: data || [], total: count || 0, page, page_size: PAGE_SIZE },
    { headers: CACHE_PUBLIC },
  );
}
