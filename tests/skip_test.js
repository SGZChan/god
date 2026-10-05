import { assert, section, summary } from './helpers.js';
import { createPlanetWorld } from '../src/simulation/world.js';
import { SeededRNG } from '../src/cosmos/seed.js';
import { setActiveRng } from '../src/simulation/random.js';
import { skipTimeSync, skipTime } from '../src/simulation/timeSkip.js';
import { catchUpEngine } from '../src/simulation/catchUpEngine.js';
import { exploredCount } from '../src/civilization/exploration.js';
import { settlementsOf } from '../src/civilization/settlements.js';
import { serializeSim, restoreSim } from '../src/persistence/saveGame.js';

console.log('====================================================');
console.log('   TIME SKIP TESTS                                   ');
console.log('====================================================');

function world(seed) {
  const rng = new SeededRNG(seed);
  setActiveRng(rng);
  const sim = createPlanetWorld(rng, { seed, radius: 1 });
  sim.rng = rng;
  sim.planet = { name: 'Skipworld' };
  return sim;
}
const people = sim => sim.ecosystem.entities.filter(e => e.alive && e.isSapient);

section('Skipping really lives through the years');
{
  const sim = world('skip-1');
  const civ = sim.society.civilizations[0];
  const idsBefore = new Set(people(sim).map(e => e.id));
  const ageBefore = people(sim).reduce((s, e) => s + e.age, 0) / people(sim).length;
  const exploredBefore = exploredCount(civ);
  const tpBefore = civ.techPoints;
  const buildingsBefore = [...sim.terrain.buildings.values()].filter(b => b.civId === civ.id && b.progress >= 1).length;
  const t = Date.now();
  const r = skipTimeSync(sim, 150);
  const secs = (Date.now() - t) / 1000;
  const nowPeople = people(sim);
  assert(nowPeople.length > 0 && nowPeople.some(e => !idsBefore.has(e.id)), 'a new generation was born and carries on');
  assert(r.births > 20 && r.deaths > 20, `children were born and the old died (${r.births} born, ${r.deaths} died)`);
  assert(nowPeople.filter(e => idsBefore.has(e.id)).every(e => e.age > 100), 'anyone who lived through it is 150 years older');
  assert(exploredCount(civ) > exploredBefore * 3, `the people explored the land (${exploredBefore} -> ${exploredCount(civ)} cells)`);
  assert(civ.techPoints > tpBefore + 100, 'research advanced');
  const buildingsNow = [...sim.terrain.buildings.values()].filter(b => b.civId === civ.id && b.progress >= 1).length;
  assert(buildingsNow > buildingsBefore + 5, `buildings were raised (${buildingsBefore} -> ${buildingsNow})`);
  assert(settlementsOf(civ).length > 1 || sim.society.civilizations.some(c => settlementsOf(c).length > 1), 'new settlements were founded');
  assert(sim.society.civilizations.some(c => c.isAlive && c.era.name !== 'Stone Age'), 'an age was entered');
  const animals = sim.ecosystem.entities.filter(e => e.alive && !e.isSapient);
  assert(animals.length > 60 && sim.ecosystem.registry.living().filter(s => !s.sapient).length >= 3, `wildlife is still there (${animals.length})`);
  assert(secs < 25, `and it was quick (${secs.toFixed(1)} s for 150 years)`);
  assert(sim.ecosystem.entities.every(e => !e.alive || Number.isFinite(e.x) && Number.isFinite(e.y)), 'every creature has a place');
  const back = restoreSim(JSON.parse(JSON.stringify(serializeSim(sim))));
  assert(back.ecosystem.entities.length === sim.ecosystem.entities.length, 'the skipped world saves and loads');
}

section('The same people are older after a short skip');
{
  const sim = world('skip-5');
  const before = new Map(people(sim).map(e => [e.id, e.age]));
  skipTimeSync(sim, 15);
  const same = people(sim).filter(e => before.has(e.id));
  assert(same.length > 0 && same.every(e => Math.abs(e.age - before.get(e.id) - 15) < 1.2), `${same.length} of them are 15 years older`);
}

section('A champion grows old');
{
  const sim = world('skip-2');
  const people0 = sim.ecosystem.sapientSpecies();
  const champ = sim.ecosystem.spawnRandomEntity(people0, true, { name: 'Elder', aiSystem: 'LAYA' });
  const before = champ.age;
  skipTimeSync(sim, 20);
  assert(champ.alive ? champ.age > before + 15 : true, 'a champion ages with the rest');
}

section('Planets nobody watched catch up the same way');
{
  const sim = world('skip-3');
  const r = catchUpEngine.fastForwardPlanet(sim, 80);
  assert(r && r.yearsElapsed === 80 && people(sim).length > 0, 'an unwatched planet lives its years');
  assert(sim.ecosystem.timeYears > 70, 'its clock moved on');
}

section('The async skip gives the page its turns');
{
  const sim = world('skip-4');
  let slices = 0;
  const r = await skipTime(sim, 40, { onSlice: () => { slices++; }, yieldMs: 0 });
  assert(slices >= 3 && r.years === 40, `it works in slices (${slices})`);
}

summary();
