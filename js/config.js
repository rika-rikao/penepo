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
// ロードアニメーション & 画面遷移トランジション管理
// ==========================================
const AppLoader = {
  _hidden: false,
  show(text = 'アセットを読み込み中...') {
    const el = document.getElementById('app-loader-overlay');
    if (!el) return;
    this._hidden = false;
    el.classList.remove('fade-out');
    el.style.display = 'flex';
    this.setProgress(8, text);
  },
  setProgress(pct, text = null) {
    const fill = document.getElementById('app-loader-bar-fill');
    const txt = document.getElementById('app-loader-text');
    if (fill) fill.style.width = `${Math.max(5, Math.min(100, pct))}%`;
    if (txt && text) txt.innerText = text;
  },
  hide() {
    if (this._hidden) return;
    this._hidden = true;
    const el = document.getElementById('app-loader-overlay');
    if (!el) return;
    this.setProgress(100, '準備完了！');
    setTimeout(() => {
      el.classList.add('fade-out');
      setTimeout(() => {
        if (this._hidden) el.style.display = 'none';
      }, 360);
    }, 160);
  }
};

const BusyLoader = {
  show(title = '処理中...', sub = 'しばらくお待ちください') {
    const el = document.getElementById('busy-loader-overlay');
    if (!el) return;
    const t = document.getElementById('busy-loader-title');
    const s = document.getElementById('busy-loader-sub');
    if (t) t.innerText = title;
    if (s) s.innerText = sub;
    el.style.display = 'flex';
  },
  hide() {
    const el = document.getElementById('busy-loader-overlay');
    if (el) el.style.display = 'none';
  }
};

const SceneTransition = {
  _runToken: 0,
  _timer: null,
  async run(labelText, prepareFn, resumeFn) {
    const token = ++this._runToken;
    const el = document.getElementById('scene-transition-overlay');
    const txt = document.getElementById('scene-transition-text');

    if (!el) {
      if (typeof prepareFn === 'function') await prepareFn();
      if (typeof resumeFn === 'function') resumeFn();
      return;
    }

    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }

    if (txt) txt.innerText = labelText || 'LOADING...';
    el.style.display = 'flex';
    el.classList.remove('active');

    await new Promise(resolve => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          el.classList.add('active');
          setTimeout(resolve, 180);
        });
      });
    });
    if (token !== this._runToken) return;

    const minWait = new Promise(resolve => setTimeout(resolve, 200));
    try {
      if (typeof prepareFn === 'function') {
        await Promise.all([Promise.resolve(prepareFn()), minWait]);
      } else {
        await minWait;
      }
    } catch (e) {
      console.error('SceneTransition prepare error:', e);
    }
    if (token !== this._runToken) return;

    await new Promise(resolve => requestAnimationFrame(() => resolve()));
    if (token !== this._runToken) return;

    el.classList.remove('active');
    this._timer = setTimeout(() => {
      if (token !== this._runToken) return;
      el.style.display = 'none';
      this._timer = null;
      if (typeof resumeFn === 'function') resumeFn();
    }, 180);
  },
  play(midCallback) {
    return this.run('LOADING...', midCallback, null);
  }
};

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
    select: 'assets/se/select.m4a',
    cancel: 'assets/se/cancel.m4a',
    skillFilled: 'assets/se/skill_filled.m4a',
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
  customRawMap: {},
  remoteBuffers: {},
  volume: 0.5,
  readyPromise: null,
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
SE.readyPromise = SE.load();

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
  resolvedCache: {},
  resolvingMap: {},
  customBuffers: {},
  customRawMap: {},
  remoteBuffers: {},
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
        } catch (_) {}
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
  });
}
document.getElementById('bgm-volume').value = initBgmVol;
document.getElementById('bgm-volume-val').innerText = Math.round(initBgmVol * 100);

document.getElementById('se-volume').addEventListener('input', (e) => {
  SE.volume = parseFloat(e.target.value);
  document.getElementById('se-volume-val').innerText = Math.round(SE.volume * 100);
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
    showToast(`BGMを${arr.length}曲セットしました。「保存して閉じる」を押すと再生されます`);
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
// プルダウン選択モーダル（決定ボタンで一覧から選択）
// ==========================================
let activeSelectPickerEl = null;

function openSelectPickerModal(selectEl, titleText = null) {
  if (!selectEl || selectEl.tagName !== 'SELECT') return;
  const modal = document.getElementById('select-picker-modal');
  const titleEl = document.getElementById('select-picker-title');
  const optionsEl = document.getElementById('select-picker-options');
  if (!modal || !optionsEl) return;

  activeSelectPickerEl = selectEl;
  if (titleEl) {
    let label = titleText;
    if (!label && selectEl.id === 'local-player-count') label = '対戦人数を選択';
    else if (!label && selectEl.id === 'online-max-players') label = 'オンライン最大人数を選択';
    else if (!label && selectEl.id === 'settings-pad-slot') label = '使用ゲームパッド番号';
    else if (!label && selectEl.id === 'settings-hub-char') label = 'ホーム立ち絵を選択';
    titleEl.innerText = label || '選択してください';
  }

  optionsEl.innerHTML = '';
  let selectedBtn = null;
  Array.from(selectEl.options).forEach((opt) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    const isSel = opt.value === selectEl.value;
    btn.className = 'select-picker-opt-btn' + (isSel ? ' selected' : '');
    const txtSpan = document.createElement('span');
    txtSpan.innerText = opt.textContent || opt.label || opt.value;
    btn.appendChild(txtSpan);
    if (isSel) {
      const chk = document.createElement('span');
      chk.innerText = '✓';
      chk.style.color = '#4ecca3';
      btn.appendChild(chk);
      selectedBtn = btn;
    }
    btn.onclick = () => {
      if (selectEl.value !== opt.value) {
        selectEl.value = opt.value;
        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
      }
      SE.play('select');
      closeSelectPickerModal(true);
    };
    optionsEl.appendChild(btn);
  });

  modal.style.display = 'flex';
  const focusTarget = selectedBtn || optionsEl.querySelector('button');
  if (focusTarget) focusTarget.focus();
}

function closeSelectPickerModal(silent = false) {
  const modal = document.getElementById('select-picker-modal');
  if (modal) modal.style.display = 'none';
  if (!silent) SE.play('cancel');
  const target = activeSelectPickerEl;
  activeSelectPickerEl = null;
  if (target && document.body.contains(target)) {
    const style = window.getComputedStyle(target);
    if (style.display !== 'none' && style.visibility !== 'hidden') {
      target.focus();
    }
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
  if (!rangeEl || rangeEl.dataset.enhanced === '1' || rangeEl.classList.contains('cf-slider')) return;
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
  doneBtn.onclick = () => { closeRangeDigitEdit(); SE.play('select'); };
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
let pendingConfigFocus = null;
let settingsSnapshot = null;

function selectSettingsTab(tabKey) {
  currentSettingsTab = tabKey || 'audio';
  assigningAction = null;
  pendingConfigFocus = null;
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
  pendingConfigFocus = null;
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
  SE.play('select');
  settingsSnapshot = {
    bgmVol: parseFloat(document.getElementById('bgm-volume')?.value ?? bgmAudio.volume),
    seVol: SE.volume,
    voiceVol: VOICE.volume,
    playerCustomName: typeof playerCustomName !== 'undefined' ? playerCustomName : '',
    hubPortraitMode: typeof hubPortraitMode !== 'undefined' ? hubPortraitMode : 'random',
    selectedCharId: typeof selectedCharId !== 'undefined' ? selectedCharId : 'main00',
    storySelectedCharId: typeof storySelectedCharId !== 'undefined' ? storySelectedCharId : 'main00',
    playerConfigs: JSON.parse(JSON.stringify(playerConfigs)),
    customAssets: typeof CustomAssets !== 'undefined' ? {
      chara: CustomAssets.chara ? { ...CustomAssets.chara } : null,
      bg: CustomAssets.bg ? { ...CustomAssets.bg } : null,
      frame: CustomAssets.frame ? { ...CustomAssets.frame } : null
    } : null,
    customVoices: {
      buffers: { ...VOICE.customBuffers },
      raw: JSON.parse(JSON.stringify(VOICE.customRawMap))
    },
    customSE: {
      buffers: { ...SE.customBuffers },
      raw: JSON.parse(JSON.stringify(SE.customRawMap))
    },
    bgmPlaylist: [...bgmPlaylist],
    currentBgmIndex,
    bgmNeedsPlay
  };

  if (typeof refreshHubCharSelectOptions === 'function') {
    refreshHubCharSelectOptions();
  }
  document.getElementById('settings-overlay').style.display = 'block';
  selectSettingsTab(currentSettingsTab || 'audio');
  enhanceAllRangeSliders();
  const firstTabBtn = document.querySelector('#settings-category-tabs button');
  if (firstTabBtn) firstTabBtn.focus();
}

async function cancelSettings() {
  closeRangeDigitEdit();
  closeSelectPickerModal(true);
  assigningAction = null;
  pendingConfigFocus = null;
  if (settingsSnapshot) {
    const snap = settingsSnapshot;
    SE.volume = snap.seVol;
    VOICE.volume = snap.voiceVol;
    bgmAudio.volume = snap.bgmVol;
    panicBgmAudio.volume = snap.bgmVol;

    const seEl = document.getElementById('se-volume');
    const seVal = document.getElementById('se-volume-val');
    if (seEl) seEl.value = snap.seVol;
    if (seVal) seVal.innerText = Math.round(snap.seVol * 100);

    const vEl = document.getElementById('voice-volume');
    const vVal = document.getElementById('voice-volume-val');
    if (vEl) vEl.value = snap.voiceVol;
    if (vVal) vVal.innerText = Math.round(snap.voiceVol * 100);

    const bEl = document.getElementById('bgm-volume');
    const bVal = document.getElementById('bgm-volume-val');
    if (bEl) bEl.value = snap.bgmVol;
    if (bVal) bVal.innerText = Math.round(snap.bgmVol * 100);

    snap.playerConfigs.forEach((sc, idx) => {
      playerConfigs[idx].padSlot = sc.padSlot;
      Object.assign(playerConfigs[idx].key, sc.key);
      Object.assign(playerConfigs[idx].pad, sc.pad);
    });

    if (typeof playerCustomName !== 'undefined') {
      playerCustomName = snap.playerCustomName;
      const nameInput = document.getElementById('settings-player-name');
      if (nameInput) nameInput.value = playerCustomName;
    }
    if (typeof hubPortraitMode !== 'undefined') {
      hubPortraitMode = snap.hubPortraitMode;
      const hubSel = document.getElementById('settings-hub-char');
      if (hubSel) hubSel.value = hubPortraitMode;
    }
    if (typeof selectedCharId !== 'undefined') selectedCharId = snap.selectedCharId;
    if (typeof storySelectedCharId !== 'undefined') storySelectedCharId = snap.storySelectedCharId;

    if (snap.customAssets && typeof CustomAssets !== 'undefined') {
      for (const k of ['chara', 'bg', 'frame']) {
        CustomAssets[k] = snap.customAssets[k];
        if (typeof saveCustomAssetDB === 'function' && typeof deleteCustomAssetDB === 'function') {
          if (snap.customAssets[k]) await saveCustomAssetDB(k, snap.customAssets[k]).catch(() => {});
          else await deleteCustomAssetDB(k).catch(() => {});
        }
      }
      if (typeof applyGlobalFrameTheme === 'function') {
        applyGlobalFrameTheme(CustomAssets.frame ? CustomAssets.frame.dataUrl : null);
      }
    }

    if (snap.customVoices) {
      const prevCats = new Set(Object.keys(VOICE.customRawMap));
      VOICE.customBuffers = { ...snap.customVoices.buffers };
      VOICE.customRawMap = snap.customVoices.raw;
      for (const cat of ['attack', 'win', 'lose']) {
        if (typeof saveCustomAssetDB === 'function' && typeof deleteCustomAssetDB === 'function') {
          if (VOICE.customRawMap[cat]) await saveCustomAssetDB(`voice_${cat}`, VOICE.customRawMap[cat]).catch(() => {});
          else if (prevCats.has(cat)) await deleteCustomAssetDB(`voice_${cat}`).catch(() => {});
        }
      }
    }

    if (snap.customSE) {
      const allKeys = new Set([...Object.keys(SE.customRawMap), ...Object.keys(snap.customSE.raw)]);
      SE.customBuffers = { ...snap.customSE.buffers };
      SE.customRawMap = snap.customSE.raw;
      for (const k of allKeys) {
        if (typeof saveCustomAssetDB === 'function' && typeof deleteCustomAssetDB === 'function') {
          if (SE.customRawMap[k]) await saveCustomAssetDB(`se_${k}`, SE.customRawMap[k]).catch(() => {});
          else await deleteCustomAssetDB(`se_${k}`).catch(() => {});
        }
      }
    }

    bgmPlaylist = [...snap.bgmPlaylist];
    currentBgmIndex = snap.currentBgmIndex;
    bgmNeedsPlay = snap.bgmNeedsPlay;

    if (typeof refreshCustomAssetsUI === 'function') refreshCustomAssetsUI();
    if (typeof refreshMenuHeaderAndPreview === 'function') refreshMenuHeaderAndPreview();
  }

  settingsSnapshot = null;
  document.getElementById('settings-overlay').style.display = 'none';
  SE.play('cancel');
  showToast('変更を保存せずに戻りました');
}

function closeSettings() {
  closeRangeDigitEdit();
  closeSelectPickerModal(true);
  document.getElementById('settings-overlay').style.display = 'none';
  assigningAction = null;
  pendingConfigFocus = null;
  settingsSnapshot = null;

  localStorage.setItem('pdw_se_vol', SE.volume);
  localStorage.setItem('pdw_voice_vol', VOICE.volume);
  localStorage.setItem('pdw_bgm_vol', bgmAudio.volume);
  if (typeof playerCustomName !== 'undefined') {
    localStorage.setItem('pdw_player_name', playerCustomName);
  }
  if (typeof hubPortraitMode !== 'undefined') {
    localStorage.setItem('pdw_hub_char', hubPortraitMode);
  }
  if (typeof selectedCharId !== 'undefined') {
    localStorage.setItem('pdw_char_id', selectedCharId);
  }
  if (typeof storySelectedCharId !== 'undefined') {
    localStorage.setItem('pdw_story_char_id', storySelectedCharId);
  }

  localStorage.setItem('pdw_key', JSON.stringify(keyConfig));
  localStorage.setItem('pdw_pad', JSON.stringify(padConfig));
  localStorage.setItem('pdw_pad_slot_0', String(playerConfigs[0].padSlot));
  localStorage.setItem('pdw_multi_configs', JSON.stringify({
    1: playerConfigs[1],
    2: playerConfigs[2],
    3: playerConfigs[3]
  }));

  SE.play('select');

  if (typeof refreshMenuHeaderAndPreview === 'function') {
    refreshMenuHeaderAndPreview(true);
  }

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

  let restoreTarget = pendingConfigFocus ? { ...pendingConfigFocus } : null;
  if (!restoreTarget && document.activeElement && list.contains(document.activeElement)) {
    const actEl = document.activeElement;
    if (actEl.dataset && actEl.dataset.cfgAction && actEl.dataset.cfgType) {
      restoreTarget = { action: actEl.dataset.cfgAction, type: actEl.dataset.cfgType };
    }
  }

  const cfg = playerConfigs[settingsPlayerIdx];
  list.innerHTML = '';
  Object.keys(ACTION_LABELS).forEach(action => {
    const row = document.createElement('div');
    row.style.display = 'flex'; row.style.justifyContent = 'space-between'; row.style.alignItems = 'center'; row.style.gap = '6px';
    
    const lbl = document.createElement('span'); 
    lbl.innerText = ACTION_LABELS[action]; 
    lbl.style.flex = '1'; lbl.style.fontSize = '0.8rem';
    
    const kBtn = document.createElement('button');
    kBtn.type = 'button';
    kBtn.className = 'config-btn';
    kBtn.dataset.cfgAction = action;
    kBtn.dataset.cfgType = 'key';
    kBtn.style.width = '95px'; kBtn.style.flexShrink = '0';
    const rawKey = cfg.key[action] || '';
    kBtn.innerText = `Key: ${rawKey ? rawKey.replace('Arrow','').replace('Key','') : 'なし'}`;
    kBtn.onclick = () => {
      assigningAction = action;
      assignType = 'key';
      pendingConfigFocus = { action, type: 'key' };
      kBtn.innerText = '押してください';
      kBtn.focus({ preventScroll: true });
    };
    
    const pBtn = document.createElement('button');
    pBtn.type = 'button';
    pBtn.className = 'config-btn';
    pBtn.dataset.cfgAction = action;
    pBtn.dataset.cfgType = 'pad';
    pBtn.style.width = '95px'; pBtn.style.flexShrink = '0';
    pBtn.innerText = `Pad: ${cfg.pad[action] !== null && cfg.pad[action] !== undefined ? cfg.pad[action] : 'なし'}`;
    pBtn.onclick = () => {
      assigningAction = action;
      assignType = 'pad';
      pendingConfigFocus = { action, type: 'pad' };
      pBtn.innerText = '押してください';
      pBtn.focus({ preventScroll: true });
    };
    
    row.append(lbl, kBtn, pBtn);
    list.appendChild(row);
  });

  if (restoreTarget) {
    const targetBtn = Array.from(list.querySelectorAll('button')).find(
      b => b.dataset.cfgAction === restoreTarget.action && b.dataset.cfgType === restoreTarget.type
    );
    if (targetBtn) {
      targetBtn.focus({ preventScroll: true });
    }
    if (!assigningAction) {
      pendingConfigFocus = null;
    }
  }
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

function getActiveMenuFocusScope() {
  const modalIds = [
    'exit-confirm-modal',
    'select-picker-modal',
    'confirm-match-modal',
    'skill-select-modal',
    'settings-overlay',
    'result-overlay',
    'countdown-overlay',
    'room-waiting',
    'share-prep-overlay',
    'story-overlay'
  ];
  for (const id of modalIds) {
    const el = document.getElementById(id);
    if (el && window.getComputedStyle(el).display !== 'none') {
      return el;
    }
  }
  const menuOverlay = document.getElementById('menu-overlay');
  if (menuOverlay && window.getComputedStyle(menuOverlay).display !== 'none') {
    return menuOverlay;
  }
  return document;
}

function getMenuFocusables(scope) {
  return Array.from(scope.querySelectorAll('button, select, input, .cf-stage-wrap, [tabindex]:not([tabindex="-1"])'))
    .filter(el => {
      if (el.disabled) return false;
      if (el.tabIndex < 0) return false;
      if (el.closest('#slider-digit-hud')) return false;
      if (el.classList.contains('cf-nav-btn') || el.classList.contains('cf-slider')) return false;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      let parent = el.parentElement;
      while (parent) {
        if (window.getComputedStyle(parent).display === 'none') return false;
        parent = parent.parentElement;
      }
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
}

function moveMenuFocus(dir) {
  const scope = getActiveMenuFocusScope();
  const focusables = getMenuFocusables(scope);
  if (focusables.length === 0) return;
  let idx = focusables.indexOf(document.activeElement);
  if (idx === -1) {
    if (dir < 0) {
      idx = focusables.length - 1;
    } else {
      const nonBackIdx = focusables.findIndex(el => !el.classList.contains('menu-back-top-btn'));
      idx = nonBackIdx >= 0 ? nonBackIdx : 0;
    }
  } else {
    idx += dir;
    if (idx < 0) idx = focusables.length - 1;
    if (idx >= focusables.length) idx = 0;
  }
  focusables[idx].focus();
  if (typeof focusables[idx].scrollIntoView === 'function') {
    focusables[idx].scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  SE.play('cursorMove');
}

function moveMenuFocus2D(dx, dy) {
  const scope = getActiveMenuFocusScope();
  const focusables = getMenuFocusables(scope);
  if (focusables.length === 0) return false;

  const activeEl = document.activeElement;
  if (!activeEl || !focusables.includes(activeEl)) {
    const nonBackIdx = focusables.findIndex(el => !el.classList.contains('menu-back-top-btn'));
    const initial = focusables[nonBackIdx >= 0 ? nonBackIdx : 0];
    initial.focus();
    if (typeof initial.scrollIntoView === 'function') {
      initial.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    SE.play('cursorMove');
    return true;
  }

  const ar = activeEl.getBoundingClientRect();
  const ax = ar.left + ar.width / 2;
  const ay = ar.top + ar.height / 2;

  let bestEl = null;
  let bestScore = Infinity;

  if (dy !== 0) {
    const isDown = dy > 0;
    for (const el of focusables) {
      if (el === activeEl) continue;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;

      if (isDown ? (cy <= ay + 3) : (cy >= ay - 3)) continue;
      if (isDown ? (r.bottom <= ar.top + 3) : (r.top >= ar.bottom - 3)) continue;

      const overlapX = Math.max(0, Math.min(ar.right, r.right) - Math.max(ar.left, r.left));
      const horizGap = overlapX > 0 ? 0 : Math.min(Math.abs(r.left - ar.right), Math.abs(ar.left - r.right));
      const vertDist = isDown
        ? (r.top >= ar.bottom - 2 ? r.top - ar.bottom : (cy - ay) * 0.45)
        : (ar.top >= r.bottom - 2 ? ar.top - r.bottom : (ay - cy) * 0.45);

      const score = vertDist + horizGap * 3.2 + Math.abs(cx - ax) * 0.22 - (overlapX > 0 ? 45 : 0);
      if (score < bestScore) {
        bestScore = score;
        bestEl = el;
      }
    }
  } else if (dx !== 0) {
    const isRight = dx > 0;
    for (const el of focusables) {
      if (el === activeEl) continue;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;

      if (isRight ? (cx <= ax + 3) : (cx >= ax - 3)) continue;
      if (isRight ? (r.right <= ar.left + 3) : (r.left >= ar.right - 3)) continue;

      const overlapY = Math.max(0, Math.min(ar.bottom, r.bottom) - Math.max(ar.top, r.top));
      if (overlapY <= 0) continue;

      const horizDist = isRight
        ? (r.left >= ar.right - 2 ? r.left - ar.right : (cx - ax) * 0.45)
        : (ar.left >= r.right - 2 ? ar.left - r.right : (ax - cx) * 0.45);
      const score = horizDist + Math.abs(cy - ay) * 0.65;
      if (score < bestScore) {
        bestScore = score;
        bestEl = el;
      }
    }

    // 同じ行に重なる候補がない場合、少し広い縦ズレで左右の隣接要素（例：横2カラム間）を拾う
    if (!bestEl) {
      for (const el of focusables) {
        if (el === activeEl) continue;
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        if (isRight ? (cx <= ax + 6) : (cx >= ax - 6)) continue;
        const vertDist = Math.abs(cy - ay);
        if (vertDist > 42) continue;
        const horizDist = Math.abs(cx - ax);
        const score = horizDist + vertDist * 2.5;
        if (score < bestScore) {
          bestScore = score;
          bestEl = el;
        }
      }
    }
  }

  if (bestEl) {
    bestEl.focus();
    if (typeof bestEl.scrollIntoView === 'function') {
      bestEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    SE.play('cursorMove');
    return true;
  }
  return false;
}

function advanceFromCoverFlow(cfEl) {
  if (!cfEl) return false;
  const grid = cfEl.closest('.mode-two-col-grid');
  if (grid) {
    const rightCol = grid.querySelector('.mode-right-top') || grid.querySelector('.mode-right-bottom');
    if (rightCol) {
      const candidates = getMenuFocusables(rightCol);
      if (candidates.length > 0) {
        candidates[0].focus();
        if (typeof candidates[0].scrollIntoView === 'function') {
          candidates[0].scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
        SE.play('select');
        return true;
      }
    }
  }
  if (moveMenuFocus2D(0, 1)) {
    SE.play('select');
    return true;
  }
  if (moveMenuFocus2D(1, 0)) {
    SE.play('select');
    return true;
  }
  moveMenuFocus(1);
  return true;
}

function processMenuNavigationInput(input) {
  // ストーリー表示中は汎用メニュー移動を行わず、決定=次へ / START=スキップ に専用化
  const storyOverlay = document.getElementById('story-overlay');
  if (storyOverlay && window.getComputedStyle(storyOverlay).display !== 'none') {
    if (input.start || input.cancel) {
      if (typeof StoryManager !== 'undefined') StoryManager.skip();
      return true;
    }
    if (input.confirm || input.altConfirm) {
      if (typeof StoryManager !== 'undefined') StoryManager.advance();
      return true;
    }
    return false;
  }

  const scope = getActiveMenuFocusScope();
  let activeEl = document.activeElement;
  if (activeEl && scope !== document && !scope.contains(activeEl)) {
    activeEl = null;
  }

  const isSelect = activeEl && activeEl.tagName === 'SELECT';
  const isRange = activeEl && activeEl.tagName === 'INPUT' && activeEl.type === 'range';
  const isCoverFlowEl = activeEl && (activeEl.classList.contains('cf-stage-wrap') || activeEl.classList.contains('cf-slider'));
  const isCheckbox = activeEl && activeEl.tagName === 'INPUT' && activeEl.type === 'checkbox';

  if (rangeEditState.el && rangeEditState.el !== activeEl) {
    closeRangeDigitEdit();
  }

  if (input.cancel) {
    if (rangeEditState.el) {
      closeRangeDigitEdit();
      SE.play('cancel');
      return true;
    }
    if (typeof handleMenuCancelAction === 'function') {
      return !!handleMenuCancelAction();
    }
    return false;
  }

  if (input.start && typeof handleMenuStartAction === 'function') {
    if (handleMenuStartAction()) {
      return true;
    }
  }

  // プルダウンは決定ボタンで選択肢モーダルを開き、上下左右は見た目通りに移動
  if (isSelect) {
    if (input.up) { moveMenuFocus2D(0, -1); return true; }
    if (input.down) { moveMenuFocus2D(0, 1); return true; }
    if (input.left) { moveMenuFocus2D(-1, 0); return true; }
    if (input.right) { moveMenuFocus2D(1, 0); return true; }
    if (input.confirm) {
      SE.play('select');
      openSelectPickerModal(activeEl);
      return true;
    }
    return false;
  }

  if (isCoverFlowEl) {
    if (input.left && typeof activeEl._cfStep === 'function') {
      activeEl._cfStep(-1);
      return true;
    }
    if (input.right && typeof activeEl._cfStep === 'function') {
      activeEl._cfStep(1);
      return true;
    }
    if (input.up) { moveMenuFocus2D(0, -1); return true; }
    if (input.down) { moveMenuFocus2D(0, 1); return true; }
    if (input.confirm) {
      if (typeof activeEl._cfConfirm === 'function') {
        SE.play('select');
        activeEl._cfConfirm();
      } else {
        advanceFromCoverFlow(activeEl);
      }
      return true;
    }
    return false;
  }

  if (isRange) {
    const step = parseFloat(activeEl.step) || 1;
    const min = parseFloat(activeEl.min) || 0;
    const max = parseFloat(activeEl.max) || 100;

    if (rangeEditState.el === activeEl) {
      const meta = getRangeDisplayMeta(activeEl);
      if (input.left) {
        rangeEditState.digitIndex = Math.max(0, rangeEditState.digitIndex - 1);
        updateRangeDigitHUD();
        SE.play('cursorMove');
        return true;
      }
      if (input.right) {
        rangeEditState.digitIndex = Math.min(meta.digits - 1, rangeEditState.digitIndex + 1);
        updateRangeDigitHUD();
        SE.play('cursorMove');
        return true;
      }
      if (input.up) {
        adjustRangeDigit(activeEl, rangeEditState.digitIndex, 1);
        return true;
      }
      if (input.down) {
        adjustRangeDigit(activeEl, rangeEditState.digitIndex, -1);
        return true;
      }
      if (input.confirm || input.altConfirm) {
        closeRangeDigitEdit();
        SE.play('select');
        return true;
      }
      return false;
    }

    let val = parseFloat(activeEl.value);
    if (input.left) {
      setRangeValueWithEvents(activeEl, Math.max(min, val - step));
      SE.play('cursorMove');
      return true;
    }
    if (input.right) {
      setRangeValueWithEvents(activeEl, Math.min(max, val + step));
      SE.play('cursorMove');
      return true;
    }
    if (input.up) { moveMenuFocus2D(0, -1); return true; }
    if (input.down) { moveMenuFocus2D(0, 1); return true; }
    if (input.confirm) {
      rangeEditState.el = activeEl;
      rangeEditState.digitIndex = 0;
      updateRangeDigitHUD();
      SE.play('select');
      return true;
    }
    return false;
  }

  if (input.up) {
    moveMenuFocus2D(0, -1);
    return true;
  }
  if (input.down) {
    moveMenuFocus2D(0, 1);
    return true;
  }
  if (input.left) {
    moveMenuFocus2D(-1, 0);
    return true;
  }
  if (input.right) {
    moveMenuFocus2D(1, 0);
    return true;
  }
  if (input.confirm) {
    if (!activeEl || activeEl === document.body || !scope.contains(activeEl)) {
      moveMenuFocus2D(0, 1);
      return true;
    }
    if (isCheckbox) {
      activeEl.checked = !activeEl.checked;
      activeEl.dispatchEvent(new Event('change', { bubbles: true }));
      SE.play('select');
      return true;
    }
    if (typeof activeEl.click === 'function') {
      activeEl.click();
      return true;
    }
  }
  return false;
}

function handleMenuKeyDown(e) {
  const code = e.code;
  const tag = document.activeElement?.tagName;
  const inputType = document.activeElement?.type;
  const isTextInput = tag === 'INPUT' && inputType === 'text';

  if (isTextInput) {
    if (!e.repeat && (code === 'Escape' || code === keyConfig.Pause)) {
      document.activeElement.blur();
      e.preventDefault();
      return true;
    }
    return false;
  }

  const isUp = (code === 'ArrowUp' || code === keyConfig.Up);
  const isDown = (code === 'ArrowDown' || code === keyConfig.Down);
  const isLeft = (code === 'ArrowLeft' || code === keyConfig.Left);
  const isRight = (code === 'ArrowRight' || code === keyConfig.Right);
  const isConfirm = !e.repeat && (code === keyConfig.Swap || code === 'Enter');
  const isAltConfirm = !e.repeat && (code === keyConfig.GrabRight);
  const isStart = !e.repeat && (code === keyConfig.Pause && keyConfig.Pause !== 'Escape');
  const isCancel = !e.repeat && (code === keyConfig.Skill || code === 'Escape');

  if (!isUp && !isDown && !isLeft && !isRight && !isConfirm && !isAltConfirm && !isStart && !isCancel) {
    return false;
  }

  const handled = processMenuNavigationInput({
    up: isUp,
    down: isDown,
    left: isLeft,
    right: isRight,
    confirm: isConfirm,
    altConfirm: isAltConfirm,
    start: isStart,
    cancel: isCancel
  });
  if (handled) e.preventDefault();
  return handled;
}

// ==========================================
// ゲームパッド統一ポーリング・誤複数押し完全防止・コンテキスト切替スナップショット
// ==========================================
let globalPadPrevState = {};
let globalPadHold = { Up: 0, Down: 0, Left: 0, Right: 0 };
let lastPadContextKey = '';
let padInputLockUntil = 0;
let padActionLastTime = {};
const GLOBAL_PAD_DAS = 10;
const GLOBAL_PAD_ARR = 2;

function getPad0Object(pads) {
  const slot0 = playerConfigs[0].padSlot;
  return (slot0 >= 0 && pads[slot0]) ? pads[slot0] : pads.find(p => p && p.connected);
}

function readPadButtonsMap(pad) {
  const pressed = {};
  if (pad && pad.buttons) {
    pad.buttons.forEach((b, i) => { pressed[i] = !!b.pressed; });
  }
  return pressed;
}

function getCurrentPadContextKey() {
  if (document.getElementById('exit-confirm-modal')?.style.display === 'flex') return 'exit-confirm';
  if (document.getElementById('select-picker-modal')?.style.display === 'flex') return 'select-picker';
  if (document.getElementById('confirm-match-modal')?.style.display === 'flex') return 'confirm-modal';
  if (document.getElementById('skill-select-modal')?.style.display === 'flex') return 'skill-modal';
  if (document.getElementById('settings-overlay')?.style.display === 'block') return 'settings';
  if (document.getElementById('result-overlay')?.style.display === 'flex') return 'result';
  if (document.getElementById('countdown-overlay')?.style.display === 'flex') return 'countdown';
  if (document.getElementById('room-waiting')?.style.display === 'flex') return 'room-waiting';
  if (document.getElementById('battle-end-overlay')?.style.display === 'flex') return 'battle-end';
  if (document.getElementById('share-prep-overlay')?.style.display === 'flex') return 'share-prep';
  if (document.getElementById('story-overlay')?.style.display === 'flex') return 'story';
  if (document.getElementById('game-area')?.style.display === 'flex') return 'game';
  if (document.getElementById('local-menu')?.style.display === 'flex') return 'local-menu';

  const subIds = ['main-menu-actions', 'solo-hub-menu', 'multi-hub-menu', 'story-prep-step', 'story-stage-step', 'single-menu', 'com-menu', 'online-menu', 'ranking-menu'];
  for (const id of subIds) {
    const el = document.getElementById(id);
    if (el && window.getComputedStyle(el).display !== 'none') return 'menu:' + id;
  }
  return 'menu';
}

function syncPadSnapshotsAll(lockMs = 150) {
  const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()) : [];
  const pad0 = getPad0Object(pads);
  const pressed0 = readPadButtonsMap(pad0);
  globalPadPrevState = { ...pressed0 };
  globalPadHold = { Up: 0, Down: 0, Left: 0, Right: 0 };
  padInputLockUntil = Math.max(padInputLockUntil, performance.now() + lockMs);

  if (typeof p1InputState !== 'undefined' && p1InputState) {
    p1InputState.prevPadState = { ...pressed0 };
    p1InputState.padState = { ...pressed0 };
    p1InputState.padHoldFrames = { Up: 0, Down: 0, Left: 0, Right: 0 };
  }
  if (typeof localMenuPadPrev !== 'undefined' && Array.isArray(localMenuPadPrev)) {
    for (let i = 0; i < 4; i++) {
      const slot = playerConfigs[i]?.padSlot ?? i;
      const pObj = (slot >= 0 && pads[slot]) ? pads[slot] : null;
      localMenuPadPrev[i] = readPadButtonsMap(pObj);
    }
  }
  lastPadContextKey = getCurrentPadContextKey();
}

setInterval(() => {
  const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()) : [];
  const pad0 = getPad0Object(pads);
  const pressed = readPadButtonsMap(pad0);
  const ctxKey = getCurrentPadContextKey();

  const settingsPadStatus = document.getElementById('settings-pad-status');
  if (settingsPadStatus && document.getElementById('settings-overlay').style.display === 'block') {
    settingsPadStatus.innerText = getConnectedPadsSummaryText();
  }
  const localPadStatus = document.getElementById('local-pad-status');
  const isLocalMenuOpen = (ctxKey === 'local-menu');
  if (localPadStatus && isLocalMenuOpen) {
    localPadStatus.innerText = getConnectedPadsSummaryText();
  }

  // キーコンフィグ（ゲームパッド割り当て待機中）
  if (assigningAction && assignType === 'pad') {
    const targetSlot = playerConfigs[settingsPlayerIdx].padSlot;
    const scanOrder = [];
    if (targetSlot >= 0 && pads[targetSlot]) scanOrder.push(pads[targetSlot]);
    pads.forEach(p => { if (p && !scanOrder.includes(p)) scanOrder.push(p); });

    for (const p of scanOrder) {
      const pressedIdx = p.buttons.findIndex(b => b.pressed);
      if (pressedIdx !== -1) {
        const doneAction = assigningAction;
        pendingConfigFocus = { action: doneAction, type: 'pad' };
        playerConfigs[settingsPlayerIdx].pad[doneAction] = pressedIdx;
        assigningAction = null;
        renderConfigUI();
        SE.play('select');
        // 割り当てボタンを押したままの状態をそのままprevに焼き付けて誤決定を完全防止
        syncPadSnapshotsAll(220);
        return;
      }
    }
    globalPadPrevState = { ...pressed };
    return;
  }

  // 画面コンテキスト切替時は必ずスナップショット同期してそのフレームの発火を抑止
  if (ctxKey !== lastPadContextKey) {
    lastPadContextKey = ctxKey;
    globalPadPrevState = { ...pressed };
    globalPadHold = { Up: 0, Down: 0, Left: 0, Right: 0 };
    padInputLockUntil = Math.max(padInputLockUntil, performance.now() + 140);
    return;
  }

  if (ctxKey === 'local-menu') {
    if (typeof pollLocalMenuGamepads === 'function') {
      pollLocalMenuGamepads(pads);
    }
    globalPadPrevState = { ...pressed };
    return;
  }

  // ゲーム画面中（かつモーダル等なし）・対戦終了画面・シェア準備画面は各自のハンドラに委譲し、ここではprevのみ同期
  if (ctxKey === 'game' || ctxKey === 'battle-end' || ctxKey === 'share-prep') {
    globalPadHold = { Up: 0, Down: 0, Left: 0, Right: 0 };
    if (rangeEditState.el) closeRangeDigitEdit();
    globalPadPrevState = { ...pressed };
    return;
  }

  if (!pad0) {
    globalPadHold = { Up: 0, Down: 0, Left: 0, Right: 0 };
    globalPadPrevState = {};
    return;
  }

  const now = performance.now();
  if (now < padInputLockUntil) {
    globalPadPrevState = { ...pressed };
    return;
  }

  const justPressed = (btnIdx, actionTag = '') => {
    if (btnIdx === null || btnIdx === undefined) return false;
    if (!pressed[btnIdx] || globalPadPrevState[btnIdx]) return false;
    if (actionTag) {
      const lastT = padActionLastTime[actionTag] || 0;
      if (now - lastT < 150) return false;
      padActionLastTime[actionTag] = now;
    }
    return true;
  };
  const isDirRepeat = (dirName, btnIdx) => {
    if (btnIdx === null || btnIdx === undefined || !pressed[btnIdx]) {
      globalPadHold[dirName] = 0;
      return false;
    }
    const f = globalPadHold[dirName]++;
    return f === 0 || (f >= GLOBAL_PAD_DAS && (f - GLOBAL_PAD_DAS) % GLOBAL_PAD_ARR === 0);
  };

  const canMenuPadControl = (ctxKey !== 'game') && (typeof matchState === 'undefined' || matchState !== 'playing' || ctxKey === 'result' || ctxKey === 'exit-confirm' || ctxKey === 'settings' || ctxKey === 'select-picker');

  if (canMenuPadControl) {
    const cancelTrig = justPressed(padConfig.Skill, 'cancel');
    const startTrig = justPressed(padConfig.Pause, 'start');
    const confirmTrig = justPressed(padConfig.Swap, 'confirm');
    const altConfirmTrig = justPressed(padConfig.GrabRight, 'altConfirm');

    const didAction = processMenuNavigationInput({
      up: isDirRepeat('Up', padConfig.Up),
      down: isDirRepeat('Down', padConfig.Down),
      left: isDirRepeat('Left', padConfig.Left),
      right: isDirRepeat('Right', padConfig.Right),
      confirm: confirmTrig,
      altConfirm: altConfirmTrig,
      start: startTrig,
      cancel: cancelTrig
    });

    if (didAction && (confirmTrig || altConfirmTrig || startTrig || cancelTrig)) {
      padInputLockUntil = Math.max(padInputLockUntil, performance.now() + 140);
    }
  } else {
    globalPadHold = { Up: 0, Down: 0, Left: 0, Right: 0 };
    if (rangeEditState.el) closeRangeDigitEdit();
  }

  globalPadPrevState = { ...pressed };
  lastPadContextKey = getCurrentPadContextKey();
}, 1000 / 30);