// Pronounceable made-up names for species, clans and people. Uses the simulation RNG, so names are
// reproducible from the world seed.
import { random } from '../simulation/random.js';

const ONSETS = ['b', 'd', 'g', 'h', 'k', 'l', 'm', 'n', 'r', 's', 't', 'v', 'z', 'th', 'sh', 'kr', 'dr', 'br', 'vr', 'gl'];
const VOWELS = ['a', 'e', 'i', 'o', 'u', 'ae', 'ia', 'ou'];
const CODAS = ['', '', '', 'n', 'r', 'l', 'k', 'm', 'x', 'th', 'sh'];

const pick = list => list[Math.floor(random() * list.length)];
const capitalize = word => word.charAt(0).toUpperCase() + word.slice(1);

export function makeName(syllables = 2 + Math.floor(random() * 2)) {
  let name = '';
  for (let i = 0; i < syllables; i++) {
    name += pick(ONSETS) + pick(VOWELS);
    if (i === syllables - 1) name += pick(CODAS);
  }
  return capitalize(name);
}

const KIND_WORDS = {
  humanoid: ['Folk', 'Kin', 'People', 'Tribe'],
  predator: ['Stalker', 'Hunter', 'Fang', 'Prowler'],
  herbivore: ['Grazer', 'Browser', 'Herdbeast', 'Strider'],
  omnivore: ['Forager', 'Scavenger', 'Skitter', 'Gatherer']
};

// "Vorrim Grazer", "Thalu Folk"... `kind` is a Species type.
export function makeSpeciesName(kind) {
  return `${makeName()} ${pick(KIND_WORDS[kind] || KIND_WORDS.omnivore)}`;
}
