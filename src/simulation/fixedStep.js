// Fixed-timestep driver for the agent-level simulation (creatures + civilizations).
// The speed multiplier means MORE steps per frame, never a larger dt, so behaviour
// is identical at every speed.

export const SIM_STEP = 0.05;           // simulated seconds per step (20 Hz)
export const MAX_STEPS_PER_FRAME = 60;  // hard cap: top speed is about 180x at 60 fps
const EPSILON = 1e-9;                   // absorbs float error in the accumulator

export class FixedStepper {
  constructor(step = SIM_STEP, maxSteps = MAX_STEPS_PER_FRAME) {
    this.step = step;
    this.maxSteps = maxSteps;
    this.accumulator = 0;
  }

  // Returns how many fixed steps to run for this frame.
  advance(frameDt, speed) {
    if (speed <= 0) return 0;
    this.accumulator += frameDt * speed;
    let steps = Math.floor(this.accumulator / this.step + EPSILON);
    if (steps > this.maxSteps) {
      steps = this.maxSteps;
      this.accumulator = 0; // drop the backlog instead of spiralling
    } else {
      this.accumulator = Math.max(0, this.accumulator - steps * this.step);
    }
    return steps;
  }

  reset() {
    this.accumulator = 0;
  }
}

// Converts a chance that was tuned "per frame at 60 fps" into a chance per dt seconds.
export function scaleChance(chancePer60Hz, dt) {
  return Math.min(1, chancePer60Hz * dt * 60);
}

// Runs up to `steps` fixed steps. Stops early if the time budget is exceeded
// (remaining steps are dropped so the page never freezes). Returns steps run.
export function runSimulationSteps(sim, steps, { budgetMs = Infinity, now = () => performance.now() } = {}) {
  const start = now();
  let done = 0;
  for (let i = 0; i < steps; i++) {
    if (i > 0 && now() - start > budgetMs) break;
    sim.ecosystem.update(SIM_STEP, 1);
    sim.society.update(SIM_STEP, 1);
    const fx = sim.effects || (sim.terrain && sim.terrain.effects);
    if (fx) fx.update(SIM_STEP);
    done++;
  }
  return done;
}
