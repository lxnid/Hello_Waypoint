// Cache only this app's shell and build assets. APIs and third-party maps always use the network.
const CACHE = 'waypoint-shell-v1';
const PRECACHE = [];
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const response = await fetch('/', { cache: 'reload' });
      if (!response.ok) throw new Error('Application shell unavailable');
      const html = await response.clone().text();
      // Vite emits fingerprinted JS and CSS under /assets/.
      const assets = [...html.matchAll(/(?:src|href)=["'](\/assets\/[^"']+)["']/g)].map(
        (match) => match[1],
      );
      const cache = await caches.open(CACHE);
      await cache.addAll([...new Set([...assets, ...PRECACHE])]);
      await cache.put('/', response);
    })(),
  );
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith('waypoint-shell-') && name !== CACHE) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/docs')
  )
    return;
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(async () => (await caches.open(CACHE)).match('/')),
    );
  } else if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const cached = await cache.match(event.request);
        if (cached) return cached;
        const response = await fetch(event.request);
        if (response.ok) await cache.put(event.request, response.clone());
        return response;
      })(),
    );
  }
});
