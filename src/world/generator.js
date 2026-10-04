// Generates the terrain of one finite planet, tile by tile, from its seed. Pure and deterministic:
// generator.tile(x, y) never depends on what was generated before.
//
// The map is width x height tiles (x in [0, width), y in [0, height)); the planet's radius sets the size
// (see planetSize). There is NO wrap-around: the east and west edges are a deep world-girdling ocean and the
// north and south poles are ice caps. Latitude comes from y (y = 0 is the north pole, y = height the south
// pole), so temperature and moisture follow real climate bands: hot wet equator, dry subtropical deserts,
// wetter temperate belts, cold dry poles. Continents are sized relative to the planet, hills, mountains and
// rivers have a fixed size in tiles.
import { SeededRNG } from '../cosmos/seed.js';
import { Noise2D, hash01 } from './noise.js';
import { classifyBiome, BIOMES } from '../planet/biomes.js';
import { ResourceField } from './resources.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export const DEFAULT_WIDTH = 1024;
export const DEFAULT_HEIGHT = 512;
export const FLAT_WIDTH = 256;
export const FLAT_HEIGHT = 128;
export const LAND_SHARE = 0.44; // target share of the planet above water (ice caps included)
export const EDGE_OCEAN = 40; // tiles from the east/west edge that are always deep ocean

// Map size for a planet of the given radius (planets have radius 3.2 - 6.2, custom planets their own).
export function planetSize(radius) {
  const r = Number.isFinite(radius) && radius > 0 ? radius : 4.7;
  const width = Math.max(512, Math.round(1024 * r));
  return { width, height: Math.floor(width / 2) };
}

export class TerrainGenerator {
  constructor(seedString, planetType = 'terrestrial', width = DEFAULT_WIDTH, height = Math.floor(width / 2)) {
    this.planetType = planetType;
    this.width = Math.round(width);
    this.height = Math.round(height);
    const base = new SeededRNG(`${seedString}#terrain`).seed;
    this.base = base;
    this.continents = new Noise2D(base ^ 0x1111);
    this.detail = new Noise2D(base ^ 0x2222);
    this.mountains = new Noise2D(base ^ 0x3333);
    this.rivers = new Noise2D(base ^ 0x4444);
    this.climate = new Noise2D(base ^ 0x5555);
    this.wetness = new Noise2D(base ^ 0x6666);
    this.warp = new Noise2D(base ^ 0x8888);
    this.islands = new Noise2D(base ^ 0x9999);
    this.volcano = new Noise2D(base ^ 0xaaaa);
    this.sc = 3.4 / this.width; // continent noise scale: about 3.4 lumps around the equator
    this.bias = 0;
    this.resources = new ResourceField(base, this.width, this.height, this);
    this._home = null;
    this.calibrateSeaLevel();
  }

  // Noise alone gives every seed a very different land share (a few big lumps either way). Nudge sea level
  // so that about LAND_SHARE of the planet (ice caps included) is above water, whatever the seed.
  calibrateSeaLevel() {
    const cols = 96;
    const rows = 48;
    const values = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        values.push(this.elevationAt(Math.floor((c + 0.5) / cols * this.width), Math.floor((r + 0.5) / rows * this.height)));
      }
    }
    values.sort((a, b) => a - b);
    const q = values[Math.floor(values.length * (1 - LAND_SHARE))];
    this.bias = clamp(0.51 - q, -0.2, 0.2);
  }

  // ---------- geometry ----------

  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  // Latitude in radians: -PI/2 (north pole) .. +PI/2 (south pole), 0 at the equator.
  latitudeAt(y) {
    return (clamp(y, 0, this.height - 1) / (this.height - 1) - 0.5) * Math.PI;
  }

  // ---------- elevation ----------

  // Returns elevation; `out` (optional) receives { riverDist } for the rivers and resources.
  elevationAt(x, y, out) {
    const W = this.width;
    const sc = this.sc;
    // Domain warp makes the coastlines wander
    const wx = x + this.warp.noise(x * sc * 3, y * sc * 3) * W * 0.045;
    const wy = y + this.warp.noise(x * sc * 3 + 40, y * sc * 3 + 40) * W * 0.045;
    const c = this.continents.fbm(wx * sc, wy * sc, 5);
    const d = this.detail.fbm(x * 0.03, y * 0.03, 4);
    let e = 0.5 + (c - 0.5) * 2.1 + (d - 0.5) * 0.28 - 0.085 + this.bias;

    // Island chains: ridged noise lifts strings of islands out of the shallow sea
    if (e > 0.3 && e < 0.5) {
      const chain = this.islands.ridged(x * sc * 5, y * sc * 5, 2);
      if (chain > 0.82) e += (chain - 0.82) * 1.6 * smooth(0.3, 0.44, e);
    }

    // Mountain ranges rise out of the continental interiors
    if (e > 0.55) {
      const ridge = this.mountains.ridged(x * 0.0065, y * 0.0065);
      e += Math.max(0, ridge - 0.66) * 0.7 * (e - 0.5) * 2;
    }

    // Rivers wind through the lowlands and end in the sea
    let riverDist = 1;
    if (e > 0.5 && e < 0.8) {
      riverDist = Math.abs(this.rivers.noise(x * 0.0055 + 7, y * 0.0055 - 3));
      if (riverDist < 0.0075) e = 0.47;
    }
    if (out) out.riverDist = riverDist;

    // Ice caps: the poles are land under a glacier
    const latFrac = Math.abs(y / (this.height - 1) - 0.5) * 2;
    const cap = smooth(0.84, 0.96, latFrac);
    if (cap > 0) e = e * (1 - cap) + Math.max(e, 0.58) * cap;

    // The east and west edges drown in a deep ocean that circles the planet
    const edge = Math.min(x, W - 1 - x);
    if (edge < EDGE_OCEAN + 30) {
      const t = smooth(EDGE_OCEAN + 30, EDGE_OCEAN, edge);
      e = e * (1 - t) + 0.2 * t;
    }
    return clamp(e, 0.05, 0.98);
  }

  // ---------- one tile (without resources) ----------

  // Elevation, climate, biome and river information for (x, y). Out-of-range coordinates are clamped.
  terrainAt(x, y) {
    x = clamp(x, 0, this.width - 1);
    y = clamp(y, 0, this.height - 1);
    const info = { riverDist: 1 };
    const elevation = this.elevationAt(x, y, info);
    const lat = this.latitudeAt(y);
    const cosLat = Math.max(0, Math.cos(lat));

    // True latitude: hot equator, cold poles, wobbled by noise and cooler on high ground
    let temperature = 0.05 + 0.92 * Math.pow(cosLat, 1.25)
      + (this.climate.fbm(x * 0.004 + 100, y * 0.004, 3) - 0.5) * 0.16;
    if (elevation > 0.62) temperature -= (elevation - 0.62) * 0.9;
    if (this.planetType === 'ice') temperature *= 0.55;
    else if (this.planetType === 'desert' || this.planetType === 'volcanic') temperature += 0.06;
    temperature = clamp(temperature, 0.03, 0.98);

    // Moisture bands: wet equator, dry ~30 degrees (deserts), wet temperate belt (~60), dry poles
    let moisture = 0.46 + 0.3 * Math.cos(lat * 6)
      + (this.wetness.fbm(x * 0.006 + 50, y * 0.006 + 50, 3) - 0.5) * 0.7;
    if (info.riverDist < 0.03) moisture += 0.12;
    if (this.planetType === 'desert') moisture *= 0.35;
    moisture = clamp(moisture, 0.04, 0.96);

    const roll = hash01(this.base, x, y);
    let biome = classifyBiome(elevation, temperature, moisture, this.planetType, roll);
    // Volcanic fields on any world
    if (!biome.isWater && elevation > 0.6 && elevation < 0.88 && biome.id !== 'GLACIAL_ICE'
      && this.volcano.fbm(x * 0.0035, y * 0.0035, 2) > 0.74) {
      biome = BIOMES.VOLCANIC;
    }
    return { x, y, elevation, temperature, moisture, biome, riverDist: info.riverDist };
  }

  // The full generated tile: terrain plus flora and resource deposit (a fresh object every call).
  tile(x, y) {
    const t = this.terrainAt(x, y);
    const biome = t.biome;
    return {
      elevation: t.elevation,
      temperature: t.temperature,
      moisture: t.moisture,
      biome,
      flora: biome.isWater ? 20 : Math.floor(biome.fertility * 70),
      deposit: this.resources.depositAt(t.x, t.y, t)
    };
  }

  // The deposit generated at (x, y) (a fresh object or null).
  depositAt(x, y) {
    return this.resources.depositAt(x, y, this.terrainAt(x, y));
  }

  // ---------- start area ----------

  // Cheap land test straight from the elevation (no chunk is created), for searching.
  isLandProbe(x, y) {
    if (!this.inBounds(x, y)) return false;
    const e = this.elevationAt(Math.floor(x), Math.floor(y));
    return e > 0.53 && e < 0.8;
  }

  // Where civilizations and fauna begin: temperate, habitable open land at roughly 30-50 degrees latitude
  // on a large landmass. A pure function of the seed (deterministic), computed once.
  findHome() {
    if (this._home) return this._home;
    const W = this.width;
    const H = this.height;
    const land = (x, y) => this.isLandProbe(x, y);
    const ringLand = (x, y, r) => {
      const n = 12;
      let c = 0;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + r * 0.37;
        if (land(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r))) c++;
      }
      return c / n;
    };
    const rings = [12, 30, 60, 100, 150];
    const passes = [
      { latMin: 30, latMax: 50, ringMin: 0.65, meanMin: 0.85, tMin: 0.36, tMax: 0.82, mMin: 0.3, mMax: 0.85, ok: ['GRASSLAND', 'TEMPERATE_FOREST', 'SAVANNA'] },
      { latMin: 25, latMax: 58, ringMin: 0.55, meanMin: 0.75, tMin: 0.28, tMax: 0.9, mMin: 0.25, mMax: 0.95, ok: ['GRASSLAND', 'TEMPERATE_FOREST', 'SAVANNA', 'TAIGA', 'RAINFOREST'] },
      { latMin: 10, latMax: 68, ringMin: 0.4, meanMin: 0.55, tMin: 0.15, tMax: 0.98, mMin: 0, mMax: 1, ok: null }
    ];
    for (const pass of passes) {
      let best = null;
      let bestScore = -Infinity;
      for (const sign of [-1, 1]) {
        // y of the latitude band edges in this hemisphere
        const yA = Math.round(H * (0.5 + sign * pass.latMin / 180));
        const yB = Math.round(H * (0.5 + sign * pass.latMax / 180));
        const y0 = Math.min(yA, yB);
        const y1 = Math.max(yA, yB);
        for (let y = y0; y <= y1; y += 32) {
          for (let x = 160; x < W - 160; x += 32) {
            if (!land(x, y)) continue;
            const t = this.terrainAt(x, y);
            if (t.temperature < pass.tMin || t.temperature > pass.tMax || t.moisture < pass.mMin || t.moisture > pass.mMax) continue;
            if (pass.ok && !pass.ok.includes(t.biome.id)) continue;
            if (t.riverDist < 0.04) continue;
            // open ground: everything within a few tiles is land
            let open = true;
            for (let k = 0; k < 8 && open; k++) {
              const a = (k / 8) * Math.PI * 2;
              if (!land(Math.round(x + Math.cos(a) * 6), Math.round(y + Math.sin(a) * 6))) open = false;
            }
            if (!open) continue;
            let sum = 0;
            let weakest = 1;
            for (const r of rings) {
              const f = ringLand(x, y, r);
              sum += f;
              weakest = Math.min(weakest, f);
            }
            const mean = sum / rings.length;
            if (weakest < pass.ringMin || mean < pass.meanMin) continue;
            const midLat = (pass.latMin + pass.latMax) / 2;
            const lat = Math.abs(this.latitudeAt(y)) * 180 / Math.PI;
            const score = mean * 2 + t.biome.fertility - Math.abs(lat - midLat) / 60 - Math.abs(x - W / 2) / W * 0.3;
            if (score > bestScore) {
              bestScore = score;
              best = { x, y };
            }
          }
        }
      }
      if (best) {
        this._home = best;
        return best;
      }
    }
    // A last resort for strange worlds: the open land nearest the middle of the map
    const found = this.findLandNear(W / 2, H / 2, Math.max(W, H));
    this._home = found || { x: Math.floor(W / 2), y: Math.floor(H / 2) };
    return this._home;
  }

  // The nearest open land to (x, y): a spot whose surroundings (within `openRadius`) are all land.
  findLandNear(x, y, maxRadius = 400, openRadius = 4) {
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
}

// A featureless grassland used by unit tests (no resources). Small by default.
export class FlatGenerator {
  constructor(width = FLAT_WIDTH, height = FLAT_HEIGHT) {
    this.planetType = 'terrestrial';
    this.base = 1;
    this.width = width;
    this.height = height;
  }

  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  elevationAt() {
    return 0.5;
  }

  isLandProbe(x, y) {
    return this.inBounds(x, y);
  }

  findHome() {
    return { x: Math.floor(this.width / 2), y: Math.floor(this.height / 2) };
  }

  findLandNear(x, y) {
    return { x: Math.floor(x), y: Math.floor(y) };
  }

  depositAt() {
    return null;
  }

  tile() {
    return { elevation: 0.5, temperature: 0.5, moisture: 0.5, biome: BIOMES.GRASSLAND, flora: 60, deposit: null };
  }
}
