if ('serviceWorker' in navigator && location.protocol !== 'file:') {
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
// SE & BGM 制御 (Web Audio API & HTML5 Audio フォールバック)
// ==========================================
const AudioContext = window.AudioContext || window.webkitAudioContext;
const audioCtx = new AudioContext();

function ensureAudioCtxResumed() {
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  if (typeof SE !== 'undefined' && typeof SE.unlockFallbackAudios === 'function') {
    SE.unlockFallbackAudios();
  }
}
document.addEventListener('pointerdown', ensureAudioCtxResumed, { passive: true });
document.addEventListener('keydown', ensureAudioCtxResumed, { passive: true });

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
  fallbackPaths: {},
  fallbackAudios: {},
  _fallbackUnlocked: false,
  customBuffers: {},
  customRawMap: {},   // { key: { dataUrl, name, size } }
  remoteBuffers: {},  // { senderId: { key: AudioBuffer } }
  volume: 0.5,
  prepareFallbackAudio(key, path) {
    this.fallbackPaths[key] = path;
    if (!this.fallbackAudios[key]) {
      const a = new Audio(path);
      a.preload = 'auto';
      try { a.load(); } catch (e) {}
      this.fallbackAudios[key] = a;
    }
  },
  unlockFallbackAudios() {
    if (this._fallbackUnlocked) return;
    const entries = Object.entries(this.fallbackAudios);
    if (entries.length === 0) return;
    this._fallbackUnlocked = true;
    entries.forEach(([key, a]) => {
      if (this.buffers[key]) return;
      try {
        const prevMuted = a.muted;
        a.muted = true;
        const p = a.play();
        if (p && typeof p.then === 'function') {
          p.then(() => {
            a.pause();
            try { a.currentTime = 0; } catch (e) {}
            a.muted = prevMuted;
          }).catch(() => {
            a.muted = prevMuted;
          });
        } else {
          a.muted = prevMuted;
        }
      } catch (e) {}
    });
  },
  async load() {
    const isFileProto = (location.protocol === 'file:');
    for (const [key, path] of Object.entries(this.files)) {
      this.fallbackPaths[key] = path;
      if (isFileProto) {
        this.prepareFallbackAudio(key, path);
        continue;
      }
      try {
        const response = await fetch(path);
        if (!response.ok) {
          this.prepareFallbackAudio(key, path);
          continue;
        }
        const arrayBuffer = await response.arrayBuffer();
        const decoded = await new Promise((resolve, reject) => {
          audioCtx.decodeAudioData(arrayBuffer, resolve, reject);
        });
        this.buffers[key] = decoded;
      } catch (e) {
        console.warn('SE Load Error (fallback ready):', key, e);
        this.prepareFallbackAudio(key, path);
      }
    }
  },
  async setCustomSound(key, arrayBuffer, meta = null) {
    try {
      const copy = arrayBuffer.slice(0);
      const decoded = await new Promise((resolve, reject) => {
        audioCtx.decodeAudioData(copy, resolve, reject);
      });
      this.customBuffers[key] = decoded;
      if (meta) this.customRawMap[key] = meta;
      return true;
    } catch (e) {
      console.warn('Custom SE Decode Error:', key, e);
      return false;
    }
  },
  async setRemoteSound(senderId, key, arrayBuffer) {
    try {
      const copy = arrayBuffer.slice(0);
      const decoded = await new Promise((resolve, reject) => {
        audioCtx.decodeAudioData(copy, resolve, reject);
      });
      if (!this.remoteBuffers[senderId]) this.remoteBuffers[senderId] = {};
      this.remoteBuffers[senderId][key] = decoded;
      return true;
    } catch (e) {
      return false;
    }
  },
  clearCustomSound(key) {
    delete this.customBuffers[key];
    delete this.customRawMap[key];
  },
  clearAllCustomSounds() {
    this.customBuffers = {};
    this.customRawMap = {};
  },
  clearRemoteSounds(senderId) {
    if (senderId) delete this.remoteBuffers[senderId];
    else this.remoteBuffers = {};
  },
  playBuffer(buffer, gainMultiplier = 1.0, baseVolume = null) {
    if (!buffer) return false;
    const vol = baseVolume !== null ? baseVolume : this.volume;
    if (vol <= 0) return false;
    ensureAudioCtxResumed();
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    const gainNode = audioCtx.createGain();
    gainNode.gain.value = Math.min(2.0, vol * gainMultiplier);
    source.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    source.start(0);
    return true;
  },
  playFallbackAudio(key, path) {
    if ((!path && !this.fallbackAudios[key]) || this.volume <= 0) return;
    try {
      const base = this.fallbackAudios[key];
      const vol = Math.max(0, Math.min(1, this.volume));
      if (base && (base.paused || base.ended)) {
        base.muted = false;
        base.volume = vol;
        try { base.currentTime = 0; } catch (e) {}
        base.play().catch(() => {});
      } else {
        const a = base ? base.cloneNode(true) : new Audio(path);
        a.muted = false;
        a.volume = vol;
        a.play().catch(() => {});
      }
    } catch (e) {}
  },
  playSynthTone(freq, duration = 0.16, type = 'triangle', gainScale = 0.95) {
    if (this.volume <= 0) return;
    ensureAudioCtxResumed();
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    const peak = Math.max(0.001, Math.min(1.5, this.volume * gainScale));
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(peak, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  },
  playCountdown(step) {
    const specificKey = `countdown_${step}`;
    if (this.customBuffers[specificKey]) {
      this.playBuffer(this.customBuffers[specificKey]);
      return;
    }
    if (step !== 'go' && this.customBuffers.countdown) {
      this.playBuffer(this.customBuffers.countdown);
      return;
    }
    if (step === 'go') {
      this.playSynthTone(1046.5, 0.34, 'triangle', 1.15);
      this.playSynthTone(1567.98, 0.30, 'triangle', 0.70);
      this.playSynthTone(2093.0, 0.24, 'sine', 0.45);
    } else {
      this.playSynthTone(523.25, 0.19, 'triangle', 1.05);
      this.playSynthTone(1046.5, 0.15, 'sine', 0.55);
    }
  },
  playForSender(senderId, key) {
    const rMap = senderId && this.remoteBuffers[senderId];
    if (rMap && rMap[key]) {
      this.playBuffer(rMap[key]);
      return;
    }
    this.play(key);
  },
  play(key) {
    const buf = this.customBuffers[key] || this.buffers[key];
    if (buf) {
      this.playBuffer(buf);
      return;
    }
    if (this.fallbackPaths[key] || this.fallbackAudios[key]) {
      this.playFallbackAudio(key, this.fallbackPaths[key]);
    }
  }
};
SE.load();

// ==========================================
// VOICE 制御（attack / win / lose 拡張子非依存 & カスタムボイス対応）
// ==========================================
const VOICE = {
  exts: ['m4a', 'mp3', 'wav', 'ogg', 'aac', 'opus', 'webm'],
  suffixMap: {
    attack: 'ata',
    win: 'win',
    lose: 'lose'
  },
  volume: 0.7,
  resolvedCache: {},   // { key: { type: 'buffer'|'url'|'none', data } }
  resolvingMap: {},    // { key: Promise }
  customBuffers: {},   // { attack?: AudioBuffer, win?: AudioBuffer, lose?: AudioBuffer }
  customRawMap: {},    // { attack?: { dataUrl, name, size }, ... }
  remoteBuffers: {},   // { [senderId]: { attack?: AudioBuffer, ... } }
  lastPlayedMap: {},

  async setCustomVoice(category, arrayBuffer, meta = null) {
    if (!this.suffixMap[category]) return false;
    try {
      const copy = arrayBuffer.slice(0);
      const decoded = await new Promise((resolve, reject) => {
        audioCtx.decodeAudioData(copy, resolve, reject);
      });
      this.customBuffers[category] = decoded;
      if (meta) this.customRawMap[category] = meta;
      return true;
    } catch (_) {
      return false;
    }
  },
  clearCustomVoice(category) {
    delete this.customBuffers[category];
    delete this.customRawMap[category];
  },
  clearAllCustomVoices() {
    this.customBuffers = {};
    this.customRawMap = {};
  },
  async setRemoteVoice(senderId, category, arrayBuffer) {
    if (!senderId || !this.suffixMap[category]) return false;
    try {
      const copy = arrayBuffer.slice(0);
      const decoded = await new Promise((resolve, reject) => {
        audioCtx.decodeAudioData(copy, resolve, reject);
      });
      if (!this.remoteBuffers[senderId]) this.remoteBuffers[senderId] = {};
      this.remoteBuffers[senderId][category] = decoded;
      return true;
    } catch (_) {
      return false;
    }
  },
  clearRemoteVoices(senderId) {
    if (senderId) delete this.remoteBuffers[senderId];
    else this.remoteBuffers = {};
  },

  probeAudioUrl(url) {
    return new Promise((resolve) => {
      try {
        const audio = new Audio();
        let settled = false;
        const done = (ok) => {
          if (settled) return;
          settled = true;
          audio.oncanplaythrough = null;
          audio.onloadeddata = null;
          audio.onerror = null;
          resolve(ok ? url : null);
        };
        audio.preload = 'auto';
        audio.oncanplaythrough = () => done(true);
        audio.onloadeddata = () => done(true);
        audio.onerror = () => done(false);
        audio.src = url;
        audio.load();
        setTimeout(() => done(false), 1800);
      } catch (_) {
        resolve(null);
      }
    });
  },

  async resolveCharacterVoice(category, charName) {
    const suffix = this.suffixMap[category];
    if (!suffix || !charName) return { type: 'none' };
    const cacheKey = `${category}::${charName}`;
    if (this.resolvedCache[cacheKey]) return this.resolvedCache[cacheKey];
    if (this.resolvingMap[cacheKey]) return this.resolvingMap[cacheKey];

    const isFileProto = (location.protocol === 'file:');
    const encodedName = encodeURIComponent(charName);
    const task = (async () => {
      for (const ext of this.exts) {
        const rawPath = `assets/voice/${category}/${charName}_${suffix}.${ext}`;
        const urlPath = `assets/voice/${category}/${encodedName}_${suffix}.${ext}`;
        if (isFileProto) {
          const okUrl = await this.probeAudioUrl(rawPath);
          if (okUrl) {
            const entry = { type: 'url', data: okUrl };
            this.resolvedCache[cacheKey] = entry;
            return entry;
          }
          continue;
        }
        try {
          const res = await fetch(urlPath);
          if (!res || !res.ok) continue;
          const buf = await res.arrayBuffer();
          const decoded = await new Promise((resolve, reject) => {
            audioCtx.decodeAudioData(buf, resolve, reject);
          });
          const entry = { type: 'buffer', data: decoded };
          this.resolvedCache[cacheKey] = entry;
          return entry;
        } catch (_) {
          // 存在しない・デコード不可時はエラー出力せず次拡張子へ
        }
      }
      const noneEntry = { type: 'none' };
      this.resolvedCache[cacheKey] = noneEntry;
      return noneEntry;
    })().finally(() => {
      delete this.resolvingMap[cacheKey];
    });

    this.resolvingMap[cacheKey] = task;
    return task;
  },

  playFallbackUrl(url) {
    if (!url || this.volume <= 0) return;
    try {
      const a = new Audio(url);
      a.volume = Math.max(0, Math.min(1, this.volume));
      a.play().catch(() => {});
    } catch (_) {}
  },

  async play(category, themeOrName, senderId = null) {
    if (this.volume <= 0 || !this.suffixMap[category]) return;

    const charId = (themeOrName && typeof themeOrName === 'object') ? themeOrName.charId : null;
    const charName = (themeOrName && typeof themeOrName === 'object')
      ? (themeOrName.voiceName || themeOrName.name)
      : String(themeOrName || '');

    const dedupKey = `${category}_${senderId || charId || charName}`;
    const now = performance.now();
    if (this.lastPlayedMap[dedupKey] && (now - this.lastPlayedMap[dedupKey]) < 320) {
      return;
    }
    this.lastPlayedMap[dedupKey] = now;

    if (senderId && this.remoteBuffers[senderId] && this.remoteBuffers[senderId][category]) {
      SE.playBuffer(this.remoteBuffers[senderId][category], 1.15, this.volume);
      return;
    }

    if (charId === 'custom') {
      if (this.customBuffers[category]) {
        SE.playBuffer(this.customBuffers[category], 1.15, this.volume);
      }
      return;
    }

    if (!charName) return;
    const resolved = await this.resolveCharacterVoice(category, charName);
    if (!resolved || resolved.type === 'none') return;
    if (resolved.type === 'buffer') {
      SE.playBuffer(resolved.data, 1.15, this.volume);
    } else if (resolved.type === 'url') {
      this.playFallbackUrl(resolved.data);
    }
  }
};

// iOS等(WebKit)での音量調整不具合解消＆file://環境フォールバック付き BGMラッパー
class WebAudioBGMPlayer {
  constructor(ctx, src = '') {
    this.ctx = ctx;
    this.gainNode = ctx.createGain();
    this.gainNode.connect(ctx.destination);
    this.source = null;
    this.buffer = null;
    
    this.fallbackAudio = new Audio();
    this.fallbackAudio.preload = 'auto';
    this.useFallback = false;
    this._unlocked = false;
    this._unlockReqId = 0;
    this.fallbackAudio.addEventListener('ended', () => {
      if (this.useFallback && !this._isManualStop) {
        this.isPlaying = false;
        this.pauseTime = 0;
        if (this.onended) this.onended();
      }
    });

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
      this._unlockReqId++;
      this._src = value;
      this.pauseTime = 0;
      this.buffer = null;
      this.useFallback = false;
      this.fallbackAudio.src = '';
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
    this.gainNode.gain.value = this._muted ? 0 : this._volume;
    this.fallbackAudio.volume = Math.max(0, Math.min(1, this._volume));
    this.fallbackAudio.muted = !!this._muted;
  }
  
  get currentTime() {
    if (this.useFallback) {
      return this.fallbackAudio.currentTime || 0;
    }
    if (this.isPlaying) {
      let t = this.pauseTime + (this.ctx.currentTime - this.startTime);
      if (this.buffer && this.loop) return t % this.buffer.duration;
      if (this.buffer && t >= this.buffer.duration) return this.buffer.duration;
      return t;
    }
    return this.pauseTime;
  }
  set currentTime(v) {
    if (this.useFallback) {
      try { this.fallbackAudio.currentTime = v; } catch (e) {}
      this.pauseTime = v;
      return;
    }
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

  activateFallbackSync(targetSrc) {
    this.buffer = null;
    this.useFallback = true;
    if (this.fallbackAudio.getAttribute('src') !== targetSrc) {
      this.fallbackAudio.src = targetSrc;
      this.fallbackAudio.load();
    }
    this.fallbackAudio.loop = this.loop;
    this.updateGain();
  }

  unlock() {
    if (!this.useFallback || !this._src || this._unlocked) return;
    const unlockId = ++this._unlockReqId;
    this.fallbackAudio.muted = true;
    try {
      const p = this.fallbackAudio.play();
      if (p && typeof p.then === 'function') {
        p.then(() => {
          this._unlocked = true;
          if (!this.isPlaying && this._unlockReqId === unlockId) {
            this.fallbackAudio.pause();
            try { this.fallbackAudio.currentTime = 0; } catch (e) {}
            this.updateGain();
          }
        }).catch(() => {
          this.updateGain();
        });
      }
    } catch (e) {
      this.updateGain();
    }
  }
  
  async load() {
    if (!this._src) return;
    if (this.buffer || this.useFallback) return;
    if (this._loadingPromise && this._loadingSrc === this._src) {
      return this._loadingPromise;
    }
    const targetSrc = this._src;
    const isFileProto = (location.protocol === 'file:');
    if (isFileProto && !targetSrc.startsWith('data:')) {
      this.activateFallbackSync(targetSrc);
      return Promise.resolve();
    }

    this._loadingSrc = targetSrc;
    this._loadingPromise = (async () => {
      try {
        const response = await fetch(targetSrc);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const arrayBuffer = await response.arrayBuffer();
        const decoded = await this.ctx.decodeAudioData(arrayBuffer);
        if (this._src === targetSrc) {
          this.buffer = decoded;
        }
        return;
      } catch (e) {
        console.warn('BGM WebAudio Load Error (using HTMLAudio fallback):', e);
      }
      if (this._src === targetSrc) {
        this.activateFallbackSync(targetSrc);
      }
    })().finally(() => {
      if (this._loadingSrc === targetSrc) {
        this._loadingPromise = null;
      }
    });
    return this._loadingPromise;
  }
  
  async play() {
    const reqId = ++this._playRequestId;
    this._unlockReqId++;
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume().catch(() => {});
      if (reqId !== this._playRequestId) return Promise.resolve();
    }
    if (!this.buffer && !this.useFallback) {
      await this.load();
      if (reqId !== this._playRequestId) return Promise.resolve();
    }

    if (this.useFallback) {
      if (this.isPlaying) this.pause(false);
      if (reqId !== this._playRequestId) return Promise.resolve();
      this._isManualStop = false;
      this.fallbackAudio.loop = this.loop;
      this.updateGain();
      try {
        if (this.pauseTime === 0) {
          this.fallbackAudio.currentTime = 0;
        } else if (this.pauseTime > 0 && isFinite(this.fallbackAudio.duration) && this.pauseTime < this.fallbackAudio.duration) {
          this.fallbackAudio.currentTime = this.pauseTime;
        }
      } catch (e) {}
      this.isPlaying = true;
      try {
        await this.fallbackAudio.play();
        this._unlocked = true;
      } catch (e) {
        this.isPlaying = false;
        console.warn('Fallback BGM play error:', e);
      }
      return Promise.resolve();
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
        if (this.onended) this.onended();
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
    if (this.useFallback) {
      this._unlockReqId++;
      if (this.isPlaying) {
        this._isManualStop = true;
        this.pauseTime = this.fallbackAudio.currentTime || 0;
        this.fallbackAudio.pause();
        this.isPlaying = false;
      }
      return;
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
const savedVoiceVol = localStorage.getItem('pdw_voice_vol');
if (savedVoiceVol !== null) VOICE.volume = parseFloat(savedVoiceVol);
const savedBgmVol = localStorage.getItem('pdw_bgm_vol');
let initBgmVol = savedBgmVol !== null ? parseFloat(savedBgmVol) : 0.5;

bgmAudio.volume = initBgmVol;
bgmAudio.muted = false;
panicBgmAudio.volume = initBgmVol; 
panicBgmAudio.muted = true; 

document.getElementById('se-volume').value = SE.volume;
document.getElementById('se-volume-val').innerText = Math.round(SE.volume * 100);
const voiceVolEl = document.getElementById('voice-volume');
const voiceVolValEl = document.getElementById('voice-volume-val');
if (voiceVolEl && voiceVolValEl) {
  voiceVolEl.value = VOICE.volume;
  voiceVolValEl.innerText = Math.round(VOICE.volume * 100);
  voiceVolEl.addEventListener('input', (e) => {
    VOICE.volume = parseFloat(e.target.value);
    voiceVolValEl.innerText = Math.round(VOICE.volume * 100);
    localStorage.setItem('pdw_voice_vol', VOICE.volume);
  });
}
document.getElementById('bgm-volume').value = initBgmVol;
document.getElementById('bgm-volume-val').innerText = Math.round(initBgmVol * 100);

document.getElementById('se-volume').addEventListener('input', (e) => {
  SE.volume = parseFloat(e.target.value);
  document.getElementById('se-volume-val').innerText = Math.round(SE.volume * 100);
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
  document.getElementById('bgm-volume-val').innerText = Math.round(vol * 100);
  localStorage.setItem('pdw_bgm_vol', vol);
});

function isAudioFileCandidate(file) {
  if (!file) return false;
  if (file.type && (file.type.startsWith('audio/') || file.type === 'video/mp4')) return true;
  return /\.(mp3|m4a|aac|wav|ogg|opus|webm|flac)$/i.test(file.name || '');
}

function handleBgmFiles(files) {
  const arr = Array.from(files).filter(isAudioFileCandidate);
  if (arr.length > 0) {
    bgmPlaylist = arr;
    currentBgmIndex = 0;
    const expectedFile = bgmPlaylist[currentBgmIndex];
    bgmAudio.src = URL.createObjectURL(expectedFile);
    bgmAudio._currentFile = expectedFile;
    bgmNeedsPlay = true;
    showToast(`BGMを${arr.length}曲セットしました。「設定を保存して閉じる」を押すと再生されます`);
  } else {
    showToast('対応する音声ファイルが見つかりませんでした');
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
      panicBgmAudio.load();
      panicBgmAudio.unlock();
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
  bgmAudio.unlock();
  panicBgmAudio.unlock();
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

// ==========================================
// スライダー拡張（バー直接ジャンプ＋つまみドラッグ維持＋桁編集HUD）
// ==========================================
function setRangeValueWithEvents(rangeEl, newVal) {
  const min = parseFloat(rangeEl.min) || 0;
  const max = parseFloat(rangeEl.max) || 100;
  const step = parseFloat(rangeEl.step) || 1;
  const decimals = (String(step).split('.')[1] || '').length;
  let snapped = Math.round((newVal - min) / step) * step + min;
  snapped = Math.max(min, Math.min(max, snapped));
  snapped = Number(snapped.toFixed(decimals));
  if (parseFloat(rangeEl.value) !== snapped) {
    rangeEl.value = String(snapped);
    rangeEl.dispatchEvent(new Event('input', { bubbles: true }));
    rangeEl.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

function enhanceRangeSlider(rangeEl) {
  if (!rangeEl || rangeEl.dataset.enhanced === '1') return;
  rangeEl.dataset.enhanced = '1';

  let draggingFromBar = false;
  const calcValueFromClientX = (clientX) => {
    const rect = rangeEl.getBoundingClientRect();
    const pad = 9;
    const trackW = Math.max(1, rect.width - pad * 2);
    const ratio = Math.max(0, Math.min(1, (clientX - (rect.left + pad)) / trackW));
    const min = parseFloat(rangeEl.min) || 0;
    const max = parseFloat(rangeEl.max) || 100;
    return min + ratio * (max - min);
  };

  rangeEl.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    rangeEl.focus();
    const rect = rangeEl.getBoundingClientRect();
    const min = parseFloat(rangeEl.min) || 0;
    const max = parseFloat(rangeEl.max) || 100;
    const val = parseFloat(rangeEl.value);
    const pad = 9;
    const trackW = Math.max(1, rect.width - pad * 2);
    const thumbX = rect.left + pad + ((val - min) / Math.max(1e-6, max - min)) * trackW;

    if (Math.abs(e.clientX - thumbX) > 15) {
      e.preventDefault();
      draggingFromBar = true;
      try { rangeEl.setPointerCapture(e.pointerId); } catch (_) {}
      setRangeValueWithEvents(rangeEl, calcValueFromClientX(e.clientX));
      SE.play('cursorMove');
    }
  });

  rangeEl.addEventListener('pointermove', (e) => {
    if (!draggingFromBar) return;
    setRangeValueWithEvents(rangeEl, calcValueFromClientX(e.clientX));
  });

  const endBarDrag = (e) => {
    if (!draggingFromBar) return;
    draggingFromBar = false;
    try { rangeEl.releasePointerCapture(e.pointerId); } catch (_) {}
  };
  rangeEl.addEventListener('pointerup', endBarDrag);
  rangeEl.addEventListener('pointercancel', endBarDrag);
}

function enhanceAllRangeSliders() {
  document.querySelectorAll('input[type="range"]').forEach(enhanceRangeSlider);
}

const rangeEditState = {
  el: null,
  digitIndex: 0
};

function getRangeDisplayMeta(rangeEl) {
  const min = parseFloat(rangeEl.min) || 0;
  const max = parseFloat(rangeEl.max) || 100;
  const step = parseFloat(rangeEl.step) || 1;
  const isRatioPercent = (max <= 1 && step < 0.1);
  const scale = isRatioPercent ? 100 : 1;
  const intMin = Math.round(min * scale);
  const intMax = Math.round(max * scale);
  const intVal = Math.round(parseFloat(rangeEl.value) * scale);
  const digits = Math.max(2, String(intMax).length);
  const suffix = isRatioPercent ? '%' : '';
  return { scale, intMin, intMax, intVal, digits, suffix };
}

function adjustRangeDigit(rangeEl, digitIdx, deltaSign) {
  const meta = getRangeDisplayMeta(rangeEl);
  const power = Math.pow(10, meta.digits - 1 - digitIdx);
  const nextInt = Math.max(meta.intMin, Math.min(meta.intMax, meta.intVal + deltaSign * power));
  setRangeValueWithEvents(rangeEl, nextInt / meta.scale);
  updateRangeDigitHUD();
  SE.play('cursorMove');
}

function ensureRangeDigitHUD() {
  let hud = document.getElementById('slider-digit-hud');
  if (!hud) {
    hud = document.createElement('div');
    hud.id = 'slider-digit-hud';
    document.body.appendChild(hud);
  }
  return hud;
}

function closeRangeDigitEdit() {
  rangeEditState.el = null;
  const hud = document.getElementById('slider-digit-hud');
  if (hud) hud.style.display = 'none';
}

function updateRangeDigitHUD() {
  const el = rangeEditState.el;
  if (!el || !document.body.contains(el)) {
    closeRangeDigitEdit();
    return;
  }
  const hud = ensureRangeDigitHUD();
  const meta = getRangeDisplayMeta(el);
  if (rangeEditState.digitIndex >= meta.digits) rangeEditState.digitIndex = meta.digits - 1;
  if (rangeEditState.digitIndex < 0) rangeEditState.digitIndex = 0;

  const str = String(meta.intVal).padStart(meta.digits, '0');
  hud.innerHTML = '';

  const row = document.createElement('div');
  row.className = 'slider-digit-row';

  const minusBtn = document.createElement('button');
  minusBtn.type = 'button';
  minusBtn.className = 'small-btn';
  minusBtn.innerText = '▼';
  minusBtn.onclick = () => adjustRangeDigit(el, rangeEditState.digitIndex, -1);
  row.appendChild(minusBtn);

  for (let i = 0; i < meta.digits; i++) {
    const box = document.createElement('button');
    box.type = 'button';
    box.className = 'slider-digit-box' + (i === rangeEditState.digitIndex ? ' active' : '');
    box.innerText = str[i];
    box.onclick = () => {
      rangeEditState.digitIndex = i;
      updateRangeDigitHUD();
      SE.play('cursorMove');
    };
    row.appendChild(box);
  }

  if (meta.suffix) {
    const suf = document.createElement('span');
    suf.style.fontWeight = 'bold';
    suf.innerText = meta.suffix;
    row.appendChild(suf);
  }

  const plusBtn = document.createElement('button');
  plusBtn.type = 'button';
  plusBtn.className = 'small-btn';
  plusBtn.innerText = '▲';
  plusBtn.onclick = () => adjustRangeDigit(el, rangeEditState.digitIndex, 1);
  row.appendChild(plusBtn);

  const doneBtn = document.createElement('button');
  doneBtn.type = 'button';
  doneBtn.className = 'small-btn';
  doneBtn.innerText = '確定';
  doneBtn.onclick = () => closeRangeDigitEdit();
  row.appendChild(doneBtn);

  const hint = document.createElement('div');
  hint.className = 'slider-digit-hint';
  hint.innerText = '◀▶ 桁選択 / ▲▼ 数値変更 / 決定で終了';

  hud.appendChild(row);
  hud.appendChild(hint);
  hud.style.display = 'flex';
}

// --- コンフィグ・ゲームパッド管理（1P〜4P対応） ---
const ACTION_LABELS = {
  Up: '上', Down: '下', Left: '左', Right: '右',
  Swap: '入れ替え / 決定',
  GrabLeft: 'カーソル左つかみ', GrabRight: 'カーソル右つかみ',
  ToggleContinuous: '連続移動オンオフ',
  Rise1: 'せり上げ1', Rise2: 'せり上げ2',
  TargetRight: '標的(右)', TargetLeft: '標的(左)',
  Skill: 'スキル発動 / キャンセル',
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
let currentSettingsTab = 'audio';
let assigningAction = null, assignType = null;

function selectSettingsTab(tabKey) {
  currentSettingsTab = tabKey || 'audio';
  assigningAction = null;
  const tabKeys = ['audio', 'visual', 'zip', 'control'];
  const btns = document.querySelectorAll('#settings-category-tabs button');
  btns.forEach((btn, idx) => {
    btn.classList.toggle('active', tabKeys[idx] === currentSettingsTab);
  });
  tabKeys.forEach(k => {
    const panel = document.getElementById(`settings-panel-${k}`);
    if (panel) panel.style.display = (k === currentSettingsTab) ? 'block' : 'none';
  });
  if (currentSettingsTab === 'control') {
    selectSettingsPlayer(settingsPlayerIdx);
  }
  enhanceAllRangeSliders();
}

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
  selectSettingsTab(currentSettingsTab || 'audio');
  enhanceAllRangeSliders();
}

function closeSettings() { 
  closeRangeDigitEdit();
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
      panicBgmAudio.load();
      panicBgmAudio.unlock();
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
let globalPadHold = { Up: 0, Down: 0, Left: 0, Right: 0 };
const GLOBAL_PAD_DAS = 10;
const GLOBAL_PAD_ARR = 2;

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
  if (!pad) {
    globalPadHold = { Up: 0, Down: 0, Left: 0, Right: 0 };
    return;
  }
  let pressed = {};
  pad.buttons.forEach((b, i) => pressed[i] = b.pressed);
  
  const justPressed = (btnIdx) => btnIdx !== null && btnIdx !== undefined && pressed[btnIdx] && !globalPadPrevState[btnIdx];
  const isDirRepeat = (dirName, btnIdx) => {
    if (btnIdx === null || btnIdx === undefined || !pressed[btnIdx]) {
      globalPadHold[dirName] = 0;
      return false;
    }
    const f = globalPadHold[dirName]++;
    return f === 0 || (f >= GLOBAL_PAD_DAS && (f - GLOBAL_PAD_DAS) % GLOBAL_PAD_ARR === 0);
  };

  const isBattleEndShown = document.getElementById('battle-end-overlay')?.style.display === 'flex';
  const isSharePrepShown = document.getElementById('share-prep-overlay')?.style.display === 'flex';
  const isGameAreaShown = document.getElementById('game-area')?.style.display === 'flex';
  
  if (!isGameAreaShown && !isBattleEndShown && !isSharePrepShown && typeof matchState !== 'undefined' && matchState !== 'playing') {
    const activeEl = document.activeElement;
    const isSelect = activeEl && activeEl.tagName === 'SELECT';
    const isRange = activeEl && activeEl.tagName === 'INPUT' && activeEl.type === 'range';
    const isCheckbox = activeEl && activeEl.tagName === 'INPUT' && activeEl.type === 'checkbox';

    if (rangeEditState.el && rangeEditState.el !== activeEl) {
      closeRangeDigitEdit();
    }

    if (justPressed(padConfig.Skill)) {
      if (rangeEditState.el) {
        closeRangeDigitEdit();
        SE.play('cursorMove');
      } else if (typeof handleMenuCancelAction === 'function') {
        handleMenuCancelAction();
      }
    } else if (isSelect) {
      if (isDirRepeat('Left', padConfig.Left)) {
        if (activeEl.selectedIndex > 0) {
          activeEl.selectedIndex--;
          activeEl.dispatchEvent(new Event('change', { bubbles: true }));
          SE.play('cursorMove');
        }
      } else if (isDirRepeat('Right', padConfig.Right)) {
        if (activeEl.selectedIndex < activeEl.options.length - 1) {
          activeEl.selectedIndex++;
          activeEl.dispatchEvent(new Event('change', { bubbles: true }));
          SE.play('cursorMove');
        }
      } else if (isDirRepeat('Up', padConfig.Up)) {
        moveMenuFocus(-1);
      } else if (isDirRepeat('Down', padConfig.Down)) {
        moveMenuFocus(1);
      }
    } else if (isRange) {
      const step = parseFloat(activeEl.step) || 1;
      const min = parseFloat(activeEl.min) || 0;
      const max = parseFloat(activeEl.max) || 100;

      if (rangeEditState.el === activeEl) {
        const meta = getRangeDisplayMeta(activeEl);
        if (isDirRepeat('Left', padConfig.Left)) {
          rangeEditState.digitIndex = Math.max(0, rangeEditState.digitIndex - 1);
          updateRangeDigitHUD();
          SE.play('cursorMove');
        } else if (isDirRepeat('Right', padConfig.Right)) {
          rangeEditState.digitIndex = Math.min(meta.digits - 1, rangeEditState.digitIndex + 1);
          updateRangeDigitHUD();
          SE.play('cursorMove');
        } else if (isDirRepeat('Up', padConfig.Up)) {
          adjustRangeDigit(activeEl, rangeEditState.digitIndex, 1);
        } else if (isDirRepeat('Down', padConfig.Down)) {
          adjustRangeDigit(activeEl, rangeEditState.digitIndex, -1);
        }
        if (justPressed(padConfig.Swap) || justPressed(padConfig.GrabRight)) {
          closeRangeDigitEdit();
          SE.play('cursorMove');
        }
      } else {
        let val = parseFloat(activeEl.value);
        if (isDirRepeat('Left', padConfig.Left)) {
          setRangeValueWithEvents(activeEl, Math.max(min, val - step));
          SE.play('cursorMove');
        } else if (isDirRepeat('Right', padConfig.Right)) {
          setRangeValueWithEvents(activeEl, Math.min(max, val + step));
          SE.play('cursorMove');
        } else if (isDirRepeat('Up', padConfig.Up)) {
          moveMenuFocus(-1);
        } else if (isDirRepeat('Down', padConfig.Down)) {
          moveMenuFocus(1);
        }
        if (justPressed(padConfig.Swap)) {
          rangeEditState.el = activeEl;
          rangeEditState.digitIndex = 0;
          updateRangeDigitHUD();
          SE.play('cursorMove');
        }
      }
    } else {
      if (isDirRepeat('Up', padConfig.Up) || isDirRepeat('Left', padConfig.Left)) {
        moveMenuFocus(-1);
      }
      if (isDirRepeat('Down', padConfig.Down) || isDirRepeat('Right', padConfig.Right)) {
        moveMenuFocus(1);
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
  } else {
    globalPadHold = { Up: 0, Down: 0, Left: 0, Right: 0 };
    if (rangeEditState.el) closeRangeDigitEdit();
  }
  globalPadPrevState = { ...pressed };
}, 1000 / 30);

function moveMenuFocus(dir) {
  const focusables = Array.from(document.querySelectorAll('button, select, input, [tabindex]:not([tabindex="-1"])'))
    .filter(el => {
      if (el.disabled) return false;
      if (el.closest('#slider-digit-hud')) return false;
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