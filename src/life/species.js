// Species are not a fixed list. A species is a cluster of interbreeding creatures: a newborn whose
// traits drift too far from its species' centroid founds (or joins) another species, and creatures
// that differ too much cannot mate, so populations that drift apart become reproductively isolated.
import { traitDistance, centroidOf } from './genome.js';
import { makeSpeciesName } from './names.js';

export const SPECIES_THRESHOLD = 0.24; // farther than this from a centroid: a different species
export const MATE_THRESHOLD = 0.28;    // farther than this apart: cannot interbreed
export const MIN_FOUNDING_GROUP = 4;   // divergent creatures needed before a new species is recognised
export const MAX_LIVING_SPECIES = 26;
const MIN_MEMBERS_FOR_CENTROID = 3;

const TYPE_SYMBOLS = { humanoid: '🧑', predator: '🐾', herbivore: '🌿', omnivore: '🍃' };

export class Species {
  constructor({
    id, name, centroid, sapient = false, ancestorId = null, foundedAt = 0, isCustom = false, sheets = null
  }) {
    this.id = id;
    this.name = name;
    this.centroid = centroid;
    this.sapient = sapient;
    this.ancestorId = ancestorId;
    this.foundedAt = foundedAt;     // simulated years
    this.isCustom = isCustom;
    this.sheets = sheets;           // ready-made sprite sheets { M, F, any } (ids or lists of ids), see art/sheetSprites.js; null: drawn from the genes
    this.population = 0;
    this.peakPopulation = 0;
    this.generations = 1;
    this.extinct = false;
    this.extinctAt = null;
  }

  // 'humanoid' (sapient), 'predator', 'herbivore' or 'omnivore'
  get type() {
    const c = this.centroid;
    if (this.sapient) return 'humanoid';
    if (c.carnivory >= 0.6 && c.carnivory > c.herbivory + 0.2) return 'predator';
    if (c.herbivory >= 0.7 && c.carnivory <= 0.3) return 'herbivore';
    return 'omnivore';
  }

  get diet() {
    return this.type === 'predator' ? 'carnivore' : this.type === 'herbivore' ? 'herbivore' : 'omnivore';
  }

  // Emoji fallback for places that cannot show the sprite
  get symbol() {
    return TYPE_SYMBOLS[this.type];
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      centroid: this.centroid,
      sapient: this.sapient,
      ancestorId: this.ancestorId,
      foundedAt: this.foundedAt,
      isCustom: this.isCustom,
      sheets: this.sheets,
      population: this.population,
      peakPopulation: this.peakPopulation,
      generations: this.generations,
      extinct: this.extinct,
      extinctAt: this.extinctAt
    };
  }

  static fromJSON(data) {
    const species = new Species(data);
    species.population = data.population;
    species.peakPopulation = data.peakPopulation;
    species.generations = data.generations;
    species.extinct = data.extinct;
    species.extinctAt = data.extinctAt;
    return species;
  }
}

export class SpeciesRegistry {
  constructor() {
    this.species = [];
    this.nextIndex = 1;
    this.candidates = []; // groups of divergent creatures that may become species
  }

  living() {
    return this.species.filter(s => !s.extinct);
  }

  byId(id) {
    return this.species.find(s => s.id === id) || null;
  }

  // Founds a species from a centroid phenotype (the first generation of a lineage).
  found(centroid, { sapient = false, ancestorId = null, foundedAt = 0, name = null, isCustom = false, sheets = null } = {}) {
    const draft = new Species({ id: 'draft', name: 'draft', centroid, sapient });
    let speciesName = name;
    for (let tries = 0; !speciesName && tries < 20; tries++) {
      const candidate = makeSpeciesName(draft.type);
      if (!this.species.some(s => s.name === candidate)) speciesName = candidate;
    }
    const species = new Species({
      id: `species_${this.nextIndex++}`,
      name: speciesName || makeSpeciesName(draft.type),
      centroid,
      sapient,
      ancestorId,
      foundedAt,
      isCustom,
      sheets
    });
    this.species.push(species);
    return species;
  }

  // Which species does a newborn with `traits` belong to? Usually its parent's, or another existing species
  // it resembles more. Returns null when it has drifted away from every species: such a creature is
  // handed to considerFounder() instead.
  assign(traits, parent) {
    if (traitDistance(traits, parent.centroid) <= SPECIES_THRESHOLD) return parent;
    let best = null;
    let bestDistance = Infinity;
    for (const species of this.species) {
      if (species.extinct) continue;
      const d = traitDistance(traits, species.centroid);
      if (d < bestDistance) {
        best = species;
        bestDistance = d;
      }
    }
    return best && bestDistance <= SPECIES_THRESHOLD ? best : null;
  }

  // A creature that fits no species is the start of a possible new one. Once a small group of similar
  // divergent creatures exists, they found a species together (a lone outlier never does).
  // `onEmerge(newSpecies, parentSpecies)` is called when that happens. Returns the new species or null.
  considerFounder(entity, parent, now, onEmerge) {
    this.candidates = this.candidates.filter(c => c.members.some(m => m.alive));
    let group = this.candidates.find(c => traitDistance(entity.traits, c.centroid) <= SPECIES_THRESHOLD * 0.6);
    if (!group) {
      group = { centroid: { ...entity.traits }, members: [], parent };
      this.candidates.push(group);
    }
    group.members.push(entity);
    const alive = group.members.filter(m => m.alive);
    if (alive.length < MIN_FOUNDING_GROUP || this.living().length >= MAX_LIVING_SPECIES) return null;

    this.candidates.splice(this.candidates.indexOf(group), 1);
    const centroid = centroidOf(alive.map(m => m.traits));
    const sapient = parent.sapient ? centroid.intelligence > 0.55 : centroid.intelligence > 0.9;
    const species = this.found(centroid, { sapient, ancestorId: parent.id, foundedAt: now, sheets: parent.sheets });
    for (const member of alive) member.species = species;
    if (onEmerge) onEmerge(species, parent);
    return species;
  }

  // Moves each species' centroid to the mean of its living members, and updates census figures.
  refresh(entities, now) {
    const groups = new Map();
    for (const entity of entities) {
      if (!entity.alive || !entity.species) continue;
      if (!groups.has(entity.species)) groups.set(entity.species, []);
      groups.get(entity.species).push(entity.traits);
    }
    const newlyExtinct = [];
    for (const species of this.species) {
      const members = groups.get(species) || [];
      species.population = members.length;
      species.peakPopulation = Math.max(species.peakPopulation, members.length);
      if (members.length >= MIN_MEMBERS_FOR_CENTROID) species.centroid = centroidOf(members);
      if (members.length === 0 && !species.extinct && species.peakPopulation > 0) {
        species.extinct = true;
        species.extinctAt = now;
        newlyExtinct.push(species);
      }
    }
    return newlyExtinct;
  }
}
