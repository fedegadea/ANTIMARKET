// Demora de envío — presets, provincias argentinas y resolución por zona.
// Compartido por el catálogo (filtro) y la ficha de producto.

export const PROVINCES = [
  'CABA', 'Buenos Aires', 'Catamarca', 'Chaco', 'Chubut', 'Córdoba', 'Corrientes',
  'Entre Ríos', 'Formosa', 'Jujuy', 'La Pampa', 'La Rioja', 'Mendoza', 'Misiones',
  'Neuquén', 'Río Negro', 'Salta', 'San Juan', 'San Luis', 'Santa Cruz', 'Santa Fe',
  'Santiago del Estero', 'Tierra del Fuego', 'Tucumán',
];

// Presets de demora que la marca elige por zona (min/max en días hábiles).
export const PRESETS = [
  { key: '24h', label: 'Recibís en 24 hs', min: 1, max: 1 },
  { key: '48h', label: 'Recibís en 48 hs', min: 1, max: 2 },
  { key: '72h', label: 'Recibís en 2 a 3 días', min: 2, max: 3 },
  { key: '5d', label: 'Recibís en menos de 5 días', min: 3, max: 5 },
  { key: '7d', label: 'Recibís en 5 a 7 días', min: 5, max: 7 },
  { key: '10d', label: 'Recibís en 7 a 10 días', min: 7, max: 10 },
  { key: '15d', label: 'Recibís en 10 a 15 días', min: 10, max: 15 },
];

export function presetByKey(key) {
  return PRESETS.find((p) => p.key === key) || null;
}

// Resuelve la demora efectiva de una tienda para una provincia dada.
// store: { shipping_rules, shipping_min_days, shipping_max_days }
// Devuelve { label, min, max, preset } o null si la marca no cargó nada.
export function effectiveShipping(store, province) {
  const rules = Array.isArray(store && store.shipping_rules) ? store.shipping_rules : [];
  let rule = null;
  if (province) rule = rules.find((r) => Array.isArray(r.zones) && r.zones.indexOf(province) >= 0);
  if (!rule) rule = rules.find((r) => !r.zones || !r.zones.length); // regla "resto del país"
  if (rule) {
    const p = presetByKey(rule.preset);
    if (p) return { label: p.label, min: p.min, max: p.max, preset: p.key };
  }
  // fallback legado (bloque 11): min/max simple
  const mn = store && store.shipping_min_days;
  const mx = store && store.shipping_max_days;
  if (mx != null) {
    const label = (mn != null && mn !== mx) ? ('Llega en ' + mn + ' a ' + mx + ' días hábiles') : ('Llega en hasta ' + mx + ' días hábiles');
    return { label, min: mn != null ? mn : null, max: mx, preset: null };
  }
  return null;
}
