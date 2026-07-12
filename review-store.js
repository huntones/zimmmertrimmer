/* ============================================================================
 * KOLKLI Review — shared client-side store (demo).
 *
 * Powers two pages that are mirror images of each other:
 *   - review.html : the account owner creates review projects, uploads
 *     materials, shares a private link, and reads back the client's feedback.
 *   - proof.html  : the end client opens the link and views the materials,
 *     leaves comments and approves / requests changes. No login.
 *
 * Like request-store.js this is a *local demo*: project metadata (incl. the
 * comments + decision) lives in localStorage and the uploaded blobs live in
 * IndexedDB, so both pages must run in the same browser. When a real server is
 * wired in, only this file changes — the pages talk to RV.* and don't care
 * where the bytes or the records live.
 *
 * Data shapes
 *   project  { token, name, client, message, brand, perms{comment,download,approve},
 *              password, expiresAt, createdAt, notify, status, activeVersion,
 *              maxVersion, items[], comments[], events[], decision }
 *   item     { id, name, ext, kind, size, at, version }
 *   comment  { id, itemId, author, body, at, tcode, page, decision, resolved }
 *   event    { type:'viewed'|'commented'|'approved'|'changes', at, who }
 *   decision { state:'approved'|'changes', by, at, version }
 *   blob     (IndexedDB, key = item.id) the actual File/Blob
 * ==========================================================================*/
(function () {
  'use strict';
  var RV = {};

  // ---------- tiny localStorage helpers ----------
  RV.ls = function (k) { try { return localStorage.getItem(k); } catch (_) { return null; } };
  RV.lsSet = function (k, v) { try { localStorage.setItem(k, v); } catch (_) {} };

  // Owner-scoped demo storage. The proof page may open without the owner
  // signed in, so a public token index points to the owning private array.
  function safeOwnerId(v) {
    return String(v || 'guest').toLowerCase().replace(/[^a-z0-9_.@-]+/g, '_') || 'guest';
  }
  function currentOwnerId() {
    var email = (RV.ls('ac_session') || '').toLowerCase();
    if (!email) return 'guest';
    try {
      var users = JSON.parse(RV.ls('ac_users') || '[]') || [];
      for (var i = 0; i < users.length; i++) {
        if ((users[i].email || '').toLowerCase() === email) return safeOwnerId(users[i].id || users[i].userId || email);
      }
    } catch (_) {}
    return safeOwnerId(email);
  }
  function scopedKey(base, owner) { return base + '::' + safeOwnerId(owner || currentOwnerId()); }
  function loadIndex() { try { return JSON.parse(RV.ls(INDEX_KEY) || '{}') || {}; } catch (_) { return {}; } }
  function saveIndex(idx) { RV.lsSet(INDEX_KEY, JSON.stringify(idx || {})); }
  function ownerForToken(token) {
    var idx = loadIndex();
    return idx[token] || currentOwnerId();
  }
  function readProjects(owner) {
    try {
      var a = JSON.parse(RV.ls(scopedKey(PROJ_KEY, owner)) || '[]');
      return Array.isArray(a) ? a : [];
    } catch (_) { return []; }
  }
  function writeProjects(owner, arr) {
    RV.lsSet(scopedKey(PROJ_KEY, owner), JSON.stringify(arr || []));
  }

  // ---------- projects (metadata) ----------
  var PROJ_KEY = 'rv_projects', INDEX_KEY = 'rv_project_owners';

  RV.loadProjects = function () {
    var owner = currentOwnerId();
    return readProjects(owner).filter(function (p) { return !p.ownerId || p.ownerId === owner; });
  };
  RV.saveProjects = function (arr) {
    var owner = currentOwnerId(), idx = loadIndex();
    (arr || []).forEach(function (p) { if (p && p.token) { p.ownerId = p.ownerId || owner; idx[p.token] = p.ownerId; } });
    writeProjects(owner, arr || []);
    saveIndex(idx);
    if (RV.remotePush) (arr || []).forEach(function (p) { if (p && p.token) RV.remotePush(p); });
  };
  RV.getProject = function (token) {
    var owner = ownerForToken(token);
    var a = readProjects(owner);
    for (var i = 0; i < a.length; i++) if (a[i].token === token) return a[i];
    a = readProjects(currentOwnerId());
    for (var j = 0; j < a.length; j++) if (a[j].token === token) return a[j];
    return null;
  };
  RV.upsertProjectLocal = function (proj) {
    var owner = proj.ownerId || ownerForToken(proj.token);
    proj.ownerId = owner;
    var a = readProjects(owner), found = false;
    for (var i = 0; i < a.length; i++) if (a[i].token === proj.token) { a[i] = proj; found = true; break; }
    if (!found) a.push(proj);
    writeProjects(owner, a);
    var idx = loadIndex(); idx[proj.token] = owner; saveIndex(idx);
  };
  RV.upsertProject = function (proj) {
    RV.upsertProjectLocal(proj);
    RV.remotePush(proj);          // fire-and-forget mirror to Supabase (no-op when unconfigured)
  };
  RV.deleteProject = function (token) {
    var proj = RV.getProject(token), owner = (proj && proj.ownerId) || ownerForToken(token), chain = Promise.resolve();
    if (proj && proj.items) proj.items.forEach(function (f) {
      chain = chain.then(function () { return RV.delBlob(f.id).catch(function () {}); });
    });
    return chain.then(function () {
      writeProjects(owner, readProjects(owner).filter(function (r) { return r.token !== token; }));
      var idx = loadIndex(); delete idx[token]; saveIndex(idx);
      var d = (window.KolkliDB && KolkliDB.enabled()) ? KolkliDB : null;
      if (d) { d.deleteProject('review', token); if (proj && proj.items) proj.items.forEach(function (f) { d.deleteBlob('review', token, f.id); }); }
    });
  };

  // ---------- IndexedDB blob store ----------
  function idb() {
    return new Promise(function (res, rej) {
      var r = indexedDB.open('kolkli_review', 1);
      r.onupgradeneeded = function () {
        if (!r.result.objectStoreNames.contains('blobs')) r.result.createObjectStore('blobs');
      };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }
  RV.putBlob = function (k, v) {
    return idb().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction('blobs', 'readwrite');
        tx.objectStore('blobs').put(v, k);
        tx.oncomplete = function () { res(); };
        tx.onerror = function () { rej(tx.error); };
      });
    });
  };
  RV.getBlob = function (k) {
    return idb().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction('blobs', 'readonly');
        var rq = tx.objectStore('blobs').get(k);
        rq.onsuccess = function () { res(rq.result); };
        rq.onerror = function () { rej(rq.error); };
      });
    });
  };
  RV.delBlob = function (k) {
    return idb().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction('blobs', 'readwrite');
        tx.objectStore('blobs').delete(k);
        tx.oncomplete = function () { res(); };
        tx.onerror = function () { rej(tx.error); };
      });
    });
  };

  // ---------- ids + password hashing (same scheme as send/request) ----------
  RV.randToken = function () {
    if (window.crypto && crypto.getRandomValues) {
      var a = new Uint8Array(9); crypto.getRandomValues(a);
      return Array.from(a).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    }
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  };
  RV.hashPass = function (str) {
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
  RV.fmtBytes = function (n) {
    if (n == null) return '—';
    if (n >= 1073741824) return (n / 1073741824).toFixed(2) + ' GB';
    if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MB';
    if (n >= 1024) return (n / 1024).toFixed(0) + ' KB';
    return n + ' B';
  };
  RV.extOf = function (name) { var m = (name || '').match(/\.([^.\/\\]+)$/); return m ? m[1].toLowerCase() : ''; };
  RV.TYPES = {
    image: ['jpg', 'jpeg', 'png', 'gif', 'heic', 'heif', 'webp', 'bmp', 'svg', 'avif'],
    video: ['mp4', 'mov', 'avi', 'webm', 'mkv', 'm4v'],
    audio: ['mp3', 'wav', 'aac', 'm4a', 'flac', 'ogg', 'oga', 'opus'],
    doc:   ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'rtf', 'zip', 'rar', '7z']
  };
  RV.kindOf = function (ext) {
    ext = (ext || '').toLowerCase();
    for (var k in RV.TYPES) if (RV.TYPES[k].indexOf(ext) >= 0) return k;
    return 'doc';
  };
  // A file is viewable inline (image / video / audio / pdf); everything else is download-only.
  RV.previewable = function (item) {
    return item.kind === 'image' || item.kind === 'video' || item.kind === 'audio' || item.ext === 'pdf';
  };
  RV.escapeHtml = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  // ---------- status ----------
  RV.isExpired = function (proj) { return !!(proj.expiresAt && Date.now() > proj.expiresAt); };
  // Display status: expiry and 'closed' override the tracked lifecycle status.
  RV.statusOf = function (proj) {
    if (proj.status === 'closed') return 'closed';
    if (RV.isExpired(proj)) return 'expired';
    return proj.status || 'draft';
  };
  // Items belonging to a given version (defaults to the active version).
  RV.itemsOfVersion = function (proj, v) {
    v = v || proj.activeVersion || 1;
    return (proj.items || []).filter(function (it) { return (it.version || 1) === v; });
  };
  RV.commentsOf = function (proj, itemId) {
    return (proj.comments || []).filter(function (c) { return c.itemId === itemId; });
  };
  RV.openComments = function (proj) {
    return (proj.comments || []).filter(function (c) { return !c.resolved && !c.decision; }).length;
  };
  // Most recent timestamp across creation, comments and events — drives "last activity".
  RV.lastActivity = function (proj) {
    var t = proj.createdAt || 0;
    (proj.comments || []).forEach(function (c) { if (c.at > t) t = c.at; });
    (proj.events || []).forEach(function (e) { if (e.at > t) t = e.at; });
    if (proj.decision && proj.decision.at > t) t = proj.decision.at;
    return t;
  };
  // Dominant media kind across a project's items (for a one-word type label).
  RV.mainKind = function (proj) {
    var counts = {}, best = null, n = 0;
    (proj.items || []).forEach(function (it) { counts[it.kind] = (counts[it.kind] || 0) + 1; if (counts[it.kind] > n) { n = counts[it.kind]; best = it.kind; } });
    return best;
  };

  // ---------- cross-tab notifications ----------
  RV.CHANNEL = 'kolkli_review';
  RV.post = function (msg) {
    try { if ('BroadcastChannel' in window) { var bc = new BroadcastChannel(RV.CHANNEL); bc.postMessage(msg); bc.close(); } } catch (_) {}
  };
  RV.listen = function (cb) {
    try {
      if ('BroadcastChannel' in window) {
        var bc = new BroadcastChannel(RV.CHANNEL);
        bc.onmessage = function (e) { cb(e.data || {}); };
        return bc;
      }
    } catch (_) {}
    return null;
  };

  // ---------- owner-scoped brand ----------
  RV.loadBrand = function () {
    var d = { name: '', tagline: '', logo: '', bg: '', color: '#57ab3f' };
    try { return Object.assign(d, JSON.parse(RV.ls(scopedKey('kolkli_brand')) || '{}')); } catch (_) { return d; }
  };
  RV.saveBrand = function (b) { RV.lsSet(scopedKey('kolkli_brand'), JSON.stringify(b || {})); };

  // ---------- language detection (matches header/send/request) ----------
  RV.detectLang = function () {
    var chosen = RV.ls('ac_lang'); if (chosen === 'he' || chosen === 'en' || chosen === 'ru') return chosen;
    var cc = RV.ls('ac_country'); if (cc) return cc === 'IL' ? 'he' : 'en';
    var tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (_) {}
    var navHe = (navigator.language || '').toLowerCase().indexOf('he') === 0;
    return (tz === 'Asia/Jerusalem' || navHe) ? 'he' : 'en';
  };

  // ---------- line icons (Feather-style, inherit currentColor) ----------
  RV.FICON = {
    image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/></svg>',
    video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m22 8-6 4 6 4V8Z"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>',
    audio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
    doc:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2v6h6"/><path d="M4 2h10l6 6v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/></svg>'
  };

  // ---------- backend mirror (Supabase, optional; no-op when unconfigured) ----------
  // Turns the single-browser demo into cross-device persistence: every project
  // is mirrored to a `projects` row (service 'review') and its blobs to Storage.
  // All of this collapses to nothing when supabase-config.js is unconfigured, so
  // the local demo keeps working exactly as before.
  RV.SERVICE = 'review';
  function db() { return (window.KolkliDB && KolkliDB.enabled()) ? KolkliDB : null; }

  RV.remotePush = function (proj) {
    var d = db(); if (d && proj && proj.token) d.pushProject('review', proj.token, proj, RV.statusOf(proj));
  };
  // Owner: pull my projects from the server into the local mirror; resolves the
  // merged local list. Instant + local-only when unconfigured.
  RV.pullMine = function () {
    var d = db(); if (!d) return Promise.resolve(RV.loadProjects());
    return d.pullService('review').then(function (recs) {
      (recs || []).forEach(function (r) { if (r && r.token) RV.upsertProjectLocal(r); });
      return RV.loadProjects();
    }).catch(function () { return RV.loadProjects(); });
  };
  // Any device / public link: pull ONE project by its token into the local mirror.
  RV.pullToken = function (token) {
    var d = db(); if (!d || !token) return Promise.resolve(RV.getProject(token));
    return d.pullToken('review', token).then(function (rec) {
      if (rec && rec.token) RV.upsertProjectLocal(rec);
      return RV.getProject(token);
    }).catch(function () { return RV.getProject(token); });
  };
  // Blob helpers that also mirror to / from Storage (token-scoped). Pages should
  // call these instead of putBlob/getBlob so bytes travel across devices.
  RV.saveItemBlob = function (token, id, blob) {
    return RV.putBlob(id, blob).then(function () {
      var d = db(); return (d && token) ? d.uploadBlob('review', token, id, blob) : null;
    });
  };
  RV.loadItemBlob = function (token, id) {
    return RV.getBlob(id).then(function (b) {
      if (b) return b;
      var d = db(); if (!d || !token) return null;
      return d.downloadBlob('review', token, id).then(function (rb) { if (rb) RV.putBlob(id, rb); return rb || null; });
    });
  };
  // Client (anonymous, on the proof link) writes — go through the token-gated
  // RPCs, and update the local cache so the page reflects the change at once.
  RV.clientAddComment = function (token, comment, event) {
    var p = RV.getProject(token);
    if (p) { p.comments = (p.comments || []).concat([comment]); if (event) p.events = (p.events || []).concat([event]); RV.upsertProjectLocal(p); }
    var d = db(); return d ? d.addComment('review', token, comment, event || null) : Promise.resolve(null);
  };
  RV.clientSetDecision = function (token, decision, status, event) {
    var p = RV.getProject(token);
    if (p) { p.decision = decision; if (status) p.status = status; if (event) p.events = (p.events || []).concat([event]); RV.upsertProjectLocal(p); }
    var d = db(); return d ? d.setDecision('review', token, decision, status || null, event || null) : Promise.resolve(null);
  };
  RV.clientAddEvent = function (token, event) {
    var p = RV.getProject(token);
    if (p) { p.events = (p.events || []).concat([event]); RV.upsertProjectLocal(p); }
    var d = db(); return d ? d.addEvent('review', token, event) : Promise.resolve(null);
  };

  window.RV = RV;
})();
