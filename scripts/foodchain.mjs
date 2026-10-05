// Population of each trophic group over time. Usage: node scripts/foodchain.mjs [seed] [years] [every]
import { createPlanetWorld } from '../src/simulation/world.js';
import { SeededRNG } from '../src/cosmos/seed.js';
import { setActiveRng } from '../src/simulation/random.js';
import { runSimulationSteps } from '../src/simulation/fixedStep.js';
const [seed = 'soak-1', years = '200', every = '25'] = process.argv.slice(2);
const rng = new SeededRNG(seed); setActiveRng(rng);
const sim = createPlanetWorld(rng, { seed, radius: 1 }); setActiveRng(rng);
const show = y => {
  const g = {};
  for (const e of sim.ecosystem.entities) {
    if (!e.alive || e.isSapient) continue;
    const c = e.traits.carnivory;
    const k = (e.aquatic ? 'sea ' : 'land ') + (c > 0.6 ? 'hunters' : c > 0.25 ? 'omnivores' : 'grazers');
    g[k] = (g[k] || 0) + 1;
  }
  console.log('y' + y, JSON.stringify(g), 'species alive', sim.ecosystem.registry.living().length);
};
show(0);
for (let y = Number(every); y <= Number(years); y += Number(every)) { runSimulationSteps(sim, Number(every) * 80); show(y); }
