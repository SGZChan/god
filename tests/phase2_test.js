import { assert, section, summary } from './helpers.js';
import { SeededRNG } from '../src/cosmos/seed.js';
import { setActiveRng, withRng, random } from '../src/simulation/random.js';
import { createPlanetWorld } from '../src/simulation/world.js';
import { SurfaceRenderer } from '../src/planet/surfaceRenderer.js';
import { runSimulationSteps } from '../src/simulation/fixedStep.js';
import {
  SAVE_VERSION,
  SaveError,
  serializeSim,
  restoreSim,
  serializeGame,
  parseSave
} from '../src/persistence/saveGame.js';

console.log('====================================================');
console.log('   PHASE 2 TESTS — DETERMINISM & PERSISTENCE        ');
console.log('====================================================');

function buildAndRun(seed, steps, options) {
  const rng = new SeededRNG(seed);
  const sim = createPlanetWorld(rng, { seed, flat: false, ...options });
  setActiveRng(rng);
  runSimulationSteps(sim, steps);
  sim.terrain.update(0.5, 20);
  return sim;
}
const snapshot = sim => JSON.stringify(serializeSim(sim));

section('Determinism: same seed gives the same world');
{
  const a = createPlanetWorld(new SeededRNG('planet-A'));
  const b = createPlanetWorld(new SeededRNG('planet-A'));
  const c = createPlanetWorld(new SeededRNG('planet-B'));
  assert(snapshot(a) === snapshot(b), 'two worlds from one seed are identical');
  assert(snapshot(a) !== snapshot(c), 'a different seed gives a different world');
}

section('Determinism: same seed evolves identically');
{
  const a = buildAndRun('evolve', 400);
  const b = buildAndRun('evolve', 400);
  assert(snapshot(a) === snapshot(b), 'after 400 steps both worlds are still identical');
  assert(a.ecosystem.entities.length > 0, 'the world is alive (the comparison is meaningful)');
}

section('Determinism: creation order does not matter');
{
  const first = createPlanetWorld(new SeededRNG('order-X'));
  createPlanetWorld(new SeededRNG('order-Y')); // another planet created in between
  const second = createPlanetWorld(new SeededRNG('order-X'));
  assert(snapshot(first) === snapshot(second), 'a planet does not depend on which planets were built before it');
}

section('Determinism: withRng restores the previous stream');
{
  const outer = new SeededRNG('outer');
  setActiveRng(outer);
  const before = outer.state;
  withRng(new SeededRNG('inner'), () => random());
  assert(outer.state === before, 'inner stream did not touch the outer stream');
  random();
  assert(outer.state !== before, 'outer stream is active again afterwards');
}

section('Determinism: RNG state stays a uint32');
{
  const rng = new SeededRNG('state');
  for (let i = 0; i < 1000; i++) rng.next();
  assert(Number.isInteger(rng.state) && rng.state >= 0 && rng.state < 2 ** 32, 'state is an unsigned 32-bit integer');
}

section('Barren planets: no life, no borders');
{
  const sim = createPlanetWorld(new SeededRNG('barren'), { populated: false });
  assert(sim.ecosystem.entities.length === 0 && sim.society.civilizations.length === 0, 'no creatures or civs');
  assert(!sim.terrain.scanTiles(t => t.structure || t.civId), 'no capitals or territory markers');
}

section('Species: every world has its own life');
{
  const a = createPlanetWorld(new SeededRNG('species-A'), { seed: 'species-A' });
  const b = createPlanetWorld(new SeededRNG('species-B'), { seed: 'species-B' });
  const namesA = a.ecosystem.speciesCatalog.map(s => s.name).join('|');
  const namesB = b.ecosystem.speciesCatalog.map(s => s.name).join('|');
  assert(namesA !== namesB, 'each planet evolves its own species');
  const speciesA = a.ecosystem.speciesCatalog[1];
  speciesA.centroid.size = 99;
  assert(b.ecosystem.speciesCatalog.every(s => s.centroid.size !== 99), "changing one planet's species leaves others alone");
  assert(a.ecosystem.sapientSpecies() !== null, 'a populated planet has a sapient species');
}

section('Save/load: round trip is lossless');
{
  const sim = buildAndRun('roundtrip', 600);
  const first = snapshot(sim);
  const restored = restoreSim(JSON.parse(first));
  const second = snapshot(restored);
  assert(first === second, 'serialize -> restore -> serialize gives identical data');
  assert(restored.ecosystem.entities.length === sim.ecosystem.entities.length, 'same number of creatures');
  const civ = restored.society.civilizations[0];
  assert(restored.ecosystem.entities.some(e => e.civilization === civ), 'creatures point at the restored civ objects');
  assert(restored.rng.state === sim.rng.state, 'RNG state is restored');
}

section('Save/load: loading is deterministic');
{
  // Terrain floats are stored as Float32, so a restored world is not bit-identical to the live
  // original it came from. What must hold: two worlds restored from one save evolve identically.
  const save = snapshot(buildAndRun('continue', 300));
  const a = restoreSim(JSON.parse(save));
  const b = restoreSim(JSON.parse(save));
  setActiveRng(a.rng);
  runSimulationSteps(a, 300);
  setActiveRng(b.rng);
  runSimulationSteps(b, 300);
  assert(snapshot(a) === snapshot(b), 'two worlds restored from one save stay in lockstep for 300 steps');
  assert(a.ecosystem.entities.length > 0, 'the restored world is alive and running');
}

section('Save/load: war and diplomacy survive');
{
  const sim = buildAndRun('war', 50);
  for (const c of sim.society.civilizations) if (c.warTarget) c.endWar(sim.ecosystem, 'reset', null);
  const [a, b] = sim.society.civilizations;
  a.declareWar(b, sim.ecosystem, 'test');
  const restored = restoreSim(JSON.parse(snapshot(sim)));
  const [ra, rb] = restored.society.civilizations;
  assert(ra.warTarget === rb && rb.warTarget === ra, 'war target links are rebuilt');
  assert(ra.diplomacy.get(rb.id) === 'WAR', 'diplomacy map is restored');
  assert(ra.era.id === a.era.id && ra.government.id === a.government.id, 'era and government are restored');
}

section('Save/load: whole-game format and validation');
{
  const sim = buildAndRun('game', 20);
  const save = serializeGame({
    seed: 'game',
    cosmicTimeAge: 12.5,
    activeSystemId: 'sys_0',
    activePlanetId: 'p_0_0',
    customPlanets: [],
    sims: new Map([['p_0_0', sim]])
  });
  assert(save.version === SAVE_VERSION, 'save carries a version');
  const parsed = parseSave(JSON.stringify(save));
  assert(parsed.seed === 'game' && parsed.cosmicTimeAge === 12.5, 'game fields survive a JSON round trip');

  const rejects = (text) => { try { parseSave(text); return false; } catch (e) { return e instanceof SaveError; } };
  assert(rejects('not json'), 'garbage is rejected with a SaveError');
  assert(rejects(JSON.stringify({ ...save, version: 999 })), 'unknown versions are rejected');
  assert(rejects(JSON.stringify({ version: SAVE_VERSION })), 'incomplete saves are rejected');
  const bytes = JSON.stringify(save).length;
  assert(bytes < 2.6e6, `one planet saves compactly (${Math.round(bytes / 1024)} KB)`);
}

section('Renderer: only the enabled planet reacts, dispose removes listeners');
{
  const registered = new Map(); // handler -> type
  const handlers = {};
  const track = (t, h) => { registered.set(h, t); handlers[t] = h; };
  globalThis.window = {
    innerWidth: 800,
    innerHeight: 600,
    addEventListener: track,
    removeEventListener: (t, h) => registered.delete(h)
  };
  const canvas = {
    width: 0, height: 0, clientWidth: 800, clientHeight: 600, style: {},
    getContext: () => ({}),
    addEventListener: track,
    removeEventListener: (t, h) => registered.delete(h),
    getBoundingClientRect: () => ({ left: 0, top: 0 })
  };
  const sim = createPlanetWorld(new SeededRNG('renderer'));
  const renderer = new SurfaceRenderer(canvas, sim.terrain, sim.ecosystem, sim.society);
  let clicks = 0;
  renderer.onTileClicked = () => { clicks++; };
  assert(registered.size >= 6, `renderer registered its listeners (${registered.size})`);

  handlers.mouseup({ button: 0, clientX: 5, clientY: 5 });
  assert(clicks === 0, 'a disabled renderer ignores clicks (other planets share the canvas)');
  renderer.setEnabled(true);
  handlers.mouseup({ button: 0, clientX: 5, clientY: 5 });
  assert(clicks === 0, 'a release that did not start on the map (a button over it) is not a map click');
  handlers.mousedown({ button: 0, clientX: 5, clientY: 5 });
  handlers.mouseup({ button: 0, clientX: 5, clientY: 5 });
  assert(clicks === 1, 'the enabled renderer handles the click');
  renderer.dispose();
  assert(registered.size === 0, 'dispose removes every listener');
  delete globalThis.window;
}

summary();
