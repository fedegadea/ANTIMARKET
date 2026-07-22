// Anti Market — guided cross-brand checkout (Combo A "bien hecho").
// One AM order fans out into a paid segment per brand. This page walks the
// shopper brand by brand, tracks which are paid (via the order/paid webhook),
// and never blocks: any pending brand is payable, the next one is highlighted.
(function () {
  'use strict';
  const { api, money, el, qs, toast } = window.AM;
  const root = document.querySelector('[data-order-root]');
  const token = qs('token');

  let state = null;
  let poll = null;
  let lastPaid = -1;

  function fmtCount(n) { return n === 1 ? '1 marca' : n + ' marcas'; }

  // ---- render ----------------------------------------------------------
  function render() {
    root.replaceChildren();
    if (!state) return;

    const total = state.segments.length;
    const paid = state.paid_count;
    const done = state.status === 'complete';

    if (done) return renderDone();

    // header + progress
    root.appendChild(el('div', { class: 'order-head' }, [
      el('p', { class: 'eyebrow', text: 'Tu pedido en Anti Market' }),
      el('h1', { text: state.multi_store ? 'Un pago por marca' : 'Último paso' }),
      el('p', { class: 'muted', text: state.multi_store
        ? 'Elegiste de ' + fmtCount(total) + '. Cada una cobra con sus medios de pago y te envía tu paquete. Te vamos guiando marca por marca.'
        : 'Completá el pago en la tienda de la marca. Nosotros te confirmamos acá cuando esté listo.' }),
    ]));

    if (state.multi_store) {
      root.appendChild(el('div', { class: 'progress' }, [
        el('div', { class: 'progress-bar' }, [
          el('span', { class: 'progress-fill', style: 'width:' + Math.round((paid / total) * 100) + '%' }),
        ]),
        el('p', { class: 'progress-label', text: paid + ' de ' + total + ' marcas listas' }),
      ]));
    }

    // the next actionable brand = first pending
    const firstPending = state.segments.findIndex(function (s) { return s.payment_status === 'pending'; });

    state.segments.forEach(function (seg, i) {
      root.appendChild(renderStep(seg, i === firstPending));
    });

    // waiting hint while a payment is expected
    if (paid < total && paid > 0) {
      root.appendChild(el('p', { class: 'muted order-waiting', text:
        'En cuanto la marca confirme tu pago, se marca acá solo. Podés seguir con la próxima mientras tanto.' }));
    }
  }

  function renderStep(seg, isNext) {
    const isPaid = seg.payment_status === 'paid';
    const isCancelled = seg.payment_status === 'cancelled';

    const lines = seg.items.map(function (it) {
      return el('div', { class: 'order-line' }, [
        el('span', { text: it.name + (it.variant_label && it.variant_label !== 'Único' ? ' · ' + it.variant_label : '') }),
        el('span', { class: 'qty', text: '×' + it.qty }),
        el('span', { class: 'price', text: money(it.unit_price * it.qty) }),
      ]);
    });

    const statusEl = isPaid
      ? el('span', { class: 'step-badge step-badge--ok', text: '✓ Pagado' })
      : isCancelled
        ? el('span', { class: 'step-badge step-badge--off', text: 'Cancelado' })
        : isNext
          ? el('span', { class: 'step-badge step-badge--next', text: 'Tu próximo paso' })
          : el('span', { class: 'step-badge', text: 'Pendiente' });

    const children = [
      el('div', { class: 'step-top' }, [
        el('div', { class: 'step-brand' }, [
          seg.store_logo ? el('img', { src: seg.store_logo, alt: '', class: 'step-logo' }) : null,
          el('strong', { text: seg.store_name }),
        ]),
        statusEl,
      ]),
      el('div', { class: 'step-lines' }, lines),
      el('div', { class: 'step-foot' }, [
        el('span', { class: 'muted', text: seg.items.length + (seg.items.length === 1 ? ' producto' : ' productos') }),
        el('strong', { text: money(seg.subtotal) }),
      ]),
    ];

    if (!isPaid && !isCancelled) {
      const payBtn = el('a', {
        class: 'btn' + (isNext ? '' : ' btn--ghost'),
        href: seg.checkout_url,
        target: '_blank',
        rel: 'noopener',
        text: 'Pagar en ' + seg.store_name,
        style: 'width:100%;margin-top:var(--space-3)',
      });
      payBtn.addEventListener('click', function () {
        // returning to this tab triggers an immediate poll (visibilitychange)
        toast('Cuando termines el pago, volvé a esta pestaña.');
        setTimeout(refresh, 1500);
      });
      children.push(payBtn);
      if (seg.mode === 'product_link') {
        children.push(el('p', { class: 'muted step-hint', text:
          'Te llevamos a la tienda de la marca para completar ahí.' }));
      }
    }

    return el('div', {
      class: 'step-card' + (isPaid ? ' is-paid' : '') + (isNext ? ' is-next' : '') + (isCancelled ? ' is-off' : ''),
    }, children);
  }

  function renderDone() {
    root.replaceChildren(
      el('div', { class: 'order-done' }, [
        el('div', { class: 'order-done-mark', text: '✓' }),
        el('h1', { text: '¡Listo, ' + (firstName(state.buyer_name) || 'gracias') + '!' }),
        el('p', { class: 'muted', text: state.multi_store
          ? 'Confirmamos el pago de las ' + state.segments.length + ' marcas. Cada una te envía su paquete y te escribe con el seguimiento.'
          : 'Confirmamos tu pago. La marca te envía tu pedido y te escribe con el seguimiento.' }),
        el('div', { class: 'order-done-list' }, state.segments.map(function (s) {
          return el('div', { class: 'order-line' }, [
            el('span', { text: s.store_name }),
            el('span', { class: s.payment_status === 'paid' ? 'step-badge step-badge--ok' : 'step-badge', text:
              s.payment_status === 'paid' ? '✓ Pagado' : 'Pendiente' }),
          ]);
        })),
        el('a', { class: 'btn', href: '/categoria', text: 'Seguir explorando', style: 'margin-top:var(--space-4)' }),
      ])
    );
    stopPolling();
  }

  function firstName(name) { return (name || '').trim().split(/\s+/)[0] || ''; }

  function renderError(msg) {
    root.replaceChildren(el('div', { class: 'order-head' }, [
      el('h1', { text: 'No encontramos tu pedido' }),
      el('p', { class: 'muted', text: msg || 'Puede que el enlace sea viejo. Volvé a armar tu selección.' }),
      el('a', { class: 'btn', href: '/categoria', text: 'Ir a explorar', style: 'margin-top:var(--space-3)' }),
    ]));
    stopPolling();
  }

  // ---- data ------------------------------------------------------------
  async function refresh() {
    try {
      const next = await api('/cart/checkout-links?token=' + encodeURIComponent(token));
      const changed = !state || next.paid_count !== lastPaid || next.status !== state.status;
      state = next;
      lastPaid = next.paid_count;
      if (changed) render();
      if (next.status === 'complete') stopPolling();
    } catch (e) {
      // only the initial load can fail hard (bad/old token); keep it human.
      if (!state) renderError();
    }
  }

  function startPolling() {
    stopPolling();
    poll = setInterval(refresh, 6000); // webhook-driven; gentle cadence
  }
  function stopPolling() { if (poll) { clearInterval(poll); poll = null; } }

  // ---- boot ------------------------------------------------------------
  if (!token) { renderError('El enlace no tiene un pedido asociado.'); return; }

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && state && state.status !== 'complete') refresh();
  });

  refresh().then(startPolling);
})();
