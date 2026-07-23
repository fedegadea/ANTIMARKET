// Anti Market — customer account: favorites (heart), favorite brands, login
// (Supabase Auth email+password), profile, and the minimal email pop-up.
// Favorites work anonymously (localStorage + server by anon_id) and merge into
// the account on login. Loaded on every page after api.js.
(function () {
  'use strict';
  const { api, el, toast, anonId, qs } = window.AM;
  const FAV_KEY = 'am_favs_v1';
  const FAVB_KEY = 'am_favbrands_v1';
  const LOGGED_FLAG = 'am_logged';
  const LEAD_FLAG = 'am_lead_done';

  let sb = null;          // supabase-js client (loaded on demand)
  let session = null;     // current auth session
  const listeners = [];   // favorite-change subscribers (hearts repaint)
  let resolveReady;
  const ready = new Promise((res) => { resolveReady = res; }); // resolves once boot session check finishes

  // ---------- local favorite state (optimistic, instant) ----------
  const load = (k) => { try { return new Set(JSON.parse(localStorage.getItem(k)) || []); } catch { return new Set(); } };
  const save = (k, set) => localStorage.setItem(k, JSON.stringify([...set]));
  let favs = load(FAV_KEY);
  let favBrands = load(FAVB_KEY);

  function emit() { listeners.forEach((fn) => { try { fn(); } catch (e) {} }); }

  // ---------- server helpers ----------
  function authHeader() {
    return session ? { authorization: 'Bearer ' + session.access_token } : {};
  }
  async function apiAuth(path, options) {
    const opts = Object.assign({}, options);
    // api() replaces the default headers with whatever we pass, so re-add content-type
    opts.headers = Object.assign({ 'content-type': 'application/json' }, authHeader(), (options && options.headers) || {});
    return api(path, opts);
  }

  // ---------- favorites API ----------
  const AMFav = {
    isFav: (productId) => favs.has(productId),
    isBrandFav: (storeId) => favBrands.has(storeId),
    list: () => [...favs],
    listBrands: () => [...favBrands],
    onChange: (fn) => { listeners.push(fn); },

    async toggle(productId) {
      const on = !favs.has(productId);
      if (on) favs.add(productId); else favs.delete(productId);   // optimistic
      save(FAV_KEY, favs); emit();
      try {
        const res = await apiAuth('/account/favorites', { method: 'POST', body: { product_id: productId, anon_id: anonId } });
        if (res.favorite !== on) { // reconcile if server disagreed
          if (res.favorite) favs.add(productId); else favs.delete(productId);
          save(FAV_KEY, favs); emit();
        }
      } catch (e) { /* keep optimistic; will resync */ }
      return favs.has(productId);
    },

    async toggleBrand(storeId) {
      const on = !favBrands.has(storeId);
      if (on) favBrands.add(storeId); else favBrands.delete(storeId);
      save(FAVB_KEY, favBrands); emit();
      try {
        await apiAuth('/account/favorite-stores', { method: 'POST', body: { store_id: storeId, anon_id: anonId } });
      } catch (e) {}
      return favBrands.has(storeId);
    },

    // pull server state into local (after login/sync or first load if logged)
    async refresh() {
      try {
        const [f, b] = await Promise.all([
          apiAuth('/account/favorites?anon_id=' + encodeURIComponent(anonId)),
          apiAuth('/account/favorite-stores?anon_id=' + encodeURIComponent(anonId)),
        ]);
        favs = new Set(f.product_ids || []);
        favBrands = new Set(b.store_ids || []);
        save(FAV_KEY, favs); save(FAVB_KEY, favBrands); emit();
      } catch (e) {}
    },
  };
  window.AMFav = AMFav;

  // ---------- auth (Supabase, loaded on demand) ----------
  async function ensureSb() {
    if (sb) return sb;
    const cfg = await (await fetch('/api/config')).json();
    const mod = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    sb = mod.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    return sb;
  }

  async function currentSession() {
    await ensureSb();
    const { data } = await sb.auth.getSession();
    session = data.session || null;
    return session;
  }

  async function afterLogin() {
    localStorage.setItem(LOGGED_FLAG, '1');
    // merge anonymous favorites into the account, then refresh local state
    try { await apiAuth('/account/sync', { method: 'POST', body: { anon_id: anonId } }); } catch (e) {}
    await AMFav.refresh();
    paintProfileButton();
    emit();
  }

  const AMAccount = {
    session: () => session,
    isLoggedIn: () => !!session,
    ensureSb,
    async login(email, password) {
      await ensureSb();
      const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      await currentSession();
      await afterLogin();
    },
    async register(email, password) {
      await ensureSb();
      const { error } = await sb.auth.signUp({ email: email.trim(), password });
      if (error) throw error;
      // if email confirmation is off, a session comes back immediately
      await currentSession();
      if (session) await afterLogin();
    },
    async logout() {
      if (sb) await sb.auth.signOut();
      session = null;
      localStorage.removeItem(LOGGED_FLAG);
      paintProfileButton();
      location.href = '/';
    },
    async getProfile() { return apiAuth('/account/profile'); },
    async saveProfile(patch) { return apiAuth('/account/profile', { method: 'POST', body: patch }); },
    async getForYou() { return apiAuth('/account/for-you'); },
    openLogin: () => openAuthModal('login'),
    ready,                       // resolves after the initial session check
    onChange: (fn) => { listeners.push(fn); }, // login/logout + favorites repaint
  };
  window.AMAccount = AMAccount;

  // ---------- header profile button ----------
  const PROFILE_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>';

  function paintProfileButton() {
    const nav = document.querySelector('.site-header .site-nav');
    if (!nav) return;
    let btn = nav.querySelector('[data-account-btn]');
    if (!btn) {
      btn = el('a', { 'data-account-btn': '', class: 'account-btn', 'aria-label': 'Tu cuenta' });
      const ico = el('span', { class: 'account-ico', 'aria-hidden': 'true' });
      ico.innerHTML = PROFILE_SVG;   // static markup, no external data
      btn.appendChild(ico);
      nav.appendChild(btn);
    }
    const logged = !!session;
    btn.href = logged ? '/cuenta' : '#';
    btn.title = logged ? 'Tu cuenta' : 'Ingresar';
    btn.classList.toggle('is-logged', logged);
    btn.onclick = logged ? null : (e) => { e.preventDefault(); openAuthModal('login'); };
  }

  // ---------- auth modal ----------
  function openAuthModal(mode) {
    const backdrop = el('div', { class: 'am-modal-backdrop' });
    const panel = el('div', { class: 'am-modal' });
    backdrop.appendChild(panel);
    document.body.appendChild(backdrop);
    const close = () => backdrop.remove();
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });

    function render(which) {
      const isLogin = which === 'login';
      panel.replaceChildren(
        el('button', { class: 'am-modal-close', 'aria-label': 'Cerrar', text: '×', onclick: close }),
        el('h2', { text: isLogin ? 'Ingresá a tu cuenta' : 'Creá tu cuenta' }),
        el('p', { class: 'muted', text: isLogin
          ? 'Para tus favoritos, tus datos y tus medidas en un solo lugar.'
          : 'Guardá tus favoritos y que la asesora te conozca mejor.' }),
        (function () {
          const form = el('form', { class: 'am-form' }, [
            el('label', {}, ['Email', el('input', { name: 'email', type: 'email', required: true, autocomplete: 'email' })]),
            el('label', {}, ['Contraseña', el('input', { name: 'password', type: 'password', required: true, minlength: '8', autocomplete: isLogin ? 'current-password' : 'new-password' })]),
            el('p', { class: 'am-form-msg', 'data-msg': '' }),
            el('button', { class: 'btn', type: 'submit', text: isLogin ? 'Entrar' : 'Crear cuenta' }),
          ]);
          form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const msg = form.querySelector('[data-msg]');
            const btn = form.querySelector('button[type=submit]');
            msg.textContent = ''; btn.disabled = true; btn.textContent = '…';
            try {
              if (isLogin) await AMAccount.login(form.email.value, form.password.value);
              else await AMAccount.register(form.email.value, form.password.value);
              if (AMAccount.isLoggedIn()) { close(); toast('¡Hola de nuevo!'); }
              else { msg.className = 'am-form-msg ok'; msg.textContent = 'Te mandamos un mail para confirmar tu cuenta.'; }
            } catch (err) {
              msg.className = 'am-form-msg err';
              const m = String(err.message || err);
              msg.textContent = /Invalid login/i.test(m) ? 'Email o contraseña incorrectos.'
                : /already registered/i.test(m) ? 'Ese email ya tiene cuenta. Ingresá.'
                : /at least/i.test(m) ? 'La contraseña necesita al menos 8 caracteres.'
                : m;
            } finally { btn.disabled = false; btn.textContent = isLogin ? 'Entrar' : 'Crear cuenta'; }
          });
          return form;
        })(),
        el('p', { class: 'am-switch' }, [
          isLogin ? '¿No tenés cuenta? ' : '¿Ya tenés cuenta? ',
          el('button', { type: 'button', class: 'linklike', text: isLogin ? 'Crear una' : 'Ingresar',
            onclick: () => render(isLogin ? 'register' : 'login') }),
        ]),
      );
      const first = panel.querySelector('input');
      if (first) setTimeout(() => first.focus(), 40);
    }
    render(mode || 'login');
  }
  window.AMOpenAuth = openAuthModal;

  // ---------- minimal email pop-up (lead capture) ----------
  function maybeShowLeadPopup() {
    if (localStorage.getItem(LEAD_FLAG) || localStorage.getItem(LOGGED_FLAG)) return;
    // don't interrupt immediately; wait a bit of engagement
    setTimeout(() => {
      if (localStorage.getItem(LEAD_FLAG) || localStorage.getItem(LOGGED_FLAG)) return;
      const pop = el('div', { class: 'am-lead' }, [
        el('button', { class: 'am-lead-close', 'aria-label': 'Cerrar', text: '×',
          onclick: () => { localStorage.setItem(LEAD_FLAG, '1'); pop.remove(); } }),
        el('p', { class: 'am-lead-title', text: 'Enterate primero.' }),
        el('p', { class: 'am-lead-sub', text: 'Dejanos tu mail y te avisamos cuando entra algo bueno.' }),
        (function () {
          const form = el('form', { class: 'am-lead-form' }, [
            el('input', { name: 'email', type: 'email', required: true, placeholder: 'tu@email.com', autocomplete: 'email' }),
            el('button', { class: 'btn btn--sm', type: 'submit', text: 'Sumarme' }),
          ]);
          form.addEventListener('submit', async (e) => {
            e.preventDefault();
            try { await api('/account/lead', { method: 'POST', body: { email: form.email.value, anon_id: anonId } }); } catch (err) {}
            localStorage.setItem(LEAD_FLAG, '1');
            pop.replaceChildren(el('p', { class: 'am-lead-title', text: '¡Listo! Ya estás dentro.' }));
            setTimeout(() => pop.remove(), 1800);
          });
          return form;
        })(),
      ]);
      document.body.appendChild(pop);
      requestAnimationFrame(() => pop.classList.add('show'));
    }, 12000);
  }

  // ---------- boot ----------
  paintProfileButton();

  // if previously logged in, restore session + sync favorites
  if (localStorage.getItem(LOGGED_FLAG)) {
    currentSession().then((s) => {
      if (s) { paintProfileButton(); AMFav.refresh(); } else { localStorage.removeItem(LOGGED_FLAG); }
    }).finally(() => { emit(); resolveReady(session); });
  } else {
    // anonymous: pull any server-side favorites tied to this anon_id
    AMFav.refresh();
    maybeShowLeadPopup();
    resolveReady(null);
  }
})();
