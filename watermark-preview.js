/* ============================================================================
 * KOLKLI — preview watermarking (shared, client-side).
 *
 * Powers "protect the preview with a watermark" on the review / approval flow:
 *   - review.html bakes a watermarked *preview* copy of each uploaded file at
 *     creation time and stores it alongside the untouched original.
 *   - proof.html (the client link) serves the watermarked preview and, for
 *     video, paints a live overlay over the player.
 *
 * The original file is never modified — every function here returns a NEW blob
 * (image / audio) or a DOM/canvas layer (video / live preview), leaving the
 * source bytes alone. That is the whole contract: previews are protected, the
 * master deliverable the owner keeps stays clean.
 *
 * Settings shape (persisted on project.watermark):
 *   { on:bool,
 *     visual:{ on, type:'text'|'logo', text, color, size, logoScale, logo,
 *              opacity, position, tile, rotation },      // images + video
 *     audio :{ on, interval, random, volume, freq, beepMs, placement } }      // audio
 * ==========================================================================*/
(function () {
  'use strict';
  var WM = {};

  // ---------- defaults ----------
  WM.defaults = function () {
    return {
      on: false,
      visual: { on: true, type: 'text', text: 'PREVIEW', color: '#ffffff',
                size: 6, logoScale: 22, logo: '', opacity: 45, position: 'br',
                tile: false, rotation: 0 },
      audio:  { on: true, interval: 15, random: false, volume: 30, freq: 880,
                beepMs: 900, placement: 'throughout' }
    };
  };

  // What treatment (if any) a given file kind gets. Images + audio are BAKED
  // (download-proof); video is an OVERLAY drawn over the player at view time.
  WM.appliesTo = function (kind, wm) {
    if (!wm || !wm.on) return null;
    if ((kind === 'image') && wm.visual && wm.visual.on) return 'bake-image';
    if ((kind === 'audio') && wm.audio && wm.audio.on) return 'bake-audio';
    if ((kind === 'video') && wm.visual && wm.visual.on) return 'overlay-video';
    return null;
  };
  WM.hasVisualContent = function (v) {
    if (!v) return false;
    return v.type === 'logo' ? !!v.logo : !!(v.text && v.text.trim());
  };

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // =====================================================================
  //  VISUAL  (shared canvas drawing — ported from watermark.html)
  // =====================================================================
  var ALIGN = { tl:['l','t'], tc:['c','t'], tr:['r','t'], ml:['l','m'], mc:['c','m'], mr:['r','m'], bl:['l','b'], bc:['c','b'], br:['r','b'] };
  function place(w, h, pos, W, H, m) {
    var a = ALIGN[pos] || ALIGN.br, x, y;
    if (a[0] === 'l') x = m; else if (a[0] === 'c') x = (W - w) / 2; else x = W - w - m;
    if (a[1] === 't') y = m; else if (a[1] === 'm') y = (H - h) / 2; else y = H - h - m;
    return { x: x, y: y };
  }
  function drawUnit(ctx, o, u) {
    if (o.type === 'text') {
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(0,0,0,0.30)'; ctx.lineWidth = Math.max(1, u.font * 0.06);
      ctx.strokeText(o.text, 0, 0);
      ctx.fillStyle = o.color || '#ffffff';
      ctx.fillText(o.text, 0, 0);
    } else if (u.logo) {
      ctx.drawImage(u.logo, -u.w / 2, -u.h / 2, u.w, u.h);
    }
  }
  function unitOf(ctx, o, W, H, logo) {
    var min = Math.min(W, H);
    if (o.type === 'text') {
      var font = Math.max(8, min * (o.size || 6) / 100);
      ctx.font = font + "px 'Space Grotesk','Rubik',system-ui,'Segoe UI',sans-serif";
      var m = ctx.measureText(o.text || '');
      var w = Math.max(1, m.width);
      var asc = (m.actualBoundingBoxAscent || font * 0.72), desc = (m.actualBoundingBoxDescent || font * 0.28);
      return { font: font, w: w, h: Math.max(1, asc + desc) };
    }
    if (logo) {
      var lw = Math.max(1, W * (o.logoScale || 22) / 100);
      var lh = Math.max(1, lw * (logo.height / logo.width));
      return { logo: logo, w: lw, h: lh };
    }
    return { w: 0, h: 0 };
  }
  // Paint the watermark onto ctx (media already drawn, or transparent for overlay).
  WM.stamp = function (ctx, o, W, H, logo) {
    var hasContent = o.type === 'text' ? !!(o.text && o.text.trim()) : !!logo;
    if (!hasContent) return;
    var u = unitOf(ctx, o, W, H, logo);
    if (!u.w) return;
    ctx.save();
    ctx.globalAlpha = clamp((o.opacity == null ? 45 : o.opacity) / 100, 0, 1);
    ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = Math.max(1, Math.min(W, H) * 0.004);
    var margin = Math.round(Math.min(W, H) * 0.035);
    var rot = (o.rotation || 0) * Math.PI / 180;
    if (o.tile) {
      ctx.translate(W / 2, H / 2);
      ctx.rotate(rot || (-24 * Math.PI / 180));
      var gapX = u.w * 0.55, gapY = u.h * 2.2, stepX = u.w + gapX, stepY = u.h + gapY;
      var diag = Math.sqrt(W * W + H * H);
      for (var y = -diag / 2; y <= diag / 2; y += stepY) {
        for (var x = -diag / 2; x <= diag / 2; x += stepX) {
          ctx.save(); ctx.translate(x, y); drawUnit(ctx, o, u); ctx.restore();
        }
      }
    } else {
      var p = place(u.w, u.h, o.position, W, H, margin);
      ctx.translate(p.x + u.w / 2, p.y + u.h / 2);
      if (rot) ctx.rotate(rot);
      drawUnit(ctx, o, u);
    }
    ctx.restore();
  };

  // Draw source bitmap into a canvas at W×H (maxW caps the long edge) and stamp.
  WM.composeCanvas = function (src, o, maxW, logo) {
    var natW = src.width || src.naturalWidth, natH = src.height || src.naturalHeight;
    var W = natW, H = natH;
    if (maxW && Math.max(W, H) > maxW) { var s = maxW / Math.max(W, H); W = Math.round(W * s); H = Math.round(H * s); }
    var canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, W, H);
    WM.stamp(ctx, o, W, H, logo);
    return canvas;
  };

  // Transparent watermark-only layer at W×H (for video overlay <img>).
  WM.layerDataURL = function (o, W, H, logo) {
    var canvas = document.createElement('canvas');
    canvas.width = Math.max(1, W); canvas.height = Math.max(1, H);
    WM.stamp(canvas.getContext('2d'), o, canvas.width, canvas.height, logo);
    return canvas.toDataURL('image/png');
  };

  // ---------- decoders ----------
  WM.loadBitmap = function (blob) {
    if (window.createImageBitmap) {
      return createImageBitmap(blob).catch(function () { return loadViaImg(blob); });
    }
    return loadViaImg(blob);
  };
  function loadViaImg(blob) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(blob), img = new Image();
      img.onload = function () { setTimeout(function () { URL.revokeObjectURL(url); }, 0); res(img); };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('image decode failed')); };
      img.src = url;
    });
  }
  WM.loadLogo = function (dataURL) {
    return new Promise(function (res, rej) {
      if (!dataURL) { rej(new Error('no logo')); return; }
      var img = new Image();
      img.onload = function () { res(img); };
      img.onerror = function () { rej(new Error('logo decode failed')); };
      img.src = dataURL;
    });
  };

  // ---------- image bake ----------
  var IMG_KEEP = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
  // Returns { blob, ext } for the watermarked preview, or null if it can't be built.
  WM.bakeImage = function (fileOrBlob, visual, ext) {
    return (async function () {
      var logo = null;
      if (visual.type === 'logo') {
        try { logo = await WM.loadLogo(visual.logo); } catch (_) { return null; }
      }
      if (!WM.hasVisualContent(visual)) return null;
      var src;
      try { src = await WM.loadBitmap(fileOrBlob); } catch (_) { return null; }
      var canvas = WM.composeCanvas(src, visual, 0, logo);
      if (src.close) src.close();
      var type = IMG_KEEP[(ext || '').toLowerCase()] || (fileOrBlob.type && IMG_KEEP[fileOrBlob.type.split('/')[1]]) || 'image/jpeg';
      if (type === 'image/gif' || !type) type = 'image/png';
      var q = type === 'image/png' ? undefined : 0.9;
      var blob = await new Promise(function (r) { canvas.toBlob(r, type, q); });
      if (!blob) return null;
      var outExt = type === 'image/jpeg' ? 'jpg' : type === 'image/webp' ? 'webp' : 'png';
      return { blob: blob, ext: outExt, type: type };
    })();
  };

  // =====================================================================
  //  AUDIO  (bake short "beep" markers into a WAV preview)
  // =====================================================================
  function beepTimes(o, dur) {
    var interval = Math.max(2, +o.interval || 15);
    var placement = o.placement || 'throughout';
    var lo = 0, hi = dur;
    if (placement === 'start')  { lo = 0;            hi = Math.min(dur, Math.max(interval * 1.5, dur * 0.25)); }
    else if (placement === 'middle') { lo = dur * 0.375; hi = dur * 0.625; }
    else if (placement === 'end')    { lo = Math.max(0, dur - Math.max(interval * 1.5, dur * 0.25)); hi = dur; }
    var times = [], t;
    if (o.random) {
      t = lo + interval * 0.5;
      while (t < hi) { times.push(t); t += interval * (0.5 + Math.random()); }
    } else {
      var first = placement === 'throughout' ? interval : lo + interval * 0.5;
      for (t = (placement === 'throughout' ? first : first); t < hi; t += interval) times.push(t);
    }
    if (!times.length && dur > 0.6) times.push(Math.min(lo + 0.25, dur - 0.4));
    return times;
  }

  function encodeWav(buf) {
    var ch = buf.numberOfChannels, len = buf.length, sr = buf.sampleRate;
    var data = new DataView(new ArrayBuffer(44 + len * ch * 2));
    var p = 0;
    function s(str) { for (var i = 0; i < str.length; i++) data.setUint8(p++, str.charCodeAt(i)); }
    function u32(v) { data.setUint32(p, v, true); p += 4; }
    function u16(v) { data.setUint16(p, v, true); p += 2; }
    s('RIFF'); u32(36 + len * ch * 2); s('WAVE'); s('fmt '); u32(16); u16(1); u16(ch);
    u32(sr); u32(sr * ch * 2); u16(ch * 2); u16(16); s('data'); u32(len * ch * 2);
    var chans = [];
    for (var c = 0; c < ch; c++) chans.push(buf.getChannelData(c));
    for (var i = 0; i < len; i++) {
      for (var cc = 0; cc < ch; cc++) {
        var v = Math.max(-1, Math.min(1, chans[cc][i]));
        data.setInt16(p, v < 0 ? v * 0x8000 : v * 0x7FFF, true); p += 2;
      }
    }
    return new Blob([data.buffer], { type: 'audio/wav' });
  }

  // Returns { blob, ext:'wav' } or null if the audio can't be decoded here.
  WM.bakeAudio = function (fileOrBlob, o) {
    return (async function () {
      var OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!OAC || !AC) return null;
      var arr;
      try { arr = await fileOrBlob.arrayBuffer(); } catch (_) { return null; }
      var dec = new AC(), audio;
      try { audio = await dec.decodeAudioData(arr.slice(0)); }
      catch (_) { try { dec.close(); } catch (e) {} return null; }
      try { dec.close(); } catch (e) {}

      var sr = audio.sampleRate, ch = audio.numberOfChannels, len = audio.length, dur = audio.duration;
      var off = new OAC(ch, len, sr);
      var src = off.createBufferSource(); src.buffer = audio; src.connect(off.destination); src.start(0);

      var vol = clamp((o.volume == null ? 30 : o.volume) / 100, 0, 1) * 0.9;
      var beepDur = clamp((o.beepMs || 900) / 1000, 0.15, 3);
      beepTimes(o, dur).forEach(function (tStart) {
        if (tStart >= dur) return;
        var tEnd = Math.min(tStart + beepDur, dur - 0.01);
        if (tEnd <= tStart) return;
        var osc = off.createOscillator(); osc.type = 'sine'; osc.frequency.value = o.freq || 880;
        var g = off.createGain();
        g.gain.setValueAtTime(0.0001, tStart);
        g.gain.exponentialRampToValueAtTime(vol, tStart + 0.02);
        g.gain.setValueAtTime(vol, Math.max(tStart + 0.03, tEnd - 0.05));
        g.gain.exponentialRampToValueAtTime(0.0001, tEnd);
        osc.connect(g); g.connect(off.destination);
        osc.start(tStart); osc.stop(tEnd + 0.02);
      });
      var out;
      try { out = await off.startRendering(); } catch (_) { return null; }
      return { blob: encodeWav(out), ext: 'wav', type: 'audio/wav' };
    })();
  };

  // =====================================================================
  //  Small helpers for the UI / summaries
  // =====================================================================
  WM.summaryChips = function (wm, lang, kinds) {
    var he = lang === 'he';
    var out = [];
    if (!wm || !wm.on) return out;
    var hasImg = kinds ? kinds.indexOf('image') >= 0 : true;
    var hasVid = kinds ? kinds.indexOf('video') >= 0 : true;
    var hasAud = kinds ? kinds.indexOf('audio') >= 0 : true;
    if (wm.visual && wm.visual.on && (hasImg || hasVid)) {
      out.push(he ? 'סימן מים חזותי' : 'Visual watermark');
    }
    if (wm.audio && wm.audio.on && hasAud) {
      out.push(he ? 'סימן מים קולי' : 'Audio watermark');
    }
    return out;
  };

  window.KolkliWatermark = WM;
})();
