# KOLKLI billing Worker (Phase 3 — Stripe per-seat)

A Cloudflare Worker that runs B2B subscription billing with Stripe and
writes the resulting plan + seat count back to the organization in
Supabase. The org's `plan`/`seats` can ONLY change through this Worker
(it uses the service-role key; `supabase-orgs-schema.sql` blocks any
client-side edit).

```
Dashboard ──(JWT)──▶ /checkout ──▶ Stripe Checkout ──▶ customer pays
                                                          │
Stripe ──/webhook (signed)──▶ Worker ──service-role──▶ organizations.plan/seats
```

## Prerequisites
- Supabase project with `supabase-orgs-schema.sql` applied (adds the
  `stripe_customer` / `stripe_subscription` columns).
- Node 18+. From this folder: `npm install`, then `npx wrangler login`.

## 1. Stripe products & prices
In the Stripe dashboard create one **recurring, per-seat** Price for each
paid plan (Lite / Pro / Business). Copy each Price id (`price_…`) into
`PLAN_PRICES` in `wrangler.toml`:
```toml
PLAN_PRICES = '{"lite":"price_XXX","pro":"price_YYY","business":"price_ZZZ"}'
```

The Worker also keeps the built-in promotion code `Kolkli2026` active in
Stripe Checkout: 100% off the first subscription invoice for Lite, Pro and
Business, redeemable through August 31, 2026 (Israel time).

## 2. Secrets
```bash
npx wrangler secret put STRIPE_SECRET_KEY          # sk_live_… / sk_test_…
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY  # Supabase → API → service_role
# (set STRIPE_WEBHOOK_SECRET after step 4)
```

## 3. Fill in the vars
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ALLOWED_ORIGIN`, `SUCCESS_URL`,
`CANCEL_URL` in `wrangler.toml`.

## 4. Deploy + register the webhook
```bash
npx wrangler deploy      # → https://kolkli-billing.<subdomain>.workers.dev
```
Stripe dashboard → **Developers → Webhooks → Add endpoint**:
- URL: `https://kolkli-billing.<subdomain>.workers.dev/webhook`
- Events: `checkout.session.completed`, `customer.subscription.updated`,
  `customer.subscription.deleted`
Copy the endpoint's **Signing secret** and store it:
```bash
npx wrangler secret put STRIPE_WEBHOOK_SECRET      # whsec_…
npx wrangler deploy
```

## 5. Point the site at it
In `supabase-config.js` set:
```js
window.KOLKLI_WORKERS = { billing: 'https://kolkli-billing.<subdomain>.workers.dev', storage: '…' };
```
The dashboard's **Upgrade / Manage billing** buttons then run real Stripe
Checkout / the Billing Portal. Until it's set, they fall back to the
`pricing/` page.

## Endpoints
| Route | Auth | Body | Returns |
|---|---|---|---|
| `POST /checkout` | JWT + owner/admin | `{orgId, plan, seats, promoCode?}` | `{ url }` (redirect to Stripe) |
| `POST /portal`   | JWT + owner/admin | `{orgId}` | `{ url }` (manage/cancel) |
| `POST /webhook`  | Stripe signature | (Stripe event) | `ok` |
| `GET  /health`   | — | — | `{ ok: true }` |

## Test (Stripe test mode)
```bash
curl https://kolkli-billing.<subdomain>.workers.dev/health   # {"ok":true}

# Start a checkout (needs a real JWT + an org you own):
curl -X POST https://kolkli-billing.<subdomain>.workers.dev/checkout \
  -H "authorization: Bearer <SUPABASE_ACCESS_TOKEN>" \
  -H "content-type: application/json" \
  -d '{"orgId":"<ORG_UUID>","plan":"business","seats":5}'
# → {"url":"https://checkout.stripe.com/..."}  → open it, pay with card 4242 4242 4242 4242
```
Use `stripe listen --forward-to <worker-url>/webhook` to replay webhooks
locally while testing. After a successful test payment the org's `plan`
and `seats` update automatically.

## Notes
- Deploy this `worker-billing/` folder as its own Worker (not part of the
  Pages static site) so its source isn't served publicly.
- Seats = the `quantity` on the subscription; the Billing Portal lets a
  customer change it, and the webhook keeps `organizations.seats` in sync,
  which the schema's `enforce_seat_limit` trigger uses to cap invites.
