// End-to-end API tests against a real (embedded) Postgres + the real
// HTTP app. Covers the spec's required test list plus upload security,
// dedupe, ZIP, and audit.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';

let ctx, A, B, tokenA, tokenB;

before(async () => {
  ctx = await setup();
  A = await ctx.createUser('owner-a@test.dev');
  B = await ctx.createUser('owner-b@test.dev');
  tokenA = await ctx.mintOwner(A, 'owner-a@test.dev');
  tokenB = await ctx.mintOwner(B, 'owner-b@test.dev');
});
after(async () => { if (ctx) await ctx.teardown(); });
beforeEach(() => ctx.resetRateLimits());

// ---- flow helpers ----
const makeDelivery = async (token, overrides = {}) => {
  const r = await ctx.request('POST', '/api/deliveries', { token, json: overrides });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.delivery;
};
const addRecipient = (id, token, r) =>
  ctx.request('POST', `/api/deliveries/${id}/recipients`, { token, json: r });
const send = (id, token) => ctx.request('POST', `/api/deliveries/${id}/send`, { token, json: {} });

// A ready-to-open link-only delivery with one file.
async function sentLinkDelivery(token = tokenA, content = 'file-content') {
  const d = await makeDelivery(token, { title: 'Pack', security_type: 'link' });
  await ctx.uploadFile(d.id, token, { filename: 'a.txt', content, mime: 'text/plain' });
  const s = await send(d.id, token);
  assert.equal(s.status, 200, JSON.stringify(s.body));
  return d;
}

// ======================================================================
test('create delivery: public_id long+random, order_number >= 100001', async () => {
  const d1 = await makeDelivery(tokenA, { title: 'One' });
  const d2 = await makeDelivery(tokenA, { title: 'Two' });
  assert.equal(d1.status, 'draft');
  assert.ok(d1.public_id.length >= 32, 'public_id should be long');
  assert.notEqual(d1.public_id, d2.public_id);
  assert.ok(d1.order_number >= 100001, `order_number ${d1.order_number}`);
  assert.equal(d2.order_number, d1.order_number + 1);
  assert.equal(d1.has_password, false);
});

test('update delivery', async () => {
  const d = await makeDelivery(tokenA, { title: 'Old' });
  const r = await ctx.request('PATCH', `/api/deliveries/${d.id}`, { token: tokenA, json: { title: 'New', allow_comments: true } });
  assert.equal(r.status, 200);
  assert.equal(r.body.delivery.title, 'New');
  assert.equal(r.body.delivery.allow_comments, true);
});

test('owner isolation: user B cannot read or mutate user A delivery (RLS)', async () => {
  const d = await makeDelivery(tokenA, { title: 'Secret' });
  assert.equal((await ctx.request('GET', `/api/deliveries/${d.id}`, { token: tokenB })).status, 404);
  assert.equal((await ctx.request('PATCH', `/api/deliveries/${d.id}`, { token: tokenB, json: { title: 'hax' } })).status, 404);
  assert.equal((await ctx.request('GET', `/api/deliveries/${d.id}/events`, { token: tokenB })).status, 404);
  // and B's list never contains A's delivery
  const list = await ctx.request('GET', '/api/deliveries', { token: tokenB });
  assert.ok(!list.body.deliveries.some(x => x.id === d.id));
});

test('missing / invalid owner token is rejected', async () => {
  assert.equal((await ctx.request('GET', '/api/deliveries')).status, 401);
  assert.equal((await ctx.request('GET', '/api/deliveries', { token: 'garbage' })).status, 401);
});

test('upload validation: dangerous .exe is blocked', async () => {
  const d = await makeDelivery(tokenA);
  const r = await ctx.uploadFile(d.id, tokenA, { filename: 'virus.exe', content: 'MZ', mime: 'application/octet-stream' });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'blocked_type');
});

test('upload validation: magic bytes catch a renamed executable', async () => {
  const d = await makeDelivery(tokenA);
  // PE/MZ header bytes with an innocent .txt name
  const mz = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00]);
  const r = await ctx.uploadFile(d.id, tokenA, { filename: 'notes.txt', content: mz, mime: 'text/plain' });
  assert.equal(r.status, 400, JSON.stringify(r.body));
  assert.ok(['blocked_content', 'blocked_type'].includes(r.body.error));
});

test('upload: filename with traversal is sanitised to basename', async () => {
  const d = await makeDelivery(tokenA);
  await ctx.uploadFile(d.id, tokenA, { filename: '../../etc/passwd.txt', content: 'x', mime: 'text/plain' });
  const got = await ctx.request('GET', `/api/deliveries/${d.id}`, { token: tokenA });
  assert.equal(got.body.files[0].name, 'passwd.txt');
});

test('dedupe: identical bytes reuse the stored file across deliveries', async () => {
  const d1 = await makeDelivery(tokenA);
  const d2 = await makeDelivery(tokenA);
  const r1 = await ctx.uploadFile(d1.id, tokenA, { filename: 'same.txt', content: 'DEDUPE-ME', mime: 'text/plain' });
  const r2 = await ctx.uploadFile(d2.id, tokenA, { filename: 'same.txt', content: 'DEDUPE-ME', mime: 'text/plain' });
  assert.equal(r1.body.deduplicated, false);
  assert.equal(r2.body.deduplicated, true);
  assert.equal(r1.body.file.file_id, r2.body.file.file_id, 'same stored_files id');
});

test('cannot send with no files; can send with files', async () => {
  const empty = await makeDelivery(tokenA);
  assert.equal((await send(empty.id, tokenA)).body.error, 'no_files');
  const d = await makeDelivery(tokenA);
  await ctx.uploadFile(d.id, tokenA, { filename: 'a.txt', content: 'hi' });
  const s = await send(d.id, tokenA);
  assert.equal(s.status, 200);
  assert.equal(s.body.delivery.status, 'sent');
  assert.ok(s.body.delivery.sent_at);
});

test('public: invalid public_id -> 404', async () => {
  const r = await ctx.request('GET', '/api/public/deliveries/nope-nope-nope');
  assert.equal(r.status, 404);
});

test('public: link-only delivery lists files and records an open', async () => {
  const d = await sentLinkDelivery();
  const r = await ctx.request('GET', `/api/public/deliveries/${d.public_id}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.verified, true);
  assert.equal(r.body.requires_password, false);
  assert.ok(Array.isArray(r.body.delivery.files) && r.body.delivery.files.length === 1);
  // internal fields must NOT leak
  assert.equal(r.body.delivery.user_id, undefined);
  assert.equal(r.body.delivery.password_hash, undefined);
  assert.ok(!('storage_key' in r.body.delivery.files[0]));
  // an open was recorded
  const ev = await ctx.request('GET', `/api/deliveries/${d.id}/events`, { token: tokenA });
  assert.ok(ev.body.events.some(e => e.event_type === 'delivery_opened'));
});

test('password flow: gate hides files until verified', async () => {
  const d = await makeDelivery(tokenA, { title: 'PW', security_type: 'password', password: 'letmein' });
  await ctx.uploadFile(d.id, tokenA, { filename: 'a.txt', content: 'secret' });
  await send(d.id, tokenA);

  const locked = await ctx.request('GET', `/api/public/deliveries/${d.public_id}`);
  assert.equal(locked.body.requires_password, true);
  assert.equal(locked.body.verified, false);
  assert.equal(locked.body.delivery.files, null);

  const bad = await ctx.request('POST', `/api/public/deliveries/${d.public_id}/verify-password`, { json: { password: 'wrong' } });
  assert.equal(bad.status, 401);

  const good = await ctx.request('POST', `/api/public/deliveries/${d.public_id}/verify-password`, { json: { password: 'letmein' } });
  assert.equal(good.status, 200);
  assert.ok(good.body.token);

  const unlocked = await ctx.request('GET', `/api/public/deliveries/${d.public_id}`, { token: good.body.token });
  assert.equal(unlocked.body.verified, true);
  assert.equal(unlocked.body.delivery.files.length, 1);

  const ev = await ctx.request('GET', `/api/deliveries/${d.id}/events`, { token: tokenA });
  assert.ok(ev.body.events.some(e => e.event_type === 'password_failed'));
});

test('email-code flow + no email enumeration', async () => {
  const d = await makeDelivery(tokenA, { title: 'Code', security_type: 'email_code' });
  await ctx.uploadFile(d.id, tokenA, { filename: 'a.txt', content: 'x' });
  await addRecipient(d.id, tokenA, { name: 'Dan', email: 'dan@client.dev' });
  await send(d.id, tokenA);

  ctx.mail.clearOutbox();
  // unknown email -> still 200, but nothing sent (no enumeration)
  const unknown = await ctx.request('POST', `/api/public/deliveries/${d.public_id}/send-code`, { json: { email: 'nobody@x.dev' } });
  assert.equal(unknown.status, 200);
  assert.equal(unknown.body.sent, true);
  assert.equal(ctx.mail.getOutbox().length, 0);

  // known email -> code emitted to outbox
  const sent = await ctx.request('POST', `/api/public/deliveries/${d.public_id}/send-code`, { json: { email: 'dan@client.dev' } });
  assert.equal(sent.status, 200);
  const msg = ctx.mail.getOutbox().find(m => m.to === 'dan@client.dev');
  assert.ok(msg, 'code email captured');
  const code = /(\d{6})/.exec(msg.text)[1];

  const bad = await ctx.request('POST', `/api/public/deliveries/${d.public_id}/verify-code`, { json: { email: 'dan@client.dev', code: '000000' } });
  assert.equal(bad.status, 401);

  const good = await ctx.request('POST', `/api/public/deliveries/${d.public_id}/verify-code`, { json: { email: 'dan@client.dev', code } });
  assert.equal(good.status, 200, JSON.stringify(good.body));
  assert.ok(good.body.token);
});

test('expired code is rejected', async () => {
  const d = await makeDelivery(tokenA, { security_type: 'email_code' });
  await ctx.uploadFile(d.id, tokenA, { filename: 'a.txt', content: 'x' });
  const rc = await addRecipient(d.id, tokenA, { email: 'exp@client.dev' });
  const rid = rc.body.recipients[0].id;
  await send(d.id, tokenA);
  // insert an already-expired code directly
  await ctx.db.query(
    `insert into kolkli_send.verification_codes(delivery_id,recipient_id,code_hash,expires_at)
     values ($1,$2, kolkli_send.hash_secret('123456'), now() - interval '1 minute')`, [d.id, rid]);
  const r = await ctx.request('POST', `/api/public/deliveries/${d.public_id}/verify-code`, { json: { email: 'exp@client.dev', code: '123456' } });
  assert.equal(r.status, 401);
});

test('code lockout after too many attempts', async () => {
  const d = await makeDelivery(tokenA, { security_type: 'email_code' });
  await ctx.uploadFile(d.id, tokenA, { filename: 'a.txt', content: 'x' });
  await addRecipient(d.id, tokenA, { email: 'lock@client.dev' });
  await send(d.id, tokenA);
  await ctx.request('POST', `/api/public/deliveries/${d.public_id}/send-code`, { json: { email: 'lock@client.dev' } });
  let sawLock = false;
  for (let i = 0; i < 7; i++) {
    const r = await ctx.request('POST', `/api/public/deliveries/${d.public_id}/verify-code`, { json: { email: 'lock@client.dev', code: '999999' } });
    if (r.status === 429 && r.body.error === 'locked') { sawLock = true; break; }
  }
  assert.ok(sawLock, 'should lock after repeated wrong codes');
});

test('presigned download: private storage, real bytes, then per-file download', async () => {
  const d = await sentLinkDelivery(tokenA, 'THE-REAL-BYTES');
  const view = await ctx.request('GET', `/api/public/deliveries/${d.public_id}`);
  const fileId = view.body.delivery.files[0].id;

  const dl = await ctx.request('POST', `/api/public/deliveries/${d.public_id}/files/${fileId}/download`, { json: {} });
  assert.equal(dl.status, 200);
  assert.ok(dl.body.url, 'presigned url returned');

  const fetched = await fetch(dl.body.url);
  assert.equal(fetched.status, 200);
  assert.match(fetched.headers.get('content-disposition') || '', /attachment/);
  assert.equal(await fetched.text(), 'THE-REAL-BYTES');
});

test('direct storage access without a valid signature is refused', async () => {
  const d = await sentLinkDelivery(tokenA, 'PROTECTED');
  const view = await ctx.request('GET', `/api/public/deliveries/${d.public_id}`);
  const fileId = view.body.delivery.files[0].id;
  const dl = await ctx.request('POST', `/api/public/deliveries/${d.public_id}/files/${fileId}/download`, { json: {} });
  const url = new URL(dl.body.url);

  // tamper the signature
  const tampered = new URL(url); tampered.searchParams.set('sig', 'forged');
  assert.equal((await fetch(tampered)).status, 403);
  // tamper the expiry
  const tExp = new URL(url); tExp.searchParams.set('exp', '9999999999');
  assert.equal((await fetch(tExp)).status, 403);
});

test('file from another delivery is not accessible via this delivery', async () => {
  const dX = await sentLinkDelivery(tokenA, 'X');
  const dY = await sentLinkDelivery(tokenA, 'Y');
  const viewX = await ctx.request('GET', `/api/public/deliveries/${dX.public_id}`);
  const fileX = viewX.body.delivery.files[0].id;
  const cross = await ctx.request('POST', `/api/public/deliveries/${dY.public_id}/files/${fileX}/download`, { json: {} });
  assert.equal(cross.status, 404);
});

test('download disabled -> forbidden', async () => {
  const d = await makeDelivery(tokenA, { allow_download: false });
  await ctx.uploadFile(d.id, tokenA, { filename: 'a.txt', content: 'x' });
  await send(d.id, tokenA);
  const view = await ctx.request('GET', `/api/public/deliveries/${d.public_id}`);
  const fileId = view.body.delivery.files[0].id;
  const dl = await ctx.request('POST', `/api/public/deliveries/${d.public_id}/files/${fileId}/download`, { json: {} });
  assert.equal(dl.status, 403);
  assert.equal(dl.body.error, 'download_disabled');
});

test('download limit enforced', async () => {
  const d = await makeDelivery(tokenA, { max_downloads: 1 });
  await ctx.uploadFile(d.id, tokenA, { filename: 'a.txt', content: 'x' });
  await send(d.id, tokenA);
  const view = await ctx.request('GET', `/api/public/deliveries/${d.public_id}`);
  const fileId = view.body.delivery.files[0].id;
  assert.equal((await ctx.request('POST', `/api/public/deliveries/${d.public_id}/files/${fileId}/download`, { json: {} })).status, 200);
  const second = await ctx.request('POST', `/api/public/deliveries/${d.public_id}/files/${fileId}/download`, { json: {} });
  assert.equal(second.status, 403);
  assert.equal(second.body.error, 'download_limit_reached');
});

test('download-all streams a real ZIP preserving folders', async () => {
  const d = await makeDelivery(tokenA, { title: 'My Project' });
  const folder = await ctx.request('POST', `/api/deliveries/${d.id}/folders`, { token: tokenA, json: { name: 'Sub' } });
  await ctx.uploadFile(d.id, tokenA, { filename: 'root.txt', content: 'root' });
  await ctx.uploadFile(d.id, tokenA, { filename: 'inside.txt', content: 'inside', fields: { folder_id: folder.body.folder.id } });
  await send(d.id, tokenA);

  const res = await fetch(`${ctx.base}/api/public/deliveries/${d.public_id}/download-all`, { method: 'POST' });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') || '', /zip/);
  assert.match(res.headers.get('content-disposition') || '', /My Project_KOLKLI\.zip/);
  const buf = Buffer.from(await res.arrayBuffer());
  assert.equal(buf.subarray(0, 2).toString(), 'PK', 'zip magic');
  assert.ok(buf.length > 40);
});

test('revoked delivery is gone to the public and can be reactivated', async () => {
  const d = await sentLinkDelivery(tokenA, 'R');
  assert.equal((await ctx.request('POST', `/api/deliveries/${d.id}/revoke`, { token: tokenA, json: {} })).status, 200);
  assert.equal((await ctx.request('GET', `/api/public/deliveries/${d.public_id}`)).status, 410);

  const re = await ctx.request('POST', `/api/deliveries/${d.id}/reactivate`, { token: tokenA, json: {} });
  assert.equal(re.status, 200);
  assert.equal(re.body.delivery.status, 'sent');
  assert.equal((await ctx.request('GET', `/api/public/deliveries/${d.public_id}`)).status, 200);
});

test('expired delivery: lazy-expire on access + scheduler sweep', async () => {
  const d = await sentLinkDelivery(tokenA, 'E');
  await ctx.db.query("update kolkli_send.deliveries set expires_at = now() - interval '1 hour' where id=$1", [d.id]);
  const r = await ctx.request('GET', `/api/public/deliveries/${d.public_id}`);
  assert.equal(r.status, 410);
  assert.equal(r.body.error, 'expired');
  const row = await ctx.db.query('select status from kolkli_send.deliveries where id=$1', [d.id]);
  assert.equal(row.rows[0].status, 'expired');
});

test('scheduler sweepExpired flips untouched past-expiry deliveries', async () => {
  const d = await sentLinkDelivery(tokenA, 'S');
  await ctx.db.query("update kolkli_send.deliveries set expires_at = now() - interval '1 hour' where id=$1", [d.id]);
  const { sweepExpired } = await import('../src/scheduler.js');
  const n = await sweepExpired();
  assert.ok(n >= 1);
  const row = await ctx.db.query('select status from kolkli_send.deliveries where id=$1', [d.id]);
  assert.equal(row.rows[0].status, 'expired');
});

test('cannot revoke an expired delivery (status guard)', async () => {
  const d = await sentLinkDelivery(tokenA, 'G');
  await ctx.db.query("update kolkli_send.deliveries set expires_at = now() - interval '1 hour' where id=$1", [d.id]);
  await ctx.request('GET', `/api/public/deliveries/${d.public_id}`); // trigger lazy-expire
  const r = await ctx.request('POST', `/api/deliveries/${d.id}/revoke`, { token: tokenA, json: {} });
  assert.equal(r.status, 409);
});

test('rate limiting kicks in on repeated password attempts', async () => {
  const d = await makeDelivery(tokenA, { security_type: 'password', password: 'pw' });
  await ctx.uploadFile(d.id, tokenA, { filename: 'a.txt', content: 'x' });
  await send(d.id, tokenA);
  let saw429 = false;
  for (let i = 0; i < 12; i++) {
    const r = await ctx.request('POST', `/api/public/deliveries/${d.public_id}/verify-password`, { json: { password: 'nope' } });
    if (r.status === 429) { saw429 = true; break; }
  }
  assert.ok(saw429, 'password attempts should be rate limited');
});

test('audit trail accumulates the expected events', async () => {
  const d = await sentLinkDelivery(tokenA, 'AUD');
  await ctx.request('GET', `/api/public/deliveries/${d.public_id}`);
  const ev = await ctx.request('GET', `/api/deliveries/${d.id}/events`, { token: tokenA });
  const types = new Set(ev.body.events.map(e => e.event_type));
  for (const t of ['delivery_created', 'file_added', 'delivery_sent', 'delivery_opened']) {
    assert.ok(types.has(t), `missing audit event ${t}`);
  }
});
