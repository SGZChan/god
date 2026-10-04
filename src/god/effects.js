// ActiveEffects: the long-running god powers and natural disasters of one planet (tornado, wildfire, locusts,
// blizzard, meteor shower, lightning storm, auras, ...). It is owned per planet simulation, updated every
// fixed simulation step (see runSimulationSteps) and saved/restored with the world.
//
// An effect is plain JSON: { id, type, x, y, radius, duration, age, source, ...type specific state }.
// Its behaviour comes from HANDLERS in powerEffects.js. Cosmetic visuals (`visuals`) are not saved.
import { random } from '../simulation/random.js';
import { HANDLERS, TIMED_STATUSES, tickStatus, tickMonster, castPower } from './powerEffects.js';
import { godSettings } from './godSettings.js';

const MAX_EFFECTS = 150;
const MAX_VISUALS = 400;

// Natural disasters: [power, weight, options, display name]
const NATURAL = [
  ['LIGHTNING_STORM', 30, { scale: 0.8 }, 'Thunderstorm'],
  ['DROUGHT', 16, { scale: 0.8 }, 'Drought'],
  ['EARTHQUAKE', 16, { scale: 0.7 }, 'Earthquake'],
  ['METEOR_SHOWER', 10, { scale: 0.35 }, 'Comet'],
  ['TORNADO', 12, { scale: 1 }, 'Tornado'],
  ['BLIZZARD', 8, { scale: 0.9 }, 'Blizzard']
];

export class ActiveEffects {
  constructor(terrain, ecosystem, society) {
    this.terrain = terrain;
    this.ecosystem = ecosystem;
    this.society = society;
    this.list = [];
    this.visuals = [];
    this.seq = 0;
    this.naturalTimer = null; // simulated seconds until the next natural disaster
    terrain.effects = this;
  }

  spawn(type, x, y, params = {}) {
    const effect = { id: `fx_${++this.seq}`, type, x, y, radius: 3, duration: 30, age: 0, source: 'god', ...params };
    if (this.list.length >= MAX_EFFECTS) return effect; // too many at once: this one is not tracked
    this.list.push(effect);
    const handler = HANDLERS[type];
    if (handler && handler.init) handler.init(effect, this);
    return effect;
  }

  addVisual(kind, x, y, opts = {}) {
    if (this.visuals.length >= MAX_VISUALS) this.visuals.shift();
    this.visuals.push({ kind, x, y, age: 0, life: 1, ...opts });
  }

  // real-time seconds (cosmetic only)
  updateVisuals(dt) {
    for (const v of this.visuals) v.age += dt;
    if (this.visuals.length) this.visuals = this.visuals.filter(v => v.age < v.life);
  }

  count(type) {
    return this.list.filter(e => e.type === type).length;
  }

  // Strength of the ground shaking around (x, y), in screen pixels
  shakeAmount(x, y) {
    let s = 0;
    for (const e of this.list) {
      if (e.type !== 'quake') continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d < e.radius * 3 + 20) s = Math.max(s, (1 - e.age / e.duration) * 4);
    }
    return s;
  }

  update(dt) {
    const eco = this.ecosystem;
    for (let i = 0; i < this.list.length; i++) {
      const e = this.list[i];
      e.age += dt;
      const handler = HANDLERS[e.type];
      if (handler && handler.tick) handler.tick(e, this, dt);
    }
    if (this.list.some(e => e.done || e.age >= e.duration)) {
      this.list = this.list.filter(e => {
        if (!e.done && e.age < e.duration) return true;
        const handler = HANDLERS[e.type];
        if (handler && handler.end) handler.end(e, this);
        return false;
      });
    }

    for (const ent of eco.entities) {
      if (!ent.alive) continue;
      if (ent.isMonster) tickMonster(this, ent, dt);
      const s = ent.status;
      if (!s) continue;
      tickStatus(this, ent, dt);
      if (!ent.alive) continue;
      let any = false;
      for (const k of TIMED_STATUSES) {
        if (s[k] > 0) {
          s[k] -= dt;
          if (s[k] > 0) any = true;
          else delete s[k];
        }
      }
      if (!any) { delete ent.status; delete ent.statusData; }
    }

    this.updateNatural(dt);
  }

  updateNatural(dt) {
    if (this.naturalTimer === null) this.naturalTimer = 90 + random() * 150;
    this.naturalTimer -= dt;
    if (this.naturalTimer > 0) return;
    this.naturalTimer = 150 + random() * 300;
    if (!godSettings.naturalDisasters) return;
    this.triggerNatural();
  }

  // Rolls one natural disaster near the living world (so it is noticed). Returns its power id or null.
  triggerNatural(forcedId = null) {
    const eco = this.ecosystem;
    const living = eco.entities.filter(e => e.alive);
    const home = this.terrain.home;
    let at = home;
    if (living.length) {
      const sapient = living.filter(e => e.isSapient);
      const pool = sapient.length && random() < 0.5 ? sapient : living;
      const e = pool[Math.floor(random() * pool.length)];
      at = { x: e.x + (random() - 0.5) * 10, y: e.y + (random() - 0.5) * 10 };
    }
    let choice = NATURAL.find(n => n[0] === forcedId);
    if (!choice) {
      const cold = this.terrain.getTile(at.x, at.y).temperature < 0.45;
      const table = NATURAL.filter(n => n[0] !== 'BLIZZARD' || cold);
      let roll = random() * table.reduce((s, n) => s + n[1], 0);
      choice = table.find(n => (roll -= n[1]) <= 0) || table[0];
    }
    const [id, , options, name] = choice;
    const result = castPower(id, this, at.x, at.y, { ...options, source: 'nature', name });
    if (result.ok) {
      eco.notifications.unshift({ text: `Nature stirs: a ${name.toLowerCase()} strikes near (${Math.floor(at.x)}, ${Math.floor(at.y)}).`, minor: true, time: Date.now() });
      return id;
    }
    return null;
  }

  toJSON() {
    return JSON.parse(JSON.stringify(this.list));
  }

  loadJSON(list, meta = {}) {
    this.list = Array.isArray(list) ? JSON.parse(JSON.stringify(list)) : [];
    this.seq = meta.seq || this.list.reduce((m, e) => Math.max(m, parseInt(String(e.id).slice(3), 10) || 0), 0);
    this.naturalTimer = meta.naturalTimer === undefined ? null : meta.naturalTimer;
    this.visuals = [];
  }
}

export function ensureEffects(terrain, ecosystem, society) {
  return terrain.effects || new ActiveEffects(terrain, ecosystem, society);
}
