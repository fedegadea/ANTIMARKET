// Minimal email interface (section 10.3). Resend as default provider, swappable.
// DECISIÓN: Resend via plain fetch — no SDK dependency needed for one endpoint.

export function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export async function sendEmail(to, subject, html) {
  const apiKey = process.env.EMAIL_PROVIDER_API_KEY;
  if (!apiKey) {
    console.warn(`[email] EMAIL_PROVIDER_API_KEY not set, skipping email to ${to}: ${subject}`);
    return { skipped: true };
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || 'Anti Market <hola@antimarket.com.ar>',
      to: [to],
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`[email] send failed ${res.status}: ${body.slice(0, 200)}`);
    return { error: res.status };
  }
  return await res.json();
}
