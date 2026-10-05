// Markets and money (src/civilization/markets.js): currencies, prices, taxes, army pay, public purchases, foreign trade.
import { assert, section, summary, emptyWorld, addCiv } from './helpers.js';
import { tickEconomy, priceOf, currencyOf, valueOfOutput, ECON_TICK } from '../src/civilization/markets.js';
import { settlementsOf } from '../src/civilization/settlements.js';
import { ERAS } from '../src/civilization/techTree.js';
import { GOVERNMENTS } from '../src/civilization/society.js';

console.log('====================================================');
console.log('   ECONOMY TESTS                                    ');
console.log('====================================================');

const tick = (w, civ, n = 1) => { for (let i = 0; i < n; i++) { civ.econTimer = 0; tickEconomy(w.society, civ, 0.1); } };

section('Money follows the ages');
{
  const w = emptyWorld();
  const civ = addCiv(w, 'Coinia', 40, 60, 6);
  assert(!currencyOf(civ).money && currencyOf(civ).name === 'Barter', 'the Stone Age barters');
  civ.era = ERAS[1];
  assert(currencyOf(civ).money, 'the Bronze Age has money');
  civ.era = ERAS[3];
  assert(currencyOf(civ).unit === 'florin', 'a medieval people counts in florins');
}

section('Prices follow scarcity');
{
  const w = emptyWorld();
  const civ = addCiv(w, 'Pricia', 40, 60, 6);
  const st = settlementsOf(civ)[0];
  st.stock = { wood: 0, stone: 60 };
  assert(priceOf(civ, st, 'wood') > priceOf(civ, st, 'stone') * 2, 'wood in short supply costs more than plentiful stone');
  assert(priceOf(civ, st, 'bronze') > priceOf(civ, st, 'grain'), 'bronze is worth more than grain');
  assert(valueOfOutput({ grain: 10, gold: 1 }) === 10 + 20, 'output is valued at base prices');
}

section('Taxes depend on the government and the age');
{
  const w = emptyWorld();
  const civ = addCiv(w, 'Taxia', 40, 60, 8);
  w.society.refreshCensus();
  civ.era = ERAS[2];
  civ.government = GOVERNMENTS.find(g => g.id === 'MONARCHY');
  civ.output = { grain: 1000 };
  civ.econSeen = { grain: 0 };
  civ.gdp = 0;
  tick(w, civ);
  assert(civ.taxRate === 0.2 && civ.treasury > 0, `a king taxes heavily and fills the treasury (${civ.treasury.toFixed(1)})`);
  const king = civ.treasury;
  const r = addCiv(w, 'Republica', 100, 60, 8);
  w.society.refreshCensus();
  r.era = ERAS[2]; r.government = GOVERNMENTS.find(g => g.id === 'REPUBLIC');
  r.output = { grain: 1000 }; r.econSeen = { grain: 0 }; r.gdp = 0;
  tick(w, r);
  assert(r.treasury < king && r.treasury > 0, 'a republic taxes lightly');
  const tribe = addCiv(w, 'Tribia', 160, 60, 8);
  tribe.output = { grain: 1000 }; tribe.econSeen = { grain: 0 }; tribe.gdp = 0;
  tick(w, tribe);
  assert(tribe.treasury === 0 && tribe.taxRate === 0, 'a Stone Age tribe has no treasury, only tribute');
}

section('The army must be paid; unpaid soldiers cost legitimacy');
{
  const w = emptyWorld();
  const civ = addCiv(w, 'Armia', 40, 60, 8);
  civ.era = ERAS[2];
  civ.soldiers = 30;
  civ.treasury = 2;
  civ.legitimacy = 70;
  tick(w, civ, 5);
  assert(civ.treasury < 0 && civ.legitimacy < 70, 'the treasury ran dry and the people noticed');
}

section('Public works buy missing materials from foreign merchants');
{
  const w = emptyWorld();
  const civ = addCiv(w, 'Buya', 40, 60, 8);
  w.society.refreshCensus();
  civ.era = ERAS[2];
  const st = settlementsOf(civ)[0];
  st.population = 8;
  const site = w.terrain.placeBuilding('stone_house', st.x + 8, st.y + 6, { civId: civ.id, progress: 0 });
  site.settlementId = st.id;
  st.stock = {};
  civ.treasury = 300;
  tick(w, civ);
  assert((st.stock.stone || 0) > 0 || (st.stock.wood || 0) > 0, 'the stone the site lacked was bought');
  assert(civ.treasury < 300, 'and paid for');
}

section('Peoples at peace trade surplus for coin; wars stop it');
{
  const w = emptyWorld();
  const a = addCiv(w, 'Sellia', 40, 60, 8);
  const b = addCiv(w, 'Buyia', 90, 60, 8);
  for (const c of [a, b]) { c.era = ERAS[2]; c.treasury = 100; }
  settlementsOf(a)[0].stock = { tin: 60, grain: 5 };
  settlementsOf(b)[0].stock = { grain: 50 };
  const before = [a.treasury, b.treasury];
  tick(w, a, 3);
  assert(settlementsOf(b)[0].stock.tin > 0, 'the buyer received tin it lacked');
  assert(a.treasury > before[0] && b.treasury < before[1], 'coin went the other way');
  assert(a.tradeRoutes[b.id] && b.tradeRoutes[a.id], 'a trade route exists in both books');
  const tin = settlementsOf(b)[0].stock.tin;
  a.declareWar(b, w.ecosystem, 'test');
  tick(w, a, 3);
  assert(settlementsOf(b)[0].stock.tin === tin, 'no trade while at war');
}

summary();
