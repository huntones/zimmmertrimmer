// HMAC signing for local-driver presigned download URLs.
// The signature covers the object key, the download filename, and an
// absolute expiry, so a leaked URL stops working after PRESIGN_TTL_SEC
// and cannot be pointed at a different object.
import { createHmac, timingSafeEqual } from 'node:crypto';
import config from '../config.js';

function sign(parts) {
  return createHmac('sha256', config.presignSecret).update(parts.join('\n')).digest('base64url');
}

export function makePresignedPath({ key, filename, ttlSec }) {
  const exp = Math.floor(Date.now() / 1000) + (ttlSec || config.presignTtlSec);
  const name = filename || 'download';
  const sig = sign([key, name, String(exp)]);
  const q = new URLSearchParams({ key, name, exp: String(exp), sig });
  return `/internal/blob?${q.toString()}`;
}

// Returns { key, filename } when valid; throws-free -> null when not.
export function verifyPresigned(qs) {
  const key = qs.key, name = qs.name, exp = qs.exp, sig = qs.sig;
  if (!key || !exp || !sig) return null;
  if (Math.floor(Date.now() / 1000) > Number(exp)) return null;
  const expected = sign([key, name || 'download', String(exp)]);
  const a = Buffer.from(expected), b = Buffer.from(String(sig));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return { key, filename: name || 'download' };
}
