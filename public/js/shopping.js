// Anti Market — shopping pages: home, marca, categoria, producto.
// Routed by <body data-page="...">.
(function () {
  'use strict';
  const { api, track, money, el, qs, paintCounters } = window.AM;

  // Two-level taxonomy: 4 top-level groups shown in "Categoría", each expanding
  // to product sub-categories shown in "Subcategoría".
  const CATEGORY_TREE = [
    { key: 'moda', label: 'Moda', subs: ['jeans', 'remeras', 'camisas', 'vestidos', 'abrigos', 'calzado'] },
    { key: 'wellness', label: 'Wellness', subs: ['wellness'] },
    { key: 'beauty', label: 'Beauty', subs: ['belleza'] },
    { key: 'accesorios', label: 'Accesorios', subs: ['accesorios'] },
    { key: 'deco', label: 'Deco', subs: ['deco'] },
  ];
  const SUB_LABELS = {
    jeans: 'Jeans', remeras: 'Remeras', camisas: 'Camisas', vestidos: 'Vestidos', abrigos: 'Abrigos',
    calzado: 'Calzado', accesorios: 'Accesorios', wellness: 'Wellness', belleza: 'Beauty', deco: 'Deco',
  };
  const subsOf = (topKey) => { const g = CATEGORY_TREE.find((x) => x.key === topKey); return g ? g.subs : []; };
  const topForSub = (sub) => { const g = CATEGORY_TREE.find((x) => x.subs.indexOf(sub) !== -1); return g ? g.key : ''; };

  // Heart overlay for a product card. Lives inside the <a>, so it must swallow
  // the click (preventDefault + stopPropagation) to avoid navigating.
  const HEART_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';
  function heartButton(productId) {
    if (!window.AMFav || !productId) return null;
    const btn = el('button', { class: 'fav-heart', type: 'button', 'aria-label': 'Guardar en favoritos' });
    btn.innerHTML = HEART_SVG;   // static markup
    const paint = function () {
      const on = window.AMFav.isFav(productId);
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    };
    paint();
    window.AMFav.onChange(paint);
    btn.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      window.AMFav.toggle(productId);
    });
    return btn;
  }

  // "Seguir marca" toggle for the brand page (favorite_stores).
  function brandFavButton(storeId) {
    if (!window.AMFav || !storeId) return null;
    const btn = el('button', { class: 'brand-fav btn btn--ghost', type: 'button' });
    const paint = function () {
      const on = window.AMFav.isBrandFav(storeId);
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.textContent = on ? '✓ Marca favorita' : '♡ Seguir marca';
    };
    paint();
    window.AMFav.onChange(paint);
    btn.addEventListener('click', function () { window.AMFav.toggleBrand(storeId); });
    return btn;
  }

  function productCard(p) {
    const promo = p.promotional_price != null && Number(p.promotional_price) < Number(p.price);
    return el('a', { class: 'card card--product', href: '/producto?slug=' + encodeURIComponent(p.slug) }, [
      el('div', { class: 'thumb' }, [
        p.image ? el('img', { src: p.image, alt: p.name + ' — ' + p.store_name, loading: 'lazy' }) : null,
        heartButton(p.id),
      ]),
      el('div', { class: 'info' }, [
        el('span', { class: 'brand', text: p.store_name }),
        el('span', { class: 'name', text: p.name }),
        el('span', { class: 'price-row' }, promo
          ? [el('span', { class: 'price promo', text: money(p.promotional_price) }), el('span', { class: 'price was', text: money(p.price) })]
          : [el('span', { class: 'price', text: money(p.price) })]),
      ]),
    ]);
  }

  function brandCard(b) {
    return el('a', { class: 'card card--brand', href: '/marca?slug=' + encodeURIComponent(b.slug) }, [
      b.logo_url ? el('img', { src: b.logo_url, alt: 'Logo de ' + b.name, loading: 'lazy' }) : null,
      el('h3', { text: b.name }),
      b.tagline ? el('span', { class: 'tagline', text: b.tagline }) : null,
    ]);
  }

  function renderGrid(target, nodes, emptyMessage) {
    target.replaceChildren();
    if (!nodes.length) {
      target.appendChild(el('p', { class: 'empty', text: emptyMessage }));
      return;
    }
    nodes.forEach(function (n) { target.appendChild(n); });
  }

  async function loadBrandsShared() {
    const data = await api('/catalog/brands');
    paintCounters(data.count);
    return data;
  }

  // ---------- HOME ----------
  async function home() {
    const data = await loadBrandsShared();
    const grid = document.querySelector('[data-brands-grid]');
    if (grid) renderGrid(grid, data.brands.map(brandCard), 'Las primeras marcas están llegando.');

    const picks = document.querySelector('[data-featured-grid]');
    if (picks) {
      let res = await api('/catalog/products?featured=1');
      if (!res.products.length) res = await api('/catalog/products'); // fallback: latest in-stock
      renderGrid(picks, res.products.slice(0, 8).map(productCard), 'Pronto vas a ver los primeros elegidos.');
    }

    // personalized section for logged-in customers ("Nuestra selección para {nombre}")
    // + CTA secundario del hero según el estado del cliente
    if (window.AMAccount && window.AMAccount.ready) {
      window.AMAccount.ready.then(function () {
        const cta2 = document.querySelector('[data-hero-cta2]');
        if (window.AMAccount.isLoggedIn()) {
          renderForYou();
          if (cta2) window.AMAccount.getProfile().then(function (p) {
            const hasAddr = p && (p.address_street || p.address_city || p.city);
            if (!hasAddr) { cta2.textContent = 'Cargá tu dirección'; cta2.href = '/cuenta'; cta2.hidden = false; }
          }).catch(function () {});
        } else if (cta2) {
          cta2.textContent = 'Crear mi cuenta';
          cta2.href = '/cuenta';
          cta2.hidden = false;
          cta2.addEventListener('click', function (e) { if (window.AMOpenAuth) { e.preventDefault(); window.AMOpenAuth('register'); } });
        }
      });
    }
  }

  async function renderForYou() {
    const section = document.querySelector('[data-foryou]');
    const grid = document.querySelector('[data-foryou-grid]');
    if (!section || !grid) return;
    try {
      const data = await window.AMAccount.getForYou();
      if (!data.products || !data.products.length) return;
      const title = document.querySelector('[data-foryou-title]');
      const sub = document.querySelector('[data-foryou-sub]');
      if (title) title.textContent = data.name ? ('Nuestra selección para ' + data.name) : 'Nuestra selección para vos';
      if (sub) sub.textContent = data.personalized
        ? 'En base a tus marcas y tus talles.'
        : 'Para arrancar. Guardá favoritos y afinamos la selección.';
      renderGrid(grid, data.products.map(productCard), '');
      section.hidden = false;
    } catch (e) { /* stay hidden on error */ }
  }

  // ---------- MARCA (local virtual) ----------
  async function marca() {
    const slug = qs('slug');
    if (!slug) { location.href = '/'; return; }
    loadBrandsShared();

    const data = await api('/catalog/brands?slug=' + encodeURIComponent(slug));
    const brand = data.brands[0];
    document.title = brand.name + ' — Anti Market';
    if (brand.brand_color && /^#[0-9a-fA-F]{6}$/.test(brand.brand_color)) {
      document.documentElement.style.setProperty('--brand-accent', brand.brand_color);
    }

    const coverBox = document.querySelector('[data-brand-cover]');
    if (brand.cover_url && coverBox) coverBox.appendChild(el('img', { src: brand.cover_url, alt: 'Portada de ' + brand.name }));
    const head = document.querySelector('[data-brand-head]');
    // NOTE: native replaceChildren() stringifies null → "null" text nodes; filter first.
    head.replaceChildren(...[
      brand.logo_url ? el('img', { src: brand.logo_url, alt: 'Logo de ' + brand.name }) : null,
      el('div', {}, [
        el('h1', { text: brand.name }),
        brand.tagline ? el('p', { class: 'muted', text: brand.tagline }) : null,
      ]),
      brand.bio ? el('p', { class: 'bio', text: brand.bio }) : null,
      brandFavButton(brand.id),
      // (link a la tienda oficial removido: la compra se completa dentro de Anti Market)
    ].filter(Boolean));

    const grid = document.querySelector('[data-products-grid]');
    const catSel = document.querySelector('[data-filter-cat]');
    const subSel = document.querySelector('[data-filter-sub]');

    const facets = await api('/catalog/facets?marca=' + encodeURIComponent(slug)).catch(function () { return { sizes: [], categories: [] }; });
    const existing = new Set(facets.categories || []);
    const catCtl = categoryFilters(catSel, subSel, existing, function () { load(); });
    const sizeCtl = sizeFilter(document.querySelector('[data-filter-talle]'), { sizes: facets.sizes, onChange: function () { load(); } });

    async function load() {
      const params = new URLSearchParams({ marca: slug });
      const cats = catCtl.cats();
      if (cats.length) params.set('cat', cats.join(','));
      const talles = sizeCtl.get();
      if (talles.length) params.set('talle', talles.join(','));
      const res = await api('/catalog/products?' + params);
      renderGrid(grid, res.products.map(productCard), 'No hay productos con ese filtro por ahora.');
    }
    await load();
  }

  // ---------- CATEGORIA (cross-brand) ----------
  async function categoria() {
    const brandsData = await loadBrandsShared();
    const grid = document.querySelector('[data-products-grid]');
    const catSel = document.querySelector('[data-filter-cat]');
    const subSel = document.querySelector('[data-filter-sub]');
    const brandSel = document.querySelector('[data-filter-marca]');
    const orderSel = document.querySelector('[data-filter-order]');
    const envioSel = document.querySelector('[data-filter-envio]');
    const provinciaSel = document.querySelector('[data-filter-provincia]');
    if (provinciaSel) {
      const savedProv = localStorage.getItem('am_prov') || '';
      provinciaSel.appendChild(el('option', { value: '', text: 'Tu provincia' }));
      window.AM.SHIP.provinces.forEach(function (p) { provinciaSel.appendChild(el('option', p === savedProv ? { value: p, text: p, selected: true } : { value: p, text: p })); });
      provinciaSel.addEventListener('change', function () { if (provinciaSel.value) { try { localStorage.setItem('am_prov', provinciaSel.value); } catch (e) {} } });
      autoProvince(function (pv) { provinciaSel.value = pv; load(); });
    }
    const minInput = document.querySelector('[data-filter-min]');
    const maxInput = document.querySelector('[data-filter-max]');
    const qInput = document.querySelector('[data-filter-q]');

    const facets = await api('/catalog/facets').catch(function () { return { sizes: [], categories: [] }; });
    const existing = new Set(facets.categories || []);
    const catCtl = categoryFilters(catSel, subSel, existing, function () { load(); });
    const sizeCtl = sizeFilter(document.querySelector('[data-filter-talle]'), {
      sizes: facets.sizes,
      initial: (qs('talle') || '').split(',').filter(Boolean),
      onChange: function () { load(); },
    });
    brandSel.appendChild(el('option', { value: '', text: 'Marca' }));
    brandsData.brands.forEach(function (b) {
      brandSel.appendChild(el('option', { value: b.slug, text: b.name }));
    });

    if (qs('cat')) catCtl.preset(qs('cat'));   // deep-link by sub-category
    if (qs('marca')) brandSel.value = qs('marca');
    if (qs('q') && qInput) qInput.value = qs('q');

    let debounce;
    async function load() {
      const params = new URLSearchParams();
      if (qInput && qInput.value.trim()) params.set('q', qInput.value.trim());
      const cats = catCtl.cats();
      if (cats.length) params.set('cat', cats.join(','));
      const talles = sizeCtl.get();
      if (talles.length) params.set('talle', talles.join(','));
      if (brandSel.value) params.set('marca', brandSel.value);
      if (orderSel.value) params.set('order', orderSel.value);
      if (envioSel && envioSel.value) params.set('envio', envioSel.value);
      if (provinciaSel && provinciaSel.value) params.set('provincia', provinciaSel.value);
      if (minInput.value) params.set('min', minInput.value);
      if (maxInput.value) params.set('max', maxInput.value);
      const res = await api('/catalog/products?' + params);
      const emptyMsg = (qInput && qInput.value.trim())
        ? 'No encontramos nada para "' + qInput.value.trim() + '". Probá con otras palabras.'
        : 'Nada por acá todavía. Probá con otro filtro.';
      renderGrid(grid, res.products.map(productCard), emptyMsg);
      if (typeof updateFilterCount === 'function') updateFilterCount();
    }
    [brandSel, orderSel, envioSel, provinciaSel].forEach(function (s) { if (s) s.addEventListener('change', load); });

    // ---- hoja de filtros (mobile, estilo Mercado Libre) ----
    const sheet = document.querySelector('[data-filters]');
    const sheetToggle = document.querySelector('[data-filters-toggle]');
    const sheetBackdrop = document.querySelector('[data-filters-backdrop]');
    function openSheet() { if (sheet) sheet.classList.add('open'); if (sheetBackdrop) sheetBackdrop.hidden = false; document.body.style.overflow = 'hidden'; }
    function closeSheet() { if (sheet) sheet.classList.remove('open'); if (sheetBackdrop) sheetBackdrop.hidden = true; document.body.style.overflow = ''; }
    if (sheetToggle) sheetToggle.addEventListener('click', openSheet);
    if (sheetBackdrop) sheetBackdrop.addEventListener('click', closeSheet);
    const sheetClose = document.querySelector('[data-filters-close]');
    if (sheetClose) sheetClose.addEventListener('click', closeSheet);
    const sheetApply = document.querySelector('[data-filters-apply]');
    if (sheetApply) sheetApply.addEventListener('click', closeSheet);
    function updateFilterCount() {
      let n = 0;
      if (catCtl.cats().length) n++;
      if (subSel && subSel.value) n++;
      if (sizeCtl.get().length) n++;
      if (envioSel && envioSel.value) n++;
      if (brandSel.value) n++;
      if (orderSel.value) n++;
      if (minInput.value || maxInput.value) n++;
      const badge = document.querySelector('[data-filters-count]');
      if (badge) { badge.textContent = String(n); badge.hidden = n === 0; }
    }
    [minInput, maxInput].forEach(function (i) {
      i.addEventListener('input', function () { clearTimeout(debounce); debounce = setTimeout(load, 400); });
    });
    if (qInput) aiSearchEnhance(qInput, { grid: grid, load: load });
    await load();
  }

  // Buscador con IA. Toggle IA/normal. En IA: interpreta el pedido (POST
  // /api/agent/search) y llena la grilla con lo recomendado — NO abre chat.
  // En normal: filtro de texto en vivo (?q). Placeholder tipo máquina de escribir.
  function aiSearchEnhance(input, ctx) {
    ctx = ctx || {};
    const box = document.querySelector('[data-ai-search]');
    const toggle = document.querySelector('[data-ai-toggle]');
    const toggleLabel = document.querySelector('[data-ai-toggle-label]');
    const goBtn = document.querySelector('[data-ai-go]');
    const summary = document.querySelector('[data-ai-summary]');
    let mode = 'ia';
    let debounce;

    function clearSummary() { if (summary) { summary.hidden = true; summary.replaceChildren(); } }
    function setMode(m) {
      mode = m;
      if (box) box.setAttribute('data-ai-mode', m);
      if (toggleLabel) toggleLabel.textContent = m === 'ia' ? 'Búsqueda con IA' : 'Búsqueda normal';
      if (m === 'normal') { input.placeholder = 'Buscar producto o marca…'; clearSummary(); }
    }
    setMode('ia');
    if (toggle) toggle.addEventListener('change', function () { setMode(toggle.checked ? 'ia' : 'normal'); });

    async function aiSearch() {
      const q = input.value.trim();
      if (!q) { clearSummary(); if (ctx.load) ctx.load(); return; }
      if (ctx.grid) renderGrid(ctx.grid, [], 'Buscando lo tuyo…');
      try {
        const res = await api('/agent/search', { method: 'POST', body: { query: q } });
        const prods = (res && res.products) || [];
        if (summary) {
          const clear = el('button', { class: 'clear', type: 'button', text: 'Ver todo' });
          clear.addEventListener('click', function () { input.value = ''; clearSummary(); if (ctx.load) ctx.load(); });
          summary.replaceChildren(el('span', { class: 'txt' }, [el('b', { text: '✨ ' + (res.summary || 'Esto encontré para vos') })]), clear);
          summary.hidden = false;
        }
        if (ctx.grid) renderGrid(ctx.grid, prods.map(productCard), 'No encontré nada con eso. Probá otras palabras o desactivá la IA.');
      } catch (e) {
        if (ctx.grid) renderGrid(ctx.grid, [], 'No pude buscar ahora. Probá de nuevo.');
      }
    }

    function submit() { if (mode === 'ia') aiSearch(); else if (ctx.load) ctx.load(); }
    if (goBtn) goBtn.addEventListener('click', submit);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
    input.addEventListener('input', function () {
      if (mode !== 'normal') return; // en IA esperamos el submit (lupa/Enter)
      clearTimeout(debounce); debounce = setTimeout(function () { if (ctx.load) ctx.load(); }, 300);
    });

    // placeholder tipo máquina de escribir (solo IA, input vacío y sin foco)
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { input.placeholder = 'Contale qué buscás…'; return; }
    const PROMPTS = [
      'Pedí una recomendación para un evento…',
      'Buscá un jean para este finde…',
      'Una rutina de skincare para piel seca…',
      'Un regalo de beauty, hasta $30.000…',
      'Algo canchero, talle M, hasta $40.000…',
      'Necesito botas para el invierno…',
    ];
    let pi = 0, ci = 0, deleting = false;
    (function tick() {
      if (mode !== 'ia' || document.activeElement === input || input.value) { setTimeout(tick, 1000); return; }
      const full = PROMPTS[pi];
      input.setAttribute('placeholder', full.slice(0, ci) + (ci < full.length ? '▏' : ''));
      let delay = deleting ? 30 : 55;
      if (!deleting) { ci++; if (ci > full.length) { deleting = true; delay = 1500; } }
      else { ci--; if (ci <= 0) { deleting = false; pi = (pi + 1) % PROMPTS.length; delay = 350; } }
      setTimeout(tick, delay);
    })();
  }

  // ---------- PRODUCTO ----------
  // Convierte la descripción HTML de TN en nodos seguros, preservando párrafos,
  // listas y TABLAS (antes las tablas llegaban como un texto larguísimo). Whitelist
  // de tags, sin atributos, sin scripts — nunca innerHTML con data externa.
  function sanitizeDesc(html) {
    const src = new DOMParser().parseFromString(String(html || ''), 'text/html').body;
    const ALLOW = { P: 1, DIV: 1, BR: 1, UL: 1, OL: 1, LI: 1, TABLE: 1, THEAD: 1, TBODY: 1, TR: 1, TH: 1, TD: 1, STRONG: 1, EM: 1, B: 1, I: 1, H3: 1, H4: 1 };
    const SKIP = { SCRIPT: 1, STYLE: 1, IFRAME: 1, NOSCRIPT: 1, LINK: 1, META: 1 };
    function walk(node, out) {
      node.childNodes.forEach(function (ch) {
        if (ch.nodeType === 3) { if (ch.textContent) out.appendChild(document.createTextNode(ch.textContent)); return; }
        if (ch.nodeType !== 1) return;
        const tag = ch.tagName;
        if (SKIP[tag]) return;
        if (ALLOW[tag]) {
          const clone = document.createElement(tag.toLowerCase());
          walk(ch, clone);
          if (tag === 'TABLE') {
            clone.className = 'desc-table';
            const wrap = document.createElement('div'); wrap.className = 'desc-table-wrap';
            wrap.appendChild(clone); out.appendChild(wrap);
          } else out.appendChild(clone);
        } else {
          walk(ch, out); // desenvuelve span/font/etc conservando el contenido
        }
      });
    }
    const frag = document.createDocumentFragment();
    walk(src, frag);
    return frag;
  }

  // Acordeón plegable (estilo Zara): título + flechita, contenido oculto por defecto.
  function accordion(title, contentNode, opts) {
    const acc = el('div', { class: 'accordion' });
    const head = el('button', { class: 'accordion-head', type: 'button', 'aria-expanded': 'false' }, [
      el('span', { text: title }), el('span', { class: 'chev', 'aria-hidden': 'true' }),
    ]);
    const body = el('div', { class: 'accordion-body' });
    body.appendChild(contentNode);
    head.addEventListener('click', function () {
      const open = acc.classList.toggle('open');
      head.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    acc.append(head, body);
    if (opts && opts.open) { acc.classList.add('open'); head.setAttribute('aria-expanded', 'true'); }
    return acc;
  }

  // ---- envío por zona (ficha de producto) ----
  const AM_PROV_KEY = 'am_prov';
  // Mapea el texto libre de la provincia del perfil a nuestra lista canónica.
  function matchProvince(text) {
    if (!text) return null;
    const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
    const t = norm(text);
    if (!t) return null;
    if (/(^|\b)(caba|capital federal|ciudad autonoma|ciudad de buenos aires)(\b|$)/.test(t)) return 'CABA';
    const provs = window.AM.SHIP.provinces;
    for (const p of provs) { if (norm(p) === t) return p; }
    for (const p of provs) { const np = norm(p); if (t.indexOf(np) >= 0 || np.indexOf(t) >= 0) return p; }
    return null;
  }
  // Provincia por defecto: elección manual (localStorage) > provincia del perfil > CABA.
  function autoProvince(setter) {
    const saved = localStorage.getItem(AM_PROV_KEY);
    if (saved) return; // el usuario ya eligió, no lo pisamos
    if (window.AMAccount && window.AMAccount.isLoggedIn && window.AMAccount.isLoggedIn()) {
      window.AMAccount.getProfile().then(function (r) {
        const pv = matchProvince(r && r.customer && r.customer.address_province);
        if (pv) setter(pv);
      }).catch(function () {});
    }
  }
  function shippingWidget(store) {
    const SHIP = window.AM.SHIP;
    const saved = localStorage.getItem(AM_PROV_KEY) || 'CABA';
    const sel = el('select', { class: 'ship-prov', 'aria-label': 'Tu provincia' });
    SHIP.provinces.forEach(function (p) { sel.appendChild(el('option', p === saved ? { value: p, text: p, selected: true } : { value: p, text: p })); });
    const line = el('div', { class: 'ship-line' });
    function paint() {
      const prov = sel.value;
      const sh = SHIP.effective(store, prov);
      line.replaceChildren(sh
        ? el('span', { class: 'ship-badge' }, [document.createTextNode('🚚 ' + sh.label), el('span', { class: 'muted', text: ' · a ' + prov })])
        : el('span', { class: 'muted', text: '🚚 Envío a coordinar con la marca' }));
    }
    sel.addEventListener('change', function () { try { localStorage.setItem(AM_PROV_KEY, sel.value); } catch (e) {} paint(); });
    paint();
    // si no eligió manualmente, autocompletar con la provincia del perfil
    autoProvince(function (pv) { sel.value = pv; paint(); });
    return el('div', { class: 'ship-box' }, [
      el('div', { class: 'ship-prov-row' }, [el('span', { class: 'muted', text: '¿A dónde te lo enviamos?' }), sel]),
      line,
    ]);
  }

  // ---- reseñas (promedio + lista + formulario, moderadas) ----
  function starsNode(n) {
    const s = el('span', { class: 'rev-stars', 'aria-hidden': 'true' });
    for (let i = 1; i <= 5; i++) s.appendChild(el('span', i <= Math.round(n) ? { class: 'on', text: '★' } : { text: '★' }));
    return s;
  }
  function reviewItem(r) {
    return el('div', { class: 'rev-item' }, [
      el('div', { class: 'rev-item-head' }, [starsNode(r.stars), el('b', { text: r.author_name || 'Cliente' })]),
      r.body ? el('p', { class: 'rev-item-body', text: r.body }) : null,
    ]);
  }
  function reviewForm(productId) {
    const form = el('form', { class: 'rev-form' });
    let picked = 0;
    const picker = el('div', { class: 'rev-picker', role: 'radiogroup', 'aria-label': 'Puntuación' });
    for (let i = 1; i <= 5; i++) {
      const star = el('button', { type: 'button', class: 'rev-star', text: '★', 'aria-label': i + ' estrellas' });
      star.addEventListener('click', function () { picked = i; picker.querySelectorAll('.rev-star').forEach(function (s, idx) { s.classList.toggle('on', idx < i); }); });
      picker.appendChild(star);
    }
    const name = el('input', { type: 'text', class: 'rev-input', placeholder: 'Tu nombre (opcional)', maxlength: '60' });
    const bodyIn = el('textarea', { class: 'rev-input', rows: '3', placeholder: 'Contá tu experiencia con el producto…', maxlength: '1000' });
    const msg = el('p', { class: 'am-form-msg' });
    const btn = el('button', { type: 'submit', class: 'btn btn--sm', text: 'Publicar reseña' });
    form.append(el('div', { class: 'rev-form-title', text: 'Dejá tu opinión' }), picker, name, bodyIn, msg, btn);
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (!picked) { msg.className = 'am-form-msg err'; msg.textContent = 'Elegí una puntuación.'; return; }
      btn.disabled = true; msg.className = 'am-form-msg'; msg.textContent = '';
      try {
        await api('/catalog/reviews', { method: 'POST', body: { product_id: productId, stars: picked, author_name: name.value, body: bodyIn.value } });
        msg.className = 'am-form-msg ok'; msg.textContent = '¡Gracias! Tu reseña queda pendiente de aprobación.';
        form.reset(); picked = 0; picker.querySelectorAll('.rev-star').forEach(function (s) { s.classList.remove('on'); });
      } catch (err) {
        msg.className = 'am-form-msg err'; msg.textContent = 'No se pudo publicar. Probá de nuevo.';
      } finally { btn.disabled = false; }
    });
    return form;
  }
  function reviewsAccordion(productId) {
    const acc = el('div', { class: 'accordion' });
    const label = el('span', {}, [document.createTextNode('Reseñas')]);
    const head = el('button', { class: 'accordion-head', type: 'button', 'aria-expanded': 'false' }, [label, el('span', { class: 'chev', 'aria-hidden': 'true' })]);
    const body = el('div', { class: 'accordion-body' });
    head.addEventListener('click', function () { const open = acc.classList.toggle('open'); head.setAttribute('aria-expanded', open ? 'true' : 'false'); });
    acc.append(head, body);
    api('/catalog/reviews?product_id=' + encodeURIComponent(productId)).then(function (data) {
      data = data || { reviews: [], count: 0, avg: 0 };
      if (data.count) {
        label.appendChild(document.createTextNode('  '));
        label.appendChild(starsNode(data.avg));
        label.appendChild(el('span', { class: 'muted', style: 'font-size:var(--text-sm);margin-left:4px', text: data.avg + ' (' + data.count + ')' }));
      }
      const list = el('div', { class: 'rev-list' });
      if (data.reviews && data.reviews.length) data.reviews.forEach(function (r) { list.appendChild(reviewItem(r)); });
      else list.appendChild(el('p', { class: 'muted', style: 'font-size:var(--text-sm)', text: 'Todavía no hay reseñas. Sé la primera en opinar.' }));
      body.append(list, reviewForm(productId));
    }).catch(function () { body.appendChild(reviewForm(productId)); });
    return acc;
  }

  async function producto() {
    const slug = qs('slug');
    if (!slug) { location.href = '/'; return; }
    loadBrandsShared();

    const { product } = await api('/catalog/product?slug=' + encodeURIComponent(slug));
    document.title = product.name + ' — ' + product.store.name + ' — Anti Market';
    if (product.store.brand_color && /^#[0-9a-fA-F]{6}$/.test(product.store.brand_color)) {
      document.documentElement.style.setProperty('--brand-accent', product.store.brand_color);
    }

    track('view_product', { store_id: product.store.id, product_id: product.id });

    const gallery = document.querySelector('[data-gallery]');
    const imgs = (product.images || []).filter(Boolean).slice(0, 6);
    imgs.forEach(function (src, i) {
      gallery.appendChild(el('img', { src: src, alt: product.name + ' — ' + product.store.name, loading: i ? 'lazy' : 'eager' }));
    });
    if (imgs.length <= 1) gallery.classList.add('is-single');
    if (imgs.length > 1) {
      // puntitos del carrusel (mobile): reflejan la foto centrada al deslizar
      const dots = el('div', { class: 'gallery-dots' });
      imgs.forEach(function (_, i) { dots.appendChild(el('span', i === 0 ? { class: 'on' } : {})); });
      gallery.after(dots);
      let raf = 0;
      gallery.addEventListener('scroll', function () {
        if (raf) return;
        raf = requestAnimationFrame(function () {
          raf = 0;
          const center = gallery.scrollLeft + gallery.clientWidth / 2;
          let best = 0, bd = Infinity;
          Array.prototype.forEach.call(gallery.children, function (im, i) {
            const mid = im.offsetLeft + im.offsetWidth / 2, d = Math.abs(mid - center);
            if (d < bd) { bd = d; best = i; }
          });
          dots.querySelectorAll('span').forEach(function (d, i) { d.classList.toggle('on', i === best); });
        });
      }, { passive: true });
    }

    const info = document.querySelector('[data-product-info]');
    const brandLink = el('a', { href: '/marca?slug=' + encodeURIComponent(product.store.slug), class: 'muted', text: product.store.name });
    info.prepend(el('p', { class: 'brand', style: 'font-size: var(--text-sm)' }, [brandLink]));
    const nameEl = document.querySelector('[data-product-name]');
    nameEl.textContent = product.name;
    const detailHeart = heartButton(product.id);
    if (detailHeart) { detailHeart.classList.add('fav-heart--detail'); nameEl.after(detailHeart); }

    const priceBox = document.querySelector('[data-product-price]');
    const descBox = document.querySelector('[data-product-desc]');
    if (product.description) {
      const frag = sanitizeDesc(product.description);
      if (frag.childNodes.length) descBox.replaceWith(accordion('Descripción', frag));
      else descBox.remove();
    } else {
      descBox.remove();
    }

    // demora de envío según la zona del cliente (elige su provincia y ve su demora real)
    const askBtn = document.querySelector('[data-ask-agent]');
    if (askBtn && product.store) askBtn.after(shippingWidget(product.store));

    // reseñas (promedio + lista + formulario, moderadas desde el admin)
    document.querySelector('[data-product-info]').appendChild(reviewsAccordion(product.id));

    // variant picker
    const picker = document.querySelector('[data-variant-picker]');
    let selected = null;
    function paintPrice(v) {
      priceBox.replaceChildren();
      const promo = v.promotional_price != null && v.promotional_price < v.price;
      priceBox.appendChild(el('span', { class: 'price', text: money(promo ? v.promotional_price : v.price) }));
      if (promo) priceBox.appendChild(el('span', { class: 'was price', text: money(v.price) }));
    }
    function label(v) {
      const parts = [];
      if (v.size && v.size !== 'único') parts.push(v.size);
      if (v.color) parts.push(v.color);
      return parts.join(' · ') || 'Único';
    }
    product.variants.forEach(function (v) {
      const chip = el('button', { class: 'variant-chip', 'aria-pressed': 'false', text: label(v) });
      chip.addEventListener('click', function () {
        picker.querySelectorAll('.variant-chip').forEach(function (c) { c.setAttribute('aria-pressed', 'false'); });
        chip.setAttribute('aria-pressed', 'true');
        selected = v;
        paintPrice(v);
      });
      picker.appendChild(chip);
    });
    picker.querySelector('.variant-chip').click();

    // size guide (if the brand loaded one for this category)
    if (product.size_chart) {
      const link = el('button', { class: 'sizechart-link', type: 'button', text: '📐 Guía de talles' });
      link.addEventListener('click', function () { openSizeChart(product.size_chart, product.store.name); });
      picker.after(link);
    }

    document.querySelector('[data-add-to-cart]').addEventListener('click', function () {
      if (!selected) return;
      window.AMCart.add({
        variant_id: selected.id,
        product_id: product.id,
        store_id: product.store.id,
        store_name: product.store.name,
        name: product.name,
        variant_label: label(selected),
        price: selected.promotional_price != null ? selected.promotional_price : selected.price,
        image: product.images[0] || null,
      });
      track('add_to_cart', { store_id: product.store.id, product_id: product.id, variant_id: selected.id });
    });

    document.querySelector('[data-ask-agent]').addEventListener('click', function () {
      if (window.AMAgent) window.AMAgent.openWithContext(product.name + ' de ' + product.store.name);
    });
  }

  // Size-guide modal (data is brand-provided; render with textContent only).
  function openSizeChart(chart, brandName) {
    const backdrop = el('div', { class: 'am-modal-backdrop' });
    const close = function () { backdrop.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = function (e) { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    backdrop.addEventListener('click', function (e) { if (e.target === backdrop) close(); });

    const head = el('tr', {}, chart.columns.map(function (c) { return el('th', { text: c }); }));
    const body = (chart.rows || []).map(function (r) {
      return el('tr', {}, chart.columns.map(function (_, i) { return el('td', { text: (r[i] != null ? String(r[i]) : '') }); }));
    });

    backdrop.appendChild(el('div', { class: 'am-modal am-modal--wide' }, [
      el('button', { class: 'am-modal-close', 'aria-label': 'Cerrar', text: '×', onclick: close }),
      el('h2', { text: chart.title || 'Guía de talles' }),
      el('p', { class: 'muted', text: brandName ? ('Medidas de ' + brandName + ' (en cm).') : 'Medidas en cm.' }),
      el('div', { class: 'sizechart-wrap' }, [
        el('table', { class: 'sizechart' }, [
          el('thead', {}, [head]),
          el('tbody', {}, body),
        ]),
      ]),
      chart.note ? el('p', { class: 'sizechart-note', text: chart.note }) : null,
    ]));
    document.body.appendChild(backdrop);
  }

  function fillSelect(select, values, placeholder) {
    select.appendChild(el('option', { value: '', text: placeholder }));
    values.forEach(function (v) { select.appendChild(el('option', { value: v, text: v })); });
  }

  // Multi-select "Talle" filter, populated with the real sizes in the catalog
  // (optionally scoped to one brand). Returns { get: () => [selected sizes] }.
  function sizeFilter(container, opts) {
    opts = opts || {};
    const selected = new Set(opts.initial || []);
    const toggle = el('button', { class: 'ms-toggle', type: 'button', 'aria-haspopup': 'true' });
    const pop = el('div', { class: 'ms-pop', hidden: true });
    container.replaceChildren(toggle, pop);

    function paintToggle() {
      toggle.replaceChildren(document.createTextNode('Talle'));
      if (selected.size) toggle.appendChild(el('span', { class: 'ms-count', text: String(selected.size) }));
      toggle.appendChild(el('span', { class: 'ms-caret', 'aria-hidden': 'true', text: '▾' }));
      toggle.classList.toggle('is-active', selected.size > 0);
    }
    paintToggle();

    // El popover se posiciona FIJO bajo el botón: así no lo recorta el overflow
    // de la barra de filtros (que en mobile scrollea horizontalmente).
    function positionPop() {
      const r = toggle.getBoundingClientRect();
      pop.style.position = 'fixed';
      pop.style.top = Math.round(r.bottom + 4) + 'px';
      pop.style.left = Math.round(Math.min(r.left, window.innerWidth - 200)) + 'px';
      pop.style.minWidth = Math.round(Math.max(r.width, 176)) + 'px';
    }
    function closePop() { pop.hidden = true; }
    toggle.addEventListener('click', function (e) {
      e.stopPropagation();
      const willOpen = pop.hidden;
      pop.hidden = !willOpen;
      if (willOpen) positionPop();
    });
    document.addEventListener('click', function (e) { if (!container.contains(e.target) && e.target !== pop && !pop.contains(e.target)) closePop(); });
    // si algo scrollea (página o la propia barra de filtros) cerramos para no quedar desalineados
    window.addEventListener('scroll', function () { if (!pop.hidden) closePop(); }, true);
    window.addEventListener('resize', function () { if (!pop.hidden) positionPop(); });

    function build(sizes) {
      if (!sizes.length) { toggle.disabled = true; toggle.title = 'Sin talles cargados'; return; }
      sizes.forEach(function (s) {
        const cb = el('input', { type: 'checkbox', value: s });
        if (selected.has(s)) cb.checked = true;
        cb.addEventListener('change', function () {
          if (cb.checked) selected.add(s); else selected.delete(s);
          paintToggle();
          if (opts.onChange) opts.onChange();
        });
        pop.appendChild(el('label', { class: 'ms-opt' }, [cb, document.createTextNode(' ' + s)]));
      });
      const clear = el('button', { class: 'ms-clear', type: 'button', text: 'Limpiar' });
      clear.addEventListener('click', function () {
        selected.clear();
        pop.querySelectorAll('input').forEach(function (i) { i.checked = false; });
        paintToggle();
        if (opts.onChange) opts.onChange();
      });
      pop.appendChild(clear);
    }

    // preloaded sizes (from a shared facets fetch) or fetch our own
    if (opts.sizes) build(opts.sizes);
    else {
      const url = '/catalog/facets' + (opts.marca ? '?marca=' + encodeURIComponent(opts.marca) : '');
      api(url).then(function (data) { build((data && data.sizes) || []); }).catch(function () {});
    }

    return { get: function () { return [...selected]; } };
  }

  // Build the two-level Categoría / Subcategoría selects. `existing` is the Set
  // of product categories that actually have stock. Returns { cats: () => [...] }.
  function categoryFilters(catSel, subSel, existing, onChange) {
    // top groups that have at least one existing sub
    catSel.replaceChildren(el('option', { value: '', text: 'Categoría' }));
    CATEGORY_TREE.forEach(function (g) {
      if (g.subs.some(function (s) { return existing.has(s); })) {
        catSel.appendChild(el('option', { value: g.key, text: g.label }));
      }
    });

    function refreshSubs() {
      subSel.replaceChildren(el('option', { value: '', text: 'Subcategoría' }));
      const subs = subsOf(catSel.value).filter(function (s) { return existing.has(s); });
      subs.forEach(function (s) { subSel.appendChild(el('option', { value: s, text: SUB_LABELS[s] || s })); });
      subSel.disabled = !catSel.value || !subs.length;
    }
    refreshSubs();

    catSel.addEventListener('change', function () { refreshSubs(); onChange(); });
    subSel.addEventListener('change', onChange);

    return {
      // resolve the product-categories to send: the chosen sub, or every existing
      // sub of the chosen top group.
      cats: function () {
        if (subSel.value) return [subSel.value];
        if (catSel.value) return subsOf(catSel.value).filter(function (s) { return existing.has(s); });
        return [];
      },
      // deep-link support: preselect from a ?cat= sub value
      preset: function (sub) {
        const top = topForSub(sub);
        if (!top) return;
        catSel.value = top; refreshSubs(); subSel.value = sub;
      },
    };
  }

  // ---------- OUTLET (discounted, brand-curated) ----------
  async function outlet() {
    loadBrandsShared();
    const grid = document.querySelector('[data-products-grid]');
    const empty = 'Todavía no hay nada en el Outlet. Volvé pronto — las marcas van sumando prendas.';
    try {
      const res = await api('/catalog/products?outlet=1');
      renderGrid(grid, res.products.map(productCard), empty);
    } catch (e) {
      renderGrid(grid, [], empty);
    }
  }

  const page = document.body.dataset.page;
  const routes = { home: home, marca: marca, categoria: categoria, producto: producto, outlet: outlet };
  if (routes[page]) {
    routes[page]().catch(function (e) {
      console.error(e);
      const main = document.querySelector('main .container') || document.body;
      main.appendChild(el('p', { class: 'empty', text: 'Algo no cargó bien. Probá de nuevo en un ratito.' }));
    });
  } else {
    loadBrandsShared().catch(function () {});
  }
})();
