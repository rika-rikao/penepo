// ==========================================
// PWAインストール管理 & Webサーバー更新チェック起動 & バイブ/GB風モード設定 & 共通メニュー入力/スライダー制御
// ==========================================
let swRegistration = null;
let deferredPwaPrompt = null;
let serverUpdateCheckPromise = null;

let isSwapVibrateEnabled = (localStorage.getItem('pdw_swap_vibrate') !== 'false');
let isGbMode = (localStorage.getItem('pdw_gb_mode') === 'true');
let isAppExiting = false;
const padVibrateResetTimers = {};
const lastVibrateAtByKind = { swap: 0, confirm: 0, garbage: 0 };
let lastShortVibrateAt = 0;

function isAppleMobileDevice() {
  try {
    const ua = navigator.userAgent || '';
    return /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  } catch (_) {
    return false;
  }
}

function isBodyVibrationCapable() {
  if (isAppleMobileDevice()) return false;
  if (!navigator || typeof navigator.vibrate !== 'function') return false;
  const ua = navigator.userAgent || '';
  const plat = navigator.platform || '';
  return /Android|Mobile|Tablet/i.test(ua) || (navigator.maxTouchPoints > 1 && !/Win|Mac/i.test(plat));
}

function hasVibratingGamepad() {
  try {
    const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()) : [];
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i];
      if (p && p.connected && p.vibrationActuator && typeof p.vibrationActuator.playEffect === 'function') {
        return true;
      }
    }
  } catch (_) {}
  return false;
}

function isVibrationCapable() {
  return isBodyVibrationCapable() || hasVibratingGamepad();
}

function isShareModeActiveForVibration() {
  if (typeof currentMode !== 'undefined' && currentMode === 'share') return true;
  const sharePrep = document.getElementById('share-prep-overlay');
  if (sharePrep && sharePrep.style.display === 'flex') return true;
  return false;
}

function stopAllVibration() {
  Object.keys(padVibrateResetTimers).forEach((k) => {
    clearTimeout(padVibrateResetTimers[k]);
    delete padVibrateResetTimers[k];
  });
  if (isBodyVibrationCapable()) {
    try {
      navigator.vibrate(0);
    } catch (_) {}
  }
  try {
    const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()) : [];
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i];
      if (p && p.connected && p.vibrationActuator && typeof p.vibrationActuator.reset === 'function') {
        p.vibrationActuator.reset().catch(() => {});
      }
    }
  } catch (_) {}
}

function applyGbMode(enabled) {
  isGbMode = !!enabled;
  if (document.body) {
    document.body.classList.toggle('gb-mode', isGbMode);
  }
  const el = document.getElementById('settings-gb-mode');
  if (el && el.checked !== isGbMode) el.checked = isGbMode;
}

// 最初のロード画面表示前から即座にGB風モードを反映する
applyGbMode(isGbMode);

function onGbModeToggle(checked) {
  applyGbMode(checked);
  if (typeof SE !== 'undefined') SE.play('select');
}

function onSwapVibrateToggle(checked) {
  isSwapVibrateEnabled = !!checked;
  syncVisualControlSettingToggles();
  if (!isSwapVibrateEnabled) {
    stopAllVibration();
  }
  if (typeof SE !== 'undefined') SE.play('select');
  if (isSwapVibrateEnabled) {
    triggerSwapVibration(true);
  }
}

function onBoardVibrateToggle(checked) {
  isSwapVibrateEnabled = !!checked;
  localStorage.setItem('pdw_swap_vibrate', String(!!isSwapVibrateEnabled));
  syncVisualControlSettingToggles();
  if (!isSwapVibrateEnabled) {
    stopAllVibration();
  }
  if (typeof SE !== 'undefined') SE.play('select');
  if (isSwapVibrateEnabled) {
    triggerSwapVibration(true);
  }
}

function syncBoardVibrateToggleUI() {
  const wrapper = document.getElementById('vibrate-wrapper');
  const toggle = document.getElementById('vibrate-toggle');
  if (toggle && toggle.checked !== !!isSwapVibrateEnabled) {
    toggle.checked = !!isSwapVibrateEnabled;
  }
  if (wrapper) {
    const isShare = (typeof currentMode !== 'undefined' && currentMode === 'share');
    wrapper.style.display = (isVibrationCapable() && !isShare) ? 'flex' : 'none';
  }
}

function syncVisualControlSettingToggles() {
  const gbEl = document.getElementById('settings-gb-mode');
  if (gbEl) gbEl.checked = !!isGbMode;
  const vibEl = document.getElementById('settings-swap-vibrate');
  if (vibEl) vibEl.checked = !!isSwapVibrateEnabled;
  syncBoardVibrateToggleUI();
}

function triggerGameVibration(kind = 'swap', force = false, targetPadSlot = null) {
  if (isAppExiting) return;
  const termOverlay = document.getElementById('app-terminated-overlay');
  if (termOverlay && termOverlay.style.display === 'flex') return;
  if (kind !== 'confirm') {
    const exitModal = document.getElementById('exit-confirm-modal');
    const appExitModal = document.getElementById('app-exit-confirm-modal');
    if ((exitModal && exitModal.style.display === 'flex') || (appExitModal && appExitModal.style.display === 'flex')) {
      return;
    }
  }
  if (isShareModeActiveForVibration()) return;
  if (!isSwapVibrateEnabled) return;

  const now = performance.now();
  const minInterval = kind === 'garbage' ? 110 : (kind === 'confirm' ? 45 : 35);
  if (!force) {
    if (now - (lastVibrateAtByKind[kind] || 0) < minInterval) return;
    if (kind !== 'garbage' && (now - lastShortVibrateAt < 32)) return;
  }
  lastVibrateAtByKind[kind] = now;
  if (kind !== 'garbage') lastShortVibrateAt = now;

  const padParamsMap = {
    swap:    { duration: 48,  weakMagnitude: 0.45, strongMagnitude: 0.20 },
    confirm: { duration: 58,  weakMagnitude: 0.52, strongMagnitude: 0.28 },
    garbage: { duration: 150, weakMagnitude: 0.72, strongMagnitude: 0.90 }
  };
  const bodyPatternMap = {
    swap: 30,
    confirm: 36,
    garbage: [75, 25, 45]
  };
  const padParams = padParamsMap[kind] || padParamsMap.swap;
  const bodyPattern = bodyPatternMap[kind] || bodyPatternMap.swap;

  let padRumbled = false;
  try {
    const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()) : [];
    for (let i = 0; i < pads.length; i++) {
      if (targetPadSlot !== null && targetPadSlot !== undefined) {
        if (targetPadSlot < 0 || i !== targetPadSlot) continue;
      }
      const p = pads[i];
      if (p && p.connected && p.vibrationActuator && typeof p.vibrationActuator.playEffect === 'function') {
        padRumbled = true;
        if (padVibrateResetTimers[i]) {
          clearTimeout(padVibrateResetTimers[i]);
          delete padVibrateResetTimers[i];
        }
        p.vibrationActuator.playEffect('dual-rumble', {
          startDelay: 0,
          duration: padParams.duration,
          weakMagnitude: padParams.weakMagnitude,
          strongMagnitude: padParams.strongMagnitude
        }).catch(() => {});
        if (typeof p.vibrationActuator.reset === 'function') {
          const padIdx = i;
          padVibrateResetTimers[padIdx] = setTimeout(() => {
            delete padVibrateResetTimers[padIdx];
            try {
              const curPads = navigator.getGamepads ? Array.from(navigator.getGamepads()) : [];
              const curPad = curPads[padIdx];
              if (curPad && curPad.connected && curPad.vibrationActuator && typeof curPad.vibrationActuator.reset === 'function') {
                curPad.vibrationActuator.reset().catch(() => {});
              }
            } catch (_) {}
          }, padParams.duration + 25);
        }
      }
    }
  } catch (_) {}

  // ゲームパッド側で振動を実行できた場合は本体側のバイブを鳴らさない
  if (!padRumbled && isBodyVibrationCapable()) {
    try {
      navigator.vibrate(bodyPattern);
    } catch (_) {}
  }
}

function triggerSwapVibration(force = false, targetPadSlot = null) {
  triggerGameVibration('swap', force, targetPadSlot);
}

function triggerConfirmVibration(force = false, targetPadSlot = null) {
  triggerGameVibration('confirm', force, targetPadSlot);
}

function triggerGarbageLandVibration(targetPadSlot = null) {
  triggerGameVibration('garbage', false, targetPadSlot);
}

window.addEventListener('DOMContentLoaded', () => {
  applyGbMode(isGbMode);
  syncVisualControlSettingToggles();
});

window.addEventListener('gamepadconnected', () => {
  syncBoardVibrateToggleUI();
});

window.addEventListener('gamepaddisconnected', () => {
  syncBoardVibrateToggleUI();
});

window.addEventListener('pagehide', stopAllVibration);
window.addEventListener('beforeunload', stopAllVibration);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopAllVibration();
});

function isRunningAsPwa() {
  try {
    if (window.matchMedia && (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      window.matchMedia('(display-mode: minimal-ui)').matches
    )) {
      return true;
    }
    if (window.navigator.standalone === true) return true;
    if (document.referrer && document.referrer.startsWith('android-app://')) return true;
  } catch (_) {}
  return false;
}

function removePwaInstallBar() {
  const bar = document.getElementById('pwa-install-bar');
  if (bar && bar.parentNode) {
    bar.parentNode.removeChild(bar);
  }
}

function initPwaInstallSupport() {
  if (isRunningAsPwa()) {
    document.body.classList.add('is-pwa-standalone');
    removePwaInstallBar();
    return;
  }
  const bar = document.getElementById('pwa-install-bar');
  if (bar) bar.style.display = 'flex';
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPwaPrompt = e;
  initPwaInstallSupport();
});

window.addEventListener('appinstalled', () => {
  deferredPwaPrompt = null;
  document.body.classList.add('is-pwa-standalone');
  removePwaInstallBar();
  if (typeof showToast === 'function') {
    showToast('アプリとしてインストールされました！');
  }
});

async function triggerPwaInstall() {
  if (typeof SE !== 'undefined') SE.play('select');
  if (deferredPwaPrompt) {
    try {
      deferredPwaPrompt.prompt();
      const choice = await deferredPwaPrompt.userChoice;
      deferredPwaPrompt = null;
      if (choice && choice.outcome === 'accepted') {
        removePwaInstallBar();
      }
      return;
    } catch (_) {}
  }

  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const guideModal = document.getElementById('pwa-guide-modal');
  const guideText = document.getElementById('pwa-guide-text');
  if (guideModal && guideText) {
    if (isIOS) {
      guideText.innerHTML = '1. Safari下部の <b>共有ボタン（□に↑）</b> をタップ<br>2. <b>「ホーム画面に追加」</b> を選択<br>3. 右上の <b>「追加」</b> をタップするとアプリとして起動できます！';
    } else {
      guideText.innerHTML = 'ブラウザの右上メニュー（⋮ 等）から<br><b>「アプリをインストール」</b> または <b>「ホーム画面に追加」</b> を選択してください！';
    }
    guideModal.style.display = 'flex';
    const closeBtn = guideModal.querySelector('button');
    if (closeBtn) closeBtn.focus();
  }
}

function closePwaGuideModal(silent = false) {
  const guideModal = document.getElementById('pwa-guide-modal');
  if (guideModal) guideModal.style.display = 'none';
  if (!silent && typeof SE !== 'undefined') SE.play('cancel');
}

// Service Worker登録 & Webサーバー上の更新確認
const swRegisterPromise = ('serviceWorker' in navigator && location.protocol !== 'file:')
  ? navigator.serviceWorker.register('sw.js').then((reg) => {
      swRegistration = reg;
      return reg;
    }).catch((err) => {
      console.warn('SW Register Error:', err);
      return null;
    })
  : Promise.resolve(null);

async function checkServerUpdatesOnBoot() {
  if (location.protocol === 'file:' || !('serviceWorker' in navigator)) return false;
  if (navigator.onLine === false) return false;

  if (sessionStorage.getItem('pdw_update_reloaded') === '1') {
    sessionStorage.removeItem('pdw_update_reloaded');
    return false;
  }

  try {
    const reg = await Promise.race([
      swRegisterPromise,
      new Promise(r => setTimeout(() => r(swRegistration), 1200))
    ]);
    if (!reg) return false;

    try { await Promise.race([reg.update(), new Promise(r => setTimeout(r, 1500))]); } catch (_) {}

    const targetWorker = reg.waiting || reg.installing || navigator.serviceWorker.controller || reg.active;
    if (!targetWorker) return false;

    if (reg.waiting && navigator.serviceWorker.controller) {
      sessionStorage.setItem('pdw_update_reloaded', '1');
      reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      location.reload();
      return true;
    }

    const res = await new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) { settled = true; resolve({ updated: false }); }
      }, 2800);

      try {
        const mc = new MessageChannel();
        mc.port1.onmessage = (ev) => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            resolve(ev.data || { updated: false });
          }
        };
        targetWorker.postMessage({ type: 'CHECK_AND_UPDATE' }, [mc.port2]);
      } catch (_) {
        if (!settled) { settled = true; clearTimeout(timer); resolve({ updated: false }); }
      }
    });

    if (res && res.updated) {
      if (typeof AppLoader !== 'undefined') {
        AppLoader.setProgress(70, '新しいバージョンを更新しています...');
      }
      sessionStorage.setItem('pdw_update_reloaded', '1');
      setTimeout(() => location.reload(), 180);
      return true;
    }
  } catch (e) {
    console.warn('Update check skip:', e);
  }
  return false;
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
  _waitingStart: false,
  show(text = 'アセットを読み込み中...') {
    const el = document.getElementById('app-loader-overlay');
    if (!el) return;
    this._hidden = false;
    this._waitingStart = false;
    el.classList.remove('fade-out', 'ready-to-start');
    el.style.display = 'flex';
    this.setProgress(8, text);
  },
  setProgress(pct, text = null) {
    const fill = document.getElementById('app-loader-bar-fill');
    const txt = document.getElementById('app-loader-text');
    if (fill) fill.style.width = `${Math.max(5, Math.min(100, pct))}%`;
    if (txt && text) txt.innerText = text;
  },
  waitForUserStart(onStart) {
    const el = document.getElementById('app-loader-overlay');
    if (!el || this._hidden) {
      if (typeof onStart === 'function') onStart();
      return;
    }
    if (this._waitingStart) return;
    this._waitingStart = true;

    this.setProgress(100, 'TAP / CLICK / ANY KEY TO START');
    el.classList.add('ready-to-start');

    let started = false;
    let padPollId = null;

    const cleanupListeners = () => {
      el.removeEventListener('pointerdown', handlePointerStart, true);
      el.removeEventListener('click', handleClickStart, true);
      window.removeEventListener('keydown', handleKeyStart, true);
      if (padPollId) {
        clearInterval(padPollId);
        padPollId = null;
      }
      el.classList.remove('ready-to-start');
    };

    const triggerStart = () => {
      if (started) return;
      started = true;
      this._waitingStart = false;
      cleanupListeners();
      if (typeof ensureAudioCtxResumed === 'function') {
        ensureAudioCtxResumed();
      }
      this.hide();
      if (typeof syncPadSnapshotsAll === 'function') {
        syncPadSnapshotsAll(350);
      }
      if (typeof onStart === 'function') {
        onStart();
      }
    };

    const handlePointerStart = (e) => {
      e.preventDefault();
      e.stopPropagation();
      triggerStart();
    };
    const handleClickStart = (e) => {
      e.preventDefault();
      e.stopPropagation();
      triggerStart();
    };
    const handleKeyStart = (e) => {
      if (e.repeat) return;
      e.preventDefault();
      e.stopPropagation();
      triggerStart();
    };

    el.addEventListener('pointerdown', handlePointerStart, true);
    el.addEventListener('click', handleClickStart, true);
    window.addEventListener('keydown', handleKeyStart, true);

    let prevPads = {};
    try {
      const pads0 = navigator.getGamepads ? Array.from(navigator.getGamepads()) : [];
      pads0.forEach((p, pi) => {
        if (p && p.buttons) {
          prevPads[pi] = p.buttons.map(b => !!b.pressed);
        }
      });
    } catch (_) {}

    padPollId = setInterval(() => {
      if (started) return;
      try {
        const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()) : [];
        for (let pi = 0; pi < pads.length; pi++) {
          const p = pads[pi];
          if (!p || !p.connected || !p.buttons) continue;
          const prev = prevPads[pi] || [];
          const pressedNow = p.buttons.some((b, bi) => b.pressed && !prev[bi]);
          prevPads[pi] = p.buttons.map(b => !!b.pressed);
          if (pressedNow) {
            triggerStart();
            return;
          }
        }
      } catch (_) {}
    }, 50);
  },
  hide() {
    if (this._hidden) return;
    this._hidden = true;
    this._waitingStart = false;
    const el = document.getElementById('app-loader-overlay');
    if (!el) return;
    el.classList.remove('ready-to-start');
    this.setProgress(100, 'START!');
    setTimeout(() => {
      el.classList.add('fade-out');
      setTimeout(() => {
        if (this._hidden) el.style.display = 'none';
      }, 360);
    }, 60);
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
    audioCtx.resume().then(() => {
      if (typeof SceneBgm !== 'undefined') SceneBgm.onAudioUnlocked();
    }).catch(() => {});
  } else {
    if (typeof SceneBgm !== 'undefined') SceneBgm.onAudioUnlocked();
  }
  if (typeof SE !== 'undefined' && typeof SE.unlockFallbackAudios === 'function') {
    SE.unlockFallbackAudios();
  }
}
document.addEventListener('pointerdown', ensureAudioCtxResumed, { capture: true, passive: true });
document.addEventListener('touchend', ensureAudioCtxResumed, { capture: true, passive: true });
document.addEventListener('click', ensureAudioCtxResumed, { capture: true, passive: true });
document.addEventListener('keydown', ensureAudioCtxResumed, { capture: true, passive: true });

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
  play(key, options = null) {
    if (key === 'select' && !(options && options.skipVibrate) && typeof triggerConfirmVibration === 'function') {
      triggerConfirmVibration();
    }
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

function playCharacterConfirmVoice(charId) {
  if (!charId || charId === 'random' || typeof VOICE === 'undefined') return;
  if (charId === 'custom') {
    VOICE.play('attack', {
      charId: 'custom',
      name: (typeof getPlayerDisplayName === 'function') ? getPlayerDisplayName() : 'マイキャラ'
    });
    return;
  }
  const ch = (typeof getCharacterById === 'function') ? getCharacterById(charId) : null;
  if (ch && ch.name) {
    VOICE.play('attack', { charId: ch.id, voiceName: ch.name, name: ch.name });
  }
}

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
        const decoded = await new Promise((resolve, reject) => {
          audioCtx.decodeAudioData(arrayBuffer, resolve, reject);
        });
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
// ==========================================
// OP / メニュー〜モードセレクト用BGM制御（拡張子非依存・シームレスループ・1ループ目のみ0.5秒フェードイン）
// ==========================================
const SceneBgm = {
  exts: ['m4a', 'mp3', 'wav', 'ogg', 'aac', 'opus', 'webm'],
  fixedLoopBounds: {
    mode_select: { loopStart: 0.0, loopEnd: 7.99 }
  },
  resolvedCache: {},
  resolvingMap: {},
  readyPromise: null,
  currentTrack: null,
  pendingTrack: null,
  _reqToken: 0,
  _source: null,
  _fadeGain: null,
  _volGain: null,
  _fallbackAudio: null,
  _fallbackNextAudio: null,
  _fallbackMonitorId: null,
  _fadeRafId: null,
  _fadeFactor: 1,

  getMasterVolume() {
    const slider = document.getElementById('bgm-volume');
    if (slider) {
      const v = parseFloat(slider.value);
      if (!Number.isNaN(v)) return Math.max(0, Math.min(1, v));
    }
    return typeof bgmAudio !== 'undefined' ? Math.max(0, Math.min(1, bgmAudio.volume)) : 0.5;
  },

  buildTrimmedLoopBuffer(buffer, loopStart, loopEnd) {
    if (!buffer) return buffer;
    const sr = buffer.sampleRate;
    const len = buffer.length;
    const startIdx = Math.max(0, Math.min(len - 1, Math.round(loopStart * sr)));
    const endIdx = Math.max(startIdx + 1, Math.min(len, Math.round(loopEnd * sr)));
    if (startIdx === 0 && endIdx === len) {
      return buffer;
    }
    const frameCount = endIdx - startIdx;
    const trimmed = audioCtx.createBuffer(buffer.numberOfChannels, frameCount, sr);
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const srcData = buffer.getChannelData(ch);
      const dstData = trimmed.getChannelData(ch);
      dstData.set(srcData.subarray(startIdx, endIdx));
    }
    return trimmed;
  },

  computeSeamlessLoopBounds(buffer) {
    if (!buffer || !buffer.duration || buffer.duration < 0.8) {
      return { loopStart: 0, loopEnd: buffer ? buffer.duration : 0 };
    }
    const sr = buffer.sampleRate;
    const len = buffer.length;
    const numCh = buffer.numberOfChannels;
    const channels = [];
    for (let ch = 0; ch < numCh; ch++) {
      channels.push(buffer.getChannelData(ch));
    }

    const SILENCE_THRESHOLD = 0.0012;
    const maxLeadSamples = Math.min(Math.floor(len * 0.2), Math.floor(sr * 1.0));
    const maxTailSamples = Math.min(Math.floor(len * 0.25), Math.floor(sr * 1.5));

    let startIdx = 0;
    for (let i = 0; i < maxLeadSamples; i++) {
      let maxAmp = 0;
      for (let ch = 0; ch < numCh; ch++) {
        const a = Math.abs(channels[ch][i]);
        if (a > maxAmp) maxAmp = a;
      }
      if (maxAmp >= SILENCE_THRESHOLD) {
        startIdx = i;
        break;
      }
    }

    let endIdx = len - 1;
    const minEndBound = Math.max(startIdx + Math.floor(sr * 0.5), len - maxTailSamples);
    for (let i = len - 1; i >= minEndBound; i--) {
      let maxAmp = 0;
      for (let ch = 0; ch < numCh; ch++) {
        const a = Math.abs(channels[ch][i]);
        if (a > maxAmp) maxAmp = a;
      }
      if (maxAmp >= SILENCE_THRESHOLD) {
        endIdx = i;
        break;
      }
    }

    const snapRange = Math.min(256, Math.floor(sr * 0.006));
    let bestStart = startIdx;
    let minStartVal = Infinity;
    for (let i = Math.max(0, startIdx - snapRange); i <= Math.min(len - 1, startIdx + 32); i++) {
      let sum = 0;
      for (let ch = 0; ch < numCh; ch++) sum += Math.abs(channels[ch][i]);
      if (sum < minStartVal) {
        minStartVal = sum;
        bestStart = i;
      }
    }

    let bestEnd = endIdx;
    let minEndVal = Infinity;
    for (let i = Math.max(bestStart + Math.floor(sr * 0.4), endIdx - 32); i <= Math.min(len - 1, endIdx + snapRange); i++) {
      let sum = 0;
      for (let ch = 0; ch < numCh; ch++) sum += Math.abs(channels[ch][i]);
      if (sum < minEndVal) {
        minEndVal = sum;
        bestEnd = i;
      }
    }

    const loopStart = bestStart / sr;
    const loopEnd = Math.min(buffer.duration, (bestEnd + 1) / sr);
    if (loopEnd - loopStart < 0.4) {
      return { loopStart: 0, loopEnd: buffer.duration };
    }
    return { loopStart, loopEnd };
  },

  probeBgmUrl(url) {
    return new Promise((resolve) => {
      try {
        const audio = new Audio();
        let settled = false;
        const done = (ok) => {
          if (settled) return;
          settled = true;
          audio.onloadedmetadata = null;
          audio.onloadeddata = null;
          audio.oncanplay = null;
          audio.onerror = null;
          resolve(ok ? url : null);
        };
        audio.preload = 'metadata';
        audio.onloadedmetadata = () => done(true);
        audio.onloadeddata = () => done(true);
        audio.oncanplay = () => done(true);
        audio.onerror = () => done(false);
        audio.src = url;
        audio.load();
        setTimeout(() => done(false), 3500);
      } catch (_) {
        resolve(null);
      }
    });
  },

  async resolveTrack(stem) {
    if (!stem) return null;
    if (this.resolvedCache[stem]) return this.resolvedCache[stem];
    if (this.resolvingMap[stem]) return this.resolvingMap[stem];

    const isFileProto = (location.protocol === 'file:');
    const encodedStem = encodeURIComponent(stem);
    const fixed = this.fixedLoopBounds[stem];
    const task = (async () => {
      for (const ext of this.exts) {
        const rawPath = `assets/bgm/${stem}.${ext}`;
        const urlPath = `assets/bgm/${encodedStem}.${ext}`;
        if (isFileProto) {
          const okUrl = await this.probeBgmUrl(rawPath);
          if (okUrl) {
            const entry = {
              type: 'url',
              data: okUrl,
              loopStart: fixed ? fixed.loopStart : undefined,
              loopEnd: fixed ? fixed.loopEnd : undefined
            };
            this.resolvedCache[stem] = entry;
            return entry;
          }
          continue;
        }
        try {
          const res = await fetch(urlPath);
          if (!res || !res.ok) continue;
          const buf = await res.arrayBuffer();
          try {
            const decoded = await new Promise((resolve, reject) => {
              audioCtx.decodeAudioData(buf, resolve, reject);
            });
            let entry;
            if (fixed) {
              const clampedStart = Math.max(0, Math.min(fixed.loopStart, Math.max(0, decoded.duration - 0.1)));
              const clampedEnd = Math.min(decoded.duration, fixed.loopEnd);
              const trimmed = this.buildTrimmedLoopBuffer(decoded, clampedStart, clampedEnd);
              entry = {
                type: 'buffer',
                data: trimmed,
                loopStart: 0,
                loopEnd: trimmed.duration
              };
            } else {
              const bounds = this.computeSeamlessLoopBounds(decoded);
              entry = {
                type: 'buffer',
                data: decoded,
                loopStart: bounds.loopStart,
                loopEnd: bounds.loopEnd
              };
            }
            this.resolvedCache[stem] = entry;
            return entry;
          } catch (_) {
            const entry = {
              type: 'url',
              data: urlPath,
              loopStart: fixed ? fixed.loopStart : undefined,
              loopEnd: fixed ? fixed.loopEnd : undefined
            };
            this.resolvedCache[stem] = entry;
            return entry;
          }
        } catch (_) {}
      }
      return null;
    })().finally(() => {
      delete this.resolvingMap[stem];
    });

    this.resolvingMap[stem] = task;
    return task;
  },

  preload() {
    this.readyPromise = Promise.all([
      this.resolveTrack('op').catch(() => null),
      this.resolveTrack('mode_select').catch(() => null)
    ]);
    return this.readyPromise;
  },

  stopActiveNodes() {
    if (this._fadeRafId) {
      cancelAnimationFrame(this._fadeRafId);
      this._fadeRafId = null;
    }
    if (this._fallbackMonitorId) {
      cancelAnimationFrame(this._fallbackMonitorId);
      this._fallbackMonitorId = null;
    }
    if (this._source) {
      try { this._source.onended = null; } catch (_) {}
      try { this._source.stop(); } catch (_) {}
      try { this._source.disconnect(); } catch (_) {}
      this._source = null;
    }
    if (this._fadeGain) {
      try { this._fadeGain.disconnect(); } catch (_) {}
      this._fadeGain = null;
    }
    if (this._volGain) {
      try { this._volGain.disconnect(); } catch (_) {}
      this._volGain = null;
    }
    if (this._fallbackAudio) {
      try {
        this._fallbackAudio.pause();
        this._fallbackAudio.currentTime = 0;
      } catch (_) {}
      this._fallbackAudio = null;
    }
    if (this._fallbackNextAudio) {
      try {
        this._fallbackNextAudio.pause();
        this._fallbackNextAudio.currentTime = 0;
      } catch (_) {}
      this._fallbackNextAudio = null;
    }
    this._fadeFactor = 1;
  },

  stop() {
    this._reqToken++;
    this.currentTrack = null;
    this.pendingTrack = null;
    this.stopActiveNodes();
  },

  updateVolume(vol) {
    const v = Math.max(0, Math.min(1, parseFloat(vol)));
    if (Number.isNaN(v)) return;
    if (this._volGain) {
      this._volGain.gain.value = v;
    }
    if (this._fallbackAudio) {
      this._fallbackAudio.volume = v * this._fadeFactor;
    }
  },

  isTrackContextValid(track) {
    const gameArea = document.getElementById('game-area');
    const isGameActive = gameArea && window.getComputedStyle(gameArea).display !== 'none';
    if (track === 'op') {
      return !isGameActive && typeof OpAnimation !== 'undefined' && OpAnimation.isActive && OpAnimation.isActive();
    }
    if (track === 'mode_select') {
      if (isGameActive) return false;
      if (typeof OpAnimation !== 'undefined' && OpAnimation.isActive && OpAnimation.isActive()) return false;
      if (typeof isBgmPlaying !== 'undefined' && isBgmPlaying) return false;
      const menuOverlay = document.getElementById('menu-overlay');
      return !!menuOverlay && window.getComputedStyle(menuOverlay).display !== 'none';
    }
    return false;
  },

  startBufferPlayback(track, entry, token) {
    if (token !== this._reqToken || !this.isTrackContextValid(track)) {
      if (token === this._reqToken) this.currentTrack = null;
      return;
    }
    if (audioCtx.state !== 'running') {
      this.pendingTrack = track;
      return;
    }

    const buffer = entry.data;
    const isLoop = (track === 'mode_select');
    const fadeInSec = (track === 'mode_select') ? 0.5 : 0;
    const loopStart = (isLoop && entry.loopStart !== undefined) ? entry.loopStart : 0;
    const loopEnd = (isLoop && entry.loopEnd !== undefined) ? entry.loopEnd : buffer.duration;

    const fadeGain = audioCtx.createGain();
    const volGain = audioCtx.createGain();
    volGain.gain.value = this.getMasterVolume();
    fadeGain.connect(volGain);
    volGain.connect(audioCtx.destination);

    const now = audioCtx.currentTime;
    fadeGain.gain.cancelScheduledValues(now);
    if (fadeInSec > 0) {
      fadeGain.gain.setValueAtTime(0.0001, now);
      fadeGain.gain.linearRampToValueAtTime(1.0, now + fadeInSec);
    } else {
      fadeGain.gain.setValueAtTime(1.0, now);
    }

    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.loop = isLoop;
    if (isLoop) {
      source.loopStart = loopStart;
      source.loopEnd = loopEnd;
    }
    source.connect(fadeGain);
    source.onended = () => {
      if (this._source === source) {
        this._source = null;
        if (!isLoop && this.currentTrack === track) {
          this.currentTrack = null;
        }
      }
    };

    this._fadeGain = fadeGain;
    this._volGain = volGain;
    this._source = source;
    this._fadeFactor = 1;
    this.pendingTrack = null;
    source.start(now, isLoop ? loopStart : 0);
  },

  startHtmlAudioPlayback(track, entry, token) {
    if (token !== this._reqToken || !this.isTrackContextValid(track)) {
      if (token === this._reqToken) this.currentTrack = null;
      return;
    }

    const url = typeof entry === 'string' ? entry : entry.data;
    const isLoop = (track === 'mode_select');
    const fadeInSec = (track === 'mode_select') ? 0.5 : 0;
    const loopStart = (isLoop && typeof entry === 'object' && entry.loopStart !== undefined) ? entry.loopStart : 0;
    const fixedLoopEnd = (isLoop && typeof entry === 'object' && entry.loopEnd !== undefined) ? entry.loopEnd : null;

    const audio = new Audio(url);
    audio.preload = 'auto';
    audio.loop = false;
    if (isLoop && loopStart > 0) {
      try { audio.currentTime = loopStart; } catch (_) {}
    }
    this._fallbackAudio = audio;

    let standby = null;
    if (isLoop) {
      standby = new Audio(url);
      standby.preload = 'auto';
      standby.loop = false;
      this._fallbackNextAudio = standby;
    }

    if (fadeInSec > 0) {
      this._fadeFactor = 0;
      audio.volume = 0;
    } else {
      this._fadeFactor = 1;
      audio.volume = this.getMasterVolume();
    }

    let isSwitchingLoop = false;
    const triggerLoopSwap = () => {
      if (isSwitchingLoop || token !== this._reqToken || !this._fallbackAudio || !this._fallbackNextAudio) return;
      isSwitchingLoop = true;
      const cur = this._fallbackAudio;
      const nxt = this._fallbackNextAudio;
      nxt.volume = this.getMasterVolume() * this._fadeFactor;
      try { nxt.currentTime = loopStart; } catch (_) {}
      const pNxt = nxt.play();
      const finishSwap = () => {
        if (token !== this._reqToken) return;
        try { cur.pause(); cur.currentTime = loopStart; } catch (_) {}
        this._fallbackAudio = nxt;
        this._fallbackNextAudio = cur;
        isSwitchingLoop = false;
      };
      if (pNxt && typeof pNxt.then === 'function') {
        pNxt.then(finishSwap).catch(() => { isSwitchingLoop = false; });
      } else {
        finishSwap();
      }
    };

    const monitorSeamlessLoop = () => {
      if (token !== this._reqToken || !this._fallbackAudio) return;
      const cur = this._fallbackAudio;
      const nxt = this._fallbackNextAudio;
      if (isLoop && nxt && !isSwitchingLoop) {
        const hasDur = isFinite(cur.duration) && cur.duration > 0.5;
        const targetEnd = fixedLoopEnd !== null
          ? (hasDur ? Math.min(fixedLoopEnd, cur.duration) : fixedLoopEnd)
          : (hasDur ? cur.duration : null);
        if (targetEnd !== null) {
          const remain = targetEnd - cur.currentTime;
          if (remain <= 0.05) {
            triggerLoopSwap();
          }
        }
      }
      this._fallbackMonitorId = requestAnimationFrame(monitorSeamlessLoop);
    };

    if (!isLoop) {
      audio.addEventListener('ended', () => {
        if (this._fallbackAudio === audio && this.currentTrack === track) {
          this._fallbackAudio = null;
          this.currentTrack = null;
        }
      });
    } else {
      const onEndedFallback = (ev) => {
        if (token !== this._reqToken || this._fallbackAudio !== ev.target) return;
        triggerLoopSwap();
      };
      audio.addEventListener('ended', onEndedFallback);
      if (standby) standby.addEventListener('ended', onEndedFallback);
    }

    const p = audio.play();
    if (p && typeof p.then === 'function') {
      p.then(() => {
        if (token !== this._reqToken || this._fallbackAudio !== audio || !this.isTrackContextValid(track)) {
          try { audio.pause(); } catch (_) {}
          if (this._fallbackAudio === audio) this._fallbackAudio = null;
          return;
        }
        this.pendingTrack = null;
        if (isLoop) {
          this._fallbackMonitorId = requestAnimationFrame(monitorSeamlessLoop);
        }
        if (fadeInSec > 0) {
          const fadeStart = performance.now();
          const stepFade = (ts) => {
            if (token !== this._reqToken || !this._fallbackAudio) return;
            const progress = Math.min(1, (ts - fadeStart) / (fadeInSec * 1000));
            this._fadeFactor = progress;
            this._fallbackAudio.volume = this.getMasterVolume() * progress;
            if (progress < 1) {
              this._fadeRafId = requestAnimationFrame(stepFade);
            } else {
              this._fadeRafId = null;
            }
          };
          this._fadeRafId = requestAnimationFrame(stepFade);
        }
      }).catch(() => {
        if (token === this._reqToken) {
          if (this._fallbackAudio === audio) this._fallbackAudio = null;
          if (this._fallbackNextAudio === standby) this._fallbackNextAudio = null;
          this.pendingTrack = track;
        }
      });
    }
  },

  async play(track) {
    if (!track) return;
    if (track === 'mode_select' && typeof isBgmPlaying !== 'undefined' && isBgmPlaying && bgmPlaylist.length > 0) {
      return;
    }
    if (this.currentTrack === track && (this._source || this._fallbackAudio || this.pendingTrack === track)) {
      return;
    }

    const token = ++this._reqToken;
    this.stopActiveNodes();
    this.currentTrack = track;
    this.pendingTrack = null;

    if (track === 'op' && typeof stopBgm === 'function') {
      stopBgm();
    }

    if (audioCtx.state === 'suspended') {
      audioCtx.resume().then(() => {
        this.onAudioUnlocked();
      }).catch(() => {});
    }

    const cached = this.resolvedCache[track];
    const resolved = cached || await this.resolveTrack(track);
    if (token !== this._reqToken) return;

    if (!resolved) {
      this.currentTrack = null;
      return;
    }
    if (!this.isTrackContextValid(track)) {
      this.currentTrack = null;
      return;
    }

    if (resolved.type === 'buffer') {
      this.startBufferPlayback(track, resolved, token);
    } else if (resolved.type === 'url') {
      this.startHtmlAudioPlayback(track, resolved, token);
    }
  },

  onAudioUnlocked() {
    if (!this.pendingTrack) return;
    const track = this.pendingTrack;
    if (!this.isTrackContextValid(track)) {
      this.pendingTrack = null;
      if (this.currentTrack === track) this.currentTrack = null;
      return;
    }
    this.pendingTrack = null;
    this.currentTrack = null;
    this.play(track);
  }
};
SceneBgm.preload();

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
  SceneBgm.updateVolume(vol);
  
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
    SceneBgm.stop();
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
  SceneBgm.stop();
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
  SceneBgm.stop();
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

  clearSliderAdjusting();
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
  if (typeof syncPadSnapshotsAll === 'function') syncPadSnapshotsAll(180);
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
  if (typeof syncPadSnapshotsAll === 'function') syncPadSnapshotsAll(180);
}

// ==========================================
// スライダー拡張（バー直接ジャンプ＋つまみドラッグ維持＋共通2段階調整＋桁編集HUD）
// ==========================================
let activeAdjustSliderEl = null;

function setSliderAdjusting(rangeEl) {
  if (activeAdjustSliderEl && activeAdjustSliderEl !== rangeEl) {
    activeAdjustSliderEl.classList.remove('slider-adjusting', 'local-slider-adjusting');
  }
  activeAdjustSliderEl = rangeEl || null;
  if (activeAdjustSliderEl) {
    activeAdjustSliderEl.classList.add('slider-adjusting', 'local-slider-adjusting');
  }
}

function clearSliderAdjusting() {
  if (activeAdjustSliderEl) {
    activeAdjustSliderEl.classList.remove('slider-adjusting', 'local-slider-adjusting');
    activeAdjustSliderEl = null;
  }
}

function isSettingsSliderEl(rangeEl) {
  return !!(rangeEl && rangeEl.closest && rangeEl.closest('#settings-overlay'));
}

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

  rangeEl.addEventListener('blur', () => {
    if (activeAdjustSliderEl === rangeEl) {
      clearSliderAdjusting();
    }
  });

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
    clearSliderAdjusting();
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
  hint.innerText = '◀▶ 桁選択 / ▲▼ 数値変更 / 決定・キャンセルで終了';

  hud.appendChild(row);
  hud.appendChild(hint);
  hud.style.display = 'flex';
}
// --- コンフィグ・ゲームパッド管理（1P〜4P対応：初期値は方向・決定・キャンセル・ポーズのみ） ---
const ACTION_LABELS = {
  Up: '上', Down: '下', Left: '左', Right: '右',
  Swap: '入れ替え / 決定',
  Skill: 'スキル発動 / キャンセル',
  GrabLeft: 'カーソル左つかみ',
  GrabRight: 'カーソル右つかみ',
  ToggleContinuous: '連続移動オンオフ',
  Pause: 'ポーズ/退出',
  Rise1: 'せり上げ1',
  Rise2: 'せり上げ2',
  TargetLeft: '標的(左)',
  TargetRight: '標的(右)'
};

function createDefault1PKeyConfig() {
  return {
    Up: 'ArrowUp', Down: 'ArrowDown', Left: 'ArrowLeft', Right: 'ArrowRight',
    Swap: 'Space',
    Skill: 'KeyF',
    Pause: 'Escape',
    GrabLeft: '', GrabRight: '',
    ToggleContinuous: '',
    Rise1: '', Rise2: '',
    TargetRight: '', TargetLeft: ''
  };
}

function createDefaultPadConfig() {
  return {
    Up: 12, Down: 13, Left: 14, Right: 15,
    Swap: 0,
    Skill: 6,
    Pause: 9,
    GrabLeft: null, GrabRight: null,
    ToggleContinuous: null,
    Rise1: null, Rise2: null,
    TargetRight: null, TargetLeft: null
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
    Skill: 'KeyH',
    Pause: 'KeyP',
    GrabLeft: '', GrabRight: '',
    ToggleContinuous: '',
    Rise1: '', Rise2: '',
    TargetRight: '', TargetLeft: ''
  };
}

let keyConfig = createDefault1PKeyConfig();
let padConfig = createDefaultPadConfig();

try {
  const sKey = localStorage.getItem('pdw_key'), sPad = localStorage.getItem('pdw_pad');
  if (sKey) {
    const parsedKey = JSON.parse(sKey);
    if (parsedKey.Rise && !parsedKey.Rise1) parsedKey.Rise1 = parsedKey.Rise;
    if (parsedKey.Target && !parsedKey.TargetRight) parsedKey.TargetRight = parsedKey.Target;
    Object.keys(ACTION_LABELS).forEach(k => {
      if (parsedKey[k] !== undefined) keyConfig[k] = parsedKey[k];
    });
  }
  if (sPad) {
    const parsedPad = JSON.parse(sPad);
    if (parsedPad.Rise !== undefined && parsedPad.Rise1 === undefined) parsedPad.Rise1 = parsedPad.Rise;
    if (parsedPad.Target !== undefined && parsedPad.TargetRight === undefined) parsedPad.TargetRight = parsedPad.Target;
    Object.keys(ACTION_LABELS).forEach(k => {
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
  if (savedSlot0 !== null) {
    const slotNum = parseInt(savedSlot0, 10);
    if (!Number.isNaN(slotNum)) playerConfigs[0].padSlot = slotNum;
  }
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
          const slotNum = parseInt(parsed[idx].padSlot, 10);
          if (!Number.isNaN(slotNum)) playerConfigs[idx].padSlot = slotNum;
        }
      }
    });
  }
} catch (e) {}

let settingsPlayerIdx = 0;
let currentSettingsTab = 'audio';
let assigningAction = null, assignType = null;
let assignStartedAt = 0;
let assignPadSnapshot = {};
let pendingConfigFocus = null;
let settingsSnapshot = null;

function openKeyResetConfirmModal() {
  const modal = document.getElementById('key-reset-confirm-modal');
  const msgEl = document.getElementById('key-reset-confirm-message');
  if (!modal) return;
  if (msgEl) {
    msgEl.innerText = `${settingsPlayerIdx + 1}Pのキー・ゲームパッド設定を初期状態に戻しますか？`;
  }
  assigningAction = null;
  pendingConfigFocus = null;
  modal.style.display = 'flex';
  SE.play('select');
  if (typeof syncPadSnapshotsAll === 'function') syncPadSnapshotsAll(180);
  const cancelBtn = document.getElementById('key-reset-cancel-btn');
  if (cancelBtn) requestAnimationFrame(() => cancelBtn.focus());
}

function closeKeyResetConfirmModal(silent = false) {
  const modal = document.getElementById('key-reset-confirm-modal');
  if (modal) modal.style.display = 'none';
  if (!silent) SE.play('cancel');
  const resetBtn = document.getElementById('settings-key-reset-btn');
  if (resetBtn && document.getElementById('settings-overlay')?.style.display === 'block') {
    requestAnimationFrame(() => resetBtn.focus());
  }
  if (typeof syncPadSnapshotsAll === 'function') syncPadSnapshotsAll(180);
}

function confirmKeyResetForSelectedPlayer() {
  const idx = settingsPlayerIdx;
  const defKey = idx === 0
    ? createDefault1PKeyConfig()
    : (idx === 1 ? createDefaultP2KeyConfig() : createEmptyKeyConfig());
  const defPad = createDefaultPadConfig();

  Object.keys(ACTION_LABELS).forEach(k => {
    playerConfigs[idx].key[k] = defKey[k] !== undefined ? defKey[k] : '';
    playerConfigs[idx].pad[k] = defPad[k] !== undefined ? defPad[k] : null;
  });

  assigningAction = null;
  pendingConfigFocus = null;
  renderConfigUI();
  closeKeyResetConfirmModal(true);
  SE.play('select');
  if (typeof showToast === 'function') {
    showToast(`${idx + 1}Pのキー・パッド設定を初期化しました`);
  }
}

function capturePadAssignmentSnapshot() {
  const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()) : [];
  const snap = {};
  for (let i = 0; i < 4; i++) {
    snap[i] = {};
    const p = pads[i];
    if (p && p.buttons) {
      p.buttons.forEach((b, idx) => { snap[i][idx] = !!b.pressed; });
    }
  }
  assignPadSnapshot = snap;
  assignStartedAt = performance.now();
}

function selectSettingsTab(tabKey) {
  currentSettingsTab = tabKey || 'audio';
  assigningAction = null;
  pendingConfigFocus = null;
  clearSliderAdjusting();
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
  syncVisualControlSettingToggles();
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
  const parsed = parseInt(val, 10);
  if (!Number.isNaN(parsed)) {
    playerConfigs[settingsPlayerIdx].padSlot = parsed;
  }
}

function persistPlayerConfigsToStorage() {
  localStorage.setItem('pdw_key', JSON.stringify(keyConfig));
  localStorage.setItem('pdw_pad', JSON.stringify(padConfig));
  localStorage.setItem('pdw_pad_slot_0', String(playerConfigs[0].padSlot));
  localStorage.setItem('pdw_multi_configs', JSON.stringify({
    1: playerConfigs[1],
    2: playerConfigs[2],
    3: playerConfigs[3]
  }));
}

function openSettings() {
  SE.play('select');
  clearSliderAdjusting();
  settingsSnapshot = {
    bgmVol: parseFloat(document.getElementById('bgm-volume')?.value ?? bgmAudio.volume),
    seVol: SE.volume,
    voiceVol: VOICE.volume,
    gbMode: isGbMode,
    swapVibrate: isSwapVibrateEnabled,
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
  syncVisualControlSettingToggles();
  document.getElementById('settings-overlay').style.display = 'block';
  selectSettingsTab(currentSettingsTab || 'audio');
  enhanceAllRangeSliders();
  const firstTabBtn = document.querySelector('#settings-category-tabs button');
  if (firstTabBtn) firstTabBtn.focus();
  if (typeof updateVerticalBottomNav === 'function') updateVerticalBottomNav();
  if (typeof syncPadSnapshotsAll === 'function') syncPadSnapshotsAll(180);
}

async function cancelSettings() {
  closeRangeDigitEdit();
  clearSliderAdjusting();
  closeSelectPickerModal(true);
  closeKeyResetConfirmModal(true);
  assigningAction = null;
  pendingConfigFocus = null;
  if (settingsSnapshot) {
    const snap = settingsSnapshot;
    SE.volume = snap.seVol;
    VOICE.volume = snap.voiceVol;
    bgmAudio.volume = snap.bgmVol;
    panicBgmAudio.volume = snap.bgmVol;
    SceneBgm.updateVolume(snap.bgmVol);

    applyGbMode(!!snap.gbMode);
    isSwapVibrateEnabled = !!snap.swapVibrate;
    if (!isSwapVibrateEnabled) stopAllVibration();
    syncVisualControlSettingToggles();

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
      Object.keys(ACTION_LABELS).forEach(k => {
        playerConfigs[idx].key[k] = sc.key[k] !== undefined ? sc.key[k] : '';
        playerConfigs[idx].pad[k] = sc.pad[k] !== undefined ? sc.pad[k] : null;
      });
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

    if (typeof refreshCustomAssetsUI === 'function') refreshCustomAssetsUI();
    if (typeof refreshMenuHeaderAndPreview === 'function') refreshMenuHeaderAndPreview();

    bgmPlaylist = [...snap.bgmPlaylist];
    currentBgmIndex = snap.currentBgmIndex;
    bgmNeedsPlay = snap.bgmNeedsPlay;
  }

  settingsSnapshot = null;
  document.getElementById('settings-overlay').style.display = 'none';
  SE.play('cancel');
  showToast('変更を保存せずに戻りました');
  if (typeof updateVerticalBottomNav === 'function') updateVerticalBottomNav();
  if (typeof syncPadSnapshotsAll === 'function') syncPadSnapshotsAll(200);
}

function closeSettings() {
  closeRangeDigitEdit();
  clearSliderAdjusting();
  closeSelectPickerModal(true);
  closeKeyResetConfirmModal(true);
  document.getElementById('settings-overlay').style.display = 'none';
  assigningAction = null;
  pendingConfigFocus = null;
  settingsSnapshot = null;

  localStorage.setItem('pdw_se_vol', SE.volume);
  localStorage.setItem('pdw_voice_vol', VOICE.volume);
  localStorage.setItem('pdw_bgm_vol', bgmAudio.volume);
  localStorage.setItem('pdw_gb_mode', String(!!isGbMode));
  localStorage.setItem('pdw_swap_vibrate', String(!!isSwapVibrateEnabled));
  syncBoardVibrateToggleUI();

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

  persistPlayerConfigsToStorage();

  SE.play('select');

  if (typeof refreshMenuHeaderAndPreview === 'function') {
    refreshMenuHeaderAndPreview(true);
  }
  if (typeof updateVerticalBottomNav === 'function') {
    updateVerticalBottomNav();
  }

  if (bgmNeedsPlay && !isBgmPlaying && matchState !== 'playing') {
    SceneBgm.stop();
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
  if (typeof syncPadSnapshotsAll === 'function') syncPadSnapshotsAll(200);
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
      capturePadAssignmentSnapshot();
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
    'app-terminated-overlay',
    'app-exit-confirm-modal',
    'key-reset-confirm-modal',
    'exit-confirm-modal',
    'pwa-guide-modal',
    'select-picker-modal',
    'custom-skill-modal',
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
    const storyStageStep = document.getElementById('story-stage-step');
    if (storyStageStep && window.getComputedStyle(storyStageStep).display !== 'none') {
      return storyStageStep;
    }
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

function findDirectHorizontalCoverFlowInScope(scope) {
  if (!scope || typeof scope.querySelectorAll !== 'function') return null;
  const list = Array.from(scope.querySelectorAll('.cf-stage-wrap[data-cf-direct="1"]'));
  for (const el of list) {
    let parent = el.parentElement;
    let hidden = false;
    while (parent) {
      if (window.getComputedStyle(parent).display === 'none') {
        hidden = true;
        break;
      }
      parent = parent.parentElement;
    }
    if (hidden) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0 && typeof el._cfStep === 'function') {
      return el;
    }
  }
  return null;
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

function moveMenuFocus2D(dx, dy, focusablesOverride = null) {
  const scope = getActiveMenuFocusScope();
  const focusables = focusablesOverride || getMenuFocusables(scope);
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
  const isDirectCoverFlowEl = isCoverFlowEl && activeEl.dataset && activeEl.dataset.cfDirect === '1';
  const isCheckbox = activeEl && activeEl.tagName === 'INPUT' && activeEl.type === 'checkbox';

  if (rangeEditState.el && rangeEditState.el !== activeEl) {
    closeRangeDigitEdit();
  }
  if (activeAdjustSliderEl && activeAdjustSliderEl !== activeEl) {
    clearSliderAdjusting();
  }

  if (input.cancel) {
    if (rangeEditState.el) {
      closeRangeDigitEdit();
      SE.play('cancel');
      return true;
    }
    if (activeAdjustSliderEl) {
      clearSliderAdjusting();
      SE.play('cancel');
      return true;
    }
    if (isCoverFlowEl && !isDirectCoverFlowEl && typeof activeEl._cfIsEngaged === 'function' && activeEl._cfIsEngaged()) {
      activeEl._cfSetEngaged(false);
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
    if (isDirectCoverFlowEl) {
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

    const isEngaged = (typeof activeEl._cfIsEngaged === 'function') ? activeEl._cfIsEngaged() : true;
    if (isEngaged) {
      if (input.left && typeof activeEl._cfStep === 'function') {
        activeEl._cfStep(-1);
        return true;
      }
      if (input.right && typeof activeEl._cfStep === 'function') {
        activeEl._cfStep(1);
        return true;
      }
      if (input.up || input.down) {
        return true;
      }
      if (input.confirm) {
        if (typeof activeEl._cfSetEngaged === 'function') {
          activeEl._cfSetEngaged(false);
        }
        if (typeof activeEl._cfConfirm === 'function') {
          SE.play('select');
          activeEl._cfConfirm();
        } else {
          advanceFromCoverFlow(activeEl);
        }
        return true;
      }
      return false;
    } else {
      if (input.left) { moveMenuFocus2D(-1, 0); return true; }
      if (input.right) { moveMenuFocus2D(1, 0); return true; }
      if (input.up) { moveMenuFocus2D(0, -1); return true; }
      if (input.down) { moveMenuFocus2D(0, 1); return true; }
      if (input.confirm) {
        if (typeof activeEl._cfSetEngaged === 'function') {
          activeEl._cfSetEngaged(true);
          SE.play('select');
        } else if (typeof activeEl._cfConfirm === 'function') {
          SE.play('select');
          activeEl._cfConfirm();
        } else {
          advanceFromCoverFlow(activeEl);
        }
        return true;
      }
      return false;
    }
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

    if (isSettingsSliderEl(activeEl)) {
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

    if (activeAdjustSliderEl === activeEl) {
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
      if (input.confirm) {
        clearSliderAdjusting();
        rangeEditState.el = activeEl;
        rangeEditState.digitIndex = 0;
        updateRangeDigitHUD();
        SE.play('select');
        return true;
      }
      if (input.up) {
        clearSliderAdjusting();
        moveMenuFocus2D(0, -1);
        return true;
      }
      if (input.down) {
        clearSliderAdjusting();
        moveMenuFocus2D(0, 1);
        return true;
      }
      return false;
    } else {
      if (input.left) { moveMenuFocus2D(-1, 0); return true; }
      if (input.right) { moveMenuFocus2D(1, 0); return true; }
      if (input.up) { moveMenuFocus2D(0, -1); return true; }
      if (input.down) { moveMenuFocus2D(0, 1); return true; }
      if (input.confirm) {
        setSliderAdjusting(activeEl);
        SE.play('select');
        return true;
      }
      return false;
    }
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
    if (!moveMenuFocus2D(-1, 0)) {
      const directCf = findDirectHorizontalCoverFlowInScope(scope);
      if (directCf) {
        directCf._cfStep(-1);
        return true;
      }
    }
    return true;
  }
  if (input.right) {
    if (!moveMenuFocus2D(1, 0)) {
      const directCf = findDirectHorizontalCoverFlowInScope(scope);
      if (directCf) {
        directCf._cfStep(1);
        return true;
      }
    }
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
    if (activeEl.tagName === 'LABEL') {
      const fileInput = activeEl.querySelector('input[type="file"]');
      if (fileInput) {
        SE.play('select');
        fileInput.click();
        return true;
      }
    }
    if (typeof activeEl.click === 'function') {
      activeEl.click();
      return true;
    }
  }
  return false;
}

function handleMenuKeyDown(e) {
  if (assigningAction) {
    e.preventDefault();
    e.stopPropagation();
    return true;
  }
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
// ゲームパッド統一ポーリング・二重操作完全防止・時間ベースDAS/ARR＋リリースデバウンス
// ==========================================
let globalPadPrevState = {};
let globalPadWaitRelease = {};
let globalPadLastPressAt = {};
let globalPadDirState = {
  Up:    { held: false, startAt: 0, lastAt: 0, releaseAt: 0 },
  Down:  { held: false, startAt: 0, lastAt: 0, releaseAt: 0 },
  Left:  { held: false, startAt: 0, lastAt: 0, releaseAt: 0 },
  Right: { held: false, startAt: 0, lastAt: 0, releaseAt: 0 }
};
let lastPadContextKey = '';
let padInputLockUntil = 0;
let padActionLastTime = {};
const GLOBAL_PAD_DAS_MS = 270;
const GLOBAL_PAD_ARR_MS = 75;
const GLOBAL_PAD_BOUNCE_MS = 100;
const GLOBAL_PAD_RELEASE_MS = 30;
const GLOBAL_PAD_DIR_MIN_INTERVAL_MS = 95;

function resetGlobalPadDirState() {
  globalPadDirState = {
    Up:    { held: false, startAt: 0, lastAt: 0, releaseAt: 0 },
    Down:  { held: false, startAt: 0, lastAt: 0, releaseAt: 0 },
    Left:  { held: false, startAt: 0, lastAt: 0, releaseAt: 0 },
    Right: { held: false, startAt: 0, lastAt: 0, releaseAt: 0 }
  };
}

function getPad0Object(pads) {
  const slot0 = playerConfigs[0].padSlot;
  if (slot0 < 0) return null;
  if (pads[slot0]) return pads[slot0];
  const usedByOthers = [1, 2, 3].some(i => playerConfigs[i].padSlot === 0);
  if (slot0 === 0 && !usedByOthers) {
    return pads.find(p => p && p.connected) || null;
  }
  return null;
}

function readPadButtonsMap(pad) {
  const pressed = {};
  if (pad && pad.buttons) {
    pad.buttons.forEach((b, i) => { pressed[i] = !!b.pressed; });
  }
  return pressed;
}

function getCurrentPadContextKey() {
  if (document.getElementById('op-overlay')?.style.display === 'flex') return 'op';
  if (document.getElementById('app-terminated-overlay')?.style.display === 'flex') return 'app-terminated';
  if (document.getElementById('app-exit-confirm-modal')?.style.display === 'flex') return 'app-exit-confirm';
  if (document.getElementById('key-reset-confirm-modal')?.style.display === 'flex') return 'key-reset-confirm';
  if (document.getElementById('exit-confirm-modal')?.style.display === 'flex') return 'exit-confirm';
  if (document.getElementById('pwa-guide-modal')?.style.display === 'flex') return 'pwa-guide';
  if (document.getElementById('select-picker-modal')?.style.display === 'flex') return 'select-picker';
  if (document.getElementById('custom-skill-modal')?.style.display === 'flex') return 'custom-skill-modal';
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
  globalPadWaitRelease = {};
  Object.keys(pressed0).forEach(k => {
    if (pressed0[k]) globalPadWaitRelease[k] = true;
  });
  resetGlobalPadDirState();
  padInputLockUntil = Math.max(padInputLockUntil, performance.now() + lockMs);

  if (typeof p1InputState !== 'undefined' && p1InputState) {
    p1InputState.prevPadState = { ...pressed0 };
    p1InputState.padState = { ...pressed0 };
    p1InputState.padHoldFrames = { Up: 0, Down: 0, Left: 0, Right: 0 };
    p1InputState.padDirTime = {
      Up:    { held: false, startAt: 0, lastAt: 0, releaseAt: 0 },
      Down:  { held: false, startAt: 0, lastAt: 0, releaseAt: 0 },
      Left:  { held: false, startAt: 0, lastAt: 0, releaseAt: 0 },
      Right: { held: false, startAt: 0, lastAt: 0, releaseAt: 0 }
    };
    p1InputState.padWaitRelease = {};
    Object.keys(pressed0).forEach(k => {
      if (pressed0[k]) p1InputState.padWaitRelease[k] = true;
    });
  }
  if (typeof localMenuPadPrev !== 'undefined' && Array.isArray(localMenuPadPrev)) {
    for (let i = 0; i < 4; i++) {
      const m = readPadButtonsMap(pads[i] || null);
      localMenuPadPrev[i] = m;
      if (typeof localMenuPadWaitRelease !== 'undefined' && localMenuPadWaitRelease[i]) {
        localMenuPadWaitRelease[i] = {};
        Object.keys(m).forEach(k => {
          if (m[k]) localMenuPadWaitRelease[i][k] = true;
        });
      }
      if (typeof resetLocalMenuPadDir === 'function') resetLocalMenuPadDir(i);
    }
  }
  lastPadContextKey = getCurrentPadContextKey();
}

window.addEventListener('focus', () => {
  syncPadSnapshotsAll(220);
});

setInterval(() => {
  const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()) : [];
  const pad0 = getPad0Object(pads);
  const pressed = readPadButtonsMap(pad0);
  const ctxKey = getCurrentPadContextKey();
  const now = performance.now();

  Object.keys(globalPadWaitRelease).forEach(k => {
    if (!pressed[k]) delete globalPadWaitRelease[k];
  });

  const settingsPadStatus = document.getElementById('settings-pad-status');
  if (settingsPadStatus && document.getElementById('settings-overlay').style.display === 'block') {
    settingsPadStatus.innerText = getConnectedPadsSummaryText();
  }
  const localPadStatus = document.getElementById('local-pad-status');
  const isLocalMenuOpen = (ctxKey === 'local-menu');
  if (localPadStatus && isLocalMenuOpen) {
    localPadStatus.innerText = getConnectedPadsSummaryText();
  }

  if (assigningAction && assignType === 'key') {
    globalPadPrevState = { ...pressed };
    return;
  }

  if (assigningAction && assignType === 'pad') {
    for (let i = 0; i < 4; i++) {
      const p = pads[i];
      if (!assignPadSnapshot[i]) assignPadSnapshot[i] = {};
      if (p && p.buttons) {
        p.buttons.forEach((b, idx) => {
          if (!b.pressed) assignPadSnapshot[i][idx] = false;
        });
      }
    }

    if (now - assignStartedAt >= 80) {
      const targetSlot = playerConfigs[settingsPlayerIdx].padSlot;
      const scanIndices = [];
      if (targetSlot >= 0 && pads[targetSlot] && pads[targetSlot].connected) {
        scanIndices.push(targetSlot);
      } else {
        for (let i = 0; i < 4; i++) {
          if (pads[i] && pads[i].connected) scanIndices.push(i);
        }
      }

      for (const pIdx of scanIndices) {
        const p = pads[pIdx];
        if (!p || !p.buttons) continue;
        const pressedIdx = p.buttons.findIndex((b, bIdx) => b.pressed && !assignPadSnapshot[pIdx][bIdx]);
        if (pressedIdx !== -1) {
          const doneAction = assigningAction;
          pendingConfigFocus = { action: doneAction, type: 'pad' };
          playerConfigs[settingsPlayerIdx].pad[doneAction] = pressedIdx;
          assigningAction = null;
          renderConfigUI();
          SE.play('select');
          syncPadSnapshotsAll(260);
          return;
        }
      }
    }
    globalPadPrevState = { ...pressed };
    return;
  }

  if (ctxKey !== lastPadContextKey) {
    lastPadContextKey = ctxKey;
    globalPadPrevState = { ...pressed };
    Object.keys(pressed).forEach(k => {
      if (pressed[k]) globalPadWaitRelease[k] = true;
    });
    resetGlobalPadDirState();
    padInputLockUntil = Math.max(padInputLockUntil, now + 150);
    return;
  }

  if (ctxKey === 'op') {
    if (now >= padInputLockUntil) {
      const anyNewBtn = Object.keys(pressed).some(k => pressed[k] && !globalPadPrevState[k] && !globalPadWaitRelease[k]);
      if (anyNewBtn && typeof OpAnimation !== 'undefined') {
        ensureAudioCtxResumed();
        OpAnimation.skip();
      }
    }
    globalPadPrevState = { ...pressed };
    return;
  }

  if (ctxKey === 'local-menu' && !rangeEditState.el) {
    if (typeof pollLocalMenuGamepads === 'function') {
      pollLocalMenuGamepads(pads);
    }
    globalPadPrevState = { ...pressed };
    return;
  }

  if (ctxKey === 'game' || ctxKey === 'battle-end' || ctxKey === 'share-prep') {
    resetGlobalPadDirState();
    if (rangeEditState.el) closeRangeDigitEdit();
    globalPadPrevState = { ...pressed };
    return;
  }

  if (!pad0) {
    resetGlobalPadDirState();
    globalPadPrevState = {};
    globalPadWaitRelease = {};
    return;
  }

  if (now < padInputLockUntil) {
    globalPadPrevState = { ...pressed };
    return;
  }

  const justPressed = (btnIdx, actionTag = '') => {
    if (btnIdx === null || btnIdx === undefined) return false;
    if (!pressed[btnIdx] || globalPadPrevState[btnIdx] || globalPadWaitRelease[btnIdx]) return false;
    const lastBtnT = globalPadLastPressAt[btnIdx] || 0;
    if (now - lastBtnT < GLOBAL_PAD_BOUNCE_MS) return false;
    if (actionTag) {
      const lastT = padActionLastTime[actionTag] || 0;
      if (now - lastT < 130) return false;
      padActionLastTime[actionTag] = now;
    }
    globalPadLastPressAt[btnIdx] = now;
    return true;
  };

  const isDirRepeat = (dirName, btnIdx) => {
    const st = globalPadDirState[dirName];
    if (btnIdx === null || btnIdx === undefined || !pressed[btnIdx]) {
      if (st.held) {
        if (!st.releaseAt) st.releaseAt = now;
        if ((now - st.releaseAt) >= GLOBAL_PAD_RELEASE_MS) {
          st.held = false;
          st.releaseAt = 0;
        }
      }
      return false;
    }
    st.releaseAt = 0;
    if (globalPadWaitRelease[btnIdx]) {
      st.held = true;
      st.startAt = now;
      st.lastAt = now;
      return false;
    }
    if (!st.held) {
      const lastBtnT = globalPadLastPressAt[`dir_${dirName}`] || 0;
      st.held = true;
      st.startAt = now;
      st.lastAt = now;
      if (now - lastBtnT < GLOBAL_PAD_DIR_MIN_INTERVAL_MS) return false;
      globalPadLastPressAt[`dir_${dirName}`] = now;
      return true;
    }
    if ((now - st.startAt) >= GLOBAL_PAD_DAS_MS && (now - st.lastAt) >= GLOBAL_PAD_ARR_MS) {
      st.lastAt = now;
      return true;
    }
    return false;
  };

  const canMenuPadControl = (ctxKey !== 'game') && (typeof matchState === 'undefined' || matchState !== 'playing' || ctxKey === 'result' || ctxKey === 'exit-confirm' || ctxKey === 'app-exit-confirm' || ctxKey === 'app-terminated' || ctxKey === 'key-reset-confirm' || ctxKey === 'settings' || ctxKey === 'select-picker' || ctxKey === 'custom-skill-modal' || ctxKey === 'pwa-guide' || (ctxKey === 'local-menu' && !!rangeEditState.el));

  if (canMenuPadControl) {
    let cancelTrig = justPressed(padConfig.Skill, 'cancel');
    let startTrig = justPressed(padConfig.Pause, 'start');
    let confirmTrig = justPressed(padConfig.Swap, 'confirm');
    let altConfirmTrig = justPressed(padConfig.GrabRight, 'altConfirm');

    if (cancelTrig) {
      startTrig = false;
      confirmTrig = false;
      altConfirmTrig = false;
    } else if (startTrig) {
      confirmTrig = false;
      altConfirmTrig = false;
    } else if (confirmTrig) {
      altConfirmTrig = false;
    }

    const upTrig = isDirRepeat('Up', padConfig.Up);
    const downTrig = isDirRepeat('Down', padConfig.Down);
    const leftTrig = isDirRepeat('Left', padConfig.Left);
    const rightTrig = isDirRepeat('Right', padConfig.Right);

    const didAction = processMenuNavigationInput({
      up: upTrig && !downTrig,
      down: downTrig && !upTrig,
      left: leftTrig && !rightTrig,
      right: rightTrig && !leftTrig,
      confirm: confirmTrig,
      altConfirm: altConfirmTrig,
      start: startTrig,
      cancel: cancelTrig
    });

    if (didAction && (confirmTrig || altConfirmTrig || startTrig || cancelTrig)) {
      if (confirmTrig && padConfig.Swap !== null && padConfig.Swap !== undefined) globalPadWaitRelease[padConfig.Swap] = true;
      if (altConfirmTrig && padConfig.GrabRight !== null && padConfig.GrabRight !== undefined) globalPadWaitRelease[padConfig.GrabRight] = true;
      if (startTrig && padConfig.Pause !== null && padConfig.Pause !== undefined) globalPadWaitRelease[padConfig.Pause] = true;
      if (cancelTrig && padConfig.Skill !== null && padConfig.Skill !== undefined) globalPadWaitRelease[padConfig.Skill] = true;
      padInputLockUntil = Math.max(padInputLockUntil, now + 130);
    }
  } else {
    resetGlobalPadDirState();
    if (rangeEditState.el) closeRangeDigitEdit();
  }

  globalPadPrevState = { ...pressed };
  lastPadContextKey = getCurrentPadContextKey();
}, 1000 / 60);