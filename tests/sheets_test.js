// Ready-made sprite sheets and the workshop's creature options (art/sheetSprites.js, ecosystem.createCustomSpecies).
import fs from 'node:fs';
import { assert, section, summary, emptyWorld } from './helpers.js';
import { pickSheet, DIR_ROW, WALK_FRAMES } from '../src/art/sheetSprites.js';
import { Entity } from '../src/life/entity.js';
import { serializeSim, restoreSim } from '../src/persistence/saveGame.js';
import { ARCHETYPES, PART_ROWS } from '../src/workshop/appearanceEditor.js';
import { PART_COUNTS } from '../src/life/genome.js';
import { createPlanetWorld } from '../src/simulation/world.js';
import { SeededRNG } from '../src/cosmos/seed.js';
import { setActiveRng } from '../src/simulation/random.js';

console.log('====================================================');
console.log('   SPRITE SHEET AND WORKSHOP TESTS                  ');
console.log('====================================================');

section('The sprite catalogue is complete and every file exists');
{
  const m = JSON.parse(fs.readFileSync('public/sprites/manifest.json', 'utf8'));
  assert(m.sheets.length > 300, `${m.sheets.length} sheets`);
  const missing = m.sheets.filter(s => !fs.existsSync(`public/sprites/pipoya/${s.file}`));
  assert(missing.length === 0, 'every sheet file is there');
  assert(new Set(m.sheets.map(s => s.id)).size === m.sheets.length, 'ids are unique');
  const cats = new Set(m.sheets.map(s => s.cat));
  assert(['people', 'soldier', 'monster', 'animal', 'boss'].every(c => cats.has(c)), 'people, soldiers, monsters, animals and a boss');
  assert(m.sheets.some(s => s.sex === 'F') && m.sheets.some(s => s.sex === 'M'), 'people come in both sexes');
  assert(DIR_ROW.down === 0 && DIR_ROW.up === 3 && WALK_FRAMES.length === 4, 'RPG-Maker layout: four facings, a walking cycle');
  assert(fs.existsSync('docs/CREDITS.md'), 'the artists are credited');
}

section('A creature is drawn with its own sheet, else its species\' sheet by sex');
{
  const w = emptyWorld();
  const sp = w.ecosystem.createCustomSpecies({ name: 'Sheetfolk', type: 'humanoid', diet: 'omnivore', size: 1, speed: 1, lifespan: 50, coldResist: 0.5, heatResist: 0.5, look: { head: 6, body: 5, legs: 1 }, sheets: { any: ['male-01-1', 'male-02-1'], F: 'female-01-1' } });
  const f = new Entity({ species: sp, sex: 'F', x: 5, y: 5 });
  const m1 = new Entity({ species: sp, sex: 'M', x: 5, y: 5 });
  assert(f.sheetId === 'female-01-1', 'females use the female sheet');
  assert(['male-01-1', 'male-02-1'].includes(m1.sheetId) && m1.sheetId === m1.sheetId, 'males use one of the shared sheets, always the same one');
  m1.appearance = { ...m1.appearance, sheet: 'soldier-soldier-01-1' };
  assert(m1.sheetId === 'soldier-soldier-01-1', 'an individual\'s own sheet wins');
  assert(new Entity({ species: w.ecosystem.speciesCatalog[1], x: 1, y: 1 }).sheetId === null, 'a gene-built species has none');
  assert(pickSheet(['a', 'b', 'c'], 'x') === pickSheet(['a', 'b', 'c'], 'x'), 'the pick is stable');
  // a daughter species keeps the look
  const kid = w.ecosystem.registry.found({ ...sp.centroid }, { ancestorId: sp.id, sheets: sp.sheets });
  assert(kid.sheets === sp.sheets, 'speciation keeps the sprite sheets');
}

section('Workshop options reach the species: traits, sheets, archetypes; sheets survive a save');
{
  setActiveRng(new SeededRNG('sheets'));
  const w = createPlanetWorld(new SeededRNG('sheets'), { seed: 'sheets', radius: 1 });
  setActiveRng(new SeededRNG('sheets'));
  const sp = w.ecosystem.createCustomSpecies({ name: 'Fierce', type: 'herbivore', diet: 'herbivore', size: 1, speed: 1, lifespan: 30, coldResist: 0.5, heatResist: 0.5, look: { head: 14, body: 1 }, traits: { aggression: 0.95, sociality: 0.1, fertility: 0.9, intelligence: 0.6 }, sheets: { any: 'animal-cat-01-1' } });
  assert(sp.centroid.aggression > 0.9 && sp.centroid.sociality < 0.15 && sp.centroid.fertility > 0.85, 'traits set in the workshop are the species\' genes');
  assert(Math.abs(sp.centroid.intelligence - 0.6) < 0.05, 'including intelligence');
  const sap = w.ecosystem.createCustomSpecies({ name: 'Smartfolk', type: 'humanoid', diet: 'omnivore', size: 1, speed: 1, lifespan: 50, coldResist: 0.5, heatResist: 0.5, traits: { intelligence: 0.1 } });
  assert(sap.centroid.intelligence >= 0.8, 'a sapient people stays sapient whatever the slider says');
  const kinds = ARCHETYPES.map(a => a.id);
  assert(kinds.length >= 14 && ['elf', 'dwarf', 'orc', 'dragonkin', 'shark', 'alien'].every(k => kinds.includes(k)), `${kinds.length} archetypes to start from`);
  assert(ARCHETYPES.every(a => Object.entries(a.look).every(([g, v]) => !(g in PART_COUNTS) || (v >= 0 && v < PART_COUNTS[g]))), 'every archetype uses parts that exist');
  assert(PART_ROWS.length === 9, 'nine part rows (eight parts and the alien mutation)');
  const cat = w.ecosystem.speciesCatalog.filter(s => s.sheets);
  assert(cat.length >= 3, `the world has wildlife with ready-made sprites (${cat.map(s => s.name).join(', ')})`);
  const founders = w.ecosystem.spawnFounders(sp, 4, w.terrain.home.x, w.terrain.home.y, null, 3);
  assert(founders.every(e => e.sheetId === 'animal-cat-01-1'), 'founders of a sheet species are drawn with it');
  const saved = JSON.parse(JSON.stringify(serializeSim({ ...w, rng: w.rng, planet: {} })));
  const back = restoreSim(saved, 'sheets-back');
  const again = back.ecosystem.speciesCatalog.find(s => s.name === 'Fierce');
  assert(again && again.sheets && again.sheets.any === 'animal-cat-01-1', 'the sheet choice survives a save');
}

section('Several sprites for one species: each creature gets one at random');
{
  setActiveRng(new SeededRNG('multi'));
  const w = createPlanetWorld(new SeededRNG('multi'), { seed: 'multi', radius: 1 });
  setActiveRng(new SeededRNG('multi'));
  const sets = ['animal-cat-01-1', 'animal-cat-01-2', 'animal-cat-01-3'];
  const sp = w.ecosystem.createCustomSpecies({ name: 'Mixed', type: 'herbivore', diet: 'herbivore', size: 1, speed: 1, lifespan: 30, coldResist: 0.5, heatResist: 0.5, sheets: { any: sets } });
  const founders = w.ecosystem.spawnFounders(sp, 16, w.terrain.home.x, w.terrain.home.y, null, 5);
  const used = new Set(founders.map(e => e.sheetId));
  assert(founders.every(e => sets.includes(e.sheetId)) && used.size >= 2, `they wear different sprites from the list (${used.size} of 3 used)`);
}

section('Peoples live all over the world, not only around the start');
{
  setActiveRng(new SeededRNG('far'));
  const w = createPlanetWorld(new SeededRNG('far'), { seed: 'far', radius: 1 });
  setActiveRng(new SeededRNG('far'));
  const home = w.terrain.home;
  const civs = w.society.civilizations;
  const far = civs.filter(c => Math.hypot(c.capitalX - home.x, c.capitalY - home.y) > 100);
  assert(civs.length >= 6 && far.length >= 3, `${far.length} peoples begin far from home (of ${civs.length})`);
  assert(far.every(c => w.ecosystem.entities.some(e => e.civilization === c && e.isSapient)), 'each has its people');
  assert(far.every(c => (c.settlements || []).length >= 1), 'and a camp');
}

summary();
