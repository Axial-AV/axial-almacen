/* Service worker: guarda la app en el móvil para que abra al momento y funcione sin cobertura.
 * Para publicar una versión nueva, cambia el número de CACHE. */
const CACHE = 'axial-almacen-2.1.0';
const ARCHIVOS = ['./', './index.html', './app.js', './ui.js', './manifest.webmanifest', './html5-qrcode.min.js',
  './icon-192.png', './icon-512.png', './maskable-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Primero la red (para tener siempre la última versión); si no hay cobertura o tarda, la copia guardada.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const red = await Promise.race([fetch(req), new Promise((_, rej) => setTimeout(() => rej(new Error('lenta')), 2500))]);
      if (red && red.ok) cache.put(req, red.clone());
      return red;
    } catch (err) {
      const c = await cache.match(req, { ignoreSearch: true });
      return c || fetch(req);
    }
  })());
});
