/* ============================================================
   KOLKLI — Supabase connection settings.

   This is the ONE place you plug in your real backend. Until you
   fill in a real URL + anon key below, the whole site keeps using
   the local demo store (localStorage) exactly as before — nothing
   breaks, no network calls, no accounts on a server.

   HOW TO CONNECT (3 steps):
     1. Create a free project at https://supabase.com  →  Project Settings
        →  Data API / API Keys. Copy the "Project URL" and the
        "anon / public" key.
     2. Paste them below (replace the two YOUR_… placeholders).
     3. Open the Supabase SQL editor and run the whole of
        `supabase-schema.sql` (ships next to this file) once.

   That's it — sign-up / sign-in on auth.html and the header popup
   now create real accounts that work across every browser and
   device. The anon key is PUBLIC by design (it only allows what the
   Row-Level-Security policies in the schema allow), so it is safe to
   commit and ship to the browser.

   NOTE: audio/file editing still runs 100% in the browser. Only the
   account + file/link metadata ever touches the server.
   ============================================================ */
(function () {
  window.KOLKLI_SUPABASE = {
    // e.g. 'https://abcdxyz.supabase.co'
    url: 'YOUR_SUPABASE_URL',
    // the long public "anon" key (starts with 'ey…' or 'sb_publishable_…')
    anonKey: 'YOUR_SUPABASE_ANON_KEY'
  };

  // True only once both values have been replaced with real ones.
  window.KOLKLI_SUPABASE.configured = function () {
    var c = window.KOLKLI_SUPABASE;
    return !!(c && c.url && c.anonKey &&
      c.url.indexOf('YOUR_') !== 0 &&
      c.anonKey.indexOf('YOUR_') !== 0 &&
      c.url.indexOf('supabase') > -1);
  };

  // Cloudflare Worker URLs (Phase 2/3). Paste the deployed *.workers.dev
  // (or custom-domain) URLs here. While left as placeholders, the site
  // uses its client-side fallbacks (local storage demo / the pricing page).
  //   storage → worker/         (R2 uploads)
  //   billing → worker-billing/ (Stripe checkout + portal)
  window.KOLKLI_WORKERS = {
    storage: 'YOUR_STORAGE_WORKER_URL',
    billing: 'YOUR_BILLING_WORKER_URL'
  };
  // Returns a usable worker base URL (no trailing slash) or '' if unset.
  window.kolkliWorker = function (name) {
    var w = (window.KOLKLI_WORKERS || {})[name] || '';
    return (w && w.indexOf('YOUR_') !== 0) ? w.replace(/\/+$/, '') : '';
  };
})();
