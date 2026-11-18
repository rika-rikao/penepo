// --- オンライン対戦 ---
const PEER_PREFIX = 'pdw-26-';
let onlineSkillEnabled = false;
let expectedAppearanceIds = [];
let receivedAppearanceIds = {};
let localAppearanceSent = false;
let localBoardReadyEmitted = false;
let incomingAssetChunks = {};
let appearanceTimeoutId = null;
let joinTimeoutId = null;
let joinCountdownIntervalId = null;
let joinRetryTimeoutId = null;
let currentCreatedRoomCode = '';

function generateShortRoomCode() {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let res = '';
  for (let i = 0; i < 4; i++) res += chars.charAt(Math.floor(Math.random() * chars.length));
  return res;
}

// iOS / Android / PC すべてで動作するクリップボードコピー（ユーザー操作の同期タイミング対応）
function copyTextToClipboardSync(text) {
  if (!text) return false;
  let copied = false;
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '-9999px';
    ta.style.fontSize = '16px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (isIOS) {
      const range = document.createRange();
      range.selectNodeContents(ta);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      ta.setSelectionRange(0, text.length);
    } else {
      ta.select();
      ta.setSelectionRange(0, text.length);
    }
    copied = document.execCommand('copy');
    document.body.removeChild(ta);
  } catch (e) {
    copied = false;
  }

  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    navigator.clipboard.writeText(text).catch(() => {});
  }
  return copied;
}

function copyRoomCodeManual() {
  const code = document.getElementById('waiting-code')?.innerText?.trim() || currentCreatedRoomCode;
  if (!code) return;
  const ok = copyTextToClipboardSync(code);
  if (typeof SE !== 'undefined') SE.play('select');
  showToast(ok ? `部屋コード [${code}] をコピーしました！` : `部屋コード: ${code}`);
}

function broadcastRoomStatus(codeUpper, maxPlayers) {
  const count = 1 + onlineConnections.length;
  onlineConnections.forEach(c => {
    if (c && c.open) {
      c.send({ type: 'room_status', code: codeUpper, count, max: maxPlayers });
    }
  });
}

function clearJoinTimers() {
  if (joinTimeoutId) { clearTimeout(joinTimeoutId); joinTimeoutId = null; }
  if (joinCountdownIntervalId) { clearInterval(joinCountdownIntervalId); joinCountdownIntervalId = null; }
  if (joinRetryTimeoutId) { clearTimeout(joinRetryTimeoutId); joinRetryTimeoutId = null; }
}

function createRoom() {
  let code = document.getElementById('peer-room-id').value.trim();
  if (!code) { code = generateShortRoomCode(); document.getElementById('peer-room-id').value = code; }
  const codeUpper = code.toUpperCase();
  currentCreatedRoomCode = codeUpper;
  const fullPeerId = PEER_PREFIX + codeUpper;

  // スマホ（iOS / Android）はユーザー操作直後の同期コンテキスト内でコピーを実行する必要がある
  const preCopied = copyTextToClipboardSync(codeUpper);

  if (peer) { try { peer.destroy(); } catch(e){} }
  clearJoinTimers();
  if (typeof BusyLoader !== 'undefined') BusyLoader.show('部屋を作成中...', `部屋コード: ${codeUpper}`);
  peer = new Peer(fullPeerId);
  
  const maxPlayers = parseInt(document.getElementById('online-max-players').value) || 2;
  currentMode = 'online_host';
  onlineConnections = [];

  peer.on('open', () => {
    if (typeof BusyLoader !== 'undefined') BusyLoader.hide();
    if (typeof hideAllMenuSubViews === 'function') hideAllMenuSubViews();
    const mainMenu = document.getElementById('main-menu');
    if (mainMenu) mainMenu.style.display = 'none';

    const waiting = document.getElementById('room-waiting');
    waiting.style.display = 'flex';
    document.getElementById('waiting-code-container').style.display = 'flex';
    document.getElementById('waiting-code').innerText = codeUpper;
    document.getElementById('waiting-max').innerText = maxPlayers;
    document.getElementById('waiting-count').innerText = 1;
    document.getElementById('waiting-status-text').innerText = '参加者を待っています...';
    document.getElementById('force-start-btn').style.display = 'inline-block';
    if (typeof refreshMenuLayoutState === 'function') refreshMenuLayoutState();

    showToast(preCopied ? `部屋コード [${codeUpper}] をコピーしました！` : `部屋 [${codeUpper}] を作成しました！`);
  });

  peer.on('error', () => {
    if (typeof BusyLoader !== 'undefined') BusyLoader.hide();
    showToast('部屋の作成に失敗しました（別のコードをお試しください）');
    cancelRoom(true);
  });

  peer.on('connection', (c) => {
    c.on('open', () => {
      if (currentMode !== 'online_host') { c.close(); return; }
      if (onlineConnections.length >= maxPlayers - 1) { c.close(); return; }
      
      onlineConnections.push(c);
      bindConnEvents(c, true); 
      document.getElementById('waiting-count').innerText = 1 + onlineConnections.length;
      broadcastRoomStatus(codeUpper, maxPlayers);
      
      if (onlineConnections.length >= maxPlayers - 1) {
        startCountdown();
      }
    });
  });
}

function cancelRoom(silent = false) {
  clearJoinTimers();
  if (typeof BusyLoader !== 'undefined') BusyLoader.hide();
  onlineConnections.forEach(c => { try { c.close(); } catch (_) {} });
  onlineConnections = [];
  if (peer) { try { peer.destroy(); } catch (_) {} peer = null; }
  currentMode = 'online';
  const waiting = document.getElementById('room-waiting');
  if (waiting) waiting.style.display = 'none';
  hideOnlineSyncOverlay();

  if (!silent && typeof SE !== 'undefined') SE.play('cancel');

  const mainMenu = document.getElementById('main-menu');
  if (mainMenu) mainMenu.style.display = 'flex';
  if (typeof showOnlineMenu === 'function') {
    showOnlineMenu();
  } else if (typeof backToMainMenu === 'function') {
    backToMainMenu();
  }
}

function joinRoom() {
  const code = document.getElementById('peer-room-id').value.trim();
  if (!code) { showToast('部屋コードを入力してください'); return; }
  const codeUpper = code.toUpperCase();
  const targetPeerId = PEER_PREFIX + codeUpper;

  if (peer) { try { peer.destroy(); } catch(e){} }
  clearJoinTimers();
  peer = new Peer();
  currentMode = 'online_client';

  if (typeof hideAllMenuSubViews === 'function') hideAllMenuSubViews();
  const mainMenu = document.getElementById('main-menu');
  if (mainMenu) mainMenu.style.display = 'none';

  let remainingSec = 30;
  let connectedSuccess = false;
  const waiting = document.getElementById('room-waiting');
  const statusEl = document.getElementById('waiting-status-text');
  waiting.style.display = 'flex';
  document.getElementById('waiting-code-container').style.display = 'flex';
  document.getElementById('waiting-code').innerText = codeUpper;
  if (statusEl) statusEl.innerText = `部屋を探しています...（残り ${remainingSec}秒）`;
  document.getElementById('waiting-count').innerText = '-';
  document.getElementById('waiting-max').innerText = '-';
  document.getElementById('force-start-btn').style.display = 'none';
  if (typeof refreshMenuLayoutState === 'function') refreshMenuLayoutState();

  joinCountdownIntervalId = setInterval(() => {
    if (connectedSuccess || currentMode !== 'online_client') {
      clearInterval(joinCountdownIntervalId);
      joinCountdownIntervalId = null;
      return;
    }
    remainingSec = Math.max(0, remainingSec - 1);
    if (statusEl) {
      statusEl.innerText = `部屋を探しています...（残り ${remainingSec}秒）`;
    }
  }, 1000);

  joinTimeoutId = setTimeout(() => {
    joinTimeoutId = null;
    if (!connectedSuccess && onlineConnections.length === 0 && currentMode === 'online_client') {
      showToast('部屋が見つからないか接続がタイムアウトしました');
      cancelRoom(true);
    }
  }, 30000);

  const attemptConnect = () => {
    if (!peer || peer.destroyed || connectedSuccess || currentMode !== 'online_client') return;
    const c = peer.connect(targetPeerId);
    c.on('open', () => {
      if (connectedSuccess) { try { c.close(); } catch (_) {} return; }
      connectedSuccess = true;
      clearJoinTimers();
      onlineConnections = [c];
      bindConnEvents(c, false);
      if (statusEl) statusEl.innerText = '部屋に参加しました！ホストの開始を待機中...';
    });
    c.on('error', () => {
      if (!connectedSuccess && currentMode === 'online_client' && !joinRetryTimeoutId) {
        joinRetryTimeoutId = setTimeout(() => {
          joinRetryTimeoutId = null;
          attemptConnect();
        }, 2000);
      }
    });
  };

  peer.on('open', () => {
    attemptConnect();
  });

  peer.on('error', (err) => {
    if (connectedSuccess || currentMode !== 'online_client') return;
    if (err && err.type === 'peer-unavailable') {
      if (!joinRetryTimeoutId) {
        joinRetryTimeoutId = setTimeout(() => {
          joinRetryTimeoutId = null;
          attemptConnect();
        }, 2000);
      }
      return;
    }
    showToast('部屋への接続に失敗しました');
    cancelRoom(true);
  });
}

function startCountdown() {
  if (countdownTimer) clearInterval(countdownTimer);
  document.getElementById('countdown-overlay').style.display = 'flex';
  document.getElementById('countdown-text').innerText = '10';

  if (myOnlineId === 'host' || currentMode === 'online_host') {
    if (typeof SE !== 'undefined') SE.play('select');
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
  if (typeof SE !== 'undefined') SE.play('select');
  if (countdownTimer) clearInterval(countdownTimer);
  document.getElementById('countdown-overlay').style.display = 'none';
  document.getElementById('room-waiting').style.display = 'none';

  const maxPlayers = parseInt(document.getElementById('online-max-players').value);
  const comLvl = parseInt(document.getElementById('online-com-level')?.value) || 3;
  onlineSkillEnabled = !!document.getElementById('online-skill-toggle')?.checked;
  currentComLevel = comLvl;
  let players = [{ id: 'host', type: 'player', name: 'HOST' }];
  
  onlineConnections.forEach((c, idx) => {
    const cId = `client_${idx}`;
    c._clientId = cId;
    players.push({ id: cId, type: 'player', name: `PLAYER ${idx+1}`, conn: c });
  });

  const currentCount = players.length;
  for(let i = 0; i < maxPlayers - currentCount; i++) {
    players.push({ id: `com_${i}`, type: 'com', level: comLvl, useCheat: onlineSkillEnabled, name: `COM ${i+1}` });
  }

  matchPlayersConfig = players;
  startPrepareMatchFromHost();
}

function startPrepareMatchFromHost() {
  boardReady = {};
  rematchReady = {};
  
  const configBase = matchPlayersConfig.map(pl => ({
    id: pl.id, type: pl.type, level: pl.level, useCheat: !!pl.useCheat, name: pl.name
  }));
  const matchId = Date.now();
  const sharedSeed = Math.floor(Math.random() * 0xFFFFFFFF);
  
  onlineConnections.forEach(c => {
    const cId = c._clientId;
    const config = { players: configBase, myId: cId, matchId: matchId, seed: sharedSeed, skillEnabled: onlineSkillEnabled };
    if (c.open) c.send({ type: 'prepare_match', config });
  });
  
  const hostConfig = { players: configBase, myId: 'host', matchId: matchId, seed: sharedSeed, skillEnabled: onlineSkillEnabled };
  prepareMatchLocal(hostConfig);
}

function updateOnlineSyncOverlay() {
  const overlay = document.getElementById('online-sync-overlay');
  const listEl = document.getElementById('online-sync-list');
  if (!overlay || !listEl) return;

  listEl.innerHTML = '';
  (matchPlayersConfig || []).forEach(p => {
    const row = document.createElement('div');
    row.className = 'online-sync-row';

    const nameSpan = document.createElement('span');
    nameSpan.innerText = p.id === myOnlineId ? `${p.name} (YOU)` : p.name;

    const badge = document.createElement('span');
    let isReady = false;
    let statusText = '待機中';
    if (p.type === 'com') {
      isReady = true;
      statusText = 'COM準備OK';
    } else if (p.id === myOnlineId) {
      isReady = localAppearanceSent;
      statusText = localAppearanceSent ? '送信完了 ✓' : '送信中...';
    } else {
      isReady = !!receivedAppearanceIds[p.id];
      statusText = isReady ? '準備OK ✓' : 'データ受信中...';
    }
    badge.className = 'online-sync-badge ' + (isReady ? 'ok' : 'pending');
    badge.innerText = statusText;

    row.append(nameSpan, badge);
    listEl.appendChild(row);
  });
}

function showOnlineTransferStatus() {
  const overlay = document.getElementById('online-sync-overlay');
  if (overlay) {
    updateOnlineSyncOverlay();
    overlay.style.display = 'flex';
  }
}

function hideOnlineSyncOverlay() {
  const overlay = document.getElementById('online-sync-overlay');
  if (overlay) overlay.style.display = 'none';
}

function tryEmitBoardReady() {
  updateOnlineSyncOverlay();
  if (localBoardReadyEmitted) return;
  if (!localAppearanceSent) return;
  const allReceived = expectedAppearanceIds.every(id => !!receivedAppearanceIds[id]);
  if (!allReceived) return;

  localBoardReadyEmitted = true;
  if (appearanceTimeoutId) {
    clearTimeout(appearanceTimeoutId);
    appearanceTimeoutId = null;
  }

  setTimeout(() => {
    if (matchState !== 'preparing') return;
    if (myOnlineId === 'host') {
      handleBoardReady('host');
    } else if (onlineConnections[0] && onlineConnections[0].open) {
      onlineConnections[0].send({ type: 'board_ready', senderId: myOnlineId });
    }
  }, 150);
}

function prepareMatchLocal(config) {
  clearJoinTimers();
  if (countdownTimer) clearInterval(countdownTimer);
  if (appearanceTimeoutId) { clearTimeout(appearanceTimeoutId); appearanceTimeoutId = null; }
  document.getElementById('countdown-overlay').style.display = 'none';
  document.getElementById('room-waiting').style.display = 'none';
  document.getElementById('result-overlay').style.display = 'none';
  if (typeof hideBattleEndOverlay === 'function') hideBattleEndOverlay();

  currentMode = 'online';
  currentMatchId = config.matchId;
  myOnlineId = config.myId;
  matchPlayersConfig = config.players;
  currentSkillEnabled = !!config.skillEnabled;
  matchState = 'preparing';
  isPracticeMode = false;

  expectedAppearanceIds = config.players
    .filter(p => p.type === 'player' && p.id !== myOnlineId)
    .map(p => p.id);
  receivedAppearanceIds = {};
  localAppearanceSent = false;
  localBoardReadyEmitted = false;
  incomingAssetChunks = {};
  if (typeof SE !== 'undefined' && SE.clearRemoteSounds) SE.clearRemoteSounds();
  if (typeof VOICE !== 'undefined' && VOICE.clearRemoteVoices) VOICE.clearRemoteVoices();

  document.getElementById('menu-overlay').style.display = 'none';
  document.getElementById('game-area').style.display = 'flex';

  setupInput();
  resetGameLogicOnline(config);
  
  if (loopId) cancelAnimationFrame(loopId);
  lastTime = performance.now();
  accumulator = 0;
  loopId = requestAnimationFrame(gameLoop);
  
  startSyncInterval();

  if (expectedAppearanceIds.length > 0) {
    showOnlineTransferStatus();
  }

  appearanceTimeoutId = setTimeout(() => {
    appearanceTimeoutId = null;
    if (!localBoardReadyEmitted && matchState === 'preparing') {
      localAppearanceSent = true;
      expectedAppearanceIds.forEach(id => { receivedAppearanceIds[id] = true; });
      tryEmitBoardReady();
    }
  }, 12000);

  if (typeof sendMyAppearanceOnline === 'function') {
    sendMyAppearanceOnline();
  } else {
    localAppearanceSent = true;
    tryEmitBoardReady();
  }
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
  if (appearanceTimeoutId) { clearTimeout(appearanceTimeoutId); appearanceTimeoutId = null; }
  hideOnlineSyncOverlay();
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
  if (typeof endSequenceTriggered !== 'undefined') endSequenceTriggered = false;
  myTargetIndex = -1;
  hidePlayerHeaderCutin();
  resetAllLocalInputStates();
  
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
  if (typeof applyBoardFrame === 'function') {
    applyBoardFrame('my-wrapper', null);
  }
  if (typeof applyGlobalFrameTheme === 'function') {
    applyGlobalFrameTheme(myRenderer.theme.frameSrc);
  }
  if (!myRenderer.theme.frameSrc && myRenderer.theme.charId !== 'custom' && myRenderer.theme.voiceName && typeof resolveCharacterImage === 'function') {
    const targetTheme = myRenderer.theme;
    resolveCharacterImage('frame', targetTheme.voiceName).then((url) => {
      if (url && myRenderer && myRenderer.theme === targetTheme && document.getElementById('game-area')?.style.display !== 'none') {
        targetTheme.frameSrc = url;
        if (!CustomAssets.frame && typeof applyGlobalFrameTheme === 'function') applyGlobalFrameTheme(url);
      }
    });
  }
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
    showPlayerHeaderCutin(myRenderer.theme, `${chain} CHAIN!!`, '#ffd700');
  };
  myEngine.onSimultaneousMatch = (size) => {
    showPlayerHeaderCutin(myRenderer.theme, `${size}個消し！`, '#00d4ff');
  };

  initPlayerSkillState(!!config.skillEnabled, selectedPlayerSkill);

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
      if (p.useCheat && CheatClass) {
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
    if (typeof applyBoardFrame === 'function') {
      applyBoardFrame(`rival-wrapper-${index}`, rRenderer.theme.frameSrc);
    }
    if (!rRenderer.theme.frameSrc && rRenderer.theme.charId !== 'custom' && rRenderer.theme.voiceName && typeof resolveCharacterImage === 'function') {
      const targetRTheme = rRenderer.theme;
      const rivalWrapId = `rival-wrapper-${index}`;
      resolveCharacterImage('frame', targetRTheme.voiceName).then((url) => {
        if (url && document.getElementById(rivalWrapId)) {
          targetRTheme.frameSrc = url;
          applyBoardFrame(rivalWrapId, url);
        }
      });
    }

    const initialSkillRem = (p.type === 'com')
      ? (p.useCheat ? 3 : undefined)
      : (config.skillEnabled ? PLAYER_SKILL_MAX : undefined);

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
  adjustLayout();
}

function sendOnlineCutin(senderId, text) {
  onlineConnections.forEach(c => {
    if (c && c.open) c.send({ type: 'cutin', senderId, text });
  });
}

function startSyncInterval() {
  if (syncIntervalId) clearInterval(syncIntervalId);
  syncIntervalId = setInterval(() => {
    if (!myEngine) return;
    
    if (!isPracticeMode && !isMatchOver) {
       const syncData = { 
         type: 'sync', senderId: myOnlineId, grid: myEngine.grid, nextRow: myEngine.nextRow, 
         riseOffset: myEngine.riseOffset, score: myEngine.score, 
         garbageQueue: myEngine.garbageQueue, gameOver: myEngine.gameOver,
         isSacrifice: !!myEngine.isSacrifice,
         skillRemaining: playerSkillState.enabled ? playerSkillState.usesLeft : undefined
       };
       onlineConnections.forEach(c => { if (c && c.open) c.send(syncData); });
    } else {
       const syncData = { 
         type: 'sync', senderId: myOnlineId, gameOver: isDeadInMatch 
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
            isSacrifice: !!opp.engine.isSacrifice,
            skillRemaining: (opp.ai && typeof opp.ai.getRemainingSkills === 'function') ? opp.ai.getRemainingSkills() : undefined
          };
          onlineConnections.forEach(c => { if (c && c.open) c.send(comSyncData); });
        }
      });
    }
  }, 100);
}

function replaceClientWithCom(leftId) {
   const opp = opponents.find(o => o.id === leftId);
   if (opp && opp.type !== 'com') {
      opp.type = 'com';
      opp.name = opp.name + ' (COM)';
      
      if (!opp.engine.gameOver) {
         opp.engine.onStateChange = (state) => { if (state === 'gameover') checkMatchEnd(); };
         opp.engine.onSendGarbage = (totalBlocks, isHard) => { distributeGarbageOnline(opp.id, totalBlocks, isHard); };
         opp.ai = (currentSkillEnabled && typeof cheat === 'function')
           ? new cheat(opp.engine, currentComLevel, opp.id, { maxSkillUses: 3 })
           : new ComAI(opp.engine, currentComLevel, opp.id);
         showToast(`${opp.name} が退出したためCOMが代役に入りました。`);
      } else {
         opp.ai = new ComAI(opp.engine, currentComLevel, opp.id);
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
     receivedAppearanceIds[leftId] = true;
     tryEmitBoardReady();
     handleBoardReady(leftId);
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
         opp.ai = new ComAI(opp.engine, currentComLevel, opp.id);
       } else if (opp.type === 'com' && !opp.engine.gameOver) {
         opp.ai = new ComAI(opp.engine, opp.level || currentComLevel, opp.id);
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

async function applyReceivedAppearance(senderId, payload) {
  const targetOpp = opponents.find(o => o.id === senderId);
  if (targetOpp && targetOpp.renderer) {
    const customFrameUrl = payload.customFrameUrl || null;
    targetOpp.renderer.theme = buildThemeForCharacter(
      payload.charId,
      payload.customCharaUrl,
      false,
      payload.customName,
      customFrameUrl
    );
    if (typeof applyBoardFrame === 'function') {
      applyBoardFrame(`rival-wrapper-${targetOpp.index}`, targetOpp.renderer.theme.frameSrc);
    }
    if (!targetOpp.renderer.theme.frameSrc && targetOpp.renderer.theme.charId !== 'custom' && targetOpp.renderer.theme.voiceName && typeof resolveCharacterImage === 'function') {
      const targetRTheme = targetOpp.renderer.theme;
      const rivalWrapId = `rival-wrapper-${targetOpp.index}`;
      resolveCharacterImage('frame', targetRTheme.voiceName).then((url) => {
        if (url && document.getElementById(rivalWrapId)) {
          targetRTheme.frameSrc = url;
          applyBoardFrame(rivalWrapId, url);
        }
      });
    }
    const nameEl = targetOpp.renderer.canvas.closest('.board-wrapper')?.querySelector('.board-header span');
    if (nameEl) {
      const chName = payload.customName || getCharacterById(payload.charId).name;
      nameEl.innerHTML = `${chName} (${targetOpp.name}) <span class="target-badge">🎯 TARGET</span>`;
    }
  }

  if (payload.customSeDict && typeof SE !== 'undefined' && typeof dataUrlToArrayBuffer === 'function') {
    const entries = Object.entries(payload.customSeDict);
    for (const [seKey, dataUrl] of entries) {
      if (typeof dataUrl === 'string' && dataUrl.startsWith('data:')) {
        try {
          const buf = dataUrlToArrayBuffer(dataUrl);
          await SE.setRemoteSound(senderId, seKey, buf);
        } catch (e) {}
      }
    }
  }

  if (payload.customVoiceDict && typeof VOICE !== 'undefined' && typeof dataUrlToArrayBuffer === 'function') {
    const entries = Object.entries(payload.customVoiceDict);
    for (const [vCat, dataUrl] of entries) {
      if (typeof dataUrl === 'string' && dataUrl.startsWith('data:')) {
        try {
          const buf = dataUrlToArrayBuffer(dataUrl);
          await VOICE.setRemoteVoice(senderId, vCat, buf);
        } catch (e) {}
      }
    }
  }

  if (typeof refreshBattleSidePanels === 'function') {
    refreshBattleSidePanels();
  }

  receivedAppearanceIds[senderId] = true;
  tryEmitBoardReady();
}

function bindConnEvents(c, isHostMode) {
  c.on('data', (data) => {
    if (data.type === 'room_status') {
      const wCnt = document.getElementById('waiting-count');
      const wMax = document.getElementById('waiting-max');
      const wCode = document.getElementById('waiting-code');
      if (wCnt && data.count !== undefined) wCnt.innerText = data.count;
      if (wMax && data.max !== undefined) wMax.innerText = data.max;
      if (wCode && data.code) wCode.innerText = data.code;
    }
    else if (data.type === 'sync') {
      const senderOpp = opponents.find(o => o.id === data.senderId);
      if (senderOpp && senderOpp.engine) {
        if (!senderOpp.engine.endAnim) {
          if (data.grid) senderOpp.engine.grid = data.grid;
          if (data.nextRow) senderOpp.engine.nextRow = data.nextRow;
          if (data.riseOffset !== undefined) senderOpp.engine.riseOffset = data.riseOffset;
        }
        if (data.score !== undefined) senderOpp.engine.score = data.score;
        if (data.garbageQueue) senderOpp.engine.garbageQueue = data.garbageQueue;
        if (data.isSacrifice !== undefined) {
          senderOpp.engine.isSacrifice = !!data.isSacrifice;
          const wrap = document.getElementById(`rival-wrapper-${senderOpp.index}`);
          if (wrap) wrap.classList.toggle('sacrifice-aura', !!data.isSacrifice);
        }
        if (data.skillRemaining !== undefined) {
          senderOpp.syncedSkillRemaining = data.skillRemaining;
          if (typeof updateRivalSkillBadge === 'function') updateRivalSkillBadge(senderOpp, senderOpp.index);
        }

        if (data.gameOver !== undefined) {
           const wasGameOver = senderOpp.engine.gameOver;
           senderOpp.engine.gameOver = data.gameOver;
           if (!wasGameOver && data.gameOver) {
              senderOpp.engine.startGameOverFillAnim();
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
    else if (data.type === 'cutin') {
      const senderOpp = opponents.find(o => o.id === data.senderId);
      if (senderOpp && senderOpp.engine) {
        senderOpp.engine.cutinMax = 50;
        senderOpp.engine.cutinTimer = 50;
        senderOpp.engine.cutinText = data.text;
        if (typeof SE !== 'undefined' && SE.playForSender) SE.playForSender(data.senderId, 'skill');
        if (typeof playAttackVoiceForSender === 'function') playAttackVoiceForSender(data.senderId);
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
      if (typeof playAttackVoiceForSender === 'function') playAttackVoiceForSender(data.senderId);
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
      if (data.senderId !== myOnlineId && typeof playAttackVoiceForSender === 'function') {
        playAttackVoiceForSender(data.senderId);
      }
      for (const tId of Object.keys(data.targets)) {
         if (data.senderId !== myOnlineId) playGarbageSendAnimation(data.senderId, tId, data.isHard);
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
        if (matchState === 'preparing') {
          receivedAppearanceIds[data.leftId] = true;
          tryEmitBoardReady();
        }
        checkMatchEnd();
      }
    }
    else if (data.type === 'appearance_chunk') {
      if (isHostMode) {
        onlineConnections.forEach(otherC => { if (otherC !== c && otherC.open) otherC.send(data); });
      }
      if (!incomingAssetChunks[data.transferId]) incomingAssetChunks[data.transferId] = new Array(data.total);
      incomingAssetChunks[data.transferId][data.index] = data.chunk;
    }
    else if (data.type === 'appearance_done') {
      if (isHostMode) {
        onlineConnections.forEach(otherC => { if (otherC !== c && otherC.open) otherC.send(data); });
      }
      const chunks = incomingAssetChunks[data.transferId];
      delete incomingAssetChunks[data.transferId];
      if (chunks) {
        try {
          const payload = JSON.parse(chunks.join(''));
          applyReceivedAppearance(data.senderId, payload);
        } catch (e) {
          receivedAppearanceIds[data.senderId] = true;
          tryEmitBoardReady();
        }
      } else {
        receivedAppearanceIds[data.senderId] = true;
        tryEmitBoardReady();
      }
    }
    else if (data.type === 'appearance_sync') {
      if (isHostMode) {
        onlineConnections.forEach(otherC => { if (otherC !== c && otherC.open) otherC.send(data); });
      }
      applyReceivedAppearance(data.senderId, data);
    }
    else if (data.type === 'cheat_corrupt_row') {
      if (data.targetId === myOnlineId && myEngine && !myEngine.gameOver && !isPracticeMode) {
        if (typeof applyCorruptRowToEngine === 'function') applyCorruptRowToEngine(myEngine, data.row);
        myEngine.addGarbage(3, 1, false);
        if (myEngine.garbageQueue.length > 0) myEngine.garbageQueue[myEngine.garbageQueue.length - 1].delay = 45;
      } else if (isHostMode) {
        onlineConnections.forEach(otherC => { if (otherC !== c && otherC.open) otherC.send(data); });
      }
    }
    else if (data.type === 'cheat_seal_skill') {
      if (data.targetId === myOnlineId && myEngine && !myEngine.gameOver && !isPracticeMode) {
        if (typeof applySkillSealToMainPlayer === 'function') {
          applySkillSealToMainPlayer(data.amount || 300);
        }
      } else if (isHostMode) {
        onlineConnections.forEach(otherC => { if (otherC !== c && otherC.open) otherC.send(data); });
      }
    }
    else if (data.type === 'leave') {
      if (isHostMode) {
        handlePlayerLeftHost(data.senderId);
      } else {
        if (data.senderId === 'host') handleHostDisconnected();
        else { replaceClientWithCom(data.senderId); checkMatchEnd(); }
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

async function sendMyAppearanceOnline() {
  const resolvedCharId = resolvePlayableCharId(selectedCharId);

  const customSeDict = {};
  if (typeof SE !== 'undefined' && SE.customRawMap) {
    let totalSeBytes = 0;
    const MAX_TOTAL_SE_BYTES = 2 * 1024 * 1024;
    for (const [key, meta] of Object.entries(SE.customRawMap)) {
      if (meta && meta.dataUrl && (totalSeBytes + meta.dataUrl.length) <= MAX_TOTAL_SE_BYTES) {
        customSeDict[key] = meta.dataUrl;
        totalSeBytes += meta.dataUrl.length;
      }
    }
  }

  const customVoiceDict = {};
  if (typeof VOICE !== 'undefined' && VOICE.customRawMap) {
    let totalVoiceBytes = 0;
    const MAX_TOTAL_VOICE_BYTES = 2 * 1024 * 1024;
    for (const [cat, meta] of Object.entries(VOICE.customRawMap)) {
      if (meta && meta.dataUrl && (totalVoiceBytes + meta.dataUrl.length) <= MAX_TOTAL_VOICE_BYTES) {
        customVoiceDict[cat] = meta.dataUrl;
        totalVoiceBytes += meta.dataUrl.length;
      }
    }
  }

  const payload = {
    charId: resolvedCharId,
    customCharaUrl: (resolvedCharId === 'custom' && CustomAssets.chara) ? CustomAssets.chara.dataUrl : null,
    customName: resolvedCharId === 'custom' ? getPlayerDisplayName() : null,
    customFrameUrl: CustomAssets.frame ? CustomAssets.frame.dataUrl : null,
    customSeDict,
    customVoiceDict
  };

  try {
    const jsonStr = JSON.stringify(payload);
    const CHUNK_SIZE = 16000;
    const total = Math.max(1, Math.ceil(jsonStr.length / CHUNK_SIZE));
    const transferId = `${myOnlineId}_${currentMatchId}_${Math.random().toString(36).slice(2, 7)}`;

    for (let i = 0; i < total; i++) {
      const chunk = jsonStr.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      const msg = { type: 'appearance_chunk', senderId: myOnlineId, transferId, index: i, total, chunk };
      onlineConnections.forEach(c => { if (c && c.open) c.send(msg); });
      if (total > 1 && i < total - 1) await new Promise(r => setTimeout(r, 8));
    }

    const doneMsg = { type: 'appearance_done', senderId: myOnlineId, transferId };
    onlineConnections.forEach(c => { if (c && c.open) c.send(doneMsg); });
  } catch (e) {
    console.warn('Appearance send error:', e);
  } finally {
    localAppearanceSent = true;
    tryEmitBoardReady();
  }
}