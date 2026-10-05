// Firefighting. A fire in or near a town is everyone's business: citizens drop what they are doing, run to the
// flames, stand beside them (never in them) and put them out, as the ages allow:
//   Stone Age   beating the flames with branches and smothering them with earth       1 burning tile per effort
//   Bronze      water carried from the well in jars and skins                         1
//   Classical   bucket chains from the well (the Roman vigiles)                       2
//   Medieval    bucket chains and fire hooks to pull burning thatch down              2
//   Industrial  hand pumps and steam fire engines                                     4
//   Space Age   foam drones and suppression systems                                   6
// A fire station (a brigade house with its bell) doubles the effort of everyone near it, a well beside the fire adds one.
//
//   fireOptions(ent, c, options)      sapientOptions hook
//   extinguish(terrain, effect, x, y, n, nowYears)   puts out the n burning tiles nearest to (x, y); returns how many
import { settlementsOf, buildingsOf } from './settlements.js';
import { eraTier } from './townPlanner.js';

const REACH = 26;           // citizens notice a fire this close
const WET_YEARS = 1.5;      // a doused tile cannot burn again for this long
const EFFORT = [1, 1, 2, 2, 4, 6];
let helpers = { walkTo: () => false, say: () => {} };
export function registerHelpers(h) { helpers = h; }

export function firesNear(terrain, x, y, r) {
  const out = [];
  const list = (terrain.effects && terrain.effects.list) || [];
  for (const e of list) {
    if (e.type !== 'wildfire' || !e.cells || !e.cells.length) continue;
    for (const c of e.cells) {
      const d = Math.hypot(c[0] + 0.5 - x, c[1] + 0.5 - y);
      if (d <= r) out.push({ effect: e, cell: c, d });
    }
  }
  return out.sort((a, b) => a.d - b.d);
}

export function extinguish(terrain, effect, x, y, n, nowYears) {
  const near = effect.cells.map((c, i) => ({ i, d: Math.hypot(c[0] + 0.5 - x, c[1] + 0.5 - y) })).filter(o => o.d < 3.2).sort((a, b) => a.d - b.d).slice(0, n);
  const drop = new Set(near.map(o => o.i));
  for (const o of near) {
    const c = effect.cells[o.i];
    const tile = terrain.getTile(c[0], c[1]);
    if (tile) tile.wetT = nowYears + WET_YEARS;
  }
  effect.cells = effect.cells.filter((_, i) => !drop.has(i));
  if (!effect.cells.length) effect.done = true;
  return near.length;
}

function stationNear(terrain, st, x, y) {
  for (const b of buildingsOf(terrain, st)) if (b.type === 'fire_station' && b.progress >= 1 && Math.hypot(b.x - x, b.y - y) < 45) return true;
  return false;
}

export function fireOptions(ent, c, options) {
  if (!ent.isAdult || ent.isSpecialIndividual || ent.hunger > 80 || (ent.status && ent.status.burning > 0)) return false;
  const { terrain, civ, st, ecosystem } = c;
  // only fires that threaten the people's own land: near a settlement of theirs
  const fires = firesNear(terrain, ent.x, ent.y, REACH);
  if (!fires.length) return false;
  const threat = fires.find(f => settlementsOf(civ).some(s => Math.hypot(s.x - f.cell[0], s.y - f.cell[1]) < 24));
  if (!threat) return false;
  const { cell, effect } = threat;
  options.push({ score: 0.97, run: () => {
    const cx = cell[0] + 0.5;
    const cy = cell[1] + 0.5;
    const dx = ent.x - cx;
    const dy = ent.y - cy;
    const len = Math.hypot(dx, dy) || 1;
    // stand two tiles from the flames on the near side, never in them
    const sx = cx + (dx / len) * 2;
    const sy = cy + (dy / len) * 2;
    if (Math.hypot(ent.x - cx, ent.y - cy) > 3 || ent.path.length) {
      helpers.say(ent, 'Running to the fire');
      ent.state = 'FIREFIGHT';
      if (!helpers.walkTo(ent, c, Math.floor(sx), Math.floor(sy), 1.4) && Math.hypot(ent.x - cx, ent.y - cy) > 3) return true;
    }
    ent.path = [];
    ent.state = 'FIREFIGHT';
    helpers.say(ent, 'Putting out the fire');
    let n = EFFORT[Math.min(EFFORT.length - 1, eraTier(civ))];
    if (stationNear(terrain, st, ent.x, ent.y)) n *= 2;
    const well = terrain.buildingsInRect(ent.x - 8, ent.y - 8, ent.x + 8, ent.y + 8).some(b => b.type === 'well' && b.progress >= 1);
    if (well) n += 1;
    extinguish(terrain, effect, ent.x, ent.y, n, ecosystem.timeYears);
    terrain.spawnParticles && terrain.spawnParticles(cx, cy, 6, '#7dd3fc', 1.2);
    ent.actionCooldown = 0.7;
    return true;
  } });
  return true;
}
