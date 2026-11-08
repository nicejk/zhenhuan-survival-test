import { QUESTIONS, QUESTION_BY_ID, DIMENSIONS, DIM_ORDER } from './questions.js';
import { ARCHETYPES, DIM_READINGS, CAUSES } from './archetypes.js';

const MAX_PER_DIM = QUESTIONS.reduce((acc, q) => {
  acc[q.dim] = (acc[q.dim] || 0) + 4;
  return acc;
}, {});

export const WEIGHTS = { D1: 0.2, D2: 0.15, D3: 0.2, D4: 0.2, D5: 0.15, D6: 0.1 };

const BANDS = [
  { min: 92, max: 100, from: 76, to: 76 },
  { min: 86, max: 92, from: 70, to: 75 },
  { min: 80, max: 86, from: 62, to: 69 },
  { min: 73, max: 80, from: 53, to: 61 },
  { min: 66, max: 73, from: 44, to: 52 },
  { min: 58, max: 66, from: 35, to: 43 },
  { min: 50, max: 58, from: 27, to: 34 },
  { min: 42, max: 50, from: 19, to: 26 },
  { min: 33, max: 42, from: 12, to: 18 },
  { min: 24, max: 33, from: 6, to: 11 },
  { min: 0, max: 24, from: 1, to: 5 },
];

function toEpisode(total) {
  const t = Math.max(0, Math.min(100, total));
  const band = BANDS.find((b) => t >= b.min && t < b.max) || BANDS[BANDS.length - 1];
  const ratio = band.max === band.min ? 1 : (t - band.min) / (band.max - band.min);
  const ep = Math.round(band.from + (band.to - band.from) * Math.min(1, Math.max(0, ratio)));
  return Math.min(76, Math.max(1, ep));
}

function levelOf(score) {
  if (score >= 70) return 'high';
  if (score >= 40) return 'mid';
  return 'low';
}

export function scoreDimensions(answers) {
  const raw = { D1: 0, D2: 0, D3: 0, D4: 0, D5: 0, D6: 0 };
  for (const q of QUESTIONS) {
    const idx = answers[q.id];
    const opt = q.options[idx];
    if (opt) raw[q.dim] += opt.score;
  }
  const dims = {};
  for (const key of DIM_ORDER) {
    const score = Math.round((raw[key] / MAX_PER_DIM[key]) * 100);
    dims[key] = { ...DIMENSIONS[key], score, raw: raw[key], max: MAX_PER_DIM[key], level: levelOf(score) };
  }
  return dims;
}

export function computeResult(answers) {
  const dims = scoreDimensions(answers);

  const base = DIM_ORDER.reduce((sum, k) => sum + dims[k].score * WEIGHTS[k], 0);
  let total = base;
  const d6 = dims.D6.score;
  if (d6 > 75) total -= 0.06 * (d6 - 75);
  if (d6 < 25) total -= 0.04 * (25 - d6);
  total = Math.max(0, Math.min(100, total));

  const episode = toEpisode(total);

  // 短板 → 死因
  const sorted = DIM_ORDER.slice().sort((a, b) => dims[a].score - dims[b].score);
  const weakestKey = sorted[0];
  const strongestKey = sorted[sorted.length - 1];
  let causeKey = weakestKey;
  if (weakestKey === 'D6') {
    if (dims.D6.score >= 76) causeKey = 'D6_HIGH';
    else if (dims.D6.score <= 39) causeKey = 'D6_LOW';
    else causeKey = sorted[1];
  }
  const cause = CAUSES[causeKey];

  // 原型：加权欧氏距离
  let best = ARCHETYPES[0];
  let bestDist = Infinity;
  for (const a of ARCHETYPES) {
    let dist = 0;
    DIM_ORDER.forEach((k, i) => {
      const diff = dims[k].score - a.vector[i];
      dist += WEIGHTS[k] * diff * diff;
    });
    if (dist < bestDist) {
      bestDist = dist;
      best = a;
    }
  }

  const dimDetail = DIM_ORDER.map((k) => ({
    key: k,
    name: dims[k].name,
    palace: dims[k].palace,
    score: dims[k].score,
    level: dims[k].level,
    reading: DIM_READINGS[k][dims[k].level],
    theory: DIM_READINGS[k].theory,
    isStrongest: k === strongestKey,
    isWeakest: k === weakestKey,
  }));

  return {
    total: Math.round(total * 10) / 10,
    episode,
    dims,
    dimDetail,
    archetypeId: best.id,
    causeKey,
  };
}

/** 组装返回给前端的完整结果对象（完整版内容默认全部返回）。 */
export function buildResult(answers) {
  const computed = computeResult(answers);
  const archetype = ARCHETYPES.find((a) => a.id === computed.archetypeId);
  const cause = CAUSES[computed.causeKey];

  const publicResult = {
    total: computed.total,
    episode: computed.episode,
    episodeLabel: computed.episode >= 76 ? '活到大结局' : computed.episode >= 60 ? '熬到了后半程' : computed.episode >= 40 ? '走到了中局' : computed.episode >= 20 ? '没能走过前半程' : '很早就出局了',
    cause: { key: computed.causeKey, title: cause.title, line: cause.line },
    archetype: {
      id: archetype.id,
      name: archetype.name,
      alias: archetype.alias,
      verdict: archetype.verdict,
      advantageTitle: archetype.advantageTitle,
      advantage: archetype.advantage,
      theory: archetype.theory,
      riskTitle: archetype.riskTitle,
      risk: archetype.risk,
      reality: archetype.reality,
      quote: archetype.quote,
      practice: archetype.practice,
    },
    dimDetail: computed.dimDetail,
    dims: computed.dims,
    shareText: `我在甄嬛传中活到第 ${computed.episode} 集。\n死因：${cause.title.replace('死于', '')}。\n原型：${archetype.name}型｜${archetype.alias}。\n你呢？`,
  };

  publicResult.full = {
    portrait: archetype.full.portrait,
    moments: archetype.full.moments,
    roles: archetype.full.roles,
    plan: archetype.full.plan,
    closing: archetype.full.closing,
    dimDetail: computed.dimDetail,
    weakestKey: computed.causeKey,
  };

  return publicResult;
}

export { QUESTION_BY_ID, QUESTIONS, TOTAL_QUESTIONS } from './questions.js';
