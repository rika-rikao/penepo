// ==========================================
// ゲームエンジン
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
    
    this.baseRiseSpeed = 0.0012 - (handicap - 3) * 0.0003;
    if (this.baseRiseSpeed < 0.0003) this.baseRiseSpeed = 0.0003;
    this.riseSpeed = this.baseRiseSpeed;
    
    this.timeElapsed = 0;
    this.keepSpeed = false;

    this.stopTimer = 0;
    this.dangerTimer = 180; 
    this.score = 0; this.chain = 0;
    this.gameOver = false;
    this.cursor = { x: 2, y: 6 };
    this.garbageQueue = [];
    this.onStateChange = onStateChange;
    this.onSendGarbage = onSendGarbage;
    this.onRowPushed = null;
    
    this.isRisingManualBtn = false;
    this.isRisingManualKey = false;
    this.isRisingManualPad = false;

    this.initGrid(5);
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
    if (this.gameOver && !this.isPractice) return false;
    if (matchState !== 'playing' && !this.isPractice) return false;
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
       this.grid[r][c].swapAnim = { dir: -1, timer: 6 };
    }
    if (this.grid[r][c+1]) {
       this.grid[r][c+1].chainEligible = false;
       this.grid[r][c+1].swapAnim = { dir: 1, timer: 6 };
    }

    if (this.grid[r][c] && r+1 < this.rows && this.grid[r+1][c] === null) { this.grid[r][c].state = 'hover'; this.grid[r][c].timer = 14; }
    if (this.grid[r][c+1] && r+1 < this.rows && this.grid[r+1][c+1] === null) { this.grid[r][c+1].state = 'hover'; this.grid[r][c+1].timer = 14; }

    this.checkMatches();
    return true;
  }

  manualRiseStep() {
    if (this.gameOver && !this.isPractice) return;
    if (matchState !== 'playing' && !this.isPractice) return;
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

  addGarbage(w, h, isHard = false) { 
    let adjustedH = h;
    if (this.handicap === 1) adjustedH = Math.floor(h * 1.5);
    else if (this.handicap === 2) adjustedH = Math.floor(h * 1.25);
    else if (this.handicap === 4) adjustedH = Math.ceil(h * 0.75);
    else if (this.handicap === 5) adjustedH = Math.ceil(h * 0.5);
    
    if (adjustedH < 1) adjustedH = 1;
    this.garbageQueue.push({ w, h: adjustedH, delay: 150, isHard }); 
  }

  spawnGarbage(g) {
    const groupId = Date.now() + Math.random();
    const startCol = g.startCol;
    for (let r = 0; r < g.h; r++) {
      for (let c = 0; c < g.w; c++) {
        const actualCol = startCol + c;
        this.grid[r][actualCol] = { type: 'garbage', state: 'fall', fallY: 0, timer: 0, groupId: groupId, isHard: g.isHard, particleTimer: 0 };
      }
    }
  }

  regroupGarbage() {
    const isTransformingState = (st) => st === 'transforming' || st === 'transforming_wait' || st === 'transformed_wait';
    const visited = Array.from({ length: this.rows }, () => Array(this.cols).fill(false));
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const b = this.grid[r][c];
        if (!b || b.type !== 'garbage' || visited[r][c]) continue;
        if (isTransformingState(b.state)) {
          visited[r][c] = true;
          continue;
        }
        const origGid = b.groupId;
        const newGid = Date.now() + Math.random();
        const queue = [[r, c]];
        visited[r][c] = true;
        const comp = [];
        while (queue.length > 0) {
          const [cr, cc] = queue.shift();
          const cb = this.grid[cr][cc];
          comp.push(cb);
          [[cr-1,cc],[cr+1,cc],[cr,cc-1],[cr,cc+1]].forEach(([nr, nc]) => {
            if (nr >= 0 && nr < this.rows && nc >= 0 && nc < this.cols && !visited[nr][nc]) {
              const nb = this.grid[nr][nc];
              if (nb && nb.type === 'garbage' && nb.groupId === origGid && !isTransformingState(nb.state)) {
                visited[nr][nc] = true;
                queue.push([nr, nc]);
              }
            }
          });
        }
        comp.forEach(cb => {
          cb.groupId = newGid;
        });
      }
    }
  }

  transformGarbageNear(r, c) {
    const isTransformingState = (st) => st === 'transforming' || st === 'transforming_wait' || st === 'transformed_wait';
    let triggeredGroupIds = new Set();
    
    [[r-1,c],[r+1,c],[r,c-1],[r,c+1]].forEach(([nr, nc]) => {
      if (nr >= 0 && nr < this.rows && nc >= 0 && nc < this.cols) {
        const b = this.grid[nr][nc];
        if (b && b.type === 'garbage' && b.groupId && !isTransformingState(b.state)) triggeredGroupIds.add(b.groupId);
      }
    });

    if (triggeredGroupIds.size > 0) {
      let newlyAdded = true;
      while (newlyAdded) {
        newlyAdded = false;
        for (let rr = 0; rr < this.rows; rr++) {
          for (let cc = 0; cc < this.cols; cc++) {
            const b = this.grid[rr][cc];
            if (b && b.type === 'garbage' && triggeredGroupIds.has(b.groupId) && !isTransformingState(b.state)) {
              [[rr-1,cc],[rr+1,cc],[rr,cc-1],[rr,cc+1]].forEach(([nr, nc]) => {
                if (nr >= 0 && nr < this.rows && nc >= 0 && nc < this.cols) {
                  const adjB = this.grid[nr][nc];
                  if (adjB && adjB.type === 'garbage' && adjB.groupId && adjB.groupId !== b.groupId && !isTransformingState(adjB.state)) {
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
          if (b && b.type === 'garbage' && triggeredGroupIds.has(b.groupId) && !isTransformingState(b.state)) {
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

      const transformGroupId = Date.now() + Math.random();

      orderedCells.forEach((item, idx) => {
        let isGroupBottom = (item.r === groupMaxR[item.b.groupId]);
        
        item.b.state = 'transforming';
        item.b.fallY = 0;
        item.b.transformDelay = Math.round(idx * 8 * 1.15);
        item.b.isTarget = isGroupBottom;
        item.b.transformToNormal = isGroupBottom && !item.b.isHard;
        item.b.transformGroupId = transformGroupId;
      });
    }
  }

  update(deltaTime = 1000/60) {
    if (this.gameOver && !this.isPractice) return;
    if (matchState !== 'playing' && !this.isPractice) return;
    
    this.timeElapsed += deltaTime;
    if (this.timeElapsed > 30000 && !this.keepSpeed) {
      this.riseSpeed = this.baseRiseSpeed * Math.pow(1.05, Math.floor((this.timeElapsed - 30000) / 20000));
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
              isMoving = true;
              b.swapAnim.timer--;
              if (b.swapAnim.timer <= 0) delete b.swapAnim;
           }
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
        let convertedAny = false;
        blocks.forEach(b => {
          if (b.state === 'transformed_wait' || b.state === 'transforming_wait') {
            b.state = 'hover';
            b.timer = 14;
            b.fallY = 0;
            if (typeof b.type === 'number') {
              delete b.groupId;
              convertedAny = true;
            }
            delete b.transformGroupId;
          }
        });
        if (convertedAny) {
          this.regroupGarbage();
        }
      }
    });
    
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

    let isTopFilled = false;
    for (let c = 0; c < this.cols; c++) {
      if (this.grid[0][c] !== null) { isTopFilled = true; break; }
    }

    let garbageBlocked = false;
    if (!isMoving && this.garbageQueue.length > 0) {
      if (this.garbageQueue[0].delay > 0) {
        this.garbageQueue[0].delay--;
      } else {
        const g = this.garbageQueue[0];
        if (g.startCol === undefined) g.startCol = Math.floor(Math.random() * (this.cols - g.w + 1));
        let canSpawn = true;
        for (let r = 0; r < g.h; r++) {
          for (let c = 0; c < g.w; c++) {
            if (this.grid[r][g.startCol + c] !== null) { canSpawn = false; break; }
          }
          if (!canSpawn) break;
        }
        if (canSpawn) {
          this.spawnGarbage(g);
          this.garbageQueue.shift();
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
          if (this.onStateChange) this.onStateChange('gameover');
          return;
        }
      }
    } else {
      this.dangerTimer = 180;
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
            this.transformGarbageNear(r, c);
            this.grid[r][c] = null;
            
            for (let ur = r - 1; ur >= 0; ur--) {
              const ub = this.grid[ur][c];
              if (ub && ub.type !== 'garbage' && ub.state !== 'match') {
                ub.state = 'hover';
                ub.timer = 14;
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

    // 通常ブロック落下処理（お邪魔ブロックの真下が落下中かどうかを先に評価できるよう先行実行）
    for (let c = 0; c < this.cols; c++) {
      let r = this.rows - 1;
      while (r >= 0) {
        while (r >= 0 && (
          this.grid[r][c] === null || 
          this.grid[r][c].type === 'garbage' || 
          this.grid[r][c].state === 'match' ||
          this.grid[r][c].state === 'transforming' ||
          this.grid[r][c].state === 'transforming_wait' ||
          this.grid[r][c].state === 'transformed_wait'
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
                && this.grid[cur][c].state !== 'transforming' && this.grid[cur][c].state !== 'transforming_wait' && this.grid[cur][c].state !== 'transformed_wait') {
            stack.push({ r: cur, block: this.grid[cur][c] });
            cur--;
          }

          const leader = stack[0].block;
          const bottomR = stack[0].r;

          if (leader.state === 'normal') {
            leader.state = 'hover';
            leader.timer = 14;
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
            let waitBelow = false;
            if (bottomR + 1 >= this.rows) {
              blocked = true;
            } else {
              const below = this.grid[bottomR + 1][c];
              if (below !== null) {
                if (below.state === 'fall' || below.state === 'hover') {
                  waitBelow = true;
                } else {
                  blocked = true;
                }
              }
            }

            if (blocked) {
              for (const item of stack) { item.block.state = 'normal'; item.block.fallY = 0; }
              needsMatchCheck = true;
            } else if (!waitBelow) {
              leader.fallY += 0.35;
              for (const item of stack) item.block.fallY = leader.fallY;
              
              if (leader.fallY >= 1.0) {
                for (const item of stack) {
                  this.grid[item.r + 1][c] = item.block;
                  this.grid[item.r][c] = null;
                  item.block.fallY = 0;
                }
                if (bottomR + 2 >= this.rows || (this.grid[bottomR + 2][c] !== null && this.grid[bottomR + 2][c].state !== 'fall' && this.grid[bottomR + 2][c].state !== 'hover')) {
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
        let waitForFallingBelow = false;
        let minBelowFallY = 0.99;

        for (const item of cells) {
          if (item.r + 1 >= this.rows) { canFall = false; break; }
          const below = this.grid[item.r + 1][item.c];
          if (below !== null && below.groupId !== groupId) {
            if (below.state === 'fall' || below.state === 'hover') {
              waitForFallingBelow = true;
              minBelowFallY = Math.min(minBelowFallY, below.state === 'fall' ? (below.fallY || 0) : 0);
            } else {
              canFall = false;
              break;
            }
          }
        }

        if (!canFall) {
          cells.forEach(item => {
            item.block.state = 'normal';
            item.block.fallY = 0;
          });
          needsMatchCheck = true;
        } else if (waitForFallingBelow) {
          leader.fallY = minBelowFallY;
          cells.forEach(item => item.block.fallY = leader.fallY);
        } else {
          leader.fallY += 0.35;
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
            for (const item of cells) {
              if (item.r + 1 >= this.rows) { hitBottom = true; break; }
              const below = this.grid[item.r + 1][item.c];
              if (below !== null && below.groupId !== groupId && below.state !== 'fall' && below.state !== 'hover') {
                hitBottom = true; break;
              }
            }
            if (hitBottom) {
              cells.forEach(item => {
                item.block.state = 'normal';
                item.block.fallY = 0;
              });
              needsMatchCheck = true;
              SE.play('falledBlock');
              this.shakeTimer = 15;
            }
          }
        }
      }

      if (leader.state === 'normal') {
        let supported = false;
        for (const item of cells) {
          if (item.r + 1 >= this.rows) { supported = true; break; }
          const below = this.grid[item.r + 1][item.c];
          if (below !== null && below.groupId !== groupId && below.state !== 'fall' && below.state !== 'hover') {
            supported = true; break;
          }
        }
        if (!supported) {
          cells.forEach(item => {
            item.block.state = 'hover';
            item.block.timer = 14;
          });
        }
      }
    });

    if (needsMatchCheck) this.checkMatches();
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

      matchedPositions.forEach(pos => {
        const [r, c] = pos.split(',').map(Number);
        const block = this.grid[r][c];
        if (block.chainEligible) chainActive = true;
        if (COLORS.find(col => col.id === block.type)?.isSpecial) hasSpecial = true;
        block.state = 'match'; block.timer = 46;
      });

      if (chainActive) this.chain++; else this.chain = 1;

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

      let totalBlocks = 0;
      if (this.chain >= 2) {
        totalBlocks += (this.chain - 1) * 6;
      }
      if (matchedPositions.size === 4) totalBlocks += 3;
      else if (matchedPositions.size === 5) totalBlocks += 4;
      else if (matchedPositions.size === 6) totalBlocks += 5;
      else if (matchedPositions.size >= 7) totalBlocks += 6;

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
      let isMoving = false;
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          const b = this.grid[r][c];
          if (b && (b.state === 'match' || b.state === 'fall' || b.state === 'hover' || b.state === 'transforming' || b.state === 'transforming_wait' || b.state === 'transformed_wait')) isMoving = true;
        }
      }
      if (!isMoving) {
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
        for (let r = 0; r < this.rows; r++) {
          for (let c = 0; c < this.cols; c++) if (this.grid[r][c]) this.grid[r][c].chainEligible = false;
        }
      }
    }
  }
}

// --- 描画エンジン ---
class BoardRenderer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.canvas.width = COLS * CELL_PX;
    this.canvas.height = ROWS * CELL_PX + CELL_PX * 0.75; 
    this.theme = null;
  }
  draw(engine) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (typeof drawBoardBgAddon === 'function') drawBoardBgAddon(ctx, this.canvas, engine, this);
    
    ctx.save();
    if (engine.shakeTimer > 0) {
       engine.shakeTimer--;
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
    let isEnginePanic = (highestR - engine.riseOffset) <= (engine.rows * 0.3);

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

    for (let r = 0; r < engine.rows; r++) {
      for (let c = 0; c < engine.cols; c++) {
        const b = engine.grid[r][c];
        if (b) {
          let drawX = c * CELL_PX;
          if (b.swapAnim) {
             drawX += -(b.swapAnim.dir) * (b.swapAnim.timer / 6) * CELL_PX;
          }
          const x = drawX;
          const y = r * CELL_PX - offsetY + (b.fallY * CELL_PX);

          if (b.type === 'garbage') {
            ctx.fillStyle = b.isHard ? '#a8b2bd' : '#5c636a'; 
            ctx.fillRect(x, y, CELL_PX, CELL_PX);
            ctx.strokeStyle = '#dee2e6'; ctx.lineWidth = 2;
            
            const sameTop = r > 0 && engine.grid[r-1][c] && engine.grid[r-1][c].groupId === b.groupId;
            const sameBottom = r < engine.rows-1 && engine.grid[r+1][c] && engine.grid[r+1][c].groupId === b.groupId;
            const sameLeft = c > 0 && engine.grid[r][c-1] && engine.grid[r][c-1].groupId === b.groupId;
            const sameRight = c < engine.cols-1 && engine.grid[r][c+1] && engine.grid[r][c+1].groupId === b.groupId;

            ctx.beginPath();
            if (!sameTop) { ctx.moveTo(x, y+1); ctx.lineTo(x+CELL_PX, y+1); }
            if (!sameBottom) { ctx.moveTo(x, y+CELL_PX-1); ctx.lineTo(x+CELL_PX, y+CELL_PX-1); }
            if (!sameLeft) { ctx.moveTo(x+1, y); ctx.lineTo(x+1, y+CELL_PX); }
            if (!sameRight) { ctx.moveTo(x+CELL_PX-1, y); ctx.lineTo(x+CELL_PX-1, y+CELL_PX); }
            ctx.stroke();

            if (b.isHard) {
              ctx.strokeStyle = 'rgba(255,255,255,0.35)';
              ctx.lineWidth = 4;
              ctx.beginPath();
              ctx.moveTo(x + CELL_PX * 0.25, y + CELL_PX * 0.25);
              ctx.lineTo(x + CELL_PX * 0.75, y + CELL_PX * 0.75);
              ctx.moveTo(x + CELL_PX * 0.75, y + CELL_PX * 0.25);
              ctx.lineTo(x + CELL_PX * 0.25, y + CELL_PX * 0.75);
              ctx.stroke();
            } else {
              ctx.fillStyle = 'rgba(255,255,255,0.08)';
              ctx.beginPath(); ctx.arc(x+CELL_PX/2, y+CELL_PX/2, CELL_PX/4, 0, Math.PI*2); ctx.fill();
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
          } else {
            const conf = COLORS.find(item => item.id === b.type);
            if (conf) {
              const isFlashing = (b.state === 'match' && Math.floor(b.timer / 4) % 2 === 0);
              
              const isHighestCol = isEnginePanic && highestCols.has(c);
              const time = Date.now();
              const bounceY = isHighestCol ? Math.sin(time / 60 + c) * 3 : 0;

              ctx.fillStyle = isFlashing ? '#6c757d' : conf.bg;
              ctx.beginPath(); ctx.roundRect(x+2, y+2, CELL_PX-4, CELL_PX-4, 8); ctx.fill();
              
              ctx.fillStyle = isFlashing ? '#ffffff' : (conf.textColor || '#fff'); 
              ctx.font = 'bold 16px sans-serif'; 
              ctx.textAlign = 'center'; 
              ctx.textBaseline = 'middle'; 
              ctx.fillText(conf.symbol, x+CELL_PX/2, y+CELL_PX/2 + bounceY);
            }
          }
        }
      }
    }

    for (let c = 0; c < engine.cols; c++) {
      const b = engine.nextRow[c];
      if (b) {
        const x = c * CELL_PX;
        const y = engine.rows * CELL_PX - offsetY;
        const conf = COLORS.find(item => item.id === b.type);
        if (conf) {
          ctx.globalAlpha = 0.35; 
          ctx.fillStyle = conf.bg;
          ctx.beginPath(); ctx.roundRect(x+2, y+2, CELL_PX-4, CELL_PX-4, 8); ctx.fill();
          ctx.fillStyle = conf.textColor || '#fff'; 
          ctx.font = 'bold 16px sans-serif'; 
          ctx.textAlign = 'center'; 
          ctx.textBaseline = 'middle'; 
          ctx.fillText(conf.symbol, x+CELL_PX/2, y+CELL_PX/2);
          ctx.globalAlpha = 1.0;  
        }
      }
    }

    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
    ctx.strokeRect(engine.cursor.x * CELL_PX - 2, engine.cursor.y * CELL_PX - offsetY - 2, CELL_PX * 2 + 4, CELL_PX + 4);

    if (engine.popups) {
      for (let i = engine.popups.length - 1; i >= 0; i--) {
        const p = engine.popups[i];
        p.timer--;
        if (p.timer <= 0) {
          engine.popups.splice(i, 1);
          continue;
        }
        const progress = 1 - p.timer / p.initialTimer;
        const floatY = progress * 22;
        ctx.globalAlpha = Math.max(0, p.timer / 15); 
        ctx.fillStyle = p.color || '#ffdf00'; 
        
        if (p.isNumber) {
           ctx.font = 'bold 24px sans-serif';
        } else {
           ctx.font = 'bold 18px sans-serif'; 
        }
        
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#0f172a'; 
        ctx.strokeText(p.text, p.x, p.y - offsetY - floatY);
        ctx.fillText(p.text, p.x, p.y - offsetY - floatY);
        ctx.globalAlpha = 1.0;
      }
    }

    if (typeof drawBoardFgAddon === 'function') drawBoardFgAddon(ctx, this.canvas, engine, this);

    if (engine.gameOver && !engine.isPractice) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.fillStyle = '#ff3366'; ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('GAME OVER', this.canvas.width/2, this.canvas.height/2);
    }
    
    ctx.restore();
  }
}

// --- COM(AI) エンジン ---
class ComAI {
  constructor(engine, level, id) {
    this.engine = engine; this.level = level; this.id = id;
    this.target = null;
    this.thinkInterval = Math.max(2, Math.floor(50 - level * 1.5));
    this.moveInterval = Math.max(1, Math.floor(15 - level * 0.5));
    this.actionTimer = this.thinkInterval;
    this.moveTimer = 0;
    this.engine.baseRiseSpeed = 0.0010 + (level * 0.0001);
    this.engine.riseSpeed = this.engine.baseRiseSpeed;
    
    const patterns = ['small_chain', 'big_chain', 'multi_match', 'survival'];
    this.pattern = patterns[Math.floor(Math.random() * patterns.length)];
  }

  update() {
    if (this.engine.gameOver || matchState !== 'playing') return;
    
    let maxH = 0;
    for (let c=0; c<COLS; c++) { 
      for (let r=0; r<ROWS; r++) { 
        if (this.engine.grid[r][c]) { maxH = Math.max(maxH, ROWS-r); break; } 
      } 
    }
    if (maxH >= 6) this.engine.isRisingManualPad = false; 

    if (this.target) {
      this.moveTimer--;
      if (this.moveTimer <= 0) {
        this.moveTimer = this.moveInterval;
        let moved = false;
        if (this.engine.cursor.x < this.target.x) { this.engine.cursor.x++; moved = true; }
        else if (this.engine.cursor.x > this.target.x) { this.engine.cursor.x--; moved = true; }
        else if (this.engine.cursor.y < this.target.y) { this.engine.cursor.y++; moved = true; }
        else if (this.engine.cursor.y > this.target.y) { this.engine.cursor.y--; moved = true; }
        if (!moved) { this.engine.swap(this.engine.cursor.x, this.engine.cursor.y); this.target = null; this.actionTimer = this.thinkInterval; }
      }
    } else {
      this.actionTimer--;
      if (this.actionTimer <= 0) this.think();
    }
  }

  think() {
    if (this.engine.gameOver || matchState !== 'playing') return;
    this.actionTimer = this.thinkInterval;
    this.engine.isRisingManualPad = false;

    let maxH = 0;
    for (let c=0; c<COLS; c++) { 
      for (let r=0; r<ROWS; r++) { 
        if (this.engine.grid[r][c]) { maxH = Math.max(maxH, ROWS-r); break; } 
      } 
    }

    let bestMoves = [];
    let maxScore = -1;

    for (let r=0; r<ROWS; r++) {
      for (let c=0; c<COLS-1; c++) {
        let score = this.evaluateMove(r, c);
        if (score > 0) {
          if (score > maxScore) {
            maxScore = score;
            bestMoves = [{x:c, y:r}];
          } else if (score === maxScore) {
            bestMoves.push({x:c, y:r});
          }
        }
      }
    }

    if (bestMoves.length > 0) {
      this.target = bestMoves[Math.floor(Math.random() * bestMoves.length)];
      this.moveTimer = this.moveInterval;
    } else {
      if (this.level >= 3 && maxH <= 5 && this.engine.garbageQueue.length === 0) {
        if (this.pattern === 'survival' || this.pattern === 'small_chain') {
           this.engine.isRisingManualPad = true;
        } else {
           this.engine.isRisingManualPad = (Math.random() < 0.5);
        }
        this.target = null;
      } else { 
        this.engine.isRisingManualPad = false;
        
        let meaningfulTargets = [];
        for (let r = ROWS - 1; r >= 0; r--) {
          let hasNormal = false;
          for (let c = 0; c < COLS; c++) {
            const b = this.engine.grid[r][c];
            if (b && b.state === 'normal' && b.type !== 'garbage') {
              hasNormal = true; break;
            }
          }
          if (hasNormal) {
            for (let c = 0; c < COLS - 1; c++) {
              const b1 = this.engine.grid[r][c];
              const b2 = this.engine.grid[r][c+1];
              if (!b1 && !b2) continue; 
              if (b1 && b1.type === 'garbage' && b2 && b2.type === 'garbage') continue; 
              if (b1 && b1.type === 'garbage' && !b2) continue; 
              if (!b1 && b2 && b2.type === 'garbage') continue; 
              meaningfulTargets.push({x: c, y: r});
            }
          }
        }
        
        if (meaningfulTargets.length > 0) {
          this.target = meaningfulTargets[Math.floor(Math.random() * meaningfulTargets.length)];
        } else {
          this.target = { x: Math.floor(Math.random()*(COLS-1)), y: Math.floor(Math.random()*(ROWS-2))+2 }; 
        }
        this.moveTimer = this.moveInterval; 
      }
    }
  }

  evaluateMove(r, c) {
    const b1 = this.engine.grid[r][c], b2 = this.engine.grid[r][c+1];
    if (b1 && b1.state !== 'normal') return 0;
    if (b2 && b2.state !== 'normal') return 0;
    if (!b1 && !b2) return 0;
    if (b1 && b2 && b1.type === b2.type) return 0;

    let hasMatch = false;
    const temp = this.engine.grid.map(row => row.map(cell => cell ? {...cell} : null));
    let t = temp[r][c]; temp[r][c] = temp[r][c+1]; temp[r][c+1] = t;

    let matchedPositions = new Set();
    for (let rr=0; rr<ROWS; rr++) {
      for (let cc=0; cc<COLS-2; cc++) {
        if (temp[rr][cc] && temp[rr][cc].type!=='garbage' && temp[rr][cc+1] && temp[rr][cc+2] && temp[rr][cc].type===temp[rr][cc+1].type && temp[rr][cc].type===temp[rr][cc+2].type) {
           matchedPositions.add(`${rr},${cc}`); matchedPositions.add(`${rr},${cc+1}`); matchedPositions.add(`${rr},${cc+2}`);
           hasMatch = true;
        }
      }
    }
    for (let cc=0; cc<COLS; cc++) {
      for (let rr=0; rr<ROWS-2; rr++) {
        if (temp[rr][cc] && temp[rr][cc].type!=='garbage' && temp[rr+1][cc] && temp[rr+2][cc] && temp[rr][cc].type===temp[rr+1][cc].type && temp[rr][cc].type===temp[rr+2][cc].type) {
           matchedPositions.add(`${rr},${cc}`); matchedPositions.add(`${rr+1},${cc}`); matchedPositions.add(`${rr+2},${cc}`);
           hasMatch = true;
        }
      }
    }

    let matchCount = matchedPositions.size;
    let score = 0;
    let heightScore = ROWS - r; 
    
    let isChainSetup = false;
    if (!hasMatch) {
       if (r + 1 < ROWS && ((this.engine.grid[r+1][c] && this.engine.grid[r+1][c].state === 'match') || (this.engine.grid[r+1][c+1] && this.engine.grid[r+1][c+1].state === 'match'))) {
           isChainSetup = true;
       }
    }

    if (hasMatch) {
        score = 10;
        switch(this.pattern) {
            case 'small_chain': score += 5; break;
            case 'big_chain': score = 5; break;
            case 'multi_match':
                if (matchCount >= 4) score += matchCount * 20; 
                else score += 1; 
                break;
            case 'survival': score += heightScore * 10; break;
        }
    } else {
        if (isChainSetup) {
            switch(this.pattern) {
                case 'small_chain': score = 15; break;
                case 'big_chain': score = 20; break;
                case 'multi_match': score = 2; break;
                case 'survival': score = 1; break;
            }
        } else {
            if (this.pattern === 'big_chain' && Math.random() < 0.1) score = 1; 
        }
    }

    return score;
  }
}
