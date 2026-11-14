
// ==========================================
// キャラクター定義 & 2-3-3-2アイコン選択 & カスタム画像 & 描画補助
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

// 2・3・3・2 のアイコン配置定義
const CHAR_PICKER_ROWS = [
  ['main00', 'custom'],
  ['sub01', 'sub02', 'sub03'],
  ['enemy01', 'enemy02', 'enemy03'],
  ['enemy04', 'random']
];

const AssetCache = new Map();
const CustomAssets = { chara: null, bg: null, frame: null };
let selectedCharId = localStorage.getItem('pdw_char_id') || 'main00';
let storySelectedCharId = localStorage.getItem('pdw_story_char_id') || (selectedCharId === 'custom' ? 'custom' : 'main00');
let playerCustomName = localStorage.getItem('pdw_player_name') || '';

function getPlayerDisplayName() {
  const trimmed = (playerCustomName || '').trim();
  return trimmed || 'マイキャラ';
}

function onPlayerNameInput(val) {
  playerCustomName = (val || '').slice(0, 10);
  localStorage.setItem('pdw_player_name', playerCustomName);
  const settingsInput = document.getElementById('settings-player-name');
  if (settingsInput && settingsInput.value !== playerCustomName) {
    settingsInput.value = playerCustomName;
  }
  document.querySelectorAll('.char-name-inline-input').forEach(el => {
    if (el.value !== playerCustomName) el.value = playerCustomName;
  });
  document.querySelectorAll('.char-icon-btn[data-char-id="custom"] .char-icon-name').forEach(el => {
    el.innerText = CustomAssets.chara ? getPlayerDisplayName() : 'マイ(未設定)';
  });
}

function getCharacterById(id) {
  if (id === 'custom') {
    return {
      id: 'custom',
      name: getPlayerDisplayName(),
      role: 'custom',
      file: CustomAssets.chara ? CustomAssets.chara.dataUrl : 'assets/img/chara/main00.png',
      color: '#4ecca3'
    };
  }
  if (id === 'random') {
    return {
      id: 'random',
      name: 'ランダム',
      role: 'random',
      file: '',
      color: '#ffd700'
    };
  }
  return CHARACTERS.find(c => c.id === id) || CHARACTERS[0];
}

function resolvePlayableCharId(charId) {
  if (charId === 'random') {
    const pool = CHARACTERS.map(c => c.id);
    if (CustomAssets.chara) pool.push('custom');
    return pool[Math.floor(Math.random() * pool.length)];
  }
  if (charId === 'custom' && !CustomAssets.chara) {
    return 'main00';
  }
  return charId || 'main00';
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

// --- 2・3・3・2 バストアップアイコン選択GUI ---
function renderCharPicker(containerId, options = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const storyOnly = !!options.storyOnly;

  let currentId;
  if (options.currentId !== undefined) {
    currentId = options.currentId;
  } else if (storyOnly) {
    currentId = (storySelectedCharId === 'custom' && CustomAssets.chara) ? 'custom' : 'main00';
    storySelectedCharId = currentId;
  } else {
    if (selectedCharId === 'custom' && !CustomAssets.chara) {
      selectedCharId = 'main00';
      localStorage.setItem('pdw_char_id', selectedCharId);
    }
    currentId = selectedCharId;
  }

  container.innerHTML = '';

  const titleEl = document.createElement('div');
  titleEl.className = 'char-picker-title';
  titleEl.innerText = options.title || (storyOnly
    ? '使用キャラ選択（ストーリーはフレア / マイ立ち絵のみ）'
    : '使用キャラ選択');
  container.appendChild(titleEl);

  CHAR_PICKER_ROWS.forEach((rowIds) => {
    const rowEl = document.createElement('div');
    rowEl.className = 'char-picker-row';

    rowIds.forEach((cid) => {
      const ch = getCharacterById(cid);
      const isCustomEmpty = (cid === 'custom' && !CustomAssets.chara);
      const isLockedByStory = storyOnly && cid !== 'main00' && cid !== 'custom';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'char-icon-btn';
      btn.dataset.charId = cid;
      if (cid === currentId) btn.classList.add('selected');
      if (isCustomEmpty) btn.classList.add('empty-custom');
      if (isLockedByStory) btn.disabled = true;

      const thumbWrap = document.createElement('div');
      thumbWrap.className = 'char-icon-thumb-wrap';

      if (cid === 'random') {
        const q = document.createElement('div');
        q.className = 'char-icon-random';
        q.innerText = '？';
        thumbWrap.appendChild(q);
      } else {
        const img = document.createElement('img');
        img.className = 'char-icon-img';
        if (cid === 'custom' && CustomAssets.chara) {
          img.src = CustomAssets.chara.dataUrl;
          if (CustomAssets.chara.orientation === 'landscape') {
            img.classList.add('landscape-fit');
          }
        } else {
          img.src = ch.file;
        }
        img.alt = ch.name;
        thumbWrap.appendChild(img);
      }

      const nameEl = document.createElement('div');
      nameEl.className = 'char-icon-name';
      nameEl.innerText = isCustomEmpty ? 'マイ(未設定)' : ch.name;

      btn.appendChild(thumbWrap);
      btn.appendChild(nameEl);

      btn.onclick = () => {
        if (isLockedByStory) return;
        if (isCustomEmpty) {
          showToast('「⚙️設定」からマイ立ち絵を登録すると選べます');
          return;
        }
        if (typeof options.onSelect === 'function') {
          options.onSelect(cid);
        } else if (storyOnly) {
          storySelectedCharId = cid;
          localStorage.setItem('pdw_story_char_id', cid);
        } else {
          selectedCharId = cid;
          localStorage.setItem('pdw_char_id', cid);
        }
        if (typeof SE !== 'undefined') SE.play('cursorMove');
        renderCharPicker(containerId, options.onSelect ? { ...options, currentId: cid } : options);
      };

      rowEl.appendChild(btn);
    });

    container.appendChild(rowEl);
  });

  if (currentId === 'custom' && CustomAssets.chara && !options.hideNameInput) {
    const nameRow = document.createElement('div');
    nameRow.className = 'char-name-inline-row';
    const lbl = document.createElement('span');
    lbl.innerText = 'プレイヤー名:';
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'char-name-inline-input';
    inp.maxLength = 10;
    inp.placeholder = 'マイキャラ';
    inp.value = playerCustomName;
    inp.oninput = (e) => onPlayerNameInput(e.target.value);
    nameRow.appendChild(lbl);
    nameRow.appendChild(inp);
    container.appendChild(nameRow);
  }
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

  let orientation = 'square';
  if (ratio < 0.88) orientation = 'portrait';
  else if (ratio > 1.12) orientation = 'landscape';

  let maxLongEdge = 512;
  let maxBytes = 120 * 1024;
  let preserveAlpha = true;

  if (kind === 'bg') {
    maxLongEdge = orientation === 'portrait' ? 560 : 720;
    maxBytes = 140 * 1024;
    preserveAlpha = false;
  } else if (kind === 'frame') {
    maxLongEdge = 540;
    maxBytes = 120 * 1024;
    preserveAlpha = true;
  } else {
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
      storySelectedCharId = 'custom';
      localStorage.setItem('pdw_char_id', 'custom');
      localStorage.setItem('pdw_story_char_id', 'custom');
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
  if (kind === 'chara') {
    if (selectedCharId === 'custom') {
      selectedCharId = 'main00';
      localStorage.setItem('pdw_char_id', 'main00');
    }
    if (storySelectedCharId === 'custom') {
      storySelectedCharId = 'main00';
      localStorage.setItem('pdw_story_char_id', 'main00');
    }
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
  const nameInput = document.getElementById('settings-player-name');
  if (nameInput) nameInput.value = playerCustomName;
}

function buildThemeForCharacter(charId, customCharaDataUrl = null, includeMyGlobalBgFrame = true, customName = null) {
  const charDef = getCharacterById(charId);
  const charSrc = customCharaDataUrl || charDef.file;
  getCachedImage(charSrc);
  const bgSrc = includeMyGlobalBgFrame && CustomAssets.bg ? CustomAssets.bg.dataUrl : null;
  const frameSrc = includeMyGlobalBgFrame && CustomAssets.frame ? CustomAssets.frame.dataUrl : null;
  if (bgSrc) getCachedImage(bgSrc);
  if (frameSrc) getCachedImage(frameSrc);
  return {
    charId: charDef.id,
    name: customName || charDef.name,
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

// ⑤ 盤面背景キャラを全体表示＆視認性の高い不透明度に調整
function drawBoardBgAddon(ctx, canvas, engine, renderer) {
  const theme = renderer.theme;
  if (!theme) return;
  const W = canvas.width;
  const H = canvas.height;

  // 1. カスタムパズル背景（盤面全体に cover 配置）
  if (theme.bgSrc) {
    const bgImg = getCachedImage(theme.bgSrc);
    if (bgImg) {
      drawImageCover(ctx, bgImg, 0, 0, W, H);
    }
  }

  // 2. 立ち絵（盤面背景全体に映るよう cover 配置、はっきり見える不透明度）
  if (theme.charSrc) {
    const charImg = getCachedImage(theme.charSrc);
    if (charImg) {
      ctx.save();
      ctx.globalAlpha = theme.bgSrc ? 0.65 : 0.75;
      drawImageCover(ctx, charImg, 0, 0, W, H);
      ctx.restore();
    }
  }

  // ブロックの輪郭を損なわない程度の軽い暗めフィルター
  if (theme.bgSrc || theme.charSrc) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
    ctx.fillRect(0, 0, W, H);
  }
}

// ② 対戦相手の盤面上にのみ立ち絵付きカットインを描画（プレイヤー自身はヘッダーバナーに出す）
// ローカル対戦のスキル時（allowBoardCutin）または対戦相手の盤面上に立ち絵付きカットインを描画
function drawBoardFgAddon(ctx, canvas, engine, renderer) {
  const theme = renderer.theme;
  const W = canvas.width;
  const H = canvas.height;

  if ((engine.allowBoardCutin || !engine.isPlayer) && engine.cutinTimer && engine.cutinTimer > 0) {
    engine.cutinTimer--;
    const progress = engine.cutinTimer / (engine.cutinMax || 50);
    const alpha = Math.min(1, progress * 2.5);
    const slideX = progress > 0.8 ? (progress - 0.8) * 5 * W : 0;

    ctx.save();
    ctx.globalAlpha = alpha * 0.94;
    const bandY = H * 0.28;
    const bandH = 96;

    ctx.fillStyle = theme ? theme.color : '#ff007f';
    ctx.fillRect(0, bandY, W, bandH);
    ctx.fillStyle = 'rgba(10, 15, 30, 0.86)';
    ctx.fillRect(0, bandY + 4, W, bandH - 8);

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
        const drawW = 88;
        const drawH = drawW * (cropH / iw);
        ctx.drawImage(charImg, 0, 0, iw, cropH, 6 + slideX, bandY + 4, drawW, drawH);
        ctx.restore();
      }
    }

    ctx.fillStyle = '#ffffff';
    ctx.font = '900 17px sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 4;
    const label = engine.cutinText || 'CHAIN!';
    ctx.strokeText(label, W - 10 + slideX, bandY + bandH / 2);
    ctx.fillText(label, W - 10 + slideX, bandY + bandH / 2);
    ctx.restore();
  }

  // カスタムフレーム画像（最前面枠）
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
  refreshCustomAssetsUI();
}
