// TurboTartaruga Service Worker — with notification scheduling
const CACHE_NAME = 'turbotartaruga-202604102153';

const PRECACHE = ['./', './TurboTartaruga.html'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;
  event.respondWith(
    caches.open(CACHE_NAME).then(cache =>
      cache.match(event.request).then(cached => {
        const fetchPromise = fetch(event.request).then(response => {
          if (response && response.status === 200) cache.put(event.request, response.clone());
          return response;
        }).catch(() => null);
        return cached || fetchPromise;
      })
    )
  );
});

// ── Notification scheduling ──────────────────────────────────────
const _notifTimers = new Map();

self.addEventListener('message', event => {
  if (!event.data) return;
  if (event.data === 'skipWaiting') { self.skipWaiting(); return; }

  if (event.data.type === 'CANCEL_TODAY_NOTIF') {
    // User has already trained today — cancel the pending daily notification
    for (const [key, tid] of _notifTimers.entries()) {
      if (key.startsWith('🐢 TurboTartaruga')) {
        clearTimeout(tid);
        _notifTimers.delete(key);
      }
    }
    // Also close any already-shown notification with the daily tag
    self.registration.getNotifications({tag:'turbotartaruga-202604102153'})
      .then(notifs => notifs.forEach(n => n.close()));
    return;
  }

  if (event.data.type === 'SCHEDULE_NOTIF') {
    const { at, title, body } = event.data.payload;
    if (!at || !title || !body) return;
    const delay = at - Date.now();
    if (delay < 0) return; // past

    const key = title + at;
    if (_notifTimers.has(key)) clearTimeout(_notifTimers.get(key));

    const tid = setTimeout(() => {
      self.registration.showNotification(title, {
        body,
        icon: './icon-192.png',
        badge: './icon-192.png',
        tag: 'turbotartaruga-202604102153',
        renotify: true,
        data: { url: './' }
      });
      _notifTimers.delete(key);
    }, Math.min(delay, 2147483647)); // max setTimeout value
    _notifTimers.set(key, tid);
  }
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(cls => {
      const c = cls.find(c => c.url.includes('TurboTartaruga'));
      if (c) { c.focus(); return; }
      clients.openWindow(event.notification.data?.url || './TurboTartaruga.html');
    })
  );
});
