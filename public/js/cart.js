// Anti Market — local cart (localStorage), grouped by brand, checkout handoff.
// Fase A: payment always happens in each brand's own store.
(function () {
  'use strict';
  const { api, money, el, toast, anonId } = window.AM;
  const KEY = 'am_cart_v1';

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
  }
  function save(items) {
    localStorage.setItem(KEY, JSON.stringify(items));
    paintFab();
  }

  function add(item) {
    const items = load();
    const existing = items.find(function (i) { return i.variant_id === item.variant_id; });
    if (existing) existing.qty += 1;
    else items.push(Object.assign({ qty: 1 }, item));
    save(items);
    toast('Agregado a tu selección');
  }

  function remove(variantId) {
    save(load().filter(function (i) { return i.variant_id !== variantId; }));
    renderCart();
  }

  // --- UI ---
  const fab = el('button', { class: 'cart-fab', 'aria-label': 'Tu selección', hidden: true, text: 'Tu selección' });
  const drawer = el('div', { class: 'drawer', role: 'dialog', 'aria-label': 'Tu selección' }, [
    el('div', { class: 'drawer-backdrop' }),
    el('div', { class: 'drawer-panel' }, [
      el('button', { class: 'close', 'aria-label': 'Cerrar', text: '×' }),
      el('h3', { text: 'Tu selección' }),
      el('div', { 'data-cart-body': '' }),
    ]),
  ]);
  document.body.appendChild(fab);
  document.body.appendChild(drawer);
  const body = drawer.querySelector('[data-cart-body]');

  fab.addEventListener('click', function () { drawer.classList.add('open'); renderCart(); });
  drawer.querySelector('.close').addEventListener('click', function () { drawer.classList.remove('open'); });
  drawer.querySelector('.drawer-backdrop').addEventListener('click', function () { drawer.classList.remove('open'); });

  function paintFab() {
    const n = load().reduce(function (acc, i) { return acc + i.qty; }, 0);
    fab.hidden = n === 0;
    fab.textContent = 'Tu selección (' + n + ')';
  }

  function groupByStore(items) {
    const map = new Map();
    items.forEach(function (i) {
      if (!map.has(i.store_id)) map.set(i.store_id, { store_name: i.store_name, items: [] });
      map.get(i.store_id).items.push(i);
    });
    return Array.from(map.values());
  }

  function renderCart() {
    const items = load();
    body.replaceChildren();
    if (!items.length) {
      body.appendChild(el('p', { class: 'empty', text: 'Todavía no elegiste nada.' }));
      return;
    }

    groupByStore(items).forEach(function (group) {
      const subtotal = group.items.reduce(function (acc, i) { return acc + i.price * i.qty; }, 0);
      body.appendChild(el('div', { class: 'cart-group' }, [
        el('div', { class: 'store', text: group.store_name }),
        ...group.items.map(function (i) {
          return el('div', { class: 'cart-line' }, [
            el('span', {}, [
              el('span', { text: i.name }),
              el('span', { class: 'qty', text: ' · ' + i.variant_label + ' × ' + i.qty }),
            ]),
            el('span', { class: 'price', text: money(i.price * i.qty) }),
            el('button', { text: 'Quitar', onclick: function () { remove(i.variant_id); } }),
          ]);
        }),
        el('div', { class: 'cart-subtotal' }, [
          el('span', { text: 'Subtotal' }),
          el('span', { class: 'price', text: money(subtotal) }),
        ]),
      ]));
    });

    const stores = groupByStore(items).length;
    if (stores > 1) {
      body.appendChild(el('p', { class: 'handoff-note', text: 'Elegiste de ' + stores + ' marcas: vas a recibir un paquete por marca.' }));
    }
    body.appendChild(el('button', { class: 'btn', style: 'width:100%', text: 'Continuar la compra', onclick: renderBuyerForm }));
  }

  // Step 2: minimal buyer info (draft orders need it; email doubles as attribution evidence)
  function renderBuyerForm() {
    body.replaceChildren(
      el('p', { class: 'handoff-note', text: 'Te guiamos marca por marca para completar el pago, con los medios y el envío de cada una. Dejanos tu nombre y email para armar el pedido.' }),
      el('form', { class: 'form-grid' }, [
        el('label', {}, ['Nombre y apellido', el('input', { name: 'name', required: true, autocomplete: 'name' })]),
        el('label', {}, ['Email', el('input', { name: 'email', type: 'email', required: true, autocomplete: 'email' })]),
        el('label', {}, ['Teléfono (opcional)', el('input', { name: 'phone', type: 'tel', autocomplete: 'tel' })]),
        el('button', { class: 'btn', type: 'submit', text: 'Armar mi pedido' }),
      ]),
    );
    body.querySelector('form').addEventListener('submit', async function (e) {
      e.preventDefault();
      const f = e.target;
      const btn = f.querySelector('button');
      btn.disabled = true;
      btn.textContent = 'Preparando…';
      try {
        const res = await api('/cart/checkout-links', {
          method: 'POST',
          body: {
            anon_id: anonId,
            buyer: { name: f.name.value, email: f.email.value, phone: f.phone.value || undefined },
            items: load().map(function (i) { return { variant_id: i.variant_id, qty: i.qty }; }),
          },
        });
        // order registered server-side: hand off to the guided /pedido flow.
        // The local cart is now the order — clear it so it can't drift.
        localStorage.removeItem(KEY);
        paintFab();
        window.location.href = '/pedido?token=' + encodeURIComponent(res.token);
      } catch (err) {
        btn.disabled = false;
        btn.textContent = 'Armar mi pedido';
        toast('No pudimos armar el pedido. Probá de nuevo.');
      }
    });
  }

  paintFab();
  window.AMCart = { add: add };
})();
