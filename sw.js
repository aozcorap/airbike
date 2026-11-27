// Service Worker: App-Dateien offline verfügbar machen (Cache zuerst, bei neuer Version aktualisieren).
const CACHE = 'redline-v154'; // gleiche Zahl wie APP_BUILD in app.js
const FILES = [
  './',
  'index.html',
  'splash.js',
  'styles.css',
  'app.js',
  'data.js',
  'plan.js',
  'cloud.js',
  'legal.js',
  'config.js',
  'vendor/supabase.js',
  'img/hero.jpg',
  'img/ton/klopf1.wav',
  'img/ton/klopf2.wav',
  'img/ton/klopf3.wav',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  // cache: 'reload' umgeht den 10-Minuten-Zwischenspeicher des Browsers, sonst landet nach einem Update eine alte Datei unter dem neuen Versionsnamen
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(FILES.map((f) => c.add(new Request(f, { cache: 'reload' }))))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

// Push-Mitteilung vom Server (Web-Version): anzeigen, auch wenn die App geschlossen ist
self.addEventListener('push', (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch {
    /* ohne Inhalt */
  }
  e.waitUntil(self.registration.showNotification(d.title || 'Nonstop Boxing', { body: d.body || '', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'nonstop-erinnerung', data: { url: d.url || './' } }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) if ('focus' in c) return c.focus();
      return self.clients.openWindow(url);
    }),
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
