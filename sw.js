const CACHE_NAME = 'pdw-cache-v5';

// オフラインでも全モード（ストーリー・練習・COM戦）を遊べるように事前キャッシュするファイル
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './css/addon.css',
  './js/config.js',
  './js/assets.js',
  './js/engine.js',
  './js/cheat.js',
  './js/network.js',
  './js/story.js',
  './js/main.js',
  './assets/se/cursor_move.m4a',
  './assets/se/falled_block.m4a',
  './assets/se/garbage_block_erase.m4a',
  './assets/se/nomal_block_erase.m4a',
  './assets/se/Fanfare_min.m4a',
  './assets/se/Fanfare_mid.m4a',
  './assets/se/Fanfare_max.m4a',
  './assets/bgm/main00.m4a',
  './assets/bgm/panic00.m4a',
  './assets/img/chara/main00.png',
  './assets/img/chara/sub01.png',
  './assets/img/chara/sub02.png',
  './assets/img/chara/sub03.png',
  './assets/img/chara/enemy01.png',
  './assets/img/chara/enemy02.png',
  './assets/img/chara/enemy03.png',
  './assets/img/chara/enemy04.png',
  './assets/img/icon-192.png',
  './assets/img/icon-512.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // 未配置のファイル（アイコン等）があってもSWインストール全体が失敗しないよう個別にキャッシュ
      await Promise.allSettled(
        PRECACHE_URLS.map(async (url) => {
          try {
            const response = await fetch(new Request(url, { cache: 'reload' }));
            if (response && response.ok) {
              await cache.put(url, response);
            }
          } catch (err) {
            console.warn('[SW] Precache skipped:', url, err);
          }
        })
      );
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  // PeerJSなどの外部CDNはService Workerを通さずブラウザ標準の通信に任せる
  if (requestUrl.origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        // サーバー優先（HTTPキャッシュで古いJSを掴まないようno-cacheでサーバーへ再検証）
        const networkResponse = await fetch(event.request.url, { cache: 'no-cache' });
        if (networkResponse && networkResponse.status === 200) {
          await cache.put(event.request, networkResponse.clone());
          return networkResponse;
        }
        // サーバー側で一時エラー等が出た場合もキャッシュがあればフォールバック
        const cachedFallback = await cache.match(event.request);
        if (cachedFallback) return cachedFallback;
        return networkResponse;
      } catch (error) {
        // オフライン・通信不能時はキャッシュから返す
        const cachedResponse = await cache.match(event.request);
        if (cachedResponse) return cachedResponse;

        // ページ遷移（クエリ付きURL等）で直接ヒットしない場合は index.html を返す
        if (event.request.mode === 'navigate') {
          const fallbackPage = await cache.match('./index.html') || await cache.match('./');
          if (fallbackPage) return fallbackPage;
        }

        return new Response('Offline', {
          status: 503,
          statusText: 'Service Unavailable'
        });
      }
    })()
  );
});
