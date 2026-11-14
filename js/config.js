if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(err => console.error('SW Register Error:', err));
}

const COLS = 6, ROWS = 12, CELL_PX = 36;

const COLORS = [
  { id: 1, bg: '#ff3366', symbol: '♥' }, { id: 2, bg: '#ffd700', symbol: '★' },
  { id: 3, bg: '#00d4ff', symbol: '◆' }, { id: 4, bg: '#00e676', symbol: '♣' },
  { id: 5, bg: '#ff9100', symbol: '▲' }, { id: 6, bg: '#9d00ff', symbol: '●' },
  { id: 7, bg: '#ffffff', symbol: '！', isSpecial: true, textColor: '#000' }
];

// ==========================================
// SE & BGM 制御 (Web Audio API & HTML5 Audio)
// ==========================================
const AudioContext = window.AudioContext || window.webkitAudioContext;
const audioCtx = new AudioContext();

document.body.addEventListener('pointerdown', () => {
  if (audioCtx.state === 'suspended') audioCtx.resume();
}, { once: true });

const SE = {
  files: {
    cursorMove: 'assets/se/cursor_move.m4a',
    falledBlock: 'assets/se/falled_block.m4a',
    garbageErase: 'assets/se/garbage_block_erase.m4a',
    normalErase: 'assets/se/nomal_block_erase.m4a',
    fanfareMin: 'assets/se/Fanfare_min.m4a',
    fanfareMid: 'assets/se/Fanfare_mid.m4a',
    fanfareMax: 'assets/se/Fanfare_max.m4a',
  },
  buffers: {},
  volume: 0.5,
  async load() {
    for (const [key, path] of Object.entries(this.files)) {
      try {
        const response = await fetch(path);
        const arrayBuffer = await response.arrayBuffer();
        const decoded = await new Promise((resolve, reject) => {
          audioCtx.decodeAudioData(arrayBuffer, resolve, reject);
        });
        this.buffers[key] = decoded;
      } catch (e) {
        console.warn('SE Load Error:', key, e);
      }
    }
  },
  play(key) {
    if (!this.buffers[key]) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const source = audioCtx.createBufferSource();
    source.buffer = this.buffers[key];
    const gainNode = audioCtx.createGain();
    gainNode.gain.value = this.volume;
    source.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    source.start(0);
  }
};
SE.load();

// iOS等(WebKit)での音量調整不具合を解消するためのWeb Audio API BGMラッパー
class WebAudioBGMPlayer {
  constructor(ctx, src = '') {
    this.ctx = ctx;
    this.gainNode = ctx.createGain();
    this.gainNode.connect(ctx.destination);
    this.source = null;
    this.buffer = null;
    
    this._src = src;
    this._volume = 0.5;
    this._muted = false;
    this.loop = false;
    this._currentFile = null;
    this.onended = null;
    
    this.isPlaying = false;
    this.startTime = 0;
    this.pauseTime = 0;
    this._isManualStop = false;
    this._playRequestId = 0;
    this._loadingPromise = null;
    this._loadingSrc = null;
  }
  
  get src() { return this._src; }
  set src(value) {
    if (this._src !== value) {
      this.pause();
      this._playRequestId++;
      this._src = value;
      this.pauseTime = 0;
      this.buffer = null; // 新しいsrcになったらバッファクリア
      this._loadingPromise = null;
      this._loadingSrc = null;
    }
  }
  
  get volume() { return this._volume; }
  set volume(v) {
    this._volume = v;
    this.updateGain();
  }
  
  get muted() { return this._muted; }
  set muted(m) {
    this._muted = m;
    this.updateGain();
  }
  
  updateGain() {
    // GainNodeを使って強制的にWeb Audio経由で音量反映・ミュート制御を行う
    this.gainNode.gain.value = this._muted ? 0 : this._volume;
  }
  
  get currentTime() {
    if (this.isPlaying) {
      let t = this.pauseTime + (this.ctx.currentTime - this.startTime);
      if (this.buffer && this.loop) return t % this.buffer.duration;
      if (this.buffer && t >= this.buffer.duration) return this.buffer.duration;
      return t;
    }
    return this.pauseTime;
  }
  set currentTime(v) {
    const wasPlaying = this.isPlaying;
    if (wasPlaying) {
      this.pause();
    }
    this.pauseTime = v;
    if (wasPlaying) {
      this.play().catch(()=>{});
    }
  }

  addEventListener(event, callback) {
    if (event === 'ended') {
      this.onended = callback;
    }
  }
  
  async load() {
    if (!this._src) return;
    if (this.buffer) return;
    if (this._loadingPromise && this._loadingSrc === this._src) {
      return this._loadingPromise;
    }
    const targetSrc = this._src;
    this._loadingSrc = targetSrc;
    this._loadingPromise = (async () => {
      try {
        // File API等で生成されたBlob(ObjectURL)も正常にfetch可能
        const response = await fetch(targetSrc);
        const arrayBuffer = await response.arrayBuffer();
        const decoded = await this.ctx.decodeAudioData(arrayBuffer);
        if (this._src === targetSrc) {
          this.buffer = decoded;
        }
      } catch (e) {
        console.warn('BGM Load Error:', e);
        if (this._src === targetSrc) {
          this.buffer = null;
        }
      } finally {
        if (this._loadingSrc === targetSrc) {
          this._loadingPromise = null;
        }
      }
    })();
    return this._loadingPromise;
  }
  
  async play() {
    const reqId = ++this._playRequestId;
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
      if (reqId !== this._playRequestId) return Promise.resolve();
    }
    if (!this.buffer) {
      await this.load();
      if (reqId !== this._playRequestId) return Promise.resolve();
    }
    if (!this.buffer) return Promise.resolve();
    
    if (this.isPlaying) this.pause(false);
    if (reqId !== this._playRequestId) return Promise.resolve();
    
    this.source = this.ctx.createBufferSource();
    this.source.buffer = this.buffer;
    this.source.loop = this.loop;
    this.source.connect(this.gainNode);
    
    const currentSource = this.source;
    currentSource.onended = () => {
      if (this.source === currentSource && !this._isManualStop) {
        this.isPlaying = false;
        this.pauseTime = 0;
        this.source = null;
        if (this.onended) this.onended(); // 再生終了でイベント発火（プレイリスト遷移等）
      }
    };
    
    this._isManualStop = false;
    this.startTime = this.ctx.currentTime;
    
    let offset = this.pauseTime;
    if (this.buffer && offset >= this.buffer.duration) {
      offset = 0;
      this.pauseTime = 0;
    }
    
    currentSource.start(0, offset);
    this.isPlaying = true;
    this.updateGain();
    return Promise.resolve();
  }
  
  pause(invalidateRequest = true) {
    if (invalidateRequest) {
      this._playRequestId++;
    }
    if (this.isPlaying && this.source) {
      this._isManualStop = true;
      const oldSource = this.source;
      oldSource.onended = null;
      try { oldSource.stop(); } catch (e) {}
      try { oldSource.disconnect(); } catch (e) {}
      this.pauseTime += (this.ctx.currentTime - this.startTime);
      if (this.buffer && this.pauseTime >= this.buffer.duration) {
         this.pauseTime = 0;
      }
      this.source = null;
      this.isPlaying = false;
    }
  }
}

let bgmAudio = new WebAudioBGMPlayer(audioCtx);
let panicBgmAudio = new WebAudioBGMPlayer(audioCtx, 'assets/bgm/panic00.m4a');
panicBgmAudio.loop = true;

let bgmPlaylist = [], currentBgmIndex = 0, isBgmPlaying = false, bgmNeedsPlay = false;
let isBgmIntendedToPlay = false; 
let isPanic = false;

const savedSeVol = localStorage.getItem('pdw_se_vol');
if (savedSeVol !== null) SE.volume = parseFloat(savedSeVol);
const savedBgmVol = localStorage.getItem('pdw_bgm_vol');
let initBgmVol = savedBgmVol !== null ? parseFloat(savedBgmVol) : 0.5;

bgmAudio.volume = initBgmVol;
bgmAudio.muted = false;
panicBgmAudio.volume = initBgmVol; 
panicBgmAudio.muted = true; 

document.getElementById('se-volume').value = SE.volume;
document.getElementById('se-volume-val').innerText = Math.floor(SE.volume * 100);
document.getElementById('bgm-volume').value = initBgmVol;
document.getElementById('bgm-volume-val').innerText = Math.floor(initBgmVol * 100);

document.getElementById('se-volume').addEventListener('input', (e) => {
  SE.volume = parseFloat(e.target.value);
  document.getElementById('se-volume-val').innerText = Math.floor(SE.volume * 100);
  localStorage.setItem('pdw_se_vol', SE.volume);
});

document.getElementById('bgm-volume').addEventListener('input', (e) => {
  const vol = parseFloat(e.target.value);
  bgmAudio.volume = vol;
  panicBgmAudio.volume = vol;
  
  if (isPanic) {
    bgmAudio.muted = true;
    panicBgmAudio.muted = false;
  } else {
    bgmAudio.muted = false;
    panicBgmAudio.muted = true;
  }
  document.getElementById('bgm-volume-val').innerText = Math.floor(vol * 100);
  localStorage.setItem('pdw_bgm_vol', vol);
});

function handleBgmFiles(files) {
  const arr = Array.from(files).filter(f => f.type.startsWith('audio/'));
  if (arr.length > 0) {
    bgmPlaylist = arr;
    currentBgmIndex = 0;
    const expectedFile = bgmPlaylist[currentBgmIndex];
    bgmAudio.src = URL.createObjectURL(expectedFile);
    bgmAudio._currentFile = expectedFile;
    bgmNeedsPlay = true;
    showToast('BGMをセットしました。「設定を保存して閉じる」を押すと再生されます');
  }
}
document.getElementById('bgm-file-input').addEventListener('change', e => handleBgmFiles(e.target.files));
document.getElementById('bgm-dir-input').addEventListener('change', e => handleBgmFiles(e.target.files));

function toggleBgmPlay() {
  if (bgmPlaylist.length === 0) { showToast('先にBGMファイルを選択してください'); return; }
  if (isBgmPlaying) {
    stopBgm();
  } else {
    const expectedFile = bgmPlaylist[currentBgmIndex];
    if (bgmAudio._currentFile !== expectedFile) {
       bgmAudio.src = URL.createObjectURL(expectedFile);
       bgmAudio._currentFile = expectedFile;
    }
    bgmAudio.loop = false;
    
    let bgmVol = parseFloat(document.getElementById('bgm-volume').value);
    bgmAudio.volume = bgmVol;
    panicBgmAudio.volume = bgmVol;
    bgmAudio.muted = isPanic;
    panicBgmAudio.muted = !isPanic;

    bgmAudio.play().then(() => { 
      panicBgmAudio.play().catch(()=>{});
      isBgmPlaying = true; 
      isBgmIntendedToPlay = true;
      bgmNeedsPlay = false; 
    }).catch(() => showToast('再生エラー'));
  }
}

bgmAudio.addEventListener('ended', () => {
  if (bgmPlaylist.length > 0) {
    currentBgmIndex = (currentBgmIndex + 1) % bgmPlaylist.length;
    const expectedFile = bgmPlaylist[currentBgmIndex];
    if (bgmAudio._currentFile !== expectedFile) {
      bgmAudio.src = URL.createObjectURL(expectedFile);
      bgmAudio._currentFile = expectedFile;
    }
    bgmAudio.loop = false;

    if (isBgmIntendedToPlay) {
      bgmAudio.currentTime = 0;
      bgmAudio.play().catch(()=>{});
    }
  }
});

function stopBgm() {
  isBgmIntendedToPlay = false;
  isBgmPlaying = false;
  isPanic = false;
  bgmAudio.pause();
  panicBgmAudio.pause();
}

function readyBgm() {
  isBgmIntendedToPlay = false;
  isBgmPlaying = false;
  
  if (bgmPlaylist.length > 0) {
    const expectedFile = bgmPlaylist[currentBgmIndex];
    if (bgmAudio._currentFile !== expectedFile) {
       bgmAudio.src = URL.createObjectURL(expectedFile);
       bgmAudio._currentFile = expectedFile;
    }
    bgmAudio.loop = false;
  } else {
    if (!bgmAudio.src.includes('main00.m4a')) {
      bgmAudio.src = 'assets/bgm/main00.m4a';
    }
    bgmAudio.loop = true;
  }

  bgmAudio.pause();
  panicBgmAudio.pause();
  bgmAudio.currentTime = 0;
  panicBgmAudio.currentTime = 0;
  isPanic = false;
  
  let bgmVol = parseFloat(document.getElementById('bgm-volume').value);
  bgmAudio.volume = bgmVol; 
  panicBgmAudio.volume = bgmVol;
  bgmAudio.muted = true;
  panicBgmAudio.muted = true;

  bgmAudio.load();
  panicBgmAudio.load();
}

function resumeBgm() {
  if (matchState !== 'playing' || document.getElementById('game-area').style.display === 'none') return;
  isBgmIntendedToPlay = true;
  isBgmPlaying = true;
  let bgmVol = parseFloat(document.getElementById('bgm-volume').value);

  bgmAudio.volume = bgmVol;
  panicBgmAudio.volume = bgmVol;
  bgmAudio.muted = isPanic;
  panicBgmAudio.muted = !isPanic;

  bgmAudio.play().catch(e => console.warn(e));
  if (isPanic) {
    panicBgmAudio.currentTime = 0;
    panicBgmAudio.play().catch(e => console.warn(e));
  }
}

// --- コンフィグ・ゲームパッド管理（1P〜4P対応） ---
const ACTION_LABELS = {
  Up: '上', Down: '下', Left: '左', Right: '右', Swap: '入替',
  GrabLeft: 'カーソル左つかみ', GrabRight: 'カーソル右つかみ',
  ToggleContinuous: '連続移動オンオフ',
  Rise1: 'せり上げ1', Rise2: 'せり上げ2',
  TargetRight: '標的(右)', TargetLeft: '標的(左)',
  Skill: 'スキル発動',
  Pause: 'ポーズ/退出'
};

let keyConfig = {
  Up: 'ArrowUp', Down: 'ArrowDown', Left: 'ArrowLeft', Right: 'ArrowRight',
  Swap: 'Space',
  GrabLeft: 'KeyZ', GrabRight: 'KeyX',
  ToggleContinuous: 'KeyC',
  Rise1: 'ShiftLeft', Rise2: 'ShiftRight',
  TargetRight: 'KeyE', TargetLeft: 'KeyQ',
  Skill: 'KeyF',
  Pause: 'Escape'
};
let padConfig = {
  Up: 12, Down: 13, Left: 14, Right: 15,
  Swap: 0,
  GrabLeft: 2, GrabRight: 1,
  ToggleContinuous: 3,
  Rise1: 5, Rise2: 7,
  TargetRight: 5, TargetLeft: 4,
  Skill: 6,
  Pause: 9
};

function createDefaultPadConfig() {
  return {
    Up: 12, Down: 13, Left: 14, Right: 15,
    Swap: 0,
    GrabLeft: 2, GrabRight: 1,
    ToggleContinuous: 3,
    Rise1: 5, Rise2: 7,
    TargetRight: 5, TargetLeft: 4,
    Skill: 6,
    Pause: 9
  };
}

function createEmptyKeyConfig() {
  const obj = {};
  Object.keys(ACTION_LABELS).forEach(k => obj[k] = '');
  return obj;
}

// 2Pデフォルトキー（1Pと重複しないWASD側）
function createDefaultP2KeyConfig() {
  return {
    Up: 'KeyW', Down: 'KeyS', Left: 'KeyA', Right: 'KeyD',
    Swap: 'KeyG',
    GrabLeft: 'KeyT', GrabRight: 'KeyY',
    ToggleContinuous: 'KeyR',
    Rise1: 'KeyV', Rise2: 'KeyB',
    TargetRight: 'Digit2', TargetLeft: 'Digit1',
    Skill: 'KeyH',
    Pause: ''
  };
}

try {
  const sKey = localStorage.getItem('pdw_key'), sPad = localStorage.getItem('pdw_pad');
  if (sKey) {
    const parsedKey = JSON.parse(sKey);
    if (parsedKey.Rise && !parsedKey.Rise1) parsedKey.Rise1 = parsedKey.Rise;
    if (parsedKey.Target && !parsedKey.TargetRight) parsedKey.TargetRight = parsedKey.Target;
    Object.keys(keyConfig).forEach(k => {
      if (parsedKey[k] !== undefined) keyConfig[k] = parsedKey[k];
    });
  }
  if (sPad) {
    const parsedPad = JSON.parse(sPad);
    if (parsedPad.Rise !== undefined && parsedPad.Rise1 === undefined) parsedPad.Rise1 = parsedPad.Rise;
    if (parsedPad.Target !== undefined && parsedPad.TargetRight === undefined) parsedPad.TargetRight = parsedPad.Target;
    Object.keys(padConfig).forEach(k => {
      if (parsedPad[k] !== undefined) padConfig[k] = parsedPad[k];
    });
  }
} catch(e) {}

let playerConfigs = [
  { key: keyConfig, pad: padConfig, padSlot: 0 },
  { key: createDefaultP2KeyConfig(), pad: createDefaultPadConfig(), padSlot: 1 },
  { key: createEmptyKeyConfig(), pad: createDefaultPadConfig(), padSlot: 2 },
  { key: createEmptyKeyConfig(), pad: createDefaultPadConfig(), padSlot: 3 }
];

try {
  const savedSlot0 = localStorage.getItem('pdw_pad_slot_0');
  if (savedSlot0 !== null) playerConfigs[0].padSlot = parseInt(savedSlot0, 10);
  const savedMulti = localStorage.getItem('pdw_multi_configs');
  if (savedMulti) {
    const parsed = JSON.parse(savedMulti);
    [1, 2, 3].forEach(idx => {
      if (parsed[idx]) {
        if (parsed[idx].key) {
          Object.keys(ACTION_LABELS).forEach(k => {
            if (parsed[idx].key[k] !== undefined) playerConfigs[idx].key[k] = parsed[idx].key[k];
          });
        }
        if (parsed[idx].pad) {
          Object.keys(ACTION_LABELS).forEach(k => {
            if (parsed[idx].pad[k] !== undefined) playerConfigs[idx].pad[k] = parsed[idx].pad[k];
          });
        }
        if (parsed[idx].padSlot !== undefined) {
          playerConfigs[idx].padSlot = parsed[idx].padSlot;
        }
      }
    });
  }
} catch (e) {}

let settingsPlayerIdx = 0;
let assigningAction = null, assignType = null;

function selectSettingsPlayer(idx) {
  settingsPlayerIdx = idx;
  assigningAction = null;
  document.querySelectorAll('#settings-player-tabs button').forEach((btn, i) => {
    btn.classList.toggle('active', i === idx);
  });
  const sel = document.getElementById('settings-pad-slot');
  if (sel) sel.value = String(playerConfigs[idx].padSlot);
  renderConfigUI();
}

function onSettingsPadSlotChange(val) {
  playerConfigs[settingsPlayerIdx].padSlot = parseInt(val, 10);
}

function openSettings() { 
  document.getElementById('settings-overlay').style.display = 'block'; 
  selectSettingsPlayer(settingsPlayerIdx);
}

function closeSettings() { 
  document.getElementById('settings-overlay').style.display = 'none'; 
  assigningAction = null;
  localStorage.setItem('pdw_key', JSON.stringify(keyConfig));
  localStorage.setItem('pdw_pad', JSON.stringify(padConfig));
  localStorage.setItem('pdw_pad_slot_0', String(playerConfigs[0].padSlot));
  localStorage.setItem('pdw_multi_configs', JSON.stringify({
    1: playerConfigs[1],
    2: playerConfigs[2],
    3: playerConfigs[3]
  }));

  if (bgmNeedsPlay && !isBgmPlaying && matchState !== 'playing') {
    const expectedFile = bgmPlaylist[currentBgmIndex];
    if (bgmAudio._currentFile !== expectedFile) {
       bgmAudio.src = URL.createObjectURL(expectedFile);
       bgmAudio._currentFile = expectedFile;
    }
    bgmAudio.loop = false;
    bgmAudio.currentTime = 0;
    
    let bgmVol = parseFloat(document.getElementById('bgm-volume').value);
    bgmAudio.volume = bgmVol;
    panicBgmAudio.volume = bgmVol;
    bgmAudio.muted = isPanic;
    panicBgmAudio.muted = !isPanic;
    
    bgmAudio.play().then(() => {
      panicBgmAudio.play().catch(()=>{});
      isBgmPlaying = true; 
      isBgmIntendedToPlay = true;
      bgmNeedsPlay = false; 
    }).catch(e => console.warn(e));
  }
}

function renderConfigUI() {
  const list = document.getElementById('key-config-list');
  if (!list) return;
  const cfg = playerConfigs[settingsPlayerIdx];
  list.innerHTML = '';
  Object.keys(ACTION_LABELS).forEach(action => {
    const row = document.createElement('div');
    row.style.display = 'flex'; row.style.justifyContent = 'space-between'; row.style.alignItems = 'center'; row.style.gap = '6px';
    
    const lbl = document.createElement('span'); 
    lbl.innerText = ACTION_LABELS[action]; 
    lbl.style.flex = '1'; lbl.style.fontSize = '0.8rem';
    
    const kBtn = document.createElement('button'); kBtn.className = 'config-btn';
    kBtn.style.width = '95px'; kBtn.style.flexShrink = '0';
    const rawKey = cfg.key[action] || '';
    kBtn.innerText = `Key: ${rawKey ? rawKey.replace('Arrow','').replace('Key','') : 'なし'}`;
    kBtn.onclick = () => { assigningAction = action; assignType = 'key'; kBtn.innerText = '押してください'; };
    
    const pBtn = document.createElement('button'); pBtn.className = 'config-btn';
    pBtn.style.width = '95px'; pBtn.style.flexShrink = '0';
    pBtn.innerText = `Pad: ${cfg.pad[action] !== null && cfg.pad[action] !== undefined ? cfg.pad[action] : 'なし'}`;
    pBtn.onclick = () => { assigningAction = action; assignType = 'pad'; pBtn.innerText = '押してください'; };
    
    row.append(lbl, kBtn, pBtn);
    list.appendChild(row);
  });
}

function getConnectedPadsSummaryText() {
  const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()) : [];
  const connected = [];
  for (let i = 0; i < 4; i++) {
    if (pads[i] && pads[i].connected) {
      connected.push(`Pad${i}: OK`);
    }
  }
  return connected.length > 0
    ? `検出済みパッド → ${connected.join(' / ')}`
    : '検出済みパッド: なし（接続してどれかボタンを押すと認識されます）';
}

// ゲームパッドによるメニュー操作 & 設定画面のボタン割り当て用グローバルループ
let globalPadPrevState = {};
setInterval(() => {
  const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()) : [];

  const settingsPadStatus = document.getElementById('settings-pad-status');
  if (settingsPadStatus && document.getElementById('settings-overlay').style.display === 'block') {
    settingsPadStatus.innerText = getConnectedPadsSummaryText();
  }
  const localPadStatus = document.getElementById('local-pad-status');
  if (localPadStatus && document.getElementById('local-menu')?.style.display === 'flex') {
    localPadStatus.innerText = getConnectedPadsSummaryText();
  }

  if (assigningAction && assignType === 'pad') {
    const targetSlot = playerConfigs[settingsPlayerIdx].padSlot;
    const scanOrder = [];
    if (targetSlot >= 0 && pads[targetSlot]) scanOrder.push(pads[targetSlot]);
    pads.forEach(p => { if (p && !scanOrder.includes(p)) scanOrder.push(p); });

    for (const p of scanOrder) {
      const pressedIdx = p.buttons.findIndex(b => b.pressed);
      if (pressedIdx !== -1) {
        playerConfigs[settingsPlayerIdx].pad[assigningAction] = pressedIdx;
        assigningAction = null;
        renderConfigUI();
        return;
      }
    }
    return;
  }

  const slot0 = playerConfigs[0].padSlot;
  const pad = (slot0 >= 0 && pads[slot0]) ? pads[slot0] : pads.find(p => p && p.connected);
  if (!pad) return;
  let pressed = {};
  pad.buttons.forEach((b, i) => pressed[i] = b.pressed);
  
  const justPressed = (btnIdx) => btnIdx !== null && btnIdx !== undefined && pressed[btnIdx] && !globalPadPrevState[btnIdx];
  
  if (typeof matchState !== 'undefined' && matchState !== 'playing') {
    const activeEl = document.activeElement;
    const isSelect = activeEl && activeEl.tagName === 'SELECT';
    const isRange = activeEl && activeEl.tagName === 'INPUT' && activeEl.type === 'range';
    const isCheckbox = activeEl && activeEl.tagName === 'INPUT' && activeEl.type === 'checkbox';

    if (isSelect) {
      if (justPressed(padConfig.Left)) {
        if (activeEl.selectedIndex > 0) {
          activeEl.selectedIndex--;
          activeEl.dispatchEvent(new Event('change', { bubbles: true }));
          SE.play('cursorMove');
        }
      } else if (justPressed(padConfig.Right)) {
        if (activeEl.selectedIndex < activeEl.options.length - 1) {
          activeEl.selectedIndex++;
          activeEl.dispatchEvent(new Event('change', { bubbles: true }));
          SE.play('cursorMove');
        }
      } else if (justPressed(padConfig.Up)) {
        moveMenuFocus(-1);
      } else if (justPressed(padConfig.Down)) {
        moveMenuFocus(1);
      }
    } else if (isRange) {
      const step = parseFloat(activeEl.step) || 1;
      const min = parseFloat(activeEl.min) || 0;
      const max = parseFloat(activeEl.max) || 100;
      let val = parseFloat(activeEl.value);
      if (justPressed(padConfig.Left)) {
        val = Math.max(min, val - step);
        activeEl.value = val;
        activeEl.dispatchEvent(new Event('input', { bubbles: true }));
        activeEl.dispatchEvent(new Event('change', { bubbles: true }));
        SE.play('cursorMove');
      } else if (justPressed(padConfig.Right)) {
        val = Math.min(max, val + step);
        activeEl.value = val;
        activeEl.dispatchEvent(new Event('input', { bubbles: true }));
        activeEl.dispatchEvent(new Event('change', { bubbles: true }));
        SE.play('cursorMove');
      } else if (justPressed(padConfig.Up)) {
        moveMenuFocus(-1);
      } else if (justPressed(padConfig.Down)) {
        moveMenuFocus(1);
      }
    } else {
      if (justPressed(padConfig.Up) || justPressed(padConfig.Left)) {
        moveMenuFocus(-1);
      }
      if (justPressed(padConfig.Down) || justPressed(padConfig.Right)) {
        moveMenuFocus(1);
      }
    }

    if (justPressed(padConfig.Swap)) {
      if (activeEl) {
        if (isCheckbox) {
          activeEl.checked = !activeEl.checked;
          activeEl.dispatchEvent(new Event('change', { bubbles: true }));
          SE.play('cursorMove');
        } else if (activeEl.click) {
          activeEl.click();
          SE.play('cursorMove');
        }
      }
    }
  }
  globalPadPrevState = { ...pressed };
}, 1000 / 30);

function moveMenuFocus(dir) {
  const focusables = Array.from(document.querySelectorAll('button, select, input, [tabindex]:not([tabindex="-1"])'))
    .filter(el => {
      if (el.disabled) return false;
      let style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      let parent = el.parentElement;
      while(parent) {
        if (window.getComputedStyle(parent).display === 'none') return false;
        parent = parent.parentElement;
      }
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
  if (focusables.length === 0) return;
  let idx = focusables.indexOf(document.activeElement);
  if (idx === -1) idx = 0;
  else {
    idx += dir;
    if (idx < 0) idx = focusables.length - 1;
    if (idx >= focusables.length) idx = 0;
  }
  focusables[idx].focus();
  SE.play('cursorMove');
}
