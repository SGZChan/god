// Expansion (src/civilization/expansion.js): wanted resources, outposts by deposits, wars of conquest and annexation.
import { assert, section, summary, emptyWorld, addCiv } from './helpers.js';
import { wantedResources, covetedDeposit, annexRegion, tryOutpost, siteNear } from '../src/civilization/expansion.js';
import { ERAS } from '../src/civilization/techTree.js';
import { settlementsOf } from '../src/civilization/settlements.js';
import { foundHamlet } from '../src/civilization/townPlanner.js';

console.log('====================================================');
console.log('   EXPANSION TESTS                                  ');
console.log('====================================================');

section('Wanted resources follow the ages');
{
  const w = emptyWorld();
  const civ = addCiv(w, 'Wantia', 40, 30, 4);
  assert(wantedResources(civ).has('copper') && wantedResources(civ).has('tin'), 'a Stone Age people wants copper and tin (for bronze)');
  civ.era = ERAS[3];
  const later = wantedResources(civ);
  assert(later.has('gold') && later.has('stone') && later.has('iron'), 'a medieval people wants gold, stone and iron');
}

section('Outposts: settlers go to a needed deposit far from home');
{
  const w = emptyWorld();
  const civ = addCiv(w, 'Outia', 40, 60, 0);
  w.society.spawnCitizens(civ, 20);
  w.society.refreshCensus();
  // one big clan (in play clans grow by births; founders start as couples)
  const big = civ.clans[0];
  for (const e of w.ecosystem.entities) if (e.civilization === civ) e.clanId = big.id;
  for (const c of civ.clans) c.memberIds = w.ecosystem.entities.filter(e => e.clanId === c.id).map(e => e.id);
  const st = settlementsOf(civ)[0];
  st.town.ready = true;
  civ.knownDeposits = [{ type: 'copper', x: st.x + 45, y: st.y }];
  const before = settlementsOf(civ).length;
  const outpost = tryOutpost(w.society, civ);
  assert(Boolean(outpost) && settlementsOf(civ).length === before + 1, 'an outpost was founded');
  assert(outpost && Math.hypot(outpost.x - (st.x + 45), outpost.y - st.y) < 12, 'beside the deposit');
  assert(outpost && outpost.purpose === 'copper', 'and it knows why it is there');
  assert(tryOutpost(w.society, civ) === null, 'one outpost at a time (a cooldown follows)');
}

section('Conquest: a neighbour\'s deposit is coveted; the winner annexes the region and its town');
{
  const w = emptyWorld();
  const a = addCiv(w, 'Aggressia', 40, 60, 6);
  const b = addCiv(w, 'Borderia', 85, 60, 6);
  const site = siteNear(w.terrain, b, w.society.civilizations, 105, 60);
  const town = foundHamlet(b, w.terrain, site, { instant: true });
  for (let dx = -6; dx <= 6; dx++) for (let dy = -6; dy <= 6; dy++) {
    const t = w.terrain.getTile(site.x + dx, site.y + dy);
    t.civId = b.id;
    b.territory.push({ x: site.x + dx, y: site.y + dy });
  }
  a.knownDeposits = [{ type: 'tin', x: site.x + 2, y: site.y + 1 }];
  const goal = covetedDeposit(a, b, w.terrain);
  assert(goal && goal.type === 'tin', 'the tin inside Borderia is coveted');
  const people = w.ecosystem.entities.filter(e => e.civilization === b && e.settlementId === town.id);
  const res = annexRegion(w.society, a, b, goal);
  assert(res.tiles > 0 && w.terrain.getTile(site.x, site.y).civId === a.id, `the land changed hands (${res.tiles} tiles)`);
  assert(res.town === town && settlementsOf(a).includes(town) && !settlementsOf(b).includes(town), 'the hamlet there now belongs to the winner');
  assert(people.every(e => e.civilization === a), 'and so do its people');
  assert([...w.terrain.buildings.values()].filter(x => x.settlementId === town.id).every(x => x.civId === a.id), 'and its buildings');
}

section('War ends with a claim that is annexed on the next tick');
{
  const w = emptyWorld();
  const a = addCiv(w, 'Victoria', 40, 60, 6);
  const b = addCiv(w, 'Vanquia', 100, 60, 6);
  a.warGoal = { type: 'iron', x: 100, y: 60 };
  a.declareWar(b, w.ecosystem, 'test');
  a.endWar(w.ecosystem, 'test', a);
  assert(a.pendingAnnex && a.pendingAnnex.loserId === b.id, 'the winner holds a claim on the land it fought for');
  assert(!a.warGoal && !b.warGoal, 'the war goals are cleared');
}

summary();
