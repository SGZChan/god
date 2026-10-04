# Phase 1: Make the Simulation Real — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the civilization, creature and war systems so they actually interact, give wars an ending, and make simulation behaviour identical at every time speed.

**Architecture:** Humans get a `civilization` reference (assigned by territory/nearest capital). Civ population becomes a census of living citizens, with births and famine acting on real entities. Wars gain a duration, surrender conditions and a truce. Creatures and civs advance in fixed 0.05 s steps driven by a `FixedStepper`; the time-speed buttons change how many steps run per frame, never the step size.

**Tech Stack:** Vanilla JS ES modules, Vite 8, Node scripts for tests (plain `assert` helper, no framework).

**Spec:** `docs/superpowers/specs/2026-10-04-simulation-persistence-ui-design.md` (Phase 1). Phases 2 (determinism and persistence) and 3 (UI) get their own plans after this one ships, because both build on the code changed here.

## Global Constraints

- Keep the existing dark glass look; this plan does not touch visuals except one tooltip string.
- Existing `tests/qa_test.js` (10 tests) must keep passing after every task.
- Fixed step is **0.05 s** (20 Hz). Max **60** steps per frame (top speed about 180x at 60 fps). A per-frame time budget may drop steps rather than freeze the page.
- Geology (`terrain.update`) is NOT moved to the fixed step. It keeps `update(dt, timeSpeed)` once per frame, so 10,000x tectonic drift still works.
- Probabilities that were "per frame at 60 fps" are converted with `scaleChance(p, dt)` so they scale with simulated time.
- Do not add dependencies.
- This folder is **not currently a git repository**. If it is still not one when you execute, skip every "Commit" step. If you want them, run `git init` and make an initial commit before Task 1 (add a `.gitignore` containing `node_modules` and `dist`).

## File Structure

| File | Responsibility |
|---|---|
| `src/simulation/fixedStep.js` (create) | `FixedStepper`, `runSimulationSteps`, `scaleChance`, step constants |
| `src/civilization/society.js` (modify) | Constants, citizen assignment, census, births/famine, war resolution, rebirth wiring |
| `src/life/ecosystem.js` (modify) | `society` link, `spawnCitizen`, citizen inheritance on birth, `MAX_ENTITIES`, rate scaling |
| `src/simulation/catchUpEngine.js` (modify) | Births become real citizens instead of editing a number |
| `src/main.js` (modify) | Drive the fixed-step loop, reset stepper on planet switch |
| `index.html` (modify) | Tooltip for the 10,000x button |
| `tests/helpers.js` (create) | `assert`, `section`, `summary`, world builders |
| `tests/phase1_test.js` (create) | All Phase 1 tests |
| `package.json` (modify) | `test` script |

---

### Task 1: Fixed-step module and test harness

**Files:**
- Create: `src/simulation/fixedStep.js`
- Create: `tests/helpers.js`
- Create: `tests/phase1_test.js`
- Modify: `package.json` (scripts)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `SIM_STEP` (number, 0.05), `MAX_STEPS_PER_FRAME` (number, 60)
  - `class FixedStepper { constructor(step?, maxSteps?); advance(frameDt: number, speed: number): number; reset(): void }`
  - `scaleChance(chancePer60Hz: number, dt: number): number`
  - `runSimulationSteps(sim: {ecosystem, society}, steps: number, opts?: {budgetMs?: number, now?: () => number}): number` (returns steps actually run)
  - `tests/helpers.js`: `assert(cond, msg)`, `section(title)`, `summary()`

- [ ] **Step 1: Create the test helpers**

Create `tests/helpers.js`:

```js
// Minimal shared test helpers for the Phase 1+ test files.
let passed = 0;
let failed = 0;

export function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

export function section(title) {
  console.log(`\n${title}`);
}

export function summary() {
  console.log('\n====================================================');
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('====================================================\n');
  if (failed > 0) process.exit(1);
  console.log('🎯 ALL PHASE 1 TESTS PASSED!');
}
```

- [ ] **Step 2: Write the failing fixed-step tests**

Create `tests/phase1_test.js`:

```js
import { assert, section, summary } from './helpers.js';
import {
  SIM_STEP,
  MAX_STEPS_PER_FRAME,
  FixedStepper,
  scaleChance,
  runSimulationSteps
} from '../src/simulation/fixedStep.js';

console.log('====================================================');
console.log('   PHASE 1 TESTS — SIMULATION FIXES                 ');
console.log('====================================================');

section('Fixed step: step counts are independent of frame rate and speed');
{
  const slow = new FixedStepper();
  let slowSteps = 0;
  for (let f = 0; f < 640; f++) slowSteps += slow.advance(1 / 64, 1); // 10 s at 1x
  const fast = new FixedStepper();
  let fastSteps = 0;
  for (let f = 0; f < 64; f++) fastSteps += fast.advance(1 / 64, 10); // 1 s at 10x
  assert(SIM_STEP === 0.05, 'SIM_STEP is 0.05');
  assert(slowSteps === 200, `10 s at 1x runs 200 steps (got ${slowSteps})`);
  assert(fastSteps === 200, `1 s at 10x runs 200 steps (got ${fastSteps})`);
  assert(new FixedStepper().advance(1 / 60, 0) === 0, 'speed 0 runs no steps');
}

section('Fixed step: cap prevents a spiral of death');
{
  const stepper = new FixedStepper();
  assert(stepper.advance(1 / 60, 10000) === MAX_STEPS_PER_FRAME, `10000x is capped at ${MAX_STEPS_PER_FRAME} steps/frame`);
  assert(stepper.advance(0, 1) === 0, 'excess time is dropped, not carried over');
}

section('Fixed step: scaleChance converts per-frame odds to per-step odds');
{
  assert(Math.abs(scaleChance(0.2, 0.05) - 0.6) < 1e-9, 'a 0.2 per-frame chance becomes 0.6 per 0.05 s step');
  assert(scaleChance(0.5, 1) === 1, 'scaled chance is clamped to 1');
  assert(Math.abs(scaleChance(0.2, 1 / 60) - 0.2) < 1e-9, 'at 60 Hz the chance is unchanged');
}

section('Fixed step: runSimulationSteps drives ecosystem and society');
{
  const calls = [];
  const sim = {
    ecosystem: { update: (dt, speed) => calls.push(['eco', dt, speed]) },
    society: { update: (dt, speed) => calls.push(['soc', dt, speed]) }
  };
  const done = runSimulationSteps(sim, 3);
  assert(done === 3, 'runs the requested number of steps');
  assert(calls.length === 6, 'each step updates ecosystem then society');
  assert(calls[0][0] === 'eco' && calls[0][1] === SIM_STEP && calls[0][2] === 1, 'ecosystem gets (SIM_STEP, 1)');
  assert(calls[1][0] === 'soc' && calls[1][1] === SIM_STEP && calls[1][2] === 1, 'society gets (SIM_STEP, 1)');

  let t = 0;
  const fakeNow = () => { const v = t; t += 2; return v; }; // each call advances 2 ms
  const budgeted = runSimulationSteps(sim, 10, { budgetMs: 5, now: fakeNow });
  assert(budgeted === 3, `time budget stops early (ran ${budgeted} of 10)`);
}

summary();
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node tests/phase1_test.js`
Expected: FAIL with an import error (`Cannot find module '.../src/simulation/fixedStep.js'`).

- [ ] **Step 4: Implement the module**

Create `src/simulation/fixedStep.js`:

```js
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
    done++;
  }
  return done;
}
```

- [ ] **Step 5: Add the npm test script**

In `package.json`, add to `"scripts"`:

```json
    "test": "node tests/qa_test.js && node tests/phase1_test.js",
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `node tests/phase1_test.js`
Expected: all PASS, ending with `ALL PHASE 1 TESTS PASSED!`

- [ ] **Step 7: Commit (skip if not a git repo)**

```bash
git add src/simulation/fixedStep.js tests/helpers.js tests/phase1_test.js package.json
git commit -m "feat: add fixed-step driver and phase 1 test harness"
```

---

### Task 2: Citizen assignment

**Files:**
- Modify: `src/life/ecosystem.js` (constructor, `spawnRandomEntity`, `attemptBreeding`, new `spawnCitizen`, `MAX_ENTITIES`)
- Modify: `src/civilization/society.js` (constants, constructor, `initDefaultCivs`, `collapse`, new methods)
- Modify: `tests/helpers.js` (world builders)
- Modify: `tests/phase1_test.js`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces:
  - `society.js` exports `INITIAL_CITIZENS` (6)
  - `Ecosystem#society` (set by `SocietyManager`), `Ecosystem#spawnCitizen(civ, radius = 4): Entity | null`
  - `SocietyManager#assignCitizen(entity): Civilization | null`, `#reassignUnaffiliated(): void`, `#spawnCitizens(civ, count): number`
  - `tests/helpers.js`: `defaultWorld(opts?)`, `emptyWorld(opts?)`, `addCiv(world, name, cx, cy, citizens = 6)`, `addHuman(world, civ, x, y, role = 'CITIZEN')`, `liveCitizens(world, civ)`

- [ ] **Step 1: Add the world builders to the helpers**

Add to the top of `tests/helpers.js` (imports) and the bottom (functions):

```js
import { PlanetTerrain } from '../src/planet/terrain.js';
import { BIOMES } from '../src/planet/biomes.js';
import { Ecosystem } from '../src/life/ecosystem.js';
import { Entity } from '../src/life/entity.js';
import { SocietyManager, Civilization } from '../src/civilization/society.js';
```

```js
// A flat grassland world with the real default setup (3 civs, wildlife, humans).
export function defaultWorld({ width = 60, height = 40 } = {}) {
  const terrain = new PlanetTerrain(width, height);
  for (const tile of terrain.grid) {
    tile.biome = BIOMES.GRASSLAND;
    tile.elevation = 0.5;
    tile.flora = 60;
  }
  const ecosystem = new Ecosystem(terrain);
  const society = new SocietyManager(terrain, ecosystem);
  terrain.ecosystem = ecosystem;
  terrain.society = society;
  return { terrain, ecosystem, society };
}

// Same flat world with no creatures, no civs and no structures, for controlled tests.
export function emptyWorld(opts) {
  const world = defaultWorld(opts);
  world.ecosystem.entities = [];
  world.society.civilizations = [];
  for (const tile of world.terrain.grid) {
    tile.structure = null;
    tile.civId = null;
  }
  return world;
}

export function addCiv(world, name, cx, cy, citizens = 6) {
  const civ = new Civilization({ name, capitalX: cx, capitalY: cy, population: 45 });
  world.terrain.getTile(cx, cy).structure = { type: 'capital', name: `${name} Keep`, health: 300 };
  world.society.civilizations.push(civ);
  world.society.spawnCitizens(civ, citizens);
  return civ;
}

export function addHuman(world, civ, x, y, role = 'CITIZEN') {
  const species = world.ecosystem.speciesCatalog.find(s => s.id === 'species_human');
  const entity = new Entity({ species, x, y, role });
  entity.civilization = civ;
  world.ecosystem.entities.push(entity);
  return entity;
}

export function liveCitizens(world, civ) {
  return world.ecosystem.entities.filter(e => e.alive && e.civilization === civ).length;
}
```

- [ ] **Step 2: Write the failing tests**

In `tests/phase1_test.js`, extend the imports:

```js
import { addCiv, addHuman, defaultWorld, emptyWorld, liveCitizens } from './helpers.js';
import { INITIAL_CITIZENS } from '../src/civilization/society.js';
import { Entity } from '../src/life/entity.js';
```

Add this block above the final `summary();` line:

```js
section('Citizen assignment: territory owner beats nearest capital');
{
  const w = emptyWorld();
  const alpha = addCiv(w, 'Alpha', 10, 20, 0);
  const beta = addCiv(w, 'Beta', 50, 20, 0);

  const near = addHuman(w, null, 12.5, 20.5);
  w.society.assignCitizen(near);
  assert(near.civilization === alpha, 'unowned tile: human joins the nearest capital');

  const border = addHuman(w, null, 12.5, 20.5);
  w.terrain.getTile(12, 20).civId = beta.id;
  w.society.assignCitizen(border);
  assert(border.civilization === beta, 'owned tile: human joins the tile owner even if another capital is closer');

  const deer = new Entity({ species: w.ecosystem.speciesCatalog.find(s => s.id === 'species_deer'), x: 12.5, y: 20.5 });
  assert(w.society.assignCitizen(deer) === null && deer.civilization === null, 'wildlife never joins a civilization');
}

section('Citizen assignment: collapse releases members');
{
  const w = emptyWorld();
  const alpha = addCiv(w, 'Alpha', 10, 20, 0);
  const h = addHuman(w, alpha, 11.5, 20.5);
  alpha.collapse(w.terrain, 'test', w.ecosystem);
  assert(h.civilization === null, 'members become unaffiliated when their civ collapses');
}

section('Citizen assignment: babies inherit the parent civilization');
{
  const w = emptyWorld();
  const alpha = addCiv(w, 'Alpha', 20, 20, 0);
  addHuman(w, alpha, 20.5, 20.5);
  addHuman(w, alpha, 21.5, 20.5);
  for (let i = 0; i < 500 && w.ecosystem.entities.length <= 2; i++) w.ecosystem.attemptBreeding();
  const baby = w.ecosystem.entities[2];
  assert(Boolean(baby), 'breeding produced a baby');
  assert(baby && baby.civilization === alpha, 'baby belongs to its parents\' civilization');
}

section('Citizen assignment: default world setup');
{
  const w = defaultWorld();
  const humans = w.ecosystem.entities.filter(e => e.species.type === 'humanoid');
  assert(w.society.civilizations.length > 0, 'default world has civilizations');
  assert(humans.every(h => h.civilization !== null), 'every human starts with a civilization');
  assert(
    w.society.civilizations.every(c => liveCitizens(w, c) >= INITIAL_CITIZENS),
    `every civ starts with at least ${INITIAL_CITIZENS} citizens`
  );
}
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node tests/phase1_test.js`
Expected: FAIL (import error for `INITIAL_CITIZENS`, or `spawnCitizens is not a function`).

- [ ] **Step 4: Update the ecosystem**

In `src/life/ecosystem.js`:

1. Below the imports, add:

```js
const MAX_ENTITIES = 250;
```

2. In the constructor, after `this.deaths = 0;` and before `this.initFauna();`, add:

```js
    this.society = null; // set by SocietyManager so new humans can be assigned a civilization
```

3. In `spawnRandomEntity`, after `this.entities.push(ent);` add:

```js
        if (this.society) this.society.assignCitizen(ent);
```

4. In `update`, replace `this.entities.length < 250` with `this.entities.length < MAX_ENTITIES`. In `attemptBreeding`, replace `if (this.entities.length >= 250) return;` with `if (this.entities.length >= MAX_ENTITIES) return;`.

5. In `attemptBreeding`, after the `const baby = new Entity({...});` statement, add:

```js
      baby.civilization = parent1.civilization;
```

6. Add this method after `spawnRandomEntity`:

```js
  // Spawns a human citizen of `civ` on land near its capital.
  spawnCitizen(civ, radius = 4) {
    const human = this.speciesCatalog.find(s => s.id === 'species_human');
    if (!human || this.entities.length >= MAX_ENTITIES) return null;
    for (let attempt = 0; attempt < 30; attempt++) {
      const x = civ.capitalX + Math.floor((Math.random() - 0.5) * radius * 2);
      const y = civ.capitalY + Math.floor((Math.random() - 0.5) * radius * 2);
      const tile = this.terrain.getTile(x, y);
      if (tile && !tile.biome.isWater && tile.biome.id !== 'GLACIAL_ICE') {
        const ent = new Entity({ species: human, x: x + 0.5, y: y + 0.5 });
        ent.civilization = civ;
        this.entities.push(ent);
        human.population++;
        return ent;
      }
    }
    return null;
  }
```

- [ ] **Step 5: Update the society**

In `src/civilization/society.js`:

1. Below the imports add:

```js
export const INITIAL_CITIZENS = 6;
```

2. Replace the `SocietyManager` constructor with:

```js
  constructor(terrain, ecosystem) {
    this.terrain = terrain;
    this.ecosystem = ecosystem;
    this.civilizations = [];
    ecosystem.society = this;

    this.initDefaultCivs();
    this.reassignUnaffiliated();
  }
```

3. In `initDefaultCivs`, after `this.civilizations.push(civ);` add:

```js
          this.spawnCitizens(civ, INITIAL_CITIZENS);
```

4. Add these methods to `SocietyManager` (after `initDefaultCivs`):

```js
  spawnCitizens(civ, count) {
    let spawned = 0;
    for (let i = 0; i < count; i++) {
      if (this.ecosystem.spawnCitizen(civ)) spawned++;
    }
    return spawned;
  }

  // Humans join the civ that owns their tile, otherwise the nearest living capital.
  assignCitizen(entity) {
    if (!entity.alive || !entity.species || entity.species.type !== 'humanoid') return null;
    const tile = this.terrain.getTile(Math.floor(entity.x), Math.floor(entity.y));
    let civ = null;
    if (tile && tile.civId) {
      civ = this.civilizations.find(c => c.id === tile.civId && c.isAlive) || null;
    }
    if (!civ) {
      let best = Infinity;
      for (const c of this.civilizations) {
        if (!c.isAlive) continue;
        const d = Math.hypot(c.capitalX - entity.x, c.capitalY - entity.y);
        if (d < best) {
          best = d;
          civ = c;
        }
      }
    }
    entity.civilization = civ;
    return civ;
  }

  reassignUnaffiliated() {
    for (const ent of this.ecosystem.entities) {
      if (!ent.civilization) this.assignCitizen(ent);
    }
  }
```

5. In `Civilization.collapse`, after `this.territory = [];` add:

```js

    for (const ent of ecosystem.entities) {
      if (ent.civilization === this) ent.civilization = null;
    }
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `node tests/phase1_test.js && node tests/qa_test.js`
Expected: all PASS in both files.

- [ ] **Step 7: Commit (skip if not a git repo)**

```bash
git add src/life/ecosystem.js src/civilization/society.js tests/helpers.js tests/phase1_test.js
git commit -m "feat: assign humans to civilizations"
```

---

### Task 3: Population derived from citizens, with real births and famine

**Files:**
- Modify: `src/civilization/society.js` (constants, `Civilization` fields, `update`, new `starve`, `SocietyManager` census/update, rebirth wiring)
- Modify: `src/simulation/catchUpEngine.js` (population dynamics)
- Modify: `tests/phase1_test.js`

**Interfaces:**
- Consumes: Task 1 `scaleChance`; Task 2 `spawnCitizen`, `spawnCitizens`, `reassignUnaffiliated`, `addCiv`, `addHuman`, `liveCitizens`, `emptyWorld`.
- Produces:
  - `society.js` exports `POP_PER_CITIZEN` (10), `MIN_POPULATION` (10), `MAX_CITIZENS` (40), `FAMINE_DEATH_INTERVAL` (3)
  - `Civilization#citizens`, `#soldiers`, `#famineTimer`, `#starve(ecosystem, simDt)`
  - `SocietyManager#refreshCensus()`

- [ ] **Step 1: Write the failing tests**

In `tests/phase1_test.js`, extend the imports:

```js
import {
  INITIAL_CITIZENS,
  POP_PER_CITIZEN,
  MIN_POPULATION
} from '../src/civilization/society.js';
import { catchUpEngine } from '../src/simulation/catchUpEngine.js';
import { SeededRNG } from '../src/cosmos/seed.js';
```

(replace the earlier single-name `INITIAL_CITIZENS` import with this one). Add this block above `summary();`:

```js
section('Population: derived from living citizens');
{
  const w = emptyWorld();
  const alpha = addCiv(w, 'Alpha', 10, 20, 5);
  w.society.refreshCensus();
  assert(alpha.citizens === 5, 'census counts living citizens');
  assert(alpha.population === 5 * POP_PER_CITIZEN, `population is citizens x ${POP_PER_CITIZEN}`);

  const soldier = addHuman(w, alpha, 11.5, 20.5, 'SOLDIER');
  w.society.refreshCensus();
  assert(alpha.soldiers === 1, 'census counts soldiers');

  soldier.die('test');
  w.society.refreshCensus();
  assert(alpha.citizens === 5, 'dead citizens are not counted');

  const empty = addCiv(w, 'Ghost', 40, 20, 0);
  w.society.refreshCensus();
  assert(empty.population === MIN_POPULATION, `population never drops below ${MIN_POPULATION}`);
}

section('Population: surplus food produces a real citizen');
{
  const w = emptyWorld();
  const alpha = addCiv(w, 'Alpha', 10, 20, 5);
  alpha.food = 300;
  w.society.update(0.05, 1);
  assert(liveCitizens(w, alpha) === 6, 'a birth adds one living citizen entity');
  assert(alpha.food < 300, 'the birth consumed food');
}

section('Population: famine kills real citizens');
{
  const w = emptyWorld();
  const alpha = addCiv(w, 'Alpha', 10, 20, 5);
  alpha.food = -500;
  for (let i = 0; i < 4; i++) w.society.update(1, 1);
  assert(liveCitizens(w, alpha) < 5, `famine killed a citizen (now ${liveCitizens(w, alpha)})`);
}

section('Population: a civ with no citizens collapses');
{
  const w = emptyWorld();
  const alpha = addCiv(w, 'Alpha', 10, 20, 3);
  for (const e of w.ecosystem.entities) e.die('test');
  w.society.update(0.05, 1);
  assert(alpha.isAlive === false, 'depopulated civ collapses into ruins');
}

section('Population: ruins rebirth gives the new civ citizens');
{
  const w = emptyWorld();
  const old = addCiv(w, 'Alpha', 10, 20, 0);
  const tile = w.terrain.getTile(12, 20);
  tile.structure = { type: 'ruins', name: 'Ancient Ruins of Alpha', originalTech: 300 };
  old.isAlive = false;
  addHuman(w, null, 12.5, 20.5);
  w.society.checkRuinsRebirth();
  const reborn = w.society.civilizations.find(c => c.name.startsWith('Neo-'));
  assert(Boolean(reborn), 'a new civ was founded on the ruins');
  assert(reborn && liveCitizens(w, reborn) >= 1, 'the reborn civ has citizens');
}

section('Population: catch-up births create real citizens');
{
  const w = emptyWorld();
  const alpha = addCiv(w, 'Alpha', 10, 20, 5);
  const techBefore = alpha.techPoints;
  const report = catchUpEngine.fastForwardPlanet(
    { planet: { name: 'Test' }, terrain: w.terrain, ecosystem: w.ecosystem, society: w.society },
    100,
    new SeededRNG('catchup')
  );
  assert(report !== null, 'catch-up ran');
  assert(liveCitizens(w, alpha) >= 5, 'catch-up never shrinks a healthy civ');
  assert(alpha.techPoints > techBefore, 'catch-up still advances technology');
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node tests/phase1_test.js`
Expected: FAIL (import error for `POP_PER_CITIZEN`, or `refreshCensus is not a function`).

- [ ] **Step 3: Add constants and civ fields**

In `src/civilization/society.js`:

1. Extend the top of the file:

```js
import { ERAS, getEraForPoints } from './techTree.js';
import { scaleChance } from '../simulation/fixedStep.js';

export const INITIAL_CITIZENS = 6;
export const POP_PER_CITIZEN = 10;      // each citizen entity stands for 10 people in civ stats
export const MIN_POPULATION = 10;       // lower bound for the derived population figure
export const MAX_CITIZENS = 40;         // citizen entities per civ
export const FAMINE_DEATH_INTERVAL = 3; // simulated seconds between famine deaths
```

2. In the `Civilization` constructor, after `this.territory = [];` add:

```js
    this.citizens = 0;      // living member entities, refreshed by SocietyManager.refreshCensus
    this.soldiers = 0;      // living members with role SOLDIER
    this.famineTimer = 0;
```

- [ ] **Step 4: Rewrite `Civilization.update` and add `starve`**

Replace the entire `update` method of `Civilization` with:

```js
  update(dt, speedMultiplier, terrain, allCivs, ecosystem) {
    if (!this.isAlive) return;

    const effSpeed = Math.min(speedMultiplier, 100);
    const simDt = dt * effSpeed;

    // Population is derived from living citizens (SocietyManager.refreshCensus runs first)
    if (this.citizens === 0) {
      this.collapse(terrain, 'Depopulation', ecosystem);
      return;
    }

    // Research & Technology Progression
    this.techPoints += simDt * (0.4 + this.population * 0.04);
    const newEra = getEraForPoints(this.techPoints);
    if (newEra.id !== this.era.id) {
      this.era = newEra;
      ecosystem.notifications.unshift({
        text: `🏛️ Epoch Advance: "${this.name}" has entered the ${this.era.name}!`,
        time: Date.now()
      });
    }

    // Food: surplus -> a citizen is born, deficit -> famine kills one
    this.food += simDt * (this.territory.length * 0.9 * this.era.bonuses.farmBonus - this.population * 0.35);
    if (this.food > 220 && this.citizens < MAX_CITIZENS) {
      if (ecosystem.spawnCitizen(this)) this.food -= 45;
    } else if (this.food < 0) {
      this.starve(ecosystem, simDt);
    }

    // Update military count based on population
    this.militaryStrength = Math.floor(this.population * 0.25);

    // Territorial Expansion & Construction
    if (Math.random() < scaleChance(0.2, dt)) {
      this.expandTerritory(terrain);
    }

    // Diplomacy & War checks with neighbor civilizations
    if (Math.random() < scaleChance(0.08, dt)) {
      this.evaluateDiplomacy(allCivs, ecosystem);
    }
  }

  // Famine kills one citizen every FAMINE_DEATH_INTERVAL simulated seconds.
  starve(ecosystem, simDt) {
    this.famineTimer += simDt;
    if (this.famineTimer < FAMINE_DEATH_INTERVAL) return;
    this.famineTimer = 0;
    const victim = ecosystem.entities.find(e => e.alive && e.civilization === this);
    if (victim) victim.die('Famine');
  }
```

- [ ] **Step 5: Add the census and wire `SocietyManager`**

In `SocietyManager`:

1. In the constructor, after `this.reassignUnaffiliated();` add:

```js
    this.refreshCensus();
    this._lastAliveCount = this.civilizations.filter(c => c.isAlive).length;
```

2. Add this method:

```js
  // One pass over all creatures: counts citizens and soldiers per civ and derives population.
  refreshCensus() {
    const counts = new Map();
    for (const e of this.ecosystem.entities) {
      if (!e.alive || !e.civilization) continue;
      const c = counts.get(e.civilization.id) || { citizens: 0, soldiers: 0 };
      c.citizens++;
      if (e.role === 'SOLDIER') c.soldiers++;
      counts.set(e.civilization.id, c);
    }
    for (const civ of this.civilizations) {
      const c = counts.get(civ.id) || { citizens: 0, soldiers: 0 };
      civ.citizens = c.citizens;
      civ.soldiers = c.soldiers;
      civ.population = Math.max(MIN_POPULATION, civ.citizens * POP_PER_CITIZEN);
    }
  }
```

3. Replace `SocietyManager.update` with:

```js
  update(dt, speedMultiplier) {
    this.refreshCensus();
    for (const civ of this.civilizations) {
      civ.update(dt, speedMultiplier, this.terrain, this.civilizations, this.ecosystem);
    }

    // When a civ falls or is founded, homeless humans join the nearest living civ
    const aliveCount = this.civilizations.filter(c => c.isAlive).length;
    if (aliveCount !== this._lastAliveCount) {
      this._lastAliveCount = aliveCount;
      this.reassignUnaffiliated();
    }

    if (Math.random() < 0.02 * (speedMultiplier > 50 ? 5 : 1)) {
      this.checkRuinsRebirth();
    }
  }
```

(The rebirth probability is rescaled in Task 5.)

4. In `checkRuinsRebirth`, after `this.civilizations.push(newCiv);` add:

```js
            nearbyHuman.civilization = newCiv;
            this.spawnCitizens(newCiv, 2);
```

- [ ] **Step 6: Update the catch-up engine**

In `src/simulation/catchUpEngine.js`:

1. Add the import: `import { MAX_CITIZENS } from '../civilization/society.js';`
2. Before `// 2. Civilizations Catch-up`'s `for` loop, add `society.refreshCensus();`.
3. Replace the population block (the `growthFactor`, `popDelta` and `civ.population = ...` lines) with:

```js
      // Population dynamics: births become real citizens (capped)
      const growthFactor = 0.015 * Math.min(20, deltaYears);
      const births = Math.floor(civ.citizens * growthFactor * (rng ? rng.range(0.8, 1.4) : 1.0));
      society.spawnCitizens(civ, Math.min(births, MAX_CITIZENS - civ.citizens));
```

4. Just before `return report;`, add `society.refreshCensus();`.

- [ ] **Step 7: Run all tests**

Run: `node tests/phase1_test.js && node tests/qa_test.js`
Expected: all PASS in both files.

- [ ] **Step 8: Commit (skip if not a git repo)**

```bash
git add src/civilization/society.js src/simulation/catchUpEngine.js tests/phase1_test.js
git commit -m "feat: derive civ population from living citizens"
```

---

### Task 4: War resolution

**Files:**
- Modify: `src/civilization/society.js` (constants, `Civilization` fields, `update`, `evaluateDiplomacy`, `declareWar`, `collapse`, new `checkWarEnd`/`endWar`)
- Modify: `tests/phase1_test.js`

**Interfaces:**
- Consumes: Task 3 `civ.soldiers`, `civ.update`, `SocietyManager#update`, `refreshCensus`.
- Produces:
  - `society.js` exports `MIN_WAR_DURATION` (20), `MAX_WAR_DURATION` (180), `TRUCE_DURATION` (120)
  - `Civilization#warTimer`, `#truce`, `#checkWarEnd(ecosystem)`, `#endWar(ecosystem, reason, winner)`

- [ ] **Step 1: Write the failing tests**

In `tests/phase1_test.js`, extend the society import with `MAX_WAR_DURATION, TRUCE_DURATION`. Add above `summary();`:

```js
section('War: soldiers of warring civs now actually fight');
{
  const w = emptyWorld();
  const a = addCiv(w, 'Alpha', 10, 20, 0);
  const b = addCiv(w, 'Beta', 16, 20, 0);
  for (let i = 0; i < 3; i++) {
    addHuman(w, a, 9.5 + i, 19.5, 'SOLDIER');
    addHuman(w, b, 15.5 + i, 21.5, 'SOLDIER');
  }
  a.declareWar(b, w.ecosystem, 'test');
  let killed = false;
  for (let step = 0; step < 2400 && !killed; step++) {
    w.ecosystem.update(0.05, 1);
    killed = w.ecosystem.entities.some(e => !e.alive && /Killed in War/.test(e.causeOfDeath || ''));
  }
  assert(killed, 'at least one soldier was killed in the war');
}

section('War: ends in surrender when one side has no soldiers');
{
  const w = emptyWorld();
  const a = addCiv(w, 'Alpha', 10, 20, 0);
  const b = addCiv(w, 'Beta', 14, 20, 0);
  for (let i = 0; i < 3; i++) {
    addHuman(w, a, 9.5 + i, 19.5, 'SOLDIER');
    addHuman(w, b, 13.5 + i, 21.5, 'CITIZEN');
  }
  a.declareWar(b, w.ecosystem, 'test');
  for (let i = 0; i < 25; i++) w.society.update(1, 1);
  assert(a.warTarget === null && b.warTarget === null, 'war cleared on both sides');
  assert(a.diplomacy.get(b.id) === 'PEACE' && b.diplomacy.get(a.id) === 'PEACE', 'diplomacy returns to PEACE');
  assert(a.truce > 0 && b.truce > 0, 'a truce prevents an immediate new war');
  assert(w.ecosystem.notifications.some(n => /surrenders/.test(n.text)), 'surrender is announced');
}

section('War: ends from war weariness');
{
  const w = emptyWorld();
  const a = addCiv(w, 'Alpha', 10, 20, 0);
  const b = addCiv(w, 'Beta', 14, 20, 0);
  addHuman(w, a, 10.5, 19.5, 'SOLDIER');
  addHuman(w, b, 14.5, 19.5, 'SOLDIER');
  a.declareWar(b, w.ecosystem, 'test');
  a.warTimer = MAX_WAR_DURATION + 1;
  w.society.update(0.05, 1);
  assert(a.warTarget === null && b.warTarget === null, 'a very long war ends');
  assert(a.truce <= TRUCE_DURATION && a.truce > TRUCE_DURATION - 1, 'truce starts at TRUCE_DURATION');
}

section('War: a collapsing civ ends its war');
{
  const w = emptyWorld();
  const a = addCiv(w, 'Alpha', 10, 20, 2);
  const b = addCiv(w, 'Beta', 14, 20, 2);
  a.declareWar(b, w.ecosystem, 'test');
  b.collapse(w.terrain, 'test', w.ecosystem);
  assert(a.warTarget === null, 'the surviving civ is no longer at war');
  assert(a.diplomacy.get(b.id) === 'PEACE', 'diplomacy is PEACE after the foe collapsed');
}

section('War: a civ never fights two wars at once');
{
  const w = emptyWorld();
  const a = addCiv(w, 'Alpha', 10, 20, 2);
  const b = addCiv(w, 'Beta', 14, 20, 2);
  const c = addCiv(w, 'Gamma', 18, 20, 2);
  a.declareWar(b, w.ecosystem, 'test');
  for (let i = 0; i < 300; i++) {
    a.evaluateDiplomacy(w.society.civilizations, w.ecosystem);
    c.evaluateDiplomacy(w.society.civilizations, w.ecosystem);
  }
  assert(a.warTarget === b, 'Alpha is still fighting Beta only');
  assert(c.warTarget === null, 'Gamma cannot join a war against a civ that is already at war');
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node tests/phase1_test.js`
Expected: FAIL (import error for `MAX_WAR_DURATION`).

- [ ] **Step 3: Add constants and fields**

In `src/civilization/society.js`, add below the other constants:

```js
export const MIN_WAR_DURATION = 20;     // simulated seconds before a war can end by surrender
export const MAX_WAR_DURATION = 180;    // simulated seconds before war weariness ends it
export const TRUCE_DURATION = 120;      // simulated seconds of peace enforced after a war
```

In the `Civilization` constructor, next to `this.warTarget = null;` add:

```js
    this.warTimer = 0;
    this.truce = 0;
```

- [ ] **Step 4: Update the war logic**

1. In `Civilization.update`, directly after the `if (this.citizens === 0) {...}` block, add:

```js
    this.truce = Math.max(0, this.truce - simDt);
    if (this.warTarget) {
      this.warTimer += simDt;
      this.checkWarEnd(ecosystem);
    }
```

2. In `evaluateDiplomacy`, replace `if (curStatus === 'PEACE') {` with:

```js
        if (curStatus === 'PEACE' && !this.warTarget && !other.warTarget && this.truce <= 0 && other.truce <= 0) {
```

3. Replace `declareWar` with:

```js
  declareWar(targetCiv, ecosystem, reason) {
    if (this.warTarget || targetCiv.warTarget) return;

    this.diplomacy.set(targetCiv.id, 'WAR');
    targetCiv.diplomacy.set(this.id, 'WAR');
    this.warTarget = targetCiv;
    targetCiv.warTarget = this;
    this.warTimer = 0;
    targetCiv.warTimer = 0;

    ecosystem.notifications.unshift({
      text: `⚔️ WAR DECLARED! "${this.name}" has waged war against "${targetCiv.name}" (${reason})!`,
      time: Date.now()
    });
  }

  checkWarEnd(ecosystem) {
    const foe = this.warTarget;
    if (!foe) return;
    if (!foe.isAlive) {
      this.endWar(ecosystem, `${foe.name} has fallen`, this);
      return;
    }
    if (this.warTimer < MIN_WAR_DURATION) return;

    if (this.soldiers === 0 && foe.soldiers === 0) {
      this.endWar(ecosystem, `both armies of ${this.name} and ${foe.name} are spent`, null);
    } else if (this.soldiers === 0) {
      this.endWar(ecosystem, `${this.name} surrenders to ${foe.name}`, foe);
    } else if (foe.soldiers === 0) {
      this.endWar(ecosystem, `${foe.name} surrenders to ${this.name}`, this);
    } else if (this.warTimer > MAX_WAR_DURATION) {
      this.endWar(ecosystem, `war weariness ends the conflict between ${this.name} and ${foe.name}`, null);
    }
  }

  endWar(ecosystem, reason, winner) {
    const foe = this.warTarget;
    if (!foe) return;
    for (const [civ, other] of [[this, foe], [foe, this]]) {
      civ.diplomacy.set(other.id, 'PEACE');
      civ.warTarget = null;
      civ.warTimer = 0;
      civ.truce = TRUCE_DURATION;
    }
    if (winner) winner.piety = Math.min(100, winner.piety + 5);
    ecosystem.notifications.unshift({
      text: `🕊️ Peace: ${reason}.`,
      time: Date.now()
    });
  }
```

4. In `collapse`, directly after `this.isAlive = false;` add:

```js
    if (this.warTarget) this.endWar(ecosystem, `${this.name} collapsed`, this.warTarget);
```

- [ ] **Step 5: Run all tests**

Run: `node tests/phase1_test.js && node tests/qa_test.js`
Expected: all PASS in both files. If the "soldiers fight" test fails, increase its step limit before changing game code; it only proves that fighting is reachable.

- [ ] **Step 6: Commit (skip if not a git repo)**

```bash
git add src/civilization/society.js tests/phase1_test.js
git commit -m "feat: wars can end by surrender, weariness or collapse"
```

---

### Task 5: Wire the fixed timestep into the game loop

**Files:**
- Modify: `src/life/ecosystem.js` (breeding chance)
- Modify: `src/civilization/society.js` (rebirth chance)
- Modify: `src/main.js` (stepper, tick, planet switch)
- Modify: `index.html` (10,000x tooltip)
- Modify: `tests/phase1_test.js`
- Modify: `docs/superpowers/specs/2026-10-04-simulation-persistence-ui-design.md` (status line)

**Interfaces:**
- Consumes: Task 1 `FixedStepper`, `runSimulationSteps`, `scaleChance`; Tasks 2-4 world and civ behaviour.
- Produces: the running game uses fixed steps. No new exports.

- [ ] **Step 1: Write the failing consistency test**

In `tests/phase1_test.js` add above `summary();`:

```js
section('Fixed step: a creature ages identically at 1x and 10x');
{
  const ageAfter = (frames, speed) => {
    const w = emptyWorld();
    const civ = addCiv(w, 'Alpha', 30, 20, 0);
    const human = addHuman(w, civ, 30.5, 20.5);
    const stepper = new FixedStepper();
    let steps = 0;
    for (let f = 0; f < frames; f++) steps += runSimulationSteps(w, stepper.advance(1 / 64, speed));
    return { age: human.age, steps, alive: human.alive };
  };
  const slow = ageAfter(640, 1); // 10 s at 1x
  const fast = ageAfter(64, 10); // 1 s at 10x
  assert(slow.steps === 200 && fast.steps === 200, 'both runs simulate exactly 200 steps');
  assert(slow.alive && fast.alive, 'the creature survives both runs');
  assert(Math.abs(slow.age - fast.age) < 1e-9, `same simulated time gives the same age (${slow.age.toFixed(3)} vs ${fast.age.toFixed(3)})`);
}
```

- [ ] **Step 2: Run the tests**

Run: `node tests/phase1_test.js`
Expected: PASS. The behaviour is already guaranteed by Tasks 1-4, and this test pins it down before `main.js` changes. If it fails, stop and fix the cause before continuing.

- [ ] **Step 3: Rescale the remaining per-frame chances**

In `src/life/ecosystem.js`:
- Add `import { scaleChance } from '../simulation/fixedStep.js';` with the other imports.
- Replace `Math.random() < 0.08 * (speedMultiplier > 50 ? 2 : 1) && this.entities.length < MAX_ENTITIES` with `Math.random() < scaleChance(0.08, dt) && this.entities.length < MAX_ENTITIES`.

In `src/civilization/society.js`, in `SocietyManager.update`, replace `Math.random() < 0.02 * (speedMultiplier > 50 ? 5 : 1)` with `Math.random() < scaleChance(0.02, dt)`.

- [ ] **Step 4: Drive the loop from the stepper**

In `src/main.js`:

1. Add the import:

```js
import { FixedStepper, runSimulationSteps } from './simulation/fixedStep.js';
```

2. In the `GameApp` constructor, after `this.cosmicTimeAge = 0;` add:

```js
    this.stepper = new FixedStepper();
```

3. In `setActivePlanet`, after `this.activeSim = sim;` add:

```js
    this.stepper.reset();
```

4. In `tick`, replace:

```js
      const { terrain, ecosystem, society } = this.activeSim;

      terrain.update(dt, this.timeSpeed);
      ecosystem.update(dt, this.timeSpeed);
      society.update(dt, this.timeSpeed);
```

with:

```js
      const { terrain, ecosystem } = this.activeSim;

      // Geology runs once per frame at the raw speed. Creatures and civilizations
      // advance in fixed steps so behaviour is identical at every speed.
      terrain.update(dt, this.timeSpeed);
      const steps = this.stepper.advance(dt, this.timeSpeed);
      runSimulationSteps(this.activeSim, steps, { budgetMs: 12 });
```

- [ ] **Step 5: Update the 10,000x tooltip**

In `index.html`, change the 10,000x button's `title` to `"Maximum speed (creatures and civilizations are limited to about 180x)"`.

- [ ] **Step 6: Run tests and build**

Run: `npm test && npm run build`
Expected: both test files pass; Vite build completes without errors.

- [ ] **Step 7: Manual smoke check in the browser**

Run: `npm run dev`, open the printed URL, press **Surface**, then set speed to **100x** and watch for about two minutes. Expect:
- No errors in the browser console.
- Wars start and also end ("🕊️ Peace: ..." notifications).
- Creatures keep moving at 100x instead of dying in place.
- Switching planets and back does not freeze the page.
- At **10,000x** the page stays responsive (steps are capped and budgeted).

If any expectation fails, report it with the console output instead of marking the task done.

- [ ] **Step 8: Update the spec status**

In `docs/superpowers/specs/2026-10-04-simulation-persistence-ui-design.md`, change the status line to `Status: Approved. Phase 1 implemented (see plans/2026-10-04-phase1-simulation-fixes.md). Phases 2-3 pending.`

- [ ] **Step 9: Commit (skip if not a git repo)**

```bash
git add src/main.js src/life/ecosystem.js src/civilization/society.js index.html tests/phase1_test.js docs
git commit -m "feat: run creatures and civs on a fixed timestep"
```

---

## Self-Review

**Spec coverage (Phase 1):**
1. Citizen assignment → Task 2 (assign on spawn, birth, rebirth, reassign on civ change; collapse releases).
2. Population from citizens with a floor → Task 3 (`MIN_POPULATION`, census, births, famine, catch-up).
3. War resolution → Task 4 (surrender, weariness, collapse, truce, no double wars).
4. Fixed timestep with a cap → Tasks 1 and 5.
5. Tests for each → every task is test-first. The spec's "1x vs 100x" test is covered at 1x vs 10x plus the cap test.

**Placeholder scan:** no TBD/TODO. Every code step shows the code.

**Type consistency:** `spawnCitizen` (ecosystem) and `spawnCitizens` (society) are used consistently. The census fields are `citizens` and `soldiers`. `endWar(ecosystem, reason, winner)` has the same signature in `checkWarEnd` and `collapse`. `runSimulationSteps(sim, steps, opts)` takes `{ecosystem, society}`, and `activeSim` has both.

**Known tradeoffs to confirm during execution:**
- At the top speed tiers the agent simulation is capped at about 180x, while geology still follows 10,000x.
- Civ population is now much smaller (about 60 instead of 45-1500), so era pacing may need tuning. This is expected and is not a bug.
