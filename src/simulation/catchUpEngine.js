// Analytical Catch-Up Simulation Engine for Unloaded Planets & Civilizations
import { getEraForPoints } from '../civilization/techTree.js';
import { random } from './random.js';

export class CatchUpEngine {
  constructor() {}

  // Run deterministic analytical catch-up calculation when an unloaded planet is re-entered
  fastForwardPlanet(sim, deltaYears, rng) {
    if (deltaYears <= 0.1) return null;

    const terrain = sim.terrain;
    const ecosystem = sim.ecosystem;
    const society = sim.society;

    const report = {
      planetName: sim.planet.name,
      yearsElapsed: Math.floor(deltaYears),
      civEvents: [],
      ecoEvents: [],
      tectonicShifts: 0
    };

    // 1. Geological clock (the infinite world has no continental drift)
    terrain.timeAge += deltaYears * 0.001;

    // 2. Civilizations Catch-up
    society.refreshCensus();
    for (const civ of society.civilizations) {
      if (!civ.isAlive) continue;

      // Tech points accumulated
      const techGained = Math.floor(deltaYears * (0.3 + civ.population * 0.02));
      civ.techPoints += techGained;
      // (an era needs materials, buildings and goods as well as research, see techTree.ERA_REQUIREMENTS)
      const before = civ.era;
      if (society.advanceEra(civ)) {
        report.civEvents.push(`"${civ.name}" advanced from ${before.name} to ${civ.era.name}!`);
      }

      // Population dynamics: real couples had real children (with inherited genes) while you were away
      const growthFactor = 0.015 * Math.min(20, deltaYears);
      const births = Math.floor(civ.citizens * growthFactor * (rng ? rng.range(0.8, 1.4) : 1.0));
      ecosystem.breedOffscreen(civ, births);

      // Cataclysm / Collapse check during long unobserved eras
      if (deltaYears > 500 && (rng ? rng.bool(0.15) : random() < 0.15)) {
        civ.collapse(terrain, 'Centuries of Unobserved Cataclysms', ecosystem);
        report.civEvents.push(`"${civ.name}" collapsed into Ancient Ruins after an unobserved dark age.`);
      }
    }

    // Check Ruins Rebirth
    if (society.civilizations.filter(c => c.isAlive).length === 0 && deltaYears > 200) {
      society.checkRuinsRebirth();
      report.civEvents.push(`Nomadic tribes rediscovered the ruins and founded a new civilization.`);
    }

    // 3. Evolution: generations of selection and mutation shape every species, and may split new ones off
    const speciesBefore = ecosystem.speciesCatalog.length;
    const extinctBefore = ecosystem.extinctions.length;
    ecosystem.evolveOffscreen(deltaYears);
    if (ecosystem.speciesCatalog.length > speciesBefore) {
      report.ecoEvents.push(`${ecosystem.speciesCatalog.length - speciesBefore} new species evolved while you were away.`);
    }
    for (const name of ecosystem.extinctions.slice(extinctBefore)) {
      report.ecoEvents.push(`The species "${name}" went extinct during the passage of time.`);
    }

    society.refreshCensus();
    return report;
  }
}

export const catchUpEngine = new CatchUpEngine();
