// Single function for all /api/catalog/* routes (Hobby function-count limit).
import { dispatcher } from '../../lib/http.js';
import * as products from '../../lib/routes/catalog/products.js';
import * as product from '../../lib/routes/catalog/product.js';
import * as brands from '../../lib/routes/catalog/brands.js';
import * as facets from '../../lib/routes/catalog/facets.js';

export const { GET, POST, PATCH } = dispatcher({ products, product, brands, facets });
