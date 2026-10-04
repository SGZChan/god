import { assert, section, summary } from './helpers.js';
import { SeededRNG } from '../src/cosmos/seed.js';
import { setActiveRng } from '../src/simulation/random.js';
import {
  Genome, recombine, traitDistance, centroidOf, derive,
  PART_COUNTS, ALL_GENES, BODY_GENES, MUTATION_RATE
} from '../src/life/genome.js';
import { Species, SpeciesRegistry, MATE_THRESHOLD, SPECIES_THRESHOLD, MIN_FOUNDING_GROUP } from '../src/life/species.js';
import { makeName, makeSpeciesName } from '../src/life/names.js';

console.log('====================================================');
console.log('   LIFE TESTS — GENETICS, SPECIES, MATING           ');
console.log('====================================================');
setActiveRng(new SeededRNG('life-tests'));

section('Genome: random genomes');
{
  const g = Genome.random();
  const p = g.phenotype();
  assert(ALL_GENES.every(gene => Array.isArray(g.alleles[gene]) && g.alleles[gene].length === 2), 'every gene has two alleles');
  assert(BODY_GENES.every(gene => Number.isInteger(p[gene]) && p[gene] >= 0 && p[gene] < PART_COUNTS[gene]), 'body-plan genes are valid art variants');
  assert(ALL_GENES.filter(gene => !(gene in PART_COUNTS)).every(gene => p[gene] >= 0 && p[gene] <= 1), 'numeric genes are within [0, 1]');
  const pinned = Genome.random({ legs: 1, size: [0.8, 0.9], head: [2, 3] });
  const pp = pinned.phenotype();
  assert(pp.legs === 1 && pp.size >= 0.8 && pp.size <= 0.9 && pp.head >= 2 && pp.head <= 3, 'genes can be pinned to a value or range');
  const roundTrip = Genome.fromJSON(JSON.parse(JSON.stringify(g)));
  assert(JSON.stringify(roundTrip) === JSON.stringify(g), 'a genome survives a JSON round trip');
}

section('Genome: dominance');
{
  const g = Genome.random();
  g.alleles.ears = [3, 1];
  g.alleles.size = [0.2, 0.6];
  const p = g.phenotype();
  assert(p.ears === 1, 'the lower body-plan variant is dominant');
  assert(Math.abs(p.size - 0.4) < 1e-9, 'numeric genes blend');
}

section('Genome: inheritance without mutation');
{
  const mother = Genome.random();
  const father = Genome.random();
  const children = Array.from({ length: 60 }, () => recombine(mother, father, { mutationRate: 0, strength: 0 }));
  // body-plan mutation is separate; allow for it by checking numeric genes only
  const numeric = ALL_GENES.filter(gene => !(gene in PART_COUNTS));
  const fromParents = children.every(child => numeric.every(gene => {
    const [a, b] = child.alleles[gene];
    return mother.alleles[gene].includes(a) && father.alleles[gene].includes(b);
  }));
  assert(fromParents, 'each allele comes from the matching parent');
  const distinct = new Set(children.map(c => JSON.stringify(c.alleles.size))).size;
  assert(distinct > 1, 'siblings differ from each other (alleles are shuffled)');
}

section('Genome: mutation');
{
  const parent = Genome.random();
  let changed = 0;
  let total = 0;
  for (let i = 0; i < 400; i++) {
    const child = recombine(parent, parent, { mutationRate: 0.5, strength: 0.2 });
    for (const gene of ALL_GENES.filter(g => !(g in PART_COUNTS))) {
      for (let k = 0; k < 2; k++) {
        total++;
        if (!parent.alleles[gene].includes(child.alleles[gene][k])) changed++;
      }
    }
  }
  const rate = changed / total;
  assert(rate > 0.3 && rate < 0.6, `mutation changes about half the alleles at rate 0.5 (${(rate * 100).toFixed(0)}%)`);
  assert(MUTATION_RATE > 0 && MUTATION_RATE < 0.2, 'the default mutation rate is modest');
  const child = recombine(parent, parent, { mutationRate: 1, strength: 5 });
  assert(ALL_GENES.filter(g => !(g in PART_COUNTS)).every(g => child.alleles[g].every(a => a >= 0 && a <= 1)), 'mutated alleles stay in range');
}

section('Genome: distance separates kin from strangers');
{
  const a = Genome.random().phenotype();
  assert(traitDistance(a, a) === 0, 'a creature is at distance 0 from itself');
  const template = Genome.pure();
  const mother = Genome.jittered(template, 0.04);
  const father = Genome.jittered(template, 0.04);
  const siblings = Array.from({ length: 30 }, () => recombine(mother, father).phenotype());
  let kin = 0;
  let strangers = 0;
  for (let i = 0; i < 29; i++) {
    kin += traitDistance(siblings[i], siblings[i + 1]);
    strangers += traitDistance(Genome.random().phenotype(), Genome.random().phenotype());
  }
  kin /= 29;
  strangers /= 29;
  assert(kin < 0.2, `siblings of a founder pair are close (${kin.toFixed(2)})`);
  assert(strangers > 0.5, `unrelated creatures are far apart (${strangers.toFixed(2)})`);
  const x = { ...a, hue: 0.02 };
  const y = { ...a, hue: 0.98 };
  assert(traitDistance(x, y) < traitDistance(x, { ...a, hue: 0.5 }), 'hue distance wraps around the colour wheel');
}

section('Genome: centroid and derived units');
{
  const group = Array.from({ length: 20 }, () => Genome.random({ size: [0.4, 0.6], legs: 2 }).phenotype());
  const c = centroidOf(group);
  assert(c.legs === 2 && c.size > 0.35 && c.size < 0.65, 'the centroid of a group sits inside the group');
  assert(group.every(p => traitDistance(p, c) < 0.9), 'members are not absurdly far from their centroid');

  const small = derive({ ...c, size: 0, speed: 0.5, metabolism: 0.5, lifespan: 0.5, fertility: 0, perception: 0.5, prefTemp: 0.5, coldTol: 0.5, heatTol: 0.5 });
  const big = derive({ ...c, size: 1, speed: 0.5, metabolism: 0.5, lifespan: 0.5, fertility: 1, perception: 0.5, prefTemp: 0.5, coldTol: 0.5, heatTol: 0.5 });
  assert(big.sizeScale > small.sizeScale, 'bigger genes give a bigger creature');
  assert(big.hungerRate > small.hungerRate, 'bigger creatures are hungrier');
  assert(small.litterMax === 1 && big.litterMax === 4, 'fertility sets the litter size (1 to 4)');
  assert(small.maturityYears < small.lifespanYears && small.gestationSec >= 8, 'maturity and gestation are sensible');
}

section('Species: names');
{
  const names = new Set();
  for (let i = 0; i < 200; i++) names.add(makeName());
  assert(names.size > 150, `names are varied (${names.size} of 200 distinct)`);
  assert([...names].every(n => /^[A-Z][a-z]+$/.test(n)), 'names are single capitalised words');
  assert(/^[A-Z][a-z]+ [A-Z][a-z]+$/.test(makeSpeciesName('predator')), 'species names have a kind word');
}

section('Species: type and serialisation');
{
  const reg = new SpeciesRegistry();
  const wolfC = Genome.pure({ carnivory: 0.9, herbivory: 0.1 }).phenotype();
  const deerC = Genome.pure({ carnivory: 0.05, herbivory: 0.95 }).phenotype();
  const bearC = Genome.pure({ carnivory: 0.5, herbivory: 0.5 }).phenotype();
  const wolf = reg.found(wolfC);
  const deer = reg.found(deerC);
  const bear = reg.found(bearC);
  const folk = reg.found(Genome.pure({ intelligence: 0.95 }).phenotype(), { sapient: true });
  assert(wolf.type === 'predator' && wolf.diet === 'carnivore', 'meat eaters are predators');
  assert(deer.type === 'herbivore' && bear.type === 'omnivore', 'plant eaters are herbivores and mixed feeders omnivores');
  assert(folk.type === 'humanoid' && folk.sapient, 'a sapient species is humanoid');
  assert(new Set(reg.species.map(s => s.id)).size === 4 && new Set(reg.species.map(s => s.name)).size === 4, 'ids and names are unique');
  const copy = Species.fromJSON(JSON.parse(JSON.stringify(wolf)));
  assert(copy.type === 'predator' && copy.name === wolf.name && copy.id === wolf.id, 'a species survives a JSON round trip');
}

section('Species: speciation needs a group of divergent creatures');
{
  const reg = new SpeciesRegistry();
  const parent = reg.found(Genome.pure({ size: 0.5, speed: 0.5, prefTemp: 0.5, intelligence: 0.2 }).phenotype());
  const mk = (traits, species = parent) => ({ alive: true, traits, species });
  const near = { ...parent.centroid, size: parent.centroid.size + 0.05 };
  assert(reg.assign(near, parent) === parent, 'a small difference stays in the parent species');

  // every numeric trait flipped to the opposite end: certainly a different kind of creature
  const drifted = Object.fromEntries(Object.entries(parent.centroid).map(([k, v]) => [k, k in PART_COUNTS ? v : 1 - v]));
  assert(reg.assign(drifted, parent) === null, 'a large difference fits no existing species');

  const emerged = [];
  const group = [];
  let founded = null;
  for (let i = 0; i < MIN_FOUNDING_GROUP; i++) {
    const member = mk({ ...drifted, size: Math.min(1, drifted.size + i * 0.01) });
    group.push(member);
    founded = reg.considerFounder(member, parent, 100 + i, (s, from) => emerged.push([s, from]));
    if (i < MIN_FOUNDING_GROUP - 1) assert(founded === null && reg.species.length === 1, `${i + 1} divergent creature(s) are not yet a species`);
  }
  assert(founded && emerged.length === 1 && emerged[0][1] === parent, `${MIN_FOUNDING_GROUP} similar divergent creatures found a species together`);
  assert(founded.ancestorId === parent.id && founded.foundedAt === 103, 'the new species remembers its ancestor and birth time');
  assert(group.every(m => m.species === founded), 'the founders were moved into the new species');
  assert(reg.assign({ ...drifted, size: Math.min(1, drifted.size + 0.02) }, parent) === founded, 'a similar newborn now simply joins the new species');
  assert(!founded.sapient, 'a species that is not clever is not sapient');

  const loner = mk({ ...drifted, prefTemp: 0.99, herbivory: 0.5, carnivory: 0.5, size: Math.abs(drifted.size - 0.5) < 0.2 ? 0.02 : 0.5, aggression: drifted.aggression > 0.5 ? 0 : 1 });
  assert(reg.considerFounder(loner, parent, 200) === null && reg.species.length === 2, 'a lone outlier never founds a species');

  // Sapience is inherited while the lineage stays clever, lost when it does not, and can be gained
  const sapientReg = new SpeciesRegistry();
  const folk = sapientReg.found(Genome.pure({ intelligence: 0.9 }).phenotype(), { sapient: true });
  let dull = null;
  for (let i = 0; i < MIN_FOUNDING_GROUP; i++) {
    dull = sapientReg.considerFounder(mk({ ...folk.centroid, intelligence: 0.1, size: 0.05, speed: 0.95, herbivory: 0.9, carnivory: 0.0, prefTemp: 0.1 }, folk), folk, 5) || dull;
  }
  assert(dull && !dull.sapient, 'descendants that lose their intelligence are no longer sapient');
  const apeReg = new SpeciesRegistry();
  const apes = apeReg.found(Genome.pure({ intelligence: 0.2 }).phenotype());
  let uplift = null;
  for (let i = 0; i < MIN_FOUNDING_GROUP; i++) {
    uplift = apeReg.considerFounder(mk({ ...apes.centroid, intelligence: 0.97, size: 0.95, speed: 0.1, herbivory: 0.2, carnivory: 0.9, prefTemp: 0.9 }, apes), apes, 5) || uplift;
  }
  assert(uplift && uplift.sapient, 'a very clever new species becomes sapient');
}

section('Species: mating compatibility is tied to the threshold');
{
  const a = Genome.pure({ size: 0.5 }).phenotype();
  const siblingLike = { ...a, size: 0.55 };
  const stranger = Genome.pure().phenotype();
  assert(traitDistance(a, siblingLike) < MATE_THRESHOLD, 'close relatives can mate');
  assert(traitDistance(a, stranger) > MATE_THRESHOLD, 'unrelated creatures cannot');
  assert(MATE_THRESHOLD > SPECIES_THRESHOLD, 'mating tolerance is slightly wider than the species boundary');
}

section('Species: census, centroids and extinction');
{
  const reg = new SpeciesRegistry();
  const sp = reg.found(Genome.pure({ size: 0.5 }).phenotype());
  const members = Array.from({ length: 6 }, (_, i) => ({ alive: true, species: sp, traits: { ...sp.centroid, size: 0.6 } }));
  const extinct = reg.refresh(members, 50);
  assert(sp.population === 6 && sp.peakPopulation === 6 && extinct.length === 0, 'the census counts living members');
  assert(Math.abs(sp.centroid.size - 0.6) < 1e-9, 'the centroid follows the population');
  members.forEach(m => { m.alive = false; });
  const gone = reg.refresh(members, 99);
  assert(gone.length === 1 && sp.extinct && sp.extinctAt === 99, 'a species with no living members goes extinct');
  assert(reg.refresh(members, 120).length === 0, 'extinction is reported once');
}

summary();
