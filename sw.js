// TurboTartaruga Service Worker v0.5
const CACHE_NAME = 'turbotartaruga-202604100809';

const PRECACHE = [
  './',
  './TurboTartaruga.html',
];

// NEVER cache these — they must always be fresh
const NO_CACHE = ['version.json', 'sw.js'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;

  // Never cache version.json or sw.js — always fetch fresh
  const pathname = url.pathname.split('/').pop();
  if (NO_CACHE.some(f => pathname.startsWith(f))) {
    event.respondWith(fetch(event.request, {cache: 'no-store'}));
    return;
  }

  // Stale-while-revalidate for everything else
  event.respondWith(
    caches.open(CACHE_NAME).then(cache =>
      cache.match(event.request).then(cached => {
        const fetchPromise = fetch(event.request)
          .then(response => {
            if (response && response.status === 200) {
              cache.put(event.request, response.clone());
            }
            return response;
          })
          .catch(() => null);
        return cached || fetchPromise;
      })
    )
  );
});

self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
