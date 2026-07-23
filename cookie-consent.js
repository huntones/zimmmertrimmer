/* ============================================================
   Site-wide Cookie Consent (KOLKLI) — one self-contained file,
   loaded on every page.

   Design goals / contract (mirrors accessibility.js):
     - SELF-CONTAINED: injects its own CSS, builds its own DOM and
       needs no markup on the page. header.js loads it (depth-aware)
       on every header page; the standalone client pages
       (download / proof / select / upload / privacy / terms …)
       include it with a plain <script>.
     - CONSENT-FIRST: on the visitor's first arrival it shows a
       banner with three equally-visible choices —
         • Accept all      — all cookie categories on
         • Reject all      — only strictly-necessary cookies
         • Customize        — per-category preferences dialog
       The choice is stored (localStorage + a first-party cookie),
       versioned and time-limited (MAX_AGE_DAYS). The banner is not
       shown again until the choice expires, the consent VERSION is
       bumped, or the visitor re-opens it to change their mind.
     - GATES NON-ESSENTIAL SCRIPTS: any tag written as
         <script type="text/plain" data-cc="analytics"
                 data-src="https://…"></script>
       (or with inline JS in its body) stays inert until the visitor
       grants that category — then it is activated automatically.
       Categories: functional | analytics | marketing. Necessary is
       always on. See CATS below and the companion COOKIE-CONSENT
       note for how to add gated scripts.
     - PROGRAMMATIC API on window.KolkliConsent:
         .get()            → { necessary, functional, analytics, marketing }
         .allowed(cat)     → boolean
         .hasResponded()   → has the visitor made a choice yet?
         .open()           → open the preferences dialog
         .acceptAll() / .rejectAll()
         .onChange(fn)     → called now (if a choice exists) and on every change
         .reset()          → forget the choice and re-show the banner
       A `kolkli:consent` CustomEvent is also dispatched on window on
       every change (event.detail === .get()). If Google Consent Mode
       (window.gtag) is present, an equivalent `consent:update` is pushed.
     - THEME + i18n AWARE: reads <html lang/dir/data-theme> (he / en /
       ru, rtl/ltr, light/dark) exactly like header.js and re-renders
       live via a MutationObserver on those attributes.
     - NON-INTRUSIVE: the whole widget is appended to <html> — OUTSIDE
       <body> — so it is immune to the accessibility effects the a11y
       widget toggles on <body>, and it sits in the corner opposite
       the accessibility button so the two never overlap.

   To point the "Privacy policy" link elsewhere, edit PRIVACY_URL.
   ============================================================ */
(function () {
  'use strict';
  if (window.__kolkliConsent) return;               // guard against a double include
  window.__kolkliConsent = true;

  // ---- Storage + policy knobs ----
  var STORE = 'kolkli_cookie_consent';   // localStorage key (primary)
  var COOKIE = 'kolkli_cc';              // first-party mirror cookie (necessary)
  var VERSION = 1;                       // bump to re-ask everyone after a policy change
  var MAX_AGE_DAYS = 180;                // re-ask after ~6 months
  var PRIVACY_URL = '/privacy';          // clean-URL privacy page
  // After the visitor answers, keep the floating corner cookie icon HIDDEN
  // (it was judged intrusive). Consent stays changeable via the privacy
  // page's "cookie settings" link, any [data-cookie-settings] element, or a
  // link to /cookies. Set true to bring the always-visible corner button back.
  var SHOW_CORNER_BUTTON = false;

  // Cookie categories. `necessary` is always granted and cannot be turned off.
  var CATS = [
    { key: 'necessary', locked: true },
    { key: 'functional' },
    { key: 'analytics' },
    { key: 'marketing' }
  ];

  function emptyConsent() { return { necessary: true, functional: false, analytics: false, marketing: false }; }

  // ============================================================
  //  Persistence — localStorage (primary) + a first-party cookie
  //  mirror so the record survives storage clears and can be read
  //  server-side/edge if ever needed. The consent record itself is
  //  strictly necessary, so writing it needs no prior consent.
  // ============================================================
  function writeCookie(name, val, days) {
    try {
      if (location.protocol === 'file:') return;    // no cookies on file://
      var d = new Date();
      d.setTime(d.getTime() + days * 864e5);
      document.cookie = name + '=' + encodeURIComponent(val) +
        '; expires=' + d.toUTCString() + '; path=/; SameSite=Lax';
    } catch (e) {}
  }
  function readCookie(name) {
    try {
      var m = document.cookie.match(new RegExp('(?:^|; )' +
        name.replace(/([.*+?^${}()|[\]\\])/g, '\\$1') + '=([^;]*)'));
      return m ? decodeURIComponent(m[1]) : null;
    } catch (e) { return null; }
  }
  function eraseCookie(name) {
    try { document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax'; } catch (e) {}
  }

  // Returns { ts, c } for a still-valid stored choice, else null (→ must ask).
  function loadRecord() {
    var raw = null;
    try { raw = localStorage.getItem(STORE); } catch (e) {}
    if (!raw) raw = readCookie(COOKIE);
    if (!raw) return null;
    var rec;
    try { rec = JSON.parse(raw); } catch (e) { return null; }
    if (!rec || rec.v !== VERSION || !rec.c) return null;
    if (typeof rec.ts === 'number' && (Date.now() - rec.ts) > MAX_AGE_DAYS * 864e5) return null;
    var c = emptyConsent();
    for (var k in c) { if (k === 'necessary') continue; c[k] = !!rec.c[k]; }
    return { ts: rec.ts, c: c };
  }

  var record = loadRecord();                         // null until the visitor responds
  var consent = record ? record.c : emptyConsent();  // effective grants (all off pre-choice)

  function hasResponded() { return !!record; }
  function allowed(cat) { return cat === 'necessary' ? true : !!(record && consent[cat]); }

  // ============================================================
  //  i18n — every visible string in he / en / ru.
  // ============================================================
  var L = {
    he: {
      title: 'אנחנו מכבדים את הפרטיות שלכם',
      body: 'אנו משתמשים בעוגיות ובאחסון מקומי כדי להפעיל את האתר, לזכור העדפות ולשפר את השירות. עוגיות שאינן הכרחיות ייטענו רק לאחר אישורכם.',
      acceptAll: 'אישור הכול',
      rejectAll: 'דחיית הכול',
      customize: 'הגדרות מותאמות',
      privacy: 'מדיניות הפרטיות',
      reopen: 'הגדרות עוגיות',
      // preferences dialog
      prefTitle: 'העדפות עוגיות',
      prefIntro: 'בחרו אילו סוגי עוגיות מותר לנו להפעיל. עוגיות הכרחיות פועלות תמיד כדי שהאתר יתפקד. ניתן לשנות זאת בכל עת.',
      save: 'שמירת ההעדפות',
      alwaysOn: 'פעיל תמיד',
      close: 'סגירה',
      updated: 'עודכן לאחרונה: יולי 2026',
      // categories
      c_necessary_t: 'עוגיות הכרחיות',
      c_necessary_d: 'נדרשות לתפעול בסיסי של האתר — התחברות, אבטחה, שמירת בחירת השפה וההסכמה שלכם. לא ניתן לכבותן.',
      c_functional_t: 'העדפות ותפקוד',
      c_functional_d: 'זוכרות בחירות כמו שפה, מצב תצוגה, מועדפים וטיוטות עבודה, כדי לשפר את חוויית השימוש.',
      c_analytics_t: 'אנליטיקה וסטטיסטיקה',
      c_analytics_d: 'עוזרות לנו להבין כיצד משתמשים באתר, באופן מצטבר ואנונימי, כדי לשפר אותו.',
      c_marketing_t: 'שיווק ופרסום',
      c_marketing_d: 'משמשות להצגת תוכן ופרסום רלוונטיים ולמדידת ביצועי קמפיינים.'
    },
    en: {
      title: 'We value your privacy',
      body: 'We use cookies and local storage to run the site, remember your preferences and improve the service. Non-essential cookies are loaded only after you agree.',
      acceptAll: 'Accept all',
      rejectAll: 'Reject all',
      customize: 'Customize',
      privacy: 'Privacy policy',
      reopen: 'Cookie settings',
      prefTitle: 'Cookie preferences',
      prefIntro: 'Choose which cookies we may use. Strictly-necessary cookies are always on so the site works. You can change this at any time.',
      save: 'Save preferences',
      alwaysOn: 'Always on',
      close: 'Close',
      updated: 'Last updated: July 2026',
      c_necessary_t: 'Strictly necessary',
      c_necessary_d: 'Required for the site to work — sign-in, security, and remembering your language and consent choice. These cannot be switched off.',
      c_functional_t: 'Preferences',
      c_functional_d: 'Remember choices such as language, theme, favorites and work drafts to improve your experience.',
      c_analytics_t: 'Analytics',
      c_analytics_d: 'Help us understand how the site is used, in aggregate and anonymously, so we can improve it.',
      c_marketing_t: 'Marketing',
      c_marketing_d: 'Used to show relevant content and ads and to measure campaign performance.'
    },
    ru: {
      title: 'Мы уважаем вашу конфиденциальность',
      body: 'Мы используем cookie и локальное хранилище, чтобы сайт работал, запоминал настройки и становился лучше. Необязательные cookie загружаются только после вашего согласия.',
      acceptAll: 'Принять все',
      rejectAll: 'Отклонить все',
      customize: 'Настроить',
      privacy: 'Политика конфиденциальности',
      reopen: 'Настройки cookie',
      prefTitle: 'Настройки cookie',
      prefIntro: 'Выберите, какие cookie мы можем использовать. Строго необходимые cookie всегда включены, чтобы сайт работал. Это можно изменить в любой момент.',
      save: 'Сохранить настройки',
      alwaysOn: 'Всегда включено',
      close: 'Закрыть',
      updated: 'Обновлено: июль 2026',
      c_necessary_t: 'Строго необходимые',
      c_necessary_d: 'Нужны для работы сайта — вход, безопасность, запоминание языка и вашего выбора согласия. Их нельзя отключить.',
      c_functional_t: 'Функциональные',
      c_functional_d: 'Запоминают выбор — язык, тему, избранное и черновики — чтобы улучшить работу с сайтом.',
      c_analytics_t: 'Аналитика',
      c_analytics_d: 'Помогают понять, как используется сайт, в обобщённом и анонимном виде, чтобы его улучшать.',
      c_marketing_t: 'Маркетинг',
      c_marketing_d: 'Используются для показа релевантного контента и рекламы и для оценки эффективности кампаний.'
    }
  };
  function curLang() {
    var l = document.documentElement.getAttribute('lang');
    if (l === 'he' || l === 'en' || l === 'ru') return l;
    try { l = localStorage.getItem('ac_lang'); } catch (e) {}
    return (l === 'en' || l === 'ru') ? l : 'he';
  }
  function t() { return L[curLang()] || L.he; }
  function esc(x) {
    return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ---- Icons (inline currentColor line-icons) ----
  var COOKIE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5z"/>' +
    '<circle cx="8.5" cy="8.5" r="1" fill="currentColor" stroke="none"/>' +
    '<circle cx="15" cy="14" r="1" fill="currentColor" stroke="none"/>' +
    '<circle cx="9.5" cy="15" r="1" fill="currentColor" stroke="none"/>' +
    '<circle cx="14.5" cy="9" r="1" fill="currentColor" stroke="none"/></svg>';
  var CLOSE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';

  // ============================================================
  //  Injected stylesheet. Scoped under #cc-root, themed for light +
  //  dark, RTL-aware — same conventions header.js / accessibility.js
  //  use. Sits in the bottom-start corner, opposite the a11y button.
  // ============================================================
  var CSS = `
  #cc-root{ font-family:'Overpass','Rubik',system-ui,'Segoe UI',sans-serif; }
  #cc-root *{ box-sizing:border-box; }

  /* ----- First-visit banner (bottom-start card) ----- */
  #cc-banner{ position:fixed; bottom:18px; left:18px; right:auto; z-index:2147483200;
    width:min(460px, calc(100vw - 24px)); direction:inherit;
    background:#fff; color:#1b2138; border:1px solid #e8ebfb; border-radius:20px;
    box-shadow:0 30px 72px rgba(30,37,80,.30); overflow:hidden;
    opacity:0; visibility:hidden; transform:translateY(14px) scale(.98); transform-origin:bottom;
    transition:opacity .22s ease, transform .22s ease, visibility .22s; }
  #cc-banner.open{ opacity:1; visibility:visible; transform:none; }
  html[dir="rtl"] #cc-banner{ right:18px; left:auto; }
  #cc-banner:focus{ outline:none; }
  #cc-banner .cc-b-in{ padding:18px 18px 16px; }
  #cc-banner .cc-b-head{ display:flex; align-items:center; gap:10px; margin-bottom:9px; }
  #cc-banner .cc-b-ic{ width:38px; height:38px; flex-shrink:0; border-radius:12px; display:flex; align-items:center; justify-content:center;
    background:linear-gradient(135deg,#7b34ff 0%,#3f85ff 100%); color:#fff; }
  #cc-banner .cc-b-ic svg{ width:22px; height:22px; }
  #cc-banner .cc-b-title{ font-size:16px; font-weight:800; line-height:1.3; }
  #cc-banner .cc-b-text{ font-size:13.3px; line-height:1.6; color:#4a5170; margin:0 0 14px; }
  #cc-banner .cc-b-text a{ color:#5d43f5; font-weight:700; text-decoration:underline; }
  #cc-banner .cc-b-actions{ display:grid; grid-template-columns:1fr 1fr; gap:9px; }

  .cc-btn{ font:inherit; font-size:13.5px; font-weight:800; cursor:pointer; border-radius:12px;
    padding:12px 14px; border:1.5px solid transparent; text-align:center; transition:transform .08s, filter .12s, background .12s, border-color .12s; }
  .cc-btn:active{ transform:scale(.97); }
  .cc-btn:focus-visible{ outline:3px solid #7b34ff; outline-offset:2px; }
  .cc-btn-primary{ background:linear-gradient(135deg,#7b34ff 0%,#3f85ff 100%); color:#fff;
    box-shadow:0 8px 20px rgba(82,94,244,.30); }
  .cc-btn-primary:hover{ filter:brightness(1.05); }
  .cc-btn-outline{ background:#f6f7ff; color:#333a52; border-color:#e2e6f8; }
  .cc-btn-outline:hover{ border-color:#b9c1f2; }
  .cc-btn-ghost{ background:transparent; color:#5d43f5; padding-top:11px; padding-bottom:11px; }
  .cc-btn-ghost:hover{ background:#f2f0ff; }
  #cc-banner .cc-b-actions .cc-span2{ grid-column:1 / -1; }

  /* ----- Re-open handle (small corner button, after a choice) ----- */
  #cc-reopen{ position:fixed; bottom:18px; left:18px; right:auto; z-index:2147482800;
    width:46px; height:46px; border:none; border-radius:50%; cursor:pointer; padding:0;
    background:#fff; color:#6a3fe0; border:1px solid #e8ebfb;
    box-shadow:0 10px 24px rgba(30,37,80,.22); display:none; align-items:center; justify-content:center;
    transition:transform .12s ease, box-shadow .2s ease; }
  #cc-reopen.show{ display:flex; }
  #cc-reopen:hover{ transform:scale(1.08); box-shadow:0 14px 30px rgba(30,37,80,.30); }
  #cc-reopen:active{ transform:scale(.95); }
  #cc-reopen:focus-visible{ outline:3px solid #7b34ff; outline-offset:3px; }
  #cc-reopen svg{ width:24px; height:24px; }
  html[dir="rtl"] #cc-reopen{ right:18px; left:auto; }

  /* ----- Preferences dialog ----- */
  #cc-modal{ position:fixed; inset:0; z-index:2147483600; display:none; align-items:center; justify-content:center;
    padding:20px; background:rgba(14,17,30,.55); backdrop-filter:blur(3px); }
  #cc-modal.open{ display:flex; }
  #cc-card{ direction:inherit; width:min(620px,100%); max-height:88vh; overflow:auto;
    background:#fff; color:#28304a; border-radius:20px; box-shadow:0 40px 90px rgba(10,14,30,.5); }
  #cc-card::-webkit-scrollbar{ width:10px; }
  #cc-card::-webkit-scrollbar-thumb{ background:#d8ddf3; border-radius:8px; border:3px solid #fff; }
  #cc-card .cc-h{ position:sticky; top:0; z-index:2; display:flex; align-items:center; justify-content:space-between;
    gap:10px; padding:17px 20px; background:linear-gradient(135deg,#7b34ff,#3f85ff); color:#fff; }
  #cc-card .cc-h-t{ display:inline-flex; align-items:center; gap:9px; font-size:17px; font-weight:800; }
  #cc-card .cc-h-t svg{ width:22px; height:22px; }
  #cc-card .cc-x{ width:36px; height:36px; border:0; border-radius:10px; cursor:pointer; flex-shrink:0;
    background:rgba(255,255,255,.18); color:#fff; display:flex; align-items:center; justify-content:center; }
  #cc-card .cc-x:hover{ background:rgba(255,255,255,.32); }
  #cc-card .cc-x svg{ width:18px; height:18px; }
  #cc-card .cc-x:focus-visible{ outline:2px solid #fff; outline-offset:2px; }
  #cc-card .cc-body{ padding:18px 20px 6px; }
  #cc-card .cc-intro{ font-size:13.6px; line-height:1.65; color:#4a5170; margin:0 0 14px; }

  #cc-card .cc-cat{ border:1.5px solid #e8ebfb; border-radius:14px; padding:13px 15px; margin-bottom:11px; background:#fafbff; }
  #cc-card .cc-cat-top{ display:flex; align-items:center; justify-content:space-between; gap:12px; }
  #cc-card .cc-cat-t{ font-size:14.5px; font-weight:800; color:#20263c; }
  #cc-card .cc-cat-d{ font-size:12.7px; line-height:1.55; color:#5a6180; margin:7px 0 0; }
  #cc-card .cc-always{ font-size:11.5px; font-weight:800; color:#1c9a41; background:#eaf6ee; border-radius:999px; padding:5px 11px; white-space:nowrap; }

  /* Toggle switch */
  .cc-sw{ position:relative; width:46px; height:27px; flex-shrink:0; border:0; padding:0; cursor:pointer;
    border-radius:999px; background:#cfd5ea; transition:background .16s; }
  .cc-sw::after{ content:""; position:absolute; top:3px; left:3px; width:21px; height:21px; border-radius:50%;
    background:#fff; box-shadow:0 2px 5px rgba(0,0,0,.25); transition:transform .16s; }
  html[dir="rtl"] .cc-sw::after{ left:auto; right:3px; }
  .cc-sw[aria-checked="true"]{ background:linear-gradient(135deg,#7b34ff,#3f85ff); }
  .cc-sw[aria-checked="true"]::after{ transform:translateX(19px); }
  html[dir="rtl"] .cc-sw[aria-checked="true"]::after{ transform:translateX(-19px); }
  .cc-sw[aria-disabled="true"]{ background:#b7edc7; cursor:not-allowed; opacity:.85; }
  .cc-sw[aria-disabled="true"]::after{ transform:translateX(19px); }
  html[dir="rtl"] .cc-sw[aria-disabled="true"]::after{ transform:translateX(-19px); }
  .cc-sw:focus-visible{ outline:3px solid #7b34ff; outline-offset:2px; }

  #cc-card .cc-foot{ position:sticky; bottom:0; display:flex; flex-wrap:wrap; gap:9px; padding:14px 20px 18px;
    background:#fff; border-top:1px solid #eef0f8; }
  #cc-card .cc-foot .cc-btn{ flex:1; min-width:130px; }
  #cc-card .cc-updated{ width:100%; margin-top:4px; text-align:center; font-size:11px; font-weight:600; color:#98a1b8; }

  /* ----- Dark theme (page sets html[data-theme="dark"]) ----- */
  html[data-theme="dark"] #cc-banner{ background:#161a22; color:#eef1f6; border-color:#2a303c; }
  html[data-theme="dark"] #cc-banner .cc-b-text{ color:#aab2c5; }
  html[data-theme="dark"] .cc-btn-outline{ background:#1d222c; color:#cfd5e2; border-color:#2a303c; }
  html[data-theme="dark"] .cc-btn-outline:hover{ border-color:#3a4152; }
  html[data-theme="dark"] .cc-btn-ghost{ color:#c9bbff; }
  html[data-theme="dark"] .cc-btn-ghost:hover{ background:#241a3a; }
  html[data-theme="dark"] #cc-reopen{ background:#1d222c; color:#c9bbff; border-color:#2a303c; }
  html[data-theme="dark"] #cc-card{ background:#161a22; color:#dfe4ee; }
  html[data-theme="dark"] #cc-card::-webkit-scrollbar-thumb{ background:#333a48; border-color:#161a22; }
  html[data-theme="dark"] #cc-card .cc-intro{ color:#aab2c5; }
  html[data-theme="dark"] #cc-card .cc-cat{ background:#1d222c; border-color:#2a303c; }
  html[data-theme="dark"] #cc-card .cc-cat-t{ color:#eef1f6; }
  html[data-theme="dark"] #cc-card .cc-cat-d{ color:#9aa2b8; }
  html[data-theme="dark"] #cc-card .cc-always{ background:#132a1c; color:#4ec98a; }
  html[data-theme="dark"] .cc-sw{ background:#3a4152; }
  html[data-theme="dark"] .cc-sw[aria-disabled="true"]{ background:#1f5133; }
  html[data-theme="dark"] #cc-card .cc-foot{ background:#161a22; border-top-color:#2a303c; }
  html[data-theme="dark"] #cc-card .cc-updated{ color:#6b7280; }

  @media (prefers-reduced-motion: reduce){
    #cc-banner, #cc-reopen, .cc-btn, .cc-sw, .cc-sw::after{ transition:none !important; }
  }
  @media (max-width:520px){
    #cc-banner .cc-b-actions{ grid-template-columns:1fr; }
  }
  `;

  // ============================================================
  //  Build the widget DOM (banner + re-open button + dialog),
  //  append to <html> so <body> effects never touch it.
  // ============================================================
  var styleEl = document.createElement('style');
  styleEl.id = 'cc-css';
  styleEl.textContent = CSS;
  (document.head || document.documentElement).appendChild(styleEl);

  var root = document.createElement('div');
  root.id = 'cc-root';
  root.innerHTML =
    '<section id="cc-banner" role="dialog" aria-modal="false" aria-live="polite" tabindex="-1"></section>' +
    '<button id="cc-reopen" type="button"></button>' +
    '<div id="cc-modal" role="dialog" aria-modal="true"><div id="cc-card"></div></div>';
  document.documentElement.appendChild(root);

  var banner = root.querySelector('#cc-banner');
  var reopenBtn = root.querySelector('#cc-reopen');
  var modal = root.querySelector('#cc-modal');
  var card = root.querySelector('#cc-card');

  // Working copy of the toggles while the dialog is open.
  var draft = null;

  // ============================================================
  //  Render — banner
  // ============================================================
  function renderBanner() {
    var d = t();
    banner.setAttribute('aria-label', d.prefTitle);
    banner.innerHTML =
      '<div class="cc-b-in">' +
        '<div class="cc-b-head">' +
          '<span class="cc-b-ic">' + COOKIE_ICON + '</span>' +
          '<span class="cc-b-title">' + esc(d.title) + '</span>' +
        '</div>' +
        '<p class="cc-b-text">' + esc(d.body) + ' ' +
          '<a href="' + esc(PRIVACY_URL) + '">' + esc(d.privacy) + '</a></p>' +
        '<div class="cc-b-actions">' +
          '<button class="cc-btn cc-btn-primary" type="button" data-cc-act="accept">' + esc(d.acceptAll) + '</button>' +
          '<button class="cc-btn cc-btn-outline" type="button" data-cc-act="reject">' + esc(d.rejectAll) + '</button>' +
          '<button class="cc-btn cc-btn-ghost cc-span2" type="button" data-cc-act="open">' + esc(d.customize) + '</button>' +
        '</div>' +
      '</div>';
  }

  // ============================================================
  //  Render — preferences dialog (uses `draft` for toggle state)
  // ============================================================
  function catRow(catKey) {
    var d = t();
    var locked = catKey === 'necessary';
    var on = locked ? true : !!draft[catKey];
    var toggle = locked
      ? '<span class="cc-always">' + esc(d.alwaysOn) + '</span>'
      : '<button class="cc-sw" type="button" role="switch" aria-checked="' + (on ? 'true' : 'false') +
        '" data-cc-toggle="' + catKey + '" aria-label="' + esc(d['c_' + catKey + '_t']) + '"></button>';
    return '<div class="cc-cat">' +
      '<div class="cc-cat-top"><span class="cc-cat-t">' + esc(d['c_' + catKey + '_t']) + '</span>' + toggle + '</div>' +
      '<p class="cc-cat-d">' + esc(d['c_' + catKey + '_d']) + '</p>' +
    '</div>';
  }
  function renderCard() {
    var d = t();
    var rows = CATS.map(function (c) { return catRow(c.key); }).join('');
    card.innerHTML =
      '<div class="cc-h"><span class="cc-h-t">' + COOKIE_ICON + esc(d.prefTitle) + '</span>' +
        '<button class="cc-x" type="button" data-cc-act="close" aria-label="' + esc(d.close) + '">' + CLOSE_ICON + '</button></div>' +
      '<div class="cc-body"><p class="cc-intro">' + esc(d.prefIntro) + '</p>' + rows + '</div>' +
      '<div class="cc-foot">' +
        '<button class="cc-btn cc-btn-outline" type="button" data-cc-act="reject">' + esc(d.rejectAll) + '</button>' +
        '<button class="cc-btn cc-btn-outline" type="button" data-cc-act="accept">' + esc(d.acceptAll) + '</button>' +
        '<button class="cc-btn cc-btn-primary" type="button" data-cc-act="save">' + esc(d.save) + '</button>' +
        '<div class="cc-updated">' + esc(d.updated) + '</div>' +
      '</div>';
    card.setAttribute('aria-label', d.prefTitle);
  }

  // ============================================================
  //  Show / hide surfaces
  // ============================================================
  function showBanner() { renderBanner(); banner.classList.add('open'); }
  function hideBanner() { banner.classList.remove('open'); }
  function showReopen() { if (SHOW_CORNER_BUTTON) reopenBtn.classList.add('show'); }

  var lastFocus = null;
  function openModal() {
    draft = record ? { functional: consent.functional, analytics: consent.analytics, marketing: consent.marketing }
                    : { functional: false, analytics: false, marketing: false };
    lastFocus = document.activeElement;
    renderCard();
    modal.classList.add('open');
    var x = card.querySelector('.cc-x');
    if (x) setTimeout(function () { try { x.focus(); } catch (e) {} }, 30);
  }
  function closeModal() {
    modal.classList.remove('open');
    // If the visitor still hasn't made a choice, keep the banner up.
    if (!hasResponded()) { banner.classList.add('open'); try { banner.focus(); } catch (e) {} }
    else { try { (lastFocus || (SHOW_CORNER_BUTTON ? reopenBtn : document.body)).focus(); } catch (e) {} }
  }
  function modalOpen() { return modal.classList.contains('open'); }

  // ============================================================
  //  Commit a choice
  // ============================================================
  function persist() {
    record = { ts: Date.now(), c: consent };
    var rec = { v: VERSION, ts: record.ts, c: consent };
    var json = JSON.stringify(rec);
    try { localStorage.setItem(STORE, json); } catch (e) {}
    writeCookie(COOKIE, json, MAX_AGE_DAYS);
  }
  function commit(cats) {
    consent = {
      necessary: true,
      functional: !!cats.functional,
      analytics: !!cats.analytics,
      marketing: !!cats.marketing
    };
    persist();
    hideBanner();
    if (modalOpen()) modal.classList.remove('open');
    showReopen();
    try { (SHOW_CORNER_BUTTON ? reopenBtn : document.body).focus(); } catch (e) {}
    activateScripts();
    pushConsentMode();
    emitChange();
  }
  function acceptAll() { commit({ functional: true, analytics: true, marketing: true }); }
  function rejectAll() { commit({ functional: false, analytics: false, marketing: false }); }
  function saveDraft() { commit(draft || {}); }

  // ============================================================
  //  Gate non-essential scripts. Any
  //    <script type="text/plain" data-cc="analytics" data-src="…">
  //  (or with inline JS in its body) is turned into a live <script>
  //  once its category is granted. Runs on load (if already granted)
  //  and after every change.
  // ============================================================
  function activateScripts() {
    var blocks;
    try { blocks = document.querySelectorAll('script[type="text/plain"][data-cc]'); } catch (e) { return; }
    Array.prototype.forEach.call(blocks, function (node) {
      var cat = node.getAttribute('data-cc');
      if (!allowed(cat)) return;
      if (node.getAttribute('data-cc-activated')) return;
      var s = document.createElement('script');
      Array.prototype.forEach.call(node.attributes, function (a) {
        if (a.name === 'type' || a.name === 'data-cc' || a.name === 'data-cc-activated') return;
        if (a.name === 'data-src') { s.src = a.value; return; }
        try { s.setAttribute(a.name, a.value); } catch (e) {}
      });
      if (!s.src) s.text = node.textContent || '';
      node.setAttribute('data-cc-activated', '1');
      if (node.parentNode) node.parentNode.insertBefore(s, node.nextSibling);
    });
  }

  // Google Consent Mode v2 bridge — no-op unless a gtag() is present.
  function pushConsentMode() {
    try {
      if (typeof window.gtag === 'function') {
        window.gtag('consent', 'update', {
          ad_storage: consent.marketing ? 'granted' : 'denied',
          ad_user_data: consent.marketing ? 'granted' : 'denied',
          ad_personalization: consent.marketing ? 'granted' : 'denied',
          analytics_storage: consent.analytics ? 'granted' : 'denied',
          functionality_storage: consent.functional ? 'granted' : 'denied',
          personalization_storage: consent.functional ? 'granted' : 'denied',
          security_storage: 'granted'
        });
      }
    } catch (e) {}
  }

  // ============================================================
  //  Change subscribers + event
  // ============================================================
  var listeners = [];
  function snapshot() {
    return { necessary: true, functional: allowed('functional'), analytics: allowed('analytics'), marketing: allowed('marketing') };
  }
  function emitChange() {
    var snap = snapshot();
    try { window.dispatchEvent(new CustomEvent('kolkli:consent', { detail: snap })); } catch (e) {}
    listeners.forEach(function (fn) { try { fn(snap); } catch (e) {} });
  }

  // ============================================================
  //  Wire interactions
  // ============================================================
  function onAct(act) {
    if (act === 'accept') acceptAll();
    else if (act === 'reject') rejectAll();
    else if (act === 'save') saveDraft();
    else if (act === 'open') openModal();
    else if (act === 'close') closeModal();
  }
  root.addEventListener('click', function (e) {
    var tgl = e.target.closest('[data-cc-toggle]');
    if (tgl && draft) {
      var k = tgl.getAttribute('data-cc-toggle');
      draft[k] = !draft[k];
      tgl.setAttribute('aria-checked', draft[k] ? 'true' : 'false');
      return;
    }
    var b = e.target.closest('[data-cc-act]');
    if (b) { e.preventDefault(); onAct(b.getAttribute('data-cc-act')); }
  });
  reopenBtn.addEventListener('click', openModal);

  // Close the dialog on backdrop click / Esc.
  modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && modalOpen()) { e.preventDefault(); closeModal(); }
  });
  // Focus trap inside the dialog.
  modal.addEventListener('keydown', function (e) {
    if (e.key !== 'Tab' || !modalOpen()) return;
    var f = card.querySelectorAll('button, a[href], [tabindex]:not([tabindex="-1"])');
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  // Let any page element open the preferences dialog: a link/button with
  // [data-cookie-settings], or a link pointing at /cookies or #cookies.
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-cookie-settings], a[href="#cookies"], a[href="#cookie-settings"], a[href$="/cookies"], a[href$="/cookie-settings"]');
    if (!el) return;
    e.preventDefault();
    openModal();
  });

  // ============================================================
  //  Stay in sync with page language / theme changes.
  // ============================================================
  new MutationObserver(function () {
    reopenBtn.setAttribute('aria-label', t().reopen);
    reopenBtn.setAttribute('title', t().reopen);
    reopenBtn.innerHTML = COOKIE_ICON;
    if (banner.classList.contains('open')) renderBanner();
    if (modalOpen()) renderCard();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang', 'dir', 'data-theme'] });

  // ============================================================
  //  Public API
  // ============================================================
  window.KolkliConsent = {
    version: VERSION,
    categories: CATS.map(function (c) { return c.key; }),
    get: snapshot,
    allowed: allowed,
    hasResponded: hasResponded,
    open: openModal,
    acceptAll: acceptAll,
    rejectAll: rejectAll,
    onChange: function (fn) {
      if (typeof fn !== 'function') return;
      listeners.push(fn);
      if (hasResponded()) { try { fn(snapshot()); } catch (e) {} }
    },
    reset: function () {
      record = null; consent = emptyConsent();
      try { localStorage.removeItem(STORE); } catch (e) {}
      eraseCookie(COOKIE);
      reopenBtn.classList.remove('show');
      showBanner();
      emitChange();
    }
  };

  // ============================================================
  //  Boot. The banner/re-open live on <html>; activating gated
  //  scripts needs <body>, so defer that until the DOM is ready.
  // ============================================================
  reopenBtn.setAttribute('aria-label', t().reopen);
  reopenBtn.setAttribute('title', t().reopen);
  reopenBtn.innerHTML = COOKIE_ICON;

  function boot() {
    if (hasResponded()) {
      showReopen();
      activateScripts();
      pushConsentMode();
    } else {
      showBanner();
      // Gently move focus to the banner so keyboard/screen-reader users find it.
      setTimeout(function () { try { banner.focus(); } catch (e) {} }, 400);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
