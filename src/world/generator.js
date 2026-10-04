// Generates the terrain of one planet, tile by tile, from its seed. Pure and deterministic:
// generator.tile(x, y) never depends on what was generated before.
import { SeededRNG } from '../cosmos/seed.js';
import { Noise2D, hash01 } from './noise.js';
import { classifyBiome, BIOMES } from '../planet/biomes.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class TerrainGenerator {
  constructor(seedString, planetType = 'terrestrial') {
    this.planetType = planetType;
    const base = new SeededRNG(`${seedString}#terrain`).seed;
    this.base = base;
    this.continents = new Noise2D(base ^ 0x1111);
    this.detail = new Noise2D(base ^ 0x2222);
    this.mountains = new Noise2D(base ^ 0x3333);
    this.rivers = new Noise2D(base ^ 0x4444);
    this.climate = new Noise2D(base ^ 0x5555);
    this.wetness = new Noise2D(base ^ 0x6666);
    // Shifts the climate bands per planet, but keeps the origin temperate so the start area is habitable
    this.phase = ((base >>> 8) % 100) / 100 - 0.5;
  }

  elevationAt(x, y) {
    const c = this.continents.fbm(x * 0.0045, y * 0.0045, 5);
    const d = this.detail.fbm(x * 0.03, y * 0.03, 4);
    let e = 0.5 + (c - 0.5) * 1.6 + (d - 0.5) * 0.3;

    // Mountain chains rise out of the continental interiors
    if (e > 0.55) {
      const ridge = this.mountains.ridged(x * 0.012, y * 0.012);
      e += Math.max(0, ridge - 0.65) * 0.8 * (e - 0.5) * 2;
    }

    // Rivers wind through the land and end in the sea
    if (e > 0.52 && e < 0.82) {
      const river = Math.abs(this.rivers.noise(x * 0.008, y * 0.008));
      if (river < 0.016) e = 0.47;
    }
    return clamp(e, 0.05, 0.98);
  }

  tile(x, y) {
    const elevation = this.elevationAt(x, y);

    // Warm and cold bands along the map, wobbled by noise, cooler on high ground
    let temperature = 0.5
      + (this.climate.fbm(x * 0.004 + 100, y * 0.004, 3) - 0.5) * 0.6
      + Math.sin(y * 0.0018 + this.phase) * 0.26;
    if (elevation > 0.65) temperature -= (elevation - 0.65) * 0.8;
    if (this.planetType === 'ice') temperature *= 0.55;
    temperature = clamp(temperature, 0.05, 0.98);

    let moisture = this.wetness.fbm(x * 0.007 + 50, y * 0.007 + 50, 3) * 1.1 - 0.03;
    if (this.planetType === 'desert') moisture *= 0.35;
    moisture = clamp(moisture, 0.05, 0.95);

    const biome = classifyBiome(elevation, temperature, moisture, this.planetType, hash01(this.base, x, y));
    const roll = hash01(this.base ^ 0x7777, x, y);
    return {
      elevation,
      temperature,
      moisture,
      biome,
      flora: biome.isWater ? 20 : Math.floor(biome.fertility * 70),
      resource: roll < 0.06 ? (roll < 0.03 ? 'Iron Ore' : 'Mana Crystal') : null
    };
  }
}

// A featureless grassland used by unit tests.
export class FlatGenerator {
  elevationAt() {
    return 0.5;
  }

  constructor() {
    this.planetType = 'terrestrial';
    this.base = 1;
  }

  tile() {
    return { elevation: 0.5, temperature: 0.5, moisture: 0.5, biome: BIOMES.GRASSLAND, flora: 60, resource: null };
  }
}
