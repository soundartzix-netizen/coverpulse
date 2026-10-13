// CoverPulse のサービスワーカー
// ・オフラインでも開けるよう、アプリのファイルを手元に保存しておく
// ・起動は保存済みの版ですぐ行い、裏で新しい版を取りに行く（次の起動から反映）
// ・新しい版が見つかったら、開いている画面に「更新あり」を知らせる
const CACHE = 'coverpulse-v1';
const FILES = ['./', './index.html', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-192.png', './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// 同じ版かどうかを、サーバーが付ける目印（ETag / 更新日時）で見分ける
const tag = r => r && (r.headers.get('etag') || r.headers.get('last-modified') || '');

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const isPage = req.mode === 'navigate';
  const key = isPage ? './index.html' : req;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(key, { ignoreSearch: isPage });
    const fresh = fetch(req, { cache: 'no-cache' }).then(async res => {
      if (res.ok) {
        if (isPage && cached && tag(cached) && tag(res) && tag(cached) !== tag(res)) {
          const all = await self.clients.matchAll({ type: 'window' });
          all.forEach(c => c.postMessage({ type: 'update-ready' }));
        }
        await cache.put(key, res.clone());
      }
      return res;
    }).catch(() => cached || Response.error());
    if (cached) { e.waitUntil(fresh); return cached; }
    return fresh;
  })());
});
