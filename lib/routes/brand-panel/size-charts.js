// /api/brand-panel/size-charts — the brand manages its size guides. A chart is
// either CATEGORY-scoped (applies to every product of a category) or PRODUCT-
// scoped (applies only to the chosen products). Measurements are in centimetres.
// Auth via resolveStore (brand by contact_email, or admin with ?store=<slug>).
import { db } from '../../db.js';
import { json, err, readJson, str, isUuid } from '../../http.js';
import { resolveStore } from './_store.js';

const CATEGORIES = ['jeans', 'remeras', 'camisas', 'vestidos', 'abrigos', 'calzado',
  'accesorios', 'wellness', 'deco', 'belleza', 'otros'];
const MAX_COLS = 8;
const MAX_ROWS = 40;

function cleanTable(body) {
  const columns = (Array.isArray(body.columns) ? body.columns : [])
    .slice(0, MAX_COLS).map((c) => str(c, { max: 40 })).filter(Boolean);
  const rows = (Array.isArray(body.rows) ? body.rows : [])
    .slice(0, MAX_ROWS)
    .map((r) => (Array.isArray(r) ? r.slice(0, columns.length || MAX_COLS).map((c) => str(c, { max: 40 })) : []))
    .filter((r) => r.some((c) => c));
  return { columns, rows };
}

export async function GET(request) {
  const { store, errorResponse } = await resolveStore(request, 'id, name');
  if (errorResponse) return errorResponse;
  const supa = db();

  // the store's own products (for the product picker) and the categories it
  // actually has stock in (so the category dropdown shows only real ones).
  const { data: products } = await supa
    .from('products').select('id, name, category').eq('store_id', store.id).eq('published', true).order('name');
  const cats = [];
  for (const p of products || []) { if (p.category && cats.indexOf(p.category) === -1) cats.push(p.category); }

  const { data: charts } = await supa
    .from('size_charts').select('id, category, scope, title, columns, rows, note, updated_at').eq('store_id', store.id);

  // attach assigned product_ids to product-scoped charts
  const chartIds = (charts || []).map((c) => c.id);
  const byChart = {};
  if (chartIds.length) {
    const { data: links } = await supa.from('size_chart_products').select('chart_id, product_id').in('chart_id', chartIds);
    for (const l of links || []) { (byChart[l.chart_id] = byChart[l.chart_id] || []).push(l.product_id); }
  }
  const outCharts = (charts || []).map((c) => ({ ...c, product_ids: byChart[c.id] || [] }));

  return json({
    categories: cats,                       // only categories the store actually has
    all_categories: CATEGORIES,             // full taxonomy (fallback)
    products: (products || []).map((p) => ({ id: p.id, name: p.name, category: p.category })),
    charts: outCharts,
    unit: 'cm',
  });
}

export async function POST(request) {
  const { store, errorResponse } = await resolveStore(request, 'id, name');
  if (errorResponse) return errorResponse;
  const supa = db();
  const body = (await readJson(request)) || {};
  const scope = body.scope === 'products' ? 'products' : 'category';
  const { columns, rows } = cleanTable(body);
  const empty = !columns.length || !rows.length;

  const base = {
    title: str(body.title, { max: 80 }) || null,
    columns,
    rows,
    note: str(body.note, { max: 500 }) || null,
    updated_at: new Date().toISOString(),
  };

  // ---------- category-scoped ----------
  if (scope === 'category') {
    const category = str(body.category, { max: 24 });
    if (!CATEGORIES.includes(category)) return err(400, 'invalid category');
    if (empty) {
      await supa.from('size_charts').delete().eq('store_id', store.id).eq('category', category).eq('scope', 'category');
      return json({ ok: true, cleared: true });
    }
    const { error } = await supa.from('size_charts')
      .upsert({ store_id: store.id, category, scope: 'category', ...base }, { onConflict: 'store_id,category' });
    if (error) return err(500, 'could not save');
    return json({ ok: true });
  }

  // ---------- product-scoped ----------
  // validate the chosen products belong to this store
  const ids = (Array.isArray(body.product_ids) ? body.product_ids : []).filter(isUuid).slice(0, 200);
  let chartId = isUuid(body.id) ? body.id : null;

  // deleting an existing product chart
  if (empty) {
    if (chartId) await supa.from('size_charts').delete().eq('id', chartId).eq('store_id', store.id);
    return json({ ok: true, cleared: true });
  }
  if (!ids.length) return err(400, 'elegí al menos un producto');

  const { data: owned } = await supa.from('products').select('id').eq('store_id', store.id).in('id', ids);
  const ownedIds = (owned || []).map((p) => p.id);
  if (!ownedIds.length) return err(400, 'productos inválidos');

  // upsert the chart row (update if editing, else insert)
  if (chartId) {
    const { error } = await supa.from('size_charts').update({ scope: 'products', category: null, ...base })
      .eq('id', chartId).eq('store_id', store.id);
    if (error) return err(500, 'could not save');
  } else {
    const { data: created, error } = await supa.from('size_charts')
      .insert({ store_id: store.id, scope: 'products', category: null, ...base }).select('id').single();
    if (error || !created) return err(500, 'could not save');
    chartId = created.id;
  }

  // set this chart's product assignments exactly to ownedIds:
  //  - drop those products from any other chart (a product has one chart)
  //  - clear this chart's current assignments, then insert the new ones
  await supa.from('size_chart_products').delete().in('product_id', ownedIds);
  await supa.from('size_chart_products').delete().eq('chart_id', chartId);
  await supa.from('size_chart_products').insert(ownedIds.map((pid) => ({ chart_id: chartId, product_id: pid })));

  return json({ ok: true, id: chartId });
}
