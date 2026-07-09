/* ============================================================
   Site-wide success chime (KOLKLI) — one unified notification
   sound, played automatically when an operation completes
   successfully, on every page.

   Design goals / contract:
     - UNIFIED + SELF-CONTAINED: the exact same chime everywhere.
       It is SYNTHESISED with the Web Audio API, so there is no
       audio asset to load and NO network request — matching the
       site's self-contained, GDPR-clean ethos (see accessibility.js).
       header.js loads it (depth-aware) on every header page; the
       three standalone client pages (download / proof / select)
       include it with a plain <script>, exactly like accessibility.js.
     - ZERO PER-PAGE WIRING: instead of editing ~80 pages, it listens
       for the three "an operation succeeded" signals that already
       exist site-wide:
         1. a download  — an <a download> is clicked (file delivered),
         2. a copy      — clipboard.writeText / execCommand('copy'),
         3. a toast     — the shared #toast element gains `.show`
                          (confirmations such as "saved / sent / added").
       Overlapping signals from one action (e.g. a "Copied!" toast that
       fires right after the clipboard write) are COALESCED into a
       single chime.
     - SUCCESS ONLY: toasts are the site's generic feedback channel, so
       error/validation toasts are filtered out with a small he/en/ru
       lexicon and stay silent. Downloads and copies are inherently
       successful, so they always chime.
     - AUTOPLAY-SAFE: browsers suspend audio until a user gesture. The
       AudioContext is created lazily and resumed on the first pointer/
       key/touch; because every success follows a click, the chime is
       audible. Anything that would fire before that first gesture
       (e.g. a toast shown on load) is simply inaudible — never queued.
     - MUTEABLE: enabled by default (the site owner asked for it to play
       automatically), but the visitor can silence it. The preference
       lives in localStorage under a single key ("kolkli_sound") and is
       surfaced as a toggle in the accessibility panel. Public API on
       window.KolkliSound: success(), error(), play(name),
       enabled(), setEnabled(bool), toggle().
   ============================================================ */
(function () {
  'use strict';
  if (window.__kolkliSound) return;                 // guard against a double include
  window.__kolkliSound = true;

  var STORE = 'kolkli_sound';                        // '0' = muted, anything else = on
  var COALESCE_MS = 450;                             // one action → at most one chime

  // ---- mute preference (default: on) ----
  var muted = false;
  try { muted = (localStorage.getItem(STORE) === '0'); } catch (e) {}
  function persist() { try { localStorage.setItem(STORE, muted ? '0' : '1'); } catch (e) {} }

  // ============================================================
  //  Web Audio engine. Lazily created, resumed on first gesture.
  // ============================================================
  var AC = window.AudioContext || window.webkitAudioContext;
  var ctx = null;
  var unlocked = false;

  function ensureCtx() {
    if (!AC) return null;
    if (!ctx) { try { ctx = new AC(); } catch (e) { ctx = null; } }
    if (ctx && ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
    return ctx;
  }

  // The first real user gesture unlocks audio for the whole page.
  function unlock() {
    if (unlocked) return;
    unlocked = true;
    ensureCtx();
    ['pointerdown', 'keydown', 'touchstart', 'click'].forEach(function (ev) {
      document.removeEventListener(ev, unlock, true);
    });
  }
  ['pointerdown', 'keydown', 'touchstart', 'click'].forEach(function (ev) {
    document.addEventListener(ev, unlock, true);
  });

  // One shaped tone: sine with a soft attack + exponential decay so it
  // reads as a gentle "bell", never a click.
  function tone(freq, start, dur, peak) {
    var c = ctx;
    var osc = c.createOscillator();
    var g = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, start);
    var end = start + dur;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(peak, start + 0.012);   // quick soft attack
    g.gain.exponentialRampToValueAtTime(0.0001, end);           // decay to silence
    osc.connect(g).connect(c.destination);
    osc.start(start);
    osc.stop(end + 0.02);
  }

  // The unified success chime: a bright, short ascending three-note
  // arpeggio (~330ms). Kept quiet so it confirms without startling.
  function chimeSuccess() {
    var c = ensureCtx();
    if (!c || c.state !== 'running') return false;
    var t0 = c.currentTime + 0.001;
    tone(659.25, t0,        0.16, 0.13);   // E5
    tone(880.00, t0 + 0.09, 0.16, 0.13);   // A5
    tone(1318.5, t0 + 0.18, 0.22, 0.12);   // E6
    return true;
  }

  // A distinct, softer two-note descending tone. NOT played
  // automatically (the brief is success-only), but exposed on the API.
  function chimeError() {
    var c = ensureCtx();
    if (!c || c.state !== 'running') return false;
    var t0 = c.currentTime + 0.001;
    tone(311.13, t0,        0.16, 0.10);   // Eb4
    tone(233.08, t0 + 0.12, 0.24, 0.10);   // Bb3
    return true;
  }

  // ============================================================
  //  Coalesced public "play". Every auto-hook routes through here,
  //  so a single user action never chimes twice.
  // ============================================================
  var lastPlay = 0;
  function play(name) {
    if (muted) return;
    var now = Date.now();
    if (name !== 'error' && (now - lastPlay) < COALESCE_MS) return;   // dedupe successes
    if (!ensureCtx()) return;
    var ok = (name === 'error') ? chimeError() : chimeSuccess();
    if (ok) lastPlay = now;
  }

  // ============================================================
  //  Error/validation lexicon (he / en / ru). A toast whose text
  //  matches is treated as an error and stays silent. We bias toward
  //  SUCCESS on unknown text so real completions are never missed;
  //  the download/copy hooks chime independently anyway.
  // ============================================================
  var ERR_WORDS = [
    // English
    'error', 'fail', 'invalid', 'unable', 'unsupported', 'denied', 'wrong',
    'missing', 'empty', 'please ', 'required', 'must ', 'cannot', "can't",
    'too large', 'too big', 'too many', 'exceed', 'not supported', 'no file',
    'choose a', 'select a', 'try again',
    // Hebrew
    'שגיאה', 'נכשל', 'כשל', 'לא ניתן', 'לא נית', 'שגוי', 'חובה', 'אנא',
    'בחר', 'בחרו', 'ריק', 'גדול מדי', 'חריגה', 'לא נתמך', 'לא הצלח', 'נא ',
    'אין קוב', 'נסו שוב', 'נסה שוב',
    // Russian
    'ошибк', 'не удал', 'неверн', 'выбери', 'пожалуйста', 'обязательн',
    'слишком', 'не поддерж', 'пусто', 'превыш', 'нельзя', 'нет файл',
    'попробуйте'
  ];
  function looksLikeError(text) {
    if (!text) return false;
    var s = String(text).toLowerCase();
    for (var i = 0; i < ERR_WORDS.length; i++) {
      if (s.indexOf(ERR_WORDS[i]) !== -1) return true;
    }
    return false;
  }

  // ============================================================
  //  Hook 1 — downloads. Any <a download> click means a file was
  //  just delivered. Patch the prototype so it catches programmatic
  //  clicks whether or not the anchor is in the DOM.
  // ============================================================
  try {
    var proto = window.HTMLAnchorElement && HTMLAnchorElement.prototype;
    if (proto && proto.click) {
      var origClick = proto.click;
      proto.click = function () {
        var isDownload = false;
        try { isDownload = this.hasAttribute && this.hasAttribute('download'); } catch (e) {}
        var r = origClick.apply(this, arguments);
        if (isDownload) { try { play('success'); } catch (e) {} }
        return r;
      };
    }
  } catch (e) {}

  // ============================================================
  //  Hook 2 — clipboard copies (writeText / write and the legacy
  //  execCommand('copy'|'cut') fallback).
  // ============================================================
  try {
    var CB = window.Clipboard && Clipboard.prototype;
    if (CB) {
      ['writeText', 'write'].forEach(function (m) {
        if (typeof CB[m] !== 'function') return;
        var orig = CB[m];
        CB[m] = function () {
          var p = orig.apply(this, arguments);
          try { if (p && p.then) p.then(function () { play('success'); }, function () {}); } catch (e) {}
          return p;
        };
      });
    }
  } catch (e) {}
  try {
    var docProto = window.Document && Document.prototype;
    if (docProto && typeof docProto.execCommand === 'function') {
      var origExec = docProto.execCommand;
      docProto.execCommand = function (cmd) {
        var r = origExec.apply(this, arguments);
        try {
          var c = String(cmd || '').toLowerCase();
          if (r && (c === 'copy' || c === 'cut')) play('success');
        } catch (e) {}
        return r;
      };
    }
  } catch (e) {}

  // ============================================================
  //  Hook 3 — toasts. The shared feedback element gains `.show` when
  //  a confirmation appears. Observe its class; chime on show unless
  //  the text reads like an error. Covers save / send / add / done
  //  operations that neither download nor copy.
  // ============================================================
  var seen = (typeof WeakSet !== 'undefined') ? new WeakSet() : null;
  function watchToast(node) {
    if (!node || (seen && seen.has(node))) return;
    if (seen) seen.add(node);
    var wasShown = node.classList.contains('show');
    new MutationObserver(function () {
      var isShown = node.classList.contains('show');
      if (isShown && !wasShown) {                   // rising edge only
        if (!looksLikeError(node.textContent || '')) play('success');
      }
      wasShown = isShown;
    }).observe(node, { attributes: true, attributeFilter: ['class'] });
  }
  function hookToasts() {
    try {
      document.querySelectorAll('#toast, #selToast, .toast').forEach(watchToast);
    } catch (e) {}
  }

  // ============================================================
  //  Public API.
  // ============================================================
  window.KolkliSound = {
    success: function () { play('success'); },
    error: function () { play('error'); },
    play: play,
    enabled: function () { return !muted; },
    setEnabled: function (on) { muted = !on; persist(); },
    toggle: function () { muted = !muted; persist(); return !muted; }
  };

  // ============================================================
  //  Boot. The toast markup is static, so hook it once the DOM is
  //  ready (plus a late re-scan for any dynamically added toast).
  // ============================================================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { hookToasts(); setTimeout(hookToasts, 1500); }, { once: true });
  } else {
    hookToasts(); setTimeout(hookToasts, 1500);
  }
})();
