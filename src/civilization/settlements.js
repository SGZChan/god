// Settlements: the places a civilization lives. A civilization is a network of settlements (a capital and the hamlets
// that clans found); each has a stockpile, a depot where goods are dropped, houses, fields and a town plan.
//
//   civ.settlements = [{ id, civId, name, x, y, capital, founded, stock:{}, town:{cx,y0,rx,ring,cooldown,ready},
//                        roadQueue:[{x,y,kind}], clanIds:[], population, jobs:{}, demand:{}, shortage:{} }]
//   entity.settlementId, building.settlementId
//
// (x, y) is the settlement centre: the road tile in front of the hall once it stands, else the founding spot. Goods are
// dropped at the depot: the finished hall/keep or granary (its front tile), else the centre. Plain JSON, saved with the civ.
import { BUILDING_TYPES, frontTile } from '../world/buildings.js';
import { makeName } from '../life/names.js';
import { random } from '../simulation/random.js';
import { add } from './economy.js';

export const STARTER_KIT = { wood: 40, fibre: 24, stone: 10, grain: 24 };

export function settlementsOf(civ) {
  if (!civ.settlements) civ.settlements = [];
  return civ.settlements;
}

export function getSettlement(civ, id) {
  return id && civ.settlements ? civ.settlements.find(s => s.id === id) || null : null;
}

export function createSettlement(civ, x, y, { name = null, capital = false, stock = null, year = 0 } = {}) {
  if (!civ.seq) civ.seq = {};
  civ.seq.settlement = (civ.seq.settlement || 0) + 1;
  const st = {
    id: `${civ.id}_s${civ.seq.settlement}`,
    civId: civ.id,
    name: name || (capital ? civ.name.replace(/^(Kingdom|Holy Covenant|Republic|Empire) of /, '') : makeName()),
    x: Math.floor(x),
    y: Math.floor(y),
    capital,
    founded: Math.round(year),
    stock: {},
    town: { cx: Math.floor(x), y0: Math.floor(y), rx: 6, ring: null, cooldown: 0, ready: false },
    roadQueue: [],
    clanIds: [],
    population: 0,
    jobs: {},
    demand: {},
    shortage: {}
  };
  for (const [k, n] of Object.entries(stock || {})) add(st.stock, k, n);
  settlementsOf(civ).push(st);
  return st; // (civ.town is a getter for settlements[0].town)
}

export function nearestSettlement(civ, x, y) {
  let best = null;
  let bestD = Infinity;
  for (const st of settlementsOf(civ)) {
    const d = Math.hypot(st.x - x, st.y - y);
    if (d < bestD) { bestD = d; best = st; }
  }
  return best;
}

// ---------- buildings of a settlement (cached; membership changes only when buildings are placed or removed) ----------

export function buildingsOf(terrain, st) {
  const key = terrain.buildings.size * 100003 + terrain.nextBuildingId;
  if (st._bKey === key && st._b) return st._b;
  const list = [];
  for (const b of terrain.buildings.values()) if (b.settlementId === st.id && b.type !== 'ruins') list.push(b);
  Object.defineProperty(st, '_b', { value: list, writable: true, configurable: true, enumerable: false });
  Object.defineProperty(st, '_bKey', { value: key, writable: true, configurable: true, enumerable: false });
  return list;
}

export function countBuilt(terrain, st, type) {
  let n = 0;
  for (const b of buildingsOf(terrain, st)) if (b.type === type && b.progress >= 1) n++;
  return n;
}

export function openSites(terrain, st) {
  return buildingsOf(terrain, st).filter(b => b.progress < 1);
}

export function housesOf(terrain, st) {
  return buildingsOf(terrain, st).filter(b => b.progress >= 1 && BUILDING_TYPES[b.type].category === 'housing');
}

export function housingCapacity(terrain, st) {
  let n = 0;
  for (const b of housesOf(terrain, st)) n += BUILDING_TYPES[b.type].capacity;
  return n;
}

// Where goods are dropped and fetched: the front of the finished hall/keep (or granary), else the settlement centre.
export function depotOf(terrain, st) {
  for (const b of buildingsOf(terrain, st)) {
    if (b.progress >= 1 && (b.type === 'hall' || b.type === 'keep')) {
      const f = frontTile(b);
      return { x: f.x, y: f.y, building: b };
    }
  }
  for (const b of buildingsOf(terrain, st)) {
    if (b.progress >= 1 && b.type === 'granary') {
      const f = frontTile(b);
      return { x: f.x, y: f.y, building: b };
    }
  }
  return { x: st.x, y: st.y, building: null };
}

// ---------- civ-wide queries ----------

export function builtSomewhere(terrain, civ, type) {
  for (const st of settlementsOf(civ)) if (countBuilt(terrain, st, type) > 0) return true;
  for (const b of terrain.buildings.values()) if (b.civId === civ.id && b.type === type && b.progress >= 1 && !b.settlementId) return true;
  return false;
}

export function housingCapacityOfCiv(terrain, civ) {
  let n = 0;
  for (const st of settlementsOf(civ)) n += housingCapacity(terrain, st);
  return n;
}

// Citizens a civilization can have: housing-limited (a few can always sleep rough around the fire).
export function popCap(terrain, civ) {
  const sites = [];
  for (const st of settlementsOf(civ)) for (const b of openSites(terrain, st)) if (BUILDING_TYPES[b.type].category === 'housing') sites.push(b);
  return Math.round(8 + housingCapacityOfCiv(terrain, civ) * 1.5 + sites.length * 1.5);
}

// A founding spot for a new hamlet within reach of `from` (a settlement): explored, open, buildable land that is not
// too close to any other settlement, preferably near water and trees. Returns {x, y} or null.
export function findHamletSite(terrain, civ, from, allCivs, isExplored) {
  let best = null;
  let bestScore = -Infinity;
  for (let attempt = 0; attempt < 24; attempt++) {
    const ang = random() * Math.PI * 2;
    const dist = 22 + random() * 34;
    const px = Math.round(from.x + Math.cos(ang) * dist);
    const py = Math.round(from.y + Math.sin(ang) * dist);
    if (!terrain.inBounds(px, py) || !terrain.isLandProbe(px, py)) continue;
    const land = terrain.findLand(px, py, 10, 4);
    if (!land) continue;
    const tile = terrain.getTile(land.x, land.y);
    if (!terrain.isBuildable(land.x, land.y) || (tile.civId && tile.civId !== civ.id)) continue;
    if (isExplored && !isExplored(land.x, land.y)) continue;
    let tooClose = false;
    for (const c of allCivs) {
      for (const s of c.settlements || []) if (Math.hypot(s.x - land.x, s.y - land.y) < 20) tooClose = true;
    }
    if (tooClose) continue;
    let score = tile.biome.fertility * 4 - Math.hypot(land.x - from.x, land.y - from.y) * 0.04;
    // water within a few tiles, trees within sight
    let water = false;
    let trees = 0;
    for (let k = 0; k < 10; k++) {
      const wx = land.x + Math.round((random() - 0.5) * 16);
      const wy = land.y + Math.round((random() - 0.5) * 16);
      if (!terrain.inBounds(wx, wy)) continue;
      const t = terrain.getTile(wx, wy);
      if (t.biome.isWater) water = true;
      if (t.deposit && t.deposit.type === 'wood') trees++;
    }
    score += (water ? 2 : 0) + Math.min(3, trees * 0.6);
    if (score > bestScore) { bestScore = score; best = { x: land.x, y: land.y }; }
  }
  return best;
}
