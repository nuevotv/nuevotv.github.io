/* CineTV ui : accueil, fiches, recherche, ma liste, réglages, clavier à l'écran. ES5 uniquement. */
(function () {
  'use strict';
  var CT = window.CT, el = CT.el, each = CT.each;

  /* ---------- données locales : reprise + ma liste ---------- */
  CT.getProg = function (type, id) { var p = CT.store.get('prog', {}); return p[type + id] || null; };
  CT.saveProg = function (o) {
    var p = CT.store.get('prog', {});
    o.ts = Date.now();
    p[o.type + o.id] = o;
    var arr = [], k;
    for (k in p) if (p.hasOwnProperty(k)) arr.push(k);
    if (arr.length > 40) {
      arr.sort(function (a, b) { return p[a].ts - p[b].ts; });
      for (var i = 0; i < arr.length - 40; i++) delete p[arr[i]];
    }
    CT.store.set('prog', p);
  };
  CT.removeProg = function (type, id) { var p = CT.store.get('prog', {}); delete p[type + id]; CT.store.set('prog', p); };
  function progList() {
    var p = CT.store.get('prog', {}), a = [], k;
    for (k in p) if (p.hasOwnProperty(k)) a.push(p[k]);
    a.sort(function (x, y) { return y.ts - x.ts; });
    return a;
  }
  function inList(type, id) { var l = CT.store.get('list', []); for (var i = 0; i < l.length; i++) if (l[i].type === type && l[i].id === id) return true; return false; }
  function toggleList(n) {
    var l = CT.store.get('list', []), out = [], found = false;
    each(l, function (x) { if (x.type === n.type && x.id === n.id) found = true; else out.push(x); });
    if (!found) out.unshift({ type: n.type, id: n.id, title: n.title, poster: n.poster });
    CT.store.set('list', out);
    return !found;
  }

  /* ---------- cartes ---------- */
  function norm(it, def) {
    return {
      type: it.media_type || def, id: it.id, title: it.title || it.name || '',
      year: (it.release_date || it.first_air_date || '').slice(0, 4),
      poster: it.poster_path ? CT.imgUrl(it.poster_path, 'w342') : (it.poster || ''),
      backdrop: it.backdrop_path ? CT.imgUrl(it.backdrop_path, 'w1280') : '',
      overview: it.overview || '', vote: it.vote_average || 0
    };
  }
  function makeCard(n, extra) {
    var c = el('div', 'card f'), p = el('div', 'poster');
    if (n.poster) p.style.backgroundImage = 'url(' + n.poster + ')';
    else { p.className += ' noimg'; p.textContent = n.title; }
    if (extra && extra.badge) p.appendChild(el('div', 'badge', extra.badge));
    if (extra && extra.prog !== undefined) {
      p.appendChild(el('div', 'pbar-bg'));
      var b = el('div', 'pbar'); b.style.width = Math.max(3, Math.min(100, Math.round(extra.prog * 100))) + '%'; p.appendChild(b);
    }
    c.appendChild(p);
    c.appendChild(el('div', 'ct', n.title));
    c.act = (extra && extra.act) || function () { CT.openDetail(n.type, n.id); };
    return c;
  }
  function ensureFocus(s) {
    if (s.dead) return;
    var f = CT.getFocus();
    if (!f || f.offsetWidth === 0) CT.setFocus(CT.firstFocus(s.el));
  }

  /* ---------- accueil / films / séries ---------- */
  var ROWS = {
    home: [['Tendances films', '/trending/movie/week', 'movie'], ['Tendances séries', '/trending/tv/week', 'tv'], ['Films populaires', '/movie/popular', 'movie'], ['Séries populaires', '/tv/popular', 'tv']],
    movies: [['Tendances', '/trending/movie/week', 'movie'], ['Populaires', '/movie/popular', 'movie'], ['Les mieux notés', '/movie/top_rated', 'movie'], ['Au cinéma', '/movie/now_playing', 'movie']],
    series: [['Tendances', '/trending/tv/week', 'tv'], ['Populaires', '/tv/popular', 'tv'], ['Les mieux notées', '/tv/top_rated', 'tv'], ['Diffusées aujourd’hui', '/tv/airing_today', 'tv']]
  };

  function browse(kind) {
    var root = el('div', 'screen browse'), sc = el('div', 'scroll');
    root.appendChild(sc);
    var scr = { name: kind, el: root, onClose: function () { scr.dead = true; } };

    var hero = el('div', 'hero');
    hero.appendChild(el('div', 'g1')); hero.appendChild(el('div', 'g2'));
    var info = el('div', 'hero-info');
    info.style.display = 'none';
    var kick = el('div', 'kicker', 'TENDANCE'), ht = el('div', 'h-title'), hm = el('div', 'h-meta'), ho = el('div', 'h-over');
    var hb = el('div', 'h-btns'), hbtn = el('div', 'btn f', 'Voir la fiche');
    hbtn.setAttribute('data-top', '1');
    hb.appendChild(hbtn);
    info.appendChild(kick); info.appendChild(ht); info.appendChild(hm); info.appendChild(ho); info.appendChild(hb);
    hero.appendChild(info);
    sc.appendChild(hero);
    var heroDone = false;

    function addRow(title, hs, prefix) { var w = el('div', 'rowwrap'); w.appendChild(el('div', 'row-title', title)); w.appendChild(hs); sc.appendChild(w); return w; }

    if (kind === 'home') {
      var pl = progList();
      if (pl.length) {
        var hs0 = el('div', 'hs');
        each(pl.slice(0, 20), function (p) {
          var label = p.type === 'tv' ? 'S' + p.s + ' E' + p.e : '';
          hs0.appendChild(makeCard({ type: p.type, id: p.id, title: p.title, poster: p.poster }, {
            prog: p.d ? p.t / p.d : 0, badge: label || undefined,
            act: function () { CT.play({ type: p.type, id: p.id, title: p.title, poster: p.poster, s: p.s, e: p.e, t: p.t }); }
          }));
        });
        addRow('Reprendre la lecture', hs0);
      }
    }

    each(ROWS[kind], function (def, idx) {
      var hs = el('div', 'hs'), wrap = addRow(def[0], hs);
      CT.tmdb(def[1], {}, function (err, d) {
        if (scr.dead) return;
        if (err || !d || !d.results) {
          wrap.style.display = 'none';
          if (!scr.errShown) {
            scr.errShown = true;
            var msg = err && err.nokey ? 'Ajoute ta clé TMDB dans Réglages.' : 'TMDB injoignable' + (err && err.status ? ' (code ' + err.status + ')' : '') + '. Vérifie la clé TMDB dans Réglages et ta connexion.';
            CT.toast(msg, 6000);
          }
          return;
        }
        var items = d.results.slice(0, 20);
        each(items, function (it) { hs.appendChild(makeCard(norm(it, def[2]))); });
        if (!heroDone) {
          for (var i = 0; i < items.length; i++) {
            if (items[i].backdrop_path) {
              var n = norm(items[i], def[2]);
              heroDone = true;
              hero.style.backgroundImage = 'url(' + n.backdrop + ')';
              ht.textContent = n.title;
              hm.textContent = [n.type === 'tv' ? 'Série' : 'Film', n.year, n.vote ? '★ ' + n.vote.toFixed(1) : ''].filter(function (x) { return x; }).join('  ·  ');
              ho.textContent = n.overview;
              hbtn.act = function () { CT.openDetail(n.type, n.id); };
              info.style.display = 'block';
              break;
            }
          }
        }
        ensureFocus(scr);
      });
    });
    return scr;
  }

  /* ---------- clavier à l'écran ---------- */
  function makeKeyboard(o) {
    var kb = el('div', 'kb'), shift = false, letters = [];
    function row(chars) {
      var r = el('div', 'krow');
      each(chars.split(''), function (ch) {
        var k = el('div', 'key f', ch);
        k.act = function () { o.onChar(shift ? ch.toUpperCase() : ch); };
        if (/[a-z]/.test(ch)) letters.push({ k: k, ch: ch });
        r.appendChild(k);
      });
      kb.appendChild(r);
    }
    row('1234567890'); row('azertyuiop'); row('qsdfghjklm'); row('wxcvbn-_.');
    var r5 = el('div', 'krow');
    var kShift = el('div', 'key f w2', 'Maj'), kSp = el('div', 'key f w4', 'Espace'), kBk = el('div', 'key f w2', 'Suppr'), kCl = el('div', 'key f w2', 'Effacer');
    kShift.act = function () {
      shift = !shift;
      each(letters, function (l) { l.k.textContent = shift ? l.ch.toUpperCase() : l.ch; });
      kShift.textContent = shift ? 'MAJ' : 'Maj';
    };
    kSp.act = function () { o.onChar(' '); };
    kBk.act = o.onBack; kCl.act = o.onClear;
    r5.appendChild(kShift); r5.appendChild(kSp); r5.appendChild(kBk); r5.appendChild(kCl);
    kb.appendChild(r5);
    return kb;
  }

  function fieldHtml(f, text, ph, mask) {
    f.innerHTML = '';
    if (!text) f.appendChild(el('span', 'ph', ph));
    else f.appendChild(document.createTextNode(text));
    f.appendChild(el('span', 'cur'));
  }

  /* ---------- recherche ---------- */
  function searchTab() {
    var root = el('div', 'screen');
    var scr = { name: 'search', el: root, onClose: function () { scr.dead = true; clearTimeout(timer); } };
    var left = el('div', 's-left');
    left.appendChild(el('div', 's-title', 'Rechercher'));
    var field = el('div', 's-field');
    left.appendChild(field);
    var q = '', timer = null, reqId = 0;
    function upd() { fieldHtml(field, q, 'Titre, ID TMDB ou IMDb (tt…)'); }
    function change() { upd(); clearTimeout(timer); timer = setTimeout(run, 500); }
    if (CT.hasNative()) {
      field.className = 's-field f';
      field.setAttribute('data-top', '1');
      field.act = function () { CT.nativeText('Rechercher', q, function (v) { q = v.slice(0, 80); change(); }); };
      left.appendChild(el('div', 's-hint', 'Appuie sur OK pour ouvrir le clavier de ta Fire TV / Android TV'));
    } else left.appendChild(makeKeyboard({
      onChar: function (c) { if (q.length < 60) { q += c; change(); } },
      onBack: function () { q = q.slice(0, -1); change(); },
      onClear: function () { q = ''; change(); }
    }));
    var pbtn = el('div', 'btn f', 'Saisir avec le téléphone');
    pbtn.style.marginTop = '8px';
    pbtn.act = function () { CT.phoneInput('search', function (v) { q = v.slice(0, 80); change(); return true; }); };
    left.appendChild(pbtn);
    root.appendChild(left);

    var right = el('div', 's-right vs');
    var count = el('div', 's-count', ''), grid = el('div', 'grid');
    right.appendChild(count); right.appendChild(grid);
    root.appendChild(right);
    upd();

    function show(res, label, my) {
      if (scr.dead || my !== reqId) return;
      grid.innerHTML = '';
      count.textContent = res.length ? label + res.length + ' résultat' + (res.length > 1 ? 's' : '') : 'Aucun résultat';
      each(res.slice(0, 40), function (it) {
        var n = norm(it, it.media_type);
        n.title = n.title + (n.year ? ' (' + n.year + ')' : '');
        grid.appendChild(makeCard(n, { badge: n.type === 'tv' ? 'Série' : 'Film' }));
      });
    }
    function fail(err, my) {
      if (scr.dead || my !== reqId) return;
      count.textContent = err && err.nokey ? 'Ajoute ta clé TMDB dans Réglages.' : 'Recherche impossible (' + (err && err.status !== undefined ? 'code ' + err.status : 'erreur') + ')';
    }
    function run() {
      var my = ++reqId, raw = q.replace(/^\s+|\s+$/g, '');
      grid.innerHTML = '';
      if (raw.length < 1 || (raw.length < 2 && !/^\d$/.test(raw))) { count.textContent = ''; return; }
      count.textContent = 'Recherche…';
      var m;
      /* IMDb : tt1234567 */
      if (/^tt\d{5,}$/i.test(raw)) {
        CT.tmdb('/find/' + raw.toLowerCase(), { external_source: 'imdb_id' }, function (err, d) {
          if (err || !d) return fail(err, my);
          var res = [];
          each(d.movie_results || [], function (x) { x.media_type = 'movie'; res.push(x); });
          each(d.tv_results || [], function (x) { x.media_type = 'tv'; res.push(x); });
          show(res, 'IMDb ' + raw.toLowerCase() + ' : ', my);
        });
        return;
      }
      /* ID TMDB : que des chiffres, on essaie film ET série */
      if (/^\d{1,9}$/.test(raw)) {
        var res2 = [], pend = 2, nokey = false;
        var fin = function () {
          if (--pend > 0) return;
          if (nokey) return fail({ nokey: true }, my);
          show(res2, 'ID TMDB ' + raw + ' : ', my);
        };
        each(['movie', 'tv'], function (t) {
          CT.tmdb('/' + t + '/' + raw, {}, function (err, d) {
            if (err && err.nokey) nokey = true;
            if (!err && d && d.id) { d.media_type = t; res2.push(d); }
            fin();
          });
        });
        return;
      }
      /* titre, avec année facultative à la fin : « under the sun 2014 » */
      var title = raw, year = '';
      m = raw.match(/^(.*\S)\s+((?:19|20)\d{2})$/);
      if (m) { title = m[1]; year = m[2]; }
      var pm = { query: title, include_adult: 'false' }, pt = { query: title, include_adult: 'false' };
      if (year) { pm.year = year; pt.first_air_date_year = year; }
      var all = [], pend2 = 2, lastErr = null;
      var fin2 = function () {
        if (--pend2 > 0) return;
        if (!all.length && lastErr) return fail(lastErr, my);
        all.sort(function (a, b) { return (b.popularity || 0) - (a.popularity || 0); });
        show(all, '', my);
      };
      CT.tmdb('/search/movie', pm, function (err, d) { if (err) lastErr = err; else each(d.results || [], function (x) { x.media_type = 'movie'; all.push(x); }); fin2(); });
      CT.tmdb('/search/tv', pt, function (err, d) { if (err) lastErr = err; else each(d.results || [], function (x) { x.media_type = 'tv'; all.push(x); }); fin2(); });
    }
    return scr;
  }

  /* ---------- ma liste ---------- */
  function listTab() {
    var root = el('div', 'screen vs');
    var scr = { name: 'list', el: root, onClose: function () { scr.dead = true; } };
    var l = CT.store.get('list', []);
    if (!l.length) { root.appendChild(el('div', 'empty', 'Ta liste est vide. Ajoute des titres depuis leur fiche.')); return scr; }
    var g = el('div', 'grid list-grid');
    g.style.padding = '160px 0 40px 80px';
    each(l, function (x) { g.appendChild(makeCard({ type: x.type, id: x.id, title: x.title, poster: x.poster })); });
    root.appendChild(g);
    return scr;
  }

  /* ---------- fiche ---------- */
  CT.openDetail = function (type, id) {
    var s = el('div', 'screen detail vs');
    var loading = el('div', 'empty', 'Chargement…');
    s.appendChild(loading);
    var scr = { name: 'detail', el: s, onClose: function () { scr.dead = true; } };
    CT.push(scr);
    CT.tmdb('/' + type + '/' + id, { append_to_response: 'credits' }, function (err, d) {
      if (scr.dead) return;
      s.removeChild(loading);
      if (err || !d) { s.appendChild(el('div', 'empty', 'Fiche indisponible.')); return; }
      render(s, scr, type, id, d);
    });
  };

  function render(s, scr, type, id, d) {
    var n = norm(d, type);
    var bg = el('div', 'd-bg');
    if (n.backdrop) bg.style.backgroundImage = 'url(' + n.backdrop + ')';
    s.appendChild(bg); s.appendChild(el('div', 'd-g1')); s.appendChild(el('div', 'd-g2'));
    var main = el('div', 'd-main');
    var poster = el('div', 'd-poster');
    if (n.poster) poster.style.backgroundImage = 'url(' + (d.poster_path ? CT.imgUrl(d.poster_path, 'w500') : n.poster) + ')';
    main.appendChild(poster);
    var info = el('div', 'd-info');
    info.appendChild(el('div', 'd-title', n.title));
    var meta = [];
    if (n.year) meta.push(n.year);
    if (type === 'movie' && d.runtime) meta.push(Math.floor(d.runtime / 60) + ' h ' + (d.runtime % 60 < 10 ? '0' : '') + (d.runtime % 60));
    if (type === 'tv' && d.number_of_seasons) meta.push(d.number_of_seasons + ' saison' + (d.number_of_seasons > 1 ? 's' : ''));
    var gn = []; each(d.genres || [], function (g) { gn.push(g.name); });
    if (gn.length) meta.push(gn.slice(0, 3).join(', '));
    if (n.vote) meta.push('★ ' + n.vote.toFixed(1));
    info.appendChild(el('div', 'd-meta', meta.join('  ·  ')));
    info.appendChild(el('div', 'd-over', n.overview || 'Pas de résumé disponible.'));
    var cast = []; each(((d.credits && d.credits.cast) || []).slice(0, 6), function (c) { cast.push(c.name); });
    if (cast.length) info.appendChild(el('div', 'd-cast', 'Avec : ' + cast.join(', ')));

    var prog = CT.getProg(type, id);
    var sel = { s: 1, e: 1 }, seasons = [];
    if (type === 'tv') {
      each(d.seasons || [], function (x) { if (x.season_number > 0 && x.episode_count > 0) seasons.push(x.season_number); });
      if (!seasons.length) seasons = [1];
      sel.s = seasons[0];
      if (prog) { sel.s = prog.s; sel.e = prog.e; }
    }
    var btns = el('div', 'd-btns');
    var label = 'Lecture';
    if (type === 'movie' && prog && prog.t > 30) label = 'Reprendre à ' + CT.fmt(prog.t);
    if (type === 'tv') label = prog ? 'Reprendre S' + prog.s + ' E' + prog.e : 'Lecture S' + sel.s + ' E1';
    var pb = el('div', 'btn f', label);
    pb.act = function () {
      CT.play({ type: type, id: id, title: n.title, poster: n.poster, s: sel.s, e: sel.e, t: (prog && (type === 'movie' || (prog.s === sel.s && prog.e === sel.e))) ? prog.t : 0 });
    };
    var lb = el('div', 'btn f', inList(type, id) ? '− Ma liste' : '+ Ma liste');
    lb.act = function () { var on = toggleList(n); lb.textContent = on ? '− Ma liste' : '+ Ma liste'; CT.toast(on ? 'Ajouté à Ma liste' : 'Retiré de Ma liste', 1800); };
    btns.appendChild(pb); btns.appendChild(lb);
    info.appendChild(btns);
    main.appendChild(info);
    s.appendChild(main);
    CT.setFocus(pb);

    if (type === 'tv') {
      var sbar = el('div', 'd-seasons hs'), eps = el('div', 'd-eps hs');
      s.appendChild(sbar); s.appendChild(eps);
      var chips = [];
      var loadSeason = function (num) {
        sel.s = num;
        each(chips, function (c) { if (c.num === num) c.el.classList.add('on'); else c.el.classList.remove('on'); });
        eps.innerHTML = ''; eps.scrollLeft = 0;
        CT.tmdb('/tv/' + id + '/season/' + num, {}, function (err, sd) {
          if (scr.dead || sel.s !== num) return;
          if (err || !sd) { eps.appendChild(el('div', 'pmsg', 'Épisodes indisponibles.')); return; }
          each(sd.episodes || [], function (ep) {
            var c = el('div', 'ep f'), st = el('div', 'still');
            if (ep.still_path) st.style.backgroundImage = 'url(' + CT.imgUrl(ep.still_path, 'w300') + ')';
            st.appendChild(el('div', 'badge', 'E' + ep.episode_number));
            if (prog && prog.s === num && prog.e === ep.episode_number && prog.d) {
              st.appendChild(el('div', 'pbar-bg'));
              var pbr = el('div', 'pbar'); pbr.style.width = Math.max(3, Math.round(prog.t / prog.d * 100)) + '%'; st.appendChild(pbr);
            }
            c.appendChild(st);
            c.appendChild(el('div', 'et', ep.name || ('Épisode ' + ep.episode_number)));
            c.act = function () {
              sel.s = num; sel.e = ep.episode_number;
              CT.play({ type: 'tv', id: id, title: n.title, poster: n.poster, s: num, e: ep.episode_number, t: (prog && prog.s === num && prog.e === ep.episode_number) ? prog.t : 0 });
            };
            eps.appendChild(c);
          });
        });
      };
      each(seasons, function (num) {
        var c = el('div', 'chip f', 'Saison ' + num);
        c.act = function () { loadSeason(num); };
        chips.push({ num: num, el: c });
        sbar.appendChild(c);
      });
      loadSeason(sel.s);
    }
  }

  /* ---------- réglages ---------- */
  function textEntry(o) {
    if (CT.hasNative()) { CT.nativeText(o.title, o.value || '', function (v) { o.onOk(v); }); return; }
    var root = el('div', 'screen');
    var scr = { name: 'entry', el: root };
    var box = el('div', 'entry'), val = o.value || '';
    box.appendChild(el('div', 's-title', o.title));
    var field = el('div', 's-field'); box.appendChild(field);
    function upd() { fieldHtml(field, val, o.hint || ''); }
    upd();
    box.appendChild(makeKeyboard({
      onChar: function (c) { if (val.length < 120) { val += c; upd(); } },
      onBack: function () { val = val.slice(0, -1); upd(); },
      onClear: function () { val = ''; upd(); }
    }));
    var row = el('div', 'krow');
    row.style.marginTop = '14px';
    var ok = el('div', 'btn f', 'Valider'), no = el('div', 'btn f', 'Annuler');
    ok.act = function () { CT.pop(); o.onOk(val); };
    no.act = function () { CT.pop(); };
    row.appendChild(ok); row.appendChild(no);
    if (o.kind) {
      var ph = el('div', 'btn f', 'Saisir avec le téléphone');
      ph.act = function () { CT.phoneInput(o.kind, function (v) { val = v.replace(/\s/g, '').slice(0, 120); upd(); return true; }); };
      row.appendChild(ph);
    }
    box.appendChild(row);
    root.appendChild(box);
    CT.push(scr);
  }

  function diag() {
    var root = el('div', 'screen');
    var d = el('div', 'diag');
    d.textContent = 'CineTV ' + CT.version + '\n' + CT.getLog().join('\n') + '\n\n(Retour pour quitter)';
    root.appendChild(d);
    CT.push({ name: 'diag', el: root });
  }

  function settingsTab() {
    var root = el('div', 'screen');
    var scr = { name: 'settings', el: root, onClose: function () { scr.dead = true; } };
    var box = el('div', 'set-in');
    root.appendChild(box);
    function mask(k) { return k ? '•••• ' + k.slice(-4) : 'Non définie'; }
    function cycle(key, opts, def) {
      var cur = CT.cfg(key, def), i = 0;
      each(opts, function (o, ix) { if (o[0] === cur) i = ix; });
      var nx = opts[(i + 1) % opts.length];
      CT.setCfg(key, nx[0]);
    }
    function labelOf(key, opts, def) { var cur = CT.cfg(key, def), l = String(cur); each(opts, function (o) { if (o[0] === cur) l = o[1]; }); return l; }
    var LANGS = [['FR', 'Français'], ['EN', 'Anglais'], ['ES', 'Espagnol'], ['DE', 'Allemand'], ['IT', 'Italien'], ['PT', 'Portugais']];
    var SIZES = [[36, 'Petite'], [44, 'Moyenne'], [56, 'Grande']];
    var QUAL = [['auto', 'Auto'], ['1080', '1080p'], ['720', '720p'], ['480', '480p']];
    function build() {
      var keep = CT.getFocus() && CT.getFocus()._idx;
      box.innerHTML = '';
      box.appendChild(el('h1', '', 'Réglages'));
      var rows = [
        ['Clé TMDB', mask(CT.cfg('tmdb', '')), function () { textEntry({ kind: 'tmdb', title: 'Clé TMDB (API v3)', value: CT.cfg('tmdb', ''), hint: 'Colle ou tape ta clé', onOk: function (v) { CT.setCfg('tmdb', v.replace(/\s/g, '')); build(); } }); }],
        ['Clé SubDL', mask(CT.cfg('subdl', '')), function () { textEntry({ kind: 'subdl', title: 'Clé SubDL', value: CT.cfg('subdl', ''), hint: 'Colle ou tape ta clé', onOk: function (v) { CT.setCfg('subdl', v.replace(/\s/g, '')); build(); } }); }],
        ['Langue des sous-titres', labelOf('sublang', LANGS, 'FR'), function () { cycle('sublang', LANGS, 'FR'); build(); }],
        ['Taille des sous-titres', labelOf('subsize', SIZES, 44), function () { cycle('subsize', SIZES, 44); build(); }],
        ['Qualité préférée', labelOf('quality', QUAL, 'auto'), function () { cycle('quality', QUAL, 'auto'); build(); }],
        ['Diagnostic', '', diag],
        ['Version', CT.version, function () { }]
      ];
      if (window.CineTVApp && window.CineTVApp.update) {
        rows.splice(rows.length - 1, 0, ['Mettre à jour l\'appli Android', 'v' + (window.CineTVApp.version ? window.CineTVApp.version() : ''), function () { window.CineTVApp.update(); }]);
      }
      var focusEl = null;
      each(rows, function (r, i) {
        var d = el('div', 'srow f', r[0]); d._idx = i + 1;
        d.appendChild(el('span', 'v', r[1]));
        d.act = r[2];
        box.appendChild(d);
        if (keep && d._idx === keep) focusEl = d;
      });
      box.appendChild(el('div', 'note', 'Clés gratuites : TMDB (themoviedb.org > Réglages > API, clé « API v3 ») et SubDL (subdl.com > API). Elles restent sur ta TV.'));
      CT.setFocus(focusEl || CT.firstFocus(box));
    }
    build();
    return scr;
  }

  CT.tabs = {
    home: function () { return browse('home'); },
    movies: function () { return browse('movies'); },
    series: function () { return browse('series'); },
    search: searchTab,
    list: listTab,
    settings: settingsTab
  };
})();
