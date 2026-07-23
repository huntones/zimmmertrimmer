// Test harness. Boots a fresh embedded Postgres, applies the migrations,
// points config at it and a temp storage dir, then starts the real HTTP
// app on an ephemeral port so tests exercise the full stack over fetch.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { SignJWT } from 'jose';

const { Client } = pg;

export async function setup() {
  const workDir = mkdtempSync(join(tmpdir(), 'kolkli-send-test-'));
  const pgDir = join(workDir, 'pg');
  const storeDir = join(workDir, 'storage');

  // 1) boot a dedicated embedded Postgres
  const { startEmbedded } = await import('../src/db/embedded.js');
  const pgHandle = await startEmbedded({ dir: pgDir, fresh: true });

  // 2) apply migrations on a direct connection
  const admin = new Client({ connectionString: pgHandle.connectionString });
  await admin.connect();
  const { applyMigrations } = await import('../src/db/apply.js');
  await applyMigrations(admin, { includeShim: true });
  await admin.end();

  // 3) configure the app (BEFORE importing modules that read config)
  process.env.DATABASE_URL = pgHandle.connectionString;
  process.env.STORAGE_DRIVER = 'local';
  process.env.STORAGE_LOCAL_DIR = storeDir;
  process.env.MAIL_DRIVER = 'console';
  process.env.SUPABASE_JWT_SECRET = 'test-owner-secret-xxxxxxxxxxxxxxxxxxxxxxxxxxxx';
  process.env.PUBLIC_SESSION_SECRET = 'test-public-secret';
  process.env.PRESIGN_SECRET = 'test-presign-secret';
  process.env.PUBLIC_SESSION_TTL_MIN = '60';
  process.env.EXPIRY_SWEEP_SEC = '0';
  process.env.MAX_FILE_BYTES = String(50 * 1024 * 1024);
  process.env.PORT = '0';

  const { default: config } = await import('../src/config.js');
  const { createApp } = await import('../src/app.js');
  const dbmod = await import('../src/db/index.js');
  const mail = await import('../src/mail/index.js');
  const rl = await import('../src/lib/ratelimit.js');
  const sched = await import('../src/scheduler.js');

  const app = createApp();
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  config.publicBaseUrl = base; // local presigned URLs must target this server

  async function createUser(email) {
    const { rows } = await dbmod.query('insert into auth.users(email) values ($1) returning id', [email]);
    return rows[0].id;
  }
  async function mintOwner(userId, email) {
    const secret = new TextEncoder().encode(config.ownerJwtSecret);
    return new SignJWT({ email: email || null })
      .setProtectedHeader({ alg: 'HS256' }).setSubject(userId)
      .setIssuedAt().setExpirationTime('1h').sign(secret);
  }

  // fetch wrapper: request(method, path, { token, json, headers })
  async function request(method, path, opts = {}) {
    const headers = { ...(opts.headers || {}) };
    if (opts.token) headers.authorization = `Bearer ${opts.token}`;
    let body;
    if (opts.json !== undefined) { headers['content-type'] = 'application/json'; body = JSON.stringify(opts.json); }
    if (opts.body !== undefined) body = opts.body; // FormData / raw
    const res = await fetch(base + path, { method, headers, body });
    const text = await res.text();
    let parsed; try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
    return { status: res.status, body: parsed, headers: res.headers, raw: text };
  }

  // multipart upload helper (uses global FormData/Blob)
  async function uploadFile(deliveryId, token, { filename, content, mime, fields } = {}) {
    const fd = new FormData();
    const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content ?? 'hello');
    fd.set('file', new Blob([bytes], { type: mime || 'application/octet-stream' }), filename || 'file.txt');
    for (const [k, v] of Object.entries(fields || {})) fd.set(k, v);
    return request('POST', `/api/deliveries/${deliveryId}/files`, { token, body: fd });
  }

  async function teardown() {
    await new Promise((r) => server.close(r));
    sched.stopScheduler?.();
    await dbmod.closePool();
    await pgHandle.stop();
    try { rmSync(workDir, { recursive: true, force: true }); } catch { /* windows lock; ignore */ }
  }

  return {
    base, app, config, db: dbmod, mail, resetRateLimits: rl.resetRateLimits,
    request, uploadFile, createUser, mintOwner, teardown,
  };
}
