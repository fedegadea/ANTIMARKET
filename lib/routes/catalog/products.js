// GET /api/catalog/products — public listing over the catalog_products view.
// Query: cat, talle, marca (store slug), min, max, featured=1, order=novedades|precio_asc|precio_desc, page
import { db } from '../../db.js';
import { json, err, CACHE_PUBLIC } from '../../http.js';

const PAGE_SIZE = 24;

export async function GET(request) {
  const url = new URL(request.url);
  const q = (k) => url.searchParams.get(k);

  const supa = db();
  let query = supa.from('catalog_products').select('*', { count: 'exact' });

  // by explicit ids (favorites): return just those, no paging/order tricks
  if (q('ids')) {
    const ids = q('ids').split(',').map((s) => s.trim())
      .filter((s) => /^[0-9a-f-]{36}$/i.test(s)).slice(0, 100);
    if (!ids.length) return json({ products: [], total: 0 }, { headers: CACHE_PUBLIC });
    const { data, error } = await supa.from('catalog_products').select('*').in('id', ids);
    if (error) return err(500, 'catalog error');
    return json({ products: data || [], total: (data || []).length }, { headers: CACHE_PUBLIC });
  }

  // cat: one product category, or several (comma-separated) when a top-level
  // group like "Moda" expands to all its sub-categories.
  if (q('cat')) {
    const cats = q('cat').split(',').map((c) => c.trim()).filter(Boolean).slice(0, 20);
    if (cats.length === 1) query = query.eq('category', cats[0]);
    else if (cats.length > 1) query = query.in('category', cats);
  }
  if (q('marca')) query = query.eq('store_slug', q('marca'));
  // talle: one or many (comma-separated). Match products having ANY of them.
  if (q('talle')) {
    const talles = q('talle').split(',').map((t) => t.trim()).filter(Boolean).slice(0, 30);
    if (talles.length === 1) query = query.contains('sizes', talles);
    else if (talles.length > 1) query = query.overlaps('sizes', talles);
  }
  // free-text search over product name and brand name. Strip chars that would
  // break PostgREST's or()/ilike syntax before interpolating.
  const term = (q('q') || '').trim().replace(/[%,()*\\]/g, ' ').slice(0, 60);
  if (term) query = query.or(`name.ilike.%${term}%,store_name.ilike.%${term}%`);
  if (q('featured') === '1') query = query.eq('featured', true);
  // Outlet: brand-curated discounted items (only real discounts qualify)
  if (q('outlet') === '1') query = query.eq('outlet', true).not('promotional_price', 'is', null);
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
