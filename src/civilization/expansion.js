// Expansion: peoples want more land and more materials. They scout, found outposts beside the deposits they need,
// go to war for deposits that lie inside a neighbour's land and annex that region when they win. (Colony ships to
// other planets: spaceflight.js; whole-clan hamlets when a clan grows large: society.js splitClans.)
//
//   wantedResources(civ)            resource types the people need now or for the next ages
//   tickExpansion(society, civ, dt) outposts and annexations, every EXPANSION_TICK simulated seconds
//   covetedDeposit(civ, other, terrain) a known deposit of a wanted resource inside `other`'s land, or null
//   annexRegion(society, winner, loser, goal) moves the loser's land (and town) around `goal` to the winner
import { ERAS, ERA_REQUIREMENTS } from './techTree.js';
import { settlementsOf } from './settlements.js';
import { foundHamlet, eraTier } from './townPlanner.js';
import { getClan, createClan, pickSplinter } from './clans.js';

export const EXPANSION_TICK = 5;      // simulated seconds between expansion decisions of one civilization
export const OUTPOST_REACH = 22;      // a deposit farther than this from every settlement is worth an outpost
const OUTPOST_COOLDOWN = 60;
const MAX_SETTLEMENTS = 14;

// Ores of the next two ages, and stone and clay once the Stone Age is over
export function wantedResources(civ) {
  const tier = eraTier(civ);
  const out = new Set();
  for (let i = tier + 1; i <= Math.min(ERAS.length - 1, tier + 2); i++) {
    for (const t of (ERA_REQUIREMENTS[ERAS[i].id] || {}).discovered || []) out.add(t);
  }
  if (tier >= 1) { out.add('stone'); out.add('clay'); }
  // what the age's buildings are made of
  if (tier >= 2) out.add('iron');
  if (tier >= 3) out.add('coal');
  return out;
}

function nearestSettlementDist(civ, x, y) {
  let d = Infinity;
  for (const st of settlementsOf(civ)) d = Math.min(d, Math.hypot(st.x - x, st.y - y));
  return d;
}

// A free, buildable spot within `r` tiles of (x, y), not in another people's land and not crowding any settlement
export function siteNear(terrain, civ, allCivs, x, y, r = 8) {
  for (let ring = 0; ring <= r; ring += 2) {
    for (let a = 0; a < 12; a++) {
      const ang = (a / 12) * Math.PI * 2;
      const px = Math.round(x + Math.cos(ang) * ring);
      const py = Math.round(y + Math.sin(ang) * ring);
      if (!terrain.inBounds(px, py) || !terrain.isBuildable(px, py)) continue;
      const tile = terrain.getTile(px, py);
      if ((tile.civId && tile.civId !== civ.id) || (tile.structure && tile.structure.solid)) continue;
      let crowded = false;
      for (const c of allCivs) for (const s of c.settlements || []) if (Math.hypot(s.x - px, s.y - py) < 14) crowded = true;
      if (!crowded) return { x: px, y: py };
    }
  }
  return null;
}

// ---------- outposts beside wanted deposits ----------

export function tryOutpost(society, civ) {
  if (!civ.isAlive || settlementsOf(civ).length >= MAX_SETTLEMENTS) return null;
  if ((civ.outpostCd || 0) > civ.clock) return null;
  if (civ.citizens < 8 * settlementsOf(civ).length) return null;
  const wanted = wantedResources(civ);
  const { terrain, ecosystem } = society;
  let goal = null;
  let best = Infinity;
  for (const k of civ.knownDeposits || []) {
    if (!wanted.has(k.type)) continue;
    const d = nearestSettlementDist(civ, k.x, k.y);
    if (d < OUTPOST_REACH || d > 90) continue;
    const tile = terrain.getTile(k.x, k.y);
    if (tile && tile.civId && tile.civId !== civ.id) continue; // someone else's: that is a matter for war
    if (d < best) { best = d; goal = k; }
  }
  if (!goal) return null;
  civ.outpostCd = civ.clock + OUTPOST_COOLDOWN;
  const site = siteNear(terrain, civ, society.civilizations, goal.x, goal.y);
  if (!site) return null;
  // the biggest clan sends a small group
  const clans = (civ.clans || []).filter(c => c.memberIds && c.memberIds.length >= 4).sort((a, b) => b.memberIds.length - a.memberIds.length);
  const clan = clans[0];
  if (!clan) return null;
  const group = pickSplinter(clan, ecosystem.entities).slice(0, 6);
  if (group.filter(e => e.isAdult).length < 2) return null;
  const parent = settlementsOf(civ).find(s => s.id === clan.settlementId) || settlementsOf(civ)[0];
  if (!parent || !parent.town || !parent.town.ready) return null;
  society.sendSettlers(civ, clan, group, parent, site);
  const st = settlementsOf(civ)[settlementsOf(civ).length - 1];
  if (st) st.purpose = goal.type;
  ecosystem.notifications.unshift({ text: `⛏️ ${civ.name} sent settlers to found an outpost by the ${goal.type} deposits.`, time: Date.now() });
  return st || null;
}

// ---------- conquest ----------

// A known deposit of a wanted resource that lies in `other`'s land (closest to `civ`), or null
export function covetedDeposit(civ, other, terrain) {
  const wanted = wantedResources(civ);
  let goal = null;
  let best = Infinity;
  for (const k of civ.knownDeposits || []) {
    if (!wanted.has(k.type)) continue;
    const tile = terrain.getTile(k.x, k.y);
    if (!tile || tile.civId !== other.id) continue;
    // something the civ has nowhere in its own land
    const d = nearestSettlementDist(civ, k.x, k.y);
    if (d < best) { best = d; goal = { type: k.type, x: k.x, y: k.y }; }
  }
  return goal && best < 80 ? goal : null;
}

// Moves a whole settlement (buildings, people, their clans) from one civilization to another: conquest, secession.
export function transferSettlement(society, loser, winner, st) {
  const { terrain, ecosystem } = society;
  loser.settlements.splice(loser.settlements.indexOf(st), 1);
  winner.settlements.push(st);
  for (const b of terrain.buildings.values()) if (b.settlementId === st.id) { b.civId = winner.id; terrain.syncBuildingTiles(b); }
  for (const e of ecosystem.entities) {
    if (!e.alive || e.civilization !== loser || e.settlementId !== st.id) continue;
    e.civilization = winner;
    e.job = null;
    e.task = null;
    if (e.role === 'SOLDIER') e.role = 'CITIZEN';
    // their clan comes with them
    const clan = getClan(loser, e.clanId);
    if (clan && !getClan(winner, clan.id)) {
      loser.clans.splice(loser.clans.indexOf(clan), 1);
      clan.civId = winner.id;
      winner.clans.push(clan);
    } else if (!clan) {
      e.clanId = createClan(winner, { leader: e, settlementId: st.id, year: ecosystem.timeYears }).id;
    }
  }
}

// The winner takes the land around `goal` (radius 12): tiles, and the loser's settlement there unless it is the
// capital, with its buildings and its people (who keep their homes and families but now belong to the winner).
export function annexRegion(society, winner, loser, goal) {
  const { terrain, ecosystem } = society;
  if (!goal) return { tiles: 0, town: null };
  const R = 12;
  let tiles = 0;
  loser.territory = loser.territory.filter(t => {
    if (Math.hypot(t.x - goal.x, t.y - goal.y) > R) return true;
    const tile = terrain.getTile(t.x, t.y);
    if (tile) tile.civId = winner.id;
    if (!winner.territory.some(p => p.x === t.x && p.y === t.y)) winner.territory.push({ x: t.x, y: t.y });
    tiles++;
    return false;
  });
  let town = null;
  const st = settlementsOf(loser).filter(s => !s.capital).sort((a, b) => Math.hypot(a.x - goal.x, a.y - goal.y) - Math.hypot(b.x - goal.x, b.y - goal.y))[0];
  if (st && Math.hypot(st.x - goal.x, st.y - goal.y) <= R + 8 && settlementsOf(winner).length < MAX_SETTLEMENTS) {
    transferSettlement(society, loser, winner, st);
    town = st;
  }
  // the coveted deposit is now known as the winner's own
  if (!(winner.knownDeposits || []).some(k => k.type === goal.type && k.x === goal.x && k.y === goal.y)) {
    (winner.knownDeposits = winner.knownDeposits || []).push({ type: goal.type, x: goal.x, y: goal.y });
  }
  ecosystem.notifications.unshift({
    text: `🏴 ${winner.name} annexed ${town ? `${town.name} and ` : ''}${tiles} tiles of ${loser.name}'s land with its ${goal.type}.`,
    time: Date.now()
  });
  return { tiles, town };
}

// ---------- the tick ----------

export function tickExpansion(society, civ, dt) {
  civ.expansionTimer = (civ.expansionTimer === undefined ? EXPANSION_TICK : civ.expansionTimer) - dt;
  if (civ.expansionTimer > 0) return;
  civ.expansionTimer = EXPANSION_TICK;
  // what the people look for (read by settlements.js findHamletSite); not saved, recomputed here
  Object.defineProperty(civ, 'wanted', { value: wantedResources(civ), writable: true, configurable: true, enumerable: false });
  // a war won for land: take it (society.js endWar leaves the claim here)
  if (civ.pendingAnnex) {
    const { loserId, goal } = civ.pendingAnnex;
    civ.pendingAnnex = null;
    const loser = society.civilizations.find(c => c.id === loserId);
    if (loser && loser.isAlive) annexRegion(society, civ, loser, goal);
  }
  tryOutpost(society, civ);
}
