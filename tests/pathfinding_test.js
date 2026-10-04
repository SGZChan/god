import { assert, section, summary, emptyWorld } from './helpers.js';
import { AStarPathfinder } from '../src/ai/pathfinding.js';
import { BIOMES } from '../src/planet/biomes.js';

console.log('====================================================');
console.log('   PATHFINDING TESTS                                ');
console.log('====================================================');

section('A*: paths on open ground');
{
  const w = emptyWorld();
  const pf = new AStarPathfinder(w.terrain);
  assert(pf.findPath(5.5, 5.5, 5.2, 5.9).length === 0, 'already there: no path');
  const straight = pf.findPath(0.5, 0.5, 10.5, 0.5);
  assert(straight.length === 10 && straight[9].x === 10.5 && straight[9].y === 0.5, 'a straight 10 tile path has 10 steps and ends on the goal');
  const bent = pf.findPath(0, 0, 6, 4);
  assert(bent.length === 10, 'the shortest 4-way path is the Manhattan distance');
  assert(pf.findPath(-30, -30, -20, -35).length === 15, 'negative coordinates work (the world is infinite)');
  const far = pf.findPath(0, 0, 900, 0);
  assert(far.length > 20 && far[far.length - 1].x > far[0].x, 'a goal beyond the search limit gives a partial path towards it');
}

section('A*: obstacles');
{
  const w = emptyWorld();
  const pf = new AStarPathfinder(w.terrain);
  // lava wall across x = 5 for y in -3..3
  for (let y = -3; y <= 3; y++) {
    const t = w.terrain.getTile(5, y);
    t.biome = BIOMES.VOLCANIC;
    t.elevation = 0.9;
  }
  const path = pf.findPath(0, 0, 10, 0);
  assert(path.length > 10 && path.every(p => !(Math.floor(p.x) === 5 && Math.abs(Math.floor(p.y)) <= 3)), 'the path goes around lava');

  // water costs more, so the path prefers a dry detour when it is cheap
  for (let x = 14; x <= 20; x++) for (let y = -1; y <= 1; y++) w.terrain.getTile(x, y).biome = BIOMES.DEEP_OCEAN;
  const wet = pf.findPath(11, 0, 23, 0);
  assert(wet.length > 0 && wet.every(p => !w.terrain.getTile(Math.floor(p.x), Math.floor(p.y)).biome.isWater), 'it detours around a wide stretch of deep water');
}

section('A*: speed');
{
  const w = emptyWorld();
  const pf = new AStarPathfinder(w.terrain);
  w.terrain.getTile(0, 0);
  const t0 = performance.now();
  let steps = 0;
  for (let i = 0; i < 2000; i++) steps += pf.findPath(i % 40, (i * 7) % 40, 20 + (i % 13), 30 - (i % 11)).length;
  const ms = performance.now() - t0;
  assert(steps > 0 && ms < 2500, `2000 searches take ${ms.toFixed(0)} ms`);
}

summary();
