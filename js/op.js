// ==========================================
// ポップなパズルゲーム風 オープニングアニメーション（JS Canvas 2D描画版）
// ・背景ズーム / 斜めストライプ / 放射線 / 疑似3D回転ブロック / パーティクルをCanvasへ統合
// ・本編15秒後、立ち絵とタイトルは静止したまま背景放射線とブロック舞いは3秒間継続
// ・3秒後およびスキップ時は全端末（iOS含む）対応のCanvas Gooeyリキッド遷移でメイン画面へ遷移
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
  _endedAt: 0,
  _lastSceneIdx: -1,
  _particles: [],
  _cubes: [],
  _canvas: null,
  _ctx: null,
  _edgeCanvas: null,
  _edgeCtx: null,
  _bgImg: null,
  _domSnapshotCanvas: null,
  _gooRawCanvas: null,
  _gooRawCtx: null,
  _gooOutCanvas: null,
  _gooOutCtx: null,
  _gooW: 0,
  _gooH: 0,
  _liquidDrops: [],
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
        if (e.detail === 0) this.skip(true);
      });
    }

    if (overlay) {
      overlay.addEventListener('pointerdown', (e) => {
        if (!this._active) return;
        if (typeof ensureAudioCtxResumed === 'function') ensureAudioCtxResumed();
        e.stopPropagation();
        e.preventDefault();
        if (this._phase === 'liquid') return;
        this.skip(false);
      });
      // iOSのpointerdown後に遅れて発生する合成clickが裏の要素へ貫通するのを完全遮断
      overlay.addEventListener('click', (e) => {
        if (!this._active) return;
        e.stopPropagation();
        e.preventDefault();
      });
      overlay.addEventListener('touchend', (e) => {
        if (!this._active) return;
        e.stopPropagation();
      }, { passive: true });
    }

    window.addEventListener('resize', () => {
      if (this._active) {
        this.resizeCanvas();
        this.updateOverlayOrientationClass();
        this.relayoutActiveCards();
        if (this._phase === 'liquid') {
          this.initGooMaskBuffers();
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
  // JS Canvas 2D 描画（背景ズーム / 斜めストライプ / 放射線 / 疑似3Dブロック / パーティクル）
  // ==========================================
  drawBackgroundAndEffects(ctx, W, H, elapsedMs, gb) {
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
      const drawBg = (gb && typeof getToneCanvasForImage === 'function')
        ? (getToneCanvasForImage(this._bgImg) || this._bgImg)
        : this._bgImg;
      ctx.drawImage(drawBg, (W - dw) / 2, (H - dh) / 2, dw, dh);
      ctx.restore();
    }

    const stripeCols = gb
      ? ['rgba(255, 255, 255, 0.06)', 'rgba(170, 170, 170, 0.05)', 'rgba(90, 90, 90, 0.06)']
      : ['rgba(255, 0, 127, 0.08)', 'rgba(0, 212, 255, 0.07)', 'rgba(255, 215, 0, 0.06)'];
    const bandW = 28;
    const cycleW = bandW * 3;
    const diag = Math.hypot(W, H);
    const offset = ((elapsedMs * 0.015) % cycleW);

    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(-Math.PI / 6);
    const halfSpan = diag * 0.75;
    let bandIdx = 0;
    for (let x = -halfSpan - cycleW + offset; x < halfSpan + cycleW; x += bandW) {
      ctx.fillStyle = stripeCols[bandIdx % 3];
      ctx.fillRect(x, -halfSpan, bandW, halfSpan * 2);
      bandIdx++;
    }
    ctx.restore();

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

    if (Math.abs(depthOffset) > 1.5) {
      const sideX = depthOffset > 0 ? -fw / 2 - Math.abs(depthOffset) : fw / 2;
      ctx.fillStyle = gb ? '#404040' : 'rgba(15, 23, 42, 0.55)';
      ctx.beginPath();
      ctx.roundRect(sideX, -half + 2, Math.abs(depthOffset) + 4, s - 4, 6);
      ctx.fill();
    }

    const bx = -fw / 2;
    const by = -half;
    ctx.fillStyle = gb ? (c.isGarbage ? '#6e6e6e' : '#dcdcdc') : c.bg;
    ctx.beginPath();
    ctx.roundRect(bx, by, fw, s, 9);
    ctx.fill();

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
  // iOS 18.4以下完全対応：Canvas焼き付け + Gooeyリキッドマスク(destination-out)
  // ==========================================
  captureDomStageSnapshot(W, H) {
    const snap = document.createElement('canvas');
    snap.width = W;
    snap.height = H;
    const sCtx = snap.getContext('2d');
    const gb = (typeof isGbMode !== 'undefined' && isGbMode);

    const charStage = document.getElementById('op-chara-stage');
    if (charStage) {
      charStage.querySelectorAll('.op-chara-card').forEach(card => {
        const st = window.getComputedStyle(card);
        const op = parseFloat(st.opacity);
        if (!op || op <= 0.01) return;

        const img = card.querySelector('img');
        if (img && img.complete && (img.naturalWidth || img.width)) {
          const r = img.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) {
            sCtx.save();
            sCtx.globalAlpha = op;
            const drawImg = (gb && typeof getToneCanvasForImage === 'function')
              ? (getToneCanvasForImage(img) || img)
              : img;
            sCtx.drawImage(drawImg, r.left, r.top, r.width, r.height);
            sCtx.restore();
          }
        }

        const tag = card.querySelector('.op-chara-name-tag');
        if (tag) {
          const tr = tag.getBoundingClientRect();
          if (tr.width > 0 && tr.height > 0) {
            const tStyle = window.getComputedStyle(tag);
            sCtx.save();
            sCtx.globalAlpha = op;
            sCtx.fillStyle = 'rgba(10, 15, 32, 0.88)';
            sCtx.beginPath();
            sCtx.roundRect(tr.left, tr.top, tr.width, tr.height, tr.height / 2);
            sCtx.fill();
            sCtx.strokeStyle = gb ? '#ffffff' : (tStyle.borderColor || '#ffd700');
            sCtx.lineWidth = 2;
            sCtx.stroke();
            sCtx.fillStyle = '#ffffff';
            sCtx.font = `900 ${tStyle.fontSize || '14px'} sans-serif`;
            sCtx.textAlign = 'center';
            sCtx.textBaseline = 'middle';
            sCtx.fillText(tag.innerText, tr.left + tr.width / 2, tr.top + tr.height / 2);
            sCtx.restore();
          }
        }
      });
    }

    const bannerPill = document.querySelector('#op-banner-stage .op-banner-pill');
    if (bannerPill) {
      const br = bannerPill.getBoundingClientRect();
      if (br.width > 0 && br.height > 0) {
        const bStyle = window.getComputedStyle(bannerPill);
        sCtx.save();
        sCtx.translate(br.left + br.width / 2, br.top + br.height / 2);
        sCtx.rotate(-0.035);
        const bw = bannerPill.offsetWidth || br.width;
        const bh = bannerPill.offsetHeight || br.height;
        const grad = sCtx.createLinearGradient(-bw / 2, 0, bw / 2, 0);
        if (gb) {
          grad.addColorStop(0, '#e5e5e5');
          grad.addColorStop(1, '#ffffff');
        } else {
          grad.addColorStop(0, '#ffd700');
          grad.addColorStop(0.5, '#ff8c00');
          grad.addColorStop(1, '#ffd700');
        }
        sCtx.fillStyle = grad;
        sCtx.beginPath();
        sCtx.roundRect(-bw / 2, -bh / 2, bw, bh, bh / 2);
        sCtx.fill();
        sCtx.strokeStyle = '#ffffff';
        sCtx.lineWidth = 3;
        sCtx.stroke();
        sCtx.fillStyle = '#070b14';
        sCtx.font = `italic 900 ${bStyle.fontSize || '18px'} sans-serif`;
        sCtx.textAlign = 'center';
        sCtx.textBaseline = 'middle';
        sCtx.fillText(bannerPill.innerText, 0, 1);
        sCtx.restore();
      }
    }

    const titleStage = document.getElementById('op-title-stage');
    if (titleStage && titleStage.classList.contains('show')) {
      const tsRect = titleStage.getBoundingClientRect();
      if (tsRect.width > 0 && tsRect.height > 0) {
        const cx = tsRect.left + tsRect.width / 2;
        const cy = tsRect.top + tsRect.height / 2;
        const rad = Math.max(tsRect.width, tsRect.height) * 0.6;
        const rGrad = sCtx.createRadialGradient(cx, cy, 10, cx, cy, rad);
        rGrad.addColorStop(0, 'rgba(15, 23, 42, 0.84)');
        rGrad.addColorStop(0.75, 'rgba(15, 23, 42, 0.45)');
        rGrad.addColorStop(1, 'rgba(15, 23, 42, 0)');
        sCtx.fillStyle = rGrad;
        sCtx.fillRect(tsRect.left, tsRect.top, tsRect.width, tsRect.height);

        const badgeEl = titleStage.querySelector('.op-title-badge');
        if (badgeEl) {
          const r = badgeEl.getBoundingClientRect();
          const st = window.getComputedStyle(badgeEl);
          sCtx.save();
          const bgG = sCtx.createLinearGradient(r.left, r.top, r.right, r.top);
          bgG.addColorStop(0, gb ? '#333333' : '#ff007f');
          bgG.addColorStop(1, gb ? '#666666' : '#ff8c00');
          sCtx.fillStyle = bgG;
          sCtx.beginPath();
          sCtx.roundRect(r.left, r.top, r.width, r.height, r.height / 2);
          sCtx.fill();
          sCtx.strokeStyle = gb ? '#ffffff' : '#ffd700';
          sCtx.lineWidth = 1.5;
          sCtx.stroke();
          sCtx.fillStyle = '#ffffff';
          sCtx.font = `900 ${st.fontSize || '12px'} sans-serif`;
          sCtx.textAlign = 'center';
          sCtx.textBaseline = 'middle';
          sCtx.fillText(badgeEl.innerText, r.left + r.width / 2, r.top + r.height / 2);
          sCtx.restore();
        }

        const logoEl = titleStage.querySelector('.op-title-logo');
        if (logoEl) {
          const r = logoEl.getBoundingClientRect();
          const st = window.getComputedStyle(logoEl);
          sCtx.save();
          sCtx.font = `900 ${st.fontSize || '64px'} sans-serif`;
          sCtx.textAlign = 'center';
          sCtx.textBaseline = 'middle';
          const lx = r.left + r.width / 2;
          const ly = r.top + r.height / 2;
          sCtx.fillStyle = gb ? '#111111' : '#1e1b4b';
          sCtx.fillText(logoEl.innerText, lx, ly + 5);
          const lGrad = sCtx.createLinearGradient(0, r.top, 0, r.bottom);
          if (gb) {
            lGrad.addColorStop(0, '#ffffff');
            lGrad.addColorStop(0.5, '#d4d4d4');
            lGrad.addColorStop(1, '#737373');
          } else {
            lGrad.addColorStop(0, '#ffffff');
            lGrad.addColorStop(0.48, '#ffd700');
            lGrad.addColorStop(1, '#ff007f');
          }
          sCtx.fillStyle = lGrad;
          sCtx.fillText(logoEl.innerText, lx, ly);
          sCtx.restore();
        }

        const subEl = titleStage.querySelector('.op-title-sub');
        if (subEl) {
          const r = subEl.getBoundingClientRect();
          const st = window.getComputedStyle(subEl);
          sCtx.save();
          sCtx.font = `900 ${st.fontSize || '14px'} sans-serif`;
          sCtx.textAlign = 'center';
          sCtx.textBaseline = 'middle';
          sCtx.fillStyle = '#000000';
          sCtx.fillText(subEl.innerText, r.left + r.width / 2, r.top + r.height / 2 + 2);
          sCtx.fillStyle = gb ? '#e5e5e5' : '#00d4ff';
          sCtx.fillText(subEl.innerText, r.left + r.width / 2, r.top + r.height / 2);
          sCtx.restore();
        }
      }
    }

    return snap;
  },

  initGooMaskBuffers() {
    const W = Math.max(320, window.innerWidth);
    const H = Math.max(240, window.innerHeight);
    const maxSide = 210;
    const scale = Math.min(0.25, maxSide / Math.max(W, H));
    const gw = Math.max(64, Math.round(W * scale));
    const gh = Math.max(64, Math.round(H * scale));

    this._gooW = gw;
    this._gooH = gh;

    if (!this._gooRawCanvas) this._gooRawCanvas = document.createElement('canvas');
    if (!this._gooOutCanvas) this._gooOutCanvas = document.createElement('canvas');
    this._gooRawCanvas.width = gw;
    this._gooRawCanvas.height = gh;
    this._gooOutCanvas.width = gw;
    this._gooOutCanvas.height = gh;
    this._gooRawCtx = this._gooRawCanvas.getContext('2d', { willReadFrequently: true });
    this._gooOutCtx = this._gooOutCanvas.getContext('2d');
  },

  initLiquidDrops() {
    this.initGooMaskBuffers();
    this._liquidDrops = [
      { rx: 0.50, ry: 0.86, delay: 0.00, angle: -34, scale: 1.25, color: '#00e676' },
      { rx: 0.50, ry: 0.50, delay: 0.04, angle: -34, scale: 1.15, color: '#00d4ff' },
      { rx: 0.22, ry: 0.26, delay: 0.07, angle: -34, scale: 0.96, color: '#ff007f' },
      { rx: 0.78, ry: 0.72, delay: 0.09, angle: -34, scale: 1.00, color: '#ffd700' },
      { rx: 0.24, ry: 0.76, delay: 0.12, angle: -34, scale: 0.95, color: '#00e676' },
      { rx: 0.76, ry: 0.22, delay: 0.14, angle: -34, scale: 0.94, color: '#ff9100' },
      { rx: 0.12, ry: 0.50, delay: 0.16, angle: -34, scale: 0.92, color: '#a855f7' },
      { rx: 0.88, ry: 0.48, delay: 0.18, angle: -34, scale: 0.92, color: '#00d4ff' }
    ];
    return true;
  },

  buildGooAlphaMask(p, W, H) {
    const gw = this._gooW;
    const gh = this._gooH;
    const rCtx = this._gooRawCtx;
    const oCtx = this._gooOutCtx;
    if (!rCtx || !oCtx || gw <= 0 || gh <= 0) return;

    const sx = gw / W;
    const sy = gh / H;
    const minDim = Math.min(W, H);
    const diag = Math.hypot(W, H);

    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
    const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

    rCtx.clearRect(0, 0, gw, gh);
    rCtx.save();
    rCtx.scale(sx, sy);
    rCtx.fillStyle = '#ffffff';

    if (this._edgeCtx && this._edgeCanvas) {
      this._edgeCtx.clearRect(0, 0, W, H);
    }

    const gb = (typeof isGbMode !== 'undefined' && isGbMode);

    this._liquidDrops.forEach((sp) => {
      const local = Math.max(0, Math.min(1, (p - sp.delay) / Math.max(0.01, 1 - sp.delay)));
      if (local <= 0.001) return;

      const cx = sp.rx * W;
      const cy = sp.ry * H;

      const dropPhase = Math.min(1, local / 0.28);
      const dropRadius = minDim * 0.095 * sp.scale * easeOutCubic(dropPhase);

      const streakPhase = Math.max(0, Math.min(1, (local - 0.10) / 0.90));
      const lengthVal = diag * 1.50 * easeInOutCubic(streakPhase);
      const expandPhase = Math.max(0, Math.min(1, (local - 0.34) / 0.66));
      const baseThick = minDim * 0.075 * sp.scale;
      const thickVal = baseThick + Math.max(W, H) * 0.62 * Math.pow(expandPhase, 1.8);

      if (dropRadius > 0.5) {
        rCtx.beginPath();
        rCtx.arc(cx, cy, dropRadius, 0, Math.PI * 2);
        rCtx.fill();
      }

      if (streakPhase > 0.001 && lengthVal > 1 && thickVal > 1) {
        const halfL = lengthVal / 2;
        const halfT = thickVal / 2;
        const rad = Math.min(halfL, halfT);
        rCtx.save();
        rCtx.translate(cx, cy);
        rCtx.rotate((sp.angle * Math.PI) / 180);
        rCtx.beginPath();
        rCtx.roundRect(-halfL, -halfT, lengthVal, thickVal, rad);
        rCtx.fill();
        rCtx.restore();
      }

      if (this._edgeCtx && p < 0.96) {
        const eCtx = this._edgeCtx;
        const edgeAlpha = (1 - Math.pow(p, 2.2)) * 0.72;
        const edgeColor = gb ? '#ffffff' : sp.color;
        eCtx.save();
        eCtx.globalAlpha = edgeAlpha;
        eCtx.strokeStyle = edgeColor;
        eCtx.lineWidth = 3.5;
        eCtx.shadowColor = edgeColor;
        eCtx.shadowBlur = 10;

        if (streakPhase <= 0.18 && dropRadius > 2) {
          eCtx.beginPath();
          eCtx.arc(cx, cy, dropRadius + 2, 0, Math.PI * 2);
          eCtx.stroke();
        } else if (lengthVal > 4 && thickVal > 4) {
          eCtx.translate(cx, cy);
          eCtx.rotate((sp.angle * Math.PI) / 180);
          eCtx.beginPath();
          eCtx.roundRect(-lengthVal / 2, -thickVal / 2, lengthVal, thickVal, Math.min(lengthVal, thickVal) / 2);
          eCtx.stroke();
        }
        eCtx.restore();
      }
    });

    rCtx.restore();

    // 軽量分離型ボックスブラー＋アルファ閾値処理（Gooeyメタボール融合・iOS含む全ブラウザ同一挙動）
    const imgData = rCtx.getImageData(0, 0, gw, gh);
    const data = imgData.data;
    const len = gw * gh;
    const bufA = new Uint16Array(len);
    const bufB = new Uint16Array(len);

    for (let i = 0; i < len; i++) {
      bufA[i] = data[(i << 2) + 3];
    }

    const passBlur = (src, dst, r) => {
      const div = r * 2 + 1;
      for (let y = 0; y < gh; y++) {
        const row = y * gw;
        for (let x = 0; x < gw; x++) {
          let sum = 0;
          for (let k = -r; k <= r; k++) {
            const xx = x + k;
            sum += src[row + (xx < 0 ? 0 : (xx >= gw ? gw - 1 : xx))];
          }
          bufB[row + x] = (sum / div) | 0;
        }
      }
      for (let y = 0; y < gh; y++) {
        const row = y * gw;
        for (let x = 0; x < gw; x++) {
          let sum = 0;
          for (let k = -r; k <= r; k++) {
            const yy = y + k;
            const cyIdx = yy < 0 ? 0 : (yy >= gh ? gh - 1 : yy);
            sum += bufB[cyIdx * gw + x];
          }
          dst[row + x] = (sum / div) | 0;
        }
      }
    };

    passBlur(bufA, bufA, 3);
    passBlur(bufA, bufA, 2);

    for (let i = 0; i < len; i++) {
      const a = bufA[i];
      // Gooey閾値処理（feColorMatrix 28 * a - 11 相当）
      const goo = (a - 102) * 14;
      const outA = goo < 0 ? 0 : (goo > 255 ? 255 : goo);
      const off = i << 2;
      data[off] = 255;
      data[off + 1] = 255;
      data[off + 2] = 255;
      data[off + 3] = outA;
    }
    oCtx.putImageData(imgData, 0, 0);
  },

  updateLiquidTransition(now) {
    const elapsed = now - this._liquidStartTime;
    const p = Math.min(1, Math.max(0, elapsed / this.LIQUID_DURATION_MS));
    const W = Math.max(320, window.innerWidth);
    const H = Math.max(240, window.innerHeight);

    const dtMs = this._lastFrameTime ? Math.min(48, Math.max(4, now - this._lastFrameTime)) : 16.6667;
    this._lastFrameTime = now;

    this.stepAndDrawCanvas(now - this._startTime, dtMs / 16.6667);

    if (this._ctx && this._domSnapshotCanvas) {
      this._ctx.drawImage(this._domSnapshotCanvas, 0, 0, W, H);
    }

    this.buildGooAlphaMask(p, W, H);

    if (this._ctx && this._gooOutCanvas) {
      this._ctx.save();
      this._ctx.globalCompositeOperation = 'destination-out';
      this._ctx.imageSmoothingEnabled = true;
      this._ctx.drawImage(this._gooOutCanvas, 0, 0, W, H);
      this._ctx.restore();
    }

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

    const W = Math.max(320, window.innerWidth);
    const H = Math.max(240, window.innerHeight);
    this._domSnapshotCanvas = this.captureDomStageSnapshot(W, H);

    const overlay = document.getElementById('op-overlay');
    const charStage = document.getElementById('op-chara-stage');
    const bannerStage = document.getElementById('op-banner-stage');
    const titleStage = document.getElementById('op-title-stage');
    const skipHint = overlay ? overlay.querySelector('.op-skip-hint') : null;
    const skipBtn = document.getElementById('op-skip-btn');

    if (charStage) charStage.style.opacity = '0';
    if (bannerStage) bannerStage.style.opacity = '0';
    if (titleStage) titleStage.style.opacity = '0';
    if (skipHint) skipHint.style.opacity = '0';
    if (skipBtn) skipBtn.style.opacity = '0';

    if (overlay) {
      // 重要: 透明くり抜き部分を後ろのメニューへ透かしつつ、連続タップの貫通は完全にブロックする
      overlay.style.background = 'transparent';
      overlay.style.pointerEvents = 'auto';
    }

    const edgeCanvas = document.getElementById('op-liquid-edge-canvas');
    if (edgeCanvas) {
      this._edgeCanvas = edgeCanvas;
      this._edgeCtx = edgeCanvas.getContext('2d');
      this.resizeCanvas();
      edgeCanvas.style.display = 'block';
    }

    if (typeof SceneBgm !== 'undefined') {
      SceneBgm.play('mode_select');
    }

    this.initLiquidDrops();
    this._rafId = requestAnimationFrame((t) => this.updateAndDraw(t));
  },

  stepAndDrawCanvas(elapsed, dtFactor) {
    const W = this._canvas ? this._canvas.width : window.innerWidth;
    const H = this._canvas ? this._canvas.height : window.innerHeight;
    const gb = (typeof isGbMode !== 'undefined' && isGbMode);

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

    this.drawBackgroundAndEffects(ctx, W, H, elapsed, gb);

    for (let i = 0; i < this._cubes.length; i++) {
      const c = this._cubes[i];
      const sway = Math.sin(elapsed * 0.0028 + c.rotPhase) * c.amp;
      this.drawPseudo3DBlock(ctx, c, c.x + sway, c.y, gb);
    }

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
    const now = performance.now();
    // すでにOP再生中、またはOP終了直後（連続タップ/ゴーストクリック）は再始動を防止
    if (this._active || (this._endedAt > 0 && (now - this._endedAt) < 900)) return;
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
    this._canSkipAt = this._startTime + 80;

    const charStage = document.getElementById('op-chara-stage');
    const bannerStage = document.getElementById('op-banner-stage');
    const titleStage = document.getElementById('op-title-stage');
    const skipHint = overlay.querySelector('.op-skip-hint');
    const skipBtn = document.getElementById('op-skip-btn');
    if (charStage) charStage.style.opacity = '';
    if (bannerStage) bannerStage.style.opacity = '';
    if (titleStage) titleStage.style.opacity = '';
    if (skipHint) skipHint.style.opacity = '';
    if (skipBtn) skipBtn.style.opacity = '';

    overlay.classList.remove('op-fadeout', 'is-holding', 'is-liquid-masked');
    overlay.style.background = '';
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
    this.startLiquidTransition();
  },

  finishImmediate() {
    this._active = false;
    this._phase = 'idle';
    this._endedAt = performance.now();
    this.clearSceneTimers();
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    const overlay = document.getElementById('op-overlay');
    if (overlay) {
      overlay.style.display = 'none';
      overlay.style.background = '';
      overlay.classList.remove('op-fadeout', 'is-holding', 'is-liquid-masked');
      overlay.style.pointerEvents = 'auto';
      const skipHint = overlay.querySelector('.op-skip-hint');
      const skipBtn = document.getElementById('op-skip-btn');
      if (skipHint) skipHint.style.opacity = '';
      if (skipBtn) skipBtn.style.opacity = '';
    }
    const charStage = document.getElementById('op-chara-stage');
    const bannerStage = document.getElementById('op-banner-stage');
    const titleStage = document.getElementById('op-title-stage');
    if (charStage) charStage.style.opacity = '';
    if (bannerStage) bannerStage.style.opacity = '';
    if (titleStage) titleStage.style.opacity = '';

    const edgeCanvas = document.getElementById('op-liquid-edge-canvas');
    if (edgeCanvas) {
      edgeCanvas.style.display = 'none';
      if (this._edgeCtx) this._edgeCtx.clearRect(0, 0, edgeCanvas.width, edgeCanvas.height);
    }
    this._domSnapshotCanvas = null;
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
      overlay.style.background = '';
      overlay.classList.remove('op-fadeout', 'is-holding', 'is-liquid-masked');
      overlay.style.pointerEvents = 'auto';
    }
    const edgeCanvas = document.getElementById('op-liquid-edge-canvas');
    if (edgeCanvas) {
      edgeCanvas.style.display = 'none';
    }
    this._domSnapshotCanvas = null;
    this.clearStageDom();
  }
};