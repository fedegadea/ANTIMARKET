// GET /api/catalog/reviews?product_id= — reseñas APROBADAS de un producto + promedio.
// POST /api/catalog/reviews — el cliente deja una reseña (queda 'pending' hasta moderar).
import { db } from '../../db.js';
import { json, err, readJson, str, isUuid } from '../../http.js';

export async function GET(request) {
  const productId = new URL(request.url).searchParams.get('product_id');
  if (!isUuid(productId)) return err(400, 'product_id required');
  const supa = db();
  const { data } = await supa.from('reviews')
    .select('id, author_name, stars, body, created_at')
    .eq('product_id', productId).eq('status', 'approved')
    .order('created_at', { ascending: false }).limit(50);
  const reviews = data || [];
  const count = reviews.length;
  const avg = count ? Math.round((reviews.reduce((a, r) => a + r.stars, 0) / count) * 10) / 10 : 0;
  return json({ reviews, count, avg });
}

export async function POST(request) {
  const body = (await readJson(request)) || {};
  const productId = body.product_id;
  const stars = Math.round(Number(body.stars));
  if (!isUuid(productId)) return err(400, 'product_id required');
  if (!(stars >= 1 && stars <= 5)) return err(400, 'stars 1-5 required');
  const supa = db();
  const { data: prod } = await supa.from('products').select('id, store_id').eq('id', productId).maybeSingle();
  if (!prod) return err(404, 'product not found');
  const { error } = await supa.from('reviews').insert({
    product_id: productId,
    store_id: prod.store_id,
    author_name: str(body.author_name, { max: 60 }) || 'Cliente',
    stars,
    body: str(body.body, { max: 1000 }),
    status: 'pending',
  });
  if (error) return err(500, 'could not save review');
  return json({ ok: true });
}
