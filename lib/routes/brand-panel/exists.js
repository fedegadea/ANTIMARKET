// GET /api/brand-panel/exists?email= — ¿ese email es el contacto de una marca
// registrada? Público (sin auth): sirve para gatear "crear contraseña" / "recuperar"
// en el login del panel, así una marca no crea un acceso que no lleva a ningún lado.
import { db } from '../../db.js';
import { json } from '../../http.js';

export async function GET(request) {
  const email = (new URL(request.url).searchParams.get('email') || '').trim().toLowerCase();
  if (!email || email.indexOf('@') < 1) return json({ isBrand: false });
  const { data } = await db().from('stores').select('id, name').ilike('contact_email', email).maybeSingle();
  return json({ isBrand: !!data, store_name: data ? data.name : null });
}
