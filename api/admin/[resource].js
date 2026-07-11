// Single function for all /api/admin/* routes (Hobby function-count limit).
import { dispatcher } from '../../lib/http.js';
import * as applications from '../../lib/routes/admin/applications.js';
import * as stores from '../../lib/routes/admin/stores.js';
import * as settlements from '../../lib/routes/admin/settlements.js';
import * as conversations from '../../lib/routes/admin/conversations.js';

export const { GET, POST, PATCH } = dispatcher({ applications, stores, settlements, conversations });
