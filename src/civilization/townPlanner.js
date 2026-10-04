// INTERIM town planner. The society/economy agent will replace this with creatures that really haul materials and
// build; until then each civilization lays out a small, sparse, sensible town around its capital and "builds" it
// over time. Everything is deterministic (random() from simulation/random.js) and saved inside civ.town (plain JSON).
//
// Layout: the hall (or keep) stands at the centre, its door facing the MAIN STREET (row civ.town.y0). More streets run
// parallel every 8 rows and every house, hut, workshop... stands on the north side of a street with its door on the
// street; two avenues run north-south at x = cx +/- 8. Gaps of at least one tile separate buildings. Farm fields,
// pens, graveyard, windmill, camps and towers go on the edge on suitable land. From the Bronze Age on a palisade (later a
// stone wall with gates and corner towers) rings the town. Territory (tile.civId) stays the influence area.
//
//   initTown(civ, terrain)      places the hall (moving the capital to its front door), a street and a few starter huts
//   growTown(civ, terrain)      plans ONE new building (a construction site) if the town wants one
//   tickTown(civ, terrain, dt)  advances construction of the civ's sites and plans growth on a timer
//   eraTier(civ)                0..5 index into techTree ERAS
import { ERAS } from './techTree.js';
import { random } from '../simulation/random.js';
import { BUILDING_TYPES, doorTile, frontTile } from '../world/buildings.js';

const ROW_SPACING = 8;
const PLAN_INTERVAL = 4;      // simulated seconds between planned buildings

export function eraTier(civ) {
  const i = ERAS.findIndex(e => civ.era && e.id === civ.era.id);
  return i < 0 ? 0 : i;
}

function ensureTown(civ) {
  if (!civ.town) civ.town = { cx: civ.capitalX, y0: civ.capitalY, rx: 6, ring: null, cooldown: 0, ready: false };
  return civ.town;
}

// ---------- geometry helpers ----------

function hasBuildingNear(terrain, x, y, w, h, l, r, t, b) {
  for (let ty = y - t; ty < y + h + b; ty++) {
    for (let tx = x - l; tx < x + w + r; tx++) {
      if (!terrain.inBounds(tx, ty)) continue;
      const s = terrain.getTile(tx, ty).structure;
      if (s && s.type !== 'ruins') return true;
    }
  }
  return false;
}

function roadFree(terrain, x, y, w, h) {
  for (let ty = y; ty < y + h; ty++) for (let tx = x; tx < x + w; tx++) if (terrain.getTile(tx, ty).road) return false;
  return true;
}

function counts(terrain, civ) {
  const n = {};
  for (const b of terrain.buildings.values()) {
    if (b.civId !== civ.id || b.type === 'ruins') continue;
    n[b.type] = (n[b.type] || 0) + 1;
    n[BUILDING_TYPES[b.type].category] = (n[BUILDING_TYPES[b.type].category] || 0) + 1;
    n.all = (n.all || 0) + 1;
  }
  return n;
}

function paveRow(terrain, x0, x1, y, kind) {
  for (let x = x0; x <= x1; x++) {
    const s = terrain.getTile(x, y).structure;
    if (s && s.solid) continue;
    terrain.setRoad(x, y, kind);
  }
}

function paveColumn(terrain, x, y0, y1, kind) {
  for (let y = y0; y <= y1; y++) {
    const s = terrain.getTile(x, y).structure;
    if (s && s.solid) continue;
    terrain.setRoad(x, y, kind);
  }
}

function roadKindFor(tier) {
  return tier >= 3 ? 'cobble' : (tier >= 2 ? 'gravel' : 'dirt');
}

// ---------- placement ----------

function placeAt(terrain, civ, type, x, y, instant) {
  return terrain.placeBuilding(type, x, y, {
    civId: civ.id,
    progress: instant ? 1 : 0,
    style: { ...terrain.styleFor(type, x, y), accent: civ.color }
  });
}

// A plot on a street: the building stands on the north side of street row `row`, door on the street.
function streetPlot(terrain, civ, town, type, instant) {
  const def = BUILDING_TYPES[type];
  const rows = [];
  const nrows = 1 + Math.min(4, Math.floor(Object.keys(terrain.buildingsOfCiv(civ.id)).length / 10));
  for (let k = 0; k < nrows; k++) {
    rows.push(town.y0 + (k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2) * ROW_SPACING));
  }
  let best = null;
  let bestScore = Infinity;
  for (let attempt = 0; attempt < 70; attempt++) {
    const row = rows[Math.floor(random() * rows.length)];
    const x = town.cx + Math.round((random() * 2 - 1) * town.rx) - Math.floor(def.w / 2);
    const y = row - def.h;
    if (Math.abs(x + def.w / 2 - town.cx - 8) < 2.5 || Math.abs(x + def.w / 2 - town.cx + 8) < 2.5) continue; // avenues
    if (!terrain.canPlaceBuilding(type, x, y)) continue;
    if (!roadFree(terrain, x, y, def.w, def.h)) continue;
    if (hasBuildingNear(terrain, x, y, def.w, def.h, 1, 1, 1, 0)) continue;
    // the street in front must be land
    const fx = x + (def.door ? def.door.x : 0);
    if (!terrain.isBuildable(fx, row)) continue;
    const score = Math.hypot(x + def.w / 2 - town.cx, y + def.h - town.y0) + random() * 4;
    if (score < bestScore) { bestScore = score; best = { x, y, row }; }
  }
  if (!best) return null;
  const b = placeAt(terrain, civ, type, best.x, best.y, instant);
  if (!b) return null;
  paveStreet(terrain, civ, town, best.row);
  return b;
}

function paveStreet(terrain, civ, town, row) {
  const kind = roadKindFor(eraTier(civ));
  const x0 = town.cx - town.rx - 2;
  const x1 = town.cx + town.rx + 2;
  if (town.ring) {
    paveRow(terrain, Math.max(x0, town.ring.x0 + 1), Math.min(x1, town.ring.x1 - 1), row, kind);
  } else {
    paveRow(terrain, x0, x1, row, kind);
  }
  for (const ax of [town.cx - 8, town.cx + 8]) paveColumn(terrain, ax, town.y0 - ROW_SPACING * 2, town.y0 + ROW_SPACING * 2, kind);
}

// Edge land around (outside) the built-up area: fields, pens, camps, towers...
function edgePlot(terrain, civ, town, type, instant) {
  const def = BUILDING_TYPES[type];
  const ex = town.ring ? { x0: town.ring.x0 - 1, x1: town.ring.x1 + 1, y0: town.ring.y0 - 1, y1: town.ring.y1 + 1 }
    : { x0: town.cx - town.rx - 2, x1: town.cx + town.rx + 2, y0: town.y0 - ROW_SPACING - 5, y1: town.y0 + ROW_SPACING + 3 };
  const wantFertile = type === 'farm' || type === 'pen';
  let best = null;
  let bestScore = Infinity;
  for (let attempt = 0; attempt < 60; attempt++) {
    const side = Math.floor(random() * 4);
    const gap = 2 + Math.floor(random() * 6);
    let x;
    let y;
    if (side === 0) { x = ex.x0 + Math.floor(random() * (ex.x1 - ex.x0)); y = ex.y0 - gap - def.h; }
    else if (side === 1) { x = ex.x0 + Math.floor(random() * (ex.x1 - ex.x0)); y = ex.y1 + gap; }
    else if (side === 2) { x = ex.x0 - gap - def.w; y = ex.y0 + Math.floor(random() * (ex.y1 - ex.y0)); }
    else { x = ex.x1 + gap; y = ex.y0 + Math.floor(random() * (ex.y1 - ex.y0)); }
    if (!terrain.canPlaceBuilding(type, x, y)) continue;
    if (!roadFree(terrain, x, y, def.w, def.h)) continue;
    if (hasBuildingNear(terrain, x, y, def.w, def.h, 1, 1, 1, 1)) continue;
    if (wantFertile) {
      let fert = 0;
      for (let i = 0; i < def.w; i++) fert += terrain.getTile(x + i, y + (def.h >> 1)).biome.fertility;
      if (fert / def.w < 0.4) continue;
    }
    const score = Math.hypot(x + def.w / 2 - town.cx, y + def.h / 2 - town.y0) + random() * 5;
    if (score < bestScore) { bestScore = score; best = { x, y }; }
  }
  return best ? placeAt(terrain, civ, type, best.x, best.y, instant) : null;
}

// ---------- the wall ring ----------

function buildRing(terrain, civ, town, instant) {
  const tier = eraTier(civ);
  const stone = tier >= 2;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const b of terrain.buildings.values()) {
    if (b.civId !== civ.id || b.type === 'ruins') continue;
    const d = BUILDING_TYPES[b.type];
    if (d.category === 'farm' || b.type === 'graveyard' || b.type === 'windmill' || b.type === 'lumber_camp') continue;
    x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h);
  }
  if (!isFinite(x0)) return;
  x0 -= 3; y0 -= 3; x1 += 3; y1 += 2;
  town.ring = { x0, y0, x1, y1, stone };
  const wallType = stone ? 'stone_wall' : 'palisade';
  const gateType = stone ? 'stone_gate' : 'palisade_gate';
  if (stone) {
    for (const [tx, ty] of [[x0, y0], [x1 - 1, y0], [x0, y1 - 1], [x1 - 1, y1 - 1]]) placeAt(terrain, civ, 'wall_tower', tx, ty, instant);
  }
  const put = (x, y) => {
    const t = terrain.getTile(x, y);
    if (t.structure) return;
    // a road crossing the wall becomes a gate, otherwise a wall piece
    const type = t.road ? gateType : wallType;
    if (!terrain.canPlaceBuilding(type, x, y)) return;
    const b = terrain.placeBuilding(type, x, y, { civId: civ.id, progress: instant ? 1 : 0, style: { ...terrain.styleFor(type, x, y), accent: civ.color } });
    if (b && type === gateType) terrain.setRoad(x, y, roadKindFor(eraTier(civ)));
  };
  // the roads that will cross the wall are laid first so they become gates
  const kind = roadKindFor(eraTier(civ));
  paveRow(terrain, x0, x1 - 1, town.y0, kind);
  for (const ax of [town.cx - 8, town.cx + 8]) paveColumn(terrain, ax, y0, y1 - 1, kind);
  for (let x = x0; x < x1; x++) { put(x, y0); put(x, y1 - 1); }
  for (let y = y0 + 1; y < y1 - 1; y++) { put(x0, y); put(x1 - 1, y); }
}

// ---------- the wish list ----------

function housingType(tier) {
  const r = random();
  if (tier === 0) return r < 0.4 ? 'tent' : 'hut';
  if (tier === 1) return r < 0.2 ? 'hut' : (r < 0.7 ? 'wooden_house' : 'longhouse');
  if (tier === 2) return r < 0.3 ? 'wooden_house' : (r < 0.8 ? 'stone_house' : 'longhouse');
  if (tier === 3) return r < 0.2 ? 'wooden_house' : (r < 0.6 ? 'stone_house' : 'manor');
  return r < 0.5 ? 'manor' : 'stone_house';
}

function wishes(civ, n, tier) {
  const houses = n.housing || 0;
  const citizens = Math.max(civ.citizens || 0, 3);
  const wantHouses = Math.min(40, Math.ceil(citizens / 2) + 2);
  const list = [];
  const want = (type, weight, kind = 'plot') => list.push({ type, weight, kind });
  if (houses < wantHouses) want('housing', 6 + (wantHouses - houses), 'plot');
  const farms = n.farm || 0;
  if (farms < Math.ceil(houses / 3) && houses >= 2) want('farm', 3, 'edge');
  if (tier >= 1) {
    if ((n.well || 0) < Math.floor(houses / 8) + (houses >= 4 ? 1 : 0)) want('well', 2);
    if ((n.granary || 0) < Math.floor(citizens / 10) + 1 && houses >= 3) want('granary', 2);
    if ((n.shrine || 0) + (n.temple || 0) < 1 && houses >= 3) want('shrine', 2);
    if ((n.workshop || 0) < Math.floor(houses / 6) && houses >= 4) want('workshop', 2);
    if ((n.kiln || 0) < 1 && houses >= 5) want('kiln', 1);
    if ((n.market_stall || 0) + (n.market || 0) < Math.floor(houses / 8) && houses >= 5 && tier < 2) want('market_stall', 1.5);
    if ((n.pen || 0) < Math.floor(farms / 2) && farms >= 2) want('pen', 1.2, 'edge');
    if ((n.watchtower || 0) < Math.min(3, 1 + Math.floor(houses / 8)) && houses >= 4) want('watchtower', 1, 'edge');
    if ((n.graveyard || 0) < 1 && houses >= 8) want('graveyard', 1, 'edge');
    if ((n.lumber_camp || 0) < 1 && houses >= 3) want('lumber_camp', 1.2, 'edge');
  }
  if (tier >= 2) {
    if ((n.market || 0) < 1 && houses >= 6) want('market', 2);
    if ((n.smithy || 0) < 1 && houses >= 6) want('smithy', 1.5);
    if ((n.tavern || 0) < Math.floor(houses / 10) + 1 && houses >= 7) want('tavern', 1.2);
    if ((n.temple || 0) < 1 + Math.floor(houses / 20) && houses >= 6) want('temple', 2);
    if ((n.windmill || 0) < Math.floor(farms / 3) && farms >= 3) want('windmill', 1, 'edge');
  }
  if (tier >= 3) {
    if ((n.keep || 0) < 1 && houses >= 8) want('keep', 3);
    if ((n.library || 0) < 1 && houses >= 9) want('library', 1.5);
    if ((n.barracks || 0) < 1 && houses >= 9) want('barracks', 1.5);
    if ((n.cathedral || 0) < 1 && houses >= 10) want('cathedral', 1.5);
  }
  if (tier >= 4) {
    if ((n.factory || 0) < Math.floor(houses / 10) + 1 && houses >= 8) want('factory', 2, 'edge');
    if ((n.power_plant || 0) < 1 && houses >= 10) want('power_plant', 1.5, 'edge');
  }
  if (tier >= 5 && (n.spaceport || 0) < 1 && houses >= 12) want('spaceport', 3, 'edge');
  return list;
}

function pick(list) {
  let total = 0;
  for (const w of list) total += w.weight;
  let r = random() * total;
  for (const w of list) {
    r -= w.weight;
    if (r <= 0) return w;
  }
  return list[list.length - 1];
}

// ---------- public API ----------

// The hall stands north of the main street, its door on the street; the capital moves to that street tile.
export function initTown(civ, terrain) {
  const town = ensureTown(civ);
  let type = eraTier(civ) >= 3 ? 'keep' : 'hall';
  let def = BUILDING_TYPES[type];
  const tryAt = (cx, cy) => {
    const x = cx - (def.door ? def.door.x : 0);
    const y = cy - def.h;
    return terrain.canPlaceBuilding(type, x, y) ? { x, y } : null;
  };
  let spot = null;
  // the hall first; on cramped or rugged ground a smaller keep-less hall, then a hut
  for (const candidate of [type, 'hall', 'longhouse', 'hut']) {
    type = candidate;
    def = BUILDING_TYPES[type];
    spot = tryAt(civ.capitalX, civ.capitalY);
    for (let r = 1; r <= 12 && !spot; r++) {
      for (let a = 0; a < 16 && !spot; a++) {
        const ang = (a / 16) * Math.PI * 2;
        spot = tryAt(Math.round(civ.capitalX + Math.cos(ang) * r), Math.round(civ.capitalY + Math.sin(ang) * r));
      }
    }
    if (spot) break;
  }
  if (!spot) { town.ready = false; return null; }
  const hall = placeAt(terrain, civ, type, spot.x, spot.y, true);
  if (!hall) return null;
  const front = frontTile(hall);
  civ.capitalX = front.x;
  civ.capitalY = front.y;
  town.cx = front.x;
  town.y0 = front.y;
  town.ready = true;
  paveStreet(terrain, civ, town, town.y0);
  // a few starter dwellings so the capital never looks empty
  for (let i = 0; i < 3; i++) streetPlot(terrain, civ, town, housingType(eraTier(civ)), true);
  return hall;
}

// Plans one building (as a construction site, or finished with { instant: true }). Returns it or null.
export function growTown(civ, terrain, { instant = false, maxSites = 3 } = {}) {
  const town = ensureTown(civ);
  if (!town.ready) return null;
  const tier = eraTier(civ);
  let sites = 0;
  for (const b of terrain.buildings.values()) if (b.civId === civ.id && b.progress < 1 && b.type !== 'ruins') sites++;
  const n = counts(terrain, civ);
  town.rx = Math.min(24, 6 + Math.floor((n.housing || 0) * 0.9));

  // renewal: old tents and huts are pulled down once better housing exists
  if (tier >= 2 && random() < 0.25) {
    for (const b of terrain.buildings.values()) {
      if (b.civId === civ.id && (b.type === 'tent' || b.type === 'hut') && b.progress >= 1) { terrain.removeBuilding(b.id, { ruins: false }); break; }
    }
  }
  // the wall ring, once the town is big enough for its era
  if (!town.ring && tier >= 1 && (n.housing || 0) >= 8 + tier) {
    buildRing(terrain, civ, town, instant);
    return null;
  }
  if (sites >= maxSites && !instant) return null;
  const list = wishes(civ, n, tier);
  if (!list.length) return null;
  const w = pick(list);
  const type = w.type === 'housing' ? housingType(tier) : w.type;
  const b = w.kind === 'edge' ? edgePlot(terrain, civ, town, type, instant) : streetPlot(terrain, civ, town, type, instant);
  if (!b && w.type === 'housing') return edgePlot(terrain, civ, town, 'tent', instant);
  return b;
}

// Builds the civ's sites (their citizens' effort) and plans a new one now and then. dt: simulated seconds.
export function tickTown(civ, terrain, dt) {
  const town = civ.town;
  if (!town || !town.ready) return;
  let budget = dt * (0.8 + (civ.citizens || 0) * 0.3);
  for (const b of terrain.buildings.values()) {
    if (budget <= 0) break;
    if (b.civId !== civ.id || b.progress >= 1 || b.type === 'ruins') continue;
    const def = BUILDING_TYPES[b.type];
    const need = (1 - b.progress) * def.work;
    const spend = Math.min(budget, need);
    terrain.advanceConstruction(b.id, spend);
    budget -= spend;
  }
  town.cooldown -= dt;
  if (town.cooldown <= 0) {
    town.cooldown = PLAN_INTERVAL;
    growTown(civ, terrain);
  }
}

export { doorTile };
