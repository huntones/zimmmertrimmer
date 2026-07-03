/* ============================================================================
 * KOLKLI Request — shared client-side store (demo).
 *
 * Powers two pages that are mirror images of each other:
 *   - request.html : the account owner creates upload requests and manages the
 *     files that come back.
 *   - upload.html  : the client opens a request link and uploads files. No login.
 *
 * Like send.html / download.html this is a *local demo*: request metadata lives
 * in localStorage and the uploaded blobs live in IndexedDB, so both pages must
 * run in the same browser. When a real server is wired in, only this file
 * changes — the pages talk to KR.* and don't care where the bytes are.
 *
 * Data shapes
 *   request  { token, name, desc, folder, types[], maxFileMB, maxCount,
 *              maxTotalMB, expiresAt, createdAt, password, thankYou, notify,
 *              status:'active'|'closed', submissions[], files[] }
 *   submission { id, name, phone, email, note, at, fileIds[] }
 *   file     { id, subId, name, ext, kind, size, at, seen }
 *   blob     (IndexedDB, key = file.id) the actual File/Blob
 * ==========================================================================*/
(function () {
  'use strict';
  var KR = {};

  // ---------- tiny localStorage helpers ----------
  KR.ls = function (k) { try { return localStorage.getItem(k); } catch (_) { return null; } };
  KR.lsSet = function (k, v) { try { localStorage.setItem(k, v); } catch (_) {} };

  // ---------- requests (metadata) ----------
  var REQ_KEY = 'kr_requests', FOLDER_KEY = 'kr_folders';

  KR.loadRequests = function () {
    try { var a = JSON.parse(KR.ls(REQ_KEY) || '[]'); return Array.isArray(a) ? a : []; }
    catch (_) { return []; }
  };
  KR.saveRequests = function (arr) { KR.lsSet(REQ_KEY, JSON.stringify(arr || [])); };
  KR.getRequest = function (token) {
    var a = KR.loadRequests();
    for (var i = 0; i < a.length; i++) if (a[i].token === token) return a[i];
    return null;
  };
  KR.upsertRequest = function (req) {
    var a = KR.loadRequests(), found = false;
    for (var i = 0; i < a.length; i++) if (a[i].token === req.token) { a[i] = req; found = true; break; }
    if (!found) a.push(req);
    KR.saveRequests(a);
  };
  KR.deleteRequest = function (token) {
    var req = KR.getRequest(token), chain = Promise.resolve();
    if (req && req.files) req.files.forEach(function (f) {
      chain = chain.then(function () { return KR.delBlob(f.id).catch(function () {}); });
    });
    return chain.then(function () {
      KR.saveRequests(KR.loadRequests().filter(function (r) { return r.token !== token; }));
    });
  };

  // ---------- target folders (self-contained labels) ----------
  KR.loadFolders = function () {
    try { var a = JSON.parse(KR.ls(FOLDER_KEY) || 'null'); if (Array.isArray(a) && a.length) return a; }
    catch (_) {}
    return ['Inbox'];
  };
  KR.saveFolders = function (arr) { KR.lsSet(FOLDER_KEY, JSON.stringify(arr || [])); };
  KR.addFolder = function (name) {
    name = (name || '').trim(); if (!name) return;
    var a = KR.loadFolders(); if (a.indexOf(name) < 0) { a.push(name); KR.saveFolders(a); }
  };

  // ---------- IndexedDB blob store ----------
  function idb() {
    return new Promise(function (res, rej) {
      var r = indexedDB.open('kolkli_req', 1);
      r.onupgradeneeded = function () {
        if (!r.result.objectStoreNames.contains('blobs')) r.result.createObjectStore('blobs');
      };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }
  KR.putBlob = function (k, v) {
    return idb().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction('blobs', 'readwrite');
        tx.objectStore('blobs').put(v, k);
        tx.oncomplete = function () { res(); };
        tx.onerror = function () { rej(tx.error); };
      });
    });
  };
  KR.getBlob = function (k) {
    return idb().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction('blobs', 'readonly');
        var rq = tx.objectStore('blobs').get(k);
        rq.onsuccess = function () { res(rq.result); };
        rq.onerror = function () { rej(rq.error); };
      });
    });
  };
  KR.delBlob = function (k) {
    return idb().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction('blobs', 'readwrite');
        tx.objectStore('blobs').delete(k);
        tx.oncomplete = function () { res(); };
        tx.onerror = function () { rej(tx.error); };
      });
    });
  };

  // ---------- ids + password hashing (same scheme as send/download) ----------
  KR.randToken = function () {
    if (window.crypto && crypto.getRandomValues) {
      var a = new Uint8Array(9); crypto.getRandomValues(a);
      return Array.from(a).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    }
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  };
  KR.hashPass = function (str) {
    return (async function () {
      try {
        if (window.crypto && crypto.subtle) {
          var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
          return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
        }
      } catch (_) {}
      var h = 5381; for (var i = 0; i < str.length; i++) { h = ((h << 5) + h) + str.charCodeAt(i); h |= 0; }
      return 'x' + (h >>> 0).toString(16);
    })();
  };

  // ---------- formatting + file typing ----------
  KR.fmtBytes = function (n) {
    if (n == null) return '—';
    if (n >= 1073741824) return (n / 1073741824).toFixed(2) + ' GB';
    if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MB';
    if (n >= 1024) return (n / 1024).toFixed(0) + ' KB';
    return n + ' B';
  };
  KR.extOf = function (name) { var m = (name || '').match(/\.([^.\/\\]+)$/); return m ? m[1].toLowerCase() : ''; };
  KR.TYPES = {
    image: ['jpg', 'jpeg', 'png', 'gif', 'heic', 'heif', 'webp', 'bmp', 'svg', 'avif'],
    video: ['mp4', 'mov', 'avi', 'webm', 'mkv', 'm4v'],
    audio: ['mp3', 'wav', 'aac', 'm4a', 'flac', 'ogg', 'oga', 'opus'],
    doc:   ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'rtf']
  };
  KR.kindOf = function (ext) {
    ext = (ext || '').toLowerCase();
    for (var k in KR.TYPES) if (KR.TYPES[k].indexOf(ext) >= 0) return k;
    return 'doc';
  };
  KR.escapeHtml = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  // ---------- status ----------
  KR.isExpired = function (req) { return !!(req.expiresAt && Date.now() > req.expiresAt); };
  KR.statusOf = function (req) {
    if (req.status === 'closed') return 'closed';
    if (KR.isExpired(req)) return 'expired';
    return 'active';
  };
  // whole-request aggregates
  KR.reqBytes = function (req) { return (req.files || []).reduce(function (a, f) { return a + (f.size || 0); }, 0); };
  KR.reqUnseen = function (req) { return (req.files || []).filter(function (f) { return !f.seen; }).length; };

  // ---------- cross-tab notifications ----------
  KR.CHANNEL = 'kolkli_req';
  KR.post = function (msg) {
    try { if ('BroadcastChannel' in window) { var bc = new BroadcastChannel(KR.CHANNEL); bc.postMessage(msg); bc.close(); } } catch (_) {}
  };
  KR.listen = function (cb) {
    try {
      if ('BroadcastChannel' in window) {
        var bc = new BroadcastChannel(KR.CHANNEL);
        bc.onmessage = function (e) { cb(e.data || {}); };
        return bc;
      }
    } catch (_) {}
    return null;
  };

  // ---------- language detection (matches header/send/download) ----------
  KR.detectLang = function () {
    var chosen = KR.ls('ac_lang'); if (chosen === 'he' || chosen === 'en' || chosen === 'ru') return chosen;
    var cc = KR.ls('ac_country'); if (cc) return cc === 'IL' ? 'he' : 'en';
    var tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (_) {}
    var navHe = (navigator.language || '').toLowerCase().indexOf('he') === 0;
    return (tz === 'Asia/Jerusalem' || navHe) ? 'he' : 'en';
  };

  // ---------- line icons (Feather-style, inherit currentColor) ----------
  KR.FICON = {
    image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/></svg>',
    video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m22 8-6 4 6 4V8Z"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>',
    audio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
    doc:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2v6h6"/><path d="M4 2h10l6 6v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/></svg>'
  };

  window.KR = KR;
})();
