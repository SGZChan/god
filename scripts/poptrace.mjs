// Population per civilization every `every` years, with deaths by cause and average hunger of sapients.
// Usage: node scripts/poptrace.mjs [seed] [years] [every]
import { createPlanetWorld } from '../src/simulation/world.js';
import { SeededRNG } from '../src/cosmos/seed.js';
import { setActiveRng } from '../src/simulation/random.js';
import { runSimulationSteps } from '../src/simulation/fixedStep.js';
import { popCap, housingCapacityOfCiv, openSites, settlementsOf } from '../src/civilization/settlements.js';
import { Entity } from '../src/life/entity.js';
const [seed = 'soak-1', years = '120', every = '10'] = process.argv.slice(2);
let deaths = {};
const od = Entity.prototype.die;
Entity.prototype.die = function (c = '?') { const was = this.alive; od.call(this, c); if (was && this.isSapient) { const k = c.replace(/Killed in War.*/, 'War').replace(/Hunted by .*/, 'Hunted').replace(/Executed.*/, 'Executed'); deaths[k] = (deaths[k] || 0) + 1; } };
const rng = new SeededRNG(seed); setActiveRng(rng);
const sim = createPlanetWorld(rng, { seed, radius: 1 }); setActiveRng(rng);
for (let y = 0; y < Number(years); y += Number(every)) {
  runSimulationSteps(sim, Number(every) * 80);
  const live = sim.ecosystem.entities.filter(e => e.alive && e.isSapient);
  const kids = live.filter(e => !e.isAdult).length;
  const preg = live.filter(e => e.pregnancy).length;
  const hung = live.reduce((a, e) => a + e.hunger, 0) / Math.max(1, live.length);
  console.log(`y${y + Number(every)} sapients ${live.length} (kids ${kids}, pregnant ${preg}, hunger ${hung.toFixed(0)}) civs ${sim.society.civilizations.map(c => c.citizens).join('/')} deaths ${JSON.stringify(deaths)}`);
  const ev = {}; for (const n of sim.ecosystem.notifications) { const k = (n.text.match(/Revolt|WAR DECLARED|Peace|Revolution|disputed|kingdom|abandoned|annexed|Crusade/) || ['other'])[0]; ev[k] = (ev[k] || 0) + 1; }
  console.log('   events so far', JSON.stringify(ev), 'civs', sim.society.civilizations.filter(c => c.isAlive).map(c => `${c.name.slice(0, 12)}:${c.citizens}:${c.rank || '-'}:L${Math.round(c.legitimacy || 0)}`).join(' '));
  const c0 = sim.society.civilizations.slice().sort((a, b) => b.citizens - a.citizens)[0];
  const sts = settlementsOf(c0);
  console.log('   top civ', c0.name, 'cap', popCap(sim.terrain, c0), 'housing', housingCapacityOfCiv(sim.terrain, c0), 'openSites', sts.reduce((a, st) => a + openSites(sim.terrain, st).length, 0), 'homeless', sts.reduce((a, st) => a + (st.homeless || 0), 0), 'builders', sts.reduce((a, st) => a + (st.jobs.builder || 0), 0), 'wood', sts.map(st => Math.round(st.stock.wood || 0)).join(','), 'era', c0.era.id);
  const act = {}; for (const e of sim.ecosystem.entities) if (e.alive && e.civilization === c0 && e.isAdult) { const k = (e.job || 'none') + ':' + (e.state || '?'); act[k] = (act[k] || 0) + 1; }
  console.log('   ', JSON.stringify(act), 'need', JSON.stringify(Object.fromEntries(Object.entries(sts[0].need || {}).map(([k, v]) => [k, +v.toFixed(2)]))));
  for (const st of sts) for (const b of openSites(sim.terrain, st)) console.log('     site', b.type, 'prog', b.progress.toFixed(2), 'delivered', JSON.stringify(b.delivered || b.materials || {}), 'stock', JSON.stringify(Object.fromEntries(Object.entries(st.stock).filter(([k, v]) => v >= 1 && ['wood', 'fibre', 'stone'].includes(k)).map(([k, v]) => [k, Math.round(v)]))));
  deaths = {};
}
