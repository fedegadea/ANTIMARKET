// Admin — moderación de reseñas: listar y aprobar / ocultar / borrar.
import { db, userFromRequest, isAdminEmail } from '../../db.js';
import { json, err, readJson, isUuid } from '../../http.js';

async function requireAdmin(request) {
  const user = await userFromRequest(request);
  return user && isAdminEmail(user.email) ? user : null;
}

export async function GET(request) {
  if (!(await requireAdmin(request))) return err(403, 'admin only');
  const supa = db();
  const status = new URL(request.url).searchParams.get('status');
  let q = supa.from('reviews')
    .select('id, product_id, stars, body, author_name, status, created_at, products(name, slug, stores(name))')
    .order('created_at', { ascending: false }).limit(300);
  if (status) q = q.eq('status', status);
  const { data } = await q;
  const reviews = (data || []).map((r) => ({
    id: r.id,
    product: r.products?.name || '—',
    slug: r.products?.slug || null,
    brand: r.products?.stores?.name || '—',
    stars: r.stars,
    body: r.body || '',
    author: r.author_name || 'Cliente',
    status: r.status,
    created_at: r.created_at,
  }));
  const pending = reviews.filter((r) => r.status === 'pending').length;
  return json({ reviews, pending });
}

export async function POST(request) {
  if (!(await requireAdmin(request))) return err(403, 'admin only');
  const body = (await readJson(request)) || {};
  if (!isUuid(body.id)) return err(400, 'id required');
  const supa = db();
  if (body.action === 'delete') {
    const { error } = await supa.from('reviews').delete().eq('id', body.id);
    if (error) return err(500, 'could not delete');
    return json({ ok: true });
  }
  const status = body.action === 'approve' ? 'approved' : body.action === 'hide' ? 'hidden' : null;
  if (!status) return err(400, 'bad action');
  const { error } = await supa.from('reviews').update({ status }).eq('id', body.id);
  if (error) return err(500, 'could not update');
  return json({ ok: true });
}
