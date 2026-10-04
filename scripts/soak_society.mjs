// Headless soak of the sapient society: runs the real simulation for many simulated years and reports, per civilization,
// population, employment, buildings (finished vs under construction), mines dug, deposits discovered, eras, settlements,
// clans and stockpiles, then a summary that checks the claims of the society system:
//   towns grow stage by stage (buildings seen in several construction stages), people are employed, ore is mined,
//   discovery unlocks eras, the population does not collapse, wildlife survives.
// Usage: node scripts/soak_society.mjs [seed[,seed...]] [simulatedYears] [reportEveryYears] [flat]
//   (one simulated year = 4 simulated seconds = 80 steps at 20 Hz)
import { createPlanetWorld } from '../src/simulation/world.js';
import { SeededRNG } from '../src/cosmos/seed.js';
import { setActiveRng } from '../src/simulation/random.js';
import { runSimulationSteps } from '../src/simulation/fixedStep.js';
import { foodUnits } from '../src/civilization/economy.js';
import { Entity } from '../src/life/entity.js';
import { ERAS } from '../src/civilization/techTree.js';
import { ORE_TYPES } from '../src/world/resources.js';

const seeds = (process.argv[2] || 'soak-1').split(',');
const years = Number(process.argv[3] || 300);
const every = Number(process.argv[4] || 50);
const flat = process.argv[5] === 'flat';
const STEPS_PER_YEAR = 80;
const quiet = process.env.QUIET === '1';

// count how sapients die (a hook on the creature class, only for this script)
let deaths = {};
const originalDie = Entity.prototype.die;
Entity.prototype.die = function (cause = 'Unknown') {
  const was = this.alive;
  originalDie.call(this, cause);
  if (was && !this.alive && this.isSapient) {
    const key = cause.replace(/Killed in War.*/, 'War').replace(/Hunted by .*/, 'Hunted').replace(/Executed.*/, 'Executed');
    deaths[key] = (deaths[key] || 0) + 1;
  }
};

function soak(seed) {
  deaths = {};
  const rng = new SeededRNG(seed);
  setActiveRng(rng);
  const sim = createPlanetWorld(rng, { seed, flat, radius: 1 });
  setActiveRng(rng);
  const { terrain, ecosystem, society } = sim;
  const t0 = Date.now();

  // per-civ histories
  const hist = new Map(); // civ id -> { name, eras: [{year, name}], minCitizens, maxCitizens, firstOre: {} }
  const stages = new Map(); // building id -> Set of progress quarters seen while under construction
  const everSite = new Set();
  const done = new Set();
  const track = year => {
    for (const civ of society.civilizations) {
      let h = hist.get(civ.id);
      if (!h) { h = { name: civ.name, eras: [{ year: 0, name: civ.era.name }], peak: 0, minAfter: Infinity, fell: null, ore: {} }; hist.set(civ.id, h); }
      if (h.eras[h.eras.length - 1].name !== civ.era.name) h.eras.push({ year, name: civ.era.name });
      if (civ.isAlive) {
        h.peak = Math.max(h.peak, civ.citizens);
        if (year >= 60) h.minAfter = Math.min(h.minAfter, civ.citizens);
        for (const ore of ORE_TYPES) if ((civ.output[ore] || 0) > 0 && h.ore[ore] === undefined) h.ore[ore] = year;
      } else if (h.fell === null) h.fell = year;
    }
    for (const b of terrain.buildings.values()) {
      if (b.type === 'ruins' || !b.civId) continue;
      if (b.progress < 1) {
        everSite.add(b.id);
        let s = stages.get(b.id);
        if (!s) stages.set(b.id, s = new Set());
        s.add(Math.min(3, Math.floor(b.progress * 4)));
      } else if (everSite.has(b.id)) done.add(b.id);
    }
  };

  function report(year) {
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
    if (!quiet) {
      console.log(`--- ${seed} year ${year} (${((Date.now() - t0) / 1000).toFixed(1)}s wall) entities=${ecosystem.entities.length} animals=${animals} buildings=${terrain.buildings.size}`);
      console.log('  sapient deaths so far: ' + JSON.stringify(deaths));
      for (const l of lines) console.log(l);
    }
  }

  report(0);
  track(0);
  let year = 0;
  while (year < years) {
    const slice = Math.min(every, years - year);
    // run in 1/4-year slices so construction stages are sampled finely
    for (let k = 0; k < slice * 4; k++) {
      runSimulationSteps(sim, STEPS_PER_YEAR / 4);
      setActiveRng(rng);
      track(year + (k + 1) / 4);
    }
    year += slice;
    report(year);
  }

  // ---------- summary ----------
  const alive = society.civilizations.filter(c => c.isAlive);
  const original = [...hist.values()].filter(h => !h.name.startsWith('Neo-'));
  console.log(`\n=== SUMMARY ${seed}: ${years} simulated years in ${((Date.now() - t0) / 1000).toFixed(0)} s (${flat ? 'flat test world' : 'generated planet'}) ===`);
  for (const h of hist.values()) {
    console.log(`  ${h.name}: peak ${h.peak} citizens, lowest after year 60: ${h.minAfter === Infinity ? 'n/a' : h.minAfter}${h.fell !== null ? `, FELL in year ${Math.round(h.fell)}` : ''}`);
    console.log(`     eras: ${h.eras.map(e => `${e.name}@${Math.round(e.year)}`).join(' -> ')}`);
    console.log(`     ore first mined: ${Object.entries(h.ore).map(([k, y]) => `${k}@${Math.round(y)}`).join(', ') || 'none'}`);
  }
  const multi = [...stages.values()].filter(s => s.size >= 3).length;
  const finished = [...done].length;
  console.log(`  construction: ${everSite.size} sites started, ${finished} finished, ${multi} seen in 3-4 different construction stages (towns rise stage by stage)`);
  let adults = 0;
  let employed = 0;
  for (const e of ecosystem.entities) if (e.alive && e.isSapient && e.civilization && e.isAdult) { adults++; if (e.job) employed++; }
  console.log(`  employment at the end: ${employed}/${adults} adults have a job (${adults ? Math.round((100 * employed) / adults) : 0}%)`);
  const species = ecosystem.speciesCatalog.filter(s => s.population > 0).length;
  console.log(`  alive: ${alive.length}/${society.civilizations.length} civilizations, ${ecosystem.entities.filter(e => e.alive && e.isSapient).length} sapients, ${ecosystem.entities.filter(e => e.alive && !e.isSapient).length} animals in ${species} species, births ${ecosystem.births}`);
  console.log(`  sapient deaths: ${JSON.stringify(deaths)}`);
  const eraReached = alive.map(c => c.era.name);
  console.log(`  eras at the end: ${eraReached.join(', ') || 'none alive'}`);
  const mined = {};
  for (const civ of society.civilizations) for (const ore of ORE_TYPES) if (civ.output[ore]) mined[ore] = (mined[ore] || 0) + Math.round(civ.output[ore]);
  console.log(`  ore dug out of the ground (all civs): ${JSON.stringify(mined)}`);
  console.log(`  explored cells: ${society.civilizations.map(c => c.explored.length).join(', ')}; discoveries: ${society.civilizations.map(c => c.discovered.length).join(', ')}`);
  console.log(`  ERAS order: ${ERAS.map(e => e.name).join(' < ')}`);
}

for (const seed of seeds) soak(seed);
