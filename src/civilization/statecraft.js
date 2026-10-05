// Statecraft: how a people is governed, holds together, goes to war, and falls apart. A summary of what history
// teaches, reduced to a few variables per civilization:
//
//   legitimacy 0..100   how rightfully the ruler and state are seen. Fed by prosperity, victory, shared faith and
//                       a smooth succession; drained by famine, defeat, unrest, over-extension, war weariness and
//                       a disputed succession. Low legitimacy invites revolt, secession and coups.
//   unrest 0..1         discontent in the streets (also lowered by the guards and priests, see entity.js)
//   weariness 0..100    what a long war costs: grows while fighting and with losses, fades in peace; a weary people
//                       forces its rulers to make peace
//   grievance {civId}   remembered wrongs: raided towns, lost wars, a revolt. Grievance is the fuel of vengeance
//   ruler               an adult citizen picked by the government's custom (strongest warrior for a chieftain,
//                       the heir for a king, the most statesmanlike for a republic, the holiest for a theocracy)
//   rank                Tribe < Chiefdom < Kingdom < Empire, from size and settlements
//
// Wars start from MOTIVES (warMotive): resources a neighbour sits on, vengeance for grievances, faith, ambition of a
// strong state under a martial ruler, or a rally-round-the-flag war by a ruler whose legitimacy is failing.
// Decline: an over-extended or unjust state sheds its farthest towns (secession founds a NEW civilization with the
// people and knowledge that live there), and a hopeless ruler is overthrown (coup: the government changes).
//
//   tickStatecraft(society, civ, dt)   every STATE_TICK simulated seconds
//   warMotive(civ, other, terrain)     { reason, score } or null
//   rankOf(civ)                        'Tribe' | 'Chiefdom' | 'Kingdom' | 'Empire'
//   noteWarEnd(civ, foe, won)          bookkeeping when a war ends (called from society.endWar)
import { settlementsOf } from './settlements.js';
import { transferSettlement } from './expansion.js';
import { covetedDeposit } from './expansion.js';
import { Civilization, GOVERNMENTS } from './society.js';
import { random } from '../simulation/random.js';
import { ERAS } from './techTree.js';

export const STATE_TICK = 6;
const TITLES = { THEOCRACY: 'High Priest', MONARCHY: 'King', REPUBLIC: 'Consul', CHIEFTAINCY: 'Chieftain' };
const STATE_PREFIX = { THEOCRACY: 'Holy See of', MONARCHY: 'Kingdom of', REPUBLIC: 'Republic of', CHIEFTAINCY: 'Tribe of' };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function rankOf(civ) {
  const towns = settlementsOf(civ).length;
  const n = civ.citizens || 0;
  if (n >= 90 && towns >= 5) return 'Empire';
  if (n >= 35 && towns >= 2) return 'Kingdom';
  if (n >= 16) return 'Chiefdom';
  return 'Tribe';
}

export function titleOf(civ) {
  return TITLES[civ.government ? civ.government.id : 'CHIEFTAINCY'] || 'Leader';
}

function ensureState(civ) {
  if (civ.legitimacy === undefined) civ.legitimacy = 70;
  if (civ.weariness === undefined) civ.weariness = 0;
  if (!civ.grievance) civ.grievance = {};
  if (civ.rulerId === undefined) civ.rulerId = null;
  if (civ.stateTimer === undefined) civ.stateTimer = STATE_TICK;
}

export function addGrievance(civ, otherId, amount) {
  ensureState(civ);
  civ.grievance[otherId] = clamp((civ.grievance[otherId] || 0) + amount, 0, 100);
}

// ---------- the ruler ----------

function adultsOf(society, civ) {
  return society.ecosystem.entities.filter(e => e.alive && e.civilization === civ && e.isAdult && !e.isSpecialIndividual);
}

function pickRuler(society, civ, previousId) {
  const adults = adultsOf(society, civ);
  if (!adults.length) return { ruler: null, smooth: false };
  const gov = civ.government ? civ.government.id : 'CHIEFTAINCY';
  const score = e => {
    const p = e.proficiencies;
    if (gov === 'CHIEFTAINCY') return p.warfare * 1.2 + e.stats.sizeScale * 30 + (e.traits.aggression || 0) * 20;
    if (gov === 'THEOCRACY') return p.mysticism * 1.3 + p.statesmanship * 0.5 + (e.role === 'PRIEST' || e.job === 'priest' ? 40 : 0);
    if (gov === 'REPUBLIC') return p.statesmanship * 1.4 + p.science * 0.3 + e.personality.agreeableness * 20;
    return p.statesmanship + p.warfare * 0.4 + e.age * 0.3; // monarchy: an heir if there is one, else the most able noble
  };
  // a king is succeeded by his own child when there is one: a smooth succession
  if (gov === 'MONARCHY' && previousId) {
    const heirs = adults.filter(e => e.parents && e.parents.includes(previousId));
    if (heirs.length) return { ruler: heirs.sort((a, b) => b.age - a.age)[0], smooth: true };
  }
  adults.sort((a, b) => score(b) - score(a));
  return { ruler: adults[0], smooth: gov === 'REPUBLIC' }; // a republic's election is orderly
}

function tickRuler(society, civ) {
  const eco = society.ecosystem;
  let ruler = civ.rulerId ? eco.byId.get(civ.rulerId) : null;
  if (ruler && (!ruler.alive || ruler.civilization !== civ)) { civ.lastRulerId = ruler.id; ruler = null; }
  if (ruler) return ruler;
  const { ruler: next, smooth } = pickRuler(society, civ, civ.lastRulerId || null);
  if (!next) { civ.rulerId = null; return null; }
  const first = civ.rulerId === null && !civ.lastRulerId;
  civ.rulerId = next.id;
  if (!first) {
    civ.rulerSince = Math.round(eco.timeYears);
    if (smooth) {
      civ.legitimacy = Math.min(100, civ.legitimacy + 2);
    } else {
      // no heir, no election: rival claimants split the people
      civ.legitimacy = Math.max(0, civ.legitimacy - 14);
      civ.unrest = Math.min(1, (civ.unrest || 0) + 0.12);
      eco.notifications.unshift({ text: `👑 A disputed succession shakes ${civ.name}: ${next.name} takes the title of ${titleOf(civ)}.`, time: Date.now() });
    }
  }
  return next;
}

// ---------- war ----------

// Why would `civ` fight `other`? The strongest motive wins; null when it has none or fears the odds.
export function warMotive(civ, other, terrain) {
  ensureState(civ);
  if (civ.weariness > 35 || civ.legitimacy < 12) return null;
  const mine = Math.max(1, civ.militaryStrength || 1);
  const theirs = Math.max(1, other.militaryStrength || 1);
  const ratio = mine / theirs;
  const gov = civ.government ? civ.government.id : 'CHIEFTAINCY';
  const martial = gov === 'CHIEFTAINCY' ? 1 : gov === 'MONARCHY' ? 0.7 : gov === 'THEOCRACY' ? 0.5 : 0.3;
  const motives = [];
  const goal = terrain ? covetedDeposit(civ, other, terrain) : null;
  if (goal && ratio >= 1.2) motives.push({ reason: `War for the ${goal.type} of ${other.name}`, score: 0.12 + (ratio - 1) * 0.05, goal });
  const g = civ.grievance[other.id] || 0;
  if (g >= 35 && ratio >= 0.9) motives.push({ reason: `Vengeance for the wrongs done by ${other.name}`, score: g / 250 });
  const differentFaith = civ.faithId && other.faithId && civ.faithId !== other.faithId && Math.max(civ.piety, other.piety) > 60;
  if (differentFaith && ratio >= 0.9) motives.push({ reason: 'Holy Crusade over Heresy', score: 0.07 * (gov === 'THEOCRACY' ? 2 : 1) });
  if (ratio >= 1.6 && (civ.legitimacy > 45)) motives.push({ reason: `Conquest: ${civ.name} means to rule its neighbours`, score: 0.05 * martial * Math.min(3, ratio - 1) });
  // a failing ruler rallies the people against a foreign foe
  if (civ.legitimacy < 38 && ratio >= 1) motives.push({ reason: `A rally against ${other.name} to unite a restless people`, score: 0.1 });
  if (!motives.length) return null;
  motives.sort((a, b) => b.score - a.score);
  return motives[0];
}

// War ends: victory heals legitimacy, defeat wounds it and leaves a grievance; weariness lingers either way.
export function noteWarEnd(civ, foe, won) {
  ensureState(civ);
  if (won === true) civ.legitimacy = Math.min(100, civ.legitimacy + 10);
  else if (won === false) {
    civ.legitimacy = Math.max(0, civ.legitimacy - 16);
    addGrievance(civ, foe.id, 35);
  } else addGrievance(civ, foe.id, 8);
}

// ---------- decline ----------

const BREAKAWAY_COLORS = ['#e879f9', '#34d399', '#fb7185', '#a3e635', '#22d3ee', '#fbbf24', '#818cf8'];

// A far town breaks away and founds a NEW civilization with the people, buildings, knowledge and faith there
export function secede(society, civ, st) {
  const { terrain, ecosystem } = society;
  const gov = GOVERNMENTS[Math.floor(random() * GOVERNMENTS.length)];
  const nation = new Civilization({
    name: `${STATE_PREFIX[gov.id]} ${st.name}`,
    color: BREAKAWAY_COLORS[Math.floor(random() * BREAKAWAY_COLORS.length)],
    symbol: gov.icon,
    capitalX: st.x,
    capitalY: st.y,
    government: gov,
    population: 20
  });
  nation.era = civ.era;
  nation.techPoints = Math.floor(civ.techPoints * 0.85);
  nation.eraFloor = ERAS.findIndex(e => e.id === civ.era.id);
  nation.knownDeposits = (civ.knownDeposits || []).map(k => ({ ...k }));
  nation.discovered = [...(civ.discovered || [])];
  nation.explored = [...(civ.explored || [])];
  nation.output = { ...(civ.output || {}) };
  nation.faithId = civ.faithId;
  nation.piety = civ.piety;
  nation.legitimacy = 60;
  nation.truce = 40;
  st.capital = true;
  society.civilizations.push(nation);
  transferSettlement(society, civ, nation, st);
  // the land round the town goes with it
  civ.territory = civ.territory.filter(t => {
    if (Math.hypot(t.x - st.x, t.y - st.y) > 14) return true;
    const tile = terrain.getTile(t.x, t.y);
    if (tile) tile.civId = nation.id;
    nation.territory.push({ x: t.x, y: t.y });
    return false;
  });
  nation.capitalX = st.x;
  nation.capitalY = st.y;
  civ.diplomacy.set(nation.id, 'TENSION');
  nation.diplomacy.set(civ.id, 'TENSION');
  addGrievance(civ, nation.id, 55);
  civ.legitimacy = Math.max(0, civ.legitimacy - 8);
  civ.unrest = Math.max(0, (civ.unrest || 0) - 0.3);
  ecosystem.notifications.unshift({ text: `🔥 Revolt! ${st.name} broke away from ${civ.name} and founded ${nation.name}.`, time: Date.now() });
  return nation;
}

function tryRevolt(society, civ) {
  const towns = settlementsOf(civ);
  if (towns.length < 2 || civ.legitimacy > 30 || (civ.unrest || 0) < 0.4) return false;
  const cap = towns.find(s => s.capital) || towns[0];
  const rebels = towns
    .filter(s => s !== cap && (s.population || 0) >= 6 && Math.hypot(s.x - cap.x, s.y - cap.y) > 20)
    .sort((a, b) => Math.hypot(b.x - cap.x, b.y - cap.y) - Math.hypot(a.x - cap.x, a.y - cap.y));
  if (!rebels.length || random() > 0.2) return false;
  secede(society, civ, rebels[0]);
  return true;
}

// A hopeless ruler is overthrown: new government, new start (or a plain fall if the people want none)
function tryCoup(society, civ) {
  if (civ.legitimacy > 14 || (civ.unrest || 0) < 0.55 || random() > 0.25) return false;
  const old = civ.government;
  const options = GOVERNMENTS.filter(g => g.id !== old.id);
  civ.government = options[Math.floor(random() * options.length)];
  civ.legitimacy = 48;
  civ.unrest = Math.max(0, (civ.unrest || 0) - 0.4);
  civ.lastRulerId = civ.rulerId;
  civ.rulerId = null; // the new regime picks its own
  society.ecosystem.notifications.unshift({ text: `⚡ Revolution in ${civ.name}: the ${old.name} is overthrown and a ${civ.government.name} takes its place.`, time: Date.now() });
  return true;
}

// ---------- the tick ----------

export function tickStatecraft(society, civ, dt) {
  ensureState(civ);
  civ.stateTimer -= dt;
  if (civ.stateTimer > 0) return;
  const step = STATE_TICK;
  civ.stateTimer = STATE_TICK;
  const eco = society.ecosystem;
  tickRuler(society, civ);
  civ.rank = rankOf(civ);

  // a tribe that has grown into a realm of several towns stops being ruled by its strongest man alone
  if (civ.government && civ.government.id === 'CHIEFTAINCY' && civ.rank !== 'Tribe' && civ.rank !== 'Chiefdom' && random() < 0.2) {
    civ.government = GOVERNMENTS.find(g => g.id === 'MONARCHY') || civ.government;
    eco.notifications.unshift({ text: `👑 ${civ.name} has grown into a kingdom: its chieftain is crowned.`, time: Date.now() });
  }

  const towns = settlementsOf(civ);
  const atWar = Boolean(civ.warTarget);
  // war weariness: grows with every year of fighting and with the soldiers lost, fades in peace
  if (atWar) {
    const soldiers = civ.soldiers || 0;
    const lost = civ.warStartSoldiers ? Math.max(0, 1 - soldiers / civ.warStartSoldiers) : 0;
    civ.weariness = clamp(civ.weariness + step * (0.35 + lost * 1.2), 0, 100);
  } else civ.weariness = Math.max(0, civ.weariness - step * 0.5);
  if (atWar && civ.weariness > 70 && civ.warTimer > 20) {
    civ.endWar(eco, `war weariness: the people of ${civ.name} demand peace`, null);
  }
  for (const k of Object.keys(civ.grievance)) {
    civ.grievance[k] = Math.max(0, civ.grievance[k] - step * 0.12);
    if (civ.grievance[k] < 1) delete civ.grievance[k];
  }

  // legitimacy drifts toward what the state deserves
  const famine = civ.prosperity < 0.85 ? (0.85 - civ.prosperity) * 40 : 0;
  const overreach = Math.max(0, towns.length - (2 + (civ.citizens || 0) / 16));
  const sharedFaith = civ.faithId ? 6 : 0;
  const target = 58 + (civ.prosperity - 1) * 20 - famine - (civ.unrest || 0) * 20 - civ.weariness * 0.25 - overreach * 5 + sharedFaith + (civ.era && civ.era.id !== 'STONE_AGE' ? 4 : 0);
  civ.legitimacy = clamp(civ.legitimacy + (clamp(target, 0, 100) - civ.legitimacy) * 0.06, 0, 100);
  // unrest follows legitimacy and hunger; the guards' work (entity.js) pushes it back down
  const wantUnrest = clamp((1 - civ.legitimacy / 100) * 0.8 + famine / 80, 0, 1);
  civ.unrest = clamp((civ.unrest || 0) + (wantUnrest - (civ.unrest || 0)) * 0.08, 0, 1);

  if (!atWar) {
    if (!tryCoup(society, civ)) tryRevolt(society, civ);
  }
}
