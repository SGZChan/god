// Firefighting (src/civilization/firefighting.js): citizens run to a fire near their town and put it out.
import { assert, section, summary, emptyWorld, addCiv } from './helpers.js';
import { ensureEffects } from '../src/god/effects.js';
import { extinguish, firesNear } from '../src/civilization/firefighting.js';
import { settlementsOf } from '../src/civilization/settlements.js';
import { ERAS } from '../src/civilization/techTree.js';
import { setActiveRng } from '../src/simulation/random.js';
import { SeededRNG } from '../src/cosmos/seed.js';

console.log('====================================================');
console.log('   FIREFIGHTING TESTS                               ');
console.log('====================================================');

function scenario(withPeople, era = 0) {
  setActiveRng(new SeededRNG('fire'));
  const w = emptyWorld();
  const civ = addCiv(w, 'Flamia', 60, 40, withPeople ? 12 : 0);
  for (const b of w.terrain.buildings.values()) if (b.civId === civ.id) w.terrain.advanceConstruction(b.id, 1e9);
  civ.era = ERAS[era];
  const st = settlementsOf(civ)[0];
  const fx = ensureEffects(w.terrain, w.ecosystem, w.society);
  // a fire on dry forest right beside the town
  const cells = [];
  for (let dx = 0; dx < 4; dx++) for (let dy = 0; dy < 3; dy++) {
    const x = st.x + 9 + dx;
    const y = st.y + 3 + dy;
    const t = w.terrain.getTile(x, y);
    t.flora = 90; t.moisture = 0.2;
    cells.push([x, y, 7]);
  }
  const fire = fx.spawn('wildfire', st.x + 9, st.y + 3, { radius: 2, duration: 260, cells, source: 'god' });
  w.society.refreshCensus();
  return { w, fx, fire, civ, st };
}
const run = (s, n) => { for (let i = 0; i < n; i++) { s.w.ecosystem.update(0.05, 1); s.w.society.update(0.05, 1); s.fx.update(0.05); } };

section('extinguish removes the burning tiles nearest to the fighter');
{
  const s = scenario(false);
  const before = s.fire.cells.length;
  const n = extinguish(s.w.terrain, s.fire, s.st.x + 9.5, s.st.y + 3.5, 2, 0);
  assert(n === 2 && s.fire.cells.length === before - 2, 'two tiles were put out');
  assert(firesNear(s.w.terrain, s.st.x + 10, s.st.y + 4, 5).length > 0, 'the rest still burn');
}

section('Citizens put the fire out; without them it burns on');
{
  const none = scenario(false);
  run(none, 300);
  const burningWithout = none.fire.cells.length;
  const crowd = scenario(true, 2);
  const start = crowd.fire.cells.length;
  let fought = 0;
  for (let i = 0; i < 600; i++) {
    run(crowd, 1);
    if (i % 20 === 0) fought = Math.max(fought, crowd.w.ecosystem.entities.filter(e => e.state === 'FIREFIGHT').length);
  }
  assert(fought > 0, `people ran to the fire (${fought} fighting at once)`);
  assert(crowd.fire.cells.length < burningWithout / 2 || crowd.fire.done, `the fire is smaller with them (${crowd.fire.cells.length} vs ${burningWithout} without)`);
  const burned = crowd.w.ecosystem.entities.filter(e => e.civilization === crowd.civ && !e.alive && /Wildfire|Burn/.test(e.causeOfDeath || '')).length;
  assert(burned <= 2, `and few of them were burned (${burned})`);
}

summary();
