// Clans: kin groups. A clan is the founding family and its descendants: children belong to their mother's clan (their
// father's when the mother has none). A clan that grows past CLAN_SPLIT_SIZE sends a splinter group away to found a
// new hamlet (see settlements.js / townPlanner.js for the site choice).
//
//   civ.clans = [{ id, name, color, banner:{shape,glyph}, leaderId, civId, settlementId, memberIds:[], parentClanId,
//                  founded, beliefs:{} }]
//   entity.clanId
//
// `clan.beliefs` is an empty placeholder object for the religion system; nothing here reads or writes it.
import { random } from '../simulation/random.js';
import { makeName } from '../life/names.js';

export const CLAN_SPLIT_SIZE = 14;
export const CLAN_COLORS = ['#e11d48', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#6366f1', '#a855f7', '#ec4899', '#84cc16', '#f43f5e', '#0ea5e9'];

function nextSeq(civ, key) {
  if (!civ.seq) civ.seq = {};
  civ.seq[key] = (civ.seq[key] || 0) + 1;
  return civ.seq[key];
}

export function clansOf(civ) {
  if (!civ.clans) civ.clans = [];
  return civ.clans;
}

export function getClan(civ, id) {
  return id && civ && civ.clans ? civ.clans.find(c => c.id === id) || null : null;
}

// A fresh clan. `colorIndex` defaults to the next unused colour of the civ.
export function createClan(civ, { leader = null, settlementId = null, parentClanId = null, year = 0 } = {}) {
  const n = nextSeq(civ, 'clan');
  const used = new Set(clansOf(civ).map(c => c.color));
  let color = CLAN_COLORS.find(c => !used.has(c));
  if (!color) color = CLAN_COLORS[(n + Math.floor(random() * 3)) % CLAN_COLORS.length];
  const clan = {
    id: `${civ.id}_c${n}`,
    name: `Clan ${leader ? leader.name : makeName()}`,
    color,
    banner: { shape: Math.floor(random() * 4), glyph: Math.floor(random() * 6) },
    leaderId: leader ? leader.id : null,
    civId: civ.id,
    settlementId,
    memberIds: [],
    parentClanId,
    founded: Math.round(year),
    beliefs: {}
  };
  clansOf(civ).push(clan);
  if (leader) leader.clanId = clan.id;
  return clan;
}

// Gives a sapient a clan if it has none: its mother's or father's, else the clan of the closest member of its
// settlement, else a new clan of its own (a lone wanderer or a creature placed by a god power).
export function ensureClan(civ, entity, byId, entities, year = 0) {
  if (entity.clanId && getClan(civ, entity.clanId)) return getClan(civ, entity.clanId);
  for (const pid of [entity.motherId, ...(entity.parents || [])]) {
    const p = pid && byId ? byId.get(pid) : null;
    if (p && p.clanId && getClan(civ, p.clanId)) {
      entity.clanId = p.clanId;
      return getClan(civ, p.clanId);
    }
  }
  let best = null;
  let bestD = 25;
  for (const e of entities) {
    if (e === entity || !e.alive || e.civilization !== civ || !e.clanId) continue;
    const d = Math.hypot(e.x - entity.x, e.y - entity.y);
    if (d < bestD && getClan(civ, e.clanId)) { bestD = d; best = e; }
  }
  if (best) {
    entity.clanId = best.clanId;
    return getClan(civ, best.clanId);
  }
  return createClan(civ, { leader: entity, settlementId: entity.settlementId || null, year });
}

// Recounts members and keeps a living, adult, preferably oldest leader. Drops clans that died out.
export function refreshClans(civ, entities) {
  const clans = clansOf(civ);
  if (!clans.length) return;
  const byClan = new Map();
  for (const c of clans) { c.memberIds = []; byClan.set(c.id, c); }
  for (const e of entities) {
    if (!e.alive || e.civilization !== civ || !e.clanId) continue;
    const c = byClan.get(e.clanId);
    if (c) c.memberIds.push(e.id);
  }
  for (const c of clans) {
    if (!c.memberIds.length) continue;
    const leader = c.leaderId && entities.find(e => e.id === c.leaderId && e.alive && e.clanId === c.id);
    if (!leader) {
      // the eldest adult takes over
      let best = null;
      for (const e of entities) {
        if (!e.alive || e.clanId !== c.id || e.civilization !== civ || !e.isAdult) continue;
        if (!best || e.age > best.age) best = e;
      }
      c.leaderId = best ? best.id : c.memberIds[0];
    }
  }
  // clans with no living members vanish (but keep the list tidy only when there are many)
  civ.clans = clans.filter(c => c.memberIds.length > 0);
}

// Members of the clan who should leave to found a hamlet: whole households (couples with their dependent children)
// until about half the clan is chosen. Returns the entities, or [] when the clan cannot split sensibly.
export function pickSplinter(clan, entities) {
  const members = entities.filter(e => e.alive && e.clanId === clan.id);
  if (members.length < CLAN_SPLIT_SIZE) return [];
  const byId = new Map(members.map(e => [e.id, e]));
  const chosen = new Set();
  const target = Math.floor(members.length / 2);
  // start from adult couples who are not the leader's household
  const adults = members.filter(e => e.isAdult && e.id !== clan.leaderId && e.mateId !== clan.leaderId);
  for (const a of adults) {
    if (chosen.size >= target) break;
    if (chosen.has(a.id)) continue;
    chosen.add(a.id);
    const mate = a.mateId ? byId.get(a.mateId) : null;
    if (mate && mate.id !== clan.leaderId) chosen.add(mate.id);
    for (const m of members) {
      if (!m.isAdult && (m.motherId === a.id || (m.parents && m.parents.includes(a.id))) && m.id !== clan.leaderId) chosen.add(m.id);
    }
  }
  const out = members.filter(e => chosen.has(e.id));
  // a viable hamlet needs grown men and women (so that couples can form) and some hands
  const grown = out.filter(e => e.isAdult);
  const women = grown.filter(e => e.sex === 'F').length;
  const men = grown.filter(e => e.sex === 'M').length;
  return women >= 2 && men >= 2 ? out : [];
}
