import { assert, section, summary, addCiv, addHuman, emptyWorld } from './helpers.js';
import { civStatus, eraProgress, summarizeWorld } from '../src/ui/overviewPanel.js';
import { ERAS } from '../src/civilization/techTree.js';
import { TRUCE_DURATION } from '../src/civilization/society.js';

console.log('====================================================');
console.log('   PHASE 3 TESTS — WORLD OVERVIEW MODEL             ');
console.log('====================================================');

section('Overview: civilization status');
{
  const w = emptyWorld();
  const a = addCiv(w, 'Alpha', 10, 20, 2);
  const b = addCiv(w, 'Beta', 14, 20, 2);
  assert(civStatus(a).kind === 'peace', 'a civ at peace shows Peace');
  a.declareWar(b, w.ecosystem, 'test');
  assert(civStatus(a).kind === 'war' && civStatus(a).label === 'At war with Beta', 'a warring civ names its enemy');
  a.endWar(w.ecosystem, 'test', null);
  assert(civStatus(a).kind === 'truce' && a.truce === TRUCE_DURATION, 'after a war the civ shows Truce');
}

section('Overview: era progress');
{
  const w = emptyWorld();
  const a = addCiv(w, 'Alpha', 10, 20, 2);
  a.era = ERAS[0];
  a.techPoints = ERAS[1].reqPoints / 2;
  const half = eraProgress(a);
  assert(Math.abs(half.percent - 50) < 1e-9 && half.nextName === ERAS[1].name, 'halfway to the next era reads 50%');
  a.era = ERAS[ERAS.length - 1];
  const top = eraProgress(a);
  assert(top.percent === 100 && top.nextName === null, 'the final era is full with no next era');
  a.era = ERAS[1];
  a.techPoints = 0;
  assert(eraProgress(a).percent === 0, 'progress never goes below 0');
}

section('Overview: world summary');
{
  const w = emptyWorld();
  const a = addCiv(w, 'Alpha', 10, 20, 3);
  const b = addCiv(w, 'Beta', 40, 20, 2);
  b.collapse(w.terrain, 'test', w.ecosystem);
  const wild = w.ecosystem.speciesCatalog.filter(s => !s.sapient);
  for (const s of wild) s.population = 0;
  const [deer, wolf, quiet] = wild;
  deer.population = 7;
  w.ecosystem.extinctions.push(wolf.name);
  w.society.refreshCensus();

  const model = summarizeWorld({ ...w, planet: { name: 'Test World' } });
  assert(model.planetName === 'Test World', 'planet name is included');
  assert(model.civs.length === 1 && model.civs[0].name === 'Alpha', 'only living civs are listed');
  assert(model.fallen === 1, 'fallen civs are counted');
  assert(model.civs[0].citizens === 3, 'citizens come from the census');
  assert(model.creatures === 5, 'living creatures are counted (3 citizens + 2 survivors of the fallen civ)');
  const listed = Object.fromEntries(model.wildlife.map(x => [x.id, x]));
  assert(listed[deer.id] && listed[deer.id].count === 7 && !listed[deer.id].extinct, 'living wildlife shows its count');
  assert(listed[wolf.id] && listed[wolf.id].extinct, 'extinct species are flagged');
  assert(!model.wildlife.some(x => w.ecosystem.speciesCatalog.find(s => s.id === x.id).sapient), 'the sapient species is not listed as wildlife');
  assert(!listed[quiet.id], 'species with no members that never went extinct are hidden');
}

summary();
