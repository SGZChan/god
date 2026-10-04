// Renders the building sprites to a PNG with no browser (pure composeBuilding + zlib).
// Usage: node scripts/buildingsheet.mjs out.png [pal=stone|timber|sandstone] [progress=1] [damage=0] [snow=0] [scale=3] [types=a,b,c] [era=none|0..5|all]
// era=all draws every type once per age (0 stone ... 5 space), one row per type.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { composeBuilding } from '../src/art/buildingSprites.js';
import { BUILDING_IDS } from '../src/world/buildings.js';

const [out = 'buildings.png', pal = 'stone', progress = '1', damage = '0', snow = '0', scale = '3', types, era = 'none'] = process.argv.slice(2);
const SC = Number(scale);
const ids = types ? types.split(',') : [...BUILDING_IDS, 'ruins'];
const GRASS = [0x4f8a3a, 0x58943f];
const eras = era === 'all' ? [0, 1, 2, 3, 4, 5] : [era === 'none' ? undefined : Number(era)];
// VARIANTS=1 draws the three designs of every age (style.variant 0..2)
const variants = process.env.VARIANTS ? [0, 1, 2] : [0];
const sprites = ids.flatMap(id => eras.flatMap(e => variants.map(vr => ({ e, vr }))).map(({ e, vr }, k) => {
  const style = { pal, snow: snow === '1', accent: '#38bdf8', era: e, variant: vr };
  const mask = id.includes('wall') || id.includes('palisade') ? 10 : 0;
  return { id, newRow: era === 'all' && k === 0, s: composeBuilding(id, { style, progress: Number(progress), damage: Number(damage), mask, w: id === 'ruins' ? 3 : undefined, h: id === 'ruins' ? 3 : undefined }) };
}));
const maxW = 1800;
let x = 6;
let y = 6;
let rowH = 0;
const placed = [];
for (const sp of sprites) {
  const w = sp.s.w * SC + 14;
  if (x + w > maxW || (sp.newRow && x > 6)) { x = 6; y += rowH + 10; rowH = 0; }
  placed.push({ ...sp, x, y });
  x += w;
  rowH = Math.max(rowH, sp.s.h * SC + 6);
}
const W = maxW;
const H = y + rowH + 12;
const px = new Uint8Array(W * H * 3);
for (let j = 0; j < H; j++) {
  for (let i = 0; i < W; i++) {
    const g = GRASS[((i >> 4) + (j >> 4)) & 1];
    px[(j * W + i) * 3] = (g >> 16) & 255; px[(j * W + i) * 3 + 1] = (g >> 8) & 255; px[(j * W + i) * 3 + 2] = g & 255;
  }
}
for (const p of placed) {
  const { w, h, data } = p.s;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const a = data[(j * w + i) * 4 + 3] / 255;
      if (!a) continue;
      for (let dy = 0; dy < SC; dy++) {
        for (let dx = 0; dx < SC; dx++) {
          const o = ((p.y + j * SC + dy) * W + p.x + i * SC + dx) * 3;
          for (let k = 0; k < 3; k++) px[o + k] = px[o + k] * (1 - a) + data[(j * w + i) * 4 + k] * a;
        }
      }
    }
  }
  // creature-height marker (20 px) beside each sprite, bottom aligned to the footprint front edge
  const bx = p.x + w * SC + 2;
  const by = p.y + (h - 5) * SC - 20 * SC;
  for (let j = 0; j < 20 * SC; j++) for (let i = 0; i < 3; i++) { const o = ((by + j) * W + bx + i) * 3; if (o >= 0 && o < px.length) { px[o] = 255; px[o + 1] = 255; px[o + 2] = 255; } }
}
const raw = Buffer.alloc((W * 3 + 1) * H);
for (let j = 0; j < H; j++) {
  raw[j * (W * 3 + 1)] = 0;
  Buffer.from(px.buffer, j * W * 3, W * 3).copy(raw, j * (W * 3 + 1) + 1);
}
const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = b => { let c = -1; for (const v of b) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (t, d) => { const b = Buffer.alloc(12 + d.length); b.writeUInt32BE(d.length, 0); b.write(t, 4); d.copy(b, 8); b.writeUInt32BE(crc(b.subarray(4, 8 + d.length)), 8 + d.length); return b; };
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log('wrote', out, W, 'x', H);
