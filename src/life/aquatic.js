// Marine life. Creatures with a swimmer body plan (fish, sharks, whales, eels; see art/creatureParts.js and
// life/genome.js PART_FAMILIES.swimmer) live only in water: they swim, never walk, and suffocate on land. Their food
// chain mirrors the land's (the trophic pyramid):
//
//   plankton and algae    free in the water, richer in the shallows than the deep; filter feeders (minnows, whales)
//                         live on them, limited by how many share the same water (crowding)
//   small grazing fish    eaten by mid-sized predators (tuna, reef hunters, eels)
//   mid predators         eaten by apex hunters (sharks)
//   whales                huge filter feeders: few, long-lived, slow to breed, nothing hunts them
//
// A predator breeds only while there is enough prey (life/ecosystem.js tryConceive).
//
//   isAquaticBody(body)      does this body-plan gene belong to a swimmer?
//   aquaticAI(ent, world, random)   one decision of a swimming creature; true when it handled the turn
export const isAquaticBody = body => { const b = Math.round(body); return b === 6 || b === 13 || b === 14; };

const PLANKTON = { SHALLOWS: 1, OCEAN: 0.75, DEEP_OCEAN: 0.5 };

// Tiles along the straight line to (tx, ty) as long as they are water; returns the path (maybe empty)
export function swimPath(terrain, x, y, tx, ty) {
  const path = [];
  const n = Math.ceil(Math.hypot(tx - x, ty - y));
  for (let i = 1; i <= n; i++) {
    const px = x + ((tx - x) * i) / n;
    const py = y + ((ty - y) * i) / n;
    if (!terrain.inBounds(Math.floor(px), Math.floor(py))) break;
    if (!terrain.getTile(Math.floor(px), Math.floor(py)).biome.isWater) break;
    path.push({ x: px, y: py });
  }
  return path;
}

function nearestWater(terrain, x, y, r = 14) {
  let best = null;
  let bd = Infinity;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const tx = Math.floor(x) + dx;
      const ty = Math.floor(y) + dy;
      if (!terrain.inBounds(tx, ty) || !terrain.getTile(tx, ty).biome.isWater) continue;
      const d = Math.hypot(dx, dy);
      if (d < bd) { bd = d; best = { x: tx + 0.5, y: ty + 0.5 }; }
    }
  }
  return best;
}

export function aquaticAI(ent, world, random) {
  const { terrain, ecosystem } = world;
  const tile = terrain.getTile(Math.floor(ent.x), Math.floor(ent.y));
  // stranded on land: wriggle toward the nearest water
  if (!tile.biome.isWater) {
    const w = nearestWater(terrain, ent.x, ent.y);
    ent.state = 'FLEE';
    ent.activity = 'Stranded';
    if (w) ent.path = [{ x: w.x, y: w.y }];
    return true;
  }
  ent.breath = 100;
  ent.isDrowning = false;
  const range = ent.stats.perceptionRange;
  const near = ent.creaturesNear(world, range).filter(e => e.alive && e !== ent && e.aquatic);
  const carnivore = ent.traits.carnivory > 0.5;

  // 1. flee from bigger hunters
  const threat = near.find(e => e.traits.carnivory > 0.5 && e.stats.sizeScale > ent.stats.sizeScale * 1.25 && e.species !== ent.species);
  if (threat && ent.traits.aggression < 0.7) {
    const dx = ent.x - threat.x;
    const dy = ent.y - threat.y;
    const len = Math.hypot(dx, dy) || 1;
    ent.state = 'FLEE';
    ent.path = swimPath(terrain, ent.x, ent.y, ent.x + (dx / len) * 7, ent.y + (dy / len) * 7);
    if (ent.path.length) return true;
  }

  // 2. predators hunt smaller swimmers
  if (carnivore && ent.hunger > 35) {
    let prey = null;
    let pd = Infinity;
    for (const e of near) {
      if (e.species === ent.species || e.stats.sizeScale > ent.stats.sizeScale * 0.8 || e.traits.carnivory > ent.traits.carnivory + 0.2) continue;
      const d = Math.hypot(e.x - ent.x, e.y - ent.y);
      if (d < pd) { pd = d; prey = e; }
    }
    if (prey) {
      ent.state = 'HUNT';
      if (pd < 1.5) {
        prey.die(`Eaten by a ${ent.species ? ent.species.name : 'predator'}`);
        ent.hunger = Math.max(0, ent.hunger - 100); // (a big meal: sharks and tuna do not eat all day)
        ent.kills = (ent.kills || 0) + 1;
        ent.actionCooldown = 2;
      } else {
        ent.path = swimPath(terrain, ent.x, ent.y, prey.x, prey.y);
      }
      return true;
    }
  }

  // 3. filter feeding on plankton: richest in the shallows, thinner the more of us share the water
  if (!carnivore || ent.traits.herbivory > 0.3) {
    if (ent.hunger > 30) {
      let crowd = 0;
      for (const e of near) if (!e.traits || e.traits.carnivory < 0.5) crowd++;
      const eff = Math.max(0.05, 1 - crowd / 9) * (PLANKTON[tile.biome.id] || 0.6) * (0.4 + 0.6 * ent.traits.herbivory);
      ent.state = 'GRAZE';
      ent.hunger = Math.max(0, ent.hunger - 28 * eff);
      ent.actionCooldown = 0.8;
      return true;
    }
  }

  // hungry hunters with no prey in sight pick at scraps and carrion (a fraction of what a filter feeder gets)
  if (carnivore && ent.hunger > 80) {
    ent.state = 'GRAZE';
    ent.hunger = Math.max(0, ent.hunger - 4 * (PLANKTON[tile.biome.id] || 0.6));
    ent.actionCooldown = 0.8;
    return true;
  }

  // 4. mate with a neighbour of the same kind
  if (ent.readyToMate && ent.readyToMate(near)) {
    const partner = near.find(e => ent.canMateWith(e) && Math.hypot(e.x - ent.x, e.y - ent.y) < 2.5);
    if (partner) {
      const mother = ent.sex === 'F' ? ent : partner;
      const father = ent.sex === 'F' ? partner : ent;
      ecosystem.tryConceive(father, mother);
      ent.state = 'COURT';
      return true;
    }
  }

  // 5. drift along: schools stay together, others wander
  ent.state = 'WANDER';
  if (ent.path.length === 0) {
    const mate = ent.traits.sociality > 0.45 ? near.find(e => e.species === ent.species) : null;
    const tx = mate ? mate.x + (random() - 0.5) * 3 : ent.x + (random() - 0.5) * 16;
    const ty = mate ? mate.y + (random() - 0.5) * 3 : ent.y + (random() - 0.5) * 16;
    ent.path = swimPath(terrain, ent.x, ent.y, tx, ty);
  }
  return true;
}
