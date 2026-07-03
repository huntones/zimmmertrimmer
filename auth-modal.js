/* ============================================================
   Floating auth modal (KOLKLI) — one login/sign-up popup for
   the whole site. Self-contained: injects its own styles, markup
   and logic, then exposes window.AuthModal.{open,close}.

   How it hooks up:
     - header.js loads this file on every page (except auth.html,
       which IS the full-page version). By the time a user can
       click, the modal is ready.
     - A single delegated click listener turns EVERY link to
       auth.html into a popup: <a href="./auth.html"> opens the
       "login" tab, <a href="./auth.html?mode=signup"> the "signup"
       tab. If this script hasn't loaded yet, the link still works
       as a normal navigation to the full auth page — progressive
       enhancement, nothing breaks.
     - Also honours [data-auth-open="login|signup"] on any element.

   The auth logic mirrors auth.html (demo localStorage store); the
   real backend seam lives there. Ids/classes are all "am-"/"am"
   prefixed so they never collide with a page's own styles.
   ============================================================ */
(function () {
  if (window.AuthModal) return;            // guard against double-load

  var I18N = {
    he: {
      dir: 'rtl',
      loginTitle: 'ברוכים השבים', loginSub: 'התחברו כדי לגשת לקבצים ולקישורים שלכם.',
      signupTitle: 'יצירת חשבון', signupSub: 'הירשמו כדי לשמור קבצים, קישורים והיסטוריה.',
      tabLogin: 'התחברות', tabSignup: 'הרשמה',
      nameLabel: 'שם מלא', namePh: 'איך לקרוא לכם?',
      emailLabel: 'אימייל', emailPh: 'you@example.com',
      passLabel: 'סיסמה', passPh: 'לפחות 6 תווים',
      confirmLabel: 'אימות סיסמה', confirmPh: 'הקלידו שוב את הסיסמה',
      forgot: 'שכחתם סיסמה?',
      submitLogin: 'התחברות', submitSignup: 'יצירת חשבון',
      or: 'או', guest: 'המשך כאורח, בלי חשבון',
      switchToSignupText: 'אין לכם חשבון עדיין?', switchToSignupLink: 'הרשמה',
      switchToLoginText: 'כבר יש לכם חשבון?', switchToLoginLink: 'התחברות',
      privacy: 'ההרשמה נועדה רק לשמירת קבצים וקישורים. עריכת האודיו עצמה תמיד נשארת במחשב שלכם ולא עולה לשרת.',
      dashboard: 'לדשבורד', goFiles: 'לאזור הקבצים שלי', logout: 'התנתקות', close: 'סגירה',
      signedHi: function (n) { return 'שלום, ' + n + '!'; },
      welcomeBack: 'התחברת בהצלחה 👋', accountCreated: 'החשבון נוצר בהצלחה 🎉',
      errRequired: 'שדה חובה', errEmail: 'כתובת אימייל לא תקינה', errPassShort: 'הסיסמה חייבת לפחות 6 תווים',
      errMatch: 'הסיסמאות לא תואמות', errTaken: 'כבר קיים חשבון עם האימייל הזה', errNoUser: 'לא נמצא חשבון עם האימייל הזה',
      errWrongPass: 'סיסמה שגויה',
      forgotMsg: 'איפוס סיסמה יעבוד כשנחבר את השרת. בינתיים אפשר ליצור חשבון חדש.'
    },
    en: {
      dir: 'ltr',
      loginTitle: 'Welcome back', loginSub: 'Sign in to reach your files and share links.',
      signupTitle: 'Create account', signupSub: 'Sign up to save files, links and history.',
      tabLogin: 'Sign in', tabSignup: 'Sign up',
      nameLabel: 'Full name', namePh: 'What should we call you?',
      emailLabel: 'Email', emailPh: 'you@example.com',
      passLabel: 'Password', passPh: 'At least 6 characters',
      confirmLabel: 'Confirm password', confirmPh: 'Type the password again',
      forgot: 'Forgot password?',
      submitLogin: 'Sign in', submitSignup: 'Create account',
      or: 'or', guest: 'Continue as guest, no account',
      switchToSignupText: "Don't have an account?", switchToSignupLink: 'Sign up',
      switchToLoginText: 'Already have an account?', switchToLoginLink: 'Sign in',
      privacy: 'Accounts are only for saving files and links. Audio editing itself always stays on your machine and is never uploaded.',
      dashboard: 'Go to dashboard', goFiles: 'Go to my files', logout: 'Log out', close: 'Close',
      signedHi: function (n) { return 'Hi, ' + n + '!'; },
      welcomeBack: 'Signed in 👋', accountCreated: 'Account created 🎉',
      errRequired: 'Required field', errEmail: 'Invalid email address', errPassShort: 'Password must be at least 6 characters',
      errMatch: 'Passwords don’t match', errTaken: 'An account with this email already exists', errNoUser: 'No account found with this email',
      errWrongPass: 'Wrong password',
      forgotMsg: 'Password reset will work once the server is connected. For now you can create a new account.'
    },
    ru: {
      dir: 'ltr',
      loginTitle: 'С возвращением', loginSub: 'Войдите, чтобы получить доступ к файлам и ссылкам.',
      signupTitle: 'Создать аккаунт', signupSub: 'Зарегистрируйтесь, чтобы сохранять файлы, ссылки и историю.',
      tabLogin: 'Вход', tabSignup: 'Регистрация',
      nameLabel: 'Полное имя', namePh: 'Как к вам обращаться?',
      emailLabel: 'Эл. почта', emailPh: 'you@example.com',
      passLabel: 'Пароль', passPh: 'Минимум 6 символов',
      confirmLabel: 'Подтвердите пароль', confirmPh: 'Введите пароль ещё раз',
      forgot: 'Забыли пароль?',
      submitLogin: 'Войти', submitSignup: 'Создать аккаунт',
      or: 'или', guest: 'Продолжить как гость, без аккаунта',
      switchToSignupText: 'Нет аккаунта?', switchToSignupLink: 'Зарегистрироваться',
      switchToLoginText: 'Уже есть аккаунт?', switchToLoginLink: 'Войти',
      privacy: 'Аккаунты нужны только для сохранения файлов и ссылок. Само редактирование аудио всегда остаётся на вашем устройстве и никогда не загружается.',
      dashboard: 'В личный кабинет', goFiles: 'К моим файлам', logout: 'Выйти', close: 'Закрыть',
      signedHi: function (n) { return 'Привет, ' + n + '!'; },
      welcomeBack: 'Вы вошли 👋', accountCreated: 'Аккаунт создан 🎉',
      errRequired: 'Обязательное поле', errEmail: 'Неверный адрес почты', errPassShort: 'Пароль должен быть не менее 6 символов',
      errMatch: 'Пароли не совпадают', errTaken: 'Аккаунт с этой почтой уже существует', errNoUser: 'Аккаунт с этой почтой не найден',
      errWrongPass: 'Неверный пароль',
      forgotMsg: 'Сброс пароля заработает после подключения сервера. Пока можно создать новый аккаунт.'
    }
  };

  var lang = 'he', t = I18N.he;
  var mode = 'login';                       // 'login' | 'signup'
  var lastFocus = null;

  // ---------- styles (scoped, driven by each page's CSS variables) ----------
  var CSS =
    '.am-overlay{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;' +
      'padding:20px;background:rgba(16,18,32,.52);backdrop-filter:saturate(1.2) blur(5px);' +
      'opacity:0;visibility:hidden;transition:opacity .2s ease,visibility .2s ease;font-family:var(--sans,system-ui,"Segoe UI",sans-serif);}' +
    '.am-overlay.am-show{opacity:1;visibility:visible;}' +
    'body.am-lock{overflow:hidden;}' +
    '.am-dialog{position:relative;width:100%;max-width:384px;max-height:calc(100vh - 40px);overflow:auto;' +
      'background:var(--panel,#fff);border:1px solid var(--line,#e5e8f0);border-radius:18px;color:var(--ink,#1c2030);' +
      'box-shadow:var(--shadow-lg,0 24px 60px rgba(20,24,44,.28));padding:24px 26px 22px;' +
      'transform:translateY(14px) scale(.985);transition:transform .22s cubic-bezier(.2,.8,.25,1);}' +
    '.am-overlay.am-show .am-dialog{transform:none;}' +
    '.am-x{position:absolute;top:12px;inset-inline-end:12px;width:34px;height:34px;border:none;background:none;' +
      'color:var(--faint,#9aa1b1);cursor:pointer;border-radius:9px;display:flex;align-items:center;justify-content:center;' +
      'transition:color .12s,background .12s;}' +
    '.am-x:hover{color:var(--ink,#1c2030);background:var(--panel-2,#f5f6fa);}' +
    '.am-x svg{width:20px;height:20px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;}' +

    '.am-head{text-align:center;margin-bottom:16px;}' +
    '.am-logo{width:46px;height:46px;margin:0 auto 12px;border-radius:15px;display:flex;align-items:center;justify-content:center;' +
      'background:var(--grad,linear-gradient(105deg,#8b2fe0,#3b6ff6 52%,#22d3a0));color:#fff;box-shadow:0 6px 18px var(--grad-shadow,rgba(93,79,240,.3));}' +
    '.am-logo svg{width:24px;height:24px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;}' +
    '.am-head h1{font-size:20px;font-weight:700;letter-spacing:-.02em;margin:0 0 4px;}' +
    '.am-head p{font-size:13.5px;color:var(--muted,#727a8a);margin:0;}' +

    '.am-seg{display:flex;gap:4px;background:var(--panel-2,#f5f6fa);border:1px solid var(--line,#e5e8f0);border-radius:12px;padding:4px;margin-bottom:16px;}' +
    '.am-segbtn{flex:1;height:36px;border:none;border-radius:9px;background:transparent;color:var(--muted,#727a8a);cursor:pointer;' +
      'font-family:inherit;font-size:14px;font-weight:600;transition:color .14s,background .14s,box-shadow .14s;}' +
    '.am-segbtn.on{background:var(--panel,#fff);color:var(--accent-dim,#6a2fe0);box-shadow:var(--shadow-sm,0 1px 2px rgba(20,24,44,.06));}' +

    '.am-field{margin-bottom:11px;}' +
    '.am-field.am-hidden{display:none;}' +
    '.am-field label{display:block;font-size:12.5px;font-weight:600;color:var(--ink-2,#2b3140);margin-bottom:6px;}' +
    '.am-inwrap{position:relative;display:flex;align-items:center;}' +
    '.am-field input{width:100%;background:var(--panel-2,#f5f6fa);border:1px solid var(--line,#e5e8f0);color:var(--ink,#1c2030);' +
      'border-radius:10px;font-family:inherit;font-size:14px;padding:11px 12px;transition:border-color .12s,box-shadow .12s;}' +
    '.am-field input::placeholder{color:var(--faint,#9aa1b1);}' +
    '.am-field input:focus{outline:none;border-color:var(--accent,#7c3aed);box-shadow:0 0 0 3px var(--accent-soft,#efe9fe);}' +
    '.am-field.am-bad input{border-color:var(--danger,#e5484d);}' +
    '.am-field.am-bad input:focus{box-shadow:0 0 0 3px var(--danger-soft,#fdecec);}' +
    '.am-eye{position:absolute;right:6px;left:auto;width:32px;height:32px;border:none;background:none;color:var(--faint,#9aa1b1);' +
      'cursor:pointer;display:flex;align-items:center;justify-content:center;border-radius:8px;transition:color .12s,background .12s;}' +
    '.am-inwrap:has(.am-eye) input{padding-right:42px;}' +
    '.am-eye:hover{color:var(--accent,#7c3aed);background:var(--panel,#fff);}' +
    '.am-eye svg{width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;}' +
    '.am-err{font-size:11.5px;color:var(--danger,#e5484d);margin-top:5px;min-height:14px;line-height:1.3;}' +

    '.am-forgot{display:inline-block;font-size:12.5px;color:var(--accent-dim,#6a2fe0);margin:-4px 0 4px;cursor:pointer;}' +
    '.am-forgot:hover{text-decoration:underline;}' +
    '.am-forgot.am-hidden{display:none;}' +

    '.am-btn{width:100%;display:inline-flex;align-items:center;justify-content:center;gap:9px;color:#fff;border:none;cursor:pointer;' +
      'background:linear-gradient(180deg,rgba(255,255,255,.25),rgba(255,255,255,0) 55%),var(--grad-btn,linear-gradient(105deg,#8b2fe0,#3b6ff6 52%,#22d3a0));' +
      'font-family:inherit;font-weight:600;font-size:15px;padding:12px 20px;border-radius:999px;text-shadow:0 1px 2px rgba(0,0,0,.18);margin-top:6px;' +
      'box-shadow:inset 0 1px 0 rgba(255,255,255,.5),inset 0 -2px 4px rgba(0,0,0,.14),0 8px 20px var(--grad-btn-glow,rgba(59,111,246,.38));' +
      'transition:filter .14s,transform .08s;}' +
    '.am-btn:hover{filter:brightness(1.05);} .am-btn:active{transform:translateY(1px);}' +
    '.am-btn:disabled{opacity:.6;cursor:default;filter:none;transform:none;}' +
    '.am-btn svg{width:17px;height:17px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;}' +

    '.am-msg{font-size:13px;border-radius:10px;padding:10px 12px;margin-bottom:14px;display:none;line-height:1.5;}' +
    '.am-msg.show{display:block;}' +
    '.am-msg.err{background:var(--danger-soft,#fdecec);color:var(--danger,#e5484d);}' +
    '.am-msg.info{background:var(--info-soft,#e8f0fe);color:var(--info-dim,#2f6fd6);}' +

    '.am-divider{display:flex;align-items:center;gap:12px;margin:16px 0 14px;color:var(--faint,#9aa1b1);font-size:12px;font-family:var(--mono,monospace);}' +
    '.am-divider::before,.am-divider::after{content:"";flex:1;height:1px;background:var(--line,#e5e8f0);}' +
    '.am-guest{width:100%;display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:11px 18px;border-radius:999px;' +
      'font-size:14px;font-weight:600;background:var(--panel,#fff);border:1px solid var(--line,#e5e8f0);color:var(--ink-2,#2b3140);cursor:pointer;' +
      'text-decoration:none;box-shadow:var(--shadow-sm,0 1px 2px rgba(20,24,44,.06));transition:border-color .12s,transform .08s;}' +
    '.am-guest:hover{border-color:var(--accent,#7c3aed);} .am-guest:active{transform:translateY(1px);}' +
    '.am-guest svg{width:16px;height:16px;color:var(--muted,#727a8a);stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;}' +

    '.am-switch{text-align:center;font-size:13.5px;color:var(--muted,#727a8a);margin-top:16px;}' +
    '.am-switch a{color:var(--accent-dim,#6a2fe0);font-weight:600;cursor:pointer;}' +
    '.am-switch a:hover{text-decoration:underline;}' +

    '.am-note{display:flex;align-items:flex-start;gap:8px;margin-top:16px;padding:11px 13px;border-radius:11px;' +
      'background:var(--panel-2,#f5f6fa);border:1px solid var(--line-2,#eef0f6);font-size:11.5px;color:var(--muted,#727a8a);line-height:1.55;}' +
    '.am-note svg{width:15px;height:15px;color:var(--success,#22b04b);flex-shrink:0;margin-top:1px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;}' +

    '.am-signed{text-align:center;display:none;}' +
    '.am-signed.show{display:block;}' +
    '.am-avatar{width:64px;height:64px;margin:0 auto 16px;border-radius:50%;display:flex;align-items:center;justify-content:center;' +
      'background:var(--grad,linear-gradient(105deg,#8b2fe0,#3b6ff6 52%,#22d3a0));color:#fff;font-size:26px;font-weight:700;box-shadow:0 6px 18px var(--grad-shadow,rgba(93,79,240,.3));}' +
    '.am-signed h2{font-size:20px;margin:0 0 4px;font-weight:700;}' +
    '.am-who{font-family:var(--mono,monospace);font-size:12.5px;color:var(--muted,#727a8a);margin-bottom:22px;direction:ltr;}' +
    '.am-actions{display:flex;flex-direction:column;gap:10px;}' +
    '.am-hidden-view{display:none !important;}';

  // ---------- markup ----------
  var HTML =
    '<div class="am-dialog" role="dialog" aria-modal="true" aria-labelledby="amTitle">' +
      '<button class="am-x" id="amClose" type="button">' +
        '<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
      '</button>' +

      '<div id="amFormView">' +
        '<div class="am-head">' +
          '<div class="am-logo"><svg viewBox="0 0 24 24"><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/><path d="M9 18V5l12-2v11"/></svg></div>' +
          '<h1 id="amTitle"></h1><p id="amSub"></p>' +
        '</div>' +

        '<div class="am-seg" role="tablist">' +
          '<button class="am-segbtn on" id="amTabLogin" type="button"></button>' +
          '<button class="am-segbtn" id="amTabSignup" type="button"></button>' +
        '</div>' +

        '<div class="am-msg" id="amMsg"></div>' +

        '<form id="amForm" novalidate autocomplete="on">' +
          '<div class="am-field am-hidden" id="amNameField">' +
            '<label for="amName"></label>' +
            '<div class="am-inwrap"><input id="amName" type="text" autocomplete="name"></div>' +
            '<div class="am-err" id="amNameErr"></div>' +
          '</div>' +
          '<div class="am-field" id="amEmailField">' +
            '<label for="amEmail"></label>' +
            '<div class="am-inwrap"><input id="amEmail" type="email" dir="ltr" autocomplete="email"></div>' +
            '<div class="am-err" id="amEmailErr"></div>' +
          '</div>' +
          '<div class="am-field" id="amPassField">' +
            '<label for="amPass"></label>' +
            '<div class="am-inwrap">' +
              '<input id="amPass" type="password" dir="ltr" autocomplete="current-password">' +
              '<button class="am-eye" id="amEye" type="button" tabindex="-1" aria-label="show password">' +
                '<svg id="amEyeOpen" viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>' +
                '<svg id="amEyeShut" viewBox="0 0 24 24" style="display:none"><path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c7 0 10 8 10 8a13.2 13.2 0 0 1-1.67 2.68"/><path d="M6.6 6.6C3.6 8.3 2 12 2 12s3 8 10 8a9.3 9.3 0 0 0 5.4-1.6"/><path d="m2 2 20 20"/></svg>' +
              '</button>' +
            '</div>' +
            '<div class="am-err" id="amPassErr"></div>' +
          '</div>' +
          '<div class="am-field am-hidden" id="amConfirmField">' +
            '<label for="amConfirm"></label>' +
            '<div class="am-inwrap"><input id="amConfirm" type="password" dir="ltr" autocomplete="new-password"></div>' +
            '<div class="am-err" id="amConfirmErr"></div>' +
          '</div>' +

          '<a class="am-forgot" id="amForgot"></a>' +
          '<button class="am-btn" id="amSubmit" type="submit"></button>' +
        '</form>' +

        '<div class="am-divider" id="amOr"></div>' +
        '<a class="am-guest" href="./app.html">' +
          '<svg viewBox="0 0 24 24"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>' +
          '<span id="amGuest"></span>' +
        '</a>' +

        '<div class="am-switch"><span id="amSwitchText"></span> <a id="amSwitchLink"></a></div>' +

        '<div class="am-note">' +
          '<svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/></svg>' +
          '<span id="amPrivacy"></span>' +
        '</div>' +
      '</div>' +

      '<div class="am-signed" id="amSignedView">' +
        '<div class="am-avatar" id="amAvatar"></div>' +
        '<h2 id="amSignedHi"></h2>' +
        '<div class="am-who" id="amSignedWho"></div>' +
        '<div class="am-actions">' +
          '<a class="am-btn" id="amGoFiles" href="./dashboard.html" style="text-decoration:none">' +
            '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>' +
            '<span id="amGoFilesTx"></span>' +
          '</a>' +
          '<a class="am-guest" id="amMyFiles" href="./files.html" style="text-decoration:none">' +
            '<svg viewBox="0 0 24 24"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>' +
            '<span id="amMyFilesTx"></span>' +
          '</a>' +
          '<button class="am-guest" id="amLogout" type="button">' +
            '<svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></svg>' +
            '<span id="amLogoutTx"></span>' +
          '</button>' +
        '</div>' +
      '</div>' +
    '</div>';

  var overlay, root;
  var q = function (id) { return root.querySelector('#' + id); };

  // =====================================================
  //  DEMO AUTH STORE (localStorage) — mirrors auth.html.
  //  Replace with real server API calls (see SPEC.md §16).
  // =====================================================
  var USERS_KEY = 'ac_users', SESSION_KEY = 'ac_session';
  function loadUsers() { try { return JSON.parse(localStorage.getItem(USERS_KEY)) || []; } catch (_) { return []; } }
  function saveUsers(u) { try { localStorage.setItem(USERS_KEY, JSON.stringify(u)); } catch (_) {} }
  function findUser(email) { return loadUsers().find(function (u) { return u.email === email.toLowerCase(); }); }
  // Let the shared header (and anything else) react to sign-in / sign-out
  // in the same tab — the native `storage` event only fires in OTHER tabs.
  function notifyAuth() { try { window.dispatchEvent(new CustomEvent('kolkli:auth')); } catch (_) {} }
  function setSession(email) { try { localStorage.setItem(SESSION_KEY, email.toLowerCase()); } catch (_) {} notifyAuth(); }
  function clearSession() { try { localStorage.removeItem(SESSION_KEY); } catch (_) {} notifyAuth(); }
  function currentSession() { try { return localStorage.getItem(SESSION_KEY); } catch (_) { return null; } }

  function hashPass(str) {
    try {
      if (window.crypto && crypto.subtle) {
        return crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)).then(function (buf) {
          return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
        });
      }
    } catch (_) {}
    var h = 5381; for (var i = 0; i < str.length; i++) { h = ((h << 5) + h) + str.charCodeAt(i); h |= 0; }
    return Promise.resolve('x' + (h >>> 0).toString(16));
  }

  // Seed the bootstrap admin so it can sign in on any browser with a known demo
  // password. Create-if-missing only — never clobbers a real account someone
  // already registered with a different password. (Demo store; not real auth.)
  (function seedAdmin() {
    try {
      var email = 'digitalzimmer@gmail.com';
      if (findUser(email)) return;
      hashPass('test1234').then(function (h) {
        if (findUser(email)) return;                 // re-check after async hash
        var users = loadUsers();
        users.push({ name: 'Tal Zimmer', email: email, pass: h, role: 'admin', plan: 'pro', created: Date.now() });
        saveUsers(users);
      });
    } catch (_) {}
  })();

  // =====================================================
  //  VALIDATION
  // =====================================================
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  function setErr(fieldId, errId, msg) {
    q(fieldId).classList.toggle('am-bad', !!msg);
    q(errId).textContent = msg || '';
  }
  function clearErrors() {
    ['amNameField', 'amEmailField', 'amPassField', 'amConfirmField'].forEach(function (f) { q(f).classList.remove('am-bad'); });
    ['amNameErr', 'amEmailErr', 'amPassErr', 'amConfirmErr'].forEach(function (e) { q(e).textContent = ''; });
    showMsg('');
  }
  function showMsg(text, kind) {
    var m = q('amMsg');
    m.textContent = text || '';
    m.className = 'am-msg' + (text ? (' show ' + (kind || 'info')) : '');
  }

  // =====================================================
  //  SUBMIT
  // =====================================================
  function onSubmit(e) {
    e.preventDefault();
    clearErrors();
    var name = q('amName').value.trim();
    var email = q('amEmail').value.trim().toLowerCase();
    var pass = q('amPass').value;
    var confirm = q('amConfirm').value;

    var ok = true;
    if (mode === 'signup' && !name) { setErr('amNameField', 'amNameErr', t.errRequired); ok = false; }
    if (!email) { setErr('amEmailField', 'amEmailErr', t.errRequired); ok = false; }
    else if (!EMAIL_RE.test(email)) { setErr('amEmailField', 'amEmailErr', t.errEmail); ok = false; }
    if (!pass) { setErr('amPassField', 'amPassErr', t.errRequired); ok = false; }
    else if (pass.length < 6) { setErr('amPassField', 'amPassErr', t.errPassShort); ok = false; }
    if (mode === 'signup') {
      if (!confirm) { setErr('amConfirmField', 'amConfirmErr', t.errRequired); ok = false; }
      else if (confirm !== pass) { setErr('amConfirmField', 'amConfirmErr', t.errMatch); ok = false; }
    }
    if (!ok) return;

    q('amSubmit').disabled = true;
    Promise.resolve().then(function () {
      if (mode === 'signup') {
        if (findUser(email)) { setErr('amEmailField', 'amEmailErr', t.errTaken); return; }
        return hashPass(pass).then(function (h) {
          var users = loadUsers();
          users.push({ name: name, email: email, pass: h, created: Date.now() });
          saveUsers(users);
          setSession(email);
          showSigned(name, email);
        });
      }
      var u = findUser(email);
      if (!u) { setErr('amEmailField', 'amEmailErr', t.errNoUser); return; }
      return hashPass(pass).then(function (h) {
        if (u.pass !== h) { setErr('amPassField', 'amPassErr', t.errWrongPass); return; }
        setSession(email);
        showSigned(u.name, email);
      });
    }).finally(function () { q('amSubmit').disabled = false; });
  }

  // =====================================================
  //  VIEWS
  // =====================================================
  function setMode(m) {
    mode = m;
    q('amTabLogin').classList.toggle('on', m === 'login');
    q('amTabSignup').classList.toggle('on', m === 'signup');
    q('amNameField').classList.toggle('am-hidden', m !== 'signup');
    q('amConfirmField').classList.toggle('am-hidden', m !== 'signup');
    q('amForgot').classList.toggle('am-hidden', m !== 'login');
    q('amPass').setAttribute('autocomplete', m === 'signup' ? 'new-password' : 'current-password');
    q('amTitle').textContent = m === 'signup' ? t.signupTitle : t.loginTitle;
    q('amSub').textContent = m === 'signup' ? t.signupSub : t.loginSub;
    q('amSubmit').textContent = m === 'signup' ? t.submitSignup : t.submitLogin;
    q('amSwitchText').textContent = m === 'signup' ? t.switchToLoginText : t.switchToSignupText;
    q('amSwitchLink').textContent = m === 'signup' ? t.switchToLoginLink : t.switchToSignupLink;
    clearErrors();
  }

  function showSigned(name, email) {
    q('amFormView').classList.add('am-hidden-view');
    q('amSignedView').classList.add('show');
    q('amAvatar').textContent = (name || email || '?').trim().charAt(0).toUpperCase();
    q('amSignedHi').textContent = t.signedHi(name || email.split('@')[0]);
    q('amSignedWho').textContent = email;
  }
  function showForm() {
    q('amSignedView').classList.remove('show');
    q('amFormView').classList.remove('am-hidden-view');
  }

  // =====================================================
  //  I18N — follows the page language (html[lang]).
  // =====================================================
  function curLang() {
    var l = document.documentElement.getAttribute('lang');
    if (l === 'he' || l === 'en' || l === 'ru') return l;
    try { l = localStorage.getItem('ac_lang'); } catch (_) {}
    return (l === 'en' || l === 'ru') ? l : 'he';
  }
  function applyLang() {
    lang = curLang(); t = I18N[lang];
    q('amTabLogin').textContent = t.tabLogin;
    q('amTabSignup').textContent = t.tabSignup;
    q('amNameField').querySelector('label').textContent = t.nameLabel;
    q('amName').setAttribute('placeholder', t.namePh);
    q('amEmailField').querySelector('label').textContent = t.emailLabel;
    q('amEmail').setAttribute('placeholder', t.emailPh);
    q('amPassField').querySelector('label').textContent = t.passLabel;
    q('amPass').setAttribute('placeholder', t.passPh);
    q('amConfirmField').querySelector('label').textContent = t.confirmLabel;
    q('amConfirm').setAttribute('placeholder', t.confirmPh);
    q('amForgot').textContent = t.forgot;
    q('amOr').textContent = t.or;
    q('amGuest').textContent = t.guest;
    q('amPrivacy').textContent = t.privacy;
    q('amGoFilesTx').textContent = t.dashboard;
    q('amMyFilesTx').textContent = t.goFiles;
    q('amLogoutTx').textContent = t.logout;
    q('amClose').setAttribute('aria-label', t.close);
    setMode(mode);                          // re-label mode-specific strings
    var sess = currentSession();            // re-label signed-in view if visible
    if (sess) { var u = findUser(sess); if (u) q('amSignedHi').textContent = t.signedHi(u.name || sess.split('@')[0]); }
  }

  // =====================================================
  //  OPEN / CLOSE
  // =====================================================
  function open(m) {
    build();
    applyLang();
    var sess = currentSession();
    if (sess) {
      var u = findUser(sess);
      if (u) { showSigned(u.name, u.email); } else { clearSession(); setMode(m || 'login'); showForm(); }
    } else {
      setMode(m || 'login'); showForm();
    }
    lastFocus = document.activeElement;
    document.body.classList.add('am-lock');
    overlay.hidden = false;
    // force reflow so the transition runs
    void overlay.offsetWidth;
    overlay.classList.add('am-show');
    setTimeout(function () {
      var first = q('amSignedView').classList.contains('show') ? q('amGoFiles') : q('amEmail');
      if (first) try { first.focus(); } catch (_) {}
    }, 60);
  }
  function close() {
    if (!overlay) return;
    overlay.classList.remove('am-show');
    document.body.classList.remove('am-lock');
    setTimeout(function () { if (overlay && !overlay.classList.contains('am-show')) overlay.hidden = true; }, 220);
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (_) {} }
  }

  // =====================================================
  //  BUILD (once)
  // =====================================================
  var built = false;
  function build() {
    if (built) return; built = true;

    var style = document.createElement('style');
    style.id = 'am-style';
    style.textContent = CSS;
    document.head.appendChild(style);

    overlay = document.createElement('div');
    overlay.className = 'am-overlay';
    overlay.id = 'authModal';
    overlay.hidden = true;
    overlay.innerHTML = HTML;
    document.body.appendChild(overlay);
    root = overlay;

    q('amTabLogin').addEventListener('click', function () { setMode('login'); });
    q('amTabSignup').addEventListener('click', function () { setMode('signup'); });
    q('amSwitchLink').addEventListener('click', function () { setMode(mode === 'login' ? 'signup' : 'login'); });
    q('amForm').addEventListener('submit', onSubmit);
    q('amForgot').addEventListener('click', function () { showMsg(t.forgotMsg, 'info'); });
    q('amEye').addEventListener('click', function () {
      var inp = q('amPass'), show = inp.type === 'password';
      inp.type = show ? 'text' : 'password';
      q('amEyeOpen').style.display = show ? 'none' : '';
      q('amEyeShut').style.display = show ? '' : 'none';
    });
    q('amLogout').addEventListener('click', function () { clearSession(); setMode('login'); showForm(); q('amForm').reset(); });
    q('amClose').addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });

    // keep the modal language in sync when the page flips he/en
    new MutationObserver(function () { applyLang(); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ['lang', 'dir'] });
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && overlay && overlay.classList.contains('am-show')) close();
  });

  // =====================================================
  //  DELEGATION — turn auth.html links into the popup.
  // =====================================================
  function modeFromHref(a) {
    var m = (a.search || '').match(/[?&]mode=(signup|login)/);
    return m ? m[1] : 'login';
  }
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    var trigger = e.target.closest('[data-auth-open]');
    if (trigger) { e.preventDefault(); open(trigger.getAttribute('data-auth-open') || 'login'); return; }

    var a = e.target.closest('a[href]');
    if (!a || a.target === '_blank') return;
    // ignore clicks that originate inside the modal itself
    if (overlay && overlay.contains(a)) return;
    var path = (a.pathname || '').toLowerCase();
    if (path === 'auth.html' || path.slice(-9) === 'auth.html') {
      e.preventDefault();
      open(modeFromHref(a));
    }
  });

  window.AuthModal = { open: open, close: close };
})();
