import { createPlanetWorld } from '../src/simulation/world.js';
import { SeededRNG } from '../src/cosmos/seed.js';
import { setActiveRng } from '../src/simulation/random.js';
import { runSimulationSteps } from '../src/simulation/fixedStep.js';

const seed = process.argv[2] || 'soak-1';
const years = Number(process.argv[3] || 100);
const rng = new SeededRNG(seed);
setActiveRng(rng);
const sim = createPlanetWorld(rng, { seed, radius: 1 });
setActiveRng(rng);
runSimulationSteps(sim, years * 80);
const civ = sim.society.civilizations[0];
const builders = sim.ecosystem.entities.filter(e => e.alive && e.civilization === civ && e.job === 'builder');
const e = builders[0];
console.log(e.name, e.x.toFixed(1), e.y.toFixed(1));
const site = sim.terrain.getBuilding(e.task && e.task.siteId);
console.log('site', site && [site.type, site.x, site.y, site.w, site.h]);
for (let i = 0; i < 40; i++) {
  runSimulationSteps(sim, 20);
  setActiveRng(rng);
  const t = sim.terrain.getTile(Math.floor(e.x), Math.floor(e.y));
  console.log(i, e.x.toFixed(1), e.y.toFixed(1), 'path', e.path.length, 'cd', e.actionCooldown.toFixed(2), e.activity, JSON.stringify(e.task), JSON.stringify(e.inventory), 'structure', t.structure && t.structure.type, e.state);
}
