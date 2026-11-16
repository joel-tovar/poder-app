/* PODER · tablero · datos, cuentas del poder, pantallas y controles.
   Contrato: CONTRATO.md (§4 cuentas, §6 datos externos, §7 estructura). Sin librerías. */
(function () {
  "use strict";

  /* ================= Constantes ================= */
  var HABITOS = [
    { key: "leer", id: "695006aa4e52ccfcb68a2b40", nombre: "Leer" },
    { key: "escribir", id: "695006d24e52ccfcb68a2b51", nombre: "Escribir" },
    { key: "meditar", id: "695008504e52ccfcb68a2c3b", nombre: "Meditar" },
    { key: "ayuno", id: "695008884e52ccfcb68a2c56", nombre: "Ayuno de Dopamina" },
    { key: "dormir", id: "695008c64e52ccfcb68a2c8c", nombre: "Dormir Bien" }
  ];
  var KEYS = HABITOS.map(function (h) { return h.key; });
  var IDS = HABITOS.map(function (h) { return h.id; });
  var POR_ID = {}, POR_KEY = {};
  HABITOS.forEach(function (h) { POR_ID[h.id] = h.key; POR_KEY[h.key] = h; });

  var ZONA_DEF = "America/Bogota";
  var INICIO = 20251227;
  var SEIS_H = 6 * 3600 * 1000;
  var MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

  var CFG_DEF = {
    rangos: [
      { nombre: "Chispa", umbral: 0 }, { nombre: "Brasa", umbral: 500 }, { nombre: "Llama", umbral: 1200 },
      { nombre: "Antorcha", umbral: 2500 }, { nombre: "Hoguera", umbral: 4000 }, { nombre: "Reactor", umbral: 6000 },
      { nombre: "Tormenta", umbral: 9000 }, { nombre: "Supernova", umbral: 13000 }, { nombre: "Titán", umbral: 18000 },
      { nombre: "Ascendido", umbral: 25000 }
    ],
    puntos: { habito: 10, perfecto: 25, entrega: 5 },
    mults: [{ dias: 7, x: 1.5 }, { dias: 30, x: 2 }],
    entregas_suman: true,
    zona: ZONA_DEF
  };

  var BANCO_DEF = {
    entrada: [
      "Hoy no tienes que ser perfecto, Joel. Tienes que ser constante. Un clip más en la taza.",
      "Cada hábito de hoy es un voto por el hombre que quieres ser.",
      "Nunca faltes dos veces. Hoy es el día que lo demuestra."
    ],
    golpe: {
      leer: ["Leíste hoy: tu mente es más grande que ayer.", "Una página más y ya eres otro lector, Joel.", "Leer es entrenar el músculo que decide todo lo demás."],
      escribir: ["Lo escribiste: lo que se escribe, se cumple.", "Tu pensamiento ahora tiene forma. Eso es poder.", "Escribir ordena la cabeza y manda la mano. Sigue."],
      meditar: ["Silencio ganado. Desde ahí se manda sobre todo lo demás.", "Respiraste y volviste a ti, Joel. Eso pesa.", "Quien domina su mente no pierde el rumbo."],
      ayuno: ["Dijiste no a lo fácil. Eso se llama carácter.", "Tu atención es tuya otra vez, Joel.", "Menos ruido, más fuerza. Hoy ganaste la batalla."],
      dormir: ["Dormir bien es entrenar mañana. Buen trabajo.", "Cuerpo recuperado, mente afilada. Así se gana.", "El descanso también es disciplina, Joel."],
      entregas: ["Otra entrega: plata real y un cliente con su pedido en la mano.", "Alguien del otro lado ya recibió lo que pidió. Eso es negocio.", "Las entregas son la plata de verdad. Sigue entregando."],
      perfecto: ["Los cinco en un solo día. Eso es identidad, Joel.", "Día perfecto. Ninguna excusa pudo contigo.", "Cinco de cinco. Así se construye un hombre imparable."]
    }
  };

  /* ================= Estado ================= */
  var S = {
    reducido: false,
    cfg: clonar(CFG_DEF),
    banco: clonar(BANCO_DEF),
    hoy: 0,
    tt: { checks: {}, storedAt: 0, origen: "nada", habits: [], error: "", leyendo: true },
    ttCache: null,
    dr: { items: [], vistos: {}, storedAt: 0, error: "", leyendo: false, base: false },
    marcas: { entrada: "", entradaFecha: "", golpe: "" },
    registroDb: {},
    calc: null,
    ocupado: {},
    firmas: {},
    cola: Promise.resolve(),
    ttDbStored: 0,
    mostrado: 0,
    poderListo: false,
    enApertura: false,
    escenaPend: false,
    fraseMostrada: "",
    rangoPrev: -1,
    entregasPend: 0,
    golpeT: null,
    avisoT: null,
    raf: 0,
    rafT: 0,
    ocultoDesde: 0
  };
  KEYS.forEach(function (k) { S.tt.checks[k] = {}; });

  var db = null, mcp = null;

  /* ================= Utilidades ================= */
  function clonar(o) { return JSON.parse(JSON.stringify(o)); }
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esperar(ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); }
  function seguro(fn) { try { return fn(); } catch (e) { if (window.console) console.warn("[PODER]", e); } }

  function fmt(n) {
    n = Math.round(Number(n) || 0);
    var s = String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return (n < 0 ? "-" : "") + s;
  }
  function plata(n) { return "$" + fmt(n); }
  function multTxt(m) { return "×" + String(m).replace(".", ","); }
  function recortar(s, n) { s = String(s || ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; }

  function aNumero(v) {
    if (typeof v === "number") return isFinite(v) ? v : 0;
    var s = String(v == null ? "" : v).trim();
    if (!s) return 0;
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/[^\d.\-]/g, "");
    var n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }

  function canon(o) {
    if (Array.isArray(o)) return "[" + o.map(canon).join(",") + "]";
    if (o && typeof o === "object") {
      return "{" + Object.keys(o).sort().map(function (k) { return JSON.stringify(k) + ":" + canon(o[k]); }).join(",") + "}";
    }
    return JSON.stringify(o);
  }
  function hash(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }

  /* ----- Fechas (America/Bogota por Intl) ----- */
  var fmtCache = {};
  function partes(d, zona) {
    var f = fmtCache[zona];
    if (!f) {
      var op = { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" };
      try { f = new Intl.DateTimeFormat("en-CA", Object.assign({ timeZone: zona }, op)); }
      catch (e) { f = new Intl.DateTimeFormat("en-CA", Object.assign({ timeZone: ZONA_DEF }, op)); }
      fmtCache[zona] = f;
    }
    var o = {};
    f.formatToParts(d).forEach(function (p) { if (p.type !== "literal") o[p.type] = parseInt(p.value, 10); });
    return o;
  }
  function stampHoy() {
    var p = partes(new Date(), S.cfg.zona);
    return p.year * 10000 + p.month * 100 + p.day;
  }
  function stampAIdx(s) {
    var y = Math.floor(s / 10000), m = Math.floor(s / 100) % 100, d = s % 100;
    return Math.round(Date.UTC(y, m - 1, d) / 86400000);
  }
  function idxAStamp(i) {
    var d = new Date(i * 86400000);
    return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
  }
  function sumarDias(s, n) { return idxAStamp(stampAIdx(s) + n); }
  function stampAIso(s) {
    var y = Math.floor(s / 10000), m = Math.floor(s / 100) % 100, d = s % 100;
    return y + "-" + (m < 10 ? "0" : "") + m + "-" + (d < 10 ? "0" : "") + d;
  }
  function lunesIdx(s) {
    var i = stampAIdx(s);
    var dow = (i + 4) % 7; // 0 = domingo (1970-01-01 fue jueves)
    return i - ((dow + 6) % 7);
  }
  function corto(s) { return (s % 100) + " " + MESES[Math.floor(s / 100) % 100 - 1]; }
  function stampDe(v) {
    if (!v) return 0;
    var s = String(v);
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m && !/(Z|[+-]\d{2}:?\d{2})$/.test(s)) return (+m[1]) * 10000 + (+m[2]) * 100 + (+m[3]);
    var d = new Date(s);
    if (isNaN(d.getTime())) return m ? (+m[1]) * 10000 + (+m[2]) * 100 + (+m[3]) : 0;
    var p = partes(d, S.cfg.zona);
    return p.year * 10000 + p.month * 100 + p.day;
  }
  function haceX(ms) {
    if (!ms) return "nunca";
    var s = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (s < 45) return "hace un momento";
    var m = Math.round(s / 60);
    if (m < 60) return "hace " + m + " min";
    var h = Math.round(m / 60);
    if (h < 48) return "hace " + h + " h";
    return "hace " + Math.round(h / 24) + " d";
  }
  function dosD(n) { return (n < 10 ? "0" : "") + n; }

  /* ----- Respuestas de mcp: el payload sale de CallToolResult.payload (mcp.d.ts) ----- */
  function parseSi(x) {
    if (typeof x === "string") { try { return JSON.parse(x); } catch (e) { return x; } }
    return x;
  }
  function desempacar(res) {
    var p = res ? res.payload : undefined;
    if (p === undefined && res) {
      if (res.structuredContent !== undefined) p = res.structuredContent;
      else if (res.content && res.content[0] && typeof res.content[0].text === "string") p = res.content[0].text;
    }
    return parseSi(p);
  }

  /* Tabla compacta de texto que entrega el conector de Dropi:
     items[14]{order_id,status,...}:
       "93893393",ENTREGADO,Nombre,"3155080798",IBAGUE,69900,COP,"",INTERRAPIDISIMO,CON RECAUDO,"2026-10-20T21:29:43","2400..."
     count: 14  */
  function tablaATexto(txt) {
    if (typeof txt !== "string") return null;
    var m = /items\[\d+\]\s*\{([^}]*)\}\s*:/.exec(txt);
    if (!m) return null;
    var cols = m[1].split(",").map(function (c) { return c.trim(); });
    var resto = txt.slice(m.index + m[0].length).split(/\r?\n/);
    var filas = [];
    for (var i = 0; i < resto.length; i++) {
      var linea = resto[i].trim();
      if (!linea) continue;
      if (/^count\s*:/i.test(linea)) break;
      var vals = [], cur = "", q = false;
      for (var k = 0; k < linea.length; k++) {
        var ch = linea[k];
        if (ch === '"') { if (q && linea[k + 1] === '"') { cur += '"'; k++; } else q = !q; }
        else if (ch === "," && !q) { vals.push(cur); cur = ""; }
        else cur += ch;
      }
      vals.push(cur);
      if (vals.length < 2) continue;
      var o = {};
      cols.forEach(function (c, j) { o[c] = (vals[j] === undefined ? "" : vals[j].trim()); });
      filas.push(o);
    }
    return { items: filas };
  }
  function resultadoTT(res) {
    var p = desempacar(res);
    if (p && typeof p === "object" && !Array.isArray(p) && p.result !== undefined) p = parseSi(p.result);
    return p;
  }

  function msgMcp(servidor, e) {
    var c = (e && e.code) || "";
    var m = String((e && e.message) || "");
    var low = m.toLowerCase();
    if (c === "needs_reauth" || (c !== "rate_limited" && /token|expir|unauthori|\b401\b|reauth/.test(low))) return servidor + " desconectado: reconecta en Conectores";
    if (c === "server_not_connected") return servidor + " no está agregado: agrégalo en Conectores";
    if (c === "selection_required") return "Elige cuál conector " + servidor + " usar, en Conectores";
    if (c === "not_in_manifest") return servidor + " no está permitido para esta página";
    if (c === "blocked_by_policy") return "Tu organización bloquea " + servidor;
    if (c === "approval_required") return servidor + " necesita tu aprobación para esta acción";
    if (c === "rate_limited" || /\b429\b|rate.?limit|too many/.test(low)) return servidor + " pide esperar (límite de lecturas)";
    if (c === "server_unavailable") return servidor + " no responde ahora";
    if (c === "not_granted" || c === "capability_disabled" || c === "capability_removed") return "Esta vista no tiene conectores";
    return servidor + ": " + recortar(m || "falló la llamada", 140);
  }

  function usar(nombre) {
    try {
      if (window.claude && typeof window.claude.use === "function") {
        return window.claude.use(nombre).then(function (x) { return x || null; }, function () { return null; });
      }
    } catch (e) { /* sin capacidades */ }
    return Promise.resolve(null);
  }

  /* ================= Config y banco ================= */
  function aplicarConfig(doc) {
    var c = clonar(CFG_DEF);
    if (doc && typeof doc === "object") {
      if (Array.isArray(doc.rangos) && doc.rangos.length >= 2) {
        var rs = [];
        doc.rangos.forEach(function (r) {
          var nombre, umbral;
          if (Array.isArray(r)) { umbral = Number(r[0]); nombre = r[1]; }
          else if (r && typeof r === "object") {
            nombre = r.nombre || r.n || r.name;
            umbral = Number(r.umbral != null ? r.umbral : (r.u != null ? r.u : (r.min != null ? r.min : r.desde)));
          }
          if (nombre && isFinite(umbral)) rs.push({ nombre: String(nombre), umbral: umbral });
        });
        if (rs.length >= 2) { rs.sort(function (a, b) { return a.umbral - b.umbral; }); c.rangos = rs; }
      }
      if (doc.puntos && typeof doc.puntos === "object") {
        ["habito", "perfecto", "entrega"].forEach(function (k) {
          var v = Number(doc.puntos[k]);
          if (isFinite(v)) c.puntos[k] = v;
        });
      }
      if (doc.multiplicadores && typeof doc.multiplicadores === "object") {
        var ms = [];
        Object.keys(doc.multiplicadores).forEach(function (d) {
          var x = Number(doc.multiplicadores[d]), dd = Number(d);
          if (isFinite(x) && isFinite(dd)) ms.push({ dias: dd, x: x });
        });
        if (ms.length) c.mults = ms.sort(function (a, b) { return a.dias - b.dias; });
      }
      if (typeof doc.entregas_suman === "boolean") c.entregas_suman = doc.entregas_suman;
      if (typeof doc.zona === "string" && doc.zona) {
        try { new Intl.DateTimeFormat("en-CA", { timeZone: doc.zona }); c.zona = doc.zona; } catch (e) { /* zona inválida */ }
      }
    }
    S.cfg = c;
  }

  function aplicarBanco(doc) {
    var b = clonar(BANCO_DEF);
    if (doc && typeof doc === "object") {
      if (Array.isArray(doc.entrada) && doc.entrada.length) b.entrada = doc.entrada.filter(function (x) { return typeof x === "string" && x; });
      if (!b.entrada.length) b.entrada = clonar(BANCO_DEF.entrada);
      if (doc.golpe && typeof doc.golpe === "object") {
        Object.keys(BANCO_DEF.golpe).forEach(function (k) {
          var l = doc.golpe[k];
          if (Array.isArray(l)) {
            l = l.filter(function (x) { return typeof x === "string" && x; });
            if (l.length) b.golpe[k] = l;
          }
        });
      }
    }
    S.banco = b;
  }

  /* ================= Las cuentas del poder (§4) ================= */
  function multDe(racha, cfg) {
    var m = 1;
    cfg.mults.forEach(function (x) { if (racha >= x.dias && x.x > m) m = x.x; });
    return m;
  }
  function diaNuevo(i) {
    return { idx: i, stamp: idxAStamp(i), hechos: {}, pts: {}, n: 0, ptsHabitos: 0, ptsPerfecto: 0, ptsEntregas: 0 };
  }

  function calcular(checks, vistos, cfg, hoyS) {
    var hoyI = stampAIdx(hoyS);
    var dias = {}, racha = {}, mult = {}, vale = {}, hoy = {}, ptsHoy = {};

    HABITOS.forEach(function (h) {
      var idxs = Object.keys(checks[h.key] || {}).map(function (s) { return stampAIdx(+s); }).sort(function (a, b) { return a - b; });
      var prev = null, st = 0;
      idxs.forEach(function (i) {
        if (i === prev) return;
        st = (prev !== null && i === prev + 1) ? st + 1 : 1;
        prev = i;
        var p = cfg.puntos.habito * multDe(st, cfg);
        var d = dias[i] || (dias[i] = diaNuevo(i));
        d.hechos[h.key] = true; d.pts[h.key] = p; d.n++; d.ptsHabitos += p;
      });
      var hecho = prev === hoyI;
      var rc = (prev === hoyI || prev === hoyI - 1) ? st : 0;
      hoy[h.key] = hecho;
      racha[h.key] = rc;
      mult[h.key] = multDe(rc, cfg);
      ptsHoy[h.key] = hecho && dias[hoyI] ? (dias[hoyI].pts[h.key] || 0) : 0;
      vale[h.key] = hecho ? ptsHoy[h.key] : cfg.puntos.habito * multDe(rc + 1, cfg);
    });

    var totH = 0, totP = 0, totE = 0, perfectos = 0;
    Object.keys(dias).forEach(function (k) {
      var d = dias[k];
      if (d.n === KEYS.length) { d.ptsPerfecto = cfg.puntos.perfecto; perfectos++; }
      totH += d.ptsHabitos; totP += d.ptsPerfecto;
    });
    if (cfg.entregas_suman) {
      Object.keys(vistos).forEach(function (id) {
        var s = +vistos[id] || stampHoy();
        var i = stampAIdx(s);
        var d = dias[i] || (dias[i] = diaNuevo(i));
        d.ptsEntregas += cfg.puntos.entrega; totE += cfg.puntos.entrega;
      });
    }
    Object.keys(dias).forEach(function (k) {
      var d = dias[k];
      d.total = d.ptsHabitos + d.ptsPerfecto + d.ptsEntregas;
    });

    var total = Math.round(totH + totP + totE);
    var dHoy = dias[hoyI];
    var perfecto = !!(dHoy && dHoy.n === KEYS.length);

    var g = (dHoy && dHoy.n > 0) ? hoyI : hoyI - 1, rg = 0;
    while (dias[g] && dias[g].n > 0) { rg++; g--; }

    return {
      total: total, ptsHabitos: totH, ptsPerfecto: totP, ptsEntregas: totE,
      dias: dias, racha: racha, mult: mult, vale: vale, hoy: hoy, ptsHoy: ptsHoy,
      perfecto: perfecto, ptsPerfectoHoy: perfecto ? cfg.puntos.perfecto : 0,
      rachaGlobal: rg, perfectos: perfectos, hoyI: hoyI,
      rango: rangoDe(total, cfg.rangos)
    };
  }

  function rangoDe(total, rangos) {
    var idx = 0;
    for (var i = 0; i < rangos.length; i++) { if (total >= rangos[i].umbral) idx = i; }
    var act = rangos[idx], sig = rangos[idx + 1] || null;
    var progreso = sig ? Math.max(0, Math.min(1, (total - act.umbral) / (sig.umbral - act.umbral))) : 1;
    return { idx: idx, nombre: act.nombre, sig: sig ? sig.nombre : "", faltan: sig ? Math.max(0, sig.umbral - total) : 0, progreso: progreso };
  }

  function recalcular() {
    S.hoy = stampHoy();
    S.calc = calcular(S.tt.checks, S.dr.vistos, S.cfg, S.hoy);
    return S.calc;
  }

  /* ================= Dropi: resumen semanal ================= */
  function agrega(lista) {
    var plataT = 0, ciu = {}, tra = {};
    lista.forEach(function (it) {
      plataT += aNumero(it.total);
      var c = (it.city || "").trim() || "Sin ciudad";
      var t = (it.shipping_company || "").trim() || "Sin transportadora";
      ciu[c] = (ciu[c] || 0) + 1; tra[t] = (tra[t] || 0) + 1;
    });
    function top(o) { return Object.keys(o).map(function (k) { return [k, o[k]]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 3); }
    return { n: lista.length, plata: plataT, ciudades: top(ciu), trans: top(tra) };
  }
  function resumenDropi() {
    var hoyS = S.hoy || stampHoy();
    var lunes = lunesIdx(hoyS);
    var esta = [], pasada = [];
    (S.dr.items || []).forEach(function (it) {
      var s = stampDe(it.created_at);
      if (!s) return;
      var i = stampAIdx(s);
      if (i >= lunes) esta.push({ it: it, s: s });
      else if (i >= lunes - 7) pasada.push({ it: it, s: s });
    });
    function ord(a, b) { return b.s - a.s; }
    esta.sort(ord); pasada.sort(ord);
    return {
      esta: agrega(esta.map(function (x) { return x.it; })),
      pasada: agrega(pasada.map(function (x) { return x.it; })),
      lista: esta.map(function (x) { x.p = false; return x; }).concat(pasada.map(function (x) { x.p = true; return x; }))
    };
  }

  /* ================= Escena (con doble o real, siempre tolerante) ================= */
  function esc(nombre) {
    var args = Array.prototype.slice.call(arguments, 1);
    try {
      var E = window.Escena;
      if (E && typeof E[nombre] === "function") {
        return Promise.resolve(E[nombre].apply(E, args)).catch(function () { /* la escena no bloquea */ });
      }
    } catch (e) { /* sin escena */ }
    return Promise.resolve();
  }
  function conLimite(p, ms) { return Promise.race([p, esperar(ms)]); }

  function estadoEscena() {
    var c = S.calc, hab = {};
    KEYS.forEach(function (k) { hab[k] = !!(c && c.hoy[k]); });
    return {
      rangoIdx: c ? c.rango.idx : 0,
      progresoRango: c ? c.rango.progreso : 0,
      habitos: hab,
      perfecto: !!(c && c.perfecto),
      entregasSemana: resumenDropi().esta.n
    };
  }
  function empujarEscena() {
    if (S.enApertura) { S.escenaPend = true; return; }
    esc("setEstado", estadoEscena());
  }

  /* ================= Escrituras a db (solo cuando cambia algo, una a la vez) ================= */
  function escribir(ruta, datos, firma) {
    if (!db) return;
    if (firma !== undefined) {
      if (S.firmas[ruta] === firma) return;
      S.firmas[ruta] = firma;
    }
    S.cola = S.cola.then(function () {
      return db.doc(ruta).set(datos);
    }).catch(function (e) {
      if (firma !== undefined) S.firmas[ruta] = null;
      if (window.console) console.warn("[PODER] no se pudo guardar " + ruta, e && e.code ? e.code : e);
    });
  }

  function persistirTickTick() {
    var cks = HABITOS.map(function (h) {
      return { habitId: h.id, checkins: Object.keys(S.tt.checks[h.key]).map(function (s) { return { stamp: +s, status: 2 }; }) };
    });
    var firma = canon(cks);
    var vieja = Date.now() - S.ttDbStored > 30 * 60 * 1000;
    if (firma === S.firmas["cache/ticktick"] && !vieja) return;
    S.firmas["cache/ticktick"] = null;
    S.ttDbStored = Date.now();
    var habs = (S.tt.habits || []).map(function (h) { return { id: h.id, name: h.name, color: h.color, totalCheckIns: h.totalCheckIns }; });
    escribir("cache/ticktick", { storedAt: new Date(S.tt.storedAt || Date.now()).toISOString(), habits: habs, checkins: cks }, firma);
  }

  function persistirEstado() {
    if (S.tt.origen !== "vivo" || !S.calc) return;
    var c = S.calc, r = resumenDropi();
    var hoyH = {}, rach = {};
    KEYS.forEach(function (k) { hoyH[k] = !!c.hoy[k]; rach[k] = c.racha[k]; });
    var doc = {
      fecha: stampAIso(S.hoy), stamp: S.hoy, poderTotal: c.total, rangoIdx: c.rango.idx, rango: c.rango.nombre,
      faltan: c.rango.faltan, siguiente: c.rango.sig, hoy: hoyH, rachas: rach, perfecto: c.perfecto,
      entregasSemana: r.esta.n, entregasSemanaPasada: r.pasada.n, plataSemana: Math.round(r.esta.plata)
    };
    var firma = canon(doc);
    if (S.firmas["estado/hoy"] === firma) return;
    var conHora = Object.assign({}, doc, { actualizado: new Date().toISOString() });
    escribir("estado/hoy", conHora, firma);
  }

  function persistirRegistro() {
    if (S.tt.origen !== "vivo" || !S.calc) return;
    var c = S.calc;
    for (var o = 27; o >= 0; o--) {
      var i = c.hoyI - o, d = c.dias[i];
      var fecha = stampAIso(idxAStamp(i));
      var previo = S.registroDb[fecha];
      if (!d && !previo) continue;
      var doc = {
        fecha: fecha,
        puntosHabitos: Math.round(d ? d.ptsHabitos : 0),
        puntosPerfecto: Math.round(d ? d.ptsPerfecto : 0),
        puntosEntregas: Math.round(d ? d.ptsEntregas : 0),
        total: Math.round(d ? d.total : 0)
      };
      escribir("registro/" + fecha, doc, canon(doc));
    }
  }

  function persistirDropi() {
    var items = S.dr.items || [];
    escribir("cache/dropi", {
      storedAt: new Date(S.dr.storedAt || Date.now()).toISOString(),
      items: items,
      vistos: S.dr.vistos,
      muestra: S.dr.muestra || ""
    });
  }

  function persistirMarcas() {
    var doc = { frasesVistas: { entrada: S.marcas.entrada, golpe: S.marcas.golpe }, entradaFecha: S.marcas.entradaFecha };
    escribir("marcas/ultima", doc, canon(doc));
  }

  function persistirTodo() {
    seguro(persistirTickTick); seguro(persistirEstado); seguro(persistirRegistro); seguro(persistirMarcas);
  }

  /* ================= Frases ================= */
  function parseFrase(txt) {
    txt = String(txt || "");
    var m = /^(.*?)\s+[—–]\s+([^—–]{2,60})$/.exec(txt);
    if (m && /»\s*$/.test(m[1])) return { t: m[1], a: m[2] };
    return { t: txt, a: "" };
  }

  function fraseDelDia() {
    var lista = S.banco.entrada && S.banco.entrada.length ? S.banco.entrada : BANCO_DEF.entrada;
    var n = lista.length, hoyS = S.hoy || stampHoy();
    var iso = stampAIso(hoyS);
    var i = hash(iso) % n, j = hash(stampAIso(sumarDias(hoyS, -1))) % n;
    if (n > 1 && i === j) i = (i + 1) % n;
    if (n > 1 && S.marcas.entrada === lista[i] && S.marcas.entradaFecha && S.marcas.entradaFecha !== iso) i = (i + 1) % n;
    S.marcas.entrada = lista[i];
    S.marcas.entradaFecha = iso;
    return lista[i];
  }

  function elegirGolpe(clave) {
    var lista = (S.banco.golpe && S.banco.golpe[clave]) || [];
    if (!lista.length) lista = BANCO_DEF.golpe[clave] || [""];
    var cand = lista.filter(function (f) { return f !== S.marcas.golpe; });
    if (!cand.length) cand = lista;
    var f = cand[Math.floor(Math.random() * cand.length)];
    S.marcas.golpe = f;
    return f;
  }

  /* ================= Render ================= */
  var el = {};

  function cacheEl() {
    el.app = $("#app"); el.velo = $("#velo");
    el.rango = $("#rango"); el.poder = $("#poder"); el.barra = $("#barra"); el.barraI = $("#barra-i"); el.faltan = $("#faltan");
    el.fraseT = $("#frase-t"); el.fraseA = $("#frase-a");
    el.golpe = $("#golpe"); el.aviso = $("#aviso");
    el.entN = $("#ent-n"); el.entU = $("#ent-u"); el.entPlata = $("#ent-plata"); el.entPasada = $("#ent-pasada");
    el.entMeta = $("#ent-meta"); el.entLista = $("#ent-lista"); el.entEstado = $("#ent-estado");
    el.calDias = $("#cal-dias"); el.calBarras = $("#cal-barras"); el.calDatos = $("#cal-datos");
    el.pieTT = $("#pie-tt"); el.pieDR = $("#pie-dr");
    el.btnDropi = $("#btn-dropi"); el.btnDropi2 = $("#btn-dropi-2"); el.btnTT = $("#btn-tt");
  }

  function renderCabecera() {
    var c = S.calc;
    if (!c || S.tt.origen === "nada") {
      el.rango.textContent = S.tt.leyendo ? "Leyendo" : "Sin lectura";
      el.faltan.textContent = S.tt.leyendo ? "leyendo TickTick…" : (S.tt.error || "TickTick sin lectura");
      return;
    }
    el.rango.textContent = c.rango.nombre;
    var pct = Math.round(c.rango.progreso * 100);
    el.barraI.style.width = pct + "%";
    el.barra.setAttribute("aria-valuenow", String(pct));
    el.faltan.textContent = c.rango.sig ? "faltan " + fmt(c.rango.faltan) + " para " + c.rango.sig : "rango máximo alcanzado";
    if (S.poderListo) contarA(c.total, S.poderDur || 900);
  }

  function contarA(v, dur) {
    v = Math.round(v);
    cancelAnimationFrame(S.raf); clearTimeout(S.rafT);
    if (S.reducido || !dur || v === S.mostrado) { S.mostrado = v; el.poder.textContent = fmt(v); return; }
    var ini = S.mostrado, t0 = performance.now();
    if (v > ini) { el.poder.classList.remove("sube"); void el.poder.offsetWidth; el.poder.classList.add("sube"); }
    function paso(t) {
      var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 4);
      S.mostrado = Math.round(ini + (v - ini) * e);
      el.poder.textContent = fmt(S.mostrado);
      if (k < 1) S.raf = requestAnimationFrame(paso);
    }
    S.raf = requestAnimationFrame(paso);
    S.rafT = setTimeout(function () { S.mostrado = v; el.poder.textContent = fmt(v); }, dur + 250);
  }

  function flotante(txt) {
    var caja = $(".poder-caja");
    if (!caja) return;
    var s = document.createElement("span");
    s.className = "flot";
    s.textContent = txt;
    s.style.left = (4 + Math.random() * 60) + "px";
    caja.appendChild(s);
    setTimeout(function () { if (s.parentNode) s.parentNode.removeChild(s); }, 1900);
  }

  function renderHabitos() {
    var c = S.calc, sinDatos = S.tt.origen === "nada";
    HABITOS.forEach(function (h) {
      var card = $('.hab[data-key="' + h.key + '"]');
      if (!card) return;
      var hecho = !!(c && c.hoy[h.key]) && !sinDatos;
      var ocupado = !!S.ocupado[h.key];
      var btn = $(".btn-hecho", card), ok = $(".hab-ok", card), m = $(".hab-m", card), v = $(".hab-v", card);
      card.classList.toggle("cargando", sinDatos);
      card.classList.toggle("ok", hecho);
      card.classList.toggle("ocupado", ocupado);
      if (sinDatos) {
        m.textContent = S.tt.leyendo ? "leyendo TickTick…" : (S.tt.error || "sin lectura de TickTick");
        v.textContent = "+" + S.cfg.puntos.habito;
        btn.hidden = false; ok.hidden = true;
        btn.disabled = true;
        btn.textContent = "Hecho";
        return;
      }
      m.textContent = "racha " + c.racha[h.key] + " · " + multTxt(c.mult[h.key]);
      v.textContent = "+" + fmt(c.vale[h.key]);
      btn.hidden = hecho;
      ok.hidden = !hecho;
      btn.disabled = ocupado || !mcp;
      btn.textContent = ocupado ? "Marcando…" : "Hecho";
      btn.title = mcp ? "" : "Sin conexión con TickTick desde esta vista";
    });
  }

  function renderFrase() {
    var f = parseFrase(S.fraseMostrada || "Preparando tu día…");
    el.fraseT.textContent = f.t;
    el.fraseA.textContent = f.a;
  }

  function renderEntregas() {
    var r = resumenDropi();
    var hayDatos = !!S.dr.storedAt;
    el.entN.textContent = hayDatos ? fmt(r.esta.n) : "–";
    el.entU.textContent = r.esta.n === 1 ? "pedido entregado" : "pedidos entregados";
    el.entPlata.textContent = hayDatos ? plata(r.esta.plata) : "";
    if (hayDatos) {
      var dif = r.esta.n - r.pasada.n;
      el.entPasada.textContent = "semana pasada: " + fmt(r.pasada.n) + " · " + plata(r.pasada.plata) +
        (r.pasada.n ? " (" + (dif >= 0 ? "+" : "") + dif + " vs. ella)" : "");
      var partes2 = [];
      if (r.esta.ciudades.length) partes2.push(r.esta.ciudades.map(function (x) { return x[0] + " " + x[1]; }).join(" · "));
      if (r.esta.trans.length) partes2.push(r.esta.trans.map(function (x) { return x[0] + " " + x[1]; }).join(" · "));
      el.entMeta.textContent = partes2.join("  |  ");
    } else {
      el.entPasada.textContent = S.dr.leyendo ? "semana pasada: leyendo…" : "semana pasada: sin datos";
      el.entMeta.textContent = "";
    }
    while (el.entLista.firstChild) el.entLista.removeChild(el.entLista.firstChild);
    if (!r.lista.length) {
      var vacio = document.createElement("li");
      vacio.className = "vacio";
      vacio.textContent = hayDatos ? "Sin entregas en estas dos semanas." : "Aún no hay lectura de Dropi.";
      el.entLista.appendChild(vacio);
    }
    r.lista.slice(0, 40).forEach(function (x) {
      var li = document.createElement("li");
      if (x.p) li.className = "pasada";
      var c1 = document.createElement("span"), c2 = document.createElement("span"), c3 = document.createElement("span"), c4 = document.createElement("span");
      c1.className = "c1"; c2.className = "c2"; c3.className = "c3"; c4.className = "c4";
      c1.textContent = x.it.city || "Sin ciudad";
      c2.textContent = x.it.shipping_company || "–";
      c3.textContent = plata(aNumero(x.it.total));
      c4.textContent = corto(x.s);
      if (x.it.tel4) li.title = "cliente ···" + x.it.tel4;
      li.appendChild(c1); li.appendChild(c2); li.appendChild(c3); li.appendChild(c4);
      el.entLista.appendChild(li);
    });
    renderRelativos();
  }

  function renderCalendario() {
    var c = S.calc;
    while (el.calDias.firstChild) el.calDias.removeChild(el.calDias.firstChild);
    while (el.calBarras.firstChild) el.calBarras.removeChild(el.calBarras.firstChild);
    var hoyI = c ? c.hoyI : stampAIdx(S.hoy || stampHoy());
    var max = 1, totales = [], sinDatos = !c || S.tt.origen === "nada";
    for (var o = 27; o >= 0; o--) {
      var i = hoyI - o, d = c ? c.dias[i] : null;
      var fecha = stampAIso(idxAStamp(i));
      var tot = d ? d.total : (sinDatos && S.registroDb[fecha] ? (S.registroDb[fecha].total || 0) : 0);
      totales.push(tot); if (tot > max) max = tot;
      var cel = document.createElement("div");
      cel.className = "dia" + (o === 0 ? " hoy" : "") + (d && d.n === KEYS.length ? " perfecto" : "");
      cel.title = corto(idxAStamp(i)) + " · " + (d ? d.n : 0) + " de 5 hábitos · +" + fmt(tot);
      KEYS.forEach(function (k) {
        var sg = document.createElement("i");
        sg.className = "seg s-" + k + (d && d.hechos[k] ? " on" : "");
        cel.appendChild(sg);
      });
      el.calDias.appendChild(cel);
    }
    totales.forEach(function (t, idx) {
      var b = document.createElement("i");
      if (!t) b.className = "cero";
      b.style.height = t ? Math.max(6, Math.round(t / max * 100)) + "%" : "2px";
      b.title = corto(idxAStamp(hoyI - 27 + idx)) + " · +" + fmt(t);
      el.calBarras.appendChild(b);
    });
    el.calDatos.textContent = c && !sinDatos
      ? "racha global " + c.rachaGlobal + (c.rachaGlobal === 1 ? " día" : " días") + " · perfectos " + perfectos28(c)
      : "racha global – · perfectos –";
  }
  function perfectos28(c) {
    var n = 0;
    for (var o = 0; o < 28; o++) { var d = c.dias[c.hoyI - o]; if (d && d.n === KEYS.length) n++; }
    return n;
  }

  function renderRelativos() {
    var tt;
    if (S.tt.origen === "vivo") tt = "TickTick · leído " + haceX(S.tt.storedAt);
    else if (S.tt.origen === "cache") tt = "TickTick · última lectura " + haceX(S.tt.storedAt) + (mcp ? "" : " (sin conexión)");
    else tt = S.tt.leyendo ? "TickTick · leyendo" : "TickTick · sin lectura";
    el.pieTT.textContent = tt;
    el.pieDR.textContent = S.dr.storedAt ? "Dropi · leído " + haceX(S.dr.storedAt) : (S.dr.leyendo ? "Dropi · leyendo" : "Dropi · sin lectura");
    if (S.dr.error) {
      el.entEstado.textContent = S.dr.error + (S.dr.storedAt ? " · caché " + haceX(S.dr.storedAt) : "");
      el.entEstado.classList.add("error");
    } else {
      el.entEstado.classList.remove("error");
      el.entEstado.textContent = S.dr.leyendo ? "Dropi · leyendo…"
        : (S.dr.storedAt ? "actualizado " + haceX(S.dr.storedAt) : "Dropi · sin lectura todavía");
    }
    var ocup = S.dr.leyendo || !mcp;
    [el.btnDropi, el.btnDropi2].forEach(function (b) { if (b) { b.disabled = ocup; b.title = mcp ? "" : "Dropi no está disponible en esta vista"; } });
    el.btnDropi.textContent = S.dr.leyendo ? "Leyendo…" : "Actualizar Dropi";
    if (el.btnTT) el.btnTT.disabled = !mcp || S.tt.leyendo;
    var tel = $("#tel-tt");
    if (tel) tel.textContent = "TICKTICK · " + (S.tt.origen === "vivo" ? "5 hábitos leídos" : (S.tt.origen === "cache" ? "caché" : (S.tt.leyendo ? "leyendo" : "sin lectura")));
    var teld = $("#tel-dr");
    if (teld) teld.textContent = "DROPI · " + (S.dr.leyendo ? "leyendo" : (S.dr.storedAt ? "caché " + haceX(S.dr.storedAt) : "sin lectura"));
  }

  function renderTodo() {
    seguro(recalcular);
    seguro(renderCabecera); seguro(renderHabitos); seguro(renderFrase);
    seguro(renderEntregas); seguro(renderCalendario); seguro(renderRelativos);
  }

  /* ----- Frase de golpe y avisos ----- */
  function mostrarGolpe(o) {
    clearTimeout(S.golpeT);
    var g = el.golpe, ms = o.ms || 4000;
    var f = parseFrase(o.texto);
    g.setAttribute("data-k", o.k || "perfecto");
    $("#golpe-hab").textContent = o.etiqueta || "";
    $("#golpe-t").textContent = f.t;
    $("#golpe-a").textContent = f.a;
    $("#golpe-x").textContent = o.extra || "";
    g.style.setProperty("--dur", ms + "ms");
    g.classList.remove("on"); void g.offsetWidth;
    g.classList.add("on");
    g.setAttribute("aria-hidden", "false");
    S.golpeT = setTimeout(function () { g.classList.remove("on"); g.setAttribute("aria-hidden", "true"); }, ms);
  }

  function aviso(txt, mal) {
    clearTimeout(S.avisoT);
    el.aviso.textContent = txt;
    el.aviso.classList.toggle("mal", !!mal);
    el.aviso.classList.add("on");
    S.avisoT = setTimeout(function () { el.aviso.classList.remove("on"); }, mal ? 6500 : 4500);
  }

  /* ================= TickTick ================= */
  function mezclarPasado() {
    // Los check-ins de días anteriores nunca se pierden: el poder total no baja.
    if (!S.ttCache) return;
    var hoyS = S.hoy || stampHoy();
    KEYS.forEach(function (k) {
      Object.keys(S.ttCache[k] || {}).forEach(function (s) { if (+s < hoyS) S.tt.checks[k][s] = true; });
    });
  }

  async function leerTickTick() {
    if (!mcp) {
      S.tt.leyendo = false;
      if (S.tt.origen === "nada") S.tt.error = "Sin conexión con TickTick";
      return false;
    }
    S.tt.leyendo = true; seguro(renderRelativos);
    var hoyS = stampHoy();
    try {
      var rs = await Promise.all([
        mcp.callTool("TickTick", "list_habits", {}, { cache: false }).catch(function () { return null; }),
        mcp.callTool("TickTick", "get_habit_checkins",
          { habit_ids: IDS, from_stamp: INICIO, to_stamp: sumarDias(hoyS, 1), client_timezone: S.cfg.zona }, { cache: false })
      ]);
      var lista = resultadoTT(rs[1]);
      if (!Array.isArray(lista)) throw { code: "upstream_error", message: "TickTick devolvió una respuesta inesperada" };
      var nuevos = {}, total = 0;
      KEYS.forEach(function (k) { nuevos[k] = {}; });
      lista.forEach(function (it) {
        var key = it && POR_ID[it.habitId];
        if (!key) return;
        (it.checkins || []).forEach(function (c) {
          if (c && Number(c.status) === 2 && c.stamp) { nuevos[key][Number(c.stamp)] = true; total++; }
        });
      });
      if (total === 0 && S.ttCache) {
        var previos = 0;
        KEYS.forEach(function (k) { previos += Object.keys(S.ttCache[k] || {}).length; });
        if (previos > 5) throw { code: "upstream_error", message: "TickTick devolvió una lectura vacía; uso la caché" };
      }
      var habs = rs[0] ? resultadoTT(rs[0]) : null;
      S.tt.checks = nuevos;
      S.tt.habits = Array.isArray(habs) ? habs : S.tt.habits;
      S.tt.storedAt = Date.now();
      S.tt.origen = "vivo";
      S.tt.error = "";
      S.tt.leyendo = false;
      mezclarPasado();
      return true;
    } catch (e) {
      S.tt.leyendo = false;
      S.tt.error = msgMcp("TickTick", e);
      if (S.tt.origen !== "nada") aviso(S.tt.error + ". Sigo con la última lectura.", true);
      return false;
    }
  }

  async function releerTickTick() {
    if (S.tt.leyendo) return;
    var ok = await leerTickTick();
    renderTodo();
    if (ok) { empujarEscena(); persistirTodo(); }
  }

  async function marcar(key) {
    var hab = POR_KEY[key];
    if (!hab || S.ocupado[key] || (S.calc && S.calc.hoy[key])) return;
    if (!mcp) { aviso("Sin conexión con TickTick: no puedo marcar desde esta vista.", true); return; }
    S.ocupado[key] = true; renderHabitos();
    var hoyS = stampHoy();
    var antes = S.calc;

    try {
      await mcp.callTool("TickTick", "upsert_habit_checkins",
        { habit_id: hab.id, checkin_data: { stamp: hoyS, status: 2, value: 1, goal: 1 }, client_timezone: S.cfg.zona }, { cache: false });
    } catch (e) {
      S.ocupado[key] = false; renderHabitos();
      aviso("No se pudo marcar " + hab.nombre + ". " + msgMcp("TickTick", e), true);
      return;
    }

    // Relectura de hoy: no se asume que quedó marcado.
    var confirmado = false, sinLectura = false;
    try {
      var rr = await mcp.callTool("TickTick", "get_habit_checkins",
        { habit_ids: [hab.id], from_stamp: hoyS, to_stamp: sumarDias(hoyS, 1), client_timezone: S.cfg.zona }, { cache: false });
      var lista = resultadoTT(rr);
      if (Array.isArray(lista)) {
        lista.forEach(function (it) {
          if (it && it.habitId === hab.id) {
            (it.checkins || []).forEach(function (c) { if (Number(c.stamp) === hoyS && Number(c.status) === 2) confirmado = true; });
          }
        });
      } else sinLectura = true;
    } catch (e) { sinLectura = true; }

    if (!confirmado && !sinLectura) {
      S.ocupado[key] = false; renderHabitos();
      aviso("TickTick no confirmó la marca de " + hab.nombre + ". No se sumó poder; inténtalo otra vez.", true);
      return;
    }

    // Confirmado (o no se pudo releer pero la escritura fue aceptada)
    S.tt.checks[key][hoyS] = true;
    S.tt.storedAt = Date.now(); S.tt.origen = "vivo"; S.tt.error = "";
    S.ocupado[key] = false;
    recalcular();
    var c = S.calc;
    var perfecto = c.perfecto && !(antes && antes.perfecto);
    var ptsHab = c.ptsHoy[key];
    var totalHab = perfecto ? c.total - c.ptsPerfectoHoy : c.total;
    var subioRango = antes && c.rango.idx > antes.rango.idx;

    seguro(renderHabitos); seguro(renderCalendario); seguro(renderRelativos);
    mostrarGolpe({ k: key, etiqueta: hab.nombre, texto: elegirGolpe(key), ms: 4000 });
    var subir = conLimite(esc("subir", key), 3500);
    setTimeout(function () {
      flotante("+" + fmt(ptsHab));
      S.poderListo = true;
      contarA(totalHab, 1200);
      el.rango.textContent = (perfecto ? antes && antes.rango.nombre : c.rango.nombre) || c.rango.nombre;
      el.barraI.style.width = Math.round(c.rango.progreso * 100) + "%";
      el.faltan.textContent = c.rango.sig ? "faltan " + fmt(c.rango.faltan) + " para " + c.rango.sig : "rango máximo alcanzado";
    }, S.reducido ? 0 : 900);
    if (sinLectura) aviso("Marcado en TickTick, pero no pude releerlo para confirmar.");
    await subir;

    if (perfecto) {
      esc("sobrecarga");
      mostrarGolpe({ k: "perfecto", etiqueta: "Día perfecto", texto: elegirGolpe("perfecto"), extra: "+" + c.ptsPerfectoHoy + " DÍA PERFECTO", ms: 4500 });
      setTimeout(function () { flotante("+" + c.ptsPerfectoHoy); contarA(c.total, 1100); seguro(renderCabecera); }, S.reducido ? 0 : 500);
    } else {
      seguro(renderCabecera);
    }
    if (subioRango) aviso("Nuevo rango: " + c.rango.nombre);
    empujarEscena();
    persistirTodo();
  }

  /* ================= Dropi ================= */
  async function leerDropi(manual) {
    if (S.dr.leyendo) return;
    if (!mcp) { if (manual) aviso("Dropi no está disponible desde esta vista.", true); return; }
    S.dr.leyendo = true; seguro(renderEntregas);
    var hoyS = stampHoy();
    var desde = stampAIso(idxAStamp(lunesIdx(hoyS) - 7));
    try {
      var res = await mcp.callTool("Dropi", "list_orders",
        { status: "ENTREGADO", from: desde, until: stampAIso(hoyS), result_number: 100 }, { cache: false });
      var d = desempacar(res);
      if (d && !Array.isArray(d) && d.result !== undefined && !d.items) d = parseSi(d.result);
      if (typeof d === "string") { var tabla = tablaATexto(d); if (tabla) d = tabla; }
      if (d && typeof d === "object" && !Array.isArray(d) && typeof d.text === "string") { var t2 = tablaATexto(d.text); if (t2) d = t2; }
      var items = Array.isArray(d) ? d : (d && (d.items || d.orders || d.data)) || [];
      if (!Array.isArray(items)) items = [];
      S.dr.muestra = items.length ? "" : String(typeof d === "string" ? d : JSON.stringify(d)).slice(0, 400);

      var vistos = S.dr.vistos, nuevosIds = [], planos = [], vistosIds = {};
      var baseline = S.dr.base;
      items.forEach(function (it) {
        if (!it || it.order_id == null) return;
        var id = String(it.order_id);
        if (vistosIds[id]) return;
        vistosIds[id] = true;
        var tel = String(it.customer_phone || "").replace(/\D/g, "");
        planos.push({
          order_id: id,
          city: recortar(it.city || "", 40),
          total: aNumero(it.total),
          shipping_company: recortar(it.shipping_company || "", 40),
          created_at: recortar(it.created_at || "", 40),
          tel4: tel ? tel.slice(-4) : ""
        });
        if (!(id in vistos)) {
          vistos[id] = baseline ? hoyS : (stampDe(it.created_at) || hoyS);
          if (baseline) nuevosIds.push(id);
        }
      });
      S.dr.items = planos;
      S.dr.storedAt = Date.now();
      S.dr.error = "";
      S.dr.base = true;
      S.dr.leyendo = false;
      persistirDropi();
      renderTodo();
      persistirTodo();
      empujarEscena();
      if (nuevosIds.length) {
        S.entregasPend += nuevosIds.length;
        if (!S.enApertura) animarEntregas();
      }
    } catch (e) {
      S.dr.leyendo = false;
      S.dr.error = msgMcp("Dropi", e);
      renderEntregas();
      if (manual) aviso(S.dr.error, true);
    }
  }

  async function animarEntregas() {
    var n = S.entregasPend; S.entregasPend = 0;
    if (!n) return;
    var c = S.calc;
    mostrarGolpe({ k: "entregas", etiqueta: n === 1 ? "Nueva entrega" : n + " entregas nuevas", texto: elegirGolpe("entregas"), ms: 3500 });
    if (S.cfg.entregas_suman) {
      S.poderListo = true;
      contarA(c ? c.total : 0, 1200);
    }
    persistirMarcas();
    var veces = Math.min(n, 5);
    for (var i = 0; i < veces; i++) {
      if (S.cfg.entregas_suman) flotante("+" + S.cfg.puntos.entrega);
      await conLimite(esc("entrega"), 1800);
    }
  }

  /* ================= Carga desde db ================= */
  async function cargarDb() {
    if (!db) return;
    var rutas = ["config/poder", "frases/banco", "cache/ticktick", "cache/dropi", "estado/hoy", "marcas/ultima"];
    var docs = await Promise.all(rutas.map(function (r) {
      try { return db.doc(r).get().then(function (s) { return s.exists ? s.data() : null; }, function () { return null; }); }
      catch (e) { return Promise.resolve(null); }
    }));
    var reg = {};
    try {
      var q = await db.collection("registro").orderBy("fecha", "desc").limit(60).get();
      q.docs.forEach(function (d) { var x = d.data(); if (x && x.fecha) { reg[x.fecha] = x; S.firmas["registro/" + x.fecha] = canon(x); } });
    } catch (e) { /* sin registro */ }
    S.registroDb = reg;

    aplicarConfig(docs[0]);
    aplicarBanco(docs[1]);

    var tt = docs[2];
    if (tt && Array.isArray(tt.checkins)) {
      var cache = {};
      KEYS.forEach(function (k) { cache[k] = {}; });
      tt.checkins.forEach(function (it) {
        var key = it && POR_ID[it.habitId];
        if (!key) return;
        (it.checkins || []).forEach(function (c) { if (c && Number(c.status) === 2 && c.stamp) cache[key][Number(c.stamp)] = true; });
      });
      S.ttCache = cache;
      S.firmas["cache/ticktick"] = canon(tt.checkins);
      S.ttDbStored = Date.parse(tt.storedAt) || 0;
      if (S.tt.origen !== "vivo") {
        KEYS.forEach(function (k) { S.tt.checks[k] = Object.assign({}, cache[k]); });
        S.tt.habits = Array.isArray(tt.habits) ? tt.habits : [];
        S.tt.storedAt = Date.parse(tt.storedAt) || 0;
        S.tt.origen = "cache";
      } else mezclarPasado();
    }

    var dr = docs[3];
    if (dr && Array.isArray(dr.items)) {
      S.dr.items = dr.items;
      S.dr.storedAt = Date.parse(dr.storedAt) || 0;
      var v = dr.vistos && typeof dr.vistos === "object" ? dr.vistos : null;
      if (!v) {
        v = {};
        dr.items.forEach(function (it) { if (it && it.order_id != null) v[String(it.order_id)] = stampDe(it.created_at) || stampHoy(); });
      }
      Object.keys(S.dr.vistos).forEach(function (id) { if (!(id in v)) v[id] = S.dr.vistos[id]; });
      S.dr.vistos = v;
      S.dr.base = true;
    }

    var mk = docs[5];
    if (mk && mk.frasesVistas) {
      var ya = !!S.fraseMostrada; // si la frase de hoy ya se eligió, no se pisa con lo viejo
      if (!ya) {
        S.marcas.entrada = mk.frasesVistas.entrada || "";
        S.marcas.entradaFecha = mk.entradaFecha || "";
      }
      if (!S.marcas.golpe) S.marcas.golpe = mk.frasesVistas.golpe || "";
      if (!ya) S.firmas["marcas/ultima"] = canon({ frasesVistas: { entrada: S.marcas.entrada, golpe: S.marcas.golpe }, entradaFecha: S.marcas.entradaFecha });
    }
    S.hoy = stampHoy();
    S.estadoPrevio = docs[4];
  }

  /* ================= Apertura ================= */
  var ap = { seguro: null, activa: false, hitos: 0 };

  function tel(txt) {
    var cont = $("#tel-hitos");
    if (!cont) return;
    var d = document.createElement("div");
    d.textContent = txt;
    cont.appendChild(d);
    while (cont.children.length > 5) cont.removeChild(cont.firstChild);
  }
  function horaTel() {
    var p = partes(new Date(), S.cfg.zona);
    var t = $("#tel-hora");
    if (t) t.textContent = "BOGOTÁ · " + dosD(p.hour) + ":" + dosD(p.minute) + ":" + dosD(p.second);
  }
  function revelar(nombre) {
    $$('.rv[data-rv="' + nombre + '"]').forEach(function (n) { n.classList.add("on"); });
  }

  function hito(nombre) {
    if (!ap.activa) return;
    var c = S.calc;
    if (nombre === "ojos") {
      el.velo.classList.add("abre");
      revelar("rango");
      tel("OJOS · azul y rojo encendidos");
    } else if (nombre === "alas") {
      S.poderListo = true;
      S.mostrado = 0;
      contarA(c ? c.total : 0, 1500);
      tel("ALAS · desplegadas");
    } else if (nombre === "plumas") {
      revelar("habitos");
      var n = c ? KEYS.filter(function (k) { return c.hoy[k]; }).length : 0;
      tel("PLUMAS · " + n + " de 5 encendidas");
    } else if (nombre === "aura") {
      revelar("frase"); revelar("resto");
      tel("AURA · " + (c && S.tt.origen !== "nada" ? c.rango.nombre : "en espera"));
    }
  }

  function terminarApertura() {
    if (!ap.activa) return;
    ap.activa = false; S.enApertura = false;
    clearTimeout(ap.seguro);
    el.app.removeAttribute("data-ap");
    $$(".rv").forEach(function (n) { n.classList.add("on"); });
    el.velo.classList.add("abre"); el.velo.classList.add("fuera");
    S.poderListo = true;
    seguro(renderTodo);
    contarA(S.calc ? S.calc.total : 0, 600);
    if (S.escenaPend) { S.escenaPend = false; }
    esc("setEstado", estadoEscena());
    if (S.entregasPend) animarEntregas();
  }

  async function correrApertura() {
    if (S.reducido) { terminarApertura(); return; }
    ap.activa = true; S.enApertura = true;
    el.app.setAttribute("data-ap", "1");
    $$(".rv").forEach(function (n) { n.classList.remove("on"); });
    el.velo.classList.remove("abre", "fuera");
    S.poderListo = false; S.mostrado = 0; el.poder.textContent = "0";
    var th = $("#tel-hitos"); if (th) th.textContent = "";
    horaTel();
    seguro(function () { revealFrase(); });
    clearTimeout(ap.seguro);
    ap.seguro = setTimeout(function () {
      if (ap.activa) { esc("saltar"); terminarApertura(); }
    }, 8000);
    try {
      esc("setEstado", estadoEscena());
      await conLimite(esc("apertura", { onHito: hito }), 8500);
    } catch (e) { /* si la escena falla, el tablero igual aparece */ }
    terminarApertura();
  }

  function revealFrase() {
    if (!S.fraseMostrada) S.fraseMostrada = fraseDelDia();
    renderFrase();
    persistirMarcas();
  }

  function saltarApertura() {
    if (!ap.activa) return;
    esc("saltar");
    terminarApertura();
  }

  /* ================= Eventos ================= */
  function enlazar() {
    $$(".hab").forEach(function (card) {
      var b = $(".btn-hecho", card);
      b.addEventListener("click", function () { marcar(card.getAttribute("data-key")); });
    });
    el.btnDropi.addEventListener("click", function () { leerDropi(true); });
    el.btnDropi2.addEventListener("click", function () { leerDropi(true); });
    el.btnTT.addEventListener("click", function () { releerTickTick(); });
    $("#btn-saltar").addEventListener("click", saltarApertura);
    $("#btn-apertura").addEventListener("click", function () { if (!ap.activa && !S.reducido) correrApertura(); });
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && ap.activa) { ev.preventDefault(); saltarApertura(); }
    });
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) { S.ocultoDesde = Date.now(); return; }
      var hoyNuevo = stampHoy();
      if (hoyNuevo !== S.hoy) { recargarDia(); } else { seguro(renderRelativos); }
    });
    setInterval(function () { if (!document.hidden) seguro(renderRelativos); }, 30000);
    setInterval(function () {
      if (!el.velo.classList.contains("fuera")) horaTel();
    }, 1000);
  }

  async function recargarDia() {
    S.fraseMostrada = "";
    S.firmas["estado/hoy"] = null;
    if (mcp) await leerTickTick();
    renderTodo();
    S.fraseMostrada = fraseDelDia(); renderFrase();
    empujarEscena(); persistirTodo();
    if (mcp && (!S.dr.storedAt || Date.now() - S.dr.storedAt > SEIS_H)) leerDropi(false);
  }

  /* ================= Arranque ================= */
  async function iniciar() {
    cacheEl();
    S.reducido = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    S.hoy = stampHoy();
    enlazar();
    horaTel();

    try {
      var E = window.Escena;
      if (E && typeof E.init === "function") E.init($("#escena"), { reducido: S.reducido });
      else el.app.classList.add("sin-3d");
    } catch (e) { el.app.classList.add("sin-3d"); }

    if (S.reducido) {
      el.app.removeAttribute("data-ap");
      $$(".rv").forEach(function (n) { n.classList.add("on"); });
      S.poderListo = true;
    }
    seguro(renderTodo);
    esc("setEstado", estadoEscena());

    var capsP = Promise.all([usar("db"), usar("mcp")]).then(function (r) { db = r[0]; mcp = r[1]; });
    var dbP = capsP.then(cargarDb).catch(function () { /* sigue en memoria */ });
    var ttP = capsP.then(function () {
      if (!mcp) { S.tt.leyendo = false; if (S.tt.origen === "nada") S.tt.error = "Sin conexión con TickTick"; return false; }
      return leerTickTick();
    });

    // La apertura arranca en cuanto hay caché (máx. 1,5 s) y los datos vivos se acomodan mientras corre.
    await Promise.race([dbP, esperar(1500)]);
    S.fraseMostrada = fraseDelDia();
    seguro(renderTodo);
    if (!S.reducido) correrApertura();

    await Promise.all([dbP, ttP]);
    seguro(renderTodo);
    empujarEscena();
    persistirTodo();

    if (mcp && (!S.dr.storedAt || Date.now() - S.dr.storedAt > SEIS_H)) await leerDropi(false);
    else seguro(renderEntregas);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
