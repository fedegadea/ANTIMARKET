// Anti Market — shared frontend core: API client, session cookie, tracking, utils.
// All rendering uses textContent / createElement — never innerHTML with external data.
(function () {
  'use strict';

  // --- first-party session cookie (am_sid, 1 year, SameSite=Lax) ---
  function getCookie(name) {
    const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]+)'));
    return m ? decodeURIComponent(m[1]) : null;
  }
  function ensureAnonId() {
    let id = getCookie('am_sid');
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2));
      document.cookie = 'am_sid=' + id + '; Path=/; Max-Age=31536000; SameSite=Lax';
    }
    return id;
  }
  const anonId = ensureAnonId();

  async function api(path, options) {
    const res = await fetch('/api' + path, {
      headers: { 'content-type': 'application/json' },
      ...options,
      body: options && options.body ? JSON.stringify(options.body) : undefined,
    });
    if (!res.ok) {
      const data = await res.json().catch(function () { return {}; });
      throw new Error(data.error || ('HTTP ' + res.status));
    }
    return res.json();
  }

  function track(kind, data) {
    // fire-and-forget: tracking never blocks the page
    api('/session/track', {
      method: 'POST',
      body: Object.assign({ anon_id: anonId, kind: kind }, data || {}),
    }).catch(function () {});
  }

  function money(n) {
    return '$' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  // element factory: el('div', {class: 'x', onclick: fn}, [children|strings])
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    for (const key in (attrs || {})) {
      const v = attrs[key];
      if (v === null || v === undefined || v === false) continue;
      if (key.indexOf('on') === 0 && typeof v === 'function') node.addEventListener(key.slice(2), v);
      else if (key === 'text') node.textContent = v;
      else node.setAttribute(key === 'class' ? 'class' : key, v === true ? '' : v);
    }
    for (const child of (children || [])) {
      if (child === null || child === undefined) continue;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    }
    return node;
  }

  function toast(message) {
    const t = el('div', { class: 'toast', role: 'status', text: message });
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2500);
  }

  function qs(name) {
    return new URLSearchParams(location.search).get(name);
  }

  // brand count in header/footer counters
  function paintCounters(count) {
    document.querySelectorAll('[data-brand-count]').forEach(function (node) {
      node.textContent = String(count);
    });
  }

  // --- envíos: provincias AR + presets de demora + resolución por zona ---
  var SHIP = {
    provinces: ['CABA', 'Buenos Aires', 'Catamarca', 'Chaco', 'Chubut', 'Córdoba', 'Corrientes',
      'Entre Ríos', 'Formosa', 'Jujuy', 'La Pampa', 'La Rioja', 'Mendoza', 'Misiones', 'Neuquén',
      'Río Negro', 'Salta', 'San Juan', 'San Luis', 'Santa Cruz', 'Santa Fe', 'Santiago del Estero',
      'Tierra del Fuego', 'Tucumán'],
    presets: [
      { key: '24h', label: 'Recibís en 24 hs', min: 1, max: 1 },
      { key: '48h', label: 'Recibís en 48 hs', min: 1, max: 2 },
      { key: '72h', label: 'Recibís en 2 a 3 días', min: 2, max: 3 },
      { key: '5d', label: 'Recibís en menos de 5 días', min: 3, max: 5 },
      { key: '7d', label: 'Recibís en 5 a 7 días', min: 5, max: 7 },
      { key: '10d', label: 'Recibís en 7 a 10 días', min: 7, max: 10 },
      { key: '15d', label: 'Recibís en 10 a 15 días', min: 10, max: 15 },
    ],
    preset: function (key) { return SHIP.presets.filter(function (p) { return p.key === key; })[0] || null; },
    // demora efectiva de una tienda (rules jsonb) para una provincia
    effective: function (store, province) {
      var rules = (store && Array.isArray(store.shipping_rules)) ? store.shipping_rules : [];
      var rule = null;
      if (province) rule = rules.filter(function (r) { return Array.isArray(r.zones) && r.zones.indexOf(province) >= 0; })[0];
      if (!rule) rule = rules.filter(function (r) { return !r.zones || !r.zones.length; })[0];
      if (rule) { var p = SHIP.preset(rule.preset); if (p) return { label: p.label, min: p.min, max: p.max, preset: p.key }; }
      var mx = store && store.shipping_max_days, mn = store && store.shipping_min_days;
      if (mx != null) return { label: (mn != null && mn !== mx) ? ('Llega en ' + mn + ' a ' + mx + ' días hábiles') : ('Llega en hasta ' + mx + ' días hábiles'), min: mn, max: mx, preset: null };
      return null;
    },
  };

  window.AM = { api: api, track: track, money: money, el: el, toast: toast, qs: qs, anonId: anonId, paintCounters: paintCounters, SHIP: SHIP };
})();
