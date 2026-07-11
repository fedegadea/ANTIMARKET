// Settlement cut-off cron. Runs on day 1 (all active stores, previous month)
// and day 16 (only stores whose accrued balance exceeds settlement_threshold_ars,
// covering the 1st-15th — the biweekly cut of section 10).
import { db } from '../../lib/db.js';
import { settleStore } from '../../lib/settle.js';
import { isCronAuthorized, json, err } from '../../lib/http.js';

export async function GET(request) {
  if (!isCronAuthorized(request)) return err(401, 'unauthorized');

  const supa = db();
  const now = new Date();
  const day = now.getUTCDate();
  const biweekly = day >= 10 && day <= 20; // the 16th run (tolerant to manual triggers)

  let periodStart, periodEnd;
  if (biweekly) {
    periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
    periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 15)).toISOString().slice(0, 10);
  } else {
    const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
    periodStart = first.toISOString().slice(0, 10);
    periodEnd = last.toISOString().slice(0, 10);
  }

  const { data: stores } = await supa
    .from('stores')
    .select('*')
    .in('status', ['active', 'suspended']); // suspended brands still owe accrued commissions

  const results = [];
  for (const store of stores || []) {
    try {
      if (biweekly) {
        const { data: accrued } = await supa
          .from('attributions')
          .select('commission_amount')
          .eq('store_id', store.id)
          .eq('status', 'accrued');
        const balance = (accrued || []).reduce((acc, a) => acc + Number(a.commission_amount), 0);
        if (balance < Number(store.settlement_threshold_ars)) continue;
      }
      const settlement = await settleStore(store, { periodStart, periodEnd });
      if (settlement) results.push({ store: store.slug, commission: settlement.total_commission });
    } catch (e) {
      results.push({ store: store.slug, error: e.message });
    }
  }

  return json({ period: { periodStart, periodEnd }, biweekly, settled: results });
}
