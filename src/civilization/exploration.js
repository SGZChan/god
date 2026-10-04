// What a civilization knows about the planet: a coarse explored map (16x16-tile cells) and the deposits it has found.
//
//   civ.explored      array of explored cell indices (cy * cellsWide + cx), saved as plain JSON
//   civ.knownDeposits [{ type, x, y }] -- the format the divine power "Revelation of Ore" appends to
//   civ.discovered    resource types the civ has found at least one deposit of (derived from knownDeposits)
//
// Scouts (and everyone who walks) reveal cells; scouts also notice ore veins nearby. Common resources (wood, stone,
// clay, fibre, berries, fish...) are local knowledge and need no discovery; ores, gems, oil and uranium do.
import { RESOURCES, ORE_TYPES } from '../world/resources.js';

export const CELL = 16;
export const DISCOVERABLE = [...ORE_TYPES]; // copper, tin, iron, coal, gold, gems, obsidian, oil, uranium

const cache = new WeakMap(); // civ -> Set of explored cells (runtime index of civ.explored)

export function cellsWide(terrain) {
  return Math.ceil(terrain.width / CELL);
}

function indexOf(civ) {
  let set = cache.get(civ);
  if (!set || set.size !== (civ.explored || []).length) {
    set = new Set(civ.explored || []);
    cache.set(civ, set);
  }
  return set;
}

export function isExplored(civ, terrain, x, y) {
  if (!civ.explored) return false;
  return indexOf(civ).has(Math.floor(y / CELL) * cellsWide(terrain) + Math.floor(x / CELL));
}

export function exploredCount(civ) {
  return civ.explored ? civ.explored.length : 0;
}

export function exploredFraction(civ, terrain) {
  return exploredCount(civ) / (cellsWide(terrain) * Math.ceil(terrain.height / CELL));
}

// Marks the cells within `radius` tiles of (x, y) as explored; returns how many were new.
export function revealAround(civ, terrain, x, y, radius = 8) {
  if (!civ.explored) civ.explored = [];
  const set = indexOf(civ);
  const w = cellsWide(terrain);
  let added = 0;
  const cx0 = Math.max(0, Math.floor((x - radius) / CELL));
  const cx1 = Math.min(w - 1, Math.floor((x + radius) / CELL));
  const cy0 = Math.max(0, Math.floor((y - radius) / CELL));
  const cy1 = Math.min(Math.ceil(terrain.height / CELL) - 1, Math.floor((y + radius) / CELL));
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const idx = cy * w + cx;
      if (set.has(idx)) continue;
      set.add(idx);
      civ.explored.push(idx);
      added++;
    }
  }
  return added;
}

export function knownTypes(civ) {
  const s = new Set(civ.discovered || []);
  for (const k of civ.knownDeposits || []) s.add(k.type);
  return s;
}

export function isDiscovered(civ, type) {
  if (!DISCOVERABLE.includes(type)) return true;
  return knownTypes(civ).has(type);
}

// Brings civ.discovered in line with civ.knownDeposits (the Revelation power writes only the latter) and announces
// new finds. `notify(text)` is optional.
export function syncDiscoveries(civ, notify) {
  if (!civ.discovered) civ.discovered = [];
  for (const k of civ.knownDeposits || []) {
    if (!civ.discovered.includes(k.type)) {
      civ.discovered.push(k.type);
      if (notify && DISCOVERABLE.includes(k.type)) notify(`🧭 ${civ.name} discovered ${RESOURCES[k.type] ? RESOURCES[k.type].name.toLowerCase() : k.type}!`);
    }
  }
}

// Adds a deposit to the civ's knowledge (true when it was not known yet).
export function learnDeposit(civ, type, x, y) {
  if (!civ.knownDeposits) civ.knownDeposits = [];
  for (const k of civ.knownDeposits) if (k.type === type && Math.abs(k.x - x) <= 3 && Math.abs(k.y - y) <= 3) return false;
  civ.knownDeposits.push({ type, x, y });
  return true;
}

// A scout at (x, y) notices ore veins within `radius`: every discoverable type with a deposit that close is learned.
// Returns the list of newly learned types (for tests and notifications).
export function scanForDeposits(civ, terrain, x, y, radius = 11) {
  const found = [];
  for (const type of DISCOVERABLE) {
    if (type === 'oil' && radius > 14) continue;
    const d = terrain.findNearestDeposit(x, y, type, radius, { minAmount: 1 });
    if (d && learnDeposit(civ, type, d.x, d.y)) found.push(type);
  }
  return found;
}

// The known deposit of `type` nearest to (x, y) that still holds something (depleted entries are dropped).
export function nearestKnown(civ, terrain, type, x, y) {
  const list = civ.knownDeposits;
  if (!list) return null;
  let best = null;
  let bestD = Infinity;
  for (let i = list.length - 1; i >= 0; i--) {
    const k = list[i];
    if (k.type !== type) continue;
    const dep = terrain.peekDeposit(k.x, k.y);
    // the vein may be partly mined: look for any tile of it within a few tiles
    let live = dep && dep.type === type && dep.amount > 0 ? { x: k.x, y: k.y } : null;
    if (!live) {
      const near = terrain.findNearestDeposit(k.x, k.y, type, 9, { minAmount: 1 });
      if (near) live = { x: near.x, y: near.y };
    }
    if (!live) {
      if (!list.some(o => o !== k && o.type === type)) continue; // keep the last entry so the discovery is not forgotten
      list.splice(i, 1);
      continue;
    }
    const d = Math.hypot(live.x - x, live.y - y);
    if (d < bestD) {
      bestD = d;
      best = { x: live.x, y: live.y, type, distance: d };
    }
  }
  return best;
}
