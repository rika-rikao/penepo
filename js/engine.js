// ==========================================
// ゲームエンジン（全段パズル可能化 / 凹凸共通初期盤面 / 3D円筒18列正面投影 / 新お邪魔パネル計算ルール＆混合倍率補正対応）
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

// 同時消し数に応じたお邪魔パネル配列（6列最大幅単位）を生成
function generateComboGarbagePanels(comboSize, isHard = false) {
  const n = Math.floor(comboSize);
  if (n < 4) return [];
  if (n === 4) return [{ w: 3, h: 1, isHard }];
  if (n === 5) return [{ w: 4, h: 1, isHard }];
  if (n === 6) return [{ w: 5, h: 1, isHard }];
  if (n === 7) return [{ w: 6, h: 1, isHard }];
  if (n === 8) return [{ w: 3, h: 1, isHard }, { w: 4, h: 1, isHard }];
  if (n === 9) return [{ w: 4, h: 1, isHard }, { w: 4, h: 1, isHard }];
  if (n === 10) return [{ w: 4, h: 1, isHard }, { w: 5, h: 1, isHard }];
  if (n === 11) return [{ w: 5, h: 1, isHard }, { w: 5, h: 1, isHard }];
  if (n === 12 || n === 13) return [{ w: 6, h: 1, isHard }, { w: 6, h: 1, isHard }];
  if (n === 14) return [{ w: 6, h: 1, isHard }, { w: 6, h: 1, isHard }, { w: 3, h: 1, isHard }];
  if (n === 15) return [{ w: 6, h: 1, isHard }, { w: 6, h: 1, isHard }, { w: 4, h: 1, isHard }];
  if (n === 16) return [{ w: 6, h: 1, isHard }, { w: 6, h: 1, isHard }, { w: 5, h: 1, isHard }];
  if (n <= 19) return [{ w: 6, h: 1, isHard }, { w: 6, h: 1, isHard }, { w: 6, h: 1, isHard }];

  // 20個以上：18列（1周）に達して2段目へ
  const panels = [
    { w: 6, h: 1, isHard },
    { w: 6, h: 1, isHard },
    { w: 6, h: 1, isHard }
  ];
  const extraPanels = generateComboGarbagePanels(3 + (n - 19), isHard);
  return panels.concat(extraPanels);
}

// 連鎖数に応じたお邪魔パネル配列（盤面列数に応じて2D=6列 / 3D=18列へ展開）
function generateChainGarbagePanels(chainCount, baseCols = COLS_3D, isHard = false) {
  const n = Math.floor(chainCount);
  if (n < 2) return [];
  if (baseCols >= 18) {
    if (n === 2) return [{ w: 6, h: 1, isHard }];
    if (n === 3) return [{ w: 12, h: 1, isHard }];
    const h = Math.min(12, n - 3);
    return [{ w: 18, h, isHard }];
  }
  const h = Math.min(12, n - 1);
  return [{ w: Math.min(baseCols, 6), h, isHard }];
}

// 攻撃仕様オブジェクトを受け手盤面の列数に合わせたお邪魔パネル配列へ解決
// （盤面混合時は 2D→3D で3倍、3D→2D で1/3倍にスケーリング）
function resolveAttackSpecToPanels(spec, targetCols = COLS) {
  if (!spec || !Array.isArray(spec.events)) return [];
  const senderCols = (spec.senderCols && spec.senderCols > 0) ? spec.senderCols : targetCols;
  const is3DSender = senderCols >= 18;
  const rawPanels = [];

  spec.events.forEach(ev => {
    if (!ev) return;
    if (ev.kind === 'chain') {
      const list = generateChainGarbagePanels(ev.chain, senderCols, !!ev.isHard);
      list.forEach(p => rawPanels.push(p));
    } else if (ev.kind === 'combo') {
      let list = generateComboGarbagePanels(ev.size, !!ev.isHard);
      // 3D盤面で20個以上のとき、先頭3個（6列×3＝18列）を18列×1段の1周パネルへ統合
      if (is3DSender && ev.size >= 20 && list.length >= 3) {
        const rest = list.slice(3);
        const merged = [{ w: 18, h: 1, isHard: !!ev.isHard }];
        let fullRows = 1;
        while (rest.length >= 3 && rest[0].w === 6 && rest[1].w === 6 && rest[2].w === 6 && fullRows < 12) {
          rest.splice(0, 3);
          fullRows++;
        }
        merged[0].h = fullRows;
        list = merged.concat(rest);
      }
      list.forEach(p => rawPanels.push({
        w: Math.max(1, Math.min(senderCols, p.w)),
        h: Math.max(1, Math.min(12, p.h)),
        isHard: !!p.isHard
      }));
    } else if (ev.kind === 'flat') {
      rawPanels.push({
        w: Math.max(1, Math.min(senderCols, ev.w || 6)),
        h: Math.max(1, Math.min(12, ev.h || 1)),
        isHard: !!ev.isHard
      });
    }
  });

  const mult = (spec.outgoingMult !== undefined && spec.outgoingMult < 1.0) ? spec.outgoingMult : 1.0;
  let flatSub = spec.outgoingFlatSub > 0 ? Math.floor(spec.outgoingFlatSub) : 0;

  let finalPanels = rawPanels.map(p => ({ ...p }));
  if (mult < 1.0) {
    finalPanels = finalPanels.map(p => {
      if (p.h > 1) {
        const nh = Math.max(1, Math.floor(p.h * mult));
        return { ...p, h: nh };
      }
      const nw = Math.floor(p.w * mult);
      return nw >= 1 ? { ...p, w: nw } : null;
    }).filter(Boolean);
  }
  if (flatSub > 0) {
    const reduced = [];
    for (let i = 0; i < finalPanels.length; i++) {
      const p = finalPanels[i];
      if (flatSub <= 0) {
        reduced.push(p);
        continue;
      }
      const area = p.w * p.h;
      if (flatSub >= area) {
        flatSub -= area;
        continue;
      }
      if (p.h > 1) {
        const dropRows = Math.floor(flatSub / p.w);
        p.h -= dropRows;
        flatSub -= dropRows * p.w;
        if (flatSub > 0 && p.h > 0) {
          if (p.h === 1) {
            p.w = Math.max(1, p.w - flatSub);
            flatSub = 0;
          } else {
            p.h -= 1;
            const remRowW = p.w - flatSub;
            flatSub = 0;
            if (p.h > 0) reduced.push({ w: p.w, h: p.h, isHard: p.isHard });
            if (remRowW > 0) reduced.push({ w: remRowW, h: 1, isHard: p.isHard });
            continue;
          }
        }
        if (p.h > 0) reduced.push(p);
      } else {
        const nw = p.w - flatSub;
        flatSub = 0;
        if (nw > 0) reduced.push({ w: nw, h: 1, isHard: p.isHard });
      }
    }
    finalPanels = reduced;
  }

  // 送信元と受け手の盤面列数が異なる場合（2D⇔3D混合）、幅比（3倍 / 1/3倍）で変換
  if (senderCols !== targetCols && finalPanels.length > 0) {
    const dimScale = targetCols / senderCols; // 2D->3D: 3.0, 3D->2D: 1/3
    const scaled = [];
    let normalAreaAccum = 0;
    let hardAreaAccum = 0;

    finalPanels.forEach(p => {
      const a = p.w * p.h * dimScale;
      if (p.isHard) hardAreaAccum += a;
      else normalAreaAccum += a;
    });

    const emitAreaAsPanels = (areaVal, isHard) => {
      const totalBlocks = Math.floor(areaVal + 1e-6);
      if (totalBlocks <= 0) return;
      const fullRows = Math.floor(totalBlocks / targetCols);
      const rem = totalBlocks % targetCols;
      if (fullRows > 0) {
        scaled.push({ w: targetCols, h: Math.min(12, fullRows), isHard });
      }
      if (rem > 0) {
        scaled.push({ w: rem, h: 1, isHard });
      }
    };

    emitAreaAsPanels(normalAreaAccum, false);
    emitAreaAsPanels(hardAreaAccum, true);
    return scaled;
  }

  return finalPanels;
}

class PonEngine {
  constructor(onStateChange, onSendGarbage, handicap = 3, isPlayer = true, seed = null, options = null) {
    this.is3D = !!(options && options.is3D);
    this.cols = this.is3D ? (typeof COLS_3D !== 'undefined' ? COLS_3D : 18) : COLS;
    this.rows = ROWS;
    this.handicap = handicap;
    this.isPlayer = isPlayer;
    this.initSeed = seed !== null ? (seed >>> 0) : (Math.floor(Math.random() * 0xFFFFFFFF) >>> 0);
    this.boardRng = createSeededRng(this.initSeed);
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
    this.score = 0;
    this.chain = 0;
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

    this.initGrid();
  }

  wrapCol(c) {
    if (!this.is3D) return c;
    return ((c % this.cols) + this.cols) % this.cols;
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

  hasSupportBelow(r, c) {
    if (r >= this.rows - 1) return true;
    const below = this.grid[r + 1][c];
    if (!below) return false;
    if (below.state === 'hover' || below.state === 'fall') return false;
    return true;
  }

  canSwapBlock(b, r, c_idx) {
    if (!b) return true;
    if (b.type === 'garbage') return false;
    if (b.state === 'normal') {
      return this.hasSupportBelow(r, c_idx);
    }
    if (b.state === 'fall') {
      return !!b.hasFallen;
    }
    return false;
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

  hasAnyLandChainWindow() {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const b = this.grid[r][c];
        if (b && b.state === 'normal' && b.landChainTimer > 0) {
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
        const b = this.grid[r][c];
        if (b) {
          b.chainEligible = false;
          delete b.landChainTimer;
        }
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
          const neighbors = [[cr - 1, cc], [cr + 1, cc]];
          if (this.is3D) {
            neighbors.push([cr, (cc - 1 + this.cols) % this.cols]);
            neighbors.push([cr, (cc + 1) % this.cols]);
          } else {
            neighbors.push([cr, cc - 1], [cr, cc + 1]);
          }
          neighbors.forEach(([nr, nc]) => {
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

  // 全員共通の凹凸初期盤面（ピンチライン r <= Math.floor(ROWS * 0.3) に絶対かからない高さ: 下から3〜7段）
  initGrid() {
    const maxCols = typeof COLS_3D !== 'undefined' ? COLS_3D : 18;
    const commonRng = createSeededRng(this.initSeed ^ 0x9E3779B9);
    const maxSafeHeight = Math.max(4, this.rows - Math.floor(this.rows * 0.3) - 2);
    const minHeight = 3;

    const heights = new Array(maxCols);
    let curH = minHeight + Math.floor(commonRng() * (maxSafeHeight - minHeight + 1));
    for (let c = 0; c < maxCols; c++) {
      const step = Math.floor(commonRng() * 5) - 2;
      curH = Math.max(minHeight, Math.min(maxSafeHeight, curH + step));
      heights[c] = curH;
    }
    const firstSix = heights.slice(0, Math.min(6, maxCols));
    if (Math.max(...firstSix) - Math.min(...firstSix) < 2) {
      heights[1] = Math.min(maxSafeHeight, minHeight + 4);
      heights[4] = minHeight;
    }

    const commonGrid = Array.from({ length: this.rows }, () => Array(maxCols).fill(null));
    for (let c = 0; c < maxCols; c++) {
      const colH = heights[c];
      for (let k = 0; k < colH; k++) {
        const r = this.rows - 1 - k;
        let validConfigs = [...COLORS];

        if (r + 2 < this.rows && commonGrid[r + 1][c] && commonGrid[r + 2][c] && commonGrid[r + 1][c].type === commonGrid[r + 2][c].type) {
          validConfigs = validConfigs.filter(conf => conf.id !== commonGrid[r + 1][c].type);
        }
        if (c >= 2 && commonGrid[r][c - 1] && commonGrid[r][c - 2] && commonGrid[r][c - 1].type === commonGrid[r][c - 2].type) {
          validConfigs = validConfigs.filter(conf => conf.id !== commonGrid[r][c - 1].type);
        }
        if (this.is3D && c >= maxCols - 2) {
          const right1 = commonGrid[r][(c + 1) % maxCols];
          const right2 = commonGrid[r][(c + 2) % maxCols];
          const left1 = commonGrid[r][c - 1];
          if (right1 && right2 && right1.type === right2.type) {
            validConfigs = validConfigs.filter(conf => conf.id !== right1.type);
          }
          if (left1 && right1 && left1.type === right1.type) {
            validConfigs = validConfigs.filter(conf => conf.id !== left1.type);
          }
        }
        if (validConfigs.length === 0) validConfigs = COLORS.filter(conf => !conf.isSpecial);

        commonGrid[r][c] = {
          type: this.pickWeightedColor(validConfigs, commonRng),
          state: 'normal',
          timer: 0,
          fallY: 0,
          chainEligible: false
        };
      }
    }

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const src = commonGrid[r][c];
        this.grid[r][c] = src ? { ...src } : null;
      }
    }

    this.nextRow = this.createNextRow();
  }

  pickWeightedColor(candidateConfigs, rngFn = null) {
    const rng = rngFn || (() => Math.random());
    let totalWeight = 0;
    candidateConfigs.forEach(conf => {
      totalWeight += conf.isSpecial ? 1 : 4;
    });
    let rnd = rng() * totalWeight;
    for (const conf of candidateConfigs) {
      const w = conf.isSpecial ? 1 : 4;
      if (rnd < w) return conf.id;
      rnd -= w;
    }
    return candidateConfigs[0].id;
  }

  createNextRow() {
    const row = [];
    for (let c = 0; c < this.cols; c++) {
      let choices = [...COLORS];
      if (c >= 2 && row[c - 1].type === row[c - 2].type) {
        choices = choices.filter(conf => conf.id !== row[c - 1].type);
      }
      if (this.is3D && c >= this.cols - 2) {
        const right1 = row[(c + 1) % this.cols];
        const right2 = row[(c + 2) % this.cols];
        const left1 = row[c - 1];
        if (right1 && right2 && right1.type === right2.type) {
          choices = choices.filter(conf => conf.id !== right1.type);
        }
        if (left1 && right1 && left1.type === right1.type) {
          choices = choices.filter(conf => conf.id !== right1.type);
        }
      }
      if (choices.length === 0) choices = COLORS.filter(conf => !conf.isSpecial);
      row.push({ type: this.pickWeightedColor(choices), state: 'normal', timer: 0, fallY: 0, chainEligible: false });
    }
    return row;
  }

  swap(c, r) {
    if (this.endAnim) return false;
    if (this.gameOver && !this.isPractice) return false;
    if (matchState !== 'playing' && !this.isPractice) return false;
    if (this.purifyState && this.purifyState.active) return false;
    if (r < 0 || r >= this.rows) return false;

    let c1, c2;
    if (this.is3D) {
      c1 = this.wrapCol(c);
      c2 = (c1 + 1) % this.cols;
    } else {
      if (c < 0 || c >= this.cols - 1) return false;
      c1 = c;
      c2 = c + 1;
    }

    const b1 = this.grid[r][c1], b2 = this.grid[r][c2];
    if (!this.canSwapBlock(b1, r, c1) || !this.canSwapBlock(b2, r, c2)) return false;

    const b1WasFalling = !!(b1 && b1.state === 'fall');
    const b2WasFalling = !!(b2 && b2.state === 'fall');
    const b1KeepChain = !!(b1 && b1.chainEligible && (b1WasFalling || b1.landChainTimer > 0));
    const b2KeepChain = !!(b2 && b2.chainEligible && (b2WasFalling || b2.landChainTimer > 0));

    this.grid[r][c1] = b2;
    this.grid[r][c2] = b1;

    const finalizeSwappedBlock = (blk, col, dir, wasFalling, keepChain) => {
      if (!blk) return;
      blk.swapAnim = { dir, timer: 3 };

      if (wasFalling) {
        if (!this.hasSupportBelow(r, col)) {
          blk.state = 'fall';
          blk.hasFallen = true;
        } else {
          blk.state = 'normal';
          blk.fallY = 0;
          delete blk.hasFallen;
          if (blk.chainEligible) {
            blk.landChainTimer = 8;
          }
        }
        return;
      }

      if (!keepChain) {
        blk.chainEligible = false;
        delete blk.landChainTimer;
      }

      if (!this.hasSupportBelow(r, col)) {
        blk.state = 'hover';
        blk.timer = 11;
        delete blk.hasFallen;
      } else {
        blk.state = 'normal';
        blk.fallY = 0;
        delete blk.hasFallen;
      }
    };

    finalizeSwappedBlock(this.grid[r][c1], c1, -1, b2WasFalling, b2KeepChain);
    finalizeSwappedBlock(this.grid[r][c2], c2, 1, b1WasFalling, b1KeepChain);

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
      delete b.landChainTimer;
      delete b.hasFallen;
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
    const clampedW = Math.max(1, Math.min(this.cols, w));
    this.garbageQueue.push({ w: clampedW, h: adjustedH, delay: 150, isHard });
  }

  spawnGarbage(g) {
    const groupId = this.allocGroupId();
    const startCol = g.startCol;
    const maxH = Math.min(this.rows, g.h);
    for (let r = 0; r < maxH; r++) {
      for (let c = 0; c < g.w; c++) {
        const actualCol = this.is3D ? ((startCol + c) % this.cols) : (startCol + c);
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

    const getAdjCoords = (rr, cc) => {
      const list = [[rr - 1, cc], [rr + 1, cc]];
      if (this.is3D) {
        list.push([rr, (cc - 1 + this.cols) % this.cols]);
        list.push([rr, (cc + 1) % this.cols]);
      } else {
        list.push([rr, cc - 1], [rr, cc + 1]);
      }
      return list;
    };

    let triggeredGroupIds = new Set();
    getAdjCoords(r, c).forEach(([nr, nc]) => {
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
              getAdjCoords(rr, cc).forEach(([nr, nc]) => {
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
            cells.push({ r: rr, c: cc, b: b });
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

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const b = this.grid[r][c];
        if (b && b.state === 'normal') {
          if (b.landChainTimer > 0) {
            b.landChainTimer--;
            if (b.landChainTimer <= 0) {
              delete b.landChainTimer;
              b.chainEligible = false;
            }
          } else if (b.chainEligible) {
            b.chainEligible = false;
          }
        }
      }
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
                delete b.landChainTimer;
                delete b.hasFallen;
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
            delete b.hasFallen;
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
            const actualCol = this.is3D ? ((startC + c) % this.cols) : (startC + c);
            let colAvail = 0;
            for (let r = 0; r < this.rows; r++) {
              if (this.grid[r][actualCol] === null) colAvail++;
              else break;
            }
            if (colAvail < minAvail) minAvail = colAvail;
          }
          return minAvail;
        };

        const maxStart = this.is3D ? this.cols : (this.cols - g.w + 1);
        if (g.startCol === undefined) g.startCol = Math.floor(Math.random() * maxStart);
        let availH = getAvailHeightAt(g.startCol);

        if (availH < g.h && g.w < this.cols) {
          let bestCol = g.startCol;
          let bestAvail = availH;
          for (let c = 0; c < maxStart; c++) {
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
          isMoving = true;
          b.timer--;
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
                delete ub.landChainTimer;
                delete ub.hasFallen;
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

        const canFallOrFloating = !this.hasSupportBelow(r, c);

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
            delete leader.hasFallen;
          }

          for (const item of stack) item.block.state = leader.state;

          if (leader.state === 'hover') {
            isMoving = true;
            leader.timer--;
            for (const item of stack) {
              item.block.timer = leader.timer;
              delete item.block.hasFallen;
            }
            if (leader.timer <= 0) {
              for (const item of stack) {
                item.block.state = 'fall';
                item.block.fallY = 0;
                delete item.block.hasFallen;
              }
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
              for (const item of stack) {
                item.block.state = 'normal';
                item.block.fallY = 0;
                delete item.block.hasFallen;
                if (item.block.chainEligible) {
                  item.block.landChainTimer = 8;
                }
              }
              needsMatchCheck = true;
            } else {
              leader.fallY += 0.50;
              for (const item of stack) {
                item.block.fallY = leader.fallY;
                item.block.hasFallen = true;
              }

              if (leader.fallY >= 1.0) {
                for (const item of stack) {
                  this.grid[item.r + 1][c] = item.block;
                  this.grid[item.r][c] = null;
                  item.block.fallY = 0;
                }
                if (bottomR + 2 >= this.rows || (this.grid[bottomR + 2][c] !== null && this.grid[bottomR + 2][c].state !== 'fall')) {
                  for (const item of stack) {
                    item.block.state = 'normal';
                    item.block.fallY = 0;
                    delete item.block.hasFallen;
                    if (item.block.chainEligible) {
                      item.block.landChainTimer = 8;
                    }
                  }
                  needsMatchCheck = true;
                }
              }
            }
          }
          r = cur;
        } else {
          const cell = this.grid[r][c];
          const wasMoving = (cell.state === 'hover' || cell.state === 'fall');
          cell.state = 'normal';
          cell.fallY = 0;
          delete cell.hasFallen;
          if (wasMoving && cell.chainEligible && !cell.landChainTimer) {
            cell.landChainTimer = 8;
          }
          r--;
        }
      }
    }

    if (needsMatchCheck) this.checkMatches();

    if (this.hasChainGraceEnabled()) {
      if (this.chain >= 1 && !this.hasAnyMovingBlock()) {
        if (this.chainGraceTimer > 0) {
          this.chainGraceTimer--;
        }
        if (this.chainGraceTimer <= 0) {
          this.finishChain();
        }
      }
    } else if (this.chain >= 1 && !this.hasAnyMovingBlock() && !this.hasAnyLandChainWindow()) {
      this.finishChain();
    }
  }

  checkMatches() {
    let matchedPositions = new Set();

    // 横方向マッチ判定（3D時は左右ループ境界またぎ対応）
    for (let r = 0; r < this.rows; r++) {
      if (this.is3D) {
        const b0 = this.grid[r][0];
        let allSame = !!(b0 && b0.state === 'normal' && b0.type !== 'garbage');
        if (allSame) {
          for (let c = 1; c < this.cols; c++) {
            const bc = this.grid[r][c];
            if (!bc || bc.state !== 'normal' || bc.type !== b0.type) {
              allSame = false;
              break;
            }
          }
        }
        if (allSame) {
          for (let c = 0; c < this.cols; c++) matchedPositions.add(`${r},${c}`);
          continue;
        }

        let breakC = -1;
        for (let c = 0; c < this.cols; c++) {
          const prev = this.grid[r][(c - 1 + this.cols) % this.cols];
          const cur = this.grid[r][c];
          const curOk = !!(cur && cur.state === 'normal' && cur.type !== 'garbage');
          const prevOk = !!(prev && prev.state === 'normal' && prev.type !== 'garbage');
          if (!curOk || !prevOk || cur.type !== prev.type) {
            breakC = c;
            break;
          }
        }
        if (breakC !== -1) {
          let step = 0;
          while (step < this.cols) {
            const c = (breakC + step) % this.cols;
            const b1 = this.grid[r][c];
            if (!b1 || b1.state !== 'normal' || b1.type === 'garbage') {
              step++;
              continue;
            }
            let run = 1;
            while (step + run < this.cols) {
              const nextC = (breakC + step + run) % this.cols;
              const b2 = this.grid[r][nextC];
              if (b2 && b2.state === 'normal' && b2.type === b1.type) run++;
              else break;
            }
            if (run >= 3) {
              for (let k = 0; k < run; k++) {
                matchedPositions.add(`${r},${(breakC + step + k) % this.cols}`);
              }
            }
            step += run;
          }
        }
      } else {
        for (let c = 0; c < this.cols - 2; c++) {
          const b1 = this.grid[r][c];
          if (!b1 || b1.state !== 'normal' || b1.type === 'garbage') continue;
          let matchCount = 1;
          for (let k = 1; c + k < this.cols; k++) {
            const b2 = this.grid[r][c + k];
            if (b2 && b2.state === 'normal' && b2.type === b1.type) matchCount++;
            else break;
          }
          if (matchCount >= 3) {
            for (let k = 0; k < matchCount; k++) matchedPositions.add(`${r},${c + k}`);
          }
        }
      }
    }

    // 縦方向マッチ判定
    for (let c = 0; c < this.cols; c++) {
      for (let r = 0; r < this.rows - 2; r++) {
        const b1 = this.grid[r][c];
        if (!b1 || b1.state !== 'normal' || b1.type === 'garbage') continue;
        let matchCount = 1;
        for (let k = 1; r + k < this.rows; k++) {
          const b2 = this.grid[r + k][c];
          if (b2 && b2.state === 'normal' && b2.type === b1.type) matchCount++;
          else break;
        }
        if (matchCount >= 3) {
          for (let k = 0; k < matchCount; k++) matchedPositions.add(`${r + k},${c}`);
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
        block.state = 'match';
        block.timer = 46;
        delete block.landChainTimer;
        delete block.hasFallen;
      });

      if (chainActive) this.chain++; else this.chain = 1;
      if (this.hasChainGraceEnabled()) {
        this.chainGraceTimer = this.chainGraceMax;
      }

      if (!this.popups) this.popups = [];
      const coordsArray = Array.from(matchedPositions);

      if (this.chain >= 2) {
        const coords = coordsArray[0].split(',').map(Number);
        const rawX = this.is3D ? (COLS * CELL_PX) / 2 : (coords[1] * CELL_PX + CELL_PX / 2);
        const rawY = coords[0] * CELL_PX + CELL_PX / 2;
        this.popups.push({
          text: `${this.chain}chain`,
          col: coords[1],
          row: coords[0],
          x: Math.max(34, Math.min(COLS * CELL_PX - 34, rawX)),
          y: Math.max(20, rawY),
          timer: 38,
          initialTimer: 38,
          color: '#ffdf00',
          isNumber: false
        });
      }

      if (matchedPositions.size >= 4) {
        const coords = coordsArray[Math.floor(coordsArray.length / 2)].split(',').map(Number);
        const rawX = this.is3D ? (COLS * CELL_PX) / 2 : (coords[1] * CELL_PX + CELL_PX / 2);
        let rawY = coords[0] * CELL_PX + CELL_PX / 2;
        if (this.chain >= 2) rawY += 18;
        this.popups.push({
          text: `${matchedPositions.size}`,
          col: coords[1],
          row: coords[0],
          x: Math.max(16, Math.min(COLS * CELL_PX - 16, rawX)),
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
      const effChain = twoTierDrop ? Math.max(0, this.chain - 2) : this.chain;
      const effCombo = twoTierDrop ? Math.max(0, matchedPositions.size - 2) : matchedPositions.size;

      const events = [];
      if (effChain >= 2) {
        events.push({ kind: 'chain', chain: effChain, isHard: hasSpecial });
      }
      if (effCombo >= 4) {
        events.push({ kind: 'combo', size: effCombo, isHard: hasSpecial });
      }
      if (hasSpecial) {
        events.push({ kind: 'flat', w: 6, h: 1, isHard: true });
      }

      if (events.length > 0 && this.onSendGarbage) {
        const attackSpec = {
          senderCols: this.cols,
          events,
          outgoingMult: (this.skillModifiers && this.skillModifiers.outgoingGarbageMult < 1.0)
            ? this.skillModifiers.outgoingGarbageMult
            : 1.0,
          outgoingFlatSub: (this.skillModifiers && this.skillModifiers.outgoingGarbageFlatSub > 0)
            ? this.skillModifiers.outgoingGarbageFlatSub
            : 0
        };
        const resolvedRef = resolveAttackSpecToPanels(attackSpec, this.cols);
        const totalBlocks = resolvedRef.reduce((sum, p) => sum + p.w * p.h, 0);
        if (totalBlocks > 0) {
          this.onSendGarbage(totalBlocks, hasSpecial, attackSpec);
        }
      }
      if (this.chain >= 2 && this.onChainStep) {
        this.onChainStep(this.chain);
      }
      if (matchedPositions.size >= 4 && this.onSimultaneousMatch) {
        this.onSimultaneousMatch(matchedPositions.size);
      }
    } else {
      if (!this.hasAnyMovingBlock() && !this.hasAnyLandChainWindow()) {
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

const DimColorCache = new Map();

function dimHexColor(hex, satScale = 1.0, valScale = 1.0) {
  if (!hex || typeof hex !== 'string' || !hex.startsWith('#')) return hex;
  const sQ = Math.round(satScale * 100);
  const vQ = Math.round(valScale * 100);
  if (sQ >= 99 && vQ >= 99) return hex;
  const key = `${hex}|${sQ}|${vQ}`;
  const cached = DimColorCache.get(key);
  if (cached) return cached;

  let h = hex.slice(1);
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const r = parseInt(h.slice(0, 2), 16) || 0;
  const g = parseInt(h.slice(2, 4), 16) || 0;
  const b = parseInt(h.slice(4, 6), 16) || 0;
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  const nr = Math.max(0, Math.min(255, Math.round((lum + (r - lum) * satScale) * valScale)));
  const ng = Math.max(0, Math.min(255, Math.round((lum + (g - lum) * satScale) * valScale)));
  const nb = Math.max(0, Math.min(255, Math.round((lum + (b - lum) * satScale) * valScale)));
  const out = `rgb(${nr},${ng},${nb})`;
  DimColorCache.set(key, out);
  return out;
}

function bilerpQuad(pLT, pRT, pRB, pLB, u, v) {
  const topX = pLT.x + (pRT.x - pLT.x) * u;
  const topY = pLT.y + (pRT.y - pLT.y) * u;
  const botX = pLB.x + (pRB.x - pLB.x) * u;
  const botY = pLB.y + (pRB.y - pLB.y) * u;
  return {
    x: topX + (botX - topX) * v,
    y: topY + (botY - topY) * v
  };
}

function traceQuadPath(ctx, p0, p1, p2, p3) {
  ctx.beginPath();
  ctx.moveTo(p0.x, p0.y);
  ctx.lineTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.lineTo(p3.x, p3.y);
  ctx.closePath();
}

// --- 描画エンジン（2D & 3D円筒18列正面投影：横端0.3・1×6・0.3ぴっちり＋背面透過） ---
class BoardRenderer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.canvas.width = COLS * CELL_PX;
    this.canvas.height = ROWS * CELL_PX;
    this.theme = null;
    this.viewCol = null;
  }

  isGbActive() {
    return (typeof isGbMode !== 'undefined' && isGbMode);
  }

  getCylinderMetrics(engine) {
    const N = engine.cols || (typeof COLS_3D !== 'undefined' ? COLS_3D : 18);
    const W = this.canvas.width;
    const H = this.canvas.height;
    const dTheta = (Math.PI * 2) / N;
    const kSin = 0.24;
    const kLin = 0.76;
    // 左右それぞれ3.3列（合計6.6列＝0.3, 1, 1, 1, 1, 1, 1, 0.3）を盤面横端までぴったり詰める
    const thetaEdge = 3.31 * dTheta;
    const normEdge = kSin * Math.sin(thetaEdge) + kLin * thetaEdge;
    return { N, W, H, dTheta, kSin, kLin, thetaEdge, normEdge };
  }

  project3DPoint(metrics, theta, rowY) {
    const { W, H, kSin, kLin, normEdge } = metrics;
    let t = theta;
    while (t > Math.PI) t -= Math.PI * 2;
    while (t < -Math.PI) t += Math.PI * 2;

    const cosT = Math.cos(t);
    const phi = cosT >= 0 ? t : ((t >= 0 ? 1 : -1) * (Math.PI - Math.abs(t)));
    const rawX = kSin * Math.sin(phi) + kLin * phi;
    const x = W * 0.5 + (W * 0.5) * (rawX / normEdge);

    // 正面視点（見下ろし無し）：奥行きに応じた縦スケールのみ適用し、上下対称な円筒カーブを描く
    const persp = cosT >= 0 ? (0.84 + 0.16 * cosT) : (0.84 + 0.14 * cosT);
    const y = H * 0.5 + (rowY - H * 0.5) * persp;

    return {
      x,
      y,
      z: cosT,
      persp
    };
  }

  getBlockLighting(theta) {
    const cosT = Math.cos(theta);
    if (cosT >= 0) {
      const frontFactor = Math.pow(cosT, 0.72);
      return {
        isBack: false,
        cosT,
        satScale: 0.82 + 0.18 * cosT,
        valScale: 0.68 + 0.32 * frontFactor,
        alpha: 1.0
      };
    }
    const backDepth = -cosT;
    return {
      isBack: true,
      cosT,
      satScale: 0.28 - 0.14 * backDepth,
      valScale: 0.38 - 0.14 * backDepth,
      alpha: 0.76 - 0.16 * backDepth
    };
  }

  syncViewCol(engine) {
    if (!engine || !engine.is3D) return 0;
    const N = engine.cols;
    const target = ((engine.cursor.x + 1.0) % N + N) % N;
    if (this.viewCol === null || Number.isNaN(this.viewCol)) {
      this.viewCol = target;
      return this.viewCol;
    }
    const diff = ((target - this.viewCol + N * 1.5) % N) - N * 0.5;
    if (Math.abs(diff) < 0.005) {
      this.viewCol = target;
    } else {
      this.viewCol = ((this.viewCol + diff * 0.28) % N + N) % N;
    }
    return this.viewCol;
  }

  getCellFromCanvasPoint(engine, px, py) {
    if (!engine) return { col: 0, row: 0 };
    const offsetY = engine.riseOffset * CELL_PX;
    if (!engine.is3D) {
      const col = Math.max(0, Math.min(engine.cols - 1, Math.floor(px / CELL_PX)));
      const row = Math.max(0, Math.min(engine.rows - 1, Math.floor((py + offsetY) / CELL_PX)));
      return { col, row };
    }

    const metrics = this.getCylinderMetrics(engine);
    const { N, dTheta } = metrics;
    const vCol = (this.viewCol !== null && !Number.isNaN(this.viewCol))
      ? this.viewCol
      : ((engine.cursor.x + 1.0) % N);

    const approxRowY = py + offsetY;
    let bestCol = Math.floor(vCol) % N;
    let bestColDist = Infinity;

    for (let c = 0; c < N; c++) {
      const delta = ((c + 0.5 - vCol + N * 1.5) % N) - N * 0.5;
      const thetaC = delta * dTheta;
      const thetaL = thetaC - dTheta * 0.5;
      const thetaR = thetaC + dTheta * 0.5;
      const cosL = Math.cos(thetaL);
      const cosR = Math.cos(thetaR);
      if (Math.cos(thetaC) < 0) continue;
      if ((cosL < 0 && cosR > 0) || (cosL > 0 && cosR < 0)) continue;

      const pL = this.project3DPoint(metrics, thetaL, approxRowY);
      const pR = this.project3DPoint(metrics, thetaR, approxRowY);
      const minX = Math.min(pL.x, pR.x);
      const maxX = Math.max(pL.x, pR.x);
      if (maxX <= 0 || minX >= metrics.W) continue;
      if (px >= minX && px <= maxX) {
        bestCol = c;
        bestColDist = 0;
        break;
      }
      const midX = (pL.x + pR.x) * 0.5;
      const dist = Math.abs(px - midX);
      if (dist < bestColDist) {
        bestColDist = dist;
        bestCol = c;
      }
    }

    const bestDelta = ((bestCol + 0.5 - vCol + N * 1.5) % N) - N * 0.5;
    const bestThetaC = bestDelta * dTheta;
    let bestRow = 0;
    let bestRowDist = Infinity;
    for (let r = 0; r < engine.rows; r++) {
      const rowMidY = r * CELL_PX - offsetY + CELL_PX * 0.5;
      const proj = this.project3DPoint(metrics, bestThetaC, rowMidY);
      const dist = Math.abs(proj.y - py);
      if (dist < bestRowDist) {
        bestRowDist = dist;
        bestRow = r;
      }
    }

    return { col: bestCol, row: bestRow };
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

  drawGbDotPattern(ctx, bx, by, bw, bh, radius, gbStyle, valScale = 1.0) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(bx + 1, by + 1, bw - 2, bh - 2, Math.max(4, radius - 1));
    ctx.clip();

    const accentCol = dimHexColor(gbStyle.accent, 0, valScale);

    if (gbStyle.pattern === 'solid_dark' || gbStyle.pattern === 'solid_light') {
      // 中央クリーンベタ
    } else if (gbStyle.pattern === 'inner_white_box') {
      ctx.strokeStyle = accentCol;
      ctx.lineWidth = 2.2;
      ctx.strokeRect(bx + 4, by + 4, bw - 8, bh - 8);
    } else if (gbStyle.pattern === 'top_bottom_bars') {
      ctx.fillStyle = accentCol;
      ctx.fillRect(bx, by, bw, 4.5);
      ctx.fillRect(bx, by + bh - 4.5, bw, 4.5);
    } else if (gbStyle.pattern === 'white_circle_center') {
      ctx.fillStyle = accentCol;
      ctx.beginPath();
      ctx.arc(bx + bw / 2, by + bh / 2, Math.min(bw, bh) * 0.37, 0, Math.PI * 2);
      ctx.fill();
    } else if (gbStyle.pattern === 'corner_triangles') {
      ctx.fillStyle = accentCol;
      const cSize = 8;
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + cSize, by); ctx.lineTo(bx, by + cSize); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(bx + bw, by); ctx.lineTo(bx + bw - cSize, by); ctx.lineTo(bx + bw, by + cSize); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(bx, by + bh); ctx.lineTo(bx + cSize, by + bh); ctx.lineTo(bx, by + bh - cSize); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(bx + bw, by + bh); ctx.lineTo(bx + bw - cSize, by + bh); ctx.lineTo(bx + bw, by + bh - cSize); ctx.closePath(); ctx.fill();
    } else if (gbStyle.pattern === 'special_frame') {
      ctx.strokeStyle = accentCol;
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
    const nextSat = 0.16;
    const nextVal = 0.44;

    ctx.save();
    if (matchTimer > 0 && matchTimer <= 12) {
      const scale = 1.0 + (12 - matchTimer) * 0.014;
      ctx.translate(x + CELL_PX / 2, y + CELL_PX / 2);
      ctx.scale(scale, scale);
      ctx.translate(-(x + CELL_PX / 2), -(y + CELL_PX / 2));
    }

    if (gb) {
      const valScale = isNextRow ? nextVal : 1.0;
      ctx.fillStyle = isFlashing ? '#ffffff' : dimHexColor(gbStyle.bg, 0, valScale);
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, radius);
      ctx.fill();

      if (!isFlashing) {
        this.drawGbDotPattern(ctx, bx, by, bw, bh, radius, gbStyle, valScale);
        ctx.strokeStyle = dimHexColor(gbStyle.stroke, 0, valScale);
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
      ctx.fillStyle = isFlashing
        ? '#94a3b8'
        : (isNextRow ? dimHexColor(conf.bg, nextSat, nextVal) : conf.bg);
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, radius);
      ctx.fill();

      if (!isFlashing) {
        const topGrad = ctx.createLinearGradient(bx, by, bx, by + bh);
        if (isNextRow) {
          topGrad.addColorStop(0, 'rgba(255, 255, 255, 0.10)');
          topGrad.addColorStop(0.5, 'rgba(0, 0, 0, 0.08)');
          topGrad.addColorStop(1, 'rgba(0, 0, 0, 0.42)');
        } else {
          topGrad.addColorStop(0, 'rgba(255, 255, 255, 0.42)');
          topGrad.addColorStop(0.42, 'rgba(255, 255, 255, 0.08)');
          topGrad.addColorStop(0.55, 'rgba(0, 0, 0, 0.0)');
          topGrad.addColorStop(1, 'rgba(0, 0, 0, 0.34)');
        }
        ctx.fillStyle = topGrad;
        ctx.beginPath();
        ctx.roundRect(bx, by, bw, bh, radius);
        ctx.fill();

        ctx.strokeStyle = isNextRow
          ? 'rgba(255, 255, 255, 0.16)'
          : (conf.isSpecial ? 'rgba(0, 0, 0, 0.25)' : 'rgba(255, 255, 255, 0.36)');
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

    const cx = x + CELL_PX / 2;
    const cy = y + CELL_PX / 2 + bounceY;
    ctx.font = gb ? '900 18px sans-serif' : 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (gb) {
      if (!isFlashing) {
        const valScale = isNextRow ? 0.52 : 1.0;
        if (gbStyle.pattern === 'inner_white_box') {
          ctx.lineJoin = 'round';
          ctx.lineWidth = 3.2;
          ctx.strokeStyle = dimHexColor(gbStyle.textStroke, 0, valScale);
          ctx.strokeText(conf.symbol, cx, cy);
        }
        ctx.fillStyle = dimHexColor(gbStyle.text, 0, valScale);
        ctx.fillText(conf.symbol, cx, cy);
      } else {
        ctx.fillStyle = '#000000';
        ctx.fillText(conf.symbol, cx, cy);
      }
    } else {
      if (!isFlashing && !conf.isSpecial) {
        ctx.fillStyle = isNextRow ? 'rgba(0, 0, 0, 0.25)' : 'rgba(0, 0, 0, 0.45)';
        ctx.fillText(conf.symbol, cx, cy + 1.5);
      }
      ctx.fillStyle = isFlashing
        ? '#ffffff'
        : (isNextRow ? dimHexColor(conf.textColor || '#ffffff', nextSat, 0.56) : (conf.textColor || '#ffffff'));
      ctx.fillText(conf.symbol, cx, cy);
    }

    ctx.restore();
  }

  drawMatchParticles2D(ctx, engine, offsetY) {
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

  drawGarbageCell(ctx, x, y, b, sameTop, sameBottom, sameLeft, sameRight, isNextRow = false) {
    const isFlashing = (b.state === 'match' && Math.floor(b.timer / 4) % 2 === 0);
    const gb = this.isGbActive();
    const nextSat = isNextRow ? 0.14 : 1.0;
    const nextVal = isNextRow ? 0.46 : 1.0;

    const rawFill = isFlashing
      ? '#ffffff'
      : (gb ? (b.isHard ? '#c8c8c8' : '#585858') : (b.isHard ? '#a8b2bd' : '#5c636a'));
    ctx.fillStyle = isNextRow && !isFlashing ? dimHexColor(rawFill, nextSat, nextVal) : rawFill;
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
        gGrad.addColorStop(0, isNextRow ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.18)');
        gGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.0)');
        gGrad.addColorStop(1, 'rgba(0, 0, 0, 0.28)');
        ctx.fillStyle = gGrad;
        ctx.fillRect(x, y, CELL_PX, CELL_PX);
      }
    }

    const rawBorder = gb ? (b.isHard ? '#111111' : '#f0f0f0') : '#dee2e6';
    ctx.strokeStyle = isNextRow ? dimHexColor(rawBorder, nextSat, 0.52) : rawBorder;
    ctx.lineWidth = gb ? 2.4 : 2;
    ctx.beginPath();
    if (!sameTop) { ctx.moveTo(x, y + 1); ctx.lineTo(x + CELL_PX, y + 1); }
    if (!sameBottom) { ctx.moveTo(x, y + CELL_PX - 1); ctx.lineTo(x + CELL_PX, y + CELL_PX - 1); }
    if (!sameLeft) { ctx.moveTo(x + 1, y); ctx.lineTo(x + 1, y + CELL_PX); }
    if (!sameRight) { ctx.moveTo(x + CELL_PX - 1, y); ctx.lineTo(x + CELL_PX - 1, y + CELL_PX); }
    ctx.stroke();

    if (!isFlashing && !isNextRow) {
      ctx.fillStyle = gb ? (b.isHard ? '#111111' : '#ffffff') : 'rgba(255, 255, 255, 0.35)';
      if (!sameTop && !sameLeft) { ctx.beginPath(); ctx.arc(x + 5, y + 5, 1.8, 0, Math.PI * 2); ctx.fill(); }
      if (!sameTop && !sameRight) { ctx.beginPath(); ctx.arc(x + CELL_PX - 5, y + 5, 1.8, 0, Math.PI * 2); ctx.fill(); }
      if (!sameBottom && !sameLeft) { ctx.beginPath(); ctx.arc(x + 5, y + CELL_PX - 5, 1.8, 0, Math.PI * 2); ctx.fill(); }
      if (!sameBottom && !sameRight) { ctx.beginPath(); ctx.arc(x + CELL_PX - 5, y + CELL_PX - 5, 1.8, 0, Math.PI * 2); ctx.fill(); }
    }

    if (b.isHard) {
      ctx.strokeStyle = gb ? (isNextRow ? dimHexColor('#111111', 0, nextVal) : '#111111') : 'rgba(15, 15, 15, 0.45)';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(x + CELL_PX * 0.25, y + CELL_PX * 0.25);
      ctx.lineTo(x + CELL_PX * 0.75, y + CELL_PX * 0.75);
      ctx.moveTo(x + CELL_PX * 0.75, y + CELL_PX * 0.25);
      ctx.lineTo(x + CELL_PX * 0.25, y + CELL_PX * 0.75);
      ctx.stroke();

      ctx.strokeStyle = gb
        ? (isNextRow ? dimHexColor('#ffffff', 0, 0.52) : '#ffffff')
        : (isNextRow ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.5)');
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(x + CELL_PX * 0.25, y + CELL_PX * 0.25);
      ctx.lineTo(x + CELL_PX * 0.75, y + CELL_PX * 0.75);
      ctx.moveTo(x + CELL_PX * 0.75, y + CELL_PX * 0.25);
      ctx.lineTo(x + CELL_PX * 0.25, y + CELL_PX * 0.75);
      ctx.stroke();
    } else if (!gb) {
      ctx.fillStyle = isNextRow ? 'rgba(255, 255, 255, 0.04)' : 'rgba(255, 255, 255, 0.1)';
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

  drawCellContent(ctx, engine, r, c, b, x, y, isEnginePanic, highestCols, time) {
    const N = engine.cols;
    if (b.type === 'garbage') {
      if (b.state === 'purify_anim') {
        const pMax = b.purifyMax || 46;
        const remRatio = Math.max(0, (b.purifyTimer || 0) / pMax);
        const progress = 1 - remRatio;
        const isFlash = Math.floor((b.purifyTimer || 0) / 3) % 2 === 0;
        const shrink = progress * (CELL_PX * 0.24);
        ctx.save();
        ctx.globalAlpha = Math.max(0.12, remRatio);
        ctx.fillStyle = isFlash ? '#ffffff' : (this.isGbActive() ? '#a3a3a3' : '#4ecca3');
        ctx.fillRect(x + shrink, y + shrink, CELL_PX - shrink * 2, CELL_PX - shrink * 2);
        ctx.strokeStyle = this.isGbActive() ? '#ffffff' : '#ffd700';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + shrink + 1, y + shrink + 1, CELL_PX - shrink * 2 - 2, CELL_PX - shrink * 2 - 2);
        ctx.restore();
      } else {
        const cLeft = engine.is3D ? ((c - 1 + N) % N) : (c - 1);
        const cRight = engine.is3D ? ((c + 1) % N) : (c + 1);
        const sameTop = b.groupId && r > 0 && engine.grid[r - 1][c] && engine.grid[r - 1][c].groupId === b.groupId;
        const sameBottom = b.groupId && r < engine.rows - 1 && engine.grid[r + 1][c] && engine.grid[r + 1][c].groupId === b.groupId;
        const sameLeft = b.groupId && cLeft >= 0 && engine.grid[r][cLeft] && engine.grid[r][cLeft].groupId === b.groupId;
        const sameRight = b.groupId && cRight < N && engine.grid[r][cRight] && engine.grid[r][cRight].groupId === b.groupId;
        this.drawGarbageCell(ctx, x, y, b, sameTop, sameBottom, sameLeft, sameRight, false);
      }
    } else {
      const conf = COLORS.find(item => item.id === b.type);
      if (conf) {
        const isFlashing = (b.state === 'match' && Math.floor(b.timer / 4) % 2 === 0);
        const isHighestCol = isEnginePanic && highestCols.has(c);
        const bounceY = isHighestCol ? Math.sin(time / 60 + c) * 3 : 0;
        const matchTimer = (b.state === 'match') ? b.timer : 0;
        this.drawPanelBlock(ctx, x, y, conf, isFlashing, bounceY, false, matchTimer);
      }
    }
  }

  // ==========================================
  // 3D円筒用：台形パース＋角度付きブロック描画（前面・後面共通）
  // ==========================================
  drawPanelBlock3D(ctx, pLT, pRT, pRB, pLB, conf, lighting, isFlashing, bounceY = 0, matchTimer = 0, isNextRow = false) {
    const gb = this.isGbActive();
    const gbStyle = gb ? (GB_BLOCK_PALETTE[conf.id] || GB_BLOCK_PALETTE[3]) : null;
    const { satScale, valScale, isBack, alpha } = lighting;

    let qLT = bilerpQuad(pLT, pRT, pRB, pLB, 0.055, 0.055);
    let qRT = bilerpQuad(pLT, pRT, pRB, pLB, 0.945, 0.055);
    let qRB = bilerpQuad(pLT, pRT, pRB, pLB, 0.945, 0.945);
    let qLB = bilerpQuad(pLT, pRT, pRB, pLB, 0.055, 0.945);

    if (matchTimer > 0 && matchTimer <= 12) {
      const expand = (12 - matchTimer) * 0.008;
      qLT = bilerpQuad(pLT, pRT, pRB, pLB, 0.055 - expand, 0.055 - expand);
      qRT = bilerpQuad(pLT, pRT, pRB, pLB, 0.945 + expand, 0.055 - expand);
      qRB = bilerpQuad(pLT, pRT, pRB, pLB, 0.945 + expand, 0.945 + expand);
      qLB = bilerpQuad(pLT, pRT, pRB, pLB, 0.055 - expand, 0.945 + expand);
    }

    ctx.save();
    ctx.globalAlpha *= alpha;

    if (gb) {
      const baseHex = isFlashing ? '#ffffff' : gbStyle.bg;
      const strokeHex = isFlashing ? '#000000' : gbStyle.stroke;
      const accentHex = gbStyle.accent;
      ctx.fillStyle = dimHexColor(baseHex, 0, valScale);
      traceQuadPath(ctx, qLT, qRT, qRB, qLB);
      ctx.fill();

      if (!isFlashing) {
        const accCol = dimHexColor(accentHex, 0, valScale);
        if (gbStyle.pattern === 'inner_white_box' || gbStyle.pattern === 'special_frame') {
          const i0 = bilerpQuad(qLT, qRT, qRB, qLB, 0.14, 0.14);
          const i1 = bilerpQuad(qLT, qRT, qRB, qLB, 0.86, 0.14);
          const i2 = bilerpQuad(qLT, qRT, qRB, qLB, 0.86, 0.86);
          const i3 = bilerpQuad(qLT, qRT, qRB, qLB, 0.14, 0.86);
          ctx.strokeStyle = accCol;
          ctx.lineWidth = isBack ? 1.4 : 2.0;
          traceQuadPath(ctx, i0, i1, i2, i3);
          ctx.stroke();
        } else if (gbStyle.pattern === 'top_bottom_bars') {
          const t2 = bilerpQuad(qLT, qRT, qRB, qLB, 1, 0.16);
          const t3 = bilerpQuad(qLT, qRT, qRB, qLB, 0, 0.16);
          const b0 = bilerpQuad(qLT, qRT, qRB, qLB, 0, 0.84);
          const b1 = bilerpQuad(qLT, qRT, qRB, qLB, 1, 0.84);
          ctx.fillStyle = accCol;
          traceQuadPath(ctx, qLT, qRT, t2, t3);
          ctx.fill();
          traceQuadPath(ctx, b0, b1, qRB, qLB);
          ctx.fill();
        } else if (gbStyle.pattern === 'corner_triangles') {
          ctx.fillStyle = accCol;
          const tri = (pA, pB, pC) => {
            ctx.beginPath();
            ctx.moveTo(pA.x, pA.y);
            ctx.lineTo(pB.x, pB.y);
            ctx.lineTo(pC.x, pC.y);
            ctx.closePath();
            ctx.fill();
          };
          tri(qLT, bilerpQuad(qLT, qRT, qRB, qLB, 0.25, 0), bilerpQuad(qLT, qRT, qRB, qLB, 0, 0.25));
          tri(qRT, bilerpQuad(qLT, qRT, qRB, qLB, 0.75, 0), bilerpQuad(qLT, qRT, qRB, qLB, 1, 0.25));
          tri(qLB, bilerpQuad(qLT, qRT, qRB, qLB, 0.25, 1), bilerpQuad(qLT, qRT, qRB, qLB, 0, 0.75));
          tri(qRB, bilerpQuad(qLT, qRT, qRB, qLB, 0.75, 1), bilerpQuad(qLT, qRT, qRB, qLB, 1, 0.75));
        }
      }

      ctx.strokeStyle = dimHexColor(strokeHex, 0, isBack ? valScale * 0.9 : Math.min(1, valScale + (isNextRow ? 0.04 : 0.15)));
      ctx.lineWidth = isBack ? 1.2 : 1.8;
      traceQuadPath(ctx, qLT, qRT, qRB, qLB);
      ctx.stroke();
    } else {
      const baseColor = isFlashing
        ? dimHexColor('#94a3b8', satScale, valScale)
        : dimHexColor(conf.bg, satScale, valScale);
      ctx.fillStyle = baseColor;
      traceQuadPath(ctx, qLT, qRT, qRB, qLB);
      ctx.fill();

      if (!isFlashing) {
        const midTop = bilerpQuad(qLT, qRT, qRB, qLB, 0.5, 0);
        const midBot = bilerpQuad(qLT, qRT, qRB, qLB, 0.5, 1);
        const grad = ctx.createLinearGradient(midTop.x, midTop.y, midBot.x, midBot.y);
        if (isBack || isNextRow) {
          grad.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
          grad.addColorStop(1, 'rgba(0, 0, 0, 0.38)');
        } else {
          grad.addColorStop(0, 'rgba(255, 255, 255, 0.42)');
          grad.addColorStop(0.42, 'rgba(255, 255, 255, 0.07)');
          grad.addColorStop(0.56, 'rgba(0, 0, 0, 0.0)');
          grad.addColorStop(1, 'rgba(0, 0, 0, 0.34)');
        }
        ctx.fillStyle = grad;
        traceQuadPath(ctx, qLT, qRT, qRB, qLB);
        ctx.fill();

        const b0 = bilerpQuad(qLT, qRT, qRB, qLB, 0.04, 0.04);
        const b1 = bilerpQuad(qLT, qRT, qRB, qLB, 0.96, 0.04);
        const b2 = bilerpQuad(qLT, qRT, qRB, qLB, 0.96, 0.96);
        const b3 = bilerpQuad(qLT, qRT, qRB, qLB, 0.04, 0.96);
        ctx.strokeStyle = (isBack || isNextRow)
          ? 'rgba(200, 210, 225, 0.16)'
          : (conf.isSpecial ? 'rgba(0, 0, 0, 0.28)' : 'rgba(255, 255, 255, 0.38)');
        ctx.lineWidth = (isBack || isNextRow) ? 0.9 : 1.25;
        traceQuadPath(ctx, b0, b1, b2, b3);
        ctx.stroke();
      } else {
        ctx.strokeStyle = isBack ? 'rgba(220, 220, 220, 0.45)' : 'rgba(255, 255, 255, 0.85)';
        ctx.lineWidth = 1.4;
        traceQuadPath(ctx, qLT, qRT, qRB, qLB);
        ctx.stroke();
      }
    }

    const pcX = (qLT.x + qRT.x + qRB.x + qLB.x) * 0.25;
    const pcY = (qLT.y + qRT.y + qRB.y + qLB.y) * 0.25;
    const Ux = ((qRT.x - qLT.x) + (qRB.x - qLB.x)) * 0.5;
    const Uy = ((qRT.y - qLT.y) + (qRB.y - qLB.y)) * 0.5;
    const Vx = ((qLB.x - qLT.x) + (qRB.x - qRT.x)) * 0.5;
    const Vy = ((qLB.y - qLT.y) + (qRB.y - qRT.y)) * 0.5;
    const horizLen = Math.hypot(Ux, Uy);

    if (horizLen >= 2.2) {
      ctx.save();
      ctx.transform(Ux / CELL_PX, Uy / CELL_PX, Vx / CELL_PX, Vy / CELL_PX, pcX, pcY);

      if (gb && !isFlashing && gbStyle.pattern === 'white_circle_center') {
        ctx.fillStyle = dimHexColor(gbStyle.accent, 0, valScale);
        ctx.beginPath();
        ctx.arc(0, 0, CELL_PX * 0.34, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.font = gb ? '900 18px sans-serif' : 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      if (gb) {
        if (!isFlashing) {
          if (gbStyle.pattern === 'inner_white_box') {
            ctx.lineJoin = 'round';
            ctx.lineWidth = 3.2;
            ctx.strokeStyle = dimHexColor(gbStyle.textStroke, 0, valScale);
            ctx.strokeText(conf.symbol, 0, bounceY);
          }
          ctx.fillStyle = dimHexColor(gbStyle.text, 0, valScale);
          ctx.fillText(conf.symbol, 0, bounceY);
        } else {
          ctx.fillStyle = dimHexColor('#000000', 0, valScale);
          ctx.fillText(conf.symbol, 0, bounceY);
        }
      } else {
        if (!isFlashing && !conf.isSpecial && !isBack && !isNextRow) {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
          ctx.fillText(conf.symbol, 0, bounceY + 1.5);
        }
        const symCol = isFlashing
          ? dimHexColor('#ffffff', satScale, Math.min(1, valScale + 0.12))
          : dimHexColor(conf.textColor || '#ffffff', satScale, (isBack || isNextRow) ? Math.min(0.68, valScale + 0.16) : Math.min(1, valScale + 0.08));
        ctx.fillStyle = symCol;
        ctx.fillText(conf.symbol, 0, bounceY);
      }

      ctx.restore();
    }

    ctx.restore();
  }

  drawGarbageCell3D(ctx, pLT, pRT, pRB, pLB, b, lighting, sameTop, sameBottom, sameLeft, sameRight, isNextRow = false) {
    const isFlashing = (b.state === 'match' && Math.floor(b.timer / 4) % 2 === 0);
    const gb = this.isGbActive();
    const { satScale, valScale, isBack, alpha } = lighting;

    ctx.save();
    ctx.globalAlpha *= alpha;

    const rawFill = isFlashing
      ? '#ffffff'
      : (gb ? (b.isHard ? '#c8c8c8' : '#585858') : (b.isHard ? '#a8b2bd' : '#5c636a'));
    ctx.fillStyle = dimHexColor(rawFill, satScale, valScale);
    traceQuadPath(ctx, pLT, pRT, pRB, pLB);
    ctx.fill();

    if (!isFlashing) {
      const midTop = bilerpQuad(pLT, pRT, pRB, pLB, 0.5, 0);
      const midBot = bilerpQuad(pLT, pRT, pRB, pLB, 0.5, 1);
      const gGrad = ctx.createLinearGradient(midTop.x, midTop.y, midBot.x, midBot.y);
      gGrad.addColorStop(0, (isBack || isNextRow) ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.18)');
      gGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.0)');
      gGrad.addColorStop(1, 'rgba(0, 0, 0, 0.28)');
      ctx.fillStyle = gGrad;
      traceQuadPath(ctx, pLT, pRT, pRB, pLB);
      ctx.fill();
    }

    const rawBorder = gb ? (b.isHard ? '#111111' : '#f0f0f0') : '#dee2e6';
    ctx.strokeStyle = dimHexColor(rawBorder, satScale, (isBack || isNextRow) ? valScale * 0.9 : Math.min(1, valScale + 0.15));
    ctx.lineWidth = isBack ? 1.2 : (gb ? 2.2 : 1.8);
    ctx.beginPath();
    if (!sameTop) { ctx.moveTo(pLT.x, pLT.y); ctx.lineTo(pRT.x, pRT.y); }
    if (!sameBottom) { ctx.moveTo(pLB.x, pLB.y); ctx.lineTo(pRB.x, pRB.y); }
    if (!sameLeft) { ctx.moveTo(pLT.x, pLT.y); ctx.lineTo(pLB.x, pLB.y); }
    if (!sameRight) { ctx.moveTo(pRT.x, pRT.y); ctx.lineTo(pRB.x, pRB.y); }
    ctx.stroke();

    if (b.isHard) {
      const d0 = bilerpQuad(pLT, pRT, pRB, pLB, 0.25, 0.25);
      const d1 = bilerpQuad(pLT, pRT, pRB, pLB, 0.75, 0.25);
      const d2 = bilerpQuad(pLT, pRT, pRB, pLB, 0.75, 0.75);
      const d3 = bilerpQuad(pLT, pRT, pRB, pLB, 0.25, 0.75);

      ctx.strokeStyle = gb ? dimHexColor('#111111', 0, valScale) : 'rgba(15, 15, 15, 0.45)';
      ctx.lineWidth = isBack ? 2.5 : 4.2;
      ctx.beginPath();
      ctx.moveTo(d0.x, d0.y); ctx.lineTo(d2.x, d2.y);
      ctx.moveTo(d1.x, d1.y); ctx.lineTo(d3.x, d3.y);
      ctx.stroke();

      ctx.strokeStyle = gb
        ? dimHexColor('#ffffff', 0, valScale)
        : ((isBack || isNextRow) ? 'rgba(220, 220, 220, 0.28)' : 'rgba(255, 255, 255, 0.5)');
      ctx.lineWidth = isBack ? 1.2 : 2.1;
      ctx.beginPath();
      ctx.moveTo(d0.x, d0.y); ctx.lineTo(d2.x, d2.y);
      ctx.moveTo(d1.x, d1.y); ctx.lineTo(d3.x, d3.y);
      ctx.stroke();
    }

    if (b.state === 'transforming' && b.transformDelay < 13) {
      ctx.fillStyle = `rgba(255, 255, 255, ${((13 - b.transformDelay) / 13) * (isBack ? 0.45 : 1)})`;
      traceQuadPath(ctx, pLT, pRT, pRB, pLB);
      ctx.fill();
    }
    if (b.particleTimer > 0) {
      ctx.fillStyle = `rgba(255, 255, 255, ${(b.particleTimer / 35) * (isBack ? 0.45 : 1)})`;
      traceQuadPath(ctx, pLT, pRT, pRB, pLB);
      ctx.fill();
    }

    ctx.restore();
  }

  drawCell3D(ctx, engine, r, c, b, pLT, pRT, pRB, pLB, lighting, isEnginePanic, highestCols, time, isNextRow = false) {
    const N = engine.cols;
    if (b.type === 'garbage') {
      if (b.state === 'purify_anim') {
        const pMax = b.purifyMax || 46;
        const remRatio = Math.max(0, (b.purifyTimer || 0) / pMax);
        const progress = 1 - remRatio;
        const isFlash = Math.floor((b.purifyTimer || 0) / 3) % 2 === 0;
        const s = progress * 0.24;
        const q0 = bilerpQuad(pLT, pRT, pRB, pLB, s, s);
        const q1 = bilerpQuad(pLT, pRT, pRB, pLB, 1 - s, s);
        const q2 = bilerpQuad(pLT, pRT, pRB, pLB, 1 - s, 1 - s);
        const q3 = bilerpQuad(pLT, pRT, pRB, pLB, s, 1 - s);

        ctx.save();
        ctx.globalAlpha *= Math.max(0.12, remRatio) * lighting.alpha;
        const rawCol = isFlash ? '#ffffff' : (this.isGbActive() ? '#a3a3a3' : '#4ecca3');
        ctx.fillStyle = dimHexColor(rawCol, lighting.satScale, lighting.valScale);
        traceQuadPath(ctx, q0, q1, q2, q3);
        ctx.fill();
        ctx.strokeStyle = dimHexColor(this.isGbActive() ? '#ffffff' : '#ffd700', lighting.satScale, lighting.valScale);
        ctx.lineWidth = lighting.isBack ? 1.2 : 1.8;
        traceQuadPath(ctx, q0, q1, q2, q3);
        ctx.stroke();
        ctx.restore();
      } else {
        const cLeft = (c - 1 + N) % N;
        const cRight = (c + 1) % N;
        const rowArr = isNextRow ? engine.nextRow : engine.grid[r];
        const sameTop = !isNextRow && b.groupId && r > 0 && engine.grid[r - 1][c] && engine.grid[r - 1][c].groupId === b.groupId;
        const sameBottom = !isNextRow && b.groupId && r < engine.rows - 1 && engine.grid[r + 1][c] && engine.grid[r + 1][c].groupId === b.groupId;
        const sameLeft = !!(b.groupId && rowArr && rowArr[cLeft] && rowArr[cLeft].groupId === b.groupId);
        const sameRight = !!(b.groupId && rowArr && rowArr[cRight] && rowArr[cRight].groupId === b.groupId);
        this.drawGarbageCell3D(ctx, pLT, pRT, pRB, pLB, b, lighting, sameTop, sameBottom, sameLeft, sameRight, isNextRow);
      }
    } else {
      const conf = COLORS.find(item => item.id === b.type);
      if (conf) {
        const isFlashing = (b.state === 'match' && Math.floor(b.timer / 4) % 2 === 0);
        const isHighestCol = !isNextRow && isEnginePanic && highestCols.has(c);
        const bounceY = isHighestCol ? Math.sin(time / 60 + c) * 3 : 0;
        const matchTimer = (b.state === 'match') ? b.timer : 0;
        this.drawPanelBlock3D(ctx, pLT, pRT, pRB, pLB, conf, lighting, isFlashing, bounceY, matchTimer, isNextRow);
      }
    }
  }

  drawCylinderWireRings(ctx, metrics, vCol, isFrontHalf) {
    const { N, dTheta, thetaEdge } = metrics;
    const totalH = ROWS * CELL_PX;
    const steps = 28;
    ctx.save();
    ctx.strokeStyle = isFrontHalf ? 'rgba(255, 255, 255, 0.22)' : 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = isFrontHalf ? 1.4 : 1.0;

    [0, totalH].forEach(yPos => {
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const frac = (i / steps) * 2 - 1;
        const theta = isFrontHalf
          ? (frac * thetaEdge)
          : (frac >= 0 ? Math.PI - frac * thetaEdge : -Math.PI - frac * thetaEdge);
        const pt = this.project3DPoint(metrics, theta, yPos);
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      }
      ctx.stroke();
    });

    ctx.strokeStyle = isFrontHalf ? 'rgba(255, 255, 255, 0.09)' : 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    for (let c = 0; c < N; c++) {
      const delta = ((c - vCol + N * 1.5) % N) - N * 0.5;
      const theta = delta * dTheta;
      const cosT = Math.cos(theta);
      if (isFrontHalf ? (cosT < 0) : (cosT >= 0)) continue;
      const pTop = this.project3DPoint(metrics, theta, 0);
      const pBot = this.project3DPoint(metrics, theta, totalH);
      if (pTop.x < -2 || pTop.x > metrics.W + 2) continue;
      ctx.beginPath();
      ctx.moveTo(pTop.x, pTop.y);
      ctx.lineTo(pBot.x, pBot.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawCylinderInteriorVeil(ctx, metrics) {
    const { W, H, thetaEdge } = metrics;
    const steps = 28;
    const topRing = [];
    const botRing = [];
    for (let i = 0; i <= steps; i++) {
      const t = ((i / steps) * 2 - 1) * thetaEdge;
      topRing.push(this.project3DPoint(metrics, t, 0));
      botRing.push(this.project3DPoint(metrics, t, H));
    }

    ctx.save();
    ctx.beginPath();
    topRing.forEach((p, idx) => {
      if (idx === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    for (let i = botRing.length - 1; i >= 0; i--) {
      ctx.lineTo(botRing[i].x, botRing[i].y);
    }
    ctx.closePath();

    const veilGrad = ctx.createLinearGradient(0, 0, W, 0);
    veilGrad.addColorStop(0, 'rgba(6, 10, 22, 0.44)');
    veilGrad.addColorStop(0.22, 'rgba(6, 10, 22, 0.24)');
    veilGrad.addColorStop(0.5, 'rgba(10, 16, 32, 0.16)');
    veilGrad.addColorStop(0.78, 'rgba(6, 10, 22, 0.24)');
    veilGrad.addColorStop(1, 'rgba(6, 10, 22, 0.44)');
    ctx.fillStyle = veilGrad;
    ctx.fill();
    ctx.restore();
  }

  draw3DCylinder(ctx, engine, offsetY, isEnginePanic, highestCols, time) {
    const metrics = this.getCylinderMetrics(engine);
    const { N, W, dTheta } = metrics;
    const vCol = this.syncViewCol(engine);
    const gb = this.isGbActive();
    const grayOutNextRow = !engine.endAnim;

    const cylGrad = ctx.createLinearGradient(0, 0, W, 0);
    cylGrad.addColorStop(0, 'rgba(0, 0, 0, 0.34)');
    cylGrad.addColorStop(0.2, 'rgba(0, 0, 0, 0.06)');
    cylGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.03)');
    cylGrad.addColorStop(0.8, 'rgba(0, 0, 0, 0.06)');
    cylGrad.addColorStop(1, 'rgba(0, 0, 0, 0.34)');
    ctx.fillStyle = cylGrad;
    ctx.fillRect(0, 0, W, this.canvas.height);

    this.drawCylinderWireRings(ctx, metrics, vCol, false);

    const backItems = [];
    const frontItems = [];
    const matchParticles = [];

    for (let c = 0; c < N; c++) {
      const delta = ((c + 0.5 - vCol + N * 1.5) % N) - N * 0.5;
      const baseThetaC = delta * dTheta;

      for (let r = 0; r < engine.rows; r++) {
        const b = engine.grid[r][c];
        if (!b) continue;

        let thetaC = baseThetaC;
        if (b.swapAnim) {
          thetaC -= b.swapAnim.dir * (b.swapAnim.timer / 3) * dTheta;
        }
        const cosT = Math.cos(thetaC);
        const item = { r, c, b, thetaC, cosT, isNextRow: false };
        if (cosT < 0) backItems.push(item);
        else frontItems.push(item);

        if (b.state === 'match' && b.timer <= 16 && b.timer > 0) {
          matchParticles.push({ r, c, b, thetaC, cosT });
        }
      }

      if (offsetY > 0.5 && engine.nextRow && engine.nextRow[c]) {
        const nb = engine.nextRow[c];
        const cosT = Math.cos(baseThetaC);
        const item = { r: engine.rows, c, b: nb, thetaC: baseThetaC, cosT, isNextRow: true };
        if (cosT < 0) backItems.push(item);
        else frontItems.push(item);
      }
    }

    const sortPainterOrder = (a, b) => {
      if (Math.abs(a.cosT - b.cosT) > 0.002) return a.cosT - b.cosT;
      return a.r - b.r;
    };
    backItems.sort(sortPainterOrder);
    frontItems.sort(sortPainterOrder);

    const renderCellList = (items) => {
      for (let i = 0; i < items.length; i++) {
        const { r, c, b, thetaC, isNextRow } = items[i];
        const thetaL = thetaC - dTheta * 0.5;
        const thetaR = thetaC + dTheta * 0.5;

        const cosL = Math.cos(thetaL);
        const cosR = Math.cos(thetaR);
        if ((cosL < 0 && cosR > 0) || (cosL > 0 && cosR < 0)) {
          continue;
        }

        let lighting = this.getBlockLighting(thetaC);
        if (isNextRow && grayOutNextRow) {
          lighting = {
            ...lighting,
            satScale: lighting.satScale * 0.16,
            valScale: lighting.valScale * 0.45
          };
        }

        if (isNextRow) {
          const rowYTop = engine.rows * CELL_PX - offsetY;
          const rowYBotClip = engine.rows * CELL_PX;
          const rowYBotFull = rowYTop + CELL_PX;

          const cLT = this.project3DPoint(metrics, thetaL, rowYTop);
          const cRT = this.project3DPoint(metrics, thetaR, rowYTop);
          const cRB = this.project3DPoint(metrics, thetaR, rowYBotClip);
          const cLB = this.project3DPoint(metrics, thetaL, rowYBotClip);

          if (Math.max(cLT.x, cRT.x) <= -2 || Math.min(cLT.x, cRT.x) >= W + 2) continue;

          const fLB = this.project3DPoint(metrics, thetaL, rowYBotFull);
          const fRB = this.project3DPoint(metrics, thetaR, rowYBotFull);

          ctx.save();
          traceQuadPath(ctx, cLT, cRT, cRB, cLB);
          ctx.clip();
          this.drawCell3D(ctx, engine, r, c, b, cLT, cRT, fRB, fLB, lighting, isEnginePanic, highestCols, time, grayOutNextRow);
          ctx.restore();
        } else {
          const rowYTop = r * CELL_PX - offsetY + (b.fallY * CELL_PX);
          const rowYBot = rowYTop + CELL_PX;

          const pLT = this.project3DPoint(metrics, thetaL, rowYTop);
          const pRT = this.project3DPoint(metrics, thetaR, rowYTop);
          const pRB = this.project3DPoint(metrics, thetaR, rowYBot);
          const pLB = this.project3DPoint(metrics, thetaL, rowYBot);

          if (Math.max(pLT.x, pRT.x) <= -2 || Math.min(pLT.x, pRT.x) >= W + 2) continue;

          this.drawCell3D(ctx, engine, r, c, b, pLT, pRT, pRB, pLB, lighting, isEnginePanic, highestCols, time, false);
        }
      }
    };

    renderCellList(backItems);
    this.drawCylinderInteriorVeil(ctx, metrics);
    this.drawCylinderWireRings(ctx, metrics, vCol, true);
    renderCellList(frontItems);

    const dirs = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    for (let i = 0; i < matchParticles.length; i++) {
      const { r, b, thetaC, cosT } = matchParticles[i];
      const p = (16 - b.timer) / 16;
      const rowMidY = r * CELL_PX - offsetY + (b.fallY * CELL_PX) + CELL_PX * 0.5;
      const center = this.project3DPoint(metrics, thetaC, rowMidY);
      if (center.x < -10 || center.x > W + 10) continue;
      const conf = b.type === 'garbage' ? null : COLORS.find(item => item.id === b.type);
      const rawColor = gb ? '#d4d4d4' : (conf ? conf.bg : '#e2e8f0');
      const lighting = this.getBlockLighting(thetaC);
      const color = dimHexColor(rawColor, lighting.satScale, lighting.valScale);

      const pScale = center.persp;
      const dist = (CELL_PX * 0.34 + p * (CELL_PX * 0.40)) * pScale;
      const size = Math.max(1.8, (1 - p * 0.55) * 5.8 * pScale);
      const alpha = Math.max(0, 1 - p * 0.92) * (cosT < 0 ? 0.55 : 1.0);

      ctx.save();
      ctx.globalAlpha = alpha;
      dirs.forEach(([dx, dy]) => {
        const px = center.x + dx * dist * Math.max(0.3, Math.abs(cosT));
        const py = center.y + dy * dist;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(px, py - size);
        ctx.lineTo(px + size, py);
        ctx.lineTo(px, py + size);
        ctx.lineTo(px - size, py);
        ctx.closePath();
        ctx.fill();
      });
      ctx.restore();
    }

    if (!engine.endAnim) {
      const c1 = engine.cursor.x;
      const delta1 = ((c1 + 0.5 - vCol + N * 1.5) % N) - N * 0.5;
      const theta1L = (delta1 - 0.5) * dTheta;
      const thetaMid = (delta1 + 0.5) * dTheta;
      const theta2R = (delta1 + 1.5) * dTheta;

      const yTop = engine.cursor.y * CELL_PX - offsetY;
      const yBot = yTop + CELL_PX;

      const t0 = this.project3DPoint(metrics, theta1L, yTop);
      const t1 = this.project3DPoint(metrics, thetaMid, yTop);
      const t2 = this.project3DPoint(metrics, theta2R, yTop);
      const b2 = this.project3DPoint(metrics, theta2R, yBot);
      const b1 = this.project3DPoint(metrics, thetaMid, yBot);
      const b0 = this.project3DPoint(metrics, theta1L, yBot);

      ctx.save();
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(t0.x, t0.y);
      ctx.lineTo(t1.x, t1.y);
      ctx.lineTo(t2.x, t2.y);
      ctx.lineTo(b2.x, b2.y);
      ctx.lineTo(b1.x, b1.y);
      ctx.lineTo(b0.x, b0.y);
      ctx.closePath();

      ctx.strokeStyle = 'rgba(0, 0, 0, 0.82)';
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(t1.x, t1.y);
      ctx.lineTo(b1.x, b1.y);
      ctx.stroke();
      ctx.restore();
    }

    if (!engine.endAnim) {
      const barH = 5;
      const segW = W / N;
      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.fillRect(0, 0, W, barH + 1);
      for (let c = 0; c < N; c++) {
        let topR = engine.rows;
        let hasGarbage = false;
        for (let r = 0; r < engine.rows; r++) {
          const blk = engine.grid[r][c];
          if (blk !== null) {
            if (topR === engine.rows) topR = r;
            if (blk.type === 'garbage') hasGarbage = true;
          }
        }
        const hRatio = (engine.rows - topR) / engine.rows;
        const delta = ((c + 0.5 - vCol + N * 1.5) % N) - N * 0.5;
        const isFront = Math.cos(delta * dTheta) >= 0;
        if (hRatio > 0) {
          ctx.fillStyle = topR <= Math.floor(engine.rows * 0.3)
            ? (gb ? '#ffffff' : '#ff3366')
            : (hasGarbage ? '#94a3b8' : (gb ? '#a3a3a3' : '#4ecca3'));
          ctx.globalAlpha = isFront ? 0.95 : 0.42;
          ctx.fillRect(c * segW + 0.5, 1, Math.max(1, segW - 1), Math.max(1.5, hRatio * barH));
        }
        if (c === engine.cursor.x || c === (engine.cursor.x + 1) % N) {
          ctx.globalAlpha = 1;
          ctx.fillStyle = '#ffd700';
          ctx.fillRect(c * segW, barH, segW, 1.5);
        }
      }
      ctx.restore();
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

    const nowMs = Date.now();
    if (engine.is3D) {
      this.draw3DCylinder(ctx, engine, offsetY, isEnginePanic, highestCols, nowMs);
    } else {
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
            this.drawCellContent(ctx, engine, r, c, b, x, y, isEnginePanic, highestCols, nowMs);
          }
        }
      }

      if (offsetY > 0.5 && engine.nextRow) {
        const nextRowY = engine.rows * CELL_PX - offsetY;
        const grayOutNextRow = !engine.endAnim;
        for (let c = 0; c < engine.cols; c++) {
          const b = engine.nextRow[c];
          if (b) {
            const x = c * CELL_PX;
            const y = nextRowY;
            if (b.type === 'garbage') {
              const sameLeft = b.groupId && c > 0 && engine.nextRow[c - 1] && engine.nextRow[c - 1].groupId === b.groupId;
              const sameRight = b.groupId && c < engine.cols - 1 && engine.nextRow[c + 1] && engine.nextRow[c + 1].groupId === b.groupId;
              this.drawGarbageCell(ctx, x, y, b, false, false, sameLeft, sameRight, grayOutNextRow);
            } else {
              const conf = COLORS.find(item => item.id === b.type);
              if (conf) {
                this.drawPanelBlock(ctx, x, y, conf, false, 0, grayOutNextRow, 0);
              }
            }
          }
        }
      }

      this.drawMatchParticles2D(ctx, engine, offsetY);

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
      ctx.fillText('GAME OVER', this.canvas.width / 2, this.canvas.height / 2);
    }

    ctx.restore();
  }
}

// --- COM(AI) エンジン（2D / 3D円筒対応・軽量タイムキャップ探索） ---
class ComAI {
  constructor(engine, level, id) {
    this.engine = engine;
    this.cols = engine.cols || COLS;
    this.rows = engine.rows || ROWS;
    this.is3D = !!engine.is3D;
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

    if (this.is3D && this.searchDepth > 3) {
      this.searchDepth = 3;
      this.beamWidth = Math.min(this.beamWidth, 9);
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

  colDist(c1, c2) {
    if (!this.is3D) return Math.abs(c1 - c2);
    const d = Math.abs(c1 - c2);
    return Math.min(d, this.cols - d);
  }

  canSwapAt(r, c) {
    const grid = this.engine.grid;
    const cols = this.cols;
    const rows = this.rows;
    if (r < 0 || r >= rows) return false;
    if (!this.is3D && (c < 0 || c >= cols - 1)) return false;
    const c1 = this.is3D ? ((c % cols) + cols) % cols : c;
    const c2 = this.is3D ? (c1 + 1) % cols : (c1 + 1);

    const b1 = grid[r][c1];
    const b2 = grid[r][c2];
    if (!b1 && !b2) return false;
    if (b1 && (b1.state !== 'normal' || b1.type === 'garbage')) return false;
    if (b2 && (b2.state !== 'normal' || b2.type === 'garbage')) return false;
    if (b1 && b2 && b1.type === b2.type) return false;
    if (b1 && r < rows - 1 && (!grid[r + 1][c1] || grid[r + 1][c1].state === 'hover' || grid[r + 1][c1].state === 'fall')) return false;
    if (b2 && r < rows - 1 && (!grid[r + 1][c2] || grid[r + 1][c2].state === 'hover' || grid[r + 1][c2].state === 'fall')) return false;
    return true;
  }

  captureSnapshot() {
    const grid = this.engine.grid;
    const cols = this.cols;
    const rows = this.rows;
    const board = new Int8Array(rows * cols);
    const locked = new Uint8Array(rows * cols);
    const colHeights = new Int8Array(cols);
    let maxH = 0;
    let garbageCount = 0;
    let sigParts = [];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        const b = grid[r][c];
        if (!b) {
          board[idx] = 0;
          sigParts.push('0');
        } else {
          const h = rows - r;
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
      pendingGarbageH += (g.w >= Math.max(4, cols - 2) ? g.h : Math.ceil(g.h * 0.6));
      if (g.delay < minGarbageDelay) minGarbageDelay = g.delay;
    }

    const effMaxH = maxH + (minGarbageDelay <= 120 ? pendingGarbageH : Math.ceil(pendingGarbageH * 0.6));
    const isPinch = (maxH >= rows - 4)
      || (effMaxH >= rows - 3)
      || (this.engine.dangerTimer < 165)
      || (maxH >= rows - 6 && pendingGarbageH >= 2 && minGarbageDelay <= 95);

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
    const cols = this.cols;
    const rows = this.rows;
    const c1 = this.is3D ? ((c % cols) + cols) % cols : c;
    const c2 = this.is3D ? (c1 + 1) % cols : (c1 + 1);
    const idx1 = r * cols + c1;
    const idx2 = r * cols + c2;
    if (lockedIn && (lockedIn[idx1] || lockedIn[idx2])) return null;

    const v1 = boardIn[idx1];
    const v2 = boardIn[idx2];
    if (v1 === 0 && v2 === 0) return null;
    if (v1 < 0 || v2 < 0) return null;
    if (v1 === v2) return null;
    if (r < rows - 1) {
      if (v1 > 0 && boardIn[(r + 1) * cols + c1] === 0) return null;
      if (v2 > 0 && boardIn[(r + 1) * cols + c2] === 0) return null;
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
    let minClearedRow = rows;

    for (let step = 0; step < 8; step++) {
      let moved = true;
      while (moved) {
        moved = false;
        for (let rr = rows - 2; rr >= 0; rr--) {
          let cc = 0;
          while (cc < cols) {
            const val = b[rr * cols + cc];
            if (val > 0) {
              if (!lockedIn || !lockedIn[rr * cols + cc]) {
                if (b[(rr + 1) * cols + cc] === 0) {
                  b[(rr + 1) * cols + cc] = val;
                  b[rr * cols + cc] = 0;
                  moved = true;
                }
              }
              cc++;
            } else if (val < 0) {
              let endC = cc + 1;
              while (endC < cols && b[rr * cols + endC] < 0) endC++;
              let canDrop = true;
              for (let k = cc; k < endC; k++) {
                if (b[(rr + 1) * cols + k] !== 0) {
                  canDrop = false;
                  break;
                }
              }
              if (canDrop) {
                for (let k = cc; k < endC; k++) {
                  b[(rr + 1) * cols + k] = b[rr * cols + k];
                  b[rr * cols + k] = 0;
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

      const matched = new Uint8Array(rows * cols);
      let matchCount = 0;

      for (let rr = 0; rr < rows; rr++) {
        if (this.is3D) {
          let breakC = -1;
          for (let cc = 0; cc < cols; cc++) {
            const cur = b[rr * cols + cc];
            const prev = b[rr * cols + ((cc - 1 + cols) % cols)];
            const curLock = lockedIn && step === 0 && lockedIn[rr * cols + cc];
            const prevLock = lockedIn && step === 0 && lockedIn[rr * cols + ((cc - 1 + cols) % cols)];
            if (cur <= 0 || prev <= 0 || curLock || prevLock || cur !== prev) {
              breakC = cc;
              break;
            }
          }
          if (breakC === -1) {
            for (let cc = 0; cc < cols; cc++) matched[rr * cols + cc] = 1;
          } else {
            let st = 0;
            while (st < cols) {
              const cc = (breakC + st) % cols;
              const v = b[rr * cols + cc];
              if (v <= 0 || (lockedIn && step === 0 && lockedIn[rr * cols + cc])) { st++; continue; }
              let len = 1;
              while (st + len < cols) {
                const nc = (breakC + st + len) % cols;
                if (b[rr * cols + nc] === v && !(lockedIn && step === 0 && lockedIn[rr * cols + nc])) len++;
                else break;
              }
              if (len >= 3) {
                for (let k = 0; k < len; k++) matched[rr * cols + ((breakC + st + k) % cols)] = 1;
              }
              st += len;
            }
          }
        } else {
          for (let cc = 0; cc < cols - 2; cc++) {
            const v = b[rr * cols + cc];
            if (v <= 0) continue;
            if (lockedIn && step === 0 && lockedIn[rr * cols + cc]) continue;
            let len = 1;
            while (cc + len < cols && b[rr * cols + cc + len] === v && !(lockedIn && step === 0 && lockedIn[rr * cols + cc + len])) {
              len++;
            }
            if (len >= 3) {
              for (let k = 0; k < len; k++) matched[rr * cols + cc + k] = 1;
            }
          }
        }
      }
      for (let cc = 0; cc < cols; cc++) {
        for (let rr = 0; rr < rows - 2; rr++) {
          const v = b[rr * cols + cc];
          if (v <= 0) continue;
          if (lockedIn && step === 0 && lockedIn[rr * cols + cc]) continue;
          let len = 1;
          while (rr + len < rows && b[(rr + len) * cols + cc] === v && !(lockedIn && step === 0 && lockedIn[(rr + len) * cols + cc])) {
            len++;
          }
          if (len >= 3) {
            for (let k = 0; k < len; k++) matched[(rr + k) * cols + cc] = 1;
          }
        }
      }

      for (let i = 0; i < rows * cols; i++) {
        if (matched[i]) matchCount++;
      }
      if (matchCount === 0) break;

      maxChain++;
      totalCleared += matchCount;

      if (maxChain >= 2) totalSentEstimate += 6;
      if (matchCount >= 4) {
        const comboPanels = generateComboGarbagePanels(matchCount, false);
        for (let pi = 0; pi < comboPanels.length; pi++) {
          totalSentEstimate += comboPanels[pi].w * comboPanels[pi].h;
        }
      }

      const thawVisited = new Uint8Array(rows * cols);
      const thawQueue = [];
      for (let rr = 0; rr < rows; rr++) {
        for (let cc = 0; cc < cols; cc++) {
          const idx = rr * cols + cc;
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
            let nc = cc + dirs[d][1];
            if (this.is3D) nc = (nc + cols) % cols;
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
              const nIdx = nr * cols + nc;
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
        const cr = Math.floor(curIdx / cols);
        const cc = curIdx % cols;
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
          let nc = cc + dirs[d][1];
          if (this.is3D) nc = (nc + cols) % cols;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
            const nIdx = nr * cols + nc;
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
    const cols = this.cols;
    const rows = this.rows;
    let maxH = 0;
    let holes = 0;
    let colHeights = new Int8Array(cols);
    let garbageRemaining = 0;

    for (let c = 0; c < cols; c++) {
      let topSeen = false;
      for (let r = 0; r < rows; r++) {
        const v = board[r * cols + c];
        if (v !== 0) {
          if (!topSeen) {
            colHeights[c] = rows - r;
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
    const bumpLim = this.is3D ? cols : cols - 1;
    for (let c = 0; c < bumpLim; c++) {
      bumpiness += Math.abs(colHeights[c] - colHeights[(c + 1) % cols]);
    }

    const pendingImpact = snap.minGarbageDelay <= 120 ? snap.pendingGarbageH : Math.ceil(snap.pendingGarbageH * 0.55);
    const effH = maxH + pendingImpact;

    let potential = 0;
    for (let r = 0; r < rows; r++) {
      const rowOffset = r * cols;
      const counts = [0, 0, 0, 0, 0, 0, 0, 0];
      let hasGarbageRow = false;
      for (let c = 0; c < cols; c++) {
        const v = board[rowOffset + c];
        if (v > 0 && v <= 7) {
          counts[v]++;
          const nextC = this.is3D ? (c + 1) % cols : (c + 1);
          if (nextC < cols && board[rowOffset + nextC] === v) potential += 14;
          if (r + 1 < rows && board[(r + 1) * cols + c] === v) potential += 14;
          if (r > 0 && board[(r - 1) * cols + c] < 0) potential += 8;
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

    if (effH >= rows - 3) {
      score -= (effH - (rows - 4)) * 750;
    } else if (maxH <= 6) {
      score += 120;
    }
    const heightReduced = snap.maxH - maxH;
    score += heightReduced * (snap.isPinch ? 260 : sw.heightBonus);
    score -= bumpiness * (snap.isPinch ? 28 : sw.bumpPenalty) * (this.is3D ? 0.35 : 1.0);
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

    score += potential * (this.is3D ? 0.45 : 1.0);
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
    const cols = this.cols;
    const rows = this.rows;
    const maxColSwap = this.is3D ? cols : (cols - 1);
    const maxDepth = this.searchDepth;
    const beamWidth = this.beamWidth;
    const MAX_NODES = this.is3D ? 220 : 280;
    const TIME_LIMIT_MS = this.is3D ? 3.2 : 3.8;
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

    const colOrder = [];
    for (let i = 0; i < maxColSwap; i++) colOrder.push(i);
    if (this.is3D) {
      const cx = this.engine.cursor.x;
      colOrder.sort((a, b) => this.colDist(cx, a) - this.colDist(cx, b));
    }

    for (let depth = 0; depth < maxDepth; depth++) {
      const nextCandidates = [];
      const seenBoards = new Set();

      for (let bi = 0; bi < beam.length; bi++) {
        const node = beam[bi];
        if (performance.now() - startTime > TIME_LIMIT_MS || expandedNodes >= MAX_NODES) break;

        const prevMove = node.moves.length > 0 ? node.moves[node.moves.length - 1] : null;

        for (let r = rows - 1; r >= 0; r--) {
          if (performance.now() - startTime > TIME_LIMIT_MS || expandedNodes >= MAX_NODES) break;
          for (let ci = 0; ci < maxColSwap; ci++) {
            const c = colOrder[ci];
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
              finalScore += (rows - res.minClearedRow) * 55 - nextMoves.length * 40;
            }
            if (depth === 0) {
              const dist = this.colDist(this.engine.cursor.x, c) + Math.abs(this.engine.cursor.y - r);
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

      if (nextCandidates.length === 0 || performance.now() - startTime > TIME_LIMIT_MS || expandedNodes >= MAX_NODES) {
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

      if (this.is3D) {
        const diffX = ((this.target.x - this.engine.cursor.x + this.cols * 1.5) % this.cols) - this.cols * 0.5;
        if (Math.abs(diffX) >= 0.5) {
          this.engine.cursor.x = (this.engine.cursor.x + (diffX > 0 ? 1 : -1) + this.cols) % this.cols;
          moved = true;
        } else if (this.engine.cursor.y < this.target.y) {
          this.engine.cursor.y++;
          moved = true;
        } else if (this.engine.cursor.y > this.target.y) {
          this.engine.cursor.y--;
          moved = true;
        }
      } else {
        if (this.engine.cursor.x < this.target.x) { this.engine.cursor.x++; moved = true; }
        else if (this.engine.cursor.x > this.target.x) { this.engine.cursor.x--; moved = true; }
        else if (this.engine.cursor.y < this.target.y) { this.engine.cursor.y++; moved = true; }
        else if (this.engine.cursor.y > this.target.y) { this.engine.cursor.y--; moved = true; }
      }

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
    const cols = this.cols;
    const maxC = this.is3D ? cols : (cols - 1);

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < maxC; c++) {
        if (!this.canSwapAt(r, c)) continue;
        if (this.isSwapRecentlyDone(r, c)) continue;

        const c2 = this.is3D ? (c + 1) % cols : (c + 1);
        const b1 = this.engine.grid[r][c];
        const b2 = this.engine.grid[r][c2];

        if (b1 && b2 === null && snap.colHeights[c] > snap.colHeights[c2]) {
          const sc = (snap.colHeights[c] - snap.colHeights[c2]) * 30 + (snap.isPinch ? (this.rows - r) * 25 : 0) + Math.random() * 18;
          candidates.push({ x: c, y: r, sc });
        } else if (b2 && b1 === null && snap.colHeights[c2] > snap.colHeights[c]) {
          const sc = (snap.colHeights[c2] - snap.colHeights[c]) * 30 + (snap.isPinch ? (this.rows - r) * 25 : 0) + Math.random() * 18;
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
    const cols = this.cols;
    const maxC = this.is3D ? cols : (cols - 1);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < maxC; c++) {
        if (!this.canSwapAt(r, c)) continue;
        if (this.isSwapRecentlyDone(r, c)) continue;

        const c2 = this.is3D ? (c + 1) % cols : (c + 1);
        const b1 = this.engine.grid[r][c];
        const b2 = this.engine.grid[r][c2];
        if (!b1 || !b2) continue;

        const dist = this.colDist(this.engine.cursor.x, c) + Math.abs(this.engine.cursor.y - r);
        const sc = -dist * 2.5 + (this.rows - r) * 2 + Math.random() * 26;
        candidates.push({ x: c, y: r, sc });
      }
    }
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b.sc - a.sc);
    const pickIdx = Math.floor(Math.random() * Math.min(5, candidates.length));
    return { x: candidates[pickIdx].x, y: candidates[pickIdx].y };
  }
}