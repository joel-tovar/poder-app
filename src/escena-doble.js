/* PODER · doble de Escena. Solo se activa si window.Escena no existe (escena.js ausente o falló al cargar).
   Misma API del contrato §3; pinta algo mínimo en 2D y resuelve en los tiempos indicados. */
(function () {
  "use strict";
  if (window.Escena) return;

  var COLORES_AURA = ["#7A4A1E", "#B8651F", "#E08A2E", "#F2B33D", "#FFD166", "#FFE48A", "#FFF1B8", "#FFF8DC", "#FFFCEF", "#FFFFFF"];
  var COLORES_HAB = { leer: "#4FD8E8", escribir: "#FFD166", meditar: "#8B7BFF", ayuno: "#FF6FD8", dormir: "#4E7BFF" };
  var ORDEN = ["leer", "escribir", "meditar", "ayuno", "dormir"];

  var cv = null, ctx = null, reducido = false, ro = null;
  var estado = { rangoIdx: 0, progresoRango: 0, habitos: {}, perfecto: false, entregasSemana: 0 };
  var destello = 0, destelloColor = "#FFFFFF", aperturaCorte = null, timers = [];

  function espera(ms, fn) {
    var t = setTimeout(fn, ms);
    timers.push(t);
    return t;
  }

  function dibujar() {
    if (!ctx || !cv) return;
    var w = cv.width, h = cv.height;
    if (!w || !h) return;
    ctx.clearRect(0, 0, w, h);
    var cx = w / 2, cy = h * 0.5, u = Math.min(w, h * 1.1) / 10;
    var aura = COLORES_AURA[Math.max(0, Math.min(9, estado.rangoIdx | 0))];
    var g = ctx.createRadialGradient(cx, cy, u * 0.5, cx, cy, u * (3.2 + (estado.perfecto ? 1.2 : 0) + destello * 1.5));
    g.addColorStop(0, aura);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalAlpha = 0.28 + destello * 0.4;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
    ORDEN.forEach(function (k, i) {
      var on = estado.habitos && estado.habitos[k];
      var y = cy - u * 1.6 + i * u * 0.7;
      ctx.strokeStyle = on ? COLORES_HAB[k] : "rgba(151,160,191,.25)";
      ctx.lineWidth = Math.max(2, u * 0.12);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(cx - u * 0.9, y); ctx.lineTo(cx - u * (2.6 - i * 0.12), y - u * 0.5);
      ctx.moveTo(cx + u * 0.9, y); ctx.lineTo(cx + u * (2.6 - i * 0.12), y - u * 0.5);
      ctx.stroke();
    });
    ctx.fillStyle = "rgba(238,241,250,.9)";
    ctx.beginPath(); ctx.arc(cx, cy - u * 1.9, u * 0.45, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(cx - u * 0.45, cy - u * 1.4, u * 0.9, u * 2.2);
    ctx.fillStyle = "#4FB8FF"; ctx.fillRect(cx - u * 0.28, cy - u * 1.95, u * 0.16, u * 0.1);
    ctx.fillStyle = "#FF3B4E"; ctx.fillRect(cx + u * 0.12, cy - u * 1.95, u * 0.16, u * 0.1);
    if (destello > 0.02) {
      ctx.globalAlpha = Math.min(0.6, destello);
      ctx.fillStyle = destelloColor;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }
  }

  function ajustar() {
    if (!cv) return;
    var r = cv.getBoundingClientRect();
    var d = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.max(1, Math.round(r.width * d));
    cv.height = Math.max(1, Math.round(r.height * d));
    dibujar();
  }

  function pulso(color, ms) {
    destelloColor = color || "#FFFFFF";
    destello = 1;
    var t0 = Date.now();
    (function paso() {
      var k = Math.min(1, (Date.now() - t0) / ms);
      destello = 1 - k;
      dibujar();
      if (k < 1) setTimeout(paso, 40);
    })();
  }

  function resolverEn(ms, fn) {
    return new Promise(function (ok) {
      espera(ms, function () { if (fn) fn(); ok(); });
    });
  }

  window.Escena = {
    doble: true,

    init: function (canvas, opts) {
      cv = canvas;
      reducido = !!(opts && opts.reducido);
      try { ctx = cv.getContext("2d"); } catch (e) { ctx = null; }
      if (typeof ResizeObserver === "function") {
        ro = new ResizeObserver(ajustar);
        ro.observe(cv);
      }
      ajustar();
    },

    setEstado: function (e) {
      if (e) {
        estado = {
          rangoIdx: e.rangoIdx || 0,
          progresoRango: e.progresoRango || 0,
          habitos: e.habitos || {},
          perfecto: !!e.perfecto,
          entregasSemana: e.entregasSemana || 0
        };
      }
      dibujar();
    },

    apertura: function (opts) {
      var hito = (opts && opts.onHito) || function () {};
      if (reducido) return Promise.resolve();
      return new Promise(function (ok) {
        var fin = false;
        var cerrar = function () { if (!fin) { fin = true; aperturaCorte = null; ok(); } };
        aperturaCorte = cerrar;
        espera(500, function () { if (!fin) hito("ojos"); });
        espera(1500, function () { if (!fin) { hito("alas"); pulso("#FFFFFF", 700); } });
        espera(2500, function () { if (!fin) hito("plumas"); });
        espera(3400, function () { if (!fin) hito("aura"); });
        espera(4200, cerrar);
      });
    },

    saltar: function () { if (aperturaCorte) aperturaCorte(); dibujar(); },

    subir: function (clave) {
      pulso(COLORES_HAB[clave] || "#FFFFFF", 900);
      return resolverEn(1800, function () {
        if (estado.habitos) estado.habitos[clave] = true;
        dibujar();
      });
    },

    sobrecarga: function () {
      pulso("#FFD166", 1600);
      return resolverEn(3000, function () { estado.perfecto = true; dibujar(); });
    },

    entrega: function () {
      pulso("#4FB8FF", 600);
      return resolverEn(1000);
    },

    fotograma: function () { dibujar(); },

    destruir: function () {
      timers.forEach(clearTimeout);
      timers = [];
      if (ro) { ro.disconnect(); ro = null; }
      ctx = null;
      cv = null;
    }
  };
})();
