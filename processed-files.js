/* ============================================================================
 * KOLKLI processed files history.
 *
 * Captures generated blob downloads from tool pages and stores the result for
 * later download from the dashboard. Metadata is owner-scoped localStorage;
 * file bytes live in IndexedDB. A future server implementation can keep this
 * public API and replace the storage internals.
 * ========================================================================== */
(function () {
  'use strict';

  if (window.KolkliProcessedFiles) return;

  var API = {};
  var META_KEY = 'kpf_processed_files';
  var DB_NAME = 'kolkli_processed_files';
  var STORE = 'blobs';
  var CHANNEL = 'kolkli_processed_files';
  var MAX_FETCH_BYTES = 300 * 1024 * 1024;
  var savingUrls = Object.create(null);

  // Keyed by extensionless page stem so the lookup works on clean URLs (/dashboard)
  // and legacy .html URLs alike (currentFile() strips the extension before lookup).
  var TRACKABLE_SKIP = {
    'dashboard': 1,
    'download': 1,
    'proof': 1,
    'upload': 1,
    'select': 1,
    'send': 1,
    'request': 1,
    'review': 1,
    'files': 1,
    'auth': 1,
    'admin': 1,
    'checkout': 1,
    'index': 1
  };

  var ACTION_BY_PAGE = [
    [/compress/i, 'Compression'],
    [/convert/i, 'Conversion'],
    [/resize/i, 'Resize'],
    [/crop/i, 'Crop'],
    [/merge/i, 'Merge'],
    [/extract/i, 'Audio extraction'],
    [/mp4-to-mp3/i, 'Audio extraction'],
    [/normalize/i, 'Loudness normalize'],
    [/audio-editor/i, 'Audio edit'],
    [/video-cut/i, 'Video cut'],
    [/watermark/i, 'Watermark'],
    [/remove-bg/i, 'Background removal'],
    [/restore-image/i, 'Image restore'],
    [/ai-object-remover/i, 'Object removal'],
    [/ai-smart-crop/i, 'Smart crop'],
    [/ai-audio-cleanup/i, 'Audio cleanup'],
    [/ai-master/i, 'AI mastering'],
    [/ai-summarize-pdf/i, 'AI summary'],
    [/subtitle/i, 'Subtitle generation']
  ];

  var EXT_CATEGORY = {
    mp3: 'audio', wav: 'audio', aac: 'audio', m4a: 'audio', flac: 'audio', ogg: 'audio', oga: 'audio', opus: 'audio',
    mp4: 'video', mov: 'video', avi: 'video', webm: 'video', mkv: 'video', m4v: 'video',
    jpg: 'images', jpeg: 'images', png: 'images', gif: 'images', webp: 'images', bmp: 'images', svg: 'images', avif: 'images', heic: 'images', heif: 'images',
    pdf: 'documents', doc: 'documents', docx: 'documents', xls: 'documents', xlsx: 'documents', ppt: 'documents', pptx: 'documents',
    txt: 'documents', csv: 'documents', rtf: 'documents', zip: 'documents', rar: 'documents', '7z': 'documents', epub: 'documents'
  };

  function ls(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }
  function safeOwnerId(v) {
    return String(v || 'guest').toLowerCase().replace(/[^a-z0-9_.@-]+/g, '_') || 'guest';
  }
  function currentOwnerId() {
    var email = (ls('ac_session') || '').toLowerCase();
    if (!email) return 'guest';
    try {
      var users = JSON.parse(ls('ac_users') || '[]') || [];
      for (var i = 0; i < users.length; i++) {
        if ((users[i].email || '').toLowerCase() === email) return safeOwnerId(users[i].id || users[i].userId || email);
      }
    } catch (_) {}
    return safeOwnerId(email);
  }
  function scopedKey(k, owner) { return k + '::' + safeOwnerId(owner || currentOwnerId()); }
  function currentPlan() {
    var email = (ls('ac_session') || '').toLowerCase();
    var plan = '';
    try {
      var users = JSON.parse(ls('ac_users') || '[]') || [];
      for (var i = 0; i < users.length; i++) {
        if ((users[i].email || '').toLowerCase() === email) { plan = users[i].plan || ''; break; }
      }
    } catch (_) {}
    plan = String(plan || ls('ac_plan') || 'free').toLowerCase();
    if (plan === 'lite') plan = 'creator';
    if (plan === 'pro' || plan === 'business') plan = 'studio';
    return (plan === 'creator' || plan === 'studio') ? plan : 'free';
  }
  function limits(plan) {
    plan = plan || currentPlan();
    if (plan === 'studio') return { keepDays: 365, max: 1000 };
    if (plan === 'creator') return { keepDays: 90, max: 250 };
    return { keepDays: 7, max: 50 };
  }
  function readMeta(owner) {
    try {
      var a = JSON.parse(ls(scopedKey(META_KEY, owner)) || '[]');
      return Array.isArray(a) ? a : [];
    } catch (_) { return []; }
  }
  function writeMeta(arr, owner) { lsSet(scopedKey(META_KEY, owner), JSON.stringify(arr || [])); }

  function idb() {
    return new Promise(function (res, rej) {
      var r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = function () {
        if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE);
      };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }
  function putBlob(key, blob) {
    return idb().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(blob, key);
        tx.oncomplete = function () { res(); };
        tx.onerror = function () { rej(tx.error); };
      });
    });
  }
  function getBlob(key) {
    return idb().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction(STORE, 'readonly');
        var rq = tx.objectStore(STORE).get(key);
        rq.onsuccess = function () { res(rq.result || null); };
        rq.onerror = function () { rej(rq.error); };
      });
    });
  }
  function delBlob(key) {
    return idb().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(key);
        tx.oncomplete = function () { res(); };
        tx.onerror = function () { rej(tx.error); };
      });
    });
  }

  function extOf(name) {
    var m = String(name || '').toLowerCase().match(/\.([^.\/\\]+)$/);
    return m ? m[1] : '';
  }
  function categoryOf(name, type) {
    type = String(type || '').toLowerCase();
    if (type.indexOf('audio/') === 0) return 'audio';
    if (type.indexOf('video/') === 0) return 'video';
    if (type.indexOf('image/') === 0) return 'images';
    return EXT_CATEGORY[extOf(name)] || 'documents';
  }
  function currentFile() {
    // Extensionless page stem, so it matches on clean URLs (/compress-image) and
    // legacy .html URLs alike. 'index' for the site root / directory index pages.
    return (location.pathname.split('/').pop() || 'index').toLowerCase().replace(/\.html$/, '');
  }
  function toolNameFromPage(page) {
    return String(page || currentFile()).replace(/\.html$/i, '').replace(/[-_]+/g, ' ').replace(/\b\w/g, function (m) { return m.toUpperCase(); });
  }
  function actionFromPage(page) {
    page = page || currentFile();
    for (var i = 0; i < ACTION_BY_PAGE.length; i++) {
      if (ACTION_BY_PAGE[i][0].test(page)) return ACTION_BY_PAGE[i][1];
    }
    return toolNameFromPage(page);
  }
  function id() {
    if (window.crypto && window.crypto.getRandomValues) {
      var a = new Uint8Array(10); window.crypto.getRandomValues(a);
      return Array.prototype.map.call(a, function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    }
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }
  function isExpired(rec, now) {
    if (rec && rec.saved) return false; // saved files never expire (retention timer voided)
    return !!(rec && rec.expiresAt && (now || Date.now()) > rec.expiresAt);
  }
  function emit() {
    try { window.dispatchEvent(new CustomEvent('kolkli:processed-files')); } catch (_) {}
    try {
      if ('BroadcastChannel' in window) {
        var bc = new BroadcastChannel(CHANNEL);
        bc.postMessage({ type: 'changed' });
        bc.close();
      }
    } catch (_) {}
  }
  function prune(owner) {
    owner = owner || currentOwnerId();
    var lim = limits();
    var now = Date.now();
    var keep = [];
    var drop = [];
    var unsavedKept = 0; // only unsaved files count against the plan cap
    readMeta(owner).sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); }).forEach(function (rec) {
      if (rec.saved) { keep.push(rec); return; } // saved: kept regardless of age or cap
      if (isExpired(rec, now) || unsavedKept >= lim.max) { drop.push(rec); return; }
      keep.push(rec); unsavedKept++;
    });
    if (drop.length) {
      writeMeta(keep, owner);
      drop.forEach(function (r) { delBlob(r.blobKey || r.id).catch(function () {}); });
    }
    return keep;
  }

  API.list = function (opts) {
    opts = opts || {};
    var owner = opts.owner || currentOwnerId();
    var arr = prune(owner);
    if (opts.category && opts.category !== 'all') arr = arr.filter(function (r) { return r.category === opts.category; });
    return arr.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
  };
  API.getLimits = limits;
  API.categoryOf = categoryOf;
  API.save = function (blob, meta) {
    meta = meta || {};
    if (!window.indexedDB) return Promise.resolve(null);
    if (!blob || !blob.size) return Promise.resolve(null);
    if (blob.size > MAX_FETCH_BYTES) return Promise.resolve(null);
    var owner = currentOwnerId();
    var plan = currentPlan();
    var lim = limits(plan);
    var now = Date.now();
    var rec = {
      id: id(),
      ownerId: owner,
      name: meta.name || 'processed-file',
      action: meta.action || actionFromPage(meta.page),
      tool: meta.tool || toolNameFromPage(meta.page),
      sourcePage: meta.page || currentFile(),
      category: meta.category || categoryOf(meta.name, blob.type),
      type: blob.type || meta.type || '',
      size: blob.size || 0,
      createdAt: now,
      expiresAt: now + lim.keepDays * 86400000,
      planAtSave: plan
    };
    rec.blobKey = rec.id;
    return putBlob(rec.blobKey, blob).then(function () {
      var arr = readMeta(owner);
      arr.unshift(rec);
      writeMeta(arr, owner);
      prune(owner);
      emit();
      return rec;
    }).catch(function () { return null; });
  };
  API.download = function (recOrId) {
    var rec = typeof recOrId === 'string'
      ? API.list({ category: 'all' }).filter(function (r) { return r.id === recOrId; })[0]
      : recOrId;
    if (!rec) return Promise.resolve({ ok: false, reason: 'missing' });
    if (isExpired(rec)) return Promise.resolve({ ok: false, reason: 'expired' });
    return getBlob(rec.blobKey || rec.id).then(function (blob) {
      if (!blob) return { ok: false, reason: 'missing_blob' };
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = rec.name || 'processed-file';
      a.setAttribute('data-kpf-skip', '1');
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      return { ok: true };
    });
  };
  // Read the stored bytes without triggering a download. Used by the dashboard
  // to decode audio and draw a real waveform. Resolves null when unavailable.
  API.getBlob = function (recOrId) {
    var rec = typeof recOrId === 'string'
      ? API.list({ category: 'all' }).filter(function (r) { return r.id === recOrId; })[0]
      : recOrId;
    if (!rec) return Promise.resolve(null);
    if (isExpired(rec)) return Promise.resolve(null);
    return getBlob(rec.blobKey || rec.id).catch(function () { return null; });
  };
  API.remove = function (idValue) {
    var owner = currentOwnerId();
    var arr = readMeta(owner);
    var rec = null;
    arr = arr.filter(function (r) {
      if (r.id === idValue) { rec = r; return false; }
      return true;
    });
    writeMeta(arr, owner);
    if (rec) delBlob(rec.blobKey || rec.id).catch(function () {});
    emit();
  };
  // Toggle a file's "saved" flag. Saved files skip the retention timer and the
  // plan cap in prune(), so they are never auto-deleted. Returns true if changed.
  API.setSaved = function (idValue, saved) {
    var owner = currentOwnerId();
    var arr = readMeta(owner);
    var changed = false;
    arr.forEach(function (r) {
      if (r.id === idValue) {
        var val = !!saved;
        if (r.saved !== val) { r.saved = val; changed = true; }
      }
    });
    if (changed) { writeMeta(arr, owner); emit(); }
    return changed;
  };

  function shouldTrackPage() {
    var f = currentFile();
    if (TRACKABLE_SKIP[f]) return false;
    if (/\/(pricing|marketing|faq|tools|audio|video|images|documents|compress|converters|calc|dev-tools)\/?$/i.test(location.pathname)) return false;
    return true;
  }
  function captureAnchor(a) {
    if (!a || a.getAttribute('data-kpf-skip') === '1') return;
    if (!shouldTrackPage()) return;
    var href = a.href || '';
    if (href.indexOf('blob:') !== 0) return;
    var name = a.download || 'processed-file';
    if (savingUrls[href + '|' + name]) return;
    savingUrls[href + '|' + name] = 1;
    setTimeout(function () { delete savingUrls[href + '|' + name]; }, 5000);
    fetch(href).then(function (r) { return r.blob(); }).then(function (blob) {
      return API.save(blob, { name: name, page: currentFile() });
    }).catch(function () {});
  }
  function scanAnchors(root) {
    if (!root) return;
    if (root.matches && root.matches('a[download]')) captureAnchor(root);
    if (!root.querySelectorAll) return;
    Array.prototype.forEach.call(root.querySelectorAll('a[download]'), captureAnchor);
  }
  function installCapture() {
    document.addEventListener('click', function (e) {
      captureAnchor(e.target && e.target.closest ? e.target.closest('a[download]') : null);
    }, true);
    try {
      if (!HTMLAnchorElement.prototype._kpfClickPatched) {
        var originalClick = HTMLAnchorElement.prototype.click;
        HTMLAnchorElement.prototype.click = function () {
          captureAnchor(this);
          return originalClick.apply(this, arguments);
        };
        Object.defineProperty(HTMLAnchorElement.prototype, '_kpfClickPatched', { value: true });
      }
    } catch (_) {}
    try {
      scanAnchors(document);
      var mo = new MutationObserver(function (mutations) {
        mutations.forEach(function (m) {
          if (m.type === 'attributes') scanAnchors(m.target);
          else Array.prototype.forEach.call(m.addedNodes || [], scanAnchors);
        });
      });
      mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['href', 'download'] });
    } catch (_) {}
  }

  window.KolkliProcessedFiles = API;
  installCapture();
  prune();
  try {
    if ('BroadcastChannel' in window) {
      var bc = new BroadcastChannel(CHANNEL);
      bc.onmessage = function (e) {
        if (e && e.data && e.data.type === 'changed') {
          try { window.dispatchEvent(new CustomEvent('kolkli:processed-files')); } catch (_) {}
        }
      };
    }
  } catch (_) {}
})();
