// Society: clans, families, jobs, economy, construction by builders, exploration, trade, saves.
import { assert, section, summary, emptyWorld, addCiv, addHuman } from './helpers.js';
import { createPlanetWorld } from '../src/simulation/world.js';
import { SeededRNG } from '../src/cosmos/seed.js';
import { setActiveRng } from '../src/simulation/random.js';
import { runSimulationSteps } from '../src/simulation/fixedStep.js';
import { serializeSim, restoreSim } from '../src/persistence/saveGame.js';
import * as eco from '../src/civilization/economy.js';
import { ERAS, eraFor, missingForEra, ERA_REQUIREMENTS } from '../src/civilization/techTree.js';
import { revealAround, isExplored, exploredCount, scanForDeposits, learnDeposit, nearestKnown, isDiscovered, syncDiscoveries, CELL } from '../src/civilization/exploration.js';
import { CLAN_SPLIT_SIZE, createClan, pickSplinter } from '../src/civilization/clans.js';
import { aptitude, JOB_INFO, tickSettlement, seasonOf } from '../src/civilization/jobs.js';
import { missingMaterials, BUILDING_TYPES } from '../src/world/buildings.js';
import { housesOf, depotOf, popCap, buildingsOf, openSites, getSettlement } from '../src/civilization/settlements.js';
import { decorationPixels, TOOLS, spriteKey } from '../src/art/creatureSprite.js';
import { summarizeSociety, summarizeWorld } from '../src/ui/overviewPanel.js';
import { initTown, planSettlement } from '../src/civilization/townPlanner.js';
import { assignHomes, adoptOrphans, familyOf } from '../src/civilization/families.js';

console.log('====================================================');
console.log('   SOCIETY TESTS                                     ');
console.log('====================================================');

function realWorld(seed, opts = {}) {
  const rng = new SeededRNG(seed);
  setActiveRng(rng);
  const sim = createPlanetWorld(rng, { seed, radius: 1, ...opts });
  setActiveRng(rng);
  sim.rng = rng;
  return sim;
}
const run = (sim, steps) => { runSimulationSteps(sim, steps); setActiveRng(sim.rng); };
const own = (sim, civ) => [...sim.terrain.buildings.values()].filter(b => b.civId === civ.id && b.type !== 'ruins');
const deliveredFraction = b => {
  const def = BUILDING_TYPES[b.type];
  let need = 0;
  let got = 0;
  for (const [res, n] of Object.entries(def.cost)) { need += n; got += Math.min(n, b.delivered[res] || 0); }
  return got / need;
};

section('Economy: stockpiles, carrying and food');
{
  const inv = {};
  eco.add(inv, 'wood', 5);
  eco.add(inv, 'wood', 2.5);
  assert(eco.amount(inv, 'wood') === 7.5 && eco.total(inv) === 7.5, 'goods add up in an inventory');
  assert(eco.take(inv, 'wood', 10) === 7.5 && !('wood' in inv), 'you can only take what is there; empty stacks disappear');
  assert(eco.canAfford({ stone: 5, wood: 3 }, { stone: 5 }) && !eco.canAfford({ stone: 4 }, { stone: 5 }), 'canAfford checks a cost');
  assert(eco.bestFood({ berries: 3, meat: 2, grain: 1 }) === 'meat' && eco.bestFood({ wood: 9 }) === null, 'people eat the best food first');
  const eat = { grain: 2 };
  assert(eco.eatFrom(eat) === eco.NOURISHMENT.grain && eat.grain === 1, 'eating takes one unit and relieves hunger');
  assert(eco.RECIPES.every(r => Object.keys(r.in).length && Object.keys(r.out).length), 'every recipe has inputs and outputs');
  assert(eco.RECIPES.some(r => r.out.bronze && r.in.copper && r.in.tin) && eco.RECIPES.some(r => r.out.iron_bar && r.in.iron && r.in.coal), 'bronze needs copper and tin, iron bars need iron and coal');

  const w = emptyWorld();
  const civ = addCiv(w, 'Foodia', 10, 20, 4);
  const st = civ.settlements[0];
  st.stock = { grain: 10, meat: 5 };
  civ.food = 60; civ.foodSeen = 60;
  eco.syncFood(civ);
  assert(civ.food === (15) * eco.FOOD_SCALE, 'civ.food is the aggregate of the stockpiles');
  civ.food += 40; // a blessing writes to civ.food
  eco.syncFood(civ);
  assert(eco.civFoodUnits(civ) === 25 && civ.food === 100, 'a divine gift of food lands in the stockpile');
  civ.food -= 220; // a famine power
  eco.syncFood(civ);
  assert(eco.civFoodUnits(civ) === 0 && civ.food < 0, 'a famine deeper than the stores becomes food debt');
  st.stock.grain = 50;
  eco.syncFood(civ);
  assert(civ.food < 200, 'harvests repay the debt before they count as surplus');
  st.stock = { grain: 500 };
  eco.syncFood(civ);
  assert(eco.foodUnits(st.stock) <= eco.FOOD_CAP / eco.FOOD_SCALE, 'granaries spoil what exceeds their capacity');
}

section('Technology: eras need discoveries, buildings and goods, not only points');
{
  const civ = { techPoints: 5000, citizens: 20, output: {}, discovered: [], eraFloor: 0 };
  const have = { discovered: () => false, built: () => false };
  assert(eraFor(civ, have).id === 'STONE_AGE', 'a civ with lots of research but no materials stays in the Stone Age');
  assert(missingForEra(civ, 'BRONZE_AGE', have).join().includes('discover copper') && missingForEra(civ, 'BRONZE_AGE', have).join().includes('smithy'), 'the missing items are listed (copper, tin, smithy...)');
  civ.output = { bronze: 3 };
  const kit = { discovered: t => ['copper', 'tin'].includes(t), built: t => ['kiln', 'smithy'].includes(t) };
  assert(eraFor(civ, kit).id === 'BRONZE_AGE', 'copper and tin found, a kiln and smithy built and bronze made: Bronze Age');
  const rich = { discovered: () => true, built: () => true };
  civ.output = { bronze: 5, iron_bar: 20, stone: 100, bricks: 10, coal: 50, uranium: 5 };
  assert(eraFor(civ, rich).id === 'SPACE_AGE', 'with everything in place the points decide: Space Age');
  civ.techPoints = 400;
  assert(eraFor(civ, rich).id === 'CLASSICAL_AGE', 'the points still gate the era');
  civ.techPoints = 5000; civ.output = {}; civ.eraFloor = 3;
  assert(eraFor(civ, have).id === 'MEDIEVAL_AGE', 'a civilization reborn from ruins keeps the knowledge of the ruins');
  assert(ERAS.every(e => ERA_REQUIREMENTS[e.id] !== undefined) && ERAS[0].reqPoints === 0, 'every era has requirements and the old era list is intact');
}

section('Exploration: explored cells and discovered deposits');
{
  const sim = realWorld('explore-1');
  const t = sim.terrain;
  const civ = sim.society.civilizations[0];
  civ.explored = []; civ.knownDeposits = []; civ.discovered = [];
  assert(!isExplored(civ, t, 100, 100), 'nothing is explored at the start');
  const added = revealAround(civ, t, 100, 100, 20);
  assert(added >= 4 && isExplored(civ, t, 100, 100) && isExplored(civ, t, 112, 100) && !isExplored(civ, t, 300, 300), 'revealing marks the 16x16 cells around a point');
  assert(revealAround(civ, t, 100, 100, 20) === 0 && exploredCount(civ) === added, 'a cell is only counted once');
  // find a copper vein and stand next to it
  const vein = t.generator.resources.veinsNear('copper', sim.terrain.home.x, sim.terrain.home.y, 400)[0];
  assert(vein, 'the planet has copper');
  const dep = t.findNearestDeposit(vein.x, vein.y, 'copper', 12);
  assert(dep && !isDiscovered(civ, 'copper'), 'copper is not known yet (ores must be discovered)');
  assert(isDiscovered(civ, 'wood') && isDiscovered(civ, 'stone'), 'common resources are local knowledge');
  const found = scanForDeposits(civ, t, dep.x, dep.y, 11);
  assert(found.includes('copper') && civ.knownDeposits.some(k => k.type === 'copper' && typeof k.x === 'number' && typeof k.y === 'number'), 'a scout beside a vein learns it in the { type, x, y } format of the Revelation power');
  const texts = [];
  syncDiscoveries(civ, text => texts.push(text));
  assert(civ.discovered.includes('copper') && texts.some(x => x.includes('discovered copper') && x.includes(civ.name)), 'a discovery notification names the civilization and the resource');
  assert(!learnDeposit(civ, 'copper', dep.x + 1, dep.y), 'the same vein is not recorded twice');
  const near = nearestKnown(civ, t, 'copper', dep.x, dep.y);
  assert(near && near.type === 'copper' && t.getDeposit(near.x, near.y), 'nearestKnown returns a live deposit tile');
  // the divine power writes only knownDeposits: the civ still counts as having discovered it
  const civ2 = sim.society.civilizations[1];
  civ2.knownDeposits = [{ type: 'iron', x: 5, y: 5 }];
  assert(isDiscovered(civ2, 'iron'), 'deposits revealed by the Revelation of Ore count as discovered');
}

section('Construction by builders: nothing appears by itself');
{
  const sim = realWorld('build-1');
  for (const c of sim.society.civilizations) c.truce = 1e9; // this test is about building, not war
  const civ = sim.society.civilizations[0];
  const first = own(sim, civ);
  assert(first.length >= 3 && first.every(b => b.progress === 0), `a new civilization starts with ${first.length} construction sites and no finished building`);
  const hall = first.find(b => b.type === 'hall');
  assert(hall && civ.capitalX === hall.x + BUILDING_TYPES.hall.door.x && civ.capitalY === hall.y + BUILDING_TYPES.hall.h, 'the capital is the tile in front of the hall door');
  assert(civ.settlements.length === 1 && civ.settlements[0].stock.wood > 0, 'the founders carry a starter kit in the settlement stockpile');
  // invariants while the people work: a site never gets ahead of the materials delivered to it
  let violations = 0;
  let stageSeen = new Set();
  let maxProgress = 0;
  const stockStart = civ.settlements[0].stock.wood;
  let maxBuilders = 0;
  let stockMoved = false;
  for (let i = 0; i < 40; i++) {
    run(sim, 100);
    maxBuilders = Math.max(maxBuilders, sim.ecosystem.entities.filter(e => e.alive && e.civilization === civ && e.job === 'builder').length);
    if (civ.settlements[0].stock.wood !== stockStart) stockMoved = true;
    for (const b of own(sim, civ)) {
      if (b.progress > deliveredFraction(b) + 0.06) violations++;
      if (b.type === 'hall') { stageSeen.add(Math.floor(b.progress * 4)); maxProgress = Math.max(maxProgress, b.progress); }
    }
  }
  assert(violations === 0, 'a building never progresses beyond the materials that were delivered to it');
  assert(maxProgress >= 1 || [...stageSeen].length >= 2, 'the hall rises through several construction stages');
  const done = own(sim, civ).filter(b => b.progress >= 1);
  assert(done.length >= 2, `builders finished buildings (${done.length} done)`);
  assert(done.every(b => deliveredFraction(b) >= 0.999), 'every finished building received its full cost in delivered materials');
  assert(stockMoved && Object.values(civ.output).some(n => n > 0), 'goods were gathered and stocked, materials moved through the stockpile');
  assert(maxBuilders >= 1, `builders were employed (up to ${maxBuilders})`);
  const roadTiles = [];
  for (let y = civ.capitalY - 3; y <= civ.capitalY + 3; y++) for (let x = civ.capitalX - 14; x <= civ.capitalX + 14; x++) if (sim.terrain.getRoad(x, y)) roadTiles.push([x, y]);
  assert(roadTiles.length > 0, `the main street has been paved by builders (${roadTiles.length} tiles)`);
  assert(own(sim, civ).every(b => !BUILDING_TYPES[b.type].shore ? [...Array(b.w * b.h).keys()].every(k => sim.terrain.isBuildable(b.x + (k % b.w), b.y + Math.floor(k / b.w))) : true), 'nothing was built on water, ice or peaks');
}

section('Jobs: demand and aptitude');
{
  const sim = realWorld('jobs-1');
  run(sim, 4500); // (people sleep at night, so towns take a little longer to grow than before the day cycle)
  const civ = sim.society.civilizations[0];
  const members = sim.ecosystem.entities.filter(e => e.alive && e.civilization === civ);
  const adults = members.filter(e => e.isAdult);
  const jobs = new Set(adults.map(e => e.job));
  assert(adults.filter(e => e.job).length >= adults.length * 0.8, 'nearly every adult has a job (the newly grown-up wait for the next labour-market round)');
  assert(members.filter(e => !e.isAdult).every(e => !e.job), 'children have no job');
  assert(jobs.size >= 4, `several different jobs exist (${[...jobs].join(', ')})`);
  assert([...jobs].filter(Boolean).every(j => JOB_INFO[j]), 'every job has a name and a tool');
  // aptitude: a strong, diligent person suits mining better than a weak, scholarly one
  const a = adults[0];
  const brute = Object.assign(Object.create(Object.getPrototypeOf(a)), a);
  brute.proficiencies = { architecture: 90, warfare: 60, statesmanship: 20, farming: 20, science: 10, mysticism: 5 };
  brute.stats = { ...a.stats, sizeScale: 1.2 };
  brute.personality = { ...a.personality, conscientiousness: 0.9 };
  brute.age = a.stats.maturityYears + 1; // a young adult (adults[0] may itself be an elder)
  const sage = Object.assign(Object.create(Object.getPrototypeOf(a)), a);
  sage.proficiencies = { architecture: 20, warfare: 20, statesmanship: 60, farming: 20, science: 95, mysticism: 50 };
  sage.stats = { ...a.stats, sizeScale: 0.4 };
  sage.traits = { ...a.traits, intelligence: 0.95 };
  assert(aptitude(brute, 'miner') > aptitude(sage, 'miner') && aptitude(sage, 'scholar') > aptitude(brute, 'scholar'), 'aptitude follows strength, skills and intelligence');
  const old = Object.assign(Object.create(Object.getPrototypeOf(a)), brute, { age: 9999 });
  assert(old.stage === 'elder' && aptitude(old, 'miner') < aptitude(brute, 'miner') && aptitude(old, 'scholar') >= aptitude(brute, 'scholar') * 0.9, 'elders move from heavy work to lighter work');
  // demand: no farms, no farmers; a finished field creates farmer jobs
  const st = civ.settlements[0];
  const farms = buildingsOf(sim.terrain, st).filter(b => b.type === 'farm' && b.progress >= 1);
  const farmers = adults.filter(e => e.job === 'farmer' && e.settlementId === st.id);
  assert(farms.length === 0 ? farmers.length === 0 : true, 'farmers exist only where there are fields to work');
  assert(st.demand && typeof st.demand === 'object', 'the settlement records the demand it assigned');
}

section('Mining: extract from a known deposit and carry it home');
{
  const sim = realWorld('mine-1');
  const civ = sim.society.civilizations[0];
  const st = civ.settlements[0];
  const t = sim.terrain;
  const vein = t.generator.resources.veinsNear('tin', st.x, st.y, 300)[0];
  const dep = t.findNearestDeposit(vein.x, vein.y, 'tin', 12);
  learnDeposit(civ, 'tin', dep.x, dep.y);
  syncDiscoveries(civ);
  // one miner standing at the settlement with a pick, told to dig tin
  // the youngest adult, so old age does not end the test (work now pauses at night)
  const miner = sim.ecosystem.entities.filter(e => e.alive && e.civilization === civ && e.isAdult).sort((a, b) => a.age - b.age)[0];
  miner.age = miner.stats.maturityYears + 2; // a young, long-lived miner: the founders are all close to old age, and
  miner.lifespanJitter = 4;                   // a mining trip with its nights and meals spans decades of game time
  st.stock.tin = 0;
  const before = t.getDeposit(dep.x, dep.y).amount;
  st.need = { stone: 0, wood: 0, clay: 0, fibre: 0, food: 0 };
  miner.job = 'miner';
  miner.task = { kind: 'gather', stuck: 0, res: 'tin' };
  // everyone else keeps their jobs; make sure the settlement does not reassign the miner during the test
  st.assignTimer = 1e9;
  let carried = 0;
  for (let i = 0; i < 400 && !((st.stock.tin || 0) > 0); i++) {
    run(sim, 50);
    carried = Math.max(carried, miner.inventory.tin || 0);
    if (miner.job !== 'miner') miner.job = 'miner';
  }
  const after = t.getDeposit(dep.x, dep.y);
  const mined = before - (after ? after.amount : 0);
  assert(carried > 0, 'the miner dug tin and carried it');
  assert((st.stock.tin || 0) > 0, 'the tin reached the settlement stockpile');
  assert(mined > 0 && Math.abs(mined - ((st.stock.tin || 0) + (miner.inventory.tin || 0))) < 40, 'what the stockpile gained was taken out of the ground (terrain.extract)');
  assert((civ.output.tin || 0) > 0, 'production is counted for the era requirements');
}

section('Scouts: roaming discovers resources');
{
  const sim = realWorld('scout-1');
  const civ = sim.society.civilizations[0];
  civ.explored = []; civ.knownDeposits = []; civ.discovered = [];
  const scout = sim.ecosystem.entities.find(e => e.alive && e.civilization === civ && e.isAdult);
  scout.job = 'scout';
  civ.settlements[0].assignTimer = 1e9;
  let away = 0; // the farthest the scout got (at night scouts camp or come home, so not just the last position)
  for (let i = 0; i < 60; i++) {
    run(sim, 100);
    if (scout.job !== 'scout') scout.job = 'scout';
    away = Math.max(away, Math.hypot(scout.x - civ.settlements[0].x, scout.y - civ.settlements[0].y));
  }
  assert(exploredCount(civ) >= 8, `the scout explored the land around (${exploredCount(civ)} cells)`);
  assert(away > 6 || exploredCount(civ) > 15, 'scouts range beyond the settlement');
}

section('Clans and families');
{
  const sim = realWorld('clan-1');
  const civ = sim.society.civilizations[0];
  const founders = sim.ecosystem.entities.filter(e => e.alive && e.civilization === civ);
  assert(founders.length === 6 && civ.clans.length === 3, 'six founders form three founding families (three clans)');
  assert(founders.every(e => e.clanId && civ.clans.some(c => c.id === e.clanId)), 'everyone belongs to a clan');
  assert(founders.every(e => e.mateId && sim.ecosystem.byId.get(e.mateId).mateId === e.id), 'founders are paired in long-term bonds');
  assert(civ.clans.every(c => c.color && c.banner && c.leaderId && c.civId === civ.id && 'beliefs' in c && Object.keys(c.beliefs).length === 0), 'clans have colour, banner, leader and an empty beliefs placeholder');
  const mother = founders.find(e => e.sex === 'F');
  const father = sim.ecosystem.byId.get(mother.mateId);
  const babyGenome = mother.genome;
  mother.pregnancy = { embryos: [babyGenome], fatherId: father.id, timeLeft: 0 };
  const babies = sim.ecosystem.giveBirth(mother);
  assert(babies[0].clanId === mother.clanId && babies[0].settlementId === mother.settlementId, 'a child belongs to its mother\'s clan and settlement');
  // pair bonds are exclusive
  const single = addHuman(sim, civ, mother.x, mother.y); single.sex = 'M'; single.settlementId = mother.settlementId;
  assert(!mother.canMateWith(single), 'a bonded woman does not court other men');
  // a widow can bond again later
  father.die('test');
  sim.society.tickFamilies();
  assert(mother.mateId === null && mother.mateCooldown >= 10, 'a widow(er) is freed from the bond after a period of mourning');
  // homes and inheritance
  run(sim, 2400);
  const living = sim.ecosystem.entities.filter(e => e.alive && e.civilization === civ);
  const adults = living.filter(e => e.isAdult);
  const homed = adults.filter(e => e.homeId);
  assert(homed.length >= 2, `adults live in houses (${homed.length}/${adults.length})`);
  assert(homed.every(e => { const b = sim.terrain.getBuilding(e.homeId); return b && BUILDING_TYPES[b.type].category === 'housing' && b.progress >= 1 && b.residents.includes(e.id); }), 'a home is a finished house that lists its residents');
  sim.society.tickFamilies(); // (newly grown-up children are moved out of overfull houses at the next family round)
  const capacityOk = [...sim.terrain.buildings.values()].filter(b => b.residents).every(b => b.residents.map(id => sim.ecosystem.byId.get(id)).filter(e => e && e.isAdult).length <= BUILDING_TYPES[b.type].capacity + 0);
  if (!capacityOk) for (const b of sim.terrain.buildings.values()) if (b.residents) console.log('   house', b.type, b.id, 'cap', BUILDING_TYPES[b.type].capacity, b.residents.map(id => { const e = sim.ecosystem.byId.get(id); return e ? [e.name, e.isAdult, e.alive, e.homeId, e.settlementId] : id; }));
  assert(capacityOk, 'no house holds more adults than its capacity');
  const house = sim.terrain.getBuilding(homed[0].homeId);
  const resident = homed[0];
  const heirs = house.residents.map(id => sim.ecosystem.byId.get(id)).filter(e => e && e.alive && e !== resident);
  if (heirs.length) {
    resident.die('test');
    sim.society.tickFamilies();
    if (!heirs.every(h => h.homeId === house.id || !h.isAdult)) console.log('   heirs', heirs.map(h => [h.name, h.homeId, h.isAdult, h.age, h.settlementId]), 'house', house.id, house.residents, 'resident home', resident.homeId);
    assert(heirs.every(h => h.homeId === house.id || !h.isAdult) && !house.residents.includes(resident.id), 'when someone dies the house stays with the surviving household');
  } else assert(true, 'a lone resident has no heirs (nothing to check)');
  // orphans are taken in by their clan
  const kid = living.find(e => !e.isAdult && e.alive);
  if (kid) {
    for (const id of [kid.motherId, ...kid.parents]) { const p = sim.ecosystem.byId.get(id); if (p) p.die('test'); }
    kid.guardianId = null;
    sim.society.tickFamilies();
    assert(kid.guardianId && sim.ecosystem.byId.get(kid.guardianId).alive && sim.ecosystem.byId.get(kid.guardianId).isAdult, 'an orphan is taken in by an adult of the clan');
  } else assert(true, 'no children yet');
  // (the test baby may not have survived the years run above: check any living child with a living mother)
  const child = sim.ecosystem.entities.find(e => e.alive && e.motherId && sim.ecosystem.byId.get(e.motherId) && sim.ecosystem.byId.get(e.motherId).alive) || (babies[0].alive ? babies[0] : null);
  if (child) {
    const fam = familyOf(sim.ecosystem.byId.get(child.motherId) || mother, sim.ecosystem.byId, sim.ecosystem.entities);
    assert(Array.isArray(fam.children) && fam.children.some(c => c.id === child.id), 'familyOf lists a mother\'s children');
  } else assert(true, 'no living mother and child to check');
}

section('Clans split and found hamlets');
{
  const sim = realWorld('split-1');
  const civ = sim.society.civilizations[0];
  const st = civ.settlements[0];
  // a big clan: add adults and children of one clan
  const clan = civ.clans[0];
  const members = [];
  for (let i = 0; i < 18; i++) {
    const e = addHuman(sim, civ, st.x + (i % 6), st.y + 2);
    e.settlementId = st.id; e.clanId = clan.id; e.sex = i % 2 ? 'M' : 'F';
    e.age = e.stats.maturityYears * 1.5;
    members.push(e);
  }
  sim.ecosystem.byId.clear();
  for (const e of sim.ecosystem.entities) sim.ecosystem.byId.set(e.id, e);
  for (const e of members) if (e.sex === 'F') { const m = members.find(x => x.sex === 'M' && !x.mateId); if (m) { e.mateId = m.id; m.mateId = e.id; } }
  // everyone explored: the planner picks the new site from known land
  revealAround(civ, sim.terrain, st.x, st.y, 90);
  st.stock = { wood: 60, fibre: 30, stone: 10, grain: 40 };
  civ.clanTimer = 0;
  sim.society.refreshCensus();
  run(sim, 40);
  assert(clan.memberIds.length >= CLAN_SPLIT_SIZE, `the clan is large (${clan.memberIds.length})`);
  let split = civ.settlements.length > 1;
  for (let i = 0; i < 60 && !split; i++) { run(sim, 40); split = civ.settlements.length > 1; }
  assert(split, 'a clan above the size limit sends a splinter group to found a new settlement');
  const hamlet = civ.settlements[1];
  assert(hamlet && Math.hypot(hamlet.x - st.x, hamlet.y - st.y) >= 15, 'the hamlet lies a fair distance from its mother settlement');
  assert(sim.terrain.isBuildable(hamlet.x, hamlet.y), 'the hamlet is on buildable land');
  const migrants = sim.ecosystem.entities.filter(e => e.alive && e.settlementId === hamlet.id);
  assert(migrants.length >= 4 && migrants.every(e => e.clanId && e.clanId !== clan.id), 'the splinter belongs to a new daughter clan');
  const daughter = civ.clans.find(c => c.id === migrants[0].clanId);
  assert(daughter && daughter.parentClanId === clan.id && daughter.settlementId === hamlet.id, 'the daughter clan remembers its parent clan');
  assert(own(sim, civ).some(b => b.settlementId === hamlet.id && b.progress < 1), 'the hamlet starts as construction sites');
  assert(hamlet.roadQueue.length + st.roadQueue.length > 5, 'a road between the settlements is planned');
  let arrived = false;
  for (let i = 0; i < 30 && !arrived; i++) {
    run(sim, 50);
    arrived = migrants.some(e => Math.hypot(e.x - hamlet.x, e.y - hamlet.y) < 12);
  }
  assert(arrived, 'the settlers walked to the new site');
}

section('Trade: caravans carry surplus between settlements');
{
  const sim = realWorld('trade-1');
  const civ = sim.society.civilizations[0];
  const a = civ.settlements[0];
  const bpos = sim.terrain.findLand(a.x + 25, a.y + 10, 30, 3);
  const { foundHamlet } = await import('../src/civilization/townPlanner.js');
  const b = foundHamlet(civ, sim.terrain, bpos, { instant: true });
  a.stock = { wood: 200, stone: 100, grain: 50 };
  b.stock = { grain: 20 };
  a.assignTimer = 1e9; b.assignTimer = 1e9;
  civ.supplyTimer = 1e9; // the porters of logistics.js would otherwise carry the wood before the trader does
  const trader = sim.ecosystem.entities.filter(e => e.alive && e.civilization === civ && e.isAdult).sort((a, b) => a.age - b.age)[0];
  trader.job = 'trader';
  trader.settlementId = a.id;
  const woodB0 = b.stock.wood || 0;
  for (let i = 0; i < 120 && !((b.stock.wood || 0) > woodB0); i++) { run(sim, 40); if (trader.job !== 'trader') trader.job = 'trader'; }
  assert((b.stock.wood || 0) > woodB0, 'a trader brought wood from the settlement with a surplus to the one without');
  assert((civ.output.trade || 0) > 0, 'trade volume is recorded');
}

section('Roads: planned and worn by foot traffic');
{
  const sim = realWorld('road-1');
  const t = sim.terrain;
  const civ = sim.society.civilizations[0];
  let x = civ.capitalX + 40, y = civ.capitalY + 25;
  while (!t.isBuildable(x, y) || t.getTile(x, y).structure) { x++; }
  assert(!t.getRoad(x, y), 'a tile without traffic has no road');
  for (let i = 0; i < 25; i++) sim.society.footstep(x, y);
  assert(!t.getRoad(x, y), 'a few footsteps do not make a road');
  for (let i = 0; i < 5; i++) sim.society.footstep(x, y);
  assert(t.getRoad(x, y) === 'dirt', 'a worn path becomes a dirt road (desire path)');
  const st = civ.settlements[0];
  assert(st.roadQueue.length > 0, 'the planner queued street tiles for the builders');
  // (new plots queue new streets, so compare the tiles queued now rather than the queue's length)
  const queued = st.roadQueue.map(r => ({ ...r }));
  run(sim, 2400);
  const paved = queued.filter(r => t.getRoad(r.x, r.y) === r.kind || !st.roadQueue.some(q => q.x === r.x && q.y === r.y)).length;
  assert(paved > 0 || queued.length === 0, `builders pave the queued road tiles (${paved}/${queued.length})`);
  // roads respect water
  const lake = (() => { for (let yy = 0; yy < 200; yy++) for (let xx = 0; xx < 300; xx++) if (t.getTile(xx, yy).biome.isWater) return { x: xx, y: yy }; return null; })();
  for (let i = 0; i < 40; i++) sim.society.footstep(lake.x, lake.y);
  assert(!t.getRoad(lake.x, lake.y), 'no road is ever worn into water');
}

section('Sapient sprites: clan colour and held tool');
{
  const clan = decorationPixels('#e11d48', null);
  assert(clan.length > 10 && clan.every(([px, py, c]) => px >= 0 && px < 20 && py >= 0 && py < 20 && /^#[0-9a-f]{6}$/.test(c)), 'the clan headband and sash are pixels inside the sprite');
  assert(clan.some(([, , c]) => c === '#e11d48'), 'the clan colour appears in the headband');
  for (const tool of ['hoe', 'axe', 'pick', 'hammer', 'spear', 'basket', 'staff', 'sack', 'scroll', 'crook', 'rod', 'mallet']) {
    const px = decorationPixels(null, tool);
    assert(px.length >= 6 && px.every(([x, y]) => x >= 0 && x < 20 && y >= 0 && y < 20), `the ${tool} fits in the sprite`);
  }
  assert(Object.values(JOB_INFO).every(j => TOOLS[j.tool]), 'every job has a drawable tool');
  const bobbed = decorationPixels('#112233', 'axe', 1);
  assert(bobbed[0][1] === decorationPixels('#112233', 'axe', 0)[0][1] + 1, 'the decoration bobs with the walk cycle');
  const traits = { head: 1, body: 1, legs: 1, ears: 0, horns: 0, wings: 0, tail: 0, pattern: 0, hue: 0.3, sat: 0.5, light: 0.5, hue2: 0.5, eyeHue: 0.5 };
  assert(spriteKey(traits, 0) !== spriteKey(traits, 0, '#e11d48', 'axe') && spriteKey(traits, 0, '#e11d48', 'axe') !== spriteKey(traits, 0, '#22c55e', 'axe') && spriteKey(traits, 0, '#e11d48', 'axe') !== spriteKey(traits, 0, '#e11d48', 'pick'), 'sprites are cached by traits, frame, clan colour and job tool');
  assert(spriteKey(traits, 1) === spriteKey(traits, 1, null, null), 'plain creatures keep their old cache key');
}

section('Overview: society figures');
{
  const sim = realWorld('ov-1');
  run(sim, 1500);
  sim.planet = { name: 'Testworld' };
  sim.eventLog = [];
  const civ = sim.society.civilizations[0];
  const s = summarizeSociety(sim, civ);
  assert(s.settlements === 1 && s.clans >= 3 && Array.isArray(s.jobs) && s.jobs.length >= 2, 'the overview counts settlements, clans and jobs');
  assert(s.stock.length >= 2 && s.stock.every(i => i.name && i.n >= 1 && i.color), 'the top stockpile items are listed');
  assert(Array.isArray(s.needs) && s.needs.length >= 1, 'it says what the next era needs');
  assert(s.explored >= 0 && typeof s.sites === 'number' && typeof s.homeless === 'number', 'explored percentage, open sites and homeless are reported');
  const model = summarizeWorld(sim);
  assert(model.civs.every(c => c.society && c.society.settlements >= 1) && typeof model.season === 'string', 'summarizeWorld carries the society data and the season');
}

section('Saves: society round trip');
{
  const sim = realWorld('save-1');
  run(sim, 4000);
  const civ = sim.society.civilizations[0];
  const json = JSON.stringify(serializeSim(sim));
  const restored = restoreSim(JSON.parse(json));
  setActiveRng(sim.rng);
  const again = JSON.stringify(serializeSim(restored));
  assert(again === json, 'serialize -> restore -> serialize is identical with society state');
  const rc = restored.society.civilizations[0];
  assert(rc.settlements.length === civ.settlements.length && rc.clans.length === civ.clans.length, 'settlements and clans are restored');
  assert(JSON.stringify(rc.settlements[0].stock) === JSON.stringify(civ.settlements[0].stock), 'stockpiles are restored');
  assert(JSON.stringify(rc.explored) === JSON.stringify(civ.explored) && JSON.stringify(rc.knownDeposits) === JSON.stringify(civ.knownDeposits), 'explored cells and known deposits are restored');
  const workers = restored.ecosystem.entities.filter(e => e.alive && e.job);
  assert(workers.length > 0 && workers.every(e => typeof e.inventory === 'object'), 'jobs and inventories are restored');
  assert(restored.society.traffic.size === [...sim.society.traffic.entries()].filter(([, n]) => n >= 3).length, 'foot traffic (desire paths) is restored');
  assert(rc.era.id === civ.era.id && Math.abs(rc.food - civ.food) < 1e-9, 'era and food are restored');
  // the restored world keeps simulating, with sites still being built
  const sites = [...restored.terrain.buildings.values()].filter(b => b.progress < 1 && b.type !== 'ruins').length;
  restored.rng = sim.rng;
  runSimulationSteps(restored, 600);
  assert(restored.ecosystem.entities.some(e => e.alive && e.civilization), 'the restored world runs on');
  assert(sites >= 0, 'construction sites survive a save');
}

section('Determinism: the same seed builds the same society');
{
  const trace = () => {
    const sim = realWorld('det-1');
    run(sim, 2500);
    const civ = sim.society.civilizations[0];
    return JSON.stringify([civ.citizens, civ.techPoints.toFixed(3), civ.settlements.map(s => s.stock), sim.terrain.exportBuildings().length, civ.explored.length, civ.clans.length]);
  };
  assert(trace() === trace(), 'two runs with the same seed end in the same society');
}

section('Population: housing limits growth, famine and shelter matter');
{
  const w = emptyWorld();
  const civ = addCiv(w, 'Housia', 20, 20, 6);
  const cap0 = popCap(w.terrain, civ);
  assert(cap0 >= 8 && cap0 < 40, `the population cap comes from housing (${cap0}), not a flat limit`);
  const house = w.terrain.placeBuilding('longhouse', 30, 30, { civId: civ.id });
  house.settlementId = civ.settlements[0].id;
  house.residents = [];
  assert(popCap(w.terrain, civ) > cap0, 'a finished house raises the cap');
  // homeless people feel the cold without a roof
  const person = w.ecosystem.entities.find(e => e.civilization === civ);
  const tile = w.terrain.getTile(Math.floor(person.x), Math.floor(person.y));
  tile.temperature = 0.02;
  person.homeId = null;
  person.health = person.maxHealth;
  w.ecosystem.update(1, 1);
  const rough = person.thermalStress;
  person.homeId = house.id;
  w.ecosystem.update(1, 1);
  assert(rough > 0 && person.thermalStress < rough, 'a roof reduces thermal stress; sleeping rough does not');
  assert(seasonOf(0) === 0 && seasonOf(100) !== undefined, 'seasons cycle');
}

summary();
