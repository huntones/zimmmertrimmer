/* ============================================================
   KOLKLI — Admin Center sections.
   Loaded AFTER admin-core.js. Registers every module renderer.
   Functional modules read the demo DATA layer (KAdmin.data);
   scaffold modules render a consistent "needs-backend" page.
   ============================================================ */
(function () {
  var K = window.KAdmin; if (!K) return;
  var D = K.data, U = K.ui, ico = K.ico, esc = K.esc, T = K.T, on = K.on, el = K.el;
  var reg = K.registerSection;

  var PRICE = { free:0, lite:6, creator:6, studio:19, pro:19, enterprise:0 };
  function planPrice(p){ return PRICE[p]||0; }
  function initial(u){ return (u.name||u.email||'?').trim().charAt(0).toUpperCase(); }
  function dispName(u){ return u.name||(u.email||'').split('@')[0]; }
  function money(n){ return K.money(n); }

  function card(inner){ return '<div class="card">'+inner+'</div>'; }
  function cardH(title, sub, right){
    return '<div class="card-h"><div><h2>'+esc(title)+'</h2>'+(sub?'<p class="sub">'+esc(sub)+'</p>':'')+'</div>'+
      (right?'<div class="r">'+right+'</div>':'')+'</div>';
  }
  function rowMenu(key, items){
    // items: [{act,ic,label,cls?}] or 'hr'
    var body=items.map(function(it){ if(it==='hr') return '<hr>';
      return '<button data-act="'+it.act+'" data-key="'+esc(key)+'"'+(it.cls?' class="'+it.cls+'"':'')+'>'+ico(it.ic)+esc(it.label)+'</button>'; }).join('');
    return '<div class="menu"><button class="btn icon-btn menu-t" aria-label="actions">'+ico('more')+'</button>'+
      '<div class="menu-pop">'+body+'</div></div>';
  }

  // close any open row menu on outside click
  document.addEventListener('click', function(e){
    var t=e.target.closest('.menu-t');
    document.querySelectorAll('.menu-pop.open').forEach(function(p){
      if(!t || p.previousElementSibling!==t) p.classList.remove('open');
    });
    if(t){ var pop=t.nextElementSibling; if(pop){ pop.classList.toggle('open'); } }
  });

  function csvDownload(name, rows){
    var csv=rows.map(function(r){ return r.map(function(c){ c=String(c==null?'':c); return /[",\n]/.test(c)?'"'+c.replace(/"/g,'""')+'"':c; }).join(','); }).join('\n');
    var blob=new Blob(['﻿'+csv],{type:'text/csv;charset=utf-8'});
    var a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name;
    document.body.appendChild(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); },500);
  }

  /* ============================================================
     DASHBOARD
     ============================================================ */
  function stats(){
    var us=D.users(), s={ total:us.length, free:0, paid:0, admins:0, blocked:0, suspended:0, storage:0, mrr:0 };
    us.forEach(function(u){
      if(u.plan==='free') s.free++; else s.paid++;
      if(u.role==='admin') s.admins++;
      if(u.status==='blocked') s.blocked++;
      if(u.status==='suspended') s.suspended++;
      s.storage+=u.storage||0;
      s.mrr+=planPrice(u.plan);
    });
    s.guests=D.guests().length;
    s.active = Math.round(s.total*0.34)+3;
    s.online = Math.max(1, Math.round(s.total*0.08));
    s.newWeek = Math.round(s.total*0.16)+1;
    s.newToday = Math.max(1,Math.round(s.total*0.04));
    return s;
  }

  function feedItems(){
    var us=D.users(); if(!us.length) return [];
    var types=[
      { ic:'upload', c:'p-blue', he:'העלה קבצים', en:'uploaded files', suf:function(n){ return ' ('+n+')'; } },
      { ic:'file', c:'p-violet', he:'יצר File Request', en:'created a File Request' },
      { ic:'download', c:'p-green', he:'הוריד חבילה', en:'downloaded a package' },
      { ic:'user', c:'p-blue', he:'נרשם/ה למערכת', en:'signed up' },
      { ic:'card', c:'p-green', he:'ביצע/ה תשלום', en:'made a payment' },
      { ic:'ban', c:'p-red', he:'נחסם/ה אוטומטית', en:'was auto-blocked' },
      { ic:'listChecks', c:'p-violet', he:'סיים/ה Review', en:'completed a Review' }
    ];
    var out=[], now=Date.now();
    for(var i=0;i<8;i++){
      var u=us[(i*3+2)%us.length], ty=types[i%types.length];
      var extra = ty.suf?ty.suf(2+((i*7)%11)):'';
      out.push({ name:dispName(u), ic:ty.ic, c:ty.c, txt:T(ty.he,ty.en)+extra, ts:now-(i*i*180000+i*400000+120000) });
    }
    return out;
  }

  reg('dashboard', function(page){
    var s=stats();
    var kpis='<div class="grid g-4" style="margin-bottom:16px">'+
      U.kpi({icon:'users', label:T('משתמשים רשומים','Registered users'), value:K.fmtInt(s.total), delta:12, foot:T('סה״כ','total'), hl:true})+
      U.kpi({icon:'zap', label:T('פעילים היום','Active today'), value:K.fmtInt(s.active), delta:5, foot:T('DAU','DAU')})+
      U.kpi({icon:'trend', label:T('חדשים השבוע','New this week'), value:K.fmtInt(s.newWeek), delta:8})+
      U.kpi({icon:'wifi', label:T('מחוברים כרגע','Online now'), value:K.fmtInt(s.online), foot:T('חי','live')})+
    '</div>';
    var kpis2='<div class="grid g-4" style="margin-bottom:16px">'+
      U.kpi({icon:'dollar', label:T('הכנסה חודשית (MRR)','Monthly revenue'), value:money(s.mrr)})+
      U.kpi({icon:'crown', label:T('משתמשים בתשלום','Paying users'), value:K.fmtInt(s.paid)})+
      U.kpi({icon:'ghost', label:T('אורחים','Guests'), value:K.fmtInt(s.guests)})+
      U.kpi({icon:'ban', label:T('חסומים','Blocked'), value:K.fmtInt(s.blocked), foot:s.suspended?T(s.suspended+' מושהים',s.suspended+' suspended'):''})+
    '</div>';

    var labels=D.dayLabels(30);
    var chart=U.lineChart([
      { name:T('הרשמות','Signups'), color:'#7c3aed', vals:D.series(101,30,6,0.03,4) },
      { name:T('העלאות','Uploads'), color:'#3b82f6', vals:D.series(202,30,40,0.02,16) },
      { name:T('הורדות','Downloads'), color:'#22b04b', vals:D.series(303,30,30,0.025,14) }
    ], labels);
    var legend='<div class="chart-legend"><span><i style="background:#7c3aed"></i>'+esc(T('הרשמות','Signups'))+'</span>'+
      '<span><i style="background:#3b82f6"></i>'+esc(T('העלאות','Uploads'))+'</span>'+
      '<span><i style="background:#22b04b"></i>'+esc(T('הורדות','Downloads'))+'</span></div>';

    var feed=feedItems().map(function(f){
      return '<div class="feed-i"><span class="feed-ic '+f.c+'">'+ico(f.ic)+'</span>'+
        '<div class="feed-tx"><b>'+esc(f.name)+'</b> '+esc(f.txt)+'<p class="tm">'+esc(K.ago(f.ts))+' '+esc(T('לפני','ago'))+'</p></div></div>';
    }).join('');

    // storage donut
    var used=s.storage, cap=1099511627776; // 1TB demo cap
    var don=U.donut([{label:'used',value:used,color:'#7c3aed'},{label:'free',value:Math.max(0,cap-used),color:'var(--line-2)'}],
      {size:150, stroke:20, center:Math.round(used/cap*100)+'%', sub:T('בשימוש','used')});

    // system status (demo/synthetic)
    var sys=[['CPU','p-green','23%'],['RAM','p-green','61%'],['Storage','p-amber','78%'],['Database','p-green',T('תקין','OK')],
      ['Queue','p-green','4 jobs'],['Redis','p-green',T('תקין','OK')],['CDN','p-green',T('תקין','OK')],['S3','p-green',T('תקין','OK')],
      ['SSL','p-green',T('בתוקף','Valid')],['Server','p-green','99.98%']];
    var sysRows=sys.map(function(x){ return '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 2px;border-bottom:1px solid var(--line-2)"><span style="font-size:13px;font-weight:600;color:var(--ink-2)">'+x[0]+'</span><span class="pill '+x[1]+' dot">'+esc(x[2])+'</span></div>'; }).join('');

    page.innerHTML =
      K.ui.sectionHead('dashboard', '<button class="btn" id="dashExport">'+ico('download')+esc(T('ייצוא דוח','Export'))+'</button><button class="btn primary" data-go="control">'+ico('command')+esc(T('מרכז שליטה','Control Center'))+'</button>')+
      kpis + kpis2 +
      '<div class="grid" style="grid-template-columns:1.6fr 1fr;margin-bottom:16px">'+
        card(cardH(T('פעילות — 30 יום','Activity — 30 days'), T('הרשמות, העלאות והורדות','Signups, uploads and downloads'))+chart+legend)+
        card(cardH(T('פיד חי','Live feed'), T('אירועים אחרונים','Recent events'))+'<div class="feed">'+feed+'</div>')+
      '</div>'+
      '<div class="grid g-3">'+
        card(cardH(T('אחסון','Storage'))+'<div style="display:flex;align-items:center;gap:18px;flex-wrap:wrap">'+don+
          '<div style="min-width:120px"><div style="font-size:22px;font-weight:800">'+esc(K.bytes(used))+'</div><div style="font-size:12px;color:var(--muted)">'+esc(T('מתוך 1TB','of 1TB'))+'</div></div></div>')+
        card(cardH(T('מצב מערכת','System status'),T('נתוני דמו','demo metrics'))+sysRows)+
        card(cardH(T('התפלגות חבילות','Plan breakdown'))+U.bars((function(){ var us=D.users(),m={}; us.forEach(function(u){ m[u.plan]=(m[u.plan]||0)+1; });
          return Object.keys(m).map(function(k){ return {label:k.charAt(0).toUpperCase()+k.slice(1), value:m[k]}; }).sort(function(a,b){return b.value-a.value;}); })()))+
      '</div>';

    on(page,'click','[data-go]',function(e,t){ K.go(t.getAttribute('data-go')); });
    var de=el('dashExport'); if(de) de.onclick=function(){
      var us=D.users(); csvDownload('kolkli-users.csv',[['name','email','plan','status','country','joined']].concat(us.map(function(u){ return [dispName(u),u.email,u.plan,u.status,u.country,K.fmtDate(u.created)]; })));
      U.toast(T('הדוח יוצא בהצלחה','Report exported')); K.audit('ייצא דוח משתמשים','Exported users report');
    };
  });

  /* ============================================================
     USERS
     ============================================================ */
  var uFilter={ q:'', plan:'', status:'' };
  function usersFiltered(){
    var us=D.users();
    return us.filter(function(u){
      if(uFilter.plan && u.plan!==uFilter.plan) return false;
      if(uFilter.status && u.status!==uFilter.status) return false;
      if(uFilter.q){ var q=uFilter.q.toLowerCase();
        if((dispName(u).toLowerCase().indexOf(q)<0) && ((u.email||'').toLowerCase().indexOf(q)<0)) return false; }
      return true;
    });
  }

  function usersTableHtml(){
    var list=usersFiltered(), me=(localStorage.getItem('ac_session')||'').toLowerCase();
    if(!list.length) return '<div class="empty"><div class="ei">'+ico('search')+'</div><h3>'+esc(T('אין תוצאות','No results'))+'</h3><p>'+esc(T('לא נמצאו משתמשים תואמים','No matching users'))+'</p></div>';
    var rows=list.map(function(u){
      var ct=D.ctry(u.country), isMe=u.email===me;
      var actions=[
        {act:'view', ic:'eye', label:T('צפייה בפרופיל','View profile')},
        {act:'loginas', ic:'login', label:T('התחבר כמשתמש','Login as user')},
        {act:'reset', ic:'refresh', label:T('איפוס סיסמה','Reset password')},
        {act:'email', ic:'mail2', label:T('שליחת אימייל','Send email')},
        {act:'plan', ic:'layers', label:T('שינוי חבילה','Change plan')},
        'hr',
        u.status==='blocked'?{act:'unblock', ic:'unlock', label:T('בטל חסימה','Unblock')}:{act:'block', ic:'ban', label:T('חסום','Block'), cls:'danger'},
        u.status==='suspended'?{act:'unsuspend', ic:'play', label:T('בטל השעיה','Unsuspend')}:{act:'suspend', ic:'pause', label:T('השעה','Suspend')},
        {act:'del', ic:'trash', label:T('מחק','Delete'), cls:'danger'}
      ];
      return '<tr>'+
        '<td><div class="u-cell"><span class="u-av">'+esc(initial(u))+'</span><span class="u-meta">'+
          '<span class="u-name">'+esc(dispName(u))+(u.role==='admin'?' <span class="pill p-violet" style="padding:1px 7px">'+esc(T('אדמין','Admin'))+'</span>':'')+(isMe?' <span class="youtag">'+esc(T('אתה','You'))+'</span>':'')+'</span>'+
          '<span class="u-email">'+esc(u.email)+'</span></span></div></td>'+
        '<td><span title="'+esc(T(ct.he,ct.en))+'">'+ct.f+' <span class="mono">'+esc(u.country)+'</span></span></td>'+
        '<td>'+U.planPill(u.plan)+'</td>'+
        '<td>'+U.statusPill(u.status)+'</td>'+
        '<td class="mono">'+esc(K.bytes(u.storage))+'</td>'+
        '<td class="mono">'+u.projects+'</td>'+
        '<td>'+esc(K.fmtDate(u.created))+'</td>'+
        '<td>'+rowMenu(u.email, actions)+'</td>'+
      '</tr>';
    }).join('');
    return '<div class="tbl-wrap"><table class="tbl" style="min-width:900px"><thead><tr>'+
      '<th>'+esc(T('משתמש','User'))+'</th><th>'+esc(T('מדינה','Country'))+'</th><th>'+esc(T('חבילה','Plan'))+'</th>'+
      '<th>'+esc(T('סטטוס','Status'))+'</th><th>'+esc(T('אחסון','Storage'))+'</th><th>'+esc(T('פרויקטים','Projects'))+'</th>'+
      '<th>'+esc(T('הצטרפ/ה','Joined'))+'</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div>';
  }

  function planModal(u){
    var opts=['free','lite','studio','enterprise'].map(function(p){
      return '<button class="btn'+(u.plan===p?' primary':'')+'" data-plan="'+p+'" style="justify-content:flex-start">'+U.planPill(p)+' '+esc(money(planPrice(p)))+'</button>';
    }).join('');
    var m=U.modal('<h3>'+esc(T('שינוי חבילה','Change plan'))+'</h3><p class="md">'+esc(dispName(u))+' · '+esc(u.email)+'</p>'+
      '<div style="display:grid;gap:9px">'+opts+'</div>'+
      '<div style="display:flex;justify-content:flex-end;margin-top:16px"><button class="btn" id="pmCancel">'+esc(T('סגירה','Close'))+'</button></div>');
    m.querySelector('#pmCancel').onclick=U.closeModal;
    m.querySelectorAll('[data-plan]').forEach(function(b){ b.onclick=function(){
      var p=b.getAttribute('data-plan');
      D.mutateUser(u.email, function(rec){ rec.plan=p; });
      K.audit('שינה חבילה ל-'+p,'Changed plan to '+p, u.email);
      U.closeModal(); U.toast(T('החבילה עודכנה','Plan updated')); K.render();
    }; });
  }

  function profileDrawer(key){
    var u=D.findUser(key); if(!u) return;
    var ct=D.ctry(u.country);
    var plan=(D.plans().find(function(p){return p.id===u.plan;}))||{name:u.plan,storageGB:0,filesDay:0,price:planPrice(u.plan)};
    var r=(function(){ var seed=0,s=u.email; for(var i=0;i<s.length;i++)seed=(seed*31+s.charCodeAt(i))>>>0; var a=seed; return function(){ a=(a+0x6D2B79F5)>>>0; var t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; })();

    var tabs=[
      ['details', T('פרטים','Details')],
      ['sub', T('מנוי','Subscription')],
      ['storage', T('אחסון','Storage')],
      ['activity', T('פעילות','Activity')],
      ['security', T('אבטחה','Security')]
    ];
    function dl(pairs){ return '<dl class="dl">'+pairs.map(function(p){ return '<dt>'+esc(p[0])+'</dt><dd>'+(p[2]?p[1]:esc(p[1]))+'</dd>'; }).join('')+'</dl>'; }

    var bodies={};
    bodies.details=dl([
      [T('מזהה','ID'), '<span class="mono">'+esc(u.id)+'</span>', true],
      [T('אימייל','Email'), '<span class="mono">'+esc(u.email)+'</span>', true],
      [T('טלפון','Phone'), u.phone||'—'],
      [T('חברה','Company'), u.company||'—'],
      [T('מדינה','Country'), ct.f+' '+T(ct.he,ct.en)],
      ['IP', '<span class="mono">'+esc(u.ip)+'</span>', true],
      ['Fingerprint', '<span class="mono">'+esc(u.fingerprint)+'</span>', true],
      [T('תפקיד','Role'), u.role==='admin'?T('אדמין','Admin'):T('משתמש','User')],
      [T('הצטרפ/ה','Joined'), K.fmtDate(u.created)],
      [T('התחברות אחרונה','Last login'), K.fmtDateTime(u.lastLogin)],
      [T('סטטוס','Status'), U.statusPill(u.status), true]
    ]);
    bodies.sub=dl([
      [T('חבילה','Plan'), U.planPill(u.plan), true],
      [T('מחיר','Price'), money(planPrice(u.plan))+T(' / חודש',' / mo')],
      [T('נפח בחבילה','Plan storage'), plan.storageGB?plan.storageGB+' GB':'—'],
      [T('קבצים ליום','Files / day'), plan.filesDay||'—'],
      [T('אמצעי תשלום','Payment method'), u.plan==='free'?'—':(['Visa •••• '+(4000+Math.floor(r()*999)),'PayPal','Mastercard •••• '+(5100+Math.floor(r()*899))][Math.floor(r()*3)])],
      [T('חידוש הבא','Next renewal'), u.plan==='free'?'—':K.fmtDate(Date.now()+Math.floor(r()*28+2)*86400000)]
    ]);
    var used=u.storage, cap=(plan.storageGB||1)*1073741824;
    bodies.storage='<div style="margin-bottom:14px">'+dl([
      [T('בשימוש','Used'), K.bytes(used)],
      [T('מכסה','Quota'), plan.storageGB?plan.storageGB+' GB':T('ללא הגבלה','Unlimited')],
      [T('פרויקטים','Projects'), String(u.projects)],
      [T('חברי צוות','Team members'), String(u.team)]
    ])+'</div>'+
    '<div class="bt" style="height:11px"><i style="display:block;height:100%;border-radius:6px;background:var(--grad);width:'+Math.min(100,Math.round(used/(cap||1)*100))+'%"></i></div>'+
    '<div style="font-size:11.5px;color:var(--muted);margin-top:6px">'+esc(Math.min(100,Math.round(used/(cap||1)*100))+'% '+T('מנוצל','used'))+'</div>';

    var acts=[T('העלה 12 קבצים','Uploaded 12 files'),T('יצר File Request','Created a File Request'),T('הוריד חבילה','Downloaded a package'),T('שינה סיסמה','Changed password'),T('התחבר מ-'+ct.f,'Signed in from '+ct.f)];
    bodies.activity='<div class="feed">'+acts.map(function(a,i){ return '<div class="feed-i"><span class="feed-ic p-violet">'+ico('dot')+'</span><div class="feed-tx"><b>'+esc(a)+'</b><p class="tm">'+esc(K.ago(Date.now()-i*i*3600000-3600000))+' '+esc(T('לפני','ago'))+'</p></div></div>'; }).join('')+'</div>';

    bodies.security='<div style="margin-bottom:14px">'+dl([
      ['2FA', r()>0.5?'<span class="pill p-green">'+esc(T('פעיל','On'))+'</span>':'<span class="pill p-grey">'+esc(T('כבוי','Off'))+'</span>', true],
      [T('התחברויות (30 יום)','Logins (30d)'), String(Math.floor(r()*40+3))],
      [T('מכשירים פעילים','Active devices'), String(Math.floor(r()*3+1))],
      [T('חסימות בעבר','Past blocks'), String(Math.floor(r()*2))]
    ])+'</div>'+
    '<div style="font-size:12px;color:var(--muted);font-weight:700;margin-bottom:7px">'+esc(T('Sessions אחרונים','Recent sessions'))+'</div>'+
    ['Chrome · Windows','Safari · iPhone','Edge · Windows'].slice(0,Math.floor(r()*2+1)).map(function(s){
      return '<div style="display:flex;justify-content:space-between;padding:7px 2px;border-bottom:1px solid var(--line-2);font-size:12.5px"><span>'+esc(s)+'</span><span class="mono" style="color:var(--faint)">'+esc(u.ip)+'</span></div>'; }).join('');

    var tabBtns=tabs.map(function(t,i){ return '<button data-tab="'+t[0]+'"'+(i===0?' class="on"':'')+'>'+esc(t[1])+'</button>'; }).join('');
    var body='<div class="prof-head"><div class="pa">'+esc(initial(u))+'</div><div><b>'+esc(dispName(u))+'</b><div class="pe">'+esc(u.email)+'</div>'+
      '<div style="margin-top:6px;display:flex;gap:6px">'+U.statusPill(u.status)+U.planPill(u.plan)+'</div></div></div>'+
      '<div class="prof-tabs">'+tabBtns+'</div><div id="profBody">'+bodies.details+'</div>';

    var foot='<button class="btn" data-pact="loginas" data-key="'+esc(u.email)+'">'+ico('login')+esc(T('התחבר כמשתמש','Login as'))+'</button>'+
      (u.status==='blocked'?'<button class="btn" data-pact="unblock" data-key="'+esc(u.email)+'">'+ico('unlock')+esc(T('בטל חסימה','Unblock'))+'</button>':'<button class="btn danger" data-pact="block" data-key="'+esc(u.email)+'">'+ico('ban')+esc(T('חסום','Block'))+'</button>')+
      '<button class="btn danger" data-pact="del" data-key="'+esc(u.email)+'">'+ico('trash')+esc(T('מחק','Delete'))+'</button>';

    var dr=U.drawer(T('פרופיל משתמש','User profile'), body, foot);
    dr.querySelectorAll('.prof-tabs button').forEach(function(b){ b.onclick=function(){
      dr.querySelectorAll('.prof-tabs button').forEach(function(x){ x.classList.remove('on'); }); b.classList.add('on');
      dr.querySelector('#profBody').innerHTML=bodies[b.getAttribute('data-tab')];
    }; });
    dr.querySelectorAll('[data-pact]').forEach(function(b){ b.onclick=function(){ userAction(b.getAttribute('data-pact'), b.getAttribute('data-key'), true); }; });
  }

  function userAction(act, key, fromDrawer){
    var u=D.findUser(key); if(!u) return;
    if(act==='view'){ profileDrawer(key); return; }
    if(act==='plan'){ planModal(u); return; }
    if(act==='loginas'){
      U.confirm({ title:T('התחבר כמשתמש?','Login as user?'),
        body:T('הפעולה תחליף את ה-session הנוכחי שלך ל-'+u.email+' ותעביר אותך ללוח הבקרה שלו. (בדמו זה מחליף את ac_session.)','This switches your session to '+u.email+' and opens their dashboard. (In the demo it swaps ac_session.)'),
        ok:T('התחבר','Login as') }).then(function(ok){ if(!ok) return;
          try{ localStorage.setItem('ac_session', u.email); }catch(e){}
          K.audit('התחבר כמשתמש','Logged in as user', u.email);
          location.href='./dashboard';
        });
      return;
    }
    if(act==='reset'){ K.audit('אתחל סיסמה','Reset password', u.email); U.toast(T('נשלח קישור איפוס ל-'+u.email,'Reset link sent to '+u.email),'info'); return; }
    if(act==='email'){ K.audit('שלח אימייל','Sent email', u.email); U.toast(T('האימייל נשלח (דמו)','Email sent (demo)'),'info'); return; }
    if(act==='block'||act==='unblock'||act==='suspend'||act==='unsuspend'){
      var ns = act==='block'?'blocked': act==='suspend'?'suspended':'active';
      D.mutateUser(key, function(rec){ rec.status=ns; });
      K.audit(act==='block'?'חסם משתמש':act==='suspend'?'השהה משתמש':'הפעיל משתמש', act+' user', u.email);
      U.toast(T('הסטטוס עודכן','Status updated'));
      if(fromDrawer) U.closeDrawer();
      K.render(); return;
    }
    if(act==='del'){
      U.confirm({ title:T('למחוק את המשתמש?','Delete user?'), body:dispName(u)+' · '+u.email, danger:true, ok:T('מחק','Delete') })
        .then(function(ok){ if(!ok) return;
          var isMe=u.email===(localStorage.getItem('ac_session')||'').toLowerCase();
          D.deleteUser(key); K.audit('מחק משתמש','Deleted user', u.email); U.toast(T('המשתמש נמחק','User deleted'));
          if(fromDrawer) U.closeDrawer();
          if(isMe && u.source==='real'){ try{ localStorage.removeItem('ac_session'); }catch(e){} location.href='./'; return; }
          K.render();
        });
      return;
    }
  }

  reg('users', function(page){
    var right='<button class="btn" id="uExport">'+ico('download')+esc(T('ייצוא CSV','Export CSV'))+'</button>';
    var toolbar='<div class="card-h"><div><h2>'+esc(T('כל המשתמשים','All users'))+'</h2><p class="sub">'+esc(D.users().length+' '+T('רשומים','registered')+' · '+usersFiltered().length+' '+T('מוצגים','shown'))+'</p></div>'+
      '<div class="r">'+
        '<label class="gsearch" style="width:220px"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><input id="uSearch" type="text" placeholder="'+esc(T('שם או אימייל…','Name or email…'))+'" value="'+esc(uFilter.q)+'"></label>'+
        '<select class="sel" id="uPlan" style="width:auto"><option value="">'+esc(T('כל החבילות','All plans'))+'</option><option value="free">Free</option><option value="lite">Lite</option><option value="studio">Studio</option><option value="enterprise">Enterprise</option></select>'+
        '<select class="sel" id="uStatus" style="width:auto"><option value="">'+esc(T('כל הסטטוסים','All statuses'))+'</option><option value="active">'+esc(T('פעיל','Active'))+'</option><option value="suspended">'+esc(T('מושהה','Suspended'))+'</option><option value="blocked">'+esc(T('חסום','Blocked'))+'</option></select>'+
      '</div></div>';
    page.innerHTML = K.ui.sectionHead('users', right) + card(toolbar+'<div id="uTable">'+usersTableHtml()+'</div>');

    var sEl=el('uSearch'), pEl=el('uPlan'), stEl=el('uStatus');
    pEl.value=uFilter.plan; stEl.value=uFilter.status;
    function refresh(){ el('uTable').innerHTML=usersTableHtml(); }
    sEl.addEventListener('input', function(){ uFilter.q=sEl.value; refresh(); });
    pEl.addEventListener('change', function(){ uFilter.plan=pEl.value; refresh(); });
    stEl.addEventListener('change', function(){ uFilter.status=stEl.value; refresh(); });
    el('uExport').onclick=function(){
      var us=usersFiltered(); csvDownload('kolkli-users.csv',[['id','name','email','plan','status','country','ip','projects','storage','joined']].concat(
        us.map(function(u){ return [u.id,dispName(u),u.email,u.plan,u.status,u.country,u.ip,u.projects,K.bytes(u.storage),K.fmtDate(u.created)]; })));
      U.toast(T('יוצא '+us.length+' משתמשים','Exported '+us.length+' users')); K.audit('ייצא CSV משתמשים','Exported users CSV');
    };
    on(page,'click','[data-act]', function(e,t){ userAction(t.getAttribute('data-act'), t.getAttribute('data-key')); });
  });

  /* ============================================================
     GUEST USERS
     ============================================================ */
  reg('guests', function(page){
    var g=D.guests();
    var blocked=g.filter(function(x){return x.blocked;}).length, evas=g.filter(function(x){return x.evasion;}).length,
        ups=g.reduce(function(a,b){return a+b.uploads;},0);
    var kpis='<div class="grid g-4" style="margin-bottom:16px">'+
      U.kpi({icon:'ghost', label:T('סה״כ אורחים','Total guests'), value:g.length, hl:true})+
      U.kpi({icon:'ban', label:T('חסומים','Blocked'), value:blocked})+
      U.kpi({icon:'alert', label:T('ניסיונות עקיפה','Evasion attempts'), value:evas})+
      U.kpi({icon:'upload', label:T('העלאות אורחים','Guest uploads'), value:ups})+
    '</div>';
    var rows=g.map(function(x){ var ct=D.ctry(x.country);
      return '<tr><td class="mono">'+esc(x.ip)+'</td>'+
        '<td>'+ct.f+' <span class="mono">'+esc(x.country)+'</span></td>'+
        '<td class="mono">'+esc(x.fingerprint)+'</td>'+
        '<td class="mono">'+x.uploads+'</td><td class="mono">'+x.sessions+'</td>'+
        '<td>'+esc(K.fmtDate(x.first))+'</td><td>'+esc(K.ago(x.last))+' '+esc(T('לפני','ago'))+'</td>'+
        '<td>'+(x.evasion?'<span class="pill p-amber">'+esc(T('חשוד','Suspicious'))+'</span> ':'')+(x.blocked?'<span class="pill p-red">'+esc(T('חסום','Blocked'))+'</span>':'<span class="pill p-green">'+esc(T('פעיל','Active'))+'</span>')+'</td>'+
        '<td><button class="btn sm" data-gact="'+(x.blocked?'unblock':'block')+'" data-id="'+esc(x.id)+'">'+ico(x.blocked?'unlock':'ban')+esc(x.blocked?T('שחרר','Unblock'):T('חסום','Block'))+'</button></td></tr>';
    }).join('');
    page.innerHTML = K.ui.sectionHead('guests') + kpis +
      card(cardH(T('אורחים','Guests'), T('מבקרים לא-רשומים לפי IP ו-Fingerprint','Anonymous visitors by IP & fingerprint'))+
        '<div class="tbl-wrap"><table class="tbl" style="min-width:840px"><thead><tr><th>IP</th><th>'+esc(T('מדינה','Country'))+'</th><th>Fingerprint</th><th>'+esc(T('העלאות','Uploads'))+'</th><th>Sessions</th><th>'+esc(T('נראה לראשונה','First seen'))+'</th><th>'+esc(T('לאחרונה','Last'))+'</th><th>'+esc(T('סטטוס','Status'))+'</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div>');
    on(page,'click','[data-gact]', function(e,t){
      var id=t.getAttribute('data-id'), act=t.getAttribute('data-gact');
      var arr=D.guests(), it=arr.find(function(x){return x.id===id;});
      if(it){ it.blocked=(act==='block'); localStorage.setItem('kadmin_demo_guests', JSON.stringify(arr));
        K.audit(act==='block'?'חסם אורח':'שחרר אורח', act+' guest', it.ip); U.toast(T('עודכן','Updated')); K.render(); }
    });
  });

  /* ============================================================
     ANALYTICS
     ============================================================ */
  var anRange=30;
  reg('analytics', function(page){
    var seg='<div class="seg" id="anSeg">'+[7,30,90].map(function(n){ return '<button data-r="'+n+'"'+(n===anRange?' class="on"':'')+'>'+n+T(' ימים','d')+'</button>'; }).join('')+'</div>';
    var us=D.users(), total=us.length;
    var dau=Math.round(total*0.34), wau=Math.round(total*0.62), mau=total;
    var kpis='<div class="grid g-3" style="margin-bottom:16px">'+
      U.kpi({icon:'zap', label:'DAU', value:dau, delta:6, hl:true})+
      U.kpi({icon:'users', label:'WAU', value:wau, delta:4})+
      U.kpi({icon:'globe', label:'MAU', value:mau, delta:11})+
    '</div>'+
    '<div class="grid g-3" style="margin-bottom:16px">'+
      U.kpi({icon:'refresh', label:T('שימור (Retention)','Retention'), value:'68%', delta:3})+
      U.kpi({icon:'down', label:T('נטישה (Churn)','Churn'), value:'4.2%', delta:-1})+
      U.kpi({icon:'trend', label:T('המרה (Conversion)','Conversion'), value:'7.9%', delta:2})+
    '</div>';

    var labels=D.dayLabels(anRange);
    var chart=U.lineChart([
      { name:T('הרשמות','Signups'), color:'#7c3aed', vals:D.series(101,anRange,5,0.03,4) },
      { name:T('העלאות','Uploads'), color:'#3b82f6', vals:D.series(202,anRange,38,0.02,15) },
      { name:T('הורדות','Downloads'), color:'#22b04b', vals:D.series(303,anRange,28,0.025,13) }
    ], labels);
    var legend='<div class="chart-legend"><span><i style="background:#7c3aed"></i>'+esc(T('הרשמות','Signups'))+'</span><span><i style="background:#3b82f6"></i>'+esc(T('העלאות','Uploads'))+'</span><span><i style="background:#22b04b"></i>'+esc(T('הורדות','Downloads'))+'</span></div>';

    // countries from real user distribution
    var cmap={}; us.forEach(function(u){ cmap[u.country]=(cmap[u.country]||0)+1; });
    var cbars=Object.keys(cmap).map(function(k){ var ct=D.ctry(k); return {label:T(ct.he,ct.en), flag:ct.f, value:cmap[k]}; }).sort(function(a,b){return b.value-a.value;}).slice(0,8);

    var devices=U.donut([{label:'Desktop',value:58,color:'#7c3aed'},{label:'Mobile',value:34,color:'#3b82f6'},{label:'Tablet',value:8,color:'#22b04b'}],{size:150,stroke:20,center:'58%',sub:'Desktop'});
    var devLegend='<div class="chart-legend"><span><i style="background:#7c3aed"></i>Desktop 58%</span><span><i style="background:#3b82f6"></i>Mobile 34%</span><span><i style="background:#22b04b"></i>Tablet 8%</span></div>';
    var browsers=U.bars([{label:'Chrome',value:64},{label:'Safari',value:18},{label:'Edge',value:9},{label:'Firefox',value:6},{label:'Opera',value:3}],{});
    var oss=U.bars([{label:'Windows',value:47},{label:'macOS',value:22},{label:'iPhone',value:15},{label:'Android',value:12},{label:'Linux',value:4}],{});

    page.innerHTML = K.ui.sectionHead('analytics', seg) + kpis +
      card(cardH(T('שימוש לאורך זמן','Usage over time'))+chart+legend)+
      '<div class="grid g-2" style="margin-top:16px">'+
        card(cardH(T('מדינות','Countries'), T('מהתפלגות המשתמשים האמיתית','from real user distribution'))+U.bars(cbars,{}))+
        card(cardH(T('מכשירים','Devices'))+'<div style="display:flex;justify-content:center">'+devices+'</div>'+devLegend)+
      '</div>'+
      '<div class="grid g-2" style="margin-top:16px">'+
        card(cardH(T('דפדפנים','Browsers'))+browsers)+
        card(cardH(T('מערכות הפעלה','Operating systems'))+oss)+
      '</div>';
    on(page,'click','#anSeg button', function(e,t){ anRange=+t.getAttribute('data-r'); K.render(); });
  });

  /* ============================================================
     FEATURE FLAGS
     ============================================================ */
  reg('flags', function(page){
    var f=D.flags(), defs=D.flagDefs;
    var on_=defs.filter(function(d){return f[d.id];}).length;
    var grid=defs.map(function(d){
      return '<div class="feat" style="justify-content:space-between;align-items:center">'+
        '<div style="display:flex;gap:11px;align-items:center"><div class="fi">'+ico('flag')+'</div><div><b>'+esc(T(d.t[0],d.t[1]))+'</b><span class="mono" style="font-size:11px">'+esc(d.id)+'</span></div></div>'+
        '<button class="sw'+(f[d.id]?' on':'')+'" data-flag="'+d.id+'" aria-label="'+esc(d.id)+'"></button></div>';
    }).join('');
    page.innerHTML = K.ui.sectionHead('flags') +
      '<div class="grid g-3" style="margin-bottom:16px">'+
        U.kpi({icon:'flag', label:T('מודולים פעילים','Active modules'), value:on_+' / '+defs.length, hl:true})+
        U.kpi({icon:'power', label:T('כבויים','Disabled'), value:defs.length-on_})+
        U.kpi({icon:'plug', label:T('נקרא דרך','Read via'), value:'KOLKLI_FLAGS'})+
      '</div>'+
      card(cardH(T('הדלקה/כיבוי מודולים','Toggle modules'), T('כל מתג נשמר ונחשף ב-window.KOLKLI_FLAGS — שאר הדפים יכולים לכבד אותו','Each toggle persists and is exposed on window.KOLKLI_FLAGS for other pages to honor'))+
        '<div class="feat-grid" style="grid-template-columns:repeat(auto-fill,minmax(260px,1fr))">'+grid+'</div>');
    on(page,'click','[data-flag]', function(e,t){
      var id=t.getAttribute('data-flag'), now=!t.classList.contains('on');
      D.setFlag(id, now); t.classList.toggle('on', now);
      K.audit((now?'הפעיל':'כיבה')+' feature flag', (now?'Enabled':'Disabled')+' flag', id);
      U.toast(T('Feature '+id+(now?' הופעל':' כובה'), 'Feature '+id+(now?' enabled':' disabled')), now?'ok':'warn');
    });
  });

  /* ============================================================
     PLANS
     ============================================================ */
  function planEditModal(plan, isNew){
    var p=plan||{ id:'', name:'', price:0, storageGB:1, filesDay:10, maxFileMB:100, color:'blue', features:[] };
    var m=U.modal('<h3>'+esc(isNew?T('חבילה חדשה','New plan'):T('עריכת חבילה','Edit plan'))+'</h3>'+
      '<label class="fld"><span>'+esc(T('שם','Name'))+'</span><input class="in" id="plName" value="'+esc(p.name)+'"></label>'+
      (isNew?'<label class="fld"><span>ID</span><input class="in" id="plId" value="'+esc(p.id)+'" placeholder="e.g. pro"></label>':'')+
      '<div class="grid g-2"><label class="fld"><span>'+esc(T('מחיר / חודש ($)','Price / mo ($)'))+'</span><input class="in" id="plPrice" type="number" value="'+p.price+'"></label>'+
      '<label class="fld"><span>'+esc(T('נפח (GB)','Storage (GB)'))+'</span><input class="in" id="plStorage" type="number" value="'+p.storageGB+'"></label></div>'+
      '<div class="grid g-2"><label class="fld"><span>'+esc(T('קבצים / יום','Files / day'))+'</span><input class="in" id="plFiles" type="number" value="'+p.filesDay+'"></label>'+
      '<label class="fld"><span>'+esc(T('גודל קובץ מקס׳ (MB)','Max file (MB)'))+'</span><input class="in" id="plMax" type="number" value="'+p.maxFileMB+'"></label></div>'+
      '<label class="fld"><span>'+esc(T('תכונות (שורה לכל אחת)','Features (one per line)'))+'</span><textarea class="ta" id="plFeat">'+esc((p.features||[]).join('\n'))+'</textarea></label>'+
      '<div style="display:flex;gap:9px;justify-content:flex-end;margin-top:8px"><button class="btn" id="plCancel">'+esc(T('ביטול','Cancel'))+'</button><button class="btn primary" id="plSave">'+esc(T('שמירה','Save'))+'</button></div>');
    m.querySelector('#plCancel').onclick=U.closeModal;
    m.querySelector('#plSave').onclick=function(){
      var plans=D.plans();
      var rec={ id:isNew?(m.querySelector('#plId').value||('plan_'+Date.now())):p.id,
        name:m.querySelector('#plName').value, price:+m.querySelector('#plPrice').value||0,
        storageGB:+m.querySelector('#plStorage').value||0, filesDay:+m.querySelector('#plFiles').value||0,
        maxFileMB:+m.querySelector('#plMax').value||0, color:p.color||'blue',
        features:m.querySelector('#plFeat').value.split('\n').map(function(x){return x.trim();}).filter(Boolean) };
      if(isNew) plans.push(rec); else { var i=plans.findIndex(function(x){return x.id===p.id;}); if(i>-1) plans[i]=rec; }
      D.savePlans(plans); K.audit((isNew?'יצר':'ערך')+' חבילה', (isNew?'Created':'Edited')+' plan', rec.id);
      U.closeModal(); U.toast(T('החבילה נשמרה','Plan saved')); K.render();
    };
  }
  reg('plans', function(page){
    var plans=D.plans(), us=D.users();
    var counts={}; us.forEach(function(u){ counts[u.plan]=(counts[u.plan]||0)+1; });
    var cards=plans.map(function(p){
      return '<div class="card" style="margin:0">'+
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">'+
          '<div><div style="display:flex;align-items:center;gap:8px"><b style="font-size:18px">'+esc(p.name)+'</b>'+U.pill(p.id,'p-'+(p.color||'grey'))+'</div>'+
          '<div style="font-size:26px;font-weight:800;margin-top:6px">'+esc(money(p.price))+'<span style="font-size:13px;color:var(--muted);font-weight:600">'+esc(T(' / חודש',' / mo'))+'</span></div></div>'+
          '<button class="btn sm" data-pl="'+esc(p.id)+'">'+ico('pencil')+esc(T('עריכה','Edit'))+'</button></div>'+
        '<div style="font-size:12.5px;color:var(--muted);margin-bottom:10px">'+esc((p.storageGB>=1024?(p.storageGB/1024)+' TB':p.storageGB+' GB'))+' · '+esc((p.filesDay>=9999?T('ללא הגבלה','Unlimited'):p.filesDay+T(' קבצים/יום',' files/day')))+'</div>'+
        '<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px">'+(p.features||[]).map(function(f){ return '<div style="display:flex;gap:7px;align-items:center;font-size:13px"><span style="color:var(--success)">'+ico('check')+'</span>'+esc(f)+'</div>'; }).join('')+'</div>'+
        '<div style="border-top:1px solid var(--line-2);padding-top:10px;font-size:12.5px;color:var(--muted)">'+esc((counts[p.id]||0)+' '+T('משתמשים','users'))+'</div>'+
      '</div>';
    }).join('');
    page.innerHTML = K.ui.sectionHead('plans','<button class="btn" id="plReset">'+ico('rotate')+esc(T('איפוס לברירת מחדל','Reset defaults'))+'</button><button class="btn primary" id="plAdd">'+ico('plus')+esc(T('חבילה חדשה','New plan'))+'</button>')+
      '<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(250px,1fr))">'+cards+'</div>';
    el('plAdd').onclick=function(){ planEditModal(null,true); };
    el('plReset').onclick=function(){ U.confirm({title:T('לאפס חבילות?','Reset plans?'),body:T('כל השינויים יוחזרו לברירת המחדל.','All changes revert to defaults.'),danger:true,ok:T('אפס','Reset')}).then(function(ok){ if(ok){ D.savePlans(D.plansDefault.slice()); K.audit('איפס חבילות','Reset plans'); U.toast(T('אופס','Reset')); K.render(); } }); };
    on(page,'click','[data-pl]', function(e,t){ var p=D.plans().find(function(x){return x.id===t.getAttribute('data-pl');}); if(p) planEditModal(p,false); });
  });

  /* ============================================================
     COUPONS
     ============================================================ */
  function couponModal(){
    var m=U.modal('<h3>'+esc(T('קופון חדש','New coupon'))+'</h3>'+
      '<label class="fld"><span>'+esc(T('קוד','Code'))+'</span><input class="in" id="cpCode" placeholder="SUMMER25" style="text-transform:uppercase"></label>'+
      '<div class="grid g-2"><label class="fld"><span>'+esc(T('סוג','Type'))+'</span><select class="sel" id="cpType"><option value="percent">'+esc(T('אחוז %','Percent %'))+'</option><option value="amount">'+esc(T('סכום $','Amount $'))+'</option></select></label>'+
      '<label class="fld"><span>'+esc(T('ערך','Value'))+'</span><input class="in" id="cpVal" type="number" value="10"></label></div>'+
      '<div class="grid g-2"><label class="fld"><span>'+esc(T('מקס׳ שימושים','Max uses'))+'</span><input class="in" id="cpMax" type="number" value="100"></label>'+
      '<label class="fld"><span>'+esc(T('הזמנה מינ׳ ($)','Min order ($)'))+'</span><input class="in" id="cpMin" type="number" value="0"></label></div>'+
      '<label class="fld"><span>'+esc(T('תוקף עד','Expires'))+'</span><input class="in" id="cpExp" type="date"></label>'+
      '<div style="display:flex;gap:9px;justify-content:flex-end;margin-top:8px"><button class="btn" id="cpCancel">'+esc(T('ביטול','Cancel'))+'</button><button class="btn primary" id="cpSave">'+esc(T('יצירה','Create'))+'</button></div>');
    m.querySelector('#cpCancel').onclick=U.closeModal;
    m.querySelector('#cpSave').onclick=function(){
      var code=(m.querySelector('#cpCode').value||'').toUpperCase().trim(); if(!code){ U.toast(T('חסר קוד','Code required'),'warn'); return; }
      var exp=m.querySelector('#cpExp').value; var c=D.coupons();
      c.unshift({ code:code, type:m.querySelector('#cpType').value, value:+m.querySelector('#cpVal').value||0,
        uses:0, max:+m.querySelector('#cpMax').value||0, min:+m.querySelector('#cpMin').value||0,
        expires: exp?new Date(exp).getTime():Date.now()+30*86400000, active:true });
      D.saveCoupons(c); K.audit('יצר קופון','Created coupon', code); U.closeModal(); U.toast(T('הקופון נוצר','Coupon created')); K.render();
    };
  }
  reg('coupons', function(page){
    var c=D.coupons();
    var rows=c.map(function(x,i){
      var expired=x.expires<Date.now();
      return '<tr><td><span class="mono" style="font-size:13px;font-weight:800;color:var(--ink)">'+esc(x.code)+'</span></td>'+
        '<td>'+(x.type==='percent'?x.value+'%':money(x.value))+'</td>'+
        '<td class="mono">'+x.uses+' / '+x.max+'</td>'+
        '<td>'+(x.min?money(x.min):'—')+'</td>'+
        '<td>'+esc(K.fmtDate(x.expires))+(expired?' <span class="pill p-grey">'+esc(T('פג','Expired'))+'</span>':'')+'</td>'+
        '<td><button class="sw'+(x.active&&!expired?' on':'')+'" data-cp-toggle="'+i+'"'+(expired?' disabled':'')+'></button></td>'+
        '<td><button class="btn icon-btn danger" data-cp-del="'+i+'">'+ico('trash')+'</button></td></tr>';
    }).join('');
    page.innerHTML = K.ui.sectionHead('coupons','<button class="btn primary" id="cpAdd">'+ico('plus')+esc(T('קופון חדש','New coupon'))+'</button>')+
      card(cardH(T('קופונים','Coupons'), c.length+' '+T('קופונים','coupons'))+
        (c.length?'<div class="tbl-wrap"><table class="tbl"><thead><tr><th>'+esc(T('קוד','Code'))+'</th><th>'+esc(T('הנחה','Discount'))+'</th><th>'+esc(T('שימושים','Uses'))+'</th><th>'+esc(T('מינ׳','Min'))+'</th><th>'+esc(T('תוקף','Expires'))+'</th><th>'+esc(T('פעיל','Active'))+'</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div>':'<div class="empty"><div class="ei">'+ico('ticket')+'</div><h3>'+esc(T('אין קופונים','No coupons'))+'</h3></div>'));
    el('cpAdd').onclick=couponModal;
    on(page,'click','[data-cp-toggle]', function(e,t){ var i=+t.getAttribute('data-cp-toggle'); var c=D.coupons(); c[i].active=!c[i].active; D.saveCoupons(c); t.classList.toggle('on', c[i].active); K.audit('שינה קופון','Toggled coupon', c[i].code); });
    on(page,'click','[data-cp-del]', function(e,t){ var i=+t.getAttribute('data-cp-del'); var c=D.coupons(); var code=c[i].code;
      U.confirm({title:T('למחוק קופון?','Delete coupon?'),body:code,danger:true,ok:T('מחק','Delete')}).then(function(ok){ if(ok){ c.splice(i,1); D.saveCoupons(c); K.audit('מחק קופון','Deleted coupon',code); U.toast(T('נמחק','Deleted')); K.render(); } }); });
  });

  /* ============================================================
     BILLING
     ============================================================ */
  reg('billing', function(page){
    var pays=D.payments(), us=D.users();
    var mrr=0; us.forEach(function(u){ mrr+=planPrice(u.plan); });
    var monthRev=pays.filter(function(p){ return p.status==='paid' && p.date>Date.now()-30*86400000; }).reduce(function(a,b){return a+b.amount;},0);
    var paid=pays.filter(function(p){return p.status==='paid';}).length,
        failed=pays.filter(function(p){return p.status==='failed';}).length,
        refunded=pays.filter(function(p){return p.status==='refunded';}).length;
    var kpis='<div class="grid g-4" style="margin-bottom:16px">'+
      U.kpi({icon:'dollar', label:T('הכנסה חודשית (MRR)','MRR'), value:money(mrr), delta:9, hl:true})+
      U.kpi({icon:'card', label:T('הכנסה ב-30 יום','Revenue 30d'), value:money(monthRev), delta:6})+
      U.kpi({icon:'check', label:T('תשלומים מוצלחים','Successful'), value:paid})+
      U.kpi({icon:'alert', label:T('נכשלו / הוחזרו','Failed / Refunded'), value:failed+' / '+refunded})+
    '</div>';
    var chart=U.lineChart([{name:'Revenue', color:'#22b04b', vals:D.series(909,30,120,0.02,40)}], D.dayLabels(30));
    var stMap={ paid:'p-green', failed:'p-red', refunded:'p-grey' };
    var stTx={ paid:T('שולם','Paid'), failed:T('נכשל','Failed'), refunded:T('הוחזר','Refunded') };
    var mIc={ stripe:'card', paypal:'dollar', manual:'pencil' };
    var rows=pays.map(function(p){
      return '<tr><td class="mono">'+esc(p.id)+'</td>'+
        '<td><div class="u-cell"><span class="u-av" style="width:30px;height:30px;font-size:12px">'+esc((p.name||p.user).charAt(0).toUpperCase())+'</span><span class="u-meta"><span class="u-name" style="font-size:13px">'+esc(p.name||'—')+'</span><span class="u-email">'+esc(p.user)+'</span></span></div></td>'+
        '<td style="font-weight:800">'+esc(money(p.amount))+'</td>'+
        '<td><span class="pill p-grey">'+ico(mIc[p.method]||'card')+esc(p.method)+'</span></td>'+
        '<td>'+U.planPill(p.plan)+'</td>'+
        '<td><span class="pill '+(stMap[p.status]||'p-grey')+'">'+esc(stTx[p.status]||p.status)+'</span></td>'+
        '<td>'+esc(K.fmtDate(p.date))+'</td>'+
        '<td>'+(p.status==='paid'?'<button class="btn sm danger" data-refund="'+esc(p.id)+'">'+ico('rotate')+esc(T('החזר','Refund'))+'</button>':'')+'</td></tr>';
    }).join('');
    page.innerHTML = K.ui.sectionHead('billing','<button class="btn" id="biExport">'+ico('download')+esc(T('ייצוא','Export'))+'</button>')+ kpis +
      card(cardH(T('הכנסות — 30 יום','Revenue — 30 days'))+chart)+
      card(cardH(T('תשלומים','Payments'), pays.length+' '+T('עסקאות','transactions'))+
        '<div class="tbl-wrap"><table class="tbl" style="min-width:820px"><thead><tr><th>'+esc(T('חשבונית','Invoice'))+'</th><th>'+esc(T('משתמש','User'))+'</th><th>'+esc(T('סכום','Amount'))+'</th><th>'+esc(T('אמצעי','Method'))+'</th><th>'+esc(T('חבילה','Plan'))+'</th><th>'+esc(T('סטטוס','Status'))+'</th><th>'+esc(T('תאריך','Date'))+'</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div>');
    on(page,'click','[data-refund]', function(e,t){ var id=t.getAttribute('data-refund');
      U.confirm({title:T('לבצע החזר?','Issue refund?'),body:id,danger:true,ok:T('החזר','Refund')}).then(function(ok){ if(!ok) return;
        var pays=D.payments(), p=pays.find(function(x){return x.id===id;}); if(p){ p.status='refunded'; localStorage.setItem('kadmin_payments',JSON.stringify(pays)); K.audit('ביצע החזר','Issued refund', id); U.toast(T('ההחזר בוצע','Refunded')); K.render(); } }); });
    el('biExport').onclick=function(){ csvDownload('kolkli-payments.csv',[['invoice','user','amount','method','plan','status','date']].concat(pays.map(function(p){ return [p.id,p.user,p.amount,p.method,p.plan,p.status,K.fmtDate(p.date)]; }))); U.toast(T('יוצא','Exported')); };
  });

  /* ============================================================
     ROLES & PERMISSIONS
     ============================================================ */
  reg('roles', function(page){
    var roles=D.roles();
    var caps=[['users',T('משתמשים','Users')],['billing',T('כספים','Billing')],['content',T('תוכן','Content')],['files',T('קבצים','Files')],['ai','AI'],['security',T('אבטחה','Security')],['system',T('מערכת','System')],['settings',T('הגדרות','Settings')]];
    var cards=roles.map(function(role){
      var chips=caps.map(function(c){ var has=role.all||role.caps.indexOf(c[0])>-1;
        return '<button class="pill '+(has?'p-violet':'p-grey')+'" data-role="'+role.id+'" data-cap="'+c[0]+'"'+(role.all?' disabled':'')+' style="cursor:'+(role.all?'default':'pointer')+';border:none">'+(has?ico('check'):'')+esc(c[1])+'</button>'; }).join('');
      return '<div class="card" style="margin:0"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">'+
        '<div style="display:flex;align-items:center;gap:9px"><span class="u-av" style="background:var(--'+(role.color==='grey'?'panel-3':role.color==='violet'?'accent-soft':role.color+'-soft')+');color:var(--'+(role.color==='grey'?'muted':role.color==='violet'?'accent-dim':role.color+'-dim')+')">'+ico('sliders')+'</span>'+
        '<div><b style="font-size:15px">'+esc(T(role.name[0],role.name[1]))+'</b><div style="font-size:12px;color:var(--muted)">'+role.people+' '+esc(T('אנשים','people'))+(role.all?' · '+esc(T('גישה מלאה','full access')):'')+'</div></div></div></div>'+
        '<div style="display:flex;flex-wrap:wrap;gap:6px">'+chips+'</div></div>';
    }).join('');
    page.innerHTML = K.ui.sectionHead('roles') +
      card(cardH(T('היררכיית הרשאות','Permission hierarchy'), T('לחצו על יכולת כדי להעניק/לשלול לתפקיד','Click a capability to grant/revoke for a role')))+
      '<div class="grid g-2">'+cards+'</div>';
    on(page,'click','[data-cap]', function(e,t){ if(t.disabled) return;
      var rid=t.getAttribute('data-role'), cap=t.getAttribute('data-cap'), roles=D.roles(), role=roles.find(function(x){return x.id===rid;});
      if(!role||role.all) return; var i=role.caps.indexOf(cap); if(i>-1) role.caps.splice(i,1); else role.caps.push(cap);
      D.saveRoles(roles); K.audit('עדכן הרשאות תפקיד','Updated role caps', rid+':'+cap); K.render();
    });
  });

  /* ============================================================
     ANNOUNCEMENTS
     ============================================================ */
  reg('announce', function(page){
    var list=D.announcements();
    var rows=list.map(function(a,i){
      return '<div class="feat" style="justify-content:space-between;align-items:flex-start"><div style="display:flex;gap:11px"><div class="fi">'+ico(a.type==='popup'?'bell':a.type==='banner'?'megaphone':'dash')+'</div>'+
        '<div><b>'+esc(a.title)+'</b><span>'+esc(a.message)+'</span><div style="margin-top:5px;display:flex;gap:6px">'+U.pill(a.type,'p-blue')+U.pill(a.audience||'all','p-grey')+(a.active?U.pill(T('פעיל','Active'),'p-green'):U.pill(T('טיוטה','Draft'),'p-grey'))+'</div></div></div>'+
        '<div style="display:flex;gap:6px"><button class="sw'+(a.active?' on':'')+'" data-an-toggle="'+i+'"></button><button class="btn icon-btn danger" data-an-del="'+i+'">'+ico('trash')+'</button></div></div>';
    }).join('');
    page.innerHTML = K.ui.sectionHead('announce') +
      '<div class="grid" style="grid-template-columns:1fr 1.3fr">'+
        card(cardH(T('הודעה חדשה','New announcement'))+
          '<label class="fld"><span>'+esc(T('כותרת','Title'))+'</span><input class="in" id="anTitle"></label>'+
          '<label class="fld"><span>'+esc(T('תוכן','Message'))+'</span><textarea class="ta" id="anMsg"></textarea></label>'+
          '<div class="grid g-2"><label class="fld"><span>'+esc(T('סוג','Type'))+'</span><select class="sel" id="anType"><option value="banner">Banner</option><option value="popup">Popup</option><option value="dashboard">Dashboard</option></select></label>'+
          '<label class="fld"><span>'+esc(T('קהל','Audience'))+'</span><select class="sel" id="anAud"><option value="all">'+esc(T('כולם','Everyone'))+'</option><option value="free">Free</option><option value="paid">'+esc(T('בתשלום','Paying'))+'</option></select></label></div>'+
          '<button class="btn primary" id="anCreate" style="width:100%">'+ico('megaphone')+esc(T('פרסום','Publish'))+'</button>')+
        card(cardH(T('הודעות קיימות','Existing'), list.length+'')+(list.length?'<div class="feat-grid" style="grid-template-columns:1fr">'+rows+'</div>':'<div class="empty"><div class="ei">'+ico('megaphone')+'</div><h3>'+esc(T('אין הודעות','No announcements'))+'</h3><p>'+esc(T('צרו הודעה ראשונה מימין','Create your first one'))+'</p></div>'))+
      '</div>';
    el('anCreate').onclick=function(){
      var title=el('anTitle').value.trim(); if(!title){ U.toast(T('חסרה כותרת','Title required'),'warn'); return; }
      var a=D.announcements(); a.unshift({ title:title, message:el('anMsg').value.trim(), type:el('anType').value, audience:el('anAud').value, active:true, ts:Date.now() });
      D.saveAnnouncements(a); K.audit('פרסם הודעה','Published announcement', title); U.toast(T('ההודעה פורסמה','Published')); K.render();
    };
    on(page,'click','[data-an-toggle]', function(e,t){ var i=+t.getAttribute('data-an-toggle'), a=D.announcements(); a[i].active=!a[i].active; D.saveAnnouncements(a); t.classList.toggle('on',a[i].active); });
    on(page,'click','[data-an-del]', function(e,t){ var i=+t.getAttribute('data-an-del'), a=D.announcements(); a.splice(i,1); D.saveAnnouncements(a); K.audit('מחק הודעה','Deleted announcement'); U.toast(T('נמחק','Deleted')); K.render(); });
  });

  /* ============================================================
     AUDIT LOGS
     ============================================================ */
  reg('audit', function(page){
    var log=D.auditLog();
    var rows=log.map(function(a){
      return '<tr><td><div class="u-cell"><span class="u-av" style="width:30px;height:30px;font-size:12px">'+esc((a.who||'?').charAt(0).toUpperCase())+'</span><span class="u-email">'+esc(a.who)+'</span></div></td>'+
        '<td style="font-weight:600;color:var(--ink)">'+esc(T(a.action[0],a.action[1]||a.action[0]))+'</td>'+
        '<td class="mono">'+esc(a.target||'—')+'</td>'+
        '<td class="mono">'+esc(a.ip||'127.0.0.1')+'</td>'+
        '<td>'+esc(K.fmtDateTime(a.ts))+'</td></tr>';
    }).join('');
    page.innerHTML = K.ui.sectionHead('audit','<button class="btn" id="auExport">'+ico('download')+esc(T('ייצוא','Export'))+'</button><button class="btn danger" id="auClear">'+ico('trash')+esc(T('ניקוי יומן','Clear log'))+'</button>')+
      card(cardH(T('יומן ביקורת','Audit log'), log.length+' '+T('רשומות','entries'))+
        '<div class="tbl-wrap"><table class="tbl" style="min-width:720px"><thead><tr><th>'+esc(T('מי','Who'))+'</th><th>'+esc(T('פעולה','Action'))+'</th><th>'+esc(T('יעד','Target'))+'</th><th>IP</th><th>'+esc(T('מתי','When'))+'</th></tr></thead><tbody>'+rows+'</tbody></table></div>');
    el('auExport').onclick=function(){ csvDownload('kolkli-audit.csv',[['who','action','target','ip','when']].concat(log.map(function(a){ return [a.who,T(a.action[0],a.action[1]||a.action[0]),a.target,a.ip||'127.0.0.1',K.fmtDateTime(a.ts)]; }))); U.toast(T('יוצא','Exported')); };
    el('auClear').onclick=function(){ U.confirm({title:T('לנקות את היומן?','Clear audit log?'),body:T('כל הרשומות יימחקו.','All entries will be removed.'),danger:true,ok:T('נקה','Clear')}).then(function(ok){ if(ok){ localStorage.setItem('kadmin_audit',JSON.stringify([])); U.toast(T('היומן נוקה','Cleared')); K.render(); } }); };
  });

  /* ============================================================
     MAINTENANCE
     ============================================================ */
  reg('maintenance', function(page){
    var m=D.maint();
    var tools=[
      { act:'cache', ic:'zap', t:['ניקוי Cache','Clear cache'] },
      { act:'sessions', ic:'user', t:['ניקוי Sessions','Clear sessions'] },
      { act:'temp', ic:'trash', t:['ניקוי קבצים זמניים','Clear temp files'] },
      { act:'cdn', ic:'cloud', t:['Purge CDN','Purge CDN'] },
      { act:'workers', ic:'refresh', t:['הפעלה מחדש של Workers','Restart workers'] },
      { act:'reindex', ic:'db', t:['אינדוקס מחדש','Re-index DB'] }
    ];
    page.innerHTML = K.ui.sectionHead('maintenance') +
      card('<div style="display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap">'+
        '<div><h2 style="margin:0 0 3px;font-size:16px;font-weight:800">'+esc(T('מצב תחזוקה','Maintenance mode'))+'</h2><p class="sub" style="margin:0">'+esc(T('כשמופעל, המבקרים יראו עמוד תחזוקה עם ההודעה שלך','When on, visitors see a maintenance page with your message'))+'</p></div>'+
        '<button class="sw'+(m.on?' on':'')+'" id="maintSw"></button></div>'+
        '<label class="fld" style="margin-top:14px"><span>'+esc(T('הודעת תחזוקה','Maintenance message'))+'</span><textarea class="ta" id="maintMsg" placeholder="'+esc(T('חוזרים בקרוב…','Back soon…'))+'">'+esc(m.message||'')+'</textarea></label>'+
        '<button class="btn primary" id="maintSave">'+ico('check')+esc(T('שמירה','Save'))+'</button>')+
      card(cardH(T('כלי מערכת','System tools'), T('פעולות דמו — נרשמות ליומן הביקורת','Demo actions — recorded to the audit log'))+
        '<div class="feat-grid">'+tools.map(function(t){ return '<button class="feat" data-tool="'+t.act+'" style="cursor:pointer;text-align:start;width:100%"><div class="fi">'+ico(t.ic)+'</div><div><b>'+esc(T(t.t[0],t.t[1]))+'</b></div></button>'; }).join('')+'</div>');
    var sw=el('maintSw');
    sw.onclick=function(){ sw.classList.toggle('on'); };
    el('maintSave').onclick=function(){ var nm={ on:sw.classList.contains('on'), message:el('maintMsg').value }; D.setMaint(nm); K.audit('עדכן מצב תחזוקה','Updated maintenance', nm.on?'ON':'OFF'); U.toast(T('נשמר','Saved')+(nm.on?' · '+T('תחזוקה פעילה','maintenance ON'):'')); };
    on(page,'click','[data-tool]', function(e,t){ var a=t.getAttribute('data-tool'); K.audit('הריץ כלי מערכת: '+a,'Ran system tool: '+a); U.toast(T('בוצע: ','Done: ')+a,'info'); });
  });

  /* ============================================================
     CONTROL CENTER
     ============================================================ */
  reg('control', function(page){
    var us=D.users(), m=D.maint();
    var tiles=[
      { go:'users', ic:'login', t:['התחבר כמשתמש','Login as user'], d:['בחרו משתמש מהטבלה','Pick from the users table'] },
      { go:'announce', ic:'megaphone', t:['הודעה גורפת','Broadcast'], d:['שליחה לכל המשתמשים','Send to everyone'] },
      { act:'cache', ic:'zap', t:['ניקוי Cache','Clear cache'], d:['','' ] },
      { act:'sessions', ic:'user', t:['ניקוי Sessions','Clear sessions'], d:['','' ] },
      { act:'queues', ic:'pause', t:['השהיית תורים','Pause queues'], d:['עצירת עיבוד רקע','Halt background jobs'] },
      { go:'flags', ic:'flag', t:['Feature Flags','Feature Flags'], d:['הפעלת/כיבוי מודולים','Toggle modules'] },
      { go:'billing', ic:'card', t:['חיובים','Billing'], d:['תשלומים והחזרים','Payments & refunds'] },
      { act:'export', ic:'download', t:['ייצוא נתונים','Export data'], d:['CSV של משתמשים','Users CSV'] }
    ];
    var alerts=[
      { c:'p-amber', ic:'hd', he:'ניצול אחסון S3 עבר 78%', en:'S3 storage usage over 78%' },
      { c:'p-red', ic:'alert', he:'עלייה בשגיאות 5xx (דמו)', en:'Spike in 5xx errors (demo)' },
      { c:'p-blue', ic:'user', he:us.filter(function(u){return u.status==='blocked';}).length+' משתמשים חסומים', en:us.filter(function(u){return u.status==='blocked';}).length+' users blocked' }
    ];
    page.innerHTML = K.ui.sectionHead('control') +
      (m.on?'<div class="backend-note" style="background:var(--danger-soft);border-color:var(--danger)"><div class="bn-ic" style="background:var(--danger)">'+ico('wrench')+'</div><div><b>'+esc(T('מצב תחזוקה פעיל','Maintenance mode is ON'))+'</b><p>'+esc(m.message||T('המבקרים רואים עמוד תחזוקה','Visitors see a maintenance page'))+'</p></div></div>':'')+
      '<div class="grid g-4" style="margin-bottom:16px">'+
        U.kpi({icon:'users', label:T('משתמשים','Users'), value:us.length, hl:true})+
        U.kpi({icon:'command', label:T('פעולות זמינות','Actions'), value:tiles.length})+
        U.kpi({icon:'wrench', label:T('תחזוקה','Maintenance'), value:m.on?T('פעיל','ON'):T('כבוי','OFF')})+
        U.kpi({icon:'alert', label:T('התראות','Alerts'), value:alerts.length})+
      '</div>'+
      '<div class="grid g-2">'+
        card(cardH(T('פעולות מהירות','Quick actions'))+'<div class="feat-grid">'+tiles.map(function(t){
          return '<button class="feat" '+(t.go?'data-go="'+t.go+'"':'data-cact="'+t.act+'"')+' style="cursor:pointer;text-align:start;width:100%"><div class="fi">'+ico(t.ic)+'</div><div><b>'+esc(T(t.t[0],t.t[1]))+'</b>'+(t.d&&t.d[0]?'<span>'+esc(T(t.d[0],t.d[1]))+'</span>':'')+'</div></button>';
        }).join('')+'</div>')+
        card(cardH(T('התראות קריטיות','Critical alerts'))+'<div class="feed">'+alerts.map(function(a){ return '<div class="feed-i"><span class="feed-ic '+a.c+'">'+ico(a.ic)+'</span><div class="feed-tx"><b>'+esc(T(a.he,a.en))+'</b><p class="tm">'+esc(K.ago(Date.now()-3600000))+' '+esc(T('לפני','ago'))+'</p></div></div>'; }).join('')+'</div>')+
      '</div>';
    on(page,'click','[data-go]', function(e,t){ K.go(t.getAttribute('data-go')); });
    on(page,'click','[data-cact]', function(e,t){ var a=t.getAttribute('data-cact');
      if(a==='export'){ var us=D.users(); csvDownload('kolkli-users.csv',[['name','email','plan','status']].concat(us.map(function(u){return [dispName(u),u.email,u.plan,u.status];}))); U.toast(T('יוצא','Exported')); return; }
      K.audit('פעולת מרכז שליטה: '+a,'Control action: '+a); U.toast(T('בוצע: ','Done: ')+a,'info');
    });
  });

  /* ============================================================
     GLOBAL SEARCH
     ============================================================ */
  var searchQ='';
  K.globalSearch=function(q){ searchQ=q||''; if(K.current()==='search') K.render(); else K.go('search'); };
  reg('search', function(page){
    var q=searchQ.trim().toLowerCase();
    function block(title, items){ if(!items.length) return ''; return card(cardH(title, items.length+'')+items.join('')); }
    var results='';
    if(q){
      var us=D.users().filter(function(u){ return dispName(u).toLowerCase().indexOf(q)>-1 || (u.email||'').toLowerCase().indexOf(q)>-1 || (u.ip||'').indexOf(q)>-1; }).slice(0,8)
        .map(function(u){ return '<div class="feat" data-go-user="'+esc(u.email)+'" style="cursor:pointer"><div class="fi">'+ico('user')+'</div><div><b>'+esc(dispName(u))+'</b><span>'+esc(u.email)+' · '+esc(u.plan)+'</span></div></div>'; });
      var pays=D.payments().filter(function(p){ return p.id.toLowerCase().indexOf(q)>-1 || (p.user||'').toLowerCase().indexOf(q)>-1; }).slice(0,6)
        .map(function(p){ return '<div class="feat"><div class="fi">'+ico('card')+'</div><div><b>'+esc(p.id)+' · '+esc(money(p.amount))+'</b><span>'+esc(p.user)+'</span></div></div>'; });
      var aud=D.auditLog().filter(function(a){ return (a.target||'').toLowerCase().indexOf(q)>-1 || T(a.action[0],a.action[1]||'').toLowerCase().indexOf(q)>-1; }).slice(0,6)
        .map(function(a){ return '<div class="feat"><div class="fi">'+ico('listChecks')+'</div><div><b>'+esc(T(a.action[0],a.action[1]||a.action[0]))+'</b><span>'+esc(a.target||'')+' · '+esc(K.fmtDateTime(a.ts))+'</span></div></div>'; });
      var total=us.length+pays.length+aud.length;
      results = total? (block(T('משתמשים','Users'),us)+block(T('תשלומים','Payments'),pays)+block(T('יומן ביקורת','Audit'),aud))
        : '<div class="card"><div class="empty"><div class="ei">'+ico('search')+'</div><h3>'+esc(T('אין תוצאות','No results'))+'</h3><p>'+esc(T('לא נמצא דבר עבור','Nothing found for')+' “'+searchQ+'”')+'</p></div></div>';
    } else {
      results='<div class="card"><div class="empty"><div class="ei">'+ico('search')+'</div><h3>'+esc(T('חיפוש גלובלי','Global search'))+'</h3><p>'+esc(T('חפשו משתמש, אימייל, IP, חשבונית או פעולה','Search a user, email, IP, invoice or action'))+'</p></div></div>';
    }
    page.innerHTML = K.ui.sectionHead('search') +
      card('<label class="gsearch" style="width:100%"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><input id="sInput" type="text" placeholder="'+esc(T('חיפוש חוצה-מערכת…','Search across the system…'))+'" value="'+esc(searchQ)+'"></label>')+
      results;
    var si=el('sInput'); if(si){ si.focus(); si.addEventListener('input', function(){ searchQ=si.value; var sc=el('scroll'),y=sc.scrollTop; K.render(); el('scroll').scrollTop=y; var ni=el('sInput'); if(ni){ ni.focus(); ni.setSelectionRange(ni.value.length,ni.value.length); } }); }
    on(page,'click','[data-go-user]', function(e,t){ profileDrawer(t.getAttribute('data-go-user')); });
  });

  /* ============================================================
     SCAFFOLD MODULES  (needs-backend, consistent layout)
     ============================================================ */
  var MODULES={
    monitoring:{ note:['ניטור בזמן אמת דורש חיבור למקורות מדדים (Prometheus / uptime / provider APIs).','Real-time monitoring needs metric sources (Prometheus / uptime / provider APIs).'], feats:[
      {ic:'gauge',t:['Uptime & Response Time','Uptime & Response Time']},{ic:'cpu',t:['עומסי CPU / RAM','CPU / RAM load']},
      {ic:'db',t:['מצב מסד נתונים','Database health']},{ic:'server',t:['תורים פעילים','Active queues']},
      {ic:'alert',t:['שגיאות 4xx / 5xx','4xx / 5xx errors']},{ic:'plug',t:['סטטוס שירותי צד ג׳','3rd-party status'],d:['Stripe, PayPal, OpenAI, Cloudflare','Stripe, PayPal, OpenAI, Cloudflare']}
    ]},
    pages:{ feats:[
      {ic:'plus',t:['יצירת/עריכת עמוד','Create/edit page']},{ic:'globe',t:['SEO · Meta · Slug','SEO · Meta · Slug']},
      {ic:'listChecks',t:['Robots & Schema','Robots & Schema']},{ic:'edit',t:['Header / Footer','Header / Footer']}
    ]},
    menu:{ feats:[
      {ic:'menuList',t:['Header / Footer','Header / Footer']},{ic:'dash',t:['Dashboard / Sidebar','Dashboard / Sidebar']},
      {ic:'form',t:['תפריט מובייל','Mobile menu']},{ic:'sliders',t:['גרירה וסידור','Drag & reorder']}
    ]},
    forms:{ note:['הבנאי הוויזואלי כבר קיים ב-Form Studio; המסך הזה ירכז את כל הטפסים.','A visual builder already exists in Form Studio; this screen will centralize all forms.'], feats:[
      {ic:'form',t:['File Request / Review','File Request / Review']},{ic:'check',t:['Validation & Required','Validation & Required']},
      {ic:'sliders',t:['לוגיקה מותנית','Conditional logic']},{ic:'plus',t:['בניית שדות','Field builder']}
    ]},
    blog:{ feats:[
      {ic:'edit',t:['פוסטים','Posts']},{ic:'folder',t:['קטגוריות ותגיות','Categories & tags']},
      {ic:'life',t:['תגובות','Comments']},{ic:'globe',t:['SEO','SEO']}
    ]},
    media:{ feats:[
      {ic:'image',t:['כל התמונות/וידאו/אודיו','All images/video/audio']},{ic:'search',t:['חיפוש ותגיות','Search & tags']},
      {ic:'trash',t:['מחיקה מרובה','Bulk delete']},{ic:'download',t:['הורדה מרובה','Bulk download']}
    ]},
    files:{ note:['שלושת שירותי הקבצים היום הם demo מבוססי-דפדפן; מנהל קבצים גלובלי דורש אחסון מרכזי (S3/R2).','The 3 file services are browser-local demos today; a global file manager needs central storage (S3/R2).'], feats:[
      {ic:'search',t:['חיפוש בכל הקבצים','Search all files']},{ic:'trash',t:['מחיקה / שחזור','Delete / restore']},
      {ic:'upload',t:['העברה והורדה','Move & download']},{ic:'shield',t:['Virus / Duplicate scan','Virus / Duplicate scan']}
    ]},
    email:{ note:['שליחת מייל דורשת ספק (SendGrid / Resend / Brevo / SMTP).','Sending email needs a provider (SendGrid / Resend / Brevo / SMTP).'], feats:[
      {ic:'mail',t:['Templates','Templates']},{ic:'server',t:['Queue & Failed','Queue & Failed']},
      {ic:'clock',t:['היסטוריה','History']},{ic:'eye',t:['תצוגה מקדימה','Preview']}
    ]},
    notifications:{ feats:[
      {ic:'bell',t:['Push / In-App','Push / In-App']},{ic:'mail',t:['Email','Email']},
      {ic:'phone',t:['SMS / WhatsApp','SMS / WhatsApp']},{ic:'megaphone',t:['Broadcast','Broadcast']}
    ]},
    support:{ feats:[
      {ic:'life',t:['Tickets & Chats','Tickets & Chats']},{ic:'alert',t:['Bugs','Bugs']},
      {ic:'star',t:['Feature Requests','Feature Requests']},{ic:'listChecks',t:['Status & Priority','Status & Priority']}
    ]},
    ai:{ note:['מרכז ה-AI יתחבר לספק ה-LLM (window.KOLKLI_AI / backend) ולמדדי שימוש.','The AI Center wires to the LLM provider (window.KOLKLI_AI / backend) and usage metrics.'], feats:[
      {ic:'cpu',t:['בקשות · Tokens · עלות','Requests · Tokens · Cost']},{ic:'sliders',t:['Rate Limit & מודלים','Rate Limit & models']},
      {ic:'form',t:['Prompt Templates','Prompt Templates']},{ic:'terminal',t:['System Prompt & Logs','System Prompt & Logs']}
    ]},
    queue:{ feats:[
      {ic:'upload',t:['Uploads / Transcoding','Uploads / Transcoding']},{ic:'cpu',t:['AI / OCR / Compression','AI / OCR / Compression']},
      {ic:'refresh',t:['Retry / Cancel','Retry / Cancel']},{ic:'sliders',t:['Priority','Priority']}
    ]},
    api:{ feats:[
      {ic:'key',t:['Keys & OAuth / JWT','Keys & OAuth / JWT']},{ic:'chart',t:['Usage & Limits','Usage & Limits']},
      {ic:'plug',t:['Webhooks','Webhooks']},{ic:'shield',t:['הרשאות','Scopes']}
    ]},
    integrations:{ feats:[
      {ic:'cloud',t:['Dropbox / Drive / OneDrive','Dropbox / Drive / OneDrive']},{ic:'box',t:['AWS / S3 / Cloudflare','AWS / S3 / Cloudflare']},
      {ic:'plug',t:['Zapier / Make','Zapier / Make']},{ic:'bell',t:['Slack / Discord','Slack / Discord']}
    ]},
    syslogs:{ feats:[
      {ic:'terminal',t:['Node / Nginx / FFmpeg','Node / Nginx / FFmpeg']},{ic:'server',t:['Workers / Queue / Cron','Workers / Queue / Cron']},
      {ic:'alert',t:['Errors','Errors']},{ic:'search',t:['חיפוש וסינון','Search & filter']}
    ]},
    database:{ feats:[
      {ic:'db',t:['Tables & Indexes','Tables & Indexes']},{ic:'hd',t:['Size','Size']},
      {ic:'clock',t:['Slow Queries','Slow Queries']},{ic:'zap',t:['Optimization','Optimization']}
    ]},
    backups:{ feats:[
      {ic:'save',t:['Database & Files','Database & Files']},{ic:'rotate',t:['Restore','Restore']},
      {ic:'download',t:['Download','Download']},{ic:'clock',t:['Schedule','Schedule']}
    ]},
    security:{ note:['אכיפת אבטחה אמיתית (Firewall, 2FA, rate-limit) חייבת לרוץ בשרת — כאן ה-UI וה-seam.','Real enforcement (firewall, 2FA, rate-limit) must run server-side — here is the UI & seam.'], feats:[
      {ic:'shield',t:['Firewall & IP / Country Block','Firewall & IP / Country Block']},{ic:'ghost',t:['VPN / Proxy detection','VPN / Proxy detection']},
      {ic:'lock',t:['2FA & Captcha','2FA & Captcha']},{ic:'user',t:['Sessions & Device Trust','Sessions & Device Trust']}
    ]},
    abuse:{ feats:[
      {ic:'alert',t:['Spam / Malware','Spam / Malware']},{ic:'file',t:['Copyright / DMCA','Copyright / DMCA']},
      {ic:'ban',t:['תוכן לא חוקי','Illegal content']},{ic:'listChecks',t:['תור טיפול','Moderation queue']}
    ]},
    localization:{ feats:[
      {ic:'globe',t:['שפות ותרגומים','Languages & translations']},{ic:'dollar',t:['מטבעות','Currencies']},
      {ic:'clock',t:['Timezones','Timezones']},{ic:'flag',t:['RTL / LTR','RTL / LTR']}
    ]}
  };
  Object.keys(MODULES).forEach(function(id){
    var spec=MODULES[id];
    reg(id, function(page){ page.innerHTML = U.moduleScaffold(id, spec.feats, spec.note?T(spec.note[0],spec.note[1]):null); });
  });

})();
