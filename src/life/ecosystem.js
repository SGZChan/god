import { Entity } from './entity.js';
import { Genome, recombine, traitDistance, derive } from './genome.js';
import { SpeciesRegistry, MATE_THRESHOLD } from './species.js';
import { SpatialGrid } from './spatialGrid.js';
import { AStarPathfinder } from '../ai/pathfinding.js';
import { MAX_CITIZENS } from '../civilization/society.js';
import { popCap } from '../civilization/settlements.js';
import { random } from '../simulation/random.js';
import { isAquaticBody } from './aquatic.js';

export const MAX_ENTITIES = 1100; // safety limit only; real limits are local crowding and food
export const MAX_ANIMALS = 560;  // wildlife stops breeding at this many animals, so a growing society never crowds nature out (nor the reverse)
const YEARS_PER_SECOND = 0.25; // one simulated year is 4 simulated seconds
const CENSUS_INTERVAL = 3;     // simulated seconds between species censuses

// The first generation. Each planet draws its own random species: body-plan genes (head, body, legs, ears,
// tail, horns, wings, pattern) and colours are random combinations, traits are drawn from a range that
// suits the kind of life.
const SAPIENT_GENES = {
  intelligence: [0.82, 0.95], legs: 1, wings: 0,
  // each planet's people look like people, beastfolk, elf-ears or dragonkin: a random mix of the people body plans
  head: { oneOf: [6, 7, 8, 11, 12, 13, 19] }, body: { oneOf: [2, 5, 5, 9, 10] }, ears: { oneOf: [0, 1, 5, 6, 8] }, tail: { oneOf: [0, 4, 6] }, horns: { oneOf: [0, 0, 1, 2, 7] }, size: [0.35, 0.55], speed: [0.35, 0.55],
  herbivory: [0.5, 0.7], carnivory: [0.3, 0.5], aggression: [0.2, 0.45], sociality: [0.7, 0.95],
  lifespan: [0.7, 0.85], fertility: [0.4, 0.6], perception: [0.4, 0.6], prefTemp: [0.42, 0.58],
  coldTol: [0.45, 0.7], heatTol: [0.45, 0.7], metabolism: [0.4, 0.6]
};
// land animals never get swimmer parts (fish bodies, shark and whale heads, fins)
const LAND_PARTS = { body: { oneOf: [0, 1, 2, 3, 4, 7, 8] }, head: { oneOf: [0, 1, 2, 3, 4, 5, 9] }, ears: { oneOf: [0, 1, 2, 3, 4, 5, 7, 8] }, tail: { oneOf: [0, 1, 2, 3, 4, 6, 7, 8] }, horns: { oneOf: [0, 1, 2, 3, 4, 5, 6, 7] }, legs: { oneOf: [0, 1, 2, 3, 4, 5] } };
const HERBIVORE_GENES = {
  ...LAND_PARTS,
  herbivory: [0.85, 1], carnivory: [0, 0.08], intelligence: [0.1, 0.3], aggression: [0.05, 0.25],
  sociality: [0.6, 0.95], speed: [0.5, 0.8], size: [0.3, 0.9], fertility: [0.5, 0.8], lifespan: [0.2, 0.5],
  perception: [0.5, 0.8], prefTemp: [0.4, 0.6], coldTol: [0.4, 0.8], heatTol: [0.4, 0.8], metabolism: [0.3, 0.7]
};
const PREDATOR_GENES = {
  ...LAND_PARTS,
  carnivory: [0.85, 1], herbivory: [0, 0.12], aggression: [0.7, 0.95], speed: [0.55, 0.85], size: [0.45, 0.8],
  sociality: [0.2, 0.6], fertility: [0.45, 0.7], lifespan: [0.3, 0.55], intelligence: [0.3, 0.5],
  perception: [0.65, 0.9], prefTemp: [0.4, 0.6], coldTol: [0.4, 0.8], heatTol: [0.4, 0.8], metabolism: [0.3, 0.7]
};
const OMNIVORE_GENES = {
  ...LAND_PARTS,
  herbivory: [0.5, 0.7], carnivory: [0.3, 0.5], size: [0.15, 0.4], speed: [0.5, 0.8], fertility: [0.7, 0.95],
  lifespan: [0.1, 0.3], sociality: [0.4, 0.7], aggression: [0.2, 0.4], intelligence: [0.2, 0.4],
  perception: [0.5, 0.8], prefTemp: [0.4, 0.6], coldTol: [0.4, 0.8], heatTol: [0.4, 0.8], metabolism: [0.4, 0.8]
};
// Wildlife with their own look. Deer and rabbits graze, bears eat anything; the 'alien' beasts carry a mutation from the start
const DEER_GENES = { ...HERBIVORE_GENES, head: 14, body: { oneOf: [1, 4] }, legs: 7, ears: 5, tail: 1, horns: { oneOf: [5, 5, 0] }, wings: 0, size: [0.4, 0.7], speed: [0.65, 0.9], prefTemp: [0.35, 0.55] };
const RABBIT_GENES = { ...HERBIVORE_GENES, head: 15, body: 0, legs: 2, ears: 7, tail: { oneOf: [1, 7] }, horns: 0, wings: 0, size: [0.08, 0.22], fertility: [0.8, 1], lifespan: [0.1, 0.25] };
const BEAR_GENES = { ...OMNIVORE_GENES, head: 16, body: 2, legs: 2, ears: 2, tail: 1, horns: 0, wings: 0, size: [0.6, 0.9], aggression: [0.4, 0.7], fertility: [0.3, 0.5], lifespan: [0.4, 0.6] };
const ALIEN_GENES = {
  ...OMNIVORE_GENES, head: { oneOf: [17, 18] }, body: { oneOf: [11, 12] }, legs: { oneOf: [7, 8] }, ears: 0, tail: { oneOf: [0, 8] }, horns: { oneOf: [0, 4] },
  wings: { oneOf: [0, 6] }, mutation: { oneOf: [1, 2, 3, 4, 5, 6, 7] }, size: [0.2, 0.5], intelligence: [0.3, 0.5]
};
// A food pyramid: many grazers, fewer mid-sized hunters, a handful of apex predators. Their numbers are kept in
// proportion by prey supply (tryConceive).
const FOX_GENES = { ...PREDATOR_GENES, head: 1, body: 0, legs: 2, ears: 1, tail: 3, horns: 0, wings: 0, size: [0.15, 0.3], aggression: [0.5, 0.7], speed: [0.65, 0.85], fertility: [0.55, 0.75], lifespan: [0.2, 0.35] };
const APEX_GENES = { ...PREDATOR_GENES, head: 1, body: 2, legs: 2, ears: 5, tail: 6, horns: 0, wings: 0, pattern: 3, size: [0.78, 0.95], aggression: [0.8, 0.95], speed: [0.7, 0.9], fertility: [0.3, 0.45], lifespan: [0.45, 0.65], carnivory: [0.92, 1] };
// The sea. Swimmer body plans (body 6, 13, 14) live only in water, see life/aquatic.js. Cold and heat hardly matter there.
const SEA = { coldTol: [0.8, 1], heatTol: [0.8, 1], prefTemp: [0.4, 0.6], wings: 0, ears: 0, legs: 0, horns: 0, intelligence: [0.1, 0.3] };
const MINNOW_GENES = { ...HERBIVORE_GENES, ...SEA, body: 6, head: 10, tail: 5, pattern: { oneOf: [0, 2, 3] }, size: [0.04, 0.1], herbivory: [0.9, 1], carnivory: [0, 0.05], fertility: [0.85, 1], lifespan: [0.1, 0.2], sociality: [0.8, 1], speed: [0.6, 0.8] };
const REEF_GENES = { ...OMNIVORE_GENES, ...SEA, body: 6, head: 10, tail: 5, pattern: { oneOf: [2, 3, 4] }, size: [0.12, 0.25], herbivory: [0.6, 0.8], carnivory: [0.2, 0.4], fertility: [0.7, 0.9], lifespan: [0.15, 0.3] };
const TUNA_GENES = { ...PREDATOR_GENES, ...SEA, body: 6, head: 10, tail: 10, horns: 8, pattern: 1, size: [0.28, 0.45], carnivory: [0.75, 0.9], herbivory: [0, 0.1], aggression: [0.5, 0.7], fertility: [0.6, 0.8], lifespan: [0.25, 0.4] };
const EEL_GENES = { ...PREDATOR_GENES, ...SEA, body: 14, head: 22, tail: 5, pattern: 3, size: [0.2, 0.35], carnivory: [0.7, 0.85], herbivory: [0, 0.15], fertility: [0.5, 0.7], lifespan: [0.3, 0.45] };
const SHARK_GENES = { ...PREDATOR_GENES, ...SEA, body: 6, head: 20, tail: 10, horns: 8, pattern: 1, size: [0.7, 0.9], carnivory: [0.92, 1], herbivory: [0, 0.05], aggression: [0.8, 0.95], fertility: [0.25, 0.4], lifespan: [0.5, 0.7] };
const WHALE_GENES = { ...HERBIVORE_GENES, ...SEA, body: 13, head: 21, tail: 9, pattern: 1, size: [0.92, 1], herbivory: [0.8, 0.95], carnivory: [0.02, 0.1], aggression: [0.05, 0.15], fertility: [0.2, 0.3], lifespan: [0.8, 0.95], speed: [0.4, 0.55], sociality: [0.6, 0.8] };
const FOUNDER_PLANS = [
  { genes: SAPIENT_GENES, sapient: true, count: 0 }, // the civilizations raise the sapient founders themselves
  // Each herbivore prefers a different climate band, so they do not all compete for the same ground
  { genes: { ...HERBIVORE_GENES, prefTemp: [0.3, 0.42] }, count: 16 },
  { genes: { ...HERBIVORE_GENES, prefTemp: [0.46, 0.54] }, count: 16 },
  { genes: { ...HERBIVORE_GENES, prefTemp: [0.58, 0.7] }, count: 14 },
  { genes: PREDATOR_GENES, count: 8 },
  { genes: PREDATOR_GENES, count: 8 },
  { genes: OMNIVORE_GENES, count: 10 },
  { genes: FOX_GENES, count: 8 },
  { genes: APEX_GENES, count: 6 },
  { genes: DEER_GENES, count: 14 },
  { genes: RABBIT_GENES, count: 16 },
  { genes: BEAR_GENES, count: 8 },
  { genes: ALIEN_GENES, count: 8 },
  // the sea (fish, hunters, sharks, whales, eels)
  { genes: MINNOW_GENES, count: 44, aquatic: true },
  { genes: REEF_GENES, count: 20, aquatic: true },
  { genes: TUNA_GENES, count: 5, aquatic: true },
  { genes: EEL_GENES, count: 4, aquatic: true },
  { genes: SHARK_GENES, count: 3, aquatic: true },
  { genes: WHALE_GENES, count: 4, aquatic: true }
];

export class Ecosystem {
  constructor(terrain) {
    this.terrain = terrain;
    this.pathfinder = new AStarPathfinder(terrain);
    this.entities = [];
    this.registry = new SpeciesRegistry();
    this.extinctions = [];
    this.notifications = [];
    this.births = 0;
    this.deaths = 0;
    this.timeYears = 0;
    this.warFx = [];         // attacks to draw (arrows, shells, lasers...): the renderer takes them each frame
    this.worldEvents = [];   // god powers and natural disasters, see god/events.js
    this.worldEventSeq = 0;
    this.censusTimer = 0;
    this.grid = new SpatialGrid(8);
    this.byId = new Map();  // entity id -> entity (rebuilt every step)
    this.sapientCount = 0;  // living and dead sapient bodies in `entities` (refreshed every step)
    this.society = null; // set by SocietyManager so new humans can be assigned a civilization

    this.initFauna();
  }

  get speciesCatalog() {
    return this.registry.species;
  }

  set speciesCatalog(list) {
    this.registry.species = list;
  }

  // The species that builds civilizations (null on a world without one)
  sapientSpecies() {
    return this.registry.living().find(s => s.sapient) || null;
  }

  // ---------- the first generation ----------

  initFauna() {
    const home = this.terrain.home;
    for (const plan of FOUNDER_PLANS) {
      const template = Genome.pure(plan.genes);
      const species = this.registry.found(template.phenotype(), { sapient: Boolean(plan.sapient), foundedAt: 0 });
      if (plan.count > 0 && plan.aquatic) {
        // a school begins in the sea nearest the start area, and more of its kind in other waters
        for (let k = 0; k < 3; k++) {
          const water = this.findWater(home.x, home.y, k === 0 ? 150 : 260);
          if (water) this.spawnFounders(species, k === 0 ? plan.count : Math.max(3, Math.round(plan.count * 0.5)), water.x, water.y, template, 5);
        }
      } else if (plan.count > 0) {
        // Each herd begins somewhere in the start area
        const angle = random() * Math.PI * 2;
        const dist = 15 + random() * 40;
        const spot = this.terrain.findLand(home.x + Math.cos(angle) * dist, home.y + Math.sin(angle) * dist, 60) || home;
        this.spawnFounders(species, plan.count, spot.x, spot.y, template);
        // ... and the same kind roams farther lands too, so the whole continent is not empty (hunters and herders
        // need game beyond the first valley). These are founders as well: after this, animals only come from mating.
        for (let k = 0; k < 2; k++) {
          const a2 = random() * Math.PI * 2;
          const d2 = 70 + random() * 110;
          const far = this.terrain.findLand(home.x + Math.cos(a2) * d2, home.y + Math.sin(a2) * d2, 40);
          if (far) this.spawnFounders(species, Math.max(6, Math.round(plan.count * 0.6)), far.x, far.y, template);
        }
      }
    }
  }

  // Places `count` adults (half female, half male) of `species` around (cx, cy). These are the first
  // generation: from here on, creatures only come from mating.
  spawnFounders(species, count, cx, cy, template = null, spread = 6) {
    const base = template || Genome.fromPhenotype(species.centroid);
    const founders = [];
    for (let i = 0; i < count; i++) {
      const spot = isAquaticBody(species.centroid.body) ? this.waterNear(cx, cy, spread) : this.landNear(cx, cy, spread);
      if (!spot) continue;
      const entity = new Entity({
        species,
        genome: Genome.jittered(base, 0.03),
        sex: i % 2 === 0 ? 'F' : 'M',
        x: spot.x + 0.5,
        y: spot.y + 0.5
      });
      this.entities.push(entity);
      if (this.society) this.society.assignCitizen(entity);
      founders.push(entity);
    }
    this.registry.refresh(this.entities, this.timeYears);
    return founders;
  }

  // Open water (ocean or shallows with water all round) near (x, y), found by sampling rings outward
  findWater(x, y, maxR = 200) {
    for (let attempt = 0; attempt < 90; attempt++) {
      const a = random() * Math.PI * 2;
      const d = 6 + random() * maxR;
      const wx = Math.floor(x + Math.cos(a) * d);
      const wy = Math.floor(y + Math.sin(a) * d);
      if (!this.terrain.inBounds(wx, wy)) continue;
      let wet = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (this.terrain.inBounds(wx + dx, wy + dy) && this.terrain.getTile(wx + dx, wy + dy).biome.isWater) wet++;
      if (wet >= 20) return { x: wx, y: wy };
    }
    return null;
  }

  waterNear(cx, cy, spread) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const x = Math.floor(cx + (random() - 0.5) * 2 * spread);
      const y = Math.floor(cy + (random() - 0.5) * 2 * spread);
      if (this.terrain.inBounds(x, y) && this.terrain.getTile(x, y).biome.isWater) return { x, y };
    }
    return null;
  }

  landNear(cx, cy, spread) {
    for (let attempt = 0; attempt < 30; attempt++) {
      const x = Math.floor(cx + (random() - 0.5) * 2 * spread);
      const y = Math.floor(cy + (random() - 0.5) * 2 * spread);
      if (this.terrain.isBuildable(x, y) && !this.terrain.isSolid(x, y)) return { x, y };
    }
    return null;
  }

  // A founder of the sapient species at a civilization's capital (the first settlers).
  spawnCitizen(civ, radius = 4) {
    const species = this.sapientSpecies();
    if (!species || this.entities.length >= MAX_ENTITIES) return null;
    const females = this.entities.filter(e => e.alive && e.civilization === civ && e.sex === 'F').length;
    const males = this.entities.filter(e => e.alive && e.civilization === civ && e.sex === 'M').length;
    const spot = this.landNear(civ.capitalX, civ.capitalY, radius);
    if (!spot) return null;
    const entity = new Entity({
      species,
      genome: Genome.jittered(Genome.fromPhenotype(species.centroid), 0.03),
      sex: females <= males ? 'F' : 'M',
      x: spot.x + 0.5,
      y: spot.y + 0.5
    });
    entity.civilization = civ;
    this.entities.push(entity);
    this.byId.set(entity.id, entity);
    species.population++;
    return entity;
  }

  // God powers place a creature where the player clicks (customConfig.x / y), otherwise near home.
  spawnRandomEntity(species, isSpecial = false, customConfig = {}) {
    if (!species) return null;
    const home = this.terrain.home;
    const spot = this.landNear(home.x, home.y, 45) || home;
    const entity = new Entity({
      species,
      x: spot.x + 0.5,
      y: spot.y + 0.5,
      isSpecialIndividual: isSpecial,
      ...customConfig
    });
    this.entities.push(entity);
    species.population++;
    if (this.society) this.society.assignCitizen(entity);
    return entity;
  }

  // ---------- the passage of time ----------

  update(dt, speedMultiplier) {
    const sim = dt * Math.max(1, speedMultiplier);
    this.timeYears += sim * YEARS_PER_SECOND;
    this.grid.rebuild(this.entities);
    this.byId.clear();
    let sapients = 0;
    for (const e of this.entities) {
      this.byId.set(e.id, e);
      if (e.isSapient) sapients++;
    }
    this.sapientCount = sapients;

    const worldContext = {
      terrain: this.terrain,
      pathfinder: this.pathfinder,
      entities: this.entities,
      ecosystem: this,
      grid: this.grid
    };

    // Update active entities & decay fallen entities
    for (let i = this.entities.length - 1; i >= 0; i--) {
      const ent = this.entities[i];
      if (ent.alive) {
        ent.update(dt, speedMultiplier, worldContext);
      } else {
        // Entity died: its remains decay gradually before they are removed. A citizen's body (ent.corpse) waits for the
        // family: it is carried (and moves with its bearer), laid out indoors, buried, or lost if nobody comes.
        const cp = ent.corpse;
        if (cp) {
          if (cp.state === 'buried') { this.entities.splice(i, 1); continue; }
          if (cp.state === 'carried') {
            const bearer = this.byId.get(cp.carrierId);
            if (bearer && bearer.alive) { ent.x = bearer.x; ent.y = bearer.y; continue; }
            cp.state = 'lying';
            cp.carrierId = null;
          }
          if (cp.state === 'laid_out' || cp.state === 'rite') {
            // (a body at the place of healing or at the grave is cared for: it does not decay for a good while)
            ent.decayTimer = Math.max(ent.decayTimer, 40);
            continue;
          }
        }
        ent.decayTimer = (ent.decayTimer !== undefined ? ent.decayTimer : 0) - sim;
        if (ent.decayTimer <= 0) {
          this.deaths++;
          this.entities.splice(i, 1);
        }
      }
    }

    this.censusTimer += sim;
    if (this.censusTimer >= CENSUS_INTERVAL) {
      this.censusTimer = 0;
      this.takeCensus();
    }
  }

  // Recounts every species, moves their centroids, and reports species that have died out.
  takeCensus() {
    // the food pyramid, counted: grazers and small fry at the bottom, hunters above
    const t = { landPrey: 0, landHunters: 0, seaPrey: 0, seaHunters: 0, whales: 0 };
    for (const e of this.entities) {
      if (!e.alive || e.isSapient) continue;
      const hunter = e.traits.carnivory > 0.6;
      if (e.aquatic) { if (hunter) t.seaHunters++; else t.seaPrey++; }
      else if (hunter) t.landHunters++;
      else t.landPrey++;
    }
    this.trophic = t;
    const newlyExtinct = this.registry.refresh(this.entities, this.timeYears);
    for (const species of this.registry.species) species.generations = 1;
    for (const e of this.entities) {
      if (e.alive && e.species && e.generation + 1 > e.species.generations) e.species.generations = e.generation + 1;
    }
    for (const species of newlyExtinct) {
      this.extinctions.push(species.name);
      this.notifications.unshift({
        text: `💀 Extinction Event: The species "${species.name}" has vanished from the planet.`,
        time: Date.now()
      });
    }
  }

  // ---------- reproduction ----------

  // A courting pair that meets may conceive. The mother carries the embryos for a gestation period.
  tryConceive(father, mother) {
    // sapients and animals have separate ceilings (MAX_ANIMALS counts only the animals)
    // (a species you created, or any species with few members left, may always breed: the cap is for crowded wildlife)
    const protectedKind = mother.species && (mother.species.isCustom || mother.species.population < 40);
    if (this.entities.length >= MAX_ENTITIES || (!mother.isSapient && !protectedKind && this.entities.length - this.sapientCount >= MAX_ANIMALS)) return false;
    if (!father.alive || !mother.alive || father.sex !== 'M' || mother.sex !== 'F') return false;
    if (mother.pregnancy || father.mateCooldown > 0 || mother.mateCooldown > 0) return false;
    if (father.isKinOf(mother) || traitDistance(father.traits, mother.traits) > MATE_THRESHOLD) return false;

    const civ = mother.civilization;
    if (civ && civ.citizens >= this.populationCap(civ)) return false;
    // Sapients who court become a pair bond (long-term mates); a bonded person only conceives with the partner
    if (mother.isSapient) {
      if ((father.mateId && father.mateId !== mother.id) || (mother.mateId && mother.mateId !== father.id)) return false;
      father.mateId = mother.id;
      mother.mateId = father.id;
    }

    // Courtship does not always succeed; well-fed nations have more children, starving ones fewer
    let chance = 0.3 + 0.4 * mother.traits.fertility + 0.2 * (father.traits.sociality + mother.traits.sociality) / 2;
    if (civ) chance *= civ.prosperity;
    // the food pyramid: hunters breed only as far as their prey allows (about one hunter per five prey animals; a species down to a handful is never held back)
    if (!mother.isSapient && mother.traits.carnivory > 0.6 && !(mother.species && mother.species.population < (mother.aquatic ? 6 : 22))) {
      const t = this.trophic;
      if (t) {
        const sea = mother.aquatic;
        const prey = sea ? t.seaPrey : t.landPrey;
        const hunters = Math.max(1, sea ? t.seaHunters : t.landHunters);
        chance *= Math.max(0.45, Math.min(1, prey / (hunters * 5)));
        if (sea && prey < hunters * 2) return false; // too few small fish left to feed another hunter
      }
    }
    father.mateCooldown = 3;
    if (random() > chance) return false;

    const litter = 1 + Math.floor(random() * mother.stats.litterMax);
    mother.pregnancy = {
      embryos: Array.from({ length: litter }, () => recombine(mother.genome, father.genome)),
      fatherId: father.id,
      timeLeft: mother.stats.gestationSec
    };
    father.mateCooldown = 6 + mother.stats.gestationSec * 0.3;
    return true;
  }

  // How many citizens a civilization can have: limited by its housing (see civilization/settlements.js popCap);
  // a civilization without settlements (a bare test world) keeps the old flat limit.
  populationCap(civ) {
    if (civ.settlements && civ.settlements.length) return popCap(this.terrain, civ);
    return MAX_CITIZENS;
  }

  giveBirth(mother) {
    const pregnancy = mother.pregnancy;
    mother.pregnancy = null;
    mother.mateCooldown = mother.stats.gestationSec + 6;
    const father = this.entities.find(e => e.id === pregnancy.fatherId) || null;
    const babies = [];
    for (const genome of pregnancy.embryos) {
      if (this.entities.length >= MAX_ENTITIES) break;
      babies.push(this.bear(mother, father, genome));
    }
    if (babies.length && mother.isSapient) {
      this.notifications.unshift({
        text: `👶 ${mother.name} gave birth${babies.length > 1 ? ` to ${babies.length} children` : ''}.`,
        minor: true,
        time: Date.now()
      });
    }
    return babies;
  }

  // Creates one newborn from `genome`. It joins its mother's species unless it has drifted far enough
  // from it to found or join another one.
  bear(mother, father, genome) {
    const traits = genome.phenotype();
    const matched = this.registry.assign(traits, mother.species);
    const baby = new Entity({
      species: matched || mother.species,
      genome,
      x: mother.x + (random() - 0.5),
      y: mother.y + (random() - 0.5),
      age: 0,
      hunger: 10,
      parents: [mother.id, father ? father.id : 'unknown'],
      motherId: mother.id,
      generation: Math.max(mother.generation, father ? father.generation : 0) + 1
    });
    baby.homeX = mother.homeX;
    baby.homeY = mother.homeY;
    if (mother.penId) baby.penId = mother.penId; // born in the pen, belongs to it
    baby.civilization = mother.civilization;
    // A child belongs to its mother's clan (its father's if she has none), settlement and household
    baby.clanId = mother.clanId || (father && father.clanId) || null;
    baby.settlementId = mother.settlementId;
    baby.homeId = mother.homeId;
    this.entities.push(baby);
    this.byId.set(baby.id, baby);
    this.births++;
    // Too different from every species: it may be the first of a new one
    if (!matched) this.registry.considerFounder(baby, mother.species, this.timeYears, (s, parent) => this.announceSpecies(s, parent));
    // (raising a child costs food because children eat from the settlement's stores, see civilization/families.js)
    return baby;
  }

  announceSpecies(species, parent) {
    this.notifications.unshift({
      text: `🧬 A new species has emerged: "${species.name}", descended from the ${parent.name}.`,
      time: Date.now()
    });
  }

  // A species designed in the God Workshop: the sliders become genes, the body parts are random.
  createCustomSpecies(config) {
    const clamp01 = v => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0.5));
    const diet = config.diet || 'omnivore';
    const sapient = config.type === 'humanoid';
    const genes = {
      size: clamp01((parseFloat(config.size) - 0.45) / 1.55),
      speed: clamp01((parseFloat(config.speed) - 0.55) / 1.2),
      lifespan: clamp01((parseFloat(config.lifespan) - 6) / 84),
      coldTol: clamp01(parseFloat(config.coldResist)),
      heatTol: clamp01(parseFloat(config.heatResist)),
      herbivory: diet === 'carnivore' ? 0.05 : diet === 'herbivore' ? 0.95 : 0.6,
      carnivory: diet === 'carnivore' ? 0.95 : diet === 'herbivore' ? 0.05 : 0.5,
      intelligence: sapient ? 0.9 : 0.25
    };
    if (sapient) Object.assign(genes, { legs: 1, wings: 0 });
    // `look` pins the body-plan and colour genes chosen in the workshop preview
    const template = Genome.pure({ ...(config.look || {}), ...genes });
    const species = this.registry.found(template.phenotype(), {
      sapient,
      name: config.name || null,
      isCustom: true,
      foundedAt: this.timeYears
    });
    this.notifications.unshift({
      text: `✨ Divine Creation: You engineered a new species "${species.name}"!`,
      time: Date.now()
    });
    return species;
  }

  registerCustomSpecies(newSpecies) {
    this.registry.species.push(newSpecies);
    this.notifications.unshift({
      text: `✨ Divine Creation: You engineered a new species "${newSpecies.name}"!`,
      time: Date.now()
    });
  }

  // ---------- time that passes while nobody is watching ----------

  // Children born to a civilization while the player was away (full genetics, real parents).
  breedOffscreen(civ, count) {
    const adults = this.entities.filter(e => e.alive && e.civilization === civ && e.isAdult && e.stage !== 'elder');
    const mothers = adults.filter(e => e.sex === 'F');
    const fathers = adults.filter(e => e.sex === 'M');
    let born = 0;
    for (let i = 0; i < count && mothers.length && fathers.length; i++) {
      if (this.entities.length >= MAX_ENTITIES || civ.citizens + born >= this.populationCap(civ)) break;
      for (let attempt = 0; attempt < 12; attempt++) {
        const mother = mothers[Math.floor(random() * mothers.length)];
        const father = fathers[Math.floor(random() * fathers.length)];
        if (mother.isKinOf(father) || traitDistance(mother.traits, father.traits) > MATE_THRESHOLD) continue;
        const baby = this.bear(mother, father, recombine(mother.genome, father.genome));
        baby.age = random() * baby.stats.maturityYears * 1.2; // some of them have grown up since
        born++;
        break;
      }
    }
    return born;
  }

  // Generations of evolution while the player was away: each species is replaced by offspring of
  // its better-adapted members, so populations drift and adapt to their climate even offscreen.
  evolveOffscreen(deltaYears) {
    const groups = new Map();
    for (const e of this.entities) {
      if (!e.alive || e.isSpecialIndividual) continue;
      if (!groups.has(e.species)) groups.set(e.species, []);
      groups.get(e.species).push(e);
    }

    for (const [, members] of groups) {
      if (members.length < 4) continue;
      const lifespan = members.reduce((sum, m) => sum + m.stats.lifespanYears, 0) / members.length;
      const generations = Math.min(25, Math.floor(deltaYears / Math.max(5, lifespan * 0.5)));
      if (generations < 1) continue;

      let pool = members.map(m => m.genome);
      const fitness = (genome, tile) => {
        const stats = this.statsFor(genome);
        const t = tile.temperature;
        const excess = t < stats.idealTemp ? (stats.idealTemp - t) - stats.coldTolerance : (t - stats.idealTemp) - stats.heatTolerance;
        return Math.exp(-Math.max(0, excess) * 6);
      };
      for (let g = 0; g < generations; g++) {
        const next = [];
        for (let i = 0; i < members.length; i++) {
          const tile = this.terrain.getTile(Math.floor(members[i].x), Math.floor(members[i].y));
          const weights = pool.map(genome => fitness(genome, tile));
          const total = weights.reduce((a, b) => a + b, 0);
          const pick = () => {
            let r = random() * total;
            for (let k = 0; k < pool.length; k++) {
              r -= weights[k];
              if (r <= 0) return pool[k];
            }
            return pool[pool.length - 1];
          };
          next.push(recombine(pick(), pick()));
        }
        pool = next;
      }
      members.forEach((member, i) => {
        member.setGenome(pool[i]);
        member.age = random() * member.stats.lifespanYears * 0.6;
        const matched = this.registry.assign(member.traits, member.species);
        if (matched) member.species = matched;
        else this.registry.considerFounder(member, member.species, this.timeYears, (s, parent) => this.announceSpecies(s, parent));
      });
    }
    this.takeCensus();
  }

  statsFor(genome) {
    return derive(genome.phenotype());
  }
}
