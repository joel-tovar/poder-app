/* PODER · service worker: funciona sin internet (cáscara en caché) y recibe los avisos de entregas. */
const V = 'poder-v5';
const CASCARA = ['./', 'index.html', 'puente.js', 'app.css', 'src/tablero.css', 'src/tablero.js', 'src/escena.js', 'src/escena-doble.js',
  'img/personaje.webp', 'img/icono-192.png', 'manifest.webmanifest', 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'];

self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(CASCARA)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Red primero para la app (siempre la última versión), caché si no hay internet. La API nunca se guarda en caché.
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.hostname.endsWith('workers.dev')) return;
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok && (u.origin === location.origin || u.hostname === 'cdnjs.cloudflare.com')) { const c = r.clone(); caches.open(V).then(k => k.put(e.request, c)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});

self.addEventListener('push', e => {
  let d = {}; try { d = e.data.json(); } catch { d = { title: 'PODER', body: e.data ? e.data.text() : '' }; }
  e.waitUntil((async () => {
    await self.registration.showNotification(d.title || 'PODER', {
      body: d.body || '', tag: d.tag || 'poder', renotify: true, silent: false,
      icon: 'img/icono-192.png', badge: 'img/icono-192.png', vibrate: [90, 60, 90, 60, 240],
      data: { url: d.url || './' }, timestamp: Date.now(),
    });
    const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    cs.forEach(c => c.postMessage({ tipo: 'entrega' })); // si la app está abierta: campanita + relectura
  })());
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    const c = cs.find(x => 'focus' in x); return c ? c.focus() : self.clients.openWindow(e.notification.data && e.notification.data.url || './');
  }));
});
