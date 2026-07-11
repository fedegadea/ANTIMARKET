// Catalog mirroring: TN is the source of truth, we only mirror (golden rule #2).
import { db } from './db.js';
import { listAllProducts, getProduct, localized } from './tn.js';

// --- size normalization (section 3) ---
const SIZE_MAP = {
  xs: 'XS', 'extra small': 'XS', 'extra-small': 'XS',
  s: 'S', small: 'S', chico: 'S',
  m: 'M', medium: 'M', mediano: 'M',
  l: 'L', large: 'L', grande: 'L',
  xl: 'XL', 'extra large': 'XL',
  xxl: 'XXL', '2xl': 'XXL', xxxl: 'XXL',
  'talle unico': 'único', 'talle único': 'único', unico: 'único', 'único': 'único',
  'one size': 'único', u: 'único', 'std': 'único',
};

export function normalizeSize(raw) {
  if (!raw) return 'único';
  const t = String(raw).trim().toLowerCase();
  if (SIZE_MAP[t]) return SIZE_MAP[t];
  const n = Number(t);
  if (Number.isInteger(n) && n >= 34 && n <= 52) return String(n);
  console.log(`[sync] unrecognized size value: "${raw}" -> único`);
  return 'único';
}

const COLOR_WORDS = /negro|blanco|rojo|azul|verde|rosa|amarillo|gris|beige|marr|celeste|violeta|lila|crudo|natural|bordo|camel|oliva|fucsia|naranja|dorado|plateado|print|estampa/i;

// TN variants have up to 3 free-form attribute values; guess which is size and which is color.
function classifyValues(values) {
  let size = null;
  let color = null;
  for (const v of values || []) {
    const text = localized(v);
    if (!text) continue;
    const t = text.trim().toLowerCase();
    const isSize = SIZE_MAP[t] || (Number.isInteger(Number(t)) && Number(t) >= 34 && Number(t) <= 52);
    if (isSize && !size) size = text;
    else if (COLOR_WORDS.test(t) && !color) color = text;
    else if (!size) size = text; // first unclassified value: assume size (most common single attribute)
    else if (!color) color = text;
  }
  return { size, color };
}

function slugify(text) {
  return String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

// Internal taxonomy (section 3). Per-store TN category id -> internal category via stores.tn_category_map.
export const INTERNAL_CATEGORIES = [
  'jeans', 'remeras', 'camisas', 'vestidos', 'abrigos', 'calzado',
  'accesorios', 'wellness', 'gourmet', 'deco', 'belleza', 'otros',
];

function mapCategory(store, tnProduct) {
  const map = store.tn_category_map || {};
  for (const cat of tnProduct.categories || []) {
    const mapped = map[String(cat.id)];
    if (mapped && INTERNAL_CATEGORIES.includes(mapped)) return mapped;
  }
  return 'otros';
}

// Upsert a single TN product (used by webhooks and full sync).
export async function upsertProductFromTN(store, tnProduct) {
  const supa = db();
  const name = localized(tnProduct.name) || 'Sin nombre';
  const row = {
    store_id: store.id,
    tn_product_id: tnProduct.id,
    slug: `${slugify(name)}-${tnProduct.id}`,
    tn_handle: localized(tnProduct.handle),
    name,
    description: localized(tnProduct.description),
    category: mapCategory(store, tnProduct),
    tn_categories: tnProduct.categories ?? null,
    tags: typeof tnProduct.tags === 'string'
      ? tnProduct.tags.split(',').map((t) => t.trim()).filter(Boolean)
      : null,
    published: tnProduct.published !== false,
    updated_at: new Date().toISOString(),
  };

  const { data: product, error } = await supa
    .from('products')
    .upsert(row, { onConflict: 'store_id,tn_product_id' })
    .select('id')
    .single();
  if (error) throw new Error(`product upsert failed (tn ${tnProduct.id}): ${error.message}`);

  // variants
  const variantRows = (tnProduct.variants || []).map((v) => {
    const { size, color } = classifyValues(v.values);
    return {
      product_id: product.id,
      tn_variant_id: v.id,
      sku: v.sku || null,
      size: normalizeSize(size),
      color: color || null,
      price: Number(v.price) || 0,
      promotional_price: v.promotional_price != null ? Number(v.promotional_price) : null,
      // stock === null in TN means "infinite stock" (stock management off) -> treat as available
      stock: v.stock === null || v.stock === undefined ? 999 : Number(v.stock),
      raw_attributes: v.values ?? null,
      updated_at: new Date().toISOString(),
    };
  });
  if (variantRows.length) {
    const { error: ve } = await supa.from('variants').upsert(variantRows, { onConflict: 'product_id,tn_variant_id' });
    if (ve) throw new Error(`variants upsert failed: ${ve.message}`);
  }
  // remove local variants that no longer exist in TN
  const keepIds = variantRows.map((v) => v.tn_variant_id);
  if (keepIds.length) {
    await supa.from('variants').delete().eq('product_id', product.id).not('tn_variant_id', 'in', `(${keepIds.join(',')})`);
  }

  // images: replace-all (simple + idempotent)
  await supa.from('product_images').delete().eq('product_id', product.id);
  const imageRows = (tnProduct.images || []).map((img, idx) => ({
    product_id: product.id,
    tn_image_id: img.id ?? null,
    src: img.src,
    position: img.position ?? idx,
  }));
  if (imageRows.length) await supa.from('product_images').insert(imageRows);

  return product.id;
}

// Full sync of a store's catalog (initial + daily reconcile). Idempotent.
export async function syncStore(storeId) {
  const supa = db();
  const { data: store, error } = await supa.from('stores').select('*').eq('id', storeId).single();
  if (error || !store) throw new Error(`store not found: ${storeId}`);

  const stats = { products: 0, variants: 0, errors: 0, unpublished: 0 };
  const tnProducts = await listAllProducts(store);
  const seenIds = [];

  for (const tnProduct of tnProducts) {
    try {
      await upsertProductFromTN(store, tnProduct);
      seenIds.push(tnProduct.id);
      stats.products += 1;
      stats.variants += (tnProduct.variants || []).length;
    } catch (e) {
      stats.errors += 1;
      console.error(`[sync ${store.slug}] product ${tnProduct.id}: ${e.message}`);
    }
  }

  // unpublish local products that disappeared from TN
  if (seenIds.length) {
    const { data: gone } = await supa
      .from('products')
      .update({ published: false, updated_at: new Date().toISOString() })
      .eq('store_id', store.id)
      .not('tn_product_id', 'in', `(${seenIds.join(',')})`)
      .select('id');
    stats.unpublished = gone?.length || 0;
  }

  await supa.from('stores').update({
    last_sync_at: new Date().toISOString(),
    last_sync_stats: stats,
  }).eq('id', store.id);

  console.log(`[sync ${store.slug}]`, JSON.stringify(stats));
  return stats;
}

// Webhook-driven single product refresh.
export async function syncSingleProduct(store, tnProductId) {
  const tnProduct = await getProduct(store, tnProductId);
  if (!tnProduct) {
    // product no longer accessible -> unpublish
    await db().from('products')
      .update({ published: false, updated_at: new Date().toISOString() })
      .eq('store_id', store.id)
      .eq('tn_product_id', tnProductId);
    return null;
  }
  return upsertProductFromTN(store, tnProduct);
}
