// GET /api/catalog/facets — the filter options that actually exist in the live
// catalog: the distinct sizes (across in-stock products) and the categories
// present. Powers the dynamic multi-select size filter. ?marca=<slug> scopes it
// to one brand (for the brand page).
import { db } from '../../db.js';
import { json, err, CACHE_PUBLIC } from '../../http.js';

// canonical display order; anything unknown sorts after, alphabetically
const SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL',
  '34', '35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46', '47', '48', '49', '50', '52', '54',
  '24', '26', '28', '30', '32', 'único'];

function sortSizes(list) {
  const idx = (s) => {
    const i = SIZE_ORDER.findIndex((o) => o.toLowerCase() === String(s).toLowerCase());
    return i === -1 ? 999 : i;
  };
  return list.sort((a, b) => {
    const d = idx(a) - idx(b);
    return d !== 0 ? d : String(a).localeCompare(String(b), 'es', { numeric: true });
  });
}

export async function GET(request) {
  const url = new URL(request.url);
  const marca = url.searchParams.get('marca');

  const supa = db();
  let query = supa.from('catalog_products').select('sizes, category').limit(3000);
  if (marca) query = query.eq('store_slug', marca);

  const { data, error } = await query;
  if (error) return err(500, 'facets error');

  const sizes = new Set();
  const categories = new Set();
  for (const row of data || []) {
    (row.sizes || []).forEach((s) => { if (s) sizes.add(String(s)); });
    if (row.category) categories.add(row.category);
  }

  return json({
    sizes: sortSizes([...sizes]),
    categories: [...categories],
  }, { headers: CACHE_PUBLIC });
}
