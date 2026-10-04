// God power behaviour: instant casts (CASTS) and the handlers of long-running active effects (HANDLERS).
//
// `fx` is the ActiveEffects manager of one planet (it carries terrain, ecosystem and society).
// All simulation randomness goes through random(); cosmetic visuals use fx.addVisual (not saved).
// Every successful cast pushes an event onto the world event bus (see events.js).
import { random } from '../simulation/random.js';
import { classifyBiome, BIOMES } from '../planet/biomes.js';
import { Genome, recombine, BODY_GENES, COLOR_GENES, PART_COUNTS } from '../life/genome.js';
import { Entity } from '../life/entity.js';
import { FOOD_CAP } from '../civilization/society.js';
import { pushWorldEvent } from './events.js';
import { POWER_BY_ID } from './powerCatalog.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rnd = (a, b) => a + random() * (b - a);

// ---------- helpers ----------

export function livingNear(fx, x, y, r) {
  const out = [];
  for (const e of fx.ecosystem.entities) {
    if (e.alive && Math.hypot(e.x - x, e.y - y) <= r) out.push(e);
  }
  return out;
}

export function nearestLiving(fx, x, y, r, filter = null) {
  let best = null;
  let bd = r;
  for (const e of fx.ecosystem.entities) {
    if (!e.alive || (filter && !filter(e))) continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d <= bd) { best = e; bd = d; }
  }
  return best;
}

export function isShielded(fx, x, y) {
  for (const e of fx.list) {
    if (e.type === 'aura' && e.status === 'shield' && Math.hypot(e.x - x, e.y - y) <= e.radius) return true;
  }
  return false;
}

const FLAMMABLE = new Set(['house', 'farm', 'tent', 'hut', 'wooden_house', 'longhouse', 'hall', 'granary', 'lumber_camp', 'pen', 'market_stall', 'dock', 'windmill', 'palisade', 'palisade_gate', 'workshop', 'tavern']);

export function hurt(fx, ent, amount, cause) {
  if (!ent.alive || amount <= 0) return;
  if ((ent.status && ent.status.shield > 0) || isShielded(fx, ent.x, ent.y)) return;
  ent.health -= amount;
  if (ent.health <= 0) ent.die(cause);
}

export function ruinTile(fx, tile, name) {
  if (!tile || !tile.structure || tile.structure.type === 'ruins') return false;
  if (isShielded(fx, tile.x + 0.5, tile.y + 0.5)) return false;
  fx.terrain.wreckStructure(tile, name, '🏚️');
  return true;
}

export function damageStructure(fx, tile, amount, ruinName) {
  const s = tile && tile.structure;
  if (!s || s.type === 'ruins') return false;
  if (isShielded(fx, tile.x + 0.5, tile.y + 0.5)) return false;
  if (s.buildingId !== undefined) {
    if (fx.terrain.damageBuilding(s.buildingId, amount)) return true;
    return false;
  }
  s.health = (typeof s.health === 'number' ? s.health : 100) - amount;
  if (s.health <= 0) return ruinTile(fx, tile, ruinName);
  return false;
}

const reclassify = (fx, tile) => {
  tile.biome = classifyBiome(tile.elevation, tile.temperature, tile.moisture, fx.terrain.planetType);
};

function flammability(tile) {
  if (!tile || tile.biome.isWater) return 0;
  const id = tile.biome.id;
  if (id === 'GLACIAL_ICE' || id === 'VOLCANIC' || id === 'DESERT' || tile.moisture > 0.92) return 0;
  let f = (tile.flora / 100) * (1.15 - tile.moisture * 0.5);
  const s = tile.structure;
  if (s && FLAMMABLE.has(s.type)) f = Math.max(f, 0.8);
  return f;
}

function civById(fx, id) {
  return fx.society.civilizations.find(c => c.id === id) || null;
}

// The civilization at a spot: owner of the tile, else the nearest capital within 14 tiles.
function civNear(fx, x, y) {
  const tile = fx.terrain.getTile(x, y);
  if (tile && tile.civId) { const c = civById(fx, tile.civId); if (c && c.isAlive) return c; }
  let best = null;
  let bd = 14;
  for (const c of fx.society.civilizations) {
    if (!c.isAlive) continue;
    const d = Math.hypot(c.capitalX - x, c.capitalY - y);
    if (d < bd) { best = c; bd = d; }
  }
  return best;
}

function civsIn(fx, x, y, r) {
  const set = new Set();
  fx.terrain.applyRadialEffect(Math.floor(x), Math.floor(y), r, tile => {
    if (tile.civId) { const c = civById(fx, tile.civId); if (c && c.isAlive) set.add(c); }
  });
  for (const c of fx.society.civilizations) {
    if (c.isAlive && Math.hypot(c.capitalX - x, c.capitalY - y) <= r) set.add(c);
  }
  return [...set];
}

export function ignite(fx, x, y, cells = 1) {
  const tile = fx.terrain.getTile(x, y);
  if (!tile || flammability(tile) <= 0) return false;
  if (isShielded(fx, x, y)) return false;
  // join a nearby fire instead of starting another
  for (const e of fx.list) {
    if (e.type === 'wildfire' && Math.hypot(e.x - x, e.y - y) < 12) {
      if (!e.cells.some(c => c[0] === Math.floor(x) && c[1] === Math.floor(y))) e.cells.push([Math.floor(x), Math.floor(y), rnd(5, 8)]);
      return true;
    }
  }
  fx.spawn('wildfire', x, y, { radius: 2, duration: 260, cells: [[Math.floor(x), Math.floor(y), rnd(5, 8)]], source: 'god' });
  return true;
}

// A small meteor / comet impact: crater, blast, ruins, damage.
export function impact(fx, x, y, radius, damage) {
  const t = fx.terrain;
  t.applyRadialEffect(Math.floor(x), Math.floor(y), radius, (tile, dist) => {
    if (dist < radius * 0.5) {
      tile.elevation = Math.max(0.2, tile.elevation - 0.06);
      tile.biome = BIOMES.VOLCANIC;
      tile.flora = 0;
      if (tile.structure && !isShielded(fx, tile.x + 0.5, tile.y + 0.5)) fx.terrain.clearStructure(tile);
    } else {
      tile.flora = Math.max(0, tile.flora - 50);
      ruinTile(fx, tile, 'Blasted Ruins');
    }
  });
  for (const e of livingNear(fx, x, y, radius * 1.6)) hurt(fx, e, damage * (1 - Math.hypot(e.x - x, e.y - y) / (radius * 1.8)), 'Struck by a Meteor');
  fx.addVisual('impact', x + 0.5, y + 0.5, { radius: radius * 1.6, life: 2.4 });
  fx.addVisual('crater', x + 0.5, y + 0.5, { radius: radius * 0.8, life: 40 });
  if (random() < 0.6) ignite(fx, x + (random() - 0.5) * radius * 2, y + (random() - 0.5) * radius * 2);
}

function strikeBolt(fx, x, y) {
  const t = fx.terrain;
  t.strikeLightning(Math.floor(x), Math.floor(y));
  fx.addVisual('bolt', x, y, { life: 0.5, seed: Math.random() });
  if (random() < 0.3) ignite(fx, x, y);
}

function clearMarkers(fx, x, y, r, types) {
  let n = 0;
  for (const e of fx.list) {
    if (!types.includes(e.type) && !types.includes(e.visual)) continue;
    if (Math.hypot(e.x - x, e.y - y) > r + (e.radius || 0)) continue;
    if (e.type === 'wildfire') {
      e.cells = e.cells.filter(c => Math.hypot(c[0] + 0.5 - x, c[1] + 0.5 - y) > r);
    } else {
      e.done = true;
    }
    n++;
  }
  return n;
}

function setStatus(ent, key, seconds, data) {
  if (!ent.status) ent.status = {};
  ent.status[key] = Math.max(ent.status[key] || 0, seconds);
  if (data !== undefined) {
    if (!ent.statusData) ent.statusData = {};
    ent.statusData[key] = data;
  }
}

function dragonSpecies(fx) {
  const reg = fx.ecosystem.registry;
  let species = reg.species.find(s => s.isCustom && s.name === 'Dragon' && !s.extinct);
  if (species) return species;
  const template = Genome.pure({
    size: 1, speed: 0.62, metabolism: 0.35, carnivory: 1, herbivory: 0, aggression: 1, sociality: 0.1,
    fertility: 0.02, lifespan: 1, intelligence: 0.4, perception: 0.9, coldTol: 0.9, heatTol: 1, prefTemp: 0.5,
    wings: 2, horns: 3, hue: 0.02, sat: 0.8, light: 0.45
  });
  species = reg.found(template.phenotype(), { name: 'Dragon', isCustom: true, foundedAt: fx.ecosystem.timeYears });
  species._template = null;
  return species;
}

export function spawnDragon(fx, x, y) {
  const species = dragonSpecies(fx);
  const genome = Genome.fromPhenotype(species.centroid);
  const ent = new Entity({ species, genome, x: x + 0.5, y: y + 0.5, sex: 'M', age: 20, hunger: 10 });
  ent.name = 'Dragon';
  ent.isMonster = true;
  ent.sizeMod = 2.4;
  ent.maxHealth = (60 + ent.stats.sizeScale * 40) * 4;
  ent.health = ent.maxHealth;
  ent.mateCooldown = 1e9;
  fx.ecosystem.entities.push(ent);
  species.population++;
  return ent;
}

function rescale(ent) {
  ent.maxHealth = (60 + ent.stats.sizeScale * 40) * (ent.sizeMod || 1);
}

// ---------- instant casts: (fx, x, y, opts) => true | 'reason' ----------

const R = (id, o) => (POWER_BY_ID[id].radius || 0) * ((o && o.scale) || 1);
const aura = (fx, id, x, y, o, p) => fx.spawn('aura', x, y, { radius: R(id, o), source: (o && o.source) || 'god', power: id, ...p });

export const CASTS = {
  // ---- legacy terrain powers (implemented in planetTerrain) ----
  TERRAFORM_RAISE(fx, x, y) {
    fx.terrain.raiseMountain(x, y, 3, 0.28);
    fx.addVisual('shockwave', x + 0.5, y + 0.5, { radius: 5, life: 1.2, color: '#d48833' });
    fx.addVisual('crack', x + 0.5, y + 0.5, { radius: 3.5, life: 5 });
    return true;
  },
  TERRAFORM_LOWER(fx, x, y) {
    fx.terrain.lowerOcean(x, y, 3, 0.32);
    fx.addVisual('shockwave', x + 0.5, y + 0.5, { radius: 5, life: 1.4, color: '#38bdf8' });
    return true;
  },
  TSUNAMI(fx, x, y) {
    fx.terrain.castTsunami(x, y, 6);
    fx.addVisual('wave', x + 0.5, y + 0.5, { radius: 7, life: 3 });
    clearMarkers(fx, x, y, 6, ['wildfire']);
    return true;
  },
  VOLCANO(fx, x, y) {
    fx.terrain.strikeVolcanicFissure(x, y, 4);
    fx.addVisual('shockwave', x + 0.5, y + 0.5, { radius: 6, life: 1.6, color: '#ff6a1a' });
    fx.addVisual('embers', x + 0.5, y + 0.5, { radius: 5, life: 4 });
    fx.addVisual('crack', x + 0.5, y + 0.5, { radius: 4, life: 8, glow: true });
    return true;
  },
  SINGULARITY(fx, x, y) {
    fx.terrain.spawnSurfaceSingularity(x, y, 5);
    fx.addVisual('implosion', x + 0.5, y + 0.5, { radius: 8, life: 2.5 });
    return true;
  },
  PLAGUE(fx, x, y) {
    fx.terrain.castDivinePlague(x, y, 7);
    fx.addVisual('mist', x + 0.5, y + 0.5, { radius: 7, life: 5, color: '#4ade80' });
    return true;
  },
  DIVINE_RAIN(fx, x, y) {
    fx.terrain.castDivineRain(x, y, 6);
    clearMarkers(fx, x, y, 6, ['wildfire']);
    fx.addVisual('rain', x + 0.5, y + 0.5, { radius: 6, life: 4 });
    return true;
  },
  LIGHTNING(fx, x, y) {
    fx.terrain.strikeLightning(x, y);
    fx.addVisual('bolt', x + 0.5, y + 0.5, { life: 0.55, seed: Math.random(), flash: true });
    if (random() < 0.5) ignite(fx, x, y);
    return true;
  },
  METEOR(fx, x, y) {
    fx.addVisual('meteor', x + 0.5, y + 0.5, { life: 1.1, radius: 7 });
    fx.spawn('meteors', x, y, { radius: 7, duration: 3, incoming: [{ x, y, eta: 1.1, r: 5, big: true }], source: 'god', count: 0 });
    return true;
  },
  INSPIRATION(fx, x, y) {
    const tile = fx.terrain.getTile(x, y);
    if (tile.civId) {
      fx.society.inspireCivWithKnowledge(tile.civId, 450);
    } else {
      const civ = civNear(fx, x, y);
      if (civ) fx.society.inspireCivWithKnowledge(civ.id, 450);
      else fx.society.initDefaultCivs();
    }
    fx.addVisual('godray', x + 0.5, y + 0.5, { radius: 3, life: 3, color: '#fde68a' });
    fx.addVisual('sparkles', x + 0.5, y + 0.5, { radius: 3, life: 3, color: '#fde68a' });
    return true;
  },
  BLESSING(fx, x, y) {
    for (const e of livingNear(fx, x, y, 5)) {
      e.health = e.maxHealth;
      e.hunger = 0;
      e.energy = 100;
      e.breath = 100;
      e.isPlagued = false;
    }
    fx.addVisual('sparkles', x + 0.5, y + 0.5, { radius: 5, life: 2.5, color: '#67e8f9' });
    fx.addVisual('godray', x + 0.5, y + 0.5, { radius: 2.5, life: 1.8, color: '#a5f3fc' });
    return true;
  },

  // ---- terrain ----
  EARTHQUAKE(fx, x, y, o) {
    const r = R('EARTHQUAKE', o);
    const power = (o && o.scale) || 1;
    fx.terrain.applyRadialEffect(Math.floor(x), Math.floor(y), r, (tile, d) => {
      const f = 1 - d / (r + 1);
      if (tile.structure) {
        damageStructure(fx, tile, 35 + 70 * f, 'Quake Ruins');
        if (random() < 0.6 * f) ruinTile(fx, tile, 'Quake Ruins');
      }
      if (random() < 0.05 * f && !tile.biome.isWater) tile.flora = Math.max(0, tile.flora - 30);
    });
    for (const e of livingNear(fx, x, y, r)) hurt(fx, e, (14 + 34 * (1 - Math.hypot(e.x - x, e.y - y) / (r + 1))) * power, 'Crushed in an Earthquake');
    fx.addVisual('shockwave', x + 0.5, y + 0.5, { radius: r, life: 1.6, color: '#c8a46a' });
    fx.addVisual('crack', x + 0.5, y + 0.5, { radius: r, life: 12 });
    fx.spawn('quake', x, y, { radius: r, duration: 5, source: (o && o.source) || 'god' });
    return true;
  },
  LAVA_FLOW(fx, x, y, o) {
    fx.spawn('lava', x, y, { radius: 3, duration: 50, cells: [[Math.floor(x), Math.floor(y), 0]], source: (o && o.source) || 'god' });
    CASTS.VOLCANO_LITE(fx, x, y);
    return true;
  },
  VOLCANO_LITE(fx, x, y) {
    fx.addVisual('shockwave', x + 0.5, y + 0.5, { radius: 3, life: 1.2, color: '#ff6a1a' });
    fx.addVisual('embers', x + 0.5, y + 0.5, { radius: 3, life: 3 });
  },
  SPRING(fx, x, y) {
    const t = fx.terrain;
    const carve = (tx, ty) => {
      const tile = t.getTile(tx, ty);
      if (!tile) return;
      tile.elevation = Math.min(tile.elevation, 0.465);
      if (tile.structure) fx.terrain.clearStructure(tile);
      tile.flora = 0;
      tile.biome = BIOMES.SHALLOWS;
    };
    const visited = new Set([key(x, y)]);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      carve(x + dx, y + dy);
      visited.add(key(x + dx, y + dy));
    }
    // the river runs downhill (with some wandering) until it meets water
    let heading = random() * Math.PI * 2;
    let cx = Math.round(x + Math.cos(heading) * 2);
    let cy = Math.round(y + Math.sin(heading) * 2);
    carve(cx, cy);
    visited.add(key(cx, cy));
    for (let step = 0; step < 22; step++) {
      let best = null;
      let bestScore = Infinity;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const nx = Math.round(cx + Math.cos(a));
        const ny = Math.round(cy + Math.sin(a));
        if (visited.has(key(nx, ny))) continue;
        const tile = t.getTile(nx, ny);
        const turn = Math.abs(Math.atan2(Math.sin(a - heading), Math.cos(a - heading)));
        const score = tile.elevation + turn * 0.02 + random() * 0.01;
        if (score < bestScore) { bestScore = score; best = [nx, ny, a]; }
      }
      if (!best) break;
      cx = best[0];
      cy = best[1];
      heading = best[2];
      visited.add(key(cx, cy));
      const tile = t.getTile(cx, cy);
      const wasWater = tile.biome.isWater;
      carve(cx, cy);
      if (wasWater && step > 3) break;
    }
    t.applyRadialEffect(x, y, R('SPRING') + 2, (tile, d) => {
      if (tile.biome.isWater) return;
      tile.moisture = Math.min(1, tile.moisture + 0.3 * (1 - d / 6));
      tile.flora = Math.min(100, tile.flora + 50 * (1 - d / 6));
    });
    fx.addVisual('spring', x + 0.5, y + 0.5, { radius: 3, life: 4 });
    fx.addVisual('sparkles', x + 0.5, y + 0.5, { radius: 3, life: 3, color: '#7dd3fc' });
    return true;
  },

  // ---- nature ----
  PLANT_FOREST(fx, x, y) {
    const r = R('PLANT_FOREST');
    fx.terrain.applyRadialEffect(Math.floor(x), Math.floor(y), r, (tile, d) => {
      if (tile.biome.isWater || tile.biome.id === 'GLACIAL_ICE') return;
      const f = 1 - d / (r + 1);
      tile.flora = Math.min(100, tile.flora + 60 * f + 20);
      if (random() < 0.7 * f + 0.2) {
        tile.moisture = Math.max(tile.moisture, 0.62);
        reclassify(fx, tile);
      }
    });
    fx.addVisual('leaves', x + 0.5, y + 0.5, { radius: r, life: 3 });
    return true;
  },
  WARM_CLIMATE(fx, x, y, o) {
    fx.spawn('climate', x, y, { radius: R('WARM_CLIMATE', o), duration: 300, field: 'temperature', delta: 0.16, visual: 'warm', power: 'WARM_CLIMATE', source: (o && o.source) || 'god' });
    return true;
  },
  COOL_CLIMATE(fx, x, y, o) {
    fx.spawn('climate', x, y, { radius: R('COOL_CLIMATE', o), duration: 300, field: 'temperature', delta: -0.16, visual: 'cool', power: 'COOL_CLIMATE', source: (o && o.source) || 'god' });
    return true;
  },
  CLEAR_SKIES(fx, x, y) {
    const r = R('CLEAR_SKIES');
    clearMarkers(fx, x, y, r, ['tornado', 'wildfire', 'locusts', 'lightning_storm', 'lava', 'blizzard', 'acid', 'meteors', 'haunt']);
    fx.terrain.applyRadialEffect(Math.floor(x), Math.floor(y), r, tile => { tile.moisture = Math.min(1, tile.moisture + 0.04); });
    fx.addVisual('shockwave', x + 0.5, y + 0.5, { radius: r, life: 1.8, color: '#e0f2fe' });
    fx.addVisual('godray', x + 0.5, y + 0.5, { radius: r * 0.5, life: 3, color: '#fef9c3' });
    return true;
  },
  RAINBOW(fx, x, y, o) {
    aura(fx, 'RAINBOW', x, y, o, { duration: 28, status: 'joy', heal: 2, visual: 'rainbow' });
    return true;
  },
  AURORA(fx, x, y, o) {
    aura(fx, 'AURORA', x, y, o, { duration: 40, visual: 'aurora' });
    for (const civ of civsIn(fx, x, y, R('AURORA', o))) civ.piety = Math.min(100, civ.piety + 4);
    return true;
  },
  MAGIC_MUSHROOMS(fx, x, y, o) {
    aura(fx, 'MAGIC_MUSHROOMS', x, y, o, { duration: 50, status: 'shroom', flora: 4, visual: 'mushrooms' });
    return true;
  },

  // ---- blessings ----
  BOUNTIFUL_HARVEST(fx, x, y) {
    const r = R('BOUNTIFUL_HARVEST');
    fx.terrain.applyRadialEffect(Math.floor(x), Math.floor(y), r, (tile, d) => {
      if (tile.biome.isWater) return;
      tile.flora = 100;
      tile.moisture = Math.min(1, tile.moisture + 0.04);
      if (tile.structure && tile.structure.type === 'farm') {
        if (tile.structure.buildingId === undefined) tile.structure.health = Math.min(150, (tile.structure.health || 70) + 40);
        else if (tile.structure.anchor) fx.terrain.repairBuilding(tile.structure.buildingId, 40);
      }
    });
    for (const civ of civsIn(fx, x, y, r)) civ.food = Math.min(FOOD_CAP, civ.food + 140);
    for (const e of livingNear(fx, x, y, r)) e.hunger = Math.max(0, e.hunger - 45);
    fx.addVisual('harvest', x + 0.5, y + 0.5, { radius: r, life: 3.5 });
    return true;
  },
  HEALING_SPRING(fx, x, y, o) {
    aura(fx, 'HEALING_SPRING', x, y, o, { duration: 60, heal: 9, cure: true, flora: 3, visual: 'healing' });
    return true;
  },
  DIVINE_SHIELD(fx, x, y, o) {
    aura(fx, 'DIVINE_SHIELD', x, y, o, { duration: 60, status: 'shield', visual: 'shield' });
    return true;
  },
  FERTILITY_BLESSING(fx, x, y, o) {
    aura(fx, 'FERTILITY_BLESSING', x, y, o, { duration: 120, status: 'fertile', visual: 'fertility' });
    return true;
  },
  GIFT_OF_FIRE(fx, x, y) {
    const civ = civNear(fx, x, y);
    if (!civ) return 'No civilization nearby to teach.';
    fx.society.inspireCivWithKnowledge(civ.id, 320);
    civ.food = Math.min(FOOD_CAP, civ.food + 80);
    fx.addVisual('fire_gift', civ.capitalX + 0.5, civ.capitalY + 0.5, { radius: 3, life: 4 });
    fx.addVisual('godray', civ.capitalX + 0.5, civ.capitalY + 0.5, { radius: 2.5, life: 3, color: '#fdba74' });
    return true;
  },
  GIFT_OF_TOOLS(fx, x, y) {
    const civ = civNear(fx, x, y);
    if (!civ) return 'No civilization nearby to teach.';
    fx.spawn('gift', civ.capitalX, civ.capitalY, { radius: 3, duration: 90, civId: civ.id, rate: 7, source: 'god' });
    fx.addVisual('godray', civ.capitalX + 0.5, civ.capitalY + 0.5, { radius: 2.5, life: 3, color: '#bae6fd' });
    return true;
  },
  REVEAL_ORE(fx, x, y) {
    const t = fx.terrain;
    const r = R('REVEAL_ORE');
    const civ = civNear(fx, x, y);
    const found = [];
    // Look at every deposit within the radius (peekDeposit never generates chunks)
    const rr = Math.ceil(r);
    for (let dy = -rr; dy <= rr; dy++) {
      for (let dx = -rr; dx <= rr; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const d = t.peekDeposit ? t.peekDeposit(Math.floor(x) + dx, Math.floor(y) + dy) : null;
        if (d) found.push({ type: d.type, x: Math.floor(x) + dx, y: Math.floor(y) + dy });
      }
    }
    // The nation now KNOWS where these are (the society system reads civ.knownDeposits)
    if (civ) {
      civ.knownDeposits = civ.knownDeposits || [];
      const seen = new Set(civ.knownDeposits.map(k => k.x + ',' + k.y));
      for (const f of found) if (!seen.has(f.x + ',' + f.y)) civ.knownDeposits.push(f);
      civ.techPoints += 40 + found.length * 2;
    }
    fx.addVisual('glint', x + 0.5, y + 0.5, { radius: r, life: 4 });
    return true;
  },
  RESURRECTION(fx, x, y) {
    let n = 0;
    for (const e of fx.ecosystem.entities) {
      if (e.alive || !(e.decayTimer > 0) || Math.hypot(e.x - x, e.y - y) > R('RESURRECTION')) continue;
      e.alive = true;
      e.health = e.maxHealth * 0.6;
      e.hunger = 20;
      e.breath = 100;
      e.decayTimer = undefined;
      e.causeOfDeath = null;
      e.isPlagued = false;
      e.path = [];
      setStatus(e, 'joy', 8);
      fx.addVisual('resurrect', e.x, e.y, { radius: 2, life: 3 });
      n++;
    }
    if (!n) return 'Nobody has died here recently.';
    fx.addVisual('godray', x + 0.5, y + 0.5, { radius: 3, life: 3.5, color: '#fef9c3' });
    return true;
  },
  GUARDIAN_SPIRIT(fx, x, y) {
    const target = nearestLiving(fx, x, y, 9, e => e.isSapient) || nearestLiving(fx, x, y, 9);
    if (!target) return 'No creature nearby to guard.';
    fx.spawn('guardian', target.x, target.y, { radius: 4, duration: 100, targetId: target.id, source: 'god' });
    return true;
  },
  PROPHET(fx, x, y) {
    const target = nearestLiving(fx, x, y, R('PROPHET'), e => e.isSapient && !e.isProphet) || nearestLiving(fx, x, y, R('PROPHET'), e => e.isSapient);
    if (!target) return 'No mortal here can hear the voice.';
    target.isProphet = true;
    target.epithet = 'The Prophet';
    target.personality.piety = 1;
    target.belief = target.determineBelief();
    setStatus(target, 'joy', 20);
    if (target.civilization) target.civilization.piety = Math.min(100, target.civilization.piety + 15);
    fx.addVisual('godray', target.x, target.y, { radius: 2.5, life: 4, color: '#fff7c2' });
    fx.addVisual('sparkles', target.x, target.y, { radius: 2.5, life: 4, color: '#fde68a' });
    return true;
  },

  // ---- curses ----
  TORNADO(fx, x, y, o) {
    fx.spawn('tornado', x, y, { radius: 3, duration: 45, heading: random() * Math.PI * 2, source: (o && o.source) || 'god' });
    return true;
  },
  WILDFIRE(fx, x, y) {
    const tile = fx.terrain.getTile(x, y);
    if (tile.biome.isWater) return 'Water does not burn.';
    // light the ground even where nothing grows, so the player always sees something
    const cells = [[x, y, 8], [x + 1, y, 6], [x - 1, y, 6], [x, y + 1, 6], [x, y - 1, 6]];
    fx.spawn('wildfire', x, y, { radius: 2, duration: 260, cells, source: 'god' });
    return true;
  },
  BLIZZARD(fx, x, y, o) {
    fx.spawn('climate', x, y, { radius: R('BLIZZARD', o), duration: 70, field: 'temperature', delta: -0.2, hurt: 2.5, floraLoss: 0.6, visual: 'blizzard', power: 'BLIZZARD', source: (o && o.source) || 'god' });
    return true;
  },
  ICE_AGE(fx, x, y, o) {
    fx.spawn('climate', x, y, { radius: R('ICE_AGE', o), duration: 600, field: 'temperature', delta: -0.34, floraLoss: 0.15, visual: 'snow', power: 'ICE_AGE', source: (o && o.source) || 'god' });
    return true;
  },
  DROUGHT(fx, x, y, o) {
    fx.spawn('climate', x, y, { radius: R('DROUGHT', o), duration: 160, field: 'moisture', delta: -0.45, floraLoss: 0.9, structDmg: 0.15, visual: 'dust', power: 'DROUGHT', source: (o && o.source) || 'god' });
    return true;
  },
  LOCUSTS(fx, x, y) {
    fx.spawn('locusts', x, y, { radius: 3, duration: 50, source: 'god' });
    return true;
  },
  FAMINE(fx, x, y) {
    const r = R('FAMINE');
    for (const civ of civsIn(fx, x, y, r)) civ.food -= 220;
    fx.terrain.applyRadialEffect(Math.floor(x), Math.floor(y), r, (tile, d) => {
      tile.flora = Math.max(0, tile.flora - 55 * (1 - d / (r + 1)));
      if (tile.structure && tile.structure.type === 'farm') damageStructure(fx, tile, 45, 'Failed Farm');
    });
    for (const e of livingNear(fx, x, y, r)) e.hunger = Math.min(100, e.hunger + 35);
    fx.addVisual('rot', x + 0.5, y + 0.5, { radius: r, life: 4 });
    return true;
  },
  BLIGHT(fx, x, y) {
    fx.spawn('climate', x, y, { radius: R('BLIGHT'), duration: 90, field: null, floraLoss: 2.2, structDmg: 0.35, farmOnly: true, foodDrain: 2, visual: 'blight', power: 'BLIGHT', source: 'god' });
    return true;
  },
  ACID_RAIN(fx, x, y, o) {
    fx.spawn('climate', x, y, { radius: R('ACID_RAIN', o), duration: 45, field: null, hurt: 2.2, floraLoss: 3, structDmg: 3.5, visual: 'acid', power: 'ACID_RAIN', source: (o && o.source) || 'god' });
    return true;
  },
  BARRENNESS(fx, x, y, o) {
    aura(fx, 'BARRENNESS', x, y, o, { duration: 240, status: 'barren', visual: 'barren' });
    return true;
  },
  MADNESS(fx, x, y, o) {
    aura(fx, 'MADNESS', x, y, o, { duration: 30, status: 'mad', visual: 'madness' });
    return true;
  },
  HAUNT(fx, x, y, o) {
    aura(fx, 'HAUNT', x, y, o, { duration: 45, status: 'haunt', hurt: 0.8, visual: 'haunt' });
    return true;
  },

  // ---- creatures ----
  MONSTER(fx, x, y) {
    if (fx.ecosystem.entities.length >= 700) return 'The world is too crowded.';
    const tile = fx.terrain.getTile(x, y);
    if (tile.biome.isWater) return 'The dragon needs dry land.';
    spawnDragon(fx, x, y);
    fx.addVisual('shockwave', x + 0.5, y + 0.5, { radius: 5, life: 1.6, color: '#f97316' });
    fx.addVisual('embers', x + 0.5, y + 0.5, { radius: 3, life: 3 });
    fx.addVisual('implosion', x + 0.5, y + 0.5, { radius: 4, life: 1.8, color: '#f97316', reverse: true });
    return true;
  },
  GIANT_GROWTH(fx, x, y) {
    const e = nearestLiving(fx, x, y, 3);
    if (!e) return 'No creature here.';
    e.sizeMod = clamp((e.sizeMod || 1) * 1.7, 0.3, 3.5);
    rescale(e);
    e.health = e.maxHealth;
    fx.addVisual('grow', e.x, e.y, { radius: 2, life: 1.6 });
    return true;
  },
  SHRINK(fx, x, y) {
    const e = nearestLiving(fx, x, y, 3);
    if (!e) return 'No creature here.';
    e.sizeMod = clamp((e.sizeMod || 1) * 0.55, 0.3, 3.5);
    rescale(e);
    e.health = Math.min(e.health, e.maxHealth);
    fx.addVisual('grow', e.x, e.y, { radius: 2, life: 1.6, reverse: true });
    return true;
  },
  CHARM(fx, x, y, o) {
    if (!livingNear(fx, x, y, R('CHARM', o)).length) return 'Nobody to charm here.';
    aura(fx, 'CHARM', x, y, o, { duration: 40, status: 'charm', visual: 'charm' });
    return true;
  },
  SHAPESHIFT(fx, x, y) {
    const targets = livingNear(fx, x, y, R('SHAPESHIFT'));
    if (!targets.length) return 'No creature here.';
    for (const e of targets) {
      const mutated = recombine(e.genome, e.genome, { mutationRate: 0.5, strength: 0.12 });
      for (const gene of BODY_GENES) {
        const v = Math.floor(random() * PART_COUNTS[gene]);
        mutated.alleles[gene] = [v, v];
      }
      for (const gene of COLOR_GENES) {
        const v = random();
        mutated.alleles[gene] = [v, v];
      }
      e.setGenome(mutated);
      rescale(e);
      const reg = fx.ecosystem.registry;
      const matched = reg.assign(e.traits, e.species);
      if (matched) e.species = matched;
      else reg.considerFounder(e, e.species, fx.ecosystem.timeYears, (s, p) => fx.ecosystem.announceSpecies(s, p));
      fx.addVisual('shapeshift', e.x, e.y, { radius: 1.8, life: 1.8 });
    }
    return true;
  },

  // ---- chaos ----
  LIGHTNING_STORM(fx, x, y, o) {
    fx.spawn('lightning_storm', x, y, { radius: R('LIGHTNING_STORM', o), duration: 30, source: (o && o.source) || 'god' });
    return true;
  },
  GRAVITY_WELL(fx, x, y) {
    fx.spawn('gravity', x, y, { radius: R('GRAVITY_WELL'), duration: 12, source: 'god' });
    return true;
  },
  TIME_BUBBLE(fx, x, y) {
    fx.spawn('time_bubble', x, y, { radius: R('TIME_BUBBLE'), duration: 40, factor: 4, source: 'god' });
    return true;
  },
  TELEPORT(fx, x, y) {
    const targets = livingNear(fx, x, y, R('TELEPORT'));
    if (!targets.length) return 'No creature here.';
    fx.addVisual('whirl', x + 0.5, y + 0.5, { radius: 4, life: 1.5 });
    for (const e of targets) {
      const a = random() * Math.PI * 2;
      const d = 20 + random() * 25;
      const spot = fx.ecosystem.landNear(e.x + Math.cos(a) * d, e.y + Math.sin(a) * d, 5);
      if (!spot) continue;
      e.x = spot.x + 0.5;
      e.y = spot.y + 0.5;
      e.path = [];
      e.homeX = e.x;
      e.homeY = e.y;
      fx.addVisual('whirl', e.x, e.y, { radius: 2, life: 1.5 });
    }
    return true;
  },
  FIREWORKS(fx, x, y, o) {
    aura(fx, 'FIREWORKS', x, y, o, { duration: 10, status: 'joy', heal: 1, visual: 'fireworks' });
    return true;
  },

  METEOR_SHOWER(fx, x, y, o) {
    fx.spawn('meteors', x, y, { radius: R('METEOR_SHOWER', o), duration: Math.max(12, 30 * ((o && o.scale) || 1)), incoming: [], count: 0, source: (o && o.source) || 'god', small: o && o.scale ? o.scale : 1 });
    return true;
  }
};

// Casting entry point used by DivinePowersManager, natural disasters and tests.
// Returns { ok: true } or { ok: false, reason }.
export function castPower(id, fx, x, y, opts = {}) {
  const def = POWER_BY_ID[id];
  const cast = CASTS[id];
  if (!def || !cast) return { ok: false, reason: 'Unknown power.' };
  x = Math.floor(x);
  y = Math.floor(y);
  const result = cast(fx, x, y, opts);
  if (result !== true) return { ok: false, reason: typeof result === 'string' ? result : 'Nothing happened.' };
  const scale = opts.scale || 1;
  const source = opts.source || 'god';
  pushWorldEvent(fx.ecosystem, {
    kind: source === 'nature' && def.eventKind !== 'omen' ? 'disaster' : (def.eventKind || 'miracle'),
    name: opts.name || def.name,
    x: x + 0.5,
    y: y + 0.5,
    radius: R(id, opts) || 2,
    source,
    magnitude: Math.round(clamp((def.cost / 45) * scale, 0.05, 1) * 100) / 100
  });
  return { ok: true };
}

// ---------- handlers for active effects ----------

// true once every `interval` seconds
function every(e, key, interval, dt) {
  e[key] = (e[key] || 0) + dt;
  if (e[key] >= interval) { e[key] -= interval; return true; }
  return false;
}

const key = (x, y) => x + ',' + y;
const NEIGHBORS = [[1, 0], [-1, 0], [0, 1], [0, -1]];


// Moves a climate effect to strength `env` (0..1): the temperature/moisture nudge is applied as a relative change
// so it composes with other powers and returns exactly to zero when the effect ends.
function applyClimate(e, fx, env) {
  const t = fx.terrain;
  const dEnv = env - (e.env || 0);
  e.env = env;
  t.applyRadialEffect(Math.floor(e.x), Math.floor(e.y), e.radius, (tile, d) => {
    const f = 0.4 + 0.6 * (1 - d / (e.radius + 0.01));
    if (e.field && Math.abs(dEnv) > 1e-9) {
      tile[e.field] = tile[e.field] + e.delta * f * dEnv;
      reclassify(fx, tile);
    }
    if (env <= 0.01) return;
    if (e.floraLoss && !tile.biome.isWater) {
      if (!e.farmOnly || (tile.structure && tile.structure.type === 'farm') || random() < 0.5) tile.flora = Math.max(0, tile.flora - e.floraLoss * env * f);
    }
    if (e.structDmg && tile.structure && (!e.farmOnly || tile.structure.type === 'farm')) {
      damageStructure(fx, tile, e.structDmg * env * f, e.visual === 'acid' ? 'Dissolved Ruins' : 'Withered Ruins');
    }
  });
  if (e.hurt && env > 0.05) {
    for (const ent of livingNear(fx, e.x, e.y, e.radius)) {
      hurt(fx, ent, e.hurt * env, e.visual === 'blizzard' ? 'Froze in a Blizzard' : 'Burned by Acid Rain');
    }
  }
  if (e.foodDrain && env > 0.05) {
    for (const civ of civsIn(fx, e.x, e.y, e.radius)) civ.food -= e.foodDrain * env;
  }
}

export const HANDLERS = {
  // A zone that applies a status / heals / hurts everything inside while it lasts.
  aura: {
    tick(e, fx, dt) {
      if (!every(e, 'acc', 0.5, dt)) return;
      const t = fx.terrain;
      for (const ent of livingNear(fx, e.x, e.y, e.radius)) {
        if (e.status) {
          setStatus(ent, e.status, e.status === 'mad' ? 4 : 1.6, e.status === 'charm' ? [e.x, e.y] : undefined);
        }
        if (e.heal) ent.health = Math.min(ent.maxHealth, ent.health + e.heal * 0.5);
        if (e.cure) ent.isPlagued = false;
        if (e.hurt) hurt(fx, ent, e.hurt * 0.5, 'Haunted to Death');
        if (e.status === 'joy') ent.hunger = Math.max(0, ent.hunger - 0.5);
      }
      if (e.flora) {
        t.applyRadialEffect(Math.floor(e.x), Math.floor(e.y), e.radius, tile => {
          if (!tile.biome.isWater) tile.flora = Math.min(100, tile.flora + e.flora);
        });
      }
    }
  },

  // Zones that change temperature/moisture (relative nudges that return to zero), hurt and wither things.
  climate: {
    tick(e, fx, dt) {
      if (!every(e, 'acc', 1, dt)) return;
      const up = Math.min(1, e.age / (e.duration * 0.15));
      const down = Math.min(1, (e.duration - e.age) / (e.duration * 0.4));
      applyClimate(e, fx, Math.max(0, Math.min(up, down)));
    },
    end(e, fx) {
      applyClimate(e, fx, 0); // return the land exactly to where it was
    }
  },

  tornado: {
    tick(e, fx, dt) {
      // wander: persistent heading with random drift
      e.heading += (random() - 0.5) * 1.6 * dt;
      e.x += Math.cos(e.heading) * 1.6 * dt;
      e.y += Math.sin(e.heading) * 1.6 * dt;
      if (!every(e, 'acc', 0.25, dt)) return;
      const t = fx.terrain;
      for (const ent of livingNear(fx, e.x, e.y, 3.2)) {
        const d = Math.hypot(ent.x - e.x, ent.y - e.y);
        hurt(fx, ent, 4 + (d < 1.6 ? 9 : 0), 'Torn Apart by a Tornado');
        if (!ent.alive) continue;
        ent.path = [];
        if (d < 1.8) {
          const a = random() * Math.PI * 2;
          const throwDist = 3 + random() * 6;
          ent.x += Math.cos(a) * throwDist;
          ent.y += Math.sin(a) * throwDist;
          setStatus(ent, 'flung', 1.5);
        } else {
          ent.x += (e.x - ent.x) * 0.25;
          ent.y += (e.y - ent.y) * 0.25;
        }
      }
      t.applyRadialEffect(Math.floor(e.x), Math.floor(e.y), 1.9, (tile, d) => {
        tile.flora = Math.max(0, tile.flora - 25);
        if (tile.structure && random() < 0.45) damageStructure(fx, tile, 70, 'Flattened Ruins');
      });
    }
  },

  wildfire: {
    tick(e, fx, dt) {
      if (!every(e, 'acc', 0.5, dt)) return;
      const t = fx.terrain;
      const keys = new Set(e.cells.map(c => key(c[0], c[1])));
      const next = [];
      const damp = Math.max(0.25, 1 - e.age / e.duration);
      for (const c of e.cells) {
        c[2] -= 0.5;
        const tile = t.getTile(c[0], c[1]);
        if (c[2] <= 0) {
          tile.flora = 0;
          const s = tile.structure;
          if (s && FLAMMABLE.has(s.type)) ruinTile(fx, tile, 'Burnt Ruins');
          else if (s) damageStructure(fx, tile, 35, 'Burnt Ruins');
          continue;
        }
        next.push(c);
        tile.flora *= 0.85;
        if (next.length + e.cells.length < 700) {
          for (const [dx, dy] of NEIGHBORS) {
            const nx = c[0] + dx;
            const ny = c[1] + dy;
            if (keys.has(key(nx, ny))) continue;
            const f = flammability(t.getTile(nx, ny));
            if (f > 0 && random() < 0.22 * f * damp && !isShielded(fx, nx, ny)) {
              keys.add(key(nx, ny));
              next.push([nx, ny, rnd(4, 8)]);
            }
          }
        }
      }
      e.cells = next;
      e.x = next.length ? next[0][0] : e.x;
      e.y = next.length ? next[0][1] : e.y;
      const live = new Set(next.map(c => key(c[0], c[1])));
      for (const ent of fx.ecosystem.entities) {
        if (!ent.alive || !live.has(key(Math.floor(ent.x), Math.floor(ent.y)))) continue;
        setStatus(ent, 'burning', 3);
        hurt(fx, ent, 9, 'Burned in a Wildfire');
      }
      if (!next.length) e.done = true;
    }
  },

  locusts: {
    tick(e, fx, dt) {
      const t = fx.terrain;
      // fly toward the greenest ground nearby
      if (every(e, 'look', 1.5, dt)) {
        let best = null;
        let bs = 0;
        for (let i = 0; i < 12; i++) {
          const px = e.x + (random() - 0.5) * 16;
          const py = e.y + (random() - 0.5) * 16;
          const tile = t.getTile(px, py);
          const score = tile.flora + (tile.structure && tile.structure.type === 'farm' ? 60 : 0) - Math.hypot(px - e.x, py - e.y) * 2;
          if (!tile.biome.isWater && score > bs) { bs = score; best = [px, py]; }
        }
        e.goal = best || [e.x + (random() - 0.5) * 10, e.y + (random() - 0.5) * 10];
      }
      if (e.goal) {
        const d = Math.hypot(e.goal[0] - e.x, e.goal[1] - e.y) || 1;
        e.x += ((e.goal[0] - e.x) / d) * 1.3 * dt;
        e.y += ((e.goal[1] - e.y) / d) * 1.3 * dt;
      }
      if (!every(e, 'acc', 0.5, dt)) return;
      t.applyRadialEffect(Math.floor(e.x), Math.floor(e.y), 2.6, tile => {
        if (tile.biome.isWater) return;
        tile.flora = Math.max(0, tile.flora - 14);
        if (tile.structure && tile.structure.type === 'farm') {
          damageStructure(fx, tile, 8, 'Stripped Farm');
          const civ = tile.civId ? civById(fx, tile.civId) : null;
          if (civ) civ.food -= 5;
        }
      });
    }
  },

  lava: {
    tick(e, fx, dt) {
      const t = fx.terrain;
      if (every(e, 'acc', 0.7, dt) && e.cells.length < 80) {
        const hot = e.cells.filter(c => c[2] < 12);
        const from = hot.length ? hot[Math.floor(random() * hot.length)] : null;
        if (from) {
          const ft = t.getTile(from[0], from[1]);
          const [dx, dy] = NEIGHBORS[Math.floor(random() * 4)];
          const nx = from[0] + dx;
          const ny = from[1] + dy;
          const nt = t.getTile(nx, ny);
          if (nt.biome.isWater) {
            fx.addVisual('mist', nx + 0.5, ny + 0.5, { radius: 2, life: 3, color: '#e2e8f0' });
            from[2] = 99;
          } else if (nt.elevation <= ft.elevation + 0.012 && !e.cells.some(c => c[0] === nx && c[1] === ny)) {
            e.cells.push([nx, ny, 0]);
          }
        }
      }
      const live = new Set();
      for (const c of e.cells) {
        c[2] += dt;
        const tile = t.getTile(c[0], c[1]);
        if (tile.biome.id !== 'VOLCANIC' || tile.flora > 0 || tile.structure) {
          tile.biome = BIOMES.VOLCANIC;
          tile.flora = 0;
          if (tile.structure && !isShielded(fx, c[0], c[1])) tile.structure = { type: 'ruins', name: 'Molten Ruins', icon: '🏚️', health: 0, ruinAge: 0 };
        }
        if (c[2] < 25) live.add(key(c[0], c[1]));
        if (c[2] < 25 && random() < 0.02) ignite(fx, c[0] + (random() - 0.5) * 3, c[1] + (random() - 0.5) * 3);
      }
      if (every(e, 'dmg', 0.5, dt)) {
        for (const ent of fx.ecosystem.entities) {
          if (ent.alive && live.has(key(Math.floor(ent.x), Math.floor(ent.y)))) {
            setStatus(ent, 'burning', 3);
            hurt(fx, ent, 25, 'Melted by Lava');
          }
        }
      }
    }
  },

  meteors: {
    tick(e, fx, dt) {
      // a shower schedules a new rock every ~1.1 s for its whole duration
      if (e.small !== undefined && e.count !== undefined && e.duration > 10 && e.age < e.duration - 2 && every(e, 'spawn', 1.1 + (1 - (e.small || 1)) * 3, dt)) {
        const a = random() * Math.PI * 2;
        const d = Math.sqrt(random()) * e.radius;
        e.incoming.push({ x: e.x + Math.cos(a) * d, y: e.y + Math.sin(a) * d, eta: 1.3, r: 2.4 * (e.small || 1), big: false });
      }
      for (const m of e.incoming) m.eta -= dt;
      const hit = e.incoming.filter(m => m.eta <= 0);
      if (hit.length) {
        e.incoming = e.incoming.filter(m => m.eta > 0);
        for (const m of hit) {
          if (m.big) {
            fx.terrain.strikeMeteor(Math.floor(m.x), Math.floor(m.y));
            fx.addVisual('impact', m.x + 0.5, m.y + 0.5, { radius: 10, life: 3 });
            fx.addVisual('crater', m.x + 0.5, m.y + 0.5, { radius: 3.5, life: 45 });
            fx.addVisual('embers', m.x + 0.5, m.y + 0.5, { radius: 6, life: 4 });
            ignite(fx, m.x + 4, m.y);
          } else {
            impact(fx, Math.floor(m.x), Math.floor(m.y), m.r, 200);
          }
        }
      }
      if (e.duration <= 10 && !e.incoming.length) e.done = true;
    }
  },

  lightning_storm: {
    tick(e, fx, dt) {
      if (!every(e, 'acc', 0.55, dt)) return;
      const a = random() * Math.PI * 2;
      const d = Math.sqrt(random()) * e.radius;
      strikeBolt(fx, e.x + Math.cos(a) * d, e.y + Math.sin(a) * d);
    }
  },

  quake: {
    tick(e, fx, dt) {
      if (!every(e, 'acc', 1, dt)) return;
      // aftershocks: smaller tremors that finish off weakened buildings
      fx.terrain.applyRadialEffect(Math.floor(e.x), Math.floor(e.y), e.radius * 0.8, (tile, d) => {
        if (tile.structure && random() < 0.1) damageStructure(fx, tile, 35, 'Quake Ruins');
      });
    }
  },

  gravity: {
    tick(e, fx, dt) {
      for (const ent of livingNear(fx, e.x, e.y, e.radius)) {
        const d = Math.hypot(e.x - ent.x, e.y - ent.y) || 0.1;
        const pull = (2.5 + (1 - d / e.radius) * 4) * dt;
        ent.x += ((e.x - ent.x) / d) * Math.min(pull, d);
        ent.y += ((e.y - ent.y) / d) * Math.min(pull, d);
        ent.path = [];
        if (d < 1.2) hurt(fx, ent, 9 * dt, 'Crushed by a Gravity Well');
        if (d < e.radius * 0.6) setStatus(ent, 'flung', 0.5);
      }
    },
    end(e, fx) {
      for (const ent of livingNear(fx, e.x, e.y, e.radius)) {
        const a = random() * Math.PI * 2;
        const dd = 5 + random() * 6;
        ent.x += Math.cos(a) * dd;
        ent.y += Math.sin(a) * dd;
        ent.path = [];
        hurt(fx, ent, 8, 'Flung by a Gravity Well');
      }
      fx.addVisual('shockwave', e.x + 0.5, e.y + 0.5, { radius: e.radius, life: 1.2, color: '#a78bfa' });
    }
  },

  time_bubble: {
    tick(e, fx, dt) {
      const ctx = { terrain: fx.terrain, pathfinder: fx.ecosystem.pathfinder, entities: fx.ecosystem.entities, ecosystem: fx.ecosystem, grid: fx.ecosystem.grid };
      for (const ent of livingNear(fx, e.x, e.y, e.radius)) {
        ent.update(dt * (e.factor - 1), 1, ctx);
      }
      if (every(e, 'acc', 1, dt)) {
        fx.terrain.applyRadialEffect(Math.floor(e.x), Math.floor(e.y), e.radius, tile => {
          if (!tile.biome.isWater && tile.flora < 100) tile.flora = Math.min(100, tile.flora + tile.biome.fertility * 3 * e.factor);
        });
      }
    }
  },

  gift: {
    tick(e, fx, dt) {
      const civ = civById(fx, e.civId);
      if (!civ || !civ.isAlive) { e.done = true; return; }
      civ.techPoints += e.rate * dt;
    }
  },

  guardian: {
    tick(e, fx, dt) {
      const target = fx.ecosystem.entities.find(x => x.id === e.targetId);
      if (!target || !target.alive) { e.done = true; return; }
      e.x = target.x;
      e.y = target.y;
      if (!every(e, 'acc', 0.5, dt)) return;
      for (const ent of livingNear(fx, e.x, e.y, e.radius)) {
        setStatus(ent, 'shield', 1.6);
        ent.health = Math.min(ent.maxHealth, ent.health + 2);
      }
    }
  }
};

// ---------- per-creature statuses (ticked by the manager every step) ----------

export const TIMED_STATUSES = ['shield', 'joy', 'mad', 'charm', 'haunt', 'shroom', 'fertile', 'barren', 'burning', 'flung'];

export function tickStatus(fx, ent, dt) {
  const s = ent.status;
  if (s.burning > 0) hurt(fx, ent, 5 * dt, 'Burned to Death');
  if (!ent.alive) return;
  if (s.joy > 0) {
    ent.health = Math.min(ent.maxHealth, ent.health + 2 * dt);
    ent.hunger = Math.max(0, ent.hunger - 1 * dt);
  }
  if (s.fertile > 0) {
    if (ent.mateCooldown > 0) ent.mateCooldown = Math.max(0, ent.mateCooldown - dt * 6);
    if (ent.pregnancy) ent.pregnancy.timeLeft -= dt * 3;
  }
  if (s.barren > 0) {
    if (ent.mateCooldown < 8) ent.mateCooldown = 8;
    if (ent.pregnancy && random() < 0.02 * dt * 20) ent.pregnancy = null; // a pregnancy fails
  }
  if (s.charm > 0) {
    const at = ent.statusData && ent.statusData.charm;
    if (at) {
      ent.actionCooldown = Math.max(ent.actionCooldown, 1);
      const d = Math.hypot(at[0] - ent.x, at[1] - ent.y);
      if (d > 2.2) {
        ent.x += ((at[0] - ent.x) / d) * 1.8 * dt;
        ent.y += ((at[1] - ent.y) / d) * 1.8 * dt;
        ent.path = [];
      }
    }
  }
  if (s.haunt > 0 || s.shroom > 0) {
    ent.actionCooldown = Math.max(ent.actionCooldown, 0.8);
    const a = ent.status.wander = (ent.status.wander || random() * 6.28) + (random() - 0.5) * 3 * dt;
    const sp = s.haunt > 0 ? 2.2 : 1.2;
    ent.x += Math.cos(a) * sp * dt;
    ent.y += Math.sin(a) * sp * dt;
    ent.path = [];
    if (s.haunt > 0) ent.energy = Math.max(0, ent.energy - 4 * dt);
  }
  if (s.mad > 0) {
    ent.actionCooldown = Math.max(ent.actionCooldown, 0.8);
    let victim = null;
    let bd = 5;
    for (const o of fx.ecosystem.entities) {
      if (o === ent || !o.alive) continue;
      const d = Math.hypot(o.x - ent.x, o.y - ent.y);
      if (d < bd) { victim = o; bd = d; }
    }
    if (victim) {
      if (bd > 0.8) {
        ent.x += ((victim.x - ent.x) / bd) * 2.6 * dt;
        ent.y += ((victim.y - ent.y) / bd) * 2.6 * dt;
        ent.path = [];
      } else {
        hurt(fx, victim, 16 * dt, `Killed by a Maddened ${ent.name}`);
      }
    }
  }
}

// A dragon (or any creature with isMonster) breathes fire every few seconds.
export function tickMonster(fx, ent, dt) {
  ent.breathCd = (ent.breathCd === undefined ? 3 : ent.breathCd) - dt;
  if (ent.breathCd > 0) return;
  const target = nearestLiving(fx, ent.x, ent.y, 7, o => o !== ent && !o.isMonster);
  if (!target) {
    // nothing in range: stalk the nearest living thing, so a dragon is a real threat even when it is not hungry
    ent.breathCd = 1;
    const prey = nearestLiving(fx, ent.x, ent.y, 45, o => o !== ent && !o.isMonster);
    if (prey && ent.path.length === 0) {
      ent.requestPath(prey.x, prey.y, fx.ecosystem.pathfinder);
      ent.actionCooldown = Math.max(ent.actionCooldown, 3); // keep walking instead of re-deciding
    }
    return;
  }
  ent.breathCd = 5 + random() * 2;
  fx.addVisual('firebreath', ent.x, ent.y, { tx: target.x, ty: target.y, life: 1.2 });
  const tx = Math.floor(target.x);
  const ty = Math.floor(target.y);
  for (const o of livingNear(fx, target.x, target.y, 2)) {
    if (o !== ent && !o.isMonster) { hurt(fx, o, 45, 'Burned by Dragonfire'); setStatus(o, 'burning', 3); }
  }
  fx.terrain.applyRadialEffect(tx, ty, 1.5, tile => {
    if (tile.structure) damageStructure(fx, tile, 80, 'Dragonfire Ruins');
  });
  ignite(fx, tx, ty);
}
