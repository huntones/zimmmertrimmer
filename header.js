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
    he: { navTools:'כלים', navAI:'כלי AI', navConvert:'המרה', navCompress:'דחיסה',
          navSend:'שליחת קבצים', navRequest:'בקשת קבצים', navProducts:'קבצים', navPricing:'מסלולים ומחירים', navAPI:'API', navSignin:'התחברות', navStart:'הרשמה', navNew:'חדש',
          acctDash:'החשבון שלי', acctFiles:'הקבצים שלי', acctRequest:'בקשות קבצים', acctSettings:'הגדרות', acctAdmin:'ניהול', acctLogout:'התנתקות' },
    en: { navTools:'Tools', navAI:'AI Tools', navConvert:'Convert', navCompress:'Compress',
          navSend:'Send Files', navRequest:'Request Files', navProducts:'Files', navPricing:'Pricing', navAPI:'API', navSignin:'Login', navStart:'Sign Up', navNew:'New',
          acctDash:'My Account', acctFiles:'My Files', acctRequest:'File Requests', acctSettings:'Settings', acctAdmin:'Admin', acctLogout:'Log out' },
    ru: { navTools:'Инструменты', navAI:'AI-инструменты', navConvert:'Конвертация', navCompress:'Сжатие',
          navSend:'Отправка файлов', navRequest:'Запрос файлов', navProducts:'Файлы', navPricing:'Цены', navAPI:'API', navSignin:'Вход', navStart:'Регистрация', navNew:'Новое',
          acctDash:'Мой аккаунт', acctFiles:'Мои файлы', acctRequest:'Запросы файлов', acctSettings:'Настройки', acctAdmin:'Админ', acctLogout:'Выйти' }
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
    ['navTools', null], ['navAI', 'ai/'], ['navConvert', 'converters/'],
    ['navCompress', 'compress/'], ['navProducts', null], ['navPricing', 'pricing/'], ['navAPI', 'faq/']
  ];

  // "Products" dropdown: the three file-transfer product pages. Each links to its
  // own dedicated page. Labels + one-line descriptions carried inline per language
  // (mirrors the TOOLS mega-menu items), with an icon key from IC.
  var PRODUCTS = [
    { ic:'send',   page:'send.html',    he:'שליחת קבצים', en:'Send Files',    ru:'Отправка файлов',
      dhe:'שיתוף קבצים גדולים בקישור', den:'Share big files by link', dru:'Большие файлы по ссылке' },
    { ic:'folder', page:'files.html',   he:'בחירת קבצים', en:'Choose Files',  ru:'Выбор файлов',
      dhe:'בחירה וניהול הקבצים שלך', den:'Pick & manage your files', dru:'Выбор и управление файлами' },
    { ic:'inbox',  page:'request.html', he:'בקשת קבצים',  en:'Request Files', ru:'Запрос файлов',
      dhe:'איסוף קבצים מאחרים', den:'Collect files from others', dru:'Сбор файлов от других' }
  ];

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
    inbox:'<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>'
  };
  function svg(name) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + (IC[name] || '') + '</svg>'; }

  // Groups shown in the "Tools" mega-menu. Live tools link straight to their
  // page; everything else links to its category section on the landing page.
  // Each item carries an icon key + a short he/en/ru name and description.
  var TOOLS = [
    { c:'audio', i:'🎵', hash:'#audio', he:'אודיו', en:'Audio', ru:'Аудио', items:[
      { he:'חותך אודיו', en:'Audio Cutter', ru:'Обрезка аудио', dhe:'חיתוך וקיצוץ MP3', den:'Trim & cut MP3', dru:'Обрезка и нарезка MP3', ic:'scissors', page:'./app.html' },
      { he:'המרת אודיו', en:'Convert Audio', ru:'Конвертация аудио', dhe:'MP3, WAV, FLAC ועוד', den:'MP3, WAV, FLAC…', dru:'MP3, WAV, FLAC…', ic:'refresh', page:'./convert.html' },
      { he:'מיזוג אודיו', en:'Merge Audio', ru:'Объединение аудио', dhe:'איחוד רצועות לקובץ', den:'Join tracks into one', dru:'Склейка треков в один', ic:'merge', page:'./merge-audio.html' },
      { he:'עורך אודיו', en:'Audio Editor', ru:'Аудиоредактор', dhe:'עריכה חזותית עם גלי קול', den:'Visual waveform editor', dru:'Редактор с волновой формой', ic:'editwave', page:'./audio-editor.html' },
      { he:'מאסטרינג AI', en:'AI Mastering', ru:'AI-мастеринг', dhe:'מאסטרינג אוטומטי לשיר', den:'Auto-master your track', dru:'Автомастеринг трека', ic:'sparkle', page:'./ai-master.html' },
      { he:'ניקוי אודיו AI', en:'AI Audio Cleanup', ru:'AI-очистка аудио', dhe:'הסרת רעש ושיפור קול', den:'Remove noise, enhance voice', dru:'Убрать шум, улучшить голос', ic:'headphones', page:'./ai-audio-cleanup.html' }
    ]},
    { c:'image', i:'🖼️', hash:'#images', he:'תמונות', en:'Images', ru:'Изображения', items:[
      { he:'שינוי גודל', en:'Resize Image', ru:'Изменение размера', dhe:'שינוי מידות מהיר', den:'Change dimensions', dru:'Изменить размеры', ic:'maximize', page:'./resize-image.html' },
      { he:'חיתוך תמונה', en:'Crop Image', ru:'Обрезка изображения', dhe:'חיתוך ויישור', den:'Crop & straighten', dru:'Обрезка и выравнивание', ic:'crop', page:'./crop-image.html' },
      { he:'סימן מים', en:'Watermark', ru:'Водяной знак', dhe:'טקסט או לוגו על התמונה', den:'Add text or a logo', dru:'Текст или логотип на фото', ic:'droplet', page:'./watermark.html' },
      { he:'חיתוך חכם AI', en:'AI Smart Crop', ru:'AI-умная обрезка', dhe:'AI ממקם את החיתוך על הנושא', den:'AI centers the crop', dru:'AI центрирует кадр', ic:'sparkle', page:'./ai-smart-crop.html' },
      { he:'הסרת רקע', en:'Remove Background', ru:'Удаление фона', dhe:'הסרה בקליק אחד', den:'One-click cutout', dru:'Вырезка в один клик', ic:'sparkle', page:'./remove-bg.html' },
      { he:'שחזור תמונה AI', en:'AI Photo Restore', ru:'AI-восстановление фото', dhe:'שיפור תמונות ישנות', den:'Revive old photos', dru:'Оживите старые фото', ic:'sparkles', page:'./restore-image.html' },
      { he:'HEIC ל-JPG', en:'HEIC to JPG', ru:'HEIC в JPG', dhe:'המרת תמונות אייפון', den:'Convert iPhone photos', dru:'Конвертация фото с iPhone', ic:'image', page:'./heic-to-jpg.html' },
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
      { he:'סידור קבצים', en:'Organize Files', ru:'Упорядочить файлы', dhe:'מיון ושינוי שמות', den:'Sort & rename', dru:'Сортировка и переименование', ic:'folder', page:'./files.html' }
    ]},
    { c:'conv', i:'🔄', hash:'#converters', he:'ממירים', en:'Converters', ru:'Конвертеры', items:[
      { he:'ממיר אודיו', en:'Audio Converter', ru:'Аудиоконвертер', dhe:'כל פורמט אודיו', den:'Any audio format', dru:'Любой аудиоформат', ic:'headphones', page:'./convert.html' },
      { he:'ממיר וידאו', en:'Video Converter', ru:'Видеоконвертер', dhe:'כל פורמט וידאו', den:'Any video format', dru:'Любой видеоформат', ic:'film', page:'./video-convert.html' },
      { he:'ממיר תמונות', en:'Image Converter', ru:'Конвертер изображений', dhe:'PNG, JPG, WebP ועוד', den:'PNG, JPG, WebP…', dru:'PNG, JPG, WebP…', ic:'image', page:'./image-convert.html' },
      { he:'ממיר מסמכים', en:'Document Converter', ru:'Конвертер документов', dhe:'מסמכים וגיליונות', den:'Docs & sheets', dru:'Документы и таблицы', ic:'file', page:'./doc-convert.html' },
      { he:'ממיר ארכיונים', en:'Archive Converter', ru:'Конвертер архивов', dhe:'ZIP, GZIP ועוד', den:'ZIP, GZIP & more', dru:'ZIP, GZIP и другие', ic:'archive', page:'./archive-convert.html' },
      { he:'ממיר גופנים', en:'Font Converter', ru:'Конвертер шрифтов', dhe:'TTF, OTF, WOFF', den:'TTF, OTF, WOFF', dru:'TTF, OTF, WOFF', ic:'file', page:'./font-convert.html' },
      { he:'ממיר ספרים', en:'Ebook Converter', ru:'Конвертер эл. книг', dhe:'EPUB ל-PDF/HTML', den:'EPUB to PDF/HTML', dru:'EPUB в PDF/HTML', ic:'layers', page:'./ebook-convert.html' },
      { he:'ממיר גיליונות', en:'Spreadsheet Converter', ru:'Конвертер таблиц', dhe:'XLSX, CSV, ODS', den:'XLSX, CSV, ODS', dru:'XLSX, CSV, ODS', ic:'file', page:'./spreadsheet-convert.html' },
      { he:'ממיר מצגות', en:'Presentation Converter', ru:'Конвертер презентаций', dhe:'PPTX ל-PDF/HTML', den:'PPTX to PDF/HTML', dru:'PPTX в PDF/HTML', ic:'image', page:'./presentation-convert.html' }
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
      '<a class="sh-foot-cta" href="' + link('ai/') + '">' + f[2] + '</a>';
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

  var linksHtml = LINKS.map(function (l) {
    if (l[0] === 'navTools') {
      // "Tools" is a click-to-open dropdown, not a plain link.
      return '<div class="sh-drop" id="shDrop">' +
        '<button class="sh-tlink" id="shToolsBtn" type="button" aria-haspopup="true" aria-controls="shMega" aria-expanded="false">' +
          '<span data-k="navTools"></span>' + CHEV +
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
    var extra = l[0] === 'navAI' ? '<span class="sh-new" data-k="navNew"></span>' : '';
    return '<a href="' + link(l[1]) + '"><span data-k="' + l[0] + '"></span>' + extra + '</a>';
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
        var h = (l[0] === 'navTools') ? homeHash('#popular') : link(l[1]);
        return '<a href="' + h + '">' + d[l[0]] + '</a>';
      }).join('') +
      panelAuthHtml(d) + '</div>';
    // (re)build the Tools mega-menu in the current language
    var mega = mount.querySelector('#shMega');
    if (mega) mega.innerHTML = megaHtml(curLang());
    // (re)build the Products dropdown in the current language
    var prod = mount.querySelector('#shProdMenu');
    if (prod) prod.innerHTML = productsHtml(curLang());
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
    shield:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/>'
  };
  function asvg(n) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + (AIC[n] || '') + '</svg>'; }

  function avatarInner(u) {
    if (u.avatar) return '<img class="sh-avatar-img" src="' + esc(u.avatar) + '" alt="">';
    return esc((acctName(u) || '?').charAt(0).toUpperCase());
  }

  // Desktop account button + dropdown menu markup for a signed-in user.
  function acctMenuHtml(u, d) {
    var admin = isAdmin(u)
      ? '<a class="sh-acct-item sh-acct-admin" role="menuitem" href="' + link('admin.html') + '">' + asvg('shield') + '<span>' + esc(d.acctAdmin) + '</span></a>'
      : '';
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
            '<span class="sh-acct-name">' + esc(acctName(u)) + '</span>' +
            (u.email ? '<span class="sh-acct-mail">' + esc(u.email) + '</span>' : '') +
          '</span>' +
        '</div>' +
        admin +
        '<a class="sh-acct-item" role="menuitem" href="' + link('dashboard.html') + '">' + asvg('grid') + '<span>' + esc(d.acctDash) + '</span></a>' +
        '<a class="sh-acct-item" role="menuitem" href="' + link('files.html') + '">' + asvg('folder') + '<span>' + esc(d.acctFiles) + '</span></a>' +
        '<a class="sh-acct-item" role="menuitem" href="' + link('request.html') + '">' + asvg('inbox') + '<span>' + esc(d.acctRequest) + '</span></a>' +
        '<a class="sh-acct-item" role="menuitem" href="' + link('dashboard.html') + '#settings">' + asvg('gear') + '<span>' + esc(d.acctSettings) + '</span></a>' +
        '<div class="sh-acct-sep"></div>' +
        '<button class="sh-acct-item sh-acct-out" role="menuitem" type="button" id="shLogout">' + asvg('logout') + '<span>' + esc(d.acctLogout) + '</span></button>' +
      '</div>' +
    '</div>';
  }

  // Trailing auth links for the mobile drop panel (guest → Login; signed-in → shortcuts).
  function panelAuthHtml(d) {
    var u = currentUser();
    if (!u) return '<a href="' + link('auth.html') + '">' + d.navSignin + '</a>';
    return (isAdmin(u) ? '<a href="' + link('admin.html') + '">' + esc(d.acctAdmin) + '</a>' : '') +
      '<a href="' + link('dashboard.html') + '">' + esc(d.acctDash) + '</a>' +
      '<a href="' + link('files.html') + '">' + esc(d.acctFiles) + '</a>' +
      '<a href="' + link('request.html') + '">' + esc(d.acctRequest) + '</a>' +
      '<a href="' + link('dashboard.html') + '#settings">' + esc(d.acctSettings) + '</a>' +
      '<a href="#" data-sh-logout>' + esc(d.acctLogout) + '</a>';
  }

  // Fill the desktop auth slot from the current session, then wire the dropdown.
  function renderAuthArea() {
    var area = mount.querySelector('#shAuthArea');
    if (!area) return;
    var d = T[curLang()];
    var u = currentUser();
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
  }

  function closeAcct() {
    var wrap = mount.querySelector('#shAcct');
    if (!wrap) return;
    wrap.classList.remove('open');
    var b = wrap.querySelector('#shAcctBtn'); if (b) b.setAttribute('aria-expanded', 'false');
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

  // subtle bottom border once the page is scrolled
  function onScroll() { if (nav) nav.classList.toggle('scrolled', window.pageYOffset > 4); }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Keep header labels/icons in sync whenever the page flips language or theme.
  // (Every page sets html lang/dir/data-theme in its applyLang()/applyTheme().)
  new MutationObserver(function () { translate(); syncIcons(); renderAuthArea(); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['lang', 'dir', 'data-theme'] });

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
})();
