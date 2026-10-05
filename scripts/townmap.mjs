// Prints an ASCII map of a civilization's capital after N simulated years, to check the town layout.
// Usage: node scripts/townmap.mjs [seed] [years] [civIndex]
import { createPlanetWorld } from '../src/simulation/world.js';
import { SeededRNG } from '../src/cosmos/seed.js';
import { setActiveRng } from '../src/simulation/random.js';
import { runSimulationSteps } from '../src/simulation/fixedStep.js';
import { BUILDING_TYPES } from '../src/world/buildings.js';

const [seed = 'town-1', years = '150', ci = '0'] = process.argv.slice(2);
const rng = new SeededRNG(seed);
setActiveRng(rng);
const sim = createPlanetWorld(rng, { seed, radius: 1 });
setActiveRng(rng);
runSimulationSteps(sim, Number(years) * 80);
for (const c of sim.society.civilizations) console.log(' *', c.name, c.era.id, c.citizens, c.isAlive);
const civ = ci === 'best' || ci === '0' ? [...sim.society.civilizations].sort((a, b) => b.citizens - a.citizens)[0] : sim.society.civilizations[Number(ci)];
const st = civ.settlements[0];
const CH = { housing: 'h', civic: 'C', storage: 'g', farm: 'f', workshop: 'w', defense: 'D', religious: 'T', extraction: 'm', dock: 'd' };
const R = 34;
console.log(civ.name, civ.era.id, 'citizens', civ.citizens, 'settlements', civ.settlements.length, 'wall', st.wall ? `${st.wall.kind} left ${st.wall.pieces.length}` : 'none');
for (let y = st.y - 22; y <= st.y + 18; y++) {
  let row = '';
  for (let x = st.x - R; x <= st.x + R; x++) {
    if (!sim.terrain.inBounds(x, y)) { row += ' '; continue; }
    const t = sim.terrain.getTile(x, y);
    const s = t.structure;
    if (s) {
      const b = sim.terrain.buildings.get(s.buildingId || s.id) || null;
      const def = b ? BUILDING_TYPES[b.type] : null;
      row += def ? (b.type.includes('wall') || b.type === 'palisade' ? '#' : b.type.includes('gate') ? 'G' : b.type === 'keep' ? 'K' : CH[def.category] || '?') : '?';
    } else row += t.road ? '.' : t.biome.isWater ? '~' : ' ';
  }
  console.log(row);
}
import { missingForEra } from '../src/civilization/techTree.js';
import { isDiscovered } from '../src/civilization/exploration.js';
import { buildingsOf } from '../src/civilization/settlements.js';
const built = t => [...sim.terrain.buildings.values()].some(b => b.civId === civ.id && b.type === t && b.progress >= 1);
console.log('techPoints', Math.round(civ.techPoints), 'missing bronze:', missingForEra(civ, 'BRONZE_AGE', { discovered: t => isDiscovered(civ, t), built }), 'known', (civ.knownDeposits || []).length);
const jobs = {};
for (const e of sim.ecosystem.entities) if (e.alive && e.civilization === civ && e.job) jobs[e.job] = (jobs[e.job] || 0) + 1;
console.log('jobs', JSON.stringify(jobs), 'sizes', civ.settlements.map(s => s.population).join(','));
for (const s of civ.settlements) {
  const b = buildingsOf(sim.terrain, s).filter(x => x.progress >= 1).map(x => x.type);
  const has = t => b.filter(x => x === t).length;
  console.log(s.name.padEnd(14), 'pop', s.population, 'smithy', has('smithy'), 'kiln', has('kiln'), 'mine', has('mine'), 'stock cu/tin/wood', ['copper', 'tin', 'wood'].map(k => Math.round((s.stock || {})[k] || 0)).join('/'));
}
console.log('output', JSON.stringify(civ.output));
