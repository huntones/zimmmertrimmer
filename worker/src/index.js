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
