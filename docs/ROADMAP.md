# Genesis & Cosmos — Life-Simulation Roadmap

Written 2026-10-04. Status: **order approved 2026-10-04. Done: 0 (quick fixes, space travel), 1 (infinite world, now a finite planet: 1b), 2 (genetic life + sprites), 3 (society: clans, jobs, economy, construction by builders, exploration), 5 (building and disaster graphics), 4 (beliefs and religions), 6 (space-faring civilizations). All sub-projects are done.** Each sub-project below gets its own
spec → plan → build → browser-verification cycle (see `docs/superpowers/`). Earlier work (Phases 1-3) is described in
`docs/superpowers/specs/2026-10-04-simulation-persistence-ui-design.md`.

## What the player reported (verbatim themes)
1. Creature AI is bad: buildings appear on water and at random, no towns, no roads.
2. Creature models: make sprites; every species is a random combination of sprite parts.
3. World should be bigger, infinite like Minecraft.
4. Buildings and disasters should be graphics, not emoji.
5. Buildings must be built by creatures. Nothing just appears: creatures reproduce by mating, they do not spawn.
6. Creatures need jobs, families, clans, evolution/adaptation, and beliefs. They do not know about the player, so they
   invent their own gods and religions.
7. Space navigation should be easier, including travel between galaxies.
8. Spawning a black hole in one system must not spawn it in every system.
9. Civilizations should discover space travel and visit planets, systems and galaxies.
10. Base all of it on research into how life, AI and evolution work.

## Research findings and what they mean for the design

| Topic | Finding | Design consequence |
|---|---|---|
| Agent decision-making | Utility / needs-based AI re-scores actions every moment (Sims style); GOAP chains actions towards a goal by planning over preconditions and effects; hybrids of the two are common ([Game AI Planning: GOAP, Utility, and Behavior Trees](https://tonogameconsultants.com/game-ai-planning/), [GOBT hybrid](https://www.jmis.org/archive/view_article?pid=jmis-10-4-321)). | Creatures pick a goal by **utility** (needs, personality, job, clan orders) and reach it with a small **planner** (e.g. build a house = fetch wood, haul it, place blocks). |
| Settlements and roads | Believable settlements come from agents that build using influence maps (attraction/repulsion to water, roads, centre) and decentralised iterative planning; roads are laid by agents too ([AgentCraft](https://escholarship.org/content/qt83p272pq/qt83p272pq.pdf), [Believable Minecraft Settlements](https://arxiv.org/pdf/2309.10871), [Villages and road systems](https://www.researchgate.net/publication/330945485_Procedural_Content_Generation_of_Villages_and_Road_System_on_Arbitrary_Terrains)). | A clan founds a **camp** near water and food; builders choose plots from a scored **influence map**; the tiles people walk most become **roads** (desire paths); roads are also planned between town centres. Buildable-terrain rule: never on water. |
| Religion | Cognitive science of religion: people over-detect agency (HADD) and remember **minimally counterintuitive** agents (mostly normal, one violated expectation); such agents become gods when they explain events and carry moral meaning ([Cognitive science of religion](https://en.wikipedia.org/wiki/Cognitive_science_of_religion), [Boyer](https://mythlok.com/experts/pascal-boyer/)). | Each clan **invents deities** from events it experienced (storm, famine, volcano, a miracle caused by the player). A god = domain x one counterintuitive trait. Beliefs spread through contact, split into schisms and compete. The player is never known. Player powers are interpreted as acts of the clan's own gods. |
| Evolution and speciation | Populations diverge through mutation, drift and selection; reproductive isolation appears as a by-product after geographic separation, and recombination plus assortative mating decide whether incipient species merge or split ([allopatric speciation GA](https://oak.conncoll.edu/parker/papers/CEC2019.pdf), [isolation as a by-product](https://onlinelibrary.wiley.com/doi/pdfdirect/10.1111/j.0014-3820.2003.tb00233.x)). | Species are **not a fixed list**. Every creature carries a genome; offspring = recombination + mutation of two parents; mates are chosen by genome similarity. A **species** is a cluster of interbreeding genomes, named automatically when it splits off. Biome, climate and isolation drive adaptation. |
| Infinite worlds | Seed an RNG per chunk from (world seed, chunk x, chunk y); use continuous noise so chunks line up; regenerate chunks identically when revisited, so only player/sim changes need saving ([Atomic Object](https://spin.atomicobject.com/infinite-procedurally-generated-world/), [Minecraft terrain generation](https://cybrancee.com/blog/how-minecraft-terrain-generation-works/)). | Chunked world (e.g. 32x32 tiles), streamed around the camera, **save only deltas** (changed tiles, structures, creatures). Only chunks near the camera run the full simulation; distant settlements are simulated at settlement level. |

## Sub-projects

Dependencies: 3 needs 1 and 2; 4 needs 3; 5 needs 3; 6 needs 3 and 4. Sub-project 0 is independent.

0. **DONE - Quick fixes and easier space travel** (small): black hole spawns only in the current system; guard against
   building on water now; click-to-fly navigation, breadcrumb/back, search and a minimap; a universe of several galaxies
   with galaxy-to-galaxy travel.
1. **DONE - Infinite world**: chunk streaming, seeded terrain/biomes/rivers/lakes, camera-driven loading, delta saves,
   buildable-terrain map.
1b. **DONE - Planet-sized world and resources**: the infinite map became a finite planet (width = round(1024 x radius), height =
   width / 2, no wrap; deep ocean east/west, ice caps at the poles), latitude-driven climate, continents, islands, rivers,
   a deterministic temperate start area, 19 resources (wood to uranium, tiers 0-4) with a documented terrain API
   (getDeposit / extract / findNearestDeposit / regrow), a Resources lens (key R), trees, a minimap with lat/lon and a
   low-resolution far-zoom view.
2. **DONE - Genetic life**: genome, mating-only reproduction, recombination and mutation, automatic species clusters, and
   a procedural **sprite kit** (body/head/limbs/ears/tail/pattern/colour drawn by code into cached sprites) so every
   species is a gene-driven combination of parts. No random spawning.
3. **DONE - Society and behaviour AI** (2026-10-05, see "Society" below): needs plus personality (utility) with planning, jobs (farmer, builder, hunter, gatherer,
   guard, priest, scholar...), pair bonds and families, children who grow up, clans (kin groups that split when large),
   camps that grow into towns, **construction by builders in stages**, desire-path roads, farms near water.
4. **DONE - Beliefs and religions** (src/civilization/religion.js): deity invention, rituals, shrines/temples built by priests, spread, schism and conflict;
   the player is unknown to mortals.
5. **DONE - Graphics for buildings and disasters** (src/art/buildingArt.js, buildingRenderer.js, effects.js): procedural pixel-art building tiles per type/era/culture with construction
   stages; animated disaster effects (meteor streak and crater, shockwave, lava, lightning, flood, plague mist, quake).
6. **DONE - Space-faring civilizations** (src/civilization/spaceflight.js): tech to rockets, ships that carry real settlers to planets in the system, then to
   other systems and galaxies; new colonies founded by the arrivals.

## Recommended order
0 (quick wins, independent) -> 1 -> 2 -> 3 -> 5 -> 4 -> 6.
Graphics (5) comes before religion (4) because buildings under construction are the most visible change to the
player; both depend on 3.

## Constraints that apply to every sub-project
- No external art assets: sprites are generated by code at runtime and cached. (No art tools are available, and this
  is what lets genes drive appearance.)
- Same-seed determinism and saves must keep working (Phase 2 rules: simulation randomness goes through
  `src/simulation/random.js`).
- Each sub-project ends with unit tests, a browser check with screenshots, and a performance check on the surface view.
- Realistic limits: a few hundred fully simulated creatures at once; everything beyond the camera is simulated in
  aggregate.

## Progress notes
- 0: black holes/asteroids and planets are cached per star system; Universe of 6 galaxies (home galaxy keeps old ids), clickable star nodes, breadcrumb, keys 1-4/Backspace, galaxy picker; central `isBuildable` rule. Tests: tests/space_test.js, scripts/smoke_space.mjs.
- 1: chunked infinite terrain (src/world/*, src/planet/terrain.js), delta saves (save version 2, storage key genesis-cosmos-save-v2), chunk-layer renderer. Continental drift removed. Tests: tests/world_test.js, scripts/smoke_world.mjs.
- Known: civs still fill every claimed tile with a building (the "chaos town" problem) until sub-project 3.
- 2: diploid genomes (src/life/genome.js), species as interbreeding clusters (src/life/species.js: new species need a founding group of 4), sexes/mating/pregnancy/birth (nothing spawns after the first generation; founders only), needs-based utility brain (src/life/entity.js), spatial grid, heap A*, off-screen breeding and evolution for the catch-up engine, sprite kit (src/art/*, dev sheet at /dev/sprites.html). Tests: life_test, ecology_test, art_test, pathfinding_test. Soak tool idea: simulate 2400 s and watch populations; findings: speciation works (1-4 new species per 600 years), predators boom and bust and often go extinct, one herbivore tends to dominate (shared 700-creature safety cap), sapients survive thanks to granary eating near the capital and settlement protection.
- Known gaps for sub-project 3: sapients still graze wild flora and eat from an abstract granary (no farms/jobs), civ buildings fill every claimed tile in a checkerboard, no families/clans/religion yet, creature sprites for sapients have no clothing or clan colours.
- 1b: finite planet (src/world/generator.js: planetSize, climate, edges, findHome), resources (src/world/resources.js: catalog, ore veins per 64x64 cell,
  biome rules; API documented at the top of src/planet/terrain.js), save version 3 (key genesis-cosmos-save-v3), overview/LOD blocks
  (src/world/overview.js), resource icons and trees (src/art/resourceIcons.js), minimap + lens panel (src/ui/minimap.js, resourceLens.js).
  Tests: tests/planet_test.js, tests/resources_test.js; tools: scripts/mapcheck.mjs (land/biome/resource histogram), scripts/smoke_world.mjs.
  Known: renewables regrow only while their chunk is loaded; god powers that reshape terrain leave deposits where they were (e.g. a tree on newly flooded
  tile); the overview/minimap shows generated terrain, not god-power edits; creatures do not use resources yet (sub-project 3 builds on the API).
- Powers: categorized palette, 54 powers, ActiveEffects manager, world event bus (docs/POWERS.md). Tests: tests/powers_test.js, scripts/smoke_powers.mjs.


## Buildings (sub-project 5, first half: DONE 2026-10-04)

Buildings are now real multi-tile objects (huts 2x2, houses 3x3, halls 4-5x3, temples 4x4, keeps 6x6, 1x1 wall pieces and gates), drawn as large
pixel-art sprites in the style of the reference scene (stone brick with crenellated tops, log palisades with ring-log ends, dirt roads),
depth-sorted with creatures. A house is ~60 px tall next to a 20 px creature. Town layout is an INTERIM planner
(`src/civilization/townPlanner.js`) that the society agent should replace with creatures that really build.

**For the society/economy agent - API summary**
- Catalogue and helpers: `src/world/buildings.js` (`BUILDING_TYPES[id]`: category, w/h, tier = ERAS index 0..5, `cost` {resource: n}, `work`, `capacity`,
  `door`, `solid`, `health`; `doorTile(b)`, `frontTile(b)`, `missingMaterials(b)`, `typesForTier(t)`; `ROAD_KINDS`).
- Terrain (`src/planet/terrain.js`, documented in its header): `canPlaceBuilding(type,x,y)`, `placeBuilding(type,x,y,{civId,clanId,progress,style})`
  (progress 0 = a construction site), `deliverMaterial(id,res,n)` (records `building.delivered`), `advanceConstruction(id,work)` (true when complete),
  `damageBuilding` / `repairBuilding` / `removeBuilding(id,{ruins})`, `getBuildingAt`, `buildingsInRect`, `buildingsOfCiv`, `setRoad(x,y,kind)`, `isSolid`.
- Walking: completed buildings block every footprint tile except the door (`tile.structure.solid`); sites, fields, ruins, markets and quarries are open.
  A* (`ai/pathfinding.js`) and `Entity.moveAlongPath` respect this, roads are cheaper (0.82 dirt, 0.74 gravel, 0.67 cobble), a creature caught inside a
  newly finished building can still walk out. Aim paths at `frontTile(b)` / `doorTile(b)`.
- `tile.structure` = `{type, buildingId, ox, oy, anchor, name, icon, health, solid}`; old one-tile structures (type `ruins`, no buildingId) remain only for legacy code.
- Persistence: tile.structure/tile.road are tile deltas, the registry is saved in the terrain section (`buildings`, `nextBuildingId`); SAVE_VERSION unchanged
  (older v3 saves load without buildings and the civ gets a hall via `expandTerritory`).
- Planner hooks: `initTown` (initDefaultCivs, ruins rebirth, expandTerritory when `civ.town` is missing), `tickTown` (Civilization.update). Replace
  these calls; `civ.town` is plain JSON saved with the civ. `civ.capitalX/Y` is now the road tile in front of the hall door.
- Art: `art/buildingSprites.js` (`composeBuilding`, `getBuildingCanvas`, stages/damage/hooks for smoke and fire), `art/buildingRenderer.js`,
  `art/roadTiles.js`. Dev sheets: `dev/buildings.html` (`SHEET=buildings node scripts/spritesheet.mjs <url> out.png`) and the browser-free
  `node scripts/buildingsheet.mjs out.png [pal] [progress] [damage] [snow] [scale] [types]`. Browser check: `scripts/smoke_buildings.mjs`.
- Rules of thumb: metals, coal, gems, oil and uranium deposits are never built over (mines and quarries may); stone/flint scatter and trees may be.


## Society (sub-project 3: DONE 2026-10-05)

Sapients now live in a society. A civilization is a **network of settlements** (the capital plus hamlets that clans found), each with a
stockpile, houses, fields and a town plan. People have **jobs** assigned by what their settlement lacks, **carry goods** from the world
into stockpiles into buildings, and **build every building themselves**. Nothing is placed for free (the old interim planner now only
chooses sites).

**Data model** (all plain JSON, saved with the civ/entity/building; helpers in `src/civilization/`)
- `civ.settlements[]` = `{ id, civId, name, x, y, capital, stock:{item:n}, town:{cx,y0,rx,ready,cooldown}, roadQueue:[{x,y,kind}], population, adults, homeless, jobs:{}, demand:{}, need:{}, shortage:{}, blocked:{} }` (settlements.js). `civ.town` is a getter for `settlements[0].town`.
- `civ.clans[]` = `{ id, name, color, banner:{shape,glyph}, leaderId, civId, settlementId, memberIds[], parentClanId, founded, beliefs:{} }` (clans.js). `beliefs` is an empty placeholder for the religion system; nothing in society reads or writes it. `ecosystem.worldEvents` is not touched.
- `civ.knownDeposits[]` = `{type,x,y}` (same format the Revelation of Ore power writes), `civ.discovered[]`, `civ.explored[]` (indices of explored 16x16-tile cells), `civ.output{}` (cumulative production, gates eras), `civ.clock`, `civ.eraFloor`.
- `entity`: `clanId, settlementId, mateId, homeId (building id), guardianId, job, task{kind,...}, inventory{item:n}, activity`.
- `building`: `settlementId, residents[]` (housing), `growth` (fields and pens 0..1), `fails/blockedUntil` (unreachable sites).
- `civ.food` is the aggregate of the stockpiles' food x 4 (`economy.syncFood` reconciles powers that write it; a famine deeper than the stores becomes food debt). `civ.prosperity` follows food per citizen. `civ.citizens/soldiers/techPoints/era/territory/piety` keep working. MAX_CITIZENS is only the fallback for civs without settlements; the real cap is housing (`settlements.popCap`: 8 + 1.5 x housing capacity + planned houses).

**Modules**
- `economy.js` items (the 19 resources + grain, meat, tools, pottery, bricks, cloth, bronze, iron_bar), recipes (`RECIPES`), stock/inventory helpers, food bookkeeping.
- `settlements.js` settlement creation/queries (`depotOf`, `buildingsOf`, `housingCapacity`, `popCap`, `foodCapOf`, `findHamletSite`). The depot is the finished hall/keep (or granary) front tile, else the settlement centre. There is no separate storehouse building type: the stockpile is a property of the settlement.
- `townPlanner.js` WHERE and WHAT to build: `initTown` (hall site + starter huts + a field; founders carry a starter kit), `foundHamlet`, `planSettlement`/`growTown`/`tickTown` (enqueue construction sites, never build; `{instant:true}` is for tests and dev tools only). Wishes follow housing, food, tier, discoveries and the next era's required buildings (buildings of the next era may be raised one era early). Plots are checked for foot reachability (rivers cut plots off). Streets are queued in `roadQueue` and paved tile by tile by builders; between settlements a road is planned with A*.
- `jobs.js` labour market (`assignJobs`: demand by settlement needs, aptitude from proficiencies, personality, genes, age), the work of each job as a multi-step task (gather -> carry -> drop, farm/pen cycles with seasons, hunt, build = fetch -> haul -> deliverMaterial -> advanceConstruction -> pave roads, craft = fetch -> make at a station -> store, scout, scholar, trader caravans, leader; `priest` is a placeholder never assigned). `sapientOptions` feeds the utility AI in `life/entity.js`.
- `families.js` pair bonds, households and homes (a couple + children per house, inheritance by the surviving household, evictions of the youngest when a house is overfull), orphan adoption, children fed from the stores, household conceptions.
- `clans.js` clans, leaders, splitting at `CLAN_SPLIT_SIZE` (14): a splinter of whole households carries supplies to a new hamlet and forms a daughter clan.
- `exploration.js` explored cells, discovery of ores by scouts, `nearestKnown`, notifications ("Valoria discovered copper").
- `techTree.js` `ERA_REQUIREMENTS`/`eraFor`/`missingForEra`: an era needs research points AND discovered ores, finished key buildings and produced goods (bronze needs copper+tin, a kiln, a smithy and bronze made; iron needs iron+coal, a market and iron bars; ...). `ERAS`, `getEraForPoints` are unchanged. Reborn civs keep `eraFloor`.
- `society.js` `SocietyManager.tickCiv` (1 Hz economy tick), `tickFamilies` (every 3 s), desire paths (`footstep`: 26 footsteps wear a tile into a dirt road), `splitClans`, `sendSettlers`.
- Art: `art/creatureSprite.js` `getCreatureCanvas(traits, frame, {clanColor, tool})` draws a clan headband and sash plus a hand tool (hoe, axe, pick, hammer, mallet, spear, staff, crook, rod, basket, sack, scroll), cached by (traits, frame, clan colour, tool); the renderer also draws a coloured bundle on the back of anyone carrying goods. UI: overview shows settlements, clans, jobs, stockpile, discovered resources, explored %, the next era's needs and the season; the inspector has a Society section (job, doing, clan, settlement, home, mate, parents, children, load).

**Other behaviour changes**: sapients walk on land only (A* `landOnly`); a roof reduces thermal stress (homeless feel the full cold); citizens eat from the settlement stores and graze wild plants only when starving; guards execute heretics only in theocracies (criminals as before); pair bonds are exclusive; `MAX_ENTITIES` 900 with a separate `MAX_ANIMALS` 560 so a society and nature do not crowd each other out; ruins are only reborn by nomads or the last survivors of a dying nation; smithy moved to the Bronze Age (no iron in its cost).

**Verification**: tests/society_test.js (122 checks), the whole suite is green; scripts/smoke_society.mjs (browser), scripts/soak_society.mjs (headless soak, numbers below); `node scripts/run_tests.mjs` runs every test file even after a failure.

**Known gaps / hooks**: no walls or palisades yet (the old ring planner is gone; walls were "later"); trade only moves goods between a civ's own settlements (a `trader` task could target a friendly civ's depot: the hook is `stepTrader`); no storehouse building type (stock is per settlement); the offscreen catch-up engine does not simulate the economy (eras advance there only if requirements are already met); settlers and scouts cannot cross rivers or seas (no bridges/boats); religion is untouched (`clan.beliefs`, the `priest` job and shrines/temples are for the next agent); the planner never builds shrines, temples, cathedrals or graveyards.
- UI pass (2026-10-04): the power bar, hint banner and toasts belong to the surface only (body[data-view] in style.css), so the
  Descend button is never covered; cosmic events moved onto the planet card in the system view. The surface starts with its
  side panels hidden (panels button / H), world news goes to the overview's event log instead of pop-ups, the hint banner
  only flashes when the power changes, and every window closes with Esc or a backdrop click. The inspector no longer loses
  clicks on its close button while it redraws. Workshop rebuilt (src/workshop/creator.js): sprite previews, talents,
  founders count, gene-driven look; champions use Laya AI (src/ai/layaEngine.js, formerly JEV; old saves are migrated).
- Laya AI (2026-10-04): champions run a deterministic port of the Laya pipeline (github.com/aayushch/laya, Apache-2.0):
  world events and conditions near the champion become routed Action Cards (personas Builder/Herald/Warden/Envoy/Elder/
  Keeper = Laya's Engineer/Comms/Ops/Sales/HR/Finance), the player approves or dismisses them in the inspector, persona
  trust learns from those choices, and an Omni summary shows Attention/Recent/Milestones. Champions are sacred to soldiers,
  have triple health, eat and pray when needed. Tests: tests/laya_test.js. Follow button toggles and no longer leaks
  clicks to the map.
- 4: religions (src/civilization/religion.js, tests/religion_test.js). A people's first deity comes from the land around its
  capital; world events near a clan (god powers and disasters) are read as the work of a deity of the matching domain, add a
  deity to the pantheon (max 4) or found a new faith. A deity = domain + one counterintuitive trait. Faith spreads by contact
  (the more devout convert the less; priests and champions are persuasive), children take their clan's faith, priests (new
  job) lead rites at shrines/temples, settlements with a faith plan a shrine (now a Stone Age building), temple and cathedral,
  old faiths over several clans split into sects, and different faiths between devout neighbours can start holy wars.
  The player is never named. Saved in the planet's society block (religions, faithSeq) and entity.faithId.
- 6: spaceflight (src/civilization/spaceflight.js, tests/spaceflight_test.js). A civilization in the Spaceflight Age with a
  finished spaceport launches a ship every 90 simulated seconds (when it has 14+ citizens): six adults (half women, never
  champions or soldiers) leave the planet carrying genomes, personalities, talents and faith. main.js flies the voyage
  (same system ~8 years, another star ~50 years; ships drawn in the system view), lands it on the target planet's
  simulation or keeps it in pendingColonies until that planet is loaded, and saves voyages/pending colonies with the game.
  On landing the settlers found "New <homeland>" with their era and faith. The Starward Vision cosmic power lifts a people
  into the Spaceflight Age and raises its spaceport.
- 5: confirmed done (procedural building sprites with construction stages, animated power/disaster effects); the last emoji
  in the world view (tombstones, legacy structure markers, the capital crown) are now drawn shapes.
