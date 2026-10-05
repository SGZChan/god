// War sprites. Two kinds, both pure pixel data (testable without a browser):
//   gearPixels(unit, anim, bob, civColor)    what a soldier wears and carries, painted over the 20x20 creature sprite
//   vehicleSprite(gear, civColor, anim)      { w, h, pixels: [[x, y, '#colour']] }: a catapult, tank, plane, walker...
//                                            facing right; `anim` 'fire' shows the recoil and muzzle flash
// Unit classes and their ages: civilization/military.js.
import { UNITS } from '../civilization/military.js';

const WOOD = '#8b5a2b';
const WOOD_D = '#5b3a1d';
const STEEL = '#cbd5e1';
const STEEL_D = '#64748b';
const IRON = '#94a3b8';
const BRONZE = '#c28a3a';
const GOLD = '#f2c744';
const DARK = '#334155';
const BLACK = '#1c1822';
const KHAKI = '#8a8a52';
const KHAKI_D = '#6a6a3a';
const FLASH = '#fde047';
const ORANGE = '#fb923c';
const CYAN = '#67e8f9';
const RED = '#ef4444';

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const c = k => Math.max(0, Math.min(255, Math.round(((n >> k) & 255) * f))).toString(16).padStart(2, '0');
  return `#${c(16)}${c(8)}${c(0)}`;
}

class Pix {
  constructor(w = 0, h = 0) { this.w = w; this.h = h; this.pixels = []; }
  px(x, y, c) { this.pixels.push([x, y, c]); return this; }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c); return this; }
  line(x0, y0, x1, y1, c) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) this.px(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), c);
    return this;
  }
  disc(cx, cy, r, c) { for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + 0.5) this.px(cx + x, cy + y, c); return this; }
}

// ---------- soldiers: helmets, armour, shields, weapons ----------

const HELMET = {
  clubman: null, slinger: BRONZE, spearman: BRONZE, archer: '#3f6b3a', swordsman: IRON, knight: STEEL, crossbowman: IRON,
  rifleman: KHAKI_D, gunner: STEEL_D, marine: null, trooper: DARK
};

export function gearPixels(unit, anim = null, bob = 0, civColor = '#38bdf8') {
  const U = UNITS[unit];
  if (!U || U.kind !== 'foot') return [];
  const g = new Pix();
  const acting = Boolean(anim);
  const gear = U.gear;
  // helmet / headgear (rows 1-3 of the sprite)
  const hc = HELMET[unit];
  if (hc) {
    g.rect(6, 1, 8, 2, hc);
    g.rect(5, 3, 10, 1, shade(hc, 0.75));
    if (unit === 'knight') { g.rect(6, 3, 8, 3, hc); g.rect(7, 4, 6, 1, BLACK); g.rect(9, 0, 2, 1, civColor); g.px(9, -1, civColor); } // great helm, slit, plume
    if (unit === 'swordsman') g.rect(7, 0, 6, 1, RED);                                                                                   // crest
    if (unit === 'spearman') g.px(9, 0, hc), g.px(10, 0, hc);
    if (unit === 'crossbowman') g.rect(4, 3, 12, 1, shade(hc, 0.85));                                                                    // wide kettle brim
  }
  if (unit === 'marine') {
    g.rect(5, 1, 10, 4, '#e2e8f0'); g.rect(5, 1, 10, 1, shade(civColor, 1.1));
    g.rect(7, 3, 2, 1, RED); g.rect(11, 3, 2, 1, RED);                         // red eye lenses
    g.rect(2, 8, 3, 3, civColor); g.rect(15, 8, 3, 3, civColor);               // pauldrons
    g.rect(6, 9, 8, 5, shade(civColor, 0.8)); g.px(9, 10, GOLD); g.px(10, 10, GOLD); g.px(9, 11, GOLD); g.px(10, 11, GOLD);
  }
  if (unit === 'trooper') {
    g.rect(6, 3, 8, 1, CYAN);                                                  // visor
    g.rect(6, 9, 8, 5, DARK); g.rect(8, 10, 4, 1, CYAN);
  }
  // body armour and clothing
  if (unit === 'knight') { g.rect(5, 9, 10, 5, STEEL); g.rect(5, 9, 10, 1, '#f1f5f9'); g.rect(9, 10, 2, 4, civColor); }
  else if (unit === 'swordsman' || unit === 'spearman') { g.rect(6, 9, 8, 4, unit === 'swordsman' ? IRON : BRONZE); g.rect(6, 13, 8, 1, shade(civColor, 0.9)); }
  else if (unit === 'rifleman') { g.rect(5, 9, 10, 5, KHAKI); g.rect(5, 13, 10, 1, KHAKI_D); g.line(5, 9, 14, 13, '#6b4f2a'); }
  else if (unit === 'gunner') { g.rect(5, 9, 10, 5, KHAKI); g.line(5, 12, 14, 12, FLASH); }                 // ammunition belt
  else if (unit === 'archer') { g.rect(6, 9, 8, 4, '#4f7f46'); g.rect(13, 7, 2, 6, WOOD); g.px(13, 6, STEEL); g.px(14, 6, STEEL); } // quiver
  else if (unit === 'clubman') g.rect(5, 9, 10, 2, '#6b4f2a');                                               // a pelt over the shoulders
  // shields on the left arm
  if (U.shield) {
    const sc = unit === 'knight' ? civColor : (unit === 'swordsman' ? civColor : BRONZE);
    g.rect(1, 9, 4, 5, shade(sc, 0.9)); g.rect(1, 9, 4, 1, STEEL); g.rect(1, 13, 4, 1, STEEL_D); g.px(2, 11, GOLD);
    if (unit === 'spearman') { g.rect(1, 9, 4, 5, WOOD); g.rect(2, 10, 2, 3, shade(civColor, 1)); g.px(2, 9, BRONZE); }
  }
  // weapons in the right hand, ready or in action
  const hx = 17;
  switch (gear) {
    case 'club':
      if (acting) { g.line(15, 14, 19, 9, WOOD); g.rect(18, 7, 2, 3, WOOD_D); } else { g.line(hx, 6, hx, 14, WOOD); g.rect(hx - 1, 4, 3, 3, WOOD_D); }
      break;
    case 'sling':
      if (acting) { g.line(14, 9, 19, 8, '#a16207'); g.px(19, 7, STEEL); } else { g.line(hx, 11, hx + 1, 7, '#a16207'); g.px(hx + 1, 6, STEEL); }
      break;
    case 'spear':
      if (acting) { g.line(11, 11, 19, 10, WOOD); g.px(19, 10, STEEL); g.px(19, 9, STEEL); } else { g.line(hx, 3, hx, 15, WOOD); g.px(hx, 2, STEEL); g.px(hx, 1, STEEL); g.px(hx - 1, 3, STEEL); g.px(hx + 1, 3, STEEL); }
      break;
    case 'sword':
      if (acting) { g.line(15, 14, 19, 8, STEEL); g.line(15, 15, 16, 14, WOOD); g.px(14, 13, GOLD); } else { g.line(hx, 5, hx, 12, STEEL); g.px(hx - 1, 12, GOLD); g.px(hx + 1, 12, GOLD); g.px(hx, 13, WOOD); }
      break;
    case 'lance':
      if (acting) { g.line(10, 11, 19, 10, WOOD); g.px(19, 10, STEEL); g.px(18, 9, civColor); g.px(17, 9, civColor); g.px(16, 9, civColor); } else { g.line(hx + 1, 0, hx + 1, 15, WOOD); g.px(hx + 1, 0, STEEL); g.rect(hx + 2, 1, 2, 3, civColor); }
      break;
    case 'bow':
      g.line(18, 5, 19, 7, WOOD); g.line(19, 7, 19, 10, WOOD); g.line(19, 10, 18, 13, WOOD);
      if (acting) { g.line(18, 5, 14, 9, '#e2e8f0'); g.line(18, 13, 14, 9, '#e2e8f0'); g.line(11, 9, 19, 9, WOOD); g.px(19, 9, STEEL); } else g.line(18, 5, 18, 13, '#e2e8f0');
      break;
    case 'crossbow':
      g.line(12, 11, 19, 11, WOOD); g.line(17, 8, 17, 14, WOOD_D); g.line(17, 8, 19, 11, '#e2e8f0'); g.line(17, 14, 19, 11, '#e2e8f0');
      if (acting) g.line(15, 11, 19, 11, STEEL);
      break;
    case 'rifle':
      g.line(11, 12, 19, 9, '#6b4f2a'); g.line(15, 10, 19, 9, STEEL_D); if (acting) { g.px(19, 8, FLASH); g.px(18, 8, ORANGE); g.px(19, 7, FLASH); }
      break;
    case 'mg':
      g.rect(11, 10, 8, 2, DARK); g.line(15, 12, 13, 15, STEEL_D); g.line(15, 12, 17, 15, STEEL_D); if (acting) { g.px(19, 10, FLASH); g.px(19, 11, ORANGE); g.px(18, 9, FLASH); }
      break;
    case 'bolter':
      g.rect(12, 9, 8, 3, DARK); g.rect(12, 9, 8, 1, GOLD); g.rect(15, 12, 2, 2, STEEL_D); if (acting) { g.px(19, 9, ORANGE); g.px(19, 10, FLASH); g.px(18, 8, ORANGE); }
      break;
    case 'laser':
      g.rect(12, 10, 8, 2, DARK); g.line(15, 10, 19, 10, CYAN); if (acting) { g.px(19, 9, CYAN); g.px(19, 11, CYAN); g.px(18, 10, '#ffffff'); }
      break;
    default:
  }
  return g.pixels.map(([x, y, c]) => [x, y + bob, c]);
}

// ---------- machines ----------

export const VEHICLE_SIZE = { catapult: [28, 19], trebuchet: [30, 26], cannon: [28, 16], tank: [30, 16], plane: [32, 16], walker: [26, 30], gravtank: [34, 18], starfighter: [30, 14] };

export function vehicleSprite(gear, civColor = '#38bdf8', anim = null) {
  const [w, h] = VEHICLE_SIZE[gear] || [24, 16];
  const g = new Pix(w, h);
  const fire = Boolean(anim);
  const hull = civColor;
  const hullD = shade(civColor, 0.65);
  const hullL = shade(civColor, 1.25);
  const wheel = (cx, cy, r) => { g.disc(cx, cy, r, BLACK); g.disc(cx, cy, Math.max(1, r - 2), WOOD); g.px(cx, cy, STEEL_D); };
  switch (gear) {
    case 'catapult': {
      g.rect(3, 11, 20, 3, WOOD); g.rect(3, 11, 20, 1, '#b07a43'); wheel(7, 15, 3); wheel(19, 15, 3);
      g.rect(10, 5, 2, 7, WOOD_D);                                             // upright
      if (fire) { g.line(11, 6, 19, 1, WOOD); g.disc(20, 1, 2, '#7a746a'); } // arm thrown forward, boulder gone
      else { g.line(11, 6, 5, 3, WOOD); g.rect(3, 2, 4, 3, '#a16207'); g.disc(4, 1, 1, '#7a746a'); }
      g.rect(21, 9, 4, 2, civColor);
      break;
    }
    case 'trebuchet': {
      g.rect(4, 22, 24, 3, WOOD); g.line(8, 22, 14, 4, WOOD_D); g.line(20, 22, 14, 4, WOOD_D); g.line(11, 14, 17, 14, WOOD_D);
      if (fire) { g.line(14, 5, 26, 2, WOOD); g.rect(2, 12, 5, 5, DARK); g.px(27, 1, '#7a746a'); }
      else { g.line(14, 5, 4, 12, WOOD); g.rect(1, 11, 5, 5, DARK); g.disc(25, 21, 1, '#7a746a'); }
      g.rect(24, 20, 4, 2, civColor);
      break;
    }
    case 'cannon': {
      g.rect(5, 9, 10, 3, WOOD_D); wheel(8, 12, 3);
      const rec = fire ? -1 : 0;
      g.rect(8 + rec, 6, 17, 3, '#3f4654'); g.rect(8 + rec, 6, 17, 1, '#6b7280'); g.rect(23 + rec, 5, 3, 5, '#2b303b');
      if (fire) { g.disc(27, 7, 2, FLASH); g.px(26, 6, ORANGE); g.px(27, 4, '#e2e8f0'); }
      g.rect(2, 10, 4, 2, civColor);
      break;
    }
    case 'tank': {
      g.rect(2, 11, 26, 5, '#2b303b'); for (let x = 3; x < 27; x += 3) g.disc(x, 14, 1, STEEL_D);   // tracks and road wheels
      g.rect(3, 6, 24, 5, hull); g.rect(3, 6, 24, 1, hullL); g.rect(3, 10, 24, 1, hullD);           // hull
      g.rect(10, 2, 10, 5, hull); g.rect(10, 2, 10, 1, hullL); g.px(15, 1, STEEL_D);              // turret and hatch
      const rec = fire ? -2 : 0;
      g.rect(19 + rec, 3, 10, 2, '#3f4654');                                                         // gun
      if (fire) { g.disc(29, 4, 2, FLASH); g.px(28, 2, ORANGE); }
      g.rect(5, 7, 3, 2, civColor);
      break;
    }
    case 'plane': {
      g.rect(5, 7, 20, 3, '#9aa6b6'); g.rect(5, 7, 20, 1, '#cbd5e1'); g.rect(22, 6, 6, 4, hull);   // fuselage and nose
      g.rect(8, 4, 12, 2, hull); g.rect(8, 11, 12, 2, hullD);                                      // wings
      g.rect(2, 3, 3, 5, hullD); g.rect(2, 7, 5, 2, hullD);                                        // tail
      g.rect(14, 5, 4, 2, '#7dd3fc');                                                              // canopy
      g.line(29, 5, 29, 11, STEEL);                                                                // propeller disc
      if (fire) { g.px(30, 8, FLASH); g.px(31, 8, ORANGE); g.px(30, 6, FLASH); }
      break;
    }
    case 'walker': {
      g.rect(8, 22, 4, 7, '#3f4654'); g.rect(14, 22, 4, 7, '#3f4654'); g.rect(7, 28, 6, 2, DARK); g.rect(13, 28, 6, 2, DARK); // legs
      g.rect(6, 10, 14, 12, hull); g.rect(6, 10, 14, 2, hullL); g.rect(6, 20, 14, 2, hullD);       // torso
      g.rect(9, 4, 8, 6, shade(hull, 0.9)); g.rect(10, 6, 6, 2, fire ? FLASH : RED);               // head with a glowing visor
      g.rect(1, 10, 6, 6, hullD); g.rect(19, 10, 6, 6, hullD);                                      // shoulders
      g.rect(20, 14, 6, 3, '#2b303b'); if (fire) { g.disc(26, 15, 2, ORANGE); g.px(25, 14, FLASH); } // arm cannon
      g.px(13, 14, GOLD); g.px(12, 14, GOLD); g.px(14, 14, GOLD);
      break;
    }
    case 'gravtank': {
      g.rect(3, 7, 28, 6, hull); g.rect(3, 7, 28, 1, hullL); g.rect(6, 4, 20, 3, shade(hull, 0.9)); g.rect(1, 9, 3, 3, hullD); // angular hull
      g.rect(26, 5, 8, 2, '#2b303b'); g.rect(26, 9, 8, 2, '#2b303b');                                // twin cannons
      g.rect(5, 13, 24, 1, CYAN); g.rect(8, 14, 18, 1, shade(CYAN, 0.6)); g.rect(11, 15, 12, 1, shade(CYAN, 0.35)); // anti-gravity glow
      g.px(16, 6, GOLD); g.px(17, 6, GOLD);
      if (fire) { g.disc(34, 6, 2, ORANGE); g.disc(34, 10, 2, ORANGE); }
      break;
    }
    case 'starfighter': {
      g.rect(8, 6, 18, 3, '#cbd5e1'); g.rect(24, 6, 4, 3, hull); g.px(29, 7, hull);                  // fuselage
      g.line(10, 6, 2, 1, hullD); g.line(10, 9, 2, 13, hullD); g.rect(2, 1, 5, 1, hullD); g.rect(2, 12, 5, 1, hullD); // swept wings
      g.rect(1, 6, 4, 3, shade(CYAN, 0.7)); g.px(0, 7, CYAN);                                          // engine glow
      g.rect(18, 5, 4, 1, '#7dd3fc');
      if (fire) { g.line(29, 7, 29, 7, '#ffffff'); g.px(29, 6, RED); g.px(29, 8, RED); }
      break;
    }
    default:
  }
  return { w, h, pixels: g.pixels };
}
