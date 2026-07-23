// Settlement engine (section 10): accrued attributions -> monthly statement.
// Business model: commission accrues as credit in our favor per attributed sale;
// at cut-off the brand gets the statement and pays within 10 days.
import { db } from './db.js';
import { sendEmail, escapeHtml } from './email.js';

function round2(n) {
  return Math.round(n * 100) / 100;
}

// Generate one settlement for a store. Includes:
//  - all its 'accrued' attributions (positive lines)
//  - attributions reversed AFTER being settled, not yet credited (negative lines)
// Returns null if there's nothing to settle.
export async function settleStore(store, { periodStart, periodEnd }) {
  const supa = db();

  const { data: accrued } = await supa
    .from('attributions')
    .select('id, commission_amount, orders(total)')
    .eq('store_id', store.id)
    .eq('status', 'accrued');

  const { data: credits } = await supa
    .from('attributions')
    .select('id, commission_amount')
    .eq('store_id', store.id)
    .eq('status', 'reversed')
    .not('settlement_id', 'is', null)
    .is('reversal_settlement_id', null);

  if (!accrued?.length && !credits?.length) return null;

  const totalSales = round2((accrued || []).reduce((acc, a) => acc + Number(a.orders?.total || 0), 0));
  const commission = round2(
    (accrued || []).reduce((acc, a) => acc + Number(a.commission_amount), 0)
    - (credits || []).reduce((acc, a) => acc + Number(a.commission_amount), 0),
  );

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 10);

  const { data: settlement, error } = await supa.from('settlements').insert({
    store_id: store.id,
    period_start: periodStart,
    period_end: periodEnd,
    total_sales: totalSales,
    total_commission: commission,
    due_date: dueDate.toISOString().slice(0, 10),
  }).select('*').single();
  if (error) throw new Error(`settlement insert failed for ${store.slug}: ${error.message}`);

  if (accrued?.length) {
    await supa.from('attributions')
      .update({ status: 'settled', settlement_id: settlement.id })
      .in('id', accrued.map((a) => a.id));
  }
  if (credits?.length) {
    await supa.from('attributions')
      .update({ reversal_settlement_id: settlement.id })
      .in('id', credits.map((a) => a.id));
  }

  await notifyBrand(store, settlement);
  return settlement;
}

async function notifyBrand(store, settlement) {
  const panelUrl = `${process.env.PUBLIC_BASE_URL}/panel`;
  const fmt = (n) => '$' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2 });
  await sendEmail(
    store.contact_email,
    `Anti Market — tu liquidación del período ${settlement.period_start}`,
    `<p>Hola,</p>
     <p>Cerramos el período <strong>${settlement.period_start} al ${settlement.period_end}</strong> para <strong>${escapeHtml(store.name)}</strong>:</p>
     <ul>
       <li>Ventas atribuidas: <strong>${fmt(settlement.total_sales)}</strong></li>
       <li>Comisión (6,5%): <strong>${fmt(settlement.total_commission)}</strong></li>
       <li>Vencimiento: <strong>${settlement.due_date}</strong> (10 días)</li>
     </ul>
     <p>El detalle orden por orden — verificable contra tu propio admin de Tienda Nube — está en tu panel:</p>
     <p><a href="${panelUrl}">${panelUrl}</a></p>
     <p>— Anti Market</p>`,
  );
}

// CSV detail of a settlement (positive + credit-note lines).
export async function settlementCsv(settlement) {
  const supa = db();
  const { data: lines } = await supa
    .from('attributions')
    .select('channel, match_method, commission_rate, commission_amount, status, settlement_id, reversal_settlement_id, orders(tn_order_number, total, placed_at)')
    .or(`settlement_id.eq.${settlement.id},reversal_settlement_id.eq.${settlement.id}`);

  const rows = [['orden_tn', 'fecha', 'total_venta', 'canal', 'metodo_matching', 'tasa', 'comision']];
  for (const a of lines || []) {
    const isCredit = a.reversal_settlement_id === settlement.id && a.status === 'reversed';
    rows.push([
      a.orders?.tn_order_number || '',
      (a.orders?.placed_at || '').slice(0, 10),
      isCredit ? -Number(a.orders?.total || 0) : Number(a.orders?.total || 0),
      a.channel,
      isCredit ? `${a.match_method} (nota de crédito)` : a.match_method,
      a.commission_rate,
      isCredit ? -Number(a.commission_amount) : Number(a.commission_amount),
    ]);
  }
  rows.push([]);
  rows.push(['TOTAL VENTAS', settlement.total_sales, '', '', '', 'TOTAL COMISION', settlement.total_commission]);
  return rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
}
