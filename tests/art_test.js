import { assert, section, summary } from './helpers.js';
import { SeededRNG } from '../src/cosmos/seed.js';
import { setActiveRng } from '../src/simulation/random.js';
import { Genome, PART_COUNTS } from '../src/life/genome.js';
import { composeSprite, paletteFor, spriteKey, SPRITE_W, SPRITE_H } from '../src/art/creatureSprite.js';
import { HEADS, BODIES, LEGS, EARS, HORNS, WINGS, TAILS } from '../src/art/creatureParts.js';

console.log('====================================================');
console.log('   ART TESTS — CREATURE SPRITE KIT                  ');
console.log('====================================================');
setActiveRng(new SeededRNG('art-tests'));

const base = Genome.pure({ body: 0, head: 0, legs: 1, ears: 0, tail: 0, horns: 0, wings: 0, pattern: 0 }).phenotype();
const pixels = rows => rows.join('').split('').filter(c => c !== '.').length;
const VALID = new Set('.oblsewhk'.split(''));

section('Art: the kit covers every body-plan gene variant');
{
  assert(HEADS.length >= PART_COUNTS.head && BODIES.length >= PART_COUNTS.body && LEGS.length >= PART_COUNTS.legs, 'heads, bodies and legs');
  assert(EARS.length >= PART_COUNTS.ears && HORNS.length >= PART_COUNTS.horns && WINGS.length >= PART_COUNTS.wings && TAILS.length >= PART_COUNTS.tail, 'ears, horns, wings and tails');
  assert(HEADS.every(h => h.length === 8 && h.every(r => r.length === 8)), 'every head is 8 x 8');
  assert(BODIES.every(b => b.length === 8 && b.every(r => r.length === 8)), 'every body is 8 x 8');
  assert(LEGS.every(pair => pair.length === 2 && pair.every(f => f.length === 4 && f.every(r => r.length === 8))), 'every leg set has two 4-row frames');
  const allRows = [...HEADS.flat(), ...BODIES.flat(), ...LEGS.flat(2), ...EARS.flat(), ...HORNS.flat(), ...WINGS.flat(), ...TAILS.flat()];
  assert(allRows.every(r => [...r].every(c => VALID.has(c))), 'parts only use palette letters');
}

section('Art: composing a sprite');
{
  const rows = composeSprite(base, 0);
  assert(rows.length === SPRITE_H && rows.every(r => r.length === SPRITE_W), `sprites are ${SPRITE_W} x ${SPRITE_H}`);
  assert(pixels(rows) > 120, `a sprite has substance (${pixels(rows)} pixels)`);
  assert(JSON.stringify(composeSprite(base, 0)) === JSON.stringify(rows), 'composition is deterministic');
  assert(rows.join('').includes('w') && rows.join('').includes('e'), 'it has eyes');

  // bodies and heads are symmetric
  const symmetric = rows.slice(1, 16).every(r => [...r].every((c, i) => c === r[SPRITE_W - 1 - i]));
  assert(symmetric, 'the head and body are left-right symmetric');

  const walk0 = composeSprite(base, 0);
  const walk1 = composeSprite(base, 1);
  assert(JSON.stringify(walk0) !== JSON.stringify(walk1), 'the two walk frames differ');
  assert(walk0.slice(16).join('') !== walk1.slice(16).join(''), 'the legs move between frames');
}

section('Art: every part variant changes the picture');
{
  for (const [gene, count] of Object.entries(PART_COUNTS)) {
    const seen = new Set();
    for (let v = 0; v < count; v++) seen.add(composeSprite({ ...base, [gene]: v }, 0).join('|'));
    assert(seen.size === count, `all ${count} "${gene}" variants look different`);
  }
}

section('Art: colours come from genes');
{
  const red = paletteFor({ ...base, hue: 0.0 });
  const blue = paletteFor({ ...base, hue: 0.6 });
  assert(red.b !== blue.b && /^#[0-9a-f]{6}$/.test(red.b), 'hue changes the base colour');
  assert(paletteFor(base).o !== paletteFor(base).b, 'the outline is darker than the base');
  const letters = new Set(composeSprite(Genome.random().phenotype(), 0).join('').split(''));
  const palette = paletteFor(base);
  assert([...letters].every(c => c === '.' || palette[c]), 'every letter in a sprite has a colour');
}

section('Art: species look different, siblings look alike');
{
  const keys = new Set();
  for (let i = 0; i < 60; i++) keys.add(spriteKey(Genome.random().phenotype(), 0));
  assert(keys.size > 55, `random species have distinct looks (${keys.size} of 60)`);
  const a = Genome.pure();
  assert(spriteKey(Genome.jittered(a, 0.01).phenotype(), 0) === spriteKey(Genome.jittered(a, 0.01).phenotype(), 0), 'creatures of one species share a sprite');
  assert(spriteKey(base, 0) !== spriteKey(base, 1), 'frames have separate cache entries');
}

summary();
