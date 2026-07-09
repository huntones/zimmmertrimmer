/* ============================================================
   KOLKLI storage Worker (Cloudflare) — Phase 2.

   The server tier that sits between the browser and Cloudflare R2.
   It never touches file BYTES: it verifies the caller's Supabase
   session, checks they belong to the organization, and hands back a
   short-lived **presigned URL** the browser uses to PUT (upload) or
   GET (download) directly against R2.

   Routes:
     GET  /health                      → { ok: true }
     POST /uploads   {orgId,name,...}  → { key, uploadUrl, expiresIn }
     GET  /download?key=org/<id>/...   → { downloadUrl, expiresIn }

   Auth: the browser sends the Supabase access token (JWT) as
   `Authorization: Bearer <token>` (get it from KolkliAuth.getToken()).
   We verify it against Supabase, and authorize by asking Supabase —
   with the caller's OWN token — whether they're a member of the org,
   so Row-Level-Security does the access control for us.

   Secrets/vars are configured in wrangler.toml + `wrangler secret put`.
   ============================================================ */
import { AwsClient } from 'aws4fetch';

export default {
  async fetch(request, env) {
    const cors = corsHeaders(env);
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    const url = new URL(request.url);
    try {
      if (url.pathname === '/health') return json({ ok: true }, cors);

      if (url.pathname.indexOf('/usage/') === 0 && request.method === 'POST') {
        return await handleUsage(request, url, env, cors);
      }

      // Everything else needs a valid Supabase session.
      const user = await verifyUser(request, env);
      if (!user) return json({ error: 'unauthorized' }, cors, 401);

      if (url.pathname === '/uploads' && request.method === 'POST') {
        return await handleUpload(await request.json().catch(() => ({})), user, env, cors);
      }
      if (url.pathname === '/download' && request.method === 'GET') {
        return await handleDownload(url, user, env, cors);
      }
      return json({ error: 'not found' }, cors, 404);
    } catch (e) {
      return json({ error: String((e && e.message) || e) }, cors, 500);
    }
  }
};

/* ---------- helpers ---------- */
function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Max-Age': '86400'
  };
}
function json(obj, cors, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json', ...cors }
  });
}

// Verify the JWT by asking Supabase who it belongs to. Works for both
// HS256 and asymmetric-key projects and needs no JWT secret.
async function verifyUser(request, env) {
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { authorization: `Bearer ${token}`, apikey: env.SUPABASE_ANON_KEY }
  });
  if (!r.ok) return null;
  const u = await r.json();
  return u && u.id ? { id: u.id, email: u.email, token } : null;
}

async function userPlan(user, env) {
  if (!user) return 'anonymous';
  try {
    const q = `${env.SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=plan,trial_ends_at`;
    const r = await fetch(q, {
      headers: { authorization: `Bearer ${user.token}`, apikey: env.SUPABASE_ANON_KEY }
    });
    if (!r.ok) return 'free';
    const rows = await r.json().catch(() => []);
    const row = (rows && rows[0]) || {};
    let plan = String(row.plan || 'free').toLowerCase();
    if (plan === 'lite') plan = 'creator';
    else if (plan === 'pro' || plan === 'business') plan = 'studio';
    // A finished Creator trial reverts to Free until the column is reset (paid
    // conversions must null out trial_ends_at — see supabase-schema.sql).
    if (plan === 'creator' && row.trial_ends_at && Date.parse(row.trial_ends_at) < Date.now()) plan = 'free';
    return /^(free|creator|studio)$/.test(plan) ? plan : 'free';
  } catch (_) {
    return 'free';
  }
}

// Is the caller a member of orgId? Query Supabase with THEIR token so RLS
// enforces it — a non-member simply gets an empty array back.
async function userInOrg(orgId, user, env) {
  const q = `${env.SUPABASE_URL}/rest/v1/org_members` +
    `?org_id=eq.${encodeURIComponent(orgId)}&user_id=eq.${encodeURIComponent(user.id)}&select=role`;
  const r = await fetch(q, {
    headers: { authorization: `Bearer ${user.token}`, apikey: env.SUPABASE_ANON_KEY }
  });
  if (!r.ok) return false;
  const rows = await r.json().catch(() => []);
  return Array.isArray(rows) && rows.length > 0;
}

function r2Client(env) {
  return new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    service: 's3',
    region: 'auto'
  });
}
function r2ObjectUrl(env, key) {
  const path = key.split('/').map(encodeURIComponent).join('/');
  return `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET}/${path}`;
}
async function presign(env, key, method, expires) {
  const signed = await r2Client(env).sign(
    new Request(`${r2ObjectUrl(env, key)}?X-Amz-Expires=${expires}`, { method }),
    { aws: { signQuery: true } }
  );
  return signed.url;
}

/* ---------- routes ---------- */
async function handleUpload(body, user, env, cors) {
  const orgId = String(body.orgId || '');
  const name = String(body.name || 'file');
  if (!orgId) return json({ error: 'orgId required' }, cors, 400);
  if (!(await userInOrg(orgId, user, env))) return json({ error: 'forbidden' }, cors, 403);

  const safe = name.replace(/[^\w.\-]+/g, '_').slice(-120) || 'file';
  const key = `org/${orgId}/${crypto.randomUUID()}-${safe}`;
  const expires = 900; // 15 min
  const uploadUrl = await presign(env, key, 'PUT', expires);
  return json({ key, uploadUrl, expiresIn: expires }, cors);
}

async function handleDownload(url, user, env, cors) {
  const key = url.searchParams.get('key') || '';
  const m = key.match(/^org\/([^/]+)\//);
  if (!m) return json({ error: 'bad key' }, cors, 400);
  if (!(await userInOrg(m[1], user, env))) return json({ error: 'forbidden' }, cors, 403);

  const expires = 900;
  const downloadUrl = await presign(env, key, 'GET', expires);
  return json({ downloadUrl, expiresIn: expires }, cors);
}

/* ---------- free/anonymous usage limits ---------- */
const GB = 1024 * 1024 * 1024;
const TOOL_LIMITS = {
  'send-files': { daily: 2, maxBytes: 3 * GB },
  'organize-files': { daily: 2, maxFiles: 5, maxFolders: 3 },
  'review-files': { daily: 2, maxFiles: 1 },
  'request-files': { daily: 2, maxFiles: 5 }
};

function limitForTool(tool) {
  tool = String(tool || '').toLowerCase();
  if (TOOL_LIMITS[tool]) return { tool, ...TOOL_LIMITS[tool] };
  if (tool.indexOf('edit:') === 0) return { tool, daily: 3 };
  if (tool.indexOf('ai:') === 0) return { tool, daily: 3 };
  if (tool.indexOf('design:') === 0) return { tool, daily: 50 };
  if (tool.indexOf('text:') === 0) return { tool, daily: 50 };
  return null;
}

function ipFromRequest(request) {
  return request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for') ||
    request.headers.get('x-real-ip') ||
    '';
}

function responseWithCors(response, cors) {
  const headers = new Headers(response.headers);
  Object.keys(cors).forEach(k => headers.set(k, cors[k]));
  return new Response(response.body, { status: response.status, headers });
}

async function handleUsage(request, url, env, cors) {
  if (!env.USAGE_LIMITER) return json({ ok: false, error: 'usage limiter not configured' }, cors, 503);

  const body = await request.json().catch(() => ({}));
  const user = await verifyUser(request, env);
  const plan = await userPlan(user, env);
  const action = url.pathname.replace(/^\/usage\//, '');
  const id = env.USAGE_LIMITER.idFromName('kolkli-usage-v1');
  const stub = env.USAGE_LIMITER.get(id);
  const res = await stub.fetch('https://usage.internal/' + action, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      action,
      tool: body.tool,
      ticket: body.ticket,
      payload: body.payload || {},
      anonymousId: body.anonymousId || '',
      fingerprint: body.fingerprint || '',
      userId: user && user.id,
      plan,
      ip: ipFromRequest(request)
    })
  });
  return responseWithCors(res, cors);
}

export class UsageLimiter {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const action = url.pathname.replace(/^\//, '');
    const body = await request.json().catch(() => ({}));

    try {
      if (action === 'authorize') return this.authorize(body);
      if (action === 'commit') return this.commit(body);
      if (action === 'cancel') return this.cancel(body);
      if (action === 'status') return this.status(body);
      if (action === 'trial-claim') return this.trialClaim(body);
      return this.out({ ok: false, error: 'not found' }, 404);
    } catch (e) {
      return this.out({ ok: false, error: String((e && e.message) || e) }, 500);
    }
  }

  out(obj, status = 200) {
    return new Response(JSON.stringify(obj), {
      status,
      headers: { 'content-type': 'application/json' }
    });
  }

  async authorize(body) {
    const limit = limitForTool(body.tool);
    if (!limit) return this.out({ ok: false, code: 'unknown_tool' }, 400);

    const payloadError = validatePayload(limit, body.payload || {});
    if (payloadError) return this.out({ ok: false, code: 'payload_limit', ...payloadError }, 413);

    if (isPaidPlan(body.plan)) {
      return this.out({ ok: true, exempt: true, remaining: null });
    }

    const day = israelDay();
    const dims = await dimensions(body);
    const ipHash = body.ip ? await sha256Hex('ip:' + body.ip) : '';
    if (!dims.length && ipHash) dims.push({ kind: 'ip', value: ipHash });
    if (!dims.length) return this.out({ ok: false, code: 'missing_identity' }, 400);

    const rate = await this.bumpIpRate(day, limit, ipHash);
    if (!rate.ok) return this.out(rate, 429);

    const quota = await this.readQuota(day, limit, dims, ipHash);
    if (!quota.ok) return this.out(quota, 429);

    const ticket = crypto.randomUUID();
    await this.state.storage.put('ticket:' + ticket, {
      tool: limit.tool,
      day,
      dims,
      ipHash,
      daily: limit.daily,
      createdAt: Date.now(),
      committed: false
    });

    return this.out({ ok: true, ticket, remaining: quota.remaining });
  }

  async commit(body) {
    const ticketId = String(body.ticket || '');
    if (!ticketId) return this.out({ ok: false, code: 'ticket_required' }, 400);

    const result = await this.state.storage.transaction(async txn => {
      const key = 'ticket:' + ticketId;
      const ticket = await txn.get(key);
      if (!ticket) return { ok: false, code: 'ticket_missing', status: 404 };
      if (ticket.committed) return { ok: true, committed: true, remaining: ticket.remaining };

      const limit = limitForTool(ticket.tool);
      if (!limit) return { ok: false, code: 'unknown_tool', status: 400 };

      const quota = await this.readQuota(ticket.day, limit, ticket.dims, ticket.ipHash, txn);
      if (!quota.ok) return { ...quota, status: 429 };

      for (const dim of ticket.dims) {
        const k = countKey(ticket.day, ticket.tool, dim);
        const n = +(await txn.get(k) || 0);
        await txn.put(k, n + 1);
      }
      if (ticket.ipHash) {
        const ik = ipDailyKey(ticket.day, ticket.tool, ticket.ipHash);
        const n = +(await txn.get(ik) || 0);
        await txn.put(ik, n + 1);
      }

      ticket.committed = true;
      ticket.remaining = Math.max(0, quota.remaining - 1);
      await txn.put(key, ticket);
      return { ok: true, committed: true, remaining: ticket.remaining };
    });

    return this.out(result, result.status || 200);
  }

  async cancel(body) {
    const ticketId = String(body.ticket || '');
    if (ticketId) await this.state.storage.delete('ticket:' + ticketId);
    return this.out({ ok: true });
  }

  async status(body) {
    const limit = limitForTool(body.tool);
    if (!limit) return this.out({ ok: false, code: 'unknown_tool' }, 400);
    if (isPaidPlan(body.plan)) return this.out({ ok: true, exempt: true, remaining: null });
    const day = israelDay();
    const dims = await dimensions(body);
    const ipHash = body.ip ? await sha256Hex('ip:' + body.ip) : '';
    const quota = await this.readQuota(day, limit, dims, ipHash);
    return this.out(quota.ok ? { ok: true, ...quota } : quota, quota.ok ? 200 : 429);
  }

  // One-shot 7-day-trial claim. The trial is stamped against every identity
  // dimension (user id, anonymous browser id, device fingerprint) plus the IP,
  // so clearing the session, deleting the account, or registering a fresh email
  // from the same browser/device can't farm a second trial.
  async trialClaim(body) {
    if (isPaidPlan(body.plan)) return this.out({ ok: true, granted: false, reason: 'already_paid' });
    const dims = await dimensions(body);
    const ipHash = body.ip ? await sha256Hex('ip:' + body.ip) : '';
    const keys = dims.map(d => 'trial:' + d.kind + ':' + d.value);
    if (ipHash) keys.push('trial:ip:' + ipHash);
    if (!keys.length) return this.out({ ok: false, code: 'missing_identity' }, 400);

    const result = await this.state.storage.transaction(async txn => {
      for (const k of keys) {
        if (await txn.get(k)) return { granted: false, reason: 'already_claimed' };
      }
      const rec = { claimedAt: Date.now(), day: israelDay() };
      for (const k of keys) await txn.put(k, rec);
      return { granted: true, endsAt: Date.now() + 7 * 24 * 60 * 60 * 1000 };
    });
    return this.out({ ok: true, ...result });
  }

  async bumpIpRate(day, limit, ipHash) {
    if (!ipHash) return { ok: true };
    const burstMax = +(this.env.USAGE_IP_BURST || 40);
    const dailyMax = +(this.env.USAGE_IP_DAILY || Math.max(limit.daily * 8, 30));
    const bucket = Math.floor(Date.now() / (10 * 60 * 1000));
    return this.state.storage.transaction(async txn => {
      const bk = `ipburst:${bucket}:${ipHash}`;
      const bn = +(await txn.get(bk) || 0);
      if (bn >= burstMax) return { ok: false, code: 'ip_rate_limited', retryAfterSec: 600 };
      await txn.put(bk, bn + 1);

      const dk = `ipauth:${day}:${ipHash}`;
      const dn = +(await txn.get(dk) || 0);
      if (dn >= dailyMax) return { ok: false, code: 'ip_daily_limited' };
      await txn.put(dk, dn + 1);
      return { ok: true };
    });
  }

  async readQuota(day, limit, dims, ipHash, txn) {
    const store = txn || this.state.storage;
    let highest = 0;
    for (const dim of dims) {
      highest = Math.max(highest, +(await store.get(countKey(day, limit.tool, dim)) || 0));
    }
    if (highest >= limit.daily) {
      return { ok: false, code: 'quota_exceeded', limit: limit.daily, used: highest, remaining: 0 };
    }

    if (ipHash) {
      const ipUsed = +(await store.get(ipDailyKey(day, limit.tool, ipHash)) || 0);
      const ipDaily = +(this.env.USAGE_IP_DAILY_COMMIT || Math.max(limit.daily * 6, 20));
      if (ipUsed >= ipDaily) {
        return { ok: false, code: 'ip_quota_exceeded', limit: ipDaily, used: ipUsed, remaining: 0 };
      }
    }

    return { ok: true, limit: limit.daily, used: highest, remaining: Math.max(0, limit.daily - highest) };
  }
}

function isPaidPlan(plan) {
  plan = String(plan || '').toLowerCase();
  // Current tiers plus legacy slugs (lite/pro/business) for back-compat.
  return plan === 'creator' || plan === 'studio' ||
    plan === 'lite' || plan === 'pro' || plan === 'business';
}

function validatePayload(limit, payload) {
  const files = Number(payload.files || payload.fileCount || 0);
  const folders = Number(payload.folders || payload.folderCount || 0);
  const bytes = Number(payload.bytes || payload.totalBytes || 0);
  if (limit.maxFiles != null && files > limit.maxFiles) return { field: 'files', max: limit.maxFiles, actual: files };
  if (limit.maxFolders != null && folders > limit.maxFolders) return { field: 'folders', max: limit.maxFolders, actual: folders };
  if (limit.maxBytes != null && bytes > limit.maxBytes) return { field: 'bytes', max: limit.maxBytes, actual: bytes };
  return null;
}

async function dimensions(body) {
  const out = [];
  if (body.userId) out.push({ kind: 'user', value: await sha256Hex('user:' + body.userId) });
  if (body.anonymousId) out.push({ kind: 'anon', value: await sha256Hex('anon:' + body.anonymousId) });
  if (body.fingerprint) out.push({ kind: 'fp', value: await sha256Hex('fp:' + body.fingerprint) });
  return out;
}

function countKey(day, tool, dim) {
  return `count:${day}:${tool}:${dim.kind}:${dim.value}`;
}

function ipDailyKey(day, tool, ipHash) {
  return `ipday:${day}:${tool}:${ipHash}`;
}

function israelDay(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date).reduce((a, p) => {
    if (p.type !== 'literal') a[p.type] = p.value;
    return a;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

async function sha256Hex(value) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value || '')));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
