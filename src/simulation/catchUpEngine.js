// Catch-up for planets that were not watched while time passed: the years are lived through by simulation/timeSkip.js
// (aging, births and deaths, wildlife, the civilizations' economy, building and exploring), the same as the Skip button.
import { skipTimeSync } from './timeSkip.js';

export class CatchUpEngine {
  // Returns { planetName, yearsElapsed, civEvents[], ecoEvents[] } or null when nothing worth doing passed
  fastForwardPlanet(sim, deltaYears) {
    if (deltaYears <= 0.1) return null;
    const r = skipTimeSync(sim, Math.max(1, Math.round(deltaYears)));
    return { planetName: sim.planet.name, yearsElapsed: Math.floor(deltaYears), civEvents: r.civEvents, ecoEvents: r.ecoEvents, tectonicShifts: 0 };
  }
}

export const catchUpEngine = new CatchUpEngine();
