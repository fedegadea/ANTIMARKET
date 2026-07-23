// Admin — MARKETING: the full customer base (leads + accounts), with CSV export.
// A "customer" row exists for anyone who left an email (pop-up/lead), created an
// account, or bought. This is the marketing DB.
import { db, userFromRequest, isAdminEmail } from '../../db.js';
import { json, err } from '../../http.js';

async function requireAdmin(request) {
  const user = await userFromRequest(request);
  return user && isAdminEmail(user.email) ? user : null;
}

const COLS = 'id, email, name, phone, size_top, size_bottom, size_shoes, style_notes, opt_in_marketing, auth_user_id, created_at';

export async function GET(request) {
  if (!(await requireAdmin(request))) return err(403, 'admin only');
  const supa = db();
  const url = new URL(request.url);

  // paginate the full table (PostgREST caps at 1000/page) by created_at + id.
  async function fetchAll() {
    const all = [];
    let from = 0;
    const size = 1000;
    for (;;) {
      const { data, error } = await supa.from('customers')
        .select(COLS).order('created_at', { ascending: false }).range(from, from + size - 1);
      if (error) throw new Error(error.message);
      all.push(...(data || []));
      if (!data || data.length < size) break;
      from += size;
    }
    return all;
  }

  let rows;
  try { rows = await fetchAll(); } catch (e) { return err(500, 'customers error'); }

  if (url.searchParams.get('format') === 'csv') {
    const header = ['email', 'nombre', 'telefono', 'talle_arriba', 'talle_abajo', 'talle_calzado', 'notas_estilo', 'acepta_marketing', 'tiene_cuenta', 'alta'];
    const esc = (v) => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [header.join(',')];
    for (const c of rows) {
      lines.push([
        c.email, c.name, c.phone, c.size_top, c.size_bottom, c.size_shoes, c.style_notes,
        c.opt_in_marketing ? 'si' : 'no', c.auth_user_id ? 'si' : 'no',
        (c.created_at || '').slice(0, 10),
      ].map(esc).join(','));
    }
    const csv = '﻿' + lines.join('\r\n');   // BOM so Excel reads UTF-8
    return new Response(csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="antimarket-clientes-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  const total = rows.length;
  const withAccount = rows.filter((c) => c.auth_user_id).length;
  const optIn = rows.filter((c) => c.opt_in_marketing).length;
  // trim style_notes for the table payload
  const customers = rows.slice(0, 500).map((c) => ({
    email: c.email, name: c.name, phone: c.phone,
    size_top: c.size_top, size_bottom: c.size_bottom, size_shoes: c.size_shoes,
    opt_in_marketing: c.opt_in_marketing, has_account: !!c.auth_user_id,
    created_at: c.created_at,
  }));

  return json({ totals: { total, with_account: withAccount, opt_in: optIn }, customers });
}
