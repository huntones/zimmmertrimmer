# KOLKLI — Everything you need to work with files

KOLKLI is a browser-first file platform: upload once, then edit, convert,
compress, organize and send. Editing runs locally in your browser — files only
leave your device when you choose to send or store them. Bilingual
(Hebrew/English) with light/dark themes.

Today the two live modules are the **audio editor** (`app.html`, formerly
"AudioCut": cut a clip / normalize loudness to 89/90/91 dB like MP3Gain /
convert / batch, exporting 320 kbps MP3) and the **local file organizer**
(`files.html`). Everything else on the homepage (image/video tools, converters,
AI Studio, send-large-files, accounts) is on the roadmap — see `SPEC.md`.

## Files
- `index.html` — the KOLKLI landing page (marketing homepage). Live tool cards
  link to `app.html` / `files.html`; roadmap tools are marked "Soon".
- `app.html` — the audio editor (cut / normalize / convert / batch). This is
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