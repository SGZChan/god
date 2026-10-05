// What a champion's written character DOES in the world (the verbs of ai/intent.js, and the backstory days).
// stepBehaviour(ent, ctx) is called by Entity.layaRoutine between the cards: it either carries on an act in progress
// (walk to the victim, then do it) or starts one, and returns true when it used the turn.
//   ctx = { terrain, eco (ecosystem), civ, st (nearest settlement), anchor, go(x, y, state, text), near(x, y, r), people[] }
// Everything here changes real things: goods move from a victim's pockets or the town's stores to the champion, victims
// are persuaded (their faith and loyalties shift), thieves who are seen are marked CRIMINAL and the guards come, brawls
// hurt, teaching raises talents and the people's research, and so on.
import { BEHAVIOURS } from './intent.js';
import * as economy from '../civilization/economy.js';
import { random } from '../simulation/random.js';

const MAX_ACT_TURNS = 14; // a chase that takes longer than this is given up

// Backstories: what the day of such a person looks like. Each routine entry is a thing it may do instead of an ordinary round.
//   weight (of a roll), what: 'person' | 'sky' | 'building' | 'edge' | 'hall'; text lines
export const BACKSTORIES = {
  outsider: {
    pickers: [
      { w: 0.22, what: 'building', types: ['hut', 'tent', 'wooden_house', 'stone_house', 'market', 'workshop', 'farm', 'well', 'library', 'smithy', 'windmill', 'kiln'], text: b => `Marvelling at the ${b} (never seen the like)` },
      { w: 0.16, what: 'person', text: p => `Asking ${p.name} where on earth this is`, effect: 'tales' },
      { w: 0.12, what: 'sky', text: () => 'Staring at the sky, searching for a way home' },
      { w: 0.07, what: 'building', types: ['shrine', 'temple', 'cathedral'], text: () => 'Praying to be sent home' }
    ]
  },
  amnesiac: {
    pickers: [
      { w: 0.25, what: 'person', text: p => `Asking ${p.name} who they are` },
      { w: 0.15, what: 'sky', text: () => 'Trying to remember' }
    ]
  },
  exile: { pickers: [{ w: 0.3, what: 'edge', text: () => 'Keeping to the edge of the settlement, watching' }], avoidsPeople: true },
  noble: { pickers: [{ w: 0.25, what: 'building', types: ['hall', 'keep', 'manor', 'temple'], text: () => 'Surveying the household' }, { w: 0.15, what: 'person', text: p => `Expecting ${p.name} to serve`, effect: 'tribute' }] },
  veteran: { pickers: [{ w: 0.2, what: 'building', types: ['barracks', 'watchtower', 'keep'], text: () => 'Drilling out of old habit' }, { w: 0.1, what: 'edge', text: () => 'Standing watch, scanning the horizon' }] },
  orphan: { pickers: [{ w: 0.2, what: 'building', types: ['granary', 'market', 'market_stall', 'farm'], text: () => 'Keeping an eye out for scraps' }] }
};

const pick = list => list[Math.floor(random() * list.length)];
const nm = p => p.name || 'someone';

// Weighted choice among the champion's behaviours, damped by the day's other business
function choose(behaviours) {
  const total = behaviours.reduce((s, b) => s + b.w, 0);
  let r = random() * total;
  for (const b of behaviours) { r -= b.w; if (r <= 0) return b; }
  return behaviours[0];
}

// ---------- the acts ----------

function reputationHit(ent, ctx, victim, what, witnessRadius = 7) {
  // someone saw: the champion is marked a criminal (guards come), and the whole town hears of it
  const seen = ctx.people.some(e => e !== victim && e.alive && Math.hypot(e.x - ent.x, e.y - ent.y) < witnessRadius && random() < 0.55 - (ent.proficiencies ? ent.proficiencies.statesmanship / 400 : 0));
  if (!seen) return false;
  ent.notoriety = (ent.notoriety || 0) + 1;
  ent.crimeRecord = (ent.crimeRecord || 0) + 1;
  if (ent.role !== 'GUARD') ent.role = 'CRIMINAL';
  if (victim && victim.alive) victim.personality.agreeableness = Math.max(0, victim.personality.agreeableness - 0.03);
  ctx.eco.notifications.unshift({ text: `🕵️ ${ent.name} was caught ${what}${victim ? ' ' + nm(victim) : ''}!`, time: Date.now() });
  return true;
}

const ACTS = {
  // take goods from a person's pockets (or, failing that, the stores)
  steal(ent, ctx, victim) {
    const inv = victim ? victim.inventory : null;
    let item = inv ? Object.keys(inv).find(k => inv[k] >= 1) : null;
    let took = 0;
    let from = victim ? nm(victim) : 'the stores';
    if (item) took = economy.take(inv, item, Math.min(3, inv[item]));
    else if (ctx.st && ctx.st.stock) {
      item = Object.keys(ctx.st.stock).find(k => ctx.st.stock[k] >= 2 && k !== 'tools');
      if (item) { took = economy.take(ctx.st.stock, item, Math.min(4, ctx.st.stock[item])); from = 'the stores'; }
    }
    if (took > 0) {
      economy.add(ent.inventory, item, took);
      ent.loot = (ent.loot || 0) + took;
      ent.activity = `Slipped ${Math.round(took)} ${economy.itemName ? economy.itemName(item).toLowerCase() : item} from ${from}`;
      if (victim) victim.hunger = Math.min(100, victim.hunger + 4);
    } else ent.activity = victim ? `Found ${nm(victim)}'s pockets empty` : 'Nothing worth taking';
    reputationHit(ent, ctx, victim, 'stealing from', 7);
  },
  // sway someone: their faith and goodwill drift to the champion's wishes, and a favour is extracted
  manipulate(ent, ctx, victim) {
    if (!victim) return;
    const p = victim.personality;
    const skill = 0.5 + (ent.proficiencies ? ent.proficiencies.statesmanship / 200 : 0.25);
    const resist = p.openness * 0.3 + p.conscientiousness * 0.2;
    if (random() < skill - resist + 0.2) {
      p.piety += (ent.personality.piety - p.piety) * 0.25;
      p.agreeableness = Math.min(1, p.agreeableness + 0.02); // (they think it was their own idea)
      victim.manipulatedBy = ent.id;
      // the favour: a gift of food or goods, or a few hours of the victim's work for the champion
      const item = Object.keys(victim.inventory || {}).find(k => victim.inventory[k] >= 1);
      if (item) {
        const got = economy.take(victim.inventory, item, 1);
        economy.add(ent.inventory, item, got);
        ent.loot = (ent.loot || 0) + got;
        ent.activity = `Talked ${nm(victim)} out of some ${item}`;
      } else ent.activity = `Sweet-talked ${nm(victim)} into trusting them`;
      victim.activity = 'Won over by smooth words';
      ent.manipulated = (ent.manipulated || 0) + 1;
    } else {
      ent.activity = `${nm(victim)} saw through the act`;
      p.agreeableness = Math.max(0, p.agreeableness - 0.02);
      reputationHit(ent, ctx, victim, 'lying to', 5);
    }
  },
  brawl(ent, ctx, victim) {
    if (!victim) return;
    const dmg = 6 + (ent.proficiencies ? ent.proficiencies.warfare / 12 : 4);
    victim.health -= dmg;
    ent.health = Math.min(ent.maxHealth, ent.health) - 1;
    victim.activity = `Beaten up by ${ent.name}`;
    ent.activity = `Brawling with ${nm(victim)}`;
    ent.combat = { anim: 'attack', left: 0.5 };
    if (victim.health <= 0) { victim.health = 1; } // (a brawl, not a killing)
    reputationHit(ent, ctx, victim, 'beating up', 8);
  },
  // food and care for those in need
  charity(ent, ctx, victim) {
    if (!victim) return;
    const civ = ctx.civ;
    if (victim.hunger > 25 && civ && civ.food >= 1) { civ.food -= 1; victim.hunger = Math.max(0, victim.hunger - 40); ent.activity = `Feeding ${nm(victim)}`; }
    else { victim.health = Math.min(victim.maxHealth, victim.health + 12); ent.activity = `Tending ${nm(victim)}`; }
    victim.personality.agreeableness = Math.min(1, victim.personality.agreeableness + 0.01);
    victim.personality.piety = Math.min(1, victim.personality.piety + 0.01 * ent.personality.piety);
  },
  preach(ent, ctx, victim) {
    if (!victim) return;
    victim.personality.piety = Math.min(1, victim.personality.piety + 0.04 + 0.04 * ent.personality.piety);
    victim.belief = victim.determineBelief();
    ent.activity = `Preaching to ${nm(victim)}`;
  },
  teach(ent, ctx, victim) {
    if (!victim) return;
    const prof = victim.proficiencies;
    const best = Object.entries(ent.proficiencies || {}).sort((a, b) => b[1] - a[1])[0];
    if (best && prof) prof[best[0]] = Math.min(100, (prof[best[0]] || 0) + 2);
    if (ctx.civ) ctx.civ.techPoints += 1.5;
    ent.activity = `Teaching ${nm(victim)}${best ? ' ' + best[0] : ''}`;
  },
  gossip(ent, ctx, victim) {
    if (!victim) return;
    victim.personality.agreeableness = Math.max(0, victim.personality.agreeableness - 0.015);
    victim.personality.extraversion = Math.min(1, victim.personality.extraversion + 0.01);
    ent.activity = `Whispering rumours to ${nm(victim)}`;
  },
  court(ent, ctx, victim) {
    if (!victim) return;
    ent.activity = `Charming ${nm(victim)}`;
    victim.personality.extraversion = Math.min(1, victim.personality.extraversion + 0.01);
  },
  tales(ent, ctx, victim) {
    // knowledge from another world: the people learn a little (research) and the stranger learns the customs
    if (ctx.civ) ctx.civ.techPoints += 2.5;
    if (victim && victim.proficiencies) victim.proficiencies.science = Math.min(100, (victim.proficiencies.science || 0) + 1.5);
    ent.activity = victim ? `Telling ${nm(victim)} of wonders from another world` : 'Remembering home';
  },
  tribute(ent, ctx, victim) {
    if (!victim) return;
    const item = Object.keys(victim.inventory || {}).find(k => victim.inventory[k] >= 1);
    if (item) { economy.add(ent.inventory, item, economy.take(victim.inventory, item, 1)); ent.activity = `Accepting ${nm(victim)}'s tribute`; }
    else ent.activity = `Scolding ${nm(victim)} for the poor service`;
  }
};

// which people suit which act as a victim
const SUITS = {
  steal: p => (Object.values(p.inventory || {}).some(n => n >= 1) ? 3 : 1),
  manipulate: p => 1 + (p.personality.openness < 0.4 ? 0.5 : 0) + (Object.values(p.inventory || {}).some(n => n >= 1) ? 1 : 0),
  brawl: p => (p.role === 'SOLDIER' || p.role === 'GUARD' ? 0.2 : 1),
  charity: p => (p.hunger > 40 ? 4 : p.health < p.maxHealth * 0.8 ? 3 : 0.5),
  preach: p => 1 + (1 - p.personality.piety) * 2,
  teach: p => 1 + (p.age < 20 ? 1 : 0),
  gossip: () => 1, court: () => 1
};

function pickVictim(kind, ent, people) {
  const weights = people.map(p => Math.max(0, (SUITS[kind] || (() => 1))(p)) / (1 + Math.hypot(p.x - ent.x, p.y - ent.y) * 0.05));
  const total = weights.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return null;
  let r = random() * total;
  for (let i = 0; i < people.length; i++) { r -= weights[i]; if (r <= 0) return people[i]; }
  return people[people.length - 1];
}

const VERB_TEXT = {
  steal: p => `Stalking ${nm(p)} for a chance to steal`,
  manipulate: p => `Working on ${nm(p)}`,
  brawl: p => `Picking a fight with ${nm(p)}`,
  charity: p => `Going to help ${nm(p)}`,
  preach: p => `Going to preach to ${nm(p)}`,
  teach: p => `Going to teach ${nm(p)}`,
  gossip: p => `Sidling up to ${nm(p)} with news`,
  court: p => `Going to charm ${nm(p)}`
};

export function behavioursOf(ent) {
  return (ent.persona && ent.persona.behaviours) || [];
}
export function backstoriesOf(ent) {
  return (ent.persona && ent.persona.backstory) || [];
}

// Carries on or starts an act. Returns true when the turn was used.
export function stepBehaviour(ent, ctx, L) {
  const list = behavioursOf(ent).filter(b => BEHAVIOURS[b.id]);
  const stories = backstoriesOf(ent).filter(s => BACKSTORIES[s]);
  if (!list.length && !stories.length) return false;
  const byId = new Map(ctx.eco.entities.map(e => [e.id, e]));

  // an act already under way
  if (L.act) {
    const act = L.act;
    act.turns = (act.turns || 0) + 1;
    const victim = act.targetId ? byId.get(act.targetId) : null;
    if (act.kind === 'story') {
      if (act.turns > MAX_ACT_TURNS || !act.at) { L.act = null; return false; }
      if (ctx.near(act.at.x, act.at.y, act.what === 'sky' ? 99 : 3.2) || act.turns > 8) {
        ent.state = 'WORK'; ent.activity = act.text; ent.path = [];
        if (act.effect && ACTS[act.effect]) ACTS[act.effect](ent, ctx, victim && victim.alive ? victim : null);
        ent.actionCooldown = act.what === 'sky' ? 4 : 2.5;
        L.act = null;
        return true;
      }
      ctx.go(act.at.x, act.at.y, 'WORK', act.text);
      return true;
    }
    if (act.turns > MAX_ACT_TURNS || (act.targetId && (!victim || !victim.alive))) { L.act = null; return false; }
    if (!victim || Math.hypot(victim.x - ent.x, victim.y - ent.y) <= 2.2) {
      ent.state = 'WORK';
      ent.path = [];
      ent.actionCooldown = 1.8;
      ACTS[act.kind](ent, ctx, victim);
      ent.acts = (ent.acts || 0) + 1;
      L.act = null;
      return true;
    }
    ctx.go(victim.x, victim.y, 'WORK', VERB_TEXT[act.kind] ? VERB_TEXT[act.kind](victim) : 'On a mission');
    return true;
  }

  // a new one: how often depends on how strongly the champion is drawn to it (but life goes on between)
  const drive = list.reduce((s, b) => s + b.w, 0);
  const storyDrive = stories.length ? 0.4 : 0;
  if (random() > Math.min(0.92, 0.3 + drive * 0.4 + storyDrive * 0.4)) return false;
  const people = ctx.people;
  if (list.length && (!stories.length || random() < drive / (drive + storyDrive + 0.001))) {
    const b = choose(list);
    const victim = people.length ? pickVictim(b.id, ent, people) : null;
    // a thief with nobody around raids the stores
    if (!victim && b.id !== 'steal') return false;
    L.act = { kind: b.id, targetId: victim ? victim.id : null, turns: 0 };
    if (!victim && b.id === 'steal' && ctx.st) {
      L.act = { kind: 'story', what: 'building', at: { x: ctx.st.x, y: ctx.st.y }, text: 'Creeping toward the stores', effect: 'steal', targetId: null, turns: 0 };
    }
    return stepBehaviour(ent, ctx, L);
  }
  // otherwise one of the backstory's own routines
  const story = BACKSTORIES[pick(stories)];
  const total = story.pickers.reduce((s, x) => s + x.w, 0);
  let r = random() * total;
  let chosen = story.pickers[story.pickers.length - 1];
  for (const x of story.pickers) { r -= x.w; if (r <= 0) { chosen = x; break; } }
  let at = null; let victim = null; let text = '';
  if (chosen.what === 'person') {
    victim = people.length ? pick(people) : null;
    if (!victim) return false;
    at = { x: victim.x, y: victim.y }; text = chosen.text(victim);
  } else if (chosen.what === 'sky') {
    at = { x: ent.x, y: ent.y }; text = chosen.text();
  } else if (chosen.what === 'edge') {
    const a = random() * Math.PI * 2;
    const R = ctx.st && ctx.st.town ? Math.max(ctx.st.town.rx || 10, 10) + 6 : 22;
    at = { x: ctx.anchor.x + Math.cos(a) * R, y: ctx.anchor.y + Math.sin(a) * R }; text = chosen.text();
  } else {
    const rect = ctx.terrain.buildingsInRect(ctx.anchor.x - 24, ctx.anchor.y - 24, ctx.anchor.x + 24, ctx.anchor.y + 24).filter(b => b.progress >= 1 && chosen.types.includes(b.type));
    if (!rect.length) return false;
    const b = pick(rect);
    at = { x: b.x + b.w / 2, y: b.y + b.h + 0.6 };
    text = chosen.text(b.type.replace(/_/g, ' '));
  }
  L.act = { kind: 'story', what: chosen.what, at, text, effect: chosen.effect || null, targetId: victim ? victim.id : null, turns: 0 };
  return stepBehaviour(ent, ctx, L);
}
