// Офлайн-кэш: приложение открывается даже без интернета.
// После изменений в файлах увеличьте номер версии, чтобы телефоны подтянули обновление.
const CACHE = 'schet108-v3';
const SHELL = [
  './', './index.html', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Firebase и Anthropic API — всегда напрямую в сеть
  if (/googleapis\.com$|firebaseio|anthropic\.com$/.test(url.hostname) && !url.hostname.startsWith('fonts.')) return;

  const ownFile = url.origin === location.origin;
  const font = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!ownFile && !font) return;

  // Свои файлы: сначала сеть (чтобы видеть обновления), без сети — из кэша.
  // Шрифты: сначала кэш.
  e.respondWith(
    font
      ? caches.match(req).then(hit => hit || fetch(req).then(res => {
          const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res;
        }))
      : fetch(req).then(res => {
          const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res;
        }).catch(() => caches.match(req).then(hit => hit || caches.match('./index.html')))
  );
});
