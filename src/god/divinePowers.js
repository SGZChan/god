import { sounds } from '../audio/soundFX.js';

export const POWERS = {
  PAN: {
    id: 'PAN',
    name: 'Pan & Explore World',
    icon: '✋',
    description: 'Click and drag anywhere to move around and explore creatures, cities, and continents.',
    cursor: 'grab',
    isDraggable: false
  },
  INSPECT: {
    id: 'INSPECT',
    name: 'Inspect Mind / Politics',
    icon: '👁️',
    description: 'Click on any creature or city to inspect its mind and stats, or drag to pan around.',
    cursor: 'grab',
    isDraggable: false
  },
  TERRAFORM_RAISE: {
    id: 'TERRAFORM_RAISE',
    name: 'Raise Mountains',
    icon: '⛰️',
    description: 'Violently uplift continental crust. Crushes buildings into rubble and kills creatures beneath!',
    cursor: 'cell',
    isDraggable: true
  },
  TERRAFORM_LOWER: {
    id: 'TERRAFORM_LOWER',
    name: 'Carve Ocean Basin',
    icon: '🌊',
    description: 'Collapse the earth into ocean abyss. Sinks buildings and drowns non-aquatic mortals!',
    cursor: 'cell',
    isDraggable: true
  },
  TSUNAMI: {
    id: 'TSUNAMI',
    name: 'Tsunami Deluge',
    icon: '🌊',
    description: 'Unleash a catastrophic tidal wave, sweeping away coastal structures and drowning armies.',
    cursor: 'cell',
    isDraggable: true
  },
  VOLCANO: {
    id: 'VOLCANO',
    name: 'Volcanic Magma Fissure',
    icon: '🌋',
    description: 'Rip open magma calderas. Rivers of molten basalt incinerate all in their path.',
    cursor: 'crosshair',
    isDraggable: true
  },
  SINGULARITY: {
    id: 'SINGULARITY',
    name: 'Surface Gravitational Rift',
    icon: '🕳️',
    description: 'Tear open a gravitational black hole rift on the planet surface, vaporizing everything.',
    cursor: 'crosshair',
    isDraggable: false
  },
  PLAGUE: {
    id: 'PLAGUE',
    name: 'Divine Pestilence',
    icon: '☣️',
    description: 'Infect empires with a deadly plague that spreads across population centers.',
    cursor: 'crosshair',
    isDraggable: true
  },
  DIVINE_RAIN: {
    id: 'DIVINE_RAIN',
    name: 'Rain of Life & Fertility',
    icon: '🌧️',
    description: 'Nurture crops, forests, and accelerate agriculture across the land.',
    cursor: 'cell',
    isDraggable: true
  },
  LIGHTNING: {
    id: 'LIGHTNING',
    name: 'Lightning Bolt',
    icon: '⚡',
    description: 'Smite blasphemers, heretics, or enemy armies with heavenly bolts.',
    cursor: 'crosshair',
    isDraggable: true
  },
  METEOR: {
    id: 'METEOR',
    name: 'Cataclysmic Meteor Strike',
    icon: '☄️',
    description: 'Obliterate cities and shatter terrain with a burning cosmic meteor.',
    cursor: 'crosshair',
    isDraggable: false
  },
  INSPIRATION: {
    id: 'INSPIRATION',
    name: 'Divine Revelation',
    icon: '💡',
    description: 'Inspire scholars with sacred wisdom, advancing civilization technology eras.',
    cursor: 'cell',
    isDraggable: false
  },
  BLESSING: {
    id: 'BLESSING',
    name: 'Holy Blessing',
    icon: '✨',
    description: 'Heal all wounds, cure diseases, and bestow divine vitality upon mortals.',
    cursor: 'cell',
    isDraggable: true
  }
};

export class DivinePowersManager {
  constructor(terrain, ecosystem, society) {
    this.terrain = terrain;
    this.ecosystem = ecosystem;
    this.society = society;
    this.terrain.ecosystem = ecosystem;
    this.terrain.society = society;

    this.activePower = POWERS.INSPECT;
    this.pendingSpawn = null;
    this.lastPaintedTile = { x: -1, y: -1 };
  }

  setPower(power) {
    sounds.playUIClick();
    this.activePower = power;
    this.pendingSpawn = null;
    this.lastPaintedTile = { x: -1, y: -1 };
  }

  armSpawn(spawnData) {
    this.pendingSpawn = spawnData;
    this.activePower = {
      id: 'SPAWN_ENTITY',
      name: `Spawn ${spawnData.type === 'champion' ? spawnData.config.name : spawnData.species.name}`,
      icon: '✨',
      cursor: 'crosshair',
      isDraggable: false
    };
  }

  applyAt(tileX, tileY, isDrag = false, worldX = undefined, worldY = undefined) {
    if (!this.activePower) return null;

    // Prevent duplicate triggers on the exact same tile during drag
    if (isDrag && this.lastPaintedTile.x === tileX && this.lastPaintedTile.y === tileY) {
      return null;
    }
    this.lastPaintedTile = { x: tileX, y: tileY };

    const tile = this.terrain.getTile(tileX, tileY);
    if (!tile) return null;

    switch (this.activePower.id) {
      case 'TERRAFORM_RAISE':
        sounds.playTerraform();
        this.terrain.raiseMountain(tileX, tileY, 3, 0.28);
        break;

      case 'TERRAFORM_LOWER':
        sounds.playTerraform();
        this.terrain.lowerOcean(tileX, tileY, 3, 0.32);
        break;

      case 'TSUNAMI':
        sounds.playTerraform();
        this.terrain.castTsunami(tileX, tileY, 6);
        break;

      case 'VOLCANO':
        sounds.playMeteorImpact();
        this.terrain.strikeVolcanicFissure(tileX, tileY, 4);
        break;

      case 'SINGULARITY':
        sounds.playMeteorImpact();
        this.terrain.spawnSurfaceSingularity(tileX, tileY, 5);
        break;

      case 'PLAGUE':
        sounds.playDivineBlessing();
        this.terrain.castDivinePlague(tileX, tileY, 7);
        break;

      case 'DIVINE_RAIN':
        sounds.playDivineBlessing();
        this.terrain.castDivineRain(tileX, tileY, 6);
        break;

      case 'LIGHTNING':
        sounds.playLightning();
        this.terrain.strikeLightning(tileX, tileY);
        break;

      case 'METEOR':
        sounds.playMeteorImpact();
        this.terrain.strikeMeteor(tileX, tileY);
        break;

      case 'INSPIRATION':
        sounds.playDivineBlessing();
        if (tile.civId) {
          this.society.inspireCivWithKnowledge(tile.civId, 450);
        } else {
          this.society.initDefaultCivs();
        }
        this.terrain.spawnParticles(tileX, tileY, 30, '#ffd700', 1.6);
        break;

      case 'BLESSING':
        sounds.playDivineBlessing();
        for (const ent of this.ecosystem.entities) {
          if (Math.hypot(ent.x - tileX, ent.y - tileY) < 5.0) {
            ent.health = ent.maxHealth;
            ent.hunger = 0;
            ent.energy = 100;
            ent.breath = 100;
          }
        }
        this.terrain.spawnParticles(tileX, tileY, 35, '#00ffff', 1.8);
        break;

      case 'SPAWN_ENTITY':
        if (this.pendingSpawn) {
          sounds.playDivineBlessing();
          if (this.pendingSpawn.type === 'champion') {
            const config = this.pendingSpawn.config;
            this.ecosystem.spawnRandomEntity(this.pendingSpawn.species, true, {
              name: config.name,
              epithet: config.epithet,
              gender: config.gender,
              aiSystem: config.aiSystem,
              appearance: config.appearance,
              personality: config.personality,
              proficiencies: config.proficiencies,
              x: tileX + 0.5,
              y: tileY + 0.5
            });
            this.terrain.spawnParticles(tileX, tileY, 50, config.appearance.auraColor || '#ffd700', 2.5);
            this.ecosystem.notifications.unshift({
              text: `👑 The Champion "${config.name}, ${config.epithet}" has descended onto the world!`,
              time: Date.now()
            });
          } else if (this.pendingSpawn.type === 'species') {
            // Divine creation: a founding group (half female, half male) of the new species
            const founders = this.ecosystem.spawnFounders(this.pendingSpawn.species, 8, tileX, tileY, null, 3);
            this.terrain.spawnParticles(tileX, tileY, 50, '#c084fc', 2.5);
            this.ecosystem.notifications.unshift({
              text: `✨ ${founders.length} ${this.pendingSpawn.species.name} appear at your command. From here on they must breed on their own.`,
              time: Date.now()
            });
          }
          this.setPower(POWERS.INSPECT);
        }
        break;

      case 'PAN':
        // When panning/exploring, clicking directly on an entity inspects it
        if (!isDrag) {
          const clickX = (worldX !== undefined) ? worldX : (tileX + 0.5);
          const clickY = (worldY !== undefined) ? worldY : (tileY + 0.5);
          let closestEntity = null;
          let minDistance = 2.4;
          for (const e of this.ecosystem.entities) {
            if (!e.alive && !(e.decayTimer > 0)) continue;
            const d = Math.hypot(e.x - clickX, e.y - clickY);
            if (d < minDistance) {
              minDistance = d;
              closestEntity = e;
            }
          }
          if (closestEntity) {
            return { type: 'entity', target: closestEntity };
          }
        }
        break;

      case 'INSPECT':
        // Reset so re-clicking the same tile always re-inspects
        this.lastPaintedTile = { x: -999, y: -999 };
        const targetX = (worldX !== undefined) ? worldX : (tileX + 0.5);
        const targetY = (worldY !== undefined) ? worldY : (tileY + 0.5);

        // Find the closest entity to the exact click location
        let closestEntity = null;
        let minDistance = 2.6; // Within 2.6 tiles radius of click

        for (const e of this.ecosystem.entities) {
          if (!e.alive && !(e.decayTimer > 0)) continue;
          const d = Math.hypot(e.x - targetX, e.y - targetY);
          if (d < minDistance) {
            minDistance = d;
            closestEntity = e;
          }
        }

        return {
          type: closestEntity ? 'entity' : 'tile',
          target: closestEntity || tile
        };
    }

    return null;
  }
}
