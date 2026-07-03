
(function(){
  const el = id => document.getElementById(id);

  const I18N = {
    he:{
      dir:'rtl', langIco:'EN',
      kick:'וידאו · MP4 ל-MP3',
      pageTitle:'חלצו את פס הקול מווידאו ל-MP3',
      pageSub:'גררו קובצי וידאו, בחרו פורמט ואיכות, וקבלו קובץ אודיו מוכן להורדה. הכול מתבצע בדפדפן שלכם — שום קובץ לא עוזב את המחשב.',
      dropBig:'גררו קובצי וידאו לכאן', or2:'או', choose:'בחרו קבצים',
      sizeNote:'MP4 · MKV · MOV · WEBM · AVI · M4V', remove:'הסרה',
      totalLbl:'סה״כ', optTitle:'הגדרות המרה',
      fmtLbl:'פורמט יעד',
      bitrateLbl:'קצב סיביות (איכות)', chanLbl:'ערוצים',
      keepOrig:'כמו המקור', stereo:'סטריאו', mono:'מונו',
      convBtn:'חלצו אודיו', working:'מחלץ…',
      rtNote:'החילוץ מהיר — הדפדפן מפענח את פס הקול והוא מקודד ל-MP3 במלואו אצלכם, בלי שרת.',
      readyTitle:'החילוץ הושלם!', readySub:n=>`${n} ${n===1?'קובץ מוכן':'קבצים מוכנים'} להורדה.`,
      dlAll:'הורדת הכול', againBtn:'המרה נוספת',
      download:'הורדה', origLbl:'מקור',
      failed:'החילוץ נכשל — ייתכן שאין פס קול בקובץ',
      seam:'הכול רץ מקומית בדפדפן — הקבצים אף פעם לא נשלחים לשרת. הדפדפן מפענח את פס הקול דרך מנוע ה-Web Audio, וקידוד ה-MP3 נעשה כאן עם lamejs, ישירות אצלכם.',
      foot:'KOLKLI · MP4 ל-MP3 · פרטי ומהיר, ישירות בדפדפן',
      errNoFiles:'צריך לצרף לפחות קובץ וידאו אחד', errDecode:'לא הצלחנו לחלץ אודיו מאף קובץ',
      errLib:'ספריית קידוד ה-MP3 לא נטענה. בדקו את החיבור ורעננו, או בחרו פורמט WAV.',
      copied:'הקישור הועתק ✓',
    },
    en:{
      dir:'ltr', langIco:'עב',
      kick:'Video · MP4 to MP3',
      pageTitle:'Extract audio from video to MP3',
      pageSub:'Drop video files, pick a format and quality, and get a ready-to-download audio file. Everything runs in your browser — nothing leaves your machine.',
      dropBig:'Drag video files here', or2:'or', choose:'Choose files',
      sizeNote:'MP4 · MKV · MOV · WEBM · AVI · M4V', remove:'Remove',
      totalLbl:'Total', optTitle:'Convert options',
      fmtLbl:'Target format',
      bitrateLbl:'Bitrate (quality)', chanLbl:'Channels',
      keepOrig:'Keep original', stereo:'Stereo', mono:'Mono',
      convBtn:'Extract audio', working:'Extracting…',
      rtNote:'Extraction is fast — your browser decodes the audio track and encodes it to MP3 entirely on your machine, no server.',
      readyTitle:'Extraction done!', readySub:n=>`${n} ${n===1?'file':'files'} ready to download.`,
      dlAll:'Download all', againBtn:'Convert more',
      download:'Download', origLbl:'source',
      failed:'Extraction failed — the file may have no audio track',
      seam:'Everything runs locally in your browser — files are never uploaded. The audio track is decoded by the built-in Web Audio engine, and MP3 encoding is handled by lamejs, right on your machine.',
      foot:'KOLKLI · MP4 to MP3 · Private and fast, right in your browser',
      errNoFiles:'Add at least one video file', errDecode:'We could not extract audio from any file',
      errLib:'The MP3 encoder failed to load. Check your connection and refresh, or pick the WAV format.',
      copied:'Link copied ✓',
    },
  };

  // target formats — MP3 (lamejs) and WAV (native) are encoded client-side;
  // the AAC/OGG containers arrive with the server engine.
  const FORMATS = [
    { id:'mp3', label:'MP3', ext:'mp3', sub:'popular',  ready:true  },
    { id:'wav', label:'WAV', ext:'wav', sub:'lossless', ready:true  },
    { id:'m4a', label:'M4A', ext:'m4a', sub:'AAC',      ready:false },
    { id:'ogg', label:'OGG', ext:'ogg', sub:'vorbis',   ready:false },
  ];

  const ICON = {
    film:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M7 3v18M17 3v18M2 9h5M2 15h5M17 9h5M17 15h5"/></svg>',
    music:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
    trash:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
    warn:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M12 17h.01"/><circle cx="12" cy="12" r="10"/></svg>',
    dl:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  };

  let lang='he', t=I18N.he;
  let files=[];        // {id,file,name,size,url,thumb,dur,w,h}
  let fmt=(FORMATS.find(f=>f.ready)||FORMATS[0]).id;
  let uid=1, running=false;
  let results=[];      // {name, blob, url, size, srcSize, seconds, kbps, channels, fmtId, thumb, ok}

  function baseName(name){ return String(name||'audio').replace(/\.[^.\/\\]+$/,'') || 'audio'; }
  function fmtBytes(n){ if(n==null) return '—'; if(n>=1073741824) return (n/1073741824).toFixed(2)+' GB'; if(n>=1048576) return (n/1048576).toFixed(1)+' MB'; if(n>=1024) return (n/1024).toFixed(0)+' KB'; return n+' B'; }
  function mmss(s){ if(!s||!isFinite(s)) return '—'; s=Math.round(s); const m=Math.floor(s/60); return m+':'+String(s%60).padStart(2,'0'); }
  function escapeHtml(s){ return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function totalBytes(){ return files.reduce((a,f)=>a+f.size,0); }
  function toast(msg){ const e=el('toast'); e.textContent=msg; e.classList.add('show'); clearTimeout(e._t); e._t=setTimeout(()=>e.classList.remove('show'),1800); }
  const sleep = ms => new Promise(r=>setTimeout(r,ms));

  // ---- format picker ----
  function renderFmts(){
    el('fmts').innerHTML = FORMATS.map(f=>`
      <button type="button" class="fmt ${f.id===fmt?'on':''} ${f.ready?'':'soon'}" data-fmt="${f.id}" ${f.ready?'':'disabled'}>
        ${f.ready?'':`<span class="tag">${lang==='he'?'בקרוב':'soon'}</span>`}
        <b>${f.label}</b><small>${f.sub}</small>
      </button>`).join('');
    // bitrate only matters for MP3 — WAV is lossless PCM
    el('bitrateOpt').classList.toggle('dim', fmt!=='mp3');
  }

  // ---- intake ----
  function addFiles(list){
    Array.from(list||[]).forEach(file=>{
      if(file.type && file.type.indexOf('video')!==0 && !/\.(mp4|webm|mkv|mov|avi|m4v|ogv|3gp|wmv|flv)$/i.test(file.name)) return;
      const item={ id:'f'+(uid++), file, name:file.name, size:file.size, url:URL.createObjectURL(file), thumb:null, dur:0, w:0, h:0 };
      files.push(item);
      makeThumb(item);
    });
    renderFiles();
  }
  function removeFile(id){
    const f=files.find(x=>x.id===id); if(f&&f.url) URL.revokeObjectURL(f.url);
    files=files.filter(x=>x.id!==id); renderFiles();
  }

  // grab a poster frame + duration for a nicer file row
  async function makeThumb(item){
    try{
      const v=document.createElement('video');
      v.src=item.url; v.muted=true; v.playsInline=true; v.preload='metadata';
      await new Promise((res,rej)=>{ v.onloadedmetadata=()=>res(); v.onerror=()=>rej(); });
      item.dur=v.duration; item.w=v.videoWidth; item.h=v.videoHeight;
      renderFiles();
      const seekTo=Math.min(1, (isFinite(v.duration)?v.duration:2)*0.1);
      await new Promise((res)=>{ v.onseeked=()=>res(); try{ v.currentTime=isFinite(seekTo)?seekTo:0; }catch(_){ res(); } });
      const w=112, h=Math.max(2,Math.round(w*((v.videoHeight||9)/(v.videoWidth||16))));
      const c=document.createElement('canvas'); c.width=w; c.height=h;
      c.getContext('2d').drawImage(v,0,0,w,h);
      item.thumb=c.toDataURL('image/jpeg',0.7);
      renderFiles();
    }catch(_){ /* audio-only / no poster: fall back to film icon */ }
  }

  function renderFiles(){
    const card=el('filesCard'), list=el('flist');
    card.style.display = files.length? '' : 'none';
    list.innerHTML = files.map(f=>{
      const meta = [fmtBytes(f.size), f.dur?mmss(f.dur):''].filter(Boolean).join('  ·  ');
      const ico = f.thumb? `<img src="${f.thumb}" alt="">` : ICON.film;
      return `<div class="frow">
        <span class="fico">${ico}</span>
        <span class="fn"><div class="nm" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</div><div class="sz">${meta}</div></span>
        <button class="rm" data-rm="${f.id}" title="${escapeHtml(t.remove)}">${ICON.trash}</button>
      </div>`;
    }).join('');
    el('totalVal').textContent = fmtBytes(totalBytes());
    el('convBtn').disabled = files.length===0;
  }

  // ---- decode the audio track via Web Audio ----
  let sharedCtx=null;
  function getCtx(){
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC) return null;
    if(!sharedCtx) sharedCtx=new AC();
    return sharedCtx;
  }
  async function decodeAudio(file){
    const ctx=getCtx(); if(!ctx) throw new Error('noaudio');
    const ab=await file.arrayBuffer();
    return await new Promise((res,rej)=>{
      // promise form + legacy callback form (older Safari)
      try{ const p=ctx.decodeAudioData(ab, res, rej); if(p && p.then) p.then(res,rej); }
      catch(e){ rej(e); }
    });
  }

  // pick / downmix a channel to the requested output layout
  function getChannel(buf, ch, outCh){
    if(outCh===1 && buf.numberOfChannels>1){
      const L=buf.getChannelData(0), R=buf.getChannelData(1), out=new Float32Array(L.length);
      for(let i=0;i<L.length;i++) out[i]=(L[i]+R[i])*0.5;
      return out;
    }
    return buf.getChannelData(Math.min(ch, buf.numberOfChannels-1));
  }
  function floatToInt16(f32){
    const out=new Int16Array(f32.length);
    for(let i=0;i<f32.length;i++){ let s=f32[i]; s=s<-1?-1:s>1?1:s; out[i]=s<0?s*0x8000:s*0x7FFF; }
    return out;
  }

  // ---- MP3 encode (lamejs) ----
  async function encodeMp3(buf, kbps, outCh, onProg){
    if(typeof lamejs==='undefined' || !lamejs.Mp3Encoder) throw new Error('lib');
    const enc=new lamejs.Mp3Encoder(outCh, buf.sampleRate, kbps);
    const left=floatToInt16(getChannel(buf,0,outCh));
    const right=outCh>1 ? floatToInt16(getChannel(buf,1,outCh)) : null;
    const block=1152, total=left.length, data=[];
    for(let i=0;i<total;i+=block){
      const l=left.subarray(i,i+block);
      const chunk = outCh>1 ? enc.encodeBuffer(l, right.subarray(i,i+block)) : enc.encodeBuffer(l);
      if(chunk.length) data.push(new Int8Array(chunk));
      if((i/block)%48===0){ if(onProg) onProg(i/total); await sleep(0); }
    }
    const end=enc.flush(); if(end.length) data.push(new Int8Array(end));
    if(onProg) onProg(1);
    return new Blob(data,{type:'audio/mpeg'});
  }

  // ---- WAV encode (16-bit PCM, native) ----
  function encodeWav(buf, outCh){
    const rate=buf.sampleRate, frames=buf.length;
    const c0=getChannel(buf,0,outCh), c1=outCh>1?getChannel(buf,1,outCh):null;
    const blockAlign=outCh*2, dataSize=frames*blockAlign;
    const ab=new ArrayBuffer(44+dataSize), view=new DataView(ab);
    const wr=(off,s)=>{ for(let i=0;i<s.length;i++) view.setUint8(off+i,s.charCodeAt(i)); };
    const clamp=v=>{ v=v<-1?-1:v>1?1:v; return v<0?v*0x8000:v*0x7FFF; };
    wr(0,'RIFF'); view.setUint32(4,36+dataSize,true); wr(8,'WAVE');
    wr(12,'fmt '); view.setUint32(16,16,true); view.setUint16(20,1,true);
    view.setUint16(22,outCh,true); view.setUint32(24,rate,true);
    view.setUint32(28,rate*blockAlign,true); view.setUint16(32,blockAlign,true);
    view.setUint16(34,16,true); wr(36,'data'); view.setUint32(40,dataSize,true);
    let off=44;
    for(let i=0;i<frames;i++){
      view.setInt16(off,clamp(c0[i]),true); off+=2;
      if(outCh>1){ view.setInt16(off,clamp(c1[i]),true); off+=2; }
    }
    return new Blob([ab],{type:'audio/wav'});
  }

  // ---- convert one file ----
  async function convertOne(item, opts, onProg){
    const buf=await decodeAudio(item.file);
    if(!buf || !buf.length) throw new Error('noaudio');
    const outCh = opts.channels ? Math.min(opts.channels,2) : Math.min(2, buf.numberOfChannels);
    let blob;
    if(opts.fmt==='wav'){ blob=encodeWav(buf, outCh); if(onProg) onProg(1); }
    else { blob=await encodeMp3(buf, opts.kbps, outCh, onProg); }
    if(!blob || !blob.size) throw new Error('empty');
    return { blob, seconds:buf.duration, channels:outCh };
  }

  // ---- run ----
  async function runConvert(){
    if(running) return;
    el('optErr').textContent='';
    if(!files.length){ el('optErr').textContent=t.errNoFiles; return; }
    const spec = FORMATS.find(f=>f.id===fmt);
    if(fmt==='mp3' && (typeof lamejs==='undefined' || !lamejs.Mp3Encoder)){ el('optErr').textContent=t.errLib; return; }

    const opts = { fmt, kbps:+el('bitrate').value||192, channels:+el('channels').value||0 };

    running=true;
    el('composer').style.display='none';
    el('resultsCard').classList.remove('show');
    clearResults();
    const prog=el('progCard'); prog.classList.add('show');

    results=[];
    for(let i=0;i<files.length;i++){
      const it=files[i];
      el('progName').textContent = `${it.name}  ·  ${i+1}/${files.length}`;
      setProg(Math.round(i/files.length*100));
      await sleep(30);
      try{
        const r = await convertOne(it, opts, p=>setProg(Math.round((i+p)/files.length*100)));
        results.push({ name: baseName(it.name)+'.'+spec.ext, blob:r.blob, url:URL.createObjectURL(r.blob),
                       size:r.blob.size, srcSize:it.size, seconds:r.seconds, kbps:opts.kbps, channels:r.channels,
                       fmtId:fmt, thumb:it.thumb, ok:true });
      }catch(err){
        console.error(err);
        results.push({ name: baseName(it.name)+'.'+spec.ext, blob:null, url:null, size:0, srcSize:it.size, thumb:it.thumb, ok:false });
      }
      setProg(Math.round((i+1)/files.length*100));
    }
    await sleep(180);
    prog.classList.remove('show');
    running=false;

    if(!results.some(r=>r.ok)){ el('optErr').textContent=t.errDecode; el('composer').style.display=''; return; }
    showResults();
  }
  function setProg(p){ el('progBar').style.width=p+'%'; el('progPct').textContent=p+'%'; }

  function showResults(){
    const okCount=results.filter(r=>r.ok).length;
    el('readySub').textContent = t.readySub(okCount);
    el('rlist').innerHTML = results.map((r,i)=>{
      if(!r.ok){
        return `<div class="rrow err"><span class="rico">${ICON.warn}</span>
          <span class="rn"><div class="nm" title="${escapeHtml(r.name)}">${escapeHtml(r.name)}</div><div class="meta">${escapeHtml(t.failed)}</div></span></div>`;
      }
      const bits = [
        `${t.origLbl} ${fmtBytes(r.srcSize)} → <em>${fmtBytes(r.size)}</em>`,
        mmss(r.seconds),
        r.fmtId==='mp3' ? r.kbps+' kbps' : 'WAV',
        r.channels===1 ? 'mono' : 'stereo',
      ].join(' · ');
      return `<div class="rrow"><span class="rico">${ICON.music}</span>
        <span class="rn">
          <div class="nm" title="${escapeHtml(r.name)}">${escapeHtml(r.name)}</div>
          <div class="meta">${bits}</div>
          <audio class="rplay" controls preload="none" src="${r.url}"></audio>
        </span>
        <button class="dlbtn" data-dl="${i}">${ICON.dl}<span>${escapeHtml(t.download)}</span></button></div>`;
    }).join('');
    el('resultsCard').classList.add('show');
    el('resultsCard').scrollIntoView({behavior:'smooth',block:'center'});
  }

  function download(r){
    if(!r||!r.url) return;
    const a=document.createElement('a'); a.href=r.url; a.download=r.name; document.body.appendChild(a); a.click(); a.remove();
  }
  async function downloadAll(){
    for(const r of results){ if(r.ok){ download(r); await sleep(280); } }
  }

  function clearResults(){ results.forEach(r=>{ if(r.url) URL.revokeObjectURL(r.url); }); results=[]; }
  function reset(){
    clearResults();
    files.forEach(f=>{ if(f.url) URL.revokeObjectURL(f.url); });
    files=[];
    el('resultsCard').classList.remove('show');
    el('optErr').textContent='';
    el('composer').style.display=''; renderFiles();
    window.scrollTo({top:0,behavior:'smooth'});
  }

  // ---- i18n + theme (mirrors the other pages; header stays in sync via its observer) ----
  function applyLang(l){
    lang=l; t=I18N[l];
    document.documentElement.lang=l; document.documentElement.dir=t.dir;
    document.querySelectorAll('[data-i18n]').forEach(n=>{ const k=n.getAttribute('data-i18n'); if(typeof t[k]==='string') n.textContent=t[k]; });
    const li=el('langIco'); if(li) li.textContent=t.langIco;
    try{ localStorage.setItem('ac_lang', l); }catch(_){}
    renderFmts(); renderFiles();
    if(el('resultsCard').classList.contains('show')) showResults();
  }
  function ls(k){ try{ return localStorage.getItem(k); }catch(_){ return null; } }
  function detectLang(){
    const chosen=ls('ac_lang'); if(chosen) return chosen;
    const cc=ls('ac_country'); if(cc) return cc==='IL'?'he':'en';
    let tz=''; try{ tz=Intl.DateTimeFormat().resolvedOptions().timeZone; }catch(_){}
    const navHe=(navigator.language||'').toLowerCase().indexOf('he')===0;
    return (tz==='Asia/Jerusalem'||navHe)?'he':'en';
  }
  function applyTheme(th){
    const dark=(th==='dark');
    document.documentElement.setAttribute('data-theme', dark?'dark':'light');
    const ti=el('themeIco'); if(ti) ti.textContent = dark?'☀️':'🌙';
    try{ localStorage.setItem('theme', dark?'dark':'light'); }catch(_){}
  }

  // ---- events ----
  const drop=el('drop'), input=el('fileInput');
  el('chooseBtn').addEventListener('click',e=>{ e.stopPropagation(); input.click(); });
  drop.addEventListener('click',()=>input.click());
  input.addEventListener('change',()=>{ addFiles(input.files); input.value=''; });
  ;['dragenter','dragover'].forEach(ev=>drop.addEventListener(ev,e=>{ e.preventDefault(); drop.classList.add('over'); }));
  ;['dragleave','dragend'].forEach(ev=>drop.addEventListener(ev,()=>drop.classList.remove('over')));
  drop.addEventListener('drop',e=>{ e.preventDefault(); drop.classList.remove('over'); if(e.dataTransfer) addFiles(e.dataTransfer.files); });
  document.addEventListener('dragover',e=>{ if(e.dataTransfer && Array.from(e.dataTransfer.types||[]).includes('Files')) e.preventDefault(); });
  document.addEventListener('drop',e=>{ if(e.target!==drop && e.dataTransfer && Array.from(e.dataTransfer.types||[]).includes('Files')) e.preventDefault(); });

  el('flist').addEventListener('click',e=>{ const b=e.target.closest('[data-rm]'); if(b) removeFile(b.getAttribute('data-rm')); });
  el('fmts').addEventListener('click',e=>{ const b=e.target.closest('[data-fmt]'); if(b && !b.disabled){ fmt=b.getAttribute('data-fmt'); renderFmts(); } });
  el('rlist').addEventListener('click',e=>{ const b=e.target.closest('[data-dl]'); if(b) download(results[+b.getAttribute('data-dl')]); });

  el('convBtn').addEventListener('click',runConvert);
  el('dlAllBtn').addEventListener('click',downloadAll);
  el('againBtn').addEventListener('click',reset);

  el('langBtn').addEventListener('click',()=>applyLang(lang==='he'?'en':'he'));
  el('themeToggle').addEventListener('click',()=>applyTheme(document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark'));

  // ---- init ----
  applyTheme(ls('theme')||'light');
  applyLang(detectLang());
  renderFmts(); renderFiles();
})();
