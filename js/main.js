// ==========================================
// 対戦・ターゲット・ローカルスマブラ風UI・確認モーダル・シェア対戦統合管理システム
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
let maxChainInMatch = 0;

let rematchReady = {};
let boardReady = {};

let selectedPlayerSkill = localStorage.getItem('pdw_player_skill') || 'erase_color';
let selectedSingleMode = 'free';
let selectedComCount = 2;

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
  { id: 'com', label: 'COMと対戦' }
];
let rankingModeIdx = 0;

function onPlayerSkillSelectChange(val) {
  selectedPlayerSkill = val || 'erase_color';
  localStorage.setItem('pdw_player_skill', selectedPlayerSkill);
}

function syncPlayerSkillSelects() {
  if (typeof refreshAllSkillCarousels === 'function') refreshAllSkillCarousels();
}

// ==========================================
// スキル選択モーダル & 確認モーダル フロー
// ==========================================
let activeSkillConfirmFlow = null;

function openSkillAndConfirmFlow(flowCfg) {
  activeSkillConfirmFlow = {
    charId: flowCfg.charId || resolvePlayableCharId(selectedCharId),
    extraText: flowCfg.extraText || '',
    okLabel: flowCfg.okLabel || 'OK！（開始）',
    onConfirm: flowCfg.onConfirm || null
  };
  openSkillSelectModal();
}

function openSkillSelectModal() {
  if (!activeSkillConfirmFlow) return;
  const modal = document.getElementById('skill-select-modal');
  const confirmModal = document.getElementById('confirm-match-modal');
  if (confirmModal) confirmModal.style.display = 'none';

  const charBadge = document.getElementById('skill-modal-char-badge');
  const ch = getCharacterById(activeSkillConfirmFlow.charId);
  if (charBadge) {
    charBadge.innerText = `選択キャラ: ${ch.name}` + (activeSkillConfirmFlow.extraText ? `  |  ${activeSkillConfirmFlow.extraText}` : '');
  }

  if (typeof renderSkillCarousel === 'function') {
    renderSkillCarousel('skill-modal-picker', {
      currentSkillId: selectedPlayerSkill,
      onSelect: (skId) => onPlayerSkillSelectChange(skId),
      onCenterClick: () => confirmSkillSelectModal()
    });
  }
  if (modal) {
    modal.style.display = 'flex';
    const slider = modal.querySelector('.cf-slider');
    if (slider) slider.focus();
  }
}

function closeSkillSelectModal(silent = false) {
  const modal = document.getElementById('skill-select-modal');
  if (modal) modal.style.display = 'none';
  if (!silent && activeSkillConfirmFlow) SE.play('cancel');
  activeSkillConfirmFlow = null;
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

  const skId = selectedPlayerSkill;
  const skIcon = (typeof SKILL_ICONS !== 'undefined' && SKILL_ICONS[skId]) ? SKILL_ICONS[skId] : '⚡';
  const skName = (typeof SKILL_LABELS !== 'undefined' && SKILL_LABELS[skId]) ? SKILL_LABELS[skId] : skId;
  const skDesc = (typeof SKILL_DESCRIPTIONS !== 'undefined' && SKILL_DESCRIPTIONS[skId]) ? SKILL_DESCRIPTIONS[skId] : '';
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
  if (typeof cb === 'function') cb();
}

function beginSingleStartFlow() {
  SE.play('select');
  const skillOn = !!document.getElementById('single-skill-toggle')?.checked;
  if (!skillOn) {
    startSingleMode();
    return;
  }
  const modeNames = { free: 'フリー', ta: 'タイムアタック', sa: 'スコアアタック', survival: '勝ち抜き' };
  openSkillAndConfirmFlow({
    charId: selectedCharId,
    extraText: `練習: ${modeNames[selectedSingleMode] || 'フリー'}`,
    okLabel: 'OK！スタート',
    onConfirm: () => startSingleMode()
  });
}

function beginComStartFlow() {
  SE.play('select');
  const skillOn = !!document.getElementById('com-cheat-toggle')?.checked;
  if (!skillOn) {
    startComGameFromSlider();
    return;
  }
  const lv = parseInt(document.getElementById('com-level-slider')?.value, 10) || 2;
  openSkillAndConfirmFlow({
    charId: selectedCharId,
    extraText: `COM対戦 (${selectedComCount}人 / Lv.${lv})`,
    okLabel: 'OK！対戦開始',
    onConfirm: () => startComGameFromSlider()
  });
}

function beginOnlineCreateFlow() {
  SE.play('select');
  const skillOn = !!document.getElementById('online-skill-toggle')?.checked;
  if (!skillOn) {
    createRoom();
    return;
  }
  const maxP = document.getElementById('online-max-players')?.value || '2';
  openSkillAndConfirmFlow({
    charId: selectedCharId,
    extraText: `オンライン部屋作成 (${maxP}人 / スキルON)`,
    okLabel: 'OK！部屋を作る',
    onConfirm: () => createRoom()
  });
}

function beginOnlineJoinFlow() {
  const code = document.getElementById('peer-room-id')?.value.trim();
  if (!code) { SE.play('cancel'); showToast('部屋コードを入力してください'); return; }
  SE.play('select');
  const skillOn = !!document.getElementById('online-skill-toggle')?.checked;
  if (!skillOn) {
    joinRoom();
    return;
  }
  openSkillAndConfirmFlow({
    charId: selectedCharId,
    extraText: `部屋参加: ${code.toUpperCase()}`,
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
// 縦UIハブ大型立ち絵（ランダム/固定） & Switch風メニュー2ペイン制御
// ==========================================
function refreshMenuHeaderAndPreview(rerollHubChar = false) {
  // 横画面Switch風：使用中キャラ表示
  const charId = resolvePlayableCharId(selectedCharId);
  const ch = getCharacterById(charId);
  const customUrl = (charId === 'custom' && CustomAssets.chara) ? CustomAssets.chara.dataUrl : null;
  const heroImg = document.getElementById('switch-hero-img');
  if (heroImg && typeof applyCharacterImageToElement === 'function') {
    applyCharacterImageToElement(heroImg, charId, 'normal', { customUrl });
  }

  // 縦UIハブ：ランダム（または設定で固定された）キャラを大きく表示
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

function refreshMenuLayoutState(rerollHubChar = false) {
  const menuOverlay = document.getElementById('menu-overlay');
  if (!menuOverlay) return;
  const isLandscape = window.innerWidth > window.innerHeight && window.innerWidth >= 700;
  const isVis = (id) => {
    const el = document.getElementById(id);
    return el && window.getComputedStyle(el).display !== 'none';
  };
  const isWaiting = isVis('room-waiting');
  // ハブ画面（メイン / ひとりで / みんなで）のみ立ち絵表示。深い階層に入ったら完全排除
  const isHub = !isWaiting && (
    (isVis('main-menu') && isVis('main-menu-actions')) ||
    isVis('solo-hub-menu') ||
    isVis('multi-hub-menu')
  );

  menuOverlay.classList.toggle('switch-hub-active', isLandscape && isHub);
  menuOverlay.classList.toggle('vertical-hub-active', !isLandscape && isHub);

  const verticalHubHero = document.getElementById('vertical-hub-hero');
  if (verticalHubHero) {
    verticalHubHero.style.display = (!isLandscape && isHub) ? 'flex' : 'none';
  }
  const heroPanel = document.getElementById('switch-hero-panel');
  if (heroPanel) {
    heroPanel.style.display = (isLandscape && isHub) ? 'flex' : 'none';
  }
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
    const isSkillModalVisible = document.getElementById('skill-select-modal')?.style.display === 'flex';
    const isConfirmModalVisible = document.getElementById('confirm-match-modal')?.style.display === 'flex';
    const isSharePrepVisible = document.getElementById('share-prep-overlay')?.style.display === 'flex';
    const isMenuHoverContext = !isGameVisible || isResultVisible || isSettingsVisible || isSkillModalVisible || isConfirmModalVisible || isSharePrepVisible;
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
// ローカル対戦：スマブラ風 上半分タイル＆下半分4等分立ち絵・スキル・OK帯
// ==========================================
let localSlotsConfig = [
  { isCom: false, comLevel: 3, charId: 'main00', skillId: 'erase_color',       phase: 'char', cursorStage: 'char', charCursorIdx: 0, skillCursorIdx: 0 },
  { isCom: false, comLevel: 3, charId: 'sub01',  skillId: 'erase_rows',        phase: 'char', cursorStage: 'char', charCursorIdx: 1, skillCursorIdx: 1 },
  { isCom: true,  comLevel: 3, charId: 'sub02',  skillId: 'purify_garbage',    phase: 'ready', cursorStage: 'char', charCursorIdx: 2, skillCursorIdx: 2 },
  { isCom: true,  comLevel: 3, charId: 'sub03',  skillId: 'corrupt_enemy_row', phase: 'ready', cursorStage: 'char', charCursorIdx: 3, skillCursorIdx: 3 }
];
let activeLocalTouchActor = 0;
let localAutoStartTimer = null;
let localMenuPadPrev = [{}, {}, {}, {}];
let localMenuPadHold = [
  { Up: 0, Down: 0, Left: 0, Right: 0 },
  { Up: 0, Down: 0, Left: 0, Right: 0 },
  { Up: 0, Down: 0, Left: 0, Right: 0 },
  { Up: 0, Down: 0, Left: 0, Right: 0 }
];

function getLocalPlayerCount() {
  return Math.max(2, Math.min(4, parseInt(document.getElementById('local-player-count')?.value, 10) || 2));
}

function isLocalSkillRuleOn() {
  return !!document.getElementById('local-skill-toggle')?.checked;
}

function cancelLocalAutoStart() {
  if (localAutoStartTimer) {
    clearTimeout(localAutoStartTimer);
    localAutoStartTimer = null;
  }
}

function resetLocalSelectionStates() {
  cancelLocalAutoStart();
  const cnt = getLocalPlayerCount();
  for (let i = 0; i < 4; i++) {
    const slot = localSlotsConfig[i];
    if (i === 0) slot.isCom = false;
    slot.charCursorIdx = Math.max(0, CHAR_PICKER_ORDER.indexOf(slot.charId));
    slot.skillCursorIdx = Math.max(0, SKILL_IDS.indexOf(slot.skillId));
    if (slot.isCom) {
      slot.phase = 'ready';
      slot.cursorStage = 'char';
    } else {
      slot.phase = 'char';
      slot.cursorStage = 'char';
    }
  }
  if (activeLocalTouchActor >= cnt || localSlotsConfig[activeLocalTouchActor].isCom) {
    activeLocalTouchActor = 0;
  }
}

function onLocalCountChange() {
  cancelLocalAutoStart();
  SE.play('select');
  const count = getLocalPlayerCount();
  for (let i = 0; i < count; i++) {
    if (localSlotsConfig[i].isCom) localSlotsConfig[i].phase = 'ready';
  }
  if (activeLocalTouchActor >= count) activeLocalTouchActor = 0;
  renderLocalMenuUI();
}

function onLocalSkillRuleToggle() {
  cancelLocalAutoStart();
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

function toggleLocalSlotCom(slotIdx) {
  if (slotIdx === 0) return;
  cancelLocalAutoStart();
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

function adjustLocalComLevel(slotIdx, delta) {
  const slot = localSlotsConfig[slotIdx];
  slot.comLevel = Math.max(1, Math.min(99, (slot.comLevel || 3) + delta));
  SE.play('cursorMove');
  renderLocalMenuUI();
}

function findNextUnreadyHumanSlot(fallback = 0) {
  const count = getLocalPlayerCount();
  for (let i = 0; i < count; i++) {
    if (!localSlotsConfig[i].isCom && localSlotsConfig[i].phase !== 'ready') return i;
  }
  return fallback;
}

function confirmLocalCharForSlot(slotIdx, tileIdx) {
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

  if (slot.isCom) {
    slot.phase = 'ready';
  } else if (isLocalSkillRuleOn()) {
    slot.phase = 'skill';
    slot.cursorStage = 'skill';
  } else {
    slot.phase = 'ready';
  }
  SE.play('select');
  renderLocalMenuUI();
  checkLocalAllReady();
}

function confirmLocalSkillForSlot(slotIdx, tileIdx) {
  if (!isLocalSkillRuleOn()) return;
  const slot = localSlotsConfig[slotIdx];
  const skId = SKILL_IDS[tileIdx];
  if (!skId) return;
  cancelLocalAutoStart();
  slot.skillCursorIdx = tileIdx;
  slot.skillId = skId;
  slot.phase = 'ready';
  SE.play('select');

  if (slotIdx === activeLocalTouchActor) {
    activeLocalTouchActor = findNextUnreadyHumanSlot(slotIdx);
  }
  renderLocalMenuUI();
  checkLocalAllReady();
}

function cancelLocalStepForSlot(slotIdx) {
  cancelLocalAutoStart();
  const slot = localSlotsConfig[slotIdx];
  if (slot.isCom) {
    slot.phase = (slot.phase === 'ready') ? 'char' : 'ready';
    slot.cursorStage = 'char';
    SE.play('cancel');
    renderLocalMenuUI();
    return;
  }
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

function moveLocalTileCursor(slotIdx, dx, dy) {
  const slot = localSlotsConfig[slotIdx];
  if (!slot || slot.phase === 'ready') return;

  if (slot.cursorStage === 'char') {
    const cols = 5;
    const total = CHAR_PICKER_ORDER.length;
    let idx = slot.charCursorIdx;
    let r = Math.floor(idx / cols);
    let c = idx % cols;
    const rows = Math.ceil(total / cols);
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
    const cols = 4;
    const total = SKILL_IDS.length;
    let idx = slot.skillCursorIdx;
    let r = Math.floor(idx / cols);
    let c = idx % cols;
    const rows = Math.ceil(total / cols);
    c = (c + dx + cols) % cols;
    r = (r + dy + rows) % rows;
    let nextIdx = r * cols + c;
    if (nextIdx >= total) nextIdx = total - 1;
    if (nextIdx !== slot.skillCursorIdx) {
      slot.skillCursorIdx = nextIdx;
      slot.skillId = SKILL_IDS[nextIdx];
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
  const count = getLocalPlayerCount();
  for (let slotIdx = 0; slotIdx < count; slotIdx++) {
    const slot = localSlotsConfig[slotIdx];
    if (slot.isCom) continue;
    const pSlot = playerConfigs[slotIdx].padSlot;
    const padObj = (pSlot >= 0 && pads[pSlot]) ? pads[pSlot] : null;
    if (!padObj) {
      localMenuPadHold[slotIdx] = { Up: 0, Down: 0, Left: 0, Right: 0 };
      continue;
    }
    const prev = localMenuPadPrev[slotIdx];
    const cur = {};
    padObj.buttons.forEach((b, i) => cur[i] = b.pressed);
    const cfg = playerConfigs[slotIdx].pad;
    const just = (btnIdx) => btnIdx !== null && btnIdx !== undefined && cur[btnIdx] && !prev[btnIdx];
    const isRep = (dir, btnIdx) => {
      if (btnIdx === null || btnIdx === undefined || !cur[btnIdx]) {
        localMenuPadHold[slotIdx][dir] = 0;
        return false;
      }
      const f = localMenuPadHold[slotIdx][dir]++;
      return f === 0 || (f >= 10 && (f - 10) % 3 === 0);
    };

    if (just(cfg.Skill) || just(cfg.GrabLeft)) {
      if (slot.phase === 'char' && slotIdx === 0) {
        backToMultiHubMenu(true);
      } else {
        cancelLocalStepForSlot(slotIdx);
      }
    } else if (just(cfg.Swap) || just(cfg.GrabRight)) {
      if (slot.phase === 'char') confirmLocalCharForSlot(slotIdx, slot.charCursorIdx);
      else if (slot.phase === 'skill') confirmLocalSkillForSlot(slotIdx, slot.skillCursorIdx);
    } else {
      if (isRep('Left', cfg.Left)) moveLocalTileCursor(slotIdx, -1, 0);
      if (isRep('Right', cfg.Right)) moveLocalTileCursor(slotIdx, 1, 0);
      if (isRep('Up', cfg.Up)) moveLocalTileCursor(slotIdx, 0, -1);
      if (isRep('Down', cfg.Down)) moveLocalTileCursor(slotIdx, 0, 1);
    }
    localMenuPadPrev[slotIdx] = cur;
  }
}

function renderLocalMenuUI() {
  const count = getLocalPlayerCount();
  const skillOn = isLocalSkillRuleOn();
  const actorBar = document.getElementById('local-touch-actor-bar');
  const charGrid = document.getElementById('local-char-tiles');
  const skillGrid = document.getElementById('local-skill-tiles');
  const skillSection = document.getElementById('local-skill-section');
  const dockEl = document.getElementById('local-slots-dock');
  if (!charGrid || !skillGrid || !dockEl) return;

  if (activeLocalTouchActor >= count) activeLocalTouchActor = 0;

  if (actorBar) {
    actorBar.innerHTML = '';
    const colors = ['#10b981', '#f43f5e', '#fbbf24', '#a855f7'];
    for (let i = 0; i < count; i++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'local-actor-btn' + (activeLocalTouchActor === i ? ' active' : '');
      if (activeLocalTouchActor === i) {
        btn.style.background = colors[i];
        btn.style.borderColor = '#fff';
        if (i === 2) btn.style.color = '#070b14';
      }
      btn.innerText = `${i + 1}P操作`;
      btn.onclick = () => {
        activeLocalTouchActor = i;
        SE.play('cursorMove');
        renderLocalMenuUI();
      };
      actorBar.appendChild(btn);
    }
  }

  charGrid.innerHTML = '';
  CHAR_PICKER_ORDER.forEach((cid, tIdx) => {
    const ch = getCharacterById(cid);
    const isCustomEmpty = (cid === 'custom' && !CustomAssets.chara);
    const tile = document.createElement('button');
    tile.type = 'button';
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
      if (!sl.isCom && sl.phase === 'char' && sl.charCursorIdx === tIdx) {
        tile.classList.add(`has-cursor-${i}`);
        const chip = document.createElement('span');
        chip.className = `local-cursor-chip p${i}`;
        chip.innerText = `${i + 1}P`;
        badges.appendChild(chip);
      }
    }

    tile.append(badges, imgWrap, lbl);
    tile.onclick = () => {
      const targetSlot = activeLocalTouchActor;
      if (localSlotsConfig[targetSlot].phase === 'ready') cancelLocalAutoStart();
      confirmLocalCharForSlot(targetSlot, tIdx);
    };
    charGrid.appendChild(tile);
  });

  if (skillSection) skillSection.classList.toggle('disabled-section', !skillOn);
  skillGrid.innerHTML = '';
  SKILL_IDS.forEach((skId, tIdx) => {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'local-select-tile';
    tile.disabled = !skillOn;

    const icon = document.createElement('div');
    icon.className = 'local-tile-skill-icon';
    icon.innerText = SKILL_ICONS[skId] || '⚡';

    const lbl = document.createElement('div');
    lbl.className = 'local-tile-label';
    lbl.innerText = SKILL_LABELS[skId] || skId;

    const badges = document.createElement('div');
    badges.className = 'local-cursor-badges';
    if (skillOn) {
      for (let i = 0; i < count; i++) {
        const sl = localSlotsConfig[i];
        if (!sl.isCom && sl.phase === 'skill' && sl.skillCursorIdx === tIdx) {
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
      const targetSlot = activeLocalTouchActor;
      confirmLocalSkillForSlot(targetSlot, tIdx);
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
    const displayCharId = (slot.phase === 'char' && !slot.isCom)
      ? (CHAR_PICKER_ORDER[slot.charCursorIdx] || slot.charId)
      : slot.charId;
    const ch = getCharacterById(displayCharId);
    const displaySkillId = (slot.phase === 'skill' && !slot.isCom)
      ? (SKILL_IDS[slot.skillCursorIdx] || slot.skillId)
      : slot.skillId;

    slotEl.className = `local-dock-slot p${i}` + (activeLocalTouchActor === i ? ' is-active-touch' : '');
    slotEl.onclick = (e) => {
      if (e.target.closest('button')) return;
      activeLocalTouchActor = i;
      if (slot.phase === 'ready' && !slot.isCom) {
        cancelLocalStepForSlot(i);
      } else {
        SE.play('cursorMove');
        renderLocalMenuUI();
      }
    };

    const topRow = document.createElement('div');
    topRow.className = 'local-slot-top';
    const tag = document.createElement('span');
    tag.className = 'local-slot-tag';
    tag.innerText = `${i + 1}P` + (slot.isCom ? ' (COM)' : '');
    topRow.appendChild(tag);

    if (i > 0) {
      const toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.className = 'local-slot-type-btn';
      toggleBtn.innerText = slot.isCom ? 'COM⇄人' : '人⇄COM';
      toggleBtn.onclick = (ev) => { ev.stopPropagation(); toggleLocalSlotCom(i); };
      topRow.appendChild(toggleBtn);
    }
    slotEl.appendChild(topRow);

    if (slot.isCom) {
      const lvRow = document.createElement('div');
      lvRow.className = 'local-slot-com-lv';
      const minus = document.createElement('button');
      minus.type = 'button'; minus.className = 'local-slot-lv-btn'; minus.innerText = '-';
      minus.onclick = (ev) => { ev.stopPropagation(); adjustLocalComLevel(i, -5); };
      const lvTxt = document.createElement('span');
      lvTxt.innerText = `Lv.${slot.comLevel}`;
      const plus = document.createElement('button');
      plus.type = 'button'; plus.className = 'local-slot-lv-btn'; plus.innerText = '+';
      plus.onclick = (ev) => { ev.stopPropagation(); adjustLocalComLevel(i, 5); };
      lvRow.append(minus, lvTxt, plus);
      slotEl.appendChild(lvRow);
    }

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
    slotEl.append(portrait, charNameEl);

    const skBox = document.createElement('div');
    skBox.className = 'local-slot-skill-box';
    if (skillOn) {
      const skIcon = SKILL_ICONS[displaySkillId] || '⚡';
      const skLabel = SKILL_LABELS[displaySkillId] || displaySkillId;
      const skDesc = SKILL_DESCRIPTIONS[displaySkillId] || '';
      skBox.innerHTML = `
        <div class="local-slot-skill-name">${skIcon} ${skLabel}</div>
        <div class="local-slot-skill-desc">${skDesc}</div>
      `;
    } else {
      skBox.innerHTML = `
        <div class="local-slot-skill-name" style="color:#94a3b8;">スキル: OFF</div>
        <div class="local-slot-skill-desc">スキルなしの純粋パズル対戦</div>
      `;
    }
    slotEl.appendChild(skBox);

    if (slot.phase !== 'ready') {
      const hint = document.createElement('div');
      hint.className = 'local-slot-phase-hint';
      hint.innerText = slot.phase === 'char' ? 'キャラ選択中…' : 'スキル選択中…';
      slotEl.appendChild(hint);
    } else {
      const okRibbon = document.createElement('div');
      okRibbon.className = 'local-slot-ok-ribbon';
      okRibbon.innerText = 'OK!';
      slotEl.appendChild(okRibbon);
    }

    dockEl.appendChild(slotEl);
  }
}

function startLocalGame() {
  cancelLocalAutoStart();
  const count = getLocalPlayerCount();
  const skillEnabled = isLocalSkillRuleOn();
  startGame('local', 3, count, skillEnabled);
}

// ==========================================
// シェア対戦 & メニューナビゲーション
// ==========================================
let sharePrepConfig = {
  p1: { charId: 'main00', handicap: 3, skillEnabled: false, skillId: 'erase_color', ready: false },
  p2: { charId: 'sub01',  handicap: 3, skillId: 'erase_rows', ready: false }
};
let shareStartTimer = null;

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
  let lastTrigger = 0;
  const trigger = (e) => {
    const now = performance.now();
    if (now - lastTrigger < 120) return;
    lastTrigger = now;
    if (e && e.cancelable) e.preventDefault();
    handler(e);
  };
  el.addEventListener('pointerdown', trigger);
  el.addEventListener('click', (e) => {
    if (performance.now() - lastTrigger < 350) { e.preventDefault(); return; }
    trigger(e);
  });
}

function openSharePrepMenu() {
  cancelLocalAutoStart();
  SE.play('select');
  if (typeof closeRangeDigitEdit === 'function') closeRangeDigitEdit();
  sharePrepConfig.p1.ready = false;
  sharePrepConfig.p2.ready = false;
  if (sharePrepConfig.p1.charId === 'custom' && !CustomAssets.chara) sharePrepConfig.p1.charId = 'main00';
  if (sharePrepConfig.p2.charId === 'custom' && !CustomAssets.chara) sharePrepConfig.p2.charId = 'sub01';
  if (shareStartTimer) { clearTimeout(shareStartTimer); shareStartTimer = null; }
  const overlay = document.getElementById('share-prep-overlay');
  if (overlay) overlay.style.display = 'flex';
  updateShareForcePortraitClass();
  renderSharePrepUI();
}

function closeSharePrepMenu(silent = false) {
  if (shareStartTimer) { clearTimeout(shareStartTimer); shareStartTimer = null; }
  const overlay = document.getElementById('share-prep-overlay');
  const wasOpen = overlay && overlay.style.display === 'flex';
  if (overlay) overlay.style.display = 'none';
  document.body.classList.remove('share-force-portrait');
  if (wasOpen && !silent) SE.play('cancel');
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
  container.innerHTML = '';

  const hdr = document.createElement('div');
  hdr.className = 'share-prep-header';
  const curCh = getCharacterById(cfg.charId);
  hdr.innerHTML = `<span style="color:${isP1 ? '#00e676' : '#ff4081'};">${isP1 ? '1P (下側)' : '2P (上側)'}</span><span>キャラ: ${curCh.name}</span>`;

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
  } else {
    const ruleBadge = document.createElement('span');
    ruleBadge.className = 'share-prep-lbl';
    ruleBadge.style.color = skillEnabled ? '#ffd700' : '#94a3b8';
    ruleBadge.innerText = `スキル:${skillEnabled ? 'ON(1P決定)' : 'OFF(1P決定)'}`;
    skRow.appendChild(ruleBadge);
  }
  const skillShort = {
    erase_color: '2色消', erase_rows: '1・5・9段', purify_garbage: '浄化', corrupt_enemy_row: '侵食',
    seal_skill: '封印', convert_blocks: '変換', sacrifice: '代償', no_skill: '無'
  };
  SKILL_IDS.forEach(skId => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'share-pill-btn' + (cfg.skillId === skId ? ' active' : '');
    b.disabled = !skillEnabled;
    b.innerText = skillShort[skId] || skId;
    bindMultiTouchTap(b, () => {
      if (!sharePrepConfig.p1.skillEnabled) return;
      cfg.skillId = skId; cfg.ready = false;
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

  container.append(hdr, grid, hdRow, skRow, readyBtn);
}

function startShareGame() {
  const overlay = document.getElementById('share-prep-overlay');
  if (overlay) overlay.style.display = 'none';
  startGame('share', 3, 2, sharePrepConfig.p1.skillEnabled);
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
  hideAllMenuSubViews();
  document.getElementById('solo-hub-menu').style.display = 'flex';
  setSwitchHeroPreview('ひとりで', 'ストーリー・COM対戦・各種練習モードを楽しめます。', 'SOLO PLAY');
  refreshMenuLayoutState(true);
}
function showMultiHubMenu() {
  SE.play('select');
  hideAllMenuSubViews();
  document.getElementById('multi-hub-menu').style.display = 'flex';
  setSwitchHeroPreview('みんなで', '1台で最大4人対戦、またはP2Pオンライン対戦を選べます。', 'MULTI PLAY');
  refreshMenuLayoutState(true);
}
function backToMainMenu(playSe = true) {
  if (playSe) SE.play('cancel');
  cancelLocalAutoStart();
  if (typeof closeRangeDigitEdit === 'function') closeRangeDigitEdit();
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
}
function backToSoloHubMenu(playSe = true) {
  if (playSe) SE.play('cancel');
  if (typeof closeRangeDigitEdit === 'function') closeRangeDigitEdit();
  hideAllMenuSubViews();
  document.getElementById('solo-hub-menu').style.display = 'flex';
  refreshMenuLayoutState(true);
}
function backToMultiHubMenu(playSe = true) {
  if (playSe) SE.play('cancel');
  cancelLocalAutoStart();
  if (typeof closeRangeDigitEdit === 'function') closeRangeDigitEdit();
  closeSharePrepMenu(true);
  hideAllMenuSubViews();
  document.getElementById('multi-hub-menu').style.display = 'flex';
  refreshMenuLayoutState(true);
}

function handleMenuCancelAction() {
  if (document.getElementById('confirm-match-modal')?.style.display === 'flex') {
    backFromConfirmModal();
    return true;
  }
  if (document.getElementById('skill-select-modal')?.style.display === 'flex') {
    closeSkillSelectModal();
    return true;
  }
  if (document.getElementById('settings-overlay')?.style.display === 'block') {
    cancelSettings();
    return true;
  }
  if (document.getElementById('room-waiting')?.style.display === 'flex') {
    cancelRoom();
    return true;
  }
  const isVisible = (id) => {
    const el = document.getElementById(id);
    return el && window.getComputedStyle(el).display !== 'none';
  };
  if (isVisible('story-menu') || isVisible('single-menu') || isVisible('com-menu')) {
    backToSoloHubMenu(true);
    return true;
  }
  if (isVisible('local-menu') || isVisible('online-menu')) {
    backToMultiHubMenu(true);
    return true;
  }
  if (isVisible('solo-hub-menu') || isVisible('multi-hub-menu') || isVisible('ranking-menu')) {
    backToMainMenu(true);
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

function showSingleMenu() {
  SE.play('select');
  hideAllMenuSubViews();
  document.getElementById('single-menu').style.display = 'flex';
  selectSingleModeBtn(selectedSingleMode);
  syncHandicapFromSlider(document.getElementById('handicap-val')?.value || 3);
  renderCharPicker('single-char-picker', { storyOnly: false });
  if (typeof enhanceAllRangeSliders === 'function') enhanceAllRangeSliders();
  refreshMenuLayoutState();
}

function showComMenu() {
  SE.play('select');
  hideAllMenuSubViews();
  document.getElementById('com-menu').style.display = 'flex';
  selectComCountBtn(selectedComCount);
  syncHandicapFromSlider(document.getElementById('handicap-val')?.value || 3);
  renderCharPicker('com-char-picker', { storyOnly: false });
  if (typeof enhanceAllRangeSliders === 'function') enhanceAllRangeSliders();
  refreshMenuLayoutState();
}

function showLocalMenu() {
  SE.play('select');
  hideAllMenuSubViews();
  document.getElementById('local-menu').style.display = 'flex';
  resetLocalSelectionStates();
  renderLocalMenuUI();
  refreshMenuLayoutState();
}

function showOnlineMenu(silent = false) {
  if (!silent) SE.play('select');
  hideAllMenuSubViews();
  document.getElementById('online-menu').style.display = 'flex';
  syncHandicapFromSlider(document.getElementById('handicap-val')?.value || 3);
  renderCharPicker('online-char-picker', { storyOnly: false });
  if (typeof enhanceAllRangeSliders === 'function') enhanceAllRangeSliders();
  refreshMenuLayoutState();
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

function updateSingleMenu() {
  document.getElementById('survival-settings').style.display = (selectedSingleMode === 'survival') ? 'flex' : 'none';
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
  let initLevel = 1;
  if (mode === 'survival') {
    survivalBaseLevel = parseInt(document.getElementById('survival-init-level').value) || 1;
    initLevel = getSurvivalLevel(survivalBaseLevel, 1);
  }
  startGame('single_' + mode, initLevel, mode === 'survival' ? 2 : 1, skillEnabled);
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
    const el = document.getElementById(`rival-wrapper-${idx}`);
    if (el) el.classList.toggle('targeted', idx === myTargetIndex && !opp.engine.gameOver);
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
  animEl.style.cssText = `position:fixed;left:${fromRect.left+fromRect.width/2-25}px;top:${fromRect.top+fromRect.height/2-25}px;width:50px;height:50px;background:${isHard?'#a8b2bd':'#5c636a'};border:4px solid #fff;border-radius:8px;box-shadow:0 0 15px #fff;z-index:1000;transition:all 0.8s cubic-bezier(0.25,1,0.5,1);pointer-events:none;`;
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

function distributeGarbage(senderId, totalBlocks, isHard) {
  if (isMatchOver && !isPracticeMode) return;
  if (currentMode.startsWith('online')) { distributeGarbageOnline(senderId, totalBlocks, isHard); return; }

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
  if (hasTarget && candidateOpponents.length > 1) {
    const targetBlocks = Math.floor(totalBlocks * 0.5);
    const otherEachBlocks = Math.floor((totalBlocks * 0.5) / (candidateOpponents.length - 1));
    candidateOpponents.forEach(opp => {
      const count = (opp.id === targetOppId) ? targetBlocks : otherEachBlocks;
      if (count > 0) {
        sentAny = true;
        playGarbageSendAnimation(senderId, opp.id, isHard);
        sendBlocksToOpponent(opp, count, isHard);
      }
    });
  } else {
    const eachBlocks = Math.floor(totalBlocks / candidateOpponents.length);
    if (eachBlocks > 0) {
      sentAny = true;
      candidateOpponents.forEach(opp => {
        playGarbageSendAnimation(senderId, opp.id, isHard);
        sendBlocksToOpponent(opp, eachBlocks, isHard);
      });
    }
  }
  if (sentAny) playAttackVoiceForSender(senderId);
}

function distributeGarbageOnline(senderId, totalBlocks, isHard) {
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
  let targetsDict = {};
  if (hasTarget && candidateOpponents.length > 1) {
    const targetBlocks = Math.floor(totalBlocks * 0.5);
    const otherEachBlocks = Math.floor((totalBlocks * 0.5) / (candidateOpponents.length - 1));
    candidateOpponents.forEach(opp => {
      const count = (opp.id === targetOppId) ? targetBlocks : otherEachBlocks;
      if (count > 0) targetsDict[opp.id] = count;
    });
  } else {
    const eachBlocks = Math.floor(totalBlocks / candidateOpponents.length);
    if (eachBlocks > 0) candidateOpponents.forEach(opp => targetsDict[opp.id] = eachBlocks);
  }
  if (Object.keys(targetsDict).length === 0) return;

  playAttackVoiceForSender(senderId);
  if (myOnlineId === 'host') {
    for (const [tId, count] of Object.entries(targetsDict)) {
      playGarbageSendAnimation(senderId, tId, isHard);
      if (tId === 'host') { if (!isPracticeMode) sendBlocksToOpponent({ engine: myEngine }, count, isHard); }
      else {
        const opp = opponents.find(o => o.id === tId);
        if (opp && opp.type === 'com') sendBlocksToOpponent(opp, count, isHard);
      }
    }
    onlineConnections.forEach(c => { if (c && c.open) c.send({ type: 'add_garbage_multi', senderId, targets: targetsDict, isHard }); });
  } else {
    for (const tId of Object.keys(targetsDict)) playGarbageSendAnimation(myOnlineId, tId, isHard);
    if (onlineConnections[0] && onlineConnections[0].open) {
      onlineConnections[0].send({ type: 'garbage_request', senderId: myOnlineId, targets: targetsDict, isHard });
    }
  }
}

function sendBlocksToOpponent(opp, count, isHard) {
  if (!opp || !opp.engine) return;
  let finalCount = count;
  if (opp.engine.isSacrifice) {
    finalCount = Math.ceil(finalCount * 1.2);
  }
  let fullRows = Math.floor(finalCount / 6), remainder = finalCount % 6;
  if (fullRows > 0) opp.engine.addGarbage(6, fullRows, isHard, true);
  if (remainder >= 3 || (remainder > 0 && fullRows === 0)) opp.engine.addGarbage(remainder, 1, isHard, true);
}

let battleEndState = { active: false, canDismissAt: 0, onContinue: null, prevAnyPadPressed: false };

function buildBattleEndPortraitDom(wrapEl, theme, isWin) {
  if (!wrapEl) return;
  wrapEl.innerHTML = '';
  wrapEl.classList.toggle('lose', !isWin);

  const showFallbackCard = () => {
    wrapEl.innerHTML = `<div class="story-fallback-card" style="background:${theme?.color || '#334155'};">${theme?.name || ''}</div>`;
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
    } else showFallbackCard();
    return;
  }

  if (theme.charId && typeof applyCharacterImageToElement === 'function') {
    applyCharacterImageToElement(img, theme.charId, isWin ? 'normal' : 'lose', {
      fallbackToNormal: true, onLoad: handleLoad, onError: showFallbackCard
    });
    wrapEl.appendChild(img);
    return;
  }

  if (theme.charSrc) {
    img.onload = () => handleLoad(img);
    img.onerror = showFallbackCard;
    img.src = theme.charSrc;
    wrapEl.appendChild(img);
  } else showFallbackCard();
}

function showBattleEndOverlay(options) {
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
    buildBattleEndPortraitDom(document.getElementById('battle-end-share-p1-wrap'), options.p1Theme, p1Win);
    buildBattleEndPortraitDom(document.getElementById('battle-end-share-p2-wrap'), options.p2Theme, p2Win);
    document.getElementById('battle-end-share-p1-name').innerText = options.p1Theme ? options.p1Theme.name : '1P';
    document.getElementById('battle-end-share-p2-name').innerText = options.p2Theme ? options.p2Theme.name : '2P';
    if (typeof VOICE !== 'undefined') VOICE.play('win', p1Win ? options.p1Theme : options.p2Theme);
  } else {
    shareView.style.display = 'none';
    singleView.style.display = 'flex';
    const badge = document.getElementById('battle-end-badge');
    badge.innerText = options.titleOverride || (options.isWin ? 'WIN!!' : 'LOSE...');
    badge.className = 'battle-end-badge ' + (options.isWin ? 'win' : 'lose');
    buildBattleEndPortraitDom(document.getElementById('battle-end-portrait-wrap'), options.theme, !!options.isWin);
    document.getElementById('battle-end-name').innerText = options.theme ? options.theme.name : '';
    if (typeof VOICE !== 'undefined') VOICE.play(options.isWin ? 'win' : 'lose', options.theme, options.senderId || null);
  }
  overlay.style.display = 'flex';
}

function hideBattleEndOverlay() {
  battleEndState.active = false;
  battleEndState.onContinue = null;
  const overlay = document.getElementById('battle-end-overlay');
  if (overlay) overlay.style.display = 'none';
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

function showResultModal(titleMsg) {
  stopBgm();
  hideBattleEndOverlay();
  document.getElementById('result-title').innerText = titleMsg;
  document.getElementById('result-status').innerText = '';
  const btn = document.getElementById('result-rematch-btn');
  btn.style.display = 'inline-block';
  btn.disabled = false;
  btn.innerText = 'もう一度対戦する';
  document.getElementById('result-overlay').style.display = 'flex';
  if (document.activeElement) document.activeElement.blur();
  btn.focus();
}

function requestRematch() {
  SE.play('select');
  if (hostDisconnected) { exitGame(true); return; }
  if (currentMode === 'story') startGame('story', currentComLevel, 2, currentSkillEnabled);
  else if (currentMode === 'single_survival') startSingleMode();
  else if (currentMode === 'single' || currentMode.startsWith('single_') || currentMode === 'com' || currentMode === 'local' || currentMode === 'share') {
    startGame(currentMode, currentComLevel, currentTotalPlayers, currentSkillEnabled);
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
  myEngine = new PonEngine(null, null, handicap, true);
  myEngine.isPractice = true;
  myEngine.garbageQueue = [];
  myEngine.onSendGarbage = null;
  myEngine.onStateChange = (state) => {
    if (state === 'gameover') {
      myEngine = new PonEngine(null, null, handicap, true);
      myEngine.isPractice = true;
      myEngine.onSendGarbage = null;
    }
  };
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
      let winnerText = 'DRAW!', winnerEngine = null, winnerTheme = null, winnerId = null;
      if (myEngine && !myEngine.gameOver && !isDeadInMatch) {
        winnerId = 'player'; winnerEngine = myEngine; winnerTheme = myRenderer.theme;
        winnerText = `🏆 1P (${winnerTheme.name}) WIN!!`;
      } else {
        const survivor = opponents.find(o => o.engine && !o.engine.gameOver);
        if (survivor) {
          winnerId = survivor.id; winnerEngine = survivor.engine; winnerTheme = survivor.renderer.theme;
          winnerText = `🏆 ${survivor.index + 2}P (${winnerTheme.name}) WIN!!`;
        }
      }
      if (myEngine && myEngine !== winnerEngine) myEngine.startGameOverFillAnim();
      opponents.forEach(o => { if (o.engine && o.engine !== winnerEngine) o.engine.startGameOverFillAnim(); });

      const showEndScreen = () => {
        if (currentMode === 'share') {
          showBattleEndOverlay({
            mode: 'share', winnerId: winnerId || 'player',
            p1Theme: myRenderer.theme, p2Theme: opponents[0] ? opponents[0].renderer.theme : null,
            onContinue: () => showResultModal(winnerText)
          });
        } else if (winnerTheme) {
          showBattleEndOverlay({
            mode: 'single', isWin: true, theme: winnerTheme, titleOverride: winnerText,
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
    if (currentMode === 'online') {
      onlineConnections.forEach(c => { if (c && c.open) c.send({ type: 'sync', senderId: myOnlineId, gameOver: true }); });
    }
    stopBgm();
    if (currentMode === 'story' || currentMode === 'com' || currentMode.startsWith('single')) {
      matchState = 'gameover';
      stopAllEngines();
    }
    let scoreVal = currentMode === 'single_survival' ? currentSurvivalWins : myEngine.score;
    let isRankIn = false;
    if (currentMode !== 'story' && currentMode !== 'online') {
      isRankIn = saveRankingData(currentMode, { score: scoreVal, handicap: myEngine.handicap, level: currentComLevel, date: Date.now() });
    }
    myEngine.startGameOverFillAnim(() => {
      if (currentMode === 'story') {
        showBattleEndOverlay({ mode: 'single', isWin: false, theme: myRenderer.theme, onContinue: () => StoryManager.onBattleEnd(false) });
      } else if (currentMode.startsWith('single')) {
        const ttl = isRankIn ? 'NEW RECORD!' : 'GAME OVER';
        showBattleEndOverlay({ mode: 'single', isWin: false, theme: myRenderer.theme, titleOverride: ttl, onContinue: () => showResultModal(ttl) });
      } else {
        const ttl = isRankIn ? 'LOSE...\n(NEW RECORD)' : 'LOSE...';
        showBattleEndOverlay({ mode: 'single', isWin: false, theme: myRenderer.theme, titleOverride: ttl, onContinue: () => showResultModal(ttl) });
      }
    });
  }

  if (!isMatchOver && opponents.length > 0 && aliveCount === 1 && !myEngine.gameOver && !isDeadInMatch) {
    if (currentMode === 'single_survival') {
      const comOpp = opponents[0];
      if (comOpp.engine && comOpp.engine.gameOver && !comOpp.coolTimeStarted) {
        comOpp.coolTimeStarted = true;
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
      stopAllEngines();
      stopBgm();
      opponents.forEach(o => { if (o.engine) o.engine.startGameOverFillAnim(); });
      let isRankIn = false;
      if (currentMode === 'com') {
        isRankIn = saveRankingData('com', { score: myEngine.score, handicap: myEngine.handicap, level: currentComLevel, date: Date.now() });
      }
      myEngine.startVictoryClearAnim(() => {
        if (currentMode === 'story') {
          showBattleEndOverlay({ mode: 'single', isWin: true, theme: myRenderer.theme, onContinue: () => StoryManager.onBattleEnd(true) });
        } else {
          const winTitle = isRankIn ? 'WIN!!\n(NEW RECORD)' : 'WIN!!';
          showBattleEndOverlay({ mode: 'single', isWin: true, theme: myRenderer.theme, titleOverride: winTitle, onContinue: () => showResultModal(winTitle) });
        }
      });
    }
  }

  if (isMatchOver && aliveCount <= 1) {
    matchState = 'gameover';
    if (hostDisconnected) setTimeout(() => { showToast("ホストが退出済みのため解散します。"); exitGame(true); }, 3000);
    else if (myOnlineId === 'host') checkRematchCondition();
  }
}

function stopAllEngines() {
  if (myEngine) {
    myEngine.isRisingManualBtn = myEngine.isRisingManualKey = myEngine.isRisingManualPad = false;
    myEngine.riseSpeed = 0;
  }
  opponents.forEach(opp => {
    if (opp.engine) {
      opp.engine.isRisingManualBtn = opp.engine.isRisingManualKey = opp.engine.isRisingManualPad = false;
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
    const panicThresholdR = ROWS * 0.3;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
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
  if (!isBgmIntendedToPlay) return;
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

let currentSkillEnabled = false;
const PLAYER_SKILL_MAX = 3;
const PLAYER_SKILL_SCORE_STEP = 300;
let playerSkillState = {
  enabled: false,
  skillId: 'erase_color',
  isNoSkill: false,
  isSacrifice: false,
  usesLeft: 0,
  maxUses: PLAYER_SKILL_MAX,
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
  if (skillId === 'no_skill' || skillId === 'sacrifice') return false;
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

function initPlayerSkillState(enabled, skillId = selectedPlayerSkill) {
  const skId = skillId || 'erase_color';
  const isNoSkill = (skId === 'no_skill');
  const isSacrifice = !!enabled && (skId === 'sacrifice');

  playerSkillState.enabled = !!enabled;
  playerSkillState.skillId = skId;
  playerSkillState.isNoSkill = isNoSkill;
  playerSkillState.isSacrifice = isSacrifice;
  playerSkillState.usesLeft = (enabled && !isNoSkill && !isSacrifice) ? PLAYER_SKILL_MAX : 0;
  playerSkillState.nextRequiredScore = 0;
  playerSkillState.prevReady = !!enabled && !isNoSkill && !isSacrifice;

  const myWrapper = document.getElementById('my-wrapper');
  if (myWrapper) myWrapper.classList.toggle('sacrifice-aura', isSacrifice);
  if (myEngine && typeof myEngine.setSacrifice === 'function') {
    myEngine.setSacrifice(isSacrifice);
  }
  updateSkillButtonUI();
}

function applySkillSealToMainPlayer(amount = 300) {
  if (!myEngine || myEngine.gameOver || isPracticeMode) return;
  if (playerSkillState.enabled && !playerSkillState.isNoSkill && !playerSkillState.isSacrifice && playerSkillState.usesLeft > 0) {
    playerSkillState.nextRequiredScore = Math.max(playerSkillState.nextRequiredScore, myEngine.score) + amount;
    playerSkillState.prevReady = false;
  }
  showPlayerHeaderCutin(myRenderer.theme, `SEALED +${amount}!`, '#a855f7');
  showToast(`スキル封印を受けた！必要スコア +${amount}`);
  updateSkillButtonUI();
}

function formatSacrificeRemainText(engine) {
  const elapsed = engine ? engine.timeElapsed : 0;
  const remSec = Math.max(0, Math.ceil((300000 - elapsed) / 1000));
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
  const skName = (typeof SKILL_LABELS !== 'undefined' && SKILL_LABELS[skillId]) ? SKILL_LABELS[skillId] : 'スキル';

  if (skillId === 'no_skill') {
    bar.classList.remove('ready');
    bar.innerHTML = `<div class="local-skill-bar-fill" style="width:0%"></div><span class="local-skill-bar-text">ノースキル (不可)</span>`;
    return;
  }
  if (skillId === 'sacrifice') {
    bar.classList.remove('ready');
    bar.innerHTML = `<div class="local-skill-bar-fill" style="width:100%;background:rgba(220,38,38,0.5);"></div><span class="local-skill-bar-text">💀代償 残り${formatSacrificeRemainText(engine)}</span>`;
    return;
  }
  if (skillState.usesLeft <= 0) {
    bar.classList.remove('ready');
    bar.innerHTML = `<div class="local-skill-bar-fill" style="width:0%"></div><span class="local-skill-bar-text">${skName} 終了 (0/${PLAYER_SKILL_MAX})</span>`;
    return;
  }
  const remain = Math.max(0, skillState.nextRequiredScore - curScore);
  if (remain === 0) {
    bar.classList.add('ready');
    bar.innerHTML = `<div class="local-skill-bar-fill" style="width:100%"></div><span class="local-skill-bar-text">${skName} OK! (${skillState.usesLeft}/${PLAYER_SKILL_MAX})</span>`;
  } else {
    bar.classList.remove('ready');
    const pct = Math.min(100, Math.floor((Math.max(0, PLAYER_SKILL_SCORE_STEP - remain) / PLAYER_SKILL_SCORE_STEP) * 100));
    bar.innerHTML = `<div class="local-skill-bar-fill" style="width:${pct}%"></div><span class="local-skill-bar-text">${skName}(${skillState.usesLeft}/${PLAYER_SKILL_MAX}) あと${remain}</span>`;
  }
}

function updateSkillButtonVisual(btn, label, prog, skillState, engine, skillId) {
  if (!btn || !label || !prog) return;
  if (!skillState || !skillState.enabled || isPracticeMode) { btn.style.display = 'none'; return; }
  btn.style.display = 'flex';
  btn.classList.remove('sacrifice-active');
  const curScore = engine ? engine.score : 0;
  const skName = (typeof SKILL_LABELS !== 'undefined' && SKILL_LABELS[skillId]) ? SKILL_LABELS[skillId] : 'スキル';

  if (skillId === 'no_skill') {
    btn.disabled = true; btn.classList.remove('ready'); prog.style.width = '0%';
    label.innerText = 'ノースキル\n使用不可';
    return;
  }
  if (skillId === 'sacrifice') {
    btn.disabled = true; btn.classList.remove('ready'); btn.classList.add('sacrifice-active');
    prog.style.width = '100%';
    label.innerText = `💀 代償発動中\n残 ${formatSacrificeRemainText(engine)}`;
    return;
  }
  if (skillState.usesLeft <= 0) {
    btn.disabled = true; btn.classList.remove('ready'); prog.style.width = '0%';
    label.innerText = `${skName}\n終了 (0/${PLAYER_SKILL_MAX})`;
    return;
  }
  const remain = Math.max(0, skillState.nextRequiredScore - curScore);
  if (remain === 0) {
    btn.disabled = false; btn.classList.add('ready'); prog.style.width = '100%';
    label.innerText = `${skName}\n発動 (${skillState.usesLeft}/${PLAYER_SKILL_MAX})`;
  } else {
    btn.disabled = true; btn.classList.remove('ready');
    const pct = Math.min(100, Math.floor((Math.max(0, PLAYER_SKILL_SCORE_STEP - remain) / PLAYER_SKILL_SCORE_STEP) * 100));
    prog.style.width = `${pct}%`;
    label.innerText = `${skName}(${skillState.usesLeft}/${PLAYER_SKILL_MAX})\nあと${remain}点`;
  }
}

function updateSkillButtonUI() {
  checkSkillFilledSound(playerSkillState, myEngine, playerSkillState.skillId || selectedPlayerSkill);

  const btn = document.getElementById('skill-btn'), label = document.getElementById('skill-btn-label'), prog = document.getElementById('skill-btn-progress');
  const p2Btn = document.getElementById('p2-skill-btn'), p2Label = document.getElementById('p2-skill-btn-label'), p2Prog = document.getElementById('p2-skill-btn-progress');
  if (currentMode === 'local') {
    if (btn) btn.style.display = 'none';
    if (p2Btn) p2Btn.style.display = 'none';
    renderLocalSkillBarElement('my-local-skill-bar', playerSkillState, myEngine, localSlotsConfig[0].skillId);
    opponents.forEach((opp, i) => {
      if (opp.type === 'local_human' && opp.skillState) {
        checkSkillFilledSound(opp.skillState, opp.engine, opp.skillId);
        renderLocalSkillBarElement(`rival-local-skill-bar-${i}`, opp.skillState, opp.engine, opp.skillId);
      }
    });
    return;
  }
  const myBar = document.getElementById('my-local-skill-bar');
  if (myBar) myBar.style.display = 'none';
  if (currentMode === 'share') {
    updateSkillButtonVisual(btn, label, prog, playerSkillState, myEngine, sharePrepConfig.p1.skillId);
    const p2Opp = opponents[0];
    if (p2Opp && p2Opp.skillState) {
      checkSkillFilledSound(p2Opp.skillState, p2Opp.engine, p2Opp.skillId);
      updateSkillButtonVisual(p2Btn, p2Label, p2Prog, p2Opp.skillState, p2Opp.engine, p2Opp.skillId);
    } else if (p2Btn) p2Btn.style.display = 'none';
    return;
  }
  if (p2Btn) p2Btn.style.display = 'none';
  updateSkillButtonVisual(btn, label, prog, playerSkillState, myEngine, playerSkillState.skillId || selectedPlayerSkill);
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
  if (playerSkillState.isNoSkill || playerSkillState.isSacrifice) return;
  if (matchState !== 'playing' || isMatchOver) return;
  if (playerSkillState.usesLeft <= 0 || myEngine.score < playerSkillState.nextRequiredScore) return;
  if (typeof executePlayerCheatSkill !== 'function') return;

  let chosenSkill = playerSkillState.skillId || selectedPlayerSkill;
  if (currentMode === 'local') chosenSkill = localSlotsConfig[0].skillId || 'erase_color';
  else if (currentMode === 'share') chosenSkill = sharePrepConfig.p1.skillId || 'erase_color';

  const senderId = currentMode === 'online' ? myOnlineId : 'player';
  const res = executePlayerCheatSkill(myEngine, senderId, myTargetIndex, chosenSkill);
  if (!res || !res.success) {
    if (currentMode !== 'local' && currentMode !== 'share') showToast('今はそのスキルを発動できる対象がありません');
    return;
  }
  if (typeof SE !== 'undefined' && SE.customBuffers && SE.customBuffers.skill) SE.play('skill');
  playAttackVoiceForSender(senderId);
  playerSkillState.usesLeft--;
  playerSkillState.nextRequiredScore = myEngine.score + PLAYER_SKILL_SCORE_STEP;
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
  if (opp.skillId === 'no_skill' || opp.skillId === 'sacrifice') return;
  if (matchState !== 'playing' || isMatchOver) return;
  if (opp.skillState.usesLeft <= 0 || opp.engine.score < opp.skillState.nextRequiredScore) return;
  if (typeof executePlayerCheatSkill !== 'function') return;

  const res = executePlayerCheatSkill(opp.engine, opp.id, opp.targetId || -1, opp.skillId || 'erase_color');
  if (!res || !res.success) return;
  if (typeof SE !== 'undefined' && SE.customBuffers && SE.customBuffers.skill) SE.play('skill');
  playAttackVoiceForSender(opp.id);
  opp.skillState.usesLeft--;
  opp.skillState.nextRequiredScore = opp.engine.score + PLAYER_SKILL_SCORE_STEP;
  opp.skillState.prevReady = false;
  updateSkillButtonUI();

  if (currentMode === 'share') showHeaderCutinById(`rival-header-cutin-${opp.index}`, opp.renderer.theme, res.text, '#ff007f');
  else { opp.engine.cutinMax = 50; opp.engine.cutinTimer = 50; opp.engine.cutinText = res.text; }
}

function activateShareP2Skill() {
  if (currentMode !== 'share' || !opponents[0]) return;
  activateLocalOpponentSkill(opponents[0]);
}

// ==========================================
// バトル中サイド演出枠 & 縦画面最下部閲覧専用ステータスバー
// ==========================================
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

function refreshBattleSidePanels() {
  const p1Card = document.getElementById('battle-side-p1');
  const p2Card = document.getElementById('battle-side-p2');
  if (!p1Card || !p2Card) return;

  const isPortrait = window.innerHeight > window.innerWidth;
  const isLandscapeLarge = !isPortrait && !useMobileLayoutInLandscape;
  const isGameShown = document.getElementById('game-area')?.style.display !== 'none';
  const showSideCards = isGameShown && isLandscapeLarge && currentMode !== 'local' && currentMode !== 'share' && window.innerWidth >= 920;

  if (!showSideCards || !myRenderer || !myRenderer.theme) {
    p1Card.style.display = 'none';
    p2Card.style.display = 'none';
    return;
  }

  p1Card.style.display = 'flex';
  p1Card.style.borderColor = myRenderer.theme.color || '#10b981';
  document.getElementById('battle-side-p1-name').innerText = myRenderer.theme.name || 'YOU';
  document.getElementById('battle-side-p1-tag').innerText = 'PLAYER';
  setSidePortraitElement(document.getElementById('battle-side-p1-img'), myRenderer.theme);

  const oppTarget = (myTargetIndex >= 0 && opponents[myTargetIndex])
    ? opponents[myTargetIndex]
    : (opponents.find(o => o.engine && !o.engine.gameOver) || opponents[0]);

  if (oppTarget && oppTarget.renderer && oppTarget.renderer.theme) {
    p2Card.style.display = 'flex';
    p2Card.style.borderColor = oppTarget.renderer.theme.color || '#f43f5e';
    document.getElementById('battle-side-p2-name').innerText = oppTarget.renderer.theme.name || oppTarget.name || 'RIVAL';
    document.getElementById('battle-side-p2-tag').innerText = (myTargetIndex >= 0 && opponents[myTargetIndex]) ? '🎯 TARGET' : 'RIVAL';
    setSidePortraitElement(document.getElementById('battle-side-p2-img'), oppTarget.renderer.theme);
  } else {
    p2Card.style.display = 'none';
  }
}

function getModeLabelForBottomBar() {
  if (currentMode === 'story') return 'STORY';
  if (currentMode === 'com') return `COM戦 Lv.${currentComLevel}`;
  if (currentMode === 'online') return 'ONLINE P2P';
  if (currentMode === 'single_ta') return 'TIME ATTACK';
  if (currentMode === 'single_sa') return 'SCORE ATTACK';
  if (currentMode === 'single_survival') return `勝ち抜き ${currentSurvivalWins}勝`;
  return 'PRACTICE';
}

function updateBottomStatusBar() {
  const bar = document.getElementById('battle-bottom-status-bar');
  if (!bar) return;
  if (bar.style.display === 'none' || !myEngine || !myRenderer || !myRenderer.theme) return;

  const nameEl = document.getElementById('bottom-status-name');
  const modeEl = document.getElementById('bottom-status-mode');
  const statsEl = document.getElementById('bottom-status-stats');
  const avatarEl = document.getElementById('bottom-status-avatar');

  if (nameEl) nameEl.innerText = myRenderer.theme.name || 'YOU';
  if (modeEl) modeEl.innerText = getModeLabelForBottomBar();
  if (avatarEl && avatarEl.dataset.charLoaded !== (myRenderer.theme.charSrc || myRenderer.theme.charId)) {
    avatarEl.dataset.charLoaded = myRenderer.theme.charSrc || myRenderer.theme.charId || '';
    setSidePortraitElement(avatarEl, myRenderer.theme);
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

function startGame(mode, level = 1, totalPlayers = 2, skillEnabled = false) {
  cancelLocalAutoStart();
  if (typeof closeRangeDigitEdit === 'function') closeRangeDigitEdit();
  document.getElementById('result-overlay').style.display = 'none';
  hideBattleEndOverlay();
  currentMode = mode; currentComLevel = level; currentTotalPlayers = totalPlayers; currentSkillEnabled = !!skillEnabled;
  matchState = 'ready'; isPracticeMode = false;

  const runInit = () => {
    const storyOverlay = document.getElementById('story-overlay');
    if (storyOverlay) storyOverlay.style.display = 'none';
    document.getElementById('menu-overlay').style.display = 'none';
    document.getElementById('game-area').style.display = 'flex';

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
  myTargetIndex = -1; currentMatchId = Date.now(); currentSurvivalWins = 0; maxChainInMatch = 0;
  hidePlayerHeaderCutin();
  resetAllLocalInputStates();

  const myWrapper = document.getElementById('my-wrapper');
  if (myWrapper) myWrapper.classList.remove('sacrifice-aura');

  const handicap = currentMode === 'share'
    ? (sharePrepConfig.p1.handicap || 3)
    : (currentMode === 'local' ? 3 : (parseInt(document.getElementById('handicap-val').value) || 3));
  const sharedSeed = Math.floor(Math.random() * 0xFFFFFFFF);

  myRenderer = new BoardRenderer('my-canvas');
  myEngine = new PonEngine(
    (state) => { if (state === 'gameover') checkMatchEnd(); },
    (totalBlocks, isHard) => { distributeGarbage('player', totalBlocks, isHard); },
    handicap, true, sharedSeed
  );
  myEngine.onRowPushed = handleMyRowPushed;
  myEngine.garbageQueue = [];
  myEngine.allowBoardCutin = (currentMode === 'local');
  if (currentMode === 'single_survival' && document.getElementById('survival-keep-speed').checked) myEngine.keepSpeed = true;

  let rawCharId = selectedCharId;
  let mySkillId = selectedPlayerSkill;
  if (currentMode === 'story') rawCharId = StoryManager.getSelectedCharId();
  else if (currentMode === 'local') {
    rawCharId = localSlotsConfig[0].charId;
    mySkillId = localSlotsConfig[0].skillId || 'erase_color';
  } else if (currentMode === 'share') {
    rawCharId = sharePrepConfig.p1.charId;
    mySkillId = sharePrepConfig.p1.skillId || 'erase_color';
  }

  const resolvedCharId = resolvePlayableCharId(rawCharId);
  myRenderer.theme = buildThemeForCharacter(
    resolvedCharId,
    (resolvedCharId === 'custom' && CustomAssets.chara) ? CustomAssets.chara.dataUrl : null,
    true,
    resolvedCharId === 'custom' ? getPlayerDisplayName() : null
  );
  if (typeof applyBoardFrame === 'function') applyBoardFrame('my-wrapper', (currentMode === 'local' || currentMode === 'share') ? myRenderer.theme.frameSrc : null);
  if (typeof applyGlobalFrameTheme === 'function') applyGlobalFrameTheme(CustomAssets.frame ? CustomAssets.frame.dataUrl : null);
  document.getElementById('player-label').innerText = (currentMode === 'local' || currentMode === 'share') ? `1P: ${myRenderer.theme.name}` : myRenderer.theme.name;

  myEngine.onChainEnd = (chain) => {
    if (chain > maxChainInMatch) maxChainInMatch = chain;
    showPlayerHeaderCutin(myRenderer.theme, `${chain} CHAIN!!`, '#ffd700');
  };
  myEngine.onSimultaneousMatch = (size) => showPlayerHeaderCutin(myRenderer.theme, `${size}個消し！`, '#00d4ff');
  initPlayerSkillState(currentSkillEnabled, mySkillId);

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
    wrapper.className = 'board-wrapper rival-board' + (isComMode ? ' com-board' : '');
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

    if (currentMode === 'local' || isShareMode) {
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

    const oppHandicap = isShareMode ? (sharePrepConfig.p2.handicap || 3) : 3;
    const rEngine = new PonEngine(
      (state) => { if (state === 'gameover') checkMatchEnd(); },
      (totalBlocks, isHard) => { distributeGarbage(oppId, totalBlocks, isHard); },
      oppHandicap, (currentMode === 'local' || isShareMode), sharedSeed
    );
    rEngine.garbageQueue = []; rEngine.allowBoardCutin = (currentMode === 'local');

    const oppInputState = isLocalHuman ? createPlayerInputState() : null;
    if (isLocalHuman) {
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

    const oppSkillId = isShareMode
      ? (sharePrepConfig.p2.skillId || 'erase_color')
      : ((slotCfg && slotCfg.skillId) ? slotCfg.skillId : 'erase_color');

    let rAI = null;
    if (isComMode) {
      if (currentMode === 'story' && StoryManager.activeStage) {
        const stCfg = StoryManager.activeStageConfig || StoryManager.getStageConfig(StoryManager.activeStage);
        rAI = (stCfg.useCheat && typeof cheat === 'function')
          ? new cheat(rEngine, stCfg.level, oppId, { skillType: stCfg.skillType, maxSkillUses: 10 })
          : new ComAI(rEngine, stCfg.level, oppId);
      } else {
        const comLv = (currentMode === 'local' && slotCfg) ? slotCfg.comLevel : currentComLevel;
        const useCheat = ((currentMode === 'com' || currentMode === 'single_survival' || currentMode === 'local') && currentSkillEnabled);
        const maxUses = (currentMode === 'single_survival' || currentMode === 'local') ? 3 : 10;
        const aiOpts = { maxSkillUses: maxUses };
        if (currentMode === 'local' && slotCfg) {
          aiOpts.skillType = 'single';
          aiOpts.fixedSkill = oppSkillId;
        }
        rAI = (useCheat && typeof cheat === 'function') ? new cheat(rEngine, comLv, oppId, aiOpts) : new ComAI(rEngine, comLv, oppId);
      }
    }

    const oppIsSacrifice = !!currentSkillEnabled && (
      (isLocalHuman && oppSkillId === 'sacrifice') ||
      (isComMode && rEngine.isSacrifice)
    );
    if (oppIsSacrifice) {
      rEngine.setSacrifice(true);
      wrapper.classList.add('sacrifice-aura');
    }

    const oppIsNoSkill = (oppSkillId === 'no_skill' || oppSkillId === 'sacrifice');
    const oppObj = {
      id: oppId, name: oppName, type: isLocalHuman ? 'local_human' : 'com',
      playerSlotIndex: i + 1, skillId: oppSkillId, engine: rEngine, renderer: rRenderer, ai: rAI,
      index: i, targetId: null, inputState: oppInputState,
      skillState: isLocalHuman ? {
        enabled: currentSkillEnabled,
        usesLeft: (currentSkillEnabled && !oppIsNoSkill) ? PLAYER_SKILL_MAX : 0,
        nextRequiredScore: 0,
        prevReady: !!currentSkillEnabled && !oppIsNoSkill
      } : null
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

function startSingleGame() { selectedSingleMode = 'free'; startGame('single_free', 1, 1, false); }
function startComGame(level) {
  const skillEnabled = !!document.getElementById('com-cheat-toggle')?.checked;
  startGame('com', level, selectedComCount || 2, skillEnabled);
}
function startComGameFromSlider() {
  const level = parseInt(document.getElementById('com-level-slider').value) || 2;
  const skillEnabled = !!document.getElementById('com-cheat-toggle')?.checked;
  startGame('com', level, selectedComCount || 2, skillEnabled);
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
    if (controls && controls.parentNode !== gameContainer) gameContainer.appendChild(controls);
    if (p2Controls && p2Controls.parentNode !== gameContainer) gameContainer.appendChild(p2Controls);
    if (myWrapper && myWrapper.parentNode !== gameContainer) gameContainer.appendChild(myWrapper);
    if (rivalsArea && rivalsArea.parentNode !== gameContainer) gameContainer.appendChild(rivalsArea);
  }
  if (p1Zone && p1Zone.parentNode) p1Zone.parentNode.removeChild(p1Zone);
  if (p2Zone && p2Zone.parentNode) p2Zone.parentNode.removeChild(p2Zone);
}

function exitGame(silent = false) {
  if (myEngine && !currentMode.startsWith('single')) {
    if (!isMatchOver && !isPracticeMode && !myEngine.gameOver) {
      if (!confirm("退出してメニューに戻りますか？\n（対戦時は負けになります）")) {
        if (!silent) SE.play('cancel');
        return;
      }
    }
    onlineConnections.forEach(c => { if(c && c.open) c.send({ type: 'leave', senderId: myOnlineId }); });
  }
  if (!silent) SE.play('cancel');
  isMatchOver = true; isDeadInMatch = true; matchState = 'gameover'; isPracticeMode = false;
  hostDisconnected = false; endSequenceTriggered = false;
  clearReadyGoTimers(); hideBattleEndOverlay(); stopAllEngines(); stopBgm(); hidePlayerHeaderCutin();
  if (typeof hideOnlineSyncOverlay === 'function') hideOnlineSyncOverlay();
  if (typeof closeRangeDigitEdit === 'function') closeRangeDigitEdit();
  if (typeof SE !== 'undefined' && SE.clearRemoteSounds) SE.clearRemoteSounds();
  if (typeof VOICE !== 'undefined' && VOICE.clearRemoteVoices) VOICE.clearRemoteVoices();
  cleanupShareDomZones();
  document.getElementById('my-wrapper')?.classList.remove('sacrifice-aura');
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
  backToMainMenu(false);
}

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
    padGrabState: { active: false, side: 'left', col: 0, row: 0, consumed: false },
    keyGrabState: { active: false, side: 'left', col: 0, row: 0, consumed: false }
  };
}

let p1InputState = createPlayerInputState();
let padState = p1InputState.padState, prevPadState = p1InputState.prevPadState;
let padHoldFrames = p1InputState.padHoldFrames, padGrabState = p1InputState.padGrabState, keyGrabState = p1InputState.keyGrabState;
let touchRowFollowCallback = null, shareP2RowFollowCallback = null;
const PAD_DAS_FRAMES = 15, PAD_ARR_FRAMES = 4;

function resetAllLocalInputStates() {
  p1InputState = createPlayerInputState();
  padState = p1InputState.padState; prevPadState = p1InputState.prevPadState;
  padHoldFrames = p1InputState.padHoldFrames; padGrabState = p1InputState.padGrabState; keyGrabState = p1InputState.keyGrabState;
  shareP2RowFollowCallback = null;
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

function pollSingleGamepad(engine, cfgPad, stateObj, padObj, isMainPlayer, oppRef = null) {
  if (!padObj) {
    if (engine) engine.isRisingManualPad = false;
    stateObj.padHoldFrames = { Up: 0, Down: 0, Left: 0, Right: 0 };
    stateObj.padGrabState.active = stateObj.padGrabState.consumed = false;
    return;
  }
  stateObj.prevPadState = { ...stateObj.padState };
  padObj.buttons.forEach((b, i) => stateObj.padState[i] = b.pressed);
  const justPressed = (btnIdx) => btnIdx !== null && btnIdx !== undefined && stateObj.padState[btnIdx] && !stateObj.prevPadState[btnIdx];
  const isPressed = (btnIdx) => btnIdx !== null && btnIdx !== undefined && !!stateObj.padState[btnIdx];

  if (isMainPlayer && justPressed(cfgPad.Pause)) {
    if (document.getElementById('game-area').style.display === 'flex' && document.getElementById('result-overlay').style.display !== 'flex' && !battleEndState.active) {
      stateObj.padHoldFrames = { Up: 0, Down: 0, Left: 0, Right: 0 };
      stateObj.padGrabState.active = stateObj.padGrabState.consumed = false;
      exitGame();
      return;
    }
  }
  if (!engine || engine.gameOver || (isMatchOver && !isPracticeMode)) {
    stateObj.padHoldFrames = { Up: 0, Down: 0, Left: 0, Right: 0 };
    stateObj.padGrabState.active = stateObj.padGrabState.consumed = false;
    if (engine) engine.isRisingManualPad = false;
    return;
  }
  if (isMainPlayer && justPressed(cfgPad.ToggleContinuous)) toggleContinuousSwipe();
  if (justPressed(cfgPad.GrabLeft)) startGrabForEngine(engine, stateObj.padGrabState, 'left');
  else if (justPressed(cfgPad.GrabRight)) startGrabForEngine(engine, stateObj.padGrabState, 'right');
  if (stateObj.padGrabState.active) {
    if ((stateObj.padGrabState.side === 'left' && !isPressed(cfgPad.GrabLeft)) || (stateObj.padGrabState.side === 'right' && !isPressed(cfgPad.GrabRight))) {
      stateObj.padGrabState.active = stateObj.padGrabState.consumed = false;
    }
  }

  const checkDirTrigger = (dirName, btnIdx) => {
    if (!isPressed(btnIdx)) { stateObj.padHoldFrames[dirName] = 0; return false; }
    const f = stateObj.padHoldFrames[dirName]++;
    return f === 0 || (f >= PAD_DAS_FRAMES && (f - PAD_DAS_FRAMES) % PAD_ARR_FRAMES === 0);
  };
  let moved = false;
  if (isPressed(cfgPad.Up) && isPressed(cfgPad.Down)) {
    stateObj.padHoldFrames.Up = stateObj.padHoldFrames.Down = 0;
  } else {
    if (checkDirTrigger('Up', cfgPad.Up) && engine.cursor.y > 0) {
      engine.cursor.y--; moved = true;
      if (stateObj.padGrabState.active) { stateObj.padGrabState.row = engine.cursor.y; stateObj.padGrabState.col = stateObj.padGrabState.side === 'left' ? engine.cursor.x : engine.cursor.x + 1; stateObj.padGrabState.consumed = false; }
    }
    if (checkDirTrigger('Down', cfgPad.Down) && engine.cursor.y < ROWS - 1) {
      engine.cursor.y++; moved = true;
      if (stateObj.padGrabState.active) { stateObj.padGrabState.row = engine.cursor.y; stateObj.padGrabState.col = stateObj.padGrabState.side === 'left' ? engine.cursor.x : engine.cursor.x + 1; stateObj.padGrabState.consumed = false; }
    }
  }
  if (isPressed(cfgPad.Left) && isPressed(cfgPad.Right)) {
    stateObj.padHoldFrames.Left = stateObj.padHoldFrames.Right = 0;
  } else {
    if (checkDirTrigger('Left', cfgPad.Left)) {
      if (stateObj.padGrabState.active) executeGrabMoveForEngine(engine, stateObj.padGrabState, -1);
      else if (engine.cursor.x > 0) { engine.cursor.x--; moved = true; }
    }
    if (checkDirTrigger('Right', cfgPad.Right)) {
      if (stateObj.padGrabState.active) executeGrabMoveForEngine(engine, stateObj.padGrabState, 1);
      else if (engine.cursor.x < COLS - 2) { engine.cursor.x++; moved = true; }
    }
  }
  if (moved) SE.play('cursorMove');
  if (justPressed(cfgPad.Swap)) engine.swap(engine.cursor.x, engine.cursor.y);
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

function startGrabForEngine(engine, grabState, side) {
  if (!engine) return;
  grabState.active = true; grabState.side = side;
  grabState.col = side === 'left' ? engine.cursor.x : engine.cursor.x + 1;
  grabState.row = engine.cursor.y; grabState.consumed = false;
}

function executeGrabMoveForEngine(engine, grabState, dx) {
  if (!engine || !grabState.active || grabState.consumed) return false;
  const continuous = document.getElementById('continuous-swipe')?.checked;
  let swapped = false;
  if (dx > 0 && grabState.col < COLS - 1) {
    if (engine.swap(grabState.col, grabState.row)) { SE.play('cursorMove'); grabState.col++; swapped = true; }
  } else if (dx < 0 && grabState.col > 0) {
    if (engine.swap(grabState.col - 1, grabState.row)) { SE.play('cursorMove'); grabState.col--; swapped = true; }
  }
  if (swapped) {
    engine.cursor.x = grabState.side === 'left' ? Math.min(COLS - 2, Math.max(0, grabState.col)) : Math.min(COLS - 2, Math.max(0, grabState.col - 1));
    if (!continuous) grabState.consumed = true;
  }
  return swapped;
}

function pollGamepadInput() {
  const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()) : [];
  if (battleEndState.active) {
    const anyPressed = pads.some(p => p && p.connected && p.buttons.some(b => b.pressed));
    if (anyPressed && !battleEndState.prevAnyPadPressed) tryDismissBattleEndOverlay();
    battleEndState.prevAnyPadPressed = anyPressed;
    return;
  }
  const slot0 = playerConfigs[0].padSlot;
  const pad0 = (slot0 >= 0 && pads[slot0]) ? pads[slot0] : ((currentMode === 'local' || currentMode === 'share') ? null : pads.find(p => p && p.connected));
  pollSingleGamepad(myEngine, playerConfigs[0].pad, p1InputState, pad0, true, null);
  if (currentMode === 'local' || currentMode === 'share') {
    opponents.forEach(opp => {
      if (opp.type === 'local_human' && opp.inputState) {
        const slot = playerConfigs[opp.playerSlotIndex].padSlot;
        pollSingleGamepad(opp.engine, playerConfigs[opp.playerSlotIndex].pad, opp.inputState, (slot >= 0 && pads[slot]) ? pads[slot] : null, false, opp);
      }
    });
  }
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
  compressed.forEach((g, idx) => {
    const block = document.createElement('div');
    block.style.cssText = `background:${g.isHard?'#a8b2bd':'#5c636a'};border:${idx===0?'1px solid #ffd700':'1px solid #dee2e6'};border-radius:2px;width:${Math.min(34,Math.max(14,g.w*5))}px;height:${Math.min(18,Math.max(10,g.h*4))}px;flex-shrink:0;display:flex;align-items:center;justify-content:center;${idx>0?'opacity:0.55;':''}`;
    if (g.count > 1) {
      const span = document.createElement('span');
      span.innerText = `×${g.count}`;
      span.style.cssText = 'color:#fff;font-size:9px;font-weight:bold;line-height:1;text-shadow:1px 1px 1px #000;';
      block.appendChild(span);
    }
    container.appendChild(block);
  });
}

let lastTime = 0, accumulator = 0;
const FIXED_TIME_STEP = 1000 / 60;

function gameLoop(time) {
  let deltaTime = time - lastTime;
  if (deltaTime > 100) deltaTime = 100;
  lastTime = time; accumulator += deltaTime;
  while (accumulator >= FIXED_TIME_STEP) {
    pollGamepadInput();
    if (myEngine && (!isMatchOver || isPracticeMode || (myEngine.endAnim && !myEngine.endAnim.done))) myEngine.update(FIXED_TIME_STEP);
    opponents.forEach(opp => {
      const oppHasEndAnim = opp.engine && opp.engine.endAnim && !opp.engine.endAnim.done;
      if (isMatchOver && !isPracticeMode && !oppHasEndAnim) return;
      if (currentMode === 'single_survival' && opp.coolTimeStarted) {
        if (oppHasEndAnim) opp.engine.update(FIXED_TIME_STEP);
        opp.coolTime--;
        if (opp.coolTime <= 0) {
          opp.coolTimeStarted = false; opp.engine.endAnim = null; opp.engine.gameOver = false;
          opp.engine.grid = Array.from({ length: opp.engine.rows }, () => Array(opp.engine.cols).fill(null));
          opp.engine.initGrid(5);
          if (document.getElementById('survival-cancel-sent').checked) opp.engine.garbageQueue = [];
          let nextLv = getSurvivalLevel(survivalBaseLevel, currentSurvivalWins + 1);
          opp.level = nextLv;
          opp.ai = (currentSkillEnabled && typeof cheat === 'function') ? new cheat(opp.engine, nextLv, opp.id, { maxSkillUses: 3 }) : new ComAI(opp.engine, nextLv, opp.id);
          document.getElementById(`rival-name-label-0`).innerHTML = `${opp.renderer.theme.name} Lv.${nextLv} <span class="target-badge">🎯 TARGET</span>`;
        }
      } else if (opp.type === 'local_human') {
        if (opp.engine && (!opp.engine.gameOver || oppHasEndAnim)) opp.engine.update(FIXED_TIME_STEP);
      } else {
        const isLocalControlledCom = (opp.type === 'com') && (currentMode === 'com' || currentMode === 'single_survival' || currentMode === 'story' || currentMode === 'local' || myOnlineId === 'host');
        if (isLocalControlledCom || oppHasEndAnim) {
          if (isLocalControlledCom && opp.ai && !opp.engine.gameOver) opp.ai.update();
          if (opp.engine && (!opp.engine.gameOver || oppHasEndAnim)) opp.engine.update(FIXED_TIME_STEP);
        }
      }
    });
    if (!isMatchOver || isPracticeMode) checkPanic();
    accumulator -= FIXED_TIME_STEP;
  }

  if (myEngine) {
    myRenderer.draw(myEngine);
    const t = Math.floor(myEngine.timeElapsed / 1000);
    document.getElementById('timer-label').innerText = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
    document.getElementById('score-label').innerText = `SCORE: ${myEngine.score} | CHAIN: ${myEngine.chain}`;
    updateGarbagePreview(myEngine, 'my-garbage-preview');
    updateSkillButtonUI();
    updateBottomStatusBar();
    if (currentMode === 'single_ta' && myEngine.timeElapsed >= 180000 && !myEngine.gameOver && !isMatchOver) {
      myEngine.gameOver = true; checkMatchEnd();
    }
  }
  opponents.forEach((opp, i) => {
    if (opp.renderer && opp.engine) {
      opp.renderer.draw(opp.engine);
      const scoreEl = document.getElementById(`rival-score-label-${i}`);
      if (scoreEl) scoreEl.innerText = currentMode === 'single_survival' ? `WINS: ${currentSurvivalWins}` : `SCORE: ${opp.engine.score}`;
      updateGarbagePreview(opp.engine, `rival-garbage-preview-${i}`);
      updateRivalSkillBadge(opp, i);
    }
  });
  loopId = requestAnimationFrame(gameLoop);
}

function handleKeyboardActionForPlayer(engine, cfgKey, stateObj, code, isRepeat, isMainPlayer, oppRef, e) {
  if (!engine || engine.gameOver || (isMatchOver && !isPracticeMode)) return false;
  let handled = false, moved = false;
  if (isMainPlayer && code === cfgKey.ToggleContinuous) { handled = true; if (!isRepeat) toggleContinuousSwipe(); }
  if (code === cfgKey.GrabLeft) { handled = true; if (!isRepeat) startGrabForEngine(engine, stateObj.keyGrabState, 'left'); }
  if (code === cfgKey.GrabRight) { handled = true; if (!isRepeat) startGrabForEngine(engine, stateObj.keyGrabState, 'right'); }
  if (code === cfgKey.Up) {
    handled = true;
    if (engine.cursor.y > 0) {
      engine.cursor.y--; moved = true;
      if (stateObj.keyGrabState.active) { stateObj.keyGrabState.row = engine.cursor.y; stateObj.keyGrabState.col = stateObj.keyGrabState.side === 'left' ? engine.cursor.x : engine.cursor.x + 1; stateObj.keyGrabState.consumed = false; }
    }
  }
  if (code === cfgKey.Down) {
    handled = true;
    if (engine.cursor.y < ROWS - 1) {
      engine.cursor.y++; moved = true;
      if (stateObj.keyGrabState.active) { stateObj.keyGrabState.row = engine.cursor.y; stateObj.keyGrabState.col = stateObj.keyGrabState.side === 'left' ? engine.cursor.x : engine.cursor.x + 1; stateObj.keyGrabState.consumed = false; }
    }
  }
  if (code === cfgKey.Left) {
    handled = true;
    if (stateObj.keyGrabState.active) executeGrabMoveForEngine(engine, stateObj.keyGrabState, -1);
    else if (engine.cursor.x > 0) { engine.cursor.x--; moved = true; }
  }
  if (code === cfgKey.Right) {
    handled = true;
    if (stateObj.keyGrabState.active) executeGrabMoveForEngine(engine, stateObj.keyGrabState, 1);
    else if (engine.cursor.x < COLS - 2) { engine.cursor.x++; moved = true; }
  }
  if (moved) SE.play('cursorMove');
  if (code === cfgKey.Swap) { handled = true; engine.swap(engine.cursor.x, engine.cursor.y); }
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
  for (let slotIdx = 0; slotIdx < count; slotIdx++) {
    const slot = localSlotsConfig[slotIdx];
    if (slot.isCom) continue;
    const cfg = playerConfigs[slotIdx].key;
    if (!cfg) continue;

    if (code === cfg.Left)  { e.preventDefault(); moveLocalTileCursor(slotIdx, -1, 0); return true; }
    if (code === cfg.Right) { e.preventDefault(); moveLocalTileCursor(slotIdx, 1, 0);  return true; }
    if (code === cfg.Up)    { e.preventDefault(); moveLocalTileCursor(slotIdx, 0, -1); return true; }
    if (code === cfg.Down)  { e.preventDefault(); moveLocalTileCursor(slotIdx, 0, 1);  return true; }
    if (code === cfg.Swap || code === cfg.GrabRight || (slotIdx === 0 && code === 'Enter')) {
      e.preventDefault();
      if (slot.phase === 'char') confirmLocalCharForSlot(slotIdx, slot.charCursorIdx);
      else if (slot.phase === 'skill') confirmLocalSkillForSlot(slotIdx, slot.skillCursorIdx);
      return true;
    }
    if (code === cfg.Skill || code === cfg.GrabLeft) {
      e.preventDefault();
      if (slot.phase !== 'char') cancelLocalStepForSlot(slotIdx);
      else if (slotIdx === 0) handleMenuCancelAction();
      return true;
    }
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

function bindBoardTouchInput(cvs, getEngine, getContinuousChecked, isSelf180Rotated, setRowFollowCb) {
  let activePointerId = null, grabbedCol = -1, grabbedRow = -1, initialCanvasX = 0, initialCanvasY = 0;
  if (setRowFollowCb) setRowFollowCb(() => { if (activePointerId !== null && grabbedRow > 0) grabbedRow--; });

  cvs.addEventListener('pointerdown', (e) => {
    const engine = getEngine();
    if (!engine || (isMatchOver && !isPracticeMode) || activePointerId !== null) return;
    activePointerId = e.pointerId;
    try { cvs.setPointerCapture(e.pointerId); } catch (_) {}
    const pt = getCanvasCoordsFromPointer(cvs, e, isSelf180Rotated);
    initialCanvasX = pt.x; initialCanvasY = pt.y;
    grabbedCol = Math.max(0, Math.min(COLS - 1, Math.floor(initialCanvasX / CELL_PX)));
    grabbedRow = Math.max(0, Math.min(ROWS - 1, Math.floor((initialCanvasY + engine.riseOffset * CELL_PX) / CELL_PX)));
  });

  cvs.addEventListener('pointermove', (e) => {
    if (e.pointerId !== activePointerId) return;
    const engine = getEngine();
    if (!engine || (isMatchOver && !isPracticeMode)) return;
    const pt = getCanvasCoordsFromPointer(cvs, e, isSelf180Rotated);
    let targetCol = Math.max(0, Math.min(COLS - 1, Math.floor(pt.x / CELL_PX)));
    const continuous = getContinuousChecked();
    while (targetCol > grabbedCol) {
      engine.cursor.x = grabbedCol; engine.cursor.y = grabbedRow;
      if (engine.swap(grabbedCol, grabbedRow)) { SE.play('cursorMove'); grabbedCol++; if (!continuous) { activePointerId = null; break; } }
      else break;
    }
    while (targetCol < grabbedCol) {
      engine.cursor.x = grabbedCol - 1; engine.cursor.y = grabbedRow;
      if (engine.swap(grabbedCol - 1, grabbedRow)) { SE.play('cursorMove'); grabbedCol--; if (!continuous) { activePointerId = null; break; } }
      else break;
    }
  });

  const endPointer = (e, isTapCandidate) => {
    if (e.pointerId !== activePointerId) return;
    activePointerId = null;
    try { cvs.releasePointerCapture(e.pointerId); } catch (_) {}
    const engine = getEngine();
    if (!isTapCandidate || !engine || (isMatchOver && !isPracticeMode)) return;
    const pt = getCanvasCoordsFromPointer(cvs, e, isSelf180Rotated);
    if (Math.abs(pt.x - initialCanvasX) < CELL_PX * 0.3 && Math.abs(pt.y - initialCanvasY) < CELL_PX * 0.3) {
      let c = Math.floor(pt.x / CELL_PX);
      if (c >= COLS - 1) c = COLS - 2;
      if (engine.cursor.x !== c || engine.cursor.y !== grabbedRow) SE.play('cursorMove');
      engine.cursor.x = c; engine.cursor.y = grabbedRow;
    }
  };
  cvs.addEventListener('pointerup', (e) => endPointer(e, true));
  cvs.addEventListener('pointercancel', (e) => endPointer(e, false));
}

function setupShareP2Input() {
  const p2Cvs = document.getElementById('rival-canvas-0');
  if (!p2Cvs || p2Cvs.dataset.shareBound === '1') return;
  p2Cvs.dataset.shareBound = '1';
  bindBoardTouchInput(p2Cvs, () => (currentMode === 'share' && opponents[0]) ? opponents[0].engine : null, () => !!document.getElementById('p2-continuous-swipe')?.checked, true, (cb) => { shareP2RowFollowCallback = cb; });
}

let inputSetupDone = false;
function setupInput() {
  if (inputSetupDone) return;
  inputSetupDone = true;

  const cvs = document.getElementById('my-canvas');
  bindBoardTouchInput(cvs, () => myEngine, () => !!document.getElementById('continuous-swipe')?.checked, false, (cb) => { touchRowFollowCallback = cb; });

  const riseBtn = document.getElementById('rise-btn');
  let p1RisePointerId = null;
  riseBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (myEngine && !(isMatchOver && !isPracticeMode)) {
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
      if (currentMode === 'share' && opp0 && opp0.engine && !(isMatchOver && !isPracticeMode)) {
        p2RisePointerId = e.pointerId;
        try { p2RiseBtn.setPointerCapture(e.pointerId); } catch (_) {}
        opp0.engine.isRisingManualBtn = true;
      }
    });
    const endP2Rise = (e) => { if (p2RisePointerId !== null && e.pointerId !== p2RisePointerId) return; p2RisePointerId = null; const opp0 = opponents[0]; if (opp0 && opp0.engine) opp0.engine.isRisingManualBtn = false; };
    ['pointerup', 'pointercancel'].forEach(ev => p2RiseBtn.addEventListener(ev, endP2Rise));
  }

  const skillBtn = document.getElementById('skill-btn');
  if (skillBtn) bindMultiTouchTap(skillBtn, () => activatePlayerSkill());
  const p2SkillBtn = document.getElementById('p2-skill-btn');
  if (p2SkillBtn) bindMultiTouchTap(p2SkillBtn, () => activateShareP2Skill());

  const battleEndOverlay = document.getElementById('battle-end-overlay');
  if (battleEndOverlay) {
    battleEndOverlay.addEventListener('pointerdown', (e) => {
      if (battleEndState.active) { e.preventDefault(); tryDismissBattleEndOverlay(); }
    });
  }

  window.addEventListener('blur', () => {
    p1InputState.keyGrabState.active = p1InputState.keyGrabState.consumed = false;
    if (myEngine) myEngine.isRisingManualKey = false;
    opponents.forEach(opp => {
      if (opp.inputState) opp.inputState.keyGrabState.active = opp.inputState.keyGrabState.consumed = false;
      if (opp.engine) opp.engine.isRisingManualKey = false;
    });
  });

  window.addEventListener('keydown', (e) => {
    if (battleEndState.active) { e.preventDefault(); tryDismissBattleEndOverlay(); return; }
    if (assigningAction && assignType === 'key') {
      e.preventDefault();
      playerConfigs[settingsPlayerIdx].key[assigningAction] = (e.code === 'Delete' || e.code === 'Backspace') ? '' : e.code;
      assigningAction = null; renderConfigUI(); SE.play('select'); return;
    }
    const code = e.code;
    const isGameVisible = document.getElementById('game-area').style.display === 'flex';
    const isResultVisible = document.getElementById('result-overlay')?.style.display === 'flex';
    const isSettingsVisible = document.getElementById('settings-overlay')?.style.display === 'block';
    const isSkillModalVisible = document.getElementById('skill-select-modal')?.style.display === 'flex';
    const isConfirmModalVisible = document.getElementById('confirm-match-modal')?.style.display === 'flex';
    const isStoryOverlayVisible = document.getElementById('story-overlay')?.style.display === 'flex';

    if (isStoryOverlayVisible) return;

    if (!isGameVisible || isResultVisible || isSettingsVisible || isSkillModalVisible || isConfirmModalVisible) {
      const tag = document.activeElement?.tagName;
      const isTextInput = tag === 'INPUT' && document.activeElement?.type === 'text';
      const isLocalMenuOpen = document.getElementById('local-menu')?.style.display === 'flex';
      const isModalOpen = isSkillModalVisible
                       || isConfirmModalVisible
                       || isSettingsVisible
                       || isResultVisible
                       || document.getElementById('share-prep-overlay')?.style.display === 'flex';

      if (!isGameVisible && isLocalMenuOpen && !isModalOpen && !isTextInput && tag !== 'SELECT' && !e.repeat) {
        if (handleLocalMenuKeyInput(code, e)) return;
      }

      if (typeof handleMenuKeyDown === 'function' && handleMenuKeyDown(e)) {
        return;
      }
      return;
    }
    if (code === keyConfig.Pause && !e.repeat && document.getElementById('result-overlay').style.display !== 'flex') {
      e.preventDefault();
      p1InputState.keyGrabState.active = p1InputState.keyGrabState.consumed = false;
      if (myEngine) myEngine.isRisingManualKey = false;
      exitGame(); return;
    }
    if (!myEngine || (isMatchOver && !isPracticeMode)) return;
    handleKeyboardActionForPlayer(myEngine, playerConfigs[0].key, p1InputState, code, e.repeat, true, null, e);
    if (currentMode === 'local' || currentMode === 'share') {
      opponents.forEach(opp => {
        if (opp.type === 'local_human' && opp.inputState) handleKeyboardActionForPlayer(opp.engine, playerConfigs[opp.playerSlotIndex].key, opp.inputState, code, e.repeat, false, opp, e);
      });
    }
  });

  window.addEventListener('keyup', (e) => {
    const releaseFor = (engine, cfgKey, stateObj) => {
      if (e.code === cfgKey.GrabLeft && stateObj.keyGrabState.active && stateObj.keyGrabState.side === 'left') stateObj.keyGrabState.active = stateObj.keyGrabState.consumed = false;
      if (e.code === cfgKey.GrabRight && stateObj.keyGrabState.active && stateObj.keyGrabState.side === 'right') stateObj.keyGrabState.active = stateObj.keyGrabState.consumed = false;
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

function adjustLayout() {
  updateShareForcePortraitClass();
  const isPortrait = window.innerHeight > window.innerWidth;
  const W = window.innerWidth, H = window.innerHeight;
  const isLeft = document.getElementById('handedness-toggle')?.checked;

  const layoutBtn = document.getElementById('layout-toggle-btn');
  if (layoutBtn) {
    layoutBtn.style.display = (!isPortrait && currentMode !== 'local' && currentMode !== 'share') ? 'block' : 'none';
    updateLayoutToggleBtnText();
  }

  const isLandscapeLarge = !isPortrait && !useMobileLayoutInLandscape;
  const oppCount = opponents.length;
  const myWrapper = document.getElementById('my-wrapper'), rivalsArea = document.getElementById('rivals-area');
  const rivalsTopArea = document.getElementById('rivals-top-area'), controls = document.getElementById('controls-container');
  const p2Controls = document.getElementById('p2-controls-container'), exitBtn = document.getElementById('exit-btn');
  const gameArea = document.getElementById('game-area'), gameContainer = document.getElementById('game-container');
  const handednessWrapper = document.getElementById('handedness-wrapper'), zoneBgEl = document.getElementById('my-zone-frame-bg');
  const bottomBar = document.getElementById('battle-bottom-status-bar');
  if (!myWrapper || !controls || !exitBtn || !gameArea || !gameContainer) return;

  const isGameShown = gameArea.style.display !== 'none';

  if (bottomBar) {
    bottomBar.style.display = (isGameShown && isPortrait && currentMode !== 'local' && currentMode !== 'share') ? 'flex' : 'none';
  }
  refreshBattleSidePanels();

  if (currentMode === 'share') {
    if (zoneBgEl) zoneBgEl.style.opacity = '0';
    document.body.classList.remove('local-force-landscape');
    gameArea.classList.add('share-mode');
    rivalsTopArea.style.display = 'none'; rivalsArea.style.display = 'none';
    const effW = Math.min(W, H), effH = Math.max(W, H), halfH = effH / 2;

    let p2Zone = document.getElementById('share-p2-zone'), p1Zone = document.getElementById('share-p1-zone');
    if (!p2Zone) { p2Zone = document.createElement('div'); p2Zone.id = 'share-p2-zone'; p2Zone.className = 'share-zone-half share-p2-zone'; gameContainer.appendChild(p2Zone); }
    if (!p1Zone) { p1Zone = document.createElement('div'); p1Zone.id = 'share-p1-zone'; p1Zone.className = 'share-zone-half share-p1-zone'; gameContainer.appendChild(p1Zone); }

    const rivalWrapper = document.getElementById('rival-wrapper-0');
    if (rivalWrapper && rivalWrapper.parentNode !== p2Zone) p2Zone.appendChild(rivalWrapper);
    if (p2Controls && p2Controls.parentNode !== p2Zone) p2Zone.appendChild(p2Controls);
    if (myWrapper.parentNode !== p1Zone) p1Zone.appendChild(myWrapper);
    if (controls.parentNode !== p1Zone) p1Zone.appendChild(controls);

    if (exitBtn.parentNode !== gameArea) gameArea.appendChild(exitBtn);
    exitBtn.className = 'action-btn retire-btn share-exit-btn';
    exitBtn.style.cssText = 'position:absolute;top:50%;left:6px;right:auto;width:auto;margin:0;';
    if (handednessWrapper) handednessWrapper.style.display = 'none';

    controls.style.cssText = 'display:flex;order:2;height:auto;width:110px;justify-content:center;position:relative;flex-direction:column;gap:6px;z-index:20;';
    if (p2Controls) p2Controls.style.cssText = 'display:flex;order:2;height:auto;width:110px;justify-content:center;position:relative;flex-direction:column;gap:6px;z-index:20;';
    myWrapper.style.order = '1';
    if (rivalWrapper) { rivalWrapper.style.order = '1'; rivalWrapper.style.position = 'relative'; rivalWrapper.style.width = ''; rivalWrapper.style.flexShrink = ''; }
    gameContainer.style.cssText = 'position:relative;width:100%;height:100%;display:flex;flex-direction:column;flex-wrap:nowrap;padding:0;gap:0;';

    const baseBoardH = 515, baseTotalW = 224 + 110 + 8;
    const scale = Math.max(0.32, Math.min(1.0, (halfH - 12) / baseBoardH, (effW - 14) / baseTotalW));
    const boardMx = (224 - 224 * scale) / -2, boardMy = (baseBoardH - baseBoardH * scale) / -2, ctrlMx = (110 - 110 * scale) / -2;
    myWrapper.style.transformOrigin = 'center'; myWrapper.style.transform = `scale(${scale})`; myWrapper.style.margin = `${boardMy}px ${boardMx}px`;
    controls.style.transformOrigin = 'center'; controls.style.transform = `scale(${scale})`; controls.style.margin = `0 ${ctrlMx}px`;
    if (rivalWrapper) { rivalWrapper.style.transformOrigin = 'center'; rivalWrapper.style.transform = `scale(${scale})`; rivalWrapper.style.margin = `${boardMy}px ${boardMx}px`; }
    if (p2Controls) { p2Controls.style.transformOrigin = 'center'; p2Controls.style.transform = `scale(${scale})`; p2Controls.style.margin = `0 ${ctrlMx}px`; }
    return;
  }

  cleanupShareDomZones();
  if (handednessWrapper) handednessWrapper.style.display = 'flex';

  if (currentMode === 'local') {
    if (zoneBgEl) zoneBgEl.style.opacity = '0';
    document.body.classList.toggle('local-force-landscape', isPortrait && isGameShown);
    const effW = isPortrait ? H : W, effH = isPortrait ? W : H;
    rivalsTopArea.style.display = 'none'; controls.style.display = 'none'; rivalsArea.style.display = 'contents';
    if (exitBtn.parentNode !== gameArea) gameArea.appendChild(exitBtn);
    exitBtn.className = 'action-btn retire-btn absolute-top';
    exitBtn.style.cssText = 'left:12px;right:auto;';

    const totalBoards = 1 + oppCount, baseW = 224, baseH = currentSkillEnabled ? 545 : 515;
    const scale = Math.max(0.32, Math.min(1.0, (effW - 24 - (totalBoards - 1) * 10) / (totalBoards * baseW), (effH - 54) / baseH));
    gameContainer.style.cssText = 'position:relative;width:100%;height:100%;display:flex;flex-direction:row;flex-wrap:nowrap;align-items:center;align-content:center;justify-content:center;gap:10px;padding:36px 8px 8px 8px;';
    const mx = (baseW - baseW * scale) / -2, my = (baseH - baseH * scale) / -2;
    myWrapper.style.order = '0'; myWrapper.style.transformOrigin = 'center'; myWrapper.style.transform = `scale(${scale})`; myWrapper.style.margin = `${my}px ${mx}px`;
    opponents.forEach((_, i) => {
      const el = document.getElementById(`rival-wrapper-${i}`);
      if (el) {
        if (el.parentNode !== rivalsArea) rivalsArea.appendChild(el);
        el.style.order = String(i + 1); el.style.position = 'relative'; el.style.width = ''; el.style.flexShrink = '';
        el.style.transformOrigin = 'center'; el.style.transform = `scale(${scale})`; el.style.margin = `${my}px ${mx}px`;
      }
    });
    return;
  }

  if (zoneBgEl) zoneBgEl.style.opacity = '1';
  document.body.classList.remove('local-force-landscape');
  controls.style.display = 'flex'; controls.style.alignItems = 'center';
  gameContainer.style.maxWidth = ''; gameContainer.style.flexWrap = 'nowrap'; gameContainer.style.alignContent = ''; gameContainer.style.gap = '10px';

  if (isLandscapeLarge) {
    rivalsTopArea.style.display = 'none'; rivalsArea.style.display = oppCount > 0 ? 'flex' : 'none';
    if (exitBtn.parentNode !== gameArea) gameArea.appendChild(exitBtn);
    exitBtn.className = 'action-btn retire-btn absolute-top'; exitBtn.style.position = ''; exitBtn.style.top = ''; exitBtn.style.width = ''; exitBtn.style.margin = '';
    if (isLeft) { exitBtn.style.right = '15px'; exitBtn.style.left = 'auto'; } else { exitBtn.style.left = '15px'; exitBtn.style.right = 'auto'; }
    opponents.forEach((_, i) => {
      const el = document.getElementById(`rival-wrapper-${i}`);
      if (el) { if (el.parentNode !== rivalsArea) rivalsArea.appendChild(el); el.style.order = ''; el.style.position = ''; el.style.transform = ''; el.style.margin = '0'; el.style.width = ''; el.style.flexShrink = ''; }
    });
    rivalsArea.style.flexDirection = 'row'; rivalsArea.style.gap = '10px';
    controls.style.height = ''; controls.style.justifyContent = 'flex-end';
    if (handednessWrapper) handednessWrapper.style.marginTop = '0';

    const sideMargin = (W >= 920) ? 168 : 10;
    gameContainer.style.cssText = `position:relative;width:100%;height:100%;display:flex;flex-direction:row;align-items:center;justify-content:center;padding:10px ${sideMargin}px 34px ${sideMargin}px;`;
    if (isLeft) { controls.style.order = 1; myWrapper.style.order = 2; rivalsArea.style.order = 3; }
    else { rivalsArea.style.order = 1; myWrapper.style.order = 2; controls.style.order = 3; }

    const availableW = Math.max(300, W - sideMargin * 2 - 140);
    const baseBoardW = 224;
    let myScale = Math.min(1.0, (H - 84) / 515);

    if (oppCount >= 2) {
      const oppScale = Math.max(0.42, Math.min(myScale * 0.78, (availableW - baseBoardW * myScale - 40) / (oppCount * baseBoardW + oppCount * 12)));
      if ((baseBoardW * myScale + oppCount * baseBoardW * oppScale + 36) > availableW) {
        myScale = Math.max(0.55, (availableW - oppCount * baseBoardW * oppScale - 36) / baseBoardW);
      }
      myWrapper.style.transform = `scale(${myScale})`;
      myWrapper.style.margin = `0 ${(baseBoardW - baseBoardW * myScale) / -2}px`;
      opponents.forEach((_, i) => {
        const el = document.getElementById(`rival-wrapper-${i}`);
        if (el) { el.style.transform = `scale(${oppScale})`; el.style.margin = `0 ${(baseBoardW - baseBoardW * oppScale) / -2}px`; }
      });
      controls.style.transform = `scale(${Math.max(0.6, myScale)})`;
    } else {
      const totalBoards = 1 + oppCount;
      if ((baseBoardW * totalBoards + 20 * totalBoards) * myScale > availableW) {
        myScale = availableW / (baseBoardW * totalBoards + 20 * totalBoards);
      }
      myScale = Math.max(0.4, myScale);
      myWrapper.style.transform = `scale(${myScale})`; myWrapper.style.margin = `0 ${(baseBoardW - baseBoardW * myScale) / -2}px`;
      opponents.forEach((_, i) => {
        const el = document.getElementById(`rival-wrapper-${i}`);
        if (el) { el.style.transform = `scale(${myScale})`; el.style.margin = `0 ${(baseBoardW - baseBoardW * myScale) / -2}px`; }
      });
      controls.style.transform = `scale(${myScale})`;
    }

    if (oppCount === 0) updateMyZoneFrameLayout(null);
    else requestAnimationFrame(() => {
      const areaRect = gameArea.getBoundingClientRect(), myRect = myWrapper.getBoundingClientRect(), ctrlRect = controls.getBoundingClientRect();
      if (myRect.width === 0) return;
      if (isLeft) updateMyZoneFrameLayout({ top: 0, left: 0, width: Math.min(W, Math.max(myRect.right, ctrlRect.right) - areaRect.left + 16), height: H, radius: '0 16px 16px 0' });
      else { const leftEdge = Math.max(0, Math.min(myRect.left, ctrlRect.left) - areaRect.left - 16); updateMyZoneFrameLayout({ top: 0, left: leftEdge, width: W - leftEdge, height: H, radius: '16px 0 0 16px' }); }
    });
  } else if (oppCount <= 1) {
    const bottomReserve = isPortrait ? 56 : 0;
    rivalsTopArea.style.display = 'none'; rivalsArea.style.display = 'none';
    if (exitBtn.parentNode !== gameArea) gameArea.appendChild(exitBtn);
    exitBtn.className = 'action-btn retire-btn absolute-top'; exitBtn.style.position = ''; exitBtn.style.top = ''; exitBtn.style.width = ''; exitBtn.style.margin = '';
    if (isLeft) { exitBtn.style.right = '12px'; exitBtn.style.left = 'auto'; } else { exitBtn.style.left = '12px'; exitBtn.style.right = 'auto'; }
    gameContainer.style.cssText = `position:relative;width:100%;height:100%;display:flex;flex-direction:${isLeft ? 'row' : 'row-reverse'};align-items:center;justify-content:center;padding:0 0 ${bottomReserve}px 0;`;
    controls.style.order = ''; myWrapper.style.order = '';

    if (oppCount === 1) {
      const rivalWrapper = document.getElementById('rival-wrapper-0');
      if (rivalWrapper) {
        if (rivalWrapper.parentNode !== controls) controls.insertBefore(rivalWrapper, controls.firstChild);
        rivalWrapper.style.setProperty('order', '-1', 'important');
        const rivalScale = 110 / 224, originalRivalH = 510;
        rivalWrapper.style.cssText += `;transform:scale(${rivalScale});transform-origin:top center;position:relative;top:0;left:auto;right:auto;z-index:25;width:224px;flex-shrink:0;margin-bottom:${originalRivalH * rivalScale - originalRivalH}px;`;
      }
      controls.style.height = '515px'; controls.style.justifyContent = 'flex-start';
      if (handednessWrapper) handednessWrapper.style.marginTop = 'auto';
    } else {
      controls.style.height = ''; controls.style.justifyContent = 'flex-end';
      if (handednessWrapper) handednessWrapper.style.marginTop = '0';
    }

    const baseBoardH = 515, availH = H - 72 - bottomReserve, contentW = 344;
    let myScale = Math.min(1.0, availH / baseBoardH);
    if (contentW * myScale > W - 10) myScale = (W - 10) / contentW;
    myScale = Math.max(0.4, myScale);
    myWrapper.style.transform = `scale(${myScale})`; controls.style.transform = `scale(${myScale})`;
    myWrapper.style.transformOrigin = 'center'; controls.style.transformOrigin = 'center';
    const boardMx = (224 - 224 * myScale) / -2, ctrlMx = (110 - 110 * myScale) / -2, scaleMy = (baseBoardH - baseBoardH * myScale) / -2;
    myWrapper.style.margin = `${scaleMy}px ${boardMx}px`; controls.style.margin = `${scaleMy}px ${ctrlMx}px`;
    controls.style.position = 'relative'; controls.style.bottom = 'auto'; controls.style.left = 'auto'; controls.style.right = 'auto'; controls.style.width = '110px';
    updateMyZoneFrameLayout(null);
  } else {
    const bottomReserve = isPortrait ? 54 : 0;
    rivalsArea.style.display = 'none';
    const maxTopH = H * 0.22;
    rivalsTopArea.style.cssText = `display:flex;position:absolute;top:4px;left:0;width:100vw;height:${maxTopH}px;flex-direction:row;align-items:center;justify-content:center;gap:6px;z-index:30;overflow:hidden;`;
    const availW = W - 12, scaleH = (maxTopH - 6) / 510, scaleW = availW / (oppCount * 224 + (oppCount - 1) * 6);
    const miniScale = Math.min(scaleH, scaleW, 0.42);

    opponents.forEach((_, i) => {
      const el = document.getElementById(`rival-wrapper-${i}`);
      if (el) {
        if (el.parentNode !== rivalsTopArea) rivalsTopArea.appendChild(el);
        el.style.order = ''; el.style.position = 'relative'; el.style.transform = `scale(${miniScale})`; el.style.transformOrigin = 'center center';
        el.style.margin = `${(510 - 510 * miniScale) / -2}px ${(224 - 224 * miniScale) / -2}px`;
        el.style.width = '224px'; el.style.flexShrink = '0';
      }
    });
    if (exitBtn.parentNode !== controls) controls.insertBefore(exitBtn, controls.firstChild);
    exitBtn.className = 'action-btn retire-btn';
    exitBtn.style.cssText = 'position:static;width:100%;padding:8px 4px;font-size:0.85rem;margin-bottom:4px;';
    controls.style.height = 'auto'; controls.style.justifyContent = 'center'; controls.style.width = '110px';
    controls.style.order = ''; myWrapper.style.order = '';
    if (handednessWrapper) handednessWrapper.style.marginTop = '0';

    gameContainer.style.cssText = `display:flex;flex-direction:${isLeft ? 'row' : 'row-reverse'};align-items:center;justify-content:center;position:absolute;top:${maxTopH + 6}px;left:0;width:100vw;height:${H - maxTopH - 6 - bottomReserve}px;padding:0;`;
    const maxCenterH = H - maxTopH - 18 - bottomReserve, contentW = 344;
    let myScale = Math.min(1.0, maxCenterH / 515);
    if (contentW * myScale > W - 10) myScale = (W - 10) / contentW;
    myScale = Math.max(0.32, myScale);
    myWrapper.style.transform = `scale(${myScale})`; controls.style.transform = `scale(${myScale})`;
    myWrapper.style.transformOrigin = 'center'; controls.style.transformOrigin = 'center';
    myWrapper.style.margin = `0 ${(224 - 224 * myScale) / -2}px`; controls.style.margin = `0 ${(110 - 110 * myScale) / -2}px`;
    const topStart = maxTopH + 4;
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
  adjustLayout();
  refreshMenuLayoutState(false);
}

window.addEventListener('resize', handleWindowLayoutChange);
window.addEventListener('orientationchange', () => setTimeout(handleWindowLayoutChange, 100));

window.addEventListener('DOMContentLoaded', () => {
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

  bindSwitchMenuHoverEvents();
  bindMenuHoverCursorSE();
  refreshMenuLayoutState(true);
  if (typeof syncPlayerSkillSelects === 'function') syncPlayerSkillSelects();
  if (typeof syncHandicapFromSlider === 'function') syncHandicapFromSlider(3);
  if (typeof enhanceAllRangeSliders === 'function') enhanceAllRangeSliders();
  if (typeof initAssetsSystem === 'function') initAssetsSystem();
  if (typeof initStorySystem === 'function') initStorySystem();
  if (typeof setupInput === 'function') setupInput();
});