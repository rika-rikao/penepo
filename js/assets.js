// ==========================================
// キャラクター定義 & ループ型3Dカバーフロー & スキル定義/自作ラボ & カスタムアセット管理
// ==========================================
const IMG_EXTS = ['png', 'webp', 'gif', 'jpg', 'jpeg'];

const CHARACTERS = [
  { id: 'main00', name: 'フレア',   role: 'main',  file: 'assets/img/chara/nomal/フレア.png',   color: '#ff3366' },
  { id: 'sub01',  name: 'しずく',   role: 'sub',   file: 'assets/img/chara/nomal/しずく.png',   color: '#00d4ff' },
  { id: 'sub02',  name: 'シルル',   role: 'sub',   file: 'assets/img/chara/nomal/シルル.png',   color: '#00e676' },
  { id: 'sub03',  name: 'ブープル', role: 'sub',   file: 'assets/img/chara/nomal/ブープル.png', color: '#a855f7' },
  { id: 'enemy01',name: 'ゴースト', role: 'enemy', file: 'assets/img/chara/nomal/ゴースト.png', color: '#9d00ff' },
  { id: 'enemy02',name: 'コーレム', role: 'enemy', file: 'assets/img/chara/nomal/コーレム.png', color: '#ff9100' },
  { id: 'enemy03',name: 'デビビ',   role: 'enemy', file: 'assets/img/chara/nomal/デビビ.png',   color: '#e94560' },
  { id: 'enemy04',name: 'マーオ',   role: 'enemy', file: 'assets/img/chara/nomal/マーオ.png',   color: '#ff007f' }
];

const CHAR_PICKER_ORDER = [
  'main00', 'sub01', 'sub02', 'sub03',
  'enemy01', 'enemy02', 'enemy03', 'enemy04',
  'custom', 'random'
];

const CHAR_PICKER_ROWS = [
  ['main00', 'custom'],
  ['sub01', 'sub02', 'sub03'],
  ['enemy01', 'enemy02', 'enemy03'],
  ['enemy04', 'random']
];

const SKILL_DESCRIPTIONS = {
  erase_color: '盤面にあるマークの中から、ランダムで2種類の色をまとめて消します！ピンチの打開や連鎖のきっかけにぴったりです。',
  erase_rows: '下から1段目・5段目・9段目の横一列をすべて消します！お邪魔ブロックもまとめて消せるのでピンチに強いです。',
  purify_garbage: '盤面のお邪魔ブロックをすべて消して、下の段を2段せり上げたあと通常のブロックに変えます！大逆転が狙えます。',
  reflection: '現在盤面に落下済みのお邪魔ブロックをすべて跳ね返し、その0.75倍の量を相手にお邪魔ブロックとして送ります！(予告ブロックは対象外・ターゲット時は2/4を標的に集中)',
  corrupt_enemy_row: '相手のブロックがある段をランダムで1段お邪魔に変え、さらに上から幅3のお邪魔ブロックを1段降らせます！',
  seal_skill: '相手（ターゲット優先）のスキル発動までに必要な残りスコアを300点追加して、スキルを遠ざけます！',
  convert_blocks: '盤面にあるマークの中からランダムで3色のブロックを、別の2色のブロックに一斉変換します！大連鎖の大チャンス！',
  sacrifice: '発動不可・被弾お邪魔1.2倍・送信お邪魔2段階低下(6個/4連鎖〜)・3分で自動敗北する代わりに、消滅後約1.1秒以内の連続消しをすべてアクティブ連鎖扱い＆天井猶予2倍に！',
  no_skill: 'スキルを使用しません。自分だけスキルなし・純粋なパズル勝負で挑みます。',
  random: '試合開始時に使用可能なスキルの中からランダムで1つが選ばれ、その試合中はそのスキルで固定されます！'
};

const SKILL_ICONS = {
  erase_color: '🎨',
  erase_rows: '⚡',
  purify_garbage: '✨',
  reflection: '🪞',
  corrupt_enemy_row: '👾',
  seal_skill: '🔒',
  convert_blocks: '🔄',
  sacrifice: '💀',
  no_skill: '🚫',
  random: '🎲'
};

const SKILL_COLORS = {
  erase_color: '#00d4ff',
  erase_rows: '#ffd700',
  purify_garbage: '#4ecca3',
  reflection: '#22d3ee',
  corrupt_enemy_row: '#ff007f',
  seal_skill: '#a855f7',
  convert_blocks: '#38bdf8',
  sacrifice: '#dc2626',
  no_skill: '#94a3b8',
  random: '#fbbf24'
};

// ==========================================
// 自作スキルシステム（初期100pt / メリット消費 / デメリット還元 / 3スロット）
// ==========================================
const CUSTOM_SKILL_BASE_POINTS = 100;
const CUSTOM_SKILL_STORAGE_KEY = 'pdw_custom_skills_v1';

const CUSTOM_SKILL_MERITS = [
  {
    id: 'erase_colors',
    name: 'マーク全消し',
    isActive: true,
    costs: [0, 45, 85, 130],
    levelTexts: ['OFF', 'Lv1: 1色全消し', 'Lv2: 2色全消し', 'Lv3: 3色全消し']
  },
  {
    id: 'erase_rows',
    name: '横一列消し',
    isActive: true,
    costs: [0, 45, 85, 135],
    levelTexts: ['OFF', 'Lv1: 下1・5段消し', 'Lv2: 1・5・9段消し', 'Lv3: 1・3・5・7・9段']
  },
  {
    id: 'purify_garbage',
    name: 'お邪魔浄化',
    isActive: true,
    costs: [0, 55, 95, 140],
    levelTexts: ['OFF', 'Lv1: 4段上昇+下1/3浄化', 'Lv2: 3段上昇+下2/3浄化', 'Lv3: 2段上昇+全お邪魔浄化']
  },
  {
    id: 'reflect_garbage',
    name: 'お邪魔反射',
    isActive: true,
    costs: [0, 55, 95, 140],
    levelTexts: ['OFF', 'Lv1: 盤面お邪魔0.5倍反射', 'Lv2: 盤面お邪魔0.75倍反射', 'Lv3: 盤面お邪魔1.0倍反射']
  },
  {
    id: 'corrupt_enemy',
    name: '相手お邪魔侵食',
    isActive: true,
    costs: [0, 50, 90, 140],
    levelTexts: ['OFF', 'Lv1: 相手1段侵食', 'Lv2: 1段侵食+幅3落下', 'Lv3: 2段侵食+幅5落下']
  },
  {
    id: 'seal_enemy',
    name: '相手スキル封印',
    isActive: true,
    costs: [0, 40, 75, 115],
    levelTexts: ['OFF', 'Lv1: 相手必要点+200', 'Lv2: 相手必要点+350', 'Lv3: 相手必要点+550']
  },
  {
    id: 'convert_colors',
    name: '盤面色変換',
    isActive: true,
    costs: [0, 45, 85, 135],
    levelTexts: ['OFF', 'Lv1: 2色→2色変換', 'Lv2: 3色→2色変換', 'Lv3: 4色→1色変換']
  },
  {
    id: 'merit_extra_uses',
    name: '最大使用回数増加',
    isActive: false,
    requiresActive: true,
    costs: [0, 45, 85, 130],
    levelTexts: ['OFF', 'Lv1: 最大回数+1回', 'Lv2: 最大回数+2回', 'Lv3: 最大回数+3回']
  },
  {
    id: 'passive_grace',
    name: '常時：猶予&天井延長',
    isActive: false,
    costs: [0, 65, 120, 185],
    levelTexts: ['OFF', 'Lv1: 連消猶予0.75s/天井1.5x', 'Lv2: 連消猶予1.1s/天井2.0x', 'Lv3: 連消猶予1.6s/天井2.5x']
  }
];

const CUSTOM_SKILL_DEMERITS = [
  {
    id: 'dem_vuln_garbage',
    name: '被弾お邪魔増加',
    gains: [0, 15, 30, 45],
    levelTexts: ['OFF', 'Lv1: 被弾1.15倍', 'Lv2: 被弾1.30倍', 'Lv3: 被弾1.50倍']
  },
  {
    id: 'dem_weak_attack',
    name: '送信お邪魔低下',
    gains: [0, 15, 30, 45],
    levelTexts: ['OFF', 'Lv1: 送信量-2個', 'Lv2: 送信量0.75倍', 'Lv3: 4連鎖/6個〜に低下']
  },
  {
    id: 'dem_fast_rise',
    name: 'せり上がり高速化',
    gains: [0, 15, 30, 45],
    levelTexts: ['OFF', 'Lv1: 速度1.20倍', 'Lv2: 速度1.45倍', 'Lv3: 速度1.80倍']
  },
  {
    id: 'dem_high_cost',
    name: '発動必要スコア増加',
    gains: [0, 15, 30, 45],
    levelTexts: ['OFF', 'Lv1: 400点毎', 'Lv2: 550点毎', 'Lv3: 750点毎']
  },
  {
    id: 'dem_fewer_uses',
    name: '最大使用回数減少',
    gains: [0, 20, 40],
    levelTexts: ['OFF', 'Lv1: 最大回数-1回', 'Lv2: 最大回数-2回']
  },
  {
    id: 'dem_time_limit',
    name: '時間制限で自動敗北',
    gains: [0, 25, 45, 75],
    levelTexts: ['OFF', 'Lv1: 3分で自動敗北', 'Lv2: 2分で自動敗北', 'Lv3: 1分で自動敗北']
  },
  {
    id: 'dem_start_garbage',
    name: '開幕お邪魔落下',
    gains: [0, 15, 30, 45],
    levelTexts: ['OFF', 'Lv1: 幅6×1段落下', 'Lv2: 幅6×2段落下', 'Lv3: 幅6×3段落下']
  }
];

let customSkillSlots = [null, null, null];
try {
  const savedCs = localStorage.getItem(CUSTOM_SKILL_STORAGE_KEY);
  if (savedCs) {
    const parsed = JSON.parse(savedCs);
    if (Array.isArray(parsed)) {
      customSkillSlots = [parsed[0] || null, parsed[1] || null, parsed[2] || null];
    }
  }
} catch (_) {}

function persistCustomSkills() {
  try {
    localStorage.setItem(CUSTOM_SKILL_STORAGE_KEY, JSON.stringify(customSkillSlots));
  } catch (_) {}
}

function getCustomSkillSlotIndex(skillId) {
  if (typeof skillId !== 'string' || !skillId.startsWith('custom_')) return -1;
  const idx = parseInt(skillId.slice(7), 10);
  return (idx >= 0 && idx < 3) ? idx : -1;
}

function getCustomSkillConfig(skillId) {
  const idx = getCustomSkillSlotIndex(skillId);
  if (idx === -1) return null;
  return customSkillSlots[idx] || null;
}

function computeCustomSkillBuildInfo(draft) {
  const merits = (draft && draft.merits) || {};
  const demerits = (draft && draft.demerits) || {};
  let meritCost = 0;
  let demeritGain = 0;
  let hasMerit = false;
  let hasActiveMerit = false;
  let hasEffectiveNonUseMerit = false;
  const meritSummaries = [];
  const demeritSummaries = [];

  CUSTOM_SKILL_MERITS.forEach(m => {
    const lv = Math.max(0, Math.min(m.costs.length - 1, parseInt(merits[m.id] || 0, 10)));
    if (lv > 0) {
      hasMerit = true;
      if (m.isActive) hasActiveMerit = true;
      if (!m.requiresActive) hasEffectiveNonUseMerit = true;
      meritCost += m.costs[lv];
      meritSummaries.push(m.levelTexts[lv].replace(/^Lv\d:\s*/, ''));
    }
  });

  CUSTOM_SKILL_DEMERITS.forEach(d => {
    const lv = Math.max(0, Math.min(d.gains.length - 1, parseInt(demerits[d.id] || 0, 10)));
    if (lv > 0) {
      demeritGain += d.gains[lv];
      demeritSummaries.push(d.levelTexts[lv].replace(/^Lv\d:\s*/, ''));
    }
  });

  const totalPoints = CUSTOM_SKILL_BASE_POINTS - meritCost + demeritGain;
  const extraUsesLv = parseInt(merits.merit_extra_uses || 0, 10);
  const invalidExtraOnly = (extraUsesLv > 0 && !hasActiveMerit);
  const isValid = hasEffectiveNonUseMerit && totalPoints >= 0 && !invalidExtraOnly;

  const costLv = parseInt(demerits.dem_high_cost || 0, 10);
  const scoreStepMap = [300, 400, 550, 750];
  const scoreStep = scoreStepMap[costLv] || 300;

  const fewerUsesLv = parseInt(demerits.dem_fewer_uses || 0, 10);
  const maxUses = hasActiveMerit ? Math.max(1, 3 + extraUsesLv - fewerUsesLv) : 0;

  let desc = meritSummaries.length > 0 ? `【効果】${meritSummaries.join('・')}` : '【効果】未選択';
  if (demeritSummaries.length > 0) desc += ` / 【代償】${demeritSummaries.join('・')}`;
  if (hasActiveMerit) desc += ` (${maxUses}回 / ${scoreStep}点毎)`;
  else if (hasEffectiveNonUseMerit) desc += ' (常時発動パッシブ)';

  return {
    totalPoints,
    meritCost,
    demeritGain,
    hasMerit,
    hasEffectiveNonUseMerit,
    hasActiveMerit,
    invalidExtraOnly,
    isValid,
    scoreStep,
    maxUses,
    desc
  };
}

function getBaseSkillIdsList() {
  return [
    'erase_color',
    'erase_rows',
    'purify_garbage',
    'reflection',
    'corrupt_enemy_row',
    'seal_skill',
    'convert_blocks',
    'sacrifice',
    'no_skill',
    'random'
  ];
}

function getSelectableSkillIds(allowCustom = true) {
  const list = getBaseSkillIdsList();
  if (allowCustom) {
    for (let i = 0; i < 3; i++) {
      if (customSkillSlots[i]) list.push(`custom_${i}`);
    }
  }
  return list;
}

function getSkillLabel(skillId) {
  const custom = getCustomSkillConfig(skillId);
  if (custom) return custom.name || `自作${getCustomSkillSlotIndex(skillId) + 1}`;
  if (typeof SKILL_LABELS !== 'undefined' && SKILL_LABELS[skillId]) return SKILL_LABELS[skillId];
  const fallback = {
    erase_color: 'マーク全消し',
    erase_rows: '1・5・9段消し',
    purify_garbage: 'お邪魔浄化',
    reflection: 'リフレクション',
    corrupt_enemy_row: 'お邪魔侵食',
    seal_skill: 'スキル封印',
    convert_blocks: 'ブロック変換',
    sacrifice: '代償',
    no_skill: 'ノースキル',
    random: 'ランダム'
  };
  return fallback[skillId] || skillId;
}

function getSkillIcon(skillId) {
  if (getCustomSkillSlotIndex(skillId) !== -1) return '🛠️';
  return SKILL_ICONS[skillId] || '⚡';
}

function getSkillDesc(skillId) {
  const custom = getCustomSkillConfig(skillId);
  if (custom) {
    return computeCustomSkillBuildInfo(custom).desc;
  }
  return SKILL_DESCRIPTIONS[skillId] || '';
}

function getSkillColor(skillId) {
  if (getCustomSkillSlotIndex(skillId) !== -1) return '#38bdf8';
  return SKILL_COLORS[skillId] || '#ff007f';
}

function getSkillSubLabel(skillId) {
  if (skillId === 'no_skill') return '使用不可（スキルなし）';
  if (skillId === 'sacrifice') return '常時発動（代償効果）';
  if (skillId === 'random') return '開始時に1種をランダム固定';
  const custom = getCustomSkillConfig(skillId);
  if (custom) {
    const info = computeCustomSkillBuildInfo(custom);
    return info.hasActiveMerit ? `最大${info.maxUses}回 / ${info.scoreStep}点毎` : '常時発動（自作パッシブ）';
  }
  return '最大3回 / 300点毎';
}

function resolvePlayableSkillId(skillId, allowCustom = true, fallbackId = 'erase_color') {
  if (skillId === 'random') {
    const pool = [
      'erase_color',
      'erase_rows',
      'purify_garbage',
      'reflection',
      'corrupt_enemy_row',
      'seal_skill',
      'convert_blocks',
      'sacrifice'
    ];
    if (allowCustom) {
      for (let i = 0; i < 3; i++) {
        if (customSkillSlots[i]) pool.push(`custom_${i}`);
      }
    }
    return pool[Math.floor(Math.random() * pool.length)];
  }
  if (getCustomSkillSlotIndex(skillId) !== -1) {
    if (!allowCustom || !getCustomSkillConfig(skillId)) {
      const safeFb = (fallbackId && getCustomSkillSlotIndex(fallbackId) === -1) ? fallbackId : 'erase_color';
      return safeFb === 'random' ? resolvePlayableSkillId('random', false) : safeFb;
    }
  }
  return skillId || 'erase_color';
}

// ==========================================
// 自作スキルモーダル UIロジック
// ==========================================
let editingCustomSkillSlotIdx = 0;
let editingCustomSkillDraft = { name: '', merits: {}, demerits: {} };
let pendingCustomSkillFocus = null;

function makeBlankCustomSkillDraft(slotIdx) {
  return {
    name: `自作${slotIdx + 1}`,
    merits: {},
    demerits: {}
  };
}

function openCustomSkillModal(slotIdx = null) {
  const modal = document.getElementById('custom-skill-modal');
  if (!modal) return;
  if (typeof SE !== 'undefined') SE.play('select');
  pendingCustomSkillFocus = null;
  const initialIdx = (slotIdx !== null && slotIdx >= 0 && slotIdx < 3) ? slotIdx : editingCustomSkillSlotIdx;
  selectCustomSkillSlot(initialIdx, true);
  modal.style.display = 'flex';
  const nameEl = document.getElementById('custom-skill-name-input');
  if (nameEl) nameEl.focus();
  if (typeof syncPadSnapshotsAll === 'function') syncPadSnapshotsAll(180);
}

function closeCustomSkillModal(silent = false) {
  pendingCustomSkillFocus = null;
  const modal = document.getElementById('custom-skill-modal');
  if (modal) modal.style.display = 'none';
  if (!silent && typeof SE !== 'undefined') SE.play('cancel');
  if (typeof syncPadSnapshotsAll === 'function') syncPadSnapshotsAll(180);
}

function selectCustomSkillSlot(idx, silent = false) {
  editingCustomSkillSlotIdx = Math.max(0, Math.min(2, idx));
  pendingCustomSkillFocus = null;
  if (!silent && typeof SE !== 'undefined') SE.play('cursorMove');
  document.querySelectorAll('#custom-skill-slot-tabs button').forEach((btn, i) => {
    btn.classList.toggle('active', i === editingCustomSkillSlotIdx);
    const hasSaved = !!customSkillSlots[i];
    btn.innerText = hasSaved ? `スロット${i + 1} ★` : `スロット${i + 1}`;
  });
  const saved = customSkillSlots[editingCustomSkillSlotIdx];
  editingCustomSkillDraft = saved
    ? JSON.parse(JSON.stringify(saved))
    : makeBlankCustomSkillDraft(editingCustomSkillSlotIdx);

  const nameInput = document.getElementById('custom-skill-name-input');
  if (nameInput) nameInput.value = editingCustomSkillDraft.name || `自作${editingCustomSkillSlotIdx + 1}`;
  renderCustomSkillBuilder();
}

function setCustomSkillEffectLevel(kind, effectId, lv) {
  const target = kind === 'merit' ? editingCustomSkillDraft.merits : editingCustomSkillDraft.demerits;
  if (lv <= 0) delete target[effectId];
  else target[effectId] = lv;
  pendingCustomSkillFocus = { kind, id: effectId, lv: String(lv) };
  if (typeof SE !== 'undefined') SE.play('cursorMove');
  renderCustomSkillBuilder();
}

function resetCurrentCustomSkillSlot() {
  editingCustomSkillDraft = makeBlankCustomSkillDraft(editingCustomSkillSlotIdx);
  const nameInput = document.getElementById('custom-skill-name-input');
  if (nameInput) nameInput.value = editingCustomSkillDraft.name;
  pendingCustomSkillFocus = null;
  if (typeof SE !== 'undefined') SE.play('cancel');
  renderCustomSkillBuilder();
}

function deleteCurrentCustomSkillSlot() {
  const delId = `custom_${editingCustomSkillSlotIdx}`;
  customSkillSlots[editingCustomSkillSlotIdx] = null;
  persistCustomSkills();
  if (typeof selectedPlayerSkill !== 'undefined' && selectedPlayerSkill === delId) {
    const fb = (typeof selectedFallbackSkill !== 'undefined' && getCustomSkillSlotIndex(selectedFallbackSkill) === -1)
      ? selectedFallbackSkill
      : 'erase_color';
    if (typeof onPlayerSkillSelectChange === 'function') onPlayerSkillSelectChange(fb);
  }
  editingCustomSkillDraft = makeBlankCustomSkillDraft(editingCustomSkillSlotIdx);
  const nameInput = document.getElementById('custom-skill-name-input');
  if (nameInput) nameInput.value = editingCustomSkillDraft.name;
  pendingCustomSkillFocus = null;
  if (typeof SE !== 'undefined') SE.play('cancel');
  selectCustomSkillSlot(editingCustomSkillSlotIdx, true);
  syncSkillPickersAfterCustomChange();
  showToast(`スロット${editingCustomSkillSlotIdx + 1}を削除しました`);
}

function saveCurrentCustomSkillSlot() {
  const nameInput = document.getElementById('custom-skill-name-input');
  const rawName = (nameInput ? nameInput.value : editingCustomSkillDraft.name || '').trim();
  editingCustomSkillDraft.name = (rawName || `自作${editingCustomSkillSlotIdx + 1}`).slice(0, 10);

  const info = computeCustomSkillBuildInfo(editingCustomSkillDraft);
  if (info.invalidExtraOnly) {
    if (typeof SE !== 'undefined') SE.play('cancel');
    showToast('最大使用回数増加は発動できるメリット効果と組み合わせてください');
    return;
  }
  if (!info.hasEffectiveNonUseMerit) {
    if (typeof SE !== 'undefined') SE.play('cancel');
    showToast('メリット効果を1つ以上選んでください');
    return;
  }
  if (info.totalPoints < 0) {
    if (typeof SE !== 'undefined') SE.play('cancel');
    showToast('合計ポイントが0以上になるよう調整してください');
    return;
  }

  customSkillSlots[editingCustomSkillSlotIdx] = JSON.parse(JSON.stringify(editingCustomSkillDraft));
  persistCustomSkills();

  const savedId = `custom_${editingCustomSkillSlotIdx}`;
  if (typeof onPlayerSkillSelectChange === 'function') {
    onPlayerSkillSelectChange(savedId);
  }
  if (typeof SE !== 'undefined') SE.play('select');
  closeCustomSkillModal(true);
  syncSkillPickersAfterCustomChange(savedId);
  showToast(`自作スキル「${editingCustomSkillDraft.name}」を保存しました！`);
}

function syncSkillPickersAfterCustomChange(focusSkillId = null) {
  const modal = document.getElementById('skill-select-modal');
  if (modal && modal.style.display === 'flex') {
    if (typeof renderSkillModalPicker === 'function') {
      renderSkillModalPicker(focusSkillId);
    } else {
      renderSkillCarousel('skill-modal-picker', {
        currentSkillId: focusSkillId || (typeof selectedPlayerSkill !== 'undefined' ? selectedPlayerSkill : 'erase_color'),
        allowCustom: true,
        directHorizontal: true,
        onSelect: (skId) => { if (typeof onPlayerSkillSelectChange === 'function') onPlayerSkillSelectChange(skId); },
        onCenterClick: () => { if (typeof confirmSkillSelectModal === 'function') confirmSkillSelectModal(); }
      });
    }
  }
  if (document.getElementById('local-menu')?.style.display === 'flex' && typeof renderLocalMenuUI === 'function') {
    renderLocalMenuUI();
  }
  if (document.getElementById('share-prep-overlay')?.style.display === 'flex' && typeof renderSharePrepUI === 'function') {
    renderSharePrepUI();
  }
}

function renderCustomSkillBuilder() {
  let restoreMeta = pendingCustomSkillFocus ? { ...pendingCustomSkillFocus } : null;
  pendingCustomSkillFocus = null;
  const activeEl = document.activeElement;
  if (!restoreMeta && activeEl && activeEl.dataset && activeEl.dataset.csKind && activeEl.dataset.csId) {
    restoreMeta = {
      kind: activeEl.dataset.csKind,
      id: activeEl.dataset.csId,
      lv: activeEl.dataset.csLv || '0'
    };
  }

  const info = computeCustomSkillBuildInfo(editingCustomSkillDraft);
  const ptValEl = document.getElementById('custom-skill-points-val');
  const ptBadgeEl = document.getElementById('custom-skill-points-badge');
  const summaryEl = document.getElementById('custom-skill-summary');
  const saveBtn = document.getElementById('custom-skill-save-btn');

  if (ptValEl) ptValEl.innerText = String(info.totalPoints);
  if (ptBadgeEl) {
    ptBadgeEl.classList.toggle('invalid', info.totalPoints < 0);
  }
  if (summaryEl) {
    if (info.invalidExtraOnly) {
      summaryEl.innerText = '⚠️ 「最大使用回数増加」を使うには、他のアクティブ系メリット効果も選択してください';
    } else {
      summaryEl.innerText = info.hasMerit
        ? info.desc
        : '初期100ptからメリット効果を選び、足りなければデメリットでPtを増やしてください';
    }
  }
  if (saveBtn) {
    saveBtn.disabled = !info.isValid;
  }

  const renderEffects = (containerId, defs, kind) => {
    const box = document.getElementById(containerId);
    if (!box) return;
    box.innerHTML = '';
    const map = kind === 'merit' ? editingCustomSkillDraft.merits : editingCustomSkillDraft.demerits;

    defs.forEach(def => {
      const curLv = parseInt(map[def.id] || 0, 10);
      const maxLv = (kind === 'merit' ? def.costs.length : def.gains.length) - 1;

      const row = document.createElement('div');
      row.className = 'cs-effect-row' + (curLv > 0 ? ` active ${kind}` : '');

      const head = document.createElement('div');
      head.className = 'cs-effect-head';
      const title = document.createElement('span');
      title.className = 'cs-effect-name';
      title.innerText = def.name;
      const curText = document.createElement('span');
      curText.className = 'cs-effect-cur';
      curText.innerText = def.levelTexts[curLv] || 'OFF';
      head.append(title, curText);

      const btns = document.createElement('div');
      btns.className = 'cs-lv-btns';
      for (let lv = 0; lv <= maxLv; lv++) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'cs-lv-btn' + (curLv === lv ? ' active' : '');
        b.dataset.csKind = kind;
        b.dataset.csId = def.id;
        b.dataset.csLv = String(lv);
        if (lv === 0) {
          b.innerText = 'OFF';
        } else if (kind === 'merit') {
          b.innerText = `Lv${lv} (-${def.costs[lv]})`;
        } else {
          b.innerText = `Lv${lv} (+${def.gains[lv]})`;
        }
        b.onclick = () => setCustomSkillEffectLevel(kind, def.id, lv);
        btns.appendChild(b);
      }

      row.append(head, btns);
      box.appendChild(row);
    });
  };

  renderEffects('custom-skill-merits-list', CUSTOM_SKILL_MERITS, 'merit');
  renderEffects('custom-skill-demerits-list', CUSTOM_SKILL_DEMERITS, 'demerit');

  if (restoreMeta) {
    const selector = `.cs-lv-btn[data-cs-kind="${restoreMeta.kind}"][data-cs-id="${restoreMeta.id}"][data-cs-lv="${restoreMeta.lv}"]`;
    const targetBtn = document.querySelector(`#custom-skill-modal ${selector}`);
    if (targetBtn && !targetBtn.disabled) {
      targetBtn.focus({ preventScroll: true });
      if (typeof targetBtn.scrollIntoView === 'function') {
        targetBtn.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    }
  }
}
const AssetCache = new Map();
const RESOLVED_IMG_STORAGE_KEY = 'pdw_resolved_img_cache_v1';
const ResolvedCharImgCache = {};
const ResolvingCharImgMap = {};
const CustomAssets = { chara: null, bg: null, frame: null };
let selectedCharId = localStorage.getItem('pdw_char_id') || 'main00';
let storySelectedCharId = localStorage.getItem('pdw_story_char_id') || (selectedCharId === 'custom' ? 'custom' : 'main00');
let playerCustomName = localStorage.getItem('pdw_player_name') || '';
let hubPortraitMode = localStorage.getItem('pdw_hub_char') || 'random';
let currentHubRandomCharId = null;

(function restoreResolvedImgCache() {
  if (location.protocol === 'file:') return;
  try {
    const raw = localStorage.getItem(RESOLVED_IMG_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      Object.keys(parsed).forEach((k) => {
        const v = parsed[k];
        if (v === null || typeof v === 'string') {
          ResolvedCharImgCache[k] = v;
          if (v && k.startsWith('normal::')) {
            const cName = k.slice(8);
            const ch = CHARACTERS.find(c => c.name === cName);
            if (ch) ch.file = v;
          }
        }
      });
    }
  } catch (_) {}
})();

function saveResolvedCharImgCacheEntry(cacheKey, value) {
  if (location.protocol === 'file:') return;
  try {
    const raw = localStorage.getItem(RESOLVED_IMG_STORAGE_KEY);
    const map = raw ? JSON.parse(raw) : {};
    if (map && typeof map === 'object') {
      map[cacheKey] = value;
      localStorage.setItem(RESOLVED_IMG_STORAGE_KEY, JSON.stringify(map));
    }
  } catch (_) {}
}

async function findCachedCandidateUrl(candidates) {
  if (location.protocol === 'file:' || typeof caches === 'undefined') return null;
  try {
    for (const url of candidates) {
      const hit = await caches.match(url, { ignoreSearch: true });
      if (hit && hit.ok) return url;
    }
  } catch (_) {}
  return null;
}

function toAbsoluteAssetUrl(url) {
  if (!url) return url;
  if (url.startsWith('data:') || url.startsWith('blob:') || /^https?:\/\//i.test(url) || /^file:\/\//i.test(url)) {
    return url;
  }
  try {
    return new URL(url, document.baseURI).href;
  } catch (_) {
    return url;
  }
}

function pickHubPortraitCharId(reroll = false) {
  if (hubPortraitMode && hubPortraitMode !== 'random') {
    if (hubPortraitMode === 'custom') {
      return CustomAssets.chara ? 'custom' : 'main00';
    }
    if (CHARACTERS.some(c => c.id === hubPortraitMode)) {
      return hubPortraitMode;
    }
  }
  const pool = CHARACTERS.map(c => c.id);
  if (CustomAssets.chara) pool.push('custom');
  if (reroll || !currentHubRandomCharId || !pool.includes(currentHubRandomCharId)) {
    currentHubRandomCharId = pool[Math.floor(Math.random() * pool.length)];
  }
  return currentHubRandomCharId;
}

function onHubCharSettingChange(val) {
  hubPortraitMode = val || 'random';
  if (hubPortraitMode === 'random') {
    pickHubPortraitCharId(true);
  }
  if (typeof refreshMenuHeaderAndPreview === 'function') {
    refreshMenuHeaderAndPreview();
  }
}

function refreshHubCharSelectOptions() {
  const sel = document.getElementById('settings-hub-char');
  if (!sel) return;
  const curVal = hubPortraitMode || 'random';
  sel.innerHTML = '';

  const optRand = document.createElement('option');
  optRand.value = 'random';
  optRand.innerText = 'ランダム（マイキャラ含む）';
  sel.appendChild(optRand);

  CHARACTERS.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.innerText = `固定: ${c.name}`;
    sel.appendChild(opt);
  });

  const optCustom = document.createElement('option');
  optCustom.value = 'custom';
  optCustom.innerText = CustomAssets.chara
    ? `固定: ${getPlayerDisplayName()}`
    : `固定: ${getPlayerDisplayName()} (未登録時フレア)`;
  sel.appendChild(optCustom);

  const hasCur = Array.from(sel.options).some(o => o.value === curVal);
  sel.value = hasCur ? curVal : 'random';
  if (!hasCur) hubPortraitMode = 'random';
}

function getPlayerDisplayName() {
  const trimmed = (playerCustomName || '').trim();
  return trimmed || 'マイキャラ';
}

function onPlayerNameInput(val) {
  playerCustomName = (val || '').slice(0, 10);
  localStorage.setItem('pdw_player_name', playerCustomName);
  const settingsInput = document.getElementById('settings-player-name');
  if (settingsInput && settingsInput.value !== playerCustomName) {
    settingsInput.value = playerCustomName;
  }
  document.querySelectorAll('.char-name-inline-input').forEach(el => {
    if (el.value !== playerCustomName) el.value = playerCustomName;
  });
  document.querySelectorAll('.cf-card[data-item-id="custom"] .cf-card-label').forEach(el => {
    el.innerText = CustomAssets.chara ? getPlayerDisplayName() : 'マイ(未設定)';
  });
  refreshHubCharSelectOptions();
  if (typeof refreshMenuHeaderAndPreview === 'function') {
    refreshMenuHeaderAndPreview();
  }
}

function getCharacterById(id) {
  if (id === 'custom') {
    const fallbackNormal = ResolvedCharImgCache['normal::フレア'] || CHARACTERS[0].file;
    return {
      id: 'custom',
      name: getPlayerDisplayName(),
      role: 'custom',
      file: CustomAssets.chara ? CustomAssets.chara.dataUrl : fallbackNormal,
      color: '#4ecca3'
    };
  }
  if (id === 'random') {
    return {
      id: 'random',
      name: 'ランダム',
      role: 'random',
      file: '',
      color: '#ffd700'
    };
  }
  return CHARACTERS.find(c => c.id === id) || CHARACTERS[0];
}

function resolvePlayableCharId(charId) {
  if (charId === 'random') {
    const pool = CHARACTERS.map(c => c.id);
    if (CustomAssets.chara) pool.push('custom');
    return pool[Math.floor(Math.random() * pool.length)];
  }
  if (charId === 'custom' && !CustomAssets.chara) {
    return 'main00';
  }
  return charId || 'main00';
}

function buildCharImageCandidates(variant, charName) {
  if (!charName) return [];
  const isFileProto = (location.protocol === 'file:');
  const safeName = isFileProto ? charName : encodeURIComponent(charName);
  if (variant === 'lose') {
    const safeLoseName = isFileProto ? `${charName}_lose` : encodeURIComponent(`${charName}_lose`);
    return [
      ...IMG_EXTS.map(ext => `assets/img/chara/lose/${safeLoseName}.${ext}`),
      ...IMG_EXTS.map(ext => `assets/chara/lose/${safeLoseName}.${ext}`)
    ];
  }
  if (variant === 'frame') {
    const safeFrameName = isFileProto ? `${charName}_フレーム` : encodeURIComponent(`${charName}_フレーム`);
    return IMG_EXTS.map(ext => `assets/img/chara_frame/${safeFrameName}.${ext}`);
  }
  if (variant === 'pazzle_back') {
    const safeBgName = isFileProto ? `${charName}_背景` : encodeURIComponent(`${charName}_背景`);
    return IMG_EXTS.map(ext => `assets/img/chara_pazzle_back/${safeBgName}.${ext}`);
  }
  if (variant === 'story_back') {
    const safeStoryBgName = isFileProto ? `${charName}_s背景` : encodeURIComponent(`${charName}_s背景`);
    return IMG_EXTS.map(ext => `assets/img/chara_story_back/${safeStoryBgName}.${ext}`);
  }
  return [
    ...IMG_EXTS.map(ext => `assets/img/chara/nomal/${safeName}.${ext}`),
    ...IMG_EXTS.map(ext => `assets/img/chara/normal/${safeName}.${ext}`)
  ];
}

function buildSystemMainImageCandidates() {
  return IMG_EXTS.map(ext => `assets/img/system/main.${ext}`);
}

function probeCharImageUrl(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      AssetCache.set(url, { img, loaded: true, error: false });
      resolve(true);
    };
    img.onerror = () => {
      resolve(false);
    };
    img.src = url;
  });
}

function resolveCharacterImage(variant, charName) {
  if (!charName) return Promise.resolve(null);
  const cacheKey = `${variant}::${charName}`;
  if (Object.prototype.hasOwnProperty.call(ResolvedCharImgCache, cacheKey)) {
    const cachedUrl = ResolvedCharImgCache[cacheKey];
    if (cachedUrl && !AssetCache.has(cachedUrl)) {
      return probeCharImageUrl(cachedUrl).then((ok) => {
        if (ok) return cachedUrl;
        delete ResolvedCharImgCache[cacheKey];
        return resolveCharacterImage(variant, charName);
      });
    }
    return Promise.resolve(cachedUrl);
  }
  if (ResolvingCharImgMap[cacheKey]) {
    return ResolvingCharImgMap[cacheKey];
  }

  const candidates = buildCharImageCandidates(variant, charName);
  const task = (async () => {
    const swCachedUrl = await findCachedCandidateUrl(candidates);
    if (swCachedUrl) {
      const ok = await probeCharImageUrl(swCachedUrl);
      if (ok) {
        ResolvedCharImgCache[cacheKey] = swCachedUrl;
        saveResolvedCharImgCacheEntry(cacheKey, swCachedUrl);
        if (variant === 'normal') {
          const ch = CHARACTERS.find(c => c.name === charName);
          if (ch) ch.file = swCachedUrl;
        }
        return swCachedUrl;
      }
    }

    for (const url of candidates) {
      const ok = await probeCharImageUrl(url);
      if (ok) {
        ResolvedCharImgCache[cacheKey] = url;
        saveResolvedCharImgCacheEntry(cacheKey, url);
        if (variant === 'normal') {
          const ch = CHARACTERS.find(c => c.name === charName);
          if (ch) ch.file = url;
        }
        return url;
      }
    }
    ResolvedCharImgCache[cacheKey] = null;
    saveResolvedCharImgCacheEntry(cacheKey, null);
    return null;
  })().finally(() => {
    delete ResolvingCharImgMap[cacheKey];
  });

  ResolvingCharImgMap[cacheKey] = task;
  return task;
}

function resolveSystemMainImage() {
  const cacheKey = 'system::main';
  if (Object.prototype.hasOwnProperty.call(ResolvedCharImgCache, cacheKey)) {
    const cachedUrl = ResolvedCharImgCache[cacheKey];
    if (cachedUrl && !AssetCache.has(cachedUrl)) {
      return probeCharImageUrl(cachedUrl).then((ok) => {
        if (ok) {
          applySystemMainBackground(cachedUrl);
          return cachedUrl;
        }
        delete ResolvedCharImgCache[cacheKey];
        return resolveSystemMainImage();
      });
    }
    applySystemMainBackground(cachedUrl);
    return Promise.resolve(cachedUrl);
  }
  if (ResolvingCharImgMap[cacheKey]) {
    return ResolvingCharImgMap[cacheKey];
  }

  const candidates = buildSystemMainImageCandidates();
  const task = (async () => {
    const swCachedUrl = await findCachedCandidateUrl(candidates);
    if (swCachedUrl) {
      const ok = await probeCharImageUrl(swCachedUrl);
      if (ok) {
        ResolvedCharImgCache[cacheKey] = swCachedUrl;
        saveResolvedCharImgCacheEntry(cacheKey, swCachedUrl);
        applySystemMainBackground(swCachedUrl);
        return swCachedUrl;
      }
    }

    for (const url of candidates) {
      const ok = await probeCharImageUrl(url);
      if (ok) {
        ResolvedCharImgCache[cacheKey] = url;
        saveResolvedCharImgCacheEntry(cacheKey, url);
        applySystemMainBackground(url);
        return url;
      }
    }
    ResolvedCharImgCache[cacheKey] = null;
    saveResolvedCharImgCacheEntry(cacheKey, null);
    applySystemMainBackground(null);
    return null;
  })().finally(() => {
    delete ResolvingCharImgMap[cacheKey];
  });

  ResolvingCharImgMap[cacheKey] = task;
  return task;
}

function applySystemMainBackground(url) {
  const absUrl = toAbsoluteAssetUrl(url);
  const menuOverlay = document.getElementById('menu-overlay');
  if (absUrl) {
    document.documentElement.style.setProperty('--menu-bg-image', `url("${absUrl}")`);
    if (menuOverlay) {
      menuOverlay.style.backgroundImage = `url("${absUrl}"), var(--scene-bg-pattern), var(--scene-bg-base)`;
      menuOverlay.style.backgroundSize = 'cover, 32px 32px, 100% 100%';
      menuOverlay.style.backgroundPosition = 'center, center, center';
      menuOverlay.style.backgroundRepeat = 'no-repeat, repeat, no-repeat';
    }
    document.body.classList.add('has-system-main-bg');
  } else {
    document.documentElement.style.removeProperty('--menu-bg-image');
    if (menuOverlay) {
      menuOverlay.style.backgroundImage = '';
      menuOverlay.style.backgroundSize = '';
      menuOverlay.style.backgroundPosition = '';
      menuOverlay.style.backgroundRepeat = '';
    }
    document.body.classList.remove('has-system-main-bg');
  }
}

function getResolvedDefaultFrame(charName) {
  if (!charName) return null;
  const key = `frame::${charName}`;
  if (Object.prototype.hasOwnProperty.call(ResolvedCharImgCache, key)) {
    return ResolvedCharImgCache[key];
  }
  return undefined;
}

function getResolvedDefaultPazzleBack(charName) {
  if (!charName) return null;
  const bgKey = `pazzle_back::${charName}`;
  if (Object.prototype.hasOwnProperty.call(ResolvedCharImgCache, bgKey)) {
    if (ResolvedCharImgCache[bgKey]) return ResolvedCharImgCache[bgKey];
    const frameRes = getResolvedDefaultFrame(charName);
    return frameRes !== undefined ? frameRes : null;
  }
  return undefined;
}

function applyCharacterImageToElement(imgEl, charId, variant = 'normal', options = {}) {
  if (!imgEl) return;
  const fallbackToNormal = options.fallbackToNormal !== false;
  const reqToken = String((parseInt(imgEl.dataset.charImgReq || '0', 10) || 0) + 1);
  imgEl.dataset.charImgReq = reqToken;

  const applyOrientationAndLoad = (url) => {
    if (imgEl.dataset.charImgReq !== reqToken) return;
    imgEl.onload = () => {
      if (imgEl.dataset.charImgReq !== reqToken) return;
      if (typeof options.onLoad === 'function') options.onLoad(imgEl);
    };
    imgEl.onerror = () => {
      if (imgEl.dataset.charImgReq !== reqToken) return;
      if (typeof options.onError === 'function') options.onError(imgEl);
    };
    imgEl.src = url;
  };

  if (charId === 'custom') {
    if (options.customUrl) {
      applyOrientationAndLoad(options.customUrl);
      return;
    }
    if (CustomAssets.chara && CustomAssets.chara.dataUrl) {
      applyOrientationAndLoad(CustomAssets.chara.dataUrl);
      return;
    }
    charId = 'main00';
  }

  const ch = getCharacterById(charId);
  const charName = ch ? ch.name : '';
  if (!charName) {
    if (typeof options.onError === 'function') options.onError(imgEl);
    return;
  }

  const cacheKey = `${variant}::${charName}`;
  if (Object.prototype.hasOwnProperty.call(ResolvedCharImgCache, cacheKey)) {
    const resolved = ResolvedCharImgCache[cacheKey];
    if (resolved) {
      applyOrientationAndLoad(resolved);
      return;
    }
    if (variant === 'lose' && fallbackToNormal) {
      applyCharacterImageToElement(imgEl, charId, 'normal', options);
      return;
    }
    if (typeof options.onError === 'function') options.onError(imgEl);
    return;
  }

  resolveCharacterImage(variant, charName).then((url) => {
    if (imgEl.dataset.charImgReq !== reqToken) return;
    if (url) {
      applyOrientationAndLoad(url);
    } else if (variant === 'lose' && fallbackToNormal) {
      applyCharacterImageToElement(imgEl, charId, 'normal', options);
    } else if (typeof options.onError === 'function') {
      options.onError(imgEl);
    }
  });
}

function getCachedImage(src) {
  if (!src) return null;
  if (AssetCache.has(src)) {
    const entry = AssetCache.get(src);
    return entry.loaded ? entry.img : null;
  }
  const entry = { img: new Image(), loaded: false, error: false };
  entry.img.onload = () => { entry.loaded = true; };
  entry.img.onerror = () => { entry.error = true; };
  entry.img.src = src;
  AssetCache.set(src, entry);
  return null;
}

function getThemeNormalImage(theme) {
  if (!theme) return null;
  if (theme.charId && theme.charId !== 'custom' && theme.voiceName) {
    const key = `normal::${theme.voiceName}`;
    if (Object.prototype.hasOwnProperty.call(ResolvedCharImgCache, key)) {
      const resolved = ResolvedCharImgCache[key];
      if (resolved) {
        if (theme.charSrc !== resolved) theme.charSrc = resolved;
        return getCachedImage(resolved);
      }
      return null;
    }
    resolveCharacterImage('normal', theme.voiceName).then((url) => {
      if (url) theme.charSrc = url;
    });
    return null;
  }
  return theme.charSrc ? getCachedImage(theme.charSrc) : null;
}

async function preloadDefaultCharImages(onProgress = null) {
  const variants = ['normal', 'frame', 'pazzle_back', 'story_back', 'lose'];
  const total = CHARACTERS.length * variants.length + 1;
  let done = 0;
  const tick = () => {
    done++;
    if (typeof onProgress === 'function') onProgress(done, total);
  };

  await resolveSystemMainImage().finally(tick);

  const priorityChars = [];
  const addedNames = new Set();
  const pushCharById = (cid) => {
    if (!cid || cid === 'custom' || cid === 'random') return;
    const ch = CHARACTERS.find(c => c.id === cid);
    if (ch && !addedNames.has(ch.name)) {
      addedNames.add(ch.name);
      priorityChars.push(ch);
    }
  };
  pushCharById(selectedCharId);
  pushCharById(storySelectedCharId);
  pushCharById('main00');
  CHARACTERS.forEach(c => {
    if (!addedNames.has(c.name)) {
      addedNames.add(c.name);
      priorityChars.push(c);
    }
  });

  const jobQueue = [];
  priorityChars.forEach(c => {
    variants.forEach(variant => {
      jobQueue.push(() => resolveCharacterImage(variant, c.name).finally(tick));
    });
  });

  const CONCURRENCY = 6;
  let cursor = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, jobQueue.length) }, async () => {
    while (cursor < jobQueue.length) {
      const idx = cursor++;
      await jobQueue[idx]();
    }
  });
  await Promise.all(workers);
}
// ==========================================
// 汎用・ループ型 CSS 3D カバーフローエンジン
// （directHorizontal: true 指定時は決定での選択モード入り不要で直接左右切替可能）
// ==========================================
function createCoverFlow(container, config) {
  const items = config.items || [];
  if (!container || items.length === 0) return null;

  const total = items.length;
  let activeIdx = Math.max(0, Math.min(total - 1, config.initialIndex || 0));
  const compact = !!config.compact;
  const wrapperClass = config.wrapperClass || '';
  const showSlider = config.showSlider !== false && total > 1;
  const spreadX = compact ? 132 : 84;
  const sideOffset = compact ? 22 : 16;

  container.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = `cf-wrapper ${wrapperClass}`.trim();

  if (config.title) {
    const hdr = document.createElement('div');
    hdr.className = 'cf-header-row';
    const titleSpan = document.createElement('span');
    titleSpan.innerText = config.title;
    const countSpan = document.createElement('span');
    countSpan.className = 'cf-count-text';
    hdr.append(titleSpan, countSpan);
    wrapper.appendChild(hdr);
  }

  const stageWrap = document.createElement('div');
  stageWrap.className = 'cf-stage-wrap' + (compact ? ' compact' : '');
  stageWrap.tabIndex = 0;
  if (config.directHorizontal) {
    stageWrap.dataset.cfDirect = '1';
  }
  const stage = document.createElement('div');
  stage.className = 'cf-stage';
  stageWrap.appendChild(stage);

  const engageHint = document.createElement('div');
  engageHint.className = 'cf-engage-hint';
  engageHint.setAttribute('aria-hidden', 'true');
  stageWrap.appendChild(engageHint);

  stageWrap._cfStep = (dir) => stepIndex(dir);
  stageWrap._cfConfirm = (typeof config.onCenterClick === 'function')
    ? () => config.onCenterClick(items[activeIdx], activeIdx)
    : null;
  stageWrap._cfIsEngaged = () => stageWrap.classList.contains('cf-engaged');
  stageWrap._cfSetEngaged = (flag) => {
    stageWrap.classList.toggle('cf-engaged', !!flag);
  };
  stageWrap.addEventListener('blur', () => {
    stageWrap.classList.remove('cf-engaged');
  });

  const cardEls = items.map((item, idx) => {
    const card = document.createElement('div');
    card.className = 'cf-card' + (item.disabled ? ' is-disabled' : '');
    card.dataset.itemId = String(item.id);
    if (item.accentColor) {
      card.style.setProperty('--cf-accent', item.accentColor);
    }

    if (typeof config.renderCard === 'function') {
      config.renderCard(card, item, idx);
    } else {
      const thumb = document.createElement('div');
      thumb.className = 'cf-card-thumb';
      if (item.iconHtml) {
        thumb.innerHTML = item.iconHtml;
      }
      const lbl = document.createElement('div');
      lbl.className = 'cf-card-label';
      lbl.innerText = item.label || '';
      card.append(thumb, lbl);
    }

    const reflect = document.createElement('div');
    reflect.className = 'cf-card-reflect';
    card.appendChild(reflect);

    card.addEventListener('click', () => {
      if (suppressNextClick) return;
      stageWrap.classList.remove('cf-engaged');
      stageWrap.focus({ preventScroll: true });
      if (idx === activeIdx) {
        if (typeof config.onCenterClick === 'function') {
          config.onCenterClick(items[idx], idx);
        } else if (items[idx].disabled && typeof config.onDisabledSelect === 'function') {
          config.onDisabledSelect(items[idx], idx);
        }
      } else {
        setActiveIndex(idx, true);
      }
    });

    stage.appendChild(card);
    return card;
  });

  wrapper.appendChild(stageWrap);

  let sliderEl = null;
  if (showSlider) {
    const ctrlRow = document.createElement('div');
    ctrlRow.className = 'cf-controls-row';

    const prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.className = 'cf-nav-btn';
    prevBtn.tabIndex = -1;
    prevBtn.innerText = '◀';
    prevBtn.onclick = () => {
      stageWrap.classList.remove('cf-engaged');
      stepIndex(-1);
    };

    sliderEl = document.createElement('input');
    sliderEl.type = 'range';
    sliderEl.className = 'cf-slider';
    sliderEl.tabIndex = -1;
    sliderEl.min = '0';
    sliderEl.max = String(Math.max(0, total - 1));
    sliderEl.step = '1';
    sliderEl.value = String(activeIdx);
    sliderEl.oninput = () => {
      const v = parseInt(sliderEl.value, 10) || 0;
      if (v !== activeIdx) setActiveIndex(v, true);
    };
    sliderEl._cfStep = (dir) => stepIndex(dir);
    sliderEl._cfConfirm = () => {
      if (typeof config.onCenterClick === 'function') {
        config.onCenterClick(items[activeIdx], activeIdx);
      }
    };

    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'cf-nav-btn';
    nextBtn.tabIndex = -1;
    nextBtn.innerText = '▶';
    nextBtn.onclick = () => {
      stageWrap.classList.remove('cf-engaged');
      stepIndex(1);
    };

    ctrlRow.append(prevBtn, sliderEl, nextBtn);
    wrapper.appendChild(ctrlRow);
  }

  let descEl = null;
  if (config.showDesc) {
    descEl = document.createElement('div');
    descEl.className = 'cf-desc-box';
    wrapper.appendChild(descEl);
  }

  container.appendChild(wrapper);

  let dragPointerId = null;
  let dragStartX = 0;
  let dragAccumX = 0;
  let suppressNextClick = false;
  const SWIPE_STEP_PX = 42;

  stageWrap.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    stageWrap.classList.remove('cf-engaged');
    dragPointerId = e.pointerId;
    dragStartX = e.clientX;
    dragAccumX = 0;
    suppressNextClick = false;
  });

  stageWrap.addEventListener('pointermove', (e) => {
    if (e.pointerId !== dragPointerId) return;
    const dx = e.clientX - dragStartX;
    dragAccumX += dx;
    dragStartX = e.clientX;
    if (Math.abs(dragAccumX) >= SWIPE_STEP_PX) {
      suppressNextClick = true;
      const steps = Math.trunc(dragAccumX / SWIPE_STEP_PX);
      dragAccumX -= steps * SWIPE_STEP_PX;
      stepIndex(-steps);
    }
  });

  const endDrag = (e) => {
    if (e.pointerId !== dragPointerId) return;
    dragPointerId = null;
    if (suppressNextClick) {
      setTimeout(() => { suppressNextClick = false; }, 60);
    }
  };
  stageWrap.addEventListener('pointerup', endDrag);
  stageWrap.addEventListener('pointercancel', endDrag);

  let wheelLockUntil = 0;
  stageWrap.addEventListener('wheel', (e) => {
    e.preventDefault();
    const now = performance.now();
    if (now < wheelLockUntil) return;
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (Math.abs(delta) < 6) return;
    wheelLockUntil = now + 90;
    stepIndex(delta > 0 ? 1 : -1);
  }, { passive: false });

  function updateVisual() {
    const countSpan = wrapper.querySelector('.cf-count-text');
    if (countSpan) countSpan.innerText = `${activeIdx + 1} / ${total}`;
    if (sliderEl && parseInt(sliderEl.value, 10) !== activeIdx) {
      sliderEl.value = String(activeIdx);
    }
    if (descEl) {
      descEl.innerText = items[activeIdx]?.desc || '';
    }

    cardEls.forEach((card, i) => {
      let diff = i - activeIdx;
      if (total > 2) {
        if (diff > total / 2) diff -= total;
        if (diff < -total / 2) diff += total;
      }

      const absD = Math.abs(diff);
      let tx = diff * spreadX;
      let tz = 0;
      let rotY = 0;
      let scale = 1.0;
      let opacity = 1.0;
      let zIndex = 20 - Math.round(absD * 4);

      if (diff < 0) {
        tx -= sideOffset;
        tz = -95 - absD * 34;
        rotY = 44;
        scale = Math.max(0.7, 0.88 - absD * 0.06);
      } else if (diff > 0) {
        tx += sideOffset;
        tz = -95 - absD * 34;
        rotY = -44;
        scale = Math.max(0.7, 0.88 - absD * 0.06);
      } else {
        tz = 18;
        scale = 1.04;
        zIndex = 30;
      }

      if (absD > 2) {
        opacity = 0;
        card.style.pointerEvents = 'none';
      } else {
        opacity = diff === 0 ? 1 : Math.max(0.45, 0.86 - (absD - 1) * 0.25);
        card.style.pointerEvents = 'auto';
      }

      card.classList.toggle('is-center', diff === 0);
      if (diff === 0 && items[i].accentColor) {
        card.style.borderColor = items[i].accentColor;
      } else {
        card.style.borderColor = '';
      }
      card.style.zIndex = String(zIndex);
      card.style.opacity = String(opacity);
      card.style.transform = `translate3d(${tx}px, 0px, ${tz}px) rotateY(${rotY}deg) scale(${scale})`;
    });
  }

  function setActiveIndex(newIdx, notify = true) {
    const wrapped = ((newIdx % total) + total) % total;
    if (wrapped === activeIdx && notify) return;
    activeIdx = wrapped;
    updateVisual();
    if (notify) {
      if (typeof SE !== 'undefined') SE.play('cursorMove');
      const item = items[activeIdx];
      if (item.disabled) {
        if (typeof config.onDisabledSelect === 'function') config.onDisabledSelect(item, activeIdx);
      } else if (typeof config.onSelect === 'function') {
        config.onSelect(item, activeIdx);
      }
    }
  }

  function stepIndex(delta) {
    setActiveIndex(activeIdx + delta, true);
  }

  updateVisual();

  return {
    wrapper,
    stageWrap,
    getIndex: () => activeIdx,
    setIndex: (idx) => setActiveIndex(idx, false),
    step: stepIndex
  };
}

// --- キャラ選択（ループ型3Dカバーフロー） ---
function renderCharPicker(containerId, options = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const storyOnly = !!options.storyOnly;

  let currentId;
  if (options.currentId !== undefined) {
    currentId = options.currentId;
  } else if (storyOnly) {
    currentId = (storySelectedCharId === 'custom' && CustomAssets.chara) ? 'custom' : 'main00';
    storySelectedCharId = currentId;
  } else {
    if (selectedCharId === 'custom' && !CustomAssets.chara) {
      selectedCharId = 'main00';
      localStorage.setItem('pdw_char_id', selectedCharId);
    }
    currentId = selectedCharId;
  }

  const idList = storyOnly ? ['main00', 'custom'] : CHAR_PICKER_ORDER;
  const items = idList.map(cid => {
    const ch = getCharacterById(cid);
    const isCustomEmpty = (cid === 'custom' && !CustomAssets.chara);
    return {
      id: cid,
      label: isCustomEmpty ? 'マイ(未設定)' : ch.name,
      accentColor: ch.color,
      disabled: isCustomEmpty,
      charDef: ch
    };
  });

  let initialIndex = items.findIndex(it => it.id === currentId);
  if (initialIndex < 0) initialIndex = 0;

  const titleText = options.title || '使用キャラ選択（左右で切替 / 決定で次へ）';

  const syncInlineNameBox = (selectedId) => {
    let nameRow = container.querySelector('.char-name-inline-row');
    const shouldShow = (selectedId === 'custom' && CustomAssets.chara && !options.hideNameInput);
    if (shouldShow && !nameRow) {
      nameRow = document.createElement('div');
      nameRow.className = 'char-name-inline-row';
      const lbl = document.createElement('span');
      lbl.innerText = 'プレイヤー名:';
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.className = 'char-name-inline-input';
      inp.maxLength = 10;
      inp.placeholder = 'マイキャラ';
      inp.value = playerCustomName;
      inp.oninput = (e) => onPlayerNameInput(e.target.value);
      nameRow.append(lbl, inp);
      const cfWrap = container.querySelector('.cf-wrapper');
      if (cfWrap) cfWrap.appendChild(nameRow);
      else container.appendChild(nameRow);
    } else if (!shouldShow && nameRow) {
      nameRow.remove();
    }
  };

  createCoverFlow(container, {
    items,
    initialIndex,
    title: titleText,
    compact: false,
    renderCard: (card, item) => {
      const thumb = document.createElement('div');
      thumb.className = 'cf-card-thumb';
      if (item.id === 'random') {
        const q = document.createElement('div');
        q.className = 'char-icon-random';
        q.innerText = '？';
        thumb.appendChild(q);
      } else {
        const img = document.createElement('img');
        img.className = 'cf-card-img';
        img.alt = item.label;
        if (item.id === 'custom' && CustomAssets.chara) {
          img.src = CustomAssets.chara.dataUrl;
          if (CustomAssets.chara.orientation === 'landscape') {
            img.classList.add('landscape-fit');
          }
        } else {
          applyCharacterImageToElement(img, item.id === 'custom' ? 'main00' : item.id, 'normal');
        }
        thumb.appendChild(img);
      }
      if (item.disabled) {
        const badge = document.createElement('span');
        badge.className = 'cf-card-badge';
        badge.innerText = '未設定';
        thumb.appendChild(badge);
      }
      const lbl = document.createElement('div');
      lbl.className = 'cf-card-label';
      lbl.innerText = item.label;
      card.append(thumb, lbl);
    },
    onDisabledSelect: () => {
      showToast('「せってい → がぞう」からマイ立ち絵を登録すると選べます');
    },
    onSelect: (item) => {
      if (typeof options.onSelect === 'function') {
        options.onSelect(item.id);
      } else if (storyOnly) {
        storySelectedCharId = item.id;
        localStorage.setItem('pdw_story_char_id', item.id);
      } else {
        selectedCharId = item.id;
        localStorage.setItem('pdw_char_id', item.id);
      }
      syncInlineNameBox(item.id);
      if (typeof refreshMenuHeaderAndPreview === 'function') {
        refreshMenuHeaderAndPreview();
      }
    },
    onCenterClick: (item) => {
      if (item.disabled) {
        showToast('「せってい → がぞう」からマイ立ち絵を登録すると選べます');
        return;
      }
      if (typeof playCharacterConfirmVoice === 'function') {
        playCharacterConfirmVoice(item.id);
      }
      if (typeof options.onCenterClick === 'function') {
        options.onCenterClick(item.id);
      } else if (typeof advanceFromCoverFlow === 'function') {
        const sw = container.querySelector('.cf-stage-wrap');
        if (sw) advanceFromCoverFlow(sw);
      }
    }
  });

  syncInlineNameBox(currentId);
}

// --- スキル選択（ループ型3Dカバーフロー・自作スキルON/OFF対応） ---
function renderSkillCarousel(containerId, options = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const allowCustom = options.allowCustom !== false;
  const ids = getSelectableSkillIds(allowCustom);

  let curId = options.currentSkillId !== undefined
    ? options.currentSkillId
    : ((typeof selectedPlayerSkill !== 'undefined') ? selectedPlayerSkill : ids[0]);
  let idx = ids.indexOf(curId);
  if (idx === -1) { idx = 0; curId = ids[0]; }

  const items = ids.map(id => ({
    id,
    label: getSkillLabel(id),
    icon: getSkillIcon(id),
    desc: getSkillDesc(id),
    sub: getSkillSubLabel(id),
    accentColor: getSkillColor(id)
  }));

  const isDirect = options.directHorizontal !== undefined
    ? !!options.directHorizontal
    : (containerId === 'skill-modal-picker');

  createCoverFlow(container, {
    items,
    initialIndex: idx,
    title: options.title || 'スキルを選択（左右で切替 / 決定で確定）',
    compact: true,
    wrapperClass: 'skill-theme',
    showDesc: true,
    directHorizontal: isDirect,
    renderCard: (card, item) => {
      const iconBox = document.createElement('div');
      iconBox.className = 'cf-skill-icon';
      iconBox.innerText = item.icon;
      const lbl = document.createElement('div');
      lbl.className = 'cf-card-label';
      lbl.style.color = item.id === 'sacrifice'
        ? '#f87171'
        : (item.id === 'no_skill' ? '#cbd5e1' : (item.id.startsWith('custom_') ? '#38bdf8' : '#ffd700'));
      lbl.innerText = item.label;
      const sub = document.createElement('div');
      sub.className = 'cf-card-sub';
      sub.innerText = item.sub;
      card.append(iconBox, lbl, sub);
    },
    onSelect: (item) => {
      if (typeof options.onSelect === 'function') {
        options.onSelect(item.id);
      } else if (typeof onPlayerSkillSelectChange === 'function') {
        onPlayerSkillSelectChange(item.id);
      }
    },
    onCenterClick: (item) => {
      if (typeof options.onCenterClick === 'function') {
        options.onCenterClick(item.id);
      }
    }
  });
}

function refreshAllSkillCarousels() {
  const modalPicker = document.getElementById('skill-modal-picker');
  if (modalPicker && document.getElementById('skill-select-modal')?.style.display === 'flex') {
    const curStage = modalPicker.querySelector('.cf-stage-wrap');
    if (!curStage) {
      if (typeof renderSkillModalPicker === 'function') renderSkillModalPicker();
      else renderSkillCarousel('skill-modal-picker');
    }
  }
}

// --- IndexedDB 管理 ---
const ASSET_DB_NAME = 'pdw_custom_assets_db';
const ASSET_STORE_NAME = 'assets';

function openAssetDB() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) { reject(new Error('IndexedDB unsupported')); return; }
    const req = indexedDB.open(ASSET_DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(ASSET_STORE_NAME)) {
        db.createObjectStore(ASSET_STORE_NAME, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveCustomAssetDB(key, record) {
  const db = await openAssetDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ASSET_STORE_NAME, 'readwrite');
    tx.objectStore(ASSET_STORE_NAME).put({ key, ...record });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteCustomAssetDB(key) {
  const db = await openAssetDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ASSET_STORE_NAME, 'readwrite');
    tx.objectStore(ASSET_STORE_NAME).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function arrayBufferToDataUrl(buffer, mime = 'application/octet-stream') {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

function dataUrlToArrayBuffer(dataUrl) {
  const idx = dataUrl.indexOf(',');
  const base64 = idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
  const binStr = atob(base64);
  const bytes = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) {
    bytes[i] = binStr.charCodeAt(i);
  }
  return bytes.buffer;
}

async function loadAllCustomAssets() {
  try {
    const db = await openAssetDB();
    const items = await new Promise((resolve, reject) => {
      const tx = db.transaction(ASSET_STORE_NAME, 'readonly');
      const req = tx.objectStore(ASSET_STORE_NAME).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    for (const item of items) {
      if (!item || !item.key || !item.dataUrl) continue;
      if (item.key.startsWith('voice_')) {
        const vCat = item.key.slice(6);
        if (typeof VOICE !== 'undefined') {
          const buf = dataUrlToArrayBuffer(item.dataUrl);
          await VOICE.setCustomVoice(vCat, buf, { dataUrl: item.dataUrl, name: item.name || vCat, size: buf.byteLength });
        }
      } else if (item.key.startsWith('se_')) {
        const seKey = item.key.slice(3);
        if (typeof SE !== 'undefined') {
          const buf = dataUrlToArrayBuffer(item.dataUrl);
          await SE.setCustomSound(seKey, buf, { dataUrl: item.dataUrl, name: item.name || seKey, size: buf.byteLength });
        }
      } else {
        CustomAssets[item.key] = item;
        getCachedImage(item.dataUrl);
      }
    }
    applyGlobalFrameTheme(CustomAssets.frame ? CustomAssets.frame.dataUrl : null);
  } catch (e) {
    console.warn('CustomAssets load skip:', e);
  }
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function compressImageSmart(file, kind, overrideName = null) {
  const img = await loadImageFromFile(file);
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  const ratio = srcW / Math.max(1, srcH);

  let orientation = 'square';
  if (ratio < 0.88) orientation = 'portrait';
  else if (ratio > 1.12) orientation = 'landscape';

  let maxLongEdge = 512;
  let maxBytes = 120 * 1024;
  let preserveAlpha = true;

  if (kind === 'bg') {
    maxLongEdge = orientation === 'portrait' ? 560 : 720;
    maxBytes = 140 * 1024;
    preserveAlpha = false;
  } else if (kind === 'frame') {
    maxLongEdge = 540;
    maxBytes = 120 * 1024;
    preserveAlpha = true;
  } else {
    maxLongEdge = orientation === 'landscape' ? 460 : 500;
    maxBytes = 95 * 1024;
    preserveAlpha = true;
  }

  let scale = Math.min(1, maxLongEdge / Math.max(srcW, srcH));
  const mime = preserveAlpha ? 'image/webp' : 'image/jpeg';
  let quality = 0.82;
  let dataUrl = '';
  let outW = srcW, outH = srcH;

  const cvs = document.createElement('canvas');
  const ctx = cvs.getContext('2d');

  for (let attempt = 0; attempt < 5; attempt++) {
    outW = Math.max(1, Math.round(srcW * scale));
    outH = Math.max(1, Math.round(srcH * scale));
    cvs.width = outW;
    cvs.height = outH;
    ctx.clearRect(0, 0, outW, outH);
    if (!preserveAlpha) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, outW, outH);
    }
    ctx.drawImage(img, 0, 0, outW, outH);

    dataUrl = cvs.toDataURL(mime, quality);
    if (preserveAlpha && !dataUrl.startsWith('data:image/webp')) {
      dataUrl = cvs.toDataURL('image/png');
    }

    const approxBytes = Math.floor((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75);
    if (approxBytes <= maxBytes) break;

    quality = Math.max(0.45, quality - 0.12);
    scale *= 0.84;
  }

  return {
    dataUrl,
    width: outW,
    height: outH,
    orientation,
    name: overrideName || file.name || `${kind}.png`
  };
}

async function handleCustomAssetUpload(kind, inputEl) {
  const file = inputEl.files && inputEl.files[0];
  if (!file) return;
  try {
    if (typeof BusyLoader !== 'undefined') BusyLoader.show('画像を最適化中...', file.name || '');
    const record = await compressImageSmart(file, kind);
    CustomAssets[kind] = record;
    AssetCache.delete(record.dataUrl);
    ToneImageCache.delete(record.dataUrl);
    getCachedImage(record.dataUrl);
    await saveCustomAssetDB(kind, record);
    if (kind === 'chara') {
      selectedCharId = 'custom';
      storySelectedCharId = 'custom';
    }
    if (kind === 'frame') {
      applyGlobalFrameTheme(record.dataUrl);
    }
    refreshCustomAssetsUI();
    if (typeof refreshMenuHeaderAndPreview === 'function') refreshMenuHeaderAndPreview();
    showToast(`${kind === 'chara' ? '立ち絵' : kind === 'bg' ? '背景' : 'フレーム'}をセットしました (${record.width}x${record.height})`);
  } catch (e) {
    console.error(e);
    showToast('画像の読み込みに失敗しました');
  } finally {
    if (typeof BusyLoader !== 'undefined') BusyLoader.hide();
    inputEl.value = '';
  }
}

async function clearCustomAsset(kind) {
  CustomAssets[kind] = null;
  await deleteCustomAssetDB(kind).catch(() => {});
  if (kind === 'chara') {
    if (selectedCharId === 'custom') selectedCharId = 'main00';
    if (storySelectedCharId === 'custom') storySelectedCharId = 'main00';
  }
  if (kind === 'frame') {
    applyGlobalFrameTheme(null);
  }
  refreshCustomAssetsUI();
  if (typeof refreshMenuHeaderAndPreview === 'function') refreshMenuHeaderAndPreview();
  showToast('リセットしました');
}

async function handleCustomVoiceUpload(category, inputEl) {
  const file = inputEl.files && inputEl.files[0];
  if (!file || typeof VOICE === 'undefined') return;
  try {
    if (typeof BusyLoader !== 'undefined') BusyLoader.show('ボイスを読み込み中...', file.name || '');
    const buf = await file.arrayBuffer();
    const mime = file.type || guessMimeFromExt((file.name.split('.').pop() || '').toLowerCase());
    const dataUrl = arrayBufferToDataUrl(buf, mime);
    const ok = await VOICE.setCustomVoice(category, buf, { dataUrl, name: file.name, size: buf.byteLength });
    if (!ok) {
      showToast('非対応の音声ファイルです');
      return;
    }
    await saveCustomAssetDB(`voice_${category}`, { dataUrl, name: file.name });
    refreshCustomAssetsUI();
    const labelMap = { attack: '攻撃(お邪魔)', win: '勝利時', lose: '敗北時' };
    showToast(`カスタムボイス(${labelMap[category] || category})をセットしました`);
  } catch (e) {
    console.error(e);
    showToast('ボイスの読み込みに失敗しました');
  } finally {
    if (typeof BusyLoader !== 'undefined') BusyLoader.hide();
    inputEl.value = '';
  }
}

async function clearCustomVoice(category) {
  if (typeof VOICE !== 'undefined') {
    VOICE.clearCustomVoice(category);
  }
  await deleteCustomAssetDB(`voice_${category}`).catch(() => {});
  refreshCustomAssetsUI();
  showToast('カスタムボイスを解除しました');
}

function testCustomVoice(category) {
  if (typeof VOICE === 'undefined') return;
  if (!VOICE.customBuffers[category] && !(VOICE.customRawMap[category] && VOICE.customRawMap[category].dataUrl)) {
    showToast('未設定です');
    return;
  }
  VOICE.play(category, { charId: 'custom', name: getPlayerDisplayName() });
}

async function clearAllCustomSE() {
  if (typeof SE !== 'undefined') {
    const keys = Object.keys(SE.customRawMap);
    for (const k of keys) {
      await deleteCustomAssetDB(`se_${k}`).catch(() => {});
    }
    SE.clearAllCustomSounds();
  }
  refreshCustomAssetsUI();
  showToast('カスタムSEをすべて解除しました');
}

function refreshCustomAssetsUI() {
  ['chara', 'bg', 'frame'].forEach(kind => {
    const thumb = document.getElementById(`custom-${kind}-thumb`);
    const info = document.getElementById(`custom-${kind}-info`);
    const data = CustomAssets[kind];
    if (thumb) {
      thumb.src = data ? data.dataUrl : '';
      thumb.style.visibility = data ? 'visible' : 'hidden';
    }
    if (info) {
      info.innerText = data ? `${data.width}×${data.height} (${data.orientation})` : '未設定 (標準)';
    }
  });
  ['attack', 'win', 'lose'].forEach(cat => {
    const el = document.getElementById(`custom-voice-${cat}-info`);
    if (el && typeof VOICE !== 'undefined') {
      const meta = VOICE.customRawMap[cat];
      el.innerText = meta ? `${meta.name}` : '未設定';
    }
  });
  const seInfo = document.getElementById('custom-se-info');
  if (seInfo && typeof SE !== 'undefined') {
    const keys = Object.keys(SE.customBuffers);
    seInfo.innerText = keys.length > 0 ? `登録済み (${keys.length}件): ${keys.join(', ')}` : '未設定 (標準SE)';
  }
  const nameInput = document.getElementById('settings-player-name');
  if (nameInput) nameInput.value = playerCustomName;
  refreshHubCharSelectOptions();
}

async function extractZipEntries(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);

  let eocdOffset = -1;
  const minPos = Math.max(0, bytes.length - 65558);
  for (let i = bytes.length - 22; i >= minPos; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) throw new Error('ZIPの終端ヘッダが見つかりません');

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const cdOffset = view.getUint32(eocdOffset + 16, true);
  const decoder = new TextDecoder('utf-8');
  const results = [];

  let ptr = cdOffset;
  for (let i = 0; i < totalEntries; i++) {
    if (ptr + 46 > bytes.length || view.getUint32(ptr, true) !== 0x02014b50) break;
    const compMethod = view.getUint16(ptr + 10, true);
    const compSize = view.getUint32(ptr + 20, true);
    const fnameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const localHeaderOffset = view.getUint32(ptr + 42, true);

    const rawName = bytes.subarray(ptr + 46, ptr + 46 + fnameLen);
    const fileName = decoder.decode(rawName);
    ptr += 46 + fnameLen + extraLen + commentLen;

    if (!fileName || fileName.endsWith('/') || fileName.startsWith('__MACOSX/')) continue;
    const baseName = fileName.split('/').pop();
    if (!baseName || baseName.startsWith('.')) continue;

    if (localHeaderOffset + 30 > bytes.length || view.getUint32(localHeaderOffset, true) !== 0x04034b50) continue;
    const lFnameLen = view.getUint16(localHeaderOffset + 26, true);
    const lExtraLen = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + lFnameLen + lExtraLen;
    const compSlice = bytes.subarray(dataStart, dataStart + compSize);

    let fileBuf = null;
    if (compMethod === 0) {
      fileBuf = compSlice.slice().buffer;
    } else if (compMethod === 8) {
      if (typeof DecompressionStream === 'undefined') {
        throw new Error('お使いのブラウザはDeflate展開に対応していません');
      }
      const ds = new DecompressionStream('deflate-raw');
      const writer = ds.writable.getWriter();
      writer.write(compSlice);
      writer.close();
      fileBuf = await new Response(ds.readable).arrayBuffer();
    } else {
      continue;
    }

    results.push({ path: fileName, baseName, buffer: fileBuf });
  }
  return results;
}

function guessMimeFromExt(ext) {
  const map = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
    mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', ogg: 'audio/ogg', opus: 'audio/opus', webm: 'audio/webm'
  };
  return map[ext] || 'application/octet-stream';
}

function matchVoiceCategoryFromPath(lowerPath, lowerStem) {
  const isVoiceDir = lowerPath.includes('voice/');
  if (lowerPath.includes('voice/attack') || lowerStem === 'ata' || lowerStem === 'attack' || lowerStem.endsWith('_ata') || lowerStem.endsWith('_attack')) {
    return 'attack';
  }
  if (lowerPath.includes('voice/win') || lowerStem === 'win' || lowerStem.endsWith('_win')) {
    return 'win';
  }
  if (lowerPath.includes('voice/lose') || lowerStem === 'lose' || lowerStem.endsWith('_lose')) {
    return 'lose';
  }
  if (isVoiceDir) {
    if (lowerStem.includes('ata') || lowerStem.includes('attack')) return 'attack';
    if (lowerStem.includes('win')) return 'win';
    if (lowerStem.includes('lose')) return 'lose';
  }
  return null;
}

function matchSeKeyFromPath(lowerPath, lowerStem) {
  const map = [
    ['countdown_3', ['countdown_3', 'cd_3', 'count_3', 'count3', '3']],
    ['countdown_2', ['countdown_2', 'cd_2', 'count_2', 'count2', '2']],
    ['countdown_1', ['countdown_1', 'cd_1', 'count_1', 'count1', '1']],
    ['countdown_go', ['countdown_go', 'cd_go', 'count_go', 'countgo', 'go']],
    ['countdown', ['countdown']],
    ['cursorMove', ['cursor_move', 'cursormove', 'cursor']],
    ['select', ['select', 'decide']],
    ['cancel', ['cancel', 'back']],
    ['skillFilled', ['skill_filled', 'skillfilled']],
    ['falledBlock', ['falled_block', 'falledblock', 'falled', 'fall']],
    ['garbageErase', ['garbage_block_erase', 'garbage_erase', 'garbageerase', 'garbage']],
    ['normalErase', ['nomal_block_erase', 'normal_block_erase', 'normal_erase', 'normalerase', 'erase']],
    ['fanfareMin', ['fanfare_min', 'fanfaremin', 'chain4']],
    ['fanfareMid', ['fanfare_mid', 'fanfaremid', 'chain5']],
    ['fanfareMax', ['fanfare_max', 'fanfaremax', 'chain6']],
    ['skill', ['skill_activate', 'skill']]
  ];
  for (const [key, aliases] of map) {
    if (aliases.includes(lowerStem)) return key;
  }
  for (const [key, aliases] of map) {
    if (aliases.some(a => a.length > 2 && (lowerStem.startsWith(a) || lowerPath.includes(`/${a}`)))) {
      return key;
    }
  }
  return null;
}

async function handleCustomZipUpload(inputEl) {
  const file = inputEl.files && inputEl.files[0];
  if (!file) return;
  try {
    if (typeof BusyLoader !== 'undefined') BusyLoader.show('ZIP一括読み込み中...', file.name || '');
    const zipBuf = await file.arrayBuffer();
    const entries = await extractZipEntries(zipBuf);
    let loadedImg = 0, loadedVoice = 0, loadedSe = 0, loadedBgm = 0;
    const bgmFiles = [];

    for (let idx = 0; idx < entries.length; idx++) {
      const entry = entries[idx];
      if (typeof BusyLoader !== 'undefined') {
        BusyLoader.show('ZIP一括読み込み中...', `${idx + 1} / ${entries.length}: ${entry.baseName}`);
      }
      const lowerPath = entry.path.toLowerCase();
      const lowerBase = entry.baseName.toLowerCase();
      const dotIdx = lowerBase.lastIndexOf('.');
      const ext = dotIdx >= 0 ? lowerBase.slice(dotIdx + 1) : '';
      const stem = dotIdx >= 0 ? lowerBase.slice(0, dotIdx) : lowerBase;

      if (lowerBase === 'name.txt') {
        const txt = new TextDecoder('utf-8').decode(entry.buffer).trim().split(/\r?\n/)[0];
        if (txt) onPlayerNameInput(txt);
        continue;
      }
      if (lowerBase === 'meta.json') {
        try {
          const meta = JSON.parse(new TextDecoder('utf-8').decode(entry.buffer));
          if (meta && typeof meta.name === 'string' && meta.name.trim()) {
            onPlayerNameInput(meta.name.trim());
          }
        } catch (_) {}
        continue;
      }

      if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) {
        let kind = null;
        if (stem.includes('chara') || stem.includes('stand') || stem.includes('立ち絵')) kind = 'chara';
        else if (stem.includes('frame') || stem.includes('border') || stem.includes('フレーム')) kind = 'frame';
        else if (stem === 'bg' || stem.includes('background') || stem.includes('背景') || stem.startsWith('bg_')) kind = 'bg';

        if (kind) {
          const blob = new Blob([entry.buffer], { type: guessMimeFromExt(ext) });
          const record = await compressImageSmart(blob, kind, entry.baseName);
          CustomAssets[kind] = record;
          AssetCache.delete(record.dataUrl);
          ToneImageCache.delete(record.dataUrl);
          getCachedImage(record.dataUrl);
          await saveCustomAssetDB(kind, record);
          if (kind === 'chara') {
            selectedCharId = 'custom';
            storySelectedCharId = 'custom';
          }
          if (kind === 'frame') {
            applyGlobalFrameTheme(record.dataUrl);
          }
          loadedImg++;
        }
        continue;
      }

      if (['mp3', 'm4a', 'aac', 'wav', 'ogg', 'opus', 'webm'].includes(ext)) {
        const mime = guessMimeFromExt(ext);
        if (lowerPath.includes('bgm/') || stem.startsWith('bgm')) {
          bgmFiles.push(new File([entry.buffer], entry.baseName, { type: mime }));
          loadedBgm++;
          continue;
        }
        const voiceCat = matchVoiceCategoryFromPath(lowerPath, stem);
        if (voiceCat && typeof VOICE !== 'undefined') {
          const dataUrl = arrayBufferToDataUrl(entry.buffer, mime);
          const ok = await VOICE.setCustomVoice(voiceCat, entry.buffer, {
            dataUrl,
            name: entry.baseName,
            size: entry.buffer.byteLength
          });
          if (ok) {
            await saveCustomAssetDB(`voice_${voiceCat}`, { dataUrl, name: entry.baseName });
            loadedVoice++;
          }
          continue;
        }
        const seKey = matchSeKeyFromPath(lowerPath, stem);
        if (seKey && typeof SE !== 'undefined') {
          const dataUrl = arrayBufferToDataUrl(entry.buffer, mime);
          const ok = await SE.setCustomSound(seKey, entry.buffer, {
            dataUrl,
            name: entry.baseName,
            size: entry.buffer.byteLength
          });
          if (ok) {
            await saveCustomAssetDB(`se_${seKey}`, { dataUrl, name: entry.baseName });
            loadedSe++;
          }
        }
      }
    }

    if (bgmFiles.length > 0 && typeof handleBgmFiles === 'function') {
      handleBgmFiles(bgmFiles);
    }

    refreshCustomAssetsUI();
    if (typeof refreshMenuHeaderAndPreview === 'function') refreshMenuHeaderAndPreview();
    const infoEl = document.getElementById('custom-zip-info');
    if (infoEl) {
      infoEl.innerText = `読込完了: 画像${loadedImg} / Voice${loadedVoice} / SE${loadedSe} / BGM${loadedBgm}`;
    }
    showToast(`ZIP読込完了 (画像:${loadedImg}, Voice:${loadedVoice}, SE:${loadedSe}, BGM:${loadedBgm})`);
  } catch (e) {
    console.error(e);
    showToast('ZIPの読み込みに失敗しました: ' + (e.message || ''));
  } finally {
    if (typeof BusyLoader !== 'undefined') BusyLoader.hide();
    inputEl.value = '';
  }
}

function buildThemeForCharacter(charId, customCharaDataUrl = null, includeMyGlobalBgFrame = true, customName = null, customFrameDataUrl = null) {
  const charDef = getCharacterById(charId);
  let charSrc = customCharaDataUrl || charDef.file;
  if (!customCharaDataUrl && charDef.id !== 'custom') {
    const resolved = ResolvedCharImgCache[`normal::${charDef.name}`];
    if (resolved) charSrc = resolved;
    else if (resolved === undefined) resolveCharacterImage('normal', charDef.name);
  }
  if (charSrc) getCachedImage(charSrc);

  let defaultFrameSrc = null;
  let defaultBgSrc = null;
  if (charDef.id !== 'custom') {
    const resolvedFrame = getResolvedDefaultFrame(charDef.name);
    if (resolvedFrame) defaultFrameSrc = resolvedFrame;
    else if (resolvedFrame === undefined) resolveCharacterImage('frame', charDef.name);

    const resolvedBg = getResolvedDefaultPazzleBack(charDef.name);
    if (resolvedBg) defaultBgSrc = resolvedBg;
    else if (resolvedBg === undefined) resolveCharacterImage('pazzle_back', charDef.name);
  }

  const bgSrc = (includeMyGlobalBgFrame && CustomAssets.bg)
    ? CustomAssets.bg.dataUrl
    : defaultBgSrc;

  let frameSrc = null;
  if (customFrameDataUrl) {
    frameSrc = customFrameDataUrl;
  } else if (includeMyGlobalBgFrame && CustomAssets.frame) {
    frameSrc = CustomAssets.frame.dataUrl;
  } else {
    frameSrc = defaultFrameSrc;
  }

  if (bgSrc) getCachedImage(bgSrc);
  if (frameSrc) getCachedImage(frameSrc);
  return {
    charId: charDef.id,
    voiceName: charDef.name,
    name: customName || charDef.name,
    color: charDef.color,
    charSrc,
    bgSrc,
    frameSrc,
    hasCustomBg: !!(includeMyGlobalBgFrame && CustomAssets.bg)
  };
}

function applyBoardFrame(wrapperId, frameSrc) {
  const wrapper = document.getElementById(wrapperId);
  if (!wrapper) return;
  let frameLayer = wrapper.querySelector('.board-frame-layer');
  if (!frameLayer) {
    frameLayer = document.createElement('div');
    frameLayer.className = 'board-frame-layer';
    wrapper.insertBefore(frameLayer, wrapper.firstChild);
  }
  const absUrl = toAbsoluteAssetUrl(frameSrc);
  if (absUrl) {
    frameLayer.style.backgroundImage = `url("${absUrl}")`;
    frameLayer.style.backgroundSize = 'cover';
    frameLayer.style.backgroundPosition = 'center';
    frameLayer.style.backgroundRepeat = 'no-repeat';
    frameLayer.style.display = 'block';
    wrapper.classList.add('has-custom-frame');
  } else {
    frameLayer.style.backgroundImage = 'none';
    frameLayer.style.display = 'none';
    wrapper.classList.remove('has-custom-frame');
  }
}

function applyGlobalFrameTheme(frameSrc) {
  const absUrl = toAbsoluteAssetUrl(frameSrc);
  const zoneBgEl = document.getElementById('my-zone-frame-bg');
  if (absUrl) {
    document.documentElement.style.setProperty('--custom-frame-url', `url("${absUrl}")`);
    if (zoneBgEl) {
      zoneBgEl.style.backgroundImage = `url("${absUrl}")`;
      zoneBgEl.style.backgroundSize = 'cover';
      zoneBgEl.style.backgroundPosition = 'center';
      zoneBgEl.style.backgroundRepeat = 'no-repeat';
      zoneBgEl.style.display = 'block';
    }
    document.body.classList.add('has-custom-frame');
  } else {
    document.documentElement.style.removeProperty('--custom-frame-url');
    if (zoneBgEl) {
      zoneBgEl.style.backgroundImage = '';
      zoneBgEl.style.display = '';
    }
    document.body.classList.remove('has-custom-frame');
  }
}

// ==========================================
// GB風モード用：スクリーントーン（網点＋4階調ディザ）変換＆キャッシュ
// ==========================================
const ToneImageCache = new Map();
let cachedScreenTonePatternCanvas = null;

function getScreenTonePatternCanvas() {
  if (cachedScreenTonePatternCanvas) return cachedScreenTonePatternCanvas;
  const pCvs = document.createElement('canvas');
  pCvs.width = 4;
  pCvs.height = 4;
  const pCtx = pCvs.getContext('2d');
  pCtx.clearRect(0, 0, 4, 4);
  pCtx.fillStyle = 'rgba(0, 0, 0, 0.34)';
  pCtx.fillRect(0, 0, 1, 1);
  pCtx.fillRect(2, 2, 1, 1);
  pCtx.fillStyle = 'rgba(255, 255, 255, 0.14)';
  pCtx.fillRect(2, 0, 1, 1);
  pCtx.fillRect(0, 2, 1, 1);
  cachedScreenTonePatternCanvas = pCvs;
  return pCvs;
}

function getToneCanvasForImage(img) {
  if (!img) return null;
  const srcKey = img.src || '';
  if (srcKey && ToneImageCache.has(srcKey)) {
    return ToneImageCache.get(srcKey);
  }
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return img;

  const maxDim = 420;
  const scale = Math.min(1, maxDim / Math.max(iw, ih));
  const tw = Math.max(1, Math.round(iw * scale));
  const th = Math.max(1, Math.round(ih * scale));

  const cvs = document.createElement('canvas');
  cvs.width = tw;
  cvs.height = th;
  const tCtx = cvs.getContext('2d');
  tCtx.drawImage(img, 0, 0, tw, th);

  try {
    const imgData = tCtx.getImageData(0, 0, tw, th);
    const data = imgData.data;
    const halftoneMatrix = [
      12,  5,  6, 13,
       4,  0,  1,  7,
      11,  3,  2, 10,
      14,  8,  9, 15
    ];
    const palette = [18, 92, 174, 240];

    for (let y = 0; y < th; y++) {
      const rowOff = (y & 3) << 2;
      for (let x = 0; x < tw; x++) {
        const idx = (y * tw + x) << 2;
        const a = data[idx + 3];
        if (a < 24) {
          data[idx + 3] = 0;
          continue;
        }
        const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        const norm = Math.max(0, Math.min(1, (lum - 14) / 228));
        const threshold = (halftoneMatrix[rowOff + (x & 3)] + 0.5) / 16 - 0.5;
        const val = Math.max(0, Math.min(2.999, norm * 3.0 + threshold * 0.92));
        const level = Math.round(val);
        const shade = palette[Math.max(0, Math.min(3, level))];
        data[idx] = shade;
        data[idx + 1] = shade;
        data[idx + 2] = shade;
      }
    }
    tCtx.putImageData(imgData, 0, 0);
  } catch (_) {
    tCtx.clearRect(0, 0, tw, th);
    tCtx.save();
    tCtx.filter = 'grayscale(100%) contrast(1.48) brightness(1.06)';
    tCtx.drawImage(img, 0, 0, tw, th);
    tCtx.restore();

    const pat = tCtx.createPattern(getScreenTonePatternCanvas(), 'repeat');
    if (pat) {
      tCtx.save();
      tCtx.globalCompositeOperation = 'source-atop';
      tCtx.fillStyle = pat;
      tCtx.fillRect(0, 0, tw, th);
      tCtx.restore();
    }
  }

  if (srcKey) ToneImageCache.set(srcKey, cvs);
  return cvs;
}

function drawImageCover(ctx, img, x, y, w, h) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const scale = Math.max(w / iw, h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function drawImageFitHeight(ctx, img, x, y, w, h) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const scale = h / ih;
  const dw = iw * scale;
  const dh = h;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(img, x + (w - dw) / 2, y, dw, dh);
  ctx.restore();
}

function drawBoardBgAddon(ctx, canvas, engine, renderer) {
  const theme = renderer.theme;
  if (!theme) return;
  const W = canvas.width;
  const H = canvas.height;
  const gb = (typeof isGbMode !== 'undefined' && isGbMode);

  if (!theme.hasCustomBg && !theme.bgSrc && theme.charId && theme.charId !== 'custom' && theme.voiceName) {
    const resolvedBg = getResolvedDefaultPazzleBack(theme.voiceName);
    if (resolvedBg) {
      theme.bgSrc = resolvedBg;
    } else if (resolvedBg === undefined) {
      resolveCharacterImage('pazzle_back', theme.voiceName).then((url) => {
        if (url) {
          theme.bgSrc = url;
        } else {
          resolveCharacterImage('frame', theme.voiceName).then((fUrl) => {
            if (fUrl && !theme.bgSrc) theme.bgSrc = fUrl;
          });
        }
      });
    }
  }

  ctx.save();
  if (theme.bgSrc) {
    const bgImg = getCachedImage(theme.bgSrc);
    if (bgImg) {
      const drawBg = gb ? (getToneCanvasForImage(bgImg) || bgImg) : bgImg;
      drawImageFitHeight(ctx, drawBg, 0, 0, W, H);
    }
  }

  const charImg = getThemeNormalImage(theme);
  if (charImg) {
    ctx.save();
    ctx.globalAlpha = gb ? (theme.bgSrc ? 0.44 : 0.56) : (theme.bgSrc ? 0.65 : 0.75);
    const drawCh = gb ? (getToneCanvasForImage(charImg) || charImg) : charImg;
    drawImageCover(ctx, drawCh, 0, 0, W, H);
    ctx.restore();
  }
  ctx.restore();

  if (gb) {
    const pat = ctx.createPattern(getScreenTonePatternCanvas(), 'repeat');
    if (pat) {
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = pat;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    ctx.fillStyle = 'rgba(0, 0, 0, 0.34)';
    ctx.fillRect(0, 0, W, H);
  } else if (theme.bgSrc || charImg) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
    ctx.fillRect(0, 0, W, H);
  }
}

function drawBoardFgAddon(ctx, canvas, engine, renderer) {
  const theme = renderer.theme;
  const W = canvas.width;
  const H = canvas.height;
  const gb = (typeof isGbMode !== 'undefined' && isGbMode);

  if ((engine.allowBoardCutin || !engine.isPlayer) && engine.cutinTimer && engine.cutinTimer > 0) {
    const progress = engine.cutinTimer / (engine.cutinMax || 50);
    const alpha = Math.min(1, progress * 2.5);
    const slideX = progress > 0.8 ? (progress - 0.8) * 5 * W : 0;

    ctx.save();
    ctx.globalAlpha = alpha * 0.94;
    const bandY = H * 0.28;
    const bandH = 96;

    ctx.fillStyle = gb ? '#f0f0f0' : (theme ? theme.color : '#ff007f');
    ctx.fillRect(0, bandY, W, bandH);
    ctx.fillStyle = gb ? 'rgba(14, 14, 14, 0.94)' : 'rgba(10, 15, 30, 0.86)';
    ctx.fillRect(0, bandY + 4, W, bandH - 8);

    const charImg = getThemeNormalImage(theme);
    if (charImg) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, bandY + 4, W, bandH - 8);
      ctx.clip();
      const srcImg = gb ? (getToneCanvasForImage(charImg) || charImg) : charImg;
      const iw = srcImg.naturalWidth || srcImg.width;
      const ih = srcImg.naturalHeight || srcImg.height;
      const cropH = ih > iw * 1.1 ? ih * 0.55 : ih;
      const drawW = 88;
      const drawH = drawW * (cropH / iw);
      ctx.drawImage(srcImg, 0, 0, iw, cropH, 6 + slideX, bandY + 4, drawW, drawH);
      ctx.restore();
    }

    ctx.fillStyle = '#ffffff';
    ctx.font = '900 17px sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 4;
    const label = engine.cutinText || 'CHAIN!';
    ctx.strokeText(label, W - 10 + slideX, bandY + bandH / 2);
    ctx.fillText(label, W - 10 + slideX, bandY + bandH / 2);
    ctx.restore();
  }
}

async function initAssetsSystem() {
  if (typeof AppLoader !== 'undefined') {
    AppLoader.show('更新データを確認中...');
  }

  if (typeof checkServerUpdatesOnBoot === 'function') {
    const reloading = await checkServerUpdatesOnBoot();
    if (reloading) return;
  }

  let opLaunched = false;
  const startOpAfterUserGesture = () => {
    if (opLaunched) return;
    opLaunched = true;
    if (typeof OpAnimation !== 'undefined' && typeof OpAnimation.start === 'function') {
      OpAnimation.start();
    } else if (typeof SceneBgm !== 'undefined') {
      SceneBgm.play('mode_select');
    }
  };

  const finishBootAndWaitStart = () => {
    if (typeof AppLoader !== 'undefined' && typeof AppLoader.waitForUserStart === 'function') {
      AppLoader.waitForUserStart(startOpAfterUserGesture);
    } else {
      if (typeof AppLoader !== 'undefined') AppLoader.hide();
      setTimeout(startOpAfterUserGesture, 180);
    }
  };

  const safetyTimer = setTimeout(() => {
    finishBootAndWaitStart();
  }, 4500);

  try {
    if (typeof AppLoader !== 'undefined') {
      AppLoader.setProgress(22, 'カスタム・効果音データを準備中...');
    }
    await loadAllCustomAssets();
    if (typeof AppLoader !== 'undefined') {
      AppLoader.setProgress(35, 'キャラクター・背景画像を読み込み中...');
    }

    const preloadPromise = preloadDefaultCharImages((done, total) => {
      if (typeof AppLoader !== 'undefined' && total > 0) {
        const pct = 35 + Math.round((done / total) * 58);
        AppLoader.setProgress(pct, `キャラクター・背景画像を読み込み中... (${done}/${total})`);
      }
    });

    const seWait = (typeof SE !== 'undefined' && SE.readyPromise)
      ? SE.readyPromise.catch(() => {})
      : Promise.resolve();

    const bgmWait = (typeof SceneBgm !== 'undefined' && SceneBgm.readyPromise)
      ? SceneBgm.readyPromise.catch(() => {})
      : Promise.resolve();

    // ボイスファイルもバックグラウンドで解決（未更新時は解決済みキャッシュから即完了）
    if (typeof VOICE !== 'undefined' && typeof VOICE.preloadForCharacters === 'function') {
      VOICE.preloadForCharacters(CHARACTERS.map(c => c.name)).catch(() => {});
    }

    await Promise.race([
      Promise.all([preloadPromise, seWait, bgmWait]),
      new Promise(resolve => setTimeout(resolve, 4000))
    ]);

    refreshCustomAssetsUI();
    if (typeof refreshMenuHeaderAndPreview === 'function') {
      refreshMenuHeaderAndPreview(true);
    }
  } finally {
    clearTimeout(safetyTimer);
    finishBootAndWaitStart();
  }
}