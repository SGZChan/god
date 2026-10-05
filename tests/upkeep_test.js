// Upkeep (src/civilization/upkeep.js): buildings wear down, builders repair them and clear ruins in the town.
import { assert, section, summary, emptyWorld, addCiv } from './helpers.js';
import { tickUpkeep, upkeepWork, REPAIR_BELOW } from '../src/civilization/upkeep.js';
import { settlementsOf } from '../src/civilization/settlements.js';
import { BUILDING_TYPES } from '../src/world/buildings.js';
import { setActiveRng } from '../src/simulation/random.js';
import { SeededRNG } from '../src/cosmos/seed.js';

console.log('====================================================');
console.log('   UPKEEP TESTS                                     ');
console.log('====================================================');

setActiveRng(new SeededRNG('upkeep'));
const step = (w, n) => { for (let i = 0; i < n; i++) { w.ecosystem.update(0.05, 1); w.society.update(0.05, 1); } };
const place = (w, civ, st, type, dx, dy) => {
  let b = null;
  for (let r = 0; r < 16 && !b; r += 2) for (let a = 0; a < 12 && !b; a++) b = w.terrain.placeBuilding(type, Math.round(st.x + dx + Math.cos(a / 12 * 6.283) * r), Math.round(st.y + dy + Math.sin(a / 12 * 6.283) * r), { civId: civ.id, progress: 1 });
  b.settlementId = st.id;
  return b;
};

section('Wear: an unmaintained building loses condition, a tent faster than a stone house');
{
  const w = emptyWorld();
  const civ = addCiv(w, 'Wearia', 60, 40, 6);
  const st = settlementsOf(civ)[0];
  const tent = place(w, civ, st, 'tent', 10, 6);
  const house = place(w, civ, st, 'stone_house', -10, 8);
  for (let i = 0; i < 12; i++) { civ.upkeepTimer = 0; tickUpkeep(w.society, civ, 0.1); }
  const tentLoss = 1 - tent.health / BUILDING_TYPES.tent.health;
  const houseLoss = 1 - house.health / BUILDING_TYPES.stone_house.health;
  assert(tentLoss > houseLoss * 3 && tentLoss > 0.05, `the tent wears faster (${(tentLoss * 100).toFixed(0)}% vs ${(houseLoss * 100).toFixed(0)}%)`);
}

section('Builders mend worn buildings');
{
  const w = emptyWorld();
  const civ = addCiv(w, 'Mendia', 60, 40, 8);
  for (const b of w.terrain.buildings.values()) if (b.civId === civ.id) w.terrain.advanceConstruction(b.id, 1e9);
  const st = settlementsOf(civ)[0];
  st.stock = { wood: 50, stone: 50, fibre: 20, grain: 40 };
  const hut = place(w, civ, st, 'hut', 8, 5);
  hut.health = BUILDING_TYPES.hut.health * 0.4;
  w.terrain.damageBuilding(hut.id, 0.001);
  assert(upkeepWork(w.terrain, st).damaged >= 1, 'the worn hut is noticed');
  const builder = w.ecosystem.entities.find(e => e.civilization === civ && e.isAdult);
  builder.job = 'builder';
  st.assignTimer = 1e9;
  const before = hut.health;
  for (let i = 0; i < 80 && hut.health < BUILDING_TYPES.hut.health * REPAIR_BELOW; i++) { step(w, 40); builder.job = 'builder'; }
  assert(hut.health > before + 10, `it was repaired (${Math.round(before)} -> ${Math.round(hut.health)})`);
}

section('Ruins in the middle of town are cleared; the salvage returns to the stockpile');
{
  const w = emptyWorld();
  const civ = addCiv(w, 'Clearia', 60, 40, 8);
  for (const b of w.terrain.buildings.values()) if (b.civId === civ.id) w.terrain.advanceConstruction(b.id, 1e9);
  const st = settlementsOf(civ)[0];
  st.stock = { grain: 40 };
  const house = place(w, civ, st, 'stone_house', 7, 5);
  const ruin = w.terrain.removeBuilding(house.id, { ruins: true });
  assert(ruin && ruin.type === 'ruins', 'a house fell into ruins in the centre of town');
  const builder = w.ecosystem.entities.find(e => e.civilization === civ && e.isAdult);
  builder.job = 'builder';
  st.assignTimer = 1e9;
  st.town.cooldown = 1e9; // (no new plan is raised on top of the rubble meanwhile)
  for (let i = 0; i < 80 && w.terrain.buildings.has(ruin.id); i++) { step(w, 40); builder.job = 'builder'; }
  assert(!w.terrain.buildings.has(ruin.id), 'the ruins were cleared');
  assert((st.stock.stone || 0) > 0, `and the stone was salvaged (${st.stock.stone || 0})`);
  // ruins far outside the town stay
  const far = place(w, civ, st, 'hut', 60, 10);
  const farRuin = w.terrain.removeBuilding(far.id, { ruins: true });
  assert(upkeepWork(w.terrain, st).ruins === 0 || Math.hypot(farRuin.x - st.x, farRuin.y - st.y) <= 26, 'ruins far from town are left alone');
}

summary();
