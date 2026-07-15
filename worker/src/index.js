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

      // Guest email verification (no Supabase session — it's the guest gate).
      if (url.pathname.indexOf('/verify/') === 0 && request.method === 'POST') {
        return await handleVerify(request, url, env, cors);
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

  // Guest upload gate: signed-out callers must present a valid email-verify
  // token for the tools that ingest files (the server-side teeth behind
  // verify.js). The whole gate is armed by ONE switch — VERIFY_SECRET being set
  // — so pointing the site at the Worker before finishing email setup can't
  // brick guest uploads. Signed-in/paid users skip it; VERIFY_SCOPE=off disables.
  if (action === 'authorize' && env.VERIFY_SECRET && !user && !isPaidPlan(plan) && verifyRequiredTool(body.tool, env)) {
    const vt = await verifyVerifyToken(env, body.verifyToken);
    if (!vt) return json({ ok: false, code: 'verify_required' }, cors, 403);
  }

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

/* ---------- guest email verification ---------- */
// Which tools require a verified guest email. Mirrors verify.js's default
// "uploads" scope; override with the VERIFY_SCOPE var (transfers|uploads|all|off).
function verifyRequiredTool(tool, env) {
  const scope = String((env && env.VERIFY_SCOPE) || 'uploads').toLowerCase();
  if (scope === 'off') return false;
  tool = String(tool || '').toLowerCase();
  const TRANSFERS = { 'send-files': 1, 'organize-files': 1, 'review-files': 1, 'request-files': 1 };
  if (TRANSFERS[tool]) return true;
  if (scope === 'transfers') return false;
  const isUpload = tool.indexOf('edit:') === 0 || tool.indexOf('ai:') === 0;
  if (scope === 'all') return isUpload || tool.indexOf('text:') === 0 || tool.indexOf('design:') === 0;
  return isUpload;
}

async function handleVerify(request, url, env, cors) {
  if (!env.USAGE_LIMITER) return json({ ok: false, code: 'server_unavailable' }, cors, 503);
  const action = url.pathname.replace(/^\/verify\//, '');
  const body = await request.json().catch(() => ({}));
  const ip = ipFromRequest(request);
  const id = env.USAGE_LIMITER.idFromName('kolkli-usage-v1');
  const stub = env.USAGE_LIMITER.get(id);

  if (action === 'send') {
    const res = await stub.fetch('https://usage.internal/verify-send', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: body.email, ip, fingerprint: body.fingerprint, anonymousId: body.anonymousId })
    });
    const data = await res.json().catch(() => ({}));
    if (!data.ok) return json({ ok: false, code: data.code || 'server_unavailable', retryAfterSec: data.retryAfterSec }, cors, res.status);
    // data.otp is server-internal — send it by email, never back to the browser.
    const sent = await sendEmail(env, data.email, data.otp, body.lang);
    if (!sent.ok) return json({ ok: false, code: sent.code || 'email_failed' }, cors, 502);
    return json({ ok: true, sent: true, ttl: data.ttl, cooldown: data.cooldown }, cors);
  }

  if (action === 'check') {
    const res = await stub.fetch('https://usage.internal/verify-check', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: body.email, code: body.code, ip })
    });
    const data = await res.json().catch(() => ({}));
    if (!data.ok || !data.verified) {
      return json({ ok: false, code: data.code || 'bad_code', attemptsLeft: data.attemptsLeft }, cors, res.status);
    }
    const minted = await mintVerifyToken(env, data.email);
    if (!minted) return json({ ok: false, code: 'server_unavailable' }, cors, 500);
    return json({ ok: true, verified: true, email: data.email, token: minted.token, expiresAt: minted.expiresAt }, cors);
  }

  return json({ ok: false, code: 'not_found' }, cors, 404);
}

/* ---------- signed verify token (HMAC-SHA256, no DB read on the hot path) ---------- */
function b64urlFromBytes(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlFromStr(str) { return b64urlFromBytes(new TextEncoder().encode(str)); }
function b64urlToStr(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
async function hmacB64url(secret, msg) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  return b64urlFromBytes(new Uint8Array(sig));
}
function timingEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
async function mintVerifyToken(env, email) {
  const secret = env.VERIFY_SECRET || '';
  if (!secret) return null;
  const exp = Date.now() + Math.max(1, +(env.VERIFY_TOKEN_DAYS || 30)) * 24 * 60 * 60 * 1000;
  const payload = b64urlFromStr(JSON.stringify({ e: normalizeEmail(email), exp, v: 1 }));
  const sig = await hmacB64url(secret, payload);
  return { token: payload + '.' + sig, expiresAt: exp };
}
async function verifyVerifyToken(env, token) {
  const secret = env.VERIFY_SECRET || '';
  if (!secret || !token || typeof token !== 'string') return null;
  const dot = token.indexOf('.');
  if (dot < 1) return null;
  const payload = token.slice(0, dot), sig = token.slice(dot + 1);
  const expect = await hmacB64url(secret, payload);
  if (!timingEqual(sig, expect)) return null;
  let obj;
  try { obj = JSON.parse(b64urlToStr(payload)); } catch (_) { return null; }
  if (!obj || !obj.e || (obj.exp || 0) < Date.now()) return null;
  return obj;
}

/* ---------- transactional email (provider-agnostic) ---------- */
function verifyEmailContent(code, lang, env) {
  const brand = env.EMAIL_BRAND || 'KOLKLI';
  const mins = Math.round(Math.max(60, +(env.VERIFY_CODE_TTL_SEC || 600)) / 60);
  const L = {
    he: { subject: code + ' — ' + brand + ' קוד אימות', lead: 'קוד האימות שלכם ל־' + brand + ':', note: 'הקוד תקף ל־' + mins + ' דקות. אם לא ביקשתם אותו, אפשר להתעלם מהודעה זו.' },
    ru: { subject: code + ' — код подтверждения ' + brand, lead: 'Ваш код подтверждения ' + brand + ':', note: 'Код действителен ' + mins + ' минут. Если вы его не запрашивали, проигнорируйте это письмо.' },
    en: { subject: code + ' is your ' + brand + ' verification code', lead: 'Your ' + brand + ' verification code is:', note: 'This code expires in ' + mins + ' minutes. If you didn’t request it, you can ignore this email.' }
  };
  const m = L[(lang === 'he' || lang === 'ru') ? lang : 'en'];
  const dir = lang === 'he' ? 'rtl' : 'ltr';
  const text = m.lead + ' ' + code + '\n\n' + m.note;
  const html =
    '<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:440px;margin:0 auto;padding:24px;color:#1c2030" dir="' + dir + '">' +
    '<p style="font-size:15px;margin:0 0 14px">' + m.lead + '</p>' +
    '<div style="font-size:34px;font-weight:800;letter-spacing:.28em;text-align:center;padding:16px;border-radius:12px;background:#f2effc;color:#5b28c9">' + code + '</div>' +
    '<p style="font-size:12.5px;color:#727a8a;margin:16px 0 0;line-height:1.6">' + m.note + '</p>' +
    '<p style="font-size:12px;color:#a0a6b4;margin:18px 0 0">' + brand + '</p></div>';
  return { subject: m.subject, text, html };
}

// Sends the code. Returns { ok:true } or { ok:false, code, detail }. Provider
// is chosen by EMAIL_PROVIDER (default resend); credentials come from secrets.
async function sendEmail(env, to, code, lang) {
  const from = env.EMAIL_FROM || '';
  const apiKey = env.EMAIL_API_KEY || '';
  const provider = String(env.EMAIL_PROVIDER || 'resend').toLowerCase();
  if (!from || (!apiKey && provider !== 'mailchannels')) return { ok: false, code: 'email_unavailable' };
  const { subject, text, html } = verifyEmailContent(code, lang, env);

  let req;
  if (provider === 'resend') {
    req = ['https://api.resend.com/emails', {
      method: 'POST', headers: { authorization: 'Bearer ' + apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to, subject, html, text })
    }];
  } else if (provider === 'sendgrid') {
    req = ['https://api.sendgrid.com/v3/mail/send', {
      method: 'POST', headers: { authorization: 'Bearer ' + apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: parseFrom(from), subject,
        content: [{ type: 'text/plain', value: text }, { type: 'text/html', value: html }]
      })
    }];
  } else if (provider === 'postmark') {
    req = ['https://api.postmarkapp.com/email', {
      method: 'POST', headers: { 'X-Postmark-Server-Token': apiKey, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ From: from, To: to, Subject: subject, HtmlBody: html, TextBody: text, MessageStream: env.POSTMARK_STREAM || 'outbound' })
    }];
  } else if (provider === 'smtp2go') {
    req = ['https://api.smtp2go.com/v3/email/send', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ api_key: apiKey, sender: from, to: [to], subject, text_body: text, html_body: html })
    }];
  } else if (provider === 'mailchannels') {
    const f = parseFrom(from);
    const payload = { personalizations: [{ to: [{ email: to }] }], from: f, subject, content: [{ type: 'text/plain', value: text }, { type: 'text/html', value: html }] };
    if (env.MAILCHANNELS_DKIM_DOMAIN && env.MAILCHANNELS_DKIM_SELECTOR && env.MAILCHANNELS_DKIM_KEY) {
      payload.personalizations[0].dkim_domain = env.MAILCHANNELS_DKIM_DOMAIN;
      payload.personalizations[0].dkim_selector = env.MAILCHANNELS_DKIM_SELECTOR;
      payload.personalizations[0].dkim_private_key = env.MAILCHANNELS_DKIM_KEY;
    }
    const headers = { 'content-type': 'application/json' };
    if (apiKey) headers['X-Api-Key'] = apiKey;
    req = ['https://api.mailchannels.net/tx/v1/send', { method: 'POST', headers, body: JSON.stringify(payload) }];
  } else {
    return { ok: false, code: 'email_unavailable', detail: 'unknown provider ' + provider };
  }

  try {
    const r = await fetch(req[0], req[1]);
    if (r.ok || r.status === 202) return { ok: true };
    const detail = (await r.text().catch(() => '')).slice(0, 300);
    return { ok: false, code: 'email_failed', status: r.status, detail };
  } catch (e) {
    return { ok: false, code: 'email_failed', detail: String((e && e.message) || e) };
  }
}

// "Name <addr@x>" or "addr@x" → { email, name } for the JSON-object providers.
function parseFrom(from) {
  const m = String(from || '').match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  return m ? { email: m[2].trim(), name: m[1].trim() || undefined } : { email: String(from || '').trim() };
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
      if (action === 'verify-send') return this.verifySend(body);
      if (action === 'verify-check') return this.verifyCheck(body);
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

  // Issue a 6-digit code for an email, stored (hashed key) with a TTL and a
  // resend cooldown; the plaintext code only travels back to the trusted
  // Worker, which emails it. Rate-limited per IP against send-farming.
  async verifySend(body) {
    const email = normalizeEmail(body.email);
    if (!validEmailAddr(email)) return this.out({ ok: false, code: 'bad_email' }, 400);
    if (isDisposableDomain(email)) return this.out({ ok: false, code: 'disposable' }, 403);

    const ipHash = body.ip ? await sha256Hex('vip:' + body.ip) : '';
    if (ipHash) {
      const rl = await this.bumpVerifyRate(ipHash);
      if (!rl.ok) return this.out(rl, 429);
    }

    const ttlMs = Math.max(60, +(this.env.VERIFY_CODE_TTL_SEC || 600)) * 1000;
    const cooldownMs = Math.max(15, +(this.env.VERIFY_RESEND_SEC || 45)) * 1000;
    const key = 'verify:' + await sha256Hex('vemail:' + email);

    const result = await this.state.storage.transaction(async txn => {
      const cur = await txn.get(key);
      if (cur && cur.exp > Date.now() && (Date.now() - (cur.sentAt || 0)) < cooldownMs) {
        return { ok: false, code: 'cooldown', retryAfterSec: Math.ceil((cooldownMs - (Date.now() - cur.sentAt)) / 1000) };
      }
      const otp = sixDigitCode();
      await txn.put(key, { otp, exp: Date.now() + ttlMs, attempts: 0, sentAt: Date.now() });
      return { ok: true, otp, ttl: Math.round(ttlMs / 1000), cooldown: Math.round(cooldownMs / 1000) };
    });
    if (!result.ok) return this.out(result, 429);
    return this.out({ ok: true, email, otp: result.otp, ttl: result.ttl, cooldown: result.cooldown });
  }

  // Check a submitted code. Deletes the record on success or exhaustion so a
  // code is single-use and brute force is bounded (attempts capped).
  async verifyCheck(body) {
    const email = normalizeEmail(body.email);
    const code = String(body.code || '').replace(/\D/g, '');
    if (!validEmailAddr(email) || code.length !== 6) return this.out({ ok: false, code: 'bad_code' }, 400);
    const key = 'verify:' + await sha256Hex('vemail:' + email);
    const maxAttempts = Math.max(3, +(this.env.VERIFY_MAX_ATTEMPTS || 5));

    const result = await this.state.storage.transaction(async txn => {
      const rec = await txn.get(key);
      if (!rec || rec.exp < Date.now()) { if (rec) await txn.delete(key); return { ok: false, code: 'expired', status: 410 }; }
      if (rec.attempts >= maxAttempts) { await txn.delete(key); return { ok: false, code: 'too_many_attempts', status: 429 }; }
      if (rec.otp !== code) {
        rec.attempts += 1;
        await txn.put(key, rec);
        return { ok: false, code: 'bad_code', attemptsLeft: Math.max(0, maxAttempts - rec.attempts), status: 401 };
      }
      await txn.delete(key);
      return { ok: true, verified: true };
    });
    if (!result.ok) return this.out(result, result.status || 400);
    return this.out({ ok: true, verified: true, email });
  }

  // Per-IP throttle on verification-code sends (separate from the usage limiter).
  async bumpVerifyRate(ipHash) {
    const burstMax = +(this.env.VERIFY_IP_BURST || 6);   // per 10-min window
    const dailyMax = +(this.env.VERIFY_IP_DAILY || 30);
    const bucket = Math.floor(Date.now() / (10 * 60 * 1000));
    const day = israelDay();
    return this.state.storage.transaction(async txn => {
      const bk = `vburst:${bucket}:${ipHash}`;
      const bn = +(await txn.get(bk) || 0);
      if (bn >= burstMax) return { ok: false, code: 'ip_rate_limited', retryAfterSec: 600 };
      await txn.put(bk, bn + 1);
      const dk = `vday:${day}:${ipHash}`;
      const dn = +(await txn.get(dk) || 0);
      if (dn >= dailyMax) return { ok: false, code: 'ip_rate_limited' };
      await txn.put(dk, dn + 1);
      return { ok: true };
    });
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

/* ---------- verification helpers (shared by the DO + Worker) ---------- */
function normalizeEmail(e) { return String(e || '').trim().toLowerCase(); }
function validEmailAddr(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }

// Uniform 6-digit code from CSPRNG (rejection-sample the biased tail of 2^32).
function sixDigitCode() {
  const a = new Uint32Array(1);
  let n;
  do { crypto.getRandomValues(a); n = a[0] >>> 0; } while (n >= 4294000000);
  return String(n % 1000000).padStart(6, '0');
}

const DISPOSABLE_VERIFY_RE = /(?:^|\.)(?:mailinator|guerrilla|tempmail|temp-mail|tempmailo|10minute|tenminute|minutemail|throwaway|throw-away|trashmail|trash-mail|yopmail|getnada|sharklasers|discardmail|1secmail|secmail|moakt|mohmal|maildrop|dispostable|fakeinbox|fakemail|mintemail|tempinbox|emailondeck|spamgourmet|spam4|dropmail|mailnesia|mailcatch|burnermail|tmpmail|tmail|wegwerf|mailpoof|inboxkitten)/i;
function isDisposableDomain(email) {
  const m = String(email || '').match(/@([^@\s]+)$/);
  return m ? DISPOSABLE_VERIFY_RE.test(m[1]) : false;
}
