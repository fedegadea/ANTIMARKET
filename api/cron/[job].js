// Single function for all /api/cron/* routes (Hobby function-count limit).
// vercel.json cron paths (/api/cron/reconcile, /api/cron/settle) resolve here.
import { dispatcher } from '../../lib/http.js';
import * as reconcile from '../../lib/routes/cron/reconcile.js';
import * as settle from '../../lib/routes/cron/settle.js';

export const { GET, POST, PATCH } = dispatcher({ reconcile, settle });
