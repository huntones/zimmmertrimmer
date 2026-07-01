# Random 60s MP3 Cutter & Volume Normalizer — Web App

Cuts a random 60-second clip from each MP3 and balances loudness to 89/90/91 dB
(like MP3Gain), exporting 320 kbps MP3. Bilingual (Hebrew/English). Runs fully
in your browser — no file is uploaded, no internet needed at runtime.

## Files
- `index.html` — the app
- `vendor/` — the local FFmpeg engine (ffmpeg.js, 814.ffmpeg.js, util.js,
  ffmpeg-core.js, ffmpeg-core.wasm). Everything runs from here; no CDN.
- `start.bat` (Windows) / `start.sh` (Mac/Linux) — one-click launcher

## How to run
IMPORTANT: don't double-click index.html. Browsers block the audio engine on
file:// . Use the launcher, which starts a small LOCAL server (nothing leaves
your machine):

Windows: double-click `start.bat`
Mac/Linux: run `./start.sh`

Or manually, in this folder:
    python -m http.server 7000
then open http://localhost:7000/index.html

Wait for the dot at the top to turn green ("Engine ready" / "המנוע מוכן"),
drag in MP3s, pick your dB target, and click Start.

## Hosting it online (optional)
Upload this whole folder to Netlify Drop, Cloudflare Pages, or GitHub Pages and
you get a shareable link that works with no local server.
