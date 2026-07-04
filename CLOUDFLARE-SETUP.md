# KOLKLI — Cloudflare + Supabase B2B setup

The plan we agreed on: **keep Supabase** (accounts + data) and put
**Cloudflare** around it (hosting, security, file storage, edge logic).
Audio/file editing still runs 100% in the browser — only accounts, file
**metadata**, and stored/sent file **bytes** ever touch a server.

Architecture:

```
Browser (editing stays here)
  │  Supabase JWT
  ▼
Cloudflare Pages ── DNS · SSL · WAF · Rate-Limit · Bot mgmt      [hosting]
  ├─▶ Supabase   Postgres (orgs, seats, files-meta, links) + Auth   [data]
  └─▶ Cloudflare Workers  (verify JWT → sign R2 uploads,            [server]
        Stripe webhooks → seats/plan, admin ops)
             └─▶ Cloudflare R2   file bytes, S3-compatible, no egress [storage]
```

B2B model: **multi-tenant first** (each customer = an organization with
members/seats; data isolated per org). **White-label custom domains**
come later as a premium add-on via Cloudflare for SaaS.

---

## Phase 0 — Hosting + security (do first, ~1 hour, no code)
1. Create a Cloudflare account and add your domain (Cloudflare becomes
   your DNS — point your registrar at the two Cloudflare nameservers).
2. **Workers & Pages → Create → Pages → Connect to Git** (or drag-drop
   this folder). Build command: none. Output directory: `/` (root).
3. The committed **`_headers`** file adds security headers automatically.
4. **Security → WAF**: turn on Managed Rules + a **Rate Limiting** rule
   on `/auth.html` and any API route. Enable **Bot Fight Mode**.
5. SSL/TLS mode: **Full (strict)**.
   ✅ You now have a fast, DDoS-protected, HTTPS B2B-grade front door.

## Phase 1 — Multi-tenant accounts (Supabase) ✅ schema ready
1. Make sure you've run `supabase-schema.sql` (from the accounts step).
2. Run **`supabase-orgs-schema.sql`** once in the Supabase SQL Editor.
   It adds `organizations`, `org_members` (roles + seats), `org_invites`,
   org-scoped `files`/`share_links`, and all the Row-Level-Security so
   each customer only ever sees their own org's data.
3. Every user automatically gets a personal org on sign-up; inviting a
   teammate = a row in `org_invites` + `accept_invite(token)`.
4. ✅ The **"Team" screen** in `dashboard.html` is built: members list,
   invite by email (with a shareable `#join=TOKEN` link), role toggle,
   revoke, and seat counter. It talks to Supabase when configured, and
   runs as a local demo otherwise. Invite links open
   `dashboard.html#join=…` which calls `accept_invite()`.
   → Next: wire real transactional emails for invites (Phase 2/3 Worker),
     and move the marketing pages' "plan" to the org.

## Phase 2 — File storage (R2 + a Worker) ✅ Worker scaffolded
The Worker lives in **`worker/`** — it verifies the Supabase JWT, checks
org membership (via RLS), and returns a **presigned R2 URL** so the
browser uploads/downloads directly (bytes never pass through the Worker).
1. `cd worker && npm install`
2. Follow **`worker/README.md`**: create the R2 bucket, add R2 API-token
   secrets, fill `wrangler.toml`, set the bucket CORS policy, `wrangler
   deploy`. It ships a `curl` test and a browser snippet.
3. The browser gets its JWT from `KolkliAuth.getToken()`.
   → Next: wire `uploadToR2()` into `send.html` / the file organizer and
     record each upload in the Supabase `files` table.

## Phase 3 — Billing (Stripe, per-seat) ✅ Worker scaffolded
The billing Worker lives in **`worker-billing/`**:
1. `cd worker-billing && npm install`
2. Follow **`worker-billing/README.md`**: create per-seat Stripe prices,
   set `PLAN_PRICES`, add the Stripe + service-role secrets, `wrangler
   deploy`, then register the `/webhook` endpoint in Stripe.
3. Put the deployed URL in `supabase-config.js` →
   `window.KOLKLI_WORKERS.billing`. The dashboard's **Upgrade / Manage
   billing** buttons then run real Stripe Checkout / the Billing Portal;
   the `/webhook` updates the org's `plan` + `seats` via the service-role
   key (the only thing allowed to change billing — the schema blocks
   client-side edits). Until configured, the buttons link to `pricing/`.

## Phase 4 — On demand
- **White-label domains**: Cloudflare for SaaS (Custom Hostnames) so a
  customer can point `files.theircompany.com` at KOLKLI with auto SSL.
  Pairs with the existing co-branding in `send.html`/`download.html`.
- **Enterprise SSO (SAML)** via Supabase for large customers.
- **Audit log** table + Cloudflare Access for an internal admin portal.

---

### Keys & secrets — where they live
| Secret | Where | Exposed to browser? |
|---|---|---|
| Supabase **anon** key | `supabase-config.js` | Yes (safe — RLS-limited) |
| Supabase **service-role** key | Worker secret (`wrangler secret`) | **Never** |
| R2 access keys | Worker secret | **Never** |
| Stripe secret + webhook secret | Worker secret | **Never** |

The browser only ever holds the anon key + the user's JWT. Everything
privileged happens inside Workers.
