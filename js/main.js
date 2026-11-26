// ==========================================
// 対戦・ターゲット・スマブラ風ローカル選択・2D/3D/こんごう切替・連勝/累計勝利記録・縦UIバッジ・PC150%相当スケール統合管理
// [Part 1 / 3]
// ==========================================
let myEngine, myRenderer;
let opponents = [];
let myTargetIndex = -1;
let peer = null, onlineConnections = [];
let currentMode = 'single', currentComLevel = 2, currentTotalPlayers = 2;
let matchPlayersConfig = [];
let myOnlineId = '';
let isMatchOver = false;
let isDeadInMatch = false;
let loopId = null, syncIntervalId = null;
let matchState = 'ready';
let currentMatchId = 0;
let countdownTimer = null;
let hostDisconnected = false;
let isPracticeMode = false;
let currentSurvivalWins = 0;
let endSequenceTriggered = false;
let matchWinRecorded = false;
let maxChainInMatch = 0;
let isExitConfirmOpen = false;

let rematchReady = {};
let boardReady = {};

let selectedPlayerSkill = localStorage.getItem('pdw_player_skill') || 'erase_color';
let selectedFallbackSkill = localStorage.getItem('pdw_fallback_skill') || 'erase_color';
if (typeof getCustomSkillSlotIndex === 'function' && getCustomSkillSlotIndex(selectedFallbackSkill) !== -1) {
  selectedFallbackSkill = 'erase_color';
}
let currentSkillEnabled = false;
let currentCustomSkillEnabled = true;

let selectedSingleMode = 'free';
let selectedComCount = 2;

// 2D / 3D円筒 / こんごう モード管理
let selectedDimRule = localStorage.getItem('pdw_dim_rule') || '2d';
if (!['2d', '3d', 'mixed'].includes(selectedDimRule)) selectedDimRule = '2d';
let selectedPlayerIs3D = (localStorage.getItem('pdw_player_is3d') === 'true');

const HANDICAP_LABELS = {
  1: '1: 不利 (激ムズ)',
  2: '2: やや不利',
  3: '3: 普通',
  4: '4: やや有利',
  5: '5: 有利 (やさしい)'
};

const RANKING_MODES = [
  { id: 'single_free', label: 'フリー練習' },
  { id: 'single_ta', label: 'タイムアタック' },
  { id: 'single_sa', label: 'スコアアタック' },
  { id: 'single_survival', label: '勝ち抜きモード' },
  { id: 'com', label: 'COMと対戦' },
  { id: 'battle_records', label: '対戦戦績 (👑/🏅/★)' }
];
let rankingModeIdx = 0;

// ==========================================
// 2D / 3D / こんごう モード制御
// ==========================================
function getEffectiveSelfIs3D() {
  if (selectedDimRule === '3d') return true;
  if (selectedDimRule === '2d') return false;
  return !!selectedPlayerIs3D;
}

function getDimSummaryText(includeSelf = true) {
  if (selectedDimRule === '3d') return '盤面るーる: 3D円筒';
  if (selectedDimRule === '2d') return '盤面るーる: 2D';
  return includeSelf ? `盤面るーる: こんごう(自:${selectedPlayerIs3D ? '3D' : '2D'})` : '盤面るーる: こんごう';
}

function syncDimRuleUI() {
  const isSingleSolo = isElementActuallyVisible('single-menu') && selectedSingleMode !== 'survival';
  if (isSingleSolo && selectedDimRule === 'mixed') {
    selectedDimRule = selectedPlayerIs3D ? '3d' : '2d';
    localStorage.setItem('pdw_dim_rule', selectedDimRule);
  }

  document.querySelectorAll('.dim-rule-group button[data-dim]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.dim === selectedDimRule);
  });

  const singleMixedOpt = document.getElementById('single-dim-mixed-opt');
  if (singleMixedOpt) {
    const showMixed = !isSingleSolo;
    singleMixedOpt.style.display = showMixed ? '' : 'none';
    singleMixedOpt.disabled = !showMixed;
  }

  ['story', 'single', 'com', 'local', 'online'].forEach(prefix => {
    const sel = document.getElementById(`${prefix}-dim-select`);
    if (sel) sel.value = selectedDimRule;
  });

  const selfIs3D = getEffectiveSelfIs3D();
  const selfText = selectedDimRule === 'mixed'
    ? (selfIs3D ? '3D円筒 (18列)' : '2D (6列)')
    : (selfIs3D ? '3D円筒 (ルール連動)' : '2D (ルール連動)');

  ['story-self-dim-toggle', 'single-self-dim-toggle', 'com-self-dim-toggle', 'online-self-dim-toggle'].forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.innerText = selfText;
    btn.classList.toggle('is-3d', selfIs3D);
    btn.classList.toggle('is-locked', selectedDimRule !== 'mixed');
  });

  if (typeof StoryManager !== 'undefined' && isElementActuallyVisible('story-stage-step')) {
    StoryManager.renderPrepSummaryBar();
  }
  if (isElementActuallyVisible('local-menu')) {
    renderLocalMenuUI();
  }
  if (isElementActuallyVisible('share-prep-overlay')) {
    renderSharePrepUI();
  }
}

function selectDimRule(rule, silent = false) {
  const nextRule = ['2d', '3d', 'mixed'].includes(rule) ? rule : '2d';
  if (!silent && selectedDimRule !== nextRule && typeof SE !== 'undefined') SE.play('select');
  selectedDimRule = nextRule;
  localStorage.setItem('pdw_dim_rule', selectedDimRule);

  if (selectedDimRule === '2d') {
    selectedPlayerIs3D = false;
    localSlotsConfig.forEach(s => { s.is3D = false; });
    sharePrepConfig.p1.is3D = false;
    sharePrepConfig.p2.is3D = false;
  } else if (selectedDimRule === '3d') {
    selectedPlayerIs3D = true;
    localSlotsConfig.forEach(s => { s.is3D = true; });
    sharePrepConfig.p1.is3D = true;
    sharePrepConfig.p2.is3D = true;
  }
  localStorage.setItem('pdw_player_is3D', String(!!selectedPlayerIs3D));
  localStorage.setItem('pdw_player_is3d', String(!!selectedPlayerIs3D));
  syncDimRuleUI();
}

function toggleSelectedPlayer3D() {
  const isSingleSolo = isElementActuallyVisible('single-menu') && selectedSingleMode !== 'survival';
  if (selectedDimRule === '2d') {
    selectedPlayerIs3D = true;
    selectedDimRule = isSingleSolo ? '3d' : 'mixed';
  } else if (selectedDimRule === '3d') {
    selectedPlayerIs3D = false;
    selectedDimRule = isSingleSolo ? '2d' : 'mixed';
  } else {
    selectedPlayerIs3D = !selectedPlayerIs3D;
  }
  localStorage.setItem('pdw_dim_rule', selectedDimRule);
  localStorage.setItem('pdw_player_is3d', String(!!selectedPlayerIs3D));
  if (typeof SE !== 'undefined') SE.play('select');
  syncDimRuleUI();
}

function resolveSelfIs3DForMode(mode) {
  if (mode === 'local') {
    if (selectedDimRule === '3d') return true;
    if (selectedDimRule === '2d') return false;
    return !!localSlotsConfig[0].is3D;
  }
  if (mode === 'share') {
    if (selectedDimRule === '3d') return true;
    if (selectedDimRule === '2d') return false;
    return !!sharePrepConfig.p1.is3D;
  }
  return getEffectiveSelfIs3D();
}

function resolveOppIs3DForMode(mode, oppIndex) {
  if (selectedDimRule === '3d') return true;
  if (selectedDimRule === '2d') return false;
  if (mode === 'local') {
    const slot = localSlotsConfig[oppIndex + 1];
    return !!(slot && slot.is3D);
  }
  if (mode === 'share') {
    return !!sharePrepConfig.p2.is3D;
  }
  return Math.random() < 0.5;
}

// ==========================================
// PCどの倍率でも150%相当のレイアウトになる動的スケール計算
// ==========================================
function updateResponsiveUiZoom() {
  const W = window.innerWidth || 1024;
  const H = window.innerHeight || 768;
  const isPortrait = H >= W;
  let zoom = 1.0;

  if (!isPortrait && W >= 1020 && H >= 640) {
    zoom = Math.min(1.65, Math.max(1.0, Math.min(W / 1260, H / 710)));
  } else if (isPortrait && W >= 720 && H >= 960) {
    zoom = Math.min(1.35, Math.max(1.0, Math.min(W / 680, H / 960)));
  }
  zoom = Math.round(zoom * 100) / 100;
  document.documentElement.style.setProperty('--ui-pc-zoom', String(zoom));
  return zoom;
}

// ==========================================
// 対戦モード 連勝(🏅/★) & 累計勝利(👑) & せいせき記録管理
// ==========================================
const BATTLE_STATS_STORAGE_KEY = 'pdw_battle_stats_v1';
const BATTLE_MODE_LABELS = {
  com: 'COMとたいせん',
  local: 'いちだいでたいせん',
  share: 'シェア対戦',
  online: 'それぞれでたいせん'
};

const BattleStatsManager = {
  sessionStreaks: {},
  sessionTotals: {},
  persisted: {},

  init() {
    try {
      const raw = localStorage.getItem(BATTLE_STATS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') this.persisted = parsed;
      }
    } catch (_) {
      this.persisted = {};
    }
  },

  savePersisted() {
    try {
      localStorage.setItem(BATTLE_STATS_STORAGE_KEY, JSON.stringify(this.persisted));
    } catch (_) {}
  },

  normalizeModeKey(mode) {
    if (!mode) return null;
    if (mode === 'com' || mode === 'local' || mode === 'share') return mode;
    if (mode === 'online' || mode === 'online_host' || mode === 'online_client') return 'online';
    return null;
  },

  ensureBucket(modeKey, slotKey) {
    if (!this.sessionStreaks[modeKey]) this.sessionStreaks[modeKey] = {};
    if (!this.sessionStreaks[modeKey][slotKey]) this.sessionStreaks[modeKey][slotKey] = { cur: 0, best: 0 };
    if (!this.sessionTotals[modeKey]) this.sessionTotals[modeKey] = {};
    if (this.sessionTotals[modeKey][slotKey] === undefined) this.sessionTotals[modeKey][slotKey] = 0;
    if (!this.persisted[modeKey]) this.persisted[modeKey] = {};
    if (!this.persisted[modeKey][slotKey]) this.persisted[modeKey][slotKey] = { totalWins: 0, maxStreak: 0 };
  },

  recordResult(rawMode, slotKey, isWin) {
    const modeKey = this.normalizeModeKey(rawMode);
    if (!modeKey || !slotKey) return;
    this.ensureBucket(modeKey, slotKey);
    const st = this.sessionStreaks[modeKey][slotKey];
    const pRec = this.persisted[modeKey][slotKey];
    if (isWin) {
      st.cur++;
      if (st.cur > st.best) st.best = st.cur;
      this.sessionTotals[modeKey][slotKey]++;
      pRec.totalWins++;
      if (st.best > pRec.maxStreak) pRec.maxStreak = st.best;
    } else {
      st.cur = 0;
    }
    this.savePersisted();
  },

  resetSessionStreaks(rawMode) {
    const modeKey = this.normalizeModeKey(rawMode);
    if (!modeKey) return;
    this.sessionStreaks[modeKey] = {};
  },

  getStats(rawMode, slotKey) {
    const modeKey = this.normalizeModeKey(rawMode);
    if (!modeKey || !slotKey) return { crown: 0, best: 0, cur: 0, persistedTotal: 0, persistedMax: 0 };
    const st = (this.sessionStreaks[modeKey] && this.sessionStreaks[modeKey][slotKey]) || { cur: 0, best: 0 };
    const crown = (this.sessionTotals[modeKey] && this.sessionTotals[modeKey][slotKey]) || 0;
    const pRec = (this.persisted[modeKey] && this.persisted[modeKey][slotKey]) || { totalWins: 0, maxStreak: 0 };
    return {
      crown,
      best: st.best || 0,
      cur: st.cur || 0,
      persistedTotal: pRec.totalWins || 0,
      persistedMax: pRec.maxStreak || 0
    };
  },

  buildBadgeChipsHtml(stats, includeStreaks = true) {
    if (!stats) return '';
    let html = `<span class="win-badge-chip crown">👑×${stats.crown}</span>`;
    if (includeStreaks) {
      html += `<span class="win-badge-chip best">🏅×${stats.best}</span>`;
      html += `<span class="win-badge-chip cur">★×${stats.cur}</span>`;
    }
    return html;
  },

  buildMenuBadgeChipsHtml(stats, compact = false) {
    if (!stats) return '';
    const crown = stats.crown || 0;
    const best = stats.best || 0;
    const cur = stats.cur || 0;
    let html = `<span class="win-badge-chip crown" title="今回の累計勝利数">👑×${crown}</span>`
             + `<span class="win-badge-chip best" title="今回の最大連続勝利数">🏅×${best}</span>`;
    if (!compact || cur > 0) {
      html += `<span class="win-badge-chip cur" title="現在の連続勝利数">★×${cur}</span>`;
    }
    return html;
  }
};
BattleStatsManager.init();

function updateModeWinBadgesUI() {
  const comBox = document.getElementById('com-mode-win-badges');
  if (comBox) {
    const st = BattleStatsManager.getStats('com', 'p0');
    comBox.style.display = 'flex';
    comBox.innerHTML = BattleStatsManager.buildMenuBadgeChipsHtml(st, false);
  }
  const onlineBox = document.getElementById('online-mode-win-badges');
  if (onlineBox) {
    const st = BattleStatsManager.getStats('online', 'p0');
    onlineBox.style.display = 'flex';
    onlineBox.innerHTML = BattleStatsManager.buildMenuBadgeChipsHtml(st, false);
  }
}

function getMainPlayerPadSlot() {
  try {
    const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()) : [];
    const slot0 = playerConfigs[0]?.padSlot;
    if (slot0 === undefined || slot0 < 0) return -1;
    if (pads[slot0] && pads[slot0].connected) return slot0;
    if (currentMode !== 'local' && currentMode !== 'share' && slot0 === 0) {
      const usedByOthers = [1, 2, 3].some(i => playerConfigs[i].padSlot === 0);
      if (!usedByOthers) {
        const idx = pads.findIndex(p => p && p.connected);
        if (idx >= 0) return idx;
      }
    }
  } catch (_) {}
  return -1;
}

function getConnectedLocalPadSlotIfVibrating(playerSlotIdx) {
  try {
    const slot = playerConfigs[playerSlotIdx]?.padSlot;
    if (slot === undefined || slot < 0) return -1;
    const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()) : [];
    const p = pads[slot];
    if (p && p.connected && p.vibrationActuator && typeof p.vibrationActuator.playEffect === 'function') {
      return slot;
    }
  } catch (_) {}
  return -1;
}

function onPlayerSkillSelectChange(val) {
  selectedPlayerSkill = val || 'erase_color';
  localStorage.setItem('pdw_player_skill', selectedPlayerSkill);
}

function onFallbackSkillSelectChange(val) {
  let safeVal = val || 'erase_color';
  if (typeof getCustomSkillSlotIndex === 'function' && getCustomSkillSlotIndex(safeVal) !== -1) {
    safeVal = 'erase_color';
  }
  selectedFallbackSkill = safeVal;
  localStorage.setItem('pdw_fallback_skill', selectedFallbackSkill);
}

function getEffectivePlayerSkillId(rawSkillId, allowCustom = true, fallbackOverride = null) {
  const fb = fallbackOverride || selectedFallbackSkill || 'erase_color';
  const safeFb = (typeof getCustomSkillSlotIndex === 'function' && getCustomSkillSlotIndex(fb) !== -1) ? 'erase_color' : fb;
  if (!rawSkillId) return safeFb;
  if (typeof getCustomSkillSlotIndex === 'function' && getCustomSkillSlotIndex(rawSkillId) !== -1) {
    if (!allowCustom) return safeFb;
    if (typeof getCustomSkillConfig === 'function' && !getCustomSkillConfig(rawSkillId)) return safeFb;
  }
  return rawSkillId;
}

function syncPlayerSkillSelects() {
  if (typeof refreshAllSkillCarousels === 'function') refreshAllSkillCarousels();
}

function isElementActuallyVisible(id) {
  let el = document.getElementById(id);
  while (el && el !== document.body && el !== document.documentElement) {
    const st = window.getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden') return false;
    el = el.parentElement;
  }
  return !!el;
}

function focusPrimaryMenuElement(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const focusables = Array.from(container.querySelectorAll('button, select, input, .cf-stage-wrap, [tabindex]:not([tabindex="-1"])'))
    .filter(el => {
      if (el.disabled || el.tabIndex < 0 || el.classList.contains('menu-back-top-btn')) return false;
      if (el.classList.contains('cf-nav-btn') || el.classList.contains('cf-slider')) return false;
      const st = window.getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden') return false;
      let p = el.parentElement;
      while (p) {
        if (window.getComputedStyle(p).display === 'none') return false;
        p = p.parentElement;
      }
      return true;
    });
  if (focusables.length > 0) {
    requestAnimationFrame(() => focusables[0].focus());
  }
}

// ==========================================
// 退出確認モーダル & ゲーム終了確認モーダル
// ==========================================
function openExitConfirmModal() {
  const modal = document.getElementById('exit-confirm-modal');
  if (!modal) {
    performExitGame(true);
    return;
  }
  const msgEl = document.getElementById('exit-confirm-message');
  if (msgEl) {
    if (currentMode.startsWith('single_') && currentMode !== 'single_survival') {
      msgEl.innerHTML = '退出して練習設定画面に戻りますか？';
    } else {
      msgEl.innerHTML = '退出して前の画面に戻りますか？<br>（対戦時は負けになります）';
    }
  }
  isExitConfirmOpen = true;
  if (typeof pauseBgmForModal === 'function') pauseBgmForModal();
  if (typeof stopAllVibration === 'function') stopAllVibration();
  clearKeyboardHoldStates();
  stopRotateTouchHold();
  if (myEngine) {
    myEngine.isRisingManualBtn = myEngine.isRisingManualKey = myEngine.isRisingManualPad = false;
    myEngine.touchGrab = null;
  }
  opponents.forEach(opp => {
    if (opp.engine) {
      opp.engine.isRisingManualBtn = opp.engine.isRisingManualKey = opp.engine.isRisingManualPad = false;
      opp.engine.touchGrab = null;
    }
  });
  modal.style.display = 'flex';
  SE.play('select', { skipVibrate: true });
  if (typeof syncPadSnapshotsAll === 'function') syncPadSnapshotsAll(200);
  const cancelBtn = document.getElementById('exit-confirm-cancel-btn');
  if (cancelBtn) requestAnimationFrame(() => cancelBtn.focus());
}

function closeExitConfirmModal(silent = false) {
  const modal = document.getElementById('exit-confirm-modal');
  const wasOpen = modal && modal.style.display === 'flex';
  if (modal) modal.style.display = 'none';
  isExitConfirmOpen = false;
  if (!silent) SE.play('cancel');
  if (wasOpen && !silent && typeof resumeBgmFromModal === 'function') {
    resumeBgmFromModal();
  }
  if (document.activeElement) document.activeElement.blur();
  if (typeof syncPadSnapshotsAll === 'function') syncPadSnapshotsAll(180);
}

function confirmExitFromModal() {
  if (typeof stopAllVibration === 'function') stopAllVibration();
  closeExitConfirmModal(true);
  performExitGame(false);
}

function openAppExitConfirmModal() {
  const modal = document.getElementById('app-exit-confirm-modal');
  if (!modal) return;
  modal.style.display = 'flex';
  SE.play('select');
  if (typeof syncPadSnapshotsAll === 'function') syncPadSnapshotsAll(180);
  const cancelBtn = document.getElementById('app-exit-cancel-btn');
  if (cancelBtn) requestAnimationFrame(() => cancelBtn.focus());
}

function closeAppExitConfirmModal(silent = false) {
  const modal = document.getElementById('app-exit-confirm-modal');
  if (modal) modal.style.display = 'none';
  if (!silent) SE.play('cancel');
  if (typeof syncPadSnapshotsAll === 'function') syncPadSnapshotsAll(180);
  if (isElementActuallyVisible('main-menu-actions')) {
    focusPrimaryMenuElement('main-menu-actions');
  }
}

function confirmAppExitFromModal() {
  if (typeof isAppExiting !== 'undefined') isAppExiting = true;
  if (typeof stopAllVibration === 'function') stopAllVibration();
  closeAppExitConfirmModal(true);
  SE.play('select', { skipVibrate: true });
  if (typeof SceneBgm !== 'undefined') SceneBgm.stop();
  stopBgm();
  try { window.close(); } catch (_) {}
  setTimeout(() => {
    if (typeof stopAllVibration === 'function') stopAllVibration();
    const term = document.getElementById('app-terminated-overlay');
    if (term) {
      term.style.display = 'flex';
      const backBtn = document.getElementById('app-terminated-back-btn');
      if (backBtn) requestAnimationFrame(() => backBtn.focus());
    }
    if (typeof syncPadSnapshotsAll === 'function') syncPadSnapshotsAll(180);
  }, 180);
}

function reopenAppFromTerminated() {
  if (typeof isAppExiting !== 'undefined') isAppExiting = false;
  const term = document.getElementById('app-terminated-overlay');
  if (term) term.style.display = 'none';
  SE.play('select');
  if (typeof SceneBgm !== 'undefined' && (typeof OpAnimation === 'undefined' || !OpAnimation.isActive())) {
    SceneBgm.play('mode_select');
  }
  focusPrimaryMenuElement('main-menu-actions');
  if (typeof syncPadSnapshotsAll === 'function') syncPadSnapshotsAll(180);
}

// ==========================================
// スキル選択モーダル（装備スキル & 自作OFF時スキル） & 最終確認モーダル
// ==========================================
let activeSkillConfirmFlow = null;
let activeSkillModalTab = 'main';

function openSkillAndConfirmFlow(flowCfg) {
  const allowCustom = flowCfg.allowCustom !== false;
  activeSkillConfirmFlow = {
    charId: flowCfg.charId || resolvePlayableCharId(selectedCharId),
    allowCustom,
    extraText: flowCfg.extraText || '',
    okLabel: flowCfg.okLabel || 'OK！（開始）',
    onConfirm: flowCfg.onConfirm || null
  };
  activeSkillModalTab = allowCustom ? 'main' : 'fallback';
  openSkillSelectModal();
}

function switchSkillModalTab(tabKey) {
  const allowCustom = !activeSkillConfirmFlow || activeSkillConfirmFlow.allowCustom !== false;
  if (!allowCustom && tabKey === 'main') {
    SE.play('cancel');
    showToast('この対戦では自作スキルがOFFになっています');
    return;
  }
  activeSkillModalTab = (tabKey === 'fallback') ? 'fallback' : 'main';
  SE.play('cursorMove');
  renderSkillModalPicker();
}

function renderSkillModalPicker(focusSkillId = null) {
  const allowCustom = !activeSkillConfirmFlow || activeSkillConfirmFlow.allowCustom !== false;
  if (!allowCustom) activeSkillModalTab = 'fallback';

  const tabMain = document.getElementById('skill-tab-main');
  const tabFb = document.getElementById('skill-tab-fallback');
  if (tabMain) {
    tabMain.disabled = !allowCustom;
    tabMain.classList.toggle('active', activeSkillModalTab === 'main');
  }
  if (tabFb) {
    tabFb.classList.toggle('active', activeSkillModalTab === 'fallback');
  }

  const charBadge = document.getElementById('skill-modal-char-badge');
  if (charBadge && activeSkillConfirmFlow) {
    const ch = getCharacterById(activeSkillConfirmFlow.charId);
    const fbLabel = (typeof getSkillLabel === 'function') ? getSkillLabel(selectedFallbackSkill) : selectedFallbackSkill;
    const modeNote = allowCustom
      ? `自作ON (OFF時: ${fbLabel})`
      : '自作OFF (通常スキルから選択)';
    charBadge.innerText = `キャラ: ${ch.name} | ${modeNote}`;
  }

  if (typeof renderSkillCarousel === 'function') {
    const isFb = (activeSkillModalTab === 'fallback');
    renderSkillCarousel('skill-modal-picker', {
      allowCustom: !isFb,
      directHorizontal: true,
      currentSkillId: focusSkillId || (isFb ? selectedFallbackSkill : selectedPlayerSkill),
      title: isFb
        ? '自作スキルOFF時に使うスキルを選択'
        : '装備スキルを選択（◀▶で切替 / 決定で確定）',
      onSelect: (skId) => {
        if (isFb) onFallbackSkillSelectChange(skId);
        else onPlayerSkillSelectChange(skId);
      },
      onCenterClick: () => confirmSkillSelectModal()
    });
  }
}

function openSkillSelectModal() {
  if (!activeSkillConfirmFlow) return;
  const modal = document.getElementById('skill-select-modal');
  const confirmModal = document.getElementById('confirm-match-modal');
  if (confirmModal) confirmModal.style.display = 'none';

  renderSkillModalPicker();

  if (modal) {
    modal.style.display = 'flex';
    if (typeof syncPadSnapshotsAll === 'function') syncPadSnapshotsAll(160);
    const stageWrap = modal.querySelector('.cf-stage-wrap');
    if (stageWrap) stageWrap.focus();
  }
}

function closeSkillSelectModal(silent = false) {
  const modal = document.getElementById('skill-select-modal');
  if (modal) modal.style.display = 'none';
  if (!silent && activeSkillConfirmFlow) SE.play('cancel');
  activeSkillConfirmFlow = null;
  if (typeof syncPadSnapshotsAll === 'function') syncPadSnapshotsAll(160);
}

function confirmSkillSelectModal() {
  const modal = document.getElementById('skill-select-modal');
  if (modal) modal.style.display = 'none';
  if (!activeSkillConfirmFlow) return;
  SE.play('select');
  openConfirmMatchModal();
}

function openConfirmMatchModal() {
  if (!activeSkillConfirmFlow) return;
  const modal = document.getElementById('confirm-match-modal');
  if (!modal) {
    acceptConfirmModal();
    return;
  }
  const charId = activeSkillConfirmFlow.charId;
  const allowCustom = activeSkillConfirmFlow.allowCustom !== false;
  const ch = getCharacterById(charId);
  const imgEl = document.getElementById('confirm-modal-char-img');
  const nameEl = document.getElementById('confirm-modal-char-name');
  if (imgEl) {
    if (charId === 'random') {
      applyCharacterImageToElement(imgEl, 'main00', 'normal');
    } else if (charId === 'custom' && CustomAssets.chara) {
      imgEl.src = CustomAssets.chara.dataUrl;
    } else {
      applyCharacterImageToElement(imgEl, charId, 'normal');
    }
  }
  if (nameEl) nameEl.innerText = ch.name;

  const rawSk = allowCustom ? selectedPlayerSkill : selectedFallbackSkill;
  const skId = getEffectivePlayerSkillId(rawSk, allowCustom);
  const skIcon = (typeof getSkillIcon === 'function') ? getSkillIcon(skId) : '⚡';
  const skName = (typeof getSkillLabel === 'function') ? getSkillLabel(skId) : skId;
  const skDesc = (typeof getSkillDesc === 'function') ? getSkillDesc(skId) : '';
  document.getElementById('confirm-modal-skill-icon').innerText = skIcon;
  document.getElementById('confirm-modal-skill-name').innerText = skName;
  document.getElementById('confirm-modal-skill-desc').innerText = skDesc;
  document.getElementById('confirm-modal-extra').innerText = activeSkillConfirmFlow.extraText || '';

  const okBtn = document.getElementById('confirm-modal-ok-btn');
  if (okBtn) {
    okBtn.innerText = activeSkillConfirmFlow.okLabel || 'OK！';
    modal.style.display = 'flex';
    okBtn.focus();
  } else {
    modal.style.display = 'flex';
  }
  if (typeof syncPadSnapshotsAll === 'function') syncPadSnapshotsAll(160);
}

function backFromConfirmModal() {
  const modal = document.getElementById('confirm-match-modal');
  if (modal) modal.style.display = 'none';
  SE.play('cancel');
  openSkillSelectModal();
}

function acceptConfirmModal() {
  const modal = document.getElementById('confirm-match-modal');
  if (modal) modal.style.display = 'none';
  const cb = activeSkillConfirmFlow && activeSkillConfirmFlow.onConfirm;
  activeSkillConfirmFlow = null;
  SE.play('select');
  if (typeof syncPadSnapshotsAll === 'function') syncPadSnapshotsAll(180);
  if (typeof cb === 'function') cb();
}

function beginSingleStartFlow() {
  SE.play('select');
  if (typeof playCharacterConfirmVoice === 'function') {
    playCharacterConfirmVoice(selectedCharId);
  }
  const skillOn = !!document.getElementById('single-skill-toggle')?.checked;
  if (!skillOn) {
    startSingleMode();
    return;
  }
  const allowCustom = !!document.getElementById('single-custom-skill-toggle')?.checked;
  const modeNames = { free: 'フリー', ta: 'タイムアタック', sa: 'スコアアタック', survival: '勝ち抜き' };
  openSkillAndConfirmFlow({
    charId: selectedCharId,
    allowCustom,
    extraText: `練習: ${modeNames[selectedSingleMode] || 'フリー'} / ${getDimSummaryText(selectedSingleMode === 'survival')} / 自作:${allowCustom ? 'ON' : 'OFF'}`,
    okLabel: 'OK！スタート',
    onConfirm: () => startSingleMode()
  });
}

function beginComStartFlow() {
  SE.play('select');
  if (typeof playCharacterConfirmVoice === 'function') {
    playCharacterConfirmVoice(selectedCharId);
  }
  const skillOn = !!document.getElementById('com-cheat-toggle')?.checked;
  if (!skillOn) {
    startComGameFromSlider();
    return;
  }
  const allowCustom = !!document.getElementById('com-custom-skill-toggle')?.checked;
  const lv = parseInt(document.getElementById('com-level-slider')?.value, 10) || 2;
  openSkillAndConfirmFlow({
    charId: selectedCharId,
    allowCustom,
    extraText: `COM対戦 (${selectedComCount}人 / Lv.${lv} / ${getDimSummaryText(true)} / 自作:${allowCustom ? 'ON' : 'OFF'})`,
    okLabel: 'OK！対戦開始',
    onConfirm: () => startComGameFromSlider()
  });
}

function beginOnlineCreateFlow() {
  SE.play('select');
  if (typeof playCharacterConfirmVoice === 'function') {
    playCharacterConfirmVoice(selectedCharId);
  }
  const skillOn = !!document.getElementById('online-skill-toggle')?.checked;
  if (!skillOn) {
    createRoom();
    return;
  }
  const allowCustom = !!document.getElementById('online-custom-skill-toggle')?.checked;
  const maxP = document.getElementById('online-max-players')?.value || '2';
  openSkillAndConfirmFlow({
    charId: selectedCharId,
    allowCustom,
    extraText: `オンライン部屋作成 (${maxP}人 / ${getDimSummaryText(true)} / 自作:${allowCustom ? 'ON' : 'OFF'})`,
    okLabel: 'OK！部屋を作る',
    onConfirm: () => createRoom()
  });
}

function beginOnlineJoinFlow() {
  const code = document.getElementById('peer-room-id')?.value.trim();
  if (!code) { SE.play('cancel'); showToast('部屋コードを入力してください'); return; }
  SE.play('select');
  if (typeof playCharacterConfirmVoice === 'function') {
    playCharacterConfirmVoice(selectedCharId);
  }
  const skillOn = !!document.getElementById('online-skill-toggle')?.checked;
  if (!skillOn) {
    joinRoom();
    return;
  }
  const allowCustom = !!document.getElementById('online-custom-skill-toggle')?.checked;
  openSkillAndConfirmFlow({
    charId: selectedCharId,
    allowCustom,
    extraText: `部屋参加: ${code.toUpperCase()}（こんごう時自:${selectedPlayerIs3D ? '3D' : '2D'}）`,
    okLabel: 'OK！部屋に入る',
    onConfirm: () => joinRoom()
  });
}
function syncHandicapFromSlider(val) {
  const v = Math.max(1, Math.min(5, parseInt(val, 10) || 3));
  const hidden = document.getElementById('handicap-val');
  if (hidden) hidden.value = String(v);
  ['single', 'com', 'online'].forEach(prefix => {
    const sl = document.getElementById(`${prefix}-handicap-slider`);
    const lb = document.getElementById(`${prefix}-handicap-val`);
    if (sl) sl.value = String(v);
    if (lb) lb.innerText = HANDICAP_LABELS[v] || String(v);
  });
}
// ==========================================
// START(ポーズ／退出相当)ボタンによるメニュー一括決定
// ==========================================
function handleMenuStartAction() {
  if (isElementActuallyVisible('app-terminated-overlay')) {
    reopenAppFromTerminated();
    return true;
  }
  if (isElementActuallyVisible('app-exit-confirm-modal')) {
    closeAppExitConfirmModal();
    return true;
  }
  if (isElementActuallyVisible('key-reset-confirm-modal')) {
    if (typeof closeKeyResetConfirmModal === 'function') closeKeyResetConfirmModal();
    return true;
  }
  if (isElementActuallyVisible('settings-confirm-modal')) {
    if (typeof confirmSettingsModalAction === 'function') confirmSettingsModalAction();
    return true;
  }
  if (isElementActuallyVisible('exit-confirm-modal')) {
    closeExitConfirmModal();
    return true;
  }
  if (isElementActuallyVisible('pwa-guide-modal')) {
    closePwaGuideModal();
    return true;
  }
  if (isElementActuallyVisible('custom-skill-modal')) {
    saveCurrentCustomSkillSlot();
    return true;
  }
  if (isElementActuallyVisible('confirm-match-modal')) {
    acceptConfirmModal();
    return true;
  }
  if (isElementActuallyVisible('skill-select-modal')) {
    confirmSkillSelectModal();
    return true;
  }
  if (isElementActuallyVisible('settings-overlay')) {
    if (typeof attemptSaveSettings === 'function') attemptSaveSettings();
    else closeSettings();
    return true;
  }
  if (isElementActuallyVisible('result-overlay')) {
    requestRematch();
    return true;
  }
  if (isElementActuallyVisible('countdown-overlay')) {
    const startBtn = document.getElementById('countdown-start-btn');
    if (startBtn && window.getComputedStyle(startBtn).display !== 'none') {
      forceStartRoom();
      return true;
    }
    return false;
  }
  if (isElementActuallyVisible('room-waiting')) {
    const forceBtn = document.getElementById('force-start-btn');
    if (forceBtn && window.getComputedStyle(forceBtn).display !== 'none') {
      startCountdown();
      return true;
    }
    return false;
  }
  if (isElementActuallyVisible('story-menu')) {
    if (isElementActuallyVisible('story-stage-step')) {
      StoryManager.startSelectedStage();
      return true;
    }
    if (isElementActuallyVisible('story-prep-step')) {
      StoryManager.confirmPrepAndNext();
      return true;
    }
  }
  if (isElementActuallyVisible('single-menu')) {
    beginSingleStartFlow();
    return true;
  }
  if (isElementActuallyVisible('com-menu')) {
    beginComStartFlow();
    return true;
  }
  if (isElementActuallyVisible('online-menu')) {
    const code = document.getElementById('peer-room-id')?.value.trim();
    if (code) beginOnlineJoinFlow();
    else beginOnlineCreateFlow();
    return true;
  }
  if (isElementActuallyVisible('local-menu')) {
    forceConfirmAllAndStartLocal();
    return true;
  }

  const activeEl = document.activeElement;
  if (activeEl && activeEl.classList.contains('menu-card-btn') && typeof activeEl.click === 'function') {
    activeEl.click();
    return true;
  }
  return false;
}

// ==========================================
// 縦UIハブ大型立ち絵 & Switch風メニュー2ペイン & 縦ボトムメニュー制御
// ==========================================
function refreshMenuHeaderAndPreview(rerollHubChar = false) {
  const charId = resolvePlayableCharId(selectedCharId);
  const customUrl = (charId === 'custom' && CustomAssets.chara) ? CustomAssets.chara.dataUrl : null;
  const heroImg = document.getElementById('switch-hero-img');
  if (heroImg && typeof applyCharacterImageToElement === 'function') {
    applyCharacterImageToElement(heroImg, charId, 'normal', { customUrl });
  }

  const hubCharId = typeof pickHubPortraitCharId === 'function' ? pickHubPortraitCharId(rerollHubChar) : charId;
  const hubCh = getCharacterById(hubCharId);
  const hubCustomUrl = (hubCharId === 'custom' && CustomAssets.chara) ? CustomAssets.chara.dataUrl : null;
  const vImg = document.getElementById('vertical-hub-hero-img');
  const vName = document.getElementById('vertical-hub-hero-name');
  if (vImg && typeof applyCharacterImageToElement === 'function') {
    applyCharacterImageToElement(vImg, hubCharId, 'normal', { customUrl: hubCustomUrl });
  }
  if (vName) {
    vName.innerText = (hubCharId === 'custom') ? getPlayerDisplayName() : hubCh.name;
    vName.style.borderColor = hubCh.color || '#ffd700';
  }
}

function setSwitchHeroPreview(title, desc, badge = 'PUZZLE ACTION') {
  const tEl = document.getElementById('switch-hero-title');
  const dEl = document.getElementById('switch-hero-desc');
  const bEl = document.getElementById('switch-hero-badge');
  if (tEl && title) tEl.innerText = title;
  if (dEl && desc) dEl.innerText = desc;
  if (bEl && badge) bEl.innerText = badge;
}

function updateVerticalBottomNav() {
  const nav = document.getElementById('vertical-bottom-nav');
  const menuOverlay = document.getElementById('menu-overlay');
  if (!nav || !menuOverlay) return;

  const isPortrait = window.innerHeight >= window.innerWidth;
  const isVis = (id) => {
    const el = document.getElementById(id);
    return el && window.getComputedStyle(el).display !== 'none';
  };
  const isGameActive = isVis('game-area');
  const isMenuOpen = isVis('menu-overlay');
  const isMainHub = isVis('main-menu') && isVis('main-menu-actions');
  const isWaiting = isVis('room-waiting');
  const isSharePrep = isVis('share-prep-overlay');
  const isSettingsOpen = isVis('settings-overlay');

  let activeModeKey = null;
  if (isSettingsOpen) activeModeKey = 'settings';
  else if (isVis('solo-hub-menu') || isVis('story-menu') || isVis('com-menu') || isVis('single-menu')) activeModeKey = 'solo';
  else if (isVis('multi-hub-menu') || isVis('local-menu') || isVis('online-menu')) activeModeKey = 'multi';
  else if (isVis('ranking-menu')) activeModeKey = 'ranking';
  else if (isMainHub) activeModeKey = 'home';

  const shouldShow = isPortrait && !isGameActive && (isSettingsOpen || (isMenuOpen && !isMainHub)) && !isWaiting && !isSharePrep && (activeModeKey !== null);

  nav.style.display = shouldShow ? 'grid' : 'none';
  menuOverlay.classList.toggle('has-vertical-bottom-nav', shouldShow);
  document.body.classList.toggle('settings-has-vnav', shouldShow && isSettingsOpen);

  if (shouldShow) {
    nav.querySelectorAll('.v-bottom-btn').forEach(btn => {
      const target = btn.dataset.nav;
      btn.classList.toggle('active', target === activeModeKey);
    });
  }
}

function navigateFromBottomNav(target) {
  const isSettingsOpen = isElementActuallyVisible('settings-overlay');
  if (isSettingsOpen) {
    if (target === 'settings') return;
    if (typeof attemptCancelSettings === 'function') {
      attemptCancelSettings(() => navigateFromBottomNav(target));
    } else {
      cancelSettings(() => navigateFromBottomNav(target));
    }
    return;
  }

  cancelLocalAutoStart();
  clearLocalSliderAdjusting();
  if (typeof closeRangeDigitEdit === 'function') closeRangeDigitEdit();
  if (typeof closeSelectPickerModal === 'function') closeSelectPickerModal(true);
  if (typeof closeCustomSkillModal === 'function') closeCustomSkillModal(true);
  if (typeof closePwaGuideModal === 'function') closePwaGuideModal(true);
  if (typeof closeKeyResetConfirmModal === 'function') closeKeyResetConfirmModal(true);
  if (typeof closeSettingsConfirmModal === 'function') closeSettingsConfirmModal(true);
  closeAppExitConfirmModal(true);
  closeSharePrepMenu(true);
  closeSkillSelectModal(true);
  const cModal = document.getElementById('confirm-match-modal');
  if (cModal) cModal.style.display = 'none';

  switch (target) {
    case 'home':
      backToMainMenu(true);
      break;
    case 'solo':
      showSoloHubMenu();
      break;
    case 'multi':
      showMultiHubMenu();
      break;
    case 'settings':
      openSettings();
      break;
    case 'ranking':
      showRankingMenu();
      break;
  }
}

function refreshMenuLayoutState(rerollHubChar = false) {
  updateResponsiveUiZoom();
  const menuOverlay = document.getElementById('menu-overlay');
  if (!menuOverlay) return;
  const isPortrait = window.innerHeight >= window.innerWidth;
  const isLandscape = !isPortrait;
  const isSwitchLandscape = isLandscape && window.innerWidth >= 560;
  const isVis = (id) => {
    const el = document.getElementById(id);
    return el && window.getComputedStyle(el).display !== 'none';
  };
  const isWaiting = isVis('room-waiting');
  const isHub = !isWaiting && (
    (isVis('main-menu') && isVis('main-menu-actions')) ||
    isVis('solo-hub-menu') ||
    isVis('multi-hub-menu')
  );
  const hasBackBtn = !isWaiting && (
    isVis('solo-hub-menu') ||
    isVis('multi-hub-menu') ||
    isVis('story-menu') ||
    isVis('single-menu') ||
    isVis('ranking-menu') ||
    isVis('com-menu') ||
    isVis('local-menu') ||
    isVis('online-menu')
  );

  menuOverlay.classList.toggle('has-back-btn', hasBackBtn);
  menuOverlay.classList.toggle('switch-hub-active', isSwitchLandscape && isHub);
  menuOverlay.classList.toggle('vertical-hub-active', isPortrait && isHub);

  const verticalHubHero = document.getElementById('vertical-hub-hero');
  if (verticalHubHero) {
    verticalHubHero.style.display = (isPortrait && isHub) ? 'flex' : 'none';
  }
  const heroPanel = document.getElementById('switch-hero-panel');
  if (heroPanel) {
    heroPanel.style.display = (isSwitchLandscape && isHub) ? 'flex' : 'none';
  }
  updateVerticalBottomNav();
  refreshMenuHeaderAndPreview(rerollHubChar);
}

function bindSwitchMenuHoverEvents() {
  document.querySelectorAll('.menu-card-btn').forEach(btn => {
    const update = () => {
      const desc = btn.dataset.desc || '';
      const title = btn.innerText.trim();
      setSwitchHeroPreview(title, desc, 'MODE SELECT');
    };
    btn.addEventListener('mouseenter', update);
    btn.addEventListener('focus', update);
  });
}

function bindMenuHoverCursorSE() {
  let lastHoveredEl = null;
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    const isGameVisible = document.getElementById('game-area')?.style.display === 'flex';
    const isResultVisible = document.getElementById('result-overlay')?.style.display === 'flex';
    const isSettingsVisible = document.getElementById('settings-overlay')?.style.display === 'block';
    const isSettingsConfirmVisible = document.getElementById('settings-confirm-modal')?.style.display === 'flex';
    const isSkillModalVisible = document.getElementById('skill-select-modal')?.style.display === 'flex';
    const isCustomSkillModalVisible = document.getElementById('custom-skill-modal')?.style.display === 'flex';
    const isConfirmModalVisible = document.getElementById('confirm-match-modal')?.style.display === 'flex';
    const isSelectPickerVisible = document.getElementById('select-picker-modal')?.style.display === 'flex';
    const isExitConfirmVisible = document.getElementById('exit-confirm-modal')?.style.display === 'flex';
    const isAppExitConfirmVisible = document.getElementById('app-exit-confirm-modal')?.style.display === 'flex';
    const isAppTerminatedVisible = document.getElementById('app-terminated-overlay')?.style.display === 'flex';
    const isKeyResetVisible = document.getElementById('key-reset-confirm-modal')?.style.display === 'flex';
    const isSharePrepVisible = document.getElementById('share-prep-overlay')?.style.display === 'flex';
    const isMenuHoverContext = !isGameVisible || isResultVisible || isSettingsVisible || isSettingsConfirmVisible || isSkillModalVisible || isCustomSkillModalVisible || isConfirmModalVisible || isSelectPickerVisible || isExitConfirmVisible || isAppExitConfirmVisible || isAppTerminatedVisible || isKeyResetVisible || isSharePrepVisible;
    if (!isMenuHoverContext) {
      lastHoveredEl = null;
      return;
    }

    const target = e.target && e.target.closest
      ? e.target.closest('button, label.small-btn, .switch-wrapper, .local-select-tile, .share-prep-char-btn, .cf-nav-btn')
      : null;
    if (!target) {
      lastHoveredEl = null;
      return;
    }
    if (target.disabled || target === lastHoveredEl) return;
    lastHoveredEl = target;
    if (typeof SE !== 'undefined') SE.play('cursorMove');
  });
}

// ==========================================
// ローカル対戦：スマブラ風 上半分タイル選択＆下半分4等分ドックUI（自キャラ枠2D/3D切替対応）
// ==========================================
let localSlotsConfig = [
  { isCom: false, comLevel: 3, handicap: 3, is3D: false, charId: 'main00', skillId: 'erase_color',       fallbackSkillId: 'erase_color',       phase: 'char',  cursorStage: 'char', charCursorIdx: 0, skillCursorIdx: 0 },
  { isCom: false, comLevel: 3, handicap: 3, is3D: false, charId: 'sub01',  skillId: 'erase_rows',        fallbackSkillId: 'erase_rows',        phase: 'char',  cursorStage: 'char', charCursorIdx: 1, skillCursorIdx: 1 },
  { isCom: true,  comLevel: 3, handicap: 3, is3D: false, charId: 'sub02',  skillId: 'purify_garbage',    fallbackSkillId: 'purify_garbage',    phase: 'ready', cursorStage: 'char', charCursorIdx: 2, skillCursorIdx: 2 },
  { isCom: true,  comLevel: 3, handicap: 3, is3D: false, charId: 'sub03',  skillId: 'corrupt_enemy_row', fallbackSkillId: 'corrupt_enemy_row', phase: 'ready', cursorStage: 'char', charCursorIdx: 3, skillCursorIdx: 3 }
];
let activeLocalTouchActor = 0;
let localPadTargetSlot = [0, 1, 2, 3];
let localDomNavOwner = null;
let localAutoStartTimer = null;
let localMenuPadPrev = [{}, {}, {}, {}];
let localMenuPadWaitRelease = [{}, {}, {}, {}];
let localMenuPadLastPressAt = [{}, {}, {}, {}];
let localMenuPadDirState = Array.from({ length: 4 }, () => ({
  Up:    { held: false, startAt: 0, lastAt: 0, releaseAt: 0 },
  Down:  { held: false, startAt: 0, lastAt: 0, releaseAt: 0 },
  Left:  { held: false, startAt: 0, lastAt: 0, releaseAt: 0 },
  Right: { held: false, startAt: 0, lastAt: 0, releaseAt: 0 }
}));

function resetLocalMenuPadDir(padIdx) {
  if (!localMenuPadDirState[padIdx]) return;
  localMenuPadDirState[padIdx] = {
    Up:    { held: false, startAt: 0, lastAt: 0, releaseAt: 0 },
    Down:  { held: false, startAt: 0, lastAt: 0, releaseAt: 0 },
    Left:  { held: false, startAt: 0, lastAt: 0, releaseAt: 0 },
    Right: { held: false, startAt: 0, lastAt: 0, releaseAt: 0 }
  };
}

function clearLocalSliderAdjusting() {
  if (typeof clearSliderAdjusting === 'function') {
    clearSliderAdjusting();
  }
}

function getLocalPlayerCount() {
  return Math.max(2, Math.min(4, parseInt(document.getElementById('local-player-count')?.value, 10) || 2));
}

function isLocalSkillRuleOn() {
  return !!document.getElementById('local-skill-toggle')?.checked;
}

function isLocalCustomSkillRuleOn() {
  return !!document.getElementById('local-custom-skill-toggle')?.checked;
}

function getLocalAvailableSkills() {
  const allowCustom = isLocalCustomSkillRuleOn();
  return (typeof getSelectableSkillIds === 'function') ? getSelectableSkillIds(allowCustom) : SKILL_IDS;
}

function getLocalEffectiveSlotSkill(slot) {
  if (!slot) return 'erase_color';
  const allowCustom = isLocalCustomSkillRuleOn();
  return getEffectivePlayerSkillId(slot.skillId, allowCustom, slot.fallbackSkillId);
}

function toggleLocalSlot3D(slotIdx) {
  const slot = localSlotsConfig[slotIdx];
  if (!slot) return;
  cancelLocalAutoStart();
  if (selectedDimRule === '2d') {
    selectedDimRule = 'mixed';
    localSlotsConfig.forEach(s => { s.is3D = false; });
    slot.is3D = true;
  } else if (selectedDimRule === '3d') {
    selectedDimRule = 'mixed';
    localSlotsConfig.forEach(s => { s.is3D = true; });
    slot.is3D = false;
  } else {
    slot.is3D = !slot.is3D;
  }
  localStorage.setItem('pdw_dim_rule', selectedDimRule);
  if (typeof SE !== 'undefined') SE.play('select');
  syncDimRuleUI();
}

function isLocalSlotPadConnected(slotIdx, pads = null) {
  const pSlot = playerConfigs[slotIdx]?.padSlot;
  if (pSlot === undefined || pSlot < 0) return false;
  const padList = pads || (navigator.getGamepads ? Array.from(navigator.getGamepads()) : []);
  return !!(padList[pSlot] && padList[pSlot].connected);
}

function canOwnerEditLocalSlot(targetSlot, ownerKey, pads = null) {
  const slot = localSlotsConfig[targetSlot];
  if (!slot) return false;
  if (slot.isCom) return true;
  if (!isLocalSlotPadConnected(targetSlot, pads)) return true;
  if (typeof ownerKey === 'number') {
    return playerConfigs[targetSlot]?.padSlot === ownerKey;
  }
  return true;
}

function getLocalOwnerPadTarget(ownerKey) {
  if (typeof ownerKey === 'number') {
    const val = localPadTargetSlot[ownerKey];
    if (val !== undefined && val >= 0 && val < getLocalPlayerCount()) return val;
    const owned = playerConfigs.findIndex(pc => pc.padSlot === ownerKey);
    return owned >= 0 ? owned : 0;
  }
  return activeLocalTouchActor;
}

function setLocalOwnerPadTarget(ownerKey, targetSlot) {
  if (typeof ownerKey === 'number') {
    localPadTargetSlot[ownerKey] = targetSlot;
  }
  activeLocalTouchActor = targetSlot;
}

function getLocalDomFocusables(scopeFilter = null) {
  const root = document.getElementById('local-menu');
  if (!root) return [];
  return Array.from(root.querySelectorAll('button, select, input'))
    .filter(el => {
      if (el.disabled || el.tabIndex < 0) return false;
      if (el.classList.contains('local-select-tile')) return false;
      if (scopeFilter === 'top') {
        if (!el.closest('.local-top-bar') && el.id !== 'local-back-btn') return false;
      } else if (scopeFilter === 'dock') {
        if (!el.closest('#local-slots-dock')) return false;
      }
      const st = window.getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden') return false;
      let p = el.parentElement;
      while (p) {
        if (window.getComputedStyle(p).display === 'none') return false;
        p = p.parentElement;
      }
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
}

function cancelLocalAutoStart() {
  if (localAutoStartTimer) {
    clearTimeout(localAutoStartTimer);
    localAutoStartTimer = null;
  }
}

function resetLocalSelectionStates() {
  cancelLocalAutoStart();
  clearLocalSliderAdjusting();
  localDomNavOwner = null;
  const cnt = getLocalPlayerCount();
  const availSkills = getLocalAvailableSkills();
  for (let i = 0; i < 4; i++) {
    const slot = localSlotsConfig[i];
    if (i === 0) slot.isCom = false;
    if (selectedDimRule === '2d') slot.is3D = false;
    else if (selectedDimRule === '3d') slot.is3D = true;
    slot.handicap = Math.max(1, Math.min(5, slot.handicap || 3));
    slot.comLevel = Math.max(1, Math.min(99, slot.comLevel || 3));
    slot.charCursorIdx = Math.max(0, CHAR_PICKER_ORDER.indexOf(slot.charId));
    if (!slot.fallbackSkillId || getCustomSkillSlotIndex(slot.fallbackSkillId) !== -1) {
      slot.fallbackSkillId = (i === 0 && selectedFallbackSkill) ? selectedFallbackSkill : 'erase_color';
    }
    const effSk = getLocalEffectiveSlotSkill(slot);
    const skIdx = availSkills.indexOf(effSk);
    slot.skillCursorIdx = skIdx >= 0 ? skIdx : 0;
    if (slot.isCom) {
      slot.phase = 'ready';
      slot.cursorStage = 'char';
    } else {
      slot.phase = 'char';
      slot.cursorStage = 'char';
    }
    const owned = playerConfigs.findIndex(pc => pc.padSlot === i);
    localPadTargetSlot[i] = owned >= 0 ? owned : i;
  }
  if (activeLocalTouchActor >= cnt || localSlotsConfig[activeLocalTouchActor].isCom) {
    activeLocalTouchActor = 0;
  }
}

function forceConfirmAllAndStartLocal() {
  clearLocalSliderAdjusting();
  const count = getLocalPlayerCount();
  const availSkills = getLocalAvailableSkills();
  const allowCustom = isLocalCustomSkillRuleOn();
  for (let i = 0; i < count; i++) {
    const sl = localSlotsConfig[i];
    const cid = CHAR_PICKER_ORDER[sl.charCursorIdx] || sl.charId;
    sl.charId = (cid === 'custom' && !CustomAssets.chara) ? 'main00' : cid;
    if (isLocalSkillRuleOn()) {
      const picked = availSkills[sl.skillCursorIdx];
      if (picked) {
        if (allowCustom) sl.skillId = picked;
        else sl.fallbackSkillId = picked;
      }
    }
    sl.phase = 'ready';
  }
  SE.play('select');
  renderLocalMenuUI();
  startLocalGame();
}

function onLocalCountChange() {
  cancelLocalAutoStart();
  clearLocalSliderAdjusting();
  SE.play('select');
  const count = getLocalPlayerCount();
  for (let i = 0; i < count; i++) {
    if (localSlotsConfig[i].isCom) localSlotsConfig[i].phase = 'ready';
  }
  if (activeLocalTouchActor >= count) activeLocalTouchActor = 0;
  for (let p = 0; p < 4; p++) {
    if (localPadTargetSlot[p] >= count) {
      const owned = playerConfigs.findIndex(pc => pc.padSlot === p);
      localPadTargetSlot[p] = (owned >= 0 && owned < count) ? owned : 0;
    }
  }
  renderLocalMenuUI();
}

function onLocalSkillRuleToggle() {
  cancelLocalAutoStart();
  clearLocalSliderAdjusting();
  SE.play('select');
  const skillOn = isLocalSkillRuleOn();
  const count = getLocalPlayerCount();
  for (let i = 0; i < count; i++) {
    const slot = localSlotsConfig[i];
    if (!slot.isCom && !skillOn && slot.phase === 'skill') {
      slot.phase = 'ready';
      slot.cursorStage = 'char';
    }
    if (!slot.isCom && skillOn && slot.phase === 'ready') {
      slot.phase = 'skill';
      slot.cursorStage = 'skill';
    }
  }
  renderLocalMenuUI();
  checkLocalAllReady();
}

function onLocalCustomSkillRuleToggle() {
  cancelLocalAutoStart();
  clearLocalSliderAdjusting();
  SE.play('select');
  const availSkills = getLocalAvailableSkills();
  for (let i = 0; i < 4; i++) {
    const slot = localSlotsConfig[i];
    const effSk = getLocalEffectiveSlotSkill(slot);
    const skIdx = availSkills.indexOf(effSk);
    slot.skillCursorIdx = skIdx >= 0 ? skIdx : 0;
  }
  renderLocalMenuUI();
}

function toggleLocalSlotCom(slotIdx) {
  if (slotIdx === 0) return;
  cancelLocalAutoStart();
  clearLocalSliderAdjusting();
  const slot = localSlotsConfig[slotIdx];
  slot.isCom = !slot.isCom;
  if (slot.isCom) {
    slot.phase = 'ready';
    slot.cursorStage = 'char';
    if (activeLocalTouchActor === slotIdx) {
      activeLocalTouchActor = findNextUnreadyHumanSlot(0);
    }
  } else {
    slot.phase = 'char';
    slot.cursorStage = 'char';
    activeLocalTouchActor = slotIdx;
  }
  SE.play('select');
  renderLocalMenuUI();
  checkLocalAllReady();
}

function findNextUnreadyHumanSlot(fallback = 0) {
  const count = getLocalPlayerCount();
  for (let i = 0; i < count; i++) {
    if (!localSlotsConfig[i].isCom && localSlotsConfig[i].phase !== 'ready') return i;
  }
  return fallback;
}

function selectLocalActorToEdit(slotIdx, ownerKey = 'kb', reopenIfReady = true) {
  const count = getLocalPlayerCount();
  if (slotIdx < 0 || slotIdx >= count) return;
  const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()) : [];
  if (!canOwnerEditLocalSlot(slotIdx, ownerKey, pads)) {
    SE.play('cancel');
    showToast(`${slotIdx + 1}Pは別のコントローラーが操作中です`);
    return;
  }
  cancelLocalAutoStart();
  clearLocalSliderAdjusting();
  const slot = localSlotsConfig[slotIdx];
  if (reopenIfReady && slot.phase === 'ready') {
    slot.phase = 'char';
    slot.cursorStage = 'char';
  }
  setLocalOwnerPadTarget(ownerKey, slotIdx);
  localDomNavOwner = null;
  if (document.activeElement && document.activeElement.closest('#local-menu')) {
    document.activeElement.blur();
  }
  SE.play('select');
  renderLocalMenuUI();
}

function releaseOwnerAfterSlotConfirm(confirmedSlotIdx, ownerKey = null) {
  if (typeof ownerKey === 'number') {
    const owned = playerConfigs.findIndex(pc => pc.padSlot === ownerKey);
    if (owned >= 0 && owned < getLocalPlayerCount() && owned !== confirmedSlotIdx) {
      localPadTargetSlot[ownerKey] = owned;
    }
  }
  if (confirmedSlotIdx === activeLocalTouchActor) {
    activeLocalTouchActor = findNextUnreadyHumanSlot(0);
  }
}

function confirmLocalCharForSlot(slotIdx, tileIdx, ownerKey = null) {
  const slot = localSlotsConfig[slotIdx];
  const cid = CHAR_PICKER_ORDER[tileIdx];
  if (!cid) return;
  if (cid === 'custom' && !CustomAssets.chara) {
    SE.play('cancel');
    showToast('マイ立ち絵が未設定です');
    return;
  }
  cancelLocalAutoStart();
  slot.charCursorIdx = tileIdx;
  slot.charId = cid;

  if (typeof playCharacterConfirmVoice === 'function') {
    playCharacterConfirmVoice(cid);
  }

  if (isLocalSkillRuleOn()) {
    slot.phase = 'skill';
    slot.cursorStage = 'skill';
  } else {
    slot.phase = 'ready';
    releaseOwnerAfterSlotConfirm(slotIdx, ownerKey);
  }
  SE.play('select');
  renderLocalMenuUI();
  checkLocalAllReady();
}

function confirmLocalSkillForSlot(slotIdx, tileIdx, ownerKey = null) {
  if (!isLocalSkillRuleOn()) return;
  const availSkills = getLocalAvailableSkills();
  const allowCustom = isLocalCustomSkillRuleOn();
  const slot = localSlotsConfig[slotIdx];
  const skId = availSkills[tileIdx];
  if (!skId) return;
  cancelLocalAutoStart();
  slot.skillCursorIdx = tileIdx;
  if (allowCustom) {
    slot.skillId = skId;
    if (getCustomSkillSlotIndex(skId) === -1) slot.fallbackSkillId = skId;
  } else {
    slot.fallbackSkillId = skId;
    if (getCustomSkillSlotIndex(slot.skillId) === -1) slot.skillId = skId;
  }
  slot.phase = 'ready';
  SE.play('select');

  releaseOwnerAfterSlotConfirm(slotIdx, ownerKey);
  renderLocalMenuUI();
  checkLocalAllReady();
}

function cancelLocalStepForSlot(slotIdx) {
  cancelLocalAutoStart();
  const slot = localSlotsConfig[slotIdx];
  if (slot.phase === 'ready') {
    if (isLocalSkillRuleOn()) {
      slot.phase = 'skill';
      slot.cursorStage = 'skill';
    } else {
      slot.phase = 'char';
      slot.cursorStage = 'char';
    }
    SE.play('cancel');
  } else if (slot.phase === 'skill') {
    slot.phase = 'char';
    slot.cursorStage = 'char';
    SE.play('cancel');
  }
  renderLocalMenuUI();
}

function getActiveTileDomForSlot(slot) {
  if (!slot) return null;
  if (slot.phase === 'skill' && isLocalSkillRuleOn()) {
    return document.querySelectorAll('#local-skill-tiles .local-select-tile')[slot.skillCursorIdx] || null;
  }
  return document.querySelectorAll('#local-char-tiles .local-select-tile')[slot.charCursorIdx] || null;
}

function enterLocalDomFocusFromTile(slotIdx, dirY, ownerKey) {
  clearLocalSliderAdjusting();
  const slot = localSlotsConfig[slotIdx];
  const tileEl = getActiveTileDomForSlot(slot);
  const scopeFilter = dirY < 0 ? 'top' : 'dock';
  const candidates = getLocalDomFocusables(scopeFilter);
  if (candidates.length === 0) return false;

  const tr = tileEl ? tileEl.getBoundingClientRect() : null;
  const tx = tr ? (tr.left + tr.width / 2) : (window.innerWidth / 2);

  let bestEl = null;
  let bestScore = Infinity;

  if (dirY < 0) {
    const ty = tr ? tr.top : (window.innerHeight * 0.35);
    candidates.forEach(el => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      if (cy >= ty + 4) return;
      const vDist = Math.max(0, ty - r.bottom);
      const score = vDist + Math.abs(cx - tx) * 2.2;
      if (score < bestScore) { bestScore = score; bestEl = el; }
    });
  } else {
    const ty = tr ? tr.bottom : (window.innerHeight * 0.5);
    candidates.forEach(el => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      if (cy <= ty - 4) return;
      const vDist = Math.max(0, r.top - ty);
      const score = vDist * 1.4 + Math.abs(cx - tx) * 2.2;
      if (score < bestScore) { bestScore = score; bestEl = el; }
    });
  }

  if (!bestEl) bestEl = candidates[0];
  localDomNavOwner = ownerKey;
  bestEl.focus({ preventScroll: true });
  if (typeof bestEl.scrollIntoView === 'function') {
    bestEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  SE.play('cursorMove');
  renderLocalMenuUI();
  return true;
}

function tryReturnFromDomToTiles(activeEl, dirY, ownerKey) {
  clearLocalSliderAdjusting();
  const targetSlot = getLocalOwnerPadTarget(ownerKey);
  const slot = localSlotsConfig[targetSlot];
  if (!slot || slot.phase === 'ready') return false;

  const isSkillPhase = (slot.phase === 'skill' && isLocalSkillRuleOn());
  const gridId = isSkillPhase ? 'local-skill-tiles' : 'local-char-tiles';
  const cols = isSkillPhase ? 4 : 5;
  const availSkills = getLocalAvailableSkills();
  const allowCustom = isLocalCustomSkillRuleOn();
  const tileEls = Array.from(document.querySelectorAll(`#${gridId} .local-select-tile`));
  if (tileEls.length === 0) return false;

  const ar = activeEl.getBoundingClientRect();
  const ax = ar.left + ar.width / 2;
  const targetRow = (dirY > 0) ? 0 : Math.floor((tileEls.length - 1) / cols);

  let bestIdx = -1;
  let bestDist = Infinity;
  tileEls.forEach((tile, idx) => {
    const r = Math.floor(idx / cols);
    if (r !== targetRow) return;
    const tr = tile.getBoundingClientRect();
    const tx = tr.left + tr.width / 2;
    const dist = Math.abs(tx - ax);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = idx;
    }
  });

  if (bestIdx === -1) bestIdx = 0;

  if (isSkillPhase) {
    slot.skillCursorIdx = bestIdx;
    const picked = availSkills[bestIdx];
    if (picked) {
      if (allowCustom) slot.skillId = picked;
      else slot.fallbackSkillId = picked;
    }
  } else {
    slot.charCursorIdx = bestIdx;
    const cid = CHAR_PICKER_ORDER[bestIdx];
    if (cid && (cid !== 'custom' || CustomAssets.chara)) slot.charId = cid;
  }

  localDomNavOwner = null;
  if (document.activeElement) document.activeElement.blur();
  SE.play('cursorMove');
  renderLocalMenuUI();
  return true;
}

function handleLocalDomNavigation(input, ownerKey) {
  const activeEl = document.activeElement;
  if (!activeEl || !activeEl.closest('#local-menu') || activeEl.classList.contains('local-select-tile')) {
    clearLocalSliderAdjusting();
    return false;
  }

  if (typeof activeAdjustSliderEl !== 'undefined' && activeAdjustSliderEl && activeAdjustSliderEl !== activeEl) {
    clearLocalSliderAdjusting();
  }

  const allFocusables = getLocalDomFocusables();
  if (allFocusables.length === 0) return false;

  const isSelect = activeEl.tagName === 'SELECT';
  const isRange = activeEl.tagName === 'INPUT' && activeEl.type === 'range';
  const isCheckbox = activeEl.tagName === 'INPUT' && activeEl.type === 'checkbox';
  const inDock = !!activeEl.closest('#local-slots-dock');
  const inTop = !!activeEl.closest('.local-top-bar') || activeEl.id === 'local-back-btn';

  if (input.cancel) {
    if (isRange && typeof activeAdjustSliderEl !== 'undefined' && activeAdjustSliderEl === activeEl) {
      clearLocalSliderAdjusting();
      SE.play('cancel');
      return true;
    }
    const targetSlot = getLocalOwnerPadTarget(ownerKey);
    const slot = localSlotsConfig[targetSlot];
    if (slot && slot.phase !== 'ready') {
      localDomNavOwner = null;
      activeEl.blur();
      SE.play('cancel');
      renderLocalMenuUI();
      return true;
    }
    return !!handleMenuCancelAction();
  }

  if (isSelect) {
    if (input.confirm) {
      SE.play('select');
      openSelectPickerModal(activeEl, activeEl.classList.contains('dim-rule-select') ? '盤面るーるを選択' : '対戦人数を選択');
      return true;
    }
  }

  if (isRange) {
    const step = parseFloat(activeEl.step) || 1;
    const min = parseFloat(activeEl.min) || 1;
    const max = parseFloat(activeEl.max) || 99;

    if (typeof activeAdjustSliderEl !== 'undefined' && activeAdjustSliderEl === activeEl) {
      if (input.left) {
        setRangeValueWithEvents(activeEl, Math.max(min, parseFloat(activeEl.value) - step));
        SE.play('cursorMove');
        return true;
      }
      if (input.right) {
        setRangeValueWithEvents(activeEl, Math.min(max, parseFloat(activeEl.value) + step));
        SE.play('cursorMove');
        return true;
      }
      if (input.confirm) {
        clearLocalSliderAdjusting();
        rangeEditState.el = activeEl;
        rangeEditState.digitIndex = 0;
        updateRangeDigitHUD();
        SE.play('select');
        return true;
      }
      if (input.up) {
        clearLocalSliderAdjusting();
        const dockFocusables = getLocalDomFocusables('dock');
        if (inDock && moveMenuFocus2D(0, -1, dockFocusables)) return true;
        if (inDock && tryReturnFromDomToTiles(activeEl, -1, ownerKey)) return true;
        moveMenuFocus2D(0, -1, allFocusables);
        return true;
      }
      if (input.down) {
        clearLocalSliderAdjusting();
        moveMenuFocus2D(0, 1, allFocusables);
        return true;
      }
      return false;
    } else {
      if (input.confirm) {
        if (typeof setSliderAdjusting === 'function') setSliderAdjusting(activeEl);
        SE.play('select');
        return true;
      }
    }
  }

  if (input.confirm) {
    if (isCheckbox) {
      activeEl.checked = !activeEl.checked;
      activeEl.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    const focusId = activeEl.dataset.localFocusId || '';
    if (focusId.startsWith('actor-')) {
      const idx = parseInt(focusId.slice(6), 10);
      selectLocalActorToEdit(idx, ownerKey, true);
      return true;
    }
    if (focusId.startsWith('slot-edit-')) {
      const idx = parseInt(focusId.slice(10), 10);
      selectLocalActorToEdit(idx, ownerKey, true);
      return true;
    }
    if (typeof activeEl.click === 'function') {
      activeEl.click();
      return true;
    }
  }

  if (input.left) {
    moveMenuFocus2D(-1, 0, allFocusables);
    return true;
  }
  if (input.right) {
    moveMenuFocus2D(1, 0, allFocusables);
    return true;
  }
  if (input.up) {
    if (inDock) {
      const dockFocusables = getLocalDomFocusables('dock');
      if (moveMenuFocus2D(0, -1, dockFocusables)) return true;
      if (tryReturnFromDomToTiles(activeEl, -1, ownerKey)) return true;
    }
    moveMenuFocus2D(0, -1, allFocusables);
    return true;
  }
  if (input.down) {
    if (inTop) {
      const topFocusables = getLocalDomFocusables('top');
      if (moveMenuFocus2D(0, 1, topFocusables)) return true;
      if (tryReturnFromDomToTiles(activeEl, 1, ownerKey)) return true;
    }
    moveMenuFocus2D(0, 1, allFocusables);
    return true;
  }

  return false;
}
function moveLocalTileCursor(slotIdx, dx, dy, ownerKey = 'kb') {
  const slot = localSlotsConfig[slotIdx];
  if (!slot || slot.phase === 'ready') return;

  if (slot.cursorStage === 'char') {
    const cols = 5;
    const total = CHAR_PICKER_ORDER.length;
    let idx = slot.charCursorIdx;
    let r = Math.floor(idx / cols);
    let c = idx % cols;
    const rows = Math.ceil(total / cols);

    if (dy < 0 && r === 0) {
      enterLocalDomFocusFromTile(slotIdx, -1, ownerKey);
      return;
    }
    if (dy > 0 && r === rows - 1) {
      enterLocalDomFocusFromTile(slotIdx, 1, ownerKey);
      return;
    }

    c = (c + dx + cols) % cols;
    r = (r + dy + rows) % rows;
    let nextIdx = r * cols + c;
    if (nextIdx >= total) nextIdx = total - 1;
    if (nextIdx !== slot.charCursorIdx) {
      slot.charCursorIdx = nextIdx;
      const cid = CHAR_PICKER_ORDER[nextIdx];
      if (cid !== 'custom' || CustomAssets.chara) slot.charId = cid;
      SE.play('cursorMove');
      renderLocalMenuUI();
    }
  } else if (slot.cursorStage === 'skill' && isLocalSkillRuleOn()) {
    const availSkills = getLocalAvailableSkills();
    const allowCustom = isLocalCustomSkillRuleOn();
    const cols = 4;
    const total = availSkills.length;
    let idx = slot.skillCursorIdx;
    let r = Math.floor(idx / cols);
    let c = idx % cols;
    const rows = Math.ceil(total / cols);

    if (dy < 0 && r === 0) {
      enterLocalDomFocusFromTile(slotIdx, -1, ownerKey);
      return;
    }
    if (dy > 0 && r === rows - 1) {
      enterLocalDomFocusFromTile(slotIdx, 1, ownerKey);
      return;
    }

    c = (c + dx + cols) % cols;
    r = (r + dy + rows) % rows;
    let nextIdx = r * cols + c;
    if (nextIdx >= total) nextIdx = total - 1;
    if (nextIdx !== slot.skillCursorIdx) {
      slot.skillCursorIdx = nextIdx;
      const picked = availSkills[nextIdx];
      if (picked) {
        if (allowCustom) slot.skillId = picked;
        else slot.fallbackSkillId = picked;
      }
      SE.play('cursorMove');
      renderLocalMenuUI();
    }
  }
}

function checkLocalAllReady() {
  cancelLocalAutoStart();
  const count = getLocalPlayerCount();
  let allReady = true;
  for (let i = 0; i < count; i++) {
    if (localSlotsConfig[i].phase !== 'ready') {
      allReady = false;
      break;
    }
  }
  if (allReady) {
    showToast('全員OK！対戦を開始します！');
    localAutoStartTimer = setTimeout(() => {
      localAutoStartTimer = null;
      if (document.getElementById('local-menu')?.style.display === 'flex') {
        startLocalGame();
      }
    }, 650);
  }
}

function pollLocalMenuGamepads(pads) {
  const now = performance.now();
  const isLocked = (typeof padInputLockUntil !== 'undefined' && now < padInputLockUntil);
  const LOCAL_DAS_MS = (typeof GLOBAL_PAD_DAS_MS !== 'undefined') ? GLOBAL_PAD_DAS_MS : 270;
  const LOCAL_ARR_MS = (typeof GLOBAL_PAD_ARR_MS !== 'undefined') ? GLOBAL_PAD_ARR_MS : 75;
  const LOCAL_BOUNCE_MS = (typeof GLOBAL_PAD_BOUNCE_MS !== 'undefined') ? GLOBAL_PAD_BOUNCE_MS : 100;
  const LOCAL_RELEASE_MS = (typeof GLOBAL_PAD_RELEASE_MS !== 'undefined') ? GLOBAL_PAD_RELEASE_MS : 30;
  const LOCAL_DIR_MIN_INTERVAL_MS = (typeof GLOBAL_PAD_DIR_MIN_INTERVAL_MS !== 'undefined') ? GLOBAL_PAD_DIR_MIN_INTERVAL_MS : 95;

  for (let padIdx = 0; padIdx < 4; padIdx++) {
    const padObj = pads[padIdx];
    if (!padObj || !padObj.connected) {
      resetLocalMenuPadDir(padIdx);
      localMenuPadPrev[padIdx] = {};
      localMenuPadWaitRelease[padIdx] = {};
      continue;
    }

    const prev = localMenuPadPrev[padIdx] || {};
    const waitRel = localMenuPadWaitRelease[padIdx] || (localMenuPadWaitRelease[padIdx] = {});
    const pressAt = localMenuPadLastPressAt[padIdx] || (localMenuPadLastPressAt[padIdx] = {});
    const dirSt = localMenuPadDirState[padIdx] || (localMenuPadDirState[padIdx] = {
      Up:    { held: false, startAt: 0, lastAt: 0, releaseAt: 0 },
      Down:  { held: false, startAt: 0, lastAt: 0, releaseAt: 0 },
      Left:  { held: false, startAt: 0, lastAt: 0, releaseAt: 0 },
      Right: { held: false, startAt: 0, lastAt: 0, releaseAt: 0 }
    });

    const cur = {};
    padObj.buttons.forEach((b, i) => { cur[i] = !!b.pressed; });
    Object.keys(waitRel).forEach(k => {
      if (!cur[k]) delete waitRel[k];
    });

    const ownerSlot = playerConfigs.findIndex(pc => pc.padSlot === padIdx);
    if (ownerSlot === -1 || isLocked) {
      localMenuPadPrev[padIdx] = cur;
      if (isLocked) resetLocalMenuPadDir(padIdx);
      continue;
    }

    const cfg = playerConfigs[ownerSlot].pad;
    const just = (btnIdx) => {
      if (btnIdx === null || btnIdx === undefined) return false;
      if (!cur[btnIdx] || prev[btnIdx] || waitRel[btnIdx]) return false;
      if (now - (pressAt[btnIdx] || 0) < LOCAL_BOUNCE_MS) return false;
      pressAt[btnIdx] = now;
      return true;
    };

    const isRep = (dir, btnIdx) => {
      const st = dirSt[dir];
      if (btnIdx === null || btnIdx === undefined || !cur[btnIdx]) {
        if (st.held) {
          if (!st.releaseAt) st.releaseAt = now;
          if ((now - st.releaseAt) >= LOCAL_RELEASE_MS) {
            st.held = false;
            st.releaseAt = 0;
          }
        }
        return false;
      }
      st.releaseAt = 0;
      if (waitRel[btnIdx]) {
        st.held = true;
        st.startAt = now;
        st.lastAt = now;
        return false;
      }
      if (!st.held) {
        st.held = true;
        st.startAt = now;
        st.lastAt = now;
        if (now - (pressAt[`dir_${dir}`] || 0) < LOCAL_DIR_MIN_INTERVAL_MS) return false;
        pressAt[`dir_${dir}`] = now;
        return true;
      }
      if ((now - st.startAt) >= LOCAL_DAS_MS && (now - st.lastAt) >= LOCAL_ARR_MS) {
        st.lastAt = now;
        return true;
      }
      return false;
    };

    if (ownerSlot === 0 && just(cfg.Pause)) {
      localMenuPadPrev[padIdx] = cur;
      if (typeof syncPadSnapshotsAll === 'function') syncPadSnapshotsAll(200);
      forceConfirmAllAndStartLocal();
      return;
    }

    const upTrig = isRep('Up', cfg.Up);
    const downTrig = isRep('Down', cfg.Down);
    const leftTrig = isRep('Left', cfg.Left);
    const rightTrig = isRep('Right', cfg.Right);

    let confirmTrig = just(cfg.Swap);
    if (!confirmTrig) confirmTrig = just(cfg.GrabRight);
    let cancelTrig = just(cfg.Skill);
    if (!cancelTrig) cancelTrig = just(cfg.GrabLeft);

    if (cancelTrig) confirmTrig = false;

    if (upTrig || downTrig || leftTrig || rightTrig || confirmTrig || cancelTrig) {
      const domActive = document.activeElement && document.activeElement.closest('#local-menu') && !document.activeElement.classList.contains('local-select-tile');
      if (domActive && (localDomNavOwner === padIdx || localDomNavOwner === null)) {
        localDomNavOwner = padIdx;
        const did = handleLocalDomNavigation({
          up: upTrig && !downTrig,
          down: downTrig && !upTrig,
          left: leftTrig && !rightTrig,
          right: rightTrig && !leftTrig,
          confirm: confirmTrig,
          cancel: cancelTrig
        }, padIdx);
        if (did && (confirmTrig || cancelTrig)) {
          if (confirmTrig) {
            if (cfg.Swap !== null && cfg.Swap !== undefined) waitRel[cfg.Swap] = true;
            if (cfg.GrabRight !== null && cfg.GrabRight !== undefined) waitRel[cfg.GrabRight] = true;
          }
          if (cancelTrig) {
            if (cfg.Skill !== null && cfg.Skill !== undefined) waitRel[cfg.Skill] = true;
            if (cfg.GrabLeft !== null && cfg.GrabLeft !== undefined) waitRel[cfg.GrabLeft] = true;
          }
        }
        localMenuPadPrev[padIdx] = cur;
        continue;
      }

      const targetSlot = getLocalOwnerPadTarget(padIdx);
      const slot = localSlotsConfig[targetSlot];
      if (!slot) {
        localMenuPadPrev[padIdx] = cur;
        continue;
      }

      if (slot.phase === 'ready') {
        if (cancelTrig) {
          cancelLocalStepForSlot(targetSlot);
          if (cfg.Skill !== null && cfg.Skill !== undefined) waitRel[cfg.Skill] = true;
          if (cfg.GrabLeft !== null && cfg.GrabLeft !== undefined) waitRel[cfg.GrabLeft] = true;
        } else if (upTrig || downTrig || leftTrig || rightTrig) {
          const fallbackBtn = document.querySelector(`[data-local-focus-id="slot-edit-${targetSlot}"]`) || getLocalDomFocusables()[0];
          if (fallbackBtn) {
            localDomNavOwner = padIdx;
            fallbackBtn.focus({ preventScroll: true });
            SE.play('cursorMove');
          }
        }
        localMenuPadPrev[padIdx] = cur;
        continue;
      }

      if (cancelTrig) {
        if (cfg.Skill !== null && cfg.Skill !== undefined) waitRel[cfg.Skill] = true;
        if (cfg.GrabLeft !== null && cfg.GrabLeft !== undefined) waitRel[cfg.GrabLeft] = true;
        if (slot.phase === 'char' && targetSlot === 0 && ownerSlot === 0) {
          backToMultiHubMenu(true);
        } else if (slot.phase === 'char' && targetSlot !== ownerSlot) {
          setLocalOwnerPadTarget(padIdx, ownerSlot);
          SE.play('cancel');
          renderLocalMenuUI();
        } else {
          cancelLocalStepForSlot(targetSlot);
        }
      } else if (confirmTrig) {
        if (cfg.Swap !== null && cfg.Swap !== undefined) waitRel[cfg.Swap] = true;
        if (cfg.GrabRight !== null && cfg.GrabRight !== undefined) waitRel[cfg.GrabRight] = true;
        if (slot.phase === 'char') confirmLocalCharForSlot(targetSlot, slot.charCursorIdx, padIdx);
        else if (slot.phase === 'skill') confirmLocalSkillForSlot(targetSlot, slot.skillCursorIdx, padIdx);
      } else {
        if (leftTrig && !rightTrig) moveLocalTileCursor(targetSlot, -1, 0, padIdx);
        else if (rightTrig && !leftTrig) moveLocalTileCursor(targetSlot, 1, 0, padIdx);
        else if (upTrig && !downTrig) moveLocalTileCursor(targetSlot, 0, -1, padIdx);
        else if (downTrig && !upTrig) moveLocalTileCursor(targetSlot, 0, 1, padIdx);
      }
    }

    localMenuPadPrev[padIdx] = cur;
  }
}

function renderLocalMenuUI() {
  const count = getLocalPlayerCount();
  const skillOn = isLocalSkillRuleOn();
  const allowCustom = isLocalCustomSkillRuleOn();
  const actorBar = document.getElementById('local-touch-actor-bar');
  const charGrid = document.getElementById('local-char-tiles');
  const skillGrid = document.getElementById('local-skill-tiles');
  const skillSection = document.getElementById('local-skill-section');
  const dockEl = document.getElementById('local-slots-dock');
  if (!charGrid || !skillGrid || !dockEl) return;

  const activeBefore = document.activeElement;
  const prevFocusKey = activeBefore && activeBefore.closest('#local-menu')
    ? (activeBefore.dataset?.localFocusId || activeBefore.id || null)
    : null;
  const prevAdjustKey = (typeof activeAdjustSliderEl !== 'undefined' && activeAdjustSliderEl?.dataset?.localFocusId)
    ? activeAdjustSliderEl.dataset.localFocusId
    : null;

  clearLocalSliderAdjusting();
  if (activeLocalTouchActor >= count) activeLocalTouchActor = 0;

  if (actorBar) {
    actorBar.innerHTML = '';
    const colors = ['#10b981', '#f43f5e', '#fbbf24', '#a855f7'];
    for (let i = 0; i < count; i++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.localFocusId = `actor-${i}`;
      btn.className = 'local-actor-btn' + (activeLocalTouchActor === i ? ' active' : '');
      if (activeLocalTouchActor === i) {
        btn.style.background = colors[i];
        btn.style.borderColor = '#fff';
        if (i === 2) btn.style.color = '#070b14';
      }
      btn.innerText = `${i + 1}P`;
      btn.onclick = () => selectLocalActorToEdit(i, 'kb', true);
      actorBar.appendChild(btn);
    }
  }

  charGrid.innerHTML = '';
  CHAR_PICKER_ORDER.forEach((cid, tIdx) => {
    const ch = getCharacterById(cid);
    const isCustomEmpty = (cid === 'custom' && !CustomAssets.chara);
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.tabIndex = -1;
    tile.className = 'local-select-tile' + (isCustomEmpty ? ' disabled-tile' : '');

    const imgWrap = document.createElement('div');
    imgWrap.className = 'local-tile-img-wrap';
    if (cid === 'random') {
      imgWrap.innerHTML = '<span class="char-icon-random" style="font-size:1.1rem;">？</span>';
    } else {
      const img = document.createElement('img');
      img.alt = ch.name;
      if (cid === 'custom' && CustomAssets.chara) img.src = CustomAssets.chara.dataUrl;
      else applyCharacterImageToElement(img, cid === 'custom' ? 'main00' : cid, 'normal');
      imgWrap.appendChild(img);
    }

    const lbl = document.createElement('div');
    lbl.className = 'local-tile-label';
    lbl.innerText = isCustomEmpty ? 'マイ(無)' : ch.name;

    const badges = document.createElement('div');
    badges.className = 'local-cursor-badges';
    for (let i = 0; i < count; i++) {
      const sl = localSlotsConfig[i];
      if (sl.phase === 'char' && sl.charCursorIdx === tIdx) {
        tile.classList.add(`has-cursor-${i}`);
        const chip = document.createElement('span');
        chip.className = `local-cursor-chip p${i}`;
        chip.innerText = `${i + 1}P`;
        badges.appendChild(chip);
      }
    }

    tile.append(badges, imgWrap, lbl);
    tile.onclick = () => {
      localDomNavOwner = null;
      const targetSlot = activeLocalTouchActor;
      if (localSlotsConfig[targetSlot].phase === 'ready') cancelLocalAutoStart();
      confirmLocalCharForSlot(targetSlot, tIdx, 'kb');
    };
    charGrid.appendChild(tile);
  });

  if (skillSection) skillSection.classList.toggle('disabled-section', !skillOn);
  const skillTitleEl = skillSection ? skillSection.querySelector('.local-section-title') : null;
  if (skillTitleEl) {
    skillTitleEl.innerText = allowCustom ? '② スキル選択' : '② 自作OFF時スキル選択';
  }
  skillGrid.innerHTML = '';
  const availSkills = getLocalAvailableSkills();
  availSkills.forEach((skId, tIdx) => {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.tabIndex = -1;
    tile.className = 'local-select-tile';
    tile.disabled = !skillOn;

    const icon = document.createElement('div');
    icon.className = 'local-tile-skill-icon';
    icon.innerText = (typeof getSkillIcon === 'function') ? getSkillIcon(skId) : (SKILL_ICONS[skId] || '⚡');

    const lbl = document.createElement('div');
    lbl.className = 'local-tile-label';
    lbl.innerText = (typeof getSkillLabel === 'function') ? getSkillLabel(skId) : (SKILL_LABELS[skId] || skId);

    const badges = document.createElement('div');
    badges.className = 'local-cursor-badges';
    if (skillOn) {
      for (let i = 0; i < count; i++) {
        const sl = localSlotsConfig[i];
        if (sl.phase === 'skill' && sl.skillCursorIdx === tIdx) {
          tile.classList.add(`has-cursor-${i}`);
          const chip = document.createElement('span');
          chip.className = `local-cursor-chip p${i}`;
          chip.innerText = `${i + 1}P`;
          badges.appendChild(chip);
        }
      }
    }

    tile.append(badges, icon, lbl);
    tile.onclick = () => {
      if (!skillOn) return;
      localDomNavOwner = null;
      const targetSlot = activeLocalTouchActor;
      confirmLocalSkillForSlot(targetSlot, tIdx, 'kb');
    };
    skillGrid.appendChild(tile);
  });

  dockEl.innerHTML = '';
  for (let i = 0; i < 4; i++) {
    const slotEl = document.createElement('div');
    if (i >= count) {
      slotEl.className = `local-dock-slot p${i} is-empty`;
      slotEl.innerHTML = `<div style="font-size:0.85rem;font-weight:900;color:#64748b;">${i + 1}P<br>未使用</div>`;
      dockEl.appendChild(slotEl);
      continue;
    }

    const slot = localSlotsConfig[i];
    const displayCharId = (slot.phase === 'char')
      ? (CHAR_PICKER_ORDER[slot.charCursorIdx] || slot.charId)
      : slot.charId;
    const ch = getCharacterById(displayCharId);
    const displaySkillId = (slot.phase === 'skill')
      ? (availSkills[slot.skillCursorIdx] || getLocalEffectiveSlotSkill(slot))
      : getLocalEffectiveSlotSkill(slot);

    const slotIs3D = selectedDimRule === '3d' ? true : (selectedDimRule === '2d' ? false : !!slot.is3D);

    slotEl.className = `local-dock-slot p${i}` + (activeLocalTouchActor === i ? ' is-active-touch' : '');

    const topRow = document.createElement('div');
    topRow.className = 'local-slot-top';
    const tag = document.createElement('span');
    tag.className = 'local-slot-tag';
    tag.innerText = `${i + 1}P` + (slot.isCom ? ' (COM)' : '');
    topRow.appendChild(tag);

    if (i > 0) {
      const toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.dataset.localFocusId = `slot-type-${i}`;
      toggleBtn.className = 'local-slot-type-btn';
      toggleBtn.innerText = slot.isCom ? 'COM⇄人' : '人⇄COM';
      toggleBtn.onclick = (ev) => { ev.stopPropagation(); toggleLocalSlotCom(i); };
      topRow.appendChild(toggleBtn);
    }
    slotEl.appendChild(topRow);

    const winBadgesRow = document.createElement('div');
    winBadgesRow.className = 'local-slot-win-badges';
    const slotStats = BattleStatsManager.getStats('local', `p${i}`);
    winBadgesRow.innerHTML = BattleStatsManager.buildMenuBadgeChipsHtml(slotStats, true);
    slotEl.appendChild(winBadgesRow);

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.dataset.localFocusId = `slot-edit-${i}`;
    editBtn.className = 'local-slot-edit-btn';
    editBtn.onclick = () => selectLocalActorToEdit(i, 'kb', true);

    const portrait = document.createElement('div');
    portrait.className = 'local-slot-portrait';
    if (displayCharId === 'random') {
      portrait.innerHTML = '<span class="char-icon-random">？</span>';
    } else {
      const img = document.createElement('img');
      img.alt = ch.name;
      if (displayCharId === 'custom' && CustomAssets.chara) img.src = CustomAssets.chara.dataUrl;
      else applyCharacterImageToElement(img, displayCharId === 'custom' ? 'main00' : displayCharId, 'normal');
      portrait.appendChild(img);
    }
    const charNameEl = document.createElement('div');
    charNameEl.className = 'local-slot-char-name';
    charNameEl.innerText = ch.name;

    const skBox = document.createElement('div');
    skBox.className = 'local-slot-skill-box';
    if (skillOn) {
      const skIcon = (typeof getSkillIcon === 'function') ? getSkillIcon(displaySkillId) : '⚡';
      const skLabel = (typeof getSkillLabel === 'function') ? getSkillLabel(displaySkillId) : displaySkillId;
      const skDesc = (typeof getSkillDesc === 'function') ? getSkillDesc(displaySkillId) : '';
      const prefix = (!allowCustom && getCustomSkillSlotIndex(slot.skillId) !== -1) ? '🛡️ ' : '';
      skBox.innerHTML = `
        <div class="local-slot-skill-name">${prefix}${skIcon} ${skLabel}</div>
        <div class="local-slot-skill-desc">${skDesc}</div>
      `;
    } else {
      skBox.innerHTML = `
        <div class="local-slot-skill-name" style="color:#94a3b8;">スキル: OFF</div>
        <div class="local-slot-skill-desc">スキルなしの純粋パズル対戦</div>
      `;
    }

    editBtn.append(portrait, charNameEl, skBox);

    if (slot.phase !== 'ready') {
      const hint = document.createElement('div');
      hint.className = 'local-slot-phase-hint';
      hint.innerText = slot.phase === 'char' ? 'キャラ選択中…' : 'スキル選択中…';
      editBtn.appendChild(hint);
    } else {
      const okRibbon = document.createElement('div');
      okRibbon.className = 'local-slot-ok-ribbon';
      okRibbon.innerText = 'OK!';
      editBtn.appendChild(okRibbon);
    }
    slotEl.appendChild(editBtn);

    const dimBtn = document.createElement('button');
    dimBtn.type = 'button';
    dimBtn.dataset.localFocusId = `slot-dim-${i}`;
    dimBtn.className = 'local-slot-dim-btn' + (slotIs3D ? ' is-3d' : '');
    dimBtn.innerText = slotIs3D ? '盤面: 3D円筒' : '盤面: 2D';
    dimBtn.onclick = (ev) => { ev.stopPropagation(); toggleLocalSlot3D(i); };
    slotEl.appendChild(dimBtn);

    const hdRow = document.createElement('div');
    hdRow.className = 'local-slot-slider-row';
    const hdHead = document.createElement('div');
    hdHead.className = 'local-slot-slider-head';
    hdHead.innerHTML = `<span>ハンデ</span><span id="local-slot-hd-val-${i}" class="local-slot-slider-val">${slot.handicap}</span>`;
    const hdInput = document.createElement('input');
    hdInput.type = 'range';
    hdInput.min = '1';
    hdInput.max = '5';
    hdInput.step = '1';
    hdInput.value = String(slot.handicap || 3);
    hdInput.className = 'local-slot-range';
    hdInput.dataset.localFocusId = `slot-hd-${i}`;
    hdInput.oninput = (ev) => {
      const v = Math.max(1, Math.min(5, parseInt(ev.target.value, 10) || 3));
      slot.handicap = v;
      const lbl = document.getElementById(`local-slot-hd-val-${i}`);
      if (lbl) lbl.innerText = String(v);
    };
    if (typeof enhanceRangeSlider === 'function') enhanceRangeSlider(hdInput);
    hdRow.append(hdHead, hdInput);
    slotEl.appendChild(hdRow);

    if (slot.isCom) {
      const lvRow = document.createElement('div');
      lvRow.className = 'local-slot-slider-row';
      const lvHead = document.createElement('div');
      lvHead.className = 'local-slot-slider-head';
      lvHead.innerHTML = `<span>CPU強さ</span><span id="local-slot-lv-val-${i}" class="local-slot-slider-val com-lv">Lv.${slot.comLevel}</span>`;
      const lvInput = document.createElement('input');
      lvInput.type = 'range';
      lvInput.min = '1';
      lvInput.max = '99';
      lvInput.step = '1';
      lvInput.value = String(slot.comLevel || 3);
      lvInput.className = 'local-slot-range com-lv-range';
      lvInput.dataset.localFocusId = `slot-lv-${i}`;
      lvInput.oninput = (ev) => {
        const v = Math.max(1, Math.min(99, parseInt(ev.target.value, 10) || 3));
        slot.comLevel = v;
        const lbl = document.getElementById(`local-slot-lv-val-${i}`);
        if (lbl) lbl.innerText = `Lv.${v}`;
      };
      if (typeof enhanceRangeSlider === 'function') enhanceRangeSlider(lvInput);
      lvRow.append(lvHead, lvInput);
      slotEl.appendChild(lvRow);
    }

    dockEl.appendChild(slotEl);
  }

  if (prevFocusKey) {
    let restoreEl = document.querySelector(`#local-menu [data-local-focus-id="${prevFocusKey}"]`) || document.getElementById(prevFocusKey);
    if (!restoreEl && prevFocusKey.startsWith('slot-lv-')) {
      const idx = prevFocusKey.slice(8);
      restoreEl = document.querySelector(`#local-menu [data-local-focus-id="slot-edit-${idx}"]`);
    }
    if (restoreEl && !restoreEl.disabled) {
      restoreEl.focus({ preventScroll: true });
      if (prevAdjustKey && prevAdjustKey === prevFocusKey && restoreEl.type === 'range' && typeof setSliderAdjusting === 'function') {
        setSliderAdjusting(restoreEl);
      }
    }
  }
}

function startLocalGame() {
  cancelLocalAutoStart();
  clearLocalSliderAdjusting();
  const count = getLocalPlayerCount();
  const skillEnabled = isLocalSkillRuleOn();
  const customSkillEnabled = isLocalCustomSkillRuleOn();
  startGame('local', 3, count, skillEnabled, customSkillEnabled);
}


// ==========================================
// シェア対戦（複数回タップ誤爆防止・2D/3D/こんごう対応） & メニューナビゲーション & 勝利統計記録
// ==========================================
let sharePrepConfig = {
  p1: { charId: 'main00', handicap: 3, is3D: false, skillEnabled: false, customSkillEnabled: true, skillId: 'erase_color', fallbackSkillId: 'erase_color', ready: false },
  p2: { charId: 'sub01',  handicap: 3, is3D: false, skillId: 'erase_rows', fallbackSkillId: 'erase_rows', ready: false }
};
let shareStartTimer = null;
const recentPointerTapRecords = [];
let shareGhostClickGuardBound = false;

function recordPointerTapPoint(x, y, now) {
  recentPointerTapRecords.push({ t: now, x: x || 0, y: y || 0 });
  while (recentPointerTapRecords.length > 0 && (now - recentPointerTapRecords[0].t) > 1000) {
    recentPointerTapRecords.shift();
  }
}

function isGhostClickNearRecentPointerDown(x, y, now, maxAgeMs = 850, maxDistPx = 100) {
  for (let i = recentPointerTapRecords.length - 1; i >= 0; i--) {
    const rec = recentPointerTapRecords[i];
    if (now - rec.t <= maxAgeMs) {
      const dist = Math.hypot((x || 0) - rec.x, (y || 0) - rec.y);
      if (dist <= maxDistPx) return true;
    }
  }
  return false;
}

function ensureShareGhostClickGuard() {
  if (shareGhostClickGuardBound) return;
  shareGhostClickGuardBound = true;
  const prepOverlay = document.getElementById('share-prep-overlay');
  if (prepOverlay) {
    prepOverlay.addEventListener('click', (e) => {
      if (e.detail === 0) return;
      const now = performance.now();
      if (isGhostClickNearRecentPointerDown(e.clientX, e.clientY, now, 900, 110)) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);
  }
}

function isSharePortraitForced() {
  const prepOpen = document.getElementById('share-prep-overlay')?.style.display === 'flex';
  const gameOpen = document.getElementById('game-area')?.style.display !== 'none' && currentMode === 'share';
  return (prepOpen || gameOpen) && (window.innerWidth > window.innerHeight);
}

function updateShareForcePortraitClass() {
  document.body.classList.toggle('share-force-portrait', isSharePortraitForced());
}

function getShareCharCandidateIds() {
  return [...CHARACTERS.map(c => c.id), 'custom', 'random'];
}

function bindMultiTouchTap(el, handler) {
  if (!el) return;
  el._multiTapHandler = handler;
  if (el.dataset.multiTapBound === '1') return;
  el.dataset.multiTapBound = '1';

  el.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    if (e.cancelable) e.preventDefault();
    const now = performance.now();
    if (now - (el._lastPointerDownAt || 0) < 160) return;
    el._lastPointerDownAt = now;
    recordPointerTapPoint(e.clientX, e.clientY, now);
    if (typeof el._multiTapHandler === 'function') {
      el._multiTapHandler(e);
    }
  });

  el.addEventListener('click', (e) => {
    const now = performance.now();
    if (e.detail !== 0) {
      if (now - (el._lastPointerDownAt || 0) < 900) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (isGhostClickNearRecentPointerDown(e.clientX, e.clientY, now, 900, 110)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    } else if (now - (el._lastPointerDownAt || 0) < 400) {
      e.preventDefault();
      return;
    }
    if (e.cancelable) e.preventDefault();
    if (typeof el._multiTapHandler === 'function') {
      el._multiTapHandler(e);
    }
  });
}

function openSharePrepMenu(silent = false) {
  cancelLocalAutoStart();
  clearLocalSliderAdjusting();
  ensureShareGhostClickGuard();
  if (!silent) SE.play('select');
  if (typeof closeRangeDigitEdit === 'function') closeRangeDigitEdit();
  sharePrepConfig.p1.ready = false;
  sharePrepConfig.p2.ready = false;
  if (selectedDimRule === '2d') {
    sharePrepConfig.p1.is3D = false;
    sharePrepConfig.p2.is3D = false;
  } else if (selectedDimRule === '3d') {
    sharePrepConfig.p1.is3D = true;
    sharePrepConfig.p2.is3D = true;
  }
  if (sharePrepConfig.p1.charId === 'custom' && !CustomAssets.chara) sharePrepConfig.p1.charId = 'main00';
  if (sharePrepConfig.p2.charId === 'custom' && !CustomAssets.chara) sharePrepConfig.p2.charId = 'sub01';
  if (shareStartTimer) { clearTimeout(shareStartTimer); shareStartTimer = null; }
  const overlay = document.getElementById('share-prep-overlay');
  if (overlay) overlay.style.display = 'flex';
  updateShareForcePortraitClass();
  updateVerticalBottomNav();
  renderSharePrepUI();
}

function closeSharePrepMenu(silent = false) {
  if (shareStartTimer) { clearTimeout(shareStartTimer); shareStartTimer = null; }
  const overlay = document.getElementById('share-prep-overlay');
  const wasOpen = overlay && overlay.style.display === 'flex';
  if (overlay) overlay.style.display = 'none';
  document.body.classList.remove('share-force-portrait');
  if (wasOpen && !silent) SE.play('cancel');
  updateVerticalBottomNav();
}

function renderSharePrepUI() {
  renderSharePrepSide(1);
  renderSharePrepSide(2);
  const statusEl = document.getElementById('share-prep-status-text');
  if (statusEl) {
    if (sharePrepConfig.p1.ready && sharePrepConfig.p2.ready) statusEl.innerText = '開始します！';
    else if (sharePrepConfig.p1.ready) statusEl.innerText = '1P OK / 2P待ち';
    else if (sharePrepConfig.p2.ready) statusEl.innerText = '2P OK / 1P待ち';
    else statusEl.innerText = '両者OKで開始';
  }
}

function checkSharePrepBothReady() {
  if (shareStartTimer) { clearTimeout(shareStartTimer); shareStartTimer = null; }
  if (sharePrepConfig.p1.ready && sharePrepConfig.p2.ready) {
    shareStartTimer = setTimeout(() => {
      shareStartTimer = null;
      if (sharePrepConfig.p1.ready && sharePrepConfig.p2.ready) startShareGame();
    }, 180);
  }
}

function renderSharePrepSide(playerNum) {
  const isP1 = (playerNum === 1);
  const container = document.getElementById(isP1 ? 'share-prep-p1' : 'share-prep-p2');
  if (!container) return;
  const cfg = isP1 ? sharePrepConfig.p1 : sharePrepConfig.p2;
  const skillEnabled = sharePrepConfig.p1.skillEnabled;
  const allowCustom = sharePrepConfig.p1.customSkillEnabled !== false;
  container.innerHTML = '';

  const hdr = document.createElement('div');
  hdr.className = 'share-prep-header';
  const curCh = getCharacterById(cfg.charId);
  const shareStats = BattleStatsManager.getStats('share', isP1 ? 'p0' : 'p1');
  const badgesHtml = BattleStatsManager.buildMenuBadgeChipsHtml(shareStats, true);
  hdr.innerHTML = `<span style="color:${isP1 ? '#00e676' : '#ff4081'};">${isP1 ? '1P (下側)' : '2P (上側)'}</span><span class="share-prep-win-badges">${badgesHtml}</span><span>キャラ: ${curCh.name}</span>`;

  const grid = document.createElement('div');
  grid.className = 'share-prep-char-grid';
  getShareCharCandidateIds().forEach(cid => {
    const ch = getCharacterById(cid);
    const isCustomEmpty = (cid === 'custom' && !CustomAssets.chara);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'share-prep-char-btn' + (cfg.charId === cid ? ' selected' : '') + (isCustomEmpty ? ' empty-custom' : '');
    const thumb = document.createElement('div');
    thumb.className = 'share-prep-char-thumb';
    if (cid === 'random') {
      thumb.innerHTML = `<span class="char-icon-random" style="font-size:1.1rem;">？</span>`;
    } else {
      const img = document.createElement('img');
      img.alt = ch.name;
      if (cid === 'custom' && CustomAssets.chara) {
        img.src = CustomAssets.chara.dataUrl;
      } else if (typeof applyCharacterImageToElement === 'function') {
        applyCharacterImageToElement(img, cid === 'custom' ? 'main00' : cid, 'normal');
      } else {
        img.src = ch.file;
      }
      thumb.appendChild(img);
    }
    const nm = document.createElement('div');
    nm.className = 'share-prep-char-name';
    nm.innerText = isCustomEmpty ? 'マイ(無)' : ch.name;
    btn.append(thumb, nm);
    bindMultiTouchTap(btn, () => {
      if (isCustomEmpty) { SE.play('cancel'); showToast('設定からマイ立ち絵を登録すると選べます'); return; }
      cfg.charId = cid; cfg.ready = false;
      SE.play('select');
      if (typeof playCharacterConfirmVoice === 'function') {
        playCharacterConfirmVoice(cid);
      }
      renderSharePrepUI();
    });
    grid.appendChild(btn);
  });

  const hdRow = document.createElement('div');
  hdRow.className = 'share-prep-row';
  const hdLbl = document.createElement('span');
  hdLbl.className = 'share-prep-lbl';
  hdLbl.innerText = '難易度:';
  hdRow.appendChild(hdLbl);
  [{ v: 1, t: '1:激ムズ' }, { v: 2, t: '2:難' }, { v: 3, t: '3:普通' }, { v: 4, t: '4:甘' }, { v: 5, t: '5:易' }].forEach(item => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'share-pill-btn' + (cfg.handicap === item.v ? ' active' : '');
    b.innerText = item.t;
    bindMultiTouchTap(b, () => {
      cfg.handicap = item.v; cfg.ready = false;
      SE.play('select');
      renderSharePrepUI();
    });
    hdRow.appendChild(b);
  });

  const dimRow = document.createElement('div');
  dimRow.className = 'share-prep-row';
  if (isP1) {
    const dimLbl = document.createElement('span');
    dimLbl.className = 'share-prep-lbl';
    dimLbl.innerText = '形式:';
    dimRow.appendChild(dimLbl);
    [{ r: '2d', t: '2D' }, { r: '3d', t: '3D' }, { r: 'mixed', t: 'こんごう' }].forEach(item => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'share-pill-btn' + (selectedDimRule === item.r ? ' active' : '');
      b.innerText = item.t;
      bindMultiTouchTap(b, () => {
        sharePrepConfig.p1.ready = false;
        sharePrepConfig.p2.ready = false;
        selectDimRule(item.r);
      });
      dimRow.appendChild(b);
    });
  }
  const myIs3D = selectedDimRule === '3d' ? true : (selectedDimRule === '2d' ? false : !!cfg.is3D);
  const selfDimBtn = document.createElement('button');
  selfDimBtn.type = 'button';
  selfDimBtn.className = 'share-pill-btn' + (myIs3D ? ' active' : '');
  selfDimBtn.innerText = myIs3D ? '自盤面: 3D円筒' : '自盤面: 2D';
  bindMultiTouchTap(selfDimBtn, () => {
    if (selectedDimRule === '2d') {
      selectedDimRule = 'mixed';
      sharePrepConfig.p1.is3D = false;
      sharePrepConfig.p2.is3D = false;
      cfg.is3D = true;
    } else if (selectedDimRule === '3d') {
      selectedDimRule = 'mixed';
      sharePrepConfig.p1.is3D = true;
      sharePrepConfig.p2.is3D = true;
      cfg.is3D = false;
    } else {
      cfg.is3D = !cfg.is3D;
    }
    localStorage.setItem('pdw_dim_rule', selectedDimRule);
    cfg.ready = false;
    SE.play('select');
    syncDimRuleUI();
  });
  dimRow.appendChild(selfDimBtn);

  const skRow = document.createElement('div');
  skRow.className = 'share-prep-row';
  if (isP1) {
    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'share-pill-btn' + (skillEnabled ? ' active' : '');
    toggleBtn.innerText = `スキル:${skillEnabled ? 'ON' : 'OFF'}`;
    bindMultiTouchTap(toggleBtn, () => {
      sharePrepConfig.p1.skillEnabled = !sharePrepConfig.p1.skillEnabled;
      sharePrepConfig.p1.ready = false; sharePrepConfig.p2.ready = false;
      SE.play('select');
      renderSharePrepUI();
    });
    skRow.appendChild(toggleBtn);

    const customToggleBtn = document.createElement('button');
    customToggleBtn.type = 'button';
    customToggleBtn.className = 'share-pill-btn' + (allowCustom ? ' active' : '');
    customToggleBtn.disabled = !skillEnabled;
    customToggleBtn.innerText = `自作:${allowCustom ? 'ON' : 'OFF'}`;
    bindMultiTouchTap(customToggleBtn, () => {
      if (!sharePrepConfig.p1.skillEnabled) return;
      sharePrepConfig.p1.customSkillEnabled = !sharePrepConfig.p1.customSkillEnabled;
      sharePrepConfig.p1.ready = false; sharePrepConfig.p2.ready = false;
      SE.play('select');
      renderSharePrepUI();
    });
    skRow.appendChild(customToggleBtn);
  } else {
    const ruleBadge = document.createElement('span');
    ruleBadge.className = 'share-prep-lbl';
    ruleBadge.style.color = skillEnabled ? '#ffd700' : '#94a3b8';
    ruleBadge.innerText = `スキル:${skillEnabled ? 'ON' : 'OFF'} / 自作:${allowCustom ? 'ON' : 'OFF'}`;
    skRow.appendChild(ruleBadge);
  }
  const skillShort = {
    erase_color: '2色消', erase_rows: '1・5・9段', purify_garbage: '浄化', reflection: '反射',
    corrupt_enemy_row: '侵食', seal_skill: '封印', convert_blocks: '変換',
    sacrifice: '代償', no_skill: '無', random: '乱'
  };
  const availSkills = (typeof getSelectableSkillIds === 'function') ? getSelectableSkillIds(allowCustom) : SKILL_IDS;
  const activeSkId = getEffectivePlayerSkillId(cfg.skillId, allowCustom, cfg.fallbackSkillId);
  availSkills.forEach(skId => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'share-pill-btn' + (activeSkId === skId ? ' active' : '');
    b.disabled = !skillEnabled;
    const custom = typeof getCustomSkillConfig === 'function' ? getCustomSkillConfig(skId) : null;
    b.innerText = custom ? (custom.name || '自作').slice(0, 4) : (skillShort[skId] || skId);
    bindMultiTouchTap(b, () => {
      if (!sharePrepConfig.p1.skillEnabled) return;
      if (allowCustom) {
        cfg.skillId = skId;
        if (getCustomSkillSlotIndex(skId) === -1) cfg.fallbackSkillId = skId;
      } else {
        cfg.fallbackSkillId = skId;
        if (getCustomSkillSlotIndex(cfg.skillId) === -1) cfg.skillId = skId;
      }
      cfg.ready = false;
      SE.play('select');
      renderSharePrepUI();
    });
    skRow.appendChild(b);
  });

  const readyBtn = document.createElement('button');
  readyBtn.type = 'button';
  readyBtn.className = 'share-ready-btn' + (cfg.ready ? ' is-ready' : '');
  readyBtn.innerText = cfg.ready ? 'READY! (取消は再タップ)' : '決定 / READY';
  bindMultiTouchTap(readyBtn, () => {
    cfg.ready = !cfg.ready;
    SE.play(cfg.ready ? 'select' : 'cancel');
    renderSharePrepUI();
    checkSharePrepBothReady();
  });

  container.append(hdr, grid, hdRow, dimRow, skRow, readyBtn);
}

function startShareGame() {
  const overlay = document.getElementById('share-prep-overlay');
  if (overlay) overlay.style.display = 'none';
  startGame('share', 3, 2, sharePrepConfig.p1.skillEnabled, sharePrepConfig.p1.customSkillEnabled !== false);
}

function showToast(msg) { 
  const t = document.getElementById('toast'); 
  t.innerText = msg; t.style.display = 'block'; 
  setTimeout(() => t.style.display = 'none', 3000); 
}

function hideAllMenuSubViews() {
  ['main-menu', 'main-menu-actions', 'solo-hub-menu', 'multi-hub-menu', 'com-menu', 'single-menu',
   'local-menu', 'online-menu', 'ranking-menu', 'story-menu'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

function showSoloHubMenu() {
  SE.play('select');
  clearLocalSliderAdjusting();
  hideAllMenuSubViews();
  document.getElementById('solo-hub-menu').style.display = 'flex';
  setSwitchHeroPreview('ひとりで', 'ストーリー・COM対戦・各種練習モードを楽しめます。', 'SOLO PLAY');
  refreshMenuLayoutState(true);
  focusPrimaryMenuElement('solo-hub-menu');
}

function showMultiHubMenu() {
  SE.play('select');
  clearLocalSliderAdjusting();
  hideAllMenuSubViews();
  document.getElementById('multi-hub-menu').style.display = 'flex';
  setSwitchHeroPreview('みんなで', '1台で最大4人対戦、またはP2Pオンライン対戦を選べます。', 'MULTI PLAY');
  refreshMenuLayoutState(true);
  focusPrimaryMenuElement('multi-hub-menu');
}

function backToMainMenu(playSe = true) {
  if (playSe) SE.play('cancel');
  cancelLocalAutoStart();
  clearLocalSliderAdjusting();
  if (typeof closeRangeDigitEdit === 'function') closeRangeDigitEdit();
  if (typeof closeSelectPickerModal === 'function') closeSelectPickerModal(true);
  if (typeof closeCustomSkillModal === 'function') closeCustomSkillModal(true);
  if (typeof closePwaGuideModal === 'function') closePwaGuideModal(true);
  if (typeof closeKeyResetConfirmModal === 'function') closeKeyResetConfirmModal(true);
  if (typeof closeSettingsConfirmModal === 'function') closeSettingsConfirmModal(true);
  closeAppExitConfirmModal(true);
  closeSharePrepMenu(true);
  closeSkillSelectModal(true);
  const cModal = document.getElementById('confirm-match-modal');
  if (cModal) cModal.style.display = 'none';
  hideAllMenuSubViews();
  const mainMenu = document.getElementById('main-menu');
  if (mainMenu) mainMenu.style.display = 'flex';
  document.getElementById('main-menu-actions').style.display = 'flex';
  setSwitchHeroPreview('ぺねぽ', '連鎖とスキルで相手にお邪魔を送り込む対戦パズル！', 'MAIN MENU');
  refreshMenuLayoutState(true);
  focusPrimaryMenuElement('main-menu-actions');
}

function backToSoloHubMenu(playSe = true) {
  if (playSe) SE.play('cancel');
  clearLocalSliderAdjusting();
  if (typeof closeRangeDigitEdit === 'function') closeRangeDigitEdit();
  if (typeof closeSelectPickerModal === 'function') closeSelectPickerModal(true);
  hideAllMenuSubViews();
  document.getElementById('solo-hub-menu').style.display = 'flex';
  refreshMenuLayoutState(true);
  focusPrimaryMenuElement('solo-hub-menu');
}

function backToMultiHubMenu(playSe = true) {
  if (playSe) SE.play('cancel');
  cancelLocalAutoStart();
  clearLocalSliderAdjusting();
  if (typeof closeRangeDigitEdit === 'function') closeRangeDigitEdit();
  if (typeof closeSelectPickerModal === 'function') closeSelectPickerModal(true);
  closeSharePrepMenu(true);
  hideAllMenuSubViews();
  document.getElementById('multi-hub-menu').style.display = 'flex';
  refreshMenuLayoutState(true);
  focusPrimaryMenuElement('multi-hub-menu');
}

function handleMenuCancelAction() {
  if (isElementActuallyVisible('app-terminated-overlay')) {
    reopenAppFromTerminated();
    return true;
  }
  if (isElementActuallyVisible('app-exit-confirm-modal')) {
    closeAppExitConfirmModal();
    return true;
  }
  if (isElementActuallyVisible('key-reset-confirm-modal')) {
    if (typeof closeKeyResetConfirmModal === 'function') closeKeyResetConfirmModal();
    return true;
  }
  if (isElementActuallyVisible('settings-confirm-modal')) {
    if (typeof closeSettingsConfirmModal === 'function') closeSettingsConfirmModal();
    return true;
  }
  if (isElementActuallyVisible('exit-confirm-modal')) {
    closeExitConfirmModal();
    return true;
  }
  if (isElementActuallyVisible('pwa-guide-modal')) {
    if (typeof closePwaGuideModal === 'function') closePwaGuideModal();
    return true;
  }
  if (isElementActuallyVisible('select-picker-modal')) {
    if (typeof closeSelectPickerModal === 'function') closeSelectPickerModal();
    return true;
  }
  if (isElementActuallyVisible('custom-skill-modal')) {
    if (typeof closeCustomSkillModal === 'function') closeCustomSkillModal();
    return true;
  }
  if (isElementActuallyVisible('confirm-match-modal')) {
    backFromConfirmModal();
    return true;
  }
  if (isElementActuallyVisible('skill-select-modal')) {
    closeSkillSelectModal();
    return true;
  }
  if (isElementActuallyVisible('settings-overlay')) {
    if (typeof attemptCancelSettings === 'function') attemptCancelSettings();
    else cancelSettings();
    return true;
  }
  if (isElementActuallyVisible('result-overlay')) {
    performExitGame(false);
    return true;
  }
  if (isElementActuallyVisible('room-waiting')) {
    cancelRoom();
    return true;
  }

  if (!isElementActuallyVisible('menu-overlay')) {
    return false;
  }

  if (isElementActuallyVisible('story-menu')) {
    if (isElementActuallyVisible('story-stage-step')) {
      StoryManager.backToPrepStep();
      return true;
    }
    backToSoloHubMenu(true);
    return true;
  }
  if (isElementActuallyVisible('single-menu') || isElementActuallyVisible('com-menu')) {
    backToSoloHubMenu(true);
    return true;
  }
  if (isElementActuallyVisible('local-menu') || isElementActuallyVisible('online-menu')) {
    backToMultiHubMenu(true);
    return true;
  }
  if (isElementActuallyVisible('solo-hub-menu') || isElementActuallyVisible('multi-hub-menu') || isElementActuallyVisible('ranking-menu')) {
    backToMainMenu(true);
    return true;
  }
  if (isElementActuallyVisible('main-menu-actions')) {
    openAppExitConfirmModal();
    return true;
  }
  return false;
}

function selectSingleModeBtn(mode) {
  if (selectedSingleMode !== mode) SE.play('select');
  selectedSingleMode = mode || 'free';
  document.querySelectorAll('#single-mode-buttons button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.val === selectedSingleMode);
  });
  updateSingleMenu();
}

function selectComCountBtn(cnt) {
  const nextCnt = parseInt(cnt, 10) || 2;
  if (selectedComCount !== nextCnt) SE.play('select');
  selectedComCount = nextCnt;
  document.querySelectorAll('#com-player-count-buttons button').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.val, 10) === selectedComCount);
  });
}

function showSingleMenu(silent = false) {
  if (!silent) SE.play('select');
  clearLocalSliderAdjusting();
  hideAllMenuSubViews();
  document.getElementById('single-menu').style.display = 'flex';
  selectSingleModeBtn(selectedSingleMode);
  syncHandicapFromSlider(document.getElementById('handicap-val')?.value || 3);
  syncDimRuleUI();
  renderCharPicker('single-char-picker', { storyOnly: false });
  if (typeof enhanceAllRangeSliders === 'function') enhanceAllRangeSliders();
  refreshMenuLayoutState();
  focusPrimaryMenuElement('single-menu');
}

function showComMenu(silent = false) {
  if (!silent) SE.play('select');
  clearLocalSliderAdjusting();
  hideAllMenuSubViews();
  document.getElementById('com-menu').style.display = 'flex';
  selectComCountBtn(selectedComCount);
  syncHandicapFromSlider(document.getElementById('handicap-val')?.value || 3);
  syncDimRuleUI();
  renderCharPicker('com-char-picker', { storyOnly: false });
  updateModeWinBadgesUI();
  if (typeof enhanceAllRangeSliders === 'function') enhanceAllRangeSliders();
  refreshMenuLayoutState();
  focusPrimaryMenuElement('com-menu');
}

function showLocalMenu(silent = false) {
  if (!silent) SE.play('select');
  clearLocalSliderAdjusting();
  hideAllMenuSubViews();
  document.getElementById('local-menu').style.display = 'flex';
  resetLocalSelectionStates();
  syncDimRuleUI();
  renderLocalMenuUI();
  refreshMenuLayoutState();
  if (document.activeElement) document.activeElement.blur();
  if (typeof syncPadSnapshotsAll === 'function') syncPadSnapshotsAll(160);
}

function showOnlineMenu(silent = false) {
  if (!silent) SE.play('select');
  clearLocalSliderAdjusting();
  hideAllMenuSubViews();
  document.getElementById('online-menu').style.display = 'flex';
  syncHandicapFromSlider(document.getElementById('handicap-val')?.value || 3);
  syncDimRuleUI();
  renderCharPicker('online-char-picker', { storyOnly: false });
  updateModeWinBadgesUI();
  if (typeof enhanceAllRangeSliders === 'function') enhanceAllRangeSliders();
  refreshMenuLayoutState();
  focusPrimaryMenuElement('online-menu');
}

function moveRankingCarousel(delta) {
  rankingModeIdx = (rankingModeIdx + delta + RANKING_MODES.length) % RANKING_MODES.length;
  SE.play('cursorMove');
  showRankingMenu(true);
}

function renderRankingCarousel() {
  const container = document.getElementById('ranking-mode-carousel');
  if (!container) return;
  const cur = RANKING_MODES[rankingModeIdx] || RANKING_MODES[0];
  container.innerHTML = '';

  const row = document.createElement('div');
  row.className = 'carousel-row';

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'carousel-arrow-btn';
  prevBtn.innerText = '◀';
  prevBtn.onclick = () => moveRankingCarousel(-1);

  const body = document.createElement('div');
  body.className = 'carousel-body';
  body.innerHTML = `<div class="carousel-title" style="color:#ffd700;">🏆 ${cur.label}</div><div class="carousel-sub">${rankingModeIdx + 1} / ${RANKING_MODES.length}</div>`;

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'carousel-arrow-btn';
  nextBtn.innerText = '▶';
  nextBtn.onclick = () => moveRankingCarousel(1);

  row.append(prevBtn, body, nextBtn);

  const dots = document.createElement('div');
  dots.className = 'carousel-dots';
  RANKING_MODES.forEach((_, i) => {
    const d = document.createElement('span');
    d.className = 'carousel-dot' + (i === rankingModeIdx ? ' active' : '');
    dots.appendChild(d);
  });

  container.append(row, dots);
}

function showRankingMenu(silent = false) {
  if (!silent) SE.play('select');
  hideAllMenuSubViews();
  document.getElementById('ranking-menu').style.display = 'flex';
  renderRankingCarousel();
  refreshMenuLayoutState();
  const mode = (RANKING_MODES[rankingModeIdx] || RANKING_MODES[0]).id;
  const listEl = document.getElementById('ranking-list');
  if (mode === 'battle_records') {
    const buildRows = (mKey, slotCount) => {
      let rowsHtml = '';
      for (let i = 0; i < slotCount; i++) {
        const st = BattleStatsManager.getStats(mKey, `p${i}`);
        const who = slotCount === 1 ? BATTLE_MODE_LABELS[mKey] : `${BATTLE_MODE_LABELS[mKey]} (${i + 1}P)`;
        rowsHtml += `
          <div class="ranking-stat-row">
            <span class="ranking-stat-label">${who}</span>
            <span class="ranking-stat-badges">
              <span class="win-badge-chip crown">👑×${st.crown} (歴代:${st.persistedTotal})</span>
              <span class="win-badge-chip best">🏅×${st.persistedMax}</span>
            </span>
          </div>`;
      }
      return rowsHtml;
    };
    listEl.innerHTML = `<div class="ranking-battle-stats-box">
      ${buildRows('com', 1)}
      ${buildRows('online', 1)}
      ${buildRows('share', 2)}
      ${buildRows('local', 4)}
    </div>`;
  } else {
    const data = getRankingData(mode);
    if (data.length === 0) {
      listEl.innerHTML = '<div style="text-align:center; color:#aaa;">記録なし</div>';
    } else {
      listEl.innerHTML = data.map((d, i) => {
        let scoreText = mode === 'single_survival' ? `${d.score}連勝 (Lv.${d.level || 0})` : `Score: ${d.score}`;
        return `<div><span style="display:inline-block; width:25px; color:#ff007f;">${i+1}.</span> ${scoreText} <span style="font-size:0.75rem; color:#aaa;">(HD:${d.handicap})</span></div>`;
      }).join('');
    }
  }
  if (!silent) focusPrimaryMenuElement('ranking-menu');
}

function updateSingleMenu() {
  const isSurvival = (selectedSingleMode === 'survival');
  document.getElementById('survival-settings').style.display = isSurvival ? 'flex' : 'none';
  const mixedBtn = document.getElementById('single-dim-mixed-btn');
  if (mixedBtn) mixedBtn.style.display = isSurvival ? 'inline-block' : 'none';
  syncDimRuleUI();
}
let survivalBaseLevel = 1;

function getSurvivalLevel(initLv, matchNum) {
  const stage = Math.floor((matchNum - 1) / 5);
  const rawMin = matchNum <= 5 ? initLv : (matchNum <= 10 ? initLv + 5 : initLv);
  const rawMax = initLv + stage * 5 + 4;
  let minLv, maxLv;
  if (rawMax <= 99) { minLv = rawMin; maxLv = rawMax; }
  else { maxLv = 99; minLv = Math.max(1, initLv - Math.ceil((rawMax - 99) / 5) * 5); }
  return Math.floor(Math.random() * (maxLv - minLv + 1)) + minLv;
}

function startSingleMode() {
  const mode = selectedSingleMode || 'free';
  const skillEnabled = !!document.getElementById('single-skill-toggle')?.checked;
  const customSkillEnabled = !!document.getElementById('single-custom-skill-toggle')?.checked;
  let initLevel = 1;
  if (mode === 'survival') {
    survivalBaseLevel = parseInt(document.getElementById('survival-init-level').value) || 1;
    initLevel = getSurvivalLevel(survivalBaseLevel, 1);
  }
  startGame('single_' + mode, initLevel, mode === 'survival' ? 2 : 1, skillEnabled, customSkillEnabled);
}

function getRankingData(mode) {
  try { return JSON.parse(localStorage.getItem('pdw_ranking_' + mode)) || []; } catch(e) { return []; }
}
function saveRankingData(mode, entry) {
  let data = getRankingData(mode);
  data.push(entry);
  data.sort((a, b) => b.score - a.score);
  data = data.slice(0, 5);
  localStorage.setItem('pdw_ranking_' + mode, JSON.stringify(data));
  return data.findIndex(e => e === entry) !== -1;
}
function selectTarget(index) {
  if (isMatchOver && !isPracticeMode) return;
  if (myTargetIndex === index) myTargetIndex = -1;
  else if (opponents[index] && !opponents[index].engine.gameOver) myTargetIndex = index;
  updateTargetUI();
  refreshBattleSidePanels();
  SE.play('cursorMove');
}

function cycleTarget(dir = 1) {
  if ((isMatchOver && !isPracticeMode) || opponents.length <= 0) return;
  const validTargets = [-1];
  opponents.forEach((opp, idx) => {
    if (opp.engine && !opp.engine.gameOver) validTargets.push(idx);
  });
  if (validTargets.length <= 1) return;
  let currentPos = validTargets.indexOf(myTargetIndex);
  if (currentPos === -1) currentPos = 0;
  myTargetIndex = validTargets[(currentPos + dir + validTargets.length) % validTargets.length];
  updateTargetUI();
  refreshBattleSidePanels();
  SE.play('cursorMove');
}

function updateTargetUI() {
  opponents.forEach((opp, idx) => {
    const isTargeted = idx === myTargetIndex && !opp.engine.gameOver;
    const el = document.getElementById(`rival-wrapper-${idx}`);
    if (el) el.classList.toggle('targeted', isTargeted);
    const pCard = document.getElementById(`inline-portrait-p${idx + 1}`);
    if (pCard) pCard.classList.toggle('targeted', isTargeted);
  });
}

function playAttackVoiceForSender(senderId) {
  if (typeof VOICE === 'undefined') return;
  if (senderId === 'player' || senderId === myOnlineId || (senderId === 'host' && myOnlineId === 'host')) {
    if (myRenderer && myRenderer.theme) VOICE.play('attack', myRenderer.theme);
    return;
  }
  const opp = opponents.find(o => o.id === senderId);
  if (opp && opp.renderer && opp.renderer.theme) {
    VOICE.play('attack', opp.renderer.theme, currentMode === 'online' ? senderId : null);
  }
}

function playGarbageSendAnimation(fromOppId, toOppId, isHard) {
  if (!document.body) return;
  const getEl = (id) => {
    if (id === 'player' || id === myOnlineId || (id === 'host' && myOnlineId === 'host')) return document.getElementById('my-wrapper');
    const opp = opponents.find(o => o.id === id);
    return opp ? document.getElementById(`rival-wrapper-${opp.index}`) : null;
  };
  const getTargetEl = (id) => {
    if (id === 'player' || id === myOnlineId || (id === 'host' && myOnlineId === 'host')) return document.getElementById('my-garbage-preview');
    const opp = opponents.find(o => o.id === id);
    return opp ? document.getElementById(`rival-garbage-preview-${opp.index}`) : null;
  };
  const fromEl = getEl(fromOppId), toEl = getTargetEl(toOppId);
  if (!fromEl || !toEl) return;
  const fromRect = fromEl.getBoundingClientRect(), toRect = toEl.getBoundingClientRect();
  const animEl = document.createElement('div');
  const gb = (typeof isGbMode !== 'undefined' && isGbMode);
  const bgCol = gb ? (isHard ? '#c0c0c0' : '#686868') : (isHard ? '#a8b2bd' : '#5c636a');
  animEl.style.cssText = `position:fixed;left:${fromRect.left+fromRect.width/2-25}px;top:${fromRect.top+fromRect.height/2-25}px;width:50px;height:50px;background:${bgCol};border:4px solid #fff;border-radius:8px;box-shadow:0 0 15px #fff;z-index:1000;transition:all 0.8s cubic-bezier(0.25,1,0.5,1);pointer-events:none;`;
  document.body.appendChild(animEl);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      animEl.style.left = `${toRect.left+toRect.width/2-25}px`;
      animEl.style.top = `${toRect.top+toRect.height/2-25}px`;
      animEl.style.transform = 'scale(0.5) rotate(720deg)';
      animEl.style.opacity = '0.3';
    });
  });
  setTimeout(() => { if (animEl.parentNode) animEl.parentNode.removeChild(animEl); }, 800);
}

function scaleAttackPanelsByRatio(panels, ratio) {
  if (!Array.isArray(panels) || panels.length === 0) return [];
  if (ratio >= 0.999) return panels.map(p => ({ ...p }));
  if (ratio <= 0) return [];

  const result = [];
  let accum = 0;
  for (let i = 0; i < panels.length; i++) {
    const p = panels[i];
    if (p.h > 1) {
      const exactH = p.h * ratio;
      const wholeH = Math.floor(exactH + 1e-6);
      const frac = Math.max(0, exactH - wholeH);
      if (wholeH >= 1) {
        result.push({ w: p.w, h: wholeH, isHard: !!p.isHard });
      }
      const fracW = Math.floor(p.w * frac + 1e-6);
      if (fracW >= 1) {
        result.push({ w: fracW, h: 1, isHard: !!p.isHard });
      }
    } else {
      const exactW = p.w * ratio + accum;
      const wInt = Math.floor(exactW + 1e-6);
      accum = Math.max(0, exactW - wInt);
      if (wInt >= 1) {
        result.push({ w: wInt, h: 1, isHard: !!p.isHard });
      }
    }
  }
  return result;
}

function distributeGarbage(senderId, totalBlocks, isHard, attackSpec = null) {
  if (isMatchOver && !isPracticeMode) return;
  if (currentMode.startsWith('online')) { distributeGarbageOnline(senderId, totalBlocks, isHard, attackSpec); return; }

  let candidateOpponents = [];
  if (senderId === 'player') {
    candidateOpponents = opponents.filter(o => !o.engine.gameOver);
  } else {
    if (!myEngine.gameOver && !isPracticeMode) candidateOpponents.push({ id: 'player', engine: myEngine });
    opponents.forEach(o => { if (o.id !== senderId && !o.engine.gameOver) candidateOpponents.push(o); });
  }
  if (candidateOpponents.length === 0) return;

  let targetOppId = null;
  if (senderId === 'player' && myTargetIndex !== -1 && opponents[myTargetIndex] && !opponents[myTargetIndex].engine.gameOver) {
    targetOppId = opponents[myTargetIndex].id;
  } else if (senderId !== 'player') {
    const senderOpp = opponents.find(o => o.id === senderId);
    if (senderOpp && senderOpp.targetId && candidateOpponents.some(c => c.id === senderOpp.targetId)) {
      targetOppId = senderOpp.targetId;
    }
  }

  const hasTarget = targetOppId !== null && candidateOpponents.some(o => o.id === targetOppId);
  let sentAny = false;
  const n = candidateOpponents.length;

  candidateOpponents.forEach(opp => {
    let ratio = 1.0;
    if (n > 1) {
      if (hasTarget) ratio = (opp.id === targetOppId) ? 0.5 : (0.5 / (n - 1));
      else ratio = 1.0 / n;
    }
    const count = Math.floor(totalBlocks * ratio);
    const oppSpec = attackSpec ? { ...attackSpec, shareRatio: ratio } : null;
    let willSend = count > 0;
    if (oppSpec && typeof resolveAttackSpecToPanels === 'function') {
      const oppCols = (opp.engine && opp.engine.cols) ? opp.engine.cols : COLS;
      const scaledPreview = scaleAttackPanelsByRatio(resolveAttackSpecToPanels(oppSpec, oppCols), ratio);
      willSend = scaledPreview.length > 0;
    }
    if (willSend) {
      sentAny = true;
      playGarbageSendAnimation(senderId, opp.id, isHard);
      sendBlocksToOpponent(opp, count, isHard, oppSpec);
    }
  });
  if (sentAny) playAttackVoiceForSender(senderId);
}

function distributeGarbageOnline(senderId, totalBlocks, isHard, attackSpec = null) {
  let candidateOpponents = [];
  if (senderId === myOnlineId) candidateOpponents = opponents.filter(o => !o.engine.gameOver);
  else {
    if (!myEngine.gameOver && !isPracticeMode) candidateOpponents.push({ id: myOnlineId, engine: myEngine });
    opponents.forEach(o => { if (o.id !== senderId && !o.engine.gameOver) candidateOpponents.push(o); });
  }
  if (candidateOpponents.length === 0) return;

  let targetOppId = null;
  if (senderId === myOnlineId && myTargetIndex !== -1 && opponents[myTargetIndex] && !opponents[myTargetIndex].engine.gameOver) {
    targetOppId = opponents[myTargetIndex].id;
  }
  const hasTarget = targetOppId !== null && candidateOpponents.some(o => o.id === targetOppId);
  const n = candidateOpponents.length;
  let targetsDict = {};
  let targetSpecs = {};

  candidateOpponents.forEach(opp => {
    let ratio = 1.0;
    if (n > 1) {
      if (hasTarget) ratio = (opp.id === targetOppId) ? 0.5 : (0.5 / (n - 1));
      else ratio = 1.0 / n;
    }
    const count = Math.floor(totalBlocks * ratio);
    const oppSpec = attackSpec ? { ...attackSpec, shareRatio: ratio } : null;
    let willSend = count > 0;
    if (oppSpec && typeof resolveAttackSpecToPanels === 'function') {
      const oppCols = (opp.engine && opp.engine.cols) ? opp.engine.cols : COLS;
      const scaledPreview = scaleAttackPanelsByRatio(resolveAttackSpecToPanels(oppSpec, oppCols), ratio);
      willSend = scaledPreview.length > 0;
    }
    if (willSend) {
      targetsDict[opp.id] = count;
      targetSpecs[opp.id] = { count, attackSpec: oppSpec };
    }
  });
  if (Object.keys(targetsDict).length === 0) return;

  playAttackVoiceForSender(senderId);
  if (myOnlineId === 'host' || hostDisconnected) {
    for (const [tId, entry] of Object.entries(targetSpecs)) {
      playGarbageSendAnimation(senderId, tId, isHard);
      if (tId === myOnlineId) {
        if (!isPracticeMode) sendBlocksToOpponent({ engine: myEngine }, entry.count, isHard, entry.attackSpec);
      } else {
        const opp = opponents.find(o => o.id === tId);
        if (opp && opp.type === 'com') sendBlocksToOpponent(opp, entry.count, isHard, entry.attackSpec);
      }
    }
    if (myOnlineId === 'host' && !hostDisconnected) {
      onlineConnections.forEach(c => {
        if (c && c.open) {
          c.send({ type: 'add_garbage_multi', senderId, targets: targetsDict, targetSpecs, isHard });
        }
      });
    }
  } else {
    for (const tId of Object.keys(targetsDict)) playGarbageSendAnimation(myOnlineId, tId, isHard);
    if (onlineConnections[0] && onlineConnections[0].open) {
      onlineConnections[0].send({ type: 'garbage_request', senderId: myOnlineId, targets: targetsDict, targetSpecs, isHard });
    }
  }
}

function sendBlocksToOpponent(opp, count, isHard, attackSpec = null) {
  if (!opp || !opp.engine) return;
  const oppCols = opp.engine.cols || COLS;
  const incMult = opp.engine.skillModifiers ? (opp.engine.skillModifiers.incomingGarbageMult || 1.0) : (opp.engine.isSacrifice ? 1.2 : 1.0);

  if (attackSpec && Array.isArray(attackSpec.events) && typeof resolveAttackSpecToPanels === 'function') {
    const basePanels = resolveAttackSpecToPanels(attackSpec, oppCols);
    const ratio = (attackSpec.shareRatio !== undefined) ? attackSpec.shareRatio : 1.0;
    const scaledPanels = scaleAttackPanelsByRatio(basePanels, ratio);

    scaledPanels.forEach(p => {
      let pw = Math.max(1, Math.min(oppCols, p.w));
      let ph = Math.max(1, p.h);
      if (incMult > 1.0) {
        if (ph === 1 && pw < oppCols && !(p.isHard && pw === 1)) {
          pw = Math.min(oppCols, Math.ceil(pw * incMult));
        } else {
          ph = Math.ceil(ph * incMult);
        }
      }
      opp.engine.addGarbage(pw, ph, !!p.isHard, true);
    });
    return;
  }

  let finalCount = count;
  if (oppCols !== COLS) {
    finalCount = Math.max(1, Math.round(finalCount * (oppCols / COLS)));
  }
  if (incMult > 1.0) {
    finalCount = Math.ceil(finalCount * incMult);
  }
  let fullRows = Math.floor(finalCount / oppCols), remainder = finalCount % oppCols;
  if (fullRows > 0) opp.engine.addGarbage(oppCols, fullRows, isHard, true);
  const minRemThreshold = oppCols === COLS ? 3 : Math.max(3, Math.floor(oppCols * 0.4));
  if (remainder >= minRemThreshold || (remainder > 0 && fullRows === 0)) {
    opp.engine.addGarbage(remainder, 1, isHard, true);
  }
}

// ==========================================
// 勝敗演出・ゲーム進行・スキル・レイアウト補助
// ==========================================
let battleEndState = { active: false, canDismissAt: 0, onContinue: null, prevAnyPadPressed: false };

function buildBattleEndPortraitDom(wrapEl, theme, isWin, scoreInfo = null) {
  if (!wrapEl) return;
  wrapEl.innerHTML = '';
  wrapEl.classList.toggle('lose', !isWin);

  const appendScoreOverlay = () => {
    if (!scoreInfo || scoreInfo.score === undefined || scoreInfo.score === null) return;
    const scoreOverlay = document.createElement('div');
    scoreOverlay.className = 'battle-end-score-overlay';
    const lbl = document.createElement('span');
    lbl.className = 'battle-end-score-label';
    lbl.innerText = 'SCORE';
    const val = document.createElement('span');
    val.className = 'battle-end-score-val';
    val.innerText = String(scoreInfo.score);
    scoreOverlay.append(lbl, val);
    if (scoreInfo.subText) {
      const sub = document.createElement('span');
      sub.className = 'battle-end-score-sub';
      sub.innerText = scoreInfo.subText;
      scoreOverlay.appendChild(sub);
    }
    wrapEl.appendChild(scoreOverlay);
  };

  const showFallbackCard = () => {
    wrapEl.innerHTML = `<div class="story-fallback-card" style="background:${theme?.color || '#334155'};">${theme?.name || ''}</div>`;
    appendScoreOverlay();
  };

  if (!theme) { showFallbackCard(); return; }

  const img = document.createElement('img');
  img.className = 'battle-end-portrait-img';
  img.alt = theme.name || '';
  const handleLoad = (el) => {
    if (el.naturalHeight <= el.naturalWidth * 1.05) el.classList.add('square-or-wide');
  };

  if (theme.charId === 'custom') {
    if (theme.charSrc) {
      img.onload = () => handleLoad(img);
      img.onerror = showFallbackCard;
      img.src = theme.charSrc;
      wrapEl.appendChild(img);
      appendScoreOverlay();
    } else showFallbackCard();
    return;
  }

  if (theme.charId && typeof applyCharacterImageToElement === 'function') {
    applyCharacterImageToElement(img, theme.charId, isWin ? 'normal' : 'lose', {
      fallbackToNormal: true, onLoad: handleLoad, onError: showFallbackCard
    });
    wrapEl.appendChild(img);
    appendScoreOverlay();
    return;
  }

  if (theme.charSrc) {
    img.onload = () => handleLoad(img);
    img.onerror = showFallbackCard;
    img.src = theme.charSrc;
    wrapEl.appendChild(img);
    appendScoreOverlay();
  } else showFallbackCard();
}

function showBattleEndOverlay(options) {
  closeExitConfirmModal(true);
  const overlay = document.getElementById('battle-end-overlay');
  const singleView = document.getElementById('battle-end-single-view');
  const shareView = document.getElementById('battle-end-share-view');
  if (!overlay || !singleView || !shareView) {
    if (options.onContinue) options.onContinue();
    return;
  }
  battleEndState.active = true;
  battleEndState.canDismissAt = performance.now() + 300;
  battleEndState.onContinue = options.onContinue || null;
  battleEndState.prevAnyPadPressed = true;

  if (options.mode === 'share') {
    singleView.style.display = 'none';
    shareView.style.display = 'flex';
    const p1Win = options.winnerId === 'player';
    const p2Win = !p1Win;
    const p1Badge = document.getElementById('battle-end-share-p1-badge');
    const p2Badge = document.getElementById('battle-end-share-p2-badge');
    p1Badge.innerText = p1Win ? 'WIN!!' : 'LOSE...';
    p1Badge.className = 'battle-end-badge ' + (p1Win ? 'win' : 'lose');
    p2Badge.innerText = p2Win ? 'WIN!!' : 'LOSE...';
    p2Badge.className = 'battle-end-badge ' + (p2Win ? 'win' : 'lose');
    const p1ScoreInfo = options.p1Score !== undefined ? { score: options.p1Score } : null;
    const p2ScoreInfo = options.p2Score !== undefined ? { score: options.p2Score } : null;
    buildBattleEndPortraitDom(document.getElementById('battle-end-share-p1-wrap'), options.p1Theme, p1Win, p1ScoreInfo);
    buildBattleEndPortraitDom(document.getElementById('battle-end-share-p2-wrap'), options.p2Theme, p2Win, p2ScoreInfo);
    document.getElementById('battle-end-share-p1-name').innerText = options.p1Theme ? options.p1Theme.name : '1P';
    document.getElementById('battle-end-share-p2-name').innerText = options.p2Theme ? options.p2Theme.name : '2P';
    if (typeof VOICE !== 'undefined') VOICE.play('win', p1Win ? options.p1Theme : options.p2Theme);
  } else {
    shareView.style.display = 'none';
    singleView.style.display = 'flex';
    const badge = document.getElementById('battle-end-badge');
    badge.innerText = options.titleOverride || (options.isWin ? 'WIN!!' : 'LOSE...');
    badge.className = 'battle-end-badge ' + (options.isWin ? 'win' : 'lose');
    const scoreInfo = options.score !== undefined ? { score: options.score, subText: options.subScoreText || '' } : null;
    buildBattleEndPortraitDom(document.getElementById('battle-end-portrait-wrap'), options.theme, !!options.isWin, scoreInfo);
    document.getElementById('battle-end-name').innerText = options.theme ? options.theme.name : '';
    if (typeof VOICE !== 'undefined') {
      VOICE.play(options.isWin ? 'win' : 'lose', options.theme, options.senderId || null);
    }
  }
  overlay.style.display = 'flex';
  if (typeof syncPadSnapshotsAll === 'function') syncPadSnapshotsAll(250);
}

function hideBattleEndOverlay() {
  battleEndState.active = false;
  battleEndState.onContinue = null;
  const overlay = document.getElementById('battle-end-overlay');
  if (overlay) overlay.style.display = 'none';
  if (typeof syncPadSnapshotsAll === 'function') syncPadSnapshotsAll(200);
}

function tryDismissBattleEndOverlay() {
  if (!battleEndState.active) return false;
  if (performance.now() < battleEndState.canDismissAt) return true;
  const cb = battleEndState.onContinue;
  hideBattleEndOverlay();
  SE.play('select');
  if (cb) cb();
  return true;
}

function showResultModal(titleMsg, winVoiceTheme = null) {
  stopBgm();
  hideBattleEndOverlay();
  closeExitConfirmModal(true);
  if (winVoiceTheme && typeof VOICE !== 'undefined') {
    VOICE.play('win', winVoiceTheme);
  }
  document.getElementById('result-title').innerText = titleMsg;
  document.getElementById('result-status').innerText = '';
  const btn = document.getElementById('result-rematch-btn');
  btn.style.display = 'inline-block';
  btn.disabled = false;
  btn.innerText = 'もう一度対戦する';
  document.getElementById('result-overlay').style.display = 'flex';
  if (document.activeElement) document.activeElement.blur();
  btn.focus();
  if (typeof syncPadSnapshotsAll === 'function') syncPadSnapshotsAll(220);
}

function requestRematch() {
  SE.play('select');
  if (hostDisconnected) { performExitGame(true); return; }
  if (currentMode === 'story') startGame('story', currentComLevel, 2, currentSkillEnabled, currentCustomSkillEnabled);
  else if (currentMode === 'single_survival') startSingleMode();
  else if (currentMode === 'single' || currentMode.startsWith('single_') || currentMode === 'com' || currentMode === 'local' || currentMode === 'share') {
    startGame(currentMode, currentComLevel, currentTotalPlayers, currentSkillEnabled, currentCustomSkillEnabled);
  } else if (currentMode === 'online') {
    rematchReady[myOnlineId] = true;
    document.getElementById('result-rematch-btn').disabled = true;
    if (myOnlineId === 'host') checkRematchCondition();
    else {
      showToast('他のプレイヤーの準備を待っています...');
      if (onlineConnections[0] && onlineConnections[0].open) onlineConnections[0].send({ type: 'rematch_ready', senderId: myOnlineId });
      startPracticeMode();
    }
  }
}
function checkRematchCondition() {
  if (myOnlineId !== 'host') return;
  const humanIds = matchPlayersConfig.filter(p => p.type === 'player').map(p => p.id);
  if (humanIds.every(id => !!rematchReady[id])) startPracticeModeCancelOrMatch();
  else if (rematchReady[myOnlineId]) {
    showToast('他のプレイヤーの再戦同意を待っています...');
    if (!isPracticeMode) startPracticeMode();
  }
}
function startPracticeModeCancelOrMatch() { startPrepareMatchFromHost(); }

function startPracticeMode() {
  isPracticeMode = true;
  document.getElementById('result-overlay').style.display = 'none';
  const handicap = parseInt(document.getElementById('handicap-val').value) || 3;
  const practiceIs3D = (typeof resolveOnlineMyIs3D === 'function') ? resolveOnlineMyIs3D(onlineDimRule) : getEffectiveSelfIs3D();
  myEngine = new PonEngine(null, null, handicap, true, null, { is3D: practiceIs3D });
  myEngine.isPractice = true;
  myEngine.garbageQueue = [];
  myEngine.onSendGarbage = null;
  if (myRenderer) myRenderer.viewCol = null;
  myEngine.onSwap = () => { if (typeof triggerSwapVibration === 'function') triggerSwapVibration(false, getMainPlayerPadSlot()); };
  myEngine.onGarbageLanded = () => { if (typeof triggerGarbageLandVibration === 'function') triggerGarbageLandVibration(getMainPlayerPadSlot()); };
  myEngine.onStateChange = (state) => {
    if (state === 'gameover') {
      myEngine = new PonEngine(null, null, handicap, true, null, { is3D: practiceIs3D });
      myEngine.isPractice = true;
      myEngine.onSendGarbage = null;
      if (myRenderer) myRenderer.viewCol = null;
      myEngine.onSwap = () => { if (typeof triggerSwapVibration === 'function') triggerSwapVibration(false, getMainPlayerPadSlot()); };
      myEngine.onGarbageLanded = () => { if (typeof triggerGarbageLandVibration === 'function') triggerGarbageLandVibration(getMainPlayerPadSlot()); };
    }
  };
}

function recordBattleMatchOutcome(winnerSlotKey) {
  if (matchWinRecorded) return;
  const modeKey = BattleStatsManager.normalizeModeKey(currentMode);
  if (!modeKey) return;
  matchWinRecorded = true;

  if (modeKey === 'local' || modeKey === 'share') {
    const total = 1 + opponents.length;
    for (let i = 0; i < total; i++) {
      const sk = `p${i}`;
      BattleStatsManager.recordResult(modeKey, sk, sk === winnerSlotKey);
    }
  } else {
    BattleStatsManager.recordResult(modeKey, 'p0', winnerSlotKey === 'p0');
  }
  updateAllPortraitHUDs();
  updateBottomStatusBar();
  updateModeWinBadgesUI();
}

function checkMatchEnd() {
  if (matchState === 'gameover' || matchState === 'preparing' || matchState === 'ready') return;
  let aliveCount = 0;
  if (myEngine && !myEngine.gameOver && !isDeadInMatch) aliveCount++;
  opponents.forEach(o => { if (o.engine && !o.engine.gameOver) aliveCount++; });

  if (currentMode === 'local' || currentMode === 'share') {
    if (aliveCount <= 1 && !endSequenceTriggered) {
      endSequenceTriggered = true;
      isMatchOver = true;
      matchState = 'gameover';
      stopAllEngines();
      stopBgm();
      let winnerText = 'DRAW!', winnerEngine = null, winnerTheme = null, winnerId = null, winnerSlotKey = null;
      if (myEngine && !myEngine.gameOver && !isDeadInMatch) {
        winnerId = 'player'; winnerSlotKey = 'p0'; winnerEngine = myEngine; winnerTheme = myRenderer.theme;
        winnerText = `🏆 1P (${winnerTheme.name}) WIN!!`;
      } else {
        const survivor = opponents.find(o => o.engine && !o.engine.gameOver);
        if (survivor) {
          winnerId = survivor.id; winnerSlotKey = `p${survivor.index + 1}`; winnerEngine = survivor.engine; winnerTheme = survivor.renderer.theme;
          winnerText = `🏆 ${survivor.index + 2}P (${winnerTheme.name}) WIN!!`;
        }
      }
      recordBattleMatchOutcome(winnerSlotKey);

      if (myEngine && myEngine !== winnerEngine) myEngine.startGameOverFillAnim();
      opponents.forEach(o => { if (o.engine && o.engine !== winnerEngine) o.engine.startGameOverFillAnim(); });

      const showEndScreen = () => {
        if (currentMode === 'share') {
          showBattleEndOverlay({
            mode: 'share', winnerId: winnerId || 'player',
            p1Theme: myRenderer.theme, p2Theme: opponents[0] ? opponents[0].renderer.theme : null,
            p1Score: myEngine ? myEngine.score : 0,
            p2Score: (opponents[0] && opponents[0].engine) ? opponents[0].engine.score : 0,
            onContinue: () => showResultModal(winnerText)
          });
        } else if (winnerTheme) {
          showBattleEndOverlay({
            mode: 'single', isWin: true, theme: winnerTheme, titleOverride: winnerText,
            score: winnerEngine ? winnerEngine.score : 0,
            onContinue: () => showResultModal(winnerText)
          });
        } else showResultModal(winnerText);
      };
      if (winnerEngine) winnerEngine.startVictoryClearAnim(showEndScreen);
      else if (myEngine) myEngine.startGameOverFillAnim(showEndScreen);
      else showEndScreen();
    }
    return;
  }

  if (myEngine && myEngine.gameOver && !isMatchOver && !isPracticeMode) {
    isMatchOver = true;
    isDeadInMatch = true;
    endSequenceTriggered = true;
    recordBattleMatchOutcome(null);
    if (currentMode === 'online') {
      onlineConnections.forEach(c => { if (c && c.open) c.send({ type: 'sync', senderId: myOnlineId, gameOver: true }); });
    }
    stopBgm();
    if (currentMode === 'story' || currentMode === 'com' || currentMode.startsWith('single')) {
      matchState = 'gameover';
      stopAllEngines();
    }
    const myFinalScore = myEngine ? myEngine.score : 0;
    const survivalSub = currentMode === 'single_survival' ? `${currentSurvivalWins}連勝` : '';
    let scoreVal = currentMode === 'single_survival' ? currentSurvivalWins : myFinalScore;
    let isRankIn = false;
    if (currentMode !== 'story' && currentMode !== 'online') {
      isRankIn = saveRankingData(currentMode, { score: scoreVal, handicap: myEngine.handicap, level: currentComLevel, date: Date.now() });
    }
    myEngine.startGameOverFillAnim(() => {
      if (currentMode === 'story') {
        showBattleEndOverlay({ mode: 'single', isWin: false, theme: myRenderer.theme, score: myFinalScore, onContinue: () => StoryManager.onBattleEnd(false) });
      } else if (currentMode.startsWith('single')) {
        const ttl = isRankIn ? 'NEW RECORD!' : 'GAME OVER';
        showBattleEndOverlay({ mode: 'single', isWin: false, theme: myRenderer.theme, titleOverride: ttl, score: myFinalScore, subScoreText: survivalSub, onContinue: () => showResultModal(ttl) });
      } else {
        const ttl = isRankIn ? 'LOSE...\n(NEW RECORD)' : 'LOSE...';
        showBattleEndOverlay({ mode: 'single', isWin: false, theme: myRenderer.theme, titleOverride: ttl, score: myFinalScore, onContinue: () => showResultModal(ttl) });
      }
    });
  }

  if (!isMatchOver && opponents.length > 0 && aliveCount === 1 && !myEngine.gameOver && !isDeadInMatch) {
    if (currentMode === 'single_survival') {
      const comOpp = opponents[0];
      if (comOpp.engine && comOpp.engine.gameOver && !comOpp.coolTimeStarted) {
        comOpp.coolTimeStarted = true;
        comOpp.waitingEnterVoice = false;
        comOpp.engine.startGameOverFillAnim();
        currentSurvivalWins++;
        comOpp.coolTime = 180;
        SE.play('fanfareMid');
        if (document.getElementById('survival-clear-garbage').checked) myEngine.garbageQueue = [];
      }
      return;
    }
    if (!endSequenceTriggered) {
      endSequenceTriggered = true;
      isMatchOver = true;
      matchState = 'gameover';
      recordBattleMatchOutcome('p0');
      stopAllEngines();
      stopBgm();
      opponents.forEach(o => { if (o.engine) o.engine.startGameOverFillAnim(); });
      const myFinalScore = myEngine ? myEngine.score : 0;
      let isRankIn = false;
      if (currentMode === 'com') {
        isRankIn = saveRankingData('com', { score: myFinalScore, handicap: myEngine.handicap, level: currentComLevel, date: Date.now() });
      }
      myEngine.startVictoryClearAnim(() => {
        if (currentMode === 'story') {
          showBattleEndOverlay({ mode: 'single', isWin: true, theme: myRenderer.theme, score: myFinalScore, onContinue: () => StoryManager.onBattleEnd(true) });
        } else {
          const winTitle = isRankIn ? 'WIN!!\n(NEW RECORD)' : 'WIN!!';
          showBattleEndOverlay({ mode: 'single', isWin: true, theme: myRenderer.theme, titleOverride: winTitle, score: myFinalScore, onContinue: () => showResultModal(winTitle) });
        }
      });
    }
  }

  if (isMatchOver && aliveCount <= 1) {
    matchState = 'gameover';
    if (hostDisconnected) setTimeout(() => { showToast("ホストが退出済みのため解散します。"); performExitGame(true); }, 3000);
    else if (myOnlineId === 'host') checkRematchCondition();
  }
}

function stopAllEngines() {
  clearKeyboardHoldStates();
  stopRotateTouchHold();
  if (myEngine) {
    myEngine.isRisingManualBtn = myEngine.isRisingManualKey = myEngine.isRisingManualPad = false;
    myEngine.touchGrab = null;
    myEngine.riseSpeed = 0;
  }
  opponents.forEach(opp => {
    if (opp.engine) {
      opp.engine.isRisingManualBtn = opp.engine.isRisingManualKey = opp.engine.isRisingManualPad = false;
      opp.engine.touchGrab = null;
      opp.engine.riseSpeed = 0;
    }
    if (opp.ai) opp.ai.target = null;
  });
}

let readyGoTimers = [];
function clearReadyGoTimers() {
  readyGoTimers.forEach(id => clearTimeout(id));
  readyGoTimers = [];
  const overlay = document.getElementById('ready-go-overlay');
  if (overlay) overlay.style.display = 'none';
  const countEl = document.getElementById('ready-countdown-text');
  if (countEl) { countEl.style.display = 'none'; countEl.style.opacity = '0'; countEl.innerText = ''; }
}

function animateReadySubCountdown(countEl, num) {
  if (!countEl) return;
  countEl.style.display = 'block'; countEl.style.transition = 'none';
  countEl.style.opacity = '0'; countEl.style.transform = 'scale(1.45)';
  countEl.innerText = String(num);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    countEl.style.transition = 'all 0.22s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
    countEl.style.opacity = '1'; countEl.style.transform = 'scale(1)';
  }));
}

function showReadyGo() {
  clearReadyGoTimers();
  const overlay = document.getElementById('ready-go-overlay');
  const text = document.getElementById('ready-go-text');
  const countEl = document.getElementById('ready-countdown-text');
  overlay.style.display = 'flex';
  text.innerText = 'READY'; text.style.transition = 'none';
  text.style.opacity = '0'; text.style.transform = 'scale(0.5)'; text.style.color = '#ff007f';
  requestAnimationFrame(() => requestAnimationFrame(() => {
    text.style.transition = 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
    text.style.opacity = '1'; text.style.transform = 'scale(1)';
  }));
  animateReadySubCountdown(countEl, 3);
  if (typeof SE.playCountdown === 'function') SE.playCountdown(3);

  readyGoTimers.push(setTimeout(() => {
    if (matchState === 'gameover' || document.getElementById('game-area').style.display === 'none') return;
    animateReadySubCountdown(countEl, 2);
    if (typeof SE.playCountdown === 'function') SE.playCountdown(2);
  }, 1000));
  readyGoTimers.push(setTimeout(() => {
    if (matchState === 'gameover' || document.getElementById('game-area').style.display === 'none') return;
    animateReadySubCountdown(countEl, 1);
    if (typeof SE.playCountdown === 'function') SE.playCountdown(1);
  }, 2000));
  readyGoTimers.push(setTimeout(() => {
    if (matchState === 'gameover' || document.getElementById('game-area').style.display === 'none') return;
    if (countEl) { countEl.style.display = 'none'; countEl.innerText = ''; }
    text.style.transition = 'none'; text.style.opacity = '0'; text.style.transform = 'scale(1.5)';
    text.innerText = 'GO!!'; text.style.color = '#00e676';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      text.style.transition = 'all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
      text.style.opacity = '1'; text.style.transform = 'scale(1)';
    }));
    if (typeof SE.playCountdown === 'function') SE.playCountdown('go');
    matchState = 'playing';
    resumeBgm();
    readyGoTimers.push(setTimeout(() => {
      text.style.transition = 'all 0.3s ease-in'; text.style.opacity = '0'; text.style.transform = 'scale(2)';
      readyGoTimers.push(setTimeout(() => { overlay.style.display = 'none'; }, 300));
    }, 800));
  }, 3000));
}

function checkPanic() {
  if (!myEngine || matchState !== 'playing' || isMatchOver) return;
  const checkEnginePanic = (eng) => {
    if (!eng || eng.gameOver) return false;
    const rows = eng.rows || ROWS;
    const cols = eng.cols || COLS;
    const panicThresholdR = rows * 0.3;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const b = eng.grid[r][c];
        if (b !== null && b.state === 'normal' && (r - eng.riseOffset) <= panicThresholdR) return true;
      }
    }
    return false;
  };
  let panic = checkEnginePanic(myEngine);
  if (!panic && (currentMode === 'local' || currentMode === 'share')) {
    panic = opponents.some(o => o.type === 'local_human' && checkEnginePanic(o.engine));
  }
  if (panic && !isPanic) { isPanic = true; switchBgmToPanic(true); }
  else if (!panic && isPanic) { isPanic = false; switchBgmToPanic(false); }
}

function switchBgmToPanic(toPanic) {
  if (!isBgmIntendedToPlay || (typeof isBgmPausedByModal !== 'undefined' && isBgmPausedByModal)) return;
  let bgmVol = parseFloat(document.getElementById('bgm-volume').value);
  bgmAudio.volume = bgmVol; panicBgmAudio.volume = bgmVol;
  if (toPanic) {
    bgmAudio.muted = true; panicBgmAudio.muted = false;
    panicBgmAudio.pause(); panicBgmAudio.currentTime = 0;
    panicBgmAudio.play().catch(e => console.warn(e));
  } else {
    panicBgmAudio.muted = true; panicBgmAudio.pause(); panicBgmAudio.currentTime = 0;
    bgmAudio.muted = false;
  }
}

const PLAYER_SKILL_MAX = 3;
const PLAYER_SKILL_SCORE_STEP = 300;
let playerSkillState = {
  enabled: false,
  skillId: 'erase_color',
  isNoSkill: false,
  isSacrifice: false,
  isPassiveOnly: false,
  usesLeft: 0,
  maxUses: PLAYER_SKILL_MAX,
  scoreStep: PLAYER_SKILL_SCORE_STEP,
  nextRequiredScore: 0,
  prevReady: false
};

const headerCutinTimers = {};
function showHeaderCutinById(boxId, theme, text, accentColor = '#ffd700') {
  const box = document.getElementById(boxId);
  if (!box) return;
  const img = box.querySelector('.header-cutin-img');
  const nameEl = box.querySelector('.header-cutin-name');
  const textEl = box.querySelector('.header-cutin-text');
  if (!img || !nameEl || !textEl) return;

  if (theme && theme.charId && theme.charId !== 'custom' && typeof applyCharacterImageToElement === 'function') {
    img.style.display = 'block';
    applyCharacterImageToElement(img, theme.charId, 'normal', {
      onError: () => { img.style.display = 'none'; }
    });
  } else if (theme && theme.charSrc) {
    img.src = theme.charSrc;
    img.style.display = 'block';
  } else {
    img.style.display = 'none';
  }

  box.style.borderColor = (theme && theme.color) ? theme.color : '#ffd700';
  nameEl.innerText = (theme && theme.name) ? theme.name : 'YOU';
  textEl.innerText = text;
  textEl.style.color = accentColor;
  box.classList.add('show');
  if (headerCutinTimers[boxId]) clearTimeout(headerCutinTimers[boxId]);
  headerCutinTimers[boxId] = setTimeout(() => box.classList.remove('show'), 1500);
}

function showPlayerHeaderCutin(theme, text, accentColor = '#ffd700') {
  showHeaderCutinById('my-header-cutin', theme, text, accentColor);
}

function hidePlayerHeaderCutin() {
  Object.keys(headerCutinTimers).forEach(id => { clearTimeout(headerCutinTimers[id]); delete headerCutinTimers[id]; });
  document.querySelectorAll('.header-cutin').forEach(el => el.classList.remove('show'));
}

function isSkillStateCurrentlyReady(skillState, engine, skillId) {
  if (!skillState || !skillState.enabled || !engine || engine.gameOver || isPracticeMode) return false;
  if (skillId === 'no_skill' || skillId === 'sacrifice' || skillState.isPassiveOnly) return false;
  if (skillState.usesLeft <= 0) return false;
  return engine.score >= skillState.nextRequiredScore;
}

function checkSkillFilledSound(skillState, engine, skillId) {
  if (!skillState) return;
  const nowReady = isSkillStateCurrentlyReady(skillState, engine, skillId);
  if (matchState === 'playing' && !isMatchOver && nowReady && !skillState.prevReady) {
    SE.play('skillFilled');
  }
  skillState.prevReady = nowReady;
}

function configureSkillStateForEngine(skillState, engine, enabled, rawSkillId, wrapperId, allowCustom = true, fallbackOverride = null) {
  const effectiveRaw = getEffectivePlayerSkillId(rawSkillId, allowCustom, fallbackOverride);
  const skId = (enabled && typeof resolvePlayableSkillId === 'function')
    ? resolvePlayableSkillId(effectiveRaw, allowCustom, fallbackOverride || selectedFallbackSkill)
    : (effectiveRaw || 'erase_color');

  const isNoSkill = (skId === 'no_skill');
  const isSacrifice = !!enabled && (skId === 'sacrifice');
  const customCfg = (enabled && allowCustom && typeof getCustomSkillConfig === 'function') ? getCustomSkillConfig(skId) : null;

  let maxUses = PLAYER_SKILL_MAX;
  let scoreStep = PLAYER_SKILL_SCORE_STEP;
  let isPassiveOnly = false;
  let hasDangerAura = isSacrifice;

  if (engine && typeof engine.setSacrifice === 'function') {
    engine.setSacrifice(false);
  }

  if (isSacrifice && engine && typeof engine.setSacrifice === 'function') {
    engine.setSacrifice(true);
    maxUses = 0;
  } else if (isNoSkill) {
    maxUses = 0;
  } else if (customCfg && typeof applyCustomSkillStartEffects === 'function') {
    const info = applyCustomSkillStartEffects(engine, customCfg);
    scoreStep = info.scoreStep || PLAYER_SKILL_SCORE_STEP;
    maxUses = info.hasActiveMerit ? (info.maxUses || 0) : 0;
    isPassiveOnly = !info.hasActiveMerit;
    if (engine && engine.skillModifiers && engine.skillModifiers.autoLoseMs > 0) {
      hasDangerAura = true;
    }
  }

  skillState.enabled = !!enabled;
  skillState.skillId = skId;
  skillState.isNoSkill = isNoSkill;
  skillState.isSacrifice = isSacrifice;
  skillState.isPassiveOnly = isPassiveOnly;
  skillState.maxUses = maxUses;
  skillState.scoreStep = scoreStep;
  skillState.usesLeft = (enabled && !isNoSkill && !isSacrifice && !isPassiveOnly) ? maxUses : 0;
  skillState.nextRequiredScore = 0;
  skillState.prevReady = skillState.usesLeft > 0;

  if (wrapperId) {
    const wrap = document.getElementById(wrapperId);
    if (wrap) wrap.classList.toggle('sacrifice-aura', hasDangerAura);
  }
  return skId;
}

function initPlayerSkillState(enabled, rawSkillId = selectedPlayerSkill, allowCustom = true, fallbackOverride = null) {
  configureSkillStateForEngine(playerSkillState, myEngine, enabled, rawSkillId, 'my-wrapper', allowCustom, fallbackOverride);
  updateSkillButtonUI();
}

function applySkillSealToMainPlayer(amount = 300) {
  if (!myEngine || myEngine.gameOver || isPracticeMode) return;
  if (playerSkillState.enabled && !playerSkillState.isNoSkill && !playerSkillState.isSacrifice && !playerSkillState.isPassiveOnly && playerSkillState.usesLeft > 0) {
    playerSkillState.nextRequiredScore = Math.max(playerSkillState.nextRequiredScore, myEngine.score) + amount;
    playerSkillState.prevReady = false;
  }
  showPlayerHeaderCutin(myRenderer.theme, `SEALED +${amount}!`, '#a855f7');
  showToast(`スキル封印を受けた！必要スコア +${amount}`);
  updateSkillButtonUI();
}

function formatAutoLoseRemainText(engine) {
  const limitMs = (engine && engine.skillModifiers && engine.skillModifiers.autoLoseMs > 0)
    ? engine.skillModifiers.autoLoseMs
    : 180000;
  const elapsed = engine ? engine.timeElapsed : 0;
  const remSec = Math.max(0, Math.ceil((limitMs - elapsed) / 1000));
  const m = String(Math.floor(remSec / 60)).padStart(2, '0');
  const s = String(remSec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function renderLocalSkillBarElement(barId, skillState, engine, skillId) {
  const bar = document.getElementById(barId);
  if (!bar) return;
  if (!skillState || !skillState.enabled || currentMode !== 'local') { bar.style.display = 'none'; return; }
  bar.style.display = 'flex';
  const curScore = engine ? engine.score : 0;
  const skName = (typeof getSkillLabel === 'function') ? getSkillLabel(skillId) : 'スキル';
  const maxU = skillState.maxUses || PLAYER_SKILL_MAX;
  const stepScore = skillState.scoreStep || PLAYER_SKILL_SCORE_STEP;

  if (skillId === 'no_skill') {
    bar.classList.remove('ready');
    bar.innerHTML = `<div class="local-skill-bar-fill" style="width:0%"></div><span class="local-skill-bar-text">ノースキル (不可)</span>`;
    return;
  }
  if (skillId === 'sacrifice' || skillState.isPassiveOnly) {
    bar.classList.remove('ready');
    const hasLimit = engine && engine.skillModifiers && engine.skillModifiers.autoLoseMs > 0;
    const txt = skillId === 'sacrifice'
      ? `💀代償 残り${formatAutoLoseRemainText(engine)}`
      : (hasLimit ? `🛠️${skName} 残${formatAutoLoseRemainText(engine)}` : `🛠️${skName} 常時発動`);
    bar.innerHTML = `<div class="local-skill-bar-fill" style="width:100%;background:${hasLimit ? 'rgba(220,38,38,0.5)' : 'rgba(56,189,248,0.45)'};"></div><span class="local-skill-bar-text">${txt}</span>`;
    return;
  }
  if (skillState.usesLeft <= 0) {
    bar.classList.remove('ready');
    bar.innerHTML = `<div class="local-skill-bar-fill" style="width:0%"></div><span class="local-skill-bar-text">${skName} 終了 (0/${maxU})</span>`;
    return;
  }
  const remain = Math.max(0, skillState.nextRequiredScore - curScore);
  if (remain === 0) {
    bar.classList.add('ready');
    bar.innerHTML = `<div class="local-skill-bar-fill" style="width:100%"></div><span class="local-skill-bar-text">${skName} OK! (${skillState.usesLeft}/${maxU})</span>`;
  } else {
    bar.classList.remove('ready');
    const pct = Math.min(100, Math.floor((Math.max(0, stepScore - remain) / stepScore) * 100));
    bar.innerHTML = `<div class="local-skill-bar-fill" style="width:${pct}%"></div><span class="local-skill-bar-text">${skName}(${skillState.usesLeft}/${maxU}) あと${remain}</span>`;
  }
}

function updateSkillButtonVisual(btn, label, prog, skillState, engine, skillId) {
  if (!btn || !label || !prog) return;
  if (!skillState || !skillState.enabled || isPracticeMode) { btn.style.display = 'none'; return; }
  btn.style.display = 'flex';
  btn.classList.remove('sacrifice-active');
  const curScore = engine ? engine.score : 0;
  const skName = (typeof getSkillLabel === 'function') ? getSkillLabel(skillId) : 'スキル';
  const maxU = skillState.maxUses || PLAYER_SKILL_MAX;
  const stepScore = skillState.scoreStep || PLAYER_SKILL_SCORE_STEP;

  if (skillId === 'no_skill') {
    btn.disabled = true; btn.classList.remove('ready'); prog.style.width = '0%';
    label.innerText = 'ノースキル\n使用不可';
    return;
  }
  if (skillId === 'sacrifice' || skillState.isPassiveOnly) {
    btn.disabled = true; btn.classList.remove('ready');
    const hasLimit = engine && engine.skillModifiers && engine.skillModifiers.autoLoseMs > 0;
    if (hasLimit || skillId === 'sacrifice') btn.classList.add('sacrifice-active');
    prog.style.width = '100%';
    label.innerText = skillId === 'sacrifice'
      ? `💀 代償発動中\n残 ${formatAutoLoseRemainText(engine)}`
      : (hasLimit ? `🛠️ ${skName}\n残 ${formatAutoLoseRemainText(engine)}` : `🛠️ ${skName}\n常時発動中`);
    return;
  }
  if (skillState.usesLeft <= 0) {
    btn.disabled = true; btn.classList.remove('ready'); prog.style.width = '0%';
    label.innerText = `${skName}\n終了 (0/${maxU})`;
    return;
  }
  const remain = Math.max(0, skillState.nextRequiredScore - curScore);
  if (remain === 0) {
    btn.disabled = false; btn.classList.add('ready'); prog.style.width = '100%';
    label.innerText = `${skName}\n発動 (${skillState.usesLeft}/${maxU})`;
  } else {
    btn.disabled = true; btn.classList.remove('ready');
    const pct = Math.min(100, Math.floor((Math.max(0, stepScore - remain) / stepScore) * 100));
    prog.style.width = `${pct}%`;
    label.innerText = `${skName}(${skillState.usesLeft}/${maxU})\nあと${remain}点`;
  }
}

function updateSkillButtonUI() {
  const p1SkillId = playerSkillState.skillId || selectedPlayerSkill;
  checkSkillFilledSound(playerSkillState, myEngine, p1SkillId);

  const btn = document.getElementById('skill-btn'), label = document.getElementById('skill-btn-label'), prog = document.getElementById('skill-btn-progress');
  const p2Btn = document.getElementById('p2-skill-btn'), p2Label = document.getElementById('p2-skill-btn-label'), p2Prog = document.getElementById('p2-skill-btn-progress');
  if (currentMode === 'local') {
    if (btn) btn.style.display = 'none';
    if (p2Btn) p2Btn.style.display = 'none';
    renderLocalSkillBarElement('my-local-skill-bar', playerSkillState, myEngine, p1SkillId);
    opponents.forEach((opp, i) => {
      if (opp.type === 'local_human' && opp.skillState) {
        checkSkillFilledSound(opp.skillState, opp.engine, opp.skillId);
        renderLocalSkillBarElement(`rival-local-skill-bar-${i}`, opp.skillState, opp.engine, opp.skillId);
      }
    });
    updateAllPortraitHUDs();
    return;
  }
  const myBar = document.getElementById('my-local-skill-bar');
  if (myBar) myBar.style.display = 'none';
  if (currentMode === 'share') {
    updateSkillButtonVisual(btn, label, prog, playerSkillState, myEngine, p1SkillId);
    const p2Opp = opponents[0];
    if (p2Opp && p2Opp.skillState) {
      checkSkillFilledSound(p2Opp.skillState, p2Opp.engine, p2Opp.skillId);
      updateSkillButtonVisual(p2Btn, p2Label, p2Prog, p2Opp.skillState, p2Opp.engine, p2Opp.skillId);
    } else if (p2Btn) p2Btn.style.display = 'none';
    updateAllPortraitHUDs();
    return;
  }
  if (p2Btn) p2Btn.style.display = 'none';
  updateSkillButtonVisual(btn, label, prog, playerSkillState, myEngine, p1SkillId);
  updateAllPortraitHUDs();
}

function updateRivalSkillBadge(opp, index) {
  const badge = document.getElementById(`rival-skill-badge-${index}`);
  if (!badge || !opp) return;
  if (opp.type === 'local_human') { badge.style.display = 'none'; return; }
  let rem;
  if (opp.ai && typeof opp.ai.getRemainingSkills === 'function') rem = opp.ai.getRemainingSkills();
  else if (opp.syncedSkillRemaining !== undefined && opp.syncedSkillRemaining !== null) rem = opp.syncedSkillRemaining;
  if (rem === undefined || rem === null) { badge.style.display = 'none'; return; }
  const text = `⚡${rem}`;
  if (badge.dataset.lastVal !== text) { badge.dataset.lastVal = text; badge.innerText = text; }
  badge.style.display = 'inline-block';
  badge.classList.toggle('empty', rem <= 0);
}

function activatePlayerSkill() {
  if (!playerSkillState.enabled || !myEngine || myEngine.gameOver || isPracticeMode) return;
  if (playerSkillState.isNoSkill || playerSkillState.isSacrifice || playerSkillState.isPassiveOnly) return;
  if (matchState !== 'playing' || isMatchOver) return;
  if (playerSkillState.usesLeft <= 0 || myEngine.score < playerSkillState.nextRequiredScore) return;
  if (typeof executePlayerCheatSkill !== 'function') return;

  const chosenSkill = playerSkillState.skillId || 'erase_color';
  const senderId = currentMode === 'online' ? myOnlineId : 'player';
  const res = executePlayerCheatSkill(myEngine, senderId, myTargetIndex, chosenSkill);
  if (!res || !res.success) {
    if (currentMode !== 'local' && currentMode !== 'share') showToast('今はそのスキルを発動できる対象がありません');
    return;
  }
  if (typeof triggerConfirmVibration === 'function') triggerConfirmVibration(false, getMainPlayerPadSlot());
  if (typeof SE !== 'undefined' && SE.customBuffers && SE.customBuffers.skill) SE.play('skill');
  playAttackVoiceForSender(senderId);
  playerSkillState.usesLeft--;
  playerSkillState.nextRequiredScore = myEngine.score + (playerSkillState.scoreStep || PLAYER_SKILL_SCORE_STEP);
  playerSkillState.prevReady = false;
  updateSkillButtonUI();

  if (currentMode === 'local') {
    myEngine.cutinMax = 50; myEngine.cutinTimer = 50; myEngine.cutinText = res.text;
  } else {
    showPlayerHeaderCutin(myRenderer.theme, res.text, '#ff007f');
    if (currentMode === 'online' && typeof sendOnlineCutin === 'function') sendOnlineCutin(myOnlineId, res.text);
  }
}

function activateLocalOpponentSkill(opp) {
  if (!opp || !opp.skillState || !opp.skillState.enabled || !opp.engine || opp.engine.gameOver) return;
  if (opp.skillState.isNoSkill || opp.skillState.isSacrifice || opp.skillState.isPassiveOnly) return;
  if (matchState !== 'playing' || isMatchOver) return;
  if (opp.skillState.usesLeft <= 0 || opp.engine.score < opp.skillState.nextRequiredScore) return;
  if (typeof executePlayerCheatSkill !== 'function') return;

  const res = executePlayerCheatSkill(opp.engine, opp.id, opp.targetId || -1, opp.skillId || 'erase_color');
  if (!res || !res.success) return;
  const oppPadSlot = getConnectedLocalPadSlotIfVibrating(opp.playerSlotIndex);
  if (oppPadSlot >= 0 && typeof triggerConfirmVibration === 'function') {
    triggerConfirmVibration(false, oppPadSlot);
  }
  if (typeof SE !== 'undefined' && SE.customBuffers && SE.customBuffers.skill) SE.play('skill');
  playAttackVoiceForSender(opp.id);
  opp.skillState.usesLeft--;
  opp.skillState.nextRequiredScore = opp.engine.score + (opp.skillState.scoreStep || PLAYER_SKILL_SCORE_STEP);
  opp.skillState.prevReady = false;
  updateSkillButtonUI();

  if (currentMode === 'share') showHeaderCutinById(`rival-header-cutin-${opp.index}`, opp.renderer.theme, res.text, '#ff007f');
  else { opp.engine.cutinMax = 50; opp.engine.cutinTimer = 50; opp.engine.cutinText = res.text; }
}

function activateShareP2Skill() {
  if (currentMode !== 'share' || !opponents[0]) return;
  activateLocalOpponentSkill(opponents[0]);
}
function refreshOnlineSplitFrames() {
  const container = document.getElementById('online-split-frames-bg');
  if (!container) return;
  const isGameShown = document.getElementById('game-area')?.style.display !== 'none';
  if (currentMode !== 'online' || !isGameShown) {
    container.style.display = 'none';
    container.innerHTML = '';
    return;
  }

  const playersList = [];
  if (myRenderer && myRenderer.theme) playersList.push({ id: 'me', theme: myRenderer.theme });
  opponents.forEach((opp, idx) => {
    if (opp && opp.renderer && opp.renderer.theme) playersList.push({ id: opp.id || `opp_${idx}`, theme: opp.renderer.theme });
  });

  const total = playersList.length;
  if (total === 0) { container.style.display = 'none'; container.innerHTML = ''; return; }

  const isPortrait = window.innerHeight >= window.innerWidth;
  const isLandscapeLarge = !isPortrait && !useMobileLayoutInLandscape;
  const isLeft = document.getElementById('handedness-toggle')?.checked;
  if (!isLandscapeLarge && total === 2 && isLeft) playersList.reverse();

  container.style.display = 'block';
  container.innerHTML = '';
  const unitPct = 100 / total;
  playersList.forEach((p, idx) => {
    const slot = document.createElement('div');
    slot.className = 'online-split-frame-slot' + (idx > 0 ? ' has-left-feather' : '');
    slot.style.zIndex = String(idx + 1);
    if (total === 1) { slot.style.left = '0%'; slot.style.width = '100%'; }
    else if (idx === 0) { slot.style.left = '0%'; slot.style.width = `calc(${unitPct}% + 3.5vw)`; }
    else if (idx === total - 1) { slot.style.left = `calc(${idx * unitPct}% - 3.5vw)`; slot.style.width = `calc(${unitPct}% + 3.5vw)`; }
    else { slot.style.left = `calc(${idx * unitPct}% - 3.5vw)`; slot.style.width = `calc(${unitPct}% + 7vw)`; }

    const frameUrl = p.theme?.frameSrc ? toAbsoluteAssetUrl(p.theme.frameSrc) : null;
    if (frameUrl) {
      const img = document.createElement('img');
      img.src = frameUrl; img.alt = '';
      slot.appendChild(img);
    } else {
      slot.style.background = `radial-gradient(circle at 50% 40%, ${p.theme?.color || '#334155'}44, rgba(8, 12, 24, 0.88))`;
    }
    container.appendChild(slot);
  });
}

function setSidePortraitElement(imgEl, theme) {
  if (!imgEl || !theme) return;
  imgEl.classList.remove('square-or-wide');
  const onLoad = (el) => {
    if (el.naturalHeight <= el.naturalWidth * 1.05) el.classList.add('square-or-wide');
  };
  if (theme.charId === 'custom') {
    if (theme.charSrc) { imgEl.onload = () => onLoad(imgEl); imgEl.src = theme.charSrc; }
    return;
  }
  if (typeof applyCharacterImageToElement === 'function') {
    applyCharacterImageToElement(imgEl, theme.charId || 'main00', 'normal', { onLoad });
  } else if (theme.charSrc) {
    imgEl.onload = () => onLoad(imgEl); imgEl.src = theme.charSrc;
  }
}

function removeInlinePlayerPortraits() {
  document.querySelectorAll('.inline-player-portrait').forEach(el => el.remove());
}

function buildInlinePortraitCard(playerIdx, totalCount, theme, rivalIndex = -1) {
  const card = document.createElement('div');
  card.id = `inline-portrait-p${playerIdx}`;
  card.className = `inline-player-portrait p-count-${totalCount}` + (playerIdx === 0 ? ' is-p1' : ' is-rival');
  if (theme && theme.color && playerIdx > 0) card.style.borderColor = theme.color;

  const img = document.createElement('img');
  img.className = 'inline-portrait-img';
  img.alt = theme ? theme.name : `${playerIdx + 1}P`;
  setSidePortraitElement(img, theme);
  card.appendChild(img);

  const tag = document.createElement('div');
  tag.className = 'inline-portrait-tag';
  tag.innerText = playerIdx === 0 ? '1P' : `${playerIdx + 1}P`;
  card.appendChild(tag);

  const winsBadge = document.createElement('div');
  winsBadge.id = `inline-portrait-wins-p${playerIdx}`;
  winsBadge.className = 'portrait-wins-badge';
  winsBadge.style.display = 'none';
  card.appendChild(winsBadge);

  const streakBadges = document.createElement('div');
  streakBadges.id = `inline-portrait-streaks-p${playerIdx}`;
  streakBadges.className = 'portrait-streak-badges';
  streakBadges.style.display = 'none';
  card.appendChild(streakBadges);

  const footer = document.createElement('div');
  footer.className = 'inline-portrait-footer';

  const name = document.createElement('div');
  name.className = 'inline-portrait-name';
  name.innerText = theme ? theme.name : `${playerIdx + 1}P`;
  footer.appendChild(name);

  const skillName = document.createElement('div');
  skillName.id = `inline-portrait-skill-name-p${playerIdx}`;
  skillName.className = 'portrait-skill-name';
  skillName.style.display = 'none';
  footer.appendChild(skillName);

  const skillMeter = document.createElement('div');
  skillMeter.id = `inline-portrait-skill-p${playerIdx}`;
  skillMeter.className = 'portrait-skill-meter';
  skillMeter.style.display = 'none';

  const skillFill = document.createElement('div');
  skillFill.className = 'portrait-skill-fill';
  const skillText = document.createElement('span');
  skillText.className = 'portrait-skill-text';
  skillMeter.append(skillFill, skillText);
  footer.appendChild(skillMeter);

  card.appendChild(footer);

  if (rivalIndex >= 0 && currentMode !== 'local' && currentMode !== 'share') {
    card.onclick = () => selectTarget(rivalIndex);
  }
  return card;
}

function applySkillMeterState(meterEl, spec, nameEl = null) {
  if (nameEl) {
    if (!spec || !spec.show || !spec.skillName) {
      if (nameEl.style.display !== 'none') nameEl.style.display = 'none';
      nameEl.dataset.lastName = '';
    } else {
      if (nameEl.dataset.lastName !== spec.skillName) {
        nameEl.dataset.lastName = spec.skillName;
        nameEl.innerText = spec.skillName;
      }
      if (nameEl.style.display === 'none') nameEl.style.display = 'block';
    }
  }
  if (!meterEl) return;
  if (!spec || !spec.show) {
    if (meterEl.style.display !== 'none') meterEl.style.display = 'none';
    meterEl.dataset.lastKey = '';
    return;
  }
  const key = `${spec.pct}|${spec.text}|${spec.cls || ''}`;
  if (meterEl.dataset.lastKey === key) return;
  meterEl.dataset.lastKey = key;

  meterEl.style.display = 'flex';
  meterEl.className = 'portrait-skill-meter' + (spec.cls ? ' ' + spec.cls : '');
  const fill = meterEl.querySelector('.portrait-skill-fill');
  const txt = meterEl.querySelector('.portrait-skill-text');
  if (fill) fill.style.width = `${Math.max(0, Math.min(100, spec.pct))}%`;
  if (txt) txt.innerText = spec.text;
}

function applyWinsBadgeState(badgeEl, text) {
  if (!badgeEl) return;
  if (!text) {
    if (badgeEl.style.display !== 'none') badgeEl.style.display = 'none';
    badgeEl.dataset.lastVal = '';
    return;
  }
  if (badgeEl.dataset.lastVal === text) return;
  badgeEl.dataset.lastVal = text;
  badgeEl.style.display = 'block';
  badgeEl.innerText = text;
}

function applyStreakBadgesState(containerEl, modeKey, slotKey) {
  if (!containerEl) return;
  const norm = BattleStatsManager.normalizeModeKey(modeKey);
  if (!norm || !slotKey) {
    if (containerEl.style.display !== 'none') containerEl.style.display = 'none';
    containerEl.dataset.lastKey = '';
    return;
  }
  const st = BattleStatsManager.getStats(norm, slotKey);
  const cacheKey = `${norm}|${slotKey}|${st.crown}|${st.best}|${st.cur}`;
  if (containerEl.dataset.lastKey === cacheKey) return;
  containerEl.dataset.lastKey = cacheKey;

  containerEl.style.display = 'flex';
  containerEl.innerHTML = `
    <span class="streak-chip crown">👑×${st.crown}</span>
    <span class="streak-chip best">🏅×${st.best}</span>
    <span class="streak-chip cur">★×${st.cur}</span>
  `;
}

function buildHumanSkillMeterSpec(skillState, engine, skillId, isCompact = false) {
  if (!skillState || !skillState.enabled || !engine || isPracticeMode) return null;
  const label = (typeof getSkillLabel === 'function') ? getSkillLabel(skillId) : 'スキル';
  const maxU = skillState.maxUses || PLAYER_SKILL_MAX;
  const stepScore = skillState.scoreStep || PLAYER_SKILL_SCORE_STEP;

  if (skillId === 'no_skill') {
    return { show: true, skillName: label, pct: 0, text: isCompact ? '不可' : 'ノースキル', cls: 'empty' };
  }
  if (skillId === 'sacrifice' || skillState.isPassiveOnly) {
    const hasLimit = engine.skillModifiers && engine.skillModifiers.autoLoseMs > 0;
    const tStr = hasLimit ? formatAutoLoseRemainText(engine) : '常時';
    return {
      show: true,
      skillName: label,
      pct: 100,
      text: isCompact ? tStr : (hasLimit ? `残 ${tStr}` : '常時発動中'),
      cls: hasLimit ? 'sacrifice' : 'ready'
    };
  }
  if (skillState.usesLeft <= 0) {
    return { show: true, skillName: label, pct: 0, text: isCompact ? `0/${maxU}` : `終了 (0/${maxU})`, cls: 'empty' };
  }
  const remain = Math.max(0, skillState.nextRequiredScore - engine.score);
  if (remain === 0) {
    return {
      show: true,
      skillName: label,
      pct: 100,
      text: isCompact ? `OK(${skillState.usesLeft})` : `発動OK! (${skillState.usesLeft}/${maxU})`,
      cls: 'ready'
    };
  }
  const pct = Math.min(100, Math.floor((Math.max(0, stepScore - remain) / stepScore) * 100));
  return {
    show: true,
    skillName: label,
    pct,
    text: isCompact ? `残${remain}` : `あと${remain} (${skillState.usesLeft}/${maxU})`,
    cls: ''
  };
}

function buildOpponentSkillMeterSpec(opp, isCompact = false) {
  if (!opp || !opp.engine) return null;
  if (opp.type === 'local_human') {
    return buildHumanSkillMeterSpec(opp.skillState, opp.engine, opp.skillId, isCompact);
  }
  if (opp.ai && typeof opp.ai.getRemainingSkills === 'function') {
    const skName = typeof opp.ai.getSkillDisplayName === 'function' ? opp.ai.getSkillDisplayName() : 'COMスキル';
    if (opp.engine.isSacrifice || (opp.engine.skillModifiers && opp.engine.skillModifiers.autoLoseMs > 0)) {
      const tStr = formatAutoLoseRemainText(opp.engine);
      return { show: true, skillName: skName, pct: 100, text: isCompact ? tStr : `残 ${tStr}`, cls: 'sacrifice' };
    }
    if (opp.ai.fixedSkill === 'no_skill') {
      return { show: true, skillName: skName, pct: 0, text: '不可', cls: 'empty' };
    }
    const maxUses = Math.max(1, opp.ai.maxSkillUses || 3);
    const rem = Math.max(0, opp.ai.getRemainingSkills());
    if (opp.ai.maxSkillUses === 0) {
      return { show: true, skillName: skName, pct: 100, text: '常時発動', cls: 'ready' };
    }
    if (rem <= 0) {
      return { show: true, skillName: skName, pct: 0, text: isCompact ? '0' : `終了 (0/${maxUses})`, cls: 'empty' };
    }
    const cdReady = (typeof opp.ai.skillCooldown === 'number' && opp.ai.skillCooldown <= 0);
    const pct = Math.round((rem / maxUses) * 100);
    return {
      show: true,
      skillName: skName,
      pct,
      text: isCompact ? `${rem}/${maxUses}` : `残${rem}/${maxUses}${cdReady ? ' OK' : ''}`,
      cls: cdReady ? 'ready' : ''
    };
  }
  if (opp.syncedSkillRemaining !== undefined && opp.syncedSkillRemaining !== null) {
    const skName = 'スキル';
    if (opp.engine.isSacrifice) {
      return { show: true, skillName: '代償', pct: 100, text: isCompact ? '発動' : '発動中', cls: 'sacrifice' };
    }
    const rem = Math.max(0, opp.syncedSkillRemaining);
    if (rem <= 0) {
      return { show: true, skillName: skName, pct: 0, text: isCompact ? '0' : `終了 (0/${PLAYER_SKILL_MAX})`, cls: 'empty' };
    }
    const pct = Math.round((rem / PLAYER_SKILL_MAX) * 100);
    return {
      show: true,
      skillName: skName,
      pct,
      text: isCompact ? `${rem}/${PLAYER_SKILL_MAX}` : `残${rem}/${PLAYER_SKILL_MAX}`,
      cls: 'ready'
    };
  }
  return null;
}

function updatePracticeRightInfoPanel() {
  const infoBox = document.getElementById('battle-side-p2-practice-info');
  if (!infoBox || infoBox.style.display === 'none' || !myEngine) return;

  const modeMap = {
    single_free: 'フリー練習',
    single_ta: 'タイムアタック',
    single_sa: 'スコアアタック'
  };
  const modeEl = document.getElementById('practice-info-mode');
  const hsEl = document.getElementById('practice-info-highscore');
  const scEl = document.getElementById('practice-info-score');
  const hdEl = document.getElementById('practice-info-handicap');

  const modeName = modeMap[currentMode] || 'れんしゅう';
  if (modeEl && modeEl.innerText !== modeName) modeEl.innerText = modeName;

  const rankData = getRankingData(currentMode);
  const savedBest = (rankData && rankData.length > 0) ? (rankData[0].score || 0) : 0;
  const liveHigh = Math.max(savedBest, myEngine.score || 0);
  if (hsEl && hsEl.innerText !== String(liveHigh)) hsEl.innerText = String(liveHigh);

  const curSc = String(myEngine.score || 0);
  if (scEl && scEl.innerText !== curSc) scEl.innerText = curSc;

  const hdText = HANDICAP_LABELS[myEngine.handicap] || String(myEngine.handicap || 3);
  if (hdEl && hdEl.innerText !== hdText) hdEl.innerText = hdText;
}

function updatePreviewWinBadges(previewListId, modeKey, slotKey) {
  const listEl = document.getElementById(previewListId);
  const boxEl = listEl ? listEl.closest('.garbage-preview-box') : null;
  if (!boxEl) return;

  let badgeBox = boxEl.querySelector('.preview-win-badges');
  const norm = BattleStatsManager.normalizeModeKey(modeKey);
  if (!norm || currentMode !== 'share') {
    if (badgeBox) badgeBox.style.display = 'none';
    return;
  }

  if (!badgeBox) {
    badgeBox = document.createElement('div');
    badgeBox.className = 'preview-win-badges';
    boxEl.appendChild(badgeBox);
  }
  const st = BattleStatsManager.getStats(norm, slotKey);
  const cacheKey = `${norm}|${slotKey}|${st.crown}|${st.best}|${st.cur}`;
  if (badgeBox.dataset.lastKey !== cacheKey) {
    badgeBox.dataset.lastKey = cacheKey;
    badgeBox.innerHTML = BattleStatsManager.buildBadgeChipsHtml(st, true);
  }
  badgeBox.style.display = 'flex';
}

function updateAllPortraitHUDs() {
  const isSurvival = (currentMode === 'single_survival');
  const p1WinsText = isSurvival ? `🏆 ${currentSurvivalWins}連勝` : '';
  const p1SkillId = playerSkillState.skillId || selectedPlayerSkill;
  const p1Spec = buildHumanSkillMeterSpec(playerSkillState, myEngine, p1SkillId, false);

  const sideCardP1 = document.getElementById('battle-side-p1');
  if (sideCardP1 && sideCardP1.style.display !== 'none') {
    applyWinsBadgeState(document.getElementById('battle-side-p1-wins'), p1WinsText);
    applyStreakBadgesState(document.getElementById('battle-side-p1-streaks'), currentMode, 'p0');
    applySkillMeterState(
      document.getElementById('battle-side-p1-skill'),
      p1Spec,
      document.getElementById('battle-side-p1-skill-name')
    );
  }

  updatePracticeRightInfoPanel();

  if (currentMode === 'share') {
    updatePreviewWinBadges('my-garbage-preview', 'share', 'p0');
    updatePreviewWinBadges('rival-garbage-preview-0', 'share', 'p1');
  } else {
    updatePreviewWinBadges('my-garbage-preview', null, 'p0');
  }

  const totalCount = 1 + opponents.length;
  const isCompact = totalCount >= 4;
  const showOppStreaks = (currentMode === 'local' || currentMode === 'share');

  const p0Card = document.getElementById('inline-portrait-p0');
  if (p0Card) {
    applyWinsBadgeState(document.getElementById('inline-portrait-wins-p0'), isSurvival ? `🏆 ${currentSurvivalWins}連勝` : '');
    applyStreakBadgesState(document.getElementById('inline-portrait-streaks-p0'), currentMode, 'p0');
    applySkillMeterState(
      document.getElementById('inline-portrait-skill-p0'),
      buildHumanSkillMeterSpec(playerSkillState, myEngine, p1SkillId, isCompact),
      document.getElementById('inline-portrait-skill-name-p0')
    );
  }

  opponents.forEach((opp, i) => {
    const oppCard = document.getElementById(`inline-portrait-p${i + 1}`);
    if (!oppCard) return;
    const oppWinsText = isSurvival ? `Lv.${opp.level || currentComLevel}` : '';
    applyWinsBadgeState(document.getElementById(`inline-portrait-wins-p${i + 1}`), oppWinsText);
    applyStreakBadgesState(
      document.getElementById(`inline-portrait-streaks-p${i + 1}`),
      showOppStreaks ? currentMode : null,
      showOppStreaks ? `p${i + 1}` : null
    );
    applySkillMeterState(
      document.getElementById(`inline-portrait-skill-p${i + 1}`),
      buildOpponentSkillMeterSpec(opp, isCompact),
      document.getElementById(`inline-portrait-skill-name-p${i + 1}`)
    );
  });
}
function refreshBattleSidePanels() {
  const p1Card = document.getElementById('battle-side-p1');
  const p2Card = document.getElementById('battle-side-p2');
  const p2CharaView = document.getElementById('battle-side-p2-chara-view');
  const p2PracticeView = document.getElementById('battle-side-p2-practice-info');
  if (!p1Card || !p2Card) return;

  const isPortrait = window.innerHeight >= window.innerWidth;
  const isLandscapeLarge = !isPortrait && !useMobileLayoutInLandscape;
  const isGameShown = document.getElementById('game-area')?.style.display !== 'none';
  const oppCount = opponents.length;

  const isSoloPractice = isGameShown && isLandscapeLarge && oppCount === 0 && currentMode !== 'local' && currentMode !== 'share' && window.innerWidth >= 620;

  if (!isSoloPractice || !myRenderer || !myRenderer.theme) {
    p1Card.style.display = 'none';
    p2Card.style.display = 'none';
    return;
  }

  p1Card.style.display = 'flex';
  p1Card.style.borderColor = myRenderer.theme.color || '#10b981';
  document.getElementById('battle-side-p1-name').innerText = myRenderer.theme.name || 'YOU';
  document.getElementById('battle-side-p1-tag').innerText = myEngine && myEngine.is3D ? 'PLAYER 3D' : 'PLAYER';
  setSidePortraitElement(document.getElementById('battle-side-p1-img'), myRenderer.theme);

  if (currentMode.startsWith('single_') && currentMode !== 'single_survival') {
    p2Card.style.display = 'flex';
    if (p2CharaView) p2CharaView.style.display = 'none';
    if (p2PracticeView) p2PracticeView.style.display = 'flex';
  } else {
    p2Card.style.display = 'none';
    if (p2CharaView) p2CharaView.style.display = 'flex';
    if (p2PracticeView) p2PracticeView.style.display = 'none';
  }
  updateAllPortraitHUDs();
}

function getModeLabelForBottomBar() {
  const dimSuffix = myEngine && myEngine.is3D ? ' (3D)' : '';
  if (currentMode === 'story') return `STORY${dimSuffix}`;
  if (currentMode === 'com') return `COM戦 Lv.${currentComLevel}${dimSuffix}`;
  if (currentMode === 'online') return `ONLINE P2P${dimSuffix}`;
  if (currentMode === 'single_ta') return `TIME ATTACK${dimSuffix}`;
  if (currentMode === 'single_sa') return `SCORE ATTACK${dimSuffix}`;
  if (currentMode === 'single_survival') return `勝ち抜き ${currentSurvivalWins}勝${dimSuffix}`;
  return `PRACTICE${dimSuffix}`;
}

function ensureBottomStatusBadgesContainer(bar, statsEl) {
  if (!bar || !statsEl) return null;
  let rightWrap = bar.querySelector('.battle-bottom-right');
  if (!rightWrap) {
    rightWrap = document.createElement('div');
    rightWrap.className = 'battle-bottom-right';
    const badgesEl = document.createElement('div');
    badgesEl.id = 'battle-bottom-win-badges';
    badgesEl.className = 'bottom-win-badges';
    rightWrap.appendChild(badgesEl);
    if (statsEl.parentNode === bar) {
      bar.insertBefore(rightWrap, statsEl);
      rightWrap.appendChild(statsEl);
    } else {
      rightWrap.appendChild(statsEl);
      bar.appendChild(rightWrap);
    }
  }
  return rightWrap.querySelector('#battle-bottom-win-badges');
}

function updateBottomStatusBar() {
  const bar = document.getElementById('battle-bottom-status-bar');
  if (!bar) return;
  if (bar.style.display === 'none' || !myEngine || !myRenderer || !myRenderer.theme) return;

  const nameEl = document.getElementById('bottom-status-name');
  const modeEl = document.getElementById('bottom-status-mode');
  const statsEl = document.getElementById('battle-bottom-stats');
  const avatarEl = document.getElementById('bottom-status-avatar');
  const badgesEl = ensureBottomStatusBadgesContainer(bar, statsEl);

  if (nameEl) nameEl.innerText = myRenderer.theme.name || 'YOU';
  if (modeEl) modeEl.innerText = getModeLabelForBottomBar();
  if (avatarEl && avatarEl.dataset.charLoaded !== (myRenderer.theme.charSrc || myRenderer.theme.charId)) {
    avatarEl.dataset.charLoaded = myRenderer.theme.charSrc || myRenderer.theme.charId || '';
    setSidePortraitElement(avatarEl, myRenderer.theme);
  }
  if (badgesEl) {
    const norm = BattleStatsManager.normalizeModeKey(currentMode);
    if (norm) {
      const st = BattleStatsManager.getStats(norm, 'p0');
      const cacheKey = `${norm}|${st.crown}|${st.best}|${st.cur}`;
      if (badgesEl.dataset.lastKey !== cacheKey) {
        badgesEl.dataset.lastKey = cacheKey;
        badgesEl.innerHTML = BattleStatsManager.buildBadgeChipsHtml(st, true);
      }
      badgesEl.style.display = 'flex';
    } else {
      badgesEl.style.display = 'none';
      badgesEl.dataset.lastKey = '';
    }
  }
  if (statsEl) {
    if (myEngine.chain > maxChainInMatch) maxChainInMatch = myEngine.chain;
    const text = currentMode === 'single_survival'
      ? `🏆 ${currentSurvivalWins}WIN  |  MAX ${maxChainInMatch}連鎖`
      : `MAX ${maxChainInMatch}連鎖  |  SCORE ${myEngine.score}`;
    if (statsEl.dataset.lastText !== text) {
      statsEl.dataset.lastText = text;
      statsEl.innerText = text;
    }
  }
}
function startGame(mode, level = 1, totalPlayers = 2, skillEnabled = false, customSkillEnabled = true) {
  if (typeof isAppExiting !== 'undefined') isAppExiting = false;
  cancelLocalAutoStart();
  clearLocalSliderAdjusting();
  closeExitConfirmModal(true);
  closeAppExitConfirmModal(true);
  if (typeof SceneBgm !== 'undefined') SceneBgm.stop();
  if (typeof closeRangeDigitEdit === 'function') closeRangeDigitEdit();
  if (typeof closeSelectPickerModal === 'function') closeSelectPickerModal(true);
  document.getElementById('result-overlay').style.display = 'none';
  hideBattleEndOverlay();
  currentMode = mode; currentComLevel = level; currentTotalPlayers = totalPlayers;
  currentSkillEnabled = !!skillEnabled;
  currentCustomSkillEnabled = (customSkillEnabled !== false);
  matchState = 'ready'; isPracticeMode = false;

  const runInit = () => {
    const storyOverlay = document.getElementById('story-overlay');
    if (storyOverlay) storyOverlay.style.display = 'none';
    document.getElementById('menu-overlay').style.display = 'none';
    document.getElementById('game-area').style.display = 'flex';
    updateVerticalBottomNav();

    if (currentMode === 'local') {
      document.body.classList.remove('share-force-portrait');
      try { screen.orientation?.lock?.('landscape')?.catch(() => {}); } catch (e) {}
    } else if (currentMode === 'share') {
      document.body.classList.remove('local-force-landscape');
      try { screen.orientation?.lock?.('portrait')?.catch(() => {}); } catch (e) {}
      updateShareForcePortraitClass();
    }
    setupInput();
    resetGameLogic();
    readyBgm();
    showReadyGo();
    if (typeof syncPadSnapshotsAll === 'function') syncPadSnapshotsAll(220);
    if (loopId) cancelAnimationFrame(loopId);
    lastTime = performance.now(); accumulator = 0;
    loopId = requestAnimationFrame(gameLoop);
  };

  if (typeof SceneTransition !== 'undefined' && typeof SceneTransition.run === 'function') {
    SceneTransition.run('LOADING...', runInit, () => adjustLayout());
  } else {
    runInit();
  }
}

function resetGameLogic() {
  isMatchOver = false; isDeadInMatch = false; isPracticeMode = false; endSequenceTriggered = false;
  matchWinRecorded = false;
  isExitConfirmOpen = false;
  myTargetIndex = -1; currentMatchId = Date.now(); currentSurvivalWins = 0; maxChainInMatch = 0;
  hidePlayerHeaderCutin();
  resetAllLocalInputStates();
  removeInlinePlayerPortraits();
  refreshOnlineSplitFrames();

  const myWrapper = document.getElementById('my-wrapper');
  if (myWrapper) myWrapper.classList.remove('sacrifice-aura');

  const handicap = currentMode === 'share'
    ? (sharePrepConfig.p1.handicap || 3)
    : (currentMode === 'local' ? (localSlotsConfig[0].handicap || 3) : (parseInt(document.getElementById('handicap-val').value) || 3));
  const sharedSeed = Math.floor(Math.random() * 0xFFFFFFFF);
  const myIs3D = resolveSelfIs3DForMode(currentMode);

  myRenderer = new BoardRenderer('my-canvas');
  myEngine = new PonEngine(
    (state) => { if (state === 'gameover') checkMatchEnd(); },
    (totalBlocks, isHard, attackSpec = null) => { distributeGarbage('player', totalBlocks, isHard, attackSpec); },
    handicap, true, sharedSeed, { is3D: myIs3D }
  );
  myEngine.onRowPushed = handleMyRowPushed;
  myEngine.onSwap = () => {
    if (typeof triggerSwapVibration === 'function') triggerSwapVibration(false, getMainPlayerPadSlot());
  };
  myEngine.onGarbageLanded = () => {
    if (typeof triggerGarbageLandVibration === 'function') triggerGarbageLandVibration(getMainPlayerPadSlot());
  };
  myEngine.garbageQueue = [];
  myEngine.allowBoardCutin = (currentMode === 'local');
  if (currentMode === 'single_survival' && document.getElementById('survival-keep-speed').checked) myEngine.keepSpeed = true;

  let rawCharId = selectedCharId;
  let mySkillId = selectedPlayerSkill;
  let myFallbackSkill = selectedFallbackSkill;
  if (currentMode === 'story') rawCharId = StoryManager.getSelectedCharId();
  else if (currentMode === 'local') {
    rawCharId = localSlotsConfig[0].charId;
    mySkillId = localSlotsConfig[0].skillId || 'erase_color';
    myFallbackSkill = localSlotsConfig[0].fallbackSkillId || selectedFallbackSkill;
  } else if (currentMode === 'share') {
    rawCharId = sharePrepConfig.p1.charId;
    mySkillId = sharePrepConfig.p1.skillId || 'erase_color';
    myFallbackSkill = sharePrepConfig.p1.fallbackSkillId || selectedFallbackSkill;
  }

  const resolvedCharId = resolvePlayableCharId(rawCharId);
  myRenderer.theme = buildThemeForCharacter(
    resolvedCharId,
    (resolvedCharId === 'custom' && CustomAssets.chara) ? CustomAssets.chara.dataUrl : null,
    true,
    resolvedCharId === 'custom' ? getPlayerDisplayName() : null
  );

  const isSharedScreenMode = (currentMode === 'share' || currentMode === 'local');
  if (typeof applyBoardFrame === 'function') {
    applyBoardFrame('my-wrapper', isSharedScreenMode ? myRenderer.theme.frameSrc : null);
  }
  if (currentMode !== 'story') {
    if (typeof applyGlobalFrameTheme === 'function') {
      let globalFrame;
      if (currentMode === 'local') {
        globalFrame = (typeof CustomAssets !== 'undefined' && CustomAssets.frame)
          ? CustomAssets.frame.dataUrl
          : myRenderer.theme.frameSrc;
      } else if (currentMode === 'share') {
        globalFrame = (typeof CustomAssets !== 'undefined' && CustomAssets.frame) ? CustomAssets.frame.dataUrl : null;
      } else {
        globalFrame = myRenderer.theme.frameSrc;
      }
      applyGlobalFrameTheme(globalFrame);
    }
    if (!myRenderer.theme.frameSrc && myRenderer.theme.charId !== 'custom' && myRenderer.theme.voiceName && typeof resolveCharacterImage === 'function') {
      const targetTheme = myRenderer.theme;
      const isSharedCap = isSharedScreenMode;
      const isLocalCap = (currentMode === 'local');
      resolveCharacterImage('frame', targetTheme.voiceName).then((url) => {
        if (url && currentMode !== 'story' && myRenderer && myRenderer.theme === targetTheme && document.getElementById('game-area')?.style.display !== 'none') {
          targetTheme.frameSrc = url;
          if (!CustomAssets.frame) {
            if (isSharedCap && typeof applyBoardFrame === 'function') applyBoardFrame('my-wrapper', url);
            if ((!isSharedCap || isLocalCap) && typeof applyGlobalFrameTheme === 'function') applyGlobalFrameTheme(url);
          }
        }
      });
    }
  }
  document.getElementById('player-label').innerText = (currentMode === 'local' || currentMode === 'share') ? `1P: ${myRenderer.theme.name}` : myRenderer.theme.name;

  myEngine.onChainEnd = (chain) => {
    if (chain > maxChainInMatch) maxChainInMatch = chain;
    showPlayerHeaderCutin(myRenderer.theme, `${chain} CHAIN!!`, '#ffd700');
  };
  myEngine.onSimultaneousMatch = (size) => showPlayerHeaderCutin(myRenderer.theme, `${size}個消し！`, '#00d4ff');
  initPlayerSkillState(currentSkillEnabled, mySkillId, currentCustomSkillEnabled, myFallbackSkill);

  const rivalsArea = document.getElementById('rivals-area');
  const rivalsTopArea = document.getElementById('rivals-top-area');
  rivalsArea.innerHTML = ''; rivalsTopArea.innerHTML = ''; opponents = [];

  const opponentCount = currentMode.startsWith('single') && currentMode !== 'single_survival' ? 0 : currentTotalPlayers - 1;
  const rivalCharPool = CHARACTERS.filter(c => c.id !== resolvedCharId).sort(() => Math.random() - 0.5);

  for (let i = 0; i < opponentCount; i++) {
    const slotCfg = currentMode === 'local' ? localSlotsConfig[i + 1] : null;
    const isShareMode = (currentMode === 'share');
    const isLocalHuman = isShareMode || (currentMode === 'local' && slotCfg && !slotCfg.isCom);
    const isComMode = !isShareMode && (currentMode === 'com' || currentMode === 'single_survival' || currentMode === 'story' || (currentMode === 'local' && slotCfg && slotCfg.isCom));

    const wrapper = document.createElement('div');
    if (isShareMode) {
      wrapper.className = 'board-wrapper share-p2-board';
    } else {
      wrapper.className = 'board-wrapper rival-board' + (isComMode ? ' com-board' : '');
    }
    wrapper.id = `rival-wrapper-${i}`;
    if (currentMode !== 'local' && !isShareMode) wrapper.onclick = () => selectTarget(i);

    let oppChar;
    if (currentMode === 'story' && StoryManager.activeStage) oppChar = getCharacterById(StoryManager.activeStage.enemyId);
    else if (isShareMode) oppChar = getCharacterById(resolvePlayableCharId(sharePrepConfig.p2.charId));
    else if (currentMode === 'local' && slotCfg) oppChar = getCharacterById(resolvePlayableCharId(slotCfg.charId));
    else oppChar = rivalCharPool[i % rivalCharPool.length];

    let nameColor = oppChar ? oppChar.color : (isComMode ? '#aaaaaa' : '#e94560');
    let oppName = oppChar ? oppChar.name : `COM ${i+1}`;
    if (currentMode === 'single_survival') oppName = `${oppChar.name} Lv.${currentComLevel}`;
    else if (currentMode === 'com') oppName = `${oppChar.name} (COM)`;
    else if (isShareMode) oppName = `2P: ${oppChar.name}`;
    else if (currentMode === 'local') oppName = isLocalHuman ? `${i + 2}P: ${oppChar.name}` : `${i + 2}P(COM): ${oppChar.name}`;

    if (isShareMode) {
      wrapper.innerHTML = `
        <div class="board-frame-layer" id="rival-board-frame-${i}"></div>
        <div class="garbage-preview-box"><span class="preview-label">予告</span><div id="rival-garbage-preview-${i}" class="preview-list"></div></div>
        <div class="board-header my-board-header">
          <span style="color:#ff6b9d;" id="rival-name-label-${i}">${oppName}</span>
          <span id="rival-timer-label-${i}" style="color:#ffd700;">00:00</span>
          <span id="rival-score-label-${i}">SCORE: 0 | CHAIN: 0</span>
          <div id="rival-header-cutin-${i}" class="header-cutin" aria-hidden="true"><img class="header-cutin-img" alt=""><span class="header-cutin-name"></span><span class="header-cutin-text"></span></div>
        </div>
        <div class="canvas-container"><canvas id="rival-canvas-${i}"></canvas></div>`;
    } else if (currentMode === 'local') {
      wrapper.innerHTML = `
        <div class="garbage-preview-box"><span class="preview-label">予告</span><div id="rival-garbage-preview-${i}" class="preview-list"></div><span id="rival-skill-badge-${i}" class="skill-count-badge" style="display:none;"></span></div>
        <div class="board-header my-board-header"><span style="color:${nameColor};" id="rival-name-label-${i}">${oppName} <span class="target-badge">🎯</span></span><span id="rival-score-label-${i}">SCORE: 0</span>
        <div id="rival-header-cutin-${i}" class="header-cutin" aria-hidden="true"><img class="header-cutin-img" alt=""><span class="header-cutin-name"></span><span class="header-cutin-text"></span></div></div>
        <div class="canvas-container"><canvas id="rival-canvas-${i}"></canvas></div>
        <div id="rival-local-skill-bar-${i}" class="local-skill-bar" style="display:none;"></div>`;
    } else {
      wrapper.innerHTML = `
        <div class="garbage-preview-box"><span class="preview-label">予告</span><div id="rival-garbage-preview-${i}" class="preview-list"></div><span id="rival-skill-badge-${i}" class="skill-count-badge" style="display:none;"></span></div>
        <div class="board-header"><span style="color:${nameColor};" id="rival-name-label-${i}">${oppName} <span class="target-badge">🎯 TARGET</span></span><span id="rival-score-label-${i}">SCORE: 0</span></div>
        <div class="canvas-container"><canvas id="rival-canvas-${i}"></canvas></div>`;
    }
    rivalsArea.appendChild(wrapper);

    const oppId = isShareMode ? 'share_p2' : (currentMode === 'local' ? `local_${i + 1}` : `com_${i}`);
    const rRenderer = new BoardRenderer(`rival-canvas-${i}`);
    rRenderer.theme = buildThemeForCharacter(oppChar.id, (oppChar.id === 'custom' && CustomAssets.chara) ? CustomAssets.chara.dataUrl : null, false, oppChar.id === 'custom' ? getPlayerDisplayName() : null);

    if (typeof applyBoardFrame === 'function') {
      applyBoardFrame(`rival-wrapper-${i}`, rRenderer.theme.frameSrc);
    }
    if (currentMode === 'story' && i === 0) {
      const storyEnemyFrame = rRenderer.theme.frameSrc || (CustomAssets.frame ? CustomAssets.frame.dataUrl : null);
      if (typeof applyGlobalFrameTheme === 'function') applyGlobalFrameTheme(storyEnemyFrame);
    }
    if (!rRenderer.theme.frameSrc && rRenderer.theme.charId !== 'custom' && rRenderer.theme.voiceName && typeof resolveCharacterImage === 'function') {
      const targetRTheme = rRenderer.theme;
      const rivalWrapId = `rival-wrapper-${i}`;
      const isStoryEnemy = (currentMode === 'story' && i === 0);
      resolveCharacterImage('frame', targetRTheme.voiceName).then((url) => {
        if (url && document.getElementById(rivalWrapId)) {
          targetRTheme.frameSrc = url;
          applyBoardFrame(rivalWrapId, url);
          if (isStoryEnemy && currentMode === 'story' && typeof applyGlobalFrameTheme === 'function') applyGlobalFrameTheme(url);
        }
      });
    }

    const oppHandicap = isShareMode
      ? (sharePrepConfig.p2.handicap || 3)
      : ((currentMode === 'local' && slotCfg) ? (slotCfg.handicap || 3) : 3);
    const oppIs3D = resolveOppIs3DForMode(currentMode, i);
    const rEngine = new PonEngine(
      (state) => { if (state === 'gameover') checkMatchEnd(); },
      (totalBlocks, isHard, attackSpec = null) => { distributeGarbage(oppId, totalBlocks, isHard, attackSpec); },
      oppHandicap, (currentMode === 'local' || currentMode === 'share'), sharedSeed, { is3D: oppIs3D }
    );
    rEngine.garbageQueue = []; rEngine.allowBoardCutin = (currentMode === 'local');

    const oppInputState = isLocalHuman ? createPlayerInputState() : null;
    if (isLocalHuman) {
      const oppPlayerSlotIndex = i + 1;
      rEngine.onSwap = () => {
        const oppPadSlot = getConnectedLocalPadSlotIfVibrating(oppPlayerSlotIndex);
        if (oppPadSlot >= 0 && typeof triggerSwapVibration === 'function') {
          triggerSwapVibration(false, oppPadSlot);
        }
      };
      rEngine.onGarbageLanded = () => {
        const oppPadSlot = getConnectedLocalPadSlotIfVibrating(oppPlayerSlotIndex);
        if (oppPadSlot >= 0 && typeof triggerGarbageLandVibration === 'function') {
          triggerGarbageLandVibration(oppPadSlot);
        }
      };
      rEngine.onRowPushed = () => {
        if (oppInputState.padGrabState.active && oppInputState.padGrabState.row > 0) oppInputState.padGrabState.row--;
        if (oppInputState.keyGrabState.active && oppInputState.keyGrabState.row > 0) oppInputState.keyGrabState.row--;
        if (isShareMode && shareP2RowFollowCallback) shareP2RowFollowCallback();
      };
    }
    if (currentMode === 'local' || isShareMode) {
      rEngine.onChainEnd = (chain) => showHeaderCutinById(`rival-header-cutin-${i}`, rRenderer.theme, `${chain} CHAIN!!`, '#ffd700');
      rEngine.onSimultaneousMatch = (size) => showHeaderCutinById(`rival-header-cutin-${i}`, rRenderer.theme, `${size}個消し！`, '#00d4ff');
    } else {
      rEngine.onChainStep = (chain) => { rEngine.cutinMax = 50; rEngine.cutinTimer = 50; rEngine.cutinText = `${chain} CHAIN!!`; };
      rEngine.onSimultaneousMatch = (size) => { rEngine.cutinMax = 50; rEngine.cutinTimer = 50; rEngine.cutinText = `${size}個消し！`; };
    }

    const oppFallbackSk = isShareMode
      ? (sharePrepConfig.p2.fallbackSkillId || 'erase_rows')
      : ((slotCfg && slotCfg.fallbackSkillId) ? slotCfg.fallbackSkillId : 'erase_color');
    const rawOppSkillId = isShareMode
      ? (sharePrepConfig.p2.skillId || 'erase_color')
      : ((slotCfg && slotCfg.skillId) ? slotCfg.skillId : 'erase_color');
    const effOppSkillId = getEffectivePlayerSkillId(rawOppSkillId, currentCustomSkillEnabled, oppFallbackSk);
    const oppSkillId = (currentSkillEnabled && typeof resolvePlayableSkillId === 'function')
      ? resolvePlayableSkillId(effOppSkillId, currentCustomSkillEnabled, oppFallbackSk)
      : effOppSkillId;

    let rAI = null;
    if (isComMode) {
      if (currentMode === 'story' && StoryManager.activeStage) {
        const stCfg = StoryManager.activeStageConfig || StoryManager.getStageConfig(StoryManager.activeStage);
        rAI = (stCfg.useCheat && typeof cheat === 'function')
          ? new cheat(rEngine, stCfg.level, oppId, { skillType: stCfg.skillType, maxSkillUses: 10, allowCustom: currentCustomSkillEnabled })
          : new ComAI(rEngine, stCfg.level, oppId);
      } else {
        const comLv = (currentMode === 'local' && slotCfg) ? slotCfg.comLevel : currentComLevel;
        const useCheat = ((currentMode === 'com' || currentMode === 'single_survival' || currentMode === 'local') && currentSkillEnabled);
        const maxUses = (currentMode === 'single_survival' || currentMode === 'local') ? 3 : 10;
        const aiOpts = { maxSkillUses: maxUses, allowCustom: currentCustomSkillEnabled, fallbackSkill: oppFallbackSk };
        if (currentMode === 'local' && slotCfg) {
          aiOpts.skillType = 'single';
          aiOpts.fixedSkill = oppSkillId;
        }
        rAI = (useCheat && typeof cheat === 'function') ? new cheat(rEngine, comLv, oppId, aiOpts) : new ComAI(rEngine, comLv, oppId);
      }
      if (rEngine.isSacrifice || (rEngine.skillModifiers && rEngine.skillModifiers.autoLoseMs > 0)) {
        wrapper.classList.add('sacrifice-aura');
      }
    }

    let oppSkillState = null;
    let finalOppSkillId = oppSkillId;
    if (isLocalHuman) {
      oppSkillState = {
        enabled: false,
        skillId: oppSkillId,
        isNoSkill: false,
        isSacrifice: false,
        isPassiveOnly: false,
        usesLeft: 0,
        maxUses: PLAYER_SKILL_MAX,
        scoreStep: PLAYER_SKILL_SCORE_STEP,
        nextRequiredScore: 0,
        prevReady: false
      };
      finalOppSkillId = configureSkillStateForEngine(oppSkillState, rEngine, currentSkillEnabled, oppSkillId, `rival-wrapper-${i}`, currentCustomSkillEnabled, oppFallbackSk);
    }

    const oppObj = {
      id: oppId, name: oppName, type: isLocalHuman ? 'local_human' : 'com',
      playerSlotIndex: i + 1, skillId: finalOppSkillId, engine: rEngine, renderer: rRenderer, ai: rAI,
      index: i, level: currentComLevel, targetId: null, inputState: oppInputState,
      skillState: oppSkillState, coolTimeStarted: false, waitingEnterVoice: false
    };
    opponents.push(oppObj);
    updateRivalSkillBadge(oppObj, i);
  }

  if (currentMode === 'share') setupShareP2Input();
  updateGarbagePreview(myEngine, 'my-garbage-preview');
  opponents.forEach((opp, i) => updateGarbagePreview(opp.engine, `rival-garbage-preview-${i}`));
  updateTargetUI();
  updateSkillButtonUI();
  adjustLayout();
}

function startSingleGame() { selectedSingleMode = 'free'; startGame('single_free', 1, 1, false, true); }
function startComGame(level) {
  const skillEnabled = !!document.getElementById('com-cheat-toggle')?.checked;
  const customSkillEnabled = !!document.getElementById('com-custom-skill-toggle')?.checked;
  startGame('com', level, selectedComCount || 2, skillEnabled, customSkillEnabled);
}
function startComGameFromSlider() {
  const level = parseInt(document.getElementById('com-level-slider').value) || 2;
  const skillEnabled = !!document.getElementById('com-cheat-toggle')?.checked;
  const customSkillEnabled = !!document.getElementById('com-custom-skill-toggle')?.checked;
  startGame('com', level, selectedComCount || 2, skillEnabled, customSkillEnabled);
}

function cleanupShareDomZones() {
  const gameArea = document.getElementById('game-area'), gameContainer = document.getElementById('game-container');
  const exitBtn = document.getElementById('exit-btn'), controls = document.getElementById('controls-container');
  const p2Controls = document.getElementById('p2-controls-container'), myWrapper = document.getElementById('my-wrapper');
  const rivalsArea = document.getElementById('rivals-area');
  if (gameArea) gameArea.classList.remove('share-mode');
  if (exitBtn) exitBtn.classList.remove('share-exit-btn');
  if (p2Controls) p2Controls.style.display = 'none';
  const p1Zone = document.getElementById('share-p1-zone'), p2Zone = document.getElementById('share-p2-zone');
  if (gameContainer) {
    if (controls) {
      controls.style.transform = '';
      controls.style.margin = '';
      if (controls.parentNode !== gameContainer) gameContainer.appendChild(controls);
    }
    if (p2Controls) {
      p2Controls.style.transform = '';
      p2Controls.style.margin = '';
      if (p2Controls.parentNode !== gameContainer) gameContainer.appendChild(p2Controls);
    }
    if (myWrapper) {
      myWrapper.style.transform = '';
      myWrapper.style.margin = '';
      if (myWrapper.parentNode !== gameContainer) gameContainer.appendChild(myWrapper);
    }
    if (rivalsArea && rivalsArea.parentNode !== gameContainer) gameContainer.appendChild(rivalsArea);
    opponents.forEach((_, i) => {
      const rw = document.getElementById(`rival-wrapper-${i}`);
      if (rw) {
        rw.style.transform = '';
        rw.style.margin = '';
        if (rivalsArea && rw.parentNode !== rivalsArea) rivalsArea.appendChild(rw);
      }
    });
  }
  if (p1Zone && p1Zone.parentNode) p1Zone.parentNode.removeChild(p1Zone);
  if (p2Zone && p2Zone.parentNode) p2Zone.parentNode.removeChild(p2Zone);
}

function exitGame(silent = false) {
  if (!silent && myEngine && !isMatchOver && !isPracticeMode && !myEngine.gameOver) {
    openExitConfirmModal();
    return;
  }
  performExitGame(silent);
}

function returnToModeMenuAfterExit(exitedMode) {
  const m = exitedMode || '';
  if (m === 'single' || m.startsWith('single_')) {
    showSingleMenu(true);
  } else if (m === 'com') {
    showComMenu(true);
  } else if (m === 'story') {
    if (typeof StoryManager !== 'undefined') StoryManager.openMenu(true, true);
    else backToMainMenu(false);
  } else if (m === 'local') {
    showLocalMenu(true);
  } else if (m === 'share') {
    showLocalMenu(true);
    openSharePrepMenu(true);
  } else if (m === 'online' || m === 'online_host' || m === 'online_client') {
    showOnlineMenu(true);
  } else {
    backToMainMenu(false);
  }
}

function performExitGame(silent = false) {
  const exitedMode = currentMode;
  if (typeof stopAllVibration === 'function') stopAllVibration();
  closeExitConfirmModal(true);
  closeAppExitConfirmModal(true);
  clearKeyboardHoldStates();
  stopRotateTouchHold();
  if (myEngine && !exitedMode.startsWith('single')) {
    onlineConnections.forEach(c => { if(c && c.open) c.send({ type: 'leave', senderId: myOnlineId }); });
  }
  if (!silent) SE.play('cancel');
  isMatchOver = true; isDeadInMatch = true; matchState = 'gameover'; isPracticeMode = false;
  hostDisconnected = false; endSequenceTriggered = false;
  clearReadyGoTimers(); hideBattleEndOverlay(); stopAllEngines(); stopBgm(); hidePlayerHeaderCutin();
  removeInlinePlayerPortraits();
  if (typeof hideOnlineSyncOverlay === 'function') hideOnlineSyncOverlay();
  if (typeof closeRangeDigitEdit === 'function') closeRangeDigitEdit();
  if (typeof closeSelectPickerModal === 'function') closeSelectPickerModal(true);
  if (typeof SE !== 'undefined' && SE.clearRemoteSounds) SE.clearRemoteSounds();
  if (typeof VOICE !== 'undefined' && VOICE.clearRemoteVoices) VOICE.clearRemoteVoices();
  cleanupShareDomZones();
  document.getElementById('my-wrapper')?.classList.remove('sacrifice-aura');
  if (typeof applyBoardFrame === 'function') applyBoardFrame('my-wrapper', null);
  if (typeof applyGlobalFrameTheme === 'function') {
    applyGlobalFrameTheme(typeof CustomAssets !== 'undefined' && CustomAssets.frame ? CustomAssets.frame.dataUrl : null);
  }
  const splitBg = document.getElementById('online-split-frames-bg');
  if (splitBg) { splitBg.style.display = 'none'; splitBg.innerHTML = ''; }
  document.body.classList.remove('local-force-landscape', 'share-force-portrait');
  try { screen.orientation?.unlock?.(); } catch (e) {}
  myEngine = null; opponents = [];
  onlineConnections.forEach(c => c.close()); onlineConnections = [];
  if (peer) { peer.destroy(); peer = null; }
  if (syncIntervalId) { clearInterval(syncIntervalId); syncIntervalId = null; }
  if (loopId) { cancelAnimationFrame(loopId); loopId = null; }
  if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }

  const p1Card = document.getElementById('battle-side-p1'), p2Card = document.getElementById('battle-side-p2');
  if (p1Card) p1Card.style.display = 'none';
  if (p2Card) p2Card.style.display = 'none';
  const bottomBar = document.getElementById('battle-bottom-status-bar');
  if (bottomBar) bottomBar.style.display = 'none';

  document.getElementById('countdown-overlay').style.display = 'none';
  document.getElementById('result-overlay').style.display = 'none';
  document.getElementById('game-area').style.display = 'none';
  document.getElementById('rivals-area').style.display = 'none';
  document.getElementById('rivals-top-area').style.display = 'none';
  document.getElementById('menu-overlay').style.display = 'flex';
  document.getElementById('room-waiting').style.display = 'none';
  document.getElementById('story-overlay').style.display = 'none';
  document.getElementById('share-prep-overlay').style.display = 'none';
  returnToModeMenuAfterExit(exitedMode);
  if (typeof SceneBgm !== 'undefined' && (typeof OpAnimation === 'undefined' || !OpAnimation.isActive())) {
    SceneBgm.play('mode_select');
  }
  if (typeof syncPadSnapshotsAll === 'function') syncPadSnapshotsAll(220);
}
function updateGarbagePreview(engine, containerId) {
  const container = document.getElementById(containerId);
  if (!container || !engine) return;
  const compressed = [], keyMap = new Map();
  engine.garbageQueue.forEach(g => {
    const key = `${g.w}_${g.h}_${g.isHard ? 1 : 0}`;
    if (keyMap.has(key)) keyMap.get(key).count++;
    else { const entry = { w: g.w, h: g.h, isHard: !!g.isHard, count: 1 }; keyMap.set(key, entry); compressed.push(entry); }
  });
  const cStr = JSON.stringify(compressed);
  if (container.dataset.qStr === cStr) return;
  container.dataset.qStr = cStr;
  container.innerHTML = '';
  const gb = (typeof isGbMode !== 'undefined' && isGbMode);
  const colsRef = engine.cols || COLS;
  const minW = colsRef >= 18 ? 10 : 18;
  compressed.forEach((g, idx) => {
    const block = document.createElement('div');
    const bgCol = gb ? (g.isHard ? '#cccccc' : '#4a4a4a') : (g.isHard ? '#a8b2bd' : '#5c636a');
    const brCol = idx === 0 ? (gb ? '#ffffff' : '#ffd700') : '#dee2e6';
    const ratioW = Math.round((g.w / colsRef) * 42);
    block.style.cssText = `background:${bgCol};border:1.5px solid ${brCol};border-radius:3px;width:${Math.min(48,Math.max(minW,ratioW))}px;height:${Math.min(26,Math.max(14,g.h*6))}px;flex-shrink:0;display:flex;align-items:center;justify-content:center;${idx>0?'opacity:0.58;':''}`;
    if (g.count > 1) {
      const span = document.createElement('span');
      span.innerText = `×${g.count}`;
      span.style.cssText = 'color:#fff;font-size:11px;font-weight:900;line-height:1;text-shadow:1px 1px 1px #000;';
      block.appendChild(span);
    }
    container.appendChild(block);
  });
}
function beginSurvivalNextEnemyEnter(opp) {
  if (!opp || !opp.engine || opp.waitingEnterVoice) return;
  opp.waitingEnterVoice = true;
  const matchToken = currentMatchId;

  const myCid = (myRenderer && myRenderer.theme) ? myRenderer.theme.charId : 'main00';
  const prevOppCid = (opp.renderer && opp.renderer.theme) ? opp.renderer.theme.charId : '';
  let pool = CHARACTERS.filter(c => c.id !== myCid && c.id !== prevOppCid);
  if (pool.length === 0) pool = CHARACTERS.filter(c => c.id !== myCid);
  const nextChar = pool[Math.floor(Math.random() * pool.length)] || CHARACTERS[0];
  const nextLv = getSurvivalLevel(survivalBaseLevel, currentSurvivalWins + 1);
  const nextIs3D = (selectedDimRule === '3d')
    ? true
    : (selectedDimRule === '2d' ? false : (Math.random() < 0.5));

  const nextTheme = buildThemeForCharacter(nextChar.id, null, false);
  opp.renderer.theme = nextTheme;
  opp.renderer.viewCol = null;
  opp.level = nextLv;

  if (typeof applyBoardFrame === 'function') {
    applyBoardFrame(`rival-wrapper-${opp.index}`, nextTheme.frameSrc);
  }
  if (!nextTheme.frameSrc && nextTheme.charId !== 'custom' && nextTheme.voiceName && typeof resolveCharacterImage === 'function') {
    const rivalWrapId = `rival-wrapper-${opp.index}`;
    resolveCharacterImage('frame', nextTheme.voiceName).then((url) => {
      if (url && opp.renderer && opp.renderer.theme === nextTheme && document.getElementById(rivalWrapId)) {
        nextTheme.frameSrc = url;
        applyBoardFrame(rivalWrapId, url);
      }
    });
  }

  const nameLbl = document.getElementById(`rival-name-label-${opp.index}`);
  if (nameLbl) {
    nameLbl.innerHTML = `${nextTheme.name} Lv.${nextLv} <span class="target-badge">🎯 TARGET</span>`;
  }

  const inlineCard = document.getElementById(`inline-portrait-p${opp.index + 1}`);
  if (inlineCard) {
    inlineCard.style.borderColor = nextTheme.color || '';
    const imgEl = inlineCard.querySelector('.inline-portrait-img');
    if (imgEl) setSidePortraitElement(imgEl, nextTheme);
    const nameEl = inlineCard.querySelector('.inline-portrait-name');
    if (nameEl) nameEl.innerText = nextTheme.name || '';
  }

  opp.engine.is3D = nextIs3D;
  opp.engine.cols = nextIs3D ? (typeof COLS_3D !== 'undefined' ? COLS_3D : 18) : COLS;
  opp.engine.endAnim = null;
  opp.engine.gameOver = false;
  opp.engine.shakeTimer = 0;
  opp.engine.riseOffset = 0;
  opp.engine.stopTimer = 0;
  opp.engine.cursor = { x: 2, y: 6 };
  opp.engine.touchGrab = null;
  opp.engine.grid = Array.from({ length: opp.engine.rows }, () => Array(opp.engine.cols).fill(null));
  opp.engine.nextRow = [];
  opp.ai = null;
  if (document.getElementById('survival-cancel-sent')?.checked) {
    opp.engine.garbageQueue = [];
  }
  updateAllPortraitHUDs();

  const finishEnter = () => {
    if (currentMatchId !== matchToken || currentMode !== 'single_survival' || !opponents.includes(opp)) return;
    opp.waitingEnterVoice = false;
    opp.coolTimeStarted = false;
    opp.engine.endAnim = null;
    opp.engine.gameOver = false;
    opp.engine.shakeTimer = 0;
    opp.engine.riseOffset = 0;
    opp.engine.stopTimer = 0;
    opp.engine.cursor = { x: 2, y: 6 };
    opp.engine.touchGrab = null;
    opp.engine.initSeed = Math.floor(Math.random() * 0xFFFFFFFF) >>> 0;
    opp.engine.grid = Array.from({ length: opp.engine.rows }, () => Array(opp.engine.cols).fill(null));
    opp.engine.initGrid();
    if (document.getElementById('survival-cancel-sent')?.checked) {
      opp.engine.garbageQueue = [];
    }
    opp.ai = (currentSkillEnabled && typeof cheat === 'function')
      ? new cheat(opp.engine, nextLv, opp.id, { maxSkillUses: 3, allowCustom: currentCustomSkillEnabled })
      : new ComAI(opp.engine, nextLv, opp.id);
    const wrap = document.getElementById(`rival-wrapper-${opp.index}`);
    if (wrap) {
      wrap.classList.toggle('sacrifice-aura', !!(opp.engine.isSacrifice || (opp.engine.skillModifiers && opp.engine.skillModifiers.autoLoseMs > 0)));
    }
    updateRivalSkillBadge(opp, opp.index);
    updateAllPortraitHUDs();
  };

  if (typeof VOICE !== 'undefined' && typeof VOICE.playAndWait === 'function') {
    VOICE.playAndWait('attack', nextTheme, null, 3500).then(finishEnter).catch(finishEnter);
  } else {
    finishEnter();
  }
}

let lastTime = 0, accumulator = 0;
const FIXED_TIME_STEP = 1000 / 60;

function gameLoop(time) {
  if (myEngine && !myEngine.onSwap) {
    myEngine.onSwap = () => { if (typeof triggerSwapVibration === 'function') triggerSwapVibration(false, getMainPlayerPadSlot()); };
  }
  if (myEngine && !myEngine.onGarbageLanded) {
    myEngine.onGarbageLanded = () => { if (typeof triggerGarbageLandVibration === 'function') triggerGarbageLandVibration(getMainPlayerPadSlot()); };
  }
  if (isExitConfirmOpen && currentMode !== 'online') {
    lastTime = time;
    accumulator = 0;
    if (myEngine) myRenderer.draw(myEngine);
    opponents.forEach(opp => { if (opp.renderer && opp.engine) opp.renderer.draw(opp.engine); });
    loopId = requestAnimationFrame(gameLoop);
    return;
  }

  const inputNow = performance.now();
  pollGamepadInput(inputNow);
  pollKeyboardHoldInput(inputNow);

  let deltaTime = time - lastTime;
  if (deltaTime > 100) deltaTime = 100;
  lastTime = time; accumulator += deltaTime;
  while (accumulator >= FIXED_TIME_STEP) {
    if (myEngine && (!isMatchOver || isPracticeMode || (myEngine.endAnim && !myEngine.endAnim.done))) myEngine.update(FIXED_TIME_STEP);
    opponents.forEach(opp => {
      const oppHasEndAnim = opp.engine && opp.engine.endAnim && !opp.engine.endAnim.done;
      const keepOnlineComsRunning = (currentMode === 'online' && matchState !== 'gameover' && (myOnlineId === 'host' || hostDisconnected));
      if (isMatchOver && !isPracticeMode && !oppHasEndAnim && !keepOnlineComsRunning) return;
      if (currentMode === 'single_survival' && opp.coolTimeStarted) {
        if (oppHasEndAnim) opp.engine.update(FIXED_TIME_STEP);
        if (!opp.waitingEnterVoice) {
          opp.coolTime--;
          if (opp.coolTime <= 0) {
            beginSurvivalNextEnemyEnter(opp);
          }
        }
      } else if (opp.type === 'local_human') {
        if (opp.engine && (!opp.engine.gameOver || oppHasEndAnim)) opp.engine.update(FIXED_TIME_STEP);
      } else {
        const isLocalControlledCom = (opp.type === 'com') && (currentMode === 'com' || currentMode === 'single_survival' || currentMode === 'story' || currentMode === 'local' || myOnlineId === 'host' || hostDisconnected);
        if (isLocalControlledCom || oppHasEndAnim) {
          if (isLocalControlledCom && opp.ai && !opp.engine.gameOver) opp.ai.update();
          if (opp.engine && (!opp.engine.gameOver || oppHasEndAnim)) opp.engine.update(FIXED_TIME_STEP);
        }
      }
    });
    if (!isMatchOver || isPracticeMode) checkPanic();
    accumulator -= FIXED_TIME_STEP;
  }

  let sharedTimeStr = '00:00';
  if (myEngine) {
    myRenderer.draw(myEngine);
    const t = Math.floor(myEngine.timeElapsed / 1000);
    sharedTimeStr = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
    document.getElementById('timer-label').innerText = sharedTimeStr;
    document.getElementById('score-label').innerText = `SCORE: ${myEngine.score} | CHAIN: ${myEngine.chain}`;
    updateGarbagePreview(myEngine, 'my-garbage-preview');
    updateSkillButtonUI();
    updateBottomStatusBar();
    if (currentMode === 'single_ta' && myEngine.timeElapsed >= 180000 && !myEngine.gameOver && !isMatchOver) {
      myEngine.gameOver = true; checkMatchEnd();
    }
    const p0Card = document.getElementById('inline-portrait-p0');
    if (p0Card) p0Card.classList.toggle('is-dead', !!myEngine.gameOver && !isPracticeMode);
  }
  opponents.forEach((opp, i) => {
    if (opp.renderer && opp.engine) {
      opp.renderer.draw(opp.engine);
      const timerEl = document.getElementById(`rival-timer-label-${i}`);
      if (timerEl) {
        const ot = Math.floor(opp.engine.timeElapsed / 1000);
        timerEl.innerText = `${String(Math.floor(ot / 60)).padStart(2, '0')}:${String(ot % 60).padStart(2, '0')}`;
      }
      const scoreEl = document.getElementById(`rival-score-label-${i}`);
      if (scoreEl) {
        if (currentMode === 'share') {
          scoreEl.innerText = `SCORE: ${opp.engine.score} | CHAIN: ${opp.engine.chain}`;
        } else {
          scoreEl.innerText = currentMode === 'single_survival' ? `WINS: ${currentSurvivalWins}` : `SCORE: ${opp.engine.score}`;
        }
      }
      updateGarbagePreview(opp.engine, `rival-garbage-preview-${i}`);
      updateRivalSkillBadge(opp, i);
      const pCard = document.getElementById(`inline-portrait-p${i + 1}`);
      if (pCard) pCard.classList.toggle('is-dead', !!opp.engine.gameOver);
    }
  });
  loopId = requestAnimationFrame(gameLoop);
}

// ==========================================
// 入力処理・タッチ/マウス/仮想左右キー/キーボード/パッド制御・レイアウト計算
// [Part 3 / 3]
// ==========================================
function toggleContinuousSwipe() {
  const cb = document.getElementById('continuous-swipe');
  if (!cb) return;
  cb.checked = !cb.checked;
  SE.play('cursorMove');
  showToast(`連続移動: ${cb.checked ? 'ON' : 'OFF'}`);
}

function createPlayerInputState() {
  return {
    padState: {}, prevPadState: {},
    padHoldFrames: { Up: 0, Down: 0, Left: 0, Right: 0 },
    padDirTime: {
      Up:    { held: false, startAt: 0, lastAt: 0, releaseAt: 0 },
      Down:  { held: false, startAt: 0, lastAt: 0, releaseAt: 0 },
      Left:  { held: false, startAt: 0, lastAt: 0, releaseAt: 0 },
      Right: { held: false, startAt: 0, lastAt: 0, releaseAt: 0 }
    },
    padLastPressAt: {},
    padWaitRelease: {},
    padGrabState: { active: false, side: 'left', col: 0, row: 0, consumed: false },
    keyGrabState: { active: false, side: 'left', col: 0, row: 0, consumed: false },
    keyHeld: { Up: false, Down: false, Left: false, Right: false },
    keyHoldFrames: { Up: 0, Down: 0, Left: 0, Right: 0 },
    keyDirTime: {
      Up:    { held: false, startAt: 0, lastAt: 0 },
      Down:  { held: false, startAt: 0, lastAt: 0 },
      Left:  { held: false, startAt: 0, lastAt: 0 },
      Right: { held: false, startAt: 0, lastAt: 0 }
    }
  };
}

let p1InputState = createPlayerInputState();
let padState = p1InputState.padState, prevPadState = p1InputState.prevPadState;
let padHoldFrames = p1InputState.padHoldFrames, padGrabState = p1InputState.padGrabState, keyGrabState = p1InputState.keyGrabState;
let touchRowFollowCallback = null, shareP2RowFollowCallback = null;
let p1BoardTouchCtrl = null;
const PAD_DAS_MS = 205, PAD_ARR_MS = 32, PAD_BOUNCE_MS = 65, PAD_DIR_RELEASE_MS = 28, PAD_DIR_MIN_INTERVAL_MS = 75;
const KEY_DAS_MS = 145, KEY_ARR_MS = 26;

function resetAllLocalInputStates() {
  p1InputState = createPlayerInputState();
  padState = p1InputState.padState; prevPadState = p1InputState.prevPadState;
  padHoldFrames = p1InputState.padHoldFrames; padGrabState = p1InputState.padGrabState; keyGrabState = p1InputState.keyGrabState;
  shareP2RowFollowCallback = null;
  stopRotateTouchHold();
}

function clearKeyboardHoldStates() {
  const clearState = (st) => {
    if (!st) return;
    if (st.keyGrabState) st.keyGrabState.active = st.keyGrabState.consumed = false;
    if (st.keyHeld) st.keyHeld = { Up: false, Down: false, Left: false, Right: false };
    if (st.keyHoldFrames) st.keyHoldFrames = { Up: 0, Down: 0, Left: 0, Right: 0 };
    if (st.keyDirTime) {
      st.keyDirTime = {
        Up:    { held: false, startAt: 0, lastAt: 0 },
        Down:  { held: false, startAt: 0, lastAt: 0 },
        Left:  { held: false, startAt: 0, lastAt: 0 },
        Right: { held: false, startAt: 0, lastAt: 0 }
      };
    }
  };
  clearState(p1InputState);
  opponents.forEach(opp => {
    if (opp && opp.inputState) clearState(opp.inputState);
  });
}

function handleMyRowPushed() {
  if (padGrabState.active && padGrabState.row > 0) padGrabState.row--;
  if (keyGrabState.active && keyGrabState.row > 0) keyGrabState.row--;
  if (touchRowFollowCallback) touchRowFollowCallback();
}

function cycleTargetForLocalOpponent(opp, dir = 1) {
  if (!opp || !opp.engine || opp.engine.gameOver || isMatchOver) return;
  const validIds = [null];
  if (myEngine && !myEngine.gameOver) validIds.push('player');
  opponents.forEach(o => { if (o.id !== opp.id && o.engine && !o.engine.gameOver) validIds.push(o.id); });
  if (validIds.length <= 1) return;
  let pos = validIds.indexOf(opp.targetId);
  if (pos === -1) pos = 0;
  opp.targetId = validIds[(pos + dir + validIds.length) % validIds.length];
  SE.play('cursorMove');
}

function resetPadDirTimeState(stateObj) {
  if (!stateObj || !stateObj.padDirTime) return;
  ['Up', 'Down', 'Left', 'Right'].forEach(d => {
    stateObj.padDirTime[d].held = false;
    stateObj.padDirTime[d].releaseAt = 0;
  });
}

function moveEngineCursorHoriz(engine, dx) {
  if (!engine) return false;
  const cols = engine.cols || COLS;
  if (engine.is3D) {
    engine.cursor.x = (engine.cursor.x + dx + cols) % cols;
    return true;
  }
  if (dx < 0 && engine.cursor.x > 0) {
    engine.cursor.x--;
    return true;
  }
  if (dx > 0 && engine.cursor.x < cols - 2) {
    engine.cursor.x++;
    return true;
  }
  return false;
}

function applyCursorForGrabbedCol(engine, col, side) {
  if (!engine) return;
  const cols = engine.cols || COLS;
  if (engine.is3D) {
    engine.cursor.x = (side === 'right') ? ((col - 1 + cols) % cols) : col;
  } else {
    const rawX = (side === 'right') ? (col - 1) : col;
    engine.cursor.x = Math.min(cols - 2, Math.max(0, rawX));
  }
}

function syncGrabColFromCursor(engine, grabState) {
  if (!engine || !grabState || !grabState.active) return;
  const cols = engine.cols || COLS;
  grabState.row = engine.cursor.y;
  grabState.col = grabState.side === 'left'
    ? engine.cursor.x
    : (engine.is3D ? (engine.cursor.x + 1) % cols : engine.cursor.x + 1);
  grabState.consumed = false;
}

function startGrabForEngine(engine, grabState, side) {
  if (!engine) return;
  const cols = engine.cols || COLS;
  grabState.active = true;
  grabState.side = side;
  grabState.col = side === 'left'
    ? engine.cursor.x
    : (engine.is3D ? (engine.cursor.x + 1) % cols : engine.cursor.x + 1);
  grabState.row = engine.cursor.y;
  grabState.consumed = false;
}

function executeGrabMoveForEngine(engine, grabState, dx) {
  if (!engine || !grabState.active || grabState.consumed) return false;
  const continuous = document.getElementById('continuous-swipe')?.checked;
  const cols = engine.cols || COLS;
  let swapped = false;

  if (engine.is3D) {
    if (dx > 0) {
      if (engine.swap(grabState.col, grabState.row)) {
        SE.play('cursorMove');
        grabState.col = (grabState.col + 1) % cols;
        swapped = true;
      }
    } else if (dx < 0) {
      const leftCol = (grabState.col - 1 + cols) % cols;
      if (engine.swap(leftCol, grabState.row)) {
        SE.play('cursorMove');
        grabState.col = leftCol;
        swapped = true;
      }
    }
    if (swapped) {
      applyCursorForGrabbedCol(engine, grabState.col, grabState.side);
      if (!continuous) grabState.consumed = true;
    }
  } else {
    if (dx > 0 && grabState.col < cols - 1) {
      if (engine.swap(grabState.col, grabState.row)) { SE.play('cursorMove'); grabState.col++; swapped = true; }
    } else if (dx < 0 && grabState.col > 0) {
      if (engine.swap(grabState.col - 1, grabState.row)) { SE.play('cursorMove'); grabState.col--; swapped = true; }
    }
    if (swapped) {
      applyCursorForGrabbedCol(engine, grabState.col, grabState.side);
      if (!continuous) grabState.consumed = true;
    }
  }
  return swapped;
}

function pollSingleGamepad(engine, cfgPad, stateObj, padObj, isMainPlayer, oppRef = null, now = performance.now(), renderer = null) {
  if (!padObj) {
    if (engine) engine.isRisingManualPad = false;
    stateObj.padHoldFrames = { Up: 0, Down: 0, Left: 0, Right: 0 };
    resetPadDirTimeState(stateObj);
    stateObj.padGrabState.active = stateObj.padGrabState.consumed = false;
    return;
  }
  stateObj.prevPadState = { ...stateObj.padState };
  padObj.buttons.forEach((b, i) => stateObj.padState[i] = !!b.pressed);

  if (stateObj.padWaitRelease) {
    Object.keys(stateObj.padWaitRelease).forEach(k => {
      if (!stateObj.padState[k]) delete stateObj.padWaitRelease[k];
    });
  }

  if (typeof padInputLockUntil !== 'undefined' && now < padInputLockUntil) {
    if (engine) engine.isRisingManualPad = false;
    resetPadDirTimeState(stateObj);
    return;
  }

  const isPressed = (btnIdx) => btnIdx !== null && btnIdx !== undefined && !!stateObj.padState[btnIdx];
  const justPressed = (btnIdx) => {
    if (btnIdx === null || btnIdx === undefined) return false;
    if (!stateObj.padState[btnIdx] || stateObj.prevPadState[btnIdx]) return false;
    if (stateObj.padWaitRelease && stateObj.padWaitRelease[btnIdx]) return false;
    const lastT = stateObj.padLastPressAt ? (stateObj.padLastPressAt[btnIdx] || 0) : 0;
    if (now - lastT < PAD_BOUNCE_MS) return false;
    if (stateObj.padLastPressAt) stateObj.padLastPressAt[btnIdx] = now;
    return true;
  };
  const setCenterCamera = () => {
    if (renderer && typeof renderer.setCameraMode === 'function') {
      renderer.setCameraMode('center');
    }
  };

  if (isMainPlayer && justPressed(cfgPad.Pause)) {
    if (isExitConfirmOpen) {
      closeExitConfirmModal();
      return;
    }
    if (document.getElementById('game-area').style.display === 'flex' && document.getElementById('result-overlay').style.display !== 'flex' && !battleEndState.active) {
      stateObj.padHoldFrames = { Up: 0, Down: 0, Left: 0, Right: 0 };
      resetPadDirTimeState(stateObj);
      stateObj.padGrabState.active = stateObj.padGrabState.consumed = false;
      exitGame();
      return;
    }
  }
  if (isExitConfirmOpen) {
    if (engine) engine.isRisingManualPad = false;
    resetPadDirTimeState(stateObj);
    return;
  }
  if (!engine || engine.gameOver || (isMatchOver && !isPracticeMode)) {
    stateObj.padHoldFrames = { Up: 0, Down: 0, Left: 0, Right: 0 };
    resetPadDirTimeState(stateObj);
    stateObj.padGrabState.active = stateObj.padGrabState.consumed = false;
    if (engine) engine.isRisingManualPad = false;
    return;
  }
  if (isMainPlayer && justPressed(cfgPad.ToggleContinuous)) toggleContinuousSwipe();
  if (justPressed(cfgPad.GrabLeft)) { setCenterCamera(); startGrabForEngine(engine, stateObj.padGrabState, 'left'); }
  else if (justPressed(cfgPad.GrabRight)) { setCenterCamera(); startGrabForEngine(engine, stateObj.padGrabState, 'right'); }
  if (stateObj.padGrabState.active) {
    if ((stateObj.padGrabState.side === 'left' && !isPressed(cfgPad.GrabLeft)) || (stateObj.padGrabState.side === 'right' && !isPressed(cfgPad.GrabRight))) {
      stateObj.padGrabState.active = stateObj.padGrabState.consumed = false;
    }
  }

  const checkDirTrigger = (dirName, btnIdx) => {
    const dt = stateObj.padDirTime[dirName];
    const down = isPressed(btnIdx);
    if (!down) {
      if (dt.held) {
        if (!dt.releaseAt) dt.releaseAt = now;
        if ((now - dt.releaseAt) >= PAD_DIR_RELEASE_MS) {
          dt.held = false;
          dt.releaseAt = 0;
        }
      }
      return false;
    }
    dt.releaseAt = 0;
    if (stateObj.padWaitRelease && stateObj.padWaitRelease[btnIdx]) {
      dt.held = true;
      dt.startAt = now;
      dt.lastAt = now;
      return false;
    }
    if (!dt.held) {
      const lastDirT = stateObj.padLastPressAt ? (stateObj.padLastPressAt[`dir_${dirName}`] || 0) : 0;
      dt.held = true;
      dt.startAt = now;
      dt.lastAt = now;
      if (now - lastDirT < PAD_DIR_MIN_INTERVAL_MS) return false;
      if (stateObj.padLastPressAt) stateObj.padLastPressAt[`dir_${dirName}`] = now;
      return true;
    }
    if ((now - dt.startAt) >= PAD_DAS_MS && (now - dt.lastAt) >= PAD_ARR_MS) {
      dt.lastAt = now;
      return true;
    }
    return false;
  };

  let moved = false;
  const rows = engine.rows || ROWS;
  if (isPressed(cfgPad.Up) && isPressed(cfgPad.Down)) {
    stateObj.padDirTime.Up.held = stateObj.padDirTime.Down.held = false;
    stateObj.padDirTime.Up.releaseAt = stateObj.padDirTime.Down.releaseAt = 0;
  } else {
    if (checkDirTrigger('Up', cfgPad.Up)) {
      setCenterCamera();
      if (engine.cursor.y > 0) {
        engine.cursor.y--; moved = true;
        syncGrabColFromCursor(engine, stateObj.padGrabState);
      }
    }
    if (checkDirTrigger('Down', cfgPad.Down)) {
      setCenterCamera();
      if (engine.cursor.y < rows - 1) {
        engine.cursor.y++; moved = true;
        syncGrabColFromCursor(engine, stateObj.padGrabState);
      }
    }
  }
  if (isPressed(cfgPad.Left) && isPressed(cfgPad.Right)) {
    stateObj.padDirTime.Left.held = stateObj.padDirTime.Right.held = false;
    stateObj.padDirTime.Left.releaseAt = stateObj.padDirTime.Right.releaseAt = 0;
  } else {
    if (checkDirTrigger('Left', cfgPad.Left)) {
      setCenterCamera();
      if (stateObj.padGrabState.active) executeGrabMoveForEngine(engine, stateObj.padGrabState, -1);
      else if (moveEngineCursorHoriz(engine, -1)) moved = true;
    }
    if (checkDirTrigger('Right', cfgPad.Right)) {
      setCenterCamera();
      if (stateObj.padGrabState.active) executeGrabMoveForEngine(engine, stateObj.padGrabState, 1);
      else if (moveEngineCursorHoriz(engine, 1)) moved = true;
    }
  }
  if (moved) SE.play('cursorMove');
  if (justPressed(cfgPad.Swap)) {
    setCenterCamera();
    engine.swap(engine.cursor.x, engine.cursor.y);
  }
  engine.isRisingManualPad = !!(isPressed(cfgPad.Rise1) || isPressed(cfgPad.Rise2));
  if (isMainPlayer) {
    if (justPressed(cfgPad.TargetRight)) cycleTarget(1);
    if (justPressed(cfgPad.TargetLeft)) cycleTarget(-1);
    if (justPressed(cfgPad.Skill)) activatePlayerSkill();
  } else if (oppRef) {
    if (justPressed(cfgPad.TargetRight)) cycleTargetForLocalOpponent(oppRef, 1);
    if (justPressed(cfgPad.TargetLeft)) cycleTargetForLocalOpponent(oppRef, -1);
    if (justPressed(cfgPad.Skill)) activateLocalOpponentSkill(oppRef);
  }
}

function pollSingleKeyboardHold(engine, stateObj, now = performance.now(), renderer = null) {
  if (!engine || !stateObj || !stateObj.keyHeld) return;
  if (isExitConfirmOpen || engine.gameOver || (isMatchOver && !isPracticeMode)) {
    stateObj.keyHoldFrames = { Up: 0, Down: 0, Left: 0, Right: 0 };
    if (stateObj.keyDirTime) {
      ['Up', 'Down', 'Left', 'Right'].forEach(d => { stateObj.keyDirTime[d].held = false; });
    }
    return;
  }
  if (typeof getCurrentPadContextKey === 'function' && getCurrentPadContextKey() !== 'game') return;

  const setCenterCamera = () => {
    if (renderer && typeof renderer.setCameraMode === 'function') {
      renderer.setCameraMode('center');
    }
  };
  const checkKeyDirRepeat = (dirName) => {
    const dt = stateObj.keyDirTime[dirName];
    if (!stateObj.keyHeld[dirName]) {
      dt.held = false;
      return false;
    }
    if (!dt.held) {
      dt.held = true;
      dt.startAt = now;
      dt.lastAt = now;
      return false;
    }
    if ((now - dt.startAt) >= KEY_DAS_MS && (now - dt.lastAt) >= KEY_ARR_MS) {
      dt.lastAt = now;
      return true;
    }
    return false;
  };
  let moved = false;
  const rows = engine.rows || ROWS;
  if (stateObj.keyHeld.Up && stateObj.keyHeld.Down) {
    stateObj.keyDirTime.Up.held = stateObj.keyDirTime.Down.held = false;
  } else {
    if (checkKeyDirRepeat('Up')) {
      setCenterCamera();
      if (engine.cursor.y > 0) {
        engine.cursor.y--; moved = true;
        syncGrabColFromCursor(engine, stateObj.keyGrabState);
      }
    }
    if (checkKeyDirRepeat('Down')) {
      setCenterCamera();
      if (engine.cursor.y < rows - 1) {
        engine.cursor.y++; moved = true;
        syncGrabColFromCursor(engine, stateObj.keyGrabState);
      }
    }
  }
  if (stateObj.keyHeld.Left && stateObj.keyHeld.Right) {
    stateObj.keyDirTime.Left.held = stateObj.keyDirTime.Right.held = false;
  } else {
    if (checkKeyDirRepeat('Left')) {
      setCenterCamera();
      if (stateObj.keyGrabState.active) executeGrabMoveForEngine(engine, stateObj.keyGrabState, -1);
      else if (moveEngineCursorHoriz(engine, -1)) moved = true;
    }
    if (checkKeyDirRepeat('Right')) {
      setCenterCamera();
      if (stateObj.keyGrabState.active) executeGrabMoveForEngine(engine, stateObj.keyGrabState, 1);
      else if (moveEngineCursorHoriz(engine, 1)) moved = true;
    }
  }
  if (moved) SE.play('cursorMove');
}

function pollKeyboardHoldInput(now = performance.now()) {
  pollSingleKeyboardHold(myEngine, p1InputState, now, myRenderer);
  if (currentMode === 'local' || currentMode === 'share') {
    opponents.forEach(opp => {
      if (opp.type === 'local_human' && opp.inputState) pollSingleKeyboardHold(opp.engine, opp.inputState, now, opp.renderer);
    });
  }
}

function pollGamepadInput(now = performance.now()) {
  const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()) : [];
  if (battleEndState.active) {
    const anyPressed = pads.some(p => p && p.connected && p.buttons.some(b => b.pressed));
    if (anyPressed && !battleEndState.prevAnyPadPressed) tryDismissBattleEndOverlay();
    battleEndState.prevAnyPadPressed = anyPressed;
    return;
  }
  if (typeof getCurrentPadContextKey === 'function' && getCurrentPadContextKey() !== 'game') {
    const pad0 = getPad0Object(pads);
    if (pad0) {
      p1InputState.padState = readPadButtonsMap(pad0);
      p1InputState.prevPadState = { ...p1InputState.padState };
    }
    return;
  }
  const slot0 = playerConfigs[0].padSlot;
  let pad0 = null;
  if (slot0 >= 0 && pads[slot0]) {
    pad0 = pads[slot0];
  } else if (slot0 === 0 && currentMode !== 'local' && currentMode !== 'share') {
    pad0 = pads.find(p => p && p.connected) || null;
  }
  pollSingleGamepad(myEngine, playerConfigs[0].pad, p1InputState, pad0, true, null, now, myRenderer);
  if (currentMode === 'local' || currentMode === 'share') {
    opponents.forEach(opp => {
      if (opp.type === 'local_human' && opp.inputState) {
        const slot = playerConfigs[opp.playerSlotIndex].padSlot;
        pollSingleGamepad(opp.engine, playerConfigs[opp.playerSlotIndex].pad, opp.inputState, (slot >= 0 && pads[slot]) ? pads[slot] : null, false, opp, now, opp.renderer);
      }
    });
  }
}

function handleKeyboardActionForPlayer(engine, cfgKey, stateObj, code, isRepeat, isMainPlayer, oppRef, e, renderer = null) {
  if (!engine || engine.gameOver || (isMatchOver && !isPracticeMode)) return false;
  let handled = false, moved = false;
  const now = performance.now();
  const rows = engine.rows || ROWS;
  const setCenterCamera = () => {
    if (renderer && typeof renderer.setCameraMode === 'function') {
      renderer.setCameraMode('center');
    }
  };
  if (isMainPlayer && code === cfgKey.ToggleContinuous) { handled = true; if (!isRepeat) toggleContinuousSwipe(); }
  if (code === cfgKey.GrabLeft) { handled = true; if (!isRepeat) { setCenterCamera(); startGrabForEngine(engine, stateObj.keyGrabState, 'left'); } }
  if (code === cfgKey.GrabRight) { handled = true; if (!isRepeat) { setCenterCamera(); startGrabForEngine(engine, stateObj.keyGrabState, 'right'); } }
  if (code === cfgKey.Up) {
    handled = true;
    if (!isRepeat) {
      setCenterCamera();
      stateObj.keyHeld.Up = true; stateObj.keyHoldFrames.Up = 1;
      if (stateObj.keyDirTime) stateObj.keyDirTime.Up = { held: true, startAt: now, lastAt: now };
      if (engine.cursor.y > 0) {
        engine.cursor.y--; moved = true;
        syncGrabColFromCursor(engine, stateObj.keyGrabState);
      }
    }
  }
  if (code === cfgKey.Down) {
    handled = true;
    if (!isRepeat) {
      setCenterCamera();
      stateObj.keyHeld.Down = true; stateObj.keyHoldFrames.Down = 1;
      if (stateObj.keyDirTime) stateObj.keyDirTime.Down = { held: true, startAt: now, lastAt: now };
      if (engine.cursor.y < rows - 1) {
        engine.cursor.y++; moved = true;
        syncGrabColFromCursor(engine, stateObj.keyGrabState);
      }
    }
  }
  if (code === cfgKey.Left) {
    handled = true;
    if (!isRepeat) {
      setCenterCamera();
      stateObj.keyHeld.Left = true; stateObj.keyHoldFrames.Left = 1;
      if (stateObj.keyDirTime) stateObj.keyDirTime.Left = { held: true, startAt: now, lastAt: now };
      if (stateObj.keyGrabState.active) executeGrabMoveForEngine(engine, stateObj.keyGrabState, -1);
      else if (moveEngineCursorHoriz(engine, -1)) moved = true;
    }
  }
  if (code === cfgKey.Right) {
    handled = true;
    if (!isRepeat) {
      setCenterCamera();
      stateObj.keyHeld.Right = true; stateObj.keyHoldFrames.Right = 1;
      if (stateObj.keyDirTime) stateObj.keyDirTime.Right = { held: true, startAt: now, lastAt: now };
      if (stateObj.keyGrabState.active) executeGrabMoveForEngine(engine, stateObj.keyGrabState, 1);
      else if (moveEngineCursorHoriz(engine, 1)) moved = true;
    }
  }
  if (moved) SE.play('cursorMove');
  if (code === cfgKey.Swap) {
    handled = true;
    setCenterCamera();
    engine.swap(engine.cursor.x, engine.cursor.y);
  }
  if (code === cfgKey.Rise1 || code === cfgKey.Rise2) { handled = true; engine.isRisingManualKey = true; }
  if (isMainPlayer) {
    if (code === cfgKey.TargetRight) { handled = true; cycleTarget(1); }
    if (code === cfgKey.TargetLeft) { handled = true; cycleTarget(-1); }
    if (code === cfgKey.Skill) { handled = true; if (!isRepeat) activatePlayerSkill(); }
  } else if (oppRef) {
    if (code === cfgKey.TargetRight) { handled = true; cycleTargetForLocalOpponent(oppRef, 1); }
    if (code === cfgKey.TargetLeft) { handled = true; cycleTargetForLocalOpponent(oppRef, -1); }
    if (code === cfgKey.Skill) { handled = true; if (!isRepeat) activateLocalOpponentSkill(oppRef); }
  }
  if (handled) e.preventDefault();
  return handled;
}
function handleLocalMenuKeyInput(code, e) {
  const count = getLocalPlayerCount();
  const cfg0 = playerConfigs[0].key;
  if (cfg0 && code === cfg0.Pause && keyConfig.Pause !== 'Escape') {
    e.preventDefault();
    forceConfirmAllAndStartLocal();
    return true;
  }

  for (let slotIdx = 1; slotIdx < count; slotIdx++) {
    const slot = localSlotsConfig[slotIdx];
    if (slot.isCom) continue;
    const cfg = playerConfigs[slotIdx].key;
    if (!cfg) continue;
    if (code === cfg.Left)  { e.preventDefault(); moveLocalTileCursor(slotIdx, -1, 0, 'kb'); return true; }
    if (code === cfg.Right) { e.preventDefault(); moveLocalTileCursor(slotIdx, 1, 0, 'kb');  return true; }
    if (code === cfg.Up)    { e.preventDefault(); moveLocalTileCursor(slotIdx, 0, -1, 'kb'); return true; }
    if (code === cfg.Down)  { e.preventDefault(); moveLocalTileCursor(slotIdx, 0, 1, 'kb');  return true; }
    if (code === cfg.Swap || code === cfg.GrabRight) {
      e.preventDefault();
      if (slot.phase === 'char') confirmLocalCharForSlot(slotIdx, slot.charCursorIdx, 'kb');
      else if (slot.phase === 'skill') confirmLocalSkillForSlot(slotIdx, slot.skillCursorIdx, 'kb');
      return true;
    }
    if (code === cfg.Skill || code === cfg.GrabLeft) {
      e.preventDefault();
      cancelLocalStepForSlot(slotIdx);
      return true;
    }
  }

  const isUp = (code === 'ArrowUp' || (cfg0 && code === cfg0.Up));
  const isDown = (code === 'ArrowDown' || (cfg0 && code === cfg0.Down));
  const isLeft = (code === 'ArrowLeft' || (cfg0 && code === cfg0.Left));
  const isRight = (code === 'ArrowRight' || (cfg0 && code === cfg0.Right));
  const isConfirm = (code === 'Enter' || code === 'Space' || (cfg0 && (code === cfg0.Swap || code === cfg0.GrabRight)));
  const isCancel = (code === 'Escape' || (cfg0 && (code === cfg0.Skill || code === cfg0.GrabLeft)));

  if (!isUp && !isDown && !isLeft && !isRight && !isConfirm && !isCancel) return false;

  const domActive = document.activeElement && document.activeElement.closest('#local-menu') && !document.activeElement.classList.contains('local-select-tile');
  if (domActive) {
    e.preventDefault();
    localDomNavOwner = 'kb';
    return handleLocalDomNavigation({
      up: isUp, down: isDown, left: isLeft, right: isRight,
      confirm: isConfirm, cancel: isCancel
    }, 'kb');
  }

  const targetSlot = activeLocalTouchActor;
  const slot = localSlotsConfig[targetSlot];
  if (!slot) return false;

  e.preventDefault();
  if (slot.phase === 'ready') {
    if (isCancel) {
      cancelLocalStepForSlot(targetSlot);
      return true;
    }
    if (isUp || isDown || isLeft || isRight) {
      const fallbackBtn = document.querySelector(`[data-local-focus-id="slot-edit-${targetSlot}"]`) || getLocalDomFocusables()[0];
      if (fallbackBtn) {
        localDomNavOwner = 'kb';
        fallbackBtn.focus({ preventScroll: true });
        SE.play('cursorMove');
      }
      return true;
    }
    return false;
  }

  if (isLeft)  { moveLocalTileCursor(targetSlot, -1, 0, 'kb'); return true; }
  if (isRight) { moveLocalTileCursor(targetSlot, 1, 0, 'kb');  return true; }
  if (isUp)    { moveLocalTileCursor(targetSlot, 0, -1, 'kb'); return true; }
  if (isDown)  { moveLocalTileCursor(targetSlot, 0, 1, 'kb');  return true; }
  if (isConfirm) {
    if (slot.phase === 'char') confirmLocalCharForSlot(targetSlot, slot.charCursorIdx, 'kb');
    else if (slot.phase === 'skill') confirmLocalSkillForSlot(targetSlot, slot.skillCursorIdx, 'kb');
    return true;
  }
  if (isCancel) {
    if (slot.phase !== 'char') cancelLocalStepForSlot(targetSlot);
    else if (targetSlot !== 0) {
      activeLocalTouchActor = 0;
      SE.play('cancel');
      renderLocalMenuUI();
    } else {
      handleMenuCancelAction();
    }
    return true;
  }
  return false;
}

function getCanvasCoordsFromPointer(cvs, e, isSelf180Rotated = false) {
  const rect = cvs.getBoundingClientRect();
  const isParent90Rotated = document.body.classList.contains('local-force-landscape') || document.body.classList.contains('share-force-portrait');
  if (isParent90Rotated) {
    if (isSelf180Rotated) return { x: ((rect.bottom - e.clientY) / rect.height) * cvs.width, y: ((e.clientX - rect.left) / rect.width) * cvs.height };
    return { x: ((e.clientY - rect.top) / rect.height) * cvs.width, y: ((rect.right - e.clientX) / rect.width) * cvs.height };
  }
  if (isSelf180Rotated) return { x: ((rect.right - e.clientX) / rect.width) * cvs.width, y: ((rect.bottom - e.clientY) / rect.height) * cvs.height };
  return { x: (e.clientX - rect.left) * (cvs.width / rect.width), y: (e.clientY - rect.top) * (cvs.height / rect.height) };
}

function bindBoardTouchInput(cvs, getEngine, getContinuousChecked, isSelf180Rotated, setRowFollowCb, getRenderer = null) {
  const LONG_PRESS_MS = 180;
  const DRAG_THRESHOLD_PX = 10;
  const EDGE_ZONE_PX = 28;
  const EDGE_ROTATE_INTERVAL_MS = 145;

  let activePointerId = null, grabbedCol = -1, grabbedRow = -1;
  let initialCanvasX = 0, initialCanvasY = 0;
  let lastCanvasX = 0, lastSwapCanvasX = 0, lastPointerMoveX = 0;
  let dragMode = 'swap', suppressTapOnUp = false, cursorMovedOnDown = false;
  let longPressTimer = null, edgeDragTimer = null;
  let lastDragDir = 0, lastEdgeStepAt = 0;
  let wheelAccum = 0, lastWheelResetAt = 0, lastWheelStepAt = 0;
  let downCol = -1, downRow = -1, startedInCursor = false, downHasBlock = false, grabConsumed = false;

  const setViewportCameraMode = () => {
    const renderer = typeof getRenderer === 'function' ? getRenderer() : null;
    if (renderer && typeof renderer.setCameraMode === 'function') {
      renderer.setCameraMode('viewport');
    }
  };

  const setFreeCameraMode = () => {
    const renderer = typeof getRenderer === 'function' ? getRenderer() : null;
    if (renderer && typeof renderer.setCameraMode === 'function') {
      renderer.setCameraMode('free');
    }
  };

  const clearLongPressTimer = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  };

  const stopEdgeDragTimer = () => {
    if (edgeDragTimer) {
      clearInterval(edgeDragTimer);
      edgeDragTimer = null;
    }
  };

  const getActiveEdgeDir = (ptX) => {
    if (ptX >= cvs.width - EDGE_ZONE_PX && lastDragDir > 0) return 1;
    if (ptX <= EDGE_ZONE_PX && lastDragDir < 0) return -1;
    return 0;
  };

  const stepGrabSwap = (dir, isRepeatCall = false) => {
    const engine = getEngine();
    if (!engine || (isMatchOver && !isPracticeMode) || activePointerId === null || dragMode !== 'swap') return false;
    if (grabConsumed) return false;
    const cols = engine.cols || COLS;
    const continuous = getContinuousChecked();
    if (isRepeatCall && !continuous) return false;

    setViewportCameraMode();

    if (engine.is3D) {
      if (dir > 0) {
        const swapCol = grabbedCol;
        if (engine.swap(swapCol, grabbedRow)) {
          SE.play('cursorMove');
          grabbedCol = (grabbedCol + 1) % cols;
          engine.cursor.x = swapCol;
          engine.cursor.y = grabbedRow;
          if (engine.touchGrab && engine.touchGrab.active) {
            engine.touchGrab = { active: true, col: grabbedCol, row: grabbedRow };
          }
          suppressTapOnUp = true;
          if (!continuous) grabConsumed = true;
          return true;
        }
      } else {
        const swapCol = (grabbedCol - 1 + cols) % cols;
        if (engine.swap(swapCol, grabbedRow)) {
          SE.play('cursorMove');
          grabbedCol = swapCol;
          engine.cursor.x = swapCol;
          engine.cursor.y = grabbedRow;
          if (engine.touchGrab && engine.touchGrab.active) {
            engine.touchGrab = { active: true, col: grabbedCol, row: grabbedRow };
          }
          suppressTapOnUp = true;
          if (!continuous) grabConsumed = true;
          return true;
        }
      }
      return false;
    }

    if (dir > 0 && grabbedCol < cols - 1) {
      const swapCol = grabbedCol;
      if (engine.swap(swapCol, grabbedRow)) {
        SE.play('cursorMove');
        grabbedCol++;
        engine.cursor.x = swapCol;
        engine.cursor.y = grabbedRow;
        suppressTapOnUp = true;
        return true;
      }
    } else if (dir < 0 && grabbedCol > 0) {
      const swapCol = grabbedCol - 1;
      if (engine.swap(swapCol, grabbedRow)) {
        SE.play('cursorMove');
        grabbedCol--;
        engine.cursor.x = swapCol;
        engine.cursor.y = grabbedRow;
        suppressTapOnUp = true;
        return true;
      }
    }
    return false;
  };

  const performEdgeStep = () => {
    const engine = getEngine();
    if (!engine || !engine.is3D || activePointerId === null || (isMatchOver && !isPracticeMode) || isExitConfirmOpen) {
      stopEdgeDragTimer();
      return;
    }
    const edgeDir = getActiveEdgeDir(lastPointerMoveX);
    if (edgeDir === 0) return;

    const now = performance.now();
    if (now - lastEdgeStepAt < EDGE_ROTATE_INTERVAL_MS) return;

    const renderer = typeof getRenderer === 'function' ? getRenderer() : null;
    const cols = engine.cols || COLS_3D;

    if (dragMode === 'rotate') {
      setFreeCameraMode();
      engine.cursor.x = ((engine.cursor.x - edgeDir) % cols + cols) % cols;
      if (renderer && typeof renderer.shiftViewCol === 'function') {
        renderer.shiftViewCol(engine, -edgeDir);
      }
      suppressTapOnUp = true;
      lastEdgeStepAt = now;
      SE.play('cursorMove');
    } else if (dragMode === 'swap') {
      if (stepGrabSwap(edgeDir, true)) {
        if (renderer && typeof renderer.shiftViewCol === 'function') {
          renderer.shiftViewCol(engine, edgeDir);
        }
        lastSwapCanvasX = lastPointerMoveX;
        lastEdgeStepAt = now;
      }
    }
  };

  const ensureEdgeDragTimer = () => {
    if (edgeDragTimer) return;
    edgeDragTimer = setInterval(performEdgeStep, 30);
  };

  const clearGrabMode = () => {
    clearLongPressTimer();
    stopEdgeDragTimer();
    grabConsumed = false;
    lastDragDir = 0;
    const engine = getEngine();
    if (engine && engine.touchGrab) {
      engine.touchGrab = null;
    }
  };

  const enter3DGrabMode = (engine) => {
    clearLongPressTimer();
    if (!engine || !engine.is3D || (isMatchOver && !isPracticeMode)) return;
    const cols = engine.cols || COLS_3D;
    setViewportCameraMode();
    dragMode = 'swap';
    suppressTapOnUp = true;
    grabConsumed = false;
    lastEdgeStepAt = performance.now();
    engine.cursor.y = grabbedRow;
    const rightCol = (engine.cursor.x + 1) % cols;
    if (grabbedCol !== engine.cursor.x && grabbedCol !== rightCol) {
      engine.cursor.x = (lastDragDir < 0) ? ((grabbedCol - 1 + cols) % cols) : grabbedCol;
    }
    engine.touchGrab = { active: true, col: grabbedCol, row: grabbedRow };
    SE.play('cursorMove');
    if (typeof triggerSwapVibration === 'function' && typeof getMainPlayerPadSlot === 'function') {
      triggerSwapVibration(false, getMainPlayerPadSlot());
    }
  };

  if (setRowFollowCb) {
    setRowFollowCb(() => {
      if (activePointerId !== null && grabbedRow > 0) {
        grabbedRow--;
        const engine = getEngine();
        if (engine && engine.touchGrab && engine.touchGrab.active) {
          engine.touchGrab.row = grabbedRow;
        }
      }
    });
  }

  cvs.addEventListener('pointerdown', (e) => {
    if (e.cancelable) e.preventDefault();
    if (isExitConfirmOpen) return;
    const engine = getEngine();
    if (!engine || (isMatchOver && !isPracticeMode) || activePointerId !== null) return;
    activePointerId = e.pointerId;
    suppressTapOnUp = false;
    cursorMovedOnDown = false;
    grabConsumed = false;
    lastDragDir = 0;
    lastEdgeStepAt = 0;
    clearLongPressTimer();
    stopEdgeDragTimer();
    try { cvs.setPointerCapture(e.pointerId); } catch (_) {}
    const pt = getCanvasCoordsFromPointer(cvs, e, isSelf180Rotated);
    initialCanvasX = pt.x; initialCanvasY = pt.y;
    lastCanvasX = pt.x;
    lastSwapCanvasX = pt.x;
    lastPointerMoveX = pt.x;

    const renderer = typeof getRenderer === 'function' ? getRenderer() : null;
    const cols = engine.cols || COLS;
    const rows = engine.rows || ROWS;

    if (engine.is3D) {
      if (renderer && typeof renderer.getCellFromCanvasPoint === 'function') {
        const cell = renderer.getCellFromCanvasPoint(engine, pt.x, pt.y);
        downCol = cell.col;
        downRow = cell.row;
      } else {
        downCol = Math.max(0, Math.min(cols - 1, Math.floor(pt.x / CELL_PX)));
        downRow = Math.max(0, Math.min(rows - 1, Math.floor((pt.y + engine.riseOffset * CELL_PX) / CELL_PX)));
      }
      grabbedCol = downCol;
      grabbedRow = downRow;
      const rightCol = (engine.cursor.x + 1) % cols;
      startedInCursor = (downRow === engine.cursor.y && (downCol === engine.cursor.x || downCol === rightCol));
      const bHere = engine.grid[downRow] && engine.grid[downRow][downCol];
      downHasBlock = !!(bHere && bHere.type !== 'garbage');

      if (downHasBlock) {
        dragMode = 'pending_block';
        const capturedPid = e.pointerId;
        longPressTimer = setTimeout(() => {
          longPressTimer = null;
          if (activePointerId !== capturedPid || dragMode !== 'pending_block') return;
          enter3DGrabMode(getEngine());
        }, LONG_PRESS_MS);
      } else {
        dragMode = 'rotate';
      }
      return;
    }

    grabbedCol = Math.max(0, Math.min(cols - 1, Math.floor(pt.x / CELL_PX)));
    grabbedRow = Math.max(0, Math.min(rows - 1, Math.floor((pt.y + engine.riseOffset * CELL_PX) / CELL_PX)));
    dragMode = 'swap';
    const curRight = engine.cursor.x + 1;
    if (grabbedCol !== engine.cursor.x && grabbedCol !== curRight) {
      const nextX = Math.max(0, Math.min(cols - 2, grabbedCol));
      if (engine.cursor.x !== nextX) cursorMovedOnDown = true;
      engine.cursor.x = nextX;
    }
    if (engine.cursor.y !== grabbedRow) {
      engine.cursor.y = grabbedRow;
      cursorMovedOnDown = true;
    }
  });

  cvs.addEventListener('pointermove', (e) => {
    if (e.pointerId !== activePointerId) return;
    const engine = getEngine();
    if (!engine || (isMatchOver && !isPracticeMode)) return;
    const pt = getCanvasCoordsFromPointer(cvs, e, isSelf180Rotated);
    const continuous = getContinuousChecked();

    if (engine.is3D) {
      const cols = engine.cols || COLS_3D;
      const renderer = typeof getRenderer === 'function' ? getRenderer() : null;
      const moveDeltaFromPrev = pt.x - lastPointerMoveX;
      if (Math.abs(moveDeltaFromPrev) >= 2) {
        lastDragDir = moveDeltaFromPrev > 0 ? 1 : -1;
      }
      lastPointerMoveX = pt.x;

      if (dragMode === 'pending_block') {
        const dxStart = pt.x - initialCanvasX;
        const dyStart = pt.y - initialCanvasY;
        if (Math.abs(dxStart) >= DRAG_THRESHOLD_PX) {
          lastDragDir = dxStart > 0 ? 1 : -1;
          enter3DGrabMode(engine);
          lastSwapCanvasX = initialCanvasX;
        } else if (Math.abs(dyStart) >= 22) {
          clearLongPressTimer();
          suppressTapOnUp = true;
          return;
        } else {
          return;
        }
      }

      if (dragMode === 'rotate') {
        if (!suppressTapOnUp && Math.abs(pt.x - initialCanvasX) < DRAG_THRESHOLD_PX) {
          return;
        }
        const stepPx = 34;
        const diffPx = pt.x - lastCanvasX;
        if (Math.abs(diffPx) >= stepPx) {
          const steps = Math.trunc(diffPx / stepPx);
          lastCanvasX += steps * stepPx;
          setFreeCameraMode();
          engine.cursor.x = ((engine.cursor.x - steps) % cols + cols) % cols;
          if (renderer && typeof renderer.shiftViewCol === 'function') {
            renderer.shiftViewCol(engine, -steps);
          }
          suppressTapOnUp = true;
          lastEdgeStepAt = performance.now();
          SE.play('cursorMove');
        }
        if (getActiveEdgeDir(pt.x) !== 0) ensureEdgeDragTimer();
        else stopEdgeDragTimer();
        return;
      }

      if (dragMode === 'swap') {
        const edgeDir = getActiveEdgeDir(pt.x);
        if (edgeDir !== 0) {
          if (renderer && typeof renderer.getCellFromCanvasPoint === 'function') {
            const cell = renderer.getCellFromCanvasPoint(engine, pt.x, pt.y);
            const diff = ((cell.col - grabbedCol + cols * 1.5) % cols) - cols * 0.5;
            if (edgeDir > 0 && diff > 0) {
              const steps = Math.min(3, Math.round(diff));
              for (let s = 0; s < steps; s++) {
                if (!stepGrabSwap(1, false)) break;
                lastSwapCanvasX = pt.x;
                lastEdgeStepAt = performance.now();
                if (!continuous) break;
              }
            } else if (edgeDir < 0 && diff < 0) {
              const steps = Math.min(3, Math.round(-diff));
              for (let s = 0; s < steps; s++) {
                if (!stepGrabSwap(-1, false)) break;
                lastSwapCanvasX = pt.x;
                lastEdgeStepAt = performance.now();
                if (!continuous) break;
              }
            }
          }
          ensureEdgeDragTimer();
          return;
        }

        stopEdgeDragTimer();
        if (renderer && typeof renderer.getCellFromCanvasPoint === 'function') {
          const cell = renderer.getCellFromCanvasPoint(engine, pt.x, pt.y);
          const diff = ((cell.col - grabbedCol + cols * 1.5) % cols) - cols * 0.5;
          const moveDiff = pt.x - lastSwapCanvasX;
          if (diff > 0 && moveDiff >= 12) {
            const steps = Math.min(3, Math.round(diff));
            for (let s = 0; s < steps; s++) {
              if (!stepGrabSwap(1, false)) break;
              lastSwapCanvasX = pt.x;
              if (!continuous) break;
            }
          } else if (diff < 0 && moveDiff <= -12) {
            const steps = Math.min(3, Math.round(-diff));
            for (let s = 0; s < steps; s++) {
              if (!stepGrabSwap(-1, false)) break;
              lastSwapCanvasX = pt.x;
              if (!continuous) break;
            }
          }
          return;
        }

        const stepPx = 34;
        const diffPx = pt.x - lastCanvasX;
        if (Math.abs(diffPx) < stepPx) return;
        const steps = Math.trunc(diffPx / stepPx);
        lastCanvasX += steps * stepPx;
        const dir = steps > 0 ? 1 : -1;
        const count = Math.abs(steps);
        for (let s = 0; s < count; s++) {
          if (!stepGrabSwap(dir, false)) break;
          lastSwapCanvasX = pt.x;
          if (!continuous) break;
        }
        return;
      }
      return;
    }

    let targetCol = Math.max(0, Math.min((engine.cols || COLS) - 1, Math.floor(pt.x / CELL_PX)));
    while (targetCol > grabbedCol) {
      if (!stepGrabSwap(1, false)) break;
      if (!continuous) { activePointerId = null; break; }
    }
    while (targetCol < grabbedCol) {
      if (!stepGrabSwap(-1, false)) break;
      if (!continuous) { activePointerId = null; break; }
    }
  });

  const endPointer = (e, isTapCandidate) => {
    if (e.pointerId !== activePointerId) return;
    const prevMode = dragMode;
    clearGrabMode();
    activePointerId = null;
    try { cvs.releasePointerCapture(e.pointerId); } catch (_) {}
    const engine = getEngine();
    if (!isTapCandidate || suppressTapOnUp || (engine && engine.is3D && prevMode === 'swap') || !engine || (isMatchOver && !isPracticeMode)) {
      return;
    }
    const pt = getCanvasCoordsFromPointer(cvs, e, isSelf180Rotated);
    if (Math.abs(pt.x - initialCanvasX) < CELL_PX * 0.32 && Math.abs(pt.y - initialCanvasY) < CELL_PX * 0.32) {
      const cols = engine.cols || COLS;
      const rows = engine.rows || ROWS;
      if (engine.is3D) {
        setViewportCameraMode();
        if (downHasBlock) {
          if (startedInCursor) {
            engine.swap(engine.cursor.x, engine.cursor.y);
          } else {
            if (engine.cursor.x !== downCol || engine.cursor.y !== downRow) SE.play('cursorMove');
            engine.cursor.x = downCol;
            engine.cursor.y = downRow;
          }
        } else {
          const rightCol = (engine.cursor.x + 1) % cols;
          const rowArr = engine.grid[engine.cursor.y];
          const curHasSwappable = !!(rowArr && (
            (rowArr[engine.cursor.x] && rowArr[engine.cursor.x].type !== 'garbage') ||
            (rowArr[rightCol] && rowArr[rightCol].type !== 'garbage')
          ));
          if (startedInCursor && curHasSwappable) {
            engine.swap(engine.cursor.x, engine.cursor.y);
          } else {
            if (engine.cursor.x !== downCol || engine.cursor.y !== downRow) SE.play('cursorMove');
            engine.cursor.x = downCol;
            engine.cursor.y = downRow;
          }
        }
        return;
      }

      const c = Math.max(0, Math.min(cols - 2, Math.floor(pt.x / CELL_PX)));
      const r = Math.max(0, Math.min(rows - 1, Math.floor((pt.y + engine.riseOffset * CELL_PX) / CELL_PX)));
      const rightCol = engine.cursor.x + 1;
      const alreadyInCursor = (c === engine.cursor.x || c === rightCol);
      if (alreadyInCursor) {
        if (cursorMovedOnDown || engine.cursor.y !== r) SE.play('cursorMove');
        engine.cursor.y = r;
      } else {
        if (cursorMovedOnDown || engine.cursor.x !== c || engine.cursor.y !== r) SE.play('cursorMove');
        engine.cursor.x = c;
        engine.cursor.y = r;
      }
    }
  };
  cvs.addEventListener('pointerup', (e) => endPointer(e, true));
  cvs.addEventListener('pointercancel', (e) => endPointer(e, false));

  cvs.addEventListener('wheel', (e) => {
    const engine = getEngine();
    if (!engine || !engine.is3D) return;
    if (e.cancelable) e.preventDefault();
    if (isExitConfirmOpen || engine.endAnim || engine.gameOver || (isMatchOver && !isPracticeMode)) return;

    const rawDelta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (Math.abs(rawDelta) < 1) return;

    const now = performance.now();
    if (now - lastWheelResetAt > 240) {
      wheelAccum = 0;
    }
    lastWheelResetAt = now;

    let stepDir = 0;
    if (Math.abs(rawDelta) >= 40) {
      if (now - lastWheelStepAt < 45) return;
      stepDir = rawDelta > 0 ? 1 : -1;
      wheelAccum = 0;
    } else {
      wheelAccum += rawDelta;
      if (Math.abs(wheelAccum) < 45) return;
      if (now - lastWheelStepAt < 55) return;
      stepDir = wheelAccum > 0 ? 1 : -1;
      wheelAccum -= stepDir * 45;
    }

    lastWheelStepAt = now;
    const renderer = typeof getRenderer === 'function' ? getRenderer() : null;
    const cols = engine.cols || COLS_3D;

    if (activePointerId !== null && dragMode === 'swap') {
      if (stepGrabSwap(stepDir, true)) {
        if (renderer && typeof renderer.shiftViewCol === 'function') {
          renderer.shiftViewCol(engine, stepDir);
        }
        lastSwapCanvasX = lastPointerMoveX;
        lastEdgeStepAt = now;
      }
      return;
    }

    setFreeCameraMode();
    engine.cursor.x = ((engine.cursor.x + stepDir) % cols + cols) % cols;
    if (renderer && typeof renderer.shiftViewCol === 'function') {
      renderer.shiftViewCol(engine, stepDir);
    }
    SE.play('cursorMove');
  }, { passive: false });

  return {
    isHoldingSwap: () => activePointerId !== null && dragMode === 'swap',
    stepGrabMove: (dir, isRepeatCall = false) => stepGrabSwap(dir, isRepeatCall)
  };
}

let rotateTouchHoldState = {
  pointerId: null,
  dir: 0,
  btnEl: null,
  dasTimer: null,
  arrTimer: null
};

function stopRotateTouchHold() {
  if (rotateTouchHoldState.dasTimer) {
    clearTimeout(rotateTouchHoldState.dasTimer);
    rotateTouchHoldState.dasTimer = null;
  }
  if (rotateTouchHoldState.arrTimer) {
    clearInterval(rotateTouchHoldState.arrTimer);
    rotateTouchHoldState.arrTimer = null;
  }
  if (rotateTouchHoldState.btnEl) {
    rotateTouchHoldState.btnEl.classList.remove('is-pressed');
    rotateTouchHoldState.btnEl = null;
  }
  rotateTouchHoldState.pointerId = null;
  rotateTouchHoldState.dir = 0;
}

function triggerRotateTouchStep(dir, isRepeatCall = false) {
  if (!myEngine || myEngine.gameOver || (isMatchOver && !isPracticeMode) || isExitConfirmOpen) return;
  if (p1BoardTouchCtrl && p1BoardTouchCtrl.isHoldingSwap()) {
    p1BoardTouchCtrl.stepGrabMove(dir, isRepeatCall);
    return;
  }
  if (myEngine.is3D && myRenderer && typeof myRenderer.shiftViewCol === 'function') {
    if (typeof myRenderer.setCameraMode === 'function') myRenderer.setCameraMode('free');
    myRenderer.shiftViewCol(myEngine, dir);
    SE.play('cursorMove');
  } else if (moveEngineCursorHoriz(myEngine, dir)) {
    SE.play('cursorMove');
  }
}

function bindRotateTouchButtons() {
  const bindOne = (btnId, dir) => {
    const btn = document.getElementById(btnId);
    if (!btn || btn.dataset.rotateBound === '1') return;
    btn.dataset.rotateBound = '1';

    btn.addEventListener('pointerdown', (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      if (e.cancelable) e.preventDefault();
      if (!myEngine || myEngine.gameOver || (isMatchOver && !isPracticeMode) || isExitConfirmOpen) return;
      stopRotateTouchHold();
      rotateTouchHoldState.pointerId = e.pointerId;
      rotateTouchHoldState.dir = dir;
      rotateTouchHoldState.btnEl = btn;
      btn.classList.add('is-pressed');
      try { btn.setPointerCapture(e.pointerId); } catch (_) {}

      triggerRotateTouchStep(dir, false);
      rotateTouchHoldState.dasTimer = setTimeout(() => {
        if (rotateTouchHoldState.pointerId !== e.pointerId) return;
        rotateTouchHoldState.arrTimer = setInterval(() => {
          if (rotateTouchHoldState.pointerId !== e.pointerId) {
            stopRotateTouchHold();
            return;
          }
          triggerRotateTouchStep(dir, true);
        }, 55);
      }, 210);
    });

    const endRotate = (e) => {
      if (rotateTouchHoldState.pointerId === e.pointerId) {
        try { btn.releasePointerCapture(e.pointerId); } catch (_) {}
        stopRotateTouchHold();
      }
    };
    btn.addEventListener('pointerup', endRotate);
    btn.addEventListener('pointercancel', endRotate);
  };

  bindOne('rotate-left-btn', -1);
  bindOne('rotate-right-btn', 1);
}

function setupShareP2Input() {
  const p2Cvs = document.getElementById('rival-canvas-0');
  if (!p2Cvs || p2Cvs.dataset.shareBound === '1') return;
  p2Cvs.dataset.shareBound = '1';
  bindBoardTouchInput(
    p2Cvs,
    () => (currentMode === 'share' && opponents[0]) ? opponents[0].engine : null,
    () => !!document.getElementById('p2-continuous-swipe')?.checked,
    true,
    (cb) => { shareP2RowFollowCallback = cb; },
    () => (currentMode === 'share' && opponents[0]) ? opponents[0].renderer : null
  );
}
let inputSetupDone = false;
function setupInput() {
  if (inputSetupDone) return;
  inputSetupDone = true;

  const cvs = document.getElementById('my-canvas');
  p1BoardTouchCtrl = bindBoardTouchInput(
    cvs,
    () => myEngine,
    () => !!document.getElementById('continuous-swipe')?.checked,
    false,
    (cb) => { touchRowFollowCallback = cb; },
    () => myRenderer
  );

  bindRotateTouchButtons();

  const riseBtn = document.getElementById('rise-btn');
  let p1RisePointerId = null;
  riseBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (myEngine && !(isMatchOver && !isPracticeMode) && !isExitConfirmOpen) {
      p1RisePointerId = e.pointerId;
      try { riseBtn.setPointerCapture(e.pointerId); } catch (_) {}
      myEngine.isRisingManualBtn = true;
    }
  });
  const endP1Rise = (e) => { if (p1RisePointerId !== null && e.pointerId !== p1RisePointerId) return; p1RisePointerId = null; if (myEngine) myEngine.isRisingManualBtn = false; };
  ['pointerup', 'pointercancel'].forEach(ev => riseBtn.addEventListener(ev, endP1Rise));

  const p2RiseBtn = document.getElementById('p2-rise-btn');
  if (p2RiseBtn) {
    let p2RisePointerId = null;
    p2RiseBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const opp0 = opponents[0];
      if (currentMode === 'share' && opp0 && opp0.engine && !(isMatchOver && !isPracticeMode) && !isExitConfirmOpen) {
        p2RisePointerId = e.pointerId;
        try { p2RiseBtn.setPointerCapture(e.pointerId); } catch (_) {}
        opp0.engine.isRisingManualBtn = true;
      }
    });
    const endP2Rise = (e) => { if (p2RisePointerId !== null && e.pointerId !== p2RisePointerId) return; p2RisePointerId = null; const opp0 = opponents[0]; if (opp0 && opp0.engine) opp0.engine.isRisingManualBtn = false; };
    ['pointerup', 'pointercancel'].forEach(ev => p2RiseBtn.addEventListener(ev, endP2Rise));
  }

  const skillBtn = document.getElementById('skill-btn');
  if (skillBtn) {
    skillBtn.removeAttribute('onclick');
    bindMultiTouchTap(skillBtn, () => activatePlayerSkill());
  }
  const p2SkillBtn = document.getElementById('p2-skill-btn');
  if (p2SkillBtn) {
    p2SkillBtn.removeAttribute('onclick');
    bindMultiTouchTap(p2SkillBtn, () => activateShareP2Skill());
  }

  const battleEndOverlay = document.getElementById('battle-end-overlay');
  if (battleEndOverlay) {
    battleEndOverlay.addEventListener('pointerdown', (e) => {
      if (battleEndState.active) { e.preventDefault(); tryDismissBattleEndOverlay(); }
    });
  }

  window.addEventListener('blur', () => {
    clearKeyboardHoldStates();
    stopRotateTouchHold();
    if (myEngine) {
      myEngine.isRisingManualKey = false;
      myEngine.touchGrab = null;
    }
    opponents.forEach(opp => {
      if (opp.engine) {
        opp.engine.isRisingManualKey = false;
        opp.engine.touchGrab = null;
      }
    });
  });

  window.addEventListener('keydown', (e) => {
    if (typeof OpAnimation !== 'undefined' && OpAnimation.isActive && OpAnimation.isActive()) {
      e.preventDefault();
      if (!e.repeat) OpAnimation.skip();
      return;
    }
    if (battleEndState.active) { e.preventDefault(); tryDismissBattleEndOverlay(); return; }
    if (assigningAction) {
      e.preventDefault();
      e.stopPropagation();
      if (assignType === 'key') {
        const doneAction = assigningAction;
        pendingConfigFocus = { action: doneAction, type: 'key' };
        const newCode = (e.code === 'Delete' || e.code === 'Backspace') ? '' : e.code;
        if (typeof assignKeyToPlayerAction === 'function') {
          assignKeyToPlayerAction(settingsPlayerIdx, doneAction, newCode);
        } else {
          playerConfigs[settingsPlayerIdx].key[doneAction] = newCode;
        }
        assigningAction = null;
        renderConfigUI();
        SE.play('select');
      } else if (assignType === 'pad') {
        if (e.code === 'Delete' || e.code === 'Backspace') {
          const doneAction = assigningAction;
          pendingConfigFocus = { action: doneAction, type: 'pad' };
          if (typeof assignPadToPlayerAction === 'function') {
            assignPadToPlayerAction(settingsPlayerIdx, doneAction, null);
          } else {
            playerConfigs[settingsPlayerIdx].pad[doneAction] = null;
          }
          assigningAction = null;
          renderConfigUI();
          SE.play('select');
        } else if (e.code === 'Escape') {
          assigningAction = null;
          renderConfigUI();
          SE.play('cancel');
        }
      }
      return;
    }
    const code = e.code;
    const isGameVisible = document.getElementById('game-area').style.display === 'flex';
    const isResultVisible = isElementActuallyVisible('result-overlay');
    const isSettingsVisible = isElementActuallyVisible('settings-overlay');
    const isSettingsConfirmVisible = isElementActuallyVisible('settings-confirm-modal');
    const isSkillModalVisible = isElementActuallyVisible('skill-select-modal');
    const isCustomSkillModalVisible = isElementActuallyVisible('custom-skill-modal');
    const isConfirmModalVisible = isElementActuallyVisible('confirm-match-modal');
    const isSelectPickerVisible = isElementActuallyVisible('select-picker-modal');
    const isExitConfirmVisible = isElementActuallyVisible('exit-confirm-modal');
    const isAppExitConfirmVisible = isElementActuallyVisible('app-exit-confirm-modal');
    const isAppTerminatedVisible = isElementActuallyVisible('app-terminated-overlay');
    const isKeyResetConfirmVisible = isElementActuallyVisible('key-reset-confirm-modal');
    const isPwaGuideVisible = isElementActuallyVisible('pwa-guide-modal');
    const isStoryOverlayVisible = isElementActuallyVisible('story-overlay');

    if (isStoryOverlayVisible) return;

    if (isExitConfirmVisible && code === keyConfig.Pause && !e.repeat) {
      e.preventDefault();
      closeExitConfirmModal();
      return;
    }

    if (!isGameVisible || isResultVisible || isSettingsVisible || isSettingsConfirmVisible || isSkillModalVisible || isCustomSkillModalVisible || isConfirmModalVisible || isSelectPickerVisible || isExitConfirmVisible || isAppExitConfirmVisible || isAppTerminatedVisible || isKeyResetConfirmVisible || isPwaGuideVisible) {
      const tag = document.activeElement?.tagName;
      const isTextInput = tag === 'INPUT' && document.activeElement?.type === 'text';
      const isLocalMenuOpen = isElementActuallyVisible('local-menu');
      const isDigitHudOpen = (typeof rangeEditState !== 'undefined' && !!rangeEditState.el);
      const isModalOpen = isSkillModalVisible
                       || isCustomSkillModalVisible
                       || isConfirmModalVisible
                       || isSelectPickerVisible
                       || isExitConfirmVisible
                       || isAppExitConfirmVisible
                       || isAppTerminatedVisible
                       || isKeyResetConfirmVisible
                       || isSettingsConfirmVisible
                       || isPwaGuideVisible
                       || isSettingsVisible
                       || isResultVisible
                       || isDigitHudOpen
                       || isElementActuallyVisible('share-prep-overlay');

      if (!isGameVisible && isLocalMenuOpen && !isModalOpen && !isTextInput && !e.repeat) {
        if (handleLocalMenuKeyInput(code, e)) return;
      }

      if (typeof handleMenuKeyDown === 'function' && handleMenuKeyDown(e)) {
        return;
      }
      return;
    }
    if (code === keyConfig.Pause && !e.repeat && !isResultVisible) {
      e.preventDefault();
      clearKeyboardHoldStates();
      stopRotateTouchHold();
      if (myEngine) myEngine.isRisingManualKey = false;
      exitGame(); return;
    }
    if (!myEngine || (isMatchOver && !isPracticeMode)) return;
    handleKeyboardActionForPlayer(myEngine, playerConfigs[0].key, p1InputState, code, e.repeat, true, null, e, myRenderer);
    if (currentMode === 'local' || currentMode === 'share') {
      opponents.forEach(opp => {
        if (opp.type === 'local_human' && opp.inputState) handleKeyboardActionForPlayer(opp.engine, playerConfigs[opp.playerSlotIndex].key, opp.inputState, code, e.repeat, false, opp, e, opp.renderer);
      });
    }
  });

  window.addEventListener('keyup', (e) => {
    const releaseFor = (engine, cfgKey, stateObj) => {
      if (e.code === cfgKey.GrabLeft && stateObj.keyGrabState.active && stateObj.keyGrabState.side === 'left') stateObj.keyGrabState.active = stateObj.keyGrabState.consumed = false;
      if (e.code === cfgKey.GrabRight && stateObj.keyGrabState.active && stateObj.keyGrabState.side === 'right') stateObj.keyGrabState.active = stateObj.keyGrabState.consumed = false;
      if (e.code === cfgKey.Up) { stateObj.keyHeld.Up = false; stateObj.keyHoldFrames.Up = 0; if (stateObj.keyDirTime) stateObj.keyDirTime.Up.held = false; }
      if (e.code === cfgKey.Down) { stateObj.keyHeld.Down = false; stateObj.keyHoldFrames.Down = 0; if (stateObj.keyDirTime) stateObj.keyDirTime.Down.held = false; }
      if (e.code === cfgKey.Left) { stateObj.keyHeld.Left = false; stateObj.keyHoldFrames.Left = 0; if (stateObj.keyDirTime) stateObj.keyDirTime.Left.held = false; }
      if (e.code === cfgKey.Right) { stateObj.keyHeld.Right = false; stateObj.keyHoldFrames.Right = 0; if (stateObj.keyDirTime) stateObj.keyDirTime.Right.held = false; }
      if (engine && (e.code === cfgKey.Rise1 || e.code === cfgKey.Rise2)) engine.isRisingManualKey = false;
    };
    releaseFor(myEngine, playerConfigs[0].key, p1InputState);
    if (currentMode === 'local' || currentMode === 'share') {
      opponents.forEach(opp => {
        if (opp.type === 'local_human' && opp.inputState) releaseFor(opp.engine, playerConfigs[opp.playerSlotIndex].key, opp.inputState);
      });
    }
  });
}

// ==========================================
// [Part 2-B / 2] レイアウト計算・イベント初期化
// ==========================================
let useMobileLayoutInLandscape = localStorage.getItem('pdw_mobile_layout') === 'true';

function toggleLandscapeLayout() {
  useMobileLayoutInLandscape = !useMobileLayoutInLandscape;
  localStorage.setItem('pdw_mobile_layout', useMobileLayoutInLandscape);
  SE.play('select');
  updateLayoutToggleBtnText();
  adjustLayout();
}

function updateLayoutToggleBtnText() {
  const btn = document.getElementById('layout-toggle-btn');
  if (btn) btn.innerText = useMobileLayoutInLandscape ? 'UI: 縦型' : 'UI: 横並び';
}

function updateMyZoneFrameLayout(rect) {
  const el = document.getElementById('my-zone-frame-bg');
  if (!el) return;
  if (!rect) {
    el.style.top = '0'; el.style.left = '0'; el.style.width = '100%'; el.style.height = '100%'; el.style.borderRadius = '0';
  } else {
    el.style.top = `${rect.top}px`; el.style.left = `${rect.left}px`;
    el.style.width = `${rect.width}px`; el.style.height = `${rect.height}px`;
    el.style.borderRadius = rect.radius || '0';
  }
}

function resetControlsSpacingOverrides(controls) {
  if (!controls) return;
  controls.classList.remove('compact-1on1', 'spacious-controls');
  controls.style.paddingBottom = '';
  const layoutBtn = document.getElementById('layout-toggle-btn');
  const handednessWrapper = document.getElementById('handedness-wrapper');
  const swipeWrapper = document.getElementById('swipe-wrapper');
  const vibrateWrapper = document.getElementById('vibrate-wrapper');
  const skillBtn = document.getElementById('skill-btn');
  const riseBtn = document.getElementById('rise-btn');
  const rotateRow = document.getElementById('rotate-btns-row');
  const exitBtn = document.getElementById('exit-btn');

  if (layoutBtn) layoutBtn.style.marginTop = '';
  if (handednessWrapper) handednessWrapper.style.marginTop = '0';
  if (swipeWrapper) swipeWrapper.style.marginTop = '';
  if (vibrateWrapper) vibrateWrapper.style.marginTop = '';
  if (skillBtn) {
    skillBtn.style.marginTop = '';
    skillBtn.style.minHeight = '';
  }
  if (riseBtn) {
    riseBtn.style.marginTop = '';
    riseBtn.style.height = '38px';
    riseBtn.style.padding = '6px 8px';
    riseBtn.style.fontSize = '0.92rem';
  }
  if (rotateRow) {
    rotateRow.style.marginTop = '';
    rotateRow.querySelectorAll('.rotate-touch-btn').forEach(b => {
      b.style.height = '';
    });
  }
  if (exitBtn && exitBtn.parentNode === controls) {
    exitBtn.style.marginBottom = '4px';
  }
}

function applyVerticalControlsSpacing(controls, targetTotalH, rivalUsedH = 0, hasExitInside = false) {
  if (!controls) return targetTotalH;
  resetControlsSpacingOverrides(controls);

  const layoutBtn = document.getElementById('layout-toggle-btn');
  const handednessWrapper = document.getElementById('handedness-wrapper');
  const swipeWrapper = document.getElementById('swipe-wrapper');
  const vibrateWrapper = document.getElementById('vibrate-wrapper');
  const skillBtn = document.getElementById('skill-btn');
  const riseBtn = document.getElementById('rise-btn');
  const rotateRow = document.getElementById('rotate-btns-row');
  const exitBtn = document.getElementById('exit-btn');

  const isVis = (el) => !!el && el.style.display !== 'none';
  const settingItems = [layoutBtn, handednessWrapper, swipeWrapper, vibrateWrapper].filter(isVis);
  const actionItems = [skillBtn, riseBtn, rotateRow].filter(isVis);

  const exitH = hasExitInside ? 42 : 0;
  let settingSum = 0;
  settingItems.forEach(el => {
    settingSum += (el === layoutBtn) ? 28 : 45;
  });
  let actionSum = 0;
  if (isVis(skillBtn)) actionSum += 46;
  if (isVis(riseBtn)) actionSum += 38;
  if (isVis(rotateRow)) actionSum += 38;

  const rotateExtraSep = isVis(rotateRow) ? 14 : 0;
  const visibleCount = settingItems.length + actionItems.length;
  const baseGap = 6;
  const naturalH = rivalUsedH + exitH + settingSum + actionSum + rotateExtraSep + Math.max(0, visibleCount - 1) * baseGap;

  if (rivalUsedH > 0 && naturalH > targetTotalH) {
    controls.classList.add('compact-1on1');
    if (settingItems.length > 0) settingItems[0].style.marginTop = 'auto';
    if (isVis(rotateRow)) rotateRow.style.marginTop = '10px';
    controls.style.height = 'auto';
    controls.style.minHeight = `${targetTotalH}px`;
    controls.style.justifyContent = 'flex-start';
    const ctrlBaseH = Math.max(targetTotalH, controls.scrollHeight || targetTotalH);
    controls.style.height = `${ctrlBaseH}px`;
    return ctrlBaseH;
  }

  const freeSpace = Math.max(0, targetTotalH - naturalH);
  if (freeSpace >= 24) {
    controls.classList.add('spacious-controls');
  }

  const gapPx = Math.round(Math.min(18, 7 + freeSpace * 0.055));
  controls.style.gap = `${gapPx}px`;

  if (isVis(riseBtn)) {
    const riseBoost = Math.round(Math.min(12, freeSpace * 0.045));
    riseBtn.style.height = `${38 + riseBoost}px`;
  }
  if (isVis(skillBtn)) {
    const skillBoost = Math.round(Math.min(12, freeSpace * 0.045));
    skillBtn.style.minHeight = `${46 + skillBoost}px`;
  }
  if (isVis(rotateRow)) {
    const rotBoost = Math.round(Math.min(10, freeSpace * 0.04));
    const rotSep = Math.round(Math.min(28, 14 + freeSpace * 0.065));
    rotateRow.style.marginTop = `${rotSep}px`;
    rotateRow.querySelectorAll('.rotate-touch-btn').forEach(b => {
      b.style.height = `${38 + rotBoost}px`;
    });
  }

  if (settingItems.length > 0 && actionItems.length > 0) {
    if (rivalUsedH > 0) {
      settingItems[0].style.marginTop = 'auto';
      actionItems[0].style.marginTop = `${Math.round(Math.min(24, 6 + freeSpace * 0.14))}px`;
    } else if (hasExitInside) {
      if (exitBtn && exitBtn.parentNode === controls) exitBtn.style.marginBottom = 'auto';
      actionItems[0].style.marginTop = `${Math.round(Math.min(34, 8 + freeSpace * 0.16))}px`;
    } else {
      settingItems[0].style.marginTop = 'auto';
      actionItems[0].style.marginTop = `${Math.round(Math.min(44, 12 + freeSpace * 0.22))}px`;
    }
  } else if (hasExitInside && exitBtn && exitBtn.parentNode === controls) {
    exitBtn.style.marginBottom = 'auto';
  }

  controls.style.height = `${targetTotalH}px`;
  controls.style.minHeight = `${targetTotalH}px`;
  controls.style.justifyContent = rivalUsedH > 0 ? 'flex-start' : 'flex-end';
  if (rivalUsedH === 0) controls.style.paddingBottom = '6px';

  return Math.max(targetTotalH, controls.scrollHeight || targetTotalH);
}

function resetBattleLayoutStyles() {
  cleanupShareDomZones();
  removeInlinePlayerPortraits();

  const gameArea = document.getElementById('game-area');
  const gameContainer = document.getElementById('game-container');
  const exitBtn = document.getElementById('exit-btn');
  const controls = document.getElementById('controls-container');
  const p2Controls = document.getElementById('p2-controls-container');
  const myWrapper = document.getElementById('my-wrapper');
  const rivalsArea = document.getElementById('rivals-area');
  const rivalsTopArea = document.getElementById('rivals-top-area');
  const handednessWrapper = document.getElementById('handedness-wrapper');
  const rotateRow = document.getElementById('rotate-btns-row');

  if (gameArea) gameArea.classList.remove('share-mode');
  if (exitBtn) {
    if (gameArea && exitBtn.parentNode !== gameArea) gameArea.appendChild(exitBtn);
    exitBtn.className = 'action-btn retire-btn absolute-top';
    exitBtn.style.cssText = '';
  }
  if (controls) {
    if (gameContainer && controls.parentNode !== gameContainer) gameContainer.appendChild(controls);
    resetControlsSpacingOverrides(controls);
    controls.style.cssText = 'display: flex; flex-direction: column; justify-content: flex-end; gap: 6px; z-index: 20; width: 110px;';
  }
  if (rotateRow) {
    rotateRow.style.display = 'none';
  }
  if (p2Controls) {
    if (gameContainer && p2Controls.parentNode !== gameContainer) gameContainer.appendChild(p2Controls);
    p2Controls.style.cssText = 'display: none; flex-direction: column; justify-content: flex-end; gap: 6px; z-index: 20; width: 110px;';
  }
  if (myWrapper) {
    if (gameContainer && myWrapper.parentNode !== gameContainer) gameContainer.appendChild(myWrapper);
    myWrapper.style.cssText = '';
  }
  if (rivalsArea) {
    if (gameContainer && rivalsArea.parentNode !== gameContainer) gameContainer.appendChild(rivalsArea);
    rivalsArea.style.cssText = 'display: none; gap: 10px; align-items: center; justify-content: center;';
  }
  if (rivalsTopArea) {
    rivalsTopArea.style.cssText = 'display: none;';
  }
  opponents.forEach((_, i) => {
    const el = document.getElementById(`rival-wrapper-${i}`);
    if (el) {
      if (rivalsArea && el.parentNode !== rivalsArea) rivalsArea.appendChild(el);
      el.style.cssText = '';
    }
  });
  if (gameContainer) gameContainer.style.cssText = '';
  if (handednessWrapper) {
    handednessWrapper.style.display = 'flex';
    handednessWrapper.style.marginTop = '0';
  }
}
function ensureShareSizerBox(parentZone, sizerId, childEl, orderNum) {
  let sizer = document.getElementById(sizerId);
  if (!sizer) {
    sizer = document.createElement('div');
    sizer.id = sizerId;
    sizer.className = 'share-slot-sizer';
  }
  sizer.style.order = String(orderNum);
  if (sizer.parentNode !== parentZone) parentZone.appendChild(sizer);
  if (childEl && childEl.parentNode !== sizer) sizer.appendChild(childEl);
  return sizer;
}

function adjustLayout() {
  updateShareForcePortraitClass();
  const uiZoom = updateResponsiveUiZoom();
  const exitZoom = Math.min(uiZoom, 1.35);
  const topSafeExitPx = Math.round(48 * exitZoom);

  const isPortrait = window.innerHeight >= window.innerWidth;
  const W = window.innerWidth, H = window.innerHeight;
  const isLeft = document.getElementById('handedness-toggle')?.checked;

  const oppCount = opponents.length;
  const myWrapper = document.getElementById('my-wrapper'), rivalsArea = document.getElementById('rivals-area');
  const rivalsTopArea = document.getElementById('rivals-top-area'), controls = document.getElementById('controls-container');
  const p2Controls = document.getElementById('p2-controls-container'), exitBtn = document.getElementById('exit-btn');
  const gameArea = document.getElementById('game-area'), gameContainer = document.getElementById('game-container');
  const handednessWrapper = document.getElementById('handedness-wrapper'), zoneBgEl = document.getElementById('my-zone-frame-bg');
  const vibrateWrapper = document.getElementById('vibrate-wrapper');
  const bottomBar = document.getElementById('battle-bottom-status-bar');
  const layoutBtn = document.getElementById('layout-toggle-btn');
  const rotateRow = document.getElementById('rotate-btns-row');

  if (!myWrapper || !controls || !exitBtn || !gameArea || !gameContainer) return;

  if (currentMode === 'share') {
    removeInlinePlayerPortraits();
    if (zoneBgEl) zoneBgEl.style.opacity = '0';
    if (bottomBar) bottomBar.style.display = 'none';
    if (rotateRow) rotateRow.style.display = 'none';
    document.body.classList.remove('local-force-landscape');
    gameArea.classList.add('share-mode');
    if (rivalsTopArea) rivalsTopArea.style.display = 'none';
    if (rivalsArea) rivalsArea.style.display = 'none';

    const effW = Math.min(W, H), effH = Math.max(W, H), halfH = effH / 2;
    const homeBarGuardPx = Math.max(24, Math.round(halfH * 0.065));

    let p2Zone = document.getElementById('share-p2-zone'), p1Zone = document.getElementById('share-p1-zone');
    if (!p2Zone) {
      p2Zone = document.createElement('div');
      p2Zone.id = 'share-p2-zone';
      p2Zone.className = 'share-zone-half share-p2-zone';
      gameContainer.appendChild(p2Zone);
    }
    if (!p1Zone) {
      p1Zone = document.createElement('div');
      p1Zone.id = 'share-p1-zone';
      p1Zone.className = 'share-zone-half share-p1-zone';
      gameContainer.appendChild(p1Zone);
    }
    p1Zone.style.paddingBottom = `${homeBarGuardPx}px`;
    p2Zone.style.paddingBottom = `${homeBarGuardPx}px`;

    const rivalWrapper = document.getElementById('rival-wrapper-0');
    const p2BoardSizer = ensureShareSizerBox(p2Zone, 'share-p2-board-sizer', rivalWrapper, 1);
    const p2CtrlSizer = ensureShareSizerBox(p2Zone, 'share-p2-ctrl-sizer', p2Controls, 2);
    const p1BoardSizer = ensureShareSizerBox(p1Zone, 'share-p1-board-sizer', myWrapper, 1);
    const p1CtrlSizer = ensureShareSizerBox(p1Zone, 'share-p1-ctrl-sizer', controls, 2);

    if (exitBtn.parentNode !== gameArea) gameArea.appendChild(exitBtn);
    exitBtn.className = 'action-btn retire-btn share-exit-btn';
    exitBtn.style.cssText = 'position:absolute;top:50%;left:6px;right:auto;width:auto;margin:0;';
    if (handednessWrapper) handednessWrapper.style.display = 'none';
    if (vibrateWrapper) vibrateWrapper.style.display = 'none';
    if (layoutBtn) layoutBtn.style.display = 'none';

    controls.style.cssText = 'display:flex;height:auto;width:110px;justify-content:center;position:relative;flex-direction:column;gap:6px;z-index:20;flex-shrink:0;transform-origin:top left;';
    if (p2Controls) p2Controls.style.cssText = 'display:flex;height:auto;width:110px;justify-content:center;position:relative;flex-direction:column;gap:6px;z-index:20;flex-shrink:0;transform-origin:top left;';

    myWrapper.style.cssText = 'position:relative;width:224px;max-width:224px;flex-shrink:0;transition:none;transform-origin:top left;margin:0;';
    if (rivalWrapper) {
      rivalWrapper.style.cssText = 'position:relative;width:224px;max-width:224px;flex-shrink:0;transition:none;transform-origin:top left;margin:0;';
    }
    gameContainer.style.cssText = 'position:relative;width:100%;height:100%;display:flex;flex-direction:column;flex-wrap:nowrap;padding:0;gap:0;';

    const baseBoardH = Math.max(540, myWrapper.offsetHeight || 540, rivalWrapper ? (rivalWrapper.offsetHeight || 540) : 540);
    const p1CtrlH = Math.max(160, controls.offsetHeight || 180);
    const p2CtrlH = p2Controls ? Math.max(160, p2Controls.offsetHeight || 180) : 180;
    const baseTotalW = 224 + 110 + 10;
    const availHalfH = Math.max(140, halfH - homeBarGuardPx - 14);
    const scale = Math.max(0.30, Math.min(2.0, availHalfH / baseBoardH, (effW - 14) / baseTotalW));

    myWrapper.style.transform = `scale(${scale})`;
    p1BoardSizer.style.width = `${Math.round(224 * scale)}px`;
    p1BoardSizer.style.height = `${Math.round(baseBoardH * scale)}px`;

    controls.style.transform = `scale(${scale})`;
    p1CtrlSizer.style.width = `${Math.round(110 * scale)}px`;
    p1CtrlSizer.style.height = `${Math.round(p1CtrlH * scale)}px`;

    if (rivalWrapper) {
      rivalWrapper.style.transform = `scale(${scale})`;
      p2BoardSizer.style.width = `${Math.round(224 * scale)}px`;
      p2BoardSizer.style.height = `${Math.round(baseBoardH * scale)}px`;
    }
    if (p2Controls) {
      p2Controls.style.transform = `scale(${scale})`;
      p2CtrlSizer.style.width = `${Math.round(110 * scale)}px`;
      p2CtrlSizer.style.height = `${Math.round(p2CtrlH * scale)}px`;
    }

    refreshBattleSidePanels();
    refreshOnlineSplitFrames();
    updateAllPortraitHUDs();
    return;
  }

  resetBattleLayoutStyles();
  if (typeof syncBoardVibrateToggleUI === 'function') syncBoardVibrateToggleUI();

  if (layoutBtn) {
    layoutBtn.style.display = (!isPortrait && currentMode !== 'local') ? 'block' : 'none';
    updateLayoutToggleBtnText();
  }

  const isLandscapeLarge = !isPortrait && !useMobileLayoutInLandscape;
  const maxDynamicScale = 2.2;
  const isGameShown = gameArea.style.display !== 'none';
  const showBottomBar = isGameShown && (isPortrait || useMobileLayoutInLandscape) && currentMode !== 'local';

  if (bottomBar) {
    bottomBar.style.display = showBottomBar ? 'flex' : 'none';
  }
  if (rotateRow) {
    rotateRow.style.display = (!isLandscapeLarge && currentMode !== 'local' && !!(myEngine && myEngine.is3D)) ? 'flex' : 'none';
  }

  refreshBattleSidePanels();
  refreshOnlineSplitFrames();

  if (currentMode === 'local') {
    if (zoneBgEl) zoneBgEl.style.opacity = '1';
    updateMyZoneFrameLayout(null);

    document.body.classList.toggle('local-force-landscape', isPortrait && isGameShown);
    const effW = isPortrait ? H : W, effH = isPortrait ? W : H;
    rivalsTopArea.style.display = 'none'; controls.style.display = 'none'; rivalsArea.style.display = 'contents';
    if (exitBtn.parentNode !== gameArea) gameArea.appendChild(exitBtn);
    exitBtn.className = 'action-btn retire-btn absolute-top';
    exitBtn.style.cssText = 'left:12px;right:auto;';

    const totalPlayers = 1 + oppCount;
    const baseW = 224;
    const baseH = currentSkillEnabled ? 564 : 536;
    const portraitH = 476;
    const portraitW = totalPlayers === 2 ? 150 : (totalPlayers === 3 ? 104 : 74);
    const showPortraits = (totalPlayers >= 2);
    const totalPortraits = showPortraits ? totalPlayers : 0;
    const itemCount = totalPlayers + totalPortraits;
    const gapPx = totalPlayers >= 4 ? 6 : 8;
    const baseTotalW = totalPlayers * baseW + totalPortraits * portraitW + Math.max(0, itemCount - 1) * gapPx;
    const localTopPad = Math.max(48, topSafeExitPx + 6);

    const scale = Math.max(0.28, Math.min(maxDynamicScale, (effW - 22) / baseTotalW, (effH - localTopPad - 12) / baseH));
    gameContainer.style.cssText = `position:relative;width:100%;height:100%;display:flex;flex-direction:row;flex-wrap:nowrap;align-items:center;align-content:center;justify-content:center;gap:${gapPx}px;padding:${localTopPad}px 8px 10px 8px;`;

    const mx = (baseW - baseW * scale) / -2, my = (baseH - baseH * scale) / -2;
    const pmx = (portraitW - portraitW * scale) / -2, pmy = (portraitH - portraitH * scale) / -2;

    myWrapper.style.order = '10';
    myWrapper.style.transformOrigin = 'center';
    myWrapper.style.transform = `scale(${scale})`;
    myWrapper.style.margin = `${my}px ${mx}px`;

    if (showPortraits && myRenderer && myRenderer.theme) {
      const p0Card = buildInlinePortraitCard(0, totalPlayers, myRenderer.theme, -1);
      p0Card.style.order = '20';
      p0Card.style.transformOrigin = 'center';
      p0Card.style.transform = `scale(${scale})`;
      p0Card.style.margin = `${pmy}px ${pmx}px`;
      gameContainer.appendChild(p0Card);
    }

    opponents.forEach((opp, i) => {
      const el = document.getElementById(`rival-wrapper-${i}`);
      if (el) {
        el.style.position = 'relative'; el.style.width = ''; el.style.flexShrink = '';
        el.style.transformOrigin = 'center'; el.style.transform = `scale(${scale})`; el.style.margin = `${my}px ${mx}px`;
        if (totalPlayers === 2) el.style.order = '40';
        else el.style.order = String((i + 1) * 20 + 10);
      }
      if (showPortraits && opp.renderer && opp.renderer.theme) {
        const pCard = buildInlinePortraitCard(i + 1, totalPlayers, opp.renderer.theme, i);
        pCard.style.order = (totalPlayers === 2) ? '30' : String((i + 1) * 20 + 20);
        pCard.style.transformOrigin = 'center';
        pCard.style.transform = `scale(${scale})`;
        pCard.style.margin = `${pmy}px ${pmx}px`;
        gameContainer.appendChild(pCard);
      }
    });
    updateAllPortraitHUDs();
    return;
  }

  if (zoneBgEl) zoneBgEl.style.opacity = (currentMode === 'online') ? '0' : '1';
  document.body.classList.remove('local-force-landscape');

  if (isLandscapeLarge) {
    rivalsTopArea.style.display = 'none';
    if (exitBtn.parentNode !== gameArea) gameArea.appendChild(exitBtn);
    exitBtn.className = 'action-btn retire-btn absolute-top';
    if (isLeft) { exitBtn.style.right = '15px'; exitBtn.style.left = 'auto'; } else { exitBtn.style.left = '15px'; exitBtn.style.right = 'auto'; }

    if (oppCount >= 1) {
      const totalPlayers = 1 + oppCount;
      const baseBoardW = 224, baseBoardH = 536, ctrlW = 110;
      const portraitW = totalPlayers === 2 ? 150 : (totalPlayers === 3 ? 104 : 74);
      const portraitH = 476;
      const gapPx = totalPlayers >= 4 ? 6 : 8;
      const itemCount = totalPlayers * 2 + 1;
      const totalBaseW = totalPlayers * baseBoardW + totalPlayers * portraitW + ctrlW + (itemCount - 1) * gapPx;

      const availW = Math.max(300, W - 24);
      const availH = Math.max(220, H - topSafeExitPx - 16);
      const scale = Math.max(0.28, Math.min(maxDynamicScale, availW / totalBaseW, availH / baseBoardH));

      rivalsArea.style.display = 'contents';
      gameContainer.style.cssText = `position:relative;width:100%;height:100%;display:flex;flex-direction:row;flex-wrap:nowrap;align-items:center;justify-content:center;gap:${gapPx}px;padding:${topSafeExitPx + 2}px 10px 14px 10px;`;

      const mx = (baseBoardW - baseBoardW * scale) / -2, my = (baseBoardH - baseBoardH * scale) / -2;
      const pmx = (portraitW - portraitW * scale) / -2, pmy = (portraitH - portraitH * scale) / -2;
      const ctrlMx = (ctrlW - ctrlW * scale) / -2;

      controls.style.order = isLeft ? '2' : '99';
      controls.style.transformOrigin = 'center';
      controls.style.transform = `scale(${scale})`;
      controls.style.margin = `0 ${ctrlMx}px`;

      myWrapper.style.order = '10';
      myWrapper.style.transformOrigin = 'center';
      myWrapper.style.transform = `scale(${scale})`;
      myWrapper.style.margin = `${my}px ${mx}px`;

      if (myRenderer && myRenderer.theme) {
        const p0Card = buildInlinePortraitCard(0, totalPlayers, myRenderer.theme, -1);
        p0Card.style.order = '20';
        p0Card.style.transformOrigin = 'center';
        p0Card.style.transform = `scale(${scale})`;
        p0Card.style.margin = `${pmy}px ${pmx}px`;
        gameContainer.appendChild(p0Card);
      }

      opponents.forEach((opp, i) => {
        const el = document.getElementById(`rival-wrapper-${i}`);
        if (el) {
          el.style.transformOrigin = 'center';
          el.style.transform = `scale(${scale})`;
          el.style.margin = `${my}px ${mx}px`;
          el.style.order = (totalPlayers === 2) ? '40' : String((i + 1) * 20 + 10);
        }
        if (opp.renderer && opp.renderer.theme) {
          const pCard = buildInlinePortraitCard(i + 1, totalPlayers, opp.renderer.theme, i);
          pCard.style.order = (totalPlayers === 2) ? '30' : String((i + 1) * 20 + 20);
          pCard.style.transformOrigin = 'center';
          pCard.style.transform = `scale(${scale})`;
          pCard.style.margin = `${pmy}px ${pmx}px`;
          gameContainer.appendChild(pCard);
        }
      });

      updateTargetUI();
      updateAllPortraitHUDs();
      updateMyZoneFrameLayout(null);
      return;
    }

    rivalsArea.style.display = 'none';
    const hasSideCards = (W >= 620);
    const sideCardW = hasSideCards ? Math.min(236, Math.max(148, W * 0.175)) : 0;
    const sideMargin = hasSideCards ? Math.round(sideCardW + Math.min(28, Math.max(10, W * 0.02)) + 16) : 14;
    gameContainer.style.cssText = `position:relative;width:100%;height:100%;display:flex;flex-direction:row;align-items:center;justify-content:center;padding:${topSafeExitPx}px ${sideMargin}px 24px ${sideMargin}px;gap:12px;`;
    if (isLeft) { controls.style.order = '1'; myWrapper.style.order = '2'; }
    else { myWrapper.style.order = '2'; controls.style.order = '3'; }

    const baseBoardW = 224, baseBoardH = 536, ctrlW = 110;
    const availableW = Math.max(240, W - sideMargin * 2 - 14);
    const availableH = Math.max(240, H - topSafeExitPx - 24);
    const myScale = Math.max(0.4, Math.min(maxDynamicScale, availableH / baseBoardH, availableW / (baseBoardW + ctrlW + 14)));

    myWrapper.style.transformOrigin = 'center';
    myWrapper.style.transform = `scale(${myScale})`;
    myWrapper.style.margin = `${(baseBoardH - baseBoardH * myScale) / -2}px ${(baseBoardW - baseBoardW * myScale) / -2}px`;
    controls.style.transformOrigin = 'center';
    controls.style.transform = `scale(${myScale})`;
    controls.style.margin = `0 ${(ctrlW - ctrlW * myScale) / -2}px`;
    updateAllPortraitHUDs();
    updateMyZoneFrameLayout(null);
  } else if (oppCount <= 1) {
    const bottomReserve = showBottomBar ? 68 : 12;
    const topReserve = Math.max(isPortrait ? 52 : 46, topSafeExitPx + 2);
    rivalsTopArea.style.display = 'none'; rivalsArea.style.display = 'none';
    if (exitBtn.parentNode !== gameArea) gameArea.appendChild(exitBtn);
    exitBtn.className = 'action-btn retire-btn absolute-top';
    if (isLeft) { exitBtn.style.right = '12px'; exitBtn.style.left = 'auto'; } else { exitBtn.style.left = '12px'; exitBtn.style.right = 'auto'; }
    gameContainer.style.cssText = `position:relative;width:100%;height:100%;display:flex;flex-direction:${isLeft ? 'row' : 'row-reverse'};align-items:center;justify-content:center;padding:${topReserve}px 0 ${bottomReserve}px 0;gap:10px;`;

    controls.style.alignItems = 'center';
    let rivalUsedH = 0;
    if (oppCount === 1) {
      const rivalWrapper = document.getElementById('rival-wrapper-0');
      if (rivalWrapper) {
        if (rivalWrapper.parentNode !== controls) controls.insertBefore(rivalWrapper, controls.firstChild);
        rivalWrapper.style.setProperty('order', '-1', 'important');
        const rivalScale = 106 / 224;
        const originalRivalH = rivalWrapper.offsetHeight || 532;
        const horizCenterOffset = (110 - 224) / 2;
        rivalWrapper.style.transformOrigin = 'top center';
        rivalWrapper.style.transform = `scale(${rivalScale})`;
        rivalWrapper.style.position = 'relative';
        rivalWrapper.style.top = '0';
        rivalWrapper.style.left = 'auto';
        rivalWrapper.style.right = 'auto';
        rivalWrapper.style.zIndex = '25';
        rivalWrapper.style.width = '224px';
        rivalWrapper.style.flexShrink = '0';
        rivalWrapper.style.alignSelf = 'center';
        rivalWrapper.style.marginTop = '-10px';
        rivalWrapper.style.marginLeft = `${horizCenterOffset}px`;
        rivalWrapper.style.marginRight = `${horizCenterOffset}px`;
        rivalWrapper.style.marginBottom = `${originalRivalH * rivalScale - originalRivalH}px`;
        rivalUsedH = Math.round(originalRivalH * rivalScale);
      }
    }

    const ctrlBaseH = applyVerticalControlsSpacing(controls, 536, rivalUsedH, false);
    const baseBoardH = Math.max(536, ctrlBaseH);
    const availH = Math.max(220, H - topReserve - bottomReserve - 8), contentW = 344;
    const myScale = Math.max(0.4, Math.min(maxDynamicScale, availH / baseBoardH, (W - 14) / contentW));
    myWrapper.style.transform = `scale(${myScale})`; controls.style.transform = `scale(${myScale})`;
    myWrapper.style.transformOrigin = 'center'; controls.style.transformOrigin = 'center';
    const boardMx = (224 - 224 * myScale) / -2, ctrlMx = (110 - 110 * myScale) / -2;
    const boardMy = (536 - 536 * myScale) / -2;
    const ctrlMy = (ctrlBaseH - ctrlBaseH * myScale) / -2;
    myWrapper.style.margin = `${boardMy}px ${boardMx}px`; controls.style.margin = `${ctrlMy}px ${ctrlMx}px`;
    controls.style.position = 'relative'; controls.style.bottom = 'auto'; controls.style.left = 'auto'; controls.style.right = 'auto'; controls.style.width = '110px';
    updateBottomStatusBar();
    updateMyZoneFrameLayout(null);
  } else {
    const bottomReserve = showBottomBar ? 68 : 12;
    rivalsArea.style.display = 'none';
    const maxTopH = Math.max(92, Math.min(H * 0.22, 168));
    rivalsTopArea.style.cssText = `display:flex;position:absolute;top:4px;left:0;width:100vw;height:${maxTopH}px;flex-direction:row;align-items:center;justify-content:center;gap:6px;z-index:30;overflow:hidden;`;
    const availW = W - 12, scaleH = (maxTopH - 6) / 532, scaleW = availW / (oppCount * 224 + (oppCount - 1) * 6);
    const miniScale = Math.min(scaleH, scaleW, 0.85);

    opponents.forEach((_, i) => {
      const el = document.getElementById(`rival-wrapper-${i}`);
      if (el) {
        if (el.parentNode !== rivalsTopArea) rivalsTopArea.appendChild(el);
        el.style.position = 'relative'; el.style.transform = `scale(${miniScale})`; el.style.transformOrigin = 'center center';
        el.style.margin = `${(532 - 532 * miniScale) / -2}px ${(224 - 224 * miniScale) / -2}px`;
        el.style.width = '224px'; el.style.flexShrink = '0';
      }
    });
    if (exitBtn.parentNode !== controls) controls.insertBefore(exitBtn, controls.firstChild);
    exitBtn.className = 'action-btn retire-btn';
    exitBtn.style.cssText = 'position:static;width:100%;padding:8px 4px;font-size:0.85rem;margin-bottom:4px;';
    controls.style.width = '110px';
    controls.style.alignItems = 'center';

    const ctrlBaseH = applyVerticalControlsSpacing(controls, 536, 0, true);
    gameContainer.style.cssText = `display:flex;flex-direction:${isLeft ? 'row' : 'row-reverse'};align-items:center;justify-content:center;position:absolute;top:${maxTopH + 8}px;left:0;width:100vw;height:${H - maxTopH - 8 - bottomReserve}px;padding:0;gap:10px;`;
    const maxCenterH = Math.max(200, H - maxTopH - 18 - bottomReserve), contentW = 344;
    const baseBoardH = Math.max(536, ctrlBaseH);
    const myScale = Math.max(0.32, Math.min(maxDynamicScale, maxCenterH / baseBoardH, (W - 14) / contentW));
    myWrapper.style.transform = `scale(${myScale})`; controls.style.transform = `scale(${myScale})`;
    myWrapper.style.transformOrigin = 'center'; controls.style.transformOrigin = 'center';
    myWrapper.style.margin = `${(536 - 536 * myScale) / -2}px ${(224 - 224 * myScale) / -2}px`;
    controls.style.margin = `${(ctrlBaseH - ctrlBaseH * myScale) / -2}px ${(110 - 110 * myScale) / -2}px`;
    const topStart = maxTopH + 4;
    updateBottomStatusBar();
    updateMyZoneFrameLayout({ top: topStart, left: 0, width: W, height: H - topStart - bottomReserve, radius: '16px 16px 0 0' });
  }
}

function toggleHandedness() {
  const isLeft = document.getElementById('handedness-toggle').checked;
  const gameArea = document.getElementById('game-area'), label = document.getElementById('handedness-text');
  if (isLeft) {
    gameArea.classList.remove('right-handed'); gameArea.classList.add('left-handed');
    label.innerText = '左利きモード'; localStorage.setItem('pdw_handedness', 'left');
  } else {
    gameArea.classList.remove('left-handed'); gameArea.classList.add('right-handed');
    label.innerText = '右利きモード'; localStorage.setItem('pdw_handedness', 'right');
  }
  adjustLayout();
}

function handleWindowLayoutChange() {
  updateResponsiveUiZoom();
  adjustLayout();
  refreshMenuLayoutState(false);
}

window.addEventListener('resize', handleWindowLayoutChange);
window.addEventListener('orientationchange', () => setTimeout(handleWindowLayoutChange, 100));

window.addEventListener('DOMContentLoaded', () => {
  updateResponsiveUiZoom();
  if (localStorage.getItem('pdw_handedness') === 'left') document.getElementById('handedness-toggle').checked = true;
  toggleHandedness();

  const gameAreaEl = document.getElementById('game-area');
  gameAreaEl.addEventListener('touchstart', (e) => { if (e.touches.length > 1 && currentMode !== 'share') e.preventDefault(); }, { passive: false });
  gameAreaEl.addEventListener('touchmove', (e) => { if (document.getElementById('settings-overlay').style.display !== 'block') e.preventDefault(); }, { passive: false });
  gameAreaEl.addEventListener('gesturestart', (e) => e.preventDefault());
  let lastTouchEnd = 0;
  gameAreaEl.addEventListener('touchend', (e) => {
    if (currentMode === 'share') return;
    const now = Date.now();
    if (now - lastTouchEnd <= 300) e.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });

  if (typeof initPwaInstallSupport === 'function') initPwaInstallSupport();
  bindSwitchMenuHoverEvents();
  bindMenuHoverCursorSE();
  syncDimRuleUI();
  refreshMenuLayoutState(true);
  updateModeWinBadgesUI();
  if (typeof syncPlayerSkillSelects === 'function') syncPlayerSkillSelects();
  if (typeof syncHandicapFromSlider === 'function') syncHandicapFromSlider(3);
  if (typeof enhanceAllRangeSliders === 'function') enhanceAllRangeSliders();
  if (typeof initAssetsSystem === 'function') initAssetsSystem();
  if (typeof initStorySystem === 'function') initStorySystem();
  if (typeof setupInput === 'function') setupInput();
  focusPrimaryMenuElement('main-menu-actions');
});