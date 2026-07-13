/* ============================================================================
 * KOLKLI — cloud file pickers (Google Drive / Dropbox / OneDrive).
 *
 * window.CloudPickers is the single door the upload form uses to let a client
 * pick files straight out of their cloud storage. It:
 *   1. lazily loads the provider's own JS SDK from the provider CDN,
 *   2. runs the provider's OAuth + native picker UI,
 *   3. downloads the bytes of every picked file into a real File object,
 *   4. resolves an array of { file, path } — the EXACT shape upload.html's
 *      addFiles() already accepts (same as a drag-drop or a file <input>).
 *
 * SAFE BY DEFAULT: if a provider has no real key in cloud-pickers-config.js,
 * CloudPickers.enabled(provider) is false and the button falls back to the
 * "coming soon" toast. Nothing here runs — no SDK, no popup, no network.
 *
 * Public API:
 *   CloudPickers.enabled(provider)      -> bool   (key present & valid?)
 *   CloudPickers.anyEnabled()           -> bool
 *   CloudPickers.label(provider)        -> 'Google Drive' | ...
 *   CloudPickers.text(lang)             -> localized toast strings
 *   CloudPickers.open(provider, opts)   -> Promise<[{file, path}]>
 *        opts.onProgress(count)  called once with the number of picked files,
 *                                just before their bytes start downloading.
 *        Resolves []          on cancel / nothing picked.
 *        Rejects Error('cancelled')      user closed the auth popup.
 *        Rejects Error('popup-blocked')  the browser blocked the popup.
 *        Rejects Error('not-configured') provider has no key.
 *        Rejects any other Error         SDK load / auth / everything failed.
 *
 *   provider ∈ 'google' | 'dropbox' | 'onedrive'
 *
 * Requires: cloud-pickers-config.js loaded before this file.
 * ==========================================================================*/
(function () {
  'use strict';
  if (window.CloudPickers) return;                     // guard double-load

  var LABEL = { google: 'Google Drive', dropbox: 'Dropbox', onedrive: 'OneDrive' };

  function root() { return window.KOLKLI_CLOUD_PICKERS || null; }
  function cfg(provider) { var r = root(); return (r && r[provider]) || null; }
  function configured(provider) {
    var r = root();
    return !!(r && typeof r.configured === 'function' && r.configured(provider));
  }

  // ---------- lazy, de-duplicated external script loader ----------
  var scriptCache = {};
  function loadScript(src, attrs) {
    if (scriptCache[src]) return scriptCache[src];
    scriptCache[src] = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src; s.async = true;
      if (attrs) { for (var k in attrs) if (attrs.hasOwnProperty(k)) s.setAttribute(k, attrs[k]); }
      s.onload = function () { res(); };
      s.onerror = function () { scriptCache[src] = null; rej(new Error('failed to load ' + src)); };
      document.head.appendChild(s);
    });
    return scriptCache[src];
  }

  // ---------- fetch a URL into a named File ----------
  function toFile(url, name, type, headers) {
    var init = headers ? { headers: headers } : undefined;
    return fetch(url, init).then(function (r) {
      if (!r.ok) throw new Error('download failed (' + r.status + ')');
      return r.blob();
    }).then(function (blob) {
      return new File([blob], name || 'file',
        { type: type || blob.type || 'application/octet-stream' });
    });
  }

  // Resolve every download promise; keep only the ones that succeeded so a
  // single bad file never sinks the whole batch. Never rejects.
  function settleFiles(proms) {
    return Promise.all(proms.map(function (p) {
      return p.then(function (v) { return v; }, function (e) {
        try { console.warn('[cloud] file skipped:', (e && e.message) || e); } catch (_) {}
        return null;
      });
    })).then(function (arr) { return arr.filter(Boolean); });
  }

  /* ===================== Google Drive ===================== */
  var GAPI_JS = 'https://apis.google.com/js/api.js';
  var GIS_JS  = 'https://accounts.google.com/gsi/client';
  var gTokenClient = null, gToken = null;

  function googleToken(clientId) {
    return new Promise(function (resolve, reject) {
      if (gToken) { resolve(gToken); return; }
      try {
        var cb = function (resp) {
          if (resp && resp.access_token) { gToken = resp.access_token; resolve(gToken); }
          else { reject(new Error('Google authorization failed')); }
        };
        var errcb = function (err) {
          var ty = err && err.type;
          if (ty === 'popup_closed') reject(new Error('cancelled'));
          else reject(new Error(ty === 'popup_failed_to_open' ? 'popup-blocked'
                                                              : (err && err.message) || 'Google auth error'));
        };
        if (!gTokenClient) {
          gTokenClient = google.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: 'https://www.googleapis.com/auth/drive.file',
            callback: cb, error_callback: errcb
          });
        } else {
          gTokenClient.callback = cb;
        }
        gTokenClient.requestAccessToken({ prompt: '' });
      } catch (e) { reject(e); }
    });
  }

  function googleDownload(doc, clientId) {
    var id = doc.id, name = doc.name || 'file', mime = doc.mimeType || '';
    var url, headers = { Authorization: 'Bearer ' + gToken };
    if (mime.indexOf('application/vnd.google-apps') === 0) {
      // native Google Doc/Sheet/Slide — has no raw bytes; export to PDF.
      url = 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(id) +
            '/export?mimeType=application%2Fpdf';
      if (!/\.pdf$/i.test(name)) name += '.pdf';
      mime = 'application/pdf';
    } else {
      url = 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(id) + '?alt=media';
    }
    return toFile(url, name, mime, headers).then(function (f) {
      return { file: f, path: name };
    }).catch(function (e) {
      // token may have expired mid-session — refresh once and retry.
      if (gToken && /\(401\)/.test(String(e && e.message))) {
        gToken = null;
        return googleToken(clientId).then(function () {
          headers.Authorization = 'Bearer ' + gToken;
          return toFile(url, name, mime, headers).then(function (f) { return { file: f, path: name }; });
        });
      }
      throw e;
    });
  }

  function openGoogle(opts) {
    var c = cfg('google');
    return Promise.all([loadScript(GAPI_JS), loadScript(GIS_JS)])
      .then(function () { return new Promise(function (res) { gapi.load('picker', { callback: res }); }); })
      .then(function () { return googleToken(c.clientId); })
      .then(function () {
        return new Promise(function (resolve, reject) {
          var view = new google.picker.DocsView(google.picker.ViewId.DOCS)
            .setIncludeFolders(true).setSelectFolderEnabled(false);
          var b = new google.picker.PickerBuilder()
            .setOAuthToken(gToken)
            .setDeveloperKey(c.apiKey)
            .addView(view)
            .addView(new google.picker.DocsUploadView())
            .enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
            .setCallback(function (data) {
              var act = data[google.picker.Response.ACTION];
              if (act === google.picker.Action.PICKED) {
                var docs = data[google.picker.Response.DOCUMENTS] || [];
                if (opts.onProgress) opts.onProgress(docs.length);
                settleFiles(docs.map(function (d) { return googleDownload(d, c.clientId); })).then(resolve, reject);
              } else if (act === google.picker.Action.CANCEL) {
                resolve([]);
              }
            });
          if (ok(c.appId)) b.setAppId(c.appId);
          b.build().setVisible(true);
        });
      });
  }

  /* ===================== Dropbox ===================== */
  var DROPBOX_JS = 'https://www.dropbox.com/static/api/2/dropins.js';

  function openDropbox(opts) {
    var c = cfg('dropbox');
    return loadScript(DROPBOX_JS, { id: 'dropboxjs', 'data-app-key': c.appKey }).then(function () {
      return new Promise(function (resolve, reject) {
        if (!window.Dropbox || !Dropbox.choose) { reject(new Error('Dropbox SDK unavailable')); return; }
        Dropbox.choose({
          linkType: 'direct',        // a temporary direct link we can fetch bytes from
          multiselect: true,
          success: function (sel) {
            sel = sel || [];
            if (!sel.length) { resolve([]); return; }
            if (opts.onProgress) opts.onProgress(sel.length);
            settleFiles(sel.map(function (f) {
              return toFile(f.link, f.name).then(function (file) { return { file: file, path: f.name }; });
            })).then(resolve, reject);
          },
          cancel: function () { resolve([]); }
        });
      });
    });
  }

  /* ===================== OneDrive ===================== */
  var ONEDRIVE_JS = 'https://js.live.net/v7.1/OneDrive.js';

  function openOneDrive(opts) {
    var c = cfg('onedrive');
    return loadScript(ONEDRIVE_JS).then(function () {
      return new Promise(function (resolve, reject) {
        if (!window.OneDrive || !OneDrive.open) { reject(new Error('OneDrive SDK unavailable')); return; }
        OneDrive.open({
          clientId: c.clientId,
          action: 'download',                       // gives each item a @microsoft.graph.downloadUrl
          multiSelect: true,
          advanced: { redirectUri: (c.redirectUri && c.redirectUri.indexOf('http') === 0)
                                     ? c.redirectUri : (location.origin + '/') },
          success: function (resp) {
            var items = (resp && resp.value) || [];
            if (!items.length) { resolve([]); return; }
            if (opts.onProgress) opts.onProgress(items.length);
            settleFiles(items.map(function (it) {
              var url = it['@microsoft.graph.downloadUrl'] || it['@content.downloadUrl'];
              var mime = (it.file && it.file.mimeType) || '';
              return toFile(url, it.name, mime).then(function (file) { return { file: file, path: it.name }; });
            })).then(resolve, reject);
          },
          cancel: function () { resolve([]); },
          error: function (e) { reject(new Error((e && e.message) || 'OneDrive error')); }
        });
      });
    });
  }

  function ok(v) { return typeof v === 'string' && v && v.indexOf('YOUR_') !== 0; }

  var OPENERS = { google: openGoogle, dropbox: openDropbox, onedrive: openOneDrive };

  /* ===================== localized toast strings ===================== */
  var TEXT = {
    he: {
      importing:    function (n) { return 'מייבא מ־' + n + '…'; },
      imported:     function (k, n) { return 'יובאו ' + k + ' קבצים מ־' + n; },
      error:        function (n) { return 'הייבוא מ־' + n + ' נכשל, נסו שוב'; },
      popupBlocked: 'החלון הקופץ נחסם — אפשרו חלונות קופצים ונסו שוב'
    },
    en: {
      importing:    function (n) { return 'Importing from ' + n + '…'; },
      imported:     function (k, n) { return 'Imported ' + k + ' file' + (k === 1 ? '' : 's') + ' from ' + n; },
      error:        function (n) { return 'Import from ' + n + ' failed, please try again'; },
      popupBlocked: 'The popup was blocked — allow popups and try again'
    },
    ru: {
      importing:    function (n) { return 'Импорт из ' + n + '…'; },
      imported:     function (k, n) { return 'Импортировано файлов из ' + n + ': ' + k; },
      error:        function (n) { return 'Не удалось импортировать из ' + n + ', попробуйте снова'; },
      popupBlocked: 'Всплывающее окно заблокировано — разрешите его и повторите'
    }
  };

  window.CloudPickers = {
    label: function (p) { return LABEL[p] || p; },
    enabled: function (p) { return configured(p); },
    anyEnabled: function () { return ['google', 'dropbox', 'onedrive'].some(configured); },
    text: function (lang) { return TEXT[lang] || TEXT.en; },
    open: function (provider, opts) {
      opts = opts || {};
      if (!configured(provider)) return Promise.reject(new Error('not-configured'));
      var fn = OPENERS[provider];
      if (!fn) return Promise.reject(new Error('unknown provider'));
      try { return fn(opts); } catch (e) { return Promise.reject(e); }
    }
  };
})();
