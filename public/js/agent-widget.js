// Anti Market — "Tu asesora" widget: floating button + side panel (mobile: fullscreen).
// DECISIÓN: full response with typing indicator (no SSE) — simpler and enough for v1.
(function () {
  'use strict';
  const { api, money, el, anonId } = window.AM;
  const KEY = 'am_agent_open';

  const fab = el('button', { class: 'agent-fab', 'aria-label': 'Hablar con tu asesora', text: 'Tu asesora' });
  const panel = el('div', { class: 'agent-panel', role: 'dialog', 'aria-label': 'Tu asesora' }, [
    el('header', {}, [
      el('span', { class: 'title', text: 'Tu asesora' }),
      el('button', { class: 'close', 'aria-label': 'Cerrar', text: '×' }),
    ]),
    el('div', { class: 'agent-messages', 'data-messages': '' }),
    el('form', { class: 'agent-input' }, [
      el('input', { name: 'q', placeholder: 'Contame qué buscás…', autocomplete: 'off', 'aria-label': 'Tu mensaje' }),
      el('button', { class: 'btn', type: 'submit', text: 'Enviar' }),
    ]),
  ]);
  document.body.appendChild(fab);
  document.body.appendChild(panel);

  const messagesBox = panel.querySelector('[data-messages]');
  const form = panel.querySelector('form');
  const input = form.querySelector('input');
  let history = []; // painted messages (server holds the real conversation)
  let loaded = false;
  let pendingContext = null;

  function open() {
    panel.classList.add('open');
    sessionStorage.setItem(KEY, '1');
    if (!loaded) {
      loaded = true;
      addAgent('Hola, soy tu asesora de Anti Market. Contame qué necesitás — una ocasión, un talle, un presupuesto — y te acerco pocas opciones bien elegidas.');
    }
    input.focus();
  }
  function close() {
    panel.classList.remove('open');
    sessionStorage.removeItem(KEY);
  }
  fab.addEventListener('click', open);
  panel.querySelector('.close').addEventListener('click', close);

  function scroll() { messagesBox.scrollTop = messagesBox.scrollHeight; }

  function addUser(text) {
    messagesBox.appendChild(el('div', { class: 'msg msg--user', text: text }));
    scroll();
  }
  function addAgent(text) {
    messagesBox.appendChild(el('div', { class: 'msg msg--agent', text: text }));
    scroll();
  }
  function addCards(cards) {
    const wrap = el('div', { class: 'agent-cards' });
    cards.forEach(function (c) {
      wrap.appendChild(el('div', { class: 'agent-card' }, [
        c.image ? el('img', { src: c.image, alt: c.name + ' — ' + c.store_name, loading: 'lazy' }) : null,
        el('div', { class: 'meta' }, [
          el('div', { class: 'muted', text: c.store_name }),
          el('a', { class: 'nm', href: c.url, text: c.name }),
          el('div', { class: 'price', text: money(c.price) + ' · ' + c.variant_label }),
          c.coupon_code ? el('div', { class: 'muted', text: 'Tu código: ' + c.coupon_code }) : null,
        ]),
        el('button', { class: 'btn btn--sm', text: 'Agregar', onclick: function () {
          window.AMCart.add({
            variant_id: c.variant_id, product_id: c.product_id, store_id: c.store_id,
            store_name: c.store_name, name: c.name, variant_label: c.variant_label,
            price: c.price, image: c.image,
          });
        } }),
      ]));
    });
    messagesBox.appendChild(wrap);
    scroll();
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    addUser(text);

    const typing = el('div', { class: 'msg msg--agent msg--typing', text: 'Escribiendo…' });
    messagesBox.appendChild(typing);
    scroll();
    form.querySelector('button').disabled = true;

    try {
      const res = await api('/agent/chat', {
        method: 'POST',
        body: { anon_id: anonId, message: text, product_context: pendingContext || undefined },
      });
      pendingContext = null;
      typing.remove();
      addAgent(res.reply);
      if (res.cards && res.cards.length) addCards(res.cards);
    } catch (err) {
      typing.remove();
      addAgent('Se me trabó la aguja un segundo. ¿Me lo mandás de nuevo?');
    }
    form.querySelector('button').disabled = false;
    input.focus();
  });

  // persistence within the visit
  if (sessionStorage.getItem(KEY) === '1') open();

  window.AMAgent = {
    openWithContext: function (context) {
      pendingContext = context;
      open();
      addAgent('¿Qué querés saber de "' + context + '"? Te ayudo con el talle, el calce o con qué combinarlo.');
    },
  };
})();
