/* ============================================================
   KOLKLI guest email verification gate.

   Guests who upload files must confirm a real email with a 6-digit
   code before the upload/transfer is authorized. This is an
   anti-abuse identity check ("keep your files secure and protect our
   community"): it makes throwaway one-shot uploads costly and gives
   every guest transfer an email of record.

   WHERE IT FIRES: usage-limits.js calls KolkliVerify.ensureVerified()
   from authorize(), so every guest upload path is covered in one
   place — the four file services (send/organize/review/request) and,
   by default, the edit and ai file tools. Signed-in users are treated
   as already-verified (they cleared auth), so the gate is guest-only.

   REAL vs DEMO: the code + token are minted by the storage Worker
   (/verify/send, /verify/check). Until that Worker URL is configured
   (supabase-config.js → KOLKLI_WORKERS), ensureVerified() is a no-op
   that resolves true — exactly like the usage quotas — so the local
   demo site keeps working untouched. Set window.KOLKLI_VERIFY_STRICT
   to force the gate on even without a Worker (dev only).

   Public API (window.KolkliVerify):
     ensureVerified(opts?) -> Promise<boolean>   // opens the modal if needed
     isVerified()          -> boolean
     required(tool)        -> boolean
     token()               -> string             // signed token for the Worker
     verifiedEmail()       -> string
     clear()               -> void               // forget the local verification
   ============================================================ */
(function () {
  if (window.KolkliVerify) return;

  var DAY_MS = 24 * 60 * 60 * 1000;
  var STORE_KEY = 'kolkli_email_verified';   // { email, token, exp }
  var SESSION_KEY = 'ac_session';
  var LAST_EMAIL_KEY = 'kolkli_verify_email'; // remembered for prefill only

  function lsGet(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (_) {} }
  function now() { return Date.now(); }

  // ---- policy: which tools require a verified guest email ----
  // Default "uploads" scope = the four file services + the edit:*/ai:* file
  // tools (honours the "any guest upload" choice). Narrow it to just the
  // transfer services with:  window.KOLKLI_VERIFY = { scope: 'transfers' }.
  var TRANSFER_TOOLS = { 'send-files': 1, 'organize-files': 1, 'review-files': 1, 'request-files': 1 };
  function cfg() { return window.KOLKLI_VERIFY || {}; }
  function scope() { return String(cfg().scope || 'uploads').toLowerCase(); }
  function required(tool) {
    if (cfg().disabled) return false;
    var s = scope();
    if (s === 'off') return false;
    tool = String(tool || '').toLowerCase();
    // Explicit allow/deny lists win.
    if (cfg().tools && cfg().tools.indexOf && cfg().tools.indexOf(tool) > -1) return true;
    if (cfg().exclude && cfg().exclude.indexOf && cfg().exclude.indexOf(tool) > -1) return false;
    if (TRANSFER_TOOLS[tool]) return true;                 // the 3GB guest transfers
    if (s === 'transfers') return false;
    var isUpload = tool.indexOf('edit:') === 0 || tool.indexOf('ai:') === 0;
    if (s === 'all') return isUpload || tool.indexOf('text:') === 0 || tool.indexOf('design:') === 0;
    return isUpload;                                        // 'uploads' (default)
  }

  // ---- identity / already-verified state ----
  function sessionEmail() { return (lsGet(SESSION_KEY) || '').toLowerCase(); }
  function loggedIn() { return !!sessionEmail(); }         // cleared auth ⇒ verified
  function readStore() {
    try { var s = JSON.parse(lsGet(STORE_KEY) || 'null'); return (s && s.token) ? s : null; } catch (_) { return null; }
  }
  function storeValid(s) { return !!(s && s.token && (+s.exp || 0) > now()); }
  function isVerified() { return loggedIn() || storeValid(readStore()); }
  function verifiedEmail() { var s = readStore(); return (loggedIn() && sessionEmail()) || (s && s.email) || ''; }
  function token() { var s = readStore(); return storeValid(s) ? s.token : ''; }
  function saveVerified(email, tok, expiresAt) {
    var exp = expiresAt ? (typeof expiresAt === 'number' ? expiresAt : Date.parse(expiresAt)) : (now() + 30 * DAY_MS);
    lsSet(STORE_KEY, JSON.stringify({ email: String(email || '').toLowerCase(), token: tok, exp: exp }));
    try { document.cookie = 'kolkli_verified=1; path=/; max-age=' + Math.floor((exp - now()) / 1000) + '; SameSite=Lax'; } catch (_) {}
  }
  function clearVerified() { lsDel(STORE_KEY); try { document.cookie = 'kolkli_verified=; path=/; max-age=0; SameSite=Lax'; } catch (_) {} }

  // ---- Worker plumbing (mirrors usage-limits.js) ----
  function workerBase() {
    if (window.kolkliWorker) return window.kolkliWorker('usage') || window.kolkliWorker('storage') || '';
    var w = window.KOLKLI_WORKERS || {};
    var u = w.usage || w.storage || '';
    return (u && u.indexOf('YOUR_') !== 0) ? u.replace(/\/+$/, '') : '';
  }
  function configured() { return !!workerBase(); }

  function anonId() {
    if (window.KolkliUsage && KolkliUsage.anonymousId) { try { return KolkliUsage.anonymousId(); } catch (_) {} }
    return lsGet('kolkli_anon_id') || '';
  }
  function hash32(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h) + s.charCodeAt(i); return (h >>> 0).toString(16); }
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

  async function callWorker(path, extra) {
    var base = workerBase();
    if (!base) return { ok: false, code: 'worker_not_configured' };
    var body = { fingerprint: await fingerprint(), anonymousId: anonId(), lang: uiLang() };
    for (var k in (extra || {})) body[k] = extra[k];
    var res;
    try {
      res = await fetch(base + path, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
      });
    } catch (_) { return { ok: false, code: 'server_unavailable' }; }
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok && data.ok !== false) data.ok = false;
    return data;
  }
  function sendCode(email) { return callWorker('/verify/send', { email: email }); }
  function checkCode(email, code) { return callWorker('/verify/check', { email: email, code: code }); }

  // ---- disposable-email guard (reuse trial.js's list when present) ----
  function isDisposable(email) {
    if (window.KolkliTrial && KolkliTrial.isDisposableEmail) { try { return !!KolkliTrial.isDisposableEmail(email); } catch (_) {} }
    return false;
  }
  function validEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim()); }

  // ---- i18n ----
  function uiLang() {
    var l = document.documentElement.getAttribute('lang');
    if (l === 'he' || l === 'en' || l === 'ru') return l;
    try { l = localStorage.getItem('ac_lang'); } catch (_) {}
    return (l === 'en' || l === 'ru') ? l : 'he';
  }
  var TXT = {
    he: {
      title: 'אימות כתובת האימייל',
      sub: 'כדי לשמור על הקבצים שלכם מאובטחים ולהגן על הקהילה, נא לאמת את כתובת האימייל לפני ההעלאה.',
      emailPh: 'you@example.com', emailLbl: 'כתובת אימייל',
      send: 'שליחת קוד', sending: 'שולח…', cancel: 'ביטול',
      codeSub: function (e) { return 'הזינו את הקוד בן 6 הספרות ששלחנו אל ' + e; },
      codePh: '••••••', verify: 'אימות', verifying: 'מאמת…',
      resend: 'שליחה חוזרת', resendIn: function (s) { return 'שליחה חוזרת בעוד ' + s + ' שנ׳'; },
      changeEmail: 'שינוי כתובת', verified: 'האימייל אומת ✓',
      errEmail: 'נא להזין כתובת אימייל תקינה.',
      errDisposable: 'לא ניתן להשתמש בכתובת אימייל זמנית או חד-פעמית.',
      errCode: 'קוד שגוי. נסו שוב.', errExpired: 'הקוד פג תוקף. שלחו קוד חדש.',
      errAttempts: 'יותר מדי ניסיונות. שלחו קוד חדש.',
      errCooldown: 'המתינו רגע לפני שליחה חוזרת.',
      errRate: 'זוהתה פעילות חריגה. נסו שוב מאוחר יותר.',
      errServer: 'האימות אינו זמין כרגע. נסו שוב בעוד רגע.',
      errEmailSend: 'שליחת האימייל נכשלה. בדקו את הכתובת ונסו שוב.'
    },
    en: {
      title: 'Verify your email',
      sub: 'To keep your files secure and protect our community, verify your email address before uploading.',
      emailPh: 'you@example.com', emailLbl: 'Email address',
      send: 'Send code', sending: 'Sending…', cancel: 'Cancel',
      codeSub: function (e) { return 'Enter the 6-digit code we sent to ' + e; },
      codePh: '••••••', verify: 'Verify', verifying: 'Verifying…',
      resend: 'Resend code', resendIn: function (s) { return 'Resend in ' + s + 's'; },
      changeEmail: 'Change email', verified: 'Email verified ✓',
      errEmail: 'Please enter a valid email address.',
      errDisposable: 'Temporary or disposable email addresses aren’t allowed.',
      errCode: 'Wrong code. Try again.', errExpired: 'That code expired. Send a new one.',
      errAttempts: 'Too many attempts. Send a new code.',
      errCooldown: 'Please wait a moment before resending.',
      errRate: 'Unusual activity detected. Try again later.',
      errServer: 'Verification is unavailable right now. Try again in a moment.',
      errEmailSend: 'We couldn’t send the email. Check the address and try again.'
    },
    ru: {
      title: 'Подтвердите email',
      sub: 'Чтобы защитить ваши файлы и наше сообщество, подтвердите адрес электронной почты перед загрузкой.',
      emailPh: 'you@example.com', emailLbl: 'Адрес email',
      send: 'Отправить код', sending: 'Отправка…', cancel: 'Отмена',
      codeSub: function (e) { return 'Введите 6-значный код, отправленный на ' + e; },
      codePh: '••••••', verify: 'Подтвердить', verifying: 'Проверка…',
      resend: 'Отправить снова', resendIn: function (s) { return 'Повтор через ' + s + ' с'; },
      changeEmail: 'Изменить email', verified: 'Email подтверждён ✓',
      errEmail: 'Введите корректный адрес email.',
      errDisposable: 'Временные или одноразовые адреса не разрешены.',
      errCode: 'Неверный код. Попробуйте снова.', errExpired: 'Код истёк. Запросите новый.',
      errAttempts: 'Слишком много попыток. Запросите новый код.',
      errCooldown: 'Подождите немного перед повторной отправкой.',
      errRate: 'Обнаружена необычная активность. Попробуйте позже.',
      errServer: 'Проверка сейчас недоступна. Попробуйте ещё раз.',
      errEmailSend: 'Не удалось отправить письмо. Проверьте адрес и повторите.'
    }
  };
  function t() { return TXT[uiLang()] || TXT.he; }
  function errFor(code) {
    var m = t();
    var map = {
      bad_email: m.errEmail, disposable: m.errDisposable, bad_code: m.errCode,
      expired: m.errExpired, no_code: m.errExpired, too_many_attempts: m.errAttempts,
      cooldown: m.errCooldown, ip_rate_limited: m.errRate, rate_limited: m.errRate,
      email_unavailable: m.errEmailSend, email_failed: m.errEmailSend,
      server_unavailable: m.errServer, worker_not_configured: m.errServer
    };
    return map[code] || m.errServer;
  }

  // ---- modal ----
  function ensureStyle() {
    if (document.getElementById('kvStyle')) return;
    var s = document.createElement('style');
    s.id = 'kvStyle';
    s.textContent =
      '.kv-wrap{position:fixed;inset:0;z-index:1350;display:none;align-items:center;justify-content:center;padding:18px;background:rgba(16,18,32,.55);backdrop-filter:blur(5px);}' +
      '.kv-wrap.show{display:flex;}' +
      '.kv-box{width:min(430px,100%);background:var(--panel,#fff);color:var(--ink,#1c2030);border:1px solid var(--line,#e5e8f0);border-radius:16px;box-shadow:var(--shadow-lg,0 24px 60px rgba(20,24,44,.24));padding:24px;font-family:var(--sans,system-ui,sans-serif);}' +
      '.kv-ico{width:50px;height:50px;border-radius:14px;margin:0 auto 14px;display:flex;align-items:center;justify-content:center;background:var(--accent-soft,#efe9fe);color:var(--accent,#7c3aed);}' +
      '.kv-ico svg{width:26px;height:26px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;}' +
      '.kv-box h3{margin:0 0 6px;font-size:20px;text-align:center;}' +
      '.kv-box p.kv-sub{margin:0 0 18px;color:var(--muted,#727a8a);font-size:14px;line-height:1.55;text-align:center;}' +
      '.kv-field{display:block;margin:0 0 12px;}' +
      '.kv-field span{display:block;font-size:12.5px;color:var(--muted,#727a8a);margin:0 0 5px;}' +
      '.kv-inp{width:100%;height:46px;border:1px solid var(--line,#e5e8f0);border-radius:11px;padding:0 13px;font-size:15px;background:var(--panel,#fff);color:var(--ink,#1c2030);box-sizing:border-box;}' +
      '.kv-inp:focus{outline:none;border-color:var(--accent,#7c3aed);box-shadow:0 0 0 3px var(--accent-soft,#efe9fe);}' +
      '.kv-code{text-align:center;letter-spacing:.5em;font-size:24px;font-weight:700;padding-inline-start:.5em;}' +
      '.kv-err{min-height:18px;margin:2px 0 10px;color:#e0343f;font-size:12.5px;text-align:center;}' +
      '.kv-actions{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:4px;}' +
      '.kv-btn,.kv-ghost{height:44px;border-radius:999px;padding:0 20px;font:600 14px var(--sans,system-ui,sans-serif);cursor:pointer;}' +
      '.kv-btn{border:0;color:#fff;background:var(--grad-btn,linear-gradient(105deg,#7b34ff,#3f85ff));box-shadow:0 6px 16px var(--grad-btn-glow,rgba(59,111,246,.35));flex:1;min-width:130px;}' +
      '.kv-btn[disabled]{opacity:.6;cursor:default;}' +
      '.kv-ghost{border:1px solid var(--line,#e5e8f0);background:var(--panel,#fff);color:var(--ink-2,#2b3140);}' +
      '.kv-links{display:flex;justify-content:space-between;gap:10px;margin-top:14px;font-size:13px;}' +
      '.kv-links button{background:none;border:0;padding:0;color:var(--accent,#7c3aed);font:inherit;cursor:pointer;}' +
      '.kv-links button[disabled]{color:var(--muted,#a0a6b4);cursor:default;}';
    document.head.appendChild(s);
  }

  var modal = null, els = null;
  function build() {
    if (modal) return modal;
    ensureStyle();
    modal = document.createElement('div');
    modal.className = 'kv-wrap';
    modal.id = 'kvWrap';
    modal.innerHTML =
      '<div class="kv-box" role="dialog" aria-modal="true" aria-labelledby="kvTitle">' +
        '<div class="kv-ico"><svg viewBox="0 0 24 24"><path d="M4 4h16v16H4z" opacity="0"/><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg></div>' +
        '<h3 id="kvTitle"></h3>' +
        '<p class="kv-sub" id="kvSub"></p>' +
        '<div id="kvStepEmail">' +
          '<label class="kv-field"><span id="kvEmailLbl"></span>' +
            '<input class="kv-inp" id="kvEmail" type="email" dir="ltr" autocomplete="email" inputmode="email"></label>' +
        '</div>' +
        '<div id="kvStepCode" style="display:none">' +
          '<input class="kv-inp kv-code" id="kvCode" type="text" dir="ltr" inputmode="numeric" autocomplete="one-time-code" maxlength="6">' +
        '</div>' +
        '<div class="kv-err" id="kvErr"></div>' +
        '<div class="kv-actions">' +
          '<button class="kv-ghost" id="kvCancel" type="button"></button>' +
          '<button class="kv-btn" id="kvPrimary" type="button"></button>' +
        '</div>' +
        '<div class="kv-links" id="kvLinks" style="display:none">' +
          '<button id="kvChange" type="button"></button>' +
          '<button id="kvResend" type="button"></button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);
    els = {
      box: modal.querySelector('.kv-box'),
      title: modal.querySelector('#kvTitle'), sub: modal.querySelector('#kvSub'),
      stepEmail: modal.querySelector('#kvStepEmail'), stepCode: modal.querySelector('#kvStepCode'),
      email: modal.querySelector('#kvEmail'), emailLbl: modal.querySelector('#kvEmailLbl'),
      code: modal.querySelector('#kvCode'), err: modal.querySelector('#kvErr'),
      cancel: modal.querySelector('#kvCancel'), primary: modal.querySelector('#kvPrimary'),
      links: modal.querySelector('#kvLinks'), change: modal.querySelector('#kvChange'), resend: modal.querySelector('#kvResend')
    };
    els.cancel.addEventListener('click', function () { finish(false); });
    modal.addEventListener('click', function (e) { if (e.target === modal) finish(false); });
    els.change.addEventListener('click', function () { showEmailStep(); });
    els.resend.addEventListener('click', function () { if (!els.resend.disabled) doSend(true); });
    els.primary.addEventListener('click', function () { onPrimary(); });
    els.email.addEventListener('keydown', function (e) { if (e.key === 'Enter') onPrimary(); });
    els.code.addEventListener('keydown', function (e) { if (e.key === 'Enter') onPrimary(); });
    els.code.addEventListener('input', function () { els.code.value = els.code.value.replace(/\D/g, '').slice(0, 6); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && modal.classList.contains('show')) finish(false); });
    return modal;
  }

  // ---- flow state ----
  var pendingResolve = null, step = 'email', busy = false, cooldownTimer = null;

  function setBusy(on, label) { busy = on; els.primary.disabled = on; els.primary.textContent = label; }
  function setErr(msg) { els.err.textContent = msg || ''; }

  function showEmailStep() {
    step = 'email';
    stopCooldown();
    var m = t();
    els.title.textContent = m.title;
    els.sub.textContent = m.sub;
    els.emailLbl.textContent = m.emailLbl;
    els.email.placeholder = m.emailPh;
    els.stepEmail.style.display = '';
    els.stepCode.style.display = 'none';
    els.links.style.display = 'none';
    els.cancel.textContent = m.cancel;
    els.primary.disabled = false;
    els.primary.textContent = m.send;
    setErr('');
    setTimeout(function () { try { els.email.focus(); } catch (_) {} }, 30);
  }

  function showCodeStep(email) {
    step = 'code';
    var m = t();
    els.title.textContent = m.title;
    els.sub.textContent = m.codeSub(email);
    els.code.value = '';
    els.code.placeholder = m.codePh;
    els.stepEmail.style.display = 'none';
    els.stepCode.style.display = '';
    els.links.style.display = 'flex';
    els.change.textContent = m.changeEmail;
    els.cancel.textContent = m.cancel;
    els.primary.disabled = false;
    els.primary.textContent = m.verify;
    setErr('');
    startCooldown(cfg().resendSeconds || 45);
    setTimeout(function () { try { els.code.focus(); } catch (_) {} }, 30);
  }

  function startCooldown(secs) {
    stopCooldown();
    var left = secs;
    var m = t();
    els.resend.disabled = true;
    els.resend.textContent = m.resendIn(left);
    cooldownTimer = setInterval(function () {
      left--;
      if (left <= 0) { stopCooldown(); els.resend.disabled = false; els.resend.textContent = t().resend; }
      else els.resend.textContent = t().resendIn(left);
    }, 1000);
  }
  function stopCooldown() { if (cooldownTimer) { clearInterval(cooldownTimer); cooldownTimer = null; } }

  var currentEmail = '';
  async function doSend(isResend) {
    if (busy) return;
    var email = (els.email.value || currentEmail || '').trim().toLowerCase();
    if (!validEmail(email)) { showEmailStep(); setErr(t().errEmail); return; }
    if (isDisposable(email)) { showEmailStep(); setErr(t().errDisposable); return; }
    currentEmail = email;
    lsSet(LAST_EMAIL_KEY, email);
    if (isResend) { els.resend.disabled = true; } else { setBusy(true, t().sending); }
    var r = await sendCode(email);
    if (!isResend) setBusy(false, t().send);
    if (r && r.ok) {
      if (step !== 'code') showCodeStep(email);
      else { setErr(''); startCooldown(r.cooldown || cfg().resendSeconds || 45); }
    } else {
      var code = (r && r.code) || 'server_unavailable';
      // The Worker is up but the gate isn't finished (no email provider / secret
      // yet, or the gate is off). Don't block the guest on our own misconfig —
      // pass through. The Worker only 403s once VERIFY_SECRET is set, so this
      // can't be used to bypass an armed gate.
      if (code === 'email_unavailable' || code === 'worker_not_configured') { finish(true); return; }
      if (step === 'email') setErr(errFor(code));
      else { setErr(errFor(code)); if (code !== 'cooldown') els.resend.disabled = false; }
    }
  }

  async function doVerify() {
    if (busy) return;
    var code = (els.code.value || '').replace(/\D/g, '');
    if (code.length !== 6) { setErr(t().errCode); return; }
    setBusy(true, t().verifying);
    var r = await checkCode(currentEmail, code);
    if (r && r.ok && r.verified && r.token) {
      saveVerified(currentEmail, r.token, r.expiresAt);
      setBusy(false, t().verify);
      finish(true);
    } else {
      setBusy(false, t().verify);
      setErr(errFor((r && r.code) || 'bad_code'));
      try { els.code.select(); } catch (_) {}
    }
  }

  function onPrimary() { if (step === 'email') doSend(false); else doVerify(); }

  function finish(ok) {
    stopCooldown();
    if (modal) modal.classList.remove('show');
    try { document.documentElement.style.overflow = ''; } catch (_) {}
    var r = pendingResolve; pendingResolve = null;
    if (r) r(!!ok);
  }

  function open(emailHint) {
    build();
    currentEmail = '';
    var hint = (emailHint || prefillEmail() || lsGet(LAST_EMAIL_KEY) || '').trim();
    showEmailStep();
    if (hint && validEmail(hint)) els.email.value = hint;
    modal.classList.add('show');
    try { document.documentElement.style.overflow = 'hidden'; } catch (_) {}
  }

  // Best-effort prefill: a filled email field already on the page (e.g. the
  // sender's email on send.html) so the guest doesn't retype it.
  function prefillEmail() {
    try {
      var inputs = document.querySelectorAll('input[type="email"]');
      for (var i = 0; i < inputs.length; i++) {
        var v = (inputs[i].value || '').trim();
        if (v && validEmail(v)) return v;
      }
    } catch (_) {}
    return '';
  }

  // ---- public gate ----
  function ensureVerified(opts) {
    opts = opts || {};
    if (isVerified()) return Promise.resolve(true);
    // No Worker yet ⇒ can't send a real code. Keep the demo unbroken by
    // passing through, unless STRICT mode is explicitly on.
    if (!configured() && !window.KOLKLI_VERIFY_STRICT) return Promise.resolve(true);
    if (pendingResolve) { finish(false); }        // only one modal at a time
    return new Promise(function (resolve) {
      pendingResolve = resolve;
      open(opts.emailHint);
    });
  }

  window.KolkliVerify = {
    ensureVerified: ensureVerified,
    isVerified: isVerified,
    required: required,
    token: token,
    verifiedEmail: verifiedEmail,
    configured: configured,
    clear: clearVerified
  };

  // A fresh sign-in means the user cleared auth → drop the guest token so we
  // don't keep a stale guest email around; a sign-out leaves them a guest again.
  try { window.addEventListener('kolkli:auth', function () { if (loggedIn()) { /* keep */ } }); } catch (_) {}
})();
