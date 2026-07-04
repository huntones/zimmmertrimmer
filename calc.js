/* ============================================================
   Shared init helper for the "Calculators & Converters" tool pages.
   Every one of those pages carries an inline I18N = {he,en,ru} and a
   render() for its computed bits. This helper wires the boilerplate
   that used to be copy-pasted into each tool page:
     - language: detect saved/browser language, set <html> lang/dir,
       fill [data-i18n] (textContent) + [data-i18n-ph] (placeholder),
       persist ac_lang, expose window.__setLang so the shared header's
       language picker re-renders the page in place.
     - theme: apply saved theme, wire #themeToggle, keep #themeIco.
   Usage from a page:
     KolkliTool.init(I18N, function(t, lang){  ...custom relabels... });
   Returns { lang(), t(), setLang(l) }.
   Load this AFTER header.js and BEFORE the page's inline <script>.
   ============================================================ */
(function () {
  function ls(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lset(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  function detectLang(I18N) {
    var chosen = ls('ac_lang'); if (chosen && I18N[chosen]) return chosen;
    var cc = ls('ac_country'); if (cc) return cc === 'IL' ? 'he' : 'en';
    var tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) {}
    var navHe = (navigator.language || '').toLowerCase().indexOf('he') === 0;
    return (tz === 'Asia/Jerusalem' || navHe) ? 'he' : 'en';
  }

  function init(I18N, onLang) {
    var lang, t;

    function applyLang(l, skipCb) {
      if (!I18N[l]) l = I18N.en ? 'en' : Object.keys(I18N)[0];
      lang = l; t = I18N[l];
      var html = document.documentElement;
      html.setAttribute('lang', l);
      html.setAttribute('dir', t.dir || (l === 'he' ? 'rtl' : 'ltr'));
      lset('ac_lang', l);
      document.querySelectorAll('[data-i18n]').forEach(function (n) {
        var k = n.getAttribute('data-i18n');
        if (typeof t[k] === 'string') n.textContent = t[k];
      });
      document.querySelectorAll('[data-i18n-ph]').forEach(function (n) {
        var k = n.getAttribute('data-i18n-ph');
        if (typeof t[k] === 'string') n.setAttribute('placeholder', t[k]);
      });
      document.querySelectorAll('[data-i18n-title]').forEach(function (n) {
        var k = n.getAttribute('data-i18n-title');
        if (typeof t[k] === 'string') n.setAttribute('title', t[k]);
      });
      if (!skipCb && typeof onLang === 'function') { try { onLang(t, lang); } catch (e) { console.error(e); } }
    }

    function applyTheme(th) {
      var dark = (th === 'dark');
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
      var ti = document.getElementById('themeIco'); if (ti) ti.textContent = dark ? '☀️' : '🌙';
      lset('theme', dark ? 'dark' : 'light');
    }

    // Hand the language picker (owned by the shared header) a hook so it can
    // re-render this page in place when the user switches language.
    window.__setLang = applyLang;

    var tb = document.getElementById('themeToggle');
    if (tb) tb.addEventListener('click', function () {
      applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    });

    applyTheme(ls('theme') || 'light');
    // Fill [data-i18n] text now, but skip the page's custom render — pages usually
    // write `const APP = KolkliTool.init(...)` and their render() closes over that
    // `APP`, which is still in its temporal dead zone during this synchronous call.
    applyLang(detectLang(I18N), true);

    var api = {
      lang: function () { return lang; },
      t: function () { return t; },
      setLang: applyLang
    };
    // Run the initial custom render on a microtask, after the page's `const APP = …`
    // assignment (and any manual post-init render) has completed.
    if (typeof onLang === 'function') {
      Promise.resolve().then(function () { try { onLang(t, lang); } catch (e) { console.error(e); } });
    }
    return api;
  }

  // Small clipboard helper shared by the generator pages: writes text and
  // flashes the trigger button, with a graceful fallback for file:// / old
  // browsers where navigator.clipboard is unavailable.
  function copy(text, btn) {
    function flash() {
      if (!btn) return;
      btn.classList.add('done');
      setTimeout(function () { btn.classList.remove('done'); }, 1100);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(flash).catch(function () { legacy(text, flash); });
    } else { legacy(text, flash); }
  }
  function legacy(text, done) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', '');
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
      done();
    } catch (e) {}
  }

  function toast(msg) {
    var e = document.getElementById('toast');
    if (!e) return;
    e.textContent = msg; e.classList.add('show');
    clearTimeout(e._t); e._t = setTimeout(function () { e.classList.remove('show'); }, 1600);
  }

  window.KolkliTool = { init: init, copy: copy, toast: toast };
})();
