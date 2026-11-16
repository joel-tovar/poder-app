/* PODER · puente de la app del celular.
   El tablero fue hecho como artefacto de Claude (window.claude.use('db') y use('mcp')). Aquí ese mismo idioma habla con el
   servidor propio en Cloudflare: base D1, TickTick (tus hábitos) y Dropi (entregados, leídos cada 15 min sin gastar cupo).
   Además: clave de acceso, notificaciones push de entregas con campanita suave y resincronización al volver a la app. */
(function () {
  var API = 'https://poder-app.chatea-cron.workers.dev';
  var LS = 'poder-clave';

  /* ---------- clave (una sola vez por teléfono) ---------- */
  function leerLS() { try { return localStorage.getItem(LS) || ''; } catch (e) { return ''; } }
  function guardarLS(v) { try { localStorage.setItem(LS, v); } catch (e) {} }
  var m = /[#&]k=([A-Za-z0-9_-]{10,})/.exec(location.hash);
  if (m) { guardarLS(m[1]); history.replaceState(null, '', location.pathname + location.search); }
  var claveP = new Promise(function (ok) {
    var k = leerLS();
    if (k) return ok(k);
    document.addEventListener('DOMContentLoaded', function () {
      var v = document.createElement('div');
      v.className = 'pa-clave';
      v.innerHTML = '<form><p class="pa-t">PODER</p><p class="pa-s">Pega tu clave de acceso (viene en el link de instalación).</p>' +
        '<input name="k" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="clave" aria-label="Clave de acceso">' +
        '<button type="submit">Entrar</button><p class="pa-e" role="alert"></p></form>';
      document.body.appendChild(v);
      v.querySelector('form').addEventListener('submit', function (ev) {
        ev.preventDefault();
        var val = v.querySelector('input').value.trim().replace(/^.*[#&]k=/, '');
        fetch(API + '/api/estado', { headers: { 'X-Poder-Clave': val } }).then(function (r) {
          if (!r.ok) { v.querySelector('.pa-e').textContent = 'Esa clave no abre. Revisa el link.'; return; }
          guardarLS(val); v.remove(); ok(val);
        }, function () { v.querySelector('.pa-e').textContent = 'Sin internet. Intenta otra vez.'; });
      });
    });
  });

  function api(ruta, op) {
    return claveP.then(function (k) {
      op = op || {};
      op.headers = Object.assign({ 'X-Poder-Clave': k }, op.body ? { 'Content-Type': 'application/json' } : {}, op.headers || {});
      op.cache = 'no-store';
      return fetch(API + ruta, op).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (r.status === 401) { try { localStorage.removeItem(LS); } catch (e) {} location.reload(); }
          if (!r.ok) throw { code: j.code || 'server_unavailable', message: j.message || j.error || ('HTTP ' + r.status) };
          return j;
        });
      }, function () { throw { code: 'server_unavailable', message: 'sin conexión' }; });
    });
  }

  /* ---------- db: misma forma que window.claude.use('db') ---------- */
  var docs = new Map(), cargando = null;
  var copia = function (v) { return v == null ? v : JSON.parse(JSON.stringify(v)); };
  var coll = function (p) { return p.slice(0, p.lastIndexOf('/')); };
  var idDe = function (p) { return p.slice(p.lastIndexOf('/') + 1); };
  function traer() { return api('/api/docs').then(function (j) { docs.clear(); j.docs.forEach(function (d) { docs.set(d.path, d.data); }); }); }
  function primera() { if (!cargando) cargando = traer().catch(function (e) { cargando = null; throw e; }); return cargando; }
  function snapDoc(p) { return { id: idDe(p), exists: docs.has(p), data: function () { return copia(docs.get(p)); } }; }
  function refDoc(p) {
    return {
      id: idDe(p), path: p,
      get: function () { return primera().then(function () { return snapDoc(p); }); },
      set: function (data, opt) {
        var v = opt && opt.merge ? Object.assign({}, docs.get(p) || {}, data) : data;
        docs.set(p, copia(v));
        return api('/api/doc?path=' + encodeURIComponent(p), { method: 'PUT', body: JSON.stringify(v) });
      },
      update: function (data) { return this.set(data, { merge: true }); },
      delete: function () { docs.delete(p); return api('/api/doc?path=' + encodeURIComponent(p), { method: 'DELETE' }); }
    };
  }
  function refCol(c, lim, campo, dir) {
    var q = {
      limit: function (n) { return refCol(c, n, campo, dir); },
      orderBy: function (f, d) { return refCol(c, lim, f, d); },
      where: function () { return q; },
      doc: function (id) { return refDoc(c + '/' + id); },
      get: function () {
        return primera().then(function () {
          var l = Array.from(docs.keys()).filter(function (p) { return coll(p) === c; });
          l.sort(function (a, b) {
            var va = campo ? (docs.get(a) || {})[campo] : a, vb = campo ? (docs.get(b) || {})[campo] : b;
            return (va > vb ? 1 : va < vb ? -1 : 0) * (dir === 'desc' ? -1 : 1);
          });
          var d = l.slice(0, lim || 1e5).map(snapDoc);
          return { docs: d, size: d.length, empty: !d.length, forEach: function (f) { d.forEach(f); } };
        });
      }
    };
    return q;
  }
  var db = { doc: refDoc, collection: function (c) { return refCol(c); } };

  /* ---------- mcp: TickTick y Dropi por el servidor ---------- */
  var mcp = {
    callTool: function (server, tool, args) {
      return api('/api/mcp', { method: 'POST', body: JSON.stringify({ server: server, tool: tool, args: args || {} }) })
        .then(function (j) { return { payload: j.payload }; });
    }
  };

  window.claude = window.claude || {};
  window.claude.use = function (n) { return Promise.resolve(n === 'db' ? db : n === 'mcp' ? mcp : null); };
  window.claude.poderApp = true;

  /* ---------- campanita: tranquila pero se nota (WebAudio, sin archivos) ---------- */
  var actx = null;
  function campana() {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      var t = actx.currentTime, sal = actx.createGain();
      sal.gain.value = 0.55; sal.connect(actx.destination);
      [[659.25, 0], [987.77, 0.16], [1318.5, 0.32]].forEach(function (n) {
        [1, 2.01].forEach(function (arm, i) {
          var o = actx.createOscillator(), g = actx.createGain();
          o.type = 'sine'; o.frequency.value = n[0] * arm;
          g.gain.setValueAtTime(0.0001, t + n[1]);
          g.gain.exponentialRampToValueAtTime(i ? 0.06 : 0.35, t + n[1] + 0.015);
          g.gain.exponentialRampToValueAtTime(0.0001, t + n[1] + 1.6);
          o.connect(g); g.connect(sal); o.start(t + n[1]); o.stop(t + n[1] + 1.7);
        });
      });
    } catch (e) {}
  }
  window.poderCampana = campana;

  /* ---------- service worker, push y resincronización ---------- */
  var esIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var instalada = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  var reg = null;

  function b64aBytes(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/'); s += '='.repeat((4 - s.length % 4) % 4);
    var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u;
  }
  function aviso(t) {
    var a = document.getElementById('aviso'); if (!a) return;
    a.textContent = t; a.classList.add('on'); clearTimeout(aviso.t); aviso.t = setTimeout(function () { a.classList.remove('on'); }, 4200);
  }
  function activarAvisos(boton) {
    if (esIOS && !instalada) { aviso('Primero instálala: Compartir → «Agregar a inicio». Luego abre PODER desde el ícono.'); return; }
    if (!('Notification' in window) || !reg || !reg.pushManager) { aviso('Este navegador no permite notificaciones.'); return; }
    campana(); // desbloquea el audio con el toque
    Notification.requestPermission().then(function (p) {
      if (p !== 'granted') { aviso('Sin permiso de notificaciones. Actívalo en Ajustes → Notificaciones → PODER.'); return; }
      return fetch(API + '/api/vapid').then(function (r) { return r.json(); }).then(function (v) {
        return reg.pushManager.getSubscription().then(function (s) {
          return s || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64aBytes(v.pub) });
        });
      }).then(function (sub) {
        return api('/api/push/sub', { method: 'POST', body: JSON.stringify(sub.toJSON()) });
      }).then(function () {
        boton.hidden = true;
        return api('/api/push/prueba', { method: 'POST' });
      }).then(function () { aviso('Listo: te aviso cada entrega de Dropi.'); });
    }).catch(function (e) { aviso('No se pudo activar: ' + (e && e.message || e)); });
  }
  function pintarBoton() {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'pa-campana'; b.hidden = true;
    b.innerHTML = '<span aria-hidden="true">🔔</span> Avisarme cada entrega';
    b.addEventListener('click', function () { activarAvisos(b); });
    document.body.appendChild(b);
    var revisar = function () {
      var velo = document.getElementById('velo');
      if (velo && velo.classList.contains('on')) { setTimeout(revisar, 1500); return; } // no tapar la apertura
      if (!reg || !reg.pushManager) { b.hidden = !(esIOS && !instalada); return; }
      reg.pushManager.getSubscription().then(function (s) {
        var ok = s && Notification.permission === 'granted';
        b.hidden = !!ok;
        if (ok) api('/api/push/sub', { method: 'POST', body: JSON.stringify(s.toJSON()) }).catch(function () {});
      });
    };
    setTimeout(revisar, 2500);
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(function (r) { reg = r; }).catch(function () {});
    navigator.serviceWorker.addEventListener('message', function (ev) {
      if (ev.data && ev.data.tipo === 'entrega') { campana(); setTimeout(resync, 400); }
    });
  }

  var ultimo = Date.now();
  function clic(id) { var b = document.getElementById(id); if (b && !b.disabled) b.click(); }
  function resync() { ultimo = Date.now(); clic('btn-tt'); setTimeout(function () { clic('btn-dropi'); }, 600); }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && Date.now() - ultimo > 60000) resync();
  });
  setInterval(function () { if (document.visibilityState === 'visible' && Date.now() - ultimo > 5 * 60000) resync(); }, 30000);

  document.addEventListener('DOMContentLoaded', pintarBoton);
})();
