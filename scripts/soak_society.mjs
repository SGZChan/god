// Headless soak of the sapient society: runs the real simulation for many simulated years and reports, per civilization,
// population, employment, buildings (finished vs under construction), mines dug, deposits discovered, eras, settlements,
// clans and stockpiles. Usage: node scripts/soak_society.mjs [seed] [simulatedYears] [reportEveryYears] [flat]
//   (one simulated year = 4 simulated seconds = 80 steps at 20 Hz)
import { createPlanetWorld } from '../src/simulation/world.js';
import { SeededRNG } from '../src/cosmos/seed.js';
import { setActiveRng } from '../src/simulation/random.js';
import { runSimulationSteps } from '../src/simulation/fixedStep.js';
import { foodUnits } from '../src/civilization/economy.js';
import { BUILDING_TYPES } from '../src/world/buildings.js';

const seed = process.argv[2] || 'soak-1';
const years = Number(process.argv[3] || 300);
const every = Number(process.argv[4] || 50);
const flat = process.argv[5] === 'flat';

const rng = new SeededRNG(seed);
setActiveRng(rng);
const sim = createPlanetWorld(rng, { seed, flat, radius: 1 });
setActiveRng(rng);

const t0 = Date.now();
function report(year) {
  const { terrain, ecosystem, society } = sim;
  const lines = [];
  for (const civ of society.civilizations) {
    if (!civ.isAlive) { lines.push(`  ${civ.name}: FALLEN`); continue; }
    const jobs = {};
    let employed = 0;
    let adults = 0;
    let homeless = 0;
    let carrying = 0;
    for (const e of ecosystem.entities) {
      if (!e.alive || e.civilization !== civ) continue;
      if (e.isAdult) { adults++; if (!e.homeId) homeless++; }
      if (e.job) { jobs[e.job] = (jobs[e.job] || 0) + 1; employed++; }
      if (Object.keys(e.inventory).length) carrying++;
    }
    const built = {};
    let sites = 0;
    for (const b of terrain.buildings.values()) {
      if (b.civId !== civ.id || b.type === 'ruins') continue;
      if (b.progress < 1) sites++;
      else built[b.type] = (built[b.type] || 0) + 1;
    }
    const food = civ.settlements.reduce((n, s) => n + foodUnits(s.stock), 0);
    const stock = {};
    for (const s of civ.settlements) for (const [k, v] of Object.entries(s.stock)) stock[k] = Math.round(((stock[k] || 0) + v));
    lines.push(`  ${civ.name} [${civ.era.name}] citizens=${civ.citizens} adults=${adults} homeless=${homeless} employed=${employed} carrying=${carrying}`);
    lines.push(`    settlements=${civ.settlements.length} clans=${civ.clans.length} sites=${sites} food=${food.toFixed(0)} tech=${civ.techPoints.toFixed(0)} explored=${civ.explored.length} discovered=[${civ.discovered.join(',')}]`);
    lines.push(`    jobs ${JSON.stringify(jobs)}`);
    lines.push(`    built ${JSON.stringify(built)}`);
    lines.push(`    stock ${JSON.stringify(stock)}`);
    lines.push(`    output ${JSON.stringify(Object.fromEntries(Object.entries(civ.output).map(([k, v]) => [k, Math.round(v)])))}`);
  }
  const animals = ecosystem.entities.filter(e => e.alive && !e.isSapient).length;
  console.log(`--- year ${year} (${((Date.now() - t0) / 1000).toFixed(1)}s wall) entities=${ecosystem.entities.length} animals=${animals} buildings=${terrain.buildings.size}`);
  for (const l of lines) console.log(l);
}

const STEPS_PER_YEAR = 80;
report(0);
for (let y = every; y <= years; y += every) {
  runSimulationSteps(sim, every * STEPS_PER_YEAR);
  setActiveRng(rng);
  report(y);
}
