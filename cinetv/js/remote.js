/* CineTV remote : saisie depuis le téléphone (QR code + relais ntfy.sh). ES5 uniquement.
   La TV écoute un canal aléatoire ; la page phone.html y envoie le texte saisi sur le téléphone. */
(function () {
  'use strict';
  var W = window, CT = W.CT, el = CT.el, each = CT.each;
  var RELAY = 'https://ntfy.sh/';
  var PAGE = 'https://nuevotv.github.io/cinetv/phone.html';

  function rnd(n) {
    var c = 'abcdefghjkmnpqrstuvwxyz23456789', s = '', i;
    try {
      var a = new Uint8Array(n); (W.crypto || W.msCrypto).getRandomValues(a);
      for (i = 0; i < n; i++) s += c.charAt(a[i] % c.length);
    } catch (e) { s = ''; for (i = 0; i < n; i++) s += c.charAt(Math.floor(Math.random() * c.length)); }
    return s;
  }

  function drawQr(url) {
    var cv = document.createElement('canvas');
    try {
      var qr = W.qrcode(0, 'M'); qr.addData(url); qr.make();
      var n = qr.getModuleCount(), cell = Math.floor(400 / (n + 4)), size = cell * (n + 4);
      cv.width = size; cv.height = size;
      var g = cv.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, size, size);
      g.fillStyle = '#000';
      for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (qr.isDark(r, c)) g.fillRect((c + 2) * cell, (r + 2) * cell, cell, cell);
    } catch (e) { CT.log('QR: ' + e); }
    return cv;
  }

  /* kind : 'search' | 'tmdb' | 'subdl' ; onText(texte) -> renvoie true pour fermer la fenêtre */
  CT.phoneInput = function (kind, onText) {
    var code = rnd(10), topic = 'cinetv-' + code, url = PAGE + '?c=' + code + '&k=' + kind;
    var titles = { search: 'Recherche', tmdb: 'Clé TMDB', subdl: 'Clé SubDL' };
    var m = el('div', 'phone');
    m.appendChild(el('div', 'ph-title', 'Saisie depuis ton téléphone – ' + (titles[kind] || '')));
    var qrBox = el('div', 'ph-qr'); qrBox.appendChild(drawQr(url)); m.appendChild(qrBox);
    var side = el('div', 'ph-side');
    side.appendChild(el('div', 'ph-step', '1. Scanne le QR code avec ton téléphone'));
    side.appendChild(el('div', 'ph-step', '2. Écris le texte, puis touche « Envoyer »'));
    side.appendChild(el('div', 'ph-small', 'Pas de QR ? Ouvre nuevotv.github.io/cinetv/phone.html et entre le code :'));
    side.appendChild(el('div', 'ph-code', code.toUpperCase()));
    var status = el('div', 'ph-status', 'En attente du téléphone…');
    side.appendChild(status);
    var close = el('div', 'btn f', 'Fermer');
    side.appendChild(close);
    m.appendChild(side);
    document.getElementById('app').appendChild(m);

    var es = null, pollT = null, seen = {}, closed = false, errs = 0;
    function shutdown() {
      if (closed) return; closed = true;
      try { if (es) es.close(); } catch (e) { }
      clearTimeout(pollT);
      if (m.parentNode) m.parentNode.removeChild(m);
      CT.setPanel(null); CT.onPanelBack = null; CT.panelOpen = false;
      var t = CT.top();
      CT.setFocus(t && t.focus && t.focus.offsetWidth > 0 ? t.focus : (t ? CT.firstFocus(t.el) : null));
    }
    function handle(j) {
      if (!j || j.event !== 'message' || seen[j.id]) return;
      seen[j.id] = 1;
      var d; try { d = JSON.parse(j.message); } catch (e) { return; }
      if (!d || typeof d.v !== 'string') return;
      CT.log('relais: texte reçu (' + d.v.length + ' car.)');
      status.textContent = 'Reçu ✓';
      if (onText(d.v)) shutdown();
    }
    function poll() {
      if (closed) return;
      CT.http(RELAY + topic + '/json?poll=1&since=all', { timeout: 8000 }, function (err, txt) {
        if (closed) return;
        if (!err && txt) each(txt.split('\n'), function (l) { if (l) { try { handle(JSON.parse(l)); } catch (e) { } } });
        pollT = setTimeout(poll, 5000);
      });
    }
    try {
      if (!W.EventSource) throw new Error('pas de SSE');
      es = new W.EventSource(RELAY + topic + '/sse');
      es.onmessage = function (ev) { errs = 0; try { handle(JSON.parse(ev.data)); } catch (e) { } };
      es.onerror = function () {
        errs++; CT.log('relais SSE erreur ' + errs);
        if (errs >= 3) { try { es.close(); } catch (e) { } es = null; status.textContent = 'En attente du téléphone… (mode lent)'; poll(); }
      };
    } catch (e) { poll(); }

    close.act = shutdown;
    CT.setPanel(m); CT.panelOpen = true; CT.onPanelBack = shutdown;
    CT.setFocus(close);
  };
})();
