// Anti Market — brand panel. Auth: Supabase OTP magic link against stores.contact_email.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const { el, money } = window.AM;
const $ = (sel) => document.querySelector(sel);

const config = await (await fetch('/api/config')).json();
const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);

const loginSection = $('[data-login]');
const appSection = $('[data-app]');
const view = $('[data-view]');
let token = null;
let overview = null;

// admin override: /panel?store=<slug> lets an admin manage that store's panel
const STORE = new URLSearchParams(location.search).get('store');
function withStore(path) {
  if (!STORE) return path;
  return path + (path.indexOf('?') === -1 ? '?' : '&') + 'store=' + encodeURIComponent(STORE);
}

async function apiGet(path) {
  const res = await fetch('/api' + withStore(path), { headers: { authorization: 'Bearer ' + token } });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'HTTP ' + res.status);
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch('/api' + withStore(path), {
    method: 'POST',
    headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'HTTP ' + res.status);
  return res.json();
}

// --- auth (email + contraseña, con "olvidé mi contraseña" y recuperación) ---
const recoverySection = $('[data-recovery]');
let isRecovery = false;

function showRecovery() { loginSection.hidden = true; appSection.hidden = true; recoverySection.hidden = false; }

// Supabase dispara este evento cuando el usuario llega desde el mail de recuperación.
supabase.auth.onAuthStateChange((event) => { if (event === 'PASSWORD_RECOVERY') { isRecovery = true; showRecovery(); } });

function wireLogin() {
  const form = $('[data-login-form]');
  const msg = $('[data-login-msg]');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = form.email.value.trim();
    const password = form.password.value;
    msg.className = ''; msg.textContent = 'Ingresando…';
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      msg.className = 'form-error';
      msg.textContent = /Invalid login credentials/i.test(error.message)
        ? 'Email o contraseña incorrectos. Si es tu primera vez, tocá "crear contraseña".'
        : 'No pudimos ingresar. Probá de nuevo.';
      return;
    }
    location.reload();
  });
  // ¿el email es el contacto de una marca registrada? gatea crear/recuperar
  async function isBrandEmail(email) {
    try { const r = await fetch('/api/brand-panel/exists?email=' + encodeURIComponent(email)); return (await r.json()); }
    catch (e) { return { isBrand: false }; }
  }
  const NOT_BRAND = 'Ese email no figura como contacto de ninguna marca en Anti Market. Usá el email de contacto de tu Tienda Nube (con el que aprobamos tu tienda). Si creés que es un error, escribinos.';

  $('[data-register]').addEventListener('click', async (e) => {
    e.preventDefault();
    const email = form.email.value.trim();
    const password = form.password.value;
    if (!email) { msg.className = 'form-error'; msg.textContent = 'Escribí el email de contacto de tu marca.'; form.email.focus(); return; }
    msg.className = ''; msg.textContent = 'Verificando tu marca…';
    const chk = await isBrandEmail(email);
    if (!chk.isBrand) { msg.className = 'form-error'; msg.textContent = NOT_BRAND; return; }
    if (password.length < 6) { msg.className = 'form-error'; msg.textContent = '¡' + (chk.store_name || 'Tu marca') + ' está! Ahora elegí una contraseña de 6+ caracteres arriba y volvé a tocar "crear contraseña".'; form.password.focus(); return; }
    msg.textContent = 'Creando tu acceso…';
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      msg.className = 'form-error';
      msg.textContent = /already registered/i.test(error.message) ? 'Ese email ya tiene contraseña. Ingresá arriba, o usá "Olvidé mi contraseña".' : 'No se pudo crear. Probá de nuevo.';
      return;
    }
    if (data.session) { location.reload(); return; }
    msg.className = 'form-ok'; msg.textContent = 'Listo. Te mandamos un email para confirmar; después entrás con tu email y contraseña.';
  });

  $('[data-forgot]').addEventListener('click', async (e) => {
    e.preventDefault();
    const email = form.email.value.trim();
    if (!email) { msg.className = 'form-error'; msg.textContent = 'Escribí tu email arriba y tocá "Olvidé mi contraseña".'; form.email.focus(); return; }
    msg.className = ''; msg.textContent = 'Verificando tu marca…';
    const chk = await isBrandEmail(email);
    if (!chk.isBrand) { msg.className = 'form-error'; msg.textContent = NOT_BRAND; return; }
    msg.textContent = 'Enviando el email de recuperación…';
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: location.origin + '/panel/' });
    if (error) {
      msg.className = 'form-error';
      msg.textContent = 'No se pudo enviar: ' + (error.message || 'error') + (/rate|limit/i.test(error.message || '') ? ' (esperá unos minutos o configurá SMTP propio en Supabase).' : '');
    } else {
      msg.className = 'form-ok';
      msg.textContent = 'Listo — revisá tu casilla (' + email + ') y seguí el link para poner una nueva contraseña.';
    }
  });
}

function wireRecovery() {
  const form = $('[data-recovery-form]');
  const msg = $('[data-recovery-msg]');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = form.password.value;
    if (password.length < 6) { msg.className = 'form-error'; msg.textContent = 'Mínimo 6 caracteres.'; return; }
    msg.className = ''; msg.textContent = 'Guardando…';
    const { error } = await supabase.auth.updateUser({ password });
    if (error) { msg.className = 'form-error'; msg.textContent = 'No se pudo cambiar. Probá de nuevo.'; return; }
    msg.className = 'form-ok'; msg.textContent = 'Contraseña actualizada. Entrando…';
    setTimeout(() => { location.href = '/panel/'; }, 800);
  });
}

wireLogin();
wireRecovery();

if (/type=recovery/.test(location.hash)) { isRecovery = true; showRecovery(); }

if (!isRecovery) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    loginSection.hidden = false;
  } else {
    token = session.access_token;
    await boot();
  }
}

$('[data-logout]').addEventListener('click', async () => {
  await supabase.auth.signOut();
  location.reload();
});

async function boot() {
  try {
    overview = await apiGet('/brand-panel/overview');
  } catch (e) {
    loginSection.hidden = false;
    const form = loginSection.querySelector('form');
    form.hidden = true;
    const email = (session && session.user && session.user.email) || '';
    const msg = $('[data-login-msg]');
    msg.className = 'form-error';
    msg.textContent = 'Entraste como ' + email + ', pero ese mail no es el de contacto de ninguna tienda. '
      + 'Salí y entrá con el mail de contacto de tu tienda.';
    // offer a quick way to switch accounts
    const switchBtn = el('button', { class: 'btn btn--ghost btn--sm', text: 'Salir y cambiar de cuenta', style: 'margin-top: var(--space-3)' });
    switchBtn.addEventListener('click', async () => { await supabase.auth.signOut(); location.href = '/panel'; });
    msg.after(switchBtn);
    return;
  }
  $('[data-logout]').hidden = false;
  appSection.hidden = false;
  $('[data-store-name]').textContent = overview.store.name;
  const ugcBtn = $('[data-ugc-wa]');
  if (ugcBtn) ugcBtn.href = 'https://wa.me/5493456431651?text=' + encodeURIComponent('Hola Anti Market! Somos ' + overview.store.name + ' y queremos activar nuestra Acción UGC incluida (colaboración con creador de contenido por canje).');

  document.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', 'false'));
      btn.setAttribute('aria-selected', 'true');
      render(btn.dataset.tab);
    });
  });
  render('resumen');
}

function render(tab) {
  view.replaceChildren();
  if (tab === 'resumen') renderResumen();
  if (tab === 'ordenes') renderOrdenes();
  if (tab === 'talles') renderTalles();
  if (tab === 'outlet') renderOutlet();
  if (tab === 'envios') renderEnvios();
  if (tab === 'liquidaciones') renderLiquidaciones();
}

// ---------- Envíos (demora por zona / provincia) ----------
async function renderEnvios() {
  const data = await apiGet('/brand-panel/shipping');
  const SHIP = window.AM.SHIP;
  const presets = data.presets || SHIP.presets;
  const provinces = data.provinces || SHIP.provinces;
  const incoming = data.rules || [];
  let defaultPreset = (incoming.find((r) => !r.zones || !r.zones.length) || {}).preset || '5d';
  let zoneRules = incoming.filter((r) => r.zones && r.zones.length).map((r) => ({ preset: r.preset, zones: r.zones.slice() }));

  view.appendChild(el('p', { class: 'muted', style: 'font-size: var(--text-sm); margin-bottom: var(--space-3)',
    text: 'Configurá cuánto tarda en llegar tu pedido según la zona. El cliente elige su provincia y ve su demora real (y puede filtrar por eso). Empezá por el "resto del país" y sumá zonas más rápidas si tenés (ej: CABA y GBA en 48 hs).' }));

  function presetSelect(value, onChange) {
    const s = el('select', { style: 'padding:0.5rem; border: var(--border); border-radius: var(--radius); background:#fff; min-width: 220px' });
    presets.forEach((p) => s.appendChild(el('option', p.key === value ? { value: p.key, text: p.label, selected: true } : { value: p.key, text: p.label })));
    s.addEventListener('change', () => onChange(s.value));
    return s;
  }
  function zonesGrid(rule) {
    const grid = el('div', { class: 'ship-zones' });
    provinces.forEach((pv) => {
      const cb = el('input', { type: 'checkbox', value: pv });
      if (rule.zones.indexOf(pv) >= 0) cb.checked = true;
      cb.addEventListener('change', () => {
        if (cb.checked) { if (rule.zones.indexOf(pv) < 0) rule.zones.push(pv); }
        else rule.zones = rule.zones.filter((z) => z !== pv);
      });
      grid.appendChild(el('label', { class: 'ship-zone' }, [cb, document.createTextNode(' ' + pv)]));
    });
    return grid;
  }

  const host = el('div');
  const msg = el('p', { class: 'am-form-msg', style: 'margin-top: var(--space-2)' });

  function paint() {
    host.replaceChildren();
    // regla default (resto del país)
    host.appendChild(el('div', { class: 'ship-rule' }, [
      el('div', { class: 'ship-rule-head', text: '🌎 Resto del país (por defecto)' }),
      presetSelect(defaultPreset, (v) => { defaultPreset = v; }),
    ]));
    // reglas por zona
    zoneRules.forEach((rule) => {
      const rm = el('button', { class: 'linklike', type: 'button', text: 'Quitar' });
      rm.addEventListener('click', () => { zoneRules = zoneRules.filter((r) => r !== rule); paint(); });
      host.appendChild(el('div', { class: 'ship-rule' }, [
        el('div', { class: 'ship-rule-head' }, [el('span', { text: '📍 Demora para las provincias elegidas' }), rm]),
        presetSelect(rule.preset, (v) => { rule.preset = v; }),
        zonesGrid(rule),
      ]));
    });
    const add = el('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: '+ Agregar demora para una zona' });
    add.addEventListener('click', () => { zoneRules.push({ preset: presets[1].key, zones: [] }); paint(); });
    host.appendChild(el('div', { style: 'margin-top: var(--space-2)' }, [add]));
  }
  paint();

  const save = el('button', { class: 'btn', text: 'Guardar envíos', style: 'margin-top: var(--space-3)' });
  save.addEventListener('click', async () => {
    save.disabled = true; msg.textContent = '';
    const rules = [{ preset: defaultPreset, zones: [] }].concat(zoneRules.filter((r) => r.zones.length));
    try {
      await apiPost('/brand-panel/shipping', { rules });
      window.AM.toast('Envíos guardados'); msg.className = 'am-form-msg form-ok'; msg.textContent = 'Guardado.';
    } catch (e) { msg.className = 'am-form-msg form-error'; msg.textContent = 'No se pudo guardar.'; }
    finally { save.disabled = false; }
  });
  view.append(host, save, msg);
}

// ---------- Outlet ----------
async function renderOutlet() {
  const data = await apiGet('/brand-panel/outlet');
  const products = data.products || [];
  const discounted = products.filter((p) => p.discounted);

  view.appendChild(el('p', { class: 'muted', style: 'font-size: var(--text-sm); margin-bottom: var(--space-3)',
    text: 'Elegí qué prendas EN DESCUENTO querés sumar al Outlet de Anti Market para darles más rotación. Solo se pueden sumar productos con precio rebajado.' }));

  if (!discounted.length) {
    view.appendChild(el('p', { class: 'empty', text: 'No tenés productos con descuento activo. Poné un precio promocional en Tienda Nube y aparecen acá.' }));
    return;
  }

  const list = el('div', { class: 'outlet-list' });
  discounted.forEach((p) => {
    const cb = el('input', { type: 'checkbox' });
    if (p.outlet) cb.checked = true;
    cb.addEventListener('change', async () => {
      cb.disabled = true;
      try { await apiPost('/brand-panel/outlet', { product_id: p.id, outlet: cb.checked }); window.AM.toast(cb.checked ? 'Sumado al Outlet' : 'Quitado del Outlet'); }
      catch (e) { cb.checked = !cb.checked; window.AM.toast('Error: ' + e.message); }
      cb.disabled = false;
    });
    const price = el('span', { class: 'outlet-price' }, [
      el('span', { class: 'promo', text: money(p.promotional_price) }),
      el('span', { class: 'was', text: money(p.price) }),
    ]);
    list.appendChild(el('label', { class: 'outlet-row' }, [
      cb,
      p.image ? el('img', { src: p.image, alt: '', class: 'outlet-thumb' }) : el('span', { class: 'outlet-thumb' }),
      el('span', { class: 'outlet-name', text: p.name }),
      price,
    ]));
  });
  view.appendChild(list);
}

const CATEGORY_LABELS = {
  jeans: 'Jeans', remeras: 'Remeras', camisas: 'Camisas', vestidos: 'Vestidos',
  abrigos: 'Abrigos', calzado: 'Calzado', accesorios: 'Accesorios', wellness: 'Wellness',
  deco: 'Deco', belleza: 'Beauty', otros: 'Otros',
};

// ---------- Tablas de talle ----------
async function renderTalles() {
  const data = await apiGet('/brand-panel/size-charts');
  const cats = data.categories || [];
  const products = data.products || [];
  const charts = data.charts || [];
  const prodById = {};
  products.forEach((p) => { prodById[p.id] = p; });
  const catCharts = charts.filter((c) => c.scope !== 'products' && c.category);
  const prodCharts = charts.filter((c) => c.scope === 'products');

  view.replaceChildren();
  view.appendChild(el('p', { class: 'muted', style: 'font-size: var(--text-sm); margin-bottom: var(--space-3)',
    text: 'Cargá guías de talle. Las medidas van en centímetros (cm). Podés hacer una tabla por categoría (aplica a todos los productos de esa categoría) o por producto puntual.' }));

  // scope toggle
  let scope = 'category';
  const btnCat = el('button', { class: 'seg-btn is-active', type: 'button', text: 'Por categoría' });
  const btnProd = el('button', { class: 'seg-btn', type: 'button', text: 'Por producto' });
  btnCat.addEventListener('click', () => { scope = 'category'; btnCat.classList.add('is-active'); btnProd.classList.remove('is-active'); renderTarget(); });
  btnProd.addEventListener('click', () => { scope = 'products'; btnProd.classList.add('is-active'); btnCat.classList.remove('is-active'); renderTarget(); });
  view.appendChild(el('div', { class: 'seg' }, [btnCat, btnProd]));

  const targetHost = el('div', { style: 'margin: var(--space-3) 0' });
  const editorHost = el('div');
  view.append(targetHost, existingList(), editorHost);

  function renderTarget() {
    targetHost.replaceChildren();
    editorHost.replaceChildren();
    if (scope === 'category') {
      if (!cats.length) {
        targetHost.appendChild(el('p', { class: 'muted', style: 'font-size: var(--text-sm)', text: 'Todavía no tenés productos con categoría cargada para armar una tabla por categoría.' }));
        return;
      }
      const sel = el('select', { style: 'padding:0.5rem; border: var(--border); border-radius: var(--radius); background:#fff' });
      cats.forEach((c) => sel.appendChild(el('option', { value: c, text: CATEGORY_LABELS[c] || c })));
      const editBtn = el('button', { class: 'btn btn--sm', text: 'Editar / crear' });
      editBtn.addEventListener('click', () => openEditor({ scope: 'category', category: sel.value }, catCharts.find((c) => c.category === sel.value)));
      targetHost.append(el('div', { style: 'display:flex; gap: var(--space-2); align-items:flex-end; flex-wrap:wrap' }, [
        el('label', { style: 'display:grid; gap:0.3rem; font-size: var(--text-sm)' }, ['Categoría', sel]), editBtn,
      ]));
    } else {
      if (!products.length) { targetHost.appendChild(el('p', { class: 'muted', text: 'No hay productos para elegir.' })); return; }
      const selected = new Set();
      const box = el('div', { class: 'prod-picker' });
      products.forEach((p) => {
        const cb = el('input', { type: 'checkbox', value: p.id });
        cb.addEventListener('change', () => { if (cb.checked) selected.add(p.id); else selected.delete(p.id); });
        box.appendChild(el('label', { class: 'prod-opt' }, [cb, document.createTextNode(' ' + p.name + ' · ' + (CATEGORY_LABELS[p.category] || p.category || 'sin categoría'))]));
      });
      const editBtn = el('button', { class: 'btn btn--sm', text: 'Crear tabla para lo elegido' });
      editBtn.addEventListener('click', () => {
        if (!selected.size) { window.AM.toast('Elegí al menos un producto'); return; }
        openEditor({ scope: 'products', productIds: [...selected] }, null);
      });
      targetHost.append(
        el('p', { class: 'muted', style: 'font-size: var(--text-xs); margin-bottom: 0.4rem', text: 'Elegí a qué productos aplica esta tabla:' }),
        box, editBtn,
      );
    }
  }

  function existingList() {
    const wrap = el('div', { style: 'margin: var(--space-4) 0' });
    if (catCharts.length) {
      wrap.appendChild(el('h4', { style: 'margin-bottom: 0.4rem', text: 'Tablas por categoría' }));
      catCharts.forEach((c) => wrap.appendChild(chartRow(CATEGORY_LABELS[c.category] || c.category,
        () => openEditor({ scope: 'category', category: c.category }, c))));
    }
    if (prodCharts.length) {
      wrap.appendChild(el('h4', { style: 'margin: var(--space-3) 0 0.4rem', text: 'Tablas por producto' }));
      prodCharts.forEach((c) => {
        const names = (c.product_ids || []).map((id) => (prodById[id] && prodById[id].name) || '—').join(', ');
        wrap.appendChild(chartRow((c.title || 'Tabla') + ' → ' + (names || 'sin productos'),
          () => openEditor({ scope: 'products', productIds: c.product_ids || [], id: c.id }, c)));
      });
    }
    if (!catCharts.length && !prodCharts.length) {
      wrap.appendChild(el('p', { class: 'muted', style: 'font-size: var(--text-xs)', text: 'Todavía no cargaste ninguna tabla.' }));
    }
    return wrap;
  }

  function chartRow(label, onEdit) {
    const btn = el('button', { class: 'linklike', type: 'button', text: 'Editar' });
    btn.addEventListener('click', onEdit);
    return el('div', { class: 'chart-row' }, [el('span', { text: label }), btn]);
  }

  function openEditor(target, existing) {
    const model = existing && existing.columns && existing.columns.length
      ? { title: existing.title || '', columns: existing.columns.slice(), rows: (existing.rows || []).map((r) => r.slice()), note: existing.note || '' }
      : { title: '', columns: ['Talle', 'Busto', 'Cintura', 'Cadera'], rows: [['', '', '', ''], ['', '', '', ''], ['', '', '', '']], note: '' };

    const heading = target.scope === 'category'
      ? 'Tabla de ' + (CATEGORY_LABELS[target.category] || target.category)
      : 'Tabla para ' + (target.productIds || []).map((id) => (prodById[id] && prodById[id].name) || '—').join(', ');

    const host = el('div', { class: 'edit-box' });
    editorHost.replaceChildren(host);

    function normalizeRows() {
      model.rows = model.rows.map((r) => {
        const nr = r.slice(0, model.columns.length);
        while (nr.length < model.columns.length) nr.push('');
        return nr;
      });
    }

    function paint() {
      normalizeRows();
      host.replaceChildren();
      host.appendChild(el('h3', { text: heading }));
      host.appendChild(el('p', { class: 'muted', style: 'font-size: var(--text-xs); margin-bottom: var(--space-2)', text: 'Todas las medidas en centímetros (cm).' }));

      const titleInput = el('input', { value: model.title, placeholder: 'Título (ej: Guía de talles — Jeans)', style: 'width:100%; margin-bottom: var(--space-2)' });
      titleInput.addEventListener('input', () => { model.title = titleInput.value; });
      host.appendChild(el('label', { style: 'display:grid; gap:0.3rem; font-size: var(--text-sm)' }, ['Título', titleInput]));

      const tbl = el('table', { style: 'margin: var(--space-3) 0' });
      const headRow = el('tr', {});
      model.columns.forEach((col, ci) => {
        const inp = el('input', { value: col, placeholder: 'Columna', style: 'width: 100%; font-weight:600' });
        inp.addEventListener('input', () => { model.columns[ci] = inp.value; });
        const th = el('th', {}, [inp]);
        if (model.columns.length > 1) {
          const rm = el('button', { class: 'linklike', type: 'button', text: '✕', title: 'Quitar columna', style: 'margin-left:0.3rem' });
          rm.addEventListener('click', () => { model.columns.splice(ci, 1); model.rows.forEach((r) => r.splice(ci, 1)); paint(); });
          th.appendChild(rm);
        }
        headRow.appendChild(th);
      });
      const thead = el('thead', {}, [headRow]);
      const tbody = el('tbody', {});
      model.rows.forEach((row, ri) => {
        const tr = el('tr', {});
        model.columns.forEach((_, ci) => {
          const inp = el('input', { value: row[ci] || '', style: 'width:100%' });
          inp.addEventListener('input', () => { model.rows[ri][ci] = inp.value; });
          tr.appendChild(el('td', {}, [inp]));
        });
        tr.appendChild(el('td', {}, [(function () {
          const rm = el('button', { class: 'linklike', type: 'button', text: '✕', title: 'Quitar fila' });
          rm.addEventListener('click', () => { model.rows.splice(ri, 1); paint(); });
          return rm;
        })()]));
        tbody.appendChild(tr);
      });
      tbl.append(thead, tbody);
      host.appendChild(el('div', { class: 'table-wrap' }, [tbl]));

      const addRow = el('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: '+ Fila' });
      addRow.addEventListener('click', () => { model.rows.push(model.columns.map(() => '')); paint(); });
      const addCol = el('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: '+ Columna' });
      addCol.addEventListener('click', () => { model.columns.push('Medida'); model.rows.forEach((r) => r.push('')); paint(); });
      host.appendChild(el('div', { style: 'display:flex; gap:var(--space-2); margin-bottom: var(--space-3)' }, [addRow, addCol]));

      const noteInput = el('textarea', { rows: 2, placeholder: 'Aclaración (ej: cómo medir)', style: 'width:100%' });
      noteInput.value = model.note;
      noteInput.addEventListener('input', () => { model.note = noteInput.value; });
      host.appendChild(el('label', { style: 'display:grid; gap:0.3rem; font-size: var(--text-sm)' }, ['Nota', noteInput]));

      const payloadBase = () => {
        const p = { scope: target.scope, title: model.title, columns: model.columns, rows: model.rows, note: model.note };
        if (target.scope === 'category') p.category = target.category;
        else { p.product_ids = target.productIds; if (target.id) p.id = target.id; }
        return p;
      };

      const save = el('button', { class: 'btn', type: 'button', text: 'Guardar tabla', style: 'margin-top: var(--space-3)' });
      save.addEventListener('click', async () => {
        save.disabled = true;
        try { await apiPost('/brand-panel/size-charts', payloadBase()); window.AM.toast('Tabla guardada'); render('talles'); }
        catch (e) { window.AM.toast('Error: ' + e.message); save.disabled = false; }
      });
      const canDelete = target.scope === 'category' || target.id;
      const buttons = [save];
      if (canDelete) {
        const clear = el('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: 'Vaciar tabla', style: 'margin-top: var(--space-3); margin-left: var(--space-2)' });
        clear.addEventListener('click', async () => {
          if (!confirm('¿Borrar esta tabla de talles?')) return;
          const del = target.scope === 'category' ? { scope: 'category', category: target.category, columns: [], rows: [] } : { scope: 'products', id: target.id, columns: [], rows: [] };
          try { await apiPost('/brand-panel/size-charts', del); window.AM.toast('Tabla eliminada'); render('talles'); }
          catch (e) { window.AM.toast('Error: ' + e.message); }
        });
        buttons.push(clear);
      }
      host.append.apply(host, buttons);
    }
    paint();
  }

  renderTarget();
}

function renderResumen() {
  const s = overview.summary;
  view.append(
    el('p', { class: 'headline', text: 'Anti Market te vendió ' + money(s.month_sales) + ' este mes.' }),
    el('div', { class: 'kpis' }, [
      kpi(money(s.month_sales_shopping), 'Ventas · shopping'),
      kpi(money(s.month_sales_agent), 'Ventas · asesora'),
      kpi(String(s.month_orders), 'Órdenes atribuidas'),
      kpi(money(s.month_commission_accrued), 'Comisión devengada (6,5%)'),
    ]),
    chart(overview.daily_sales),
  );
}

function kpi(value, label) {
  return el('div', { class: 'kpi' }, [
    el('div', { class: 'v', text: value }),
    el('div', { class: 'l', text: label }),
  ]);
}

// simple native SVG bar chart — no libraries (section 8.1)
function chart(daily) {
  const box = el('div', { class: 'chart-box' });
  if (!daily.length) {
    box.appendChild(el('p', { class: 'empty', text: 'Sin ventas atribuidas este mes todavía.' }));
    return box;
  }
  const W = 640, H = 160, pad = 4;
  const max = Math.max(...daily.map((d) => d.total));
  const bw = (W - pad * 2) / daily.length;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H + 20}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Ventas atribuidas por día');
  daily.forEach((d, i) => {
    const h = max ? (d.total / max) * (H - 10) : 0;
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', pad + i * bw + 1);
    rect.setAttribute('y', H - h);
    rect.setAttribute('width', Math.max(bw - 2, 1));
    rect.setAttribute('height', h);
    rect.setAttribute('fill', 'var(--accent)');
    const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    title.textContent = d.date + ': ' + money(d.total);
    rect.appendChild(title);
    svg.appendChild(rect);
  });
  box.appendChild(svg);
  return box;
}

function renderOrdenes() {
  const rows = overview.orders;
  if (!rows.length) {
    view.appendChild(el('p', { class: 'empty', text: 'Sin órdenes atribuidas todavía.' }));
    return;
  }
  view.appendChild(el('p', { class: 'muted', style: 'font-size: var(--text-sm); margin-bottom: var(--space-3)', text: 'Cada orden es verificable en el admin de tu propia Tienda Nube por su número.' }));
  view.appendChild(el('div', { class: 'table-wrap' }, [
    el('table', {}, [
      el('thead', {}, [el('tr', {}, ['Orden TN', 'Fecha', 'Total', 'Canal', 'Matching', 'Comisión', 'Estado'].map((h) => el('th', { text: h })))]),
      el('tbody', {}, rows.map((o) => el('tr', {}, [
        el('td', { text: '#' + (o.tn_order_number || '—') }),
        el('td', { text: (o.placed_at || '').slice(0, 10) }),
        el('td', { class: 'num', text: money(o.total) }),
        el('td', { text: o.channel === 'agent' ? 'asesora' : 'shopping' }),
        el('td', { text: o.match_method }),
        el('td', { class: 'num', text: money(o.commission) }),
        el('td', { text: o.status === 'reversed' ? 'revertida' : (o.status === 'settled' ? 'liquidada' : 'devengada') }),
      ]))),
    ]),
  ]));
}

async function renderLiquidaciones() {
  const data = await apiGet('/brand-panel/settlements');
  if (!data.settlements.length) {
    view.appendChild(el('p', { class: 'empty', text: 'Todavía no hay liquidaciones emitidas.' }));
  } else {
    view.appendChild(el('div', { class: 'table-wrap' }, [
      el('table', {}, [
        el('thead', {}, [el('tr', {}, ['Período', 'Ventas', 'Comisión', 'Vence', 'Estado', ''].map((h) => el('th', { text: h })))]),
        el('tbody', {}, data.settlements.map((s) => el('tr', {}, [
          el('td', { text: s.period_start + ' → ' + s.period_end }),
          el('td', { class: 'num', text: money(s.total_sales) }),
          el('td', { class: 'num', text: money(s.total_commission) }),
          el('td', { text: s.due_date }),
          el('td', {}, [el('span', { class: 'badge' + (s.status === 'paid' ? ' badge--paid' : s.status === 'overdue' ? ' badge--overdue' : ''), text: statusLabel(s.status) })]),
          el('td', {}, [csvLink(s.id)]),
        ]))),
      ]),
    ]));
  }
  const pay = data.payment_info;
  view.appendChild(el('p', { class: 'muted', style: 'margin-top: var(--space-3); font-size: var(--text-sm)', text: 'Pago por transferencia — alias: ' + pay.alias + ' (' + pay.holder + '). ' + pay.note }));
}

function statusLabel(status) {
  return { issued: 'emitida', paid: 'pagada', overdue: 'vencida', disputed: 'en revisión' }[status] || status;
}

function csvLink(id) {
  const a = el('a', { href: '#', text: 'CSV' });
  a.addEventListener('click', async (e) => {
    e.preventDefault();
    const res = await fetch('/api' + withStore('/brand-panel/settlements?id=' + id + '&format=csv'), { headers: { authorization: 'Bearer ' + token } });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const tmp = el('a', { href: url, download: 'antimarket-liquidacion.csv' });
    document.body.appendChild(tmp);
    tmp.click();
    tmp.remove();
    URL.revokeObjectURL(url);
  });
  return a;
}
