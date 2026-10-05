// A champion's temperament: the seven vices (sliders 0..1) and a free-text description of who they are.
//   VICES                 pride, greed, lust, envy, gluttony, wrath, sloth, with what each does to the Laya mind
//   interpret(text)       reads a description ("a vain, greedy merchant-king who loves feasts") by keyword and returns the
//                         changes it implies to vices, personality, talents and interests (tags); this is what the workshop's
//                         "Let Laya read this" button applies to the sliders
//   interests(entity)     what a champion likes to spend a day on: building types and how much it seeks company, from the
//                         tags and vices (used by Entity.layaRoutine)
//   cardBias(persona, e)  how the vices tilt the score of an Action Card of each persona (used by layaEngine.stage)
import { parseIntent } from './intent.js';

export const VICES = [
  { id: 'pride', label: 'Pride', hint: 'seeks the crowd, preaches and commands; never sues for peace' },
  { id: 'greed', label: 'Greed', hint: 'haunts markets and stores, hoards, takes more than its share' },
  { id: 'lust', label: 'Lust', hint: 'courts and lingers with company, seeks mates' },
  { id: 'envy', label: 'Envy', hint: 'watches the houses and goods of others, sulks and lingers near them' },
  { id: 'gluttony', label: 'Gluttony', hint: 'eats long before hungry, feasts at the stores and taverns' },
  { id: 'wrath', label: 'Wrath', hint: 'quick to fight, drawn to soldiers and war, short on mercy' },
  { id: 'sloth', label: 'Sloth', hint: 'rests, loafs, and is slow to answer any card' }
];
export const VICE_IDS = VICES.map(v => v.id);

export function blankVices() { return Object.fromEntries(VICE_IDS.map(v => [v, 0.1])); }

// word fragments -> deltas. Matching is by substring on the lower-cased description, a negation ("not", "never", "no")
// right before a word flips the sign of its deltas.
const LEXICON = [
  { words: ['proud', 'vain', 'arrogant', 'haughty', 'narcissis', 'regal', 'king', 'queen', 'emperor', 'tyrant'], vices: { pride: 0.5 }, personality: { extraversion: 0.15 } },
  { words: ['greedy', 'avaric', 'miser', 'merchant', 'trader', 'wealth', 'rich', 'hoard', 'gold', 'thief'], vices: { greed: 0.5 }, tags: ['trade'] },
  { words: ['lust', 'seduc', 'romantic', 'lover', 'charming', 'flirt', 'passion'], vices: { lust: 0.5 }, personality: { extraversion: 0.2 }, tags: ['social'] },
  { words: ['jealous', 'envious', 'covet', 'resent', 'bitter'], vices: { envy: 0.5 }, personality: { agreeableness: -0.2 } },
  { words: ['glutton', 'feast', 'foodie', 'drunk', 'drinker', 'ale', 'wine', 'fat', 'hedonist', 'indulgen'], vices: { gluttony: 0.5 }, tags: ['tavern'] },
  { words: ['wrath', 'angry', 'furious', 'violent', 'brutal', 'cruel', 'ruthless', 'savage', 'temper', 'bloodthirst', 'vengeful'], vices: { wrath: 0.5 }, personality: { agreeableness: -0.3 }, tags: ['war'] },
  { words: ['lazy', 'slothful', 'idle', 'sleepy', 'languid', 'carefree', 'easygoing'], vices: { sloth: 0.5 }, personality: { conscientiousness: -0.3 } },
  { words: ['warrior', 'soldier', 'general', 'knight', 'fighter', 'conqueror', 'warlord', 'brave', 'battle'], proficiencies: { warfare: 30 }, personality: { agreeableness: -0.1 }, tags: ['war'] },
  { words: ['builder', 'architect', 'engineer', 'mason', 'craft', 'smith', 'inventor'], proficiencies: { architecture: 30, science: 10 }, personality: { conscientiousness: 0.2 }, tags: ['build'] },
  { words: ['scholar', 'sage', 'wise', 'scientist', 'curious', 'studious', 'bookish', 'philosoph', 'astronom'], proficiencies: { science: 30 }, personality: { openness: 0.3 }, tags: ['learn'] },
  { words: ['farmer', 'gardener', 'shepherd', 'herder', 'harvest', 'peasant', 'agrarian'], proficiencies: { farming: 30 }, tags: ['farm'] },
  { words: ['priest', 'prophet', 'holy', 'pious', 'devout', 'saint', 'faithful', 'monk', 'mystic', 'zealot'], proficiencies: { mysticism: 30 }, personality: { piety: 0.3 }, tags: ['pray'] },
  { words: ['atheist', 'heretic', 'skeptic', 'sceptic', 'doubter', 'blasphem'], personality: { piety: -0.4 } },
  { words: ['diplomat', 'statesman', 'ruler', 'leader', 'politician', 'orator', 'negotiat', 'peacemaker'], proficiencies: { statesmanship: 30 }, personality: { extraversion: 0.2, agreeableness: 0.1 }, tags: ['social'] },
  { words: ['kind', 'gentle', 'compassion', 'caring', 'merciful', 'generous', 'healer', 'humble', 'loving'], personality: { agreeableness: 0.35 }, vices: { wrath: -0.3, greed: -0.3, pride: -0.3 }, tags: ['care'] },
  { words: ['hermit', 'loner', 'shy', 'reclusive', 'solitary', 'introvert', 'quiet'], personality: { extraversion: -0.4 }, tags: ['alone'] },
  { words: ['sociable', 'friendly', 'outgoing', 'party', 'popular', 'gregarious'], personality: { extraversion: 0.3 }, tags: ['social'] },
  { words: ['hardworking', 'diligent', 'disciplined', 'dutiful', 'industrious', 'workaholic'], personality: { conscientiousness: 0.3 }, vices: { sloth: -0.3 } },
  { words: ['anxious', 'nervous', 'paranoid', 'fearful', 'timid', 'cowardly'], personality: { neuroticism: 0.3 } },
  { words: ['calm', 'stoic', 'serene', 'fearless'], personality: { neuroticism: -0.3 } },
  { words: ['explorer', 'wanderer', 'adventur', 'traveller', 'traveler', 'nomad'], personality: { openness: 0.25 }, tags: ['roam'] },
  { words: ['hunter', 'ranger', 'huntress'], proficiencies: { warfare: 15, farming: 10 }, tags: ['roam'] }
];

const NEGATORS = ['not ', 'never ', 'no ', 'non-', 'without ', "isn't ", "n't "];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// -> { vices, personality, proficiencies, tags, matched } (deltas; vices/personality in 0..1 units, talents in points)
export function interpret(text) {
  const out = { vices: {}, personality: {}, proficiencies: {}, tags: [], matched: [] };
  const t = ` ${String(text || '').toLowerCase()}`;
  for (const entry of LEXICON) {
    for (const w of entry.words) {
      // a word starts at a word boundary; short ones must be the whole word ("ale" is not "female")
      const m = new RegExp(`(?:^|[^a-z])${w.replace(/[-]/g, '\\-')}${w.length >= 4 ? '' : '(?![a-z])'}`).exec(t);
      if (!m) continue;
      const at = m.index + (m[0].length - w.length);
      const before = t.slice(Math.max(0, at - 9), at);
      const sign = NEGATORS.some(n => before.endsWith(n) || before.includes(n)) ? -1 : 1;
      for (const [k, d] of Object.entries(entry.vices || {})) out.vices[k] = (out.vices[k] || 0) + d * sign;
      for (const [k, d] of Object.entries(entry.personality || {})) out.personality[k] = (out.personality[k] || 0) + d * sign;
      for (const [k, d] of Object.entries(entry.proficiencies || {})) out.proficiencies[k] = (out.proficiencies[k] || 0) + d * sign;
      if (sign > 0) for (const g of entry.tags || []) if (!out.tags.includes(g)) out.tags.push(g);
      out.matched.push(w.trim());
      break; // one hit per group of synonyms
    }
  }
  return out;
}

// Applies an interpretation to a champion config (vices, personality, proficiencies, persona) and returns what changed.
export function applyInterpretation(config, text) {
  const r = interpret(text);
  const intent = parseIntent(text);
  config.vices = { ...blankVices(), ...(config.vices || {}) };
  for (const [k, d] of Object.entries(r.vices)) config.vices[k] = clamp(Math.round((config.vices[k] + d) * 20) / 20, 0, 1);
  for (const [k, d] of Object.entries(r.personality)) if (k in config.personality) config.personality[k] = clamp(Math.round((config.personality[k] + d) * 20) / 20, 0, 1);
  for (const [k, d] of Object.entries(r.proficiencies)) if (k in config.proficiencies) config.proficiencies[k] = clamp(Math.round((config.proficiencies[k] + d) / 5) * 5, 0, 100);
  for (const [k, d] of Object.entries(intent.stats.personality)) if (k in config.personality) config.personality[k] = clamp(Math.round((config.personality[k] + d) * 20) / 20, 0, 1);
  for (const [k, d] of Object.entries(intent.stats.proficiencies)) if (k in config.proficiencies) config.proficiencies[k] = clamp(Math.round((config.proficiencies[k] + d) / 5) * 5, 0, 100);
  if (intent.gender) config.gender = intent.gender;
  if (intent.name) config.name = intent.name;
  config.persona = { text: String(text || ''), tags: r.tags, behaviours: intent.behaviours, backstory: intent.backstory, summary: intent.summary };
  r.intent = intent;
  return r;
}

// ---------- used by the Laya mind ----------

const TAG_BUILDINGS = {
  trade: ['market', 'market_stall', 'dock'],
  tavern: ['tavern', 'granary', 'farm'],
  war: ['barracks', 'watchtower', 'keep', 'wall_tower'],
  build: ['workshop', 'smithy', 'kiln', 'quarry', 'lumber_camp'],
  learn: ['library', 'workshop'],
  farm: ['farm', 'pen', 'granary', 'well'],
  pray: ['shrine', 'temple', 'cathedral', 'graveyard', 'barrow'],
  care: ['healers_hut', 'infirmary', 'hospital', 'well'],
  roam: [],
  social: ['market', 'tavern', 'hall'],
  alone: []
};
const VICE_BUILDINGS = {
  greed: ['market', 'market_stall', 'granary'],
  gluttony: ['granary', 'tavern', 'farm', 'market'],
  envy: ['manor', 'stone_house', 'wooden_house', 'market'],
  wrath: ['barracks', 'watchtower'],
  pride: ['hall', 'keep', 'temple', 'cathedral']
};

// { want: { buildingType: weight }, company: 0..1+ (appetite for people), idle: 0..1 (loafing), roam: 0..1, appetite: hunger level at which it eats }
export function interests(entity) {
  const v = entity.vices || {};
  const p = entity.personality || {};
  const tags = (entity.persona && entity.persona.tags) || [];
  const want = {};
  const add = (types, w) => { for (const t of types) want[t] = (want[t] || 0) + w; };
  for (const g of tags) add(TAG_BUILDINGS[g] || [], 1);
  for (const [vice, types] of Object.entries(VICE_BUILDINGS)) add(types, (v[vice] || 0) * 1.5);
  const company = clamp(0.5 + (v.lust || 0) * 0.8 + (v.pride || 0) * 0.4 + ((p.extraversion || 0.5) - 0.5) * 0.8 + (tags.includes('social') ? 0.3 : 0) - (tags.includes('alone') ? 0.6 : 0) - ((entity.persona && entity.persona.backstory || []).includes('exile') ? 0.3 : 0), 0.05, 1.6);
  return {
    want,
    company,
    idle: clamp((v.sloth || 0) * 0.85 - (p.conscientiousness || 0.5) * 0.2, 0, 0.8),
    roam: clamp(tags.includes('roam') ? 0.5 : 0.1 + ((p.openness || 0.5) - 0.5) * 0.3, 0, 0.7),
    appetite: Math.round(55 - (v.gluttony || 0) * 38)
  };
}

// Score multiplier for an Action Card of `persona`, from the vices
export function cardBias(persona, entity) {
  const v = entity.vices;
  if (!v) return 1;
  let b = 1 - (v.sloth || 0) * 0.4;
  switch (persona) {
    case 'warden': b += (v.wrath || 0) * 0.5; break;
    case 'envoy': b -= (v.wrath || 0) * 0.35 + (v.pride || 0) * 0.2; break;
    case 'herald': b += (v.pride || 0) * 0.35; break;
    case 'keeper': b += (v.gluttony || 0) * 0.3 + (v.greed || 0) * 0.25; break;
    case 'builder': b += (v.pride || 0) * 0.15 - (v.sloth || 0) * 0.1; break;
    case 'elder': b -= (v.wrath || 0) * 0.3 + (v.greed || 0) * 0.2 + (v.envy || 0) * 0.1; break;
    default: break;
  }
  return Math.max(0.2, b);
}

// A short line for the inspector: the strongest vices
export function dominantVices(entity, min = 0.55) {
  const v = entity.vices || {};
  return VICES.filter(x => (v[x.id] || 0) >= min).sort((a, b) => v[b.id] - v[a.id]).map(x => x.label);
}
