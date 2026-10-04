// Infinite, chunked planet surface.
//
// The world is generated on demand in 32x32 tile chunks from the planet's seed (see world/generator.js),
// so it has no edge. A chunk that is far from the camera, creatures and civilizations is evicted; only
// the tiles that differ from what the generator would produce (buildings, borders, god powers, grazed
// flora...) are remembered, so a chunk always comes back exactly as it was left.
import { classifyBiome, BIOMES } from './biomes.js';
import { TerrainGenerator, FlatGenerator } from '../world/generator.js';
import { random } from '../simulation/random.js';

export const CHUNK_SIZE = 32;
const SHIFT = 5;
const MASK = CHUNK_SIZE - 1;
const chunkKey = (cx, cy) => (cx + 32768) * 65536 + (cy + 32768);

const DELTA_FIELDS = ['elevation', 'temperature', 'moisture', 'flora', 'structure', 'civId', 'resource'];

export class PlanetTerrain {
  // options: { seed, type, flat }. `flat` builds a featureless grassland (unit tests).
  constructor({ seed = 'terrain', type = 'terrestrial', flat = false } = {}) {
    this.seed = String(seed);
    this.planetType = type;
    this.flat = flat;
    this.generator = flat ? new FlatGenerator() : new TerrainGenerator(this.seed, type);

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

  getTile(x, y) {
    x = Math.floor(x);
    y = Math.floor(y);
    const chunk = this.getChunk(x >> SHIFT, y >> SHIFT);
    return chunk.tiles[(y & MASK) * CHUNK_SIZE + (x & MASK)];
  }

  getChunk(cx, cy) {
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
          civId: null,
          resource: g.resource
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
  }

  // The fields of `tile` that differ from freshly generated terrain (null when unchanged).
  tileDelta(tile) {
    const base = this.generator.tile(tile.x, tile.y);
    let fields = null;
    const mark = (name, value) => {
      if (!fields) fields = {};
      fields[name] = value;
    };
    for (const name of ['elevation', 'temperature', 'moisture', 'flora', 'resource']) {
      if (tile[name] !== base[name]) mark(name, tile[name]);
    }
    if (tile.biome !== base.biome) mark('biome', tile.biome.id);
    if (tile.structure) mark('structure', tile.structure);
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

  // Land that can hold a building: not water, not glacial ice, not a mountain peak.
  isBuildable(x, y) {
    const tile = this.getTile(x, y);
    return !tile.biome.isWater && tile.biome.id !== 'GLACIAL_ICE' && tile.elevation < 0.85;
  }

  // Cheap land test straight from the generator (no chunk is created), for searching.
  isLandProbe(x, y) {
    const e = this.generator.elevationAt(x, y);
    return e > 0.53 && e < 0.8;
  }

  // The nearest open land to (x, y): a spot whose surroundings (within `openRadius`) are all land.
  findLand(x, y, maxRadius = 400, openRadius = 4) {
    const open = (px, py) => {
      if (!this.isLandProbe(px, py)) return false;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        if (!this.isLandProbe(px + Math.cos(a) * openRadius, py + Math.sin(a) * openRadius)) return false;
      }
      return true;
    };
    if (open(x, y)) return { x: Math.floor(x), y: Math.floor(y) };
    for (let r = 4; r <= maxRadius; r += 4) {
      const steps = Math.max(8, Math.ceil((Math.PI * 2 * r) / 4));
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const px = Math.round(x + Math.cos(a) * r);
        const py = Math.round(y + Math.sin(a) * r);
        if (open(px, py)) return { x: px, y: py };
      }
    }
    return null;
  }

  // The start area: open land nearest the world origin. Creatures and civilizations begin here.
  get home() {
    if (!this._home) this._home = this.findLand(0, 0) || { x: 0, y: 0 };
    return this._home;
  }

  // ---------- simulation ----------

  update(dt, speedMultiplier) {
    this.timeAge += dt * speedMultiplier * 0.001;

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
      this.forEachLoadedTile(tile => {
        if (!tile.structure || random() > 0.05) return;
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
        tile.structure = { type: 'ruins', name: 'Crushed Ruins', icon: '🪨', health: 0 };
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
        tile.structure = { type: 'ruins', name: 'Sunken Ruins', icon: '🌊', health: 0 };
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
        tile.structure = { type: 'ruins', name: 'Flooded Ruins', icon: '🌊', health: 0 };
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
        tile.structure = { type: 'ruins', name: 'Incinerated Ruins', icon: '🔥', health: 0 };
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
      tile.structure = null; // completely vaporized
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
        tile.structure = null;
      } else {
        tile.elevation = Math.min(0.95, tile.elevation + 0.15);
        tile.flora = Math.max(0, tile.flora - 50);
        if (tile.structure) tile.structure = { type: 'ruins', name: 'Blasted Ruins', icon: '🪨' };
      }
    });
    this.harmEntitiesInRadius(cx, cy, 7, 250, 'Meteor Cataclysm');
    this.spawnParticles(cx, cy, 80, '#ff4400', 4.0);
  }

  strikeLightning(cx, cy) {
    const tile = this.getTile(cx, cy);
    if (tile) {
      if (tile.structure && random() < 0.6) {
        tile.structure = { type: 'ruins', name: 'Scorched Ruins', icon: '⚡', health: 40 };
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
