// f"TurboTartaruga Service Worker v{build}
"const CACHE_NAME = 'turbotartaruga-202604251250';
const PRECACHE = ['./TurboTartaruga.html', './manifest.json'];
const EXTERNAL_CACHE = ['https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.min.js'];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(PRECACHE)
        .then(() => cache.addAll(EXTERNAL_CACHE).catch(()=>{}))
    ).catch(() => {})
  );
});

self.addEventListener('activate', event => {
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

  if (url.pathname.includes('version.json')) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .catch(() => new Response('{}', { headers: {'Content-Type': 'application/json'} }))
    );
    return;
  }

  if (url.pathname.includes('TurboTartaruga.html') || url.pathname.endsWith('/')) {
    event.respondWith(
      fetch(event.request, { cache: 'no-cache' })
        .then(response => {
          if (response && response.status === 200) {
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

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

// ── Notification store (persisted in Cache API as JSON) ──────────────────
const NOTIF_STORE_KEY = 'tt-pending-notifications';

async function loadPendingNotifs() {
  try {
    const cache = await caches.open(CACHE_NAME);
    const resp = await cache.match(NOTIF_STORE_KEY);
    if (!resp) return [];
    return await resp.json();
  } catch { return []; }
}

async function savePendingNotifs(list) {
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(NOTIF_STORE_KEY, new Response(JSON.stringify(list), {
      headers: { 'Content-Type': 'application/json' }
    }));
  } catch {}
}

async function checkAndFireNotifs() {
  const now = Date.now();
  const pending = await loadPendingNotifs();
  const remaining = [];
  for (const n of pending) {
    if (n.at <= now) {
      // Fire it
      await self.registration.showNotification(n.title, {
        body: n.body,
        icon: './icon-192.png',
        badge: './icon-192.png',
        tag: n.tag || 'turbotartaruga-202604251250',
        renotify: true,
        data: { url: './TurboTartaruga.html' }
      });
    } else {
      remaining.push(n);
    }
  }
  if (remaining.length !== pending.length) {
    await savePendingNotifs(remaining);
  }
}

// Message handler
self.addEventListener('message', async event => {
  if (!event.data) return;
  if (event.data === 'skipWaiting' || event.data?.type === 'skipWaiting') {
    self.skipWaiting(); return;
  }

  if (event.data.type === 'CANCEL_TODAY_NOTIF') {
    // Remove today's daily notification from pending
    const pending = await loadPendingNotifs();
    const filtered = pending.filter(n => n.tag !== 'turbotartaruga-202604251250');
    await savePendingNotifs(filtered);
    // Close any shown notification with that tag
    self.registration.getNotifications({ tag: 'turbotartaruga-202604251250' })
      .then(notifs => notifs.forEach(n => n.close()));
    return;
  }

  if (event.data.type === 'SCHEDULE_NOTIF') {
    const { at, title, body, tag } = event.data.payload;
    if (!at || !title || !body) return;
    
    const pending = await loadPendingNotifs();
    // Replace any existing notif with same tag
    const notifTag = tag || 'turbotartaruga-202604251250';
    const filtered = pending.filter(n => n.tag !== notifTag);
    filtered.push({ at, title, body, tag: notifTag });
    await savePendingNotifs(filtered);
    
    // Also check immediately in case we're past the time
    await checkAndFireNotifs();
    return;
  }
  
  if (event.data.type === 'CHECK_NOTIFS') {
    // Explicit check request from app
    await checkAndFireNotifs();
    return;
  }
  
  if (event.data.type === 'CLEAR_ALL_NOTIFS') {
    await savePendingNotifs([]);
    return;
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
