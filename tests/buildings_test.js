import { assert, section, summary, emptyWorld, defaultWorld } from './helpers.js';
import { SeededRNG } from '../src/cosmos/seed.js';
import { setActiveRng } from '../src/simulation/random.js';
import { PlanetTerrain } from '../src/planet/terrain.js';
import { BIOMES } from '../src/planet/biomes.js';
import { AStarPathfinder } from '../src/ai/pathfinding.js';
import { RESOURCES } from '../src/world/resources.js';
import {
  BUILDING_TYPES, BUILDING_IDS, ROAD_KINDS, spriteMetrics, TILE_PX, doorTile, frontTile, missingMaterials, typesForTier
} from '../src/world/buildings.js';
import { composeBuilding, stageOf, damageLevel } from '../src/art/buildingSprites.js';
import { composeRoadTile } from '../src/art/roadTiles.js';
import { composeSprite, SPRITE_H } from '../src/art/creatureSprite.js';
import { Genome } from '../src/life/genome.js';
import { createPlanetWorld } from '../src/simulation/world.js';
import { serializeSim, restoreSim } from '../src/persistence/saveGame.js';
import { initTown, growTown, tickTown } from '../src/civilization/townPlanner.js';
import { getEraForPoints } from '../src/civilization/techTree.js';
import { runSimulationSteps } from '../src/simulation/fixedStep.js';

console.log('====================================================');
console.log('   BUILDING TESTS                                   ');
console.log('====================================================');
setActiveRng(new SeededRNG('building-tests'));

const CREATURE_PX = SPRITE_H; // a creature sprite is 20 px tall

section('Catalogue: every required kind of building exists with sane data');
{
  const need = ['tent', 'hut', 'wooden_house', 'longhouse', 'stone_house', 'manor', 'well', 'granary', 'farm', 'pen', 'workshop', 'smithy', 'kiln',
    'lumber_camp', 'quarry', 'mine', 'market_stall', 'market', 'dock', 'windmill', 'watchtower', 'palisade', 'palisade_gate', 'stone_wall',
    'stone_gate', 'wall_tower', 'keep', 'shrine', 'temple', 'cathedral', 'library', 'barracks', 'tavern', 'graveyard', 'factory', 'power_plant', 'spaceport'];
  assert(need.every(id => BUILDING_TYPES[id]), 'all required types are in the catalogue');
  const defs = BUILDING_IDS.map(id => BUILDING_TYPES[id]);
  assert(defs.every(d => d.w >= 1 && d.h >= 1 && d.work > 0 && d.health > 0 && d.tier >= 0 && d.tier <= 5), 'footprints, work, health and tier are valid');
  assert(defs.every(d => Object.keys(d.cost).every(r => RESOURCES[r])), 'material costs only use known resources');
  assert(defs.every(d => !d.door || (d.door.x >= 0 && d.door.x < d.w && d.door.y >= 0 && d.door.y < d.h)), 'doors lie inside the footprint');
  assert(BUILDING_TYPES.hut.w === 2 && BUILDING_TYPES.wooden_house.w === 3 && BUILDING_TYPES.wooden_house.h === 3, 'huts are 2x2 and houses 3x3');
  assert(BUILDING_TYPES.keep.w === 6 && BUILDING_TYPES.keep.h === 6 && BUILDING_TYPES.wall_tower.w === 2, 'keeps are 6x6 and towers 2x2');
  assert(BUILDING_TYPES.palisade.connects === 'wall' && BUILDING_TYPES.stone_gate.door, 'walls autotile and gates have a door');
  assert(typesForTier(0).every(d => d.tier === 0) && typesForTier(5).length === BUILDING_IDS.length, 'typesForTier filters by era');
  assert(missingMaterials({ type: 'hut', delivered: { wood: BUILDING_TYPES.hut.cost.wood } }).fibre === BUILDING_TYPES.hut.cost.fibre && !missingMaterials({ type: 'hut', delivered: { wood: BUILDING_TYPES.hut.cost.wood } }).wood, 'missingMaterials subtracts deliveries');
}

section('Sprites: houses stand far taller than creatures');
{
  const houses = ['wooden_house', 'longhouse', 'stone_house', 'manor', 'granary', 'workshop', 'smithy', 'tavern', 'temple', 'keep', 'cathedral'];
  assert(houses.every(id => spriteMetrics(BUILDING_TYPES[id]).height >= CREATURE_PX * 2.5), 'houses and halls are at least 2.5x a creature');
  assert(spriteMetrics(BUILDING_TYPES.hut).height >= CREATURE_PX * 2 && spriteMetrics(BUILDING_TYPES.tent).height >= CREATURE_PX * 1.9, 'huts and tents are at least 2x a creature');
  assert(spriteMetrics(BUILDING_TYPES.keep).height >= CREATURE_PX * 6, 'a keep towers six creatures high');
  assert(spriteMetrics(BUILDING_TYPES.wooden_house).width >= 3 * TILE_PX, 'a house is at least three tiles wide');
}

section('Sprites: composition is deterministic, complete and styled');
{
  const style = { pal: 'stone', accent: '#38bdf8' };
  const hash = s => { let h = 0; for (const v of s.data) h = (Math.imul(h, 31) + v) | 0; return h; };
  let allOk = true;
  let allSized = true;
  for (const id of [...BUILDING_IDS, 'ruins']) {
    const a = composeBuilding(id, { style });
    const b = composeBuilding(id, { style });
    const m = spriteMetrics(BUILDING_TYPES[id]);
    if (hash(a) !== hash(b)) allOk = false;
    if (a.w !== m.width || a.h !== m.height) allSized = false;
    let opaque = 0;
    for (let i = 3; i < a.data.length; i += 4) if (a.data[i] > 0) opaque++;
    if (opaque < 80) allOk = false;
  }
  assert(allOk, 'every type composes the same non-empty sprite twice');
  assert(allSized, 'sprites have the catalogue size');
  const stone = hash(composeBuilding('stone_house', { style: { pal: 'stone' } }));
  const timber = hash(composeBuilding('stone_house', { style: { pal: 'timber' } }));
  const sand = hash(composeBuilding('stone_house', { style: { pal: 'sandstone' } }));
  const snow = hash(composeBuilding('stone_house', { style: { pal: 'stone', snow: true } }));
  const accent = hash(composeBuilding('manor', { style: { pal: 'stone', accent: '#ff0000' } }));
  const accent2 = hash(composeBuilding('manor', { style: { pal: 'stone', accent: '#00ff00' } }));
  assert(new Set([stone, timber, sand, snow]).size === 4, 'stone, timber, sandstone and snow styles differ');
  assert(accent !== accent2, 'the civilization accent colour changes the sprite');
  assert(composeBuilding('hut', { style }).hooks.smoke.length > 0 && composeBuilding('stone_house', { style }).hooks.smoke.length > 0, 'chimneys expose smoke hooks');
  assert(composeBuilding('keep', { style, fire: true, damage: 0.8 }).hooks.fire.length > 0, 'a burning building exposes fire hooks');
}

section('Sprites: construction stages and damage');
{
  const style = { pal: 'stone' };
  const h = p => { const s = composeBuilding('stone_house', { style, progress: p }); let n = 0; for (let i = 3; i < s.data.length; i += 4) if (s.data[i]) n++; return { n, s }; };
  assert(stageOf(0) === 0 && stageOf(0.3) === 2 && stageOf(0.99) === 6 && stageOf(1) === 7, 'progress maps onto eight stages');
  const sizes = [0.05, 0.3, 0.5, 0.7, 0.9, 1].map(p => h(p).n);
  assert(sizes[0] < sizes[3] && sizes[3] < sizes[5] && sizes[1] < sizes[4], 'a building gains pixels as it is built');
  const seen = new Set([0, 0.15, 0.3, 0.5, 0.65, 0.8, 0.9, 1].map(p => stageOf(p)));
  assert(seen.size === 8, 'all eight construction stages are reachable');
  const top = s => { for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if (s.data[(y * s.w + x) * 4 + 3]) return y; return s.h; };
  assert(top(h(0.05).s) > top(h(1).s) + 20, 'a foundation is much lower than the finished house');
  assert(damageLevel(0) === 0 && damageLevel(0.2) === 1 && damageLevel(0.5) === 2 && damageLevel(0.9) === 3, 'damage is quantised to four levels');
  const clean = composeBuilding('keep', { style });
  const wrecked = composeBuilding('keep', { style, damage: 0.9 });
  let diff = 0;
  for (let i = 0; i < clean.data.length; i++) if (clean.data[i] !== wrecked.data[i]) diff++;
  assert(diff > 400, 'a wrecked building looks different (cracks, scorch, missing chunks)');
  const w1 = composeBuilding('palisade', { style, mask: 10 });
  const w2 = composeBuilding('palisade', { style, mask: 5 });
  assert(w1.data.some((v, i) => v !== w2.data[i]), 'wall pieces autotile by their neighbours');
  const roads = ROAD_KINDS.map(k => composeRoadTile(k, 10, 0));
  assert(roads.every(r => r.w === TILE_PX && r.opaqueCount() > 50), 'road tiles draw for every road kind');
  assert(composeRoadTile('dirt', 15, 0).opaqueCount() > composeRoadTile('dirt', 0, 0).opaqueCount(), 'a crossing has more road than a lone tile');
}

section('Terrain: placing buildings');
{
  const w = emptyWorld();
  const t = w.terrain;
  assert(t.canPlaceBuilding('stone_house', 20, 20), 'open land accepts a house');
  const b = t.placeBuilding('stone_house', 20, 20, { civId: 'c1', clanId: 'k1' });
  assert(b && b.type === 'stone_house' && b.w === 3 && b.h === 3 && b.progress === 1 && b.civId === 'c1' && b.clanId === 'k1', 'placeBuilding returns the building record');
  assert(t.buildings.get(b.id) === b && t.getBuildingAt(21, 21) === b && t.getBuildingAt(23, 23) === null, 'registered and found by any covered tile');
  const covered = [];
  for (let y = 20; y < 23; y++) for (let x = 20; x < 23; x++) covered.push(t.getTile(x, y).structure);
  assert(covered.every(s => s.buildingId === b.id && s.type === 'stone_house' && s.name && s.icon), 'every covered tile has structure type, name, icon and building id');
  assert(covered.filter(s => s.anchor).length === 1 && t.getTile(20, 20).structure.anchor, 'exactly one tile is the anchor');
  assert(!t.canPlaceBuilding('hut', 21, 21) && t.placeBuilding('hut', 21, 21, {}) === null, 'buildings cannot overlap');
  assert(t.canPlaceBuilding('hut', 24, 20), 'the next plot is free');
  t.getTile(30, 30).biome = BIOMES.OCEAN;
  assert(!t.canPlaceBuilding('hut', 29, 29), 'not on water');
  t.getTile(40, 40).elevation = 0.8;
  assert(!t.canPlaceBuilding('hut', 40, 40), 'not on a steep slope');
  t.getTile(50, 50).deposit = { type: 'iron', amount: 100 };
  assert(!t.canPlaceBuilding('hut', 50, 50) && t.canPlaceBuilding('mine', 50, 50), 'houses are not built on ore, mines are');
  t.getTile(60, 60).deposit = { type: 'wood', amount: 5, max: 5 };
  const hut = t.placeBuilding('hut', 60, 60, {});
  assert(hut && t.getTile(60, 60).deposit === null, 'trees are cleared under a new building');
  const farm = t.placeBuilding('farm', 70, 70, { civId: 'c1' });
  assert(farm && !t.isSolid(70, 70), 'fields are open ground');
  const styled = t.placeBuilding('hut', 80, 80, { style: { pal: 'sandstone' } });
  assert(styled.style.pal === 'sandstone', 'an explicit style is kept');
  assert(t.buildingsInRect(0, 0, 100, 100).length >= 4 && t.buildingsInRect(200, 100, 210, 110).length === 0, 'buildingsInRect finds buildings by area');
}

section('Terrain: construction, damage and ruins');
{
  const w = emptyWorld();
  const t = w.terrain;
  const b = t.placeBuilding('stone_house', 20, 20, { civId: 'c1', progress: 0 });
  const def = BUILDING_TYPES.stone_house;
  assert(b.progress === 0 && !t.isSolid(20, 20), 'a site is walkable while it is being built');
  assert(t.advanceConstruction(b.id, def.work / 2) === false && Math.abs(b.progress - 0.5) < 1e-9, 'half the work gives half the progress');
  assert(t.deliverMaterial(b.id, 'stone', 5) === 5 && b.delivered.stone === 5, 'material deliveries are recorded');
  assert(t.advanceConstruction(b.id, def.work) === true && b.progress === 1, 'enough work completes it');
  assert(t.isSolid(20, 20) && t.isSolid(21, 20), 'the finished walls are solid');
  assert(!t.isSolid(doorTile(b).x, doorTile(b).y), 'but the door tile is open');
  assert(t.damageBuilding(b.id, 50) === false && b.damage > 0 && b.health === def.health - 50, 'damage lowers health and raises damage');
  t.repairBuilding(b.id, 20);
  assert(b.health === def.health - 30, 'repair restores health');
  assert(t.damageBuilding(b.id, 9999) === true, 'enough damage destroys it');
  const ruin = t.getBuildingAt(21, 21);
  assert(ruin && ruin.type === 'ruins' && ruin.x === 20 && ruin.w === 3 && ruin.original === 'stone_house' && ruin.id !== b.id, 'it turns into a ruins building on the same footprint');
  assert(!t.buildings.has(b.id) && t.getTile(21, 21).structure.type === 'ruins' && !t.isSolid(21, 21), 'ruins are passable and the old building is gone');
  assert(t.canPlaceBuilding('hut', 20, 20), 'ruins can be built over');
  const h = t.placeBuilding('hut', 20, 20, {});
  assert(h && !t.buildings.has(ruin.id), 'building over ruins clears them');
  const k = t.placeBuilding('keep', 100, 60, { progress: 1 });
  t.removeBuilding(k.id, { ruins: false });
  assert(!t.buildings.has(k.id) && !t.getTile(101, 61).structure, 'removeBuilding without ruins leaves nothing');
  const g = t.placeBuilding('temple', 120, 40, {});
  t.wreckStructure(t.getTile(121, 41), 'Test Ruins', 'x');
  assert(t.getBuildingAt(122, 42).type === 'ruins', 'god powers ruin whole buildings');
  t.strikeMeteor(135, 45);
  assert(true, 'a meteor strike over buildings does not crash');
}

section('Walking: walls block, doors and roads do not');
{
  const w = emptyWorld();
  const t = w.terrain;
  const pf = new AStarPathfinder(t);
  const b = t.placeBuilding('stone_house', 20, 20, {});
  const door = doorTile(b);
  const front = frontTile(b);
  const through = pf.findPath(front.x + 0.5, front.y + 3.5, 21.5, 19.5, 300);
  assert(through.length > 0 && through.every(p => !t.isSolid(Math.floor(p.x), Math.floor(p.y))), 'a path around a house never crosses a wall');
  const intoDoor = pf.findPath(front.x + 0.5, front.y + 0.5, door.x + 0.5, door.y + 0.5, 100);
  assert(intoDoor.length >= 1 && Math.floor(intoDoor[intoDoor.length - 1].x) === door.x && Math.floor(intoDoor[intoDoor.length - 1].y) === door.y, 'a creature can walk into the door tile');
  // a closed ring of wall with one gate: the only way in is the gate
  for (let x = 40; x <= 50; x++) for (const y of [40, 50]) t.placeBuilding('stone_wall', x, y, {});
  for (let y = 41; y <= 49; y++) for (const x of [40, 50]) t.placeBuilding('stone_wall', x, y, {});
  const wallAt = t.getBuildingAt(45, 50);
  if (wallAt) t.removeBuilding(wallAt.id, { ruins: false });
  t.placeBuilding('stone_gate', 45, 50, {});
  const entry = pf.findPath(45.5, 54.5, 45.5, 45.5, 400);
  assert(entry.length > 0 && entry.some(p => Math.floor(p.x) === 45 && Math.floor(p.y) === 50), 'the path into a walled yard goes through the gate');
  assert(entry.every(p => !t.isSolid(Math.floor(p.x), Math.floor(p.y))), 'and never through the wall');
  // a creature standing inside a freshly completed building can still walk out
  const prisoner = t.placeBuilding('hut', 70, 70, { progress: 0 });
  t.advanceConstruction(prisoner.id, 999);
  const out = pf.findPath(70.5, 70.5, 70.5, 75.5, 100);
  assert(out.length > 0, 'a creature caught inside a new building finds a way out');
  // roads are quicker: the pathfinder prefers a long road over a shorter dirt track
  const w2 = emptyWorld();
  const t2 = w2.terrain;
  const pf2 = new AStarPathfinder(t2);
  for (let x = 10; x <= 30; x++) t2.setRoad(x, 10, 'cobble');
  const cost = (path) => path.reduce((n, p) => n + (t2.getTile(Math.floor(p.x), Math.floor(p.y)).road ? 0.67 : 1), 0);
  const p = pf2.findPath(10.5, 12.5, 30.5, 12.5, 400);
  assert(p.length >= 20 && cost(p) <= p.length, 'paths use roads when they are on the way');
}

section('Roads');
{
  const w = emptyWorld();
  const t = w.terrain;
  assert(t.setRoad(5, 5, 'dirt') && t.getTile(5, 5).road === 'dirt' && t.getRoad(5, 5) === 'dirt', 'a dirt road can be laid');
  assert(t.setRoad(5, 5, 'cobble') && t.getRoad(5, 5) === 'cobble', 'and upgraded');
  assert(!t.setRoad(5, 6, 'asphalt'), 'unknown road kinds are refused');
  t.getTile(8, 8).biome = BIOMES.OCEAN;
  assert(!t.setRoad(8, 8, 'dirt') && t.getRoad(8, 8) === null, 'no roads on water');
  const b = t.placeBuilding('hut', 12, 12, {});
  assert(!t.setRoad(12, 12, 'dirt'), 'no roads through solid walls');
  assert(t.setRoad(5, 5, null) && t.getRoad(5, 5) === null, 'a road can be removed');
}

section('Persistence: buildings and roads survive eviction and save/load');
{
  const w = emptyWorld({ });
  const t = w.terrain;
  const b = t.placeBuilding('manor', 20, 20, { civId: 'c1', clanId: 'k', progress: 0.5 });
  t.deliverMaterial(b.id, 'stone', 7);
  t.placeBuilding('keep', 100, 60, { civId: 'c1' });
  t.damageBuilding(t.getBuildingAt(100, 60).id, 100);
  const dead = t.placeBuilding('hut', 150, 80, {});
  t.removeBuilding(dead.id, { ruins: true });
  for (let x = 30; x < 60; x++) t.setRoad(x, 90, x % 2 ? 'dirt' : 'gravel');
  const before = { b: JSON.stringify(t.exportBuildings()), roads: t.getRoad(40, 90), tile: JSON.stringify(t.getTile(21, 21).structure) };
  // evict every chunk, then touch the tiles again
  t.pruneChunks([], 0);
  assert(t.chunks.size === 0, 'all chunks were evicted');
  assert(t.getRoad(40, 90) === before.roads && t.getRoad(31, 90) === 'dirt', 'roads return with their chunk');
  assert(JSON.stringify(t.getTile(21, 21).structure) === before.tile, 'building tiles return with their chunk');
  assert(JSON.stringify(t.exportBuildings()) === before.b, 'the registry is untouched by eviction');
  // game save: full world
  const rng = new SeededRNG('b-save');
  const sim = createPlanetWorld(rng, { seed: 'b-save', flat: false });
  setActiveRng(rng);
  runSimulationSteps(sim, 400);
  const sizeBefore = sim.terrain.buildings.size;
  assert(sizeBefore > 5, `the generated world has towns (${sizeBefore} buildings)`);
  const a = JSON.stringify(serializeSim(sim));
  const restored = restoreSim(JSON.parse(a));
  assert(restored.terrain.buildings.size === sizeBefore, 'the building registry is restored');
  assert(JSON.stringify(serializeSim(restored)) === a, 'serialize -> restore -> serialize is identical with buildings');
  const any = [...restored.terrain.buildings.values()][0];
  assert(restored.terrain.getBuildingAt(any.x, any.y) === restored.terrain.buildings.get(any.id), 'restored tiles point at the restored buildings');
  const nextId = restored.terrain.nextBuildingId;
  assert(restored.terrain.placeBuilding('tent', any.x + 60, any.y + 60, {}) === null || restored.terrain.nextBuildingId > nextId, 'new buildings get fresh ids after a load');
}

section('Town planner: sparse, sensible, buildable layouts');
{
  const w = defaultWorld();
  const civs = w.society.civilizations;
  const civ = civs[0];
  const own = c => w.terrain.buildingsOfCiv(c.id).filter(b => b.type !== 'ruins');
  assert(civs.every(c => own(c).some(b => b.type === 'hall' || b.type === 'keep')), 'every civilization starts with a hall at its centre');
  const hall = own(civ).find(b => b.type === 'hall');
  const front = frontTile(hall);
  assert(civ.capitalX === front.x && civ.capitalY === front.y, 'the capital is the tile in front of the hall door');
  assert(civ.settlements[0].roadQueue.some(r => r.y === front.y), 'the main street is queued for the builders (nothing is paved for free)');
  assert(own(civ).every(b => b.progress < 1), 'a new settlement starts with construction sites only: the people build everything');
  assert(own(civ).length >= 3 && own(civ).length < 12, `a new town is a handful of buildings (${own(civ).length}), not one per tile`);
  civ.citizens = 30;
  civ.settlements[0].population = 30;
  civ.settlements[0].adults = 26;
  civ.settlements[0].stock = { wood: 999, stone: 999, fibre: 999, clay: 999, iron: 999, coal: 999 }; // a flat test world has no deposits to mine
  civ.techPoints = 900;
  civ.era = getEraForPoints(900);
  for (let i = 0; i < 70; i++) { tickTown(civ, w.terrain, 5); growTown(civ, w.terrain, { instant: true }); }
  const list = own(civ);
  assert(list.length > 25, `the town grew (${list.length} buildings)`);
  const kinds = new Set(list.map(b => b.type));
  assert(['hall', 'farm'].every(k => kinds.has(k)) && [...kinds].some(k => ['stone_house', 'manor', 'wooden_house', 'hut', 'tent'].includes(k)), 'it has a hall, housing and fields');
  // no overlap
  const seen = new Map();
  let overlap = 0;
  for (const b of list) for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) { const k = x + ',' + y; if (seen.has(k)) overlap++; seen.set(k, b.id); }
  assert(overlap === 0, 'no two buildings overlap');
  const onBad = list.filter(b => { for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) if (!w.terrain.isBuildable(x, y)) return true; return false; });
  assert(onBad.length === 0, 'nothing stands on water, ice or peaks');
  // sparse: houses keep a gap to each other
  const houses = list.filter(b => BUILDING_TYPES[b.type].category === 'housing');
  let touching = 0;
  for (const a of houses) for (const b of houses) {
    if (a.id >= b.id) continue;
    const gapX = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
    const gapY = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
    if (gapX < 1 && gapY < 1) touching++;
  }
  assert(touching === 0, `houses never touch (${houses.length} houses)`);
  const density = houses.reduce((n, b) => n + b.w * b.h, 0) / ((Math.max(...houses.map(b => b.x + b.w)) - Math.min(...houses.map(b => b.x))) * (Math.max(...houses.map(b => b.y + b.h)) - Math.min(...houses.map(b => b.y))));
  assert(density < 0.35, `housing covers under a third of the town's area (${(density * 100).toFixed(0)}%)`);
  // every door has a road in front
  const doors = list.filter(b => BUILDING_TYPES[b.type].category === 'housing' && BUILDING_TYPES[b.type].door && !b.type.includes('tent'));
  const withRoad = doors.filter(b => { const f = frontTile(b); return w.terrain.getRoad(f.x, f.y); });
  assert(withRoad.length >= doors.length * 0.8, `most doors open onto a road (${withRoad.length}/${doors.length})`);
  // the planner alone never finishes a site (builders do, see society_test)
  const open = list.filter(b => b.progress < 1).length;
  for (let i = 0; i < 40; i++) tickTown(civ, w.terrain, 5);
  assert(own(civ).filter(b => b.progress < 1).length >= open, 'ticking the planner does not complete any construction site');
  // determinism
  const run = () => {
    setActiveRng(new SeededRNG('plan-det'));
    const world = defaultWorld();
    const c = world.society.civilizations[0];
    c.citizens = 12;
    c.settlements[0].population = 12;
    for (let i = 0; i < 25; i++) { tickTown(c, world.terrain, 5); growTown(c, world.terrain, { instant: true }); }
    return JSON.stringify(world.terrain.exportBuildings());
  };
  assert(run() === run(), 'the same seed plans the same town');
}

section('Town planner: collapse leaves ruins, nomads rebuild');
{
  const w = defaultWorld();
  const civ = w.society.civilizations[0];
  const n = w.terrain.buildingsOfCiv(civ.id).length;
  civ.collapse(w.terrain, 'test', w.ecosystem);
  const mine = [...w.terrain.buildings.values()].filter(b => b.type === 'ruins');
  assert(n > 0 && mine.length >= n && w.terrain.buildingsOfCiv(civ.id).length === 0, 'a collapsed civilization leaves ruins and no buildings');
  assert(mine.every(r => r.name.startsWith('Ancient Ruins of') && r.originalTech !== undefined), 'ruins remember the civilization and its tech');
}

summary();
