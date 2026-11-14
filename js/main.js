// ==========================================
// 対戦・ターゲット・ローカルマルチ・ゲーム管理システム
// ==========================================
let myEngine, myRenderer;
let opponents = [];
let myTargetIndex = -1;
let peer = null, onlineConnections = [];
let currentMode = 'single', currentComLevel = 2, currentTotalPlayers = 2;
let matchPlayersConfig = [];
let myOnlineId = '';
let isMatchOver = false;
let isDeadInMatch = false; // 本戦での死亡フラグ（プラクティスと混同させない）
let loopId = null, syncIntervalId = null;
let matchState = 'ready'; // 'ready', 'preparing', 'playing', 'gameover'
let currentMatchId = 0;
let countdownTimer = null;
let hostDisconnected = false;
let isPracticeMode = false;
let currentSurvivalWins = 0;

// 状態管理用
let rematchReady = {};
let boardReady = {};

// プレイヤーの選択スキル（1つ選択）
let selectedPlayerSkill = localStorage.getItem('pdw_player_skill') || 'erase_color';

function onPlayerSkillSelectChange(val) {
  selectedPlayerSkill = val || 'erase_color';
  localStorage.setItem('pdw_player_skill', selectedPlayerSkill);
  syncPlayerSkillSelects();
}

function syncPlayerSkillSelects() {
  ['story-skill-select', 'single-skill-select', 'com-skill-select', 'online-skill-select'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = selectedPlayerSkill;
  });
}

// ローカル対戦用スロット設定（最大4P）
let localSlotsConfig = [
  { isCom: false, comLevel: 3, charId: 'main00', skillId: 'erase_color' },
  { isCom: false, comLevel: 3, charId: 'sub01',  skillId: 'erase_rows' },
  { isCom: true,  comLevel: 3, charId: 'sub02',  skillId: 'purify_garbage' },
  { isCom: true,  comLevel: 3, charId: 'sub03',  skillId: 'corrupt_enemy_row' }
];
let activeLocalTab = 0;

function showToast(msg) { 
  const t = document.getElementById('toast'); 
  t.innerText = msg; t.style.display = 'block'; 
  setTimeout(() => t.style.display = 'none', 3000); 
}
function showSingleMenu() {
  document.getElementById('main-menu-actions').style.display = 'none';
  document.getElementById('single-menu').style.display = 'flex';
  syncPlayerSkillSelects();
  renderCharPicker('single-char-picker', { storyOnly: false });
  updateSingleMenu();
}
function showComMenu() {
  document.getElementById('main-menu-actions').style.display = 'none';
  document.getElementById('com-menu').style.display = 'flex';
  syncPlayerSkillSelects();
  renderCharPicker('com-char-picker', { storyOnly: false });
}
function showLocalMenu() {
  document.getElementById('main-menu-actions').style.display = 'none';
  document.getElementById('local-menu').style.display = 'flex';
  renderLocalMenuUI();
}
function showOnlineMenu() {
  document.getElementById('main-menu-actions').style.display = 'none';
  document.getElementById('online-menu').style.display = 'flex';
  syncPlayerSkillSelects();
  renderCharPicker('online-char-picker', { storyOnly: false });
}
function showRankingMenu() {
  document.getElementById('main-menu-actions').style.display = 'none';
  document.getElementById('ranking-menu').style.display = 'flex';
  const mode = document.getElementById('ranking-mode-select').value;
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

function onLocalCountChange() {
  const count = parseInt(document.getElementById('local-player-count').value) || 2;
  if (activeLocalTab >= count) activeLocalTab = 0;
  renderLocalMenuUI();
}

function renderLocalMenuUI() {
  const count = parseInt(document.getElementById('local-player-count')?.value) || 2;
  const tabsEl = document.getElementById('local-player-tabs');
  const cfgEl = document.getElementById('local-slot-config');
  if (!tabsEl || !cfgEl) return;

  tabsEl.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const slot = localSlotsConfig[i];
    const chName = getCharacterById(slot.charId).name;
    const roleTag = (i === 0 || !slot.isCom) ? '人' : 'COM';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'small-btn' + (i === activeLocalTab ? ' active' : '');
    btn.innerText = `${i + 1}P: ${chName}(${roleTag})`;
    btn.onclick = () => {
      activeLocalTab = i;
      renderLocalMenuUI();
    };
    tabsEl.appendChild(btn);
  }

  const slot = localSlotsConfig[activeLocalTab];
  const padSlot = playerConfigs[activeLocalTab].padSlot;
  cfgEl.innerHTML = '';

  if (activeLocalTab === 0) {
    const lbl = document.createElement('span');
    lbl.innerHTML = `<b>1P</b>（人間）`;
    cfgEl.appendChild(lbl);
  } else {
    const typeWrap = document.createElement('label');
    typeWrap.style.display = 'flex';
    typeWrap.style.alignItems = 'center';
    typeWrap.style.gap = '4px';
    const sel = document.createElement('select');
    sel.className = 'input-box';
    sel.style.width = 'auto';
    sel.style.padding = '3px 8px';
    sel.style.fontSize = '0.78rem';
    sel.innerHTML = `<option value="human">人間</option><option value="com">COM</option>`;
    sel.value = slot.isCom ? 'com' : 'human';
    sel.onchange = () => {
      slot.isCom = (sel.value === 'com');
      renderLocalMenuUI();
    };
    typeWrap.append(`${activeLocalTab + 1}P:`, sel);
    cfgEl.appendChild(typeWrap);

    if (slot.isCom) {
      const lvWrap = document.createElement('div');
      lvWrap.style.display = 'flex';
      lvWrap.style.alignItems = 'center';
      lvWrap.style.gap = '6px';
      lvWrap.innerHTML = `<span>強さ Lv.<b id="local-com-lv-disp">${slot.comLevel}</b></span>`;
      const rng = document.createElement('input');
      rng.type = 'range'; rng.min = '1'; rng.max = '99'; rng.value = String(slot.comLevel);
      rng.style.width = '90px';
      rng.oninput = () => {
        slot.comLevel = parseInt(rng.value, 10) || 3;
        document.getElementById('local-com-lv-disp').innerText = slot.comLevel;
      };
      lvWrap.appendChild(rng);
      cfgEl.appendChild(lvWrap);
    }
  }

  if (activeLocalTab === 0 || !slot.isCom) {
    const padWrap = document.createElement('label');
    padWrap.style.display = 'flex';
    padWrap.style.alignItems = 'center';
    padWrap.style.gap = '4px';
    const pSel = document.createElement('select');
    pSel.className = 'input-box';
    pSel.style.width = 'auto';
    pSel.style.padding = '3px 8px';
    pSel.style.fontSize = '0.78rem';
    pSel.innerHTML = `
      <option value="0">Pad 0</option>
      <option value="1">Pad 1</option>
      <option value="2">Pad 2</option>
      <option value="3">Pad 3</option>
      <option value="-1">キーのみ</option>
    `;
    pSel.value = String(padSlot);
    pSel.onchange = () => {
      playerConfigs[activeLocalTab].padSlot = parseInt(pSel.value, 10);
    };
    padWrap.append('パッド:', pSel);
    cfgEl.appendChild(padWrap);

    const skWrap = document.createElement('label');
    skWrap.style.display = 'flex';
    skWrap.style.alignItems = 'center';
    skWrap.style.gap = '4px';
    const skSel = document.createElement('select');
    skSel.className = 'input-box';
    skSel.style.width = 'auto';
    skSel.style.padding = '3px 8px';
    skSel.style.fontSize = '0.78rem';
    skSel.innerHTML = `
      <option value="erase_color">マーク全消し</option>
      <option value="erase_rows">1・5・9段消し</option>
      <option value="purify_garbage">お邪魔浄化</option>
      <option value="corrupt_enemy_row">お邪魔侵食</option>
    `;
    skSel.value = slot.skillId || 'erase_color';
    skSel.onchange = () => {
      slot.skillId = skSel.value;
    };
    skWrap.append('スキル:', skSel);
    cfgEl.appendChild(skWrap);
  }

  renderCharPicker('local-char-picker', {
    storyOnly: false,
    title: `${activeLocalTab + 1}P キャラ選択`,
    currentId: slot.charId,
    onSelect: (cid) => {
      slot.charId = cid;
      renderLocalMenuUI();
    }
  });
}

function startLocalGame() {
  const count = parseInt(document.getElementById('local-player-count')?.value) || 2;
  const skillEnabled = !!document.getElementById('local-skill-toggle')?.checked;
  startGame('local', 3, count, skillEnabled);
}

function updateSingleMenu() {
  const mode = document.getElementById('single-mode-select').value;
  document.getElementById('survival-settings').style.display = (mode === 'survival') ? 'flex' : 'none';
}
let survivalBaseLevel = 1;

function getSurvivalLevel(initLv, matchNum) {
  const stage = Math.floor((matchNum - 1) / 5);
  const rawMin = matchNum <= 5 ? initLv : (matchNum <= 10 ? initLv + 5 : initLv);
  const rawMax = initLv + stage * 5 + 4;
  let minLv, maxLv;
  if (rawMax <= 99) {
    minLv = rawMin;
    maxLv = rawMax;
  } else {
    maxLv = 99;
    const overSteps = Math.ceil((rawMax - 99) / 5);
    minLv = Math.max(1, initLv - overSteps * 5);
  }
  return Math.floor(Math.random() * (maxLv - minLv + 1)) + minLv;
}

function startSingleMode() {
  const mode = document.getElementById('single-mode-select').value;
  const skillEnabled = !!document.getElementById('single-skill-toggle')?.checked;
  let initLevel = 1;
  if (mode === 'survival') {
    survivalBaseLevel = parseInt(document.getElementById('survival-init-level').value) || 1;
    initLevel = getSurvivalLevel(survivalBaseLevel, 1);
  }
  startGame('single_' + mode, initLevel, mode === 'survival' ? 2 : 1, skillEnabled);
}
function backToMainMenu() { 
  document.getElementById('com-menu').style.display = 'none'; 
  document.getElementById('single-menu').style.display = 'none'; 
  document.getElementById('local-menu').style.display = 'none';
  document.getElementById('online-menu').style.display = 'none';
  document.getElementById('ranking-menu').style.display = 'none'; 
  document.getElementById('story-menu').style.display = 'none';
  document.getElementById('main-menu-actions').style.display = 'flex'; 
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
  if (myTargetIndex === index) {
    myTargetIndex = -1;
  } else {
    if (opponents[index] && !opponents[index].engine.gameOver) {
      myTargetIndex = index;
    }
  }
  updateTargetUI();
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
  let nextPos = (currentPos + dir + validTargets.length) % validTargets.length;
  myTargetIndex = validTargets[nextPos];
  updateTargetUI();
  SE.play('cursorMove');
}

function updateTargetUI() {
  opponents.forEach((opp, idx) => {
    const el = document.getElementById(`rival-wrapper-${idx}`);
    if (el) {
      if (idx === myTargetIndex && !opp.engine.gameOver) {
        el.classList.add('targeted');
      } else {
        el.classList.remove('targeted');
      }
    }
  });
}

function playGarbageSendAnimation(fromOppId, toOppId, isHard) {
  if (!document.body) return;
  const getEl = (id) => {
    if (id === 'player' || id === myOnlineId || (id === 'host' && myOnlineId === 'host')) return document.getElementById('my-wrapper');
    const opp = opponents.find(o => o.id === id);
    if (opp) return document.getElementById(`rival-wrapper-${opp.index}`);
    return null;
  };
  
  const getTargetEl = (id) => {
    if (id === 'player' || id === myOnlineId || (id === 'host' && myOnlineId === 'host')) return document.getElementById('my-garbage-preview');
    const opp = opponents.find(o => o.id === id);
    if (opp) return document.getElementById(`rival-garbage-preview-${opp.index}`);
    return null;
  };

  const fromEl = getEl(fromOppId);
  const toEl = getTargetEl(toOppId);
  if (!fromEl || !toEl) return;
  
  const fromRect = fromEl.getBoundingClientRect();
  const toRect = toEl.getBoundingClientRect();
  
  const animEl = document.createElement('div');
  animEl.style.position = 'fixed';
  animEl.style.left = (fromRect.left + fromRect.width / 2 - 25) + 'px';
  animEl.style.top = (fromRect.top + fromRect.height / 2 - 25) + 'px';
  animEl.style.width = '50px';
  animEl.style.height = '50px';
  animEl.style.backgroundColor = isHard ? '#a8b2bd' : '#5c636a';
  animEl.style.border = '4px solid #fff';
  animEl.style.borderRadius = '8px';
  animEl.style.boxShadow = '0 0 15px rgba(255,255,255,1)';
  animEl.style.zIndex = '1000';
  animEl.style.transition = 'all 0.8s cubic-bezier(0.25, 1, 0.5, 1)';
  animEl.style.pointerEvents = 'none';
  document.body.appendChild(animEl);
  
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      animEl.style.left = (toRect.left + toRect.width / 2 - 25) + 'px';
      animEl.style.top = (toRect.top + toRect.height / 2 - 25) + 'px';
      animEl.style.transform = 'scale(0.5) rotate(720deg)';
      animEl.style.opacity = '0.3';
    });
  });
  
  setTimeout(() => {
    if (animEl.parentNode) animEl.parentNode.removeChild(animEl);
  }, 800);
}

function distributeGarbage(senderId, totalBlocks, isHard) {
  if (isMatchOver && !isPracticeMode) return;
  if (currentMode.startsWith('online')) {
    distributeGarbageOnline(senderId, totalBlocks, isHard);
    return;
  }

  let candidateOpponents = [];
  if (senderId === 'player') {
    candidateOpponents = opponents.filter(o => !o.engine.gameOver);
  } else {
    candidateOpponents = [];
    if (!myEngine.gameOver && !isPracticeMode) candidateOpponents.push({ id: 'player', engine: myEngine });
    opponents.forEach(o => {
      if (o.id !== senderId && !o.engine.gameOver) candidateOpponents.push(o);
    });
  }

  if (candidateOpponents.length === 0) return;

  let targetOppId = null;
  if (senderId === 'player' && myTargetIndex !== -1 && opponents[myTargetIndex] && !opponents[myTargetIndex].engine.gameOver) {
    targetOppId = opponents[myTargetIndex].id;
  } else if (senderId !== 'player') {
    const senderOpp = opponents.find(o => o.id === senderId);
    if (senderOpp && senderOpp.targetId) {
      const targetAlive = candidateOpponents.some(c => c.id === senderOpp.targetId);
      if (targetAlive) targetOppId = senderOpp.targetId;
    }
  }

  const hasTarget = targetOppId !== null && candidateOpponents.some(o => o.id === targetOppId);

  if (hasTarget && candidateOpponents.length > 1) {
    const targetBlocks = Math.floor(totalBlocks * 0.5);
    const remainingBlocks = totalBlocks * 0.5;
    const othersCount = candidateOpponents.length - 1;
    const otherEachBlocks = Math.floor(remainingBlocks / othersCount);

    candidateOpponents.forEach(opp => {
      const count = (opp.id === targetOppId) ? targetBlocks : otherEachBlocks;
      if (count > 0) {
        playGarbageSendAnimation(senderId, opp.id, isHard);
        sendBlocksToOpponent(opp, count, isHard);
      }
    });
  } else {
    const eachBlocks = Math.floor(totalBlocks / candidateOpponents.length);
    if (eachBlocks > 0) {
      candidateOpponents.forEach(opp => {
        playGarbageSendAnimation(senderId, opp.id, isHard);
        sendBlocksToOpponent(opp, eachBlocks, isHard);
      });
    }
  }
}

function distributeGarbageOnline(senderId, totalBlocks, isHard) {
  let candidateOpponents = [];
  if (senderId === myOnlineId) {
    candidateOpponents = opponents.filter(o => !o.engine.gameOver);
  } else {
    if (!myEngine.gameOver && !isPracticeMode) candidateOpponents.push({ id: myOnlineId, engine: myEngine });
    opponents.forEach(o => {
      if (o.id !== senderId && !o.engine.gameOver) candidateOpponents.push(o);
    });
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
    if (eachBlocks > 0) {
      candidateOpponents.forEach(opp => targetsDict[opp.id] = eachBlocks);
    }
  }

  if (Object.keys(targetsDict).length === 0) return;

  if (myOnlineId === 'host') {
    for (const [tId, count] of Object.entries(targetsDict)) {
      playGarbageSendAnimation(senderId, tId, isHard);
      if (tId === 'host') {
        if (!isPracticeMode) sendBlocksToOpponent({ engine: myEngine }, count, isHard);
      } else {
        const opp = opponents.find(o => o.id === tId);
        if (opp && opp.type === 'com') {
           sendBlocksToOpponent(opp, count, isHard);
        }
      }
    }
    onlineConnections.forEach(c => {
      if (c && c.open) c.send({ type: 'add_garbage_multi', senderId: senderId, targets: targetsDict, isHard });
    });
  } else {
    for (const tId of Object.keys(targetsDict)) {
       playGarbageSendAnimation(myOnlineId, tId, isHard);
    }
    if (onlineConnections[0] && onlineConnections[0].open) {
      onlineConnections[0].send({ type: 'garbage_request', senderId: myOnlineId, targets: targetsDict, isHard });
    }
  }
}

function sendBlocksToOpponent(opp, count, isHard) {
  let fullRows = Math.floor(count / 6);
  let remainder = count % 6;
  if (fullRows > 0) opp.engine.addGarbage(6, fullRows, isHard);
  if (remainder >= 3) opp.engine.addGarbage(remainder, 1, isHard);
  else if (remainder > 0 && fullRows === 0) opp.engine.addGarbage(remainder, 1, isHard);
}

function showResultModal(titleMsg) {
  stopBgm();
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
  if (hostDisconnected) {
     exitGame();
     return;
  }
  
  if (currentMode === 'story') {
    startGame('story', currentComLevel, 2, currentSkillEnabled);
  } else if (currentMode === 'single_survival') {
    startSingleMode();
  } else if (currentMode === 'single' || currentMode.startsWith('single_') || currentMode === 'com' || currentMode === 'local') {
    startGame(currentMode, currentComLevel, currentTotalPlayers, currentSkillEnabled);
  } else if (currentMode === 'online') {
    rematchReady[myOnlineId] = true;
    document.getElementById('result-rematch-btn').disabled = true;
    
    if (myOnlineId === 'host') {
       checkRematchCondition();
    } else {
       showToast('他のプレイヤーの準備を待っています...');
       if (onlineConnections[0] && onlineConnections[0].open) {
         onlineConnections[0].send({ type: 'rematch_ready', senderId: myOnlineId });
       }
       startPracticeMode();
    }
  }
}

function checkRematchCondition() {
  if (myOnlineId !== 'host') return;
  
  let allReady = true;
  const humanIds = matchPlayersConfig.filter(p => p.type === 'player').map(p => p.id);
  humanIds.forEach(id => {
    if (!rematchReady[id]) allReady = false;
  });

  if (allReady) {
    startPrepareMatchFromHost();
  } else {
    if (rematchReady[myOnlineId]) {
       showToast('他のプレイヤーの再戦同意を待っています...');
       if (!isPracticeMode) startPracticeMode();
    }
  }
}

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
  opponents.forEach(o => {
    if (o.engine && !o.engine.gameOver) aliveCount++;
  });

  if (currentMode === 'local') {
    if (aliveCount <= 1) {
      isMatchOver = true;
      matchState = 'gameover';
      stopAllEngines();
      let winnerText = 'DRAW!';
      if (myEngine && !myEngine.gameOver && !isDeadInMatch) {
        winnerText = `🏆 1P (${myRenderer.theme.name}) WIN!!`;
      } else {
        const survivor = opponents.find(o => o.engine && !o.engine.gameOver);
        if (survivor) {
          winnerText = `🏆 ${survivor.index + 2}P (${survivor.renderer.theme.name}) WIN!!`;
        }
      }
      showResultModal(winnerText);
    }
    return;
  }

  if (myEngine && myEngine.gameOver && !isMatchOver && !isPracticeMode) {
    isMatchOver = true;
    isDeadInMatch = true;

    if (currentMode === 'online') {
      const syncData = { type: 'sync', senderId: myOnlineId, gameOver: true };
      onlineConnections.forEach(c => { if (c && c.open) c.send(syncData); });
    }

    if (currentMode === 'story') {
      matchState = 'gameover';
      stopAllEngines();
      StoryManager.onBattleEnd(false);
      return;
    }

    let scoreVal = currentMode === 'single_survival' ? currentSurvivalWins : myEngine.score;
    let isRankIn = saveRankingData(currentMode, { score: scoreVal, handicap: myEngine.handicap, level: currentComLevel, date: Date.now() });

    if (currentMode.startsWith('single')) {
       matchState = 'gameover';
       stopAllEngines();
       showResultModal(isRankIn ? "NEW RECORD!" : "GAME OVER");
    } else {
       if (currentMode === 'com') stopAllEngines(); 
       showResultModal(isRankIn ? "NEW RECORD! (LOSE)" : "LOSE...");
    }
  }

  if (!isMatchOver && opponents.length > 0 && aliveCount === 1 && !myEngine.gameOver && !isDeadInMatch) {
     if (currentMode === 'single_survival') {
        const comOpp = opponents[0];
        if (comOpp.engine && comOpp.engine.gameOver && !comOpp.coolTimeStarted) {
           comOpp.coolTimeStarted = true;
           currentSurvivalWins++;
           comOpp.coolTime = 180;
           SE.play('fanfareMid');
           if (document.getElementById('survival-clear-garbage').checked) {
              myEngine.garbageQueue = [];
           }
        }
        return;
     } else if (currentMode === 'story') {
       isMatchOver = true;
       matchState = 'gameover';
       stopAllEngines();
       StoryManager.onBattleEnd(true);
       return;
     } else {
       isMatchOver = true;
       matchState = 'gameover';
       stopAllEngines();
       let isRankIn = false;
       if (currentMode === 'com') {
         isRankIn = saveRankingData('com', { score: myEngine.score, handicap: myEngine.handicap, level: currentComLevel, date: Date.now() });
       }
       showResultModal(isRankIn ? "WIN!! (NEW RECORD)" : "WIN!!");
     }
  }

  if (isMatchOver && aliveCount <= 1) {
     matchState = 'gameover';
     if (hostDisconnected) {
        setTimeout(() => { showToast("ホストが退出済みのため解散します。"); exitGame(); }, 3000);
     } else if (myOnlineId === 'host') {
        checkRematchCondition();
     }
  }
}

function stopAllEngines() {
  if (myEngine) {
    myEngine.isRisingManualBtn = false;
    myEngine.isRisingManualKey = false;
    myEngine.isRisingManualPad = false;
    myEngine.riseSpeed = 0;
  }
  opponents.forEach(opp => {
    if (opp.engine) {
      opp.engine.isRisingManualBtn = false;
      opp.engine.isRisingManualKey = false;
      opp.engine.isRisingManualPad = false;
      opp.engine.riseSpeed = 0;
    }
    if (opp.ai) {
      opp.ai.target = null;
    }
  });
}

let readyGoTimers = [];
function clearReadyGoTimers() {
  readyGoTimers.forEach(id => clearTimeout(id));
  readyGoTimers = [];
  const overlay = document.getElementById('ready-go-overlay');
  if (overlay) overlay.style.display = 'none';
}

function showReadyGo() {
  clearReadyGoTimers();
  const overlay = document.getElementById('ready-go-overlay');
  const text = document.getElementById('ready-go-text');
  overlay.style.display = 'flex';
  
  text.innerText = 'READY?';
  text.style.transition = 'none';
  text.style.opacity = '0';
  text.style.transform = 'scale(0.5)';
  text.style.color = '#ff007f';
  
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      text.style.transition = 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
      text.style.opacity = '1';
      text.style.transform = 'scale(1)';
    });
  });

  const t1 = setTimeout(() => {
    if (matchState === 'gameover' || document.getElementById('game-area').style.display === 'none') return;
    text.style.transition = 'none';
    text.style.opacity = '0';
    text.style.transform = 'scale(1.5)';
    text.innerText = 'GO!!';
    text.style.color = '#00e676';
    
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        text.style.transition = 'all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
        text.style.opacity = '1';
        text.style.transform = 'scale(1)';
      });
    });

    matchState = 'playing';
    resumeBgm();

    const t2 = setTimeout(() => {
      text.style.transition = 'all 0.3s ease-in';
      text.style.opacity = '0';
      text.style.transform = 'scale(2)';
      const t3 = setTimeout(() => {
        overlay.style.display = 'none';
      }, 300);
      readyGoTimers.push(t3);
    }, 800);
    readyGoTimers.push(t2);

  }, 1500);
  readyGoTimers.push(t1);
}

function checkPanic() {
  if (!myEngine || matchState !== 'playing' || isMatchOver) return;
  
  const checkEnginePanic = (eng) => {
    if (!eng || eng.gameOver) return false;
    const panicThresholdR = ROWS * 0.3;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const b = eng.grid[r][c];
        if (b !== null && b.state === 'normal' && (r - eng.riseOffset) <= panicThresholdR) {
          return true;
        }
      }
    }
    return false;
  };

  let panic = checkEnginePanic(myEngine);
  if (!panic && currentMode === 'local') {
    panic = opponents.some(o => o.type === 'local_human' && checkEnginePanic(o.engine));
  }
  
  if (panic && !isPanic) {
    isPanic = true;
    switchBgmToPanic(true);
  } else if (!panic && isPanic) {
    isPanic = false;
    switchBgmToPanic(false);
  }
}

function switchBgmToPanic(toPanic) {
  if (!isBgmIntendedToPlay) return;
  let bgmVol = parseFloat(document.getElementById('bgm-volume').value);

  bgmAudio.volume = bgmVol;
  panicBgmAudio.volume = bgmVol;

  if (toPanic) {
    bgmAudio.muted = true;
    panicBgmAudio.muted = false;
    panicBgmAudio.pause();
    panicBgmAudio.currentTime = 0;
    panicBgmAudio.play().catch(e => console.warn(e));
  } else {
    panicBgmAudio.muted = true;
    panicBgmAudio.pause();
    panicBgmAudio.currentTime = 0;
    bgmAudio.muted = false;
  }
}

let currentSkillEnabled = false;
const PLAYER_SKILL_MAX = 3;
const PLAYER_SKILL_SCORE_STEP = 300;
let playerSkillState = {
  enabled: false,
  usesLeft: 0,
  maxUses: PLAYER_SKILL_MAX,
  nextRequiredScore: 0
};

const headerCutinTimers = {};
function showHeaderCutinById(boxId, theme, text, accentColor = '#ffd700') {
  const box = document.getElementById(boxId);
  if (!box) return;
  const img = box.querySelector('.header-cutin-img');
  const nameEl = box.querySelector('.header-cutin-name');
  const textEl = box.querySelector('.header-cutin-text');
  if (!img || !nameEl || !textEl) return;

  if (theme && theme.charSrc) {
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
  headerCutinTimers[boxId] = setTimeout(() => {
    box.classList.remove('show');
  }, 1500);
}

function showPlayerHeaderCutin(theme, text, accentColor = '#ffd700') {
  showHeaderCutinById('my-header-cutin', theme, text, accentColor);
}

function hidePlayerHeaderCutin() {
  Object.keys(headerCutinTimers).forEach(id => {
    clearTimeout(headerCutinTimers[id]);
    delete headerCutinTimers[id];
  });
  document.querySelectorAll('.header-cutin').forEach(el => el.classList.remove('show'));
}

function initPlayerSkillState(enabled) {
  playerSkillState.enabled = !!enabled;
  playerSkillState.usesLeft = enabled ? PLAYER_SKILL_MAX : 0;
  playerSkillState.nextRequiredScore = 0; // 1回目は最初から使用可能
  updateSkillButtonUI();
}

function renderLocalSkillBarElement(barId, skillState, curScore, skillId) {
  const bar = document.getElementById(barId);
  if (!bar) return;
  if (!skillState || !skillState.enabled || currentMode !== 'local') {
    bar.style.display = 'none';
    return;
  }
  bar.style.display = 'flex';
  const skName = (typeof SKILL_LABELS !== 'undefined' && SKILL_LABELS[skillId]) ? SKILL_LABELS[skillId] : 'スキル';
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
    const gained = Math.max(0, PLAYER_SKILL_SCORE_STEP - remain);
    const pct = Math.min(100, Math.floor((gained / PLAYER_SKILL_SCORE_STEP) * 100));
    bar.innerHTML = `<div class="local-skill-bar-fill" style="width:${pct}%"></div><span class="local-skill-bar-text">${skName}(${skillState.usesLeft}/${PLAYER_SKILL_MAX}) あと${remain}</span>`;
  }
}

function updateRivalSkillBadge(opp, index) {
  const badge = document.getElementById(`rival-skill-badge-${index}`);
  if (!badge || !opp) return;

  let rem = null;
  if (opp.type === 'local_human' && opp.skillState && opp.skillState.enabled) {
    rem = opp.skillState.usesLeft;
  } else if (opp.ai && typeof opp.ai.getRemainingSkills === 'function') {
    rem = opp.ai.getRemainingSkills();
  } else if (opp.syncedSkillRemaining !== undefined && opp.syncedSkillRemaining !== null) {
    rem = opp.syncedSkillRemaining;
  }

  if (rem === null) {
    if (badge.style.display !== 'none') badge.style.display = 'none';
    return;
  }

  const label = `⚡${rem}`;
  if (badge.style.display === 'none') badge.style.display = 'inline-block';
  if (badge.dataset.skillText !== label) {
    badge.dataset.skillText = label;
    badge.innerText = label;
  }
  badge.classList.toggle('empty', rem <= 0);
}

function updateSkillButtonUI() {
  const btn = document.getElementById('skill-btn');
  const label = document.getElementById('skill-btn-label');
  const prog = document.getElementById('skill-btn-progress');

  if (currentMode === 'local') {
    if (btn) btn.style.display = 'none';
    renderLocalSkillBarElement('my-local-skill-bar', playerSkillState, myEngine ? myEngine.score : 0, localSlotsConfig[0].skillId);
    opponents.forEach((opp, i) => {
      if (opp.type === 'local_human' && opp.skillState) {
        renderLocalSkillBarElement(`rival-local-skill-bar-${i}`, opp.skillState, opp.engine ? opp.engine.score : 0, opp.skillId);
      }
    });
    return;
  } else {
    const myBar = document.getElementById('my-local-skill-bar');
    if (myBar) myBar.style.display = 'none';
  }

  if (!btn || !label || !prog) return;
  if (!playerSkillState.enabled || isPracticeMode) {
    btn.style.display = 'none';
    return;
  }
  btn.style.display = 'flex';

  const curScore = myEngine ? myEngine.score : 0;
  const skName = (typeof SKILL_LABELS !== 'undefined' && SKILL_LABELS[selectedPlayerSkill]) ? SKILL_LABELS[selectedPlayerSkill] : 'スキル';
  if (playerSkillState.usesLeft <= 0) {
    btn.disabled = true;
    btn.classList.remove('ready');
    prog.style.width = '0%';
    label.innerText = `${skName}\n終了 (0/${PLAYER_SKILL_MAX})`;
    return;
  }

  const remain = Math.max(0, playerSkillState.nextRequiredScore - curScore);
  if (remain === 0) {
    btn.disabled = false;
    btn.classList.add('ready');
    prog.style.width = '100%';
    label.innerText = `${skName}\n発動 (${playerSkillState.usesLeft}/${PLAYER_SKILL_MAX})`;
  } else {
    btn.disabled = true;
    btn.classList.remove('ready');
    const gained = Math.max(0, PLAYER_SKILL_SCORE_STEP - remain);
    const pct = Math.min(100, Math.floor((gained / PLAYER_SKILL_SCORE_STEP) * 100));
    prog.style.width = `${pct}%`;
    label.innerText = `${skName}(${playerSkillState.usesLeft}/${PLAYER_SKILL_MAX})\nあと${remain}点`;
  }
}

function activatePlayerSkill() {
  if (!playerSkillState.enabled || !myEngine || myEngine.gameOver || isPracticeMode) return;
  if (matchState !== 'playing' || isMatchOver) return;
  if (playerSkillState.usesLeft <= 0) return;
  if (myEngine.score < playerSkillState.nextRequiredScore) return;
  if (typeof executePlayerCheatSkill !== 'function') return;

  const chosenSkill = currentMode === 'local' ? (localSlotsConfig[0].skillId || 'erase_color') : selectedPlayerSkill;
  const senderId = currentMode === 'online' ? myOnlineId : 'player';
  const res = executePlayerCheatSkill(myEngine, senderId, myTargetIndex, chosenSkill);
  if (!res || !res.success) {
    if (currentMode !== 'local') showToast('今はそのスキルを発動できる対象がありません');
    return;
  }

  playerSkillState.usesLeft--;
  playerSkillState.nextRequiredScore = myEngine.score + PLAYER_SKILL_SCORE_STEP;
  updateSkillButtonUI();

  if (currentMode === 'local') {
    myEngine.cutinMax = 50;
    myEngine.cutinTimer = 50;
    myEngine.cutinText = res.text;
  } else {
    showPlayerHeaderCutin(myRenderer.theme, res.text, '#ff007f');
    if (currentMode === 'online' && typeof sendOnlineCutin === 'function') {
      sendOnlineCutin(myOnlineId, res.text);
    }
  }
}

function activateLocalOpponentSkill(opp) {
  if (!opp || !opp.skillState || !opp.skillState.enabled || !opp.engine || opp.engine.gameOver) return;
  if (matchState !== 'playing' || isMatchOver) return;
  if (opp.skillState.usesLeft <= 0) return;
  if (opp.engine.score < opp.skillState.nextRequiredScore) return;
  if (typeof executePlayerCheatSkill !== 'function') return;

  const res = executePlayerCheatSkill(opp.engine, opp.id, opp.targetId || -1, opp.skillId || 'erase_color');
  if (!res || !res.success) return;

  opp.skillState.usesLeft--;
  opp.skillState.nextRequiredScore = opp.engine.score + PLAYER_SKILL_SCORE_STEP;
  updateSkillButtonUI();

  opp.engine.cutinMax = 50;
  opp.engine.cutinTimer = 50;
  opp.engine.cutinText = res.text;
}

function startGame(mode, level = 1, totalPlayers = 2, skillEnabled = false) {
  document.getElementById('result-overlay').style.display = 'none'; 
  currentMode = mode;
  currentComLevel = level;
  currentTotalPlayers = totalPlayers;
  currentSkillEnabled = !!skillEnabled;
  matchState = 'ready';
  isPracticeMode = false;
  
  document.getElementById('menu-overlay').style.display = 'none';
  document.getElementById('game-area').style.display = 'flex';

  if (currentMode === 'local') {
    try { screen.orientation?.lock?.('landscape')?.catch(() => {}); } catch (e) {}
  }
  
  setupInput();
  resetGameLogic();
  
  readyBgm();
  showReadyGo();
  
  if (loopId) cancelAnimationFrame(loopId);
  lastTime = performance.now();
  accumulator = 0;
  loopId = requestAnimationFrame(gameLoop);
}

function resetGameLogic() {
  isMatchOver = false;
  isDeadInMatch = false;
  isPracticeMode = false;
  myTargetIndex = -1;
  currentMatchId = Date.now(); 
  currentSurvivalWins = 0;
  hidePlayerHeaderCutin();
  resetAllLocalInputStates();
  
  const handicap = currentMode === 'local' ? 3 : (parseInt(document.getElementById('handicap-val').value) || 3);
  const sharedSeed = Math.floor(Math.random() * 0xFFFFFFFF);
  
  myRenderer = new BoardRenderer('my-canvas'); 
  myEngine = new PonEngine(
    (state) => { 
      if (state === 'gameover') {
        checkMatchEnd();
      }
    },
    (totalBlocks, isHard) => { 
      distributeGarbage('player', totalBlocks, isHard);
    },
    handicap,
    true,
    sharedSeed
  );
  myEngine.onRowPushed = handleMyRowPushed;
  myEngine.garbageQueue = [];
  myEngine.allowBoardCutin = (currentMode === 'local');
  if (currentMode === 'single_survival' && document.getElementById('survival-keep-speed').checked) {
     myEngine.keepSpeed = true;
  }

  let rawCharId;
  if (currentMode === 'story') rawCharId = StoryManager.getSelectedCharId();
  else if (currentMode === 'local') rawCharId = localSlotsConfig[0].charId;
  else rawCharId = selectedCharId;

  const resolvedCharId = resolvePlayableCharId(rawCharId);
  myRenderer.theme = buildThemeForCharacter(
    resolvedCharId,
    (resolvedCharId === 'custom' && CustomAssets.chara) ? CustomAssets.chara.dataUrl : null,
    true,
    resolvedCharId === 'custom' ? getPlayerDisplayName() : null
  );
  document.getElementById('player-label').innerText = currentMode === 'local'
    ? `1P: ${myRenderer.theme.name}`
    : myRenderer.theme.name;

  myEngine.onChainEnd = (chain) => {
    showPlayerHeaderCutin(myRenderer.theme, `${chain} CHAIN!!`, '#ffd700');
  };
  myEngine.onSimultaneousMatch = (size) => {
    showPlayerHeaderCutin(myRenderer.theme, `${size}個消し！`, '#00d4ff');
  };

  initPlayerSkillState(currentSkillEnabled);

  const rivalsArea = document.getElementById('rivals-area');
  const rivalsTopArea = document.getElementById('rivals-top-area');
  rivalsArea.innerHTML = '';
  rivalsTopArea.innerHTML = '';
  opponents = [];

  const opponentCount = currentMode.startsWith('single') && currentMode !== 'single_survival' ? 0 : currentTotalPlayers - 1;
  const rivalCharPool = CHARACTERS.filter(c => c.id !== resolvedCharId).sort(() => Math.random() - 0.5);

  for (let i = 0; i < opponentCount; i++) {
    const slotCfg = currentMode === 'local' ? localSlotsConfig[i + 1] : null;
    const isLocalHuman = currentMode === 'local' && slotCfg && !slotCfg.isCom;
    const isComMode = currentMode === 'com' || currentMode === 'single_survival' || currentMode === 'story' || (currentMode === 'local' && slotCfg && slotCfg.isCom);

    const wrapper = document.createElement('div');
    wrapper.className = 'board-wrapper rival-board';
    if (isComMode) wrapper.classList.add('com-board');
    wrapper.id = `rival-wrapper-${i}`;
    if (currentMode !== 'local') {
      wrapper.onclick = () => selectTarget(i);
    }

    let oppChar;
    if (currentMode === 'story' && StoryManager.activeStage) {
      oppChar = getCharacterById(StoryManager.activeStage.enemyId);
    } else if (currentMode === 'local' && slotCfg) {
      const resId = resolvePlayableCharId(slotCfg.charId);
      oppChar = getCharacterById(resId);
    } else {
      oppChar = rivalCharPool[i % rivalCharPool.length];
    }

    let nameColor = oppChar ? oppChar.color : (isComMode ? '#aaaaaa' : '#e94560');
    let oppName = oppChar ? oppChar.name : `COM ${i+1}`;
    if (currentMode === 'single_survival') oppName = `${oppChar.name} Lv.${currentComLevel}`;
    else if (currentMode === 'com') oppName = `${oppChar.name} (COM)`;
    else if (currentMode === 'local') {
      oppName = isLocalHuman ? `${i + 2}P: ${oppChar.name}` : `${i + 2}P(COM): ${oppChar.name}`;
    }

    if (currentMode === 'local') {
      wrapper.innerHTML = `
        <div class="garbage-preview-box">
          <span class="preview-label">予告</span>
          <div id="rival-garbage-preview-${i}" class="preview-list"></div>
          <span id="rival-skill-badge-${i}" class="skill-count-badge" style="display:none;"></span>
        </div>
        <div class="board-header my-board-header">
          <span style="color: ${nameColor};" id="rival-name-label-${i}">${oppName} <span class="target-badge">🎯</span></span>
          <span id="rival-score-label-${i}">SCORE: 0</span>
          <div id="rival-header-cutin-${i}" class="header-cutin" aria-hidden="true">
            <img class="header-cutin-img" alt="">
            <span class="header-cutin-name"></span>
            <span class="header-cutin-text"></span>
          </div>
        </div>
        <div class="canvas-container"><canvas id="rival-canvas-${i}"></canvas></div>
        <div id="rival-local-skill-bar-${i}" class="local-skill-bar" style="display:none;"></div>
      `;
    } else {
      wrapper.innerHTML = `
        <div class="garbage-preview-box">
          <span class="preview-label">予告</span>
          <div id="rival-garbage-preview-${i}" class="preview-list"></div>
          <span id="rival-skill-badge-${i}" class="skill-count-badge" style="display:none;"></span>
        </div>
        <div class="board-header">
          <span style="color: ${nameColor};" id="rival-name-label-${i}">${oppName} <span class="target-badge">🎯 TARGET</span></span>
          <span id="rival-score-label-${i}">SCORE: 0</span>
        </div>
        <div class="canvas-container"><canvas id="rival-canvas-${i}"></canvas></div>
      `;
    }
    rivalsArea.appendChild(wrapper);

    const oppId = currentMode === 'local' ? `local_${i + 1}` : `com_${i}`;
    const rRenderer = new BoardRenderer(`rival-canvas-${i}`);
    rRenderer.theme = buildThemeForCharacter(
      oppChar.id,
      (oppChar.id === 'custom' && CustomAssets.chara) ? CustomAssets.chara.dataUrl : null,
      false,
      oppChar.id === 'custom' ? getPlayerDisplayName() : null
    );

    const rEngine = new PonEngine(
      (state) => { if (state === 'gameover') checkMatchEnd(); },
      (totalBlocks, isHard) => { distributeGarbage(oppId, totalBlocks, isHard); },
      3,
      currentMode === 'local' ? true : false,
      sharedSeed
    );
    rEngine.garbageQueue = [];
    rEngine.allowBoardCutin = true;

    const oppInputState = isLocalHuman ? createPlayerInputState() : null;
    if (isLocalHuman) {
      rEngine.onRowPushed = () => {
        if (oppInputState.padGrabState.active && oppInputState.padGrabState.row > 0) oppInputState.padGrabState.row--;
        if (oppInputState.keyGrabState.active && oppInputState.keyGrabState.row > 0) oppInputState.keyGrabState.row--;
      };
    }

    if (currentMode === 'local') {
      rEngine.onChainEnd = (chain) => {
        showHeaderCutinById(`rival-header-cutin-${i}`, rRenderer.theme, `${chain} CHAIN!!`, '#ffd700');
      };
      rEngine.onSimultaneousMatch = (size) => {
        showHeaderCutinById(`rival-header-cutin-${i}`, rRenderer.theme, `${size}個消し！`, '#00d4ff');
      };
    } else {
      rEngine.onChainStep = (chain) => {
        rEngine.cutinMax = 50;
        rEngine.cutinTimer = 50;
        rEngine.cutinText = `${chain} CHAIN!!`;
      };
      rEngine.onSimultaneousMatch = (size) => {
        rEngine.cutinMax = 50;
        rEngine.cutinTimer = 50;
        rEngine.cutinText = `${size}個消し！`;
      };
    }

    let rAI = null;
    if (isComMode) {
      if (currentMode === 'story' && StoryManager.activeStage) {
        const stCfg = StoryManager.activeStageConfig || StoryManager.getStageConfig(StoryManager.activeStage);
        if (stCfg.useCheat && typeof cheat === 'function') {
          rAI = new cheat(rEngine, stCfg.level, oppId, { skillType: stCfg.skillType });
        } else {
          rAI = new ComAI(rEngine, stCfg.level, oppId);
        }
      } else {
        const comLv = (currentMode === 'local' && slotCfg) ? slotCfg.comLevel : currentComLevel;
        const useCheat = ((currentMode === 'com' || currentMode === 'single_survival' || currentMode === 'local') && currentSkillEnabled);
        if (useCheat && typeof cheat === 'function') {
          const comMaxSkills = (currentMode === 'single_survival' || currentMode === 'local') ? 3 : 10;
          rAI = new cheat(rEngine, comLv, oppId, { maxSkillUses: comMaxSkills });
        } else {
          rAI = new ComAI(rEngine, comLv, oppId);
        }
      }
    }

    const oppObj = {
      id: oppId,
      name: oppName,
      type: isLocalHuman ? 'local_human' : 'com',
      playerSlotIndex: i + 1,
      skillId: (isLocalHuman && slotCfg) ? (slotCfg.skillId || 'erase_color') : 'erase_color',
      engine: rEngine,
      renderer: rRenderer,
      ai: rAI,
      index: i,
      targetId: null,
      inputState: oppInputState,
      skillState: isLocalHuman ? {
        enabled: currentSkillEnabled,
        usesLeft: currentSkillEnabled ? PLAYER_SKILL_MAX : 0,
        nextRequiredScore: 0
      } : null
    };
    opponents.push(oppObj);
    updateRivalSkillBadge(oppObj, i);
  }
  
  updateGarbagePreview(myEngine, 'my-garbage-preview');
  opponents.forEach((opp, i) => updateGarbagePreview(opp.engine, `rival-garbage-preview-${i}`));
  updateTargetUI();
  updateSkillButtonUI();
  adjustLayout();
}

function startSingleGame() { 
  startGame('single_free', 1, 1, false); 
}

function startComGame(level) {
  const count = parseInt(document.getElementById('com-player-count').value) || 2;
  const skillEnabled = !!document.getElementById('com-cheat-toggle')?.checked;
  startGame('com', level, count, skillEnabled); 
}

function startComGameFromSlider() {
  const level = parseInt(document.getElementById('com-level-slider').value) || 2;
  const count = parseInt(document.getElementById('com-player-count').value) || 2;
  const skillEnabled = !!document.getElementById('com-cheat-toggle')?.checked;
  startGame('com', level, count, skillEnabled); 
}

function exitGame() {
  if (myEngine && !currentMode.startsWith('single')) {
    if (!isMatchOver && !isPracticeMode && !myEngine.gameOver) {
      if (!confirm("退出してメニューに戻りますか？\n（対戦時は負けになります）")) return;
    }
    onlineConnections.forEach(c => { if(c && c.open) c.send({ type: 'leave', senderId: myOnlineId }); });
  }
  
  isMatchOver = true;
  isDeadInMatch = true;
  matchState = 'gameover';
  isPracticeMode = false;
  hostDisconnected = false;
  clearReadyGoTimers();
  stopAllEngines();
  stopBgm();
  hidePlayerHeaderCutin();

  document.body.classList.remove('local-force-landscape');
  try { screen.orientation?.unlock?.(); } catch (e) {}
  
  myEngine = null; opponents = [];
  onlineConnections.forEach(c => c.close());
  onlineConnections = [];
  if (peer) { peer.destroy(); peer = null; }
  
  if (syncIntervalId) { clearInterval(syncIntervalId); syncIntervalId = null; }
  if (loopId) { cancelAnimationFrame(loopId); loopId = null; }
  if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }

  document.getElementById('countdown-overlay').style.display = 'none';
  document.getElementById('result-overlay').style.display = 'none';
  document.getElementById('game-area').style.display = 'none';
  document.getElementById('rivals-area').style.display = 'none';
  document.getElementById('rivals-top-area').style.display = 'none';
  document.getElementById('menu-overlay').style.display = 'flex';
  
  document.getElementById('room-waiting').style.display = 'none';
  document.getElementById('com-menu').style.display = 'none';
  document.getElementById('single-menu').style.display = 'none';
  document.getElementById('local-menu').style.display = 'none';
  document.getElementById('online-menu').style.display = 'none';
  document.getElementById('ranking-menu').style.display = 'none';
  document.getElementById('story-menu').style.display = 'none';
  document.getElementById('story-overlay').style.display = 'none';
  document.getElementById('main-menu-actions').style.display = 'flex';
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
    padState: {},
    prevPadState: {},
    padHoldFrames: { Up: 0, Down: 0, Left: 0, Right: 0 },
    padGrabState: { active: false, side: 'left', col: 0, row: 0, consumed: false },
    keyGrabState: { active: false, side: 'left', col: 0, row: 0, consumed: false }
  };
}

let p1InputState = createPlayerInputState();
let padState = p1InputState.padState;
let prevPadState = p1InputState.prevPadState;
let padHoldFrames = p1InputState.padHoldFrames;
let padGrabState = p1InputState.padGrabState;
let keyGrabState = p1InputState.keyGrabState;
let touchRowFollowCallback = null;
const PAD_DAS_FRAMES = 15;
const PAD_ARR_FRAMES = 4;

function resetAllLocalInputStates() {
  p1InputState = createPlayerInputState();
  padState = p1InputState.padState;
  prevPadState = p1InputState.prevPadState;
  padHoldFrames = p1InputState.padHoldFrames;
  padGrabState = p1InputState.padGrabState;
  keyGrabState = p1InputState.keyGrabState;
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
  opponents.forEach(o => {
    if (o.id !== opp.id && o.engine && !o.engine.gameOver) validIds.push(o.id);
  });
  if (validIds.length <= 1) return;
  let pos = validIds.indexOf(opp.targetId);
  if (pos === -1) pos = 0;
  pos = (pos + dir + validIds.length) % validIds.length;
  opp.targetId = validIds[pos];
  SE.play('cursorMove');
}

function pollSingleGamepad(engine, cfgPad, stateObj, padObj, isMainPlayer, oppRef = null) {
  if (!padObj) {
    if (engine) engine.isRisingManualPad = false;
    stateObj.padHoldFrames = { Up: 0, Down: 0, Left: 0, Right: 0 };
    stateObj.padGrabState.active = false;
    stateObj.padGrabState.consumed = false;
    return;
  }

  stateObj.prevPadState = { ...stateObj.padState };
  padObj.buttons.forEach((b, i) => stateObj.padState[i] = b.pressed);
  const justPressed = (btnIdx) => btnIdx !== null && btnIdx !== undefined && stateObj.padState[btnIdx] && !stateObj.prevPadState[btnIdx];
  const isPressed = (btnIdx) => btnIdx !== null && btnIdx !== undefined && !!stateObj.padState[btnIdx];

  if (isMainPlayer && justPressed(cfgPad.Pause)) {
    if (document.getElementById('game-area').style.display === 'flex' && document.getElementById('result-overlay').style.display !== 'flex') {
      stateObj.padHoldFrames = { Up: 0, Down: 0, Left: 0, Right: 0 };
      stateObj.padGrabState.active = false;
      stateObj.padGrabState.consumed = false;
      exitGame();
      return;
    }
  }

  if (!engine || engine.gameOver || (isMatchOver && !isPracticeMode)) {
    stateObj.padHoldFrames = { Up: 0, Down: 0, Left: 0, Right: 0 };
    stateObj.padGrabState.active = false;
    stateObj.padGrabState.consumed = false;
    if (engine) engine.isRisingManualPad = false;
    return;
  }

  if (isMainPlayer && justPressed(cfgPad.ToggleContinuous)) {
    toggleContinuousSwipe();
  }

  if (justPressed(cfgPad.GrabLeft)) {
    startGrabForEngine(engine, stateObj.padGrabState, 'left');
  } else if (justPressed(cfgPad.GrabRight)) {
    startGrabForEngine(engine, stateObj.padGrabState, 'right');
  }
  if (stateObj.padGrabState.active) {
    if (stateObj.padGrabState.side === 'left' && !isPressed(cfgPad.GrabLeft)) {
      stateObj.padGrabState.active = false;
      stateObj.padGrabState.consumed = false;
    } else if (stateObj.padGrabState.side === 'right' && !isPressed(cfgPad.GrabRight)) {
      stateObj.padGrabState.active = false;
      stateObj.padGrabState.consumed = false;
    }
  }

  const checkDirTrigger = (dirName, btnIdx) => {
    if (!isPressed(btnIdx)) {
      stateObj.padHoldFrames[dirName] = 0;
      return false;
    }
    const f = stateObj.padHoldFrames[dirName];
    stateObj.padHoldFrames[dirName]++;
    if (f === 0) return true;
    if (f >= PAD_DAS_FRAMES && (f - PAD_DAS_FRAMES) % PAD_ARR_FRAMES === 0) return true;
    return false;
  };

  const upHeld = isPressed(cfgPad.Up);
  const downHeld = isPressed(cfgPad.Down);
  const leftHeld = isPressed(cfgPad.Left);
  const rightHeld = isPressed(cfgPad.Right);

  let moved = false;
  if (upHeld && downHeld) {
    stateObj.padHoldFrames.Up = 0; stateObj.padHoldFrames.Down = 0;
  } else {
    if (checkDirTrigger('Up', cfgPad.Up) && engine.cursor.y > 0) {
      engine.cursor.y--; moved = true;
      if (stateObj.padGrabState.active) {
        stateObj.padGrabState.row = engine.cursor.y;
        stateObj.padGrabState.col = stateObj.padGrabState.side === 'left' ? engine.cursor.x : engine.cursor.x + 1;
        stateObj.padGrabState.consumed = false;
      }
    }
    if (checkDirTrigger('Down', cfgPad.Down) && engine.cursor.y < ROWS - 1) {
      engine.cursor.y++; moved = true;
      if (stateObj.padGrabState.active) {
        stateObj.padGrabState.row = engine.cursor.y;
        stateObj.padGrabState.col = stateObj.padGrabState.side === 'left' ? engine.cursor.x : engine.cursor.x + 1;
        stateObj.padGrabState.consumed = false;
      }
    }
  }

  if (leftHeld && rightHeld) {
    stateObj.padHoldFrames.Left = 0; stateObj.padHoldFrames.Right = 0;
  } else {
    if (checkDirTrigger('Left', cfgPad.Left)) {
      if (stateObj.padGrabState.active) {
        executeGrabMoveForEngine(engine, stateObj.padGrabState, -1);
      } else if (engine.cursor.x > 0) {
        engine.cursor.x--; moved = true;
      }
    }
    if (checkDirTrigger('Right', cfgPad.Right)) {
      if (stateObj.padGrabState.active) {
        executeGrabMoveForEngine(engine, stateObj.padGrabState, 1);
      } else if (engine.cursor.x < COLS - 2) {
        engine.cursor.x++; moved = true;
      }
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
  grabState.active = true;
  grabState.side = side;
  grabState.col = side === 'left' ? engine.cursor.x : engine.cursor.x + 1;
  grabState.row = engine.cursor.y;
  grabState.consumed = false;
}

function executeGrabMoveForEngine(engine, grabState, dx) {
  if (!engine || !grabState.active || grabState.consumed) return false;
  const continuous = document.getElementById('continuous-swipe')?.checked;
  let swapped = false;
  if (dx > 0 && grabState.col < COLS - 1) {
    if (engine.swap(grabState.col, grabState.row)) {
      SE.play('cursorMove');
      grabState.col++;
      swapped = true;
    }
  } else if (dx < 0 && grabState.col > 0) {
    if (engine.swap(grabState.col - 1, grabState.row)) {
      SE.play('cursorMove');
      grabState.col--;
      swapped = true;
    }
  }
  if (swapped) {
    engine.cursor.x = grabState.side === 'left'
      ? Math.min(COLS - 2, Math.max(0, grabState.col))
      : Math.min(COLS - 2, Math.max(0, grabState.col - 1));
    if (!continuous) grabState.consumed = true;
  }
  return swapped;
}

function pollGamepadInput() {
  const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()) : [];
  const slot0 = playerConfigs[0].padSlot;
  const pad0 = (slot0 >= 0 && pads[slot0]) ? pads[slot0] : (currentMode === 'local' ? null : pads.find(p => p && p.connected));
  pollSingleGamepad(myEngine, playerConfigs[0].pad, p1InputState, pad0, true, null);

  if (currentMode === 'local') {
    opponents.forEach(opp => {
      if (opp.type === 'local_human' && opp.inputState) {
        const slot = playerConfigs[opp.playerSlotIndex].padSlot;
        const padObj = (slot >= 0 && pads[slot]) ? pads[slot] : null;
        pollSingleGamepad(opp.engine, playerConfigs[opp.playerSlotIndex].pad, opp.inputState, padObj, false, opp);
      }
    });
  }
}

function updateGarbagePreview(engine, containerId) {
  const container = document.getElementById(containerId);
  if (!container || !engine) return;
  
  const qStr = JSON.stringify(engine.garbageQueue);
  if (container.dataset.qStr === qStr) return;
  container.dataset.qStr = qStr;

  container.innerHTML = '';
  
  // 同じサイズ・種類（w, h, isHard）は最初に出現したアイコンへ合算して圧縮表示
  const compressed = [];
  const mapByKey = new Map();
  engine.garbageQueue.forEach(g => {
    const key = `${g.w}_${g.h}_${!!g.isHard}`;
    if (mapByKey.has(key)) {
      mapByKey.get(key).count++;
    } else {
      const entry = { ...g, count: 1 };
      mapByKey.set(key, entry);
      compressed.push(entry);
    }
  });

  compressed.forEach((g, idx) => {
    const block = document.createElement('div');
    block.style.backgroundColor = g.isHard ? '#a8b2bd' : '#5c636a';
    block.style.border = '1px solid #dee2e6';
    block.style.borderRadius = '2px';
    block.style.width = `${Math.min(36, Math.max(14, g.w * 5))}px`;
    block.style.height = `${Math.min(18, Math.max(10, g.h * 4))}px`;
    block.style.flexShrink = '0';
    block.style.display = 'flex';
    block.style.alignItems = 'center';
    block.style.justifyContent = 'center';
    
    if (idx > 0) {
       block.style.opacity = '0.65';
    }
    
    if (g.count > 1) {
       const span = document.createElement('span');
       span.innerText = `×${g.count}`;
       span.style.color = '#fff';
       span.style.fontSize = '9px';
       span.style.fontWeight = 'bold';
       span.style.textShadow = '1px 1px 1px #000';
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
  lastTime = time;
  accumulator += deltaTime;
  
  while (accumulator >= FIXED_TIME_STEP) {
    if (!isMatchOver || isPracticeMode) {
      pollGamepadInput();
      if (myEngine) myEngine.update(FIXED_TIME_STEP);
    }
    if (!isMatchOver || isPracticeMode) {
      opponents.forEach(opp => {
        if (currentMode === 'single_survival' && opp.coolTimeStarted) {
           opp.coolTime--;
           if (opp.coolTime <= 0) {
             opp.coolTimeStarted = false;
             opp.engine.gameOver = false;
             opp.engine.grid = Array.from({ length: opp.engine.rows }, () => Array(opp.engine.cols).fill(null));
             opp.engine.initGrid(5);
             if (document.getElementById('survival-cancel-sent').checked) {
               opp.engine.garbageQueue = [];
             }
             let n = currentSurvivalWins + 1;
             let nextLv = getSurvivalLevel(survivalBaseLevel, n);
             opp.level = nextLv;
             opp.ai = (currentSkillEnabled && typeof cheat === 'function')
               ? new cheat(opp.engine, nextLv, opp.id, { maxSkillUses: 3 })
               : new ComAI(opp.engine, nextLv, opp.id);
             document.getElementById(`rival-name-label-0`).innerHTML = `${opp.renderer.theme.name} Lv.${nextLv} <span class="target-badge">🎯 TARGET</span>`;
           }
        } else if (opp.type === 'local_human') {
           if (opp.engine && !opp.engine.gameOver) opp.engine.update(FIXED_TIME_STEP);
        } else {
           const isLocalControlledCom = (opp.type === 'com') && (currentMode === 'com' || currentMode === 'single_survival' || currentMode === 'story' || currentMode === 'local' || myOnlineId === 'host');
           if (isLocalControlledCom) {
             if (opp.ai) opp.ai.update();
             if (opp.engine && !opp.engine.gameOver) opp.engine.update(FIXED_TIME_STEP);
           }
        }
      });
      checkPanic(); 
    }
    accumulator -= FIXED_TIME_STEP;
  }
  
  if (myEngine) {
    myRenderer.draw(myEngine);
    const t = Math.floor(myEngine.timeElapsed / 1000);
    const m = String(Math.floor(t / 60)).padStart(2, '0');
    const s = String(t % 60).padStart(2, '0');
    document.getElementById('timer-label').innerText = `${m}:${s}`;
    document.getElementById('score-label').innerText = `SCORE: ${myEngine.score} | CHAIN: ${myEngine.chain}`;
    updateGarbagePreview(myEngine, 'my-garbage-preview');
    updateSkillButtonUI();
    
    if (currentMode === 'single_ta' && myEngine.timeElapsed >= 180000 && !myEngine.gameOver && !isMatchOver) {
       myEngine.gameOver = true;
       checkMatchEnd();
    }
  }
  opponents.forEach((opp, i) => {
    if (opp.renderer && opp.engine) {
      opp.renderer.draw(opp.engine);
      const scoreEl = document.getElementById(`rival-score-label-${i}`);
      if (scoreEl) {
         if (currentMode === 'single_survival') {
            scoreEl.innerText = `WINS: ${currentSurvivalWins}`;
         } else {
            scoreEl.innerText = `SCORE: ${opp.engine.score}`;
         }
      }
      updateGarbagePreview(opp.engine, `rival-garbage-preview-${i}`);
      updateRivalSkillBadge(opp, i);
    }
  });
  
  loopId = requestAnimationFrame(gameLoop);
}

function handleKeyboardActionForPlayer(engine, cfgKey, stateObj, code, isRepeat, isMainPlayer, oppRef, e) {
  if (!engine || engine.gameOver || (isMatchOver && !isPracticeMode)) return false;
  let handled = false;
  let moved = false;

  if (isMainPlayer && code === cfgKey.ToggleContinuous) {
    handled = true;
    if (!isRepeat) toggleContinuousSwipe();
  }
  if (code === cfgKey.GrabLeft) {
    handled = true;
    if (!isRepeat) startGrabForEngine(engine, stateObj.keyGrabState, 'left');
  }
  if (code === cfgKey.GrabRight) {
    handled = true;
    if (!isRepeat) startGrabForEngine(engine, stateObj.keyGrabState, 'right');
  }
  if (code === cfgKey.Up) {
    handled = true;
    if (engine.cursor.y > 0) {
      engine.cursor.y--; moved = true;
      if (stateObj.keyGrabState.active) {
        stateObj.keyGrabState.row = engine.cursor.y;
        stateObj.keyGrabState.col = stateObj.keyGrabState.side === 'left' ? engine.cursor.x : engine.cursor.x + 1;
        stateObj.keyGrabState.consumed = false;
      }
    }
  }
  if (code === cfgKey.Down) {
    handled = true;
    if (engine.cursor.y < ROWS - 1) {
      engine.cursor.y++; moved = true;
      if (stateObj.keyGrabState.active) {
        stateObj.keyGrabState.row = engine.cursor.y;
        stateObj.keyGrabState.col = stateObj.keyGrabState.side === 'left' ? engine.cursor.x : engine.cursor.x + 1;
        stateObj.keyGrabState.consumed = false;
      }
    }
  }
  if (code === cfgKey.Left) {
    handled = true;
    if (stateObj.keyGrabState.active) {
      executeGrabMoveForEngine(engine, stateObj.keyGrabState, -1);
    } else if (engine.cursor.x > 0) {
      engine.cursor.x--; moved = true;
    }
  }
  if (code === cfgKey.Right) {
    handled = true;
    if (stateObj.keyGrabState.active) {
      executeGrabMoveForEngine(engine, stateObj.keyGrabState, 1);
    } else if (engine.cursor.x < COLS - 2) {
      engine.cursor.x++; moved = true;
    }
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

function getCanvasCoordsFromPointer(cvs, e) {
  const rect = cvs.getBoundingClientRect();
  if (document.body.classList.contains('local-force-landscape')) {
    return {
      x: ((e.clientY - rect.top) / rect.height) * cvs.width,
      y: ((rect.right - e.clientX) / rect.width) * cvs.height
    };
  }
  return {
    x: (e.clientX - rect.left) * (cvs.width / rect.width),
    y: (e.clientY - rect.top) * (cvs.height / rect.height)
  };
}

let inputSetupDone = false;
function setupInput() {
  if (inputSetupDone) return;
  inputSetupDone = true;

  const cvs = document.getElementById('my-canvas');
  let isDown = false, grabbedCol = -1, grabbedRow = -1, initialCanvasX = 0, initialCanvasY = 0;
  touchRowFollowCallback = () => {
    if (isDown && grabbedRow > 0) grabbedRow--;
  };

  cvs.addEventListener('pointerdown', (e) => {
    if (isMatchOver && !isPracticeMode) return;
    isDown = true; cvs.setPointerCapture(e.pointerId);
    const pt = getCanvasCoordsFromPointer(cvs, e);
    initialCanvasX = pt.x;
    initialCanvasY = pt.y;
    grabbedCol = Math.max(0, Math.min(COLS - 1, Math.floor(initialCanvasX / CELL_PX)));
    grabbedRow = Math.max(0, Math.min(ROWS - 1, Math.floor((initialCanvasY + myEngine.riseOffset * CELL_PX) / CELL_PX)));
  });

  cvs.addEventListener('pointermove', (e) => {
    if (!isDown || !myEngine || (isMatchOver && !isPracticeMode)) return;
    const pt = getCanvasCoordsFromPointer(cvs, e);
    let targetCol = Math.max(0, Math.min(COLS - 1, Math.floor(pt.x / CELL_PX)));
    const continuous = document.getElementById('continuous-swipe').checked;

    while (targetCol > grabbedCol) {
       myEngine.cursor.x = grabbedCol; myEngine.cursor.y = grabbedRow;
       if (myEngine.swap(grabbedCol, grabbedRow)) {
          SE.play('cursorMove');
          grabbedCol++;
          if (!continuous) { isDown = false; break; }
       } else break; 
    }
    while (targetCol < grabbedCol) {
       myEngine.cursor.x = grabbedCol - 1; myEngine.cursor.y = grabbedRow;
       if (myEngine.swap(grabbedCol - 1, grabbedRow)) {
          SE.play('cursorMove');
          grabbedCol--;
          if (!continuous) { isDown = false; break; }
       } else break;
    }
  });

  cvs.addEventListener('pointerup', (e) => {
    if (!isDown) return;
    isDown = false; cvs.releasePointerCapture(e.pointerId);
    if (isMatchOver && !isPracticeMode) return;
    const pt = getCanvasCoordsFromPointer(cvs, e);
    
    if (Math.abs(pt.x - initialCanvasX) < CELL_PX * 0.3 && Math.abs(pt.y - initialCanvasY) < CELL_PX * 0.3) {
      let c = Math.floor(pt.x / CELL_PX);
      if (c >= COLS - 1) c = COLS - 2;
      if (myEngine) {
        if (myEngine.cursor.x !== c || myEngine.cursor.y !== grabbedRow) {
          SE.play('cursorMove');
        }
        myEngine.cursor.x = c; 
        myEngine.cursor.y = grabbedRow; 
      }
    }
  });
  cvs.addEventListener('pointercancel', () => { isDown = false; });

  const riseBtn = document.getElementById('rise-btn');
  riseBtn.addEventListener('pointerdown', (e) => { 
    e.preventDefault(); 
    if(myEngine && !(isMatchOver && !isPracticeMode)) myEngine.isRisingManualBtn = true; 
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => {
    riseBtn.addEventListener(ev, () => { if(myEngine) myEngine.isRisingManualBtn = false; });
  });

  window.addEventListener('blur', () => {
    p1InputState.keyGrabState.active = false;
    p1InputState.keyGrabState.consumed = false;
    if (myEngine) myEngine.isRisingManualKey = false;
    opponents.forEach(opp => {
      if (opp.inputState) {
        opp.inputState.keyGrabState.active = false;
        opp.inputState.keyGrabState.consumed = false;
      }
      if (opp.engine) opp.engine.isRisingManualKey = false;
    });
  });

  window.addEventListener('keydown', (e) => {
    if (assigningAction && assignType === 'key') {
      e.preventDefault();
      playerConfigs[settingsPlayerIdx].key[assigningAction] = (e.code === 'Delete' || e.code === 'Backspace') ? '' : e.code;
      assigningAction = null;
      renderConfigUI();
      return;
    }
    const code = e.code;
    if (code === keyConfig.Pause && !e.repeat) {
      if (document.getElementById('game-area').style.display === 'flex' && document.getElementById('result-overlay').style.display !== 'flex') {
        e.preventDefault();
        p1InputState.keyGrabState.active = false;
        p1InputState.keyGrabState.consumed = false;
        if (myEngine) myEngine.isRisingManualKey = false;
        exitGame();
        return;
      }
    }
    if (!myEngine || (isMatchOver && !isPracticeMode)) return;

    handleKeyboardActionForPlayer(myEngine, playerConfigs[0].key, p1InputState, code, e.repeat, true, null, e);
    if (currentMode === 'local') {
      opponents.forEach(opp => {
        if (opp.type === 'local_human' && opp.inputState) {
          handleKeyboardActionForPlayer(opp.engine, playerConfigs[opp.playerSlotIndex].key, opp.inputState, code, e.repeat, false, opp, e);
        }
      });
    }
  });

  window.addEventListener('keyup', (e) => {
    const releaseFor = (engine, cfgKey, stateObj) => {
      if (e.code === cfgKey.GrabLeft && stateObj.keyGrabState.active && stateObj.keyGrabState.side === 'left') {
        stateObj.keyGrabState.active = false;
        stateObj.keyGrabState.consumed = false;
      }
      if (e.code === cfgKey.GrabRight && stateObj.keyGrabState.active && stateObj.keyGrabState.side === 'right') {
        stateObj.keyGrabState.active = false;
        stateObj.keyGrabState.consumed = false;
      }
      if (engine && (e.code === cfgKey.Rise1 || e.code === cfgKey.Rise2)) {
        engine.isRisingManualKey = false;
      }
    };
    releaseFor(myEngine, playerConfigs[0].key, p1InputState);
    if (currentMode === 'local') {
      opponents.forEach(opp => {
        if (opp.type === 'local_human' && opp.inputState) {
          releaseFor(opp.engine, playerConfigs[opp.playerSlotIndex].key, opp.inputState);
        }
      });
    }
  });
}

// ==========================================
// 自動リサイズ・対戦人数別レイアウト
// ==========================================
let useMobileLayoutInLandscape = localStorage.getItem('pdw_mobile_layout') === 'true';

function toggleLandscapeLayout() {
  useMobileLayoutInLandscape = !useMobileLayoutInLandscape;
  localStorage.setItem('pdw_mobile_layout', useMobileLayoutInLandscape);
  updateLayoutToggleBtnText();
  adjustLayout();
}

function updateLayoutToggleBtnText() {
  const btn = document.getElementById('layout-toggle-btn');
  if (btn) {
    btn.innerText = useMobileLayoutInLandscape ? 'UI: 縦型' : 'UI: 横並び';
  }
}

function adjustLayout() {
  const isPortrait = window.innerHeight > window.innerWidth;
  const W = window.innerWidth;
  const H = window.innerHeight;
  const isLeft = document.getElementById('handedness-toggle')?.checked;

  const layoutBtn = document.getElementById('layout-toggle-btn');
  if (layoutBtn) {
    layoutBtn.style.display = (!isPortrait && currentMode !== 'local') ? 'block' : 'none';
    updateLayoutToggleBtnText();
  }

  const isLandscapeLarge = !isPortrait && !useMobileLayoutInLandscape;
  const oppCount = opponents.length;

  const myWrapper = document.getElementById('my-wrapper');
  const rivalsArea = document.getElementById('rivals-area');
  const rivalsTopArea = document.getElementById('rivals-top-area');
  const controls = document.getElementById('controls-container');
  const exitBtn = document.getElementById('exit-btn');
  const gameArea = document.getElementById('game-area');
  const gameContainer = document.getElementById('game-container');
  const handednessWrapper = document.getElementById('handedness-wrapper');

  if (!myWrapper || !controls || !exitBtn || !gameArea || !gameContainer) return;

  if (currentMode === 'local') {
    const isGameVisible = gameArea.style.display !== 'none';
    if (isPortrait && isGameVisible) {
      document.body.classList.add('local-force-landscape');
    } else {
      document.body.classList.remove('local-force-landscape');
    }

    const effW = isPortrait ? H : W;
    const effH = isPortrait ? W : H;

    rivalsTopArea.style.display = 'none';
    controls.style.display = 'none';
    rivalsArea.style.display = 'contents';

    if (exitBtn.parentNode !== gameArea) gameArea.appendChild(exitBtn);
    exitBtn.className = 'action-btn retire-btn absolute-top';
    exitBtn.style.position = '';
    exitBtn.style.width = '';
    exitBtn.style.margin = '';
    exitBtn.style.left = '12px';
    exitBtn.style.right = 'auto';

    const totalBoards = 1 + oppCount;
    const baseW = 224;
    const baseH = currentSkillEnabled ? 545 : 515;

    const scale = Math.max(
      0.32,
      Math.min(1.0, (effW - 24 - (totalBoards - 1) * 10) / (totalBoards * baseW), (effH - 54) / baseH)
    );

    gameContainer.style.position = 'relative';
    gameContainer.style.top = '';
    gameContainer.style.left = '';
    gameContainer.style.transform = '';
    gameContainer.style.width = '100%';
    gameContainer.style.height = '100%';
    gameContainer.style.maxWidth = '';
    gameContainer.style.flexDirection = 'row';
    gameContainer.style.flexWrap = 'nowrap';
    gameContainer.style.alignItems = 'center';
    gameContainer.style.alignContent = 'center';
    gameContainer.style.justifyContent = 'center';
    gameContainer.style.gap = '10px';
    gameContainer.style.padding = '36px 8px 8px 8px';

    const mx = (baseW - baseW * scale) / -2;
    const my = (baseH - baseH * scale) / -2;

    myWrapper.style.order = '0';
    myWrapper.style.transformOrigin = 'center';
    myWrapper.style.transform = `scale(${scale})`;
    myWrapper.style.margin = `${my}px ${mx}px`;

    opponents.forEach((_, i) => {
      const el = document.getElementById(`rival-wrapper-${i}`);
      if (el) {
        if (el.parentNode !== rivalsArea) rivalsArea.appendChild(el);
        el.style.order = String(i + 1);
        el.style.position = 'relative';
        el.style.width = '';
        el.style.flexShrink = '';
        el.style.transformOrigin = 'center';
        el.style.transform = `scale(${scale})`;
        el.style.margin = `${my}px ${mx}px`;
      }
    });
    return;
  }

  document.body.classList.remove('local-force-landscape');
  controls.style.display = 'flex';
  controls.style.alignItems = 'center';
  gameContainer.style.maxWidth = '';
  gameContainer.style.flexWrap = 'nowrap';
  gameContainer.style.alignContent = '';
  gameContainer.style.gap = '10px';

  if (isLandscapeLarge) {
    rivalsTopArea.style.display = 'none';
    rivalsArea.style.display = oppCount > 0 ? 'flex' : 'none';

    if (exitBtn.parentNode !== gameArea) gameArea.appendChild(exitBtn);
    exitBtn.className = 'action-btn retire-btn absolute-top';
    exitBtn.style.position = '';
    exitBtn.style.width = '';
    exitBtn.style.margin = '';
    if (isLeft) { exitBtn.style.right = '15px'; exitBtn.style.left = 'auto'; }
    else { exitBtn.style.left = '15px'; exitBtn.style.right = 'auto'; }

    opponents.forEach((_, i) => {
      const el = document.getElementById(`rival-wrapper-${i}`);
      if (el) {
        if (el.parentNode !== rivalsArea) rivalsArea.appendChild(el);
        el.style.order = '';
        el.style.position = '';
        el.style.transform = '';
        el.style.margin = '0';
        el.style.width = '';
        el.style.flexShrink = '';
      }
    });

    rivalsArea.style.flexDirection = 'row';
    rivalsArea.style.gap = '10px';

    controls.style.height = '';
    controls.style.justifyContent = 'flex-end';
    if (handednessWrapper) handednessWrapper.style.marginTop = '0';

    gameContainer.style.position = 'relative';
    gameContainer.style.top = '';
    gameContainer.style.left = '';
    gameContainer.style.transform = '';
    gameContainer.style.width = '100%';
    gameContainer.style.height = '100%';
    
    gameContainer.style.flexDirection = 'row';
    gameContainer.style.alignItems = 'center';
    gameContainer.style.justifyContent = 'center';
    gameContainer.style.padding = '10px';
    
    if (isLeft) {
      controls.style.order = 1;
      myWrapper.style.order = 2;
      rivalsArea.style.order = 3;
    } else {
      rivalsArea.style.order = 1;
      myWrapper.style.order = 2;
      controls.style.order = 3;
    }

    const totalBoards = 1 + oppCount;
    const availableW = W - 140;
    const baseBoardW = 224;
    let scale = Math.min(1.0, (H - 80) / 515);
    if ((baseBoardW * totalBoards + 20 * totalBoards) * scale > availableW) {
      scale = availableW / (baseBoardW * totalBoards + 20 * totalBoards);
    }
    scale = Math.max(0.4, scale);

    myWrapper.style.transform = `scale(${scale})`;
    myWrapper.style.margin = `0 ${(baseBoardW - baseBoardW * scale) / -2}px`;

    opponents.forEach((_, i) => {
      const el = document.getElementById(`rival-wrapper-${i}`);
      if (el) {
        el.style.transform = `scale(${scale})`;
        el.style.margin = `0 ${(baseBoardW - baseBoardW * scale) / -2}px`;
      }
    });

    controls.style.transform = `scale(${scale})`;

  } else if (oppCount <= 1) {
    rivalsTopArea.style.display = 'none';
    rivalsArea.style.display = 'none';

    if (exitBtn.parentNode !== gameArea) gameArea.appendChild(exitBtn);
    exitBtn.className = 'action-btn retire-btn absolute-top';
    exitBtn.style.position = '';
    exitBtn.style.width = '';
    exitBtn.style.margin = '';
    if (isLeft) { exitBtn.style.right = '12px'; exitBtn.style.left = 'auto'; }
    else { exitBtn.style.left = '12px'; exitBtn.style.right = 'auto'; }

    gameContainer.style.position = 'relative';
    gameContainer.style.top = '';
    gameContainer.style.left = '';
    gameContainer.style.transform = '';
    gameContainer.style.width = '100%';
    gameContainer.style.height = '100%';
    gameContainer.style.flexDirection = isLeft ? 'row' : 'row-reverse';
    gameContainer.style.alignItems = 'center';
    gameContainer.style.justifyContent = 'center';
    gameContainer.style.padding = '0px';

    controls.style.order = '';
    myWrapper.style.order = '';

    if (oppCount === 1) {
      const rivalWrapper = document.getElementById('rival-wrapper-0');
      if (rivalWrapper) {
        if (rivalWrapper.parentNode !== controls) {
          controls.insertBefore(rivalWrapper, controls.firstChild);
        }
        rivalWrapper.style.setProperty('order', '-1', 'important');

        const rivalScale = 110 / 224; 
        const originalRivalH = 510; 
        const scaledRivalH = originalRivalH * rivalScale;
        
        rivalWrapper.style.transform = `scale(${rivalScale})`;
        rivalWrapper.style.transformOrigin = 'top center';
        rivalWrapper.style.position = 'relative';
        rivalWrapper.style.top = '0';
        rivalWrapper.style.left = 'auto';
        rivalWrapper.style.right = 'auto';
        rivalWrapper.style.zIndex = '25';
        rivalWrapper.style.width = '224px';
        rivalWrapper.style.flexShrink = '0';
        rivalWrapper.style.marginBottom = `${scaledRivalH - originalRivalH}px`;
      }

      controls.style.height = '515px';
      controls.style.justifyContent = 'flex-start'; 
      if (handednessWrapper) handednessWrapper.style.marginTop = 'auto';
    } else {
      controls.style.height = '';
      controls.style.justifyContent = 'flex-end';
      if (handednessWrapper) handednessWrapper.style.marginTop = '0';
    }

    const baseBoardH = 515; 
    const availH = H - 80; 
    let myScale = Math.min(1.0, availH / baseBoardH);
    const contentW = 344;
    if (contentW * myScale > W - 10) myScale = (W - 10) / contentW;
    myScale = Math.max(0.4, myScale);
    
    myWrapper.style.transform = `scale(${myScale})`;
    controls.style.transform = `scale(${myScale})`;
    myWrapper.style.transformOrigin = 'center';
    controls.style.transformOrigin = 'center';

    const boardMx = (224 - 224 * myScale) / -2;
    const ctrlMx = (110 - 110 * myScale) / -2;
    const scaleMy = (baseBoardH - baseBoardH * myScale) / -2;
    myWrapper.style.margin = `${scaleMy}px ${boardMx}px`;
    controls.style.margin = `${scaleMy}px ${ctrlMx}px`;
    
    controls.style.position = 'relative';
    controls.style.bottom = 'auto';
    controls.style.left = 'auto';
    controls.style.right = 'auto';
    controls.style.width = '110px';

  } else {
    rivalsArea.style.display = 'none';

    rivalsTopArea.style.display = 'flex';
    rivalsTopArea.style.position = 'absolute';
    rivalsTopArea.style.top = '4px';
    rivalsTopArea.style.left = '0';
    rivalsTopArea.style.width = '100vw';
    const maxTopH = H * 0.24;
    rivalsTopArea.style.height = `${maxTopH}px`;
    rivalsTopArea.style.flexDirection = 'row';
    rivalsTopArea.style.alignItems = 'center';
    rivalsTopArea.style.justifyContent = 'center';
    rivalsTopArea.style.gap = '6px';
    rivalsTopArea.style.zIndex = '30';
    rivalsTopArea.style.overflow = 'hidden';

    const availW = W - 12;
    const scaleH = (maxTopH - 6) / 510;
    const scaleW = availW / (oppCount * 224 + (oppCount - 1) * 6);
    const miniScale = Math.min(scaleH, scaleW, 0.42);

    opponents.forEach((_, i) => {
      const el = document.getElementById(`rival-wrapper-${i}`);
      if (el) {
        if (el.parentNode !== rivalsTopArea) rivalsTopArea.appendChild(el);
        el.style.order = '';
        el.style.position = 'relative';
        el.style.transform = `scale(${miniScale})`;
        el.style.transformOrigin = 'center center';
        const wAdj = (224 - 224 * miniScale) / -2;
        const hAdj = (510 - 510 * miniScale) / -2;
        el.style.margin = `${hAdj}px ${wAdj}px`;
        el.style.width = '224px';
        el.style.flexShrink = '0';
      }
    });

    if (exitBtn.parentNode !== controls) controls.insertBefore(exitBtn, controls.firstChild);
    exitBtn.className = 'action-btn retire-btn';
    exitBtn.style.position = 'static';
    exitBtn.style.width = '100%';
    exitBtn.style.padding = '8px 4px';
    exitBtn.style.fontSize = '0.85rem';
    exitBtn.style.marginBottom = '4px';

    controls.style.height = 'auto';
    controls.style.justifyContent = 'center';
    controls.style.width = '110px';
    controls.style.order = '';
    myWrapper.style.order = '';
    if (handednessWrapper) handednessWrapper.style.marginTop = '0';

    gameContainer.style.flexDirection = isLeft ? 'row' : 'row-reverse';
    gameContainer.style.alignItems = 'center';
    gameContainer.style.justifyContent = 'center';
    gameContainer.style.position = 'absolute';
    gameContainer.style.top = `${maxTopH + 8}px`;
    gameContainer.style.left = '0';
    gameContainer.style.transform = 'none';
    gameContainer.style.width = '100vw';
    gameContainer.style.height = `${H - maxTopH - 8}px`;
    gameContainer.style.padding = '0';

    const maxCenterH = H - maxTopH - 24;
    let myScale = Math.min(1.0, maxCenterH / 515);
    const contentW = 344;
    if (contentW * myScale > W - 10) myScale = (W - 10) / contentW;
    myScale = Math.max(0.32, myScale);

    myWrapper.style.transform = `scale(${myScale})`;
    controls.style.transform = `scale(${myScale})`;
    myWrapper.style.transformOrigin = 'center';
    controls.style.transformOrigin = 'center';

    const boardMx = (224 - 224 * myScale) / -2;
    const ctrlMx = (110 - 110 * myScale) / -2;
    myWrapper.style.margin = `0 ${boardMx}px`;
    controls.style.margin = `0 ${ctrlMx}px`;
  }
}

function toggleHandedness() {
  const isLeft = document.getElementById('handedness-toggle').checked;
  const gameArea = document.getElementById('game-area');
  const label = document.getElementById('handedness-text');
  if (isLeft) {
    gameArea.classList.remove('right-handed');
    gameArea.classList.add('left-handed');
    label.innerText = '左利きモード';
    localStorage.setItem('pdw_handedness', 'left');
  } else {
    gameArea.classList.remove('left-handed');
    gameArea.classList.add('right-handed');
    label.innerText = '右利きモード';
    localStorage.setItem('pdw_handedness', 'right');
  }
  adjustLayout();
}

window.addEventListener('resize', adjustLayout);
window.addEventListener('orientationchange', () => setTimeout(adjustLayout, 100));

window.addEventListener('DOMContentLoaded', () => {
  if (localStorage.getItem('pdw_handedness') === 'left') {
    document.getElementById('handedness-toggle').checked = true;
  }
  toggleHandedness();

  const gameAreaEl = document.getElementById('game-area');
  gameAreaEl.addEventListener('touchstart', (e) => {
    if (e.touches.length > 1) {
      e.preventDefault(); 
    }
  }, { passive: false });

  gameAreaEl.addEventListener('touchmove', (e) => {
    const settings = document.getElementById('settings-overlay');
    if (settings.style.display !== 'block') {
       e.preventDefault(); 
    }
  }, { passive: false });
  
  gameAreaEl.addEventListener('gesturestart', (e) => {
    e.preventDefault();
  });
  
  let lastTouchEnd = 0;
  gameAreaEl.addEventListener('touchend', (e) => {
    const now = (new Date()).getTime();
    if (now - lastTouchEnd <= 300) {
      e.preventDefault();
    }
    lastTouchEnd = now;
  }, { passive: false });

  if (typeof syncPlayerSkillSelects === 'function') syncPlayerSkillSelects();
  if (typeof initAssetsSystem === 'function') initAssetsSystem();
  if (typeof initStorySystem === 'function') initStorySystem();
});
6. js/network.js
JavaScript
// --- オンライン対戦 ---
const PEER_PREFIX = 'pdw-26-';

function generateShortRoomCode() {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let res = '';
  for (let i = 0; i < 4; i++) res += chars.charAt(Math.floor(Math.random() * chars.length));
  return res;
}

function createRoom() {
  let code = document.getElementById('peer-room-id').value.trim();
  if (!code) { code = generateShortRoomCode(); document.getElementById('peer-room-id').value = code; }
  const fullPeerId = PEER_PREFIX + code.toUpperCase();
  
  if (peer) { try { peer.destroy(); } catch(e){} }
  peer = new Peer(fullPeerId);
  
  const maxPlayers = parseInt(document.getElementById('online-max-players').value) || 2;
  currentMode = 'online_host';
  onlineConnections = [];

  peer.on('open', () => {
    document.getElementById('main-menu-actions').style.display = 'none';
    const waiting = document.getElementById('room-waiting');
    waiting.style.display = 'flex';
    document.getElementById('waiting-code-container').style.display = 'block';
    document.getElementById('waiting-code').innerText = code.toUpperCase();
    document.getElementById('waiting-max').innerText = maxPlayers;
    document.getElementById('waiting-count').innerText = 1;
    document.getElementById('waiting-status-text').innerText = '参加者を待っています...';
    document.getElementById('force-start-btn').style.display = 'inline-block';
    navigator.clipboard?.writeText(code.toUpperCase()); 
    showToast(`部屋コード [${code.toUpperCase()}] をコピーしました！`);
  });

  peer.on('connection', (c) => {
    c.on('open', () => {
      if (currentMode !== 'online_host') { c.close(); return; }
      if (onlineConnections.length >= maxPlayers - 1) { c.close(); return; }
      
      onlineConnections.push(c);
      bindConnEvents(c, true); 
      document.getElementById('waiting-count').innerText = 1 + onlineConnections.length;
      
      if (onlineConnections.length >= maxPlayers - 1) {
        startCountdown();
      }
    });
  });
}

function cancelRoom() {
  onlineConnections.forEach(c => c.close());
  onlineConnections = [];
  if (peer) { peer.destroy(); peer = null; }
  document.getElementById('room-waiting').style.display = 'none';
  document.getElementById('main-menu-actions').style.display = 'flex';
}

function joinRoom() {
  const code = document.getElementById('peer-room-id').value.trim();
  if (!code) { showToast('部屋コードを入力してください'); return; }
  const targetPeerId = PEER_PREFIX + code.toUpperCase();

  if (peer) { try { peer.destroy(); } catch(e){} }
  peer = new Peer();
  currentMode = 'online_client';

  peer.on('open', () => {
    const c = peer.connect(targetPeerId);
    c.on('open', () => { 
      onlineConnections = [c];
      bindConnEvents(c, false); 
      document.getElementById('main-menu-actions').style.display = 'none';
      const waiting = document.getElementById('room-waiting');
      waiting.style.display = 'flex';
      document.getElementById('waiting-code-container').style.display = 'none';
      document.getElementById('waiting-status-text').innerText = '部屋に参加しました。ホストの開始を待機中...';
      document.getElementById('waiting-count').innerText = '-';
      document.getElementById('waiting-max').innerText = '-';
      document.getElementById('force-start-btn').style.display = 'none';
    });
    c.on('error', () => { showToast('部屋への接続に失敗しました'); });
  });
}

function startCountdown() {
  if (countdownTimer) clearInterval(countdownTimer);
  document.getElementById('countdown-overlay').style.display = 'flex';
  document.getElementById('countdown-text').innerText = '10';

  if (myOnlineId === 'host' || currentMode === 'online_host') {
    document.getElementById('countdown-start-btn').style.display = 'inline-block';
    document.getElementById('countdown-start-btn').focus();
    onlineConnections.forEach(c => {
      if (c.open) c.send({ type: 'start_countdown' });
    });
  } else {
    document.getElementById('countdown-start-btn').style.display = 'none';
  }

  let count = 10;
  countdownTimer = setInterval(() => {
    count--;
    if (count >= 0) {
      document.getElementById('countdown-text').innerText = count;
    } else {
      clearInterval(countdownTimer);
      if (myOnlineId === 'host' || currentMode === 'online_host') {
        forceStartRoom();
      }
    }
  }, 1000);
}

function forceStartRoom() {
  if (countdownTimer) clearInterval(countdownTimer);
  document.getElementById('countdown-overlay').style.display = 'none';

  const maxPlayers = parseInt(document.getElementById('online-max-players').value);
  const comLvl = parseInt(document.getElementById('online-com-level')?.value) || 3;
  const comUseCheat = !!document.getElementById('online-skill-toggle')?.checked;
  currentComLevel = comLvl;
  let players = [{ id: 'host', type: 'player', name: 'HOST' }];
  
  onlineConnections.forEach((c, idx) => {
    const cId = `client_${idx}`;
    c._clientId = cId;
    players.push({ id: cId, type: 'player', name: `PLAYER ${idx+1}`, conn: c });
  });

  const currentCount = players.length;
  for(let i = 0; i < maxPlayers - currentCount; i++) {
    players.push({ id: `com_${i}`, type: 'com', level: comLvl, useCheat: comUseCheat, name: `COM ${i+1}` });
  }

  matchPlayersConfig = players;
  startPrepareMatchFromHost();
}

function startPrepareMatchFromHost() {
  boardReady = {};
  rematchReady = {};
  
  const skillEnabled = !!document.getElementById('online-skill-toggle')?.checked;
  const configBase = matchPlayersConfig.map(pl => ({
    id: pl.id, type: pl.type, level: pl.level, useCheat: !!pl.useCheat, name: pl.name
  }));
  const matchId = Date.now();
  const sharedSeed = Math.floor(Math.random() * 0xFFFFFFFF);
  
  onlineConnections.forEach(c => {
    const cId = c._clientId;
    const config = { players: configBase, myId: cId, matchId: matchId, seed: sharedSeed, skillEnabled };
    if (c.open) c.send({ type: 'prepare_match', config });
  });
  
  const hostConfig = { players: configBase, myId: 'host', matchId: matchId, seed: sharedSeed, skillEnabled };
  prepareMatchLocal(hostConfig);
}

function prepareMatchLocal(config) {
  if (countdownTimer) clearInterval(countdownTimer);
  document.getElementById('countdown-overlay').style.display = 'none';
  document.getElementById('result-overlay').style.display = 'none';

  currentMode = 'online';
  currentMatchId = config.matchId;
  myOnlineId = config.myId;
  matchPlayersConfig = config.players; 
  currentSkillEnabled = !!config.skillEnabled;
  matchState = 'preparing';
  isPracticeMode = false;

  document.getElementById('menu-overlay').style.display = 'none';
  document.getElementById('game-area').style.display = 'flex';

  setupInput();
  resetGameLogicOnline(config);
  
  if (loopId) cancelAnimationFrame(loopId);
  lastTime = performance.now();
  accumulator = 0;
  loopId = requestAnimationFrame(gameLoop);
  
  startSyncInterval();

  if (typeof sendMyAppearanceOnline === 'function') {
    sendMyAppearanceOnline();
  }

  setTimeout(() => {
    if (myOnlineId === 'host') {
      handleBoardReady('host');
    } else {
      if (onlineConnections[0] && onlineConnections[0].open) {
        onlineConnections[0].send({ type: 'board_ready', senderId: myOnlineId });
      }
    }
  }, 800);
}

function handleBoardReady(senderId) {
  if (myOnlineId !== 'host') return;
  boardReady[senderId] = true;
  
  let allReady = true;
  const humanIds = matchPlayersConfig.filter(p => p.type === 'player').map(p => p.id);
  humanIds.forEach(id => {
    if (!boardReady[id]) allReady = false;
  });
  
  if (allReady) {
    onlineConnections.forEach(c => {
      if (c.open) c.send({ type: 'start_match_execute' });
    });
    executeStartMatch();
  }
}

function executeStartMatch() {
  matchState = 'ready';
  
  readyBgm();
  showReadyGo(); 

  if (loopId) cancelAnimationFrame(loopId);
  lastTime = performance.now();
  accumulator = 0;
  loopId = requestAnimationFrame(gameLoop);
  
  startSyncInterval();
}

function resetGameLogicOnline(config) {
  isMatchOver = false;
  isDeadInMatch = false;
  isPracticeMode = false;
  myTargetIndex = -1;
  currentSkillEnabled = !!config.skillEnabled;
  if (typeof hidePlayerHeaderCutin === 'function') hidePlayerHeaderCutin();
  
  rematchReady = {};
  config.players.forEach(p => {
    if (p.type !== 'com') rematchReady[p.id] = false;
  });

  const handicap = parseInt(document.getElementById('handicap-val').value) || 3;
  const sharedSeed = config.seed !== undefined ? config.seed : Math.floor(Math.random() * 0xFFFFFFFF);
  const resolvedCharId = resolvePlayableCharId(selectedCharId);

  myRenderer = new BoardRenderer('my-canvas');
  myRenderer.theme = buildThemeForCharacter(
    resolvedCharId,
    (resolvedCharId === 'custom' && CustomAssets.chara) ? CustomAssets.chara.dataUrl : null,
    true,
    resolvedCharId === 'custom' ? getPlayerDisplayName() : null
  );
  document.getElementById('player-label').innerText = myRenderer.theme.name;

  myEngine = new PonEngine(
    (state) => { if (state === 'gameover') checkMatchEnd(); },
    (totalBlocks, isHard) => { distributeGarbageOnline(myOnlineId, totalBlocks, isHard); },
    handicap,
    true,
    sharedSeed
  );
  myEngine.onRowPushed = handleMyRowPushed;
  myEngine.garbageQueue = [];
  myEngine.onChainEnd = (chain) => {
    if (typeof showPlayerHeaderCutin === 'function') {
      showPlayerHeaderCutin(myRenderer.theme, `${chain} CHAIN!!`, '#ffd700');
    }
  };
  myEngine.onSimultaneousMatch = (size) => {
    if (typeof showPlayerHeaderCutin === 'function') {
      showPlayerHeaderCutin(myRenderer.theme, `${size}個消し！`, '#00d4ff');
    }
  };

  if (typeof initPlayerSkillState === 'function') {
    initPlayerSkillState(currentSkillEnabled);
  }

  const rivalsArea = document.getElementById('rivals-area');
  const rivalsTopArea = document.getElementById('rivals-top-area');
  rivalsArea.innerHTML = '';
  rivalsTopArea.innerHTML = '';
  opponents = [];

  const CheatClass = (typeof cheat === 'function' && cheat)
                  || (typeof Cheat === 'function' && Cheat)
                  || (typeof CheatAI === 'function' && CheatAI);

  let index = 0;
  config.players.forEach(p => {
    if (p.id === myOnlineId) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'board-wrapper rival-board';
    if (p.type === 'com') wrapper.classList.add('com-board');
    wrapper.id = `rival-wrapper-${index}`;
    const targetIdx = index;
    wrapper.onclick = () => selectTarget(targetIdx);

    let nameColor = p.type === 'com' ? '#aaaaaa' : '#e94560';

    wrapper.innerHTML = `
      <div class="garbage-preview-box">
        <span class="preview-label">予告</span>
        <div id="rival-garbage-preview-${index}" class="preview-list"></div>
        <span id="rival-skill-badge-${index}" class="skill-count-badge" style="display:none;"></span>
      </div>
      <div class="board-header">
        <span style="color: ${nameColor};">${p.name} <span class="target-badge">🎯 TARGET</span></span>
        <span id="rival-score-label-${index}">SCORE: 0</span>
      </div>
      <div class="canvas-container"><canvas id="rival-canvas-${index}"></canvas></div>
    `;
    rivalsArea.appendChild(wrapper);

    const rRenderer = new BoardRenderer(`rival-canvas-${index}`);
    let rEngine = null, rAI = null;

    if (p.type === 'com' && myOnlineId === 'host') {
      rEngine = new PonEngine(
        (state) => { 
          if (state === 'gameover') {
            checkMatchEnd();
            onlineConnections.forEach(c => {
              if (c && c.open) c.send({ type: 'sync', senderId: p.id, gameOver: true });
            });
          } 
        },
        (totalBlocks, isHard) => { distributeGarbageOnline(p.id, totalBlocks, isHard); },
        3,
        false,
        sharedSeed
      );
      rEngine.garbageQueue = [];
      if (p.useCheat && CheatClass) {
        // オンライン対戦時のCOMスキル上限は3回
        rAI = new CheatClass(rEngine, p.level || 2, p.id, { maxSkillUses: 3 });
      } else {
        rAI = new ComAI(rEngine, p.level || 2, p.id);
      }
    } else {
      rEngine = new PonEngine(null, null, 3, false, sharedSeed);
      rEngine.garbageQueue = [];
    }

    rEngine.gameOver = false;

    const fallbackCharId = p.type === 'com' ? CHARACTERS[(index + 1) % CHARACTERS.length].id : 'main00';
    rRenderer.theme = buildThemeForCharacter(p.charId || fallbackCharId, null, false);
    const initialSkillRem = (p.type === 'com' && p.useCheat) || (p.type === 'player' && currentSkillEnabled)
      ? 3
      : undefined;

    const oppObj = {
      id: p.id,
      name: p.name,
      type: p.type,
      engine: rEngine,
      renderer: rRenderer,
      ai: rAI,
      syncedSkillRemaining: initialSkillRem,
      index: index
    };
    opponents.push(oppObj);
    if (typeof updateRivalSkillBadge === 'function') updateRivalSkillBadge(oppObj, index);
    index++;
  });

  updateGarbagePreview(myEngine, 'my-garbage-preview');
  opponents.forEach((opp, i) => updateGarbagePreview(opp.engine, `rival-garbage-preview-${i}`));
  updateTargetUI();
  if (typeof updateSkillButtonUI === 'function') updateSkillButtonUI();
  adjustLayout();
}

function startSyncInterval() {
  if (syncIntervalId) clearInterval(syncIntervalId);
  syncIntervalId = setInterval(() => {
    if (!myEngine) return;
    const mySkillRem = (typeof playerSkillState !== 'undefined' && playerSkillState.enabled)
      ? playerSkillState.usesLeft
      : undefined;
    
    if (!isPracticeMode && !isMatchOver) {
       const syncData = { 
         type: 'sync', senderId: myOnlineId, grid: myEngine.grid, nextRow: myEngine.nextRow, 
         riseOffset: myEngine.riseOffset, score: myEngine.score, 
         garbageQueue: myEngine.garbageQueue, gameOver: myEngine.gameOver,
         skillRemaining: mySkillRem
       };
       onlineConnections.forEach(c => { if (c && c.open) c.send(syncData); });
    } else {
       const syncData = { 
         type: 'sync', senderId: myOnlineId, gameOver: isDeadInMatch, skillRemaining: mySkillRem
       };
       onlineConnections.forEach(c => { if (c && c.open) c.send(syncData); });
    }

    if (myOnlineId === 'host') {
      opponents.forEach(opp => {
        if (opp.type === 'com' && opp.engine) {
          const comSyncData = {
            type: 'sync', senderId: opp.id, grid: opp.engine.grid, nextRow: opp.engine.nextRow, 
            riseOffset: opp.engine.riseOffset, score: opp.engine.score, 
            garbageQueue: opp.engine.garbageQueue, gameOver: opp.engine.gameOver,
            skillRemaining: (opp.ai && typeof opp.ai.getRemainingSkills === 'function') ? opp.ai.getRemainingSkills() : undefined
          };
          onlineConnections.forEach(c => { if (c && c.open) c.send(comSyncData); });
        }
      });
    }
  }, 100);
}

function createOnlineSubstituteAI(opp) {
  if (currentSkillEnabled && typeof cheat === 'function') {
    const rem = opp.syncedSkillRemaining !== undefined ? Math.min(3, Math.max(0, opp.syncedSkillRemaining)) : 3;
    const ai = new cheat(opp.engine, currentComLevel, opp.id, { maxSkillUses: 3 });
    ai.skillUsesLeft = rem;
    return ai;
  }
  return new ComAI(opp.engine, currentComLevel, opp.id);
}

function replaceClientWithCom(leftId) {
   const opp = opponents.find(o => o.id === leftId);
   if (opp && opp.type !== 'com') {
      opp.type = 'com';
      opp.name = opp.name + ' (COM)';
      
      if (!opp.engine.gameOver) {
         opp.engine.onStateChange = (state) => { if (state === 'gameover') checkMatchEnd(); };
         opp.engine.onSendGarbage = (totalBlocks, isHard) => { distributeGarbageOnline(opp.id, totalBlocks, isHard); };
         opp.ai = createOnlineSubstituteAI(opp);
         showToast(`${opp.name} が退出したためCOMが代役に入りました。`);
      } else {
         opp.ai = createOnlineSubstituteAI(opp);
      }
      
      const configP = matchPlayersConfig.find(p => p.id === leftId);
      if (configP) {
         configP.type = 'com';
         configP.level = currentComLevel;
         configP.useCheat = currentSkillEnabled;
         configP.name = opp.name;
      }
   }
}

function handlePlayerLeftHost(leftId) {
   replaceClientWithCom(leftId);
   onlineConnections.forEach(c => {
     if (c.open) c.send({ type: 'player_left', leftId: leftId });
   });
   if (matchState === 'gameover' && rematchReady[myOnlineId]) {
     checkRematchCondition();
   } else if (matchState === 'preparing') {
     handleBoardReady('host'); 
   }
   checkMatchEnd();
}

function handleHostDisconnected() {
  if (!isMatchOver) {
     hostDisconnected = true;
     showToast("ホストとの接続が切れました。試合終了後に退出します。");
     opponents.forEach(opp => {
       if (opp.type !== 'com' && !opp.engine.gameOver) {
         opp.type = 'com';
         opp.name = opp.name + ' (COM)';
         opp.engine.onStateChange = (state) => { if (state === 'gameover') checkMatchEnd(); };
         opp.engine.onSendGarbage = () => {}; 
         opp.ai = createOnlineSubstituteAI(opp);
       } else if (opp.type === 'com' && !opp.engine.gameOver) {
         opp.ai = createOnlineSubstituteAI(opp);
         opp.engine.onSendGarbage = () => {}; 
       }
     });
  } else {
     if (currentMode === 'online') {
        showToast("ホストが退出したため解散します。");
        setTimeout(() => exitGame(), 2000);
     }
  }
}

function bindConnEvents(c, isHostMode) {
  c.on('data', (data) => {
    if (data.type === 'sync') {
      const senderOpp = opponents.find(o => o.id === data.senderId);
      if (senderOpp && senderOpp.engine) {
        if (data.grid) senderOpp.engine.grid = data.grid;
        if (data.nextRow) senderOpp.engine.nextRow = data.nextRow;
        if (data.riseOffset !== undefined) senderOpp.engine.riseOffset = data.riseOffset;
        if (data.score !== undefined) senderOpp.engine.score = data.score;
        if (data.garbageQueue) senderOpp.engine.garbageQueue = data.garbageQueue;
        if (data.skillRemaining !== undefined) senderOpp.syncedSkillRemaining = data.skillRemaining;

        if (data.gameOver !== undefined) {
           const wasGameOver = senderOpp.engine.gameOver;
           senderOpp.engine.gameOver = data.gameOver;
           if (!wasGameOver && data.gameOver) {
              checkMatchEnd();
           }
        }
      }
      if (isHostMode) {
        onlineConnections.forEach(otherC => {
          if (otherC !== c && otherC.open) otherC.send(data);
        });
      }
    } 
    else if (data.type === 'start_countdown') {
      startCountdown();
    }
    else if (data.type === 'garbage_request' && isHostMode) {
      for (const [tId, count] of Object.entries(data.targets)) {
        playGarbageSendAnimation(data.senderId, tId, data.isHard);
        if (tId === 'host') {
          if (!isPracticeMode) sendBlocksToOpponent({ engine: myEngine }, count, data.isHard);
        } else {
          const opp = opponents.find(o => o.id === tId);
          if (opp && opp.type === 'com') sendBlocksToOpponent(opp, count, data.isHard);
        }
      }
      onlineConnections.forEach(otherC => {
        if (otherC.open) otherC.send({ type: 'add_garbage_multi', senderId: data.senderId, targets: data.targets, isHard: data.isHard });
      });
    }
    else if (data.type === 'add_garbage_multi') {
      for (const tId of Object.keys(data.targets)) {
         if (data.senderId !== myOnlineId) {
           playGarbageSendAnimation(data.senderId, tId, data.isHard);
         }
      }
      if (data.targets[myOnlineId] && !isPracticeMode) {
        sendBlocksToOpponent({ engine: myEngine }, data.targets[myOnlineId], data.isHard);
      }
    }
    else if (data.type === 'prepare_match') {
      prepareMatchLocal(data.config);
    }
    else if (data.type === 'board_ready') {
      if (isHostMode) handleBoardReady(data.senderId);
    }
    else if (data.type === 'start_match_execute') {
      executeStartMatch();
    }
    else if (data.type === 'rematch_ready') {
      rematchReady[data.senderId] = true;
      if (isHostMode) checkRematchCondition();
    }
    else if (data.type === 'player_left') {
      if (!isHostMode) {
        replaceClientWithCom(data.leftId);
        checkMatchEnd();
      }
    }
    else if (data.type === 'appearance_sync') {
      const targetOpp = opponents.find(o => o.id === data.senderId);
      if (targetOpp && targetOpp.renderer) {
        targetOpp.renderer.theme = buildThemeForCharacter(data.charId, data.customCharaUrl, false, data.customName);
        const nameEl = targetOpp.renderer.canvas.closest('.board-wrapper')?.querySelector('.board-header span');
        if (nameEl) {
          const chName = data.customName || getCharacterById(data.charId).name;
          nameEl.innerHTML = `${chName} (${targetOpp.name}) <span class="target-badge">🎯 TARGET</span>`;
        }
      }
      if (isHostMode) {
        onlineConnections.forEach(otherC => {
          if (otherC !== c && otherC.open) otherC.send(data);
        });
      }
    }
    else if (data.type === 'online_cutin') {
      const targetOpp = opponents.find(o => o.id === data.senderId);
      if (targetOpp && targetOpp.engine) {
        targetOpp.engine.cutinMax = 50;
        targetOpp.engine.cutinTimer = 50;
        targetOpp.engine.cutinText = data.text;
      }
      if (isHostMode) {
        onlineConnections.forEach(otherC => {
          if (otherC !== c && otherC.open) otherC.send(data);
        });
      }
    }
    else if (data.type === 'cheat_corrupt_row') {
      if (data.targetId === myOnlineId && myEngine && !myEngine.gameOver && !isPracticeMode) {
        if (typeof applyCorruptRowToEngine === 'function') applyCorruptRowToEngine(myEngine, data.row);
      }
    }
    else if (data.type === 'leave') {
      if (isHostMode) {
        handlePlayerLeftHost(data.senderId);
      } else {
        if (data.senderId === 'host') {
           handleHostDisconnected();
        } else {
           replaceClientWithCom(data.senderId);
           checkMatchEnd();
        }
      }
    }
  });
  c.on('close', () => {
    if (isHostMode) {
      const index = onlineConnections.indexOf(c);
      if (index !== -1) {
         const leftId = c._clientId;
         onlineConnections.splice(index, 1);
         if (leftId) handlePlayerLeftHost(leftId);
      }
    } else {
      handleHostDisconnected();
    }
  });
}

function sendOnlineCutin(senderId, text) {
  const payload = { type: 'online_cutin', senderId, text };
  onlineConnections.forEach(c => {
    if (c && c.open) c.send(payload);
  });
}

function sendMyAppearanceOnline() {
  const resolved = resolvePlayableCharId(selectedCharId);
  const payload = {
    type: 'appearance_sync',
    senderId: myOnlineId,
    charId: resolved,
    customCharaUrl: (resolved === 'custom' && CustomAssets.chara) ? CustomAssets.chara.dataUrl : null,
    customName: resolved === 'custom' ? getPlayerDisplayName() : null
  };
  onlineConnections.forEach(c => {
    if (c && c.open) c.send(payload);
  });
}
