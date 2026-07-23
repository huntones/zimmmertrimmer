# KOLKLI SEND — backend (infrastructure phase)

Real database + API + auth + file security for the **Files Sent** module.
**No UI** — this is the backend only, exactly as scoped. When it is stable
the front-end is a separate step.

Built to slot into the existing stack (Supabase Postgres + Cloudflare R2 +
the site's Supabase JWT auth), reusing the existing security model
(RLS + service-role), token conventions, and email-provider approach.
It does **not** touch `send.html`, `download.html`, or any of the four
existing file services — those keep running as-is.

Everything below has been **run and tested against a real PostgreSQL**
(not mocks): migrations apply, RLS isolates owners, password/code
verification works, presigned downloads return real bytes, the ZIP
streams, and the audit log fills in. See **§7**.

---

## 1. Files created / modified

**Modified (2):**
- `../.gitignore` — ignore `server/node_modules`, `.env`, `.storage/`, `.pgdata*/`.
- (nothing else in the existing site was changed.)

**Created — everything under `server/`:**

```
server/
  package.json                 deps + scripts (ESM, Node >=20)
  .env.example                 every env var, with safe local defaults
  README.md                    this document
  src/
    config.js                  central config (dotenv + defaults)
    server.js                  entry point (listen + scheduler)
    app.js                     express assembly, CORS, routers, error handler
    scheduler.js               expiry sweep (setInterval)
    db/
      index.js                 pg pool; asUser() [RLS] / service() contexts
      embedded.js              boots native Postgres for dev/test (no Docker)
      migrate.js               migration runner CLI
      apply.js                 reusable migration applier (used by tests)
    migrations/                Supabase-paste-safe SQL (prod)
      001_schema.sql           schema, enums, tables, indexes, numbering, triggers
      002_rls.sql              Row-Level Security + grants
      003_functions.sql        SECURITY DEFINER RPCs (public/client flows)
    migrations-local/
      000_local_shim.sql       LOCAL-ONLY: auth schema, roles, auth.uid()
    auth/
      jwt.js                   verify Supabase owner JWT; mint client sessions
    storage/
      index.js                 driver selector
      local-fs.js              private-dir driver + HMAC presigned URLs (dev)
      r2.js                    Cloudflare R2 driver (S3 presign via aws4fetch)
    mail/
      index.js                 mailer facade (console outbox / provider)
      provider.js              Resend/SendGrid/Postmark/SMTP2GO/MailChannels
      notifications.js         template stubs + notify.* helpers
    lib/
      errors.js                typed ApiError + async wrap()
      ids.js                   CSPRNG tokens, 6-digit code, storage keys
      presign.js               HMAC sign/verify for local presigned URLs
      validate.js              upload validation (magic bytes, blocklist, sanitise)
      ratelimit.js             fixed-window limiter + named policies
      serialize.js             owner-facing serializers (no secrets)
    http/
      util.js                  clientIp, userAgent, sendError
      upload.js                streaming multipart -> storage (sha256, size cap)
      zip.js                   streaming ZIP (archiver)
    api/
      owner.js                 /api/deliveries/*   (authenticated)
      public.js                /api/public/deliveries/*  (anonymous client)
      blob.js                  /internal/blob      (serves local presigned URLs)
  test/
    helpers.js                 boots embedded PG + real app over fetch
    api.test.js                27 end-to-end tests (spec list + extras)
```

---

## 2. Tables added

All in a dedicated `kolkli_send` schema (never collides with the existing
`public.projects` / `profiles`). Seven tables:

| Table | Purpose |
|---|---|
| `kolkli_send.deliveries` | one delivery; `public_id` (unguessable), `order_number` (from 100001), status, security, permissions, expiry, counters |
| `kolkli_send.delivery_recipients` | named recipients + per-recipient open/download tracking |
| `kolkli_send.delivery_folders` | nested folders (self-referencing, same-delivery enforced) |
| `kolkli_send.stored_files` | **physical object registry** (storage_key, sha256, size, mime) — dedupe lives here |
| `kolkli_send.delivery_files` | association delivery ⟶ stored_file (unique per pair: no double-attach) |
| `kolkli_send.delivery_events` | append-only audit log (event_type CHECK-constrained) |
| `kolkli_send.verification_codes` | bcrypt of the 6-digit code only; attempts + expiry |

**Enums:** `delivery_status` (draft/ready/sent/opened/downloaded/revoked/expired/blocked),
`security_type` (link/password/email_code), `recipient_status`, `file_status`.

**"Don't duplicate a physical file":** the bytes live once in `stored_files`
(deduped per owner by `sha256`); `delivery_files` just references them. Verified
by the dedupe test.

**Guards in the DB (not just app code):**
- `enforce_status_transition` trigger rejects illegal moves (e.g. draft→downloaded, revoked→opened).
- `enforce_folder_parent` trigger keeps a folder's parent in the same delivery.
- `unique (delivery_id, file_id)` prevents accidental double association.
- `order_number` from a sequence starting at **100001**; `public_id` = 18 random bytes (hex), never sequential.

---

## 3. Migrations created

Ordinary SQL files, applied in filename order and tracked in
`public.kolkli_send_migrations`:

- `migrations/001_schema.sql`
- `migrations/002_rls.sql`
- `migrations/003_functions.sql`
- `migrations-local/000_local_shim.sql` — **local/embedded Postgres only.** It
  stands in for what Supabase already provides (the `auth` schema, the
  `anon/authenticated/service_role` roles, `auth.uid()`). It is *not* in
  `migrations/`, so the three real files paste into the Supabase SQL editor
  unchanged.

---

## 4. Endpoints added

### Owner (require `Authorization: Bearer <Supabase JWT>`)
```
POST   /api/deliveries
GET    /api/deliveries
GET    /api/deliveries/:id
PATCH  /api/deliveries/:id
DELETE /api/deliveries/:id
POST   /api/deliveries/:id/send
POST   /api/deliveries/:id/revoke
POST   /api/deliveries/:id/reactivate
POST   /api/deliveries/:id/recipients
DELETE /api/deliveries/:id/recipients/:recipientId
POST   /api/deliveries/:id/files          (multipart upload+associate, OR JSON {file_id})
DELETE /api/deliveries/:id/files/:fileId
POST   /api/deliveries/:id/folders
PATCH  /api/deliveries/:id/folders/:folderId
DELETE /api/deliveries/:id/folders/:folderId
GET    /api/deliveries/:id/events
```
Every handler runs inside an `asUser()` transaction, so **RLS** guarantees a
user can only see/touch their own deliveries (tested).

### Public (anonymous client; no account)
```
GET    /api/public/deliveries/:publicId
POST   /api/public/deliveries/:publicId/verify-password
POST   /api/public/deliveries/:publicId/send-code
POST   /api/public/deliveries/:publicId/verify-code
GET    /api/public/deliveries/:publicId/files/:fileId/preview
POST   /api/public/deliveries/:publicId/files/:fileId/download
POST   /api/public/deliveries/:publicId/download-all        (streaming ZIP)
```
Public responses are **curated** (via the `public_view` SQL function): never
`user_id`, `password_hash`, storage keys, other recipients, IPs, or the audit
log. After password/code success the client gets a short-lived **session token**
(so the secret isn't resent each request); it is passed back as
`Authorization: Bearer` (or `?st=`).

### Internal
```
GET    /health
GET    /internal/blob    (serves local-driver presigned URLs; unused with R2)
```

**Access-gate checklist** (applied on every preview/download):
delivery exists → is sent → not revoked → not expired (lazy-expire) → verified
if required → download allowed → under the download limit → *only then* a
short-lived presigned URL is minted (never stored, regenerated each request).

---

## 5. Environment variables

Full list with defaults in `.env.example`. The important ones:

| Var | Meaning | Local default |
|---|---|---|
| `DATABASE_URL` | Postgres connection string | *(empty ⟶ embedded PG boots)* |
| `SUPABASE_JWT_SECRET` | verifies owner JWTs (Supabase project JWT secret) | dev secret |
| `PUBLIC_SESSION_SECRET` | signs client session tokens | dev secret |
| `PRESIGN_SECRET` | signs local presigned URLs | dev secret |
| `STORAGE_DRIVER` | `local` or `r2` | `local` |
| `STORAGE_LOCAL_DIR` | private storage dir (local driver) | `./.storage` |
| `R2_ACCOUNT_ID`/`R2_BUCKET`/`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY` | R2 (prod) | — |
| `MAIL_DRIVER` | `console` or `provider` | `console` |
| `MAIL_PROVIDER`/`MAIL_FROM`/`MAIL_API_KEY` | real email (prod) | resend / stub |
| `MAX_FILE_BYTES` | upload size cap | 500MB |
| `VERIFY_CODE_TTL_MIN` / `VERIFY_MAX_ATTEMPTS` | email code | 10 / 5 |
| `EXPIRY_SWEEP_SEC` | expiry sweeper interval (0 = off) | 300 |

**Secrets are never logged** (codes, tokens, presigned URLs, storage keys,
passwords). IP/User-Agent are stored only in the audit log.

---

## 6. How to run the migrations

```bash
cd server
npm install                 # also downloads a native Postgres for dev/tests

# Local (no DATABASE_URL): boots embedded Postgres + applies the shim + all migrations
npm run migrate
npm run migrate:status      # [x]/[ ] per migration

# Against a real database (Supabase pooler / any Postgres):
DATABASE_URL='postgres://...' npm run migrate     # skips the local shim automatically
```
On Supabase you can instead paste `migrations/001…003.sql` into the SQL editor
in order (skip `migrations-local/`).

---

## 7. How to test the API

```bash
cd server
npm test
```
This boots a throwaway native Postgres, applies the migrations, starts the real
HTTP app on an ephemeral port, and drives it over `fetch`. **27/27 pass.**
Coverage maps to the spec's required list:

| Spec requirement | Test |
|---|---|
| create / update delivery | ✓ |
| owner access / block another user | ✓ (RLS isolation) |
| invalid public_id | ✓ |
| correct & incorrect password | ✓ |
| correct & incorrect code, expired code | ✓ |
| code lockout after N attempts | ✓ |
| expired delivery / revoked delivery | ✓ |
| forbidden download / download limit | ✓ |
| file not belonging to delivery | ✓ |
| direct file access attempt | ✓ (forged/expired signature → 403) |
| presigned URL creation | ✓ (fetches real bytes end-to-end) |
| rate limiting | ✓ |
| audit event creation | ✓ |
| *(extra)* dangerous-type + magic-byte + traversal upload blocks | ✓ |
| *(extra)* dedupe, streaming ZIP with folders, no field leakage | ✓ |

Run the server standalone:
```bash
npm start           # -> KOLKLI SEND backend listening on :8787 (storage=local mail=console db=embedded)
curl localhost:8787/health
```

---

## 8. Request / Response examples

Owner JWTs below are Supabase-issued; locally the test harness mints them with
`SUPABASE_JWT_SECRET`.

**Create a delivery**
```http
POST /api/deliveries
Authorization: Bearer <jwt>
Content-Type: application/json

{ "title": "Wedding photos", "security_type": "password", "password": "roses",
  "expires_at": "2026-08-01T00:00:00Z", "max_downloads": 20 }
```
```json
201
{ "delivery": { "id": "…uuid…", "public_id": "b1c2…(36 hex)",
  "order_number": 100001, "status": "draft", "security_type": "password",
  "has_password": true, "allow_download": true, "expires_at": "2026-08-01T00:00:00.000Z" } }
```

**Upload a file (multipart)** → `POST /api/deliveries/:id/files` with a `file`
part (optionally `folder_id`, `display_name`) →
`201 { "file": { "id": "…", "name": "photo.jpg", "size_bytes": 8123, "mime_type": "image/jpeg" }, "deduplicated": false }`

**Send** → `POST /api/deliveries/:id/send` → `200 { "delivery": { "status": "sent", "sent_at": "…" } }`
(emails each recipient; records `delivery_sent`).

**Client opens (password-protected)**
```http
GET /api/public/deliveries/b1c2…
```
```json
200
{ "delivery": { "public_id": "b1c2…", "reference": 100001, "title": "Wedding photos",
  "status": "sent", "security_type": "password", "files": null },
  "verified": false, "requires_password": true, "requires_code": false }
```
```http
POST /api/public/deliveries/b1c2…/verify-password   { "password": "roses" }
-> 200 { "token": "<client-session-jwt>", "expires_in": 3600 }

POST /api/public/deliveries/b1c2…/files/<fileId>/download
Authorization: Bearer <client-session-jwt>
-> 200 { "url": "http://…/internal/blob?key=…&exp=…&sig=…", "expires_in": 300 }
```
Fetching that `url` streams the bytes with `Content-Disposition: attachment`.
`POST …/download-all` streams `Wedding photos_KOLKLI.zip` directly.

---

## 9. What is NOT done yet (intentionally, per scope)

- **No UI** — no dashboard, wizard, cards, or client page (next phase).
- **Pre-expiry reminder email** — the notification function exists, but the
  scheduled reminder pass is not wired (needs a `reminder_sent_at` column to
  avoid duplicates). The expiry **status sweep** *is* implemented and tested.
- **Deployment** — code is portable to your CF Worker + Supabase + R2 via the
  driver seam, but is not yet deployed there. It runs today as a Node service
  (Node 24 is what's installed here). See §10.
- **Rate limiter is in-memory** (single instance). For multi-instance, back it
  with the existing Cloudflare `UsageLimiter` Durable Object or Redis (same
  interface).
- **Owner "download" / "opened" notifications** are best-effort and un-throttled;
  add owner opt-out + batching before turning on real email.
- **Antivirus scanning** of uploads is not included (type/magic/size only).
- **Access-token-per-recipient** (`access_token_hash`) column exists but the
  per-recipient tokenised link flow isn't wired (email-code covers the same need).
- **Reconciling `order_number` ranges** with the existing `project-numbering.js`
  (send starts at 100001 here, matching `supabase-schema.sql`; the legacy JS
  fallback still says 10001 — decide before the two systems meet).

---

## 10. Steps before building the front-end

1. **Pick the runtime for prod.** Two clean options, both reuse this code:
   - Deploy this Node service (Render/Railway/Fly/VPS) pointed at Supabase
     (`DATABASE_URL` = pooler) + R2 (`STORAGE_DRIVER=r2`), or
   - Port the route handlers into `worker/src/index.js` (they already depend
     only on the db/storage/mail seams).
2. **Provision the real backends:** run `migrations/001…003.sql` on Supabase;
   create a **private** R2 bucket `kolkli-files`; set the R2 + mail secrets.
   (Note: the existing Supabase Storage bucket is public-read — this module uses
   private R2 with presigned URLs instead, as the spec requires.)
3. **Wire auth:** set `SUPABASE_JWT_SECRET` to the project JWT secret so the
   tokens `auth-store.js` already issues are accepted. (If you enable Supabase
   asymmetric JWTs, switch `auth/jwt.js` to JWKS verification.)
4. **Lock down CORS** (`ALLOWED_ORIGIN`) to the site origin, and put the API
   behind HTTPS.
5. **Decide the client link shape** (`/d/:public_id`) the future UI will serve;
   `notifications.js` already builds `PUBLIC_BASE_URL + /d/:public_id`.
6. Then design the UI against these endpoints — the shapes in §8 are stable.

> Nothing here is claimed "done" beyond what was actually exercised: migrations,
> RLS, the full API, verification, rate limiting, presigned downloads, and the
> audit log were all run against a real Postgres (`npm test`, 27/27).
