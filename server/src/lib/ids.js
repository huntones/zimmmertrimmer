// Random-value helpers. All secrets use the CSPRNG.
import { randomBytes, randomInt } from 'node:crypto';

// A URL-safe opaque token (default 24 bytes = 192 bits).
export function randToken(bytes = 24) {
  return randomBytes(bytes).toString('base64url');
}

// A 6-digit numeric verification code, uniformly distributed (no modulo bias).
export function sixDigitCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

// A storage object key for a stored file: kolkli-send/<owner>/<rand>.
// Never derived from user input, so it can't leak or collide predictably.
export function storageKey(owner) {
  return `kolkli-send/${owner}/${randToken(18)}`;
}
