// TurboTartaruga Service Worker v0.5
// Aggiorna questo numero ogni volta che pubblichi una nuova versione
const CACHE_NAME = 'turbotartaruga-20260409100554';

// File da mettere in cache subito all'installazione
const PRECACHE = [
  './',
  './TurboTartaruga.html',
];

// ── Installazione: mette in cache i file base ─────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

// ── Attivazione: elimina vecchie cache ────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: serve dalla cache, aggiorna in background ─────────────────────
// Strategia: "Stale While Revalidate"
// → Risponde subito dalla cache (veloce)
// → Scarica in background la versione aggiornata
// → La prossima volta l'utente ha già la versione nuova
self.addEventListener('fetch', event => {
  // Ignora richieste non-GET e richieste esterne
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(cache =>
      cache.match(event.request).then(cached => {
        const fetchPromise = fetch(event.request)
          .then(response => {
            // Metti in cache solo risposte valide
            if (response && response.status === 200) {
              cache.put(event.request, response.clone());
            }
            return response;
          })
          .catch(() => null);

        // Restituisce la cache subito, o aspetta il fetch se non c'è cache
        return cached || fetchPromise;
      })
    )
  );
});

// ── Messaggio di aggiornamento disponibile ────────────────────────────────
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
