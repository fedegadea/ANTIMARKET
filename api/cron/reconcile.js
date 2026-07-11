// Daily defensive re-sync (05:00 ART) — safety net for missed webhooks.
// Also flags overdue settlements (section 10.4).
import { db } from '../../lib/db.js';
import { syncStore } from '../../lib/sync.js';
import { isCronAuthorized, json, err } from '../../lib/http.js';

export async function GET(request) {
  if (!isCronAuthorized(request)) return err(401, 'unauthorized');
  const supa = db();

  const { data: stores } = await supa.from('stores').select('id, slug').eq('status', 'active');
  const results = [];
  for (const store of stores || []) {
    try {
      const stats = await syncStore(store.id);
      results.push({ store: store.slug, ...stats });
    } catch (e) {
      results.push({ store: store.slug, error: e.message });
    }
  }

  // overdue settlements: issued + past due_date
  const today = new Date().toISOString().slice(0, 10);
  const { data: overdue } = await supa
    .from('settlements')
    .update({ status: 'overdue' })
    .eq('status', 'issued')
    .lt('due_date', today)
    .select('id, store_id');

  return json({ synced: results, overdue_marked: overdue?.length || 0 });
}
