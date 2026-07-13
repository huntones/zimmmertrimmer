/* ============================================================
   KOLKLI — Cloud file-picker keys (Google Drive / Dropbox / OneDrive).

   This is the ONE place you plug in the public app keys that turn the
   three cloud buttons on the upload form into REAL "import from the
   cloud" pickers. Until a provider's key is filled in, its button keeps
   showing the polite "coming soon" toast — nothing breaks, no network
   calls, no popups.

   Each key below is a PUBLIC client identifier (it is meant to ship in
   the browser). None of them is a secret — the provider protects the
   account with the OAuth consent screen + the domain allow-list you set
   up on their side, NOT by hiding the id. So it is safe to commit.

   HOW TO GET EACH KEY — full step-by-step in  CLOUD-PICKERS-SETUP.md
   (ships next to this file). Short version:

     • Google Drive  → Google Cloud Console: enable the "Google Picker
       API", create an API key + an OAuth 2.0 Web client id, and add
       your site to the client's "Authorized JavaScript origins".
     • Dropbox       → Dropbox App Console: create an app with the
       "Chooser" enabled and add your domain to its allow-list.
     • OneDrive      → Azure Portal → App registrations: register a
       single-page app and add your site URL as a redirect URI.

   Fill in only the providers you want live. Leave the rest as-is.
   ============================================================ */
(function () {
  window.KOLKLI_CLOUD_PICKERS = {

    // ---- Google Drive -------------------------------------------------
    google: {
      // API key from Google Cloud Console → APIs & Services → Credentials.
      apiKey:   'YOUR_GOOGLE_API_KEY',
      // OAuth 2.0 Client ID (type: Web application), same project.
      clientId: 'YOUR_GOOGLE_OAUTH_CLIENT_ID',
      // Optional but recommended: the project NUMBER (not the id), from
      // the project picker / "Project settings". Lets the picker grant
      // the app access to the exact files the user selects.
      appId:    'YOUR_GOOGLE_PROJECT_NUMBER'
    },

    // ---- Dropbox ------------------------------------------------------
    dropbox: {
      // "App key" from the Dropbox App Console → your app → Settings.
      appKey: 'YOUR_DROPBOX_APP_KEY'
    },

    // ---- OneDrive -----------------------------------------------------
    onedrive: {
      // "Application (client) ID" from Azure → App registrations.
      clientId:    'YOUR_ONEDRIVE_CLIENT_ID',
      // Optional. The page the OneDrive popup redirects back to; MUST be
      // registered as a redirect URI on the Azure app. Leave blank to use
      // this site's own origin (e.g. https://yourdomain.com/).
      redirectUri: ''
    }
  };

  // True only once THIS provider's required key(s) have been replaced
  // with real values. cloud-pickers.js calls this to decide whether the
  // button opens a real picker or falls back to "coming soon".
  window.KOLKLI_CLOUD_PICKERS.configured = function (provider) {
    var c = (window.KOLKLI_CLOUD_PICKERS || {})[provider];
    if (!c) return false;
    function ok(v) { return typeof v === 'string' && v && v.indexOf('YOUR_') !== 0; }
    if (provider === 'google')   return ok(c.apiKey) && ok(c.clientId);
    if (provider === 'dropbox')  return ok(c.appKey);
    if (provider === 'onedrive') return ok(c.clientId);
    return false;
  };
})();
