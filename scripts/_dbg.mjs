import { createPlanetWorld } from '../src/simulation/world.js';
import { SeededRNG } from '../src/cosmos/seed.js';
import { setActiveRng } from '../src/simulation/random.js';
import { runSimulationSteps } from '../src/simulation/fixedStep.js';
import { missingMaterials } from '../src/world/buildings.js';

const seed = process.argv[2] || 'soak-1';
const years = Number(process.argv[3] || 100);
const civIdx = Number(process.argv[4] || 0);
const rng = new SeededRNG(seed);
setActiveRng(rng);
const sim = createPlanetWorld(rng, { seed, radius: 1 });
setActiveRng(rng);
runSimulationSteps(sim, years * 80);
const civ = sim.society.civilizations[civIdx];
console.log(civ.name, 'citizens', civ.citizens, 'era', civ.era.name);
for (const st of civ.settlements) {
  console.log('settlement', st.name, 'pop', st.population, 'stock', JSON.stringify(st.stock), 'need', JSON.stringify(st.need), 'jobs', JSON.stringify(st.jobs), 'blocked', JSON.stringify(st.blocked), 'noRes', JSON.stringify(st.noRes), 'roadQ', st.roadQueue.length);
  for (const b of sim.terrain.buildings.values()) {
    if (b.settlementId !== st.id || b.progress >= 1) continue;
    console.log('  site', b.type, 'progress', b.progress.toFixed(2), 'delivered', JSON.stringify(b.delivered), 'missing', JSON.stringify(missingMaterials(b)));
  }
}
const mem = sim.society.members;
for (const e of sim.ecosystem.entities) {
  if (!e.alive || e.civilization !== civ || !e.isAdult) continue;
  console.log(e.name, e.job, JSON.stringify(e.task), e.activity, 'hunger', Math.round(e.hunger), 'inv', JSON.stringify(e.inventory), 'path', e.path.length);
}
