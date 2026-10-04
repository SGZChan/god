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
const t = sim.terrain;
const stuck = sim.ecosystem.entities.filter(e => e.alive && e.civilization === civ && e.task && e.task.stuck >= 2);
console.log('stuck entities', stuck.length);
const e = stuck[0] || sim.ecosystem.entities.find(x => x.alive && x.civilization === civ && x.job === 'builder');
console.log(e.name, e.x.toFixed(1), e.y.toFixed(1), JSON.stringify(e.task));
const gx = e.task.gx, gy = e.task.gy;
const x0 = Math.floor(Math.min(e.x, gx)) - 6, x1 = Math.ceil(Math.max(e.x, gx)) + 6;
const y0 = Math.floor(Math.min(e.y, gy)) - 6, y1 = Math.ceil(Math.max(e.y, gy)) + 6;
for (let y = y0; y <= y1; y++) {
  let row = '';
  for (let x = x0; x <= x1; x++) {
    const tile = t.getTile(x, y);
    let ch = '.';
    if (tile.biome.isWater) ch = '~';
    else if (tile.structure) ch = tile.structure.solid ? '#' : (tile.structure.type === 'farm' ? 'f' : 's');
    else if (tile.road) ch = '=';
    else if (tile.deposit && tile.deposit.type === 'wood') ch = 't';
    if (Math.floor(e.x) === x && Math.floor(e.y) === y) ch = 'E';
    if (x === gx && y === gy) ch = 'G';
    row += ch;
  }
  console.log(String(y).padStart(4), row);
}
const p = sim.ecosystem.pathfinder.findPath(e.x, e.y, gx + 0.5, gy + 0.5, 5000);
console.log('path len with 5000 iterations', p.length, p.length ? p[p.length - 1] : null);
