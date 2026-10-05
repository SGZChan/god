// Armies. What war looked like in each age, reduced to unit classes with a range, a rate of fire, a punch and an
// armour, plus the machines of the age. A soldier's class is chosen when the war starts and follows the people's
// technology and industry (a tank needs a factory, a starfighter a spaceport):
//
//   Stone Age     clubmen and slingers, raiding parties: skirmish, no formation
//   Bronze Age    spearmen with shields and archers behind them; the chariot age
//   Classical     legionaries/hoplites (sword and shield, the shield wall), archers, catapults for sieges
//   Medieval      knights in plate (heavy melee), pikemen/swordsmen, crossbowmen, trebuchets
//   Industrial    riflemen in lines, machine gunners, field artillery, tanks, fighter pilots in biplanes
//   Space Age     (after the Imperium of Warhammer 40,000) power-armoured marines with bolters, laser troopers,
//                 battle walkers, grav-tanks, starfighter aces; shielded and heavily armoured
//
//   UNITS[id]               { name, tier, kind: 'foot' | 'vehicle' | 'air', range, dmg, cd, hp, armor, speed, fx, anim, splash }
//   pickUnit(civ, ecosystem, terrain, random)   the class for a new soldier of this people
//   damageAgainst(attacker, defender)           damage in health points
//   isVehicle(unitId), isAir(unitId)
import { eraTier } from './townPlanner.js';
import { buildingsOf, settlementsOf } from './settlements.js';

// range in tiles; cd seconds between attacks; hp multiplies the soldier's health (damage taken is divided by it);
// armor 0..0.8 of damage ignored; speed multiplies walking speed; fx: the projectile or effect drawn
export const UNITS = {
  clubman:    { name: 'Clubman',          tier: 0, kind: 'foot',    range: 1.5, dmg: 17, cd: 1.3, hp: 1,   armor: 0,    speed: 1,   fx: 'melee',  anim: 'swing', gear: 'club' },
  slinger:    { name: 'Slinger',          tier: 0, kind: 'foot',    range: 9,   dmg: 9,  cd: 2.0, hp: 1,   armor: 0,    speed: 1.1, fx: 'stone',  anim: 'throw', gear: 'sling' },
  spearman:   { name: 'Spearman',         tier: 0, kind: 'foot',    range: 2.2, dmg: 19, cd: 1.4, hp: 1.1, armor: 0.1,  speed: 1,   fx: 'melee',  anim: 'thrust', gear: 'spear', shield: true },
  archer:     { name: 'Archer',           tier: 1, kind: 'foot',    range: 12,  dmg: 12, cd: 2.2, hp: 1,   armor: 0,    speed: 1,   fx: 'arrow',  anim: 'draw', gear: 'bow' },
  swordsman:  { name: 'Swordsman',        tier: 2, kind: 'foot',    range: 1.6, dmg: 25, cd: 1.2, hp: 1.3, armor: 0.25, speed: 1,   fx: 'melee',  anim: 'swing', gear: 'sword', shield: true },
  catapult:   { name: 'Catapult',         tier: 2, kind: 'vehicle', range: 22,  dmg: 42, cd: 6.0, hp: 3,   armor: 0.2,  speed: 0.5, fx: 'boulder', anim: 'fire', gear: 'catapult', splash: 1.6 },
  knight:     { name: 'Knight',           tier: 3, kind: 'foot',    range: 1.8, dmg: 32, cd: 1.3, hp: 1.8, armor: 0.45, speed: 1.15, fx: 'melee', anim: 'swing', gear: 'lance', shield: true },
  crossbowman:{ name: 'Crossbowman',      tier: 3, kind: 'foot',    range: 13,  dmg: 22, cd: 3.2, hp: 1.1, armor: 0.15, speed: 0.95, fx: 'arrow', anim: 'aim', gear: 'crossbow' },
  trebuchet:  { name: 'Trebuchet',        tier: 3, kind: 'vehicle', range: 26,  dmg: 55, cd: 8.0, hp: 3.5, armor: 0.25, speed: 0.4, fx: 'boulder', anim: 'fire', gear: 'trebuchet', splash: 2 },
  rifleman:   { name: 'Rifleman',         tier: 4, kind: 'foot',    range: 16,  dmg: 22, cd: 2.4, hp: 1.1, armor: 0.1,  speed: 1,   fx: 'bullet', anim: 'aim', gear: 'rifle' },
  gunner:     { name: 'Machine gunner',   tier: 4, kind: 'foot',    range: 14,  dmg: 7,  cd: 0.35, hp: 1.1, armor: 0.1, speed: 0.8, fx: 'tracer', anim: 'aim', gear: 'mg' },
  cannon:     { name: 'Field gun',        tier: 4, kind: 'vehicle', range: 28,  dmg: 48, cd: 5.0, hp: 3,   armor: 0.3,  speed: 0.5, fx: 'shell',  anim: 'fire', gear: 'cannon', splash: 2 },
  tank:       { name: 'Tank',             tier: 4, kind: 'vehicle', range: 16,  dmg: 42, cd: 2.6, hp: 7,   armor: 0.6,  speed: 0.8, fx: 'shell',  anim: 'fire', gear: 'tank', splash: 1.5, needs: 'factory' },
  pilot:      { name: 'Fighter pilot',    tier: 4, kind: 'air',     range: 11,  dmg: 13, cd: 0.6, hp: 2,   armor: 0.2,  speed: 3,   fx: 'tracer', anim: 'fire', gear: 'plane', needs: 'factory' },
  marine:     { name: 'Space marine',     tier: 5, kind: 'foot',    range: 18,  dmg: 30, cd: 1.2, hp: 2.6, armor: 0.6,  speed: 1,   fx: 'bolt',   anim: 'aim', gear: 'bolter' },
  trooper:    { name: 'Laser trooper',    tier: 5, kind: 'foot',    range: 20,  dmg: 18, cd: 0.8, hp: 1.4, armor: 0.3,  speed: 1.1, fx: 'laser',  anim: 'aim', gear: 'laser' },
  walker:     { name: 'Battle walker',    tier: 5, kind: 'vehicle', range: 20,  dmg: 55, cd: 2.2, hp: 9,   armor: 0.7,  speed: 0.9, fx: 'plasma', anim: 'fire', gear: 'walker', splash: 1.8, needs: 'factory' },
  gravtank:   { name: 'Grav-tank',        tier: 5, kind: 'vehicle', range: 24,  dmg: 62, cd: 2.4, hp: 11,  armor: 0.75, speed: 1.2, fx: 'plasma', anim: 'fire', gear: 'gravtank', splash: 2, needs: 'power_plant' },
  starfighter:{ name: 'Starfighter ace',  tier: 5, kind: 'air',     range: 16,  dmg: 22, cd: 0.5, hp: 3.5, armor: 0.4,  speed: 3.6, fx: 'laser',  anim: 'fire', gear: 'starfighter', needs: 'spaceport' }
};

export const isVehicle = id => Boolean(UNITS[id]) && UNITS[id].kind !== 'foot';
export const isAir = id => Boolean(UNITS[id]) && UNITS[id].kind === 'air';

// what the ages field, with how likely each class is (vehicles are limited by the number of soldiers and by industry)
const ROSTER = [
  [['clubman', 3], ['slinger', 2], ['spearman', 2]],
  [['spearman', 4], ['archer', 3], ['clubman', 1]],
  [['swordsman', 4], ['spearman', 2], ['archer', 3], ['catapult', 1]],
  [['knight', 2], ['swordsman', 3], ['crossbowman', 3], ['spearman', 1], ['trebuchet', 1]],
  [['rifleman', 5], ['gunner', 2], ['cannon', 1.2], ['tank', 1.6], ['pilot', 1]],
  [['marine', 4], ['trooper', 3], ['walker', 1.2], ['gravtank', 1.1], ['starfighter', 1]]
];

function hasBuilding(terrain, civ, type) {
  for (const st of settlementsOf(civ)) for (const b of buildingsOf(terrain, st)) if (b.type === type && b.progress >= 1) return true;
  return false;
}

export function pickUnit(civ, ecosystem, terrain, random) {
  const tier = Math.min(ROSTER.length - 1, eraTier(civ));
  // vehicles are scarce: at most one for every five soldiers
  let vehicles = 0;
  let soldiers = 0;
  for (const e of ecosystem.entities) {
    if (!e.alive || e.civilization !== civ || e.role !== 'SOLDIER') continue;
    soldiers++;
    if (isVehicle(e.unit)) vehicles++;
  }
  const allowVehicle = vehicles < Math.max(1, Math.floor(soldiers / 5));
  const choices = [];
  let total = 0;
  for (const [id, w] of ROSTER[tier]) {
    const u = UNITS[id];
    if (u.kind !== 'foot' && (!allowVehicle || (u.needs && !hasBuilding(terrain, civ, u.needs)))) continue;
    choices.push([id, w]);
    total += w;
  }
  let r = random() * total;
  for (const [id, w] of choices) { r -= w; if (r <= 0) return id; }
  return choices.length ? choices[0][0] : 'clubman';
}

// Damage a hit does: the attacker's punch (and training) against the defender's armour and toughness
export function damageAgainst(attackerUnit, warfare, defenderUnit, random) {
  const a = UNITS[attackerUnit] || UNITS.clubman;
  const d = UNITS[defenderUnit] || UNITS.clubman;
  const base = a.dmg * (0.85 + (warfare || 40) / 200) * (0.8 + random() * 0.4);
  return Math.max(1, (base * (1 - d.armor)) / d.hp);
}
