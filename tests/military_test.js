// Armies (src/civilization/military.js, art/warSprites.js): unit classes by age, ranged combat, machines, effects.
import { assert, section, summary, emptyWorld, addCiv } from './helpers.js';
import { UNITS, pickUnit, damageAgainst, isVehicle, isAir } from '../src/civilization/military.js';
import { gearPixels, vehicleSprite, VEHICLE_SIZE } from '../src/art/warSprites.js';
import { ERAS } from '../src/civilization/techTree.js';
import { random, setActiveRng } from '../src/simulation/random.js';
import { SeededRNG } from '../src/cosmos/seed.js';
import { settlementsOf } from '../src/civilization/settlements.js';

console.log('====================================================');
console.log('   MILITARY TESTS                                   ');
console.log('====================================================');

setActiveRng(new SeededRNG('war'));

section('Every age has its own fighters; machines come with industry');
{
  const w = emptyWorld();
  const civ = addCiv(w, 'Armia', 60, 40, 10);
  const seen = tier => {
    civ.era = ERAS[tier];
    const set = new Set();
    for (let i = 0; i < 200; i++) set.add(pickUnit(civ, w.ecosystem, w.terrain, random));
    return set;
  };
  const stone = seen(0);
  assert([...stone].every(u => UNITS[u].tier === 0) && stone.has('clubman'), `the Stone Age fields clubmen and slingers (${[...stone]})`);
  assert(seen(1).has('archer') && seen(2).has('swordsman') && seen(3).has('knight') && seen(3).has('crossbowman'), 'archers, swordsmen, knights and crossbowmen follow');
  const modern = seen(4);
  assert(modern.has('rifleman') && modern.has('gunner'), 'the Industrial Age fields riflemen and machine gunners');
  assert(!modern.has('tank') && !modern.has('pilot'), 'but no tanks or aircraft without a factory');
  assert([...seen(5)].every(u => UNITS[u].tier === 5) && seen(5).has('marine'), 'the Space Age fields space marines');
}

section('Machines of war need factories and are limited in number');
{
  const w = emptyWorld();
  const civ = addCiv(w, 'Steelia', 60, 40, 12);
  civ.era = ERAS[4];
  const st = settlementsOf(civ)[0];
  let f = null;
  for (let r = 0; r < 20 && !f; r += 2) for (let a = 0; a < 12 && !f; a++) f = w.terrain.placeBuilding('factory', Math.round(st.x + 8 + Math.cos(a / 12 * 6.283) * r), Math.round(st.y + 6 + Math.sin(a / 12 * 6.283) * r), { civId: civ.id, progress: 1 });
  f.settlementId = st.id;
  for (const e of w.ecosystem.entities) if (e.civilization === civ && e.isAdult) e.role = 'SOLDIER';
  const picks = [];
  for (let i = 0; i < 300; i++) {
    const u = pickUnit(civ, w.ecosystem, w.terrain, random);
    picks.push(u);
    // every vehicle chosen goes into service
    if (isVehicle(u) && u !== 'cannon') { const e = w.ecosystem.entities.find(x => x.civilization === civ && x.role === 'SOLDIER' && !isVehicle(x.unit)); if (e) e.unit = u; }
  }
  assert(picks.some(u => u === 'tank') || picks.some(u => u === 'pilot'), 'with a factory, tanks and pilots appear');
  const crew = w.ecosystem.entities.filter(e => e.civilization === civ && e.role === 'SOLDIER');
  assert(crew.filter(e => isVehicle(e.unit)).length <= Math.max(1, Math.floor(crew.length / 5)), 'at most one machine for every five soldiers');
  assert(isAir(UNITS.pilot.gear === 'plane' ? 'pilot' : null) && !isAir('tank'), 'pilots fly, tanks drive');
}

section('Armour and toughness matter');
{
  const rolls = () => 0.5;
  const club = damageAgainst('clubman', 40, 'clubman', rolls);
  const knightHit = damageAgainst('clubman', 40, 'knight', rolls);
  const tankHit = damageAgainst('rifleman', 40, 'tank', rolls);
  assert(knightHit < club * 0.5, `a knight shrugs off a club (${knightHit.toFixed(1)} vs ${club.toFixed(1)})`);
  assert(tankHit < damageAgainst('rifleman', 40, 'rifleman', rolls) * 0.15, 'rifles barely scratch a tank');
  assert(damageAgainst('walker', 40, 'rifleman', rolls) > damageAgainst('rifleman', 40, 'rifleman', rolls) * 2, 'a walker\'s cannon outguns a rifleman');
}

section('Ranged fighters open fire from a distance, with effects to draw');
{
  const w = emptyWorld();
  const a = addCiv(w, 'Archeria', 40, 40, 10);
  const b = addCiv(w, 'Targetia', 60, 40, 10);
  a.era = ERAS[1];
  for (const c of [a, b]) for (const bd of w.terrain.buildings.values()) if (bd.civId === c.id) w.terrain.advanceConstruction(bd.id, 1e9);
  w.society.refreshCensus();
  const shooter = w.ecosystem.entities.find(e => e.civilization === a && e.isAdult);
  const target = w.ecosystem.entities.find(e => e.civilization === b && e.isAdult);
  shooter.role = 'SOLDIER'; target.role = 'SOLDIER';
  shooter.unit = 'archer'; shooter.unitEra = ERAS[1].id;
  shooter.x = 45; shooter.y = 40; target.x = 52; target.y = 40;
  a.declareWar(b, w.ecosystem, 'test');
  const hp = target.health;
  let fired = false;
  for (let i = 0; i < 400 && !fired; i++) { w.ecosystem.update(0.05, 1); fired = w.ecosystem.warFx.length > 0 || target.health < hp; }
  const fx = w.ecosystem.warFx[0];
  assert(fired && fx && fx.fx === 'arrow', 'an arrow flew');
  assert(Math.hypot(shooter.x - target.x, shooter.y - target.y) > 4, 'from a distance, not in a brawl');
  assert(shooter.combat || target.health < hp, 'the archer shows a drawing pose and the target is hit');
}

section('Every class and machine has a sprite');
{
  for (const [id, u] of Object.entries(UNITS)) {
    if (u.kind === 'foot') {
      const px = gearPixels(id, null, 0, '#38bdf8');
      assert(px.length > 10, `${u.name} has gear (${px.length} pixels)`);
      assert(gearPixels(id, u.anim, 0, '#38bdf8').length > 10, `${u.name} has an attack pose`);
    } else {
      const v = vehicleSprite(u.gear, '#38bdf8', null);
      const [w, h] = VEHICLE_SIZE[u.gear];
      assert(v.w === w && v.pixels.length > 60 && !v.pixels.some(([x, y]) => x < 0 || y < 0 || x >= w || y >= h), `${u.name} has a machine sprite within ${w}x${h}`);
    }
  }
}

summary();
