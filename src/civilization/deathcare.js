// Death care. Nobody just vanishes into a tombstone. Researched customs, reduced to a chain of events:
//
//   death        the body lies where the person fell (a CORPSE: the dead entity keeps `entity.corpse`)
//   finding      kin (mate, children, parents, siblings, clan) hurry to it, passers-by lend a hand
//   carrying     one bearer lifts the body and carries it to a place of healing (the healer's hut of the Stone Age,
//                the monastery infirmary, the modern hospital), where it is washed and laid out
//   funeral      the family is called together (the bearers carry the body again) to the burial ground: a barrow
//                (Stone Age burial mound), a graveyard from the Bronze Age on. The mourners stand round while the
//                rite is held; a priest present lends it weight
//   burial       the body is interred, the grave is entered in the graveyard's book, the people grieve and the faith
//                of the mourners grows a little
//   neglect      a body left unburied for long spreads sickness among the living near it, then is lost
//
//   entity.corpse = { state, carrierId, claim, claimAt, hospitalId, laidAt, funeral }
//     state: 'lying' | 'carried' | 'laid_out' | 'rite' | 'buried'
//   building.graves = [{ name, year, cause }]      on graveyards and barrows
//   tickDeathcare(society, civ, dt)                 funerals are called, the unburied spread sickness
//   bodyOptions(ent, c, options)                    sapientOptions hook: bearers, mourners, the sick seeking healing
//   isKin(ent, dead)                                family or clan
import { BUILDING_TYPES, frontTile } from '../world/buildings.js';
import { buildingsOf, settlementsOf } from './settlements.js';

export const CORPSE_LIFE = 150;      // simulated seconds a body may lie unclaimed before it is lost
export const PREPARE_SECONDS = 6;    // washing and laying out at the place of healing
export const RITE_SECONDS = 6;       // the funeral rite at the grave
const FOUL_AFTER = 30;               // an unburied body begins to spread sickness after this long
const BURIAL = new Set(['barrow', 'graveyard']);
const HEALING = { healers_hut: 2, infirmary: 5, hospital: 9 };   // health regained per treatment

let helpers = { walkTo: () => false, say: () => {} };
export function registerHelpers(h) { helpers = h; }

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function makeCorpse(ent) {
  ent.corpse = { state: 'lying', carrierId: null, claim: null, claimAt: 0, hospitalId: null, laidAt: null, funeral: null };
}

export function isKin(ent, dead) {
  if (!ent || !dead || ent === dead) return false;
  if (ent.mateId === dead.id || dead.mateId === ent.id) return true;
  if ((dead.parents || []).includes(ent.id) || (ent.parents || []).includes(dead.id)) return true;
  if (dead.motherId === ent.id || ent.motherId === dead.id) return true;
  if ((ent.parents || []).some(p => p && p !== 'unknown' && (dead.parents || []).includes(p))) return true; // siblings
  return Boolean(ent.clanId && ent.clanId === dead.clanId);
}

function frontOf(b) {
  const f = frontTile(b);
  return { x: f.x, y: f.y };
}

function siteFor(terrain, st, set, from) {
  let best = null;
  let bd = Infinity;
  for (const b of buildingsOf(terrain, st)) {
    if (b.progress < 1 || !set(b.type)) continue;
    const d = Math.hypot(b.x - from.x, b.y - from.y);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}

export const burialSite = (terrain, st, from) => siteFor(terrain, st, t => BURIAL.has(t), from);
export const healingSite = (terrain, st, from) => siteFor(terrain, st, t => t in HEALING, from);

// Corpses of one civilization that nobody carries yet
function bodiesOf(ecosystem, civ, states) {
  const out = [];
  for (const e of ecosystem.entities) if (!e.alive && e.corpse && e.civilization === civ && states.includes(e.corpse.state)) out.push(e);
  return out;
}

// ---------- what a person does about the dead ----------

export function bodyOptions(ent, c, options) {
  const { ecosystem, terrain, civ, st } = c;
  const clock = civ.clock || 0;
  // already carrying out a burial
  if (ent.task && ent.task.kind === 'bury') {
    // (a hungry or exhausted bearer is not forced to carry on)
    options.push({ score: ent.hunger > 65 || ent.energy < 15 ? 0.4 : 0.99, run: () => stepBury(ent, c) });
    return true;
  }
  if (ent.isAdult && !ent.isSpecialIndividual) {
    // an unattended body: kin hurry to it, passers-by lend a hand
    let best = null;
    let bestScore = 0;
    for (const dead of bodiesOf(ecosystem, civ, ['lying'])) {
      const cp = dead.corpse;
      if ((cp.noClaimUntil || 0) > clock) continue;
      if (cp.claim && cp.claim !== ent.id && clock - cp.claimAt < 15) {
        const other = ecosystem.byId.get(cp.claim);
        if (other && other.alive && !isKin(ent, dead)) continue;
      }
      const d = dist(ent, dead);
      const kin = isKin(ent, dead);
      if (d > (kin ? 70 : 12)) continue;
      const score = kin ? 0.97 - d * 0.001 : 0.74 - d * 0.01;
      if (score > bestScore) { bestScore = score; best = dead; }
    }
    if (best) {
      options.push({ score: bestScore, run: () => {
        best.corpse.claim = ent.id;
        best.corpse.claimAt = clock;
        ent.task = { kind: 'bury', corpseId: best.id, phase: 'fetch', stuck: 0, start: clock };
        stepBury(ent, c);
      } });
      return false;
    }
    // a funeral is held: close family comes (at most six, for a short while)
    for (const dead of bodiesOf(ecosystem, civ, ['rite'])) {
      const f = dead.corpse.funeral;
      if (!f || !isKin(ent, dead) || dist(ent, f.site) > 60 || clock - (f.started || clock) > 14) continue;
      if (!f.mourners[ent.id] && Object.keys(f.mourners).length >= 6) continue;
      options.push({ score: 0.93, run: () => {
        const target = f.spot;
        helpers.say(ent, `Mourning ${dead.name}`);
        if (!helpers.walkTo(ent, c, target.x, target.y, 4)) return true;
        ent.path = [];
        ent.state = 'MOURN';
        f.mourners[ent.id] = clock;
        return true;
      } });
      return false;
    }
  }
  // the sick and wounded go to a place of healing
  const hurt = 1 - ent.health / ent.maxHealth;
  if (hurt > 0.35 && ent.alive) {
    const site = healingSite(terrain, st, ent);
    if (site) {
      options.push({ score: 0.55 + hurt * 0.4, run: () => {
        const spot = frontOf(site);
        helpers.say(ent, `Seeking care at the ${BUILDING_TYPES[site.type].name.toLowerCase()}`);
        if (!helpers.walkTo(ent, c, spot.x, spot.y, 2.4)) return true;
        ent.path = [];
        ent.state = 'HEAL';
        ent.health = Math.min(ent.maxHealth, ent.health + HEALING[site.type]);
        ent.actionCooldown = 1.2;
        return true;
      } });
    }
  }
  return false;
}

// The bearer's whole errand, one decision at a time: fetch, carry to the healers, (the funeral is called),
// fetch again, carry to the grave, stand through the rite, bury.
function stepBury(ent, c) {
  const { ecosystem, terrain, civ, st } = c;
  const t = ent.task;
  const dead = ecosystem.byId.get(t.corpseId);
  const clock = civ.clock || 0;
  if (!dead || dead.alive || !dead.corpse || dead.corpse.state === 'buried' || (dead.corpse.carrierId && dead.corpse.carrierId !== ent.id)) {
    ent.carrying = null;
    ent.task = null;
    return false;
  }
  const cp = dead.corpse;
  // an errand that cannot be finished is given up: the body is put down and may be tried again later
  if (t.failed || clock - (t.start || clock) > 160) {
    if (cp.state === 'carried') { cp.state = 'lying'; cp.carrierId = null; }
    cp.claim = null;
    cp.noClaimUntil = clock + 50;
    ent.carrying = null;
    ent.task = null;
    return false;
  }
  if (t.phase === 'fetch') {
    helpers.say(ent, `Going to ${dead.name}`);
    if (!helpers.walkTo(ent, c, dead.x, dead.y, 1.6)) { ent.state = 'WORK'; return true; }
    cp.state = 'carried';
    cp.carrierId = ent.id;
    ent.carrying = dead.id;
    t.phase = 'carry';
    return true;
  }
  // where to? first the place of healing (once), else the burial ground, else an unmarked grave at the edge of town
  const home = getSettlementOf(civ, dead) || st;
  const wantsHealing = !cp.hospitalId && !cp.funeral;
  let site = null;
  if (t.phase === 'carry') site = wantsHealing ? healingSite(terrain, home, dead) : null;
  if (!site) site = burialSite(terrain, home, dead) || burialSite(terrain, st, dead);
  if (t.phase === 'carry' && site && BURIAL.has(site.type) && !cp.funeral) cp.funeral = makeFuneral(dead, site, civ);
  helpers.say(ent, site ? `Carrying ${dead.name} to the ${BUILDING_TYPES[site.type].name.toLowerCase()}` : `Burying ${dead.name} outside the town`);
  const spot = site ? frontOf(site) : { x: home.x + 9, y: home.y + 6 };
  if (t.phase === 'carry' || t.phase === 'rite_walk') {
    if (!helpers.walkTo(ent, c, spot.x, spot.y, 2.4)) { ent.state = 'WORK'; return true; }
    if (site && site.type in HEALING) {
      // laid out at the place of healing; the family is told
      cp.state = 'laid_out';
      cp.carrierId = null;
      cp.hospitalId = site.id;
      cp.laidAt = clock;
      const door = frontOf(site);
      dead.x = door.x + 0.5;
      dead.y = door.y + 0.5;
      ent.carrying = null;
      ent.task = null;
      helpers.say(ent, `${dead.name} is laid out`);
      return true;
    }
    // at the grave: the rite begins
    cp.state = 'rite';
    dead.x = spot.x + 0.5;
    dead.y = spot.y + 0.3;
    t.phase = 'rite';
    t.riteAt = clock;
    cp.funeral = cp.funeral || makeFuneral(dead, site, civ);
    cp.funeral.started = clock;
    return true;
  }
  if (t.phase === 'rite') {
    helpers.say(ent, `Funeral of ${dead.name}`);
    ent.path = [];
    ent.state = 'MOURN';
    ent.actionCooldown = 1;
    if (clock - t.riteAt < RITE_SECONDS) return true;
    bury(c, dead, site, ent);
    ent.carrying = null;
    ent.task = null;
    return true;
  }
  ent.task = null;
  return false;
}

function getSettlementOf(civ, dead) {
  return settlementsOf(civ).find(s => s.id === dead.settlementId) || null;
}

function makeFuneral(dead, site, civ) {
  const spot = site ? frontOf(site) : { x: dead.x, y: dead.y };
  return { siteId: site ? site.id : null, site: { x: spot.x, y: spot.y }, spot: { x: spot.x + (dead.id.length % 3) - 1, y: spot.y + 2 }, mourners: {}, started: null, called: civ.clock || 0 };
}

function bury(c, dead, site, bearer) {
  const { ecosystem, civ } = c;
  const cp = dead.corpse;
  const f = cp.funeral || { mourners: {} };
  const clock = civ.clock || 0;
  const present = Object.values(f.mourners).filter(t => clock - t < 10).length;
  const priest = bearer.job === 'priest' || ecosystem.entities.some(e => e.alive && e.civilization === civ && e.job === 'priest' && dist(e, dead) < 10);
  cp.state = 'buried';
  civ.buried = (civ.buried || 0) + 1;
  if (site) {
    (site.graves = site.graves || []).push({ name: dead.name, year: Math.round(ecosystem.timeYears), cause: dead.causeOfDeath || 'Unknown', mourners: present, priest });
    if (site.graves.length > 60) site.graves.shift();
  }
  // grief and consolation: the faith of everyone who came grows a little, a priest makes it more
  for (const id of Object.keys(f.mourners)) {
    const e = ecosystem.byId.get(id);
    if (e && e.alive && e.personality) e.personality.piety = Math.min(1, e.personality.piety + (priest ? 0.02 : 0.01));
  }
  civ.piety = Math.min(100, (civ.piety || 0) + 0.15 * Math.min(6, present) + (priest ? 0.3 : 0));
  if (ecosystem.notifications.length < 500 && (dead.isSpecialIndividual || present >= 3)) {
    ecosystem.notifications.unshift({ text: `⚰️ ${dead.name} of ${civ.name} was laid to rest${site ? ` in the ${BUILDING_TYPES[site.type].name.toLowerCase()}` : ''}, mourned by ${present}.`, time: Date.now() });
  }
}

// ---------- the civilization's tick: funerals are called, neglect has a price ----------

export function tickDeathcare(society, civ, dt) {
  civ.deathTimer = (civ.deathTimer === undefined ? 2 : civ.deathTimer) - dt;
  if (civ.deathTimer > 0) return;
  civ.deathTimer = 2;
  const { ecosystem, terrain } = society;
  const clock = civ.clock || 0;
  let any = false;
  for (const e of ecosystem.entities) {
    if (e.alive || !e.corpse || e.civilization !== civ) continue;
    any = true;
    const cp = e.corpse;
    const home = getSettlementOf(civ, e) || settlementsOf(civ)[0];
    if (!home) continue;
    // a body laid out is ready after the washing: the family chooses a bearer
    if (cp.state === 'laid_out' && clock - cp.laidAt >= PREPARE_SECONDS && !cp.bearerCalled) {
      const site = burialSite(terrain, home, e);
      if (!site && clock - cp.laidAt < 40) continue; // wait for a burial ground to be built
      cp.bearerCalled = true;
      if (site) cp.funeral = makeFuneral(e, site, civ);
      const kin = [];
      const others = [];
      for (const p of ecosystem.entities) {
        if (!p.alive || p.civilization !== civ || !p.isAdult || p.isSpecialIndividual || p.task) continue;
        (isKin(p, e) ? kin : others).push(p);
      }
      const pool = kin.length ? kin : others.filter(p => p.settlementId === e.settlementId);
      pool.sort((a, b) => dist(a, e) - dist(b, e));
      const bearer = pool[0];
      if (bearer) {
        cp.claim = bearer.id;
        cp.claimAt = clock;
        bearer.task = { kind: 'bury', corpseId: e.id, phase: 'fetch', stuck: 0, start: clock };
        cp.state = 'laid_out';
      } else cp.bearerCalled = false;
      // (the bearer lifts it again: laid out bodies are fetched like any other)
    }
    // a rite whose bearer is gone is completed by the mourners (or the sexton) after a short while
    if (cp.state === 'rite') {
      const bearer = ecosystem.byId.get(cp.carrierId);
      const attending = bearer && bearer.alive && bearer.task && bearer.task.corpseId === e.id;
      if (!attending) {
        cp.riteSince = cp.riteSince === undefined ? clock : cp.riteSince;
        if (clock - cp.riteSince > 8) bury({ ecosystem, civ }, e, burialSite(terrain, home, e), bearer || {});
      }
    }
    // sickness from the unburied
    if (cp.state === 'lying' && (e.decayTimer < CORPSE_LIFE - FOUL_AFTER)) {
      for (const p of ecosystem.entities) {
        if (!p.alive || p.civilization !== civ || p.health < 45 || dist(p, e) > 7) continue;
        p.health -= 0.5;
      }
    }
  }
  civ.unburied = bodiesOf(ecosystem, civ, ['lying']).length;
  void any;
}
