// Livestock (src/civilization/livestock.js) and the herder job: taming, penning, breeding, slaughter for meat.
import { assert, section, summary, emptyWorld, addCiv } from './helpers.js';
import { penAnimals, tameable, livestockAI, PEN_CAPACITY } from '../src/civilization/livestock.js';
import { setActiveRng, random } from '../src/simulation/random.js';
import { SeededRNG } from '../src/cosmos/seed.js';

console.log('====================================================');
console.log('   LIVESTOCK TESTS                                  ');
console.log('====================================================');

setActiveRng(new SeededRNG('livestock'));
const w = emptyWorld();
const civ = addCiv(w, 'Pastoria', 60, 40, 6);
for (const b of w.terrain.buildings.values()) if (b.civId === civ.id) w.terrain.advanceConstruction(b.id, 1e9);
const st = civ.settlements[0];
const pen = w.terrain.placeBuilding('pen', st.x + 6, st.y + 3, { civId: civ.id, progress: 1 });
pen.settlementId = st.id;
// a herd of wild grazers nearby (founders of a grazing species)
const grazer = w.ecosystem.speciesCatalog.find(s => !s.sapient && s.centroid.carnivory < 0.3);
w.ecosystem.spawnFounders(grazer, 8, st.x + 14, st.y + 4, null, 3);
const ctx = () => ({ terrain: w.terrain, pathfinder: w.ecosystem.pathfinder, entities: w.ecosystem.entities, ecosystem: w.ecosystem, grid: w.ecosystem.grid });

section('Tameable animals');
{
  const wild = w.ecosystem.entities.filter(e => e.species === grazer);
  assert(wild.some(tameable), 'adult grazers can be tamed');
  assert(!w.ecosystem.entities.some(e => e.isSapient && tameable(e)), 'people cannot');
}

section('A herder tames wild grazers into the pen');
{
  const herder = w.ecosystem.entities.filter(e => e.civilization === civ && e.isAdult).sort((a, b) => a.age - b.age)[0];
  herder.job = 'herder';
  st.assignTimer = 1e9;
  for (let i = 0; i < 3000 && penAnimals(w.ecosystem, pen).length < 2; i++) {
    w.ecosystem.update(0.05, 1);
    w.society.update(0.05, 1);
    if (herder.job !== 'herder') herder.job = 'herder';
  }
  const herd = penAnimals(w.ecosystem, pen);
  assert(herd.length >= 2, `animals were led into the pen (${herd.length})`);
}

section('Penned animals stay in the pen');
{
  const a = penAnimals(w.ecosystem, pen)[0];
  a.x = pen.x - 6; a.y = pen.y - 6; a.path = [];
  livestockAI(a, ctx(), random);
  const goal = a.path[a.path.length - 1];
  assert(goal && goal.x >= pen.x && goal.x <= pen.x + pen.w && goal.y >= pen.y && goal.y <= pen.y + pen.h, 'an animal outside its pen heads back in');
  const lost = w.terrain.removeBuilding(pen.id, { ruins: false });
  const keep = a.penId;
  livestockAI(a, ctx(), random);
  assert(a.penId === null && keep !== null, 'when the pen is gone the animal turns feral');
  a.penId = keep;
}

section('Surplus animals are slaughtered for meat');
{
  const w2 = emptyWorld();
  const civ2 = addCiv(w2, 'Butcheria', 60, 40, 6);
  for (const b of w2.terrain.buildings.values()) if (b.civId === civ2.id) w2.terrain.advanceConstruction(b.id, 1e9);
  const st2 = civ2.settlements[0];
  const pen2 = w2.terrain.placeBuilding('pen', st2.x + 6, st2.y + 3, { civId: civ2.id, progress: 1 });
  pen2.settlementId = st2.id;
  const g2 = w2.ecosystem.speciesCatalog.find(s => !s.sapient && s.centroid.carnivory < 0.3);
  const herd = w2.ecosystem.spawnFounders(g2, PEN_CAPACITY + 3, pen2.x + 1, pen2.y + 1, null, 1);
  for (const a of herd) a.penId = pen2.id;
  const herder = w2.ecosystem.entities.filter(e => e.civilization === civ2 && e.isAdult).sort((a, b) => a.age - b.age)[0];
  herder.job = 'herder';
  st2.assignTimer = 1e9;
  const meat0 = st2.stock.meat || 0;
  for (let i = 0; i < 4000 && (st2.stock.meat || 0) <= meat0; i++) {
    w2.ecosystem.update(0.05, 1);
    w2.society.update(0.05, 1);
    if (herder.job !== 'herder') herder.job = 'herder';
  }
  assert((st2.stock.meat || 0) > meat0, `meat from the herd reached the stores (${Math.round((st2.stock.meat || 0) * 10) / 10})`);
  for (let i = 0; i < 8000 && penAnimals(w2.ecosystem, pen2).length > PEN_CAPACITY; i++) {
    w2.ecosystem.update(0.05, 1);
    w2.society.update(0.05, 1);
    if (herder.job !== 'herder') herder.job = 'herder';
  }
  assert(penAnimals(w2.ecosystem, pen2).length <= PEN_CAPACITY, `the surplus was culled down to the pen's size (${penAnimals(w2.ecosystem, pen2).length})`);
}

section('Calves born in a pen belong to it');
{
  const a = w.ecosystem.entities.find(e => e.species === grazer && e.sex === 'F');
  const b = w.ecosystem.entities.find(e => e.species === grazer && e.sex === 'M');
  a.penId = 9999;
  const genome = a.genome;
  const baby = w.ecosystem.bear(a, b, genome);
  assert(baby.penId === 9999, 'the calf has the pen of its mother');
}

summary();
