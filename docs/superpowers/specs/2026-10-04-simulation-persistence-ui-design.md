# Genesis & Cosmos — Simulation, Persistence & UI Improvements

Date: 2026-10-04
Status: Approved. Phases 1-3 implemented and verified (plan for phase 1: plans/2026-10-04-phase1-simulation-fixes.md). Phases 2-3 were built directly from this spec. Deviations: saves live in localStorage but terrain floats are stored as Float32 (a restored world is deterministic but not bit-identical to the live original); planets never visited are regenerated from the seed instead of saved; a terrain-layer cache and emoji glyph cache were added to the surface renderer after profiling showed rendering was the FPS bottleneck.

## Goals
Fix broken simulation systems, make worlds reproducible and saveable, then improve the UI. Three phases, built in order (phase 3 depends on phase 1 data).

## Out of scope
New visual theme (the dark glass look is kept and refined), performance work (A* heap, spatial grid), faith/cost mechanics for divine powers, goal system. These are candidates for a later spec.

## Phase 1 — Make the simulation real

**Problems (verified in code)**
- `entity.civilization` is initialised to `null` (`src/life/entity.js:73`) and never assigned, so soldiers never find enemies and wars have no effect.
- Civ `population` is an abstract number unrelated to the ~12 human entities.
- `evaluateDiplomacy` only transitions `PEACE -> WAR`; nothing ends a war.
- Time scaling is inconsistent at high speed: aging uncapped, movement capped at 5x, civs capped at 100x, cosmic time at 50x.

**Changes**
1. Citizen assignment: on spawn or birth, a human gets `civilization` = the civ owning its tile, else the nearest living civ by capital distance. On civ collapse, members become unaffiliated.
2. Civ population = count of living member entities (with a floor so tiny civs are not instantly erased; floor value set in the plan). Births, old age and war deaths now change it. Existing food and growth logic is kept, driving births instead of directly editing the number.
3. War resolution: a war ends in peace (after a duration with low military strength on either side), surrender (one side loses most soldiers), or collapse of one civ. Ending clears `warTarget` and sets diplomacy back to `PEACE` on both sides, with a notification.
4. Fixed timestep: the simulation advances in fixed steps (e.g. 1/20 s); the speed multiplier controls steps per frame, with a maximum steps-per-frame cap to avoid spiral of death. All per-system speed caps are replaced by this single mechanism.
5. Tests: citizen assignment, population derivation, war start and end, timestep consistency at 1x vs 100x.

## Phase 2 — Determinism and persistence

1. One seeded RNG source (extend `src/cosmos/seed.js`). Replace `Math.random()` in terrain, society, ecosystem, entity, species and catch-up engine. Each planet gets its own derived stream (seed + planet id) so creation order does not alter results. Purely cosmetic randomness (particles, canvas textures) may stay on `Math.random()`.
2. Save/load: serialise seed, cosmic time, planets, terrain state, civs, entities, species catalog, RNG stream states into a versioned JSON blob in `localStorage`. Autosave on an interval and on page hide; load prompt on startup if a save exists. Export and import of the save as a `.json` file. Unknown or older versions are rejected with a clear message rather than loaded partially.
3. `SurfaceRenderer.dispose()` removes its window and canvas listeners; `applyNewSeed` calls it on every cleared simulation. Also reseed `globalRNG`.
4. Tests: same seed gives identical world state after N ticks; save/load round trip is lossless; dispose leaves no active listeners.

## Phase 3 — UI redesign

1. Top bar keeps: brand, view switcher, time controls. Seed, copy seed, New Universe, Guide and save/load move into one menu.
2. World Overview panel (surface view, collapsible): per civ flag, government, era, population, war status; wildlife count; recent event log.
3. Compact segmented time control with clear active state and an elapsed-years readout.
4. Inline SVG icons replace emoji for main controls; inline styles in `index.html` move to `src/style.css`.
5. Visible focus states, adequate contrast, layout works at narrow window widths.
6. Verification in a real browser with screenshots using the existing puppeteer-core setup.

## Testing approach
Extend `tests/qa_test.js` with the suites above, run with `node tests/qa_test.js`. Existing 10 tests must keep passing. Phase 3 is verified by browser screenshots plus manual check.

## Risks
- Seeding all randomness changes simulation behaviour; tuning of growth and war rates may be needed after.
- Fixed timestep at 10000x must stay within frame budget; the max-steps cap means very high speeds may run below nominal rate.
- Save format will evolve; the version field is the migration hook.
