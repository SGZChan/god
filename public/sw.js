// Offline cache: the game's files are kept after the first visit, so it starts without a network. Saves live in the
// browser database / a file / the cloud, never here. Bump CACHE to force an update.
const CACHE = 'genesis-cosmos-v1';
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/__/')) return;
  // pages: network first (fresh deploys), fall back to the cache; hashed assets: cache first
  const isAsset = url.pathname.includes('/assets/');
  e.respondWith(
    isAsset
      ? caches.match(req).then(hit => hit || fetch(req).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res; }))
      : fetch(req).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res; }).catch(() => caches.match(req).then(hit => hit || caches.match('./index.html')))
  );
});
