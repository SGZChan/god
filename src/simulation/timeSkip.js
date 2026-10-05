// Skipping years: the world really lives through them, only the day-to-day walking is left out.
// A skip is cut into short slices (1-5 years). In every slice:
//   * everyone ages; the old die (champions too); couples have children, wildlife breeds toward the land's limit and
//     hunters thin their prey; animals drift to new ground
//   * the civilizations run their real economy and politics (society.update with the slice's whole time: research,
//     planning, eras, faith, expansion, wars, trade, deathcare), while the labour that the people's AI would have done
//     is done in bulk: gathering from the actual deposits (which run down), building the planned sites from the
//     stockpile, exploring outward and discovering ores, producing the goods an age needs
//   * a few real seconds of ordinary simulation at the end let everybody find their feet again
// Used by Skip (main.js skipYears) and by planets that were not watched while time passed (catchUpEngine).
import { random, setActiveRng } from './random.js';
import { runSimulationSteps } from './fixedStep.js';
import { MAX_ENTITIES } from '../life/ecosystem.js';
import { recombine, traitDistance } from '../life/genome.js';
import { MATE_THRESHOLD } from '../life/species.js';
import { settlementsOf, openSites } from '../civilization/settlements.js';
import { revealAround, scanForDeposits, syncDiscoveries } from '../civilization/exploration.js';
import { missingForEra, ERAS, ERA_REQUIREMENTS } from '../civilization/techTree.js';
import { missingMaterials, BUILDING_TYPES } from '../world/buildings.js';
import { planSettlement } from '../civilization/townPlanner.js';
import { RESOURCES } from '../world/resources.js';
import * as eco from '../civilization/economy.js';

const MAX_ANIMALS_SKIP = 520;
const RAW = ['wood', 'stone', 'fibre', 'clay', 'coal', 'iron', 'copper', 'tin'];

const depCache = new WeakMap(); // settlement -> { resource: deposit in use }
const stochastic = x => Math.floor(x) + (random() < x - Math.floor(x) ? 1 : 0);
const pick = list => list[Math.floor(random() * list.length)];

export function sliceYears(years) { return Math.max(1, Math.min(8, Math.round(years / 60))); }

// ---------- one slice ----------

function ageAndDie(ecosystem, T, report) {
  const list = ecosystem.entities;
  for (let i = list.length - 1; i >= 0; i--) {
    const e = list[i];
    if (!e.alive) { list.splice(i, 1); continue; } // old bodies are long gone
    e.age += T;
    if (e.age > e.maxAge) {
      if (e.isSpecialIndividual && e.civilization) report.champions.push(e.name);
      // a person of great age dies within a few years, so not everyone drops on the same day
      if (e.age > e.maxAge * 1.04 || random() < 0.5) {
        e.die('Old Age');
        if (e.alive) continue; // (a divine shield)
        report.deaths++;
        list.splice(i, 1);
      }
    }
    e.path = [];
  }
}

function adultsOf(list, filter) {
  const mothers = [], fathers = [];
  for (const e of list) {
    if (!e.alive || !e.isAdult || e.stage === 'elder' || !filter(e)) continue;
    (e.sex === 'F' ? mothers : fathers).push(e);
  }
  return { mothers, fathers };
}

function breed(ecosystem, mothers, fathers, count, report) {
  let born = 0;
  for (let i = 0; i < count && mothers.length && fathers.length; i++) {
    if (ecosystem.entities.length >= MAX_ENTITIES) break;
    for (let attempt = 0; attempt < 10; attempt++) {
      const m = pick(mothers);
      const f = pick(fathers);
      if (m.isKinOf(f) || traitDistance(m.traits, f.traits) > MATE_THRESHOLD) continue;
      const baby = ecosystem.bear(m, f, recombine(m.genome, f.genome));
      baby.age = random() * 1.2; // (later slices age it on)
      born++;
      break;
    }
  }
  report.births += born;
  return born;
}

function peopleGrow(ecosystem, civ, T, report) {
  const { mothers, fathers } = adultsOf(ecosystem.entities, e => e.civilization === civ);
  const room = ecosystem.populationCap(civ) - civ.citizens;
  if (room <= 0) return;
  const want = stochastic(Math.min(room, mothers.length * 0.1 * T * (0.6 + random() * 0.8)));
  breed(ecosystem, mothers, fathers, want, report);
}

function wildlife(ecosystem, T, report) {
  const bySpecies = new Map();
  for (const e of ecosystem.entities) {
    if (!e.alive || e.isSapient || e.isSpecialIndividual) continue;
    if (!bySpecies.has(e.species)) bySpecies.set(e.species, []);
    bySpecies.get(e.species).push(e);
  }
  let prey = 0, hunters = 0;
  for (const [sp, list] of bySpecies) { if (sp.type === 'predator') hunters += list.length; else prey += list.length; }
  // predators take their prey: about one animal in seven per hunter per year
  let eat = stochastic(hunters * 0.1 * T * Math.min(1, prey / Math.max(1, hunters * 4)));
  const flat = [];
  for (const [sp, list] of bySpecies) if (sp.type !== 'predator' && list.length > 6) flat.push(...list);
  while (eat-- > 0 && flat.length) {
    const v = flat.splice(Math.floor(random() * flat.length), 1)[0];
    v.die('Eaten');
    ecosystem.entities.splice(ecosystem.entities.indexOf(v), 1);
    bySpecies.get(v.species).splice(bySpecies.get(v.species).indexOf(v), 1);
  }
  // hunters beyond what the prey can feed go hungry
  const feed = Math.max(5, Math.round(prey * 0.18));
  for (const [sp, list] of bySpecies) {
    if (sp.type !== 'predator') continue;
    const share = Math.max(2, Math.round(feed * list.length / Math.max(1, hunters)));
    let over = Math.floor((list.length - share) * Math.min(1, 0.35 * T));
    while (over-- > 0 && list.length > 2) {
      const v = list.splice(Math.floor(random() * list.length), 1)[0];
      v.die('Starved');
      ecosystem.entities.splice(ecosystem.entities.indexOf(v), 1);
    }
  }
  const animals = ecosystem.entities.filter(e => !e.isSapient).length;
  for (const [sp, list] of bySpecies) {
    const alive = list.filter(e => e.alive);
    if (alive.length < 2) continue;
    const K = sp.type === 'predator' ? Math.max(5, Math.round(prey * 0.18 * alive.length / Math.max(1, hunters))) : Math.max(14, Math.min(70, sp.peakPopulation));
    const fert = alive.reduce((s, e) => s + e.traits.fertility, 0) / alive.length;
    const r = (0.3 + 0.7 * fert) * T * Math.max(0, 1 - alive.length / K);
    const { mothers, fathers } = adultsOf(alive, () => true);
    if (animals >= MAX_ANIMALS_SKIP) continue;
    breed(ecosystem, mothers, fathers, stochastic(mothers.length * r), report);
  }
  // some of them wander off to new ground
  for (const [, list] of bySpecies) {
    for (const e of list) {
      if (!e.alive || random() > 0.25 * Math.min(1, T / 3)) continue;
      const a = random() * Math.PI * 2;
      const d = 8 + random() * 30 * T;
      const spot = e.aquatic ? ecosystem.waterNear(e.x + Math.cos(a) * d, e.y + Math.sin(a) * d, 6) : ecosystem.landNear(e.x + Math.cos(a) * d, e.y + Math.sin(a) * d, 6);
      if (spot) { e.x = spot.x + 0.5; e.y = spot.y + 0.5; }
    }
  }
}

// What the people's labour would have achieved in T years
function labour(sim, civ, T, report) {
  const { terrain, ecosystem, society } = sim;
  const c = { world: { terrain, ecosystem, pathfinder: ecosystem.pathfinder, grid: ecosystem.grid }, terrain, ecosystem, soc: society, civ, tier: 0 };
  for (const st of settlementsOf(civ)) {
    const members = society.membersOf(st).filter(e => e.alive && e.isAdult);
    if (!members.length) continue;
    const workers = Math.max(1, Math.round(members.length * 0.55));
    // gathering: from the real deposits near town (they run down), a good deal of the labour going to food
    st.stock = st.stock || {};
    for (const res of RAW) {
      // (the deposit the workers use is kept until it runs dry)
      let cache = depCache.get(st);
      if (!cache) depCache.set(st, cache = {});
      let d = cache[res];
      let dep = d ? terrain.peekDeposit(d.x, d.y) : null;
      if (!dep || dep.type !== res || dep.amount < 1) {
        d = terrain.findNearestDeposit(st.x, st.y, res, 70, { minAmount: 1 });
        cache[res] = d;
        dep = d ? terrain.peekDeposit(d.x, d.y) : null;
        if (!d || !dep) continue;
      }
      const got = terrain.extract(d.x, d.y, Math.min(workers * 1.6 * T, dep.amount));
      if (got > 0) { eco.add(st.stock, res, got); revealAround(civ, terrain, d.x, d.y, 5); }
    }
    // food: the harvest less what the town eats (kept within what it can store)
    const farmed = Math.min(1, 0.4 + 0.15 * terrain.buildingsInRect(st.x - 20, st.y - 20, st.x + 20, st.y + 20).filter(b => b.type === 'farm' && b.progress >= 1).length);
    eco.add(st.stock, 'grain', workers * 3 * T * farmed);
    st.stock.grain = Math.max(0, Math.min((st.stock.grain || 0) - members.length * T * 1.2, 80 + members.length * 4));
    // (a settlement plans a building every few seconds; over T years that is many)
    for (let k = 0; k < Math.min(6, Math.ceil(T * 0.6)); k++) planSettlement(civ, terrain, st);
    // building: the planned sites go up when the stockpile can pay for them
    for (const site of openSites(terrain, st).slice(0, 12)) {
      const def = BUILDING_TYPES[site.type];
      const missing = missingMaterials(site);
      // (raw materials come from the stockpile; worked goods are what the crafters made in the meantime)
      if (!Object.entries(missing).every(([res, n]) => !RESOURCES[res] || (st.stock[res] || 0) >= n * 0.999)) continue;
      for (const [res, n] of Object.entries(missing)) { if (RESOURCES[res]) eco.take(st.stock, res, n); terrain.deliverMaterial(site.id, res, n); }
      c.st = st; c.tier = ERAS.findIndex(e => e.id === civ.era.id);
      if (terrain.advanceConstruction(site.id, def.work * 2 + 5)) { society.onBuildingComplete(c, site); report.built++; }
    }
  }
  // exploring: the scouts walk outward and ore is noticed on the way
  const known = settlementsOf(civ);
  if (known.length) {
    const trips = Math.min(40, Math.ceil(T * civ.citizens / 10));
    for (let i = 0; i < trips; i++) {
      const st = pick(known);
      const a = random() * Math.PI * 2;
      const reach = 8 + random() * (24 + Math.sqrt(civ.citizens) * 5);
      const x = Math.round(st.x + Math.cos(a) * reach);
      const y = Math.round(st.y + Math.sin(a) * reach);
      if (!terrain.inBounds(x, y)) continue;
      revealAround(civ, terrain, x, y, 8);
      scanForDeposits(civ, terrain, x, y, 11);
    }
    syncDiscoveries(civ, () => {});
  }
  // goods the next age asks for, once what it needs to make them is there
  const idx = ERAS.findIndex(e => e.id === civ.era.id);
  const next = ERAS[Math.min(ERAS.length - 1, idx + 1)];
  if (next && next.id !== civ.era.id) {
    const lacking = missingForEra(civ, next.id, society.eraHave(civ)).filter(s => !s.startsWith('produce'));
    if (!lacking.length) {
      civ.output = civ.output || {};
      const need = (ERA_REQUIREMENTS[next.id] && ERA_REQUIREMENTS[next.id].output) || {};
      for (const [item, n] of Object.entries(need)) civ.output[item] = Math.min(n, (civ.output[item] || 0) + Math.max(0.5, civ.citizens * 0.05) * T);
    }
  }
}

// ---------- the whole skip ----------

// -> report { years, births, deaths, built, civEvents[], ecoEvents[], champions[] }
function* skipSlices(sim, years, onSlice) {
  const { ecosystem, society, terrain } = sim;
  const report = { years, births: 0, deaths: 0, built: 0, civEvents: [], ecoEvents: [], champions: [] };
  const peopleBefore = ecosystem.entities.filter(e => e.alive && e.isSapient).length;
  const eras = new Map(society.civilizations.filter(c => c.isAlive).map(c => [c.id, c.era.name]));
  const settlementsBefore = new Map(society.civilizations.map(c => [c.id, settlementsOf(c).length]));
  const speciesBefore = ecosystem.registry.species.length;
  const T0 = sliceYears(years);
  // (the search for ruins to settle runs once, at the end: it scans the whole map)
  const ruinsCheck = society.checkRuinsRebirth;
  society.checkRuinsRebirth = () => {};
  let left = years;
  while (left > 0) {
    const T = Math.min(T0, left);
    left -= T;
    ecosystem.timeYears += T;
    terrain.timeAge += T * 0.001;
    ageAndDie(ecosystem, T, report);
    society.refreshCensus();
    for (const civ of society.civilizations) {
      if (!civ.isAlive) continue;
      peopleGrow(ecosystem, civ, T, report);
    }
    wildlife(ecosystem, T, report);
    society.refreshCensus();
    for (const civ of society.civilizations) if (civ.isAlive) labour(sim, civ, T, report);
    // the real economy and politics, once for the whole slice
    society.update(T * 4, 1);
    if (terrain.update) terrain.update(T * 4, 1);
    ecosystem.registry.refresh(ecosystem.entities, ecosystem.timeYears);
    if (onSlice) onSlice(years - left, years);
    yield years - left;
  }
  society.checkRuinsRebirth = ruinsCheck;
  if (society.civilizations.every(c => !c.isAlive)) society.checkRuinsRebirth();
  // a few real seconds so everyone finds their footing (jobs, homes, paths)
  runSimulationSteps(sim, 60);
  society.refreshCensus();
  ecosystem.takeCensus();
  for (const civ of society.civilizations) {
    const before = eras.get(civ.id);
    if (!before) { if (civ.isAlive) report.civEvents.push(`${civ.name} arose`); continue; }
    if (!civ.isAlive) { report.civEvents.push(`${civ.name} fell`); continue; }
    if (civ.era.name !== before) report.civEvents.push(`${civ.name} entered the ${civ.era.name}`);
    const grown = settlementsOf(civ).length - (settlementsBefore.get(civ.id) || 0);
    if (grown > 0) report.civEvents.push(`${civ.name} founded ${grown} settlement${grown > 1 ? 's' : ''}`);
  }
  if (ecosystem.registry.species.length > speciesBefore) report.ecoEvents.push(`${ecosystem.registry.species.length - speciesBefore} new species evolved`);
  report.peopleBefore = peopleBefore;
  report.peopleNow = ecosystem.entities.filter(e => e.alive && e.isSapient).length;
  return report;
}

// All at once (planets that were not watched)
export function skipTimeSync(sim, years, onSlice = null) {
  const gen = skipSlices(sim, years, onSlice);
  for (;;) { const r = gen.next(); if (r.done) return r.value; }
}

// In pieces of about yieldMs milliseconds, handing the thread back to the page in between (Skip button)
export async function skipTime(sim, years, { onSlice = null, yieldMs = 40 } = {}) {
  const gen = skipSlices(sim, years, onSlice);
  let t = performance.now();
  for (;;) {
    const r = gen.next();
    if (r.done) return r.value;
    if (performance.now() - t > yieldMs) { await new Promise(res => setTimeout(res, 0)); t = performance.now(); setActiveRng(sim.rng); }
  }
}
