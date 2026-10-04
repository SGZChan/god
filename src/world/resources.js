// Planetary resources: the catalog of everything creatures can gather, and the seeded generator layers that
// decide which tile holds which deposit.
//
// A tile holds at most one `deposit: { type, amount, max? }`:
//   * minerals (stone, clay, ores...) are finite: `amount` only goes down, at 0 the deposit disappears.
//   * renewables (wood, fibre, berries, fish, freshwater) have `max` and regrow toward it. A felled tree is a
//     stump (amount 0) that grows back, so the deposit stays on the tile.
//
// Placement is a pure function of (planet seed, x, y): ore veins are defined per coarse 64x64 cell (a few
// seeded elliptical veins per ore, only where the host rock fits), everything else follows biome, elevation,
// rivers and a clumping noise. Nothing depends on which chunks were generated first.
//
// The terrain API built on this lives in src/planet/terrain.js: getDeposit, extract, findNearestDeposit, regrow.
import { Noise2D, hash01 } from './noise.js';

// tier: 0 stone age, 1 bronze age, 2 iron/classical, 3 industrial, 4 atomic/space age
// regrowPerYear: fraction of `max` a renewable regains each simulated year (one year = 4 simulated seconds)
export const RESOURCES = {
  wood:       { id: 'wood',       name: 'Wood',        category: 'renewable', tier: 0, color: '#8b5a2b', regrowPerYear: 0.02, description: 'Timber from trees: fuel, shelter, tools and ships.' },
  stone:      { id: 'stone',      name: 'Stone',       category: 'mineral',   tier: 0, color: '#9aa0a6', description: 'Quarried rock for tools, walls and buildings.' },
  clay:       { id: 'clay',       name: 'Clay',        category: 'mineral',   tier: 0, color: '#c0764a', description: 'Soft earth for pottery and bricks, found on riverbanks and lowlands.' },
  flint:      { id: 'flint',      name: 'Flint',       category: 'mineral',   tier: 0, color: '#4b5563', description: 'Hard nodules that flake into blades and spark fire.' },
  fibre:      { id: 'fibre',      name: 'Plant Fibre', category: 'renewable', tier: 0, color: '#c8d86a', regrowPerYear: 0.25, description: 'Grasses and reeds for rope, cloth and thatch.' },
  berries:    { id: 'berries',    name: 'Wild Food',   category: 'renewable', tier: 0, color: '#c026d3', regrowPerYear: 0.5, description: 'Berries, roots and nuts that can be gathered without farming.' },
  fish:       { id: 'fish',       name: 'Fish',        category: 'animal',    tier: 0, color: '#38bdf8', regrowPerYear: 0.15, description: 'Shoals in the shallows, the sea and the rivers.' },
  freshwater: { id: 'freshwater', name: 'Fresh Water', category: 'water',     tier: 0, color: '#7dd3fc', regrowPerYear: 5, description: 'Clean river water to drink and irrigate with.' },
  salt:       { id: 'salt',       name: 'Salt',        category: 'mineral',   tier: 0, color: '#f1f5f9', description: 'Preserves food; crusts on coasts and dry desert flats.' },
  sand:       { id: 'sand',       name: 'Sand',        category: 'mineral',   tier: 0, color: '#e8d28a', description: 'Beach and dune sand, the raw stuff of glass.' },
  obsidian:   { id: 'obsidian',   name: 'Obsidian',    category: 'mineral',   tier: 0, color: '#4c1d95', description: 'Volcanic glass that takes the sharpest edge of the stone age.' },
  copper:     { id: 'copper',     name: 'Copper',      category: 'mineral',   tier: 1, color: '#e0803a', description: 'A soft red metal, the first to be smelted.' },
  tin:        { id: 'tin',        name: 'Tin',         category: 'mineral',   tier: 1, color: '#cfd8dc', description: 'Alloyed with copper it makes bronze.' },
  gold:       { id: 'gold',       name: 'Gold',        category: 'mineral',   tier: 1, color: '#fbbf24', description: 'A rare bright metal that never tarnishes: wealth and ornament.' },
  iron:       { id: 'iron',       name: 'Iron',        category: 'mineral',   tier: 2, color: '#b4553a', description: 'The hard metal of plough and sword, smelted in a hot furnace.' },
  coal:       { id: 'coal',       name: 'Coal',        category: 'mineral',   tier: 2, color: '#1f2937', description: 'Black seams of fuel: smelting, steam and industry.' },
  gems:       { id: 'gems',       name: 'Gemstones',   category: 'mineral',   tier: 2, color: '#e879f9', description: 'Rare crystals prized for their beauty and for fine tools.' },
  oil:        { id: 'oil',        name: 'Oil',         category: 'mineral',   tier: 3, color: '#6b4f2a', description: 'Deep crude oil in lowland basins and offshore: fuel and plastics.' },
  uranium:    { id: 'uranium',    name: 'Uranium',     category: 'mineral',   tier: 4, color: '#84cc16', description: 'Faintly glowing ore buried deep in the mountains: atomic power.' }
};

export const RESOURCE_TYPES = Object.keys(RESOURCES);
export const TIER_NAMES = ['Stone Age', 'Bronze Age', 'Iron Age', 'Industrial Age', 'Space Age'];

export function isRenewable(type) {
  const info = RESOURCES[type];
  return Boolean(info) && info.category !== 'mineral';
}

// ---------- ore veins ----------

const CELL = 64; // veins are defined per 64x64 tile cell
const MAX_VEIN_RADIUS = 18;

const isLand = t => !t.biome.isWater;

// Where each ore may lie. `tries` seeded positions are drawn per cell; each one that sits on suitable ground
// becomes a vein with probability `p`.
const ORES = [
  { type: 'copper', rank: 1,   tries: 4, p: 0.32, radius: 5,  amount: 120, host: t => isLand(t) && t.elevation > 0.58 && t.elevation < 0.97 },
  { type: 'tin', rank: 0.7,      tries: 4, p: 0.24, radius: 4,  amount: 90,  host: t => isLand(t) && t.elevation > 0.6 && t.elevation < 0.97 },
  { type: 'iron', rank: 0.9,     tries: 4, p: 0.3,  radius: 6,  amount: 200, host: t => isLand(t) && t.elevation > 0.6 && t.elevation < 0.97 },
  // coal lies under forested hills
  { type: 'coal', rank: 1,     tries: 4, p: 0.34, radius: 8,  amount: 220, host: t => isLand(t) && t.elevation > 0.55 && t.elevation < 0.84 && t.moisture > 0.45 && t.temperature > 0.22 },
  { type: 'gold', rank: 0.4,     tries: 4, p: 0.12, radius: 3,  amount: 40,  host: t => isLand(t) && t.elevation > 0.62 && t.elevation < 0.97 },
  { type: 'gems', rank: 0.3,     tries: 4, p: 0.08, radius: 2.6, amount: 25, host: t => isLand(t) && t.elevation > 0.7 && t.elevation < 0.97 },
  { type: 'obsidian', rank: 0.5, tries: 3, p: 0.6,  radius: 6,  amount: 150, host: t => t.biome.id === 'VOLCANIC' },
  // oil: lowland basins on land and offshore under the shelf
  { type: 'oil', rank: 1,      tries: 3, p: 0.2,  radius: 11, amount: 500, host: t => (isLand(t) && t.elevation > 0.5 && t.elevation < 0.58 && t.biome.id !== 'GLACIAL_ICE') || (!isLand(t) && t.elevation > 0.3 && t.elevation < 0.47) },
  { type: 'uranium', rank: 0.2,  tries: 4, p: 0.06, radius: 2.6, amount: 60, host: t => isLand(t) && t.elevation > 0.72 && t.elevation < 0.97 }
];
const ORE_BY_TYPE = Object.fromEntries(ORES.map((o, i) => [o.type, { ...o, index: i }]));
export const ORE_TYPES = ORES.map(o => o.type);

// ---------- common deposits by biome ----------

// Cumulative-probability tables: one roll per tile picks at most one deposit (earlier entries win).
const FOREST_WOOD = { TEMPERATE_FOREST: 0.62, RAINFOREST: 0.78, TAIGA: 0.55, ALIEN_BLOOM: 0.4, SAVANNA: 0.07, GRASSLAND: 0.03, TUNDRA: 0.015 };

export class ResourceField {
  // `generator` supplies terrainAt(x, y) for the host-rock checks of veins.
  constructor(base, width, height, generator) {
    this.base = base;
    this.width = width;
    this.height = height;
    this.gen = generator;
    this.clump = new Noise2D(base ^ 0xc1c1);
    this.edge = new Noise2D(base ^ 0xd2d2);
    this.cellCache = new Map();   // "cx,cy" -> veins of that cell
    this.sampleCache = new Map(); // "cx,cy" -> sampled common deposits of that 32x32 cell
  }

  static isOre(type) {
    return type in ORE_BY_TYPE;
  }

  // ---------- veins ----------

  // The veins whose centre lies in cell (cx, cy), all ore types, built once and cached.
  veinsInCell(cx, cy) {
    const key = cx * 100003 + cy;
    let veins = this.cellCache.get(key);
    if (veins) return veins;
    veins = [];
    for (const ore of ORES) {
      for (let k = 0; k < ore.tries; k++) {
        const salt = this.base ^ (0x5bd1e995 * (ore.index + 1)) ^ (k * 0x9e3779b1);
        const vx = cx * CELL + 2 + Math.floor(hash01(salt, cx, cy) * (CELL - 4));
        const vy = cy * CELL + 2 + Math.floor(hash01(salt ^ 0x1234567, cx, cy) * (CELL - 4));
        if (vx >= this.width || vy >= this.height) continue;
        if (hash01(salt ^ 0x7654321, cx, cy) >= ore.p) continue;
        if (!ore.host(this.gen.terrainAt(vx, vy))) continue;
        const a = ore.radius * (0.8 + hash01(salt ^ 0x2222, cx, cy) * 0.6);
        const b = a * (0.35 + hash01(salt ^ 0x3333, cx, cy) * 0.3);
        const angle = hash01(salt ^ 0x4444, cx, cy) * Math.PI;
        veins.push({
          type: ore.type,
          x: vx,
          y: vy,
          a,
          b,
          cos: Math.cos(angle),
          sin: Math.sin(angle),
          rich: 0.6 + hash01(salt ^ 0x5555, cx, cy) * 0.8
        });
      }
    }
    this.cellCache.set(key, veins);
    return veins;
  }

  // Ore deposit at a tile, or null. `t` is the terrain sample of that tile.
  veinDeposit(x, y, t) {
    const cx = Math.floor(x / CELL);
    const cy = Math.floor(y / CELL);
    const lx = x - cx * CELL;
    const ly = y - cy * CELL;
    const x0 = lx < MAX_VEIN_RADIUS ? cx - 1 : cx;
    const x1 = lx >= CELL - MAX_VEIN_RADIUS ? cx + 1 : cx;
    const y0 = ly < MAX_VEIN_RADIUS ? cy - 1 : cy;
    const y1 = ly >= CELL - MAX_VEIN_RADIUS ? cy + 1 : cy;
    let edge;
    let best = null; // where veins overlap, a tile-level draw (favouring rarer ores) picks one
    let bestScore = Infinity;
    let bestU = 0;
    for (let gy = y0; gy <= y1; gy++) {
      for (let gx = x0; gx <= x1; gx++) {
        if (gx < 0 || gy < 0) continue;
        for (const vein of this.veinsInCell(gx, gy)) {
          const ore = ORE_BY_TYPE[vein.type];
          const dx = x - vein.x;
          const dy = y - vein.y;
          if (dx > vein.a + 1 || dx < -vein.a - 1 || dy > vein.a + 1 || dy < -vein.a - 1) continue;
          const u1 = (dx * vein.cos + dy * vein.sin) / vein.a;
          const u2 = (-dx * vein.sin + dy * vein.cos) / vein.b;
          const u = u1 * u1 + u2 * u2;
          if (u > 1.4) continue;
          const centre = dx === 0 && dy === 0;
          if (!centre) {
            if (edge === undefined) edge = this.edge.noise(x * 0.45, y * 0.45) * 0.3;
            if (u + edge >= 1) continue;
            if (hash01(this.base ^ 0x6a09e667, x, y) > 0.85) continue; // gaps in the seam
          }
          if (!ore.host(t)) continue;
          const score = hash01(this.base ^ (0x9e3779b9 * (ore.index + 3)), x, y) * ore.rank;
          if (score >= bestScore) continue;
          best = vein;
          bestScore = score;
          bestU = u;
        }
      }
    }
    if (!best) return null;
    const ore = ORE_BY_TYPE[best.type];
    return { type: best.type, amount: Math.max(1, Math.round(ore.amount * best.rich * (1 - 0.55 * Math.min(1, bestU)))) };
  }

  // Veins of `type` whose centre is within `maxRadius` of (x, y), nearest first: [{ x, y, a, dist }]
  veinsNear(type, x, y, maxRadius) {
    const out = [];
    const c0x = Math.max(0, Math.floor((x - maxRadius) / CELL));
    const c1x = Math.floor((x + maxRadius) / CELL);
    const c0y = Math.max(0, Math.floor((y - maxRadius) / CELL));
    const c1y = Math.floor((y + maxRadius) / CELL);
    for (let cy = c0y; cy <= c1y; cy++) {
      for (let cx = c0x; cx <= c1x; cx++) {
        if (cx * CELL >= this.width || cy * CELL >= this.height) continue;
        for (const v of this.veinsInCell(cx, cy)) {
          if (v.type !== type) continue;
          const dist = Math.hypot(v.x - x, v.y - y);
          if (dist <= maxRadius + v.a) out.push({ x: v.x, y: v.y, a: v.a, dist });
        }
      }
    }
    return out.sort((p, q) => p.dist - q.dist);
  }

  // ---------- common deposits ----------

  depositAt(x, y, t) {
    if (t === undefined) t = this.gen.terrainAt(x, y);
    const ore = this.veinDeposit(x, y, t);
    if (ore) return ore;

    const roll = hash01(this.base ^ 0x3c6ef372, x, y);
    const biome = t.biome.id;
    const e = t.elevation;
    const clump = this.clump.fbm(x * 0.05, y * 0.05, 2);
    const clumpy = 0.45 + clump * 1.1; // 0.45 .. 1.55
    let type = null;

    if (t.biome.isWater) {
      if (t.riverDist < 0.0075) {
        type = roll < 0.3 ? 'fish' : (roll < 0.45 ? 'freshwater' : null);
      } else {
        const p = biome === 'SHALLOWS' ? 0.3 : (biome === 'OCEAN' ? 0.1 : 0.025);
        if (roll < p * clumpy) type = 'fish';
      }
    } else {
      let cum = 0;
      const pick = (name, p) => {
        if (type || p <= 0) return;
        cum += p;
        if (roll < cum) type = name;
      };
      const mountain = e > 0.62;
      if (biome === 'BEACH') {
        pick('salt', clump > 0.7 ? 0.1 : 0.015);
        pick('sand', 0.5);
      } else if (biome === 'DESERT') {
        pick('salt', clump > 0.68 && e < 0.58 ? 0.3 : 0.01);
        pick('stone', mountain ? 0.2 : 0.03);
        pick('sand', 0.3);
      } else {
        // riverbanks and wet lowlands hold clay
        if (t.riverDist < 0.03 && e < 0.62) pick('clay', 0.42);
        else if (e < 0.56 && t.moisture > 0.5) pick('clay', 0.03 * clumpy);
        if (e > 0.6 && e < 0.8) pick('flint', 0.06 * clumpy);
        if (mountain) pick('stone', Math.min(0.6, 0.12 + (e - 0.62) * 2.4));
        pick('wood', (FOREST_WOOD[biome] || 0) * clumpy * 0.9);
        if (biome === 'GRASSLAND' || biome === 'SAVANNA') pick('fibre', 0.2 * clumpy * 0.9);
        else if (biome === 'TEMPERATE_FOREST') pick('fibre', 0.04);
        if (biome === 'GRASSLAND' || biome === 'TEMPERATE_FOREST' || biome === 'RAINFOREST' || biome === 'TAIGA') {
          pick('berries', 0.08 * clumpy);
        } else if (biome === 'TUNDRA') {
          pick('berries', 0.03);
        }
        pick('stone', 0.012);
      }
    }
    if (!type) return null;
    return this.makeDeposit(type, x, y);
  }

  makeDeposit(type, x, y) {
    const h = hash01(this.base ^ 0x510e527f, x, y);
    switch (type) {
      case 'wood': { const max = Math.round(24 + h * 36); return { type, amount: max, max }; }
      case 'fibre': { const max = Math.round(12 + h * 18); return { type, amount: max, max }; }
      case 'berries': { const max = Math.round(8 + h * 12); return { type, amount: max, max }; }
      case 'fish': { const max = Math.round(20 + h * 40); return { type, amount: max, max }; }
      case 'freshwater': return { type, amount: 200, max: 200 };
      case 'stone': return { type, amount: Math.round(60 + h * 140) };
      case 'clay': return { type, amount: Math.round(80 + h * 70) };
      case 'flint': return { type, amount: Math.round(30 + h * 40) };
      case 'salt': return { type, amount: Math.round(60 + h * 60) };
      case 'sand': return { type, amount: Math.round(150 + h * 150) };
      default: return null;
    }
  }

  // Coarse index for the common (non-ore) types: a 4-tile-stride sample of the 32x32 cell (cx, cy).
  // Returns Map type -> [x, y, x, y...] of sample points that hold that deposit.
  sampleCell(cx, cy) {
    const key = cx * 100003 + cy;
    let cell = this.sampleCache.get(key);
    if (cell) return cell;
    cell = new Map();
    const x0 = cx * 32;
    const y0 = cy * 32;
    for (let y = y0 + 2; y < y0 + 32; y += 4) {
      for (let x = x0 + 2; x < x0 + 32; x += 4) {
        if (x >= this.width || y >= this.height) continue;
        const d = this.depositAt(x, y);
        if (!d) continue;
        let list = cell.get(d.type);
        if (!list) cell.set(d.type, list = []);
        list.push(x, y);
      }
    }
    this.sampleCache.set(key, cell);
    return cell;
  }
}
