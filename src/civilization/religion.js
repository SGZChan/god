// Religions (roadmap sub-project 4). Mortals never learn that the player exists. Following the cognitive science of
// religion, people over-detect agency behind striking events and remember "minimally counterintuitive" agents: a
// deity is an ordinary kind of person with ONE impossible trait, put in charge of the domain of the event that made
// people think of it.
//
//   - A people's first deity comes from its surroundings (the founding clan looks at the sun, the sea, the forest...).
//   - Every world event (god powers and natural disasters, see god/events.js) near a clan is interpreted: as the work
//     of a deity it already has for that domain (faith grows), or as the sign of a new deity (added to the pantheon),
//     or, for a clan without a faith, as the founding revelation of a new religion.
//   - Faith spreads by contact (people meet, the more devout one may convert the other; priests are persuasive),
//     children grow up in their clan's faith, priests lead rites at shrines and temples.
//   - A large, old religion spread over several clans can split: the least devout clan founds a reformed sect.
//   - Different faiths between neighbouring peoples feed holy wars (society.js evaluateDiplomacy).
//
// State (plain JSON, saved with the planet):
//   society.religions = [{ id, name, color, deities:[{ name, title, domain, trait, origin }], founderClanId, civId,
//                          parentId, founded, fervor, adherents, extinct }]
//   society.faithSeq
//   entity.faithId, clan.beliefs = { religionId, lastEventSeq }, settlement.faithId, civ.faithId
import { random } from '../simulation/random.js';
import { makeName } from '../life/names.js';
import { settlementsOf } from './settlements.js';
import { BUILDING_TYPES } from '../world/buildings.js';

export const DOMAINS = {
  sky: { title: 'of the Sky', symbol: '☀️' },
  storm: { title: 'of Storms', symbol: '⛈️' },
  sea: { title: 'of the Waters', symbol: '🌊' },
  earth: { title: 'of the Deep Earth', symbol: '⛰️' },
  fire: { title: 'of Fire', symbol: '🔥' },
  harvest: { title: 'of the Harvest', symbol: '🌾' },
  healing: { title: 'of Healing', symbol: '🌿' },
  plague: { title: 'of Pestilence', symbol: '🦠' },
  death: { title: 'of the Dead', symbol: '💀' },
  beasts: { title: 'of Beasts', symbol: '🐺' },
  forest: { title: 'of the Forest', symbol: '🌲' },
  stars: { title: 'of the Stars', symbol: '✨' }
};

// The one impossible thing about each deity (what makes it memorable)
export const TRAITS = [
  'sees through every wall', 'was never born', 'sleeps inside the mountain', 'speaks only through animals',
  'is in every hearth at once', 'dies each winter and returns in spring', 'casts no shadow', 'remembers every name',
  'weeps the rivers', 'walks the sky at night', 'eats nothing but songs', 'can be wounded only by kindness',
  'lives in the first tree', 'hears every promise', 'breathes the wind'
];

const COLORS = ['#f59e0b', '#38bdf8', '#a855f7', '#22c55e', '#ef4444', '#eab308', '#14b8a6', '#ec4899', '#6366f1', '#f97316'];
const FAITH_TICK = 2;            // simulated seconds between religion updates of a civilization
const EVENT_RANGE = 30;          // tiles: how far from a settlement an event is noticed
const MAX_PANTHEON = 4;
const SCHISM_MIN_ADHERENTS = 10;
const SCHISM_MIN_AGE = 60;       // years (also the least time between two schisms of one faith)
const SCHISM_CHANCE = 0.004;     // per simulated second, once a faith qualifies

// ---------- domains of events ----------

const NAME_DOMAINS = [
  [/rain|storm|lightning|thunder|wind|tornado|hurricane|hail/i, 'storm'],
  [/flood|tsunami|tide|sea|ocean|river|lake|spring/i, 'sea'],
  [/quake|earth|mountain|rock|landslide|sinkhole/i, 'earth'],
  [/fire|lava|volcan|erupt|burn|inferno|drought|heat/i, 'fire'],
  [/meteor|comet|star|aurora|eclipse|moon/i, 'stars'],
  [/sun|light|dawn|radian|glow/i, 'sky'],
  [/plague|disease|pestilence|locust|blight|rot|famine/i, 'plague'],
  [/harvest|bounty|fertil|bloom|grow|crop|abundan|plenty/i, 'harvest'],
  [/heal|life|cure|restor|mend|bless/i, 'healing'],
  [/death|doom|reap|curse|wither/i, 'death'],
  [/beast|wolf|animal|swarm|herd|predator/i, 'beasts'],
  [/forest|tree|wood|vine|grove/i, 'forest']
];

export function domainOfEvent(ev) {
  for (const [re, domain] of NAME_DOMAINS) if (re.test(ev.name || '')) return domain;
  switch (ev.kind) {
    case 'blessing': return 'harvest';
    case 'miracle': return 'healing';
    case 'curse': return 'death';
    case 'omen': return 'stars';
    default: return 'storm';
  }
}

// The first deity of a people: what dominates the land around its capital
function domainOfPlace(terrain, x, y) {
  let water = 0;
  let forest = 0;
  let hot = 0;
  let high = 0;
  let n = 0;
  for (let dy = -8; dy <= 8; dy += 4) {
    for (let dx = -8; dx <= 8; dx += 4) {
      const t = terrain.getTile(Math.floor(x + dx), Math.floor(y + dy));
      if (!t || !t.biome) continue;
      n++;
      const id = String(t.biome.id || t.biome.name || '').toLowerCase();
      if (t.biome.isWater) water++;
      if (/forest|jungle|taiga|wood/.test(id)) forest++;
      if (/desert|savanna|volcan|badland/.test(id)) hot++;
      if (/mountain|peak|hill|tundra|snow|ice/.test(id)) high++;
    }
  }
  if (!n) return 'sky';
  if (water / n > 0.25) return 'sea';
  if (forest / n > 0.35) return 'forest';
  if (hot / n > 0.35) return random() < 0.5 ? 'sky' : 'fire';
  if (high / n > 0.3) return 'earth';
  return ['sky', 'harvest', 'beasts', 'stars', 'healing'][Math.floor(random() * 5)];
}

// ---------- religions ----------

export function religionsOf(society) {
  if (!society.religions) society.religions = [];
  return society.religions;
}

export function getReligion(society, id) {
  return id ? religionsOf(society).find(r => r.id === id) || null : null;
}

export function makeDeity(domain, origin) {
  return {
    name: makeName(2),
    title: DOMAINS[domain] ? DOMAINS[domain].title : '',
    domain,
    trait: TRAITS[Math.floor(random() * TRAITS.length)],
    origin
  };
}

export function deityLabel(d) {
  return `${d.name} ${d.title}`;
}

// "Reformed Way of X", then "Free Way of X"... a new prefix for every sect of the same root faith
const SECT_PREFIXES = ['Reformed', 'Free', 'True', 'New', 'Old', 'Hidden', 'Northern', 'Southern'];
function sectName(society, parent) {
  const root = parent.name.replace(new RegExp(`^(${SECT_PREFIXES.join('|')}) `), '');
  const taken = new Set(religionsOf(society).map(r => r.name));
  const prefix = SECT_PREFIXES.find(p => !taken.has(`${p} ${root}`));
  return prefix ? `${prefix} ${root}` : `${root} of ${makeName(2)}`;
}

function foundReligion(society, civ, clan, deity, parent = null, year = 0) {
  society.faithSeq = (society.faithSeq || 0) + 1;
  const used = new Set(religionsOf(society).filter(r => !r.extinct).map(r => r.color));
  const color = COLORS.find(c => !used.has(c)) || COLORS[society.faithSeq % COLORS.length];
  const religion = {
    id: `faith_${society.faithSeq}`,
    name: parent ? sectName(society, parent) : `Way of ${deity.name}`,
    color,
    deities: parent ? [...parent.deities.map(d => ({ ...d })), deity].slice(-MAX_PANTHEON) : [deity],
    founderClanId: clan ? clan.id : null,
    civId: civ.id,
    parentId: parent ? parent.id : null,
    founded: Math.round(year),
    fervor: 1,
    adherents: 0,
    extinct: false
  };
  religionsOf(society).push(religion);
  if (clan) clan.beliefs = { ...(clan.beliefs || {}), religionId: religion.id };
  return religion;
}

function log(ecosystem, text, minor = false) {
  if (ecosystem && ecosystem.notifications) ecosystem.notifications.unshift({ text, minor, time: Date.now() });
}

// ---------- interpreting events ----------

// A clan makes sense of a world event. Returns what happened: 'strengthened' | 'pantheon' | 'founded' | null
export function interpretEvent(society, civ, clan, ev, members, ecosystem, year = 0) {
  const domain = domainOfEvent(ev);
  const religion = getReligion(society, clan.beliefs && clan.beliefs.religionId);
  const shaken = ev.kind === 'curse' || ev.kind === 'disaster';
  const moved = (amount) => {
    for (const e of members) {
      if (e.clanId !== clan.id || !e.personality) continue;
      e.personality.piety = Math.min(1, e.personality.piety + amount);
      if (e.determineBelief) e.belief = e.determineBelief();
    }
  };
  if (religion && !religion.extinct) {
    const deity = religion.deities.find(d => d.domain === domain);
    if (deity) {
      religion.fervor += ev.magnitude || 0.5;
      moved(shaken ? 0.02 : 0.03);
      log(ecosystem, `${clan.name} sees the ${ev.name} as the ${shaken ? 'wrath' : 'gift'} of ${deityLabel(deity)}.`, true);
      return 'strengthened';
    }
    if (religion.deities.length < MAX_PANTHEON && random() < 0.5 + 0.3 * (ev.magnitude || 0.5)) {
      const fresh = makeDeity(domain, ev.name);
      religion.deities.push(fresh);
      religion.fervor += 0.5;
      moved(0.02);
      log(ecosystem, `🛐 After the ${ev.name}, the ${religion.name} now also honours ${deityLabel(fresh)}, who ${fresh.trait}.`);
      return 'pantheon';
    }
    return null;
  }
  const deity = makeDeity(domain, ev.name);
  const founded = foundReligion(society, civ, clan, deity, null, year);
  moved(0.05);
  log(ecosystem, `🛐 ${clan.name} of ${civ.name} saw the ${ev.name} and founded the ${founded.name}: ${deityLabel(deity)}, who ${deity.trait}.`);
  return 'founded';
}

// ---------- the yearly life of faith ----------

function eventSeq(ev) {
  const n = parseInt(String(ev.id || '').replace(/\D+/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

// Runs every FAITH_TICK simulated seconds per civilization (called from SocietyManager.tickCiv).
export function tickReligion(society, civ, dt) {
  civ.faithTimer = (civ.faithTimer || 0) - dt;
  if (civ.faithTimer > 0) return;
  civ.faithTimer = FAITH_TICK;
  const { ecosystem, terrain } = society;
  const year = ecosystem.timeYears || 0;
  const members = ecosystem.entities.filter(e => e.alive && e.civilization === civ && e.isSapient);
  const clans = (civ.clans || []).filter(c => c.memberIds && c.memberIds.length);
  if (!members.length || !clans.length) return;
  for (const clan of clans) if (!clan.beliefs) clan.beliefs = {};

  // 1. a people without any faith looks at its land and names its first deity
  if (!clans.some(c => getReligion(society, c.beliefs.religionId))) {
    const founder = clans[0];
    const domain = domainOfPlace(terrain, civ.capitalX, civ.capitalY);
    const deity = makeDeity(domain, 'the land');
    const r = foundReligion(society, civ, founder, deity, null, year);
    for (const clan of clans) clan.beliefs.religionId = r.id;
    log(ecosystem, `🛐 The people of ${civ.name} worship ${deityLabel(deity)}, who ${deity.trait} (the ${r.name}).`);
  }

  // 2. world events near a clan's settlement are interpreted
  const events = ecosystem.worldEvents || [];
  for (const clan of clans) {
    const st = settlementsOf(civ).find(s => s.id === clan.settlementId) || settlementsOf(civ)[0];
    const last = clan.beliefs.lastEventSeq || 0;
    let newest = last;
    for (const ev of events) {
      const seq = eventSeq(ev);
      if (seq <= last) continue;
      newest = Math.max(newest, seq);
      if (!st || Math.hypot(ev.x - st.x, ev.y - st.y) > EVENT_RANGE + (ev.radius || 3)) continue;
      if (year - (ev.time || 0) > 3) continue;
      interpretEvent(society, civ, clan, ev, members, ecosystem, year);
    }
    clan.beliefs.lastEventSeq = newest;
  }

  // 3. everyone belongs somewhere: children and newcomers take their clan's faith
  const clanById = new Map(clans.map(c => [c.id, c]));
  for (const e of members) {
    const current = getReligion(society, e.faithId);
    if (current && !current.extinct) continue;
    const clan = clanById.get(e.clanId);
    const r = clan ? getReligion(society, clan.beliefs.religionId) : null;
    e.faithId = r ? r.id : (getReligion(society, civ.faithId) ? civ.faithId : null);
  }

  // 4. contact: people who meet talk; the more devout (or a priest) may convert the other
  const grid = ecosystem.grid;
  if (grid) {
    for (let i = 0; i < Math.min(8, members.length); i++) {
      const me = members[Math.floor(random() * members.length)];
      for (const other of grid.within(me.x, me.y, 3)) {
        if (!other.alive || !other.isSapient || other === me || !other.faithId || other.faithId === me.faithId) continue;
        const zeal = (other.personality ? other.personality.piety : 0.5) - (me.personality ? me.personality.piety : 0.5);
        const chance = (0.04 + 0.3 * Math.max(0, zeal)) * (other.job === 'priest' || other.isSpecialIndividual ? 2 : 1);
        if (random() < chance) me.faithId = other.faithId;
        break;
      }
    }
  }

  // 5. tallies: adherents, each clan's and settlement's majority faith, the civilization's faith
  const tally = (list) => {
    const n = new Map();
    for (const e of list) if (e.faithId) n.set(e.faithId, (n.get(e.faithId) || 0) + 1);
    let best = null;
    let bestN = 0;
    for (const [id, k] of n) if (k > bestN) { best = id; bestN = k; }
    return best;
  };
  for (const clan of clans) {
    const f = tally(members.filter(e => e.clanId === clan.id));
    if (f) clan.beliefs.religionId = f;
  }
  for (const st of settlementsOf(civ)) st.faithId = tally(members.filter(e => e.settlementId === st.id)) || st.faithId || null;
  civ.faithId = tally(members);
  refreshAdherents(society);

  // 6. schism: a big old faith spread over several clans may split
  for (const r of religionsOf(society)) {
    if (r.extinct || r.adherents < SCHISM_MIN_ADHERENTS || year - r.founded < SCHISM_MIN_AGE) continue;
    if (r.lastSchism !== undefined && year - r.lastSchism < SCHISM_MIN_AGE) continue;
    const followers = clans.filter(c => c.beliefs.religionId === r.id && c.id !== r.founderClanId);
    if (followers.length < 1 || random() > SCHISM_CHANCE * FAITH_TICK) continue;
    r.lastSchism = year;
    const pietyOf = c => {
      const ms = members.filter(e => e.clanId === c.id);
      return ms.reduce((s, e) => s + (e.personality ? e.personality.piety : 0.5), 0) / Math.max(1, ms.length);
    };
    const rebels = followers.sort((a, b) => pietyOf(a) - pietyOf(b))[0];
    const sect = foundReligion(society, civ, rebels, makeDeity(Object.keys(DOMAINS)[Math.floor(random() * 12)], 'a schism'), r, year);
    for (const e of members) if (e.clanId === rebels.id) e.faithId = sect.id;
    log(ecosystem, `⚡ Schism! ${rebels.name} broke away from the ${r.name} and founded the ${sect.name}.`);
    refreshAdherents(society);
    break;
  }
}

export function refreshAdherents(society) {
  const counts = new Map();
  for (const e of society.ecosystem.entities) if (e.alive && e.faithId) counts.set(e.faithId, (counts.get(e.faithId) || 0) + 1);
  for (const r of religionsOf(society)) {
    r.adherents = counts.get(r.id) || 0;
    if (r.adherents === 0 && !r.extinct && r.everHad) r.extinct = true;
    if (r.adherents > 0) r.everHad = true;
  }
}

// ---------- priests ----------

// A priest leads rites at a shrine or temple: the faithful nearby grow more devout, the religion's fervour grows,
// and listeners of another faith may convert.
export function performRite(society, priest, radius = 6) {
  const r = getReligion(society, priest.faithId);
  if (!r) return 0;
  r.fervor += 0.05;
  let touched = 0;
  const near = society.ecosystem.grid ? society.ecosystem.grid.within(priest.x, priest.y, radius) : society.ecosystem.entities;
  for (const e of near) {
    if (!e.alive || !e.isSapient || e === priest || Math.hypot(e.x - priest.x, e.y - priest.y) > radius) continue;
    if (e.faithId === r.id) {
      e.personality.piety = Math.min(1, e.personality.piety + 0.01);
      touched++;
    } else if (random() < 0.08) {
      e.faithId = r.id;
      touched++;
    }
  }
  return touched;
}

// The religious building a priest of settlement `st` should use (finished, closest to the depot), or null.
export function holyPlaceOf(terrain, buildings) {
  let best = null;
  for (const b of buildings) {
    const def = BUILDING_TYPES[b.type];
    if (!def || def.category !== 'religious' || b.type === 'graveyard' || b.type === 'barrow' || b.progress < 1) continue;
    if (!best || def.tier > BUILDING_TYPES[best.type].tier) best = b;
  }
  return best;
}

// Short description for the UI: "Way of Ulmara: Ulmara of Storms, Teth of the Sky"
export function describeReligion(r) {
  return `${r.name}: ${r.deities.map(deityLabel).join(', ')}`;
}
