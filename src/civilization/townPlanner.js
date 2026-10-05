// The town PLANNER. It decides WHERE and WHAT a settlement should build next and enqueues construction sites
// (terrain.placeBuilding(..., progress 0)); it never builds anything itself. Creatures do the building: builders and
// haulers fetch materials from the stockpile (or the people extract them), deliver them (terrain.deliverMaterial) and
// work (terrain.advanceConstruction) stage by stage, see civilization/jobs.js. Streets are queued in
// settlement.roadQueue and paved tile by tile by builders; foot traffic wears dirt roads on its own (society.footstep).
//
// Layout (unchanged idea of the interim planner): the hall (or keep) stands at the centre with its door facing the MAIN
// STREET (row town.y0); further streets run parallel every 8 rows; houses, huts, workshops stand on the north side of a
// street with their door on it; two avenues run north-south at x = cx +/- 8. Farm fields, pens, camps, towers go on the
// edge on suitable land; quarries, mines and lumber camps next to their deposit. Never on water, ice or peaks.
//
//   initTown(civ, terrain, { instant })      founds the capital settlement: hall site, starter huts, a field
//   foundHamlet(civ, terrain, site, opts)    founds another settlement (clan splinter) with its first sites
//   planSettlement(civ, terrain, st, opts)   plans ONE new building site if the settlement wants one
//   growTown(civ, terrain, opts)             same for the first settlement that wants one (compat)
//   tickTown(civ, terrain, dt)               timers: plans growth now and then (never advances construction)
//   eraTier(civ)                             0..5 index into techTree ERAS
// `instant: true` (tests, dev tools) places finished buildings instead of sites.
import { ERAS, ERA_REQUIREMENTS } from './techTree.js';
import { random } from '../simulation/random.js';
import { BUILDING_TYPES, doorTile, frontTile } from '../world/buildings.js';
import { RESOURCES } from '../world/resources.js';
import { createSettlement, settlementsOf, buildingsOf, housesOf, housingCapacity, openSites, STARTER_KIT } from './settlements.js';
import { isDiscovered, nearestKnown, DISCOVERABLE, revealAround } from './exploration.js';

const ROW_SPACING = 8;
const PLAN_INTERVAL = 4;      // simulated seconds between planned buildings

export function eraTier(civ) {
  const i = ERAS.findIndex(e => civ.era && e.id === civ.era.id);
  return i < 0 ? 0 : i;
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

export function roadKindFor(tier) {
  return tier >= 3 ? 'cobble' : (tier >= 2 ? 'gravel' : 'dirt');
}

// Queues a road tile for the builders (once; not where a road or a solid building already is).
export function queueRoad(terrain, st, x, y, kind) {
  if (!terrain.inBounds(x, y) || !terrain.isBuildable(x, y)) return false;
  const tile = terrain.getTile(x, y);
  if ((tile.structure && tile.structure.solid) || (tile.road && tile.road === kind)) return false;
  if (st.roadQueue.some(r => r.x === x && r.y === y)) return false;
  st.roadQueue.push({ x, y, kind });
  return true;
}

function queueRow(terrain, st, x0, x1, y, kind) {
  for (let x = x0; x <= x1; x++) queueRoad(terrain, st, x, y, kind);
}

function queueColumn(terrain, st, x, y0, y1, kind) {
  for (let y = y0; y <= y1; y++) queueRoad(terrain, st, x, y, kind);
}

// ---------- what exists / what can be had ----------

function counts(terrain, st) {
  const n = {};
  for (const b of buildingsOf(terrain, st)) {
    const cat = BUILDING_TYPES[b.type].category;
    n[b.type] = (n[b.type] || 0) + 1;
    n[cat] = (n[cat] || 0) + 1;
    if (b.progress >= 1) n['done_' + b.type] = (n['done_' + b.type] || 0) + 1;
    n.all = (n.all || 0) + 1;
  }
  return n;
}

// Can the settlement get `res`? Stock, or (common) a deposit within reach, or (ores) a discovered deposit.
function obtainable(civ, terrain, st, res) {
  if ((st.stock[res] || 0) >= 1) return true;
  if (DISCOVERABLE.includes(res)) return isDiscovered(civ, res);
  if (!RESOURCES[res]) return true; // produced goods are made by crafters
  if (!st._near) Object.defineProperty(st, '_near', { value: new Map(), writable: true, configurable: true, enumerable: false });
  const hit = st._near.get(res);
  if (hit && hit.t > (civ._clock || 0) - 60) return hit.ok;
  const d = terrain.findNearestDeposit(st.x, st.y, res, 70);
  const ok = Boolean(d);
  st._near.set(res, { ok, t: civ._clock || 0 });
  return ok;
}

function affordable(civ, terrain, st, type) {
  const def = BUILDING_TYPES[type];
  for (const res of Object.keys(def.cost)) if (!obtainable(civ, terrain, st, res)) return false;
  return true;
}

// ---------- placement ----------

// Can the settlement's people walk (on land) from the centre to tile (x, y)? Rivers and lakes cut plots off.
function reachable(terrain, st, x, y) {
  const pf = terrain.ecosystem && terrain.ecosystem.pathfinder;
  if (!pf) return true;
  if (Math.hypot(st.x - x, st.y - y) < 2) return true;
  const path = pf.findPath(st.x, st.y, x + 0.5, y + 0.5, 1400, true);
  if (!path.length) return false;
  const last = path[path.length - 1];
  return Math.hypot(last.x - (x + 0.5), last.y - (y + 0.5)) < 1.6;
}

// The best-scoring candidate (lowest score) that people can actually reach.
function bestReachable(terrain, st, cands, goalOf) {
  cands.sort((a, b) => a.score - b.score);
  for (let i = 0; i < Math.min(cands.length, 4); i++) {
    const g = goalOf(cands[i]);
    if (reachable(terrain, st, g.x, g.y)) return cands[i];
  }
  return null;
}

// The look of a building raised now by `civ`: local materials, the civ's colour and its current age (art uses
// style.era to pick wall and roof materials, see art/buildingSprites.js eraOptions).
export function styleOf(civ, terrain, type, x, y) {
  const era = eraTier(civ);
  const base = terrain.styleFor(type, x, y);
  // from the Middle Ages on, towns are built of stone even where they used to be built of timber
  const pal = base.pal === 'timber' && era >= 3 ? 'stone' : base.pal;
  return { ...base, pal, accent: civ.color, era };
}

function placeAt(terrain, civ, st, type, x, y, instant) {
  const b = terrain.placeBuilding(type, x, y, {
    civId: civ.id,
    progress: instant ? 1 : 0,
    style: styleOf(civ, terrain, type, x, y)
  });
  if (!b) return null;
  b.settlementId = st.id;
  if (type === 'farm' || type === 'pen') b.growth = instant ? 1 : 0;
  b.residents = BUILDING_TYPES[type].category === 'housing' ? [] : undefined;
  if (b.residents === undefined) delete b.residents;
  return b;
}

// How a people lays out its town depends on its age and what the building is for (researched layouts: Stone Age
// camps are rings of shelters round the fire and chief's hall; Bronze Age city-states pack a dense core round the
// temple and are walled; Classical towns are grids of blocks round a forum with its market and temple; Medieval
// towns cluster round the castle and its market square inside a wall; Industrial towns are regular blocks).
const CIVIC = new Set(['hall', 'keep', 'market', 'market_stall', 'temple', 'shrine', 'cathedral', 'library', 'tavern', 'well', 'barracks']);
export function layoutOf(tier) {
  return tier === 0 ? 'camp' : tier === 1 ? 'citadel' : tier === 3 ? 'castle' : 'grid';
}

// A plot on a street: the building stands on the north side of street row `row`, door on the street. Civic buildings
// gather in the middle (the forum / square), homes line the rows on a regular pitch and fill outward from the centre.
function streetPlot(terrain, civ, st, type, instant) {
  const town = st.town;
  const def = BUILDING_TYPES[type];
  const civic = CIVIC.has(type);
  const housing = def.category === 'housing';
  const rows = [];
  const nrows = Math.min(st.wall ? 3 : 5, 1 + Math.floor(buildingsOf(terrain, st).length / 10));
  for (let k = 0; k < nrows; k++) {
    rows.push(town.y0 + (k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2) * ROW_SPACING));
  }
  const pitch = def.w + 1;
  const cands = [];
  for (let attempt = 0; attempt < 90; attempt++) {
    const row = civic && random() < 0.75 ? town.y0 : rows[Math.floor(random() * rows.length)];
    const reach = civic ? Math.max(4, town.rx * 0.45) : town.rx;
    let x = town.cx + Math.round((random() * 2 - 1) * reach) - Math.floor(def.w / 2);
    // homes stand on a regular pitch so a row reads as a street of houses
    if (housing) x = town.cx + Math.round(((random() * 2 - 1) * reach) / pitch) * pitch - Math.floor(def.w / 2);
    const y = row - def.h;
    if (Math.abs(x + def.w / 2 - town.cx - 8) < 2.5 || Math.abs(x + def.w / 2 - town.cx + 8) < 2.5) continue; // avenues
    if (!terrain.canPlaceBuilding(type, x, y)) continue;
    if (!roadFree(terrain, x, y, def.w, def.h)) continue;
    if (hasBuildingNear(terrain, x, y, def.w, def.h, 1, 1, 1, 0)) continue;
    const fx = x + (def.door ? def.door.x : 0);
    if (!terrain.isBuildable(fx, row)) continue;
    const dx = Math.abs(x + def.w / 2 - town.cx);
    const dr = Math.abs(row - town.y0);
    // the centre first: civic buildings hug the middle of the main street, homes fill outward row by row
    const score = civic ? dx + dr * 0.8 + random() * 2 : Math.hypot(dx, dr) + random() * 2.5;
    cands.push({ x, y, row, score });
  }
  const best = bestReachable(terrain, st, cands, c => ({ x: c.x + (def.door ? def.door.x : 0), y: c.row }));
  if (!best) return null;
  const b = placeAt(terrain, civ, st, type, best.x, best.y, instant);
  if (!b) return null;
  queueStreet(terrain, civ, st, best.row, instant);
  return b;
}

// Stone Age camp: shelters stand in a ring round the fire (the hall, or the camp's heart), their doors toward it.
function ringPlot(terrain, civ, st, type, instant) {
  const town = st.town;
  const def = BUILDING_TYPES[type];
  const homes = buildingsOf(terrain, st).filter(b => BUILDING_TYPES[b.type].category === 'housing').length;
  const R = 7 + Math.sqrt(homes) * 2.4;
  const cx = town.cx;
  const cy = town.y0 - 2;
  const cands = [];
  for (let attempt = 0; attempt < 60; attempt++) {
    const ang = random() * Math.PI * 2;
    const r = R + (random() - 0.5) * 2.5;
    const x = Math.round(cx + Math.cos(ang) * r * 1.35 - def.w / 2);
    const y = Math.round(cy + Math.sin(ang) * r - def.h / 2);
    if (!terrain.canPlaceBuilding(type, x, y)) continue;
    if (!roadFree(terrain, x, y, def.w, def.h)) continue;
    if (hasBuildingNear(terrain, x, y, def.w, def.h, 1, 1, 1, 1)) continue;
    const fx = x + (def.door ? def.door.x : 0);
    const fy = y + (def.door ? def.door.y : def.h - 1) + 1;
    if (!terrain.isBuildable(fx, fy)) continue;
    const score = Math.abs(Math.hypot((x + def.w / 2 - cx) / 1.35, y + def.h / 2 - cy) - R) + random() * 1.5;
    cands.push({ x, y, score, fx, fy });
  }
  const best = bestReachable(terrain, st, cands, c => ({ x: c.fx, y: c.fy }));
  return best ? placeAt(terrain, civ, st, type, best.x, best.y, instant) : null;
}

// ---------- walls ----------
// A walled town: a rectangle round the built-up streets with a gate in the middle of each side and towers at the
// corners (stone walls from the classical age on, a wooden palisade before). Pieces are planned a few at a time.
const WALL_MIN_POP = 16;

function planWall(civ, terrain, st, tier) {
  const town = st.town;
  const S = ROW_SPACING;
  const R = Math.max(13, Math.min(21, Math.round(town.rx + 5)));
  const w = { R, x0: town.cx - R, x1: town.cx + R, y0: town.y0 - S - 7, y1: town.y0 + S + 3, kind: tier >= 2 ? 'stone' : 'palisade', pieces: [] };
  const wall = w.kind === 'stone' ? 'stone_wall' : 'palisade';
  const gate = w.kind === 'stone' ? 'stone_gate' : 'palisade_gate';
  const towers = w.kind === 'stone';
  const inTower = (x, y) => towers && [[w.x0, w.y0], [w.x1 - 1, w.y0], [w.x0, w.y1 - 1], [w.x1 - 1, w.y1 - 1]].some(([tx, ty]) => x >= tx && x < tx + 2 && y >= ty && y < ty + 2);
  const gates = new Set([`${w.x0},${town.y0}`, `${w.x1},${town.y0}`, `${town.cx - 8},${w.y0}`, `${town.cx + 8},${w.y0}`, `${town.cx - 8},${w.y1}`, `${town.cx + 8},${w.y1}`]);
  const add = (type, x, y) => w.pieces.push({ type, x, y });
  if (towers) for (const [tx, ty] of [[w.x0, w.y0], [w.x1 - 1, w.y0], [w.x0, w.y1 - 1], [w.x1 - 1, w.y1 - 1]]) add('wall_tower', tx, ty);
  for (let x = w.x0; x <= w.x1; x++) for (const y of [w.y0, w.y1]) if (!inTower(x, y)) add(gates.has(`${x},${y}`) ? gate : wall, x, y);
  for (let y = w.y0 + 1; y < w.y1; y++) for (const x of [w.x0, w.x1]) if (!inTower(x, y)) add(gates.has(`${x},${y}`) ? gate : wall, x, y);
  // gates first, then the rest from the main street outward, so the town is never left half-enclosed behind a gap
  w.pieces.sort((a, b) => (/gate/.test(b.type) ? 1 : 0) - (/gate/.test(a.type) ? 1 : 0));
  st.wall = w;
  town.rx = Math.min(town.rx, R - 4);
  return w;
}

// Places up to `n` wall pieces; a piece that cannot stand (water, a building in the way) is skipped, leaving a gap.
function wallPlot(terrain, civ, st, instant, n = 4) {
  const w = st.wall;
  let first = null;
  while (w && w.pieces.length && n > 0) {
    const pc = w.pieces[0];
    if (!affordable(civ, terrain, st, pc.type)) break;
    w.pieces.shift();
    if (!terrain.canPlaceBuilding(pc.type, pc.x, pc.y)) continue;
    const b = placeAt(terrain, civ, st, pc.type, pc.x, pc.y, instant);
    if (b) { first = first || b; n--; }
  }
  return first;
}

function queueStreet(terrain, civ, st, row, instant) {
  const town = st.town;
  const kind = roadKindFor(eraTier(civ));
  const reachOut = st.wall && row === town.y0 ? st.wall.R + 3 : town.rx + 2; // the main street runs out through the gates
  const x0 = town.cx - reachOut;
  const x1 = town.cx + reachOut;
  if (instant) {
    for (let x = x0; x <= x1; x++) terrain.setRoad(x, row, kind);
    for (const ax of [town.cx - 8, town.cx + 8]) for (let y = town.y0 - ROW_SPACING * 2; y <= town.y0 + ROW_SPACING * 2; y++) terrain.setRoad(ax, y, kind);
    return;
  }
  queueRow(terrain, st, x0, x1, row, kind);
}

// Edge land around (outside) the built-up area: fields, pens, camps, towers...
function edgePlot(terrain, civ, st, type, instant) {
  const town = st.town;
  const def = BUILDING_TYPES[type];
  const ex = { x0: town.cx - town.rx - 2, x1: town.cx + town.rx + 2, y0: town.y0 - ROW_SPACING - 5, y1: town.y0 + ROW_SPACING + 3 };
  const wantFertile = type === 'farm' || type === 'pen';
  const cands = [];
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
    cands.push({ x, y, score });
  }
  const best = bestReachable(terrain, st, cands, c => ({ x: c.x + (def.door ? def.door.x : def.w >> 1), y: c.y + def.h }));
  return best ? placeAt(terrain, civ, st, type, best.x, best.y, instant) : null;
}

// Next to a deposit (lumber camps, quarries, mines): a spot beside the nearest deposit of `res` within reach.
function depositPlot(terrain, civ, st, type, res, instant) {
  const def = BUILDING_TYPES[type];
  let target = null;
  if (DISCOVERABLE.includes(res)) target = nearestKnown(civ, terrain, res, st.x, st.y);
  else target = terrain.findNearestDeposit(st.x, st.y, res, 50, { minAmount: 2 });
  if (!target || Math.hypot(target.x - st.x, target.y - st.y) > 60) return null;
  const cands = [];
  for (let attempt = 0; attempt < 60; attempt++) {
    const x = target.x + Math.round((random() * 2 - 1) * 7) - 1;
    const y = target.y + Math.round((random() * 2 - 1) * 7) - 1;
    if (!terrain.canPlaceBuilding(type, x, y)) continue;
    if (hasBuildingNear(terrain, x, y, def.w, def.h, 1, 1, 1, 1)) continue;
    const score = Math.hypot(x + def.w / 2 - target.x, y + def.h / 2 - target.y) + random();
    cands.push({ x, y, score });
  }
  const best = bestReachable(terrain, st, cands, c => ({ x: c.x + (def.door ? def.door.x : def.w >> 1), y: c.y + def.h }));
  return best ? placeAt(terrain, civ, st, type, best.x, best.y, instant) : null;
}

// A dock on the shore nearest to the settlement.
function dockPlot(terrain, civ, st, instant) {
  const def = BUILDING_TYPES.dock;
  let best = null;
  let bestScore = Infinity;
  for (let attempt = 0; attempt < 90; attempt++) {
    const x = st.x + Math.round((random() * 2 - 1) * 32);
    const y = st.y + Math.round((random() * 2 - 1) * 32);
    if (!terrain.canPlaceBuilding('dock', x, y)) continue;
    const score = Math.hypot(x - st.x, y - st.y);
    if (score < bestScore) { bestScore = score; best = { x, y, def }; }
  }
  return best ? placeAt(terrain, civ, st, 'dock', best.x, best.y, instant) : null;
}

// ---------- the wish list ----------

function housingType(civ, terrain, st, tier) {
  const options = [];
  const consider = (type, w) => { if (BUILDING_TYPES[type].tier <= tier && affordable(civ, terrain, st, type)) options.push([type, w]); };
  // each age builds its own kind of home; the previous age's homes stay possible for a while, older ones no more
  consider('tent', tier === 0 ? 1.2 : 0);
  consider('hut', tier === 0 ? 2 : (tier === 1 ? 0.2 : 0));
  consider('wooden_house', tier === 1 ? 3 : (tier === 2 ? 0.8 : 0));
  consider('longhouse', tier === 1 ? 1.5 : (tier === 2 ? 0.4 : 0));
  consider('stone_house', tier === 2 ? 3 : (tier === 3 ? 1 : 0));
  consider('manor', tier === 3 ? 3 : (tier === 4 ? 0.8 : 0));
  consider('tenement', tier === 4 ? 3 : (tier === 5 ? 0.8 : 0));
  consider('habitat', tier >= 5 ? 3 : 0);
  if (!options.length) return tier === 0 ? 'tent' : (affordable(civ, terrain, st, 'hut') ? 'hut' : 'tent');
  let total = 0;
  for (const o of options) total += o[1];
  let r = random() * total;
  for (const o of options) { r -= o[1]; if (r <= 0) return o[0]; }
  return options[options.length - 1][0];
}

// The wish list of one settlement: [{ type, weight, kind, res? }] (exported for tests)
export function wishes(civ, terrain, st, n, tier, cn) {
  const pop = Math.max(st.population || 0, 3);
  const list = [];
  const need = new Set();
  const nextEra = ERAS[Math.min(ERAS.length - 1, tier + 1)];
  for (const t of (ERA_REQUIREMENTS[nextEra.id] && ERA_REQUIREMENTS[nextEra.id].buildings) || []) need.add(t);
  const have = type => (n[type] || 0);
  const civHave = type => (cn[type] || 0);   // across all settlements: specialised buildings are shared by the whole civilization
  const nSettle = Math.max(1, settlementsOf(civ).length);
  const want = (type, weight, kind = 'plot', res = null) => {
    const def = BUILDING_TYPES[type];
    // buildings of the next era's requirements may be raised one era early (a kiln and a smithy lead INTO the bronze age)
    if (!def || (def.tier > tier && !(def.tier === tier + 1 && need.has(type))) || !affordable(civ, terrain, st, type)) return;
    if (need.has(type) && civHave(type) === 0) weight *= 3;
    list.push({ type, weight, kind, res });
  };

  // shelter first: nobody should sleep rough for long
  const openHousing = openSites(terrain, st).filter(b => BUILDING_TYPES[b.type].category === 'housing').length;
  const freeBeds = housingCapacity(terrain, st) - (st.adults || 0);
  if ((st.homeless > 0 || freeBeds < 2) && openHousing < Math.min(5, 1 + Math.floor((st.homeless || 0) / 2) + Math.floor(pop / 10))) list.push({ type: 'housing', weight: 8 + (st.homeless || 0), kind: 'plot' });
  // renewal: homes from an earlier age are replaced one at a time by homes of this age (see retireOldHouse)
  else if (openHousing < 1 && outdatedHouses(terrain, st, tier).length) list.push({ type: 'housing', weight: 3, kind: 'plot' });

  const farms = have('farm');
  if (farms < Math.min(12, Math.ceil(pop / 7)) || (st.shortage.food && farms < 14)) want('farm', 5, 'edge');
  if (have('lumber_camp') < 1 + Math.floor(pop / 30) && (st.jobs.woodcutter || 0) >= 2) want('lumber_camp', 3, 'deposit', 'wood');
  {
    if (have('granary') < Math.floor(pop / 14) + (pop >= 6 ? 1 : 0)) want('granary', 3);
    if (have('well') < Math.floor(pop / 12) && pop >= 6) want('well', 1.5);
    if (have('quarry') < 1 && civHave('quarry') < 1 + Math.floor(nSettle / 2) && pop >= 6 && !st.noQuarry) want('quarry', need.has('quarry') ? 3 : 1.5, 'deposit', 'stone');
    if (civHave('workshop') < 1 + Math.floor(nSettle / 3) && pop >= 6) want('workshop', 2.5);
    if (civHave('kiln') < 1 + Math.floor(nSettle / 3) && pop >= 5) want('kiln', 2.5);
    if (civHave('smithy') < 1 + Math.floor(nSettle / 3) && pop >= 6 && (isDiscovered(civ, 'copper') || isDiscovered(civ, 'iron'))) want('smithy', 3);
    if (have('market_stall') + have('market') < Math.floor(pop / 12) && pop >= 8 && tier < 2) want('market_stall', 1.2);
    // pens for tamed herds (livestock.js) from the first farms on: meat besides grain
    if (have('pen') < Math.max(1, Math.floor(farms / 2)) && farms >= 1 && pop >= 5) want('pen', 2, 'edge');
    if (have('dock') < 1 && pop >= 8 && st.fishNear !== false) want('dock', 1.2, 'dock');
    if (have('watchtower') < Math.min(3, 1 + Math.floor(pop / 14)) && pop >= 8) want('watchtower', 0.8, 'edge');
  }
  {
    if (civHave('market') < 1 + Math.floor(nSettle / 3) && have('market') < 1 && pop >= 8) want('market', 2);
    if (civHave('tavern') < 1 + Math.floor(nSettle / 3) && have('tavern') < 1 && pop >= 10) want('tavern', 1);
    if (have('windmill') < Math.floor(farms / 3) && farms >= 3) want('windmill', 1, 'edge');
    for (const [res, k] of [['copper', 1], ['tin', 1], ['iron', 2], ['coal', 2], ['gold', 3]]) {
      if (isDiscovered(civ, res) && civHave('mine') < Math.min(6, 1 + Math.floor(nSettle / 2)) && have('mine') < 2 && pop >= 8 && k) {
        want('mine', need.has('mine') ? 3 : 1.2, 'deposit', res);
        break;
      }
    }
  }
  {
    if (civHave('library') < 1 + Math.floor(nSettle / 4) && pop >= 8) want('library', 1.5);
    if (civHave('barracks') < 1 + Math.floor(nSettle / 4) && pop >= 14) want('barracks', 1);
    if (st.capital && have('keep') < 1 && pop >= 18) want('keep', 2.5);
  }
  {
    if (civHave('factory') < 1 + Math.floor(nSettle / 3) && pop >= 10) want('factory', 2, 'edge');
    if (civHave('power_plant') < 1 + Math.floor(nSettle / 4) && pop >= 12) want('power_plant', 1.5, 'edge');
  }
  // a settlement with a faith raises a holy place; bigger and later towns raise temples and cathedrals (religion.js)
  if (st.faithId) {
    const holy = have('shrine') + have('temple') + have('cathedral');
    if (holy < 1 && pop >= 5) want('shrine', 2);
    if (have('temple') + have('cathedral') < 1 && pop >= 14) want('temple', 1.5);
    if (st.capital && have('cathedral') < 1 && pop >= 24) want('cathedral', 1.2);
  }
  // a town of size walls itself (once it has a street grid worth defending): the plan is drawn once, the pieces follow
  if (tier >= 1 && tier <= 3 && pop >= WALL_MIN_POP && (st.capital || pop >= 24)) {
    if (!st.wall) planWall(civ, terrain, st, tier);
    if (st.wall.pieces.length && affordable(civ, terrain, st, st.wall.pieces[0].type)) list.push({ type: st.wall.kind === 'stone' ? 'stone_wall' : 'palisade', weight: 2.2, kind: 'wall' });
  }
  if (st.capital && have('spaceport') < 1 && pop >= 14) want('spaceport', 3, 'edge');
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

function ensureCensusFields(st) {
  if (!st.shortage) st.shortage = {};
  if (!st.jobs) st.jobs = {};
  if (!st.roadQueue) st.roadQueue = [];
}

// Plans one building (a construction site, or finished with { instant: true }). Returns it or null.
export function planSettlement(civ, terrain, st, { instant = false, maxSites = null } = {}) {
  ensureCensusFields(st);
  const town = st.town;
  if (!town.ready) return null;
  const tier = eraTier(civ);
  const n = counts(terrain, st);
  const cn = {};
  for (const other of settlementsOf(civ)) for (const [k, v] of Object.entries(other === st ? n : counts(terrain, other))) cn[k] = (cn[k] || 0) + v;
  // wall pieces are raised by the whole town over time, they do not hold up other building
  const sites = openSites(terrain, st).filter(b => !BUILDING_TYPES[b.type].connects).length;
  town.rx = Math.min(st.wall ? st.wall.R - 4 : 24, 6 + Math.floor((n.housing || 0) * 0.9));
  const cap = maxSites !== null ? maxSites : Math.max(2, 1 + Math.ceil(((st.jobs.builder || 0) + (st.jobs.hauler || 0)) / 2));
  if (sites >= cap && !instant) return null;
  const list = wishes(civ, terrain, st, n, tier, cn);
  if (!list.length) return null;
  const w = pick(list);
  const type = w.type === 'housing' ? housingType(civ, terrain, st, tier) : w.type;
  let b = null;
  if (w.kind === 'wall') b = wallPlot(terrain, civ, st, instant);
  else if (w.kind === 'edge') b = edgePlot(terrain, civ, st, type, instant);
  else if (w.kind === 'deposit') b = depositPlot(terrain, civ, st, type, w.res, instant);
  else if (w.kind === 'dock') {
    b = dockPlot(terrain, civ, st, instant);
    if (!b) st.fishNear = false;
  } else if (tier === 0 && BUILDING_TYPES[type].category === 'housing') b = ringPlot(terrain, civ, st, type, instant);
  else b = streetPlot(terrain, civ, st, type, instant);
  if (!b && w.type === 'quarry') st.noQuarry = true;
  if (!b && w.type === 'housing') return edgePlot(terrain, civ, st, 'tent', instant);
  return b;
}

// Places one finished building of `type` for the settlement at once (a god's gift, e.g. Starward Vision's spaceport):
// on the edge if it fits there, else on a street plot. Returns the building or null.
export function placeLandmark(civ, terrain, st, type) {
  return edgePlot(terrain, civ, st, type, true) || streetPlot(terrain, civ, st, type, true);
}

export function growTown(civ, terrain, opts = {}) {
  for (const st of settlementsOf(civ)) {
    const b = planSettlement(civ, terrain, st, opts);
    if (b) return b;
  }
  return null;
}

// Founds the capital: a settlement at the civ's capital point with a hall site (the hall's door street becomes the
// capital), a few starter dwellings and a field. With { instant } they stand finished.
export function initTown(civ, terrain, { instant = false, stock = STARTER_KIT } = {}) {
  if (settlementsOf(civ).length) return null;
  const st = createSettlement(civ, civ.capitalX, civ.capitalY, { capital: true, stock });
  const town = st.town;
  let type = eraTier(civ) >= 3 ? 'keep' : 'hall';
  let def = BUILDING_TYPES[type];
  const tryAt = (cx, cy) => {
    const x = cx - (def.door ? def.door.x : 0);
    const y = cy - def.h;
    return terrain.canPlaceBuilding(type, x, y) ? { x, y } : null;
  };
  let spot = null;
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
  const hall = placeAt(terrain, civ, st, type, spot.x, spot.y, instant);
  if (!hall) return null;
  const front = frontTile(hall);
  civ.capitalX = front.x;
  civ.capitalY = front.y;
  st.x = front.x;
  st.y = front.y;
  town.cx = front.x;
  town.y0 = front.y;
  town.ready = true;
  queueStreet(terrain, civ, st, town.y0, instant);
  starterSites(civ, terrain, st, instant, 2);
  return hall;
}

function starterSites(civ, terrain, st, instant, homes) {
  const tier = eraTier(civ);
  for (let i = 0; i < homes; i++) (tier === 0 ? ringPlot : streetPlot)(terrain, civ, st, tier === 0 ? 'tent' : housingType(civ, terrain, st, tier), instant);
  edgePlot(terrain, civ, st, 'farm', instant);
}

// A new hamlet at `site` {x,y} (found by the clan splinter). Returns the settlement.
export function foundHamlet(civ, terrain, site, { instant = false, name = null, year = 0 } = {}) {
  const st = createSettlement(civ, site.x, site.y, { name, capital: false, year });
  const town = st.town;
  town.cx = site.x;
  town.y0 = site.y;
  town.ready = true;
  revealAround(civ, terrain, site.x, site.y, 10);
  // the camp's plaza and a main street
  queueStreet(terrain, civ, st, town.y0, instant);
  starterSites(civ, terrain, st, instant, 2);
  // the new hamlet claims the land around it
  for (let i = 0; i < 12; i++) {
    const tx = site.x + Math.round((random() - 0.5) * 10);
    const ty = site.y + Math.round((random() - 0.5) * 10);
    if (!terrain.inBounds(tx, ty)) continue;
    const t = terrain.getTile(tx, ty);
    if (t.biome.isWater || (t.civId && t.civId !== civ.id)) continue;
    t.civId = civ.id;
    if (!civ.territory.some(p => p.x === tx && p.y === ty)) civ.territory.push({ x: tx, y: ty });
  }
  return st;
}

// ---------- the passing of the ages: renovation and renewal ----------

// The age a building was built in (style.era), or the first age its type belongs to (old saves)
export function eraOfBuilding(b) {
  if (b.style && b.style.era !== undefined) return b.style.era;
  return BUILDING_TYPES[b.type] ? BUILDING_TYPES[b.type].tier : 0;
}

// Finished homes of an age before the previous one (and every tent once the Stone Age is over), oldest age first.
export function outdatedHouses(terrain, st, tier) {
  return housesOf(terrain, st)
    .filter(b => BUILDING_TYPES[b.type].tier < tier - 1 || (tier >= 1 && b.type === 'tent'))
    .sort((a, b) => (BUILDING_TYPES[a.type].tier - BUILDING_TYPES[b.type].tier) || (a.id - b.id));
}

// A new home was finished: if the settlement can spare its oldest outdated home, it is pulled down (its people move
// into the new one at the next family tick). Returns the removed building or null.
export function retireOldHouse(civ, terrain, st) {
  const old = outdatedHouses(terrain, st, eraTier(civ))[0];
  if (!old) return null;
  const spare = housingCapacity(terrain, st) - BUILDING_TYPES[old.type].capacity - (st.adults || 0);
  if (spare < 0) return null;
  terrain.removeBuilding(old.id, { ruins: false });
  return old;
}

export const RENOVATE_INTERVAL = 6; // simulated seconds between two renovations in one settlement

// Now and then one building of an earlier age is renovated in the style of the current age (new walls, roof, trim),
// so a town changes its look gradually as its people move from age to age. Returns the renovated building or null.
export function renovateOne(civ, terrain, st) {
  const tier = eraTier(civ);
  let pick = null;
  for (const b of buildingsOf(terrain, st)) {
    if (b.progress < 1 || b.type === 'ruins' || eraOfBuilding(b) >= tier) continue;
    if (!pick || eraOfBuilding(b) < eraOfBuilding(pick) || (eraOfBuilding(b) === eraOfBuilding(pick) && b.id < pick.id)) pick = b;
  }
  if (!pick) return null;
  // an age at a time: a Stone Age hut does not jump straight into the Space Age
  const era = Math.min(tier, eraOfBuilding(pick) + 1);
  const base = pick.style || terrain.styleFor(pick.type, pick.x, pick.y);
  pick.style = { ...base, pal: base.pal === 'timber' && era >= 3 ? 'stone' : base.pal, accent: civ.color, era };
  terrain.syncBuildingTiles(pick);
  if (terrain.spawnParticles) {
    const def = BUILDING_TYPES[pick.type];
    terrain.spawnParticles(pick.x + def.w / 2, pick.y + def.h / 2, 10, '#d6c7a1', 1);
  }
  return pick;
}

// Timers: plans growth now and then, and renovates. Construction itself is done by the settlement's people (jobs.js).
export function tickTown(civ, terrain, dt) {
  for (const st of settlementsOf(civ)) {
    const town = st.town;
    if (!town || !town.ready) continue;
    town.cooldown -= dt;
    if (town.cooldown <= 0) {
      town.cooldown = PLAN_INTERVAL;
      planSettlement(civ, terrain, st);
    }
    st.renovateTimer = (st.renovateTimer === undefined ? RENOVATE_INTERVAL : st.renovateTimer) - dt;
    if (st.renovateTimer <= 0) {
      st.renovateTimer = RENOVATE_INTERVAL;
      renovateOne(civ, terrain, st);
    }
  }
}

export { doorTile, housesOf };
