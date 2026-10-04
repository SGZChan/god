// Livestock: domesticated animals that live in a settlement's pens. Herders tame wild grazers and lead them into a
// pen; inside, the animals graze and are fed, they mate as animals do (calves belong to the same pen), and the herder
// slaughters the surplus for meat (and shears them for fibre). Nothing appears from nowhere: every head of
// livestock was once a wild animal, or was born in the pen. (Wild game is hunted by hunters, see jobs.js.)
//
//   entity.penId     building id of the pen an animal lives in (null: wild)
//   penAnimals(ecosystem, pen)              the living animals of a pen
//   PEN_CAPACITY                            animals per pen tile area unit (a 3x3 pen holds 6)
//   tameable(ent)                           can this wild creature be domesticated?
//   livestockAI(ent, world)                 behaviour of an animal in a pen; true when it handled the decision
export const PEN_CAPACITY = 6;

export function penAnimals(ecosystem, pen) {
  const out = [];
  for (const e of ecosystem.entities) if (e.alive && e.penId === pen.id) out.push(e);
  return out;
}

// Grazers and gentle omnivores of a reasonable size; never sapients, predators or the god's creations
export function tameable(ent) {
  return ent.alive && !ent.isSapient && !ent.penId && !ent.isSpecialIndividual && ent.traits
    && ent.traits.carnivory < 0.45 && ent.traits.aggression < 0.6 && ent.isAdult;
}

function insidePen(ent, pen) {
  return ent.x >= pen.x + 0.2 && ent.x <= pen.x + pen.w - 0.2 && ent.y >= pen.y + 0.2 && ent.y <= pen.y + pen.h - 0.2;
}

// An animal in a pen stays inside it: it eats what grows there, mates with its pen-mates and otherwise mills about.
export function livestockAI(ent, world, random) {
  const pen = world.terrain.getBuilding(ent.penId);
  if (!pen || pen.type !== 'pen' || pen.progress < 1) { ent.penId = null; return false; } // the pen is gone: feral again
  ent.homeX = pen.x + pen.w / 2;
  ent.homeY = pen.y + pen.h / 2;
  // mate with a pen-mate, but only while the pen has room (a full pen does not breed: the herder culls first)
  if (ent.readyToMate && ent.readyToMate([])) {
    let herd = 0;
    let partner = null;
    for (const other of world.ecosystem.entities) {
      if (!other.alive || other.penId !== ent.penId) continue;
      herd++;
      if (!partner && other !== ent && ent.canMateWith(other) && Math.hypot(other.x - ent.x, other.y - ent.y) < 2.5) partner = other;
    }
    if (partner && herd < PEN_CAPACITY) {
      const mother = ent.sex === 'F' ? ent : partner;
      const father = ent.sex === 'F' ? partner : ent;
      world.ecosystem.tryConceive(father, mother);
      ent.state = 'COURT';
      return true;
    }
  }
  // graze the pen
  const tile = world.terrain.getTile(Math.floor(ent.x), Math.floor(ent.y));
  if (ent.hunger > 35 && tile && tile.flora > 5) {
    tile.flora = Math.max(0, tile.flora - 10);
    ent.hunger = Math.max(0, ent.hunger - 25);
    ent.state = 'GRAZE';
    return true;
  }
  // mill about inside the fence
  ent.state = 'PENNED';
  if (!insidePen(ent, pen) || ent.path.length === 0) {
    const tx = pen.x + 0.5 + random() * (pen.w - 1);
    const ty = pen.y + 0.5 + random() * (pen.h - 1);
    ent.path = [{ x: tx, y: ty }];
  }
  return true;
}
