/* GRUENZEUG – Service Worker: offline nutzbar, online immer die neueste Version.
   Vorlage: tools/build.py ersetzt aa89754-20261001230236 und schreibt dist/sw.js. */
const CACHE = 'gruenzeug-aa89754-20261001230236';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(ASSETS.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('gruenzeug-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

/* Netz zuerst (höchstens 4 s warten, dann Speicher): neue Version sofort da, im Funkloch startet die App trotzdem */
function netzZuerst(req) {
  return new Promise((resolve) => {
    let fertig = false;
    const ausCache = () => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('./index.html'));
    const t = setTimeout(() => { ausCache().then((hit) => { if (hit && !fertig) { fertig = true; resolve(hit); } }); }, 4000);
    fetch(new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' })).then((res) => {
      clearTimeout(t);
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}); }
      if (!fertig) { fertig = true; resolve(res); }
    }).catch(() => { clearTimeout(t); ausCache().then((hit) => { if (!fertig) { fertig = true; resolve(hit || Response.error()); } }); });
  });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/version.json') || url.pathname.endsWith('/selftest.js')) return;
  e.respondWith(netzZuerst(req));
});
