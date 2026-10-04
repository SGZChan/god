import { AvatarRenderer } from './avatarRenderer.js';
import { sounds } from '../audio/soundFX.js';

export class CreationWorkshop {
  constructor(ecosystem, onSpawnReady) {
    this.ecosystem = ecosystem;
    this.onSpawnReady = onSpawnReady;
    this.activeTab = 'champion'; // 'champion' or 'species'

    // Champion config state
    this.championConfig = {
      name: 'Eve',
      epithet: 'The Firstborn Prophet',
      gender: 'Female',
      aiSystem: 'JEV', // 'JEV' or 'MINECRAFT'
      appearance: {
        skinColor: '#f3c192',
        hairColor: '#4a2511',
        hairStyle: 'long',
        eyeColor: '#2b6cb0',
        bodyType: 'athletic',
        attire: 'robes',
        auraColor: '#ffd700'
      },
      personality: {
        openness: 0.85,
        conscientiousness: 0.9,
        extraversion: 0.75,
        agreeableness: 0.8,
        neuroticism: 0.2,
        piety: 0.98
      },
      proficiencies: {
        architecture: 80,
        warfare: 50,
        statesmanship: 95,
        farming: 70,
        science: 85,
        mysticism: 98
      }
    };

    // Species config state
    this.speciesConfig = {
      name: 'Star Chimera',
      type: 'alien',
      symbol: '🦄',
      color: '#a855f7',
      size: 1.2,
      speed: 1.4,
      diet: 'herbivore',
      lifespan: 80,
      coldResist: 0.7,
      heatResist: 0.6,
      aiSystem: 'MINECRAFT'
    };

    this.renderer = null;
  }

  mount(canvasElement) {
    this.renderer = new AvatarRenderer(canvasElement);
    this.updatePreview();
  }

  updatePreview() {
    if (this.renderer) {
      this.renderer.render(
        this.championConfig.appearance,
        this.championConfig.gender,
        true
      );
    }
  }

  applyPreset(presetKey) {
    sounds.playUIClick();
    if (presetKey === 'prophet') {
      this.championConfig.name = 'Seraphina';
      this.championConfig.epithet = 'The Sacred Voice';
      this.championConfig.gender = 'Female';
      this.championConfig.aiSystem = 'JEV';
      this.championConfig.appearance.attire = 'robes';
      this.championConfig.appearance.auraColor = '#38bdf8';
      this.championConfig.appearance.hairStyle = 'long';
      this.championConfig.personality.piety = 1.0;
      this.championConfig.personality.openness = 0.95;
      this.championConfig.proficiencies.mysticism = 100;
      this.championConfig.proficiencies.statesmanship = 90;
    } else if (presetKey === 'warlord') {
      this.championConfig.name = 'Vulkan';
      this.championConfig.epithet = 'The Divine Conqueror';
      this.championConfig.gender = 'Male';
      this.championConfig.aiSystem = 'JEV';
      this.championConfig.appearance.attire = 'armor';
      this.championConfig.appearance.auraColor = '#ef4444';
      this.championConfig.appearance.hairStyle = 'short';
      this.championConfig.appearance.bodyType = 'heavy';
      this.championConfig.personality.piety = 0.85;
      this.championConfig.personality.agreeableness = 0.2;
      this.championConfig.proficiencies.warfare = 100;
      this.championConfig.proficiencies.statesmanship = 85;
    } else if (presetKey === 'architect') {
      this.championConfig.name = 'Daedalus';
      this.championConfig.epithet = 'Master of Foundations';
      this.championConfig.gender = 'Non-binary';
      this.championConfig.aiSystem = 'JEV';
      this.championConfig.appearance.attire = 'scholar';
      this.championConfig.appearance.auraColor = '#10b981';
      this.championConfig.appearance.hairStyle = 'crown';
      this.championConfig.personality.conscientiousness = 1.0;
      this.championConfig.proficiencies.architecture = 100;
      this.championConfig.proficiencies.science = 95;
    }
    this.updatePreview();
  }

  createSpecies() {
    sounds.playDivineBlessing();
    return this.ecosystem.createCustomSpecies(this.speciesConfig);
  }

  prepareSpawn(type = 'champion') {
    sounds.playUIClick();
    if (this.onSpawnReady) {
      if (type === 'champion') {
        const humanSpecies = this.ecosystem.sapientSpecies() || this.ecosystem.speciesCatalog[0];
        this.onSpawnReady({
          type: 'champion',
          species: humanSpecies,
          config: JSON.parse(JSON.stringify(this.championConfig))
        });
      } else {
        const spec = this.createSpecies();
        this.onSpawnReady({
          type: 'species',
          species: spec
        });
      }
    }
  }
}
