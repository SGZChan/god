import { assert, section, summary } from './helpers.js';
import { TerrainGenerator, planetSize, EDGE_OCEAN } from '../src/world/generator.js';
import { PlanetTerrain } from '../src/planet/terrain.js';
import { createPlanetWorld } from '../src/simulation/world.js';
import { SeededRNG } from '../src/cosmos/seed.js';
import { serializeSim, restoreSim, validateSave, SAVE_VERSION, SaveError } from '../src/persistence/saveGame.js';

console.log('====================================================');
console.log('   PLANET TESTS — SIZE, EDGES, CLIMATE, START AREA   ');
console.log('====================================================');

const SEEDS = ['planet-1', 'Genesis-1337:p_0_0', 'alpha', 'zeta', 'Cosmos-999_planet_2', 'moon'];
const deg = (g, y) => Math.abs(g.latitudeAt(y)) * 180 / Math.PI;

section('Size comes from the planet radius');
{
  const small = planetSize(3.2);
  const big = planetSize(6.2);
  assert(small.width === 3277 && small.height === 1638, `radius 3.2 gives ${small.width}x${small.height}`);
  assert(big.width === 6349 && big.height === 3174, `radius 6.2 gives ${big.width}x${big.height}`);
  const t = new PlanetTerrain({ seed: 'size', radius: 4 });
  assert(t.width === 4096 && t.height === 2048, 'PlanetTerrain takes its size from the radius');
  const f = new PlanetTerrain({ seed: 'flat', flat: true });
  assert(f.width === 256 && f.height === 128, 'flat test worlds default to 256x128');
  const world = createPlanetWorld(new SeededRNG('size-world'), { seed: 'size-world', width: 512, height: 256 });
  assert(world.terrain.width === 512 && world.terrain.height === 256, 'createPlanetWorld passes the size to the terrain');
}

section('Edges: deep ocean east and west, ice at the poles, safe lookups');
{
  const t = new PlanetTerrain({ seed: 'edges', width: 1500, height: 750 });
  let deepWest = 0;
  let deepEast = 0;
  let n = 0;
  for (let y = 10; y < 740; y += 10) {
    for (const dx of [0, 10, 20, 30, EDGE_OCEAN]) {
      n++;
      if (t.getTile(dx, y).biome.isWater && t.getTile(dx, y).elevation < 0.32) deepWest++;
      if (t.getTile(1499 - dx, y).biome.isWater && t.getTile(1499 - dx, y).elevation < 0.32) deepEast++;
    }
  }
  assert(deepWest === n && deepEast === n, `the west and east ${EDGE_OCEAN} tiles are deep ocean`);

  let ice = 0;
  let total = 0;
  for (let x = 100; x < 1400; x += 10) {
    for (const y of [0, 3, 747, 749]) {
      total++;
      if (t.getTile(x, y).biome.id === 'GLACIAL_ICE') ice++;
    }
  }
  assert(ice / total > 0.95, `the poles are ice caps (${(ice / total * 100).toFixed(0)}% of polar tiles)`);

  const corner = t.getTile(0, 0);
  assert(t.getTile(-50, -50) === corner && t.getTile(-1, 10) === t.getTile(0, 10), 'tiles off the north-west edge clamp to the edge tile');
  assert(t.getTile(5000, 400) === t.getTile(1499, 400) && t.getTile(10, 9999) === t.getTile(10, 749), 'tiles off the east and south edges clamp too');
  assert(t.getTile(1e9, -1e9) && t.getTile(NaN, 3) !== undefined, 'absurd coordinates never crash');
  assert(t.inBounds(0, 0) && t.inBounds(1499, 749) && !t.inBounds(1500, 0) && !t.inBounds(0, -1), 'inBounds knows the map');
  assert(!t.isBuildable(-5, 10) && !t.isBuildable(5000, 5000), 'nothing off the map is buildable');
  const fresh = new PlanetTerrain({ seed: 'edges', width: 1500, height: 750 });
  for (const [x, y] of [[-1e6, 5], [1e6, 5], [5, -1e6], [5, 1e6], [1e6, 1e6]]) fresh.getTile(x, y);
  assert(fresh.chunks.size <= 5, `clamped lookups load only edge chunks (${fresh.chunks.size})`);
}

section('Climate: latitude, bands, land share, biomes');
{
  let landOk = 0;
  const allBiomes = new Set();
  let hot = 0;
  let cold = 0;
  let wetEq = 0;
  let dryTrop = 0;
  for (const seed of SEEDS) {
    const { width, height } = planetSize(4);
    const g = new TerrainGenerator(seed, 'terrestrial', width, height);
    let land = 0;
    let count = 0;
    for (let y = 0; y < height; y += 32) {
      for (let x = 0; x < width; x += 32) {
        const tile = g.tile(x, y);
        allBiomes.add(tile.biome.id);
        if (!tile.biome.isWater) land++;
        count++;
      }
    }
    const share = land / count;
    if (share > 0.25 && share < 0.6) landOk++;

    const mean = (lat, key) => {
      const y = Math.round(height * (0.5 - lat / 180));
      let sum = 0;
      let c = 0;
      for (let x = 200; x < width - 200; x += 16) { sum += g.terrainAt(x, y)[key]; c++; }
      return sum / c;
    };
    if (mean(0, 'temperature') > 0.8 && mean(0, 'temperature') > mean(45, 'temperature') + 0.15) hot++;
    if (mean(82, 'temperature') < 0.2 && mean(45, 'temperature') > mean(82, 'temperature') + 0.3) cold++;
    if (mean(0, 'moisture') > mean(30, 'moisture') + 0.3 && mean(60, 'moisture') > mean(30, 'moisture') + 0.3) wetEq++;
    // the subtropics hold the deserts
    let desert30 = 0;
    let desert0 = 0;
    for (let x = 200; x < width - 200; x += 16) {
      if (g.terrainAt(x, Math.round(height * (0.5 - 30 / 180))).biome.id === 'DESERT') desert30++;
      if (g.terrainAt(x, Math.round(height / 2)).biome.id === 'DESERT') desert0++;
    }
    if (desert30 > desert0) dryTrop++;
  }
  assert(landOk === SEEDS.length, `land share is 25-60% on every test seed (${landOk}/${SEEDS.length})`);
  assert(allBiomes.size >= 9, `many biomes appear across seeds (${allBiomes.size})`);
  assert(hot === SEEDS.length, 'the equator is hot (warmer than temperate latitudes) on every seed');
  assert(cold === SEEDS.length, 'the poles are cold on every seed');
  assert(wetEq === SEEDS.length, 'the equator and the 60 degree belt are wet, the 30 degree belt is dry');
  assert(dryTrop >= SEEDS.length - 1, 'deserts cluster at the subtropics rather than the equator');

  const ice = new TerrainGenerator('alpha', 'ice', 2048, 1024);
  const normal = new TerrainGenerator('alpha', 'terrestrial', 2048, 1024);
  let tIce = 0;
  let tNormal = 0;
  for (let i = 0; i < 100; i++) { tIce += ice.terrainAt(200 + i * 15, 400).temperature; tNormal += normal.terrainAt(200 + i * 15, 400).temperature; }
  assert(tIce < tNormal * 0.7, 'ice planets are colder');
}

section('Start area: temperate open land on a big landmass');
{
  const seen = new Set();
  let good = 0;
  for (const seed of SEEDS) {
    for (const radius of [3.2, 4.7]) {
      const { width, height } = planetSize(radius);
      const g = new TerrainGenerator(seed, 'terrestrial', width, height);
      const home = g.findHome();
      const tile = g.terrainAt(home.x, home.y);
      const lat = deg(g, home.y);
      // generous landmass check: most of a 100 tile ring is land
      let land = 0;
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        if (g.isLandProbe(Math.round(home.x + Math.cos(a) * 100), Math.round(home.y + Math.sin(a) * 100))) land++;
      }
      const ok = lat >= 25 && lat <= 58 && !tile.biome.isWater && !['DESERT', 'GLACIAL_ICE', 'VOLCANIC'].includes(tile.biome.id)
        && tile.temperature > 0.3 && tile.temperature < 0.9 && land >= 14 && g.isLandProbe(home.x, home.y);
      if (ok) good++;
      seen.add(`${home.x},${home.y}`);
      const again = new TerrainGenerator(seed, 'terrestrial', width, height).findHome();
      assert(again.x === home.x && again.y === home.y, `home is deterministic (${seed} r${radius})`);
    }
  }
  assert(good === SEEDS.length * 2, `every start area is temperate, 25-58 degrees, on a large landmass (${good}/${SEEDS.length * 2})`);
  assert(seen.size >= SEEDS.length, 'different planets start in different places');

  for (const type of ['desert', 'ice', 'volcanic', 'alien']) {
    const t = new PlanetTerrain({ seed: `type-${type}`, type, width: 2048, height: 1024 });
    assert(t.isBuildable(t.home.x, t.home.y), `a ${type} planet has a buildable start area`);
  }
}

section('Saves: format version 3 keeps the planet size');
{
  assert(SAVE_VERSION === 3, 'save version is 3');
  let message = '';
  try { validateSave({ version: 2 }); } catch (e) { message = e instanceof SaveError ? e.message : 'wrong error'; }
  assert(/cannot be loaded/.test(message), 'an old version 2 save is rejected with a friendly message');

  const world = createPlanetWorld(new SeededRNG('save-size'), { seed: 'save-size', width: 640, height: 320 });
  const sim = { ...world, rng: world.rng, planet: { name: 'x' }, lastActiveCosmicAge: 0, simSeconds: 0 };
  const data = JSON.parse(JSON.stringify(serializeSim(sim)));
  const back = restoreSim(data);
  assert(back.terrain.width === 640 && back.terrain.height === 320, 'the restored planet has the same size');
  assert(JSON.stringify(serializeSim({ ...back, planet: { name: 'x' } })) === JSON.stringify(data), 'save, restore, save is lossless');
}

summary();
