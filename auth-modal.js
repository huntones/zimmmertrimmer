/* ============================================================
   Floating auth modal (KOLKLI) — one login/sign-up popup for
   the whole site. Self-contained: injects its own styles, markup
   and logic, then exposes window.AuthModal.{open,close}.

   How it hooks up:
     - header.js loads this file on every page (except auth.html,
       which IS the full-page version). By the time a user can
       click, the modal is ready.
     - A single delegated click listener turns EVERY link to
       auth.html into a popup: <a href="./auth"> opens the
       "login" tab, <a href="./auth?mode=signup"> the "signup"
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

  // Depth-aware path back to the site root, so the KOLKLI logo resolves
  // whether the modal is injected at the root or inside a folder page.
  var _depth = location.pathname.replace(/[^/]*$/, '').split('/').filter(Boolean).length;
  var ROOT = _depth ? new Array(_depth + 1).join('../') : './';
  var LOGO = ROOT + 'assets/logo.png';

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
      or: 'או', orEmail: 'או המשך עם אימייל', guest: 'המשך כאורח, בלי חשבון',
      oauthGoogle: 'התחברות עם Google', oauthFacebook: 'התחברות עם Facebook', oauthApple: 'התחברות עם Apple',
      oauthSoon: 'התחברות עם רשת חברתית תעבוד כשנחבר את השרת. בינתיים אפשר להתחבר עם אימייל.',
      oauthErr: 'ההתחברות נכשלה, נסו שוב.',
      brandHead: 'כל כלי האודיו במקום אחד',
      brandB1: 'חיתוך, המרה ונרמול ישירות בדפדפן',
      brandB2: 'שמירת קבצים וקישורי שיתוף אישיים',
      brandB3: 'התחברות מהירה עם Google, Facebook או Apple',
      switchToSignupText: 'אין לכם חשבון עדיין?', switchToSignupLink: 'הרשמה',
      switchToLoginText: 'כבר יש לכם חשבון?', switchToLoginLink: 'התחברות',
      privacy: 'ההרשמה נועדה רק לשמירת קבצים וקישורים. עריכת האודיו עצמה תמיד נשארת במחשב שלכם ולא עולה לשרת.',
      dashboard: 'ללוח הבקרה', goFiles: 'לאזור הקבצים שלי', logout: 'התנתקות', close: 'סגירה',
      signedHi: function (n) { return 'שלום, ' + n + '!'; },
      welcomeBack: 'התחברת בהצלחה 👋', accountCreated: 'החשבון נוצר בהצלחה 🎉',
      errRequired: 'שדה חובה', errEmail: 'כתובת אימייל לא תקינה', errPassShort: 'הסיסמה חייבת לפחות 6 תווים',
      errMatch: 'הסיסמאות לא תואמות', errTaken: 'כבר קיים חשבון עם האימייל הזה', errNoUser: 'לא נמצא חשבון עם האימייל הזה',
      errWrongPass: 'סיסמה שגויה',
      forgotMsg: 'איפוס סיסמה יעבוד כשנחבר את השרת. בינתיים אפשר ליצור חשבון חדש.',
      checkEmail: 'שלחנו לכם מייל אימות — אשרו אותו ואז התחברו.',
      resetSent: 'שלחנו קישור לאיפוס סיסמה למייל שלכם.',
      resetNeedEmail: 'הזינו קודם את כתובת האימייל.'
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
      or: 'or', orEmail: 'or continue with email', guest: 'Continue as guest, no account',
      oauthGoogle: 'Continue with Google', oauthFacebook: 'Continue with Facebook', oauthApple: 'Continue with Apple',
      oauthSoon: 'Social sign-in will work once the server is connected. For now you can sign in with email.',
      oauthErr: 'Sign-in failed, please try again.',
      brandHead: 'All your audio tools in one place',
      brandB1: 'Trim, convert & normalize right in your browser',
      brandB2: 'Save your files and personal share links',
      brandB3: 'Fast sign-in with Google, Facebook or Apple',
      switchToSignupText: "Don't have an account?", switchToSignupLink: 'Sign up',
      switchToLoginText: 'Already have an account?', switchToLoginLink: 'Sign in',
      privacy: 'Accounts are only for saving files and links. Audio editing itself always stays on your machine and is never uploaded.',
      dashboard: 'Go to dashboard', goFiles: 'Go to my files', logout: 'Log out', close: 'Close',
      signedHi: function (n) { return 'Hi, ' + n + '!'; },
      welcomeBack: 'Signed in 👋', accountCreated: 'Account created 🎉',
      errRequired: 'Required field', errEmail: 'Invalid email address', errPassShort: 'Password must be at least 6 characters',
      errMatch: 'Passwords don’t match', errTaken: 'An account with this email already exists', errNoUser: 'No account found with this email',
      errWrongPass: 'Wrong password',
      forgotMsg: 'Password reset will work once the server is connected. For now you can create a new account.',
      checkEmail: 'We sent you a confirmation email — confirm it, then sign in.',
      resetSent: 'We emailed you a password-reset link.',
      resetNeedEmail: 'Enter your email address first.'
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
      or: 'или', orEmail: 'или по электронной почте', guest: 'Продолжить как гость, без аккаунта',
      oauthGoogle: 'Войти через Google', oauthFacebook: 'Войти через Facebook', oauthApple: 'Войти через Apple',
      oauthSoon: 'Вход через соцсети заработает после подключения сервера. Пока можно войти по эл. почте.',
      oauthErr: 'Не удалось войти, попробуйте ещё раз.',
      brandHead: 'Все аудиоинструменты в одном месте',
      brandB1: 'Обрезка, конвертация и нормализация прямо в браузере',
      brandB2: 'Сохраняйте файлы и личные ссылки для обмена',
      brandB3: 'Быстрый вход через Google, Facebook или Apple',
      switchToSignupText: 'Нет аккаунта?', switchToSignupLink: 'Зарегистрироваться',
      switchToLoginText: 'Уже есть аккаунт?', switchToLoginLink: 'Войти',
      privacy: 'Аккаунты нужны только для сохранения файлов и ссылок. Само редактирование аудио всегда остаётся на вашем устройстве и никогда не загружается.',
      dashboard: 'В личный кабинет', goFiles: 'К моим файлам', logout: 'Выйти', close: 'Закрыть',
      signedHi: function (n) { return 'Привет, ' + n + '!'; },
      welcomeBack: 'Вы вошли 👋', accountCreated: 'Аккаунт создан 🎉',
      errRequired: 'Обязательное поле', errEmail: 'Неверный адрес почты', errPassShort: 'Пароль должен быть не менее 6 символов',
      errMatch: 'Пароли не совпадают', errTaken: 'Аккаунт с этой почтой уже существует', errNoUser: 'Аккаунт с этой почтой не найден',
      errWrongPass: 'Неверный пароль',
      forgotMsg: 'Сброс пароля заработает после подключения сервера. Пока можно создать новый аккаунт.',
      checkEmail: 'Мы отправили письмо для подтверждения — подтвердите и войдите.',
      resetSent: 'Мы отправили ссылку для сброса пароля на вашу почту.',
      resetNeedEmail: 'Сначала введите адрес электронной почты.'
    }
  };

  var lang = 'he', t = I18N.he;
  var mode = 'login';                       // 'login' | 'signup'
  var lastFocus = null;
  var pendingNext = null;                   // where to continue after an auth-gated action (e.g. checkout) succeeds

  // ---------- styles (scoped, driven by each page's CSS variables) ----------
  var CSS =
    '.am-overlay{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;' +
      'padding:20px;background:rgba(16,18,32,.52);backdrop-filter:saturate(1.2) blur(5px);' +
      'opacity:0;visibility:hidden;transition:opacity .2s ease,visibility .2s ease;font-family:var(--sans,system-ui,"Segoe UI",sans-serif);}' +
    '.am-overlay.am-show{opacity:1;visibility:visible;}' +
    'body.am-lock{overflow:hidden;}' +
    '.am-dialog{position:relative;width:100%;max-width:660px;overflow:hidden;' +
      'background:var(--panel,#fff);border:1px solid var(--line,#e5e8f0);border-radius:16px;color:var(--ink,#1c2030);' +
      'box-shadow:var(--shadow-lg,0 24px 60px rgba(20,24,44,.28));' +
      'transform:translateY(14px) scale(.985);transition:transform .22s cubic-bezier(.2,.8,.25,1);}' +
    '.am-overlay.am-show .am-dialog{transform:none;}' +
    /* horizontal (two-column) auth: brand panel + form panel side by side */
    '.am-split{display:flex;align-items:stretch;max-height:calc(100vh - 40px);}' +
    '.am-brandside{flex:0 0 42%;position:relative;overflow:hidden;color:#fff;' +
      'background:var(--grad,linear-gradient(105deg,#7b34ff 0%,#3f85ff 100%));' +
      'padding:30px 26px;display:flex;flex-direction:column;justify-content:center;gap:20px;}' +
    '.am-borb{position:absolute;border-radius:50%;filter:blur(44px);pointer-events:none;}' +
    '.am-borb.x{width:190px;height:190px;background:rgba(255,255,255,.32);top:-60px;inset-inline-start:-50px;}' +
    '.am-borb.y{width:200px;height:200px;background:rgba(0,0,0,.15);bottom:-72px;inset-inline-end:-56px;}' +
    '.am-brandside h2{position:relative;font-size:20px;font-weight:700;letter-spacing:-.02em;line-height:1.3;margin:0;text-shadow:0 1px 3px rgba(0,0,0,.16);}' +
    '.am-brandside ul{position:relative;list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:12px;}' +
    '.am-brandside li{display:flex;align-items:flex-start;gap:10px;font-size:12.5px;line-height:1.45;color:rgba(255,255,255,.95);}' +
    '.am-brandside li svg{width:20px;height:20px;flex-shrink:0;stroke:#fff;fill:none;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round;' +
      'background:rgba(255,255,255,.2);border-radius:50%;padding:3px;box-sizing:border-box;}' +
    '.am-formside{flex:1;min-width:0;padding:22px 24px 18px;overflow-y:auto;}' +
    '@media (max-width:640px){.am-dialog{max-width:360px;}.am-split{flex-direction:column;max-height:calc(100vh - 40px);overflow-y:auto;}' +
      '.am-brandside{display:none;}.am-formside{padding:22px 22px 18px;overflow:visible;}}' +
    '.am-x{position:absolute;top:12px;inset-inline-end:12px;z-index:2;width:34px;height:34px;border:none;background:none;' +
      'color:var(--faint,#9aa1b1);cursor:pointer;border-radius:9px;display:flex;align-items:center;justify-content:center;' +
      'transition:color .12s,background .12s;}' +
    '.am-x:hover{color:var(--ink,#1c2030);background:var(--panel-2,#f5f6fa);}' +
    '.am-x svg{width:20px;height:20px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;}' +

    '.am-head{text-align:center;margin-bottom:12px;}' +
    '.am-logo-img{height:30px;width:auto;display:block;margin:0 auto 10px;}' +
    '.am-head h1{font-size:18px;font-weight:700;letter-spacing:-.02em;margin:0 0 3px;}' +
    '.am-head p{font-size:13px;color:var(--muted,#727a8a);margin:0;}' +

    '.am-seg{display:flex;gap:4px;background:var(--panel-2,#f5f6fa);border:1px solid var(--line,#e5e8f0);border-radius:12px;padding:4px;margin-bottom:13px;}' +
    '.am-segbtn{flex:1;height:34px;border:none;border-radius:9px;background:transparent;color:var(--muted,#727a8a);cursor:pointer;' +
      'font-family:inherit;font-size:14px;font-weight:600;transition:color .14s,background .14s,box-shadow .14s;}' +
    '.am-segbtn.on{background:var(--panel,#fff);color:#5f5cf5;box-shadow:var(--shadow-sm,0 1px 2px rgba(20,24,44,.06));}' +

    '.am-field{margin-bottom:10px;}' +
    '.am-field.am-hidden{display:none;}' +
    '.am-field label{display:block;font-size:12.5px;font-weight:600;color:var(--ink-2,#2b3140);margin-bottom:6px;}' +
    '.am-inwrap{position:relative;display:flex;align-items:center;}' +
    '.am-field input{width:100%;background:var(--panel-2,#f5f6fa);border:1px solid var(--line,#e5e8f0);color:var(--ink,#1c2030);' +
      'border-radius:10px;font-family:inherit;font-size:14px;padding:10px 11px;transition:border-color .12s,box-shadow .12s;}' +
    '.am-field input::placeholder{color:var(--faint,#9aa1b1);}' +
    '.am-field input:focus{outline:none;border-color:#5f5cf5;box-shadow:0 0 0 3px var(--accent-soft,#efe9fe);}' +
    '.am-field.am-bad input{border-color:var(--danger,#e5484d);}' +
    '.am-field.am-bad input:focus{box-shadow:0 0 0 3px var(--danger-soft,#fdecec);}' +
    '.am-eye{position:absolute;right:6px;left:auto;width:32px;height:32px;border:none;background:none;color:var(--faint,#9aa1b1);' +
      'cursor:pointer;display:flex;align-items:center;justify-content:center;border-radius:8px;transition:color .12s,background .12s;}' +
    '.am-inwrap:has(.am-eye) input{padding-right:42px;}' +
    '.am-eye:hover{color:var(--accent,#7c3aed);background:var(--panel,#fff);}' +
    '.am-eye svg{width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;}' +
    '.am-err{font-size:11.5px;color:var(--danger,#e5484d);margin-top:5px;min-height:14px;line-height:1.3;}' +

    '.am-forgot{display:inline-block;font-size:12.5px;color:#5f5cf5;margin:-4px 0 4px;cursor:pointer;}' +
    '.am-forgot:hover{text-decoration:underline;}' +
    '.am-forgot.am-hidden{display:none;}' +

    '.am-btn{width:100%;display:inline-flex;align-items:center;justify-content:center;gap:9px;color:#fff;border:none;cursor:pointer;' +
      'background:linear-gradient(180deg,rgba(255,255,255,.25),rgba(255,255,255,0) 55%),var(--grad-btn,linear-gradient(105deg,#8b2fe0,#3b6ff6 52%,#22d3a0));' +
      'font-family:inherit;font-weight:600;font-size:14.5px;padding:11px 20px;border-radius:999px;text-shadow:0 1px 2px rgba(0,0,0,.18);margin-top:6px;' +
      'box-shadow:inset 0 1px 0 rgba(255,255,255,.5),inset 0 -2px 4px rgba(0,0,0,.14),0 8px 20px var(--grad-btn-glow,rgba(59,111,246,.38));' +
      'transition:filter .14s,transform .08s;}' +
    '.am-btn:hover{filter:brightness(1.05);} .am-btn:active{transform:translateY(1px);}' +
    '.am-btn:disabled{opacity:.6;cursor:default;filter:none;transform:none;}' +
    '.am-btn svg{width:17px;height:17px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;}' +

    '.am-msg{font-size:13px;border-radius:10px;padding:10px 12px;margin-bottom:14px;display:none;line-height:1.5;}' +
    '.am-msg.show{display:block;}' +
    '.am-msg.err{background:var(--danger-soft,#fdecec);color:var(--danger,#e5484d);}' +
    '.am-msg.info{background:var(--info-soft,#e8f0fe);color:var(--info-dim,#2f6fd6);}' +

    '.am-social{display:flex;gap:8px;margin-bottom:12px;}' +
    '.am-sbtn{flex:1;display:inline-flex;align-items:center;justify-content:center;height:42px;cursor:pointer;' +
      'border:1px solid var(--line,#e5e8f0);border-radius:10px;background:var(--panel,#fff);color:var(--ink-2,#2b3140);' +
      'box-shadow:var(--shadow-sm,0 1px 2px rgba(20,24,44,.06));transition:border-color .12s,background .12s,transform .08s;}' +
    '.am-sbtn:hover{border-color:var(--accent,#7c3aed);background:var(--panel-2,#f5f6fa);}' +
    '.am-sbtn:active{transform:translateY(1px);}' +
    '.am-sbtn:disabled{opacity:.55;cursor:default;transform:none;}' +
    '.am-sbtn svg{width:20px;height:20px;flex-shrink:0;display:block;}' +

    '.am-divider{display:flex;align-items:center;gap:12px;margin:13px 0 12px;color:var(--faint,#9aa1b1);font-size:12px;font-family:var(--mono,monospace);}' +
    '.am-divider::before,.am-divider::after{content:"";flex:1;height:1px;background:var(--line,#e5e8f0);}' +
    '.am-guest{width:100%;display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:10px 18px;border-radius:999px;' +
      'font-size:14px;font-weight:600;background:var(--panel,#fff);border:1px solid var(--line,#e5e8f0);color:var(--ink-2,#2b3140);cursor:pointer;' +
      'text-decoration:none;box-shadow:var(--shadow-sm,0 1px 2px rgba(20,24,44,.06));transition:border-color .12s,transform .08s;}' +
    '.am-guest:hover{border-color:var(--accent,#7c3aed);} .am-guest:active{transform:translateY(1px);}' +
    '.am-guest svg{width:16px;height:16px;color:var(--muted,#727a8a);stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;}' +

    '.am-switch{text-align:center;font-size:13.5px;color:var(--muted,#727a8a);margin-top:13px;}' +
    '.am-switch a{color:#5f5cf5;font-weight:600;cursor:pointer;}' +
    '.am-switch a:hover{text-decoration:underline;}' +

    '.am-note{display:flex;align-items:flex-start;gap:8px;margin-top:12px;padding:10px 12px;border-radius:11px;' +
      'background:var(--panel-2,#f5f6fa);border:1px solid var(--line-2,#eef0f6);font-size:11.5px;color:var(--muted,#727a8a);line-height:1.55;}' +
    '.am-note svg{width:15px;height:15px;color:var(--success,#22b04b);flex-shrink:0;margin-top:1px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;}' +

    '.am-signed{text-align:center;display:none;padding:34px 28px;}' +
    '.am-signed.show{display:block;}' +
    '.am-avatar{width:64px;height:64px;margin:0 auto 16px;border-radius:50%;display:flex;align-items:center;justify-content:center;' +
      'background:var(--grad,linear-gradient(105deg,#8b2fe0,#3b6ff6 52%,#22d3a0));color:#fff;font-size:26px;font-weight:700;box-shadow:0 6px 18px var(--grad-shadow,rgba(93,79,240,.3));}' +
    '.am-signed h2{font-size:20px;margin:0 0 4px;font-weight:700;}' +
    '.am-who{font-family:var(--mono,monospace);font-size:12.5px;color:var(--muted,#727a8a);margin-bottom:22px;direction:ltr;}' +
    '.am-actions{display:flex;flex-direction:column;gap:10px;max-width:320px;margin:0 auto;}' +
    '.am-hidden-view{display:none !important;}';

  // ---------- markup ----------
  var HTML =
    '<div class="am-dialog" role="dialog" aria-modal="true" aria-labelledby="amTitle">' +
      '<button class="am-x" id="amClose" type="button">' +
        '<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
      '</button>' +

      '<div id="amFormView" class="am-split">' +
        '<aside class="am-brandside">' +
          '<span class="am-borb x"></span><span class="am-borb y"></span>' +
          '<h2 id="amBrandHead"></h2>' +
          '<ul>' +
            '<li><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg><span id="amBrandB1"></span></li>' +
            '<li><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg><span id="amBrandB2"></span></li>' +
            '<li><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg><span id="amBrandB3"></span></li>' +
          '</ul>' +
        '</aside>' +
        '<div class="am-formside">' +
        '<div class="am-head">' +
          '<img class="am-logo-img" src="' + LOGO + '" alt="KOLKLI" width="139" height="34" decoding="async">' +
          '<h1 id="amTitle"></h1><p id="amSub"></p>' +
        '</div>' +

        '<div class="am-seg" role="tablist">' +
          '<button class="am-segbtn on" id="amTabLogin" type="button"></button>' +
          '<button class="am-segbtn" id="amTabSignup" type="button"></button>' +
        '</div>' +

        '<div class="am-msg" id="amMsg"></div>' +

        '<div class="am-social">' +
          '<button class="am-sbtn" id="amBtnGoogle" type="button">' +
            '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.24 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"/><path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1-.34-2.1c0-.73.13-1.44.34-2.1V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"/></svg>' +
          '</button>' +
          '<button class="am-sbtn" id="amBtnFacebook" type="button">' +
            '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#1877F2" d="M24 12a12 12 0 1 0-13.88 11.85v-8.38H7.08V12h3.04V9.36c0-3 1.79-4.66 4.53-4.66 1.31 0 2.68.23 2.68.23v2.95h-1.5c-1.49 0-1.96.93-1.96 1.87V12h3.33l-.53 3.47h-2.8v8.38A12 12 0 0 0 24 12Z"/></svg>' +
          '</button>' +
          '<button class="am-sbtn" id="amBtnApple" type="button">' +
            '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.05 12.72c-.03-2.6 2.12-3.84 2.22-3.91-1.21-1.77-3.09-2.01-3.76-2.04-1.6-.16-3.12.94-3.93.94-.81 0-1.83-.92-3.01-.9-1.55.02-2.98.9-3.78 2.29-1.61 2.8-.41 6.94 1.16 9.21.76 1.11 1.67 2.36 2.86 2.31 1.15-.05 1.58-.74 2.97-.74 1.38 0 1.77.74 2.98.72 1.23-.02 2.01-1.13 2.76-2.24.87-1.28 1.23-2.52 1.25-2.58-.03-.01-2.4-.92-2.42-3.65-.02-2.28 1.86-3.37 1.95-3.42-1.07-1.56-2.72-1.73-3.3-1.77ZM14.5 5.15c.64-.78 1.07-1.86.95-2.94-.92.04-2.04.61-2.7 1.39-.59.69-1.11 1.79-.97 2.85 1.03.08 2.08-.52 2.72-1.3Z"/></svg>' +
          '</button>' +
        '</div>' +

        '<div class="am-divider" id="amOr"></div>' +

        '<form id="amForm" novalidate autocomplete="on">' +
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

        '<div class="am-switch"><span id="amSwitchText"></span> <a id="amSwitchLink"></a></div>' +

        '<a class="am-guest" href="' + ROOT + 'app">' +
          '<span id="amGuest"></span>' +
        '</a>' +

        '<div class="am-note">' +
          '<svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/></svg>' +
          '<span id="amPrivacy"></span>' +
        '</div>' +
        '</div>' +
      '</div>' +

      '<div class="am-signed" id="amSignedView">' +
        '<div class="am-avatar" id="amAvatar"></div>' +
        '<h2 id="amSignedHi"></h2>' +
        '<div class="am-who" id="amSignedWho"></div>' +
        '<div class="am-actions">' +
          '<a class="am-btn" id="amGoFiles" href="' + ROOT + 'dashboard" style="text-decoration:none">' +
            '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>' +
            '<span id="amGoFilesTx"></span>' +
          '</a>' +
          '<a class="am-guest" id="amMyFiles" href="' + ROOT + 'files" style="text-decoration:none">' +
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
  // 7-day free trial for freshly-registered users (fingerprint-gated in trial.js).
  function grantTrial(email) {
    try { return (window.KolkliTrial && window.KolkliTrial.grantOnSignup) ? window.KolkliTrial.grantOnSignup(email) : Promise.resolve(); }
    catch (_) { return Promise.resolve(); }
  }
  // Email-confirmation flow: remember to grant the trial once the verified
  // account signs in (trial.js autoClaim picks it up on kolkli:auth).
  function pendTrial(email) {
    try { if (window.KolkliTrial && window.KolkliTrial.markPending) window.KolkliTrial.markPending(email); } catch (_) {}
  }
  function currentSession() { try { return localStorage.getItem(SESSION_KEY); } catch (_) { return null; } }
  // A session is only "signed in" when it also has a matching account record
  // (mirrors header.js currentUser()); a stale ac_session counts as a guest.
  function currentUser() { var em = currentSession(); return em ? (findUser(em) || null) : null; }
  function isSignedIn() { return !!currentUser(); }

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

  // NOTE: the bootstrap-admin seed (a hard-coded demo password shipped in
  // client JS) was removed for launch — it let anyone sign in as admin on any
  // browser. Admin is still granted to the owner email(s) in ADMIN_EMAILS
  // (see auth-store.js / header.js) once that account signs in for real
  // (Supabase) or registers a password in the local demo store.

  // =====================================================
  //  VALIDATION
  // =====================================================
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  function setErr(fieldId, errId, msg) {
    q(fieldId).classList.toggle('am-bad', !!msg);
    q(errId).textContent = msg || '';
  }
  function clearErrors() {
    ['amEmailField', 'amPassField', 'amConfirmField'].forEach(function (f) { q(f).classList.remove('am-bad'); });
    ['amEmailErr', 'amPassErr', 'amConfirmErr'].forEach(function (e) { q(e).textContent = ''; });
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
    var email = q('amEmail').value.trim().toLowerCase();
    var name = email ? email.split('@')[0] : '';   // display name derived from email (no name field)
    var pass = q('amPass').value;
    var confirm = q('amConfirm').value;

    var ok = true;
    if (!email) { setErr('amEmailField', 'amEmailErr', t.errRequired); ok = false; }
    else if (!EMAIL_RE.test(email)) { setErr('amEmailField', 'amEmailErr', t.errEmail); ok = false; }
    else if (mode === 'signup' && window.KolkliTrial && window.KolkliTrial.isDisposableEmail && window.KolkliTrial.isDisposableEmail(email)) { setErr('amEmailField', 'amEmailErr', (window.KolkliTrial.disposableMsg && window.KolkliTrial.disposableMsg()) || t.errEmail); ok = false; }
    if (!pass) { setErr('amPassField', 'amPassErr', t.errRequired); ok = false; }
    else if (pass.length < 6) { setErr('amPassField', 'amPassErr', t.errPassShort); ok = false; }
    if (mode === 'signup') {
      if (!confirm) { setErr('amConfirmField', 'amConfirmErr', t.errRequired); ok = false; }
      else if (confirm !== pass) { setErr('amConfirmField', 'amConfirmErr', t.errMatch); ok = false; }
    }
    if (!ok) return;

    q('amSubmit').disabled = true;

    // Backend seam: when Supabase is wired up (see supabase-config.js) go
    // through the real server; otherwise fall back to the localStorage demo.
    var work;
    if (window.KolkliAuth && window.KolkliAuth.configured()) {
      work = (mode === 'signup')
        ? window.KolkliAuth.signUp({ name: name, email: email, password: pass }).then(function (r) {
            if (r.ok) {
              if (r.code === 'confirm') { pendTrial(email); showMsg(t.checkEmail, 'info'); return; }
              return grantTrial(email).then(function () { showSigned(name, email); });
            }
            if (r.code === 'taken') { setErr('amEmailField', 'amEmailErr', t.errTaken); return; }
            if (r.code === 'weak') { setErr('amPassField', 'amPassErr', t.errPassShort); return; }
            showMsg(r.message || t.errRequired, 'err');
          })
        : window.KolkliAuth.signIn({ email: email, password: pass }).then(function (r) {
            if (r.ok) { var su = findUser(email); showSigned(su ? su.name : email.split('@')[0], email); return; }
            if (r.code === 'confirm') { showMsg(t.checkEmail, 'info'); return; }
            if (r.code === 'invalid') { setErr('amPassField', 'amPassErr', t.errWrongPass); return; }
            showMsg(r.message || t.errRequired, 'err');
          });
    } else {
      work = Promise.resolve().then(function () {
        if (mode === 'signup') {
          if (findUser(email)) { setErr('amEmailField', 'amEmailErr', t.errTaken); return; }
          return hashPass(pass).then(function (h) {
            var users = loadUsers();
            users.push({ name: name, email: email, pass: h, role: 'user', plan: 'free', created: Date.now() });
            saveUsers(users);
            setSession(email);
            return grantTrial(email);
          }).then(function () { showSigned(name, email); });
        }
        var u = findUser(email);
        if (!u) { setErr('amEmailField', 'amEmailErr', t.errNoUser); return; }
        return hashPass(pass).then(function (h) {
          if (u.pass !== h) { setErr('amPassField', 'amPassErr', t.errWrongPass); return; }
          setSession(email);
          showSigned(u.name, email);
        });
      });
    }
    work.finally(function () { q('amSubmit').disabled = false; });
  }

  // =====================================================
  //  VIEWS
  // =====================================================
  function setMode(m) {
    mode = m;
    q('amTabLogin').classList.toggle('on', m === 'login');
    q('amTabSignup').classList.toggle('on', m === 'signup');
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

  // Social sign-in: real OAuth via Supabase (redirects away); demo fallback msg.
  function onSocial(provider) {
    clearErrors();
    if (window.KolkliAuth && window.KolkliAuth.configured()) {
      var btns = root.querySelectorAll('.am-social .am-sbtn');
      Array.prototype.forEach.call(btns, function (b) { b.disabled = true; });
      window.KolkliAuth.signInWithProvider(provider).then(function (r) {
        if (!r || !r.ok) {
          showMsg((r && r.message) || t.oauthErr, 'err');
          Array.prototype.forEach.call(btns, function (b) { b.disabled = false; });
        }
        // on success the browser redirects to the provider — nothing more to do
      });
    } else {
      showMsg(t.oauthSoon, 'info');
    }
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
    q('amEmailField').querySelector('label').textContent = t.emailLabel;
    q('amEmail').setAttribute('placeholder', t.emailPh);
    q('amPassField').querySelector('label').textContent = t.passLabel;
    q('amPass').setAttribute('placeholder', t.passPh);
    q('amConfirmField').querySelector('label').textContent = t.confirmLabel;
    q('amConfirm').setAttribute('placeholder', t.confirmPh);
    q('amForgot').textContent = t.forgot;
    q('amOr').textContent = t.orEmail;
    q('amGuest').textContent = t.guest;
    q('amBrandHead').textContent = t.brandHead;
    q('amBrandB1').textContent = t.brandB1;
    q('amBrandB2').textContent = t.brandB2;
    q('amBrandB3').textContent = t.brandB3;
    [['amBtnGoogle', t.oauthGoogle], ['amBtnFacebook', t.oauthFacebook], ['amBtnApple', t.oauthApple]].forEach(function (p) {
      var b = q(p[0]); if (b) { b.setAttribute('aria-label', p[1]); b.setAttribute('title', p[1]); }
    });
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
  function open(m, next) {
    if (next) pendingNext = next;           // continue here once the user is signed in
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
    pendingNext = null;                     // dismissed without signing in → cancel the pending redirect
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
    q('amBtnGoogle').addEventListener('click', function () { onSocial('google'); });
    q('amBtnFacebook').addEventListener('click', function () { onSocial('facebook'); });
    q('amBtnApple').addEventListener('click', function () { onSocial('apple'); });
    q('amForm').addEventListener('submit', onSubmit);
    q('amForgot').addEventListener('click', function () {
      if (window.KolkliAuth && window.KolkliAuth.configured()) {
        var em = q('amEmail').value.trim().toLowerCase();
        if (!em || !EMAIL_RE.test(em)) { showMsg(t.resetNeedEmail, 'info'); return; }
        window.KolkliAuth.resetPassword(em).then(function (r) {
          showMsg(r.ok ? t.resetSent : (r.message || t.forgotMsg), r.ok ? 'info' : 'err');
        });
        return;
      }
      showMsg(t.forgotMsg, 'info');
    });
    q('amEye').addEventListener('click', function () {
      var inp = q('amPass'), show = inp.type === 'password';
      inp.type = show ? 'text' : 'password';
      q('amEyeOpen').style.display = show ? 'none' : '';
      q('amEyeShut').style.display = show ? '' : 'none';
    });
    q('amLogout').addEventListener('click', function () {
      if (window.KolkliAuth && window.KolkliAuth.configured()) window.KolkliAuth.signOut();
      else clearSession();
      setMode('login'); showForm(); q('amForm').reset();
    });
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
    var seg = path.replace(/\/+$/, '').split('/').pop();

    // Upgrade / checkout links require an account. A guest who clicks
    // "שדרוג חבילה" (or any link to the checkout page, or anything marked
    // [data-requires-auth]) is sent to the login/sign-up popup FIRST; we
    // remember where they were headed and continue straight to checkout once
    // they're signed in. The checkout page re-checks on load, so deep links
    // and JS-off fall back to the same gate.
    if (seg === 'checkout' || seg === 'checkout.html' || a.hasAttribute('data-requires-auth')) {
      if (!isSignedIn()) {
        e.preventDefault();
        open('login', a.href);              // a.href is the absolute URL incl. ?plan=&cycle=
        return;
      }
    }

    if (seg === 'auth' || seg === 'auth.html') {
      e.preventDefault();
      open(modeFromHref(a));
    }
  });

  // Once a real session appears after an auth-gated action, continue to the
  // remembered destination (e.g. checkout). Works for both the demo store and
  // the Supabase-backed adapter (both fire kolkli:auth + mirror ac_session).
  window.addEventListener('kolkli:auth', function () {
    if (!pendingNext || !isSignedIn()) return;
    var next = pendingNext; pendingNext = null;
    setTimeout(function () { try { location.assign(next); } catch (_) { location.href = next; } }, 80);
  });

  window.AuthModal = { open: open, close: close };
})();
