// Local filesystem storage driver (dev / test).
//
// Files live under a PRIVATE directory that is never served statically.
// The only way a client gets bytes is a short-lived HMAC-signed URL
// (makePresignedPath) that the app's /internal/blob route validates and
// streams. Object keys are sanitised so a crafted key can never escape
// the storage root (directory-traversal defence).
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, stat, unlink, rm } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import config from '../config.js';
import { makePresignedPath } from '../lib/presign.js';

const ROOT = resolve(config.storage.localDir);

// Map an object key to an absolute path INSIDE ROOT, or throw.
function safePath(key) {
  const clean = String(key).replace(/\\/g, '/').replace(/\.\.(\/|$)/g, '');
  const p = resolve(join(ROOT, clean));
  if (p !== ROOT && !p.startsWith(ROOT + sep)) {
    throw new Error('storage key escapes root');
  }
  return p;
}

export const localStorage = {
  driver: 'local',

  async put(key, source, { contentType } = {}) {
    const p = safePath(key);
    await mkdir(dirname(p), { recursive: true });
    if (Buffer.isBuffer(source)) {
      await pipeline(Readable.from(source), createWriteStream(p));
    } else {
      await pipeline(source, createWriteStream(p)); // streaming; no full-file buffering
    }
    void contentType; // content type is tracked in the DB, not on disk
    return key;
  },

  async head(key) {
    try { const s = await stat(safePath(key)); return { size: s.size }; }
    catch { return null; }
  },

  // A readable stream of the object (used by ZIP streaming and the blob route).
  getStream(key) {
    return createReadStream(safePath(key));
  },

  async delete(key) {
    try { await unlink(safePath(key)); return true; }
    catch (e) { if (e.code === 'ENOENT') return false; throw e; }
  },

  // Short-lived capability URL. Regenerated per request; never stored.
  async presignDownload({ key, filename, ttlSec, inline }) {
    const path = makePresignedPath({ key, filename, ttlSec });
    return config.publicBaseUrl + path + (inline ? '&disp=inline' : '');
  },
};

function bufferToStream(buf) {
  const { Readable } = require('node:stream');
  return Readable.from(buf);
}

export async function wipeLocalStorage() { // test helper
  await rm(ROOT, { recursive: true, force: true });
}
