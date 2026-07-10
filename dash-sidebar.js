/* =====================================================================
   dash-sidebar.js  —  the dashboard's right-hand rail, as a drop-in
   component for standalone tool pages (text-tools.html, …).

   It mirrors dashboard.html's renderSide() output and reads the SAME
   localStorage state (session, users, plan, scoped usage), so a signed-in
   user sees their real plan (Studio/Creator/Free), real storage usage and
   real account name/avatar — identical to the dashboard rail.

   Usage:  <div id="dashRail"></div>  +  <script src="./dash-sidebar.js"></script>
   Nav items deep-link into the dashboard via its hash router
   (dashboard.html#project-receive, #favorites, #team, …).
   Optional: window.KolkliSidebar.setLang('he'|'en'|'ru') to follow a page
   language switch;  window.KolkliSidebar.render() to force a refresh.
   ===================================================================== */
(function () {
  'use strict';
  var MOUNT_ID = 'dashRail';

  /* ---------- keys / plans (mirror dashboard.html) ---------- */
  var INF = Infinity;
  var USERS_KEY = 'ac_users', SESSION_KEY = 'ac_session', PROJECTS_KEY = 'ac_projects';
  var PLANS = {
    free:    { name: 'Free',    limits: { storageGB: 3 } },
    creator: { name: 'Creator', limits: { storageGB: 250 } },
    studio:  { name: 'Studio',  limits: { storageGB: 1000 } }
  };
  var PLAN_ICON = { free: 'zap', creator: 'crown', studio: 'shield' };

  /* ---------- localStorage helpers (same owner-scoping as the dashboard) ---------- */
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function loadUsers() { try { return JSON.parse(lsGet(USERS_KEY)) || []; } catch (e) { return []; } }
  function safeOwnerId(v) { return String(v || 'guest').toLowerCase().replace(/[^a-z0-9_.@-]+/g, '_') || 'guest'; }
  function currentOwnerId() {
    var email = (lsGet(SESSION_KEY) || '').toLowerCase();
    if (!email) return 'guest';
    var u = loadUsers().find(function (x) { return (x.email || '').toLowerCase() === email; });
    return safeOwnerId((u && (u.id || u.userId)) || email);
  }
  function lsGetOwn(k) { return lsGet(k + '::' + currentOwnerId()); }
  function readOwnArray(k) { try { var a = JSON.parse(lsGetOwn(k) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function loadProjects() { try { var l = JSON.parse(lsGetOwn(PROJECTS_KEY)); if (Array.isArray(l)) return l; } catch (e) {} return []; }

  /* ---------- user / plan ---------- */
  var user = { name: 'Guest', email: '', plan: 'free' }, isGuest = true, plan = 'free';
  function normalizePlan(p) { p = String(p || '').toLowerCase(); if (p === 'lite') return 'creator'; if (p === 'pro' || p === 'business') return 'studio'; return PLANS[p] ? p : 'free'; }
  function loadUser() {
    var email = lsGet(SESSION_KEY);
    var u = email ? loadUsers().find(function (x) { return x.email === email; }) : null;
    if (u) { isGuest = false; user = u; plan = normalizePlan(u.plan); }
    else { isGuest = true; user = { name: 'Guest', email: '', plan: 'free' }; plan = 'free'; }
    if (!PLANS[plan]) plan = 'free';
  }
  function displayName() { return (user.name && user.name.trim()) ? user.name.trim() : (user.email ? user.email.split('@')[0] : 'Guest'); }
  function initial() { return displayName().charAt(0).toUpperCase(); }
  function avatarInner() { return user.avatar ? '<img class="avatar-img" src="' + esc(user.avatar) + '" alt="">' : esc(initial()); }

  /* ---------- storage usage (same sum as dashboard currentUsage) ---------- */
  function usedStorageGB() {
    var bytes = 0;
    loadProjects().forEach(function (p) { bytes += (Number(p.sizeMB) || 0) * 1e6; });
    (window.KR ? KR.loadRequests() : readOwnArray('kr_requests')).forEach(function (r) {
      (r.files || []).forEach(function (f) { bytes += Number(f.size) || 0; });
    });
    readOwnArray('kolkli_send_links').forEach(function (s) { bytes += Number(s.bytes) || 0; });
    readOwnArray('rv_projects').forEach(function (p) {
      (p.items || []).forEach(function (f) { bytes += Number(f.size) || 0; });
    });
    return Math.round((bytes / 1e9) * 100) / 100;
  }
  function fmtStorageGB(gb) {
    if (gb === INF) return '∞';
    gb = Math.max(0, Number(gb) || 0);
    if (gb >= 1000) return (Math.round(gb / 1000 * 10) / 10) + ' TB';
    if (gb >= 1) return (Math.round(gb * 10) / 10) + ' GB';
    var mb = gb * 1000;
    return (mb < 10 ? Math.round(mb * 10) / 10 : Math.round(mb)) + ' MB';
  }
  function storagePct(used, limit) { used = Number(used) || 0; if (!limit || limit === INF) return 0; return Math.max(0, Math.min(100, Math.round(used / limit * 100))); }

  /* ---------- i18n ---------- */
  var STR = {
    he: { projects: 'הפרויקטים שלי', mytools: 'הקבצים שלי', editing: 'כלי עריכה', ai: 'כלי AI', design: 'כלי עיצוב ודיגיטל', text: 'כלי טקסט', favorites: 'מועדפים', team: 'צוות', yourPlan: 'המנוי הפעיל שלך', upgrade: 'שדרגו מנוי', logout: 'התנתקות', myAccount: 'החשבון שלי', settings: 'הגדרות חשבון', payments: 'תשלומים', storage: 'STORAGE', used: 'נוצל', of: 'מתוך', left: 'נותר' },
    en: { projects: 'My Projects', mytools: 'My Files', editing: 'Editing Tools', ai: 'AI Tools', design: 'Design & Digital', text: 'Text Tools', favorites: 'Favorites', team: 'Team', yourPlan: 'Your active plan', upgrade: 'Upgrade plan', logout: 'Log out', myAccount: 'My Account', settings: 'Account Settings', payments: 'Payments', storage: 'STORAGE', used: 'Used', of: 'of', left: 'Left' },
    ru: { projects: 'Мои проекты', mytools: 'Мои файлы', editing: 'Editing Tools', ai: 'AI Tools', design: 'Design & Digital', text: 'Text Tools', favorites: 'Избранное', team: 'Команда', yourPlan: 'Ваш активный план', upgrade: 'Улучшить план', logout: 'Выйти', myAccount: 'Мой аккаунт', settings: 'Настройки аккаунта', payments: 'Платежи', storage: 'STORAGE', used: 'Used', of: 'of', left: 'Left' }
  };
  var lang = 'he';
  function detectLang() {
    var c = lsGet('ac_lang'); if (c && STR[c]) return c;
    var cc = lsGet('ac_country'); if (cc) return cc === 'IL' ? 'he' : 'en';
    var tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) {}
    var navHe = (navigator.language || '').toLowerCase().indexOf('he') === 0;
    return (tz === 'Asia/Jerusalem' || navHe) ? 'he' : 'en';
  }
  function T() { return STR[lang] || STR.he; }

  /* ---------- icons ---------- */
  function esc(x) { return String(x).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var ICON = {
    layers: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
    files: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
    scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/>',
    sparkles: '<path d="m12 3-1.8 5.4a2 2 0 0 1-1.3 1.3L3.5 11.5l5.4 1.8a2 2 0 0 1 1.3 1.3L12 20l1.8-5.4a2 2 0 0 1 1.3-1.3l5.4-1.8-5.4-1.8a2 2 0 0 1-1.3-1.3z"/><path d="M5 3v3"/><path d="M19 18v3"/><path d="M3.5 5h3"/><path d="M17.5 19.5h3"/>',
    palette: '<circle cx="13.5" cy="6.5" r="1.1"/><circle cx="17" cy="10.5" r="1.1"/><circle cx="8" cy="7" r="1.1"/><circle cx="6.5" cy="12" r="1.1"/><path d="M12 3C6.5 3 2 7.1 2 12.2 2 17.1 6.1 21 11.2 21H13a2 2 0 0 0 2-2c0-.5-.2-.9-.5-1.3-.3-.4-.5-.8-.5-1.2A1.5 1.5 0 0 1 15.5 15H17c2.8 0 5-2.2 5-5 0-3.9-4.5-7-10-7Z"/>',
    text: '<path d="M4 7V5h16v2"/><path d="M9 19h6"/><path d="M12 5v14"/>',
    star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    crown: '<path d="M2 7l4.5 4L12 4l5.5 7L22 7l-2 12H4L2 7z"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a7 7 0 0 1 14 0v1"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>',
    card: '<rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>'
  };
  function s(inner) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + (inner || '') + '</svg>'; }

  /* ---------- html builders (mirror the dashboard rail) ---------- */
  function catHead(icon, label, href) {
    return '<div class="cat no-subs"><a class="cat-head" href="' + esc(href) + '">' +
      '<span class="cat-ic">' + s(ICON[icon]) + '</span>' +
      '<span class="cat-name">' + esc(label) + '</span></a></div>';
  }
  function toolLinks() {
    var st = T();
    var links = [
      { cls: 'editing', icon: 'scissors', label: st.editing, href: 'dashboard.html#editing-tools' },
      { cls: 'ai',      icon: 'sparkles', label: st.ai,      href: 'dashboard.html#ai-tools' },
      { cls: 'design',  icon: 'palette',  label: st.design,  href: 'dashboard.html#dev-tools' },
      { cls: 'text',    icon: 'text',     label: st.text,    href: 'text-tools.html', active: true }
    ];
    return '<div class="side-links">' + links.map(function (x) {
      return '<a class="side-link ' + x.cls + (x.active ? ' active' : '') + '" href="' + esc(x.href) + '">' +
        '<span class="side-link-ic">' + s(ICON[x.icon]) + '</span><span>' + esc(x.label) + '</span></a>';
    }).join('') + '</div>';
  }
  function belowTools() {
    var st = T();
    return '<div class="side-below-tools">' +
      catHead('star', st.favorites, 'dashboard.html#favorites') +
      catHead('users', st.team, 'dashboard.html#team') + '</div>';
  }
  function storageHtml() {
    var st = T(), used = usedStorageGB(), total = PLANS[plan].limits.storageGB;
    var p = storagePct(used, total), leftv = (total === INF ? INF : Math.max(0, total - used));
    return '<div class="storage-chip">' +
      '<span class="storage-ring" style="--p:' + p + '"><span>' + p + '%</span></span>' +
      '<span class="storage-tx">' +
        '<span class="storage-title">' + esc(st.storage) + '</span>' +
        '<span class="storage-line">' + esc(st.used + ' ' + fmtStorageGB(used) + ' ' + st.of + ' ' + fmtStorageGB(total)) + '</span>' +
        '<span class="storage-left">' + esc(st.left + ' ' + fmtStorageGB(leftv)) + '</span>' +
      '</span></div>';
  }
  function planHtml() {
    var P = PLANS[plan], st = T();
    return '<div class="side-plan"><div class="plan-card">' +
      '<div class="planchip">' +
        '<span class="pc-ic">' + s(ICON[PLAN_ICON[plan]]) + '</span>' +
        '<span class="pc-tx"><span class="pc-lbl">' + esc(st.yourPlan) + '</span><span class="pc-name">' + esc(P.name) + '</span></span>' +
      '</div>' + storageHtml() + '</div>' +
      (plan === 'studio' ? '' : '<a class="upg" href="pricing/">' + s(ICON.zap) + '<span>' + esc(st.upgrade) + '</span></a>') +
    '</div>';
  }
  function accountHtml() {
    if (isGuest) return '';
    var name = displayName(), st = T();
    return '<div class="side-account"><div class="dash-acct" id="sideAcct">' +
      '<button class="dash-acct-btn" id="sideAcctBtn" type="button" aria-haspopup="menu" aria-expanded="false" aria-label="' + esc(name) + '">' +
        '<span class="dash-avatar-sm">' + avatarInner() + '</span>' +
        '<span class="dash-acct-name">' + esc(name) + '</span>' +
        '<svg class="dash-acct-chev" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>' +
      '</button>' +
      '<div class="dash-acct-menu" role="menu">' +
        '<div class="dash-acct-head"><span class="dash-acct-av">' + avatarInner() + '</span>' +
          '<span class="dash-acct-id"><span class="dash-acct-full">' + esc(name) + '</span>' +
          (user.email ? '<span class="dash-acct-mail">' + esc(user.email) + '</span>' : '') + '</span></div>' +
        '<div class="dash-acct-sep"></div>' +
        '<a class="dash-acct-item" role="menuitem" href="dashboard.html#account">' + s(ICON.user) + '<span>' + esc(st.myAccount) + '</span></a>' +
        '<a class="dash-acct-item" role="menuitem" href="account-settings.html">' + s(ICON.gear) + '<span>' + esc(st.settings) + '</span></a>' +
        '<a class="dash-acct-item" role="menuitem" href="dashboard.html#payments">' + s(ICON.card) + '<span>' + esc(st.payments) + '</span></a>' +
        '<div class="dash-acct-sep"></div>' +
        '<button class="dash-acct-item danger" type="button" data-side-logout>' + s(ICON.logout) + '<span>' + esc(st.logout) + '</span></button>' +
      '</div></div></div>';
  }
  function railHtml() {
    var st = T();
    return catHead('layers', st.projects, 'dashboard.html#project-receive') +
      catHead('files', st.mytools, 'dashboard.html#my-audio') +
      toolLinks() + belowTools() + planHtml() + accountHtml();
  }

  /* ---------- render + events ---------- */
  function render() {
    var m = document.getElementById(MOUNT_ID);
    if (!m) return;
    loadUser();
    m.innerHTML = '<div class="side-nav-card">' + railHtml() + '</div>';
  }
  function closeAcct() {
    var w = document.getElementById('sideAcct'), b = document.getElementById('sideAcctBtn');
    if (w) w.classList.remove('open');
    if (b) b.setAttribute('aria-expanded', 'false');
  }
  function onDocClick(e) {
    var btn = e.target.closest ? e.target.closest('#sideAcctBtn') : null;
    if (btn) { e.preventDefault(); var w = document.getElementById('sideAcct'); var open = w.classList.toggle('open'); btn.setAttribute('aria-expanded', open ? 'true' : 'false'); return; }
    if (e.target.closest && e.target.closest('[data-side-logout]')) { e.preventDefault(); lsDel(SESSION_KEY); try { window.dispatchEvent(new CustomEvent('kolkli:auth')); } catch (_) {} location.href = 'dashboard.html'; return; }
    if (!(e.target.closest && e.target.closest('#sideAcct'))) closeAcct();
  }

  /* ---------- styles (copied verbatim from dashboard.html's rail) ---------- */
  var CSS =
    '.side-nav-card{display:flex;flex-direction:column;gap:4px;}' +
    '.cat{border-radius:12px;}' +
    '.cat-head{display:flex;align-items:center;gap:11px;width:100%;padding:11px 12px;border:none;background:none;cursor:pointer;color:var(--ink-2);font-family:var(--sans);font-size:14.5px;font-weight:700;border-radius:11px;text-align:start;transition:background .12s,color .12s;}' +
    '.cat-head:hover{background:var(--panel-2);}' +
    '.cat-ic{width:34px;height:34px;flex-shrink:0;border-radius:10px;display:flex;align-items:center;justify-content:center;background:var(--grad-soft);color:var(--accent);}' +
    '.cat-ic svg{width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;}' +
    '.cat-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
    '.side-links{display:flex;flex-direction:column;gap:4px;margin-top:2px;padding-top:6px;}' +
    '.side-link{display:flex;align-items:center;gap:11px;min-height:44px;padding:9px 12px;border-radius:12px;color:var(--ink-2);width:100%;border:0;background:transparent;font-family:var(--sans);font-size:14px;font-weight:800;text-align:start;cursor:pointer;transition:background .12s,color .12s;}' +
    '.side-link:hover,.side-link.active{background:var(--tool-bg,var(--panel-2));color:var(--tool,var(--accent-dim));}' +
    '.side-link-ic{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;flex-shrink:0;background:var(--tool-bg,var(--accent-soft));color:var(--tool,var(--accent-dim));}' +
    '.side-link-ic svg{width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;}' +
    '.side-link.ai{--tool:#9333ea;--tool-bg:rgba(147,51,234,.12);}' +
    '.side-link.editing{--tool:#7c3aed;--tool-bg:rgba(124,58,237,.12);}' +
    '.side-link.design{--tool:#0d9488;--tool-bg:rgba(13,148,136,.12);}' +
    '.side-link.text{--tool:#be123c;--tool-bg:rgba(190,18,60,.12);}' +
    '.side-below-tools{border-top:1px solid var(--line);margin-top:8px;padding-top:10px;}' +
    '.side-plan{margin-top:8px;border-top:1px solid var(--line);padding-top:12px;}' +
    '.plan-card{border:1px solid var(--line);border-radius:14px;overflow:hidden;background:var(--panel);box-shadow:var(--shadow-sm);}' +
    '.planchip{display:flex;align-items:center;gap:11px;padding:12px;background:var(--grad-soft);border:none;border-radius:0;}' +
    '.planchip .pc-ic{width:36px;height:36px;flex-shrink:0;border-radius:10px;display:flex;align-items:center;justify-content:center;background:var(--grad);color:#fff;box-shadow:0 4px 12px var(--grad-shadow);}' +
    '.planchip .pc-ic svg{width:19px;height:19px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;}' +
    '.planchip .pc-tx{min-width:0;flex:1;display:flex;flex-direction:column;}' +
    '.planchip .pc-lbl{font-family:var(--mono);font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);}' +
    '.planchip .pc-name{font-size:15px;font-weight:800;line-height:1.2;}' +
    '.storage-chip{display:flex;align-items:center;gap:12px;margin-top:0;padding:12px;border-radius:0;background:transparent;border:none;border-top:1px solid var(--line);box-shadow:none;}' +
    '.storage-ring{--p:0;width:54px;height:54px;border-radius:50%;flex-shrink:0;display:grid;place-items:center;position:relative;background:conic-gradient(var(--accent) calc(var(--p) * 1%), var(--line) 0);}' +
    '.storage-ring::before{content:"";position:absolute;inset:7px;border-radius:50%;background:var(--panel);}' +
    '.storage-ring span{position:relative;font-family:var(--mono);font-size:12px;font-weight:900;color:var(--ink);}' +
    '.storage-tx{min-width:0;display:flex;flex-direction:column;gap:1px;}' +
    '.storage-title{font-size:13px;font-weight:850;color:var(--ink-2);line-height:1.15;}' +
    '.storage-line{font-size:11.5px;font-weight:650;color:var(--muted);line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
    '.storage-left{font-size:11px;color:var(--accent-dim);font-weight:800;}' +
    '.side-plan .upg{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;margin-top:9px;color:#fff;border:none;cursor:pointer;background:linear-gradient(180deg,rgba(255,255,255,.25),rgba(255,255,255,0) 55%),var(--grad-btn);font-weight:700;font-size:13.5px;padding:11px 14px;border-radius:11px;text-shadow:0 1px 2px rgba(0,0,0,.18);box-shadow:inset 0 1px 0 rgba(255,255,255,.5),0 6px 16px var(--grad-btn-glow);transition:filter .14s,transform .08s;}' +
    '.side-plan .upg:hover{filter:brightness(1.05);}.side-plan .upg:active{transform:translateY(1px);}' +
    '.side-plan .upg svg{width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round;}' +
    '.side-account{width:100%;margin-top:14px;padding-top:14px;}' +
    '.dash-acct{position:relative;display:inline-flex;align-items:center;width:100%;}' +
    '.dash-acct-btn{display:inline-flex;align-items:center;gap:8px;height:52px;padding:0 10px;border-radius:14px;border:1px solid var(--line);background:var(--panel);color:var(--ink-2);cursor:pointer;font-family:var(--sans);font-weight:750;font-size:14px;width:100%;justify-content:flex-start;box-shadow:var(--shadow-sm);transition:border-color .13s,box-shadow .13s;}' +
    '.dash-acct-btn:hover,.dash-acct.open .dash-acct-btn{border-color:var(--accent);}' +
    '.dash-acct-btn:active{transform:translateY(1px);}' +
    '.dash-avatar-sm,.dash-acct-av{border-radius:50%;overflow:hidden;display:grid;place-items:center;flex-shrink:0;background:var(--grad);color:#fff;font-weight:800;}' +
    '.dash-avatar-sm{width:34px;height:34px;font-size:14px;}' +
    '.dash-acct-av{width:42px;height:42px;font-size:17px;}' +
    '.dash-avatar-sm img,.dash-acct-av img{width:100%;height:100%;object-fit:cover;}' +
    '.dash-acct-name{flex:1;min-width:0;text-align:start;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
    '.dash-acct-chev{width:14px;height:14px;flex-shrink:0;stroke:currentColor;fill:none;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;color:var(--faint);transition:transform .16s;}' +
    '.dash-acct.open .dash-acct-chev{transform:rotate(180deg);}' +
    '.dash-acct-menu{position:absolute;top:auto;bottom:calc(100% + 9px);inset-inline-end:0;width:min(270px,100%);padding:7px;border-radius:16px;background:var(--panel);border:1px solid var(--line);box-shadow:var(--shadow-lg);opacity:0;visibility:hidden;transform:translateY(8px);pointer-events:none;transition:opacity .16s,transform .16s,visibility .16s;z-index:60;}' +
    '.dash-acct.open .dash-acct-menu{opacity:1;visibility:visible;transform:translateY(0);pointer-events:auto;}' +
    '.dash-acct-head{display:flex;align-items:center;gap:12px;padding:11px 12px 13px;}' +
    '.dash-acct-id{min-width:0;display:flex;flex-direction:column;gap:1px;}' +
    '.dash-acct-full{font-size:14px;font-weight:900;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
    '.dash-acct-mail{font-size:12px;font-weight:650;color:var(--muted);direction:ltr;text-align:start;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
    '.dash-acct-sep{height:1px;background:var(--line);margin:5px 7px;}' +
    '.dash-acct-item{display:flex;align-items:center;gap:11px;width:100%;min-height:40px;padding:9px 11px;border:0;border-radius:10px;background:none;color:var(--ink-2);font-family:var(--sans);font-size:13.5px;font-weight:700;text-align:start;cursor:pointer;transition:background .12s,color .12s;}' +
    '.dash-acct-item:hover{background:var(--accent-soft);color:var(--accent-dim);}' +
    '.dash-acct-item.danger{color:var(--danger);}' +
    '.dash-acct-item.danger:hover{background:var(--danger-soft);color:var(--danger);}' +
    '.dash-acct-item svg{width:18px;height:18px;flex-shrink:0;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;}';

  function injectCSS() {
    if (document.getElementById('kolkli-sidebar-css')) return;
    var st = document.createElement('style');
    st.id = 'kolkli-sidebar-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  /* ---------- boot ---------- */
  lang = detectLang();
  function boot() {
    injectCSS();
    render();
    document.addEventListener('click', onDocClick);
    window.addEventListener('kolkli:auth', render);
    window.addEventListener('storage', function (e) {
      if (e && e.key && (e.key === SESSION_KEY || e.key === USERS_KEY || e.key.indexOf('kolkli_favorites') === 0)) render();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.KolkliSidebar = {
    setLang: function (l) { if (STR[l]) { lang = l; render(); } },
    render: render
  };
})();
