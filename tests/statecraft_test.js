// Statecraft (src/civilization/statecraft.js): rulers and succession, legitimacy, war motives, weariness, revolts.
import { assert, section, summary, emptyWorld, addCiv } from './helpers.js';
import { tickStatecraft, warMotive, rankOf, secede, titleOf, STATE_TICK } from '../src/civilization/statecraft.js';
import { settlementsOf } from '../src/civilization/settlements.js';
import { foundHamlet } from '../src/civilization/townPlanner.js';
import { siteNear } from '../src/civilization/expansion.js';
import { GOVERNMENTS } from '../src/civilization/society.js';

console.log('====================================================');
console.log('   STATECRAFT TESTS                                 ');
console.log('====================================================');

const tick = (w, civ, n = 1) => { for (let i = 0; i < n; i++) { civ.stateTimer = 0; tickStatecraft(w.society, civ, 0.1); } };

section('A ruler is chosen by the custom of the government, and succession matters');
{
  const w = emptyWorld();
  const civ = addCiv(w, 'Rulia', 40, 60, 8);
  civ.government = GOVERNMENTS.find(g => g.id === 'MONARCHY');
  w.society.refreshCensus();
  tick(w, civ);
  const first = w.ecosystem.byId.get(civ.rulerId);
  assert(first && first.civilization === civ && first.isAdult, 'an adult citizen rules');
  assert(titleOf(civ) === 'King', 'a monarch is a king');
  const before = civ.legitimacy;
  first.die('Old Age');
  tick(w, civ);
  const second = w.ecosystem.byId.get(civ.rulerId);
  assert(second && second.alive && second !== first, 'a new ruler takes over');
  assert(civ.legitimacy < before - 5 || (second.parents || []).includes(first.id), 'a succession without an heir costs legitimacy');
}

section('Legitimacy follows prosperity and unrest');
{
  const w = emptyWorld();
  const civ = addCiv(w, 'Fairia', 40, 60, 8);
  w.society.refreshCensus();
  civ.legitimacy = 50;
  civ.prosperity = 1.3;
  civ.unrest = 0;
  tick(w, civ, 60);
  const good = civ.legitimacy;
  civ.prosperity = 0.4;
  civ.unrest = 0.9;
  tick(w, civ, 60);
  assert(good > 52 && civ.legitimacy < good - 10, `a fed people trust the state (${Math.round(good)}), a starving one does not (${Math.round(civ.legitimacy)})`);
}

section('War needs a motive: vengeance, ambition, resources; and weariness forbids it');
{
  const w = emptyWorld();
  const a = addCiv(w, 'Aggria', 40, 60, 8);
  const b = addCiv(w, 'Meekia', 70, 60, 8);
  a.militaryStrength = 30; b.militaryStrength = 30;
  a.legitimacy = 70; a.weariness = 0; a.grievance = {};
  assert(warMotive(a, b, w.terrain) === null, 'neighbours of equal strength with no quarrel stay at peace');
  a.grievance[b.id] = 60;
  const m = warMotive(a, b, w.terrain);
  assert(m && /Vengeance/.test(m.reason), 'a grievance is a motive for vengeance');
  a.weariness = 50;
  assert(warMotive(a, b, w.terrain) === null, 'a war-weary people will not fight again yet');
  a.weariness = 0; a.grievance = {}; a.militaryStrength = 90; a.government = GOVERNMENTS.find(g => g.id === 'CHIEFTAINCY');
  const c = warMotive(a, b, w.terrain);
  assert(c && /Conquest/.test(c.reason), 'a strong martial state covets its weak neighbour');
  a.militaryStrength = 30; a.legitimacy = 20;
  const r = warMotive(a, b, w.terrain);
  assert(r && /rally/.test(r.reason), 'a ruler losing the people starts a rally-round-the-flag war');
}

section('War weariness ends a long war; the lost war leaves a grievance');
{
  const w = emptyWorld();
  const a = addCiv(w, 'Tirelia', 40, 60, 8);
  const b = addCiv(w, 'Tiredia', 100, 60, 8);
  w.society.refreshCensus();
  a.declareWar(b, w.ecosystem, 'test');
  a.warTimer = 100;
  a.weariness = 90;
  tick(w, a);
  assert(!a.warTarget, 'the people demanded peace');
  assert((a.grievance[b.id] || 0) > 0 && (b.grievance[a.id] || 0) > 0, 'both remember the war');
}

section('Rank grows with size');
{
  const w = emptyWorld();
  const civ = addCiv(w, 'Ranka', 40, 60, 4);
  civ.citizens = 10;
  assert(rankOf(civ) === 'Tribe', 'a few families are a tribe');
  civ.citizens = 40;
  const site = siteNear(w.terrain, civ, w.society.civilizations, 85, 60);
  foundHamlet(civ, w.terrain, site, { instant: true });
  assert(rankOf(civ) === 'Kingdom', 'forty citizens in two towns are a kingdom');
}

section('Revolt: a far town breaks away and founds a new civilization with its people');
{
  const w = emptyWorld();
  const civ = addCiv(w, 'Overia', 40, 60, 8);
  const site = siteNear(w.terrain, civ, w.society.civilizations, 100, 60);
  const town = foundHamlet(civ, w.terrain, site, { instant: true });
  const settlers = w.ecosystem.entities.slice(0, 0);
  w.society.spawnCitizens(civ, 12);
  w.society.refreshCensus();
  let k = 0;
  for (const e of w.ecosystem.entities) if (e.civilization === civ && e.isAdult && k < 6) { e.settlementId = town.id; k++; }
  w.society.refreshCensus();
  civ.techPoints = 300;
  const civsBefore = w.society.civilizations.length;
  const nation = secede(w.society, civ, town);
  w.society.refreshCensus();
  assert(w.society.civilizations.length === civsBefore + 1 && nation.isAlive, 'a new civilization exists');
  assert(settlementsOf(nation).includes(town) && !settlementsOf(civ).includes(town), 'it owns the town');
  assert(nation.citizens >= 4, `with its people (${nation.citizens})`);
  assert(nation.era === civ.era && nation.techPoints > 0, 'and its parent\'s knowledge');
  assert((civ.grievance[nation.id] || 0) > 40, 'the old state will not forget');
  void settlers;
}

section('A failing state loses its far towns, and then its ruler');
{
  const w = emptyWorld();
  const civ = addCiv(w, 'Doomia', 40, 60, 8);
  const site = siteNear(w.terrain, civ, w.society.civilizations, 100, 60);
  const town = foundHamlet(civ, w.terrain, site, { instant: true });
  town.population = 10;
  w.society.refreshCensus();
  civ.legitimacy = 10;
  civ.unrest = 0.9;
  const gov = civ.government.id;
  let changed = false;
  for (let i = 0; i < 200 && !changed; i++) { civ.legitimacy = Math.min(civ.legitimacy, 12); civ.unrest = 0.9; tick(w, civ); changed = civ.government.id !== gov || !settlementsOf(civ).includes(town); }
  assert(changed, 'a hated, restless state loses a town or its government');
}

summary();
