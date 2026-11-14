// ==========================================
// COM用 Cheat AI クラス（スキル発動型AI）
// ==========================================
class cheat extends ComAI {
  constructor(engine, level, id, maxSkills = Infinity) {
    super(engine, level, id);
    this.maxSkills = maxSkills;
    this.skillsUsed = 0;
    this.turnCount = 0;
    this.skillIntervalTurns = Math.max(4, Math.floor(10 - Math.min(6, level / 12)));
    this.skillCooldown = 180; // 開始直後は即発動しない
  }

  getRemainingSkills() {
    if (this.maxSkills === Infinity || this.maxSkills === null || this.maxSkills === undefined) {
      return Infinity;
    }
    return Math.max(0, this.maxSkills - this.skillsUsed);
  }

  update() {
    if (this.engine.gameOver || matchState !== 'playing') return;
    if (this.skillCooldown > 0) this.skillCooldown--;
    super.update();
  }

  think() {
    if (this.engine.gameOver || matchState !== 'playing') return;
    this.turnCount++;

    const canUseSkill = (this.maxSkills === Infinity || this.skillsUsed < this.maxSkills);

    if (canUseSkill) {
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
      const isPinch = (maxH >= 8 || this.engine.dangerTimer < 160);

      // 数ターンに1回、またはピンチ時にスキル発動
      if (this.skillCooldown <= 0 && (isPinch || this.turnCount >= this.skillIntervalTurns)) {
        if (this.tryActivateCheatSkill(isPinch)) {
          this.skillsUsed++;
          this.turnCount = 0;
          this.skillCooldown = isPinch ? 210 : 300;
          this.target = null;
          this.actionTimer = this.thinkInterval;
          return;
        }
      }
    }

    super.think();
  }

  hasGarbageOnSelf() {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (this.engine.grid[r][c] && this.engine.grid[r][c].type === 'garbage') return true;
      }
    }
    return false;
  }

  tryActivateCheatSkill(isPinch) {
    const candidates = ['erase_color', 'erase_rows', 'corrupt_enemy_row'];
    if (this.hasGarbageOnSelf()) {
      candidates.push('purify_garbage');
      if (isPinch) candidates.push('purify_garbage'); // ピンチ時はお邪魔浄化を優先しやすくする
    }

    // シャッフルして実行可能なスキルを発動
    candidates.sort(() => Math.random() - 0.5);
    for (const skill of candidates) {
      if (skill === 'erase_color' && this.skillEraseColor()) return true;
      if (skill === 'erase_rows' && this.skillEraseRows([ROWS - 1, ROWS - 5, ROWS - 9])) return true;
      if (skill === 'purify_garbage' && this.skillPurifyGarbage()) return true;
      if (skill === 'corrupt_enemy_row' && this.skillCorruptEnemyRow()) return true;
    }
    return false;
  }

  triggerSkillBanner(text) {
    this.engine.cutinMax = 50;
    this.engine.cutinTimer = 50;
    this.engine.cutinText = text;
    if (!this.engine.popups) this.engine.popups = [];
    this.engine.popups.push({
      text: text,
      x: (COLS * CELL_PX) / 2,
      y: (ROWS * CELL_PX) / 2,
      timer: 45,
      initialTimer: 45,
      color: '#ff007f',
      isNumber: false
    });
  }

  // スキル1: 自陣の特定マークのブロックを全消し
  skillEraseColor() {
    const counts = {};
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const b = this.engine.grid[r][c];
        if (b && b.state === 'normal' && b.type !== 'garbage') {
          counts[b.type] = (counts[b.type] || 0) + 1;
        }
      }
    }
    const entries = Object.entries(counts);
    if (entries.length === 0) return false;
    entries.sort((a, b) => b[1] - a[1]);
    const targetType = Number(entries[0][0]);

    let erased = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const b = this.engine.grid[r][c];
        if (b && b.state === 'normal' && b.type === targetType) {
          b.state = 'match';
          b.timer = 46;
          erased++;
        }
      }
    }
    if (erased === 0) return false;

    SE.play('normalErase');
    this.engine.stopTimer = Math.max(this.engine.stopTimer, 60);
    this.engine.score += erased * 15;
    if (erased >= 4 && this.engine.onSendGarbage) {
      this.engine.onSendGarbage(Math.min(12, Math.floor(erased / 2) + 2), false);
    }
    const conf = COLORS.find(col => col.id === targetType);
    this.triggerSkillBanner(`SKILL: ${conf ? conf.symbol : ''}全消し!`);
    return true;
  }

  // スキル2: 1・5・9段目のブロックを全消し（お邪魔ブロックも消滅）
  skillEraseRows(targetRows) {
    let erased = 0;
    let erasedNormal = 0;
    for (const r of targetRows) {
      if (r < 0 || r >= ROWS) continue;
      for (let c = 0; c < COLS; c++) {
        const b = this.engine.grid[r][c];
        if (!b) continue;
        if (b.type === 'garbage') {
          if (b.state !== 'match') {
            b.state = 'match';
            b.timer = 46;
            b.vanishGarbage = true;
            delete b.transformGroupId;
            delete b.transformDelay;
            delete b.isTarget;
            delete b.transformToNormal;
            erased++;
          }
        } else if (b.state === 'normal') {
          b.state = 'match';
          b.timer = 46;
          erased++;
          erasedNormal++;
        }
      }
    }
    if (erased === 0) return false;

    SE.play('normalErase');
    this.engine.stopTimer = Math.max(this.engine.stopTimer, 60);
    this.engine.score += erased * 15;
    const garbageBasis = erasedNormal > 0 ? erasedNormal : erased;
    if (garbageBasis >= 5 && this.engine.onSendGarbage) {
      this.engine.onSendGarbage(Math.min(12, Math.floor(garbageBasis / 2) + 2), false);
    }
    this.triggerSkillBanner('SKILL: 1・5・9段消し!');
    return true;
  }

  // スキル3: 自陣のお邪魔ブロックをすべて通常ブロックに変換
  skillPurifyGarbage() {
    let converted = 0;
    const normalColors = COLORS.filter(col => !col.isSpecial);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const b = this.engine.grid[r][c];
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
          delete b.transformDelay;
          delete b.isTarget;
          delete b.transformToNormal;
          converted++;
        }
      }
    }
    if (converted === 0) return false;

    SE.play('garbageErase');
    this.engine.stopTimer = Math.max(this.engine.stopTimer, 45);
    this.triggerSkillBanner('SKILL: お邪魔浄化!');
    return true;
  }

  // スキル4: 対戦相手（ランダムな生存者）のどこか1段のブロックをお邪魔に変える
  skillCorruptEnemyRow() {
    const targets = [];
    if (myEngine && !myEngine.gameOver && !isPracticeMode) {
      targets.push({ id: currentMode === 'online' ? myOnlineId : 'player', engine: myEngine, isRemote: false });
    }
    opponents.forEach(o => {
      if (o.id !== this.id && o.engine && !o.engine.gameOver) {
        const isRemote = (currentMode === 'online' && o.type === 'player');
        targets.push({ id: o.id, engine: o.engine, isRemote });
      }
    });
    if (targets.length === 0) return false;

    const target = targets[Math.floor(Math.random() * targets.length)];
    // 最上段即死を避けるため 3〜11段目の中からブロックがある段を選ぶ
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
    if (candidateRows.length === 0) return false;

    const chosenRow = candidateRows[Math.floor(Math.random() * candidateRows.length)];
    if (target.isRemote && currentMode === 'online' && myOnlineId === 'host') {
      // オンライン相手には専用パケットで変換を通知
      onlineConnections.forEach(c => {
        if (c && c.open) c.send({ type: 'cheat_corrupt_row', targetId: target.id, row: chosenRow });
      });
    } else {
      applyCorruptRowToEngine(target.engine, chosenRow);
    }

    if (typeof playGarbageSendAnimation === 'function') {
      playGarbageSendAnimation(this.id, target.id, true);
    }
    this.triggerSkillBanner('SKILL: お邪魔侵食!');
    return true;
  }
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
