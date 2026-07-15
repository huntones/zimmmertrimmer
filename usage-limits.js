/* ============================================================
   KOLKLI usage limits client SDK.

   The browser only collects identity signals and asks the Worker for
   authorization. Counters live server-side in the storage Worker
   Durable Object; localStorage/cookie are just one anonymous signal,
   combined with fingerprint + IP on the server.
   ============================================================ */
(function () {
  if (window.KolkliUsage) return;

  var GB = 1024 * 1024 * 1024;
  var MB = 1024 * 1024;
  var LIMITS = {
    'send-files': { daily: 2, maxBytes: 3 * GB },
    'organize-files': { daily: 2, maxFiles: 10, maxFolders: 3 },
    'review-files': { daily: 2, maxFiles: 1 },
    'request-files': { daily: 2, maxFiles: 5 }
  };

  // Per-file export/upload ceiling by plan. Paid tiers (creator/studio) get a
  // large single-file allowance; free is intentionally small. This is a size
  // cap layered on top of any per-tool daily/file quotas, applied client-side
  // at intake by the tools that meter file size (e.g. normalize-audio).
  var FILE_BYTE_CAP = { free: 50 * MB, paid: 500 * MB };

  var TXT = {
    he: {
      title: 'הגעתם למכסת השימוש היומית',
      body: 'כדי להמשיך להשתמש בכלי הזה היום, התחברו או הירשמו.',
      login: 'שדרגו עכשיו',
      close: 'ביטול',
      files: function (n) { return 'ניתן להשתמש בעד ' + n + ' קבצים בכל שימוש.'; },
      folders: function (n) { return 'ניתן לפתוח עד ' + n + ' תיקיות בכל שימוש.'; },
      bytes: function (n) { return 'ניתן לשלוח עד ' + fmtBytes(n) + ' בכל שליחה.'; },
      rate: 'זוהתה פעילות חריגה מהכתובת הזו. נסו שוב מאוחר יותר.',
      server: 'מנגנון האכיפה לא זמין כרגע. נסו שוב בעוד רגע.'
    },
    en: {
      title: 'Daily usage limit reached',
      body: 'Sign in or create an account to keep using this tool today.',
      login: 'Upgrade now',
      close: 'Cancel',
      files: function (n) { return 'You can use up to ' + n + ' files per use.'; },
      folders: function (n) { return 'You can open up to ' + n + ' folders per use.'; },
      bytes: function (n) { return 'You can send up to ' + fmtBytes(n) + ' per transfer.'; },
      rate: 'Unusual activity was detected from this IP. Try again later.',
      server: 'Usage enforcement is unavailable right now. Try again in a moment.'
    },
    ru: {
      title: 'Дневной лимит исчерпан',
      body: 'Войдите или зарегистрируйтесь, чтобы продолжить сегодня.',
      login: 'Обновить сейчас',
      close: 'Отмена',
      files: function (n) { return 'За один раз можно использовать до ' + n + ' файлов.'; },
      folders: function (n) { return 'За один раз можно открыть до ' + n + ' папок.'; },
      bytes: function (n) { return 'За одну отправку можно передать до ' + fmtBytes(n) + '.'; },
      rate: 'Обнаружена необычная активность с этого IP. Попробуйте позже.',
      server: 'Проверка лимитов сейчас недоступна. Попробуйте ещё раз.'
    }
  };

  function lang() {
    var l = document.documentElement.getAttribute('lang');
    if (l === 'he' || l === 'en' || l === 'ru') return l;
    try { l = localStorage.getItem('ac_lang'); } catch (_) {}
    return (l === 'en' || l === 'ru') ? l : 'he';
  }

  // Depth-aware site root, mirroring header.js so links resolve both at the
  // site root (border-radius.html, send.html, ...) and inside folder pages
  // (/pricing/, /audio/, ...).
  function siteRoot() {
    var depth = location.pathname.replace(/[^/]*$/, '').split('/').filter(Boolean).length;
    return depth ? new Array(depth + 1).join('../') : './';
  }

  // Daily quotas and per-use file/folder caps are free-tier friction only.
  // Any paid plan (Creator/Studio) is unlimited on projects and files, so the
  // whole usage-limit flow is skipped for them. Plan is read from the same
  // localStorage signals the rest of the site uses (mirrors send.html), which
  // KolkliAuth keeps in sync with the Supabase profile.
  // Legacy plans (lite/pro/business) map onto the new tiers so older stored
  // accounts keep resolving.
  function normalizePlan(plan) {
    plan = String(plan || '').toLowerCase();
    if (plan === 'lite') return 'creator';
    if (plan === 'pro' || plan === 'business') return 'studio';
    return plan || 'free';
  }
  function currentPlan() {
    var plan = '';
    try {
      var email = (localStorage.getItem('ac_session') || '').toLowerCase();
      if (email) {
        var users = JSON.parse(localStorage.getItem('ac_users') || '[]') || [];
        var u = users.filter(function (x) { return (x.email || '').toLowerCase() === email; })[0];
        if (u && u.plan) plan = u.plan;
      }
    } catch (_) {}
    if (!plan) { try { plan = localStorage.getItem('ac_plan') || ''; } catch (_) {} }
    return normalizePlan(plan);
  }

  function isExempt() {
    var p = currentPlan();
    return p === 'creator' || p === 'studio';
  }

  // Largest single file the current plan may export/upload (paid 500MB, free 50MB).
  function fileByteCap() { return isExempt() ? FILE_BYTE_CAP.paid : FILE_BYTE_CAP.free; }

  function toolLimit(tool) {
    tool = String(tool || '').toLowerCase();
    if (LIMITS[tool]) return LIMITS[tool];
    if (tool.indexOf('edit:') === 0 || tool.indexOf('ai:') === 0) return { daily: 3 };
    if (tool.indexOf('design:') === 0 || tool.indexOf('text:') === 0) return { daily: 50 };
    return null;
  }

  function fmtBytes(n) {
    n = +n || 0;
    if (n >= GB) return (n / GB).toFixed(n % GB ? 2 : 0) + 'GB';
    if (n >= 1048576) return (n / 1048576).toFixed(1) + 'MB';
    if (n >= 1024) return Math.round(n / 1024) + 'KB';
    return n + 'B';
  }

  function randomId() {
    if (window.crypto && crypto.getRandomValues) {
      var a = new Uint8Array(16);
      crypto.getRandomValues(a);
      return Array.from(a).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    }
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function cookieGet(name) {
    var m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/[.$?*|{}()[\]\\/+^]/g, '\\$&') + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : '';
  }

  function cookieSet(name, value) {
    try {
      document.cookie = name + '=' + encodeURIComponent(value) + '; path=/; max-age=31536000; SameSite=Lax';
    } catch (_) {}
  }

  function anonymousId() {
    var id = '';
    try { id = localStorage.getItem('kolkli_anon_id') || ''; } catch (_) {}
    if (!id) id = cookieGet('kolkli_anon_id');
    if (!id) id = randomId();
    try { localStorage.setItem('kolkli_anon_id', id); } catch (_) {}
    cookieSet('kolkli_anon_id', id);
    return id;
  }

  async function sha256Hex(value) {
    value = String(value || '');
    if (window.crypto && crypto.subtle && window.TextEncoder) {
      var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
      return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    }
    var h = 5381;
    for (var i = 0; i < value.length; i++) h = ((h << 5) + h) + value.charCodeAt(i);
    return 'x' + (h >>> 0).toString(16);
  }

  function canvasSignal() {
    try {
      var c = document.createElement('canvas');
      c.width = 240; c.height = 60;
      var x = c.getContext('2d');
      x.textBaseline = 'top';
      x.font = '16px Arial';
      x.fillStyle = '#7b34ff';
      x.fillRect(0, 0, 240, 60);
      x.fillStyle = '#fff';
      x.fillText('KOLKLI usage limit', 12, 14);
      x.strokeStyle = '#22d3a0';
      x.arc(190, 28, 18, 0, Math.PI * 2);
      x.stroke();
      return c.toDataURL();
    } catch (_) {
      return '';
    }
  }

  var fingerprintPromise = null;
  function fingerprint() {
    if (fingerprintPromise) return fingerprintPromise;
    fingerprintPromise = sha256Hex([
      navigator.userAgent || '',
      (navigator.languages || []).join(',') || navigator.language || '',
      Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      screen.width + 'x' + screen.height + 'x' + screen.colorDepth,
      navigator.platform || '',
      navigator.hardwareConcurrency || '',
      navigator.deviceMemory || '',
      navigator.maxTouchPoints || '',
      canvasSignal()
    ].join('|'));
    return fingerprintPromise;
  }

  function workerBase() {
    if (window.kolkliWorker) return window.kolkliWorker('usage') || window.kolkliWorker('storage') || '';
    var w = window.KOLKLI_WORKERS || {};
    var u = w.usage || w.storage || '';
    return (u && u.indexOf('YOUR_') !== 0) ? u.replace(/\/+$/, '') : '';
  }

  async function authToken() {
    try {
      if (window.KolkliAuth && window.KolkliAuth.configured()) return await window.KolkliAuth.getToken();
    } catch (_) {}
    return null;
  }

  function clientPayload(tool, payload) {
    return fingerprint().then(function (fp) {
      return {
        tool: tool,
        payload: payload || {},
        anonymousId: anonymousId(),
        fingerprint: fp
      };
    });
  }

  function localPayloadLimit(tool, payload) {
    var limit = toolLimit(tool);
    payload = payload || {};
    if (!limit) return null;
    var files = +(payload.files || payload.fileCount || 0);
    var folders = +(payload.folders || payload.folderCount || 0);
    var bytes = +(payload.bytes || payload.totalBytes || 0);
    if (limit.maxFiles != null && files > limit.maxFiles) return { ok: false, code: 'payload_limit', field: 'files', max: limit.maxFiles, actual: files };
    if (limit.maxFolders != null && folders > limit.maxFolders) return { ok: false, code: 'payload_limit', field: 'folders', max: limit.maxFolders, actual: folders };
    if (limit.maxBytes != null && bytes > limit.maxBytes) return { ok: false, code: 'payload_limit', field: 'bytes', max: limit.maxBytes, actual: bytes };
    return null;
  }

  async function call(action, body) {
    var base = workerBase();
    if (!base) {
      if (window.KOLKLI_USAGE_STRICT) return { ok: false, code: 'server_unavailable' };
      return { ok: true, skipped: true, reason: 'worker_not_configured' };
    }

    var token = await authToken();
    var headers = { 'content-type': 'application/json' };
    if (token) headers.authorization = 'Bearer ' + token;

    var res;
    try {
      res = await fetch(base + '/usage/' + action, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body)
      });
    } catch (_) {
      return { ok: false, code: 'server_unavailable' };
    }
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok && data.ok !== false) data.ok = false;
    return data;
  }

  async function authorize(tool, payload) {
    if (isExempt()) return { ok: true, exempt: true };
    var local = localPayloadLimit(tool, payload);
    if (local) return local;

    // Guest email-verification gate (verify.js). Signed-in/paid users and
    // already-verified guests pass straight through; everyone else confirms a
    // 6-digit code first. The Worker re-checks the token, so this isn't just UI.
    if (window.KolkliVerify && KolkliVerify.required(tool) && !KolkliVerify.isVerified()) {
      var okv = await KolkliVerify.ensureVerified({});
      if (!okv) return { ok: false, code: 'verify_required' };
    }

    var body = await clientPayload(tool, payload);
    if (window.KolkliVerify && KolkliVerify.token) body.verifyToken = KolkliVerify.token();
    var res = await call('authorize', body);
    // Local token stale/rejected by the server → re-verify once, then retry.
    if (res && res.code === 'verify_required' && window.KolkliVerify) {
      KolkliVerify.clear();
      var okv2 = await KolkliVerify.ensureVerified({});
      if (!okv2) return { ok: false, code: 'verify_required' };
      body.verifyToken = KolkliVerify.token();
      res = await call('authorize', body);
    }
    return res;
  }

  async function commit(ticket) {
    if (!ticket) return { ok: true };
    return call('commit', { ticket: ticket });
  }

  async function cancel(ticket) {
    if (!ticket) return { ok: true };
    return call('cancel', { ticket: ticket });
  }

  async function guard(tool, payload, work) {
    var auth = await authorize(tool, payload || {});
    if (!auth.ok) {
      showBlocked(auth, tool);
      throw usageError(auth);
    }
    try {
      var value = await work(auth);
      var done = await commit(auth.ticket);
      if (!done.ok) {
        showBlocked(done, tool);
        throw usageError(done);
      }
      return value;
    } catch (err) {
      if (auth && auth.ticket) await cancel(auth.ticket).catch(function () {});
      throw err;
    }
  }

  async function consume(tool, payload) {
    return guard(tool, payload || {}, function () { return Promise.resolve(true); });
  }

  // One-shot 7-day-trial claim, gated server-side by fingerprint + anon id + IP
  // (mirrors authorize()). Returns { ok, granted } from the Worker, or
  // { ok:true, skipped:true } when no Worker is configured (caller then falls
  // back to the local fingerprint ledger). Used by trial.js.
  async function claimTrial(payload) {
    return call('trial-claim', await clientPayload('trial', payload || {}));
  }

  function usageError(info) {
    var e = new Error((info && info.code) || 'usage_limit');
    e.usage = info || {};
    return e;
  }

  function messageFor(info) {
    var t = TXT[lang()] || TXT.he;
    info = info || {};
    if (info.code === 'payload_limit') {
      if (info.field === 'files') return t.files(info.max);
      if (info.field === 'folders') return t.folders(info.max);
      if (info.field === 'bytes') return t.bytes(info.max);
    }
    if (info.code === 'ip_rate_limited' || info.code === 'ip_daily_limited' || info.code === 'ip_quota_exceeded') return t.rate;
    if (info.code === 'server_unavailable') return t.server;
    return t.body;
  }

  function ensureModal() {
    var existing = document.getElementById('kuLimit');
    if (existing) return existing;

    var style = document.createElement('style');
    style.id = 'kuLimitStyle';
    style.textContent =
      '.ku-limit{position:fixed;inset:0;z-index:1300;display:none;align-items:center;justify-content:center;padding:18px;background:rgba(16,18,32,.52);backdrop-filter:blur(5px);}' +
      '.ku-limit.show{display:flex;}' +
      '.ku-box{width:min(420px,100%);background:var(--panel,#fff);color:var(--ink,#1c2030);border:1px solid var(--line,#e5e8f0);border-radius:16px;box-shadow:var(--shadow-lg,0 24px 60px rgba(20,24,44,.24));padding:22px;text-align:center;font-family:var(--sans,system-ui,sans-serif);}' +
      '.ku-ico{width:48px;height:48px;border-radius:14px;margin:0 auto 12px;display:flex;align-items:center;justify-content:center;background:var(--accent-soft,#efe9fe);color:var(--accent,#7c3aed);}' +
      '.ku-ico svg{width:24px;height:24px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;}' +
      '.ku-box h3{margin:0 0 6px;font-size:19px;}' +
      '.ku-box p{margin:0 0 18px;color:var(--muted,#727a8a);font-size:14px;line-height:1.55;}' +
      '.ku-actions{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;}' +
      '.ku-login,.ku-close{height:40px;border-radius:999px;padding:0 16px;font:600 13.5px var(--sans,system-ui,sans-serif);cursor:pointer;}' +
      '.ku-login{border:0;color:#fff;background:var(--grad-btn,linear-gradient(105deg,#7b34ff,#3f85ff));box-shadow:0 6px 16px var(--grad-btn-glow,rgba(59,111,246,.35));}' +
      '.ku-close{border:1px solid var(--line,#e5e8f0);background:var(--panel,#fff);color:var(--ink-2,#2b3140);}';
    document.head.appendChild(style);

    var node = document.createElement('div');
    node.className = 'ku-limit';
    node.id = 'kuLimit';
    node.innerHTML =
      '<div class="ku-box" role="dialog" aria-modal="true">' +
        '<div class="ku-ico"><svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div>' +
        '<h3 id="kuTitle"></h3>' +
        '<p id="kuBody"></p>' +
        '<div class="ku-actions">' +
          '<button class="ku-login" id="kuLogin" type="button"></button>' +
          '<button class="ku-close" id="kuClose" type="button"></button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(node);
    node.querySelector('#kuClose').addEventListener('click', function () { node.classList.remove('show'); });
    node.addEventListener('click', function (e) { if (e.target === node) node.classList.remove('show'); });
    node.querySelector('#kuLogin').addEventListener('click', function () {
      node.classList.remove('show');
      location.href = siteRoot() + 'pricing/';
    });
    return node;
  }

  function showBlocked(info) {
    // The verification modal (verify.js) already owns its own UX; don't stack
    // the quota/upgrade modal on top when a guest cancels or fails to verify.
    if (info && info.code === 'verify_required') return;
    var t = TXT[lang()] || TXT.he;
    var modal = ensureModal();
    modal.querySelector('#kuTitle').textContent = t.title;
    modal.querySelector('#kuBody').textContent = messageFor(info);
    modal.querySelector('#kuLogin').textContent = t.login;
    modal.querySelector('#kuClose').textContent = t.close;
    modal.classList.add('show');
  }

  var autoInstalled = false;
  var autoSelector = [
    '[data-usage-tool]',
    '[data-usage-action]',
    'button[data-copy]',
    'button[data-export]',
    '#startBtn',
    '#convBtn',
    '#goBtn',
    '#cutBtn',
    '#cleanBtn',
    '#removeBtn',
    '#genBtn',
    '#generateBtn',
    '#convertBtn',
    '#compressBtn',
    '#mergeBtn',
    '#runBtn',
    '#exportBtn',
    '#copyBtn',
    '#copyAll',
    '#copyLink',
    '#copyLinkBig',
    '#copyHtml',
    '#copyMdBtn',
    '#dlBtn',
    '#dlPng',
    '#dlSvg',
    '#downloadBtn',
    '#dlAllBtn',
    '#dlTxtBtn',
    '#expSrt',
    '#expVtt',
    '#expTxt',
    '#expBurn',
    '#randomBtn',
    '#randBtn',
    '#regenBtn',
    '#openBtn',
    '#useScreenBtn'
  ].join(',');

  var excludedAutoPages = toSet([
    'admin', 'auth', 'checkout', 'dashboard', 'download', 'files',
    'folder-panel', 'index', 'proof', 'request', 'review', 'select',
    'send', 'upload'
  ]);
  var aiPages = toSet([
    'remove-bg', 'restore-image', 'subtitle-generator'
  ]);
  var textPages = toSet([
    'ad-text-checker', 'copy-generator', 'cta-generator',
    'filename-generator', 'lorem-ipsum-generator', 'mailto-link',
    'redirect-generator', 'text-tools', 'utm-builder', 'whatsapp-link'
  ]);
  var designPages = toSet([
    'border-radius', 'box-shadow', 'color-code-generator',
    'color-convert', 'contrast-checker', 'embed-code',
    'favicon-generator', 'gradient-generator', 'image-color-picker',
    'image-to-base64', 'link-preview', 'minify', 'palette-generator',
    'password-generator', 'percent-calculator', 'qr-generator',
    'screen-units', 'timezone-converter', 'unit-converter',
    'uuid-generator', 'work-hours-calculator'
  ]);
  var editPages = toSet([
    'app', 'archive-convert', 'audio-editor', 'compress-audio',
    'compress-image', 'compress-pdf', 'compress-video', 'compress-zip',
    'convert', 'crop-image', 'doc-convert', 'doc-to-pdf',
    'ebook-convert', 'extract-audio', 'font-convert', 'heic-to-jpg',
    'image-convert', 'merge-audio', 'merge-pdf', 'mp4-to-mp3',
    'pdf-to-jpg', 'presentation-convert', 'resize-image',
    'spreadsheet-convert', 'video-convert', 'video-cut', 'watermark'
  ]);
  var bypassIds = toSet([
    'againBtn', 'backBtn', 'chooseBtn', 'chooseFolderBtn', 'clearBtn',
    'closeBtn', 'confirmNo', 'confirmYes', 'delBtn', 'editBtn',
    'helpBtn', 'langBtn', 'moreBtn', 'newBtn', 'resetBtn',
    'restartBtn', 'sampleBtn', 'themeToggle'
  ]);
  var fastActionIds = toSet([
    'copyBtn', 'copyAll', 'copyLink', 'copyLinkBig', 'copyHtml',
    'copyMdBtn', 'dlBtn', 'dlPng', 'dlSvg', 'downloadBtn',
    'dlAllBtn', 'dlTxtBtn', 'expSrt',
    'expVtt', 'expTxt', 'expBurn', 'randomBtn', 'randBtn',
    'genBtn', 'generateBtn', 'regenBtn', 'openBtn', 'useScreenBtn'
  ]);

  function toSet(items) {
    var set = {};
    items.forEach(function (x) { set[x] = true; });
    return set;
  }

  function pageStem() {
    var p = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    return p.replace(/\.html?$/, '') || 'index';
  }

  function cleanSlug(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/\.html?$/, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'tool';
  }

  function currentAutoTool() {
    var stem = pageStem();
    if (excludedAutoPages[stem]) return '';
    if (stem.indexOf('ai-') === 0 || aiPages[stem]) return 'ai:' + stem;
    if (stem === 'text-tools') return 'text:' + cleanSlug(location.hash.replace(/^#/, '') || 'reverse');
    if (textPages[stem]) return 'text:' + stem;
    if (designPages[stem]) return 'design:' + stem;
    if (editPages[stem] || /(^|-)convert$/.test(stem) || stem.indexOf('compress-') === 0) return 'edit:' + stem;
    return '';
  }

  function targetAction(target) {
    return target.getAttribute('data-usage-action') || target.id || cleanSlug(target.name || target.textContent || 'action');
  }

  function shouldGuardTarget(target) {
    if (!target || target.disabled) return false;
    if (target.getAttribute('data-usage-skip') === 'true') return false;
    if (target.closest && target.closest('#kuLimit,#site-header,#authModal,.auth-modal,.sh-nav')) return false;
    if (target.id && bypassIds[target.id]) return false;
    return true;
  }

  function payloadFromPage() {
    var inputs = document.querySelectorAll('input[type="file"]');
    var files = 0;
    var bytes = 0;
    Array.prototype.forEach.call(inputs, function (input) {
      Array.prototype.forEach.call(input.files || [], function (file) {
        files++;
        bytes += file.size || 0;
      });
    });
    return { files: files, totalBytes: bytes };
  }

  function isVisible(node) {
    if (!node) return false;
    var style = window.getComputedStyle ? getComputedStyle(node) : null;
    if (style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) return false;
    return !!(node.offsetWidth || node.offsetHeight || node.getClientRects().length);
  }

  function hasText(node) {
    if (!node || !isVisible(node)) return false;
    var value = typeof node.value === 'string' ? node.value : node.textContent;
    return String(value || '').trim().length > 0;
  }

  function resultScore() {
    var score = 0;
    [
      '#rlist [data-dl]',
      '#results [data-dl]',
      '#result [data-dl]',
      '#resultCard.show',
      '#outCard.show',
      '#shareCard.show',
      '.result.show',
      '.results.show',
      '.download.show',
      '[data-result].show'
    ].forEach(function (sel) {
      try { score += document.querySelectorAll(sel).length; } catch (_) {}
    });

    [
      '#dlBtn',
      '#downloadBtn',
      '#dlAllBtn',
      '#dlTxtBtn',
      '#copyBtn',
      '#copyAll'
    ].forEach(function (sel) {
      var n = document.querySelector(sel);
      if (n && !n.disabled && isVisible(n)) score++;
    });

    [
      '#ttOut',
      '#out',
      '#output',
      '#resultText',
      '#summaryOut',
      '#linkOut',
      '#htmlOut',
      '#metaOut',
      '#outUrl',
      '#payloadOut',
      '#snipOut',
      '#cssStr',
      '#codeOut'
    ].forEach(function (sel) {
      var n = document.querySelector(sel);
      if (hasText(n)) score++;
    });
    return score;
  }

  function successDelayFor(tool, action) {
    if (fastActionIds[action]) return 350;
    if (tool.indexOf('text:') === 0 || tool.indexOf('design:') === 0) return 600;
    return 0;
  }

  function waitForAutoSuccess(tool, action, before) {
    var quick = successDelayFor(tool, action);
    if (quick) {
      return new Promise(function (resolve) {
        setTimeout(function () {
          var after = resultScore();
          resolve(after > before || after > 0);
        }, quick);
      });
    }

    var started = Date.now();
    var maxMs = tool.indexOf('ai:') === 0 ? 10 * 60 * 1000 : 5 * 60 * 1000;
    return new Promise(function (resolve) {
      var done = false;
      var obs = null;
      function finish(value) {
        if (done) return;
        done = true;
        if (obs) obs.disconnect();
        clearInterval(timer);
        resolve(value);
      }
      function check() {
        if (resultScore() > before) finish(true);
        else if (Date.now() - started > maxMs) finish(false);
      }
      var timer = setInterval(check, 500);
      if (window.MutationObserver) {
        obs = new MutationObserver(check);
        obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'disabled', 'hidden'] });
      }
      setTimeout(check, 500);
    });
  }

  async function runAutoGuard(target, tool, action) {
    if (target.__kuPending) return;
    target.__kuPending = true;
    var before = resultScore();
    var auth = await authorize(tool, payloadFromPage());
    if (!auth.ok) {
      target.__kuPending = false;
      showBlocked(auth, tool);
      return;
    }

    target.__kuAllow = true;
    target.click();

    try {
      var ok = await waitForAutoSuccess(tool, action, before);
      if (ok) {
        var done = await commit(auth.ticket);
        if (!done.ok) showBlocked(done, tool);
      } else {
        await cancel(auth.ticket);
      }
    } finally {
      target.__kuPending = false;
      target.__kuAllow = false;
    }
  }

  function installAutoLimits() {
    if (autoInstalled || !document.addEventListener) return;
    autoInstalled = true;
    document.addEventListener('click', function (e) {
      var target = e.target && e.target.closest ? e.target.closest(autoSelector) : null;
      if (!shouldGuardTarget(target)) return;

      if (target.__kuAllow) {
        target.__kuAllow = false;
        return;
      }

      var tool = target.getAttribute('data-usage-tool') || currentAutoTool();
      if (!tool || !toolLimit(tool)) return;

      var action = targetAction(target);
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      runAutoGuard(target, tool, action).catch(function () {
        target.__kuPending = false;
      });
    }, true);
  }

  window.KolkliUsage = {
    limits: LIMITS,
    configured: function () { return !!workerBase(); },
    currentPlan: currentPlan,
    isExempt: isExempt,
    fileByteCap: fileByteCap,
    fileByteCaps: FILE_BYTE_CAP,
    anonymousId: anonymousId,
    fingerprint: fingerprint,
    authorize: authorize,
    commit: commit,
    cancel: cancel,
    guard: guard,
    consume: consume,
    claimTrial: claimTrial,
    showBlocked: showBlocked,
    formatBytes: fmtBytes,
    currentTool: currentAutoTool,
    installAutoLimits: installAutoLimits
  };

  installAutoLimits();
})();
