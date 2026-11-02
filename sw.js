// Network first (so updates show up), cache as offline fallback.
const C = 'laimue-v16'; // bump with VERSION in hand.js
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'hand.js', 'manifest.webmanifest', 'icons/icon-180.png', 'icons/icon-192.png',
  'lib/opentype.min.js', 'lib/pdf.min.js', 'lib/pdf.worker.min.js', 'lib/pdf-lib.min.js', 'lib/Sriracha-Regular.ttf', 'refs.json',
  'motion.js', 'lib/gsap.min.js', 'lib/lottie_light.min.js', 'anim/done.json', 'lib/fonts/kanit-700-thai.woff2', 'lib/fonts/kanit-700-latin.woff2', 'lib/fonts/kanit-800-thai.woff2', 'lib/fonts/kanit-800-latin.woff2'];
self.addEventListener('install', e => { e.waitUntil(caches.open(C).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' }))))); self.skipWaiting(); });
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  // no-cache: ask GitHub Pages if the file changed instead of using its 10-minute HTTP cache (URL form: a page-load Request can't take options)
  e.respondWith(fetch(e.request.url, { cache: 'no-cache' }).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(C).then(c => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
