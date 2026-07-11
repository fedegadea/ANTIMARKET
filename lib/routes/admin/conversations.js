// Admin — escalated agent conversations (section 9.4).
// DECISIÓN: not in the spec's file tree but required by section 9.4; smallest
// addition that fulfills it. The team reply is appended to the conversation.
import { db, userFromRequest, isAdminEmail } from '../../db.js';
import { json, err, readJson, str, isUuid } from '../../http.js';

async function requireAdmin(request) {
  const user = await userFromRequest(request);
  return user && isAdminEmail(user.email) ? user : null;
}

export async function GET(request) {
  if (!(await requireAdmin(request))) return err(403, 'admin only');
  const { data: conversations } = await db()
    .from('agent_conversations')
    .select('id, needs_human, needs_human_reason, messages, updated_at')
    .eq('needs_human', true)
    .order('updated_at', { ascending: false })
    .limit(100);
  return json({ conversations: conversations || [] });
}

export async function PATCH(request) {
  if (!(await requireAdmin(request))) return err(403, 'admin only');
  const body = await readJson(request);
  if (!body || !isUuid(body.id)) return err(400, 'invalid id');
  const supa = db();

  const { data: conversation } = await supa.from('agent_conversations').select('*').eq('id', body.id).maybeSingle();
  if (!conversation) return err(404, 'not found');

  const patch = { updated_at: new Date().toISOString() };
  const reply = str(body.reply, { max: 2000 });
  if (reply) {
    patch.messages = [
      ...(conversation.messages || []),
      { role: 'assistant', content: reply, ts: new Date().toISOString(), from_team: true },
    ];
  }
  if (body.resolve === true) patch.needs_human = false;
  if (!reply && body.resolve !== true) return err(400, 'reply or resolve required');

  await supa.from('agent_conversations').update(patch).eq('id', body.id);
  return json({ ok: true });
}
