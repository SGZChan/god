// Families and households.
//
// Pair bonds (entity.mateId) form when a courting couple meets (ecosystem.tryConceive); a bonded person only conceives with
// the partner, and a widow(er) can bond again later. A household is a couple (or a single adult) with their dependent
// children; it lives in one house (entity.homeId = building id, building.residents = ids). Homeless people sleep rough
// (no shelter bonus against the weather) and make the planner build housing. When someone dies the house stays with the
// surviving spouse and children (inheritance); orphans are taken in by their clan (entity.guardianId). Children eat from
// the settlement's stores (their parents feed them).
import { BUILDING_TYPES } from '../world/buildings.js';
import { housesOf, getSettlement, depotOf } from './settlements.js';
import * as eco from './economy.js';

// Marries off founders: pairs of opposite sex become couples. Returns the number of couples.
export function bondFounders(entities) {
  const females = entities.filter(e => e.alive && e.sex === 'F' && !e.mateId);
  const males = entities.filter(e => e.alive && e.sex === 'M' && !e.mateId);
  let n = 0;
  for (let i = 0; i < Math.min(females.length, males.length); i++) {
    females[i].mateId = males[i].id;
    males[i].mateId = females[i].id;
    n++;
  }
  return n;
}

function cleanHouse(house, byId) {
  if (!house.residents) house.residents = [];
  house.residents = house.residents.filter(id => {
    const e = byId.get(id);
    return e && e.alive && e.homeId === house.id;
  });
}

function adultsIn(house, byId) {
  let n = 0;
  for (const id of house.residents) {
    const e = byId.get(id);
    if (e && e.isAdult) n++;
  }
  return n;
}

function moveIn(house, e) {
  if (!house.residents.includes(e.id)) house.residents.push(e.id);
  e.homeId = house.id;
}

// One pass over a settlement: valid homes, new households, evictions of the youngest when a house is overfull.
export function assignHomes(terrain, civ, st, allMembers, byId) {
  const members = allMembers.filter(e => e.alive); // (the census list may still hold someone who just died)
  const houses = housesOf(terrain, st);
  const houseById = new Map(houses.map(h => [h.id, h]));
  for (const h of houses) cleanHouse(h, byId);
  for (const e of members) {
    if (e.homeId && !houseById.has(e.homeId)) e.homeId = null; // the house is gone or not settled here
    else if (e.homeId && !houseById.get(e.homeId).residents.includes(e.id)) moveIn(houseById.get(e.homeId), e);
  }
  // overfull houses: the youngest adults who are not the household head move out
  for (const h of houses) {
    const cap = BUILDING_TYPES[h.type].capacity;
    let excess = adultsIn(h, byId) - cap;
    if (excess <= 0) continue;
    const adults = h.residents.map(id => byId.get(id)).filter(e => e && e.isAdult).sort((a, b) => a.age - b.age);
    for (const e of adults) {
      if (excess <= 0) break;
      if (e.mateId && h.residents.includes(e.mateId) && adults.length > 2) continue;
      e.homeId = null;
      excess--;
    }
    cleanHouse(h, byId);
  }
  // adults without a home look for one: with their partner's, else any house with room
  const free = h => BUILDING_TYPES[h.type].capacity - adultsIn(h, byId);
  for (const e of members) {
    if (!e.isAdult || e.homeId) continue;
    const mate = e.mateId ? byId.get(e.mateId) : null;
    if (mate && mate.alive && mate.homeId && houseById.has(mate.homeId) && free(houseById.get(mate.homeId)) > 0) {
      moveIn(houseById.get(mate.homeId), e);
      continue;
    }
    const needs = mate && mate.alive && !mate.homeId && mate.settlementId === e.settlementId ? 2 : 1;
    let best = null;
    let bestScore = Infinity;
    for (const h of houses) {
      const f = free(h);
      if (f < needs) continue;
      // snug fits first, then the ones nearest the centre
      const score = (f - needs) * 3 + Math.hypot(h.x - st.x, h.y - st.y) * 0.05;
      if (score < bestScore) { bestScore = score; best = h; }
    }
    if (!best && needs === 2) {
      for (const h of houses) if (free(h) >= 1) { best = h; break; }
    }
    if (best) {
      moveIn(best, e);
      if (needs === 2 && free(best) > 0) moveIn(best, mate);
    }
  }
  // children live with a parent (or guardian)
  for (const e of members) {
    if (e.isAdult) continue;
    const parent = [e.guardianId, e.motherId, ...(e.parents || [])].map(id => id && byId.get(id)).find(p => p && p.alive && p.homeId);
    const want = parent ? parent.homeId : null;
    if (want && houseById.has(want)) {
      if (e.homeId !== want) moveIn(houseById.get(want), e);
    } else if (e.homeId && !houseById.has(e.homeId)) {
      e.homeId = null;
    }
  }
}

// Children without a living parent are taken in by the eldest adult of their clan in the settlement.
export function adoptOrphans(members, byId) {
  for (const e of members) {
    if (e.isAdult || !e.alive) continue;
    const hasParent = [e.motherId, ...(e.parents || [])].some(id => id && id !== 'unknown' && byId.get(id) && byId.get(id).alive);
    const guardian = e.guardianId ? byId.get(e.guardianId) : null;
    if (hasParent || (guardian && guardian.alive)) continue;
    let best = null;
    for (const a of members) {
      if (!a.alive || !a.isAdult || a.clanId !== e.clanId) continue;
      if (!best || a.age > best.age) best = a;
    }
    if (!best) for (const a of members) if (a.alive && a.isAdult && (!best || a.age > best.age)) best = a;
    if (best) {
      e.guardianId = best.id;
      e.motherId = best.id; // the child now follows its guardian
      if (best.homeId) e.homeId = best.homeId;
    }
  }
}

// Parents feed their children from the stockpile when the little ones are hungry.
export function feedChildren(terrain, st, members) {
  for (const e of members) {
    if (e.isAdult || !e.alive || e.hunger < 40) continue;
    const dep = depotOf(terrain, st);
    if (Math.hypot(e.x - dep.x, e.y - dep.y) > 28) continue; // out in the wild with its mother: she carries food
    const k = eco.bestFood(st.stock);
    if (!k) continue;
    eco.take(st.stock, k, 1);
    e.hunger = Math.max(0, e.hunger - eco.NOURISHMENT[k]);
  }
}

// Widow(er)s: clear the dead partner.
export function clearDeadMates(entities, byId) {
  for (const e of entities) {
    if (!e.alive || !e.mateId) continue;
    const m = byId.get(e.mateId);
    if (!m || !m.alive) {
      e.mateId = null;
      e.mateCooldown = Math.max(e.mateCooldown, 14); // a period of mourning
    }
  }
}

export function familyOf(ent, byId, entities) {
  const mate = ent.mateId ? byId.get(ent.mateId) || null : null;
  const parents = [ent.motherId, ...(ent.parents || [])].filter((id, i, a) => id && id !== 'unknown' && a.indexOf(id) === i).map(id => byId.get(id)).filter(Boolean);
  const children = entities.filter(e => e.alive && ((e.parents && e.parents.includes(ent.id)) || e.motherId === ent.id));
  return { mate, parents, children };
}

export { getSettlement };
