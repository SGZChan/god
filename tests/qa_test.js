// Comprehensive Automated QA Test Suite for Genesis & Cosmos
import { SpacePhysicsEngine } from '../src/cosmos/spacePhysics.js';
import { SeededRNG } from '../src/cosmos/seed.js';
import { CatchUpEngine } from '../src/simulation/catchUpEngine.js';
import { PlanetTerrain } from '../src/planet/terrain.js';
import { Ecosystem } from '../src/life/ecosystem.js';
import { SocietyManager } from '../src/civilization/society.js';
import * as THREE from 'three';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

console.log('====================================================');
console.log('   RUNNING QA VALIDATION TESTS — GENESIS & COSMOS   ');
console.log('====================================================\n');

// --- TEST 1: SeededRNG Determinism ---
console.log('Test Suite 1: SeededRNG Determinism');
const rng1 = new SeededRNG('Minecraft-1337');
const rng2 = new SeededRNG('Minecraft-1337');
const rng3 = new SeededRNG('DifferentSeed-999');

const val1 = [rng1.next(), rng1.next(), rng1.range(10, 50)];
const val2 = [rng2.next(), rng2.next(), rng2.range(10, 50)];
const val3 = [rng3.next(), rng3.next(), rng3.range(10, 50)];

assert(JSON.stringify(val1) === JSON.stringify(val2), 'Identical seeds produce identical sequences');
assert(JSON.stringify(val1) !== JSON.stringify(val3), 'Different seeds produce different sequences');

// --- TEST 2: Space Physics & Orbital Stability (No Solar Death Loop) ---
console.log('\nTest Suite 2: Orbital Stability & Zero Solar Collisions');
const physics = new SpacePhysicsEngine(12000, 0.85);

const mockPlanet1 = {
  id: 'p1',
  name: 'Terra Nova',
  distance: 65,
  angle: 0.5,
  radius: 5,
  mass: 125,
  physicsPos: new THREE.Vector3(65, 0, 0),
  physicsVel: new THREE.Vector3(0, 0, 10),
  meshGroup: { position: new THREE.Vector3() },
  getWorldPosition: (v) => v.copy(mockPlanet1.physicsPos)
};

const mockPlanet2 = {
  id: 'p2',
  name: 'Ignis Prime',
  distance: 35,
  angle: 1.2,
  radius: 3.5,
  mass: 40,
  physicsPos: new THREE.Vector3(35, 0, 0),
  physicsVel: new THREE.Vector3(0, 0, 15),
  meshGroup: { position: new THREE.Vector3() },
  getWorldPosition: (v) => v.copy(mockPlanet2.physicsPos)
};

physics.registerBody(mockPlanet1);
physics.registerBody(mockPlanet2);

// Run 5,000 physics frames (representing hours of continuous simulation)
let minDistanceObserved = Infinity;
for (let frame = 0; frame < 5000; frame++) {
  physics.step(0.016, 1);
  const d1 = mockPlanet1.physicsPos.length();
  const d2 = mockPlanet2.physicsPos.length();
  if (d1 < minDistanceObserved) minDistanceObserved = d1;
  if (d2 < minDistanceObserved) minDistanceObserved = d2;
}

assert(minDistanceObserved >= 34.5, `Planet never falls through sun (Min Distance: ${minDistanceObserved.toFixed(2)} AU >= 34.5 AU)`);
assert(physics.collisionEvents.length === 0, 'Zero spurious collision / solar death events generated');

// --- TEST 3: Rogue Planet Detection at Extreme Distance ---
console.log('\nTest Suite 3: Rogue Planet Escaping Solar Gravity');
const farPlanet = {
  id: 'p_rogue',
  name: 'Rogue Wanderer',
  distance: 450, // Beyond solar gravitational hold (> 420 AU)
  angle: 0,
  radius: 4,
  mass: 64,
  physicsPos: new THREE.Vector3(450, 0, 0),
  physicsVel: new THREE.Vector3(0, 0, 10),
  meshGroup: { position: new THREE.Vector3() },
  getWorldPosition: (v) => v.copy(farPlanet.physicsPos)
};
physics.registerBody(farPlanet);
physics.step(0.016, 1);

assert(farPlanet.isRoguePlanet === true, 'Planet at extreme distance properly identified as Rogue Planet');

// --- TEST 4: Asteroid Impact Lifecycle (Single Event Trigger) ---
console.log('\nTest Suite 4: Cosmic Asteroid Single-Fire Collision');
const targetPlanet = {
  id: 'target_earth',
  name: 'Target Planet',
  distance: 70,
  angle: 0,
  radius: 5,
  mass: 125,
  physicsPos: new THREE.Vector3(70, 0, 0),
  physicsVel: new THREE.Vector3(0, 0, 0),
  meshGroup: { position: new THREE.Vector3(70, 0, 0) },
  getWorldPosition: (v) => v.copy(targetPlanet.physicsPos)
};
physics.registerBody(targetPlanet);

// Spawn asteroid heading directly at target
const ast = physics.spawnAsteroid(new THREE.Vector3(70, 0, 10), targetPlanet, 50);
ast.velocity.set(0, 0, -20); // Head straight into target

// Step until collision
for (let f = 0; f < 50; f++) {
  physics.step(0.016, 1);
}

const impactEvents = physics.collisionEvents.filter(e => e.type === 'ASTEROID_IMPACT');
assert(impactEvents.length === 1, `Exactly 1 impact event recorded upon asteroid hit (Count: ${impactEvents.length})`);
assert(ast.isDead === true, 'Asteroid marked dead and cleaned up after collision');

// --- TEST 5: CatchUpEngine Analytical Fast-Forward ---
console.log('\nTest Suite 5: Unloaded Planet Catch-Up Engine');
const terrain = new PlanetTerrain({ seed: 'qa', flat: true });
const ecosystem = new Ecosystem(terrain);
const society = new SocietyManager(terrain, ecosystem);
const catchUp = new CatchUpEngine();

const initialTech = society.civilizations[0] ? society.civilizations[0].techPoints : 0;
const report = catchUp.fastForwardPlanet({
  planet: { name: 'Test World' },
  terrain,
  ecosystem,
  society
}, 500, rng1);

assert(report !== null, 'Catch-up report generated successfully');
assert(report.yearsElapsed === 500, `Years elapsed calculated correctly (${report.yearsElapsed} yrs)`);
if (society.civilizations[0]) {
  assert(society.civilizations[0].techPoints > initialTech, 'Civilization advanced tech during unobserved time');
}

console.log('\n====================================================');
console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
console.log('====================================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  console.log('🎯 ALL QA TESTS PASSED! APPLICATION IS ROBUST AND READY.');
}
