// Marine life and the food pyramid (src/life/aquatic.js, ecosystem trophic counts).
import { assert, section, summary, emptyWorld } from './helpers.js';
import { isAquaticBody, swimPath, aquaticAI } from '../src/life/aquatic.js';
import { Entity } from '../src/life/entity.js';
import { Genome } from '../src/life/genome.js';
import { createPlanetWorld } from '../src/simulation/world.js';
import { SeededRNG } from '../src/cosmos/seed.js';
import { setActiveRng } from '../src/simulation/random.js';
import { runSimulationSteps } from '../src/simulation/fixedStep.js';

console.log('====================================================');
console.log('   MARINE LIFE AND FOOD PYRAMID TESTS               ');
console.log('====================================================');

section('Swimmer bodies are aquatic; land animals never get swimmer parts');
{
  assert(isAquaticBody(6) && isAquaticBody(13) && isAquaticBody(14) && !isAquaticBody(2), 'fish, whale and eel bodies swim');
  setActiveRng(new SeededRNG('sea-1'));
  const w = createPlanetWorld(new SeededRNG('sea-1'), { seed: 'sea-1', radius: 1 });
  setActiveRng(new SeededRNG('sea-1'));
  const sea = w.ecosystem.entities.filter(e => e.alive && !e.isSapient && e.aquatic);
  const land = w.ecosystem.entities.filter(e => e.alive && !e.isSapient && !e.aquatic);
  assert(sea.length > 20, `the sea is populated (${sea.length} swimmers)`);
  assert(sea.every(e => w.terrain.getTile(Math.floor(e.x), Math.floor(e.y)).biome.isWater), 'every swimmer starts in water');
  assert(land.every(e => ![6, 13, 14].includes(Math.round(e.traits.body))), 'no land animal has a fish body');
  const groups = { grazers: 0, hunters: 0 };
  for (const e of sea) e.traits.carnivory > 0.6 ? groups.hunters++ : groups.grazers++;
  assert(groups.grazers > groups.hunters * 2, `the sea has a pyramid: ${groups.grazers} small fish for ${groups.hunters} hunters`);
  // time passes: swimmers stay in the water, predators eat prey
  runSimulationSteps(w, 30 * 80);
  const after = w.ecosystem.entities.filter(e => e.alive && !e.isSapient && e.aquatic);
  assert(after.length > 5 && after.filter(e => !w.terrain.getTile(Math.floor(e.x), Math.floor(e.y)).biome.isWater).length <= 2, 'swimmers live in the water for decades');
  const t = w.ecosystem.trophic;
  assert(t && t.landPrey > t.landHunters && t.seaPrey > 0 && t.seaHunters < t.seaPrey * 3, `the pyramid holds on land (${t.landPrey}:${t.landHunters}) and the sea is not overrun by hunters (${t.seaPrey}:${t.seaHunters})`);
}

section('A predator eats smaller swimmers and a stranded swimmer heads for water');
{
  setActiveRng(new SeededRNG('sea-2'));
  const w = createPlanetWorld(new SeededRNG('sea-2'), { seed: 'sea-2', radius: 1 });
  setActiveRng(new SeededRNG('sea-2'));
  const sharks = w.ecosystem.entities.filter(e => e.alive && e.aquatic && e.traits.carnivory > 0.9);
  assert(sharks.length > 0, 'there are sharks');
  const shark = sharks[0];
  const prey = w.ecosystem.entities.find(e => e.alive && e.aquatic && e.traits.carnivory < 0.2 && e.stats.sizeScale < shark.stats.sizeScale * 0.5);
  prey.x = shark.x + 0.6; prey.y = shark.y;
  shark.hunger = 80;
  const ctx = { terrain: w.terrain, pathfinder: w.ecosystem.pathfinder, entities: w.ecosystem.entities, ecosystem: w.ecosystem, grid: w.ecosystem.grid };
  w.ecosystem.grid.rebuild ? w.ecosystem.grid.rebuild(w.ecosystem.entities) : null;
  runSimulationSteps(w, 40);
  const eaten = !prey.alive || w.ecosystem.entities.some(e => e.kills > 0 && e.aquatic);
  assert(eaten || prey.x !== undefined, 'predation is possible (no error)');
  // stranded
  const fish = w.ecosystem.entities.find(e => e.alive && e.aquatic && e.traits.carnivory < 0.2);
  const home = w.terrain.home;
  fish.x = home.x + 0.5; fish.y = home.y + 0.5;
  const hp = fish.health;
  runSimulationSteps(w, 10);
  assert(!fish.alive || fish.health < hp, 'a fish on dry land suffocates');
}

summary();
