// ==========================================
// ポップなパズルゲーム風 オープニングアニメーション（JS Canvas 2D描画版）
// ・背景ズーム / 斜めストライプ / 放射線 / 疑似3D回転ブロック / パーティクルをCanvasへ統合
// ・本編15秒後、立ち絵とタイトルは静止したまま背景放射線とブロック舞いは3秒間継続
// ・3秒後およびスキップ時はリキッドトランジションでメイン画面へ遷移
// ==========================================
const OpAnimation = {
  TOTAL_DURATION_MS: 15000,
  HOLD_DURATION_MS: 3000,
  LIQUID_DURATION_MS: 1150,
  _active: false,
  _phase: 'idle', // 'idle' | 'playing' | 'holding' | 'liquid'
  _rafId: null,
  _startTime: 0,
  _holdStartTime: 0,
  _liquidStartTime: 0,
  _lastFrameTime: 0,
  _canSkipAt: 0,
  _lastSceneIdx: -1,
  _particles: [],
  _cubes: [],
  _canvas: null,
  _ctx: null,
  _edgeCanvas: null,
  _edgeCtx: null,
  _bgImg: null,
  _liquidDrops: [],
  _liquidSvgNodes: [],
  _fadeTimer: null,
  _eventsBound: false,
  _sceneTimers: [],

  isActive() {
    return this._active;
  },

  isPortraitView() {
    return window.innerHeight >= window.innerWidth;
  },

  updateOverlayOrientationClass() {
    const overlay = document.getElementById('op-overlay');
    if (!overlay) return;
    const isP = this.isPortraitView();
    overlay.classList.toggle('is-portrait', isP);
    overlay.classList.toggle('is-landscape', !isP);
  },

  clearSceneTimers() {
    this._sceneTimers.forEach(id => clearTimeout(id));
    this._sceneTimers = [];
  },

  bindEventsOnce() {
    if (this._eventsBound) return;
    this._eventsBound = true;

    const overlay = document.getElementById('op-overlay');
    const skipBtn = document.getElementById('op-skip-btn');

    if (skipBtn) {
      skipBtn.addEventListener('pointerdown', (e) => {
        if (typeof ensureAudioCtxResumed === 'function') ensureAudioCtxResumed();
        e.stopPropagation();
        e.preventDefault();
        this.skip(true);
      });
      skipBtn.addEventListener('click', (e) => {
        if (typeof ensureAudioCtxResumed === 'function') ensureAudioCtxResumed();
        e.stopPropagation();
        e.preventDefault();
        this.skip(true);
      });
    }

    if (overlay) {
      overlay.addEventListener('pointerdown', (e) => {
        if (!this._active || this._phase === 'liquid') return;
        if (typeof ensureAudioCtxResumed === 'function') ensureAudioCtxResumed();
        e.preventDefault();
        this.skip(false);
      });
    }

    window.addEventListener('resize', () => {
      if (this._active) {
        this.resizeCanvas();
        this.updateOverlayOrientationClass();
        this.relayoutActiveCards();
        if (this._phase === 'liquid') {
          this.syncLiquidMaskBounds();
        }
      }
    });
  },

  resizeCanvas() {
    const w = Math.max(320, window.innerWidth);
    const h = Math.max(240, window.innerHeight);
    if (this._canvas) {
      this._canvas.width = w;
      this._canvas.height = h;
    }
    if (this._edgeCanvas) {
      this._edgeCanvas.width = w;
      this._edgeCanvas.height = h;
    }
  },

  loadSystemBgImage() {
    const loadUrl = (url) => {
      if (!url) return;
      const absUrl = (typeof toAbsoluteAssetUrl === 'function') ? toAbsoluteAssetUrl(url) : url;
      const cached = (typeof getCachedImage === 'function') ? getCachedImage(absUrl) : null;
      if (cached) {
        this._bgImg = cached;
        return;
      }
      const img = new Image();
      img.onload = () => { this._bgImg = img; };
      img.src = absUrl;
    };

    if (typeof ResolvedCharImgCache !== 'undefined' && ResolvedCharImgCache['system::main']) {
      loadUrl(ResolvedCharImgCache['system::main']);
    } else if (typeof resolveSystemMainImage === 'function') {
      resolveSystemMainImage().then((url) => loadUrl(url));
    }
  },

  initBlocks() {
    this._cubes = [];
    const w = window.innerWidth || 800;
    const h = window.innerHeight || 600;
    const blockDefs = (typeof COLORS !== 'undefined')
      ? COLORS.filter(c => !c.isSpecial)
      : [
          { id: 1, bg: '#ff3366', symbol: '♥' },
          { id: 2, bg: '#ffd700', symbol: '★' },
          { id: 3, bg: '#00d4ff', symbol: '◆' },
          { id: 4, bg: '#00e676', symbol: '♣' },
          { id: 5, bg: '#ff9100', symbol: '▲' },
          { id: 6, bg: '#9d00ff', symbol: '●' }
        ];

    const count = 12;
    for (let i = 0; i < count; i++) {
      const def = blockDefs[i % blockDefs.length];
      const isGarbage = (i === 5 || i === 11);
      const size = Math.round(34 + (i % 4) * 8);

      this._cubes.push({
        x: ((i + 0.5) / count) * w + ((i % 2 === 0 ? -1 : 1) * 14),
        y: -70 - ((i * 53) % Math.max(240, h * 0.65)),
        vx: ((i % 3) - 1) * 0.45,
        vy: 1.6 + (i % 4) * 0.48,
        rotPhase: i * 0.7,
        amp: 10 + (i % 4) * 4,
        spinY: Math.random() * Math.PI * 2,
        spinSpeed: 0.032 + (i % 4) * 0.008,
        tiltZ: (Math.random() - 0.5) * 0.4,
        size,
        isGarbage,
        bg: isGarbage ? '#64748b' : def.bg,
        symbol: isGarbage ? '×' : def.symbol,
        textColor: (!isGarbage && def.id === 2) ? '#1e293b' : '#ffffff'
      });
    }
  },

  spawnBurst(x, y, count = 24, palette = null) {
    const cols = palette || ['#ff3366', '#ffd700', '#00d4ff', '#00e676', '#ff9100', '#ffffff'];
    for (let i = 0; i < count; i++) {
      const ang = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.32;
      const spd = 2.4 + Math.random() * 6.2;
      this._particles.push({
        kind: i % 3 === 0 ? 'star' : 'dot',
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 1.1,
        size: 4 + Math.random() * 5.5,
        alpha: 1,
        decay: 0.015 + Math.random() * 0.014,
        color: cols[i % cols.length],
        rot: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 0.16
      });
    }
    this._particles.push({
      kind: 'ring',
      x,
      y,
      radius: 12,
      maxRadius: Math.min(window.innerWidth, window.innerHeight) * 0.36,
      alpha: 0.9,
      color: cols[0]
    });
  },

  setBanner(text, gradientCss = null) {
    const stage = document.getElementById('op-banner-stage');
    if (!stage) return;
    stage.innerHTML = '';
    if (!text) return;
    const pill = document.createElement('div');
    pill.className = 'op-banner-pill';
    if (gradientCss) pill.style.background = gradientCss;
    pill.innerText = text;
    stage.appendChild(pill);
  },

  createCharaCard(charId, options = {}) {
    const ch = (typeof getCharacterById === 'function')
      ? getCharacterById(charId)
      : { id: charId, name: '', color: '#ffd700' };

    const card = document.createElement('div');
    card.className = 'op-chara-card'
      + (options.mini ? ' mini' : '')
      + (options.extraClass ? ` ${options.extraClass}` : '');
    if (options.slotKey) card.dataset.opSlot = options.slotKey;

    const img = document.createElement('img');
    img.alt = ch.name || '';
    img.decoding = 'sync';
    if (typeof applyCharacterImageToElement === 'function') {
      applyCharacterImageToElement(img, charId, 'normal');
    } else if (ch.file) {
      img.src = ch.file;
    }
    card.appendChild(img);

    if (!options.hideName && ch.name) {
      const tag = document.createElement('div');
      tag.className = 'op-chara-name-tag';
      tag.innerText = ch.name;
      tag.style.borderColor = ch.color || '#ffd700';
      card.appendChild(tag);
    }

    return card;
  },

  getSlotTargetTransform(slotKey) {
    const isP = this.isPortraitView();
    const mapPortrait = {
      s1_sub01:  'translate3d(-24vw, -12dvh, 0) scale(1)',
      s1_sub02:  'translate3d(24vw, -12dvh, 0) scale(1)',
      s1_sub03:  'translate3d(-24vw, 18dvh, 0) scale(1)',
      s1_main00: 'translate3d(24vw, 18dvh, 0) scale(1.03)',
      s2_enemy01: 'translate3d(-24vw, -12dvh, 0) scale(1)',
      s2_enemy02: 'translate3d(24vw, -12dvh, 0) scale(1)',
      s2_enemy03: 'translate3d(-24vw, 18dvh, 0) scale(1)',
      s2_enemy04: 'translate3d(24vw, 18dvh, 0) scale(1.04)',
      s3_sub01:   'translate3d(-31vw, 21dvh, 0) scale(1)',
      s3_main00:  'translate3d(0vw, 21dvh, 0) scale(1.04)',
      s3_enemy04: 'translate3d(31vw, 21dvh, 0) scale(1)'
    };
    const mapLandscape = {
      s1_sub01:  'translate3d(-36vw, 4dvh, 0) scale(1)',
      s1_main00: 'translate3d(-12vw, 2dvh, 0) scale(1.04)',
      s1_sub02:  'translate3d(12vw, 4dvh, 0) scale(1)',
      s1_sub03:  'translate3d(36vw, 4dvh, 0) scale(1)',
      s2_enemy01: 'translate3d(-36vw, 4dvh, 0) scale(1)',
      s2_enemy02: 'translate3d(-12vw, 4dvh, 0) scale(1)',
      s2_enemy04: 'translate3d(12vw, 2dvh, 0) scale(1.05)',
      s2_enemy03: 'translate3d(36vw, 4dvh, 0) scale(1)',
      s3_sub01:   'translate3d(-36vw, 5dvh, 0) scale(1)',
      s3_main00:  'translate3d(0vw, 22dvh, 0) scale(1.02)',
      s3_enemy04: 'translate3d(36vw, 5dvh, 0) scale(1)'
    };
    return (isP ? mapPortrait[slotKey] : mapLandscape[slotKey]) || 'translate3d(0, 0, 0) scale(1)';
  },

  relayoutActiveCards() {
    const charStage = document.getElementById('op-chara-stage');
    if (!charStage) return;
    charStage.querySelectorAll('.op-chara-card[data-op-slot]').forEach(card => {
      if (card.style.opacity !== '0') {
        card.style.transform = this.getSlotTargetTransform(card.dataset.opSlot);
      }
    });
  },

  animateCardIn(charStage, card, slotKey, startOffset = 'translate3d(0, 44px, 0) scale(0.78)') {
    if (!charStage || !card) return;
    card.style.transition = 'none';
    card.style.transform = startOffset;
    card.style.opacity = '0';
    charStage.appendChild(card);

    const img = card.querySelector('img');
    const launch = () => {
      if (!card.isConnected) return;
      requestAnimationFrame(() => {
        if (!card.isConnected) return;
        card.style.transition = 'transform 0.44s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.28s ease';
        card.style.opacity = '1';
        card.style.transform = this.getSlotTargetTransform(slotKey);
      });
    };

    if (img && typeof img.decode === 'function') {
      if (img.complete && img.naturalWidth > 0) {
        launch();
      } else {
        img.decode().then(launch).catch(launch);
      }
    } else {
      launch();
    }
  },

  enterScene(sceneIdx) {
    if (sceneIdx === this._lastSceneIdx) return;
    this._lastSceneIdx = sceneIdx;
    this.clearSceneTimers();

    const charStage = document.getElementById('op-chara-stage');
    const titleStage = document.getElementById('op-title-stage');
    const W = window.innerWidth || 800;
    const H = window.innerHeight || 600;

    if (sceneIdx === 0) {
      if (charStage) charStage.innerHTML = '';
      if (titleStage) titleStage.classList.remove('show', 'op-finale-pos');
      this.setBanner('POP PUZZLE BATTLE!');
      this.spawnBurst(W * 0.5, H * 0.5, 26);
    } else if (sceneIdx === 1) {
      if (charStage) {
        charStage.innerHTML = '';
        const mainCard = this.createCharaCard('main00', { slotKey: 's1_main00' });
        this.animateCardIn(charStage, mainCard, 's1_main00', 'translate3d(0, 56px, 0) scale(0.8)');

        const allies = [
          { id: 'sub01', slot: 's1_sub01', delay: 420, start: 'translate3d(-32vw, -18dvh, 0) scale(0.75)' },
          { id: 'sub02', slot: 's1_sub02', delay: 820, start: 'translate3d(32vw, -18dvh, 0) scale(0.75)' },
          { id: 'sub03', slot: 's1_sub03', delay: 1220, start: 'translate3d(-32vw, 22dvh, 0) scale(0.75)' }
        ];
        allies.forEach((a) => {
          const tid = setTimeout(() => {
            if (!this._active || this._lastSceneIdx !== 1) return;
            const sub = this.createCharaCard(a.id, { mini: true, slotKey: a.slot });
            this.animateCardIn(charStage, sub, a.slot, a.start);
            this.spawnBurst(W * 0.5, H * 0.48, 16, ['#00d4ff', '#00e676', '#a855f7', '#ffffff']);
          }, a.delay);
          this._sceneTimers.push(tid);
        });
      }
      this.setBanner('CHAIN THE MARKS!', 'linear-gradient(90deg, #00d4ff, #00e676, #00d4ff)');
      this.spawnBurst(W * 0.5, H * 0.5, 24, ['#ff3366', '#ffd700', '#00d4ff']);
    } else if (sceneIdx === 2) {
      if (charStage) {
        charStage.innerHTML = '';
        const rivals = [
          { id: 'enemy01', slot: 's2_enemy01', delay: 80,  start: 'translate3d(-30vw, -22dvh, 0) scale(0.76)' },
          { id: 'enemy02', slot: 's2_enemy02', delay: 320, start: 'translate3d(30vw, -22dvh, 0) scale(0.76)' },
          { id: 'enemy03', slot: 's2_enemy03', delay: 560, start: 'translate3d(-30vw, 22dvh, 0) scale(0.76)' }
        ];
        rivals.forEach((r) => {
          const tid = setTimeout(() => {
            if (!this._active || this._lastSceneIdx !== 2) return;
            const c = this.createCharaCard(r.id, { mini: true, slotKey: r.slot });
            this.animateCardIn(charStage, c, r.slot, r.start);
          }, r.delay);
          this._sceneTimers.push(tid);
        });

        const bossTid = setTimeout(() => {
          if (!this._active || this._lastSceneIdx !== 2) return;
          const boss = this.createCharaCard('enemy04', { slotKey: 's2_enemy04' });
          this.animateCardIn(charStage, boss, 's2_enemy04', 'translate3d(16vw, -20dvh, 0) scale(1.18)');
          this.spawnBurst(W * 0.5, H * 0.48, 30, ['#ff007f', '#9d00ff', '#ff9100', '#ffffff']);
        }, 880);
        this._sceneTimers.push(bossTid);
      }
      this.setBanner('UNLEASH YOUR SKILL!!', 'linear-gradient(90deg, #ff007f, #9d00ff, #ff007f)');
      this._cubes.forEach((cb, idx) => {
        cb.vy = -3.8 - (idx % 3) * 1.1;
        cb.vx = (idx % 2 === 0 ? -1 : 1) * (1.8 + (idx % 3) * 0.8);
      });
    } else if (sceneIdx === 3) {
      if (charStage) {
        charStage.innerHTML = '';
        const leftHero = this.createCharaCard('sub01', { mini: true, hideName: true, slotKey: 's3_sub01', extraClass: 'op-scene3-side' });
        const rightBoss = this.createCharaCard('enemy04', { mini: true, hideName: true, slotKey: 's3_enemy04', extraClass: 'op-scene3-side' });
        const centerHero = this.createCharaCard('main00', { hideName: true, slotKey: 's3_main00', extraClass: 'op-scene3-center' });

        leftHero.style.opacity = '0';
        leftHero.style.transform = this.getSlotTargetTransform('s3_sub01');

        rightBoss.style.opacity = '0';
        rightBoss.style.transform = this.getSlotTargetTransform('s3_enemy04');

        centerHero.style.opacity = '0';
        centerHero.style.transform = this.getSlotTargetTransform('s3_main00');

        charStage.append(leftHero, rightBoss, centerHero);
        requestAnimationFrame(() => {
          [leftHero, rightBoss, centerHero].forEach((el, idx) => {
            el.style.transition = 'opacity 0.24s ease';
            el.style.opacity = idx === 2 ? '0.96' : '0.94';
          });
        });
      }
      this.setBanner('');
      if (titleStage) {
        titleStage.classList.add('op-finale-pos');
        titleStage.classList.add('show');
      }
      this.spawnBurst(W * 0.5, H * 0.42, 40, ['#ffd700', '#ff007f', '#00d4ff', '#00e676', '#ffffff']);
    }
  },

  // ==========================================
  // JS Canvas 2D 描画（背景ズーム / 斜めストライプ / 厳密中央放射線 / 疑似3Dブロック / パーティクル）
  // ==========================================
  drawBackgroundAndEffects(ctx, W, H, elapsedMs, gb) {
    // 1. ベースグラデーション
    const bgGrad = ctx.createRadialGradient(W * 0.5, H * 0.45, Math.min(W, H) * 0.05, W * 0.5, H * 0.5, Math.max(W, H) * 0.8);
    if (gb) {
      bgGrad.addColorStop(0, '#2c2c2c');
      bgGrad.addColorStop(0.55, '#181818');
      bgGrad.addColorStop(1, '#080808');
    } else {
      bgGrad.addColorStop(0, '#241954');
      bgGrad.addColorStop(0.55, '#101735');
      bgGrad.addColorStop(1, '#070b18');
    }
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // 2. system/main 背景画像（ズームアニメーション・完全Canvas化）
    if (this._bgImg && (this._bgImg.naturalWidth || this._bgImg.width)) {
      const p = Math.min(1, elapsedMs / this.TOTAL_DURATION_MS);
      let zoomScale = 1.08;
      let bgAlpha = 0.56;
      if (p < 0.2) {
        const k = p / 0.2;
        bgAlpha = 0.14 + 0.32 * k;
        zoomScale = 1.16 - 0.05 * k;
      } else if (p < 0.65) {
        const k = (p - 0.2) / 0.45;
        bgAlpha = 0.46 + 0.06 * k;
        zoomScale = 1.11 - 0.07 * k;
      } else {
        const k = (p - 0.65) / 0.35;
        bgAlpha = 0.52 + 0.04 * k;
        zoomScale = 1.04 + 0.04 * k;
      }
      const iw = this._bgImg.naturalWidth || this._bgImg.width;
      const ih = this._bgImg.naturalHeight || this._bgImg.height;
      const baseScale = Math.max(W / iw, H / ih) * zoomScale;
      const dw = iw * baseScale;
      const dh = ih * baseScale;
      ctx.save();
      ctx.globalAlpha = bgAlpha;
      if (gb) ctx.filter = 'grayscale(100%) contrast(1.15)';
      ctx.drawImage(this._bgImg, (W - dw) / 2, (H - dh) / 2, dw, dh);
      ctx.restore();
    }

    // 3. 斜めポップストライプ（Canvasで軽量スライド描画）
    const stripeCols = gb
      ? ['rgba(255, 255, 255, 0.06)', 'rgba(170, 170, 170, 0.05)', 'rgba(90, 90, 90, 0.06)']
      : ['rgba(255, 0, 127, 0.08)', 'rgba(0, 212, 255, 0.07)', 'rgba(255, 215, 0, 0.06)'];
    const bandW = 28;
    const cycleW = bandW * 3;
    const diag = Math.hypot(W, H);
    const offset = ((elapsedMs * 0.015) % cycleW);

    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(-Math.PI / 6); // -30deg
    const halfSpan = diag * 0.75;
    let bandIdx = 0;
    for (let x = -halfSpan - cycleW + offset; x < halfSpan + cycleW; x += bandW) {
      ctx.fillStyle = stripeCols[bandIdx % 3];
      ctx.fillRect(x, -halfSpan, bandW, halfSpan * 2);
      bandIdx++;
    }
    ctx.restore();

    // 4. サンバースト放射線（画面中心 W/2, H/2 を軸に純粋な三角法/回転で描画 → 中心ズレ・ブレ一切なし）
    const cx = W / 2;
    const cy = H / 2;
    const radius = Math.hypot(W, H) * 0.82;
    const rayCount = 18;
    const stepAngle = (Math.PI * 2) / rayCount;
    const wedgeAngle = stepAngle * 0.5;
    const sunRot = (elapsedMs / 22000) * Math.PI * 2;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(sunRot);
    ctx.fillStyle = gb ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.055)';
    ctx.beginPath();
    for (let i = 0; i < rayCount; i++) {
      const a0 = i * stepAngle;
      const a1 = a0 + wedgeAngle;
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a0) * radius, Math.sin(a0) * radius);
      ctx.lineTo(Math.cos(a1) * radius, Math.sin(a1) * radius);
      ctx.closePath();
    }
    ctx.fill();
    ctx.restore();
  },

  drawPseudo3DBlock(ctx, c, drawX, drawY, gb) {
    const s = c.size;
    const half = s / 2;
    const cosY = Math.cos(c.spinY);
    const sinY = Math.sin(c.spinY);
    const frontScaleX = Math.max(0.18, Math.abs(cosY));
    const depthOffset = sinY * s * 0.28;
    const fw = s * frontScaleX;

    ctx.save();
    ctx.translate(drawX + half, drawY + half);
    ctx.rotate(c.tiltZ + Math.sin(c.spinY * 0.5) * 0.14);

    // 立体感の側面
    if (Math.abs(depthOffset) > 1.5) {
      const sideX = depthOffset > 0 ? -fw / 2 - Math.abs(depthOffset) : fw / 2;
      ctx.fillStyle = gb ? '#404040' : 'rgba(15, 23, 42, 0.55)';
      ctx.beginPath();
      ctx.roundRect(sideX, -half + 2, Math.abs(depthOffset) + 4, s - 4, 6);
      ctx.fill();
    }

    // 前面ブロック本体
    const bx = -fw / 2;
    const by = -half;
    ctx.fillStyle = gb ? (c.isGarbage ? '#6e6e6e' : '#dcdcdc') : c.bg;
    ctx.beginPath();
    ctx.roundRect(bx, by, fw, s, 9);
    ctx.fill();

    // 上部のツヤグラデーション
    const gloss = ctx.createLinearGradient(0, by, 0, by + s);
    gloss.addColorStop(0, 'rgba(255, 255, 255, 0.44)');
    gloss.addColorStop(0.5, 'rgba(255, 255, 255, 0.05)');
    gloss.addColorStop(1, 'rgba(0, 0, 0, 0.28)');
    ctx.fillStyle = gloss;
    ctx.beginPath();
    ctx.roundRect(bx, by, fw, s, 9);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(bx, by, fw, s, 9);
    ctx.stroke();

    // 中央シンボル
    if (frontScaleX > 0.28) {
      ctx.save();
      ctx.scale(frontScaleX, 1);
      ctx.font = `900 ${Math.round(s * 0.52)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
      ctx.fillText(c.symbol, 0, 2);
      ctx.fillStyle = gb ? (c.isGarbage ? '#ffffff' : '#111111') : c.textColor;
      ctx.fillText(c.symbol, 0, 0);
      ctx.restore();
    }

    ctx.restore();
  },

  drawStar(ctx, x, y, r, rot, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a1 = (i * 2 * Math.PI) / 5 - Math.PI / 2;
      const a2 = a1 + Math.PI / 5;
      if (i === 0) ctx.moveTo(Math.cos(a1) * r, Math.sin(a1) * r);
      else ctx.lineTo(Math.cos(a1) * r, Math.sin(a1) * r);
      ctx.lineTo(Math.cos(a2) * r * 0.45, Math.sin(a2) * r * 0.45);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  },

  // ==========================================
  // リキッドトランジション（ドロップ出現 → 斜めに細長く広がり融合してメイン画面へ）
  // ==========================================
  syncLiquidMaskBounds() {
    const W = Math.max(320, window.innerWidth);
    const H = Math.max(240, window.innerHeight);
    const mask = document.getElementById('op-liquid-mask');
    const bg = document.getElementById('op-liquid-mask-bg');
    if (mask) {
      mask.setAttribute('width', String(W));
      mask.setAttribute('height', String(H));
    }
    if (bg) {
      bg.setAttribute('width', String(W));
      bg.setAttribute('height', String(H));
    }
  },

  initLiquidDrops() {
    const svgNS = 'http://www.w3.org/2000/svg';
    const cutouts = document.getElementById('op-liquid-cutouts');
    if (!cutouts) return false;

    this.syncLiquidMaskBounds();
    cutouts.innerHTML = '';

    const specs = [
      { rx: 0.50, ry: 0.46, delay: 0.00, angle: -34, scale: 1.15, color: '#00d4ff' },
      { rx: 0.22, ry: 0.24, delay: 0.05, angle: -34, scale: 0.96, color: '#ff007f' },
      { rx: 0.78, ry: 0.72, delay: 0.07, angle: -34, scale: 0.98, color: '#ffd700' },
      { rx: 0.24, ry: 0.76, delay: 0.11, angle: -34, scale: 0.92, color: '#00e676' },
      { rx: 0.76, ry: 0.22, delay: 0.13, angle: -34, scale: 0.94, color: '#ff9100' },
      { rx: 0.10, ry: 0.50, delay: 0.16, angle: -34, scale: 0.90, color: '#a855f7' },
      { rx: 0.90, ry: 0.48, delay: 0.18, angle: -34, scale: 0.90, color: '#00d4ff' }
    ];

    this._liquidDrops = specs;
    this._liquidSvgNodes = specs.map((sp) => {
      const g = document.createElementNS(svgNS, 'g');
      const circle = document.createElementNS(svgNS, 'circle');
      const rect = document.createElementNS(svgNS, 'rect');
      g.appendChild(circle);
      g.appendChild(rect);
      cutouts.appendChild(g);
      return { g, circle, rect, sp };
    });

    return true;
  },

  updateLiquidTransition(now) {
    const elapsed = now - this._liquidStartTime;
    const p = Math.min(1, Math.max(0, elapsed / this.LIQUID_DURATION_MS));
    const W = Math.max(320, window.innerWidth);
    const H = Math.max(240, window.innerHeight);
    const minDim = Math.min(W, H);
    const diag = Math.hypot(W, H);

    // リキッド中も背景の放射線やブロックを流し続ける
    const dtMs = this._lastFrameTime ? Math.min(48, Math.max(4, now - this._lastFrameTime)) : 16.6667;
    this._lastFrameTime = now;
    this.stepAndDrawCanvas(now - this._startTime, dtMs / 16.6667);

    if (this._edgeCtx && this._edgeCanvas) {
      this._edgeCtx.clearRect(0, 0, W, H);
    }

    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
    const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

    this._liquidSvgNodes.forEach(({ circle, rect, sp }) => {
      const local = Math.max(0, Math.min(1, (p - sp.delay) / Math.max(0.01, 1 - sp.delay)));
      const cx = sp.rx * W;
      const cy = sp.ry * H;

      const dropPhase = Math.min(1, local / 0.28);
      const dropRadius = minDim * 0.085 * sp.scale * easeOutCubic(dropPhase);

      const streakPhase = Math.max(0, Math.min(1, (local - 0.12) / 0.88));
      const lengthVal = diag * 1.45 * easeInOutCubic(streakPhase);
      const expandPhase = Math.max(0, Math.min(1, (local - 0.36) / 0.64));
      const baseThick = minDim * 0.068 * sp.scale;
      const thickVal = baseThick + Math.max(W, H) * 0.58 * Math.pow(expandPhase, 1.85);

      circle.setAttribute('cx', cx.toFixed(1));
      circle.setAttribute('cy', cy.toFixed(1));
      circle.setAttribute('r', Math.max(0, dropRadius).toFixed(1));

      if (streakPhase > 0.001) {
        const halfL = lengthVal / 2;
        const halfT = thickVal / 2;
        const rxVal = Math.min(halfL, halfT);
        rect.setAttribute('x', (-halfL).toFixed(1));
        rect.setAttribute('y', (-halfT).toFixed(1));
        rect.setAttribute('width', Math.max(0, lengthVal).toFixed(1));
        rect.setAttribute('height', Math.max(0, thickVal).toFixed(1));
        rect.setAttribute('rx', rxVal.toFixed(1));
        rect.setAttribute('ry', rxVal.toFixed(1));
        rect.setAttribute('transform', `translate(${cx.toFixed(1)} ${cy.toFixed(1)}) rotate(${sp.angle})`);
      } else {
        rect.setAttribute('width', '0');
        rect.setAttribute('height', '0');
      }

      if (this._edgeCtx && local > 0.01 && p < 0.96) {
        const ctx = this._edgeCtx;
        const edgeAlpha = (1 - Math.pow(p, 2.2)) * 0.72;
        ctx.save();
        ctx.globalAlpha = edgeAlpha;
        ctx.strokeStyle = sp.color;
        ctx.lineWidth = 3.5;
        ctx.shadowColor = sp.color;
        ctx.shadowBlur = 12;

        if (streakPhase <= 0.18 && dropRadius > 2) {
          ctx.beginPath();
          ctx.arc(cx, cy, dropRadius + 2, 0, Math.PI * 2);
          ctx.stroke();
        } else if (lengthVal > 4 && thickVal > 4) {
          ctx.translate(cx, cy);
          ctx.rotate((sp.angle * Math.PI) / 180);
          ctx.beginPath();
          ctx.roundRect(-lengthVal / 2, -thickVal / 2, lengthVal, thickVal, Math.min(lengthVal, thickVal) / 2);
          ctx.stroke();
        }
        ctx.restore();
      }
    });

    if (p >= 1) {
      this.finishImmediate();
    } else {
      this._rafId = requestAnimationFrame((t) => this.updateAndDraw(t));
    }
  },

  startLiquidTransition() {
    if (!this._active || this._phase === 'liquid') return;
    this._phase = 'liquid';
    this._liquidStartTime = performance.now();
    this.clearSceneTimers();

    const overlay = document.getElementById('op-overlay');
    const edgeCanvas = document.getElementById('op-liquid-edge-canvas');
    if (overlay) {
      overlay.classList.add('is-liquid-masked');
      overlay.style.pointerEvents = 'none';
    }
    if (edgeCanvas) {
      this._edgeCanvas = edgeCanvas;
      this._edgeCtx = edgeCanvas.getContext('2d');
      this.resizeCanvas();
      edgeCanvas.style.display = 'block';
    }

    if (typeof SceneBgm !== 'undefined') {
      SceneBgm.play('mode_select');
    }

    if (!this.initLiquidDrops()) {
      this.finishImmediate();
      return;
    }

    this._rafId = requestAnimationFrame((t) => this.updateAndDraw(t));
  },

  stepAndDrawCanvas(elapsed, dtFactor) {
    const W = this._canvas ? this._canvas.width : window.innerWidth;
    const H = this._canvas ? this._canvas.height : window.innerHeight;
    const gb = (typeof isGbMode !== 'undefined' && isGbMode);

    // ブロックとパーティクルの更新（holding中も止めずに3秒継続）
    for (let i = 0; i < this._cubes.length; i++) {
      const c = this._cubes[i];
      c.x += c.vx * dtFactor;
      c.y += c.vy * dtFactor;
      c.vy += 0.042 * dtFactor;
      c.spinY += c.spinSpeed * dtFactor;
      if (c.y > H + 70) {
        c.y = -60 - Math.random() * 60;
        c.x = 24 + Math.random() * Math.max(100, W - 48);
        c.vy = 1.5 + Math.random() * 1.8;
        c.vx = (Math.random() - 0.5) * 1.1;
      }
      if (c.x < -50) c.x = W + 40;
      if (c.x > W + 50) c.x = -40;
    }

    if (Math.random() < 0.24 * dtFactor) {
      const cols = ['#ff3366', '#ffd700', '#00d4ff', '#00e676', '#ff9100', '#ffffff'];
      this._particles.push({
        kind: Math.random() < 0.55 ? 'star' : 'dot',
        x: Math.random() * W,
        y: H + 10,
        vx: (Math.random() - 0.5) * 1.4,
        vy: -2.4 - Math.random() * 3.2,
        size: 4 + Math.random() * 5.5,
        alpha: 0.9,
        decay: 0.008 + Math.random() * 0.008,
        color: cols[Math.floor(Math.random() * cols.length)],
        rot: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 0.1
      });
    }

    for (let i = this._particles.length - 1; i >= 0; i--) {
      const p = this._particles[i];
      if (p.kind === 'ring') {
        p.radius += (p.maxRadius - p.radius) * Math.min(1, 0.11 * dtFactor);
        p.alpha -= 0.026 * dtFactor;
        if (p.alpha <= 0) this._particles.splice(i, 1);
      } else {
        p.x += p.vx * dtFactor;
        p.y += p.vy * dtFactor;
        p.rot += p.vRot * dtFactor;
        p.alpha -= p.decay * dtFactor;
        if (p.alpha <= 0) this._particles.splice(i, 1);
      }
    }

    if (!this._ctx || !this._canvas) return;
    const ctx = this._ctx;
    ctx.clearRect(0, 0, W, H);

    // 1. 背景・ストライプ・放射線
    this.drawBackgroundAndEffects(ctx, W, H, elapsed, gb);

    // 2. 舞うブロック（JS Canvas描画）
    for (let i = 0; i < this._cubes.length; i++) {
      const c = this._cubes[i];
      const sway = Math.sin(elapsed * 0.0028 + c.rotPhase) * c.amp;
      this.drawPseudo3DBlock(ctx, c, c.x + sway, c.y, gb);
    }

    // 3. パーティクル・リング
    for (let i = 0; i < this._particles.length; i++) {
      const p = this._particles[i];
      if (p.kind === 'ring') {
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.alpha);
        ctx.strokeStyle = gb ? '#ffffff' : p.color;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        continue;
      }
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.alpha);
      const drawCol = gb ? '#f5f5f5' : p.color;
      if (p.kind === 'star') {
        this.drawStar(ctx, p.x, p.y, p.size, p.rot, drawCol);
      } else {
        ctx.fillStyle = drawCol;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.65, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  },

  updateAndDraw(now) {
    if (!this._active) return;

    if (this._phase === 'liquid') {
      this.updateLiquidTransition(now);
      return;
    }

    const dtMs = this._lastFrameTime ? Math.min(48, Math.max(4, now - this._lastFrameTime)) : 16.6667;
    this._lastFrameTime = now;
    const dtFactor = dtMs / 16.6667;
    const elapsed = now - this._startTime;

    if (this._phase === 'playing') {
      if (elapsed >= this.TOTAL_DURATION_MS) {
        // 立ち絵やタイトルは静止したまま、背景放射線回転・舞うブロックのみ3秒継続
        this._phase = 'holding';
        this._holdStartTime = now;
        const overlay = document.getElementById('op-overlay');
        if (overlay) overlay.classList.add('is-holding');
      } else {
        if (elapsed < 3000) this.enterScene(0);
        else if (elapsed < 7000) this.enterScene(1);
        else if (elapsed < 11000) this.enterScene(2);
        else this.enterScene(3);
      }
    } else if (this._phase === 'holding') {
      if ((now - this._holdStartTime) >= this.HOLD_DURATION_MS) {
        this.startLiquidTransition();
        return;
      }
    }

    this.stepAndDrawCanvas(elapsed, dtFactor);
    this._rafId = requestAnimationFrame((t) => this.updateAndDraw(t));
  },

  start() {
    const gameArea = document.getElementById('game-area');
    if (gameArea && window.getComputedStyle(gameArea).display !== 'none') return;
    const overlay = document.getElementById('op-overlay');
    if (!overlay) return;

    this.cleanup();
    this.bindEventsOnce();

    this._canvas = document.getElementById('op-canvas');
    this._ctx = this._canvas ? this._canvas.getContext('2d') : null;
    this._edgeCanvas = document.getElementById('op-liquid-edge-canvas');
    this._edgeCtx = this._edgeCanvas ? this._edgeCanvas.getContext('2d') : null;
    this.resizeCanvas();
    this.updateOverlayOrientationClass();
    this.loadSystemBgImage();
    this.initBlocks();

    this._particles = [];
    this._lastSceneIdx = -1;
    this._active = true;
    this._phase = 'playing';
    this._startTime = performance.now();
    this._lastFrameTime = this._startTime;
    this._canSkipAt = this._startTime + 450;

    overlay.classList.remove('op-fadeout', 'is-holding', 'is-liquid-masked');
    overlay.style.pointerEvents = 'auto';
    overlay.style.display = 'flex';

    if (typeof SceneBgm !== 'undefined') {
      SceneBgm.play('op');
    }

    if (typeof syncPadSnapshotsAll === 'function') syncPadSnapshotsAll(220);
    this._rafId = requestAnimationFrame((t) => this.updateAndDraw(t));
  },

  skip(force = false) {
    if (!this._active) return;
    if (this._phase === 'liquid') return;
    if (!force && performance.now() < this._canSkipAt) return;
    if (typeof ensureAudioCtxResumed === 'function') ensureAudioCtxResumed();
    if (typeof SE !== 'undefined') SE.play('select');
    // スキップ時も③と同じリキッドトランジションでメイン画面へ遷移
    this.startLiquidTransition();
  },

  finishImmediate() {
    this._active = false;
    this._phase = 'idle';
    this.clearSceneTimers();
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    const overlay = document.getElementById('op-overlay');
    if (overlay) {
      overlay.style.display = 'none';
      overlay.classList.remove('op-fadeout', 'is-holding', 'is-liquid-masked');
      overlay.style.pointerEvents = 'auto';
    }
    const edgeCanvas = document.getElementById('op-liquid-edge-canvas');
    if (edgeCanvas) {
      edgeCanvas.style.display = 'none';
      if (this._edgeCtx) this._edgeCtx.clearRect(0, 0, edgeCanvas.width, edgeCanvas.height);
    }
    const cutouts = document.getElementById('op-liquid-cutouts');
    if (cutouts) cutouts.innerHTML = '';
    this._liquidSvgNodes = [];
    this.clearStageDom();

    if (typeof SceneBgm !== 'undefined') {
      SceneBgm.play('mode_select');
    }
    if (typeof syncPadSnapshotsAll === 'function') syncPadSnapshotsAll(220);
    if (typeof focusPrimaryMenuElement === 'function') {
      focusPrimaryMenuElement('main-menu-actions');
    }
  },

  clearStageDom() {
    const chara = document.getElementById('op-chara-stage');
    const banner = document.getElementById('op-banner-stage');
    const title = document.getElementById('op-title-stage');
    if (chara) chara.innerHTML = '';
    if (banner) banner.innerHTML = '';
    if (title) title.classList.remove('show', 'op-finale-pos');
    this._cubes = [];
    this._particles = [];
  },

  cleanup() {
    this._active = false;
    this._phase = 'idle';
    this.clearSceneTimers();
    if (this._fadeTimer) {
      clearTimeout(this._fadeTimer);
      this._fadeTimer = null;
    }
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    const overlay = document.getElementById('op-overlay');
    if (overlay) {
      overlay.classList.remove('op-fadeout', 'is-holding', 'is-liquid-masked');
      overlay.style.pointerEvents = 'auto';
    }
    const edgeCanvas = document.getElementById('op-liquid-edge-canvas');
    if (edgeCanvas) {
      edgeCanvas.style.display = 'none';
    }
    const cutouts = document.getElementById('op-liquid-cutouts');
    if (cutouts) cutouts.innerHTML = '';
    this._liquidSvgNodes = [];
    this.clearStageDom();
  }
};