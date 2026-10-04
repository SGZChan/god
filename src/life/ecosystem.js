import { Entity } from './entity.js';
import { Genome, recombine, traitDistance, derive } from './genome.js';
import { SpeciesRegistry, MATE_THRESHOLD } from './species.js';
import { SpatialGrid } from './spatialGrid.js';
import { AStarPathfinder } from '../ai/pathfinding.js';
import { MAX_CITIZENS } from '../civilization/society.js';
import { random } from '../simulation/random.js';

export const MAX_ENTITIES = 700; // safety limit only; real limits are local crowding and food
const YEARS_PER_SECOND = 0.25; // one simulated year is 4 simulated seconds
const CENSUS_INTERVAL = 3;     // simulated seconds between species censuses

// The first generation. Each planet draws its own random species: body-plan genes (head, body, legs, ears,
// tail, horns, wings, pattern) and colours are random combinations, traits are drawn from a range that
// suits the kind of life.
const SAPIENT_GENES = {
  intelligence: [0.82, 0.95], legs: 1, wings: 0, body: [0, 2], size: [0.35, 0.55], speed: [0.35, 0.55],
  herbivory: [0.5, 0.7], carnivory: [0.3, 0.5], aggression: [0.2, 0.45], sociality: [0.7, 0.95],
  lifespan: [0.7, 0.85], fertility: [0.4, 0.6], perception: [0.4, 0.6], prefTemp: [0.42, 0.58],
  coldTol: [0.45, 0.7], heatTol: [0.45, 0.7], metabolism: [0.4, 0.6]
};
const HERBIVORE_GENES = {
  herbivory: [0.85, 1], carnivory: [0, 0.08], intelligence: [0.1, 0.3], aggression: [0.05, 0.25],
  sociality: [0.6, 0.95], speed: [0.5, 0.8], size: [0.3, 0.9], fertility: [0.5, 0.8], lifespan: [0.2, 0.5],
  perception: [0.5, 0.8], prefTemp: [0.4, 0.6], coldTol: [0.4, 0.8], heatTol: [0.4, 0.8], metabolism: [0.3, 0.7]
};
const PREDATOR_GENES = {
  carnivory: [0.85, 1], herbivory: [0, 0.12], aggression: [0.7, 0.95], speed: [0.55, 0.85], size: [0.45, 0.8],
  sociality: [0.2, 0.6], fertility: [0.45, 0.7], lifespan: [0.3, 0.55], intelligence: [0.3, 0.5],
  perception: [0.65, 0.9], prefTemp: [0.4, 0.6], coldTol: [0.4, 0.8], heatTol: [0.4, 0.8], metabolism: [0.3, 0.7]
};
const OMNIVORE_GENES = {
  herbivory: [0.5, 0.7], carnivory: [0.3, 0.5], size: [0.15, 0.4], speed: [0.5, 0.8], fertility: [0.7, 0.95],
  lifespan: [0.1, 0.3], sociality: [0.4, 0.7], aggression: [0.2, 0.4], intelligence: [0.2, 0.4],
  perception: [0.5, 0.8], prefTemp: [0.4, 0.6], coldTol: [0.4, 0.8], heatTol: [0.4, 0.8], metabolism: [0.4, 0.8]
};
const FOUNDER_PLANS = [
  { genes: SAPIENT_GENES, sapient: true, count: 0 }, // the civilizations raise the sapient founders themselves
  // Each herbivore prefers a different climate band, so they do not all compete for the same ground
  { genes: { ...HERBIVORE_GENES, prefTemp: [0.3, 0.42] }, count: 16 },
  { genes: { ...HERBIVORE_GENES, prefTemp: [0.46, 0.54] }, count: 16 },
  { genes: { ...HERBIVORE_GENES, prefTemp: [0.58, 0.7] }, count: 14 },
  { genes: PREDATOR_GENES, count: 14 },
  { genes: PREDATOR_GENES, count: 14 },
  { genes: OMNIVORE_GENES, count: 10 }
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
    this.worldEvents = [];   // god powers and natural disasters, see god/events.js
    this.worldEventSeq = 0;
    this.censusTimer = 0;
    this.grid = new SpatialGrid(8);
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
      if (plan.count > 0) {
        // Each herd begins somewhere in the start area
        const angle = random() * Math.PI * 2;
        const dist = 15 + random() * 40;
        const spot = this.terrain.findLand(home.x + Math.cos(angle) * dist, home.y + Math.sin(angle) * dist, 60) || home;
        this.spawnFounders(species, plan.count, spot.x, spot.y, template);
      }
    }
  }

  // Places `count` adults (half female, half male) of `species` around (cx, cy). These are the first
  // generation: from here on, creatures only come from mating.
  spawnFounders(species, count, cx, cy, template = null, spread = 6) {
    const base = template || Genome.fromPhenotype(species.centroid);
    const founders = [];
    for (let i = 0; i < count; i++) {
      const spot = this.landNear(cx, cy, spread);
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
        // Entity died: its remains decay gradually before they are removed
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
    if (this.entities.length >= MAX_ENTITIES) return false;
    if (!father.alive || !mother.alive || father.sex !== 'M' || mother.sex !== 'F') return false;
    if (mother.pregnancy || father.mateCooldown > 0 || mother.mateCooldown > 0) return false;
    if (father.isKinOf(mother) || traitDistance(father.traits, mother.traits) > MATE_THRESHOLD) return false;

    const civ = mother.civilization;
    if (civ && civ.citizens >= MAX_CITIZENS) return false;

    // Courtship does not always succeed; well-fed nations have more children, starving ones fewer
    let chance = 0.3 + 0.4 * mother.traits.fertility + 0.2 * (father.traits.sociality + mother.traits.sociality) / 2;
    if (civ) chance *= civ.prosperity;
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
    baby.civilization = mother.civilization;
    this.entities.push(baby);
    this.births++;
    // Too different from every species: it may be the first of a new one
    if (!matched) this.registry.considerFounder(baby, mother.species, this.timeYears, (s, parent) => this.announceSpecies(s, parent));
    // Raising a child costs the nation food
    if (mother.civilization) mother.civilization.food -= 20;
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
    const template = Genome.pure(genes);
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
      if (this.entities.length >= MAX_ENTITIES || civ.citizens + born >= MAX_CITIZENS) break;
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
