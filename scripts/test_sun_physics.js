import { SpacePhysicsEngine } from '../src/cosmos/spacePhysics.js';
import * as THREE from 'three';

console.log('Testing Solar Gravitational Physics and Tidal Roche Limit...');

// Create engine with a star of mass 12000, radius 14 (Yellow Dwarf)
const engine = new SpacePhysicsEngine(12000, 0.85, 14, 'Sol Prime');
console.log(`Star radius: ${engine.starRadius}, Roche Limit: ${engine.rocheLimit}`);

// 1. Stable planet at distance 80 AU (well outside Roche limit 30.8 AU)
const stablePlanet = {
  id: 'stable_p',
  name: 'Stable World',
  radius: 4,
  distance: 80,
  angle: 0,
  physicsPos: new THREE.Vector3(80, 0, 0),
  physicsVel: new THREE.Vector3(0, 0, 10),
  meshGroup: { position: new THREE.Vector3() },
  isConsumed: false
};
engine.registerBody(stablePlanet);

// 2. Dangerous close planet at distance 25 AU (inside Roche limit 30.8 AU)
const doomedPlanet = {
  id: 'doomed_p',
  name: 'Icarus World',
  radius: 3.5,
  distance: 25,
  angle: 0,
  physicsPos: new THREE.Vector3(25, 0, 0),
  physicsVel: new THREE.Vector3(0, 0, 15),
  meshGroup: { position: new THREE.Vector3() },
  isConsumed: false
};
engine.registerBody(doomedPlanet);

console.log(`Initial distances: Stable = ${stablePlanet.distance.toFixed(1)} AU, Doomed = ${doomedPlanet.distance.toFixed(1)} AU`);

// Simulate physics steps
let doomedConsumed = false;
for (let step = 0; step < 120; step++) {
  engine.step(0.05, 10);
  if (doomedPlanet.isConsumed && !doomedConsumed) {
    doomedConsumed = true;
    console.log(`[STEP ${step}] Doomed planet consumed by: ${doomedPlanet.consumedBy}`);
    console.log(`Collision events recorded: ${engine.collisionEvents.length}`);
    const lastEvent = engine.collisionEvents[engine.collisionEvents.length - 1];
    console.log(`Event type: ${lastEvent.type}, Star: ${lastEvent.starName}`);
  }
}

console.log(`Final state:`);
console.log(`  • Stable World distance: ${stablePlanet.distance.toFixed(1)} AU (remains stable: ${!stablePlanet.isConsumed})`);
console.log(`  • Icarus World consumed: ${doomedPlanet.isConsumed}`);

if (stablePlanet.distance > 70 && !stablePlanet.isConsumed && doomedPlanet.isConsumed) {
  console.log('✅ ALL SOLAR PHYSICS CHECKS PASSED!');
  process.exit(0);
} else {
  console.error('❌ Solar physics check failed!');
  process.exit(1);
}
