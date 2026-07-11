// Anti Market — shopping pages: home, marca, categoria, producto.
// Routed by <body data-page="...">.
(function () {
  'use strict';
  const { api, track, money, el, qs, paintCounters } = window.AM;

  const INTERNAL_CATEGORIES = ['jeans', 'remeras', 'camisas', 'vestidos', 'abrigos', 'calzado', 'accesorios', 'wellness', 'gourmet', 'deco', 'belleza', 'otros'];
  const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '34', '36', '38', '40', '42', '44', '46', '48', '50', '52', 'único'];

  function productCard(p) {
    const promo = p.promotional_price != null && Number(p.promotional_price) < Number(p.price);
    return el('a', { class: 'card card--product', href: '/producto?slug=' + encodeURIComponent(p.slug) }, [
      el('div', { class: 'thumb' }, [
        p.image ? el('img', { src: p.image, alt: p.name + ' — ' + p.store_name, loading: 'lazy' }) : null,
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
    head.replaceChildren(
      brand.logo_url ? el('img', { src: brand.logo_url, alt: 'Logo de ' + brand.name }) : null,
      el('div', {}, [
        el('h1', { text: brand.name }),
        brand.tagline ? el('p', { class: 'muted', text: brand.tagline }) : null,
      ]),
      brand.bio ? el('p', { class: 'bio', text: brand.bio }) : null,
      el('a', { class: 'visit', href: brand.tn_url, target: '_blank', rel: 'noopener', text: 'Visitar tienda oficial ↗' }),
    );

    const grid = document.querySelector('[data-products-grid]');
    const catSel = document.querySelector('[data-filter-cat]');
    const sizeSel = document.querySelector('[data-filter-talle]');
    fillSelect(catSel, INTERNAL_CATEGORIES, 'Categoría');
    fillSelect(sizeSel, SIZES, 'Talle');

    async function load() {
      const params = new URLSearchParams({ marca: slug });
      if (catSel.value) params.set('cat', catSel.value);
      if (sizeSel.value) params.set('talle', sizeSel.value);
      const res = await api('/catalog/products?' + params);
      renderGrid(grid, res.products.map(productCard), 'No hay productos con ese filtro por ahora.');
    }
    catSel.addEventListener('change', load);
    sizeSel.addEventListener('change', load);
    await load();
  }

  // ---------- CATEGORIA (cross-brand) ----------
  async function categoria() {
    const brandsData = await loadBrandsShared();
    const grid = document.querySelector('[data-products-grid]');
    const catSel = document.querySelector('[data-filter-cat]');
    const sizeSel = document.querySelector('[data-filter-talle]');
    const brandSel = document.querySelector('[data-filter-marca]');
    const orderSel = document.querySelector('[data-filter-order]');
    const minInput = document.querySelector('[data-filter-min]');
    const maxInput = document.querySelector('[data-filter-max]');

    fillSelect(catSel, INTERNAL_CATEGORIES, 'Categoría');
    fillSelect(sizeSel, SIZES, 'Talle');
    brandSel.appendChild(el('option', { value: '', text: 'Marca' }));
    brandsData.brands.forEach(function (b) {
      brandSel.appendChild(el('option', { value: b.slug, text: b.name }));
    });

    if (qs('cat')) catSel.value = qs('cat');
    if (qs('talle')) sizeSel.value = qs('talle');
    if (qs('marca')) brandSel.value = qs('marca');

    let debounce;
    async function load() {
      const params = new URLSearchParams();
      if (catSel.value) params.set('cat', catSel.value);
      if (sizeSel.value) params.set('talle', sizeSel.value);
      if (brandSel.value) params.set('marca', brandSel.value);
      if (orderSel.value) params.set('order', orderSel.value);
      if (minInput.value) params.set('min', minInput.value);
      if (maxInput.value) params.set('max', maxInput.value);
      const res = await api('/catalog/products?' + params);
      renderGrid(grid, res.products.map(productCard), 'Nada por acá todavía. Probá con otro filtro.');
    }
    [catSel, sizeSel, brandSel, orderSel].forEach(function (s) { s.addEventListener('change', load); });
    [minInput, maxInput].forEach(function (i) {
      i.addEventListener('input', function () { clearTimeout(debounce); debounce = setTimeout(load, 400); });
    });
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
    document.querySelector('[data-product-name]').textContent = product.name;

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

  function fillSelect(select, values, placeholder) {
    select.appendChild(el('option', { value: '', text: placeholder }));
    values.forEach(function (v) { select.appendChild(el('option', { value: v, text: v })); });
  }

  const page = document.body.dataset.page;
  const routes = { home: home, marca: marca, categoria: categoria, producto: producto };
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
