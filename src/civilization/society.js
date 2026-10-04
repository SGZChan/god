import { ERAS, getEraForPoints, eraFor } from './techTree.js';
import { scaleChance } from '../simulation/fixedStep.js';
import { random } from '../simulation/random.js';
import { initTown, tickTown, foundHamlet, queueRoad, roadKindFor, eraTier } from './townPlanner.js';
import { settlementsOf, getSettlement, nearestSettlement, createSettlement, findHamletSite, builtSomewhere, buildingsOf, foodCapOf } from './settlements.js';
import { sapientOptions, tickSettlement, seasonOf } from './jobs.js';
import { syncFood, prosperityOf, FOOD_CAP as ECON_FOOD_CAP, take, add } from './economy.js';
import { refreshClans, ensureClan, createClan, pickSplinter, CLAN_SPLIT_SIZE, getClan } from './clans.js';
import { bondFounders, assignHomes, adoptOrphans, feedChildren, clearDeadMates, householdConceptions } from './families.js';
import { revealAround, syncDiscoveries, isExplored, isDiscovered } from './exploration.js';
import { BUILDING_TYPES } from '../world/buildings.js';

export const INITIAL_CITIZENS = 6;
export const POP_PER_CITIZEN = 10;      // each citizen entity stands for 10 people in civ stats
export const MIN_POPULATION = 10;       // lower bound for the derived population figure
export const MAX_CITIZENS = 40;         // legacy flat limit, used only by civilizations without settlements (see settlements.popCap)
export const FOOD_CAP = ECON_FOOD_CAP;  // granary limit, above the 220 birth threshold
export const FAMINE_DEATH_INTERVAL = 3; // simulated seconds between abstract famine deaths (kept for old callers)
export const MIN_WAR_DURATION = 20;     // simulated seconds before a war can end by surrender
export const MAX_WAR_DURATION = 180;    // simulated seconds before war weariness ends it
export const TRUCE_DURATION = 120;      // simulated seconds of peace enforced after a war
export const MAX_SETTLEMENTS = 8;       // per civilization
export const ROAD_TRAFFIC = 26;         // footsteps on a tile before it is worn into a dirt road

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
    this.food = 96;         // aggregate of every settlement's food stockpile (economy.syncFood keeps them in step)
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

    // Society: a network of settlements and clans (see settlements.js, clans.js, exploration.js, economy.js)
    this.settlements = [];
    this.clans = [];
    this.knownDeposits = []; // [{ type, x, y }] found by scouts (and the Revelation of Ore power)
    this.discovered = [];    // resource types found at least once
    this.explored = [];      // explored 16x16-tile cells
    this.output = {};        // cumulative production { item: amount } (gates eras)
    this.clock = 0;          // simulated seconds this civilization has existed
    this.tickAcc = 0;
    this.foodDebt = 0;
    this.foodSeen = 96;      // civ.food as last reconciled with the stockpiles (economy.syncFood)
    this.eraFloor = 0;
    this.seq = {};
  }

  // The capital's town plan (legacy name; every settlement has its own plan in settlement.town)
  get town() {
    return this.settlements && this.settlements[0] ? this.settlements[0].town : null;
  }

  set town(value) { /* old saves stored it here; it now lives in settlements[0].town */ }

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

    // Research: everyone contributes a little, scholars (jobs.js) and crafters do much of it
    this.techPoints += simDt * (0.25 + this.citizens * 0.02);

    // The economy: settlements, stockpiles, jobs, clans, exploration, eras (SocietyManager.tickCiv)
    if (ecosystem.society) ecosystem.society.tickCiv(this, simDt);

    // Update military count based on population
    this.militaryStrength = Math.floor(this.population * 0.25);

    // Territorial Expansion
    if (random() < scaleChance(0.2, dt)) {
      this.expandTerritory(terrain);
    }

    // Diplomacy & War checks with neighbor civilizations
    if (random() < scaleChance(0.08, dt)) {
      this.evaluateDiplomacy(allCivs, ecosystem);
    }
  }

  // Abstract famine (kept for callers that used it): real famine now comes from hungry creatures (entity.update).
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

      // borders come from the settlements: the nearest pair of settlements decides
      let dist = Math.hypot(this.capitalX - other.capitalX, this.capitalY - other.capitalY);
      for (const a of this.settlements) {
        for (const b of other.settlements) dist = Math.min(dist, Math.hypot(a.x - b.x, a.y - b.y));
      }

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

  // Claims one more tile of land around a random settlement (influence grows with its size).
  expandTerritory(terrain) {
    const places = this.settlements.length ? this.settlements : null;
    const st = places ? places[Math.floor(random() * places.length)] : null;
    const cx = st ? st.x : this.capitalX;
    const cy = st ? st.y : this.capitalY;
    const size = st ? (st.population || 4) : this.population / 10;
    const range = Math.min(18, 4 + Math.floor(size / 2));
    const tx = cx + Math.floor((random() - 0.5) * range * 2);
    const ty = cy + Math.floor((random() - 0.5) * range * 2);

    const tile = terrain.getTile(tx, ty);
    if (tile.biome.isWater || (tile.civId && tile.civId !== this.id)) return;

    tile.civId = this.id;
    if (!this.territory.some(t => t.x === tx && t.y === ty)) {
      this.territory.push({ x: tx, y: ty });
    }

    // A civ without a town yet (a loaded old save, a test world) founds its capital now
    if (!this.settlements.length) initTown(this, terrain);
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
      if (ent.civilization === this) {
        ent.civilization = null;
        ent.settlementId = null;
        ent.clanId = null;
        ent.homeId = null;
        ent.job = null;
        ent.task = null;
        ent.inventory = {};
      }
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
    this.traffic = new Map();   // tile key -> footsteps (desire paths)
    this.members = new Map();   // settlement id -> living citizens
    this.famTimer = 0;
    this.trafficTimer = 0;
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
          // The founders arrive with a starter kit of supplies and START to build: a hall site, huts and a field.
          // Everything after that is built by the people.
          initTown(civ, this.terrain);
          civ.expandTerritory(this.terrain);
          this.civilizations.push(civ);
          this.spawnCitizens(civ, INITIAL_CITIZENS);
          placed = true;
        }
      }
    }
  }

  // Makes sure the civ has at least its capital settlement (old saves, bare test worlds).
  ensureSettlements(civ) {
    if (settlementsOf(civ).length) return;
    // a civ loaded from an older save already owns finished buildings: adopt them into one settlement
    const owned = this.terrain.buildingsOfCiv(civ.id).filter(b => b.type !== 'ruins');
    if (owned.length) {
      const st = createSettlement(civ, civ.capitalX, civ.capitalY, { capital: true, stock: { wood: 20, fibre: 10, grain: Math.max(0, civ.food / 4) } });
      st.town.ready = true;
      for (const b of owned) {
        b.settlementId = st.id;
        if (BUILDING_TYPES[b.type].category === 'housing' && !b.residents) b.residents = [];
        if ((b.type === 'farm' || b.type === 'pen') && b.growth === undefined) b.growth = 1;
      }
      return;
    }
    initTown(civ, this.terrain);
  }

  // Raises the first generation. The founders pair off into families, each family founds a clan.
  spawnCitizens(civ, count) {
    this.ensureSettlements(civ);
    const fresh = [];
    for (let i = 0; i < count; i++) {
      const e = this.ecosystem.spawnCitizen(civ);
      if (e) fresh.push(e);
    }
    this.setupFounders(civ, fresh);
    return fresh.length;
  }

  setupFounders(civ, founders) {
    const st = settlementsOf(civ)[0] || null;
    for (const e of founders) {
      if (st) e.settlementId = st.id;
      e.homeX = st ? st.x : e.x;
      e.homeY = st ? st.y : e.y;
    }
    bondFounders(founders);
    const byId = this.ecosystem.byId;
    for (const e of founders) byId.set(e.id, e);
    const year = this.ecosystem.timeYears;
    for (const e of founders) {
      if (e.clanId) continue;
      if (e.mateId) {
        const mate = byId.get(e.mateId);
        const clan = createClan(civ, { leader: e.sex === 'F' ? mate || e : e, settlementId: st ? st.id : null, year });
        e.clanId = clan.id;
        if (mate && !mate.clanId) mate.clanId = clan.id;
      } else {
        ensureClan(civ, e, byId, founders, year);
      }
    }
    if (st) for (const c of civ.clans) if (!c.settlementId) c.settlementId = st.id;
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
    if (entity.civilization !== civ) {
      entity.settlementId = null;
      entity.clanId = null;
      entity.homeId = null;
      entity.job = null;
      entity.task = null;
    }
    entity.civilization = civ;
    if (civ) this.adopt(civ, entity);
    return civ;
  }

  // A citizen needs a settlement and a clan.
  adopt(civ, entity) {
    if (!entity.settlementId || !getSettlement(civ, entity.settlementId)) {
      const st = nearestSettlement(civ, entity.x, entity.y);
      entity.settlementId = st ? st.id : null;
    }
    if (!entity.clanId || !getClan(civ, entity.clanId)) {
      entity.clanId = null;
      ensureClan(civ, entity, this.ecosystem.byId, this.ecosystem.entities, this.ecosystem.timeYears);
    }
  }

  reassignUnaffiliated() {
    for (const ent of this.ecosystem.entities) {
      if (!ent.civilization) this.assignCitizen(ent);
    }
  }

  // One pass over all creatures: counts citizens and soldiers per civ, groups citizens by settlement.
  refreshCensus() {
    const counts = new Map();
    this.members.clear();
    for (const e of this.ecosystem.entities) {
      if (!e.alive || !e.civilization) continue;
      const civ = e.civilization;
      const c = counts.get(civ.id) || { citizens: 0, soldiers: 0 };
      c.citizens++;
      if (e.role === 'SOLDIER') c.soldiers++;
      counts.set(civ.id, c);
      if (e.isSapient) {
        let sid = e.settlementId;
        if (!civ.settlements || !civ.settlements.length) continue;
        if (!sid) {
          const st = nearestSettlement(civ, e.x, e.y);
          sid = e.settlementId = st ? st.id : null;
        }
        if (!sid) continue;
        const list = this.members.get(sid);
        if (list) list.push(e);
        else this.members.set(sid, [e]);
      }
    }
    for (const civ of this.civilizations) {
      const c = counts.get(civ.id) || { citizens: 0, soldiers: 0 };
      civ.citizens = c.citizens;
      civ.soldiers = c.soldiers;
      civ.population = Math.max(MIN_POPULATION, civ.citizens * POP_PER_CITIZEN);
    }
  }

  membersOf(st) {
    return this.members.get(st.id) || [];
  }

  // ---------- used by the creature AI ----------

  sapientOptions(entity, world, options) {
    return sapientOptions(entity, world, options);
  }

  // Foot traffic wears dirt roads on its own (desire paths).
  footstep(x, y) {
    const key = y * 16384 + x;
    const n = (this.traffic.get(key) || 0) + 1;
    if (n >= ROAD_TRAFFIC) {
      const tile = this.terrain.getTile(x, y);
      if (!tile.road && !tile.structure && this.terrain.isBuildable(x, y)) {
        this.terrain.setRoad(x, y, 'dirt');
      }
      this.traffic.set(key, 0);
      return;
    }
    this.traffic.set(key, n);
  }

  // A construction site was finished by its builders.
  onBuildingComplete(c, b) {
    const def = BUILDING_TYPES[b.type];
    this.famTimer = 99; // housing may have changed: reassign homes at the next family tick
    if (def.category !== 'housing' && b.type !== 'farm' && b.type !== 'pen' && b.type !== 'palisade' && b.type !== 'stone_wall') {
      this.ecosystem.notifications.unshift({
        text: `🏗️ ${c.st.name} finished building a ${def.name.toLowerCase()}.`,
        minor: true,
        time: Date.now()
      });
    }
  }

  eraHave(civ) {
    return {
      discovered: t => isDiscovered(civ, t),
      built: t => builtSomewhere(this.terrain, civ, t)
    };
  }

  // Eras need research points AND discovered materials, buildings and goods (techTree.ERA_REQUIREMENTS). Never goes backwards.
  advanceEra(civ) {
    const next = eraFor(civ, this.eraHave(civ));
    const cur = ERAS.findIndex(e => e.id === civ.era.id);
    const idx = ERAS.findIndex(e => e.id === next.id);
    if (idx > cur) {
      civ.era = next;
      this.ecosystem.notifications.unshift({
        text: `🏛️ Epoch Advance: "${civ.name}" has entered the ${civ.era.name}!`,
        time: Date.now()
      });
      return true;
    }
    return false;
  }

  // Once per simulated second per civilization: the whole economy.
  tickCiv(civ, simDt) {
    civ.clock += simDt;
    civ.tickAcc += simDt;
    if (civ.tickAcc < 1) return;
    const dt = civ.tickAcc;
    civ.tickAcc = 0;
    const { terrain, ecosystem } = this;
    this.ensureSettlements(civ);

    const c = { world: { terrain, ecosystem, pathfinder: ecosystem.pathfinder, grid: ecosystem.grid }, terrain, ecosystem, soc: this, civ, tier: eraTier(civ) };
    for (const st of settlementsOf(civ)) {
      c.st = st;
      tickSettlement(c, st, this.membersOf(st), dt);
    }
    tickTown(civ, terrain, dt);

    // exploration bookkeeping and discoveries
    syncDiscoveries(civ, text => ecosystem.notifications.unshift({ text, time: Date.now() }));
    for (const st of settlementsOf(civ)) revealAround(civ, terrain, st.x, st.y, 14);

    // food: the aggregate of the stockpiles; prosperity follows it
    syncFood(civ, st => foodCapOf(terrain, st));
    civ.prosperity = prosperityOf(civ);

    // the next era
    this.advanceEra(civ);

    // clans: members, leaders, splitting
    civ.clanTimer = (civ.clanTimer || 0) - dt;
    if (civ.clanTimer <= 0) {
      civ.clanTimer = 3;
      refreshClans(civ, ecosystem.entities);
      this.splitClans(civ);
    }
  }

  // A clan that outgrew CLAN_SPLIT_SIZE sends a splinter group to found a new hamlet.
  splitClans(civ) {
    if (civ.settlements.length >= MAX_SETTLEMENTS || !civ.isAlive) return false;
    // do not fragment a small people into ever smaller hamlets: about ten citizens per settlement are needed
    if (civ.citizens < 12 * civ.settlements.length) return false;
    for (const clan of civ.clans) {
      if (clan.memberIds.length < CLAN_SPLIT_SIZE || (clan.splitCd || 0) > civ.clock) continue;
      const parent = getSettlement(civ, clan.settlementId) || nearestSettlement(civ, this.terrain.home.x, this.terrain.home.y);
      if (!parent || !parent.town.ready) { clan.splitCd = civ.clock + 30; continue; }
      const group = pickSplinter(clan, this.ecosystem.entities);
      if (!group.length) { clan.splitCd = civ.clock + 30; continue; }
      const s = group[0].stats;
      const comfortable = t => t >= s.idealTemp - s.coldTolerance + 0.02 && t <= s.idealTemp + s.heatTolerance - 0.02;
      const site = findHamletSite(this.terrain, civ, parent, this.civilizations, (x, y) => isExplored(civ, this.terrain, x, y), comfortable);
      if (!site) { clan.splitCd = civ.clock + 40; continue; }
      this.sendSettlers(civ, clan, group, parent, site);
      clan.splitCd = civ.clock + 80;
      return true;
    }
    return false;
  }

  sendSettlers(civ, clan, group, parent, site) {
    const { terrain, ecosystem } = this;
    const year = ecosystem.timeYears;
    const hamlet = foundHamlet(civ, terrain, site, { year });
    const adults = group.filter(e => e.isAdult);
    const leader = adults.reduce((a, b) => (b.age > a.age ? b : a), adults[0]);
    const newClan = createClan(civ, { leader, settlementId: hamlet.id, parentClanId: clan.id, year });
    // each adult carries a share of the supplies the clan takes along
    const kit = { wood: 4, fibre: 3, stone: 1, grain: 3 };
    for (const e of group) {
      e.clanId = newClan.id;
      e.settlementId = hamlet.id;
      e.homeId = null;
      e.job = null;
      e.path = [];
      e.task = { kind: 'migrate', sid: hamlet.id, x: site.x, y: site.y, stuck: 0 };
      e.activity = `Migrating to ${hamlet.name}`;
      if (e.isAdult) for (const [k, n] of Object.entries(kit)) add(e.inventory, k, take(parent.stock, k, n));
    }
    this.connectByRoad(civ, parent, hamlet);
    ecosystem.notifications.unshift({
      text: `🏕️ ${clan.name} has grown large: ${group.length} of its people leave ${parent.name} to found the hamlet of ${hamlet.name}.`,
      time: Date.now()
    });
    return hamlet;
  }

  // Plans a road between two settlements; builders of each end pave their half.
  connectByRoad(civ, a, b) {
    const path = this.ecosystem.pathfinder.findPath(a.x, a.y, b.x, b.y, 3000, true);
    const kind = roadKindFor(eraTier(civ));
    const half = Math.floor(path.length / 2);
    path.forEach((p, i) => queueRoad(this.terrain, i < half ? a : b, Math.floor(p.x), Math.floor(p.y), kind));
    return path.length;
  }

  // Society-level upkeep that is not per civilization.
  tickFamilies() {
    const { ecosystem, terrain } = this;
    const byId = ecosystem.byId;
    clearDeadMates(ecosystem.entities, byId);
    for (const civ of this.civilizations) {
      if (!civ.isAlive) continue;
      for (const st of settlementsOf(civ)) {
        const members = this.membersOf(st);
        assignHomes(terrain, civ, st, members, byId);
        adoptOrphans(members, byId);
        feedChildren(terrain, st, members);
        householdConceptions(ecosystem, members, byId);
      }
    }
  }

  update(dt, speedMultiplier) {
    this.refreshCensus();
    for (const civ of this.civilizations) {
      civ.update(dt, speedMultiplier, this.terrain, this.civilizations, this.ecosystem);
    }

    const simDt = dt * Math.min(speedMultiplier, 100);
    this.famTimer += simDt;
    if (this.famTimer >= 3) {
      this.famTimer = 0;
      this.tickFamilies();
    }
    this.trafficTimer += simDt;
    if (this.trafficTimer >= 20) {
      this.trafficTimer = 0;
      for (const [k, v] of this.traffic) {
        const n = Math.floor(v * 0.8);
        if (n < 1) this.traffic.delete(k);
        else this.traffic.set(k, n);
      }
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
      // nomads (people without a nation, or the last survivors of a dying one) found the new civilization; a thriving
      // nation's citizens are not taken from it
      const nearbyHuman = this.ecosystem.entities.find(e =>
        e.alive && e.isSapient && Math.hypot(e.x - x, e.y - y) < 10 && (!e.civilization || e.civilization.citizens <= 3)
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
      newCiv.eraFloor = ERAS.findIndex(e => e.id === newCiv.era.id); // the ruins' lore: the knowledge is not lost
      this.civilizations.push(newCiv);
      nearbyHuman.civilization = newCiv;

      tile.civId = newCiv.id;
      initTown(newCiv, this.terrain); // a hall site marks the spot; the settlers build it
      this.assignCitizen(nearbyHuman);

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
