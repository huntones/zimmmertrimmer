/* ============================================================================
 * KOLKLI project numbering.
 *
 * Production path: allocate_project_number(project_service, project_ref) RPC.
 * Local demo path: owner-scoped counters in localStorage, guarded by Web Locks
 * when available. Numbers are never derived from user input.
 * ==========================================================================*/
(function () {
  'use strict';
  if (window.KolkliProjectNumbers) return;

  var SERVICES = {
    select:  { start: 1001,   he: 'פרויקט לבחירה', en: 'Selection project', ru: 'Проект выбора' },
    receive: { start: 10001,  he: 'פרויקט שהתקבל', en: 'Received project',  ru: 'Полученный проект' },
    send:    { start: 100001, he: 'פרויקט שנשלח',  en: 'Sent project',      ru: 'Отправленный проект' },
    review:  { start: 101,    he: 'פרויקט לאישור', en: 'Approval project',  ru: 'Проект на согласование' }
  };

  var ALIASES = {
    selection: 'select',
    choose: 'select',
    files: 'select',
    request: 'receive',
    received: 'receive',
    upload: 'receive',
    transfer: 'send',
    sent: 'send',
    approval: 'review',
    approve: 'review'
  };

  function safeOwnerId(v) {
    return String(v || 'guest').toLowerCase().replace(/[^a-z0-9_.@-]+/g, '_') || 'guest';
  }

  function currentOwnerId() {
    var email = '';
    try { email = (localStorage.getItem('ac_session') || '').toLowerCase(); } catch (_) {}
    if (!email) return 'guest';
    try {
      var users = JSON.parse(localStorage.getItem('ac_users') || '[]') || [];
      for (var i = 0; i < users.length; i++) {
        if ((users[i].email || '').toLowerCase() === email) return safeOwnerId(users[i].id || users[i].userId || email);
      }
    } catch (_) {}
    return safeOwnerId(email);
  }

  function scopedKey(base, owner) {
    return base + '::' + safeOwnerId(owner || currentOwnerId());
  }

  function serviceOf(value) {
    var s = String(value || '').toLowerCase().trim().replace(/^project-/, '');
    return SERVICES[s] ? s : (ALIASES[s] || 'select');
  }

  function langOf(lang) {
    return lang === 'he' || lang === 'ru' || lang === 'en' ? lang : 'he';
  }

  function label(service, lang) {
    var key = serviceOf(service);
    return SERVICES[key][langOf(lang)] || SERVICES[key].he;
  }

  function normalizeNumber(v) {
    var n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }

  function existingNumber(record) {
    if (!record) return 0;
    return normalizeNumber(record.projectNumber || record.project_number || record.number);
  }

  function readCounters(owner) {
    try {
      var o = JSON.parse(localStorage.getItem(scopedKey('kolkli_project_number_counters', owner)) || '{}');
      return o && typeof o === 'object' ? o : {};
    } catch (_) { return {}; }
  }

  function writeCounters(owner, counters) {
    try { localStorage.setItem(scopedKey('kolkli_project_number_counters', owner), JSON.stringify(counters || {})); } catch (_) {}
  }

  function nextLocalNumber(service, owner) {
    var key = serviceOf(service);
    var counters = readCounters(owner);
    var next = normalizeNumber(counters[key]) || SERVICES[key].start;
    counters[key] = next + 1;
    writeCounters(owner, counters);
    return next;
  }

  function withLocalLock(service, owner, fn) {
    var lockName = 'kolkli-project-number-' + safeOwnerId(owner || currentOwnerId()) + '-' + serviceOf(service);
    if (navigator.locks && navigator.locks.request) {
      return navigator.locks.request(lockName, { mode: 'exclusive' }, fn);
    }
    return Promise.resolve().then(fn);
  }

  function wait(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  async function authClient() {
    for (var i = 0; i < 12 && !window.KolkliAuth; i++) await wait(25);
    if (!window.KolkliAuth || !KolkliAuth.configured || !KolkliAuth.configured() || !KolkliAuth.getClient) return { configured: false, client: null };
    try {
      if (KolkliAuth.ready) await KolkliAuth.ready;
      return { configured: true, client: await KolkliAuth.getClient() };
    } catch (e) { return { configured: true, client: null, error: e }; }
  }

  async function serverNumber(service, record) {
    var auth = await authClient();
    if (!auth.configured) return { configured: false, number: 0 };
    var client = auth.client;
    if (!client || !client.rpc) return { configured: true, number: 0, error: auth.error || new Error('missing_supabase_client') };
    try {
      var res = await client.rpc('allocate_project_number', {
        project_service: serviceOf(service),
        project_ref: (record && (record.id || record.token)) || null
      });
      if (res && !res.error) return { configured: true, number: normalizeNumber(Array.isArray(res.data) ? res.data[0] : res.data) };
      return { configured: true, number: 0, error: res && res.error };
    } catch (e) { return { configured: true, number: 0, error: e }; }
  }

  function attach(record, service, number, source) {
    var key = serviceOf(service);
    record.projectNumber = normalizeNumber(number);
    record.project_number = record.projectNumber;
    record.projectService = key;
    record.serviceType = key;
    record.projectNumberSource = source || record.projectNumberSource || '';
    record.projectNumberLabel = display(key, record);
    return record;
  }

  async function assign(service, record, opts) {
    var key = serviceOf(service);
    var target = record || {};
    var current = existingNumber(target);
    if (current) return attach(target, key, current, target.projectNumberSource);
    var server = await serverNumber(key, target);
    if (server.number) return attach(target, key, server.number, 'server');
    if (server.configured) {
      var err = new Error('project_number_allocation_failed');
      err.cause = server.error;
      throw err;
    }
    return withLocalLock(key, opts && opts.ownerId, function () {
      return attach(target, key, nextLocalNumber(key, opts && opts.ownerId), 'local');
    });
  }

  function ensure(service, record, opts) {
    if (!record) return record;
    var key = serviceOf(service);
    var current = existingNumber(record);
    return attach(record, key, current || nextLocalNumber(key, opts && opts.ownerId), current ? record.projectNumberSource : 'local');
  }

  function ensureAll(service, list, saveFn, opts) {
    var changed = false;
    var key = serviceOf(service);
    (list || []).forEach(function (item) {
      if (!item) return;
      var before = existingNumber(item);
      ensure(key, item, opts);
      if (!before) changed = true;
    });
    if (changed && typeof saveFn === 'function') saveFn(list || []);
    return list || [];
  }

  function display(service, record, lang) {
    var n = existingNumber(record);
    return n ? (label(service, lang) + ' · #' + n) : '';
  }

  function haystack(service, record) {
    var n = existingNumber(record);
    return n ? [String(n), '#' + n, display(service, record, 'he'), display(service, record, 'en')] : [];
  }

  window.KolkliProjectNumbers = {
    services: SERVICES,
    serviceOf: serviceOf,
    label: label,
    assign: assign,
    ensure: ensure,
    ensureAll: ensureAll,
    display: display,
    haystack: haystack,
    currentOwnerId: currentOwnerId
  };
  window.KPN = window.KolkliProjectNumbers;
})();
