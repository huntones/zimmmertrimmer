# Cloud file pickers — setup guide

> **בעברית בקצרה:** שלושת הכפתורים בטופס ההעלאה (Google Drive / Dropbox / OneDrive)
> כבר מחוברים בקוד. כדי להפעיל כל אחד צריך רק *מפתח ציבורי* אחד מהספק, ולהדביק
> אותו בקובץ `cloud-pickers-config.js`. עד שמדביקים מפתח — הכפתור מציג "בקרוב"
> וכלום לא נשבר. המדריך למטה מסביר שלב-אחר-שלב מאיפה לוקחים כל מפתח.

The three cloud buttons on the upload form are **fully wired in code**. To turn a
provider on you only paste one or two **public** ids into
[`cloud-pickers-config.js`](cloud-pickers-config.js). No secret keys, nothing to
deploy. Each button that has no key keeps showing the polite "coming soon" toast.

- **What the user gets:** click a button → the provider's own picker opens → they
  choose files → the bytes download into the form exactly like a drag-and-drop.
- **Where the code lives:** [`cloud-pickers.js`](cloud-pickers.js) (the engine) +
  the three-line change in [`upload.html`](upload.html).
- **Where you paste keys:** [`cloud-pickers-config.js`](cloud-pickers-config.js).

Two origins matter everywhere below — register **both** wherever a provider asks
for allowed origins / redirect URIs:

| Where | Origin to register |
|-------|--------------------|
| Local testing | `http://localhost:7000` |
| Production | your real site, e.g. `https://yourdomain.com` |

---

## 1. Google Drive

Google needs **two** ids: an **API key** and an **OAuth Client ID**.

1. Go to <https://console.cloud.google.com/> and create (or pick) a project.
2. **Enable the API:** APIs & Services → **Library** → search **"Google Picker API"**
   → **Enable**.
3. **OAuth consent screen:** APIs & Services → **OAuth consent screen**. Choose
   **External**, fill app name + support email, **Save**. Under **Scopes** you do
   *not* need to add anything (the app uses the light `drive.file` scope). Add your
   own Google account under **Test users** while the app is unpublished, then
   optionally **Publish** it when you go live.
4. **Create the API key:** APIs & Services → **Credentials** → **Create
   credentials** → **API key**. Copy it. (Recommended: click the key → **Application
   restrictions → Websites** and add your two origins; **API restrictions → Restrict
   key → Google Picker API**.)
5. **Create the OAuth Client ID:** **Create credentials** → **OAuth client ID** →
   Application type **Web application**. Under **Authorized JavaScript origins** add
   both origins from the table above (`http://localhost:7000` and your production
   URL — **no trailing slash**). Create, then copy the **Client ID**.
6. **(Optional) Project number:** the project picker at the top of the console shows
   the numeric **Project number** — copy it into `appId`. It lets the picker grant
   the app access to exactly the files the user selects.
7. Paste into `cloud-pickers-config.js`:
   ```js
   google: {
     apiKey:   'AIza…',                       // step 4
     clientId: '1234567890-abc.apps.googleusercontent.com',  // step 5
     appId:    '1234567890'                   // step 6 (optional)
   }
   ```

> Google-native files (Docs/Sheets/Slides) have no raw bytes, so the picker
> exports them to **PDF** automatically. Regular files (images, audio, PDFs, zips…)
> download as-is.

---

## 2. Dropbox

Dropbox needs **one** id: an **App key**.

1. Go to <https://www.dropbox.com/developers/apps> → **Create app**.
2. Choose **Scoped access**, then **Full Dropbox** (or App folder — either works for
   the Chooser), name the app, **Create app**.
3. On the app's **Settings** tab, find **Chooser / Saver / Embedder domains** and add
   both origins from the table above (`localhost:7000` and your production domain).
4. Copy the **App key** from the top of the Settings tab.
5. Paste into `cloud-pickers-config.js`:
   ```js
   dropbox: { appKey: 'abcd1234efgh567' }
   ```

That's it — the Chooser works immediately, no OAuth consent screen to publish.

---

## 3. OneDrive

OneDrive needs **one** id: the Azure **Application (client) ID**.

1. Go to <https://portal.azure.com/> → **App registrations** → **New registration**.
2. Name it. Under **Supported account types** pick
   **"Accounts in any organizational directory and personal Microsoft accounts"**
   (so ordinary consumer OneDrive accounts can sign in).
3. Under **Redirect URI**, choose platform **Single-page application (SPA)** and add
   your production origin **with a trailing slash** (e.g. `https://yourdomain.com/`).
   Register, then add `http://localhost:7000/` too (Authentication → **Add a
   platform / Add URI**).
4. Copy the **Application (client) ID** from the app's **Overview**.
5. Paste into `cloud-pickers-config.js`:
   ```js
   onedrive: {
     clientId:    '00000000-0000-0000-0000-000000000000',
     redirectUri: ''   // leave blank → uses this site's origin + '/'
   }
   ```
   If your redirect URI is not simply `origin + '/'`, put the exact registered URL in
   `redirectUri` so it matches Azure.

---

## 4. Test it end-to-end

1. Start the local server: `python serve.py` → open
   `http://localhost:7000/upload` (add `?req=demo` for the standalone preview form).
2. Click a configured cloud button. You should see:
   - the provider's sign-in / picker popup,
   - a **"Importing from …"** toast while bytes download,
   - the picked files appear in the file list with the right names & sizes,
   - an **"Imported N files from …"** toast.
3. Verify the form's own limits still apply — an over-size or wrong-type file from the
   cloud is rejected with the same message as a local file (handled by `addFiles`).
4. **Error paths to sanity-check:** cancel the popup (stays quiet), block popups in the
   browser (shows the "popup blocked" toast), pick a Google Doc (arrives as a PDF).

### Common gotchas
- **Google "origin mismatch" / 400:** the exact origin (scheme + host + port, no
  trailing slash) must be in *Authorized JavaScript origins*. `localhost` ≠
  `127.0.0.1`.
- **Dropbox "not a valid origin":** the domain must be in the Chooser domains list;
  changes can take a minute to propagate.
- **OneDrive popup closes instantly:** the redirect URI must match exactly (trailing
  slash included) and be registered as a **SPA** platform.
- **Nothing happens / button says "coming soon":** the key still starts with `YOUR_`
  in `cloud-pickers-config.js`, or that file isn't loaded (it must sit next to
  `cloud-pickers.js`).

---

## 5. If you later enable Content-Security-Policy

The pickers load provider SDKs and download bytes cross-origin. There is **no CSP
active today** (it's commented out in [`_headers`](_headers)). If you turn one on,
extend these directives:

```
script-src  … https://apis.google.com https://accounts.google.com https://www.dropbox.com https://js.live.net ;
connect-src … https://www.googleapis.com https://accounts.google.com https://content.dropboxapi.com https://*.dropboxusercontent.com https://api.onedrive.com https://*.sharepoint.com https://*.files.1drv.com ;
frame-src   … https://accounts.google.com https://docs.google.com https://www.dropbox.com https://onedrive.live.com https://login.microsoftonline.com ;
```
(Only the providers you actually enable need their entries.)
