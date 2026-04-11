// TurboTartaruga Service Worker v202604110822
const CACHE_NAME = 'turbotartaruga-202604111024';
const PRECACHE = ['./TurboTartaruga.html', './manifest.json'];

self.addEventListener('install', event => {
  // skipWaiting immediately — don't wait for old SW to be released
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE)).catch(() => {})
  );
});

self.addEventListener('activate', event => {
  // Delete ALL old caches immediately
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;

  // version.json: ALWAYS network — never cache (used for update check)
  if (url.pathname.includes('version.json')) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .catch(() => new Response('{}', { headers: {'Content-Type': 'application/json'} }))
    );
    return;
  }

  // TurboTartaruga.html: network-first — always try to get latest
  if (url.pathname.includes('TurboTartaruga.html') || url.pathname.endsWith('/')) {
    event.respondWith(
      fetch(event.request, { cache: 'no-cache' })
        .then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request)) // fallback to cache if offline
    );
    return;
  }

  // Everything else (icons, manifest): cache-first
  event.respondWith(
    caches.match(event.request).then(cached => {
      const fetchPromise = fetch(event.request).then(response => {
        if (response && response.status === 200) {
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
        }
        return response;
      }).catch(() => null);
      return cached || fetchPromise;
    })
  );
});

// ── Notification scheduling ──────────────────────────────────────
const _notifTimers = new Map();

self.addEventListener('message', event => {
  if (!event.data) return;
  if (event.data === 'skipWaiting' || event.data?.type === 'skipWaiting') {
    self.skipWaiting(); return;
  }

  if (event.data.type === 'CANCEL_TODAY_NOTIF') {
    for (const [key, tid] of _notifTimers.entries()) {
      clearTimeout(tid);
      _notifTimers.delete(key);
    }
    self.registration.getNotifications({tag:'turbotartaruga-202604111024'})
      .then(notifs => notifs.forEach(n => n.close()));
    return;
  }

  if (event.data.type === 'SCHEDULE_NOTIF') {
    const { at, title, body } = event.data.payload;
    if (!at || !title || !body) return;
    const delay = at - Date.now();
    if (delay < 0) return;
    const key = title + at;
    if (_notifTimers.has(key)) clearTimeout(_notifTimers.get(key));
    const tid = setTimeout(() => {
      self.registration.showNotification(title, {
        body,
        icon: './icon-192.png',
        badge: './icon-192.png',
        tag: 'turbotartaruga-202604111024',
        renotify: true,
        data: { url: './TurboTartaruga.html' }
      });
      _notifTimers.delete(key);
    }, Math.min(delay, 2147483647));
    _notifTimers.set(key, tid);
  }
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(cls => {
      const found = cls.find(c => c.url.includes('TurboTartaruga'));
      if (found) { found.focus(); return; }
      clients.openWindow('./TurboTartaruga.html');
    })
  );
});
