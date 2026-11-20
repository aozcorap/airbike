// Service Worker: App-Dateien offline verfügbar machen (Cache zuerst, bei neuer Version aktualisieren).
const CACHE = 'redline-v90'; // gleiche Zahl wie APP_BUILD in app.js
const FILES = [
  './',
  'index.html',
  'splash.js',
  'styles.css',
  'app.js',
  'data.js',
  'plan.js',
  'cloud.js',
  'config.js',
  'vendor/supabase.js',
  'img/hero.jpg',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  if (new URL(e.request.url).origin !== location.origin) return; // Konto-Server direkt ansprechen, nie zwischenspeichern
  if (e.request.url.endsWith('.mp4') || e.request.headers.has('range')) return; // Video direkt vom Server (Teil-Anfragen)
  if (new URL(e.request.url).searchParams.has('check')) return; // Versionsprüfung der App: immer direkt vom Server
  e.respondWith(
    caches.match(e.request).then((hit) => {
      // Dateien werden beim Nachladen immer beim Server geprüft (nicht aus dem 10-Minuten-Zwischenspeicher des Browsers)
      const net = fetch(e.request.mode === 'navigate' ? e.request : new Request(e.request, { cache: 'no-cache' }))
        .then((res) => {
          if (res.ok && new URL(e.request.url).origin === location.origin) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || net;
    }),
  );
});
