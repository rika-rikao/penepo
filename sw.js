const CACHE_NAME = 'pdw-cache-v8';

// 更新チェック対象となるコアファイル（サーバー更新検知時に差分DL＆キャッシュ置換）
const CORE_FILES = [
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
  './js/op.js',
  './js/main.js'
];

// オフラインでも遊べるよう事前キャッシュするファイル一覧
const PRECACHE_URLS = [
  ...CORE_FILES,
  './assets/se/cursor_move.m4a',
  './assets/se/select.m4a',
  './assets/se/cancel.m4a',
  './assets/se/skill_filled.m4a',
  './assets/se/falled_block.m4a',
  './assets/se/garbage_block_erase.m4a',
  './assets/se/nomal_block_erase.m4a',
  './assets/se/Fanfare_min.m4a',
  './assets/se/Fanfare_mid.m4a',
  './assets/se/Fanfare_max.m4a',
  './assets/bgm/main00.m4a',
  './assets/bgm/panic00.m4a',
  './assets/bgm/op.m4a',
  './assets/bgm/mode_select.m4a',
  './assets/img/system/main.png',
  './assets/img/chara/nomal/フレア.png',
  './assets/img/chara/nomal/しずく.png',
  './assets/img/chara/nomal/シルル.png',
  './assets/img/chara/nomal/ブープル.png',
  './assets/img/chara/nomal/ゴースト.png',
  './assets/img/chara/nomal/コーレム.png',
  './assets/img/chara/nomal/デビビ.png',
  './assets/img/chara/nomal/マーオ.png',
  './assets/img/chara/lose/フレア_lose.png',
  './assets/img/chara/lose/しずく_lose.png',
  './assets/img/chara/lose/シルル_lose.png',
  './assets/img/chara/lose/ブープル_lose.png',
  './assets/img/chara/lose/ゴースト_lose.png',
  './assets/img/chara/lose/コーレム_lose.png',
  './assets/img/chara/lose/デビビ_lose.png',
  './assets/img/chara/lose/マーオ_lose.png',
  './assets/img/chara_frame/フレア_フレーム.png',
  './assets/img/chara_frame/しずく_フレーム.png',
  './assets/img/chara_frame/シルル_フレーム.png',
  './assets/img/chara_frame/ブープル_フレーム.png',
  './assets/img/chara_frame/ゴースト_フレーム.png',
  './assets/img/chara_frame/コーレム_フレーム.png',
  './assets/img/chara_frame/デビビ_フレーム.png',
  './assets/img/chara_frame/マーオ_フレーム.png',
  './assets/img/chara_pazzle_back/フレア_背景.png',
  './assets/img/chara_pazzle_back/しずく_背景.png',
  './assets/img/chara_pazzle_back/シルル_背景.png',
  './assets/img/chara_pazzle_back/ブープル_背景.png',
  './assets/img/chara_pazzle_back/ゴースト_背景.png',
  './assets/img/chara_pazzle_back/コーレム_背景.png',
  './assets/img/chara_pazzle_back/デビビ_背景.png',
  './assets/img/chara_pazzle_back/マーオ_背景.png',
  './assets/img/chara_story_back/フレア_s背景.png',
  './assets/img/chara_story_back/しずく_s背景.png',
  './assets/img/chara_story_back/シルル_s背景.png',
  './assets/img/chara_story_back/ブープル_s背景.png',
  './assets/img/chara_story_back/ゴースト_s背景.png',
  './assets/img/chara_story_back/コーレム_s背景.png',
  './assets/img/chara_story_back/デビビ_s背景.png',
  './assets/img/chara_story_back/マーオ_s背景.png',
  './icon-192.png',
  './icon-512.png'
];

async function precacheMissingOrAll(cache, urls, forceNetwork = false) {
  await Promise.allSettled(
    urls.map(async (url) => {
      try {
        if (!forceNetwork) {
          const existing = await cache.match(url);
          if (existing) return;
        }
        const response = await fetch(new Request(url, { cache: 'no-store' }));
        if (response && response.ok) {
          await cache.put(url, response);
        }
      } catch (err) {
        console.warn('[SW] Precache skipped:', url, err);
      }
    })
  );
}

async function responsesAreDifferent(resA, resB) {
  try {
    const etagA = resA.headers.get('ETag');
    const etagB = resB.headers.get('ETag');
    if (etagA && etagB) return etagA !== etagB;

    const bufA = new Uint8Array(await resA.clone().arrayBuffer());
    const bufB = new Uint8Array(await resB.clone().arrayBuffer());
    if (bufA.length !== bufB.length) return true;
    for (let i = 0; i < bufA.length; i++) {
      if (bufA[i] !== bufB[i]) return true;
    }
    return false;
  } catch (_) {
    return false;
  }
}

async function checkAndUpdateCoreFiles() {
  const cache = await caches.open(CACHE_NAME);
  let hasUpdate = false;
  let hadAnyCachedCore = false;

  await Promise.allSettled(
    CORE_FILES.map(async (url) => {
      try {
        const cached = await cache.match(url);
        if (cached) hadAnyCachedCore = true;

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3500);
        const netRes = await fetch(new Request(url, { cache: 'no-store' }), {
          signal: controller.signal
        });
        clearTimeout(timer);

        if (!netRes || !netRes.ok) return;

        if (!cached) {
          await cache.put(url, netRes);
          return;
        }

        const diff = await responsesAreDifferent(cached, netRes);
        if (diff) {
          hasUpdate = true;
          await cache.put(url, netRes);
        }
      } catch (_) {
        // オフラインやタイムアウト時は既存キャッシュのまま起動させる
      }
    })
  );

  // 未キャッシュのメディアもバックグラウンドで補完
  if (hasUpdate || !hadAnyCachedCore) {
    await precacheMissingOrAll(cache, PRECACHE_URLS, false);
  }

  return { updated: hasUpdate && hadAnyCachedCore };
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => precacheMissingOrAll(cache, PRECACHE_URLS, true))
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

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  if (data.type === 'CHECK_AND_UPDATE') {
    event.waitUntil((async () => {
      const result = await checkAndUpdateCoreFiles();
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage(result);
      }
    })());
  }
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  // PeerJSなどの外部CDNはService Workerを通さずブラウザ標準の通信に任せる
  if (requestUrl.origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      // 1. ストレージ上のキャッシュを優先（更新は起動時チェックで反映済み）
      const cachedResponse = await cache.match(event.request, { ignoreSearch: false });
      if (cachedResponse) {
        return cachedResponse;
      }

      // ナビゲーション時はクエリ違いでも index.html / ./ キャッシュを利用
      if (event.request.mode === 'navigate') {
        const navCached = await cache.match('./index.html') || await cache.match('./');
        if (navCached) return navCached;
      }

      // 2. 未キャッシュのリソースはネットワークから取得してキャッシュに保存
      try {
        const networkResponse = await fetch(event.request);
        if (networkResponse && networkResponse.status === 200) {
          await cache.put(event.request, networkResponse.clone());
        }
        return networkResponse;
      } catch (error) {
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