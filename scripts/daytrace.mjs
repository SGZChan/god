// What are the citizens doing at each part of the day? Usage: node scripts/daytrace.mjs [seed] [years]
import { createPlanetWorld } from '../src/simulation/world.js';
import { SeededRNG } from '../src/cosmos/seed.js';
import { setActiveRng } from '../src/simulation/random.js';
import { runSimulationSteps } from '../src/simulation/fixedStep.js';
import { timeOfDay, partOfDay } from '../src/simulation/dayCycle.js';
const [seed = 'soak-1', years = '60'] = process.argv.slice(2);
const rng = new SeededRNG(seed); setActiveRng(rng);
const sim = createPlanetWorld(rng, { seed, radius: 1 }); setActiveRng(rng);
runSimulationSteps(sim, Number(years) * 80);
for (let k = 0; k < 24; k++) {
  runSimulationSteps(sim, 100);
  const t = timeOfDay(sim.ecosystem.timeYears);
  const tally = {};
  let n = 0;
  for (const e of sim.ecosystem.entities) if (e.alive && e.isSapient && e.isAdult && e.civilization) { n++; const key = e.state; tally[key] = (tally[key] || 0) + 1; }
  console.log(partOfDay(t).padEnd(9), t.toFixed(2), n, JSON.stringify(tally));
}
