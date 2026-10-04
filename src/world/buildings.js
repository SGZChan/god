// Building catalogue and pure helpers (no terrain, no rendering). See docs/ROADMAP.md "Buildings" for the API.
//
// A building occupies a rectangular footprint of w x h tiles whose top-left tile is (x, y). Its sprite stands on
// the footprint's front (bottom) edge and rises above it, so a 3x3 house is about 60 px tall next to a 20 px
// creature (see art/buildingSprites.js). Tiers follow civilization/techTree.js ERAS by index:
// 0 stone age, 1 bronze, 2 classical, 3 medieval, 4 industrial, 5 space age.
//
// Fields of a catalogue entry:
//   id, name, category (housing | storage | workshop | farm | defense | civic | religious | extraction | dock),
//   w, h        footprint in tiles
//   tier        first era in which a civilization builds it
//   cost        materials { resourceId: amount } (ids from world/resources.js)
//   work        build effort in work units (terrain.advanceConstruction(id, work) adds work / work-units)
//   capacity    residents (housing) or workers (everything else)
//   door        { x, y } offset inside the footprint where creatures enter, or null (nobody can enter)
//   solid       true: every footprint tile except the door blocks walking once the building is complete
//   health      hit points of a finished building
//   ext         pixels the sprite rises above the footprint (art height)
//   shore       must touch water (docks); its tiles may be shallow water
//   connects    walls: pieces of the same `wall` family autotile to each other
//   icon        emoji used by UI text only (inspector); the map shows the pixel sprite
export const ROAD_KINDS = ['dirt', 'gravel', 'cobble'];
export const ROAD_SPEED = { dirt: 1.2, gravel: 1.35, cobble: 1.5 }; // walking speed multiplier on a road tile

const T = (id, name, category, w, h, tier, cost, work, capacity, extra = {}) => ({
  id, name, category, w, h, tier, cost, work, capacity,
  door: { x: Math.floor(w / 2), y: h - 1 },
  solid: true,
  health: 100,
  ext: 18,
  icon: '🏠',
  ...extra
});

const LIST = [
  // ---------- housing ----------
  T('tent', 'Lean-to Tent', 'housing', 2, 2, 0, { fibre: 4, wood: 2 }, 12, 2, { health: 40, ext: 14, icon: '⛺', door: { x: 0, y: 1 } }),
  T('hut', 'Thatched Hut', 'housing', 2, 2, 0, { wood: 6, fibre: 6 }, 24, 3, { health: 70, ext: 22, icon: '🛖', door: { x: 0, y: 1 } }),
  T('wooden_house', 'Wooden House', 'housing', 3, 3, 1, { wood: 14, fibre: 4 }, 60, 4, { health: 110, ext: 18 }),
  T('longhouse', 'Longhouse', 'housing', 4, 3, 1, { wood: 22, fibre: 6 }, 90, 8, { health: 140, ext: 20, door: { x: 1, y: 2 } }),
  T('stone_house', 'Stone House', 'housing', 3, 3, 2, { stone: 16, wood: 6 }, 100, 5, { health: 200, ext: 22 }),
  T('manor', 'Manor Townhouse', 'housing', 4, 3, 3, { stone: 24, wood: 12, clay: 6 }, 160, 8, { health: 260, ext: 28, door: { x: 1, y: 2 } }),
  T('tenement', 'Brick Tenement', 'housing', 4, 3, 4, { stone: 18, clay: 14, iron: 4 }, 180, 12, { health: 300, ext: 36, door: { x: 1, y: 2 } }),
  T('habitat', 'Habitat Dome', 'housing', 3, 3, 5, { iron: 14, stone: 10, clay: 6 }, 160, 8, { health: 320, ext: 24, icon: '🫧' }),
  T('hall', "Chieftain's Hall", 'civic', 5, 3, 0, { wood: 26, fibre: 8, stone: 4 }, 120, 10, { health: 200, ext: 24, icon: '🏛️', door: { x: 2, y: 2 } }),

  // ---------- storage ----------
  T('well', 'Stone Well', 'storage', 1, 1, 1, { stone: 6, wood: 2 }, 24, 0, { health: 80, ext: 18, icon: '🪣', door: { x: 0, y: 0 } }),
  T('granary', 'Granary', 'storage', 3, 3, 1, { wood: 16, fibre: 6 }, 70, 2, { health: 120, ext: 18, icon: '🌾' }),

  // ---------- farming ----------
  T('farm', 'Farm Field', 'farm', 4, 3, 0, { wood: 2, fibre: 2 }, 30, 3, { solid: false, door: null, health: 50, ext: 8, icon: '🌾' }),
  T('pen', 'Pasture Pen', 'farm', 3, 3, 0, { wood: 8 }, 30, 2, { solid: false, door: null, health: 60, ext: 8, icon: '🐑' }),

  // ---------- workshops ----------
  T('workshop', 'Workshop', 'workshop', 3, 3, 1, { wood: 14, stone: 4 }, 70, 3, { health: 120, ext: 18, icon: '🔨' }),
  T('smithy', 'Smithy', 'workshop', 3, 3, 1, { stone: 12, wood: 8 }, 90, 3, { health: 160, ext: 24, icon: '⚒️' }),
  T('kiln', 'Kiln', 'workshop', 2, 2, 1, { clay: 10, stone: 4 }, 40, 2, { health: 100, ext: 20, icon: '🏺', door: { x: 0, y: 1 } }),

  // ---------- extraction ----------
  T('lumber_camp', 'Lumber Camp', 'extraction', 3, 3, 0, { wood: 8 }, 35, 4, { health: 80, ext: 14, icon: '🪓' }),
  T('quarry', 'Quarry', 'extraction', 4, 3, 1, { wood: 8, stone: 2 }, 50, 5, { solid: false, health: 150, ext: 12, icon: '⛏️', door: { x: 1, y: 2 } }),
  T('mine', 'Mine Entrance', 'extraction', 3, 3, 2, { wood: 14, stone: 8 }, 80, 6, { health: 180, ext: 20, icon: '⛏️' }),

  // ---------- civic ----------
  T('market_stall', 'Market Stall', 'civic', 2, 2, 1, { wood: 6, fibre: 4 }, 22, 1, { solid: false, health: 50, ext: 16, icon: '🛒', door: { x: 0, y: 1 } }),
  T('market', 'Market', 'civic', 4, 3, 2, { wood: 18, stone: 6 }, 90, 4, { solid: false, health: 120, ext: 20, icon: '🛒', door: { x: 1, y: 2 } }),
  T('tavern', 'Tavern', 'civic', 3, 3, 2, { wood: 18, stone: 8 }, 80, 4, { health: 140, ext: 22, icon: '🍺' }),
  T('library', 'Library & School', 'civic', 4, 3, 3, { stone: 26, wood: 10 }, 150, 6, { health: 220, ext: 30, icon: '📚', door: { x: 1, y: 2 } }),
  T('barracks', 'Barracks', 'defense', 4, 3, 3, { stone: 24, wood: 12, iron: 4 }, 140, 12, { health: 280, ext: 24, icon: '⚔️', door: { x: 1, y: 2 } }),
  T('graveyard', 'Graveyard', 'religious', 3, 3, 1, { stone: 6, wood: 4 }, 30, 0, { solid: false, door: null, health: 80, ext: 14, icon: '🪦' }),

  // ---------- waterfront and power ----------
  T('dock', 'Fishing Dock', 'dock', 3, 2, 1, { wood: 14 }, 50, 3, { solid: false, shore: true, health: 90, ext: 8, icon: '⚓', door: { x: 0, y: 1 } }),
  T('windmill', 'Windmill', 'workshop', 3, 3, 2, { wood: 18, stone: 14 }, 120, 3, { health: 170, ext: 36, icon: '🌬️' }),

  // ---------- defence ----------
  T('watchtower', 'Watchtower', 'defense', 2, 2, 1, { wood: 14, stone: 4 }, 60, 2, { health: 150, ext: 38, icon: '🗼', door: { x: 0, y: 1 } }),
  T('palisade', 'Palisade Wall', 'defense', 1, 1, 0, { wood: 3 }, 8, 0, { door: null, health: 60, ext: 12, icon: '🪵', connects: 'wall' }),
  T('palisade_gate', 'Palisade Gate', 'defense', 1, 1, 0, { wood: 6 }, 16, 0, { door: { x: 0, y: 0 }, health: 80, ext: 18, icon: '🪵', connects: 'wall' }),
  T('stone_wall', 'Stone Wall', 'defense', 1, 1, 2, { stone: 5 }, 14, 0, { door: null, health: 220, ext: 18, icon: '🧱', connects: 'wall' }),
  T('stone_gate', 'Stone Gatehouse', 'defense', 1, 1, 2, { stone: 12, wood: 4 }, 30, 0, { door: { x: 0, y: 0 }, health: 260, ext: 26, icon: '🚪', connects: 'wall' }),
  T('wall_tower', 'Corner Tower', 'defense', 2, 2, 2, { stone: 18, wood: 4 }, 80, 3, { health: 300, ext: 32, icon: '🗼', door: { x: 0, y: 1 }, connects: 'wall' }),
  T('keep', 'Castle Keep', 'defense', 6, 6, 3, { stone: 90, wood: 30, iron: 8 }, 420, 24, { health: 650, ext: 40, icon: '🏰', door: { x: 2, y: 5 } }),

  // ---------- religion ----------
  T('shrine', 'Shrine', 'religious', 2, 2, 0, { stone: 6, wood: 2 }, 30, 2, { health: 90, ext: 20, icon: '⛩️', door: { x: 0, y: 1 } }),
  T('temple', 'Temple', 'religious', 4, 4, 2, { stone: 40, wood: 8, gold: 1 }, 220, 8, { health: 260, ext: 28, icon: '🏛️', door: { x: 1, y: 3 } }),
  T('cathedral', 'Cathedral', 'religious', 5, 4, 3, { stone: 70, wood: 14, gold: 2 }, 340, 14, { health: 380, ext: 46, icon: '⛪', door: { x: 2, y: 3 } }),

  // ---------- industrial and space ----------
  T('factory', 'Factory', 'workshop', 4, 3, 4, { stone: 20, iron: 12, coal: 8 }, 200, 14, { health: 300, ext: 42, icon: '🏭', door: { x: 1, y: 2 } }),
  T('power_plant', 'Power Plant', 'workshop', 5, 4, 4, { stone: 30, iron: 24, coal: 10 }, 280, 10, { health: 340, ext: 44, icon: '⚡', door: { x: 2, y: 3 } }),
  T('spaceport', 'Spaceport', 'civic', 6, 5, 5, { iron: 40, stone: 30, uranium: 2 }, 600, 16, { health: 500, ext: 70, icon: '🚀', door: { x: 2, y: 4 } })
];

// A ruined building keeps its footprint; the sprite is rubble. Never placed directly (terrain.removeBuilding makes it).
const RUINS = T('ruins', 'Ruins', 'housing', 1, 1, 0, {}, 1, 0, { solid: false, door: null, health: 0, ext: 8, icon: '🏚️' });

export const BUILDING_TYPES = Object.freeze(Object.fromEntries([...LIST, RUINS].map(d => [d.id, Object.freeze(d)])));
export const BUILDING_IDS = LIST.map(d => d.id);
export const CATEGORIES = ['housing', 'storage', 'workshop', 'farm', 'defense', 'civic', 'religious', 'extraction', 'dock'];

export const TILE_PX = 14;          // sprite pixels per tile; the renderer scales this to its tile size
export const SPRITE_PAD_X = 4;      // sprite margin left and right of the footprint
export const SPRITE_PAD_BOTTOM = 5; // margin below the footprint's front edge (shadow, steps)

export function getBuildingDef(type) {
  return BUILDING_TYPES[type] || null;
}

// Types available to a civilization in era `tier` (0..5), optionally of one category.
export function typesForTier(tier, category = null) {
  return LIST.filter(d => d.tier <= tier && (!category || d.category === category));
}

// Footprint of a building: ruins keep the footprint of what collapsed.
export function footprintOf(def, rot = false) {
  return rot && def.w !== def.h ? { w: def.h, h: def.w } : { w: def.w, h: def.h };
}

// Pixel size of the sprite and where the footprint's top-left tile starts inside it.
export function spriteMetrics(def, w = def.w, h = def.h) {
  const width = w * TILE_PX + SPRITE_PAD_X * 2;
  const height = h * TILE_PX + def.ext + SPRITE_PAD_BOTTOM;
  return { width, height, footX: SPRITE_PAD_X, footY: height - SPRITE_PAD_BOTTOM - h * TILE_PX, ext: def.ext };
}

// Materials still missing for a building under construction (delivered counts toward the whole cost).
export function missingMaterials(building) {
  const def = BUILDING_TYPES[building.type];
  const out = {};
  if (!def) return out;
  for (const [res, need] of Object.entries(def.cost)) {
    const left = need - ((building.delivered && building.delivered[res]) || 0);
    if (left > 0) out[res] = left;
  }
  return out;
}

// The tile creatures walk through to enter (null for walls and open buildings).
export function doorTile(building) {
  const def = BUILDING_TYPES[building.type];
  if (!def || !def.door) return null;
  return { x: building.x + def.door.x, y: building.y + def.door.y };
}

// The tile in front of the door: where a road should reach and where visitors stand.
export function frontTile(building) {
  const d = doorTile(building);
  return d ? { x: d.x, y: d.y + 1 } : { x: building.x + Math.floor(building.w / 2), y: building.y + building.h };
}
