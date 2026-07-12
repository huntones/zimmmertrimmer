/* ============================================================
   KOLKLI — auth adapter (the "backend seam").

   window.KolkliAuth is the single door between the UI (auth.html +
   the header popup in auth-modal.js) and a REAL user backend
   (Supabase). It is deliberately thin:

     • If supabase-config.js has real credentials, every call hits
       Supabase Auth (accounts that work across devices/browsers,
       password reset, email confirmation…).
     • If not, KolkliAuth.configured() is false and the UI falls back
       to its existing localStorage demo — so the site keeps working
       with zero setup.

   The clever part: whatever the source, we mirror the signed-in user
   into the SAME localStorage keys the rest of the site already reads
   — `ac_session` (email) and the user's record inside `ac_users`
   ({name, role, plan}). That means header.js, dashboard.html,
   admin.html and files.html need NO changes; they keep reading the
   "current user" exactly as before, we just keep it in sync with the
   server. The `kolkli:auth` event still fires so the header updates
   live.

   Public API (all async, all safe to call even before ready):
     KolkliAuth.configured()                 -> bool
     KolkliAuth.ready                         -> Promise (resolves after first sync)
     KolkliAuth.signUp({name,email,password}) -> {ok, code?}
     KolkliAuth.signIn({email,password})      -> {ok, code?}
     KolkliAuth.signOut()                     -> {ok}
     KolkliAuth.resetPassword(email)          -> {ok, message?}

   Result `code`s the UI maps to its own localized strings:
     'taken'  email already registered (signup)
     'weak'   password rejected by the server (signup)
     'invalid' wrong email or password (login — Supabase merges the two)
     'confirm' account needs email confirmation before it can sign in
     'not_configured' | 'error'
   ============================================================ */
(function () {
  if (window.KolkliAuth) return;                 // guard double-load

  var SELF = document.currentScript;
  // Load the vendored supabase lib relative to THIS file, so it works
  // from root pages and the deeper folder pages alike.
  var BASE = SELF ? SELF.src.replace(/[^/]*$/, '') : '';

  var cfg = window.KOLKLI_SUPABASE || null;
  var CONFIGURED = !!(cfg && typeof cfg.configured === 'function' && cfg.configured());

  // ---- localStorage mirror (same keys the whole site already uses) ----
  var USERS_KEY = 'ac_users', SESSION_KEY = 'ac_session';
  var ADMIN_EMAILS = ['digitalzimmer@gmail.com'];
  function lsGet(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (_) {} }
  function loadUsers() { try { return JSON.parse(lsGet(USERS_KEY)) || []; } catch (_) { return []; } }
  function saveUsers(u) { try { lsSet(USERS_KEY, JSON.stringify(u)); } catch (_) {} }
  function notifyAuth() { try { window.dispatchEvent(new CustomEvent('kolkli:auth')); } catch (_) {} }

  // Push a server user into the local store the rest of the site reads.
  function cleanPlan(plan) {
    plan = String(plan || '').toLowerCase();
    if (plan === 'lite') return 'creator';
    if (plan === 'pro' || plan === 'business') return 'studio';
    return /^(free|creator|studio)$/.test(plan) ? plan : 'free';
  }

  function writeLocalUser(p) {
    var email = (p.email || '').toLowerCase();
    if (!email) return;
    lsSet(SESSION_KEY, email);
    var users = loadUsers();
    var i = -1;
    for (var k = 0; k < users.length; k++) {
      if ((users[k].email || '').toLowerCase() === email) { i = k; break; }
    }
    var rec = i > -1 ? users[i] : { email: email, created: Date.now(), role: 'user', plan: 'free' };
    if (p.id) rec.id = p.id;
    rec.email = email;
    if (p.name != null && p.name !== '') rec.name = p.name;
    if (p.role === 'admin') rec.role = 'admin';
    else if (ADMIN_EMAILS.indexOf(email) > -1) rec.role = 'admin';
    else rec.role = 'user';
    rec.plan = cleanPlan(p.plan);
    // Reflect the server 7-day trial into the shape trial.js / dashboard read,
    // so it persists across session syncs (and expires correctly).
    var tEnds = p.trialEndsAt ? Date.parse(p.trialEndsAt) : 0;
    if (tEnds) {
      var tActive = tEnds > Date.now() && rec.plan === 'creator';
      rec.trial = { active: tActive, plan: 'creator', startedAt: p.trialStartedAt ? Date.parse(p.trialStartedAt) : 0, endsAt: tEnds };
      rec.trialUsed = true;
      if (!tActive && rec.plan === 'creator') rec.plan = 'free';   // finished trial → Free
    }
    rec.sb = true;                               // marks a server-backed record
    if (i > -1) users[i] = rec; else users.push(rec);
    saveUsers(users);
    notifyAuth();
  }
  function clearLocalSession() { lsDel(SESSION_KEY); notifyAuth(); }

  // =====================================================
  //  Supabase client (created lazily, only when configured)
  // =====================================================
  var client = null;
  var initPromise = null;

  function loadLib() {
    if (window.supabase && window.supabase.createClient) return Promise.resolve();
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = BASE + 'vendor/supabase.min.js';   // vendored alongside ffmpeg/essentia
      s.async = true;
      s.onload = function () { res(); };
      s.onerror = function () { rej(new Error('KolkliAuth: failed to load supabase.min.js')); };
      document.head.appendChild(s);
    });
  }

  function init() {
    if (initPromise) return initPromise;
    if (!CONFIGURED) { initPromise = Promise.resolve(); return initPromise; }
    initPromise = loadLib().then(function () {
      client = window.supabase.createClient(cfg.url, cfg.anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, storageKey: 'kolkli_sb_auth' }
      });
      var settled = false;
      return new Promise(function (resolve) {
        // Fires immediately with the restored session (INITIAL_SESSION),
        // then on every SIGNED_IN / SIGNED_OUT / TOKEN_REFRESHED.
        client.auth.onAuthStateChange(function (_evt, session) {
          syncFromSession(session).finally(function () {
            if (!settled) { settled = true; resolve(); }
          });
        });
        // Safety net in case the event is slow.
        setTimeout(function () { if (!settled) { settled = true; resolve(); } }, 4000);
      });
    }).catch(function (e) {
      // Lib failed → behave as unconfigured so the demo fallback kicks in.
      CONFIGURED = false;
      try { console.warn(e && e.message || e); } catch (_) {}
    });
  }

  async function fetchProfile(user) {
    var name = (user.user_metadata && user.user_metadata.full_name) || '';
    var role, plan, trialStartedAt, trialEndsAt;
    try {
      var r = await client.from('profiles').select('full_name, role, plan, trial_started_at, trial_ends_at').eq('id', user.id).single();
      if (r && r.data) {
        if (r.data.full_name) name = r.data.full_name;
        role = r.data.role; plan = r.data.plan;
        trialStartedAt = r.data.trial_started_at; trialEndsAt = r.data.trial_ends_at;
      }
    } catch (_) { /* table missing / RLS / offline — fall back to metadata */ }
    return { id: user.id, email: user.email, name: name, role: role, plan: plan, trialStartedAt: trialStartedAt, trialEndsAt: trialEndsAt };
  }

  async function syncFromSession(session) {
    if (session && session.user) {
      var p = await fetchProfile(session.user);
      writeLocalUser(p);
    } else {
      clearLocalSession();
    }
  }

  function whenReady() { return init(); }

  // =====================================================
  //  PUBLIC API
  // =====================================================
  async function signUp(o) {
    if (!CONFIGURED) return { ok: false, code: 'not_configured' };
    await whenReady();
    if (!client) return { ok: false, code: 'not_configured' };
    var res = await client.auth.signUp({
      email: o.email, password: o.password,
      options: { data: { full_name: o.name || '' } }
    });
    if (res.error) {
      var m = (res.error.message || '').toLowerCase();
      if (m.indexOf('already') > -1 || m.indexOf('registered') > -1) return { ok: false, code: 'taken' };
      if (m.indexOf('password') > -1 || m.indexOf('weak') > -1) return { ok: false, code: 'weak' };
      return { ok: false, code: 'error', message: res.error.message };
    }
    var u = res.data && res.data.user;
    // Anti-enumeration: an existing email comes back with no identities + no error.
    if (u && u.identities && u.identities.length === 0) return { ok: false, code: 'taken' };
    if (res.data && res.data.session) { await syncFromSession(res.data.session); return { ok: true }; }
    // No session yet → project has "Confirm email" turned on.
    return { ok: true, code: 'confirm' };
  }

  async function signIn(o) {
    if (!CONFIGURED) return { ok: false, code: 'not_configured' };
    await whenReady();
    if (!client) return { ok: false, code: 'not_configured' };
    var res = await client.auth.signInWithPassword({ email: o.email, password: o.password });
    if (res.error) {
      var m = (res.error.message || '').toLowerCase();
      if (m.indexOf('not confirmed') > -1 || m.indexOf('confirm') > -1) return { ok: false, code: 'confirm' };
      if (m.indexOf('invalid') > -1 || m.indexOf('credentials') > -1) return { ok: false, code: 'invalid' };
      return { ok: false, code: 'error', message: res.error.message };
    }
    if (res.data && res.data.session) await syncFromSession(res.data.session);
    return { ok: true };
  }

  async function signOut() {
    if (CONFIGURED) {
      await whenReady();
      try { if (client) await client.auth.signOut(); } catch (_) {}
    }
    clearLocalSession();
    return { ok: true };
  }

  async function resetPassword(email) {
    if (!CONFIGURED) return { ok: false, code: 'not_configured' };
    await whenReady();
    if (!client) return { ok: false, code: 'not_configured' };
    var redirect = location.origin + location.pathname.replace(/[^/]*$/, '') + 'auth';
    var res = await client.auth.resetPasswordForEmail(email, { redirectTo: redirect });
    return res.error ? { ok: false, message: res.error.message } : { ok: true };
  }

  // Hand the initialized Supabase client to feature code (e.g. the team
  // screen in dashboard.html) so it can query org tables / call RPCs.
  // Resolves to null when not configured or the lib failed to load.
  async function getClient() {
    if (!CONFIGURED) return null;
    await whenReady();
    return client;
  }
  // Current signed-in user's uuid (auth.uid), or null.
  async function userId() {
    var c = await getClient();
    if (!c) return null;
    try { var r = await c.auth.getUser(); return (r && r.data && r.data.user && r.data.user.id) || null; }
    catch (_) { return null; }
  }
  // The current session's access token (JWT) — send it as a Bearer header to
  // Cloudflare Workers (R2 uploads etc.) so they can verify the user.
  async function getToken() {
    var c = await getClient();
    if (!c) return null;
    try { var r = await c.auth.getSession(); return (r && r.data && r.data.session && r.data.session.access_token) || null; }
    catch (_) { return null; }
  }

  // Grant this account its one-time 7-day Creator trial server-side, via the
  // start_trial() RPC (the DB enforces one-per-account; the fingerprint gate in
  // trial.js runs first for one-per-device). Reflects the result into the local
  // mirror so the header/dashboard update immediately.
  async function startTrial() {
    if (!CONFIGURED) return { ok: false, code: 'not_configured' };
    await whenReady();
    if (!client) return { ok: false, code: 'not_configured' };
    try {
      var r = await client.rpc('start_trial');
      if (r && !r.error && r.data) {
        var row = Array.isArray(r.data) ? r.data[0] : r.data;
        if (row) writeLocalUser({ id: row.id, email: row.email, name: row.full_name, role: row.role, plan: row.plan, trialStartedAt: row.trial_started_at, trialEndsAt: row.trial_ends_at });
        return { ok: true, endsAt: row && row.trial_ends_at };
      }
      return { ok: false, code: 'error', message: r && r.error && r.error.message };
    } catch (e) { return { ok: false, code: 'error', message: e && e.message }; }
  }

  window.KolkliAuth = {
    configured: function () { return CONFIGURED; },
    ready: init(),                               // kick off session restore right away
    signUp: signUp,
    signIn: signIn,
    signOut: signOut,
    resetPassword: resetPassword,
    startTrial: startTrial,
    getClient: getClient,
    userId: userId,
    getToken: getToken
  };
})();
