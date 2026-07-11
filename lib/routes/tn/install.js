// GET /api/tn/install — kicks off the TN OAuth flow.
import { authorizeUrl } from '../../tn.js';

export async function GET() {
  const state = crypto.randomUUID();
  return new Response(null, {
    status: 302,
    headers: {
      location: authorizeUrl(state),
      // state cookie verified on callback (CSRF)
      'set-cookie': `am_oauth_state=${state}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax`,
    },
  });
}
