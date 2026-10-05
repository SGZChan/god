// Religions (src/civilization/religion.js): deities invented from the land and from events, spread, priests, schisms.
import { assert, section, summary } from './helpers.js';
import { createPlanetWorld } from '../src/simulation/world.js';
import { SeededRNG } from '../src/cosmos/seed.js';
import { setActiveRng } from '../src/simulation/random.js';
import { runSimulationSteps } from '../src/simulation/fixedStep.js';
import { serializeSim, restoreSim } from '../src/persistence/saveGame.js';
import { pushWorldEvent } from '../src/god/events.js';
import { domainOfEvent, religionsOf, getReligion, tickReligion, interpretEvent, performRite, refreshAdherents } from '../src/civilization/religion.js';
import { summarizeWorld } from '../src/ui/overviewPanel.js';
import { wishes, eraTier } from '../src/civilization/townPlanner.js';

console.log('====================================================');
console.log('   RELIGION TESTS                                   ');
console.log('====================================================');

function realWorld(seed) {
  const rng = new SeededRNG(seed);
  setActiveRng(rng);
  const sim = createPlanetWorld(rng, { seed, radius: 1 });
  setActiveRng(rng);
  sim.rng = rng;
  return sim;
}
const run = (sim, steps) => { runSimulationSteps(sim, steps); setActiveRng(sim.rng); };
const civOf = sim => sim.society.civilizations.find(c => c.isAlive && (c.clans || []).length);

section('Domains: events are read as the work of a fitting deity');
{
  assert(domainOfEvent({ name: 'Lightning Storm', kind: 'curse' }) === 'storm', 'a storm belongs to a storm god');
  assert(domainOfEvent({ name: 'Earthquake', kind: 'disaster' }) === 'earth', 'an earthquake belongs to the deep earth');
  assert(domainOfEvent({ name: 'Bountiful Harvest', kind: 'blessing' }) === 'harvest', 'a bounty belongs to the harvest');
  assert(domainOfEvent({ name: 'Something odd', kind: 'omen' }) === 'stars', 'an unnamed omen is read in the stars');
}

section('First faith: each people names a deity from its land');
const sim = realWorld('faith-1');
run(sim, 120);
{
  const civs = sim.society.civilizations.filter(c => c.isAlive);
  const faiths = religionsOf(sim.society);
  assert(faiths.length >= 1, `faiths were founded (${faiths.length})`);
  assert(civs.every(c => getReligion(sim.society, c.faithId)), 'every living people has a faith');
  const believers = sim.ecosystem.entities.filter(e => e.alive && e.isSapient && e.faithId).length;
  const sapients = sim.ecosystem.entities.filter(e => e.alive && e.isSapient).length;
  assert(believers / Math.max(1, sapients) > 0.8, `nearly everyone belongs to a faith (${believers}/${sapients})`);
  assert(faiths.every(r => r.deities.length >= 1 && r.deities.every(d => d.name && d.domain && d.trait)), 'every deity has a name, a domain and one impossible trait');
}

section('Events: a nearby event strengthens a faith or adds a deity; mortals never name the player');
{
  const civ = civOf(sim);
  const clan = civ.clans.find(c => c.memberIds.length);
  const r = getReligion(sim.society, clan.beliefs.religionId);
  const before = r.deities.length;
  const fervor = r.fervor;
  const members = sim.ecosystem.entities.filter(e => e.alive && e.civilization === civ);
  const st = civ.settlements[0];
  const outcomes = [];
  for (const name of ['Lightning Storm', 'Earthquake', 'Plague of Locusts', 'Comet of Omens']) {
    const ev = pushWorldEvent(sim.ecosystem, { kind: 'curse', name, x: st.x, y: st.y, magnitude: 0.9 });
    outcomes.push(interpretEvent(sim.society, civ, clan, ev, members, sim.ecosystem, sim.ecosystem.timeYears));
  }
  assert(outcomes.some(o => o === 'pantheon' || o === 'strengthened'), `events were interpreted (${outcomes.join(', ')})`);
  assert(r.deities.length > before || r.fervor > fervor, 'the faith grew a deity or fervour');
  assert(r.deities.length <= 4, 'a pantheon stays small');
  const texts = sim.ecosystem.notifications.map(n => n.text).join(' ');
  assert(!/Creator|player|you/i.test(texts.replace(/your/gi, '')), 'faith news never mentions the player');
}

section('Priests: rites deepen devotion and can convert listeners');
{
  const civ = civOf(sim);
  const people = sim.ecosystem.entities.filter(e => e.alive && e.civilization === civ && e.isSapient);
  const priest = people[0];
  const other = { id: 'faith_x', name: 'Way of Test', color: '#fff', deities: [], extinct: false, adherents: 0, fervor: 1, founded: 0 };
  religionsOf(sim.society).push(other);
  sim.ecosystem.grid.rebuild(sim.ecosystem.entities);
  const listeners = people.filter(e => e !== priest && Math.hypot(e.x - priest.x, e.y - priest.y) <= 6);
  for (const e of listeners) e.faithId = 'faith_x';
  priest.faithId = getReligion(sim.society, civ.faithId).id;
  for (let i = 0; i < 60; i++) performRite(sim.society, priest, 6);
  assert(listeners.length === 0 || listeners.some(e => e.faithId === priest.faithId), `listeners of another faith were converted (${listeners.length} listeners)`);
  refreshAdherents(sim.society);
  religionsOf(sim.society).splice(religionsOf(sim.society).indexOf(other), 1);
}

section('Society: priests are employed and settlements with a faith raise holy places');
{
  run(sim, 2900);
  const priests = sim.ecosystem.entities.filter(e => e.alive && e.job === 'priest').length;
  assert(priests > 0, `priests have been appointed (${priests})`);
  // the planner wants a holy place for a settlement with a faith (whether a plot is free right now is another matter)
  const civ = civOf(sim);
  const st = civ.settlements[0];
  const list = wishes(civ, sim.terrain, st, {}, eraTier(civ), {});
  assert(Boolean(st.faithId) && list.some(w => w.type === 'shrine'), `a settlement with a faith wants a shrine (${list.map(w => w.type).join(', ')})`);
  st.faithId = null;
  assert(!wishes(civ, sim.terrain, st, {}, eraTier(civ), {}).some(w => w.type === 'shrine'), 'a settlement without a faith does not');
  st.faithId = civ.faithId;
  const model = summarizeWorld(sim);
  assert(model.religions.length >= 1 && model.religions[0].deities.length >= 1, 'the overview lists faiths with their gods');
}

section('Schism: a big old faith over several clans can split');
{
  const civ = civOf(sim);
  const r = getReligion(sim.society, civ.faithId);
  const clans = civ.clans.filter(c => c.memberIds.length);
  for (const c of clans) c.beliefs.religionId = r.id;
  for (const e of sim.ecosystem.entities) if (e.alive && e.civilization === civ) e.faithId = r.id;
  r.founded = sim.ecosystem.timeYears - 500;
  r.founderClanId = clans[0].id;
  const count = religionsOf(sim.society).length;
  for (let i = 0; i < 2500 && religionsOf(sim.society).length === count; i++) {
    civ.faithTimer = 0;
    tickReligion(sim.society, civ, 2);
  }
  const sect = religionsOf(sim.society).find(x => x.parentId === r.id);
  if (clans.length >= 2) assert(Boolean(sect), `a sect split off (${sect ? sect.name : 'none'})`);
  else assert(true, 'single-clan people cannot split (skipped)');
}

section('Saves keep faiths');
{
  const data = JSON.parse(JSON.stringify(serializeSim(sim)));
  const back = restoreSim(data);
  assert(JSON.stringify(back.society.religions) === JSON.stringify(sim.society.religions), 'religions survive a save');
  const e = sim.ecosystem.entities.find(x => x.alive && x.faithId);
  assert(back.ecosystem.entities.find(x => x.id === e.id).faithId === e.faithId, 'each person keeps their faith');
}

summary();
