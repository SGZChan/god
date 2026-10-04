// Space-faring civilizations (roadmap sub-project 6). A people that has reached the Spaceflight Age and finished a
// spaceport launches colony ships now and then. A ship carries real settlers: they leave the planet (genomes,
// personalities, talents and faith go with them), cross space (main.js moves the voyage between planets, in this
// star system or to another one) and, on arrival, found a colony civilization on the target planet that starts with
// their knowledge (era) and their faith. Nothing is invented on arrival: the colonists are the founders.
//
//   society.outbound = [ship]      ships launched since the game loop last collected them (main.js)
//   ship = { id, civ: { name, color, symbol, governmentId, eraId, faith }, colonists: [colonist], launchedYear }
//   colonist = { name, sex, age, genome, personality, proficiencies, species: { name, centroid } }
import { Entity } from '../life/entity.js';
import { Genome } from '../life/genome.js';
import { ERAS } from './techTree.js';
import { Civilization, GOVERNMENTS } from './society.js';
import { initTown } from './townPlanner.js';
import { getReligion, religionsOf } from './religion.js';

export const LAUNCH_INTERVAL = 90;        // simulated seconds between two ships of one civilization
export const CREW = 6;
export const MIN_CITIZENS_TO_LAUNCH = 14;  // a people never empties itself to fly away
const COLONY_KIT = { wood: 60, stone: 40, grain: 40, tools: 12, fibre: 20 };

export function hasSpaceport(terrain, civ) {
  for (const b of terrain.buildings.values()) {
    if (b.civId === civ.id && b.type === 'spaceport' && b.progress >= 1) return true;
  }
  return false;
}

function serializeColonist(e) {
  return {
    name: e.name,
    sex: e.sex,
    age: e.age,
    genome: e.genome.toJSON(),
    personality: { ...e.personality },
    proficiencies: { ...e.proficiencies },
    species: { name: e.species ? e.species.name : 'Starfolk', centroid: e.species ? { ...e.species.centroid } : e.genome.phenotype() }
  };
}

// The crew: healthy adults, about half women and half men, never a champion or a soldier at war.
export function pickCrew(members, n = CREW) {
  const fit = members.filter(e => e.alive && e.isAdult && !e.isSpecialIndividual && e.stage !== 'elder' && e.role !== 'SOLDIER' && !e.pregnancy);
  const women = fit.filter(e => e.sex === 'F');
  const men = fit.filter(e => e.sex === 'M');
  const crew = [];
  while (crew.length < n && (women.length || men.length)) {
    const from = (crew.length % 2 === 0 ? women : men).length ? (crew.length % 2 === 0 ? women : men) : (women.length ? women : men);
    crew.push(from.shift());
  }
  return crew;
}

// Called once per simulated second per civilization (SocietyManager.tickCiv). Launches a ship when it is time.
export function tickSpaceflight(society, civ, dt) {
  if (!civ.isAlive || civ.era.id !== 'SPACE_AGE') return null;
  if (civ.launchTimer === undefined) civ.launchTimer = LAUNCH_INTERVAL / 3;
  civ.launchTimer -= dt;
  if (civ.launchTimer > 0) return null;
  civ.launchTimer = LAUNCH_INTERVAL;
  if (civ.citizens < MIN_CITIZENS_TO_LAUNCH || !hasSpaceport(society.terrain, civ)) return null;
  return launchShip(society, civ);
}

export function launchShip(society, civ) {
  const eco = society.ecosystem;
  const members = eco.entities.filter(e => e.civilization === civ && e.isSapient);
  const crew = pickCrew(members);
  if (crew.length < 2) return null;
  civ.shipsLaunched = (civ.shipsLaunched || 0) + 1;
  const faith = getReligion(society, civ.faithId);
  const ship = {
    id: `ship_${civ.id}_${civ.shipsLaunched}`,
    civ: {
      name: civ.name,
      color: civ.color,
      symbol: civ.symbol,
      governmentId: civ.government ? civ.government.id : null,
      eraId: civ.era.id,
      faith: faith ? JSON.parse(JSON.stringify(faith)) : null
    },
    colonists: crew.map(serializeColonist),
    launchedYear: Math.round(eco.timeYears || 0)
  };
  // the crew leaves the planet
  const leaving = new Set(crew);
  eco.entities = eco.entities.filter(e => !leaving.has(e));
  for (const e of crew) {
    eco.byId.delete(e.id);
    if (e.species) e.species.population = Math.max(0, e.species.population - 1);
  }
  if (!society.outbound) society.outbound = [];
  society.outbound.push(ship);
  eco.notifications.unshift({ text: `🚀 ${civ.name} launched a colony ship with ${crew.length} settlers.`, time: Date.now() });
  return ship;
}

// A free site for a colony: buildable land away from every existing capital, near the planet's start area.
function colonySite(terrain, society) {
  const home = terrain.home || { x: Math.floor(terrain.width / 2), y: Math.floor(terrain.height / 2) };
  const capitals = society.civilizations.filter(c => c.isAlive).map(c => [c.capitalX, c.capitalY]);
  for (let ring = 0; ring < 12; ring++) {
    for (let a = 0; a < 16; a++) {
      const ang = (a / 16) * Math.PI * 2 + ring * 0.37;
      const dist = 6 + ring * 9;
      const x = Math.round(home.x + Math.cos(ang) * dist);
      const y = Math.round(home.y + Math.sin(ang) * dist);
      if (!terrain.inBounds(x, y) || !terrain.isBuildable(x, y)) continue;
      const tile = terrain.getTile(x, y);
      if (tile.civId || (tile.structure && tile.structure.solid)) continue;
      if (capitals.some(([cx, cy]) => Math.hypot(cx - x, cy - y) < 30)) continue;
      return { x, y };
    }
  }
  return null;
}

// The ship lands: its settlers found a colony on this planet. Returns the new civilization, or null when there is
// nowhere to land (an ocean world, a dead rock).
export function foundColony(world, ship) {
  const { terrain, ecosystem, society } = world;
  const site = colonySite(terrain, society);
  if (!site) {
    ecosystem.notifications.unshift({ text: `💥 A colony ship of ${ship.civ.name} found no land to settle and was lost.`, time: Date.now() });
    return null;
  }
  const baseName = ship.civ.name.replace(/^(New |Colony of )/, '');
  const taken = new Set(society.civilizations.map(c => c.name));
  let name = `New ${baseName}`;
  for (let k = 2; taken.has(name); k++) name = `New ${baseName} ${k}`;
  const civ = new Civilization({
    name,
    color: ship.civ.color,
    symbol: ship.civ.symbol,
    capitalX: site.x,
    capitalY: site.y,
    government: GOVERNMENTS.find(g => g.id === ship.civ.governmentId) || GOVERNMENTS[0],
    population: 45
  });
  // the colonists bring their knowledge with them
  const era = ERAS.find(e => e.id === ship.civ.eraId) || ERAS[0];
  civ.era = era;
  civ.techPoints = Math.max(civ.techPoints, era.reqPoints);
  civ.colonyOf = ship.civ.name;
  initTown(civ, terrain, { stock: { ...COLONY_KIT } });
  civ.expandTerritory(terrain);
  society.civilizations.push(civ);

  // their faith comes too (re-numbered: faith ids are per planet)
  let faithId = null;
  if (ship.civ.faith) {
    society.faithSeq = (society.faithSeq || 0) + 1;
    const faith = { ...ship.civ.faith, id: `faith_${society.faithSeq}`, civId: civ.id, adherents: 0, extinct: false, founderClanId: null };
    religionsOf(society).push(faith);
    faithId = faith.id;
    civ.faithId = faithId;
  }

  const settlers = [];
  for (const c of ship.colonists) {
    let species = ecosystem.registry.living().find(s => s.name === c.species.name);
    if (!species) species = ecosystem.registry.found(c.species.centroid, { sapient: true, name: c.species.name, foundedAt: ecosystem.timeYears });
    const spot = ecosystem.landNear(civ.capitalX, civ.capitalY, 4) || { x: civ.capitalX, y: civ.capitalY };
    const e = new Entity({
      species,
      genome: Genome.fromJSON(c.genome),
      sex: c.sex,
      age: c.age,
      name: c.name,
      personality: c.personality,
      proficiencies: c.proficiencies,
      x: spot.x + 0.5,
      y: spot.y + 0.5
    });
    e.civilization = civ;
    e.faithId = faithId;
    ecosystem.entities.push(e);
    ecosystem.byId.set(e.id, e);
    species.population++;
    settlers.push(e);
  }
  society.setupFounders(civ, settlers);
  if (faithId) for (const clan of civ.clans || []) clan.beliefs = { ...(clan.beliefs || {}), religionId: faithId };
  ecosystem.registry.refresh(ecosystem.entities, ecosystem.timeYears);
  ecosystem.notifications.unshift({ text: `🌍 ${settlers.length} colonists from ${ship.civ.name} landed and founded ${civ.name}.`, time: Date.now() });
  return civ;
}
