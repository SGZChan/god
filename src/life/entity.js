import { layaEngine } from '../ai/layaEngine.js';
import { random } from '../simulation/random.js';
import { Genome, derive, traitDistance } from './genome.js';
import { MATE_THRESHOLD } from './species.js';
import { makeName } from './names.js';
import { livestockAI } from '../civilization/livestock.js';
import { makeCorpse, CORPSE_LIFE } from '../civilization/deathcare.js';

const YEARS_PER_SECOND = 0.25; // one simulated year is 4 simulated seconds

// Creatures are individuals with a genome. What they look like, how fast they run, how long they live,
// what they eat and who they can mate with all come from their genes. Behaviour is chosen from needs
// (utility AI): flee, hunt, forage, mate, stay with the mother, stay with the herd, wander.
export class Entity {
  constructor(config = {}) {
    this.id = config.id || 'ent_' + random().toString(36).substring(2, 9);
    this.species = config.species;
    this.x = config.x !== undefined ? config.x : 0;
    this.y = config.y !== undefined ? config.y : 0;
    this.vx = 0;
    this.vy = 0;

    // Genetics
    this.genome = config.genome || Genome.jittered(Genome.fromPhenotype(this.species.centroid));
    this.traits = this.genome.phenotype();
    this.stats = derive(this.traits);
    this.sex = config.sex || (random() < 0.5 ? 'F' : 'M');
    this.parents = config.parents || [];     // ids of mother and father
    this.motherId = config.motherId || null;
    this.generation = config.generation || 0;
    this.lifespanJitter = 0.9 + random() * 0.2;
    this.pregnancy = null;                   // { embryos: [Genome], fatherId, timeLeft }
    this.mateCooldown = 0;
    this.dispersed = false;
    this.homeX = this.x;
    this.homeY = this.y;

    this.isSpecialIndividual = config.isSpecialIndividual || false;
    const sapient = Boolean(this.species && this.species.sapient);
    this.name = config.name || (sapient && !this.isSpecialIndividual ? makeName() : (this.species ? this.species.name : 'Unknown'));
    this.epithet = config.epithet || (this.isSpecialIndividual ? 'The Chosen One' : '');
    this.gender = config.gender || (this.sex === 'F' ? 'Female' : 'Male');

    this.aiSystem = config.aiSystem || (this.isSpecialIndividual ? 'LAYA' : 'MINECRAFT');

    // Used by the champion avatar preview in the workshop
    this.appearance = config.appearance || {
      skinColor: '#f3c192',
      hairColor: '#3a2010',
      hairStyle: 'long',
      eyeColor: '#2b6cb0',
      bodyType: 'athletic',
      attire: 'robes',
      auraColor: '#ffd700'
    };

    // Personality (Big-Five + Piety)
    this.personality = config.personality || {
      openness: 0.5 + (random() - 0.5) * 0.4,
      conscientiousness: 0.5 + (random() - 0.5) * 0.4,
      extraversion: 0.5 + (random() - 0.5) * 0.4,
      agreeableness: 0.5 + (random() - 0.5) * 0.4,
      neuroticism: 0.5 + (random() - 0.5) * 0.4,
      piety: random() // Full spectrum: from 0.0 (hardcore atheist) to 1.0 (devout fanatic)
    };

    // Belief Status: Devout Believer vs Skeptic vs Atheist/Heretic
    this.belief = this.determineBelief();

    // Social & Civic Role (Ruler, Guard, Soldier, Citizen, Criminal, Heretic)
    this.role = config.role || this.determineRole();
    this.crimeRecord = 0;

    // Talents & Proficiencies
    this.proficiencies = config.proficiencies || {
      architecture: 40 + Math.floor(random() * 40),
      warfare: 30 + Math.floor(random() * 50),
      statesmanship: 30 + Math.floor(random() * 40),
      farming: 40 + Math.floor(random() * 40),
      science: 30 + Math.floor(random() * 50),
      mysticism: Math.floor(this.personality.piety * 90)
    };

    // Vitals
    this.maxHealth = (60 + this.stats.sizeScale * 40) * (this.isSpecialIndividual ? 3 : 1); // champions are divinely hardy
    this.health = this.maxHealth;
    this.energy = 100;
    this.hunger = config.hunger !== undefined ? config.hunger : random() * 25;
    // Founders start as adults; babies pass age: 0
    this.age = config.age !== undefined ? config.age : this.stats.maturityYears * (1 + random() * 1.2);
    this.alive = true;
    this.breath = 100; // Swimming breath meter (depletes in ocean)
    this.isDrowning = false;
    this.thermalStress = 0;
    this.kills = 0;

    // Navigation & Behavior
    this.state = 'IDLE';
    this.facing = 1; // 1 right, -1 left (for drawing)
    this.target = null;
    this.path = [];
    this.actionCooldown = random() * 2;
    this.lastLayaDecision = null;
    this.civilization = null;

    // Society (see civilization/jobs.js, clans.js, families.js). All plain JSON so it saves.
    this.clanId = config.clanId || null;
    this.settlementId = config.settlementId || null;
    this.mateId = config.mateId || null;   // pair bond (long-term mate)
    this.guardianId = config.guardianId || null; // the adult who took an orphan in
    this.homeId = config.homeId || null;   // building id of the house the person lives in
    this.job = config.job || null;         // farmer, builder, miner...
    this.task = null;                      // multi-step job state
    this.inventory = {};                   // carried goods { item: amount }
    this.activity = '';                    // what the person is doing, for the inspector
  }

  // ---------- who am I ----------

  get isSapient() {
    return Boolean(this.species && this.species.sapient) || this.isSpecialIndividual;
  }

  get isAdult() {
    return this.age >= this.stats.maturityYears;
  }

  // 'infant', 'juvenile', 'adult' or 'elder'
  get stage() {
    if (this.age < this.stats.maturityYears * 0.3) return 'infant';
    if (this.age < this.stats.maturityYears) return 'juvenile';
    if (this.age > this.maxAge * 0.8) return 'elder';
    return 'adult';
  }

  // Body size on screen: babies are small and grow up
  get visualScale() {
    return this.stats.sizeScale * (this.sizeMod || 1) * (0.5 + 0.5 * Math.min(1, this.age / this.stats.maturityYears));
  }

  get maxAge() {
    return this.stats.lifespanYears * this.lifespanJitter;
  }

  // Gives this creature a new genome (used when generations pass offscreen).
  setGenome(genome) {
    this.genome = genome;
    this.traits = genome.phenotype();
    this.stats = derive(this.traits);
    this.maxHealth = (60 + this.stats.sizeScale * 40) * (this.isMonster ? 4 : 1) * (this.sizeMod && !this.isMonster ? this.sizeMod : 1);
    this.health = Math.min(this.health, this.maxHealth);
  }

  isKinOf(other) {
    if (this.id === other.id) return true;
    if (this.parents.includes(other.id) || other.parents.includes(this.id)) return true;
    return this.parents.some(p => other.parents.includes(p));
  }

  determineBelief() {
    // Wild animals do not have mortal religions or theocratic doctrines
    if (!this.isSapient) {
      return { status: 'WILDLIFE', label: 'Wild Instinct', symbol: '🐾', desc: 'A wild creature guided by nature and primal survival instincts.' };
    }
    if (this.personality.piety > 0.65) {
      return { status: 'DEVOUT_BELIEVER', label: 'Devout Believer', symbol: '🙏', desc: 'Prays to the gods of their faith and keeps the rites.' };
    } else if (this.personality.piety > 0.35) {
      return { status: 'SECULAR_SKEPTIC', label: 'Secular Skeptic', symbol: '⚖️', desc: 'Keeps the rites, but trusts mortal crafts and science more.' };
    } else {
      return { status: 'ATHEIST_HERETIC', label: 'Atheist / Heretic', symbol: '⚡', desc: 'Doubts every god; proclaims mortals govern their own fate.' };
    }
  }

  determineRole() {
    // Wild animals have ecological roles
    if (!this.isSapient) {
      const type = this.species ? this.species.type : 'herbivore';
      return type === 'predator' ? 'PREDATOR' : type === 'omnivore' ? 'FORAGER' : 'HERBIVORE';
    }
    if (random() < 0.18) return 'SOLDIER';
    if (random() < 0.12) return 'GUARD';
    if (this.personality.agreeableness < 0.25 && random() < 0.4) return 'CRIMINAL';
    if (this.belief.status === 'ATHEIST_HERETIC' && random() < 0.4) return 'HERETIC';
    return 'CITIZEN';
  }

  // ---------- life ----------

  update(dt, speedMultiplier, worldContext) {
    if (!this.alive) return;
    const sim = dt * Math.max(1, speedMultiplier); // simulated seconds

    // A building that went up (or completed) where this creature stands must not swallow it
    if (worldContext && worldContext.terrain) this.unstickFromBuildings(worldContext.terrain);

    // Aging: a year is 4 simulated seconds
    this.age += sim * YEARS_PER_SECOND;
    if (this.age > this.maxAge && !this.isSpecialIndividual) {
      this.die('Old Age');
      if (worldContext && worldContext.ecosystem && this.isSapient) {
        worldContext.ecosystem.notifications.unshift({
          text: `🕊️ Inhabitant "${this.name}" passed away peacefully of Old Age (lived ${Math.floor(this.age)} years).`,
          minor: true,
          time: Date.now()
        });
      }
      return;
    }

    // Coming of age: many young leave to settle new ground, which spreads the species into other climates
    if (!this.dispersed && this.age >= this.stats.maturityYears) {
      this.dispersed = true;
      if (!this.isSapient && random() < 0.6) {
        // Settle only where the climate is bearable (migrants do not walk into killing cold or heat)
        for (let attempt = 0; attempt < 8; attempt++) {
          const angle = random() * Math.PI * 2;
          const dist = 20 + random() * 40;
          const hx = this.x + Math.cos(angle) * dist;
          const hy = this.y + Math.sin(angle) * dist;
          const tile = worldContext.terrain.getTile(Math.floor(hx), Math.floor(hy));
          const t = tile.temperature;
          const comfortable = t >= this.stats.idealTemp - this.stats.coldTolerance && t <= this.stats.idealTemp + this.stats.heatTolerance;
          if (comfortable && !tile.biome.isWater) {
            this.homeX = hx;
            this.homeY = hy;
            break;
          }
        }
      }
    }

    // Pregnancy and cooldowns
    if (this.mateCooldown > 0) this.mateCooldown -= sim;
    if (this.pregnancy) {
      this.pregnancy.timeLeft -= sim;
      if (this.pregnancy.timeLeft <= 0) worldContext.ecosystem.giveBirth(this);
    }

    // Hunger: bigger, faster, hotter-burning bodies need more food; nursing infants barely eat; pregnancy costs extra
    const nursing = this.age < this.stats.maturityYears * 0.3 ? 0.3 : 1;
    this.hunger = Math.min(100, this.hunger + sim * this.stats.hungerRate * nursing * (this.pregnancy ? 1.4 : 1));
    if (this.hunger >= 100) {
      this.health -= sim * 2.5;
      if (this.health <= 0) {
        this.die('Starvation');
        return;
      }
    }

    // --- TERRAIN: temperature, water & drowning ---
    const curTile = worldContext.terrain.getTile(Math.floor(this.x), Math.floor(this.y));

    // Each creature is adapted to a temperature; being outside its tolerance hurts. This is the selection
    // pressure that makes populations adapt to hot or cold lands over generations.
    const ideal = this.stats.idealTemp;
    const t = curTile.temperature;
    let excess = t < ideal ? (ideal - t) - this.stats.coldTolerance : (t - ideal) - this.stats.heatTolerance;
    // A roof over one's head takes the edge off the weather: homeless people feel the full cold
    if (excess > 0 && this.homeId) excess = Math.max(0, excess - 0.06);
    this.thermalStress = Math.max(0, excess);
    if (excess > 0) {
      this.health -= excess * 12 * sim;
      if (this.health <= 0) {
        this.die(t < ideal ? 'Froze to Death' : 'Died of Heat');
        return;
      }
    } else if (this.hunger < 60 && this.health < this.maxHealth) {
      this.health = Math.min(this.maxHealth, this.health + sim * 1.2);
    }

    if (curTile.biome.isWater) {
      // Deplete breath in deep water
      const drainRate = curTile.biome.id === 'DEEP_OCEAN' ? 22 : 12;
      this.breath = Math.max(0, this.breath - sim * drainRate);

      if (this.breath <= 0) {
        this.isDrowning = true;
        this.health -= sim * 28;
        if (this.health <= 0) {
          this.die('Drowned in Ocean');
          return;
        }
      }

      // Desperately seek nearest land tile!
      if (this.path.length === 0 || random() < 0.2) {
        this.seekNearestLand(worldContext);
      }
    } else {
      // Recover breath on land
      this.breath = Math.min(100, this.breath + sim * 35);
      this.isDrowning = false;
    }

    // AI Decision Cycle
    this.actionCooldown -= sim;
    if (this.actionCooldown <= 0) {
      // people rest at night (dayCycle.js), so by day they get through their work more briskly than animals do
      this.actionCooldown = this.aiSystem === 'LAYA' ? 2.2 : (this.isSapient && this.civilization ? 1.0 : 1.5);
      this.decideAction(worldContext);
    }

    // Move along path
    this.moveAlongPath(sim, speedMultiplier, worldContext.terrain);
  }

  seekNearestLand(worldContext) {
    const terrain = worldContext.terrain;
    const cx = Math.floor(this.x);
    const cy = Math.floor(this.y);

    for (let r = 1; r <= 8; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const tile = terrain.getTile(cx + dx, cy + dy);
          if (!tile.biome.isWater) {
            this.requestPath(tile.x, tile.y, worldContext.pathfinder, 300, false);
            return;
          }
        }
      }
    }
  }

  decideAction(worldContext) {
    if (this.aiSystem === 'LAYA') {
      this.executeLayaAI(worldContext);
    } else {
      this.executeNeedsAI(worldContext);
    }
  }

  // ---------- needs-based behaviour (utility AI) ----------

  creaturesNear(world, radius) {
    if (world.grid) return world.grid.within(this.x, this.y, radius);
    return world.entities.filter(e => Math.hypot(e.x - this.x, e.y - this.y) <= radius);
  }

  // Can this creature kill `prey`? Predators hunt other species of their own size or smaller, and
  // only turn on sapient beings when they are starving.
  canHunt(prey) {
    if (prey === this || !prey.alive || prey.species === this.species) return false;
    if (this.traits.carnivory < 0.3) return false;
    // People inside a civilization are protected by their settlements; only a starving predator will
    // attack a lone sapient who belongs to no nation
    if (prey.isSapient && !this.isMonster && (prey.civilization || this.hunger < 92)) return false;
    return prey.stats.sizeScale <= this.stats.sizeScale * 1.5;
  }

  isThreatTo(other) {
    return this.alive && this.species !== other.species && this.canHunt(other) && this.traits.aggression > 0.4;
  }

  readyToMate(nearby) {
    if (!this.isAdult || this.stage === 'elder' || this.mateCooldown > 0 || this.hunger > 68 || this.health < 40) return false;
    if (this.pregnancy) return false;
    // Crowding: too many of my own kind close by suppresses breeding (food and space are limited)
    // (other species compete with me less than my own kind does, which lets several species coexist)
    let crowd = 0;
    const hunter = this.traits.carnivory >= 0.6;
    for (const e of nearby) {
      if (!e.alive) continue;
      crowd += e.species === this.species ? 1 : (hunter ? 0 : 0.4);
    }
    // Hunters are territorial: they thin themselves out long before the prey run out
    return crowd < (this.traits.carnivory >= 0.6 ? 9 : 14);
  }

  canMateWith(other) {
    // Sapients keep long-term pair bonds and court within their own civilization
    if (this.isSapient) {
      if (this.mateId && other.id !== this.mateId) return false;
      if (other.mateId && other.mateId !== this.id) return false;
      if (this.civilization !== other.civilization) return false;
    }
    return other.alive && other !== this && other.sex !== this.sex && other.isAdult && other.stage !== 'elder'
      && other.mateCooldown <= 0 && !other.pregnancy && other.hunger < 75 && !this.isKinOf(other)
      && traitDistance(this.traits, other.traits) <= MATE_THRESHOLD;
  }

  executeNeedsAI(world) {
    const terrain = world.terrain;
    const range = this.stats.perceptionRange;
    const nearby = this.creaturesNear(world, range);
    const society = world.ecosystem.society;
    const civ = this.civilization;
    const citizen = Boolean(this.isSapient && civ && civ.isAlive && society && civ.settlements && civ.settlements.length > 0);

    // Sapient beings still obey their civic duties first (war, law enforcement)
    if (this.isSapient && this.executeRoleAI(world)) return;
    // Livestock live in their pen (civilization/livestock.js)
    if (!this.isSapient && this.penId && livestockAI(this, world, random)) return;

    const options = [];

    // FLEE: run from anything that hunts creatures like me (sapient adults only when hurt)
    if (!this.isSapient || this.health < 40 || !this.isAdult) {
      let threat = null;
      let threatDistance = Infinity;
      for (const e of nearby) {
        if (e.isThreatTo(this)) {
          const d = Math.hypot(e.x - this.x, e.y - this.y);
          if (d < threatDistance) {
            threat = e;
            threatDistance = d;
          }
        }
      }
      if (threat && threatDistance < range * 0.8 && this.traits.aggression < 0.6) {
        options.push({ score: 1.0 - threatDistance / (range * 2), run: () => {
          this.state = 'FLEE';
          this.requestPath(this.x + (this.x - threat.x) * 2, this.y + (this.y - threat.y) * 2, world.pathfinder);
        } });
      }
    }

    // HUNT (and scavenge): meat eaters go after prey or eat fresh carcasses
    if (this.traits.carnivory > 0.3 && this.hunger > (citizen ? 85 : 35)) {
      let prey = null;
      let preyDistance = Infinity;
      for (const e of nearby) {
        if (!this.canHunt(e)) continue;
        const d = Math.hypot(e.x - this.x, e.y - this.y);
        if (d < preyDistance) {
          prey = e;
          preyDistance = d;
        }
      }
      // Nothing in sight: a hungry hunter follows the herds it can sense from much farther away
      let stalk = null;
      if (!prey && this.hunger > 45) {
        let stalkDistance = Infinity;
        for (const e of this.creaturesNear(world, range * 3.5)) {
          if (!this.canHunt(e)) continue;
          const d = Math.hypot(e.x - this.x, e.y - this.y);
          if (d < stalkDistance) {
            stalk = e;
            stalkDistance = d;
          }
        }
      }
      const carcass = nearby.find(e => !e.alive && e.decayTimer > 0 && e.species !== this.species && Math.hypot(e.x - this.x, e.y - this.y) < 2.5);
      if (carcass) {
        options.push({ score: this.hunger / 100 + 0.2, run: () => {
          this.state = 'SCAVENGE';
          this.hunger = Math.max(0, this.hunger - 35);
          carcass.decayTimer = 0;
        } });
      } else if (stalk) {
        options.push({ score: (this.hunger / 100) * 0.7, run: () => {
          this.state = 'STALK';
          this.requestPath(stalk.x, stalk.y, world.pathfinder);
        } });
      } else if (prey) {
        options.push({ score: (this.hunger / 100) * (0.6 + this.traits.carnivory * 0.5), run: () => {
          this.state = 'HUNT';
          this.target = prey;
          this.requestPath(prey.x, prey.y, world.pathfinder);
          if (preyDistance < 1.4) {
            prey.health -= 22 * this.stats.sizeScale * (0.5 + this.traits.aggression);
            if (prey.health <= 0) {
              prey.die(`Hunted by ${this.species.name}`);
              this.hunger = Math.max(0, this.hunger - 60);
              this.kills++;
            }
          }
        } });
      }
    }

    // SAPIENT SOCIETY: eating from the settlement's stockpile, working at a job, migrating (civilization/jobs.js)
    if (citizen) society.sapientOptions(this, world, options);

    // FORAGE: plant eaters graze where the flora is thick (citizens live off their settlement and graze only when starving)
    if (this.traits.herbivory > 0.25 && this.hunger > (citizen ? 80 : 30)) {
      const here = terrain.getTile(Math.floor(this.x), Math.floor(this.y));
      if (here.flora > 15 && !here.biome.isWater) {
        options.push({ score: (this.hunger / 100) * 0.95, run: () => {
          this.state = 'FORAGE';
          here.flora = Math.max(0, here.flora - 25);
          this.hunger = Math.max(0, this.hunger - 45 * (0.4 + 0.6 * this.traits.herbivory));
          this.health = Math.min(this.maxHealth, this.health + 6);
        } });
      } else {
        // look for greener ground
        let best = null;
        let bestFlora = 20;
        for (let i = 0; i < 10; i++) {
          const a = random() * Math.PI * 2;
          const d = 2 + random() * range * 0.8;
          const tile = terrain.getTile(Math.floor(this.x + Math.cos(a) * d), Math.floor(this.y + Math.sin(a) * d));
          if (!tile.biome.isWater && tile.flora > bestFlora) {
            best = tile;
            bestFlora = tile.flora;
          }
        }
        if (best) {
          options.push({ score: (this.hunger / 100) * 0.8, run: () => {
            this.state = 'GRAZE';
            this.requestPath(best.x + 0.5, best.y + 0.5, world.pathfinder);
          } });
        }
      }
    }

    // MATE: find a compatible partner and go to them
    if (this.readyToMate(nearby)) {
      let mate = null;
      let mateDistance = Infinity;
      for (const e of nearby) {
        if (!this.canMateWith(e)) continue;
        const d = Math.hypot(e.x - this.x, e.y - this.y);
        if (d < mateDistance) {
          mate = e;
          mateDistance = d;
        }
      }
      if (mate) {
        options.push({ score: 0.55 + (1 - this.hunger / 100) * 0.2, run: () => {
          this.state = 'COURT';
          if (mateDistance < 1.7) {
            const mother = this.sex === 'F' ? this : mate;
            const father = this.sex === 'F' ? mate : this;
            world.ecosystem.tryConceive(father, mother);
          } else {
            this.requestPath(mate.x, mate.y, world.pathfinder);
          }
        } });
      }
    }

    // FOLLOW MOTHER: the young stay close to their mother
    if (this.age < this.stats.maturityYears * 0.8 && this.motherId) {
      const mother = nearby.find(e => e.id === this.motherId && e.alive);
      if (mother && Math.hypot(mother.x - this.x, mother.y - this.y) > 3) {
        options.push({ score: 0.85, run: () => {
          this.state = 'FOLLOW';
          this.requestPath(mother.x + (random() - 0.5) * 2, mother.y + (random() - 0.5) * 2, world.pathfinder);
        } });
      }
    }

    // HERD: social species do not like being alone
    if (this.traits.sociality > 0.35 && !this.isSapient) {
      const kin = nearby.filter(e => e.alive && e !== this && e.species === this.species);
      if (kin.length < 2) {
        const wide = this.creaturesNear(world, range * 2).filter(e => e.alive && e !== this && e.species === this.species);
        if (wide.length > 0) {
          const target = wide[Math.floor(random() * wide.length)];
          options.push({ score: 0.2 + this.traits.sociality * 0.3, run: () => {
            this.state = 'HERD';
            this.requestPath(target.x, target.y, world.pathfinder);
          } });
        }
      }
    }

    // WANDER inside a home range
    options.push({ score: 0.1 + random() * 0.05, run: () => {
      this.state = 'WANDER';
      if (this.path.length > 0 && random() > 0.25) return;
      const leash = 12 + this.traits.perception * 18;
      let tx;
      let ty;
      if (Math.hypot(this.x - this.homeX, this.y - this.homeY) > leash) {
        tx = this.homeX + (random() - 0.5) * 6;
        ty = this.homeY + (random() - 0.5) * 6;
      } else {
        const angle = random() * Math.PI * 2;
        const dist = 3 + random() * 5;
        tx = this.x + Math.cos(angle) * dist;
        ty = this.y + Math.sin(angle) * dist;
      }
      if (!terrain.getTile(Math.floor(tx), Math.floor(ty)).biome.isWater) this.requestPath(tx, ty, world.pathfinder);
    } });

    options.sort((a, b) => b.score - a.score);
    for (const option of options) {
      if (option.run() !== false) break; // an option that cannot be carried out returns false: try the next best
    }
  }

  // Duties of sapient creatures: soldiers fight, guards enforce the law. Returns true if handled.
  executeRoleAI(worldContext) {
    // 1. WARFARE (adult soldiers only). Battles are fought between soldiers near the front; with no enemy soldier
    //    in reach, soldiers raid the nearest enemy settlement: they loot its stores and burn a building. Civilians are
    //    rarely killed (only adults caught in a raid) and children never: wars bleed armies, not whole peoples.
    if (this.role === 'SOLDIER' && this.isAdult && this.stage !== 'elder' && this.civilization && this.civilization.warTarget) {
      const foe = this.civilization.warTarget;
      const front = 70;
      // Champions are sacred to every side
      const enemy = this.findNearestEntity(worldContext.entities, e =>
        e.alive && !e.isSpecialIndividual && e.civilization === foe && e.role === 'SOLDIER' && e.isAdult
        && Math.hypot(e.x - this.x, e.y - this.y) < front
      );
      if (enemy) {
        this.state = 'WAR_MARCH';
        this.target = enemy;
        this.activity = `Fighting the soldiers of ${foe.name}`;
        this.requestPath(enemy.x, enemy.y, worldContext.pathfinder);
        if (Math.hypot(this.x - enemy.x, this.y - enemy.y) < 1.4) {
          enemy.health -= 22 + this.proficiencies.warfare / 5;
          if (enemy.health <= 0) {
            enemy.die(`Killed in War by ${this.civilization.name} Soldier`);
            this.kills++;
          }
        }
        return true;
      }
      // raid the nearest enemy settlement within reach
      let target = null;
      let best = front;
      for (const st of foe.settlements || []) {
        const d = Math.hypot(st.x - this.x, st.y - this.y);
        if (d < best) { best = d; target = st; }
      }
      if (target) {
        this.state = 'RAID';
        this.activity = `Raiding ${target.name}`;
        if (best > 3) {
          if (this.path.length === 0 || random() < 0.2) this.requestPath(target.x + 0.5, target.y + 0.5, worldContext.pathfinder);
          return true;
        }
        // loot food and goods for home, and set fire to a building
        const loot = {};
        for (const k of ['grain', 'meat', 'fish', 'berries', 'tools', 'bronze', 'iron_bar']) {
          const n = Math.min(2, target.stock[k] || 0);
          if (n > 0) { target.stock[k] -= n; loot[k] = n; }
        }
        for (const [k, n] of Object.entries(loot)) this.inventory[k] = (this.inventory[k] || 0) + n;
        const terrain = worldContext.terrain;
        const victims = terrain.buildingsInRect(target.x - 8, target.y - 8, target.x + 8, target.y + 8).filter(b => b.civId === foe.id && b.progress >= 1);
        if (victims.length && random() < 0.35) {
          const b = victims[Math.floor(random() * victims.length)];
          terrain.damageBuilding(b.id, 30);
          terrain.spawnParticles(b.x + b.w / 2, b.y + b.h / 2, 12, '#f97316', 1.2);
        }
        // an adult who stands in the way may be struck down
        const defender = this.findNearestEntity(worldContext.entities, e => e.alive && e.civilization === foe && e.isAdult && !e.isSpecialIndividual && Math.hypot(e.x - this.x, e.y - this.y) < 2);
        if (defender && random() < 0.12) {
          defender.health -= 30;
          if (defender.health <= 0) { defender.die(`Killed in a raid by ${this.civilization.name}`); foe.grievance[this.civilization.id] = Math.min(100, foe.grievance[this.civilization.id] + 6); }
        }
        // the raided people remember (civilization/statecraft.js: grievances feed vengeance)
        foe.grievance = foe.grievance || {};
        foe.grievance[this.civilization.id] = Math.min(100, (foe.grievance[this.civilization.id] || 0) + 1.5);
        // and then home with the spoils
        this.civilization.warLoot = (this.civilization.warLoot || 0) + Object.values(loot).reduce((a, b) => a + b, 0);
        return false;
      }
    }

    // 2. LAW ENFORCEMENT & CRIME: Guards hunt criminals / Heretics
    if (this.role === 'GUARD') {
      const criminal = this.findNearestEntity(worldContext.entities, e =>
        e.alive && (e.role === 'CRIMINAL' || (e.belief.status === 'ATHEIST_HERETIC' && this.personality.piety > 0.8
          && this.civilization && this.civilization.government.id === 'THEOCRACY')) && Math.hypot(this.x - e.x, this.y - e.y) < 8
      );
      if (criminal) {
        this.state = 'ENFORCE_LAW';
        this.requestPath(criminal.x, criminal.y, worldContext.pathfinder);
        if (Math.hypot(this.x - criminal.x, this.y - criminal.y) < 1.3) {
          // criminals are jailed and set to hard labour, not killed; a heretic under a theocracy usually recants, and
          // only the stubborn few are executed
          if (criminal.role === 'CRIMINAL') {
            criminal.role = 'CITIZEN';
            criminal.crimeRecord = (criminal.crimeRecord || 0) + 1;
            criminal.actionCooldown = 12;
            criminal.path = [];
            criminal.activity = 'Serving a sentence';
          } else if (random() < 0.75) {
            criminal.personality.piety = Math.min(1, criminal.personality.piety + 0.35);
            criminal.belief = criminal.determineBelief();
            if (criminal.role === 'HERETIC') criminal.role = 'CITIZEN';
            criminal.activity = 'Recanted before the guards';
          } else {
            criminal.die('Executed by City Guard for Heresy');
          }
        }
        return true;
      }
    }
    return false;
  }

  // --- LAYA AI (champions): carries out the Action Card the Laya pipeline picked (src/ai/layaEngine.js) ---
  executeLayaAI(worldContext) {
    const decision = layaEngine.evaluate(this, worldContext);
    this.lastLayaDecision = decision;

    const terrain = worldContext.terrain;
    const tile = terrain.getTile(Math.floor(this.x), Math.floor(this.y));
    const state = this.laya || null;
    const stats = state ? state.stats : {};
    const civ = this.civilization;
    const nearbyPeople = (radius) => (worldContext.grid ? worldContext.grid.within(this.x, this.y, radius) : worldContext.entities)
      .filter(e => e.alive && e !== this && e.isSapient && (!civ || e.civilization === civ) && Math.hypot(e.x - this.x, e.y - this.y) <= radius);
    if (state && decision.title) {
      state.recent.unshift(decision.title);
      if (state.recent.length > 6) state.recent.length = 6;
      stats.acts = (stats.acts || 0) + 1;
    }
    // Walk towards the place the card is about
    const card = decision.card;
    if (card && Math.hypot(card.x - this.x, card.y - this.y) > 2) this.requestPath(card.x, card.y, worldContext.pathfinder);

    // Handle Atheist rebellion vs Devout building
    if (this.belief.status === 'ATHEIST_HERETIC' && random() < 0.3) {
      if (tile && tile.structure && (tile.structure.type === 'temple' || tile.structure.type === 'shrine')) {
        if (tile.structure.buildingId !== undefined) terrain.removeBuilding(tile.structure.buildingId, { ruins: true, name: 'Desecrated Temple' });
        else tile.structure = { type: 'ruins', name: 'Desecrated Temple', icon: '⚡', health: 20 };
        terrain.spawnParticles(this.x, this.y, 20, '#ef4444', 1.4);
      }
      return;
    }

    switch (decision.action) {
      case 'ErectHolySanctuary':
        // Inspired believers raise a shrine (a real multi-tile building) beside where they stand
        if (tile && terrain.isBuildable(Math.floor(this.x), Math.floor(this.y)) && !terrain.getBuildingAt(this.x, this.y)) {
          const sx = Math.floor(this.x);
          const sy = Math.floor(this.y);
          let crowded = false;
          for (const nb of terrain.buildingsInRect(sx - 6, sy - 6, sx + 6, sy + 6)) if (nb.type === 'shrine' || nb.type === 'temple') crowded = true;
          for (const [ox, oy] of [[0, -1], [-1, -1], [0, 0], [-1, 0]]) {
            if (crowded) break;
            const b = terrain.placeBuilding('shrine', sx + ox, sy + oy, { civId: civ ? civ.id : null });
            if (b) {
              b.name = `${this.name}'s Holy Shrine`;
              terrain.syncBuildingTiles(b);
              terrain.spawnParticles(this.x, this.y, 25, '#ffd700', 1.2);
              stats.shrines = (stats.shrines || 0) + 1;
              break;
            }
          }
        }
        break;

      case 'CommuneWithGod':
        terrain.spawnParticles(this.x, this.y, 16, '#00ffff', 1.5);
        this.energy = 100;
        this.health = Math.min(this.maxHealth, this.health + this.maxHealth * 0.25);
        break;

      case 'RepelThreat': {
        const foe = card && card.targetId && worldContext.ecosystem ? worldContext.ecosystem.byId.get(card.targetId) : null;
        if (foe && foe.alive) {
          if (Math.hypot(foe.x - this.x, foe.y - this.y) <= 2.5) {
            foe.health -= 25 + this.proficiencies.warfare / 4;
            terrain.spawnParticles(foe.x, foe.y, 14, '#f97316', 1.2);
            if (foe.health <= 0) {
              foe.die(`Slain by the champion ${this.name}`);
              stats.threats = (stats.threats || 0) + 1;
            }
          } else {
            this.requestPath(foe.x, foe.y, worldContext.pathfinder);
          }
        }
        break;
      }

      case 'ProclaimDivineProphecy': {
        terrain.spawnParticles(this.x, this.y, 18, '#fde68a', 1.6);
        for (const e of nearbyPeople(6)) {
          const before = e.belief.status;
          e.personality.piety = Math.min(1, e.personality.piety + 0.05 * (0.5 + this.personality.extraversion));
          e.belief = e.determineBelief();
          if (before !== 'DEVOUT_BELIEVER' && e.belief.status === 'DEVOUT_BELIEVER') stats.converts = (stats.converts || 0) + 1;
          // the champion's own faith (religion.js) spreads to listeners
          if (this.faithId && e.faithId !== this.faithId && random() < 0.25) e.faithId = this.faithId;
        }
        if (civ) civ.piety = Math.min(100, civ.piety + 1);
        break;
      }

      case 'TendThePeople': {
        let helped = 0;
        for (const e of nearbyPeople(5)) {
          if (e.hunger <= 40 && e.health >= e.maxHealth * 0.8) continue;
          e.health = Math.min(e.maxHealth, e.health + 15);
          e.hunger = Math.max(0, e.hunger - 15);
          helped++;
        }
        if (helped) terrain.spawnParticles(this.x, this.y, 12, '#86efac', 1.2);
        stats.healed = (stats.healed || 0) + helped;
        break;
      }

      case 'SeekPeace':
        if (civ && civ.warTarget) {
          // A skilled envoy may end the war; otherwise the talks at least calm the people
          if (civ.warTimer > 30 && random() < this.proficiencies.statesmanship / 250) {
            civ.endWar(worldContext.ecosystem, `${this.name}, ${this.epithet}, brokered peace`, null);
            stats.peace = (stats.peace || 0) + 1;
          } else {
            civ.unrest = Math.max(0, civ.unrest - 0.05);
          }
        }
        break;

      case 'Eat':
        // From the people's stores when there is a civilization, otherwise whatever the land offers
        if (civ && civ.food >= 2) civ.food -= 2;
        this.hunger = Math.max(0, this.hunger - 60);
        break;

      case 'GatherProvisions':
        if (civ) {
          const gathered = 4 + this.proficiencies.farming / 12;
          civ.food += gathered; // economy.syncFood moves this into the capital's stockpile
          stats.food = (stats.food || 0) + gathered;
        }
        break;

      case 'PonderCosmicMysteries':
        if (civ) civ.techPoints += 0.5 + this.proficiencies.science / 100;
        break;

      default: {
        const angle = random() * Math.PI * 2;
        const dist = 4 + random() * 6;
        this.requestPath(this.x + Math.cos(angle) * dist, this.y + Math.sin(angle) * dist, worldContext.pathfinder);
        break;
      }
    }
  }

  // If the creature stands on a solid building tile (a wall rose around it), step out to the nearest free tile.
  unstickFromBuildings(terrain) {
    const tx = Math.floor(this.x);
    const ty = Math.floor(this.y);
    const here = terrain.getTile(tx, ty);
    if (!here || !here.structure || !here.structure.solid) return;
    for (let r = 1; r <= 8; r++) {
      let best = null;
      let bd = Infinity;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = tx + dx;
          const y = ty + dy;
          if (!terrain.inBounds(x, y)) continue;
          const t = terrain.getTile(x, y);
          if ((t.structure && t.structure.solid) || (this.isSapient && t.biome.isWater)) continue;
          const d = Math.hypot(this.x - (x + 0.5), this.y - (y + 0.5));
          if (d < bd) { bd = d; best = { x, y }; }
        }
      }
      if (best) {
        this.x = best.x + 0.5;
        this.y = best.y + 0.5;
        this.path = [];
        return;
      }
    }
  }

  // Sapients walk on land only (they do not swim across rivers); everyone else may wade.
  requestPath(targetX, targetY, pathfinder, maxIterations = 300, landOnly = this.isSapient) {
    if (!pathfinder) return;
    this.path = pathfinder.findPath(this.x, this.y, targetX, targetY, maxIterations, landOnly);
  }

  moveAlongPath(sim, speedMultiplier, terrain) {
    if (this.path.length === 0) return;

    const nextPoint = this.path[0];
    const dx = nextPoint.x - this.x;
    const dy = nextPoint.y - this.y;
    const dist = Math.hypot(dx, dy);

    if (dist < 0.25) {
      this.path.shift();
      // a worker whose walk has ended decides again quickly
      if (this.path.length === 0 && this.task) this.actionCooldown = Math.min(this.actionCooldown, 0.25);
      return;
    }

    const curTile = terrain.getTile(Math.floor(this.x), Math.floor(this.y));
    let terrainCost = curTile.biome.movementCost || 1.0;
    if (curTile.road) terrainCost *= curTile.road === 'cobble' ? 0.67 : (curTile.road === 'gravel' ? 0.74 : 0.82);

    // Extreme slowdown in water
    if (curTile.biome.isWater) terrainCost *= 3.5;

    // Young creatures are slower; pregnant ones too
    const grown = 0.5 + 0.5 * Math.min(1, this.age / this.stats.maturityYears);
    const burden = this.pregnancy ? 0.8 : 1;
    const baseSpeed = this.stats.speedMult * 2.2 * grown * burden;
    const moveDist = Math.min(0.9, (baseSpeed / terrainCost) * sim); // (never more than a tile per step: no tunnelling through thin walls)

    if (Math.abs(dx) > 0.05) this.facing = dx > 0 ? 1 : -1;
    const nx = this.x + (dx / dist) * Math.min(dist, moveDist);
    const ny = this.y + (dy / dist) * Math.min(dist, moveDist);
    // Walls block walking: a step into a solid building tile (not through a door) is refused and the path dropped
    const toStruct = terrain.getTile(Math.floor(nx), Math.floor(ny)).structure;
    // (only a creature already standing inside a solid footprint may move within it, to get out: the door tile is not solid,
    // so someone standing in a doorway cannot walk on into the walls)
    if (toStruct && toStruct.solid && !(curTile.structure && curTile.structure.solid && curTile.structure.buildingId === toStruct.buildingId)) {
      this.path = [];
      return;
    }
    this.x = nx;
    this.y = ny;
    // The planet has edges: never walk off the map
    this.x = Math.max(0.01, Math.min(terrain.width - 0.01, this.x));
    this.y = Math.max(0.01, Math.min(terrain.height - 0.01, this.y));
    // Foot traffic wears desire paths into roads (society.footstep); a worker whose walk ends decides again quickly
    if (this.isSapient && terrain.society) {
      const tx = Math.floor(this.x);
      const ty = Math.floor(this.y);
      if (tx !== this._tx || ty !== this._ty) {
        this._tx = tx;
        this._ty = ty;
        if (terrain.society.footstep) terrain.society.footstep(tx, ty);
      }
    }
  }

  findNearestEntity(entities, filter) {
    let nearest = null;
    let minDist = Infinity;
    for (const e of entities) {
      if (filter(e)) {
        const d = Math.hypot(this.x - e.x, this.y - e.y);
        if (d < minDist) {
          minDist = d;
          nearest = e;
        }
      }
    }
    return nearest;
  }

  die(cause = 'Unknown') {
    // A divine shield (see god/powerEffects.js) keeps its bearer alive, except from old age
    if (this.status && this.status.shield > 0 && cause !== 'Old Age') {
      this.health = Math.max(this.health, 5);
      return;
    }
    this.alive = false;
    this.causeOfDeath = cause;
    this.decayTimer = this.isSapient ? 20 : 12; // the body lingers (and can be resurrected)
    // a citizen's body stays where it fell until the family carries it to be buried (civilization/deathcare.js)
    if (this.isSapient && this.civilization && this.civilization.isAlive && this.settlementId) {
      makeCorpse(this);
      this.decayTimer = CORPSE_LIFE;
    }
    this.pregnancy = null;
  }
}
