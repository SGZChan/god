// Markets and money. What economic history teaches, reduced to a few rules per civilization:
//
//  * Barter first. A people of the Stone Age has no money: its leaders collect tribute in goods. Money follows the
//    ages (ingots, silver coin, gold florins, paper money, digital credit) and with it taxes, wages and trade.
//  * Prices come from scarcity: a good in short supply costs more than its base value, a glut makes it cheap.
//    Money supply matters too: a state sitting on a mountain of coin with little to buy sees its prices rise.
//  * The state taxes what the people produce (GDP): tribute under a chieftain, tithes under a priesthood, heavy
//    taxes under a king, light ones under a republic. Markets widen the base. Heavy taxes cost legitimacy.
//  * The state pays its army and buys the materials its public works lack from foreign merchants, at a premium.
//    An unpaid army deserts the colours: legitimacy falls.
//  * Peoples at peace trade: surplus goods go to the neighbour that lacks them for coin, both grow richer and are
//    less inclined to fight each other (statecraft.js warMotive).
//
//   civ.treasury, civ.gdp (value produced per period), civ.taxRate, civ.tradeRoutes { civId: { volume, value } }
//   currencyOf(civ)                  { name, unit, money } for the civ's age
//   priceOf(civ, st, item)           what `item` costs in this settlement now
//   tickEconomy(society, civ, dt)    every ECON_TICK simulated seconds
import { RESOURCES } from '../world/resources.js';
import { settlementsOf, openSites } from './settlements.js';
import { missingMaterials } from '../world/buildings.js';
import { eraTier } from './townPlanner.js';
import { add, take, itemName } from './economy.js';
import { random } from '../simulation/random.js';

export const ECON_TICK = 10;
const BASE_VALUE = {
  grain: 1, meat: 2, fish: 1.2, berries: 0.6, wood: 0.8, fibre: 0.7, stone: 1, clay: 0.9, flint: 1,
  tools: 3, pottery: 3, cloth: 4, bricks: 3, copper: 4, tin: 5, bronze: 9, iron: 6, coal: 4, iron_bar: 12,
  gold: 20, gems: 25, oil: 10, uranium: 40
};
const CURRENCIES = [
  { name: 'Barter', unit: 'goods', money: false },
  { name: 'Bronze ingots', unit: 'ingot', money: true },
  { name: 'Silver drachmae', unit: 'drachma', money: true },
  { name: 'Gold florins', unit: 'florin', money: true },
  { name: 'Paper banknotes', unit: 'note', money: true },
  { name: 'Digital credits', unit: 'credit', money: true }
];
const TAX = { CHIEFTAINCY: 0.05, THEOCRACY: 0.12, MONARCHY: 0.2, REPUBLIC: 0.1 };
const WANT = 10;   // units of a good a settlement likes to have in store (price reference)

export function currencyOf(civ) {
  return CURRENCIES[Math.min(CURRENCIES.length - 1, eraTier(civ))];
}

export function baseValue(item) {
  return BASE_VALUE[item] || (RESOURCES[item] ? 1 + (RESOURCES[item].tier || 0) * 2 : 1);
}

export function priceOf(civ, st, item) {
  const scarcity = Math.max(0.5, Math.min(3, (WANT + 2) / ((st.stock[item] || 0) + 2)));
  return Math.round(baseValue(item) * scarcity * (civ.priceLevel || 1) * 100) / 100;
}

export function valueOfOutput(output) {
  let v = 0;
  for (const [k, n] of Object.entries(output || {})) v += baseValue(k) * n;
  return v;
}

function ensure(civ) {
  if (civ.treasury === undefined) civ.treasury = 0;
  if (civ.gdp === undefined) civ.gdp = 0;
  if (civ.taxRate === undefined) civ.taxRate = 0;
  if (civ.priceLevel === undefined) civ.priceLevel = 1;
  if (!civ.tradeRoutes) civ.tradeRoutes = {};
  if (civ.econTimer === undefined) civ.econTimer = ECON_TICK;
  if (!civ.econSeen) civ.econSeen = { ...(civ.output || {}) };
}

function marketsOf(society, civ) {
  let n = 0;
  for (const b of society.terrain.buildingsOfCiv(civ.id)) if (b.progress >= 1 && (b.type === 'market' || b.type === 'market_stall')) n++;
  return n;
}

// ---------- the state's purse ----------

function collectTaxes(society, civ, gdpPeriod) {
  const tier = eraTier(civ);
  const gov = civ.government ? civ.government.id : 'CHIEFTAINCY';
  civ.taxRate = tier === 0 ? 0 : (TAX[gov] || 0.1);
  const markets = marketsOf(society, civ);
  const take$ = gdpPeriod * civ.taxRate * (1 + Math.min(0.6, markets * 0.1)) * (civ.prosperity || 1);
  if (currencyOf(civ).money) civ.treasury += take$;
  else civ.tribute = (civ.tribute || 0) + take$; // goods in kind: the chief's feast, counted but not spent
  return take$;
}

function payArmy(civ) {
  const cost = (civ.soldiers || 0) * 0.35 * Math.max(1, eraTier(civ));
  if (!currencyOf(civ).money) return 0;
  civ.treasury -= cost;
  if (civ.treasury < 0) {
    // the unpaid army grumbles; the state cannot borrow without limit
    civ.treasury = Math.max(civ.treasury, -150);
    civ.legitimacy = Math.max(0, (civ.legitimacy === undefined ? 70 : civ.legitimacy) - 1.5);
  }
  return cost;
}

// Public works buy what a site lacks from foreign merchants (a 60% premium), one batch per settlement per tick
function publicPurchases(society, civ) {
  if (!currencyOf(civ).money || civ.treasury < 10) return 0;
  let spent = 0;
  for (const st of settlementsOf(civ)) {
    if (!st.population) continue;
    let bought = false;
    for (const site of openSites(society.terrain, st)) {
      if (bought) break;
      for (const [k, n] of Object.entries(missingMaterials(site))) {
        if (n < 1 || (st.stock[k] || 0) >= 2) continue;
        const qty = Math.min(4, Math.ceil(n));
        const cost = priceOf(civ, st, k) * 1.6 * qty;
        if (civ.treasury - cost < 5) continue;
        civ.treasury -= cost;
        add(st.stock, k, qty);
        spent += cost;
        bought = true;
        break;
      }
    }
  }
  return spent;
}

// ---------- trade between peoples ----------

function civStock(civ, item) {
  let n = 0;
  for (const st of settlementsOf(civ)) n += st.stock[item] || 0;
  return n;
}

function nearestPair(a, b) {
  let best = null;
  for (const x of settlementsOf(a)) for (const y of settlementsOf(b)) {
    const d = Math.hypot(x.x - y.x, x.y - y.y);
    if (!best || d < best.d) best = { x, y, d };
  }
  return best;
}

export const TRADE_REACH = 110;

function tradeBetween(society, seller, buyer) {
  if (!currencyOf(seller).money || !currencyOf(buyer).money) return 0;
  const pair = nearestPair(seller, buyer);
  if (!pair || pair.d > TRADE_REACH) return 0;
  // what the buyer lacks and the seller has plenty of
  let best = null;
  for (const item of Object.keys(BASE_VALUE)) {
    const surplus = civStock(seller, item) - 18;
    if (surplus >= 4 && (pair.y.stock[item] || 0) < 6) {
      const score = Math.min(surplus, 8 - (pair.y.stock[item] || 0)) * baseValue(item);
      if (!best || score > best.score) best = { item, score };
    }
  }
  if (!best) return 0;
  const qty = Math.min(6, Math.floor(civStock(seller, best.item) - 18));
  const price = priceOf(buyer, pair.y, best.item);
  const cost = price * qty;
  if (qty < 1 || buyer.treasury < cost + 5) return 0;
  // the goods leave the seller's richest town
  let left = qty;
  for (const st of settlementsOf(seller).slice().sort((a, b) => (b.stock[best.item] || 0) - (a.stock[best.item] || 0))) {
    if (left <= 0) break;
    left -= take(st.stock, best.item, left);
  }
  const moved = qty - left;
  if (moved <= 0) return 0;
  add(pair.y.stock, best.item, moved);
  const paid = price * moved;
  buyer.treasury -= paid;
  seller.treasury += paid;
  for (const [a, b] of [[seller, buyer], [buyer, seller]]) {
    const r = a.tradeRoutes[b.id] || (a.tradeRoutes[b.id] = { volume: 0, value: 0, since: Math.round(society.ecosystem.timeYears) });
    r.volume += moved;
    r.value = Math.round((r.value + paid) * 100) / 100;
    r.last = society.ecosystem.timeYears;
    if (a.grievance && a.grievance[b.id]) a.grievance[b.id] = Math.max(0, a.grievance[b.id] - 2);
  }
  if (random() < 0.02) {
    society.ecosystem.notifications.unshift({ text: `🛒 ${seller.name} sold ${moved} ${itemName(best.item).toLowerCase()} to ${buyer.name}.`, time: Date.now() });
  }
  return paid;
}

function tradeAbroad(society, civ) {
  if (!currencyOf(civ).money) return;
  for (const other of society.civilizations) {
    if (other === civ || !other.isAlive || civ.warTarget === other || other.warTarget === civ) continue;
    ensure(other);
    tradeBetween(society, civ, other);
  }
  // routes that have gone quiet are forgotten
  const now = society.ecosystem.timeYears;
  for (const [id, r] of Object.entries(civ.tradeRoutes)) {
    const partner = society.civilizations.find(c => c.id === id);
    if (!partner || !partner.isAlive || now - (r.last || 0) > 25) delete civ.tradeRoutes[id];
  }
}

// ---------- the tick ----------

export function tickEconomy(society, civ, dt) {
  ensure(civ);
  civ.econTimer -= dt;
  if (civ.econTimer > 0) return;
  civ.econTimer = ECON_TICK;
  // GDP: the value of what was produced since the last tick, smoothed
  const seen = civ.econSeen;
  let made = 0;
  for (const [k, n] of Object.entries(civ.output || {})) {
    const d = n - (seen[k] || 0);
    if (d > 0) made += d * baseValue(k);
    seen[k] = n;
  }
  civ.gdp = Math.round((civ.gdp * 0.7 + made * 0.3) * 100) / 100;
  collectTaxes(society, civ, civ.gdp);
  payArmy(civ);
  publicPurchases(society, civ);
  tradeAbroad(society, civ);
  // too much coin chasing too few goods: prices rise (and fall again when the treasury is spent)
  const per = civ.treasury / Math.max(10, civ.citizens || 1);
  civ.priceLevel = Math.max(0.8, Math.min(2.5, 1 + Math.max(0, per - 8) * 0.04));
  civ.treasury = Math.round(civ.treasury * 100) / 100;
}

export function tradePartners(civ) {
  return Object.keys(civ.tradeRoutes || {});
}

