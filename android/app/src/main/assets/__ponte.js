/* Ponte do APK Builder: faz "baixar arquivo" e "imprimir" funcionarem dentro do APK.
   Entra sozinha no começo de cada página. Não precisa mexer. */
(function () {
  if (window.__ponteAPK || !window.AndroidBridge) return;
  window.__ponteAPK = 1;
  // 🎤 ditado: dentro do APK não existe o reconhecimento de voz do Chrome. Este faz o papel dele usando o do Android.
  if (window.AndroidVoz && !window.SpeechRecognition && !window.webkitSpeechRecognition) {
    var evento = function (t, fim) { var alt = { transcript: t, confidence: 1 }; var res = [alt]; res.isFinal = fim; res.item = function (k) { return res[k]; }; var lista = [res]; lista.item = function (k) { return lista[k]; }; return { resultIndex: 0, results: lista }; };
    var SR = function () { this.lang = 'pt-BR'; this.interimResults = false; this.continuous = false; this.maxAlternatives = 1; this.onresult = this.onerror = this.onend = this.onstart = null; this._ev = {}; };
    SR.prototype.addEventListener = function (n, f) { (this._ev[n] = this._ev[n] || []).push(f); };
    SR.prototype.removeEventListener = function (n, f) { var l = this._ev[n] || []; var i = l.indexOf(f); if (i >= 0) l.splice(i, 1); };
    SR.prototype._dar = function (n, e) { try { if (this['on' + n]) this['on' + n](e); } catch (x) {} var l = this._ev[n] || []; for (var i = 0; i < l.length; i++) try { l[i](e); } catch (x) {} };
    SR.prototype.start = function () {
      var me = this, fim = false;
      var acabar = function () { if (!fim) { fim = true; me._dar('end', {}); } };
      window.__vozParcial = function (t) { if (me.interimResults) me._dar('result', evento(t, false)); };
      window.__vozResultado = function (t) { if (t) me._dar('result', evento(t, true)); acabar(); };
      window.__vozErro = function (m) { me._dar('error', { error: /permiss/i.test(m) ? 'not-allowed' : (/ouvi/i.test(m) ? 'no-speech' : 'network'), message: m }); acabar(); };
      me._dar('start', {}); window.AndroidVoz.ouvir(me.lang || 'pt-BR');
    };
    SR.prototype.stop = SR.prototype.abort = function () { try { window.AndroidVoz.parar(); } catch (x) {} };
    window.SpeechRecognition = window.webkitSpeechRecognition = SR;
  }
  var B = window.AndroidBridge;
  var P = {
    salvar: function (b64, tipo, nome) { var r = B.salvar(nome, b64, tipo); if (r !== 'ok') B.aviso('Não consegui salvar: ' + r); },
    aviso: function (m) { B.aviso(String(m)); },
    erro: function (m) { try { console.error(m); } catch (e) {} }
  };
  var guardados = {};

  // Guarda o arquivo na hora em que a página cria o link (antes de ela apagar o link)
  var criar = URL.createObjectURL;
  URL.createObjectURL = function (o) {
    var u = criar.apply(URL, arguments);
    try { if (o instanceof Blob) guardados[u] = o; } catch (e) {}
    return u;
  };

  var EXT = { 'application/pdf': 'pdf', 'text/plain': 'txt', 'text/html': 'html', 'application/json': 'json',
    'text/csv': 'csv', 'application/zip': 'zip', 'image/png': 'png', 'image/jpeg': 'jpg', 'audio/mpeg': 'mp3',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/msword': 'doc', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx' };
  function mandar(blob, nome) {
    nome = nome || 'arquivo';
    var tipo = String(blob.type || '').split(';')[0];
    if (nome.indexOf('.') < 0 && EXT[tipo]) nome += '.' + EXT[tipo];
    var fr = new FileReader();
    fr.onload = function () {
      var s = String(fr.result);
      P.salvar(s.substring(s.indexOf(',') + 1), blob.type || 'application/octet-stream', nome || 'arquivo');
    };
    fr.onerror = function () { P.aviso('Não consegui ler o arquivo para salvar.'); };
    fr.readAsDataURL(blob);
  }

  function salvar(href, nome) {
    try {
      if (!href) return false;
      if (href.indexOf('data:') === 0) {
        var i = href.indexOf(',');
        var meta = href.substring(5, i);
        var dados = href.substring(i + 1);
        var b64 = meta.indexOf(';base64') >= 0
          ? dados
          : btoa(unescape(encodeURIComponent(decodeURIComponent(dados))));
        P.salvar(b64, meta.split(';')[0] || 'application/octet-stream', nome || 'arquivo');
        return true;
      }
      if (guardados[href]) { mandar(guardados[href], nome); return true; }
      if (href.indexOf('blob:') === 0 || href.indexOf(location.origin) === 0) {
        fetch(href).then(function (r) { return r.blob(); })
          .then(function (b) { mandar(b, nome || href.split('/').pop()); })
          .catch(function (e) { P.aviso('Não consegui baixar: ' + e); });
        return true;
      }
    } catch (e) { P.erro(String(e)); }
    return false;
  }
  window.__ponteSalvar = salvar;

  function nomeDe(a) {
    var n = a.getAttribute('download');
    return n || (a.href || '').split('/').pop().split('?')[0] || 'arquivo';
  }
  function local(h) { return h.indexOf('blob:') === 0 || h.indexOf('data:') === 0 || h.indexOf(location.origin) === 0; }

  // Link clicado pela pessoa
  document.addEventListener('click', function (ev) {
    var a = ev.target && ev.target.closest ? ev.target.closest('a[download]') : null;
    if (!a) return;
    var h = a.href || '';
    if (local(h) && salvar(h, nomeDe(a))) { ev.preventDefault(); ev.stopPropagation(); }
  }, true);

  // Link clicado pelo código (o jeito mais comum: a.click())
  var clicar = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    var h = this.href || '';
    if (this.hasAttribute('download') && local(h) && salvar(h, nomeDe(this))) return;
    return clicar.apply(this, arguments);
  };

  // window.open(blob) — alguns apps abrem o PDF numa aba nova
  var abrir = window.open;
  window.open = function (u) {
    var h = String(u || '');
    if (h.indexOf('blob:') === 0 || h.indexOf('data:') === 0) { if (salvar(h, 'arquivo')) return null; }
    return abrir.apply(window, arguments);
  };

  // Imprimir não existe dentro de WebView
  window.print = function () {
    P.aviso('Imprimir não funciona dentro do APK. Salve o arquivo (PDF/Word) e imprima a partir dele.');
  };
})();
