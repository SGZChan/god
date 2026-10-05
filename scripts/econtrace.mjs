// Treasury, GDP, taxes, prices and trade routes per civilization. Usage: node scripts/econtrace.mjs [seed] [years] [every]
import { createPlanetWorld } from '../src/simulation/world.js';
import { SeededRNG } from '../src/cosmos/seed.js';
import { setActiveRng } from '../src/simulation/random.js';
import { runSimulationSteps } from '../src/simulation/fixedStep.js';
import { currencyOf } from '../src/civilization/markets.js';
const [seed = 'soak-1', years = '200', every = '50'] = process.argv.slice(2);
const rng = new SeededRNG(seed); setActiveRng(rng);
const sim = createPlanetWorld(rng, { seed, radius: 1 }); setActiveRng(rng);
for (let y = Number(every); y <= Number(years); y += Number(every)) {
  runSimulationSteps(sim, Number(every) * 80);
  for (const c of sim.society.civilizations.filter(c => c.isAlive)) console.log(`y${y} ${c.name.slice(0, 14).padEnd(14)} pop ${String(c.citizens).padStart(3)} ${currencyOf(c).name.padEnd(16)} treasury ${Math.round(c.treasury || 0)} gdp ${c.gdp} tax ${c.taxRate} prices ${c.priceLevel} routes ${Object.keys(c.tradeRoutes || {}).length} soldiers ${c.soldiers} L${Math.round(c.legitimacy)}`);
}
