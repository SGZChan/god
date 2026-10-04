// Prints land share, biome histogram, latitude temperatures, start area and resource counts for planet seeds.
// Usage: node scripts/mapcheck.mjs [radius] [seed ...]   (ASCII=1 also draws the map)
import { TerrainGenerator, planetSize } from '../src/world/generator.js';
import { RESOURCE_TYPES } from '../src/world/resources.js';

const radius = Number(process.argv[2]) || 4.7;
const seeds = process.argv.slice(3);
if (!seeds.length) seeds.push('Genesis-1337:p_0_0', 'alpha', 'beta', 'gamma');
const { width, height } = planetSize(radius);
for (const seed of seeds) {
  const t0 = performance.now();
  const g = new TerrainGenerator(seed, 'terrestrial', width, height);
  const step = 8;
  const biomes = {};
  const res = {};
  let water = 0;
  let n = 0;
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const t = g.tile(x, y);
      biomes[t.biome.id] = (biomes[t.biome.id] || 0) + 1;
      if (t.biome.isWater) water++;
      n++;
      if (t.deposit) res[t.deposit.type] = (res[t.deposit.type] || 0) + 1;
    }
  }
  const ms = performance.now() - t0;
  const t1 = performance.now();
  const home = g.findHome();
  const homeMs = performance.now() - t1;
  console.log(`\n== ${seed} ${width}x${height}  land ${((1 - water / n) * 100).toFixed(0)}%  (${ms.toFixed(0)} ms, home ${homeMs.toFixed(0)} ms)`);
  console.log('home', home, g.terrainAt(home.x, home.y).biome.id, 'lat', (Math.abs(g.latitudeAt(home.y)) * 180 / Math.PI).toFixed(1));
  console.log(Object.entries(biomes).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${(v / n * 100).toFixed(1)}%`).join(' '));
  console.log('deposits per 100 sampled tiles: ' + RESOURCE_TYPES.map(r => `${r}:${((res[r] || 0) / n * 100).toFixed(2)}`).join(' '));
  let line = 'temp/moist by lat: ';
  for (const lat of [0, 15, 30, 45, 60, 75, 88]) {
    const y = Math.round(height * (0.5 + lat / 180));
    let s = 0;
    let m = 0;
    let c = 0;
    for (let x = 200; x < width - 200; x += 16) { const t = g.terrainAt(x, y); s += t.temperature; m += t.moisture; c++; }
    line += `${lat}:${(s / c).toFixed(2)}/${(m / c).toFixed(2)} `;
  }
  console.log(line);
  if (process.env.ASCII) {
    const cols = 120;
    const rows = 40;
    const ch = { DEEP_OCEAN: ' ', OCEAN: '.', SHALLOWS: ',', BEACH: 'b', GRASSLAND: '"', SAVANNA: 's', TEMPERATE_FOREST: 'f', RAINFOREST: 'R', TAIGA: 't', TUNDRA: 'u', GLACIAL_ICE: '#', DESERT: 'D', VOLCANIC: 'V', ALIEN_BLOOM: 'A' };
    for (let r = 0; r < rows; r++) {
      let s = '';
      for (let c = 0; c < cols; c++) s += ch[g.terrainAt(Math.floor((c + 0.5) / cols * width), Math.floor((r + 0.5) / rows * height)).biome.id];
      console.log(s);
    }
  }
}
