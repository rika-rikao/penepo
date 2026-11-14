// ==========================================
// ストーリーモード（全7話：難易度4種 & 最後の敵2人は適切スキル固定）
// ==========================================
const STORY_DIFFICULTIES = {
  easy:   { label: 'やさしい',   levels: [1, 2, 4, 6, 8, 12, 16],     allUseCheat: false },
  normal: { label: 'ふつう',     levels: [3, 7, 12, 17, 23, 28, 36],  allUseCheat: false },
  hard:   { label: 'むずかしい', levels: [15, 22, 30, 38, 46, 55, 65], allUseCheat: false },
  unfair: { label: 'りふじん',   levels: [40, 52, 64, 74, 84, 92, 99], allUseCheat: true  }
};

const STORY_STAGES = [
  {
    id: 1,
    title: '第1話：あわて者の水の精霊',
    enemyId: 'sub01',
    enemyLevel: 3,
    useCheat: false,
    skillType: 'single',
    intro: [
      { side: 'left',  charId: 'main00', text: '大変！パズルワールドの空に不気味な渦が出現してる！' },
      { side: 'right', charId: 'sub01',  text: 'あわわっ、フレアさん！お邪魔ブロックが勝手に降ってきそうです〜！' },
      { side: 'left',  charId: 'main00', text: 'しずく！力を貸してほしい！まずは今の実力を確かめよう！' },
      { side: 'right', charId: 'sub01',  text: 'わ、わかりましたっ！わたしの水しぶきパズル、受けてみてください！' }
    ],
    win: [
      { side: 'right', charId: 'sub01',  text: 'ふぅ〜、負けちゃいました！やっぱりフレアさんは強いですね。' },
      { side: 'left',  charId: 'main00', text: 'しずくの連鎖もすごかったよ！一緒に異変の正体を探りに行こう！' }
    ],
    lose: [
      { side: 'right', charId: 'sub01',  text: 'えっ、わたしが勝っちゃいました！？もう一回練習しましょう！' }
    ]
  },
  {
    id: 2,
    title: '第2話：森の風といたずら妖精',
    enemyId: 'sub02',
    enemyLevel: 7,
    useCheat: false,
    skillType: 'single',
    intro: [
      { side: 'right', charId: 'sub02',  text: 'やっほーフレア！こんな慌ただしい時にどこ行くのさ？' },
      { side: 'left',  charId: 'main00', text: 'シルル！魔王城のほうから嫌な気配がするんだ。仲間になってくれない？' },
      { side: 'right', charId: 'sub02',  text: 'いいよー！ただし、あたしのスピードについてこれたらね♪' }
    ],
    win: [
      { side: 'right', charId: 'sub02',  text: '参りましたっ！その速さなら魔王だって目じゃないね！' },
      { side: 'left',  charId: 'sub01',  text: 'これでシルルさんも仲間ですね！心強いです！' }
    ],
    lose: [
      { side: 'right', charId: 'sub02',  text: 'あはは、風の速さにはまだ追いつけないみたいだね〜！' }
    ]
  },
  {
    id: 3,
    title: '第3話：お調子者の用心棒',
    enemyId: 'sub03',
    enemyLevel: 12,
    useCheat: false,
    skillType: 'single',
    intro: [
      { side: 'right', charId: 'sub03',  text: 'おっと、そこから先は通行料……じゃなくて実力テストだぜ！' },
      { side: 'left',  charId: 'main00', text: 'ブープルまでどうしたの？みんなを助けに行くところなんだよ。' },
      { side: 'right', charId: 'sub03',  text: '知ってるさ！どうせ行くなら最強の用心棒であるオレも連れてけってこと！勝負だ！' }
    ],
    win: [
      { side: 'right', charId: 'sub03',  text: 'ぐはっ！さすがフレアだ、文句なしにオレの親分だぜ！' },
      { side: 'left',  charId: 'main00', text: 'よし、これでしずく・シルル・ブープル、頼もしい仲間が揃った！いざ敵地へ！' }
    ],
    lose: [
      { side: 'right', charId: 'sub03',  text: 'オレを倒せないようじゃ先が思いやられるぜ？ほら、もう一戦だ！' }
    ]
  },
  {
    id: 4,
    title: '第4話：廃墟の迷い幽霊',
    enemyId: 'enemy01',
    enemyLevel: 17,
    useCheat: false,
    skillType: 'single',
    intro: [
      { side: 'left',  charId: 'sub02',  text: 'うわっ、ここから空気がひんやりしてる……何か出たよ！' },
      { side: 'right', charId: 'enemy01',text: 'ヒヒヒ……生きたままここを通すわけにはいかぬなぁ……。' },
      { side: 'left',  charId: 'main00', text: '魔王の手先「ゴースト」！みんな、怯まずに行くよ！' }
    ],
    win: [
      { side: 'right', charId: 'enemy01',text: 'ひぇぇ……まぶしすぎる連鎖だぁ〜！退散するぅ〜！' },
      { side: 'left',  charId: 'main00', text: '突破したよ！どんどん奥へ進もう！' }
    ],
    lose: [
      { side: 'right', charId: 'enemy01',text: 'ヒヒヒ……お前たちも仲間の幽霊にしてやろうか……？' }
    ]
  },
  {
    id: 5,
    title: '第5話：立ちふさがる岩の番人',
    enemyId: 'enemy02',
    enemyLevel: 23,
    useCheat: false,
    skillType: 'single',
    intro: [
      { side: 'right', charId: 'enemy02',text: 'ゴゴゴ……魔王城ノ門ハ、コノ「コーレム」ガ通サヌ……！' },
      { side: 'left',  charId: 'sub03',  text: 'でっか！こいつの硬いガードをぶち抜くには大連鎖が必要だぜ！' },
      { side: 'left',  charId: 'main00', text: '任せて！どんな壁も燃え上がる連鎖で砕いてみせる！' }
    ],
    win: [
      { side: 'right', charId: 'enemy02',text: 'ミゴトナ……パズルダ……道ヲ……アケヨウ……！' },
      { side: 'left',  charId: 'sub01',  text: '城の扉が開きました！いよいよ最上階です！' }
    ],
    lose: [
      { side: 'right', charId: 'enemy02',text: '岩ノ壁ハ……ビクトモセヌ……。出直シテコイ！' }
    ]
  },
  {
    id: 6,
    title: '第6話：狡猾なる小悪魔の罠',
    enemyId: 'enemy03',
    enemyLevel: 28,
    useCheat: true,
    skillType: 'smart_all', // 最後の敵2人は固定で適切に全スキルから選ぶタイプ
    intro: [
      { side: 'right', charId: 'enemy03',text: 'ケケケッ！よくここまで来たね。でもオレ様「デビビ」は正攻法じゃ戦わないよ？' },
      { side: 'left',  charId: 'main00', text: 'どういうこと！？卑怯な手を使うつもり？' },
      { side: 'right', charId: 'enemy03',text: 'パズル界の禁術『チートスキル』をたっぷり味わいなっ！' }
    ],
    win: [
      { side: 'right', charId: 'enemy03',text: 'ゲッ！？禁術まで使ったのに負けるなんて……マーオ様、あとはお願いしますっ！' },
      { side: 'left',  charId: 'sub02',  text: 'スキル攻撃も乗り越えたよ！次が最後、魔王の部屋だ！' }
    ],
    lose: [
      { side: 'right', charId: 'enemy03',text: 'ケケケッ！禁術の前には手も足も出ないだろ？もう一回遊んでやるよ！' }
    ]
  },
  {
    id: 7,
    title: '最終話：魔王マーオとの決戦！',
    enemyId: 'enemy04',
    enemyLevel: 36,
    useCheat: true,
    skillType: 'smart_all', // 最後の敵2人は固定で適切に全スキルから選ぶタイプ
    intro: [
      { side: 'right', charId: 'enemy04',text: 'よくぞ辿り着いた、フレア。我が名は魔王「マーオ」。世界のパズルを混沌に染め上げる者だ！' },
      { side: 'left',  charId: 'main00', text: 'しずく、シルル、ブープル……みんなの想いと一緒に、あんたの野望はここで止める！' },
      { side: 'right', charId: 'enemy04',text: '面白い！ならば我が極大のチートスキルと真の実力で、その覚悟を叩き潰してやろう！' }
    ],
    win: [
      { side: 'right', charId: 'enemy04',text: '見事だ……！これほど美しく力強い連鎖を見せられては、負けを認めざるを得ないな。' },
      { side: 'left',  charId: 'sub01',  text: 'やりました！空の不穏な渦が晴れていきます！' },
      { side: 'left',  charId: 'sub03',  text: 'さすが親分！大勝利だぜーっ！！' },
      { side: 'left',  charId: 'main00', text: 'みんな、ありがとう！これからもパズルワールドの平和を守っていこう！' }
    ],
    lose: [
      { side: 'right', charId: 'enemy04',text: 'ふむ、その程度では魔王には届かぬぞ。力を研ぎ澄まし、再び挑むがよい！' }
    ]
  }
];

const StoryManager = {
  clearedStage: parseInt(localStorage.getItem('pdw_story_cleared') || '0', 10),
  difficulty: localStorage.getItem('pdw_story_diff') || 'normal',
  activeStage: null,
  activeStageConfig: null,
  currentLines: [],
  lineIndex: 0,
  phase: 'idle',

  getDifficultyKey() {
    return STORY_DIFFICULTIES[this.difficulty] ? this.difficulty : 'normal';
  },

  getClearedForDifficulty(diffKey) {
    return parseInt(localStorage.getItem(`pdw_story_cleared_${diffKey}`) || '0', 10);
  },

  onDifficultyChange(val) {
    this.difficulty = STORY_DIFFICULTIES[val] ? val : 'normal';
    localStorage.setItem('pdw_story_diff', this.difficulty);
    this.renderStageList();
  },

  getStageConfig(stage) {
    const diffKey = this.getDifficultyKey();
    const diff = STORY_DIFFICULTIES[diffKey];
    const idx = Math.max(0, stage.id - 1);
    const level = diff.levels[idx] !== undefined ? diff.levels[idx] : stage.enemyLevel;
    const useCheat = diff.allUseCheat ? true : !!stage.useCheat;
    const skillType = stage.skillType || 'single';
    return { level, useCheat, skillType, diffKey };
  },

  getSelectedCharId() {
    return (storySelectedCharId === 'custom' && CustomAssets.chara) ? 'custom' : 'main00';
  },

  isCustomSelected() {
    return this.getSelectedCharId() === 'custom';
  },

  isPlayerSkillEnabled() {
    return !!document.getElementById('story-skill-toggle')?.checked;
  },

  saveProgress(stageId) {
    if (stageId > this.clearedStage) {
      this.clearedStage = stageId;
      localStorage.setItem('pdw_story_cleared', String(stageId));
    }
    const diffKey = this.getDifficultyKey();
    const curDiffCleared = this.getClearedForDifficulty(diffKey);
    if (stageId > curDiffCleared) {
      localStorage.setItem(`pdw_story_cleared_${diffKey}`, String(stageId));
    }
  },

  openMenu() {
    document.getElementById('main-menu-actions').style.display = 'none';
    const menu = document.getElementById('story-menu');
    menu.style.display = 'flex';
    const diffSel = document.getElementById('story-difficulty');
    if (diffSel) diffSel.value = this.getDifficultyKey();
    if (typeof syncPlayerSkillSelects === 'function') syncPlayerSkillSelects();
    if (typeof renderCharPicker === 'function') {
      renderCharPicker('story-char-picker', { storyOnly: true });
    }
    this.renderStageList();
  },

  renderStageList() {
    const list = document.getElementById('story-stage-list');
    if (!list) return;
    list.innerHTML = '';
    const diffKey = this.getDifficultyKey();
    const diffCleared = this.getClearedForDifficulty(diffKey);

    STORY_STAGES.forEach(st => {
      const unlocked = st.id <= this.clearedStage + 1;
      const isClearedThisDiff = st.id <= diffCleared;
      const isClearedAny = st.id <= this.clearedStage;
      const enemy = getCharacterById(st.enemyId);
      const cfg = this.getStageConfig(st);

      const btn = document.createElement('button');
      btn.className = 'story-stage-btn' + (isClearedThisDiff ? ' cleared' : '') + (!unlocked ? ' locked' : '');
      btn.disabled = !unlocked;
      btn.onclick = () => this.startStage(st.id);

      let badge = 'LOCKED';
      if (unlocked) {
        if (isClearedThisDiff) badge = 'CLEAR!';
        else if (isClearedAny) badge = cfg.useCheat ? 'SKILL' : 'OPEN';
        else badge = cfg.useCheat ? 'NEW / SKILL' : 'NEW!';
      }

      const skillNote = cfg.useCheat
        ? (cfg.skillType === 'smart_all' ? ' / Skill(全)' : ' / Skill(1種)')
        : '';

      btn.innerHTML = `
        <div style="flex:1;">
          <div style="font-weight:bold; color:${enemy.color};">${st.title}</div>
          <div style="font-size:0.75rem; color:#aaa;">VS ${enemy.name} (Lv.${cfg.level}${skillNote})</div>
        </div>
        <span class="story-badge">${badge}</span>
      `;
      list.appendChild(btn);
    });
  },

  startStage(stageId) {
    const stage = STORY_STAGES.find(s => s.id === stageId);
    if (!stage) return;
    this.activeStage = stage;
    this.activeStageConfig = this.getStageConfig(stage);
    this.startDialogue('intro', stage.intro);
  },

  startDialogue(phase, lines) {
    this.phase = phase;
    this.currentLines = lines;
    this.lineIndex = 0;

    const overlay = document.getElementById('story-overlay');
    const bgEl = document.getElementById('story-stage-bg');
    if (bgEl) {
      bgEl.style.backgroundImage = CustomAssets.bg ? `url("${CustomAssets.bg.dataUrl}")` : 'none';
    }
    overlay.style.display = 'flex';
    this.renderCurrentLine();
  },

  setSlotPortrait(slotId, charId, isActive) {
    const slot = document.getElementById(slotId);
    if (!slot) return;
    slot.classList.remove('active', 'inactive', 'hidden-slot');
    slot.classList.add(isActive ? 'active' : 'inactive');

    if (!charId) {
      slot.classList.add('hidden-slot');
      slot.innerHTML = '';
      return;
    }

    const useCustom = (charId === 'main00' && this.isCustomSelected());
    const ch = getCharacterById(useCustom ? 'custom' : charId);
    slot.innerHTML = '';
    const img = document.createElement('img');
    img.className = 'story-portrait-img';
    img.src = ch.file;
    img.alt = ch.name;
    img.onload = () => {
      if (img.naturalHeight <= img.naturalWidth * 1.05) {
        img.classList.add('square-or-wide');
      }
    };
    img.onerror = () => {
      slot.innerHTML = `<div class="story-fallback-card" style="background:${ch.color};">${ch.name}</div>`;
    };
    slot.appendChild(img);
  },

  renderCurrentLine() {
    const line = this.currentLines[this.lineIndex];
    if (!line) {
      this.finishDialogue();
      return;
    }

    const useCustom = this.isCustomSelected();
    const isMainCustom = useCustom && line.charId === 'main00';
    const ch = getCharacterById(isMainCustom ? 'custom' : line.charId);
    const speakerEl = document.getElementById('story-speaker-name');
    const textEl = document.getElementById('story-text');

    speakerEl.innerText = ch.name;
    speakerEl.style.background = ch.color;
    textEl.innerText = useCustom ? line.text.replace(/フレア/g, getPlayerDisplayName()) : line.text;

    const leftCharId = line.side === 'left' ? line.charId : 'main00';
    const rightCharId = line.side === 'right' ? line.charId : this.activeStage.enemyId;

    this.setSlotPortrait('story-slot-left', leftCharId, line.side === 'left');
    this.setSlotPortrait('story-slot-right', rightCharId, line.side === 'right');
  },

  advance() {
    if (document.getElementById('story-overlay').style.display !== 'flex') return;
    SE.play('cursorMove');
    this.lineIndex++;
    if (this.lineIndex >= this.currentLines.length) {
      this.finishDialogue();
    } else {
      this.renderCurrentLine();
    }
  },

  skip() {
    if (document.getElementById('story-overlay').style.display !== 'flex') return;
    this.finishDialogue();
  },

  finishDialogue() {
    document.getElementById('story-overlay').style.display = 'none';
    if (this.phase === 'intro') {
      const cfg = this.activeStageConfig || this.getStageConfig(this.activeStage);
      startGame('story', cfg.level, 2, this.isPlayerSkillEnabled());
    } else if (this.phase === 'win') {
      this.saveProgress(this.activeStage.id);
      if (this.activeStage.id >= STORY_STAGES.length) {
        showToast('🎉 全ステージ制覇！おめでとう！');
        exitGame();
        this.openMenu();
      } else {
        const nextStage = STORY_STAGES.find(s => s.id === this.activeStage.id + 1);
        if (nextStage) {
          this.startStage(nextStage.id);
        } else {
          exitGame();
        }
      }
    } else if (this.phase === 'lose') {
      showResultModal('DEFEAT...');
    }
  },

  onBattleEnd(isWin) {
    if (!this.activeStage) return;
    stopBgm();
    if (isWin) {
      SE.play('fanfareMax');
      this.startDialogue('win', this.activeStage.win);
    } else {
      this.startDialogue('lose', this.activeStage.lose);
    }
  }
};

function initStorySystem() {
  window.addEventListener('keydown', (e) => {
    if (document.getElementById('story-overlay').style.display === 'flex') {
      if (e.code === keyConfig.Swap || e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        StoryManager.advance();
      }
    }
  });
}
