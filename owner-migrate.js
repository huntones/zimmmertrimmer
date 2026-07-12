/* ============================================================================
 * KOLKLI owner migration (local-demo bridge).
 *
 * Why this exists
 * ---------------
 * The whole app is a browser-local demo: "sent packages" metadata lives in
 * localStorage under an OWNER-SCOPED key — `kolkli_send_links::<ownerId>` —
 * while the file bytes live in IndexedDB under a GLOBAL key (`t_<token>`).
 *
 * `ownerId` is 'guest' when signed out and `<email>` (or a user id) when signed
 * in. Nothing bridged the two, so a package created while signed OUT was written
 * to `::guest`, and after the user logged IN the dashboard read `::<email>` and
 * found nothing — the files looked like they had vanished (the bytes were still
 * safe in IndexedDB, but the index that drives every card list was orphaned).
 *
 * This module moves guest-scoped send records into the logged-in owner's scope
 * (deduped by token) on load and whenever the auth/session state changes, so the
 * cards — and therefore the edit/re-open flow that rehydrates blobs from
 * IndexedDB — survive a guest -> login transition.
 *
 * It only touches `kolkli_send_links` + its project-number counters. Requests
 * (`kr_requests`) and reviews (`rv_projects`) share the same latent pattern and
 * can be added here later once their token->owner indexes are handled too.
 *
 * When the real Supabase/R2 backend is connected this file becomes a no-op:
 * records will be keyed by user_id server-side and there is no guest bucket to
 * merge. (Note: connecting Supabase flips ownerId from <email> to the Supabase
 * uuid — auth-store writeLocalUser sets rec.id — so a uuid-aware migration will
 * be needed at that point; see the send-files Phase 2 work.)
 * ==========================================================================*/
(function () {
  'use strict';
  if (window.KolkliOwnerMigrate) return;

  var LOG = '[KOLKLI migrate]';
  var SEND_KEY = 'kolkli_send_links';
  var COUNTER_KEY = 'kolkli_project_number_counters';

  function safeOwnerId(v) {
    return String(v || 'guest').toLowerCase().replace(/[^a-z0-9_.@-]+/g, '_') || 'guest';
  }

  // Must match send.html / dashboard.html / project-numbering.js exactly.
  function currentOwnerId() {
    var email = '';
    try { email = (localStorage.getItem('ac_session') || '').toLowerCase(); } catch (_) {}
    if (!email) return 'guest';
    try {
      var users = JSON.parse(localStorage.getItem('ac_users') || '[]') || [];
      for (var i = 0; i < users.length; i++) {
        if ((users[i].email || '').toLowerCase() === email) return safeOwnerId(users[i].id || users[i].userId || email);
      }
    } catch (_) {}
    return safeOwnerId(email);
  }

  function readJSON(key, fallback) {
    try { var v = JSON.parse(localStorage.getItem(key) || 'null'); return v == null ? fallback : v; }
    catch (_) { return fallback; }
  }
  function writeJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch (_) { return false; }
  }

  // Merge the guest send-index into the owner's, deduped by token, newest first,
  // capped at 100 (same cap send.html uses). Returns how many were moved.
  function mergeSendLinks(owner) {
    var gKey = SEND_KEY + '::guest', oKey = SEND_KEY + '::' + owner;
    var guest = readJSON(gKey, []);
    if (!Array.isArray(guest) || !guest.length) return 0;
    var own = readJSON(oKey, []);
    if (!Array.isArray(own)) own = [];
    var seen = {};
    own.forEach(function (x) { if (x && x.token) seen[x.token] = true; });
    var moved = 0;
    // preserve guest order; prepend so the (older) guest items sit under the
    // owner's own newer ones only where tokens don't already exist
    guest.forEach(function (x) {
      if (x && x.token && !seen[x.token]) { own.push(x); seen[x.token] = true; moved++; }
    });
    // keep newest-first ordering the app expects: sort by createdAt desc when present
    own.sort(function (a, b) { return (Number(b && b.createdAt) || 0) - (Number(a && a.createdAt) || 0); });
    writeJSON(oKey, own.slice(0, 100));
    try { localStorage.removeItem(gKey); } catch (_) {}
    return moved;
  }

  // Carry the project-number counters forward so numbering never regresses.
  function mergeCounters(owner) {
    var gKey = COUNTER_KEY + '::guest', oKey = COUNTER_KEY + '::' + owner;
    var g = readJSON(gKey, {});
    if (!g || typeof g !== 'object' || !Object.keys(g).length) return;
    var o = readJSON(oKey, {});
    if (!o || typeof o !== 'object') o = {};
    Object.keys(g).forEach(function (k) { o[k] = Math.max(Number(o[k]) || 0, Number(g[k]) || 0); });
    writeJSON(oKey, o);
  }

  function run() {
    var owner = currentOwnerId();
    if (owner === 'guest') return 0;   // nothing to merge while signed out
    var moved = 0;
    try {
      moved = mergeSendLinks(owner);
      mergeCounters(owner);
    } catch (e) {
      try { console.warn(LOG, 'migration failed', e); } catch (_) {}
      return 0;
    }
    if (moved) {
      try { console.info(LOG, 'moved ' + moved + ' guest send(s) -> ' + owner); } catch (_) {}
      try { window.dispatchEvent(new CustomEvent('kolkli:migrated', { detail: { moved: moved, owner: owner } })); } catch (_) {}
    }
    return moved;
  }

  // Run immediately (covers page load / refresh / re-open project) and again on
  // any auth or cross-tab session change (covers logging in on the page).
  try { run(); } catch (_) {}
  window.addEventListener('kolkli:auth', function () { try { run(); } catch (_) {} });
  window.addEventListener('storage', function (e) {
    if (!e || !e.key || e.key === 'ac_session' || e.key === 'ac_users') { try { run(); } catch (_) {} }
  });

  window.KolkliOwnerMigrate = { run: run };
})();
