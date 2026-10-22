// Prosty cache offline: najpierw sieć, a gdy jej brak, wersja z pamięci.
const CACHE = 'pudelko-v24';
const FILES = ['./', 'index.html', 'styles.css', 'js/app.js', 'js/planner.js', 'js/data.js', 'manifest.webmanifest', 'icon.svg'];
// Paczki przepisów mogą nie istnieć, więc ich brak nie psuje instalacji.
const PACKS = ['ania', 'lidl', 'ks', 'respo'].map((s) => `js/recipes-${s}.js`);

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all([c.addAll(FILES), ...PACKS.map((f) => c.add(f).catch(() => {}))])));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});
