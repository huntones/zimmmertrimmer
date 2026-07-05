/* ============================================================
   Shared site header (KOLKLI) — one source of truth for every page.
   Renders the sticky nav into <div id="site-header"></div>.

   Integration contract with each page:
     - It provides the #langBtn / #themeToggle buttons and the
       #langIco / #themeIco icon spans, using the SAME ids the pages
       already wire up. Each page's own applyLang()/applyTheme() keep
       working unchanged — they just find these elements in the header.
     - The header now OWNS the language picker: #langBtn opens a dropdown
       (#langMenu) with the three interface languages. Each page exposes
       its own applyLang() as window.__setLang, and the header calls it so
       the page re-renders in place (state preserved). Pages that predate
       the hook still fall back to a plain lang/dir swap on <html>.
     - It must run BEFORE a page's inline script, so it is included as a
       classic (blocking) <script> right after the #site-header div at
       the top of <body>. By the time the page script calls
       el('langBtn'), the header already exists.
     - It owns its OWN label translation (nav links, Sign in, Get
       started) via a MutationObserver on <html>'s lang/dir/data-theme —
       every page sets those on language/theme change, so the header
       stays in sync without any per-page hookup.
   ============================================================ */
(function () {
  var mount = document.getElementById('site-header');
  if (!mount) return;

  var T = {
    he: { navTools:'כלי עריכה', navDev:'כלי עיצוב ודיגיטל', navAI:'כלי AI', navText:'כלי טקסט', navConvert:'המרה', navCompress:'דחיסה', navMarketing:'כלי שיווק וקישורים', navCalc:'מחשבונים',
          navSend:'שליחת קבצים', navRequest:'קבלת קבצים', navProducts:'כלי קבצים', navPricing:'מסלולים ומחירים', navSignin:'התחברות', navStart:'הרשמה', navNew:'חדש',
          acctDash:'החשבון שלי', acctFiles:'הקבצים שלי', acctRequest:'קבלת קבצים', acctReview:'אישורי לקוח', acctSettings:'הגדרות', acctLanguage:'שפות', acctAdmin:'ניהול', acctLogout:'התנתקות' },
    en: { navTools:'Editing Tools', navDev:'Design & Digital', navAI:'AI Tools', navText:'Text Tools', navConvert:'Convert', navCompress:'Compress', navMarketing:'Marketing & Links', navCalc:'Calculators',
          navSend:'Send Files', navRequest:'Request Files', navProducts:'Files', navPricing:'Pricing', navSignin:'Login', navStart:'Sign Up', navNew:'New',
          acctDash:'My Account', acctFiles:'My Files', acctRequest:'File Requests', acctReview:'Client Review', acctSettings:'Settings', acctLanguage:'Language', acctAdmin:'Admin', acctLogout:'Log out' },
    ru: { navTools:'Редактирование', navDev:'Дизайн и диджитал', navAI:'AI-инструменты', navText:'Текстовые инструменты', navConvert:'Конвертация', navCompress:'Сжатие', navMarketing:'Маркетинг и ссылки', navCalc:'Калькуляторы',
          navSend:'Отправка файлов', navRequest:'Запрос файлов', navProducts:'Файлы', navPricing:'Цены', navSignin:'Вход', navStart:'Регистрация', navNew:'Новое',
          acctDash:'Мой аккаунт', acctFiles:'Мои файлы', acctRequest:'Запросы файлов', acctReview:'Одобрения', acctSettings:'Настройки', acctLanguage:'Язык', acctAdmin:'Админ', acctLogout:'Выйти' }
  };

  // The three interface languages. `name` is the endonym shown both in the
  // picker and (for the active one) next to the globe. `dir` drives <html>.
  var LANGS = [
    { code:'he', name:'עברית',   dir:'rtl' },
    { code:'en', name:'English', dir:'ltr' },
    { code:'ru', name:'Русский', dir:'ltr' }
  ];
  var LNAME = { he:'עברית', en:'English', ru:'Русский' };
  function langDir(l) { return l === 'he' ? 'rtl' : 'ltr'; }

  // [ i18n key, page path from the site root ]  (navTools + navProducts are dropdowns → null path)
  var LINKS = [
    ['navTools', null], ['navProducts', null], ['navAI', 'ai/'], ['navPricing', 'pricing/'], ['navDev', null], ['navText', null]
  ];

  // "Products" dropdown: the three file-transfer product pages. Each links to its
  // own dedicated page. Labels + one-line descriptions carried inline per language
  // (mirrors the TOOLS mega-menu items), with an icon key from IC.
  var PRODUCTS = [
    { ic:'folder', page:'files.html',   he:'ארגון קבצים', en:'Organize Files',  ru:'Упорядочить файлы',
      dhe:'בחירה וניהול הקבצים שלך', den:'Pick & manage your files', dru:'Выбор и управление файлами' },
    { ic:'inbox',  page:'request.html', he:'קבלת קבצים',  en:'Request Files', ru:'Запрос файлов',
      dhe:'איסוף קבצים מאחרים', den:'Collect files from others', dru:'Сбор файлов от других' },
    { ic:'send',   page:'send.html',    he:'שליחת קבצים', en:'Send Files',    ru:'Отправка файлов',
      dhe:'שיתוף קבצים גדולים בקישור', den:'Share big files by link', dru:'Большие файлы по ссылке' },
    { ic:'check',  page:'review.html',  he:'משוב ואישור קבצים',  en:'Client Review', ru:'Одобрение клиента',
      dhe:'שליחה לאישור הלקוח', den:'Send work for client sign-off', dru:'Отправка работы на одобрение' }
  ];

  // "AI Tools" dropdown: the AI-powered tools, each a row like the Products menu
  // (colored icon tile + name + one-line description). Mirrors the wording used in
  // the AI grid on the landing page. Icon keys come from IC below.
  var AITOOLS = [
    { ic:'headphones', page:'ai-audio-cleanup.html', he:'ניקוי אודיו AI', en:'AI Audio Cleanup', ru:'AI-очистка аудио',
      dhe:'הסרת רעש ושיפור קול', den:'Remove noise, enhance voice', dru:'Убрать шум, улучшить голос' },
    { ic:'sparkle', page:'ai-master.html', he:'מאסטרינג AI', en:'AI Mastering', ru:'AI-мастеринг',
      dhe:'מאסטרינג אוטומטי לשיר', den:'Auto-master your track', dru:'Автомастеринг трека' },
    { ic:'crop', page:'ai-smart-crop.html', he:'חיתוך חכם AI', en:'AI Smart Crop', ru:'AI-умная обрезка',
      dhe:'AI ממקם את החיתוך על הנושא', den:'AI centers the crop', dru:'AI центрирует кадр' },
    { ic:'wand', page:'ai-object-remover.html', he:'הסרת אובייקטים AI', en:'AI Object Remover', ru:'AI-удаление объектов',
      dhe:'מחקו כל דבר מהתמונה', den:'Erase anything from a photo', dru:'Сотрите что угодно с фото' },
    { ic:'eraser', page:'remove-bg.html', he:'הסרת רקע AI', en:'AI Remove Background', ru:'AI-удаление фона',
      dhe:'הסרת רקע בקליק', den:'Delete the background in a click', dru:'Удалить фон в один клик' },
    { ic:'sparkles', page:'restore-image.html', he:'שחזור תמונה AI', en:'AI Photo Restore', ru:'AI-восстановление фото',
      dhe:'שיפור תמונות ישנות', den:'Revive old photos', dru:'Оживите старые фото' },
    { ic:'captions', page:'subtitle-generator.html', he:'כתוביות AI', en:'AI Subtitles', ru:'AI-субтитры',
      dhe:'תמלול וכתוביות אוטומטי', den:'Auto transcript & captions', dru:'Авто-транскрипция и субтитры' },
    { ic:'text', page:'ai-summarize-pdf.html', he:'סיכום PDF AI', en:'AI Summarize PDF', ru:'AI-конспект PDF',
      dhe:'תקציר חכם לכל PDF', den:'A smart summary of any PDF', dru:'Умное резюме любого PDF' }
  ];
  // Full-width footer link at the bottom of the AI menu → the AI hub page.
  var AI_FOOT = { he:'לכל כלי ה-AI ←', en:'All AI tools →', ru:'Все AI-инструменты →' };

  // Depth-aware root prefix. The shared header is loaded both at the site root
  // (index.html, app.html, ...) and one level deep inside folder pages
  // (/pricing/, /audio/, ...). ROOT points back to the site root from wherever we
  // are, so every link below resolves correctly in both places.
  var curFile = (location.pathname.split('/').pop() || '').toLowerCase();
  var depth = location.pathname.replace(/[^/]*$/, '').split('/').filter(Boolean).length;
  var ROOT = depth ? new Array(depth + 1).join('../') : './';
  var onIndex = (depth === 0 && (curFile === '' || curFile === 'index.html'));
  var homeHref = onIndex ? '#top' : ROOT;                    // brand -> home
  function link(p) { return ROOT + p; }                      // page/asset from site root
  function homeHash(hash) { return onIndex ? hash : ROOT + hash; } // section on the home page

  var CHEV = '<svg class="sh-chev" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>';

  // Line-icon set for the mega-menu tools (Feather-style, inherit currentColor).
  var IC = {
    scissors:'<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/>',
    refresh:'<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
    flip:'<polyline points="17 2 21 6 17 10"/><path d="M3 12V9a3 3 0 0 1 3-3h15"/><polyline points="7 22 3 18 7 14"/><path d="M21 12v3a3 3 0 0 1-3 3H3"/>',
    merge:'<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 0 0 9 9"/>',
    pulse:'<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
    maximize:'<path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/>',
    crop:'<path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/>',
    sparkle:'<path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17l-1.9-5.6L4.5 10l5.6-1.9z"/>',
    image:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
    film:'<rect x="2" y="2" width="20" height="20" rx="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/>',
    captions:'<rect x="3" y="5" width="18" height="14" rx="2"/><line x1="7" y1="11" x2="10" y2="11"/><line x1="13" y1="11" x2="17" y2="11"/><line x1="7" y1="15" x2="11" y2="15"/><line x1="14" y1="15" x2="17" y2="15"/>',
    music:'<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    minimize:'<polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/>',
    volume:'<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>',
    layers:'<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
    file:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
    folder:'<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
    headphones:'<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>',
    editwave:'<path d="M2 12h1.5"/><path d="M6.5 8v8"/><path d="M10.5 4.5v15"/><path d="M14.5 9v6"/><path d="M18.5 6.5v11"/><path d="M22 11.5v1"/>',
    sparkles:'<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/>',
    wand:'<path d="m3 21 9-9"/><path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/><path d="M17.8 11.8 19 13"/><path d="M15 9h.01"/><path d="M17.8 6.2 19 5"/><path d="M12.2 6.2 11 5"/>',
    droplet:'<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>',
    archive:'<polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/>',
    send:'<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
    inbox:'<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    check:'<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
    swatch:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    palette:'<circle cx="13.5" cy="6.5" r="1.2"/><circle cx="17" cy="10" r="1.2"/><circle cx="8" cy="6" r="1.2"/><circle cx="6" cy="11" r="1.2"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10a2 2 0 0 0 2-2c0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.2a1.5 1.5 0 0 1 1.5-1.5H16c3.3 0 6-2.7 6-6 0-4.4-4.5-8-10-8z"/>',
    contrast:'<circle cx="12" cy="12" r="9"/><path d="M12 3v18a9 9 0 0 0 0-18z"/>',
    gradient:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="m21 5-16 16"/><path d="m21 11-10 10"/><path d="m21 17-4 4"/>',
    shadow:'<rect x="3" y="3" width="13" height="13" rx="2"/><path d="M21 8v11a2 2 0 0 1-2 2H8"/>',
    radius:'<path d="M21 21v-6a8 8 0 0 0-8-8H7"/><path d="M3 3v3"/><path d="M3 3h3"/>',
    minify:'<path d="M4 9V6a2 2 0 0 1 2-2h3"/><path d="M20 9V6a2 2 0 0 0-2-2h-3"/><path d="M4 15v3a2 2 0 0 0 2 2h3"/><path d="M20 15v3a2 2 0 0 1-2 2h-3"/><line x1="7" y1="12" x2="17" y2="12"/>',
    braces:'<path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1"/><path d="M16 3h1a2 2 0 0 1 2 2v5a2 2 0 0 0 2 2 2 2 0 0 0-2 2v5a2 2 0 0 1-2 2h-1"/>',
    link:'<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    tags:'<path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1"/>',
    text:'<path d="M4 7V5h16v2"/><path d="M9 19h6"/><path d="M12 5v14"/>',
    star:'<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    code:'<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
    ruler:'<path d="M21.3 8.7 8.7 21.3a1 1 0 0 1-1.4 0l-4.6-4.6a1 1 0 0 1 0-1.4L15.3 2.7a1 1 0 0 1 1.4 0l4.6 4.6a1 1 0 0 1 0 1.4z"/><path d="m9 11 1.5 1.5"/><path d="m12 8 1.5 1.5"/><path d="m6 14 1.5 1.5"/><path d="m15 5 1.5 1.5"/>',
    ratio:'<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 4 20 16"/>',
    eraser:'<path d="m7 21-4.3-4.3a1 1 0 0 1 0-1.4L14 4a2 2 0 0 1 2.8 0l4.2 4.2a2 2 0 0 1 0 2.8L12 20"/><path d="M22 21H7"/><path d="m5 13 6 6"/>',
    wind:'<path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2"/><path d="M9.6 4.6A2 2 0 1 1 11 8H2"/><path d="M12.6 19.4A2 2 0 1 0 14 16H2"/>',
    sort:'<path d="M11 5h10"/><path d="M11 9h7"/><path d="M11 13h4"/><path d="m3 17 3 3 3-3"/><path d="M6 18V4"/>',
    copy:'<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    plus:'<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>',
    listnum:'<line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-1.5 2-2.5S5 14 4 14.5"/>',
    at:'<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/>',
    hash:'<line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/>',
    table:'<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="12" y1="9" x2="12" y2="21"/>'
  };
  function svg(name) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + (IC[name] || '') + '</svg>'; }

  // Groups shown in the "Tools" mega-menu. Live tools link straight to their
  // page; everything else links to its category section on the landing page.
  // Each item carries an icon key + a short he/en/ru name and description.
  var TOOLS = [
    { c:'audio', i:'🎵', hash:'#audio', he:'אודיו', en:'Audio', ru:'Аудио', items:[
      { he:'חותך אודיו', en:'Audio Cutter', ru:'Обрезка аудио', dhe:'חיתוך וקיצוץ MP3', den:'Trim & cut MP3', dru:'Обрезка и нарезка MP3', ic:'scissors', page:'./app.html' },
      { he:'המרת אודיו', en:'Convert Audio', ru:'Конвертация аудио', dhe:'MP3, WAV, FLAC ועוד', den:'MP3, WAV, FLAC…', dru:'MP3, WAV, FLAC…', ic:'refresh', page:'./convert.html' },
      { he:'עורך אודיו', en:'Audio Editor', ru:'Аудиоредактор', dhe:'עריכה חזותית עם גלי קול', den:'Visual waveform editor', dru:'Редактор с волновой формой', ic:'editwave', page:'./audio-editor.html' },
      { he:'מאסטרינג AI', en:'AI Mastering', ru:'AI-мастеринг', dhe:'מאסטרינג אוטומטי לשיר', den:'Auto-master your track', dru:'Автомастеринг трека', ic:'sparkle', page:'./ai-master.html' },
      { he:'ניקוי אודיו AI', en:'AI Audio Cleanup', ru:'AI-очистка аудио', dhe:'הסרת רעש ושיפור קול', den:'Remove noise, enhance voice', dru:'Убрать шум, улучшить голос', ic:'headphones', page:'./ai-audio-cleanup.html' }
    ]},
    { c:'image', i:'🖼️', hash:'#images', he:'תמונות', en:'Images', ru:'Изображения', items:[
      { he:'שינוי גודל', en:'Resize Image', ru:'Изменение размера', dhe:'שינוי מידות מהיר', den:'Change dimensions', dru:'Изменить размеры', ic:'maximize', page:'./resize-image.html' },
      { he:'סימן מים', en:'Watermark', ru:'Водяной знак', dhe:'טקסט או לוגו על התמונה', den:'Add text or a logo', dru:'Текст или логотип на фото', ic:'droplet', page:'./watermark.html' },
      { he:'חיתוך חכם AI', en:'AI Smart Crop', ru:'AI-умная обрезка', dhe:'AI ממקם את החיתוך על הנושא', den:'AI centers the crop', dru:'AI центрирует кадр', ic:'sparkle', page:'./ai-smart-crop.html' },
      { he:'שחזור תמונה AI', en:'AI Photo Restore', ru:'AI-восстановление фото', dhe:'שיפור תמונות ישנות', den:'Revive old photos', dru:'Оживите старые фото', ic:'sparkles', page:'./restore-image.html' },
      { he:'הסרת אובייקטים AI', en:'AI Object Remover', ru:'AI-удаление объектов', dhe:'מחקו כל דבר מהתמונה', den:'Erase anything from a photo', dru:'Сотрите что угодно с фото', ic:'wand', page:'./ai-object-remover.html' }
    ]},
    { c:'video', i:'🎬', hash:'#video', he:'וידאו', en:'Video', ru:'Видео', items:[
      { he:'חותך וידאו', en:'Video Cutter', ru:'Обрезка видео', dhe:'חיתוך קטעים במהירות', den:'Trim clips fast', dru:'Быстрая нарезка клипов', ic:'scissors', page:'./video-cut.html' },
      { he:'MP4 ל-MP3', en:'MP4 to MP3', ru:'MP4 в MP3', dhe:'חילוץ פס הקול', den:'Extract the audio', dru:'Извлечь звук', ic:'music', page:'./mp4-to-mp3.html' },
      { he:'דחיסת וידאו', en:'Compress Video', ru:'Сжатие видео', dhe:'הקטנת נפח הקובץ', den:'Shrink file size', dru:'Уменьшить размер файла', ic:'minimize', page:'./compress-video.html' },
      { he:'חילוץ אודיו', en:'Extract Audio', ru:'Извлечь аудио', dhe:'שמירת הסאונד בלבד', den:'Pull the soundtrack', dru:'Сохранить звуковую дорожку', ic:'volume', page:'./extract-audio.html' },
      { he:'כתוביות AI', en:'AI Subtitles', ru:'AI-субтитры', dhe:'תמלול וכתוביות אוטומטי', den:'Auto transcript & captions', dru:'Авто-транскрипция и субтитры', ic:'captions', page:'./subtitle-generator.html' }
    ]},
    { c:'docs', i:'📄', hash:'#documents', he:'מסמכים', en:'Documents', ru:'Документы', items:[
      { he:'מיזוג PDF', en:'Merge PDF', ru:'Объединить PDF', dhe:'איחוד קבצי PDF', den:'Combine PDFs', dru:'Склейка PDF-файлов', ic:'layers', page:'./merge-pdf.html' },
      { he:'PDF ל-JPG', en:'PDF to JPG', ru:'PDF в JPG', dhe:'המרת עמודים לתמונות', den:'Pages to images', dru:'Страницы в изображения', ic:'image', page:'./pdf-to-jpg.html' },
      { he:'DOC ל-PDF', en:'DOC to PDF', ru:'DOC в PDF', dhe:'המרת Word ל-PDF', den:'Word to PDF', dru:'Word в PDF', ic:'file', page:'./doc-to-pdf.html' },
      { he:'ארגון קבצים', en:'Organize Files', ru:'Упорядочить файлы', dhe:'מיון ושינוי שמות', den:'Sort & rename', dru:'Сортировка и переименование', ic:'folder', page:'./files.html' }
    ]},
    { c:'conv', i:'🔄', hash:'#converters', he:'ממירים', en:'Converters', ru:'Конвертеры', items:[
      { he:'ממיר אודיו', en:'Audio Converter', ru:'Аудиоконвертер', dhe:'כל פורמט אודיו', den:'Any audio format', dru:'Любой аудиоформат', ic:'headphones', page:'./convert.html' },
      { he:'ממיר וידאו', en:'Video Converter', ru:'Видеоконвертер', dhe:'כל פורמט וידאו', den:'Any video format', dru:'Любой видеоформат', ic:'film', page:'./video-convert.html' },
      { he:'ממיר תמונות', en:'Image Converter', ru:'Конвертер изображений', dhe:'PNG, JPG, WebP ועוד', den:'PNG, JPG, WebP…', dru:'PNG, JPG, WebP…', ic:'image', page:'./image-convert.html' },
      { he:'ממיר מסמכים', en:'Document Converter', ru:'Конвертер документов', dhe:'מסמכים וגיליונות', den:'Docs & sheets', dru:'Документы и таблицы', ic:'file', page:'./doc-convert.html' },
      { he:'ממיר ארכיונים', en:'Archive Converter', ru:'Конвертер архивов', dhe:'ZIP, GZIP ועוד', den:'ZIP, GZIP & more', dru:'ZIP, GZIP и другие', ic:'archive', page:'./archive-convert.html' },
    ]},
    { c:'comp', i:'📦', hash:'#compress', he:'דחיסה', en:'Compress', ru:'Сжатие', items:[
      { he:'דחיסת תמונה', en:'Compress Image', ru:'Сжать изображение', dhe:'תמונות קטנות יותר', den:'Smaller images', dru:'Уменьшить изображения', ic:'image', page:'./compress-image.html' },
      { he:'דחיסת וידאו', en:'Compress Video', ru:'Сжать видео', dhe:'וידאו קטן יותר', den:'Smaller videos', dru:'Уменьшить видео', ic:'film', page:'./compress-video.html' },
      { he:'דחיסת אודיו', en:'Compress Audio', ru:'Сжать аудио', dhe:'אודיו קטן יותר', den:'Smaller audio', dru:'Уменьшить аудио', ic:'music', page:'./compress-audio.html' },
      { he:'דחיסת PDF', en:'Compress PDF', ru:'Сжать PDF', dhe:'הקטנת נפח PDF', den:'Reduce PDF size', dru:'Уменьшить размер PDF', ic:'minimize', page:'./compress-pdf.html' },
      { he:'דחיסת ZIP', en:'Compress ZIP', ru:'Сжать ZIP', dhe:'איגוד קבצים ל-ZIP', den:'Files into one ZIP', dru:'Файлы в один ZIP', ic:'archive', page:'./compress-zip.html' }
    ]}
  ];

  // Bottom promo bar of the mega-menu: [badge, text, cta] per language.
  var MEGA_FOOT = {
    he: ['חדש', 'כלי ה-AI כאן — תארו מה צריך, ואנחנו נבנה', 'כל הכלים ←'],
    en: ['NEW', 'AI Tools are here — describe it, we build it', 'Explore all tools →'],
    ru: ['НОВОЕ', 'AI-инструменты уже здесь — опишите задачу, мы сделаем', 'Все инструменты →']
  };

  function megaHtml(lang) {
    var cols = TOOLS.map(function (c) {
      var items = c.items.map(function (t) {
        var itemHref = t.page ? link(t.page.replace(/^\.\//, '')) : link(c.hash.slice(1) + '/');
        var icStyle = t.clr ? ' style="--ic:' + t.clr[0] + ';--ic-bg:' + t.clr[1] + '"' : '';
        return '<a class="sh-item" href="' + itemHref + '" role="menuitem">' +
          '<span class="it-ic"' + icStyle + '>' + svg(t.ic) + '</span>' +
          '<span class="it-tx"><span class="it-t">' + t[lang] + '</span>' +
          '<span class="it-d">' + t['d' + lang] + '</span></span></a>';
      }).join('');
      return '<div class="sh-col c-' + c.c + '">' +
        '<a class="sh-col-h" href="' + link(c.hash.slice(1) + '/') + '"><span class="sh-col-i">' + c.i + '</span>' + c[lang] + '</a>' +
        items + '</div>';
    }).join('');
    var f = MEGA_FOOT[lang] || MEGA_FOOT.en;
    var foot = '<span class="sh-foot-t"><span class="sh-foot-badge">' + f[0] + '</span> ' + f[1] + '</span>' +
      '<a class="sh-foot-cta" href="' + link('tools/') + '">' + f[2] + '</a>';
    return '<div class="sh-mega-in">' + cols + '</div><div class="sh-mega-foot">' + foot + '</div>';
  }

  // ============================================================
  //  "Design & Dev Tools" mega-menu. A second #shDevMega element
  //  reuses the .sh-mega styling; its columns group the 18 design/
  //  developer utilities. Only tools with a real page link out; the
  //  rest point at the /dev-tools/ hub until they ship.
  // ============================================================
  var DEVTOOLS = [
    { c:'color', i:'🎨', he:'צבע', en:'Color', ru:'Цвет', items:[
      { he:'ממיר צבעים', en:'Color Converter', ru:'Конвертер цвета', dhe:'HEX, RGB, HSL, CMYK', den:'HEX, RGB, HSL, CMYK', dru:'HEX, RGB, HSL, CMYK', ic:'swatch', page:'./color-convert.html' },
      { he:'מחולל פלטת צבעים', en:'Palette Generator', ru:'Генератор палитр', dhe:'פלטה מצבע או מתמונה', den:'From a color or image', dru:'Из цвета или картинки', ic:'palette', page:'./palette-generator.html' },
      { he:'בודק ניגודיות', en:'Contrast Checker', ru:'Проверка контраста', dhe:'קריאות טקסט על רקע', den:'Text vs. background', dru:'Текст на фоне', ic:'contrast', page:'./contrast-checker.html' }
    ]},
    { c:'css', i:'🧩', he:'CSS', en:'CSS', ru:'CSS', items:[
      { he:'מחולל Gradient', en:'Gradient Generator', ru:'Генератор градиентов', dhe:'גרדיאנט + קוד CSS', den:'Gradient + CSS code', dru:'Градиент + CSS', ic:'gradient', page:'./gradient-generator.html' },
      { he:'מחולל Box Shadow', en:'Box Shadow', ru:'Box Shadow', dhe:'צל + קוד CSS', den:'Shadow + CSS code', dru:'Тень + CSS', ic:'shadow', page:'./box-shadow.html' },
      { he:'מחולל Border Radius', en:'Border Radius', ru:'Border Radius', dhe:'פינות מעוגלות + CSS', den:'Rounded corners + CSS', dru:'Скругление + CSS', ic:'radius', page:'./border-radius.html' }
    ]},
    { c:'code', i:'⌨️', he:'קוד ונתונים', en:'Code & Data', ru:'Код и данные', items:[
      { he:'תמונה ל-Base64', en:'Image to Base64', ru:'Изображение в Base64', dhe:'הטמעת תמונה בקוד', den:'Inline an image', dru:'Встроить картинку', ic:'image', page:'./image-to-base64.html' },
      { he:'כיווץ CSS / JS', en:'Minify CSS / JS', ru:'Минификация CSS/JS', dhe:'הקטנת קוד', den:'Shrink your code', dru:'Уменьшить код', ic:'minify', page:'./minify.html' },
      { he:'JSON Formatter', en:'JSON Formatter', ru:'JSON-форматтер', dhe:'סידור ובדיקת JSON', den:'Prettify & validate', dru:'Форматирование JSON', ic:'braces', page:'./json-formatter.html' },
      { he:'URL Encoder / Decoder', en:'URL Encoder / Decoder', ru:'URL-кодировщик', dhe:'קידוד ופענוח כתובות', den:'Encode & decode URLs', dru:'Кодирование URL', ic:'link', page:'./url-encode.html' },
      { he:'היפוך טקסט', en:'KolKli Reverse', ru:'Обратный текст', dhe:'היפוך חכם עם פיסוק וסוגריים', den:'Smart reverse with punctuation', dru:'Умный переворот текста', ic:'flip', page:'./text-tools.html#reverse' },
      { he:'מנקה HTML', en:'HTML Cleaner', ru:'Очистка HTML', dhe:'הסרת תגיות מיותרות', den:'Strip junk tags', dru:'Убрать лишние теги', ic:'eraser', page:'./html-cleaner.html' }
    ]},
    { c:'seo', i:'🔎', he:'SEO ו-Meta', en:'SEO & Meta', ru:'SEO и Meta', items:[
      { he:'מחולל Meta Tags', en:'Meta Tags Generator', ru:'Генератор Meta-тегов', dhe:'Title, OG ו-SEO', den:'Title, OG & SEO', dru:'Title, OG и SEO', ic:'tags', page:'./meta-tags.html' },
      { he:'בודק אורך Meta', en:'Meta Length Checker', ru:'Длина Meta', dhe:'Title ו-Description', den:'Title & description', dru:'Title и Description', ic:'text', page:'./meta-length.html' },
      { he:'מחולל Favicon', en:'Favicon Generator', ru:'Генератор Favicon', dhe:'אייקון מלוגו או תמונה', den:'Icon from a logo', dru:'Иконка из логотипа', ic:'star', page:'./favicon-generator.html' },
      { he:'מחולל קוד Embed', en:'Embed Code', ru:'Код встраивания', dhe:'סרטון, מפה או טופס', den:'Video, map or form', dru:'Видео, карта, форма', ic:'code', page:'./embed-code.html' }
    ]},
    { c:'layout', i:'📐', he:'מסך ומידות', en:'Layout & Units', ru:'Экран и размеры', items:[
      { he:'ממיר מידות מסך', en:'Screen Units', ru:'Единицы экрана', dhe:'PX ל-REM, EM, VW, VH', den:'PX to REM, EM, VW, VH', dru:'PX в REM, EM, VW, VH', ic:'ruler', page:'./screen-units.html' },
      { he:'מחשבון יחס תמונה', en:'Aspect Ratio', ru:'Соотношение сторон', dhe:'16:9, 1:1, 4:5, 9:16', den:'16:9, 1:1, 4:5, 9:16', dru:'16:9, 1:1, 4:5, 9:16', ic:'ratio', page:'./aspect-ratio.html' },
      { he:'מחולל Placeholder', en:'Placeholder Generator', ru:'Генератор заглушок', dhe:'תמונת דמה עם מידות', den:'Dummy image with size', dru:'Заглушка с размерами', ic:'crop', page:'./placeholder-generator.html' }
    ]}
  ];

  var DEV_FOOT = {
    he: ['חדש', 'כלים חינמיים למעצבים ולמפתחים — הכול בדפדפן', 'לכל כלי העיצוב ←'],
    en: ['NEW', 'Free tools for designers & developers — all in-browser', 'All design tools →'],
    ru: ['НОВОЕ', 'Бесплатные инструменты для дизайнеров и разработчиков', 'Все инструменты →']
  };

  function devMegaHtml(lang) {
    var hub = link('dev-tools/');
    var cols = DEVTOOLS.map(function (c) {
      var items = c.items.map(function (t) {
        var itemHref = t.page ? link(t.page.replace(/^\.\//, '')) : hub;
        return '<a class="sh-item" href="' + itemHref + '" role="menuitem">' +
          '<span class="it-ic">' + svg(t.ic) + '</span>' +
          '<span class="it-tx"><span class="it-t">' + t[lang] + '</span>' +
          '<span class="it-d">' + t['d' + lang] + '</span></span></a>';
      }).join('');
      return '<div class="sh-col c-' + c.c + '">' +
        '<a class="sh-col-h" href="' + hub + '"><span class="sh-col-i">' + c.i + '</span>' + c[lang] + '</a>' +
        items + '</div>';
    }).join('');
    var f = DEV_FOOT[lang] || DEV_FOOT.en;
    var foot = '<span class="sh-foot-t"><span class="sh-foot-badge">' + f[0] + '</span> ' + f[1] + '</span>' +
      '<a class="sh-foot-cta" href="' + hub + '">' + f[2] + '</a>';
    return '<div class="sh-mega-in sh-mega-in-dev">' + cols + '</div><div class="sh-mega-foot">' + foot + '</div>';
  }

  // ============================================================
  //  "Text Tools" mega-menu. A third #shTextMega element reuses
  //  the .sh-mega styling; three grouped columns hold the 17 text
  //  utilities, each deep-linking into text-tools.html#<slug>.
  // ============================================================
  var TEXT_GROUPS = [
    { c:'tedit', i:'✍️', he:'עיבוד טקסט', en:'Edit Text', ru:'Обработка', items:[
      { slug:'reverse', ic:'flip', he:'היפוך טקסט', en:'Reverse Text', ru:'Обратить текст', dhe:'תווים, מילים או שורות', den:'Characters, words or lines', dru:'Символы, слова, строки' },
      { slug:'case', ic:'text', he:'שינוי אותיות', en:'Change Case', ru:'Регистр', dhe:'גדולות, קטנות, Title', den:'UPPER, lower, Title', dru:'ПРОПИСНЫЕ, строчные' },
      { slug:'slug', ic:'link', he:'המרה ל־Slug', en:'Slugify', ru:'Slug', dhe:'כתובת URL נקייה', den:'A clean URL slug', dru:'Чистый URL-slug' },
      { slug:'whitespace', ic:'wind', he:'ניקוי רווחים', en:'Clean Whitespace', ru:'Очистка пробелов', dhe:'רווחים, טאבים, שורות ריקות', den:'Spaces, tabs, blank lines', dru:'Пробелы, табы, пустые' },
      { slug:'strip', ic:'eraser', he:'הסרת אימוג׳ים', en:'Strip Emoji', ru:'Убрать эмодзи', dhe:'אימוג׳ים ותווים מיוחדים', den:'Emojis & special chars', dru:'Эмодзи и символы' }
    ]},
    { c:'tlist', i:'📋', he:'רשימות', en:'Lists', ru:'Списки', items:[
      { slug:'sort', ic:'sort', he:'מיון רשימה', en:'Sort List', ru:'Сортировка', dhe:'A–Z, מספרי, אורך, אקראי', den:'A–Z, numeric, length', dru:'A–Z, числа, длина' },
      { slug:'dedupe', ic:'copy', he:'הסרת כפילויות', en:'Remove Duplicates', ru:'Убрать дубли', dhe:'שורות, מילים, אימיילים', den:'Lines, words, emails', dru:'Строки, слова, email' },
      { slug:'split', ic:'scissors', he:'פיצול טקסט', en:'Split Text', ru:'Разбить текст', dhe:'לפי פסיק, שורה או מקף', den:'By comma, line or dash', dru:'По запятой, строке' },
      { slug:'join', ic:'merge', he:'איחוד שורות', en:'Join Lines', ru:'Объединить', dhe:'לרשימה מופרדת בפסיקים', den:'Into a comma list', dru:'В список через запятые' },
      { slug:'affix', ic:'plus', he:'הוספת טקסט לשורה', en:'Add to Each Line', ru:'Добавить к строкам', dhe:'קידומת, סיומת או מספר', den:'Prefix, suffix or number', dru:'Префикс, суффикс, номер' },
      { slug:'number', ic:'listnum', he:'מספור אוטומטי', en:'Auto Numbering', ru:'Нумерация', dhe:'1,2,3 או A,B,C', den:'1,2,3 or A,B,C', dru:'1,2,3 или A,B,C' }
    ]},
    { c:'tdev', i:'🔎', he:'חילוץ וקוד', en:'Extract & Code', ru:'Извлечение и код', items:[
      { slug:'extract', ic:'at', he:'חילוץ מטקסט', en:'Extract Data', ru:'Извлечь данные', dhe:'אימייל, טלפון או קישור', den:'Emails, phones, links', dru:'Email, телефоны, ссылки' },
      { slug:'count', ic:'hash', he:'מונה תווים ומילים', en:'Word Counter', ru:'Счётчик слов', dhe:'תווים, מילים, שורות', den:'Chars, words, lines', dru:'Символы, слова, строки' },
      { slug:'hashtags', ic:'tags', he:'יצירת האשטגים', en:'Hashtag Maker', ru:'Хэштеги', dhe:'ניקוי והוספת #', den:'Clean & add #', dru:'Очистка и #' },
      { slug:'csv', ic:'table', he:'ניקוי CSV', en:'CSV Cleaner', ru:'Очистка CSV', dhe:'רשימות מאקסל או CRM', den:'Lists from Excel/CRM', dru:'Списки из Excel/CRM' },
      { slug:'url', ic:'link', he:'קידוד URL', en:'URL Encode', ru:'URL-кодирование', dhe:'קידוד ופענוח כתובות', den:'Encode & decode URLs', dru:'Кодировать URL' },
      { slug:'json', ic:'braces', he:'JSON Formatter', en:'JSON Formatter', ru:'JSON Formatter', dhe:'סידור ובדיקת תקינות', den:'Format & validate', dru:'Формат и проверка' }
    ]}
  ];

  var TEXT_FOOT = {
    he: ['חדש', '17 כלי טקסט מהירים — הכול רץ בדפדפן שלכם', 'פתחו את כלי הטקסט ←'],
    en: ['NEW', '17 fast text tools — all run in your browser', 'Open Text Tools →'],
    ru: ['НОВОЕ', '17 быстрых текстовых инструментов — всё в браузере', 'Открыть →']
  };

  function textMegaHtml(lang) {
    var hub = link('text-tools.html');
    var cols = TEXT_GROUPS.map(function (c) {
      var items = c.items.map(function (t) {
        return '<a class="sh-item" href="' + link('text-tools.html#' + t.slug) + '" role="menuitem">' +
          '<span class="it-ic">' + svg(t.ic) + '</span>' +
          '<span class="it-tx"><span class="it-t">' + t[lang] + '</span>' +
          '<span class="it-d">' + t['d' + lang] + '</span></span></a>';
      }).join('');
      return '<div class="sh-col c-' + c.c + '">' +
        '<a class="sh-col-h" href="' + hub + '"><span class="sh-col-i">' + c.i + '</span>' + c[lang] + '</a>' +
        items + '</div>';
    }).join('');
    var f = TEXT_FOOT[lang] || TEXT_FOOT.en;
    var foot = '<span class="sh-foot-t"><span class="sh-foot-badge">' + f[0] + '</span> ' + f[1] + '</span>' +
      '<a class="sh-foot-cta" href="' + hub + '">' + f[2] + '</a>';
    return '<div class="sh-mega-in">' + cols + '</div><div class="sh-mega-foot">' + foot + '</div>';
  }

  // Rows of the Products dropdown: colored icon tile + name + one-line description,
  // each linking to its dedicated product page.
  function productsHtml(lang) {
    return PRODUCTS.map(function (p) {
      return '<a class="sh-prod-item" href="' + link(p.page) + '" role="menuitem">' +
        '<span class="sh-prod-ic">' + svg(p.ic) + '</span>' +
        '<span class="sh-prod-tx"><span class="sh-prod-t">' + p[lang] + '</span>' +
        '<span class="sh-prod-d">' + p['d' + lang] + '</span></span></a>';
    }).join('');
  }

  // Rows of the AI Tools dropdown (reuses the .sh-prod-* row styling), plus a
  // full-width footer link to the AI hub so the menu still reaches /ai/.
  function aiToolsHtml(lang) {
    var items = AITOOLS.map(function (t) {
      return '<a class="sh-prod-item sh-ai-item" href="' + link(t.page) + '" role="menuitem">' +
        '<span class="sh-prod-ic">' + svg(t.ic) + '</span>' +
        '<span class="sh-prod-tx"><span class="sh-prod-t">' + t[lang] + '</span>' +
        '<span class="sh-prod-d">' + t['d' + lang] + '</span></span></a>';
    }).join('');
    return items + '<a class="sh-aimenu-all" href="' + link('ai/') + '" role="menuitem">' +
      (AI_FOOT[lang] || AI_FOOT.en) + '</a>';
  }

  var linksHtml = LINKS.map(function (l) {
    if (l[0] === 'navTools') {
      // "Tools" is a click-to-open dropdown, not a plain link.
      return '<div class="sh-drop" id="shDrop">' +
        '<button class="sh-tlink" id="shToolsBtn" type="button" aria-haspopup="true" aria-controls="shMega" aria-expanded="false">' +
          '<span data-k="navTools"></span>' + CHEV +
        '</button>' +
      '</div>';
    }
    if (l[0] === 'navDev') {
      // "Design & Dev Tools" is a click-to-open mega-menu, like "Tools".
      return '<div class="sh-drop sh-devdrop" id="shDevDrop">' +
        '<button class="sh-tlink" id="shDevBtn" type="button" aria-haspopup="true" aria-controls="shDevMega" aria-expanded="false">' +
          '<span data-k="navDev"></span>' + CHEV +
        '</button>' +
      '</div>';
    }
    if (l[0] === 'navProducts') {
      // "Products" is a compact click-to-open dropdown anchored under its button.
      return '<div class="sh-drop sh-proddrop" id="shProdDrop">' +
        '<button class="sh-tlink" id="shProdBtn" type="button" aria-haspopup="true" aria-controls="shProdMenu" aria-expanded="false">' +
          '<span data-k="navProducts"></span>' + CHEV +
        '</button>' +
        '<div class="sh-prodmenu" id="shProdMenu" role="menu">' + productsHtml(curLang()) + '</div>' +
      '</div>';
    }
    if (l[0] === 'navAI') {
      // "AI Tools" is a click-to-open dropdown (with a NEW badge on the button),
      // anchored under its button like Products.
      return '<div class="sh-drop sh-aidrop" id="shAiDrop">' +
        '<button class="sh-tlink" id="shAiBtn" type="button" aria-haspopup="true" aria-controls="shAiMenu" aria-expanded="false">' +
          '<span data-k="navAI"></span>' +
          '<span class="sh-new" data-k="navNew"></span>' + CHEV +
        '</button>' +
        '<div class="sh-aimenu" id="shAiMenu" role="menu">' + aiToolsHtml(curLang()) + '</div>' +
      '</div>';
    }
    if (l[0] === 'navText') {
      // "Text Tools" is a click-to-open mega-menu, like "Tools" / "Design & Dev".
      return '<div class="sh-drop sh-textdrop" id="shTextDrop">' +
        '<button class="sh-tlink" id="shTextBtn" type="button" aria-haspopup="true" aria-controls="shTextMega" aria-expanded="false">' +
          '<span data-k="navText"></span>' + CHEV +
        '</button>' +
      '</div>';
    }
    return '<a href="' + link(l[1]) + '"><span data-k="' + l[0] + '"></span></a>';
  }).join('');

  // Language picker: globe + active language name + chevron open a small menu
  // listing every interface language by its own endonym.
  var langItemsHtml = LANGS.map(function (L) {
    return '<button class="sh-langopt" type="button" role="option" data-lang="' + L.code + '" lang="' + L.code + '" dir="' + L.dir + '">' +
      '<span class="sh-langopt-t">' + L.name + '</span>' +
      '<svg class="sh-langopt-c" viewBox="0 0 24 24" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg></button>';
  }).join('');
  var langHtml =
    '<div class="sh-langwrap" id="shLang">' +
      '<button class="sh-pill sh-lang" id="langBtn" type="button" aria-haspopup="listbox" aria-expanded="false" aria-label="Language">' +
        '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 0 20"/><path d="M12 2a15.3 15.3 0 0 0 0 20"/></svg>' +
        '<span id="langIco"></span>' +
        '<svg class="sh-chev" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>' +
      '</button>' +
      '<div class="sh-langmenu" id="langMenu" role="listbox">' + langItemsHtml + '</div>' +
    '</div>';

  mount.innerHTML =
    '<header class="sh-nav" id="shNav">' +
      '<div class="sh-bar">' +
        '<a class="sh-brand" href="' + homeHref + '" aria-label="KOLKLI">' +
          '<img class="sh-logo-img" src="' + link('assets/logo.png') + '" alt="KOLKLI" width="139" height="34" decoding="async"/></a>' +
        '<div class="sh-links">' + linksHtml + '</div>' +
        '<nav class="sh-tools">' +
          langHtml +
          '<button class="sh-pill sh-icon sh-theme" id="themeToggle" type="button" aria-label="Toggle theme"><span id="themeIco">🌙</span></button>' +
          '<div class="sh-autharea" id="shAuthArea"></div>' +
          '<button class="sh-pill sh-icon sh-menu" id="shMenuBtn" type="button" aria-label="Menu">☰</button>' +
        '</nav>' +
        '<div class="sh-mega" id="shMega" role="menu"></div>' +
        '<div class="sh-mega" id="shDevMega" role="menu"></div>' +
        '<div class="sh-mega" id="shTextMega" role="menu"></div>' +
      '</div>' +
      '<div class="sh-panel" id="shPanel"></div>' +
    '</header>';

  var nav = mount.querySelector('#shNav');
  var panel = mount.querySelector('#shPanel');
  var menuBtn = mount.querySelector('#shMenuBtn');

  function curLang() {
    var l = document.documentElement.getAttribute('lang');
    if (l === 'he' || l === 'en' || l === 'ru') return l;
    try { l = localStorage.getItem('ac_lang'); } catch (e) {}
    return (l === 'en' || l === 'ru') ? l : 'he';
  }
  function isDark() { return document.documentElement.getAttribute('data-theme') === 'dark'; }

  function syncIcons() {
    var li = mount.querySelector('#langIco'); if (li) li.textContent = LNAME[curLang()];
    var ti = mount.querySelector('#themeIco'); if (ti) ti.textContent = isDark() ? '☀️' : '🌙';
    markActiveLang();
  }

  function translate() {
    var d = T[curLang()];
    mount.querySelectorAll('[data-k]').forEach(function (n) {
      var k = n.getAttribute('data-k'); if (d[k] != null) n.textContent = d[k];
    });
    // (re)build the mobile drop panel in the current language.
    // The trailing auth links follow sign-in state: guests get "Login",
    // signed-in users get their account shortcuts + "Log out".
    panel.innerHTML = '<div class="sh-inner">' +
      LINKS.map(function (l) {
        // "Products" expands into a labeled group of its sub-pages in the mobile panel.
        if (l[0] === 'navProducts') {
          return '<span class="sh-panel-h">' + d.navProducts + '</span>' +
            PRODUCTS.map(function (p) {
              return '<a class="sh-panel-sub" href="' + link(p.page) + '">' + p[curLang()] + '</a>';
            }).join('');
        }
        var h = (l[0] === 'navTools') ? homeHash('#popular') : (l[0] === 'navDev') ? link('dev-tools/') : (l[0] === 'navText') ? link('text-tools.html') : link(l[1]);
        return '<a href="' + h + '">' + d[l[0]] + '</a>';
      }).join('') +
      panelAuthHtml(d) + '</div>';
    // (re)build the Tools mega-menu in the current language
    var mega = mount.querySelector('#shMega');
    if (mega) mega.innerHTML = megaHtml(curLang());
    // (re)build the Design & Dev mega-menu in the current language
    var devmega = mount.querySelector('#shDevMega');
    if (devmega) devmega.innerHTML = devMegaHtml(curLang());
    // (re)build the Text Tools mega-menu in the current language
    var tmega = mount.querySelector('#shTextMega');
    if (tmega) tmega.innerHTML = textMegaHtml(curLang());
    // (re)build the Products dropdown in the current language
    var prod = mount.querySelector('#shProdMenu');
    if (prod) prod.innerHTML = productsHtml(curLang());
    // (re)build the AI Tools dropdown in the current language
    var ai = mount.querySelector('#shAiMenu');
    if (ai) ai.innerHTML = aiToolsHtml(curLang());
  }

  // =====================================================
  //  Logged-in account area (owned by the header).
  //  When a session exists we swap the Login / Sign Up
  //  buttons for an avatar + name button that drops a menu
  //  with quick account actions; guests keep the two CTAs.
  //  Reads the same demo store as auth-modal.js / dashboard.
  // =====================================================
  var USERS_KEY = 'ac_users', SESSION_KEY = 'ac_session';
  var ADMIN_EMAILS = ['digitalzimmer@gmail.com'];
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function loadUsers() { try { return JSON.parse(lsGet(USERS_KEY)) || []; } catch (e) { return []; } }
  function currentUser() {
    var email = lsGet(SESSION_KEY);
    if (!email) return null;
    var u = loadUsers().find(function (x) { return (x.email || '').toLowerCase() === email.toLowerCase(); });
    return u || null;                          // stale session (no record) → treat as guest
  }
  function isAdmin(u) {
    if (!u) return false;
    if (ADMIN_EMAILS.indexOf((u.email || '').toLowerCase()) > -1) return true;
    return u.role === 'admin';
  }
  function acctName(u) {
    if (u.name && u.name.trim()) return u.name.trim();
    return u.email ? u.email.split('@')[0] : 'Account';
  }
  function esc(x) {
    return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }

  var AIC = {
    grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
    folder:'<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/>',
    gear:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>',
    logout:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
    inbox:'<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    shield:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/>',
    check:'<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
    globe:'<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 0 20"/><path d="M12 2a15.3 15.3 0 0 0 0 20"/>'
  };
  function asvg(n) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + (AIC[n] || '') + '</svg>'; }

  function avatarInner(u) {
    if (u.avatar) return '<img class="sh-avatar-img" src="' + esc(u.avatar) + '" alt="">';
    return esc((acctName(u) || '?').charAt(0).toUpperCase());
  }
  var PLAN_NAMES = { free:'Free', lite:'Lite', pro:'Pro', business:'Business' };
  function acctPlan(u) {
    var plan = String((u && u.plan) || '').toLowerCase();
    return PLAN_NAMES[plan] || PLAN_NAMES.free;
  }

  function acctLangHtml(d) {
    var cur = curLang();
    var opts = LANGS.map(function (L) {
      return '<button class="sh-acct-langopt' + (L.code === cur ? ' active' : '') + '" type="button" role="option" data-acct-lang="' + L.code + '" aria-selected="' + (L.code === cur ? 'true' : 'false') + '" lang="' + L.code + '" dir="' + L.dir + '">' +
        '<span>' + L.name + '</span>' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>' +
      '</button>';
    }).join('');
    return '<div class="sh-acct-langbox" id="shAcctLang" role="group" aria-label="' + esc(d.acctLanguage) + '">' +
      '<button class="sh-acct-langhead" id="shAcctLangBtn" type="button" aria-haspopup="listbox" aria-expanded="false" aria-controls="shAcctLangMenu">' + asvg('globe') +
        '<span>' + esc(d.acctLanguage) + '</span><b>' + esc(LNAME[cur]) + '</b>' + CHEV + '</button>' +
      '<div class="sh-acct-langopts" id="shAcctLangMenu" role="listbox">' + opts + '</div>' +
    '</div>';
  }

  // Desktop account button + dropdown menu markup for a signed-in user.
  function acctMenuHtml(u, d) {
    return '<div class="sh-acctwrap" id="shAcct">' +
      '<button class="sh-pill sh-acctbtn" id="shAcctBtn" type="button" aria-haspopup="menu" aria-expanded="false" aria-label="' + esc(acctName(u)) + '">' +
        '<span class="sh-avatar">' + avatarInner(u) + '</span>' +
        '<span class="sh-acctbtn-name">' + esc(acctName(u)) + '</span>' +
        '<svg class="sh-chev" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>' +
      '</button>' +
      '<div class="sh-acctmenu" id="shAcctMenu" role="menu">' +
        '<div class="sh-acct-head">' +
          '<span class="sh-acct-av">' + avatarInner(u) + '</span>' +
          '<span class="sh-acct-id">' +
            '<span class="sh-acct-name-row"><span class="sh-acct-name">' + esc(acctName(u)) + '</span><span class="sh-acct-plan">' + esc(acctPlan(u)) + '</span></span>' +
            (u.email ? '<span class="sh-acct-mail">' + esc(u.email) + '</span>' : '') +
          '</span>' +
        '</div>' +
        '<a class="sh-acct-item" role="menuitem" href="' + link('dashboard.html') + '">' + asvg('grid') + '<span>' + esc(d.acctDash) + '</span></a>' +
        '<a class="sh-acct-item" role="menuitem" href="' + link('dashboard.html') + '#settings">' + asvg('gear') + '<span>' + esc(d.acctSettings) + '</span></a>' +
        acctLangHtml(d) +
        '<div class="sh-acct-sep"></div>' +
        '<button class="sh-acct-item sh-acct-out" role="menuitem" type="button" id="shLogout">' + asvg('logout') + '<span>' + esc(d.acctLogout) + '</span></button>' +
      '</div>' +
    '</div>';
  }

  // Trailing auth links for the mobile drop panel (guest → Login; signed-in → shortcuts).
  function panelAuthHtml(d) {
    var u = currentUser();
    if (!u) return '<a href="' + link('auth.html') + '">' + d.navSignin + '</a>';
    return '<a href="' + link('dashboard.html') + '">' + esc(d.acctDash) + '</a>' +
      '<a href="' + link('dashboard.html') + '#settings">' + esc(d.acctSettings) + '</a>' +
      '<a href="#" data-sh-logout>' + esc(d.acctLogout) + '</a>';
  }

  // Fill the desktop auth slot from the current session, then wire the dropdown.
  function renderAuthArea() {
    var area = mount.querySelector('#shAuthArea');
    if (!area) return;
    var d = T[curLang()];
    var u = currentUser();
    mount.classList.toggle('sh-signed-in', !!u);
    if (u) {
      area.innerHTML = acctMenuHtml(u, d);
      wireAcct();
    } else {
      area.innerHTML =
        '<a class="sh-pill" href="' + link('auth.html') + '">' + d.navSignin + '</a>' +
        '<a class="sh-cta" href="' + link('auth.html?mode=signup') + '">' + d.navStart + '</a>';
    }
  }

  function wireAcct() {
    var wrap = mount.querySelector('#shAcct');
    var btn = mount.querySelector('#shAcctBtn');
    if (!wrap || !btn) return;
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var open = wrap.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) closeAllMenus('acct');
    });
    var out = mount.querySelector('#shLogout');
    if (out) out.addEventListener('click', function (e) { e.preventDefault(); doLogout(); });
    var langBox = mount.querySelector('#shAcctLang');
    var langBtn = mount.querySelector('#shAcctLangBtn');
    if (langBox && langBtn) langBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var open = langBox.classList.toggle('open');
      langBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    var menu = mount.querySelector('#shAcctMenu');
    if (menu) menu.addEventListener('click', function (e) {
      var lang = e.target.closest('[data-acct-lang]');
      if (!lang) return;
      e.preventDefault();
      e.stopPropagation();
      setLang(lang.getAttribute('data-acct-lang'));
      closeAcct();
    });
  }

  function closeAcct() {
    var wrap = mount.querySelector('#shAcct');
    if (!wrap) return;
    wrap.classList.remove('open');
    var b = wrap.querySelector('#shAcctBtn'); if (b) b.setAttribute('aria-expanded', 'false');
    var lb = wrap.querySelector('#shAcctLang');
    var lbb = wrap.querySelector('#shAcctLangBtn');
    if (lb) lb.classList.remove('open');
    if (lbb) lbb.setAttribute('aria-expanded', 'false');
  }

  function doLogout() {
    try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
    try { window.dispatchEvent(new CustomEvent('kolkli:auth')); } catch (e) {}
    // Reload so the current page (dashboard, files, …) reflects the signed-out state.
    location.reload();
  }

  // Anti-FOUC: apply the saved theme right away (pages also do this on init).
  try {
    var th = localStorage.getItem('theme');
    if (th) document.documentElement.setAttribute('data-theme', th === 'dark' ? 'dark' : 'light');
  } catch (e) {}

  translate();
  syncIcons();
  renderAuthArea();

  // mobile menu
  if (menuBtn && panel) {
    menuBtn.addEventListener('click', function () { panel.classList.toggle('open'); });
    panel.addEventListener('click', function (e) {
      if (e.target.closest('[data-sh-logout]')) { e.preventDefault(); doLogout(); return; }
      if (e.target.closest('a')) panel.classList.remove('open');
    });
  }

  // Account menu (desktop): click-away / Esc to close. The menu itself is
  // (re)built by renderAuthArea, so these look it up live rather than binding once.
  document.addEventListener('click', function (e) {
    var wrap = mount.querySelector('#shAcct');
    if (wrap && wrap.classList.contains('open') && !wrap.contains(e.target)) closeAcct();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeAcct(); });

  // React to sign-in / sign-out: same tab (auth modal fires 'kolkli:auth'),
  // another tab (storage event), or a bfcache restore (pageshow).
  window.addEventListener('kolkli:auth', function () { renderAuthArea(); translate(); });
  window.addEventListener('storage', function (e) {
    if (!e || e.key === null || e.key === SESSION_KEY || e.key === USERS_KEY) { renderAuthArea(); translate(); }
  });
  window.addEventListener('pageshow', function (e) { if (e.persisted) { renderAuthArea(); translate(); } });

  // Language picker (owned by the header). Selecting a language hands off to the
  // page's applyLang() via window.__setLang so the page re-renders in place with
  // its own strings; if a page never registered a hook we still swap <html>
  // lang/dir so at least the shared chrome follows.
  var langWrap = mount.querySelector('#shLang');
  var langBtn = mount.querySelector('#langBtn');
  var langMenu = mount.querySelector('#langMenu');
  function closeLang() {
    if (langWrap) langWrap.classList.remove('open');
    if (langBtn) langBtn.setAttribute('aria-expanded', 'false');
  }
  function markActiveLang() {
    if (!langMenu) return;
    var cur = curLang();
    langMenu.querySelectorAll('[data-lang]').forEach(function (b) {
      var on = b.getAttribute('data-lang') === cur;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }
  function setLang(l) {
    try { localStorage.setItem('ac_lang', l); } catch (e) {}
    if (typeof window.__setLang === 'function') {
      window.__setLang(l);
    } else {
      document.documentElement.setAttribute('lang', l);
      document.documentElement.setAttribute('dir', langDir(l));
    }
    translate();
    syncIcons();
  }
  if (langBtn && langWrap && langMenu) {
    langBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var open = langWrap.classList.toggle('open');
      langBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) closeAllMenus('lang');
    });
    langMenu.addEventListener('click', function (e) {
      var b = e.target.closest('[data-lang]');
      if (!b) return;
      setLang(b.getAttribute('data-lang'));
      closeLang();
    });
    document.addEventListener('click', function (e) { if (!langWrap.contains(e.target)) closeLang(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeLang(); });
  }

  // Only one header menu may be open at a time. Before opening any dropdown
  // (Tools mega-menu, Products, Language, Account) close all the OTHERS so two
  // panels never overlap. Manipulates the DOM directly because each menu's own
  // close helper is scoped to its wiring block below.
  function closeAllMenus(except) {
    if (except !== 'dev') {
      var dd = mount.querySelector('#shDevDrop'), dmg = mount.querySelector('#shDevMega'), db = mount.querySelector('#shDevBtn');
      if (dd) dd.classList.remove('open');
      if (dmg) dmg.classList.remove('open');
      if (db) db.setAttribute('aria-expanded', 'false');
    }
    if (except !== 'text') {
      var xd = mount.querySelector('#shTextDrop'), xmg = mount.querySelector('#shTextMega'), xb = mount.querySelector('#shTextBtn');
      if (xd) xd.classList.remove('open');
      if (xmg) xmg.classList.remove('open');
      if (xb) xb.setAttribute('aria-expanded', 'false');
    }
    if (except !== 'tools') {
      var d = mount.querySelector('#shDrop'), mg = mount.querySelector('#shMega'), tb = mount.querySelector('#shToolsBtn');
      if (d) d.classList.remove('open');
      if (mg) mg.classList.remove('open');
      if (tb) tb.setAttribute('aria-expanded', 'false');
    }
    if (except !== 'prod') {
      var pd = mount.querySelector('#shProdDrop'), pb = mount.querySelector('#shProdBtn');
      if (pd) pd.classList.remove('open');
      if (pb) pb.setAttribute('aria-expanded', 'false');
    }
    if (except !== 'ai') {
      var ad = mount.querySelector('#shAiDrop'), ab = mount.querySelector('#shAiBtn');
      if (ad) ad.classList.remove('open');
      if (ab) ab.setAttribute('aria-expanded', 'false');
    }
    if (except !== 'lang') closeLang();
    if (except !== 'acct') closeAcct();
  }

  // Tools mega-menu (desktop): click to open, click-away / Esc to close.
  var drop = mount.querySelector('#shDrop');
  var toolsBtn = mount.querySelector('#shToolsBtn');
  var megaEl = mount.querySelector('#shMega');
  if (drop && toolsBtn) {
    var closeDrop = function () {
      drop.classList.remove('open');
      if (megaEl) megaEl.classList.remove('open');
      toolsBtn.setAttribute('aria-expanded', 'false');
    };
    toolsBtn.addEventListener('click', function (e) {
      e.preventDefault();
      var open = drop.classList.toggle('open');
      if (megaEl) megaEl.classList.toggle('open', open);
      toolsBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) closeAllMenus('tools');
    });
    if (megaEl) megaEl.addEventListener('click', function (e) { if (e.target.closest('a')) closeDrop(); });
    document.addEventListener('click', function (e) {
      if (!drop.contains(e.target) && (!megaEl || !megaEl.contains(e.target))) closeDrop();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDrop(); });
  }

  // Design & Dev mega-menu (desktop): click to open, click-away / Esc to close.
  var devDrop = mount.querySelector('#shDevDrop');
  var devBtn = mount.querySelector('#shDevBtn');
  var devMegaEl = mount.querySelector('#shDevMega');
  if (devDrop && devBtn) {
    var closeDev = function () {
      devDrop.classList.remove('open');
      if (devMegaEl) devMegaEl.classList.remove('open');
      devBtn.setAttribute('aria-expanded', 'false');
    };
    devBtn.addEventListener('click', function (e) {
      e.preventDefault();
      var open = devDrop.classList.toggle('open');
      if (devMegaEl) devMegaEl.classList.toggle('open', open);
      devBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) closeAllMenus('dev');
    });
    if (devMegaEl) devMegaEl.addEventListener('click', function (e) { if (e.target.closest('a')) closeDev(); });
    document.addEventListener('click', function (e) {
      if (!devDrop.contains(e.target) && (!devMegaEl || !devMegaEl.contains(e.target))) closeDev();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDev(); });
  }

  // Text Tools mega-menu (desktop): click to open, click-away / Esc to close.
  var textDrop = mount.querySelector('#shTextDrop');
  var textBtn = mount.querySelector('#shTextBtn');
  var textMegaEl = mount.querySelector('#shTextMega');
  if (textDrop && textBtn) {
    var closeText = function () {
      textDrop.classList.remove('open');
      if (textMegaEl) textMegaEl.classList.remove('open');
      textBtn.setAttribute('aria-expanded', 'false');
    };
    textBtn.addEventListener('click', function (e) {
      e.preventDefault();
      var open = textDrop.classList.toggle('open');
      if (textMegaEl) textMegaEl.classList.toggle('open', open);
      textBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) closeAllMenus('text');
    });
    if (textMegaEl) textMegaEl.addEventListener('click', function (e) { if (e.target.closest('a')) closeText(); });
    document.addEventListener('click', function (e) {
      if (!textDrop.contains(e.target) && (!textMegaEl || !textMegaEl.contains(e.target))) closeText();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeText(); });
  }

  // Products dropdown (desktop): click to open, click-away / Esc to close.
  var prodDrop = mount.querySelector('#shProdDrop');
  var prodBtn = mount.querySelector('#shProdBtn');
  if (prodDrop && prodBtn) {
    var closeProd = function () {
      prodDrop.classList.remove('open');
      prodBtn.setAttribute('aria-expanded', 'false');
    };
    prodBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var open = prodDrop.classList.toggle('open');
      prodBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) closeAllMenus('prod');
    });
    prodDrop.addEventListener('click', function (e) { if (e.target.closest('a')) closeProd(); });
    document.addEventListener('click', function (e) { if (!prodDrop.contains(e.target)) closeProd(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeProd(); });
  }

  // AI Tools dropdown (desktop): click to open, click-away / Esc to close.
  var aiDrop = mount.querySelector('#shAiDrop');
  var aiBtn = mount.querySelector('#shAiBtn');
  if (aiDrop && aiBtn) {
    var closeAi = function () {
      aiDrop.classList.remove('open');
      aiBtn.setAttribute('aria-expanded', 'false');
    };
    aiBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var open = aiDrop.classList.toggle('open');
      aiBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) closeAllMenus('ai');
    });
    aiDrop.addEventListener('click', function (e) { if (e.target.closest('a')) closeAi(); });
    document.addEventListener('click', function (e) { if (!aiDrop.contains(e.target)) closeAi(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeAi(); });
  }

  // subtle bottom border once the page is scrolled
  function onScroll() { if (nav) nav.classList.toggle('scrolled', window.pageYOffset > 4); }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Keep header labels/icons in sync whenever the page flips language or theme.
  // (Every page sets html lang/dir/data-theme in its applyLang()/applyTheme().)
  new MutationObserver(function () { translate(); syncIcons(); renderAuthArea(); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['lang', 'dir', 'data-theme'] });

  // Backend seam: load the Supabase config + auth adapter on EVERY page
  // (including auth.html). auth-store.js restores the signed-in session and
  // keeps ac_session / ac_users in sync so the header + dashboard just work.
  // Order matters (config before adapter), so async=false preserves it; when
  // no real credentials are set, auth-store.js is a light no-op fallback.
  if (!document.getElementById('sb-loader')) {
    ['supabase-config.js', 'auth-store.js'].forEach(function (f, i) {
      var sb = document.createElement('script');
      if (i === 0) sb.id = 'sb-loader';
      sb.src = link(f);
      sb.async = false;                          // keep execution order
      document.head.appendChild(sb);
    });
  }

  // Server-backed free/anonymous usage quotas. The script computes the
  // anonymous browser id + fingerprint client-side, then asks the storage
  // Worker's /usage/* endpoints to authorize and commit usage.
  if (!document.getElementById('usage-loader')) {
    var ul = document.createElement('script');
    ul.id = 'usage-loader';
    ul.src = link('usage-limits.js');
    ul.async = false;
    document.head.appendChild(ul);
  }

  // Floating login / sign-up popup: load it on every page except auth.html
  // (which IS the full-page version). Once loaded it intercepts clicks on any
  // auth.html link — Login / Sign Up here, "Get started free" on the hero — and
  // opens the modal instead. Before it loads, those links still navigate normally.
  if (curFile !== 'auth.html' && !document.getElementById('am-loader')) {
    var s = document.createElement('script');
    s.id = 'am-loader';
    s.src = link('auth-modal.js');
    s.async = true;
    document.head.appendChild(s);
  }

  // Site-wide accessibility widget: self-contained, depth-aware, GDPR-friendly
  // (no external calls, preferences saved only in the visitor's browser). Loaded
  // on every header page from here; the standalone client pages (download /
  // proof / select) include accessibility.js directly.
  if (!document.getElementById('a11y-loader')) {
    var ax = document.createElement('script');
    ax.id = 'a11y-loader';
    ax.src = link('accessibility.js');
    ax.async = true;
    document.head.appendChild(ax);
  }
})();
