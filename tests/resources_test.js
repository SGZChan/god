import { assert, section, summary } from './helpers.js';
import { RESOURCES, RESOURCE_TYPES, ORE_TYPES, TIER_NAMES } from '../src/world/resources.js';
import { TerrainGenerator } from '../src/world/generator.js';
import { PlanetTerrain } from '../src/planet/terrain.js';

console.log('====================================================');
console.log('   RESOURCE TESTS — CATALOG, VEINS, MINING, REGROWTH ');
console.log('====================================================');

const W = 2048;
const H = 1024;
const newTerrain = (seed = 'res-1') => new PlanetTerrain({ seed, width: W, height: H });

section('Catalog');
{
  const required = ['wood', 'stone', 'clay', 'flint', 'fibre', 'berries', 'fish', 'salt', 'sand', 'copper', 'tin', 'iron', 'coal', 'gold', 'gems', 'obsidian', 'oil', 'uranium'];
  assert(required.every(r => RESOURCES[r]), 'every required resource is in the catalog');
  const valid = RESOURCE_TYPES.every(id => {
    const r = RESOURCES[id];
    return r.id === id && r.name && ['renewable', 'mineral', 'animal', 'water'].includes(r.category) && Number.isInteger(r.tier)
      && r.tier >= 0 && r.tier <= 4 && /^#[0-9a-f]{6}$/i.test(r.color) && r.description.length > 10;
  });
  assert(valid, 'every entry has id, name, category, tier 0-4, colour and description');
  assert(RESOURCES.wood.category === 'renewable' && RESOURCES.fish.category === 'animal' && RESOURCES.copper.category === 'mineral' && RESOURCES.freshwater.category === 'water', 'categories make sense');
  assert(RESOURCES.stone.tier === 0 && RESOURCES.copper.tier === 1 && RESOURCES.iron.tier === 2 && RESOURCES.oil.tier >= 3 && RESOURCES.uranium.tier === 4, 'tech tiers run from stone to space age');
  assert(TIER_NAMES.length === 5, 'five tier names');
  assert(ORE_TYPES.includes('copper') && ORE_TYPES.includes('uranium') && !ORE_TYPES.includes('wood'), 'ore list covers veined minerals only');
}

section('Generation: deterministic and independent of chunk order');
{
  const a = new TerrainGenerator('det', 'terrestrial', W, H);
  const b = new TerrainGenerator('det', 'terrestrial', W, H);
  const c = new TerrainGenerator('det-other', 'terrestrial', W, H);
  let same = 0;
  let different = 0;
  let found = 0;
  for (let i = 0; i < 3000; i++) {
    const x = 50 + ((i * 7919) % (W - 100));
    const y = 20 + ((i * 104729) % (H - 40));
    const da = JSON.stringify(a.depositAt(x, y));
    if (da === JSON.stringify(b.depositAt(x, y))) same++;
    if (da !== 'null') found++;
    if (da !== JSON.stringify(c.depositAt(x, y))) different++;
  }
  assert(same === 3000, 'the same seed gives the same deposits everywhere');
  assert(different > 300, 'another seed gives different deposits');
  assert(found > 300, `deposits are common enough (${found} of 3000 probes)`);

  // order independence: query cold generators in opposite orders, and through chunk generation
  const pts = [];
  for (let i = 0; i < 400; i++) pts.push([100 + ((i * 313) % 1800), 100 + ((i * 577) % 800)]);
  const fwd = new TerrainGenerator('order', 'terrestrial', W, H);
  const rev = new TerrainGenerator('order', 'terrestrial', W, H);
  const f = pts.map(([x, y]) => JSON.stringify(fwd.depositAt(x, y)));
  const r = pts.slice().reverse().map(([x, y]) => JSON.stringify(rev.depositAt(x, y))).reverse();
  assert(f.every((v, i) => v === r[i]), 'deposits do not depend on the order they are generated in');

  const t1 = newTerrain('order');
  const t2 = newTerrain('order');
  const gen = new TerrainGenerator('order', 'terrestrial', W, H);
  t1.getChunk(40, 20);
  t1.getChunk(10, 5);
  t2.getChunk(10, 5);
  t2.getChunk(40, 20);
  let chunkOk = true;
  for (const [cx, cy] of [[40, 20], [10, 5]]) {
    for (let ly = 0; ly < 32; ly++) {
      for (let lx = 0; lx < 32; lx++) {
        const x = cx * 32 + lx;
        const y = cy * 32 + ly;
        const want = JSON.stringify(gen.depositAt(x, y));
        if (JSON.stringify(t1.getTile(x, y).deposit) !== want || JSON.stringify(t2.getTile(x, y).deposit) !== want) chunkOk = false;
      }
    }
  }
  assert(chunkOk, 'loaded chunk tiles carry exactly the generator deposits whichever chunk loaded first');
}

section('Generation: deposits sit where they should');
{
  const g = new TerrainGenerator('places', 'terrestrial', 3000, 1500);
  const seen = {};
  const bad = [];
  for (let y = 40; y < 1460; y += 3) {
    for (let x = 60; x < 2940; x += 3) {
      const t = g.terrainAt(x, y);
      const d = g.resources.depositAt(x, y, t);
      if (!d) continue;
      seen[d.type] = (seen[d.type] || 0) + 1;
      const water = t.biome.isWater;
      if (['fish'].includes(d.type) && !water) bad.push(`fish on land ${x},${y}`);
      if (['wood', 'fibre', 'berries', 'stone', 'clay', 'flint', 'sand', 'salt', 'copper', 'tin', 'iron', 'coal', 'gold', 'gems', 'obsidian', 'uranium'].includes(d.type) && water) bad.push(`${d.type} in water ${x},${y}`);
      if (d.type === 'wood' && !['TEMPERATE_FOREST', 'RAINFOREST', 'TAIGA', 'ALIEN_BLOOM', 'SAVANNA', 'GRASSLAND', 'TUNDRA'].includes(t.biome.id)) bad.push(`wood in ${t.biome.id}`);
      if (['copper', 'tin', 'iron', 'gold'].includes(d.type) && t.elevation < 0.55) bad.push(`${d.type} in lowland ${t.elevation}`);
      if (d.type === 'gems' && t.elevation < 0.68) bad.push(`gems at ${t.elevation}`);
      if (d.type === 'uranium' && t.elevation < 0.7) bad.push(`uranium at ${t.elevation}`);
      if (d.type === 'coal' && (t.moisture < 0.4 || t.elevation < 0.5)) bad.push(`coal at m${t.moisture} e${t.elevation}`);
      if (d.type === 'obsidian' && t.biome.id !== 'VOLCANIC') bad.push(`obsidian in ${t.biome.id}`);
      if (d.type === 'oil' && !((!water && t.elevation < 0.6) || (water && t.elevation > 0.29 && t.elevation < 0.48))) bad.push(`oil at e${t.elevation}`);
      if (d.type === 'sand' && !['BEACH', 'DESERT'].includes(t.biome.id)) bad.push(`sand in ${t.biome.id}`);
      if (d.type === 'clay' && t.elevation > 0.62) bad.push('clay on a mountain');
      const renewable = RESOURCES[d.type].category !== 'mineral';
      if (renewable !== (d.max !== undefined) || d.amount <= 0 || (renewable && d.amount > d.max)) bad.push(`bad amounts ${JSON.stringify(d)}`);
    }
  }
  assert(bad.length === 0, `no deposit is in a nonsensical place (${bad.slice(0, 3).join('; ') || 'none'})`);
  const missing = RESOURCE_TYPES.filter(r => !seen[r] && !['obsidian', 'freshwater'].includes(r));
  assert(missing.length === 0, `every resource appears on a sampled planet (missing: ${missing.join(',') || 'none'})`);
  assert(seen.wood > seen.stone * 0.3 && seen.fish > 100, 'wood and fish are plentiful');
  assert((seen.uranium || 0) < (seen.iron || 1) / 4 && (seen.gold || 0) < (seen.copper || 1) / 2, 'rare ores are rarer than common ones');

  // forests are full of trees, grassland is not
  let forest = 0;
  let forestTrees = 0;
  let grass = 0;
  let grassTrees = 0;
  for (let y = 40; y < 1460; y += 5) {
    for (let x = 60; x < 2940; x += 5) {
      const t = g.terrainAt(x, y);
      const d = g.resources.depositAt(x, y, t);
      if (t.biome.id === 'TEMPERATE_FOREST' || t.biome.id === 'RAINFOREST') { forest++; if (d && d.type === 'wood') forestTrees++; }
      if (t.biome.id === 'GRASSLAND') { grass++; if (d && d.type === 'wood') grassTrees++; }
    }
  }
  assert(forest > 50 && forestTrees / forest > 0.4, `forests are dense with trees (${(forestTrees / forest * 100).toFixed(0)}%)`);
  assert(grass > 20 && grassTrees / grass < 0.1, 'grassland has few trees');
}

section('terrain.getDeposit and extract: minerals');
{
  const t = newTerrain('mine');
  const home = t.home;
  const spot = t.findNearestDeposit(home.x, home.y, 'stone', 400);
  assert(spot && spot.type === 'stone' && spot.amount > 0, 'found stone near home');
  const before = t.getDeposit(spot.x, spot.y);
  assert(before && before.type === 'stone' && before.max === undefined, 'getDeposit reports the stone deposit');
  before.amount = 0; // a snapshot: editing it changes nothing
  assert(t.getDeposit(spot.x, spot.y).amount === spot.amount, 'getDeposit returns a copy');

  const got = t.extract(spot.x, spot.y, 10);
  assert(got === 10 && t.getDeposit(spot.x, spot.y).amount === spot.amount - 10, 'extracting 10 takes exactly 10');
  const rest = t.getDeposit(spot.x, spot.y).amount;
  const all = t.extract(spot.x, spot.y, 100000);
  assert(all === rest, 'asking for more than is there returns what was left');
  assert(t.getDeposit(spot.x, spot.y) === null && t.getTile(spot.x, spot.y).deposit === null, 'a depleted mineral becomes none');
  assert(t.extract(spot.x, spot.y, 5) === 0, 'nothing more can be extracted');
  assert(t.extract(spot.x, spot.y, -3) === 0 && t.extract(spot.x, spot.y, NaN) === 0, 'bad amounts extract nothing');
  assert(t.extract(-5, 10, 5) === 0 && t.extract(99999, 10, 5) === 0, 'extracting off the map does nothing');
  const again = t.findNearestDeposit(spot.x, spot.y, 'stone', 400);
  assert(again && (again.x !== spot.x || again.y !== spot.y), 'the nearest search skips the depleted tile');
}

section('Renewables: trees leave stumps that regrow');
{
  const t = newTerrain('trees');
  const home = t.home;
  const tree = t.findNearestDeposit(home.x, home.y, 'wood', 300);
  assert(tree && tree.amount > 20, 'found a tree');
  const max = t.getDeposit(tree.x, tree.y).max;
  assert(max === tree.amount, 'a fresh tree is at its max');
  const taken = t.extract(tree.x, tree.y, 15);
  assert(taken === 15 && t.getDeposit(tree.x, tree.y).amount === max - 15, 'partial harvest');
  assert(t.extract(tree.x, tree.y, 1000) === max - 15, 'felling takes the rest');
  const stump = t.getDeposit(tree.x, tree.y);
  assert(stump && stump.type === 'wood' && stump.amount === 0 && stump.max === max, 'a felled tree stays as a stump (amount 0)');
  assert(t.extract(tree.x, tree.y, 5) === 0, 'a stump yields nothing');
  const other = t.findNearestDeposit(tree.x, tree.y, 'wood', 300);
  assert(!other || other.x !== tree.x || other.y !== tree.y, 'stumps are not found as wood');

  t.regrow(4, 1); // one simulated year
  const sapling = t.getDeposit(tree.x, tree.y).amount;
  assert(sapling > 0 && sapling < max, `a year of regrowth gives some wood (${sapling} of ${max})`);
  for (let i = 0; i < 40; i++) t.update(10, 100);
  assert(t.getDeposit(tree.x, tree.y).amount === max, 'the tree grows back to full over time');
  assert(t.regrowing.size === 0, 'fully regrown deposits stop being tracked');
  assert(t.exportDeltas().filter(d => 'deposit' in d[2]).length === 0, 'a fully regrown tree is no longer a change');

  // fish and fibre regrow faster than wood
  const fish = t.findNearestDeposit(tree.x, tree.y, 'fish', 300);
  assert(fish && t.extract(fish.x, fish.y, 1000) > 0, 'fish can be caught');
  t.regrow(4, 1);
  const fishNow = t.getDeposit(fish.x, fish.y);
  assert(fishNow.amount / fishNow.max > sapling / max, 'fish stocks recover faster than forests');
}

section('Saves: depletion and regrowth persist across eviction and import');
{
  const t = newTerrain('persist');
  const home = t.home;
  const iron = t.findNearestDeposit(home.x, home.y, 'iron', 700) || t.findNearestDeposit(home.x, home.y, 'copper', 900);
  assert(iron, 'found an ore deposit');
  const start = iron.amount;
  t.extract(iron.x, iron.y, 7);
  const wood = t.findNearestDeposit(home.x, home.y, 'wood', 300);
  t.extract(wood.x, wood.y, 1000);
  t.regrow(8, 1);
  const woodAmount = t.getDeposit(wood.x, wood.y).amount;
  const stone = t.findNearestDeposit(home.x, home.y, 'stone', 300);
  t.extract(stone.x, stone.y, 100000);

  assert(t.exportDeltas().filter(d => 'deposit' in d[2]).length === 3, 'exactly the three touched tiles are changes');
  t.pruneChunks([{ x: 5, y: 5, radius: 0 }], 0); // evict everything
  assert(t.chunks.size === 0, 'all chunks evicted');
  assert(t.getDeposit(iron.x, iron.y).amount === start - 7, 'an evicted partly mined ore still shows the remaining amount');
  assert(t.getDeposit(stone.x, stone.y) === null, 'an evicted depleted deposit is still gone');
  assert(t.getTile(iron.x, iron.y).deposit.amount === start - 7, 'regenerated chunk keeps the mined amount');
  assert(t.getTile(wood.x, wood.y).deposit.amount === woodAmount && t.regrowing.has(t.getTile(wood.x, wood.y)), 'a partly regrown tree reloads partly grown and keeps growing');

  const list = JSON.parse(JSON.stringify(t.exportDeltas()));
  const u = newTerrain('persist');
  u.importDeltas(list);
  assert(u.getTile(iron.x, iron.y).deposit.amount === start - 7, 'an imported save keeps the mined ore');
  assert(u.getTile(stone.x, stone.y).deposit === null, 'an imported save keeps the depleted stone');
  assert(u.getTile(wood.x, wood.y).deposit.amount === woodAmount, 'an imported save keeps the regrowth state');
  assert(JSON.stringify(u.exportDeltas().sort()) === JSON.stringify(list.slice().sort()), 'exporting again gives the same changes');
}

section('findNearestDeposit: correct and fast');
{
  const t = newTerrain('search');
  const home = t.home;
  const start = performance.now();
  const results = {};
  for (const type of RESOURCE_TYPES) results[type] = t.findNearestDeposit(home.x, home.y, type, 400);
  const cold = performance.now() - start;
  const found = RESOURCE_TYPES.filter(r => results[r]);
  assert(found.length >= 14, `most resources are found within 400 tiles of home (${found.length}/${RESOURCE_TYPES.length}: missing ${RESOURCE_TYPES.filter(r => !results[r]).join(',')})`);
  assert(found.every(r => {
    const d = t.getDeposit(results[r].x, results[r].y);
    return d && d.type === r && d.amount >= 1 && results[r].distance <= 400.001;
  }), 'every result really is a deposit of that type within range');
  assert(cold < 4000, `19 cold searches took ${cold.toFixed(0)} ms`);
  const warmStart = performance.now();
  for (const type of RESOURCE_TYPES) t.findNearestDeposit(home.x, home.y, type, 400);
  const warm = performance.now() - warmStart;
  assert(warm < 400, `19 warm searches took ${warm.toFixed(0)} ms`);
  assert(t.chunks.size < 30, `searching does not generate chunks (${t.chunks.size} loaded)`);

  // compare with a brute force scan: ores exactly, common deposits within the sample stride
  const cx = home.x + 60;
  const cy = home.y + 20;
  for (const type of ['copper', 'iron', 'coal']) {
    const near = t.findNearestDeposit(cx, cy, type, 300);
    let best = Infinity;
    if (near) {
      for (let y = cy - 300; y <= cy + 300; y += 1) {
        for (let x = cx - Math.ceil(Math.sqrt(Math.max(0, near.distance * near.distance - (y - cy) * (y - cy)))); x <= cx + Math.ceil(near.distance); x += 1) {
          const d = t.getDeposit(x, y);
          if (d && d.type === type) best = Math.min(best, Math.hypot(x - cx, y - cy));
          if (best <= near.distance) break;
        }
        if (best <= near.distance) break;
      }
    }
    assert(!near || Math.abs(best - near.distance) < 1e-9 || best === Infinity, `${type}: nothing is closer than the reported nearest (${near ? near.distance.toFixed(1) : 'none'})`);
  }
  let worse = 0;
  for (const type of ['wood', 'stone', 'fibre', 'sand', 'fish']) {
    const near = t.findNearestDeposit(cx, cy, type, 120);
    if (!near) continue;
    let best = Infinity;
    const R = Math.min(120, Math.ceil(near.distance) + 1);
    for (let y = cy - R; y <= cy + R; y++) {
      for (let x = cx - R; x <= cx + R; x++) {
        const d = t.peekDeposit(x, y);
        if (d && d.type === type && d.amount >= 1) best = Math.min(best, Math.hypot(x - cx, y - cy));
      }
    }
    if (near.distance > best + 6) worse++;
  }
  assert(worse === 0, 'common-deposit searches are within a few tiles of the true nearest');
  assert(t.findNearestDeposit(home.x, home.y, 'unobtainium', 100) === null, 'unknown types find nothing');
  assert(t.findNearestDeposit(home.x, home.y, 'uranium', 5) === null, 'a tiny search radius can find nothing');
}

summary();
