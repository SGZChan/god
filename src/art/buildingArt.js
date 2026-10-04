// The drawing routines behind buildingSprites.js: palettes, props and one archetype function per kind of
// building. Everything draws into pixel buffers (pixelKit.js) in a sprite frame where the footprint's front
// edge is the row c.fy1 and the building rises above it. Layers: c.body (walls, details) and c.roof (drawn
// over the body, and growing last while a building is under construction).
import { hex, shade, mix, hash, brick, logs, planks, plaster, roofPlane, snowOnRoof } from './pixelKit.js';
import { TILE_PX } from '../world/buildings.js';
import { drawAgeBuilding } from './eraArchitecture.js';

const T = TILE_PX;

// ---------- palettes ----------

const STONE = { mid: hex('#8087a5'), hi: hex('#a9afc9'), lo: hex('#6a7192'), mortar: hex('#4b5073'), cap: hex('#c2c6d8'), capHi: hex('#e0e3ef'), capLo: hex('#9a9fba'), deep: hex('#262a40') };
const SAND = { mid: hex('#d1ae72'), hi: hex('#ecd09a'), lo: hex('#b68f55'), mortar: hex('#8c6a3c'), cap: hex('#e9d09a'), capHi: hex('#f8e6bc'), capLo: hex('#c6a468'), deep: hex('#47331e') };
const WARM = { mid: hex('#8c7a68'), hi: hex('#aa987f'), lo: hex('#6f604f'), mortar: hex('#463b30'), cap: hex('#c1b199'), capHi: hex('#ddd0b8'), capLo: hex('#988874'), deep: hex('#2c241c') };
const LOG = { mid: hex('#8d5d31'), hi: hex('#bc844a'), lo: hex('#5b3a1d'), ring: hex('#dcae6a') };
const ADOBE = { mid: hex('#cfa968'), hi: hex('#e6c987'), lo: hex('#a98046'), ring: hex('#e9d29a') };

export const ROOFS = {
  metal: [hex('#e6ebf2'), hex('#c3ccd8'), hex('#9aa6b6'), hex('#5f6b7c')],
  thatch: [hex('#e2c56e'), hex('#c6a34c'), hex('#9b7933'), hex('#5e4a20')],
  shingle: [hex('#b07c50'), hex('#8c5c38'), hex('#6a4328'), hex('#412819')],
  tile: [hex('#e58552'), hex('#c45f34'), hex('#9a4326'), hex('#612a19')],
  slate: [hex('#93a0be'), hex('#6e7b9c'), hex('#515d7c'), hex('#2f3750')],
  hide: [hex('#eadcb6'), hex('#cdb88c'), hex('#a8926a'), hex('#6c5a3a')],
  snow: [hex('#ffffff'), hex('#eef3fb'), hex('#c8d6ea'), hex('#8fa3c2')]
};

export function paletteOf(style) {
  const kind = (style && style.pal) || 'stone';
  const accent = hex((style && style.accent) || '#c0392b');
  const brickPal = kind === 'sandstone' ? SAND : (kind === 'timber' ? WARM : STONE);
  const logPal = kind === 'sandstone' ? ADOBE : LOG;
  return {
    kind,
    snow: Boolean(style && style.snow),
    accent,
    accentLo: shade(accent, 0.65),
    accentHi: shade(accent, 1.25),
    brick: brickPal,
    log: logPal,
    plaster: kind === 'sandstone' ? hex('#ecd9b0') : hex('#dccfa8'),
    beam: kind === 'sandstone' ? hex('#7a5530') : hex('#573719'),
    wood: hex('#7a4a24'),
    woodLo: hex('#4c2c14'),
    woodHi: hex('#a8703a'),
    door: hex('#3e2410'),
    doorHi: hex('#6b4222'),
    glass: hex('#243049'),
    glassHi: hex('#5a7096'),
    glow: hex('#ffd36a'),
    glowLo: hex('#f08a2a'),
    dark: hex('#1b1722'),
    dirt: hex('#8a5e3a'),
    dirtLo: hex('#6c4829'),
    grass: hex('#4f8a3a'),
    outline: kind === 'sandstone' ? SAND.deep : hex('#241c2a')
  };
}

// ---------- shared pieces ----------

const BR = P => ({ mid: P.brick.mid, hi: P.brick.hi, lo: P.brick.lo, mortar: P.brick.mortar });
const LG = P => ({ mid: P.log.mid, hi: P.log.hi, lo: P.log.lo, ring: P.log.ring });

function wallFill(p, kind, x, y, w, h, P, seed) {
  if (kind === 'log') logs(p, x, y, w, h, LG(P), seed);
  else if (kind === 'plank') planks(p, x, y, w, h, LG(P), seed);
  else if (kind === 'plaster') plaster(p, x, y, w, h, P, seed);
  else brick(p, x, y, w, h, BR(P), seed);
}

function windowAt(p, x, y, w, h, P, lit, arch = false) {
  p.rect(x - 1, y - 1, w + 2, h + 2, shade(P.brick.hi, 1.05));
  p.rect(x, y, w, h, lit ? P.glow : P.glass);
  if (lit) {
    p.rect(x, y + h - 2, w, 2, P.glowLo);
  } else {
    p.set(x + 1, y + 1, P.glassHi);
    p.set(x + 1, y + 2, P.glassHi);
  }
  p.vline(x + (w >> 1), y, h, P.woodLo);
  if (h > 4) p.hline(x, y + (h >> 1) - 1, w, P.woodLo);
  p.hline(x - 1, y + h + 1, w + 2, shade(P.brick.lo, 0.8)); // sill shadow
  if (arch) {
    p.set(x - 1, y - 1, 0, 0);
    p.set(x + w, y - 1, 0, 0);
  }
}

function slit(p, x, y, h, P, lit = false) {
  p.rect(x - 1, y - 1, 4, h + 2, P.brick.hi);
  p.rect(x, y, 2, h, lit ? P.glow : P.dark);
  p.set(x, y + 1, lit ? P.glowLo : shade(P.glass, 0.8));
}

// A door `dw` x `dh` standing on row `bottom` (exclusive), centred on cx. `arch` rounds the top and adds a stone frame.
function doorAt(p, cx, bottom, dw, dh, P, arch = false, iron = false) {
  const x = Math.round(cx - dw / 2);
  const y = bottom - dh;
  if (arch) {
    p.rect(x - 2, y - 2, dw + 4, dh + 2, P.brick.hi);
    p.rect(x - 1, y - 1, dw + 2, dh + 1, P.brick.lo);
  } else {
    p.rect(x - 1, y - 1, dw + 2, dh + 1, P.woodLo);
  }
  p.rect(x, y, dw, dh, P.door);
  for (let i = 1; i < dw - 1; i += 3) p.vline(x + i, y + 1, dh - 1, shade(P.door, 0.8));
  p.hline(x, y, dw, shade(P.door, 0.7));
  if (arch) {
    p.set(x, y, P.brick.lo);
    p.set(x + dw - 1, y, P.brick.lo);
    p.set(x - 1, y - 1, P.brick.hi);
    p.set(x + dw, y - 1, P.brick.hi);
    p.hline(x + 1, y - 2, dw - 2, P.brick.capHi || P.brick.hi);
  }
  if (iron) {
    p.hline(x, y + 3, dw, P.dark);
    p.hline(x, y + dh - 4, dw, P.dark);
  }
  p.set(x + dw - 2, y + (dh >> 1), P.glow);                    // handle
  p.hline(x - 1, bottom, dw + 2, shade(P.brick.lo, 0.85));     // threshold
  p.hline(x - 2, bottom + 1, dw + 4, shade(P.brick.hi, 0.85));  // step
}

function barrel(p, x, y, P) {
  p.rect(x, y - 6, 5, 6, P.wood);
  p.hline(x, y - 5, 5, P.woodHi);
  p.hline(x, y - 4, 5, P.woodLo);
  p.hline(x, y - 2, 5, P.woodLo);
  p.set(x, y - 6, 0, 0);
  p.set(x + 4, y - 6, 0, 0);
}

function crate(p, x, y, s, P) {
  p.rect(x, y - s, s, s, P.woodHi);
  p.rect(x, y - s, s, 1, shade(P.woodHi, 1.2));
  p.rect(x, y - 1, s, 1, P.woodLo);
  p.rect(x + s - 1, y - s, 1, s, P.woodLo);
  p.hline(x, y - (s >> 1), s, P.wood);
}

function logPile(p, x, y, n, P) {
  for (let r = 0; r < n; r++) {
    const cnt = n - r;
    for (let i = 0; i < cnt; i++) {
      const lx = x + i * 5 + r * 2;
      const ly = y - r * 4;
      p.rect(lx, ly - 4, 5, 4, P.log.mid);
      p.hline(lx, ly - 4, 5, P.log.hi);
      p.hline(lx, ly - 1, 5, P.log.lo);
      p.set(lx + 4, ly - 3, P.log.ring);
      p.set(lx + 4, ly - 2, P.log.ring);
    }
  }
}

function sack(p, x, y, P) {
  p.rect(x, y - 5, 5, 5, hex('#d9c79a'));
  p.set(x + 1, y - 6, hex('#d9c79a'));
  p.set(x + 3, y - 6, hex('#d9c79a'));
  p.vline(x + 4, y - 5, 5, hex('#b09a68'));
  p.hline(x + 1, y - 4, 3, hex('#b09a68'));
}

function flame(p, x, y, P, h = 5) {
  p.rect(x, y - h, 3, h, P.glowLo);
  p.rect(x + 1, y - h - 1, 1, 2, P.glow);
  p.rect(x + 1, y - h + 1, 1, h - 2, hex('#fff2b0'));
}

function flag(p, x, bottom, h, P, w = 8) {
  p.vline(x, bottom - h, h, P.woodLo);
  p.rect(x + 1, bottom - h, w, 5, P.accent);
  p.hline(x + 1, bottom - h, w, P.accentHi);
  p.hline(x + 1, bottom - h + 4, w, P.accentLo);
  p.set(x + w, bottom - h + 1, 0, 0);
  p.set(x + w, bottom - h + 3, 0, 0);
}

// Crenellated stone block: lit platform on top, merlons along the front edge, brick face below.
function crenBlock(p, x, top, w, bottom, P, seed, { tf = 7, merlon = 4, gap = 3 } = {}) {
  const B = P.brick;
  // platform (the top face seen from above)
  for (let y = top; y < top + tf; y++) {
    for (let xx = x; xx < x + w; xx++) {
      const t = (y - top) / tf;
      let c = mix(B.capHi, B.cap, t * 0.9);
      if (hash(xx, y, seed) > 0.9) c = shade(c, 0.94);
      if (xx >= x + w - 3) c = shade(c, 0.88);
      p.set(xx, y, c);
    }
  }
  p.hline(x, top, w, B.capLo);
  // back merlon teeth
  for (let xx = x + 1; xx < x + w - 2; xx += merlon + gap) {
    p.rect(xx, top - 2, merlon, 3, B.cap);
    p.hline(xx, top - 2, merlon, B.capHi);
    p.vline(xx + merlon - 1, top - 1, 2, B.capLo);
  }
  // brick face
  brick(p, x, top + tf, w, bottom - top - tf, BR(P), seed);
  // front merlons
  for (let xx = x; xx < x + w - 1; xx += merlon + gap) {
    const mw = Math.min(merlon, x + w - xx);
    p.rect(xx, top + tf - 4, mw, 4, B.cap);
    p.hline(xx, top + tf - 4, mw, B.capHi);
    p.vline(xx + mw - 1, top + tf - 3, 3, B.capLo);
    p.hline(xx, top + tf, mw, shade(B.mid, 0.82)); // shadow under each tooth
  }
  p.hline(x, top + tf, w, shade(B.mortar, 1.2));
}

function stoneShadowBand(p, x, y, w) {
  for (let i = 0; i < w; i++) p.set(x + i, y, 0x000000, 60);
}

// ---------- gabled houses and halls ----------

function gable(c, o) {
  // a building stamped with an age is drawn in that age's architecture (eraArchitecture.js)
  if (o.era !== undefined) return drawAgeBuilding(c, o, o.era, o.variant || 0);
  const { body, roof, P, def } = c;
  const bx0 = c.x0 + 1;
  const bx1 = c.x1 - 2;
  const bw = bx1 - bx0 + 1;
  const wallTop = c.fy1 - o.wallH;
  const seed = c.seed;
  wallFill(body, o.wall, bx0, wallTop, bw, o.wallH, P, seed);
  // stone footing
  if (o.wall !== 'brick') {
    body.rect(bx0, c.fy1 - 2, bw, 2, P.brick.lo);
    body.hline(bx0, c.fy1 - 2, bw, P.brick.hi);
  }
  stoneShadowBand(body, bx0, wallTop + 3, bw);
  // eave shadow
  body.hline(bx0, wallTop + 3, bw, shade(P.brick.mid, 0.6));

  const roofTop = o.chimney ? 8 : 3;
  const roofBottom = wallTop + 2;
  const rh = roofBottom - roofTop + 1;
  const inset = o.inset !== undefined ? o.inset : Math.min(bw * 0.3, rh * 0.5);
  const cols = P.snow ? ROOFS.snow : ROOFS[o.roof];
  roofPlane(roof, bx0 - 2, bx1 + 2, roofTop, roofBottom, inset, P.snow ? 'shingle' : (o.roof === 'metal' ? 'slate' : o.roof), cols, seed);
  // Space Age: solar panels on the roof
  if (o.solar && !P.snow) {
    const py = Math.round((roofTop + roofBottom) / 2);
    for (let k = 0; k < 3; k++) {
      const x = Math.round(bx0 + bw * (0.18 + k * 0.24));
      roof.rect(x, py, 6, 4, hex('#1e3a8a'));
      roof.hline(x, py, 6, hex('#60a5fa'));
      roof.vline(x + 3, py, 4, hex('#93c5fd'));
    }
  }
  if (o.trim) {
    roof.hline(bx0 - 2, roofBottom - 2, bw + 4, P.accent);
    roof.hline(bx0 - 2, roofBottom - 3, bw + 4, P.accentHi);
  }
  if (P.snow) snowOnRoof(roof, seed, 0.62);
  if (o.dormer) {
    const dx = Math.round(c.x0 + (c.W - 8) / 2) - 5;
    roof.rect(dx, roofTop + 4, 10, 7, shade(cols[1], 0.9));
    roof.rect(dx + 2, roofTop + 6, 6, 5, P.glass);
    roof.vline(dx + 5, roofTop + 6, 5, P.woodLo);
    roof.hline(dx - 1, roofTop + 3, 12, cols[0]);
  }

  // door and windows
  const doorCx = def.door ? c.x0 + (def.door.x + 0.5) * T : (c.x0 + c.x1) / 2;
  const dw = o.doorW || 6;
  const dh = Math.min(o.wallH - 3, o.doorH || 13);
  doorAt(body, doorCx, c.fy1, dw, dh, P, o.wall === 'brick' && o.archDoor !== false, false);
  const wy = wallTop + 5;
  const wh = Math.max(4, Math.min(7, o.wallH - 12));
  const n = o.windows || 0;
  const slotW = bw / (n + 1);
  const storeys = o.storeys || 1;
  for (let k = 0; k < storeys; k++) {
    const rowY = wy + k * 11;
    for (let i = 1; i <= n; i++) {
      const wx = Math.round(bx0 + slotW * i - 2);
      // the ground floor keeps room for the door; upper floors have a window in every slot
      if (k === storeys - 1 && Math.abs(wx + 2 - doorCx) < dw / 2 + 5) continue;
      if (rowY + wh > c.fy1 - dh - 1 && Math.abs(wx + 2 - doorCx) < dw / 2 + 5) continue;
      windowAt(body, wx, rowY, 5, wh, P, (o.lit === true) || (o.lit !== false && hash(i + k * 7, 1, seed) > 0.55), o.wall === 'brick');
    }
    if (k > 0) body.hline(bx0, rowY - 3, bw, shade(P.brick.mid, 0.75)); // floor band
  }
  if (o.sign) {
    body.vline(bx1 - 3, wallTop + 6, 8, P.woodLo);
    body.rect(bx1 - 8, wallTop + 8, 6, 5, P.accent);
    body.hline(bx1 - 8, wallTop + 8, 6, P.accentHi);
  }
  if (o.banner) flag(roof, bx0 + Math.round(bw / 2), roofTop + 6, 14, P, 8);

  // props
  const px = bx1 - 12;
  for (const pr of o.props || []) {
    if (pr === 'barrel') barrel(body, bx0 + 2, c.fy1 + 1, P);
    else if (pr === 'crate') crate(body, bx1 - 8, c.fy1 + 1, 6, P);
    else if (pr === 'sacks') { sack(body, bx0 + 3, c.fy1 + 1, P); sack(body, bx0 + 8, c.fy1 + 2, P); }
    else if (pr === 'logs') logPile(body, px + 4, c.fy1 + 2, 2, P);
  }
  // chimney
  if (o.chimney) {
    const cx = bx1 - Math.round(bw * 0.22) - 2;
    const top = roofTop - 6;
    const ch = roof;
    ch.rect(cx, top, 6, rh * 0.5 + 6, P.brick.mid);
    brick(ch, cx, top, 6, Math.floor(rh * 0.5 + 6), BR(P), seed + 3, { course: 3, bw: 6 });
    ch.rect(cx - 1, top - 1, 8, 3, P.brick.cap);
    ch.hline(cx - 1, top - 1, 8, P.brick.capHi);
    ch.rect(cx + 1, top + 1, 4, 1, P.dark);
    c.hooks.smoke.push({ x: cx + 3, y: top - 2 });
  }
  if (o.forge) {
    body.rect(bx0 + 4, c.fy1 - 9, 6, 7, P.dark);
    body.rect(bx0 + 5, c.fy1 - 4, 4, 2, P.glowLo);
    body.rect(bx0 + 6, c.fy1 - 4, 2, 1, P.glow);
  }
}

// ---------- individual archetypes ----------

function tent(c) {
  const { body, roof, P } = c;
  const bx0 = c.x0 + 1;
  const bx1 = c.x1 - 2;
  const bw = bx1 - bx0 + 1;
  const top = 6;
  const base = c.fy1 - 1;
  const cx = (bx0 + bx1) / 2;
  const cols = P.snow ? ROOFS.snow : ROOFS.hide;
  for (let y = top; y <= base; y++) {
    const t = (y - top) / (base - top);
    const half = Math.max(1, Math.round(t * (bw / 2)));
    for (let x = Math.round(cx - half); x <= Math.round(cx + half - 1); x++) {
      let col = cols[1];
      const seam = (x - Math.round(cx)) % 5 === 0;
      if (x < cx - half * 0.4) col = cols[0];
      else if (x > cx) col = cols[2];
      if (seam) col = shade(col, 0.82);
      if (hash(x, y, c.seed) > 0.93) col = shade(col, 0.9);
      if (x >= cx + half - 2) col = shade(col, 0.82);
      body.set(x, y, col);
    }
  }
  // door flap
  const fw = 5;
  for (let y = base - 9; y <= base; y++) {
    const half = Math.round(((y - (base - 9)) / 9) * fw * 0.5) + 1;
    for (let x = Math.round(cx - half); x < Math.round(cx + half); x++) body.set(x, y, y > base - 3 ? P.dark : shade(P.dark, 1.5));
  }
  // crossed poles and a pennant
  roof.vline(Math.round(cx) - 1, 0 + 1, 7, P.woodLo);
  roof.vline(Math.round(cx), 1, 7, P.wood);
  roof.set(Math.round(cx) - 2, 1, P.woodLo);
  roof.set(Math.round(cx) + 1, 1, P.wood);
  roof.rect(Math.round(cx) + 1, 2, 5, 3, P.accent);
  c.hooks.smoke.push({ x: Math.round(cx), y: 3 });
  // a fire pit and a crate
  body.rect(bx1 - 2, c.fy1 - 1, 6, 3, shade(P.brick.lo, 0.9));
  flame(body, bx1, c.fy1 - 1, P, 3);
}

function hut(c) {
  gable(c, { wall: 'log', wallH: 11, roof: 'thatch', inset: 12, windows: 0, doorH: 8, doorW: 5, archDoor: false, props: ['logs'], chimney: false });
  c.hooks.smoke.push({ x: Math.round(c.W / 2), y: 4 });
}

function well(c) {
  const { body, roof, P } = c;
  const cx = Math.round(c.W / 2);
  const rx = cx - 6;
  // stone ring
  brick(body, rx, c.fy1 - 8, 12, 8, BR(P), c.seed, { course: 3, bw: 6 });
  body.rect(rx - 1, c.fy1 - 10, 14, 3, P.brick.cap);
  body.hline(rx - 1, c.fy1 - 10, 14, P.brick.capHi);
  body.rect(rx + 2, c.fy1 - 9, 8, 2, P.glass);
  // frame and roof
  body.rect(rx, c.fy1 - 20, 2, 12, P.wood);
  body.rect(rx + 10, c.fy1 - 20, 2, 12, P.woodLo);
  roofPlane(roof, rx - 2, rx + 13, 2, 10, 4, 'shingle', P.snow ? ROOFS.snow : ROOFS.shingle, c.seed);
  body.vline(cx, c.fy1 - 18, 6, P.dark); // rope
  body.rect(cx - 1, c.fy1 - 12, 3, 3, P.wood); // bucket
}

function field(c, o) {
  const { body, P } = c;
  const x0 = c.x0;
  const w = c.W - c.x0 * 2;
  const top = c.fy0 + 2;
  const hgt = c.fy1 - top;
  const g = c.growth;
  for (let y = 0; y < hgt; y++) {
    for (let x = 0; x < w; x++) {
      const row = Math.floor(y / 3);
      let col = row % 2 ? P.dirt : shade(P.dirt, 1.18);
      if (y % 3 === 2) col = P.dirtLo;
      if (hash(x, y, c.seed) > 0.92) col = shade(col, 0.88);
      body.set(x0 + x, top + y, col);
    }
  }
  // crops on every other furrow
  const crop = o.crop === 'wheat' ? [hex('#e9c94a'), hex('#c9a02e')] : [hex('#6fb63a'), hex('#3f8a2a')];
  for (let y = 1; y < hgt - 1; y += 6) {
    for (let x = 1; x < w - 1; x += 2) {
      const grown = hash(x, y, c.seed + 7) < g * 1.1;
      if (!grown) continue;
      const hh = 2 + Math.round(g * 3 + hash(x, y, 3) * 2);
      body.vline(x0 + x, top + y + 2 - hh, hh + 1, crop[1]);
      body.set(x0 + x, top + y + 1 - hh, crop[0]);
      if (o.crop === 'wheat') body.set(x0 + x + (x % 4 ? 1 : -1), top + y + 2 - hh, crop[0]);
    }
  }
  // border fence posts at the corners and a scarecrow
  for (const [px, py] of [[x0, top], [x0 + w - 1, top], [x0, c.fy1 - 1], [x0 + w - 1, c.fy1 - 1]]) {
    body.rect(px, py - 3, 2, 4, P.woodLo);
  }
  const sx = x0 + w - 9;
  body.vline(sx, c.fy1 - 12, 11, P.woodLo);
  body.hline(sx - 3, c.fy1 - 10, 7, P.wood);
  body.rect(sx - 1, c.fy1 - 15, 3, 3, hex('#e6cf9a'));
  body.hline(sx - 2, c.fy1 - 16, 5, hex('#8a6a30'));
}

function pen(c) {
  const { body, P } = c;
  const x0 = c.x0;
  const w = c.W - c.x0 * 2;
  const top = c.fy0 + 4;
  const hgt = c.fy1 - top;
  for (let y = 0; y < hgt; y++) {
    for (let x = 0; x < w; x++) {
      const h = hash(x, y, c.seed);
      body.set(x0 + x, top + y, h > 0.85 ? hex('#b69a58') : (h > 0.4 ? hex('#7a6a3a') : hex('#6b5b32')));
    }
  }
  const posts = Math.max(3, Math.round(w / 9));
  const rail = (y) => { body.hline(x0, y, w, P.wood); body.hline(x0, y + 1, w, P.woodLo); };
  rail(c.fy1 - 9);
  body.hline(x0, top - 5, w, P.wood);
  body.hline(x0, top - 4, w, P.woodLo);
  for (let i = 0; i <= posts; i++) {
    const px = x0 + Math.round(((w - 2) * i) / posts);
    body.rect(px, top - 8, 2, 8, P.wood);
    body.rect(px, c.fy1 - 12, 2, 12, P.wood);
    body.vline(px, c.fy1 - 12, 12, P.woodHi);
  }
  const animals = Math.min(c.growth * 4, 3);
  for (let a = 0; a < animals; a++) {
    const ax = x0 + 6 + a * 11;
    const ay = top + 9 + (a % 2) * 7;
    body.rect(ax, ay, 7, 4, hex('#f1ece0'));
    body.hline(ax + 1, ay, 5, hex('#ffffff'));
    body.rect(ax + 6, ay + 1, 3, 3, hex('#3a342e'));
    body.vline(ax + 1, ay + 4, 2, hex('#3a342e'));
    body.vline(ax + 5, ay + 4, 2, hex('#3a342e'));
  }
  // hay and a trough
  body.rect(x0 + w - 12, top + 2, 10, 5, hex('#d6b04e'));
  body.hline(x0 + w - 12, top + 2, 10, hex('#f0d070'));
}

function market(c, o) {
  const { body, roof, P } = c;
  const x0 = c.x0;
  const w = c.W - c.x0 * 2;
  // cobbled square
  for (let y = c.fy1 - 9; y < c.fy1; y++) {
    for (let x = 0; x < w; x++) {
      const h = hash(x >> 1, y >> 1, c.seed);
      body.set(x0 + x, y, h > 0.7 ? hex('#a7a094') : (h > 0.3 ? hex('#8f897e') : hex('#7a746a')));
    }
  }
  const stalls = o.stalls;
  const sw = Math.floor((w - 2) / stalls);
  for (let i = 0; i < stalls; i++) {
    const sx = x0 + 1 + i * sw;
    const top = 10 + (i % 2) * 3;
    const awnBottom = c.fy1 - 12;
    // posts and counter
    body.rect(sx + 1, awnBottom, 2, 11, P.woodLo);
    body.rect(sx + sw - 4, awnBottom, 2, 11, P.woodLo);
    body.rect(sx, c.fy1 - 6, sw - 1, 5, P.wood);
    body.hline(sx, c.fy1 - 6, sw - 1, P.woodHi);
    // goods
    for (let g = 0; g < 4; g++) {
      const col = [hex('#d94a3a'), hex('#e6b83a'), hex('#6fb63a'), hex('#e8e0c8')][(i + g) % 4];
      body.rect(sx + 1 + g * 3, c.fy1 - 9, 2, 3, col);
    }
    // striped awning
    for (let y = top; y <= awnBottom; y++) {
      const t = (y - top) / (awnBottom - top);
      const ins = Math.round((1 - t) * 3);
      for (let x = sx - 1 + ins; x < sx + sw - ins; x++) {
        const stripe = (Math.floor((x - sx) / 3) % 2 === 0);
        let col = stripe ? P.accent : hex('#f2ecd8');
        if (P.snow && y < top + (awnBottom - top) * 0.5) col = hex('#f4f8fc');
        roof.set(x, y, y === awnBottom ? shade(col, 0.7) : shade(col, 1.05 - 0.15 * t));
      }
    }
    roof.hline(sx - 1, top, sw, P.accentHi);
  }
  if (stalls > 1) {
    barrel(body, x0 + w - 7, c.fy1 + 1, P);
    crate(body, x0 + 1, c.fy1 + 2, 6, P);
  }
}

function dock(c) {
  const { body, P } = c;
  const x0 = c.x0;
  const w = c.W - c.x0 * 2;
  const top = c.fy0 + 4;
  const planksN = Math.round(w / 4 * c.growth);
  // deck planks running toward the water (up the screen)
  for (let i = 0; i < Math.ceil(w / 4); i++) {
    if (i >= planksN) break;
    const col = hash(i, 1, c.seed) > 0.5 ? P.woodHi : hex('#b0793e');
    body.rect(x0 + i * 4, top, 3, c.fy1 - top, col);
    body.vline(x0 + i * 4 + 3, top, c.fy1 - top, P.woodLo);
  }
  for (let y = top + 4; y < c.fy1; y += 6) body.hline(x0, y, w, P.woodLo);
  // posts
  for (const px of [x0, x0 + w - 3]) for (const py of [top - 1, top + 12, c.fy1 - 4]) {
    body.rect(px, py - 4, 3, 6, P.woodLo);
    body.hline(px, py - 4, 3, P.woodHi);
  }
  // a rowing boat
  if (c.growth > 0.7) {
    const bx = x0 + w - 18;
    body.rect(bx, top - 1, 14, 5, P.wood);
    body.hline(bx, top - 1, 14, P.woodHi);
    body.rect(bx + 1, top + 4, 12, 1, P.woodLo);
    body.rect(bx + 2, top, 10, 2, shade(P.woodLo, 0.7));
  }
  barrel(body, x0 + 2, c.fy1 - 1, P);
}

function windmill(c) {
  const { body, roof, P } = c;
  const cx = Math.round(c.W / 2);
  const baseW = c.W - c.x0 * 2 - 6;
  const top = c.H - 5 - 46 + 2;
  // tapering brick tower
  for (let y = top + 8; y < c.fy1; y++) {
    const t = (y - top - 8) / (c.fy1 - top - 8);
    const half = Math.round(baseW / 2 * (0.62 + 0.38 * t));
    const wFull = half * 2;
    brick(body, cx - half, y, wFull, 1, BR(P), c.seed + y, { course: 5, bw: 8 });
  }
  // fix brick courses: draw whole then mask by trapezoid done above (row by row courses restart, so add texture lines)
  for (let y = top + 8; y < c.fy1; y += 5) {
    const t = (y - top - 8) / (c.fy1 - top - 8);
    const half = Math.round(baseW / 2 * (0.62 + 0.38 * t));
    body.hline(cx - half, y, half * 2, P.brick.mortar);
  }
  doorAt(body, cx, c.fy1, 6, 11, P, true);
  windowAt(body, cx - 2, top + 20, 4, 6, P, true, true);
  // cap roof
  roofPlane(roof, cx - 11, cx + 11, top, top + 12, 10, 'shingle', P.snow ? ROOFS.snow : ROOFS.shingle, c.seed);
  // sails
  const hub = [cx, top + 12];
  const arms = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
  for (const [dx, dy] of arms) {
    for (let k = 3; k < 22; k++) {
      const x = hub[0] + dx * Math.round(k * 0.78);
      const y = hub[1] + dy * Math.round(k * 0.78);
      roof.set(x, y, P.woodLo);
      if (k > 8) {
        // cloth lattice on one side of each spar
        for (let s = 1; s < 5; s++) roof.set(x + dy * s * (dx > 0 ? 1 : -1) * 0 + (dx > 0 ? -dy * s : dy * s) * 0 + (dy > 0 ? s * dx : -s * dx) * 0, y, 0, 0);
        roof.set(x - dx * 2, y, hex('#efe6cc'));
        roof.set(x - dx * 3, y, hex('#d6cba8'));
        roof.set(x, y + dy * 2, hex('#efe6cc'));
      }
    }
  }
  roof.rect(hub[0] - 2, hub[1] - 2, 5, 5, P.wood);
  roof.set(hub[0], hub[1], P.woodHi);
}

function kiln(c) {
  const { body, roof, P } = c;
  const cx = Math.round(c.W / 2);
  const r = Math.round((c.W - c.x0 * 2) / 2) - 1;
  const base = c.fy1 - 1;
  for (let y = base - r * 1.15; y <= base; y++) {
    const dy = (base - y) / (r * 1.15);
    const half = Math.round(r * Math.sqrt(Math.max(0, 1 - dy * dy * 0.95)));
    for (let x = cx - half; x <= cx + half; x++) {
      const row = Math.floor(y / 3);
      let col = hash(Math.floor((x + (row % 2) * 2) / 4), row, c.seed) > 0.5 ? hex('#c0764a') : hex('#a85e38');
      if (y % 3 === 2) col = hex('#7a4528');
      if (x > cx + half * 0.4) col = shade(col, 0.82);
      if (x < cx - half * 0.55) col = shade(col, 1.12);
      body.set(x, Math.round(y), col);
    }
  }
  body.rect(cx - 4, base - 8, 8, 8, P.dark);
  body.rect(cx - 3, base - 4, 6, 4, P.glowLo);
  body.rect(cx - 2, base - 3, 4, 2, P.glow);
  body.hline(cx - 5, base - 9, 10, P.brick.hi);
  // chimney
  roof.rect(cx - 2, 4, 5, 13, P.brick.mid);
  brick(roof, cx - 2, 4, 5, 13, BR(P), c.seed, { course: 3, bw: 5 });
  roof.rect(cx - 3, 3, 7, 2, P.brick.cap);
  c.hooks.smoke.push({ x: cx, y: 2 });
}

function lumber(c) {
  const { body, roof, P } = c;
  // open shed on the left, log piles and stump with an axe on the right
  const sx = c.x0 + 1;
  const sw = 24;
  const wallTop = c.fy1 - 12;
  body.rect(sx, wallTop, sw, 12, shade(P.woodLo, 0.9));
  planks(body, sx + 1, wallTop, sw - 2, 12, LG(P), c.seed);
  body.rect(sx + 7, wallTop + 3, 10, 9, P.dark);
  roofPlane(roof, sx - 2, sx + sw + 1, c.fy1 - 23, wallTop + 2, 4, 'shingle', P.snow ? ROOFS.snow : ROOFS.shingle, c.seed);
  if (P.snow) snowOnRoof(roof, c.seed, 0.6);
  logPile(body, c.x0 + 28, c.fy1 - 1, 3, P);
  logPile(body, c.x0 + 30, c.fy1 + 4, 2, P);
  // stump with axe
  const tx = c.x0 + 3;
  body.rect(tx, c.fy1 + 1, 8, 5, hex('#8a5a30'));
  body.rect(tx, c.fy1 - 1, 8, 3, hex('#d9a864'));
  body.hline(tx + 2, c.fy1, 4, hex('#a37444'));
  body.vline(tx + 5, c.fy1 - 8, 8, P.woodHi);
  body.rect(tx + 3, c.fy1 - 9, 3, 3, hex('#c9ced6'));
}

function mine(c) {
  const { body, roof, P } = c;
  const x0 = c.x0;
  const w = c.W - c.x0 * 2;
  // rocky mound
  for (let y = 4; y < c.fy1; y++) {
    const t = (y - 4) / (c.fy1 - 4);
    const half = Math.round((w / 2) * Math.min(1, 0.25 + t * 1.1));
    const cx = Math.round(c.W / 2);
    for (let x = cx - half; x <= cx + half; x++) {
      const h = hash(x >> 1, y >> 1, c.seed);
      let col = h > 0.66 ? hex('#8d939e') : (h > 0.33 ? hex('#757b86') : hex('#5f6570'));
      if (y - 4 < 3 || h > 0.93) col = hex('#aab0ba');
      if (x > cx + half * 0.5) col = shade(col, 0.8);
      body.set(x, y, col);
    }
  }
  // timber-framed adit
  const cx = Math.round(c.W / 2);
  const aw = 14;
  body.rect(cx - aw / 2, c.fy1 - 16, aw, 16, P.dark);
  body.rect(cx - aw / 2 - 2, c.fy1 - 18, 3, 18, P.wood);
  body.rect(cx + aw / 2 - 1, c.fy1 - 18, 3, 18, P.woodLo);
  body.rect(cx - aw / 2 - 2, c.fy1 - 19, aw + 4, 3, P.woodHi);
  body.rect(cx - 4, c.fy1 - 9, 8, 8, shade(P.dark, 1.4));
  // rails and a cart
  body.hline(cx - 5, c.fy1 - 1, 10, hex('#8a8f98'));
  body.rect(cx + aw / 2 + 4, c.fy1 - 5, 8, 5, P.woodLo);
  body.rect(cx + aw / 2 + 5, c.fy1 - 7, 6, 3, hex('#4a4d55'));
  body.set(cx + aw / 2 + 5, c.fy1, hex('#cfd3da'));
  body.set(cx + aw / 2 + 10, c.fy1, hex('#cfd3da'));
  if (P.snow) for (let x = x0 + 8; x < x0 + w - 8; x++) body.set(x, 5 + Math.abs(x - cx) / 3, hex('#f4f8fc'));
}

function quarry(c) {
  const { body, P } = c;
  const x0 = c.x0;
  const w = c.W - c.x0 * 2;
  const top = c.fy0 + 2;
  const g = c.growth;
  // terraced pit
  for (let y = top; y < c.fy1; y++) {
    for (let x = 0; x < w; x++) {
      const step = Math.floor((y - top) / 7);
      const h = hash(x >> 1, y >> 1, c.seed);
      let col = [hex('#6e727c'), hex('#8b909a'), hex('#a6abb4')][Math.min(2, step)];
      if (h > 0.8) col = shade(col, 1.1);
      if ((y - top) % 7 === 6) col = shade(col, 0.6);
      if (x < 2 || x > w - 3) col = shade(col, 0.75);
      body.set(x0 + x, y, col);
    }
  }
  // cut blocks and a hoist
  const blocks = Math.round(3 * g) + 1;
  for (let i = 0; i < blocks; i++) {
    const bx = x0 + 6 + i * 11;
    const by = c.fy1 - 3 - (i % 2) * 4;
    body.rect(bx, by - 6, 9, 6, hex('#c9ccd4'));
    body.hline(bx, by - 6, 9, hex('#eceef3'));
    body.rect(bx + 6, by - 6, 3, 6, hex('#9ea3ad'));
  }
  body.rect(x0 + w - 8, top - 10, 2, 14, P.wood);
  body.hline(x0 + w - 18, top - 10, 12, P.woodHi);
  body.vline(x0 + w - 16, top - 10, 8, P.dark);
}

function graveyard(c) {
  const { body, P } = c;
  const x0 = c.x0;
  const w = c.W - c.x0 * 2;
  const top = c.fy0 + 2;
  for (let y = top; y < c.fy1; y++) for (let x = 0; x < w; x++) {
    const h = hash(x, y, c.seed);
    body.set(x0 + x, y, h > 0.8 ? hex('#4f7a3a') : (h > 0.2 ? hex('#5d8a45') : hex('#46703a')));
  }
  // iron fence
  for (let x = 0; x < w; x += 3) {
    body.vline(x0 + x, c.fy0 - 3, 6, hex('#2f3138'));
    body.set(x0 + x, c.fy0 - 4, hex('#555963'));
  }
  body.hline(x0, c.fy0, w, hex('#2f3138'));
  const stones = Math.max(2, Math.round(c.growth * 8));
  for (let i = 0; i < stones; i++) {
    const sx = x0 + 3 + (i % 4) * 9 + (hash(i, 1, c.seed) * 3 | 0);
    const sy = top + 8 + Math.floor(i / 4) * 14;
    if (i % 3 === 0) {
      body.rect(sx + 2, sy - 9, 2, 9, hex('#aeb3bd'));
      body.hline(sx, sy - 6, 6, hex('#aeb3bd'));
      body.rect(sx + 3, sy - 9, 1, 9, hex('#7f8590'));
    } else {
      body.rect(sx, sy - 7, 6, 7, hex('#b9bec8'));
      body.hline(sx + 1, sy - 8, 4, hex('#b9bec8'));
      body.hline(sx + 1, sy - 8, 2, hex('#dde0e8'));
      body.rect(sx + 5, sy - 7, 1, 7, hex('#868c98'));
      body.vline(sx + 2, sy - 5, 3, hex('#6e7480'));
    }
    body.hline(sx, sy, 6, hex('#3f6a30'));
  }
}

function watch(c, o) {
  const { body, roof, P } = c;
  const x0 = c.x0 + 2;
  const w = c.W - c.x0 * 2 - 4;
  const top = o.top;
  if (P.kind === 'timber' && !o.stone) {
    // timber lookout on stilts: legs, cross braces, platform, little roof
    const lw = w;
    const platY = c.fy1 - o.legH;
    for (const lx of [x0, x0 + lw - 3]) body.rect(lx, platY, 3, o.legH, P.wood);
    for (const lx of [x0, x0 + lw - 3]) body.vline(lx, platY, o.legH, P.woodHi);
    for (let k = 0; k < o.legH - 2; k++) {
      body.set(x0 + 3 + Math.round(k * (lw - 6) / o.legH), platY + k, P.woodLo);
      body.set(x0 + lw - 4 - Math.round(k * (lw - 6) / o.legH), platY + k, P.woodLo);
    }
    for (let y = platY + 12; y < c.fy1 - 4; y += 12) body.hline(x0, y, lw, P.woodLo);
    // ladder
    for (let y = platY + 4; y < c.fy1; y += 3) body.hline(x0 + 7, y, 4, P.wood);
    body.rect(x0 - 2, platY - 2, lw + 4, 3, P.woodHi);
    logs(body, x0, platY - 10, lw, 8, LG(P), c.seed, 3);
    roofPlane(roof, x0 - 3, x0 + lw + 2, top, platY - 9, 6, 'shingle', P.snow ? ROOFS.snow : ROOFS.shingle, c.seed);
    if (P.snow) snowOnRoof(roof, c.seed, 0.6);
    body.rect(x0 + 3, platY - 8, 4, 5, P.dark);
    flag(roof, x0 + lw - 2, top + 4, 9, P, 6);
    return;
  }
  const wallW = w + 2;
  crenBlock(body, x0 - 1, top, wallW, c.fy1, P, c.seed, { tf: 8, merlon: 4, gap: 3 });
  const cx = c.x0 + (c.def.door ? (c.def.door.x + 0.5) * T : c.W / 2 - c.x0);
  doorAt(body, cx, c.fy1, 6, 11, P, true, true);
  slit(body, x0 + 4, top + 18, 7, P, true);
  slit(body, x0 + wallW - 8, top + 18, 7, P);
  slit(body, Math.round(c.W / 2) - 1, top + 30, 7, P);
  if (P.snow) for (let x = x0 - 1; x < x0 + wallW; x += 1) body.set(x, top + 7, hex('#f4f8fc'));
  if (o.flag) flag(roof, Math.round(c.W / 2), top + 2, 14, P, 8);
}

function wall(c, o) {
  // one 1x1 wall piece; c.mask: N=1 E=2 S=4 W=8 neighbours of the same wall family
  const { body, roof, P } = c;
  const m = c.mask || 0;
  const ew = m & 10;
  const ns = m & 5;
  const x0 = c.x0;
  const x1 = c.x0 + T - 1;
  const mid = c.x0 + (T >> 1);
  const gl = o.gate ? 1 : 0;
  const stone = o.stone;
  const hgt = o.h;
  const seed = c.seed;
  const drawFront = (xa, xb) => {
    if (stone) {
      crenBlock(body, xa, c.fy1 - hgt, xb - xa + 1, c.fy1, P, seed, { tf: 5, merlon: 3, gap: 2 });
    } else {
      // vertical pointed logs
      for (let x = xa; x <= xb; x += 4) {
        const lw = Math.min(4, xb - x + 1);
        const top = c.fy1 - hgt + (hash(x, 1, seed) > 0.6 ? 1 : 0);
        body.rect(x, top + 2, lw, c.fy1 - top - 2, shade(P.log.mid, 0.92 + hash(x, 2, seed) * 0.18));
        body.vline(x, top + 2, c.fy1 - top - 2, P.log.hi);
        body.vline(x + lw - 1, top + 2, c.fy1 - top - 2, P.log.lo);
        body.rect(x + 1, top, Math.max(1, lw - 2), 2, P.log.hi);
        body.set(x + 1, top + 1, P.log.ring);
      }
      body.hline(xa, c.fy1 - 4, xb - xa + 1, P.log.lo);
      body.hline(xa, c.fy1 - hgt + 6, xb - xa + 1, P.log.lo);
    }
  };
  const ringSquare = (x, y, s) => {
    body.rect(x, y, s, s, P.log.mid);
    body.rect(x + 1, y + 1, s - 2, s - 2, P.log.ring);
    body.rect(x + 2, y + 2, s - 4, s - 4, shade(P.log.ring, 0.82));
    body.rect(x + 3, y + 3, Math.max(1, s - 6), Math.max(1, s - 6), P.log.ring);
    body.rect(x + 4, y + 4, Math.max(1, s - 8), Math.max(1, s - 8), shade(P.log.ring, 0.7));
    body.hline(x, y, s, P.log.hi);
    body.hline(x, y + s - 1, s, P.log.lo);
  };
  if (gl) {
    // a gatehouse: two piers and a lintel over a dark archway
    const pier = 4;
    const ph = o.h + 4;
    for (const [xa, xb] of [[x0, x0 + pier - 1], [x1 - pier + 1, x1]]) {
      if (stone) crenBlock(body, xa, c.fy1 - ph, xb - xa + 1, c.fy1, P, seed, { tf: 5, merlon: 2, gap: 1 });
      else { body.rect(xa, c.fy1 - ph, pier, ph, P.log.mid); body.vline(xa, c.fy1 - ph, ph, P.log.hi); body.vline(xb, c.fy1 - ph, ph, P.log.lo); body.rect(xa, c.fy1 - ph - 2, pier, 3, P.log.hi); }
    }
    const lintelTop = c.fy1 - 12;
    if (stone) {
      brick(body, x0 + pier, lintelTop - 6, T - pier * 2, 7, BR(P), seed, { course: 4, bw: 6 });
      body.rect(x0 + pier, lintelTop + 1, T - pier * 2, 1, P.dark);
    } else {
      logs(body, x0 + pier, lintelTop - 5, T - pier * 2, 5, LG(P), seed, 3);
    }
    body.rect(x0 + pier, lintelTop + 2, T - pier * 2, 10, shade(P.dark, 1.5));
    body.hline(x0 + pier, c.fy1 - 1, T - pier * 2, shade(P.dirt, 1));
    flag(roof, mid, c.fy1 - ph - 2, 9, P, 6);
    return;
  }
  const hArm = ew || (!ns);
  if (ew || (!ns && !m)) {
    const xa = (m & 8) ? x0 - 3 : x0 + (ns ? 0 : 1);
    const xb = (m & 2) ? x1 + 3 : x1 - (ns ? 0 : 1);
    drawFront(xa, xb);
    if (!(m & 8) && !ns && !stone) ringSquare(x0 - 1, c.fy1 - 5, 5);
    if (!(m & 2) && !ns && !stone) ringSquare(x1 - 3, c.fy1 - 5, 5);
  }
  if (ns) {
    // seen end-on: a column of ring-log squares (palisade) or a lit crenellated strip (stone)
    const s = T - 2;
    if (stone) {
      const sx = x0 + 3;
      const sw = T - 6;
      const top = c.fy1 - hgt;
      const yb = (m & 4) ? c.fy1 + 4 : c.fy1;
      for (let y = top; y < yb; y++) for (let x = sx; x < sx + sw; x++) {
        const merl = ((y - top) % 6) < 3;
        let col = merl ? P.brick.capHi : P.brick.cap;
        if (x < sx + 2 || x >= sx + sw - 2) col = merl ? P.brick.cap : P.brick.capLo;
        if (hash(x, y, seed) > 0.92) col = shade(col, 0.93);
        body.set(x, y, col);
      }
      body.vline(sx - 1, top, yb - top, P.brick.mid);
      body.vline(sx + sw, top, yb - top, P.brick.lo);
      if (!(m & 4)) brick(body, sx - 1, c.fy1 - 8, sw + 2, 8, BR(P), seed, { course: 4, bw: 5 });
    } else {
      const yb = (m & 4) ? c.fy1 + 3 : c.fy1;
      const top = (m & 1) ? c.fy1 - 10 : c.fy1 - hgt + 2;
      ringSquare(x0 + 1, yb - s, s);
      if (!(m & 1)) { body.rect(x0 + 1, top, s, yb - s - top + 1, shade(P.log.mid, 0.86)); body.hline(x0 + 1, top, s, P.log.hi); }
      else { body.rect(x0 + 1, c.fy1 - 12, s, 6, shade(P.log.mid, 0.86)); }
    }
  }
  if (ew && ns && !stone) ringSquare(mid - 4, c.fy1 - 16, 8);
  if (!m && stone) body.rect(x0 + 2, c.fy1 - hgt - 2, 10, 2, P.brick.capHi);
  if (P.snow) {
    const b = body.bounds();
    if (b) for (let x = b.left; x <= b.right; x++) if (body.alpha(x, b.top + 1)) body.set(x, b.top + 1, hex('#f4f8fc'));
  }
}

function temple(c, o) {
  const { body, roof, P } = c;
  const bx0 = c.x0;
  const bx1 = c.x1 - 1;
  const bw = bx1 - bx0 + 1;
  const stepH = 4;
  // stepped base
  for (let i = 0; i < 2; i++) {
    body.rect(bx0 - 1 + i * 2, c.fy1 - stepH + i * 2, bw + 2 - i * 4, 2, i ? P.brick.cap : P.brick.capHi);
    body.hline(bx0 - 1 + i * 2, c.fy1 - stepH + i * 2 + 1, bw + 2 - i * 4, P.brick.capLo);
  }
  const colTop = c.fy1 - o.colH - 4;
  // dark cella wall behind the columns
  brick(body, bx0 + 3, colTop, bw - 6, o.colH, BR(P), c.seed);
  doorAt(body, c.x0 + (c.def.door.x + 0.5) * T, c.fy1 - 4, 8, 15, P, true, true);
  body.rect(Math.round(c.x0 + (c.def.door.x + 0.5) * T) - 3, c.fy1 - 16, 6, 12, P.glowLo);
  doorAt(body, c.x0 + (c.def.door.x + 0.5) * T, c.fy1 - 4, 8, 15, P, true, true);
  // columns
  const cols = o.columns;
  for (let i = 0; i < cols; i++) {
    const cx = bx0 + 2 + Math.round(((bw - 8) * i) / (cols - 1));
    body.rect(cx, colTop, 4, o.colH, P.brick.cap);
    body.vline(cx, colTop, o.colH, P.brick.capHi);
    body.vline(cx + 3, colTop, o.colH, P.brick.capLo);
    body.rect(cx - 1, colTop - 1, 6, 2, P.brick.capHi);
    body.rect(cx - 1, colTop + o.colH - 2, 6, 2, P.brick.capLo);
  }
  // entablature and pediment
  roof.rect(bx0 - 1, colTop - 5, bw + 2, 5, P.brick.cap);
  roof.hline(bx0 - 1, colTop - 5, bw + 2, P.brick.capHi);
  roof.hline(bx0 - 1, colTop - 1, bw + 2, P.brick.capLo);
  roof.hline(bx0, colTop - 3, bw, P.accent);
  const pedH = Math.min(18, colTop - 8);
  roofPlane(roof, bx0 - 1, bx1 + 1, colTop - 5 - pedH, colTop - 6, bw / 2 - 2, 'slate', P.snow ? ROOFS.snow : [P.brick.capHi, P.brick.cap, P.brick.capLo, P.brick.lo], c.seed);
  // tympanum glyph
  const mx = Math.round(c.W / 2);
  roof.rect(mx - 2, colTop - 5 - Math.round(pedH * 0.55), 5, 5, P.accent);
  roof.set(mx, colTop - 4 - Math.round(pedH * 0.55), P.glow);
  if (o.dome) {
    // golden dome behind the pediment
    const r = 11;
    for (let y = -r; y <= 0; y++) {
      const half = Math.round(Math.sqrt(r * r - y * y));
      for (let x = -half; x <= half; x++) roof.set(mx + x, colTop - 5 - pedH + 2 + y, x > half * 0.3 ? hex('#c28a1c') : (x < -half * 0.4 ? hex('#ffe08a') : hex('#eab32a')));
    }
    roof.vline(mx, colTop - 5 - pedH - r + 3, 4, hex('#f6d36a'));
  }
}

function shrine(c) {
  const { body, roof, P } = c;
  const bx0 = c.x0 + 2;
  const bx1 = c.x1 - 3;
  const bw = bx1 - bx0 + 1;
  body.rect(bx0 - 1, c.fy1 - 4, bw + 2, 4, P.brick.cap);
  body.hline(bx0 - 1, c.fy1 - 4, bw + 2, P.brick.capHi);
  body.hline(bx0 - 1, c.fy1 - 1, bw + 2, P.brick.capLo);
  const ph = 17;
  for (const px of [bx0, bx1 - 3]) {
    brick(body, px, c.fy1 - 4 - ph, 4, ph, BR(P), c.seed, { course: 4, bw: 4 });
    body.hline(px - 1, c.fy1 - 4 - ph, 6, P.brick.capHi);
  }
  // glowing altar and brazier
  body.rect(bx0 + 5, c.fy1 - 9, bw - 10, 5, P.brick.lo);
  body.rect(bx0 + 6, c.fy1 - 10, bw - 12, 2, P.brick.hi);
  flame(body, Math.round(c.W / 2) - 1, c.fy1 - 10, P, 6);
  roofPlane(roof, bx0 - 3, bx1 + 3, 5, c.fy1 - ph - 3, 6, 'tile', P.snow ? ROOFS.snow : [P.accentHi, P.accent, P.accentLo, shade(P.accent, 0.4)], c.seed);
  roof.set(Math.round(c.W / 2) - 1, 2, P.glow);
  roof.vline(Math.round(c.W / 2) - 1, 2, 4, hex('#d9b24a'));
}

function cathedral(c) {
  const { body, roof, P } = c;
  const bx0 = c.x0 + 1;
  const bx1 = c.x1 - 2;
  const bw = bx1 - bx0 + 1;
  const mx = Math.round(c.W / 2);
  const tw = 14;
  const nave = 56;
  // nave and gabled front
  brick(body, bx0 + tw - 2, c.fy1 - nave, bw - tw * 2 + 4, nave, BR(P), c.seed);
  roofPlane(roof, bx0 + tw - 3, bx1 - tw + 3, c.fy1 - nave - 16, c.fy1 - nave + 1, (bw - tw * 2) / 2 - 1, 'slate', P.snow ? ROOFS.snow : ROOFS.slate, c.seed);
  // rose window
  const ry = c.fy1 - nave + 16;
  for (let y = -6; y <= 6; y++) for (let x = -6; x <= 6; x++) {
    const d = Math.hypot(x, y);
    if (d <= 6) body.set(mx + x, ry + y, d > 5 ? P.brick.hi : ((Math.abs(x) + Math.abs(y)) % 3 === 0 ? P.accent : (x * y > 0 ? hex('#4a7bd0') : hex('#e6b83a'))));
  }
  // portal
  doorAt(body, mx, c.fy1, 10, 17, P, true, true);
  slit(body, mx - 12, c.fy1 - 38, 9, P, true);
  slit(body, mx + 10, c.fy1 - 38, 9, P, true);
  // two towers with spires
  for (const tx of [bx0, bx1 - tw + 1]) {
    const top = c.fy1 - 62;
    crenBlock(body, tx, top, tw, c.fy1, P, c.seed + tx, { tf: 4, merlon: 3, gap: 2 });
    roofPlane(roof, tx - 1, tx + tw, 8, top - 1, tw / 2 - 1, 'slate', P.snow ? ROOFS.snow : ROOFS.slate, c.seed);
    slit(body, tx + 6, top + 14, 9, P, true);
    slit(body, tx + 6, top + 32, 9, P);
    roof.set(tx + tw / 2, 3, P.glow);
    roof.vline(tx + tw / 2, 1, 4, hex('#e0c060'));
  }
  c.hooks.smoke.length = 0;
}

function keep(c, o) {
  const { body, roof, P } = c;
  const bx0 = c.x0;
  const bw = c.W - c.x0 * 2;
  const tw = Math.round(bw * 0.2);
  const mx = Math.round(c.W / 2);
  const cw = Math.round(bw * 0.46);
  const top = 4;
  // central tall donjon (behind), wings, corner towers (front)
  crenBlock(body, mx - cw / 2, top + 4, cw, c.fy1 - 2, P, c.seed + 1, { tf: 9, merlon: 5, gap: 3 });
  const wingTop = top + 34;
  crenBlock(body, bx0 + tw - 2, wingTop, bw - tw * 2 + 4, c.fy1, P, c.seed + 2, { tf: 8, merlon: 4, gap: 3 });
  for (const tx of [bx0, bx0 + bw - tw]) {
    crenBlock(body, tx, top + 14, tw, c.fy1, P, c.seed + tx, { tf: 8, merlon: 4, gap: 3 });
    slit(body, tx + tw / 2 - 1, top + 36, 8, P, true);
    slit(body, tx + tw / 2 - 1, top + 52, 8, P);
  }
  // gate
  doorAt(body, c.x0 + (c.def.door.x + 0.5) * T, c.fy1, 12, 18, P, true, true);
  body.rect(c.x0 + (c.def.door.x + 0.5) * T - 5, c.fy1 - 17, 10, 4, P.dark);
  for (let i = 0; i < 3; i++) body.vline(Math.round(c.x0 + (c.def.door.x + 0.5) * T) - 4 + i * 4, c.fy1 - 17, 12, hex('#5a5f70'));
  // keep windows
  windowAt(body, mx - 8, top + 26, 4, 8, P, true, true);
  windowAt(body, mx + 4, top + 26, 4, 8, P, true, true);
  slit(body, mx - 1, top + 42, 8, P, true);
  for (let i = 0; i < 3; i++) slit(body, bx0 + tw + 6 + i * ((bw - tw * 2 - 14) / 2.2), wingTop + 20, 7, P, i === 1);
  flag(roof, mx, top + 6, 16, P, 10);
  flag(roof, bx0 + 5, top + 16, 12, P, 7);
  flag(roof, bx0 + bw - tw + 5, top + 16, 12, P, 7);
  if (P.snow) for (let x = mx - cw / 2; x < mx + cw / 2; x++) body.set(x, top + 12, hex('#f4f8fc'));
}

function factory(c, o) {
  const { body, roof, P } = c;
  const bx0 = c.x0 + 1;
  const bx1 = c.x1 - 2;
  const bw = bx1 - bx0 + 1;
  const wallH = 24;
  const wallTop = c.fy1 - wallH;
  const red = { mid: hex('#a4503a'), hi: hex('#c4694c'), lo: hex('#823e2c'), mortar: hex('#4c2a22') };
  brick(body, bx0, wallTop, bw, wallH, red, c.seed, { course: 4, bw: 7 });
  // sawtooth roof
  const teeth = Math.max(2, Math.round(bw / 16));
  const tw = Math.floor(bw / teeth);
  for (let i = 0; i < teeth; i++) {
    const x = bx0 + i * tw;
    for (let y = 0; y < 14; y++) {
      const slope = Math.round((y / 14) * (tw - 3));
      for (let xx = 0; xx < tw; xx++) {
        const edge = xx <= slope ? 1 : 0;
        if (!edge && y < 6) continue;
        const col = xx > tw - 5 && y > 5 ? hex('#a9c4e0') : hex('#6b7280');
        roof.set(x + xx, wallTop - 14 + y + 12, y > 5 && xx > tw - 5 ? col : (y % 3 === 0 ? hex('#8a93a3') : col));
      }
    }
    roof.rect(x + tw - 4, wallTop - 2, 4, 14, hex('#9fc0e0'));
    roof.vline(x + tw - 4, wallTop - 2, 14, hex('#5d6a7c'));
  }
  // windows grid and doors
  for (let i = 0; i < Math.floor(bw / 10); i++) windowAt(body, bx0 + 3 + i * 10, wallTop + 4, 6, 6, P, hash(i, 2, c.seed) > 0.4);
  doorAt(body, c.x0 + (c.def.door.x + 0.5) * T, c.fy1, 10, 14, P, false, true);
  // chimneys
  for (const [k, cx] of [[0, bx1 - 8], [1, bx0 + 6]]) {
    const top = 2 + k * 6;
    brick(roof, cx, top, 7, wallTop - top + 4, red, c.seed + k, { course: 4, bw: 7 });
    roof.rect(cx - 1, top - 1, 9, 3, hex('#3a2a26'));
    roof.rect(cx, top + 4, 7, 2, hex('#e8e0d0'));
    c.hooks.smoke.push({ x: cx + 3, y: top - 2 });
  }
  body.rect(bx1 - 22, c.fy1 - 8, 8, 8, hex('#3a2f2a'));
}

function powerPlant(c) {
  const { body, roof, P } = c;
  const bx0 = c.x0 + 1;
  const bx1 = c.x1 - 2;
  // low turbine hall
  const hallH = 18;
  brick(body, bx0, c.fy1 - hallH, 34, hallH, { mid: hex('#8a8f9a'), hi: hex('#adb2bd'), lo: hex('#6e737e'), mortar: hex('#4a4e58') }, c.seed, { course: 6, bw: 12 });
  roof.rect(bx0 - 1, c.fy1 - hallH - 3, 36, 4, hex('#5b6170'));
  roof.hline(bx0 - 1, c.fy1 - hallH - 3, 36, hex('#8b93a5'));
  for (let i = 0; i < 4; i++) windowAt(body, bx0 + 3 + i * 8, c.fy1 - hallH + 5, 5, 6, P, true);
  doorAt(body, c.x0 + (c.def.door.x + 0.5) * T, c.fy1, 10, 13, P, false, true);
  // cooling towers
  for (const [k, cx] of [[0, bx1 - 26], [1, bx1 - 8]]) {
    const top = 6 + k * 4;
    const bottom = c.fy1 - 4;
    for (let y = top; y <= bottom; y++) {
      const t = (y - top) / (bottom - top);
      const half = Math.round(6 + 4 * Math.pow(Math.abs(t - 0.45) * 2, 1.4));
      for (let x = cx - half; x <= cx + half; x++) {
        let col = hex('#b7bcc6');
        if (x > cx + half * 0.3) col = hex('#8d93a0');
        if (x < cx - half * 0.6) col = hex('#d3d7df');
        if (y % 5 === 0) col = shade(col, 0.88);
        roof.set(x, y, col);
      }
    }
    roof.rect(cx - 9, top - 1, 19, 2, hex('#6f7582'));
    c.hooks.smoke.push({ x: cx, y: top - 3 });
  }
  // pylon
  const px = bx0 + 40;
  for (let y = 0; y < 30; y++) { body.set(px + Math.round(y / 6), c.fy1 - y, hex('#4a4f5c')); body.set(px + 8 - Math.round(y / 6), c.fy1 - y, hex('#4a4f5c')); }
  body.hline(px - 4, c.fy1 - 28, 16, hex('#4a4f5c'));
  body.hline(px - 2, c.fy1 - 22, 12, hex('#4a4f5c'));
}

function spaceport(c) {
  const { body, roof, P } = c;
  const x0 = c.x0;
  const w = c.W - c.x0 * 2;
  // concrete pad with markings
  const padTop = c.fy1 - 34;
  for (let y = padTop; y < c.fy1; y++) for (let x = 0; x < w; x++) {
    let col = hash(x >> 2, y >> 2, c.seed) > 0.5 ? hex('#9ca3ad') : hex('#8f96a1');
    if (x < 2 || x > w - 3 || y === padTop || y === c.fy1 - 1) col = hex('#f2c94c');
    body.set(x0 + x, y, col);
  }
  const cx = x0 + 28;
  for (let a = 0; a < 20; a++) {
    body.set(cx + Math.round(Math.cos(a / 20 * 6.283) * 14), c.fy1 - 12 + Math.round(Math.sin(a / 20 * 6.283) * 6), hex('#f2c94c'));
  }
  // gantry
  const gx = cx + 12;
  for (let y = 0; y < 62; y++) {
    body.set(gx, c.fy1 - 10 - y, hex('#c0392b'));
    body.set(gx + 5, c.fy1 - 10 - y, hex('#c0392b'));
    if (y % 8 === 0) body.hline(gx, c.fy1 - 10 - y, 6, hex('#c0392b'));
    if (y % 8 < 7 && y % 2 === 0) body.set(gx + Math.round((y % 8) * 5 / 7), c.fy1 - 10 - y, hex('#c0392b'));
  }
  body.hline(gx - 6, c.fy1 - 52, 7, hex('#c0392b'));
  // rocket
  const rh = 62;
  for (let y = 0; y < rh; y++) {
    let half = 5;
    if (y < 14) half = Math.round(Math.sqrt(Math.max(0, 1 - Math.pow((14 - y) / 14, 2))) * 5);
    for (let x = -half; x <= half; x++) {
      let col = hex('#f1f3f6');
      if (x > half * 0.3) col = hex('#b9bfca');
      if (x < -half * 0.5) col = hex('#ffffff');
      if (y < 10) col = x > half * 0.3 ? hex('#a22d22') : hex('#d9473b');
      if (y > 30 && y < 34) col = hex('#c0392b');
      body.set(cx + x, c.fy1 - 10 - (rh - y), col);
    }
  }
  for (const s of [-1, 1]) for (let k = 0; k < 12; k++) body.set(cx + s * (6 + Math.round(k / 3)), c.fy1 - 10 - 12 + k, hex('#c0392b'));
  body.rect(cx - 1, c.fy1 - 10 - rh + 28, 3, 3, hex('#5aa0d8'));
  // control building
  const bxx = x0 + w - 24;
  brick(body, bxx, c.fy1 - 16, 22, 16, { mid: hex('#c4c9d2'), hi: hex('#e0e3ea'), lo: hex('#a2a8b3'), mortar: hex('#8a909c') }, c.seed, { course: 8, bw: 20 });
  for (let i = 0; i < 3; i++) windowAt(body, bxx + 3 + i * 6, c.fy1 - 12, 4, 5, P, true);
  roof.rect(bxx - 1, c.fy1 - 19, 24, 4, hex('#6b7280'));
  roof.vline(bxx + 18, c.fy1 - 30, 11, hex('#6b7280'));
  roof.set(bxx + 18, c.fy1 - 31, hex('#ff6a5a'));
}

function ruins(c) {
  const { body, P } = c;
  const x0 = c.x0;
  const w = c.W - c.x0 * 2;
  const depth = Math.min(c.fy1 - c.fy0, 26);
  const top = c.fy1 - depth;
  const stone = c.style && (c.style.pal === 'timber');
  // rubble field
  for (let k = 0; k < w * depth / 5; k++) {
    const x = x0 + Math.floor(hash(k, 1, c.seed) * (w - 4));
    const y = top + Math.floor(hash(k, 2, c.seed) * (depth - 2)) + 1;
    const s = 2 + Math.floor(hash(k, 3, c.seed) * 3);
    const col = hash(k, 4, c.seed) > 0.5 ? P.brick.mid : P.brick.lo;
    body.rect(x, y, s, Math.max(2, s - 1), col);
    body.hline(x, y, s, P.brick.hi);
    body.hline(x, y + Math.max(2, s - 1) - 1, s, P.brick.mortar);
  }
  // broken wall stubs
  const stubs = Math.max(2, Math.round(w / 14));
  for (let i = 0; i < stubs; i++) {
    const sx = x0 + 2 + Math.round(((w - 14) * i) / Math.max(1, stubs - 1)) + (hash(i, 9, c.seed) * 3 | 0);
    const sh = 7 + Math.floor(hash(i, 5, c.seed) * 12);
    const sw = 6 + Math.floor(hash(i, 6, c.seed) * 5);
    const sy = c.fy1 - 2 - (i % 2) * 5;
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        if (y < 4 && hash(x, y + i * 7, c.seed) > 0.5 + y * 0.1) continue; // ragged top
        const row = Math.floor(y / 4);
        let col = hash(Math.floor((x + (row % 2) * 2) / 4), row, c.seed + i) > 0.5 ? P.brick.mid : P.brick.lo;
        if (y % 4 === 3) col = P.brick.mortar;
        if (x === sw - 1) col = shade(col, 0.8);
        body.set(sx + x, sy - sh + y, stone ? shade(col, 0.95) : col);
      }
    }
    // moss
    for (let m = 0; m < 5; m++) body.set(sx + Math.floor(hash(m, i, c.seed) * sw), sy - Math.floor(hash(m, i + 3, c.seed) * 5), hex('#4f7a3a'));
  }
  // charred beams and weeds
  for (let i = 0; i < 3; i++) {
    const bx = x0 + 4 + Math.floor(hash(i, 11, c.seed) * (w - 14));
    const by = c.fy1 - 2 - Math.floor(hash(i, 12, c.seed) * 8);
    body.rect(bx, by, 9, 2, hex('#2d2420'));
    body.set(bx + 2, by - 1, hex('#2d2420'));
  }
  for (let i = 0; i < w / 5; i++) {
    const gx = x0 + Math.floor(hash(i, 21, c.seed) * w);
    const gy = c.fy1 - Math.floor(hash(i, 22, c.seed) * depth * 0.6);
    body.vline(gx, gy - 2, 3, hex('#5f8f3f'));
    body.set(gx + 1, gy - 3, hex('#7fb04f'));
  }
}

// Space Age home: a glass dome on a ring foundation, with an airlock door and a small antenna
function habitat(c) {
  const { body, roof, P } = c;
  const bx0 = c.x0 + 1;
  const bx1 = c.x1 - 2;
  const bw = bx1 - bx0 + 1;
  const cx = (bx0 + bx1) / 2;
  const r = bw / 2;
  const base = c.fy1 - 6;
  // ring foundation
  for (let x = bx0; x <= bx1; x++) for (let y = base; y < c.fy1; y++) body.set(x, y, y === base ? hex('#d7dde6') : (hash(x, y, c.seed) > 0.5 ? hex('#9aa3b1') : hex('#8b94a3')));
  // dome
  for (let y = 0; y <= r; y++) {
    const half = Math.round(Math.sqrt(Math.max(0, r * r - y * y)));
    for (let x = -half; x <= half; x++) {
      const px = Math.round(cx + x);
      const py = base - y;
      let col = x < -half * 0.4 ? hex('#cfe9ff') : (x > half * 0.45 ? hex('#5f86ad') : hex('#8fb8de'));
      if (Math.abs(x) === half || y === Math.round(r)) col = hex('#e8eef5');
      if ((x + 64) % 8 === 0 || y % 7 === 0) col = hex('#e8eef5'); // ribs
      roof.set(px, py, col);
    }
  }
  // warm light inside
  for (let k = 0; k < 3; k++) roof.set(Math.round(cx - 6 + k * 6), base - 4, P.glow);
  // airlock
  body.rect(Math.round(cx) - 4, c.fy1 - 12, 8, 12, hex('#c9d1dc'));
  body.rect(Math.round(cx) - 2, c.fy1 - 10, 4, 10, hex('#3a4656'));
  // antenna
  roof.vline(Math.round(cx + r * 0.5), base - Math.round(r) - 6, 8, hex('#c9d1dc'));
  roof.set(Math.round(cx + r * 0.5), base - Math.round(r) - 7, hex('#ef4444'));
}

// ---------- the table: building id -> routine and parameters ----------

export const ART = {
  tent: { fn: tent },
  hut: { fn: hut },
  wooden_house: { fn: gable, o: { wall: 'plaster', wallH: 21, roof: 'shingle', windows: 2, chimney: true } },
  longhouse: { fn: gable, o: { wall: 'log', wallH: 19, roof: 'thatch', windows: 3, props: ['logs'], doorW: 7 } },
  stone_house: { fn: gable, o: { wall: 'brick', wallH: 23, roof: 'tile', windows: 2, chimney: true } },
  manor: { fn: gable, o: { wall: 'brick', wallH: 27, roof: 'slate', windows: 4, chimney: true, trim: true, dormer: true, doorW: 8, doorH: 15 } },
  tenement: { fn: gable, o: { wall: 'brick', wallH: 38, roof: 'slate', windows: 5, storeys: 3, chimney: true, trim: true, doorW: 8, doorH: 13, inset: 3 } },
  habitat: { fn: habitat },
  hall: { fn: gable, o: { wall: 'log', wallH: 22, roof: 'thatch', windows: 4, banner: true, trim: true, doorW: 9, doorH: 15, archDoor: false, props: ['barrel'] } },
  well: { fn: well },
  granary: { fn: gable, o: { wall: 'plank', wallH: 19, roof: 'thatch', windows: 0, doorW: 9, doorH: 14, props: ['sacks'] } },
  farm: { fn: field, flat: true, o: { crop: 'wheat' } },
  pen: { fn: pen, flat: true },
  workshop: { fn: gable, o: { wall: 'plaster', wallH: 20, roof: 'shingle', windows: 2, chimney: true, props: ['crate', 'barrel'] } },
  smithy: { fn: gable, o: { wall: 'brick', wallH: 22, roof: 'slate', windows: 1, chimney: true, forge: true, props: ['crate'] } },
  kiln: { fn: kiln },
  lumber_camp: { fn: lumber },
  quarry: { fn: quarry, flat: true },
  mine: { fn: mine },
  market_stall: { fn: market, o: { stalls: 1 } },
  market: { fn: market, o: { stalls: 3 }, flat: false },
  tavern: { fn: gable, o: { wall: 'plaster', wallH: 24, roof: 'tile', windows: 3, chimney: true, sign: true, lit: true } },
  library: { fn: gable, o: { wall: 'brick', wallH: 26, roof: 'slate', windows: 5, trim: true, banner: true, doorW: 8, doorH: 15 } },
  barracks: { fn: gable, o: { wall: 'brick', wallH: 22, roof: 'slate', windows: 3, trim: true, banner: true, doorW: 8, doorH: 14, props: ['crate'] } },
  graveyard: { fn: graveyard, flat: true },
  dock: { fn: dock, flat: true },
  windmill: { fn: windmill },
  watchtower: { fn: watch, o: { top: 6, legH: 36, flag: true } },
  palisade: { fn: wall, wallPiece: true, o: { h: 16 } },
  palisade_gate: { fn: wall, wallPiece: true, o: { h: 16, gate: true } },
  stone_wall: { fn: wall, wallPiece: true, o: { h: 20, stone: true } },
  stone_gate: { fn: wall, wallPiece: true, o: { h: 20, stone: true, gate: true } },
  wall_tower: { fn: watch, o: { top: 6, stone: true, flag: true } },
  keep: { fn: keep },
  shrine: { fn: shrine },
  temple: { fn: temple, o: { columns: 5, colH: 28, dome: true } },
  cathedral: { fn: cathedral },
  factory: { fn: factory },
  power_plant: { fn: powerPlant },
  spaceport: { fn: spaceport },
  ruins: { fn: ruins, flat: true }
};

export { windowAt, doorAt, barrel, crate, logPile, flame, flag, sack };
