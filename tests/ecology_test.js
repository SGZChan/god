import { assert, section, summary, emptyWorld, defaultWorld, addCiv, addHuman } from './helpers.js';
import { SeededRNG } from '../src/cosmos/seed.js';
import { setActiveRng } from '../src/simulation/random.js';
import { Entity } from '../src/life/entity.js';
import { Genome, recombine, traitDistance, PART_COUNTS } from '../src/life/genome.js';
import { MATE_THRESHOLD, MIN_FOUNDING_GROUP } from '../src/life/species.js';
import { SpatialGrid } from '../src/life/spatialGrid.js';
import { serializeSim, restoreSim } from '../src/persistence/saveGame.js';
import { createPlanetWorld } from '../src/simulation/world.js';

console.log('====================================================');
console.log('   ECOLOGY TESTS — BEHAVIOUR, MATING, EVOLUTION     ');
console.log('====================================================');
setActiveRng(new SeededRNG('ecology-tests'));

const stepWorld = (w, steps) => { for (let i = 0; i < steps; i++) w.ecosystem.update(0.05, 1); };
const herbivoreSpecies = w => w.ecosystem.speciesCatalog.find(s => s.type === 'herbivore');
const predatorSpecies = w => w.ecosystem.speciesCatalog.find(s => s.type === 'predator');
function addCreature(w, species, x, y, sex, extra = {}) {
  const e = new Entity({ species, x, y, sex, ...extra });
  w.ecosystem.entities.push(e);
  return e;
}

section('Founders: a planet starts with random species, both sexes, no free spawning later');
{
  const w = defaultWorld();
  const kinds = w.ecosystem.speciesCatalog.map(s => s.type);
  assert(w.ecosystem.speciesCatalog.length >= 12, "at least twelve founder species");
  assert(kinds.filter(k => k === 'humanoid').length === 1 && kinds.filter(k => k === 'predator').length >= 2, 'one sapient, several predator species');
  assert(kinds.filter(k => k === 'herbivore').length >= 3 && kinds.includes('omnivore'), 'several herbivore species and omnivores');
  const looks = new Set(w.ecosystem.speciesCatalog.map(s => ['body', 'head', 'legs', 'ears', 'tail', 'horns', 'wings', 'pattern'].map(g => s.centroid[g]).join('')));
  assert(looks.size >= 6, `species look different: random combinations of parts (${looks.size} distinct)`);
  for (const species of w.ecosystem.speciesCatalog.filter(s => !s.sapient)) {
    const members = w.ecosystem.entities.filter(e => e.species === species);
    if (!members.length) continue; // (sea species have no school on a world without sea)
    assert(members.some(m => m.sex === 'F') && members.some(m => m.sex === 'M') && members.every(m => m.isAdult), `${species.name} founders are adults of both sexes`);
  }
  assert(w.ecosystem.sapientSpecies().sapient, 'the sapient species is findable');
}

section('Life: nothing spawns without mating');
{
  const w = emptyWorld();
  const deer = herbivoreSpecies(w);
  for (let i = 0; i < 8; i++) addCreature(w, deer, 5 + i, 5, 'M');
  w.ecosystem.registry.refresh(w.ecosystem.entities, 0);
  stepWorld(w, 1200);
  assert(w.ecosystem.entities.filter(e => e.alive).length <= 8 && w.ecosystem.births === 0, 'eight males alone produce no children');
}

section('Life: courtship, pregnancy and birth');
{
  const w = emptyWorld();
  const deer = herbivoreSpecies(w);
  const mother = addCreature(w, deer, 10.5, 10.5, 'F');
  const father = addCreature(w, deer, 11.5, 10.5, 'M');
  let conceivedAt = -1;
  let hungerBefore = null;
  let hungerAfter = null;
  for (let i = 0; i < 4000 && w.ecosystem.births === 0; i++) {
    stepWorld(w, 1);
    mother.hunger = Math.min(mother.hunger, 30);
    father.hunger = Math.min(father.hunger, 30);
    if (mother.pregnancy && conceivedAt < 0) conceivedAt = i;
  }
  assert(conceivedAt >= 0, 'a courting pair conceives by itself');
  assert(w.ecosystem.births >= 1, 'a baby is born after the gestation period');
  const baby = w.ecosystem.entities.find(e => e.parents.includes(mother.id));
  assert(Boolean(baby) && baby.parents[0] === mother.id && baby.parents[1] === father.id, 'the baby knows its mother and father');
  assert(baby.age < 1 && baby.stage === 'infant' && baby.generation === 1, 'it is a newborn infant of the next generation');
  assert(baby.sex === 'F' || baby.sex === 'M', 'it has a sex');
  assert(traitDistance(baby.traits, mother.traits) < 0.4, 'it resembles its parents');
  assert(!mother.pregnancy && mother.mateCooldown > 0, 'the mother recovers before mating again');
}

section('Life: who may mate');
{
  const w = emptyWorld();
  const deer = herbivoreSpecies(w);
  const wolf = predatorSpecies(w);
  const f = addCreature(w, deer, 10, 10, 'F');
  const m = addCreature(w, deer, 11, 10, 'M');
  const m2 = addCreature(w, deer, 12, 10, 'M');
  assert(f.canMateWith(m) && m.canMateWith(f), 'unrelated adults of opposite sex can mate');
  assert(!f.canMateWith(addCreature(w, deer, 11, 11, 'F')), 'two females cannot');
  m.parents = ['x', 'y'];
  m2.parents = ['x', 'z'];
  assert(m.isKinOf(m2) && !m.canMateWith(addCreature(w, deer, 9, 9, 'F', { parents: ['x', 'q'] })), 'half-siblings are kin and avoid each other');
  const stranger = addCreature(w, wolf, 12, 12, 'M');
  assert(traitDistance(f.traits, stranger.traits) > MATE_THRESHOLD && !f.canMateWith(stranger), 'creatures of very different species cannot interbreed');
  assert(!w.ecosystem.tryConceive(stranger, f), 'conception between incompatible species fails');
  const kid = addCreature(w, deer, 13, 13, 'M', { age: 0 });
  assert(!f.canMateWith(kid), 'children cannot mate');
  const elder = addCreature(w, deer, 14, 14, 'M', { age: 1000 });
  assert(!f.canMateWith(elder), 'the very old cannot mate');
}

section('Life: stages, hunger and pregnancy costs');
{
  const w = emptyWorld();
  const deer = herbivoreSpecies(w);
  const a = addCreature(w, deer, 10, 10, 'F', { age: 0 });
  assert(a.stage === 'infant', 'newborns are infants');
  a.age = a.stats.maturityYears * 0.6;
  assert(a.stage === 'juvenile', 'then juveniles');
  a.age = a.stats.maturityYears * 1.5;
  assert(a.stage === 'adult' && a.isAdult, 'then adults');
  a.age = a.maxAge * 0.9;
  assert(a.stage === 'elder', 'then elders');
  a.age = 0;
  assert(a.visualScale < addCreature(w, deer, 12, 12, 'F').visualScale, 'babies are drawn smaller than adults');

  const plain = addCreature(w, deer, 20, 20, 'F');
  const expecting = addCreature(w, deer, 22, 22, 'F');
  plain.hunger = 0;
  expecting.hunger = 0;
  expecting.pregnancy = { embryos: [expecting.genome], fatherId: 'x', timeLeft: 999 };
  for (const e of [plain, expecting]) e.update(1, 1, { terrain: w.terrain, ecosystem: w.ecosystem, entities: [], grid: new SpatialGrid(), pathfinder: null });
  assert(expecting.hunger > plain.hunger, 'a pregnant mother gets hungry faster');
}

section('Life: temperature is a selection pressure');
{
  const w = emptyWorld();
  const deer = herbivoreSpecies(w);
  const e = addCreature(w, deer, 30.5, 30.5, 'F');
  e.hunger = 0;
  const tile = w.terrain.getTile(30, 30);
  const world = { terrain: w.terrain, ecosystem: w.ecosystem, entities: [e], grid: new SpatialGrid(), pathfinder: null };
  const comfortable = e.health;
  tile.temperature = e.stats.idealTemp;
  e.update(1, 1, world);
  assert(e.thermalStress === 0 && e.health >= comfortable, 'no stress at the ideal temperature');
  tile.temperature = -1; // far below any creature's tolerance
  e.hunger = 0;
  e.health = e.maxHealth;
  for (let i = 0; i < 400 && e.alive; i++) {
    e.hunger = 0; // keep it fed so only the cold can kill it
    e.update(1, 1, world);
  }
  assert(!e.alive && /Froze/.test(e.causeOfDeath), 'a creature left in killing cold freezes to death');
}

section('Life: foraging and hunting');
{
  const w = emptyWorld();
  const deer = herbivoreSpecies(w);
  const eater = addCreature(w, deer, 10.5, 10.5, 'F');
  eater.hunger = 90;
  w.terrain.getTile(10, 10).flora = 80;
  eater.executeNeedsAI({ terrain: w.terrain, ecosystem: w.ecosystem, entities: [eater], grid: new SpatialGrid(), pathfinder: null });
  assert(eater.state === 'FORAGE' && eater.hunger < 90 && w.terrain.getTile(10, 10).flora < 80, 'a hungry grazer eats the flora under its feet');

  const wolf = predatorSpecies(w);
  const hunter = addCreature(w, wolf, 20.5, 20.5, 'M');
  const prey = addCreature(w, deer, 21, 20.5, 'F');
  hunter.hunger = 95;
  prey.health = 1;
  const grid = new SpatialGrid();
  const entities = [hunter, prey];
  grid.rebuild(entities);
  hunter.executeNeedsAI({ terrain: w.terrain, ecosystem: w.ecosystem, entities, grid, pathfinder: null });
  assert(!prey.alive && /Hunted by/.test(prey.causeOfDeath) && hunter.hunger < 50 && hunter.kills === 1, 'a hungry predator kills adjacent prey and is fed');

  const safeDeer = addCreature(w, deer, 40, 40, 'F');
  const sameKind = addCreature(w, wolf, 40.5, 40, 'F');
  hunter.hunger = 99;
  assert(!hunter.canHunt(hunter) && !hunter.canHunt(sameKind), 'predators do not hunt their own species');
  const folk = w.ecosystem.sapientSpecies();
  const person = new Entity({ species: folk, x: 1, y: 1 });
  hunter.hunger = 10;
  assert(!hunter.canHunt(person), 'a well-fed predator leaves people alone');
  hunter.hunger = 95;
  assert(hunter.canHunt(person) === (person.stats.sizeScale <= hunter.stats.sizeScale * 1.5), 'a starving predator may take a lone person who has no nation');
  person.civilization = { isAlive: true };
  hunter.hunger = 99;
  assert(!hunter.canHunt(person), 'people inside a civilization are protected by their settlements');
  assert(safeDeer.alive, 'bystanders are unharmed');
}

section('Evolution: a new species is announced when a divergent group is born');
{
  const w = emptyWorld();
  const deer = herbivoreSpecies(w);
  const mother = addCreature(w, deer, 10, 10, 'F');
  const father = addCreature(w, deer, 11, 10, 'M');
  const before = w.ecosystem.speciesCatalog.length;
  // Give birth to descendants far from anything alive (a mutant lineage)
  const extreme = Genome.pure({
    size: 0.02, speed: 0.98, prefTemp: 0.02, coldTol: 0.98, aggression: 0.99, intelligence: 0.01,
    herbivory: 0.5, carnivory: 0.5, sociality: 0.01, fertility: 0.99, lifespan: 0.02, perception: 0.01, metabolism: 0.99
  });
  const babies = [];
  for (let i = 0; i < MIN_FOUNDING_GROUP; i++) babies.push(w.ecosystem.bear(mother, father, Genome.jittered(extreme, 0.01)));
  const newSpecies = w.ecosystem.speciesCatalog.length - before;
  assert(newSpecies === 1, 'exactly one new species emerged');
  const species = babies[0].species;
  assert(babies.every(b => b.species === species) && species !== deer && species.ancestorId === deer.id, 'the divergent group belongs to it, descended from the grazer');
  assert(w.ecosystem.notifications.some(n => /new species has emerged/.test(n.text)), 'the emergence is announced');
}

section('Evolution: climate selects, and time passes while you are away');
{
  const w = emptyWorld();
  const deer = herbivoreSpecies(w);
  for (let i = 0; i < 30; i++) {
    const e = addCreature(w, deer, 5 + (i % 6), 5 + Math.floor(i / 6), i % 2 ? 'M' : 'F');
    e.setGenome(Genome.jittered(Genome.pure({ prefTemp: 0.5, coldTol: 0.5, heatTol: 0.5 }), 0.15));
  }
  // The land is cold: those who tolerate cold have more children
  for (let x = -20; x < 40; x++) for (let y = -20; y < 40; y++) w.terrain.getTile(x, y).temperature = 0.15;
  const comfortLow = () => w.ecosystem.entities.reduce((s, e) => s + (e.stats.idealTemp - e.stats.coldTolerance), 0) / w.ecosystem.entities.length;
  const before = comfortLow();
  const genomesBefore = JSON.stringify(w.ecosystem.entities.map(e => e.genome));
  w.ecosystem.evolveOffscreen(2000);
  const after = comfortLow();
  assert(JSON.stringify(w.ecosystem.entities.map(e => e.genome)) !== genomesBefore, 'generations passed: genomes changed');
  assert(after < before - 0.02, `the herd evolved to live in the cold (comfort floor ${before.toFixed(2)} -> ${after.toFixed(2)})`);
  assert(w.ecosystem.entities.every(e => e.alive && e.age < e.maxAge), 'the new generation is alive and young');
}

section('Society: a nation grows only through births');
{
  const w = emptyWorld();
  const alpha = addCiv(w, 'Alpha', 30, 30, 6);
  const before = w.ecosystem.entities.length;
  w.society.update(1, 1);
  assert(w.ecosystem.entities.length === before, 'food and prosperity never create people');
  const births = w.ecosystem.breedOffscreen(alpha, 4);
  assert(births > 0 && w.ecosystem.entities.length === before + births, 'children born while away have real parents');
  const children = w.ecosystem.entities.filter(e => e.parents.length === 2 && e.generation === 1);
  assert(children.length === births && children.every(c => c.civilization === alpha), 'they belong to the nation');
}

section('Save/load: genomes, pregnancy and species survive');
{
  const rng = new SeededRNG('eco-save');
  const sim = createPlanetWorld(rng, { seed: 'eco-save' });
  setActiveRng(rng);
  const deer = sim.ecosystem.speciesCatalog.find(s => s.type === 'herbivore');
  const mom = sim.ecosystem.entities.find(e => e.species === deer && e.sex === 'F');
  const dad = sim.ecosystem.entities.find(e => e.species === deer && e.sex === 'M');
  mom.pregnancy = { embryos: [recombine(mom.genome, dad.genome), recombine(mom.genome, dad.genome)], fatherId: dad.id, timeLeft: 7.5 };
  const data = JSON.parse(JSON.stringify(serializeSim(sim)));
  const restored = restoreSim(data);
  const mom2 = restored.ecosystem.entities.find(e => e.id === mom.id);
  assert(mom2.pregnancy && mom2.pregnancy.embryos.length === 2 && mom2.pregnancy.timeLeft === 7.5, 'a pregnancy survives with its embryos');
  assert(JSON.stringify(mom2.genome) === JSON.stringify(mom.genome) && JSON.stringify(mom2.traits) === JSON.stringify(mom.traits), 'genomes and traits are restored');
  assert(restored.ecosystem.speciesCatalog.length === sim.ecosystem.speciesCatalog.length && restored.ecosystem.registry.nextIndex === sim.ecosystem.registry.nextIndex, 'species and the id counter are restored');
  assert(restored.ecosystem.entities.every(e => e.species && e.species.name), 'every creature points at a restored species');
  assert(JSON.stringify(serializeSim(restored)) === JSON.stringify(data), 'saving a restored world gives identical data');
}

section('Genes: the part genes cover the sprite kit');
{
  assert(Object.keys(PART_COUNTS).length === 9, 'nine body-plan genes (eight body parts and the alien mutation)');
}

summary();
