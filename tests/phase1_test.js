import { assert, section, summary, addCiv, addHuman, defaultWorld, emptyWorld, liveCitizens } from './helpers.js';
import {
  INITIAL_CITIZENS,
  POP_PER_CITIZEN,
  MIN_POPULATION,
  MAX_CITIZENS,
  FOOD_CAP,
  MAX_WAR_DURATION,
  TRUCE_DURATION
} from '../src/civilization/society.js';
import { catchUpEngine } from '../src/simulation/catchUpEngine.js';
import { SeededRNG } from '../src/cosmos/seed.js';
import { Entity } from '../src/life/entity.js';
import { BIOMES } from '../src/planet/biomes.js';
import { jevEngine } from '../src/ai/jevEngine.js';
import {
  SIM_STEP,
  MAX_STEPS_PER_FRAME,
  FixedStepper,
  scaleChance,
  runSimulationSteps
} from '../src/simulation/fixedStep.js';

console.log('====================================================');
console.log('   PHASE 1 TESTS — SIMULATION FIXES                 ');
console.log('====================================================');

section('Fixed step: step counts are independent of frame rate and speed');
{
  const slow = new FixedStepper();
  let slowSteps = 0;
  for (let f = 0; f < 640; f++) slowSteps += slow.advance(1 / 64, 1); // 10 s at 1x
  const fast = new FixedStepper();
  let fastSteps = 0;
  for (let f = 0; f < 64; f++) fastSteps += fast.advance(1 / 64, 10); // 1 s at 10x
  assert(SIM_STEP === 0.05, 'SIM_STEP is 0.05');
  assert(slowSteps === 200, `10 s at 1x runs 200 steps (got ${slowSteps})`);
  assert(fastSteps === 200, `1 s at 10x runs 200 steps (got ${fastSteps})`);
  assert(new FixedStepper().advance(1 / 60, 0) === 0, 'speed 0 runs no steps');
}

section('Fixed step: cap prevents a spiral of death');
{
  const stepper = new FixedStepper();
  assert(stepper.advance(1 / 60, 10000) === MAX_STEPS_PER_FRAME, `10000x is capped at ${MAX_STEPS_PER_FRAME} steps/frame`);
  assert(stepper.advance(0, 1) === 0, 'excess time is dropped, not carried over');
}

section('Fixed step: scaleChance converts per-frame odds to per-step odds');
{
  assert(Math.abs(scaleChance(0.2, 0.05) - 0.6) < 1e-9, 'a 0.2 per-frame chance becomes 0.6 per 0.05 s step');
  assert(scaleChance(0.5, 1) === 1, 'scaled chance is clamped to 1');
  assert(Math.abs(scaleChance(0.2, 1 / 60) - 0.2) < 1e-9, 'at 60 Hz the chance is unchanged');
}

section('Fixed step: runSimulationSteps drives ecosystem and society');
{
  const calls = [];
  const sim = {
    ecosystem: { update: (dt, speed) => calls.push(['eco', dt, speed]) },
    society: { update: (dt, speed) => calls.push(['soc', dt, speed]) }
  };
  const done = runSimulationSteps(sim, 3);
  assert(done === 3, 'runs the requested number of steps');
  assert(calls.length === 6, 'each step updates ecosystem then society');
  assert(calls[0][0] === 'eco' && calls[0][1] === SIM_STEP && calls[0][2] === 1, 'ecosystem gets (SIM_STEP, 1)');
  assert(calls[1][0] === 'soc' && calls[1][1] === SIM_STEP && calls[1][2] === 1, 'society gets (SIM_STEP, 1)');

  let t = 0;
  const fakeNow = () => { const v = t; t += 2; return v; }; // each call advances 2 ms
  const budgeted = runSimulationSteps(sim, 10, { budgetMs: 5, now: fakeNow });
  assert(budgeted === 3, `time budget stops early (ran ${budgeted} of 10)`);
}

section('Citizen assignment: territory owner beats nearest capital');
{
  const w = emptyWorld();
  const alpha = addCiv(w, 'Alpha', 10, 20, 0);
  const beta = addCiv(w, 'Beta', 50, 20, 0);

  const near = addHuman(w, null, 12.5, 20.5);
  w.society.assignCitizen(near);
  assert(near.civilization === alpha, 'unowned tile: human joins the nearest capital');

  const border = addHuman(w, null, 12.5, 20.5);
  w.terrain.getTile(12, 20).civId = beta.id;
  w.society.assignCitizen(border);
  assert(border.civilization === beta, 'owned tile: human joins the tile owner even if another capital is closer');

  const deer = new Entity({ species: w.ecosystem.speciesCatalog.find(s => !s.sapient), x: 12.5, y: 20.5 });
  assert(w.society.assignCitizen(deer) === null && deer.civilization === null, 'wildlife never joins a civilization');
}

section('Citizen assignment: collapse releases members');
{
  const w = emptyWorld();
  const alpha = addCiv(w, 'Alpha', 10, 20, 0);
  const h = addHuman(w, alpha, 11.5, 20.5);
  alpha.collapse(w.terrain, 'test', w.ecosystem);
  assert(h.civilization === null, 'members become unaffiliated when their civ collapses');
}

section('Citizen assignment: babies inherit the parent civilization');
{
  const w = emptyWorld();
  const alpha = addCiv(w, 'Alpha', 20, 20, 0);
  const mother = addHuman(w, alpha, 20.5, 20.5);
  const father = addHuman(w, alpha, 21.5, 20.5);
  mother.sex = 'F';
  father.sex = 'M';
  for (let i = 0; i < 200 && !mother.pregnancy; i++) {
    father.mateCooldown = 0;
    w.ecosystem.tryConceive(father, mother);
  }
  assert(Boolean(mother.pregnancy), 'courtship eventually leads to a pregnancy');
  const babies = w.ecosystem.giveBirth(mother);
  assert(babies.length >= 1 && babies.every(b => b.civilization === alpha), "babies belong to their parents' civilization");
  assert(babies.every(b => b.parents[0] === mother.id && b.parents[1] === father.id && b.motherId === mother.id), 'babies know their parents');
}

section('Citizen assignment: default world setup');
{
  const w = defaultWorld();
  const humans = w.ecosystem.entities.filter(e => e.species.type === 'humanoid');
  assert(w.society.civilizations.length > 0, 'default world has civilizations');
  assert(humans.every(h => h.civilization !== null), 'every human starts with a civilization');
  assert(
    w.society.civilizations.every(c => liveCitizens(w, c) >= INITIAL_CITIZENS),
    `every civ starts with at least ${INITIAL_CITIZENS} citizens`
  );
}

section('Population: derived from living citizens');
{
  const w = emptyWorld();
  const alpha = addCiv(w, 'Alpha', 10, 20, 5);
  w.society.refreshCensus();
  assert(alpha.citizens === 5, 'census counts living citizens');
  assert(alpha.population === 5 * POP_PER_CITIZEN, `population is citizens x ${POP_PER_CITIZEN}`);

  for (const e of w.ecosystem.entities) e.role = 'CITIZEN'; // spawned roles are random
  const soldier = addHuman(w, alpha, 11.5, 20.5, 'SOLDIER');
  w.society.refreshCensus();
  assert(alpha.soldiers === 1, 'census counts soldiers');

  soldier.die('test');
  w.society.refreshCensus();
  assert(alpha.citizens === 5, 'dead citizens are not counted');

  const empty = addCiv(w, 'Ghost', 40, 20, 0);
  w.society.refreshCensus();
  assert(empty.population === MIN_POPULATION, `population never drops below ${MIN_POPULATION}`);
}

section('Population: food decides how readily couples conceive; children cost food');
{
  const w = emptyWorld();
  const alpha = addCiv(w, 'Alpha', 10, 20, 5);
  alpha.food = 300;
  w.society.update(0.05, 1);
  assert(alpha.prosperity > 1, 'a food surplus makes couples more fertile');
  alpha.food = -50;
  w.society.update(0.05, 1);
  assert(alpha.prosperity < 1, 'famine makes them less fertile');

  alpha.food = 200;
  const mother = w.ecosystem.entities.find(e => e.civilization === alpha && e.sex === 'F');
  const father = w.ecosystem.entities.find(e => e.civilization === alpha && e.sex === 'M');
  mother.pregnancy = { embryos: [father.genome], fatherId: father.id, timeLeft: 0 };
  const before = liveCitizens(w, alpha);
  w.ecosystem.giveBirth(mother);
  assert(liveCitizens(w, alpha) === before + 1, 'a birth adds exactly one citizen, who is a real child');
  assert(alpha.food === 180, 'raising a child cost the nation food');
}

section('Population: famine kills real citizens');
{
  const w = emptyWorld();
  const alpha = addCiv(w, 'Alpha', 10, 20, 5);
  alpha.food = -500;
  for (let i = 0; i < 4; i++) w.society.update(1, 1);
  assert(liveCitizens(w, alpha) < 5, `famine killed a citizen (now ${liveCitizens(w, alpha)})`);
}

section('Population: a civ with no citizens collapses');
{
  const w = emptyWorld();
  const alpha = addCiv(w, 'Alpha', 10, 20, 3);
  for (const e of w.ecosystem.entities) e.die('test');
  w.society.update(0.05, 1);
  assert(alpha.isAlive === false, 'depopulated civ collapses into ruins');
}

section('Population: ruins rebirth gives the new civ citizens');
{
  const w = emptyWorld();
  const old = addCiv(w, 'Alpha', 10, 20, 0);
  const tile = w.terrain.getTile(12, 18); // rebirth scans a 6-tile grid
  tile.structure = { type: 'ruins', name: 'Ancient Ruins of Alpha', originalTech: 300 };
  old.isAlive = false;
  addHuman(w, null, 12.5, 20.5);
  w.society.checkRuinsRebirth();
  const reborn = w.society.civilizations.find(c => c.name.startsWith('Neo-'));
  assert(Boolean(reborn), 'a new civ was founded on the ruins');
  assert(reborn && liveCitizens(w, reborn) >= 1, 'the reborn civ has citizens');
}

section('Population: catch-up births create real citizens');
{
  const w = emptyWorld();
  const alpha = addCiv(w, 'Alpha', 10, 20, 5);
  const techBefore = alpha.techPoints;
  const report = catchUpEngine.fastForwardPlanet(
    { planet: { name: 'Test' }, terrain: w.terrain, ecosystem: w.ecosystem, society: w.society },
    100,
    new SeededRNG('catchup')
  );
  assert(report !== null, 'catch-up ran');
  assert(liveCitizens(w, alpha) >= 5, 'catch-up never shrinks a healthy civ');
  assert(alpha.techPoints > techBefore, 'catch-up still advances technology');
}

section('War: soldiers of warring civs now actually fight');
{
  const w = emptyWorld();
  const a = addCiv(w, 'Alpha', 10, 20, 0);
  const b = addCiv(w, 'Beta', 16, 20, 0);
  for (let i = 0; i < 3; i++) {
    addHuman(w, a, 9.5 + i, 19.5, 'SOLDIER');
    addHuman(w, b, 15.5 + i, 21.5, 'SOLDIER');
  }
  a.declareWar(b, w.ecosystem, 'test');
  let killed = false;
  for (let step = 0; step < 2400 && !killed; step++) {
    w.ecosystem.update(0.05, 1);
    killed = w.ecosystem.entities.some(e => !e.alive && /Killed in War/.test(e.causeOfDeath || ''));
  }
  assert(killed, 'at least one soldier was killed in the war');
}

section('War: ends in surrender when one side has no soldiers');
{
  const w = emptyWorld();
  const a = addCiv(w, 'Alpha', 10, 20, 0);
  const b = addCiv(w, 'Beta', 14, 20, 0);
  for (let i = 0; i < 3; i++) {
    addHuman(w, a, 9.5 + i, 19.5, 'SOLDIER');
    addHuman(w, b, 13.5 + i, 21.5, 'CITIZEN');
  }
  a.declareWar(b, w.ecosystem, 'test');
  for (let i = 0; i < 25; i++) w.society.update(1, 1);
  assert(a.warTarget === null && b.warTarget === null, 'war cleared on both sides');
  assert(a.diplomacy.get(b.id) === 'PEACE' && b.diplomacy.get(a.id) === 'PEACE', 'diplomacy returns to PEACE');
  assert(a.truce > 0 && b.truce > 0, 'a truce prevents an immediate new war');
  assert(w.ecosystem.notifications.some(n => /surrenders/.test(n.text)), 'surrender is announced');
}

section('War: ends from war weariness');
{
  const w = emptyWorld();
  const a = addCiv(w, 'Alpha', 10, 20, 0);
  const b = addCiv(w, 'Beta', 14, 20, 0);
  addHuman(w, a, 10.5, 19.5, 'SOLDIER');
  addHuman(w, b, 14.5, 19.5, 'SOLDIER');
  a.declareWar(b, w.ecosystem, 'test');
  a.warTimer = MAX_WAR_DURATION + 1;
  w.society.update(0.05, 1);
  assert(a.warTarget === null && b.warTarget === null, 'a very long war ends');
  assert(a.truce <= TRUCE_DURATION && a.truce > TRUCE_DURATION - 1, 'truce starts at TRUCE_DURATION');
}

section('War: a collapsing civ ends its war');
{
  const w = emptyWorld();
  const a = addCiv(w, 'Alpha', 10, 20, 2);
  const b = addCiv(w, 'Beta', 14, 20, 2);
  a.declareWar(b, w.ecosystem, 'test');
  b.collapse(w.terrain, 'test', w.ecosystem);
  assert(a.warTarget === null, 'the surviving civ is no longer at war');
  assert(a.diplomacy.get(b.id) === 'PEACE', 'diplomacy is PEACE after the foe collapsed');
}

section('War: a civ never fights two wars at once');
{
  const w = emptyWorld();
  const a = addCiv(w, 'Alpha', 10, 20, 2);
  const b = addCiv(w, 'Beta', 14, 20, 2);
  const c = addCiv(w, 'Gamma', 18, 20, 2);
  a.declareWar(b, w.ecosystem, 'test');
  for (let i = 0; i < 300; i++) {
    a.evaluateDiplomacy(w.society.civilizations, w.ecosystem);
    c.evaluateDiplomacy(w.society.civilizations, w.ecosystem);
  }
  assert(a.warTarget === b, 'Alpha is still fighting Beta only');
  assert(c.warTarget === null, 'Gamma cannot join a war against a civ that is already at war');
}

section('Fixed step: a creature ages identically at 1x and 10x');
{
  const ageAfter = (frames, speed) => {
    const w = emptyWorld();
    const civ = addCiv(w, 'Alpha', 30, 20, 0);
    const human = addHuman(w, civ, 30.5, 20.5);
    const startAge = human.age;
    const stepper = new FixedStepper();
    let steps = 0;
    for (let f = 0; f < frames; f++) steps += runSimulationSteps(w, stepper.advance(1 / 64, speed));
    return { age: human.age - startAge, steps, alive: human.alive };
  };
  const slow = ageAfter(640, 1); // 10 s at 1x
  const fast = ageAfter(64, 10); // 1 s at 10x
  assert(slow.steps === 200 && fast.steps === 200, 'both runs simulate exactly 200 steps');
  assert(slow.alive && fast.alive, 'the creature survives both runs');
  assert(Math.abs(slow.age - fast.age) < 1e-9, `same simulated time gives the same age (${slow.age.toFixed(3)} vs ${fast.age.toFixed(3)})`);
}

section('Balance: population and food ceilings');
{
  const w = emptyWorld();
  const alpha = addCiv(w, 'Alpha', 20, 20, 0);
  for (let i = 0; i < MAX_CITIZENS; i++) {
    const h = addHuman(w, alpha, 19.5 + (i % 5) * 0.2, 19.5 + Math.floor(i / 5) * 0.2);
    h.sex = i % 2 === 0 ? 'F' : 'M';
  }
  w.society.refreshCensus();
  const mother = w.ecosystem.entities.find(e => e.sex === 'F');
  const father = w.ecosystem.entities.find(e => e.sex === 'M' && !e.isKinOf(mother));
  let conceived = false;
  for (let i = 0; i < 500; i++) {
    father.mateCooldown = 0;
    mother.mateCooldown = 0;
    conceived = w.ecosystem.tryConceive(father, mother) || conceived;
  }
  assert(!conceived, 'no couple conceives once a nation is at MAX_CITIZENS');

  alpha.food = FOOD_CAP;
  for (let i = 0; i < 20; i++) { alpha.food = Math.max(alpha.food, FOOD_CAP); w.society.update(1, 1); }
  assert(alpha.food <= FOOD_CAP, 'food never exceeds FOOD_CAP');
}

section('Buildings: never on water, ice or mountain peaks');
{
  const w = emptyWorld();
  const water = w.terrain.getTile(5, 5);
  water.biome = BIOMES.OCEAN;
  const ice = w.terrain.getTile(6, 5);
  ice.biome = BIOMES.GLACIAL_ICE;
  const peak = w.terrain.getTile(7, 5);
  peak.elevation = 0.95;
  assert(!w.terrain.isBuildable(5, 5) && !w.terrain.isBuildable(6, 5) && !w.terrain.isBuildable(7, 5), 'water, ice and peaks are not buildable');
  assert(w.terrain.isBuildable(8, 5) && w.terrain.isBuildable(-500, 800), 'ordinary land is buildable, even far outside where the world once ended');

  // Half the map is sea: no matter how often a civ expands, nothing is built on bad ground
  for (let x = -80; x < 30; x++) for (let y = -20; y < 60; y++) w.terrain.getTile(x, y).biome = BIOMES.OCEAN;
  const civ = addCiv(w, 'Coastal', 33, 20, 2);
  for (let i = 0; i < 3000; i++) civ.expandTerritory(w.terrain);
  const misplaced = [];
  w.terrain.forEachLoadedTile(t => {
    if (t.structure && t.structure.type !== 'capital' && !w.terrain.isBuildable(t.x, t.y)) misplaced.push(t);
  });
  assert(civ.territory.length > 5, `the civ expanded (${civ.territory.length} tiles)`);
  assert(misplaced.length === 0, 'no structure was placed on unbuildable ground');
}

section('Buildings: a creature standing in the sea does not erect a temple');
{
  const w = emptyWorld();
  const civ = addCiv(w, 'Alpha', 30, 20, 0);
  const pilgrim = addHuman(w, civ, 10.5, 10.5);
  pilgrim.aiSystem = 'JEV';
  w.terrain.getTile(10, 10).biome = BIOMES.OCEAN;
  const original = jevEngine.evaluate;
  jevEngine.evaluate = () => ({ action: 'ErectHolySanctuary', reason: 'test', scores: {} });
  pilgrim.belief = { status: 'DEVOUT_BELIEVER' };
  pilgrim.executeJevAI({ terrain: w.terrain, pathfinder: null, entities: [pilgrim], ecosystem: w.ecosystem });
  const seaBuilt = Boolean(w.terrain.getTile(10, 10).structure);
  pilgrim.x = 12.5;
  pilgrim.y = 12.5;
  pilgrim.executeJevAI({ terrain: w.terrain, pathfinder: null, entities: [pilgrim], ecosystem: w.ecosystem });
  const landBuilt = Boolean(w.terrain.getTile(12, 12).structure);
  jevEngine.evaluate = original;
  assert(!seaBuilt, 'nothing was built on the water tile');
  assert(landBuilt, 'the same creature does build on dry land');
}

summary();
