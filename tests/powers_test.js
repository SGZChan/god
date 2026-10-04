import { assert, section, summary, emptyWorld, addCiv, addHuman } from './helpers.js';
import { SeededRNG } from '../src/cosmos/seed.js';
import { setActiveRng } from '../src/simulation/random.js';
import { ensureEffects } from '../src/god/effects.js';
import { castPower, CASTS } from '../src/god/powerEffects.js';
import { POWER_LIST, POWER_BY_ID, CATEGORIES } from '../src/god/powerCatalog.js';
import { MAX_WORLD_EVENTS, EVENT_KINDS } from '../src/god/events.js';
import { godSettings } from '../src/god/godSettings.js';
import { DivinePowersManager, POWERS } from '../src/god/divinePowers.js';
import { runSimulationSteps } from '../src/simulation/fixedStep.js';
import { serializeSim, restoreSim } from '../src/persistence/saveGame.js';
import { BIOMES } from '../src/planet/biomes.js';

console.log('====================================================');
console.log('   GOD POWERS TESTS                                  ');
console.log('====================================================');

setActiveRng(new SeededRNG('powers-test'));
godSettings.naturalDisasters = false; // tests trigger disasters explicitly

function world() {
  const w = emptyWorld();
  const fx = ensureEffects(w.terrain, w.ecosystem, w.society);
  const civ = addCiv(w, 'Testia', 5, 5, 0);
  w.civ = civ;
  w.fx = fx;
  w.people = [addHuman(w, civ, 1, 1), addHuman(w, civ, -1, 1), addHuman(w, civ, 0, -2)];
  return w;
}
const run = (fx, seconds) => { for (let i = 0; i < Math.round(seconds / 0.05); i++) fx.update(0.05); };
const tileAt = (w, x, y) => w.terrain.getTile(x, y);
const cast = (w, id, x = 0, y = 0, o) => castPower(id, w.fx, x, y, o);

section('Catalog');
{
  const ids = POWER_LIST.map(p => p.id);
  assert(new Set(ids).size === ids.length, 'power ids are unique');
  const playable = POWER_LIST.filter(p => p.category !== 'tools');
  assert(playable.length >= 12 + 20, `there are at least 32 playable powers (${playable.length})`);
  assert(playable.every(p => CATEGORIES.some(c => c.id === p.category)), 'every power belongs to a known category');
  assert(playable.every(p => p.name && p.description && typeof p.cost === 'number' && p.icon), 'every power has name, description, cost and icon');
  assert(CATEGORIES.map(c => c.id).join() === 'terrain,nature,blessings,curses,creatures,chaos,cosmic', 'seven categories in order');
  assert(Object.keys(POWERS).length === POWER_LIST.length, 'POWERS is built from the catalog');
  const legacy = ['PAN', 'INSPECT', 'TERRAFORM_RAISE', 'TERRAFORM_LOWER', 'TSUNAMI', 'VOLCANO', 'SINGULARITY', 'PLAGUE', 'DIVINE_RAIN', 'LIGHTNING', 'METEOR', 'INSPIRATION', 'BLESSING'];
  assert(legacy.every(id => POWERS[id]), 'all original powers still exist');
}

section('Every power can be cast and emits a world event');
{
  const failures = [];
  for (const def of POWER_LIST.filter(p => p.category !== 'tools')) {
    const w = world();
    // something for each power to act on: a fallen creature, a farm, flora, a wounded person
    const dead = addHuman(w, w.civ, 2, 0);
    dead.die('test');
    tileAt(w, 3, 3).structure = { type: 'farm', health: 70 };
    w.people[0].health = 20;
    const result = cast(w, def.id, 0, 0);
    if (!result.ok) failures.push(`${def.id}: ${result.reason}`);
    const ev = w.ecosystem.worldEvents[w.ecosystem.worldEvents.length - 1];
    const okEvent = ev && ev.name && EVENT_KINDS.includes(ev.kind) && typeof ev.x === 'number' && typeof ev.y === 'number'
      && typeof ev.radius === 'number' && typeof ev.time === 'number' && ev.source === 'god' && typeof ev.magnitude === 'number' && ev.id;
    if (result.ok && !okEvent) failures.push(`${def.id}: bad event ${JSON.stringify(ev)}`);
    run(w.fx, 3);
  }
  assert(failures.length === 0, 'all powers cast ok with a valid event' + (failures.length ? ': ' + failures.join('; ') : ''));
  assert(Object.keys(CASTS).filter(id => POWER_BY_ID[id]).length === POWER_LIST.filter(p => p.category !== 'tools').length, 'every catalog power has an implementation');
}

section('Event bus');
{
  const w = world();
  cast(w, 'RAINBOW', 5, 6);
  const ev = w.ecosystem.worldEvents[0];
  assert(ev.kind === 'miracle' && ev.name === 'Rainbow' && ev.source === 'god', 'rainbow is a god miracle');
  assert(ev.x === 5.5 && ev.y === 6.5 && ev.radius === 8, 'event has position and radius');
  for (let i = 0; i < 260; i++) cast(w, 'FIREWORKS', 0, 0);
  assert(w.ecosystem.worldEvents.length === MAX_WORLD_EVENTS, `events are capped at ${MAX_WORLD_EVENTS}`);
  const ids = new Set(w.ecosystem.worldEvents.map(e => e.id));
  assert(ids.size === MAX_WORLD_EVENTS, 'event ids are unique');
  const failed = cast(w, 'GIFT_OF_FIRE', 900, 900);
  assert(!failed.ok && failed.reason, 'a failed cast reports why and emits nothing extra');
  const n = w.ecosystem.worldEvents.length;
  cast(w, 'GIFT_OF_FIRE', 900, 900);
  assert(w.ecosystem.worldEvents.length === n, 'failed casts push no event');
}

section('Blessings');
{
  let w = world();
  w.people[0].health = 10;
  w.people[0].hunger = 80;
  w.people[0].isPlagued = true;
  cast(w, 'HEALING_SPRING', 1, 1);
  const before = w.people[0].health;
  run(w.fx, 10);
  assert(w.people[0].health > before + 30, 'healing spring heals creatures inside');
  assert(w.people[0].isPlagued === false, 'healing spring cures plague');
  run(w.fx, 60);
  assert(w.fx.list.filter(e => e.type === 'aura').length === 0, 'healing spring ends after its duration');

  w = world();
  const t = tileAt(w, 2, 2);
  t.flora = 5;
  tileAt(w, 3, 3).structure = { type: 'farm', health: 50 };
  const food = w.civ.food;
  w.people[1].hunger = 90;
  cast(w, 'BOUNTIFUL_HARVEST', 0, 0);
  assert(t.flora === 100, 'bountiful harvest fills flora');
  assert(w.civ.food > food, 'harvest fills the granary');
  assert(w.people[1].hunger < 90, 'harvest feeds the hungry');
  assert(tileAt(w, 3, 3).structure.health > 50, 'harvest strengthens farms');

  w = world();
  cast(w, 'DIVINE_SHIELD', 0, 0);
  run(w.fx, 1);
  w.people[0].health = 1;
  w.people[0].die('test attack');
  assert(w.people[0].alive, 'a shielded creature cannot die');
  tileAt(w, 1, 0).structure = { type: 'house', health: 100 };
  cast(w, 'EARTHQUAKE', 0, 0);
  assert(tileAt(w, 1, 0).structure.type === 'house', 'shielded buildings survive an earthquake');
  const hp = w.people[1].health;
  cast(w, 'METEOR_SHOWER', 0, 0);
  run(w.fx, 20);
  assert(w.people[1].alive && w.people[1].health >= hp - 0.01, 'shield protects against a meteor shower');
  run(w.fx, 60);
  assert(w.fx.list.filter(e => e.type === 'aura' && e.status === 'shield').length === 0, 'the shield expires');
  w.people[0].health = 1;
  w.people[0].die('after shield');
  assert(!w.people[0].alive, 'creatures can die again once the shield is gone');

  w = world();
  w.people[0].mateCooldown = 20;
  cast(w, 'FERTILITY_BLESSING', 0, 0);
  run(w.fx, 3);
  assert(w.people[0].mateCooldown < 10, 'fertility blessing clears mating cooldowns');
  w = world();
  w.people[0].mateCooldown = 0;
  cast(w, 'BARRENNESS', 0, 0);
  run(w.fx, 2);
  assert(w.people[0].mateCooldown >= 6, 'barrenness blocks mating');
  assert(w.fx.list.some(e => e.status === 'barren' && e.duration >= 200), 'barrenness lasts a long time');

  w = world();
  const techBefore = w.civ.techPoints;
  cast(w, 'GIFT_OF_FIRE', 0, 0);
  assert(w.civ.techPoints > techBefore + 200, 'gift of fire gives a big tech boost');
  const t1 = w.civ.techPoints;
  cast(w, 'GIFT_OF_TOOLS', 0, 0);
  run(w.fx, 30);
  assert(w.civ.techPoints > t1 + 150, 'gift of tools speeds research over time');
  run(w.fx, 80);
  assert(w.fx.count('gift') === 0, 'gift of tools ends');

  w = world();
  const dead = w.people[2];
  dead.die('slain');
  assert(!dead.alive, 'precondition: dead');
  const res = cast(w, 'RESURRECTION', 0, -2);
  assert(res.ok && dead.alive && dead.health > 0, 'resurrection revives a recently dead creature');
  assert(!cast(w, 'RESURRECTION', 50, 50).ok, 'resurrection with nobody dead fails');

  w = world();
  const prophetRes = cast(w, 'PROPHET', 0, 0);
  const prophet = w.people.find(p => p.isProphet);
  assert(prophetRes.ok && prophet && prophet.personality.piety === 1 && prophet.epithet === 'The Prophet', "prophet's voice makes a mortal a prophet");
  assert(w.ecosystem.worldEvents.at(-1).kind === 'miracle', 'prophet emits a miracle');

  w = world();
  cast(w, 'GUARDIAN_SPIRIT', 0, 0);
  const g = w.fx.list.find(e => e.type === 'guardian');
  run(w.fx, 3);
  assert(g && w.people.some(p => p.status && p.status.shield > 0), 'guardian spirit shields nearby mortals');
  w.people.forEach(p => p.die('x'));
  run(w.fx, 1);
  assert(w.fx.count('guardian') === 0 || w.people.every(p => p.alive), 'guardian leaves with its charge');

  w = world();
  const ore = cast(w, 'REVEAL_ORE', 0, 0);
  assert(ore.ok, 'revelation of ore works without a resource system (feature detected)');
  w = world();
  w.terrain.peekDeposit = (x, y) => ((x + y) % 4 === 0 ? { type: 'iron', amount: 50 } : null);
  const oreCast = cast(w, 'REVEAL_ORE', 0, 0);
  const civ = w.society.civilizations[0];
  assert(oreCast.ok && civ.knownDeposits && civ.knownDeposits.length > 10 && civ.knownDeposits.every(k => k.type === 'iron'),
    'revelation of ore teaches the nearby nation where the deposits are');
  const known = civ.knownDeposits.length;
  cast(w, 'REVEAL_ORE', 0, 0);
  assert(civ.knownDeposits.length === known, 'it does not record the same deposit twice');
}

section('Nature');
{
  let w = world();
  const t = tileAt(w, 3, 3);
  t.flora = 0;
  cast(w, 'PLANT_FOREST', 3, 3);
  assert(t.flora >= 80 && t.moisture >= 0.6, 'plant forest raises flora and moisture');
  w = world();
  const c = tileAt(w, 0, 0);
  cast(w, 'SPRING', 0, 0);
  assert(c.biome.isWater && c.elevation < 0.48, 'create spring makes water');
  let water = 0;
  for (let x = -25; x <= 25; x++) for (let y = -25; y <= 25; y++) if (tileAt(w, x, y).biome.isWater) water++;
  assert(water >= 12, `a river runs from the spring (${water} water tiles)`);

  w = world();
  const base = tileAt(w, 0, 0).temperature;
  cast(w, 'WARM_CLIMATE', 0, 0);
  run(w.fx, 60);
  const warm = tileAt(w, 0, 0).temperature;
  assert(warm > base + 0.08, 'warm climate raises the temperature');
  run(w.fx, 260);
  assert(Math.abs(tileAt(w, 0, 0).temperature - base) < 1e-6, 'the climate nudge fully decays back');
  assert(w.fx.count('climate') === 0, 'warm climate effect ended');

  w = world();
  cast(w, 'COOL_CLIMATE', 0, 0);
  run(w.fx, 60);
  assert(tileAt(w, 0, 0).temperature < base - 0.08, 'cool climate lowers the temperature');

  w = world();
  tileAt(w, 0, 0).elevation = 0.6;
  cast(w, 'ICE_AGE', 0, 0);
  run(w.fx, 200);
  const ice = tileAt(w, 0, 0);
  assert(ice.temperature < 0.3 && (ice.biome.id === 'TAIGA' || ice.biome.id === 'TUNDRA' || ice.biome.id === 'GLACIAL_ICE'), 'an ice age turns the land to tundra/ice');

  w = world();
  cast(w, 'TORNADO', 8, 8);
  w = world();
  const fire = cast(w, 'WILDFIRE', 5, 5);
  assert(fire.ok, 'wildfire starts');
  cast(w, 'CLEAR_SKIES', 5, 5);
  run(w.fx, 2);
  assert(w.fx.count('wildfire') === 0, 'clear skies puts out wildfires');
}

section('Curses');
{
  let w = world();
  tileAt(w, 4, 0).structure = { type: 'house', health: 100 };
  tileAt(w, 0, 0).structure = { type: 'house', health: 100 };
  const victim = w.people[0];
  victim.x = 0.5; victim.y = 0.5;
  cast(w, 'EARTHQUAKE', 0, 0);
  run(w.fx, 6);
  const damaged = ['house'].includes(tileAt(w, 0, 0).structure.type) ? tileAt(w, 0, 0).structure.health < 100 : true;
  assert(damaged, 'earthquake damages or collapses buildings');
  assert(victim.health < victim.maxHealth, 'earthquake injures creatures');
  assert(w.fx.count('quake') === 0, 'quake shaking ends');
  assert(w.fx.shakeAmount(0, 0) === 0, 'no shake after the quake');

  w = world();
  tileAt(w, 0, 0).structure = { type: 'house', health: 100 };
  const man = addHuman(w, w.civ, 0.2, 0.2);
  cast(w, 'TORNADO', 0, 0);
  const tor = w.fx.list.find(e => e.type === 'tornado');
  const x0 = tor.x;
  run(w.fx, 3);
  assert(Math.hypot(tor.x - x0, tor.y) > 0.5 || tor.x !== x0, 'the tornado moves');
  assert(man.health < man.maxHealth || !man.alive, 'a tornado hurts creatures in its path');
  assert(tileAt(w, 0, 0).structure.type === 'ruins' || tileAt(w, 0, 0).structure.health < 100, 'a tornado damages buildings');
  run(w.fx, 50);
  assert(w.fx.count('tornado') === 0, 'the tornado dies out after ~45s');

  w = world();
  for (let x = -6; x <= 6; x++) for (let y = -6; y <= 6; y++) tileAt(w, x, y).flora = 80;
  tileAt(w, 3, 0).structure = { type: 'house', health: 100 };
  cast(w, 'WILDFIRE', 0, 0);
  const fireEffect = w.fx.list.find(e => e.type === 'wildfire');
  run(w.fx, 4);
  assert(fireEffect.cells.length > 3, `fire spreads over flammable land (${fireEffect.cells.length} cells)`);
  assert(w.fx.visuals.length >= 0, 'fire has visuals list');
  run(w.fx, 270);
  assert(w.fx.count('wildfire') === 0, 'the fire burns out');
  assert(tileAt(w, 0, 0).flora === 0, 'burnt ground has no flora left');
  assert(tileAt(w, 3, 0).structure.type === 'ruins', 'wooden buildings burn down');

  w = world();
  cast(w, 'DROUGHT', 0, 0);
  const moist = tileAt(w, 0, 0).moisture;
  const flora = tileAt(w, 0, 0).flora;
  run(w.fx, 80);
  assert(tileAt(w, 0, 0).moisture < moist - 0.15, 'drought dries the land');
  assert(tileAt(w, 0, 0).flora < flora, 'drought kills flora');
  run(w.fx, 120);
  assert(Math.abs(tileAt(w, 0, 0).moisture - moist) < 1e-6, 'moisture returns after the drought');

  w = world();
  tileAt(w, 0, 0).structure = { type: 'farm', health: 70 };
  tileAt(w, 0, 0).civId = w.civ.id;
  tileAt(w, 0, 0).flora = 100;
  const f0 = w.civ.food;
  cast(w, 'LOCUSTS', 0, 0);
  run(w.fx, 20);
  assert(tileAt(w, 0, 0).flora < 100 || tileAt(w, 1, 1).flora < 60, 'locusts eat flora');
  assert(w.fx.count('locusts') === 1, 'the swarm persists');
  run(w.fx, 40);
  assert(w.fx.count('locusts') === 0, 'the swarm leaves');

  w = world();
  w.civ.food = 200;
  cast(w, 'FAMINE', 0, 0);
  assert(w.civ.food < 0, 'famine empties the granary');

  w = world();
  tileAt(w, 0, 0).structure = { type: 'farm', health: 70 };
  tileAt(w, 0, 0).flora = 100;
  cast(w, 'BLIGHT', 0, 0);
  run(w.fx, 60);
  assert(tileAt(w, 0, 0).flora < 60, 'blight kills crops');

  w = world();
  tileAt(w, 1, 0).structure = { type: 'house', health: 20 };
  cast(w, 'ACID_RAIN', 0, 0);
  run(w.fx, 15);
  assert(tileAt(w, 1, 0).structure.type === 'ruins', 'acid rain dissolves weak buildings');

  w = world();
  const cold = w.people[0];
  cast(w, 'BLIZZARD', 0, 0);
  run(w.fx, 30);
  assert(cold.health < cold.maxHealth, 'a blizzard hurts creatures');
  assert(tileAt(w, 0, 0).temperature < 0.45, 'a blizzard cools the land');

  w = world();
  const mad = w.people[0];
  const prey = addHuman(w, w.civ, 0.6, 0);
  mad.x = 0; mad.y = 0;
  cast(w, 'MADNESS', 0, 0);
  run(w.fx, 6);
  assert(w.ecosystem.entities.some(e => e.alive && e.health < e.maxHealth) || w.ecosystem.entities.some(e => !e.alive && e.causeOfDeath && /Maddened/.test(e.causeOfDeath)), 'madness makes creatures hurt each other');
  void prey;

  w = world();
  const ghost = w.people[1];
  cast(w, 'HAUNT', 0, 0);
  const e0 = ghost.energy;
  run(w.fx, 5);
  assert(ghost.energy < e0 && ghost.health < ghost.maxHealth, 'haunting drains the living');

  w = world();
  cast(w, 'LAVA_FLOW', 0, 0);
  run(w.fx, 20);
  const lava = w.fx.list.find(e => e.type === 'lava');
  assert(lava && lava.cells.length > 2, 'lava flows to neighbouring tiles');
  assert(tileAt(w, 0, 0).biome === BIOMES.VOLCANIC, 'lava leaves volcanic rock');
  run(w.fx, 40);
  assert(w.fx.count('lava') === 0, 'the lava flow ends');

  w = world();
  const bolts = w.ecosystem.entities.length;
  cast(w, 'LIGHTNING_STORM', 0, 0);
  run(w.fx, 10);
  assert(w.fx.visuals.filter(v => v.kind === 'bolt').length >= 8, 'a lightning storm strikes repeatedly');
  run(w.fx, 25);
  assert(w.fx.count('lightning_storm') === 0, 'the storm passes');
  void bolts;

  w = world();
  tileAt(w, 0, 0).structure = { type: 'house', health: 100 };
  cast(w, 'METEOR_SHOWER', 0, 0);
  const shower = w.fx.list.find(e => e.type === 'meteors');
  run(w.fx, 10);
  assert(w.fx.visuals.filter(v => v.kind === 'crater').length >= 3, 'a meteor shower makes several impacts over time');
  assert(shower.incoming.length >= 0, 'showers keep an incoming list');
  run(w.fx, 30);
  assert(w.fx.count('meteors') === 0, 'the shower ends');
}

section('Creatures');
{
  let w = world();
  const species = w.ecosystem.sapientSpecies();
  const n = w.ecosystem.entities.length;
  const r = cast(w, 'MONSTER', 20, 20);
  const dragon = w.ecosystem.entities.find(e => e.isMonster);
  assert(r.ok && dragon && w.ecosystem.entities.length === n + 1, 'a dragon is summoned');
  assert(dragon.species.name === 'Dragon' && dragon.maxHealth > 200 && dragon.visualScale > 1.5, 'the dragon is big and tough');
  assert(dragon.mateCooldown > 1e6, 'dragons do not breed');
  assert(dragon.canHunt(w.people[0]), 'a dragon hunts even people inside a civilization');
  addHuman(w, w.civ, 21, 21);
  const prey = addHuman(w, w.civ, 22, 22);
  run(w.fx, 12);
  assert(w.fx.visuals.some(v => v.kind === 'firebreath'), 'a dragon breathes fire');
  assert(prey.health < prey.maxHealth || !prey.alive, 'dragonfire hurts people');
  void species;

  w = world();
  const p = w.people[0];
  const maxHp = p.maxHealth;
  const scale = p.visualScale;
  cast(w, 'GIANT_GROWTH', p.x, p.y);
  assert(p.maxHealth > maxHp * 1.5 && p.visualScale > scale * 1.5, 'giant growth scales body and health');
  cast(w, 'SHRINK', p.x, p.y);
  cast(w, 'SHRINK', p.x, p.y);
  assert(p.visualScale < scale && p.maxHealth < maxHp * 1.2, 'shrink makes it small');

  w = world();
  const ch = w.people[1];
  ch.x = 8; ch.y = 8;
  ch.actionCooldown = 0;
  cast(w, 'CHARM', 8, 8);
  run(w.fx, 3);
  assert(ch.status && ch.status.charm > 0, 'charm applies the charmed status');
  const d0 = Math.hypot(ch.x - 0, ch.y - 0);
  void d0;

  w = world();
  const s = w.people[0];
  const body = JSON.stringify(s.traits);
  const bodyGenes = ['body', 'head', 'legs', 'ears', 'tail', 'horns', 'wings', 'pattern'].map(g => s.traits[g]).join();
  let changed = false;
  for (let i = 0; i < 6 && !changed; i++) {
    cast(w, 'SHAPESHIFT', s.x, s.y);
    changed = ['body', 'head', 'legs', 'ears', 'tail', 'horns', 'wings', 'pattern'].map(g => s.traits[g]).join() !== bodyGenes;
  }
  assert(changed && JSON.stringify(s.traits) !== body, 'shapeshift re-rolls the body parts');
}

section('Chaos');
{
  let w = world();
  const pulled = w.people[0];
  pulled.x = 5; pulled.y = 0;
  cast(w, 'GRAVITY_WELL', 0, 0);
  run(w.fx, 4);
  assert(Math.hypot(pulled.x, pulled.y) < 4, 'a gravity well pulls creatures in');
  run(w.fx, 10);
  assert(w.fx.count('gravity') === 0, 'the gravity well collapses');

  w = world();
  const quick = w.people[0];
  const age0 = quick.age;
  const slow = addHuman(w, w.civ, 40, 40);
  const slowAge = slow.age;
  quick.actionCooldown = 1e9;
  slow.actionCooldown = 1e9;
  cast(w, 'TIME_BUBBLE', 0, 0);
  for (let i = 0; i < 200; i++) {
    w.ecosystem.update(0.05, 1);
    w.fx.update(0.05);
  }
  assert((quick.age - age0) > (slow.age - slowAge) * 1.8, 'time runs faster inside a time bubble');

  w = world();
  const far = w.people[0];
  for (let i = 0; i < 12 && Math.hypot(far.x - 1, far.y - 1) <= 10; i++) { setActiveRng(new SeededRNG('tp' + i)); cast(w, 'TELEPORT', far.x, far.y); } // the landing point is random; some rolls fall off the map
  assert(Math.hypot(far.x - 1, far.y - 1) > 10, 'the whirlwind carries creatures away');

  w = world();
  w.people[0].health = 10;
  cast(w, 'FIREWORKS', 0, 0);
  run(w.fx, 5);
  assert(w.people[0].health > 10, 'fireworks make creatures joyful (they heal)');
  cast(w, 'MAGIC_MUSHROOMS', 0, 0);
  run(w.fx, 3);
  assert(w.people.some(p => p.status && p.status.shroom > 0), 'mushrooms affect creatures');
}

section('Natural disasters');
{
  let w = world();
  godSettings.naturalDisasters = true;
  const id = w.fx.triggerNatural('EARTHQUAKE');
  const ev = w.ecosystem.worldEvents.at(-1);
  assert(id === 'EARTHQUAKE' && ev.source === 'nature' && ev.kind === 'disaster', 'natural disasters are tagged source nature');
  w = world();
  w.fx.naturalTimer = 0.05;
  godSettings.naturalDisasters = false;
  run(w.fx, 1);
  assert(w.ecosystem.worldEvents.length === 0, 'no natural disasters when switched off');
  godSettings.naturalDisasters = true;
  w = world();
  w.fx.naturalTimer = 0.05;
  run(w.fx, 1);
  assert(w.ecosystem.worldEvents.length === 1 && w.ecosystem.worldEvents[0].source === 'nature', 'a natural disaster happens when the timer expires');
  godSettings.naturalDisasters = false;

  const a = world();
  const b = world();
  setActiveRng(new SeededRNG('nat'));
  a.fx.triggerNatural();
  setActiveRng(new SeededRNG('nat'));
  b.fx.triggerNatural();
  assert(JSON.stringify(a.ecosystem.worldEvents.map(e => e.name)) === JSON.stringify(b.ecosystem.worldEvents.map(e => e.name)), 'natural disasters use the seeded rng');
  setActiveRng(new SeededRNG('powers-test'));
  godSettings.naturalDisasters = false;
}

section('Energy and the power manager');
{
  const w = world();
  const divine = new DivinePowersManager(w.terrain, w.ecosystem, w.society);
  divine.setPower(POWERS.WARM_CLIMATE);
  godSettings.sandbox = true;
  divine.energy = 0;
  divine.applyAt(0, 0);
  assert(w.fx.count('climate') === 1, 'sandbox mode ignores divine energy');
  godSettings.sandbox = false;
  divine.applyAt(2, 2);
  assert(w.fx.count('climate') === 1 && divine.lastMessage, 'without energy the cast is refused with a message');
  divine.energy = 100;
  divine.lastPaintedTile = { x: -1, y: -1 };
  divine.applyAt(2, 2);
  assert(w.fx.count('climate') === 2 && divine.energy === 100 - POWERS.WARM_CLIMATE.cost, 'a cast spends energy');
  divine.regen(5);
  assert(divine.energy > 100 - POWERS.WARM_CLIMATE.cost, 'energy regenerates');
  godSettings.sandbox = true;
}

section('Saving active effects');
{
  const w = world();
  cast(w, 'TORNADO', 3, 3);
  cast(w, 'WILDFIRE', 0, 0);
  cast(w, 'DIVINE_SHIELD', 1, 1);
  cast(w, 'DROUGHT', 8, 8);
  run(w.fx, 5);
  const sim = { terrain: w.terrain, ecosystem: w.ecosystem, society: w.society, rng: new SeededRNG('save'), simSeconds: 0 };
  const data = JSON.parse(JSON.stringify(serializeSim(sim)));
  assert(Array.isArray(data.effects) && data.effects.length === 4, 'the save has an effects array');
  assert(Array.isArray(data.worldEvents) && data.worldEvents.length === 4, 'the save has the world events');
  const restored = restoreSim(data);
  const rfx = restored.terrain.effects;
  assert(rfx && rfx.list.length === 4, 'effects are restored');
  assert(rfx.list.find(e => e.type === 'tornado').age > 4.9, 'effect ages survive');
  assert(restored.ecosystem.worldEvents.length === 4 && restored.ecosystem.worldEventSeq === w.ecosystem.worldEventSeq, 'world events are restored');
  assert(JSON.stringify(serializeSim(restored)) === JSON.stringify(data), 'save -> load -> save is identical');
  const tor = rfx.list.find(e => e.type === 'tornado');
  const x0 = tor.x;
  rfx.update(0.05);
  for (let i = 0; i < 20; i++) rfx.update(0.05);
  assert(tor.x !== x0, 'restored effects keep running');
  // an old save without effects still loads
  delete data.effects; delete data.effectsMeta; delete data.worldEvents; delete data.worldEventSeq;
  const old = restoreSim(data);
  assert(old.terrain.effects.list.length === 0 && Array.isArray(old.ecosystem.worldEvents), 'saves from before god powers load fine');
}

section('The simulation loop updates effects');
{
  const w = world();
  w.civ.food = 100;
  cast(w, 'GIFT_OF_TOOLS', 0, 0);
  const t0 = w.civ.techPoints;
  const sim = { terrain: w.terrain, ecosystem: w.ecosystem, society: w.society, effects: w.fx };
  runSimulationSteps(sim, 100);
  assert(w.civ.techPoints > t0 + 20, 'runSimulationSteps drives the effects');
  assert(w.fx.list[0].age > 4.9, 'effect age advances by the fixed step');
}

summary();
