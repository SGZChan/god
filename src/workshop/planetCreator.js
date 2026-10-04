// Planet Creator and Customizer Workshop
import { sounds } from '../audio/soundFX.js';

export class PlanetCreator {
  constructor(onPlanetCreated) {
    this.onPlanetCreated = onPlanetCreated;
    this.config = {
      name: 'Aethelgard Prime',
      type: 'terrestrial',
      radius: 5.2,
      distance: 75,
      color: '#2563eb',
      hasAtmosphere: true,
      hasRings: false,
      ringColor: '#d4af37',
      isPopulated: true,
      axialTilt: 0.35
    };
  }

  create() {
    sounds.playDivineBlessing();
    const planetConfig = {
      id: 'planet_custom_' + Math.random().toString(36).substring(2, 9),
      name: this.config.name,
      type: this.config.type,
      radius: parseFloat(this.config.radius),
      distance: parseFloat(this.config.distance),
      color: this.config.color,
      hasAtmosphere: this.config.hasAtmosphere,
      hasRings: this.config.hasRings,
      ringColor: this.config.ringColor,
      isPopulated: this.config.isPopulated,
      axialTilt: parseFloat(this.config.axialTilt)
    };

    if (this.onPlanetCreated) {
      this.onPlanetCreated(planetConfig);
    }
    return planetConfig;
  }
}
