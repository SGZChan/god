// Every god power: metadata only (name, category, tooltip, cost, brush radius). The behaviour lives in
// powerEffects.js (instant casts + long-running effects) and divinePowers.js (legacy terrain powers).
// `icon` names a drawing in art/powerIcons.js.

export const CATEGORIES = [
  { id: 'terrain', name: 'Terrain', blurb: 'Reshape the land' },
  { id: 'nature', name: 'Nature', blurb: 'Weather, water and growth' },
  { id: 'blessings', name: 'Blessings', blurb: 'Gifts for the faithful and the innocent' },
  { id: 'curses', name: 'Curses', blurb: 'Disasters and punishments' },
  { id: 'creatures', name: 'Creatures', blurb: 'Meddle with living things' },
  { id: 'chaos', name: 'Chaos', blurb: 'Fun, strange and unpredictable' },
  { id: 'cosmic', name: 'Cosmic', blurb: 'Sky-sized forces' }
];

const P = (id, name, category, cost, radius, desc, extra = {}) => ({
  id, name, category, cost, radius, description: desc, icon: id,
  cursor: 'crosshair', isDraggable: false, ...extra
});

export const POWER_LIST = [
  // ---- the two navigation tools ----
  { id: 'INSPECT', name: 'Inspect', category: 'tools', cost: 0, radius: 0, icon: 'INSPECT', cursor: 'grab', isDraggable: false,
    description: 'Click a creature, city or tile to inspect it. Drag to pan.' },
  { id: 'PAN', name: 'Pan', category: 'tools', cost: 0, radius: 0, icon: 'PAN', cursor: 'grab', isDraggable: false,
    description: 'Drag to move around the world (or use WASD).' },

  // ---- terrain ----
  P('TERRAFORM_RAISE', 'Raise Mountains', 'terrain', 8, 3, 'Violently uplift the crust. Crushes buildings and creatures beneath.', { isDraggable: true, cursor: 'cell', legacy: true, eventKind: 'disaster' }),
  P('TERRAFORM_LOWER', 'Carve Ocean Basin', 'terrain', 8, 3, 'Sink the land into the sea. Drowns buildings and mortals.', { isDraggable: true, cursor: 'cell', legacy: true, eventKind: 'disaster' }),
  P('TSUNAMI', 'Tsunami', 'terrain', 22, 6, 'A catastrophic tidal wave floods the coast and sweeps structures away.', { isDraggable: true, cursor: 'cell', legacy: true, eventKind: 'disaster' }),
  P('VOLCANO', 'Volcano', 'terrain', 28, 4, 'Rip open a magma fissure. Everything nearby burns.', { isDraggable: true, legacy: true, eventKind: 'disaster' }),
  P('EARTHQUAKE', 'Earthquake', 'terrain', 24, 7, 'The ground shakes and cracks. Buildings collapse and creatures are hurt.', { eventKind: 'disaster' }),
  P('LAVA_FLOW', 'Lava Flow', 'terrain', 26, 3, 'A river of molten rock creeps downhill, burning everything it touches before it cools.', { eventKind: 'disaster' }),
  P('SPRING', 'Create Spring', 'terrain', 10, 3, 'A spring bursts out and a river runs downhill. Land around it turns green.', { eventKind: 'miracle' }),

  // ---- nature ----
  P('DIVINE_RAIN', 'Life-giving Rain', 'nature', 10, 6, 'Soak the land: more moisture, flora and crops. Puts out fires.', { isDraggable: true, cursor: 'cell', legacy: true, eventKind: 'blessing' }),
  P('PLANT_FOREST', 'Plant Forest', 'nature', 12, 5, 'Trees and undergrowth spring up. Wildlife and farms thrive near forests.', { isDraggable: true, cursor: 'cell', eventKind: 'blessing' }),
  P('WARM_CLIMATE', 'Warm Climate', 'nature', 14, 10, 'Nudge the local climate warmer for a long while, then it slowly returns.', { eventKind: 'omen' }),
  P('COOL_CLIMATE', 'Cool Climate', 'nature', 14, 10, 'Nudge the local climate colder for a long while, then it slowly returns.', { eventKind: 'omen' }),
  P('CLEAR_SKIES', 'Clear Skies', 'nature', 10, 9, 'Calms storms, tornadoes, blizzards, swarms and flames in the area.', { eventKind: 'blessing' }),
  P('RAINBOW', 'Rainbow', 'nature', 6, 8, 'A gentle rainbow: creatures nearby feel joy and heal. Mortals will remember it.', { eventKind: 'miracle' }),
  P('AURORA', 'Aurora', 'nature', 8, 14, 'Curtains of light dance across the sky. A powerful omen for the superstitious.', { eventKind: 'omen' }),
  P('MAGIC_MUSHROOMS', 'Magic Mushrooms', 'nature', 8, 4, 'Glowing mushrooms sprout. Whoever wanders in sees things and dances about.', { eventKind: 'omen' }),

  // ---- blessings ----
  P('BLESSING', 'Holy Blessing', 'blessings', 6, 5, 'Heal all wounds, restore hunger and breath of mortals nearby.', { isDraggable: true, cursor: 'cell', legacy: true, eventKind: 'blessing' }),
  P('INSPIRATION', 'Divine Revelation', 'blessings', 25, 0, 'Inspire a civilization with sacred wisdom, jumping its technology forward.', { cursor: 'cell', legacy: true, eventKind: 'miracle' }),
  P('BOUNTIFUL_HARVEST', 'Bountiful Harvest', 'blessings', 14, 8, 'Crops and wild plants burst with fruit, granaries fill, hunger fades.', { eventKind: 'blessing' }),
  P('HEALING_SPRING', 'Healing Spring', 'blessings', 14, 5, 'A shimmering pool that heals everyone nearby and cures plague for a minute.', { eventKind: 'miracle' }),
  P('DIVINE_SHIELD', 'Divine Shield', 'blessings', 18, 6, 'A golden dome. Nothing inside can die or be harmed while it holds.', { eventKind: 'miracle' }),
  P('FERTILITY_BLESSING', 'Fertility Blessing', 'blessings', 12, 8, 'Mothers conceive far more readily and pregnancies go faster.', { eventKind: 'blessing' }),
  P('GIFT_OF_FIRE', 'Gift of Fire', 'blessings', 20, 0, 'Teach a civilization to master fire: a big tech boost, warmth and cooked food.', { cursor: 'cell', eventKind: 'miracle' }),
  P('GIFT_OF_TOOLS', 'Gift of Tools', 'blessings', 20, 0, 'Whispers of craft: a civilization researches much faster for a while.', { cursor: 'cell', eventKind: 'miracle' }),
  P('REVEAL_ORE', 'Revelation of Ore', 'blessings', 14, 8, 'Reveal mineral deposits hidden in the ground (and teach nearby people to look).', { eventKind: 'miracle' }),
  P('RESURRECTION', 'Resurrection', 'blessings', 30, 6, 'Raise the recently dead nearby. They wake up confused but whole.', { eventKind: 'miracle' }),
  P('GUARDIAN_SPIRIT', 'Guardian Spirit', 'blessings', 16, 4, 'A spirit follows the nearest mortal, shielding and healing those around them.', { eventKind: 'miracle' }),
  P('PROPHET', "Prophet's Voice", 'blessings', 22, 8, 'A mortal hears a voice from the heavens and becomes a prophet. What they make of it is up to them.', { eventKind: 'miracle' }),

  // ---- curses ----
  P('PLAGUE', 'Pestilence', 'curses', 18, 7, 'A deadly plague that spreads across mortals nearby.', { isDraggable: true, legacy: true, eventKind: 'curse' }),
  P('LIGHTNING', 'Lightning Bolt', 'curses', 5, 3, 'Smite with a bolt from heaven. May set things on fire.', { isDraggable: true, legacy: true, eventKind: 'curse' }),
  P('TORNADO', 'Tornado', 'curses', 24, 3, 'A roaming funnel that throws creatures into the air and flattens buildings.', { eventKind: 'disaster' }),
  P('WILDFIRE', 'Wildfire', 'curses', 20, 2, 'Fire spreads through forests, grass and wooden buildings until it burns out.', { eventKind: 'disaster' }),
  P('BLIZZARD', 'Blizzard', 'curses', 18, 8, 'A howling snowstorm. Freezes creatures and slowly cools the land.', { eventKind: 'disaster' }),
  P('ICE_AGE', 'Ice Age', 'curses', 40, 14, 'The climate plunges for a very long time. Forests become tundra.', { eventKind: 'curse' }),
  P('DROUGHT', 'Drought', 'curses', 16, 10, 'Rain stops. Moisture and flora wither, farms fail.', { eventKind: 'curse' }),
  P('LOCUSTS', 'Locust Swarm', 'curses', 20, 4, 'A buzzing cloud that devours flora and the harvest of farms.', { eventKind: 'disaster' }),
  P('FAMINE', 'Famine Curse', 'curses', 16, 8, 'Granaries rot, crops fail and mortals go hungry.', { eventKind: 'curse' }),
  P('BLIGHT', 'Crop Blight', 'curses', 14, 7, 'A creeping rot: crops die, farms decay and the harvest fails.', { eventKind: 'curse' }),
  P('ACID_RAIN', 'Acid Rain', 'curses', 18, 7, 'Burning rain that eats buildings, plants and skin.', { eventKind: 'disaster' }),
  P('BARRENNESS', 'Curse of Barrenness', 'curses', 14, 8, 'No children are conceived in the area for a long time.', { eventKind: 'curse' }),
  P('MADNESS', 'Madness', 'curses', 14, 5, 'Creatures go mad and attack whoever is nearest.', { eventKind: 'curse' }),
  P('HAUNT', 'Haunting', 'curses', 12, 6, 'Pale wisps terrify the living. They panic, tire and lose health.', { eventKind: 'omen' }),

  // ---- creatures ----
  P('MONSTER', 'Summon Dragon', 'creatures', 45, 0, 'A rare, powerful predator that breathes fire. It hunts anything, including cities.', { cursor: 'cell', eventKind: 'disaster' }),
  P('GIANT_GROWTH', 'Giant Growth', 'creatures', 10, 1.5, 'Make a creature huge: much more health and presence.', { cursor: 'cell', eventKind: 'miracle' }),
  P('SHRINK', 'Shrink', 'creatures', 8, 1.5, 'Make a creature tiny and fragile.', { cursor: 'cell', eventKind: 'curse' }),
  P('CHARM', 'Mind Control', 'creatures', 14, 5, 'Creatures nearby are charmed: they stop hunting and gather around the spot.', { eventKind: 'curse' }),
  P('SHAPESHIFT', 'Shapeshift', 'creatures', 16, 2.5, "Re-roll creatures' bodies: their genes mutate wildly. New shapes, new species.", { eventKind: 'miracle' }),

  // ---- chaos ----
  P('LIGHTNING_STORM', 'Lightning Storm', 'chaos', 26, 10, 'Thirty seconds of lightning, thunder and fires across the area.', { eventKind: 'disaster' }),
  P('GRAVITY_WELL', 'Gravity Well', 'chaos', 22, 7, 'Pulls everything toward a point, then flings it away.', { eventKind: 'disaster' }),
  P('TIME_BUBBLE', 'Time Bubble', 'chaos', 20, 7, 'Time runs several times faster inside: growth, breeding, aging, hunger.', { eventKind: 'omen' }),
  P('TELEPORT', 'Whirlwind', 'chaos', 12, 4, 'Whisks creatures away and drops them somewhere else entirely.', { eventKind: 'omen' }),
  P('FIREWORKS', 'Fireworks', 'chaos', 6, 7, 'Bursts of colour. Creatures nearby are overjoyed.', { eventKind: 'omen' }),

  // ---- cosmic ----
  P('METEOR', 'Meteor', 'cosmic', 35, 7, 'Obliterate the land with a burning meteor.', { legacy: true, eventKind: 'disaster' }),
  P('METEOR_SHOWER', 'Meteor Shower', 'cosmic', 38, 12, 'Many smaller impacts fall over half a minute.', { eventKind: 'disaster' }),
  P('SINGULARITY', 'Surface Rift', 'cosmic', 45, 5, 'Tear open a gravitational rift that vaporizes everything.', { legacy: true, eventKind: 'disaster' })
];

export const POWER_BY_ID = Object.fromEntries(POWER_LIST.map(p => [p.id, p]));
export const PLAYER_POWERS = POWER_LIST.filter(p => p.category !== 'tools');
