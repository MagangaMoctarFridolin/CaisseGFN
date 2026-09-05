/* Service worker : garde l'application utilisable hors connexion.
   Les DONNÉES ne passent jamais par ce cache — elles vivent dans les journaux
   (cache local du navigateur + OneDrive). Ici, on ne met en cache que
   l'application elle-même. */

const CACHE = 'tontine-app-v1';
const FICHIERS = [
  '.', 'index.html', 'app.css', 'config.js',
  'js/app.js', 'js/db.js', 'js/ui.js', 'js/synchro.js', 'js/stockage.js', 'js/comptes.js',
  'manifest.webmanifest', 'icones/icone-192.png', 'icones/icone-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FICHIERS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((cles) => Promise.all(cles.filter((c) => c !== CACHE).map((c) => caches.delete(c))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Jamais de cache pour OneDrive ni pour la connexion Microsoft.
  if (url.hostname.endsWith('microsoft.com') || url.hostname.endsWith('microsoftonline.com')) return;
  if (e.request.method !== 'GET') return;

  // L'application : le réseau d'abord, le cache en secours.
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        if (r.ok && url.origin === location.origin) {
          const copie = r.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copie));
        }
        return r;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('index.html')))
  );
});
