// Single function for all /api/tn/* routes (Hobby function-count limit).
import { dispatcher } from '../../lib/http.js';
import * as install from '../../lib/routes/tn/install.js';
import * as callback from '../../lib/routes/tn/callback.js';
import * as webhook from '../../lib/routes/tn/webhook.js';
import * as privacy from '../../lib/routes/tn/privacy.js';

export const { GET, POST, PATCH } = dispatcher({ install, callback, webhook, privacy });
