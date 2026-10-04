// Save / load for Genesis & Cosmos.
//
// serializeSim / restoreSim turn one planet's simulation into plain JSON and back.
// The terrain (a finite planet-sized map) regenerates from its seed and size, so only the tiles that differ from generated terrain
// (buildings, borders, god powers, grazed flora...) are saved. Saving is lossless and idempotent
// (serialize -> restore -> serialize gives identical JSON).
import { PlanetTerrain } from '../planet/terrain.js';
import { Ecosystem } from '../life/ecosystem.js';
import { Entity } from '../life/entity.js';
import { Species } from '../life/species.js';
import { Genome } from '../life/genome.js';
import { SocietyManager, Civilization, GOVERNMENTS } from '../civilization/society.js';
import { ERAS } from '../civilization/techTree.js';
import { SeededRNG } from '../cosmos/seed.js';
import { withRng } from '../simulation/random.js';
import { ensureEffects } from '../god/effects.js';

export const SAVE_VERSION = 3; // 3: finite planet-sized map + resource deposits (2: infinite chunked world, 1: fixed grid)

const ENTITY_SKIP = new Set(['species', 'civilization', 'target', 'path', 'lastJevDecision', 'genome', 'traits', 'stats', 'pregnancy']);
const CIV_SKIP = new Set(['diplomacy', 'warTarget', 'era', 'government', 'territory']);

export class SaveError extends Error {}

function pickFields(source, skip) {
  const out = {};
  for (const key of Object.keys(source).sort()) {
    if (skip.has(key) || typeof source[key] === 'function') continue;
    out[key] = source[key];
  }
  return out;
}

// ---------- terrain ----------

function serializeTerrain(terrain) {
  return {
    seed: terrain.seed,
    planetType: terrain.planetType,
    flat: terrain.flat,
    width: terrain.width,
    height: terrain.height,
    waterLevel: terrain.waterLevel,
    globalTemp: terrain.globalTemp,
    timeAge: terrain.timeAge,
    corrosionTimer: terrain.corrosionTimer,
    // [[x, y, changedFields]] sorted so equal worlds save identically
    deltas: terrain.exportDeltas().sort((a, b) => (a[1] - b[1]) || (a[0] - b[0]))
  };
}

function restoreTerrain(terrain, data) {
  terrain.waterLevel = data.waterLevel;
  terrain.globalTemp = data.globalTemp;
  terrain.timeAge = data.timeAge;
  terrain.corrosionTimer = data.corrosionTimer;
  terrain.particles = [];
  terrain.importDeltas(data.deltas);
}

// ---------- civilizations ----------

function serializeCiv(civ) {
  return {
    ...pickFields(civ, CIV_SKIP),
    eraId: civ.era.id,
    governmentId: civ.government.id,
    diplomacy: [...civ.diplomacy.entries()],
    warTargetId: civ.warTarget ? civ.warTarget.id : null,
    territory: civ.territory.map(t => [t.x, t.y])
  };
}

function restoreCivs(dataList) {
  const civs = dataList.map(d => {
    const civ = new Civilization({ id: d.id, name: d.name });
    const { eraId, governmentId, diplomacy, warTargetId, territory, ...fields } = d;
    Object.assign(civ, fields);
    civ.era = ERAS.find(e => e.id === eraId) || ERAS[0];
    civ.government = GOVERNMENTS.find(g => g.id === governmentId) || GOVERNMENTS[0];
    civ.diplomacy = new Map(diplomacy);
    civ.territory = territory.map(([x, y]) => ({ x, y }));
    civ.warTarget = null;
    return civ;
  });
  dataList.forEach((d, i) => {
    if (d.warTargetId) civs[i].warTarget = civs.find(c => c.id === d.warTargetId) || null;
  });
  return civs;
}

// ---------- one planet ----------

export function serializeSim(sim) {
  const civs = sim.society.civilizations;
  return {
    rngState: sim.rng.state,
    lastActiveCosmicAge: sim.lastActiveCosmicAge || 0,
    simSeconds: sim.simSeconds || 0,
    terrain: serializeTerrain(sim.terrain),
    species: sim.ecosystem.speciesCatalog.map(s => s.toJSON()),
    timeYears: sim.ecosystem.timeYears,
    nextSpeciesIndex: sim.ecosystem.registry.nextIndex,
    extinctions: [...sim.ecosystem.extinctions],
    births: sim.ecosystem.births,
    deaths: sim.ecosystem.deaths,
    worldEvents: sim.ecosystem.worldEvents || [],
    worldEventSeq: sim.ecosystem.worldEventSeq || 0,
    effects: sim.terrain.effects ? sim.terrain.effects.toJSON() : [],
    effectsMeta: { seq: sim.terrain.effects ? sim.terrain.effects.seq : 0, naturalTimer: sim.terrain.effects ? sim.terrain.effects.naturalTimer : null },
    civs: civs.map(serializeCiv),
    entities: sim.ecosystem.entities.map(e => ({
      ...pickFields(e, ENTITY_SKIP),
      genome: e.genome.toJSON(),
      pregnancy: e.pregnancy
        ? { fatherId: e.pregnancy.fatherId, timeLeft: e.pregnancy.timeLeft, embryos: e.pregnancy.embryos.map(g => g.toJSON()) }
        : null,
      speciesId: e.species ? e.species.id : null,
      civId: e.civilization ? e.civilization.id : null
    }))
  };
}

// Rebuilds terrain, ecosystem, society and rng. Renderer/divine powers are created by the caller.
export function restoreSim(data, rngSeedLabel = 'restore') {
  const rng = new SeededRNG(rngSeedLabel);
  rng.state = data.rngState;

  // Construct on a scratch stream: the constructors roll random worlds that we overwrite below
  const scratch = new SeededRNG('restore-scratch');
  const { terrain, ecosystem, society } = withRng(scratch, () => {
    const terrain = new PlanetTerrain({ seed: data.terrain.seed, type: data.terrain.planetType, flat: data.terrain.flat, width: data.terrain.width, height: data.terrain.height });
    const ecosystem = new Ecosystem(terrain);
    const society = new SocietyManager(terrain, ecosystem);
    terrain.ecosystem = ecosystem;
    terrain.society = society;
    return { terrain, ecosystem, society };
  });

  const civs = withRng(scratch, () => restoreCivs(data.civs));
  restoreTerrain(terrain, data.terrain);

  ecosystem.speciesCatalog = data.species.map(s => Species.fromJSON(s));
  ecosystem.registry.nextIndex = data.nextSpeciesIndex;
  ecosystem.timeYears = data.timeYears;
  ecosystem.extinctions = [...data.extinctions];
  ecosystem.births = data.births;
  ecosystem.deaths = data.deaths;
  ecosystem.notifications = [];
  // god powers (older saves have none)
  ecosystem.worldEvents = Array.isArray(data.worldEvents) ? data.worldEvents : [];
  ecosystem.worldEventSeq = data.worldEventSeq || 0;
  ensureEffects(terrain, ecosystem, society).loadJSON(data.effects || [], data.effectsMeta || {});

  const civById = new Map(civs.map(c => [c.id, c]));
  const speciesById = new Map(ecosystem.speciesCatalog.map(s => [s.id, s]));
  ecosystem.entities = withRng(scratch, () => data.entities.map(d => {
    const { speciesId, civId, genome, pregnancy, ...fields } = d;
    const entity = new Entity({ species: speciesById.get(speciesId) });
    Object.assign(entity, fields);
    entity.setGenome(Genome.fromJSON(genome));
    entity.pregnancy = pregnancy
      ? { fatherId: pregnancy.fatherId, timeLeft: pregnancy.timeLeft, embryos: pregnancy.embryos.map(g => Genome.fromJSON(g)) }
      : null;
    entity.species = speciesById.get(speciesId);
    entity.civilization = civId ? civById.get(civId) || null : null;
    entity.path = [];
    entity.target = null;
    return entity;
  }));

  society.civilizations = civs;
  society._lastAliveCount = civs.filter(c => c.isAlive).length;

  return { terrain, ecosystem, society, rng, lastActiveCosmicAge: data.lastActiveCosmicAge, simSeconds: data.simSeconds || 0 };
}

// ---------- whole game ----------

// state: { seed, cosmicTimeAge, activeSystemId, activePlanetId, customPlanets, sims: Map<planetId, sim> }
export function serializeGame(state) {
  const sims = {};
  for (const [planetId, sim] of state.sims) sims[planetId] = serializeSim(sim);
  return {
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    seed: state.seed,
    cosmicTimeAge: state.cosmicTimeAge,
    activeSystemId: state.activeSystemId,
    activePlanetId: state.activePlanetId,
    customPlanets: state.customPlanets,
    sims
  };
}

// Validates a parsed save. Throws SaveError with a readable message instead of loading partially.
export function validateSave(data) {
  if (!data || typeof data !== 'object') throw new SaveError('This is not a Genesis & Cosmos save file.');
  if (data.version === 1) {
    throw new SaveError('This save was made before the infinite-world update and cannot be loaded.');
  }
  if (data.version === 2) {
    throw new SaveError('This save was made before the planet-sized world update (finite map and resources) and cannot be loaded.');
  }
  if (data.version !== SAVE_VERSION) {
    throw new SaveError(`Unsupported save version ${data.version} (this game reads version ${SAVE_VERSION}).`);
  }
  for (const key of ['seed', 'cosmicTimeAge', 'activeSystemId', 'activePlanetId', 'customPlanets', 'sims']) {
    if (data[key] === undefined) throw new SaveError(`The save is missing "${key}".`);
  }
  return data;
}

export function parseSave(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new SaveError('The save could not be read (it is not valid JSON).');
  }
  return validateSave(data);
}
