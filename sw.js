const CACHE_NAME = 'pdw-cache-v9';

// 更新チェック対象となるコアファイル（更新検知時のみ差分DL＆一括置換）
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
  './assets/font/LightNovelPOPv2.otf',
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

function getNormalizedPathnameSet(urls) {
  const set = new Set();
  urls.forEach((u) => {
    try {
      set.add(new URL(u, self.location.href).pathname);
    } catch (_) {}
  });
  return set;
}

const CORE_PATH_SET = getNormalizedPathnameSet(CORE_FILES);
const PRECACHE_PATH_SET = getNormalizedPathnameSet(PRECACHE_URLS);

async function migrateFromOldCachesIfNeeded(targetCache) {
  try {
    const names = await caches.keys();
    const oldNames = names.filter((n) => n !== CACHE_NAME);
    if (oldNames.length === 0) return;

    for (const oldName of oldNames) {
      const oldCache = await caches.open(oldName);
      await Promise.allSettled(
        PRECACHE_URLS.map(async (url) => {
          try {
            // バージョン切替時はコアファイルだけ引き継がず最新を取り直す
            const path = new URL(url, self.location.href).pathname;
            if (CORE_PATH_SET.has(path)) return;
            const existing = await targetCache.match(url, { ignoreSearch: true });
            if (existing) return;
            const oldRes = await oldCache.match(url, { ignoreSearch: true });
            if (oldRes && oldRes.ok) {
              await targetCache.put(url, oldRes.clone());
            }
          } catch (_) {}
        })
      );
    }
  } catch (_) {}
}

async function cleanupObsoleteEntries(cache) {
  try {
    const keys = await cache.keys();
    await Promise.allSettled(
      keys.map(async (req) => {
        try {
          const u = new URL(req.url);
          if (u.origin === self.location.origin && !PRECACHE_PATH_SET.has(u.pathname)) {
            await cache.delete(req);
          }
        } catch (_) {}
      })
    );
  } catch (_) {}
}

async function replaceCachedEntry(cache, url, response) {
  try {
    await cache.delete(url, { ignoreSearch: true });
  } catch (_) {}
  await cache.put(url, response);
}

async function precacheMissingOrAll(cache, urls, forceCoreNetwork = false) {
  await Promise.allSettled(
    urls.map(async (url) => {
      try {
        const path = new URL(url, self.location.href).pathname;
        const isCore = CORE_PATH_SET.has(path);
        if (!(forceCoreNetwork && isCore)) {
          const existing = await cache.match(url, { ignoreSearch: true });
          if (existing) return;
        }
        const response = await fetch(new Request(url, { cache: 'no-store' }));
        if (response && response.ok) {
          await replaceCachedEntry(cache, url, response);
        }
      } catch (err) {
        console.warn('[SW] Precache skipped:', url, err);
      }
    })
  );
}

function headHeadersMatch(cachedRes, headRes) {
  try {
    const etagA = cachedRes.headers.get('ETag');
    const etagB = headRes.headers.get('ETag');
    if (etagA && etagB) return etagA === etagB;

    const lmA = cachedRes.headers.get('Last-Modified');
    const lmB = headRes.headers.get('Last-Modified');
    if (lmA && lmB) {
      return lmA === lmB;
    }
    return null;
  } catch (_) {
    return null;
  }
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
  let downloadFailed = false;
  const pendingReplacements = [];

  await Promise.allSettled(
    CORE_FILES.map(async (url) => {
      try {
        const cached = await cache.match(url, { ignoreSearch: true });
        if (cached) hadAnyCachedCore = true;

        // 既存キャッシュがある場合はまず軽量なHEADで更新有無を確認し、未更新なら本体DLを飛ばす
        if (cached) {
          const headCtrl = new AbortController();
          const headTimer = setTimeout(() => headCtrl.abort(), 2500);
          try {
            const headRes = await fetch(new Request(url, { method: 'HEAD', cache: 'no-store' }), {
              signal: headCtrl.signal
            });
            clearTimeout(headTimer);
            if (headRes && headRes.ok) {
              const matched = headHeadersMatch(cached, headRes);
              if (matched === true) return;
            }
          } catch (_) {
            clearTimeout(headTimer);
          }
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4000);
        const netRes = await fetch(new Request(url, { cache: 'no-store' }), {
          signal: controller.signal
        });
        clearTimeout(timer);

        if (!netRes || !netRes.ok) {
          if (cached) downloadFailed = true;
          return;
        }

        if (!cached) {
          pendingReplacements.push({ url, response: netRes });
          return;
        }

        const diff = await responsesAreDifferent(cached, netRes);
        if (diff) {
          hasUpdate = true;
          pendingReplacements.push({ url, response: netRes });
        }
      } catch (_) {
        // ネットワークエラーやオフライン時は一括置換を行わず既存キャッシュを維持する
        downloadFailed = true;
      }
    })
  );

  // 差分ファイルのダウンロードが全て揃った時だけ一括でキャッシュを置換する（新旧混在を防止）
  if (!downloadFailed && pendingReplacements.length > 0) {
    await Promise.allSettled(
      pendingReplacements.map(({ url, response }) => replaceCachedEntry(cache, url, response))
    );
  } else {
    hasUpdate = false;
  }

  // 未キャッシュのリソース補完はバックグラウンドで実行し、起動待ち時間を伸ばさない
  precacheMissingOrAll(cache, PRECACHE_URLS, false).catch(() => {});

  if (hasUpdate) {
    cleanupObsoleteEntries(cache).catch(() => {});
  }

  return { updated: hasUpdate && hadAnyCachedCore };
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await migrateFromOldCachesIfNeeded(cache);
      await precacheMissingOrAll(cache, PRECACHE_URLS, true);
      await cleanupObsoleteEntries(cache);
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

      // 1. ストレージ上のキャッシュを優先（更新は起動時チェックで差分置換済み）
      const cachedResponse = await cache.match(event.request, { ignoreSearch: false })
        || await cache.match(event.request, { ignoreSearch: true });
      if (cachedResponse) {
        return cachedResponse;
      }

      // ナビゲーション時はクエリ違いでも index.html / ./ キャッシュを利用
      if (event.request.mode === 'navigate') {
        const navCached = await cache.match('./index.html', { ignoreSearch: true })
          || await cache.match('./', { ignoreSearch: true });
        if (navCached) return navCached;
      }

      // 2. 未キャッシュのリソースはネットワークから取得してキャッシュに保存
      try {
        const networkResponse = await fetch(event.request);
        if (networkResponse && networkResponse.status === 200) {
          await replaceCachedEntry(cache, event.request, networkResponse.clone());
        }
        return networkResponse;
      } catch (error) {
        if (event.request.mode === 'navigate') {
          const fallbackPage = await cache.match('./index.html', { ignoreSearch: true })
            || await cache.match('./', { ignoreSearch: true });
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
