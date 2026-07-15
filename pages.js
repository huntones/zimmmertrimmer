/* ============================================================
   Shared renderer for the standalone content pages (KOLKLI).
   Each folder page (/audio/, /pricing/, /faq/, …) is a thin shell:
     <body data-page="audio"> … <main id="page"></main>
     <script src="../pages.js"></script>
   This script reads data-page, renders the content into #page, and
   wires the page's own language + theme (the shared header keeps in
   sync via its MutationObserver on <html> lang/dir/data-theme).
   Content mirrors index.html's DATA and header.js's TOOLS so the
   copy stays identical across the site.
   ============================================================ */
(function () {
  var el = function (id) { return document.getElementById(id); };
  var page = (document.body.getAttribute('data-page') || '').toLowerCase();

  /* ---------- shared UI strings ---------- */
  var STR = {
    he: {
      live:'זמין', soon:'בקרוב', featured:'כלים מובחרים', allTools:'כל הכלים',
      aiKick:'סטודיו AI', aiNew:'חדש', aiTitle:'כלים חכמים יותר, מבוססי AI',
      aiSub:'הכלים המתקדמים ביותר שלנו — נחשפים בקרוב.',
      faqKick:'שאלות נפוצות', faqTitle:'שאלות נפוצות', faqSub:'כל מה שרציתם לדעת על KOLKLI.',
      prKick:'מסלולים ומחירים', prTitle:'תמחור פשוט ושקוף', prSub:'מתחילים בחינם — או 7 ימי ניסיון חינם ל-Creator, ללא כרטיס אשראי.',
      perMonth:'/לחודש', mostPopular:'הכי פופולרי',
      finalH:'מוכנים להתחיל?', finalP:'העלו את הקובץ הראשון — זה לוקח כמה שניות בלבד.', finalCta:'בואו נתחיל',
      fHome:'בית', fPricing:'מסלולים ומחירים', fFaq:'שאלות נפוצות', fAI:'כלי AI', fSend:'שליחת קבצים', fReview:'אישור קבצים', fPrivacy:'פרטיות', fTerms:'תנאי שימוש',
      cp:'KOLKLI · העריכה רצה בדפדפן שלכם · הקבצים נשארים אצלכם.'
    },
    en: {
      live:'Live', soon:'Soon', featured:'Featured tools', allTools:'All tools',
      aiKick:'AI Studio', aiNew:'New', aiTitle:'Smarter tools, powered by AI',
      aiSub:'Our most advanced tools — rolling out soon.',
      faqKick:'FAQ', faqTitle:'Frequently asked questions', faqSub:'Everything you wanted to know about KOLKLI.',
      prKick:'Pricing', prTitle:'Simple, transparent pricing', prSub:'Start free — or try Creator free for 7 days, no credit card.',
      perMonth:'/mo', mostPopular:'Most Popular',
      finalH:'Ready to get started?', finalP:'Upload your first file — it takes just a few seconds.', finalCta:'Get started',
      fHome:'Home', fPricing:'Pricing', fFaq:'FAQ', fAI:'AI Tools', fSend:'Send Files', fReview:'Approve Files', fPrivacy:'Privacy', fTerms:'Terms',
      cp:'KOLKLI · Editing runs in your browser · Your files stay with you.'
    },
    ru: {
      live:'Доступно', soon:'Скоро', featured:'Избранные инструменты', allTools:'Все инструменты',
      aiKick:'AI-студия', aiNew:'Новое', aiTitle:'Умные инструменты на базе AI',
      aiSub:'Наши самые продвинутые инструменты — скоро в доступе.',
      faqKick:'FAQ', faqTitle:'Частые вопросы', faqSub:'Всё, что вы хотели знать о KOLKLI.',
      prKick:'Цены', prTitle:'Простые и прозрачные цены', prSub:'Начните бесплатно — или 7 дней Creator бесплатно, без карты.',
      perMonth:'/мес', mostPopular:'Самый популярный',
      finalH:'Готовы начать?', finalP:'Загрузите первый файл — это займёт всего несколько секунд.', finalCta:'Начать',
      fHome:'Главная', fPricing:'Цены', fFaq:'FAQ', fAI:'AI-инструменты', fSend:'Отправка файлов', fReview:'Утверждение файлов', fPrivacy:'Конфиденциальность', fTerms:'Условия',
      cp:'KOLKLI · Редактирование в вашем браузере · Ваши файлы остаются у вас.'
    }
  };

  /* ---------- line-icon set (from header.js) ---------- */
  var IC = {
    scissors:'<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/>',
    refresh:'<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
    merge:'<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 0 0 9 9"/>',
    pulse:'<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
    sliders:'<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
    maximize:'<path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/>',
    crop:'<path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/>',
    sparkle:'<path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17l-1.9-5.6L4.5 10l5.6-1.9z"/>',
    image:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
    film:'<rect x="2" y="2" width="20" height="20" rx="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/>',
    music:'<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    minimize:'<polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/>',
    volume:'<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>',
    layers:'<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
    file:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
    folder:'<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
    headphones:'<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>',
    sparkles:'<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/>',
    wand:'<path d="m3 21 9-9"/><path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/><path d="M17.8 11.8 19 13"/><path d="M15 9h.01"/><path d="M17.8 6.2 19 5"/><path d="M12.2 6.2 11 5"/>',
    droplet:'<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>',
    link2:'<path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 0 1 0 10h-2"/><line x1="8" y1="12" x2="16" y2="12"/>',
    qr:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><line x1="14" y1="14" x2="14" y2="17"/><line x1="18" y1="14" x2="21" y2="14"/><line x1="21" y1="17" x2="21" y2="21"/><line x1="14" y1="21" x2="18" y2="21"/>',
    chat:'<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    type:'<polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/>',
    code:'<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
    swatch:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    palette:'<circle cx="13.5" cy="6.5" r="1.2"/><circle cx="17" cy="10" r="1.2"/><circle cx="8" cy="6" r="1.2"/><circle cx="6" cy="11" r="1.2"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10a2 2 0 0 0 2-2c0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.2a1.5 1.5 0 0 1 1.5-1.5H16c3.3 0 6-2.7 6-6 0-4.4-4.5-8-10-8z"/>',
    contrast:'<circle cx="12" cy="12" r="9"/><path d="M12 3v18a9 9 0 0 0 0-18z"/>',
    gradient:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="m21 5-16 16"/><path d="m21 11-10 10"/><path d="m21 17-4 4"/>',
    braces:'<path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1"/><path d="M16 3h1a2 2 0 0 1 2 2v5a2 2 0 0 0 2 2 2 2 0 0 0-2 2v5a2 2 0 0 1-2 2h-1"/>',
    tags:'<path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1"/>',
    percent:'<line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
    clock:'<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    ruler:'<rect x="2" y="8" width="20" height="8" rx="1"/><line x1="6.5" y1="8" x2="6.5" y2="12"/><line x1="10" y1="8" x2="10" y2="11"/><line x1="13.5" y1="8" x2="13.5" y2="12"/><line x1="17" y1="8" x2="17" y2="11"/>',
    globe:'<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
    key:'<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="M15.5 7.5l3 3L22 7l-3-3"/>',
    pipette:'<path d="m2 22 1-1h3l9-9"/><path d="M3 21v-3l9-9"/><path d="m15 6 3.4-3.4a2.1 2.1 0 0 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z"/>',
    hash:'<line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/>',
    shadow:'<rect x="3" y="3" width="13" height="13" rx="2"/><path d="M21 8v11a2 2 0 0 1-2 2H8"/>',
    radius:'<path d="M21 21v-6a8 8 0 0 0-8-8H7"/><path d="M3 3v3"/><path d="M3 3h3"/>',
    minify:'<path d="M4 9V6a2 2 0 0 1 2-2h3"/><path d="M20 9V6a2 2 0 0 0-2-2h-3"/><path d="M4 15v3a2 2 0 0 0 2 2h3"/><path d="M20 15v3a2 2 0 0 1-2 2h-3"/><line x1="7" y1="12" x2="17" y2="12"/>',
    link:'<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    text:'<path d="M4 7V5h16v2"/><path d="M9 19h6"/><path d="M12 5v14"/>',
    star:'<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    ratio:'<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 4 20 16"/>',
    eraser:'<path d="m7 21-4.3-4.3a1 1 0 0 1 0-1.4L14 4a2 2 0 0 1 2.8 0l4.2 4.2a2 2 0 0 1 0 2.8L12 20"/><path d="M22 21H7"/><path d="m5 13 6 6"/>'
  };
  function svg(name) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + (IC[name] || '') + '</svg>'; }
  function esc(x) { return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  var CHEV = '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
  var CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

  /* ---------- favorites shared with the signed-in dashboard ---------- */
  var FAV_BASE_KEY = 'kolkli_favorites';
  function favSafeOwnerId(v) { return String(v || 'guest').toLowerCase().replace(/[^a-z0-9_.@-]+/g, '_') || 'guest'; }
  function favOwnerId() {
    var email = '';
    try {
      email = (localStorage.getItem('ac_session') || '').toLowerCase();
      if (email) {
        var users = JSON.parse(localStorage.getItem('ac_users') || '[]');
        if (Array.isArray(users)) {
          var u = users.find(function (x) { return (x.email || '').toLowerCase() === email; });
          if (u && (u.id || u.userId)) return favSafeOwnerId(u.id || u.userId);
        }
      }
    } catch (_) {}
    return favSafeOwnerId(email || 'guest');
  }
  function favKey() { return FAV_BASE_KEY + '::' + favOwnerId(); }
  function favCanonHref(h) { return String(h || '#').replace(/^(\.\.\/|\.\/)+/, ''); }
  function favSlug(v) { return encodeURIComponent(String(v || 'tool').toLowerCase()).replace(/%/g, '') || 'tool'; }
  function favToolId(t, href) { return favCanonHref(href) + '::' + favSlug(t.en || t.he || t.ru || href); }
  function favRead() {
    try {
      var a = JSON.parse(localStorage.getItem(favKey()) || '[]');
      return Array.isArray(a) ? a : [];
    } catch (_) { return []; }
  }
  function favWrite(a) {
    try {
      localStorage.setItem(favKey(), JSON.stringify(a || []));
      window.dispatchEvent(new CustomEvent('kolkli:favorites'));
    } catch (_) {}
  }
  function favIs(id) { return favRead().some(function (x) { return x && x.id === id; }); }
  function favPayload(t, href) {
    return {
      id: favToolId(t, href),
      href: favCanonHref(href),
      ic: t.ic || 'star',
      he: t.he || t.en || '',
      en: t.en || t.he || '',
      ru: t.ru || t.en || t.he || '',
      dhe: t.dhe || '',
      den: t.den || '',
      dru: t.dru || ''
    };
  }
  function favLabel(on) {
    if (lang === 'he') return on ? 'הסרה מהמועדפים' : 'הוספה למועדפים';
    if (lang === 'ru') return on ? 'Убрать из избранного' : 'Добавить в избранное';
    return on ? 'Remove from favorites' : 'Add to favorites';
  }
  function favBtn(t, href) {
    if (!href) return '';
    var item = favPayload(t, href);
    var on = favIs(item.id);
    return '<button class="fav-btn '+(on ? 'is-fav' : '')+'" type="button" data-fav-id="'+esc(item.id)+'" data-fav-payload="'+esc(JSON.stringify(item))+'" aria-pressed="'+(on ? 'true' : 'false')+'" title="'+esc(favLabel(on))+'" aria-label="'+esc(favLabel(on))+'">'+svg('star')+'</button>';
  }
  function favToggle(item) {
    if (!item || !item.id) return;
    var list = favRead();
    var idx = list.findIndex(function (x) { return x && x.id === item.id; });
    if (idx > -1) list.splice(idx, 1);
    else list.unshift(item);
    favWrite(list);
    favSyncButtons();
  }
  function favSyncButtons() {
    var ids = favRead().map(function (x) { return x && x.id; });
    document.querySelectorAll('[data-fav-id]').forEach(function (b) {
      var on = ids.indexOf(b.getAttribute('data-fav-id')) > -1;
      b.classList.toggle('is-fav', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.setAttribute('title', favLabel(on));
      b.setAttribute('aria-label', favLabel(on));
    });
  }
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-fav-id]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    var item = null;
    try { item = JSON.parse(btn.getAttribute('data-fav-payload') || '{}'); } catch (_) {}
    favToggle(item);
  });
  window.addEventListener('storage', function (e) {
    if (e.key && e.key.indexOf(FAV_BASE_KEY + '::') === 0) favSyncButtons();
  });

  /* ---------- category data (featured cards from header.js TOOLS, all-tools chips from index DATA.hubs) ---------- */
  var CATS = {
    dev: { i:'🎨', noFeat:true, cta:{ href:'../color-convert', he:'פתחו את ממיר הצבעים', en:'Open Color Converter', ru:'Открыть конвертер цвета' },
      he:['כלי עיצוב ופיתוח','ממירים, מחוללים ובודקים לצבע, CSS, קוד ו-SEO — הכול בדפדפן.'],
      en:['Design & Dev Tools','Converters, generators & checkers for color, CSS, code & SEO — all in your browser.'],
      ru:['Инструменты дизайна и кода','Конвертеры, генераторы и проверки для цвета, CSS, кода и SEO — прямо в браузере.'],
      feat:[
        {he:'ממיר צבעים',en:'Color Converter',ru:'Конвертер цвета',dhe:'HEX, RGB, HSL, CMYK',den:'HEX, RGB, HSL, CMYK',dru:'HEX, RGB, HSL, CMYK',ic:'swatch',page:'../color-convert'},
        {he:'מחולל פלטת צבעים',en:'Palette Generator',ru:'Генератор палитр',dhe:'פלטה מצבע או מתמונה',den:'From a color or image',dru:'Из цвета или картинки',ic:'palette',page:'../palette-generator'},
        {he:'בודק ניגודיות',en:'Contrast Checker',ru:'Проверка контраста',dhe:'קריאות טקסט על רקע',den:'Text vs. background',dru:'Текст на фоне',ic:'contrast',page:'../contrast-checker'},
        {he:'מחולל Gradient',en:'Gradient Generator',ru:'Генератор градиентов',dhe:'גרדיאנט + קוד CSS',den:'Gradient + CSS code',dru:'Градиент + CSS',ic:'gradient',page:'../gradient-generator'},
        {he:'JSON Formatter',en:'JSON Formatter',ru:'JSON-форматтер',dhe:'סידור ובדיקת JSON',den:'Prettify & validate',dru:'Форматирование JSON',ic:'braces',page:'../json-formatter'},
        {he:'מחולל Meta Tags',en:'Meta Tags Generator',ru:'Генератор Meta-тегов',dhe:'Title, OG ו-SEO',den:'Title, OG & SEO',dru:'Title, OG и SEO',ic:'tags',page:'../meta-tags'}
      ],
      all:[
        {ic:'swatch',he:'ממיר צבעים',en:'Color Converter',ru:'Конвертер цвета',dhe:'HEX, RGB, HSL, CMYK',den:'HEX, RGB, HSL, CMYK',dru:'HEX, RGB, HSL, CMYK',s:'live',href:'../color-convert'},
        {ic:'palette',he:'פלטת צבעים',en:'Palette Generator',ru:'Генератор палитр',dhe:'פלטה מצבע או מתמונה',den:'From a color or image',dru:'Из цвета или картинки',s:'live',href:'../palette-generator'},
        {ic:'contrast',he:'בודק ניגודיות',en:'Contrast Checker',ru:'Проверка контраста',dhe:'קריאות טקסט על רקע',den:'Text vs. background',dru:'Текст на фоне',s:'live',href:'../contrast-checker'},
        {ic:'gradient',he:'מחולל Gradient',en:'CSS Gradient',ru:'Градиент',dhe:'גרדיאנט + קוד CSS',den:'Gradient + CSS code',dru:'Градиент + CSS',s:'live',href:'../gradient-generator'},
        {ic:'shadow',he:'Box Shadow',en:'Box Shadow',ru:'Box Shadow',dhe:'צל תיבה + קוד CSS',den:'Box shadow + CSS',dru:'Тень блока + CSS',s:'live',href:'../box-shadow'},
        {ic:'radius',he:'Border Radius',en:'Border Radius',ru:'Border Radius',dhe:'פינות מעוגלות + CSS',den:'Rounded corners + CSS',dru:'Скругления + CSS',s:'live',href:'../border-radius'},
        {ic:'image',he:'תמונה ל-Base64',en:'Image to Base64',ru:'Изображение в Base64',dhe:'הטמעת תמונה בקוד',den:'Inline an image in code',dru:'Картинка прямо в коде',s:'live',href:'../image-to-base64'},
        {ic:'minify',he:'כיווץ CSS/JS',en:'Minify CSS/JS',ru:'Минификация',dhe:'הקטנת קבצי קוד',den:'Shrink code files',dru:'Уменьшить файлы кода',s:'live',href:'../minify'},
        {ic:'braces',he:'JSON Formatter',en:'JSON Formatter',ru:'JSON-форматтер',dhe:'סידור ובדיקת JSON',den:'Prettify & validate',dru:'Форматирование JSON',s:'live',href:'../json-formatter'},
        {ic:'link',he:'URL Encoder/Decoder',en:'URL Encoder/Decoder',ru:'URL-кодировщик',dhe:'קידוד ופענוח כתובות',den:'Encode & decode URLs',dru:'Кодирование URL',s:'live',href:'../url-encode'},
        {ic:'tags',he:'מחולל Meta Tags',en:'Meta Tags',ru:'Meta-теги',dhe:'Title, OG ו-SEO',den:'Title, OG & SEO',dru:'Title, OG и SEO',s:'live',href:'../meta-tags'},
        {ic:'text',he:'בודק אורך Meta',en:'Meta Length',ru:'Длина Meta',dhe:'אורך Title ותיאור',den:'Title & description length',dru:'Длина Title и описания',s:'live',href:'../meta-length'},
        {ic:'star',he:'מחולל Favicon',en:'Favicon',ru:'Favicon',dhe:'אייקון לאתר בכל הגדלים',den:'Site icon, all sizes',dru:'Иконка сайта всех размеров',s:'live',href:'../favicon-generator'},
        {ic:'code',he:'מחולל Embed',en:'Embed Code',ru:'Код встраивания',dhe:'קוד הטמעה לאתר',den:'Embed code for your site',dru:'Код для встраивания',s:'live',href:'../embed-code'},
        {ic:'ruler',he:'ממיר מידות מסך',en:'Screen Units',ru:'Единицы экрана',dhe:'px, rem, em ו-%',den:'px, rem, em & %',dru:'px, rem, em и %',s:'live',href:'../screen-units'},
        {ic:'ratio',he:'יחס תמונה',en:'Aspect Ratio',ru:'Соотношение сторон',dhe:'חישוב יחס גובה-רוחב',den:'Aspect ratio calculator',dru:'Расчёт соотношения сторон',s:'live',href:'../aspect-ratio'},
        {ic:'crop',he:'מחולל Placeholder',en:'Placeholder',ru:'Заглушка',dhe:'תמונות ממלא מקום',den:'Placeholder images',dru:'Изображения-заглушки',s:'live',href:'../placeholder-generator'},
        {ic:'eraser',he:'מנקה HTML',en:'HTML Cleaner',ru:'Очистка HTML',dhe:'ניקוי קוד מיותר',den:'Strip messy HTML',dru:'Очистка лишнего HTML',s:'live',href:'../html-cleaner'}
      ]},
    audio: { i:'🎵', cta:{ href:'../app', he:'פתחו את העורך', en:'Open the Editor', ru:'Открыть редактор' },
      he:['אודיו','חתכו, נרמלו, המירו ועשו מאסטרינג — הכול בדפדפן.'],
      en:['Audio','Cut, normalize, convert & master — all in your browser.'],
      ru:['Аудио','Обрезка, нормализация, конвертация и мастеринг — всё в браузере.'],
      feat:[
        {he:'חותך אודיו',en:'Audio Cutter',ru:'Обрезка аудио',dhe:'חיתוך וקיצוץ MP3',den:'Trim & cut MP3',dru:'Обрезка и нарезка MP3',ic:'scissors',page:'../app'},
        {he:'המרת אודיו',en:'Convert Audio',ru:'Конвертация аудио',dhe:'MP3, WAV, FLAC ועוד',den:'MP3, WAV, FLAC…',dru:'MP3, WAV, FLAC…',ic:'refresh',page:'../convert'},
        {he:'מיזוג אודיו',en:'Merge Audio',ru:'Объединение аудио',dhe:'איחוד רצועות לקובץ',den:'Join tracks into one',dru:'Склейка треков в один',ic:'merge',page:'../merge-audio'},
        {he:'נורמליזציית עוצמה',en:'Loudness Normalize',ru:'Нормализация громкости',dhe:'יישור כל השירים לעוצמה אחת (LUFS)',den:'Level every track to one loudness (LUFS)',dru:'Единая громкость всех треков (LUFS)',ic:'sliders',page:'../normalize-audio'},
        {he:'BPM וסולם',en:'BPM & Key',ru:'BPM и тональность',dhe:'זיהוי קצב וסולם',den:'Detect tempo & key',dru:'Определение темпа и тональности',ic:'pulse',page:'../app'},
        {he:'ניקוי אודיו AI',en:'AI Audio Cleanup',ru:'AI-очистка аудио',dhe:'הסרת רעש ושיפור קול',den:'Remove noise, enhance voice',dru:'Убрать шум, улучшить голос',ic:'sparkle',page:'../ai-audio-cleanup'}
      ],
      all:[
        {he:'חותך',en:'Cutter',ru:'Обрезка',s:'live',href:'../app'},{he:'מיזוג',en:'Merge',ru:'Объединение',s:'live',href:'../merge-audio'},
        {he:'נרמול עוצמה',en:'Normalize',ru:'Нормализация',s:'live',href:'../normalize-audio'},{he:'ווליום',en:'Volume',ru:'Громкость',s:'live',href:'../app'},
        {he:'המרה',en:'Convert',ru:'Конвертация',s:'live',href:'../convert'},{he:'Fade In/Out',en:'Fade In/Out',ru:'Затухание',s:'live',href:'../fade-audio'},
        {he:'הסרת שקט',en:'Trim Silence',ru:'Убрать тишину',s:'live',href:'../trim-silence'},{he:'רינגטון',en:'Ringtone',ru:'Рингтон',s:'live',href:'../ringtone'},
        {he:'זיהוי BPM',en:'BPM Detector',ru:'Определение BPM',s:'live',href:'../app'},{he:'זיהוי סולם',en:'Key Detector',ru:'Определение тональности',s:'live',href:'../app'},
        {he:'הסרת ווקאל',en:'Vocal Remover',ru:'Удаление вокала',s:'live',href:'../vocal-remover'},
        {he:'מאסטרינג AI',en:'AI Mastering',ru:'AI-мастеринг',s:'live',href:'../ai-master'},
        {he:'ניקוי אודיו AI',en:'AI Cleanup',ru:'AI-очистка',s:'live',href:'../ai-audio-cleanup'}
      ]},
    images: { i:'🖼️',
      he:['תמונות','שנו גודל, חתכו, המירו ודחסו תמונות.'],
      en:['Images','Resize, crop, convert and compress images.'],
      ru:['Изображения','Изменяйте размер, обрезайте, конвертируйте и сжимайте изображения.'],
      feat:[
        {he:'שינוי גודל',en:'Resize Image',ru:'Изменение размера',dhe:'שינוי מידות מהיר',den:'Change dimensions',dru:'Изменить размеры',ic:'maximize',page:'../resize-image'},
        {he:'חיתוך תמונה',en:'Crop Image',ru:'Обрезка изображения',dhe:'חיתוך ויישור',den:'Crop & straighten',dru:'Обрезка и выравнивание',ic:'crop',page:'../crop-image'},
        {he:'סימן מים',en:'Watermark',ru:'Водяной знак',dhe:'טקסט או לוגו על התמונה',den:'Add text or a logo',dru:'Текст или логотип на фото',ic:'droplet',page:'../watermark'},
        {he:'הסרת רקע',en:'Remove Background',ru:'Удаление фона',dhe:'הסרה בקליק אחד',den:'One-click cutout',dru:'Вырезка в один клик',ic:'sparkle',page:'../remove-bg'},
        {he:'שחזור תמונה AI',en:'AI Photo Restore',ru:'AI-восстановление фото',dhe:'שיפור תמונות ישנות',den:'Revive old photos',dru:'Оживите старые фото',ic:'sparkles',page:'../restore-image'},
        {he:'HEIC ל-JPG',en:'HEIC to JPG',ru:'HEIC в JPG',dhe:'המרת תמונות אייפון',den:'Convert iPhone photos',dru:'Конвертация фото с iPhone',ic:'image',page:'../heic-to-jpg'},
        {he:'הסרת אובייקטים AI',en:'AI Object Remover',ru:'AI-удаление объектов',dhe:'מחקו כל דבר מהתמונה',den:'Erase anything from a photo',dru:'Сотрите что угодно с фото',ic:'wand',page:'../ai-object-remover'}
      ],
      all:[
        {he:'שינוי גודל',en:'Resize',ru:'Размер',s:'live',href:'../resize-image'},{he:'חיתוך',en:'Crop',ru:'Обрезка',s:'live',href:'../crop-image'},{he:'חיתוך חכם AI',en:'AI Smart Crop',ru:'AI-умная обрезка',s:'live',href:'../ai-smart-crop'},
        {he:'סיבוב',en:'Rotate',ru:'Поворот',s:'soon'},{he:'הסרת רקע',en:'Remove BG',ru:'Удалить фон',s:'live',href:'../remove-bg'},
        {he:'דחיסה',en:'Compress',ru:'Сжатие',s:'soon'},{he:'המרה',en:'Convert',ru:'Конвертация',s:'live',href:'../image-convert'},
        {he:'סימן מים',en:'Watermark',ru:'Водяной знак',s:'live',href:'../watermark'},{he:'שיפור AI',en:'AI Enhance',ru:'AI-улучшение',s:'soon'},
        {he:'שחזור AI',en:'AI Restore',ru:'AI-восстановление',s:'live',href:'../restore-image'},{he:'הרחבה AI',en:'AI Expand',ru:'AI-расширение',s:'soon'},
        {he:'הסרת אובייקטים',en:'Remove Object',ru:'Удалить объект',s:'live',href:'../ai-object-remover'}
      ]},
    video: { i:'🎬', cta:{ href:'../video-cut', he:'פתחו את חותך הווידאו', en:'Open Video Cutter', ru:'Открыть видеорезак' },
      he:['וידאו','חתכו, המירו, דחסו וחלצו אודיו.'],
      en:['Video','Trim, convert, compress and extract audio.'],
      ru:['Видео','Обрезайте, конвертируйте, сжимайте и извлекайте звук.'],
      feat:[
        {he:'חותך וידאו',en:'Video Cutter',ru:'Обрезка видео',dhe:'חיתוך קטעים במהירות',den:'Trim clips fast',dru:'Быстрая нарезка клипов',ic:'scissors',page:'../video-cut'},
        {he:'MP4 ל-MP3',en:'MP4 to MP3',ru:'MP4 в MP3',dhe:'חילוץ פס הקול',den:'Extract the audio',dru:'Извлечь звук',ic:'music',page:'../mp4-to-mp3'},
        {he:'דחיסת וידאו',en:'Compress Video',ru:'Сжатие видео',dhe:'הקטנת נפח הקובץ',den:'Shrink file size',dru:'Уменьшить размер файла',ic:'minimize',page:'../compress-video'},
        {he:'חילוץ אודיו',en:'Extract Audio',ru:'Извлечь аудио',dhe:'שמירת הסאונד בלבד',den:'Pull the soundtrack',dru:'Сохранить звуковую дорожку',ic:'volume',page:'../extract-audio'}
      ],
      all:[
        {he:'חיתוך',en:'Trim',ru:'Обрезка',s:'live',href:'../video-cut'},{he:'דחיסה',en:'Compress',ru:'Сжатие',s:'live',href:'../compress-video'},
        {he:'המרה',en:'Convert',ru:'Конвертация',s:'live',href:'../video-convert'},{he:'חילוץ אודיו',en:'Extract Audio',ru:'Извлечь звук',s:'live',href:'../extract-audio'},
        {he:'השתקה',en:'Mute',ru:'Без звука',s:'soon'},{he:'שינוי גודל',en:'Resize',ru:'Размер',s:'soon'},
        {he:'יצירת שורטס',en:'Shorts Maker',ru:'Создание Shorts',s:'soon'},{he:'כתוביות AI',en:'AI Subtitle',ru:'AI-субтитры',s:'live',href:'../subtitle-generator'},{he:'שדרוג AI',en:'AI Upscale',ru:'AI-апскейл',s:'soon'}
      ]},
    documents: { i:'📄', cta:{ href:'../files', he:'לסידור הקבצים', en:'Organize Files', ru:'Упорядочить файлы' },
      he:['מסמכים','כלי PDF, OCR ובחירת קבצים.'],
      en:['Documents','PDF tools, OCR and file organizing.'],
      ru:['Документы','Инструменты PDF, OCR и упорядочивание файлов.'],
      feat:[
        {he:'מיזוג PDF',en:'Merge PDF',ru:'Объединить PDF',dhe:'איחוד קבצי PDF',den:'Combine PDFs',dru:'Склейка PDF-файлов',ic:'layers',page:'../merge-pdf'},
        {he:'דחיסת PDF',en:'Compress PDF',ru:'Сжать PDF',dhe:'הקטנת נפח PDF',den:'Reduce PDF size',dru:'Уменьшить размер PDF',ic:'minimize',page:'../compress-pdf'},
        {he:'PDF ל-JPG',en:'PDF to JPG',ru:'PDF в JPG',dhe:'המרת עמודים לתמונות',den:'Pages to images',dru:'Страницы в изображения',ic:'image',page:'../pdf-to-jpg'},
        {he:'DOC ל-PDF',en:'DOC to PDF',ru:'DOC в PDF',dhe:'המרת Word ל-PDF',den:'Word to PDF',dru:'Word в PDF',ic:'file',page:'../doc-to-pdf'},
        {he:'בחירת קבצים',en:'Organize Files',ru:'Упорядочить файлы',dhe:'מיון ושינוי שמות',den:'Sort & rename',dru:'Сортировка и переименование',ic:'folder',page:'../files'}
      ],
      all:[
        {he:'מיזוג PDF',en:'Merge PDF',ru:'Объединить PDF',s:'live',href:'../merge-pdf'},{he:'פיצול PDF',en:'Split PDF',ru:'Разделить PDF',s:'soon'},
        {he:'דחיסת PDF',en:'Compress PDF',ru:'Сжать PDF',s:'live',href:'../compress-pdf'},{he:'PDF ל-JPG',en:'PDF to JPG',ru:'PDF в JPG',s:'live',href:'../pdf-to-jpg'},{he:'OCR',en:'OCR',ru:'OCR',s:'soon'},
        {he:'חתימת PDF',en:'Sign PDF',ru:'Подпись PDF',s:'soon'},{he:'הגנת PDF',en:'Protect PDF',ru:'Защита PDF',s:'soon'},
        {he:'DOC ל-PDF',en:'DOC to PDF',ru:'DOC в PDF',s:'live',href:'../doc-to-pdf'},{he:'PDF ל-Word',en:'PDF to Word',ru:'PDF в Word',s:'soon'},
        {he:'בחירת קבצים',en:'Organize',ru:'Упорядочить',s:'live',href:'../files'}
      ]},
    converters: { i:'🔄',
      he:['ממירים','המירו בין מאות פורמטים של קבצים.'],
      en:['Converters','Convert between hundreds of file formats.'],
      ru:['Конвертеры','Конвертируйте между сотнями форматов файлов.'],
      feat:[
        {he:'ממיר אודיו',en:'Audio Converter',ru:'Аудиоконвертер',dhe:'כל פורמט אודיו',den:'Any audio format',dru:'Любой аудиоформат',ic:'headphones',page:'../convert'},
        {he:'ממיר וידאו',en:'Video Converter',ru:'Видеоконвертер',dhe:'כל פורמט וידאו',den:'Any video format',dru:'Любой видеоформат',ic:'film',page:'../video-convert'},
        {he:'ממיר תמונות',en:'Image Converter',ru:'Конвертер изображений',dhe:'PNG, JPG, WebP ועוד',den:'PNG, JPG, WebP…',dru:'PNG, JPG, WebP…',ic:'image',page:'../image-convert'},
        {he:'ממיר מסמכים',en:'Document Converter',ru:'Конвертер документов',dhe:'מסמכים וגיליונות',den:'Docs & sheets',dru:'Документы и таблицы',ic:'file',page:'../doc-convert'}
      ],
      all:[
        {he:'אודיו',en:'Audio',ru:'Аудио',s:'live',href:'../convert'},{he:'וידאו',en:'Video',ru:'Видео',s:'live',href:'../video-convert'},
        {he:'תמונות',en:'Images',ru:'Изображения',s:'live',href:'../image-convert'},{he:'מסמכים',en:'Documents',ru:'Документы',s:'live',href:'../doc-convert'},
        {he:'ארכיונים',en:'Archives',ru:'Архивы',s:'live',href:'../archive-convert'},{he:'גופנים',en:'Fonts',ru:'Шрифты',s:'live',href:'../font-convert'},{he:'ספרים',en:'Ebooks',ru:'Электронные книги',s:'live',href:'../ebook-convert'},
        {he:'גיליונות',en:'Spreadsheet',ru:'Таблицы',s:'live',href:'../spreadsheet-convert'},{he:'מצגות',en:'Presentation',ru:'Презентации',s:'live',href:'../presentation-convert'}
      ]},
    compress: { i:'📦',
      he:['דחיסה','הקטינו כל סוג קובץ ושמרו על מקום.'],
      en:['Compress','Shrink any file type and save space.'],
      ru:['Сжатие','Уменьшайте любые файлы и экономьте место.'],
      feat:[
        {he:'דחיסת וידאו',en:'Compress Video',ru:'Сжать видео',dhe:'וידאו קטן יותר',den:'Smaller videos',dru:'Уменьшить видео',ic:'film',page:'../compress-video'},
        {he:'דחיסת PDF',en:'Compress PDF',ru:'Сжать PDF',dhe:'PDF קטן יותר',den:'Smaller PDFs',dru:'Уменьшить PDF',ic:'file',page:'../compress-pdf'},
        {he:'דחיסת תמונה',en:'Compress Image',ru:'Сжать изображение',dhe:'תמונות קטנות יותר',den:'Smaller images',dru:'Уменьшить изображения',ic:'image',page:'../compress-image'},
        {he:'דחיסת אודיו',en:'Compress Audio',ru:'Сжать аудио',dhe:'אודיו קטן יותר',den:'Smaller audio',dru:'Уменьшить аудио',ic:'music',page:'../compress-audio'}
      ],
      all:[
        {he:'דחיסת וידאו',en:'Compress Video',ru:'Сжать видео',s:'live',href:'../compress-video'},{he:'דחיסת תמונה',en:'Compress Image',ru:'Сжать изображение',s:'live',href:'../compress-image'},
        {he:'דחיסת PDF',en:'Compress PDF',ru:'Сжать PDF',s:'live',href:'../compress-pdf'},{he:'דחיסת אודיו',en:'Compress Audio',ru:'Сжать аудио',s:'live',href:'../compress-audio'},
        {he:'דחיסת ZIP',en:'Compress ZIP',ru:'Сжать ZIP',s:'live',href:'../compress-zip'}
      ]},
    marketing: { i:'📣',
      he:['שיווק וקישורים','בנו קישורים, קודי QR, קופי וקודי הטמעה — הכול בדפדפן.'],
      en:['Marketing & Links','Build links, QR codes, copy and embed codes — all in your browser.'],
      ru:['Маркетинг и ссылки','Создавайте ссылки, QR-коды, тексты и коды вставки — всё в браузере.'],
      feat:[
        {he:'בונה קישורי UTM',en:'UTM Builder',ru:'UTM-конструктор',dhe:'קישורים מסודרים לקמפיינים',den:'Tidy links for campaigns',dru:'Аккуратные ссылки для кампаний',ic:'link2',page:'../utm-builder'},
        {he:'מחולל QR Code',en:'QR Code Generator',ru:'Генератор QR-кодов',dhe:'QR לקישור, וואטסאפ או קובץ',den:'QR for a link, WhatsApp or file',dru:'QR для ссылки, WhatsApp или файла',ic:'qr',page:'../qr-generator'},
        {he:'קישור וואטסאפ',en:'WhatsApp Link',ru:'Ссылка WhatsApp',dhe:'קישור עם הודעה מוכנה',den:'A link with a ready message',dru:'Ссылка с готовым сообщением',ic:'chat',page:'../whatsapp-link'},
        {he:'מחולל קופי קצר',en:'Copy Generator',ru:'Генератор текстов',dhe:'וריאציות לכותרות ומודעות',den:'Variations for headlines and ads',dru:'Варианты заголовков и объявлений',ic:'type',page:'../copy-generator'},
        {he:'קוד הטמעה',en:'Embed Code',ru:'Код вставки',dhe:'iframe לסרטון, מפה או טופס',den:'iframe for a video, map or form',dru:'iframe для видео, карты или формы',ic:'code',page:'../embed-code'}
      ],
      all:[
        {he:'בונה UTM',en:'UTM Builder',ru:'UTM-конструктор',s:'live',href:'../utm-builder'},
        {he:'מחולל QR',en:'QR Code',ru:'QR-код',s:'live',href:'../qr-generator'},
        {he:'קישור וואטסאפ',en:'WhatsApp Link',ru:'Ссылка WhatsApp',s:'live',href:'../whatsapp-link'},
        {he:'קישור Mailto',en:'Mailto Link',ru:'Mailto-ссылка',s:'live',href:'../mailto-link'},
        {he:'אורך מודעה',en:'Ad Length',ru:'Длина объявления',s:'live',href:'../ad-text-checker'},
        {he:'מחולל CTA',en:'CTA Generator',ru:'CTA-генератор',s:'live',href:'../cta-generator'},
        {he:'מחולל קופי',en:'Copy Generator',ru:'Генератор текстов',s:'live',href:'../copy-generator'},
        {he:'תצוגת קישור',en:'Link Preview',ru:'Превью ссылки',s:'live',href:'../link-preview'},
        {he:'קוד הטמעה',en:'Embed Code',ru:'Код вставки',s:'live',href:'../embed-code'},
        {he:'מחולל Redirect',en:'Redirect',ru:'Редирект',s:'live',href:'../redirect-generator'}
      ]},
    calc: { i:'🧮',
      he:['חישובים והמרות','מחשבונים וממירים לעבודה יומיומית — אחוזים, שעות, יחידות, אזורי זמן, צבע ועוד.'],
      en:['Calculators & Converters','Everyday calculators and converters — percent, hours, units, time zones, color & more.'],
      ru:['Калькуляторы и конвертеры','Повседневные калькуляторы и конвертеры — проценты, часы, единицы, пояса, цвет и другое.'],
      feat:[
        {he:'מחשבון אחוזים',en:'Percentage Calculator',ru:'Калькулятор процентов',dhe:'הנחה, מע״מ, תוספת וטיפ',den:'Discount, VAT, markup & tips',dru:'Скидка, НДС, наценка, чаевые',ic:'percent',page:'../percent-calculator'},
        {he:'מחשבון שעות עבודה',en:'Work Hours Calculator',ru:'Калькулятор рабочих часов',dhe:'משך בין שעות וסיכום',den:'Duration between times & totals',dru:'Длительность и суммы часов',ic:'clock',page:'../work-hours-calculator'},
        {he:'ממיר יחידות',en:'Unit Converter',ru:'Конвертер единиц',dhe:'משקל, אורך, נפח ועוד',den:'Weight, length, volume & more',dru:'Вес, длина, объём и другое',ic:'ruler',page:'../unit-converter'},
        {he:'ממיר אזורי זמן',en:'Time Zone Converter',ru:'Конвертер часовых поясов',dhe:'תיאום שיחות עם חו״ל',den:'Coordinate calls abroad',dru:'Согласование звонков за рубежом',ic:'globe',page:'../timezone-converter'},
        {he:'מחולל סיסמאות',en:'Password Generator',ru:'Генератор паролей',dhe:'סיסמאות חזקות ואקראיות',den:'Strong random passwords',dru:'Надёжные случайные пароли',ic:'key',page:'../password-generator'},
        {he:'מחולל שמות קבצים',en:'File Name Generator',ru:'Генератор имён файлов',dhe:'לפי תבנית, תאריך ומספר רץ',den:'By template, date & number',dru:'По шаблону, дате и номеру',ic:'tags',page:'../filename-generator'},
        {he:'מחולל קוד צבע',en:'Color Code Generator',ru:'Генератор кода цвета',dhe:'HEX, RGB ו-HSL',den:'HEX, RGB and HSL',dru:'HEX, RGB и HSL',ic:'swatch',page:'../color-code-generator'},
        {he:'בחירת צבעים מתמונה',en:'Image Color Picker',ru:'Пипетка цвета',dhe:'חילוץ פלטה מתמונה',den:'Extract a palette from an image',dru:'Палитра из изображения',ic:'pipette',page:'../image-color-picker'},
        {he:'מחולל Lorem Ipsum',en:'Lorem Ipsum Generator',ru:'Генератор Lorem Ipsum',dhe:'טקסט דמה לעיצוב',den:'Placeholder text for design',dru:'Текст-заполнитель для дизайна',ic:'type',page:'../lorem-ipsum-generator'},
        {he:'מחולל UUID',en:'UUID Generator',ru:'Генератор UUID',dhe:'מזהים למפתחים ומערכות',den:'IDs for developers & systems',dru:'ID для систем',ic:'hash',page:'../uuid-generator'}
      ],
      all:[
        {he:'מחשבון אחוזים',en:'Percentages',ru:'Проценты',s:'live',href:'../percent-calculator'},
        {he:'שעות עבודה',en:'Work Hours',ru:'Рабочие часы',s:'live',href:'../work-hours-calculator'},
        {he:'ממיר יחידות',en:'Units',ru:'Единицы',s:'live',href:'../unit-converter'},
        {he:'אזורי זמן',en:'Time Zones',ru:'Часовые пояса',s:'live',href:'../timezone-converter'},
        {he:'סיסמאות',en:'Passwords',ru:'Пароли',s:'live',href:'../password-generator'},
        {he:'שמות קבצים',en:'File Names',ru:'Имена файлов',s:'live',href:'../filename-generator'},
        {he:'קוד צבע',en:'Color Code',ru:'Код цвета',s:'live',href:'../color-code-generator'},
        {he:'צבע מתמונה',en:'Image Color',ru:'Цвет из фото',s:'live',href:'../image-color-picker'},
        {he:'Lorem Ipsum',en:'Lorem Ipsum',ru:'Lorem Ipsum',s:'live',href:'../lorem-ipsum-generator'},
        {he:'UUID',en:'UUID',ru:'UUID',s:'live',href:'../uuid-generator'}
      ]}
  };

  /* ---------- AI / pricing / faq data (from index.html DATA) ---------- */
  var AI = [
    {i:'🎬',he:'יצירת סרטון שיווקי AI',en:'AI Marketing Video',ru:'AI-промо-видео',dhe:'הופך תמונות וטקסט לסרטון שיווקי ממותג.',den:'Turns photos and text into a branded promo video.',dru:'Превращает фото и текст в брендированное промо-видео.',href:'../ai-marketing-video'},{i:'🪄',he:'הסרת רקע AI',en:'AI Remove Background',ru:'AI-удаление фона',dhe:'מסיר רקע מתמונות בלחיצה, עם קצוות נקיים.',den:'Removes image backgrounds in one click with clean edges.',dru:'Удаляет фон с изображений в один клик с чистыми краями.',href:'../remove-bg'},{i:'🎧',he:'ניקוי אודיו AI',en:'AI Audio Cleaner',ru:'AI-очистка звука',dhe:'מסיר רעשי רקע והדים מכל הקלטה.',den:'Strips background noise and echo from any recording.',dru:'Убирает фоновый шум и эхо из любой записи.',href:'../ai-audio-cleanup'},
    {i:'💬',he:'יצירת כתוביות AI',en:'AI Subtitle Generator',ru:'AI-генератор субтитров',dhe:'מתמלל וידאו ואודיו לכתוביות מסונכרנות.',den:'Transcribes video and audio into synced subtitles.',dru:'Транскрибирует видео и аудио в синхронные субтитры.',href:'../subtitle-generator'},{i:'🖼️',he:'חיתוך חכם AI',en:'AI Smart Crop',ru:'AI-умная обрезка',dhe:'ממקד את הנושא וחותך אוטומטית לכל יחס.',den:'Finds the subject and auto-crops to any ratio.',dru:'Находит объект и автоматически кадрирует под любое соотношение.',href:'../ai-smart-crop'},
    {i:'🩹',he:'שחזור תמונה AI',en:'AI Restore Photo',ru:'AI-восстановление фото',dhe:'משפר תמונות ישנות ומטושטשות לרזולוציה גבוהה.',den:'Restores old, blurry photos to crisp high-res.',dru:'Восстанавливает старые размытые фото до высокого разрешения.',href:'../restore-image'},{i:'🎚️',he:'מאסטרינג AI',en:'AI Master Audio',ru:'AI-мастеринг аудио',dhe:'מאזן ומחזק את המיקס לסאונד מקצועי.',den:'Balances and boosts your mix to a pro sound.',dru:'Балансирует и усиливает микс до профессионального звучания.',href:'../ai-master'},
    {i:'🧽',he:'הסרת אובייקטים AI',en:'AI Remove Objects',ru:'AI-удаление объектов',dhe:'מוחק עצמים לא רצויים מהתמונה בלי עקבות.',den:'Erases unwanted objects from photos seamlessly.',dru:'Удаляет ненужные объекты с фото без следов.',href:'../ai-object-remover'},{i:'📝',he:'סיכום PDF AI',en:'AI Summarize PDF',ru:'AI-конспект PDF',dhe:'מפיק תקציר ונקודות מפתח מכל מסמך.',den:'Extracts a summary and key points from any document.',dru:'Извлекает краткое содержание и ключевые пункты из документа.',href:'../ai-summarize-pdf'}
  ];
  // usd = base price (source of truth); ils = hand-set shekel price point.
  // Every other currency is derived from usd by currency.js. `price` stays as a
  // per-language fallback for when currency.js isn't present.
  var PLANS = [
    {usd:0, ils:0, price:{he:'₪0',en:'$0',ru:'$0'}, he:['חינם','להתחלה מהירה'], en:['Free','To get started'], ru:['Бесплатно','Для быстрого старта'], cta:{he:'התחילו',en:'Get Started',ru:'Начать'}, feats:[
      {he:'עד 3 פרויקטים פעילים',en:'Up to 3 active projects',ru:'До 3 активных проектов'},{he:'עד 3GB אחסון והעברה',en:'Up to 3GB storage & transfer',ru:'До 3 ГБ хранилища и передачи'},
      {he:'קבצים נשמרים 7 ימים',en:'Files kept for 7 days',ru:'Файлы хранятся 7 дней'},{he:'ארגון · בקשה · משוב — 2 ביום',en:'Organize · request · review — 2/day',ru:'Организация · запрос · ревью — 2/день'},
      {he:'כלי PDF בסיסיים',en:'Basic PDF tools',ru:'Базовые PDF-инструменты'}]},
    {usd:24, ils:89, price:{he:'₪89',en:'$24',ru:'$24'}, pop:true, he:['Creator','ליוצרים ופרילנסרים'], en:['Creator','For creators & freelancers'], ru:['Creator','Для авторов и фрилансеров'], cta:{he:'בחרו Creator',en:'Get Creator',ru:'Выбрать Creator'}, feats:[
      {he:'100 פרויקטים · 500 קבצים לכל אחד',en:'100 projects · 500 files each',ru:'100 проектов · 500 файлов в каждом'},{he:'250GB אחסון · עד 25GB בהעברה',en:'250GB storage · up to 25GB/transfer',ru:'250 ГБ · до 25 ГБ за передачу'},
      {he:'קבצים נשמרים 90 יום',en:'Files kept for 90 days',ru:'Файлы хранятся 90 дней'},{he:'כל הכלים + Review Studio',en:'All tools + Review Studio',ru:'Все инструменты + Review Studio'},
      {he:'מיתוג אישי וקישורים ממותגים',en:'Custom branding & branded links',ru:'Свой брендинг и фирменные ссылки'},{he:'עד 10 פעולות AI ביום',en:'Up to 10 AI actions/day',ru:'До 10 AI-операций в день'},
      {he:'עד 2 חברי צוות',en:'Up to 2 team members',ru:'До 2 участников'}]},
    {usd:69, ils:249, price:{he:'₪249',en:'$69',ru:'$69'}, he:['Studio','לסטודיו וצוותים'], en:['Studio','For studios & teams'], ru:['Studio','Для студий и команд'], cta:{he:'בחרו Studio',en:'Get Studio',ru:'Выбрать Studio'}, feats:[
      {he:'500 פרויקטים · 2,000 קבצים לכל אחד',en:'500 projects · 2,000 files each',ru:'500 проектов · 2 000 файлов в каждом'},{he:'1TB אחסון · עד 100GB בהעברה',en:'1TB storage · up to 100GB/transfer',ru:'1 ТБ · до 100 ГБ за передачу'},
      {he:'שמירת קבצים עד שנה',en:'Files kept up to 1 year',ru:'Файлы хранятся до года'},{he:'White-label מלא + דומיין אישי',en:'Full white-label + custom domain',ru:'Полный white-label + свой домен'},
      {he:'עד 10 משתמשי צוות והרשאות',en:'Up to 10 team members & roles',ru:'До 10 участников и роли'},{he:'אוטומציות מייל ודוחות שימוש',en:'Email automations & usage reports',ru:'Email-автоматизация и отчёты'},
      {he:'אבטחה: 2FA ויומן פעילות',en:'Security: 2FA & activity log',ru:'Безопасность: 2FA и журнал'}]}
  ];
  // Paid add-ons — attachable to any plan. Marketing/demo only (no live billing).
  var ADDONS = [
    {i:'💾', he:['נפח אחסון נוסף','עוד אחסון בענן ככל שאתם גדלים'], en:['Extra storage','More cloud storage as you grow'], ru:['Доп. хранилище','Больше места в облаке по мере роста']},
    {i:'⏳', he:['הארכת שמירת קבצים','שמירת קבצי פרויקט לזמן ארוך יותר'], en:['Extended retention','Keep project files for longer'], ru:['Продление хранения','Храните файлы проекта дольше']},
    {i:'👥', he:['משתמשי צוות נוספים','הוספת חברים מעבר למסלול'], en:['Extra team seats','Add members beyond your plan'], ru:['Доп. места в команде','Добавьте участников сверх тарифа']},
    {i:'🌐', he:['דומיין מותאם אישית','קישורי שיתוף תחת הכתובת שלכם'], en:['Custom domain','Share links on your own domain'], ru:['Свой домен','Ссылки на вашем домене']},
    {i:'🏷️', he:['White-Label מלא','הסתרת מיתוג KOLKLI לחלוטין'], en:['Full white-label','Hide KOLKLI branding entirely'], ru:['Полный white-label','Скрыть брендинг KOLKLI полностью']},
    {i:'🤖', he:['חבילת פעולות AI','מכסה נוספת לסיכום, תרגום ו-OCR'], en:['AI actions pack','Top up summarize, translate & OCR'], ru:['Пакет AI-операций','Больше конспектов, перевода и OCR']},
    {i:'✍️', he:['חבילת חתימות דיגיטליות','נפח חתימות אלקטרוניות נוסף'], en:['Digital signatures','Extra e-signature volume'], ru:['Электронные подписи','Больше объёма подписей']},
    {i:'🔤', he:['חבילת OCR נוספת','זיהוי טקסט למסמכים סרוקים'], en:['Extra OCR pack','More scanned-document recognition'], ru:['Доп. пакет OCR','Больше распознавания сканов']},
    {i:'📦', he:['שליחות גדולות במיוחד','העברות חד-פעמיות בנפח חריג'], en:['XL transfers','Extra-large one-off transfers'], ru:['XL-передачи','Разовые передачи большого объёма']},
    {i:'🗄️', he:['גיבוי ארוך טווח','ארכוב קבצים חשובים לשנים'], en:['Long-term backup','Archive important files for years'], ru:['Долгосрочный бэкап','Архив важных файлов на годы']},
    {i:'🔌', he:['API ואינטגרציות','חיבור CRM, Webhooks ועוד'], en:['API & integrations','Connect CRM, webhooks & more'], ru:['API и интеграции','CRM, вебхуки и не только']},
    {i:'🚀', he:['שירות הגדרה לעסק','ליווי והקמה ראשונית לסטודיו'], en:['Business onboarding','Guided setup for your studio'], ru:['Настройка для бизнеса','Помощь с запуском студии']}
  ];
  var FAQ = [
    {he:['זה בחינם?','כן — כלי הליבה חינמיים ורצים בדפדפן שלכם. חבילות בתשלום מוסיפות שליחה גדולה יותר, אחסון ושיתוף.'],
     en:['Is it free?','Yes — the core tools are free and run in your browser. Paid plans add bigger transfers, storage and sharing.'],
     ru:['Это бесплатно?','Да — основные инструменты бесплатны и работают в вашем браузере. Платные планы добавляют большие передачи, хранилище и общий доступ.']},
    {he:['הקבצים שלי מועלים לשרת?','העריכה וההמרה רצות מקומית. קבצים עוזבים את המכשיר רק כשאתם בוחרים לשלוח או לאחסן אותם.'],
     en:['Do my files get uploaded?','Editing and converting run locally. Files only leave your device when you choose to send or store them.'],
     ru:['Мои файлы загружаются на сервер?','Редактирование и конвертация выполняются локально. Файлы покидают устройство, только когда вы решаете отправить или сохранить их.']},
    {he:['צריך להתקין משהו?','לא. הכול רץ בדפדפן מודרני, בלי התקנות ובלי תוספים.'],
     en:['Do I need to install anything?','No. Everything runs in a modern browser — no installs, no plugins.'],
     ru:['Нужно что-то устанавливать?','Нет. Всё работает в современном браузере — без установок и плагинов.']},
    {he:['אילו כלים עובדים כבר עכשיו?','עורך האודיו וסידור הקבצים המקומי כבר פעילים. שאר הכלים נחשפים בהדרגה.'],
     en:['Which tools work right now?','The audio editor and local file organizer are live today. The rest of the tools are rolling out.'],
     ru:['Какие инструменты работают уже сейчас?','Аудиоредактор и локальное упорядочивание файлов уже доступны. Остальные инструменты выходят постепенно.']},
    {he:['צריך חשבון?','לא כדי להתחיל. חשבון מוסיף היסטוריה, לינקים שמורים ושיתוף.'],
     en:['Do I need an account?','Not to start. An account adds history, saved links and sharing.'],
     ru:['Нужен ли аккаунт?','Не для начала работы. Аккаунт добавляет историю, сохранённые ссылки и общий доступ.']},
    {he:['יש מגבלת גודל?','בחינם עד 3GB לשליחה; מסלולי Creator ו-Studio מעלים את המגבלה.'],
     en:['Is there a size limit?','Free is up to 3GB per transfer; Creator and Studio raise the limit.'],
     ru:['Есть ли ограничение по размеру?','Бесплатно — до 3 ГБ за передачу; Creator и Studio увеличивают лимит.']}
  ];

  /* ---------- editing-tools hub (all editing categories on one page) ---------- */
  var EDIT = {
    kick:{he:'כלי עריכה',en:'Editing Tools',ru:'Инструменты редактирования'},
    he:['כל כלי העריכה במקום אחד','אודיו, תמונות, וידאו, מסמכים, ממירים ודחיסה — הכול רץ בדפדפן שלכם, בלי התקנות.'],
    en:['All your editing tools in one place','Audio, images, video, documents, converters & compression — all in your browser, no installs.'],
    ru:['Все инструменты редактирования в одном месте','Аудио, изображения, видео, документы, конвертеры и сжатие — всё в браузере, без установок.']
  };
  var EDIT_CATS = ['audio','images','video','documents','converters','compress'];

  var lang = 'he';

  /* ---------- builders ---------- */
  function badge(s, S) {
    return s === 'live' ? '<span class="badge live">' + S.live + '</span>'
                        : '<span class="badge soon">' + S.soon + '</span>';
  }
  function featCard(t, L) {
    var inner = '<div class="tico">' + svg(t.ic) + '</div>' +
      '<h3>' + t[L] + '</h3><p>' + t['d' + L] + '</p>';
    return t.page ? '<article class="card fav-card hov">' + favBtn(t, t.page) + '<a class="fav-card-link" href="' + t.page + '">' + inner + '</a></article>'
                  : '<div class="card">' + inner + '</div>';
  }
  function chip(t, L, S) {
    var body = badge(t.s, S) + t[L];
    return (t.s === 'live' && t.href)
      ? '<a class="chip hov" href="' + t.href + '">' + body + '</a>'
      : '<span class="chip">' + body + '</span>';
  }
  function allCard(t, L, S) {
    var live = t.s === 'live' && t.href;
    var desc = t['d' + L] ? '<p>' + t['d' + L] + '</p>' : '';
    var inner = '<div class="tico">' + svg(t.ic) + '</div>' +
      (live ? '' : badge(t.s, S)) + '<h3>' + t[L] + '</h3>' + desc;
    return live ? '<article class="card fav-card hov">' + favBtn(t, t.href) + '<a class="fav-card-link" href="' + t.href + '">' + inner + '</a></article>'
                : '<div class="card">' + inner + '</div>';
  }
  function planCard(p, L, S) {
    var name = p[L][0], tagline = p[L][1];
    var ribbon = p.pop ? '<span class="ribbon">' + S.mostPopular + '</span>' : '';
    var feats = p.feats.map(function (f) { return '<li>' + CHECK + f[L] + '</li>'; }).join('');
    // Free → sign-up; paid plans (Creator/Studio) → the checkout flow.
    // Paid plans are gated: data-requires-auth makes auth-modal.js send guests
    // to login/sign-up before checkout (and the checkout page re-checks too).
    var slug = (p.en[0] || '').toLowerCase();
    var paid = slug !== 'free';
    // Real Stripe billing isn't wired yet and the demo checkout is disabled, so
    // both free and paid CTAs start a free trial / sign-up instead of the
    // (removed) fake charge. Restore '../checkout?plan=' + slug when billing
    // goes live to send paid plans back to checkout.
    var href = '../auth?mode=signup';
    var gate = paid ? ' data-requires-auth' : '';
    var btn = p.pop ? '<a class="cta" href="' + href + '"' + gate + '>' + p.cta[L] + '</a>'
                    : '<a class="ghost" href="' + href + '"' + gate + '>' + p.cta[L] + '</a>';
    // Creator is the trialed tier → offer the no-card 7-day trial via sign-up.
    var trialTxt = { he: 'או 7 ימי ניסיון חינם — ללא כרטיס אשראי', en: 'or start 7 days free — no credit card', ru: 'или 7 дней бесплатно — без карты' };
    var trial = slug === 'creator' ? '<a class="plan-trial" href="../auth?mode=signup">' + trialTxt[L] + '</a>' : '';
    // Currency follows the visitor's country (currency.js); fall back to the
    // per-language price point when the module isn't loaded.
    var priceTxt = (window.KOLKLI_CUR && p.usd != null) ? KOLKLI_CUR.price(p.usd, p.ils) : p.price[L];
    return '<div class="plan ' + (p.pop ? 'pop' : '') + '">' + ribbon +
      '<h3>' + name + '</h3><div class="price">' + priceTxt + '<span>' + S.perMonth + '</span></div>' +
      '<p class="tagline">' + tagline + '</p><ul>' + feats + '</ul>' + btn + trial + '</div>';
  }
  function head(kick, title, sub, newBadge) {
    var k = kick ? '<div class="kicker">' + kick + (newBadge ? '<span class="new">' + newBadge + '</span>' : '') + '</div>' : '';
    return '<div class="pagehead">' + k + '<h1>' + title + '</h1>' + (sub ? '<p>' + sub + '</p>' : '') + '</div>';
  }
  function finalBand(S) {
    return '<section><div class="wrap"><div class="final">' +
      '<h2>' + S.finalH + '</h2><p>' + S.finalP + '</p>' +
      '<a class="cta lg" href="../auth?mode=signup">' + S.finalCta + '</a></div></div></section>';
  }
  function footer(S) {
    return '<footer class="pagefoot"><div class="wrap"><div class="in">' +
      '<div class="fl">' +
        '<a href="../">' + S.fHome + '</a><a href="../pricing/">' + S.fPricing + '</a>' +
        '<a href="../faq/">' + S.fFaq + '</a><a href="../ai/">' + S.fAI + '</a>' +
        '<a href="../send">' + S.fSend + '</a>' +
        '<a href="../review">' + S.fReview + '</a>' +
        '<a href="../privacy">' + S.fPrivacy + '</a><a href="../terms">' + S.fTerms + '</a>' +
      '</div><div class="cp">' + S.cp + '</div></div></div></footer>';
  }

  /* ---------- page renderers ---------- */
  function renderCategory(cat, L, S) {
    var c = CATS[cat];
    var kick = '<span style="font-size:14px">' + c.i + '</span> ' + c[L][0];
    var ctaBtn = c.cta ? '<div style="text-align:center;margin:6px 0 4px"><a class="cta" href="' + c.cta.href + '">' + c.cta[L] + '</a></div>' : '';
    var feats = c.feat.map(function (t) { return featCard(t, L); }).join('');
    var useTiles = c.all.length && c.all.every(function (t) { return t.ic; });
    var allHtml = useTiles
      ? '<div class="grid g4 c-' + cat + '">' + c.all.map(function (t) { return allCard(t, L, S); }).join('') + '</div>'
      : '<div class="chips">' + c.all.map(function (t) { return chip(t, L, S); }).join('') + '</div>';
    var featBlock = c.noFeat ? '' :
      '<div class="subhead"><h2>' + S.featured + '</h2><span class="line"></span></div>' +
      '<div class="grid g4 c-' + cat + '">' + feats + '</div>';
    return head(kick, c[L][0], c[L][1]) +
      '<section><div class="wrap">' +
        featBlock +
        '<div class="subhead"><h2>' + S.allTools + '</h2><span class="line"></span></div>' +
        allHtml +
        ctaBtn +
      '</div></section>' +
      finalBand(S) + footer(S);
  }
  function renderEditing(L, S) {
    var arrow = (L === 'he') ? '←' : '→';
    var sections = EDIT_CATS.map(function (cat) {
      var c = CATS[cat];
      var feats = c.feat.map(function (t) { return featCard(t, L); }).join('');
      return '<div class="subhead">' +
          '<h2><span class="she">' + c.i + '</span>' + c[L][0] + '</h2>' +
          '<span class="line"></span>' +
          '<a class="seeall" href="../' + cat + '/">' + S.allTools + ' ' + arrow + '</a>' +
        '</div>' +
        '<div class="grid g4 c-' + cat + '">' + feats + '</div>';
    }).join('');
    var kick = '<span style="font-size:14px">🛠️</span> ' + EDIT.kick[L];
    return head(kick, EDIT[L][0], EDIT[L][1]) +
      '<section><div class="wrap">' + sections + '</div></section>' +
      finalBand(S) + footer(S);
  }
  // "Back to dashboard" pill — shown only when a user is signed in.
  function backToDash(L) {
    if (!ls('ac_session')) return '';
    var arrow = (L === 'he') ? '→' : '←';   // back points toward the reading start
    var txt = { he: 'חזרה ללוח הבקרה', en: 'Back to Dashboard', ru: 'Назад в дашборд' }[L];
    return '<div class="wrap"><a class="backdash" href="../dashboard">' +
      '<span class="bda">' + arrow + '</span>' + txt + '</a></div>';
  }
  function renderAI(L, S) {
    var grid = AI.map(function (a) {
      var favSource = { he:a.he, en:a.en, ru:a.ru, dhe:a.dhe, den:a.den, dru:a.dru, ic:'sparkles' };
      var inner = '<span class="aico">' + a.i + '</span>' + badge(a.href ? 'live' : 'soon', S) +
        '<span class="an">' + a[L] + '</span><p class="ad">' + a['d' + L] + '</p>';
      return a.href ? '<article class="aicard fav-card hov">' + favBtn(favSource, a.href) + '<a class="fav-card-link ai-fav-link" href="' + a.href + '">' + inner + '</a></article>'
                    : '<div class="aicard">' + inner + '</div>';
    }).join('');
    return backToDash(L) + head(S.aiKick, S.aiTitle, S.aiSub, S.aiNew) +
      '<section><div class="wrap"><div class="aigrid">' + grid + '</div></div></section>' +
      finalBand(S) + footer(S);
  }
  function renderFAQ(L, S) {
    var list = FAQ.map(function (f) {
      return '<details class="q"><summary>' + f[L][0] + CHEV + '</summary><div class="ans">' + f[L][1] + '</div></details>';
    }).join('');
    return head(S.faqKick, S.faqTitle, S.faqSub) +
      '<section><div class="wrap"><div class="faq">' + list + '</div></div></section>' +
      finalBand(S) + footer(S);
  }
  function renderPricing(L, S) {
    var plans = PLANS.map(function (p) { return planCard(p, L, S); }).join('');
    var addonsHead = { he: ['תוספות בתשלום', 'אפשר לצרף לכל מסלול, מתי שצריך יותר'],
                       en: ['Paid add-ons', 'Attach to any plan whenever you need more'],
                       ru: ['Платные дополнения', 'Добавьте к любому тарифу, когда нужно больше'] }[L];
    var addons = ADDONS.map(function (a) {
      return '<div class="addon"><span class="ad-ic">' + a.i + '</span>' +
        '<span class="ad-tx"><h4>' + a[L][0] + '</h4><p>' + a[L][1] + '</p></span></div>';
    }).join('');
    return head(S.prKick, S.prTitle, S.prSub) +
      '<section><div class="wrap pricing-wrap"><div class="plans">' + plans + '</div>' +
        '<div class="subhead addons-head"><h2>' + addonsHead[0] + '</h2><span class="line"></span></div>' +
        '<p class="addons-sub">' + addonsHead[1] + '</p>' +
        '<div class="addons">' + addons + '</div>' +
      '</div></section>' +
      footer(S);
  }

  var TITLES = {
    audio:{he:'אודיו',en:'Audio',ru:'Аудио'}, images:{he:'תמונות',en:'Images',ru:'Изображения'}, video:{he:'וידאו',en:'Video',ru:'Видео'},
    documents:{he:'מסמכים',en:'Documents',ru:'Документы'}, converters:{he:'ממירים',en:'Converters',ru:'Конвертеры'}, compress:{he:'דחיסה',en:'Compress',ru:'Сжатие'},
    dev:{he:'כלי עיצוב ופיתוח',en:'Design & Dev Tools',ru:'Инструменты дизайна'},
    editing:{he:'כלי עריכה',en:'Editing Tools',ru:'Инструменты редактирования'},
    ai:{he:'כלי AI',en:'AI Tools',ru:'AI-инструменты'}, faq:{he:'שאלות נפוצות',en:'FAQ',ru:'FAQ'}, pricing:{he:'מסלולים ומחירים',en:'Pricing',ru:'Цены'}, marketing:{he:'שיווק וקישורים',en:'Marketing & Links',ru:'Маркетинг и ссылки'}, calc:{he:'חישובים והמרות',en:'Calculators & Converters',ru:'Калькуляторы'}
  };

  function render() {
    var L = lang, S = STR[L];
    var host = el('page');
    if (!host) return;
    if (CATS[page]) host.innerHTML = renderCategory(page, L, S);
    else if (page === 'editing') host.innerHTML = renderEditing(L, S);
    else if (page === 'ai') host.innerHTML = renderAI(L, S);
    else if (page === 'faq') host.innerHTML = renderFAQ(L, S);
    else if (page === 'pricing') host.innerHTML = renderPricing(L, S);
    var tt = TITLES[page];
    document.title = 'KOLKLI — ' + (tt ? tt[L] : 'KOLKLI');
  }

  /* ---------- language + theme (header owns the picker; it calls window.__setLang) ---------- */
  function ls(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function applyLang(l) {
    lang = l;
    document.documentElement.lang = l;
    document.documentElement.dir = (l === 'he') ? 'rtl' : 'ltr';
    try { localStorage.setItem('ac_lang', l); } catch (e) {}
    render();
  }
  window.__setLang = applyLang;
  function detectLang() {
    var chosen = ls('ac_lang'); if (chosen) return chosen;
    var cc = ls('ac_country'); if (cc) return cc === 'IL' ? 'he' : 'en';
    var tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) {}
    var navHe = (navigator.language || '').toLowerCase().indexOf('he') === 0;
    return (tz === 'Asia/Jerusalem' || navHe) ? 'he' : 'en';
  }
  function applyTheme(th) {
    var dark = (th === 'dark');
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    var ti = el('themeIco'); if (ti) ti.textContent = dark ? '☀️' : '🌙';
    try { localStorage.setItem('theme', dark ? 'dark' : 'light'); } catch (e) {}
  }

  /* ---------- init ---------- */
  applyTheme(ls('theme') || 'light');
  applyLang(detectLang());
  // Re-render the price table once IP → currency detection settles.
  if (window.KOLKLI_CUR && KOLKLI_CUR.onReady) KOLKLI_CUR.onReady(render);

  var tb = el('themeToggle'); if (tb) tb.addEventListener('click', function () {
    applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  });
})();
