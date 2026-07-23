// Anti Market — first-visit welcome tour. Runs once (localStorage), fully
// skippable, invites the visitor to create a profile (with the why) and explains
// how Anti Market works. An arrow points at the profile icon on the profile step.
(function () {
  'use strict';
  var AM = window.AM || {};
  var el = AM.el;
  if (!el) return;

  var KEY = 'am_tour_done';
  // already seen, or already a known/logged-in visitor → never show
  if (localStorage.getItem(KEY) || localStorage.getItem('am_logged')) return;
  // the tour covers email capture, so suppress the lead pop-up this first session
  try { localStorage.setItem('am_lead_done', '1'); } catch (e) {}

  var steps = [
    {
      title: 'Bienvenida a Anti Market',
      body: 'Esto es lo contrario a un mercado infinito: una selección. Marcas argentinas elegidas una por una, y una asesora que te ayuda a encontrar lo tuyo.',
    },
    {
      title: 'Creá tu perfil',
      body: 'Guardás tus favoritos ❤, la asesora te conoce y te recomienda tu talle, y en el checkout tu dirección viene precargada en todas las marcas. Es gratis y toma 20 segundos.',
      cta: 'Crear mi perfil',
      arrow: true,
    },
    {
      title: 'Cómo funciona',
      body: 'Explorás las marcas y sus productos, la asesora te ayuda a elegir, y comprás dentro de Anti Market. Cada marca te lo envía desde su tienda. Simple.',
    },
  ];

  var i = 0;
  var backdrop, card, arrow;

  function highlight(on) {
    var btn = document.querySelector('[data-account-btn]');
    if (btn) btn.classList.toggle('tour-highlight', !!on);
  }

  function done() {
    try { localStorage.setItem(KEY, '1'); } catch (e) {}
    highlight(false);
    if (backdrop) backdrop.remove();
    if (arrow) arrow.remove();
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', onResize);
  }
  function onKey(e) { if (e.key === 'Escape') done(); }
  function onResize() { if (steps[i] && steps[i].arrow) positionArrow(); }

  function positionArrow() {
    var btn = document.querySelector('[data-account-btn]');
    if (!btn || !arrow) { if (arrow) arrow.style.display = 'none'; return; }
    var r = btn.getBoundingClientRect();
    arrow.style.display = 'block';
    arrow.style.top = (r.bottom + 6) + 'px';
    arrow.style.left = (r.left + r.width / 2 - 14) + 'px';
    highlight(true);
  }

  function render() {
    var s = steps[i];
    var nav = [];
    if (i > 0) nav.push(el('button', { class: 'btn btn--ghost btn--sm', text: 'Atrás', onclick: function () { highlight(false); i--; render(); } }));
    if (s.cta) nav.push(el('button', { class: 'btn btn--sm', text: s.cta, onclick: function () { done(); if (window.AMOpenAuth) window.AMOpenAuth('register'); } }));
    nav.push(el('button', { class: 'btn btn--sm', text: i === steps.length - 1 ? 'Empezar' : 'Siguiente',
      onclick: function () { if (i === steps.length - 1) done(); else { highlight(false); i++; render(); } } }));

    card.replaceChildren(
      el('div', { class: 'tour-progress', text: (i + 1) + ' / ' + steps.length }),
      el('h2', { text: s.title }),
      el('p', { text: s.body }),
      el('div', { class: 'tour-actions' }, [
        el('button', { class: 'linklike', text: 'Saltar', onclick: done }),
        el('div', { class: 'tour-nav' }, nav),
      ]),
    );
    if (s.arrow) positionArrow(); else highlight(false), (arrow && (arrow.style.display = 'none'));
  }

  function start() {
    backdrop = el('div', { class: 'tour-backdrop' });
    card = el('div', { class: 'tour-card', role: 'dialog', 'aria-modal': 'true' });
    backdrop.appendChild(card);
    // click on the dim (not the card) closes — evitable
    backdrop.addEventListener('click', function (e) { if (e.target === backdrop) done(); });
    arrow = el('div', { class: 'tour-arrow', 'aria-hidden': 'true', text: '▲' });
    document.body.append(backdrop, arrow);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    render();
  }

  function boot() { setTimeout(start, 1200); } // let the header/profile button paint
  if (document.readyState === 'complete') boot();
  else window.addEventListener('load', boot);
})();
