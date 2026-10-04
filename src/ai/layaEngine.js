// Laya AI: the mind of champions created in the God Creation Workshop.
//
// Adapted from the architecture of Laya (https://github.com/aayushch/laya, Apache-2.0, by Aayush Chawla), an AI
// command center that turns incoming events into Action Cards a person approves. Laya's engine runs every event
// through `ingest -> rules -> router -> persona workers -> stager -> emit`, executes approved cards, learns from
// the user's corrections and keeps a rolling "Omni" summary. A champion runs the same pipeline, without an LLM
// (the game runs offline and must stay deterministic for saves), on what happens around them:
//
//   ingest   perceive world events near the champion (god powers, disasters, predators, raids, war, hunger, doubt,
//            its own wounds...)
//   rules    drop noise: events that already have an open card, or that the god recently dismissed
//   router   classify each event: which persona handles it and how urgent it is (P0 urgent .. P3 low)
//   workers  the persona drafts a response (Laya's Engineer/Comms/Ops/Sales/HR/Finance as Builder/Herald/
//            Warden/Envoy/Elder/Keeper)
//   stager   the draft becomes an Action Card { action, title, reason, persona, priority, score }
//   emit     up to MAX_OPEN_CARDS stay open; the god (player) can approve or dismiss them in the inspector
//   executor the champion acts on an approved card first; otherwise on its best card once that card has waited
//            AUTONOMY_DELAY decisions (P0 cards act at once)
//   learn    approvals and dismissals are corrections: the persona's trust weight goes up or down
//   omni     rolling summary in layers: Attention (now), Recent (last acts), Milestones (totals)
//
// All state lives in plain JSON on `entity.laya`, so it is saved with the creature.

export const PERSONAS = {
  builder: { name: 'Builder', from: 'Engineer', icon: '🏛️' },
  herald: { name: 'Herald', from: 'Comms', icon: '📯' },
  warden: { name: 'Warden', from: 'Ops', icon: '🛡️' },
  envoy: { name: 'Envoy', from: 'Sales', icon: '🕊️' },
  elder: { name: 'Elder', from: 'HR', icon: '🤝' },
  keeper: { name: 'Keeper', from: 'Finance', icon: '🌾' }
};

export const MAX_OPEN_CARDS = 5;
export const AUTONOMY_DELAY = 2;   // decisions an unapproved card waits before the champion acts on it alone
const AGING_PER_DECISION = 0.6;    // rank a waiting card gains per decision
const PERCEPTION = 7;              // tiles
const EVENT_MEMORY_YEARS = 6;      // world events older than this are no longer news
const DISMISS_MEMORY = 10;         // decisions a dismissed event stays ignored
const HANDLED_EVENT_MEMORY = 60;   // decisions a handled world event stays ignored (it is old news by then)
const HANDLED_CONDITION_MEMORY = 3; // decisions before an ongoing condition can be raised again
const WEIGHT_MIN = 0.4;
const WEIGHT_MAX = 2;

const dist = (a, x, y) => Math.hypot(a.x - x, a.y - y);

export function layaState(entity) {
  if (!entity.laya) {
    entity.laya = {
      seq: 0,
      cards: [],
      weights: Object.fromEntries(Object.keys(PERSONAS).map(p => [p, 1])),
      dismissed: {},        // event key -> decision seq until which it is ignored (dismissed or handled)
      recent: [],           // last executed card titles (Omni "Recent" layer)
      stats: { acts: 0, shrines: 0, converts: 0, healed: 0, threats: 0, peace: 0, food: 0, approvals: 0, dismissals: 0 }
    };
  }
  return entity.laya;
}

// ---------- ingest ----------

// Raw observations around the champion: { type, key, x, y, ... }
export function ingest(entity, world) {
  const events = [];
  const eco = world.ecosystem;
  const civ = entity.civilization;
  const near = world.grid ? world.grid.within(entity.x, entity.y, PERCEPTION) : world.entities.filter(e => dist(e, entity.x, entity.y) <= PERCEPTION);

  // God powers and natural disasters (the world event bus, god/events.js)
  const now = eco ? eco.timeYears || 0 : 0;
  for (const ev of (eco && eco.worldEvents) || []) {
    if (now - ev.time > EVENT_MEMORY_YEARS || dist(ev, entity.x, entity.y) > PERCEPTION + (ev.radius || 3) + 6) continue;
    events.push({ type: ev.kind, key: `we:${ev.id}`, name: ev.name, x: ev.x, y: ev.y, source: ev.source, magnitude: ev.magnitude || 0.5 });
  }

  // The champion's own danger comes first
  if (entity.health < entity.maxHealth * 0.4) events.push({ type: 'wounded', key: 'wounded', x: entity.x, y: entity.y });
  if (entity.hunger > 55) events.push({ type: 'hungry', key: 'hungry', x: entity.x, y: entity.y });

  let predator = null;
  let soldier = null;
  let suffering = 0;
  let doubters = 0;
  for (const e of near) {
    if (!e.alive || e === entity) continue;
    if (!e.isSapient) {
      if (e.traits && e.traits.carnivory > 0.6 && (!predator || dist(e, entity.x, entity.y) < dist(predator, entity.x, entity.y))) predator = e;
    } else if (civ && civ.warTarget && e.civilization === civ.warTarget && e.role === 'SOLDIER') {
      if (!soldier || dist(e, entity.x, entity.y) < dist(soldier, entity.x, entity.y)) soldier = e;
    } else if (!civ || e.civilization === civ) {
      if (e.hunger > 60 || e.health < e.maxHealth * 0.5) suffering++;
      if (e.belief && e.belief.status === 'ATHEIST_HERETIC') doubters++;
    }
  }
  if (predator) events.push({ type: 'threat', key: `threat:${predator.id}`, name: predator.species ? predator.species.name : 'predator', targetId: predator.id, x: predator.x, y: predator.y });
  if (soldier) events.push({ type: 'raid', key: `raid:${soldier.id}`, name: soldier.civilization.name, targetId: soldier.id, x: soldier.x, y: soldier.y });
  if (suffering > 0) events.push({ type: 'suffering', key: 'suffering', count: suffering, x: entity.x, y: entity.y });
  if (doubters > 0) events.push({ type: 'doubt', key: 'doubt', count: doubters, x: entity.x, y: entity.y });

  if (civ && civ.isAlive) {
    if (civ.warTarget) events.push({ type: 'war', key: `war:${civ.warTarget.id}`, name: civ.warTarget.name });
    if (civ.famineTimer > 0 || civ.food < Math.max(20, civ.citizens * 3)) events.push({ type: 'shortage', key: 'shortage', food: Math.round(civ.food) });
  }
  const terrain = world.terrain;
  if (terrain && terrain.buildingsInRect) {
    let shrine = false;
    for (const b of terrain.buildingsInRect(entity.x - 8, entity.y - 8, entity.x + 8, entity.y + 8)) if (b.type === 'shrine' || b.type === 'temple') shrine = true;
    if (!shrine) events.push({ type: 'noShrine', key: 'noShrine', x: entity.x, y: entity.y });
  }
  return events;
}

// ---------- rules ----------

export function applyRules(state, events) {
  const open = new Set(state.cards.map(c => c.key));
  return events.filter(ev => !open.has(ev.key) && !(state.dismissed[ev.key] > state.seq));
}

// ---------- router ----------

// Which persona handles the event, and how urgent it is (0 = urgent .. 3 = low)
export function route(ev, entity) {
  const p = entity.personality || {};
  switch (ev.type) {
    case 'wounded': return { persona: 'herald', priority: 0 };
    case 'hungry': return { persona: 'keeper', priority: 0 };
    case 'threat': return { persona: 'warden', priority: 0 };
    case 'raid': return { persona: 'envoy', priority: 0 };
    case 'disaster':
    case 'curse': return { persona: 'elder', priority: ev.magnitude > 0.6 ? 0 : 1 };
    case 'blessing':
    case 'miracle': return { persona: 'herald', priority: 2 };
    case 'omen': return { persona: 'herald', priority: 3 };
    case 'war': return { persona: 'envoy', priority: 1 };
    case 'suffering': return { persona: 'elder', priority: ev.count >= 3 ? 1 : 2 };
    case 'doubt': return { persona: 'herald', priority: ev.count >= 3 ? 1 : 2 };
    case 'shortage': return { persona: 'keeper', priority: 1 };
    case 'noShrine': return { persona: 'builder', priority: (p.piety || 0) > 0.8 ? 2 : 3 };
    default: return null;
  }
}

// ---------- persona workers + stager ----------

// How well suited the champion is to a persona's work (0..~2)
export function aptitude(persona, entity) {
  const p = entity.personality || {};
  const t = entity.proficiencies || {};
  const v = (x, d = 0.5) => (Number.isFinite(x) ? x : d);
  switch (persona) {
    case 'builder': return v(p.conscientiousness) * 0.6 + v(t.architecture, 50) / 100 * 0.8;
    case 'herald': return v(p.piety) * 0.6 + v(p.extraversion) * 0.4 + v(t.mysticism, 50) / 200;
    case 'warden': return v(t.warfare, 50) / 100 + (1 - v(p.agreeableness)) * 0.3;
    case 'envoy': return v(t.statesmanship, 50) / 100 + v(p.agreeableness) * 0.4;
    case 'elder': return v(p.agreeableness) * 0.8 + v(p.conscientiousness) * 0.2;
    case 'keeper': return v(t.farming, 50) / 100 + v(p.conscientiousness) * 0.3;
    default: return 0.5;
  }
}

const DRAFTS = {
  wounded: () => ({ action: 'CommuneWithGod', title: 'Pray for strength', reason: 'Badly wounded' }),
  hungry: () => ({ action: 'Eat', title: 'Eat a meal', reason: 'Hungry' }),
  threat: ev => ({ action: 'RepelThreat', title: `Drive off the ${ev.name}`, reason: 'A predator stalks the people' }),
  raid: ev => ({ action: 'SeekPeace', title: `Call ${ev.name}'s soldiers to a truce`, reason: 'Enemy soldiers are near' }),
  disaster: ev => ({ action: 'TendThePeople', title: `Aid the victims of the ${ev.name}`, reason: 'Calamity struck nearby' }),
  curse: ev => ({ action: 'TendThePeople', title: `Comfort those hit by the ${ev.name}`, reason: 'The heavens turned against us' }),
  blessing: ev => ({ action: 'ProclaimDivineProphecy', title: `Proclaim the ${ev.name}`, reason: 'A blessing must be shared' }),
  miracle: ev => ({ action: 'ProclaimDivineProphecy', title: `Bear witness to the ${ev.name}`, reason: 'The Creator has shown a sign' }),
  omen: ev => ({ action: 'CommuneWithGod', title: `Read the omen: ${ev.name}`, reason: 'A sign needs interpreting' }),
  war: ev => ({ action: 'SeekPeace', title: `Seek peace with ${ev.name}`, reason: 'War bleeds the people' }),
  suffering: ev => ({ action: 'TendThePeople', title: `Tend ${ev.count} hungry or hurt`, reason: 'People nearby are suffering' }),
  doubt: ev => ({ action: 'ProclaimDivineProphecy', title: `Preach to ${ev.count} doubter${ev.count > 1 ? 's' : ''}`, reason: 'Faith is wavering' }),
  shortage: ev => ({ action: 'GatherProvisions', title: 'Gather provisions for the stores', reason: `Food stores are low (${ev.food})` }),
  noShrine: () => ({ action: 'ErectHolySanctuary', title: 'Raise a shrine here', reason: 'No holy place within reach' })
};

export function stage(ev, routed, entity, state) {
  const draft = DRAFTS[ev.type](ev);
  const weight = state.weights[routed.persona] || 1;
  return {
    id: `c${state.seq}_${ev.key}`,
    key: ev.key,
    persona: routed.persona,
    priority: routed.priority,
    ...draft,
    x: ev.x !== undefined ? ev.x : entity.x,
    y: ev.y !== undefined ? ev.y : entity.y,
    targetId: ev.targetId || null,
    createdAt: state.seq,
    approved: false,
    score: Math.round(((4 - routed.priority) + aptitude(routed.persona, entity)) * weight * 100) / 100
  };
}

// ---------- emit ----------

export function emit(state, cards) {
  state.cards.push(...cards);
  state.cards.sort((a, b) => (b.approved - a.approved) || b.score - a.score);
  if (state.cards.length > MAX_OPEN_CARDS) state.cards.length = MAX_OPEN_CARDS;
}

// ---------- executor ----------

// Approved cards first; otherwise the best ready card, where waiting raises a card's rank so a stream of
// repeating events cannot starve an older one.
export function pickCard(state) {
  const approved = state.cards.find(c => c.approved);
  if (approved) return approved;
  let best = null;
  let bestRank = -Infinity;
  for (const c of state.cards) {
    const age = state.seq - c.createdAt;
    if (c.priority !== 0 && age < AUTONOMY_DELAY) continue;
    const rank = c.score + AGING_PER_DECISION * age + (c.priority === 0 ? 10 : 0) + (c.key === 'wounded' ? 10 : 0);
    if (rank > bestRank) {
      best = c;
      bestRank = rank;
    }
  }
  return best;
}

// ---------- learn (the god's corrections) ----------

export function approveCard(entity, cardId) {
  const state = layaState(entity);
  const card = state.cards.find(c => c.id === cardId);
  if (!card) return false;
  card.approved = true;
  state.weights[card.persona] = Math.min(WEIGHT_MAX, (state.weights[card.persona] || 1) * 1.12);
  state.stats.approvals++;
  emit(state, []);
  return true;
}

// Decrees: orders the god gives directly. Each becomes an approved Action Card, so it is carried out next.
export const DECREES = {
  shrine: { persona: 'builder', action: 'ErectHolySanctuary', title: 'Raise a shrine (decree)' },
  preach: { persona: 'herald', action: 'ProclaimDivineProphecy', title: 'Preach to the people (decree)' },
  tend: { persona: 'elder', action: 'TendThePeople', title: 'Tend the hungry and hurt (decree)' },
  peace: { persona: 'envoy', action: 'SeekPeace', title: 'Seek peace (decree)' },
  gather: { persona: 'keeper', action: 'GatherProvisions', title: 'Gather provisions (decree)' },
  pray: { persona: 'herald', action: 'CommuneWithGod', title: 'Commune with me (decree)' }
};

export function issueDecree(entity, decreeId) {
  const decree = DECREES[decreeId];
  if (!decree) return null;
  const state = layaState(entity);
  const card = {
    id: `d${state.seq}_${decreeId}_${state.cards.length}`,
    key: `decree:${decreeId}:${state.seq}`,
    persona: decree.persona,
    priority: 0,
    action: decree.action,
    title: decree.title,
    reason: 'Ordered by the Creator',
    x: entity.x,
    y: entity.y,
    targetId: null,
    createdAt: state.seq,
    approved: true,
    score: 99
  };
  state.cards = state.cards.filter(c => !c.key.startsWith(`decree:${decreeId}:`));
  state.cards.unshift(card);
  if (state.cards.length > MAX_OPEN_CARDS) state.cards.length = MAX_OPEN_CARDS;
  state.stats.decrees = (state.stats.decrees || 0) + 1;
  return card;
}

export function dismissCard(entity, cardId) {
  const state = layaState(entity);
  const i = state.cards.findIndex(c => c.id === cardId);
  if (i < 0) return false;
  const [card] = state.cards.splice(i, 1);
  state.weights[card.persona] = Math.max(WEIGHT_MIN, (state.weights[card.persona] || 1) * 0.88);
  state.dismissed[card.key] = state.seq + DISMISS_MEMORY;
  state.stats.dismissals++;
  return true;
}

// ---------- omni ----------

export function omni(entity) {
  const state = layaState(entity);
  const s = state.stats;
  const top = state.cards[0];
  const milestones = [
    s.shrines && `${s.shrines} shrine${s.shrines > 1 ? 's' : ''} raised`,
    s.converts && `${s.converts} converted`,
    s.healed && `${s.healed} tended`,
    s.threats && `${s.threats} foe${s.threats > 1 ? 's' : ''} defeated`,
    s.peace && `${s.peace} peace${s.peace > 1 ? 's' : ''} brokered`,
    s.food && `${Math.round(s.food)} food gathered`
  ].filter(Boolean);
  return {
    attention: top ? `${PERSONAS[top.persona].icon} ${top.title}` : 'All is calm',
    recent: state.recent.slice(0, 3),
    milestones: milestones.length ? milestones.join(' • ') : 'No deeds yet'
  };
}

// ---------- the whole pipeline ----------

export class LayaEngine {
  // One decision: run the pipeline, return what to do now.
  evaluate(entity, worldContext) {
    const state = layaState(entity);
    state.seq++;
    for (const [key, until] of Object.entries(state.dismissed)) if (until <= state.seq) delete state.dismissed[key];

    const fresh = applyRules(state, ingest(entity, worldContext));
    const staged = [];
    for (const ev of fresh) {
      const routed = route(ev, entity);
      if (routed) staged.push(stage(ev, routed, entity, state));
    }
    emit(state, staged);

    const card = pickCard(state);
    if (card) {
      state.cards.splice(state.cards.indexOf(card), 1);
      // Handled: a world event is done with; an ongoing condition (hunger, doubt, no shrine...) may come back later
      state.dismissed[card.key] = state.seq + (card.key.startsWith('we:') ? HANDLED_EVENT_MEMORY : HANDLED_CONDITION_MEMORY);
    }
    const p = entity.personality || { piety: 0.5, openness: 0.5 };
    const chosen = card || (p.piety > 0.6
      ? { action: 'CommuneWithGod', title: 'Commune with the Creator', reason: 'A quiet hour of prayer', persona: 'herald' }
      : { action: 'PonderCosmicMysteries', title: 'Ponder the stars', reason: 'Nothing presses; time to think', persona: 'builder' });

    return {
      action: chosen.action,
      reason: chosen.reason,
      title: chosen.title,
      card: card || null,
      persona: chosen.persona,
      scores: ratings(entity),
      judgments: judgments(entity)
    };
  }
}

// Continuous rubrics [0..1] shown in the inspector
export function ratings(entity) {
  const p = entity.personality || {};
  const t = entity.proficiencies || {};
  const leadership = Math.min(1, (p.extraversion || 0.5) * 0.6 + (t.statesmanship || 50) / 160);
  return {
    piety: Math.round(Math.min(1, (p.piety || 0.5) * 0.9 + (t.mysticism || 50) / 200) * 100) / 100,
    heroism: Math.round(Math.min(1, (1 - (p.neuroticism || 0.5)) * 0.5 + (t.warfare || 50) / 150) * 100) / 100,
    leadership: Math.round(leadership * 100) / 100
  };
}

// Deterministic yes/no judgments
export function judgments(entity) {
  const p = entity.personality || {};
  const t = entity.proficiencies || {};
  return {
    willDefyMortalKing: p.piety > 0.7 && p.agreeableness < 0.4,
    readyForSelfSacrifice: p.agreeableness > 0.7 && p.piety > 0.65,
    hasReceivedDivineVision: p.piety > 0.85 || t.mysticism > 75
  };
}

export const layaEngine = new LayaEngine();
