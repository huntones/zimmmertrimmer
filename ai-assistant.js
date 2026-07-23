/* ============================================================
   KOLKLI AI Assistant — a site-wide smart helper in one
   self-contained file, loaded on every page.

   Design goals / contract (mirrors accessibility.js):
     - SELF-CONTAINED: injects its own CSS, builds its own DOM,
       needs no markup on the page. header.js loads it (depth-aware)
       on every header page; standalone client pages can include it
       with a plain <script src="ai-assistant.js"> if desired.
     - FLOATING BUBBLE: a brand-gradient FAB pinned to the bottom
       INLINE-START corner (bottom-right in Hebrew RTL, bottom-left
       in LTR) so it never collides with the accessibility widget,
       which lives on the inline-END corner. Subtle hover + idle
       float animation; opens a chat window above it.
     - THE ASSISTANT: a personal helper for the KOLKLI system. It
       knows every page/tool, guides step-by-step, recommends the
       right tool for a task, helps troubleshoot, teaches the system
       and offers proactive, page-aware actions. Quick Actions sit at
       the top of the chat window.
     - BACKEND SEAM: if a real LLM endpoint is wired (set
       window.KOLKLI_AI = { endpoint, headers } or call
       KolkliAI.configure({endpoint})), each turn is POSTed there and
       the reply rendered. With no endpoint configured it runs the
       built-in knowledge brain (demo mode) — genuinely useful, never
       pretending to be something it isn't. See sendToBackend() for
       the request/response contract.
     - THEME + i18n + RTL AWARE: reads <html lang/dir/data-theme>
       (he/en/ru, rtl/ltr, light/dark) and re-renders live via a
       MutationObserver, exactly like header.js / accessibility.js.
     - PRIVACY: no network calls unless a backend endpoint is wired.
       The only thing stored is the conversation + open/seen state,
       in localStorage under "kolkli_ai".
   ============================================================ */
(function () {
  'use strict';
  if (window.__kolkliAI) return;                       // guard against a double include
  window.__kolkliAI = true;

  var STORE = 'kolkli_ai';                             // conversation + ui state
  var SEEN = 'kolkli_ai_seen';                         // first-visit nudge shown?

  // ============================================================
  //  Depth-aware root prefix (same logic header.js uses) so every
  //  deep-link resolves from the site root at any folder depth.
  // ============================================================
  var pathNoHtml = location.pathname.replace(/\.html$/i, '');
  var depth = location.pathname.replace(/[^/]*$/, '').split('/').filter(Boolean).length;
  var ROOT = depth ? new Array(depth + 1).join('../') : './';
  function link(p) { return ROOT + p; }

  // Primary page slug for context detection: first path segment (so
  // /dashboard/project-send still reads as "dashboard"), '' -> home.
  var segs = pathNoHtml.split('/').filter(Boolean);
  var pageSlug = (segs[0] || 'index').toLowerCase();
  if (pageSlug === '' || pageSlug === 'index') pageSlug = 'index';

  // ============================================================
  //  i18n — chrome strings in he / en / ru.
  // ============================================================
  var L = {
    he: {
      open: 'העוזר החכם של KOLKLI', title: 'KOLKLI AI', subtitle: 'העוזר החכם שלך',
      close: 'סגירה', minimize: 'מזעור', quick: 'פעולות מהירות', send: 'שליחה',
      placeholder: 'כתבו לי מה תרצו לעשות…', online: 'מחובר · עונה תוך שניות',
      nudge: 'שלום! 👋 אני העוזר החכם של KOLKLI. אשמח לעזור — לחצו עליי.',
      reset: 'שיחה חדשה', you: 'אתם', typing: 'מקליד…',
      poweredLocal: 'עוזר KOLKLI', greetHi: 'שלום', help: 'איך אפשר לעזור?'
    },
    en: {
      open: 'KOLKLI smart assistant', title: 'KOLKLI AI', subtitle: 'Your smart assistant',
      close: 'Close', minimize: 'Minimize', quick: 'Quick actions', send: 'Send',
      placeholder: 'Tell me what you want to do…', online: 'Online · replies in seconds',
      nudge: 'Hi! 👋 I\'m your KOLKLI assistant. Click me — I\'m here to help.',
      reset: 'New chat', you: 'You', typing: 'typing…',
      poweredLocal: 'KOLKLI assistant', greetHi: 'Hi', help: 'How can I help?'
    },
    ru: {
      open: 'Умный помощник KOLKLI', title: 'KOLKLI AI', subtitle: 'Ваш умный помощник',
      close: 'Закрыть', minimize: 'Свернуть', quick: 'Быстрые действия', send: 'Отправить',
      placeholder: 'Напишите, что вы хотите сделать…', online: 'Онлайн · отвечает за секунды',
      nudge: 'Привет! 👋 Я умный помощник KOLKLI. Нажмите — я помогу.',
      reset: 'Новый чат', you: 'Вы', typing: 'печатает…',
      poweredLocal: 'Помощник KOLKLI', greetHi: 'Привет', help: 'Чем могу помочь?'
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
  function isDark() { return document.documentElement.getAttribute('data-theme') === 'dark'; }

  // ============================================================
  //  Deep links to the real pages (clean URLs, depth-aware).
  // ============================================================
  var GO = {
    home: link(''), dashboard: link('dashboard'), request: link('request'),
    review: link('review'), send: link('send'), files: link('files'),
    app: link('app'), pricing: link('pricing/'), account: link('account-settings'),
    aiHub: link('ai/'), tools: link('tools/'), contact: link('contact'),
    convert: link('convert'), upload: link('upload')
  };

  // ============================================================
  //  Page context map — what the user is looking at, so help and
  //  suggested actions are relevant to the current screen.
  //  Each entry: { name, blurb, chips:[quick-action keys] }.
  // ============================================================
  var PAGES = {
    index: {
      he: { name: 'דף הבית', blurb: 'זהו דף הבית של KOLKLI. מכאן מגיעים לכל הכלים והשירותים.' },
      en: { name: 'Home', blurb: 'This is the KOLKLI home page — the gateway to every tool and service.' },
      ru: { name: 'Главная', blurb: 'Это главная страница KOLKLI — вход ко всем инструментам и сервисам.' },
      chips: ['learn', 'recommend', 'fileRequest', 'tips']
    },
    dashboard: {
      he: { name: 'לוח הבקרה', blurb: 'לוח הבקרה מרכז את כל הפרויקטים, הקבצים, הבקשות והאישורים שלכם.' },
      en: { name: 'Dashboard', blurb: 'Your dashboard gathers every project, file, request and approval in one place.' },
      ru: { name: 'Панель управления', blurb: 'Панель собирает все проекты, файлы, запросы и утверждения в одном месте.' },
      chips: ['fileRequest', 'reviewPage', 'newForm', 'tips']
    },
    request: {
      he: { name: 'קבלת קבצים · אולפן הטפסים', blurb: 'כאן בונים טופס לאיסוף קבצים מלקוחות — עם שדות מותאמים אישית.' },
      en: { name: 'Receive Files · Form Studio', blurb: 'Here you build a form to collect files from clients, with custom fields.' },
      ru: { name: 'Приём файлов · Студия форм', blurb: 'Здесь вы создаёте форму для сбора файлов от клиентов с настраиваемыми полями.' },
      chips: ['newForm', 'addFields', 'fileRequest', 'tips']
    },
    review: {
      he: { name: 'אישור קבצים', blurb: 'עמוד אישור הקבצים: הלקוח צופה, מעיר ומאשר — ואתם רואים הכול בזמן אמת.' },
      en: { name: 'Approve Files', blurb: 'The approval page: your client reviews, comments and approves — you see it all live.' },
      ru: { name: 'Утверждение файлов', blurb: 'Страница утверждения: клиент смотрит, комментирует и утверждает — вы видите всё в реальном времени.' },
      chips: ['reviewPage', 'learn', 'troubleshoot', 'tips']
    },
    send: {
      he: { name: 'שליחת קבצים', blurb: 'שליחת קבצים גדולים בקישור אחד — בלי הגבלות דוא"ל.' },
      en: { name: 'Send Files', blurb: 'Share big files with a single link — no email size limits.' },
      ru: { name: 'Отправка файлов', blurb: 'Отправляйте большие файлы одной ссылкой — без ограничений почты.' },
      chips: ['learn', 'troubleshoot', 'recommend', 'tips']
    },
    files: {
      he: { name: 'בחירת וארגון קבצים', blurb: 'בחירה, מיון וארגון של הקבצים שלכם לפני שליחה או אישור.' },
      en: { name: 'Organize Files', blurb: 'Pick, sort and organize your files before sending or approval.' },
      ru: { name: 'Организация файлов', blurb: 'Выбор, сортировка и организация файлов перед отправкой или утверждением.' },
      chips: ['learn', 'recommend', 'tips', 'troubleshoot']
    },
    app: {
      he: { name: 'חותך האודיו', blurb: 'חותך ה-MP3: גזרו קטע מדויק מקובץ אודיו והורידו אותו.' },
      en: { name: 'Audio Cutter', blurb: 'The MP3 cutter: trim an exact clip from an audio file and download it.' },
      ru: { name: 'Аудиообрезка', blurb: 'MP3-резак: вырежьте точный фрагмент из аудио и скачайте его.' },
      chips: ['learn', 'recommend', 'troubleshoot', 'tips']
    },
    upload: {
      he: { name: 'העלאת קבצים', blurb: 'עמוד ההעלאה שהלקוח מקבל — כאן ממלאים את הטופס ומעלים קבצים.' },
      en: { name: 'Upload', blurb: 'The upload page your client sees — they fill the form and upload files here.' },
      ru: { name: 'Загрузка', blurb: 'Страница загрузки для клиента — здесь заполняют форму и загружают файлы.' },
      chips: ['troubleshoot', 'learn', 'tips', 'recommend']
    },
    checkout: {
      he: { name: 'תשלום', blurb: 'עמוד התשלום. אני יכול להסביר על המסלולים ומה כלול בכל אחד.' },
      en: { name: 'Checkout', blurb: 'The checkout page. I can explain the plans and what each one includes.' },
      ru: { name: 'Оплата', blurb: 'Страница оплаты. Могу объяснить тарифы и что входит в каждый.' },
      chips: ['plans', 'recommend', 'troubleshoot', 'tips']
    },
    pricing: {
      he: { name: 'מסלולים ומחירים', blurb: 'השוואת המסלולים. אשמח לעזור לבחור את המתאים לכם.' },
      en: { name: 'Pricing', blurb: 'Compare the plans. I\'m happy to help you pick the right one.' },
      ru: { name: 'Тарифы', blurb: 'Сравнение тарифов. Помогу выбрать подходящий.' },
      chips: ['plans', 'recommend', 'learn', 'tips']
    },
    'account-settings': {
      he: { name: 'הגדרות החשבון', blurb: 'הגדרות החשבון: פרופיל, מיתוג, שפה, התראות ואבטחה.' },
      en: { name: 'Account Settings', blurb: 'Account settings: profile, branding, language, notifications and security.' },
      ru: { name: 'Настройки аккаунта', blurb: 'Настройки: профиль, брендинг, язык, уведомления и безопасность.' },
      chips: ['learn', 'troubleshoot', 'tips', 'recommend']
    }
  };
  // Tool pages (converters/editors/etc.) share one generic context.
  var TOOL_SLUGS = /^(convert|resize-image|compress-|crop-image|watermark|merge-|mp4-to-mp3|extract-audio|fade-audio|normalize-audio|trim-silence|ringtone|vocal-remover|video-|audio-editor|remove-bg|restore-image|ai-|subtitle-|doc-|pdf-|image-convert|font-convert|ebook-|spreadsheet-|presentation-|archive-|heic-|color-|palette-|contrast-|gradient-|box-shadow|border-radius|image-to-base64|minify|json-|url-encode|html-cleaner|meta-|favicon-|embed-|screen-units|aspect-ratio|placeholder-|text-tools|css-tools|qr-|utm-|whatsapp-|mailto-|link-preview|redirect-|percent-|unit-|timezone-|work-hours-|uuid-|password-|lorem-|filename-|copy-generator|cta-generator|ad-text-|color-code)/;
  function pageCtx() {
    var lang = curLang();
    var p = PAGES[pageSlug];
    if (!p && TOOL_SLUGS.test(pageSlug)) {
      return {
        name: { he: 'כלי KOLKLI', en: 'KOLKLI tool', ru: 'Инструмент KOLKLI' }[lang],
        blurb: {
          he: 'אתם נמצאים באחד מכלי KOLKLI. אני יכול להדריך איך להשתמש בו או להמליץ על כלי אחר.',
          en: 'You\'re in one of the KOLKLI tools. I can guide you through it or recommend another.',
          ru: 'Вы в одном из инструментов KOLKLI. Помогу с ним или подскажу другой.'
        }[lang],
        chips: ['learn', 'recommend', 'troubleshoot', 'tips']
      };
    }
    if (!p) {
      return {
        name: { he: 'KOLKLI', en: 'KOLKLI', ru: 'KOLKLI' }[lang],
        blurb: {
          he: 'אני כאן כדי לעזור לכם בכל מה שקשור למערכת KOLKLI.',
          en: 'I\'m here to help with anything in the KOLKLI system.',
          ru: 'Я здесь, чтобы помочь со всем, что связано с KOLKLI.'
        }[lang],
        chips: ['learn', 'recommend', 'fileRequest', 'tips']
      };
    }
    var d = p[lang] || p.he;
    return { name: d.name, blurb: d.blurb, chips: p.chips };
  }

  // ============================================================
  //  Quick Actions (top of the chat) + their handlers. Each key
  //  has a short label per language and a reply builder. Free-text
  //  intents route into the same builders, so the brain is one map.
  // ============================================================
  var QA = {
    newForm:     { he: 'צור עבורי טופס חדש',   en: 'Build me a new form',   ru: 'Создать форму' },
    addFields:   { he: 'הוסף שדות לטופס',       en: 'Add fields to a form',  ru: 'Добавить поля' },
    fileRequest: { he: 'צור בקשת קבצים',        en: 'Create a file request', ru: 'Запросить файлы' },
    reviewPage:  { he: 'צור עמוד Review',       en: 'Create a Review page',  ru: 'Создать Review' },
    recommend:   { he: 'המלץ על כלי מתאים',     en: 'Recommend a tool',      ru: 'Подобрать инструмент' },
    troubleshoot:{ he: 'עזור לי לפתור בעיה',    en: 'Help me fix a problem', ru: 'Решить проблему' },
    learn:       { he: 'למד אותי להשתמש במערכת',en: 'Teach me the system',   ru: 'Научить системе' },
    tips:        { he: 'טיפים לייעול העבודה',   en: 'Productivity tips',     ru: 'Советы по работе' },
    plans:       { he: 'הסבר על המסלולים',      en: 'Explain the plans',     ru: 'О тарифах' }
  };
  // The 8 chips shown in the Quick Actions strip (as requested).
  var QA_STRIP = ['newForm', 'addFields', 'fileRequest', 'reviewPage', 'recommend', 'troubleshoot', 'learn', 'tips'];

  function qaLabel(key) { var q = QA[key]; return q ? (q[curLang()] || q.he) : key; }

  // A reply is { text, chips?:[keys], links?:[{label,href,go?}] }.
  // `text` supports **bold**, line breaks, and "• " bullet lines.
  function reply(text, chips, links) { return { text: text, chips: chips || null, links: links || null }; }

  var BRAIN = {
    newForm: function () {
      var L2 = {
        he: reply(
          'מעולה, נבנה טופס! 🎯 באולפן הטפסים (עמוד *קבלת קבצים*) בונים טופס לאיסוף קבצים וחומרים מלקוחות. ככה עושים את זה:\n\n' +
          '• **פותחים את אולפן הטפסים** ולוחצים על שם הטופס כדי לתת לו שם.\n' +
          '• **גוררים בלוקים** מפלטת השדות משמאל אל תוך הטופס (שם, אימייל, קובץ, בחירה, טקסט חופשי ועוד).\n' +
          '• לכל שדה אפשר להגדיר **כותרת, חובה/רשות וסדר**.\n' +
          '• מפרסמים ומעתיקים את **הקישור** — שולחים ללקוח, והקבצים נכנסים ישר ללוח הבקרה.\n\n' +
          'רוצים שאפתח לכם את האולפן עכשיו?',
          ['addFields', 'fileRequest', 'tips'],
          [{ label: 'פתיחת אולפן הטפסים', go: 'request' }]),
        en: reply(
          'Great, let\'s build a form! 🎯 In the Form Studio (the *Receive Files* page) you design a form to collect files and info from clients. Here\'s how:\n\n' +
          '• **Open the Form Studio** and click the form name to rename it.\n' +
          '• **Drag blocks** from the field palette on the side into the form (name, email, file, choice, free text and more).\n' +
          '• For each field set a **label, required/optional and order**.\n' +
          '• Publish and copy the **link** — send it to your client and files land straight in your dashboard.\n\n' +
          'Want me to open the studio now?',
          ['addFields', 'fileRequest', 'tips'],
          [{ label: 'Open Form Studio', go: 'request' }]),
        ru: reply(
          'Отлично, создадим форму! 🎯 В Студии форм (страница *Приём файлов*) вы собираете файлы и данные от клиентов:\n\n' +
          '• **Откройте Студию форм** и нажмите на название, чтобы переименовать.\n' +
          '• **Перетащите блоки** из палитры полей в форму (имя, email, файл, выбор, текст и др.).\n' +
          '• Для каждого поля задайте **заголовок, обязательность и порядок**.\n' +
          '• Опубликуйте и скопируйте **ссылку** — отправьте клиенту, файлы попадут прямо в панель.\n\n' +
          'Открыть студию сейчас?',
          ['addFields', 'fileRequest', 'tips'],
          [{ label: 'Открыть Студию форм', go: 'request' }])
      };
      return L2[curLang()] || L2.he;
    },
    addFields: function () {
      var L2 = {
        he: reply(
          'להוספת שדות לטופס: 🧩\n\n' +
          '• פותחים את **אולפן הטפסים** (עמוד קבלת קבצים).\n' +
          '• בפלטת הבלוקים בצד יש **13 סוגי שדות** — לוחצים על בלוק כדי להוסיף אותו לטופס בזמן אמת.\n' +
          '• לחיצה על השדה בטופס פותחת עריכה מהירה: **כותרת, חובה/רשות, אפשרויות בחירה, מחיקה וגרירה לשינוי סדר**.\n' +
          '• השדות המותאמים מופיעים גם ללקוח וגם באיסוף התשובות בלוח הבקרה.\n\n' +
          'טיפ: הוסיפו שדה **"קובץ"** לכל חומר שאתם צריכים, ושדה **"טקסט חופשי"** להערות.',
          ['newForm', 'fileRequest', 'tips'],
          [{ label: 'פתיחת אולפן הטפסים', go: 'request' }]),
        en: reply(
          'To add fields to a form: 🧩\n\n' +
          '• Open the **Form Studio** (Receive Files page).\n' +
          '• The block palette on the side has **13 field types** — click a block to insert it live.\n' +
          '• Click a field in the form for quick editing: **label, required/optional, choice options, delete and drag-to-reorder**.\n' +
          '• Custom fields show up for the client and in the collected answers in your dashboard.\n\n' +
          'Tip: add a **"File"** field for each asset you need, and a **"Free text"** field for notes.',
          ['newForm', 'fileRequest', 'tips'],
          [{ label: 'Open Form Studio', go: 'request' }]),
        ru: reply(
          'Чтобы добавить поля: 🧩\n\n' +
          '• Откройте **Студию форм** (Приём файлов).\n' +
          '• В палитре сбоку — **13 типов полей**, нажмите блок, чтобы добавить его сразу.\n' +
          '• Клик по полю открывает быстрое редактирование: **заголовок, обязательность, варианты, удаление и перетаскивание**.\n' +
          '• Поля видны клиенту и в собранных ответах в панели.\n\n' +
          'Совет: добавьте поле **«Файл»** для каждого материала и **«Текст»** для заметок.',
          ['newForm', 'fileRequest', 'tips'],
          [{ label: 'Открыть Студию форм', go: 'request' }])
      };
      return L2[curLang()] || L2.he;
    },
    fileRequest: function () {
      var L2 = {
        he: reply(
          'בקשת קבצים היא הדרך לאסוף חומרים מלקוח בקישור אחד — בלי מיילים מסורבלים. 📥\n\n' +
          '• פותחים את שירות **קבלת קבצים** ובונים טופס קצר (שם, אימייל, ושדה קובץ).\n' +
          '• מעתיקים את הקישור ושולחים ללקוח (וואטסאפ / מייל).\n' +
          '• הלקוח מעלה — והקבצים מופיעים אצלכם בלוח הבקרה עם כל הפרטים.\n\n' +
          'רוצים שנתחיל?',
          ['newForm', 'reviewPage', 'tips'],
          [{ label: 'יצירת בקשת קבצים', go: 'request' }, { label: 'לוח הבקרה', go: 'dashboard' }]),
        en: reply(
          'A file request is how you collect assets from a client with one link — no messy email threads. 📥\n\n' +
          '• Open the **Receive Files** service and build a short form (name, email, file field).\n' +
          '• Copy the link and send it to your client (WhatsApp / email).\n' +
          '• They upload — and the files appear in your dashboard with all the details.\n\n' +
          'Want to start?',
          ['newForm', 'reviewPage', 'tips'],
          [{ label: 'Create a file request', go: 'request' }, { label: 'Dashboard', go: 'dashboard' }]),
        ru: reply(
          'Запрос файлов — сбор материалов от клиента одной ссылкой, без длинных писем. 📥\n\n' +
          '• Откройте сервис **Приём файлов** и создайте короткую форму (имя, email, поле файла).\n' +
          '• Скопируйте ссылку и отправьте клиенту (WhatsApp / email).\n' +
          '• Клиент загружает — файлы появляются в панели со всеми деталями.\n\n' +
          'Начнём?',
          ['newForm', 'reviewPage', 'tips'],
          [{ label: 'Создать запрос файлов', go: 'request' }, { label: 'Панель', go: 'dashboard' }])
      };
      return L2[curLang()] || L2.he;
    },
    reviewPage: function () {
      var L2 = {
        he: reply(
          'עמוד Review נותן ללקוח לצפות בחומר, להעיר ולאשר — ואתם מקבלים אישור מסודר. ✅\n\n' +
          '• פותחים את שירות **אישור קבצים** ומעלים את הקבצים (תמונה / וידאו / אודיו / PDF).\n' +
          '• דרך גלגל השיניים אפשר להגדיר **הרשאות, עדיפות, הערות מדויקות, אישור קולי ואימות מייל**.\n' +
          '• שולחים ללקוח קישור; הוא מסמן הערות ומאשר, ואתם רואים סטטוס בזמן אמת.\n\n' +
          'רוצים שנפתח עמוד אישור חדש?',
          ['fileRequest', 'learn', 'tips'],
          [{ label: 'פתיחת אישור קבצים', go: 'review' }]),
        en: reply(
          'A Review page lets a client view the work, comment and approve — so you get a clean sign-off. ✅\n\n' +
          '• Open the **Approve Files** service and upload the files (image / video / audio / PDF).\n' +
          '• Via the gear you can set **permissions, priority, pinpoint comments, voice approval and email verification**.\n' +
          '• Send the client a link; they mark comments and approve, and you see the status live.\n\n' +
          'Want to open a new review page?',
          ['fileRequest', 'learn', 'tips'],
          [{ label: 'Open Approve Files', go: 'review' }]),
        ru: reply(
          'Страница Review позволяет клиенту посмотреть работу, оставить комментарии и утвердить. ✅\n\n' +
          '• Откройте сервис **Утверждение файлов** и загрузите файлы (фото / видео / аудио / PDF).\n' +
          '• Через шестерёнку — **права, приоритет, точечные комментарии, голосовое утверждение и проверка email**.\n' +
          '• Отправьте клиенту ссылку; он комментирует и утверждает, вы видите статус в реальном времени.\n\n' +
          'Открыть новую страницу проверки?',
          ['fileRequest', 'learn', 'tips'],
          [{ label: 'Открыть Утверждение', go: 'review' }])
      };
      return L2[curLang()] || L2.he;
    },
    recommend: function () {
      var L2 = {
        he: reply(
          'בשמחה אמליץ על הכלי הנכון. מה תרצו לעשות?',
          ['rec_collect', 'rec_send', 'rec_approve', 'rec_audio', 'rec_image', 'rec_convert']),
        en: reply(
          'Happy to point you to the right tool. What do you want to do?',
          ['rec_collect', 'rec_send', 'rec_approve', 'rec_audio', 'rec_image', 'rec_convert']),
        ru: reply(
          'С радостью подскажу нужный инструмент. Что вы хотите сделать?',
          ['rec_collect', 'rec_send', 'rec_approve', 'rec_audio', 'rec_image', 'rec_convert'])
      };
      return L2[curLang()] || L2.he;
    },
    troubleshoot: function () {
      var L2 = {
        he: reply(
          'אני כאן כדי לעזור לפתור. מה קורה?',
          ['tb_upload', 'tb_link', 'tb_send', 'tb_format', 'tb_client', 'tb_login']),
        en: reply(
          'I\'m here to help you fix it. What\'s happening?',
          ['tb_upload', 'tb_link', 'tb_send', 'tb_format', 'tb_client', 'tb_login']),
        ru: reply(
          'Помогу разобраться. Что происходит?',
          ['tb_upload', 'tb_link', 'tb_send', 'tb_format', 'tb_client', 'tb_login'])
      };
      return L2[curLang()] || L2.he;
    },
    learn: function () {
      var L2 = {
        he: reply(
          'ברוכים הבאים ל-KOLKLI! 🚀 בקצרה, המערכת בנויה סביב **ארבעה שירותי קבצים** ועשרות כלים:\n\n' +
          '• **קבלת קבצים** — טופס לאיסוף חומרים מלקוחות.\n' +
          '• **שליחת קבצים** — שיתוף קבצים גדולים בקישור.\n' +
          '• **אישור קבצים** — הלקוח צופה, מעיר ומאשר.\n' +
          '• **בחירת קבצים** — מיון וארגון לפני שליחה.\n\n' +
          'הכול מתנקז ל**לוח הבקרה**. במה נתחיל?',
          ['fileRequest', 'reviewPage', 'recommend', 'tips'],
          [{ label: 'לוח הבקרה', go: 'dashboard' }, { label: 'כל הכלים', go: 'tools' }]),
        en: reply(
          'Welcome to KOLKLI! 🚀 In short, it\'s built around **four file services** and dozens of tools:\n\n' +
          '• **Receive Files** — a form to collect assets from clients.\n' +
          '• **Send Files** — share big files with a link.\n' +
          '• **Approve Files** — the client reviews, comments and approves.\n' +
          '• **Organize Files** — sort and arrange before sending.\n\n' +
          'Everything flows into your **dashboard**. Where shall we start?',
          ['fileRequest', 'reviewPage', 'recommend', 'tips'],
          [{ label: 'Dashboard', go: 'dashboard' }, { label: 'All tools', go: 'tools' }]),
        ru: reply(
          'Добро пожаловать в KOLKLI! 🚀 Система построена вокруг **четырёх файловых сервисов** и десятков инструментов:\n\n' +
          '• **Приём файлов** — форма для сбора материалов от клиентов.\n' +
          '• **Отправка файлов** — большие файлы по ссылке.\n' +
          '• **Утверждение файлов** — клиент смотрит, комментирует и утверждает.\n' +
          '• **Организация файлов** — сортировка перед отправкой.\n\n' +
          'Всё стекается в **панель управления**. С чего начнём?',
          ['fileRequest', 'reviewPage', 'recommend', 'tips'],
          [{ label: 'Панель', go: 'dashboard' }, { label: 'Все инструменты', go: 'tools' }])
      };
      return L2[curLang()] || L2.he;
    },
    tips: function () {
      var L2 = {
        he: reply(
          'הנה כמה טיפים לחיסכון בזמן: ⚡\n\n' +
          '• **קישור אחד ללקוח** — במקום מיילים, שלחו קישור קבלת-קבצים ותנו ל-KOLKLI לארגן.\n' +
          '• **תבניות טפסים** — בנו טופס פעם אחת ושכפלו לכל פרויקט חדש.\n' +
          '• **אישור בקישור** — סגרו אישורי לקוח דרך עמוד Review במקום צילומי מסך.\n' +
          '• **מיתוג אחיד** — הגדירו לוגו וצבע בהגדרות החשבון, וכל עמוד שהלקוח רואה ייראה שלכם.\n' +
          '• **מצב כהה + נגישות** — כפתורי הראש והפינה מתאימים את הממשק לכל משתמש.\n\n' +
          'רוצים שאראה איפה מגדירים מיתוג?',
          ['learn', 'recommend', 'reviewPage'],
          [{ label: 'הגדרות החשבון', go: 'account' }]),
        en: reply(
          'Here are a few time-savers: ⚡\n\n' +
          '• **One link per client** — instead of emails, send a file-request link and let KOLKLI organize it.\n' +
          '• **Form templates** — build a form once and duplicate it for each new project.\n' +
          '• **Approve by link** — close client sign-offs via a Review page instead of screenshots.\n' +
          '• **Consistent branding** — set a logo and color in account settings so every client-facing page looks like yours.\n' +
          '• **Dark mode + accessibility** — the header and corner buttons adapt the UI for everyone.\n\n' +
          'Want me to show where branding is set?',
          ['learn', 'recommend', 'reviewPage'],
          [{ label: 'Account settings', go: 'account' }]),
        ru: reply(
          'Несколько советов для экономии времени: ⚡\n\n' +
          '• **Одна ссылка клиенту** — вместо писем отправьте запрос файлов, KOLKLI всё организует.\n' +
          '• **Шаблоны форм** — создайте форму один раз и дублируйте для новых проектов.\n' +
          '• **Утверждение по ссылке** — закрывайте согласования через Review, а не скриншотами.\n' +
          '• **Единый брендинг** — задайте логотип и цвет в настройках, и все страницы для клиента будут вашими.\n' +
          '• **Тёмная тема + доступность** — кнопки в шапке и углу адаптируют интерфейс.\n\n' +
          'Показать, где настраивается брендинг?',
          ['learn', 'recommend', 'reviewPage'],
          [{ label: 'Настройки аккаунта', go: 'account' }])
      };
      return L2[curLang()] || L2.he;
    },
    plans: function () {
      var L2 = {
        he: reply(
          'בקצרה על המסלולים: 💳\n\n' +
          '• **Free** — עד 50MB לקובץ, 3 פעולות ביום. מצוין להתחלה.\n' +
          '• **מסלולים בתשלום** — עד 500MB לקובץ, ייצוא באורך מלא, וכל הכלים בלי הגבלה.\n\n' +
          'בעמוד המסלולים המחירים מותאמים אוטומטית למטבע שלכם. רוצים שאעזור לבחור לפי כמות העבודה שלכם?',
          ['recommend', 'learn', 'tips'],
          [{ label: 'עמוד המסלולים', go: 'pricing' }]),
        en: reply(
          'Plans in a nutshell: 💳\n\n' +
          '• **Free** — up to 50MB per file, 3 actions/day. Great to start.\n' +
          '• **Paid plans** — up to 500MB per file, full-length exports, and every tool with no cap.\n\n' +
          'On the pricing page prices auto-match your currency. Want help choosing based on your workload?',
          ['recommend', 'learn', 'tips'],
          [{ label: 'Pricing page', go: 'pricing' }]),
        ru: reply(
          'Кратко о тарифах: 💳\n\n' +
          '• **Free** — до 50MB на файл, 3 действия/день. Отлично для старта.\n' +
          '• **Платные** — до 500MB на файл, экспорт без обрезки и все инструменты без лимита.\n\n' +
          'На странице тарифов цены подстраиваются под вашу валюту. Помочь выбрать по объёму работы?',
          ['recommend', 'learn', 'tips'],
          [{ label: 'Страница тарифов', go: 'pricing' }])
      };
      return L2[curLang()] || L2.he;
    },

    // ---- Recommender leaves ----
    rec_collect: function () { return recLeaf('request',
      { he: 'לאיסוף חומרים מלקוח', en: 'To collect assets from a client', ru: 'Сбор материалов от клиента' },
      { he: 'שירות **קבלת קבצים** הוא בול בשבילכם — טופס אחד, קישור אחד, וכל הקבצים מסודרים אצלכם.',
        en: 'The **Receive Files** service is perfect — one form, one link, all files organized for you.',
        ru: 'Сервис **Приём файлов** идеален — одна форма, одна ссылка, все файлы у вас.' },
      { he: 'פתיחת קבלת קבצים', en: 'Open Receive Files', ru: 'Открыть Приём файлов' }); },
    rec_send: function () { return recLeaf('send',
      {}, { he: 'לשליחת קובץ גדול השתמשו ב**שליחת קבצים** — מעלים, מקבלים קישור, שולחים. בלי הגבלת מייל.',
        en: 'To send a big file use **Send Files** — upload, get a link, share it. No email limits.',
        ru: 'Для отправки большого файла — **Отправка файлов**: загрузите, получите ссылку, отправьте.' },
      { he: 'פתיחת שליחת קבצים', en: 'Open Send Files', ru: 'Открыть Отправку' }); },
    rec_approve: function () { return recLeaf('review',
      {}, { he: 'לאישור מול לקוח **אישור קבצים** הוא הכלי — הלקוח מעיר ומאשר, ואתם מקבלים סגירה מסודרת.',
        en: 'For client sign-off, **Approve Files** is the tool — they comment and approve, you get a clean close.',
        ru: 'Для согласования с клиентом — **Утверждение файлов**: клиент комментирует и утверждает.' },
      { he: 'פתיחת אישור קבצים', en: 'Open Approve Files', ru: 'Открыть Утверждение' }); },
    rec_audio: function () { return recLeaf('app',
      {}, { he: 'לחיתוך או עריכת אודיו התחילו ב**חותך האודיו**. יש גם המרה, מאסטרינג AI וניקוי רעש בתפריט "כלי AI".',
        en: 'For cutting or editing audio start with the **Audio Cutter**. Also see convert, AI mastering and noise cleanup under the AI Tools menu.',
        ru: 'Для обрезки/редактирования аудио — **Аудиообрезка**. Также конвертация, AI-мастеринг и очистка шума в меню AI.' },
      { he: 'פתיחת חותך האודיו', en: 'Open Audio Cutter', ru: 'Открыть Аудиообрезку' }); },
    rec_image: function () { return recLeaf('tools',
      {}, { he: 'לתמונות יש שינוי גודל, דחיסה, סימן מים והסרת רקע AI. בחרו מתוך תפריט **הכלים**.',
        en: 'For images there\'s resize, compress, watermark and AI background removal. Pick from the **Tools** menu.',
        ru: 'Для фото — изменение размера, сжатие, водяной знак и удаление фона AI. Выберите в меню **Инструменты**.' },
      { he: 'לכל הכלים', en: 'All tools', ru: 'Все инструменты' }); },
    rec_convert: function () { return recLeaf('convert',
      {}, { he: 'להמרת פורמט (אודיו/וידאו/תמונה/מסמך) פתחו את **הממיר** — גררו קובץ ובחרו פורמט יעד.',
        en: 'To convert a format (audio/video/image/document) open the **Converter** — drop a file and pick a target format.',
        ru: 'Для конвертации (аудио/видео/фото/документ) откройте **Конвертер** — перетащите файл и выберите формат.' },
      { he: 'פתיחת הממיר', en: 'Open Converter', ru: 'Открыть Конвертер' }); },

    // ---- Troubleshooting leaves ----
    tb_upload: function () { return tbLeaf(
      { he: 'קובץ לא נטען / העלאה נכשלת', en: 'A file won\'t upload', ru: 'Файл не загружается' },
      { he: 'כמה דברים לבדוק:\n\n• **גודל הקובץ** — במסלול חינם הגבול הוא 50MB לקובץ. אם צריך יותר, שדרגו מסלול.\n• **חיבור** — נסו לרענן ולהעלות שוב; העלאה של קובץ ענק תלויה באינטרנט.\n• **סוג הקובץ** — ודאו שהפורמט נתמך בכלי הזה.\n• אם זה עדיין נתקע, נסו דפדפן אחר או חלון פרטי.',
        en: 'A few things to check:\n\n• **File size** — the free plan caps at 50MB per file. Upgrade for more.\n• **Connection** — refresh and retry; a huge upload depends on your network.\n• **File type** — make sure the format is supported by this tool.\n• If it still hangs, try another browser or a private window.',
        ru: 'Что проверить:\n\n• **Размер** — на Free лимит 50MB на файл. Нужно больше — обновите тариф.\n• **Соединение** — обновите и повторите; большой файл зависит от сети.\n• **Тип файла** — убедитесь, что формат поддерживается.\n• Если зависает — попробуйте другой браузер или приватное окно.' },
      'plans', 'pricing'); },
    tb_link: function () { return tbLeaf(
      { he: 'קישור לא עובד / פג תוקף', en: 'A link doesn\'t work', ru: 'Ссылка не работает' },
      { he: 'קישורי שיתוף יכולים לפוג או להיסגר:\n\n• בדקו בלוח הבקרה אם הקישור עדיין **פעיל**.\n• ודאו שהעתקתם את **הקישור המלא** בלי רווח בסוף.\n• אם הגדרתם הגבלת צפיות/תוקף — ייתכן שהוא הגיע לגבול. אפשר ליצור קישור חדש.',
        en: 'Share links can expire or be closed:\n\n• Check the dashboard to see if the link is still **active**.\n• Make sure you copied the **full link** with no trailing space.\n• If you set a view/expiry limit it may have been reached — you can generate a fresh link.',
        ru: 'Ссылки могут истечь или быть закрыты:\n\n• Проверьте в панели, **активна** ли ссылка.\n• Убедитесь, что скопировали **всю ссылку** без пробела в конце.\n• Если задан лимит просмотров/срок — он мог исчерпаться; создайте новую ссылку.' },
      'learn', 'dashboard'); },
    tb_send: function () { return tbLeaf(
      { he: 'לא מצליח לשלוח קבצים', en: 'Can\'t send files', ru: 'Не получается отправить' },
      { he: '• ודאו שהקבצים סיימו לעלות (מחוון ההעלאה הושלם).\n• בדקו את מגבלת הגודל של המסלול.\n• אחרי היצירה, **העתיקו את הקישור** מהכרטיס ושלחו ללקוח.\n• אם הכפתור אפור — ייתכן שחסר שדה חובה בטופס.',
        en: '• Make sure the files finished uploading (progress complete).\n• Check your plan\'s size limit.\n• After creating, **copy the link** from the card and send it.\n• If the button is greyed out, a required field may be missing.',
        ru: '• Убедитесь, что загрузка завершена.\n• Проверьте лимит размера тарифа.\n• После создания **скопируйте ссылку** с карточки и отправьте.\n• Серая кнопка — возможно, не заполнено обязательное поле.' },
      'recommend', 'send'); },
    tb_format: function () { return tbLeaf(
      { he: 'שגיאת פורמט / קובץ לא נתמך', en: 'Format / unsupported file error', ru: 'Ошибка формата' },
      { he: 'הכלי מקבל פורמטים מסוימים. הפתרון הפשוט: **המירו קודם** בממיר של KOLKLI לפורמט נתמך (למשל WAV/MP3, PNG/JPG, PDF), ואז חזרו לכלי.',
        en: 'The tool accepts certain formats. Simple fix: **convert first** with KOLKLI\'s converter to a supported format (e.g. WAV/MP3, PNG/JPG, PDF), then return to the tool.',
        ru: 'Инструмент принимает определённые форматы. Решение: **сначала конвертируйте** в поддерживаемый формат (WAV/MP3, PNG/JPG, PDF), затем вернитесь.' },
      'rec_convert', 'convert'); },
    tb_client: function () { return tbLeaf(
      { he: 'הלקוח לא רואה את הקבצים', en: 'The client can\'t see the files', ru: 'Клиент не видит файлы' },
      { he: '• ודאו ששלחתם את **הקישור הנכון** (של השירות המתאים — שליחה / אישור).\n• בדקו שהקישור עדיין פעיל בלוח הבקרה.\n• אם הפעלתם **אימות מייל**, הלקוח צריך להזין קוד שנשלח למייל שלו.\n• בקשו מהלקוח לרענן, ואם צריך — צרו קישור חדש.',
        en: '• Make sure you sent the **right link** (for the matching service — send / approve).\n• Confirm the link is still active in the dashboard.\n• If you enabled **email verification**, the client must enter a code sent to their email.\n• Ask them to refresh, and if needed generate a new link.',
        ru: '• Убедитесь, что отправили **правильную ссылку** (нужного сервиса).\n• Проверьте, активна ли ссылка в панели.\n• Если включена **проверка email**, клиент должен ввести код из письма.\n• Попросите обновить страницу, при необходимости создайте новую ссылку.' },
      'learn', 'dashboard'); },
    tb_login: function () { return tbLeaf(
      { he: 'בעיית התחברות / חשבון', en: 'Login / account issue', ru: 'Проблема со входом' },
      { he: '• ודאו שאתם משתמשים באותו **אימייל** שנרשמתם איתו.\n• נסו להתחבר מחדש דרך כפתור ההתחברות בראש העמוד.\n• פעולות בתשלום דורשות התחברות — התחברו קודם ואז המשיכו.\n• אם שכחתם סיסמה, השתמשו באפשרות השחזור במסך ההתחברות.',
        en: '• Make sure you\'re using the same **email** you signed up with.\n• Try signing in again via the login button at the top.\n• Paid actions require login — sign in first, then continue.\n• Forgot your password? Use the reset option on the login screen.',
        ru: '• Используйте тот же **email**, с которым регистрировались.\n• Войдите заново через кнопку входа вверху.\n• Платные действия требуют входа — сначала войдите.\n• Забыли пароль — используйте восстановление на экране входа.' },
      'plans', 'account'); }
  };

  // Recommender/troubleshoot leaves share label maps so their chips
  // render a friendly title (via QA_EXTRA) and route back into BRAIN.
  var QA_EXTRA = {
    rec_collect: { he: 'לאסוף קבצים מלקוח', en: 'Collect files from a client', ru: 'Собрать файлы от клиента' },
    rec_send:    { he: 'לשלוח קובץ גדול',    en: 'Send a big file',           ru: 'Отправить большой файл' },
    rec_approve: { he: 'לקבל אישור על קובץ',  en: 'Get a file approved',       ru: 'Утвердить файл' },
    rec_audio:   { he: 'לחתוך / לערוך אודיו',  en: 'Cut / edit audio',          ru: 'Обрезать / править аудио' },
    rec_image:   { he: 'לערוך תמונה',          en: 'Edit an image',             ru: 'Редактировать фото' },
    rec_convert: { he: 'להמיר קובץ',           en: 'Convert a file',            ru: 'Конвертировать файл' },
    tb_upload:   { he: 'קובץ לא נטען',          en: 'File won\'t upload',        ru: 'Файл не грузится' },
    tb_link:     { he: 'לינק לא עובד',          en: 'Link doesn\'t work',        ru: 'Ссылка не работает' },
    tb_send:     { he: 'לא מצליח לשלוח',        en: 'Can\'t send',               ru: 'Не отправляется' },
    tb_format:   { he: 'שגיאת פורמט',           en: 'Format error',              ru: 'Ошибка формата' },
    tb_client:   { he: 'הלקוח לא רואה קבצים',   en: 'Client can\'t see files',   ru: 'Клиент не видит' },
    tb_login:    { he: 'בעיית התחברות',         en: 'Login issue',               ru: 'Проблема входа' }
  };
  function label(key) {
    if (QA[key]) return QA[key][curLang()] || QA[key].he;
    if (QA_EXTRA[key]) return QA_EXTRA[key][curLang()] || QA_EXTRA[key].he;
    return key;
  }
  function recLeaf(go, _title, blurbMap, ctaMap) {
    var lang = curLang();
    return reply(blurbMap[lang] || blurbMap.he, ['recommend', 'learn', 'tips'],
      [{ label: ctaMap[lang] || ctaMap.he, go: go }]);
  }
  function tbLeaf(_title, bodyMap, chip, go) {
    var lang = curLang();
    return reply(bodyMap[lang] || bodyMap.he, ['troubleshoot', chip],
      go ? [{ label: goLabel(go), go: go }] : null);
  }
  function goLabel(go) {
    var m = {
      dashboard: { he: 'לוח הבקרה', en: 'Dashboard', ru: 'Панель' },
      request: { he: 'קבלת קבצים', en: 'Receive Files', ru: 'Приём файлов' },
      review: { he: 'אישור קבצים', en: 'Approve Files', ru: 'Утверждение' },
      send: { he: 'שליחת קבצים', en: 'Send Files', ru: 'Отправка' },
      convert: { he: 'הממיר', en: 'Converter', ru: 'Конвертер' },
      pricing: { he: 'מסלולים', en: 'Pricing', ru: 'Тарифы' },
      account: { he: 'הגדרות החשבון', en: 'Account settings', ru: 'Настройки' },
      app: { he: 'חותך האודיו', en: 'Audio Cutter', ru: 'Аудиообрезка' },
      tools: { he: 'כל הכלים', en: 'All tools', ru: 'Все инструменты' }
    }[go] || { he: go, en: go, ru: go };
    return m[curLang()] || m.he;
  }

  // ============================================================
  //  Free-text intent routing → BRAIN keys. Keyword matching in
  //  he/en/ru. First match wins; falls through to a helpful default.
  // ============================================================
  var INTENTS = [
    { k: 'newForm',      re: /(בנה|צור|תבנה|תיצור|חדש).*(טופס)|טופס חדש|build.*form|create.*form|new form|создать форму|нов.*форм/i },
    { k: 'addFields',    re: /(הוסף|להוסיף|עוד).*(שדה|שדות)|add.*field|more fields|добав.*пол/i },
    { k: 'fileRequest',  re: /(בקשת|לאסוף|לאסוף|איסוף|לקבל).*(קבצים|קובץ|חומר)|file request|collect files|receive files|запрос.*файл|собрать файл/i },
    { k: 'reviewPage',   re: /(אישור|לאשר|ביקורת|review|approv|proof)|утвержд|провер.*файл/i },
    { k: 'plans',        re: /(מסלול|מחיר|תשלום|לשלם|לשדרג|כמה עולה)|plan|pric|upgrade|how much|cost|тариф|цена|оплат|подписк/i },
    { k: 'recommend',    re: /(המלץ|איזה כלי|מה מתאים|כלי מתאים|עזור לי לבחור)|recommend|which tool|what tool|suggest.*tool|подбер|какой инструмент|посовет/i },
    { k: 'troubleshoot', re: /(בעיה|תקלה|שגיאה|לא עובד|נכשל|תקוע|error|not work|broken|fail|issue|problem|ошибк|проблем|не работает)/i },
    { k: 'learn',        re: /(איך|למד|הדרכה|מדריך|התחל|onboard|how (do|to)|teach|guide|tutorial|get started|как|научи|начать|инструкц)/i },
    { k: 'tips',         re: /(טיפ|ייעול|לחסוך זמן|פרודוקטיב|tips?|productiv|save time|faster|совет|быстр|продуктив)/i },
    { k: 'rec_send',     re: /(לשלוח|שליחה|share).*(גדול|קובץ|file)|send.*file|отправ.*файл/i },
    { k: 'rec_audio',    re: /(אודיו|שיר|mp3|צליל|קול|לחתוך)|audio|song|sound|cut audio|аудио|звук|песн/i },
    { k: 'rec_image',    re: /(תמונה|צילום|רקע|לוגו)|image|photo|background|логотип|фото|картинк/i },
    { k: 'rec_convert',  re: /(המרה|להמיר|convert|פורמט)|format|конверт|формат/i }
  ];
  function route(text) {
    var s = String(text || '');
    for (var i = 0; i < INTENTS.length; i++) if (INTENTS[i].re.test(s)) return INTENTS[i].k;
    return null;
  }
  function greetReply() {
    var ctx = pageCtx(), lang = curLang();
    var hi = { he: 'שלום! 👋 אני העוזר החכם של KOLKLI.', en: 'Hi! 👋 I\'m your KOLKLI assistant.', ru: 'Привет! 👋 Я умный помощник KOLKLI.' }[lang];
    var here = { he: 'אתם כרגע ב**' + ctx.name + '**. ' + ctx.blurb, en: 'You\'re on **' + ctx.name + '**. ' + ctx.blurb, ru: 'Вы на странице **' + ctx.name + '**. ' + ctx.blurb }[lang];
    var ask = { he: 'במה אפשר לעזור? אפשר לבחור פעולה מהירה למעלה או פשוט לכתוב לי.', en: 'How can I help? Pick a quick action above or just type.', ru: 'Чем помочь? Выберите быстрое действие выше или просто напишите.' }[lang];
    return reply(hi + '\n\n' + here + '\n\n' + ask, ctx.chips);
  }
  function fallbackReply(text) {
    var lang = curLang();
    var m = {
      he: 'לא בטוח שהבנתי במדויק — אבל אני כאן כדי לעזור עם כל דבר ב-KOLKLI: בניית טפסים, איסוף קבצים, אישורי לקוח, שליחת קבצים, עריכה והמרות. נסו לנסח מחדש, או בחרו אחת מהאפשרויות:',
      en: 'I\'m not sure I got that exactly — but I can help with anything in KOLKLI: building forms, collecting files, client approvals, sending files, editing and converting. Try rephrasing, or pick one of these:',
      ru: 'Не уверен, что точно понял — но помогу с чем угодно в KOLKLI: формы, сбор файлов, согласования, отправка, редактирование и конвертация. Переформулируйте или выберите:'
    }[lang];
    return reply(m, ['recommend', 'learn', 'troubleshoot', 'tips']);
  }

  // Produce the assistant reply for a user message (local brain).
  function localReply(text) {
    var key = route(text);
    if (key && BRAIN[key]) return BRAIN[key]();
    // small talk
    if (/(תודה|thank|спасиб)/i.test(text)) {
      var m = { he: 'בכיף! 🙌 אני כאן אם צריך עוד משהו.', en: 'Anytime! 🙌 I\'m here if you need anything else.', ru: 'Всегда рад! 🙌 Обращайтесь.' };
      return reply(m[curLang()] || m.he, pageCtx().chips);
    }
    if (/(שלום|היי|היא|hi|hello|hey|привет|здравств)/i.test(text.trim()) && text.trim().length < 22) return greetReply();
    if (/(איפה אני|באיזה עמוד|where am i|what page|где я|эта страниц)/i.test(text)) {
      var ctx = pageCtx();
      var w = { he: 'אתם ב**' + ctx.name + '**. ' + ctx.blurb, en: 'You\'re on **' + ctx.name + '**. ' + ctx.blurb, ru: 'Вы на **' + ctx.name + '**. ' + ctx.blurb };
      return reply(w[curLang()] || w.he, ctx.chips);
    }
    return fallbackReply(text);
  }

  // ============================================================
  //  Backend seam. If an endpoint is configured we POST the turn
  //  and render the reply; otherwise we use the local brain.
  //  Contract — POST { messages:[{role,content}], page:{slug,name,url}, lang }
  //  Response — { reply: "markdown-lite string" }  (or {text:"..."}).
  // ============================================================
  window.KOLKLI_AI = window.KOLKLI_AI || {};
  function backendCfg() {
    var c = window.KOLKLI_AI || {};
    return (c && typeof c.endpoint === 'string' && c.endpoint) ? c : null;
  }
  function sendToBackend(history) {
    var cfg = backendCfg();
    if (!cfg) return Promise.resolve(null);            // no backend → caller uses local brain
    var ctx = pageCtx();
    var body = {
      messages: history.map(function (m) { return { role: m.role, content: m.text }; }),
      page: { slug: pageSlug, name: ctx.name, url: location.href },
      lang: curLang()
    };
    var headers = { 'Content-Type': 'application/json' };
    if (cfg.headers) for (var h in cfg.headers) headers[h] = cfg.headers[h];
    return fetch(cfg.endpoint, { method: 'POST', headers: headers, body: JSON.stringify(body) })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j) return null;
        var txt = j.reply || j.text || (j.message && j.message.content);
        return txt ? reply(String(txt)) : null;
      })
      .catch(function () { return null; });
  }

  // Public API: wire a real LLM backend without touching this file.
  window.KolkliAI = {
    configure: function (cfg) { window.KOLKLI_AI = Object.assign(window.KOLKLI_AI || {}, cfg || {}); },
    open: function () { openPanel(); },
    close: function () { closePanel(); },
    ask: function (text) { openPanel(); if (text) submit(String(text)); }
  };

  // ============================================================
  //  Icons.
  // ============================================================
  var IC_BUBBLE = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M12 3l1.4 3.9L17 8.2l-3.6 1.4L12 13.5 10.6 9.6 7 8.2l3.6-1.3z"/>' +
    '<path d="M20 14.5c0 3.2-3.4 5.8-8 5.8-1 0-2-.1-2.9-.4L4 21l1.2-3.1C4.4 16.9 4 15.7 4 14.5c0-.5.1-1 .2-1.4"/>' +
    '<circle cx="18.5" cy="5.5" r="1.3" fill="currentColor" stroke="none"/></svg>';
  var IC = {
    send: '<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/>',
    close: '<path d="M18 6 6 18M6 6l12 12"/>',
    min: '<path d="M5 12h14"/>',
    reset: '<path d="M3 12a9 9 0 1 0 2.6-6.3"/><path d="M3 4v4h4"/>',
    arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    spark: '<path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17l-1.9-5.6L4.5 10l5.6-1.9z"/>'
  };
  function svg(name) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (IC[name] || '') + '</svg>';
  }

  // ============================================================
  //  Styles (brand gradient; light + dark; RTL-safe). Scoped under
  //  #kai-root and appended to <html> so page effects never touch it.
  // ============================================================
  var GRAD = 'linear-gradient(135deg,#7b34ff 0%,#3f85ff 100%)';
  var CSS = `
  #kai-root{ font-family:'Overpass','Rubik',system-ui,'Segoe UI',sans-serif; }
  #kai-root *{ box-sizing:border-box; }

  /* Floating bubble — inline-END corner, STACKED ABOVE the accessibility
     FAB (which sits at bottom:18 on the same corner). The inline-START
     corner is owned by the cookie-consent banner + its persistent reopen
     tab, so we share the a11y corner and clear both. */
  #kai-fab{ position:fixed; bottom:84px; inset-inline-end:18px; inset-inline-start:auto; z-index:2147482500;
    width:60px; height:60px; border:none; border-radius:50%; cursor:pointer; padding:0;
    background:${GRAD}; color:#fff; display:flex; align-items:center; justify-content:center;
    box-shadow:0 12px 30px rgba(82,60,244,.45), inset 0 1px 0 rgba(255,255,255,.35);
    transition:transform .16s cubic-bezier(.34,1.56,.64,1), box-shadow .2s ease;
    animation:kai-float 4.5s ease-in-out infinite; }
  #kai-fab:hover{ transform:scale(1.09) translateY(-2px); box-shadow:0 18px 40px rgba(82,60,244,.6); }
  #kai-fab:active{ transform:scale(.95); }
  #kai-fab:focus-visible{ outline:3px solid #fff; outline-offset:3px; }
  #kai-fab svg{ width:30px; height:30px; }
  /* pulsing ring */
  #kai-fab::after{ content:''; position:absolute; inset:0; border-radius:50%;
    box-shadow:0 0 0 0 rgba(123,52,255,.5); animation:kai-ring 2.6s ease-out infinite; }
  #kai-root.kai-open #kai-fab{ animation:none; }
  #kai-root.kai-open #kai-fab::after{ animation:none; }
  @keyframes kai-float{ 0%,100%{ transform:translateY(0);} 50%{ transform:translateY(-6px);} }
  @keyframes kai-ring{ 0%{ box-shadow:0 0 0 0 rgba(123,52,255,.5);} 70%{ box-shadow:0 0 0 16px rgba(123,52,255,0);} 100%{ box-shadow:0 0 0 0 rgba(123,52,255,0);} }

  /* First-visit nudge tooltip — to the inline-START of the bubble */
  #kai-nudge{ position:fixed; bottom:96px; inset-inline-end:90px; inset-inline-start:auto; z-index:2147482400;
    max-width:250px; padding:12px 14px; border-radius:16px; border-end-end-radius:5px;
    background:#fff; color:#1b2138; font-size:13.5px; font-weight:600; line-height:1.45;
    box-shadow:0 16px 40px rgba(30,37,80,.22); border:1px solid #ece9ff;
    opacity:0; transform:translateY(8px) scale(.96); transform-origin:bottom;
    pointer-events:none; transition:opacity .25s ease, transform .25s ease; }
  #kai-nudge.show{ opacity:1; transform:none; pointer-events:auto; }
  #kai-nudge b{ color:#5d43f5; }
  #kai-nudge .kai-nudge-x{ position:absolute; top:6px; inset-inline-end:6px; width:20px; height:20px;
    border:0; border-radius:6px; background:transparent; color:#98a1b8; cursor:pointer; font-size:14px; line-height:1; }
  #kai-nudge .kai-nudge-x:hover{ background:#f2f0ff; color:#5d43f5; }

  /* Chat window — opens above the stacked bubble */
  #kai-panel{ position:fixed; bottom:154px; inset-inline-end:18px; inset-inline-start:auto; z-index:2147482500;
    width:min(384px, calc(100vw - 24px)); height:min(72vh, 640px); display:flex; flex-direction:column;
    border-radius:22px; overflow:hidden; background:#fff; color:#1b2138; border:1px solid #e8ebfb;
    box-shadow:0 34px 80px rgba(30,37,80,.32); direction:inherit;
    opacity:0; visibility:hidden; transform:translateY(16px) scale(.97); transform-origin:bottom;
    transition:opacity .2s ease, transform .22s cubic-bezier(.34,1.4,.64,1), visibility 0s linear .22s; }
  #kai-panel.open{ opacity:1; visibility:visible; transform:none;
    transition:opacity .2s ease, transform .22s cubic-bezier(.34,1.4,.64,1), visibility 0s linear 0s; }

  /* Header (gradient) */
  #kai-panel .kai-head{ position:relative; display:flex; align-items:center; gap:11px; padding:14px 15px;
    background:${GRAD}; color:#fff; flex-shrink:0; }
  #kai-panel .kai-ava{ width:40px; height:40px; border-radius:13px; flex-shrink:0; display:flex; align-items:center;
    justify-content:center; background:rgba(255,255,255,.18); box-shadow:inset 0 1px 0 rgba(255,255,255,.3); }
  #kai-panel .kai-ava svg{ width:24px; height:24px; }
  #kai-panel .kai-htx{ display:flex; flex-direction:column; min-width:0; flex:1; }
  #kai-panel .kai-htitle{ font-size:15.5px; font-weight:800; line-height:1.2; display:flex; align-items:center; gap:7px; }
  #kai-panel .kai-badge{ font-size:9.5px; font-weight:800; letter-spacing:.06em; padding:2px 6px; border-radius:6px;
    background:rgba(255,255,255,.22); }
  #kai-panel .kai-hsub{ font-size:11.5px; font-weight:600; opacity:.9; line-height:1.3; margin-top:2px;
    display:flex; align-items:center; gap:6px; }
  #kai-panel .kai-dot{ width:7px; height:7px; border-radius:50%; background:#5ff0a8; box-shadow:0 0 0 3px rgba(95,240,168,.25); flex-shrink:0; }
  #kai-panel .kai-hbtns{ display:flex; align-items:center; gap:5px; }
  #kai-panel .kai-hbtn{ width:32px; height:32px; border:0; border-radius:9px; cursor:pointer; flex-shrink:0;
    background:rgba(255,255,255,.16); color:#fff; display:flex; align-items:center; justify-content:center; transition:background .12s; }
  #kai-panel .kai-hbtn:hover{ background:rgba(255,255,255,.3); }
  #kai-panel .kai-hbtn svg{ width:17px; height:17px; }
  #kai-panel .kai-hbtn:focus-visible{ outline:2px solid #fff; outline-offset:2px; }

  /* Quick actions strip */
  #kai-panel .kai-qa{ flex-shrink:0; display:flex; gap:7px; padding:11px 13px; overflow-x:auto;
    background:#faf9ff; border-bottom:1px solid #eef0fb; scrollbar-width:thin; }
  #kai-panel .kai-qa::-webkit-scrollbar{ height:5px; }
  #kai-panel .kai-qa::-webkit-scrollbar-thumb{ background:#ddd8f5; border-radius:5px; }
  #kai-panel .kai-chip{ flex-shrink:0; display:inline-flex; align-items:center; gap:6px; padding:8px 12px;
    border:1px solid #e4e0fb; border-radius:999px; background:#fff; color:#4a3ad0; cursor:pointer;
    font:inherit; font-size:12.5px; font-weight:700; white-space:nowrap; transition:.12s; }
  #kai-panel .kai-chip:hover{ border-color:#b9a9ff; background:#f4f1ff; transform:translateY(-1px); }
  #kai-panel .kai-chip:active{ transform:translateY(0); }
  #kai-panel .kai-chip svg{ width:14px; height:14px; opacity:.8; }
  #kai-panel .kai-chip:focus-visible{ outline:2px solid #7b34ff; outline-offset:2px; }

  /* Messages */
  #kai-msgs{ flex:1; overflow-y:auto; padding:16px 14px 8px; display:flex; flex-direction:column; gap:12px;
    background:#fbfbfe; scroll-behavior:smooth; }
  #kai-msgs::-webkit-scrollbar{ width:9px; }
  #kai-msgs::-webkit-scrollbar-thumb{ background:#e0e2f0; border-radius:8px; border:2.5px solid #fbfbfe; }
  .kai-row{ display:flex; gap:9px; max-width:100%; align-items:flex-end; }
  .kai-row.bot{ align-self:flex-start; }
  .kai-row.me{ align-self:flex-end; flex-direction:row-reverse; }
  .kai-mini{ width:26px; height:26px; border-radius:9px; flex-shrink:0; display:flex; align-items:center;
    justify-content:center; background:${GRAD}; color:#fff; }
  .kai-mini svg{ width:16px; height:16px; }
  .kai-bub{ padding:11px 13px; border-radius:16px; font-size:13.6px; line-height:1.55; max-width:270px;
    word-wrap:break-word; overflow-wrap:anywhere; }
  .kai-row.bot .kai-bub{ background:#fff; color:#26304a; border:1px solid #ebedf8; border-end-start-radius:5px;
    box-shadow:0 4px 14px rgba(30,37,80,.05); }
  .kai-row.me .kai-bub{ background:${GRAD}; color:#fff; border-end-end-radius:5px;
    box-shadow:0 8px 20px rgba(82,60,244,.28); }
  .kai-bub b{ font-weight:800; }
  .kai-bub .kai-li{ display:flex; gap:7px; margin:3px 0; }
  .kai-bub .kai-li::before{ content:''; width:6px; height:6px; margin-top:7px; border-radius:50%;
    background:#7b34ff; flex-shrink:0; }
  .kai-row.me .kai-bub .kai-li::before{ background:rgba(255,255,255,.85); }

  /* In-message action buttons + follow-up chips */
  .kai-acts{ display:flex; flex-direction:column; gap:7px; margin-top:9px; }
  .kai-act{ display:inline-flex; align-items:center; justify-content:space-between; gap:8px; width:100%;
    padding:10px 13px; border:0; border-radius:12px; cursor:pointer; font:inherit; font-size:13px; font-weight:800;
    background:${GRAD}; color:#fff; text-decoration:none; box-shadow:0 8px 18px rgba(82,60,244,.22); transition:filter .12s, transform .08s; }
  .kai-act:hover{ filter:brightness(1.06); }
  .kai-act:active{ transform:translateY(1px); }
  .kai-act svg{ width:16px; height:16px; flex-shrink:0; }
  html[dir="rtl"] .kai-act svg{ transform:scaleX(-1); }
  .kai-follow{ display:flex; flex-wrap:wrap; gap:6px; margin-top:9px; }
  .kai-fchip{ display:inline-flex; align-items:center; padding:6px 11px; border:1px solid #e0dcf6; border-radius:999px;
    background:#f6f4ff; color:#5340cf; cursor:pointer; font:inherit; font-size:12px; font-weight:700; transition:.12s; }
  .kai-fchip:hover{ background:#ece7ff; border-color:#c3b6ff; }

  /* Typing indicator */
  .kai-typing{ display:inline-flex; gap:4px; padding:13px 15px; }
  .kai-typing i{ width:7px; height:7px; border-radius:50%; background:#c3c8db; animation:kai-blink 1.2s infinite ease-in-out; }
  .kai-typing i:nth-child(2){ animation-delay:.18s; }
  .kai-typing i:nth-child(3){ animation-delay:.36s; }
  @keyframes kai-blink{ 0%,80%,100%{ transform:scale(.7); opacity:.5; } 40%{ transform:scale(1); opacity:1; } }

  /* Composer */
  #kai-panel .kai-foot{ flex-shrink:0; padding:11px 12px; border-top:1px solid #eef0fb; background:#fff; }
  #kai-panel .kai-inrow{ display:flex; align-items:flex-end; gap:8px; background:#f5f6ff; border:1.5px solid #e8ebfb;
    border-radius:16px; padding:6px 6px 6px 12px; transition:border-color .12s; }
  #kai-panel .kai-inrow:focus-within{ border-color:#b9a9ff; }
  #kai-panel .kai-in{ flex:1; border:0; background:transparent; resize:none; outline:none; color:#1b2138;
    font:inherit; font-size:13.6px; line-height:1.5; max-height:104px; padding:6px 0; }
  #kai-panel .kai-in::placeholder{ color:#9aa1b8; }
  #kai-panel .kai-sendb{ width:40px; height:40px; flex-shrink:0; border:0; border-radius:12px; cursor:pointer;
    background:${GRAD}; color:#fff; display:flex; align-items:center; justify-content:center;
    box-shadow:0 8px 18px rgba(82,60,244,.3); transition:filter .12s, transform .08s, opacity .12s; }
  #kai-panel .kai-sendb:hover{ filter:brightness(1.07); }
  #kai-panel .kai-sendb:active{ transform:scale(.94); }
  #kai-panel .kai-sendb:disabled{ opacity:.45; cursor:default; box-shadow:none; }
  #kai-panel .kai-sendb svg{ width:19px; height:19px; }
  html[dir="rtl"] #kai-panel .kai-sendb svg{ transform:scaleX(-1); }
  #kai-panel .kai-note{ text-align:center; font-size:10.5px; color:#a2a9bd; margin-top:7px; }

  /* Dark theme */
  html[data-theme="dark"] #kai-panel{ background:#12151c; color:#e7eaf2; border-color:#262d3a; box-shadow:0 34px 80px rgba(0,0,0,.6); }
  html[data-theme="dark"] #kai-panel .kai-qa{ background:#161a22; border-bottom-color:#242b37; }
  html[data-theme="dark"] #kai-panel .kai-chip{ background:#1d222c; border-color:#2c3340; color:#c9bbff; }
  html[data-theme="dark"] #kai-panel .kai-chip:hover{ background:#242b37; border-color:#4a3d78; }
  html[data-theme="dark"] #kai-msgs{ background:#0f1218; }
  html[data-theme="dark"] #kai-msgs::-webkit-scrollbar-thumb{ background:#2a303c; border-color:#0f1218; }
  html[data-theme="dark"] .kai-row.bot .kai-bub{ background:#1a1f28; color:#dfe4ee; border-color:#272e3b; box-shadow:none; }
  html[data-theme="dark"] .kai-bub .kai-li::before{ background:#a887ff; }
  html[data-theme="dark"] .kai-fchip{ background:#1e1a30; border-color:#332a53; color:#c3b0ff; }
  html[data-theme="dark"] .kai-fchip:hover{ background:#251f3d; border-color:#4a3d78; }
  html[data-theme="dark"] .kai-typing i{ background:#3a4152; }
  html[data-theme="dark"] #kai-panel .kai-foot{ background:#12151c; border-top-color:#242b37; }
  html[data-theme="dark"] #kai-panel .kai-inrow{ background:#1a1f28; border-color:#2a313e; }
  html[data-theme="dark"] #kai-panel .kai-inrow:focus-within{ border-color:#4a3d78; }
  html[data-theme="dark"] #kai-panel .kai-in{ color:#e7eaf2; }
  html[data-theme="dark"] #kai-panel .kai-in::placeholder{ color:#6b7280; }
  html[data-theme="dark"] #kai-panel .kai-note{ color:#5a6274; }
  html[data-theme="dark"] #kai-nudge{ background:#171b23; color:#e7eaf2; border-color:#2a313e; }
  html[data-theme="dark"] #kai-nudge b{ color:#a887ff; }
  html[data-theme="dark"] #kai-nudge .kai-nudge-x{ color:#8b93a4; }
  html[data-theme="dark"] #kai-nudge .kai-nudge-x:hover{ background:#242b37; color:#a887ff; }

  @media (prefers-reduced-motion: reduce){
    #kai-fab{ animation:none; } #kai-fab::after{ animation:none; }
    #kai-panel, #kai-fab, .kai-typing i{ transition:none !important; }
  }
  @media (max-width:640px){
    #kai-panel{ width:calc(100vw - 20px); height:min(72vh, 620px); inset-inline-end:10px; bottom:146px; }
    #kai-fab{ bottom:80px; inset-inline-end:14px; }
    #kai-nudge{ inset-inline-end:86px; bottom:92px; max-width:calc(100vw - 104px); }
  }
  `;

  var styleEl = document.createElement('style');
  styleEl.id = 'kai-css';
  styleEl.textContent = CSS;
  (document.head || document.documentElement).appendChild(styleEl);

  // ============================================================
  //  DOM.
  // ============================================================
  var root = document.createElement('div');
  root.id = 'kai-root';
  root.innerHTML =
    '<button id="kai-fab" type="button" aria-haspopup="dialog" aria-expanded="false" aria-controls="kai-panel">' + IC_BUBBLE + '</button>' +
    '<div id="kai-nudge" role="status"><button class="kai-nudge-x" type="button" aria-label="close">&times;</button><span class="kai-nudge-tx"></span></div>' +
    '<div id="kai-panel" role="dialog" aria-modal="false"></div>';
  document.documentElement.appendChild(root);

  var fab = root.querySelector('#kai-fab');
  var panel = root.querySelector('#kai-panel');
  var nudge = root.querySelector('#kai-nudge');

  // ---- Conversation state ----
  var history = [];        // [{role:'me'|'bot', text, chips, links}]
  try { var saved = JSON.parse(localStorage.getItem(STORE) || 'null'); if (saved && saved.history) history = saved.history; } catch (e) {}
  function persist() {
    try { localStorage.setItem(STORE, JSON.stringify({ history: history.slice(-40) })); } catch (e) {}
  }

  // ---- Panel shell (rebuilt on language change) ----
  function panelShell() {
    var d = t();
    var qa = QA_STRIP.map(function (k) {
      return '<button class="kai-chip" type="button" data-qa="' + k + '">' + svg('spark') + '<span>' + esc(qaLabel(k)) + '</span></button>';
    }).join('');
    panel.innerHTML =
      '<div class="kai-head">' +
        '<span class="kai-ava">' + IC_BUBBLE + '</span>' +
        '<span class="kai-htx">' +
          '<span class="kai-htitle">' + esc(d.title) + '<span class="kai-badge">AI</span></span>' +
          '<span class="kai-hsub"><span class="kai-dot"></span>' + esc(d.subtitle) + '</span>' +
        '</span>' +
        '<span class="kai-hbtns">' +
          '<button class="kai-hbtn" type="button" data-act="reset" aria-label="' + esc(d.reset) + '" title="' + esc(d.reset) + '">' + svg('reset') + '</button>' +
          '<button class="kai-hbtn" type="button" data-act="close" aria-label="' + esc(d.close) + '" title="' + esc(d.close) + '">' + svg('close') + '</button>' +
        '</span>' +
      '</div>' +
      '<div class="kai-qa" role="group" aria-label="' + esc(d.quick) + '">' + qa + '</div>' +
      '<div id="kai-msgs" aria-live="polite"></div>' +
      '<div class="kai-foot">' +
        '<div class="kai-inrow">' +
          '<textarea class="kai-in" rows="1" placeholder="' + esc(d.placeholder) + '" aria-label="' + esc(d.placeholder) + '"></textarea>' +
          '<button class="kai-sendb" type="button" data-act="send" aria-label="' + esc(d.send) + '" disabled>' + svg('send') + '</button>' +
        '</div>' +
        '<div class="kai-note">' + esc(d.poweredLocal) + ' · KOLKLI</div>' +
      '</div>';
    panel.setAttribute('aria-label', d.title);
    fab.setAttribute('aria-label', d.open);
    fab.setAttribute('title', d.open);
    wirePanel();
    renderMessages();
  }

  // ---- Render one message's inner HTML (markdown-lite) ----
  function fmt(text) {
    // escape, then apply **bold**, bullets ("• "), and line breaks.
    var lines = String(text).split('\n');
    return lines.map(function (ln) {
      var e = esc(ln).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
      if (/^•\s?/.test(ln)) return '<span class="kai-li"><span>' + e.replace(/^•\s?/, '') + '</span></span>';
      return e;
    }).join('<br>').replace(/(<\/span>)<br>(<span class="kai-li">)/g, '$1$2');
  }
  function msgHtml(m) {
    if (m.role === 'me') {
      return '<div class="kai-row me"><div class="kai-bub">' + fmt(m.text) + '</div></div>';
    }
    var acts = '';
    if (m.links && m.links.length) {
      acts += '<div class="kai-acts">' + m.links.map(function (a) {
        var href = a.href || (a.go && GO[a.go]) || '#';
        return '<a class="kai-act" href="' + esc(href) + '"><span>' + esc(a.label) + '</span>' + svg('arrow') + '</a>';
      }).join('') + '</div>';
    }
    if (m.chips && m.chips.length) {
      acts += '<div class="kai-follow">' + m.chips.map(function (k) {
        return '<button class="kai-fchip" type="button" data-qa="' + esc(k) + '">' + esc(label(k)) + '</button>';
      }).join('') + '</div>';
    }
    return '<div class="kai-row bot"><span class="kai-mini">' + svg('spark') + '</span><div class="kai-bub">' + fmt(m.text) + acts + '</div></div>';
  }
  function renderMessages() {
    var box = panel.querySelector('#kai-msgs');
    if (!box) return;
    box.innerHTML = history.map(msgHtml).join('');
    scrollDown();
  }
  function scrollDown() {
    var box = panel.querySelector('#kai-msgs');
    if (box) setTimeout(function () { box.scrollTop = box.scrollHeight; }, 20);
  }

  // ---- Push a message + typing flow ----
  function pushUser(text) { history.push({ role: 'me', text: text }); persist(); renderMessages(); }
  function pushBot(r) { history.push({ role: 'bot', text: r.text, chips: r.chips, links: r.links }); persist(); renderMessages(); }
  function showTyping() {
    var box = panel.querySelector('#kai-msgs');
    if (!box) return function () {};
    var el = document.createElement('div');
    el.className = 'kai-row bot';
    el.innerHTML = '<span class="kai-mini">' + svg('spark') + '</span><div class="kai-bub"><span class="kai-typing"><i></i><i></i><i></i></span></div>';
    box.appendChild(el); scrollDown();
    return function () { try { box.removeChild(el); } catch (e) {} };
  }

  // ---- Handle a user turn (backend if wired, else local brain) ----
  function respond(userText) {
    var stop = showTyping();
    var min = new Promise(function (res) { setTimeout(res, 480 + Math.min(700, userText.length * 12)); });
    Promise.all([sendToBackend(history), min]).then(function (arr) {
      stop();
      var r = arr[0] || localReply(userText);
      pushBot(r);
    });
  }
  function submit(text) {
    text = String(text || '').trim();
    if (!text) return;
    pushUser(text);
    var ta = panel.querySelector('.kai-in');
    if (ta) { ta.value = ''; autosize(ta); syncSend(); }
    respond(text);
  }
  // Run a quick-action key as if the user asked it.
  function runQA(key) {
    if (!BRAIN[key]) { submit(label(key)); return; }
    pushUser(label(key));
    var stop = showTyping();
    setTimeout(function () { stop(); pushBot(BRAIN[key]()); }, 430);
  }

  // ---- Wire panel controls ----
  function autosize(ta) { ta.style.height = 'auto'; ta.style.height = Math.min(104, ta.scrollHeight) + 'px'; }
  function syncSend() {
    var ta = panel.querySelector('.kai-in'), b = panel.querySelector('[data-act="send"]');
    if (ta && b) b.disabled = !ta.value.trim();
  }
  function wirePanel() {
    var ta = panel.querySelector('.kai-in');
    if (ta) {
      ta.addEventListener('input', function () { autosize(ta); syncSend(); });
      ta.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(ta.value); }
      });
    }
    panel.addEventListener('click', function (e) {
      var qa = e.target.closest('[data-qa]');
      if (qa) { runQA(qa.getAttribute('data-qa')); return; }
      var act = e.target.closest('[data-act]');
      if (!act) return;
      var a = act.getAttribute('data-act');
      if (a === 'send') { submit(ta ? ta.value : ''); }
      else if (a === 'close') { closePanel(); }
      else if (a === 'reset') { resetChat(); }
    });
  }

  function resetChat() {
    history = [];
    persist();
    renderMessages();
    // fresh greeting
    setTimeout(function () { pushBot(greetReply()); }, 120);
  }

  // ============================================================
  //  Open / close.
  // ============================================================
  function openPanel() {
    hideNudge(true);
    root.classList.add('kai-open');
    panel.classList.add('open');
    fab.setAttribute('aria-expanded', 'true');
    if (!history.length) pushBot(greetReply());
    else scrollDown();
    var ta = panel.querySelector('.kai-in');
    if (ta) setTimeout(function () { try { ta.focus(); } catch (e) {} }, 60);
  }
  function closePanel() {
    root.classList.remove('kai-open');
    panel.classList.remove('open');
    fab.setAttribute('aria-expanded', 'false');
    try { fab.focus(); } catch (e) {}
  }
  function panelOpen() { return panel.classList.contains('open'); }

  fab.addEventListener('click', function () { panelOpen() ? closePanel() : openPanel(); });

  // Close on outside click / Esc.
  document.addEventListener('click', function (e) {
    if (!panelOpen()) return;
    if (root.contains(e.target)) return;
    closePanel();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && panelOpen()) closePanel(); });

  // ============================================================
  //  First-visit nudge.
  // ============================================================
  function hideNudge(perm) {
    nudge.classList.remove('show');
    if (perm) { try { localStorage.setItem(SEEN, '1'); } catch (e) {} }
  }
  nudge.querySelector('.kai-nudge-x').addEventListener('click', function (e) { e.stopPropagation(); hideNudge(true); });
  nudge.addEventListener('click', function (e) { if (e.target.closest('.kai-nudge-x')) return; hideNudge(true); openPanel(); });
  function maybeNudge() {
    var seen; try { seen = localStorage.getItem(SEEN); } catch (e) {}
    if (seen) return;
    nudge.querySelector('.kai-nudge-tx').innerHTML = fmt(t().nudge);
    setTimeout(function () { if (!panelOpen()) nudge.classList.add('show'); }, 2600);
    setTimeout(function () { hideNudge(false); }, 12000);
  }

  // ============================================================
  //  Language / theme sync (same trick header.js uses).
  // ============================================================
  var lastLang = curLang();
  new MutationObserver(function () {
    var l = curLang();
    if (l !== lastLang) {
      lastLang = l;
      var wasOpen = panelOpen();
      panelShell();
      if (wasOpen) panel.classList.add('open');
      nudge.querySelector('.kai-nudge-tx').innerHTML = fmt(t().nudge);
    }
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang', 'dir', 'data-theme'] });

  // ============================================================
  //  Boot.
  // ============================================================
  panelShell();
  maybeNudge();
})();
