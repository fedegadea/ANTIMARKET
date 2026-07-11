// AES-256-GCM encryption for store access tokens (section 13.1).
// TOKEN_ENCRYPTION_KEY: 64 hex chars (32 bytes). Generate: openssl rand -hex 32
import { createCipheriv, createDecipheriv, randomBytes, createHmac } from 'node:crypto';

function key() {
  const hex = process.env.TOKEN_ENCRYPTION_KEY || '';
  if (hex.length !== 64) throw new Error('TOKEN_ENCRYPTION_KEY must be 64 hex chars');
  return Buffer.from(hex, 'hex');
}

export function encryptToken(plain) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${enc.toString('base64')}`;
}

export function decryptToken(stored) {
  const [iv, tag, data] = stored.split('.').map((p) => Buffer.from(p, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

export function hmacSha256Hex(secret, data) {
  return createHmac('sha256', secret).update(data).digest('hex');
}

export function sha256Hex(data) {
  return createHmac('sha256', 'am-ip-salt').update(data).digest('hex');
}

// Timing-safe-ish comparison for short hex strings.
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
