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

  // size guide (measurements in cm): a product-specific chart wins over the
  // brand's category chart.
  let sizeChart = null;
  const usable = (sc) => sc && Array.isArray(sc.columns) && sc.columns.length && Array.isArray(sc.rows) && sc.rows.length
    ? { title: sc.title, columns: sc.columns, rows: sc.rows, note: sc.note } : null;

  const { data: link } = await supa.from('size_chart_products').select('chart_id').eq('product_id', product.id).maybeSingle();
  if (link) {
    const { data: sc } = await supa.from('size_charts').select('title, columns, rows, note').eq('id', link.chart_id).maybeSingle();
    sizeChart = usable(sc);
  }
  if (!sizeChart && product.category) {
    const { data: sc } = await supa
      .from('size_charts').select('title, columns, rows, note')
      .eq('store_id', product.store_id).eq('category', product.category).eq('scope', 'category').maybeSingle();
    sizeChart = usable(sc);
  }

  // datos de envío: query aparte y TOLERANTE (si aún no se corrió la migración
  // de shipping, no rompemos la ficha — devolvemos vacío).
  let shipMin = null, shipMax = null, shipRules = [];
  const { data: srow, error: srowErr } = await supa
    .from('stores').select('shipping_min_days, shipping_max_days, shipping_rules').eq('id', product.store_id).maybeSingle();
  if (!srowErr && srow) {
    shipMin = srow.shipping_min_days != null ? srow.shipping_min_days : null;
    shipMax = srow.shipping_max_days != null ? srow.shipping_max_days : null;
    shipRules = Array.isArray(srow.shipping_rules) ? srow.shipping_rules : [];
  }

  return json({
    product: {
      id: product.id,
      slug: product.slug,
      name: product.name,
      description: product.description,
      category: product.category,
      size_chart: sizeChart,
      store: {
        id: product.stores.id,
        name: product.stores.name,
        slug: product.stores.slug,
        logo_url: product.stores.logo_url,
        brand_color: product.stores.brand_color,
        shipping_min_days: shipMin,
        shipping_max_days: shipMax,
        shipping_rules: shipRules,
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
