// Single function for all /api/brand-panel/* routes (Hobby function-count limit).
import { dispatcher } from '../../lib/http.js';
import * as overview from '../../lib/routes/brand-panel/overview.js';
import * as settlements from '../../lib/routes/brand-panel/settlements.js';
import * as sizeCharts from '../../lib/routes/brand-panel/size-charts.js';
import * as outlet from '../../lib/routes/brand-panel/outlet.js';

export const { GET, POST, PATCH } = dispatcher({ overview, settlements, 'size-charts': sizeCharts, outlet });
