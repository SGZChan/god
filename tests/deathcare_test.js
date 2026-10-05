// Death care (src/civilization/deathcare.js): bodies stay, kin carry them to the healers, the family holds a funeral and buries them.
import { assert, section, summary, emptyWorld, addCiv } from './helpers.js';
import { isKin, burialSite, healingSite, CORPSE_LIFE } from '../src/civilization/deathcare.js';
import { settlementsOf } from '../src/civilization/settlements.js';
import { BUILDING_TYPES } from '../src/world/buildings.js';
import { setActiveRng } from '../src/simulation/random.js';
import { SeededRNG } from '../src/cosmos/seed.js';

console.log('====================================================');
console.log('   DEATH CARE TESTS                                 ');
console.log('====================================================');

setActiveRng(new SeededRNG('deathcare'));
const step = (w, n) => { for (let i = 0; i < n; i++) { w.ecosystem.update(0.05, 1); w.society.update(0.05, 1); } };
const place = (w, civ, st, type, dx, dy) => {
  let b = null;
  for (let r = 0; r < 14 && !b; r += 2) for (let a = 0; a < 12 && !b; a++) b = w.terrain.placeBuilding(type, Math.round(st.x + dx + Math.cos(a / 12 * 6.283) * r), Math.round(st.y + dy + Math.sin(a / 12 * 6.283) * r), { civId: civ.id, progress: 1 });
  b.settlementId = st.id;
  return b;
};

section('Buildings of death care exist');
{
  for (const t of ['barrow', 'graveyard', 'healers_hut', 'infirmary', 'hospital']) assert(Boolean(BUILDING_TYPES[t]), `${t} is in the catalogue`);
  assert(BUILDING_TYPES.barrow.tier === 0 && BUILDING_TYPES.healers_hut.tier === 0 && BUILDING_TYPES.infirmary.tier === 2 && BUILDING_TYPES.hospital.tier === 4, 'each age has its own');
}

section('A citizen dies: the body stays; kin carry it to the healer; the family buries it');
{
  const w = emptyWorld();
  const civ = addCiv(w, 'Mournia', 60, 40, 10);
  for (const b of w.terrain.buildings.values()) if (b.civId === civ.id) w.terrain.advanceConstruction(b.id, 1e9);
  const st = settlementsOf(civ)[0];
  const hut = place(w, civ, st, 'healers_hut', 8, 4);
  const barrow = place(w, civ, st, 'barrow', -8, 8);
  w.society.refreshCensus();
  const people = w.ecosystem.entities.filter(e => e.civilization === civ && e.isAdult);
  const victim = people[0];
  const kin = people.find(p => p !== victim && (p.clanId === victim.clanId || p.mateId === victim.id)) || people[1];
  victim.clanId = kin.clanId = victim.clanId || kin.clanId;
  assert(isKin(kin, victim) || victim.clanId === kin.clanId, 'the dead one has kin');
  victim.die('Old Age');
  assert(!victim.alive && victim.corpse && victim.corpse.state === 'lying', 'the body lies where it fell');
  assert(victim.decayTimer === CORPSE_LIFE, 'and waits for the family instead of becoming a tombstone');
  let state = [];
  for (let i = 0; i < 600; i++) {
    step(w, 10);
    const s = victim.corpse && victim.corpse.state;
    if (s && state[state.length - 1] !== s) state.push(s);
    if (s === 'buried' || !w.ecosystem.entities.includes(victim)) break;
  }
  assert(state.includes('carried'), `someone carried the body (${state.join(' > ')})`);
  assert(state.includes('laid_out'), 'it was laid out at the healer\'s hut');
  assert(state.includes('rite') || victim.corpse.state === 'buried', 'a funeral was held at the grave');
  step(w, 100);
  assert(!w.ecosystem.entities.includes(victim), 'the body was buried and is gone');
  assert(Array.isArray(barrow.graves) && barrow.graves.some(g => g.name === victim.name), 'the barrow keeps the name of the dead');
  assert(civ.buried >= 1, 'the people count their buried');
  assert(burialSite(w.terrain, st, victim) === barrow && healingSite(w.terrain, st, victim) === hut, 'the places are found');
}

section('Unburied dead: the body is lost in time and the living near it fall sick');
{
  const w = emptyWorld();
  const civ = addCiv(w, 'Neglectia', 60, 40, 6);
  for (const b of w.terrain.buildings.values()) if (b.civId === civ.id) w.terrain.advanceConstruction(b.id, 1e9);
  w.society.refreshCensus();
  const people = w.ecosystem.entities.filter(e => e.civilization === civ && e.isAdult);
  const victim = people[0];
  victim.die('Famine');
  // nobody may come: every other adult is busy
  for (const p of people.slice(1)) p.task = { kind: 'migrate', sid: 'nowhere', x: 5, y: 5, stuck: 0 };
  victim.decayTimer = 40; // already lain a while
  const bystander = people[1];
  bystander.x = victim.x + 1; bystander.y = victim.y;
  const before = bystander.health;
  civ.deathTimer = 0;
  w.society.tickCiv(civ, 2.1);
  assert(bystander.health < before, 'a living neighbour of a foul body falls ill');
}

section('The hurt seek care at a place of healing');
{
  const w = emptyWorld();
  const civ = addCiv(w, 'Healia', 60, 40, 6);
  for (const b of w.terrain.buildings.values()) if (b.civId === civ.id) w.terrain.advanceConstruction(b.id, 1e9);
  const st = settlementsOf(civ)[0];
  place(w, civ, st, 'infirmary', 6, 3);
  w.society.refreshCensus();
  const patient = w.ecosystem.entities.find(e => e.civilization === civ && e.isAdult);
  patient.health = patient.maxHealth * 0.3;
  const hurt = patient.health;
  step(w, 1500);
  assert(patient.health > hurt + 10, `the wounded one recovered (${Math.round(hurt)} -> ${Math.round(patient.health)})`);
}

summary();
