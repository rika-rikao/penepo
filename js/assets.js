// ==========================================
// キャラクター定義 & アイコン選択 & スキルカルーセル & カスタム画像・ボイス・SE・ZIP一括読込 & 描画補助
// ==========================================
const CHARACTERS = [
  { id: 'main00', name: 'フレア',   role: 'main',  file: 'assets/img/chara/main00.png',  color: '#ff3366' },
  { id: 'sub01',  name: 'しずく',   role: 'sub',   file: 'assets/img/chara/sub01.png',   color: '#00d4ff' },
  { id: 'sub02',  name: 'シルル',   role: 'sub',   file: 'assets/img/chara/sub02.png',   color: '#00e676' },
  { id: 'sub03',  name: 'ブープル', role: 'sub',   file: 'assets/img/chara/sub03.png',   color: '#a855f7' },
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

const SKILL_DESCRIPTIONS = {
  erase_color: '盤面にあるマークの中から、ランダムで2種類の色をまとめて消します！ピンチの打開や連鎖のきっかけにぴったりです。',
  erase_rows: '下から1段目・5段目・9段目の横一列をすべて消します！お邪魔ブロックもまとめて消せるのでピンチに強いです。',
  purify_garbage: '盤面のお邪魔ブロックをすべて消して、下の段を2段せり上げたあと通常のブロックに変えます！大逆転が狙えます。',
  corrupt_enemy_row: '相手のブロックがある段をランダムで1段お邪魔に変え、さらに上から幅3のお邪魔ブロックを1段降らせます！'
};

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

// --- バストアップアイコン選択GUI（ストーリー時はフレアとマイ立ち絵のみ表示） ---
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
    ? '使用キャラ選択（フレア / マイ立ち絵）'
    : '使用キャラ選択');
  container.appendChild(titleEl);

  const rowsToRender = storyOnly ? [['main00', 'custom']] : CHAR_PICKER_ROWS;

  rowsToRender.forEach((rowIds) => {
    const rowEl = document.createElement('div');
    rowEl.className = 'char-picker-row';

    rowIds.forEach((cid) => {
      const ch = getCharacterById(cid);
      const isCustomEmpty = (cid === 'custom' && !CustomAssets.chara);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'char-icon-btn';
      btn.dataset.charId = cid;
      if (cid === currentId) btn.classList.add('selected');
      if (isCustomEmpty) btn.classList.add('empty-custom');

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
        if (isCustomEmpty) {
          showToast('「せってい → がぞう」からマイ立ち絵を登録すると選べます');
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

// --- スキルカルーセル & 半透明説明テキストボックス ---
function renderSkillCarousel(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const ids = (typeof SKILL_IDS !== 'undefined') ? SKILL_IDS : ['erase_color', 'erase_rows', 'purify_garbage', 'corrupt_enemy_row'];
  const labels = (typeof SKILL_LABELS !== 'undefined') ? SKILL_LABELS : {
    erase_color: 'マーク全消し',
    erase_rows: '1・5・9段消し',
    purify_garbage: 'お邪魔浄化',
    corrupt_enemy_row: 'お邪魔侵食'
  };

  let curId = (typeof selectedPlayerSkill !== 'undefined') ? selectedPlayerSkill : ids[0];
  let idx = ids.indexOf(curId);
  if (idx === -1) {
    idx = 0;
    curId = ids[0];
  }

  container.innerHTML = '';

  const panel = document.createElement('div');
  panel.className = 'carousel-panel';
  panel.style.borderColor = '#ff007f';

  const row = document.createElement('div');
  row.className = 'carousel-row';

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'carousel-arrow-btn';
  prevBtn.innerText = '◀';
  prevBtn.onclick = () => {
    const nextIdx = (idx - 1 + ids.length) % ids.length;
    if (typeof onPlayerSkillSelectChange === 'function') onPlayerSkillSelectChange(ids[nextIdx]);
    if (typeof SE !== 'undefined') SE.play('cursorMove');
    refreshAllSkillCarousels();
  };

  const body = document.createElement('div');
  body.className = 'carousel-body';
  const title = document.createElement('div');
  title.className = 'carousel-title';
  title.style.color = '#ffd700';
  title.innerText = `⚡ ${labels[curId] || curId}`;
  const sub = document.createElement('div');
  sub.className = 'carousel-sub';
  sub.innerText = `スキル ${idx + 1} / ${ids.length}`;
  body.append(title, sub);

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'carousel-arrow-btn';
  nextBtn.innerText = '▶';
  nextBtn.onclick = () => {
    const nextIdx = (idx + 1) % ids.length;
    if (typeof onPlayerSkillSelectChange === 'function') onPlayerSkillSelectChange(ids[nextIdx]);
    if (typeof SE !== 'undefined') SE.play('cursorMove');
    refreshAllSkillCarousels();
  };

  row.append(prevBtn, body, nextBtn);

  const dots = document.createElement('div');
  dots.className = 'carousel-dots';
  ids.forEach((id, i) => {
    const d = document.createElement('span');
    d.className = 'carousel-dot' + (i === idx ? ' active' : '');
    dots.appendChild(d);
  });

  panel.append(row, dots);

  const descBox = document.createElement('div');
  descBox.className = 'skill-desc-box';
  descBox.innerText = SKILL_DESCRIPTIONS[curId] || '';

  container.append(panel, descBox);
}

function refreshAllSkillCarousels() {
  ['story-skill-picker', 'single-skill-picker', 'com-skill-picker', 'online-skill-picker'].forEach(id => {
    const el = document.getElementById(id);
    if (el && el.style.display !== 'none') {
      renderSkillCarousel(id);
    }
  });
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

function arrayBufferToDataUrl(buffer, mime = 'application/octet-stream') {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

function dataUrlToArrayBuffer(dataUrl) {
  const idx = dataUrl.indexOf(',');
  const base64 = idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
  const binStr = atob(base64);
  const bytes = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) {
    bytes[i] = binStr.charCodeAt(i);
  }
  return bytes.buffer;
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
    for (const item of items) {
      if (!item || !item.key || !item.dataUrl) continue;
      if (item.key.startsWith('voice_')) {
        const vCat = item.key.slice(6);
        if (typeof VOICE !== 'undefined') {
          const buf = dataUrlToArrayBuffer(item.dataUrl);
          await VOICE.setCustomVoice(vCat, buf, { dataUrl: item.dataUrl, name: item.name || vCat, size: buf.byteLength });
        }
      } else if (item.key.startsWith('se_')) {
        const seKey = item.key.slice(3);
        if (typeof SE !== 'undefined') {
          const buf = dataUrlToArrayBuffer(item.dataUrl);
          await SE.setCustomSound(seKey, buf, { dataUrl: item.dataUrl, name: item.name || seKey, size: buf.byteLength });
        }
      } else {
        CustomAssets[item.key] = item;
        getCachedImage(item.dataUrl);
      }
    }
    applyGlobalFrameTheme(CustomAssets.frame ? CustomAssets.frame.dataUrl : null);
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

async function compressImageSmart(file, kind, overrideName = null) {
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
    name: overrideName || file.name || `${kind}.png`
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
    if (kind === 'frame') {
      applyGlobalFrameTheme(record.dataUrl);
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
  if (kind === 'frame') {
    applyGlobalFrameTheme(null);
  }
  refreshCustomAssetsUI();
  showToast('リセットしました');
}

// --- カスタムボイス個別登録・解除・試聴 ---
async function handleCustomVoiceUpload(category, inputEl) {
  const file = inputEl.files && inputEl.files[0];
  if (!file || typeof VOICE === 'undefined') return;
  try {
    const buf = await file.arrayBuffer();
    const mime = file.type || guessMimeFromExt((file.name.split('.').pop() || '').toLowerCase());
    const dataUrl = arrayBufferToDataUrl(buf, mime);
    const ok = await VOICE.setCustomVoice(category, buf, { dataUrl, name: file.name, size: buf.byteLength });
    if (!ok) {
      showToast('非対応の音声ファイルです');
      return;
    }
    await saveCustomAssetDB(`voice_${category}`, { dataUrl, name: file.name });
    refreshCustomAssetsUI();
    const labelMap = { attack: '攻撃(お邪魔)', win: '勝利時', lose: '敗北時' };
    showToast(`カスタムボイス(${labelMap[category] || category})を保存しました`);
  } catch (e) {
    console.error(e);
    showToast('ボイスの読み込みに失敗しました');
  } finally {
    inputEl.value = '';
  }
}

async function clearCustomVoice(category) {
  if (typeof VOICE !== 'undefined') {
    VOICE.clearCustomVoice(category);
  }
  await deleteCustomAssetDB(`voice_${category}`).catch(() => {});
  refreshCustomAssetsUI();
  showToast('カスタムボイスを解除しました');
}

function testCustomVoice(category) {
  if (typeof VOICE === 'undefined') return;
  if (!VOICE.customBuffers[category]) {
    showToast('未設定です');
    return;
  }
  VOICE.play(category, { charId: 'custom', name: getPlayerDisplayName() });
}

async function clearAllCustomSE() {
  if (typeof SE !== 'undefined') {
    const keys = Object.keys(SE.customRawMap);
    for (const k of keys) {
      await deleteCustomAssetDB(`se_${k}`).catch(() => {});
    }
    SE.clearAllCustomSounds();
  }
  refreshCustomAssetsUI();
  showToast('カスタムSEをすべて解除しました');
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
  ['attack', 'win', 'lose'].forEach(cat => {
    const el = document.getElementById(`custom-voice-${cat}-info`);
    if (el && typeof VOICE !== 'undefined') {
      const meta = VOICE.customRawMap[cat];
      el.innerText = meta ? `${meta.name}` : '未設定';
    }
  });
  const seInfo = document.getElementById('custom-se-info');
  if (seInfo && typeof SE !== 'undefined') {
    const keys = Object.keys(SE.customBuffers);
    seInfo.innerText = keys.length > 0 ? `登録済み (${keys.length}件): ${keys.join(', ')}` : '未設定 (標準SE)';
  }
  const nameInput = document.getElementById('settings-player-name');
  if (nameInput) nameInput.value = playerCustomName;
}

// --- 純JS ZIPパーサ＆カスタムセット一括読込 ---
async function extractZipEntries(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);

  let eocdOffset = -1;
  const minPos = Math.max(0, bytes.length - 65558);
  for (let i = bytes.length - 22; i >= minPos; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) throw new Error('ZIPの終端ヘッダが見つかりません');

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const cdOffset = view.getUint32(eocdOffset + 16, true);
  const decoder = new TextDecoder('utf-8');
  const results = [];

  let ptr = cdOffset;
  for (let i = 0; i < totalEntries; i++) {
    if (ptr + 46 > bytes.length || view.getUint32(ptr, true) !== 0x02014b50) break;
    const compMethod = view.getUint16(ptr + 10, true);
    const compSize = view.getUint32(ptr + 20, true);
    const fnameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const localHeaderOffset = view.getUint32(ptr + 42, true);

    const rawName = bytes.subarray(ptr + 46, ptr + 46 + fnameLen);
    const fileName = decoder.decode(rawName);
    ptr += 46 + fnameLen + extraLen + commentLen;

    if (!fileName || fileName.endsWith('/') || fileName.startsWith('__MACOSX/')) continue;
    const baseName = fileName.split('/').pop();
    if (!baseName || baseName.startsWith('.')) continue;

    if (localHeaderOffset + 30 > bytes.length || view.getUint32(localHeaderOffset, true) !== 0x04034b50) continue;
    const lFnameLen = view.getUint16(localHeaderOffset + 26, true);
    const lExtraLen = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + lFnameLen + lExtraLen;
    const compSlice = bytes.subarray(dataStart, dataStart + compSize);

    let fileBuf = null;
    if (compMethod === 0) {
      fileBuf = compSlice.slice().buffer;
    } else if (compMethod === 8) {
      if (typeof DecompressionStream === 'undefined') {
        throw new Error('お使いのブラウザはDeflate展開に対応していません');
      }
      const ds = new DecompressionStream('deflate-raw');
      const writer = ds.writable.getWriter();
      writer.write(compSlice);
      writer.close();
      fileBuf = await new Response(ds.readable).arrayBuffer();
    } else {
      continue;
    }

    results.push({ path: fileName, baseName, buffer: fileBuf });
  }
  return results;
}

function guessMimeFromExt(ext) {
  const map = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
    mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', ogg: 'audio/ogg', opus: 'audio/opus', webm: 'audio/webm'
  };
  return map[ext] || 'application/octet-stream';
}

function matchVoiceCategoryFromPath(lowerPath, lowerStem) {
  const isVoiceDir = lowerPath.includes('voice/');
  if (lowerPath.includes('voice/attack') || lowerStem === 'ata' || lowerStem === 'attack' || lowerStem.endsWith('_ata') || lowerStem.endsWith('_attack')) {
    return 'attack';
  }
  if (lowerPath.includes('voice/win') || lowerStem === 'win' || lowerStem.endsWith('_win')) {
    return 'win';
  }
  if (lowerPath.includes('voice/lose') || lowerStem === 'lose' || lowerStem.endsWith('_lose')) {
    return 'lose';
  }
  if (isVoiceDir) {
    if (lowerStem.includes('ata') || lowerStem.includes('attack')) return 'attack';
    if (lowerStem.includes('win')) return 'win';
    if (lowerStem.includes('lose')) return 'lose';
  }
  return null;
}

function matchSeKeyFromPath(lowerPath, lowerStem) {
  const map = [
    ['countdown_3', ['countdown_3', 'cd_3', 'count_3', 'count3', '3']],
    ['countdown_2', ['countdown_2', 'cd_2', 'count_2', 'count2', '2']],
    ['countdown_1', ['countdown_1', 'cd_1', 'count_1', 'count1', '1']],
    ['countdown_go', ['countdown_go', 'cd_go', 'count_go', 'countgo', 'go']],
    ['countdown', ['countdown']],
    ['cursorMove', ['cursor_move', 'cursormove', 'cursor']],
    ['falledBlock', ['falled_block', 'falledblock', 'falled', 'fall']],
    ['garbageErase', ['garbage_block_erase', 'garbage_erase', 'garbageerase', 'garbage']],
    ['normalErase', ['nomal_block_erase', 'normal_block_erase', 'normal_erase', 'normalerase', 'erase']],
    ['fanfareMin', ['fanfare_min', 'fanfaremin', 'chain4']],
    ['fanfareMid', ['fanfare_mid', 'fanfaremid', 'chain5']],
    ['fanfareMax', ['fanfare_max', 'fanfaremax', 'chain6']],
    ['skill', ['skill_activate', 'skill']]
  ];
  for (const [key, aliases] of map) {
    if (aliases.includes(lowerStem)) return key;
  }
  for (const [key, aliases] of map) {
    if (aliases.some(a => a.length > 2 && (lowerStem.startsWith(a) || lowerPath.includes(`/${a}`)))) {
      return key;
    }
  }
  return null;
}

async function handleCustomZipUpload(inputEl) {
  const file = inputEl.files && inputEl.files[0];
  if (!file) return;
  try {
    showToast('ZIPを展開して読み込み中...');
    const zipBuf = await file.arrayBuffer();
    const entries = await extractZipEntries(zipBuf);
    let loadedImg = 0, loadedVoice = 0, loadedSe = 0, loadedBgm = 0;
    const bgmFiles = [];

    for (const entry of entries) {
      const lowerPath = entry.path.toLowerCase();
      const lowerBase = entry.baseName.toLowerCase();
      const dotIdx = lowerBase.lastIndexOf('.');
      const ext = dotIdx >= 0 ? lowerBase.slice(dotIdx + 1) : '';
      const stem = dotIdx >= 0 ? lowerBase.slice(0, dotIdx) : lowerBase;

      if (lowerBase === 'name.txt') {
        const txt = new TextDecoder('utf-8').decode(entry.buffer).trim().split(/\r?\n/)[0];
        if (txt) onPlayerNameInput(txt);
        continue;
      }
      if (lowerBase === 'meta.json') {
        try {
          const meta = JSON.parse(new TextDecoder('utf-8').decode(entry.buffer));
          if (meta && typeof meta.name === 'string' && meta.name.trim()) {
            onPlayerNameInput(meta.name.trim());
          }
        } catch (_) {}
        continue;
      }

      if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) {
        let kind = null;
        if (stem.includes('chara') || stem.includes('stand') || stem.includes('立ち絵')) kind = 'chara';
        else if (stem.includes('frame') || stem.includes('border') || stem.includes('フレーム')) kind = 'frame';
        else if (stem === 'bg' || stem.includes('background') || stem.includes('背景') || stem.startsWith('bg_')) kind = 'bg';

        if (kind) {
          const blob = new Blob([entry.buffer], { type: guessMimeFromExt(ext) });
          const record = await compressImageSmart(blob, kind, entry.baseName);
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
          if (kind === 'frame') {
            applyGlobalFrameTheme(record.dataUrl);
          }
          loadedImg++;
        }
        continue;
      }

      if (['mp3', 'm4a', 'aac', 'wav', 'ogg', 'opus', 'webm'].includes(ext)) {
        const mime = guessMimeFromExt(ext);
        if (lowerPath.includes('bgm/') || stem.startsWith('bgm')) {
          bgmFiles.push(new File([entry.buffer], entry.baseName, { type: mime }));
          loadedBgm++;
          continue;
        }
        const voiceCat = matchVoiceCategoryFromPath(lowerPath, stem);
        if (voiceCat && typeof VOICE !== 'undefined') {
          const dataUrl = arrayBufferToDataUrl(entry.buffer, mime);
          const ok = await VOICE.setCustomVoice(voiceCat, entry.buffer, {
            dataUrl,
            name: entry.baseName,
            size: entry.buffer.byteLength
          });
          if (ok) {
            await saveCustomAssetDB(`voice_${voiceCat}`, { dataUrl, name: entry.baseName });
            loadedVoice++;
          }
          continue;
        }
        const seKey = matchSeKeyFromPath(lowerPath, stem);
        if (seKey && typeof SE !== 'undefined') {
          const dataUrl = arrayBufferToDataUrl(entry.buffer, mime);
          const ok = await SE.setCustomSound(seKey, entry.buffer, {
            dataUrl,
            name: entry.baseName,
            size: entry.buffer.byteLength
          });
          if (ok) {
            await saveCustomAssetDB(`se_${seKey}`, { dataUrl, name: entry.baseName });
            loadedSe++;
          }
        }
      }
    }

    if (bgmFiles.length > 0 && typeof handleBgmFiles === 'function') {
      handleBgmFiles(bgmFiles);
    }

    refreshCustomAssetsUI();
    const infoEl = document.getElementById('custom-zip-info');
    if (infoEl) {
      infoEl.innerText = `読込完了: 画像${loadedImg} / Voice${loadedVoice} / SE${loadedSe} / BGM${loadedBgm}`;
    }
    showToast(`ZIP読込完了 (画像:${loadedImg}, Voice:${loadedVoice}, SE:${loadedSe}, BGM:${loadedBgm})`);
  } catch (e) {
    console.error(e);
    showToast('ZIPの読み込みに失敗しました: ' + (e.message || ''));
  } finally {
    inputEl.value = '';
  }
}

function buildThemeForCharacter(charId, customCharaDataUrl = null, includeMyGlobalBgFrame = true, customName = null, customFrameDataUrl = null) {
  const charDef = getCharacterById(charId);
  const charSrc = customCharaDataUrl || charDef.file;
  getCachedImage(charSrc);
  const bgSrc = includeMyGlobalBgFrame && CustomAssets.bg ? CustomAssets.bg.dataUrl : null;
  const frameSrc = customFrameDataUrl !== null
    ? customFrameDataUrl
    : (includeMyGlobalBgFrame && CustomAssets.frame ? CustomAssets.frame.dataUrl : null);
  if (bgSrc) getCachedImage(bgSrc);
  if (frameSrc) getCachedImage(frameSrc);
  return {
    charId: charDef.id,
    voiceName: charDef.name,
    name: customName || charDef.name,
    color: charDef.color,
    charSrc,
    bgSrc,
    frameSrc
  };
}

// 盤面外枠のフレームレイヤーを最背面に配置・更新
function applyBoardFrame(wrapperId, frameSrc) {
  const wrapper = document.getElementById(wrapperId);
  if (!wrapper) return;
  let frameLayer = wrapper.querySelector('.board-frame-layer');
  if (!frameLayer) {
    frameLayer = document.createElement('div');
    frameLayer.className = 'board-frame-layer';
    wrapper.insertBefore(frameLayer, wrapper.firstChild);
  }
  if (frameSrc) {
    frameLayer.style.backgroundImage = `url("${frameSrc}")`;
    frameLayer.style.display = 'block';
    wrapper.classList.add('has-custom-frame');
  } else {
    frameLayer.style.backgroundImage = 'none';
    frameLayer.style.display = 'none';
    wrapper.classList.remove('has-custom-frame');
  }
}

// 各種ボタンの背景となる部分へのフレーム適用
function applyGlobalFrameTheme(frameSrc) {
  if (frameSrc) {
    document.documentElement.style.setProperty('--custom-frame-url', `url("${frameSrc}")`);
    document.body.classList.add('has-custom-frame');
  } else {
    document.documentElement.style.removeProperty('--custom-frame-url');
    document.body.classList.remove('has-custom-frame');
  }
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

  if (theme.bgSrc) {
    const bgImg = getCachedImage(theme.bgSrc);
    if (bgImg) {
      drawImageCover(ctx, bgImg, 0, 0, W, H);
    }
  }

  if (theme.charSrc) {
    const charImg = getCachedImage(theme.charSrc);
    if (charImg) {
      ctx.save();
      ctx.globalAlpha = theme.bgSrc ? 0.65 : 0.75;
      drawImageCover(ctx, charImg, 0, 0, W, H);
      ctx.restore();
    }
  }

  if (theme.bgSrc || theme.charSrc) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
    ctx.fillRect(0, 0, W, H);
  }
}

// ② ローカル対戦のスキル時（allowBoardCutin）または対戦相手の盤面上に立ち絵付きカットインを描画
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
}

async function initAssetsSystem() {
  preloadDefaultCharImages();
  await loadAllCustomAssets();
  refreshCustomAssetsUI();
}