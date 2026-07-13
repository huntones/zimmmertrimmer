# 7-Day Free Trial — anti-abuse & how to turn on real enforcement

> תקציר בעברית: מנגנון תקופת הניסיון (7 ימים, ללא כרטיס) כבר בנוי. עד שפורסים את
> ה-Worker ומחברים את Supabase הוא רץ במצב "דמו מקומי" בלבד — האכיפה האמיתית
> (fingerprint + IP + חשבון-אחד-פר-מכשיר) נכנסת לפעולה רק אחרי שני הצעדים בהמשך.

Every registered user gets **one** 7-day Creator trial, granted at sign-up, **no
credit card**, reverting to Free automatically when the window ends.

---

## The anti-abuse layers (defence in depth)

| Layer | What it stops | Where |
|-------|---------------|-------|
| **Browser fingerprint** (canvas + UA + screen + platform + hardware + timezone → SHA-256) | Same device, different email | [usage-limits.js](usage-limits.js) `fingerprint()` |
| **IP address** (`cf-connecting-ip`, hashed) | Same network farming trials | [worker/src/index.js](worker/src/index.js) `trialClaim()` |
| **Anonymous device/browser id** (localStorage **+** cookie, 1-year) | Clearing the session / deleting the account | [usage-limits.js](usage-limits.js) `anonymousId()` |
| **One-per-account** (DB, SECURITY DEFINER, idempotent) | Re-triggering the trial on an existing account | [supabase-schema.sql](supabase-schema.sql) `start_trial()` |
| **One-per-device server ledger** (Durable Object, atomic transaction across every identity dimension) | New email from the same browser/device/IP | [worker/src/index.js](worker/src/index.js) `trialClaim()` |
| **Local ledger fallback** (localStorage + cookie, survives account deletion) | Bypass while the Worker is offline/undeployed | [trial.js](trial.js) `ledger()` |
| **Disposable-email block** | Throwaway inboxes (mailinator, 10minutemail, …) | [trial.js](trial.js) `isDisposableEmail()` |
| **Email verification before trial** | Trial handed out only after the address is confirmed | [trial.js](trial.js) `markPending()` / `autoClaim()` |

The client calls the server ledger (`/usage/trial-claim`) **first**; if it says
"already claimed" no trial is granted. The DB `start_trial()` is the second gate
(one-per-account). Both degrade gracefully to the local ledger when unconfigured.

---

## Current state: DEMO vs. ENFORCED

Out of the box both backends are placeholders in
[supabase-config.js](supabase-config.js), so:

- **Now (unconfigured):** the trial works, but the *only* gate is the local
  cookie/localStorage ledger — bypassable via incognito / another browser /
  clearing storage.
- **After the two steps below:** fingerprint + IP + device-id are enforced
  server-side and repeat accounts are genuinely blocked.

---

## Step 1 — Configure Supabase (one-per-account + verified email)

1. Create a project at <https://supabase.com>, then **Project Settings → API**:
   copy the **Project URL** and the **anon/public** key.
2. Paste both into [supabase-config.js](supabase-config.js) (`KOLKLI_SUPABASE`).
3. In the Supabase **SQL editor**, run [supabase-schema.sql](supabase-schema.sql)
   once. It creates the `trial_started_at` / `trial_ends_at` columns and the
   one-shot `start_trial()` RPC.
4. **Turn on email confirmation:** Supabase → **Authentication → Providers →
   Email → "Confirm email" = ON**. With this on, sign-up returns `confirm`, the
   forms stash a pending-trial intent (`markPending`), and the trial is granted
   only once that verified account signs in (`autoClaim` on the `kolkli:auth`
   event). No enforcement change is needed — it just works.

## Step 2 — Deploy the storage Worker (fingerprint + IP + one-per-device)

The `/usage/trial-claim` endpoint and the `UsageLimiter` Durable Object live in
the storage Worker.

```bash
cd worker
npm install
# fill in SUPABASE_URL + SUPABASE_ANON_KEY (and R2_* if you use uploads) in wrangler.toml
npx wrangler deploy
```

Then paste the deployed URL into [supabase-config.js](supabase-config.js):

```js
window.KOLKLI_WORKERS = {
  storage: 'https://kolkli-storage.<your-subdomain>.workers.dev',
  billing: '…',
  usage:   'YOUR_USAGE_WORKER_URL'   // leave as-is: /usage/* is served by `storage`
};
```

`KolkliUsage` automatically routes `/usage/*` (including `trial-claim`) to
`usage || storage`, so setting `storage` is enough.

Optional IP tuning (Worker vars): `USAGE_IP_BURST`, `USAGE_IP_DAILY`.

---

## Verify it works

1. **Happy path:** register a fresh email → land on the dashboard → the
   subscription card shows *"נותרו N ימים · ללא כרטיס אשראי"*; the same note
   appears under **Account Settings → Billing**.
2. **One-per-device:** sign out, delete the account, register a *different*
   email in the **same** browser → no second trial (stays Free).
3. **One-per-account:** call the trial path twice for the same user → the second
   call is a no-op (`start_trial()` returns the row unchanged).
4. **Disposable block:** try `x@mailinator.com` at sign-up → rejected inline.
5. **Verified-email:** with "Confirm email" ON, the plan flips to Creator only
   *after* the confirmation link is used and that account signs in.

---

## Expiry

Effective-plan readers already downgrade a finished trial to Free at read time
(the Worker's `userPlan()` and the browser's `trial.js` `sweep()`), so no cron is
strictly required. To also reset the stored column server-side, schedule the
`pg_cron` snippet at the bottom of [supabase-schema.sql](supabase-schema.sql).

## Known limits

Fingerprinting is probabilistic: a determined attacker rotating VPN IPs **and**
spoofing a fresh fingerprint per browser profile can still create new trials.
The layers above make that costly and stop the casual "clear cookies / new
email" bypass, which covers the overwhelming majority of abuse. For a hard cap,
add phone/SMS verification before `start_trial()` (not implemented here).
