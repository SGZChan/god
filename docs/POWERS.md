# God powers: design note

Written 2026-10-04. The player found the original powers "kinda boring": a dozen instant buttons that each did one
thing once. This note records what we learned about why god-game powers are fun and what we built.

## Research

| Source | What it says | What we took from it |
|---|---|---|
| [Best god games 2026 (PCGamesN)](https://www.pcgamesn.com/best-god-games-pc), [God game (Wikipedia)](https://en.wikipedia.org/wiki/God_game) | The charm is watching small choices ripple through a living simulation: raise a hill, reroute a river, bless a village, then watch the systems react. | A power is a *cause*, not an animation. Every power changes tiles, creatures or civilizations, and the simulation answers (fires spread, farms fail, mothers conceive more). |
| [WorldBox - God Simulator (NME)](https://www.nme.com/features/gaming-features/worldbox-god-simulator-offers-a-more-casual-take-on-armageddon-3153086) | Tactile, sandbox powers; setting up dominoes and watching them topple is half the fun; benevolent or evil is the player's choice. Ice and snow that change a region's temperature are a favourite. | Many small distinct powers in both directions, climate powers that really change temperature and biomes, and creatures/monsters that cause chain reactions. |
| [From Dust (Wikipedia)](https://en.wikipedia.org/wiki/From_Dust) | The god manipulates the flow of lava, soil and water; the fun is in shaping flows (and losing control of them). | Powers that *move*: lava flows downhill and cools, rivers run to the sea, fire spreads, a tornado roams, locusts chase the greenest field. |
| Black & White (see the PCGamesN list above) | Miracles and a disembodied hand: the god is visible to followers, who react to what the god does. | Miracles are events mortals can see: every power pushes an event on the world event bus, which the upcoming religion system will interpret (mortals never learn about the player). |
| [RimWorld AI storytellers (wiki)](https://rimworldwiki.com/wiki/AI_Storytellers) | A storyteller paces events: tension, then breathing room; event rate depends on how the colony is doing; randomness can be gentle (Phoebe) or cruel (Randy). | Natural disasters happen on their own at a low, seeded rate (mean one per ~4 minutes of simulated time), are placed near the living world so they are noticed, and can be switched off. |
| Dwarf Fortress, Populous, Ultimate Sandbox (general design knowledge) | Consequences that cascade (fire, flood, madness), and divine "terraform" tools that are cheap while the destruction is expensive. | Divine energy (optional): bigger powers cost more and it refills over time. Sandbox mode (default) removes the limit so nothing frustrates the player. |

Two ideas drove the choices:

1. **Variety of verb.** Not "damage" ten ways. Powers heal, reveal, shield, charm, teleport, scale bodies, bend time,
   change climate, resurrect, create life and kill it. Good and bad powers are equally rich.
2. **Time.** Most of the new powers are *active effects* that live for seconds or minutes (a tornado that roams, a fire
   that spreads and burns out, a blizzard that cools the land and then thaws). The world is never "done" reacting.

## What was built

* `src/god/powerCatalog.js` - metadata for every power (name, category, cost, radius, tooltip, icon id).
* `src/god/powerEffects.js` - instant casts and the handlers of long-running effects.
* `src/god/effects.js` - `ActiveEffects`, owned per planet (`terrain.effects`), updated every fixed simulation step,
  saved as the `effects` array of the sim save. Also rolls natural disasters from the seeded RNG.
* `src/god/events.js` - the world event bus (see below).
* `src/art/effects.js` - the animated canvas effect library (ground, sky and creature-aura layers, additive
  blending, hash-driven particles that cost nothing when off screen); `src/art/powerIcons.js` - drawn icons.
* `src/ui/powerPalette.js` - the categorized palette (tabs, scrolling icon grid, search, tooltips, hotkeys 1-9 on the
  surface, energy meter, menu toggles for sandbox and natural disasters).

### Powers (54, of which 42 are new)

Terrain: Raise Mountains, Carve Ocean Basin, Tsunami, Volcano, **Earthquake, Lava Flow, Create Spring**.
Nature: Life-giving Rain, **Plant Forest, Warm Climate, Cool Climate, Clear Skies, Rainbow, Aurora, Magic Mushrooms**.
Blessings: Holy Blessing, Divine Revelation, **Bountiful Harvest, Healing Spring, Divine Shield, Fertility Blessing,
Gift of Fire, Gift of Tools, Revelation of Ore, Resurrection, Guardian Spirit, Prophet's Voice**.
Curses: Pestilence, Lightning Bolt, **Tornado, Wildfire, Blizzard, Ice Age, Drought, Locust Swarm, Famine Curse,
Crop Blight, Acid Rain, Curse of Barrenness, Madness, Haunting**.
Creatures: **Summon Dragon, Giant Growth, Shrink, Mind Control, Shapeshift**.
Chaos: **Lightning Storm, Gravity Well, Time Bubble, Whirlwind, Fireworks**.
Cosmic: Meteor, **Meteor Shower**, Surface Rift (plus the asteroid and black hole buttons next to the palette).
(Bold = new.) Creatures can still only be placed directly through the God Workshop, except the Dragon.

## World event bus (contract for the religion system)

`ecosystem.worldEvents` is an array capped at 200 (oldest dropped), saved with the world. Each entry:

```js
{ id: 'ev_17', kind: 'blessing'|'curse'|'disaster'|'miracle'|'omen', name: 'Tornado',
  x, y,            // tile coordinates (centre)
  radius,          // tiles
  time,            // ecosystem.timeYears when it happened
  source: 'god'|'nature',
  magnitude }      // 0.05 .. 1, from the power's cost (natural disasters are scaled down)
```

Every successful cast pushes one (`castPower` in `powerEffects.js`); natural disasters push the same shape with
`source: 'nature'`. `pushWorldEvent(ecosystem, ...)` in `events.js` is the single entry point. A failed cast (for example
"no mortal here can hear the voice") pushes nothing.

## Rules of the implementation

* All simulation randomness uses `random()`; visuals use `Math.random()` or hashes. Effect state is plain JSON.
* Climate powers apply *relative* nudges to temperature/moisture that sum back to zero when they end, so they compose
  with each other and the land returns to normal.
* Statuses on creatures (`ent.status`: shield, joy, mad, charm, haunt, shroom, fertile, barren, burning) are saved with the
  creature. A shield prevents death (except old age) and building damage inside its dome.
* `Revelation of Ore` feature-detects the resource system (`terrain.revealDeposits`, `terrain.getDeposit`, `tile.resource`).
  Without one it still teaches nearby civilizations a little and shows the glint.
