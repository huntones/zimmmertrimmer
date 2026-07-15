# Guest email verification gate

Guests must confirm a **6-digit code sent to a real email** before an upload is
authorized. It's an anti-abuse identity check — "keep your files secure and
protect our community" — that makes throwaway uploads costly and gives every
guest transfer an email of record.

## How it works

```
Guest clicks "Send files" (or any gated upload)
   │
   ▼
usage-limits.js authorize(tool)  ──►  KolkliVerify.ensureVerified()
   │  (already verified / signed-in / paid → skips)          │
   │                                        opens modal: email → 6-digit code
   │                                                          │
   │            POST /verify/send  ─────────────────────────►│  Worker
   │                                   DO stores code (TTL, attempts, per-IP cap)
   │                                   Worker emails the code via your provider
   │            POST /verify/check ─────────────────────────►│
   │                                   DO validates → Worker mints a signed
   │                                   HMAC token (30-day), returned to browser
   │  browser stores { email, token, exp } in localStorage    │
   ▼                                                          │
authorize() resends with verifyToken  ──► Worker RE-CHECKS the token server-side
   │                                        (VERIFY_SCOPE tools, guests only)
   ▼
usage quota check → upload proceeds
```

- **One choke point.** The gate lives in `usage-limits.js` `authorize()`, which
  every guest upload already calls (the four file services via
  `withUsage → guard`, the edit/AI tools via the auto-installer). Nothing else
  to wire per page.
- **Real teeth, not just UI.** The Worker requires a valid signed token in
  `/usage/authorize` for gated tools when the caller is a signed-out non-paid
  guest, so the modal can't be bypassed by scripting the client.
- **Guest-only.** Signed-in users (they already cleared auth) and paid plans skip
  it. Verified guests skip it for 30 days (the token lifetime).
- **Safe by default.** Until the Worker URL is set (`supabase-config.js` →
  `KOLKLI_WORKERS`) **and** email is configured, `ensureVerified()` is a no-op
  that passes through — the demo site is untouched.
- **Armed by one switch.** Server-side enforcement only kicks in once
  `VERIFY_SECRET` is set. So if you point the site at the Worker before
  finishing email setup, guest uploads are **not** bricked — the client passes
  through on an "email not ready" response, and the server doesn't 403 until the
  secret exists. Set the secret + email first (steps below), then flip the URL.

## Files

| File | Role |
|------|------|
| `verify.js` | `window.KolkliVerify` — modal, state, `/verify/*` calls, i18n he/en/ru |
| `usage-limits.js` | calls `ensureVerified()` in `authorize()`, attaches the token |
| `header.js` | loads `verify.js` after `usage-limits.js` on every page |
| `worker/src/index.js` | `/verify/send` + `/verify/check`, DO code storage, HMAC token, email sender, server-side enforcement |
| `worker/wrangler.toml` | `EMAIL_*` / `VERIFY_*` vars + the two secrets |

## Deploy (what only you can do)

You need a Cloudflare account (the `worker/` is already built) and an email
provider with a **verified sending domain**.

### 1. Pick an email provider & get an API key
Default is **Resend** (simplest from Workers). Also supported by setting
`EMAIL_PROVIDER`: `sendgrid`, `postmark`, `smtp2go`, `mailchannels`.

- Create the account, **verify your sending domain** (add the DKIM/SPF DNS
  records they give you — this is what stops the code landing in spam).
- Create an API key.
- Decide your `EMAIL_FROM`, e.g. `KOLKLI <verify@kolkli.com>` (the address must
  be on the verified domain).

### 2. Fill in `worker/wrangler.toml`
Set `EMAIL_PROVIDER`, `EMAIL_FROM`, and (optionally) `VERIFY_SCOPE`
(`transfers` = the four file services only; `uploads` = also the edit/AI file
tools — the default; `off` = disable).

### 3. Set the secrets
```bash
cd worker
# any long random string — signs the verify tokens:
openssl rand -base64 48 | npx wrangler secret put VERIFY_SECRET
# your provider API key (skip only for mailchannels):
npx wrangler secret put EMAIL_API_KEY
```

### 4. Deploy & point the site at it
```bash
npx wrangler deploy       # → https://kolkli-storage.<subdomain>.workers.dev
```
Then in `supabase-config.js` set `KOLKLI_WORKERS.storage` (or `.usage`) to that
URL. With `VERIFY_SECRET` already set (step 3), flipping this URL turns the gate
fully on — client modal **and** server enforcement.

### 5. Test
```bash
# request a code (a real email should arrive):
curl -X POST https://<worker>/verify/send \
  -H 'content-type: application/json' \
  -d '{"email":"you@yourdomain.com","lang":"en"}'
# → {"ok":true,"sent":true,"ttl":600,"cooldown":45}

# exchange the code for a token:
curl -X POST https://<worker>/verify/check \
  -H 'content-type: application/json' \
  -d '{"email":"you@yourdomain.com","code":"123456"}'
# → {"ok":true,"verified":true,"email":"...","token":"<payload>.<sig>","expiresAt":...}
```
Then open `send.html` as a guest and confirm the modal appears on "Send files".

## Config knobs (all optional, in `wrangler.toml`)

| Var | Default | Meaning |
|-----|---------|---------|
| `VERIFY_SCOPE` | `uploads` | `transfers` \| `uploads` \| `all` \| `off` |
| `VERIFY_CODE_TTL_SEC` | `600` | how long a code is valid |
| `VERIFY_RESEND_SEC` | `45` | resend cooldown |
| `VERIFY_MAX_ATTEMPTS` | `5` | wrong-code tries before the code is burned |
| `VERIFY_TOKEN_DAYS` | `30` | signed-token lifetime (how long a guest stays verified) |
| `VERIFY_IP_BURST` | `6` | code sends per IP per 10 min |
| `VERIFY_IP_DAILY` | `30` | code sends per IP per day |

Client-side, `window.KOLKLI_VERIFY = { scope:'transfers' }` narrows the modal
scope without a redeploy (keep it aligned with the Worker's `VERIFY_SCOPE`).
Set `window.KOLKLI_VERIFY_STRICT = true` to force the gate on even before the
Worker is deployed (dev only — sends will fail with no backend).

## Recommendation
Consider `VERIFY_SCOPE=transfers`. The audio/video cutters and most edit tools
run 100% in the browser — files never reach your servers — so verifying them is
lead-capture friction, not abuse protection, and it works against the
"no account needed to start" positioning. The four file services (send /
organize / review / request) are where real 3GB guest uploads and storage/
community risk live.
