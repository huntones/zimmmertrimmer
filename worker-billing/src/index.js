/* ============================================================
   KOLKLI billing Worker (Cloudflare) — Phase 3.

   Per-seat B2B billing with Stripe. Three jobs:
     POST /checkout {orgId, plan, seats}  → Stripe Checkout URL (redirect)
     POST /portal   {orgId}               → Stripe Billing Portal URL
     POST /webhook                        → Stripe → update the org's plan/seats

   Auth model:
     • /checkout and /portal require a Supabase JWT AND the caller must be
       owner/admin of the org (checked with their own token, so RLS enforces).
     • /webhook is called by Stripe and verified by signature (no JWT).
     • Plan/seat writes to Supabase use the SERVICE-ROLE key — the only thing
       allowed to change billing (supabase-orgs-schema.sql blocks client edits).

   Secrets (wrangler secret put):
     STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SUPABASE_SERVICE_ROLE_KEY
   Vars (wrangler.toml):
     SUPABASE_URL, SUPABASE_ANON_KEY, ALLOWED_ORIGIN, SUCCESS_URL, CANCEL_URL,
     PLAN_PRICES  (JSON map plan → Stripe price id)
   ============================================================ */
import Stripe from 'stripe';

export default {
  async fetch(request, env) {
    const cors = corsHeaders(env);
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    const url = new URL(request.url);
    try {
      if (url.pathname === '/health') return json({ ok: true }, cors);

      // Stripe calls this — verified by signature, not by a user JWT.
      if (url.pathname === '/webhook' && request.method === 'POST') {
        return await handleWebhook(request, env);
      }

      const user = await verifyUser(request, env);
      if (!user) return json({ error: 'unauthorized' }, cors, 401);

      if (url.pathname === '/checkout' && request.method === 'POST') {
        return await handleCheckout(await request.json().catch(() => ({})), user, env, cors);
      }
      if (url.pathname === '/portal' && request.method === 'POST') {
        return await handlePortal(await request.json().catch(() => ({})), user, env, cors);
      }
      return json({ error: 'not found' }, cors, 404);
    } catch (e) {
      return json({ error: String((e && e.message) || e) }, cors, 500);
    }
  }
};

/* ---------- infra ---------- */
function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Max-Age': '86400'
  };
}
function json(obj, cors, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', ...cors } });
}
function stripeClient(env) {
  return new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: '2024-06-20',
    httpClient: Stripe.createFetchHttpClient()
  });
}
function planPrices(env) { try { return JSON.parse(env.PLAN_PRICES || '{}'); } catch (_) { return {}; } }

// Verify the Supabase JWT (asks Supabase; no JWT secret needed).
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

// The caller's role in the org, checked with THEIR token (RLS-enforced).
async function orgRole(orgId, user, env) {
  const q = `${env.SUPABASE_URL}/rest/v1/org_members` +
    `?org_id=eq.${encodeURIComponent(orgId)}&user_id=eq.${encodeURIComponent(user.id)}&select=role`;
  const r = await fetch(q, { headers: { authorization: `Bearer ${user.token}`, apikey: env.SUPABASE_ANON_KEY } });
  if (!r.ok) return null;
  const rows = await r.json().catch(() => []);
  return (Array.isArray(rows) && rows[0] && rows[0].role) || null;
}

/* ---------- Supabase writes (service-role) ---------- */
function svc(env) {
  return { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };
}
async function getOrg(orgId, env) {
  const r = await fetch(
    `${env.SUPABASE_URL}/rest/v1/organizations?id=eq.${orgId}&select=stripe_customer,plan,seats`,
    { headers: svc(env) }
  );
  if (!r.ok) return null;
  const rows = await r.json().catch(() => []);
  return rows[0] || null;
}
async function patchOrg(orgId, fields, env) {
  await fetch(`${env.SUPABASE_URL}/rest/v1/organizations?id=eq.${orgId}`, {
    method: 'PATCH',
    headers: { ...svc(env), 'content-type': 'application/json', prefer: 'return=minimal' },
    body: JSON.stringify(fields)
  });
}

/* ---------- routes ---------- */
async function handleCheckout(body, user, env, cors) {
  const orgId = String(body.orgId || '');
  const plan = String(body.plan || '');
  const seats = Math.max(1, parseInt(body.seats || '1', 10) || 1);
  if (!orgId || !plan) return json({ error: 'orgId and plan required' }, cors, 400);

  const role = await orgRole(orgId, user, env);
  if (role !== 'owner' && role !== 'admin') return json({ error: 'forbidden' }, cors, 403);

  const price = planPrices(env)[plan];
  if (!price) return json({ error: 'unknown plan' }, cors, 400);

  const org = await getOrg(orgId, env);
  const stripe = stripeClient(env);
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price, quantity: seats }],
    customer: org && org.stripe_customer ? org.stripe_customer : undefined,
    customer_email: org && org.stripe_customer ? undefined : user.email,
    client_reference_id: orgId,
    metadata: { orgId, plan },
    subscription_data: { metadata: { orgId, plan } },
    success_url: env.SUCCESS_URL || `${env.ALLOWED_ORIGIN}/dashboard.html#team`,
    cancel_url: env.CANCEL_URL || `${env.ALLOWED_ORIGIN}/pricing/`
  });
  return json({ url: session.url }, cors);
}

async function handlePortal(body, user, env, cors) {
  const orgId = String(body.orgId || '');
  const role = await orgRole(orgId, user, env);
  if (role !== 'owner' && role !== 'admin') return json({ error: 'forbidden' }, cors, 403);

  const org = await getOrg(orgId, env);
  if (!org || !org.stripe_customer) return json({ error: 'no subscription' }, cors, 400);

  const session = await stripeClient(env).billingPortal.sessions.create({
    customer: org.stripe_customer,
    return_url: env.SUCCESS_URL || `${env.ALLOWED_ORIGIN}/dashboard.html#team`
  });
  return json({ url: session.url }, cors);
}

async function handleWebhook(request, env) {
  const sig = request.headers.get('stripe-signature');
  const raw = await request.text();
  const stripe = stripeClient(env);
  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      raw, sig, env.STRIPE_WEBHOOK_SECRET, undefined, Stripe.createSubtleCryptoProvider()
    );
  } catch (e) {
    return new Response('bad signature', { status: 400 });
  }

  const prices = planPrices(env);
  const priceToPlan = {};
  Object.keys(prices).forEach(p => { priceToPlan[prices[p]] = p; });

  try {
    if (event.type === 'checkout.session.completed') {
      const s = event.data.object;
      const orgId = (s.metadata && s.metadata.orgId) || s.client_reference_id;
      if (s.subscription) {
        const sub = await stripe.subscriptions.retrieve(s.subscription);
        await applySub(orgId, sub, priceToPlan, s.customer, env);
      }
    } else if (event.type === 'customer.subscription.updated') {
      const sub = event.data.object;
      await applySub(sub.metadata && sub.metadata.orgId, sub, priceToPlan, sub.customer, env);
    } else if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object;
      const orgId = sub.metadata && sub.metadata.orgId;
      if (orgId) await patchOrg(orgId, { plan: 'free', seats: 1, stripe_subscription: null }, env);
    }
  } catch (e) {
    return new Response('handler error: ' + e.message, { status: 500 });
  }
  return new Response('ok');
}

async function applySub(orgId, sub, priceToPlan, customer, env) {
  if (!orgId) return;
  const item = sub.items && sub.items.data && sub.items.data[0];
  const priceId = item && item.price && item.price.id;
  const plan = priceToPlan[priceId] || 'pro';
  const seats = (item && item.quantity) || 1;
  await patchOrg(orgId, { plan, seats, stripe_customer: customer, stripe_subscription: sub.id }, env);
}
