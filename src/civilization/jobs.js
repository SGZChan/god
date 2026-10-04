// Jobs and the labour market.
//
// Every settlement counts what it lacks (food, wood, stone, builders, ...) and hands its working adults jobs by demand and
// by aptitude (proficiencies, personality, genes, age). A worker then chooses between eating, courting, following its
// mother and WORKING with the utility AI of life/entity.js; the work itself is a small multi-step planner stored in
// `entity.task` (plain JSON, so it saves): fetch materials -> haul -> build, or walk to a deposit -> extract -> carry ->
// drop at the depot, etc. Nothing appears out of thin air: goods move from the world into carried inventories into
// stockpiles into buildings.
//
//   entity.job        'farmer' | ... | null (children, the unemployed)
//   entity.task       { kind, ... } current multi-step job state, or null
//   entity.inventory  { item: amount } carried goods (capacity economy.carryCapacity)
//   entity.activity   short text for the inspector ("Hauling wood to the hall")
import { random } from '../simulation/random.js';
import { BUILDING_TYPES, missingMaterials, doorTile, frontTile } from '../world/buildings.js';
import { RESOURCES } from '../world/resources.js';
import * as eco from './economy.js';
import { getSettlement, nearestSettlement, depotOf, buildingsOf, openSites, countBuilt, settlementsOf, foodCapOf } from './settlements.js';
import { revealAround, scanForDeposits, nearestKnown, isExplored, isDiscovered, syncDiscoveries, DISCOVERABLE } from './exploration.js';
import { ERA_REQUIREMENTS, ERAS } from './techTree.js';
import { eraTier } from './townPlanner.js';

export const JOBS = ['farmer', 'herder', 'hunter', 'gatherer', 'fisher', 'woodcutter', 'miner', 'builder', 'hauler', 'crafter', 'trader', 'scout', 'scholar', 'leader', 'priest'];

// what the worker holds in its hands (drawn by art/creatureSprite.js) and a readable label
export const JOB_INFO = {
  farmer: { name: 'Farmer', tool: 'hoe' },
  herder: { name: 'Herder', tool: 'crook' },
  hunter: { name: 'Hunter', tool: 'spear' },
  gatherer: { name: 'Gatherer', tool: 'basket' },
  fisher: { name: 'Fisher', tool: 'rod' },
  woodcutter: { name: 'Woodcutter', tool: 'axe' },
  miner: { name: 'Miner', tool: 'pick' },
  builder: { name: 'Builder', tool: 'hammer' },
  hauler: { name: 'Hauler', tool: 'sack' },
  crafter: { name: 'Crafter', tool: 'mallet' },
  trader: { name: 'Trader', tool: 'sack' },
  scout: { name: 'Scout', tool: 'staff' },
  scholar: { name: 'Scholar', tool: 'scroll' },
  leader: { name: 'Leader', tool: 'staff' },
  priest: { name: 'Priest', tool: 'staff' }
};

const SEASON_SECONDS = 12;      // one season; a farming year is four of them
const FIELD_GROWTH_PER_S = 1 / 36;
const TEND_GAIN = 0.07;
const FARM_YIELD = 6;
const BLOCK_SECONDS = 40;       // a job with no reachable target is not offered for this long

// ---------- context ----------

function ctxOf(ent, world) {
  const civ = ent.civilization;
  if (!civ || !civ.isAlive) return null;
  const st = getSettlement(civ, ent.settlementId) || nearestSettlement(civ, ent.x, ent.y);
  if (!st) return null;
  return { world, terrain: world.terrain, ecosystem: world.ecosystem, soc: world.ecosystem.society, civ, st, tier: eraTier(civ) };
}

export function seasonOf(timeYears) {
  const seconds = timeYears * 4;
  return Math.floor(seconds / SEASON_SECONDS) % 4; // 0 spring, 1 summer, 2 autumn, 3 winter
}

export const SEASON_NAMES = ['Spring', 'Summer', 'Autumn', 'Winter'];

function growthFactor(season, temperature) {
  if (temperature > 0.72) return 0.7;                       // hot lands grow all year
  const base = [1.1, 1.3, 0.8, temperature < 0.35 ? 0 : 0.15][season];
  return temperature < 0.28 ? base * 0.5 : base;
}

function taskOf(ent, kind) {
  if (!ent.task || ent.task.kind !== kind) ent.task = { kind, stuck: 0 };
  return ent.task;
}

function toolFactor(st) {
  return (st.stock.tools || 0) >= 1 ? 1.35 : 1;
}

function say(ent, text) {
  ent.activity = text;
}

function failTask(ent, c, why) {
  ent.task = null;
  say(ent, why);
  if (ent.job) {
    if (!c.st.blocked) c.st.blocked = {};
    c.st.blocked[ent.job] = (c.civ.clock || 0) + BLOCK_SECONDS;
  }
  return false;
}

// Walks towards tile (x, y); true once within `reach` of its centre. Gives up (false + t.failed) when the path keeps failing.
function walkTo(ent, c, x, y, reach = 1.2) {
  const dx = ent.x - (x + 0.5);
  const dy = ent.y - (y + 0.5);
  if (dx * dx + dy * dy <= reach * reach) {
    ent.path = [];
    return true;
  }
  const t = ent.task || (ent.task = { kind: 'walk', stuck: 0 });
  if (ent.path.length === 0 || t.gx !== x || t.gy !== y) {
    const d = Math.hypot(dx, dy);
    // no progress over several path requests: the goal is unreachable
    if (t.gx === x && t.gy === y && t.lastD !== undefined && d > t.lastD - 0.6) t.stuck = (t.stuck || 0) + 1;
    else if (t.gx !== x || t.gy !== y) t.stuck = 0;
    t.lastD = d;
    t.gx = x;
    t.gy = y;
    // a goal behind an obstacle needs a wider search than the usual 300 nodes
    ent.requestPath(x + 0.5, y + 0.5, c.world.pathfinder, 300 + (t.stuck || 0) * 500);
  }
  if ((t.stuck || 0) >= 5) {
    t.failed = true;
    t.stuck = 0;
  }
  return false;
}

// ---------- inventory <-> stockpile ----------

function dropAll(ent, c) {
  for (const k of Object.keys(ent.inventory)) {
    const n = ent.inventory[k];
    eco.add(c.st.stock, k, n);
    if (!c.civ.output) c.civ.output = {};
    c.civ.output[k] = Math.round(((c.civ.output[k] || 0) + n) * 100) / 100;
  }
  ent.inventory = {};
}

function atDepot(ent, c, reach = 2.2) {
  const dep = depotOf(c.terrain, c.st);
  return { dep, here: Math.hypot(ent.x - (dep.x + 0.5), ent.y - (dep.y + 0.5)) <= reach };
}

// Walks to the depot and drops the load. Returns true once dropped.
function returnLoad(ent, c) {
  const { dep, here } = atDepot(ent, c);
  if (!here) { walkTo(ent, c, dep.x, dep.y, 2); return false; }
  dropAll(ent, c);
  return true;
}

// ---------- aptitude ----------

export function aptitude(ent, job) {
  const p = ent.proficiencies;
  const pers = ent.personality;
  const size = ent.stats ? ent.stats.sizeScale : 0.5;
  const speed = ent.stats ? ent.stats.speedMult : 1;
  const intel = ent.traits ? ent.traits.intelligence : 0.5;
  let a;
  switch (job) {
    case 'farmer': a = p.farming / 70 + pers.conscientiousness * 0.4; break;
    case 'herder': a = p.farming / 100 + pers.agreeableness * 0.5 + 0.2; break;
    case 'hunter': a = p.warfare / 90 + (1 - pers.neuroticism) * 0.3 + speed * 0.2; break;
    case 'gatherer': a = 0.7 + pers.openness * 0.3 + p.farming / 300; break;
    case 'fisher': a = 0.6 + pers.openness * 0.2 + p.farming / 250; break;
    case 'woodcutter': a = size * 1.1 + pers.conscientiousness * 0.5; break;
    case 'miner': a = size * 1.2 + pers.conscientiousness * 0.4 + (1 - pers.neuroticism) * 0.2; break;
    case 'builder': a = p.architecture / 70 + pers.conscientiousness * 0.4; break;
    case 'hauler': a = size * 1.2 + 0.4 - intel * 0.3; break;
    case 'crafter': a = p.science / 150 + p.architecture / 150 + pers.openness * 0.4 + 0.2; break;
    case 'trader': a = p.statesmanship / 80 + pers.extraversion * 0.5; break;
    case 'scout': a = speed * 0.7 + pers.openness * 0.6 + (1 - pers.neuroticism) * 0.3; break;
    case 'scholar': a = p.science / 60 + intel * 0.8; break;
    case 'leader': a = p.statesmanship / 60 + pers.extraversion * 0.4; break;
    default: a = 0.5;
  }
  if (ent.stage === 'elder') {
    a *= ['scholar', 'crafter', 'leader', 'trader', 'priest', 'gatherer'].includes(job) ? 1.3 : 0.45;
  }
  return a;
}

// ---------- the labour market ----------

// the food a settlement aims to keep in store (a bit below what its stores can hold)
function foodTargetOf(pop, cap = 60) {
  return Math.min(cap * 0.75, Math.max(8, pop * 2.5));
}

function wantedJobs(c, st, members, adults) {
  const { terrain, civ } = c;
  const clock = civ.clock || 0;
  const N = adults.length;
  const pop = members.length;
  const blocked = job => st.blocked && st.blocked[job] > clock;
  const want = [];
  const add = (job, n) => { if (n > 0 && !blocked(job)) want.push([job, Math.round(n)]); };

  const foodTarget = foodTargetOf(pop, foodCapOf(terrain, st));
  const foodU = eco.foodUnits(st.stock);
  const foodShort = foodU < foodTarget ? 1 - foodU / foodTarget : 0;
  const foodRich = foodU > foodTarget * 1.3;
  let farmSlots = 0;
  let penSlots = 0;
  for (const b of buildingsOf(terrain, st)) {
    if (b.progress < 1) continue;
    if (b.type === 'farm') farmSlots += 3;
    else if (b.type === 'pen') penSlots += 2;
  }
  const sites = openSites(terrain, st);
  const roads = st.roadQueue.length;

  add('farmer', Math.min(farmSlots, Math.ceil(N * (foodRich ? 0.12 : foodShort > 0.4 ? 0.5 : 0.3))));
  // builders are only needed where work can actually go on: materials delivered or in the stockpile
  let workable = 0;
  for (const s of sites) {
    if (s.progress < deliveredFraction(s) - 0.002) { workable++; continue; }
    const inb = (st._inbound && st._inbound.get(s.id)) || {};
    for (const [res, n] of Object.entries(missingMaterials(s))) {
      if (n - (inb[res] || 0) > 0.01 && (st.stock[res] || 0) > 0.01) { workable++; break; }
    }
  }
  add('builder', Math.min(Math.ceil(N * 0.4), workable * 2 + (roads > 0 ? 1 : 0)));
  const need = st.need || { wood: 0.5, fibre: 0.5, stone: 0.5, clay: 0, food: foodShort };
  const oreNeed = st.shortage.ore ? 0.5 : 0;
  add('gatherer', (foodShort > 0.25 || farmSlots === 0) ? Math.ceil(N * (0.08 + 0.3 * foodShort + 0.12 * need.fibre)) : (need.fibre > 0.3 ? Math.ceil(N * 0.1 * need.fibre) : 0));
  // hunting thins the herds: only when food is short
  add('hunter', foodShort > 0.2 ? Math.ceil(N * 0.1) : 0);
  add('woodcutter', need.wood > 0.05 ? Math.ceil(N * (0.05 + 0.3 * need.wood)) : 0);
  const mineNeed = Math.max(need.stone, need.clay, oreNeed);
  add('miner', mineNeed > 0.05 || oreNeed ? Math.ceil(N * (0.04 + 0.28 * mineNeed)) : 0);
  add('hauler', sites.length >= 2 && N >= 8 ? Math.floor(N / 8) : 0);
  const stations = countBuilt(terrain, st, 'workshop') + countBuilt(terrain, st, 'kiln') + countBuilt(terrain, st, 'smithy');
  add('crafter', Math.min(stations + 1, Math.ceil(N * 0.14)));
  add('scout', N >= 6 ? Math.min(3, Math.ceil(N / 14)) : 0);
  add('scholar', N >= 9 ? Math.ceil(N * 0.08) : 0);
  add('herder', Math.min(penSlots, Math.ceil(N * 0.08)));
  add('fisher', st.fishNear === false ? 0 : (countBuilt(terrain, st, 'dock') > 0 ? Math.ceil(N * 0.1) : (N >= 10 ? 1 : 0)));
  add('trader', settlementsOf(civ).length >= 2 && N >= 8 ? 1 + Math.floor(N / 20) : 0);
  return want;
}

function jobless(e) {
  return !e.job;
}

function assignJobs(c, st, members) {
  const adults = members.filter(e => e.alive && e.isAdult && !e.isSpecialIndividual);
  for (const e of members) if (e.alive && !e.isAdult && e.job) { e.job = null; e.task = null; }
  if (!adults.length) { st.jobs = {}; return; }
  const want = wantedJobs(c, st, members, adults);
  const cur = new Map();
  for (const e of adults) {
    if (!e.job) continue;
    if (!cur.has(e.job)) cur.set(e.job, []);
    cur.get(e.job).push(e);
  }
  const wantMap = new Map(want);
  // the pool of people who may change: the unemployed, and workers in jobs that have too many
  let pool = adults.filter(jobless);
  let moves = 0;
  for (const [job, list] of cur) {
    const w = wantMap.get(job) || 0;
    if (job === 'leader') continue;
    if (list.length > w && moves < 3) {
      list.sort((a, b) => aptitude(a, job) - aptitude(b, job));
      const surplus = list.length - w;
      for (let i = 0; i < Math.min(surplus, 2); i++) { pool.push(list[i]); moves++; }
    }
  }
  const poolSet = new Set(pool);
  let remaining = pool.length;
  const given = new Map();
  for (const [job, n] of want) {
    const have = (cur.get(job) || []).filter(e => !poolSet.has(e)).length;
    let need = n - have;
    if (need <= 0 || remaining <= 0) continue;
    need = Math.min(need, remaining);
    const cands = [...poolSet].sort((a, b) => aptitude(b, job) - aptitude(a, job));
    for (let i = 0; i < need && i < cands.length; i++) {
      const e = cands[i];
      poolSet.delete(e);
      remaining--;
      if (e.job !== job) { e.job = job; e.task = null; say(e, 'Starting a new job'); }
      given.set(e.id, job);
    }
  }
  // leftovers do general labour, preferring what the settlement is short of
  const leftoverJobs = [];
  const nd = st.need || {};
  const ranked = [['woodcutter', nd.wood || 0], ['miner', Math.max(nd.stone || 0, nd.clay || 0)], ['gatherer', Math.max(nd.food || 0, nd.fibre || 0)]].sort((a, b) => b[1] - a[1]);
  for (const [job, v] of ranked) if (v > 0.02) leftoverJobs.push(job);
  if (!leftoverJobs.length) leftoverJobs.push('builder', 'crafter', 'scholar');
  let li = 0;
  for (const e of poolSet) {
    let job = leftoverJobs[li++ % leftoverJobs.length];
    if (st.blocked && st.blocked[job] > (c.civ.clock || 0)) job = 'builder';
    if (e.job !== job) { e.job = job; e.task = null; }
  }
  // the clan leader of the settlement carries the title in larger towns
  if (adults.length >= 12) {
    const leaderEnt = adults.find(e => c.civ.clans && c.civ.clans.some(cl => cl.leaderId === e.id && cl.settlementId === st.id)) || null;
    if (leaderEnt && leaderEnt.job !== 'leader') { leaderEnt.job = 'leader'; leaderEnt.task = null; }
  }
  const jobs = {};
  for (const e of adults) if (e.job) jobs[e.job] = (jobs[e.job] || 0) + 1;
  st.jobs = jobs;
  st.demand = Object.fromEntries(want);
}

// ---------- settlement tick: census, shortages, jobs ----------

export function tickSettlement(c, st, members, dt) {
  const { terrain, civ } = c;
  if (!st.shortage) st.shortage = {};
  if (!st.roadQueue) st.roadQueue = [];
  st.population = members.length;
  let adults = 0;
  let homeless = 0;
  for (const e of members) {
    if (e.isAdult) {
      adults++;
      if (!e.homeId) homeless++;
    }
  }
  st.adults = adults;
  st.homeless = homeless;

  // shortages: what the sites are missing minus what is in stock and on its way
  const missing = {};
  for (const b of openSites(terrain, st)) {
    const inbound = (st._inbound && st._inbound.get(b.id)) || {};
    for (const [res, n] of Object.entries(missingMaterials(b))) {
      const left = n - (inbound[res] || 0);
      if (left > 0) missing[res] = (missing[res] || 0) + left;
    }
  }
  const short = {};
  for (const [res, n] of Object.entries(missing)) {
    if ((st.stock[res] || 0) < n) short[res] = true;
  }
  const buffer = res => (st.stock[res] || 0) < 12;
  short.wood = Boolean(short.wood || buffer('wood'));
  short.stone = Boolean(short.stone || (st.stock.stone || 0) < 10);
  short.ore = ['copper', 'tin', 'iron', 'coal'].some(r => isDiscovered(civ, r) && (short[r] || (st.stock[r] || 0) < 6) && countBuilt(terrain, st, 'smithy') > 0);
  short.food = eco.foodUnits(st.stock) < foodTargetOf(members.length, foodCapOf(terrain, st));
  st.shortage = short;
  // the inputs its workshops can use right now (caravans bring what is missing)
  const wants = {};
  for (const rec of eco.RECIPES) {
    if (rec.at && countBuilt(terrain, st, rec.at) === 0) continue;
    if (rec.needs && !rec.needs.every(n => isDiscovered(civ, n))) continue;
    for (const [k, n] of Object.entries(rec.in)) wants[k] = Math.max(wants[k] || 0, n * 3);
  }
  st.wants = wants;
  // how badly each raw material is needed (0 = plenty, 1 = none): stock against a working level plus what sites are missing
  const level = (res, base) => {
    const target = base + (missing[res] || 0);
    return target > 0 ? Math.max(0, Math.min(1, (target - (st.stock[res] || 0)) / target)) : 0;
  };
  const kiln = countBuilt(terrain, st, 'kiln') > 0 ? 12 : 0;
  st.need = {
    wood: level('wood', 24 + (kiln ? 8 : 0)),
    fibre: level('fibre', 12),
    stone: level('stone', 14 + (c.tier >= 1 ? 16 : 0)),
    clay: level('clay', kiln),
    food: Math.max(0, 1 - eco.foodUnits(st.stock) / foodTargetOf(members.length, foodCapOf(terrain, st)))
  };

  // inbound materials per site, from what builders and haulers carry
  const inbound = new Map();
  for (const e of members) {
    if (!e.task || e.task.kind !== 'build' || !e.task.siteId) continue;
    const m = inbound.get(e.task.siteId) || {};
    for (const [k, n] of Object.entries(e.inventory)) m[k] = (m[k] || 0) + n;
    inbound.set(e.task.siteId, m);
  }
  Object.defineProperty(st, '_inbound', { value: inbound, writable: true, configurable: true, enumerable: false });

  st.assignTimer = (st.assignTimer || 0) - dt;
  if (st.assignTimer <= 0) {
    st.assignTimer = 5;
    assignJobs(c, st, members);
  }

  // fields grow with the seasons
  growFields(c, st, dt);
}

function growFields(c, st, dt) {
  const season = seasonOf(c.ecosystem.timeYears);
  for (const b of buildingsOf(c.terrain, st)) {
    if (b.progress < 1 || (b.type !== 'farm' && b.type !== 'pen')) continue;
    const temp = c.terrain.getTile(b.x, b.y).temperature;
    const f = growthFactor(season, temp);
    b.growth = Math.min(1, (b.growth || 0) + dt * FIELD_GROWTH_PER_S * f * (b.type === 'pen' ? 0.7 : 1));
  }
}

// ---------- the work of each job ----------

function sizeFactor(ent) {
  return 0.8 + (ent.stats ? ent.stats.sizeScale : 0.5) * 0.4;
}

const GATHER_RATE = { wood: 3, stone: 3, clay: 3, fibre: 3, berries: 3, fish: 3, sand: 3, salt: 2, flint: 2, obsidian: 1.5, coal: 2, copper: 1.6, tin: 1.6, iron: 1.6, gold: 1, gems: 0.8, oil: 1, uranium: 0.8 };

// Standing tile for a deposit that may lie in the water (fish): the nearest land tile within 3 tiles of it.
function standTile(c, x, y) {
  const { terrain } = c;
  if (terrain.isBuildable(x, y) && !terrain.isSolid(x, y)) return { x, y };
  let best = null;
  let bestD = Infinity;
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      const tx = x + dx;
      const ty = y + dy;
      if (!terrain.inBounds(tx, ty) || !terrain.isBuildable(tx, ty) || terrain.isSolid(tx, ty)) continue;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = { x: tx, y: ty }; }
    }
  }
  return best;
}

function findTarget(c, ent, res) {
  const { terrain, civ, st } = c;
  if (DISCOVERABLE.includes(res)) {
    const k = nearestKnown(civ, terrain, res, st.x, st.y);
    return k ? { x: k.x, y: k.y } : null;
  }
  const origin = res === 'fish' || res === 'berries' || res === 'fibre' || res === 'wood' ? { x: st.x, y: st.y } : { x: st.x, y: st.y };
  const min = res === 'wood' || res === 'fibre' || res === 'berries' || res === 'fish' ? 3 : 1;
  const d = terrain.findNearestDeposit(origin.x, origin.y, res, 55, { minAmount: min });
  return d ? { x: d.x, y: d.y } : null;
}

// Gather `res` from the world and bring it home.
function stepGather(ent, c, res) {
  const t = taskOf(ent, 'gather');
  const cap = eco.carryCapacity(ent);
  t.res = res;
  if (t.phase === 'return' || eco.total(ent.inventory) >= cap - 0.5) {
    t.phase = 'return';
    say(ent, `Carrying ${eco.itemName(res).toLowerCase()} home`);
    if (returnLoad(ent, c)) { t.phase = 'seek'; t.tx = undefined; }
    else if (t.failed) return failTask(ent, c, 'Cannot reach the depot');
    return true;
  }
  if (t.tx === undefined) {
    const target = findTarget(c, ent, res);
    if (!target) return failTask(ent, c, `Cannot find any ${eco.itemName(res).toLowerCase()}`);
    const stand = standTile(c, target.x, target.y);
    if (!stand) return failTask(ent, c, 'No place to stand');
    t.tx = target.x; t.ty = target.y; t.sx = stand.x; t.sy = stand.y;
  }
  say(ent, `${res === 'fish' ? 'Fishing' : (res === 'wood' ? 'Felling trees' : (DISCOVERABLE.includes(res) || res === 'stone' || res === 'clay' ? 'Digging ' + eco.itemName(res).toLowerCase() : 'Gathering ' + eco.itemName(res).toLowerCase()))}`);
  if (!walkTo(ent, c, t.sx, t.sy, 1.3)) {
    if (t.failed) { t.tx = undefined; t.failed = false; t.stuck = 0; return failTask(ent, c, 'Cannot reach the deposit'); }
    return true;
  }
  const dep = c.terrain.peekDeposit(t.tx, t.ty);
  if (!dep || dep.type !== res || dep.amount < 0.5) { t.tx = undefined; return true; }
  let rate = (GATHER_RATE[res] || 2) * toolFactor(c.st) * sizeFactor(ent);
  // a mine or quarry beside the deposit doubles the yield
  if (res !== 'wood' && res !== 'fish' && res !== 'berries' && res !== 'fibre') {
    for (const b of c.terrain.buildingsInRect(t.tx - 14, t.ty - 14, t.tx + 14, t.ty + 14)) {
      if ((b.type === 'mine' || b.type === 'quarry') && b.progress >= 1) { rate *= 1.6; break; }
    }
  }
  const got = c.terrain.extract(t.tx, t.ty, Math.min(rate, cap - eco.total(ent.inventory)));
  eco.add(ent.inventory, res, got);
  if (got > 0 && random() < 0.04 && (c.st.stock.tools || 0) >= 1) eco.take(c.st.stock, 'tools', 1);
  ent.actionCooldown = 0.9;
  // exploring beyond the borders: miners noticing neighbouring veins
  if (DISCOVERABLE.includes(res) || res === 'wood') revealAround(c.civ, c.terrain, ent.x, ent.y, 5);
  return true;
}

// Which resource should a miner dig? The one the settlement lacks most.
function miningTarget(c) {
  const { civ, st, terrain } = c;
  const have = r => st.stock[r] || 0;
  const smith = countBuilt(terrain, st, 'smithy') > 0;
  const kiln = countBuilt(terrain, st, 'kiln') > 0;
  const cands = [];
  const consider = (res, wantAmount, weight = 1) => {
    if (DISCOVERABLE.includes(res) && !isDiscovered(civ, res)) return;
    if (st.noRes && st.noRes[res] > (civ.clock || 0)) return;
    const deficit = (wantAmount - have(res)) / wantAmount;
    if (deficit > 0) cands.push([res, deficit * weight]);
  };
  const nd = st.need || {};
  if ((nd.stone || 0) > 0.02 && !(st.noRes && st.noRes.stone > (civ.clock || 0))) cands.push(['stone', nd.stone * 2]);
  if ((nd.clay || 0) > 0.02 && !(st.noRes && st.noRes.clay > (civ.clock || 0))) cands.push(['clay', nd.clay * 2]);
  void kiln;
  if (smith || isDiscovered(civ, 'copper')) { consider('copper', 12, 1.4); consider('tin', 8, 1.4); }
  if (smith) { consider('iron', 14, 1.3); consider('coal', 10, 1.3); }
  consider('flint', 8, 0.3);
  // era requirements: coal and gold for the industrial age, uranium for the space age
  consider('coal', 25, 0.5);
  if (ERA_REQUIREMENTS[ERAS[Math.min(ERAS.length - 1, eraTier(civ) + 1)].id]) {
    const req = ERA_REQUIREMENTS[ERAS[Math.min(ERAS.length - 1, eraTier(civ) + 1)].id];
    for (const res of req.discovered || []) consider(res, 6, 1.2);
    for (const res of Object.keys(req.output || {})) if (RESOURCES[res]) consider(res, (req.output[res] || 6) + 2, 1.2);
  }
  if (!cands.length) return 'stone';
  cands.sort((a, b) => b[1] - a[1]);
  return cands[0][0];
}

function stepMiner(ent, c) {
  const t = taskOf(ent, 'gather');
  if (t.phase !== 'return' && (t.tx === undefined || !t.res || t.res === undefined)) t.res = miningTarget(c);
  const res = t.res || miningTarget(c);
  const r = stepGather(ent, c, res);
  if (r === false) {
    // no such deposit nearby: don't pick it again for a while
    if (!c.st.noRes) c.st.noRes = {};
    c.st.noRes[res] = (c.civ.clock || 0) + 60;
  }
  return r;
}

function stepGatherer(ent, c) {
  const t = taskOf(ent, 'gather');
  if (t.phase !== 'return' && t.tx === undefined) {
    const nd = c.st.need || {};
    t.res = (nd.fibre || 0) > (nd.food || 0) * 0.8 && (nd.fibre || 0) > 0.05 ? 'fibre' : 'berries';
  }
  return stepGather(ent, c, t.res || 'berries');
}

function stepWoodcutter(ent, c) {
  return stepGather(ent, c, 'wood');
}

function stepFisher(ent, c) {
  const r = stepGather(ent, c, 'fish');
  if (r === false) c.st.fishNear = false;
  return r;
}

// ---------- farming and herding ----------

function stepField(ent, c, type) {
  const t = taskOf(ent, 'field');
  const { terrain, st } = c;
  const cap = eco.carryCapacity(ent);
  if (t.phase === 'return') {
    say(ent, 'Bringing the harvest in');
    if (returnLoad(ent, c)) { t.phase = 'work'; t.siteId = undefined; }
    return true;
  }
  let field = t.siteId ? terrain.getBuilding(t.siteId) : null;
  if (!field || field.type !== type || field.progress < 1) {
    field = null;
    let best = -Infinity;
    for (const b of buildingsOf(terrain, st)) {
      if (b.type !== type || b.progress < 1) continue;
      // other workers already there
      let crowd = 0;
      for (const e of c.soc.membersOf(st)) if (e !== ent && e.task && e.task.kind === 'field' && e.task.siteId === b.id) crowd++;
      if (crowd >= 3) continue;
      const score = (b.growth || 0) * 2 - crowd - Math.hypot(b.x - ent.x, b.y - ent.y) * 0.02;
      if (score > best) { best = score; field = b; }
    }
    if (!field) return failTask(ent, c, type === 'farm' ? 'No field to work' : 'No pen to tend');
    t.siteId = field.id;
  }
  const cx = field.x + (field.w >> 1);
  const cy = field.y + (field.h >> 1);
  if (!walkTo(ent, c, cx, cy, 1.6)) return true;
  if ((field.growth || 0) >= 1) {
    const fert = Math.max(0.3, terrain.getTile(field.x, field.y).biome.fertility);
    if (type === 'farm') {
      say(ent, 'Harvesting the field');
      eco.add(ent.inventory, 'grain', Math.min(cap, Math.round(FARM_YIELD * (0.55 + fert * 0.7) * toolFactor(st) * 10) / 10));
    } else {
      say(ent, 'Slaughtering and shearing');
      eco.add(ent.inventory, 'meat', 3);
      eco.add(ent.inventory, 'fibre', 2);
    }
    field.growth = 0;
    t.phase = 'return';
  } else {
    say(ent, type === 'farm' ? 'Tending the crops' : 'Tending the herd');
    field.growth = Math.min(1, (field.growth || 0) + TEND_GAIN * (0.6 + ent.proficiencies.farming / 100));
  }
  ent.actionCooldown = 1;
  return true;
}

// ---------- hunting ----------

function stepHunter(ent, c) {
  const t = taskOf(ent, 'hunt');
  const cap = eco.carryCapacity(ent);
  if (t.phase === 'return') {
    say(ent, 'Carrying the kill home');
    if (returnLoad(ent, c)) { t.phase = 'seek'; t.preyId = undefined; }
    return true;
  }
  let prey = t.preyId ? c.ecosystem.byId.get(t.preyId) : null;
  if (!prey || !prey.alive) {
    prey = null;
    let bestD = Infinity;
    for (const e of c.world.grid.within(ent.x, ent.y, 24)) {
      if (!e.alive || e.isSapient || e.traits.carnivory > 0.5) continue;
      if (e.stats.sizeScale > ent.stats.sizeScale * 2.4) continue;
      const d = Math.hypot(e.x - ent.x, e.y - ent.y);
      if (d < bestD) { bestD = d; prey = e; }
    }
    if (!prey) return failTask(ent, c, 'No game nearby');
    // leave a breeding herd alone: hunters need a few animals in sight to take one
    let herd = 0;
    for (const e of c.world.grid.within(prey.x, prey.y, 14)) if (e.alive && e.species === prey.species) herd++;
    if (herd < 4) return failTask(ent, c, 'The herd is too small to hunt');
    t.preyId = prey.id;
  }
  say(ent, 'Hunting');
  if (Math.hypot(prey.x - ent.x, prey.y - ent.y) > 1.5) {
    ent.requestPath(prey.x, prey.y, c.world.pathfinder);
    return true;
  }
  prey.health -= 24 * (0.6 + ent.proficiencies.warfare / 100) * toolFactor(c.st);
  ent.actionCooldown = 0.8;
  if (prey.health <= 0) {
    prey.die(`Hunted by ${ent.name}`);
    prey.decayTimer = 0;
    const meat = Math.round((2 + prey.stats.sizeScale * 5) * 10) / 10;
    eco.add(ent.inventory, 'meat', Math.min(cap, meat));
    ent.kills++;
    t.phase = 'return';
  }
  return true;
}

// ---------- building ----------

function deliveredFraction(site) {
  const def = BUILDING_TYPES[site.type];
  let need = 0;
  let got = 0;
  for (const [res, n] of Object.entries(def.cost)) {
    need += n;
    got += Math.min(n, (site.delivered && site.delivered[res]) || 0);
  }
  return need > 0 ? got / need : 1;
}

// A site nobody can walk to: skipped for a while; after three failures the plot is given up so the planner picks a better one.
function abandonSite(c, ent, site) {
  const t = ent.task;
  if (t) { t.failed = false; t.stuck = 0; }
  site.fails = (site.fails || 0) + 1;
  site.blockedUntil = (c.civ.clock || 0) + 40;
  if (site.fails >= 3 && site.progress < 0.5) {
    c.terrain.removeBuilding(site.id, { ruins: false });
    c.ecosystem.notifications.unshift({ text: `${c.st.name} abandoned an unreachable building plot.`, minor: true, time: Date.now() });
  }
}

function siteSpot(site) {
  return { x: site.x + (site.w >> 1), y: site.y + (site.h >> 1) };
}

function stepBuilder(ent, c, haulOnly) {
  const t = taskOf(ent, 'build');
  const { terrain, st } = c;
  const inv = ent.inventory;
  // 1. carrying building materials: deliver them
  if (eco.total(inv) > 0) {
    let site = t.siteId ? terrain.getBuilding(t.siteId) : null;
    const wantsSome = s => s && s.progress < 1 && Object.keys(missingMaterials(s)).some(r => inv[r] > 0);
    if (!wantsSome(site)) {
      site = null;
      let bestD = Infinity;
      for (const s of openSites(terrain, st)) {
        if (!wantsSome(s)) continue;
        const d = Math.hypot(s.x - ent.x, s.y - ent.y);
        if (d < bestD) { bestD = d; site = s; }
      }
    }
    if (!site) {
      say(ent, 'Returning leftover materials');
      if (returnLoad(ent, c)) t.siteId = undefined;
      return true;
    }
    t.siteId = site.id;
    say(ent, `Hauling materials to the ${BUILDING_TYPES[site.type].name.toLowerCase()}`);
    const spot = siteSpot(site);
    if (!walkTo(ent, c, spot.x, spot.y, 1.8)) {
      if (t.failed) { abandonSite(c, ent, site); if (returnLoad(ent, c)) t.siteId = undefined; }
      return true;
    }
    const missing = missingMaterials(site);
    for (const [res, n] of Object.entries(missing)) {
      const have = eco.amount(inv, res);
      if (have > 0) terrain.deliverMaterial(site.id, res, eco.take(inv, res, Math.min(have, n)));
    }
    ent.actionCooldown = 0.6;
    return true;
  }
  // 2. pick a site
  const sites = openSites(terrain, st).sort((a, b) => Math.hypot(a.x - ent.x, a.y - ent.y) - Math.hypot(b.x - ent.x, b.y - ent.y));
  const clock = c.civ.clock || 0;
  for (const site of sites) {
    if (site.blockedUntil > clock) continue; // unreachable for now
    const fraction = deliveredFraction(site);
    if (!haulOnly && site.progress < fraction - 0.002) {
      t.siteId = site.id;
      say(ent, `Building the ${BUILDING_TYPES[site.type].name.toLowerCase()}`);
      const spot = siteSpot(site);
      if (!walkTo(ent, c, spot.x, spot.y, 1.9)) {
        if (t.failed) abandonSite(c, ent, site);
        return true;
      }
      const def = BUILDING_TYPES[site.type];
      let work = 4.5 * (0.6 + ent.proficiencies.architecture / 100) * toolFactor(st) * sizeFactor(ent);
      work = Math.min(work, Math.max(0.2, (fraction - site.progress) * def.work + 0.2));
      const done = terrain.advanceConstruction(site.id, work);
      ent.actionCooldown = 0.9;
      if (done) {
        c.soc.onBuildingComplete(c, site);
        say(ent, `Finished the ${def.name.toLowerCase()}`);
        t.siteId = undefined;
      }
      return true;
    }
    // fetch what is missing and in stock (not counting what others already carry there)
    const inbound = (st._inbound && st._inbound.get(site.id)) || {};
    const missing = missingMaterials(site);
    const fetch = {};
    let any = false;
    for (const [res, n] of Object.entries(missing)) {
      const left = n - (inbound[res] || 0);
      const avail = (st.stock[res] || 0);
      if (left > 0.01 && avail > 0.01) { fetch[res] = Math.min(left, avail); any = true; }
    }
    if (any) {
      const { dep, here } = atDepot(ent, c);
      t.siteId = site.id;
      say(ent, 'Fetching materials from the stockpile');
      if (!here) { walkTo(ent, c, dep.x, dep.y, 2); return true; }
      let room = eco.carryCapacity(ent);
      const planned = (st._inbound && (st._inbound.get(site.id) || st._inbound.set(site.id, {}).get(site.id))) || null;
      for (const [res, n] of Object.entries(fetch)) {
        const took = eco.take(st.stock, res, Math.min(n, room));
        eco.add(inv, res, took);
        if (planned) planned[res] = (planned[res] || 0) + took; // others see it is already on its way
        room -= took;
        if (room <= 0) break;
      }
      ent.actionCooldown = 0.5;
      return true;
    }
  }
  // 3. pave the planned roads
  if (!haulOnly && st.roadQueue.length) {
    let bi = 0;
    let bd = Infinity;
    for (let i = 0; i < st.roadQueue.length; i++) {
      const r = st.roadQueue[i];
      const d = Math.abs(r.x - ent.x) + Math.abs(r.y - ent.y);
      if (d < bd) { bd = d; bi = i; }
    }
    const r = st.roadQueue[bi];
    say(ent, 'Laying a road');
    if (!walkTo(ent, c, r.x, r.y, 1.1)) {
      if (t.failed) { t.failed = false; st.roadQueue.splice(bi, 1); }
      return true;
    }
    c.terrain.setRoad(r.x, r.y, r.kind);
    st.roadQueue.splice(bi, 1);
    ent.actionCooldown = 0.7;
    return true;
  }
  say(ent, 'Waiting for materials');
  return false;
}

// ---------- crafting ----------

function chooseRecipe(c) {
  const { civ, st, terrain, tier } = c;
  let best = null;
  let bestScore = 0;
  const have = r => st.stock[r] || 0;
  const pop = Math.max(4, st.population || 0);
  const nextReq = ERA_REQUIREMENTS[ERAS[Math.min(ERAS.length - 1, tier + 1)].id] || {};
  for (const rec of eco.RECIPES) {
    const outKey = Object.keys(rec.out)[0];
    if (rec.tier > tier && !(nextReq.output && nextReq.output[outKey])) continue; // (the goods the next era needs are made early)
    if (rec.needs && !rec.needs.every(n => isDiscovered(civ, n))) continue;
    if (rec.at && countBuilt(terrain, st, rec.at) === 0) continue;
    if (!Object.entries(rec.in).every(([k, n]) => have(k) >= n)) continue;
    const outId = Object.keys(rec.out)[0];
    let target = { tools: 4 + pop / 5, cloth: 3, pottery: 4, bricks: 2, bronze: 3, iron_bar: 2 }[outId] || 3;
    const needOut = (nextReq.output && nextReq.output[outId]) || 0;
    if (needOut) target = Math.max(target, needOut + 1);
    const outputSoFar = (civ.output && civ.output[outId]) || 0;
    let score = (target - have(outId)) / target;
    if (needOut && outputSoFar < needOut) score += 1.2;
    if (score > bestScore) { bestScore = score; best = rec; }
  }
  return best;
}

function stepCrafter(ent, c) {
  const t = taskOf(ent, 'craft');
  const { st, terrain } = c;
  if (!t.recipe) {
    const rec = chooseRecipe(c);
    if (!rec) { say(ent, 'Nothing to make'); return false; }
    t.recipe = rec.id;
    t.phase = 'fetch';
    t.done = 0;
  }
  const rec = eco.RECIPES.find(r => r.id === t.recipe);
  if (!rec) { ent.task = null; return false; }
  if (t.phase === 'fetch') {
    say(ent, `Fetching materials for ${rec.name.toLowerCase()}`);
    const { dep, here } = atDepot(ent, c);
    if (!here) { walkTo(ent, c, dep.x, dep.y, 2); return true; }
    if (!Object.entries(rec.in).every(([k, n]) => (st.stock[k] || 0) >= n)) { ent.task = null; return false; }
    for (const [k, n] of Object.entries(rec.in)) eco.add(ent.inventory, k, eco.take(st.stock, k, n));
    t.phase = 'make';
    return true;
  }
  if (t.phase === 'make') {
    let spot = depotOf(terrain, st);
    if (rec.at) {
      const station = buildingsOf(terrain, st).find(b => b.type === rec.at && b.progress >= 1);
      if (!station) { ent.task = null; return false; }
      spot = frontTile(station);
    }
    say(ent, `Making ${rec.name.toLowerCase()}`);
    if (!walkTo(ent, c, spot.x, spot.y, 2)) return true;
    t.done = (t.done || 0) + 1;
    ent.actionCooldown = 1;
    if (t.done >= rec.work) {
      for (const k of Object.keys(rec.in)) delete ent.inventory[k];
      for (const [k, n] of Object.entries(rec.out)) eco.add(ent.inventory, k, n);
      c.civ.techPoints += 0.6;
      t.phase = 'store';
    }
    return true;
  }
  say(ent, `Storing the ${rec.name.toLowerCase()}`);
  if (returnLoad(ent, c)) { ent.task = null; }
  return true;
}

// ---------- exploring ----------

function stepScout(ent, c) {
  const t = taskOf(ent, 'explore');
  const { civ, terrain, st } = c;
  revealAround(civ, terrain, ent.x, ent.y, 6);
  t.scan = (t.scan || 0) - 1;
  if (t.scan <= 0) {
    t.scan = 2;
    const found = scanForDeposits(civ, terrain, ent.x, ent.y, 11);
    if (found.length) {
      syncDiscoveries(civ, text => c.ecosystem.notifications.unshift({ text, time: Date.now() }));
      civ.techPoints += 12 * found.length;
    }
  }
  if (t.tx === undefined) {
    let best = null;
    let bestScore = -Infinity;
    const reach = 28 + Math.min(70, (civ.explored ? civ.explored.length : 0) * 0.35);
    for (let i = 0; i < 7; i++) {
      const ang = random() * Math.PI * 2;
      const d = 18 + random() * reach;
      const x = Math.round(st.x + Math.cos(ang) * d);
      const y = Math.round(st.y + Math.sin(ang) * d);
      if (!terrain.inBounds(x, y) || !terrain.isLandProbe(x, y)) continue;
      let score = random();
      if (!isExplored(civ, terrain, x, y)) score += 2;
      if (score > bestScore) { bestScore = score; best = { x, y }; }
    }
    if (!best) { say(ent, 'Looking for a way onward'); return false; }
    t.tx = best.x; t.ty = best.y;
  }
  say(ent, 'Scouting unexplored land');
  if (walkTo(ent, c, t.tx, t.ty, 2.5) || t.failed) {
    t.tx = undefined;
    t.failed = false;
  }
  return true;
}

// ---------- scholars, leaders, traders ----------

function stepScholar(ent, c) {
  const t = taskOf(ent, 'study');
  const { terrain, st, civ } = c;
  let spot = depotOf(terrain, st);
  const lib = buildingsOf(terrain, st).find(b => b.type === 'library' && b.progress >= 1);
  if (lib) spot = frontTile(lib);
  say(ent, lib ? 'Studying in the library' : 'Studying by the fire');
  if (!walkTo(ent, c, spot.x + (random() < 0.5 ? 1 : -1), spot.y, 2.5)) return true;
  civ.techPoints += 0.5 * (0.5 + ent.proficiencies.science / 100) * (lib ? 1.8 : 1);
  ent.proficiencies.science = Math.min(100, ent.proficiencies.science + 0.01);
  ent.actionCooldown = 1.2;
  t.n = (t.n || 0) + 1;
  return true;
}

function stepLeader(ent, c) {
  const { terrain, st, civ } = c;
  const dep = depotOf(terrain, st);
  say(ent, 'Overseeing the settlement');
  if (!walkTo(ent, c, dep.x, dep.y, 3)) return true;
  civ.techPoints += 0.1 * (ent.proficiencies.statesmanship / 60);
  ent.actionCooldown = 2;
  return true;
}

// What a settlement wants to keep in store of an item: a basic level, or more when its workshops need it as an input.
const KEEP = { grain: 12, meat: 4, wood: 20, stone: 14, fibre: 10, clay: 8 };
function levelOf(st, item) {
  return Math.max(KEEP[item] || 3, (st.wants && st.wants[item]) || 0);
}

// Caravans: carry the biggest surplus to the settlement that lacks it most.
function stepTrader(ent, c) {
  const t = taskOf(ent, 'trade');
  const { civ, terrain } = c;
  const stores = settlementsOf(civ);
  if (stores.length < 2) { ent.task = null; return false; }
  const ITEMS = ['wood', 'stone', 'fibre', 'clay', 'grain', 'meat', 'tools', 'bronze', 'iron_bar', 'iron', 'copper', 'tin', 'coal', 'pottery', 'cloth', 'bricks'];
  if (!t.phase) {
    let best = null;
    let bestScore = 0;
    for (const a of stores) {
      for (const b of stores) {
        if (a === b) continue;
        for (const item of ITEMS) {
          const surplus = (a.stock[item] || 0) - levelOf(a, item) * 1.4;
          const lack = levelOf(b, item) - (b.stock[item] || 0);
          // what the crafts of the destination need (ores for the smithy...) is carried first
          const score = Math.min(surplus, lack) * ((b.wants && b.wants[item]) ? 3 : 1);
          if (score > bestScore) { bestScore = score; best = { from: a.id, to: b.id, item }; }
        }
      }
    }
    if (!best) { say(ent, 'No goods to carry'); return false; }
    Object.assign(t, best, { phase: 'load' });
  }
  const from = getSettlement(civ, t.from);
  const to = getSettlement(civ, t.to);
  if (!from || !to) { ent.task = null; return false; }
  if (t.phase === 'load') {
    const dep = depotOf(terrain, from);
    say(ent, `Loading ${eco.itemName(t.item).toLowerCase()} for ${to.name}`);
    if (!walkTo(ent, c, dep.x, dep.y, 2)) return true;
    const room = eco.carryCapacity(ent);
    eco.add(ent.inventory, t.item, eco.take(from.stock, t.item, Math.min(room, Math.max(0, (from.stock[t.item] || 0) - levelOf(from, t.item)))));
    t.phase = eco.total(ent.inventory) > 0 ? 'travel' : 'done';
    return true;
  }
  if (t.phase === 'travel') {
    const dep = depotOf(terrain, to);
    say(ent, `Carrying goods to ${to.name}`);
    if (!walkTo(ent, c, dep.x, dep.y, 2)) return true;
    for (const [k, n] of Object.entries(ent.inventory)) eco.add(to.stock, k, n);
    civ.output.trade = (civ.output.trade || 0) + eco.total(ent.inventory);
    ent.inventory = {};
    t.phase = 'done';
    return true;
  }
  ent.task = null;
  return true;
}

function stepPriest(ent, c) {
  // placeholder for the religion system: a priest keeps to the hall
  return stepLeader(ent, c);
}

// ---------- eating ----------

// Eats from the carried food, else walks to the depot and eats from the stockpile. Returns false when there is no food.
function stepEat(ent, c) {
  const relief = eco.eatFrom(ent.inventory);
  if (relief) {
    ent.hunger = Math.max(0, ent.hunger - relief);
    say(ent, 'Eating');
    ent.state = 'EAT';
    return true;
  }
  if (eco.foodUnits(c.st.stock) < 0.5) return false;
  const prev = ent.task;
  const { dep, here } = atDepot(ent, c, 2.4);
  if (!here) {
    // keep the old task's data while walking; walkTo stores its goal on the task
    say(ent, 'Going to eat');
    ent.state = 'EAT';
    if (!ent.task) ent.task = { kind: 'walk', stuck: 0 };
    const t = ent.task;
    const ok = walkTo(ent, c, dep.x, dep.y, 2.2);
    if (t.failed) { t.failed = false; return false; }
    return true || ok;
  }
  const k = eco.bestFood(c.st.stock);
  if (!k) return false;
  let eaten = 0;
  const meals = ent.hunger > 70 ? 2 : 1;
  for (let i = 0; i < meals; i++) {
    const kind = eco.bestFood(c.st.stock);
    if (!kind) break;
    eco.take(c.st.stock, kind, 1);
    eaten += eco.NOURISHMENT[kind];
  }
  ent.hunger = Math.max(0, ent.hunger - eaten);
  ent.health = Math.min(ent.maxHealth, ent.health + 3);
  say(ent, 'Eating at the stores');
  ent.state = 'EAT';
  ent.actionCooldown = 1;
  return true;
}

// ---------- the entry points used by the creature AI ----------

const STEPS = {
  farmer: (e, c) => stepField(e, c, 'farm'),
  herder: (e, c) => stepField(e, c, 'pen'),
  hunter: stepHunter,
  gatherer: stepGatherer,
  fisher: stepFisher,
  woodcutter: stepWoodcutter,
  miner: stepMiner,
  builder: (e, c) => stepBuilder(e, c, false),
  hauler: (e, c) => (stepBuilder(e, c, true) ? true : stepCarryGoods(e, c)),
  crafter: stepCrafter,
  trader: stepTrader,
  scout: stepScout,
  scholar: stepScholar,
  leader: stepLeader,
  priest: stepPriest
};

// haulers with nothing to haul for a site take loose goods to where they are needed: nothing to do, they help build
function stepCarryGoods(ent, c) {
  return stepBuilder(ent, c, false);
}

// Called from Entity.executeNeedsAI for sapient creatures that belong to a civilization. Pushes utility options.
// Returns true when a high-priority task (migration) took over.
export function sapientOptions(ent, world, options) {
  const c = ctxOf(ent, world);
  if (!c) return false;
  const { civ } = c;
  // migrating clan splinter
  if (ent.task && ent.task.kind === 'migrate') {
    options.push({ score: 0.98, run: () => stepMigrate(ent, c) });
    return false;
  }
  // food: carried, or at the depot; with a hungry worker food beats work around hunger 55
  const holdsFood = eco.foodUnits(ent.inventory) >= 1;
  if (ent.hunger > 38 && (holdsFood || eco.foodUnits(c.st.stock) >= 0.5)) {
    options.push({ score: (ent.hunger / 100) * 1.1, run: () => stepEat(ent, c) });
  }
  if (!ent.isAdult) return false;
  if (ent.job && STEPS[ent.job]) {
    options.push({
      score: 0.5 + Math.min(0.08, aptitude(ent, ent.job) * 0.02),
      run: () => {
        ent.state = 'WORK';
        const handled = STEPS[ent.job](ent, c);
        if (handled === false) return false;
        return true;
      }
    });
  }
  return false;
}

// Clan splinters walk to the new hamlet and hand over what they carry.
function stepMigrate(ent, c) {
  const t = ent.task;
  const target = getSettlement(c.civ, t.sid);
  if (!target) { ent.task = null; return false; }
  say(ent, `Migrating to ${target.name}`);
  ent.state = 'MIGRATE';
  if (!walkTo(ent, c, t.x, t.y, 3)) {
    if (t.failed) { t.failed = false; }
    return true;
  }
  dropAllTo(ent, c.civ, target);
  ent.task = null;
  ent.activity = `Settled in ${target.name}`;
  return true;
}

function dropAllTo(ent, civ, st) {
  for (const [k, n] of Object.entries(ent.inventory)) eco.add(st.stock, k, n);
  ent.inventory = {};
}

export function describeActivity(ent) {
  if (!ent.isSapient) return '';
  return ent.activity || (ent.job ? JOB_INFO[ent.job].name : 'Idle');
}
