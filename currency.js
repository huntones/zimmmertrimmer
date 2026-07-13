/* ==========================================================================
   currency.js — IP-based pricing currency for KOLKLI.

   Detects the visitor's country (via the same free api.country.is lookup the
   homepage already uses for language) and maps it to a display currency, so
   the pricing table shows local money: ₪ in Israel, € in the eurozone,
   £ in the UK, ₽ in Russia, $ everywhere else.

   Prices are authored in USD (the base). ILS keeps its own hand-set price
   points (₪89 / ₪249 look intentional, not a raw conversion); every other
   currency is derived from the USD amount via the RATES table below, rounded
   to a clean whole number. If detection is unavailable it falls back to the
   old language-based behaviour (Hebrew → ₪, everything else → $), so nothing
   ever breaks.

   Source of truth for country: localStorage 'ac_country' (shared with the
   homepage language detector). We only hit the network when it's missing.

   ─── ALL THREE TABLES BELOW ARE SAFE TO EDIT ───
     CUR    — currencies we support (symbol, decimals, rounding, side)
     RATES  — USD → currency multipliers (update when FX drifts)
     C2C    — country code → currency

   Public API (window.KOLKLI_CUR):
     .code            active ISO currency, e.g. 'USD' | 'ILS' | 'EUR'
     .symbol          its symbol, e.g. '$' | '₪' | '€'
     .country         detected/assumed 2-letter country code
     .price(usd,ils)  formatted string for a USD base amount
                      (the optional ils point is used verbatim when code==='ILS')
     .amount(usd,ils) the numeric amount in the active currency
     .format(n)       format a raw number already in the active currency
     .setCountry(cc)  force a country (checkout uses this so the currency can
                      follow the billing-country picker)
     .onReady(cb)     run cb() once geo detection settles (fires immediately
                      if it already has)
     .ready           a Promise that resolves to the API once settled
   ========================================================================== */
(function () {
  'use strict';

  var DEFAULT = 'USD';                      // fallback when a country isn't mapped

  /* ---- currencies: sym=symbol, dec=decimals, step=rounding, side=symbol side,
          sep=thousands separator ------------------------------------------- */
  var CUR = {
    USD: { sym: '$',   dec: 0, step: 1,  side: 'pre',  sep: ',' },
    ILS: { sym: '₪',   dec: 0, step: 1,  side: 'pre',  sep: ',' },
    EUR: { sym: '€',   dec: 0, step: 1,  side: 'pre',  sep: '.' },
    GBP: { sym: '£',   dec: 0, step: 1,  side: 'pre',  sep: ',' },
    CAD: { sym: 'CA$', dec: 0, step: 1,  side: 'pre',  sep: ',' },
    AUD: { sym: 'A$',  dec: 0, step: 1,  side: 'pre',  sep: ',' },
    RUB: { sym: '₽',   dec: 0, step: 10, side: 'post', sep: ' ' }
  };

  /* ---- USD → currency multipliers. USD is the base (1). Edit as FX drifts. */
  var RATES = { USD: 1, ILS: 3.7, EUR: 0.92, GBP: 0.79, CAD: 1.37, AUD: 1.52, RUB: 92 };

  /* ---- country → currency. Anything not listed here falls back to USD. ---- */
  var EURO = ('AT BE HR CY EE FI FR DE GR IE IT LV LT LU MT NL PT SK SI ES').split(' ');
  var C2C = { IL: 'ILS', US: 'USD', GB: 'GBP', CA: 'CAD', AU: 'AUD', RU: 'RUB' };
  for (var i = 0; i < EURO.length; i++) { C2C[EURO[i]] = 'EUR'; }

  /* ---- storage helpers (shared 'ac_country' key with the language detector) */
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  function curForCountry(cc) { return (cc && C2C[cc]) || DEFAULT; }

  /* Best guess before we know the country: reuse a cached country if there is
     one, else infer from the chosen/likely language (Hebrew → ₪). */
  function fallbackCode() {
    var cc = lsGet('ac_country'); if (cc) return curForCountry(cc);
    if (lsGet('ac_lang') === 'he') return 'ILS';
    try { if ((navigator.language || '').toLowerCase().indexOf('he') === 0) return 'ILS'; } catch (e) {}
    return DEFAULT;
  }

  var API = { code: DEFAULT, symbol: '$', country: '' };
  var cbs = [], done = false;

  function setCode(code, country) {
    if (!CUR[code]) code = DEFAULT;
    API.code = code;
    API.symbol = CUR[code].sym;
    if (country) API.country = country;
  }

  function group(intStr, sep) {
    return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, sep || ',');
  }

  /* format a raw number that is ALREADY in the active currency */
  API.format = function (n) {
    var c = CUR[API.code] || CUR[DEFAULT];
    var v = +n || 0, neg = v < 0; v = Math.abs(v);
    var parts = v.toFixed(c.dec).split('.');
    parts[0] = group(parts[0], c.sep);
    var s = (neg ? '-' : '') + parts.join('.');
    return c.side === 'post' ? (s + ' ' + c.sym) : (c.sym + s);
  };

  /* USD base amount → numeric amount in the active currency (rounded) */
  API.amount = function (usd, ils) {
    if (API.code === 'ILS' && ils != null) return +ils;
    if (API.code === 'USD') return +usd || 0;
    var c = CUR[API.code] || CUR[DEFAULT];
    var raw = (+usd || 0) * (RATES[API.code] || 1);
    var step = c.step || 1;
    return Math.round(raw / step) * step;
  };

  /* USD base amount → formatted price string (optional explicit ILS point) */
  API.price = function (usd, ils) { return API.format(API.amount(usd, ils)); };

  /* force a country (checkout's billing-country picker uses this) */
  API.setCountry = function (cc) {
    cc = (cc || '').toUpperCase();
    setCode(curForCountry(cc), cc);
    return API.code;
  };

  API.onReady = function (cb) {
    if (typeof cb !== 'function') return;
    if (done) { cb(); } else { cbs.push(cb); }
  };

  function settle() {
    if (done) return;
    done = true;
    for (var j = 0; j < cbs.length; j++) { try { cbs[j](); } catch (e) {} }
    cbs = [];
  }

  /* 1) synchronous first guess so the first paint is already sensible.
        A manual override (?cur=EUR or localStorage 'ac_currency') always wins —
        handy for QA and for a future user-facing currency switcher. */
  var forced = (location.search.match(/[?&]cur=([A-Za-z]{3})/) || [])[1];
  forced = (forced && forced.toUpperCase()) || (lsGet('ac_currency') || '').toUpperCase();
  var isForced = !!(forced && CUR[forced]);
  if (isForced) setCode(forced);
  else setCode(fallbackCode(), lsGet('ac_country') || '');

  /* 2) refine from the visitor's IP — but only if we don't already know the
        country (it effectively never changes for a user, so cache-first means
        most visits make no network call at all). */
  API.ready = new Promise(function (resolve) {
    if (isForced || lsGet('ac_country') || !('fetch' in window)) { resolve(API); return; }
    var ctrl = ('AbortController' in window) ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, 2500) : null;
    fetch('https://api.country.is/', ctrl ? { signal: ctrl.signal } : undefined)
      .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
      .then(function (d) {
        var cc = d && d.country;
        if (cc) { lsSet('ac_country', cc); setCode(curForCountry(cc), cc); }
      })
      .catch(function () {})
      .then(function () { if (timer) clearTimeout(timer); resolve(API); });
  }).then(function () { settle(); return API; });

  // if geo isn't going to run (forced / cached / no fetch), still fire onReady
  if (isForced || lsGet('ac_country') || !('fetch' in window)) settle();

  window.KOLKLI_CUR = API;
})();
