/* CineTV player : lecteur CineSrc (iframe) piloté par postMessage, contrôles et sous-titres SubDL maison. ES5 uniquement. */
(function () {
  'use strict';
  var W = window, D = document, CT = W.CT, el = CT.el, each = CT.each;
  var ORIGIN = 'https://cinesrc.st';
  var cur = null;

  var ICON_PLAY = '<svg width="30" height="30" viewBox="0 0 24 24"><path fill="currentColor" d="M7 4l13 8-13 8z"/></svg>';
  var ICON_PAUSE = '<svg width="30" height="30" viewBox="0 0 24 24"><rect fill="currentColor" x="6" y="4" width="4" height="16" rx="1"/><rect fill="currentColor" x="14" y="4" width="4" height="16" rx="1"/></svg>';

  function embedUrl(o, t) {
    var p = ['autoplay=true', 'controls=false', 'autonext=true', 'continueprompt=false', 'color=%23FF5C4D'];
    if (o.type === 'tv') { p.push('s=' + o.s); p.push('e=' + o.e); }
    if (t > 10) p.push('t=' + Math.floor(t));
    var q = CT.cfg('quality', 'auto');
    if (q !== 'auto') p.push('quality=' + q);
    return ORIGIN + '/embed/' + o.type + '/' + o.id + '?' + p.join('&');
  }

  function hasExt() { return !!(W.CineTVApp && W.CineTVApp.openExternal); }
  function openExt(o, t) {
    var u = embedUrl(o, t || 0).replace('controls=false', 'controls=true');
    CT.toast('Ouverture dans Silk… (Retour pour revenir à CineTV)', 4000);
    try { W.CineTVApp.openExternal(u); } catch (e) { CT.log('openExternal: ' + e); }
  }

  /* ---------- sous-titres : lecture SRT / VTT ---------- */
  function decode(u8) {
    try { return new W.TextDecoder('utf-8', { fatal: true }).decode(u8); } catch (e) { }
    try { return new W.TextDecoder('windows-1252').decode(u8); } catch (e2) { }
    var s = ''; for (var i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
    return s;
  }
  function tsec(h, m, s, f) { return (+h) * 3600 + (+m) * 60 + (+s) + parseFloat('0.' + (f || '0')); }
  function parseSub(text) {
    text = text.replace(/^﻿/, '').replace(/\r/g, '');
    var blocks = text.split(/\n\n+/), cues = [];
    each(blocks, function (b) {
      var lines = b.split('\n'), i = 0;
      while (i < lines.length && lines[i].indexOf('-->') < 0) i++;
      if (i >= lines.length) return;
      var m = lines[i].match(/(\d+):(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)/), s, e;
      if (m) { s = tsec(m[1], m[2], m[3], m[4]); e = tsec(m[5], m[6], m[7], m[8]); }
      else {
        m = lines[i].match(/(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+)[,.](\d+)/);
        if (!m) return;
        s = tsec(0, m[1], m[2], m[3]); e = tsec(0, m[4], m[5], m[6]);
      }
      var txt = lines.slice(i + 1).join('\n').replace(/<[^>]+>/g, '').replace(/\{[^}]*\}/g, '').replace(/^\s+|\s+$/g, '');
      if (txt) cues.push({ s: s, e: e, t: txt });
    });
    cues.sort(function (a, b) { return a.s - b.s; });
    return cues;
  }
  function cueAt(cues, t) {
    var lo = 0, hi = cues.length - 1, idx = -1;
    while (lo <= hi) { var mid = (lo + hi) >> 1; if (cues[mid].s <= t) { idx = mid; lo = mid + 1; } else hi = mid - 1; }
    for (var i = idx; i >= 0 && i > idx - 4; i--) if (cues[i].e >= t) return cues[i];
    return null;
  }
  function pickFile(names, o) {
    var subs = [];
    each(names, function (n) { if (/\.(srt|vtt)$/i.test(n)) subs.push(n); });
    if (!subs.length) return null;
    if (o.type === 'tv') {
      var r1 = new RegExp('s0*' + o.s + '[ ._-]?e0*' + o.e + '(?!\\d)', 'i'), r2 = new RegExp('(^|[^\\d])' + o.s + 'x0*' + o.e + '(?!\\d)', 'i');
      for (var i = 0; i < subs.length; i++) if (r1.test(subs[i]) || r2.test(subs[i])) return subs[i];
    }
    return subs[0];
  }

  /* ---------- SubDL ---------- */
  function searchSubs(o, lang, cb) {
    var key = CT.cfg('subdl', '');
    if (!key) { cb({ nokey: true }); return; }
    var q = 'api_key=' + encodeURIComponent(key) + '&tmdb_id=' + o.id + '&type=' + (o.type === 'tv' ? 'tv' : 'movie') + '&languages=' + lang + '&subs_per_page=30';
    if (o.type === 'tv') q += '&season_number=' + o.s + '&episode_number=' + o.e;
    CT.http('https://api.subdl.com/api/v1/subtitles?' + q, { headers: { Accept: 'application/json' } }, function (err, t) {
      if (err) { CT.log('SubDL recherche: ' + (err.status || 'réseau')); cb(err); return; }
      var d; try { d = JSON.parse(t); } catch (e) { cb({ parse: true }); return; }
      cb(null, d.subtitles || []);
    });
  }
  function fetchZip(url, cb) {
    var full = /^https?:/.test(url) ? url : 'https://dl.subdl.com' + (url.charAt(0) === '/' ? '' : '/') + url;
    CT.http(full, { binary: true, timeout: 30000 }, function (err, buf) {
      if (!err) { cb(null, buf); return; }
      CT.log('SubDL zip direct KO (' + (err.status || 'réseau') + '), essai via relais');
      CT.http('https://corsproxy.io/?url=' + encodeURIComponent(full), { binary: true, timeout: 30000 }, cb);
    });
  }
  function loadSub(P, item, done) {
    CT.toast('Chargement des sous-titres…', 4000);
    fetchZip(item.url, function (err, buf) {
      if (!cur || cur !== P) return;
      if (err) { CT.toast('Téléchargement impossible (' + (err.status || 'réseau') + ')', 5000); done(false); return; }
      try {
        var u8 = new Uint8Array(buf), text;
        if (u8[0] === 0x50 && u8[1] === 0x4B) {
          var files = W.fflate.unzipSync(u8), names = [], k;
          for (k in files) if (files.hasOwnProperty(k)) names.push(k);
          var pick = pickFile(names, P.o);
          if (!pick) { CT.toast('Aucun fichier de sous-titres dans l’archive', 5000); done(false); return; }
          text = decode(files[pick]);
        } else text = decode(u8);
        var cues = parseSub(text);
        if (!cues.length) { CT.toast('Sous-titres illisibles', 5000); done(false); return; }
        P.cues = cues; P.subName = item.release_name || item.name || 'SubDL'; P.subOffset = 0; P.subText = '\u0000';
        P.renderSub();
        CT.toast('Sous-titres chargés (' + cues.length + ' lignes)', 2500);
        done(true);
      } catch (e) { CT.log('sub: ' + e); CT.toast('Sous-titres illisibles', 5000); done(false); }
    });
  }

  /* ---------- lecteur ---------- */
  function onMsg(ev) {
    if (!cur || ev.origin !== ORIGIN) return;
    var d = ev.data;
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { return; } }
    if (!d || typeof d.type !== 'string' || d.type.indexOf('cinesrc:') !== 0) return;
    cur.onEvent(d);
  }
  W.addEventListener('message', onMsg, false);

  CT.play = function (o) {
    if (hasExt() && CT.cfg('player', 'silk') === 'silk') { openExt(o, o.t || 0); return; }
    var P = { o: o, cur: o.t || 0, curAt: Date.now(), dur: 0, paused: false, started: false, cues: null, subOffset: 0, subText: '', subName: '', lastSave: 0, overlayOn: false, errorShown: false };
    var root = el('div', 'screen player'), $app;
    var frame = D.createElement('iframe');
    frame.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture');
    /* Écran mis à l'échelle (Android) : la vidéo reste hors de la zone transformée, sinon l'image peut rester noire */
    var outer = !!CT.scaled;
    if (outer) {
      root.className += ' clear';
      frame.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;border:0;background:#000;z-index:1';
      D.body.appendChild(frame);
      $app = D.getElementById('app'); if ($app) { $app.style.zIndex = 2; }
    } else root.appendChild(frame);
    var subs = el('div'); subs.id = 'subs'; root.appendChild(subs);

    var topB = el('div', 'p-top');
    var pt = el('div', 'pt', o.title), ps = el('div', 'ps');
    topB.appendChild(pt); topB.appendChild(ps); root.appendChild(topB);

    var bot = el('div', 'p-bot');
    var brow = el('div', 'bar-row');
    var tmC = el('span', 'tm', '0:00'), tmD = el('span', 'tm r', '0:00');
    var bar = el('div', 'bar f'), tr = el('div', 'tr'), fl = el('div', 'fl'), kn = el('div', 'kn');
    tr.appendChild(fl); bar.appendChild(tr); bar.appendChild(kn);
    brow.appendChild(tmC); brow.appendChild(bar); brow.appendChild(tmD);
    bot.appendChild(brow);
    var btns = el('div', 'p-btns');
    function pb(label) { var b = el('div', 'pb f'); b.innerHTML = label; btns.appendChild(b); return b; }
    var bPlay = pb(ICON_PAUSE), bBack = pb('−10 s'), bFwd = pb('+10 s'), bSub = pb('Sous-titres'), bM = pb('Sous-titres −0,5 s'), bP = pb('Sous-titres +0,5 s'), bDirect = pb(hasExt() ? 'Ouvrir dans Silk' : 'Mode direct'), bNext = null;
    if (o.type === 'tv') bNext = pb('Épisode suivant');
    bot.appendChild(btns); root.appendChild(bot);

    var st = el('div', 'status'), stT = el('div', 'stt'), stS = el('div', 'sub'), stB = el('div', 'btn f', 'Réessayer'), stD = el('div', 'btn f', 'Mode direct (test)');
    stB.style.display = 'none'; stD.style.display = 'none';
    st.appendChild(stT); st.appendChild(stS); st.appendChild(stB); st.appendChild(stD); root.appendChild(st);

    var scr = { name: 'player', el: root };
    P.frame = frame; P.barEl = bar;

    function send(cmd, args) {
      try { frame.contentWindow.postMessage({ type: 'cinesrc:command', command: cmd, args: args || [] }, ORIGIN); } catch (e) { CT.log('send ' + cmd + ': ' + e); }
    }
    P.now = function () { return P.paused || !P.started ? P.cur : P.cur + (Date.now() - P.curAt) / 1000; };
    function setPlayIcon() { bPlay.innerHTML = P.paused ? ICON_PLAY : ICON_PAUSE; }
    P.toggle = function () { if (P.paused) { send('play'); P.paused = false; } else { send('pause'); P.paused = true; } P.cur = P.now(); P.curAt = Date.now(); setPlayIcon(); };
    P.seekBy = function (d) {
      var t = Math.max(0, Math.min((P.dur || 1e9) - 2, P.now() + d));
      send('seek', [t]); P.cur = t; P.curAt = Date.now(); P.refreshBar(); P.renderSub();
      CT.toast((d > 0 ? '+' : '−') + Math.abs(d) + ' s', 700);
    };
    P.refreshBar = function () {
      var t = P.now(), pct = P.dur ? Math.min(100, t / P.dur * 100) : 0;
      tmC.textContent = CT.fmt(t); tmD.textContent = CT.fmt(P.dur);
      var w = bar.offsetWidth - 20; if (w < 0) w = 0;
      fl.style.width = (w * pct / 100) + 'px'; kn.style.left = (10 + w * pct / 100) + 'px';
    };
    P.renderSub = function () {
      if (!P.cues) { if (P.subText) { subs.innerHTML = ''; P.subText = ''; } return; }
      var c = cueAt(P.cues, P.now() + P.subOffset), txt = c ? c.t : '';
      if (txt === P.subText) return;
      P.subText = txt; subs.innerHTML = '';
      if (!txt) return;
      var size = CT.cfg('subsize', 44);
      each(txt.split('\n'), function (line) { var d = el('div'), sp = el('span', '', line); sp.style.fontSize = size + 'px'; d.appendChild(sp); subs.appendChild(d); });
    };
    function updTop() {
      var a = [];
      if (o.type === 'tv') a.push('Saison ' + o.s + ' · Épisode ' + o.e);
      if (P.cues) a.push('Sous-titres : ' + P.subName);
      ps.textContent = a.join('   |   ');
    }
    P.showOverlay = function () {
      topB.style.display = 'block'; bot.style.display = 'block'; subs.className = 'up'; P.overlayOn = true;
      updTop(); P.refreshBar(); P.resetTimer();
      var f = CT.getFocus();
      if (!f || f.offsetWidth === 0 || !root.contains(f)) CT.setFocus(bPlay);
    };
    P.hideOverlay = function () {
      topB.style.display = 'none'; bot.style.display = 'none'; subs.className = ''; P.overlayOn = false;
      if (!P.errorShown) CT.setFocus(null);
    };
    P.resetTimer = function () { clearTimeout(P.hideT); P.hideT = setTimeout(function () { if (!P.errorShown && !CT.panelOpen) P.hideOverlay(); }, 6500); };

    function showStatus(t, s, retry) {
      stT.textContent = t; stS.textContent = s || '';
      st.style.display = 'block'; stB.style.display = retry ? 'inline-block' : 'none'; stD.style.display = retry ? 'inline-block' : 'none';
      if (retry) { P.errorShown = true; P.hideOverlay(); CT.setFocus(stB); }
    }
    function hideStatus() { st.style.display = 'none'; P.errorShown = false; clearTimeout(P.loadT); }
    function startLoading(t) {
      P.errorShown = false; P.started = false;
      showStatus('Chargement de la vidéo…', 'Quelques secondes. Retour pour revenir à la fiche.', false);
      clearTimeout(P.loadT);
      P.loadT = setTimeout(function () {
        if (!P.started) showStatus('La vidéo ne démarre pas', 'Le lecteur CineSrc n\u2019a rien chargé. Si ça arrive à chaque fois, la TV est peut-être trop ancienne pour ce lecteur.', true);
      }, 25000);
      frame.src = embedUrl(P.o, t);
      CT.log('PLAY ' + frame.src);
    }
    stB.act = function () { startLoading(P.now()); };
    /* Mode direct : ouvre le lecteur CineSrc en plein écran, hors iframe (diagnostic). Retour = revenir à CineTV. */
    stD.act = function () { save(); CT.log('mode direct'); if (hasExt()) { try { frame.src = 'about:blank'; } catch (e) { } openExt(P.o, P.now()); return; } location.href = embedUrl(P.o, P.now()).replace('controls=false', 'controls=true'); };

    function save() {
      if (!P.dur || P.cur < 5) return;
      if (P.cur / P.dur > 0.95) { CT.removeProg(o.type, o.id); return; }
      CT.saveProg({ type: o.type, id: o.id, title: o.title, poster: o.poster, s: o.s, e: o.e, t: Math.floor(P.cur), d: Math.floor(P.dur) });
    }

    P.onEvent = function (d) {
      if (d.type !== 'cinesrc:timeupdate') CT.log('MSG ' + d.type.replace('cinesrc:', '') + (d.error ? ' ' + d.error : ''));
      switch (d.type) {
        case 'cinesrc:loadedmetadata': if (d.duration) P.dur = d.duration; break;
        case 'cinesrc:timeupdate':
          P.cur = d.currentTime || 0; P.curAt = Date.now(); if (d.duration) P.dur = d.duration;
          if (!P.started && P.cur > 0) { P.started = true; hideStatus(); }
          if (Date.now() - P.lastSave > 8000) { P.lastSave = Date.now(); save(); }
          break;
        case 'cinesrc:play': P.paused = false; P.started = true; P.curAt = Date.now(); hideStatus(); setPlayIcon(); break;
        case 'cinesrc:pause': P.paused = true; setPlayIcon(); break;
        case 'cinesrc:ended': CT.removeProg(o.type, o.id); if (o.type === 'movie') CT.back(); break;
        case 'cinesrc:nextepisode':
          if (d.season) o.s = d.season; if (d.episode) o.e = d.episode;
          P.cues = null; P.subText = ''; subs.innerHTML = ''; P.cur = 0; P.dur = 0; P.curAt = Date.now(); updTop();
          if (d.internalNavigation === false) startLoading(0);
          break;
        case 'cinesrc:error': showStatus('Erreur du lecteur', String(d.error || ''), true); break;
        case 'cinesrc:close': CT.back(); break;
      }
    };
    cur = P;

    /* touches */
    scr.onKey = function (k) {
      if (P.errorShown) return false;
      if (k === 415 || k === 19 || k === 10252) { P.toggle(); P.showOverlay(); return true; }
      if (k === 413) { CT.back(); return true; }
      if (k === 417) { P.seekBy(30); return true; }
      if (k === 412) { P.seekBy(-30); return true; }
      if (!P.overlayOn) {
        if (k === 13) { P.toggle(); P.showOverlay(); return true; }
        if (k === 37) { P.seekBy(-10); return true; }
        if (k === 39) { P.seekBy(10); return true; }
        if (k === 38 || k === 40) { P.showOverlay(); return true; }
        return false;
      }
      P.resetTimer();
      if (CT.getFocus() === bar && (k === 37 || k === 39)) { P.seekBy(k === 37 ? -10 : 10); return true; }
      return false;
    };
    scr.onClose = function () {
      save();
      clearInterval(P.tick); clearTimeout(P.hideT); clearTimeout(P.loadT);
      try { frame.src = 'about:blank'; } catch (e) { }
      if (outer && frame.parentNode) frame.parentNode.removeChild(frame);
      CT.setPanel(null); CT.panelOpen = false; CT.onPanelBack = null;
      if (cur === P) cur = null;
    };

    bPlay.act = function () { P.toggle(); P.resetTimer(); };
    bBack.act = function () { P.seekBy(-10); P.resetTimer(); };
    bFwd.act = function () { P.seekBy(10); P.resetTimer(); };
    function offset(d) {
      P.subOffset = Math.round((P.subOffset + d) * 10) / 10; P.subText = '\u0000'; P.renderSub();
      CT.toast('Décalage des sous-titres : ' + (P.subOffset > 0 ? '+' : '') + String(P.subOffset).replace('.', ',') + ' s', 1500);
      P.resetTimer();
    }
    bM.act = function () { if (!P.cues) { CT.toast('Charge d’abord des sous-titres', 2000); return; } offset(-0.5); };
    bP.act = function () { if (!P.cues) { CT.toast('Charge d’abord des sous-titres', 2000); return; } offset(0.5); };
    bSub.act = function () { openSubs(P, root); };
    bDirect.act = function () { stD.act(); };
    if (bNext) bNext.act = function () { o.e = o.e + 1; P.cues = null; P.subText = ''; subs.innerHTML = ''; P.cur = 0; P.dur = 0; updTop(); startLoading(0); P.resetTimer(); };

    CT.push(scr);
    startLoading(o.t || 0);
    P.tick = setInterval(function () { P.renderSub(); if (P.overlayOn) P.refreshBar(); }, 250);
    P.showOverlay();
  };

  /* ---------- panneau des sous-titres ---------- */
  function openSubs(P, root) {
    var panel = el('div', 'panel');
    panel.appendChild(el('h2', '', 'Sous-titres'));
    var chips = el('div'), list = el('div', 'plist vs'), lang = CT.cfg('sublang', 'FR');
    var LANGS = [['FR', 'Français'], ['EN', 'Anglais'], ['ES', 'Espagnol']];
    var chipEls = [];
    each(LANGS, function (l) {
      var c = el('div', 'chip f', l[1]);
      c.act = function () { lang = l[0]; CT.setCfg('sublang', lang); refresh(); };
      chipEls.push({ c: c, code: l[0] });
      chips.appendChild(c);
    });
    panel.appendChild(chips); panel.appendChild(list);
    root.appendChild(panel);
    CT.setPanel(panel); CT.panelOpen = true;
    function close() {
      if (panel.parentNode) panel.parentNode.removeChild(panel);
      CT.setPanel(null); CT.panelOpen = false; CT.onPanelBack = null;
      CT.setFocus(null);
      if (cur === P) P.showOverlay();
    }
    CT.onPanelBack = close;

    function refresh() {
      each(chipEls, function (x) { if (x.code === lang) x.c.classList.add('on'); else x.c.classList.remove('on'); });
      list.innerHTML = '';
      list.appendChild(el('div', 'pmsg', 'Recherche sur SubDL…'));
      searchSubs(P.o, lang, function (err, items) {
        if (!cur || cur !== P || CT.panelOpen === false) return;
        list.innerHTML = '';
        var none = el('div', 'pitem f' + (!P.cues ? ' on' : ''), 'Aucun sous-titre');
        none.act = function () { P.cues = null; P.subText = ''; P.renderSub(); close(); };
        list.appendChild(none);
        if (err) {
          list.appendChild(el('div', 'pmsg', err.nokey ? 'Ajoute ta clé SubDL dans Réglages.' : 'SubDL injoignable (' + (err.status !== undefined ? 'code ' + err.status : 'erreur') + ').'));
        } else if (!items.length) {
          list.appendChild(el('div', 'pmsg', 'Aucun sous-titre trouvé dans cette langue pour ce titre.'));
        } else {
          each(items, function (it) {
            var nm = it.release_name || it.name || 'Sous-titre';
            var d = el('div', 'pitem f', nm);
            d.act = function () {
              loadSub(P, it, function (ok) { if (ok) close(); });
            };
            list.appendChild(d);
          });
        }
        CT.setFocus(list.querySelector('.f.on') || list.querySelector('.f') || chipEls[0].c);
      });
    }
    refresh();
    CT.setFocus(chipEls[0].c);
  }
})();
