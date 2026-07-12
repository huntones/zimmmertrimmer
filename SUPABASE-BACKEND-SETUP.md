# KOLKLI — Real backend setup (cross-device file persistence)

This wires the four file services (**received / approval / sent / selection**) to a
real backend so files, approvals, comments, selections and statuses are saved in a
database and stay available after refresh, logout, reopening a project **and from any
other device**.

- **Metadata** (projects, files list, comments, approvals, selections, statuses) → **Supabase Postgres**
- **File bytes** (the actual audio/image/video/pdf) → **Supabase Storage** (bucket `kolkli-files`)
- Until you finish the steps below, the site keeps working exactly as today on the
  **local demo** (localStorage + IndexedDB, single browser). Nothing breaks in the meantime.

You only have to do this **once**.

---

## Step 1 — Create a Supabase project
1. Go to <https://supabase.com> → sign in → **New project**.
2. Pick a name + a strong database password (you won't need the password in the app).
3. Wait ~2 minutes for it to provision.

## Step 2 — Get your keys
Project → **Settings → Data API** (or **API Keys**). Copy:
- **Project URL** — e.g. `https://abcdxyz.supabase.co`
- **anon / public key** — a long string starting `ey…` or `sb_publishable_…`
  (this key is public by design — it can only do what the RLS policies allow).

## Step 3 — Paste them into the app
Open **`supabase-config.js`** and replace the two placeholders:
```js
window.KOLKLI_SUPABASE = {
  url:     'https://abcdxyz.supabase.co',      // ← your Project URL
  anonKey: 'ey…'                               // ← your anon/public key
};
```
That single edit flips the whole site from demo mode to the real backend.

## Step 4 — Run the SQL (two files, in order)
Supabase → **SQL Editor → New query**, paste the **entire** file, **Run**. Do both:
1. `supabase-schema.sql`          (profiles, auth trigger, project-number RPCs — base)
2. `supabase-projects-schema.sql` (the `projects` table, RLS, token RPCs, Storage policies)

If you already ran `supabase-schema.sql` before, just run the second one.

## Step 5 — Create the Storage bucket
Supabase → **Storage → New bucket**:
- **Name:** `kolkli-files`  (exact spelling — the app uses this name)
- **Public bucket:** **ON**
- **Save**

> The bucket is public-read on purpose: a share link's unguessable `token` is the
> access secret, matching how the demo already treats "whoever has the link". The
> Storage **write** policies (from Step 4) still restrict uploads — signed-in owners
> can write anywhere, anonymous client links can only upload under `receive/…` and
> `review/…`. If you later want per-token **download** gating too, switch the bucket
> to private and add an Edge Function that mints signed URLs (noted in the SQL).

## Step 6 — Reload the site
Hard-refresh (Ctrl/Cmd-Shift-R). From now on:
- Sign-up / sign-in create **real accounts** that work across devices.
- Every file you upload, every approval / comment / selection / status is written to
  Postgres + Storage and **re-read on load** — on this device and any other.

---

## How to verify it's live
1. Sign in on device A, create a review project (approval) and upload a file.
2. In Supabase → **Table Editor → `projects`** you should see a row with
   `service = 'review'` and your record inside `data`. In **Storage → kolkli-files**
   you should see `review/<token>/<fileId>`.
3. Open the same account (or the client link) on device B / another browser → the
   project, its file, comments and approval state all load. ✅

## Data model at a glance
| Browser store | `service` | Storage path prefix |
|---|---|---|
| `KR`  (request-store.js)   | `receive` | `receive/<token>/…` |
| `RV`  (review-store.js)    | `review`  | `review/<token>/…`  |
| send store (send.html)     | `send`    | `send/<token>/…`    |
| select store (files.html)  | `select`  | `select/<token>/…`  |

Each `projects` row's `data` column is the **exact JSON record** the browser store
holds (minus the blobs). That's the "backend seam": the pages don't change how they
think about a project — `kolkli-db.js` just mirrors that record to Postgres/Storage
and back.

## Rollback
Delete the two lines you pasted in `supabase-config.js` (restore the `YOUR_…`
placeholders). The site instantly reverts to the local demo. Your Supabase data stays
untouched and reactivates the moment you paste the keys back.
