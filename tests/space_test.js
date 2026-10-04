import { assert, section, summary } from './helpers.js';
import { Universe, GALAXY_COUNT } from '../src/cosmos/universe.js';

console.log('====================================================');
console.log('   SPACE TESTS — UNIVERSE & GALAXIES                ');
console.log('====================================================');

section('Universe: galaxies are deterministic');
{
  const a = new Universe('seed-A');
  const b = new Universe('seed-A');
  const c = new Universe('seed-B');
  const names = u => u.getGalaxy(2).systems.map(s => `${s.id}:${s.name}:${s.star.name}`).join('|');
  assert(a.defs.length === GALAXY_COUNT, `the universe has ${GALAXY_COUNT} galaxies`);
  assert(names(a) === names(b), 'the same seed builds the same galaxy');
  const seeds = u => u.getGalaxy(2).systems.map(s => s.planets.map(p => p.seed).join(',')).join('|');
  assert(seeds(a) !== seeds(c) && a.defs[2].seed !== c.defs[2].seed, 'a different universe seed builds different galaxies');
  assert(a.getGalaxy(1) === a.getGalaxy(1), 'galaxies are cached once built');
}

section('Universe: ids are unique across galaxies');
{
  const u = new Universe('ids');
  const systemIds = new Set();
  const planetIds = new Set();
  let systems = 0;
  let planets = 0;
  for (let i = 0; i < GALAXY_COUNT; i++) {
    for (const system of u.getGalaxy(i).systems) {
      systems++;
      systemIds.add(system.id);
      for (const p of system.planets) {
        planets++;
        planetIds.add(p.id);
      }
    }
  }
  assert(systemIds.size === systems, `all ${systems} system ids are unique`);
  assert(planetIds.size === planets, `all ${planets} planet ids are unique`);
}

section('Universe: galaxy 0 keeps the original ids (older saves still load)');
{
  const u = new Universe('Genesis-1337');
  const home = u.getGalaxy(0);
  assert(home.systems[0].id === 'sys_0' && home.systems[0].planets[0].id === 'p_0_0', 'home galaxy uses sys_N and p_N_M ids');
  assert(home.systems[0].planets[0].seed.startsWith('Genesis-1337_sys_0_planet_'), 'planet seeds are unchanged');
  const other = u.getGalaxy(3);
  assert(other.systems[0].id === 'g3_sys_0' && other.systems[0].planets[0].id === 'g3_p_0_0', 'other galaxies prefix their ids');
}

section('Universe: id lookup and system nodes');
{
  const u = new Universe('lookup');
  assert(u.galaxyIndexOfId('p_2_1') === 0 && u.galaxyIndexOfId('sys_5') === 0, 'unprefixed ids belong to the home galaxy');
  assert(u.galaxyIndexOfId('g4_p_2_1') === 4 && u.galaxyIndexOfId('g4_sys_1') === 4, 'prefixed ids name their galaxy');
  assert(u.galaxyIndexOfId('g99_sys_1') === 0, 'an unknown galaxy falls back to home');
  const galaxy = u.getGalaxy(1);
  assert(galaxy.pickTargets.length === galaxy.systems.length, 'every system has a clickable node');
  assert(u.pickTargets.length === GALAXY_COUNT, 'every galaxy has a clickable proxy in the intergalactic view');
  assert(galaxy.systems.every(s => s.galaxyIndex === 1), 'systems know which galaxy they belong to');
}

summary();
