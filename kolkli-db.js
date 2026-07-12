/* ============================================================================
 * KOLKLI — cross-device data layer (the "backend seam").
 *
 * window.KolkliDB is the single door between the four file stores and the real
 * backend (Supabase Postgres + Storage). Every store keeps an array of JSON
 * "project" records locally (localStorage) and the file blobs in IndexedDB.
 * KolkliDB mirrors that SAME record to a `projects` row (jsonb) and the blobs to
 * the `kolkli-files` Storage bucket — so a second device / a re-login / the
 * public client link all read the same data back.
 *
 *   service ∈ 'receive' | 'review' | 'send' | 'select'
 *   record  = the exact store record (KR request / RV project / send package /
 *             select project), MINUS the blobs. `record.token` is the key.
 *   blob    = Storage object at  {service}/{token}/{fileId}
 *
 * DESIGN — local-first mirror (keeps the pages synchronous):
 *   • On load a page calls  KolkliDB.pullService(svc)  (owner) or
 *     KolkliDB.pullToken(svc, token)  (public link) and writes the returned
 *     records into its existing local store, then renders as it always did.
 *   • On every write the store writes locally (instant) AND calls the matching
 *     KolkliDB method fire-and-forget to push to the server.
 *   • getBlob: try local IndexedDB first; on a miss, KolkliDB.downloadBlob()
 *     pulls it from Storage and the store caches it locally.
 *
 * SAFE BY DEFAULT: if supabase-config.js still holds placeholders,
 * KolkliDB.enabled() is false and every method resolves to null — the stores
 * fall straight back to their local-only demo behaviour. Nothing breaks.
 *
 * Requires: supabase-config.js (before this file). Reuses KolkliAuth's Supabase
 * client when present so there is one shared session; otherwise it lazily
 * bootstraps its own client from the vendored lib (for the account-less client
 * pages proof/upload/download).
 * ==========================================================================*/
(function () {
  'use strict';
  if (window.KolkliDB) return;                       // guard double-load

  var SELF = document.currentScript;
  var BASE = SELF ? SELF.src.replace(/[^/]*$/, '') : '';
  var BUCKET = 'kolkli-files';

  function cfg() { return window.KOLKLI_SUPABASE || null; }
  function configured() {
    var c = cfg();
    return !!(c && typeof c.configured === 'function' && c.configured());
  }

  // ---------- shared Supabase client ----------
  var clientPromise = null;
  function loadLib() {
    if (window.supabase && window.supabase.createClient) return Promise.resolve();
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = BASE + 'vendor/supabase.min.js';
      s.async = true;
      s.onload = function () { res(); };
      s.onerror = function () { rej(new Error('KolkliDB: failed to load supabase.min.js')); };
      document.head.appendChild(s);
    });
  }
  function bootstrapOwnClient() {
    return loadLib().then(function () {
      return window.supabase.createClient(cfg().url, cfg().anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, storageKey: 'kolkli_sb_auth' }
      });
    });
  }
  function getClient() {
    if (!configured()) return Promise.resolve(null);
    if (clientPromise) return clientPromise;
    clientPromise = (function () {
      // Prefer the auth adapter's client so we share ONE GoTrue session.
      if (window.KolkliAuth && typeof KolkliAuth.getClient === 'function') {
        return KolkliAuth.getClient().then(function (c) { return c || bootstrapOwnClient(); });
      }
      return bootstrapOwnClient();
    })().catch(function (e) {
      try { console.warn(e && e.message || e); } catch (_) {}
      return null;
    });
    return clientPromise;
  }

  function warn(where, err) {
    try { console.warn('KolkliDB.' + where + ':', (err && err.message) || err); } catch (_) {}
  }

  var DB = {};
  DB.enabled = configured;
  DB.ready = getClient();                             // kick off client init early
  DB.bucket = BUCKET;

  // ================= metadata (jsonb per record) =================

  // Owner: pull all of my records for a service → array of store records.
  DB.pullService = function (service) {
    return getClient().then(function (c) {
      if (!c) return null;
      return c.from('projects').select('token,data,status,updated_at').eq('service', service)
        .then(function (r) {
          if (r.error) { warn('pullService', r.error); return null; }
          return (r.data || []).map(function (row) {
            var d = row.data || {};
            if (!d.token) d.token = row.token;         // keep token even if omitted from data
            return d;
          });
        });
    }).catch(function (e) { warn('pullService', e); return null; });
  };

  // Public link: read ONE record by token (the token is the secret). Works for
  // an account-less client on any device.
  DB.pullToken = function (service, token) {
    return getClient().then(function (c) {
      if (!c || !token) return null;
      return c.rpc('project_get', { p_service: service, p_token: token })
        .then(function (r) {
          if (r.error) { warn('pullToken', r.error); return null; }
          var row = Array.isArray(r.data) ? r.data[0] : r.data;
          return row ? (row.data || null) : null;
        });
    }).catch(function (e) { warn('pullToken', e); return null; });
  };

  // Owner: upsert one record. Resolves true on success, null when disabled,
  // false on error (caller keeps the local copy either way).
  DB.pushProject = function (service, token, record, status) {
    return getClient().then(function (c) {
      if (!c) return null;
      return c.auth.getUser().then(function (u) {
        var owner = (u && u.data && u.data.user && u.data.user.id) || null;
        var row = { service: service, token: token, data: record,
                    status: status || record.status || null };
        if (owner) row.owner = owner;
        return c.from('projects').upsert(row, { onConflict: 'service,token' })
          .then(function (r) { if (r.error) { warn('pushProject', r.error); return false; } return true; });
      });
    }).catch(function (e) { warn('pushProject', e); return false; });
  };

  DB.deleteProject = function (service, token) {
    return getClient().then(function (c) {
      if (!c) return null;
      return c.from('projects').delete().eq('service', service).eq('token', token)
        .then(function (r) { if (r.error) { warn('deleteProject', r.error); return false; } return true; });
    }).catch(function (e) { warn('deleteProject', e); return false; });
  };

  // ---- guarded anonymous client writes (token-gated RPCs) ----
  function rpc(name, args) {
    return getClient().then(function (c) {
      if (!c) return null;
      return c.rpc(name, args).then(function (r) { if (r.error) { warn(name, r.error); return false; } return r.data == null ? true : r.data; });
    }).catch(function (e) { warn(name, e); return false; });
  }
  DB.addComment  = function (service, token, comment, event) { return rpc('project_add_comment',  { p_service: service, p_token: token, p_comment: comment, p_event: event || null }); };
  DB.setDecision = function (service, token, decision, status, event) { return rpc('project_set_decision', { p_service: service, p_token: token, p_decision: decision, p_status: status || null, p_event: event || null }); };
  DB.addEvent    = function (service, token, event) { return rpc('project_add_event', { p_service: service, p_token: token, p_event: event }); };
  DB.addSubmission = function (token, submission, files) { return rpc('project_add_submission', { p_token: token, p_submission: submission, p_files: files || [] }); };
  DB.setSelection  = function (token, selection) { return rpc('project_set_selection', { p_token: token, p_selection: selection || [] }); };
  DB.bumpDownload  = function (token) { return rpc('project_bump_download', { p_token: token }); };
  // Curated public info for a receive/upload link (safe form fields only).
  // Returns the info object, or null when missing/disabled (not coerced to true).
  DB.requestInfo = function (token) {
    return getClient().then(function (c) {
      if (!c || !token) return null;
      return c.rpc('request_public_info', { p_token: token })
        .then(function (r) { if (r.error) { warn('requestInfo', r.error); return null; } return r.data || null; });
    }).catch(function (e) { warn('requestInfo', e); return null; });
  };

  // ================= blobs (Supabase Storage) =================
  function objPath(service, token, fileId) { return service + '/' + token + '/' + fileId; }

  DB.uploadBlob = function (service, token, fileId, blob) {
    return getClient().then(function (c) {
      if (!c || !blob) return null;
      return c.storage.from(BUCKET).upload(objPath(service, token, fileId), blob, {
        upsert: true, contentType: (blob && blob.type) || 'application/octet-stream'
      }).then(function (r) { if (r.error) { warn('uploadBlob', r.error); return false; } return objPath(service, token, fileId); });
    }).catch(function (e) { warn('uploadBlob', e); return false; });
  };

  DB.downloadBlob = function (service, token, fileId) {
    return getClient().then(function (c) {
      if (!c) return null;
      return c.storage.from(BUCKET).download(objPath(service, token, fileId))
        .then(function (r) { if (r.error) return null; return r.data || null; });   // r.data is a Blob
    }).catch(function (e) { warn('downloadBlob', e); return null; });
  };

  DB.deleteBlob = function (service, token, fileId) {
    return getClient().then(function (c) {
      if (!c) return null;
      return c.storage.from(BUCKET).remove([objPath(service, token, fileId)])
        .then(function (r) { if (r.error) { warn('deleteBlob', r.error); return false; } return true; });
    }).catch(function (e) { warn('deleteBlob', e); return false; });
  };

  // Deterministic public URL for a blob (bucket is public) — safe to use as an
  // <img>/<video>/<audio> src without a round-trip. null when not configured.
  DB.publicUrl = function (service, token, fileId) {
    if (!configured()) return null;
    return cfg().url.replace(/\/+$/, '') + '/storage/v1/object/public/' + BUCKET + '/' +
      objPath(service, token, fileId).split('/').map(encodeURIComponent).join('/');
  };

  window.KolkliDB = DB;
})();
