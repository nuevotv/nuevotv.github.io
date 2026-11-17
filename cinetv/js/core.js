/* CineTV core : utilitaires, réseau, stockage, pile d'écrans, navigation télécommande. ES5 uniquement (Tizen 3.0). */
(function () {
  'use strict';
  var W = window, D = document;
  var CT = W.CT = {};
  CT.version = (W.CINETV && W.CINETV.version) || '0';

  /* ---------- petits outils ---------- */
  function el(tag, cls, txt) {
    var e = D.createElement(tag);
    if (cls) e.className = cls;
    if (txt !== undefined && txt !== null) e.textContent = txt;
    return e;
  }
  function each(a, f) { for (var i = 0; i < a.length; i++) f(a[i], i); }
  function $(id) { return D.getElementById(id); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function fmt(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return (h > 0 ? h + ':' + pad(m) : m) + ':' + pad(s);
  }
  CT.el = el; CT.each = each; CT.$ = $; CT.fmt = fmt;

  var LOG = [];
  CT.log = function (s) {
    var d = new Date();
    LOG.push(pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) + ' ' + s);
    if (LOG.length > 70) LOG.shift();
  };
  CT.getLog = function () { return LOG.slice(0); };

  /* ---------- stockage ---------- */
  CT.store = {
    get: function (k, d) {
      try { var v = W.localStorage.getItem('ctv_' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; }
    },
    set: function (k, v) {
      try { W.localStorage.setItem('ctv_' + k, JSON.stringify(v)); } catch (e) { CT.log('stockage: ' + e); }
    }
  };
  CT.cfg = function (k, d) { return CT.store.get('s_' + k, d); };
  CT.setCfg = function (k, v) { CT.store.set('s_' + k, v); };

  /* ---------- réseau ---------- */
  function http(url, opts, cb) {
    opts = opts || {};
    var x = new XMLHttpRequest(), done = false;
    function end(err, res) { if (done) return; done = true; cb(err, res); }
    try {
      x.open('GET', url, true);
      if (opts.binary) x.responseType = 'arraybuffer';
      if (opts.headers) for (var k in opts.headers) if (opts.headers.hasOwnProperty(k)) x.setRequestHeader(k, opts.headers[k]);
      x.timeout = opts.timeout || 15000;
      x.onload = function () {
        if (x.status >= 200 && x.status < 300) end(null, opts.binary ? x.response : x.responseText);
        else end({ status: x.status });
      };
      x.onerror = function () { end({ status: 0, network: true }); };
      x.ontimeout = function () { end({ status: 0, timeout: true }); };
      x.send();
    } catch (e) { end({ status: 0, exception: String(e) }); }
  }
  CT.http = http;

  var TM = 'https://api.themoviedb.org/3';
  var cache = {};
  CT.IMG = 'https://image.tmdb.org/t/p/';
  CT.tmdb = function (path, params, cb) {
    var key = CT.cfg('tmdb', '');
    if (!key) { cb({ nokey: true }); return; }
    params = params || {};
    var q = [], p;
    if (!params.language) params.language = 'fr-FR';
    for (p in params) if (params.hasOwnProperty(p)) q.push(p + '=' + encodeURIComponent(params[p]));
    var bearer = key.length > 40;
    if (!bearer) q.push('api_key=' + encodeURIComponent(key));
    var url = TM + path + '?' + q.join('&');
    var c = cache[url];
    if (c && Date.now() - c.t < 300000) { cb(null, c.d); return; }
    http(url, { headers: bearer ? { Authorization: 'Bearer ' + key } : null }, function (err, txt) {
      if (err) { CT.log('TMDB ' + path + ' -> ' + (err.status || (err.timeout ? 'timeout' : 'réseau'))); cb(err); return; }
      var d;
      try { d = JSON.parse(txt); } catch (e) { cb({ parse: true }); return; }
      cache[url] = { t: Date.now(), d: d };
      cb(null, d);
    });
  };
  CT.imgUrl = function (path, size) { return path ? CT.IMG + size + path : ''; };

  /* ---------- toast ---------- */
  var toastT = null;
  CT.toast = function (msg, ms) {
    var t = $('toast');
    t.innerHTML = '';
    t.appendChild(el('span', '', msg));
    t.style.display = 'block';
    clearTimeout(toastT);
    toastT = setTimeout(function () { t.style.display = 'none'; }, ms || 3000);
  };

  /* ---------- focus + navigation spatiale ---------- */
  var focused = null;
  CT.getFocus = function () { return focused; };

  function scrollInto(p, e) {
    var er = e.getBoundingClientRect(), pr = p.getBoundingClientRect();
    var cl = ' ' + p.className + ' ';
    if (cl.indexOf(' hs ') >= 0) {
      var m = 70;
      if (er.right > pr.right - m) p.scrollLeft += er.right - (pr.right - m);
      else if (er.left < pr.left + m) p.scrollLeft -= (pr.left + m) - er.left;
    }
    if (cl.indexOf(' vs ') >= 0 || cl.indexOf(' scroll ') >= 0) {
      var mt = (cl.indexOf(' scroll ') >= 0) ? 150 : 70, mb = 50;
      if (er.bottom > pr.bottom - mb) p.scrollTop += er.bottom - (pr.bottom - mb);
      else if (er.top < pr.top + mt) p.scrollTop -= (pr.top + mt) - er.top;
    }
  }
  function ensureVisible(e) {
    var p = e.parentNode;
    while (p && p !== D.body) {
      if (p.className && typeof p.className === 'string') scrollInto(p, e);
      p = p.parentNode;
    }
  }
  function setFocus(e) {
    if (focused) focused.classList.remove('focus');
    focused = e;
    if (e) {
      e.classList.add('focus'); ensureVisible(e);
      if (e.getAttribute('data-top') || (e.parentNode && e.parentNode.id === 'nav')) {
        var sc = D.querySelectorAll('.scroll');
        for (var i = 0; i < sc.length; i++) sc[i].scrollTop = 0;
      }
    }
  }
  CT.setFocus = setFocus;

  var panelEl = null;
  CT.setPanel = function (p) { panelEl = p; };

  function candidates() {
    var roots = [], out = [], t = top();
    if (panelEl) roots.push(panelEl);
    else {
      if (t && t.tab) roots.push($('nav'));
      if (t) roots.push(t.el);
    }
    each(roots, function (r) {
      var n = r.querySelectorAll('.f');
      for (var i = 0; i < n.length; i++) if (n[i].offsetWidth > 0 && n[i].offsetHeight > 0) out.push(n[i]);
    });
    return out;
  }
  CT.firstFocus = function (root) {
    var n = root.querySelectorAll('.f');
    for (var i = 0; i < n.length; i++) if (n[i].offsetWidth > 0 && n[i].offsetHeight > 0) return n[i];
    return null;
  };

  function move(dir) {
    var cands = candidates();
    if (!focused || cands.indexOf(focused) < 0) { setFocus(cands[0] || null); return; }
    var r = focused.getBoundingClientRect(), best = null, bs = 1e9;
    var cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
    each(cands, function (c) {
      if (c === focused) return;
      var rc = c.getBoundingClientRect();
      var ccx = (rc.left + rc.right) / 2, ccy = (rc.top + rc.bottom) / 2;
      var prim, cross, off;
      if (dir === 39) { if (ccx <= cx + 4) return; if (rc.top >= r.bottom || rc.bottom <= r.top) return; prim = Math.max(0, rc.left - r.right); cross = Math.max(0, Math.max(rc.top, r.top) - Math.min(rc.bottom, r.bottom)); off = Math.abs(ccy - cy); }
      else if (dir === 37) { if (ccx >= cx - 4) return; if (rc.top >= r.bottom || rc.bottom <= r.top) return; prim = Math.max(0, r.left - rc.right); cross = Math.max(0, Math.max(rc.top, r.top) - Math.min(rc.bottom, r.bottom)); off = Math.abs(ccy - cy); }
      else if (dir === 40) { if (ccy <= cy + 4) return; prim = Math.max(0, rc.top - r.bottom); cross = Math.max(0, Math.max(rc.left, r.left) - Math.min(rc.right, r.right)); off = Math.abs(ccx - cx); }
      else { if (ccy >= cy - 4) return; prim = Math.max(0, r.top - rc.bottom); cross = Math.max(0, Math.max(rc.left, r.left) - Math.min(rc.right, r.right)); off = Math.abs(ccx - cx); }
      var s = prim + cross * 4 + off * 0.6;
      if (s < bs) { bs = s; best = c; }
    });
    if (best) setFocus(best);
  }
  CT.move = move;

  /* ---------- pile d'écrans ---------- */
  var stack = [];
  function top() { return stack.length ? stack[stack.length - 1] : null; }
  CT.top = top;
  CT.stackSize = function () { return stack.length; };

  function showTop() {
    var t = top();
    each(stack, function (s) { s.el.style.display = (s === t) ? 'block' : 'none'; });
    $('nav').style.display = (t && t.tab) ? 'block' : 'none';
    D.getElementById('nav').setAttribute('data-tab', t && t.tab ? t.tab : '');
    var tabs = $('nav').querySelectorAll('.tab');
    for (var i = 0; i < tabs.length; i++) {
      if (t && t.tab === tabs[i].getAttribute('data-tab')) tabs[i].classList.add('on'); else tabs[i].classList.remove('on');
    }
  }
  /* s : { name, el, tab, onKey, onClose } */
  CT.push = function (s, focusEl) {
    var cur = top();
    if (cur) cur.focus = focused;
    stack.push(s);
    $('screens').appendChild(s.el);
    showTop();
    setFocus(focusEl || CT.firstFocus(s.el));
  };
  CT.pop = function () {
    if (stack.length <= 1) return false;
    var s = stack.pop();
    if (s.onClose) { try { s.onClose(); } catch (e) { CT.log('close: ' + e); } }
    if (s.el.parentNode) s.el.parentNode.removeChild(s.el);
    showTop();
    var t = top();
    setFocus(t && t.focus && t.focus.offsetWidth > 0 ? t.focus : (t ? CT.firstFocus(t.el) : null));
    return true;
  };
  CT.clearStack = function () {
    while (stack.length) {
      var s = stack.pop();
      if (s.onClose) { try { s.onClose(); } catch (e) { } }
      if (s.el.parentNode) s.el.parentNode.removeChild(s.el);
    }
    focused = null;
  };
  CT.currentTab = 'home';
  CT.goTab = function (name) {
    CT.clearStack();
    CT.currentTab = name;
    CT.setPanel(null);
    var s = CT.tabs[name]();
    s.tab = name;
    CT.push(s);
  };

  /* ---------- navigation ---------- */
  var TABS = [['home', 'Accueil'], ['movies', 'Films'], ['series', 'Séries'], ['search', 'Recherche'], ['list', 'Ma liste'], ['settings', 'Réglages']];
  function buildNav() {
    var n = $('nav');
    var logo = el('span', 'logo'); logo.innerHTML = 'CINE<b>TV</b>';
    n.appendChild(logo);
    each(TABS, function (t) {
      var b = el('span', 'tab f', t[1]);
      b.setAttribute('data-tab', t[0]);
      b.act = function () { CT.goTab(t[0]); };
      n.appendChild(b);
    });
  }

  function exitApp() {
    try { W.tizen.application.getCurrentApplication().exit(); } catch (e) { try { W.close(); } catch (e2) { } }
  }
  CT.exit = exitApp;

  CT.back = function () {
    if (panelEl && CT.onPanelBack) { CT.onPanelBack(); return; }
    var t = top();
    if (t && t.onBack && t.onBack()) return;
    if (CT.pop()) return;
    if (t && t.tab && t.tab !== 'home') { CT.goTab('home'); return; }
    exitApp();
  };

  function onKey(ev) {
    var k = ev.keyCode, t = top();
    if (k !== 37 && k !== 38 && k !== 39 && k !== 40) CT.log('KEY ' + k);
    if (!t) return;
    var h = false;
    if (t.onKey && !panelEl) h = t.onKey(k, ev);
    if (!h && panelEl && CT.onPanelKey) h = CT.onPanelKey(k, ev);
    if (!h) {
      if (k >= 37 && k <= 40) { move(k); h = true; }
      else if (k === 13) { if (focused && focused.act) focused.act(); h = true; }
      else if (k === 10009 || k === 27 || k === 8 || k === 461) { CT.back(); h = true; }
    }
    if (h) ev.preventDefault();
  }

  /* ---------- démarrage ---------- */
  CT.start = function () {
    try {
      var keys = ['MediaPlay', 'MediaPause', 'MediaPlayPause', 'MediaStop', 'MediaFastForward', 'MediaRewind'];
      each(keys, function (k) { try { W.tizen.tvinputdevice.registerKey(k); } catch (e) { } });
    } catch (e) { }
    buildNav();
    D.addEventListener('keydown', onKey, false);
    CT.log('CineTV ' + CT.version + ' démarré'); CT.log('UA ' + navigator.userAgent);
    if (!CT.cfg('tmdb', '')) {
      CT.goTab('settings');
      CT.toast('Bienvenue ! Commence par ta clé TMDB (Réglages > Clé TMDB)', 6000);
    } else CT.goTab('home');
  };
})();
