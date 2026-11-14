
// ==========================================
// COM用 Cheat AI クラス & プレイヤー共用スキルロジック
// ==========================================
class cheat extends ComAI {
  constructor(engine, level, id) {
    super(engine, level, id);
    this.turnCount = 0;
    // 敵のスキル使用頻度を落とした設定
    this.skillIntervalTurns = Math.max(12, Math.floor(24 - Math.min(12, level / 7)));
    this.skillCooldown = Math.max(720, 960 - level * 2); // 開幕12〜16秒は発動しない
  }

  update() {
    if (this.engine.gameOver || matchState !== 'playing') return;
    if (this.skillCooldown > 0) this.skillCooldown--;
    super.update();
  }

  think() {
    if (this.engine.gameOver || matchState !== 'playing') return;
    this.turnCount++;

    // ピンチ判定（積み上がり高さ or 上端危険タイマー）
    let maxH = 0;
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        if (this.engine.grid[r][c] !== null) {
          maxH = Math.max(maxH, ROWS - r);
          break;
        }
      }
    }
    const isPinch = (maxH >= 9 || this.engine.dangerTimer < 140);

    // 規定ターン到達、またはピンチ時（連発しないよう最低ターン間隔を置く）に低確率〜一定頻度で発動
    if (this.skillCooldown <= 0 && (this.turnCount >= this.skillIntervalTurns || (isPinch && this.turnCount >= 6))) {
      if (this.tryActivateCheatSkill(isPinch)) {
        this.turnCount = 0;
        this.skillCooldown = isPinch
          ? Math.max(540, 840 - this.level * 3)   // ピンチ後: 約9〜14秒
          : Math.max(780, 1200 - this.level * 4); // 通常後: 約13〜20秒
        this.target = null;
        this.actionTimer = this.thinkInterval;
        return;
      }
    }

    super.think();
  }

  hasGarbageOnSelf() {
    return hasGarbageInEngine(this.engine);
  }

  tryActivateCheatSkill(isPinch) {
    const candidates = ['erase_color', 'erase_rows', 'corrupt_enemy_row'];
    if (this.hasGarbageOnSelf()) {
      candidates.push('purify_garbage');
      if (isPinch) candidates.push('purify_garbage');
    }

    candidates.sort(() => Math.random() - 0.5);
    for (const skill of candidates) {
      if (skill === 'erase_color') {
        const res = execSkillEraseColor(this.engine, this.id);
        if (res.success) { this.triggerSkillBanner(res.text); return true; }
      }
      if (skill === 'erase_rows') {
        const res = execSkillEraseRows(this.engine, this.id, [ROWS - 1, ROWS - 5, ROWS - 9]);
        if (res.success) { this.triggerSkillBanner(res.text); return true; }
      }
      if (skill === 'purify_garbage') {
        const res = execSkillPurifyGarbage(this.engine);
        if (res.success) { this.triggerSkillBanner(res.text); return true; }
      }
      if (skill === 'corrupt_enemy_row') {
        const res = execSkillCorruptEnemyRow(this.id, -1);
        if (res.success) { this.triggerSkillBanner(res.text); return true; }
      }
    }
    return false;
  }

  triggerSkillBanner(text) {
    this.engine.cutinMax = 50;
    this.engine.cutinTimer = 50;
    this.engine.cutinText = text;
    if (this.engine.onSkillActivated) {
      this.engine.onSkillActivated(text);
    }
  }
}

function hasGarbageInEngine(engine) {
  if (!engine) return false;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (engine.grid[r][c] && engine.grid[r][c].type === 'garbage') return true;
    }
  }
  return false;
}

// プレイヤー用スキル発動エントリーポイント（preferredTarget は相手の文字列ID または index）
function executePlayerCheatSkill(engine, senderId, preferredTarget = -1) {
  if (!engine) return { success: false };
  const hasEnemy = (senderId !== 'player' && myEngine && !myEngine.gameOver && !isPracticeMode)
                || opponents.some(o => o.id !== senderId && o.engine && !o.engine.gameOver);
  const candidates = ['erase_color', 'erase_rows'];
  if (hasEnemy) candidates.push('corrupt_enemy_row');
  if (hasGarbageInEngine(engine)) {
    candidates.push('purify_garbage', 'purify_garbage');
  }

  candidates.sort(() => Math.random() - 0.5);
  for (const skill of candidates) {
    if (skill === 'purify_garbage') {
      const res = execSkillPurifyGarbage(engine);
      if (res.success) return res;
    } else if (skill === 'corrupt_enemy_row') {
      const res = execSkillCorruptEnemyRow(senderId, preferredTarget);
      if (res.success) return res;
    } else if (skill === 'erase_color') {
      const res = execSkillEraseColor(engine, senderId);
      if (res.success) return res;
    } else if (skill === 'erase_rows') {
      const res = execSkillEraseRows(engine, senderId, [ROWS - 1, ROWS - 5, ROWS - 9]);
      if (res.success) return res;
    }
  }
  return { success: false };
}

function execSkillEraseColor(engine, senderId) {
  const counts = {};
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const b = engine.grid[r][c];
      if (b && b.state === 'normal' && b.type !== 'garbage') {
        counts[b.type] = (counts[b.type] || 0) + 1;
      }
    }
  }
  const entries = Object.entries(counts);
  if (entries.length === 0) return { success: false };
  entries.sort((a, b) => b[1] - a[1]);
  const targetType = Number(entries[0][0]);

  let erased = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const b = engine.grid[r][c];
      if (b && b.state === 'normal' && b.type === targetType) {
        b.state = 'match';
        b.timer = 46;
        erased++;
      }
    }
  }
  if (erased === 0) return { success: false };

  SE.play('normalErase');
  engine.stopTimer = Math.max(engine.stopTimer, 60);
  engine.score += erased * 15;
  if (erased >= 4 && engine.onSendGarbage) {
    engine.onSendGarbage(Math.min(12, Math.floor(erased / 2) + 2), false);
  }
  const conf = COLORS.find(col => col.id === targetType);
  return { success: true, text: `SKILL: ${conf ? conf.symbol : ''}全消し!` };
}

function execSkillEraseRows(engine, senderId, targetRows) {
  let erased = 0;
  for (const r of targetRows) {
    if (r < 0 || r >= ROWS) continue;
    for (let c = 0; c < COLS; c++) {
      const b = engine.grid[r][c];
      if (b && b.state === 'normal' && b.type !== 'garbage') {
        b.state = 'match';
        b.timer = 46;
        erased++;
      }
    }
  }
  if (erased === 0) return { success: false };

  SE.play('normalErase');
  engine.stopTimer = Math.max(engine.stopTimer, 60);
  engine.score += erased * 15;
  if (erased >= 5 && engine.onSendGarbage) {
    engine.onSendGarbage(Math.min(12, Math.floor(erased / 2) + 2), false);
  }
  return { success: true, text: 'SKILL: 1・5・9段消し!' };
}

function execSkillPurifyGarbage(engine) {
  let converted = 0;
  const normalColors = COLORS.filter(col => !col.isSpecial);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const b = engine.grid[r][c];
      if (b && b.type === 'garbage') {
        b.type = normalColors[Math.floor(Math.random() * normalColors.length)].id;
        b.state = 'hover';
        b.timer = 12;
        b.fallY = 0;
        b.chainEligible = true;
        b.particleTimer = 25;
        delete b.groupId;
        delete b.isHard;
        delete b.transformGroupId;
        converted++;
      }
    }
  }
  if (converted === 0) return { success: false };

  SE.play('garbageErase');
  engine.stopTimer = Math.max(engine.stopTimer, 45);
  return { success: true, text: 'SKILL: お邪魔浄化!' };
}

function execSkillCorruptEnemyRow(senderId, preferredTarget = -1) {
  const targets = [];
  const selfId = currentMode === 'online' ? myOnlineId : 'player';

  if (senderId !== selfId && myEngine && !myEngine.gameOver && !isPracticeMode) {
    targets.push({ id: selfId, engine: myEngine, isRemote: false, index: -1 });
  }
  opponents.forEach(o => {
    if (o.id !== senderId && o.engine && !o.engine.gameOver) {
      const isRemote = (currentMode === 'online' && o.type === 'player');
      targets.push({ id: o.id, engine: o.engine, isRemote, index: o.index });
    }
  });
  if (targets.length === 0) return { success: false };

  let target = null;
  if (typeof preferredTarget === 'string') {
    target = targets.find(t => t.id === preferredTarget) || null;
  } else if (typeof preferredTarget === 'number' && preferredTarget >= 0) {
    target = targets.find(t => t.index === preferredTarget) || null;
  }
  if (!target) {
    target = targets[Math.floor(Math.random() * targets.length)];
  }

  const candidateRows = [];
  for (let r = 3; r < ROWS; r++) {
    let hasNormal = false;
    for (let c = 0; c < COLS; c++) {
      const b = target.engine.grid[r][c];
      if (b && b.type !== 'garbage' && b.state === 'normal') {
        hasNormal = true;
        break;
      }
    }
    if (hasNormal) candidateRows.push(r);
  }
  if (candidateRows.length === 0) return { success: false };

  const chosenRow = candidateRows[Math.floor(Math.random() * candidateRows.length)];
  if (target.isRemote && currentMode === 'online') {
    onlineConnections.forEach(c => {
      if (c && c.open) c.send({ type: 'cheat_corrupt_row', senderId, targetId: target.id, row: chosenRow });
    });
  } else {
    applyCorruptRowToEngine(target.engine, chosenRow);
  }

  if (typeof playGarbageSendAnimation === 'function') {
    playGarbageSendAnimation(senderId, target.id, true);
  }
  return { success: true, text: 'SKILL: お邪魔侵食!' };
}

function applyCorruptRowToEngine(targetEngine, row) {
  if (!targetEngine || row < 0 || row >= ROWS) return;
  const groupId = Date.now() + Math.random();
  for (let c = 0; c < COLS; c++) {
    const existing = targetEngine.grid[row][c];
    if (!existing || (existing.type !== 'garbage' && existing.state === 'normal')) {
      targetEngine.grid[row][c] = {
        type: 'garbage',
        state: 'normal',
        fallY: 0,
        timer: 0,
        groupId: groupId,
        isHard: false,
        particleTimer: 25
      };
    }
  }
  targetEngine.shakeTimer = 12;
  SE.play('falledBlock');
}

const CheatAI = cheat;
