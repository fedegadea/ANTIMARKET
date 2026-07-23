// /api/brand-panel/outlet — the brand curates which of its discounted products
// appear in Anti Market's Outlet (for extra rotation). GET lists the brand's
// products with price/discount/outlet; POST toggles one product's outlet flag.
// Only discounted products (promotional_price < price) can be added.
import { db } from '../../db.js';
import { json, err, readJson, isUuid } from '../../http.js';
import { resolveStore } from './_store.js';

export async function GET(request) {
  const { store, errorResponse } = await resolveStore(request, 'id, name');
  if (errorResponse) return errorResponse;

  const { data } = await db()
    .from('catalog_products')
    .select('id, name, image, price, promotional_price, outlet')
    .eq('store_id', store.id)
    .order('name');

  const products = (data || []).map((p) => ({
    id: p.id, name: p.name, image: p.image,
    price: p.price, promotional_price: p.promotional_price,
    discounted: p.promotional_price != null && Number(p.promotional_price) < Number(p.price),
    outlet: !!p.outlet,
  }));
  return json({ products });
}

export async function POST(request) {
  const { store, errorResponse } = await resolveStore(request, 'id');
  if (errorResponse) return errorResponse;
  const body = (await readJson(request)) || {};
  if (!isUuid(body.product_id)) return err(400, 'product_id required');

  // the product must belong to this store
  const { data: prod } = await db().from('products').select('id').eq('id', body.product_id).eq('store_id', store.id).maybeSingle();
  if (!prod) return err(404, 'product not found');

  const { error } = await db().from('products').update({ outlet: !!body.outlet }).eq('id', body.product_id);
  if (error) return err(500, 'could not update');
  return json({ ok: true, outlet: !!body.outlet });
}
