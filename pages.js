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
      prKick:'מסלולים ומחירים', prTitle:'תמחור פשוט ושקוף', prSub:'מתחילים בחינם. משדרגים כשצריך יותר.',
      perMonth:'/לחודש', mostPopular:'הכי פופולרי',
      finalH:'מוכנים להתחיל?', finalP:'העלו את הקובץ הראשון — זה לוקח כמה שניות בלבד.', finalCta:'בואו נתחיל',
      fHome:'בית', fPricing:'מסלולים ומחירים', fFaq:'שאלות נפוצות', fAI:'כלי AI', fSend:'שליחת קבצים',
      cp:'KOLKLI · העריכה רצה בדפדפן שלכם · הקבצים נשארים אצלכם.'
    },
    en: {
      live:'Live', soon:'Soon', featured:'Featured tools', allTools:'All tools',
      aiKick:'AI Studio', aiNew:'New', aiTitle:'Smarter tools, powered by AI',
      aiSub:'Our most advanced tools — rolling out soon.',
      faqKick:'FAQ', faqTitle:'Frequently asked questions', faqSub:'Everything you wanted to know about KOLKLI.',
      prKick:'Pricing', prTitle:'Simple, transparent pricing', prSub:'Start free. Upgrade when you need more.',
      perMonth:'/mo', mostPopular:'Most Popular',
      finalH:'Ready to get started?', finalP:'Upload your first file — it takes just a few seconds.', finalCta:'Get started',
      fHome:'Home', fPricing:'Pricing', fFaq:'FAQ', fAI:'AI Tools', fSend:'Send Files',
      cp:'KOLKLI · Editing runs in your browser · Your files stay with you.'
    },
    ru: {
      live:'Доступно', soon:'Скоро', featured:'Избранные инструменты', allTools:'Все инструменты',
      aiKick:'AI-студия', aiNew:'Новое', aiTitle:'Умные инструменты на базе AI',
      aiSub:'Наши самые продвинутые инструменты — скоро в доступе.',
      faqKick:'FAQ', faqTitle:'Частые вопросы', faqSub:'Всё, что вы хотели знать о KOLKLI.',
      prKick:'Цены', prTitle:'Простые и прозрачные цены', prSub:'Начните бесплатно. Обновляйтесь, когда нужно больше.',
      perMonth:'/мес', mostPopular:'Самый популярный',
      finalH:'Готовы начать?', finalP:'Загрузите первый файл — это займёт всего несколько секунд.', finalCta:'Начать',
      fHome:'Главная', fPricing:'Цены', fFaq:'FAQ', fAI:'AI-инструменты', fSend:'Отправка файлов',
      cp:'KOLKLI · Редактирование в вашем браузере · Ваши файлы остаются у вас.'
    }
  };

  /* ---------- line-icon set (from header.js) ---------- */
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
    music:'<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    minimize:'<polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/>',
    volume:'<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>',
    layers:'<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
    file:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
    folder:'<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
    headphones:'<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>',
    sparkles:'<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/>',
    wand:'<path d="m3 21 9-9"/><path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/><path d="M17.8 11.8 19 13"/><path d="M15 9h.01"/><path d="M17.8 6.2 19 5"/><path d="M12.2 6.2 11 5"/>',
    droplet:'<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>'
  };
  function svg(name) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + (IC[name] || '') + '</svg>'; }
  var CHEV = '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
  var CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

  /* ---------- category data (featured cards from header.js TOOLS, all-tools chips from index DATA.hubs) ---------- */
  var CATS = {
    audio: { i:'🎵', cta:{ href:'../app.html', he:'פתחו את העורך', en:'Open the Editor', ru:'Открыть редактор' },
      he:['אודיו','חתכו, נרמלו, המירו ועשו מאסטרינג — הכול בדפדפן.'],
      en:['Audio','Cut, normalize, convert & master — all in your browser.'],
      ru:['Аудио','Обрезка, нормализация, конвертация и мастеринг — всё в браузере.'],
      feat:[
        {he:'חותך אודיו',en:'Audio Cutter',ru:'Обрезка аудио',dhe:'חיתוך וקיצוץ MP3',den:'Trim & cut MP3',dru:'Обрезка и нарезка MP3',ic:'scissors',page:'../app.html'},
        {he:'המרת אודיו',en:'Convert Audio',ru:'Конвертация аудио',dhe:'MP3, WAV, FLAC ועוד',den:'MP3, WAV, FLAC…',dru:'MP3, WAV, FLAC…',ic:'refresh',page:'../convert.html'},
        {he:'מיזוג אודיו',en:'Merge Audio',ru:'Объединение аудио',dhe:'איחוד רצועות לקובץ',den:'Join tracks into one',dru:'Склейка треков в один',ic:'merge',page:'../merge-audio.html'},
        {he:'BPM וסולם',en:'BPM & Key',ru:'BPM и тональность',dhe:'זיהוי קצב וסולם',den:'Detect tempo & key',dru:'Определение темпа и тональности',ic:'pulse',page:'../app.html'},
        {he:'ניקוי אודיו AI',en:'AI Audio Cleanup',ru:'AI-очистка аудио',dhe:'הסרת רעש ושיפור קול',den:'Remove noise, enhance voice',dru:'Убрать шум, улучшить голос',ic:'sparkle',page:'../ai-audio-cleanup.html'}
      ],
      all:[
        {he:'חותך',en:'Cutter',ru:'Обрезка',s:'live',href:'../app.html'},{he:'מיזוג',en:'Merge',ru:'Объединение',s:'live',href:'../merge-audio.html'},
        {he:'נרמול',en:'Normalize',ru:'Нормализация',s:'live',href:'../app.html'},{he:'ווליום',en:'Volume',ru:'Громкость',s:'live',href:'../app.html'},
        {he:'המרה',en:'Convert',ru:'Конвертация',s:'live',href:'../convert.html'},{he:'Fade In/Out',en:'Fade In/Out',ru:'Затухание',s:'soon'},
        {he:'הסרת שקט',en:'Trim Silence',ru:'Убрать тишину',s:'soon'},{he:'רינגטון',en:'Ringtone',ru:'Рингтон',s:'soon'},
        {he:'זיהוי BPM',en:'BPM Detector',ru:'Определение BPM',s:'live',href:'../app.html'},{he:'זיהוי סולם',en:'Key Detector',ru:'Определение тональности',s:'live',href:'../app.html'},
        {he:'הסרת ווקאל',en:'Vocal Remover',ru:'Удаление вокала',s:'soon'},
        {he:'מאסטרינג AI',en:'AI Mastering',ru:'AI-мастеринг',s:'live',href:'../ai-master.html'},
        {he:'ניקוי אודיו AI',en:'AI Cleanup',ru:'AI-очистка',s:'live',href:'../ai-audio-cleanup.html'}
      ]},
    images: { i:'🖼️',
      he:['תמונות','שנו גודל, חתכו, המירו ודחסו תמונות.'],
      en:['Images','Resize, crop, convert and compress images.'],
      ru:['Изображения','Изменяйте размер, обрезайте, конвертируйте и сжимайте изображения.'],
      feat:[
        {he:'שינוי גודל',en:'Resize Image',ru:'Изменение размера',dhe:'שינוי מידות מהיר',den:'Change dimensions',dru:'Изменить размеры',ic:'maximize',page:'../resize-image.html'},
        {he:'חיתוך תמונה',en:'Crop Image',ru:'Обрезка изображения',dhe:'חיתוך ויישור',den:'Crop & straighten',dru:'Обрезка и выравнивание',ic:'crop',page:'../crop-image.html'},
        {he:'סימן מים',en:'Watermark',ru:'Водяной знак',dhe:'טקסט או לוגו על התמונה',den:'Add text or a logo',dru:'Текст или логотип на фото',ic:'droplet',page:'../watermark.html'},
        {he:'הסרת רקע',en:'Remove Background',ru:'Удаление фона',dhe:'הסרה בקליק אחד',den:'One-click cutout',dru:'Вырезка в один клик',ic:'sparkle',page:'../remove-bg.html'},
        {he:'שחזור תמונה AI',en:'AI Photo Restore',ru:'AI-восстановление фото',dhe:'שיפור תמונות ישנות',den:'Revive old photos',dru:'Оживите старые фото',ic:'sparkles',page:'../restore-image.html'},
        {he:'HEIC ל-JPG',en:'HEIC to JPG',ru:'HEIC в JPG',dhe:'המרת תמונות אייפון',den:'Convert iPhone photos',dru:'Конвертация фото с iPhone',ic:'image',page:'../heic-to-jpg.html'},
        {he:'הסרת אובייקטים AI',en:'AI Object Remover',ru:'AI-удаление объектов',dhe:'מחקו כל דבר מהתמונה',den:'Erase anything from a photo',dru:'Сотрите что угодно с фото',ic:'wand',page:'../ai-object-remover.html'}
      ],
      all:[
        {he:'שינוי גודל',en:'Resize',ru:'Размер',s:'live',href:'../resize-image.html'},{he:'חיתוך',en:'Crop',ru:'Обрезка',s:'live',href:'../crop-image.html'},{he:'חיתוך חכם AI',en:'AI Smart Crop',ru:'AI-умная обрезка',s:'live',href:'../ai-smart-crop.html'},
        {he:'סיבוב',en:'Rotate',ru:'Поворот',s:'soon'},{he:'הסרת רקע',en:'Remove BG',ru:'Удалить фон',s:'live',href:'../remove-bg.html'},
        {he:'דחיסה',en:'Compress',ru:'Сжатие',s:'soon'},{he:'המרה',en:'Convert',ru:'Конвертация',s:'live',href:'../image-convert.html'},
        {he:'סימן מים',en:'Watermark',ru:'Водяной знак',s:'live',href:'../watermark.html'},{he:'שיפור AI',en:'AI Enhance',ru:'AI-улучшение',s:'soon'},
        {he:'שחזור AI',en:'AI Restore',ru:'AI-восстановление',s:'live',href:'../restore-image.html'},{he:'הרחבה AI',en:'AI Expand',ru:'AI-расширение',s:'soon'},
        {he:'הסרת אובייקטים',en:'Remove Object',ru:'Удалить объект',s:'live',href:'../ai-object-remover.html'}
      ]},
    video: { i:'🎬', cta:{ href:'../video-cut.html', he:'פתחו את חותך הווידאו', en:'Open Video Cutter', ru:'Открыть видеорезак' },
      he:['וידאו','חתכו, המירו, דחסו וחלצו אודיו.'],
      en:['Video','Trim, convert, compress and extract audio.'],
      ru:['Видео','Обрезайте, конвертируйте, сжимайте и извлекайте звук.'],
      feat:[
        {he:'חותך וידאו',en:'Video Cutter',ru:'Обрезка видео',dhe:'חיתוך קטעים במהירות',den:'Trim clips fast',dru:'Быстрая нарезка клипов',ic:'scissors',page:'../video-cut.html'},
        {he:'MP4 ל-MP3',en:'MP4 to MP3',ru:'MP4 в MP3',dhe:'חילוץ פס הקול',den:'Extract the audio',dru:'Извлечь звук',ic:'music',page:'../mp4-to-mp3.html'},
        {he:'דחיסת וידאו',en:'Compress Video',ru:'Сжатие видео',dhe:'הקטנת נפח הקובץ',den:'Shrink file size',dru:'Уменьшить размер файла',ic:'minimize',page:'../compress-video.html'},
        {he:'חילוץ אודיו',en:'Extract Audio',ru:'Извлечь аудио',dhe:'שמירת הסאונד בלבד',den:'Pull the soundtrack',dru:'Сохранить звуковую дорожку',ic:'volume',page:'../extract-audio.html'}
      ],
      all:[
        {he:'חיתוך',en:'Trim',ru:'Обрезка',s:'live',href:'../video-cut.html'},{he:'דחיסה',en:'Compress',ru:'Сжатие',s:'live',href:'../compress-video.html'},
        {he:'המרה',en:'Convert',ru:'Конвертация',s:'live',href:'../video-convert.html'},{he:'חילוץ אודיו',en:'Extract Audio',ru:'Извлечь звук',s:'live',href:'../extract-audio.html'},
        {he:'השתקה',en:'Mute',ru:'Без звука',s:'soon'},{he:'שינוי גודל',en:'Resize',ru:'Размер',s:'soon'},
        {he:'יצירת שורטס',en:'Shorts Maker',ru:'Создание Shorts',s:'soon'},{he:'כתוביות AI',en:'AI Subtitle',ru:'AI-субтитры',s:'live',href:'../subtitle-generator.html'},{he:'שדרוג AI',en:'AI Upscale',ru:'AI-апскейл',s:'soon'}
      ]},
    documents: { i:'📄', cta:{ href:'../files.html', he:'לסידור הקבצים', en:'Organize Files', ru:'Упорядочить файлы' },
      he:['מסמכים','כלי PDF, OCR וסידור קבצים.'],
      en:['Documents','PDF tools, OCR and file organizing.'],
      ru:['Документы','Инструменты PDF, OCR и упорядочивание файлов.'],
      feat:[
        {he:'מיזוג PDF',en:'Merge PDF',ru:'Объединить PDF',dhe:'איחוד קבצי PDF',den:'Combine PDFs',dru:'Склейка PDF-файлов',ic:'layers',page:'../merge-pdf.html'},
        {he:'דחיסת PDF',en:'Compress PDF',ru:'Сжать PDF',dhe:'הקטנת נפח PDF',den:'Reduce PDF size',dru:'Уменьшить размер PDF',ic:'minimize',page:'../compress-pdf.html'},
        {he:'PDF ל-JPG',en:'PDF to JPG',ru:'PDF в JPG',dhe:'המרת עמודים לתמונות',den:'Pages to images',dru:'Страницы в изображения',ic:'image',page:'../pdf-to-jpg.html'},
        {he:'DOC ל-PDF',en:'DOC to PDF',ru:'DOC в PDF',dhe:'המרת Word ל-PDF',den:'Word to PDF',dru:'Word в PDF',ic:'file',page:'../doc-to-pdf.html'},
        {he:'סידור קבצים',en:'Organize Files',ru:'Упорядочить файлы',dhe:'מיון ושינוי שמות',den:'Sort & rename',dru:'Сортировка и переименование',ic:'folder',page:'../files.html'}
      ],
      all:[
        {he:'מיזוג PDF',en:'Merge PDF',ru:'Объединить PDF',s:'live',href:'../merge-pdf.html'},{he:'פיצול PDF',en:'Split PDF',ru:'Разделить PDF',s:'soon'},
        {he:'דחיסת PDF',en:'Compress PDF',ru:'Сжать PDF',s:'live',href:'../compress-pdf.html'},{he:'PDF ל-JPG',en:'PDF to JPG',ru:'PDF в JPG',s:'live',href:'../pdf-to-jpg.html'},{he:'OCR',en:'OCR',ru:'OCR',s:'soon'},
        {he:'חתימת PDF',en:'Sign PDF',ru:'Подпись PDF',s:'soon'},{he:'הגנת PDF',en:'Protect PDF',ru:'Защита PDF',s:'soon'},
        {he:'DOC ל-PDF',en:'DOC to PDF',ru:'DOC в PDF',s:'live',href:'../doc-to-pdf.html'},{he:'PDF ל-Word',en:'PDF to Word',ru:'PDF в Word',s:'soon'},
        {he:'סידור קבצים',en:'Organize',ru:'Упорядочить',s:'live',href:'../files.html'}
      ]},
    converters: { i:'🔄',
      he:['ממירים','המירו בין מאות פורמטים של קבצים.'],
      en:['Converters','Convert between hundreds of file formats.'],
      ru:['Конвертеры','Конвертируйте между сотнями форматов файлов.'],
      feat:[
        {he:'ממיר אודיו',en:'Audio Converter',ru:'Аудиоконвертер',dhe:'כל פורמט אודיו',den:'Any audio format',dru:'Любой аудиоформат',ic:'headphones',page:'../convert.html'},
        {he:'ממיר וידאו',en:'Video Converter',ru:'Видеоконвертер',dhe:'כל פורמט וידאו',den:'Any video format',dru:'Любой видеоформат',ic:'film',page:'../video-convert.html'},
        {he:'ממיר תמונות',en:'Image Converter',ru:'Конвертер изображений',dhe:'PNG, JPG, WebP ועוד',den:'PNG, JPG, WebP…',dru:'PNG, JPG, WebP…',ic:'image',page:'../image-convert.html'},
        {he:'ממיר מסמכים',en:'Document Converter',ru:'Конвертер документов',dhe:'מסמכים וגיליונות',den:'Docs & sheets',dru:'Документы и таблицы',ic:'file',page:'../doc-convert.html'}
      ],
      all:[
        {he:'אודיו',en:'Audio',ru:'Аудио',s:'live',href:'../convert.html'},{he:'וידאו',en:'Video',ru:'Видео',s:'live',href:'../video-convert.html'},
        {he:'תמונות',en:'Images',ru:'Изображения',s:'live',href:'../image-convert.html'},{he:'מסמכים',en:'Documents',ru:'Документы',s:'live',href:'../doc-convert.html'},
        {he:'ארכיונים',en:'Archives',ru:'Архивы',s:'live',href:'../archive-convert.html'},{he:'גופנים',en:'Fonts',ru:'Шрифты',s:'live',href:'../font-convert.html'},{he:'ספרים',en:'Ebooks',ru:'Электронные книги',s:'live',href:'../ebook-convert.html'},
        {he:'גיליונות',en:'Spreadsheet',ru:'Таблицы',s:'live',href:'../spreadsheet-convert.html'},{he:'מצגות',en:'Presentation',ru:'Презентации',s:'live',href:'../presentation-convert.html'}
      ]},
    compress: { i:'📦',
      he:['דחיסה','הקטינו כל סוג קובץ ושמרו על מקום.'],
      en:['Compress','Shrink any file type and save space.'],
      ru:['Сжатие','Уменьшайте любые файлы и экономьте место.'],
      feat:[
        {he:'דחיסת וידאו',en:'Compress Video',ru:'Сжать видео',dhe:'וידאו קטן יותר',den:'Smaller videos',dru:'Уменьшить видео',ic:'film',page:'../compress-video.html'},
        {he:'דחיסת PDF',en:'Compress PDF',ru:'Сжать PDF',dhe:'PDF קטן יותר',den:'Smaller PDFs',dru:'Уменьшить PDF',ic:'file',page:'../compress-pdf.html'},
        {he:'דחיסת תמונה',en:'Compress Image',ru:'Сжать изображение',dhe:'תמונות קטנות יותר',den:'Smaller images',dru:'Уменьшить изображения',ic:'image',page:'../compress-image.html'},
        {he:'דחיסת אודיו',en:'Compress Audio',ru:'Сжать аудио',dhe:'אודיו קטן יותר',den:'Smaller audio',dru:'Уменьшить аудио',ic:'music',page:'../compress-audio.html'}
      ],
      all:[
        {he:'דחיסת וידאו',en:'Compress Video',ru:'Сжать видео',s:'live',href:'../compress-video.html'},{he:'דחיסת תמונה',en:'Compress Image',ru:'Сжать изображение',s:'live',href:'../compress-image.html'},
        {he:'דחיסת PDF',en:'Compress PDF',ru:'Сжать PDF',s:'live',href:'../compress-pdf.html'},{he:'דחיסת אודיו',en:'Compress Audio',ru:'Сжать аудио',s:'live',href:'../compress-audio.html'},
        {he:'דחיסת ZIP',en:'Compress ZIP',ru:'Сжать ZIP',s:'live',href:'../compress-zip.html'}
      ]}
  };

  /* ---------- AI / pricing / faq data (from index.html DATA) ---------- */
  var AI = [
    {i:'🪄',he:'הסרת רקע AI',en:'AI Remove Background',ru:'AI-удаление фона',href:'../remove-bg.html'},{i:'🎧',he:'ניקוי אודיו AI',en:'AI Audio Cleaner',ru:'AI-очистка звука',href:'../ai-audio-cleanup.html'},
    {i:'💬',he:'יצירת כתוביות AI',en:'AI Subtitle Generator',ru:'AI-генератор субтитров',href:'../subtitle-generator.html'},{i:'🖼️',he:'חיתוך חכם AI',en:'AI Smart Crop',ru:'AI-умная обрезка',href:'../ai-smart-crop.html'},
    {i:'🩹',he:'שחזור תמונה AI',en:'AI Restore Photo',ru:'AI-восстановление фото',href:'../restore-image.html'},{i:'🎚️',he:'מאסטרינג AI',en:'AI Master Audio',ru:'AI-мастеринг аудио',href:'../ai-master.html'},
    {i:'🧽',he:'הסרת אובייקטים AI',en:'AI Remove Objects',ru:'AI-удаление объектов',href:'../ai-object-remover.html'},{i:'📝',he:'סיכום PDF AI',en:'AI Summarize PDF',ru:'AI-конспект PDF',href:'../ai-summarize-pdf.html'}
  ];
  var PLANS = [
    {price:'$0', he:['חינם','להתחלה מהירה'], en:['Free','To get started'], ru:['Бесплатно','Для быстрого старта'], cta:{he:'התחילו',en:'Get Started',ru:'Начать'}, feats:[
      {he:'עד 2GB לשליחה',en:'Up to 2GB per transfer',ru:'До 2 ГБ за передачу'},{he:'כלים בסיסיים',en:'Basic tools',ru:'Базовые инструменты'},
      {he:'קבצים נשמרים 3 ימים',en:'Files kept for 3 days',ru:'Файлы хранятся 3 дня'},{he:'עריכה מקומית בדפדפן',en:'Local in-browser editing',ru:'Локальное редактирование в браузере'}]},
    {price:'$6.99', pop:true, he:['Lite','לעבודה יומיומית'], en:['Lite','For everyday work'], ru:['Lite','Для повседневной работы'], cta:{he:'קחו Lite',en:'Get Lite',ru:'Выбрать Lite'}, feats:[
      {he:'שליחה עד 20GB בכל פעם',en:'Up to 20GB per transfer',ru:'До 20 ГБ за передачу'},{he:'100GB אחסון בענן',en:'100GB cloud storage',ru:'100 ГБ в облаке'},
      {he:'קבצים נשמרים 14 יום',en:'Files kept for 14 days',ru:'Файлы хранятся 14 дней'},{he:'כל כלי העריכה',en:'All editing tools',ru:'Все инструменты редактирования'},
      {he:'הגנה בסיסמה',en:'Password protection',ru:'Защита паролем'},{he:'בלי פרסומות',en:'No ads',ru:'Без рекламы'}]},
    {price:'$14.99', he:['Pro','לעבודה מקצועית'], en:['Pro','For professional work'], ru:['Pro','Для профессионалов'], cta:{he:'קחו Pro',en:'Get Pro',ru:'Выбрать Pro'}, feats:[
      {he:'שליחה עד 100GB בכל פעם',en:'Up to 100GB per transfer',ru:'До 100 ГБ за передачу'},{he:'1TB אחסון בענן',en:'1TB cloud storage',ru:'1 ТБ в облаке'},
      {he:'קבצים נשמרים 30 יום',en:'Files kept for 30 days',ru:'Файлы хранятся 30 дней'},{he:'כל הכלים + כלי AI',en:'All tools + AI tools',ru:'Все инструменты + AI'},
      {he:'התראות הורדה',en:'Download notifications',ru:'Уведомления о скачивании'},{he:'תמיכה מהירה בעדיפות',en:'Priority support',ru:'Приоритетная поддержка'}]}
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
    {he:['יש מגבלת גודל?','בחינם עד 2GB לשליחה; חבילות Lite ו-Pro מעלות את המגבלה.'],
     en:['Is there a size limit?','Free is up to 2GB per transfer; Lite and Pro raise the limit.'],
     ru:['Есть ли ограничение по размеру?','Бесплатно — до 2 ГБ за передачу; Lite и Pro увеличивают лимит.']}
  ];

  var lang = 'he';

  /* ---------- builders ---------- */
  function badge(s, S) {
    return s === 'live' ? '<span class="badge live">' + S.live + '</span>'
                        : '<span class="badge soon">' + S.soon + '</span>';
  }
  function featCard(t, L) {
    var inner = '<div class="tico">' + svg(t.ic) + '</div>' +
      '<h3>' + t[L] + '</h3><p>' + t['d' + L] + '</p>';
    return t.page ? '<a class="card hov" href="' + t.page + '">' + inner + '</a>'
                  : '<div class="card">' + inner + '</div>';
  }
  function chip(t, L, S) {
    var body = badge(t.s, S) + t[L];
    return (t.s === 'live' && t.href)
      ? '<a class="chip hov" href="' + t.href + '">' + body + '</a>'
      : '<span class="chip">' + body + '</span>';
  }
  function planCard(p, L, S) {
    var name = p[L][0], tagline = p[L][1];
    var ribbon = p.pop ? '<span class="ribbon">' + S.mostPopular + '</span>' : '';
    var feats = p.feats.map(function (f) { return '<li>' + CHECK + f[L] + '</li>'; }).join('');
    var btn = p.pop ? '<a class="cta" href="../auth.html">' + p.cta[L] + '</a>'
                    : '<a class="ghost" href="../auth.html">' + p.cta[L] + '</a>';
    return '<div class="plan ' + (p.pop ? 'pop' : '') + '">' + ribbon +
      '<h3>' + name + '</h3><div class="price">' + p.price + '<span>' + S.perMonth + '</span></div>' +
      '<p class="tagline">' + tagline + '</p><ul>' + feats + '</ul>' + btn + '</div>';
  }
  function head(kick, title, sub, newBadge) {
    var k = kick ? '<div class="kicker">' + kick + (newBadge ? '<span class="new">' + newBadge + '</span>' : '') + '</div>' : '';
    return '<div class="pagehead">' + k + '<h1>' + title + '</h1>' + (sub ? '<p>' + sub + '</p>' : '') + '</div>';
  }
  function finalBand(S) {
    return '<section><div class="wrap"><div class="final">' +
      '<h2>' + S.finalH + '</h2><p>' + S.finalP + '</p>' +
      '<a class="cta lg" href="../auth.html?mode=signup">' + S.finalCta + '</a></div></div></section>';
  }
  function footer(S) {
    return '<footer class="pagefoot"><div class="wrap"><div class="in">' +
      '<div class="fl">' +
        '<a href="../">' + S.fHome + '</a><a href="../pricing/">' + S.fPricing + '</a>' +
        '<a href="../faq/">' + S.fFaq + '</a><a href="../ai/">' + S.fAI + '</a>' +
        '<a href="../send.html">' + S.fSend + '</a>' +
      '</div><div class="cp">' + S.cp + '</div></div></div></footer>';
  }

  /* ---------- page renderers ---------- */
  function renderCategory(cat, L, S) {
    var c = CATS[cat];
    var kick = '<span style="font-size:14px">' + c.i + '</span> ' + c[L][0];
    var ctaBtn = c.cta ? '<div style="text-align:center;margin:6px 0 4px"><a class="cta" href="' + c.cta.href + '">' + c.cta[L] + '</a></div>' : '';
    var feats = c.feat.map(function (t) { return featCard(t, L); }).join('');
    var chips = c.all.map(function (t) { return chip(t, L, S); }).join('');
    return head(kick, c[L][0], c[L][1]) +
      '<section><div class="wrap">' +
        '<div class="subhead"><h2>' + S.featured + '</h2><span class="line"></span></div>' +
        '<div class="grid g4 c-' + cat + '">' + feats + '</div>' +
        '<div class="subhead"><h2>' + S.allTools + '</h2><span class="line"></span></div>' +
        '<div class="chips">' + chips + '</div>' +
        ctaBtn +
      '</div></section>' +
      finalBand(S) + footer(S);
  }
  function renderAI(L, S) {
    var grid = AI.map(function (a) {
      var inner = '<span class="aico">' + a.i + '</span><span class="an">' + a[L] + '</span>' + badge(a.href ? 'live' : 'soon', S);
      return a.href ? '<a class="aicard hov" href="' + a.href + '">' + inner + '</a>'
                    : '<div class="aicard">' + inner + '</div>';
    }).join('');
    return head(S.aiKick, S.aiTitle, S.aiSub, S.aiNew) +
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
    return head(S.prKick, S.prTitle, S.prSub) +
      '<section><div class="wrap"><div class="plans">' + plans + '</div></div></section>' +
      footer(S);
  }

  var TITLES = {
    audio:{he:'אודיו',en:'Audio',ru:'Аудио'}, images:{he:'תמונות',en:'Images',ru:'Изображения'}, video:{he:'וידאו',en:'Video',ru:'Видео'},
    documents:{he:'מסמכים',en:'Documents',ru:'Документы'}, converters:{he:'ממירים',en:'Converters',ru:'Конвертеры'}, compress:{he:'דחיסה',en:'Compress',ru:'Сжатие'},
    ai:{he:'כלי AI',en:'AI Tools',ru:'AI-инструменты'}, faq:{he:'שאלות נפוצות',en:'FAQ',ru:'FAQ'}, pricing:{he:'מסלולים ומחירים',en:'Pricing',ru:'Цены'}
  };

  function render() {
    var L = lang, S = STR[L];
    var host = el('page');
    if (!host) return;
    if (CATS[page]) host.innerHTML = renderCategory(page, L, S);
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

  var tb = el('themeToggle'); if (tb) tb.addEventListener('click', function () {
    applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  });
})();
