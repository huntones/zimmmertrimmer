/* ============================================================
   KOLKLI — Admin Center core framework.

   Loaded by admin.html BEFORE admin-sections.js. Owns:
     • the admin access gate (client-side demo; see note below)
     • bilingual helper T(he,en)  + lang / theme
     • the grouped navigation registry (all modules)
     • a hash router (#dashboard, #users, …)
     • a small self-contained UI kit (cards, KPIs, tables,
       inline SVG charts, drawers, modals, toasts, row menus)
     • a demo DATA layer that merges REAL signed-up users
       (ac_users) with a persisted seed set, plus plans,
       coupons, payments, guests, feature-flags, roles,
       announcements, maintenance and an admin AUDIT log.

   ⚠ SECURITY: the gate is client-side only (reads ac_session +
   a bootstrap email). It is a demo affordance, NOT real access
   control — a real Admin Center MUST enforce admin on the
   server. Every section here is a backend SEAM: swap the DATA
   layer for API calls and the UI is unchanged.
   ============================================================ */
(function () {
  if (window.KAdmin) return;

  /* ---------- tiny dom helpers ---------- */
  function el(id){ return document.getElementById(id); }
  function esc(x){ return String(x==null?'':x).replace(/[&<>"']/g,function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function h(html){ var d=document.createElement('div'); d.innerHTML=html; return d.firstElementChild; }
  function on(node, ev, sel, fn){
    node.addEventListener(ev, function(e){ var t=e.target.closest(sel); if(t && node.contains(t)) fn(e,t); });
  }

  /* ---------- storage ---------- */
  function lsGet(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
  function lsSet(k,v){ try{ localStorage.setItem(k,v); }catch(e){} }
  function lsDel(k){ try{ localStorage.removeItem(k); }catch(e){} }
  function jget(k,d){ try{ var v=JSON.parse(lsGet(k)); return v==null?d:v; }catch(e){ return d; } }
  function jset(k,v){ lsSet(k, JSON.stringify(v)); }

  /* ---------- deterministic pseudo-random (stable demo) ---------- */
  function hashStr(s){ var hh=2166136261>>>0; s=String(s); for(var i=0;i<s.length;i++){ hh^=s.charCodeAt(i); hh=Math.imul(hh,16777619); } return hh>>>0; }
  function rng(seed){ var a=seed>>>0; return function(){ a|=0;a=a+0x6D2B79F5|0; var t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
  function pick(arr, r){ return arr[Math.floor(r()*arr.length)%arr.length]; }
  function ri(r,min,max){ return min+Math.floor(r()*(max-min+1)); }

  var DAY=86400000;

  /* =====================================================
     Access gate  (same convention as auth-store.js)
     ===================================================== */
  var ADMIN_EMAILS = ['digitalzimmer@gmail.com'];
  function sessionEmail(){ return (lsGet('ac_session')||'').toLowerCase(); }
  function isBootstrap(e){ return ADMIN_EMAILS.indexOf((e||'').toLowerCase())>-1; }
  function acUsers(){ return jget('ac_users', []); }
  function currentIsAdmin(){
    var e=sessionEmail(); if(!e) return false;
    if(isBootstrap(e)) return true;
    var u=acUsers().find(function(x){ return (x.email||'').toLowerCase()===e; });
    return !!(u && u.role==='admin');
  }

  /* =====================================================
     Language + theme
     ===================================================== */
  var lang = lsGet('kadmin_lang') || lsGet('ac_lang') || (/(^he)|Jerusalem/.test((navigator.language||'')+ (Intl.DateTimeFormat().resolvedOptions().timeZone||'')) ? 'he':'en');
  if(lang!=='he' && lang!=='en') lang='he';
  function T(he,en){ return lang==='en' ? (en==null?he:en) : he; }
  function applyLang(l){
    lang = (l==='en')?'en':'he';
    lsSet('kadmin_lang', lang); lsSet('ac_lang', lang);
    document.documentElement.lang=lang;
    document.documentElement.dir = lang==='he'?'rtl':'ltr';
    var li=el('langIco'); if(li) li.textContent = lang==='he'?'EN':'עב';
    KAdmin.render();
  }
  function toggleLang(){ applyLang(lang==='he'?'en':'he'); }

  function applyTheme(th){
    var dark = th==='dark';
    document.documentElement.setAttribute('data-theme', dark?'dark':'light');
    lsSet('theme', dark?'dark':'light');
    var ti=el('themeIco'); if(ti) ti.textContent = dark?'☀️':'🌙';
  }
  function toggleTheme(){ applyTheme(document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark'); }

  /* =====================================================
     Icons  (Lucide-ish, single <svg> body)
     ===================================================== */
  function svg(inner, cls){ return '<svg viewBox="0 0 24 24"'+(cls?' class="'+cls+'"':'')+'>'+inner+'</svg>'; }
  var I = {
    dash:'<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    chart:'<path d="M3 3v18h18"/><path d="M7 14l3-4 3 3 5-7"/>',
    activity:'<path d="M3 12h4l2 7 4-16 2 9h6"/>',
    command:'<path d="M9 3a3 3 0 0 0 0 6h6a3 3 0 0 0 0-6 3 3 0 0 0-3 3v6a3 3 0 0 0 3 3 3 3 0 0 0 0-6H9a3 3 0 0 0 0 6 3 3 0 0 0 3-3"/>',
    users:'<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    user:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a7 7 0 0 1 14 0v1"/>',
    ghost:'<path d="M4 20V11a8 8 0 0 1 16 0v9l-3-2-2 2-3-2-3 2-2-2Z"/><circle cx="9" cy="10" r="1"/><circle cx="15" cy="10" r="1"/>',
    sliders:'<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><circle cx="4" cy="12" r="2"/><circle cx="12" cy="10" r="2"/><circle cx="20" cy="14" r="2"/>',
    card:'<rect x="2" y="5" width="20" height="14" rx="2.5"/><line x1="2" y1="10" x2="22" y2="10"/>',
    layers:'<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
    ticket:'<path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2 2 2 0 0 0 0 6 2 2 0 0 1-2 2H5a2 2 0 0 1-2-2 2 2 0 0 0 0-6Z"/><line x1="12" y1="7" x2="12" y2="17" stroke-dasharray="1 3"/>',
    file:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><polyline points="14 2 14 8 20 8"/>',
    menuList:'<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3.5" cy="6" r="1.2"/><circle cx="3.5" cy="12" r="1.2"/><circle cx="3.5" cy="18" r="1.2"/>',
    form:'<rect x="3" y="3" width="18" height="18" rx="2.5"/><line x1="7" y1="8" x2="17" y2="8"/><line x1="7" y1="12" x2="13" y2="12"/><line x1="7" y1="16" x2="15" y2="16"/>',
    edit:'<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4Z"/>',
    image:'<rect x="3" y="3" width="18" height="18" rx="2.5"/><circle cx="8.5" cy="8.5" r="1.8"/><path d="M21 15l-5-5L5 21"/>',
    folder:'<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
    mail:'<rect x="2" y="4" width="20" height="16" rx="2.5"/><path d="m2 6 10 7L22 6"/>',
    bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
    megaphone:'<path d="M3 11v2a1 1 0 0 0 1 1h2l4 4V6L6 10H4a1 1 0 0 0-1 1Z"/><path d="M10 6l9-3v18l-9-3"/>',
    life:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/><line x1="4.9" y1="4.9" x2="9.5" y2="9.5"/><line x1="14.5" y1="14.5" x2="19.1" y2="19.1"/><line x1="14.5" y1="9.5" x2="19.1" y2="4.9"/><line x1="4.9" y1="19.1" x2="9.5" y2="14.5"/>',
    cpu:'<rect x="4" y="4" width="16" height="16" rx="2.5"/><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3"/>',
    server:'<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><line x1="7" y1="7.5" x2="7.01" y2="7.5"/><line x1="7" y1="16.5" x2="7.01" y2="16.5"/>',
    key:'<circle cx="8" cy="8" r="5"/><path d="M11.5 11.5 21 21"/><path d="M17 17l2-2M15 15l2-2"/>',
    plug:'<path d="M9 2v6M15 2v6M6 8h12v3a6 6 0 0 1-12 0Z"/><path d="M12 17v5"/>',
    terminal:'<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="m7 9 3 3-3 3"/><line x1="13" y1="15" x2="17" y2="15"/>',
    listChecks:'<path d="m3 6 1.5 1.5L7 5"/><path d="m3 13 1.5 1.5L7 12"/><line x1="11" y1="6" x2="21" y2="6"/><line x1="11" y1="13" x2="21" y2="13"/><line x1="11" y1="20" x2="21" y2="20"/><path d="m3 20 1.5 1.5L7 19"/>',
    db:'<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
    save:'<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
    wrench:'<path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L3 18v3h3l6.5-6.3a4 4 0 0 0 5.2-5.4l-2.8 2.8-2.1-.6-.6-2.1Z"/>',
    shield:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/>',
    alert:'<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    flag:'<path d="M4 22V4h13l-2 4 2 4H4"/>',
    globe:'<circle cx="12" cy="12" r="9"/><line x1="3" y1="12" x2="21" y2="12"/><path d="M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18Z"/>',
    search:'<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    gauge:'<path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/><path d="m13.4 10.6 4-4"/><path d="M3.5 18a9 9 0 1 1 17 0"/>',
    plus:'<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    trash:'<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    pencil:'<path d="M17 3a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    eye:'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    download:'<path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M5 21h14"/>',
    upload:'<path d="M12 21V9"/><path d="m7 13 5-5 5 5"/><path d="M5 3h14"/>',
    ban:'<circle cx="12" cy="12" r="9"/><line x1="5.6" y1="5.6" x2="18.4" y2="18.4"/>',
    pause:'<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
    play:'<polygon points="6 4 20 12 6 20 6 4"/>',
    refresh:'<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v5h-5"/>',
    login:'<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="M10 17l5-5-5-5"/><line x1="15" y1="12" x2="3" y2="12"/>',
    lock:'<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    unlock:'<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
    mail2:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    more:'<circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/>',
    x:'<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    check:'<polyline points="20 6 9 17 4 12"/>',
    up:'<path d="M12 19V5"/><path d="m5 12 7-7 7 7"/>',
    down:'<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
    crown:'<path d="M2 7l4.5 4L12 4l5.5 7L22 7l-2 12H4L2 7z"/>',
    star:'<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    zap:'<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    hd:'<line x1="22" y1="12" x2="2" y2="12"/><path d="M5.5 5h13a2 2 0 0 1 1.8 1.1l1.7 4.9v6a2 2 0 0 1-2 2h-16a2 2 0 0 1-2-2v-6l1.7-4.9A2 2 0 0 1 5.5 5Z"/><line x1="6" y1="16" x2="6.01" y2="16"/><line x1="10" y1="16" x2="10.01" y2="16"/>',
    wifi:'<path d="M5 12.5a10 10 0 0 1 14 0"/><path d="M8.5 16a5 5 0 0 1 7 0"/><line x1="12" y1="20" x2="12.01" y2="20"/><path d="M2 9a15 15 0 0 1 20 0"/>',
    clock:'<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/>',
    dollar:'<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
    pin:'<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    phone:'<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"/>',
    building:'<rect x="4" y="2" width="16" height="20" rx="2"/><line x1="9" y1="6" x2="9.01" y2="6"/><line x1="15" y1="6" x2="15.01" y2="6"/><line x1="9" y1="10" x2="9.01" y2="10"/><line x1="15" y1="10" x2="15.01" y2="10"/><path d="M9 22v-4h6v4"/>',
    trend:'<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
    cloud:'<path d="M17.5 19a4.5 4.5 0 0 0 .5-9 6 6 0 0 0-11.6-1.5A4 4 0 0 0 6.5 19Z"/>',
    box:'<path d="M21 8 12 3 3 8v8l9 5 9-5Z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
    power:'<path d="M18.4 6.6a9 9 0 1 1-12.8 0"/><line x1="12" y1="2" x2="12" y2="12"/>',
    rotate:'<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 3v5h5"/>',
    filter:'<polygon points="22 3 2 3 10 12.5 10 19 14 21 14 12.5 22 3"/>',
    logout:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><line x1="21" y1="12" x2="9" y2="12"/>',
    ext:'<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>',
    dot:'<circle cx="12" cy="12" r="4"/>',
    calendar:'<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>'
  };
  function ico(name, cls){ return svg(I[name]||I.dot, cls); }

  /* =====================================================
     Navigation registry  (grouped)
     'soon' = scaffold module (needs backend); otherwise functional.
     ===================================================== */
  var NAV = [
    { g:['סקירה','Overview'], items:[
      { id:'dashboard',  ic:'dash',      t:['לוח בקרה','Dashboard'] },
      { id:'analytics',  ic:'chart',     t:['אנליטיקות','Analytics'] },
      { id:'monitoring', ic:'activity',  t:['ניטור ובריאות','Monitoring'], soon:1 },
      { id:'control',    ic:'command',   t:['מרכז שליטה','Control Center'] }
    ]},
    { g:['משתמשים והרשאות','Users & Access'], items:[
      { id:'users',  ic:'users',   t:['משתמשים','Users'], count:1 },
      { id:'guests', ic:'ghost',   t:['אורחים','Guest Users'] },
      { id:'roles',  ic:'sliders', t:['תפקידים והרשאות','Roles & Permissions'] }
    ]},
    { g:['הכנסות','Revenue'], items:[
      { id:'billing', ic:'card',   t:['חיובים ותשלומים','Billing'] },
      { id:'plans',   ic:'layers', t:['חבילות','Plans'] },
      { id:'coupons', ic:'ticket', t:['קופונים','Coupons'] }
    ]},
    { g:['תוכן','Content'], items:[
      { id:'pages', ic:'file',     t:['עמודים','Pages'], soon:1 },
      { id:'menu',  ic:'menuList', t:['תפריטים','Menu Builder'], soon:1 },
      { id:'forms', ic:'form',     t:['טפסים','Forms Builder'], soon:1 },
      { id:'blog',  ic:'edit',     t:['בלוג','Blog'], soon:1 },
      { id:'media', ic:'image',    t:['ספריית מדיה','Media Library'], soon:1 }
    ]},
    { g:['קבצים ותקשורת','Files & Comms'], items:[
      { id:'files',         ic:'folder',    t:['מנהל קבצים','Files Manager'], soon:1 },
      { id:'email',         ic:'mail',      t:['מרכז אימייל','Email Center'], soon:1 },
      { id:'notifications', ic:'bell',      t:['התראות','Notifications'], soon:1 },
      { id:'announce',      ic:'megaphone', t:['הודעות מערכת','Announcements'] },
      { id:'support',       ic:'life',      t:['תמיכה','Support Center'], soon:1 }
    ]},
    { g:['מערכת','System'], items:[
      { id:'ai',           ic:'cpu',        t:['מרכז AI','AI Center'], soon:1 },
      { id:'queue',        ic:'server',     t:['תורים','Queue Manager'], soon:1 },
      { id:'api',          ic:'key',        t:['ניהול API','API Manager'], soon:1 },
      { id:'integrations', ic:'plug',       t:['אינטגרציות','Integrations'], soon:1 },
      { id:'syslogs',      ic:'terminal',   t:['לוגים','System Logs'], soon:1 },
      { id:'audit',        ic:'listChecks', t:['יומן ביקורת','Audit Logs'] },
      { id:'database',     ic:'db',         t:['מסד נתונים','Database'], soon:1 },
      { id:'backups',      ic:'save',       t:['גיבויים','Backups'], soon:1 },
      { id:'maintenance',  ic:'wrench',     t:['תחזוקה','Maintenance'] }
    ]},
    { g:['אבטחה','Security'], items:[
      { id:'security', ic:'shield', t:['אבטחה','Security'], soon:1 },
      { id:'abuse',    ic:'alert',  t:['ניהול דיווחים','Abuse Center'], soon:1 }
    ]},
    { g:['הגדרות','Settings'], items:[
      { id:'flags',        ic:'flag',   t:['Feature Flags','Feature Flags'] },
      { id:'localization', ic:'globe',  t:['לוקליזציה','Localization'], soon:1 },
      { id:'search',       ic:'search', t:['חיפוש גלובלי','Global Search'] }
    ]}
  ];
  function navItem(id){
    for(var i=0;i<NAV.length;i++){ var it=NAV[i].items.find(function(x){return x.id===id;}); if(it) return it; }
    return null;
  }

  /* =====================================================
     DEMO DATA layer
     ===================================================== */
  var COUNTRIES=[
    {c:'IL',f:'🇮🇱',he:'ישראל',en:'Israel'},{c:'US',f:'🇺🇸',he:'ארה״ב',en:'United States'},
    {c:'GB',f:'🇬🇧',he:'בריטניה',en:'United Kingdom'},{c:'DE',f:'🇩🇪',he:'גרמניה',en:'Germany'},
    {c:'FR',f:'🇫🇷',he:'צרפת',en:'France'},{c:'RU',f:'🇷🇺',he:'רוסיה',en:'Russia'},
    {c:'CA',f:'🇨🇦',he:'קנדה',en:'Canada'},{c:'AU',f:'🇦🇺',he:'אוסטרליה',en:'Australia'},
    {c:'BR',f:'🇧🇷',he:'ברזיל',en:'Brazil'},{c:'IN',f:'🇮🇳',he:'הודו',en:'India'}
  ];
  function ctry(c){ return COUNTRIES.find(function(x){return x.c===c;})||COUNTRIES[0]; }
  var FIRST=['Tal','David','Ron','Maya','Noa','Yossi','Dana','Amir','Lior','Shir','Omer','Adi','Gal','Ido','Roni','Eden','Nadav','Hila','Tomer','Yael'];
  var LAST=['Cohen','Levi','Mizrahi','Peretz','Bitan','Friedman','Azoulay','Katz','Shani','Barak','Green','Klein','Weiss','Sharon','Golan'];
  var COMPANIES=['—','Studio K','PixelWorks','SoundLab','MediaFlow','Freelance','BrightAds','VideoNest','ClipHouse','—','—'];

  function bytes(n){
    if(n<1024) return n+' B';
    var u=['KB','MB','GB','TB'], i=-1; do{ n/=1024; i++; }while(n>=1024 && i<u.length-1);
    return (n>=100?Math.round(n):n.toFixed(1))+' '+u[i];
  }
  function fmtInt(n){ return (n||0).toLocaleString(lang==='he'?'he-IL':'en-US'); }
  function fmtDate(ts){ var d=new Date(ts||Date.now());
    try{ return d.toLocaleDateString(lang==='he'?'he-IL':'en-US',{year:'numeric',month:'short',day:'numeric'}); }
    catch(e){ return d.toISOString().slice(0,10); } }
  function fmtDateTime(ts){ var d=new Date(ts||Date.now());
    try{ return d.toLocaleString(lang==='he'?'he-IL':'en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}); }
    catch(e){ return d.toISOString().slice(0,16).replace('T',' '); } }
  function ago(ts){
    var s=Math.max(1,Math.floor((Date.now()-ts)/1000));
    if(s<60) return T(s+' שנ׳',s+'s');
    var m=Math.floor(s/60); if(m<60) return T(m+' דק׳',m+'m');
    var hr=Math.floor(m/60); if(hr<24) return T(hr+' שע׳',hr+'h');
    var d=Math.floor(hr/24); return T(d+' ימים',d+'d');
  }
  function money(usd){
    var sym = lang==='he'?'$':'$';
    return sym+(usd||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  }

  var PLANS_DEFAULT=[
    { id:'free',    name:'Free',    price:0,  storageGB:0.05, filesDay:3,   maxFileMB:50,  color:'grey',   features:['3 קבצים/יום','עד 50MB','כלים בסיסיים'] },
    { id:'lite',    name:'Lite',    price:6,  storageGB:25,   filesDay:50,  maxFileMB:500, color:'blue',   features:['50 קבצים/יום','עד 500MB','ללא סימן מים'] },
    { id:'studio',  name:'Studio',  price:19, storageGB:200,  filesDay:9999,maxFileMB:2048,color:'violet', features:['ללא הגבלה','עד 2GB','צוות + Review','White-label'] },
    { id:'enterprise',name:'Enterprise',price:0,storageGB:2048,filesDay:99999,maxFileMB:20480,color:'amber',features:['נפח מותאם','SLA','SSO','חשבון ייעודי'] }
  ];

  function seedUsers(){
    var ex=jget('kadmin_demo_users', null);
    if(ex) return ex;
    var r=rng(20260719), out=[], statuses=['active','active','active','active','active','suspended','blocked'];
    var plans=['free','free','free','lite','lite','studio','studio','free','lite'];
    for(var i=0;i<15;i++){
      var fn=pick(FIRST,r), ln=pick(LAST,r), nm=fn+' '+ln;
      var em=(fn+'.'+ln).toLowerCase()+(i%3?'':(i+1))+'@'+pick(['gmail.com','outlook.com','company.co','proton.me'],r);
      var cc=pick(COUNTRIES,r).c;
      var created=Date.now()-ri(r,2,420)*DAY;
      out.push({
        id:'u_'+(1000+i), name:nm, email:em, plan:pick(plans,r),
        role:'user', status:pick(statuses,r),
        created:created, lastLogin:Date.now()-ri(r,0,20)*DAY-ri(r,0,86400000),
        country:cc, ip:ri(r,20,220)+'.'+ri(r,0,255)+'.'+ri(r,0,255)+'.'+ri(r,1,254),
        phone:'+'+pick(['972','1','44','49','7'],r)+'-'+ri(r,500,599)+'-'+ri(r,1000,9999),
        company:pick(COMPANIES,r),
        storage:ri(r,2,180)*1048576*ri(r,1,60),
        projects:ri(r,0,34), team:ri(r,0,6),
        fingerprint:'fp_'+hashStr(em).toString(16),
        source:'demo'
      });
    }
    jset('kadmin_demo_users', out);
    return out;
  }
  function saveDemoUsers(u){ jset('kadmin_demo_users', u); }

  // Enrich a REAL ac_users record with deterministic derived fields.
  function enrichReal(u){
    var em=(u.email||'').toLowerCase(), r=rng(hashStr(em));
    var cc = isBootstrap(em)?'IL':pick(COUNTRIES,r).c;
    return {
      id:u.id||('r_'+hashStr(em).toString(16)), name:u.name||em.split('@')[0], email:em,
      plan:(u.plan||'free'), role:u.role||'user', status:u.status||'active',
      created:u.created||Date.now(), lastLogin:u.lastLogin||Date.now()-ri(r,0,3)*DAY,
      country:cc, ip:ri(r,20,220)+'.'+ri(r,0,255)+'.'+ri(r,0,255)+'.'+ri(r,1,254),
      phone:u.phone||'', company:u.company||'—',
      storage:u.storage||ri(r,1,40)*1048576*ri(r,1,30),
      projects:u.projects||ri(r,0,12), team:u.team||0,
      fingerprint:'fp_'+hashStr(em).toString(16),
      source:'real', _raw:u
    };
  }

  function allUsers(){
    var real=acUsers().map(enrichReal);
    var realEmails={}; real.forEach(function(u){ realEmails[u.email]=1; });
    var demo=seedUsers().filter(function(u){ return !realEmails[(u.email||'').toLowerCase()]; });
    // bootstrap admin flag
    real.forEach(function(u){ if(isBootstrap(u.email)) u.role='admin'; });
    return real.concat(demo);
  }
  function findUser(key){ return allUsers().find(function(u){ return u.email===key || u.id===key; }); }

  function mutateUser(key, fn){
    var u=findUser(key); if(!u) return;
    if(u.source==='real'){
      var arr=acUsers(), i=arr.findIndex(function(x){ return (x.email||'').toLowerCase()===u.email; });
      if(i>-1){ fn(arr[i]); jset('ac_users', arr); }
    } else {
      var d=jget('kadmin_demo_users',[]), j=d.findIndex(function(x){ return x.email===u.email; });
      if(j>-1){ fn(d[j]); saveDemoUsers(d); }
    }
  }
  function deleteUser(key){
    var u=findUser(key); if(!u) return;
    if(u.source==='real'){
      jset('ac_users', acUsers().filter(function(x){ return (x.email||'').toLowerCase()!==u.email; }));
    } else {
      saveDemoUsers(jget('kadmin_demo_users',[]).filter(function(x){ return x.email!==u.email; }));
    }
  }

  function seedGuests(){
    var ex=jget('kadmin_demo_guests', null); if(ex) return ex;
    var r=rng(778812), out=[];
    for(var i=0;i<12;i++){
      var cc=pick(COUNTRIES,r).c;
      out.push({
        id:'g_'+(500+i),
        ip:ri(r,20,220)+'.'+ri(r,0,255)+'.'+ri(r,0,255)+'.'+ri(r,1,254),
        fingerprint:'fp_'+(hashStr('guest'+i)>>>0).toString(16),
        country:cc, uploads:ri(r,0,9), sessions:ri(r,1,14),
        first:Date.now()-ri(r,1,30)*DAY, last:Date.now()-ri(r,0,4)*DAY-ri(r,0,80000000),
        blocked: r()<0.15, evasion: r()<0.2
      });
    }
    jset('kadmin_demo_guests', out); return out;
  }

  function seedPayments(){
    var ex=jget('kadmin_payments', null); if(ex) return ex;
    var r=rng(55110), us=seedUsers(), out=[], methods=['stripe','stripe','stripe','paypal','manual'];
    var st=['paid','paid','paid','paid','refunded','failed'];
    for(var i=0;i<14;i++){
      var u=pick(us,r), plan=pick(['lite','studio','studio'],r);
      out.push({
        id:'INV-'+(10240+i), user:u.email, name:u.name,
        amount: plan==='studio'?19:6, method:pick(methods,r), status:pick(st,r),
        plan:plan, date:Date.now()-ri(r,0,60)*DAY
      });
    }
    out.sort(function(a,b){ return b.date-a.date; });
    jset('kadmin_payments', out); return out;
  }

  function seedCoupons(){
    var ex=jget('kadmin_coupons', null); if(ex) return ex;
    var out=[
      { code:'WELCOME20', type:'percent', value:20, uses:47, max:500, min:0, expires:Date.now()+40*DAY, active:true },
      { code:'STUDIO5',   type:'amount',  value:5,  uses:12, max:100, min:19, expires:Date.now()+12*DAY, active:true },
      { code:'BLACKFRI',  type:'percent', value:40, uses:210,max:300, min:0, expires:Date.now()-3*DAY,  active:false }
    ];
    jset('kadmin_coupons', out); return out;
  }

  function seedRoles(){
    var ex=jget('kadmin_roles', null); if(ex) return ex;
    var caps=['users','billing','content','files','ai','security','system','settings'];
    var out=[
      { id:'super', name:['סופר אדמין','Super Admin'], color:'violet', all:true, caps:caps.slice(), people:1 },
      { id:'admin', name:['אדמין','Admin'], color:'blue', caps:['users','billing','content','files','settings'], people:2 },
      { id:'support', name:['תמיכה','Support'], color:'green', caps:['users','content'], people:3 },
      { id:'finance', name:['כספים','Finance'], color:'amber', caps:['billing'], people:1 },
      { id:'moderator', name:['מנחה','Moderator'], color:'blue', caps:['content','files'], people:2 },
      { id:'developer', name:['מפתח','Developer'], color:'violet', caps:['system','settings','files'], people:2 },
      { id:'marketing', name:['שיווק','Marketing'], color:'green', caps:['content'], people:1 },
      { id:'viewer', name:['צופה','Viewer'], color:'grey', caps:[], people:4 }
    ];
    jset('kadmin_roles', out); return out;
  }

  var FLAG_DEFS=[
    { id:'review',   t:['KOLKLI Review','KOLKLI Review'] },
    { id:'send',     t:['KOLKLI Send','KOLKLI Send'] },
    { id:'request',  t:['File Request','File Request'] },
    { id:'ai',       t:['AI Tools','AI Tools'] },
    { id:'video',    t:['Video Tools','Video Tools'] },
    { id:'audio',    t:['Audio Tools','Audio Tools'] },
    { id:'pdf',      t:['PDF Tools','PDF Tools'] },
    { id:'ocr',      t:['OCR','OCR'] },
    { id:'team',     t:['צוות (Team)','Team'] },
    { id:'whitelabel',t:['White Label','White Label'] },
    { id:'domain',   t:['דומיין מותאם','Custom Domain'] },
    { id:'api',      t:['API','API'] }
  ];
  function flags(){
    var saved=jget('kadmin_flags', null);
    if(!saved){ saved={}; FLAG_DEFS.forEach(function(f){ saved[f.id]= (f.id!=='ocr'&&f.id!=='api'); }); jset('kadmin_flags', saved); }
    return saved;
  }
  function setFlag(id,on){ var f=flags(); f[id]=!!on; jset('kadmin_flags', f); window.KOLKLI_FLAGS=f; }
  window.KOLKLI_FLAGS=flags();

  function maint(){ return jget('kadmin_maint', { on:false, message:'' }); }
  function setMaint(m){ jset('kadmin_maint', m); }
  function announcements(){ return jget('kadmin_announce', []); }
  function saveAnnouncements(a){ jset('kadmin_announce', a); }

  /* ---- audit log (records real admin actions) ---- */
  function auditLog(){
    var a=jget('kadmin_audit', null);
    if(!a){ a=[
      { who:sessionEmail()||'admin', action:['התחברות לפאנל','Signed in to panel'], target:'', ts:Date.now()-2*3600000 },
      { who:sessionEmail()||'admin', action:['צפייה במשתמשים','Viewed users'], target:'', ts:Date.now()-90*60000 }
    ]; jset('kadmin_audit', a); }
    return a;
  }
  function audit(actionHe, actionEn, target){
    var a=auditLog();
    a.unshift({ who:sessionEmail()||'admin', action:[actionHe, actionEn||actionHe], target:target||'',
      ts:Date.now(), ip:'127.0.0.1', ua:(navigator.userAgent||'').slice(0,60) });
    if(a.length>200) a=a.slice(0,200);
    jset('kadmin_audit', a);
  }

  /* ---- analytics series (deterministic) ---- */
  function series(seed, n, base, growth, noise){
    var r=rng(seed), out=[], v=base;
    for(var i=0;i<n;i++){ v = v*(1+growth) + (r()-0.45)*noise; v=Math.max(0,v); out.push(Math.round(v)); }
    return out;
  }
  function dayLabels(n){
    var out=[], d=new Date();
    for(var i=n-1;i>=0;i--){ var x=new Date(Date.now()-i*DAY);
      out.push(x.toLocaleDateString(lang==='he'?'he-IL':'en-US',{month:'short',day:'numeric'})); }
    return out;
  }

  var DATA = {
    users:allUsers, findUser:findUser, mutateUser:mutateUser, deleteUser:deleteUser,
    guests:seedGuests, payments:seedPayments, coupons:seedCoupons, saveCoupons:function(c){ jset('kadmin_coupons',c); },
    plans:function(){ return jget('kadmin_plans', PLANS_DEFAULT); }, savePlans:function(p){ jset('kadmin_plans',p); }, plansDefault:PLANS_DEFAULT,
    roles:seedRoles, saveRoles:function(r){ jset('kadmin_roles',r); },
    flagDefs:FLAG_DEFS, flags:flags, setFlag:setFlag,
    maint:maint, setMaint:setMaint,
    announcements:announcements, saveAnnouncements:saveAnnouncements,
    auditLog:auditLog,
    series:series, dayLabels:dayLabels,
    countries:COUNTRIES, ctry:ctry
  };

  /* =====================================================
     UI KIT
     ===================================================== */
  function kpi(o){
    var delta = o.delta==null ? '' :
      '<span class="delta '+(o.delta>=0?'up':'down')+'">'+ico(o.delta>=0?'up':'down')+Math.abs(o.delta)+'%</span>';
    return '<div class="kpi'+(o.hl?' hl':'')+'">'+
      '<div class="kpi-top"><span class="kpi-ic">'+ico(o.icon||'dot')+'</span><span class="kpi-lb">'+esc(o.label)+'</span></div>'+
      '<div class="kpi-val">'+esc(o.value)+'</div>'+
      (o.foot||o.delta!=null ? '<div class="kpi-foot">'+delta+'<span>'+esc(o.foot||'')+'</span></div>' : '')+
    '</div>';
  }
  function pill(txt, cls, opt){
    opt=opt||{};
    return '<span class="pill '+cls+(opt.dot?' dot':'')+'">'+(opt.icon?ico(opt.icon):'')+esc(txt)+'</span>';
  }
  function statusPill(s){
    var map={ active:['p-green','פעיל','Active','dot'], suspended:['p-amber','מושהה','Suspended','dot'],
      blocked:['p-red','חסום','Blocked','dot'], deleted:['p-grey','נמחק','Deleted','dot'] };
    var m=map[s]||map.active; return '<span class="pill '+m[0]+' dot">'+esc(T(m[1],m[2]))+'</span>';
  }
  function planPill(p){
    var map={ free:'p-grey', lite:'p-blue', creator:'p-blue', studio:'p-violet', pro:'p-violet', enterprise:'p-amber' };
    var nm={ free:'Free', lite:'Lite', creator:'Creator', studio:'Studio', pro:'Pro', enterprise:'Enterprise' };
    return '<span class="pill '+(map[p]||'p-grey')+'">'+esc(nm[p]||p)+'</span>';
  }

  // inline SVG line chart. series=[{name,color,vals}], returns svg string
  function lineChart(seriesArr, labels, opt){
    opt=opt||{}; var W=760, H=opt.h||230, pad={t:16,r:12,b:26,l:34};
    var all=[]; seriesArr.forEach(function(s){ all=all.concat(s.vals); });
    var max=Math.max.apply(null, all.concat([1])), min=0;
    var n=labels.length, iw=W-pad.l-pad.r, ih=H-pad.t-pad.b;
    function X(i){ return pad.l + (n<=1?0:(iw*i/(n-1))); }
    function Y(v){ return pad.t + ih - ih*(v-min)/(max-min||1); }
    var grid=''; for(var g=0;g<=4;g++){ var yy=pad.t+ih*g/4; grid+='<line x1="'+pad.l+'" y1="'+yy+'" x2="'+(W-pad.r)+'" y2="'+yy+'" stroke="var(--line)" stroke-width="1"/>'; }
    var body=''; var defs='';
    seriesArr.forEach(function(s,si){
      var d='', dA=''; s.vals.forEach(function(v,i){ var x=X(i),y=Y(v); d+=(i?'L':'M')+x.toFixed(1)+' '+y.toFixed(1)+' '; });
      dA='M'+X(0).toFixed(1)+' '+Y(0)+' '+ s.vals.map(function(v,i){ return 'L'+X(i).toFixed(1)+' '+Y(v).toFixed(1); }).join(' ') +' L'+X(n-1).toFixed(1)+' '+Y(0);
      var gid='acg'+si+Math.floor(X(0));
      defs+='<linearGradient id="'+gid+'" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="'+s.color+'" stop-opacity="0.28"/><stop offset="1" stop-color="'+s.color+'" stop-opacity="0"/></linearGradient>';
      if(si===0 || seriesArr.length===1) body+='<path d="'+dA+'" fill="url(#'+gid+')" stroke="none"/>';
      body+='<path d="'+d+'" fill="none" stroke="'+s.color+'" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>';
      var lx=X(n-1),ly=Y(s.vals[n-1]); body+='<circle cx="'+lx.toFixed(1)+'" cy="'+ly.toFixed(1)+'" r="3.4" fill="'+s.color+'"/>';
    });
    var xl=''; var step=Math.ceil(n/6);
    for(var i=0;i<n;i+=step){ xl+='<text x="'+X(i).toFixed(1)+'" y="'+(H-8)+'" fill="var(--faint)" font-size="10" font-family="var(--mono)" text-anchor="middle">'+esc(labels[i])+'</text>'; }
    for(var yg=0;yg<=4;yg++){ var vv=Math.round(max*(4-yg)/4); xl+='<text x="'+(pad.l-6)+'" y="'+(pad.t+ih*yg/4+3)+'" fill="var(--faint)" font-size="9" font-family="var(--mono)" text-anchor="end">'+vv+'</text>'; }
    return '<svg class="chart" viewBox="0 0 '+W+' '+H+'" style="height:'+H+'px"><defs>'+defs+'</defs>'+grid+body+xl+'</svg>';
  }

  function donut(segs, opt){
    opt=opt||{}; var sz=opt.size||150, sw=opt.stroke||20, r=(sz-sw)/2, c=sz/2, C=2*Math.PI*r;
    var total=segs.reduce(function(a,b){ return a+b.value; },0)||1, off=0, arcs='';
    segs.forEach(function(s){ var frac=s.value/total, len=frac*C;
      arcs+='<circle cx="'+c+'" cy="'+c+'" r="'+r+'" fill="none" stroke="'+s.color+'" stroke-width="'+sw+'" stroke-dasharray="'+len+' '+(C-len)+'" stroke-dashoffset="'+(-off)+'" transform="rotate(-90 '+c+' '+c+')" stroke-linecap="butt"/>';
      off+=len; });
    var mid=opt.center!=null?'<text x="'+c+'" y="'+(c-2)+'" text-anchor="middle" fill="var(--ink)" font-size="'+(sz*0.2)+'" font-weight="800">'+esc(opt.center)+'</text>'+
      (opt.sub?'<text x="'+c+'" y="'+(c+14)+'" text-anchor="middle" fill="var(--muted)" font-size="10" font-family="var(--mono)">'+esc(opt.sub)+'</text>':''):'';
    return '<svg class="chart" viewBox="0 0 '+sz+' '+sz+'" style="width:'+sz+'px;height:'+sz+'px"><circle cx="'+c+'" cy="'+c+'" r="'+r+'" fill="none" stroke="var(--line-2)" stroke-width="'+sw+'"/>'+arcs+mid+'</svg>';
  }

  function bars(items, opt){
    opt=opt||{}; var max=Math.max.apply(null, items.map(function(x){return x.value;}).concat([1]));
    return items.map(function(it){
      return '<div class="barrow"><div class="bl">'+(it.flag?'<span>'+it.flag+'</span>':'')+esc(it.label)+'</div>'+
        '<div class="bt"><i style="width:'+Math.max(2,it.value/max*100).toFixed(1)+'%'+(it.color?';background:'+it.color:'')+'"></i></div>'+
        '<div class="bv">'+esc(it.display!=null?it.display:fmtInt(it.value))+'</div></div>';
    }).join('');
  }

  /* ---- toast ---- */
  function toast(msg, type){
    type=type||'ok';
    var ic={ ok:'check', info:'dot', warn:'alert', err:'x' }[type]||'check';
    var node=h('<div class="toast '+type+'"><span class="ti">'+ico(ic)+'</span><span>'+esc(msg)+'</span></div>');
    el('toaster').appendChild(node);
    requestAnimationFrame(function(){ node.classList.add('show'); });
    setTimeout(function(){ node.classList.remove('show'); setTimeout(function(){ node.remove(); },220); }, 2600);
  }

  /* ---- drawer ---- */
  function drawer(title, bodyHtml, footHtml){
    closeDrawer();
    var ov=h('<div class="ov" id="acOv"></div>');
    var dr=h('<div class="drawer" id="acDrawer" role="dialog" aria-modal="true">'+
      '<div class="drawer-h"><h3>'+esc(title)+'</h3><button class="x" id="acDrawerX">'+ico('x')+'</button></div>'+
      '<div class="drawer-b">'+bodyHtml+'</div>'+
      (footHtml?'<div class="drawer-f">'+footHtml+'</div>':'')+'</div>');
    document.body.appendChild(ov); document.body.appendChild(dr);
    requestAnimationFrame(function(){ ov.classList.add('show'); dr.classList.add('show'); });
    ov.addEventListener('click', closeDrawer);
    dr.querySelector('#acDrawerX').addEventListener('click', closeDrawer);
    return dr;
  }
  function closeDrawer(){
    var dr=el('acDrawer'), ov=el('acOv');
    if(dr){ dr.classList.remove('show'); setTimeout(function(){ dr.remove(); },220); }
    if(ov){ ov.classList.remove('show'); setTimeout(function(){ ov.remove(); },220); }
  }

  /* ---- modal ---- */
  function modal(bodyHtml){
    closeModal();
    var ov=h('<div class="ov show" id="acMov"></div>');
    var md=h('<div class="modal" id="acModal"><div class="box">'+bodyHtml+'</div></div>');
    document.body.appendChild(ov); document.body.appendChild(md);
    ov.addEventListener('click', closeModal);
    return md;
  }
  function closeModal(){ var m=el('acModal'),o=el('acMov'); if(m)m.remove(); if(o)o.remove(); }
  function confirmDlg(opt){
    return new Promise(function(res){
      var m=modal('<h3>'+esc(opt.title)+'</h3><p class="md">'+esc(opt.body||'')+'</p>'+
        '<div style="display:flex;gap:9px;justify-content:flex-end;flex-wrap:wrap">'+
        '<button class="btn" id="cD_no">'+esc(opt.cancel||T('ביטול','Cancel'))+'</button>'+
        '<button class="btn '+(opt.danger?'danger':'primary')+'" id="cD_yes">'+esc(opt.ok||T('אישור','Confirm'))+'</button></div>');
      m.querySelector('#cD_no').onclick=function(){ closeModal(); res(false); };
      m.querySelector('#cD_yes').onclick=function(){ closeModal(); res(true); };
    });
  }

  /* ---- section header ---- */
  function sectionHead(id, rightHtml){
    var it=navItem(id)||{ic:'dot',t:['','']};
    return '<div class="sec-h"><div class="ico">'+ico(it.ic)+'</div>'+
      '<div><h1>'+esc(T(it.t[0],it.t[1]))+'</h1><p>'+esc(sub(id))+'</p></div>'+
      (rightHtml?'<div class="r">'+rightHtml+'</div>':'')+'</div>';
  }
  var SUBS={
    dashboard:['מבט-על על כל הפלטפורמה','A bird’s-eye view of the whole platform'],
    analytics:['שימוש, גדילה ושימור לאורך זמן','Usage, growth and retention over time'],
    users:['כל המשתמשים הרשומים — כולל אלה שנרשמו באמת בדפדפן זה','Everyone registered — including real sign-ups in this browser'],
    guests:['מבקרים לא-רשומים לפי IP ו-Fingerprint','Anonymous visitors by IP & fingerprint'],
    roles:['תפקידים והרשאות מפורטות לכל מסך ופעולה','Roles and granular per-screen permissions'],
    billing:['תשלומים, חשבוניות, החזרים ומנויים','Payments, invoices, refunds and subscriptions'],
    plans:['ניהול חבילות המנוי','Manage subscription plans'],
    coupons:['יצירה וניהול של קופונים','Create and manage discount coupons'],
    announce:['הודעות גורפות למשתמשים','Broadcast announcements to users'],
    audit:['כל פעולת אדמין נרשמת כאן','Every admin action is recorded here'],
    maintenance:['מצב תחזוקה וכלי מערכת','Maintenance mode & system tools'],
    control:['פעולות רוחביות על כל המערכת','Cross-cutting actions over the whole system'],
    flags:['הדלקה/כיבוי של מודולים בלחיצה','Toggle platform modules on/off'],
    search:['חיפוש חוצה-מערכת','Search across the whole system']
  };
  function sub(id){ var s=SUBS[id]; return s?T(s[0],s[1]):''; }

  /* ---- backend-seam note (for scaffold modules) ---- */
  function backendNote(extra){
    return '<div class="backend-note"><div class="bn-ic">'+ico('plug')+'</div>'+
      '<div><b>'+esc(T('ממתין לחיבור Backend','Waiting for backend'))+'</b>'+
      '<p>'+esc(extra||T('המסך מוכן; ה-UI כאן הוא seam — ברגע שה-API/DB יחוברו, המסך יתמלא בנתונים אמיתיים ללא שינוי עיצוב.',
        'The screen is ready; this UI is a seam — once the API/DB are wired, it fills with live data with no design change.'))+'</p></div></div>';
  }
  function moduleScaffold(id, feats, extraNote){
    var h1='<div class="grid g-2" style="margin-bottom:16px">'+
      '<div class="kpi"><div class="kpi-top"><span class="kpi-ic">'+ico('activity')+'</span><span class="kpi-lb">'+esc(T('סטטוס מודול','Module status'))+'</span></div><div class="kpi-val" style="font-size:19px">'+esc(T('מתוכנן','Planned'))+'</div><div class="kpi-foot"><span>'+esc(T('UI מוכן · ממתין ל-backend','UI ready · needs backend'))+'</span></div></div>'+
      '<div class="kpi"><div class="kpi-top"><span class="kpi-ic">'+ico('listChecks')+'</span><span class="kpi-lb">'+esc(T('יכולות מתוכננות','Planned capabilities'))+'</span></div><div class="kpi-val">'+feats.length+'</div></div>'+
    '</div>';
    var fg='<div class="card"><div class="card-h tight"><div><h2>'+esc(T('מה יהיה במסך הזה','What this screen will do'))+'</h2><p class="sub">'+esc(T('כל יכולת תיקשר לנתונים אמיתיים בהמשך','Each capability wires to live data later'))+'</p></div></div>'+
      '<div class="feat-grid">'+feats.map(function(f){
        return '<div class="feat"><div class="fi">'+ico(f.ic||'dot')+'</div><div><b>'+esc(T(f.t[0],f.t[1]))+'</b>'+(f.d?'<span>'+esc(T(f.d[0],f.d[1]))+'</span>':'')+'</div></div>';
      }).join('')+'</div></div>';
    return sectionHead(id)+backendNote(extraNote)+h1+fg;
  }

  /* =====================================================
     Router
     ===================================================== */
  var SECTIONS={};
  function registerSection(id, fn){ SECTIONS[id]=fn; }

  function renderNav(){
    var cur=current();
    var html=NAV.map(function(grp){
      return '<div class="ac-grp"><div class="ac-grp-h">'+esc(T(grp.g[0],grp.g[1]))+'</div>'+
        grp.items.map(function(it){
          var badge='';
          if(it.count){ var n=allUsers().length; badge='<span class="bdg">'+n+'</span>'; }
          else if(it.soon){ badge='<span class="bdg soon">'+esc(T('בקרוב','soon'))+'</span>'; }
          var label=T(it.t[0],it.t[1]);
          return '<button class="ac-item'+(it.id===cur?' on':'')+'" data-go="'+it.id+'" data-tip="'+esc(label)+'">'+
            '<span class="ic">'+ico(it.ic)+'</span><span class="lb">'+esc(label)+'</span>'+badge+'</button>';
        }).join('')+'</div>';
    }).join('');
    el('acNav').innerHTML=html;
  }

  function current(){ var hh=(location.hash||'').replace(/^#\/?/,''); hh=hh.split('/')[0]; return SECTIONS[hh]?hh:'dashboard'; }

  function render(){
    if(!currentIsAdmin()){ renderDeny(); return; }
    var id=current(), it=navItem(id)||{t:['','']};
    var groupName=''; NAV.forEach(function(g){ if(g.items.some(function(x){return x.id===id;})) groupName=T(g.g[0],g.g[1]); });
    el('crumbT').textContent=T(it.t[0],it.t[1]);
    el('crumbS').textContent=groupName+' / '+id;
    document.title='KOLKLI Admin — '+T(it.t[0],it.t[1]);
    renderNav();
    var page=el('page'); page.innerHTML='';
    try{ (SECTIONS[id]||SECTIONS.dashboard)(page); }
    catch(e){ page.innerHTML='<div class="card"><b>Render error:</b> '+esc(e && e.message)+'</div>'; if(window.console) console.error(e); }
    el('scroll').scrollTop=0;
    // close mobile drawer after navigation
    document.body.classList.remove('side-open');
  }

  function go(id){ if(location.hash.replace(/^#\/?/,'')===id){ render(); } else { location.hash=id; } }

  function renderDeny(){
    document.getElementById('shell').innerHTML=
      '<div style="grid-column:1/-1"><div class="deny">'+
        '<div class="di">'+ico('lock')+'</div>'+
        '<h2>'+esc(T('אין הרשאת גישה','Access denied'))+'</h2>'+
        '<p>'+esc(T('מרכז השליטה מיועד למנהלי המערכת בלבד. התחברו עם חשבון אדמין כדי להיכנס.','The Admin Center is for administrators only. Sign in with an admin account.'))+'</p>'+
        '<div class="row"><a class="btn primary" href="./dashboard">'+esc(T('חזרה ללוח הבקרה','Back to dashboard'))+'</a>'+
        '<a class="btn" href="./auth">'+esc(T('התחברות','Sign in'))+'</a></div>'+
      '</div></div>';
  }

  /* =====================================================
     Boot / wiring
     ===================================================== */
  function boot(){
    applyTheme(lsGet('theme')||'light');
    if(lsGet('kadmin_collapsed')==='1') document.body.classList.add('collapsed');
    document.documentElement.lang=lang;
    document.documentElement.dir = lang==='he'?'rtl':'ltr';
    var li=el('langIco'); if(li) li.textContent = lang==='he'?'EN':'עב';
    // avatar initial
    var av=el('topAv'); if(av){ var e=sessionEmail(); av.textContent=(e?e[0]:'A').toUpperCase(); av.title=e||'admin'; }

    if(!currentIsAdmin()){ renderDeny(); return; }

    // wire chrome
    el('menuBtn').addEventListener('click', function(){
      if(window.matchMedia('(max-width:920px)').matches){ document.body.classList.toggle('side-open'); }
      else { document.body.classList.toggle('collapsed'); lsSet('kadmin_collapsed', document.body.classList.contains('collapsed')?'1':'0'); }
    });
    el('scrim').addEventListener('click', function(){ document.body.classList.remove('side-open'); });
    el('themeBtn').addEventListener('click', toggleTheme);
    el('langBtn').addEventListener('click', toggleLang);
    el('topAv').addEventListener('click', function(){ go('control'); });
    var ts=el('topSearch');
    if(ts){
      ts.placeholder=T('חיפוש גלובלי…','Global search…');
      ts.addEventListener('keydown', function(e){ if(e.key==='Enter'){ KAdmin.globalSearch(ts.value); } });
    }
    on(el('acNav'), 'click', '[data-go]', function(e,t){ go(t.getAttribute('data-go')); });

    window.addEventListener('hashchange', render);
    audit('נכנס למרכז השליטה','Opened Admin Center');
    render();
  }

  /* =====================================================
     Public API
     ===================================================== */
  window.KAdmin = {
    boot:boot, render:render, go:go, current:current, registerSection:registerSection,
    T:function(a,b){ return T(a,b); }, get lang(){ return lang; }, applyLang:applyLang, toggleTheme:toggleTheme,
    ico:ico, I:I, esc:esc, el:el, h:h, on:on,
    data:DATA, audit:audit,
    fmtInt:fmtInt, fmtDate:fmtDate, fmtDateTime:fmtDateTime, ago:ago, bytes:bytes, money:money,
    ui:{ kpi:kpi, pill:pill, statusPill:statusPill, planPill:planPill, lineChart:lineChart, donut:donut, bars:bars,
      toast:toast, drawer:drawer, closeDrawer:closeDrawer, modal:modal, closeModal:closeModal, confirm:confirmDlg,
      sectionHead:sectionHead, backendNote:backendNote, moduleScaffold:moduleScaffold },
    nav:NAV, navItem:navItem,
    globalSearch:function(q){ /* overridden in sections.js */ if(q) go('search'); }
  };
})();
