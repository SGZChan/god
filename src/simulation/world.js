// Builds one planet's simulation (terrain + wildlife + civilizations) from its own RNG stream.
import { PlanetTerrain } from '../planet/terrain.js';
import { Ecosystem } from '../life/ecosystem.js';
import { SocietyManager } from '../civilization/society.js';
import { withRng } from './random.js';

// options: { type, populated, seed, flat }. `seed` drives the terrain (it never touches `rng`, so the
// world looks the same whichever planets were visited first); `rng` drives the living simulation.
export function createPlanetWorld(rng, { type = 'terrestrial', populated = true, seed = 'planet', flat = false } = {}) {
  return withRng(rng, () => {
    const terrain = new PlanetTerrain({ seed, type, flat });
    const ecosystem = new Ecosystem(terrain);
    const society = new SocietyManager(terrain, ecosystem);
    terrain.ecosystem = ecosystem;
    terrain.society = society;

    // Barren planets have no life: no creatures, civs, capitals or borders
    if (!populated) {
      ecosystem.entities = [];
      society.civilizations = [];
      terrain.reset();
    }
    return { terrain, ecosystem, society, rng };
  });
}
