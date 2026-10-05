// Supply between the settlements of one people. A smithy in one town is useless if the tin lies in another town's
// stores, so porters and caravans carry the raw materials a workshop lacks from the town that has most of them. Also,
// a settlement whose people have all left is abandoned (its buildings fall to ruins) instead of lingering forever.
//
//   tickLogistics(society, civ, dt)   every SUPPLY_TICK simulated seconds
import { RECIPES, take, add } from './economy.js';
import { settlementsOf, countBuilt, buildingsOf } from './settlements.js';
import { eraTier } from './townPlanner.js';
import { BUILDING_TYPES } from '../world/buildings.js';

export const SUPPLY_TICK = 12;
const BATCH = 4;           // units of one material carried per trip
const KEEP = 2;            // a donor never gives away its last units
const ABANDON_AFTER = 90;  // simulated seconds without a single resident

export function tickLogistics(society, civ, dt) {
  civ.supplyTimer = (civ.supplyTimer === undefined ? SUPPLY_TICK : civ.supplyTimer) - dt;
  if (civ.supplyTimer > 0) return;
  civ.supplyTimer = SUPPLY_TICK;
  abandonEmpty(society, civ);
  const all = settlementsOf(civ);
  if (all.length < 2) return;
  const tier = eraTier(civ);
  const terrain = society.terrain;
  for (const rec of RECIPES) {
    if (!rec.at || rec.tier > tier + 1) continue;
    for (const st of all) {
      if (!st.population || countBuilt(terrain, st, rec.at) === 0) continue;
      for (const [k, n] of Object.entries(rec.in)) {
        if ((st.stock[k] || 0) >= n) continue;
        // the town with the most of it (that is not itself short) sends a batch
        let donor = null;
        for (const o of all) {
          if (o === st || (o.stock[k] || 0) <= KEEP + 1) continue;
          if (!donor || o.stock[k] > donor.stock[k]) donor = o;
        }
        if (!donor) continue;
        const sent = take(donor.stock, k, Math.min(BATCH, donor.stock[k] - KEEP));
        add(st.stock, k, sent);
        if (sent > 0) st.supplied = (st.supplied || 0) + 1;
      }
    }
  }
}

function abandonEmpty(society, civ) {
  const all = settlementsOf(civ);
  for (const st of [...all]) {
    if (st.capital || all.length <= 1) continue;
    if (st.population > 0) { st.emptySince = undefined; continue; }
    if (st.emptySince === undefined) { st.emptySince = civ.clock || 0; continue; }
    if ((civ.clock || 0) - st.emptySince < ABANDON_AFTER) continue;
    // a ghost town: the buildings fall to ruins and their goods are carried to the nearest living town
    const heir = all.filter(o => o !== st && o.population > 0).sort((a, b) => Math.hypot(a.x - st.x, a.y - st.y) - Math.hypot(b.x - st.x, b.y - st.y))[0];
    if (heir) for (const [k, v] of Object.entries(st.stock || {})) add(heir.stock, k, v);
    for (const b of buildingsOf(society.terrain, st)) society.terrain.removeBuilding(b.id, { ruins: isHome(b) });
    civ.settlements.splice(civ.settlements.indexOf(st), 1);
    society.ecosystem.notifications.unshift({ text: `🏚️ ${st.name} of ${civ.name} was abandoned.`, time: Date.now() });
  }
}

// only homes leave ruins behind
function isHome(b) {
  return BUILDING_TYPES[b.type] && BUILDING_TYPES[b.type].category === 'housing';
}
