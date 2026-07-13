/* ============================================================================
 * KOLKLI — file-sync layer (the reliable "save files + selections" helper).
 *
 * window.KolkliSync sits ON TOP of KolkliDB (the Supabase seam) and gives the
 * file pages one small, robust store per project/gallery/package:
 *
 *   • blob bytes            → IndexedDB (instant, offline) + Supabase Storage
 *                             (cross-device) with a read-back VERIFY so a file
 *                             is never reported "saved" until the write is proven.
 *   • per-file metadata      → localStorage (instant) + a `projects` jsonb row
 *                             (id, project token, name, type, size, storage
 *                             path, status, display order) via KolkliDB.
 *   • client selections      → localStorage (instant) + the token-gated
 *                             project_set_selection RPC, keyed by a stable
 *                             per-client session id.
 *
 * DESIGN GOALS (match the product spec):
 *   1. Local write is synchronous + instant  → the UI never blocks.
 *   2. Every write is ALSO mirrored to the server, with automatic retry +
 *      exponential backoff, so a weak connection never loses data.
 *   3. A status bus (onStatus) lets a page show "saving… / saved / retrying".
 *   4. On reconnect ('online') every pending write is flushed automatically.
 *   5. SAFE BY DEFAULT: when Supabase is not configured KolkliDB.enabled() is
 *      false and every remote step no-ops — the page keeps working as a
 *      same-browser demo (localStorage + IndexedDB), and the SAME code flips to
 *      true cross-device persistence the instant real keys are added.
 *
 * Requires: kolkli-db.js (before this file).
 * ==========================================================================*/
(function () {
  'use strict';
  if (window.KolkliSync) return;

  function DB() { return window.KolkliDB || null; }
  function enabled() { var d = DB(); return !!(d && d.enabled && d.enabled()); }
  function online() { return (typeof navigator.onLine === 'boolean') ? navigator.onLine : true; }

  // Ask the browser to keep our storage (fights eviction of the IndexedDB blobs).
  try {
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persisted().then(function (p) { if (!p) navigator.storage.persist(); }).catch(function () {});
    }
  } catch (_) {}

  // ---------------- status bus ----------------
  // states: 'saving' | 'saved' | 'retrying' | 'error'
  var listeners = [];
  function onStatus(cb) { listeners.push(cb); return function () { var i = listeners.indexOf(cb); if (i > -1) listeners.splice(i, 1); }; }
  function emit(state, detail) { for (var i = 0; i < listeners.length; i++) { try { listeners[i](state, detail || {}); } catch (_) {} } }

  // ---------------- stable, secure client/session id ----------------
  function rand() {
    try { var a = new Uint32Array(3); crypto.getRandomValues(a); return a[0].toString(36) + a[1].toString(36) + a[2].toString(36); }
    catch (_) { return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2); }
  }
  function clientId() {
    var k = 'kolkli_client_sid', v = null;
    try { v = localStorage.getItem(k); } catch (_) {}
    if (!v) { v = 'c_' + rand(); try { localStorage.setItem(k, v); } catch (_) {} }
    return v;
  }

  // ---------------- IndexedDB blob store (one db, one 'blobs' store) ----------------
  var dbCache = {};
  function openDb(name) {
    if (dbCache[name]) return dbCache[name];
    dbCache[name] = new Promise(function (res, rej) {
      var r = indexedDB.open(name, 1);
      r.onupgradeneeded = function () { var d = r.result; if (!d.objectStoreNames.contains('blobs')) d.createObjectStore('blobs'); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
    return dbCache[name];
  }
  function idbPut(name, key, blob) {
    return openDb(name).then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction('blobs', 'readwrite');
        tx.objectStore('blobs').put(blob, key);
        tx.oncomplete = function () { res(true); };
        tx.onerror = function () { rej(tx.error); };
        tx.onabort = function () { rej(tx.error || new Error('idb abort')); };
      });
    });
  }
  function idbGet(name, key) {
    return openDb(name).then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction('blobs', 'readonly');
        var rq = tx.objectStore('blobs').get(key);
        rq.onsuccess = function () { res(rq.result || null); };
        rq.onerror = function () { rej(rq.error); };
      });
    });
  }
  function idbDel(name, key) {
    return openDb(name).then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction('blobs', 'readwrite');
        tx.objectStore('blobs').delete(key);
        tx.oncomplete = function () { res(true); };
        tx.onerror = function () { rej(tx.error); };
      });
    });
  }

  // ---------------- retry with exponential backoff ----------------
  // fn resolves truthy=ok, false=soft-fail (retry), or rejects=hard-fail (retry).
  function retry(fn, opts) {
    opts = opts || {};
    var max = (opts.max == null ? 5 : opts.max), base = opts.base || 1200, label = opts.label || 'save';
    return new Promise(function (resolve) {
      var n = 0;
      function attempt() {
        Promise.resolve().then(fn).then(function (ok) {
          if (ok === false) throw new Error(label + ' failed');
          resolve(ok == null ? true : ok);
        }).catch(function (err) {
          n++;
          if (n > max) { emit('error', { label: label, err: String((err && err.message) || err) }); resolve(false); return; }
          emit('retrying', { label: label, attempt: n });
          var wait = Math.min(base * Math.pow(2, n - 1), 20000);
          setTimeout(attempt, wait);
        });
      }
      attempt();
    });
  }

  // ---------------- per-project store handle ----------------
  var handles = [];
  try { window.addEventListener('online', function () { handles.forEach(function (h) { h._flushPending(); }); }); } catch (_) {}

  function readJSON(k) { try { var s = localStorage.getItem(k); return s ? JSON.parse(s) : null; } catch (_) { return null; } }
  function writeJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (_) { return false; } }

  /**
   * opts = {
   *   service : 'select' | 'send' | 'receive' | 'review',
   *   token   : the project/gallery/package id (the shareable secret),
   *   role    : 'owner' | 'client',
   *   dbName  : IndexedDB database name for the blobs,
   *   metaKey : localStorage prefix for the metadata record,
   *   picksKey: localStorage prefix for this client's selection (client role)
   * }
   */
  function store(opts) {
    var service = opts.service, token = String(opts.token || ''), role = opts.role || 'owner';
    var dbName = opts.dbName || ('kolkli_' + service);
    var metaKey = (opts.metaKey || ('kolkli_' + service + '_meta')) + '::' + token;
    var picksKey = (opts.picksKey || ('kolkli_' + service + '_picks')) + '::' + token;

    var metaTimer = null, metaPending = null, metaBusy = false;
    var picksTimer = null, picksPending = null, picksBusy = false;
    var knownSelection = [];   // last selection we saw on the server (so owner pushes never clobber client picks)

    var H = {};
    H.token = token;
    H.service = service;
    H.role = role;
    H.enabled = enabled;
    H.online = online;
    H.remoteUrl = function (id) { var d = DB(); return (d && d.publicUrl) ? d.publicUrl(service, token, id) : null; };
    H.setKnownSelection = function (sel) { knownSelection = Array.isArray(sel) ? sel : []; };
    H.knownSelection = function () { return knownSelection; };

    // ---- blobs ----
    // Writes locally, VERIFIES the write by reading it back, then (owner+configured)
    // mirrors to Storage in the background. Resolves true only when the local write
    // is proven — the caller must not mark a file "uploaded" until this is true.
    H.putBlob = function (id, blob) {
      if (!blob) return Promise.resolve(false);
      return idbPut(dbName, id, blob)
        .then(function () { return idbGet(dbName, id); })
        .then(function (v) {
          var ok = !!v && (!blob.size || v.size === blob.size);
          if (ok && enabled() && role === 'owner') {
            retry(function () { return DB().uploadBlob(service, token, id, blob); }, { label: 'upload' });
          }
          return ok;
        })
        .catch(function () { return false; });
    };
    H.getBlob = function (id) {
      return idbGet(dbName, id).then(function (b) {
        if (b) return b;
        if (enabled()) {
          return DB().downloadBlob(service, token, id).then(function (rb) {
            if (rb) idbPut(dbName, id, rb).catch(function () {});
            return rb || null;
          });
        }
        return null;
      }).catch(function () { return null; });
    };
    // A usable src for an <img>/<audio>/<video>: local object URL if we have the
    // bytes, else the public Storage URL (cross-device), else null.
    H.blobUrl = function (id) {
      return idbGet(dbName, id).then(function (b) {
        if (b) { try { return URL.createObjectURL(b); } catch (_) { return null; } }
        return enabled() ? H.remoteUrl(id) : null;
      }).catch(function () { return enabled() ? H.remoteUrl(id) : null; });
    };
    H.delBlob = function (id) {
      idbDel(dbName, id).catch(function () {});
      if (enabled() && role === 'owner') DB().deleteBlob(service, token, id);
      return Promise.resolve(true);
    };

    // ---- metadata (owner authoring: files + folders + gallery fields) ----
    H.readMeta = function () { return readJSON(metaKey); };
    H.writeMetaLocal = function (obj) { writeJSON(metaKey, obj); };
    H.writeMeta = function (obj) {
      writeJSON(metaKey, obj);                       // instant, offline-safe
      if (role !== 'owner' || !enabled()) return;    // remote metadata push is owner-only (RLS blocks anon upsert)
      metaPending = obj;
      if (metaTimer) clearTimeout(metaTimer);
      emit('saving', { label: 'gallery' });
      metaTimer = setTimeout(flushMeta, 900);
    };
    function flushMeta() {
      if (!metaPending || metaBusy) return;
      if (!online()) { emit('retrying', { label: 'gallery', offline: true }); return; }
      var obj = metaPending; metaPending = null; metaBusy = true;
      // preserve the client's server-side selection so an owner metadata push
      // never wipes picks that arrived since our last pull.
      retry(function () {
        return DB().pullToken(service, token).then(function (remote) {
          if (remote && remote.selection) { obj.selection = remote.selection; knownSelection = remote.selection; }
          else if (knownSelection && knownSelection.length && obj.selection == null) { obj.selection = knownSelection; }
          return DB().pushProject(service, token, obj, obj.status || null);
        });
      }, { label: 'gallery' }).then(function (ok) {
        metaBusy = false;
        if (ok) emit('saved', { label: 'gallery' });
        if (metaPending) flushMeta();
      });
    }

    // ---- client selection (picks) ----
    // `selectionArray` is the FULL selection to store on the server (this client's
    // picks merged with every OTHER client's — so nothing is ever overwritten).
    // `mine` is just this client's entries (kept locally for instant restore).
    H.readPicks = function () { return readJSON(picksKey); };
    H.savePicks = function (selectionArray, mine, extra) {
      var rec = { clientId: clientId(), mine: mine || [], selection: selectionArray || [], at: Date.now() };
      if (extra) for (var k in extra) if (extra.hasOwnProperty(k)) rec[k] = extra[k];
      writeJSON(picksKey, rec);                       // instant, offline-safe
      knownSelection = selectionArray || [];
      if (!enabled()) { emit('saved', { label: 'picks', local: true }); return; }
      picksPending = selectionArray || [];
      if (picksTimer) clearTimeout(picksTimer);
      emit('saving', { label: 'picks' });
      picksTimer = setTimeout(flushPicks, 400);
    };
    function flushPicks() {
      if (picksPending == null || picksBusy) return;
      if (!online()) { emit('retrying', { label: 'picks', offline: true }); return; }
      var sel = picksPending; picksPending = null; picksBusy = true;
      retry(function () { return DB().setSelection(token, sel); }, { label: 'picks' }).then(function (ok) {
        picksBusy = false;
        if (ok) emit('saved', { label: 'picks' });
        if (picksPending != null) flushPicks();
      });
    }

    // ---- pull the whole record back (hydrate on load) ----
    H.pull = function () {
      if (!enabled()) return Promise.resolve(null);
      if (role === 'client') {
        return DB().pullToken(service, token).then(function (rec) {
          if (rec && rec.selection) knownSelection = rec.selection;
          return rec;
        });
      }
      return DB().pullService(service).then(function (list) {
        if (!list) return null;
        for (var i = 0; i < list.length; i++) {
          if (list[i] && list[i].token === token) { if (list[i].selection) knownSelection = list[i].selection; return list[i]; }
        }
        return null;
      });
    };
    // Re-pull just the selection (owner watching the client pick in ~real time).
    H.pullSelection = function () {
      if (!enabled()) return Promise.resolve(null);
      return DB().pullToken(service, token).then(function (rec) {
        var sel = rec && rec.selection ? rec.selection : null;
        if (sel) knownSelection = sel;
        return sel;
      });
    };

    H._flushPending = function () { if (metaPending) flushMeta(); if (picksPending != null) flushPicks(); };
    H.flush = function () { if (metaTimer) clearTimeout(metaTimer); if (picksTimer) clearTimeout(picksTimer); flushMeta(); flushPicks(); };

    handles.push(H);
    return H;
  }

  window.KolkliSync = { clientId: clientId, onStatus: onStatus, store: store, enabled: enabled, emit: emit };
})();
