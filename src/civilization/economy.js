// The economy of a settlement: items, stockpiles, carried inventories, recipes and the food bookkeeping that keeps
// civ.food alive as an aggregate (powers and the overview still read and write it).
//
// Items are the resource ids of world/resources.js (wood, stone, copper...) plus produced goods (grain, meat, tools,
// bricks, pottery, cloth, bronze, iron_bar). A settlement's stockpile is `settlement.stock = { item: amount }` (plain
// JSON, saved with the civ); a creature carries `entity.inventory = { item: amount }` up to carryCapacity(entity).
import { RESOURCES } from '../world/resources.js';

export const FOOD_SCALE = 4;   // civ.food (legacy "granary points") per food unit in the stockpiles
export const FOOD_CAP = 400;   // civ.food ceiling (a granary only holds so much; surplus spoils)

// hunger relief per unit eaten
export const NOURISHMENT = { meat: 55, grain: 40, fish: 35, berries: 25 };
export const FOOD_ITEMS = Object.keys(NOURISHMENT);
const FOOD_ORDER = ['meat', 'grain', 'fish', 'berries']; // best first

export const GOODS = {
  grain: { name: 'Grain', color: '#e9c46a' },
  meat: { name: 'Meat', color: '#c0392b' },
  tools: { name: 'Stone Tools', color: '#94a3b8' },
  pottery: { name: 'Pottery', color: '#d97706' },
  bricks: { name: 'Bricks', color: '#b45309' },
  cloth: { name: 'Cloth', color: '#a78bfa' },
  bronze: { name: 'Bronze', color: '#b08d57' },
  iron_bar: { name: 'Iron Bars', color: '#9ca3af' }
};

export function itemName(id) {
  return (RESOURCES[id] && RESOURCES[id].name) || (GOODS[id] && GOODS[id].name) || id;
}

export function itemColor(id) {
  return (RESOURCES[id] && RESOURCES[id].color) || (GOODS[id] && GOODS[id].color) || '#cbd5e1';
}

// Recipes. `at` is the building type that must stand in the settlement (null: made at the settlement centre, by hand).
// `tier` is the first era (index) in which crafters know it; `needs` discovered resources of the civ (gating).
export const RECIPES = [
  { id: 'tools', name: 'Stone tools', in: { stone: 1, wood: 1 }, out: { tools: 2 }, work: 3, at: null, tier: 0 },
  { id: 'cloth', name: 'Woven cloth', in: { fibre: 3 }, out: { cloth: 1 }, work: 3, at: 'workshop', tier: 1 },
  { id: 'pottery', name: 'Pottery', in: { clay: 2, wood: 1 }, out: { pottery: 2 }, work: 3, at: 'kiln', tier: 1 },
  { id: 'bricks', name: 'Bricks', in: { clay: 3, wood: 1 }, out: { bricks: 3 }, work: 3, at: 'kiln', tier: 1 },
  { id: 'bronze', name: 'Bronze ingot', in: { copper: 2, tin: 1, wood: 1 }, out: { bronze: 2 }, work: 5, at: 'smithy', tier: 1, needs: ['copper', 'tin'] },
  { id: 'iron_bar', name: 'Iron bar', in: { iron: 2, coal: 1 }, out: { iron_bar: 1 }, work: 6, at: 'smithy', tier: 2, needs: ['iron', 'coal'] }
];

// ---------- stockpiles and inventories ----------

export function total(inv) {
  let n = 0;
  for (const k in inv) n += inv[k];
  return n;
}

export function amount(inv, item) {
  return (inv && inv[item]) || 0;
}

export function add(inv, item, n) {
  if (!(n > 0)) return 0;
  inv[item] = Math.round(((inv[item] || 0) + n) * 100) / 100;
  return n;
}

// Removes up to n; returns what was taken.
export function take(inv, item, n) {
  const have = inv[item] || 0;
  const got = Math.min(have, n);
  if (got <= 0) return 0;
  const left = Math.round((have - got) * 100) / 100;
  if (left <= 0) delete inv[item];
  else inv[item] = left;
  return got;
}

export function canAfford(inv, cost) {
  for (const k in cost) if (amount(inv, k) < cost[k]) return false;
  return true;
}

export function carryCapacity(entity) {
  return Math.round(6 + (entity.stats ? entity.stats.sizeScale : 0.5) * 5);
}

// ---------- food ----------

export function foodUnits(stock) {
  let n = 0;
  for (const k of FOOD_ITEMS) n += stock[k] || 0;
  return n;
}

// The best food in `stock` (meat before grain before fish before berries), or null.
export function bestFood(stock) {
  for (const k of FOOD_ORDER) if ((stock[k] || 0) >= 1) return k;
  for (const k of FOOD_ORDER) if ((stock[k] || 0) > 0.2) return k;
  return null;
}

// Eats one unit out of `inv`; returns the hunger relief (0 when there was no food).
export function eatFrom(inv) {
  const k = bestFood(inv);
  if (!k) return 0;
  take(inv, k, 1);
  return NOURISHMENT[k];
}

export function settlementsOf(civ) {
  return civ.settlements || [];
}

export function civFoodUnits(civ) {
  let n = 0;
  for (const st of settlementsOf(civ)) n += foodUnits(st.stock);
  return n;
}

// civ.food is the aggregate of every settlement's food stockpile (x FOOD_SCALE). Powers and old code add to or subtract
// from civ.food directly; this reconciles such writes with the real stockpiles: the difference since the last
// reconcile is added to (or taken from) the capital's stockpile, a famine deeper than the stores becomes food debt that
// later harvests repay. Called once per civ update.
export function syncFood(civ) {
  const stores = settlementsOf(civ);
  if (!stores.length) return;
  if (civ.foodDebt === undefined) civ.foodDebt = 0;
  const seen = civ.foodSeen === undefined ? civ.food : civ.foodSeen;
  let delta = civ.food - seen;
  if (Math.abs(delta) > 1e-9) {
    const target = stores[0].stock;
    if (delta > 0) {
      const repay = Math.min(civ.foodDebt, delta);
      civ.foodDebt -= repay;
      delta -= repay;
      add(target, 'grain', delta / FOOD_SCALE);
    } else {
      let need = -delta / FOOD_SCALE;
      for (const st of stores) {
        for (const k of FOOD_ORDER.slice().reverse()) {
          if (need <= 0) break;
          need -= take(st.stock, k, need);
        }
      }
      if (need > 0) civ.foodDebt += need * FOOD_SCALE;
    }
  }
  // spoilage above the ceiling
  let units = civFoodUnits(civ);
  const cap = FOOD_CAP / FOOD_SCALE;
  if (units > cap) {
    let excess = units - cap;
    for (const st of stores) {
      for (const k of FOOD_ORDER.slice().reverse()) {
        if (excess <= 0) break;
        excess -= take(st.stock, k, excess);
      }
    }
    units = civFoodUnits(civ);
  }
  // debt is slowly forgiven (people tighten their belts)
  civ.foodDebt = Math.max(0, civ.foodDebt - 0.02);
  civ.food = units * FOOD_SCALE - civ.foodDebt;
  civ.foodSeen = civ.food;
}

// Prosperity from real food: surplus per citizen makes couples fertile, a shortage depresses it.
export function prosperityOf(civ) {
  const per = civFoodUnits(civ) / Math.max(1, civ.citizens || 1);
  if (civ.food < 0 || per < 0.4) return 0.5;
  if (per > 2.2 || civ.food > 220) return 1.3;
  return 1;
}
