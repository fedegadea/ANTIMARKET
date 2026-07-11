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

  window.AM = { api: api, track: track, money: money, el: el, toast: toast, qs: qs, anonId: anonId, paintCounters: paintCounters };
})();
