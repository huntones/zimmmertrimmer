# KOLKLI storage Worker (Phase 2 — R2 uploads)

A Cloudflare Worker that mints short-lived **presigned R2 URLs** so the
browser uploads/downloads files directly to storage. Bytes never pass
through the Worker; it only does auth + authorization + signing.

```
Browser ──(Supabase JWT)──▶ Worker  ──verify JWT + org membership──▶ Supabase
   │                          │
   │◀──── { uploadUrl } ──────┘  (presigned, 15-min expiry)
   └──────── PUT file ───────────────────────────────▶ Cloudflare R2
```

## Prerequisites
- The Supabase project + `supabase-orgs-schema.sql` already applied.
- Node 18+. From this folder: `npm install`.
- `npx wrangler login` (opens the browser once).

## 1. Create the R2 bucket
```bash
npx wrangler r2 bucket create kolkli-files
```

## 2. Create R2 API credentials (for signing)
Cloudflare dashboard → **R2 → Manage R2 API Tokens → Create API token**
(Object Read & Write). Copy the **Access Key ID** and **Secret Access
Key**, then store them as Worker secrets (never commit these):
```bash
npx wrangler secret put R2_ACCESS_KEY_ID
npx wrangler secret put R2_SECRET_ACCESS_KEY
```

## 3. Fill in the non-secret config
Edit `wrangler.toml`:
- `SUPABASE_URL`, `SUPABASE_ANON_KEY` — same values as `supabase-config.js`.
- `R2_ACCOUNT_ID` — dashboard → R2 → your account ID.
- `R2_BUCKET` — `kolkli-files`.
- `ALLOWED_ORIGIN` — your site origin (e.g. `https://kolkli.com`).

## 4. Let the browser PUT to R2 (bucket CORS)
The presigned upload is a cross-origin `PUT`, so the **bucket** needs a
CORS policy. Save this as `cors.json` and apply it:
```json
[
  {
    "AllowedOrigins": ["https://kolkli.com", "http://localhost:7000"],
    "AllowedMethods": ["PUT", "GET"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```
```bash
npx wrangler r2 bucket cors put kolkli-files --file cors.json
```

## 5. Deploy
```bash
npx wrangler deploy
```
You'll get a URL like `https://kolkli-storage.<subdomain>.workers.dev`.

## 6. Test
```bash
# Health (no auth):
curl https://kolkli-storage.<subdomain>.workers.dev/health   # {"ok":true}

# Get a presigned upload URL (needs a real Supabase JWT + an org you belong to):
curl -X POST https://kolkli-storage.<subdomain>.workers.dev/uploads \
  -H "authorization: Bearer <SUPABASE_ACCESS_TOKEN>" \
  -H "content-type: application/json" \
  -d '{"orgId":"<YOUR_ORG_UUID>","name":"test.mp3"}'
# → {"key":"org/<id>/<uuid>-test.mp3","uploadUrl":"https://...","expiresIn":900}

# Then upload the bytes straight to R2:
curl -X PUT "<uploadUrl>" --data-binary @test.mp3
```

## Using it from the browser
`KolkliAuth.getToken()` returns the JWT; send it to the Worker, then PUT
the file to the returned `uploadUrl`:
```js
async function uploadToR2(file, orgId) {
  const token = await KolkliAuth.getToken();
  const res = await fetch('https://kolkli-storage.<subdomain>.workers.dev/uploads', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
    body: JSON.stringify({ orgId, name: file.name, size: file.size, kind: file.type })
  }).then(r => r.json());
  await fetch(res.uploadUrl, { method: 'PUT', body: file });   // straight to R2
  return res.key;   // save this in the Supabase `files` table
}
```
Wiring this into `send.html` / the file organizer is the next step.

## Security notes
- Authorization is enforced by **Supabase RLS**: the Worker checks org
  membership using the caller's own token, so a user can only get URLs
  for orgs they belong to, and download keys are checked against the
  `org/<id>/…` prefix.
- Presigned URLs expire in 15 minutes.
- Lock `ALLOWED_ORIGIN` (Worker) and `AllowedOrigins` (bucket CORS) to
  your real domain before going live.
- Deploy this `worker/` folder as a **Worker**, not as part of the Pages
  static site — exclude it from your Pages output so its source isn't
  served publicly.
