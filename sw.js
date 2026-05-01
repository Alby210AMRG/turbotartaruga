// TurboTartaruga Service Worker v202604262049
const CACHE_NAME = 'turbotartaruga-202605010830';

// File da precacheare all'installazione (OBBLIGATORI per offline)
const PRECACHE = [
  './TurboTartaruga.html',
  './manifest.json',
  './logo-app.png',
  './logo-turtle.png',
  './icon-192.png',
  './icon-512.png',
];

// Librerie esterne da cacheare (errori tollerati)
const EXTERNAL_CACHE = [
  'https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
];

// ── INSTALL: precache tutto subito ─────────────────────────────────────────
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      // Precache file locali (critico — fallisce se non raggiungibili)
      await cache.addAll(PRECACHE).catch(() => {
        // Prova uno per uno per non bloccare tutto
        return Promise.all(
          PRECACHE.map(url => cache.add(url).catch(() => {}))
        );
      });
      // Librerie esterne (non bloccanti)
      await Promise.all(
        EXTERNAL_CACHE.map(url => cache.add(url).catch(() => {}))
      );
    })
  );
});

// ── ACTIVATE: pulisci vecchie cache ────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── FETCH: strategia per tipo di risorsa ───────────────────────────────────
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // ── 1. version.json: sempre network, fallback risposta vuota ────────────
  if (url.pathname.includes('version.json')) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .catch(() => new Response('{}', {
          headers: { 'Content-Type': 'application/json' }
        }))
    );
    return;
  }

  // ── 2. File locali (stessa origine): CACHE-FIRST con refresh in background
  if (url.origin === location.origin) {
    const isNav = event.request.mode === 'navigate' ||
                  url.pathname.includes('TurboTartaruga.html') ||
                  url.pathname.endsWith('/');

    if (isNav) {
      // Navigazione: cache-first → se in cache servi subito,
      // aggiorna in background per la prossima visita
      event.respondWith(
        caches.open(CACHE_NAME).then(async cache => {
          const cached = await cache.match('./TurboTartaruga.html');
          // Aggiorna in background
          fetch(event.request)
            .then(resp => {
              if (resp && resp.status === 200)
                cache.put(event.request, resp.clone());
            })
            .catch(() => {});
          // Servi dalla cache se disponibile
          if (cached) return cached;
          // Altrimenti prova la rete (prima visita con connessione)
          return fetch(event.request)
            .then(resp => {
              if (resp && resp.status === 200)
                cache.put(event.request, resp.clone());
              return resp;
            });
        })
      );
      return;
    }

    // Immagini e altri asset locali: cache-first
    event.respondWith(
      caches.open(CACHE_NAME).then(async cache => {
        const cached = await cache.match(event.request);
        if (cached) {
          // Aggiorna in background
          fetch(event.request)
            .then(resp => {
              if (resp && resp.status === 200)
                cache.put(event.request, resp.clone());
            })
            .catch(() => {});
          return cached;
        }
        // Non in cache: fetch e salva
        return fetch(event.request)
          .then(resp => {
            if (resp && resp.status === 200)
              cache.put(event.request, resp.clone());
            return resp;
          })
          .catch(() => {
            // Fallback SVG per immagini mancanti offline
            const isImg = url.pathname.match(/\.(png|jpg|jpeg|webp|svg)$/i);
            if (isImg) {
              return new Response(
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 160">' +
                '<rect width="200" height="160" fill="#f5f5f5" rx="12"/>' +
                '<text x="100" y="90" text-anchor="middle" font-size="48">🐢</text>' +
                '</svg>',
                { headers: { 'Content-Type': 'image/svg+xml' } }
              );
            }
            return new Response('', { status: 503 });
          });
      })
    );
    return;
  }

  // ── 3. Risorse esterne (CDN): cache-first, fallback silenzioso ──────────
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request)
        .then(resp => {
          if (resp && resp.status === 200) {
            caches.open(CACHE_NAME)
              .then(cache => cache.put(event.request, resp.clone()));
          }
          return resp;
        })
        .catch(() => new Response('', { status: 503 }));
    })
  );
});

// ── Notification store ──────────────────────────────────────────────────────
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
      await self.registration.showNotification(n.title, {
        body: n.body,
        icon: './icon-192.png',
        badge: './icon-192.png',
        tag: n.tag || CACHE_NAME,
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

self.addEventListener('message', async event => {
  if (!event.data) return;
  if (event.data === 'skipWaiting' || event.data?.type === 'skipWaiting') {
    self.skipWaiting(); return;
  }
  if (event.data.type === 'CANCEL_TODAY_NOTIF') {
    const pending = await loadPendingNotifs();
    await savePendingNotifs(pending.filter(n => n.tag !== CACHE_NAME));
    self.registration.getNotifications({ tag: CACHE_NAME })
      .then(notifs => notifs.forEach(n => n.close()));
    return;
  }
  if (event.data.type === 'SCHEDULE_NOTIF') {
    const { at, title, body, tag } = event.data.payload;
    if (!at || !title || !body) return;
    const notifTag = tag || CACHE_NAME;
    const pending = await loadPendingNotifs();
    const filtered = pending.filter(n => n.tag !== notifTag);
    filtered.push({ at, title, body, tag: notifTag });
    await savePendingNotifs(filtered);
    await checkAndFireNotifs();
    return;
  }
  if (event.data.type === 'CHECK_NOTIFS') {
    await checkAndFireNotifs(); return;
  }
  if (event.data.type === 'CLEAR_ALL_NOTIFS') {
    await savePendingNotifs([]); return;
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
