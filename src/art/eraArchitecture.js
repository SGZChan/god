// How the same kind of building (a home, a granary, a workshop...) is built in each age. Every age has its own form,
// not just other colours, after how people actually built:
//
//   0 Stone Age     round wattle-and-daub huts and longhouses under thatch that reaches almost to the ground, or
//                   turf-roofed pit houses; a smoke hole instead of a chimney, a hide over the doorway, no windows
//   1 Bronze Age    sun-dried mudbrick blocks with flat roofs (Mesopotamia, Catalhoyuk): parapets, roof beams
//                   (vigas) sticking out, a ladder to the roof terrace, small high windows, cloth awnings, jars
//   2 Classical     whitewashed stone with low-pitched terracotta roofs; a columned portico under a pediment, a villa
//                   with shuttered arched windows, or a two-storey insula with a shop on the ground floor
//   3 Medieval      a stone ground floor and a half-timbered upper storey that juts out over the street (a jetty),
//                   steep slate or shingle roofs, small leaded windows, a stone chimney
//   4 Industrial    red-brick terraces two or three storeys tall: sash windows under stone lintels, a cornice and
//                   parapet or a mansard roof, rows of chimney pots, front steps and fanlights, a corner shop
//   5 Space Age     white composite panels with rounded corners, a flat roof covered by a solar array, wide glass
//                   bands, light strips, sliding doors, an antenna or dish, sometimes a dome annex
//
// Each age has three variants (style.variant), so a street of the same age does not repeat. `o` carries the
// building's own options from buildingArt.js (props, forge, sign, banner, wallH, windows).
import { hex, shade, hash, brick, roofPlane } from './pixelKit.js';
import { ROOFS, windowAt, doorAt, barrel, crate, logPile, flame, flag, sack } from './buildingArt.js';

const BEAM = hex('#4a2f1a');
const RED_BRICK = { mid: hex('#a4503a'), hi: hex('#c4694c'), lo: hex('#823e2c'), mortar: hex('#5a3328') };
const STONE_GREY = { mid: hex('#8a8f9e'), hi: hex('#aeb3c0'), lo: hex('#6c7180'), mortar: hex('#4b4f5c') };
const TURF = [hex('#8a9a52'), hex('#6d7c40'), hex('#55612f'), hex('#333b1d')];

function frame(c) {
  const bx0 = c.x0 + 1;
  const bx1 = c.x1 - 2;
  return { bx0, bx1, bw: bx1 - bx0 + 1, cx: Math.round((c.x0 + c.x1) / 2), doorCx: c.def.door ? Math.round(c.x0 + (c.def.door.x + 0.5) * 14) : Math.round((c.x0 + c.x1) / 2) };
}

function fillTex(p, x0, y0, w, h, fn) {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const col = fn(x, y); if (col !== null) p.set(x0 + x, y0 + y, col); }
}

// Props, forges, signs and banners the building type asks for (shared by every age)
function extras(c, o, F, roofTop) {
  const { body, roof, P } = c;
  for (const pr of o.props || []) {
    if (pr === 'barrel') barrel(body, F.bx0 + 2, c.fy1 + 1, P);
    else if (pr === 'crate') crate(body, F.bx1 - 8, c.fy1 + 1, 6, P);
    else if (pr === 'sacks') { sack(body, F.bx0 + 3, c.fy1 + 1, P); sack(body, F.bx0 + 8, c.fy1 + 2, P); }
    else if (pr === 'logs') logPile(body, F.bx1 - 10, c.fy1 + 2, 2, P);
  }
  if (o.forge) {
    body.rect(F.bx0 + 4, c.fy1 - 9, 6, 7, P.dark);
    body.rect(F.bx0 + 5, c.fy1 - 4, 4, 2, P.glowLo);
    body.rect(F.bx0 + 6, c.fy1 - 4, 2, 1, P.glow);
    c.hooks.smoke.push({ x: F.bx0 + 7, y: c.fy1 - 12 });
  }
  if (o.sign) {
    body.hline(F.bx1 - 9, c.fy1 - 16, 7, P.woodLo);
    body.rect(F.bx1 - 8, c.fy1 - 15, 6, 5, P.accent);
    body.hline(F.bx1 - 8, c.fy1 - 15, 6, P.accentHi);
  }
  if (o.banner) flag(roof, F.cx, Math.max(10, roofTop + 4), 12, P, 7);
}

// ---------- 0 Stone Age ----------

function stoneAge(c, o, v) {
  const { body, roof, P } = c;
  const F = frame(c);
  const seed = c.seed;
  const wallH = v === 2 ? 5 : (v === 1 ? 7 : 9);
  const wallTop = c.fy1 - wallH;
  // wattle and daub (woven hazel rods plastered with clay), or a ring of field stones under turf
  fillTex(body, F.bx0, wallTop, F.bw, wallH, (x, y) => {
    if (v === 2) return hash(x >> 2, y >> 1, seed) > 0.5 ? hex('#8d8576') : hex('#6f685c');
    const daub = hash(x >> 2, y >> 1, seed + 3) > 0.62;
    if (daub) return shade(hex('#b08a5a'), 1 - y * 0.02);
    return (x + (y >> 1)) % 3 === 0 ? hex('#5e4026') : hex('#7d5a36');
  });
  // the roof: a cone of thatch (roundhouse), a long low hip of thatch (longhouse) or a turf dome (pit house)
  const eaves = wallTop + 2;
  const top = Math.max(2, c.fy1 - (o.wallH || 21) - 16);
  let roofTop = top;
  if (v === 0) {
    roofPlane(roof, F.bx0 - 3, F.bx1 + 3, top, eaves, Math.floor((F.bw + 6) / 2) - 1, 'thatch', P.snow ? ROOFS.snow : ROOFS.thatch, seed);
  } else if (v === 1) {
    roofTop = top + 6;
    roofPlane(roof, F.bx0 - 3, F.bx1 + 3, roofTop, eaves + 1, Math.floor(F.bw * 0.22), 'thatch', P.snow ? ROOFS.snow : ROOFS.thatch, seed);
  } else {
    roofTop = top + 8;
    roofPlane(roof, F.bx0 - 2, F.bx1 + 2, roofTop, eaves, Math.floor(F.bw * 0.38), 'thatch', P.snow ? ROOFS.snow : TURF, seed);
    for (let k = 0; k < 4; k++) roof.set(F.bx0 + 4 + k * Math.floor(F.bw / 5), roofTop + 6 + (k % 2) * 3, hex('#d9e36b')); // flowers in the turf
  }
  // smoke hole at the ridge
  roof.rect(F.cx - 1, roofTop, 3, 2, P.dark);
  c.hooks.smoke.push({ x: F.cx, y: roofTop - 1 });
  // a low doorway with a hide hanging half across it
  const dh = Math.min(wallH + 4, 10);
  body.rect(F.doorCx - 3, c.fy1 - dh, 6, dh, P.dark);
  roof.rect(F.doorCx - 4, eaves - 1, 8, 2, shade(ROOFS.thatch[2], 0.8)); // the thatch cut back over the door
  body.rect(F.doorCx, c.fy1 - dh, 3, dh - 2, hex('#b89a6a'));
  // outside: a fire pit, or a drying rack with a hide
  if (v === 0) {
    body.rect(F.bx1 - 6, c.fy1, 6, 2, hex('#5b5b5b'));
    flame(body, F.bx1 - 5, c.fy1, P, 4);
  } else {
    const rx = F.bx0 + 2;
    body.vline(rx, c.fy1 - 9, 9, P.woodLo);
    body.vline(rx + 6, c.fy1 - 9, 9, P.woodLo);
    body.hline(rx, c.fy1 - 9, 7, P.wood);
    body.rect(rx + 1, c.fy1 - 8, 5, 5, hex('#c9a77a'));
  }
  extras(c, { ...o, props: (o.props || []).filter(p => p !== 'barrel' && p !== 'crate') }, F, roofTop);
}

// ---------- 1 Bronze Age ----------

function bronzeAge(c, o, v) {
  const { body, roof, P } = c;
  const F = frame(c);
  const seed = c.seed;
  const sand = P.kind === 'stone' ? hex('#bfa577') : hex('#cda56a');
  const wallH = Math.min(c.fy1 - 12, (o.wallH || 21) + 2);
  const wallTop = c.fy1 - wallH;
  // mudbrick: plastered, with faint courses and cracks
  fillTex(body, F.bx0, wallTop, F.bw, wallH, (x, y) => {
    let col = shade(sand, 1.04 - 0.16 * (y / wallH) + (hash(x >> 1, y >> 1, seed) - 0.5) * 0.08);
    if (y % 5 === 4 && hash(x >> 3, y, seed) > 0.4) col = shade(col, 0.9);
    if (x >= F.bw - 3) col = shade(col, 0.85);
    return col;
  });
  // the flat roof terrace seen from above, with a parapet
  const rt = wallTop - 7;
  fillTex(roof, F.bx0, rt, F.bw, 7, (x, y) => (y === 0 ? shade(sand, 0.8) : shade(sand, 1.1 - y * 0.02)));
  roof.hline(F.bx0, wallTop, F.bw, shade(sand, 0.7));
  // roof beams (vigas) poking out under the parapet
  for (let x = F.bx0 + 3; x < F.bx1 - 1; x += 7) body.rect(x, wallTop + 2, 2, 2, hex('#6b4a2a'));
  let roofTop = rt;
  if (v === 1) {
    // an upper room on half of the terrace
    const uw = Math.round(F.bw * 0.5);
    const ux = F.bx0 + 2;
    const uh = 9;
    fillTex(roof, ux, rt - uh, uw, uh, (x, y) => shade(sand, 1.02 - y * 0.01 - (x >= uw - 2 ? 0.12 : 0)));
    fillTex(roof, ux, rt - uh - 4, uw, 4, (x, y) => shade(sand, y === 0 ? 0.8 : 1.12));
    roof.rect(ux + Math.round(uw / 2) - 1, rt - 6, 3, 4, P.dark);
    roofTop = rt - uh - 4;
  } else if (v === 2) {
    // a beehive oven against the wall
    const ox = F.bx1 - 9;
    for (let y = 0; y < 8; y++) {
      const half = Math.round(Math.sqrt(Math.max(0, 16 - (y - 7) * (y - 7) / 3)));
      body.hline(ox + 4 - half, c.fy1 - 8 + y, half * 2, shade(sand, 0.92));
    }
    body.rect(ox + 3, c.fy1 - 3, 2, 3, P.dark);
    c.hooks.smoke.push({ x: ox + 4, y: c.fy1 - 10 });
  }
  // a ladder up to the roof (homes) or a cloth awning (everyone)
  if (v !== 2) {
    const lx = F.bx1 - 4;
    body.vline(lx, rt - 2, c.fy1 - rt + 2, hex('#6b4a2a'));
    body.vline(lx + 3, rt - 2, c.fy1 - rt + 2, hex('#6b4a2a'));
    for (let y = rt; y < c.fy1; y += 3) body.hline(lx, y, 4, hex('#8a6238'));
  }
  // small high windows and a doorway under a timber lintel
  const n = Math.max(1, Math.min(3, Math.floor(F.bw / 16)));
  for (let i = 0; i < n; i++) {
    const wx = F.bx0 + Math.round((F.bw / (n + 1)) * (i + 1)) - 1;
    if (Math.abs(wx - F.doorCx) < 7) continue;
    body.rect(wx, wallTop + 5, 3, 3, P.dark);
  }
  const dh = Math.min(wallH - 6, 12);
  body.rect(F.doorCx - 3, c.fy1 - dh, 6, dh, P.dark);
  body.rect(F.doorCx - 4, c.fy1 - dh - 2, 8, 2, hex('#6b4a2a'));
  // awning in the people's colour
  body.rect(F.doorCx - 6, c.fy1 - dh - 6, 12, 3, P.accent);
  body.hline(F.doorCx - 6, c.fy1 - dh - 6, 12, P.accentHi);
  body.vline(F.doorCx - 6, c.fy1 - dh - 3, dh + 3, hex('#6b4a2a'));
  body.vline(F.doorCx + 5, c.fy1 - dh - 3, dh + 3, hex('#6b4a2a'));
  // storage jars
  for (let k = 0; k < 2; k++) {
    const jx = F.bx0 + 2 + k * 4;
    body.rect(jx, c.fy1 - 4, 3, 4, hex('#b0623a'));
    body.set(jx + 1, c.fy1 - 5, hex('#8a4a2a'));
  }
  extras(c, o, F, roofTop);
}

// ---------- 2 Classical ----------

function classical(c, o, v) {
  const { body, roof, P } = c;
  const F = frame(c);
  const seed = c.seed;
  const white = hex('#ece6d6');
  const wallH = Math.min(c.fy1 - 14, (o.wallH || 21) + (v === 2 ? 8 : 0));
  const wallTop = c.fy1 - wallH;
  fillTex(body, F.bx0, wallTop, F.bw, wallH, (x, y) => {
    let col = shade(white, 1.02 - 0.12 * (y / wallH) + (hash(x >> 2, y >> 2, seed) - 0.5) * 0.04);
    if (y >= wallH - 3) col = shade(hex('#b9b3a3'), 1 - (y - wallH + 3) * 0.05); // stone plinth
    if (x >= F.bw - 3) col = shade(col, 0.86);
    return col;
  });
  // a low-pitched roof of terracotta tiles
  const pitch = Math.max(6, Math.round(F.bw * 0.18));
  const roofTop = wallTop - pitch;
  roofPlane(roof, F.bx0 - 3, F.bx1 + 3, roofTop, wallTop + 1, v === 1 ? Math.floor(F.bw * 0.3) : 2, 'tile', P.snow ? ROOFS.snow : ROOFS.tile, seed);
  if (v === 0) {
    // portico: columns under an entablature and a pediment in the front
    const cols = Math.max(2, Math.min(5, Math.round(F.bw / 12)));
    const span = F.bw - 6;
    // the shaded recess behind the columns
    fillTex(body, F.bx0 + 2, wallTop + 2, F.bw - 4, wallH - 5, (x, y) => shade(hex('#b8ae96'), 1 - 0.15 * (y / wallH)));
    roof.rect(F.bx0 - 1, wallTop - 1, F.bw + 2, 3, hex('#d9d2bf'));
    for (let y = 0; y < pitch; y++) {
      const half = Math.round(((F.bw + 2) / 2) * (y / pitch));
      roof.hline(F.cx - half, roofTop + 1 + y, half * 2, y === pitch - 1 ? hex('#cfc7b2') : (y < 2 ? P.accentHi : hex('#e8e1cd')));
    }
    for (let k = 0; k < cols; k++) {
      const x = F.bx0 + 3 + Math.round((span / (cols - 1)) * k) - 1;
      body.rect(x, wallTop + 2, 3, wallH - 4, hex('#f6f2e8'));
      body.vline(x + 2, wallTop + 2, wallH - 4, hex('#cfc8b5'));
      body.rect(x - 1, wallTop + 2, 5, 1, hex('#dcd5c2'));
      body.rect(x - 1, c.fy1 - 3, 5, 1, hex('#dcd5c2'));
    }
    body.rect(F.doorCx - 3, c.fy1 - 12, 6, 12 - 2, P.door);
  } else {
    // villa (v1) or a two-storey insula with a shop (v2): arched windows with green shutters
    const rows = v === 2 ? 2 : 1;
    const n = Math.max(1, Math.floor(F.bw / 12));
    for (let r = 0; r < rows; r++) {
      const wy = wallTop + 4 + r * 11;
      for (let i = 0; i < n; i++) {
        const wx = F.bx0 + Math.round((F.bw / (n + 1)) * (i + 1)) - 2;
        if (r === rows - 1 && Math.abs(wx + 2 - F.doorCx) < 8) continue;
        body.rect(wx, wy, 4, 6, P.dark);
        body.set(wx, wy, white); body.set(wx + 3, wy, white);
        body.rect(wx - 2, wy, 2, 6, hex('#4f7a4a'));
        body.rect(wx + 4, wy, 2, 6, hex('#4f7a4a'));
      }
    }
    if (v === 2) {
      // the taberna: a wide shop opening with an awning
      body.rect(F.bx0 + 3, c.fy1 - 9, Math.round(F.bw * 0.4), 7, hex('#3a2a1e'));
      body.rect(F.bx0 + 2, c.fy1 - 11, Math.round(F.bw * 0.4) + 2, 2, P.accent);
      for (let k = 0; k < 3; k++) body.rect(F.bx0 + 5 + k * 4, c.fy1 - 4, 3, 2, hex('#c9893a')); // goods
    }
    doorAt(body, F.doorCx, c.fy1, 6, 12, P, true, false);
  }
  extras(c, o, F, roofTop);
}

// ---------- 3 Medieval ----------

function medieval(c, o, v) {
  const { body, roof, P } = c;
  const F = frame(c);
  const seed = c.seed;
  const wallH = Math.min(c.fy1 - 18, (o.wallH || 21) + 6);
  const wallTop = c.fy1 - wallH;
  const ground = Math.round(wallH * 0.42);
  brick(body, F.bx0, c.fy1 - ground, F.bw, ground, STONE_GREY, seed, { course: 4, bw: 7 });
  // the jettied upper storey: two pixels wider on each side, plaster between oak beams
  const ux0 = F.bx0 - 2;
  const uw = F.bw + 4;
  const uh = wallH - ground;
  const plasterCol = v === 2 ? hex('#efe3c2') : hex('#e6d7b5');
  fillTex(body, ux0, wallTop, uw, uh, (x, y) => shade(plasterCol, 1.02 - 0.1 * (y / uh) - (x >= uw - 3 ? 0.12 : 0)));
  body.rect(ux0, wallTop, uw, 2, BEAM);
  body.rect(ux0, wallTop + uh - 2, uw, 2, BEAM);
  body.rect(ux0 - 1, wallTop + uh, uw + 2, 1, shade(BEAM, 0.7)); // shadow under the jetty
  const step = 8;
  for (let x = 0; x < uw; x += step) {
    body.vline(ux0 + x, wallTop, uh, BEAM);
    // braces: crosses (v0), single diagonals (v1) or chevrons (v2)
    for (let y = 2; y < uh - 2; y++) {
      const t = (y - 2) / Math.max(1, uh - 4);
      const d = Math.round(t * (step - 1));
      if (v !== 1 || (x / step) % 2 === 0) body.set(ux0 + x + d, wallTop + y, BEAM);
      if (v === 0) body.set(ux0 + x + step - 1 - d, wallTop + y, BEAM);
      if (v === 2) body.set(ux0 + x + step - 1 - d, wallTop + uh - 1 - y, BEAM);
    }
  }
  // small leaded windows in the upper storey
  const n = Math.max(1, Math.floor(uw / 14));
  for (let i = 0; i < n; i++) {
    const wx = ux0 + Math.round((uw / (n + 1)) * (i + 1)) - 2;
    body.rect(wx - 1, wallTop + 3, 6, Math.max(4, uh - 6), BEAM);
    fillTex(body, wx, wallTop + 4, 4, Math.max(2, uh - 8), (x, y) => ((x + y) % 2 === 0 ? (hash(i, 9, seed) > 0.5 ? P.glow : P.glassHi) : P.glass));
  }
  // a steep roof
  const roofTop = 2;
  const kind = v === 1 ? 'shingle' : 'slate';
  roofPlane(roof, ux0 - 2, ux0 + uw + 1, roofTop + 4, wallTop + 1, Math.floor(uw * 0.42), kind, P.snow ? ROOFS.snow : ROOFS[kind], seed);
  // stone chimney
  const chx = F.bx1 - Math.round(F.bw * 0.25);
  brick(roof, chx, roofTop, 5, Math.max(6, wallTop - roofTop - 4), STONE_GREY, seed + 2, { course: 3, bw: 5 });
  roof.rect(chx - 1, roofTop, 7, 2, STONE_GREY.hi);
  c.hooks.smoke.push({ x: chx + 2, y: roofTop - 2 });
  // a plank door with iron studs under a stone arch
  doorAt(body, F.doorCx, c.fy1, 6, Math.min(ground + 2, 12), { ...P, brick: { ...P.brick, hi: STONE_GREY.hi, lo: STONE_GREY.lo } }, true, true);
  extras(c, o, F, roofTop);
}

// ---------- 4 Industrial ----------

function industrial(c, o, v) {
  const { body, roof, P } = c;
  const F = frame(c);
  const seed = c.seed;
  const wallH = Math.min(c.fy1 - 6, Math.max((o.wallH || 21) + 12, 30));
  const wallTop = c.fy1 - wallH;
  brick(body, F.bx0, wallTop, F.bw, wallH, RED_BRICK, seed, { course: 3, bw: 6 });
  // terrace bays split by downpipes
  for (let x = F.bx0 + 15; x < F.bx1 - 4; x += 16) body.vline(x, wallTop + 2, wallH - 2, hex('#3c3c44'));
  // sash windows with stone lintels, storey by storey
  const storeys = Math.max(2, Math.floor((wallH - 4) / 11));
  const n = Math.max(1, Math.floor(F.bw / 10));
  for (let s = 0; s < storeys; s++) {
    const wy = wallTop + 4 + s * 11;
    for (let i = 0; i < n; i++) {
      const wx = F.bx0 + Math.round((F.bw / (n + 1)) * (i + 1)) - 2;
      if (s === storeys - 1 && Math.abs(wx + 2 - F.doorCx) < 7) continue;
      if (v === 2 && s === storeys - 1 && wx < F.bx0 + F.bw * 0.45) continue; // the shop front takes the ground floor
      body.rect(wx - 1, wy - 2, 7, 1, hex('#d8d2c4'));
      body.rect(wx, wy, 5, 7, hex('#f2efe8'));
      body.rect(wx + 1, wy + 1, 3, 2, hash(i, s, seed) > 0.5 ? P.glow : P.glass);
      body.rect(wx + 1, wy + 4, 3, 2, hash(i + 3, s, seed) > 0.6 ? P.glow : P.glass);
    }
  }
  if (v === 2) {
    // corner shop: a sign band and a big shop window
    const sw = Math.round(F.bw * 0.42);
    body.rect(F.bx0 + 1, c.fy1 - 12, sw, 2, P.accent);
    body.rect(F.bx0 + 2, c.fy1 - 9, sw - 2, 7, P.glassHi);
    body.rect(F.bx0 + 3, c.fy1 - 8, sw - 4, 5, P.glow);
  }
  // door with a fanlight and steps
  body.rect(F.doorCx - 3, c.fy1 - 11, 6, 11, hex('#2a3a4a'));
  body.rect(F.doorCx - 2, c.fy1 - 13, 4, 2, P.glow);
  body.rect(F.doorCx - 4, c.fy1 - 1, 8, 1, hex('#bdb7aa'));
  body.rect(F.doorCx - 5, c.fy1, 10, 1, hex('#a8a296'));
  let roofTop;
  if (v === 1) {
    // mansard roof with dormers
    roofTop = wallTop - 9;
    roofPlane(roof, F.bx0 - 1, F.bx1 + 1, roofTop, wallTop + 1, 3, 'slate', P.snow ? ROOFS.snow : ROOFS.slate, seed);
    for (let x = F.bx0 + 6; x < F.bx1 - 6; x += 14) { roof.rect(x, roofTop + 2, 6, 6, hex('#e6e2d8')); roof.rect(x + 1, roofTop + 3, 4, 4, P.glass); }
  } else {
    // flat roof behind a stone cornice and parapet
    roofTop = wallTop - 3;
    roof.rect(F.bx0 - 1, wallTop - 3, F.bw + 2, 2, hex('#d8d2c4'));
    roof.rect(F.bx0 - 1, wallTop - 1, F.bw + 2, 1, hex('#9c968a'));
  }
  // chimney stacks with clay pots, all smoking
  const stacks = Math.max(1, Math.min(3, Math.round(F.bw / 20)));
  for (let k = 0; k < stacks; k++) {
    const x = F.bx0 + Math.round((F.bw / (stacks + 1)) * (k + 1)) - 3;
    const top = Math.max(1, roofTop - 9);
    brick(roof, x, top, 6, roofTop - top + 2, RED_BRICK, seed + k, { course: 3, bw: 6 });
    roof.rect(x - 1, top - 1, 8, 2, hex('#d8d2c4'));
    roof.rect(x, top - 3, 2, 2, hex('#c0663a'));
    roof.rect(x + 3, top - 3, 2, 2, hex('#c0663a'));
    c.hooks.smoke.push({ x: x + 1, y: top - 4 });
  }
  extras(c, { ...o, banner: false }, F, roofTop);
}

// ---------- 5 Space Age ----------

function spaceAge(c, o, v) {
  const { body, roof, P } = c;
  const F = frame(c);
  const panel = hex('#eef2f6');
  const seam = hex('#c9d2dc');
  const wallH = Math.min(c.fy1 - 10, Math.max((o.wallH || 21) + 6, 24));
  const wallTop = c.fy1 - wallH;
  const block = (x0, top, w, h) => {
    fillTex(body, x0, top, w, h, (x, y) => {
      if ((x < 2 && y < 2) || (x > w - 3 && y < 2)) return null; // rounded corners
      let col = shade(panel, 1 - 0.1 * (y / h) - (x >= w - 3 ? 0.1 : 0));
      if (x % 9 === 8 || y % 8 === 7) col = seam;
      return col;
    });
  };
  if (v === 1) {
    // two offset pods: a cantilevered upper module over a smaller base
    block(F.bx0 + 4, c.fy1 - Math.round(wallH * 0.5), F.bw - 8, Math.round(wallH * 0.5));
    block(F.bx0 - 1, wallTop, F.bw + 2, Math.round(wallH * 0.55));
    body.rect(F.bx0 - 1, wallTop + Math.round(wallH * 0.55), F.bw + 2, 1, shade(seam, 0.7));
  } else {
    block(F.bx0, wallTop, F.bw, wallH);
  }
  // wide glass bands with a reflection
  const bands = v === 1 ? [wallTop + 4, c.fy1 - Math.round(wallH * 0.35)] : [wallTop + 5];
  for (const by of bands) {
    fillTex(body, F.bx0 + 3, by, F.bw - 6, 5, (x, y) => {
      if ((x + y * 2) % 13 < 2) return hex('#e0f2fe');
      return y < 2 ? hex('#7dd3fc') : hex('#0ea5e9');
    });
  }
  // light strip in the people's colour and a sliding glass door
  body.rect(F.bx0, c.fy1 - 2, F.bw, 1, P.accent);
  body.rect(F.doorCx - 4, c.fy1 - 12, 8, 12, hex('#9fd8f5'));
  body.vline(F.doorCx, c.fy1 - 12, 12, seam);
  body.rect(F.doorCx - 5, c.fy1 - 13, 10, 1, P.accent);
  // the roof: a solar array; an antenna or a dish; v2 adds a glass dome annex
  const roofTop = wallTop - 6;
  for (let x = F.bx0 + 2; x < F.bx1 - 4; x += 7) {
    fillTex(roof, x, roofTop, 6, 5, (xx, yy) => ((xx === 2 || yy === 2) ? hex('#3b82f6') : hex('#1e3a8a')));
    roof.vline(x + 2, roofTop + 5, 1, seam);
  }
  if (v === 2) {
    const dx = F.bx1 - 8;
    const r = 7;
    for (let y = 0; y <= r; y++) {
      const half = Math.round(Math.sqrt(Math.max(0, r * r - y * y)));
      for (let x = -half; x <= half; x++) roof.set(dx + x, wallTop - y, (x + 64) % 4 === 0 || y === r ? seam : (x < 0 ? hex('#cfe9ff') : hex('#8fb8de')));
    }
  } else {
    const ax = F.bx0 + 4;
    roof.vline(ax, roofTop - 10, 10, seam);
    roof.set(ax, roofTop - 11, hex('#ef4444'));
    if (v === 0) { roof.rect(F.bx1 - 7, roofTop - 6, 5, 3, seam); roof.vline(F.bx1 - 5, roofTop - 3, 3, seam); }
  }
  extras(c, { ...o, props: [], banner: false }, F, roofTop);
}

const AGES = [stoneAge, bronzeAge, classical, medieval, industrial, spaceAge];

// Draws a walled building (the gable family) in the architecture of age `era`, variant 0..2.
export function drawAgeBuilding(c, o, era, variant = 0) {
  const fn = AGES[Math.max(0, Math.min(AGES.length - 1, era))];
  fn(c, o, ((variant % 3) + 3) % 3);
}
