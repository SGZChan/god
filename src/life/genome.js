// Diploid genomes: every gene has two alleles, one from each parent. Offspring are made by
// recombination (one allele from each parent per gene) plus mutation. The phenotype (the traits a
// creature actually shows) is computed from the allele pairs: numeric genes blend (codominant), body-plan
// genes use the lower-numbered allele (so a rarer variant only shows when both alleles carry it, as a
// recessive trait does).
import { random } from '../simulation/random.js';

// Number of art variants for each body-plan gene (the sprite kit must provide at least this many).
export const PART_COUNTS = { body: 5, head: 6, legs: 5, ears: 5, tail: 5, horns: 5, wings: 4, pattern: 5 };
export const BODY_GENES = Object.keys(PART_COUNTS);
export const COLOR_GENES = ['hue', 'sat', 'light', 'hue2', 'eyeHue'];
export const TRAIT_GENES = [
  'size', 'speed', 'metabolism', 'coldTol', 'heatTol', 'prefTemp', 'lifespan', 'fertility',
  'aggression', 'sociality', 'intelligence', 'perception', 'herbivory', 'carnivory'
];
export const ALL_GENES = [...BODY_GENES, ...COLOR_GENES, ...TRAIT_GENES];

export const MUTATION_RATE = 0.08;     // chance that an inherited allele mutates
export const MUTATION_STRENGTH = 0.12; // typical size of a numeric mutation
export const PART_MUTATION_RATE = 0.015; // chance a body-plan allele switches to another variant

const clamp01 = v => Math.max(0, Math.min(1, v));
// Roughly bell-shaped noise in [-1, 1]
const noise = () => random() + random() - 1;

export class Genome {
  constructor(alleles) {
    this.alleles = alleles; // { gene: [a, b] }
  }

  // A random genome. `fixed` pins genes: a number pins both alleles, [min, max] draws from that range.
  static random(fixed = {}) {
    const alleles = {};
    for (const gene of ALL_GENES) {
      alleles[gene] = [Genome.drawAllele(gene, fixed[gene]), Genome.drawAllele(gene, fixed[gene])];
    }
    return new Genome(alleles);
  }

  // Both alleles of every gene set from a phenotype (e.g. a species centroid).
  static fromPhenotype(phenotype) {
    const alleles = {};
    for (const gene of ALL_GENES) alleles[gene] = [phenotype[gene], phenotype[gene]];
    return new Genome(alleles);
  }

  // A species template: both alleles of every gene are the same, so individuals made from it with
  // Genome.jittered() resemble each other. `fixed` works as in random().
  static pure(fixed = {}) {
    const alleles = {};
    for (const gene of ALL_GENES) {
      const value = Genome.drawAllele(gene, fixed[gene]);
      alleles[gene] = [value, value];
    }
    return new Genome(alleles);
  }

  static drawAllele(gene, spec) {
    const isPart = gene in PART_COUNTS;
    if (spec === undefined) return isPart ? Math.floor(random() * PART_COUNTS[gene]) : random();
    if (Array.isArray(spec)) {
      const [lo, hi] = spec;
      return isPart ? lo + Math.floor(random() * (hi - lo + 1)) : lo + random() * (hi - lo);
    }
    return spec;
  }

  // Another individual of the same kind: same genes with a little individual variation.
  static jittered(template, amount = 0.03) {
    const alleles = {};
    for (const gene of ALL_GENES) {
      alleles[gene] = template.alleles[gene].map(a => (gene in PART_COUNTS ? a : clamp01(a + noise() * amount)));
    }
    return new Genome(alleles);
  }

  static fromJSON(data) {
    const alleles = {};
    for (const gene of ALL_GENES) alleles[gene] = [...data[gene]];
    return new Genome(alleles);
  }

  toJSON() {
    return this.alleles;
  }

  // The traits this genome produces.
  phenotype() {
    const traits = {};
    for (const gene of ALL_GENES) {
      const [a, b] = this.alleles[gene];
      traits[gene] = gene in PART_COUNTS ? Math.min(a, b) : (a + b) / 2;
    }
    return traits;
  }
}

function mutateAllele(gene, allele, rate, strength) {
  if (gene in PART_COUNTS) {
    return random() < PART_MUTATION_RATE ? Math.floor(random() * PART_COUNTS[gene]) : allele;
  }
  return random() < rate ? clamp01(allele + noise() * strength) : allele;
}

// A child's genome: one random allele from each parent per gene, then mutation.
export function recombine(mother, father, { mutationRate = MUTATION_RATE, strength = MUTATION_STRENGTH } = {}) {
  const alleles = {};
  for (const gene of ALL_GENES) {
    const fromMother = mother.alleles[gene][random() < 0.5 ? 0 : 1];
    const fromFather = father.alleles[gene][random() < 0.5 ? 0 : 1];
    alleles[gene] = [
      mutateAllele(gene, fromMother, mutationRate, strength),
      mutateAllele(gene, fromFather, mutationRate, strength)
    ];
  }
  return new Genome(alleles);
}

// ---------- comparing creatures ----------

const DISTANCE_WEIGHTS = {
  size: 1, speed: 0.8, metabolism: 0.4, coldTol: 0.7, heatTol: 0.7, prefTemp: 1, lifespan: 0.5,
  fertility: 0.3, aggression: 0.8, sociality: 0.5, intelligence: 1.2, perception: 0.3,
  herbivory: 1, carnivory: 1, hue: 0.6, sat: 0.2, light: 0.2
};
const WEIGHT_SUM = Object.values(DISTANCE_WEIGHTS).reduce((a, b) => a + b, 0);
const PART_MISMATCH_COST = 0.06;

// How different two phenotypes are: about 0.03 for siblings, about 0.8 for unrelated random creatures.
// Used to decide who can mate and which species a creature belongs to.
export function traitDistance(a, b) {
  let sum = 0;
  for (const gene in DISTANCE_WEIGHTS) {
    let d = Math.abs(a[gene] - b[gene]);
    if (gene === 'hue') d = Math.min(d, 1 - d) * 2; // hue wraps around
    sum += DISTANCE_WEIGHTS[gene] * d * d;
  }
  let mismatches = 0;
  for (const gene of BODY_GENES) if (a[gene] !== b[gene]) mismatches++;
  return Math.sqrt(sum / WEIGHT_SUM) + mismatches * PART_MISMATCH_COST;
}

// Mean phenotype of several creatures (numeric genes averaged, body-plan genes by majority).
export function centroidOf(phenotypes) {
  const centroid = {};
  for (const gene of ALL_GENES) {
    if (gene in PART_COUNTS) {
      const votes = new Map();
      for (const p of phenotypes) votes.set(p[gene], (votes.get(p[gene]) || 0) + 1);
      let best = 0;
      let bestVotes = -1;
      for (const [variant, count] of votes) {
        if (count > bestVotes || (count === bestVotes && variant < best)) {
          best = variant;
          bestVotes = count;
        }
      }
      centroid[gene] = best;
    } else if (gene === 'hue') {
      // average on the colour wheel
      let x = 0;
      let y = 0;
      for (const p of phenotypes) {
        x += Math.cos(p.hue * Math.PI * 2);
        y += Math.sin(p.hue * Math.PI * 2);
      }
      centroid.hue = (Math.atan2(y, x) / (Math.PI * 2) + 1) % 1;
    } else {
      centroid[gene] = phenotypes.reduce((sum, p) => sum + p[gene], 0) / phenotypes.length;
    }
  }
  return centroid;
}

// ---------- real-world units ----------

// One simulated year is 4 simulated seconds (see Entity.update).
export function derive(traits) {
  const sizeScale = 0.45 + traits.size * 1.55;
  const speedMult = Math.max(0.4, Math.min(2, 0.55 + traits.speed * 1.2 - (sizeScale - 1) * 0.15));
  const lifespanYears = (6 + traits.lifespan * 84) * (1.15 - traits.metabolism * 0.3);
  return {
    sizeScale,
    speedMult,
    lifespanYears,
    maturityYears: lifespanYears * 0.2,
    gestationSec: Math.max(8, Math.min(30, 6 + lifespanYears * 0.12)),
    litterMax: 1 + Math.floor(traits.fertility * 3.99),
    hungerRate: 0.4 * (0.6 + sizeScale * 0.35 + speedMult * 0.25 + traits.metabolism * 0.4),
    perceptionRange: 5 + traits.perception * 10,
    idealTemp: 0.15 + traits.prefTemp * 0.7,
    coldTolerance: 0.08 + traits.coldTol * 0.3,
    heatTolerance: 0.08 + traits.heatTol * 0.3
  };
}
