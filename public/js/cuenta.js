// Anti Market — /cuenta: favorites, favorite brands and profile.
// Relies on account.js (window.AMAccount / window.AMFav) for identity + state.
(function () {
  'use strict';
  const { api, el, money, toast } = window.AM;
  const A = window.AMAccount;
  const F = window.AMFav;

  const guest = document.querySelector('[data-guest]');
  const account = document.querySelector('[data-account]');

  function show(node, on) { node.hidden = !on; }

  // ---------- tabs ----------
  document.querySelectorAll('.account-tabs button').forEach(function (tab) {
    tab.addEventListener('click', function () {
      document.querySelectorAll('.account-tabs button').forEach(function (b) { b.classList.remove('is-active'); });
      document.querySelectorAll('.account-panel').forEach(function (p) { p.classList.remove('is-active'); });
      tab.classList.add('is-active');
      document.querySelector('[data-panel="' + tab.dataset.tab + '"]').classList.add('is-active');
    });
  });

  // ---------- product card (favorites grid) ----------
  function favCard(p) {
    const promo = p.promotional_price != null && Number(p.promotional_price) < Number(p.price);
    const remove = el('button', { class: 'fav-heart is-on', type: 'button', 'aria-label': 'Quitar de favoritos' });
    remove.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';
    remove.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      F.toggle(p.id); // onChange re-renders the grid
    });
    return el('a', { class: 'card card--product', href: '/producto?slug=' + encodeURIComponent(p.slug) }, [
      el('div', { class: 'thumb' }, [
        p.image ? el('img', { src: p.image, alt: p.name + ' — ' + p.store_name, loading: 'lazy' }) : null,
        remove,
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

  async function renderFavorites() {
    const grid = document.querySelector('[data-fav-grid]');
    const ids = F.list();
    if (!ids.length) {
      grid.replaceChildren(el('p', { class: 'fav-empty', text: 'Todavía no guardaste nada. Tocá el corazón en cualquier producto.' }));
      return;
    }
    try {
      const res = await api('/catalog/products?ids=' + encodeURIComponent(ids.join(',')));
      // keep only still-available products; preserve favorite order
      const byId = {};
      (res.products || []).forEach(function (p) { byId[p.id] = p; });
      const nodes = ids.map(function (id) { return byId[id]; }).filter(Boolean).map(favCard);
      grid.replaceChildren.apply(grid, nodes.length ? nodes
        : [el('p', { class: 'fav-empty', text: 'Tus favoritos ya no están disponibles.' })]);
    } catch (e) {
      grid.replaceChildren(el('p', { class: 'fav-empty', text: 'No pudimos cargar tus favoritos.' }));
    }
  }

  async function renderFavBrands() {
    const box = document.querySelector('[data-fav-brands]');
    const ids = new Set(F.listBrands());
    if (!ids.size) {
      box.replaceChildren(el('p', { class: 'fav-empty', text: 'Seguí tus marcas y las vas a ver acá.' }));
      return;
    }
    try {
      const data = await api('/catalog/brands');
      const mine = (data.brands || []).filter(function (b) { return ids.has(b.id); });
      if (!mine.length) { box.replaceChildren(el('p', { class: 'fav-empty', text: 'Seguí tus marcas y las vas a ver acá.' })); return; }
      box.replaceChildren.apply(box, mine.map(function (b) {
        const unfollow = el('button', { class: 'linklike', type: 'button', text: '✕', title: 'Dejar de seguir' });
        unfollow.addEventListener('click', function () { F.toggleBrand(b.id); });
        return el('span', { class: 'brand-chip' }, [
          b.logo_url ? el('img', { src: b.logo_url, alt: '' }) : null,
          el('a', { href: '/marca?slug=' + encodeURIComponent(b.slug), text: b.name }),
          unfollow,
        ]);
      }));
    } catch (e) {
      box.replaceChildren(el('p', { class: 'fav-empty', text: 'No pudimos cargar tus marcas.' }));
    }
  }

  // ---------- profile ----------
  const TEXT_FIELDS = ['name', 'phone', 'size_top', 'size_bottom', 'size_shoes', 'style_notes',
    'identification', 'address_street', 'address_number', 'address_floor',
    'address_locality', 'address_city', 'address_province', 'address_zipcode'];

  async function loadProfile() {
    const form = document.querySelector('[data-profile-form]');
    try {
      const { customer } = await A.getProfile();
      form.email.value = customer.email || '';
      TEXT_FIELDS.forEach(function (f) { if (form[f]) form[f].value = customer[f] || ''; });
      form.opt_in_marketing.checked = !!customer.opt_in_marketing;
      const hello = document.querySelector('[data-hello]');
      if (hello) hello.textContent = customer.name ? ('Hola, ' + customer.name) : 'Tu cuenta';
    } catch (e) {}
  }

  function wireProfileForm() {
    const form = document.querySelector('[data-profile-form]');
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      const msg = form.querySelector('[data-profile-msg]');
      const btn = form.querySelector('button[type=submit]');
      msg.textContent = ''; btn.disabled = true;
      try {
        const patch = { opt_in_marketing: form.opt_in_marketing.checked };
        TEXT_FIELDS.forEach(function (f) { if (form[f]) patch[f] = form[f].value; });
        await A.saveProfile(patch);
        msg.className = 'am-form-msg ok'; msg.textContent = 'Guardado.';
        toast('Perfil guardado');
        const hello = document.querySelector('[data-hello]');
        if (hello) hello.textContent = form.name.value ? ('Hola, ' + form.name.value) : 'Tu cuenta';
      } catch (err) {
        msg.className = 'am-form-msg err'; msg.textContent = 'No se pudo guardar.';
      } finally { btn.disabled = false; }
    });
  }

  // ---------- boot ----------
  document.querySelector('[data-open-login]').addEventListener('click', function () { A.openLogin(); });
  const logoutBtn = document.querySelector('[data-logout]');
  if (logoutBtn) logoutBtn.addEventListener('click', function () { A.logout(); });

  let wasLogged = false;
  function sync() {
    const logged = A.isLoggedIn();
    show(guest, !logged);
    show(account, logged);
    if (logged) {
      renderFavorites();
      renderFavBrands();
      if (!wasLogged) loadProfile(); // only on the guest→logged transition (and boot)
    }
    wasLogged = logged;
  }

  // fires on boot session check, on login (afterLogin emit), and on every fav toggle
  A.onChange(sync);
  A.ready.then(sync);
  wireProfileForm();
})();
