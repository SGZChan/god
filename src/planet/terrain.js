// Finite, chunked planet surface.
//
// The planet is `width` x `height` tiles (x in [0, width), y in [0, height); see planetSize() in
// world/generator.js: width = round(1024 * radius), height = width / 2). There is no wrap-around: the east
// and west edges are deep ocean, the poles are ice. getTile() clamps out-of-range coordinates to the nearest
// edge tile, so it never crashes; use inBounds(x, y) when you must know (pathfinding and movement do).
//
// The world is generated on demand in 32x32 tile chunks from the planet's seed (see world/generator.js).
// A chunk that is far from the camera, creatures and civilizations is evicted; only the tiles that differ
// from what the generator would produce (buildings, borders, god powers, grazed flora, depleted or regrown
// resource deposits...) are remembered, so a chunk always comes back exactly as it was left.
//
// ---------- RESOURCE API (catalog and generation: world/resources.js) ----------
// Every tile has `tile.deposit`: null or { type, amount, max? }. Minerals are finite (no `max`); renewables
// (wood, fibre, berries, fish, freshwater) have `max` and regrow toward it.
//
//   terrain.getDeposit(x, y)                      -> { type, amount, max? } | null
//       A snapshot (a copy; never mutate it). Does not generate chunks; works for unloaded land.
//   terrain.extract(x, y, amount)                 -> number actually extracted (0 if nothing there)
//       Takes up to `amount` from the tile's deposit. A depleted mineral disappears (deposit = null); a
//       depleted renewable stays at amount 0 (a tree becomes a stump) and regrows. The change is a normal
//       tile delta, so it survives chunk eviction and save/load.
//   terrain.findNearestDeposit(x, y, type, maxRadius = 250, { minAmount = 1 } = {})
//                                                 -> { x, y, type, amount, distance } | null
//       The nearest tile within maxRadius holding at least minAmount of `type`, using the generator's coarse
//       vein index (no scan of millions of tiles); sees depletion in loaded or evicted chunks.
//   terrain.regrow(dt, speedMultiplier)           -> advances regrowth of harvested renewables (update() calls it)
//   terrain.inBounds(x, y)                        -> is (x, y) on the map?
// Resource types: RESOURCES / RESOURCE_TYPES / TIER_NAMES from world/resources.js.
//
// ---------- BUILDING API (catalogue: world/buildings.js, sprites: art/buildingSprites.js) ----------
// A building is { id, type, x, y, w, h, progress 0..1, health, damage 0..1, civId, clanId, style, delivered {} }
// covering a w x h footprint whose top-left tile is (x, y). Every covered tile gets
// tile.structure = { type, buildingId, ox, oy, anchor, name, icon, health, solid } (ox/oy: offset inside the
// footprint, anchor: the top-left tile), so code that only reads structure.type/name/icon/health keeps working.
// Old one-tile structures (type 'ruins' without buildingId) still exist for god powers' legacy ruins.
//
//   terrain.canPlaceBuilding(type, x, y)        -> boolean: footprint on buildable, flat land, free of buildings
//                                                  (ruins may be built over) and of mineral deposits (trees are cleared)
//   terrain.placeBuilding(type, x, y, { civId, clanId, progress = 1, style }) -> building | null
//   terrain.getBuildingAt(x, y) / getBuilding(id) -> building | null (live object; do not mutate)
//   terrain.advanceConstruction(id, work)       -> true once complete (progress += work / def.work)
//   terrain.deliverMaterial(id, resource, n)    -> adds to building.delivered (hauling), see missingMaterials()
//   terrain.damageBuilding(id, amount)          -> true when destroyed (becomes ruins); repairBuilding(id, amount)
//   terrain.removeBuilding(id, { ruins = true }) -> a ruins building on the same footprint, or nothing
//   terrain.setRoad(x, y, kind)                 -> kind 'dirt' | 'gravel' | 'cobble' | null (tile.road); roads speed walking
//   terrain.isSolid(x, y)                       -> true when a completed building blocks the tile (doors and open buildings do not)
//   terrain.buildingsInRect(x0, y0, x1, y1)     -> buildings anchored in the tile rectangle (rendering, queries)
//   terrain.buildings                           -> Map id -> building (every building on the planet, loaded or not)
// Everything persists: tile.structure/tile.road are tile deltas, the registry is saved by persistence/saveGame.js.
import { classifyBiome, BIOMES } from './biomes.js';
import { TerrainGenerator, FlatGenerator, planetSize, DEFAULT_WIDTH, FLAT_WIDTH, FLAT_HEIGHT } from '../world/generator.js';
import { RESOURCES, ResourceField } from '../world/resources.js';
import { random } from '../simulation/random.js';
import { BUILDING_TYPES, ROAD_KINDS } from '../world/buildings.js';

export const CHUNK_SIZE = 32;
const SHIFT = 5;
const MASK = CHUNK_SIZE - 1;
const chunkKey = (cx, cy) => (cx + 32768) * 65536 + (cy + 32768);

const DELTA_FIELDS = ['elevation', 'temperature', 'moisture', 'flora', 'structure', 'civId', 'deposit', 'road'];
const CLEARABLE = new Set(['wood', 'fibre', 'berries']); // vegetation a building may replace
const MAX_SLOPE = 0.08;                                  // largest elevation spread under one footprint

const round2 = v => Math.round(v * 100) / 100;
const sameDeposit = (a, b) => (!a && !b) || Boolean(a && b && a.type === b.type && a.amount === b.amount && a.max === b.max);

export class PlanetTerrain {
  // options: { seed, type, flat, width, height, radius }. `flat` builds a small featureless grassland (unit
  // tests, 256x128). Otherwise the size is width x height, or derived from the planet `radius`, or 1024x512.
  constructor({ seed = 'terrain', type = 'terrestrial', flat = false, width, height, radius } = {}) {
    this.seed = String(seed);
    this.planetType = type;
    this.flat = flat;
    if (!width) {
      if (flat) { width = FLAT_WIDTH; height = height || FLAT_HEIGHT; }
      else if (radius) ({ width, height } = planetSize(radius));
      else width = DEFAULT_WIDTH;
    }
    this.width = Math.round(width);
    this.height = Math.round(height || Math.floor(this.width / 2));
    this.generator = flat ? new FlatGenerator(this.width, this.height) : new TerrainGenerator(this.seed, type, this.width, this.height);
    this.regrowing = new Set();      // loaded tiles whose renewable deposit is below its max

    this.buildings = new Map();      // id -> building (see BUILDING API)
    this.nextBuildingId = 1;
    this._buildingBuckets = new Map(); // chunk key -> Set of building ids anchored in that chunk

    this.chunks = new Map();         // key -> { cx, cy, tiles }
    this.chunkList = [];             // loaded chunks, for random sampling
    this.evictedDeltas = new Map();  // key -> [[lx, ly, fields]] for chunks that were evicted with changes

    this.waterLevel = 0.48;
    this.globalTemp = 0.52;
    this.timeAge = 0;
    this.corrosionTimer = 0;
    this.particles = [];
    this._home = null;

    // Reference to ecosystem/society for violent cataclysm collision
    this.ecosystem = null;
    this.society = null;
  }

  // ---------- tiles and chunks ----------

  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  // The tile at (x, y); coordinates outside the map are clamped to the nearest edge tile.
  getTile(x, y) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0) x = 0; else if (x >= this.width) x = this.width - 1;
    if (y < 0) y = 0; else if (y >= this.height) y = this.height - 1;
    const chunk = this.getChunk(x >> SHIFT, y >> SHIFT);
    return chunk.tiles[(y & MASK) * CHUNK_SIZE + (x & MASK)];
  }

  getChunk(cx, cy) {
    const maxCx = (this.width - 1) >> SHIFT;
    const maxCy = (this.height - 1) >> SHIFT;
    if (cx < 0) cx = 0; else if (cx > maxCx) cx = maxCx;
    if (cy < 0) cy = 0; else if (cy > maxCy) cy = maxCy;
    const key = chunkKey(cx, cy);
    return this.chunks.get(key) || this.generateChunk(cx, cy, key);
  }

  generateChunk(cx, cy, key) {
    const tiles = new Array(CHUNK_SIZE * CHUNK_SIZE);
    const ox = cx * CHUNK_SIZE;
    const oy = cy * CHUNK_SIZE;
    for (let ly = 0; ly < CHUNK_SIZE; ly++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const x = ox + lx;
        const y = oy + ly;
        const g = this.generator.tile(x, y);
        tiles[ly * CHUNK_SIZE + lx] = {
          x,
          y,
          elevation: g.elevation,
          temperature: g.temperature,
          moisture: g.moisture,
          biome: g.biome,
          flora: g.flora,
          structure: null,
          road: null,
          civId: null,
          deposit: g.deposit
        };
      }
    }
    const chunk = { cx, cy, key, tiles };
    this.chunks.set(key, chunk);
    this.chunkList.push(chunk);

    const deltas = this.evictedDeltas.get(key);
    if (deltas) {
      this.evictedDeltas.delete(key);
      for (const [lx, ly, fields] of deltas) this.applyFields(tiles[ly * CHUNK_SIZE + lx], fields);
    }
    return chunk;
  }

  applyFields(tile, fields) {
    for (const name of DELTA_FIELDS) {
      if (name in fields) tile[name] = fields[name];
    }
    if ('biome' in fields) tile.biome = BIOMES[fields.biome];
    if (tile.deposit && tile.deposit.max !== undefined && tile.deposit.amount < tile.deposit.max) this.regrowing.add(tile);
  }

  // The fields of `tile` that differ from freshly generated terrain (null when unchanged).
  tileDelta(tile) {
    const base = this.generator.tile(tile.x, tile.y);
    let fields = null;
    const mark = (name, value) => {
      if (!fields) fields = {};
      fields[name] = value;
    };
    for (const name of ['elevation', 'temperature', 'moisture', 'flora']) {
      if (tile[name] !== base[name]) mark(name, tile[name]);
    }
    if (!sameDeposit(tile.deposit, base.deposit)) mark('deposit', tile.deposit ? { ...tile.deposit } : null);
    if (tile.biome !== base.biome) mark('biome', tile.biome.id);
    if (tile.structure) mark('structure', tile.structure);
    if (tile.road) mark('road', tile.road);
    if (tile.civId) mark('civId', tile.civId);
    return fields;
  }

  diffChunk(chunk) {
    const deltas = [];
    for (let ly = 0; ly < CHUNK_SIZE; ly++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const fields = this.tileDelta(chunk.tiles[ly * CHUNK_SIZE + lx]);
        if (fields) deltas.push([lx, ly, fields]);
      }
    }
    return deltas;
  }

  // Evicts chunks that are not near any of the `focus` points ({ x, y, radius } in tiles, radius in chunks).
  // Changed tiles are remembered. Returns how many chunks were evicted.
  pruneChunks(focus, maxChunks = 260) {
    if (this.chunks.size <= maxChunks) return 0;
    const keep = new Set();
    for (const point of focus) {
      const cx = Math.floor(point.x) >> SHIFT;
      const cy = Math.floor(point.y) >> SHIFT;
      const r = point.radius;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) keep.add(chunkKey(cx + dx, cy + dy));
      }
    }
    let evicted = 0;
    for (const chunk of this.chunkList) {
      if (keep.has(chunk.key)) continue;
      const deltas = this.diffChunk(chunk);
      if (deltas.length) this.evictedDeltas.set(chunk.key, deltas);
      this.chunks.delete(chunk.key);
      if (this.regrowing.size) for (const tile of chunk.tiles) this.regrowing.delete(tile);
      evicted++;
    }
    if (evicted) this.chunkList = this.chunkList.filter(c => this.chunks.has(c.key));
    return evicted;
  }

  // Everything that differs from generated terrain, as [[x, y, fields]] in world coordinates.
  exportDeltas() {
    const out = [];
    const push = (cx, cy, deltas) => {
      for (const [lx, ly, fields] of deltas) out.push([cx * CHUNK_SIZE + lx, cy * CHUNK_SIZE + ly, fields]);
    };
    for (const chunk of this.chunkList) push(chunk.cx, chunk.cy, this.diffChunk(chunk));
    for (const [key, deltas] of this.evictedDeltas) {
      const cy = (key % 65536) - 32768;
      const cx = Math.floor(key / 65536) - 32768;
      push(cx, cy, deltas);
    }
    return out;
  }

  // Replaces the terrain's changes with `list` (from exportDeltas). They apply as chunks are generated.
  importDeltas(list) {
    this.chunks.clear();
    this.chunkList = [];
    this.evictedDeltas.clear();
    this.regrowing.clear();
    for (const [x, y, fields] of list) {
      const key = chunkKey(x >> SHIFT, y >> SHIFT);
      if (!this.evictedDeltas.has(key)) this.evictedDeltas.set(key, []);
      this.evictedDeltas.get(key).push([x & MASK, y & MASK, fields]);
    }
  }

  // Forgets every chunk and change (the world regenerates from its seed).
  reset() {
    this.chunks.clear();
    this.chunkList = [];
    this.evictedDeltas.clear();
    this.regrowing.clear();
    this.buildings.clear();
    this._buildingBuckets.clear();
    this.nextBuildingId = 1;
    this._home = null;
  }

  forEachLoadedTile(callback) {
    for (const chunk of this.chunkList) {
      for (const tile of chunk.tiles) callback(tile);
    }
  }

  // Like forEachLoadedTile, but stops as soon as the callback returns true.
  scanTiles(callback) {
    for (const chunk of this.chunkList) {
      for (const tile of chunk.tiles) {
        if (callback(tile)) return true;
      }
    }
    return false;
  }

  // ---------- where to build ----------

  // Land that can hold a building: on the map, not water, not glacial ice, not a mountain peak.
  isBuildable(x, y) {
    if (!this.inBounds(Math.floor(x), Math.floor(y))) return false;
    const tile = this.getTile(x, y);
    return !tile.biome.isWater && tile.biome.id !== 'GLACIAL_ICE' && tile.elevation < 0.85;
  }

  // Cheap land test straight from the generator (no chunk is created), for searching.
  isLandProbe(x, y) {
    return this.generator.isLandProbe(x, y);
  }

  // The nearest open land to (x, y): a spot whose surroundings (within `openRadius`) are all land.
  findLand(x, y, maxRadius = 400, openRadius = 4) {
    return this.generator.findLandNear(x, y, maxRadius, openRadius);
  }

  // The start area: temperate, habitable open land on a large landmass at 30-50 degrees latitude, found
  // deterministically from the seed. Creatures and civilizations begin here.
  get home() {
    if (!this._home) this._home = this.generator.findHome();
    return this._home;
  }

  // ---------- resources ----------

  // The deposit on (x, y) without creating chunks: from the loaded tile, the remembered changes of an evicted
  // chunk, or the generator. This is the live object for a loaded tile; getDeposit() hands out a copy.
  peekDeposit(x, y) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (!this.inBounds(x, y)) return null;
    const key = chunkKey(x >> SHIFT, y >> SHIFT);
    const chunk = this.chunks.get(key);
    if (chunk) return chunk.tiles[(y & MASK) * CHUNK_SIZE + (x & MASK)].deposit;
    const deltas = this.evictedDeltas.get(key);
    if (deltas) {
      const lx = x & MASK;
      const ly = y & MASK;
      for (const [dx, dy, fields] of deltas) {
        if (dx === lx && dy === ly && 'deposit' in fields) return fields.deposit;
      }
    }
    return this.generator.depositAt(x, y);
  }

  getDeposit(x, y) {
    const d = this.peekDeposit(x, y);
    return d ? { ...d } : null;
  }

  // Takes up to `amount` from the deposit on (x, y); returns how much was actually taken.
  extract(x, y, amount) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (!this.inBounds(x, y) || !(amount > 0)) return 0;
    const tile = this.getTile(x, y);
    const d = tile.deposit;
    if (!d || d.amount <= 0) return 0;
    const taken = round2(Math.min(amount, d.amount));
    d.amount = round2(d.amount - taken);
    if (d.max !== undefined) {
      this.regrowing.add(tile); // stays on the tile (a stump at amount 0) and grows back
    } else if (d.amount <= 0) {
      tile.deposit = null;
    }
    return taken;
  }

  // The nearest deposit of `type` (at least opts.minAmount of it) within maxRadius tiles of (x, y).
  findNearestDeposit(x, y, type, maxRadius = 250, { minAmount = 1 } = {}) {
    if (!RESOURCES[type]) return null;
    const field = this.generator.resources;
    if (!field) return null;
    x = Math.floor(x);
    y = Math.floor(y);
    let best = null;
    let bestDist = maxRadius;
    const consider = (px, py) => {
      const d = this.peekDeposit(px, py);
      if (!d || d.type !== type || d.amount < minAmount) return;
      const dist = Math.hypot(px - x, py - y);
      if (dist <= bestDist) {
        bestDist = dist;
        best = { x: px, y: py, type, amount: d.amount, distance: dist };
      }
    };

    if (ResourceField.isOre(type)) {
      // Ores: the generator knows every vein centre exactly; scan each vein, nearest first
      for (const vein of field.veinsNear(type, x, y, maxRadius)) {
        if (vein.dist - vein.a - 1 > bestDist) break;
        const r = Math.ceil(vein.a) + 1;
        for (let py = vein.y - r; py <= vein.y + r; py++) {
          for (let px = vein.x - r; px <= vein.x + r; px++) consider(px, py);
        }
      }
      return best;
    }

    // Common deposits: walk 32x32 cells outwards in rings, using the sampled coarse index
    const cx0 = x >> SHIFT;
    const cy0 = y >> SHIFT;
    const maxRing = Math.ceil(maxRadius / CHUNK_SIZE) + 1;
    const maxCx = (this.width - 1) >> SHIFT;
    const maxCy = (this.height - 1) >> SHIFT;
    for (let ring = 0; ring <= maxRing; ring++) {
      if (best && (ring - 1) * CHUNK_SIZE > bestDist) break;
      for (let cy = cy0 - ring; cy <= cy0 + ring; cy++) {
        if (cy < 0 || cy > maxCy) continue;
        const fullRow = ring === 0 || cy === cy0 - ring || cy === cy0 + ring;
        for (let cx = cx0 - ring; cx <= cx0 + ring; cx += (fullRow ? 1 : ring * 2)) {
          if (cx < 0 || cx > maxCx) continue;
          const list = field.sampleCell(cx, cy).get(type);
          if (!list) continue;
          for (let i = 0; i < list.length; i += 2) consider(list[i], list[i + 1]);
        }
      }
    }
    // Exact scan of the immediate neighbourhood (the coarse index can miss single scattered tiles)
    const near = Math.min(12, Math.floor(bestDist));
    for (let py = y - near; py <= y + near; py++) {
      for (let px = x - near; px <= x + near; px++) consider(px, py);
    }
    if (best) {
      // Refine: a sample point is within a few tiles of the true nearest tile
      const bx = best.x;
      const by = best.y;
      for (let py = by - 4; py <= by + 4; py++) {
        for (let px = bx - 4; px <= bx + 4; px++) consider(px, py);
      }
    }
    return best;
  }

  // Renewable deposits that were harvested grow back toward their max (loaded chunks only).
  regrow(dt, speedMultiplier = 1) {
    if (this.regrowing.size === 0) return;
    const years = dt * Math.min(Math.max(1, speedMultiplier), 180) / 4;
    for (const tile of this.regrowing) {
      const d = tile.deposit;
      if (!d || d.max === undefined || d.amount >= d.max) {
        this.regrowing.delete(tile);
        continue;
      }
      const info = RESOURCES[d.type];
      d.amount = Math.min(d.max, round2(d.amount + d.max * (info ? info.regrowPerYear : 0.1) * years));
      if (d.amount >= d.max) this.regrowing.delete(tile);
    }
  }

  // ---------- buildings and roads ----------

  // A fitting look for a new building from the local climate: desert sandstone, snow-roofed in the cold, stone in later eras.
  styleFor(type, x, y) {
    const def = BUILDING_TYPES[type];
    const tile = this.getTile(x, y);
    const id = tile.biome.id;
    if (id === 'DESERT') return { pal: 'sandstone', snow: false };
    const cold = tile.temperature < 0.3 || id === 'TAIGA' || id === 'TUNDRA';
    const stone = def && (def.tier >= 2 || def.category === 'defense' || def.category === 'religious');
    return { pal: stone ? 'stone' : 'timber', snow: cold };
  }

  // Can `type` stand with its top-left tile on (x, y)?
  canPlaceBuilding(type, x, y) {
    const def = BUILDING_TYPES[type];
    if (!def || type === 'ruins') return false;
    return this.footprintFree(def, Math.floor(x), Math.floor(y), def.w, def.h);
  }

  footprintFree(def, x, y, w, h) {
    let minE = Infinity;
    let maxE = -Infinity;
    let water = 0;
    let land = 0;
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const tx = x + dx;
        const ty = y + dy;
        if (!this.inBounds(tx, ty)) return false;
        const tile = this.getTile(tx, ty);
        if (def.shore) {
          if (tile.biome.id === 'SHALLOWS') water++;
          else if (this.isBuildable(tx, ty)) land++;
          else return false;
        } else if (!this.isBuildable(tx, ty)) {
          return false;
        }
        if (tile.structure && tile.structure.type !== 'ruins') return false;
        const d = tile.deposit;
        if (d && d.amount > 0 && RESOURCES[d.type] && RESOURCES[d.type].tier >= 1 && def.category !== 'extraction') return false; // metals, coal, gems, oil: never buried
        if (tile.elevation < minE) minE = tile.elevation;
        if (tile.elevation > maxE) maxE = tile.elevation;
      }
    }
    if (def.shore && (water === 0 || land === 0)) return false;
    return maxE - minE <= MAX_SLOPE;
  }

  getBuilding(id) {
    return this.buildings.get(id) || null;
  }

  getBuildingAt(x, y) {
    const s = this.getTile(x, y).structure;
    return s && s.buildingId !== undefined ? this.buildings.get(s.buildingId) || null : null;
  }

  // Writes the tiles of a building (structure records, solid flags) from its current state.
  syncBuildingTiles(b) {
    const def = BUILDING_TYPES[b.type];
    const solid = Boolean(def.solid) && b.progress >= 1;
    for (let oy = 0; oy < b.h; oy++) {
      for (let ox = 0; ox < b.w; ox++) {
        const tile = this.getTile(b.x + ox, b.y + oy);
        const isDoor = def.door && def.door.x === ox && def.door.y === oy;
        tile.structure = {
          type: b.type,
          buildingId: b.id,
          ox,
          oy,
          anchor: ox === 0 && oy === 0,
          name: (b.name || def.name) + (b.progress < 1 && b.type !== 'ruins' ? ' (under construction)' : ''),
          icon: def.icon,
          health: Math.round(b.health),
          solid: solid && !isDoor
        };
        if (b.originalTech !== undefined) tile.structure.originalTech = b.originalTech;
      }
    }
  }

  _bucketKey(b) {
    return chunkKey(b.x >> SHIFT, b.y >> SHIFT);
  }

  _register(b) {
    this.buildings.set(b.id, b);
    const key = this._bucketKey(b);
    if (!this._buildingBuckets.has(key)) this._buildingBuckets.set(key, new Set());
    this._buildingBuckets.get(key).add(b.id);
  }

  _unregister(b) {
    this.buildings.delete(b.id);
    const set = this._buildingBuckets.get(this._bucketKey(b));
    if (set) set.delete(b.id);
  }

  // Places a building (a construction site when progress < 1). Returns it, or null when it does not fit.
  placeBuilding(type, x, y, { civId = null, clanId = null, progress = 1, style = null } = {}) {
    const def = BUILDING_TYPES[type];
    x = Math.floor(x);
    y = Math.floor(y);
    if (!def || !this.canPlaceBuilding(type, x, y)) return null;
    // ruins underneath are cleared, vegetation is felled, roads are paved over
    const seen = new Set();
    for (let dy = 0; dy < def.h; dy++) {
      for (let dx = 0; dx < def.w; dx++) {
        const tile = this.getTile(x + dx, y + dy);
        if (tile.structure && tile.structure.buildingId !== undefined) {
          if (!seen.has(tile.structure.buildingId)) {
            seen.add(tile.structure.buildingId);
            this.removeBuilding(tile.structure.buildingId, { ruins: false });
          }
        } else if (tile.structure) {
          tile.structure = null; // an old one-tile ruin
        }
        if (tile.deposit && CLEARABLE.has(tile.deposit.type)) tile.deposit = null;
        if (def.solid) tile.road = null;
      }
    }
    const b = {
      id: this.nextBuildingId++,
      type,
      x,
      y,
      w: def.w,
      h: def.h,
      progress: Math.max(0, Math.min(1, progress)),
      health: 0,
      damage: 0,
      civId,
      clanId,
      style: style || this.styleFor(type, x, y),
      delivered: {}
    };
    b.health = def.health * (b.progress >= 1 ? 1 : 0.4);
    this._register(b);
    this.syncBuildingTiles(b);
    return b;
  }

  // Adds `work` units of effort; returns true when the building is (now) complete.
  advanceConstruction(id, work) {
    const b = this.buildings.get(id);
    if (!b || b.type === 'ruins') return false;
    if (b.progress >= 1) return true;
    const def = BUILDING_TYPES[b.type];
    b.progress = Math.min(1, b.progress + Math.max(0, work) / def.work);
    if (b.progress >= 1) {
      b.health = def.health;
      b.damage = 0;
      this.syncBuildingTiles(b);
      return true;
    }
    return false;
  }

  deliverMaterial(id, resource, amount) {
    const b = this.buildings.get(id);
    if (!b || !(amount > 0)) return 0;
    b.delivered[resource] = (b.delivered[resource] || 0) + amount;
    return amount;
  }

  // Returns true when the damage destroyed the building (it is now ruins).
  damageBuilding(id, amount) {
    const b = this.buildings.get(id);
    if (!b || b.type === 'ruins' || !(amount > 0)) return false;
    const def = BUILDING_TYPES[b.type];
    b.health -= amount;
    if (b.health <= 0) {
      this.removeBuilding(id, { ruins: true });
      return true;
    }
    b.damage = Math.max(0, Math.min(1, 1 - b.health / def.health));
    this.syncBuildingTiles(b);
    return false;
  }

  repairBuilding(id, amount) {
    const b = this.buildings.get(id);
    if (!b || b.type === 'ruins' || b.progress < 1) return;
    const def = BUILDING_TYPES[b.type];
    b.health = Math.min(def.health, b.health + amount);
    b.damage = Math.max(0, Math.min(1, 1 - b.health / def.health));
    this.syncBuildingTiles(b);
  }

  // Takes a building off the map: it leaves ruins on its footprint (ruins: true) or nothing. Returns the ruins building.
  removeBuilding(id, { ruins = true, name = null, originalTech } = {}) {
    const b = this.buildings.get(id);
    if (!b) return null;
    if (b.type === 'ruins' && ruins) return b;
    const def = BUILDING_TYPES[b.type];
    this._unregister(b);
    for (let oy = 0; oy < b.h; oy++) {
      for (let ox = 0; ox < b.w; ox++) {
        const tile = this.getTile(b.x + ox, b.y + oy);
        if (tile.structure && tile.structure.buildingId === id) tile.structure = null;
      }
    }
    if (!ruins) return null;
    const r = {
      id: this.nextBuildingId++,
      type: 'ruins',
      original: b.type,
      x: b.x,
      y: b.y,
      w: b.w,
      h: b.h,
      progress: 1,
      health: 0,
      damage: 1,
      civId: null,
      clanId: b.clanId,
      style: b.style,
      delivered: {},
      ruinAge: 0,
      name: name || `Ruins of ${def.name}`
    };
    if (originalTech !== undefined) r.originalTech = originalTech;
    this._register(r);
    this.syncBuildingTiles(r);
    return r;
  }

  // A tile blocked for walking by a completed building (O(1): the flag lives on the tile).
  isSolid(x, y) {
    const s = this.getTile(x, y).structure;
    return Boolean(s && s.solid);
  }

  // Buildings anchored near the tile rectangle [x0, x1] x [y0, y1] (inclusive), for rendering and queries.
  buildingsInRect(x0, y0, x1, y1, out = []) {
    out.length = 0;
    if (this.buildings.size === 0) return out;
    const cx0 = Math.max(0, (Math.floor(x0) >> SHIFT) - 1);
    const cx1 = Math.min((this.width - 1) >> SHIFT, (Math.floor(x1) >> SHIFT) + 1);
    const cy0 = Math.max(0, (Math.floor(y0) >> SHIFT) - 1);
    const cy1 = Math.min((this.height - 1) >> SHIFT, (Math.floor(y1) >> SHIFT) + 1);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const set = this._buildingBuckets.get(chunkKey(cx, cy));
        if (!set) continue;
        for (const id of set) {
          const b = this.buildings.get(id);
          if (b.x + b.w > x0 && b.x <= x1 && b.y + b.h + 3 > y0 && b.y - 6 <= y1) out.push(b);
        }
      }
    }
    return out;
  }

  buildingsOfCiv(civId) {
    const out = [];
    for (const b of this.buildings.values()) if (b.civId === civId) out.push(b);
    return out;
  }

  // Paves (or, with kind null, clears) a road on one tile of buildable land; not under a solid building.
  setRoad(x, y, kind = 'dirt') {
    x = Math.floor(x);
    y = Math.floor(y);
    if (!this.inBounds(x, y)) return false;
    const tile = this.getTile(x, y);
    if (kind === null) {
      tile.road = null;
      return true;
    }
    if (!ROAD_KINDS.includes(kind) || !this.isBuildable(x, y) || (tile.structure && tile.structure.solid)) return false;
    tile.road = kind;
    return true;
  }

  getRoad(x, y) {
    return this.inBounds(Math.floor(x), Math.floor(y)) ? this.getTile(x, y).road || null : null;
  }

  exportBuildings() {
    return [...this.buildings.values()].sort((a, b) => a.id - b.id).map(b => ({ ...b, style: { ...b.style }, delivered: { ...b.delivered } }));
  }

  // Replaces the registry from a save. The tiles come back with the tile deltas, so only the registry is rebuilt.
  importBuildings(list, nextId) {
    this.buildings.clear();
    this._buildingBuckets.clear();
    let max = 0;
    for (const raw of list || []) {
      this._register({ ...raw, style: { ...raw.style }, delivered: { ...raw.delivered } });
      if (raw.id > max) max = raw.id;
    }
    this.nextBuildingId = Math.max(nextId || 1, max + 1);
  }

  // Ruins a tile's structure (god powers): a whole building collapses, an old one-tile structure is replaced.
  wreckStructure(tile, name, icon, health = 0) {
    const s = tile.structure;
    if (!s || s.type === 'ruins') return;
    if (s.buildingId !== undefined) this.removeBuilding(s.buildingId, { ruins: true, name });
    else tile.structure = { type: 'ruins', name, icon, health };
  }

  // Wipes a tile's structure without ruins (singularity, meteor crater).
  clearStructure(tile) {
    const s = tile.structure;
    if (!s) return;
    if (s.buildingId !== undefined) this.removeBuilding(s.buildingId, { ruins: false });
    else tile.structure = null;
  }

  // ---------- simulation ----------

  update(dt, speedMultiplier) {
    this.timeAge += dt * speedMultiplier * 0.001;
    this.regrow(dt, speedMultiplier);

    // Flora slowly regrows on random loaded land tiles
    if (this.chunkList.length > 0) {
      const events = Math.min(500, Math.ceil(dt * Math.min(speedMultiplier, 100) * 40));
      for (let i = 0; i < events; i++) {
        const chunk = this.chunkList[Math.floor(random() * this.chunkList.length)];
        const tile = chunk.tiles[Math.floor(random() * chunk.tiles.length)];
        if (!tile.biome.isWater && tile.flora < 100) tile.flora = Math.min(100, tile.flora + tile.biome.fertility * 2);
      }
    }

    // --- TIME CORROSION SYSTEM ---
    // Structures decay over time: buildings lose health, ruins crumble to nothing
    this.corrosionTimer += dt * Math.max(1, speedMultiplier) * 0.004;
    if (this.corrosionTimer >= 1.0) {
      this.corrosionTimer = 0;
      // buildings: finished ones wear down (sturdier ones slower), ruins crumble away
      for (const b of [...this.buildings.values()]) {
        if (random() > 0.05) continue;
        if (b.type === 'ruins') {
          b.ruinAge = (b.ruinAge || 0) + 1;
          if (b.ruinAge > 30) this.removeBuilding(b.id, { ruins: false });
        } else if (b.progress >= 1) {
          this.damageBuilding(b.id, (1 + random() * 2) * BUILDING_TYPES[b.type].health / 100);
        }
      }
      this.forEachLoadedTile(tile => {
        if (!tile.structure || tile.structure.buildingId !== undefined || random() > 0.05) return;
        if (tile.structure.type === 'ruins') {
          tile.structure.ruinAge = (tile.structure.ruinAge || 0) + 1;
          if (tile.structure.ruinAge > 30) tile.structure = null;
        } else {
          if (tile.structure.health === undefined) tile.structure.health = 100;
          tile.structure.health -= (1 + random() * 2);
          if (tile.structure.health <= 0) {
            // Collapse into ruins: people must rebuild
            tile.structure = {
              type: 'ruins',
              name: (tile.structure.name || 'Building') + ' (Collapsed)',
              icon: '🏚️',
              health: 0,
              ruinAge: 0
            };
          }
        }
      });
    }

    // Update active particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= dt * 1.5;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  // --- GOD POWERS WITH REALISTIC DESTRUCTION & LETHALITY ---

  raiseMountain(cx, cy, radius = 4, amount = 0.3) {
    this.applyRadialEffect(cx, cy, radius, (tile, dist) => {
      const falloff = 1 - dist / radius;
      tile.elevation = Math.min(0.98, tile.elevation + amount * falloff);
      tile.biome = classifyBiome(tile.elevation, tile.temperature, tile.moisture, this.planetType);

      // Violently crush structures at the epicenter
      if (tile.structure && dist < radius * 0.75) {
        this.wreckStructure(tile, 'Crushed Ruins', '🪨');
      }
    });

    // Lethal tectonic upheaval: Crush and kill living creatures caught under rising mountain
    this.harmEntitiesInRadius(cx, cy, radius, 120, 'Crushed by Mountain Uplift');
    this.spawnParticles(cx, cy, 35, '#d48833', 2.0);
  }

  lowerOcean(cx, cy, radius = 4, amount = 0.35) {
    this.applyRadialEffect(cx, cy, radius, (tile, dist) => {
      const falloff = 1 - dist / radius;
      tile.elevation = Math.max(0.12, tile.elevation - amount * falloff);
      tile.biome = classifyBiome(tile.elevation, tile.temperature, tile.moisture, this.planetType);

      // Sink buildings into water
      if (tile.structure) {
        this.wreckStructure(tile, 'Sunken Ruins', '🌊');
      }
    });

    // Submerge and drown entities
    this.harmEntitiesInRadius(cx, cy, radius, 120, 'Swallowed by Oceanic Abyss');
    this.spawnParticles(cx, cy, 35, '#1e88e5', 2.0);
  }

  castTsunami(cx, cy, radius = 7) {
    this.applyRadialEffect(cx, cy, radius, (tile, dist) => {
      tile.moisture = 1.0;
      tile.flora = Math.max(0, tile.flora - 60);
      if (tile.structure && random() < 0.8) {
        this.wreckStructure(tile, 'Flooded Ruins', '🌊');
      }
    });
    this.harmEntitiesInRadius(cx, cy, radius, 90, 'Drowned in Tsunami Deluge');
    this.spawnParticles(cx, cy, 60, '#38bdf8', 3.0);
  }

  strikeVolcanicFissure(cx, cy, radius = 5) {
    this.applyRadialEffect(cx, cy, radius, (tile, dist) => {
      tile.elevation = Math.max(0.7, tile.elevation);
      tile.biome = BIOMES.VOLCANIC;
      tile.flora = 0;
      if (tile.structure) {
        this.wreckStructure(tile, 'Incinerated Ruins', '🔥');
      }
    });
    this.harmEntitiesInRadius(cx, cy, radius, 150, 'Incinerated by Molten Magma');
    this.spawnParticles(cx, cy, 70, '#ff3300', 3.2);
  }

  spawnSurfaceSingularity(cx, cy, radius = 6) {
    this.applyRadialEffect(cx, cy, radius, (tile, dist) => {
      tile.elevation = 0.05;
      tile.biome = BIOMES.DEEP_OCEAN;
      tile.flora = 0;
      this.clearStructure(tile); // completely vaporized
    });
    this.harmEntitiesInRadius(cx, cy, radius, 999, 'Spaghettified by Surface Singularity');
    this.spawnParticles(cx, cy, 90, '#8b5cf6', 4.0);
  }

  castDivinePlague(cx, cy, radius = 8) {
    if (!this.ecosystem) return;
    let infected = 0;
    for (const ent of this.ecosystem.entities) {
      if (ent.alive && Math.hypot(ent.x - cx, ent.y - cy) < radius) {
        ent.health -= 60;
        ent.isPlagued = true;
        if (ent.health <= 0) ent.die('Divine Pestilence');
        infected++;
      }
    }
    this.spawnParticles(cx, cy, 50, '#10b981', 1.8);
  }

  strikeMeteor(cx, cy) {
    this.applyRadialEffect(cx, cy, 7, (tile, dist) => {
      if (dist < 3) {
        tile.elevation = 0.2;
        tile.biome = BIOMES.VOLCANIC;
        tile.flora = 0;
        this.clearStructure(tile);
      } else {
        tile.elevation = Math.min(0.95, tile.elevation + 0.15);
        tile.flora = Math.max(0, tile.flora - 50);
        if (tile.structure) this.wreckStructure(tile, 'Blasted Ruins', '🪨');
      }
    });
    this.harmEntitiesInRadius(cx, cy, 7, 250, 'Meteor Cataclysm');
    this.spawnParticles(cx, cy, 80, '#ff4400', 4.0);
  }

  strikeLightning(cx, cy) {
    const tile = this.getTile(cx, cy);
    if (tile) {
      if (tile.structure && random() < 0.6) {
        this.wreckStructure(tile, 'Scorched Ruins', '⚡', 40);
      }
      tile.moisture = Math.min(1.0, tile.moisture + 0.2);
    }
    this.harmEntitiesInRadius(cx, cy, 3, 90, 'Divine Lightning Strike');
    this.spawnParticles(cx, cy, 30, '#ffffff', 2.5);
  }

  castDivineRain(cx, cy, radius = 8) {
    this.applyRadialEffect(cx, cy, radius, (tile, dist) => {
      const falloff = 1 - dist / radius;
      tile.moisture = Math.min(1.0, tile.moisture + 0.35 * falloff);
      tile.flora = Math.min(100, tile.flora + 45 * falloff);
      tile.biome = classifyBiome(tile.elevation, tile.temperature, tile.moisture, this.planetType);
    });
    this.spawnParticles(cx, cy, 35, '#00ffff', 1.5);
  }

  harmEntitiesInRadius(cx, cy, radius, damage, cause) {
    if (!this.ecosystem) return;
    for (const ent of this.ecosystem.entities) {
      if (!ent.alive) continue;
      const d = Math.hypot(ent.x - cx, ent.y - cy);
      if (d <= radius) {
        ent.health -= damage * (1 - d / (radius + 0.5));
        if (ent.health <= 0) {
          ent.die(cause);
        }
      }
    }
  }

  applyRadialEffect(cx, cy, radius, callback) {
    const rInt = Math.ceil(radius);
    for (let dy = -rInt; dy <= rInt; dy++) {
      for (let dx = -rInt; dx <= rInt; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        const dist = Math.hypot(dx, dy);
        if (dist <= radius) {
          const tile = this.getTile(x, y);
          if (tile) callback(tile, dist);
        }
      }
    }
  }

  spawnParticles(x, y, count, color, speed = 1.0) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = (0.5 + Math.random() * 1.5) * speed;
      this.particles.push({
        x: x + 0.5,
        y: y + 0.5,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        color: color,
        life: 1.0
      });
    }
  }
}
