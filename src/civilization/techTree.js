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

// ---------- what an era needs besides research points ----------
// An era is only entered when the civilization has gathered the points AND discovered the materials, built the key
// buildings and produced the key goods (the settlements' crafters and miners do that). Requirements are cumulative.
//   discovered  resource types the civ must know a deposit of (civ.knownDeposits, found by scouts)
//   buildings   building types that must stand finished somewhere in the civ
//   output      cumulative production { item: amount } (civ.output, counted when goods reach a stockpile)
//   citizens    population entities
export const ERA_REQUIREMENTS = {
  STONE_AGE: {},
  BRONZE_AGE: { discovered: ['copper', 'tin'], buildings: ['kiln', 'smithy'], output: { bronze: 2 } },
  CLASSICAL_AGE: { discovered: ['iron', 'coal'], buildings: ['market'], output: { iron_bar: 2 } },
  MEDIEVAL_AGE: { buildings: ['stone_house', 'quarry'], output: { stone: 60, bricks: 4 }, citizens: 12 },
  INDUSTRIAL_AGE: { discovered: ['gold'], buildings: ['library', 'mine'], output: { coal: 20, iron_bar: 8 } },
  SPACE_AGE: { discovered: ['oil', 'uranium'], buildings: ['factory', 'power_plant'], output: { uranium: 2 } }
};

const RES_NAMES = { copper: 'copper', tin: 'tin', iron: 'iron', coal: 'coal', gold: 'gold', oil: 'oil', uranium: 'uranium' };

// What the civ still lacks for era `eraId` (empty list = ready). `have` = { discovered(type)->bool, built(type)->bool }.
export function missingForEra(civ, eraId, have) {
  const req = ERA_REQUIREMENTS[eraId] || {};
  const out = [];
  for (const t of req.discovered || []) if (!have.discovered(t)) out.push(`discover ${RES_NAMES[t] || t}`);
  for (const t of req.buildings || []) if (!have.built(t)) out.push(`build a ${t.replace(/_/g, ' ')}`);
  for (const [item, n] of Object.entries(req.output || {})) {
    const got = (civ.output && civ.output[item]) || 0;
    if (got < n) out.push(`produce ${n - Math.floor(got)} more ${item.replace(/_/g, ' ')}`);
  }
  if (req.citizens && (civ.citizens || 0) < req.citizens) out.push(`grow to ${req.citizens} citizens`);
  return out;
}

// The highest era whose research points AND requirements are met (never below civ.eraFloor, the knowledge a reborn
// civilization inherits from the ruins it found).
export function eraFor(civ, have) {
  let best = 0;
  const byPoints = getEraForPoints(civ.techPoints);
  const maxIndex = ERAS.findIndex(e => e.id === byPoints.id);
  for (let i = 1; i <= maxIndex; i++) {
    if (missingForEra(civ, ERAS[i].id, have).length) break;
    best = i;
  }
  best = Math.max(best, Math.min(maxIndex, civ.eraFloor || 0));
  return ERAS[best];
}
