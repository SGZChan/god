import { sounds } from '../audio/soundFX.js';
import { POWER_LIST, POWER_BY_ID } from './powerCatalog.js';
import { castPower } from './powerEffects.js';
import { ensureEffects } from './effects.js';
import { godSettings } from './godSettings.js';

export const MAX_ENERGY = 100;
const ENERGY_REGEN = 4; // per real second

// Power metadata lives in powerCatalog.js; behaviour in powerEffects.js. POWERS is keyed by id.
export const POWERS = Object.fromEntries(POWER_LIST.map(p => [p.id, p]));

export class DivinePowersManager {
  constructor(terrain, ecosystem, society) {
    this.terrain = terrain;
    this.ecosystem = ecosystem;
    this.society = society;
    this.terrain.ecosystem = ecosystem;
    this.terrain.society = society;
    this.effects = ensureEffects(terrain, ecosystem, society);
    this.energy = MAX_ENERGY;   // divine energy (only limits the player when sandbox mode is off)
    this.lastMessage = null;    // why the last cast failed

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
      icon: 'BLESSING',
      category: 'tools',
      description: 'Click anywhere on the surface to place your creation.',
      cost: 0,
      radius: 0,
      cursor: 'crosshair',
      isDraggable: false
    };
  }

  // Divine energy refills over real time (seconds)
  regen(dt) {
    this.energy = Math.min(MAX_ENERGY, this.energy + ENERGY_REGEN * dt);
  }

  playSound(power) {
    if (power.category === 'blessings' || power.category === 'nature') sounds.playDivineBlessing();
    else if (power.id === 'LIGHTNING' || power.id === 'LIGHTNING_STORM') sounds.playLightning();
    else if (power.category === 'terrain') sounds.playTerraform();
    else sounds.playMeteorImpact();
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

    const power = this.activePower;
    if (POWER_BY_ID[power.id] && power.category !== 'tools') {
      if (!godSettings.sandbox && this.energy < power.cost) {
        this.lastMessage = 'Not enough divine energy.';
        return null;
      }
      const result = castPower(power.id, this.effects, tileX, tileY);
      if (!result.ok) {
        this.lastMessage = result.reason;
        return null;
      }
      this.lastMessage = null;
      if (!godSettings.sandbox) this.energy = Math.max(0, this.energy - power.cost);
      this.playSound(power);
      return null;
    }

    switch (power.id) {
      case 'SPAWN_ENTITY':
        if (this.pendingSpawn) {
          sounds.playDivineBlessing();
          if (this.pendingSpawn.type === 'champion') {
            const config = this.pendingSpawn.config;
            this.ecosystem.spawnRandomEntity(this.pendingSpawn.species, true, {
              name: config.name,
              epithet: config.epithet,
              gender: config.gender,
              sex: config.gender === 'Male' ? 'M' : 'F',
              aiSystem: config.aiSystem,
              appearance: config.appearance,
              personality: config.personality,
              proficiencies: config.proficiencies,
              vices: config.vices,
              persona: config.persona,
              look: config.look,
              x: tileX + 0.5,
              y: tileY + 0.5
            });
            this.terrain.spawnParticles(tileX, tileY, 50, config.appearance.auraColor || '#ffd700', 2.5);
            this.ecosystem.notifications.unshift({
              text: `👑 The Champion "${config.name}, ${config.epithet}" has descended onto the world!`,
              player: true, // a reply to the player's own action: shown as a toast (see main.js)
              time: Date.now()
            });
          } else if (this.pendingSpawn.type === 'species') {
            // Divine creation: a founding group (half female, half male) of the new species
            const count = Math.max(4, Math.min(16, Math.round(this.pendingSpawn.founders || 8)));
            const founders = this.ecosystem.spawnFounders(this.pendingSpawn.species, count, tileX, tileY, null, 3);
            this.terrain.spawnParticles(tileX, tileY, 50, '#c084fc', 2.5);
            this.ecosystem.notifications.unshift({
              text: `✨ ${founders.length} ${this.pendingSpawn.species.name} appear at your command. From here on they must breed on their own.`,
              player: true,
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
