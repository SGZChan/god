// Buildings change with the ages: era-stamped looks, gradual renovation, old homes replaced by new ones.
import { assert, section, summary, emptyWorld, addCiv } from './helpers.js';
import { eraOptions, composeBuilding, styleKey } from '../src/art/buildingSprites.js';
import { ERAS } from '../src/civilization/techTree.js';
import { renovateOne, retireOldHouse, outdatedHouses, eraOfBuilding, styleOf, wishes, eraTier } from '../src/civilization/townPlanner.js';
import { BUILDING_TYPES } from '../src/world/buildings.js';

// a little town whose sites are all finished
function town(name) {
  const w = emptyWorld();
  const civ = addCiv(w, name, 40, 30, 4);
  for (const b of w.terrain.buildings.values()) if (b.civId === civ.id) w.terrain.advanceConstruction(b.id, 1e9);
  return { w, civ, st: civ.settlements[0], t: w.terrain };
}

console.log('====================================================');
console.log('   AGES TESTS                                       ');
console.log('====================================================');

section('Looks: the same building is built of better materials in later ages');
{
  const o = { wall: 'log', wallH: 22, roof: 'thatch', windows: 2 };
  assert(eraOptions(o, 3, 2).era === 3 && eraOptions(o, 3, 2).variant === 2, 'walled buildings are drawn in the architecture of their age and variant');
  assert(eraOptions({ fn: 1 }, 3) .era === undefined, 'buildings with their own art (wells, kilns...) keep it');
  // every age draws a different building, not a recoloured one: compare the shape (opaque pixels) of each age
  const shapes = [0, 1, 2, 3, 4, 5].map(era => {
    const s = composeBuilding('wooden_house', { style: { pal: 'timber', era, variant: 0 } });
    let mask = '';
    for (let i = 3; i < s.data.length; i += 4) mask += s.data[i] > 0 ? '1' : '0';
    return mask;
  });
  assert(new Set(shapes).size === 6, 'each of the six ages has its own silhouette');
  const designs = new Set([0, 1, 2].map(variant => Buffer.from(composeBuilding('wooden_house', { style: { pal: 'timber', era: 3, variant } }).data).toString('base64')));
  assert(designs.size === 3, 'each age has three designs');
  assert(styleKey({ pal: 'stone', era: 2 }) !== styleKey({ pal: 'stone', era: 3 }), 'sprites of different ages are cached apart');
  const a = composeBuilding('granary', { style: { pal: 'timber', era: 0 } });
  const b = composeBuilding('granary', { style: { pal: 'timber', era: 4 } });
  assert(Buffer.compare(Buffer.from(a.data), Buffer.from(b.data)) !== 0, 'a Stone Age and an Industrial granary look different');
  for (const t of ['tenement', 'habitat']) assert(composeBuilding(t, {}).w > 0, `${BUILDING_TYPES[t].name} has art`);
}

section('Renovation: one building at a time, one age at a time');
{
  const { civ, st, t } = town('Agria');
  const list = [...t.buildings.values()].filter(b => b.civId === civ.id && b.progress >= 1);
  for (const b of list) b.style = { ...(b.style || {}), era: 0 };
  civ.era = ERAS[3];
  assert(eraTier(civ) === 3, 'the people are in the Middle Ages');
  const first = renovateOne(civ, t, st);
  assert(first && eraOfBuilding(first) === 1, 'the first renovation lifts one building by a single age');
  const behind = list.filter(b => eraOfBuilding(b) < 3).length;
  assert(behind === list.length, 'the others are untouched so far (the change is gradual)');
  for (let i = 0; i < 200; i++) renovateOne(civ, t, st);
  assert(list.every(b => eraOfBuilding(b) === 3), 'in time every building catches up with the age');
  assert(styleOf(civ, t, 'hut', st.x, st.y).era === 3, 'new buildings are stamped with the current age');
}

section('Renewal: homes of a past age are replaced, never leaving people without beds');
{
  const { civ, st, t } = town('Homia');
  civ.era = ERAS[2];
  const oldHomes = outdatedHouses(t, st, 2);
  assert(oldHomes.length > 0, `old homes count as outdated in the Classical Age (${oldHomes.map(b => b.type).join(', ')})`);
  assert(wishes(civ, t, st, {}, 2, {}).some(x => x.type === 'housing'), 'the planner wants a new home to replace them');
  st.adults = 1e6;
  assert(retireOldHouse(civ, t, st) === null, 'an old home is kept while people still need its beds');
  st.adults = 0;
  const removed = retireOldHouse(civ, t, st);
  assert(removed && !t.buildings.has(removed.id), 'with beds to spare the oldest home is pulled down');
}

summary();
