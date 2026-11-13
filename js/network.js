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
  currentComLevel = comLvl;
  let players = [{ id: 'host', type: 'player', name: 'HOST' }];
  
  onlineConnections.forEach((c, idx) => {
    const cId = `client_${idx}`;
    c._clientId = cId;
    players.push({ id: cId, type: 'player', name: `PLAYER ${idx+1}`, conn: c });
  });

  const currentCount = players.length;
  for(let i = 0; i < maxPlayers - currentCount; i++) {
    players.push({ id: `com_${i}`, type: 'com', level: comLvl, name: `COM ${i+1}` });
  }

  matchPlayersConfig = players;
  startPrepareMatchFromHost();
}

function startPrepareMatchFromHost() {
  boardReady = {};
  rematchReady = {};
  
  const configBase = matchPlayersConfig.map(pl => ({ id: pl.id, type: pl.type, level: pl.level, name: pl.name }));
  const matchId = Date.now();
  const sharedSeed = Math.floor(Math.random() * 0xFFFFFFFF);
  
  onlineConnections.forEach(c => {
    const cId = c._clientId;
    const config = { players: configBase, myId: cId, matchId: matchId, seed: sharedSeed };
    if (c.open) c.send({ type: 'prepare_match', config });
  });
  
  const hostConfig = { players: configBase, myId: 'host', matchId: matchId, seed: sharedSeed };
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

  // ★追加：自分のキャラ・カスタム立ち絵（圧縮済み）を他プレイヤーへ送信
  if (typeof sendMyAppearanceOnline === 'function') {
    sendMyAppearanceOnline();
  }

  // 盤面の描画と初期同期を完了させるための待機時間
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
  
  rematchReady = {};
  config.players.forEach(p => {
    if (p.type !== 'com') rematchReady[p.id] = false;
  });

  const handicap = parseInt(document.getElementById('handicap-val').value) || 3;
  const sharedSeed = config.seed !== undefined ? config.seed : Math.floor(Math.random() * 0xFFFFFFFF);

  myRenderer = new BoardRenderer('my-canvas');
  myRenderer.theme = buildThemeForCharacter(selectedCharId, CustomAssets.chara ? CustomAssets.chara.dataUrl : null, true); // ★追加
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
    if (typeof showExternalCutin === 'function') {
      showExternalCutin(myRenderer.theme, `${chain} CHAIN!!`, '#ffd700');
    }
  };
  myEngine.onSimultaneousMatch = (size) => {
    if (typeof showExternalCutin === 'function') {
      showExternalCutin(myRenderer.theme, `${size}個消し！`, '#00d4ff');
    }
  };

  const rivalsArea = document.getElementById('rivals-area');
  const rivalsTopArea = document.getElementById('rivals-top-area');
  rivalsArea.innerHTML = '';
  rivalsTopArea.innerHTML = '';
  opponents = [];

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
            // COM死亡時も即座にゲストへ通知
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
      rAI = new ComAI(rEngine, p.level || 2, p.id);
    } else {
      rEngine = new PonEngine(null, null, 3, false, sharedSeed);
      rEngine.garbageQueue = [];
    }

    rEngine.gameOver = false; // 初期状態の確実なリセット

// ★追加：COMや相手プレイヤーの初期キャラテーマ設定
    const fallbackCharId = p.type === 'com' ? CHARACTERS[(index + 1) % CHARACTERS.length].id : 'main00';
    rRenderer.theme = buildThemeForCharacter(p.charId || fallbackCharId, null, false);
    opponents.push({
      id: p.id,
      name: p.name,
      type: p.type,
      engine: rEngine,
      renderer: rRenderer,
      ai: rAI,
      index: index
    });
    index++;
  });

  updateGarbagePreview(myEngine, 'my-garbage-preview');
  opponents.forEach((opp, i) => updateGarbagePreview(opp.engine, `rival-garbage-preview-${i}`));
  updateTargetUI();
  adjustLayout();
}

function startSyncInterval() {
  if (syncIntervalId) clearInterval(syncIntervalId);
  syncIntervalId = setInterval(() => {
    if (!myEngine) return;
    
    if (!isPracticeMode && !isMatchOver) {
       const syncData = { 
         type: 'sync', senderId: myOnlineId, grid: myEngine.grid, nextRow: myEngine.nextRow, 
         riseOffset: myEngine.riseOffset, score: myEngine.score, 
         garbageQueue: myEngine.garbageQueue, gameOver: myEngine.gameOver
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
            garbageQueue: opp.engine.garbageQueue, gameOver: opp.engine.gameOver
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
         opp.ai = new ComAI(opp.engine, currentComLevel, opp.id);
         showToast(`${opp.name} が退出したためCOMが代役に入りました。`);
      } else {
         opp.ai = new ComAI(opp.engine, currentComLevel, opp.id);
      }
      
      const configP = matchPlayersConfig.find(p => p.id === leftId);
      if (configP) {
         configP.type = 'com';
         configP.level = currentComLevel;
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
        targetOpp.renderer.theme = buildThemeForCharacter(data.charId, data.customCharaUrl, false);
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

function sendMyAppearanceOnline() {
  const payload = {
    type: 'appearance_sync',
    senderId: myOnlineId,
    charId: selectedCharId,
    customCharaUrl: (selectedCharId === 'custom' && CustomAssets.chara) ? CustomAssets.chara.dataUrl : null,
    customName: selectedCharId === 'custom' ? 'マイキャラ' : null
  };
  onlineConnections.forEach(c => {
    if (c && c.open) c.send(payload);
  });
}
