// Single function for all /api/admin/* routes (Hobby function-count limit).
import { dispatcher } from '../../lib/http.js';
import * as applications from '../../lib/routes/admin/applications.js';
import * as stores from '../../lib/routes/admin/stores.js';
import * as settlements from '../../lib/routes/admin/settlements.js';
import * as conversations from '../../lib/routes/admin/conversations.js';
import * as sales from '../../lib/routes/admin/sales.js';
import * as carts from '../../lib/routes/admin/carts.js';
import * as customers from '../../lib/routes/admin/customers.js';
import * as reviews from '../../lib/routes/admin/reviews.js';

export const { GET, POST, PATCH } = dispatcher({ applications, stores, settlements, conversations, sales, carts, customers, reviews });
