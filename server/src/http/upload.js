// Streaming multipart upload -> storage. Computes sha256 and byte count
// on the fly (never buffering the whole file), captures the head bytes
// for magic-byte validation, and enforces the size cap mid-stream.
import Busboy from 'busboy';
import { createHash } from 'node:crypto';
import { PassThrough } from 'node:stream';
import config from '../config.js';
import { storageKey } from '../lib/ids.js';
import { validateUpload } from '../lib/validate.js';
import { badRequest } from '../lib/errors.js';

const HEAD_BYTES = 4100; // enough for file-type magic sniffing

// Resolves { key, safeName, mime, size, sha256 } after a validated,
// fully-stored upload. Rejects (and cleans up) on any failure.
export function receiveUpload(req, storage, owner) {
  return new Promise((resolve, reject) => {
    let bb;
    try { bb = Busboy({ headers: req.headers, limits: { files: 1, fileSize: config.maxFileBytes + 1 } }); }
    catch { return reject(badRequest('bad_multipart', 'invalid multipart request')); }

    const key = storageKey(owner);
    let handled = false, gotFile = false;
    const fields = {};

    const finish = (fn) => { if (!handled) { handled = true; fn(); } };

    bb.on('field', (name, val) => { fields[name] = val; });

    bb.on('file', (_name, stream, info) => {
      gotFile = true;
      const hash = createHash('sha256');
      const head = [];
      let headLen = 0, size = 0, tooBig = false;

      const tap = new PassThrough();
      stream.on('data', (chunk) => {
        size += chunk.length;
        hash.update(chunk);
        if (headLen < HEAD_BYTES) {
          const take = chunk.subarray(0, HEAD_BYTES - headLen);
          head.push(take); headLen += take.length;
        }
      });
      stream.on('limit', () => { tooBig = true; });
      stream.pipe(tap);

      // Stream straight to storage; validate once fully written.
      storage.put(key, tap, { contentType: info.mimeType })
        .then(async () => {
          if (tooBig) {
            await storage.delete(key).catch(() => {});
            return finish(() => reject(badRequest('file_too_large', `max ${config.maxFileBytes} bytes`)));
          }
          const headBuffer = Buffer.concat(head, headLen);
          const v = await validateUpload({
            filename: info.filename, declaredMime: info.mimeType, size, headBuffer,
          });
          if (!v.ok) {
            await storage.delete(key).catch(() => {});
            return finish(() => reject(badRequest(v.code, v.reason)));
          }
          finish(() => resolve({
            key, safeName: v.safeName, mime: v.mime, size,
            sha256: hash.digest('hex'), fields,
          }));
        })
        .catch(async (e) => {
          await storage.delete(key).catch(() => {});
          finish(() => reject(e));
        });
    });

    bb.on('error', (e) => { storage.delete(key).catch(() => {}); finish(() => reject(e)); });
    bb.on('close', () => { if (!gotFile) finish(() => reject(badRequest('no_file', 'no file part in upload'))); });

    req.pipe(bb);
  });
}
