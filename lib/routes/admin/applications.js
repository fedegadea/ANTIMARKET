// Brand applications.
// POST   — public (application form): rate limit 5/IP/day + honeypot.
// GET    — admin: list with cap counter.
// PATCH  — admin: change status (invited sends the install-link email).
import { db, userFromRequest, isAdminEmail } from '../../db.js';
import { json, err, readJson, str, optStr, isEmail, clientIp } from '../../http.js';
import { sha256Hex } from '../../crypto.js';
import { sendEmail, escapeHtml } from '../../email.js';

const CATEGORIES = ['moda', 'wellness', 'gourmet', 'deco', 'belleza', 'accesorios'];

export async function POST(request) {
  const body = await readJson(request);
  if (!body) return err(400, 'invalid body');

  // honeypot: bots fill every field; humans never see this one
  if (body.website) return json({ ok: true });

  const brandName = str(body.brand_name, { max: 80 });
  const contactName = str(body.contact_name, { max: 80 });
  const email = isEmail(body.email) ? body.email.toLowerCase() : null;
  const category = CATEGORIES.includes(body.category) ? body.category : null;
  if (!brandName || !contactName || !email || !category) return err(400, 'missing fields');

  const supa = db();
  const ipHash = sha256Hex(clientIp(request));
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await supa
    .from('brand_applications')
    .select('id', { count: 'exact', head: true })
    .eq('ip_hash', ipHash)
    .gte('created_at', since);
  if ((count || 0) >= 5) return err(429, 'too many applications');

  const { error } = await supa.from('brand_applications').insert({
    brand_name: brandName,
    contact_name: contactName,
    email,
    phone: optStr(body.phone, { max: 40 }),
    instagram: optStr(body.instagram, { max: 80 }),
    tn_url: optStr(body.tn_url, { max: 200 }),
    category,
    monthly_orders_estimate: optStr(body.monthly_orders_estimate, { max: 40 }),
    why: optStr(body.why, { max: 1000 }),
    ip_hash: ipHash,
  });
  if (error) return err(500, 'could not save application');
  return json({ ok: true });
}

async function requireAdmin(request) {
  const user = await userFromRequest(request);
  if (!user || !isAdminEmail(user.email)) return null;
  return user;
}

export async function GET(request) {
  if (!(await requireAdmin(request))) return err(403, 'admin only');
  const supa = db();
  const [{ data: applications }, { count: activeCount }] = await Promise.all([
    supa.from('brand_applications').select('*').order('created_at', { ascending: false }).limit(200),
    supa.from('stores').select('id', { count: 'exact', head: true }).eq('status', 'active'),
  ]);
  return json({ applications: applications || [], active_stores: activeCount || 0 });
}

export async function PATCH(request) {
  if (!(await requireAdmin(request))) return err(403, 'admin only');
  const body = await readJson(request);
  const id = str(body?.id, { max: 40 });
  const status = ['waitlist', 'invited', 'approved', 'rejected'].includes(body?.status) ? body.status : null;
  if (!id || !status) return err(400, 'id and valid status required');

  const supa = db();
  const { data: application, error } = await supa
    .from('brand_applications')
    .update({ status })
    .eq('id', id)
    .select('*')
    .single();
  if (error) return err(500, 'update failed');

  if (status === 'invited') {
    const installUrl = `${process.env.PUBLIC_BASE_URL}/api/tn/install`;
    await sendEmail(
      application.email,
      'Hay un lugar para tu marca en Anti Market',
      `<p>Hola ${escapeHtml(application.contact_name)},</p>
       <p>Tu marca <strong>${escapeHtml(application.brand_name)}</strong> fue invitada a Anti Market — la selección de marcas argentinas.</p>
       <p>Para entrar, instalá nuestra app en tu Tienda Nube (lleva 10 minutos y no toca nada de tu tienda):</p>
       <p><a href="${installUrl}">${installUrl}</a></p>
       <p>Tu catálogo, stock y precios se sincronizan solos. Cero costo fijo: 6,5% solo sobre ventas que te originamos, verificables orden por orden.</p>
       <p>— El equipo de Anti Market</p>`,
    );
  }
  return json({ application });
}
