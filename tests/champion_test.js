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

section('Written characters become behaviour');
{
  const { parseIntent } = await import('../src/ai/intent.js');
  const a = parseIntent('This champion like to steal and manipulate');
  assert(a.behaviours.some(b => b.id === 'steal') && a.behaviours.some(b => b.id === 'manipulate'), '"likes to steal and manipulate" -> steal + manipulate');
  const b = parseIntent('This champion is a girl from another world');
  assert(b.backstory.includes('outsider') && b.gender === 'Female', '"a girl from another world" -> an outsider, female');
  const c = parseIntent('A boy named Tomas who never steals, hates fighting but loves to preach');
  assert(!c.behaviours.some(x => x.id === 'steal' || x.id === 'brawl') && c.behaviours.some(x => x.id === 'preach') && c.name === 'Tomas' && c.gender === 'Male', 'denials are honoured, names and sex are read');
  assert(parseIntent('likes to steal').behaviours[0].w < parseIntent('is obsessed with stealing').behaviours[0].w, 'strength words matter');
  const cfg = { personality: { openness: 0.5, conscientiousness: 0.5, extraversion: 0.5, agreeableness: 0.5, neuroticism: 0.2, piety: 0.6 }, proficiencies: { science: 40, statesmanship: 40, warfare: 40, mysticism: 40 }, vices: blankVices(), gender: 'Male', name: 'X' };
  applyInterpretation(cfg, 'a girl from another world');
  assert(cfg.gender === 'Female' && cfg.personality.piety < 0.6 && cfg.proficiencies.science > 40 && cfg.persona.backstory.includes('outsider'), 'reading applies sex, doubt of the local god, and knowledge from home');
}

section('A thief steals, a manipulator sways, a stranger marvels');
{
  const w = emptyWorld();
  const civ = addCiv(w, 'Targetia', 60, 40, 10);
  const people = w.ecosystem.sapientSpecies();
  const base = { aiSystem: 'LAYA', personality: { openness: 0.5, conscientiousness: 0.5, extraversion: 0.5, agreeableness: 0.5, neuroticism: 0.3, piety: 0.9 }, proficiencies: { architecture: 50, warfare: 50, statesmanship: 80, farming: 50, science: 50, mysticism: 50 } };
  const thief = w.ecosystem.spawnRandomEntity(people, true, { ...base, name: 'Vex', persona: { text: 'steals', behaviours: [{ id: 'steal', w: 1 }, { id: 'manipulate', w: 1 }], backstory: [] } });
  const slick = w.ecosystem.spawnRandomEntity(people, true, { ...base, name: 'Slick', persona: { text: 'manipulates', behaviours: [{ id: 'manipulate', w: 1 }], backstory: [] } });
  const stranger = w.ecosystem.spawnRandomEntity(people, true, { ...base, name: 'Mika', persona: { text: 'from another world', behaviours: [], backstory: ['outsider'] } });
  const victims = w.ecosystem.entities.filter(e => e.alive && e.isSapient && e.civilization === civ && !e.isSpecialIndividual);
  const piety0 = victims.reduce((s, v) => s + v.personality.piety, 0);
  const techBefore = civ.techPoints;
  const seen = new Set();
  const strangerActs = new Set();
  for (let i = 0; i < 900; i++) {
    for (const v of victims) if (v.alive) v.inventory = { wood: 5 };
    runSimulationSteps(w, 5);
    seen.add(thief.activity);
    strangerActs.add(stranger.activity);
  }
  assert((thief.loot || 0) > 0, `the thief took goods (loot ${thief.loot || 0})`);
  assert((slick.manipulated || 0) > 0 || victims.some(v => v.manipulatedBy === slick.id), 'the manipulator won someone over');
  assert(thief.notoriety > 0 || thief.role === 'CRIMINAL' || thief.crimeRecord > 0, `and was caught at it sometimes (notoriety ${thief.notoriety || 0})`);
  assert([...strangerActs].some(a => /another world|Marvelling|way home|where on earth|wonders/i.test(a || '')), `the stranger acts like one (${[...strangerActs].slice(0, 5).join(' | ')})`);
  assert(civ.techPoints > techBefore, 'tales of another world feed the people\'s research');
}

summary();
