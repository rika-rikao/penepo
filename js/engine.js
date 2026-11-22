// ==========================================
// ゲームエンジン（入れ替え・落下高速化 / 60fps固定タイミング調整 / 多段・割合お邪魔浄化 / GB風視認性改善 / COM個性・ランダム思考対応）
// ==========================================
function createSeededRng(seed) {
  let s = seed >>> 0;
  return function() {
    s += 0x6D2B79F5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class PonEngine {
  constructor(onStateChange, onSendGarbage, handicap = 3, isPlayer = true, seed = null) {
    this.cols = COLS; this.rows = ROWS;
    this.handicap = handicap;
    this.isPlayer = isPlayer; 
    this.boardRng = createSeededRng(seed !== null ? seed : Math.floor(Math.random() * 0xFFFFFFFF));
    this.grid = Array.from({ length: this.rows }, () => Array(this.cols).fill(null));
    this.nextRow = []; 
    this.riseOffset = 0; 
    this.isPractice = false;
    this.isSacrifice = false;
    this.chainGraceTimer = 0;
    this.chainGraceMax = 0;
    this.nextGroupId = 1;

    this.skillModifiers = {
      dangerTimerMult: 1.0,
      chainGraceFrames: 0,
      incomingGarbageMult: 1.0,
      outgoingGarbageMult: 1.0,
      outgoingGarbageFlatSub: 0,
      outgoingTwoTierDrop: false,
      riseSpeedMult: 1.0,
      autoLoseMs: 0
    };
    
    this.baseRiseSpeed = 0.0012 - (handicap - 3) * 0.0003;
    if (this.baseRiseSpeed < 0.0003) this.baseRiseSpeed = 0.0003;
    this.riseSpeed = this.baseRiseSpeed;
    
    this.timeElapsed = 0;
    this.keepSpeed = false;

    this.stopTimer = 0;
    this.dangerTimer = 180; 
    this.shakeTimer = 0;
    this.cutinTimer = 0;
    this.cutinMax = 50;
    this.cutinText = '';
    this.popups = [];
    this.score = 0; this.chain = 0;
    this.gameOver = false;
    this.endAnim = null;
    this.cursor = { x: 2, y: 6 };
    this.garbageQueue = [];
    this.purifyState = null;
    this.onStateChange = onStateChange;
    this.onSendGarbage = onSendGarbage;
    this.onRowPushed = null;
    this.onSwap = null;
    this.onGarbageLanded = null;
    
    this.isRisingManualBtn = false;
    this.isRisingManualKey = false;
    this.isRisingManualPad = false;

    this.initGrid(5);
  }

  getMaxDangerTimer() {
    const mult = this.skillModifiers ? (this.skillModifiers.dangerTimerMult || 1.0) : 1.0;
    return Math.round(180 * mult);
  }

  setSacrifice(enabled) {
    this.isSacrifice = !!enabled;
    if (enabled) {
      this.setCustomSkillModifiers({
        dangerTimerMult: 2.0,
        chainGraceFrames: 68,
        incomingGarbageMult: 1.2,
        outgoingGarbageMult: 1.0,
        outgoingGarbageFlatSub: 0,
        outgoingTwoTierDrop: true,
        riseSpeedMult: 1.0,
        autoLoseMs: 180000
      });
    } else {
      this.setCustomSkillModifiers(null);
    }
  }

  setCustomSkillModifiers(mods) {
    if (!mods) {
      this.skillModifiers = {
        dangerTimerMult: 1.0,
        chainGraceFrames: 0,
        incomingGarbageMult: 1.0,
        outgoingGarbageMult: 1.0,
        outgoingGarbageFlatSub: 0,
        outgoingTwoTierDrop: false,
        riseSpeedMult: 1.0,
        autoLoseMs: 0
      };
    } else {
      this.skillModifiers = {
        dangerTimerMult: mods.dangerTimerMult || 1.0,
        chainGraceFrames: mods.chainGraceFrames || 0,
        incomingGarbageMult: mods.incomingGarbageMult || 1.0,
        outgoingGarbageMult: mods.outgoingGarbageMult || 1.0,
        outgoingGarbageFlatSub: mods.outgoingGarbageFlatSub || 0,
        outgoingTwoTierDrop: !!mods.outgoingTwoTierDrop,
        riseSpeedMult: mods.riseSpeedMult || 1.0,
        autoLoseMs: mods.autoLoseMs || 0
      };
    }
    this.chainGraceMax = this.skillModifiers.chainGraceFrames;
    this.chainGraceTimer = 0;
    this.dangerTimer = this.getMaxDangerTimer();
    this.riseSpeed = this.baseRiseSpeed * (this.skillModifiers.riseSpeedMult || 1.0);
  }

  hasChainGraceEnabled() {
    return this.isSacrifice || (this.skillModifiers && this.skillModifiers.chainGraceFrames > 0);
  }

  hasAnyMovingBlock() {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const b = this.grid[r][c];
        if (b && (
          b.state === 'match' ||
          b.state === 'fall' ||
          b.state === 'hover' ||
          b.state === 'transforming' ||
          b.state === 'transforming_wait' ||
          b.state === 'transformed_wait'
        )) {
          return true;
        }
      }
    }
    return false;
  }

  finishChain() {
    if (this.chain === 4) {
      SE.play('fanfareMin');
    } else if (this.chain === 5) {
      SE.play('fanfareMid');
    } else if (this.chain >= 6) {
      SE.play('fanfareMax');
    }

    if (this.chain >= 2 && this.onChainEnd) {
      this.onChainEnd(this.chain);
    }

    this.chain = 0;
    this.chainGraceTimer = 0;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.grid[r][c]) this.grid[r][c].chainEligible = false;
      }
    }
  }

  allocGroupId() {
    return this.nextGroupId++;
  }

  rebuildRemainingGarbageGroups() {
    const visited = Array.from({ length: this.rows }, () => Array(this.cols).fill(false));
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const start = this.grid[r][c];
        if (!start || start.type !== 'garbage' || start.state === 'purify_anim' || start.state === 'match' || visited[r][c]) continue;
        const origGid = start.groupId;
        const newGid = this.allocGroupId();
        const queue = [[r, c]];
        visited[r][c] = true;
        while (queue.length > 0) {
          const [cr, cc] = queue.shift();
          this.grid[cr][cc].groupId = newGid;
          [[cr - 1, cc], [cr + 1, cc], [cr, cc - 1], [cr, cc + 1]].forEach(([nr, nc]) => {
            if (nr >= 0 && nr < this.rows && nc >= 0 && nc < this.cols && !visited[nr][nc]) {
              const nb = this.grid[nr][nc];
              if (nb && nb.type === 'garbage' && nb.state !== 'purify_anim' && nb.state !== 'match') {
                if (!origGid || !nb.groupId || nb.groupId === origGid) {
                  visited[nr][nc] = true;
                  queue.push([nr, nc]);
                }
              }
            }
          });
        }
      }
    }
  }

  startGameOverFillAnim(onComplete = null) {
    if (this.endAnim && this.endAnim.type === 'gameover_fill') {
      if (onComplete) {
        if (this.endAnim.done) onComplete();
        else this.endAnim.onComplete = onComplete;
      }
      return;
    }
    this.isRisingManualBtn = false;
    this.isRisingManualKey = false;
    this.isRisingManualPad = false;
    this.purifyState = null;
    this.endAnim = {
      type: 'gameover_fill',
      row: 0,
      timer: 0,
      interval: 3,
      done: false,
      onComplete
    };
  }

  startVictoryClearAnim(onComplete = null) {
    if (this.endAnim && this.endAnim.type === 'victory_clear') {
      if (onComplete) {
        if (this.endAnim.done) onComplete();
        else this.endAnim.onComplete = onComplete;
      }
      return;
    }
    this.isRisingManualBtn = false;
    this.isRisingManualKey = false;
    this.isRisingManualPad = false;
    this.purifyState = null;
    this.endAnim = {
      type: 'victory_clear',
      row: 0,
      timer: 0,
      interval: 3,
      done: false,
      onComplete
    };
  }

  updateVisualTimers60fps() {
    if (this.shakeTimer > 0) this.shakeTimer--;
    if (this.cutinTimer > 0) this.cutinTimer--;
    if (this.popups && this.popups.length > 0) {
      for (let i = this.popups.length - 1; i >= 0; i--) {
        this.popups[i].timer--;
        if (this.popups[i].timer <= 0) {
          this.popups.splice(i, 1);
        }
      }
    }
  }

  updateEndAnim() {
    const anim = this.endAnim;
    if (!anim || anim.done) return;

    if (anim.timer > 0) {
      anim.timer--;
      return;
    }

    if (anim.type === 'gameover_fill') {
      if (anim.row < this.rows) {
        const r = anim.row;
        const gid = this.allocGroupId();
        for (let c = 0; c < this.cols; c++) {
          this.grid[r][c] = {
            type: 'garbage',
            state: 'normal',
            fallY: 0,
            timer: 0,
            groupId: gid,
            isHard: true,
            particleTimer: 18
          };
        }
        SE.play('falledBlock');
        this.shakeTimer = 6;
        anim.row++;
        anim.timer = anim.interval;
      } else if (anim.row === this.rows) {
        const gid = this.allocGroupId();
        this.nextRow = [];
        for (let c = 0; c < this.cols; c++) {
          this.nextRow.push({
            type: 'garbage',
            state: 'normal',
            fallY: 0,
            timer: 0,
            groupId: gid,
            isHard: true,
            particleTimer: 18
          });
        }
        SE.play('falledBlock');
        this.shakeTimer = 6;
        anim.row++;
        anim.timer = anim.interval;
      } else {
        this.shakeTimer = 0;
        anim.done = true;
        const cb = anim.onComplete;
        anim.onComplete = null;
        if (cb) cb();
      }
    } else if (anim.type === 'victory_clear') {
      if (anim.row < this.rows) {
        const r = anim.row;
        let hadBlock = false;
        for (let c = 0; c < this.cols; c++) {
          if (this.grid[r][c] !== null) hadBlock = true;
          this.grid[r][c] = null;
        }
        if (hadBlock && anim.row % 2 === 0) {
          SE.play('normalErase');
        }
        anim.row++;
        anim.timer = anim.interval;
      } else {
        this.nextRow = [];
        this.shakeTimer = 0;
        anim.done = true;
        const cb = anim.onComplete;
        anim.onComplete = null;
        if (cb) cb();
      }
    }
  }

  initGrid(initRows) {
    for (let r = this.rows - initRows; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) this.grid[r][c] = this.getRandomBlock(c, r);
    }
    this.nextRow = this.createNextRow();
  }

  pickWeightedColor(candidateConfigs) {
    let totalWeight = 0;
    candidateConfigs.forEach(conf => {
      totalWeight += conf.isSpecial ? 1 : 4;
    });
    let rnd = this.boardRng() * totalWeight;
    for (const conf of candidateConfigs) {
      const w = conf.isSpecial ? 1 : 4;
      if (rnd < w) return conf.id;
      rnd -= w;
    }
    return candidateConfigs[0].id;
  }

  getRandomBlock(c, r, avoidMatch = true) {
    let validConfigs = [...COLORS];
    if (avoidMatch) {
      if (c >= 2 && this.grid[r][c-1] && this.grid[r][c-2] && this.grid[r][c-1].type === this.grid[r][c-2].type) {
        validConfigs = validConfigs.filter(conf => conf.id !== this.grid[r][c-1].type);
      }
      if (r >= 2 && this.grid[r-1][c] && this.grid[r-2][c] && this.grid[r-1][c].type === this.grid[r-2][c].type) {
        validConfigs = validConfigs.filter(conf => conf.id !== this.grid[r-1][c].type);
      }
    }
    return { type: this.pickWeightedColor(validConfigs), state: 'normal', timer: 0, fallY: 0, chainEligible: false };
  }

  createNextRow() {
    const row = [];
    for (let c = 0; c < this.cols; c++) {
      let choices = [...COLORS];
      if (c >= 2 && row[c-1].type === row[c-2].type) {
        choices = choices.filter(conf => conf.id !== row[c-1].type);
      }
      row.push({ type: this.pickWeightedColor(choices), state: 'normal', timer: 0, fallY: 0, chainEligible: false });
    }
    return row;
  }

  swap(c, r) {
    if (this.endAnim) return false;
    if (this.gameOver && !this.isPractice) return false;
    if (matchState !== 'playing' && !this.isPractice) return false;
    if (this.purifyState && this.purifyState.active) return false;
    if (c < 0 || c >= this.cols - 1 || r < 0 || r >= this.rows) return false;
    const b1 = this.grid[r][c], b2 = this.grid[r][c + 1];
    
    const isFloating = (b, c_idx) => b && r < this.rows - 1 && this.grid[r+1][c_idx] === null;

    if (b1 && b1.state !== 'normal') return false;
    if (b2 && b2.state !== 'normal') return false;
    if (b1 && b1.type === 'garbage') return false;
    if (b2 && b2.type === 'garbage') return false;
    if (isFloating(b1, c) || isFloating(b2, c + 1)) return false;

    this.grid[r][c] = b2; this.grid[r][c + 1] = b1;
    
    if (this.grid[r][c]) {
       this.grid[r][c].chainEligible = false;
       this.grid[r][c].swapAnim = { dir: -1, timer: 3 };
    }
    if (this.grid[r][c+1]) {
       this.grid[r][c+1].chainEligible = false;
       this.grid[r][c+1].swapAnim = { dir: 1, timer: 3 };
    }

    // 60fps換算でワンテンポ遅く落とすホバー猶予 (11フレーム = 約0.183秒)
    if (this.grid[r][c] && r+1 < this.rows && this.grid[r+1][c] === null) { this.grid[r][c].state = 'hover'; this.grid[r][c].timer = 11; }
    if (this.grid[r][c+1] && r+1 < this.rows && this.grid[r+1][c+1] === null) { this.grid[r][c+1].state = 'hover'; this.grid[r][c+1].timer = 11; }

    if (this.onSwap) this.onSwap();
    this.checkMatches();
    return true;
  }

  manualRiseStep() {
    if (this.endAnim) return;
    if (this.gameOver && !this.isPractice) return;
    if (matchState !== 'playing' && !this.isPractice) return;
    if (this.purifyState && this.purifyState.active) return;
    this.stopTimer = 0; 
    this.riseOffset += 0.035; 
    if (this.riseOffset >= 1.0) this.pushNewRow();
  }

  pushNewRow() {
    this.riseOffset = 0;
    for (let r = 0; r < this.rows - 1; r++) this.grid[r] = this.grid[r + 1];
    this.grid[this.rows - 1] = this.nextRow;
    this.nextRow = this.createNextRow();
    if (this.cursor.y > 0) this.cursor.y--;
    if (this.onRowPushed) this.onRowPushed();
    this.checkMatches(); 
  }

  pushRowForPurifySkill() {
    this.riseOffset = 0;
    const topRow = this.grid[0];
    if (topRow && topRow.some(cell => cell !== null)) {
      this.purifyState.overflowRows.push(topRow);
    }
    for (let r = 0; r < this.rows - 1; r++) this.grid[r] = this.grid[r + 1];
    this.grid[this.rows - 1] = this.nextRow;
    this.nextRow = this.createNextRow();
    if (this.cursor.y > 0) this.cursor.y--;
    if (this.onRowPushed) this.onRowPushed();
  }

  startPurifySkill(riseSteps = 2, purifyFraction = 1.0) {
    if (this.purifyState && this.purifyState.active) return false;
    const garbageCells = [];
    for (let r = this.rows - 1; r >= 0; r--) {
      for (let c = 0; c < this.cols; c++) {
        const b = this.grid[r][c];
        if (b && b.type === 'garbage' && b.state !== 'match') {
          garbageCells.push(b);
        }
      }
    }
    if (garbageCells.length === 0) return false;

    const clampedFrac = Math.max(0.01, Math.min(1.0, purifyFraction));
    const targetCount = clampedFrac >= 0.999
      ? garbageCells.length
      : Math.max(1, Math.ceil(garbageCells.length * clampedFrac));

    for (let i = 0; i < targetCount; i++) {
      const b = garbageCells[i];
      b.state = 'purify_anim';
      b.purifyTimer = 46;
      b.purifyMax = 46;
      delete b.groupId;
      delete b.isHard;
      delete b.transformGroupId;
      delete b.transformDelay;
      delete b.isTarget;
      delete b.transformToNormal;
    }

    if (targetCount < garbageCells.length) {
      this.rebuildRemainingGarbageGroups();
    }

    const totalSteps = Math.max(0, Math.round(riseSteps));
    this.purifyState = {
      active: true,
      step: totalSteps >= 1 ? 'rise' : 'wait_anim',
      remainingRises: totalSteps,
      stepTimer: 0,
      animTimer: 46,
      overflowRows: []
    };
    SE.play('garbageErase');
    return true;
  }

  updatePurifySkill() {
    const ps = this.purifyState;
    if (!ps || !ps.active) return;

    if (ps.animTimer > 0) ps.animTimer--;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const b = this.grid[r][c];
        if (b && b.state === 'purify_anim' && b.purifyTimer > 0) {
          b.purifyTimer--;
        }
      }
    }
    ps.overflowRows.forEach(row => {
      row.forEach(b => {
        if (b && b.state === 'purify_anim' && b.purifyTimer > 0) {
          b.purifyTimer--;
        }
      });
    });

    if (ps.step === 'rise') {
      this.riseOffset += 0.11;
      if (this.riseOffset >= 1.0) {
        this.pushRowForPurifySkill();
        ps.remainingRises--;
        if (ps.remainingRises > 0) {
          ps.step = 'pause_between';
          ps.stepTimer = 5;
        } else {
          ps.step = 'wait_anim';
        }
      }
    } else if (ps.step === 'pause_between') {
      ps.stepTimer--;
      if (ps.stepTimer <= 0) {
        ps.step = 'rise';
      }
    } else if (ps.step === 'wait_anim') {
      if (ps.animTimer <= 0) {
        this.finishPurifySkill();
      }
    }
  }

  finishPurifySkill() {
    const ps = this.purifyState;
    if (!ps) return;

    const normalColors = COLORS.filter(col => !col.isSpecial);
    const convertToNormalFalling = (b) => {
      b.type = normalColors[Math.floor(Math.random() * normalColors.length)].id;
      b.state = 'fall';
      b.fallY = 0;
      b.timer = 0;
      b.chainEligible = true;
      b.particleTimer = 24;
      delete b.purifyTimer;
      delete b.purifyMax;
      delete b.groupId;
      delete b.isHard;
      delete b.transformGroupId;
    };

    if (ps.overflowRows.length > 0) {
      for (let i = ps.overflowRows.length - 1; i >= 0; i--) {
        const row = ps.overflowRows[i];
        for (let c = 0; c < this.cols; c++) {
          const b = row[c];
          if (!b) continue;
          if (b.state === 'purify_anim') convertToNormalFalling(b);
          else if (b.type === 'garbage') {
            b.state = 'fall';
            b.fallY = 0;
          }
          for (let r = this.rows - 1; r >= 0; r--) {
            if (this.grid[r][c] === null) {
              this.grid[r][c] = b;
              break;
            }
          }
        }
      }
    }

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const b = this.grid[r][c];
        if (b && b.state === 'purify_anim') {
          convertToNormalFalling(b);
        }
      }
    }

    this.rebuildRemainingGarbageGroups();
    this.purifyState = null;
    SE.play('garbageErase');
    this.checkMatches();
  }

  addGarbage(w, h, isHard = false, skipIncomingMult = false) { 
    let adjustedH = h;
    if (this.handicap === 1) adjustedH = Math.floor(h * 1.5);
    else if (this.handicap === 2) adjustedH = Math.floor(h * 1.25);
    else if (this.handicap === 4) adjustedH = Math.ceil(h * 0.75);
    else if (this.handicap === 5) adjustedH = Math.ceil(h * 0.5);

    const incMult = this.skillModifiers ? (this.skillModifiers.incomingGarbageMult || 1.0) : (this.isSacrifice ? 1.2 : 1.0);
    if (!skipIncomingMult && incMult > 1.0) {
      adjustedH = Math.ceil(adjustedH * incMult);
    }
    
    if (adjustedH < 1) adjustedH = 1;
    this.garbageQueue.push({ w, h: adjustedH, delay: 150, isHard }); 
  }

  spawnGarbage(g) {
    const groupId = this.allocGroupId();
    const startCol = g.startCol;
    const maxH = Math.min(this.rows, g.h);
    for (let r = 0; r < maxH; r++) {
      for (let c = 0; c < g.w; c++) {
        const actualCol = startCol + c;
        if (actualCol >= 0 && actualCol < this.cols) {
          this.grid[r][actualCol] = { type: 'garbage', state: 'fall', fallY: 0, timer: 0, groupId: groupId, isHard: g.isHard, particleTimer: 0 };
        }
      }
    }
  }

  transformGarbageNear(r, c) {
    const invalidGroupIds = new Set();
    for (let rr = 0; rr < this.rows; rr++) {
      for (let cc = 0; cc < this.cols; cc++) {
        const b = this.grid[rr][cc];
        if (b && b.type === 'garbage' && b.groupId && b.state !== 'normal') {
          invalidGroupIds.add(b.groupId);
        }
      }
    }

    let triggeredGroupIds = new Set();
    
    [[r-1,c],[r+1,c],[r,c-1],[r,c+1]].forEach(([nr, nc]) => {
      if (nr >= 0 && nr < this.rows && nc >= 0 && nc < this.cols) {
        const b = this.grid[nr][nc];
        if (b && b.type === 'garbage' && b.state === 'normal' && b.groupId && !invalidGroupIds.has(b.groupId)) {
          triggeredGroupIds.add(b.groupId);
        }
      }
    });

    if (triggeredGroupIds.size > 0) {
      let newlyAdded = true;
      while (newlyAdded) {
        newlyAdded = false;
        for (let rr = 0; rr < this.rows; rr++) {
          for (let cc = 0; cc < this.cols; cc++) {
            const b = this.grid[rr][cc];
            if (b && b.type === 'garbage' && b.state === 'normal' && triggeredGroupIds.has(b.groupId)) {
              [[rr-1,cc],[rr+1,cc],[rr,cc-1],[rr,cc+1]].forEach(([nr, nc]) => {
                if (nr >= 0 && nr < this.rows && nc >= 0 && nc < this.cols) {
                  const adjB = this.grid[nr][nc];
                  if (adjB && adjB.type === 'garbage' && adjB.state === 'normal' && adjB.groupId && !invalidGroupIds.has(adjB.groupId) && adjB.groupId !== b.groupId) {
                    if (!triggeredGroupIds.has(adjB.groupId)) {
                      triggeredGroupIds.add(adjB.groupId);
                      newlyAdded = true;
                    }
                  }
                }
              });
            }
          }
        }
      }

      let cells = [];
      for (let rr = 0; rr < this.rows; rr++) {
        for (let cc = 0; cc < this.cols; cc++) {
          const b = this.grid[rr][cc];
          if (b && b.type === 'garbage' && b.state === 'normal' && triggeredGroupIds.has(b.groupId)) {
            cells.push({r: rr, c: cc, b: b});
          }
        }
      }
      if (cells.length === 0) return;

      let groupMaxR = {};
      triggeredGroupIds.forEach(gid => {
        let rs = cells.filter(item => item.b.groupId === gid).map(item => item.r);
        if (rs.length > 0) {
          groupMaxR[gid] = Math.max(...rs);
        }
      });
      
      let uniqueRows = [...new Set(cells.map(item => item.r))].sort((a, b) => b - a);
      let orderedCells = [];
      uniqueRows.forEach((row, index) => {
        let rowCells = cells.filter(item => item.r === row);
        if (index % 2 === 0) {
          rowCells.sort((a, b) => b.c - a.c);
        } else {
          rowCells.sort((a, b) => a.c - b.c);
        }
        orderedCells.push(...rowCells);
      });

      const transformGroupId = this.allocGroupId();

      orderedCells.forEach((item, idx) => {
        let isGroupBottom = (item.r === groupMaxR[item.b.groupId]);
        
        item.b.state = 'transforming';
        item.b.transformDelay = Math.round(idx * 8 * 1.15);
        item.b.isTarget = isGroupBottom;
        item.b.transformToNormal = isGroupBottom && !item.b.isHard;
        item.b.transformGroupId = transformGroupId;
      });
    }
  }

  update(deltaTime = 1000/60) {
    this.updateVisualTimers60fps();

    if (this.endAnim) {
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          const b = this.grid[r][c];
          if (b && b.particleTimer > 0) b.particleTimer--;
        }
      }
      for (let c = 0; c < this.cols; c++) {
        const nb = this.nextRow[c];
        if (nb && nb.particleTimer > 0) nb.particleTimer--;
      }
      this.updateEndAnim();
      return;
    }

    if (this.gameOver && !this.isPractice) return;
    if (matchState !== 'playing' && !this.isPractice) return;

    if (this.purifyState && this.purifyState.active) {
      this.updatePurifySkill();
      return;
    }
    
    this.timeElapsed += deltaTime;

    const autoLoseMs = this.skillModifiers ? (this.skillModifiers.autoLoseMs || 0) : (this.isSacrifice ? 180000 : 0);
    if (autoLoseMs > 0 && !this.isPractice && this.timeElapsed >= autoLoseMs && !this.gameOver) {
      this.gameOver = true;
      this.startGameOverFillAnim();
      if (this.onStateChange) this.onStateChange('gameover');
      return;
    }

    const speedMult = this.skillModifiers ? (this.skillModifiers.riseSpeedMult || 1.0) : 1.0;
    if (this.timeElapsed > 30000 && !this.keepSpeed) {
      this.riseSpeed = this.baseRiseSpeed * speedMult * Math.pow(1.05, Math.floor((this.timeElapsed - 30000) / 20000));
    }

    let needsMatchCheck = false;
    let isMoving = false;
    let playedGarbageSE = false;
    let isErasing = false;

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const b = this.grid[r][c];
        if (b) {
           if (b.state === 'match' || b.state === 'transforming' || b.state === 'transforming_wait' || b.state === 'transformed_wait') {
              isErasing = true;
           }
           if (b.swapAnim) {
              b.swapAnim.timer--;
              if (b.swapAnim.timer <= 0) delete b.swapAnim;
           }
        }
      }
    }

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const b = this.grid[r][c];
        if (b && b.particleTimer > 0) b.particleTimer--;

        if (b && b.state === 'transforming') {
          isMoving = true;
          if (b.transformDelay > 0) b.transformDelay--;
          if (b.transformDelay <= 0) {
            if (b.isTarget) {
              if (b.transformToNormal) {
                const validConfigs = COLORS.filter(col => !col.isSpecial);
                b.type = validConfigs[Math.floor(Math.random() * validConfigs.length)].id;
                b.chainEligible = true;
                delete b.isHard;
              } else {
                b.isHard = false;
              }
              b.state = 'transformed_wait';
            } else {
              b.state = 'transforming_wait';
              b.particleTimer = 35;
            }

            if (!playedGarbageSE) {
              SE.play('garbageErase');
              playedGarbageSE = true;
            }
          }
        } else if (b && (b.state === 'transforming_wait' || b.state === 'transformed_wait')) {
          isMoving = true;
        }
      }
    }
    
    let transformGroups = new Map();
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const b = this.grid[r][c];
        if (b && b.transformGroupId) {
           if (!transformGroups.has(b.transformGroupId)) transformGroups.set(b.transformGroupId, []);
           transformGroups.get(b.transformGroupId).push(b);
        }
      }
    }

    transformGroups.forEach((blocks) => {
      const hasTransforming = blocks.some(b => b.state === 'transforming');
      if (!hasTransforming) {
        blocks.forEach(b => {
          if (b.state === 'transformed_wait' || b.state === 'transforming_wait') {
            b.state = 'hover';
            b.timer = 11;
            b.fallY = 0;
            if (typeof b.type === 'number') {
              delete b.groupId;
            }
            delete b.transformDelay;
            delete b.isTarget;
            delete b.transformToNormal;
            delete b.transformGroupId;
          }
        });
      }
    });

    let isTopFilled = false;
    for (let c = 0; c < this.cols; c++) {
      if (this.grid[0][c] !== null) { isTopFilled = true; break; }
    }

    let garbageBlocked = false;
    if (this.garbageQueue.length > 0) {
      if (!isErasing) {
        for (let i = 0; i < this.garbageQueue.length; i++) {
          if (this.garbageQueue[i].delay > 0) this.garbageQueue[i].delay--;
        }
      }
      if (!isMoving && this.garbageQueue[0].delay <= 0) {
        const g = this.garbageQueue[0];
        const getAvailHeightAt = (startC) => {
          let minAvail = this.rows;
          for (let c = 0; c < g.w; c++) {
            let colAvail = 0;
            for (let r = 0; r < this.rows; r++) {
              if (this.grid[r][startC + c] === null) colAvail++;
              else break;
            }
            if (colAvail < minAvail) minAvail = colAvail;
          }
          return minAvail;
        };

        if (g.startCol === undefined) g.startCol = Math.floor(Math.random() * (this.cols - g.w + 1));
        let availH = getAvailHeightAt(g.startCol);

        if (availH < g.h && g.w < this.cols) {
          let bestCol = g.startCol;
          let bestAvail = availH;
          for (let c = 0; c <= this.cols - g.w; c++) {
            const ah = getAvailHeightAt(c);
            if (ah > bestAvail) {
              bestAvail = ah;
              bestCol = c;
            }
          }
          if (bestAvail > availH) {
            g.startCol = bestCol;
            availH = bestAvail;
          }
        }

        if (availH >= g.h) {
          this.spawnGarbage(g);
          this.garbageQueue.shift();
          if (this.garbageQueue.length > 0 && this.garbageQueue[0].delay < 20) {
            this.garbageQueue[0].delay = 20;
          }
        } else if (availH >= 1) {
          this.spawnGarbage({ w: g.w, h: availH, startCol: g.startCol, isHard: g.isHard });
          g.h -= availH;
          g.delay = 20;
        } else {
          garbageBlocked = true;
        }
      }
    }

    if (isTopFilled || garbageBlocked) {
      if (!isMoving && !isErasing) {
        this.dangerTimer--;
        if (this.dangerTimer <= 0) {
          this.gameOver = true;
          if (!this.isPractice) {
            this.startGameOverFillAnim();
          }
          if (this.onStateChange) this.onStateChange('gameover');
          return;
        }
      }
    } else {
      this.dangerTimer = this.getMaxDangerTimer();
    }

    if (!isTopFilled && !garbageBlocked) {
      if (this.isRisingManualBtn || this.isRisingManualKey || this.isRisingManualPad) {
        this.manualRiseStep();
      } else {
        if (this.stopTimer > 0) this.stopTimer--;
        if (!isErasing && this.stopTimer <= 0) {
          this.riseOffset += this.riseSpeed;
          if (this.riseOffset >= 1.0) this.pushNewRow();
        }
      }
    }

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const b = this.grid[r][c];
        if (b && b.state === 'match') {
          isMoving = true; b.timer--;
          if (b.timer <= 0) {
            if (!b.skillErase) {
              this.transformGarbageNear(r, c);
            }
            this.grid[r][c] = null;
            
            for (let ur = r - 1; ur >= 0; ur--) {
              const ub = this.grid[ur][c];
              if (ub && ub.type !== 'garbage' && ub.state !== 'match'
                  && !ub.transformGroupId
                  && ub.state !== 'transforming' && ub.state !== 'transforming_wait' && ub.state !== 'transformed_wait') {
                ub.state = 'hover';
                ub.timer = 12;
                ub.chainEligible = true;
              } else {
                break;
              }
            }
            needsMatchCheck = true;
          }
        }
      }
    }

    const garbageGroups = new Map();
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const b = this.grid[r][c];
        if (b && b.type === 'garbage' && b.groupId) {
          if (!garbageGroups.has(b.groupId)) garbageGroups.set(b.groupId, []);
          garbageGroups.get(b.groupId).push({ r, c, block: b });
        }
      }
    }

    garbageGroups.forEach((cells, groupId) => {
      const hasTransforming = cells.some(item => 
        item.block.state === 'transforming' || 
        item.block.state === 'transforming_wait' || 
        item.block.state === 'transformed_wait'
      );
      if (hasTransforming) return;

      const leader = cells[0].block;

      if (leader.state === 'hover') {
        isMoving = true;
        leader.timer--;
        cells.forEach(item => item.block.timer = leader.timer);
        if (leader.timer <= 0) {
          cells.forEach(item => { item.block.state = 'fall'; item.block.fallY = 0; });
        }
      }

      if (leader.state === 'fall') {
        isMoving = true;
        let canFall = true;
        let blockedByMoving = false;
        for (const item of cells) {
          if (item.r + 1 >= this.rows) { canFall = false; break; }
          const below = this.grid[item.r + 1][item.c];
          if (below !== null && below.groupId !== groupId) {
            canFall = false;
            if (below.state === 'hover' || below.state === 'fall') {
              blockedByMoving = true;
            }
            break;
          }
        }

        if (!canFall) {
          if (blockedByMoving) {
            leader.fallY = 0;
            cells.forEach(item => { item.block.fallY = 0; });
          } else {
            cells.forEach(item => {
              item.block.state = 'normal';
              item.block.fallY = 0;
            });
            needsMatchCheck = true;
            if (this.onGarbageLanded) this.onGarbageLanded();
          }
        } else {
          leader.fallY += 0.50;
          cells.forEach(item => item.block.fallY = leader.fallY);
          if (leader.fallY >= 1.0) {
            cells.sort((a, b) => b.r - a.r);
            for (const item of cells) {
              this.grid[item.r + 1][item.c] = item.block;
              this.grid[item.r][item.c] = null;
              item.block.fallY = 0;
              item.r += 1;
            }
            leader.fallY = 0;
            let hitBottom = false;
            let hitMoving = false;
            for (const item of cells) {
              if (item.r + 1 >= this.rows) {
                hitBottom = true; break;
              }
              const below = this.grid[item.r + 1][item.c];
              if (below !== null && below.groupId !== groupId) {
                if (below.state === 'hover' || below.state === 'fall') {
                  hitMoving = true;
                } else {
                  hitBottom = true; break;
                }
              }
            }
            if (hitBottom && !hitMoving) {
              cells.forEach(item => {
                item.block.state = 'normal';
                item.block.fallY = 0;
              });
              needsMatchCheck = true;
              SE.play('falledBlock');
              this.shakeTimer = 15;
              if (this.onGarbageLanded) this.onGarbageLanded();
            }
          }
        }
      }

      if (leader.state === 'normal') {
        let supported = false;
        for (const item of cells) {
          if (item.r + 1 >= this.rows) { supported = true; break; }
          const below = this.grid[item.r + 1][item.c];
          if (below !== null && below.groupId !== groupId) { supported = true; break; }
        }
        if (!supported) {
          cells.forEach(item => {
            item.block.state = 'hover';
            item.block.timer = 11;
          });
        }
      }
    });

    for (let c = 0; c < this.cols; c++) {
      let r = this.rows - 1;
      while (r >= 0) {
        while (r >= 0 && (
          this.grid[r][c] === null || 
          this.grid[r][c].type === 'garbage' || 
          this.grid[r][c].state === 'match' ||
          this.grid[r][c].state === 'transforming' ||
          this.grid[r][c].state === 'transforming_wait' ||
          this.grid[r][c].state === 'transformed_wait' ||
          this.grid[r][c].transformGroupId
        )) {
          r--;
        }
        if (r < 0) break;

        let canFallOrFloating = false;
        if (r + 1 < this.rows) {
          const below = this.grid[r + 1][c];
          if (below === null) canFallOrFloating = true;
        }

        if (canFallOrFloating || this.grid[r][c].state === 'hover' || this.grid[r][c].state === 'fall') {
          let stack = [];
          let cur = r;
          while (cur >= 0 && this.grid[cur][c] && this.grid[cur][c].type !== 'garbage' && this.grid[cur][c].state !== 'match'
                && this.grid[cur][c].state !== 'transforming' && this.grid[cur][c].state !== 'transforming_wait' && this.grid[cur][c].state !== 'transformed_wait'
                && !this.grid[cur][c].transformGroupId) {
            stack.push({ r: cur, block: this.grid[cur][c] });
            cur--;
          }

          const leader = stack[0].block;
          const bottomR = stack[0].r;

          if (leader.state === 'normal') {
            leader.state = 'hover';
            leader.timer = 11;
          }

          for (const item of stack) item.block.state = leader.state;

          if (leader.state === 'hover') {
            isMoving = true;
            leader.timer--;
            for (const item of stack) item.block.timer = leader.timer;
            if (leader.timer <= 0) {
              for (const item of stack) { item.block.state = 'fall'; item.block.fallY = 0; }
            }
          } else if (leader.state === 'fall') {
            isMoving = true;
            let blocked = false;
            if (bottomR + 1 >= this.rows) blocked = true;
            else {
              const below = this.grid[bottomR + 1][c];
              if (below !== null && below.state !== 'fall') blocked = true;
            }

            if (blocked) {
              for (const item of stack) { item.block.state = 'normal'; item.block.fallY = 0; }
              needsMatchCheck = true;
            } else {
              leader.fallY += 0.50;
              for (const item of stack) item.block.fallY = leader.fallY;
              
              if (leader.fallY >= 1.0) {
                for (const item of stack) {
                  this.grid[item.r + 1][c] = item.block;
                  this.grid[item.r][c] = null;
                  item.block.fallY = 0;
                }
                if (bottomR + 2 >= this.rows || (this.grid[bottomR + 2][c] !== null && this.grid[bottomR + 2][c].state !== 'fall')) {
                  for (const item of stack) { item.block.state = 'normal'; item.block.fallY = 0; }
                  needsMatchCheck = true;
                }
              }
            }
          }
          r = cur;
        } else {
          this.grid[r][c].state = 'normal';
          this.grid[r][c].fallY = 0;
          r--;
        }
      }
    }

    if (needsMatchCheck) this.checkMatches();

    if (this.hasChainGraceEnabled() && this.chain >= 1 && !this.hasAnyMovingBlock()) {
      if (this.chainGraceTimer > 0) {
        this.chainGraceTimer--;
      }
      if (this.chainGraceTimer <= 0) {
        this.finishChain();
      }
    }
  }
  checkMatches() {
    let matchedPositions = new Set();
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols - 2; c++) {
        const b1 = this.grid[r][c];
        if (!b1 || b1.state !== 'normal' || b1.type === 'garbage') continue;
        let matchCount = 1;
        for (let k = 1; c + k < this.cols; k++) {
          const b2 = this.grid[r][c+k];
          if (b2 && b2.state === 'normal' && b2.type === b1.type) matchCount++;
          else break;
        }
        if (matchCount >= 3) {
          for (let k = 0; k < matchCount; k++) matchedPositions.add(`${r},${c+k}`);
        }
      }
    }
    for (let c = 0; c < this.cols; c++) {
      for (let r = 0; r < this.rows - 2; r++) {
        const b1 = this.grid[r][c];
        if (!b1 || b1.state !== 'normal' || b1.type === 'garbage') continue;
        let matchCount = 1;
        for (let k = 1; r + k < this.rows; k++) {
          const b2 = this.grid[r+k][c];
          if (b2 && b2.state === 'normal' && b2.type === b1.type) matchCount++;
          else break;
        }
        if (matchCount >= 3) {
          for (let k = 0; k < matchCount; k++) matchedPositions.add(`${r+k},${c}`);
        }
      }
    }

    if (matchedPositions.size > 0) {
      SE.play('normalErase');

      let chainActive = false;
      let hasSpecial = false;

      if (this.hasChainGraceEnabled() && this.chain >= 1 && this.chainGraceTimer > 0) {
        chainActive = true;
      }

      matchedPositions.forEach(pos => {
        const [r, c] = pos.split(',').map(Number);
        const block = this.grid[r][c];
        if (block.chainEligible) chainActive = true;
        if (COLORS.find(col => col.id === block.type)?.isSpecial) hasSpecial = true;
        block.state = 'match'; block.timer = 46;
      });

      if (chainActive) this.chain++; else this.chain = 1;
      if (this.hasChainGraceEnabled()) {
        this.chainGraceTimer = this.chainGraceMax;
      }

      if (!this.popups) this.popups = [];
      const coordsArray = Array.from(matchedPositions);
      
      if (this.chain >= 2) {
         const coords = coordsArray[0].split(',').map(Number);
         const rawX = coords[1] * CELL_PX + CELL_PX / 2;
         const rawY = coords[0] * CELL_PX + CELL_PX / 2;
         this.popups.push({
           text: `${this.chain}chain`,
           x: Math.max(34, Math.min(this.cols * CELL_PX - 34, rawX)),
           y: Math.max(20, rawY),
           timer: 38,
           initialTimer: 38,
           color: '#ffdf00',
           isNumber: false
         });
      }
      
      if (matchedPositions.size >= 4) {
         const coords = coordsArray[Math.floor(coordsArray.length / 2)].split(',').map(Number);
         const rawX = coords[1] * CELL_PX + CELL_PX / 2;
         let rawY = coords[0] * CELL_PX + CELL_PX / 2;
         if (this.chain >= 2) rawY += 18;
         this.popups.push({
           text: `${matchedPositions.size}`,
           x: Math.max(16, Math.min(this.cols * CELL_PX - 16, rawX)),
           y: Math.max(22, rawY),
           timer: 38,
           initialTimer: 38,
           color: '#00d4ff',
           isNumber: true
         });
      }

      let stopFrames = 0;
      if (this.chain >= 2) stopFrames += this.chain * 60;
      if (matchedPositions.size >= 4) stopFrames += (matchedPositions.size - 2) * 60;
      
      if (stopFrames > 0) {
         this.stopTimer = Math.max(this.stopTimer, stopFrames);
      } else {
         this.stopTimer = Math.max(this.stopTimer, 30);
      }

      this.score += matchedPositions.size * 10 * this.chain;

      const twoTierDrop = this.isSacrifice || (this.skillModifiers && this.skillModifiers.outgoingTwoTierDrop);
      let totalBlocks = 0;
      if (twoTierDrop) {
        if (this.chain >= 4) {
          totalBlocks += (this.chain - 3) * 6;
        }
        if (matchedPositions.size === 6) totalBlocks += 3;
        else if (matchedPositions.size >= 7) totalBlocks += 4;
      } else {
        if (this.chain >= 2) {
          totalBlocks += (this.chain - 1) * 6;
        }
        if (matchedPositions.size === 4) totalBlocks += 3;
        else if (matchedPositions.size === 5) totalBlocks += 4;
        else if (matchedPositions.size === 6) totalBlocks += 5;
        else if (matchedPositions.size >= 7) totalBlocks += 6;
      }

      if (totalBlocks > 0 && this.skillModifiers) {
        if (this.skillModifiers.outgoingGarbageMult < 1.0) {
          totalBlocks = Math.max(0, Math.floor(totalBlocks * this.skillModifiers.outgoingGarbageMult));
        }
        if (this.skillModifiers.outgoingGarbageFlatSub > 0) {
          totalBlocks = Math.max(0, totalBlocks - this.skillModifiers.outgoingGarbageFlatSub);
        }
      }

      if (hasSpecial) {
        totalBlocks += 6;
      }

      if (totalBlocks > 0 && this.onSendGarbage) {
        this.onSendGarbage(totalBlocks, hasSpecial);
      }
      if (this.chain >= 2 && this.onChainStep) {
        this.onChainStep(this.chain);
      }
      if (matchedPositions.size >= 4 && this.onSimultaneousMatch) {
        this.onSimultaneousMatch(matchedPositions.size);
      }
    } else {
      if (!this.hasAnyMovingBlock()) {
        if (this.hasChainGraceEnabled() && this.chain >= 1 && this.chainGraceTimer > 0) {
          return;
        }
        this.finishChain();
      }
    }
  }
}

// ==========================================
// GB風モード用：ブロック濃淡＆高視認性識別パターン定義
// ==========================================
const GB_BLOCK_PALETTE = {
  1: { bg: '#101010', text: '#ffffff', textStroke: '#000000', stroke: '#ffffff', accent: '#ffffff', pattern: 'solid_dark' },
  2: { bg: '#f8f8f8', text: '#0a0a0a', textStroke: '#ffffff', stroke: '#111111', accent: '#111111', pattern: 'solid_light' },
  3: { bg: '#424242', text: '#ffffff', textStroke: '#000000', stroke: '#ffffff', accent: '#f4f4f4', pattern: 'inner_white_box' },
  4: { bg: '#cecece', text: '#0a0a0a', textStroke: '#ffffff', stroke: '#111111', accent: '#141414', pattern: 'top_bottom_bars' },
  5: { bg: '#141414', text: '#0a0a0a', textStroke: '#f5f5f5', stroke: '#ffffff', accent: '#f5f5f5', pattern: 'white_circle_center' },
  6: { bg: '#f2f2f2', text: '#0a0a0a', textStroke: '#ffffff', stroke: '#111111', accent: '#111111', pattern: 'corner_triangles' },
  7: { bg: '#ffffff', text: '#000000', textStroke: '#ffffff', stroke: '#000000', accent: '#000000', pattern: 'special_frame' }
};

// --- 描画エンジン ---
class BoardRenderer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.canvas.width = COLS * CELL_PX;
    this.canvas.height = ROWS * CELL_PX + CELL_PX * 0.75; 
    this.theme = null;
  }

  isGbActive() {
    return (typeof isGbMode !== 'undefined' && isGbMode);
  }

  drawSacrificeAura(ctx, engine) {
    const hasAutoLose = engine.skillModifiers && engine.skillModifiers.autoLoseMs > 0;
    const hasGrace = engine.hasChainGraceEnabled && engine.hasChainGraceEnabled();
    if ((!engine.isSacrifice && !hasAutoLose && !hasGrace) || engine.endAnim) return;

    const W = this.canvas.width;
    const H = this.canvas.height;
    const t = Date.now() * 0.004;
    const pulse = 0.5 + 0.5 * Math.sin(t);
    const gb = this.isGbActive();

    ctx.save();
    if (engine.isSacrifice || hasAutoLose) {
      const edgeGrad = ctx.createRadialGradient(
        W / 2, H / 2, W * 0.22,
        W / 2, H / 2, Math.max(W, H) * 0.65
      );
      edgeGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
      edgeGrad.addColorStop(0.65, gb ? `rgba(30, 30, 30, ${0.22 + pulse * 0.14})` : `rgba(60, 0, 12, ${0.18 + pulse * 0.12})`);
      edgeGrad.addColorStop(1, gb ? `rgba(220, 220, 220, ${0.32 + pulse * 0.18})` : `rgba(185, 28, 28, ${0.38 + pulse * 0.18})`);
      ctx.fillStyle = edgeGrad;
      ctx.fillRect(0, 0, W, H);

      for (let i = 0; i < 8; i++) {
        const seed = i * 1.73;
        const px = ((Math.sin(seed * 3.1 + t * 0.5) * 0.5 + 0.5) * (W - 16)) + 8;
        const py = H - (((t * 38 + i * 54) % (H + 20)) - 10);
        const rad = 3 + (i % 3) * 2;
        ctx.fillStyle = gb
          ? (i % 2 === 0 ? 'rgba(220, 220, 220, 0.35)' : 'rgba(20, 20, 20, 0.45)')
          : (i % 2 === 0 ? 'rgba(220, 38, 38, 0.32)' : 'rgba(20, 0, 5, 0.45)');
        ctx.beginPath();
        ctx.arc(px, py, rad, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (engine.chain >= 1 && engine.chainGraceTimer > 0 && !engine.hasAnyMovingBlock()) {
      const ratio = Math.max(0, Math.min(1, engine.chainGraceTimer / (engine.chainGraceMax || 68)));
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.fillRect(4, 3, W - 8, 4);
      ctx.fillStyle = gb ? '#ffffff' : '#ffd700';
      ctx.fillRect(4, 3, (W - 8) * ratio, 4);
    }
    ctx.restore();
  }

  drawGbDotPattern(ctx, bx, by, bw, bh, radius, gbStyle) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(bx + 1, by + 1, bw - 2, bh - 2, Math.max(4, radius - 1));
    ctx.clip();

    if (gbStyle.pattern === 'solid_dark' || gbStyle.pattern === 'solid_light') {
      // ID 1 (♥), ID 2 (★): 中央が完全にクリーンな漆黒・純白ベタ（最速視認）
    } else if (gbStyle.pattern === 'inner_white_box') {
      // ID 3 (◆): 濃灰に内側白枠1本（中央はクリーン）
      ctx.strokeStyle = gbStyle.accent;
      ctx.lineWidth = 2.2;
      ctx.strokeRect(bx + 4, by + 4, bw - 8, bh - 8);
    } else if (gbStyle.pattern === 'top_bottom_bars') {
      // ID 4 (♣): 明灰の上下端に太い黒バー（中央はクリーン）
      ctx.fillStyle = gbStyle.accent;
      ctx.fillRect(bx, by, bw, 4.5);
      ctx.fillRect(bx, by + bh - 4.5, bw, 4.5);
    } else if (gbStyle.pattern === 'white_circle_center') {
      // ID 5 (▲): 黒ベースの中央にくっきり白丸座布団（黒記号が際立つ）
      ctx.fillStyle = gbStyle.accent;
      ctx.beginPath();
      ctx.arc(bx + bw / 2, by + bh / 2, Math.min(bw, bh) * 0.37, 0, Math.PI * 2);
      ctx.fill();
    } else if (gbStyle.pattern === 'corner_triangles') {
      // ID 6 (●): 白ベース＋四隅の黒三角コーナー（中央はクリーン）
      ctx.fillStyle = gbStyle.accent;
      const cSize = 8;
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + cSize, by); ctx.lineTo(bx, by + cSize); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(bx + bw, by); ctx.lineTo(bx + bw - cSize, by); ctx.lineTo(bx + bw, by + cSize); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(bx, by + bh); ctx.lineTo(bx + cSize, by + bh); ctx.lineTo(bx, by + bh - cSize); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(bx + bw, by + bh); ctx.lineTo(bx + bw - cSize, by + bh); ctx.lineTo(bx + bw, by + bh - cSize); ctx.closePath(); ctx.fill();
    } else if (gbStyle.pattern === 'special_frame') {
      // ID 7 (！): 二重太枠
      ctx.strokeStyle = gbStyle.accent;
      ctx.lineWidth = 2.4;
      ctx.strokeRect(bx + 4, by + 4, bw - 8, bh - 8);
    }
    ctx.restore();
  }

  drawPanelBlock(ctx, x, y, conf, isFlashing, bounceY = 0, isNextRow = false, matchTimer = 0) {
    const pad = 2;
    const bx = x + pad;
    const by = y + pad;
    const bw = CELL_PX - pad * 2;
    const bh = CELL_PX - pad * 2;
    const radius = 7;
    const gb = this.isGbActive();
    const gbStyle = gb ? (GB_BLOCK_PALETTE[conf.id] || GB_BLOCK_PALETTE[3]) : null;

    ctx.save();
    if (isNextRow) {
      ctx.globalAlpha = gb ? 0.36 : 0.42;
    }

    if (matchTimer > 0 && matchTimer <= 12) {
      const scale = 1.0 + (12 - matchTimer) * 0.014;
      ctx.translate(x + CELL_PX / 2, y + CELL_PX / 2);
      ctx.scale(scale, scale);
      ctx.translate(-(x + CELL_PX / 2), -(y + CELL_PX / 2));
    }

    if (gb) {
      ctx.fillStyle = isFlashing ? '#ffffff' : gbStyle.bg;
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, radius);
      ctx.fill();

      if (!isFlashing) {
        this.drawGbDotPattern(ctx, bx, by, bw, bh, radius, gbStyle);
        ctx.strokeStyle = gbStyle.stroke;
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        ctx.roundRect(bx + 0.8, by + 0.8, bw - 1.6, bh - 1.6, Math.max(4, radius - 1));
        ctx.stroke();
      } else {
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.roundRect(bx + 1, by + 1, bw - 2, bh - 2, radius);
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = isFlashing ? '#94a3b8' : conf.bg;
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, radius);
      ctx.fill();

      if (!isFlashing) {
        const topGrad = ctx.createLinearGradient(bx, by, bx, by + bh);
        topGrad.addColorStop(0, 'rgba(255, 255, 255, 0.42)');
        topGrad.addColorStop(0.42, 'rgba(255, 255, 255, 0.08)');
        topGrad.addColorStop(0.55, 'rgba(0, 0, 0, 0.0)');
        topGrad.addColorStop(1, 'rgba(0, 0, 0, 0.34)');
        ctx.fillStyle = topGrad;
        ctx.beginPath();
        ctx.roundRect(bx, by, bw, bh, radius);
        ctx.fill();

        ctx.strokeStyle = conf.isSpecial ? 'rgba(0, 0, 0, 0.25)' : 'rgba(255, 255, 255, 0.36)';
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.roundRect(bx + 1.5, by + 1.5, bw - 3, bh - 3, Math.max(4, radius - 2));
        ctx.stroke();
      } else {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(bx + 1, by + 1, bw - 2, bh - 2, radius);
        ctx.stroke();
      }
    }

    if (isNextRow) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, radius);
      ctx.fill();
    }

    const cx = x + CELL_PX / 2;
    const cy = y + CELL_PX / 2 + bounceY;
    ctx.font = gb ? '900 18px sans-serif' : 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (gb) {
      if (!isFlashing) {
        if (gbStyle.pattern === 'inner_white_box') {
          ctx.lineJoin = 'round';
          ctx.lineWidth = 3.2;
          ctx.strokeStyle = gbStyle.textStroke;
          ctx.strokeText(conf.symbol, cx, cy);
        }
        ctx.fillStyle = gbStyle.text;
        ctx.fillText(conf.symbol, cx, cy);
      } else {
        ctx.fillStyle = '#000000';
        ctx.fillText(conf.symbol, cx, cy);
      }
    } else {
      if (!isFlashing && !conf.isSpecial) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.fillText(conf.symbol, cx, cy + 1.5);
      }
      ctx.fillStyle = isFlashing ? '#ffffff' : (conf.textColor || '#ffffff');
      ctx.fillText(conf.symbol, cx, cy);
    }

    ctx.restore();
  }

  drawMatchParticles(ctx, engine, offsetY) {
    const dirs = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    const gb = this.isGbActive();
    for (let r = 0; r < engine.rows; r++) {
      for (let c = 0; c < engine.cols; c++) {
        const b = engine.grid[r][c];
        if (!b || b.state !== 'match' || b.timer > 16 || b.timer <= 0) continue;

        const p = (16 - b.timer) / 16;
        const cx = c * CELL_PX + CELL_PX / 2;
        const cy = r * CELL_PX - offsetY + (b.fallY * CELL_PX) + CELL_PX / 2;
        const conf = b.type === 'garbage' ? null : COLORS.find(item => item.id === b.type);
        const color = gb ? '#d4d4d4' : (conf ? conf.bg : '#e2e8f0');

        const dist = CELL_PX * 0.34 + p * (CELL_PX * 0.40);
        const size = Math.max(2.0, (1 - p * 0.55) * 5.8);
        const alpha = Math.max(0, 1 - p * 0.92);

        ctx.save();
        ctx.globalAlpha = alpha;
        dirs.forEach(([dx, dy]) => {
          const px = cx + dx * dist;
          const py = cy + dy * dist;

          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.moveTo(px, py - size);
          ctx.lineTo(px + size, py);
          ctx.lineTo(px, py + size);
          ctx.lineTo(px - size, py);
          ctx.closePath();
          ctx.fill();

          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(px, py, size * 0.42, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.restore();
      }
    }
  }

  drawGarbageCell(ctx, x, y, b, sameTop, sameBottom, sameLeft, sameRight) {
    const isFlashing = (b.state === 'match' && Math.floor(b.timer / 4) % 2 === 0);
    const gb = this.isGbActive();
    ctx.fillStyle = isFlashing
      ? '#ffffff'
      : (gb ? (b.isHard ? '#c8c8c8' : '#585858') : (b.isHard ? '#a8b2bd' : '#5c636a'));
    ctx.fillRect(x, y, CELL_PX, CELL_PX);

    if (!isFlashing) {
      if (gb) {
        ctx.fillStyle = b.isHard ? 'rgba(0, 0, 0, 0.16)' : 'rgba(255, 255, 255, 0.16)';
        for (let py = y + 3; py < y + CELL_PX - 2; py += 4) {
          const sh = (((py - y) / 4) % 2) * 2;
          for (let px = x + 3 + sh; px < x + CELL_PX - 2; px += 4) {
            ctx.fillRect(px, py, 1.5, 1.5);
          }
        }
      } else {
        const gGrad = ctx.createLinearGradient(x, y, x, y + CELL_PX);
        gGrad.addColorStop(0, 'rgba(255, 255, 255, 0.18)');
        gGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.0)');
        gGrad.addColorStop(1, 'rgba(0, 0, 0, 0.28)');
        ctx.fillStyle = gGrad;
        ctx.fillRect(x, y, CELL_PX, CELL_PX);
      }
    }

    ctx.strokeStyle = gb ? (b.isHard ? '#111111' : '#f0f0f0') : '#dee2e6';
    ctx.lineWidth = gb ? 2.4 : 2;
    ctx.beginPath();
    if (!sameTop) { ctx.moveTo(x, y + 1); ctx.lineTo(x + CELL_PX, y + 1); }
    if (!sameBottom) { ctx.moveTo(x, y + CELL_PX - 1); ctx.lineTo(x + CELL_PX, y + CELL_PX - 1); }
    if (!sameLeft) { ctx.moveTo(x + 1, y); ctx.lineTo(x + 1, y + CELL_PX); }
    if (!sameRight) { ctx.moveTo(x + CELL_PX - 1, y); ctx.lineTo(x + CELL_PX - 1, y + CELL_PX); }
    ctx.stroke();

    if (!isFlashing) {
      ctx.fillStyle = gb ? (b.isHard ? '#111111' : '#ffffff') : 'rgba(255, 255, 255, 0.35)';
      if (!sameTop && !sameLeft) { ctx.beginPath(); ctx.arc(x + 5, y + 5, 1.8, 0, Math.PI * 2); ctx.fill(); }
      if (!sameTop && !sameRight) { ctx.beginPath(); ctx.arc(x + CELL_PX - 5, y + 5, 1.8, 0, Math.PI * 2); ctx.fill(); }
      if (!sameBottom && !sameLeft) { ctx.beginPath(); ctx.arc(x + 5, y + CELL_PX - 5, 1.8, 0, Math.PI * 2); ctx.fill(); }
      if (!sameBottom && !sameRight) { ctx.beginPath(); ctx.arc(x + CELL_PX - 5, y + CELL_PX - 5, 1.8, 0, Math.PI * 2); ctx.fill(); }
    }

    if (b.isHard) {
      ctx.strokeStyle = gb ? '#111111' : 'rgba(15, 15, 15, 0.45)';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(x + CELL_PX * 0.25, y + CELL_PX * 0.25);
      ctx.lineTo(x + CELL_PX * 0.75, y + CELL_PX * 0.75);
      ctx.moveTo(x + CELL_PX * 0.75, y + CELL_PX * 0.25);
      ctx.lineTo(x + CELL_PX * 0.25, y + CELL_PX * 0.75);
      ctx.stroke();

      ctx.strokeStyle = gb ? '#ffffff' : 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(x + CELL_PX * 0.25, y + CELL_PX * 0.25);
      ctx.lineTo(x + CELL_PX * 0.75, y + CELL_PX * 0.75);
      ctx.moveTo(x + CELL_PX * 0.75, y + CELL_PX * 0.25);
      ctx.lineTo(x + CELL_PX * 0.25, y + CELL_PX * 0.75);
      ctx.stroke();
    } else if (!gb) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.beginPath();
      ctx.arc(x + CELL_PX / 2, y + CELL_PX / 2, CELL_PX / 4, 0, Math.PI * 2);
      ctx.fill();
    }

    if (b.state === 'transforming') {
      if (b.transformDelay < 13) {
        ctx.fillStyle = `rgba(255, 255, 255, ${(13 - b.transformDelay) / 13})`;
        ctx.fillRect(x, y, CELL_PX, CELL_PX);
      }
    }

    if (b.particleTimer > 0) {
      ctx.fillStyle = `rgba(255, 255, 255, ${b.particleTimer / 35})`;
      ctx.fillRect(x, y, CELL_PX, CELL_PX);
    }
  }

  draw(engine) {
    const ctx = this.ctx;
    const gb = this.isGbActive();
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (typeof drawBoardBgAddon === 'function') drawBoardBgAddon(ctx, this.canvas, engine, this);
    this.drawSacrificeAura(ctx, engine);

    const isGameOverSettled = engine.gameOver && !engine.isPractice && (!engine.endAnim || engine.endAnim.done);

    ctx.save();
    if (engine.shakeTimer > 0 && !isGameOverSettled) {
       const shakeOffsetX = (Math.random() - 0.5) * 8;
       const shakeOffsetY = (Math.random() - 0.5) * 8;
       ctx.translate(shakeOffsetX, shakeOffsetY);
    }

    const offsetY = engine.riseOffset * CELL_PX;

    let highestR = engine.rows;
    for (let c = 0; c < engine.cols; c++) {
      for (let r = 0; r < engine.rows; r++) {
        if (engine.grid[r][c] !== null && engine.grid[r][c].type !== 'garbage') {
          if (r < highestR) highestR = r;
          break;
        }
      }
    }
    let highestCols = new Set();
    let isEnginePanic = !engine.endAnim && (highestR - engine.riseOffset) <= (engine.rows * 0.3);

    if (isEnginePanic) {
       for (let c = 0; c < engine.cols; c++) {
         for (let r = 0; r < engine.rows; r++) {
           if (engine.grid[r][c] !== null && engine.grid[r][c].type !== 'garbage') {
             if (r === highestR) highestCols.add(c);
             break;
           }
         }
       }
    }

    if (isEnginePanic) {
      const warnAlpha = 0.14 + Math.sin(Date.now() / 140) * 0.08;
      const warnGrad = ctx.createLinearGradient(0, 0, 0, CELL_PX * 2.5);
      warnGrad.addColorStop(0, gb ? `rgba(255, 255, 255, ${warnAlpha + 0.08})` : `rgba(255, 0, 85, ${warnAlpha})`);
      warnGrad.addColorStop(1, gb ? 'rgba(255, 255, 255, 0)' : 'rgba(255, 0, 85, 0)');
      ctx.fillStyle = warnGrad;
      ctx.fillRect(0, 0, this.canvas.width, CELL_PX * 2.5);
    }

    for (let r = 0; r < engine.rows; r++) {
      for (let c = 0; c < engine.cols; c++) {
        const b = engine.grid[r][c];
        if (b) {
          let drawX = c * CELL_PX;
          if (b.swapAnim) {
             drawX += -(b.swapAnim.dir) * (b.swapAnim.timer / 3) * CELL_PX;
          }
          const x = drawX;
          const y = r * CELL_PX - offsetY + (b.fallY * CELL_PX);

          if (b.type === 'garbage') {
            if (b.state === 'purify_anim') {
              const pMax = b.purifyMax || 46;
              const remRatio = Math.max(0, (b.purifyTimer || 0) / pMax);
              const progress = 1 - remRatio;
              const isFlash = Math.floor((b.purifyTimer || 0) / 3) % 2 === 0;
              const shrink = progress * (CELL_PX * 0.24);
              ctx.save();
              ctx.globalAlpha = Math.max(0.12, remRatio);
              ctx.fillStyle = isFlash ? '#ffffff' : (gb ? '#a3a3a3' : '#4ecca3');
              ctx.fillRect(x + shrink, y + shrink, CELL_PX - shrink * 2, CELL_PX - shrink * 2);
              ctx.strokeStyle = gb ? '#ffffff' : '#ffd700';
              ctx.lineWidth = 2;
              ctx.strokeRect(x + shrink + 1, y + shrink + 1, CELL_PX - shrink * 2 - 2, CELL_PX - shrink * 2 - 2);
              ctx.restore();
            } else {
              const sameTop = b.groupId && r > 0 && engine.grid[r-1][c] && engine.grid[r-1][c].groupId === b.groupId;
              const sameBottom = b.groupId && r < engine.rows-1 && engine.grid[r+1][c] && engine.grid[r+1][c].groupId === b.groupId;
              const sameLeft = b.groupId && c > 0 && engine.grid[r][c-1] && engine.grid[r][c-1].groupId === b.groupId;
              const sameRight = b.groupId && c < engine.cols-1 && engine.grid[r][c+1] && engine.grid[r][c+1].groupId === b.groupId;
              this.drawGarbageCell(ctx, x, y, b, sameTop, sameBottom, sameLeft, sameRight);
            }
          } else {
            const conf = COLORS.find(item => item.id === b.type);
            if (conf) {
              const isFlashing = (b.state === 'match' && Math.floor(b.timer / 4) % 2 === 0);
              const isHighestCol = isEnginePanic && highestCols.has(c);
              const time = Date.now();
              const bounceY = isHighestCol ? Math.sin(time / 60 + c) * 3 : 0;
              const matchTimer = (b.state === 'match') ? b.timer : 0;
              this.drawPanelBlock(ctx, x, y, conf, isFlashing, bounceY, false, matchTimer);
            }
          }
        }
      }
    }

    const nextRowY = engine.rows * CELL_PX - offsetY;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, nextRowY);
    ctx.lineTo(this.canvas.width, nextRowY);
    ctx.stroke();

    for (let c = 0; c < engine.cols; c++) {
      const b = engine.nextRow[c];
      if (b) {
        const x = c * CELL_PX;
        const y = nextRowY;
        if (b.type === 'garbage') {
          const sameLeft = b.groupId && c > 0 && engine.nextRow[c-1] && engine.nextRow[c-1].groupId === b.groupId;
          const sameRight = b.groupId && c < engine.cols-1 && engine.nextRow[c+1] && engine.nextRow[c+1].groupId === b.groupId;
          this.drawGarbageCell(ctx, x, y, b, false, false, sameLeft, sameRight);
        } else {
          const conf = COLORS.find(item => item.id === b.type);
          if (conf) {
            this.drawPanelBlock(ctx, x, y, conf, false, 0, true, 0);
          }
        }
      }
    }

    this.drawMatchParticles(ctx, engine, offsetY);

    if (!engine.endAnim) {
      const cx = engine.cursor.x * CELL_PX - 2;
      const cy = engine.cursor.y * CELL_PX - offsetY - 2;
      const cw = CELL_PX * 2 + 4;
      const ch = CELL_PX + 4;
      ctx.save();
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.lineWidth = 5;
      ctx.strokeRect(cx, cy, cw, ch);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(cx, cy, cw, ch);
      ctx.restore();
    }

    if (engine.popups) {
      for (let i = 0; i < engine.popups.length; i++) {
        const p = engine.popups[i];
        if (p.timer <= 0) continue;
        const progress = 1 - p.timer / p.initialTimer;
        const floatY = progress * 22;
        ctx.globalAlpha = Math.max(0, p.timer / 15); 
        ctx.fillStyle = gb ? '#ffffff' : (p.color || '#ffdf00'); 
        ctx.font = p.isNumber ? 'bold 24px sans-serif' : 'bold 18px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 3;
        ctx.strokeStyle = gb ? '#000000' : '#0f172a'; 
        ctx.strokeText(p.text, p.x, p.y - offsetY - floatY);
        ctx.fillText(p.text, p.x, p.y - offsetY - floatY);
        ctx.globalAlpha = 1.0;
      }
    }

    if (typeof drawBoardFgAddon === 'function') drawBoardFgAddon(ctx, this.canvas, engine, this);

    const isEndAnimRunning = engine.endAnim && !engine.endAnim.done;
    const isVictoryAnim = engine.endAnim && engine.endAnim.type === 'victory_clear';
    if (engine.gameOver && !engine.isPractice && !isEndAnimRunning && !isVictoryAnim) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.fillStyle = gb ? '#ffffff' : '#ff3366';
      ctx.font = 'bold 22px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('GAME OVER', this.canvas.width/2, this.canvas.height/2);
    }
    
    ctx.restore();
  }
}

// --- COM(AI) エンジン（個体ごとの性格・重み差・確率的候補選択・ランダム手混合対応） ---
class ComAI {
  constructor(engine, level, id) {
    this.engine = engine;
    this.level = Math.max(1, Math.min(99, parseInt(level, 10) || 1));
    this.id = id;
    this.target = null;

    if (this.level <= 50) {
      this.thinkInterval = Math.max(2, Math.round(16 - ((this.level - 1) / 49) * 13));
      this.moveInterval = Math.max(1, Math.round(7 - ((this.level - 1) / 49) * 5.5));
    } else {
      this.thinkInterval = Math.max(1, Math.round(3 - ((this.level - 50) / 49) * 2));
      this.moveInterval = 1;
    }

    if (this.level <= 15) {
      this.searchDepth = 1;
      this.beamWidth = 5;
    } else if (this.level <= 35) {
      this.searchDepth = 2;
      this.beamWidth = 7;
    } else if (this.level <= 55) {
      this.searchDepth = 3;
      this.beamWidth = 10;
    } else if (this.level <= 75) {
      this.searchDepth = 4;
      this.beamWidth = 12;
    } else {
      this.searchDepth = 5;
      this.beamWidth = 14;
    }

    this.actionTimer = this.thinkInterval + Math.floor(Math.random() * 7);
    this.moveTimer = 0;

    this.engine.baseRiseSpeed = 0.0009 + this.level * 0.000018;
    this.engine.riseSpeed = this.engine.baseRiseSpeed;

    this.riseTryProb = Math.max(0.18, Math.min(0.98, 0.28 + (this.level / 50) * 0.58 + (Math.random() - 0.5) * 0.18));
    this.topChoiceNoise = Math.max(0.05, (45 - this.level) * 0.006);

    const patterns = ['small_chain', 'big_chain', 'multi_match', 'survival', 'tricky'];
    this.pattern = patterns[Math.floor(Math.random() * patterns.length)];

    const lvRatio = (this.level - 1) / 98;
    this.styleWeights = {
      chainWeight: this.pattern === 'big_chain'
        ? (128 + Math.random() * 45)
        : (this.pattern === 'small_chain' ? (70 + Math.random() * 28) : (85 + Math.random() * 38)),
      clearWeight: this.pattern === 'multi_match'
        ? (54 + Math.random() * 24)
        : (36 + Math.random() * 20),
      sentWeight: this.pattern === 'survival'
        ? (92 + Math.random() * 28)
        : (118 + Math.random() * 38),
      heightBonus: this.pattern === 'survival'
        ? (84 + Math.random() * 34)
        : (46 + Math.random() * 28),
      bumpPenalty: 7 + Math.random() * 9,
      holePenalty: 14 + Math.random() * 14,
      evalNoise: Math.max(12, (106 - this.level) * 1.55) * (0.75 + Math.random() * 0.65)
    };

    this.altBestProb = Math.max(0.12, Math.min(0.56, 0.48 - lvRatio * 0.34 + (Math.random() - 0.5) * 0.10));
    this.randomMoveProb = Math.max(0.04, Math.min(0.32, 0.24 - lvRatio * 0.19 + (Math.random() - 0.5) * 0.06));

    this.movePlan = [];
    this.planSignature = '';
    this.recentSwaps = [];
    this.frameCount = 0;
    this.risingTargetMaxH = 0;
    this.riseCooldown = Math.floor(Math.random() * 18);
  }

  getNextThinkDelay() {
    const jitter = this.level >= 75
      ? (Math.random() < 0.28 ? 1 : 0)
      : Math.floor(Math.random() * 3);
    return this.thinkInterval + jitter;
  }

  canSwapAt(r, c) {
    const grid = this.engine.grid;
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS - 1) return false;
    const b1 = grid[r][c];
    const b2 = grid[r][c + 1];
    if (!b1 && !b2) return false;
    if (b1 && (b1.state !== 'normal' || b1.type === 'garbage')) return false;
    if (b2 && (b2.state !== 'normal' || b2.type === 'garbage')) return false;
    if (b1 && b2 && b1.type === b2.type) return false;
    if (b1 && r < ROWS - 1 && grid[r + 1][c] === null) return false;
    if (b2 && r < ROWS - 1 && grid[r + 1][c + 1] === null) return false;
    return true;
  }

  captureSnapshot() {
    const grid = this.engine.grid;
    const board = new Int8Array(ROWS * COLS);
    const locked = new Uint8Array(ROWS * COLS);
    const colHeights = new Int8Array(COLS);
    let maxH = 0;
    let garbageCount = 0;
    let sigParts = [];

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const idx = r * COLS + c;
        const b = grid[r][c];
        if (!b) {
          board[idx] = 0;
          sigParts.push('0');
        } else {
          const h = ROWS - r;
          if (h > colHeights[c]) colHeights[c] = h;
          if (h > maxH) maxH = h;

          if (b.type === 'garbage') {
            board[idx] = b.isHard ? -2 : -1;
            locked[idx] = 1;
            garbageCount++;
            sigParts.push(b.isHard ? 'H' : 'G');
          } else {
            board[idx] = b.type;
            if (b.state !== 'normal' || b.transformGroupId) {
              locked[idx] = 1;
            }
            sigParts.push(String(b.type));
          }
        }
      }
    }

    let pendingGarbageH = 0;
    let minGarbageDelay = 9999;
    const q = this.engine.garbageQueue || [];
    for (let i = 0; i < q.length; i++) {
      const g = q[i];
      pendingGarbageH += (g.w >= 4 ? g.h : Math.ceil(g.h * 0.6));
      if (g.delay < minGarbageDelay) minGarbageDelay = g.delay;
    }

    const effMaxH = maxH + (minGarbageDelay <= 120 ? pendingGarbageH : Math.ceil(pendingGarbageH * 0.6));
    const isPinch = (maxH >= 9)
      || (effMaxH >= 10)
      || (this.engine.dangerTimer < 165)
      || (maxH >= 7 && pendingGarbageH >= 2 && minGarbageDelay <= 95);

    return {
      board,
      locked,
      colHeights,
      maxH,
      garbageCount,
      pendingGarbageH,
      minGarbageDelay,
      effMaxH,
      isPinch,
      signature: sigParts.join('')
    };
  }

  simApplySwap(boardIn, lockedIn, r, c) {
    const idx1 = r * COLS + c;
    const idx2 = idx1 + 1;
    if (lockedIn && (lockedIn[idx1] || lockedIn[idx2])) return null;

    const v1 = boardIn[idx1];
    const v2 = boardIn[idx2];
    if (v1 === 0 && v2 === 0) return null;
    if (v1 < 0 || v2 < 0) return null;
    if (v1 === v2) return null;
    if (r < ROWS - 1) {
      if (v1 > 0 && boardIn[(r + 1) * COLS + c] === 0) return null;
      if (v2 > 0 && boardIn[(r + 1) * COLS + c + 1] === 0) return null;
    }

    const b = new Int8Array(boardIn);
    b[idx1] = v2;
    b[idx2] = v1;

    let totalCleared = 0;
    let maxChain = 0;
    let totalSentEstimate = 0;
    let garbageThawed = 0;
    let hardGarbageHit = 0;
    let specialCleared = 0;
    let minClearedRow = ROWS;

    for (let step = 0; step < 8; step++) {
      let moved = true;
      while (moved) {
        moved = false;
        for (let rr = ROWS - 2; rr >= 0; rr--) {
          let cc = 0;
          while (cc < COLS) {
            const val = b[rr * COLS + cc];
            if (val > 0) {
              if (!lockedIn || !lockedIn[rr * COLS + cc]) {
                if (b[(rr + 1) * COLS + cc] === 0) {
                  b[(rr + 1) * COLS + cc] = val;
                  b[rr * COLS + cc] = 0;
                  moved = true;
                }
              }
              cc++;
            } else if (val < 0) {
              let endC = cc + 1;
              while (endC < COLS && b[rr * COLS + endC] < 0) endC++;
              let canDrop = true;
              for (let k = cc; k < endC; k++) {
                if (b[(rr + 1) * COLS + k] !== 0) {
                  canDrop = false;
                  break;
                }
              }
              if (canDrop) {
                for (let k = cc; k < endC; k++) {
                  b[(rr + 1) * COLS + k] = b[rr * COLS + k];
                  b[rr * COLS + k] = 0;
                }
                moved = true;
              }
              cc = endC;
            } else {
              cc++;
            }
          }
        }
      }

      const matched = new Uint8Array(ROWS * COLS);
      let matchCount = 0;

      for (let rr = 0; rr < ROWS; rr++) {
        for (let cc = 0; cc < COLS - 2; cc++) {
          const v = b[rr * COLS + cc];
          if (v <= 0) continue;
          if (lockedIn && step === 0 && lockedIn[rr * COLS + cc]) continue;
          let len = 1;
          while (cc + len < COLS && b[rr * COLS + cc + len] === v && !(lockedIn && step === 0 && lockedIn[rr * COLS + cc + len])) {
            len++;
          }
          if (len >= 3) {
            for (let k = 0; k < len; k++) matched[rr * COLS + cc + k] = 1;
          }
        }
      }
      for (let cc = 0; cc < COLS; cc++) {
        for (let rr = 0; rr < ROWS - 2; rr++) {
          const v = b[rr * COLS + cc];
          if (v <= 0) continue;
          if (lockedIn && step === 0 && lockedIn[rr * COLS + cc]) continue;
          let len = 1;
          while (rr + len < ROWS && b[(rr + len) * COLS + cc] === v && !(lockedIn && step === 0 && lockedIn[(rr + len) * COLS + cc])) {
            len++;
          }
          if (len >= 3) {
            for (let k = 0; k < len; k++) matched[(rr + k) * COLS + cc] = 1;
          }
        }
      }

      for (let i = 0; i < ROWS * COLS; i++) {
        if (matched[i]) matchCount++;
      }
      if (matchCount === 0) break;

      maxChain++;
      totalCleared += matchCount;

      if (maxChain >= 2) totalSentEstimate += 6;
      if (matchCount === 4) totalSentEstimate += 3;
      else if (matchCount === 5) totalSentEstimate += 4;
      else if (matchCount === 6) totalSentEstimate += 5;
      else if (matchCount >= 7) totalSentEstimate += 6;

      const thawVisited = new Uint8Array(ROWS * COLS);
      const thawQueue = [];
      for (let rr = 0; rr < ROWS; rr++) {
        for (let cc = 0; cc < COLS; cc++) {
          const idx = rr * COLS + cc;
          if (!matched[idx]) continue;
          if (rr < minClearedRow) minClearedRow = rr;
          if (b[idx] === 7) {
            specialCleared++;
            totalSentEstimate += 6;
          }
          b[idx] = 0;

          const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
          for (let d = 0; d < 4; d++) {
            const nr = rr + dirs[d][0];
            const nc = cc + dirs[d][1];
            if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
              const nIdx = nr * COLS + nc;
              if (b[nIdx] < 0 && !thawVisited[nIdx]) {
                thawVisited[nIdx] = 1;
                thawQueue.push(nIdx);
              }
            }
          }
        }
      }

      while (thawQueue.length > 0) {
        const curIdx = thawQueue.shift();
        const cr = Math.floor(curIdx / COLS);
        const cc = curIdx % COLS;
        if (b[curIdx] === -2) {
          hardGarbageHit++;
          b[curIdx] = -1;
        } else if (b[curIdx] === -1) {
          garbageThawed++;
          b[curIdx] = 0;
        }
        const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        for (let d = 0; d < 4; d++) {
          const nr = cr + dirs[d][0];
          const nc = cc + dirs[d][1];
          if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
            const nIdx = nr * COLS + nc;
            if (b[nIdx] < 0 && !thawVisited[nIdx]) {
              thawVisited[nIdx] = 1;
              thawQueue.push(nIdx);
            }
          }
        }
      }

      lockedIn = null;
    }

    return {
      board: b,
      cleared: totalCleared,
      chain: maxChain,
      sentEstimate: totalSentEstimate,
      garbageThawed,
      hardGarbageHit,
      specialCleared,
      minClearedRow
    };
  }

  evaluateSimNode(board, accStats, snap) {
    let maxH = 0;
    let holes = 0;
    let colHeights = new Int8Array(COLS);
    let garbageRemaining = 0;

    for (let c = 0; c < COLS; c++) {
      let topSeen = false;
      for (let r = 0; r < ROWS; r++) {
        const v = board[r * COLS + c];
        if (v !== 0) {
          if (!topSeen) {
            colHeights[c] = ROWS - r;
            if (colHeights[c] > maxH) maxH = colHeights[c];
            topSeen = true;
          }
          if (v < 0) garbageRemaining++;
        } else if (topSeen) {
          holes++;
        }
      }
    }

    let bumpiness = 0;
    for (let c = 0; c < COLS - 1; c++) {
      bumpiness += Math.abs(colHeights[c] - colHeights[c + 1]);
    }

    const pendingImpact = snap.minGarbageDelay <= 120 ? snap.pendingGarbageH : Math.ceil(snap.pendingGarbageH * 0.55);
    const effH = maxH + pendingImpact;

    let potential = 0;
    for (let r = 0; r < ROWS; r++) {
      const rowOffset = r * COLS;
      const counts = [0, 0, 0, 0, 0, 0, 0, 0];
      let hasGarbageRow = false;
      for (let c = 0; c < COLS; c++) {
        const v = board[rowOffset + c];
        if (v > 0 && v <= 7) {
          counts[v]++;
          if (c + 1 < COLS && board[rowOffset + c + 1] === v) potential += 14;
          if (r + 1 < ROWS && board[(r + 1) * COLS + c] === v) potential += 14;
          if (r > 0 && board[(r - 1) * COLS + c] < 0) potential += 8;
        } else if (v < 0) {
          hasGarbageRow = true;
        }
      }
      for (let colorId = 1; colorId <= 7; colorId++) {
        if (counts[colorId] >= 3) {
          potential += (counts[colorId] - 2) * (hasGarbageRow ? 34 : 22);
        }
      }
    }

    const sw = this.styleWeights;
    let score = 0;

    if (effH >= 9) {
      score -= (effH - 8) * 750;
    } else if (maxH <= 6) {
      score += 120;
    }
    const heightReduced = snap.maxH - maxH;
    score += heightReduced * (snap.isPinch ? 260 : sw.heightBonus);
    score -= bumpiness * (snap.isPinch ? 28 : sw.bumpPenalty);
    score -= holes * sw.holePenalty;

    score += accStats.sent * (snap.isPinch ? 65 : sw.sentWeight);
    score += accStats.cleared * sw.clearWeight;
    if (accStats.maxChain >= 2) {
      score += accStats.maxChain * accStats.maxChain * sw.chainWeight;
    }
    score += accStats.special * 180;

    score += accStats.garbageThawed * (snap.isPinch ? 190 : 125);
    score += accStats.hardGarbageHit * 95;
    if (snap.garbageCount > 0 && garbageRemaining < snap.garbageCount) {
      score += (snap.garbageCount - garbageRemaining) * 45;
    }

    score += potential;
    score -= accStats.steps * 18;

    return score;
  }

  pushTopCandidate(list, candidate, maxKeep = 6) {
    list.push(candidate);
    if (list.length > maxKeep) {
      list.sort((a, b) => b.score - a.score);
      list.length = maxKeep;
    }
  }

  pickCandidateFromList(list, isPinch, minThreshold = -Infinity) {
    if (!list || list.length === 0) return null;
    list.sort((a, b) => b.score - a.score);
    const valid = list.filter(n => n.score > minThreshold);
    if (valid.length === 0) return null;
    if (valid.length === 1) return valid[0];

    const altProb = isPinch ? this.altBestProb * 0.35 : this.altBestProb;
    if (Math.random() < altProb) {
      const topScore = valid[0].score;
      const maxDrop = isPinch ? 180 : 280;
      const pool = valid.filter((n, idx) => idx < 3 && (topScore - n.score) <= maxDrop);
      if (pool.length > 1) {
        return pool[Math.floor(Math.random() * pool.length)];
      }
    }
    return valid[0];
  }

  runBeamSearch(snap) {
    const startTime = performance.now();
    const maxDepth = this.searchDepth;
    const beamWidth = this.beamWidth;
    const MAX_NODES = 280;
    let expandedNodes = 0;

    const baseStats = { cleared: 0, sent: 0, maxChain: 0, garbageThawed: 0, hardGarbageHit: 0, special: 0, steps: 0 };
    const baseEval = this.evaluateSimNode(snap.board, baseStats, snap);

    let beam = [{
      board: snap.board,
      locked: snap.locked,
      moves: [],
      acc: baseStats,
      score: baseEval,
      firstClearedStep: -1
    }];

    const clearCandidates = [];
    const prepCandidates = [];
    const noiseAmp = snap.isPinch ? this.styleWeights.evalNoise * 0.35 : this.styleWeights.evalNoise;

    for (let depth = 0; depth < maxDepth; depth++) {
      const nextCandidates = [];
      const seenBoards = new Set();

      for (let bi = 0; bi < beam.length; bi++) {
        const node = beam[bi];
        if (performance.now() - startTime > 3.8 || expandedNodes >= MAX_NODES) break;

        const prevMove = node.moves.length > 0 ? node.moves[node.moves.length - 1] : null;

        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS - 1; c++) {
            if (prevMove && prevMove.x === c && prevMove.y === r) continue;
            if (depth === 0 && this.isSwapRecentlyDone(r, c)) continue;

            const res = this.simApplySwap(node.board, node.locked, r, c);
            if (!res) continue;

            expandedNodes++;
            const nextMoves = node.moves.concat([{ x: c, y: r }]);
            const nextAcc = {
              cleared: node.acc.cleared + res.cleared,
              sent: node.acc.sent + res.sentEstimate,
              maxChain: Math.max(node.acc.maxChain, res.chain),
              garbageThawed: node.acc.garbageThawed + res.garbageThawed,
              hardGarbageHit: node.acc.hardGarbageHit + res.hardGarbageHit,
              special: node.acc.special + res.specialCleared,
              steps: nextMoves.length
            };

            const evalScore = this.evaluateSimNode(res.board, nextAcc, snap);
            const firstClearedStep = node.firstClearedStep !== -1
              ? node.firstClearedStep
              : (res.cleared > 0 ? nextMoves.length : -1);

            let finalScore = evalScore + (Math.random() - 0.5) * noiseAmp;
            if (res.cleared > 0 && snap.isPinch) {
              finalScore += (ROWS - res.minClearedRow) * 55 - nextMoves.length * 40;
            }
            if (depth === 0) {
              const dist = Math.abs(this.engine.cursor.x - c) + Math.abs(this.engine.cursor.y - r);
              finalScore -= dist * 2;
            }

            const childNode = {
              board: res.board,
              locked: null,
              moves: nextMoves,
              acc: nextAcc,
              score: finalScore,
              firstClearedStep
            };

            if (nextAcc.cleared > 0) {
              this.pushTopCandidate(clearCandidates, childNode, 6);
            } else {
              this.pushTopCandidate(prepCandidates, childNode, 6);
            }

            if (depth + 1 < maxDepth && res.cleared === 0) {
              const key = childNode.board.join(',');
              if (!seenBoards.has(key)) {
                seenBoards.add(key);
                nextCandidates.push(childNode);
              }
            }
          }
        }
      }

      if (nextCandidates.length === 0 || performance.now() - startTime > 3.8 || expandedNodes >= MAX_NODES) {
        break;
      }
      nextCandidates.sort((a, b) => b.score - a.score);
      beam = nextCandidates.slice(0, beamWidth);
    }

    const pickedClear = this.pickCandidateFromList(clearCandidates, snap.isPinch);
    if (pickedClear && pickedClear.moves.length > 0) {
      return { type: 'clear', moves: pickedClear.moves, score: pickedClear.score };
    }
    const prepThreshold = this.level <= 20 ? 2 : 12;
    const pickedPrep = this.pickCandidateFromList(prepCandidates, snap.isPinch, baseEval + prepThreshold);
    if (pickedPrep && pickedPrep.moves.length > 0) {
      return { type: 'prep', moves: [pickedPrep.moves[0]], score: pickedPrep.score };
    }
    return null;
  }

  isSwapRecentlyDone(r, c) {
    return this.recentSwaps.some(item => item.r === r && item.c === c && item.expire > this.frameCount);
  }

  recordSwap(r, c) {
    this.recentSwaps.push({ r, c, expire: this.frameCount + 50 });
    if (this.recentSwaps.length > 10) this.recentSwaps.shift();
  }

  update() {
    if (this.engine.gameOver || matchState !== 'playing') {
      this.engine.isRisingManualPad = false;
      this.movePlan = [];
      return;
    }

    this.frameCount++;
    if (this.riseCooldown > 0) this.riseCooldown--;

    if (this.engine.isRisingManualPad) {
      const snap = this.captureSnapshot();
      if (snap.maxH >= this.risingTargetMaxH
          || snap.effMaxH >= 8
          || snap.pendingGarbageH > 0
          || this.engine.stopTimer > 0) {
        this.engine.isRisingManualPad = false;
        this.actionTimer = 1;
      } else {
        if (this.frameCount % Math.max(2, this.thinkInterval) === 0) {
          const quickPlan = this.runBeamSearch({ ...snap });
          if (quickPlan && quickPlan.type === 'clear') {
            this.engine.isRisingManualPad = false;
            this.movePlan = quickPlan.moves.slice();
            this.planSignature = snap.signature;
            this.target = this.movePlan.shift();
            this.moveTimer = 0;
          }
        }
        return;
      }
    }

    if (this.target) {
      if (!this.canSwapAt(this.target.y, this.target.x)) {
        this.target = null;
        this.movePlan = [];
        this.actionTimer = Math.min(this.thinkInterval, 1);
        return;
      }

      if (this.moveTimer > 0) {
        this.moveTimer--;
        return;
      }

      this.moveTimer = Math.max(0, this.moveInterval - 1);
      let moved = false;
      if (this.engine.cursor.x < this.target.x) { this.engine.cursor.x++; moved = true; }
      else if (this.engine.cursor.x > this.target.x) { this.engine.cursor.x--; moved = true; }
      else if (this.engine.cursor.y < this.target.y) { this.engine.cursor.y++; moved = true; }
      else if (this.engine.cursor.y > this.target.y) { this.engine.cursor.y--; moved = true; }

      if (!moved) {
        const sx = this.engine.cursor.x;
        const sy = this.engine.cursor.y;
        const ok = this.engine.swap(sx, sy);
        if (ok) {
          this.recordSwap(sy, sx);
        }
        this.target = null;

        if (ok && this.movePlan.length > 0 && this.engine.stopTimer <= 0) {
          const nextStep = this.movePlan.shift();
          if (nextStep && this.canSwapAt(nextStep.y, nextStep.x)) {
            this.target = nextStep;
            this.moveTimer = Math.max(0, this.moveInterval - 1);
            return;
          } else {
            this.movePlan = [];
          }
        } else {
          this.movePlan = [];
        }

        this.actionTimer = this.getNextThinkDelay();
      }
    } else {
      this.actionTimer--;
      if (this.actionTimer <= 0) this.think();
    }
  }

  think() {
    if (this.engine.gameOver || matchState !== 'playing') return;
    this.actionTimer = this.getNextThinkDelay();
    this.engine.isRisingManualPad = false;
    this.movePlan = [];

    const snap = this.captureSnapshot();

    if (!snap.isPinch && Math.random() < this.randomMoveProb) {
      const rndRoll = Math.random();
      if (rndRoll < 0.45) {
        const exploreMove = this.findExploratorySwap(snap);
        if (exploreMove) {
          this.target = exploreMove;
          this.moveTimer = Math.max(0, this.moveInterval - 1);
          return;
        }
      } else if (rndRoll < 0.80) {
        const flattenMove = this.findFlattenOrSafeMove(snap);
        if (flattenMove) {
          this.target = flattenMove;
          this.moveTimer = Math.max(0, this.moveInterval - 1);
          return;
        }
      } else {
        this.actionTimer = this.getNextThinkDelay() + Math.floor(Math.random() * 4);
        return;
      }
    }

    const plan = this.runBeamSearch(snap);
    if (plan && plan.moves && plan.moves.length > 0) {
      if (plan.type === 'clear' || Math.random() >= this.topChoiceNoise) {
        this.movePlan = plan.moves.slice();
        this.target = this.movePlan.shift();
        this.moveTimer = Math.max(0, this.moveInterval - 1);
        return;
      }
    }

    const canSafeRise = !snap.isPinch
      && snap.effMaxH <= 7
      && snap.maxH <= 6
      && snap.pendingGarbageH === 0
      && this.engine.stopTimer <= 0
      && this.riseCooldown <= 0;

    if (canSafeRise && Math.random() < this.riseTryProb) {
      const targetRiseRows = snap.maxH <= 4 ? (Math.random() < 0.65 ? 2 : 1) : 1;
      this.risingTargetMaxH = Math.min(7, snap.maxH + targetRiseRows);
      this.engine.isRisingManualPad = true;
      this.riseCooldown = 28 + Math.floor(Math.random() * 18);
      this.target = null;
      return;
    }

    const flatten = this.findFlattenOrSafeMove(snap);
    if (flatten) {
      this.target = flatten;
      this.moveTimer = Math.max(0, this.moveInterval - 1);
      return;
    }

    const explore = this.findExploratorySwap(snap);
    if (explore) {
      this.target = explore;
      this.moveTimer = Math.max(0, this.moveInterval - 1);
      return;
    }

    if (canSafeRise) {
      this.risingTargetMaxH = Math.min(7, snap.maxH + 1);
      this.engine.isRisingManualPad = true;
      this.riseCooldown = 24 + Math.floor(Math.random() * 14);
      this.target = null;
      return;
    }

    this.target = null;
    this.actionTimer = Math.min(8, this.thinkInterval) + Math.floor(Math.random() * 3);
  }

  findFlattenOrSafeMove(snap) {
    const candidates = [];

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS - 1; c++) {
        if (!this.canSwapAt(r, c)) continue;
        if (this.isSwapRecentlyDone(r, c)) continue;

        const b1 = this.engine.grid[r][c];
        const b2 = this.engine.grid[r][c + 1];

        if (b1 && b2 === null && snap.colHeights[c] > snap.colHeights[c + 1]) {
          const sc = (snap.colHeights[c] - snap.colHeights[c + 1]) * 30 + (snap.isPinch ? (ROWS - r) * 25 : 0) + Math.random() * 18;
          candidates.push({ x: c, y: r, sc });
        } else if (b2 && b1 === null && snap.colHeights[c + 1] > snap.colHeights[c]) {
          const sc = (snap.colHeights[c + 1] - snap.colHeights[c]) * 30 + (snap.isPinch ? (ROWS - r) * 25 : 0) + Math.random() * 18;
          candidates.push({ x: c, y: r, sc });
        }
      }
    }

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b.sc - a.sc);
    const pickIdx = Math.floor(Math.random() * Math.min(2, candidates.length));
    return { x: candidates[pickIdx].x, y: candidates[pickIdx].y };
  }

  findExploratorySwap(snap) {
    const candidates = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS - 1; c++) {
        if (!this.canSwapAt(r, c)) continue;
        if (this.isSwapRecentlyDone(r, c)) continue;

        const b1 = this.engine.grid[r][c];
        const b2 = this.engine.grid[r][c + 1];
        if (!b1 || !b2) continue;

        const dist = Math.abs(this.engine.cursor.x - c) + Math.abs(this.engine.cursor.y - r);
        const sc = -dist * 2.5 + (ROWS - r) * 2 + Math.random() * 26;
        candidates.push({ x: c, y: r, sc });
      }
    }
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b.sc - a.sc);
    const pickIdx = Math.floor(Math.random() * Math.min(5, candidates.length));
    return { x: candidates[pickIdx].x, y: candidates[pickIdx].y };
  }
}