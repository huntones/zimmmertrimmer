/* ============================================================
   KOLKLI 7-day free trial — registered users only.

   • Granted once, at SIGN-UP. Guests/anonymous visitors never get it.
   • NO credit card: the trial is handed out at registration and simply
     reverts to Free after 7 days — the checkout / card flow is never touched.
   • Anti-bypass via FINGERPRINT: a trial claim is stamped against the
     device fingerprint + anonymous browser id + IP, so deleting the account,
     clearing the session, or registering a fresh email from the same browser
     does NOT hand out a second trial. The browser keeps a local ledger
     (localStorage + cookie); when the storage Worker is deployed its
     /usage/trial-claim endpoint is the authoritative gate (fingerprint + IP
     server-side, exactly like the usage quotas).
   • Grants the Creator tier for the window, then a lazy sweep on every page
     load downgrades expired trials back to Free (so every currentPlan() reader
     across the site sees the right plan with no extra wiring).

   Public API (window.KolkliTrial):
     grantOnSignup(email) -> Promise<{granted, endsAt?, reason?}>
     status(userOrEmail)  -> {active, plan, endsAt, daysLeft} | null
     sweep()              -> downgrade any expired trials now
     DAYS, PLAN
   ============================================================ */
(function () {
  if (window.KolkliTrial) return;

  var TRIAL_DAYS = 7;
  var TRIAL_PLAN = 'creator';
  var DAY_MS = 24 * 60 * 60 * 1000;
  var LEDGER_KEY = 'kolkli_trial_fp';   // ids that have already claimed a trial
  var USERS_KEY = 'ac_users';
  var SESSION_KEY = 'ac_session';
  var PLAN_KEY = 'ac_plan';

  function lsGet(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }
  function loadUsers() { try { return JSON.parse(lsGet(USERS_KEY) || '[]') || []; } catch (_) { return []; } }
  function saveUsers(u) { lsSet(USERS_KEY, JSON.stringify(u)); }
  function sessionEmail() { return (lsGet(SESSION_KEY) || '').toLowerCase(); }
  function now() { return Date.now(); }

  // ---- identity signals (reuse the usage SDK's when it's loaded) ----
  function fingerprint() {
    if (window.KolkliUsage && KolkliUsage.fingerprint) {
      try { return Promise.resolve(KolkliUsage.fingerprint()); } catch (_) {}
    }
    var basis = [
      navigator.userAgent || '', (navigator.languages || []).join(',') || navigator.language || '',
      screen.width + 'x' + screen.height + 'x' + screen.colorDepth, navigator.platform || '',
      navigator.hardwareConcurrency || '', Intl.DateTimeFormat().resolvedOptions().timeZone || ''
    ].join('|');
    return Promise.resolve('fb:' + hash32(basis));
  }
  function anonId() {
    if (window.KolkliUsage && KolkliUsage.anonymousId) { try { return KolkliUsage.anonymousId(); } catch (_) {} }
    return lsGet('kolkli_anon_id') || '';
  }
  function hash32(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h) + s.charCodeAt(i); return (h >>> 0).toString(16); }

  // ---- local ledger: localStorage + cookie so it outlives account deletion ----
  function ledger() { try { return JSON.parse(lsGet(LEDGER_KEY) || '[]') || []; } catch (_) { return []; } }
  function ledgerHas(id) { return !!id && ledger().indexOf(id) > -1; }
  function ledgerAdd(id) {
    if (!id) return;
    var l = ledger();
    if (l.indexOf(id) === -1) { l.push(id); lsSet(LEDGER_KEY, JSON.stringify(l.slice(-500))); }
    cookieMark(id);
  }
  function cookieMark(id) {
    try { document.cookie = 'kolkli_trial=' + encodeURIComponent(String(id).slice(0, 40)) + '; path=/; max-age=31536000; SameSite=Lax'; } catch (_) {}
  }
  function cookieClaimed() { try { return /(?:^|;\s*)kolkli_trial=/.test(document.cookie); } catch (_) { return false; } }

  function workerConfigured() { return !!(window.KolkliUsage && KolkliUsage.configured && KolkliUsage.configured()); }
  function authConfigured() { return !!(window.KolkliAuth && window.KolkliAuth.configured && window.KolkliAuth.configured()); }

  // ---- users ----
  function findIndex(users, email) {
    email = String(email || '').toLowerCase();
    for (var i = 0; i < users.length; i++) if ((users[i].email || '').toLowerCase() === email) return i;
    return -1;
  }

  function applyGrant(users, i, endsAt) {
    var u = users[i];
    u.plan = TRIAL_PLAN;
    u.trial = { active: true, plan: TRIAL_PLAN, startedAt: now(), endsAt: endsAt };
    u.trialUsed = true;                    // this account can't re-trigger a trial
    users[i] = u;
    saveUsers(users);
    if ((u.email || '').toLowerCase() === sessionEmail()) lsSet(PLAN_KEY, TRIAL_PLAN);
    try { window.dispatchEvent(new CustomEvent('kolkli:auth')); } catch (_) {}   // header/dashboard refresh
  }

  function markTrialSpent(users, i) {
    // fingerprint already used elsewhere → record so we don't retry, stay Free.
    users[i].trialUsed = true;
    saveUsers(users);
  }

  // ---- authoritative gate: Worker when deployed, else local fingerprint ledger ----
  async function fingerprintBlocked(fp) {
    if (workerConfigured() && window.KolkliUsage && KolkliUsage.claimTrial) {
      try {
        var r = await KolkliUsage.claimTrial();
        if (r && r.ok && typeof r.granted === 'boolean' && !r.skipped) return r.granted === false;
      } catch (_) { /* fall through to local */ }
    }
    return ledgerHas(fp) || ledgerHas(anonId()) || cookieClaimed();
  }

  // ---- public: grant a trial right after a successful sign-up ----
  async function grantOnSignup(email) {
    email = String(email || '').toLowerCase();
    if (!email) return { granted: false, reason: 'no_email' };
    var users = loadUsers();
    var i = findIndex(users, email);
    if (i < 0) return { granted: false, reason: 'no_user' };
    var u = users[i];
    if (u.plan && u.plan !== 'free') return { granted: false, reason: 'has_plan' };  // paid / already trialing
    if (u.trialUsed) return { granted: false, reason: 'trial_used' };

    var fp = await fingerprint();
    if (await fingerprintBlocked(fp)) {
      users = loadUsers(); i = findIndex(users, email);        // reload (claim may have run)
      if (i > -1) markTrialSpent(users, i);
      return { granted: false, reason: 'fingerprint' };
    }

    ledgerAdd(fp);
    ledgerAdd(anonId());

    // Supabase live → grant server-side via start_trial() (the DB enforces
    // one-per-account and persists it, so the next session sync keeps the
    // trial). writeLocalUser reflects it into the mirror. Fall back to a local
    // grant if the RPC fails so the UX still works.
    if (authConfigured() && window.KolkliAuth.startTrial) {
      try {
        var sr = await window.KolkliAuth.startTrial();
        if (sr && sr.ok) return { granted: true, endsAt: sr.endsAt ? Date.parse(sr.endsAt) : (now() + TRIAL_DAYS * DAY_MS) };
      } catch (_) { /* fall through to local grant */ }
    }

    var endsAt = now() + TRIAL_DAYS * DAY_MS;
    users = loadUsers(); i = findIndex(users, email);
    if (i < 0) return { granted: false, reason: 'no_user' };
    applyGrant(users, i, endsAt);
    return { granted: true, endsAt: endsAt };
  }

  // ---- public: current trial status for the UI ----
  function status(userOrEmail) {
    var u = userOrEmail;
    if (!u || typeof u === 'string') {
      var users = loadUsers();
      var i = findIndex(users, typeof u === 'string' ? u : sessionEmail());
      u = i > -1 ? users[i] : null;
    }
    if (!u || !u.trial || !u.trial.active) return null;
    var active = now() < u.trial.endsAt && u.plan === u.trial.plan;
    if (!active) return { active: false, plan: u.trial.plan, endsAt: u.trial.endsAt, daysLeft: 0 };
    return {
      active: true, plan: u.trial.plan, endsAt: u.trial.endsAt,
      daysLeft: Math.max(1, Math.ceil((u.trial.endsAt - now()) / DAY_MS))
    };
  }

  // ---- lazy expiry sweep: downgrade finished trials to Free ----
  function sweep() {
    var users = loadUsers();
    var changed = false;
    for (var i = 0; i < users.length; i++) {
      var u = users[i];
      if (u && u.trial && u.trial.active && now() >= u.trial.endsAt) {
        u.trial.active = false;
        u.trialExpired = true;
        if (u.plan === u.trial.plan) u.plan = 'free';          // only if still on the trial plan (didn't upgrade)
        users[i] = u;
        changed = true;
        if ((u.email || '').toLowerCase() === sessionEmail() && u.plan === 'free') lsSet(PLAN_KEY, 'free');
      }
    }
    if (changed) {
      saveUsers(users);
      try { window.dispatchEvent(new CustomEvent('kolkli:auth')); } catch (_) {}
    }
    return changed;
  }

  window.KolkliTrial = {
    DAYS: TRIAL_DAYS,
    PLAN: TRIAL_PLAN,
    grantOnSignup: grantOnSignup,
    status: status,
    sweep: sweep
  };

  sweep();   // run once on load so expired trials revert before the plan is read
})();
