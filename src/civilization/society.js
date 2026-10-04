import { ERAS, getEraForPoints } from './techTree.js';
import { scaleChance } from '../simulation/fixedStep.js';
import { random } from '../simulation/random.js';
import { initTown, tickTown } from './townPlanner.js';

export const INITIAL_CITIZENS = 6;
export const POP_PER_CITIZEN = 10;      // each citizen entity stands for 10 people in civ stats
export const MIN_POPULATION = 10;       // lower bound for the derived population figure
export const MAX_CITIZENS = 40;         // citizen entities per civ
export const FOOD_CAP = 400;            // granary limit, above the 220 birth threshold
export const FAMINE_DEATH_INTERVAL = 3; // simulated seconds between famine deaths
export const MIN_WAR_DURATION = 20;     // simulated seconds before a war can end by surrender
export const MAX_WAR_DURATION = 180;    // simulated seconds before war weariness ends it
export const TRUCE_DURATION = 120;      // simulated seconds of peace enforced after a war

export const GOVERNMENTS = [
  { id: 'THEOCRACY', name: 'Holy Theocracy', icon: '⛪', desc: 'Ruled by High Priests devoted to the Creator. Harsh on heretics.' },
  { id: 'MONARCHY', name: 'Feudal Monarchy', icon: '👑', desc: 'Ruled by King and noble houses. Focuses on castles and knights.' },
  { id: 'REPUBLIC', name: 'Civic Republic', icon: '🏛️', desc: 'Ruled by elected Senate. Encourages science, commerce, and philosophy.' },
  { id: 'CHIEFTAINCY', name: 'Tribal Chieftaincy', icon: '🪵', desc: 'Primal tribal rule by the strongest warrior.' }
];

export class Civilization {
  constructor(config = {}) {
    this.id = config.id || 'civ_' + random().toString(36).substring(2, 9);
    this.name = config.name || 'Valoria';
    this.color = config.color || '#3b82f6';
    this.symbol = config.symbol || '👑';
    this.capitalX = config.capitalX || 30;
    this.capitalY = config.capitalY || 30;

    this.population = config.population || 40;
    this.food = 120;
    this.techPoints = 0;
    this.era = ERAS[0];
    this.piety = config.piety !== undefined ? config.piety : 75;

    // Government, Politics & Laws
    this.government = config.government || GOVERNMENTS[Math.floor(random() * GOVERNMENTS.length)];
    this.laws = [
      'Sacred Covenant: Reverence for the Creator',
      'Civic Peace: Banditry and Murder Outlawed',
      'Territorial Sovereignty'
    ];
    this.crimeRate = 0.1;
    this.unrest = 0.05;

    // Warfare & Diplomacy
    this.diplomacy = new Map(); // otherCivId -> 'PEACE' | 'TENSION' | 'WAR'
    this.warTarget = null;
    this.warTimer = 0;
    this.truce = 0;
    this.militaryStrength = 20;

    this.isAlive = true;
    this.ruinsLeft = 0;
    this.territory = [];

    this.prosperity = 1;    // multiplies how likely couples are to conceive (food surplus > 1, famine < 1)
    this.citizens = 0;      // living member entities, refreshed by SocietyManager.refreshCensus
    this.soldiers = 0;      // living members with role SOLDIER
    this.famineTimer = 0;
  }

  update(dt, speedMultiplier, terrain, allCivs, ecosystem) {
    if (!this.isAlive) return;

    const effSpeed = Math.min(speedMultiplier, 100);
    const simDt = dt * effSpeed;

    // Population is derived from living citizens (SocietyManager.refreshCensus runs first)
    if (this.citizens === 0) {
      this.collapse(terrain, 'Depopulation', ecosystem);
      return;
    }

    this.truce = Math.max(0, this.truce - simDt);
    if (this.warTarget) {
      this.warTimer += simDt;
      this.checkWarEnd(ecosystem);
    }

    // Research & Technology Progression
    this.techPoints += simDt * (0.4 + this.population * 0.04);
    const newEra = getEraForPoints(this.techPoints);
    if (newEra.id !== this.era.id) {
      this.era = newEra;
      ecosystem.notifications.unshift({
        text: `🏛️ Epoch Advance: "${this.name}" has entered the ${this.era.name}!`,
        time: Date.now()
      });
    }

    // Food: a surplus makes couples conceive more often (children cost food, see Ecosystem.bear);
    // a deficit brings famine, which kills one citizen at a time
    this.food = Math.min(FOOD_CAP, this.food + simDt * (this.territory.length * 0.9 * this.era.bonuses.farmBonus - this.population * 0.35));
    this.prosperity = this.food > 220 ? 1.3 : (this.food < 0 ? 0.5 : 1);
    if (this.food < 0) this.starve(ecosystem, simDt);

    // Update military count based on population
    this.militaryStrength = Math.floor(this.population * 0.25);

    // Territorial Expansion & Construction
    if (random() < scaleChance(0.2, dt)) {
      this.expandTerritory(terrain);
    }
    // The interim town planner builds the civ's sites and lays out new ones (see civilization/townPlanner.js)
    tickTown(this, terrain, simDt);

    // Diplomacy & War checks with neighbor civilizations
    if (random() < scaleChance(0.08, dt)) {
      this.evaluateDiplomacy(allCivs, ecosystem);
    }
  }

  // Famine kills one citizen every FAMINE_DEATH_INTERVAL simulated seconds.
  starve(ecosystem, simDt) {
    this.famineTimer += simDt;
    if (this.famineTimer < FAMINE_DEATH_INTERVAL) return;
    this.famineTimer = 0;
    const victim = ecosystem.entities.find(e => e.alive && e.civilization === this);
    if (victim) victim.die('Famine');
  }

  evaluateDiplomacy(allCivs, ecosystem) {
    for (const other of allCivs) {
      if (other === this || !other.isAlive) continue;

      const dist = Math.hypot(this.capitalX - other.capitalX, this.capitalY - other.capitalY);

      // Close neighbors can develop tension or declare war
      if (dist < 45) {
        const curStatus = this.diplomacy.get(other.id) || 'PEACE';

        if (curStatus === 'PEACE' && !this.warTarget && !other.warTarget && this.truce <= 0 && other.truce <= 0) {
          // Religious difference or resource greed can trigger war!
          const religiousRift = Math.abs(this.piety - other.piety) > 40;
          if (religiousRift || random() < 0.12) {
            this.declareWar(other, ecosystem, religiousRift ? 'Holy Crusade over Heresy' : 'Border Dispute & Expansion');
          }
        }
      }
    }
  }

  declareWar(targetCiv, ecosystem, reason) {
    if (this.warTarget || targetCiv.warTarget) return;

    this.diplomacy.set(targetCiv.id, 'WAR');
    targetCiv.diplomacy.set(this.id, 'WAR');
    this.warTarget = targetCiv;
    targetCiv.warTarget = this;
    this.warTimer = 0;
    targetCiv.warTimer = 0;

    ecosystem.notifications.unshift({
      text: `⚔️ WAR DECLARED! "${this.name}" has waged war against "${targetCiv.name}" (${reason})!`,
      time: Date.now()
    });
  }

  checkWarEnd(ecosystem) {
    const foe = this.warTarget;
    if (!foe) return;
    if (!foe.isAlive) {
      this.endWar(ecosystem, `${foe.name} has fallen`, this);
      return;
    }
    if (this.warTimer < MIN_WAR_DURATION) return;

    if (this.soldiers === 0 && foe.soldiers === 0) {
      this.endWar(ecosystem, `both armies of ${this.name} and ${foe.name} are spent`, null);
    } else if (this.soldiers === 0) {
      this.endWar(ecosystem, `${this.name} surrenders to ${foe.name}`, foe);
    } else if (foe.soldiers === 0) {
      this.endWar(ecosystem, `${foe.name} surrenders to ${this.name}`, this);
    } else if (this.warTimer > MAX_WAR_DURATION) {
      this.endWar(ecosystem, `war weariness ends the conflict between ${this.name} and ${foe.name}`, null);
    }
  }

  endWar(ecosystem, reason, winner) {
    const foe = this.warTarget;
    if (!foe) return;
    for (const [civ, other] of [[this, foe], [foe, this]]) {
      civ.diplomacy.set(other.id, 'PEACE');
      civ.warTarget = null;
      civ.warTimer = 0;
      civ.truce = TRUCE_DURATION;
    }
    if (winner) winner.piety = Math.min(100, winner.piety + 5);
    ecosystem.notifications.unshift({
      text: `🕊️ Peace: ${reason}.`,
      time: Date.now()
    });
  }

  expandTerritory(terrain) {
    const range = Math.min(18, 4 + Math.floor(this.population / 20));
    const tx = this.capitalX + Math.floor((random() - 0.5) * range * 2);
    const ty = this.capitalY + Math.floor((random() - 0.5) * range * 2);

    const tile = terrain.getTile(tx, ty);
    if (tile.biome.isWater || (tile.civId && tile.civId !== this.id)) return;

    tile.civId = this.id;
    if (!this.territory.some(t => t.x === tx && t.y === ty)) {
      this.territory.push({ x: tx, y: ty });
    }

    // Borders may cover any land. Buildings are laid out by the town planner (townPlanner.js), not one per tile;
    // a civ without a town yet (a loaded old save, a test world) gets its hall now.
    if (!this.town) initTown(this, terrain);
  }

  collapse(terrain, reason, ecosystem) {
    this.isAlive = false;
    if (this.warTarget) this.endWar(ecosystem, `${this.name} collapsed`, this.warTarget);
    // every building of the civ falls into ruins that later nomads may find
    for (const b of terrain.buildingsOfCiv(this.id)) {
      terrain.removeBuilding(b.id, { ruins: true, name: `Ancient Ruins of ${this.name}`, originalTech: this.techPoints });
      this.ruinsLeft++;
    }
    for (const t of this.territory) {
      const tile = terrain.getTile(t.x, t.y);
      if (tile && tile.structure && tile.structure.buildingId === undefined) {
        tile.structure = {
          type: 'ruins',
          icon: '🏺',
          name: `Ancient Ruins of ${this.name}`,
          originalTech: this.techPoints,
          health: 30
        };
        this.ruinsLeft++;
      }
      if (tile) tile.civId = null;
    }
    this.territory = [];

    for (const ent of ecosystem.entities) {
      if (ent.civilization === this) ent.civilization = null;
    }

    ecosystem.notifications.unshift({
      text: `⚡ Collapse of Empire: "${this.name}" has fallen into ruins (${reason})!`,
      time: Date.now()
    });
  }
}

export class SocietyManager {
  constructor(terrain, ecosystem) {
    this.terrain = terrain;
    this.ecosystem = ecosystem;
    this.civilizations = [];
    ecosystem.society = this;

    this.initDefaultCivs();
    this.reassignUnaffiliated();
    this.refreshCensus();
    this._lastAliveCount = this.civilizations.filter(c => c.isAlive).length;
  }

  initDefaultCivs() {
    const civNames = [
      { name: 'Kingdom of Valoria', color: '#38bdf8', symbol: '👑', gov: GOVERNMENTS[1] },
      { name: 'Holy Covenant of Sol', color: '#f59e0b', symbol: '☀️', gov: GOVERNMENTS[0] },
      { name: 'Republic of Aethelgard', color: '#10b981', symbol: '🏛️', gov: GOVERNMENTS[2] }
    ];

    const home = this.terrain.home;
    for (const [index, cData] of civNames.entries()) {
      let placed = false;
      for (let attempts = 0; attempts < 120 && !placed; attempts++) {
        // Capitals start around the home area, spread out in different directions
        const angle = (index / civNames.length) * Math.PI * 2 + (random() - 0.5) * 1.2;
        const dist = 14 + random() * 26;
        const cx = Math.round(home.x + Math.cos(angle) * dist);
        const cy = Math.round(home.y + Math.sin(angle) * dist);
        const tile = this.terrain.getTile(cx, cy);

        if (this.terrain.isBuildable(cx, cy) && !tile.civId) {
          const civ = new Civilization({
            name: cData.name,
            color: cData.color,
            symbol: cData.symbol,
            capitalX: cx,
            capitalY: cy,
            government: cData.gov,
            population: 45
          });
          initTown(civ, this.terrain); // the hall, a street and a few huts; the capital moves to the hall's door
          civ.expandTerritory(this.terrain);
          this.civilizations.push(civ);
          this.spawnCitizens(civ, INITIAL_CITIZENS);
          placed = true;
        }
      }
    }
  }

  spawnCitizens(civ, count) {
    let spawned = 0;
    for (let i = 0; i < count; i++) {
      if (this.ecosystem.spawnCitizen(civ)) spawned++;
    }
    return spawned;
  }

  // Humans join the civ that owns their tile, otherwise the nearest living capital.
  assignCitizen(entity) {
    if (!entity.alive || !entity.isSapient) return null;
    const tile = this.terrain.getTile(Math.floor(entity.x), Math.floor(entity.y));
    let civ = null;
    if (tile && tile.civId) {
      civ = this.civilizations.find(c => c.id === tile.civId && c.isAlive) || null;
    }
    if (!civ) {
      let best = Infinity;
      for (const c of this.civilizations) {
        if (!c.isAlive) continue;
        const d = Math.hypot(c.capitalX - entity.x, c.capitalY - entity.y);
        if (d < best) {
          best = d;
          civ = c;
        }
      }
    }
    entity.civilization = civ;
    return civ;
  }

  reassignUnaffiliated() {
    for (const ent of this.ecosystem.entities) {
      if (!ent.civilization) this.assignCitizen(ent);
    }
  }

  // One pass over all creatures: counts citizens and soldiers per civ and derives population.
  refreshCensus() {
    const counts = new Map();
    for (const e of this.ecosystem.entities) {
      if (!e.alive || !e.civilization) continue;
      const c = counts.get(e.civilization.id) || { citizens: 0, soldiers: 0 };
      c.citizens++;
      if (e.role === 'SOLDIER') c.soldiers++;
      counts.set(e.civilization.id, c);
    }
    for (const civ of this.civilizations) {
      const c = counts.get(civ.id) || { citizens: 0, soldiers: 0 };
      civ.citizens = c.citizens;
      civ.soldiers = c.soldiers;
      civ.population = Math.max(MIN_POPULATION, civ.citizens * POP_PER_CITIZEN);
    }
  }

  update(dt, speedMultiplier) {
    this.refreshCensus();
    for (const civ of this.civilizations) {
      civ.update(dt, speedMultiplier, this.terrain, this.civilizations, this.ecosystem);
    }

    // When a civ falls or is founded, homeless humans join the nearest living civ
    const aliveCount = this.civilizations.filter(c => c.isAlive).length;
    if (aliveCount !== this._lastAliveCount) {
      this._lastAliveCount = aliveCount;
      this.reassignUnaffiliated();
    }

    if (random() < scaleChance(0.005, dt)) {
      this.checkRuinsRebirth();
    }
  }

  // Nomads who find ruins near a living human may found a new civilization there.
  checkRuinsRebirth() {
    this.terrain.scanTiles((tile) => {
      // Only every 6th tile is examined, like the original sparse scan
      if (tile.x % 6 !== 0 || tile.y % 6 !== 0) return false;
      if (!tile.structure || tile.structure.type !== 'ruins' || tile.civId) return false;

      const x = tile.x;
      const y = tile.y;
      const nearbyHuman = this.ecosystem.entities.find(e =>
        e.alive && e.isSapient && Math.hypot(e.x - x, e.y - y) < 10
      );
      if (!nearbyHuman) return false;

      const ancientTech = tile.structure.originalTech || 250;
      const newCiv = new Civilization({
        name: 'Neo-' + (tile.structure.name.replace('Ancient Ruins of ', '') || 'Eldoria'),
        color: '#' + Math.floor(random() * 16777215).toString(16).padStart(6, '0'),
        capitalX: x,
        capitalY: y,
        population: 35
      });
      newCiv.techPoints = Math.floor(ancientTech * 0.7);
      newCiv.era = getEraForPoints(newCiv.techPoints);
      this.civilizations.push(newCiv);
      nearbyHuman.civilization = newCiv;

      tile.civId = newCiv.id;
      initTown(newCiv, this.terrain); // a hall rises over the ruins

      this.ecosystem.notifications.unshift({
        text: `✨ Rebirth of Civilization: Nomads discovered ancient ruins and founded "${newCiv.name}"!`,
        time: Date.now()
      });
      return true;
    });
  }

  inspireCivWithKnowledge(civId, techBonus = 400) {
    const civ = this.civilizations.find(c => c.id === civId);
    if (civ) {
      civ.techPoints += techBonus;
      civ.piety = Math.min(100, civ.piety + 20);
      this.ecosystem.notifications.unshift({
        text: `✨ Divine Revelation: You granted sacred knowledge to "${civ.name}"! (+${techBonus} Tech)`,
        time: Date.now()
      });
    }
  }
}
