// Anti Market — admin panel. Auth: Supabase OTP restricted to ADMIN_EMAILS (server-side check).
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const { el, money, toast } = window.AM;
const $ = (sel) => document.querySelector(sel);

const config = await (await fetch('/api/config')).json();
const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);

const loginSection = $('[data-login]');
const appSection = $('[data-app]');
const view = $('[data-view]');
let token = null;

async function apiCall(path, method, body) {
  const res = await fetch('/api' + path, {
    method: method || 'GET',
    headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'HTTP ' + res.status);
  return res.json();
}

const { data: { session } } = await supabase.auth.getSession();
if (!session) {
  loginSection.hidden = false;
  loginSection.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('[data-login-msg]');
    const { error } = await supabase.auth.signInWithOtp({
      email: e.target.email.value.trim(),
      options: { emailRedirectTo: location.origin + '/admin/' },
    });
    msg.className = error ? 'form-error' : 'form-ok';
    msg.textContent = error ? 'No pudimos mandar el link.' : 'Revisá tu casilla.';
  });
} else {
  token = session.access_token;
  try {
    await boot();
  } catch (e) {
    loginSection.hidden = false;
    loginSection.querySelector('form').hidden = true;
    const msg = $('[data-login-msg]');
    msg.className = 'form-error';
    msg.textContent = 'Esta cuenta no es admin.';
  }
}

$('[data-logout]').addEventListener('click', async () => {
  await supabase.auth.signOut();
  location.reload();
});

async function boot() {
  const data = await apiCall('/admin/stores'); // also validates admin
  $('[data-active]').textContent = String(data.active);
  $('[data-logout]').hidden = false;
  appSection.hidden = false;
  document.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', 'false'));
      btn.setAttribute('aria-selected', 'true');
      render(btn.dataset.tab);
    });
  });
  render('aplicaciones');
}

function render(tab) {
  view.replaceChildren(el('p', { class: 'empty', text: 'Cargando…' }));
  const tabs = { aplicaciones, tiendas, liquidaciones, conversaciones, salud };
  tabs[tab]().catch((e) => {
    view.replaceChildren(el('p', { class: 'form-error', text: 'Error: ' + e.message }));
  });
}

function table(headers, rows) {
  return el('div', { class: 'table-wrap' }, [
    el('table', {}, [
      el('thead', {}, [el('tr', {}, headers.map((h) => el('th', { text: h })))]),
      el('tbody', {}, rows),
    ]),
  ]);
}

function actionBtn(label, fn) {
  const b = el('button', { class: 'btn btn--ghost btn--sm', text: label });
  b.addEventListener('click', async () => {
    b.disabled = true;
    try { await fn(); } catch (e) { toast('Error: ' + e.message); }
    b.disabled = false;
  });
  return b;
}

// ---------- Aplicaciones ----------
async function aplicaciones() {
  const data = await apiCall('/admin/applications');
  $('[data-active]').textContent = String(data.active_stores);
  view.replaceChildren(table(
    ['Marca', 'Contacto', 'Categoría', 'Órdenes/mes', '¿Por qué?', 'Estado', 'Acciones'],
    data.applications.map((a) => el('tr', {}, [
      el('td', {}, [el('strong', { text: a.brand_name }), el('div', { class: 'muted', text: a.instagram || '' })]),
      el('td', {}, [el('div', { text: a.contact_name }), el('div', { class: 'muted', text: a.email })]),
      el('td', { text: a.category }),
      el('td', { text: a.monthly_orders_estimate || '—' }),
      el('td', { text: (a.why || '').slice(0, 120) }),
      el('td', {}, [el('span', { class: 'badge', text: a.status })]),
      el('td', {}, [el('div', { class: 'row-actions' }, [
        actionBtn('Invitar', () => patchApp(a.id, 'invited')),
        actionBtn('Waitlist', () => patchApp(a.id, 'waitlist')),
        actionBtn('Rechazar', () => patchApp(a.id, 'rejected')),
      ])]),
    ])),
  ));
  if (!data.applications.length) view.replaceChildren(el('p', { class: 'empty', text: 'Sin aplicaciones todavía.' }));

  async function patchApp(id, status) {
    await apiCall('/admin/applications', 'PATCH', { id, status });
    toast(status === 'invited' ? 'Invitación enviada por email' : 'Actualizado');
    render('aplicaciones');
  }
}

// ---------- Tiendas ----------
async function tiendas() {
  const data = await apiCall('/admin/stores');
  $('[data-active]').textContent = String(data.active);
  view.replaceChildren(table(
    ['Tienda', 'Estado', 'Branding', 'Último sync', 'Acciones'],
    data.stores.map((s) => el('tr', {}, [
      el('td', {}, [
        el('strong', { text: s.name }),
        el('div', { class: 'muted', text: s.contact_email }),
        el('div', { class: 'muted', text: s.tn_url }),
      ]),
      el('td', {}, [el('span', { class: 'badge' + (s.status === 'active' ? ' badge--ok' : s.status === 'suspended' ? ' badge--bad' : ''), text: s.status })]),
      el('td', { text: s.branding_approved ? '✓ aprobado' : 'pendiente' }),
      el('td', {}, [
        el('div', { text: s.last_sync_at ? s.last_sync_at.slice(0, 16).replace('T', ' ') : 'nunca' }),
        s.token_invalid ? el('span', { class: 'badge badge--bad', text: 'token inválido' }) : null,
      ]),
      el('td', {}, [el('div', { class: 'row-actions' }, [
        s.status !== 'active' ? actionBtn('Aprobar', () => patchStore({ id: s.id, action: 'approve' })) : null,
        s.status === 'active' ? actionBtn('Suspender', () => patchStore({ id: s.id, action: 'suspend' })) : null,
        actionBtn('Editar', () => editStore(s)),
      ].filter(Boolean))]),
    ])),
  ));
  if (!data.stores.length) view.replaceChildren(el('p', { class: 'empty', text: 'Sin tiendas conectadas todavía. La instalación llega por /api/tn/install.' }));

  async function patchStore(body) {
    await apiCall('/admin/stores', 'PATCH', body);
    toast('Actualizado');
    render('tiendas');
  }

  async function editStore(s) {
    const old = view.querySelector('.edit-box');
    if (old) old.remove();
    const field = (label, name, value, type) => el('label', {}, [label,
      type === 'textarea'
        ? el('textarea', { name, rows: 3, text: value || '' })
        : el('input', { name, value: value || '' }),
    ]);
    const form = el('form', { class: 'form-grid' }, [
      field('Nombre', 'name', s.name),
      field('Tagline', 'tagline', s.tagline),
      field('Bio', 'bio', s.bio, 'textarea'),
      field('Logo URL', 'logo_url', s.logo_url),
      field('Cover URL', 'cover_url', s.cover_url),
      field('Color de marca (#hex)', 'brand_color', s.brand_color),
      field('Email de contacto', 'contact_email', s.contact_email),
      field('Descuento cupón asesora (%)', 'coupon_discount_pct', s.coupon_discount_pct),
      field('Mapeo categorías TN → interna (JSON)', 'tn_category_map', JSON.stringify(s.tn_category_map || {}), 'textarea'),
      el('label', {}, [el('input', { type: 'checkbox', name: 'branding_approved', style: 'width:auto', ...(s.branding_approved ? { checked: true } : {}) }), ' Branding aprobado']),
      el('button', { class: 'btn', type: 'submit', text: 'Guardar' }),
    ]);
    const box = el('div', { class: 'edit-box' }, [el('h3', { text: 'Editar ' + s.name }), form, el('div', { 'data-featured': '' })]);
    view.prepend(box);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      let map = {};
      try { map = JSON.parse(f.tn_category_map.value || '{}'); } catch { toast('JSON de mapeo inválido'); return; }
      await apiCall('/admin/stores', 'PATCH', {
        id: s.id,
        name: f.name.value, tagline: f.tagline.value, bio: f.bio.value,
        logo_url: f.logo_url.value, cover_url: f.cover_url.value,
        brand_color: f.brand_color.value || null,
        contact_email: f.contact_email.value,
        coupon_discount_pct: Number(f.coupon_discount_pct.value),
        tn_category_map: map,
        branding_approved: f.branding_approved.checked,
      });
      toast('Guardado');
      render('tiendas');
    });

    // featured curation
    const { products } = await apiCall('/admin/stores?products=' + s.id);
    const featuredBox = box.querySelector('[data-featured]');
    featuredBox.appendChild(el('h3', { text: 'Elegidos de la semana', style: 'margin-top: var(--space-3)' }));
    products.forEach((p) => {
      const cb = el('input', { type: 'checkbox', style: 'width:auto', ...(p.featured ? { checked: true } : {}) });
      cb.addEventListener('change', () => apiCall('/admin/stores', 'PATCH', { product_id: p.id, featured: cb.checked }).then(() => toast('Guardado')));
      featuredBox.appendChild(el('label', { style: 'display:flex; gap:0.5rem; font-size: var(--text-sm); align-items:center' }, [cb, p.name + ' (' + (p.category || 'otros') + ')']));
    });
  }
}

// ---------- Liquidaciones ----------
async function liquidaciones() {
  const data = await apiCall('/admin/settlements');
  if (!data.settlements.length) {
    view.replaceChildren(el('p', { class: 'empty', text: 'Sin liquidaciones. El cron corre el 1 y el 16 de cada mes.' }));
    return;
  }
  view.replaceChildren(table(
    ['Marca', 'Período', 'Ventas', 'Comisión', 'Vence', 'Estado', 'Acciones'],
    data.settlements.map((s) => el('tr', {}, [
      el('td', { text: s.stores?.name || '—' }),
      el('td', { text: s.period_start + ' → ' + s.period_end }),
      el('td', { text: money(s.total_sales) }),
      el('td', { text: money(s.total_commission) }),
      el('td', { text: s.due_date }),
      el('td', {}, [el('span', { class: 'badge' + (s.status === 'paid' ? ' badge--ok' : s.status === 'overdue' ? ' badge--bad' : ''), text: s.status })]),
      el('td', {}, [el('div', { class: 'row-actions' }, [
        s.status !== 'paid' ? actionBtn('Marcar pagada', async () => {
          await apiCall('/admin/settlements', 'PATCH', { id: s.id, action: 'mark_paid' });
          toast('Marcada como pagada');
          render('liquidaciones');
        }) : null,
        el('a', { class: 'btn btn--ghost btn--sm', href: '#', text: 'CSV', onclick: (e) => { e.preventDefault(); downloadCsv(s.id); } }),
      ].filter(Boolean))]),
    ])),
  ));

  async function downloadCsv(id) {
    const res = await fetch('/api/admin/settlements?id=' + id + '&format=csv', { headers: { authorization: 'Bearer ' + token } });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: 'liquidacion.csv' });
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }
}

// ---------- Conversaciones escaladas ----------
async function conversaciones() {
  const data = await apiCall('/admin/conversations');
  view.replaceChildren();
  if (!data.conversations.length) {
    view.appendChild(el('p', { class: 'empty', text: 'Sin conversaciones escaladas. Buen día en la oficina.' }));
    return;
  }
  data.conversations.forEach((c) => {
    const log = el('div', { class: 'log' });
    (c.messages || []).slice(-20).forEach((m) => {
      log.appendChild(el('div', { class: m.role === 'user' ? 'u' : 'a', text: (m.role === 'user' ? 'Clienta: ' : m.from_team ? 'Equipo: ' : 'Asesora: ') + m.content }));
    });
    const input = el('textarea', { rows: 2, placeholder: 'Respuesta del equipo…' });
    view.appendChild(el('div', { class: 'conv' }, [
      el('div', { class: 'muted', text: 'Motivo: ' + (c.needs_human_reason || '—') + ' · ' + c.updated_at.slice(0, 16).replace('T', ' ') }),
      log,
      input,
      el('div', { class: 'row-actions', style: 'margin-top: 0.5rem' }, [
        actionBtn('Responder', async () => {
          if (!input.value.trim()) return;
          await apiCall('/admin/conversations', 'PATCH', { id: c.id, reply: input.value.trim() });
          toast('Respuesta enviada');
          render('conversaciones');
        }),
        actionBtn('Resolver (devolver a la asesora)', async () => {
          await apiCall('/admin/conversations', 'PATCH', { id: c.id, resolve: true });
          render('conversaciones');
        }),
      ]),
    ]));
  });
}

// ---------- Salud ----------
async function salud() {
  const data = await apiCall('/admin/stores');
  view.replaceChildren(
    el('h3', { text: 'Sync por tienda' }),
    table(['Tienda', 'Estado', 'Último sync', 'Stats', 'Token'],
      data.stores.map((s) => el('tr', {}, [
        el('td', { text: s.name }),
        el('td', { text: s.status }),
        el('td', { text: s.last_sync_at ? s.last_sync_at.slice(0, 16).replace('T', ' ') : 'nunca' }),
        el('td', { text: s.last_sync_stats ? JSON.stringify(s.last_sync_stats) : '—' }),
        el('td', {}, [s.token_invalid ? el('span', { class: 'badge badge--bad', text: 'inválido' }) : el('span', { class: 'badge badge--ok', text: 'ok' })]),
      ]))),
    el('h3', { text: 'Webhooks fallidos (últimos 30)', style: 'margin-top: var(--space-4)' }),
    data.webhook_failures.length
      ? table(['Fecha', 'Tienda TN', 'Evento', 'Estado', 'Detalle'],
          data.webhook_failures.map((w) => el('tr', {}, [
            el('td', { text: w.created_at.slice(0, 19).replace('T', ' ') }),
            el('td', { text: String(w.tn_store_id || '—') }),
            el('td', { text: w.event || '—' }),
            el('td', { text: w.status }),
            el('td', { text: (w.detail || '').slice(0, 120) }),
          ])))
      : el('p', { class: 'empty', text: 'Sin fallas registradas.' }),
  );
}
