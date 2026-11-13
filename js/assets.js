// ==========================================
// キャラクター定義 & カスタム画像(アス比判別圧縮 + IndexedDB) & 描画補助
// ==========================================
const CHARACTERS = [
  { id: 'main00', name: 'フレア',   role: 'main',  file: 'assets/img/chara/main00.png',  color: '#ff3366' },
  { id: 'sub01',  name: 'しずく',   role: 'sub',   file: 'assets/img/chara/sub01.png',   color: '#00d4ff' },
  { id: 'sub02',  name: 'シルル',   role: 'sub',   file: 'assets/img/chara/sub02.png',   color: '#00e676' },
  { id: 'sub03',  name: 'ブープル', role: 'sub',   file: 'assets/img/chara/sub03.png',   color: '#ffd700' },
  { id: 'enemy01',name: 'ゴースト', role: 'enemy', file: 'assets/img/chara/enemy01.png', color: '#9d00ff' },
  { id: 'enemy02',name: 'コーレム', role: 'enemy', file: 'assets/img/chara/enemy02.png', color: '#ff9100' },
  { id: 'enemy03',name: 'デビビ',   role: 'enemy', file: 'assets/img/chara/enemy03.png', color: '#e94560' },
  { id: 'enemy04',name: 'マーオ',   role: 'enemy', file: 'assets/img/chara/enemy04.png', color: '#ff007f' }
];

const AssetCache = new Map();
const CustomAssets = { chara: null, bg: null, frame: null };
let selectedCharId = localStorage.getItem('pdw_char_id') || 'main00';

function getCharacterById(id) {
  if (id === 'custom') {
    return {
      id: 'custom',
      name: 'マイキャラ',
      role: 'custom',
      file: CustomAssets.chara ? CustomAssets.chara.dataUrl : 'assets/img/chara/main00.png',
      color: '#4ecca3'
    };
  }
  return CHARACTERS.find(c => c.id === id) || CHARACTERS[0];
}

function getCachedImage(src) {
  if (!src) return null;
  if (AssetCache.has(src)) {
    const entry = AssetCache.get(src);
    return entry.loaded ? entry.img : null;
  }
  const entry = { img: new Image(), loaded: false, error: false };
  entry.img.onload = () => { entry.loaded = true; };
  entry.img.onerror = () => { entry.error = true; };
  entry.img.src = src;
  AssetCache.set(src, entry);
  return null;
}

function preloadDefaultCharImages() {
  CHARACTERS.forEach(c => getCachedImage(c.file));
}

// --- IndexedDB 管理 ---
const ASSET_DB_NAME = 'pdw_custom_assets_db';
const ASSET_STORE_NAME = 'assets';

function openAssetDB() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) { reject(new Error('IndexedDB unsupported')); return; }
    const req = indexedDB.open(ASSET_DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(ASSET_STORE_NAME)) {
        db.createObjectStore(ASSET_STORE_NAME, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveCustomAssetDB(key, record) {
  const db = await openAssetDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ASSET_STORE_NAME, 'readwrite');
    tx.objectStore(ASSET_STORE_NAME).put({ key, ...record });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteCustomAssetDB(key) {
  const db = await openAssetDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ASSET_STORE_NAME, 'readwrite');
    tx.objectStore(ASSET_STORE_NAME).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadAllCustomAssets() {
  try {
    const db = await openAssetDB();
    const items = await new Promise((resolve, reject) => {
      const tx = db.transaction(ASSET_STORE_NAME, 'readonly');
      const req = tx.objectStore(ASSET_STORE_NAME).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    items.forEach(item => {
      if (item && item.key && item.dataUrl) {
        CustomAssets[item.key] = item;
        getCachedImage(item.dataUrl);
      }
    });
  } catch (e) {
    console.warn('CustomAssets load skip:', e);
  }
}

// --- アスペクト比識別＆自動圧縮 ---
function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function compressImageSmart(file, kind) {
  const img = await loadImageFromFile(file);
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  const ratio = srcW / Math.max(1, srcH);

  // 縦長 / 横長 / 正方形 を識別
  let orientation = 'square';
  if (ratio < 0.88) orientation = 'portrait';
  else if (ratio > 1.12) orientation = 'landscape';

  // 種類ごとの推奨最大長辺・最大バイト数（P2P転送負荷対策含む）
  let maxLongEdge = 512;
  let maxBytes = 120 * 1024;
  let preserveAlpha = true;

  if (kind === 'bg') {
    // 背景は盤面(216x459)用。縦長は高さ基準、横長・正方形は盤面高さ以上の長辺を確保して鮮明さを維持
    maxLongEdge = orientation === 'portrait' ? 560 : 720;
    maxBytes = 140 * 1024;
    preserveAlpha = false;
  } else if (kind === 'frame') {
    maxLongEdge = 540;
    maxBytes = 120 * 1024;
    preserveAlpha = true;
  } else {
    // 立ち絵（P2Pで相手にも送るため軽量に圧縮）
    maxLongEdge = orientation === 'landscape' ? 460 : 500;
    maxBytes = 95 * 1024;
    preserveAlpha = true;
  }

  let scale = Math.min(1, maxLongEdge / Math.max(srcW, srcH));
  const mime = preserveAlpha ? 'image/webp' : 'image/jpeg';
  let quality = 0.82;
  let dataUrl = '';
  let outW = srcW, outH = srcH;

  const cvs = document.createElement('canvas');
  const ctx = cvs.getContext('2d');

  for (let attempt = 0; attempt < 5; attempt++) {
    outW = Math.max(1, Math.round(srcW * scale));
    outH = Math.max(1, Math.round(srcH * scale));
    cvs.width = outW;
    cvs.height = outH;
    ctx.clearRect(0, 0, outW, outH);
    if (!preserveAlpha) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, outW, outH);
    }
    ctx.drawImage(img, 0, 0, outW, outH);

    dataUrl = cvs.toDataURL(mime, quality);
    // WebP非対応ブラウザフォールバック
    if (preserveAlpha && !dataUrl.startsWith('data:image/webp')) {
      dataUrl = cvs.toDataURL('image/png');
    }

    const approxBytes = Math.floor((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75);
    if (approxBytes <= maxBytes) break;

    quality = Math.max(0.45, quality - 0.12);
    scale *= 0.84;
  }

  return {
    dataUrl,
    width: outW,
    height: outH,
    orientation,
    name: file.name
  };
}

async function handleCustomAssetUpload(kind, inputEl) {
  const file = inputEl.files && inputEl.files[0];
  if (!file) return;
  try {
    showToast('画像を最適化して保存中...');
    const record = await compressImageSmart(file, kind);
    CustomAssets[kind] = record;
    AssetCache.delete(record.dataUrl);
    getCachedImage(record.dataUrl);
    await saveCustomAssetDB(kind, record);
    if (kind === 'chara') {
      selectedCharId = 'custom';
      localStorage.setItem('pdw_char_id', 'custom');
      syncCharSelectUI();
    }
    refreshCustomAssetsUI();
    showToast(`${kind === 'chara' ? '立ち絵' : kind === 'bg' ? '背景' : 'フレーム'}を保存しました (${record.width}x${record.height})`);
  } catch (e) {
    console.error(e);
    showToast('画像の読み込みに失敗しました');
  } finally {
    inputEl.value = '';
  }
}

async function clearCustomAsset(kind) {
  CustomAssets[kind] = null;
  await deleteCustomAssetDB(kind).catch(() => {});
  if (kind === 'chara' && selectedCharId === 'custom') {
    selectedCharId = 'main00';
    localStorage.setItem('pdw_char_id', 'main00');
    syncCharSelectUI();
  }
  refreshCustomAssetsUI();
  showToast('リセットしました');
}

function refreshCustomAssetsUI() {
  ['chara', 'bg', 'frame'].forEach(kind => {
    const thumb = document.getElementById(`custom-${kind}-thumb`);
    const info = document.getElementById(`custom-${kind}-info`);
    const data = CustomAssets[kind];
    if (thumb) {
      thumb.src = data ? data.dataUrl : '';
      thumb.style.visibility = data ? 'visible' : 'hidden';
    }
    if (info) {
      info.innerText = data ? `${data.width}×${data.height} (${data.orientation})` : '未設定 (標準)';
    }
  });
}

function syncCharSelectUI() {
  const sel = document.getElementById('player-char-select');
  if (!sel) return;
  const hasCustom = !!CustomAssets.chara;
  const customOpt = sel.querySelector('option[value="custom"]');
  if (customOpt) {
    customOpt.disabled = !hasCustom;
    customOpt.text = hasCustom ? 'マイ立ち絵 (カスタム)' : 'マイ立ち絵 (設定で登録)';
  }
  if (selectedCharId === 'custom' && !hasCustom) {
    selectedCharId = 'main00';
    localStorage.setItem('pdw_char_id', 'main00');
  }
  sel.value = selectedCharId;
}

function onPlayerCharChange(val) {
  selectedCharId = val;
  localStorage.setItem('pdw_char_id', val);
}

function buildThemeForCharacter(charId, customCharaDataUrl = null, includeMyGlobalBgFrame = true) {
  const charDef = getCharacterById(charId);
  const charSrc = customCharaDataUrl || charDef.file;
  getCachedImage(charSrc);
  const bgSrc = includeMyGlobalBgFrame && CustomAssets.bg ? CustomAssets.bg.dataUrl : null;
  const frameSrc = includeMyGlobalBgFrame && CustomAssets.frame ? CustomAssets.frame.dataUrl : null;
  if (bgSrc) getCachedImage(bgSrc);
  if (frameSrc) getCachedImage(frameSrc);
  return {
    charId: charDef.id,
    name: charDef.name,
    color: charDef.color,
    charSrc,
    bgSrc,
    frameSrc
  };
}

// --- Canvas 描画補助（縦横アス比対応） ---
function drawImageCover(ctx, img, x, y, w, h) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const scale = Math.max(w / iw, h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function drawImageContain(ctx, img, x, y, w, h, alignBottom = false) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const scale = Math.min(w / iw, h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  const dx = x + (w - dw) / 2;
  const dy = alignBottom ? (y + h - dh) : (y + (h - dh) / 2);
  ctx.drawImage(img, dx, dy, dw, dh);
}

function drawBoardBgAddon(ctx, canvas, engine, renderer) {
  const theme = renderer.theme;
  if (!theme) return;
  const W = canvas.width;
  const H = canvas.height;

  // 1. カスタムパズル背景（アスペクト比維持 cover）
  if (theme.bgSrc) {
    const bgImg = getCachedImage(theme.bgSrc);
    if (bgImg) {
      drawImageCover(ctx, bgImg, 0, 0, W, H);
    }
  }

  // 2. 立ち絵（盤面後ろに半透明配置・アスペクト比維持 contain）
  if (theme.charSrc) {
    const charImg = getCachedImage(theme.charSrc);
    if (charImg) {
      ctx.save();
      ctx.globalAlpha = 0.36;
      drawImageContain(ctx, charImg, 4, 16, W - 8, H - 24, true);
      ctx.restore();
    }
  }

  // ブロックの視認性を保つための半透明フィルター
  if (theme.bgSrc || theme.charSrc) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
    ctx.fillRect(0, 0, W, H);
  }
}

function drawBoardFgAddon(ctx, canvas, engine, renderer) {
  const theme = renderer.theme;
  const W = canvas.width;
  const H = canvas.height;

  // 1. 連鎖・スキル発動時のカットイン演出
  if (engine.cutinTimer && engine.cutinTimer > 0) {
    engine.cutinTimer--;
    const progress = engine.cutinTimer / (engine.cutinMax || 45);
    const alpha = Math.min(1, progress * 2.5);
    const slideX = progress > 0.8 ? (progress - 0.8) * 5 * W : 0;

    ctx.save();
    ctx.globalAlpha = alpha * 0.92;
    const bandY = H * 0.30;
    const bandH = 92;

    ctx.fillStyle = theme ? theme.color : '#ff007f';
    ctx.fillRect(0, bandY, W, bandH);
    ctx.fillStyle = 'rgba(10, 15, 30, 0.82)';
    ctx.fillRect(0, bandY + 4, W, bandH - 8);

    // 立ち絵の上半分（バストアップ風）を帯内にクリップ描画
    if (theme && theme.charSrc) {
      const charImg = getCachedImage(theme.charSrc);
      if (charImg) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, bandY + 4, W, bandH - 8);
        ctx.clip();
        const iw = charImg.naturalWidth || charImg.width;
        const ih = charImg.naturalHeight || charImg.height;
        const cropH = ih > iw * 1.1 ? ih * 0.55 : ih;
        const drawW = 86;
        const drawH = drawW * (cropH / iw);
        ctx.drawImage(charImg, 0, 0, iw, cropH, 6 + slideX, bandY + 4, drawW, drawH);
        ctx.restore();
      }
    }

    ctx.fillStyle = '#ffffff';
    ctx.font = '900 18px sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 4;
    const label = engine.cutinText || 'CHAIN!';
    ctx.strokeText(label, W - 10 + slideX, bandY + bandH / 2);
    ctx.fillText(label, W - 10 + slideX, bandY + bandH / 2);
    ctx.restore();
  }

  // 2. カスタムフレーム画像（最前面枠）
  if (theme && theme.frameSrc) {
    const frameImg = getCachedImage(theme.frameSrc);
    if (frameImg) {
      ctx.drawImage(frameImg, 0, 0, W, H);
    }
  }
}

async function initAssetsSystem() {
  preloadDefaultCharImages();
  await loadAllCustomAssets();
  syncCharSelectUI();
  refreshCustomAssetsUI();
}