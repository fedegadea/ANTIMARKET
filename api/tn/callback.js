// GET /api/tn/callback?code= — exchanges code for token, upserts store as
// 'pending' (not public until admin approval), registers webhooks, kicks initial sync.
import { db } from '../../lib/db.js';
import { encryptToken } from '../../lib/crypto.js';
import { exchangeCode, getStoreInfo, registerWebhooks, localized } from '../../lib/tn.js';
import { syncStore } from '../../lib/sync.js';
import { getCookie } from '../../lib/http.js';

function slugify(text) {
  return String(text).toLowerCase().normalize('NFD')
    .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

export async function GET(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookieState = getCookie(request, 'am_oauth_state');
  if (!code) return new Response('Falta el código de autorización.', { status: 400 });
  // DECISIÓN: state is best-effort — TN may initiate installs from its own admin
  // (no prior visit to /install), so a missing cookie doesn't block; a mismatched one does.
  if (state && cookieState && state !== cookieState) {
    return new Response('Estado de OAuth inválido.', { status: 403 });
  }

  const supa = db();
  try {
    const { accessToken, tnStoreId } = await exchangeCode(code);
    const encrypted = encryptToken(accessToken);

    // Upsert minimal row first so tnFetch (which reads the row) works.
    const { data: existing } = await supa.from('stores').select('id, status, slug').eq('tn_store_id', tnStoreId).maybeSingle();

    let storeId;
    if (existing) {
      // reinstall: refresh token, revive if it was suspended by uninstall
      const revive = existing.status === 'suspended' ? { status: 'pending' } : {};
      await supa.from('stores').update({
        access_token: encrypted, token_invalid: false, installed_at: new Date().toISOString(), ...revive,
      }).eq('id', existing.id);
      storeId = existing.id;
    } else {
      const { data: created, error } = await supa.from('stores').insert({
        tn_store_id: tnStoreId,
        access_token: encrypted,
        name: `Tienda ${tnStoreId}`,
        slug: `tienda-${tnStoreId}`,
        contact_email: 'pending@antimarket.local',
        tn_url: 'https://pending',
        status: 'pending',
        installed_at: new Date().toISOString(),
      }).select('id').single();
      if (error) throw new Error(`store insert failed: ${error.message}`);
      storeId = created.id;
    }

    const { data: store } = await supa.from('stores').select('*').eq('id', storeId).single();

    // Enrich with real store info from TN.
    const info = await getStoreInfo(store);
    if (info) {
      const name = localized(info.name) || store.name;
      const patch = {
        name,
        tn_url: info.url_with_protocol || info.original_domain || store.tn_url,
        contact_email: info.email || store.contact_email,
      };
      if (!existing) patch.slug = `${slugify(name)}` || store.slug;
      const { error: upErr } = await supa.from('stores').update(patch).eq('id', storeId);
      if (upErr && !existing) {
        // slug collision -> keep unique fallback
        await supa.from('stores').update({ ...patch, slug: `${slugify(name)}-${tnStoreId}` }).eq('id', storeId);
      }
    }

    const fresh = { ...store, ...(info ? {} : {}) };
    await registerWebhooks(fresh);

    // Initial sync inline; the daily reconcile cron is the safety net if this times out.
    try {
      await syncStore(storeId);
    } catch (e) {
      console.error(`[callback] initial sync failed for ${tnStoreId}: ${e.message}`);
    }

    return new Response(null, {
      status: 302,
      headers: { location: '/para-marcas?instalada=1', 'set-cookie': 'am_oauth_state=; Path=/; Max-Age=0' },
    });
  } catch (e) {
    console.error(`[callback] ${e.message}`);
    return new Response('No pudimos completar la instalación. Escribinos y lo resolvemos.', { status: 500 });
  }
}
