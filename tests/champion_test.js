import { assert, section, summary, emptyWorld, addCiv } from './helpers.js';
import { interpret, applyInterpretation, interests, cardBias, blankVices, VICES } from '../src/ai/temperament.js';
import { runSimulationSteps } from '../src/simulation/fixedStep.js';
import { Genome } from '../src/life/genome.js';

console.log('====================================================');
console.log('   CHAMPION TEMPERAMENT TESTS                        ');
console.log('====================================================');

section('Description reading');
{
  const r = interpret('A vain, greedy merchant who is not lazy and loves feasts');
  assert(r.vices.pride > 0 && r.vices.greed > 0 && r.vices.gluttony > 0, 'vices are read from words');
  assert(r.vices.sloth < 0, 'a negation flips a word ("not lazy")');
  assert(r.tags.includes('trade'), 'interests come out as tags');
  assert(interpret('a female alexander').matched.length === 0, 'words are matched whole (no "ale" in "female")');
  const cfg = { personality: { openness: 0.5, conscientiousness: 0.5, extraversion: 0.5, agreeableness: 0.5, neuroticism: 0.2, piety: 0.5 }, proficiencies: { warfare: 50, science: 50 }, vices: blankVices() };
  applyInterpretation(cfg, 'a brutal warrior');
  assert(cfg.vices.wrath >= 0.55 && cfg.proficiencies.warfare > 50 && cfg.personality.agreeableness < 0.5 && cfg.persona.tags.includes('war'), 'applying a reading moves sliders, talents and the persona');
}

section('Vices steer the Laya mind');
{
  const lazy = { vices: { ...blankVices(), sloth: 0.95 }, personality: { conscientiousness: 0.3 } };
  const glutton = { vices: { ...blankVices(), gluttony: 0.95 }, personality: {} };
  const lover = { vices: { ...blankVices(), lust: 0.95 }, personality: {} };
  const hermit = { vices: blankVices(), personality: { extraversion: 0.2 }, persona: { tags: ['alone'] } };
  assert(interests(lazy).idle > 0.5 && interests(glutton).idle < 0.2, 'sloth makes a champion loaf');
  assert(interests(glutton).appetite < 30 && interests({ vices: blankVices(), personality: {} }).appetite > 45, 'gluttons eat long before they are hungry');
  assert(interests(lover).company > 1 && interests(hermit).company < 0.3, 'lust seeks company, hermits avoid it');
  assert(cardBias('warden', { vices: { ...blankVices(), wrath: 0.9 } }) > cardBias('envoy', { vices: { ...blankVices(), wrath: 0.9 } }), 'wrath favours the warden over the envoy');
  assert(cardBias('builder', lazy) < 1, 'sloth slows every card');
  assert(VICES.length === 7, 'seven vices');
}

section('Champions act out their temperament in the world');
{
  const w = emptyWorld();
  const civ = addCiv(w, 'Vicia', 60, 40, 8);
  const people = w.ecosystem.sapientSpecies();
  const mk = (vices, persona) => w.ecosystem.spawnRandomEntity(people, true, { name: 'T', aiSystem: 'LAYA', vices: { ...blankVices(), ...vices }, persona: persona || null, personality: { openness: 0.5, conscientiousness: 0.5, extraversion: 0.5, agreeableness: 0.5, neuroticism: 0.3, piety: 0.5 }, proficiencies: { architecture: 50, warfare: 50, statesmanship: 50, farming: 50, science: 50, mysticism: 50 }, look: { hue: 0.9, head: 3, ears: 2 } });
  const sloth = mk({ sloth: 0.95 });
  const glut = mk({ gluttony: 0.95 });
  assert(sloth.vices.sloth === 0.95 && glut.persona === null, 'vices and persona reach the entity');
  assert(Math.abs(sloth.traits.hue - 0.9) < 0.05 && Math.round(sloth.traits.head) === 3, 'the chosen look is pinned on the champion');
  const seen = { sloth: new Set(), glut: new Set() };
  for (let i = 0; i < 160; i++) {
    runSimulationSteps(w, 5);
    seen.sloth.add(sloth.activity); seen.glut.add(glut.activity);
  }
  const loafs = [...seen.sloth].some(a => /Loafing|rest/i.test(a || ''));
  assert(loafs, `a slothful champion loafs (${[...seen.sloth].slice(0, 6).join(' | ')})`);
  assert(sloth.alive && glut.alive, 'they live');
}

summary();
