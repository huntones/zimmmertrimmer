# Random 60s MP3 Cutter & Volume Normalizer — Web App

Cuts a random 60-second clip from each MP3 and balances loudness to 89/90/91 dB
(like MP3Gain), exporting 320 kbps MP3. Bilingual (Hebrew/English). Runs fully
in your browser — no file is uploaded, no internet needed at runtime.

## Files
- `index.html` — the landing page (marketing homepage). Every "Open the
  Editor" / upload button links to `app.html`.
- `app.html` — the actual editor (cut / normalize / convert / batch). This is
  the working tool.
- `vendor/` — the local FFmpeg + Essentia engines (ffmpeg.js, util.js,
  jszip.min.js, essentia-wasm/essentia.js). Everything runs from here; no CDN.
- `start.bat` (Windows) / `start.sh` (Mac/Linux) — one-click launcher (opens
  the landing page; click through to the editor from there)

## How to run
IMPORTANT: don't double-click index.html. Browsers block the audio engine on
file:// . Use the launcher, which starts a small LOCAL server (nothing leaves
your machine):

Windows: double-click `start.bat`
Mac/Linux: run `./start.sh`

Or manually, in this folder:
    python -m http.server 7000
then open http://localhost:7000/index.html

You'll land on the homepage — click "Open the Editor" to reach the app
(`app.html`). There, wait for the dot at the top to turn green ("Engine ready"
/ "המנוע מוכן"), drag in MP3s, pick your dB target, and click Start.

## Language (landing page)
The homepage picks its language by region: visitors from Israel get Hebrew,
everyone else gets English. It guesses instantly from the browser timezone /
locale (works offline), then confirms by IP via a tiny free lookup
(api.country.is — returns only a country code). If that's unreachable the guess
stands. A manual EN/עב toggle always wins and is remembered. The editor
(`app.html`) itself still makes no network calls.

## Hosting it online (optional)
Upload this whole folder to Netlify Drop, Cloudflare Pages, or GitHub Pages and
you get a shareable link that works with no local server.





how to push thecode

git add .
git commit -m "need ot add the commit about the feature or error"
git push