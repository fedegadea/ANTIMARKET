// /api/brand-panel/shipping — la marca configura su demora por ZONA. Reglas:
// [{ preset: '48h', zones: ['CABA','Buenos Aires'] }, { preset:'7d', zones: [] }]
// zones: [] = resto del país (default). Se muestra en el producto y habilita el filtro.
import { db } from '../../db.js';
import { json, err, readJson } from '../../http.js';
import { resolveStore } from './_store.js';
import { PRESETS, PROVINCES, presetByKey } from '../../shipping.js';

export async function GET(request) {
  const { store, errorResponse } = await resolveStore(request, 'id, shipping_rules');
  if (errorResponse) return errorResponse;
  return json({
    rules: Array.isArray(store.shipping_rules) ? store.shipping_rules : [],
    presets: PRESETS,
    provinces: PROVINCES,
  });
}

export async function POST(request) {
  const { store, errorResponse } = await resolveStore(request, 'id');
  if (errorResponse) return errorResponse;
  const body = (await readJson(request)) || {};
  const provSet = new Set(PROVINCES);
  const rules = Array.isArray(body.rules) ? body.rules.slice(0, 30).map((r) => ({
    preset: presetByKey(r && r.preset) ? r.preset : null,
    zones: Array.isArray(r && r.zones) ? r.zones.filter((z) => provSet.has(z)).slice(0, 24) : [],
  })).filter((r) => r.preset) : [];
  const { error } = await db().from('stores').update({ shipping_rules: rules }).eq('id', store.id);
  if (error) return err(500, 'could not save');
  return json({ ok: true, rules });
}
