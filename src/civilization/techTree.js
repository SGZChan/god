// Civilization Technology Eras and Milestones

export const ERAS = [
  {
    id: 'STONE_AGE',
    name: 'Stone Age',
    reqPoints: 0,
    icon: '🪵',
    structures: ['campfire', 'primitive_hut'],
    bonuses: { farmBonus: 1.0, defense: 5 },
    description: 'Campfires crackle in the wilderness. Tribes worship the divine creator through crude totems.'
  },
  {
    id: 'BRONZE_AGE',
    name: 'Bronze Age',
    reqPoints: 120,
    icon: '🏺',
    structures: ['mudbrick_home', 'irrigation_canal', 'shrine'],
    bonuses: { farmBonus: 1.3, defense: 12 },
    description: 'Metallurgy and agriculture flourish. Mudbrick villages unite into city-states.'
  },
  {
    id: 'CLASSICAL_AGE',
    name: 'Classical Age',
    reqPoints: 350,
    icon: '🏛️',
    structures: ['stone_estate', 'granary', 'grand_temple'],
    bonuses: { farmBonus: 1.7, defense: 25 },
    description: 'Grand stone columns rise to honor the Gods. Codified laws and trade roads link the realm.'
  },
  {
    id: 'MEDIEVAL_AGE',
    name: 'Medieval Age',
    reqPoints: 750,
    icon: '⚔️',
    structures: ['castle_keep', 'watchtower', 'cathedral'],
    bonuses: { farmBonus: 2.2, defense: 45 },
    description: 'Stone fortresses dominate the landscape. Knightly orders fight holy crusades.'
  },
  {
    id: 'INDUSTRIAL_AGE',
    name: 'Industrial Age',
    reqPoints: 1400,
    icon: '🏭',
    structures: ['factory', 'steam_station', 'telegraph_tower'],
    bonuses: { farmBonus: 3.5, defense: 75 },
    description: 'Steam and smoke fill the air. Mass production transforms nature into sprawling metropolises.'
  },
  {
    id: 'SPACE_AGE',
    name: 'Spaceflight Age',
    reqPoints: 2400,
    icon: '🚀',
    structures: ['spaceport', 'fusion_beacon', 'quantum_shrine'],
    bonuses: { farmBonus: 5.0, defense: 120 },
    description: 'Mankind looks up at the stars and launches rockets toward other worlds in the solar system.'
  }
];

export function getEraForPoints(points) {
  let activeEra = ERAS[0];
  for (const era of ERAS) {
    if (points >= era.reqPoints) {
      activeEra = era;
    } else {
      break;
    }
  }
  return activeEra;
}
