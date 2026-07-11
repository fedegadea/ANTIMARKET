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

async function apiGet(path) {
  const res = await fetch('/api' + path, { headers: { authorization: 'Bearer ' + token } });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'HTTP ' + res.status);
  return res.json();
}

// --- auth ---
const { data: { session } } = await supabase.auth.getSession();
if (!session) {
  loginSection.hidden = false;
  loginSection.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('[data-login-msg]');
    const email = e.target.email.value.trim();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: location.origin + '/panel/' },
    });
    msg.className = error ? 'form-error' : 'form-ok';
    msg.textContent = error ? 'No pudimos mandar el link. Probá de nuevo.' : 'Listo — revisá tu casilla y abrí el link.';
  });
} else {
  token = session.access_token;
  await boot();
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
    loginSection.querySelector('form').hidden = true;
    const msg = $('[data-login-msg]');
    msg.className = 'form-error';
    msg.textContent = 'Esta cuenta no tiene una tienda asociada en Anti Market (' + e.message + ').';
    return;
  }
  $('[data-logout]').hidden = false;
  appSection.hidden = false;
  $('[data-store-name]').textContent = overview.store.name;

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
  if (tab === 'liquidaciones') renderLiquidaciones();
}

function renderResumen() {
  const s = overview.summary;
  view.append(
    el('p', { class: 'headline', text: 'Anti Market te vendió ' + money(s.month_sales) + ' este mes.' }),
    el('div', { class: 'kpis' }, [
      kpi(money(s.month_sales_shopping), 'Ventas · shopping'),
      kpi(money(s.month_sales_agent), 'Ventas · asesora'),
      kpi(String(s.month_orders), 'Órdenes atribuidas'),
      kpi(money(s.month_commission_accrued), 'Comisión devengada (7%)'),
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
    const res = await fetch('/api/brand-panel/settlements?id=' + id + '&format=csv', { headers: { authorization: 'Bearer ' + token } });
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
