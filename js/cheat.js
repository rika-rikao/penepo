// ==========================================
// COM用 Cheat AI クラス & プレイヤー共用スキルロジック
// ==========================================
const SKILL_IDS = [
  'erase_color',
  'erase_rows',
  'purify_garbage',
  'corrupt_enemy_row',
  'seal_skill',
  'convert_blocks',
  'sacrifice',
  'no_skill'
];
const ACTIVE_COM_SKILLS = [
  'erase_color',
  'erase_rows',
  'purify_garbage',
  'corrupt_enemy_row',
  'seal_skill',
  'convert_blocks'
];
const SKILL_LABELS = {
  erase_color: 'マーク全消し',
  erase_rows: '1・5・9段消し',
  purify_garbage: 'お邪魔浄化',
  corrupt_enemy_row: 'お邪魔侵食',
  seal_skill: 'スキル封印',
  convert_blocks: 'ブロック変換',
  sacrifice: '代償',
  no_skill: 'ノースキル'
};

class cheat extends ComAI {
  constructor(engine, level, id, options = {}) {
    super(engine, level, id);
    this.turnCount = 0;

    this.skillType = options.skillType || (Math.random() < 0.5 ? 'single' : 'smart_all');
    this.fixedSkill = options.fixedSkill || ACTIVE_COM_SKILLS[Math.floor(Math.random() * ACTIVE_COM_SKILLS.length)];

    if (this.fixedSkill === 'sacrifice') {
      this.engine.setSacrifice(true);
      this.maxSkillUses = 0;
      this.skillUsesLeft = 0;
    } else if (this.fixedSkill === 'no_skill') {
      this.maxSkillUses = 0;
      this.skillUsesLeft = 0;
    } else {
      const maxUses = (options.maxSkillUses !== undefined) ? options.maxSkillUses : 10;
      this.maxSkillUses = maxUses;
      this.skillUsesLeft = maxUses;
    }

    this.isLowWasteful = (level <= 25) && (Math.random() < 0.5);

    if (this.isLowWasteful) {
      this.skillIntervalTurns = 5 + Math.floor(Math.random() * 5);
      this.skillCooldown = 240 + Math.floor(Math.random() * 180);
    } else if (level <= 25) {
      this.skillIntervalTurns = 24 + Math.floor(Math.random() * 10);
      this.skillCooldown = 1080 + Math.floor(Math.random() * 480);
    } else {
      this.skillIntervalTurns = Math.max(8, Math.floor(20 - (level - 25) * 0.14));
      this.skillCooldown = Math.max(480, 840 - level * 3);
    }
  }

  getRemainingSkills() {
    return this.skillUsesLeft;
  }

  update() {
    if (this.engine.gameOver || matchState !== 'playing') return;
    if (this.skillCooldown > 0) this.skillCooldown--;
    super.update();
  }

  think() {
    if (this.engine.gameOver || matchState !== 'playing') return;
    this.turnCount++;

    if (this.skillUsesLeft > 0 && this.skillCooldown <= 0) {
      const analysis = this.analyzeBoardForSkill();
      const readyByTurn = this.turnCount >= this.skillIntervalTurns || (analysis.isPinch && this.turnCount >= 5);

      if (readyByTurn) {
        if (this.shouldHesitate(analysis)) {
          this.skillCooldown = 150;
        } else if (this.tryActivateCheatSkill(analysis)) {
          this.skillUsesLeft--;
          this.turnCount = 0;
          this.skillCooldown = this.computeNextCooldown(analysis);
          this.target = null;
          this.actionTimer = this.thinkInterval;
          return;
        }
      }
    }

    super.think();
  }

  analyzeBoardForSkill() {
    let maxH = 0;
    let garbageCount = 0;
    const colorCounts = {};
    const targetRows = [ROWS - 1, ROWS - 5, ROWS - 9];
    let rowClearCount = 0;

    for (let r = 0; r < ROWS; r++) {
      const isTargetRow = targetRows.includes(r);
      for (let c = 0; c < COLS; c++) {
        const b = this.engine.grid[r][c];
        if (b !== null) {
          maxH = Math.max(maxH, ROWS - r);
          if (b.type === 'garbage') {
            garbageCount++;
            if (isTargetRow && b.state === 'normal') rowClearCount++;
          } else if (b.state === 'normal') {
            colorCounts[b.type] = (colorCounts[b.type] || 0) + 1;
            if (isTargetRow) rowClearCount++;
          }
        }
      }
    }

    let bestColorCount = 0;
    let normalColorKinds = 0;
    Object.entries(colorCounts).forEach(([k, cnt]) => {
      if (cnt > bestColorCount) bestColorCount = cnt;
      const numId = parseInt(k, 10);
      if (numId >= 1 && numId <= 6 && cnt > 0) normalColorKinds++;
    });

    const isPinch = (maxH >= 9 || this.engine.dangerTimer < (this.engine.getMaxDangerTimer() - 40));
    const hasLiveEnemy = (myEngine && !myEngine.gameOver && !isPracticeMode)
      || opponents.some(o => o.id !== this.id && o.engine && !o.engine.gameOver);

    return { maxH, isPinch, garbageCount, bestColorCount, normalColorKinds, rowClearCount, hasLiveEnemy };
  }

  shouldHesitate(analysis) {
    if (this.isLowWasteful) return false;
    if (this.level <= 25 && Math.random() < 0.65) return true;

    const usesLeft = this.skillUsesLeft;
    const highValueSituation = analysis.isPinch
      || analysis.garbageCount >= 6
      || analysis.bestColorCount >= 9
      || analysis.rowClearCount >= 8;

    if (this.maxSkillUses <= 3) {
      if (usesLeft === 1 && !highValueSituation) return Math.random() < 0.7;
      return false;
    }

    if (usesLeft <= 3) {
      if (!highValueSituation) return Math.random() < 0.85;
      return Math.random() < (0.15 + (3 - usesLeft) * 0.12);
    }
    if (usesLeft <= 6) {
      if (!analysis.isPinch && Math.random() < 0.42) return true;
    }
    return false;
  }

  computeNextCooldown(analysis) {
    if (this.isLowWasteful) return 300 + Math.floor(Math.random() * 210);
    if (this.level <= 25) return 1100 + Math.floor(Math.random() * 500);

    let cd = analysis.isPinch
      ? Math.max(520, 820 - this.level * 3)
      : Math.max(760, 1150 - this.level * 4);

    if (this.maxSkillUses <= 3) {
      if (this.skillUsesLeft <= 1) cd += 300;
      return cd;
    }
    if (this.skillUsesLeft <= 3) cd += 480;
    else if (this.skillUsesLeft <= 6) cd += 240;
    return cd;
  }

  tryActivateCheatSkill(analysis) {
    const orderedSkills = this.pickOrderedSkills(analysis);
    for (const skill of orderedSkills) {
      if (skill === 'erase_color') {
        const res = execSkillEraseColor(this.engine, this.id);
        if (res.success) { this.triggerSkillBanner(res.text); return true; }
      } else if (skill === 'erase_rows') {
        const res = execSkillEraseRows(this.engine, this.id, [ROWS - 1, ROWS - 5, ROWS - 9]);
        if (res.success) { this.triggerSkillBanner(res.text); return true; }
      } else if (skill === 'purify_garbage') {
        const res = execSkillPurifyGarbage(this.engine);
        if (res.success) { this.triggerSkillBanner(res.text); return true; }
      } else if (skill === 'corrupt_enemy_row') {
        const preferred = this.level >= 40 ? this.pickStrongestOrTallestEnemyId() : -1;
        const res = execSkillCorruptEnemyRow(this.id, preferred);
        if (res.success) { this.triggerSkillBanner(res.text); return true; }
      } else if (skill === 'seal_skill') {
        const preferred = this.level >= 40 ? this.pickStrongestOrTallestEnemyId() : -1;
        const res = execSkillSealSkill(this.id, preferred);
        if (res.success) { this.triggerSkillBanner(res.text); return true; }
      } else if (skill === 'convert_blocks') {
        const res = execSkillConvertBlocks(this.engine);
        if (res.success) { this.triggerSkillBanner(res.text); return true; }
      }
    }
    return false;
  }

  pickOrderedSkills(analysis) {
    const strictQuality = !this.isLowWasteful && this.level >= 30;

    const isAppropriate = (skill) => {
      if (!strictQuality) return true;
      if (skill === 'purify_garbage') return analysis.garbageCount >= (analysis.isPinch ? 2 : 4);
      if (skill === 'erase_color') return analysis.bestColorCount >= (analysis.isPinch ? 3 : 5);
      if (skill === 'erase_rows') return analysis.rowClearCount >= (analysis.isPinch ? 3 : 5);
      if (skill === 'convert_blocks') return analysis.normalColorKinds >= 3;
      if (skill === 'corrupt_enemy_row' || skill === 'seal_skill') return analysis.hasLiveEnemy && !analysis.isPinch;
      return true;
    };

    if (this.skillType === 'single') {
      return isAppropriate(this.fixedSkill) ? [this.fixedSkill] : [];
    }

    const scored = [];
    if (analysis.garbageCount > 0 && isAppropriate('purify_garbage')) {
      scored.push({ skill: 'purify_garbage', score: analysis.garbageCount * 10 + (analysis.isPinch ? 80 : 15) });
    }
    if (analysis.bestColorCount > 0 && isAppropriate('erase_color')) {
      scored.push({ skill: 'erase_color', score: analysis.bestColorCount * 8 + (analysis.isPinch ? 45 : 0) });
    }
    if (analysis.rowClearCount > 0 && isAppropriate('erase_rows')) {
      scored.push({ skill: 'erase_rows', score: analysis.rowClearCount * 8 + (analysis.isPinch ? 40 : 0) });
    }
    if (analysis.normalColorKinds >= 3 && isAppropriate('convert_blocks')) {
      scored.push({ skill: 'convert_blocks', score: analysis.normalColorKinds * 9 + (analysis.isPinch ? 38 : 16) });
    }
    if (analysis.hasLiveEnemy && isAppropriate('corrupt_enemy_row')) {
      scored.push({ skill: 'corrupt_enemy_row', score: analysis.isPinch ? 5 : (analysis.maxH <= 6 ? 55 : 28) });
    }
    if (analysis.hasLiveEnemy && isAppropriate('seal_skill')) {
      scored.push({ skill: 'seal_skill', score: analysis.isPinch ? 4 : 36 });
    }

    if (scored.length === 0) return [];

    const noiseRange = Math.max(4, Math.floor((100 - this.level) * 0.6));
    scored.forEach(item => {
      item.finalScore = item.score + (Math.random() * noiseRange);
    });
    scored.sort((a, b) => b.finalScore - a.finalScore);
    return scored.map(item => item.skill);
  }

  pickStrongestOrTallestEnemyId() {
    const candidates = [];
    const selfId = currentMode === 'online' ? myOnlineId : 'player';
    if (myEngine && !myEngine.gameOver && !isPracticeMode) {
      candidates.push({ id: selfId, engine: myEngine });
    }
    opponents.forEach(o => {
      if (o.id !== this.id && o.engine && !o.engine.gameOver) {
        candidates.push({ id: o.id, engine: o.engine });
      }
    });
    if (candidates.length === 0) return -1;

    let bestId = candidates[0].id;
    let bestHeight = -1;
    candidates.forEach(cand => {
      let h = 0;
      for (let c = 0; c < COLS; c++) {
        for (let r = 0; r < ROWS; r++) {
          if (cand.engine.grid[r][c] !== null) {
            h = Math.max(h, ROWS - r);
            break;
          }
        }
      }
      if (h > bestHeight) {
        bestHeight = h;
        bestId = cand.id;
      }
    });
    return bestId;
  }

  triggerSkillBanner(text) {
    this.engine.cutinMax = 50;
    this.engine.cutinTimer = 50;
    this.engine.cutinText = text;
    if (typeof playAttackVoiceForSender === 'function') {
      playAttackVoiceForSender(this.id);
    }
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

function rebalanceGarbageGroupIds(engine) {
  if (!engine) return;
  const visited = Array.from({ length: ROWS }, () => Array(COLS).fill(false));

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const start = engine.grid[r][c];
      if (!start || start.type !== 'garbage' || start.state === 'match' || !start.groupId || visited[r][c]) continue;

      const origGroupId = start.groupId;
      const newGroupId = engine.allocGroupId ? engine.allocGroupId() : (Date.now() + Math.random());
      const queue = [[r, c]];
      visited[r][c] = true;

      while (queue.length > 0) {
        const [cr, cc] = queue.shift();
        engine.grid[cr][cc].groupId = newGroupId;
        [[cr - 1, cc], [cr + 1, cc], [cr, cc - 1], [cr, cc + 1]].forEach(([nr, nc]) => {
          if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && !visited[nr][nc]) {
            const nb = engine.grid[nr][nc];
            if (nb && nb.type === 'garbage' && nb.state !== 'match' && nb.groupId === origGroupId) {
              visited[nr][nc] = true;
              queue.push([nr, nc]);
            }
          }
        });
      }
    }
  }
}

function executePlayerCheatSkill(engine, senderId, preferredTarget = -1, chosenSkill = 'erase_color') {
  if (!engine) return { success: false };
  const skill = SKILL_IDS.includes(chosenSkill) ? chosenSkill : 'erase_color';

  if (skill === 'no_skill' || skill === 'sacrifice') {
    return { success: false };
  }
  if (skill === 'purify_garbage') {
    return execSkillPurifyGarbage(engine);
  }
  if (skill === 'corrupt_enemy_row') {
    return execSkillCorruptEnemyRow(senderId, preferredTarget);
  }
  if (skill === 'erase_color') {
    return execSkillEraseColor(engine, senderId);
  }
  if (skill === 'erase_rows') {
    return execSkillEraseRows(engine, senderId, [ROWS - 1, ROWS - 5, ROWS - 9]);
  }
  if (skill === 'seal_skill') {
    return execSkillSealSkill(senderId, preferredTarget);
  }
  if (skill === 'convert_blocks') {
    return execSkillConvertBlocks(engine);
  }
  return { success: false };
}

function execSkillEraseColor(engine, senderId) {
  const presentTypes = new Set();
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const b = engine.grid[r][c];
      if (b && b.state === 'normal' && b.type !== 'garbage') {
        presentTypes.add(b.type);
      }
    }
  }
  const typeList = Array.from(presentTypes);
  if (typeList.length === 0) return { success: false };

  for (let i = typeList.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [typeList[i], typeList[j]] = [typeList[j], typeList[i]];
  }
  const pickedTypes = typeList.slice(0, 2);
  const pickedSet = new Set(pickedTypes);

  let erased = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const b = engine.grid[r][c];
      if (b && b.state === 'normal' && pickedSet.has(b.type)) {
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
  const symbols = pickedTypes.map(t => {
    const conf = COLORS.find(col => col.id === t);
    return conf ? conf.symbol : '';
  }).join('');
  return { success: true, text: `SKILL: ${symbols}全消し!` };
}

function execSkillEraseRows(engine, senderId, targetRows) {
  let erased = 0;
  let erasedGarbage = false;
  for (const r of targetRows) {
    if (r < 0 || r >= ROWS) continue;
    for (let c = 0; c < COLS; c++) {
      const b = engine.grid[r][c];
      if (b && b.state === 'normal') {
        if (b.type === 'garbage') {
          b.state = 'match';
          b.timer = 46;
          b.skillErase = true;
          delete b.groupId;
          delete b.isHard;
          erasedGarbage = true;
          erased++;
        } else {
          b.state = 'match';
          b.timer = 46;
          erased++;
        }
      }
    }
  }
  if (erased === 0) return { success: false };

  if (erasedGarbage) {
    rebalanceGarbageGroupIds(engine);
  }

  SE.play('normalErase');
  engine.stopTimer = Math.max(engine.stopTimer, 60);
  engine.score += erased * 15;
  if (erased >= 5 && engine.onSendGarbage) {
    engine.onSendGarbage(Math.min(12, Math.floor(erased / 2) + 2), false);
  }
  return { success: true, text: 'SKILL: 1・5・9段消し!' };
}

function execSkillPurifyGarbage(engine) {
  if (!engine || typeof engine.startPurifySkill !== 'function') return { success: false };
  const started = engine.startPurifySkill();
  if (!started) return { success: false };
  return { success: true, text: 'SKILL: お邪魔浄化!' };
}

// ランダムで3色のブロックを別の2色のブロックに変える
function execSkillConvertBlocks(engine) {
  const normalIds = COLORS.filter(col => !col.isSpecial).map(col => col.id);
  const presentNormalSet = new Set();
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const b = engine.grid[r][c];
      if (b && b.state === 'normal' && normalIds.includes(b.type)) {
        presentNormalSet.add(b.type);
      }
    }
  }

  const presentList = Array.from(presentNormalSet);
  if (presentList.length === 0) return { success: false };

  for (let i = presentList.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [presentList[i], presentList[j]] = [presentList[j], presentList[i]];
  }
  const sourceColors = presentList.slice(0, Math.min(3, presentList.length));
  const sourceSet = new Set(sourceColors);

  let otherColors = normalIds.filter(id => !sourceSet.has(id));
  if (otherColors.length < 2) {
    otherColors = normalIds.filter(id => id !== sourceColors[0]);
  }
  for (let i = otherColors.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [otherColors[i], otherColors[j]] = [otherColors[j], otherColors[i]];
  }
  const destColors = otherColors.slice(0, 2);

  let converted = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const b = engine.grid[r][c];
      if (b && b.state === 'normal' && sourceSet.has(b.type)) {
        b.type = destColors[Math.floor(Math.random() * destColors.length)];
        b.particleTimer = 26;
        b.chainEligible = false;
        converted++;
      }
    }
  }
  if (converted === 0) return { success: false };

  SE.play('normalErase');
  engine.stopTimer = Math.max(engine.stopTimer, 45);
  engine.checkMatches();
  return { success: true, text: 'SKILL: ブロック変換!' };
}

function collectSkillTargets(senderId, preferredTarget = -1) {
  const targets = [];
  const selfId = currentMode === 'online' ? myOnlineId : 'player';

  if (senderId !== selfId && myEngine && !myEngine.gameOver && !isPracticeMode) {
    targets.push({ id: selfId, engine: myEngine, isRemote: false, index: -1, opp: null });
  }
  opponents.forEach(o => {
    if (o.id !== senderId && o.engine && !o.engine.gameOver) {
      const isRemote = (currentMode === 'online' && o.type === 'player');
      targets.push({ id: o.id, engine: o.engine, isRemote, index: o.index, opp: o });
    }
  });
  if (targets.length === 0) return null;

  let target = null;
  if (typeof preferredTarget === 'string') {
    target = targets.find(t => t.id === preferredTarget) || null;
  } else if (typeof preferredTarget === 'number' && preferredTarget >= 0) {
    target = targets.find(t => t.index === preferredTarget) || null;
  }
  if (!target) {
    target = targets[Math.floor(Math.random() * targets.length)];
  }
  return target;
}

// 相手のスキル発動までの残りスコアを300追加する
function execSkillSealSkill(senderId, preferredTarget = -1) {
  const target = collectSkillTargets(senderId, preferredTarget);
  if (!target) return { success: false };

  const SEAL_AMOUNT = 300;
  if (target.isRemote && currentMode === 'online') {
    onlineConnections.forEach(c => {
      if (c && c.open) c.send({ type: 'cheat_seal_skill', senderId, targetId: target.id, amount: SEAL_AMOUNT });
    });
  } else if (target.opp === null) {
    if (typeof applySkillSealToMainPlayer === 'function') {
      applySkillSealToMainPlayer(SEAL_AMOUNT);
    }
  } else {
    const opp = target.opp;
    if (opp.type === 'local_human' && opp.skillState && opp.skillState.enabled) {
      opp.skillState.nextRequiredScore += SEAL_AMOUNT;
      opp.engine.cutinMax = 50;
      opp.engine.cutinTimer = 50;
      opp.engine.cutinText = `SEALED +${SEAL_AMOUNT}!`;
      if (typeof updateSkillButtonUI === 'function') updateSkillButtonUI();
    } else if (opp.ai) {
      if (typeof opp.ai.skillCooldown === 'number') {
        opp.ai.skillCooldown += 480;
      }
      opp.engine.cutinMax = 50;
      opp.engine.cutinTimer = 50;
      opp.engine.cutinText = 'SKILL SEALED!';
    }
  }

  if (typeof playGarbageSendAnimation === 'function') {
    playGarbageSendAnimation(senderId, target.id, false);
  }
  return { success: true, text: 'SKILL: スキル封印!' };
}

function execSkillCorruptEnemyRow(senderId, preferredTarget = -1) {
  const target = collectSkillTargets(senderId, preferredTarget);
  if (!target) return { success: false };

  const candidateRows = [];
  const fallbackRows = [];
  for (let r = 0; r < ROWS; r++) {
    let hasAnyBlock = false;
    let hasNonGarbage = false;
    for (let c = 0; c < COLS; c++) {
      const b = target.engine.grid[r][c];
      if (b !== null) {
        hasAnyBlock = true;
        if (b.type !== 'garbage' && b.state === 'normal') {
          hasNonGarbage = true;
        }
      }
    }
    if (hasNonGarbage) candidateRows.push(r);
    else if (hasAnyBlock) fallbackRows.push(r);
  }

  const rowPool = candidateRows.length > 0 ? candidateRows : fallbackRows;
  if (rowPool.length === 0) return { success: false };

  const chosenRow = rowPool[Math.floor(Math.random() * rowPool.length)];
  if (target.isRemote && currentMode === 'online') {
    onlineConnections.forEach(c => {
      if (c && c.open) c.send({ type: 'cheat_corrupt_row', senderId, targetId: target.id, row: chosenRow });
    });
  } else {
    applyCorruptRowToEngine(target.engine, chosenRow);
    target.engine.addGarbage(3, 1, false);
    if (target.engine.garbageQueue.length > 0) {
      target.engine.garbageQueue[target.engine.garbageQueue.length - 1].delay = 45;
    }
  }

  if (typeof playGarbageSendAnimation === 'function') {
    playGarbageSendAnimation(senderId, target.id, false);
  }
  return { success: true, text: 'SKILL: お邪魔侵食!' };
}

function applyCorruptRowToEngine(targetEngine, row) {
  if (!targetEngine || row < 0 || row >= ROWS) return;
  const groupId = targetEngine.allocGroupId ? targetEngine.allocGroupId() : (Date.now() + Math.random());
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