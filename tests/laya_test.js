// Laya AI (src/ai/layaEngine.js): the champion's ingest -> route -> stage -> emit -> execute -> learn pipeline.
import { assert, section, summary, addCiv, addHuman, emptyWorld } from './helpers.js';
import { layaEngine, layaState, ingest, route, approveCard, dismissCard, omni, MAX_OPEN_CARDS, AUTONOMY_DELAY } from '../src/ai/layaEngine.js';
import { pushWorldEvent } from '../src/god/events.js';
import { serializeGame, restoreSim } from '../src/persistence/saveGame.js';

console.log('====================================================');
console.log('   LAYA AI TESTS                                    ');
console.log('====================================================');

function champion() {
  const w = emptyWorld();
  const civ = addCiv(w, 'Alpha', 30, 20, 0);
  const champ = addHuman(w, civ, 30.5, 22.5);
  champ.isSpecialIndividual = true;
  champ.aiSystem = 'LAYA';
  champ.personality = { openness: 0.8, conscientiousness: 0.8, extraversion: 0.8, agreeableness: 0.8, neuroticism: 0.2, piety: 0.95 };
  const ctx = () => ({ terrain: w.terrain, pathfinder: null, entities: w.ecosystem.entities, ecosystem: w.ecosystem });
  return { w, civ, champ, ctx };
}

section('Ingest and router: world events become routed observations');
{
  const { w, champ, ctx } = champion();
  pushWorldEvent(w.ecosystem, { kind: 'disaster', name: 'Earthquake', x: 31, y: 22, magnitude: 0.9, source: 'nature' });
  pushWorldEvent(w.ecosystem, { kind: 'blessing', name: 'Rain of Plenty', x: 29, y: 21 });
  pushWorldEvent(w.ecosystem, { kind: 'curse', name: 'Far Plague', x: 400, y: 300 });
  const events = ingest(champ, ctx());
  assert(events.some(e => e.name === 'Earthquake'), 'a nearby disaster is perceived');
  assert(!events.some(e => e.name === 'Far Plague'), 'a far-away curse is not');
  const quake = events.find(e => e.name === 'Earthquake');
  assert(route(quake, champ).persona === 'elder' && route(quake, champ).priority === 0, 'a big disaster goes to the Elder as P0');
  assert(route(events.find(e => e.name === 'Rain of Plenty'), champ).persona === 'herald', 'a blessing goes to the Herald');
}

section('Stager and emit: Action Cards, no duplicates, capped');
{
  const { w, champ, ctx } = champion();
  for (let i = 0; i < 8; i++) pushWorldEvent(w.ecosystem, { kind: 'omen', name: `Omen ${i}`, x: 30, y: 22 });
  const first = layaEngine.evaluate(champ, ctx());
  const state = layaState(champ);
  assert(state.cards.length <= MAX_OPEN_CARDS, `at most ${MAX_OPEN_CARDS} open cards (${state.cards.length})`);
  const keys = state.cards.map(c => c.key);
  layaEngine.evaluate(champ, ctx());
  assert(new Set(state.cards.map(c => c.key)).size === state.cards.length, 'the same event never gets two open cards');
  assert(first.scores && first.judgments, 'a decision carries ratings and judgments');
  assert(keys.length > 0, 'cards were staged');
}

section('Executor: approved cards first, others after the autonomy delay');
{
  const { w, champ, ctx } = champion();
  pushWorldEvent(w.ecosystem, { kind: 'omen', name: 'Comet', x: 30, y: 22 });
  pushWorldEvent(w.ecosystem, { kind: 'blessing', name: 'Golden Dawn', x: 30, y: 22 });
  const d1 = layaEngine.evaluate(champ, ctx());
  assert(!d1.card, 'fresh, non-urgent cards wait for approval or the autonomy delay');
  const state = layaState(champ);
  const comet = state.cards.find(c => c.title.includes('Comet'));
  approveCard(champ, comet.id);
  const d2 = layaEngine.evaluate(champ, ctx());
  assert(d2.card && d2.card.id === comet.id, 'the approved card is acted on next');
  for (let i = 0; i < AUTONOMY_DELAY + 6; i++) layaEngine.evaluate(champ, ctx());
  assert(!state.cards.some(c => c.title.includes('Golden Dawn')), 'an unapproved card is acted on alone after waiting');
}

section('Learn: approvals raise a persona\'s trust, dismissals lower it and mute the event');
{
  const { w, champ, ctx } = champion();
  pushWorldEvent(w.ecosystem, { kind: 'blessing', name: 'Spring', x: 30, y: 22 });
  layaEngine.evaluate(champ, ctx());
  const state = layaState(champ);
  const card = state.cards.find(c => c.persona === 'herald');
  const before = state.weights.herald;
  dismissCard(champ, card.id);
  assert(state.weights.herald < before, 'dismissing lowers the Herald\'s weight');
  layaEngine.evaluate(champ, ctx());
  assert(!state.cards.some(c => c.key === card.key), 'a dismissed event is not staged again right away');
  const other = state.cards[0];
  if (other) {
    const w0 = state.weights[other.persona];
    approveCard(champ, other.id);
    assert(state.weights[other.persona] > w0, 'approving raises that persona\'s weight');
  }
  assert(typeof omni(champ).attention === 'string', 'Omni summary has an Attention layer');
}

section('Execution has real effects: tending the hungry, preaching to doubters');
{
  const { w, civ, champ, ctx } = champion();
  const hungry = addHuman(w, civ, 31.5, 22.5);
  hungry.hunger = 90;
  const doubter = addHuman(w, civ, 29.5, 22.5);
  doubter.personality.piety = 0.2;
  doubter.belief = doubter.determineBelief();
  const pietyBefore = doubter.personality.piety;
  for (let i = 0; i < 8; i++) champ.executeLayaAI(ctx());
  assert(hungry.hunger < 90, `the hungry neighbour was fed (${Math.round(hungry.hunger)})`);
  assert(doubter.personality.piety > pietyBefore, 'the doubter heard the preaching');
  assert(layaState(champ).stats.acts > 0, 'deeds are counted for the Omni milestones');
}

section('Self-care: a hungry champion eats, a wounded one prays');
{
  const { champ, ctx } = champion();
  champ.hunger = 80;
  champ.executeLayaAI(ctx());
  assert(champ.hunger < 80, `the champion ate (${Math.round(champ.hunger)})`);
  champ.health = champ.maxHealth * 0.2;
  const before = champ.health;
  champ.executeLayaAI(ctx());
  assert(champ.health > before, 'the wounded champion prayed and recovered');
}

section('Save and load keep the Laya state');
{
  const { w, champ, ctx } = champion();
  pushWorldEvent(w.ecosystem, { kind: 'omen', name: 'Eclipse', x: 30, y: 22 });
  layaEngine.evaluate(champ, ctx());
  const before = JSON.stringify(champ.laya);
  const save = JSON.parse(JSON.stringify(serializeGame({ seed: 's', cosmicTimeAge: 0, galaxyIndex: 0, activeSystemId: 'x', activePlanetId: 'p', customPlanets: [], sims: new Map([['p', { ...w, rng: { state: 1 }, simSeconds: 0, planet: { id: 'p' } }]]) })));
  const restored = restoreSim(save.sims.p);
  const again = restored.ecosystem.entities.find(e => e.id === champ.id);
  assert(again && JSON.stringify(again.laya) === before, 'cards, weights and stats survive a save');
  assert(again && again.aiSystem === 'LAYA', 'the champion is still a Laya mind');
}

summary();
