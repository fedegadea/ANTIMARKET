// Anti Market — service worker. Strategy: NETWORK-FIRST, cache as fallback.
// Online users always get fresh HTML/JS/CSS (safe across frequent deploys);
// offline users get the last-seen version. API calls are never cached.
const CACHE = 'am-runtime-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting(); // activate the new SW immediately
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // drop old cache versions
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // only handle our own origin; never cache API / auth traffic
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith((async () => {
    try {
      const fresh = await fetch(req);
      // stash a copy for offline (only successful, basic responses)
      if (fresh && fresh.status === 200 && fresh.type === 'basic') {
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone());
      }
      return fresh;
    } catch (e) {
      // offline: serve from cache, falling back to the home shell for navigations
      const cached = await caches.match(req);
      if (cached) return cached;
      if (req.mode === 'navigate') {
        const home = await caches.match('/');
        if (home) return home;
      }
      throw e;
    }
  })());
});
