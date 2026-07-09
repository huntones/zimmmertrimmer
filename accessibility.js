/* ============================================================
   Site-wide accessibility widget (KOLKLI) — one self-contained
   file, loaded on every page.

   Design goals / contract:
     - SELF-CONTAINED: injects its own CSS, builds its own DOM and
       needs no markup on the page. header.js loads it (depth-aware)
       on every header page; the three standalone client pages
       (download / proof / select) include it with a plain <script>.
     - GDPR / PRIVACY BY DESIGN: makes NO network requests, loads NO
       external resource, sets NO cookie and collects NO personal
       data. The only thing it stores is the visitor's own display
       preferences, in localStorage under a single key
       ("kolkli_a11y"). "Reset settings" erases that key. Because the
       data is strictly necessary to deliver a feature the user
       actively turned on, it needs no consent banner. (The optional
       read-aloud uses the browser/OS built-in speech engine.)
     - THEME + i18n AWARE: reads the page's <html lang/dir/data-theme>
       (he / en / ru, rtl/ltr, light/dark) exactly like header.js and
       re-renders live via a MutationObserver on those attributes.
     - NON-INTRUSIVE: the widget (button, panel, reading guide/mask)
       is appended to <html> — OUTSIDE <body> — so the effects it
       applies to <body> (text zoom, colour filters, big cursor…)
       never touch the widget itself.

   To customise the accessibility contact shown in the statement,
   edit CONTACT below.
   ============================================================ */
(function () {
  'use strict';
  if (window.__kolkliA11y) return;                 // guard against a double include
  window.__kolkliA11y = true;

  var STORE = 'kolkli_a11y';

  // ---- Accessibility contact (edit to your real coordinator/details) ----
  var CONTACT = { name: '', email: 'accessibility@kolkli.com', phone: '' };

  // Text-zoom steps applied to <body> (index 0 = off). Uses CSS `zoom`, which
  // scales px-sized text too — the site is largely px-based, so a font-size
  // bump alone would miss most of it.
  var ZOOMS = [1, 1.12, 1.25, 1.4, 1.6];

  // Default preference state. Booleans unless noted.
  function defaults() {
    return {
      fontScale: 0,      // 0..4 → ZOOMS index
      lineSpace: false,
      letterSpace: false,
      readable: false,   // legible font family
      contrast: '',      // '' | 'high' | 'invert' | 'gray'  (mutually exclusive)
      links: false,      // highlight links
      headings: false,   // highlight headings
      stopAnim: false,   // pause animations + media
      bigCursor: false,
      guide: false,      // reading ruler that follows the cursor
      mask: false,       // reading mask (dims all but a strip)
      tts: false         // read text aloud on click
    };
  }
  var state = load();
  var ttsOK = ('speechSynthesis' in window) && ('SpeechSynthesisUtterance' in window);
  if (!ttsOK) state.tts = false;

  function load() {
    var d = defaults();
    try {
      var raw = localStorage.getItem(STORE);
      if (raw) { var s = JSON.parse(raw); for (var k in d) if (s[k] != null) d[k] = s[k]; }
    } catch (e) {}
    return d;
  }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) {} }

  // ============================================================
  //  i18n — every visible string in he / en / ru.
  // ============================================================
  var L = {
    he: {
      open: 'תפריט נגישות', title: 'נגישות', close: 'סגירה',
      textSize: 'גודל טקסט', dec: 'הקטנת טקסט', inc: 'הגדלת טקסט',
      contrast: 'ניגודיות וצבע', cNormal: 'רגיל', cHigh: 'ניגודיות גבוהה', cInvert: 'ניגודיות הפוכה', cGray: 'גווני אפור',
      lineSpace: 'ריווח שורות', letterSpace: 'ריווח אותיות', readable: 'פונט קריא',
      links: 'הדגשת קישורים', headings: 'הדגשת כותרות', stopAnim: 'עצירת אנימציות',
      bigCursor: 'סמן גדול', guide: 'סרגל קריאה', mask: 'מסכת קריאה', tts: 'הקראת טקסט',
      sound: 'צלילי חיווי',
      reset: 'איפוס הגדרות', statement: 'הצהרת נגישות',
      note: 'ללא צד שלישי · נשמר במכשיר שלכם בלבד',
      stmtClose: 'סגירת הצהרת הנגישות'
    },
    en: {
      open: 'Accessibility menu', title: 'Accessibility', close: 'Close',
      textSize: 'Text size', dec: 'Smaller text', inc: 'Larger text',
      contrast: 'Contrast & colour', cNormal: 'Normal', cHigh: 'High contrast', cInvert: 'Negative', cGray: 'Grayscale',
      lineSpace: 'Line spacing', letterSpace: 'Letter spacing', readable: 'Readable font',
      links: 'Highlight links', headings: 'Highlight titles', stopAnim: 'Stop animations',
      bigCursor: 'Big cursor', guide: 'Reading guide', mask: 'Reading mask', tts: 'Read aloud',
      sound: 'Notification sounds',
      reset: 'Reset settings', statement: 'Accessibility statement',
      note: 'No third parties · stored on your device only',
      stmtClose: 'Close accessibility statement'
    },
    ru: {
      open: 'Меню доступности', title: 'Доступность', close: 'Закрыть',
      textSize: 'Размер текста', dec: 'Меньше текст', inc: 'Больше текст',
      contrast: 'Контраст и цвет', cNormal: 'Обычный', cHigh: 'Высокий контраст', cInvert: 'Инверсия', cGray: 'Оттенки серого',
      lineSpace: 'Межстрочный интервал', letterSpace: 'Межбуквенный интервал', readable: 'Читаемый шрифт',
      links: 'Выделить ссылки', headings: 'Выделить заголовки', stopAnim: 'Остановить анимацию',
      bigCursor: 'Большой курсор', guide: 'Линейка чтения', mask: 'Маска чтения', tts: 'Озвучивание',
      sound: 'Звуки уведомлений',
      reset: 'Сбросить настройки', statement: 'Заявление о доступности',
      note: 'Без третьих лиц · хранится только на вашем устройстве',
      stmtClose: 'Закрыть заявление о доступности'
    }
  };
  function curLang() {
    var l = document.documentElement.getAttribute('lang');
    if (l === 'he' || l === 'en' || l === 'ru') return l;
    try { l = localStorage.getItem('ac_lang'); } catch (e) {}
    return (l === 'en' || l === 'ru') ? l : 'he';
  }
  function t() { return L[curLang()] || L.he; }
  function ttsLang() { return { he: 'he-IL', en: 'en-US', ru: 'ru-RU' }[curLang()] || 'he-IL'; }

  // ============================================================
  //  Icons (inline, currentColor line-icons).
  // ============================================================
  var A11Y_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<circle cx="12" cy="4.3" r="1.7" fill="currentColor" stroke="none"/>' +
    '<path d="M4 8.6c2.6 1 5.2 1.4 8 1.4s5.4-.4 8-1.4"/><path d="M12 9.6V15"/><path d="M8.8 21l3.2-6 3.2 6"/></svg>';
  var IC = {
    minus: '<path d="M5 12h14"/>',
    plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
    line: '<path d="M3 6h18"/><path d="M3 12h18"/><path d="M3 18h18"/><path d="M20 4v3M20 17v3"/>',
    letter: '<path d="M4 18 8 6l4 12"/><path d="M5.6 14h4.8"/><path d="M16 8v10M20 8v10"/>',
    readable: '<path d="M4 7V5h16v2"/><path d="M12 5v14"/><path d="M9 19h6"/>',
    links: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    head: '<path d="M6 4v16"/><path d="M18 4v16"/><path d="M6 12h12"/>',
    anim: '<circle cx="12" cy="12" r="9"/><path d="M10 9v6M14 9v6"/>',
    cursor: '<path d="M5 2l7 18 2.4-7.2L21.6 10 5 2z"/>',
    guide: '<path d="M3 12h18"/><path d="M7 8l-4 4 4 4"/><path d="M17 8l4 4-4 4"/>',
    mask: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    tts: '<path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.4 5.6a9 9 0 0 1 0 12.8"/>',
    sound: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
    reset: '<path d="M3 12a9 9 0 1 0 2.6-6.3"/><path d="M3 4v4h4"/>',
    close: '<path d="M18 6 6 18M6 6l12 12"/>'
  };
  function svg(name) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (IC[name] || '') + '</svg>';
  }
  function esc(x) {
    return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ============================================================
  //  Injected stylesheet. Two parts:
  //   (1) the widget chrome (button / panel / statement), scoped
  //       under #a11y-root and themed for light + dark.
  //   (2) the accessibility EFFECTS, keyed on classes we toggle on
  //       <body>. The widget lives outside <body>, so it's immune.
  // ============================================================
  var ARROW = "url(\"data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 24 24'><path d='M5 2 L5 20 L9.4 15.6 L12.4 21.6 L15 20.4 L12 14.6 L18 14.6 Z' fill='%23111' stroke='%23fff' stroke-width='1.3' stroke-linejoin='round'/></svg>\") 4 2";
  var HAND = "url(\"data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 24 24'><path d='M9 11V5.5a1.5 1.5 0 0 1 3 0V10h1V7a1.5 1.5 0 0 1 3 0v3h1V8.5a1.5 1.5 0 0 1 3 0V15a5 5 0 0 1-5 5h-3a4 4 0 0 1-3.4-1.9L4.2 13a1.6 1.6 0 0 1 2.5-2L9 13z' fill='%23111' stroke='%23fff' stroke-width='1' stroke-linejoin='round'/></svg>\") 12 4";

  var CSS = `
  #a11y-root{ font-family:'Space Grotesk',system-ui,'Segoe UI','Heebo',sans-serif; }
  #a11y-root *{ box-sizing:border-box; }

  /* Floating access button */
  #a11y-fab{ position:fixed; bottom:18px; right:18px; left:auto; z-index:2147483000;
    width:54px; height:54px; border:none; border-radius:50%; cursor:pointer;
    background:linear-gradient(135deg,#7b34ff 0%,#3f85ff 100%); color:#fff;
    box-shadow:0 10px 26px rgba(82,94,244,.45); display:flex; align-items:center; justify-content:center;
    transition:transform .12s ease, box-shadow .2s ease; }
  #a11y-fab:hover{ transform:scale(1.07); box-shadow:0 14px 32px rgba(82,94,244,.55); }
  #a11y-fab:active{ transform:scale(.96); }
  #a11y-fab:focus-visible{ outline:3px solid #fff; outline-offset:3px; }
  #a11y-fab svg{ width:30px; height:30px; }
  html[dir="rtl"] #a11y-fab{ left:18px; right:auto; }

  /* Panel */
  #a11y-panel{ position:fixed; bottom:84px; right:18px; left:auto; z-index:2147483000;
    width:min(360px, calc(100vw - 24px)); max-height:min(80vh,660px); overflow:auto;
    border-radius:20px; background:#fff; color:#1b2138; border:1px solid #e8ebfb;
    box-shadow:0 30px 72px rgba(30,37,80,.28); direction:inherit;
    opacity:0; visibility:hidden; transform:translateY(12px) scale(.98); transform-origin:bottom;
    transition:opacity .18s ease, transform .18s ease, visibility .18s; }
  #a11y-panel.open{ opacity:1; visibility:visible; transform:none; }
  html[dir="rtl"] #a11y-panel{ left:18px; right:auto; }
  #a11y-panel::-webkit-scrollbar{ width:10px; }
  #a11y-panel::-webkit-scrollbar-thumb{ background:#d8ddf3; border-radius:8px; border:3px solid #fff; }

  #a11y-panel .a11y-head-bar{ position:sticky; top:0; z-index:2; display:flex; align-items:center;
    justify-content:space-between; gap:10px; padding:15px 16px;
    background:linear-gradient(135deg,#7b34ff 0%,#3f85ff 100%); color:#fff; }
  #a11y-panel .a11y-title{ display:inline-flex; align-items:center; gap:9px; font-size:16px; font-weight:800; }
  #a11y-panel .a11y-title svg{ width:22px; height:22px; }
  #a11y-panel .a11y-x{ width:34px; height:34px; border:0; border-radius:10px; cursor:pointer;
    background:rgba(255,255,255,.18); color:#fff; display:flex; align-items:center; justify-content:center; }
  #a11y-panel .a11y-x:hover{ background:rgba(255,255,255,.32); }
  #a11y-panel .a11y-x svg{ width:18px; height:18px; }
  #a11y-panel .a11y-x:focus-visible{ outline:2px solid #fff; outline-offset:2px; }

  #a11y-panel .a11y-body{ padding:14px 16px 4px; }
  #a11y-panel .a11y-sec{ margin-bottom:14px; }
  #a11y-panel .a11y-sec-t{ font-size:12px; font-weight:800; letter-spacing:.03em; text-transform:uppercase;
    color:#8a92aa; margin:0 2px 8px; }

  /* Text-size stepper */
  #a11y-panel .a11y-step{ display:flex; align-items:center; gap:10px;
    background:#f6f7ff; border:1.5px solid #e8ebfb; border-radius:14px; padding:8px; }
  #a11y-panel .a11y-step-b{ width:42px; height:42px; flex-shrink:0; border:0; border-radius:11px; cursor:pointer;
    background:#fff; color:#4a3ad0; border:1.5px solid #e2e6f8; display:flex; align-items:center; justify-content:center; }
  #a11y-panel .a11y-step-b svg{ width:20px; height:20px; }
  #a11y-panel .a11y-step-b:hover{ border-color:#b9c1f2; }
  #a11y-panel .a11y-step-b:focus-visible{ outline:3px solid #7b34ff; outline-offset:2px; }
  #a11y-panel .a11y-step-b[disabled]{ opacity:.4; cursor:not-allowed; }
  #a11y-panel .a11y-dots{ flex:1; display:flex; align-items:center; justify-content:center; gap:8px; }
  #a11y-panel .a11y-dots i{ width:12px; height:12px; border-radius:50%; background:#d5daf0; transition:background .12s, transform .12s; }
  #a11y-panel .a11y-dots i.on{ background:linear-gradient(135deg,#7b34ff,#3f85ff); transform:scale(1.14); }

  /* Contrast segmented control */
  #a11y-panel .a11y-seg{ display:grid; grid-template-columns:1fr 1fr; gap:8px; }
  #a11y-panel .a11y-cbtn{ display:inline-flex; align-items:center; gap:8px; padding:11px 12px;
    border:1.5px solid #e8ebfb; border-radius:12px; background:#f8f9ff; color:#333a52;
    font:inherit; font-size:13px; font-weight:700; cursor:pointer; text-align:start; transition:.12s; }
  #a11y-panel .a11y-cbtn .sw{ width:18px; height:18px; border-radius:50%; flex-shrink:0; border:1px solid rgba(0,0,0,.15); }
  #a11y-panel .a11y-cbtn[data-val=""] .sw{ background:linear-gradient(135deg,#fff 50%,#111 50%); }
  #a11y-panel .a11y-cbtn[data-val="high"] .sw{ background:linear-gradient(135deg,#000 50%,#ff0 50%); }
  #a11y-panel .a11y-cbtn[data-val="invert"] .sw{ background:linear-gradient(135deg,#111 50%,#eee 50%); filter:invert(1); }
  #a11y-panel .a11y-cbtn[data-val="gray"] .sw{ background:linear-gradient(135deg,#eee,#555); }
  #a11y-panel .a11y-cbtn:hover{ border-color:#b9c1f2; }
  #a11y-panel .a11y-cbtn:focus-visible{ outline:3px solid #7b34ff; outline-offset:2px; }
  #a11y-panel .a11y-cbtn[aria-checked="true"]{ border-color:transparent; color:#fff;
    background:linear-gradient(135deg,#7b34ff,#3f85ff); box-shadow:0 8px 18px rgba(82,94,244,.28); }
  #a11y-panel .a11y-cbtn[aria-checked="true"] .sw{ border-color:rgba(255,255,255,.6); }

  /* Toggle tiles */
  #a11y-panel .a11y-grid{ display:grid; grid-template-columns:1fr 1fr 1fr; gap:9px; }
  #a11y-panel .a11y-tile{ display:flex; flex-direction:column; align-items:center; justify-content:center; gap:7px;
    min-height:80px; padding:11px 6px; border:1.5px solid #e8ebfb; border-radius:14px; background:#f8f9ff;
    color:#333a52; font:inherit; font-size:11.5px; font-weight:700; line-height:1.25; text-align:center; cursor:pointer;
    transition:transform .08s, border-color .12s, background .12s, box-shadow .12s; }
  #a11y-panel .a11y-tile svg{ width:23px; height:23px; }
  #a11y-panel .a11y-tile:hover{ border-color:#b9c1f2; }
  #a11y-panel .a11y-tile:active{ transform:scale(.96); }
  #a11y-panel .a11y-tile:focus-visible{ outline:3px solid #7b34ff; outline-offset:2px; }
  #a11y-panel .a11y-tile[aria-checked="true"]{ border-color:transparent; color:#fff;
    background:linear-gradient(135deg,#7b34ff,#3f85ff); box-shadow:0 8px 20px rgba(82,94,244,.30); }

  /* Footer */
  #a11y-panel .a11y-foot{ padding:6px 16px 16px; }
  #a11y-panel .a11y-reset{ width:100%; display:flex; align-items:center; justify-content:center; gap:8px;
    padding:12px; margin-bottom:9px; border:1.5px solid #f0c4c6; border-radius:12px; background:#fff5f5; color:#d33b40;
    font:inherit; font-size:13.5px; font-weight:800; cursor:pointer; transition:.12s; }
  #a11y-panel .a11y-reset svg{ width:18px; height:18px; }
  #a11y-panel .a11y-reset:hover{ background:#fdecec; }
  #a11y-panel .a11y-reset:focus-visible{ outline:3px solid #d33b40; outline-offset:2px; }
  #a11y-panel .a11y-stmt{ width:100%; padding:11px; border:0; border-radius:12px; background:#f2f0ff; color:#5d43f5;
    font:inherit; font-size:13.5px; font-weight:800; cursor:pointer; transition:.12s; }
  #a11y-panel .a11y-stmt:hover{ background:#e9e5ff; }
  #a11y-panel .a11y-stmt:focus-visible{ outline:3px solid #7b34ff; outline-offset:2px; }
  #a11y-panel .a11y-note{ margin-top:11px; text-align:center; font-size:11px; font-weight:600; color:#98a1b8; }

  /* Reading guide + mask (fixed, follow the pointer). Appended to <html>. */
  #a11y-guide{ position:fixed; left:0; right:0; height:40px; z-index:2147482000; pointer-events:none; display:none;
    background:rgba(93,79,240,.12); border-top:2px solid rgba(60,50,210,.85); border-bottom:2px solid rgba(60,50,210,.85); }
  #a11y-mask{ position:fixed; inset:0; z-index:2147482000; pointer-events:none; display:none; }
  #a11y-mask .a11y-strip{ position:absolute; left:0; right:0; height:130px; box-shadow:0 0 0 9999px rgba(0,0,0,.62); }

  /* Accessibility statement dialog */
  #a11y-stmt-ov{ position:fixed; inset:0; z-index:2147483600; display:none; align-items:center; justify-content:center;
    padding:20px; background:rgba(14,17,30,.55); backdrop-filter:blur(3px); }
  #a11y-stmt-ov.open{ display:flex; }
  #a11y-stmt-card{ direction:inherit; width:min(680px,100%); max-height:88vh; overflow:auto;
    background:#fff; color:#28304a; border-radius:20px; box-shadow:0 40px 90px rgba(10,14,30,.5); }
  #a11y-stmt-card .a11y-stmt-h{ position:sticky; top:0; display:flex; align-items:center; justify-content:space-between;
    gap:10px; padding:18px 22px; background:linear-gradient(135deg,#7b34ff,#3f85ff); color:#fff; }
  #a11y-stmt-card .a11y-stmt-h h2{ margin:0; font-size:19px; font-weight:800; }
  #a11y-stmt-card .a11y-x2{ width:36px; height:36px; border:0; border-radius:10px; cursor:pointer; flex-shrink:0;
    background:rgba(255,255,255,.18); color:#fff; display:flex; align-items:center; justify-content:center; }
  #a11y-stmt-card .a11y-x2:hover{ background:rgba(255,255,255,.32); }
  #a11y-stmt-card .a11y-x2 svg{ width:18px; height:18px; }
  #a11y-stmt-card .a11y-stmt-b{ padding:22px 24px 26px; font-size:15px; line-height:1.7; }
  #a11y-stmt-card .a11y-stmt-b h3{ font-size:15.5px; font-weight:800; margin:20px 0 6px; color:#1b2138; }
  #a11y-stmt-card .a11y-stmt-b h3:first-child{ margin-top:0; }
  #a11y-stmt-card .a11y-stmt-b p{ margin:0 0 10px; color:#42496a; }
  #a11y-stmt-card .a11y-stmt-b ul{ margin:0 0 10px; padding-inline-start:22px; color:#42496a; }
  #a11y-stmt-card .a11y-stmt-b li{ margin:3px 0; }
  #a11y-stmt-card .a11y-stmt-b a{ color:#5d43f5; font-weight:700; }
  #a11y-stmt-card .a11y-badge{ display:inline-block; margin-top:4px; padding:3px 10px; border-radius:999px;
    background:#eaf6ee; color:#1c9a41; font-size:12.5px; font-weight:800; }

  /* Dark theme (page sets html[data-theme="dark"]) */
  html[data-theme="dark"] #a11y-panel{ background:#161a22; color:#eef1f6; border-color:#2a303c; }
  html[data-theme="dark"] #a11y-panel::-webkit-scrollbar-thumb{ background:#333a48; border-color:#161a22; }
  html[data-theme="dark"] #a11y-panel .a11y-sec-t{ color:#8b93a4; }
  html[data-theme="dark"] #a11y-panel .a11y-step{ background:#1d222c; border-color:#2a303c; }
  html[data-theme="dark"] #a11y-panel .a11y-step-b{ background:#232937; color:#c9bbff; border-color:#333a48; }
  html[data-theme="dark"] #a11y-panel .a11y-dots i{ background:#3a4152; }
  html[data-theme="dark"] #a11y-panel .a11y-cbtn,
  html[data-theme="dark"] #a11y-panel .a11y-tile{ background:#1d222c; border-color:#2a303c; color:#cfd5e2; }
  html[data-theme="dark"] #a11y-panel .a11y-note{ color:#6b7280; }
  html[data-theme="dark"] #a11y-panel .a11y-reset{ background:#2a1719; border-color:#5a2a2c; color:#ff8f92; }
  html[data-theme="dark"] #a11y-panel .a11y-stmt{ background:#241a3a; color:#c9bbff; }
  html[data-theme="dark"] #a11y-stmt-card{ background:#161a22; color:#dfe4ee; }
  html[data-theme="dark"] #a11y-stmt-card .a11y-stmt-b h3{ color:#eef1f6; }
  html[data-theme="dark"] #a11y-stmt-card .a11y-stmt-b p,
  html[data-theme="dark"] #a11y-stmt-card .a11y-stmt-b ul{ color:#b7bece; }
  html[data-theme="dark"] #a11y-stmt-card .a11y-badge{ background:#132a1c; color:#4ec98a; }

  @media (prefers-reduced-motion: reduce){
    #a11y-fab, #a11y-panel, #a11y-panel .a11y-tile{ transition:none !important; }
  }

  /* ==========  EFFECTS applied to <body>  ========== */
  body.a11y-line *{ line-height:2 !important; }
  body.a11y-letter *{ letter-spacing:.11em !important; word-spacing:.16em !important; }
  body.a11y-readable *:not(code):not(pre):not(kbd):not(samp){
    font-family:'Heebo','Segoe UI',Arial,'Helvetica Neue',sans-serif !important; letter-spacing:.01em; }
  body.a11y-links a{ text-decoration:underline !important; text-decoration-thickness:2px !important;
    text-underline-offset:2px !important; }
  body.a11y-links a:hover, body.a11y-links a:focus{ outline:2px solid #1a56db !important; outline-offset:2px; }
  body.a11y-head :is(h1,h2,h3,h4,h5,h6){ outline:2px dashed #7b34ff !important; outline-offset:3px !important; }
  body.a11y-anim *, body.a11y-anim *::before, body.a11y-anim *::after{
    animation:none !important; transition:none !important; scroll-behavior:auto !important; }
  body.a11y-cursor, body.a11y-cursor *{ cursor:${ARROW}, auto !important; }
  body.a11y-cursor a, body.a11y-cursor button, body.a11y-cursor [role="button"], body.a11y-cursor label,
  body.a11y-cursor select, body.a11y-cursor summary{ cursor:${HAND}, pointer !important; }
  body.a11y-c-high{ filter:contrast(1.4) !important; }
  body.a11y-c-invert{ filter:invert(1) hue-rotate(180deg) !important; }
  body.a11y-c-gray{ filter:grayscale(1) !important; }
  `;

  // ============================================================
  //  Build the widget DOM (button + empty panel shell + guide +
  //  mask + statement overlay), append to <html> so <body> effects
  //  never reach it.
  // ============================================================
  var styleEl = document.createElement('style');
  styleEl.id = 'a11y-css';
  styleEl.textContent = CSS;
  (document.head || document.documentElement).appendChild(styleEl);

  var root = document.createElement('div');
  root.id = 'a11y-root';
  root.innerHTML =
    '<button id="a11y-fab" type="button" aria-haspopup="dialog" aria-expanded="false" aria-controls="a11y-panel">' + A11Y_ICON + '</button>' +
    '<div id="a11y-panel" role="dialog" aria-modal="false"></div>' +
    '<div id="a11y-guide"></div>' +
    '<div id="a11y-mask"><div class="a11y-strip"></div></div>' +
    '<div id="a11y-stmt-ov" role="dialog" aria-modal="true"><div id="a11y-stmt-card"></div></div>';
  document.documentElement.appendChild(root);

  var fab = root.querySelector('#a11y-fab');
  var panel = root.querySelector('#a11y-panel');
  var guideEl = root.querySelector('#a11y-guide');
  var maskEl = root.querySelector('#a11y-mask');
  var stripEl = root.querySelector('.a11y-strip');
  var stmtOv = root.querySelector('#a11y-stmt-ov');
  var stmtCard = root.querySelector('#a11y-stmt-card');

  // ---- Panel markup for the current language ----
  var TILES = [
    { key: 'lineSpace', ic: 'line' }, { key: 'letterSpace', ic: 'letter' }, { key: 'readable', ic: 'readable' },
    { key: 'links', ic: 'links' }, { key: 'headings', ic: 'head' }, { key: 'stopAnim', ic: 'anim' },
    { key: 'bigCursor', ic: 'cursor' }, { key: 'guide', ic: 'guide' }, { key: 'mask', ic: 'mask' }
  ];
  var CONTRASTS = [
    { v: '', k: 'cNormal' }, { v: 'high', k: 'cHigh' }, { v: 'invert', k: 'cInvert' }, { v: 'gray', k: 'cGray' }
  ];
  function panelHtml() {
    var d = t();
    var tiles = TILES.slice();
    if (ttsOK) tiles.push({ key: 'tts', ic: 'tts' });
    var tilesHtml = tiles.map(function (x) {
      return '<button class="a11y-tile" type="button" role="switch" aria-checked="false" data-act="toggle" data-key="' + x.key + '">' +
        svg(x.ic) + '<span>' + esc(d[x.key]) + '</span></button>';
    }).join('');
    // Notification-sound mute toggle. Its on/off state lives in the
    // notify-sound.js module (window.KolkliSound), not in `state`, so it's a
    // remote control rather than an a11y effect; paint()/the click handler
    // special-case data-act="sound".
    tilesHtml += '<button class="a11y-tile" type="button" role="switch" aria-checked="false" data-act="sound">' +
      svg('sound') + '<span>' + esc(d.sound) + '</span></button>';
    var contrastHtml = CONTRASTS.map(function (c) {
      return '<button class="a11y-cbtn" type="button" role="radio" aria-checked="false" data-act="contrast" data-val="' + c.v + '">' +
        '<span class="sw" aria-hidden="true"></span><span>' + esc(d[c.k]) + '</span></button>';
    }).join('');
    var dots = '';
    for (var i = 0; i < ZOOMS.length; i++) dots += '<i></i>';
    return '' +
      '<div class="a11y-head-bar"><span class="a11y-title">' + A11Y_ICON + esc(d.title) + '</span>' +
        '<button class="a11y-x" type="button" data-act="close" aria-label="' + esc(d.close) + '">' + svg('close') + '</button></div>' +
      '<div class="a11y-body">' +
        '<div class="a11y-sec"><div class="a11y-sec-t">' + esc(d.textSize) + '</div>' +
          '<div class="a11y-step">' +
            '<button class="a11y-step-b" type="button" data-act="dec" aria-label="' + esc(d.dec) + '">' + svg('minus') + '</button>' +
            '<div class="a11y-dots" aria-hidden="true">' + dots + '</div>' +
            '<button class="a11y-step-b" type="button" data-act="inc" aria-label="' + esc(d.inc) + '">' + svg('plus') + '</button>' +
          '</div></div>' +
        '<div class="a11y-sec"><div class="a11y-sec-t">' + esc(d.contrast) + '</div>' +
          '<div class="a11y-seg" role="radiogroup" aria-label="' + esc(d.contrast) + '">' + contrastHtml + '</div></div>' +
        '<div class="a11y-grid">' + tilesHtml + '</div>' +
      '</div>' +
      '<div class="a11y-foot">' +
        '<button class="a11y-reset" type="button" data-act="reset">' + svg('reset') + esc(d.reset) + '</button>' +
        '<button class="a11y-stmt" type="button" data-act="statement">' + esc(d.statement) + '</button>' +
        '<div class="a11y-note">' + esc(d.note) + '</div>' +
      '</div>';
  }
  function renderPanel() {
    panel.innerHTML = panelHtml();
    panel.setAttribute('aria-label', t().title);
    fab.setAttribute('aria-label', t().open);
    fab.setAttribute('title', t().open);
    paint();
  }

  // ---- Reflect `state` onto the panel controls ----
  function paint() {
    var dots = panel.querySelectorAll('.a11y-dots i');
    dots.forEach(function (el, i) { el.classList.toggle('on', i <= state.fontScale); });
    var dec = panel.querySelector('[data-act="dec"]'), inc = panel.querySelector('[data-act="inc"]');
    if (dec) dec.disabled = state.fontScale <= 0;
    if (inc) inc.disabled = state.fontScale >= ZOOMS.length - 1;
    panel.querySelectorAll('[data-act="contrast"]').forEach(function (b) {
      b.setAttribute('aria-checked', b.getAttribute('data-val') === state.contrast ? 'true' : 'false');
    });
    panel.querySelectorAll('[data-act="toggle"]').forEach(function (b) {
      b.setAttribute('aria-checked', state[b.getAttribute('data-key')] ? 'true' : 'false');
    });
    // Sound tile: checked = notification sounds are ON. State is owned by the
    // notify-sound module; default to on if it hasn't loaded yet.
    var sb = panel.querySelector('[data-act="sound"]');
    if (sb) sb.setAttribute('aria-checked', (!window.KolkliSound || window.KolkliSound.enabled()) ? 'true' : 'false');
  }

  // ============================================================
  //  Apply `state` to the live page.
  // ============================================================
  function apply() {
    var b = document.body;
    if (!b) return;
    b.style.zoom = state.fontScale > 0 ? String(ZOOMS[state.fontScale]) : '';
    b.classList.toggle('a11y-line', !!state.lineSpace);
    b.classList.toggle('a11y-letter', !!state.letterSpace);
    b.classList.toggle('a11y-readable', !!state.readable);
    b.classList.toggle('a11y-links', !!state.links);
    b.classList.toggle('a11y-head', !!state.headings);
    b.classList.toggle('a11y-anim', !!state.stopAnim);
    b.classList.toggle('a11y-cursor', !!state.bigCursor);
    b.classList.remove('a11y-c-high', 'a11y-c-invert', 'a11y-c-gray');
    if (state.contrast) b.classList.add('a11y-c-' + state.contrast);
    guideEl.style.display = state.guide ? 'block' : 'none';
    maskEl.style.display = state.mask ? 'block' : 'none';
    if (state.stopAnim) pauseMedia();
    if (!state.tts && ttsOK) { try { window.speechSynthesis.cancel(); } catch (e) {} }
  }
  function pauseMedia() {
    try {
      document.querySelectorAll('video, audio').forEach(function (m) { try { m.pause(); } catch (e) {} });
    } catch (e) {}
  }

  // ============================================================
  //  Open / close the panel (with basic focus handling).
  // ============================================================
  var lastFocus = null;
  function openPanel() {
    lastFocus = document.activeElement;
    panel.classList.add('open');
    fab.setAttribute('aria-expanded', 'true');
    // The panel is visibility:hidden until .open lands; an element can't take
    // focus while still hidden, so defer a tick until it's actually focusable.
    var first = panel.querySelector('.a11y-x');
    if (first) setTimeout(function () { try { first.focus(); } catch (e) {} }, 30);
  }
  function closePanel() {
    if (!panel.classList.contains('open')) return;
    panel.classList.remove('open');
    fab.setAttribute('aria-expanded', 'false');
    try { fab.focus(); } catch (e) {}
  }
  function panelOpen() { return panel.classList.contains('open'); }

  fab.addEventListener('click', function () { panelOpen() ? closePanel() : openPanel(); });

  // Delegated panel actions.
  panel.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el) return;
    var act = el.getAttribute('data-act');
    if (act === 'close') { closePanel(); return; }
    if (act === 'dec') { if (state.fontScale > 0) state.fontScale--; }
    else if (act === 'inc') { if (state.fontScale < ZOOMS.length - 1) state.fontScale++; }
    else if (act === 'toggle') { var k = el.getAttribute('data-key'); state[k] = !state[k]; }
    else if (act === 'contrast') { var v = el.getAttribute('data-val'); state.contrast = (state.contrast === v ? '' : v); }
    else if (act === 'sound') { if (window.KolkliSound) { window.KolkliSound.toggle(); window.KolkliSound.success(); } paint(); return; }
    else if (act === 'reset') { state = defaults(); if (window.KolkliSound) window.KolkliSound.setEnabled(true); }
    else if (act === 'statement') { openStatement(); return; }
    save(); apply(); paint();
  });

  // Close panel on outside click / Esc.
  document.addEventListener('click', function (e) {
    if (!panelOpen()) return;
    if (root.contains(e.target)) return;
    closePanel();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (stmtOv.classList.contains('open')) { closeStatement(); return; }
    if (panelOpen()) closePanel();
  });

  // ============================================================
  //  Reading guide + mask follow the pointer.
  // ============================================================
  document.addEventListener('mousemove', function (e) {
    if (state.guide) guideEl.style.top = (e.clientY - 20) + 'px';
    if (state.mask) stripEl.style.top = (e.clientY - 65) + 'px';
  }, { passive: true });

  // ============================================================
  //  Read-aloud on click (browser/OS speech engine, opt-in).
  // ============================================================
  document.addEventListener('click', function (e) {
    if (!state.tts || !ttsOK) return;
    if (root.contains(e.target)) return;              // ignore the widget itself
    var el = e.target.closest('p,li,a,button,label,h1,h2,h3,h4,h5,h6,span,td,dd,dt,blockquote,figcaption,summary');
    if (!el) return;
    var text = (el.innerText || el.textContent || '').trim();
    if (!text) return;
    if (text.length > 600) text = text.slice(0, 600);
    try {
      window.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text);
      u.lang = ttsLang();
      window.speechSynthesis.speak(u);
    } catch (err) {}
  }, true);

  // ============================================================
  //  Accessibility statement dialog (he / en / ru).
  // ============================================================
  function contactHtml() {
    var rows = [];
    if (CONTACT.name) rows.push(esc(CONTACT.name));
    if (CONTACT.email) rows.push('<a href="mailto:' + esc(CONTACT.email) + '">' + esc(CONTACT.email) + '</a>');
    if (CONTACT.phone) rows.push('<a href="tel:' + esc(CONTACT.phone.replace(/\s+/g, '')) + '">' + esc(CONTACT.phone) + '</a>');
    return rows.join(' · ');
  }
  var STMT = {
    he: function () {
      return '<h3>המחויבות שלנו</h3>' +
        '<p>אנו רואים חשיבות רבה במתן שירות שוויוני ונגיש לכלל המשתמשים, ובכללם אנשים עם מוגבלות. אתר זה נבנה בהתאם להנחיות <b>WCAG 2.1 ברמה AA</b>, לתקן הישראלי <b>ת״י 5568</b> ולתקנות שוויון זכויות לאנשים עם מוגבלות (התאמות נגישות לשירות), התשע״ג-2013.</p>' +
        '<h3>כלי הנגישות שבאתר</h3>' +
        '<p>בכל עמוד זמין רכיב נגישות (הכפתור בפינת המסך) המאפשר, בין היתר:</p>' +
        '<ul><li>הגדלה והקטנה של גודל הטקסט</li><li>ריווח שורות וריווח אותיות</li><li>פונט קריא יותר</li>' +
        '<li>ניגודיות גבוהה, ניגודיות הפוכה וגווני אפור</li><li>הדגשת קישורים והדגשת כותרות</li>' +
        '<li>עצירת אנימציות ותנועה</li><li>סמן עכבר גדול</li><li>סרגל קריאה ומסכת קריאה</li><li>הקראת טקסט</li></ul>' +
        '<p>ניתן לאפס את כל ההגדרות בכל עת באמצעות כפתור <b>״איפוס הגדרות״</b>.</p>' +
        '<h3>פרטיות והגנת מידע (GDPR)</h3>' +
        '<p>בהתאם לתקנה הכללית להגנת מידע (GDPR) ולחוק הגנת הפרטיות:</p>' +
        '<ul><li>הגדרות הנגישות נשמרות <b>אך ורק בדפדפן שלכם</b> (localStorage), תחת מפתח יחיד.</li>' +
        '<li>הן <b>אינן כוללות מידע אישי</b>, אינן נשמרות בשרתינו ואינן מועברות לצד שלישי כלשהו.</li>' +
        '<li>הרכיב <b>אינו משתמש בעוגיות (cookies)</b>, אינו טוען משאבים חיצוניים ואינו מבצע מעקב.</li>' +
        '<li>מכיוון שהמידע נחוץ אך ורק כדי לספק תכונה שהפעלתם ביוזמתכם, אין צורך בהסכמה נפרדת.</li>' +
        '<li>ניתן למחוק את המידע בכל רגע בלחיצה על ״איפוס הגדרות״.</li></ul>' +
        '<p>אפשרות ההקראה נעזרת במנוע הדיבור המובנה בדפדפן או במערכת ההפעלה שלכם, ומופעלת רק לבקשתכם.</p>' +
        '<h3>ניווט במקלדת</h3>' +
        '<p>ניתן לנווט באתר באמצעות המקלדת: מעבר בין רכיבים ב-Tab / Shift+Tab, הפעלה ב-Enter או ברווח, וסגירת חלונות ותפריטים ב-Esc.</p>' +
        '<h3>מגבלות ידועות</h3>' +
        '<p>ייתכנו רכיבים או תכנים של צד שלישי שאינם בשליטתנו המלאה. אנו פועלים לשיפור מתמיד של הנגישות באתר.</p>' +
        '<h3>יצירת קשר בנושא נגישות</h3>' +
        '<p>אם נתקלתם בבעיית נגישות באתר, נשמח שתעדכנו אותנו ונטפל בה בהקדם.' +
        (contactHtml() ? ' ' + contactHtml() + '.' : '') + '</p>' +
        '<p><span class="a11y-badge">עודכן לאחרונה: יולי 2026</span></p>';
    },
    en: function () {
      return '<h3>Our commitment</h3>' +
        '<p>We are committed to providing an equal, accessible experience to all users, including people with disabilities. This site follows the <b>WCAG 2.1 level AA</b> guidelines and the Israeli Standard <b>IS 5568</b>.</p>' +
        '<h3>Accessibility tools on this site</h3>' +
        '<p>An accessibility widget (the button in the corner) is available on every page and lets you:</p>' +
        '<ul><li>Increase or decrease text size</li><li>Adjust line and letter spacing</li><li>Switch to a more readable font</li>' +
        '<li>Enable high contrast, negative contrast or grayscale</li><li>Highlight links and titles</li>' +
        '<li>Stop animations and motion</li><li>Enlarge the mouse cursor</li><li>Use a reading guide or reading mask</li><li>Have text read aloud</li></ul>' +
        '<p>You can undo everything at any time with <b>"Reset settings"</b>.</p>' +
        '<h3>Privacy &amp; data protection (GDPR)</h3>' +
        '<p>In line with the General Data Protection Regulation (GDPR):</p>' +
        '<ul><li>Your accessibility preferences are stored <b>only in your own browser</b> (localStorage), under a single key.</li>' +
        '<li>They contain <b>no personal data</b>, are never sent to our servers and are never shared with any third party.</li>' +
        '<li>The widget uses <b>no cookies</b>, loads no external resources and performs no tracking.</li>' +
        '<li>Because the data is strictly necessary to deliver a feature you turned on yourself, no separate consent is required.</li>' +
        '<li>You can erase it any time by pressing "Reset settings".</li></ul>' +
        '<p>The optional read-aloud feature uses your browser or operating system\'s built-in speech engine, and runs only when you ask it to.</p>' +
        '<h3>Keyboard navigation</h3>' +
        '<p>The site can be operated by keyboard: move with Tab / Shift+Tab, activate with Enter or Space, and close dialogs and menus with Esc.</p>' +
        '<h3>Known limitations</h3>' +
        '<p>Some third-party content may not be fully within our control. We work continuously to improve accessibility.</p>' +
        '<h3>Accessibility contact</h3>' +
        '<p>If you run into an accessibility problem, please let us know and we will address it promptly.' +
        (contactHtml() ? ' ' + contactHtml() + '.' : '') + '</p>' +
        '<p><span class="a11y-badge">Last updated: July 2026</span></p>';
    },
    ru: function () {
      return '<h3>Наши обязательства</h3>' +
        '<p>Мы стремимся обеспечить равный и доступный сервис для всех пользователей, включая людей с инвалидностью. Сайт соответствует рекомендациям <b>WCAG 2.1 уровня AA</b> и израильскому стандарту <b>IS 5568</b>.</p>' +
        '<h3>Инструменты доступности</h3>' +
        '<p>На каждой странице есть виджет доступности (кнопка в углу экрана), который позволяет:</p>' +
        '<ul><li>Увеличивать и уменьшать размер текста</li><li>Менять межстрочный и межбуквенный интервал</li><li>Включать читаемый шрифт</li>' +
        '<li>Включать высокий контраст, инверсию и оттенки серого</li><li>Выделять ссылки и заголовки</li>' +
        '<li>Останавливать анимацию</li><li>Увеличивать курсор</li><li>Использовать линейку и маску чтения</li><li>Озвучивать текст</li></ul>' +
        '<p>Все настройки можно сбросить в любой момент кнопкой <b>«Сбросить настройки»</b>.</p>' +
        '<h3>Конфиденциальность и защита данных (GDPR)</h3>' +
        '<p>В соответствии с Общим регламентом по защите данных (GDPR):</p>' +
        '<ul><li>Ваши настройки доступности хранятся <b>только в вашем браузере</b> (localStorage), под одним ключом.</li>' +
        '<li>Они <b>не содержат персональных данных</b>, не отправляются на наши серверы и не передаются третьим лицам.</li>' +
        '<li>Виджет <b>не использует cookie</b>, не загружает внешние ресурсы и не ведёт отслеживание.</li>' +
        '<li>Поскольку данные необходимы только для функции, которую вы включили сами, отдельное согласие не требуется.</li>' +
        '<li>Их можно удалить в любой момент кнопкой «Сбросить настройки».</li></ul>' +
        '<p>Функция озвучивания использует встроенный речевой движок вашего браузера или операционной системы и запускается только по вашему запросу.</p>' +
        '<h3>Навигация с клавиатуры</h3>' +
        '<p>Сайтом можно управлять с клавиатуры: перемещение — Tab / Shift+Tab, активация — Enter или пробел, закрытие окон и меню — Esc.</p>' +
        '<h3>Известные ограничения</h3>' +
        '<p>Некоторый контент третьих сторон может быть не полностью под нашим контролем. Мы постоянно работаем над улучшением доступности.</p>' +
        '<h3>Контакт по вопросам доступности</h3>' +
        '<p>Если вы столкнулись с проблемой доступности, сообщите нам, и мы оперативно её устраним.' +
        (contactHtml() ? ' ' + contactHtml() + '.' : '') + '</p>' +
        '<p><span class="a11y-badge">Обновлено: июль 2026</span></p>';
    }
  };
  var stmtLastFocus = null;
  function renderStatement() {
    var d = t();
    var body = (STMT[curLang()] || STMT.he)();
    stmtCard.innerHTML =
      '<div class="a11y-stmt-h"><h2>' + esc(d.statement) + '</h2>' +
        '<button class="a11y-x2" type="button" data-act="stmt-close" aria-label="' + esc(d.stmtClose) + '">' + svg('close') + '</button></div>' +
      '<div class="a11y-stmt-b">' + body + '</div>';
  }
  function openStatement() {
    stmtLastFocus = document.activeElement;
    renderStatement();
    stmtOv.classList.add('open');
    var x = stmtCard.querySelector('.a11y-x2');
    if (x) x.focus();
  }
  function closeStatement() {
    stmtOv.classList.remove('open');
    try { (stmtLastFocus || fab).focus(); } catch (e) {}
  }
  stmtOv.addEventListener('click', function (e) {
    if (e.target === stmtOv || e.target.closest('[data-act="stmt-close"]')) closeStatement();
  });
  // Simple focus trap inside the statement dialog.
  stmtOv.addEventListener('keydown', function (e) {
    if (e.key !== 'Tab' || !stmtOv.classList.contains('open')) return;
    var f = stmtCard.querySelectorAll('button, a[href], [tabindex]:not([tabindex="-1"])');
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  // ============================================================
  //  Stay in sync with page language / theme changes (same trick
  //  header.js uses). Class toggles on <body>/<html> won't fire it.
  // ============================================================
  new MutationObserver(function () { renderPanel(); if (stmtOv.classList.contains('open')) renderStatement(); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['lang', 'dir', 'data-theme'] });

  // ============================================================
  //  Boot. renderPanel() only needs <html>; apply() needs <body>,
  //  so if header.js loaded us before <body> parsed, wait for it.
  // ============================================================
  renderPanel();
  if (document.body) apply();
  else document.addEventListener('DOMContentLoaded', apply, { once: true });
})();
