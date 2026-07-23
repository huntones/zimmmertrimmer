// Token handling.
//
//  Owner tokens   — the Supabase-issued JWT (HS256, signed with the
//                   project JWT secret). auth-store.js already hands
//                   these to the browser; we accept them unchanged.
//  Client session — a short-lived token we mint AFTER a public visitor
//                   passes password / email-code verification, so the
//                   secret is never resent on every request.
import { SignJWT, jwtVerify } from 'jose';
import config from '../config.js';
import { unauthorized } from '../lib/errors.js';

const enc = new TextEncoder();
const ownerKey = enc.encode(config.ownerJwtSecret);
const sessionKey = enc.encode(config.publicSessionSecret);

// Verify a Supabase owner JWT. Returns { sub, email, ... }.
export async function verifyOwnerToken(token) {
  if (!token) throw unauthorized('missing_token', 'authorization required');
  try {
    const { payload } = await jwtVerify(token, ownerKey, { algorithms: ['HS256'] });
    if (!payload.sub) throw new Error('no sub');
    return payload;
  } catch {
    throw unauthorized('invalid_token', 'invalid or expired token');
  }
}

// Mint a client session after successful verification.
export async function mintClientSession({ publicId, recipientId }) {
  return new SignJWT({ scope: 'client', pid: publicId, rid: recipientId || null })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${config.publicSessionTtlMin}m`)
    .sign(sessionKey);
}

// Verify a client session and ensure it is bound to this delivery.
export async function verifyClientSession(token, expectedPublicId) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionKey, { algorithms: ['HS256'] });
    if (payload.scope !== 'client') return null;
    if (expectedPublicId && payload.pid !== expectedPublicId) return null;
    return payload;
  } catch {
    return null;
  }
}

// Pull a Bearer token out of the Authorization header.
export function bearer(req) {
  const h = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
}
