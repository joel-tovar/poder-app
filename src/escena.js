/* PODER · ESCENA v4 — el personaje de Joel, 3D articulado y animado, estilo anime.
   Global window.Escena (sin módulos). Three.js r128 ya cargado como THREE. Ningún otro script.
   Jerarquía de Object3D con pivotes (pelvis → torso → pecho → cuello → cabeza → mechones; hombros → brazos → codos → antebrazos → puños;
   caderas → muslos → rodillas → pantorrillas → pies; alas de 3 segmentos con 18 plumas; capa de 8 tiras con 4 segmentos en péndulo).
   MeshToonMaterial con gradientMap de 3 pasos + contorno por casco invertido. La cara es el recorte de img/personaje.webp.
   Reposo permanente + gestos de cuerpo completo (apertura, 5 hábitos, carga→estallido, sobrecarga, entrega). API idéntica a CONTRATO.md §3.
   Lado «D» = derecha del espectador (x>0), «I» = izquierda (x<0). Todas las poses se escriben en espacio D; el lado I cuelga de un padre con scale.x = -1. */
(function (global) {
  'use strict';
  var THREE = global.THREE;

  // ---------------------------------------------------------------- constantes
  var RUTA_IMG = 'img/personaje.webp';
  var COL = {
    fondo: '#05060B', azul: '#4FB8FF', rojo: '#FF3B4E', oro: '#FFD166',
    rango: ['#7A4A1E', '#B8651F', '#E08A2E', '#F2B33D', '#FFD166', '#FFE48A', '#FFF1B8', '#FFF8DC', '#FFFCEF', '#FFFFFF'],
    hab: { leer: '#4FD8E8', escribir: '#FFD166', meditar: '#8B7BFF', ayuno: '#FF6FD8', dormir: '#4E7BFF' }
  };
  var ORDEN = ['leer', 'escribir', 'meditar', 'ayuno', 'dormir'];
  var SC = 4.2;                                              // el personaje mide 2.0 en su espacio; en el mundo 8.4
  var TY = 5.4, FOV = 40;                                    // punto que mira la cámara (pecho/cara), cámara baja
  var DUR = { apertura: 6.6, subir: 2.05, sobre: 3.35, entrega: 1.05 };
  var NPART = 2000, NBAN = 10;
  var AZ_AUTO = 0.21, AZ_MAX = 0.785;                        // vaivén ±12°, arrastre hasta ±45°
  var REF_W = 600;
  // anatomía (unidades del personaje)
  var Y_PELVIS = 0.875, L_MUSLO = 0.40, L_PANT = 0.40, L_BRAZO = 0.27, L_ANTE = 0.25;
  var HOMBRO = { x: 0.31, y: 0.31 };                         // en el espacio del pecho (D)
  var SK = { rx: 0.108, ry: 0.1123, rz: 0.1058, cy: 0.1163, cz: -0.006 };   // cráneo 1 × 1.04 × 0.98, más cuadrado; la línea de los ojos es el 50 % de la altura
  var Y_BOCA = 0.0534;                                       // línea de la boca (78 % de la altura desde arriba): aquí se parte la mandíbula
  var Y_OJO = SK.cy;

  // ---------------------------------------------------------------- utilería
  function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function sstep(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function rampa(a, b, x) { return clamp((x - a) / (b - a), 0, 1); }
  function eOut(t) { t = clamp(t, 0, 1); return 1 - Math.pow(1 - t, 3); }
  function eIO(t) { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function eBack(t) { t = clamp(t, 0, 1); var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function damp(cur, tgt, k, dt) { return cur + (tgt - cur) * (1 - Math.exp(-k * dt)); }
  function hex(h) { var n = parseInt(h.replace('#', ''), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }
  function mezclaC(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
  var RANGOC = COL.rango.map(hex), HABC = {}, HABL = [];
  ORDEN.forEach(function (k) { HABC[k] = hex(COL.hab[k]); HABL.push(HABC[k]); });
  var CAZUL = hex(COL.azul), CROJO = hex(COL.rojo), COROC = hex(COL.oro), CBLANCO = [1, 1, 1];

  function wrapA(d) { return d - 6.283185307 * Math.round(d / 6.283185307); }

  // ---------------------------------------------------------------- estado público (idempotente)
  var E = { rangoIdx: 0, prog: 0, habitos: { leer: false, escribir: false, meditar: false, ayuno: false, dormir: false }, perfecto: false, entregas: 0 };
  var estVer = 0, perfPost = false;
  var S = null;   // escena montada

  // ---------------------------------------------------------------- texturas generadas
  function lienzo(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h || w; return c; }
  function texCanvas(c, mip) {
    var t = new THREE.CanvasTexture(c); t.generateMipmaps = !!mip; t.minFilter = mip ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter; t.needsUpdate = true; return t;
  }
  function texGlow() {
    var c = lienzo(128), x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.18, 'rgba(255,255,255,.7)'); g.addColorStop(0.5, 'rgba(255,255,255,.16)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128); return texCanvas(c);
  }
  function texPiso() {   // suelo negro pulido: leve brillo azulado al centro, se funde con el fondo lejos
    var c = lienzo(256), x = c.getContext('2d'), g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgb(15,19,34)'); g.addColorStop(0.35, 'rgb(9,11,21)'); g.addColorStop(0.8, 'rgb(5,6,11)'); g.addColorStop(1, 'rgba(5,6,11,0)');
    x.fillStyle = g; x.fillRect(0, 0, 256, 256); return texCanvas(c);
  }
  function texRayos() {   // rayos radiales (aura dorada del día perfecto)
    var c = lienzo(256), x = c.getContext('2d'), i;
    x.translate(128, 128);
    for (i = 0; i < 28; i++) {
      x.save(); x.rotate(i / 28 * Math.PI * 2 + (i % 3) * 0.05);
      var g = x.createLinearGradient(0, 0, 128, 0); g.addColorStop(0, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; var w = 1.5 + (i % 4) * 1.2; x.beginPath(); x.moveTo(6, -w * 0.3); x.lineTo(128, -w); x.lineTo(128, w); x.lineTo(6, w * 0.3); x.fill(); x.restore();
    }
    var g2 = x.createRadialGradient(0, 0, 0, 0, 0, 128); g2.addColorStop(0, 'rgba(0,0,0,0)'); g2.addColorStop(1, 'rgba(0,0,0,1)');
    x.globalCompositeOperation = 'destination-out'; x.fillStyle = g2; x.fillRect(-128, -128, 256, 256);
    return texCanvas(c);
  }
  function texLuna() {
    var c = lienzo(256), x = c.getContext('2d');
    var g = x.createRadialGradient(128, 128, 20, 128, 128, 128); g.addColorStop(0, 'rgba(160,190,255,.35)'); g.addColorStop(1, 'rgba(78,123,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    x.fillStyle = '#dbe6ff'; x.beginPath(); x.arc(128, 128, 70, 0, Math.PI * 2); x.fill();
    x.globalCompositeOperation = 'destination-out'; x.beginPath(); x.arc(158, 112, 62, 0, Math.PI * 2); x.fill();
    return texCanvas(c);
  }
  function texPagina() {   // página de luz con renglones
    var c = lienzo(128), x = c.getContext('2d');
    var g = x.createLinearGradient(0, 0, 128, 0); g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(1, 'rgba(255,255,255,.55)');
    x.fillStyle = g; x.beginPath(); x.moveTo(6, 4); x.lineTo(122, 12); x.lineTo(122, 116); x.lineTo(6, 124); x.closePath(); x.fill();
    x.globalCompositeOperation = 'destination-out'; x.fillStyle = 'rgba(0,0,0,.5)';
    for (var i = 0; i < 8; i++) x.fillRect(18, 22 + i * 12, 82 - (i % 3) * 14, 3);
    return texCanvas(c);
  }
  function texCaja() {   // caja de luz (entregas)
    var c = lienzo(128), x = c.getContext('2d');
    x.strokeStyle = '#fff'; x.lineWidth = 5; x.lineJoin = 'round';
    x.beginPath(); x.moveTo(64, 14); x.lineTo(112, 38); x.lineTo(112, 90); x.lineTo(64, 114); x.lineTo(16, 90); x.lineTo(16, 38); x.closePath(); x.stroke();
    x.beginPath(); x.moveTo(16, 38); x.lineTo(64, 62); x.lineTo(112, 38); x.moveTo(64, 62); x.lineTo(64, 114); x.stroke();
    var g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128); return texCanvas(c);
  }

  // ---------------------------------------------------------------- shaders del mundo (el personaje usa MeshStandardMaterial parcheado)
  var VS_UV = 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}';
  var FS_ANILLO =
    'precision highp float;uniform vec3 uCol;uniform float uOp;uniform float uT;uniform float uK;uniform float uSp;uniform float uWhite;varying vec2 vUv;' +
    'void main(){vec2 p=vUv-0.5;float d=length(p)*2.0;float ang=atan(p.y,p.x);' +
    'float ring=smoothstep(0.012,0.0,abs(d-0.95));float glow=exp(-pow((d-0.95)/0.045,2.0))*0.4;' +
    'float dash=0.4+0.6*smoothstep(-0.3,0.8,sin(ang*uK+uT*uSp));' +
    'float a=(ring+glow)*dash*uOp;vec3 c=mix(uCol,vec3(1.0),uWhite);gl_FragColor=vec4(c,a);}';
  var FS_ONDA =
    'precision highp float;uniform vec3 uCol;uniform float uP;uniform float uOp;varying vec2 vUv;' +
    'void main(){float d=length(vUv-0.5)*2.0;float r=uP;float w=0.05+0.05*uP;float ring=exp(-pow((d-r)/w,2.0));' +
    'float a=ring*(1.0-uP)*uOp*(1.0-smoothstep(0.85,1.0,d));gl_FragColor=vec4(uCol,a);}';
  var VS_PTS = 'attribute float aSize;attribute vec4 aCol;uniform float uPx;varying vec4 vC;' +
    'void main(){vC=aCol;vec4 mv=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mv;gl_PointSize=aSize*uPx/max(0.1,-mv.z);}';
  var FS_PTS = 'precision highp float;varying vec4 vC;void main(){float d=length(gl_PointCoord-vec2(0.5));if(d>0.5)discard;float a=pow(1.0-d*2.0,1.6);gl_FragColor=vec4(vC.rgb,vC.a*a);}';

  // ---------------------------------------------------------------- geometrías propias (no dependen de las de THREE)
  var GEO = {};   // caché por clave; se libera al destruir
  function bg(P, I, N) {
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P), 3));
    if (N) g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(N), 3));
    g.setIndex(I);
    if (!N) g.computeVertexNormals();
    return g;
  }
  // loft: secciones elípticas [{y, rx, rz, cx, cz}] unidas en un tubo suave (cualquier sentido de y). Los extremos con radio ≈0 cierran la pieza.
  function loft(sec, n) {
    var P = [], I = [], m = sec.length, i, k, a, b, c, d, k2;
    for (i = 0; i < m; i++) { var s = sec[i], cx = s.cx || 0, cz = s.cz || 0; for (k = 0; k < n; k++) { var an = k / n * 6.283185307, cc = Math.cos(an), sn = Math.sin(an), ee = s.ex ? 2 / s.ex : 1; P.push(cx + s.rx * (cc < 0 ? -1 : 1) * Math.pow(Math.abs(cc), ee), s.y, cz + s.rz * (sn < 0 ? -1 : 1) * Math.pow(Math.abs(sn), ee)); } }
    var up = sec[m - 1].y >= sec[0].y;
    for (i = 0; i < m - 1; i++) for (k = 0; k < n; k++) {
      k2 = (k + 1) % n; a = i * n + k; b = i * n + k2; c = (i + 1) * n + k; d = (i + 1) * n + k2;
      if (up) I.push(a, c, b, b, c, d); else I.push(a, b, c, b, d, c);
    }
    return bg(P, I);
  }
  function esfera(rx, ry, rz, nu, nv, o) {   // elipsoide (o parte de él); th desde el polo +y, ph desde +x hacia +z. Normales analíticas.
    o = o || {};
    var th0 = o.th0 || 0, th1 = o.th1 == null ? Math.PI : o.th1, ph0 = o.ph0 || 0, ph1 = o.ph1 == null ? 6.283185307 : o.ph1, P = [], N = [], I = [], i, j;
    for (i = 0; i <= nv; i++) {
      var th = th0 + (th1 - th0) * i / nv, st = Math.sin(th), ct = Math.cos(th);
      for (j = 0; j <= nu; j++) {
        var ph = ph0 + (ph1 - ph0) * j / nu, x = st * Math.cos(ph), z = st * Math.sin(ph), y = ct;
        P.push(rx * x, ry * y, rz * z);
        var nx = x / rx, ny = y / ry, nz = z / rz, l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1; N.push(nx / l, ny / l, nz / l);
      }
    }
    for (i = 0; i < nv; i++) for (j = 0; j < nu; j++) { var a = i * (nu + 1) + j, b = a + 1, c = a + nu + 1, d = c + 1; I.push(a, b, c, b, d, c); }
    return bg(P, I, N);
  }
  function anillo(rx, rz, r, nu, nv) {   // toro elíptico en el plano xz (cinturón)
    var P = [], N = [], I = [], i, j;
    for (i = 0; i <= nu; i++) {
      var a = i / nu * 6.283185307, ca = Math.cos(a), sa = Math.sin(a), nx = rz * ca, nz = rx * sa, l = Math.sqrt(nx * nx + nz * nz) || 1; nx /= l; nz /= l;
      for (j = 0; j <= nv; j++) {
        var b = j / nv * 6.283185307, cb = Math.cos(b), sb = Math.sin(b);
        P.push(rx * ca + r * cb * nx, r * sb, rz * sa + r * cb * nz); N.push(cb * nx, sb, cb * nz);
      }
    }
    for (i = 0; i < nu; i++) for (j = 0; j < nv; j++) { var q = i * (nv + 1) + j, q2 = q + 1, q3 = q + nv + 1, q4 = q3 + 1; I.push(q, q2, q3, q2, q4, q3); }
    return bg(P, I, N);
  }
  function tubo(pts, rad, nr) {   // tubo de radio variable a lo largo de una curva (mechones)
    var P = [], I = [], m = pts.length, i, k;
    for (i = 0; i < m; i++) {
      var p0 = pts[Math.max(0, i - 1)], p1 = pts[Math.min(m - 1, i + 1)], tx = p1.x - p0.x, ty = p1.y - p0.y, tz = p1.z - p0.z, l = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1;
      tx /= l; ty /= l; tz /= l;
      var rx = Math.abs(tx) > 0.9 ? 0 : 1, ry = rx ? 0 : 1;      // referencia no paralela
      var nx = ty * 0 - tz * ry, ny = tz * rx - tx * 0, nz = tx * ry - ty * rx, ln = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1; nx /= ln; ny /= ln; nz /= ln;
      var bx = ny * tz - nz * ty, by = nz * tx - nx * tz, bz = nx * ty - ny * tx;   // B = N × T
      for (k = 0; k < nr; k++) { var an = k / nr * 6.283185307, c = Math.cos(an) * rad[i], s = Math.sin(an) * rad[i]; P.push(pts[i].x + nx * c + bx * s, pts[i].y + ny * c + by * s, pts[i].z + nz * c + bz * s); }
    }
    for (i = 0; i < m - 1; i++) for (k = 0; k < nr; k++) { var k2 = (k + 1) % nr, a = i * nr + k, b = i * nr + k2, c2 = (i + 1) * nr + k, d = (i + 1) * nr + k2; I.push(a, c2, b, b, c2, d); }
    return bg(P, I);
  }
  function plumaGeo(fuera) {   // pluma unitaria: largo 1 en +x, medio ancho 0.5 en y; arco hacia atrás y costilla central adelantada (dos tonos con el toon)
    var rows = [0, 0.14, 0.38, 0.62, 0.82, 1.0], P = [], I = [], r;
    rows.forEach(function (s) {
      var hw = 0.5 * Math.pow(Math.sin(Math.PI * Math.pow(Math.max(s, 1e-4), 0.7)), 0.75), zc = -0.035 * s * s, x = s, e = 0;
      if (fuera) { hw += (s < 0.99 ? 0.04 : 0.02); if (s >= 0.99) x = 1.04; if (s < 0.01) { x = -0.02; hw += 0.03; } e = -0.002; }
      zc += e;
      P.push(x, hw, zc, x, 0, zc + 0.011, x, 0, zc + 0.011, x, -hw, zc);   // izq, centro-izq, centro-der, der
    });
    for (r = 0; r < rows.length - 1; r++) {
      var a = r * 4, b = (r + 1) * 4;
      I.push(a, b, a + 1, a + 1, b, b + 1);               // mitad izquierda (+y)
      I.push(a + 2, b + 2, a + 3, a + 3, b + 2, b + 3);   // mitad derecha (-y)
    }
    return bg(P, I);
  }
  function capaSeg(w, l, arco) {   // tira de tela: origen arriba al centro, cuelga hacia -y; 3×2 celdas con leve arco
    var xs = [-w / 2, -w / 6, w / 6, w / 2], ys = [0, -l / 2, -l], P = [], I = [], i, j;
    for (j = 0; j < 3; j++) for (i = 0; i < 4; i++) { var u = xs[i] / (w / 2); P.push(xs[i], ys[j], -arco * (1 - u * u)); }
    for (j = 0; j < 2; j++) for (i = 0; i < 3; i++) { var a = j * 4 + i, b = a + 1, c = a + 4, d = c + 1; I.push(a, c, b, b, c, d); }
    return bg(P, I);
  }
  function placa(w, h) {   // rectángulo plano mirando a +z, centrado
    return bg([-w / 2, h / 2, 0, w / 2, h / 2, 0, -w / 2, -h / 2, 0, w / 2, -h / 2, 0], [0, 2, 1, 1, 2, 3], [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
  }
  // cabeza = domo craneal arriba + bloque de mandíbula abajo (caja redondeada: ancho 0.92 del cráneo, profundidad 0.85, taper 0.90, barbilla ancha y plana)
  var BLOQ = { rx: 0.0995, rz: 0.09 };
  function secCabeza(y) {
    if (y >= Y_OJO) { var u = (y - SK.cy) / SK.ry, w = Math.sqrt(Math.max(0, 1 - Math.pow(clamp(u, 0, 1), 2.3))); return { rx: SK.rx * w, rz: SK.rz * w, cz: SK.cz, ex: 2 }; }
    var tt = clamp((Y_OJO - y) / (Y_OJO - 0.004), 0, 1), s = sstep(0, 0.030, Y_OJO - y), b = clamp((0.016 - y) / 0.012, 0, 1), bev = 1 - 0.16 * b * b;
    var rx = lerp(SK.rx, BLOQ.rx * (1 - 0.10 * tt) * bev, s), rz = lerp(SK.rz, BLOQ.rz * (1 - 0.06 * tt) * bev, s), zf = SK.cz + SK.rz;   // el frente queda a ras: la cara es plana
    return { rx: rx, rz: rz, cz: lerp(SK.cz, zf - BLOQ.rz * (1 - 0.06 * tt), s), ex: 2 + 2.2 * s };
  }
  function supZ(x, y) { var q = secCabeza(y), a = Math.abs(x) / Math.max(q.rx, 1e-4); return q.cz + q.rz * Math.pow(Math.max(0.0, 1 - Math.pow(Math.min(a, 1), q.ex)), 1 / q.ex) ; }   // z de la piel en (x,y)
  function sub(g, idx) {   // geometría con los mismos atributos y otro índice
    var h = new THREE.BufferGeometry(), k;
    for (k in g.attributes) h.setAttribute(k, g.attributes[k]);
    h.setIndex(idx); return h;
  }
  function expandir(g, idx, yPlano) {   // vértices propios por triángulo; por debajo de yPlano la normal es la de la cara (aristas marcadas con el toon)
    var P = g.attributes.position.array, N = g.attributes.normal.array, np = [], nn = [], ni = [], t, j, n0 = 0;
    for (t = 0; t < idx.length; t += 3) {
      var a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3, ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      var fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx, fl = Math.sqrt(fx * fx + fy * fy + fz * fz), plano = (P[a + 1] + P[b + 1] + P[c + 1]) / 3 < yPlano && fl > 1e-12, v = [a, b, c];
      for (j = 0; j < 3; j++) { np.push(P[v[j]], P[v[j] + 1], P[v[j] + 2]); if (plano) nn.push(fx / fl, fy / fl, fz / fl); else nn.push(N[v[j]], N[v[j] + 1], N[v[j] + 2]); ni.push(n0++); }
    }
    return bg(np, ni, nn);
  }
  function linCap(ax, f) {   // borde inferior del casquete: frente visible = trapecio central; en los lados baja al nivel de los ojos; patillas cortas; hasta la nuca
    if (f >= 0.2) {
      var tr = clamp((ax - 0.42) / 0.33, 0, 1); tr = tr * tr * (3 - 2 * tr);
      var l = lerp(0.184, 0.118, tr);
      if (ax > 0.80) l = Math.min(l, lerp(0.118, 0.09, clamp((ax - 0.80) / 0.14, 0, 1)));
      return l;
    }
    if (f >= -0.2) return 0.128;
    return lerp(0.128, 0.020, clamp((-f - 0.2) / 0.8, 0, 1));
  }
  function cabezaPartes() {   // cráneo y mandíbula (partidos en la línea de la boca) y casquete de pelo (copia recortada, 1.09 a los lados)
    var ys = [], i, j;
    for (i = 0; i <= 9; i++) ys.push(SK.cy + SK.ry * Math.cos(i / 9 * Math.PI / 2));
    ys.push(0.108, 0.100, 0.092, 0.082, 0.072, Y_BOCA, 0.040, 0.028, 0.019, 0.012, 0.0075, 0.0045, 0.0036);
    var k = ys.indexOf(Y_BOCA), NR = 32;
    var g = loft(ys.map(function (yy) { var q = secCabeza(yy); return { y: yy, rx: Math.max(q.rx, 1e-4), rz: Math.max(q.rz, 1e-4), cz: q.cz, ex: q.ex }; }), NR);
    var P = g.attributes.position.array, n = P.length / 3, I = g.index.array;
    var A = [], B = [], C = [];
    for (i = 0; i < I.length; i += 6) {
      var q = Math.floor(i / 6), par = Math.floor(q / NR), dst = par >= k ? B : A, cy = 0, cz = 0, cx = 0;
      for (j = 0; j < 6; j++) { dst.push(I[i + j]); cx += P[I[i + j] * 3]; cy += P[I[i + j] * 3 + 1]; cz += P[I[i + j] * 3 + 2]; }
      cx /= 6; cy /= 6; cz /= 6;
      if (par < k) { var sc = secCabeza(cy); if (cy > linCap(Math.abs(cx) / Math.max(sc.rx, 1e-4), clamp((cz - sc.cz) / Math.max(sc.rz, 1e-4), -1, 1))) for (j = 0; j < 6; j++) C.push(I[i + j]); }
    }
    var Q = new Float32Array(P.length);
    for (i = 0; i < n; i++) { Q[i * 3] = P[i * 3] * 1.09; Q[i * 3 + 1] = SK.cy + (P[i * 3 + 1] - SK.cy) * 1.06; Q[i * 3 + 2] = SK.cz + (P[i * 3 + 2] - SK.cz) * 1.07; }
    var cap = new THREE.BufferGeometry(); cap.setAttribute('position', new THREE.BufferAttribute(Q, 3)); cap.setAttribute('normal', g.attributes.normal); cap.setIndex(C);
    var cra = expandir(g, A, Y_OJO + 0.0005), jaw = expandir(g, B, Y_OJO + 0.0005);
    return { cra: cra, jaw: jaw, cap: cap, craO: contorno(sub(g, A), 0.0025), jawO: contorno(sub(g, B), 0.0025) };
  }
  function cejaGeo(s) {   // prisma curvo grueso, ceño ≈12° hacia adentro; el origen es su extremo interior
    var pts = [], rad = [], N = 8, k, x0 = 0.026, x1 = 0.084, y0 = Y_OJO + 0.0157 + 0.0135, p0 = null;
    for (k = 0; k <= N; k++) {
      var u = k / N, x = x0 + (x1 - x0) * u, y = y0 + (x - x0) * 0.2126 + 0.004 * Math.sin(Math.PI * u), z = supZ(x, y) + 0.0042;
      var p = { x: s * x, y: y, z: z }; if (!p0) p0 = p; pts.push({ x: p.x - p0.x, y: p.y - p0.y, z: p.z - p0.z });
      rad.push(Math.max(0.0025, 0.0045 * (1 - 0.55 * Math.pow(u, 1.5))));
    }
    var g = tubo(pts, rad, 5); g.userData = { o: [p0.x, p0.y, p0.z] }; return g;
  }
  function narizGeo() {   // solo un puente mínimo
    var sec = [{ y: 0.128, w: 0.0035, d: 0.003, p: 0.0005 }, { y: 0.105, w: 0.0045, d: 0.0045, p: 0.0025 }, { y: 0.085, w: 0.006, d: 0.0065, p: 0.0055 }, { y: 0.078, w: 0.001, d: 0.001, p: 0.006 }];
    return loft(sec.map(function (q) { return { y: q.y, rx: q.w, rz: q.d, cz: supZ(0, q.y) + q.p }; }), 8);
  }
  function contorno(g, t) {   // casco invertido: la misma malla empujada t a lo largo de sus normales (se dibuja con BackSide)
    var P = g.attributes.position.array, N = g.attributes.normal.array, Q = new Float32Array(P.length), i;
    for (i = 0; i < P.length; i++) Q[i] = P[i] + N[i] * t;
    var h = new THREE.BufferGeometry();
    h.setAttribute('position', new THREE.BufferAttribute(Q, 3)); h.setAttribute('normal', g.attributes.normal); h.index = g.index; return h;
  }
  function uvPlano(g, cx, cy, R) {   // proyección plana desde el frente (x,y → u,v): la textura dorada de la hombrera se ve de frente
    var P = g.attributes.position.array, n = P.length / 3, U = new Float32Array(n * 2), i;
    for (i = 0; i < n; i++) { U[i * 2] = 0.5 + (P[i * 3] - cx) / (2 * R); U[i * 2 + 1] = 0.5 + (P[i * 3 + 1] - cy) / (2 * R); }
    g.setAttribute('uv', new THREE.BufferAttribute(U, 2)); return g;
  }
  function triCount(g) { return g.index ? g.index.count / 3 : g.attributes.position.count / 3; }
  function G(clave, fn) { return GEO[clave] || (GEO[clave] = fn()); }
  var UID = 0;
  function fundir(L) {   // une varias geometrías (con su desplazamiento) en una: posición, normal y, si existen, color y uv
    var P = [], N = [], C = null, U = null, I = [], base = 0, i;
    L.forEach(function (e) {
      var g = e.geo, p = g.attributes.position.array, n = g.attributes.normal.array, c = g.attributes.color, u = g.attributes.uv, ix = g.index.array, o = e.off || [0, 0, 0];
      for (i = 0; i < p.length; i += 3) { P.push(p[i] + o[0], p[i + 1] + o[1], p[i + 2] + o[2]); N.push(n[i], n[i + 1], n[i + 2]); }
      if (c) { C = C || []; for (i = 0; i < c.array.length; i++) C.push(c.array[i]); }
      if (u) { U = U || []; for (i = 0; i < u.array.length; i++) U.push(u.array[i]); }
      for (i = 0; i < ix.length; i++) I.push(ix[i] + base);
      base += p.length / 3;
    });
    var g2 = bg(P, I, N);
    if (C) g2.setAttribute('color', new THREE.BufferAttribute(new Float32Array(C), 3));
    if (U) g2.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(U), 2));
    return g2;
  }

  // ---------------------------------------------------------------- texturas del personaje
  function texGrad() {   // gradientMap de 3 pasos para el toon
    var t = new THREE.DataTexture(new Uint8Array([38, 140, 255]), 3, 1, THREE.LuminanceFormat);
    t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.unpackAlignment = 1; t.needsUpdate = true; return t;
  }
  function texGradP() {   // gradientMap de la piel: la sombra se queda en #9A6A4A (≈ 73 % del tono base)
    var t = new THREE.DataTexture(new Uint8Array([112, 192, 255]), 3, 1, THREE.LuminanceFormat);
    t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.unpackAlignment = 1; t.needsUpdate = true; return t;
  }
  function texEntorno() {   // cubo pequeño de degradados cálidos: da reflejo al oro metálico
    var caras = [], i;
    for (i = 0; i < 6; i++) {
      var c = lienzo(32), x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 32);
      if (i === 2) { g.addColorStop(0, '#fff3d0'); g.addColorStop(1, '#ffe2a0'); }              // +y (arriba)
      else if (i === 3) { g.addColorStop(0, '#2a2018'); g.addColorStop(1, '#15110c'); }          // -y (suelo)
      else { g.addColorStop(0, '#ffeab8'); g.addColorStop(0.5, '#a07c48'); g.addColorStop(1, '#2a2014'); }
      x.fillStyle = g; x.fillRect(0, 0, 32, 32); caras.push(c);
    }
    var t = new THREE.CubeTexture(caras); t.needsUpdate = true; return t;
  }
  // ---------------------------------------------------------------- materiales (real: toon + contorno; reflejo: básicos translúcidos)
  function materiales(modo) {
    var M = {}, i, k;
    var gm = S.tex.grad, DS = THREE.DoubleSide;
    if (modo === 'real') {
      var Tp = function (c, o) { var p = { color: c, gradientMap: S.tex.gradP }, q; if (o) for (q in o) p[q] = o[q]; return new THREE.MeshToonMaterial(p); };
      var T = function (c, o) { var p = { color: c, gradientMap: gm }, q; if (o) for (q in o) p[q] = o[q]; return new THREE.MeshToonMaterial(p); };
      M.negro = T(0x111318); M.piel = Tp(new THREE.Color(S.piel[0], S.piel[1], S.piel[2])); M.blanco = T(0xF2F0EA); M.capa = T(0xF3F1EA, { side: DS });
      M.bota = T(0x2A2B36); M.pelo = T(0x0B0B12, { emissive: new THREE.Color(0.003, 0.004, 0.01) });
      M.puntas = T(0xffffff, { vertexColors: true, emissive: new THREE.Color(0.003, 0.004, 0.01) });
      M.labio = T(0xB87863); M.esclera = T(0xF2F0EC); M.cuenca = Tp(0xB07A52); M.parpado = T(0x0A0A10); M.sombraN = T(0xB37E5C);
      M.pupila = new THREE.MeshBasicMaterial({ color: 0x050507 }); M.brillo = new THREE.MeshBasicMaterial({ color: 0xffffff });
      M.boca = new THREE.MeshBasicMaterial({ color: 0x1A0A0C }); M.linea = new THREE.MeshBasicMaterial({ color: 0x6E3F36 });
      M.irisI = T(0x4FB8FF, { emissive: new THREE.Color(0.31, 0.72, 1.0) }); M.irisD = T(0xFF3B4E, { emissive: new THREE.Color(1.0, 0.23, 0.31) });
      M.oro = new THREE.MeshStandardMaterial({ color: 0xD9A441, metalness: 0.9, roughness: 0.3, envMap: S.tex.env, envMapIntensity: 1.1, emissive: new THREE.Color(0.30, 0.18, 0.04), side: DS });
      M.oroH = new THREE.MeshStandardMaterial({ color: 0xE6B24E, metalness: 0.85, roughness: 0.32, envMap: S.tex.env, envMapIntensity: 1.1, emissive: new THREE.Color(0.22, 0.13, 0.03), side: DS });
      M.contorno = new THREE.MeshBasicMaterial({ color: 0x07070D, side: THREE.BackSide });
      M.contornoPl = new THREE.MeshBasicMaterial({ color: 0x35384C, side: DS, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
      M.plumas = []; for (i = 0; i < NBAN; i++) M.plumas.push(T(0xF8F8F4, { side: DS, emissive: new THREE.Color(0, 0, 0) }));
    } else {
      var B = function (c, o) { var p = { color: c, transparent: true, opacity: 0.18, depthWrite: false }, q; if (o) for (q in o) p[q] = o[q]; return new THREE.MeshBasicMaterial(p); };
      M.negro = B(0x111318); M.piel = B(new THREE.Color(S.piel[0], S.piel[1], S.piel[2])); M.blanco = B(0xF2F0EA); M.capa = B(0xF3F1EA, { side: DS });
      M.bota = B(0x2A2B36); M.pelo = B(0x0B0B12); M.puntas = B(0xffffff, { vertexColors: true });
      M.labio = B(0xB87863); M.esclera = B(0xF2F0EC); M.cuenca = B(0xB07A52); M.parpado = B(0x0A0A10); M.pupila = B(0x050507); M.brillo = B(0xffffff); M.sombraN = B(0xB37E5C);
      M.boca = B(0x1A0A0C); M.linea = B(0x6E3F36); M.irisI = B(0x4FB8FF); M.irisD = B(0xFF3B4E);
      M.oro = B(0xD9A441, { side: DS }); M.oroH = M.oro;
      var pl = B(0xF8F8F4, { side: DS }); M.plumas = []; for (i = 0; i < NBAN; i++) M.plumas.push(pl);
    }
    return M;
  }

  // ---------------------------------------------------------------- tablas del personaje
  // alas: huesos (húmero, antebrazo, mano) y 18 plumas por ala: [segmento, t a lo largo del hueso, ángulo relativo abierto, largo, ancho]
  var ALA = { rx: 0.12, ry: 0.27, rz: -0.11, H: 0.30, A: 0.40, M: 0.34, abierta: [0.66, -0.42, 0.32], plegada: [1.45, -2.75, 0.30] };
  var PLM = [
    ['M', 1.00, 0.34, 0.60, 0.150], ['M', 0.88, 0.20, 0.66, 0.150], ['M', 0.76, 0.06, 0.70, 0.152], ['M', 0.64, -0.08, 0.71, 0.152],
    ['M', 0.52, -0.22, 0.69, 0.152], ['M', 0.40, -0.36, 0.66, 0.150], ['M', 0.28, -0.50, 0.62, 0.150], ['M', 0.16, -0.64, 0.58, 0.148],
    ['A', 0.95, -0.30, 0.58, 0.160], ['A', 0.80, -0.47, 0.56, 0.160], ['A', 0.65, -0.64, 0.53, 0.160], ['A', 0.50, -0.81, 0.50, 0.160],
    ['A', 0.35, -0.98, 0.46, 0.158], ['A', 0.20, -1.15, 0.42, 0.156],
    ['H', 0.95, -1.72, 0.40, 0.150], ['H', 0.70, -1.88, 0.36, 0.148], ['H', 0.45, -2.04, 0.33, 0.146], ['H', 0.22, -2.20, 0.30, 0.144]
  ];
  var NPL = PLM.length;
  var PELOS = [   // a: azimut desde el frente (+ hacia +x) · e: elevación · L largo · d: dirección base · c: curva de la punta (+ adelante) · s: barrido lateral · r: radio en la raíz
    // 7 delanteros cortos: barridos 35-45° hacia adelante y arriba, punta curvada
    { a: -0.75, e: 0.95, L: 0.085, d: [-0.55, 1, 0.70], c: 0.8, s: -0.2, r: 0.026 }, { a: -0.50, e: 1.08, L: 0.100, d: [-0.35, 1, 0.78], c: 0.9, s: -0.1, r: 0.028 },
    { a: -0.20, e: 1.18, L: 0.115, d: [-0.12, 1, 0.84], c: 1.0, s: 0.1, r: 0.030 }, { a: 0.10, e: 1.22, L: 0.120, d: [0.08, 1, 0.90], c: 1.0, s: 0.25, r: 0.030 },
    { a: 0.38, e: 1.15, L: 0.110, d: [0.28, 1, 0.80], c: 1.0, s: 0.35, r: 0.029 }, { a: 0.65, e: 1.02, L: 0.095, d: [0.50, 1, 0.72], c: 0.9, s: 0.4, r: 0.027 },
    { a: 0.90, e: 0.88, L: 0.080, d: [0.75, 1, 0.62], c: 0.8, s: 0.3, r: 0.024 },
    // 4 traseros cortos: hacia atrás y abajo
    { a: -2.40, e: 0.80, L: 0.050, d: [-0.50, -0.40, -1.0], c: -0.4, s: 0, r: 0.020 }, { a: 2.40, e: 0.80, L: 0.052, d: [0.50, -0.40, -1.0], c: -0.4, s: 0, r: 0.020 },
    { a: -3.00, e: 0.92, L: 0.055, d: [-0.15, -0.30, -1.0], c: -0.4, s: 0, r: 0.020 }, { a: 3.00, e: 0.92, L: 0.052, d: [0.20, -0.30, -1.0], c: -0.4, s: 0, r: 0.020 },
    // 2 mechones cortos por lado: salen de la sien hacia afuera y atrás
    { a: -1.20, e: 0.30, L: 0.045, d: [-1.0, -0.10, -0.60], c: -0.2, s: 0, r: 0.014 }, { a: 1.20, e: 0.30, L: 0.045, d: [1.0, -0.10, -0.60], c: -0.2, s: 0, r: 0.014 },
    { a: -1.55, e: 0.38, L: 0.045, d: [-1.0, 0.0, -0.80], c: -0.2, s: 0, r: 0.014 }, { a: 1.55, e: 0.38, L: 0.045, d: [1.0, 0.0, -0.80], c: -0.2, s: 0, r: 0.014 },
    // 2 de flequillo, gruesos y cortos: nacen en la línea del pelo y caen sobre el tercio alto de la frente
    { a: -0.20, e: 0.62, L: 0.024, d: [-0.10, -1, 0.45], c: 0.2, s: -0.1, r: 0.018, fl: 1 }, { a: 0.20, e: 0.62, L: 0.024, d: [0.10, -1, 0.45], c: 0.2, s: 0.1, r: 0.018, fl: 1 }
  ];
  var NPE = PELOS.length;
  var CAPA_N = 12, CAPA_L = [0.26, 0.26, 0.25, 0.24], CAPA_W = 0.078;

  // ---------------------------------------------------------------- armado del personaje (se llama dos veces: real y reflejo)
  function construirRig(modo) {
    var M = materiales(modo), real = modo === 'real';
    var R = { modo: modo, n: {}, pl: [[], []], capa: [], pelo: [], ojo: [], tri: 0, mat: M };
    var raiz = new THREE.Group(); R.root = raiz; R.n.raiz = raiz;
    function nodo(nombre, padre, x, y, z, orden) { var g = new THREE.Group(); g.position.set(x, y, z); if (orden) g.rotation.order = orden; padre.add(g); if (nombre) R.n[nombre] = g; return g; }
    var lista = [];   // piezas estáticas por nodo: se funden por (nodo, material) para bajar las llamadas de dibujo
    function malla(g, clave, fn, mat, grosor, px, py, pz) {
      var geo = G(clave, fn), off = px != null ? [px, py, pz] : null;
      lista.push({ g: g, clave: clave, geo: geo, mat: mat, off: off });
      if (real && grosor) lista.push({ g: g, clave: clave + '#c', geo: G(clave + '#c', function () { return contorno(geo, grosor); }), mat: M.contorno, off: off });
    }
    function fusionar() {
      var grupos = {}, orden = [];
      lista.forEach(function (e) {
        if (!e.g.__nid) e.g.__nid = ++UID; if (!e.mat.__mid) e.mat.__mid = ++UID;
        var k = e.g.__nid + '|' + e.mat.__mid; if (!grupos[k]) { grupos[k] = []; orden.push(k); } grupos[k].push(e);
      });
      orden.forEach(function (k) {
        var L = grupos[k], e0 = L[0], geo, ck;
        if (L.length === 1) geo = e0.geo; else { ck = '+' + L.map(function (e) { return e.clave + (e.off ? '@' + e.off.join(',') : ''); }).join('+'); geo = G(ck, function () { return fundir(L); }); }
        var m = new THREE.Mesh(geo, e0.mat);
        if (L.length === 1 && e0.off) m.position.set(e0.off[0], e0.off[1], e0.off[2]);
        if (!real) m.renderOrder = 3;
        e0.g.add(m); R.tri += triCount(geo);
      });
    }
    function trasl(g, x, y, z) { g.translate(x, y, z); return g; }

    // tronco
    var pelvis = nodo('pelvis', raiz, 0, Y_PELVIS, 0, 'YXZ');
    malla(pelvis, 'pelvis', function () { return loft([{ y: -0.10, rx: 0.001, rz: 0.001 }, { y: -0.085, rx: 0.115, rz: 0.09 }, { y: -0.02, rx: 0.165, rz: 0.118 }, { y: 0.045, rx: 0.172, rz: 0.12 }, { y: 0.07, rx: 0.15, rz: 0.108 }], 18); }, M.blanco, 0.008);
    malla(pelvis, 'cinto', function () { return anillo(0.178, 0.126, 0.019, 28, 8); }, M.oro, 0, 0, 0.05, 0);
    malla(pelvis, 'hebilla', function () { return trasl(esfera(0.034, 0.042, 0.016, 8, 6), 0, 0, 0); }, M.oro, 0, 0, 0.05, 0.135);
    malla(pelvis, 'alasH', function () { var g = esfera(0.05, 0.012, 0.012, 8, 4); return g; }, M.oro, 0, 0, 0.052, 0.138);
    var torso = nodo('torso', pelvis, 0, 0.02, 0, 'YXZ');
    malla(torso, 'abdomen', function () { return loft([{ y: -0.03, rx: 0.164, rz: 0.114 }, { y: 0.06, rx: 0.15, rz: 0.106 }, { y: 0.17, rx: 0.162, rz: 0.108 }, { y: 0.27, rx: 0.19, rz: 0.116 }], 20); }, M.negro, 0.008);
    var pecho = nodo('pecho', torso, 0, 0.27, 0, 'YXZ');
    malla(pecho, 'pecho', function () {
      return loft([{ y: -0.01, rx: 0.19, rz: 0.116 }, { y: 0.09, rx: 0.226, rz: 0.128, cz: 0.012 }, { y: 0.19, rx: 0.248, rz: 0.134, cz: 0.014 }, { y: 0.29, rx: 0.256, rz: 0.118 }, { y: 0.345, rx: 0.15, rz: 0.092 }, { y: 0.39, rx: 0.062, rz: 0.062 }, { y: 0.405, rx: 0.001, rz: 0.001 }], 24);
    }, M.negro, 0.008);
    var cuello = nodo('cuello', pecho, 0, 0.355, 0, 'YXZ');
    malla(cuello, 'cuello', function () { return loft([{ y: -0.02, rx: 0.056, rz: 0.058 }, { y: 0.06, rx: 0.052, rz: 0.054 }, { y: 0.07, rx: 0.001, rz: 0.001 }], 14); }, M.piel, 0.006);
    malla(cuello, 'collar', function () { return loft([{ y: -0.03, rx: 0.078, rz: 0.076 }, { y: 0.02, rx: 0.07, rz: 0.068 }, { y: 0.055, rx: 0.064, rz: 0.062 }, { y: 0.062, rx: 0.001, rz: 0.001 }], 16); }, M.negro, 0.006);
    // cabeza esculpida: cráneo cuadrado, mandíbula articulada, casquete de pelo, cejas, ojos 3D, nariz mínima, boca, orejas
    var cabeza = nodo('cabeza', cuello, 0, 0.045, 0, 'YXZ'); cabeza.scale.set(1.1, 1.1, 1.1);   // cabeza 10 % más grande
    malla(cabeza, 'cra', function () { var p = cabezaPartes(); GEO.mandibula = p.jaw; GEO.casquete = p.cap; GEO.craO = p.craO; GEO.mandibulaO = p.jawO; return p.cra; }, M.piel, 0);
    malla(cabeza, 'casquete', function () { return GEO.casquete; }, M.pelo, 0);
    var mand = nodo('mandibula', cabeza, 0, 0.10, -0.04, 'XYZ'), MO = [0, -0.10, 0.04];
    malla(mand, 'mandibula', function () { return GEO.mandibula; }, M.piel, 0, MO[0], MO[1], MO[2]);
    if (real) {   // contorno suave (de las normales lisas) para el cráneo y el bloque de mandíbula, que se dibujan con caras planas
      lista.push({ g: cabeza, clave: 'craO', geo: GEO.craO, mat: M.contorno, off: null });
      lista.push({ g: mand, clave: 'mandibulaO', geo: GEO.mandibulaO, mat: M.contorno, off: MO });
    }
    malla(cabeza, 'boca', function () { return trasl(esfera(0.05, 0.02, 0.05, 8, 4), 0, 0.05, -0.005); }, M.boca, 0);
    if (real) malla(cabeza, 'lineaB', function () { return trasl(esfera(0.0305, 0.00135, 0.006, 8, 4), 0, Y_BOCA, supZ(0, Y_BOCA) + 0.002); }, M.linea, 0);
    malla(mand, 'labioI', function () { return trasl(esfera(0.019, 0.0035, 0.006, 10, 4), 0, 0.0455, supZ(0, 0.0455) + 0.0008); }, M.labio, 0, MO[0], MO[1], MO[2]);
    malla(cabeza, 'nBase', narizGeo, M.piel, 0);
    malla(cabeza, 'nPunta', function () { return trasl(esfera(0.0075, 0.006, 0.0075, 8, 6), 0, 0.080, supZ(0, 0.080) + 0.0065); }, M.piel, 0);
    malla(cabeza, 'nSombra', function () { return trasl(esfera(0.010, 0.0028, 0.006, 8, 4), 0, 0.0725, supZ(0, 0.0725) + 0.0045); }, M.sombraN, 0);
    [-1, 1].forEach(function (s) {
      malla(cabeza, 'oreja' + s, function () { return trasl(esfera(0.005, 0.018, 0.012, 8, 6), s * 0.1045, 0.112, -0.012); }, M.piel, 0.0018);
      // ceja: prisma curvo negro, el nodo pivota en su extremo interior (para fruncir)
      var cg = G('ceja' + s, function () { return cejaGeo(s); }), o = cg.userData.o;
      var ceja = nodo(null, cabeza, o[0], o[1], o[2], 'XYZ'); ceja.userData.y0 = o[1];
      malla(ceja, 'ceja' + s, function () { return cg; }, M.pelo, 0.0015);
      // ojo 3D: ancho 0.26 del ancho de la cabeza, alto 0.14 de su altura, separación 0.9 anchos de ojo
      var ex = s * 0.0533, ey = Y_OJO, eg = nodo('ojo' + s, cabeza, ex, ey, supZ(ex, ey), 'XYZ'); eg.rotation.y = s * 0.40;
      malla(eg, 'cuenca', function () { return trasl(esfera(0.033, 0.0195, 0.008, 10, 6), 0, 0, -0.0095); }, M.cuenca, 0);
      malla(eg, 'esclera', function () { return trasl(esfera(0.028, 0.0157, 0.009, 12, 8), 0, 0, -0.0035); }, M.esclera, 0.0015);
      var ir = nodo('iris' + s, eg, 0, 0, 0);
      malla(ir, 'iris', function () { return trasl(esfera(0.011, 0.011, 0.003, 16, 6), 0, 0, 0.0058); }, s < 0 ? M.irisI : M.irisD, 0);
      if (real) malla(ir, 'pupila', function () { return trasl(esfera(0.0028, 0.0085, 0.002, 6, 4), 0, 0, 0.0078); }, M.pupila, 0);
      if (real) malla(ir, 'brillo', function () { return trasl(esfera(0.0028, 0.0028, 0.0015, 6, 4), -0.0045, 0.0045, 0.0092); }, M.brillo, 0);
      // párpado superior: banda de pestañas negra gruesa (inclinada hacia abajo en el extremo exterior) + pliegue de piel que tapa la esclera de arriba; párpado inferior muy fino
      var lu = nodo(null, eg, 0, 0.0095, 0), lf = nodo(null, eg, 0, 0.0204, 0), ll = nodo(null, eg, 0, -0.0145, 0);
      lu.rotation.z = lf.rotation.z = -s * 0.10;
      malla(lu, 'parpS', function () { return trasl(esfera(0.0305, 0.0034, 0.011, 10, 4), 0, 0, 0.0015); }, M.parpado, 0);
      malla(lf, 'parpF', function () { return trasl(esfera(0.0305, 0.007, 0.0105, 10, 5), 0, 0, 0.0); }, M.piel, 0);
      malla(ll, 'parpI', function () { return trasl(esfera(0.026, 0.0016, 0.0095, 8, 4), 0, 0, 0.0025); }, M.cuenca, 0);
      R.ojo[s < 0 ? 0 : 1] = { iris: ir, lidU: lu, lidF: lf, lidL: ll, ceja: ceja, s: s };
    });
    var pelo = nodo('pelo', cabeza, 0, SK.cy, SK.cz);
    PELOS.forEach(function (sp, i) {
      var ca = Math.cos(sp.e), x = SK.rx * 1.05 * ca * Math.sin(sp.a), y = SK.ry * 1.05 * Math.sin(sp.e), z = SK.rz * 1.05 * ca * Math.cos(sp.a);
      var g = nodo('mech' + i, pelo, x, y, z, 'ZXY');
      malla(g, 'mech' + i, function () {
        var pts = [], rad = [], k, N = 9, bz = function (c0, c1, c2, c3, u) { var v = 1 - u; return v * v * v * c0 + 3 * v * v * u * c1 + 3 * v * u * u * c2 + u * u * u * c3; };
        for (k = 0; k <= N; k++) {   // Bézier: punto de control adelantado y punta que vuelve hacia atrás
          var u = k / N, L = sp.L;
          pts.push({ x: bz(0, 0.1 * sp.s * L, 0.3 * sp.s * L, 0.5 * sp.s * L, u) + Math.sin(u * 3 + i) * 0.01 * L * u, y: bz(0, 0.4 * L, 0.8 * L, L, u), z: bz(0, 0.22 * sp.c * L * 0.7, 0.28 * sp.c * L * 0.7, 0.10 * sp.c * L * 0.7, u) });
          rad.push(Math.max(0.0025, sp.r * (1 - 0.82 * u)));
        }
        var tg = tubo(pts, rad, 6), CO = new Float32Array((N + 1) * 6 * 3), q, v, w2;   // punta con un toque azul muy tenue
        for (q = 0; q <= N; q++) { w2 = Math.pow(q / N, 3.5); for (v = 0; v < 6; v++) { var ci = (q * 6 + v) * 3; CO[ci] = 0.043 + 0.03 * w2; CO[ci + 1] = 0.043 + 0.08 * w2; CO[ci + 2] = 0.07 + 0.26 * w2; } }
        tg.setAttribute('color', new THREE.BufferAttribute(CO, 3)); return tg;
      }, M.puntas, 0.0018);
      var dl = Math.sqrt(sp.d[0] * sp.d[0] + sp.d[1] * sp.d[1] + sp.d[2] * sp.d[2]);
      R.pelo.push({ n: g, d: [sp.d[0] / dl, sp.d[1] / dl, sp.d[2] / dl], L: sp.L, i: i, fwd: sp.d[2] > 0.3 && sp.d[1] > 0, fl: !!sp.fl, ja: Math.sin(i * 12.9898) * 0.105, jb: Math.sin(i * 78.233 + 1) * 0.105 });
    });
    // brazos (el lado I cuelga de un padre espejado)
    [['I', -1], ['D', 1]].forEach(function (ld) {
      var L = ld[0], s = ld[1];
      var hombro = nodo('hombro' + L, pecho, s * HOMBRO.x, HOMBRO.y, 0, 'ZXY'); if (s < 0) hombro.scale.x = -1;
      malla(hombro, 'delto', function () { return esfera(0.084, 0.086, 0.082, 14, 10); }, M.negro, 0.007);
      var hrm = nodo('hombrera' + L, hombro, 0, 0, 0, 'ZXY');
      malla(hrm, 'hom1', function () { return uvPlano(trasl(esfera(0.112, 0.088, 0.118, 16, 8, { th1: 1.35 }), 0.026, 0.034, 0), 0.05, -0.02, 0.17); }, M.oroH, 0);
      malla(hrm, 'hom2', function () { var g = esfera(0.124, 0.09, 0.128, 16, 6, { th0: 0.95, th1: 1.62 }); g.rotateZ(-0.30); return uvPlano(trasl(g, 0.048, 0.0, 0), 0.05, -0.02, 0.17); }, M.oroH, 0);
      malla(hrm, 'hom3', function () { var g = esfera(0.134, 0.095, 0.138, 16, 6, { th0: 1.0, th1: 1.7 }); g.rotateZ(-0.52); return uvPlano(trasl(g, 0.07, -0.05, 0), 0.05, -0.02, 0.17); }, M.oroH, 0);
      [[0.02, 0.118, 0, 0], [0.085, 0.098, 0.062, -0.75], [0.085, 0.098, -0.062, -0.75]].forEach(function (p, q) {
        malla(hrm, 'pua' + q, function () { var g = loft([{ y: 0, rx: 0.02, rz: 0.02 }, { y: 0.085, rx: 0.001, rz: 0.001 }], 6); g.rotateZ(p[3]); return trasl(g, p[0], p[1], p[2]); }, M.oro, 0);
      });
      var brazo = nodo('brazo' + L, hombro, 0, 0, 0, 'ZXY');
      malla(brazo, 'brazo', function () { return loft([{ y: 0.02, rx: 0.058, rz: 0.058 }, { y: -0.04, rx: 0.074, rz: 0.072 }, { y: -0.14, rx: 0.07, rz: 0.068 }, { y: -0.27, rx: 0.056, rz: 0.056 }], 14); }, M.negro, 0.007);
      var codo = nodo('codo' + L, brazo, 0, -L_BRAZO, 0, 'ZXY');
      malla(codo, 'codoB', function () { return esfera(0.058, 0.058, 0.058, 10, 8); }, M.negro, 0.006);
      var ante = nodo('antebrazo' + L, codo, 0, 0, 0, 'ZXY');
      malla(ante, 'manga', function () { return loft([{ y: 0, rx: 0.056, rz: 0.056 }, { y: -0.06, rx: 0.06, rz: 0.06 }, { y: -0.14, rx: 0.056, rz: 0.055 }, { y: -0.21, rx: 0.049, rz: 0.049 }, { y: -0.255, rx: 0.043, rz: 0.043 }], 14); }, M.negro, 0.005);
      var mano = nodo('mano' + L, ante, 0, -L_ANTE, 0, 'ZXY');
      malla(mano, 'puno', function () { return trasl(esfera(0.052, 0.058, 0.06, 12, 9), 0, -0.056, 0.008); }, M.piel, 0.0035);
      malla(mano, 'dedos', function () { return trasl(esfera(0.048, 0.03, 0.032, 10, 6), 0, -0.084, 0.046); }, M.piel, 0.003);
      malla(mano, 'pulgar', function () { var g = esfera(0.02, 0.036, 0.021, 8, 6); g.rotateZ(0.5); return trasl(g, -0.044, -0.05, 0.04); }, M.piel, 0.003);
    });
    // piernas
    [['I', -1], ['D', 1]].forEach(function (ld) {
      var L = ld[0], s = ld[1];
      var cad = nodo('cadera' + L, pelvis, s * 0.095, -0.02, 0, 'ZXY'); if (s < 0) cad.scale.x = -1;
      var mus = nodo('muslo' + L, cad, 0, 0, 0);
      malla(mus, 'muslo', function () { return loft([{ y: 0.03, rx: 0.08, rz: 0.08 }, { y: -0.08, rx: 0.1, rz: 0.098 }, { y: -0.26, rx: 0.086, rz: 0.086 }, { y: -0.40, rx: 0.07, rz: 0.07 }, { y: -0.425, rx: 0.001, rz: 0.001 }], 14); }, M.blanco, 0.008);
      var rod = nodo('rodilla' + L, mus, 0, -L_MUSLO, 0, 'ZXY');
      var pan = nodo('pantorrilla' + L, rod, 0, 0, 0);
      malla(pan, 'pant', function () { return loft([{ y: 0.025, rx: 0.062, rz: 0.062 }, { y: -0.1, rx: 0.07, rz: 0.07 }, { y: -0.28, rx: 0.056, rz: 0.056 }, { y: -0.40, rx: 0.049, rz: 0.049 }], 14); }, M.blanco, 0.008);
      var pie = nodo('pie' + L, pan, 0, -L_PANT, 0, 'ZXY');
      malla(pie, 'bota', function () { return trasl(esfera(0.047, 0.045, 0.105, 12, 9), 0, -0.03, 0.045); }, M.bota, 0.006);
      malla(pie, 'caña', function () { return loft([{ y: 0.03, rx: 0.056, rz: 0.056 }, { y: -0.04, rx: 0.058, rz: 0.058 }], 12); }, M.bota, 0.006);
    });
    // alas: 3 segmentos articulados, 18 plumas por ala con pivote propio
    var PA = { H: ALA.H, A: ALA.A, M: ALA.M };
    [['I', -1, 0], ['D', 1, 1]].forEach(function (ld) {
      var L = ld[0], s = ld[1], w = ld[2];
      var ala = nodo('ala' + L, pecho, s * ALA.rx, ALA.ry, ALA.rz, 'XYZ'); if (s < 0) ala.scale.x = -1;
      var sH = nodo('alaH' + L, ala, 0, 0, 0), sA = nodo('alaA' + L, sH, ALA.H, 0, 0), sM = nodo('alaM' + L, sA, ALA.A, 0, 0);
      var seg = { H: sH, A: sA, M: sM };
      ['H', 'A', 'M'].forEach(function (k) {
        var Lh = PA[k];
        malla(seg[k], 'hueso' + k, function () { var g = loft([{ y: 0, rx: 0.026, rz: 0.026 }, { y: Lh * 0.5, rx: 0.022, rz: 0.022 }, { y: Lh, rx: 0.016, rz: 0.016 }], 8); g.rotateZ(-Math.PI / 2); return g; }, M.blanco, 0.0035);
      });
      PLM.forEach(function (p, i) {
        var pv = nodo(null, seg[p[0]], p[1] * PA[p[0]], 0, i * -0.0055);
        pv.scale.set(p[3], p[4], 1);
        var band = Math.min(4, Math.floor(i * 5 / NPL)), mat = M.plumas[band + 5 * w];
        var m = new THREE.Mesh(G('pluma', function () { return plumaGeo(false); }), mat); pv.add(m); R.tri += 20; if (!real) m.renderOrder = 3;
        if (real) { var o = new THREE.Mesh(G('plumaC', function () { return plumaGeo(true); }), M.contornoPl); pv.add(o); R.tri += 20; }
        R.pl[w].push({ n: pv, band: band, idx: i, L: p[3], rel: p[2], seg: p[0] });
      });
    });
    // capa: 8 tiras desde los hombros, 4 segmentos encadenados cada una
    for (var i = 0; i < CAPA_N; i++) {
      var a = (i / (CAPA_N - 1) * 2 - 1) * 1.4, x0 = 0.30 * Math.sin(a), z0 = -0.12 * Math.cos(a) - 0.04, par = pecho, j, cadena = [];
      for (j = 0; j < 4; j++) {
        var g = nodo('capa' + i + '_' + j, par, j === 0 ? x0 : 0, j === 0 ? 0.30 : -CAPA_L[j - 1], j === 0 ? z0 : 0, 'ZXY'), len = CAPA_L[j];
        malla(g, 'capaS' + j, function () { return capaSeg(CAPA_W, len, 0.008); }, M.capa, 0);
        if (j === 3) malla(g, 'capaD', function () { return trasl(placa(CAPA_W * 1.02, 0.012), 0, -len + 0.006, 0.002); }, M.oro, 0);
        if (i === 0 || i === CAPA_N - 1) malla(g, 'capaE' + j + '_' + i, function () { return trasl(placa(0.008, len), (i ? 1 : -1) * CAPA_W / 2, -len / 2, 0.002); }, M.oro, 0);
        cadena.push(g); par = g;
      }
      R.capa.push({ n: cadena, x: x0, lado: (i / (CAPA_N - 1) * 2 - 1) });
    }
    // solapas del cuello alto (capa): dos placas blancas con borde dorado
    [-1, 1].forEach(function (s) {
      var g = nodo(null, pecho, s * 0.085, 0.395, 0.0, 'ZXY'); g.rotation.set(-0.15, s * 0.35, -s * 0.28);
      malla(g, 'solapa', function () { return trasl(placa(0.075, 0.13), 0, 0.045, 0); }, M.capa, 0);
      malla(g, 'solapaB', function () { return trasl(placa(0.075, 0.012), 0, 0.108, 0.002); }, M.oro, 0);
    });
    fusionar();
    return R;
  }

  // ---------------------------------------------------------------- piezas de dibujo
  function colorMat(c) { return new THREE.Color(c[0], c[1], c[2]); }
  function spr(tex, c, tam, op, orden, tw, prof) {
    var m = new THREE.SpriteMaterial({ map: tex, color: colorMat(c), transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthTest: !!prof, depthWrite: false });
    var s = new THREE.Sprite(m); s.scale.set(tam * (tw || 1), tam, 1); s.renderOrder = orden; s.visible = false; S.scene.add(s); return s;
  }
  function setC(s, c) { s.material.color.setRGB(c[0], c[1], c[2]); }

  // cinta (relámpago): n puntos, dos mallas (halo ancho + núcleo fino). set(pts, ancho, alfa, frac)
  function crearBolt(n, orden) {
    var B = { n: n, grp: new THREE.Group(), meshes: [], pos: [], col: [], vis: false };
    var idx = [], i;
    for (i = 0; i < n - 1; i++) { var a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    for (var k = 0; k < 2; k++) {
      var g = new THREE.BufferGeometry(), pa = new Float32Array(n * 6), ca = new Float32Array(n * 6);
      g.setAttribute('position', new THREE.BufferAttribute(pa, 3)); g.setAttribute('color', new THREE.BufferAttribute(ca, 3)); g.setIndex(idx);
      var m = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
      var me = new THREE.Mesh(g, m); me.frustumCulled = false; me.renderOrder = orden + k; B.grp.add(me); B.meshes.push(me); B.pos.push(pa); B.col.push(ca);
    }
    B.grp.visible = false; S.scene.add(B.grp); B.color = [1, 1, 1];
    B.set = function (pts, ancho, alfa, frac) {
      var N = n, show = frac == null ? N : Math.max(2, Math.min(N, Math.ceil(frac * (N - 1)) + 1)), j, kk;
      for (kk = 0; kk < 2; kk++) {
        var P = B.pos[kk], C = B.col[kk], wv = kk === 0 ? ancho * 3.4 : ancho, al = kk === 0 ? alfa * 0.5 : alfa;
        var cc = kk === 0 ? B.color : mezclaC(B.color, CBLANCO, 0.65);
        for (j = 0; j < N; j++) {
          var jj = Math.min(j, show - 1), p = pts[jj], q0 = pts[Math.max(0, jj - 1)], q1 = pts[Math.min(N - 1, jj + 1)];
          var dx = q1.x - q0.x, dy = q1.y - q0.y, l = Math.sqrt(dx * dx + dy * dy) || 1, nx = -dy / l, ny = dx / l;
          var tp = Math.sin(Math.PI * clamp(jj / (show - 1 || 1), 0, 1)) * 0.75 + 0.25;
          var hw = wv * 0.5 * tp, fa = al * (j < show ? 1 : 0) * (0.35 + 0.65 * tp);
          var o = j * 6;
          P[o] = p.x + nx * hw; P[o + 1] = p.y + ny * hw; P[o + 2] = p.z; P[o + 3] = p.x - nx * hw; P[o + 4] = p.y - ny * hw; P[o + 5] = p.z;
          C[o] = cc[0] * fa; C[o + 1] = cc[1] * fa; C[o + 2] = cc[2] * fa; C[o + 3] = C[o]; C[o + 4] = C[o + 1]; C[o + 5] = C[o + 2];
        }
        B.meshes[kk].geometry.attributes.position.needsUpdate = true; B.meshes[kk].geometry.attributes.color.needsUpdate = true;
      }
      B.grp.visible = alfa > 0.01; B.vis = B.grp.visible;
    };
    B.hide = function () { B.grp.visible = false; B.vis = false; };
    return B;
  }
  function ptsRelampago(a, b, n, amp, out) {   // zigzag entre a y b (mundo), perpendicular en XY
    var dx = b.x - a.x, dy = b.y - a.y, l = Math.sqrt(dx * dx + dy * dy) || 1, nx = -dy / l, ny = dx / l, i, r = out || [];
    for (i = 0; i < n; i++) {
      var s = i / (n - 1), off = (i === 0 || i === n - 1) ? 0 : (Math.random() * 2 - 1) * amp * Math.sin(Math.PI * s) * (0.5 + 0.5 * Math.random());
      var p = r[i] || (r[i] = { x: 0, y: 0, z: 0 });
      p.x = a.x + dx * s + nx * off; p.y = a.y + dy * s + ny * off; p.z = lerp(a.z, b.z, s);
    }
    return r;
  }

  // ---------------------------------------------------------------- partículas (un Points, shader propio)
  function crearParticulas() {
    var P = { n: NPART, cur: 0, pos: new Float32Array(NPART * 3), col: new Float32Array(NPART * 4), tam: new Float32Array(NPART),
      vel: new Float32Array(NPART * 3), vida: new Float32Array(NPART), max: new Float32Array(NPART), grav: new Float32Array(NPART),
      drag: new Float32Array(NPART), atr: new Float32Array(NPART * 4), tam0: new Float32Array(NPART) };
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P.pos, 3)); g.setAttribute('aCol', new THREE.BufferAttribute(P.col, 4)); g.setAttribute('aSize', new THREE.BufferAttribute(P.tam, 1));
    P.uPx = { value: 800 };
    var m = new THREE.ShaderMaterial({ uniforms: { uPx: P.uPx }, vertexShader: VS_PTS, fragmentShader: FS_PTS, transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false });
    P.obj = new THREE.Points(g, m); P.obj.frustumCulled = false; P.obj.renderOrder = 30; P.geo = g; S.scene.add(P.obj);
    return P;
  }
  function emitir(x, y, z, vx, vy, vz, c, size, life, grav, drag) {
    var P = S.P; if (S.cal < 0.5 && Math.random() > S.cal) return;
    var i = P.cur++ % P.n, i3 = i * 3, i4 = i * 4;
    P.pos[i3] = x; P.pos[i3 + 1] = y; P.pos[i3 + 2] = z; P.vel[i3] = vx; P.vel[i3 + 1] = vy; P.vel[i3 + 2] = vz;
    P.col[i4] = c[0]; P.col[i4 + 1] = c[1]; P.col[i4 + 2] = c[2]; P.col[i4 + 3] = 1; P.tam0[i] = size; P.tam[i] = size;
    P.vida[i] = life; P.max[i] = life; P.grav[i] = grav || 0; P.drag[i] = drag == null ? 0.5 : drag; P.atr[i4 + 3] = 0;
    return i;
  }
  function atraer(i, x, y, z, k) { var P = S.P, i4 = i * 4; P.atr[i4] = x; P.atr[i4 + 1] = y; P.atr[i4 + 2] = z; P.atr[i4 + 3] = k; }
  function actParticulas(dt) {
    var P = S.P, i, vivo = false;
    for (i = 0; i < P.n; i++) {
      if (P.vida[i] <= 0) { if (P.tam[i] !== 0) { P.tam[i] = 0; vivo = true; } continue; }
      vivo = true;
      var i3 = i * 3, i4 = i * 4, k = Math.exp(-P.drag[i] * dt);
      P.vida[i] -= dt;
      if (P.atr[i4 + 3] > 0) { var a = P.atr[i4 + 3] * dt; P.vel[i3] += (P.atr[i4] - P.pos[i3]) * a; P.vel[i3 + 1] += (P.atr[i4 + 1] - P.pos[i3 + 1]) * a; P.vel[i3 + 2] += (P.atr[i4 + 2] - P.pos[i3 + 2]) * a; }
      P.vel[i3 + 1] += P.grav[i] * dt;
      P.vel[i3] *= k; P.vel[i3 + 1] *= k; P.vel[i3 + 2] *= k;
      P.pos[i3] += P.vel[i3] * dt; P.pos[i3 + 1] += P.vel[i3 + 1] * dt; P.pos[i3 + 2] += P.vel[i3 + 2] * dt;
      var f = clamp(P.vida[i] / P.max[i], 0, 1), edad = 1 - f;
      P.col[i4 + 3] = Math.min(1, f * 3.5) * Math.min(1, edad * 14);
      P.tam[i] = P.vida[i] > 0 ? P.tam0[i] * (0.55 + 0.45 * f) : 0;
    }
    if (vivo) { P.geo.attributes.position.needsUpdate = true; P.geo.attributes.aCol.needsUpdate = true; P.geo.attributes.aSize.needsUpdate = true; }
  }
  function rafaga(x, y, z, n, vmin, vmax, c, size, life, grav, drag, cx, cy, cz) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, b = Math.acos(rnd(-1, 1)), v = rnd(vmin, vmax);
      emitir(x, y, z, Math.sin(b) * Math.cos(a) * v, Math.sin(b) * Math.sin(a) * v * 0.9, Math.cos(b) * v * 0.7, c, size * rnd(0.6, 1.3), life * rnd(0.7, 1.2), grav, drag);
    }
  }

  // ---------------------------------------------------------------- ondas (anillo que se expande, en el suelo o frente a la cámara)
  function crearOndas() {
    var lista = [], g = new THREE.PlaneGeometry(2, 2), i;
    for (i = 0; i < 10; i++) {
      var u = { uCol: { value: new THREE.Color(1, 1, 1) }, uP: { value: 0 }, uOp: { value: 1 } };
      var m = new THREE.ShaderMaterial({ uniforms: u, vertexShader: VS_UV, fragmentShader: FS_ONDA, transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
      var me = new THREE.Mesh(g, m); me.visible = false; me.renderOrder = 12; S.scene.add(me);
      lista.push({ mesh: me, u: u, activa: false, t: 0, dur: 1, delay: 0, R: 5, op: 1 });
    }
    return lista;
  }
  function onda(c, R, dur, delay, op, frente, pos) {
    var o = null, i; for (i = 0; i < S.ondas.length; i++) if (!S.ondas[i].activa) { o = S.ondas[i]; break; }
    if (!o) o = S.ondas[0];
    o.activa = true; o.t = -(delay || 0); o.dur = dur; o.R = R; o.op = op == null ? 1 : op; o.frente = !!frente; o.pos = pos || null;
    o.u.uCol.value.setRGB(c[0], c[1], c[2]); o.mesh.visible = false;
    if (frente) { o.mesh.rotation.set(0, 0, 0); if (pos) o.mesh.position.set(pos.x, pos.y, pos.z); else o.mesh.position.set(0, S.cw.y + 0.3, 0.4); o.mesh.renderOrder = 24; }
    else { o.mesh.rotation.set(-Math.PI / 2, 0, 0); o.mesh.position.set(0, 0.05, 0); o.mesh.renderOrder = 12; }
  }
  function actOndas(dt) {
    S.ondas.forEach(function (o) {
      if (!o.activa) return;
      o.t += dt; if (o.t < 0) return;
      var p = o.t / o.dur; if (p >= 1) { o.activa = false; o.mesh.visible = false; return; }
      o.mesh.visible = true; o.u.uP.value = eOut(p) * 0.98; o.u.uOp.value = o.op; o.mesh.scale.set(o.R, o.R, 1);
      if (o.frente && !o.pos) o.mesh.position.y = S.cw.y + 0.3;
    });
  }

  // ---------------------------------------------------------------- motor de poses (todo en espacio D; el lado I cuelga de un padre espejado)
  var JN = ['pelvis', 'torso', 'pecho', 'cuello', 'cabeza', 'brazoD', 'brazoI', 'codoD', 'codoI', 'antebrazoD', 'antebrazoI', 'manoD', 'manoI',
    'caderaD', 'caderaI', 'rodillaD', 'rodillaI', 'pieD', 'pieI', 'alaD', 'alaI', 'alaHD', 'alaHI', 'alaAD', 'alaAI', 'alaMD', 'alaMI', 'mandibula'];
  function nuevaPose() {
    var P = { ry: 0, ryF: 0, dx: 0, dz: 0, spin: 0, ground: 0, lift: 0, puD: 1, puI: 1, resp: 0, golpe: 0, abre: 1, shrug: 0, fh: [0, 0], fa: [0, 0], fm: [0, 0], fw: 0 };
    JN.forEach(function (k) { P[k] = [0, 0, 0]; });
    return P;
  }
  function reposo(P) {
    var k, i;
    for (i = 0; i < JN.length; i++) { k = JN[i]; P[k][0] = P[k][1] = P[k][2] = 0; }
    P.ry = 0.065; P.dx = P.dz = P.spin = P.ground = P.lift = P.golpe = P.shrug = P.resp = P.fw = 0; P.puD = P.puI = 1; P.abre = 1;
    P.fh[0] = P.fh[1] = P.fa[0] = P.fa[1] = P.fm[0] = P.fm[1] = 0;
    ['D', 'I'].forEach(function (l) {
      P['brazo' + l][0] = -0.05; P['brazo' + l][2] = 0.20; P['codo' + l][0] = -0.20;
      P['cadera' + l][2] = 0.06; P['rodilla' + l][0] = 0.05; P['pie' + l][0] = 0.30;
    });
  }
  function mez(A, T, w) {   // A[i] += (T[i]-A[i])·w con ángulos envueltos (sin vueltas largas)
    if (w <= 0) return;
    for (var i = 0; i < 3; i++) if (T[i] != null) A[i] += wrapA(T[i] - A[i]) * w;
  }
  function mezT(P, T, w) { if (w <= 0) return; for (var k in T) mez(P[k], T[k], w); }
  var DIRP = [0.5, -1, -0.35];
  // cinemática inversa de dos huesos: muñeca → ángulos de brazo y codo (objetivo en el espacio del pecho, D)
  function ikBrazo(P, lado, tx, ty, tz, w, hint) {
    if (w <= 0) return;
    var sx = HOMBRO.x, sy = HOMBRO.y + P.shrug, dx = tx - sx, dy = ty - sy, dz = tz, d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-4;
    var L1 = L_BRAZO, L2 = L_ANTE, dm = clamp(d, Math.abs(L1 - L2) + 0.01, L1 + L2 - 0.004), ux = dx / d, uy = dy / d, uz = dz / d;
    var a = (L1 * L1 - L2 * L2 + dm * dm) / (2 * dm), h = Math.sqrt(Math.max(0, L1 * L1 - a * a)), hn = hint || DIRP;
    var hd = hn[0] * ux + hn[1] * uy + hn[2] * uz, px = hn[0] - ux * hd, py = hn[1] - uy * hd, pz = hn[2] - uz * hd, pl = Math.sqrt(px * px + py * py + pz * pz) || 1;
    px /= pl; py /= pl; pz /= pl;
    var ex = sx + ux * a + px * h, ey = sy + uy * a + py * h, ez = uz * a + pz * h, wx = sx + ux * dm, wy = sy + uy * dm, wz = uz * dm;
    var ph = Math.atan2(ex - sx, -(ey - sy)), th = -Math.asin(clamp(ez / L1, -1, 1));
    var d2x = wx - ex, d2y = wy - ey, d2z = wz - ez, c = Math.cos(ph), s = Math.sin(ph), ct = Math.cos(th), st = Math.sin(th);
    var x1 = d2x * c + d2y * s, y1 = -d2x * s + d2y * c, y2 = y1 * ct + d2z * st, z2 = -y1 * st + d2z * ct, l2 = Math.sqrt(x1 * x1 + y2 * y2 + z2 * z2) || 1;
    mez(P['brazo' + lado], [th, null, ph], w); mez(P['codo' + lado], [-Math.asin(clamp(z2 / l2, -1, 1)), null, Math.atan2(x1, -y2)], w);
  }
  var _v3 = null;
  function ikMundo(P, lado, wx, wy, wz, w, hint) {   // objetivo en coordenadas del mundo
    if (w <= 0 || !S || !S.rig) return;
    if (!_v3) _v3 = new THREE.Vector3();
    _v3.set(wx, wy, wz); S.rig.n.pecho.worldToLocal(_v3);
    ikBrazo(P, lado, lado === 'I' ? -_v3.x : _v3.x, _v3.y, _v3.z, w, hint);
  }
  // punto del mundo a partir de un nodo y un punto local
  function pw(nodo, x, y, z, o) {
    var e = nodo.matrixWorld.elements;
    o.x = e[0] * x + e[4] * y + e[8] * z + e[12]; o.y = e[1] * x + e[5] * y + e[9] * z + e[13]; o.z = e[2] * x + e[6] * y + e[10] * z + e[14]; return o;
  }

  // poses de cuerpo completo reutilizables
  var PO = {
    agacha: { torso: [0.42, 0, 0], pecho: [0.12, 0, 0], cuello: [-0.30, 0, 0], cabeza: [-0.10, 0, 0],
      caderaD: [-1.02, 0, 0.20], caderaI: [-1.02, 0, 0.20], rodillaD: [1.62, 0, 0], rodillaI: [1.62, 0, 0], pieD: [-0.60, 0, 0], pieI: [-0.60, 0, 0],
      brazoD: [0.55, 0, 0.28], brazoI: [0.55, 0, 0.28], codoD: [-1.45, 0, 0], codoI: [-1.45, 0, 0] },
    estalla: { torso: [-0.20, 0, 0], pecho: [-0.12, 0, 0], cuello: [-0.22, 0, 0], cabeza: [-0.42, 0, 0],
      brazoD: [-0.10, 0, 1.18], brazoI: [-0.10, 0, 1.18], codoD: [-0.20, 0, 0], codoI: [-0.20, 0, 0],
      caderaD: [0.04, 0, 0.14], caderaI: [0.04, 0, 0.14], rodillaD: [0.08, 0, 0], rodillaI: [0.08, 0, 0], pieD: [0.36, 0, 0], pieI: [0.36, 0, 0] },
    caida: { torso: [0.10, 0, 0], pecho: [-0.05, 0, 0], cuello: [-0.15, 0, 0], cabeza: [-0.2, 0, 0],
      brazoD: [0.25, 0, 2.55], brazoI: [0.25, 0, 2.55], codoD: [-0.35, 0, 0], codoI: [-0.35, 0, 0],
      caderaD: [-0.25, 0, 0.10], caderaI: [-0.25, 0, 0.10], rodillaD: [0.55, 0, 0], rodillaI: [0.55, 0, 0], pieD: [0.5, 0, 0], pieI: [0.5, 0, 0] },
    impacto: { torso: [0.78, 0, 0], pecho: [0.20, 0, 0], cuello: [-0.55, 0, 0], cabeza: [-0.15, 0, 0],
      caderaD: [-1.38, 0, 0.30], caderaI: [-1.38, 0, 0.30], rodillaD: [2.25, 0, 0], rodillaI: [2.25, 0, 0], pieD: [-0.87, 0, 0], pieI: [-0.87, 0, 0],
      brazoD: [-0.55, 0, 0.12], codoD: [-0.15, 0, 0], brazoI: [0.35, 0, 0.55], codoI: [-1.2, 0, 0] },
    abierta: { torso: [-0.10, 0, 0], pecho: [-0.10, 0, 0], cabeza: [-0.20, 0, 0],
      brazoD: [-0.05, 0, 0.98], brazoI: [-0.05, 0, 0.98], codoD: [-0.12, 0, 0], codoI: [-0.12, 0, 0] },
    loto: { torso: [0.10, 0, 0], cabeza: [0.08, 0, 0],
      caderaD: [-0.88, 0, 1.33], caderaI: [-0.88, 0, 1.33], rodillaD: [2.55, 0, 0.25], rodillaI: [2.55, 0, 0.25], pieD: [0.15, 0, 0.3], pieI: [0.15, 0, 0.3] },
    grito: { torso: [-0.28, 0, 0], pecho: [-0.18, 0, 0], cuello: [-0.30, 0, 0], cabeza: [-0.52, 0, 0],
      brazoD: [-0.05, 0, 1.30], brazoI: [-0.05, 0, 1.30], codoD: [-0.1, 0, 0], codoI: [-0.1, 0, 0],
      caderaD: [0.05, 0, 0.16], caderaI: [0.05, 0, 0.16], rodillaD: [0.1, 0, 0], rodillaI: [0.1, 0, 0], pieD: [0.5, 0, 0], pieI: [0.5, 0, 0] }
  };
  // suelo: altura de la raíz para que el pie más bajo toque y=0 con esta pose (cadena plana en x)
  function alturaSuelo(P) {
    var mn = 1e9, l, ls = ['D', 'I'];
    for (l = 0; l < 2; l++) {
      var cd = P['cadera' + ls[l]], rd = P['rodilla' + ls[l]], pd = P['pie' + ls[l]], t1 = P.pelvis[0] + cd[0], t2 = t1 + rd[0], t3 = t2 + pd[0];
      var y = -L_MUSLO * Math.cos(t1) * Math.cos(cd[2]) - L_PANT * Math.cos(t2) - 0.02, c3 = Math.cos(t3), s3 = Math.sin(t3);
      var f = y + Math.min(-0.075 * c3 - 0.045 * s3, -0.03 * c3 - 0.15 * s3, -0.03 * c3 + 0.06 * s3);
      if (f < mn) mn = f;
    }
    return -(Y_PELVIS + mn);
  }
  // alas: segmentos a partir de «abre» (0 plegadas … 1 abiertas) y del batido
  function poseAlas(P, V) {
    var ab = P.abre, o = ALA.abierta, f = ALA.plegada, ex = 0.12 * (V.alas - 0.5), l, w;
    for (l = 0; l < 2; l++) {
      w = l ? 'D' : 'I';
      P['alaH' + w][2] = lerp(f[0], o[0] + ex, ab) + P.fh[l];
      P['alaA' + w][2] = lerp(f[1], o[1], ab) + P.fa[l];
      P['alaM' + w][2] = lerp(f[2], o[2], ab) + P.fm[l];
      P['ala' + w][1] = lerp(0.35, 0, ab);   // plegadas: giran hacia el cuerpo
    }
  }
  var FOLD_ABS = { H: ALA.plegada[0], A: ALA.plegada[0] + ALA.plegada[1], M: ALA.plegada[0] + ALA.plegada[1] + ALA.plegada[2] };
  function anguloPluma(P, V, w, i, t, mov, amp) {
    var p = PLM[i], rel = p[2] * (1 + 0.10 * (V.alas - 0.4)), plie = (-1.45 + i * 0.012) - FOLD_ABS[p[0]];
    var onda = mov * 0.045 * amp * Math.sin(t * 1.3 - 0.38 * i + w * 0.6) + P.fw * Math.sin(t * 9 - 0.5 * i + w);
    return lerp(plie, rel, P.abre) + onda;
  }

  // ---------------------------------------------------------------- capa: péndulo amortiguado por segmento
  function simCapa(dt, acc, vy, om) {
    var C = S.capaS, t = S.t, mov = S.reducido ? 0 : 1, i, j, k, lado, tgx, tgz, rise = clamp(-vy * 0.12, 0, 2.0), flare = clamp(om * om * 0.012, 0, 0.9);
    var sub = Math.max(1, Math.ceil(dt / 0.012)), h = dt / sub, q;
    for (q = 0; q < sub; q++) for (i = 0; i < CAPA_N; i++) {
      lado = i / (CAPA_N - 1) * 2 - 1;
      for (j = 0; j < 4; j++) {
        k = i * 4 + j;
        tgx = 0.05 + 0.045 * j + (j + 1) * 0.006 * acc.z + rise * (0.28 * (j + 1)) + mov * 0.045 * (j + 1) * Math.sin(t * 1.4 + i * 0.5 + j * 0.9);
        tgz = lado * (0.07 * j + 0.04) - (j + 1) * 0.006 * acc.x + lado * flare * (0.5 + 0.3 * j) + mov * 0.03 * (j + 1) * Math.sin(t * 1.1 + i * 0.7 + j * 1.1);
        C.vx[k] += (-42 * (C.ax[k] - tgx) - 6 * C.vx[k]) * h; C.vz[k] += (-42 * (C.az[k] - tgz) - 6 * C.vz[k]) * h;
        C.ax[k] = clamp(C.ax[k] + C.vx[k] * h, -1.6, 3.0); C.az[k] = clamp(C.az[k] + C.vz[k] * h, -1.9, 1.9);
      }
    }
  }
  // cabello: cada mechón se orienta hacia su dirección base; con poder se levanta y se alarga
  function poseMechones(t, V, mov) {
    var out = S.mech, k = clamp(V.pelo, 0, 1.6), up = clamp(k * 0.40, 0, 0.7), i, h;
    for (i = 0; i < NPE; i++) {
      h = S.rig.pelo[i];
      var uh = h.fl ? 0 : (h.fwd ? up : up * 0.3), dx = h.d[0] * (1 - uh), dy = lerp(h.d[1], 1, uh * 0.7), dz = h.d[2] * (1 - uh), l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      var sw = mov * (h.fl ? 0.5 : 1 + 0.5 * k);
      out[i * 3] = Math.asin(clamp(dz / l, -1, 1)) + h.ja + sw * 0.07 * Math.sin(t * 1.7 + h.i * 1.3) + S.P0.fw * 0.3 * Math.sin(t * 5 + h.i);
      out[i * 3 + 1] = -Math.atan2(dx, dy) + h.jb + sw * 0.06 * Math.sin(t * 1.3 + h.i * 2.1);
      out[i * 3 + 2] = h.fl ? 1 : 1 + 0.18 * clamp(k, 0, 1.4);   // se erizan hasta ×1.25
    }
  }
  function aplicarRig(R, P) {
    var n = R.n, i, k, j, w, F, C = S.capaS;
    for (i = 0; i < JN.length; i++) { k = JN[i]; n[k].rotation.set(P[k][0], P[k][1], P[k][2]); }
    n.hombroD.position.y = HOMBRO.y + P.shrug; n.hombroI.position.y = HOMBRO.y + P.shrug;
    n.raiz.position.set(P.dx, P.ryF, P.dz); n.raiz.rotation.y = P.spin;
    n.pecho.scale.set(1 + 0.016 * P.resp + 0.03 * P.golpe, 1 + 0.02 * P.resp + 0.03 * P.golpe, 1 + 0.014 * P.resp + 0.03 * P.golpe);
    n.manoD.scale.set(P.puD, P.puD, P.puD); n.manoI.scale.set(P.puI, P.puI, P.puI);
    for (w = 0; w < 2; w++) { F = R.pl[w]; for (i = 0; i < NPL; i++) F[i].n.rotation.z = S.plz[w * NPL + i]; }
    for (i = 0; i < CAPA_N; i++) for (j = 0; j < 4; j++) R.capa[i].n[j].rotation.set(C.ax[i * 4 + j], 0, C.az[i * 4 + j]);
    var F = S.rostro, oj, yb, sf;
    for (i = 0; i < 2; i++) {
      oj = R.ojo[i]; oj.iris.position.set(F.ix[i], F.iy[i], 0); oj.iris.scale.set(F.irisS, F.irisS, 1);
      yb = lerp(0.0095, -0.0100, F.cl[i]) - 0.003 * F.fr * (1 - F.cl[i]); sf = 1 + 1.8 * F.cl[i];   // banda de pestañas baja; el pliegue de piel crece para taparlo todo al cerrar
      oj.lidU.position.y = yb; oj.lidF.scale.y = sf; oj.lidF.position.y = yb + 0.0034 + 0.007 * sf; oj.lidL.position.y = lerp(-0.0145, -0.0105, F.cl[i]);
      oj.ceja.rotation.z = oj.s * 0.15 * F.fr; oj.ceja.position.y = oj.ceja.userData.y0 - 0.004 * F.fr;
    }
    for (i = 0; i < NPE; i++) { var h = R.pelo[i]; h.n.rotation.set(S.mech[i * 3], 0, S.mech[i * 3 + 1]); h.n.scale.y = S.mech[i * 3 + 2]; }
  }

  // ---------------------------------------------------------------- mundo
  function construirMundo() {
    var sc = S.scene, i;
    var piso = new THREE.Mesh(new THREE.CircleGeometry(70, 64), new THREE.MeshBasicMaterial({ map: S.tex.piso, transparent: true, depthTest: true, depthWrite: false }));
    piso.rotation.x = -Math.PI / 2; piso.renderOrder = 0; sc.add(piso); S.piso = piso;
    var gl = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: S.tex.glow, color: 0xffffff, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthTest: true, depthWrite: false }));
    gl.rotation.x = -Math.PI / 2; gl.position.y = 0.03; gl.renderOrder = 1; sc.add(gl); S.pisoGlow = gl;
    S.niebla = [];
    for (i = 0; i < 9; i++) {
      var s = spr(S.tex.glow, [0.5, 0.55, 0.75], 1, 0.07, i < 6 ? 6 : 28, 1, i < 6);
      s.visible = true; s.userData = { x: rnd(-16, 16), z: i < 6 ? rnd(-9, -2) : rnd(3, 9), y: rnd(0.4, 1.6), tam: rnd(9, 15), v: rnd(0.12, 0.35) * (i % 2 ? 1 : -1), ph: rnd(0, 6) };
      s.scale.set(s.userData.tam * 1.6, s.userData.tam * 0.4, 1); sc.add(s); S.niebla.push(s);
    }
    S.anillos = [];
    [[5.6, 11, 0.5], [6.7, 7, -0.35], [7.9, 15, 0.22], [9.3, 9, -0.16]].forEach(function (d, k) {
      var u = { uCol: { value: new THREE.Color(1, 0.8, 0.3) }, uOp: { value: 0 }, uT: { value: 0 }, uK: { value: d[1] }, uSp: { value: d[2] * 3 }, uWhite: { value: 0 } };
      var m = new THREE.ShaderMaterial({ uniforms: u, vertexShader: VS_UV, fragmentShader: FS_ANILLO, transparent: true, blending: THREE.AdditiveBlending, depthTest: true, depthWrite: false, side: THREE.DoubleSide });
      var me = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m); me.position.set(0, 6.4, -1.9 - k * 0.3); me.renderOrder = 4 + k * 0.1; sc.add(me);
      S.anillos.push({ mesh: me, u: u, R: d[0], spin: d[2], rot: k * 1.3 });
    });
    S.aura = spr(S.tex.glow, [1, 0.8, 0.3], 14, 0, 3, 1, true); S.aura.position.set(0, 6.4, -2.2);
    S.aura2 = spr(S.tex.glow, [1, 0.8, 0.3], 7, 0, 5, 1, true); S.aura2.position.set(0, 7.4, -1.4);
    S.rayos = spr(S.tex.rayos, [1, 0.85, 0.4], 20, 0, 3.5, 1, true); S.rayos.position.set(0, 6.6, -2.0);
    var fm = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false });
    S.flash = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), fm); S.flash.position.z = -1; S.flash.renderOrder = 50; S.flash.visible = false;
    S.cam.add(S.flash); sc.add(S.cam);
  }
  function construirOjos() {   // los ojos son 3D (en el rig): aquí solo una luz puntual tenue del color de cada ojo y el rayo
    S.ojos = [0, 1].map(function (i) {
      var c = i ? CROJO : CAZUL, L = new THREE.PointLight(i ? 0xFF3B4E : 0x4FB8FF, 0, 2.4, 2);
      S.scene.add(L);
      return { c: c, luz: L, bolt: crearBolt(14, 25), rayo: 0, fac: 1, prox: 0 };
    });
  }
  function construirBandas() {
    S.B = []; S.bandIdx = [[], [], [], [], []];
    PLM.forEach(function (p, i) { S.bandIdx[Math.min(4, Math.floor(i * 5 / NPL))].push(i); });
    for (var idx = 0; idx < NBAN; idx++) {
      var k = idx % 5, lado = idx < 5 ? 0 : 1, c = HABL[k], b = { idx: idx, k: k, lado: lado, c: c, spr: [], uv: [], ruta: [], bolt: crearBolt(16, 26), prox: 0, prog: -1 };
      for (var j = 0; j < 6; j++) { b.spr.push(spr(S.tex.glow, c, 1, 0, 21)); b.uv.push({ f: (j + 0.5) / 6, rf: 0.84 - 0.05 * (j % 2), ph: Math.random() * 6.28, tam: rnd(0.9, 1.5) }); }
      for (j = 0; j < 16; j++) b.ruta.push({ f: 0.5 + Math.sin(j * 1.7) * 0.18, rf: 0.14 + 0.86 * j / 15 });
      S.B.push(b);
    }
    S.velos = [0, 1].map(function (lado) { return { lado: lado, bolt: crearBolt(12, 26), vida: 0, prox: rnd(0.5, 2) }; });
  }
  var _a = { x: 0, y: 0, z: 0 }, _b = { x: 0, y: 0, z: 0 };
  function ptoAla(lado, k, f, rf, zo, out) {   // punto del ala a lo largo de la banda k (f 0..1 entre plumas) y de la pluma (rf 0..1), en el mundo
    var F = S.rig.pl[lado], ids = S.bandIdx[k], fi = clamp(f, 0, 1) * (ids.length - 1), a = Math.floor(fi), b = Math.min(ids.length - 1, a + 1), u = fi - a;
    pw(F[ids[a]].n, rf, 0, 0, _a); pw(F[ids[b]].n, rf, 0, 0, _b);
    out.x = lerp(_a.x, _b.x, u); out.y = lerp(_a.y, _b.y, u); out.z = lerp(_a.z, _b.z, u) + zo; return out;
  }

  // ---------------------------------------------------------------- carga de la imagen: solo para recortar el oro de la hombrera (la cara es 3D)
  function recortarOro(img, iw, ih) {   // hombrera dorada (la del lado derecho de la imagen): busca el oro y recorta un cuadrado a su alrededor
    var wx0 = Math.floor(iw * 0.58), wy0 = Math.floor(ih * 0.34), ww = Math.ceil(iw * 0.16), wh = Math.ceil(ih * 0.28), q = 3;
    var cw = Math.floor(ww / q), chh = Math.floor(wh / q), c = lienzo(cw, chh), cx = c.getContext('2d');
    cx.drawImage(img, wx0, wy0, ww, wh, 0, 0, cw, chh);
    var D = cx.getImageData(0, 0, cw, chh).data, x, y, dx, dy, sx = 0, sy = 0, n = 0;
    var oro = function (xx, yy) { var i = (yy * cw + xx) * 4; return D[i + 3] > 200 && D[i] > 110 && D[i + 1] > 70 && D[i + 2] < 125 && D[i] - D[i + 2] > 55 ? 1 : 0; };
    for (y = 2; y < chh - 2; y += 2) for (x = 2; x < cw - 2; x += 2) { var k = 0; for (dy = -2; dy <= 2; dy += 2) for (dx = -2; dx <= 2; dx += 2) k += oro(x + dx, y + dy); if (k >= 6) { sx += x; sy += y; n++; } }
    if (n < 12) return null;
    var side = iw * 0.17, mx = wx0 + sx / n * q - side * 0.0, my = wy0 + sy / n * q;
    var x0 = clamp(mx - side / 2, 0, iw - side), y0 = clamp(my - side / 2, 0, ih - side), cc = lienzo(128, 128), c2 = cc.getContext('2d');
    c2.drawImage(img, x0, y0, side, side, 0, 0, 128, 128);
    var im = c2.getImageData(0, 0, 128, 128), E2 = im.data, i;
    for (i = 0; i < E2.length; i += 4) { if (E2[i + 3] < 255) { var a = E2[i + 3] / 255; E2[i] = E2[i] * a + 120 * (1 - a); E2[i + 1] = E2[i + 1] * a + 80 * (1 - a); E2[i + 2] = E2[i + 2] * a + 24 * (1 - a); E2[i + 3] = 255; } }
    c2.putImageData(im, 0, 0);
    return cc;
  }
  function procesarImagen(img) {
    var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    return { oro: recortarOro(img, iw, ih) };   // SecurityError si el canvas está contaminado (file://): se queda el oro liso
  }
  function cargarTextura() {
    var s = S; s.texEstado = 'cargando';
    var fallo = function () { if (S !== s || s.texEstado !== 'cargando') return; s.texEstado = 'fallback'; vaciarCola(); };
    try {
      new THREE.TextureLoader().load(RUTA_IMG, function (tex) {
        if (S !== s) { tex.dispose(); return; }
        try {
          var r = procesarImagen(tex.image);
          if (r.oro) { var to = texCanvas(r.oro, true); s.tex.oro = to; s.rig.mat.oroH.map = to; s.rig.mat.oroH.color.setRGB(1, 1, 1); s.rig.mat.oroH.needsUpdate = true; }
          s.texEstado = 'ok'; tex.dispose(); vaciarCola();
        } catch (e) { s.errCarga = String(e && e.message || e); try { tex.dispose(); } catch (e2) {} fallo(); }
      }, undefined, fallo);
    } catch (e) { fallo(); }
  }
  function alCargar(fn) { if (S && S.texEstado !== 'cargando') fn(); else if (S) S.cola.push(fn); }
  function vaciarCola() { var q = S.cola.splice(0); q.forEach(function (f) { try { f(); } catch (e) {} }); }

  // ---------------------------------------------------------------- arranque / destrucción
  function init(canvas, opts) {
    THREE = global.THREE || THREE;
    if (S) destruir();
    if (!THREE || !canvas) return false;
    opts = opts || {};
    var r;
    try { r = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false, powerPreference: 'high-performance' }); } catch (e) { return false; }
    S = { canvas: canvas, renderer: r, reducido: !!opts.reducido, t: 0, w: 0, h: 0, dist: 20, jobs: [], A: null, cola: [], raf: 0, last: 0,
      frames: 0, acum: 0, fps: 60, pr: Math.min(global.devicePixelRatio || 1, 2), baja: 0, cal: 1, reflejo: true, texEstado: 'cargando',
      ap: null, m: null, vive: true, tt: 0, apCam: null, drag: 0, dragging: false, giro: null, giroAz: 0, capas: [], piel: [0.788, 0.569, 0.416],
      cw: { x: 0, y: 5.4, z: 0.8 }, cin: { ok: false, px: 0, py: 0, pz: 0, vx: 0, vy: 0, vz: 0, ax: 0, az: 0, spin: 0, om: 0 }, errCarga: null };
    r.setPixelRatio(S.pr); r.setClearColor(0x05060B, 1); r.info.autoReset = false;
    S.scene = new THREE.Scene();
    S.cam = new THREE.PerspectiveCamera(FOV, 1, 0.1, 200);
    S.tex = { glow: texGlow(), piso: texPiso(), rayos: texRayos(), luna: texLuna(), pagina: texPagina(), caja: texCaja(), grad: texGrad(), gradP: texGradP(), env: texEntorno() };
    S.V = { alas: 0.25, brillo: 1, golpe: 0, lit: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], flash: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      velo: [0, 0], A: 0.2, auraK: 1, perf: 0, rim: 0.4, ojos: [1, 1], col: RANGOC[0].slice(), blanco: 0, expande: 0, shake: 0, ojoBoost: 0, pot: 0, entregas: 0,
      pelo: 0.3, peloK: 0, peloC: [0.25, 0.45, 0.9], aleteo: 0, flashA: 0, flashC: null, irisW: 0 };
    S.hold = [0, 0, 0, 0, 0];
    S.P0 = nuevaPose(); S.plz = new Float32Array(2 * NPL); S.mech = new Float32Array(NPE * 3);
    S.capaS = { ax: new Float32Array(CAPA_N * 4), az: new Float32Array(CAPA_N * 4), vx: new Float32Array(CAPA_N * 4), vz: new Float32Array(CAPA_N * 4) };
    // luces: ambiente fría, clave arriba-izquierda, relleno cálido, borde del color del rango detrás
    S.luz = { amb: new THREE.AmbientLight(0xe4e6f2, 0.42), key: new THREE.DirectionalLight(0xfff1e0, 0.74), fill: new THREE.DirectionalLight(0xffc9a0, 0.22), rim: new THREE.DirectionalLight(0xffd166, 0.55) };
    S.luz.key.position.set(-5, 8, 10); S.luz.fill.position.set(7, -2, 7); S.luz.rim.position.set(0.5, 5, -10);
    S.scene.add(S.luz.amb); S.scene.add(S.luz.key); S.scene.add(S.luz.fill); S.scene.add(S.luz.rim);
    S.luzF = { fill: new THREE.PointLight(0xFFD9B0, 0, 0), az: new THREE.PointLight(0x4FB8FF, 0, 0), ro: new THREE.PointLight(0xFF3B4E, 0, 0) };   // primer plano de la apertura (siempre presentes: no cambian el nº de luces)
    S.scene.add(S.luzF.fill); S.scene.add(S.luzF.az); S.scene.add(S.luzF.ro);
    // el personaje (real) y su reflejo en el suelo
    S.pj = new THREE.Group(); S.pj.scale.set(SC, SC, SC); S.scene.add(S.pj);
    S.rig = construirRig('real'); S.pj.add(S.rig.root);
    S.refl = new THREE.Group(); S.refl.scale.set(SC, -SC, SC); S.scene.add(S.refl);
    S.rigR = construirRig('refl'); S.refl.add(S.rigR.root);
    S.tri = { real: S.rig.tri, reflejo: S.rigR.tri };
    construirMundo(); construirOjos(); construirBandas();
    S.rostro = { cl: [0, 0], ix: [0, 0], iy: [0, 0], fr: 0, irisS: 1 }; S.bl = { next: 2.5, t0: -1 };
    S.P = crearParticulas(); S.ondas = crearOndas(); S.gest = construirGestos(); S.taza = construirTaza();
    S.dir = { next: rnd(4, 8), act: null, last: null, force: null, pend: [], emp: null };
    snap();
    S.onVis = function () { if (document.hidden) { if (S.raf) { global.cancelAnimationFrame(S.raf); S.raf = 0; } } else arrancar(); };
    document.addEventListener('visibilitychange', S.onVis);
    if (global.ResizeObserver) { S.ro = new global.ResizeObserver(function () { redim(); }); S.ro.observe(canvas); }
    S.onWin = function () { redim(); };
    global.addEventListener('resize', S.onWin);
    enlazarArrastre(canvas);
    redim();
    cargarTextura();
    paso(0.016); dibujar();
    arrancar();
    return true;
  }
  // arrastre horizontal: gira la cámara hasta ±45°; al soltar vuelve sola al centro en ~3 s
  function enlazarArrastre(canvas) {
    var s = S, st = { id: null, x: 0 };
    try { if (!canvas.style.touchAction) canvas.style.touchAction = 'pan-y'; } catch (e) {}
    s.onDown = function (e) { if (e.button != null && e.button > 0) return; st.id = e.pointerId; st.x = e.clientX; s.dragging = true; try { canvas.setPointerCapture(e.pointerId); } catch (er) {} };
    s.onMove = function (e) { if (!s.dragging || e.pointerId !== st.id) return; var dx = e.clientX - st.x; st.x = e.clientX; s.drag = clamp(s.drag - dx * 0.0065, -AZ_MAX, AZ_MAX); };
    s.onUp = function (e) { if (e.pointerId !== st.id) return; s.dragging = false; st.id = null; };
    canvas.addEventListener('pointerdown', s.onDown); canvas.addEventListener('pointermove', s.onMove);
    canvas.addEventListener('pointerup', s.onUp); canvas.addEventListener('pointercancel', s.onUp);
  }
  function destruir() {
    if (!S) return;
    var s = S;
    s.vive = false;
    s.jobs.slice().forEach(function (j) { cerrarJob(j); });
    if (s.giro) cerrarGiro();
    if (s.A) cerrarApertura(true);
    if (s.raf) global.cancelAnimationFrame(s.raf);
    document.removeEventListener('visibilitychange', s.onVis);
    global.removeEventListener('resize', s.onWin);
    try { s.canvas.removeEventListener('pointerdown', s.onDown); s.canvas.removeEventListener('pointermove', s.onMove); s.canvas.removeEventListener('pointerup', s.onUp); s.canvas.removeEventListener('pointercancel', s.onUp); } catch (e) {}
    if (s.ro) s.ro.disconnect();
    s.scene.traverse(function (o) {
      if (o.geometry && o.geometry.dispose) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (m.dispose) m.dispose(); });
    });
    var k; for (k in GEO) if (GEO[k] && GEO[k].dispose) GEO[k].dispose();
    GEO = {};
    for (k in s.tex) if (s.tex[k] && s.tex[k].dispose) s.tex[k].dispose();
    s.renderer.dispose();
    S = null;
  }
  function redim() {
    if (!S) return;
    var c = S.canvas, w = c.clientWidth || 0, h = c.clientHeight || 0;
    if (!w || !h || (w === S.w && h === S.h)) return;
    S.w = w; S.h = h;
    S.renderer.setPixelRatio(S.pr); S.renderer.setSize(w, h, false);
    S.cam.aspect = w / h;
    var f = Math.tan(FOV * Math.PI / 360), asp = w / h;
    S.dist = Math.max(15.2 / 2 / f, 14.2 / 2 / (f * asp), 14);     // cuerpo entero con alas, en horizontal y en vertical
    S.cam.updateProjectionMatrix();
    S.P.uPx.value = h * S.pr / (2 * f);
    if (!S.raf) { paso(0.0001); dibujar(); }
  }
  function arrancar() { if (!S || S.raf || document.hidden) return; S.last = 0; S.raf = global.requestAnimationFrame(bucle); }
  function bucle(ts) {
    if (!S) return;
    S.raf = 0;
    if (document.hidden) return;
    var dt = S.last ? (ts - S.last) / 1000 : 0.016; S.last = ts;
    dt = clamp(dt, 0.001, 0.066);
    calidad(dt);
    paso(dt); dibujar();
    if (S) S.raf = global.requestAnimationFrame(bucle);
  }
  function calidad(dt) {   // si el equipo va lento: sin reflejo, menos partículas, menos píxeles
    S.acum += dt; S.frames++;
    if (S.frames >= 90) {
      S.fps = S.frames / S.acum;
      if (S.fps < 38 && S.baja < 2) {
        S.baja++;
        if (S.baja === 1) { S.reflejo = false; S.cal = 0.6; } else { S.pr = 1; S.renderer.setPixelRatio(1); S.renderer.setSize(S.w, S.h, false); S.P.uPx.value = S.h / (2 * Math.tan(FOV * Math.PI / 360)); S.cal = 0.4; }
      }
      S.frames = 0; S.acum = 0;
    }
  }

  // ---------------------------------------------------------------- estado público
  function setEstado(e) {
    e = e || {};
    if (e.rangoIdx != null) E.rangoIdx = clamp(Math.round(+e.rangoIdx || 0), 0, 9);
    if (e.progresoRango != null) E.prog = clamp(+e.progresoRango || 0, 0, 1);
    if (e.habitos) ORDEN.forEach(function (k) { if (e.habitos[k] != null) E.habitos[k] = !!e.habitos[k]; });
    if (e.perfecto != null) E.perfecto = !!e.perfecto;
    if (e.entregasSemana != null) E.entregas = Math.max(0, +e.entregasSemana || 0);
    estVer++; perfPost = false;
    if (S) { S.hold = [0, 0, 0, 0, 0]; if (S.reducido) snap(); }
  }
  function snap() {   // lleva los valores visibles al estado, sin transición
    if (!S || S.A) return;
    var V = S.V, p = (E.rangoIdx + E.prog) / 10, perf = (E.perfecto || perfPost) ? 1 : 0, n = 0, i;
    ORDEN.forEach(function (k, ix) { var on = E.habitos[k] ? 1 : 0; n += on; V.lit[ix] = on; V.lit[ix + 5] = on; });
    V.pot = p; V.perf = perf; V.entregas = E.entregas; V.velo[0] = V.velo[1] = Math.min(1, n / 5 + perf * 0.3);
    V.col = mezclaC(RANGOC[E.rangoIdx], COROC, perf * 0.45);
    for (i = 0; i < NBAN; i++) V.flash[i] = 0;
    V.auraK = 1;
  }

  // ---------------------------------------------------------------- fotograma: estado → valores visibles → pose → efectos
  function paso(dt) {
    var s = S, V = s.V, t, i, k;
    s.t += dt; t = s.t;
    s.m = { golpe: 0, brillo: 0, alas: 0, aura: 0, blanco: 0, expande: 0, rim: 0, velo: 0, shake: 0, flashA: 0, flashC: null, ojoBoost: 0, pelo: 0, peloC: null, aleteo: 0, mx: 0, my: 0, parp: 0, ceno: 0, irisW: 0 };
    s.ap = null; s.apCam = null; s.capas.length = 0;
    if (s.A) tickApertura(dt);
    s.jobs.slice().forEach(function (j) { tickJob(j, dt); });
    tickDirector(dt);   // acciones de reposo (pausadas durante apertura y gestos)
    var m = s.m, ap = s.ap, p = (E.rangoIdx + E.prog) / 10, perf = (E.perfecto || perfPost) ? 1 : 0, nOn = 0;
    ORDEN.forEach(function (key) { if (E.habitos[key]) nOn++; });
    var q = s.reducido ? 60 : 1;    // reducido: sin transiciones
    var tAlas = 0.25 + 0.4 * p + 0.35 * perf + m.alas, tBr = 1 + 0.07 * perf + m.brillo, tA = 0.2 + 0.5 * p + 0.45 * perf + m.aura;
    var tCol = mezclaC(RANGOC[E.rangoIdx], COROC, perf * 0.45), tRim = 0.3 + 0.9 * p + 0.5 * perf + m.rim, tPot = p;
    var auraK = ap && ap.auraK != null ? ap.auraK : 1;
    s.tt = s.reducido ? 3.0 : t;
    V.alas = s.reducido ? 0.12 : damp(V.alas, tAlas, 5 * q, dt); V.brillo = damp(V.brillo, tBr, 8 * q, dt); V.A = damp(V.A, tA, 5 * q, dt);
    V.col = mezclaC(V.col, tCol, 1 - Math.exp(-6 * q * dt)); V.rim = damp(V.rim, tRim, 6 * q, dt); V.perf = damp(V.perf, perf, 5 * q, dt);
    V.pot = damp(V.pot, tPot, 5 * q, dt); V.auraK = damp(V.auraK, auraK, 5 * q, dt);
    V.golpe = m.golpe; V.blanco = damp(V.blanco, m.blanco, 8, dt); V.expande = damp(V.expande, m.expande, 6, dt);
    V.shake = m.shake; V.ojoBoost = m.ojoBoost; V.irisW = clamp(m.irisW, 0, 1);
    for (i = 0; i < 2; i++) { var tv = Math.min(1, nOn / 5 + perf * 0.3) + m.velo; if (ap && ap.velo != null) tv = ap.velo; V.velo[i] = damp(V.velo[i], tv, 4 * q, dt); }
    for (i = 0; i < NBAN; i++) {
      k = i % 5;
      var tl = E.habitos[ORDEN[k]] ? 1 : 0;
      if (s.hold[k]) tl = Math.max(tl, s.hold[k]);
      if (ap && ap.bandas) tl = ap.bandas[k] ? 1 : 0;
      V.lit[i] = damp(V.lit[i], tl, ap && ap.bandas ? 9 : 6 * q, dt);
      V.flash[i] = Math.max(0, V.flash[i] - dt * 1.5);
    }
    V.ojos[0] = ap && ap.ojos ? ap.ojos[0] : 1; V.ojos[1] = ap && ap.ojos ? ap.ojos[1] : 1;
    V.flashA = m.flashA; V.flashC = m.flashC;
    var tPel = 0.15 + 0.35 * p + 0.3 * perf + m.pelo, tPC = m.peloC || (perf ? COROC : [0.25, 0.45, 0.9]);
    V.pelo = s.reducido ? tPel : damp(V.pelo, tPel, 6, dt);
    V.peloK = damp(V.peloK, m.peloC ? 1 : 0, 6, dt);
    V.peloC = mezclaC(V.peloC, tPC, 1 - Math.exp(-6 * dt));
    V.aleteo = m.aleteo;
    // luces: el brillo sube la exposición; el borde toma el color del aura
    var lz = ap && ap.luz != null ? ap.luz : 1, lk = ap && ap.luzK != null ? ap.luzK : 0, LF = s.luzF;   // la apertura empieza a oscuras; en el primer plano, relleno cálido y bordes azul/rojo
    LF.fill.intensity = 0.9 * lk; LF.az.intensity = 0.5 * lk; LF.ro.intensity = 0.5 * lk;
    if (ap && ap.hc) { LF.fill.position.set(ap.hc.x + 0.3, ap.hc.y + 0.2, ap.hc.z + 2.0); LF.az.position.set(ap.hc.x - 1.7, ap.hc.y + 0.1, ap.hc.z + 0.9); LF.ro.position.set(ap.hc.x + 1.7, ap.hc.y + 0.1, ap.hc.z + 0.9); }
    s.luz.amb.intensity = 0.42 * V.brillo * lz * (1 + 0.2 * lk); s.luz.key.intensity = 0.74 * V.brillo * lz; s.luz.fill.intensity = 0.22 * lz;
    s.luz.rim.color.setRGB(V.col[0], V.col[1], V.col[2]); s.luz.rim.intensity = (0.3 + 0.7 * V.rim) * V.auraK * lz;
    for (i = 0; i < 2; i++) {   // iris: azul / rojo, blanco-dorado en la sobrecarga; emisivo ×2 con el poder
      var mi = i ? s.rig.mat.irisD : s.rig.mat.irisI, ic = mezclaC(i ? CROJO : CAZUL, [1, 0.93, 0.72], V.irisW), il = (ap && ap.ojos ? ap.ojos[i] : 1), ib = 1 + clamp(V.ojoBoost, 0, 1);
      mi.color.setRGB(ic[0] * il * 0.5, ic[1] * il * 0.5, ic[2] * il * 0.5); mi.emissive.setRGB(ic[0] * il * ib, ic[1] * il * ib, ic[2] * il * ib);
    }
    s.rig.mat.oro.emissiveIntensity = 0.7 + 0.5 * V.rim;
    if (s.rig.mat.puntas) s.rig.mat.puntas.emissive.setRGB(0.003 + 0.5 * V.peloC[0] * V.peloK, 0.004 + 0.5 * V.peloC[1] * V.peloK, 0.01 + 0.5 * V.peloC[2] * V.peloK);
    if (s.rig.mat.pelo) s.rig.mat.pelo.emissive.setRGB(0.004 + 0.5 * V.peloC[0] * V.peloK, 0.006 + 0.5 * V.peloC[1] * V.peloK, 0.016 + 0.5 * V.peloC[2] * V.peloK);
    s.pisoGlow.visible = true;
    // cámara: el arrastre vuelve solo al centro (~3 s); el giro de prueba orbita y regresa
    if (!s.dragging) s.drag *= Math.exp(-1.05 * dt);
    if (s.giro) tickGiro(dt);
    posar(dt);
    s.pj.visible = !(ap && ap.oculto);
    s.pj.updateMatrixWorld(true);
    cinematica(dt);
    actualizarCuerpo(dt);
    actParticulas(dt); actOndas(dt);
    camara(dt);
  }

  function posar(dt) {
    var s = S, V = s.V, P = s.P0, t = s.tt, mov = s.reducido ? 0 : 1, i, l, m = s.m, amp = 1 + 0.6 * V.pot + 0.5 * V.perf, cin = s.cin;
    reposo(P);
    if (mov) {   // reposo vivo: flota, respira, mira a los lados, aprieta los puños, bate las alas
      P.ry += 0.04 * Math.sin(t * 6.2832 / 3.2); P.resp = Math.sin(t * 6.2832 / 2.8);
      P.cabeza[1] += 0.14 * Math.sin(t * 0.36); P.cabeza[0] += 0.025 * Math.sin(t * 0.53 + 1); P.cuello[1] += 0.04 * Math.sin(t * 0.36 + 0.3);
      P.torso[1] += 0.03 * Math.sin(t * 0.36 + 0.8); P.torso[2] += 0.012 * Math.sin(t * 0.8);
      P.puD = 1 + 0.07 * Math.sin(t * 0.95); P.puI = 1 + 0.07 * Math.sin(t * 0.95 + 1.7);
      P.brazoD[2] += 0.025 * Math.sin(t * 1.1); P.brazoI[2] += 0.025 * Math.sin(t * 1.1 + 1.2); P.codoD[0] += 0.04 * Math.sin(t * 0.9); P.codoI[0] += 0.04 * Math.sin(t * 0.9 + 1.4);
      P.caderaD[0] += 0.03 * Math.sin(t * 1.0); P.caderaI[0] -= 0.03 * Math.sin(t * 1.0); P.pieD[0] += 0.06 * Math.sin(t * 0.8 + 0.5); P.pieI[0] += 0.06 * Math.sin(t * 0.8 + 2);
      for (l = 0; l < 2; l++) { var ph = t * 1.3 + l * 0.35; P.fh[l] += 0.12 * amp * Math.sin(ph); P.fa[l] += 0.07 * amp * Math.sin(ph - 0.55); P.fm[l] += 0.09 * amp * Math.sin(ph - 1.1); }
    }
    for (i = 0; i < s.capas.length; i++) s.capas[i](P);
    var al = m.aleteo;
    if (al > 0.001 && mov) { for (l = 0; l < 2; l++) { P.fh[l] += 0.50 * al * Math.sin(t * 11 + l * 0.25); P.fa[l] += 0.34 * al * Math.sin(t * 11 - 0.8 + l * 0.25); P.fm[l] += 0.42 * al * Math.sin(t * 11 - 1.6 + l * 0.25); } P.fw += 0.12 * al; }
    poseAlas(P, V);
    P.ryF = lerp(P.ry, alturaSuelo(P), clamp(P.ground, 0, 1)) + P.lift;
    P.golpe += V.golpe;
    for (l = 0; l < 2; l++) for (i = 0; i < NPL; i++) s.plz[l * NPL + i] = anguloPluma(P, V, l, i, t, mov, amp);
    poseMechones(t, V, mov);
    simCapa(Math.min(dt, 0.05), { x: cin.ax, z: cin.az }, cin.vy, cin.om);
    posarCara(dt);
    aplicarRig(s.rig, P); if (s.reflejo) aplicarRig(s.rigR, P);
  }
  var _lv = null;
  function posarCara(dt) {   // párpados (parpadeo cada 3-5 s), mirada hacia la cámara, ceño, tamaño del iris
    var s = S, m = s.m, t = s.t, mov = s.reducido ? 0 : 1, F = s.rostro, B = s.bl, i;
    if (mov && t >= B.next) { B.t0 = t; B.next = t + rnd(3, 5); }
    var bl = (mov && B.t0 >= 0 && t - B.t0 < 0.14) ? Math.sin(Math.PI * (t - B.t0) / 0.14) : 0, cl = clamp(Math.max(bl, m.parp), 0, 1);
    if (!_lv) _lv = new THREE.Vector3();
    var cab = s.rig.n.cabeza; _lv.set(s.cam.position.x, s.cam.position.y, s.cam.position.z); cab.worldToLocal(_lv);
    for (i = 0; i < 2; i++) {
      var R = s.rig.ojo[i], ex = R.s * 0.0533, dx = _lv.x - ex, dy = _lv.y - Y_OJO, dz = _lv.z, dl = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      F.ix[i] = damp(F.ix[i], mov ? clamp(dx / dl * 0.08 + m.mx, -0.015, 0.015) : 0, 10, dt); F.iy[i] = damp(F.iy[i], mov ? clamp(dy / dl * 0.05 + m.my, -0.005, 0.005) : 0, 10, dt);
      F.cl[i] = cl;
    }
    F.fr = clamp(m.ceno, 0, 1); F.irisS = 1 + 0.15 * clamp(s.V.ojoBoost, 0, 1);
  }
  function cinematica(dt) {   // posición del pecho en el mundo y su aceleración (la capa la usa)
    var s = S, C = s.cin, o = pw(s.rig.n.pecho, 0, 0.14, 0.18, s.cw), sp = s.P0.spin;
    if (C.ok && dt > 0.004) {
      var vx = (o.x - C.px) / dt / SC, vy = (o.y - C.py) / dt / SC, vz = (o.z - C.pz) / dt / SC;
      C.ax = damp(C.ax, clamp((vx - C.vx) / dt, -40, 40), 16, dt); C.az = damp(C.az, clamp((vz - C.vz) / dt, -40, 40), 16, dt);
      C.vx = vx; C.vy = vy; C.vz = vz; C.om = damp(C.om, wrapA(sp - C.spin) / dt, 12, dt);
    } else if (!C.ok) { C.ok = true; C.vx = C.vy = C.vz = 0; }
    C.px = o.x; C.py = o.y; C.pz = o.z; C.spin = sp;
  }

  function actualizarCuerpo(dt) {   // sprites, rayos, aura, anillos, ojos, bandas, partículas ambientales
    var s = S, V = s.V, t = s.t, i, j, o = { x: 0, y: 0, z: 0 }, mov = s.reducido ? 0 : 1, col = V.col, cy = s.cw.y;
    var ak = V.auraK, A = V.A * ak, tam = 11 + 5 * V.pot + 3 * V.perf + 2.2 * V.expande;
    s.aura.visible = A > 0.01; s.aura.material.opacity = clamp(0.1 + 0.55 * A, 0, 0.85); s.aura.scale.set(tam * 1.15, tam, 1); setC(s.aura, col);
    s.aura.position.set(0, cy + 0.6, -2.2);
    s.aura2.visible = A > 0.01; s.aura2.material.opacity = clamp(0.06 + 0.4 * A, 0, 0.7); setC(s.aura2, mezclaC(col, CBLANCO, 0.3)); s.aura2.scale.set(tam * 0.55, tam * 0.5, 1);
    s.aura2.position.set(0, cy + 1.9, -1.4);
    s.rayos.visible = V.perf * ak > 0.02; s.rayos.material.opacity = 0.5 * V.perf * ak; setC(s.rayos, COROC); s.rayos.scale.set(22 + 3 * V.expande, 22 + 3 * V.expande, 1);
    s.rayos.material.rotation = mov ? t * 0.1 : 0; s.rayos.position.set(0, cy + 1.0, -2.0);
    s.pisoGlow.material.opacity = clamp(0.1 + 0.4 * A, 0, 0.6); s.pisoGlow.material.color.setRGB(col[0], col[1], col[2]); s.pisoGlow.scale.set(16 + 6 * V.pot + 3 * V.expande, 7 + 2 * V.pot, 1);
    s.anillos.forEach(function (a, k) {
      var u = a.u, R = a.R * (1 + 0.5 * V.expande * (1 + k * 0.1)) * (1 + 0.04 * V.pot);
      u.uCol.value.setRGB(col[0], col[1], col[2]); u.uWhite.value = V.blanco; u.uT.value = mov ? t : 0;
      u.uOp.value = clamp((0.3 + 0.35 * V.pot + 0.3 * V.perf + 0.5 * V.blanco) * ak, 0, 1.2);
      a.mesh.visible = u.uOp.value > 0.01; a.mesh.scale.set(R, R, 1); a.mesh.position.y = cy + 0.9;
      a.mesh.rotation.z = mov ? t * a.spin * 0.15 + a.rot : a.rot;
    });
    s.niebla.forEach(function (n) { var d = n.userData; n.position.set(((d.x + (mov ? t * d.v : 0)) % 34) - 17 + 0 * d.ph, d.y, d.z); n.material.opacity = 0.05 + 0.03 * Math.sin(t * 0.3 + d.ph); setC(n, mezclaC([0.45, 0.5, 0.7], col, 0.18 * V.A)); });
    // ojos 3D (en el rig): aquí solo el halo pequeño detrás del iris y el rayo; solo se ven si la cara mira a la cámara
    var cab = s.rig.n.cabeza, he = cab.matrixWorld.elements, fl = Math.sqrt(he[8] * he[8] + he[9] * he[9] + he[10] * he[10]) || 1, cp = s.cam.position;
    for (i = 0; i < 2; i++) {
      var oj = s.ojos[i], ic = mezclaC(oj.c, [1, 0.93, 0.72], V.irisW);
      pw(s.rig.ojo[i].iris, 0, 0, 0.006, o);
      var vx = cp.x - o.x, vy = cp.y - o.y, vz = cp.z - o.z, vl = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;
      var fac = clamp(((he[8] * vx + he[9] * vy + he[10] * vz) / (fl * vl) - 0.12) / 0.4, 0, 1); oj.fac = fac;
      var on = V.ojos[i] * (1 - s.rostro.cl[i]), bst = V.ojoBoost;   // luz puntual tenue del color del ojo (sin halo)
      oj.luz.position.set(o.x + vx / vl * 0.35, o.y + vy / vl * 0.35, o.z + vz / vl * 0.35); oj.luz.color.setRGB(ic[0], ic[1], ic[2]); oj.luz.intensity = on * (0.28 + 0.5 * clamp(bst, 0, 1.2));
      if (oj.rayo * fac > 0.02) {
        if (t >= (oj.prox || 0)) {
          oj.prox = t + 0.05;
          var dir = i ? 1 : -1, a0 = { x: o.x + dir * 0.2, y: o.y, z: o.z }, b0 = { x: o.x + dir * (4.4 + 2.0 * oj.rayo), y: o.y + rnd(-0.35, 0.5), z: o.z };
          oj.pts = ptsRelampago(a0, b0, 14, 0.35, oj.pts); oj.bolt.color = oj.c; oj.bolt.set(oj.pts, 0.07, clamp(oj.rayo * fac, 0, 1));
        }
      } else if (oj.bolt.vis) oj.bolt.hide();
    }
    // bandas de hábito sobre las plumas: velo + chispas + relámpago que recorre la banda; la pluma toma el color (emisivo)
    var M = s.rig.mat, mc;
    for (i = 0; i < NBAN; i++) {
      var b = s.B[i], L = clamp(V.lit[i] + V.flash[i], 0, 2.2), alta = L > 0.03, vv = V.velo[b.lado] * V.auraK, vc = b.lado ? CROJO : CAZUL;
      mc = M.plumas[i].emissive;
      mc.setRGB(clamp(b.c[0] * L * 0.55 + vc[0] * vv * 0.22, 0, 1), clamp(b.c[1] * L * 0.55 + vc[1] * vv * 0.22, 0, 1), clamp(b.c[2] * L * 0.55 + vc[2] * vv * 0.22, 0, 1));
      for (j = 0; j < 6; j++) {
        var sp = b.spr[j], uv = b.uv[j];
        sp.visible = alta; if (!alta) continue;
        ptoAla(b.lado, b.k, uv.f, uv.rf, 0.25, o); sp.position.set(o.x, o.y, o.z);
        var tw = 0.6 + 0.4 * Math.sin(t * 5.5 + uv.ph);
        sp.material.opacity = clamp(L * 0.5 * tw, 0, 1); var sz = uv.tam * (0.7 + 0.5 * Math.min(L, 1.6)) * 1.4; sp.scale.set(sz, sz, 1);
      }
      if (alta && t >= b.prox) {
        b.prox = b.prog >= 0 ? t : t + 0.09;
        var n = b.ruta.length, pts = b.pts || (b.pts = []), q;
        for (q = 0; q < n; q++) { var r = b.ruta[q], pp = pts[q] || (pts[q] = { x: 0, y: 0, z: 0 }); ptoAla(b.lado, b.k, r.f, r.rf, 0.3, pp); }
        var jit = [];
        for (q = 0; q < n; q++) { var off = (q === 0 || q === n - 1) ? 0 : (Math.random() * 2 - 1) * 0.3 * Math.sin(Math.PI * q / (n - 1)); var q0 = pts[Math.max(0, q - 1)], q1 = pts[Math.min(n - 1, q + 1)], dx = q1.x - q0.x, dy = q1.y - q0.y, l = Math.sqrt(dx * dx + dy * dy) || 1; jit.push({ x: pts[q].x - dy / l * off, y: pts[q].y + dx / l * off, z: pts[q].z }); }
        var fr = b.prog >= 0 ? clamp(b.prog, 0.02, 1) : (Math.random() < 0.7 ? rnd(0.55, 1) : 0.0);
        b.bolt.color = b.c;
        if (fr > 0.02) b.bolt.set(jit, 0.075 * (0.7 + 0.4 * Math.min(L, 1.5)), clamp(L * 0.8, 0, 1), fr); else b.bolt.hide();
        if (mov && Math.random() < 0.55 * Math.min(L, 1.2)) { var uv2 = b.uv[(Math.random() * 6) | 0]; ptoAla(b.lado, b.k, uv2.f, uv2.rf, 0.25, o); emitir(o.x, o.y, o.z, rnd(-0.5, 0.5), rnd(1.4, 3.0), rnd(-0.2, 0.2), b.c, rnd(0.18, 0.34), rnd(0.9, 1.5), 0.15, 0.4); }
      } else if (!alta && b.bolt.vis) b.bolt.hide();
    }
    // relámpagos finos ocasionales sobre las alas (azul izquierda, rojo derecha)
    s.velos.forEach(function (vl) {
      var vv = V.velo[vl.lado] * V.auraK;
      if (vl.vida > 0) { vl.vida -= dt; vl.bolt.set(vl.pts, 0.05, clamp(vl.vida * 7, 0, 0.9) * vv); if (vl.vida <= 0) vl.bolt.hide(); }
      else if (mov && vv > 0.05 && t >= vl.prox) {
        vl.prox = t + rnd(0.5, 1.6) / (0.4 + vv); vl.vida = rnd(0.12, 0.22);
        var kb = (Math.random() * 5) | 0, ff = Math.random();
        var pa = ptoAla(vl.lado, kb, ff, 0.2, 0.3, { x: 0, y: 0, z: 0 }), pb = ptoAla(vl.lado, kb, clamp(ff + rnd(-0.2, 0.2), 0, 1), rnd(0.8, 1), 0.3, { x: 0, y: 0, z: 0 });
        vl.pts = ptsRelampago(pa, pb, 12, 0.5, vl.pts); vl.bolt.color = vl.lado ? CROJO : CAZUL;
      }
    });
    // puntas del copete: brillo del color del gesto
    s.puntas.forEach(function (pt, k) {
      var h = s.rig.pelo[k], on = h.fwd ? clamp(V.peloK * 0.9, 0, 1) : 0;
      pt.visible = on > 0.02; if (!pt.visible) return;
      pw(h.n, 0, h.L * 1.0, 0.0, o); pt.position.set(o.x, o.y, o.z); setC(pt, V.peloC); pt.material.opacity = on * 0.7; pt.scale.set(0.4, 0.4, 1);
    });
    if (V.flashA > 0.005) { s.flash.visible = true; s.flash.material.opacity = clamp(V.flashA, 0, 1); var fc = V.flashC || CBLANCO; s.flash.material.color.setRGB(fc[0], fc[1], fc[2]); } else s.flash.visible = false;
    if (mov && !s.noAmb) {   // partículas ambientales que suben
      var rate = (14 + 70 * V.A + 40 * V.perf) * s.cal * V.auraK, cnt = rate * dt + (s.ambAcc || 0);
      var nE = Math.floor(cnt); s.ambAcc = cnt - nE;
      for (i = 0; i < nE; i++) {
        var cc = Math.random() < 0.4 + 0.4 * V.perf ? mezclaC(col, COROC, 0.5) : col;
        emitir(rnd(-5.2, 5.2), rnd(1.2, 10.5), rnd(-1.5, 1.0), rnd(-0.15, 0.15), rnd(0.5, 1.8) * (1 + V.perf), rnd(-0.1, 0.1), cc, rnd(0.12, 0.3) * (1 + V.perf * 0.5), rnd(2.0, 3.6), 0, 0.2);
      }
    }
  }

  // ---------------------------------------------------------------- cámara que orbita: vaivén ±12°, arrastre hasta ±45°, giro de prueba; baja, a la altura del pecho, mirando un poco hacia arriba
  function swayAz() { var s = S; return s.reducido ? 0 : AZ_AUTO * Math.sin(s.t * 0.42) * (1 - clamp(Math.abs(s.drag) / 0.15, 0, 1)); }
  function camara(dt) {
    var s = S, V = s.V, t = s.t, mov = s.reducido ? 0 : 1;
    var usr = clamp(s.drag + s.giroAz, -AZ_MAX, AZ_MAX), az = swayAz() + usr, el = -0.045 + mov * 0.012 * Math.sin(t * 0.5), d = s.dist, sx = 0, sy = 0;
    var kc = clamp((d * Math.tan(FOV * Math.PI / 360) - 7.4) / 6, 0, 1), ty = lerp(TY, 5.0, kc) + 0.2 * (s.P0.ryF - 0.065) * SC;   // en pantallas altas el personaje se centra
    if (V.shake > 0.001 && mov) { sx = (Math.random() - 0.5) * 0.4 * V.shake; sy = (Math.random() - 0.5) * 0.3 * V.shake; }
    var px = Math.sin(az) * Math.cos(el) * d, py = ty + Math.sin(el) * d, pz = Math.cos(az) * Math.cos(el) * d, lx = 0, ly = ty, lz = 0, c = s.apCam;
    if (c && c.hc) {   // apertura: primer plano de la cara, contrapicado, que se aleja hasta la vista normal
      var k = c.e, hc = c.hc, cx = hc.x + 0.35, cy = hc.y - 0.45, cz = hc.z + 2.6;
      px = lerp(cx, px, k); py = lerp(cy, py, k); pz = lerp(cz, pz, k); lx = lerp(hc.x, lx, k); ly = lerp(hc.y, ly, k); lz = lerp(hc.z, lz, k);
    }
    s.cam.position.set(px + sx, py + sy, pz); s.cam.lookAt(lx + sx * 0.5, ly, lz);
  }
  // girar(grados): la cámara orbita esos grados (por defecto 40), se queda un momento y vuelve; resuelve al terminar (≈3.4 s)
  function girar(grados) {
    if (!S) return Promise.resolve();
    if (S.giro) cerrarGiro();
    return new Promise(function (res) {
      var s = S, Gi = { t: 0, dur: 3.4, amp: (grados == null ? 40 : +grados || 0) * Math.PI / 180, res: res };
      s.giro = Gi; Gi.timer = setTimeout(function () { if (S === s && s.giro === Gi) cerrarGiro(); }, Gi.dur * 1000 + 120);
    });
  }
  function tickGiro(dt) { var Gi = S.giro; Gi.t += dt; var p = Gi.t / Gi.dur; S.giroAz = Gi.amp * eIO(rampa(0, 0.38, p)) * (1 - eIO(rampa(0.62, 1, p))); if (p >= 1) cerrarGiro(); }
  function cerrarGiro() { var s = S, Gi = s && s.giro; if (!Gi) return; clearTimeout(Gi.timer); s.giro = null; s.giroAz = 0; Gi.res(); }

  function dibujar() {
    var s = S; if (!s || !s.w) return;
    s.refl.visible = s.reflejo && s.pj.visible && !(s.ap && s.ap.sinRefl);
    try { s.renderer.info.reset(); s.renderer.render(s.scene, s.cam); } catch (e) { s.errCarga = String(e && e.message || e); }
  }
  function fotograma(ms) { if (!S) return; var n = Math.max(1, Math.round((ms || 16) / 16)), i; for (i = 0; i < n; i++) paso(Math.min(0.05, (ms || 16) / 1000 / n)); dibujar(); }
  function stats() {
    if (!S) return null;
    var inf = S.renderer.info.render, ti = S.tri;
    return { triangulos: inf.triangles, estimados: ti.real + (S.reflejo ? ti.reflejo : 0) + 2200, llamadas: inf.calls, fps: Math.round(S.fps), reflejo: S.reflejo, textura: S.texEstado,
      ojos: '3D', plumas: 2 * NPL, mechones: NPE, tiras: CAPA_N, piezasReal: ti.real, piezasReflejo: ti.reflejo, error: S.errCarga || S.error || null };
  }

  // ---------------------------------------------------------------- trabajos (animaciones que no se bloquean entre sí; la más nueva manda en la pose)
  function nuevoJob(tipo, dur, tick, fin, extra) {
    var sp = S.reducido ? 1.8 : 1, J = { tipo: tipo, t: 0, dur: dur / sp, sp: sp, tick: tick, fin: fin, res: [], hecho: false, e: {} }, k;
    if (extra) for (k in extra) J[k] = extra[k];
    S.jobs.push(J);
    J.timer = setTimeout(function () { cerrarJob(J); }, J.dur * 1000 + 90);   // red de seguridad aunque la pestaña esté oculta
    return J;
  }
  function tickJob(J, dt) { if (J.hecho) return; J.t += dt; try { J.tick(J, J.t * J.sp, dt); } catch (e) { S.error = String(e && e.stack || e); } if (J.t >= J.dur) cerrarJob(J); }
  function cerrarJob(J) {
    if (J.hecho) return;
    J.hecho = true; clearTimeout(J.timer);
    if (S) { var ix = S.jobs.indexOf(J); if (ix >= 0) S.jobs.splice(ix, 1); }
    try { if (J.fin && S) J.fin(J); } catch (e) {}
    J.res.forEach(function (r) { r(); });
  }
  function pecho() { return S.cw; }
  function envol(tau, a, b, c, d) { return sstep(a, b, tau) * (1 - sstep(c, d, tau)); }   // sube de a→b, baja de c→d
  function brilloBandas(k, v, prog) { S.V.flash[k] = Math.max(S.V.flash[k], v); S.V.flash[k + 5] = Math.max(S.V.flash[k + 5], v); if (prog != null) { S.B[k].prog = prog; S.B[k + 5].prog = prog; } }
  function capa(fn) { S.capas.push(fn); }
  var _m1 = { x: 0, y: 0, z: 0 }, _m2 = { x: 0, y: 0, z: 0 };
  function manoW(lado, o) {   // centro del puño en el mundo (en reducido, un punto fijo frente al pecho)
    return S.reducido ? pw(S.rig.n.pecho, (lado === 'I' ? -1 : 1) * 0.05, 0.1, 0.32, o) : pw(S.rig.n['mano' + lado], 0, -0.06, 0.03, o);
  }

  // ---- objetos de los gestos (se crean una vez)
  function construirGestos() {
    var Gs = {}, sc = S.scene, i;
    var pm = function () { return new THREE.MeshBasicMaterial({ map: S.tex.pagina, color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, side: THREE.DoubleSide }); };
    Gs.libro = new THREE.Group(); Gs.libro.visible = false; Gs.pl = new THREE.Group(); Gs.pr = new THREE.Group();
    var pg = new THREE.PlaneGeometry(2.3, 1.7);
    Gs.mL = new THREE.Mesh(pg, pm()); Gs.mR = new THREE.Mesh(pg, pm());
    Gs.mL.position.x = -1.15; Gs.mR.position.x = 1.15; Gs.mR.scale.x = -1; Gs.mL.renderOrder = Gs.mR.renderOrder = 24;
    Gs.pl.add(Gs.mL); Gs.pr.add(Gs.mR); Gs.libro.add(Gs.pl); Gs.libro.add(Gs.pr); sc.add(Gs.libro);
    Gs.libroGlow = spr(S.tex.glow, HABC.leer, 5, 0, 23);
    Gs.paginas = []; for (i = 0; i < 8; i++) Gs.paginas.push({ s: spr(S.tex.pagina, HABC.leer, 0.8, 0, 25), x: 0, y: 0, z: 0, vx: 0, vy: 0, rot: 0 });
    Gs.trazos = [0, 1, 2].map(function () { return crearBolt(30, 26); }); Gs.pluma = spr(S.tex.glow, HABC.escribir, 1.4, 0, 27);
    Gs.cad = [0, 1].map(function () { var a = []; for (var k = 0; k < 9; k++) a.push({ s: spr(S.tex.glow, HABC.ayuno, 0.6, 0, 25, 1.7), x: 0, y: 0, z: 0, vx: 0, vy: 0 }); return a; });
    Gs.punos = [spr(S.tex.glow, HABC.ayuno, 2, 0, 24), spr(S.tex.glow, HABC.ayuno, 2, 0, 24)];
    Gs.luna = spr(S.tex.luna, [0.7, 0.8, 1], 5.2, 0, 9, 1, true); Gs.lunaGlow = spr(S.tex.glow, HABC.dormir, 10, 0, 8, 1, true);
    Gs.orbe = spr(S.tex.glow, [1, 1, 1], 2, 0, 24);
    Gs.meditar = spr(S.tex.glow, HABC.meditar, 9, 0, 7, 1, true);
    Gs.caja = spr(S.tex.caja, COROC, 1.6, 0, 27); Gs.cajaGlow = spr(S.tex.glow, COROC, 3, 0, 26);
    S.puntas = []; for (i = 0; i < NPE; i++) S.puntas.push(spr(S.tex.glow, [0.3, 0.5, 1], 1, 0, 21));
    return Gs;
  }
  function ocultarGestos(key) {
    var Gs = S.gest;
    Gs.orbe.visible = false;
    if (key === 'leer') { Gs.libro.visible = false; Gs.libroGlow.visible = false; Gs.paginas.forEach(function (p) { p.s.visible = false; }); }
    if (key === 'escribir') { Gs.trazos.forEach(function (b) { b.hide(); }); Gs.pluma.visible = false; }
    if (key === 'ayuno') { Gs.cad.forEach(function (c) { c.forEach(function (l) { l.s.visible = false; }); }); Gs.punos.forEach(function (p) { p.visible = false; }); }
    if (key === 'dormir') { Gs.luna.visible = false; Gs.lunaGlow.visible = false; }
    if (key === 'meditar') Gs.meditar.visible = false;
  }

  // ---------------------------------------------------------------- subir(hábito): gesto → carga (se agacha, puños) → estallido (cabeza atrás, destello, banda, onda)
  var T_CARGA = 1.10, T_EST = 1.55;
  function subir(key) {
    if (!S || ORDEN.indexOf(key) < 0) return Promise.resolve();
    return new Promise(function (res) {
      var J = nuevoJob('subir', DUR.subir, tickSubir, finSubir, { key: key, k: ORDEN.indexOf(key) });
      J.res.push(res);
    });
  }
  function tickSubir(J, tau, dt) {
    var s = S, m = s.m, c = HABC[J.key], k = J.k, ch = pecho(), e = J.e, i, x, mov = s.reducido ? 0 : 1;
    var wG = sstep(0, 0.28, tau) * (1 - sstep(T_CARGA - 0.12, T_CARGA + 0.15, tau));
    var wC = sstep(T_CARGA - 0.05, T_CARGA + 0.25, tau) * (1 - sstep(T_EST - 0.08, T_EST + 0.02, tau));
    var wB = sstep(T_EST - 0.04, T_EST + 0.12, tau) * (1 - sstep(1.78, 2.05, tau));
    gestoEspecifico(J, tau, dt, wG * mov);   // primero el gesto propio; la carga y el estallido mandan después
    capa(function (P) {
      P.ground += wC * mov; mezT(P, PO.agacha, wC * mov); mezT(P, PO.estalla, wB * mov);
      P.lift += mov * 0.16 * Math.sin(Math.PI * clamp((tau - T_EST) / 0.55, 0, 1));
      P.puD *= 1 + 0.16 * wC * mov; P.puI *= 1 + 0.16 * wC * mov; P.mandibula[0] += 0.36 * wB * mov;   // grito mudo: la mandíbula gira ~20°
    });
    m.ceno += 0.7 * (wC + wB);
    // 1) carga: partículas succionadas al pecho, el brillo baja un poco
    if (tau < T_EST) {
      x = rampa(0.6, T_EST, tau); var cx = x * x;
      m.brillo -= 0.25 * cx; m.aura += 0.3 * cx; m.golpe -= 0.45 * cx * mov; m.ojoBoost += 0.2 * cx; m.pelo += 0.35 * cx;
      var n = (s.reducido ? 3 : 7) * s.cal | 0;
      if (x > 0) for (i = 0; i < n; i++) {
        var a = Math.random() * 6.283, r = rnd(4.5, 8), ix = emitir(ch.x + Math.cos(a) * r, ch.y + Math.sin(a) * r * 0.8, ch.z + rnd(-1, 0.6), 0, 0, 0, c, rnd(0.2, 0.42), 0.8, 0, 0.5);
        if (ix != null) atraer(ix, ch.x, ch.y, ch.z + 0.3, 7);
      }
      s.gest.orbe.visible = x > 0; s.gest.orbe.position.set(ch.x, ch.y, ch.z + 0.3); setC(s.gest.orbe, mezclaC(c, CBLANCO, 0.4)); s.gest.orbe.material.opacity = 0.9 * cx; var os = 0.6 + 2.2 * cx; s.gest.orbe.scale.set(os, os, 1);
    }
    // 2) estallido
    if (tau >= T_EST && !e.est) {
      e.est = true; s.gest.orbe.visible = false;
      rafaga(ch.x, ch.y, ch.z, s.reducido ? 40 : 120, 4, 10, c, 0.42, 1.1, -0.6, 0.9);
      onda(c, 13, 1.15, 0, 1); onda(mezclaC(c, CBLANCO, 0.5), 8, 0.85, 0.08, 0.9, true);
      s.ojos.forEach(function (o) { o.rayo = 1; });
      s.hold[k] = 1; E.habitos[J.key] = true; brilloBandas(k, 1.4, 0);
    }
    if (tau >= T_EST) {
      var d = tau - T_EST;
      m.golpe += mov * Math.sin(Math.PI * clamp(d / 0.5, 0, 1)); m.alas += 0.9 * Math.exp(-d / 0.9); m.aura += 0.6 * Math.exp(-d / 0.8);
      m.expande += 0.35 * Math.exp(-d / 0.6); m.ojoBoost += Math.exp(-d / 0.7); m.rim += 0.8 * Math.exp(-d / 0.5);
      m.flashA += 0.38 * Math.exp(-d / 0.16); m.flashC = mezclaC(c, CBLANCO, 0.35); m.brillo += 0.35 * Math.exp(-d / 0.35);
      m.pelo += 1.0 * Math.exp(-d / 1.1); m.peloC = mezclaC(c, CBLANCO, 0.2); m.aleteo += 0.7 * Math.sin(Math.PI * clamp(d / 0.45, 0, 1));
      s.ojos.forEach(function (o) { o.rayo = Math.max(0, o.rayo - dt * 2.1); });
      if (tau >= T_EST + 0.05) { var pr = rampa(T_EST + 0.05, T_EST + 0.45, tau); s.B[k].prog = pr >= 1 ? -1 : pr; s.B[k + 5].prog = pr >= 1 ? -1 : pr; }
      if (tau < T_EST + 0.45) brilloBandas(k, 1.2 - 0.5 * rampa(T_EST + 0.05, T_EST + 0.45, tau));
    }
  }
  function finSubir(J) {
    var s = S; ocultarGestos(J.key);
    s.B[J.k].prog = -1; s.B[J.k + 5].prog = -1;
    var otro = s.jobs.some(function (j) { return j !== J && j.tipo === 'subir'; });
    if (!otro) s.ojos.forEach(function (o) { o.rayo = 0; });
  }

  // un gesto de cuerpo completo por hábito (ventana 0 → ~1.1 s); w = peso del gesto (0 en reducido: solo luz)
  function gestoEspecifico(J, tau, dt, w) {
    var s = S, Gs = s.gest, m = s.m, key = J.key, c = HABC[key], e = J.e, i, j, ch = pecho(), mov = s.reducido ? 0 : 1;
    if (key === 'leer') {
      var bow = envol(tau, 0.10, 0.50, 0.75, 1.10);
      capa(function (P) {
        mez(P.torso, [0.10, 0, 0], w); mez(P.pecho, [0.05, 0, 0], w); mez(P.cabeza, [0.34 * bow, 0, 0], w);
        ikBrazo(P, 'D', 0.05, 0.12, 0.30, w); ikBrazo(P, 'I', 0.05, 0.12, 0.30, w);
      });
      var op = envol(tau, 0.2, 0.55, 1.65, 2.0), ap = eOut(rampa(0.4, 1.05, tau)), th = lerp(1.45, 0.16, ap);
      manoW('D', _m1); manoW('I', _m2);
      var mx = (_m1.x + _m2.x) / 2, my = (_m1.y + _m2.y) / 2 + 0.25, mz = (_m1.z + _m2.z) / 2 + 0.45;
      Gs.libro.visible = op > 0.01; Gs.libro.position.set(mx, my, mz); Gs.libro.scale.set(0.62, 0.62, 1);
      Gs.pl.rotation.y = th; Gs.pr.rotation.y = -th; Gs.pl.rotation.x = Gs.pr.rotation.x = -0.18;
      [Gs.mL, Gs.mR].forEach(function (mm) { mm.material.opacity = 0.8 * op; mm.material.color.setRGB(c[0], c[1], c[2]); });
      Gs.libroGlow.visible = op > 0.01; Gs.libroGlow.position.set(mx, my, mz - 0.1); Gs.libroGlow.material.opacity = 0.55 * op; Gs.libroGlow.scale.set(4 * ap + 0.8, 2.6 * ap + 0.8, 1);
      Gs.paginas.forEach(function (p, ix) {
        var t0 = 0.75 + ix * 0.09, tt = tau - t0, pg = p.s;
        if (tt < 0) { pg.visible = false; return; }
        if (p.on !== J) { p.on = J; p.x = mx + rnd(-0.6, 0.6); p.y = my; p.z = mz + 0.1; p.vx = rnd(-1.0, 1.0); p.vy = rnd(1.6, 3.0); p.rot = rnd(-1, 1); }
        p.x += p.vx * dt + Math.sin(tt * 4 + ix) * 0.01; p.y += p.vy * dt; p.vy *= (1 - 0.3 * dt); pg.material.rotation = p.rot + tt * 2.4 * (ix % 2 ? 1 : -1);
        pg.visible = true; pg.position.set(p.x, p.y, p.z); var sz = 0.8 + 0.2 * Math.sin(ix); pg.scale.set(sz, sz, 1);
        pg.material.opacity = clamp(0.9 * (1 - sstep(1.4, 2.0, tau)) * sstep(0, 0.12, tt), 0, 1);
      });
    } else if (key === 'escribir') {
      // tres trazos en el aire a la derecha: la mano los dibuja de verdad (la línea sigue la muñeca)
      var ST = [[[0.40, 0.56, 0.30], [0.62, 0.50, 0.31]], [[0.62, 0.40, 0.31], [0.40, 0.35, 0.30]], [[0.40, 0.25, 0.30], [0.60, 0.19, 0.31]]];
      var T0 = [0.22, 0.52, 0.82], DT = 0.24, hx = 0.34, hy = 0.10, hz = 0.18, st = -1;
      if (tau < T0[0]) { var q0 = sstep(0, T0[0], tau); hx = lerp(0.34, ST[0][0][0], q0); hy = lerp(0.10, ST[0][0][1], q0); hz = lerp(0.18, ST[0][0][2], q0); }
      else {
        st = tau >= T0[2] ? 2 : (tau >= T0[1] ? 1 : 0);
        var u = clamp((tau - T0[st]) / DT, 0, 1), A0 = ST[st][0], A1 = ST[st][1];
        hx = lerp(A0[0], A1[0], u); hy = lerp(A0[1], A1[1], u) + 0.025 * Math.sin(u * 18); hz = lerp(A0[2], A1[2], u);
        if (u >= 1 && st < 2) { var nx = ST[st + 1][0], q1 = sstep(0, 1, clamp((tau - T0[st] - DT) / (T0[st + 1] - T0[st] - DT), 0, 1)); hx = lerp(A1[0], nx[0], q1); hy = lerp(A1[1], nx[1], q1); hz = lerp(A1[2], nx[2], q1); }
      }
      capa(function (P) {
        mez(P.torso, [0.04, 0.22, 0], w); mez(P.pecho, [0.0, 0.08, 0], w); mez(P.cabeza, [0.08, 0.16 + 0.8 * (hx - 0.40), 0], w); mez(P.brazoI, [0.0, 0, 0.45], w * 0.6);
        ikBrazo(P, 'D', hx, hy, hz, w);
      });
      var fade = 1 - sstep(1.7, 2.05, tau), head = null;
      manoW('D', _m1);
      if (st >= 0 && tau < T0[st] + DT) { var tr = (e.tr || (e.tr = [[], [], []]))[st]; if (tr.length < 90) tr.push({ x: _m1.x, y: _m1.y, z: _m1.z + 0.5 }); }
      Gs.trazos.forEach(function (b, j2) {
        var tr = e.tr && e.tr[j2]; if (!tr || tr.length < 2) { b.hide(); return; }
        var pts = [], n2 = 30, q;
        for (q = 0; q < n2; q++) { var ii = Math.min(tr.length - 1, Math.round(q / (n2 - 1) * (tr.length - 1))); pts.push(tr[ii]); }
        b.color = c; b.set(pts, 0.12, 0.95 * fade, 1); if (j2 === st || head === null) head = tr[tr.length - 1];
      });
      if (head && fade > 0.01) { Gs.pluma.visible = true; Gs.pluma.position.set(head.x, head.y, head.z + 0.3); Gs.pluma.material.opacity = 0.95 * fade; Gs.pluma.scale.set(1.5, 1.5, 1); } else Gs.pluma.visible = false;
      if (st >= 0 && tau < T0[st] + DT + 0.05 && Math.random() < 0.8) emitir(_m1.x, _m1.y, _m1.z + 0.5, rnd(-0.6, 0.6), rnd(-0.3, 0.9), 0.1, c, rnd(0.15, 0.3), 0.7, -0.5, 0.6);
    } else if (key === 'meditar') {
      var lv = envol(tau, 0.12, 0.50, 0.88, 1.12);
      capa(function (P) {
        mezT(P, PO.loto, w); P.lift += 0.35 * lv * mov;
        var wh = w * sstep(0.25, 0.55, tau);
        if (wh > 0) { ['D', 'I'].forEach(function (l) { pw(S.rig.n['rodilla' + l], 0, 0.0, 0.05, _m1); ikMundo(P, l, _m1.x, _m1.y + 0.12, _m1.z, wh, [0.6, -1, -0.2]); }); }
      });
      m.aura += 0.4 * lv; m.expande += 0.3 * lv * mov; m.pelo += 0.9 * lv;
      Gs.meditar.visible = lv > 0.01; Gs.meditar.position.set(0, ch.y - 0.2, -1.4); Gs.meditar.material.opacity = 0.5 * lv; Gs.meditar.scale.set(10 + 2 * lv, 8 + lv, 1);
      [0.40, 0.68, 0.96].forEach(function (tp, ix) { if (tau >= tp && !e['p' + ix]) { e['p' + ix] = 1; onda(c, 14 + ix * 2, 1.05, 0, 0.9); if (ix < 2) onda(mezclaC(c, CBLANCO, 0.4), 6 + ix * 2, 0.8, 0, 0.7, true); } });
    } else if (key === 'ayuno') {
      var op2 = envol(tau, 0.10, 0.35, 1.7, 2.05), ten = eIO(rampa(0.25, 0.8, tau)), rotos = tau >= 0.88;
      capa(function (P) {
        var wl = w * (rotos ? 0 : 1), jt = Math.sin(tau * 55) * 0.007 * ten, abre2 = sstep(0.88, 0.98, tau) * (1 - sstep(1.0, 1.25, tau));
        mez(P.torso, [-0.22 * ten + 0.1 * abre2, 0, 0], w); mez(P.cabeza, [0.12 * ten, 0, 0], w); mez(P.pecho, [-0.06 * ten, 0, 0], w);
        ikBrazo(P, 'D', 0.035 + jt, -0.02 - jt, 0.29, wl); ikBrazo(P, 'I', 0.035 - jt, -0.02 + jt, 0.29, wl);
        mezT(P, PO.abierta, w * abre2);
      });
      manoW('D', _m1); manoW('I', _m2);
      var ws = [_m2, _m1];
      if (rotos && !e.rompe) {
        e.rompe = true; onda(c, 9, 0.8, 0, 1, true); onda(c, 12, 1.0, 0.05, 0.8);
        ws.forEach(function (wp, side) { rafaga(wp.x, wp.y, wp.z, 50, 2.5, 8, c, 0.4, 1.0, -2, 0.7); Gs.cad[side].forEach(function (l) { l.vx = rnd(-3, 3) + (side ? 3 : -3); l.vy = rnd(0.5, 4); }); });
        m.flashA += 0.25;
      }
      Gs.punos.forEach(function (p, side) { p.visible = op2 > 0.01; p.position.set(ws[side].x, ws[side].y, ws[side].z + 0.5); p.material.opacity = (0.55 + 0.35 * Math.sin(tau * 14)) * op2 * (rotos ? 0.4 : 1); var ps = 1.6 + 0.8 * ten; p.scale.set(ps, ps, 1); });
      Gs.cad.forEach(function (cad, side) {
        var sg = side ? 1 : -1, wp = ws[side], ax = sg * 7.3, ay = 1.6, tens = ten, n = cad.length;
        cad.forEach(function (l, q) {
          var sp = l.s, sq = (q + 0.5) / n;
          if (!rotos) {
            var sag = (1 - tens) * 1.7 * Math.sin(Math.PI * sq) + Math.sin(tau * 40 + q) * 0.03 * tens;
            l.x = lerp(wp.x, ax, sq); l.y = lerp(wp.y, ay, sq) - sag + (tens > 0.8 ? Math.sin(tau * 60 + q) * 0.05 : 0); l.z = wp.z + 0.5;
            sp.material.rotation = Math.atan2(ay - wp.y, ax - wp.x) + (q % 2 ? 1.3 : 0);
          } else { l.x += l.vx * dt; l.y += l.vy * dt; l.vy -= 7 * dt; sp.material.rotation += dt * 6 * (q % 2 ? 1 : -1); }
          sp.visible = op2 > 0.01 || rotos; sp.position.set(l.x, l.y, l.z);
          sp.material.opacity = rotos ? clamp(1 - (tau - 0.88) / 0.7, 0, 1) : op2 * 0.95;
          sp.scale.set(0.62, 0.36, 1);
        });
      });
    } else if (key === 'dormir') {
      var up = envol(tau, 0.05, 0.45, 0.85, 1.12), op3 = envol(tau, 0.2, 0.7, 1.7, 2.05), lu = eOut(rampa(0.3, 1.4, tau));
      var cer = envol(tau, 0.47, 0.55, 1.05, 1.13);
      capa(function (P) {
        var wu = w * up;
        mez(P.brazoD, [-0.10, 0, 2.95], wu); mez(P.brazoI, [-0.10, 0, 2.95], wu); mez(P.codoD, [-0.25, 0, 0.1], wu); mez(P.codoI, [-0.25, 0, 0.1], wu);
        mez(P.torso, [-0.16, 0, 0], wu); mez(P.pecho, [-0.12, 0, 0], wu); mez(P.pieD, [0.85, 0, 0], wu); mez(P.pieI, [0.85, 0, 0], wu);
        mez(P.cabeza, [-0.22, 0, 0.32], w * sstep(0.3, 0.7, tau) * (1 - sstep(0.95, 1.2, tau))); P.lift += 0.05 * up * mov;
      });
      m.parp += cer; m.ojoBoost += 0.9 * envol(tau, 1.08, 1.14, 1.2, 1.7); m.flashA += 0.14 * envol(tau, 1.08, 1.12, 1.14, 1.3);
      Gs.luna.visible = op3 > 0.01; Gs.luna.position.set(lerp(2.6, 3.0, lu), lerp(ch.y - 1.5, ch.y + 3.2, lu), -1.6); Gs.luna.material.opacity = 0.95 * op3; Gs.luna.scale.set(5.4, 5.4, 1); Gs.luna.material.rotation = -0.5;
      Gs.lunaGlow.visible = op3 > 0.01; Gs.lunaGlow.position.set(Gs.luna.position.x - 0.4, Gs.luna.position.y, -1.8); Gs.lunaGlow.material.opacity = 0.55 * op3; Gs.lunaGlow.scale.set(11, 11, 1);
      m.brillo -= 0.08 * envol(tau, 0.3, 0.8, 1.3, 1.9); m.aura += 0.25 * op3;
      if (tau > 0.55 && tau < 1.45) {   // exhala: partículas azules que caen desde la boca
        pw(s.rig.n.cabeza, 0, 0.055, 0.115, _m1);
        var nn = (s.reducido ? 1 : 4) * s.cal | 0; for (i = 0; i < nn; i++) emitir(_m1.x + rnd(-0.1, 0.1), _m1.y, _m1.z + 0.2, rnd(-0.5, 0.5), rnd(-1.2, -0.3), rnd(0.2, 1.2), mezclaC(c, CBLANCO, rnd(0, 0.6)), rnd(0.2, 0.4), rnd(1.2, 2), -0.5, 0.6);
      }
    }
  }

  // ---------------------------------------------------------------- sobrecarga (día perfecto): grito mudo, se eleva girando 360°, aura dorada, aterriza suave
  function sobrecarga() {
    if (!S) return Promise.resolve();
    return new Promise(function (res) { var J = nuevoJob('sobre', DUR.sobre, tickSobre, finSobre); J.res.push(res); });
  }
  function tickSobre(J, tau, dt) {
    var s = S, m = s.m, e = J.e, ch = pecho(), i, x, c = COROC, mov = s.reducido ? 0 : 1;
    var wC = sstep(0.10, 0.55, tau) * (1 - sstep(0.88, 0.99, tau)), wB = sstep(0.92, 1.12, tau) * (1 - sstep(2.95, 3.3, tau));
    var lift = 0.6 * envol(tau, 0.95, 1.75, 2.55, 3.25), spin = 6.283185307 * eIO(rampa(1.2, 2.95, tau));
    capa(function (P) {
      P.ground += wC * mov; mezT(P, PO.agacha, wC * mov); mezT(P, PO.grito, wB * mov); P.lift += lift * mov; P.spin += spin * mov;
      P.puD *= 1 + 0.18 * (wC + wB) * mov; P.puI *= 1 + 0.18 * (wC + wB) * mov; P.mandibula[0] += 0.38 * wB * mov;
    });
    m.ceno += 0.6 * (wC + wB); m.irisW += envol(tau, 0.95, 1.15, 2.6, 3.2);
    if (tau < 0.95) {
      x = tau / 0.95; var cx = x * x;
      m.brillo -= 0.2 * cx; m.aura += 0.5 * cx; m.golpe -= 0.4 * cx * mov; m.shake += 0.25 * cx; m.ojoBoost += 0.5 * cx; m.expande -= 0.1 * cx; m.pelo += 0.5 * cx;
      var n = (s.reducido ? 5 : 11) * s.cal | 0;
      for (i = 0; i < n; i++) { var a = Math.random() * 6.283, r = rnd(5, 10), ix = emitir(ch.x + Math.cos(a) * r, ch.y + Math.sin(a) * r * 0.9, ch.z + rnd(-1, 1), 0, 0, 0, Math.random() < 0.5 ? c : CBLANCO, rnd(0.25, 0.5), 0.85, 0, 0.4); if (ix != null) atraer(ix, ch.x, ch.y, ch.z + 0.3, 8); }
      s.gest.orbe.visible = true; s.gest.orbe.position.set(ch.x, ch.y, ch.z + 0.5); setC(s.gest.orbe, [1, 0.95, 0.75]); s.gest.orbe.material.opacity = cx; var os = 1 + 4.5 * cx; s.gest.orbe.scale.set(os, os, 1);
    }
    if (tau >= 0.95 && !e.est) {
      e.est = true; s.gest.orbe.visible = false;
      rafaga(ch.x, ch.y, ch.z, s.reducido ? 60 : 240, 5, 13, c, 0.5, 1.5, -0.8, 0.8);
      onda(c, 18, 1.4, 0, 1); onda([1, 1, 1], 26, 1.7, 0.28, 0.8); onda(c, 10, 0.9, 0.05, 1, true); onda([1, 1, 1], 15, 1.1, 0.35, 0.8, true);
      s.ojos.forEach(function (o) { o.rayo = 1; });
      ORDEN.forEach(function (key, k) { s.hold[k] = 1; E.habitos[key] = true; });
      for (i = 0; i < 5; i++) { brilloBandas(i, 1.8, 0); }
    }
    if (tau >= 0.95) {
      var d = tau - 0.95;
      m.golpe += mov * (Math.sin(Math.PI * clamp(d / 0.55, 0, 1)) + 0.6 * Math.sin(Math.PI * clamp((d - 0.7) / 0.5, 0, 1)));
      m.alas += 1.0 * Math.exp(-d / 1.6); m.aura += 1.0 * Math.exp(-d / 1.8); m.blanco += Math.exp(-d / 1.6); m.expande += 1.0 * Math.exp(-d / 1.5);
      m.shake += 0.9 * Math.exp(-d / 0.9); m.ojoBoost += 1.2 * Math.exp(-d / 1.2); m.rim += 1.2 * Math.exp(-d / 1.2); m.velo += 1; m.brillo += 0.45 * Math.exp(-d / 0.5);
      m.flashA += 0.8 * Math.exp(-d / 0.22); m.flashC = [1, 0.96, 0.8];
      m.pelo += 1.4 * Math.exp(-d / 1.8); m.peloC = COROC;
      m.aleteo += 1.0 * Math.sin(Math.PI * clamp(d / 0.7, 0, 1)) + 1.0 * Math.sin(Math.PI * clamp((d - 0.85) / 0.7, 0, 1)) + 0.6 * Math.sin(Math.PI * clamp((d - 1.7) / 0.6, 0, 1));
      if (tau < 2.45) {
        s.ojos.forEach(function (o) { o.rayo = Math.max(0.5, o.rayo - dt * 0.4); if (Math.random() < 0.03) o.rayo = 1; });
        var pr = rampa(0.95, 1.8, tau); for (i = 0; i < NBAN; i++) s.B[i].prog = pr >= 1 ? -1 : pr;
        for (i = 0; i < 5; i++) brilloBandas(i, 1.5 - 0.6 * rampa(1.0, 2.45, tau));
      } else { s.ojos.forEach(function (o) { o.rayo = Math.max(0, o.rayo - dt * 2); }); for (i = 0; i < NBAN; i++) s.B[i].prog = -1; }
      if (tau < 2.7) {   // lluvia de chispas doradas
        var nl = (s.reducido ? 3 : 9) * s.cal | 0;
        for (i = 0; i < nl; i++) emitir(rnd(-8, 8), rnd(10, 13), rnd(-1.5, 1), rnd(-0.4, 0.4), -rnd(2, 5), 0, Math.random() < 0.6 ? c : CBLANCO, rnd(0.18, 0.42), rnd(1.4, 2.4), -1.5, 0.2);
      }
    }
  }
  function finSobre(J) {
    perfPost = true; E.perfecto = true; ORDEN.forEach(function (k) { E.habitos[k] = true; });
    for (var i = 0; i < NBAN; i++) S.B[i].prog = -1;
    S.ojos.forEach(function (o) { o.rayo = 0; });
  }

  // ---------------------------------------------------------------- entrega: una caja de luz entra desde el fondo, la mano derecha la atrapa, la aprieta y se funde en el pecho
  function entrega() {
    if (!S) return Promise.resolve();
    return new Promise(function (res) { var J = nuevoJob('entrega', DUR.entrega, tickEntrega, finEntrega, { x0: rnd(2.5, 4.5) * (Math.random() < 0.5 ? -1 : 1) }); J.res.push(res); });
  }
  function tickEntrega(J, tau, dt) {
    var s = S, m = s.m, Gs = s.gest, ch = pecho(), e = J.e, mov = s.reducido ? 0 : 1, p = rampa(0, 0.58, tau), q = eIO(p);
    var env = envol(tau, 0, 0.22, 0.86, 1.05), pre = sstep(0, 0.3, tau), cerca = sstep(0.58, 0.86, tau);
    capa(function (P) {
      var w = env * mov, gx = lerp(0.40, 0.04, cerca), gy = lerp(0.14, 0.10, cerca), gz = lerp(0.42, 0.20, cerca);
      mez(P.torso, [0.12, -0.12, 0], w); mez(P.cabeza, [0.02, -0.15 * (J.x0 < 0 ? -1 : 1) * 0 + 0.2 * (J.x0 > 0 ? 1 : -1), 0], w); mez(P.brazoI, [0, 0, 0.5], w * 0.6);
      ikBrazo(P, 'D', gx, gy, gz, w * pre);
      var sq = envol(tau, 0.56, 0.62, 0.78, 0.9); P.puD *= 1 + 0.25 * sq * mov;
    });
    var tgt = { x: 0, y: 0, z: 0 }; pw(s.rig.n.pecho, 0.40, 0.14, 0.42, tgt); if (s.reducido) { tgt.x = ch.x; tgt.y = ch.y; tgt.z = ch.z + 1; }
    var x = lerp(J.x0, tgt.x, q), y = lerp(5.0, tgt.y, q) + Math.sin(p * Math.PI) * 1.4, z = lerp(-9, tgt.z, q);
    if (tau >= 0.58) { manoW('D', _m1); var pc = rampa(0.58, 0.86, tau); x = lerp(_m1.x, ch.x, pc); y = lerp(_m1.y, ch.y, pc); z = lerp(_m1.z + 0.3, ch.z + 0.3, pc); }
    var vis = tau < 0.86 ? 1 : 0, sc = tau < 0.58 ? lerp(1.8, 0.55, q) : lerp(0.55, 0.1, rampa(0.58, 0.86, tau));
    Gs.caja.visible = vis > 0; Gs.caja.position.set(x, y, z); Gs.caja.scale.set(sc * 1.6, sc * 1.6, 1); Gs.caja.material.rotation = p * 3.2; Gs.caja.material.opacity = 0.95;
    Gs.cajaGlow.visible = vis > 0; Gs.cajaGlow.position.set(x, y, z - 0.1); Gs.cajaGlow.scale.set(sc * 4, sc * 4, 1); Gs.cajaGlow.material.opacity = 0.6;
    if (vis) emitir(x + rnd(-0.2, 0.2), y + rnd(-0.2, 0.2), z, rnd(-0.3, 0.3), rnd(-0.2, 0.5), 0, COROC, rnd(0.15, 0.3), 0.6, 0, 1);
    if (tau >= 0.58 && !e.cogida) { e.cogida = true; rafaga(x, y, z, 24, 1.5, 4, COROC, 0.3, 0.6, -0.3, 0.9); m.flashA += 0.08; }
    if (tau >= 0.86 && !e.fin) {
      e.fin = true; rafaga(ch.x, ch.y, ch.z, 50, 2, 6, COROC, 0.35, 0.9, -0.3, 0.9); onda(COROC, 9, 0.8, 0, 0.9, true); onda(COROC, 9, 0.9, 0.05, 0.6);
    }
    if (tau >= 0.86) { var d = tau - 0.86; m.golpe += mov * 0.5 * Math.sin(Math.PI * clamp(d / 0.3, 0, 1)); m.aura += 0.6 * Math.exp(-d / 0.3); m.expande += 0.25 * Math.exp(-d / 0.3); m.flashA += 0.12 * Math.exp(-d / 0.12); m.flashC = COROC; m.rim += 0.5 * Math.exp(-d / 0.3); }
  }
  function finEntrega() { S.gest.caja.visible = false; S.gest.cajaGlow.visible = false; }

  // ---------------------------------------------------------------- apertura: negro → ojos → cae desde arriba y aterriza en cuclillas → se incorpora → alas de golpe → plumas → brazos abiertos y aura
  var T_CAE = 2.0, T_IMP = 2.55;
  function apertura(opts) {
    opts = opts || {};
    var hit = function (n) { try { if (opts.onHito) opts.onHito(n); } catch (e) {} };
    if (!S || S.reducido) {   // sin escena o en reducido: hitos seguidos, sin cinemática
      return new Promise(function (res) {
        var nom = ['ojos', 'alas', 'plumas', 'aura'], k = 0;
        (function sig() { if (k < nom.length) { hit(nom[k++]); setTimeout(sig, 0); } else { if (S) snap(); res(); } })();
      });
    }
    if (S.A) cerrarApertura(true);
    return new Promise(function (res) {
      var A = { opts: opts, res: [res], t: 0, h: {}, ev: {}, hit: hit, n: 0 };
      S.A = A; S.hold = [0, 0, 0, 0, 0];
      A.timer = setTimeout(function () { if (S && S.A === A) cerrarApertura(true); }, 6950);   // tope duro desde la llamada
    });
  }
  function hitoAp(n) { var A = S.A; if (!A || A.h[n]) return; A.h[n] = true; A.hit(n); }
  function cerrarApertura(forzado) {
    var A = S && S.A; if (!A) return;
    ['ojos', 'alas', 'plumas', 'aura'].forEach(hitoAp);
    clearTimeout(A.timer); S.A = null; S.apCam = null;
    snap(); S.V.auraK = 1; S.V.ojos = [1, 1];
    A.res.forEach(function (r) { r(); });
  }
  function saltar() { if (S && S.A) cerrarApertura(true); }
  function tickApertura(dt) {
    var s = S, A = s.A, m = s.m, ap, t, ch = pecho();
    ap = s.ap = { oculto: false, auraK: 0, bandas: [0, 0, 0, 0, 0], velo: 0, ojos: [0, 0], luz: 1, sinRefl: true };
    A.t += dt; t = A.t;
    ap.ojos = [sstep(0.7, 1.25, t), sstep(1.45, 1.95, t)];
    ap.luz = t < T_CAE - 0.05 ? 0.06 : lerp(0.06, 1, sstep(T_CAE - 0.05, T_CAE + 0.12, t));
    ap.luzK = sstep(0.6, 1.9, t) * (1 - sstep(T_CAE, T_CAE + 1.8, t)); ap.hc = A.hc; ap.sinRefl = t < T_CAE;   // primer plano a oscuras; la luz vuelve al caer
    m.ceno += sstep(1.7, 2.15, t) * (1 - sstep(3.4, 4.2, t));
    if (t >= 1.95) hitoAp('ojos');
    m.ojoBoost += 0.55 * (envol(t, 0.7, 1.0, 1.3, 1.9) + envol(t, 1.45, 1.75, 2.0, 2.6));
    m.parp += 0.8 * envol(t, T_CAE - 0.12, T_CAE - 0.05, T_CAE + 0.05, T_CAE + 0.12);   // parpadeo al empezar la caída
    var cae = t >= T_CAE && t < T_IMP, u = rampa(T_CAE, T_IMP, t);
    var wF = sstep(T_CAE - 0.04, T_CAE, t) * (1 - sstep(T_IMP - 0.07, T_IMP, t));
    var wK = t < T_CAE ? 1 : (t < T_IMP ? 0 : 1 - eIO(rampa(3.3, 4.4, t)));            // cuclillas
    var wPuno = t >= T_IMP ? (1 - eIO(rampa(3.2, 3.9, t))) : 0;
    var lift = cae ? 3.4 * (1 - u * u) : 0, abre = t < 4.55 ? 0 : eBack(rampa(4.55, 5.3, t));
    var mira = envol(t, 3.7, 4.2, 4.8, 5.3), brz = envol(t, 5.25, 5.7, 6.1, 6.55);
    capa(function (P) {
      mezT(P, PO.impacto, wK); mezT(P, PO.caida, wF); P.ground += wK; P.lift += lift; P.abre = abre;
      if (wPuno > 0) ikMundo(P, 'D', 1.15, 0.14, 1.2, wPuno * wK, [0.4, -0.3, -1]);
      mez(P.cabeza, [-0.38, 0, 0], mira); mez(P.cuello, [-0.15, 0, 0], mira);
      mezT(P, PO.abierta, brz);
      P.fw += 0.0;
    });
    // el cuerpo cae: viento y estela
    if (cae) { m.flashA += 0.1 * u; if (Math.random() < 0.8) emitir(rnd(-2, 2), ch.y + 1 + rnd(0, 3), rnd(-1, 1), 0, 8 + rnd(0, 6), 0, [0.8, 0.85, 1], rnd(0.15, 0.3), 0.35, 0, 0); }
    if (t >= T_IMP && !A.ev.imp) {
      A.ev.imp = 1;
      onda([1, 0.95, 0.8], 16, 1.3, 0, 1); onda(RANGOC[E.rangoIdx], 11, 1.0, 0.08, 0.8);
      for (var di = 0; di < (s.reducido ? 20 : 70); di++) { var an = Math.random() * 6.283, vv = rnd(2, 6); emitir(Math.cos(an) * 1.0, 0.15, Math.sin(an) * 1.0, Math.cos(an) * vv, rnd(0.3, 1.2), Math.sin(an) * vv, [0.62, 0.62, 0.7], rnd(0.3, 0.6), rnd(0.9, 1.6), -0.6, 1.2); }
    }
    if (t >= T_IMP) { var di2 = t - T_IMP; m.shake += 1.0 * Math.exp(-di2 / 0.55); m.flashA += 0.3 * Math.exp(-di2 / 0.12); m.flashC = [1, 0.95, 0.85]; m.golpe += Math.sin(Math.PI * clamp(di2 / 0.3, 0, 1)); m.brillo += 0.25 * Math.exp(-di2 / 0.3); }
    // cámara: primer plano de la cara en la oscuridad (contrapicado), luego se aleja mientras el personaje cae y aterriza
    if (t < T_CAE) { var hh = pw(s.rig.n.cabeza, 0, Y_OJO, 0.08, A.hc || (A.hc = { x: 0, y: 0, z: 0 })); }
    if (t < 4.0) s.apCam = { hc: A.hc, e: eIO(rampa(T_CAE, 4.0, t)) }; else s.apCam = null;
    // alas de golpe
    if (t >= 4.55 && !A.ev.alas) {
      A.ev.alas = 1; var cc = [1, 0.95, 0.8];
      onda(cc, 20, 1.4, 0, 1); onda(RANGOC[E.rangoIdx], 14, 1.1, 0.12, 0.9); onda(cc, 12, 1.0, 0.05, 1, true);
      rafaga(ch.x, ch.y, ch.z, 160, 5, 13, cc, 0.5, 1.4, -0.5, 0.8);
      s.ojos.forEach(function (o) { o.rayo = 1; });
    }
    if (t >= 4.55) {
      var d = t - 4.55;
      m.alas += 0.9 * Math.exp(-d / 0.9); m.golpe += Math.sin(Math.PI * clamp(d / 0.5, 0, 1)); m.flashA += 0.5 * Math.exp(-d / 0.2); m.flashC = [1, 0.97, 0.85];
      m.brillo += 0.4 * Math.exp(-d / 0.4); m.ojoBoost += Math.exp(-d / 0.8); m.shake += 0.35 * Math.exp(-d / 0.5);
      m.pelo += 1.1 * Math.exp(-d / 1.3); m.aleteo += 0.9 * Math.sin(Math.PI * clamp((d - 0.35) / 0.9, 0, 1));
      s.ojos.forEach(function (o) { o.rayo = Math.max(0, o.rayo - dt * 2.2); });
    }
    if (t >= 4.65) hitoAp('alas');
    if (t < 4.55) m.alas -= 0.25;
    if (t >= 5.15) {   // plumas de hoy, una por una (120 ms)
      if (!A.orden) { A.orden = []; ORDEN.forEach(function (k, ix) { if (E.habitos[k]) A.orden.push(ix); }); }
      hitoAp('plumas');
      A.orden.forEach(function (k, ord) {
        var tk = 5.15 + ord * 0.12;
        if (t >= tk) { ap.bandas[k] = 1; if (!A['b' + k]) { A['b' + k] = 1; brilloBandas(k, 1.5, 0); } var pr = rampa(tk, tk + 0.45, t); s.B[k].prog = pr >= 1 ? -1 : pr; s.B[k + 5].prog = pr >= 1 ? -1 : pr; }
      });
    }
    var nOn = 0, perf = (E.perfecto || perfPost) ? 1 : 0; ORDEN.forEach(function (k) { if (E.habitos[k]) nOn++; });
    ap.velo = sstep(5.1, 5.9, t) * Math.min(1, nOn / 5 + perf * 0.3);
    ap.auraK = sstep(5.8, 6.5, t);
    if (t >= 5.8 && !A.ev.aura) { A.ev.aura = 1; onda(RANGOC[E.rangoIdx], 15, 1.0, 0, 0.8); }
    if (t >= 5.85) hitoAp('aura');
    if (t >= 5.8) { m.flashA += 0.15 * Math.exp(-(t - 5.8) / 0.25); m.flashC = RANGOC[E.rangoIdx]; }
    if (t >= DUR.apertura) cerrarApertura(false);
  }


  // ---------------------------------------------------------------- director de reposo: acciones aleatorias mientras está quieto (más y más fuertes si está empoderado)
  var NOMBRES = ['pensar', 'cafe', 'estirar', 'brazos', 'puno', 'atras', 'capa', 'boxeo', 'punos', 'cargar', 'suelo', 'loto', 'alas', 'giro', 'patada'];
  var DURA = { pensar: 3.2, cafe: 4.6, estirar: 3.4, brazos: 3.2, puno: 2.6, atras: 2.6, capa: 2.8, boxeo: 3.0, punos: 3.3, cargar: 3.0, suelo: 2.8, loto: 3.0, alas: 3.0, giro: 2.4, patada: 2.6 };
  var PESOS = {
    base: { pensar: 1, cafe: 1, estirar: 1, brazos: 0.8, puno: 0.8, atras: 0.8, capa: 0.8, boxeo: 1 },
    emp: { pensar: 0.6, cafe: 0.6, estirar: 0.6, brazos: 0.5, puno: 0.5, atras: 0.5, capa: 0.5, boxeo: 2.2, punos: 2, cargar: 1.2, suelo: 1.2, loto: 1, alas: 1.2, giro: 1, patada: 1.2 }
  };
  var _a = { x: 0, y: 0, z: 0 }, _b2 = { x: 0, y: 0, z: 0 }, _c = { x: 0, y: 0, z: 0 }, _d = { x: 0, y: 0, z: 0 };
  function cab(x, y, z, o) { return pw(S.rig.n.cabeza, x, y, z, o); }
  function pec(x, y, z, o) { return pw(S.rig.n.pecho, x, y, z, o); }
  function esEmpoderado() {
    if (S.dir.emp != null) return S.dir.emp;
    var n = 0; ORDEN.forEach(function (k) { if (E.habitos[k]) n++; });
    return E.rangoIdx >= 5 || E.perfecto || perfPost || n >= 3;
  }
  function empoderado(v) { if (S) S.dir.emp = v == null ? null : !!v; }
  // el PUÑO (no la muñeca) llega al punto del mundo: se descuenta lo que el puño sobresale de la muñeca a lo largo del antebrazo
  function ikPuno(P, lado, wx, wy, wz, w, hint) {
    if (w <= 0) return;
    var n = S.rig.n, c = pw(n['codo' + lado], 0, 0, 0, _c), m = pw(n['mano' + lado], 0, 0, 0, _d), dx = m.x - c.x, dy = m.y - c.y, dz = m.z - c.z, l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1, off = 0.056 * SC;
    ikMundo(P, lado, wx - dx / l * off, wy - dy / l * off, wz - dz / l * off, w, hint);
  }
  function puno(lado, o) { return pw(S.rig.n['mano' + lado], 0, -0.056, 0.008, o); }
  function subset(T, re) { var o = {}, k; for (k in T) if (re.test(k)) o[k] = T[k]; return o; }
  var PO_PIERNAS = null;
  function chispa(x, y, z, c, tam, vida, vy) { emitir(x, y, z, rnd(-0.15, 0.15), vy == null ? 0.5 : vy, rnd(-0.1, 0.1), c, tam, vida, 0, 0.3); }
  function anillo2(pos, R) { var c = mezclaC(RANGOC[E.rangoIdx], CBLANCO, 0.3); onda(c, R, 0.5, 0, 0.9, true, { x: pos.x, y: pos.y, z: pos.z + 0.3 }); rafaga(pos.x, pos.y, pos.z, 12, 1.5, 5, c, 0.3, 0.6, -0.4, 0.9); }

  var ACC = {};
  function def(n, pose, fx) { ACC[n] = { n: n, pose: pose, fx: fx || function () {} }; }

  // ---- pensar: mano derecha a la barbilla, el codo apoyado en el otro brazo, cabeza inclinada 10°, mirada arriba-lateral, dos chispas
  def('pensar', function (P, w, tau) {
    var h = w * sstep(0.15, 0.7, tau) * (1 - sstep(2.6, 3.1, tau));
    mez(P.torso, [0.05, 0, 0.03], h); mez(P.cabeza, [0.06, 0, 0.17], h); mez(P.cuello, [0, 0, 0.04], h);
    cab(0.032, 0.014, 0.118, _a); ikPuno(P, 'D', _a.x, _a.y, _a.z, h, [0.5, -1, -0.15]);
    ikBrazo(P, 'I', -0.17, 0.05, 0.30, h, [0.4, -1, -0.4]);
  }, function (A, tau, dt, w) {
    var h = sstep(0.4, 0.9, tau) * (1 - sstep(2.6, 3.1, tau)); S.m.mx += -0.012 * h; S.m.my += 0.004 * h;
    [1.0, 1.7].forEach(function (t0, i) { if (tau >= t0 && !A.d['c' + i]) { A.d['c' + i] = 1; cab(i ? 0.05 : -0.05, 0.32, 0.02, _b2); chispa(_b2.x, _b2.y, _b2.z, [0.85, 0.9, 1], 0.35, 1.4, 0.5); chispa(_b2.x + 0.1, _b2.y + 0.1, _b2.z, [0.85, 0.9, 1], 0.25, 1.2, 0.4); } });
  });

  // ---- tomar café: taza oscura con borde dorado (0→1) en la mano izquierda, a la boca, vapor, exhala, se desvanece
  function posTaza(tau, o) {
    var q = eIO(rampa(0.7, 1.6, tau)) * (1 - eIO(rampa(2.8, 3.6, tau)));
    pec(-0.17, 0.06, 0.33, _a); cab(0.0, -0.062, 0.14, _b2);   // posición del PUÑO; la taza va 0.075 por encima, con el borde a la altura de la boca
    o.x = lerp(_a.x, _b2.x, q); o.y = lerp(_a.y, _b2.y, q); o.z = lerp(_a.z, _b2.z, q); return q;
  }
  def('cafe', function (P, w, tau) {
    var h = w * sstep(0.05, 0.5, tau) * (1 - sstep(3.7, 4.3, tau)), sip = envol(tau, 1.4, 1.8, 2.6, 3.0);
    posTaza(tau, _c); ikPuno(P, 'I', _c.x, _c.y, _c.z, h, [0.5, -1, -0.3]);
    mez(P.cabeza, [-0.13, 0, 0], w * sip); mez(P.torso, [-0.04, 0, 0], w * sip);
  }, function (A, tau, dt, w) {
    var T = S.taza, esc = eOut(rampa(0.1, 0.7, tau)) * (1 - sstep(3.9, 4.5, tau)), q = posTaza(tau, _a), sip = envol(tau, 1.4, 1.8, 2.6, 3.0);
    T.visible = esc > 0.01; T.position.set(_a.x, _a.y + 0.075 * SC * esc, _a.z); T.scale.set(SC * esc, SC * esc, SC * esc); T.rotation.x = 0.35 * sip;
    if (esc > 0.5 && tau < 3.7 && Math.random() < 0.55) chispa(_a.x + rnd(-0.1, 0.1), _a.y + 0.075 * SC * esc + 0.2 * esc, _a.z, [0.92, 0.94, 1], rnd(0.2, 0.35), 1.3, 0.9);
    if (tau > 3.4 && tau < 3.85) { cab(0, 0.05, 0.12, _b2); emitir(_b2.x, _b2.y, _b2.z, 0, 0.1, 1.2, [0.92, 0.94, 1], rnd(0.25, 0.4), 0.9, 0, 0.8); }
  });

  // ---- estirar: cuello a un lado y a otro, hombros arriba, rotación de brazos
  def('estirar', function (P, w, tau) {
    mez(P.cabeza, [0, 0, -0.36], w * envol(tau, 0.3, 0.6, 0.9, 1.1)); mez(P.cabeza, [0, 0, 0.36], w * envol(tau, 1.1, 1.4, 1.7, 1.9));
    P.shrug += 0.05 * envol(tau, 1.9, 2.2, 2.6, 2.9);
    var ar = envol(tau, 1.9, 2.15, 2.85, 3.05), ph = rampa(2.0, 2.95, tau) * 6.283;
    if (ar > 0) { P.brazoD[0] += -ph * (tau < 3.0 ? 1 : 0); P.brazoI[0] += -ph * (tau < 3.0 ? 1 : 0); mez(P.brazoD, [null, null, 0.45], ar * 0.5); mez(P.brazoI, [null, null, 0.45], ar * 0.5); }
    mez(P.torso, [-0.08, 0, 0], w * envol(tau, 1.9, 2.3, 2.7, 3.0));
  });

  // ---- cruzar brazos y asentir dos veces
  def('brazos', function (P, w, tau) {
    var h = w * sstep(0.2, 0.7, tau) * (1 - sstep(2.6, 3.1, tau)), nod = envol(tau, 0.9, 1.15, 1.3, 1.5) + envol(tau, 1.6, 1.85, 2.0, 2.2);
    ikBrazo(P, 'D', -0.14, 0.10, 0.27, h, [0.2, -1, -0.4]); ikBrazo(P, 'I', -0.14, 0.04, 0.30, h, [0.2, -1, -0.4]);
    mez(P.cabeza, [0.24, 0, 0], w * nod); mez(P.torso, [0.04, 0, 0], h);
  });

  // ---- mirar el puño derecho, abrirlo y apretarlo con un destello
  def('puno', function (P, w, tau) {
    var h = w * sstep(0.2, 0.7, tau) * (1 - sstep(2.1, 2.5, tau));
    cab(0.05, 0.09, 0.36, _a); ikPuno(P, 'D', _a.x, _a.y, _a.z, h, [0.5, -1, -0.2]);
    mez(P.cabeza, [0.16, -0.12, 0], h); P.puD *= 1 + 0.35 * envol(tau, 1.0, 1.2, 1.4, 1.55) - 0.15 * envol(tau, 1.6, 1.7, 1.8, 1.95);
  }, function (A, tau, dt, w) {
    var h = sstep(0.3, 0.8, tau) * (1 - sstep(2.1, 2.5, tau)); S.m.my += -0.005 * h; S.m.mx += 0.006 * h;
    if (tau >= 1.7 && !A.d.f) { A.d.f = 1; puno('D', _b2); rafaga(_b2.x, _b2.y, _b2.z + 0.3, 22, 1.5, 5, [1, 0.9, 0.6], 0.3, 0.7, -0.3, 0.9); S.m.flashA += 0.1; onda([1, 0.85, 0.5], 3, 0.5, 0, 0.8, true, { x: _b2.x, y: _b2.y, z: _b2.z + 0.3 }); }
  });

  // ---- mirar atrás por encima del hombro y volver
  def('atras', function (P, w, tau) {
    var h = w * envol(tau, 0.3, 0.95, 1.5, 2.2);
    mez(P.pecho, [0, 0.55, 0], h); mez(P.cuello, [0, 0.4, 0], h); mez(P.cabeza, [-0.04, 0.6, 0], h);
  }, function (A, tau) { S.m.mx += 0.01 * envol(tau, 0.3, 0.95, 1.5, 2.2); });

  // ---- ajustarse la capa con las dos manos (dos tirones)
  def('capa', function (P, w, tau) {
    var h = w * sstep(0.25, 0.75, tau) * (1 - sstep(2.3, 2.7, tau)), tp = envol(tau, 0.95, 1.15, 1.3, 1.5) + envol(tau, 1.6, 1.8, 1.95, 2.15);
    ikBrazo(P, 'D', 0.10 + 0.06 * tp, 0.37 - 0.14 * tp, 0.12 + 0.02 * tp, h, [0.6, -1, -0.5]); ikBrazo(P, 'I', 0.10 + 0.06 * tp, 0.37 - 0.14 * tp, 0.12 + 0.02 * tp, h, [0.6, -1, -0.5]);
    mez(P.cabeza, [0.12, 0, 0], h);
  });

  // ---- boxeo de sombra (3 golpes: jab, jab, cruzado) y puñetazos fuertes (5 golpes, el último gancho)
  function boxeoDef(fuerte) {
    var dur = fuerte ? DURA.punos : DURA.boxeo;
    var G = fuerte ? [[0.55, 'I'], [0.93, 'D'], [1.31, 'I'], [1.69, 'D'], [2.15, 'D', 1]] : [[0.7, 'I'], [1.35, 'I'], [2.0, 'D']];
    var ext = function (tau, g) { return envol(tau, g[0], g[0] + (fuerte ? 0.08 : 0.10), g[0] + (fuerte ? 0.12 : 0.14), g[0] + (fuerte ? 0.28 : 0.32)); };
    return [function (P, w, tau) {
      var st = w * sstep(0.1, 0.5, tau) * (1 - sstep(dur - 0.55, dur - 0.15, tau)), eI = 0, eD = 0, eg = 0, i;
      G.forEach(function (g) { var e = ext(tau, g); if (g[1] === 'I') eI = Math.max(eI, e); else if (g[2]) eg = Math.max(eg, e); else eD = Math.max(eD, e); });
      mez(P.caderaD, [0.1, 0, 0.2], st); mez(P.caderaI, [-0.1, 0, 0.22], st); mez(P.rodillaD, [0.35, 0, 0], st); mez(P.rodillaI, [0.3, 0, 0], st); mez(P.pieD, [0.15, 0, 0], st); mez(P.pieI, [0.2, 0, 0], st);
      mez(P.torso, [0.12, 0.25 * eD + 0.3 * eg - 0.14 * eI, 0], st); mez(P.pelvis, [0, 0.22 * eD + 0.25 * eg - 0.1 * eI, 0], st); mez(P.cabeza, [0.1, 0, 0], st);
      var br = fuerte ? 0.25 : 0.1; P.dz += st * 0.03 * Math.sin(tau * (fuerte ? 12 : 7));
      var gI = [0.04 + 0.12 * eI, 0.36 - 0.06 * eI, 0.26 + 0.24 * eI], gD = [0.06 - 0.06 * eD + 0.1 * eg, 0.38 - 0.08 * eD + 0.20 * eg, 0.26 + 0.25 * eD + 0.18 * eg];
      ikBrazo(P, 'I', gI[0], gI[1], gI[2], st, [0.5, -1, -0.2]); ikBrazo(P, 'D', gD[0], gD[1], gD[2], st, [0.5, -1, -0.2]);
    }, function (A, tau, dt, w) {
      G.forEach(function (g, i) {
        var e = ext(tau, g); if (e > 0.3) { puno(g[1], _b2); chispa(_b2.x, _b2.y, _b2.z, [0.8, 0.92, 1], 0.25, 0.35, 0); }
        if (fuerte && tau >= g[0] + 0.1 && !A.d['g' + i]) {
          A.d['g' + i] = 1; puno(g[1], _b2); anillo2(_b2, 3.4);
          if (g[2]) { onda(mezclaC(RANGOC[E.rangoIdx], CBLANCO, 0.4), 9, 0.8, 0, 0.9); S.m.shake += 0.5; rafaga(_b2.x, _b2.y, _b2.z, 30, 2, 7, RANGOC[E.rangoIdx], 0.35, 0.8, -0.4, 0.9); }
        }
      });
    }];
  }
  var bx = boxeoDef(false), bf = boxeoDef(true);
  def('boxeo', bx[0], bx[1]); def('punos', bf[0], bf[1]);

  // ---- cargar energía (empoderado): se agacha, puños abajo, el pelo se eriza, grito corto con la mandíbula abierta, destello
  def('cargar', function (P, w, tau) {
    var wC = w * envol(tau, 0.3, 1.0, 1.7, 2.2), gr = envol(tau, 1.9, 2.0, 2.3, 2.5);
    P.ground += wC; mezT(P, PO.agacha, wC); mezT(P, PO.estalla, w * envol(tau, 1.9, 2.05, 2.3, 2.6) * 0.8); P.mandibula[0] += 0.35 * gr * w;
  }, function (A, tau, dt, w) {
    var wC = envol(tau, 0.3, 1.0, 1.7, 2.2), m = S.m, ch = pecho();
    m.aura += 0.8 * wC; m.pelo += 1.0 * wC; m.ojoBoost += 0.8 * wC; m.ceno += 0.7 * wC;
    if (tau > 0.4 && tau < 1.9) { for (var i = 0; i < 3 * S.cal; i++) { var a = Math.random() * 6.283, r = rnd(3, 6), ix = emitir(ch.x + Math.cos(a) * r, ch.y + Math.sin(a) * r * 0.8, ch.z + rnd(-1, 1), 0, 0, 0, RANGOC[E.rangoIdx], rnd(0.2, 0.4), 0.8, 0, 0.5); if (ix != null) atraer(ix, ch.x, ch.y, ch.z + 0.3, 7); } }
    if (tau >= 1.95 && !A.d.g) { A.d.g = 1; m.flashA += 0.3; onda(RANGOC[E.rangoIdx], 12, 1.0, 0, 0.9); onda([1, 1, 1], 7, 0.7, 0.05, 0.8, true); rafaga(ch.x, ch.y, ch.z, 50, 3, 9, RANGOC[E.rangoIdx], 0.4, 1.0, -0.4, 0.9); }
    if (tau >= 1.95) m.flashA += 0.2 * Math.exp(-(tau - 1.95) / 0.12);
  });

  // ---- golpe al suelo con el puño (empoderado): puño en alto, baja de golpe; onda expansiva y polvo
  def('suelo', function (P, w, tau) {
    var up = w * envol(tau, 0.25, 0.8, 0.9, 1.05), sl = w * sstep(0.9, 1.1, tau) * (1 - sstep(1.7, 2.4, tau));
    if (!PO_PIERNAS) PO_PIERNAS = subset(PO.impacto, /^(cadera|rodilla|pie|torso|pecho|cuello)/);
    mez(P.brazoD, [-0.1, 0, 2.9], up); mez(P.codoD, [-0.3, 0, 0], up); mez(P.torso, [-0.2, 0, 0], up);
    P.ground += sl; mezT(P, PO_PIERNAS, sl); ikMundo(P, 'D', 1.05, 0.14, 1.5, sl, [0.4, -0.3, -1]);
  }, function (A, tau, dt, w) {
    if (tau >= 1.12 && !A.d.i) {
      A.d.i = 1; onda([1, 0.95, 0.8], 14, 1.1, 0, 1); onda(RANGOC[E.rangoIdx], 9, 0.8, 0.08, 0.8); S.m.shake += 0.9; S.m.flashA += 0.2;
      for (var di = 0; di < (S.cal < 1 ? 25 : 60); di++) { var an = Math.random() * 6.283, vv = rnd(2, 6); emitir(1.05 + Math.cos(an) * 0.6, 0.15, 1.5 + Math.sin(an) * 0.6, Math.cos(an) * vv, rnd(0.3, 1.2), Math.sin(an) * vv, [0.62, 0.62, 0.7], rnd(0.3, 0.6), rnd(0.9, 1.6), -0.6, 1.2); }
    }
    if (tau >= 1.12) S.m.shake += 0.7 * Math.exp(-(tau - 1.12) / 0.4);
  });

  // ---- levitar 1 s en loto y bajar (empoderado)
  def('loto', function (P, w, tau) {
    var lv = envol(tau, 0.3, 0.9, 1.9, 2.6), lw = w * envol(tau, 0.2, 0.6, 2.0, 2.6);
    mezT(P, PO.loto, lw); P.lift += 0.35 * lv;
    var wh = lw * sstep(0.5, 0.8, tau); if (wh > 0) ['D', 'I'].forEach(function (l) { pw(S.rig.n['rodilla' + l], 0, 0, 0.05, _a); ikMundo(P, l, _a.x, _a.y + 0.12, _a.z, wh, [0.6, -1, -0.2]); });
  }, function (A, tau) {
    var lv = envol(tau, 0.3, 0.9, 1.9, 2.6), m = S.m; m.aura += 0.4 * lv; m.pelo += 0.6 * lv; m.expande += 0.2 * lv;
    if (tau >= 1.2 && !A.d.p) { A.d.p = 1; onda(HABC.meditar, 11, 1.0, 0, 0.8); }
  });

  // ---- batir las alas fuerte dos veces y quedar flotando más alto (empoderado)
  def('alas', function (P, w, tau) {
    var dip = w * envol(tau, 0.15, 0.4, 0.5, 0.7), up = w * sstep(0.5, 1.8, tau) * (1 - sstep(2.2, 2.9, tau));
    P.ground += dip; mezT(P, PO.agacha, dip * 0.5); P.lift += 0.28 * up;
  }, function (A, tau, dt, w) {
    var m = S.m, f = Math.sin(Math.PI * clamp((tau - 0.5) / 0.6, 0, 1)) + Math.sin(Math.PI * clamp((tau - 1.2) / 0.6, 0, 1));
    m.aleteo += 1.0 * f; m.alas += 0.6 * f;
    if (f > 0.2) { pw(S.rig.n.pieD, 0, 0, 0, _a); for (var i = 0; i < 2; i++) emitir(_a.x + rnd(-1.5, 1.5), 0.3, _a.z + rnd(-1, 1), rnd(-1, 1), rnd(-0.2, 0.4), rnd(-1, 1), [0.8, 0.85, 1], rnd(0.2, 0.4), 0.8, 0, 1); }
  });

  // ---- giro de capa (empoderado): 360° con los brazos abiertos y la capa abierta
  def('giro', function (P, w, tau) {
    P.spin += 6.283185307 * eIO(rampa(0.3, 1.5, tau)); mezT(P, PO.abierta, w * envol(tau, 0.2, 0.5, 1.4, 1.9)); P.lift += 0.1 * w * envol(tau, 0.3, 0.7, 1.2, 1.8);
  }, function (A, tau) { if (tau > 0.4 && tau < 1.5) S.m.aleteo += 0.3; });

  // ---- patada alta con estela (empoderado)
  def('patada', function (P, w, tau) {
    var kk = w * sstep(0.3, 0.7, tau) * (1 - sstep(1.35, 1.85, tau)), ex = sstep(0.7, 0.92, tau);
    mez(P.caderaD, [-1.55, 0, 0.15], kk); mez(P.rodillaD, [lerp(1.8, 0.05, ex), 0, 0], kk); mez(P.pieD, [0.3, 0, 0], kk); mez(P.rodillaI, [0.25, 0, 0], kk); mez(P.torso, [-0.3, 0, 0], kk);
    mez(P.brazoD, [null, null, 0.7], kk); mez(P.brazoI, [null, null, 0.7], kk); P.lift += 0.06 * kk;
  }, function (A, tau) {
    if (tau > 0.72 && tau < 1.25) { pw(S.rig.n.pieD, 0, -0.03, 0.06, _a); for (var i = 0; i < 3; i++) emitir(_a.x, _a.y, _a.z, rnd(-0.3, 0.3), rnd(-0.3, 0.3), rnd(-0.3, 0.3), [1, 0.9, 0.7], rnd(0.25, 0.4), 0.45, 0, 1); }
  });

  function elegir() {
    var T = esEmpoderado() ? PESOS.emp : PESOS.base, tot = 0, k, r;
    for (k in T) if (k !== S.dir.last) tot += T[k];
    r = Math.random() * tot;
    for (k in T) { if (k === S.dir.last) continue; r -= T[k]; if (r <= 0) return k; }
    return 'pensar';
  }
  function iniciarAccion(n) { var D = S.dir; D.act = { n: n, t: 0, dur: DURA[n] * rnd(0.95, 1.02), d: {}, salida: null, res: D.pend }; D.pend = []; }
  function terminarAccion() {
    var D = S.dir, A = D.act; if (!A) return;
    S.taza.visible = false; D.last = A.n; D.act = null; D.next = esEmpoderado() ? rnd(3, 6) : rnd(5, 10);
    A.res.forEach(function (r) { r(true); });
  }
  function tickDirector(dt) {
    var s = S, D = s.dir; if (!D) return;
    var bloq = s.reducido || !!s.A || s.jobs.some(function (j) { return j.tipo === 'subir' || j.tipo === 'sobre' || j.tipo === 'entrega'; }), A = D.act;
    if (A) {
      if (bloq && A.salida == null) A.salida = A.t;
      A.t += dt;
      var tau = A.t, w = sstep(0, 0.35, tau) * (A.salida != null ? 1 - sstep(A.salida, A.salida + 0.3, tau) : 1 - sstep(A.dur - 0.35, A.dur, tau));
      if (D.force && A.salida == null) A.salida = tau;   // una acción pedida a mano corta la actual con salida suave
      if (s.reducido) w = 0;
      try { ACC[A.n].fx(A, tau, dt, w); } catch (e) { s.error = String(e && e.stack || e); }
      s.capas.push(function (P) { ACC[A.n].pose(P, w, tau, A); });
      if (tau >= A.dur || (A.salida != null && tau >= A.salida + 0.3)) terminarAccion();
      return;
    }
    if (bloq) { if (!s.reducido) D.next += dt; return; }
    if (D.force) { var f = D.force; D.force = null; iniciarAccion(f); return; }
    D.next -= dt; if (D.next <= 0) iniciarAccion(elegir());
  }
  function accion(nombre) {   // para pruebas: ejecuta esa acción de reposo (corta la actual con salida suave); resuelve al terminar
    if (!S || S.reducido || !ACC[nombre]) return Promise.resolve(false);
    var s = S;
    return new Promise(function (res) {
      var ok = false, fin = function (v) { if (!ok) { ok = true; res(v); } };
      s.dir.force = nombre; s.dir.pend.push(fin);
      setTimeout(function () { fin(false); }, (DURA[nombre] + 3) * 1000);
    });
  }

  // ---- taza (objeto del mundo, vertical): cuerpo oscuro, borde dorado, asa, café
  function construirTaza() {
    var g = new THREE.Group(), T = new THREE.MeshToonMaterial({ color: 0x2A2018, gradientMap: S.tex.grad });
    var body = loft([{ y: -0.045, rx: 0.001, rz: 0.001 }, { y: -0.043, rx: 0.028, rz: 0.028 }, { y: -0.005, rx: 0.036, rz: 0.036 }, { y: 0.045, rx: 0.042, rz: 0.042 }], 14);
    g.add(new THREE.Mesh(body, T)); g.add(new THREE.Mesh(contorno(body, 0.003), S.rig.mat.contorno));
    var rim = new THREE.Mesh(anillo(0.0425, 0.0425, 0.0045, 16, 6), S.rig.mat.oro); rim.position.y = 0.045; g.add(rim);
    var asa = anillo(0.018, 0.018, 0.004, 10, 6); asa.rotateZ(Math.PI / 2); asa.translate(0.05, 0.0, 0); g.add(new THREE.Mesh(asa, S.rig.mat.oro));
    var cafe = new THREE.Mesh(esfera(0.039, 0.002, 0.039, 12, 3), new THREE.MeshBasicMaterial({ color: 0x120A06 })); cafe.position.y = 0.04; g.add(cafe);
    g.visible = false; S.scene.add(g); return g;
  }
  // ---------------------------------------------------------------- API
  global.Escena = {
    init: init, setEstado: setEstado, apertura: apertura, saltar: saltar, subir: subir, sobrecarga: sobrecarga, entrega: entrega,
    girar: girar, fotograma: fotograma, destruir: destruir, stats: stats,
    accion: accion, empoderado: empoderado, acciones: NOMBRES.slice(),
    listo: function () { return !!S; },
    _estado: function () { return S; }
  };
})(typeof window !== 'undefined' ? window : this);
