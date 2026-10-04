// Whittaker Biome definitions and visual parameters

export const BIOMES = {
  DEEP_OCEAN: {
    id: 'DEEP_OCEAN',
    name: 'Deep Ocean',
    color: '#081c3b',
    colorRgb: [8, 28, 59],
    isWater: true,
    movementCost: 3.0,
    fertility: 0.1,
    baseFlora: 'Kelp Forest',
    icon: '🌊'
  },
  OCEAN: {
    id: 'OCEAN',
    name: 'Open Ocean',
    color: '#12396e',
    colorRgb: [18, 57, 110],
    isWater: true,
    movementCost: 2.2,
    fertility: 0.25,
    baseFlora: 'Plankton',
    icon: '🌊'
  },
  SHALLOWS: {
    id: 'SHALLOWS',
    name: 'Coral Shallows',
    color: '#1e689a',
    colorRgb: [30, 104, 154],
    isWater: true,
    movementCost: 1.6,
    fertility: 0.6,
    baseFlora: 'Coral Reefs',
    icon: '🪸'
  },
  BEACH: {
    id: 'BEACH',
    name: 'Sandy Shore',
    color: '#d4bc78',
    colorRgb: [212, 188, 120],
    isWater: false,
    movementCost: 1.1,
    fertility: 0.2,
    baseFlora: 'Sea Grass',
    icon: '🏖️'
  },
  GRASSLAND: {
    id: 'GRASSLAND',
    name: 'Verdant Grassland',
    color: '#4f9437',
    colorRgb: [79, 148, 55],
    isWater: false,
    movementCost: 1.0,
    fertility: 0.85,
    baseFlora: 'Wild Wheat & Flowers',
    icon: '🌾'
  },
  SAVANNA: {
    id: 'SAVANNA',
    name: 'Sunlit Savanna',
    color: '#949137',
    colorRgb: [148, 145, 55],
    isWater: false,
    movementCost: 1.0,
    fertility: 0.55,
    baseFlora: 'Acacia & Tall Grass',
    icon: '🦒'
  },
  TEMPERATE_FOREST: {
    id: 'TEMPERATE_FOREST',
    name: 'Temperate Forest',
    color: '#286928',
    colorRgb: [40, 105, 40],
    isWater: false,
    movementCost: 1.3,
    fertility: 0.75,
    baseFlora: 'Oak & Birch',
    icon: '🌲'
  },
  RAINFOREST: {
    id: 'RAINFOREST',
    name: 'Lush Rainforest',
    color: '#135427',
    colorRgb: [19, 84, 39],
    isWater: false,
    movementCost: 1.6,
    fertility: 0.95,
    baseFlora: 'Canopy Palms & Vines',
    icon: '🌴'
  },
  TAIGA: {
    id: 'TAIGA',
    name: 'Boreal Taiga',
    color: '#345244',
    colorRgb: [52, 82, 68],
    isWater: false,
    movementCost: 1.3,
    fertility: 0.4,
    baseFlora: 'Pines & Moss',
    icon: '🌲'
  },
  TUNDRA: {
    id: 'TUNDRA',
    name: 'Freezing Tundra',
    color: '#6e7a72',
    colorRgb: [110, 122, 114],
    isWater: false,
    movementCost: 1.4,
    fertility: 0.2,
    baseFlora: 'Lichens & Shrubs',
    icon: '❄️'
  },
  GLACIAL_ICE: {
    id: 'GLACIAL_ICE',
    name: 'Glacial Ice Sheet',
    color: '#d6ecf5',
    colorRgb: [214, 236, 245],
    isWater: false,
    movementCost: 1.8,
    fertility: 0.05,
    baseFlora: 'None',
    icon: '🧊'
  },
  DESERT: {
    id: 'DESERT',
    name: 'Arid Dunes',
    color: '#cf8e3c',
    colorRgb: [207, 142, 60],
    isWater: false,
    movementCost: 1.4,
    fertility: 0.15,
    baseFlora: 'Cacti & Succulents',
    icon: '🏜️'
  },
  VOLCANIC: {
    id: 'VOLCANIC',
    name: 'Volcanic Caldera',
    color: '#331a1a',
    colorRgb: [51, 26, 26],
    isWater: false,
    movementCost: 2.2,
    fertility: 0.3,
    baseFlora: 'Magma Lichen',
    icon: '🌋'
  },
  ALIEN_BLOOM: {
    id: 'ALIEN_BLOOM',
    name: 'Bioluminescent Jungle',
    color: '#3b1854',
    colorRgb: [59, 24, 84],
    isWater: false,
    movementCost: 1.4,
    fertility: 0.9,
    baseFlora: 'Glowing Spores & Fungi',
    icon: '✨'
  }
};

// `roll` is a deterministic per-tile value in [0, 1) so chunks classify identically whenever generated.
export function classifyBiome(elevation, temperature, moisture, planetType = 'terrestrial', roll = 1) {
  // Deep & shallow ocean
  if (elevation < 0.32) return BIOMES.DEEP_OCEAN;
  if (elevation < 0.44) return BIOMES.OCEAN;
  if (elevation < 0.48) return BIOMES.SHALLOWS;
  if (elevation < 0.51) return BIOMES.BEACH;

  // Volcanic planet override or high volcanic peaks
  if (planetType === 'volcanic' || (elevation > 0.88 && roll < 0.05)) {
    return BIOMES.VOLCANIC;
  }

  // Alien planet override
  if (planetType === 'alien' && elevation > 0.5) {
    if (moisture > 0.5) return BIOMES.ALIEN_BLOOM;
  }

  // Extreme cold (Poles or high mountain summits)
  if (temperature < 0.18 || elevation > 0.85) {
    return BIOMES.GLACIAL_ICE;
  }
  if (temperature < 0.32) {
    return moisture > 0.45 ? BIOMES.TAIGA : BIOMES.TUNDRA;
  }

  // Temperate zone
  if (temperature < 0.72) {
    if (moisture < 0.25) return BIOMES.DESERT;
    if (moisture < 0.54) return BIOMES.GRASSLAND;
    if (moisture < 0.78) return BIOMES.TEMPERATE_FOREST;
    return BIOMES.RAINFOREST;
  }

  // Tropical / Equatorial zone
  if (moisture < 0.25) return BIOMES.DESERT;
  if (moisture < 0.55) return BIOMES.SAVANNA;
  return BIOMES.RAINFOREST;
}
