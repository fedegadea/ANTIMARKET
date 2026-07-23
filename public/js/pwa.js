// Anti Market — PWA: registers the service worker and shows an "Instalar app"
// button when the browser allows install (or iOS instructions on Safari).
(function () {
  'use strict';
  var AM = window.AM || {};
  var el = AM.el;
  var toast = AM.toast || function () {};

  // 1) register the service worker (enables install + offline shell)
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function () {});
    });
  }

  // already installed / running as an app → no button
  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }
  if (isStandalone()) return;

  var deferred = null;

  function makeButton(label, onClick) {
    var nav = document.querySelector('.site-header .site-nav');
    if (!nav || nav.querySelector('[data-install-btn]')) return null;
    var btn = (el ? el('button', { 'data-install-btn': '', class: 'install-btn', type: 'button', text: label })
      : (function () { var b = document.createElement('button'); b.className = 'install-btn'; b.textContent = label; b.setAttribute('data-install-btn', ''); return b; })());
    btn.addEventListener('click', onClick);
    nav.appendChild(btn);
    return btn;
  }

  function removeButton() {
    var btn = document.querySelector('[data-install-btn]');
    if (btn) btn.remove();
  }

  // 2a) Android / desktop Chrome: real install prompt
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferred = e;
    makeButton('⤓ Instalar app', function () {
      if (!deferred) return;
      deferred.prompt();
      deferred.userChoice.then(function () { deferred = null; removeButton(); });
    });
  });

  window.addEventListener('appinstalled', function () {
    deferred = null;
    removeButton();
    toast('¡Anti Market quedó en tu inicio!');
  });

  // 2b) iOS Safari: no prompt API — show a short how-to
  var ua = window.navigator.userAgent || '';
  var isIOS = /iphone|ipad|ipod/i.test(ua);
  var isSafari = /^((?!chrome|crios|fxios|android).)*safari/i.test(ua);
  if (isIOS && isSafari) {
    makeButton('⤓ Instalar app', function () {
      showIosSheet();
    });
  }

  function showIosSheet() {
    var back = document.createElement('div');
    back.className = 'am-modal-backdrop';
    var close = function () { back.remove(); };
    back.addEventListener('click', function (e) { if (e.target === back) close(); });
    var panel = document.createElement('div');
    panel.className = 'am-modal';
    panel.innerHTML =
      '<button class="am-modal-close" aria-label="Cerrar">×</button>' +
      '<h2>Instalar Anti Market</h2>' +
      '<p class="muted">En tu iPhone quedá como una app en la pantalla de inicio:</p>' +
      '<ol style="display:grid;gap:.6rem;padding-left:1.1rem;font-size:.95rem">' +
      '<li>Tocá el botón <strong>Compartir</strong> (el cuadradito con la flecha ↑) abajo.</li>' +
      '<li>Elegí <strong>“Agregar a inicio”</strong>.</li>' +
      '<li>Tocá <strong>Agregar</strong>. Listo.</li>' +
      '</ol>';
    panel.querySelector('.am-modal-close').addEventListener('click', close);
    back.appendChild(panel);
    document.body.appendChild(back);
  }
})();
