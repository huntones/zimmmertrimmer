// Cloudflare R2 storage driver (production).
//
// R2 is S3-compatible. The bucket is PRIVATE; clients never get a stable
// object URL. Downloads are served by a freshly presigned GET (signed
// with aws4fetch, the same lib worker/src/index.js already uses) that
// expires after a few minutes. Uploads/reads use the S3 REST API.
import { AwsClient } from 'aws4fetch';
import { Readable } from 'node:stream';
import config from '../config.js';

const r2 = config.storage.r2;
const endpoint = () => `https://${r2.accountId}.r2.cloudflarestorage.com/${r2.bucket}`;

let client = null;
function aws() {
  if (!client) client = new AwsClient({ accessKeyId: r2.accessKeyId, secretAccessKey: r2.secretAccessKey, region: 'auto', service: 's3' });
  return client;
}
const objUrl = (key) => `${endpoint()}/${key.split('/').map(encodeURIComponent).join('/')}`;

export const r2Storage = {
  driver: 'r2',

  async put(key, source, { contentType } = {}) {
    const body = Buffer.isBuffer(source) ? source : await streamToBuffer(source);
    const res = await aws().fetch(objUrl(key), {
      method: 'PUT', body,
      headers: { 'content-type': contentType || 'application/octet-stream' },
    });
    if (!res.ok) throw new Error(`r2 put failed: ${res.status}`);
    return key;
  },

  async head(key) {
    const res = await aws().fetch(objUrl(key), { method: 'HEAD' });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`r2 head failed: ${res.status}`);
    return { size: Number(res.headers.get('content-length') || 0) };
  },

  getStream(key) {
    // Returns a Node Readable of the object body.
    return (async () => {
      const res = await aws().fetch(objUrl(key), { method: 'GET' });
      if (!res.ok) throw new Error(`r2 get failed: ${res.status}`);
      return Readable.fromWeb(res.body);
    })();
  },

  async delete(key) {
    const res = await aws().fetch(objUrl(key), { method: 'DELETE' });
    return res.ok || res.status === 404;
  },

  // Presigned GET, valid for ttlSec. Never persisted; minted per request.
  async presignDownload({ key, filename, ttlSec, inline }) {
    const url = new URL(objUrl(key));
    url.searchParams.set('X-Amz-Expires', String(ttlSec || config.presignTtlSec));
    if (filename) {
      const disp = inline ? 'inline' : 'attachment';
      url.searchParams.set('response-content-disposition',
        `${disp}; filename="${filename.replace(/"/g, '')}"`);
    }
    const signed = await aws().sign(url.toString(), { method: 'GET', aws: { signQuery: true } });
    return signed.url;
  },
};

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const c of stream) chunks.push(c);
  return Buffer.concat(chunks);
}
