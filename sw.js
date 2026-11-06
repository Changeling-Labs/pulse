const CACHE = 'pulse-v5';
const ASSETS = [
  './',
  './index.html',
  './css/app.css',
  './js/app.js',
  './js/kernel/helpers.js',
  './js/kernel/shell.js',
  './js/modules/move/shared.js',
  './js/modules/move/log.js',
  './js/modules/move/modal.js',
  './js/modules/move/timer.js',
  './js/modules/move/prs.js',
  './js/modules/move/planner.js',
  './js/modules/fuel/fuel.js',
  './js/modules/settings.js',
  './js/pr.js',
  './js/fuel.js',
  './js/db.js',
  './js/schema.js',
  './js/dates.js',
  './js/circuits.js',
  './js/timer.js',
  './js/calc.js',
  './js/confetti.js',
  './js/backup.js',
  './js/version.js',
  './js/sync.js',
  './js/sync-core.js',
  './js/sync-config.js',
  './js/vendor/supabase.js',
  './manifest.json',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
