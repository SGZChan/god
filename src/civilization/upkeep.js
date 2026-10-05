// Upkeep: nothing built lasts for ever. Researched rule of thumb: a tent or lean-to is a generation's shelter, a
// timber house lasts about a century, stone and brick for several, a castle for ages, if they are maintained.
//
//   wear      every finished building loses condition each year (WEAR below, fraction of its health per game year);
//             unmaintained, it ends as ruins (terrain.damageBuilding)
//   repair    builders with nothing to build go round the town mending the worst-off building (a little wood, stone
//             or clay each time), housing first
//   clearing  ruins left in the town (a burnt house, a fallen wall) are cleared by builders and the stone and timber
//             that can be salvaged goes back to the stockpile. Ruins well outside the town are left for nature.
//
//   tickUpkeep(society, civ, dt)      wear, every UPKEEP_TICK simulated seconds
//   upkeepWork(terrain, st)           { damaged, ruins } counts for hiring builders
//   stepUpkeep(ent, c)                builder step: repair or clear; true when it did something
import { BUILDING_TYPES, frontTile } from '../world/buildings.js';
import { buildingsOf } from './settlements.js';
import { add, take } from './economy.js';

export const UPKEEP_TICK = 10;
export const REPAIR_BELOW = 0.72;       // repair buildings under this fraction of their health
const TOWN_RADIUS = 26;                 // ruins within this distance of a settlement's centre are cleared
const GAME_YEARS_PER_SECOND = 0.25;

// fraction of full health lost per game year
const WEAR = {
  tent: 0.03, hut: 0.016, wooden_house: 0.01, longhouse: 0.01, granary: 0.01, workshop: 0.01, tavern: 0.01, market: 0.01,
  market_stall: 0.015, lumber_camp: 0.012, pen: 0.012, farm: 0.004, dock: 0.012, windmill: 0.008, palisade: 0.014, palisade_gate: 0.014,
  healers_hut: 0.016, shrine: 0.006, watchtower: 0.008, kiln: 0.006, smithy: 0.006, mine: 0.005, quarry: 0.004, well: 0.003,
  stone_house: 0.004, stone_wall: 0.002, stone_gate: 0.002, wall_tower: 0.002, keep: 0.0015, temple: 0.003, cathedral: 0.002,
  manor: 0.004, library: 0.004, barracks: 0.004, infirmary: 0.004, fire_station: 0.004, hospital: 0.003, tenement: 0.003,
  factory: 0.003, power_plant: 0.003, habitat: 0.002, spaceport: 0.002, graveyard: 0.001, barrow: 0.0008, hall: 0.008
};

let helpers = { walkTo: () => false, say: () => {} };
export function registerHelpers(h) { helpers = h; }

export function tickUpkeep(society, civ, dt) {
  civ.upkeepTimer = (civ.upkeepTimer === undefined ? UPKEEP_TICK : civ.upkeepTimer) - dt;
  if (civ.upkeepTimer > 0) return;
  const years = (UPKEEP_TICK - civ.upkeepTimer) * GAME_YEARS_PER_SECOND; // (a tick that came late counts for the time passed)
  civ.upkeepTimer = UPKEEP_TICK;
  const terrain = society.terrain;
  for (const b of [...terrain.buildingsOfCiv(civ.id)]) {
    if (b.type === 'ruins' || b.progress < 1) continue;
    const def = BUILDING_TYPES[b.type];
    const rate = WEAR[b.type] === undefined ? 0.006 : WEAR[b.type];
    terrain.damageBuilding(b.id, def.health * rate * years);
  }
}

function ruinsNear(terrain, st) {
  const out = [];
  for (const b of terrain.buildings.values()) {
    if (b.type !== 'ruins' || (b.name && /^Ancient/.test(b.name))) continue;
    if (Math.hypot(b.x - st.x, b.y - st.y) <= TOWN_RADIUS) out.push(b);
  }
  return out;
}

export function upkeepWork(terrain, st) {
  let damaged = 0;
  for (const b of buildingsOf(terrain, st)) {
    if (b.type === 'ruins' || b.progress < 1) continue;
    if (b.health < BUILDING_TYPES[b.type].health * REPAIR_BELOW) damaged++;
  }
  return { damaged, ruins: ruinsNear(terrain, st).length };
}

function repairMaterial(b, st) {
  const cost = BUILDING_TYPES[b.type].cost;
  for (const k of Object.keys(cost)) if (['wood', 'stone', 'clay', 'bricks'].includes(k) && (st.stock[k] || 0) >= 1) return k;
  return null;
}

// One unit of work: repair the worst building, else clear the nearest ruin. Returns true when it did something.
// mode 'urgent' (called before new building): only buildings under half health and ruins in the heart of town.
export function stepUpkeep(ent, c, mode = 'idle') {
  const { terrain, st } = c;
  // (its own state: ent.task belongs to the builder's building errands, which share walkTo's bookkeeping)
  const t = ent.upkeep || (ent.upkeep = {});
  // repair
  let target = t.targetId ? terrain.getBuilding(t.targetId) : null;
  if (target && (target.type === 'ruins') !== (t.what === 'ruins')) target = null;
  if (!target) {
    t.what = null;
    let worst = null;
    let score = 0;
    for (const b of buildingsOf(terrain, st)) {
      if (b.type === 'ruins' || b.progress < 1) continue;
      const def = BUILDING_TYPES[b.type];
      const frac = b.health / def.health;
      if (frac >= (mode === 'urgent' ? 0.6 : REPAIR_BELOW) || !repairMaterial(b, st) || b.blockedUntil > (c.civ.clock || 0)) continue;
      const s = (1 - frac) + (def.category === 'housing' ? 0.3 : 0) - Math.hypot(b.x - ent.x, b.y - ent.y) * 0.004;
      if (s > score) { score = s; worst = b; }
    }
    if (worst) { target = worst; t.what = 'repair'; }
    else {
      const ruins = ruinsNear(terrain, st).filter(r => mode !== 'urgent' || Math.hypot(r.x - st.x, r.y - st.y) <= 13).filter(r => !(r.blockedUntil > (c.civ.clock || 0))).sort((a, b) => Math.hypot(a.x - ent.x, a.y - ent.y) - Math.hypot(b.x - ent.x, b.y - ent.y));
      if (ruins.length) { target = ruins[0]; t.what = 'ruins'; t.done = 0; }
    }
    t.targetId = target ? target.id : undefined;
  }
  if (!target) { ent.upkeep = null; return false; }
  const def = BUILDING_TYPES[target.type === 'ruins' ? (target.original || 'hut') : target.type];
  const spot = frontTile(target.type === 'ruins' ? { ...target, type: 'hut' } : target);
  helpers.say(ent, t.what === 'repair' ? `Repairing the ${def.name.toLowerCase()}` : `Clearing the ruins of the ${def.name.toLowerCase()}`);
  if (!helpers.walkTo(ent, c, spot.x, spot.y, 3.2)) {
    if (ent.task && ent.task.failed) { ent.task.failed = false; target.blockedUntil = (c.civ.clock || 0) + 60; t.targetId = undefined; }
    return true;
  }
  ent.path = [];
  ent.actionCooldown = 1;
  if (t.what === 'repair') {
    const k = repairMaterial(target, st);
    if (k && (t.spent = (t.spent || 0) + 1) % 3 === 0) take(st.stock, k, 1);
    terrain.repairBuilding(target.id, def.health * 0.3);
    if (target.health >= def.health * 0.95) { t.targetId = undefined; t.spent = 0; }
    return true;
  }
  // clearing ruins: three efforts, then the salvage goes to the stockpile
  t.done = (t.done || 0) + 1;
  if (t.done >= 3) {
    const original = BUILDING_TYPES[target.original];
    terrain.removeBuilding(target.id, { ruins: false });
    if (original) for (const [k, n] of Object.entries(original.cost)) if (['wood', 'stone', 'clay', 'iron', 'bricks'].includes(k)) add(st.stock, k, Math.floor(n * 0.3));
    t.targetId = undefined;
  }
  return true;
}

