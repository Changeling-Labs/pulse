const CACHE = 'pulse-v17';
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
  './js/modules/move/intervals.js',
  './js/modules/fuel/fuel.js',
  './js/modules/recover/recover.js',
  './js/modules/settings.js',
  './js/pr.js',
  './js/fuel.js',
  './js/recover.js',
  './js/insights.js',
  './js/exports.js',
  './js/download.js',
  './js/db.js',
  './js/schema.js',
  './js/dates.js',
  './js/circuits.js',
  './js/timer.js',
  './js/intervals.js',
  './js/cues.js',
  './js/calc.js',
  './js/confetti.js',
  './js/backup.js',
  './js/version.js',
  './icons/pulse-mark.svg',
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

//
// Only same-origin GET requests are cacheable. Everything else — Supabase
// auth and sync (POST, cross-origin), manifest, icons — goes straight to the
// network. Intercepted and routed through respondWith, a POST would die as
// "FetchEvent.respondWith received an error: TypeError: Load failed".
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;                    // POSTs & co: not ours
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;           // cross-origin: not ours

  e.respondWith(
    caches.match(e.request).then(cached => cached ||
      fetch(e.request).catch(() => cached)                   // last-resort fallback
    )
  );
});
