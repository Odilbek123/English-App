// Слова: работа без интернета и быстрые обновления.
// Страница отдаётся из сохранённой копии сразу, свежая версия проверяется в фоне;
// если она отличается, открытому приложению приходит сигнал перезагрузиться.
const CACHE = 'slova-v2';
const ASSETS = ['./', 'manifest.webmanifest', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Новая версия могла скачаться раньше, чем страница успела открыться, поэтому
// страница при запуске сама спрашивает, было ли обновление (сообщение ready).
let changedAt = 0;
async function notify() {
  changedAt = Date.now();
  const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  if (list.length) changedAt = 0;
  for (const c of list) c.postMessage({ type: 'update' });
}
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'ready' && changedAt && Date.now() - changedAt < 60000) {
    changedAt = 0;
    e.source && e.source.postMessage({ type: 'update' });
  }
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  const isPage = req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('/index.html');

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const key = isPage ? './' : req;
    const hit = await cache.match(key, { ignoreSearch: true });
    const old = hit ? hit.clone() : null;

    const refresh = (async () => {
      try {
        const res = await fetch(isPage ? new Request('./', { cache: 'no-cache' }) : req);
        if (!res || !res.ok) return hit || res;
        if (isPage && old) {
          const [a, b] = await Promise.all([res.clone().text(), old.text()]);
          await cache.put(key, res.clone());
          if (a !== b) await notify();
        } else {
          await cache.put(key, res.clone());
        }
        return res;
      } catch (err) {
        return hit || Response.error();
      }
    })();

    if (hit) { e.waitUntil(refresh); return hit; }
    return refresh;
  })());
});
