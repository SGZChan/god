import { assert, section, summary } from './helpers.js';
import { Noise2D, hash01, hashInt } from '../src/world/noise.js';
import { TerrainGenerator } from '../src/world/generator.js';
import { PlanetTerrain, CHUNK_SIZE } from '../src/planet/terrain.js';

console.log('====================================================');
console.log('   WORLD TESTS — INFINITE CHUNKED TERRAIN           ');
console.log('====================================================');

section('Noise: deterministic, bounded and smooth');
{
  const a = new Noise2D(123);
  const b = new Noise2D(123);
  const c = new Noise2D(124);
  assert(a.noise(3.7, -9.2) === b.noise(3.7, -9.2), 'the same seed gives the same value');
  assert(a.noise(3.7, -9.2) !== c.noise(3.7, -9.2), 'a different seed gives a different value');
  let min = Infinity;
  let max = -Infinity;
  let maxStep = 0;
  for (let i = 0; i < 4000; i++) {
    const v = a.fbm(i * 0.31, -i * 0.17, 4);
    min = Math.min(min, v);
    max = Math.max(max, v);
    maxStep = Math.max(maxStep, Math.abs(v - a.fbm((i + 0.01) * 0.31, -(i + 0.01) * 0.17, 4)));
  }
  assert(min >= 0 && max <= 1, `fbm stays within [0, 1] (${min.toFixed(2)}..${max.toFixed(2)})`);
  assert(maxStep < 0.01, 'nearby points have nearly equal values (continuous)');
  assert(a.noise(5, 5) === 0, 'gradient noise is zero on lattice points');
  assert(hashInt(1, -5, 9) === hashInt(1, -5, 9) && hash01(1, 2, 3) >= 0 && hash01(1, 2, 3) < 1, 'hash01 is stable and in [0, 1)');
}

section('Generator: deterministic, varied and habitable');
{
  const a = new TerrainGenerator('planet-A');
  const b = new TerrainGenerator('planet-A');
  const c = new TerrainGenerator('planet-B');
  const sig = (g) => [[0, 0], [100, -40], [-250, 300], [999, 999]].map(([x, y]) => g.tile(x, y).elevation.toFixed(6)).join(',');
  assert(sig(a) === sig(b), 'the same seed generates the same land');
  assert(sig(a) !== sig(c), 'a different seed generates different land');

  const counts = {};
  let water = 0;
  let total = 0;
  for (let y = -300; y < 300; y += 6) {
    for (let x = -300; x < 300; x += 6) {
      const t = a.tile(x, y);
      counts[t.biome.id] = (counts[t.biome.id] || 0) + 1;
      if (t.biome.isWater) water++;
      total++;
    }
  }
  const share = water / total;
  assert(share > 0.2 && share < 0.65, `a believable share of the world is water (${(share * 100).toFixed(0)}%)`);
  assert(Object.keys(counts).length >= 7, `many biomes appear (${Object.keys(counts).length})`);

  const desert = new TerrainGenerator('planet-A', 'desert');
  let wet = 0;
  let dry = 0;
  for (let i = 0; i < 400; i++) {
    wet += a.tile(i * 7, i * 3).moisture;
    dry += desert.tile(i * 7, i * 3).moisture;
  }
  assert(dry < wet * 0.6, 'desert planets are drier than terrestrial ones');
}

section('Chunks: negative coordinates, seams and identity');
{
  const t = new PlanetTerrain({ seed: 'chunks' });
  const gen = new TerrainGenerator('chunks');
  assert(CHUNK_SIZE === 32, 'chunks are 32x32');
  const samePlace = [[-1, -1], [0, 0], [31, 31], [32, 32], [-33, 70], [-32, -32], [1000, -1000]].every(([x, y]) => {
    const tile = t.getTile(x, y);
    return tile.x === x && tile.y === y && tile.elevation === gen.tile(x, y).elevation;
  });
  assert(samePlace, 'tiles know their coordinates and match the generator, including negatives and chunk seams');
  assert(t.getTile(5, 5) === t.getTile(5, 5), 'a tile is one shared object');
  assert(t.getTile(5.9, 5.2) === t.getTile(5, 5), 'fractional coordinates floor to a tile');
  assert(t.getTile(-0.5, 0) === t.getTile(-1, 0), 'negative fractions floor towards -infinity');

  // Elevation is continuous across a chunk border (no visible seam)
  let worst = 0;
  for (let y = -40; y < 40; y++) worst = Math.max(worst, Math.abs(t.getTile(31, y).elevation - t.getTile(32, y).elevation));
  assert(worst < 0.2, `no cliff at a chunk border (largest step ${worst.toFixed(3)})`);
}

section('Chunks: changes survive eviction, untouched chunks regenerate');
{
  const t = new PlanetTerrain({ seed: 'evict' });
  // Load a 20x20 block of chunks around the origin
  for (let cy = -10; cy < 10; cy++) for (let cx = -10; cx < 10; cx++) t.getChunk(cx, cy);
  assert(t.chunks.size === 400, 'chunks load on demand');

  const edited = t.getTile(10, 10);
  edited.structure = { type: 'house', name: 'Test House', health: 80 };
  edited.civId = 'civ_test';
  edited.flora = 3;
  const pristine = t.getTile(-200, -200);
  const pristineElevation = pristine.elevation;

  const evicted = t.pruneChunks([{ x: 5000, y: 5000, radius: 0 }], 10);
  assert(evicted === 400 && t.chunks.size === 0, 'chunks far from every focus point are evicted');
  assert(t.evictedDeltas.size === 1, 'only the chunk with changes is remembered');

  const back = t.getTile(10, 10);
  assert(back !== edited, 'the chunk was regenerated as new objects');
  assert(back.structure && back.structure.name === 'Test House' && back.civId === 'civ_test' && back.flora === 3, 'its buildings, border and flora came back');
  assert(t.getTile(-200, -200).elevation === pristineElevation, 'an untouched chunk regenerates identically');
  assert(t.pruneChunks([{ x: 10, y: 10, radius: 1 }], 1000) === 0, 'nothing is evicted below the chunk limit');
}

section('Chunks: deltas export and import round trip');
{
  const a = new PlanetTerrain({ seed: 'deltas' });
  a.getTile(-70, 45).structure = { type: 'tower', name: 'Far Tower', health: 100 };
  a.getTile(70, -45).moisture = 0.987;
  a.getTile(0, 0).flora = 1;
  a.pruneChunks([{ x: 0, y: 0, radius: 0 }], 0); // evict the far chunks so both paths are exercised
  const list = a.exportDeltas();
  assert(list.length === 3, `exactly the three changed tiles are exported (${list.length})`);

  const b = new PlanetTerrain({ seed: 'deltas' });
  b.importDeltas(JSON.parse(JSON.stringify(list)));
  assert(b.getTile(-70, 45).structure.name === 'Far Tower', 'a structure is restored');
  assert(b.getTile(70, -45).moisture === 0.987, 'a changed number is restored');
  assert(b.getTile(0, 0).flora === 1, 'changed flora is restored');
  assert(JSON.stringify(b.exportDeltas().sort()) === JSON.stringify(list.slice().sort()), 'exporting again gives the same changes');
}

section('Terrain: finding land and building spots');
{
  const t = new PlanetTerrain({ seed: 'Genesis-1337:p_0_0' });
  const home = t.home;
  assert(Number.isInteger(home.x) && Number.isInteger(home.y), 'the home area has integer coordinates');
  assert(t.isBuildable(home.x, home.y), 'home is buildable land');
  const around = [[4, 0], [-4, 0], [0, 4], [0, -4]].every(([dx, dy]) => !t.getTile(home.x + dx, home.y + dy).biome.isWater);
  assert(around, 'home has dry land around it');
  assert(new PlanetTerrain({ seed: 'Genesis-1337:p_0_0' }).home.x === home.x, 'the home area is deterministic');

  let water = null;
  for (let x = -300; x < 300 && !water; x += 5) if (t.getTile(x, 500).biome.isWater) water = { x, y: 500 };
  assert(water && !t.isBuildable(water.x, water.y), 'water is never buildable');
}

section('Terrain: performance');
{
  const t = new PlanetTerrain({ seed: 'perf' });
  const start = performance.now();
  for (let cy = 0; cy < 10; cy++) for (let cx = 0; cx < 10; cx++) t.getChunk(cx, cy);
  const ms = performance.now() - start;
  assert(ms < 3000, `100 chunks (102,400 tiles) generate in ${ms.toFixed(0)} ms`);
}

summary();
