// Network first (so updates show up), cache as offline fallback.
const C = 'laimue-v1';
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'hand.js', 'manifest.webmanifest', 'icons/icon-180.png', 'icons/icon-192.png',
  'lib/opentype.min.js', 'lib/pdf.min.js', 'lib/pdf.worker.min.js', 'lib/pdf-lib.min.js', 'lib/Sriracha-Regular.ttf'];
self.addEventListener('install', e => { e.waitUntil(caches.open(C).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(C).then(c => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
