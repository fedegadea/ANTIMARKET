// GET /api/catalog/product?slug= — full product detail (in-stock variants only).
import { db } from '../../db.js';
import { json, err, str, CACHE_PUBLIC } from '../../http.js';

export async function GET(request) {
  const url = new URL(request.url);
  const slug = str(url.searchParams.get('slug'), { max: 120 });
  if (!slug) return err(400, 'slug required');

  const supa = db();
  const { data: product, error } = await supa
    .from('products')
    .select(`
      id, slug, name, description, category, created_at, store_id,
      stores!inner(id, name, slug, logo_url, brand_color, tn_url, status),
      variants(id, size, color, price, promotional_price, stock, sku),
      product_images(src, position)
    `)
    .eq('slug', slug)
    .eq('published', true)
    .eq('stores.status', 'active')
    .maybeSingle();
  if (error) return err(500, 'catalog error');
  if (!product) return err(404, 'not found');

  const variants = (product.variants || []).filter((v) => v.stock > 0);
  if (!variants.length) return err(404, 'not found'); // never show sold-out products

  return json({
    product: {
      id: product.id,
      slug: product.slug,
      name: product.name,
      description: product.description,
      category: product.category,
      store: {
        id: product.stores.id,
        name: product.stores.name,
        slug: product.stores.slug,
        logo_url: product.stores.logo_url,
        brand_color: product.stores.brand_color,
      },
      images: (product.product_images || []).sort((a, b) => a.position - b.position).map((i) => i.src),
      variants: variants.map((v) => ({
        id: v.id, size: v.size, color: v.color,
        price: Number(v.price),
        promotional_price: v.promotional_price != null ? Number(v.promotional_price) : null,
        stock: v.stock,
      })),
    },
  }, { headers: CACHE_PUBLIC });
}
