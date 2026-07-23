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
    if (window.AMAccount && window.AMAccount.ready) {
      window.AMAccount.ready.then(function () {
        if (window.AMAccount.isLoggedIn()) renderForYou();
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
      if (minInput.value) params.set('min', minInput.value);
      if (maxInput.value) params.set('max', maxInput.value);
      const res = await api('/catalog/products?' + params);
      const emptyMsg = (qInput && qInput.value.trim())
        ? 'No encontramos nada para "' + qInput.value.trim() + '". Probá con otras palabras.'
        : 'Nada por acá todavía. Probá con otro filtro.';
      renderGrid(grid, res.products.map(productCard), emptyMsg);
    }
    [brandSel, orderSel].forEach(function (s) { s.addEventListener('change', load); });
    [minInput, maxInput].forEach(function (i) {
      i.addEventListener('input', function () { clearTimeout(debounce); debounce = setTimeout(load, 400); });
    });
    if (qInput) {
      qInput.addEventListener('input', function () { clearTimeout(debounce); debounce = setTimeout(load, 300); });
    }
    await load();
  }

  // ---------- PRODUCTO ----------
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
    (product.images.length ? product.images : [null]).slice(0, 6).forEach(function (src, i) {
      if (src) gallery.appendChild(el('img', { src: src, alt: product.name + ' — ' + product.store.name, loading: i ? 'lazy' : 'eager' }));
    });

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
      // TN descriptions are HTML: strip to text via DOMParser (inert document,
      // no script execution or resource loading — never innerHTML with external data)
      const doc = new DOMParser().parseFromString(product.description, 'text/html');
      descBox.textContent = doc.body.textContent.trim();
    }

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

    toggle.addEventListener('click', function (e) { e.stopPropagation(); pop.hidden = !pop.hidden; });
    document.addEventListener('click', function (e) { if (!container.contains(e.target)) pop.hidden = true; });

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
