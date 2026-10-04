# Genesis & Cosmos — Life-Simulation Roadmap

Written 2026-10-04. Status: **order approved 2026-10-04. Done: 0 (quick fixes, space travel), 1 (infinite world), 2 (genetic life + sprites). Next: 3 (society AI).** Each sub-project below gets its own
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
2. **DONE - Genetic life**: genome, mating-only reproduction, recombination and mutation, automatic species clusters, and
   a procedural **sprite kit** (body/head/limbs/ears/tail/pattern/colour drawn by code into cached sprites) so every
   species is a gene-driven combination of parts. No random spawning.
3. **Society and behaviour AI**: needs plus personality (utility) with planning, jobs (farmer, builder, hunter, gatherer,
   guard, priest, scholar...), pair bonds and families, children who grow up, clans (kin groups that split when large),
   camps that grow into towns, **construction by builders in stages**, desire-path roads, farms near water.
4. **Beliefs and religions**: deity invention, rituals, shrines/temples built by priests, spread, schism and conflict;
   the player is unknown to mortals.
5. **Graphics for buildings and disasters**: procedural pixel-art building tiles per type/era/culture with construction
   stages; animated disaster effects (meteor streak and crater, shockwave, lava, lightning, flood, plague mist, quake).
6. **Space-faring civilizations**: tech to rockets, ships that carry real settlers to planets in the system, then to
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
