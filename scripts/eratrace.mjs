// What blocks each civilization's next era? Usage: node scripts/eratrace.mjs [seed] [years]
import { createPlanetWorld } from '../src/simulation/world.js';
import { SeededRNG } from '../src/cosmos/seed.js';
import { setActiveRng } from '../src/simulation/random.js';
import { runSimulationSteps } from '../src/simulation/fixedStep.js';
import { ERAS, missingForEra } from '../src/civilization/techTree.js';
import { isDiscovered } from '../src/civilization/exploration.js';
const [seed = 'soak-1', years = '150'] = process.argv.slice(2);
const rng = new SeededRNG(seed); setActiveRng(rng);
const sim = createPlanetWorld(rng, { seed, radius: 1 }); setActiveRng(rng);
for (let y = 50; y <= Number(years); y += 50) {
  runSimulationSteps(sim, 50 * 80);
  for (const c of sim.society.civilizations.filter(c => c.isAlive)) {
    const i = ERAS.findIndex(e => e.id === c.era.id);
    const next = ERAS[Math.min(ERAS.length - 1, i + 1)];
    const built = t => [...sim.terrain.buildings.values()].some(b => b.civId === c.id && b.type === t && b.progress >= 1);
    console.log(`y${y} ${c.name.slice(0, 14)} pop ${c.citizens} ${c.era.id} pts ${Math.round(c.techPoints)}/${next.reqPoints} missing: ${missingForEra(c, next.id, { discovered: t => isDiscovered(c, t), built }).join('; ') || '-'}`);
  }
}
