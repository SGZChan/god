// Seeded random source for everything that affects simulation state.
// Each planet owns a SeededRNG stream; the game activates the stream of the planet
// it is simulating, so the same seed always produces the same world no matter which
// planets were visited first. Purely cosmetic randomness (particles, textures) may
// keep using Math.random().
import { SeededRNG } from '../cosmos/seed.js';

let active = new SeededRNG('default-simulation');

export function random() {
  return active.next();
}

export function getActiveRng() {
  return active;
}

export function setActiveRng(rng) {
  active = rng;
}

// Runs fn with `rng` active, then restores the previous stream.
export function withRng(rng, fn) {
  const previous = active;
  active = rng;
  try {
    return fn();
  } finally {
    active = previous;
  }
}
