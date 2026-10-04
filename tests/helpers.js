// Minimal shared test helpers for the Phase 1+ test files.
import { PlanetTerrain } from '../src/planet/terrain.js';
import { Ecosystem } from '../src/life/ecosystem.js';
import { Entity } from '../src/life/entity.js';
import { SocietyManager, Civilization } from '../src/civilization/society.js';

let passed = 0;
let failed = 0;

export function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

export function section(title) {
  console.log(`\n${title}`);
}

export function summary() {
  console.log('\n====================================================');
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('====================================================\n');
  if (failed > 0) process.exit(1);
  console.log('🎯 ALL PHASE 1 TESTS PASSED!');
}

// A flat, featureless grassland world with the real default setup (3 civs, wildlife, humans).
export function defaultWorld() {
  const terrain = new PlanetTerrain({ seed: 'test', flat: true });
  const ecosystem = new Ecosystem(terrain);
  const society = new SocietyManager(terrain, ecosystem);
  terrain.ecosystem = ecosystem;
  terrain.society = society;
  return { terrain, ecosystem, society };
}

// Same flat world with no creatures, no civs and no structures, for controlled tests.
export function emptyWorld(opts) {
  const world = defaultWorld(opts);
  world.ecosystem.entities = [];
  world.society.civilizations = [];
  world.terrain.reset();
  return world;
}

export function addCiv(world, name, cx, cy, citizens = 6) {
  const civ = new Civilization({ name, capitalX: cx, capitalY: cy, population: 45 });
  world.terrain.getTile(cx, cy).structure = { type: 'capital', name: `${name} Keep`, health: 300 };
  world.society.civilizations.push(civ);
  world.society.spawnCitizens(civ, citizens);
  return civ;
}

export function addHuman(world, civ, x, y, role = 'CITIZEN') {
  const species = world.ecosystem.sapientSpecies();
  const entity = new Entity({ species, x, y, role });
  entity.civilization = civ;
  world.ecosystem.entities.push(entity);
  return entity;
}

export function liveCitizens(world, civ) {
  return world.ecosystem.entities.filter(e => e.alive && e.civilization === civ).length;
}
