// Space-faring civilizations (src/civilization/spaceflight.js): launches, real crews, colonies on other planets.
import { assert, section, summary } from './helpers.js';
import { createPlanetWorld } from '../src/simulation/world.js';
import { SeededRNG } from '../src/cosmos/seed.js';
import { setActiveRng } from '../src/simulation/random.js';
import { runSimulationSteps } from '../src/simulation/fixedStep.js';
import { serializeSim, restoreSim } from '../src/persistence/saveGame.js';
import { launchShip, foundColony, tickSpaceflight, hasSpaceport, pickCrew, LAUNCH_INTERVAL } from '../src/civilization/spaceflight.js';
import { placeLandmark } from '../src/civilization/townPlanner.js';
import { ERAS } from '../src/civilization/techTree.js';
import { getReligion, religionsOf } from '../src/civilization/religion.js';
import { castPower } from '../src/god/powerEffects.js';
import { ensureEffects } from '../src/god/effects.js';

console.log('====================================================');
console.log('   SPACEFLIGHT TESTS                                ');
console.log('====================================================');

function world(seed, opts = {}) {
  const rng = new SeededRNG(seed);
  setActiveRng(rng);
  const sim = createPlanetWorld(rng, { seed, radius: 1, ...opts });
  setActiveRng(rng);
  sim.rng = rng;
  return sim;
}
const run = (sim, steps) => { setActiveRng(sim.rng); runSimulationSteps(sim, steps); setActiveRng(sim.rng); };

const home = world('space-home');
run(home, 200);
const civ = home.society.civilizations.find(c => c.isAlive);

section('Starward Vision: a people reaches the Spaceflight Age and gets a spaceport');
{
  const fx = ensureEffects(home.terrain, home.ecosystem, home.society);
  const result = castPower('STARWARD_VISION', fx, civ.capitalX, civ.capitalY);
  assert(result.ok, `the power was cast (${result.reason || 'ok'})`);
  assert(civ.era.id === 'SPACE_AGE', 'the civilization is in the Spaceflight Age');
  assert(hasSpaceport(home.terrain, civ), 'a finished spaceport stands in its land');
  const nothing = castPower('STARWARD_VISION', fx, 2, 2);
  assert(!nothing.ok, 'cast on empty wilderness it does nothing');
}

section('Launch: the crew are real people who leave the planet');
{
  home.society.spawnCitizens(civ, 16);
  home.society.refreshCensus();
  const before = home.ecosystem.entities.filter(e => e.civilization === civ).length;
  const crewPreview = pickCrew(home.ecosystem.entities.filter(e => e.civilization === civ));
  assert(crewPreview.every(e => e.isAdult && !e.isSpecialIndividual), 'only adults (never a champion) are picked');
  const ship = launchShip(home.society, civ);
  assert(ship && ship.colonists.length >= 2, `a ship was launched (${ship ? ship.colonists.length : 0} settlers)`);
  const after = home.ecosystem.entities.filter(e => e.civilization === civ).length;
  assert(after === before - ship.colonists.length, 'the settlers are gone from the home planet');
  assert(ship.colonists.every(c => c.genome && c.species && c.species.name), 'each settler carries a genome and a species');
  const sexes = new Set(ship.colonists.map(c => c.sex));
  assert(sexes.size === 2, 'the crew has women and men, so the colony can grow');
  assert(home.society.outbound.includes(ship), 'the ship waits in the outbound list for the game to fly it');
  assert(!ship.civ.faith || ship.civ.faith.name, 'the faith of the people travels with them');
}

section('Automatic launches from a spaceport');
{
  home.society.outbound = [];
  civ.launchTimer = 1;
  home.society.spawnCitizens(civ, 10);
  home.society.refreshCensus();
  const ship = tickSpaceflight(home.society, civ, 2);
  assert(Boolean(ship), 'the spaceport launches a ship when its timer runs out');
  assert(civ.launchTimer === LAUNCH_INTERVAL, 'and waits before the next one');
}

section('Colony: the settlers found a civilization on a barren world');
const ship = home.society.outbound[0];
const target = world('space-target', { populated: false });
{
  assert(target.society.civilizations.length === 0, 'the target planet starts empty');
  const colony = foundColony(target, ship);
  assert(Boolean(colony), 'a colony was founded');
  assert(colony.era.id === 'SPACE_AGE', 'the colonists keep their knowledge (era)');
  assert(colony.colonyOf === civ.name && colony.name.startsWith('New '), `it is named after its homeland (${colony.name})`);
  const people = target.ecosystem.entities.filter(e => e.civilization === colony);
  assert(people.length === ship.colonists.length, `every settler landed (${people.length})`);
  assert(people.every(e => ship.colonists.some(c => JSON.stringify(c.genome) === JSON.stringify(e.genome.toJSON()))), 'their genomes are the ones that left');
  assert(people.every(e => e.species && e.species.sapient), 'they belong to a sapient species on the new world');
  if (ship.civ.faith) {
    const f = getReligion(target.society, colony.faithId);
    assert(f && f.name === ship.civ.faith.name && people.every(e => e.faithId === f.id), 'the colony keeps its faith');
  }
  assert((colony.settlements || []).length === 1, 'the colony has a settlement');
  run(target, 400);
  assert(colony.isAlive && target.ecosystem.entities.some(e => e.alive && e.civilization === colony), 'the colony survives its first years');
}

section('Saves keep colonies');
{
  const data = JSON.parse(JSON.stringify(serializeSim(target)));
  const back = restoreSim(data);
  const c = back.society.civilizations.find(x => x.colonyOf === civ.name);
  assert(Boolean(c) && c.era.id === 'SPACE_AGE', 'the colony and its era survive a save');
  assert(religionsOf(back.society).length === religionsOf(target.society).length, 'and so does its faith');
}

summary();
