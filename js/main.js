// ==========================================
// 対戦・ターゲット・ゲーム管理システム
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

function showToast(msg) { 
  const t = document.getElementById('toast'); 
  t.innerText = msg; t.style.display = 'block'; 
  setTimeout(() => t.style.display = 'none', 3000); 
}
function showSingleMenu() { document.getElementById('main-menu-actions').style.display = 'none'; document.getElementById('single-menu').style.display = 'flex'; updateSingleMenu(); }
function showComMenu() { document.getElementById('main-menu-actions').style.display = 'none'; document.getElementById('com-menu').style.display = 'flex'; }
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
  let initLevel = 1;
  if (mode === 'survival') {
    survivalBaseLevel = parseInt(document.getElementById('survival-init-level').value) || 1;
    initLevel = getSurvivalLevel(survivalBaseLevel, 1);
  }
  startGame('single_' + mode, initLevel, mode === 'survival' ? 2 : 1);
}
function backToMainMenu() { 
  document.getElementById('com-menu').style.display = 'none'; 
  document.getElementById('single-menu').style.display = 'none'; 
  document.getElementById('ranking-menu').style.display = 'none'; 
  document.getElementById('story-menu').style.display = 'none'; // ★追加
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
    if (id === 'player' || id === myOnlineId || id === 'host' && myOnlineId === 'host') return document.getElementById('my-wrapper');
    const opp = opponents.find(o => o.id === id);
    if (opp) return document.getElementById(`rival-wrapper-${opp.index}`);
    return null;
  };
  
  const getTargetEl = (id) => {
    if (id === 'player' || id === myOnlineId || id === 'host' && myOnlineId === 'host') return document.getElementById('my-garbage-preview');
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
  // 0.5s から 0.8s へアニメーション時間を延長
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
    startGame('story', currentComLevel, 2);
  } else if ...
  
  if (currentMode === 'single' || currentMode === 'com') {
    startGame(currentMode, currentComLevel, currentTotalPlayers);
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

   // 自分が負けた瞬間
  if (myEngine && myEngine.gameOver && !isMatchOver && !isPracticeMode) {
    isMatchOver = true;
    isDeadInMatch = true;

    if (currentMode === 'online') {
      const syncData = { type: 'sync', senderId: myOnlineId, gameOver: true };
      onlineConnections.forEach(c => { if (c && c.open) c.send(syncData); });
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
	
	if (currentMode === 'story') {
      matchState = 'gameover';
      stopAllEngines();
      StoryManager.onBattleEnd(false);
      return;
    }
	
  }

  // 自分以外の全員が負けた瞬間（自分が生き残って勝利）
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
	 
	 if (currentMode === 'story') {
      isMatchOver = true;
      matchState = 'gameover';
      stopAllEngines();
      StoryManager.onBattleEnd(true);
      return;
    }
	 
  }

  // 全滅、もしくは自分以外全滅して自分も負けた場合など、試合が完全に終わった状態
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
  // 動作の速度は止めるが、gameoverフラグは強制変更しない（勝者が死んだ扱いにならないようにする）
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
  
  let panic = false;
  const panicThresholdR = ROWS * 0.3; 

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const b = myEngine.grid[r][c];
      if (b !== null) {
        if (b.state === 'normal') {
          if ((r - myEngine.riseOffset) <= panicThresholdR) {
            panic = true; 
            break;
          }
        }
      }
    }
    if (panic) break;
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

function startGame(mode, level = 1, totalPlayers = 2) {
  document.getElementById('result-overlay').style.display = 'none'; 
  currentMode = mode;
  currentComLevel = level;
  currentTotalPlayers = totalPlayers;
  matchState = 'ready';
  isPracticeMode = false;
  
  document.getElementById('menu-overlay').style.display = 'none';
  document.getElementById('game-area').style.display = 'flex';
  
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
  
  const handicap = parseInt(document.getElementById('handicap-val').value) || 3;
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
  if (currentMode === 'single_survival' && document.getElementById('survival-keep-speed').checked) {
     myEngine.keepSpeed = true;
  }

  // ★追加：自分のキャラテーマ（立ち絵・背景・フレーム）とカットイン設定
  const playerCharId = currentMode === 'story' ? 'main00' : selectedCharId;
  myRenderer.theme = buildThemeForCharacter(
    playerCharId,
    (playerCharId === 'custom' && CustomAssets.chara) ? CustomAssets.chara.dataUrl : null,
    true
  );
  document.getElementById('player-label').innerText = getCharacterById(playerCharId).name;
  myEngine.onMatchEvent = (chain, size) => {
    myEngine.cutinMax = 45;
    myEngine.cutinTimer = 45;
    myEngine.cutinText = chain >= 2 ? `${chain} CHAIN!!` : `${size} ERASE!`;
  };

  const rivalsArea = document.getElementById('rivals-area');
  const rivalsTopArea = document.getElementById('rivals-top-area');
  rivalsArea.innerHTML = '';
  rivalsTopArea.innerHTML = '';
  opponents = [];

  const opponentCount = currentMode.startsWith('single') && currentMode !== 'single_survival' ? 0 : currentTotalPlayers - 1;
  // ★追加：COM対戦時の相手キャラ候補（自分と被らないようシャッフル）
  const rivalCharPool = CHARACTERS.filter(c => c.id !== playerCharId).sort(() => Math.random() - 0.5);

  for (let i = 0; i < opponentCount; i++) {
    const wrapper = document.createElement('div');
    wrapper.className = 'board-wrapper rival-board';
    if (currentMode === 'com' || currentMode === 'story') wrapper.classList.add('com-board'); // ★変更：storyも対象に
    wrapper.id = `rival-wrapper-${i}`;
    wrapper.onclick = () => selectTarget(i);

    // ★変更：storyもCOM戦として動かす
    let isComMode = currentMode === 'com' || currentMode === 'single_survival' || currentMode === 'story';

    // ★追加：相手キャラを決定して名前・色・テーマを設定
    const oppChar = (currentMode === 'story' && StoryManager.activeStage)
      ? getCharacterById(StoryManager.activeStage.enemyId)
      : rivalCharPool[i % rivalCharPool.length];

    let nameColor = oppChar ? oppChar.color : (isComMode ? '#aaaaaa' : '#e94560');
    let oppName = oppChar ? oppChar.name : (isComMode ? `COM ${i+1}` : `RIVAL ${i+1}`);
    if (currentMode === 'single_survival') oppName = `${oppChar.name} Lv.${currentComLevel}`;
    else if (currentMode === 'com') oppName = `${oppChar.name} (COM)`;

    wrapper.innerHTML = `
      <div class="garbage-preview-box">
        <span class="preview-label">予告</span>
        <div id="rival-garbage-preview-${i}" class="preview-list"></div>
      </div>
      <div class="board-header">
        <span style="color: ${nameColor};" id="rival-name-label-${i}">${oppName} <span class="target-badge">🎯 TARGET</span></span>
        <span id="rival-score-label-${i}">SCORE: 0</span>
      </div>
      <div class="canvas-container"><canvas id="rival-canvas-${i}"></canvas></div>
    `;
    rivalsArea.appendChild(wrapper);

    const oppId = `com_${i}`;
    const rRenderer = new BoardRenderer(`rival-canvas-${i}`);
    rRenderer.theme = buildThemeForCharacter(oppChar.id, null, false); // ★追加：相手の立ち絵テーマを適用
    let rEngine = null, rAI = null;

    if (isComMode) {
      rEngine = new PonEngine(
        (state) => { if (state === 'gameover') checkMatchEnd(); },
        (totalBlocks, isHard) => { distributeGarbage(oppId, totalBlocks, isHard); },
        3,
        false,
        sharedSeed
      );
      rEngine.garbageQueue = [];

      // ★変更：ストーリーのボスやCOM画面のチェックON時は cheat クラスを使用
      const useCheat = (currentMode === 'story' && StoryManager.activeStage && StoryManager.activeStage.useCheat)
                    || (currentMode === 'com' && document.getElementById('com-cheat-toggle')?.checked);
      rAI = useCheat ? new cheat(rEngine, currentComLevel, oppId) : new ComAI(rEngine, currentComLevel, oppId);

      // ★追加：相手側も連鎖・同時消し時にカットイン演出を出す
      rEngine.onMatchEvent = (chain, size) => {
        rEngine.cutinMax = 45;
        rEngine.cutinTimer = 45;
        rEngine.cutinText = chain >= 2 ? `${chain} CHAIN!!` : `${size} ERASE!`;
      };
    }

    opponents.push({
      id: oppId,
      name: oppName,
      type: 'com',
      engine: rEngine,
      renderer: rRenderer,
      ai: rAI,
      index: i
    });
  }
  
  updateGarbagePreview(myEngine, 'my-garbage-preview');
  opponents.forEach((opp, i) => updateGarbagePreview(opp.engine, `rival-garbage-preview-${i}`));
  updateTargetUI();
  adjustLayout();
}

function startSingleGame() { 
  startGame('single_free', 1, 1); 
}

function startComGame(level) {
  const count = parseInt(document.getElementById('com-player-count').value) || 2;
  startGame('com', level, count); 
}

function startComGameFromSlider() {
  const level = parseInt(document.getElementById('com-level-slider').value) || 2;
  const count = parseInt(document.getElementById('com-player-count').value) || 2;
  startGame('com', level, count); 
}

function exitGame() {
  if (myEngine && currentMode !== 'single') {
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
  document.getElementById('ranking-menu').style.display = 'none';
  document.getElementById('story-menu').style.display = 'none';    // ★ここを追加
  document.getElementById('story-overlay').style.display = 'none'; // ★ここを追加（会話中に戻った場合用）
  document.getElementById('main-menu-actions').style.display = 'flex';
}

function toggleContinuousSwipe() {
  const cb = document.getElementById('continuous-swipe');
  if (!cb) return;
  cb.checked = !cb.checked;
  SE.play('cursorMove');
  showToast(`連続移動: ${cb.checked ? 'ON' : 'OFF'}`);
}

function startGrab(grabState, side) {
  if (!myEngine) return;
  grabState.active = true;
  grabState.side = side;
  grabState.col = side === 'left' ? myEngine.cursor.x : myEngine.cursor.x + 1;
  grabState.row = myEngine.cursor.y;
  grabState.consumed = false;
}

function executeGrabMove(grabState, dx) {
  if (!myEngine || !grabState.active || grabState.consumed) return false;
  const continuous = document.getElementById('continuous-swipe')?.checked;
  let swapped = false;
  if (dx > 0) {
    if (grabState.col < COLS - 1) {
      if (myEngine.swap(grabState.col, grabState.row)) {
        SE.play('cursorMove');
        grabState.col++;
        swapped = true;
      }
    }
  } else if (dx < 0) {
    if (grabState.col > 0) {
      if (myEngine.swap(grabState.col - 1, grabState.row)) {
        SE.play('cursorMove');
        grabState.col--;
        swapped = true;
      }
    }
  }
  if (swapped) {
    if (grabState.side === 'left') {
      myEngine.cursor.x = Math.min(COLS - 2, Math.max(0, grabState.col));
    } else {
      myEngine.cursor.x = Math.min(COLS - 2, Math.max(0, grabState.col - 1));
    }
    if (!continuous) {
      grabState.consumed = true;
    }
  }
  return swapped;
}

let padState = {}, prevPadState = {};
let padHoldFrames = { Up: 0, Down: 0, Left: 0, Right: 0 };
let padGrabState = { active: false, side: 'left', col: 0, row: 0, consumed: false };
let keyGrabState = { active: false, side: 'left', col: 0, row: 0, consumed: false };
let touchRowFollowCallback = null;
const PAD_DAS_FRAMES = 15;
const PAD_ARR_FRAMES = 4;

function handleMyRowPushed() {
  if (padGrabState.active && padGrabState.row > 0) padGrabState.row--;
  if (keyGrabState.active && keyGrabState.row > 0) keyGrabState.row--;
  if (touchRowFollowCallback) touchRowFollowCallback();
}

function pollGamepadInput() {
  const pad = navigator.getGamepads()[0];
  if (!pad) {
    if (myEngine) myEngine.isRisingManualPad = false;
    padHoldFrames = { Up: 0, Down: 0, Left: 0, Right: 0 };
    padGrabState.active = false;
    padGrabState.consumed = false;
    return;
  }
  prevPadState = { ...padState };
  pad.buttons.forEach((b, i) => padState[i] = b.pressed);
  const justPressed = (btnIdx) => btnIdx !== null && btnIdx !== undefined && padState[btnIdx] && !prevPadState[btnIdx];
  const isPressed = (btnIdx) => btnIdx !== null && btnIdx !== undefined && !!padState[btnIdx];

  if (justPressed(padConfig.Pause)) {
    if (document.getElementById('game-area').style.display === 'flex' && document.getElementById('result-overlay').style.display !== 'flex') {
      padHoldFrames = { Up: 0, Down: 0, Left: 0, Right: 0 };
      padGrabState.active = false;
      padGrabState.consumed = false;
      exitGame();
      return;
    }
  }

  if (!myEngine || (isMatchOver && !isPracticeMode)) {
    padHoldFrames = { Up: 0, Down: 0, Left: 0, Right: 0 };
    padGrabState.active = false;
    padGrabState.consumed = false;
    return;
  }

  if (justPressed(padConfig.ToggleContinuous)) {
    toggleContinuousSwipe();
  }

  if (justPressed(padConfig.GrabLeft)) {
    startGrab(padGrabState, 'left');
  } else if (justPressed(padConfig.GrabRight)) {
    startGrab(padGrabState, 'right');
  }
  if (padGrabState.active) {
    if (padGrabState.side === 'left' && !isPressed(padConfig.GrabLeft)) {
      padGrabState.active = false;
      padGrabState.consumed = false;
    } else if (padGrabState.side === 'right' && !isPressed(padConfig.GrabRight)) {
      padGrabState.active = false;
      padGrabState.consumed = false;
    }
  }

  const checkDirTrigger = (dirName, btnIdx) => {
    if (!isPressed(btnIdx)) {
      padHoldFrames[dirName] = 0;
      return false;
    }
    const f = padHoldFrames[dirName];
    padHoldFrames[dirName]++;
    if (f === 0) return true;
    if (f >= PAD_DAS_FRAMES && (f - PAD_DAS_FRAMES) % PAD_ARR_FRAMES === 0) return true;
    return false;
  };

  const upHeld = isPressed(padConfig.Up);
  const downHeld = isPressed(padConfig.Down);
  const leftHeld = isPressed(padConfig.Left);
  const rightHeld = isPressed(padConfig.Right);

  let moved = false;

  if (upHeld && downHeld) {
    padHoldFrames.Up = 0; padHoldFrames.Down = 0;
  } else {
    if (checkDirTrigger('Up', padConfig.Up) && myEngine.cursor.y > 0) {
      myEngine.cursor.y--; moved = true;
      if (padGrabState.active) {
        padGrabState.row = myEngine.cursor.y;
        padGrabState.col = padGrabState.side === 'left' ? myEngine.cursor.x : myEngine.cursor.x + 1;
        padGrabState.consumed = false;
      }
    }
    if (checkDirTrigger('Down', padConfig.Down) && myEngine.cursor.y < ROWS - 1) {
      myEngine.cursor.y++; moved = true;
      if (padGrabState.active) {
        padGrabState.row = myEngine.cursor.y;
        padGrabState.col = padGrabState.side === 'left' ? myEngine.cursor.x : myEngine.cursor.x + 1;
        padGrabState.consumed = false;
      }
    }
  }

  if (leftHeld && rightHeld) {
    padHoldFrames.Left = 0; padHoldFrames.Right = 0;
  } else {
    if (checkDirTrigger('Left', padConfig.Left)) {
      if (padGrabState.active) {
        executeGrabMove(padGrabState, -1);
      } else if (myEngine.cursor.x > 0) {
        myEngine.cursor.x--; moved = true;
      }
    }
    if (checkDirTrigger('Right', padConfig.Right)) {
      if (padGrabState.active) {
        executeGrabMove(padGrabState, 1);
      } else if (myEngine.cursor.x < COLS - 2) {
        myEngine.cursor.x++; moved = true;
      }
    }
  }
  
  if (moved) SE.play('cursorMove');
  if (justPressed(padConfig.Swap)) myEngine.swap(myEngine.cursor.x, myEngine.cursor.y);
  const isRise1 = isPressed(padConfig.Rise1);
  const isRise2 = isPressed(padConfig.Rise2);
  myEngine.isRisingManualPad = !!(isRise1 || isRise2);
  if (justPressed(padConfig.TargetRight)) cycleTarget(1);
  if (justPressed(padConfig.TargetLeft)) cycleTarget(-1);
}

function updateGarbagePreview(engine, containerId) {
  const container = document.getElementById(containerId);
  if (!container || !engine) return;
  
  const qStr = JSON.stringify(engine.garbageQueue);
  if (container.dataset.qStr === qStr) return;
  container.dataset.qStr = qStr;

  container.innerHTML = '';
  
  let compressed = [];
  engine.garbageQueue.forEach(g => {
    if (compressed.length > 0) {
       let last = compressed[compressed.length - 1];
       if (last.w === g.w && last.h === g.h && last.isHard === g.isHard) {
          last.count++;
          return;
       }
    }
    compressed.push({ ...g, count: 1 });
  });

  compressed.forEach((g, idx) => {
    const block = document.createElement('div');
    block.style.backgroundColor = g.isHard ? '#a8b2bd' : '#5c636a';
    block.style.border = '1px solid #dee2e6';
    block.style.borderRadius = '2px';
    block.style.width = `${Math.min(36, Math.max(12, g.w * 5))}px`;
    block.style.height = `${Math.min(18, Math.max(8, g.h * 4))}px`;
    block.style.flexShrink = '0';
    block.style.display = 'flex';
    block.style.alignItems = 'center';
    block.style.justifyContent = 'center';
    
    if (idx > 0) {
       block.style.opacity = '0.5';
    }
    
    if (g.count > 1) {
       const span = document.createElement('span');
       span.innerText = `x${g.count}`;
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
             opp.ai = new ComAI(opp.engine, nextLv, opp.id);
             document.getElementById(`rival-name-label-0`).innerHTML = `COM Lv.${nextLv} <span class="target-badge">🎯 TARGET</span>`;
           }
        } else {
           const isLocalControlledCom = (opp.type === 'com') && (currentMode === 'com' || currentMode === 'single_survival' || myOnlineId === 'host');
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
    }
  });
  
  loopId = requestAnimationFrame(gameLoop);
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
    const rect = cvs.getBoundingClientRect();
    const scaleX = cvs.width / rect.width, scaleY = cvs.height / rect.height;
    initialCanvasX = (e.clientX - rect.left) * scaleX;
    initialCanvasY = (e.clientY - rect.top) * scaleY;
    grabbedCol = Math.max(0, Math.min(COLS - 1, Math.floor(initialCanvasX / CELL_PX)));
    grabbedRow = Math.max(0, Math.min(ROWS - 1, Math.floor((initialCanvasY + myEngine.riseOffset * CELL_PX) / CELL_PX)));
  });

  cvs.addEventListener('pointermove', (e) => {
    if (!isDown || !myEngine || (isMatchOver && !isPracticeMode)) return;
    const rect = cvs.getBoundingClientRect();
    const canvasX = (e.clientX - rect.left) * (cvs.width / rect.width);
    let targetCol = Math.max(0, Math.min(COLS - 1, Math.floor(canvasX / CELL_PX)));
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
    const rect = cvs.getBoundingClientRect();
    const canvasX = (e.clientX - rect.left) * (cvs.width / rect.width);
    const canvasY = (e.clientY - rect.top) * (cvs.height / rect.height);
    
    if (Math.abs(canvasX - initialCanvasX) < CELL_PX * 0.3 && Math.abs(canvasY - initialCanvasY) < CELL_PX * 0.3) {
      let c = Math.floor(canvasX / CELL_PX);
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
    keyGrabState.active = false;
    keyGrabState.consumed = false;
    if (myEngine) myEngine.isRisingManualKey = false;
  });

  window.addEventListener('keydown', (e) => {
    if (assigningAction && assignType === 'key') {
      e.preventDefault();
      keyConfig[assigningAction] = e.code;
      assigningAction = null;
      renderConfigUI();
      return;
    }
    const code = e.code;
    if (code === keyConfig.Pause && !e.repeat) {
      if (document.getElementById('game-area').style.display === 'flex' && document.getElementById('result-overlay').style.display !== 'flex') {
        e.preventDefault();
        keyGrabState.active = false;
        keyGrabState.consumed = false;
        if (myEngine) myEngine.isRisingManualKey = false;
        exitGame();
        return;
      }
    }
    if (!myEngine || (isMatchOver && !isPracticeMode)) return;
    let moved = false;

    if (code === keyConfig.ToggleContinuous) {
      e.preventDefault();
      if (!e.repeat) toggleContinuousSwipe();
    }
    if (code === keyConfig.GrabLeft) {
      e.preventDefault();
      if (!e.repeat) startGrab(keyGrabState, 'left');
    }
    if (code === keyConfig.GrabRight) {
      e.preventDefault();
      if (!e.repeat) startGrab(keyGrabState, 'right');
    }
    
    if (code === keyConfig.Up) {
      e.preventDefault();
      if (myEngine.cursor.y > 0) {
        myEngine.cursor.y--; moved = true;
        if (keyGrabState.active) {
          keyGrabState.row = myEngine.cursor.y;
          keyGrabState.col = keyGrabState.side === 'left' ? myEngine.cursor.x : myEngine.cursor.x + 1;
          keyGrabState.consumed = false;
        }
      }
    }
    if (code === keyConfig.Down) {
      e.preventDefault();
      if (myEngine.cursor.y < ROWS - 1) {
        myEngine.cursor.y++; moved = true;
        if (keyGrabState.active) {
          keyGrabState.row = myEngine.cursor.y;
          keyGrabState.col = keyGrabState.side === 'left' ? myEngine.cursor.x : myEngine.cursor.x + 1;
          keyGrabState.consumed = false;
        }
      }
    }
    if (code === keyConfig.Left) {
      e.preventDefault();
      if (keyGrabState.active) {
        executeGrabMove(keyGrabState, -1);
      } else if (myEngine.cursor.x > 0) {
        myEngine.cursor.x--; moved = true;
      }
    }
    if (code === keyConfig.Right) {
      e.preventDefault();
      if (keyGrabState.active) {
        executeGrabMove(keyGrabState, 1);
      } else if (myEngine.cursor.x < COLS - 2) {
        myEngine.cursor.x++; moved = true;
      }
    }
    
    if (moved) SE.play('cursorMove');
    if (code === keyConfig.Swap) { e.preventDefault(); myEngine.swap(myEngine.cursor.x, myEngine.cursor.y); }
    if (code === keyConfig.Rise1 || code === keyConfig.Rise2) { e.preventDefault(); myEngine.isRisingManualKey = true; }
    if (code === keyConfig.TargetRight) { e.preventDefault(); cycleTarget(1); }
    if (code === keyConfig.TargetLeft) { e.preventDefault(); cycleTarget(-1); }
  });

  window.addEventListener('keyup', (e) => {
    if (e.code === keyConfig.GrabLeft && keyGrabState.active && keyGrabState.side === 'left') {
      keyGrabState.active = false;
      keyGrabState.consumed = false;
    }
    if (e.code === keyConfig.GrabRight && keyGrabState.active && keyGrabState.side === 'right') {
      keyGrabState.active = false;
      keyGrabState.consumed = false;
    }
    if (myEngine && (e.code === keyConfig.Rise1 || e.code === keyConfig.Rise2)) {
      myEngine.isRisingManualKey = false;
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
    layoutBtn.style.display = !isPortrait ? 'block' : 'none';
    updateLayoutToggleBtnText();
  }

  // 横画面時は、ユーザーが縦型UIを明示的に選択していない限りPC・タブレット同様の横並びレイアウトを適用
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

  controls.style.alignItems = 'center';

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
    gameContainer.style.paddingBottom = '0px'; 
    gameContainer.style.paddingTop = '0px';

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

  // ゲーム画面中の不意なスクロールやズームを防止
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

  // ★この2行を追加（キャラ・カスタム画像の読み込みと、ストーリー操作の初期化）
  if (typeof initAssetsSystem === 'function') initAssetsSystem();
  if (typeof initStorySystem === 'function') initStorySystem();
});