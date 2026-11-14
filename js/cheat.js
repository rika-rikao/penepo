// ==========================================
// COM用 Cheat AI クラス & プレイヤー共用スキルロジック
// ==========================================
const SKILL_IDS = ['erase_color', 'erase_rows', 'purify_garbage', 'corrupt_enemy_row'];
const SKILL_LABELS = {
  erase_color: 'マーク全消し',
  erase_rows: '1・5・9段消し',
  purify_garbage: 'お邪魔浄化',
  corrupt_enemy_row: 'お邪魔侵食'
};

class cheat extends ComAI {
  constructor(engine, level, id, options = {}) {
    super(engine, level, id);
    this.turnCount = 0;

    // COMは1試合最大10回まで
    this.maxSkillUses = 10;
    this.skillUsesLeft = 10;

    // 1スキル固定型('single') と 全スキル適切選択型('smart_all')
    this.skillType = options.skillType || (Math.random() < 0.5 ? 'single' : 'smart_all');
    this.fixedSkill = options.fixedSkill || SKILL_IDS[Math.floor(Math.random() * SKILL_IDS.length)];

    // 低レベル傾向：めったに使わない型 or 乱発・無駄使い型
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
          // 渋って今回は見送る（毎フレーム判定し続けないよう小休止）
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
          } else if (b.state === 'normal') {
            colorCounts[b.type] = (colorCounts[b.type] || 0) + 1;
            if (isTargetRow) rowClearCount++;
          }
        }
      }
    }

    let bestColorCount = 0;
    Object.values(colorCounts).forEach(cnt => {
      if (cnt > bestColorCount) bestColorCount = cnt;
    });

    const isPinch = (maxH >= 9 || this.engine.dangerTimer < 140);
    const hasLiveEnemy = (myEngine && !myEngine.gameOver && !isPracticeMode)
      || opponents.some(o => o.id !== this.id && o.engine && !o.engine.gameOver);

    return { maxH, isPinch, garbageCount, bestColorCount, rowClearCount, hasLiveEnemy };
  }

  shouldHesitate(analysis) {
    // 乱発型の低レベルCOMは渋らず無駄に使う
    if (this.isLowWasteful) return false;

    // めったに使わない低レベルCOMは高確率で見送る
    if (this.level <= 25 && Math.random() < 0.65) {
      return true;
    }

    const usesLeft = this.skillUsesLeft;
    const highValueSituation = analysis.isPinch
      || analysis.garbageCount >= 6
      || analysis.bestColorCount >= 9
      || analysis.rowClearCount >= 8;

    // 残り数が少なくなると使うのを渋る
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
    if (this.isLowWasteful) {
      return 300 + Math.floor(Math.random() * 210);
    }
    if (this.level <= 25) {
      return 1100 + Math.floor(Math.random() * 500);
    }

    let cd = analysis.isPinch
      ? Math.max(520, 820 - this.level * 3)
      : Math.max(760, 1150 - this.level * 4);

    // 残り回数が少なくなるほど再使用間隔も長くなる
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
      if (skill === 'corrupt_enemy_row') return analysis.hasLiveEnemy && !analysis.isPinch;
      return true;
    };

    if (this.skillType === 'single') {
      return isAppropriate(this.fixedSkill) ? [this.fixedSkill] : [];
    }

    // 全スキルから適切なものを選択（高レベルほど状況評価が正確）
    const scored = [];
    if (analysis.garbageCount > 0 && isAppropriate('purify_garbage')) {
      const s = analysis.garbageCount * 10 + (analysis.isPinch ? 80 : 15);
      scored.push({ skill: 'purify_garbage', score: s });
    }
    if (analysis.bestColorCount > 0 && isAppropriate('erase_color')) {
      const s = analysis.bestColorCount * 8 + (analysis.isPinch ? 45 : 0);
      scored.push({ skill: 'erase_color', score: s });
    }
    if (analysis.rowClearCount > 0 && isAppropriate('erase_rows')) {
      const s = analysis.rowClearCount * 8 + (analysis.isPinch ? 40 : 0);
      scored.push({ skill: 'erase_rows', score: s });
    }
    if (analysis.hasLiveEnemy && isAppropriate('corrupt_enemy_row')) {
      const s = analysis.isPinch ? 5 : (analysis.maxH <= 6 ? 55 : 28);
      scored.push({ skill: 'corrupt_enemy_row', score: s });
    }

    if (scored.length === 0) return [];

    // 低〜中レベルほど少し揺らぎを入れ、高レベルほど最適解を厳密に選ぶ
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

// プレイヤー用スキル発動（選択された1つのスキルを実行）
function executePlayerCheatSkill(engine, senderId, preferredTarget = -1, chosenSkill = 'erase_color') {
  if (!engine) return { success: false };
  const skill = SKILL_IDS.includes(chosenSkill) ? chosenSkill : 'erase_color';

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
