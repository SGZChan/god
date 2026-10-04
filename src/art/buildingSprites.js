// Procedural pixel-art buildings. composeBuilding() is pure (it returns an RGBA pixel buffer plus hooks) so it runs
// in node tests; getBuildingCanvas() rasterises it into a cached canvas like creatureSprite.js does for creatures.
//
// One sprite pixel is one world pixel at tile size 14 (TILE_PX): a 3x3 house is 50 x ~60 px next to a 20 px creature.
// The footprint's front (bottom) edge is the sprite's baseline; the building rises above it.
//
//   composeBuilding(type, { style, progress, damage, mask, fire, seed }) -> { w, h, data, footX, footY, hooks }
//     style:    { pal: 'stone' | 'timber' | 'sandstone', snow: bool, accent: '#rrggbb' }
//     progress: 0..1 construction (stages: foundation, frame, walls rising, roofed, complete)
//     damage:   0..1 (cracks, missing chunks, scorch); `fire` adds flames; ruins are the 'ruins' type
//     mask:     wall pieces only: neighbours N=1 E=2 S=4 W=8 of the same wall family (autotiling)
//     hooks:    { smoke: [{x, y}], fire: [{x, y}], door: {x, y} } in sprite pixels, for particles and effects
import { BUILDING_TYPES, spriteMetrics, TILE_PX, SPRITE_PAD_X, SPRITE_PAD_BOTTOM } from '../world/buildings.js';
import { Pix, hash, hex, seedOf, shade } from './pixelKit.js';
import { ART, paletteOf, ROOFS } from './buildingArt.js';

export const STAGES = 8; // 0 foundation ... 7 complete
const STAGE_BODY = [0, 0, 0.14, 0.38, 0.72, 1, 1, 1];
const STAGE_ROOF = [0, 0, 0, 0, 0, 0.0, 0.62, 1];

export function stageOf(progress) {
  if (progress >= 1) return 7;
  if (progress < 0.1) return 0;
  if (progress < 0.22) return 1;
  if (progress < 0.38) return 2;
  if (progress < 0.55) return 3;
  if (progress < 0.72) return 4;
  if (progress < 0.86) return 5;
  return 6;
}

export function damageLevel(damage) {
  return damage < 0.12 ? 0 : (damage < 0.4 ? 1 : (damage < 0.7 ? 2 : 3));
}

export function styleKey(style) {
  const s = style || {};
  return `${s.pal || 'stone'}${s.snow ? '+snow' : ''}${s.accent || ''}`;
}

// ---------- construction ----------

function foundation(c, stage, body) {
  const { P } = c;
  const x0 = c.x0;
  const x1 = c.x1 - 1;
  const top = c.fy1 - Math.min(c.fy1 - c.fy0 - 2, 16 + c.def.h * 3);
  const y1 = c.fy1 - 1;
  // packed earth with a stone footing that fills in
  for (let y = top; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const h = hash(x, y, c.seed);
    body.set(x, y, h > 0.85 ? P.dirtLo : (h > 0.3 ? P.dirt : shade(P.dirt, 1.12)));
  }
  const filled = stage === 0 ? 0.5 : 1;
  for (let x = x0; x <= x1; x++) {
    if ((x - x0) / (x1 - x0) > filled) continue;
    for (const y of [top, y1]) body.set(x, y, hash(x, y, 4) > 0.5 ? P.brick.cap : P.brick.hi);
  }
  for (let y = top; y <= y1; y++) {
    if ((y - top) / (y1 - top) <= filled) { body.set(x0, y, P.brick.hi); body.set(x1, y, P.brick.cap); }
  }
  // corner stakes with a string
  for (const [sx, sy] of [[x0, top], [x1, top], [x0, y1], [x1, y1]]) {
    body.rect(sx - 1, sy - 6, 2, 8, P.woodLo);
    body.set(sx - 1, sy - 7, P.woodHi);
    body.set(sx, sy - 6, P.accentHi);
  }
  for (let x = x0; x <= x1; x += 2) body.set(x, top - 4, hex('#d8caa0'));
  for (let x = x0; x <= x1; x += 2) body.set(x, y1 - 4, hex('#d8caa0'));
  // material piles
  logPile(body, x1 - 16, y1 + 2, 2, P);
}

function logPile(p, x, y, n, P) {
  for (let r = 0; r < n; r++) {
    for (let i = 0; i < n - r; i++) {
      const lx = x + i * 5 + r * 2;
      const ly = y - r * 4;
      p.rect(lx, ly - 4, 5, 4, P.log.mid);
      p.hline(lx, ly - 4, 5, P.log.hi);
      p.hline(lx, ly - 1, 5, P.log.lo);
      p.set(lx + 4, ly - 3, P.log.ring);
    }
  }
}

function scaffold(c, topY) {
  const { P, body } = c;
  const posts = [c.x0 - 1, c.x1 - 1];
  const bottom = c.fy1 + 1;
  for (const px of posts) {
    body.rect(px, topY, 2, bottom - topY, P.wood);
    body.vline(px, topY, bottom - topY, P.woodHi);
  }
  for (let y = bottom - 9; y > topY; y -= 10) {
    body.rect(posts[0], y, posts[1] - posts[0] + 2, 2, P.woodHi);
    body.hline(posts[0], y + 2, posts[1] - posts[0] + 2, P.woodLo);
    // cross brace
    const len = posts[1] - posts[0];
    for (let i = 0; i < 9; i++) body.set(posts[0] + 2 + Math.round((i * (len - 4)) / 8), y + 2 + i, P.woodLo);
  }
}

// ---------- damage and fire ----------

function damage(pix, level, seed, P, fire) {
  if (level === 0 && !fire) return [];
  const b = pix.bounds();
  if (!b) return [];
  const fireSpots = [];
  const spots = level * 4 + 2;
  // scorch blotches
  if (level >= 1) {
    for (let i = 0; i < spots; i++) {
      const cx = b.left + Math.floor(hash(i, 1, seed) * (b.right - b.left));
      const cy = b.top + Math.floor((0.35 + hash(i, 2, seed) * 0.65) * (b.bottom - b.top));
      const r = 2 + Math.floor(hash(i, 3, seed) * (2 + level));
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
        if (x * x + y * y > r * r || !pix.alpha(cx + x, cy + y)) continue;
        const i4 = ((cy + y) * pix.w + cx + x) * 4;
        pix.data[i4] *= 0.55; pix.data[i4 + 1] *= 0.52; pix.data[i4 + 2] *= 0.55;
      }
    }
  }
  // cracks: random walks down from the upper wall
  for (let i = 0; i < level * 3; i++) {
    let x = b.left + 3 + Math.floor(hash(i, 4, seed) * (b.right - b.left - 6));
    let y = b.top + Math.floor((0.3 + hash(i, 5, seed) * 0.3) * (b.bottom - b.top));
    for (let k = 0; k < 8 + level * 3; k++) {
      if (pix.alpha(x, y)) pix.set(x, y, 0x20181e);
      y += 1;
      x += hash(k, i + 20, seed) > 0.66 ? 1 : (hash(k, i + 30, seed) > 0.5 ? -1 : 0);
    }
  }
  // missing chunks along the silhouette (level 2+)
  if (level >= 2) {
    for (let i = 0; i < level * 2; i++) {
      const x = b.left + Math.floor(hash(i, 6, seed) * (b.right - b.left));
      let y = b.top;
      while (y < b.bottom && !pix.alpha(x, y)) y++;
      const r = 2 + Math.floor(hash(i, 7, seed) * 3);
      for (let yy = -1; yy < r + 1; yy++) for (let xx = -r; xx <= r; xx++) {
        if (Math.abs(xx) + yy * 1.2 <= r) pix.erase(x + xx, y + yy);
      }
      for (let xx = -r; xx <= r; xx++) if (pix.alpha(x + xx, y + r + 1)) pix.set(x + xx, y + r + 1, 0x2a2026);
    }
  }
  if (fire || level >= 3) {
    const n = fire ? 5 : 2;
    for (let i = 0; i < n; i++) {
      const x = b.left + 4 + Math.floor(hash(i, 8, seed) * Math.max(1, b.right - b.left - 8));
      let y = b.top + 1;
      while (y < b.bottom && !pix.alpha(x, y)) y++;
      fireSpots.push({ x, y });
      if (!fire) continue;
      for (let k = 0; k < 7; k++) {
        const w = Math.max(1, 3 - (k >> 1));
        const col = k < 3 ? 0xfff2a0 : (k < 5 ? 0xffb02e : 0xe5521d);
        pix.rect(x - (w >> 1) + (k % 2 ? 0 : 1), y - k - 1, w, 1, col);
      }
    }
  }
  return fireSpots;
}

// ---------- composition ----------

export function composeBuilding(type, opts = {}) {
  const def = BUILDING_TYPES[type];
  if (!def) throw new Error(`Unknown building type "${type}"`);
  const art = ART[type];
  const style = opts.style || { pal: 'stone' };
  const progress = opts.progress === undefined ? 1 : opts.progress;
  const level = damageLevel(opts.damage || 0);
  const fw = opts.w || def.w;
  const fh = opts.h || def.h;
  const m = spriteMetrics(def, fw, fh);
  const stage = stageOf(progress);
  const P = paletteOf(style);
  const seed = (opts.seed !== undefined ? opts.seed : 0) + seedOf(type + styleKey(style));
  const c = {
    def, style, P, seed, W: m.width, H: m.height,
    x0: SPRITE_PAD_X, x1: m.width - SPRITE_PAD_X,
    fy1: m.height - SPRITE_PAD_BOTTOM, fy0: m.footY,
    body: new Pix(m.width, m.height), roof: new Pix(m.width, m.height), shadow: new Pix(m.width, m.height),
    hooks: { smoke: [], fire: [], door: null },
    mask: opts.mask || 0,
    growth: 1, piles: false
  };
  const flat = Boolean(art.flat);
  if (flat) c.growth = stage === 7 ? 1 : Math.max(0.05, progress);
  if (type === 'ruins') c.def = { ...def, w: fw, h: fh };
  art.fn(c, art.o || {});

  // drop shadow: a soft wedge on the ground to the right/below, only for tall buildings
  const sh = flat ? 0 : Math.min(10, Math.max(3, def.ext * 0.3));
  if (sh) {
    for (let y = 0; y < sh; y++) {
      const span = c.x1 - c.x0 - 2;
      c.shadow.rect(c.x0 + 3, c.fy1 - 2 + y - Math.floor(sh / 2), span + Math.round(y * 0.8) + 2, 1, 0x000000, y < sh / 2 ? 70 : 52);
    }
    c.shadow.rect(c.x1 - 1, c.fy1 - 2 - Math.floor(sh * 0.6), 3, Math.floor(sh * 0.6) + 2, 0x000000, 40);
  }

  // The building proper (no shadow): finished, or the stage of construction it has reached
  const bld = new Pix(m.width, m.height);
  if (stage < 7 && !flat) {
    const bb = c.body.bounds();
    const frameTop = bb ? bb.top : c.fy1 - 20;
    const hgt = c.fy1 - frameTop;
    const bodyFrac = STAGE_BODY[stage];
    foundation(c, Math.min(stage, 2), bld);
    if (stage >= 2) {
      const wall = new Pix(m.width, m.height);
      wall.blit(c.body);
      wall.clipAbove(Math.round(c.fy1 - bodyFrac * hgt));
      bld.blit(wall);
      if (bodyFrac < 1) {
        // the unfinished wall top: fresh pale stones
        const ty = Math.round(c.fy1 - bodyFrac * hgt);
        for (let x = 0; x < m.width; x++) if (wall.alpha(x, ty)) bld.set(x, ty, hash(x, ty, 2) > 0.5 ? P.brick.cap : P.brick.hi);
      }
      const rb = c.roof.bounds();
      if (rb && stage === 5) {
        for (let y = rb.top; y <= rb.bottom; y++) for (let x = rb.left; x <= rb.right; x++) {
          if (!c.roof.alpha(x, y)) continue;
          const edge = !c.roof.alpha(x - 1, y) || !c.roof.alpha(x + 1, y) || !c.roof.alpha(x, y - 1) || !c.roof.alpha(x, y + 1);
          if (edge || (x - rb.left) % 7 === 0) bld.set(x, y, P.woodHi);
        }
      } else if (rb && stage === 6) {
        const part = new Pix(m.width, m.height);
        part.blit(c.roof);
        part.clipAbove(Math.round(rb.bottom - STAGE_ROOF[stage] * (rb.bottom - rb.top + 1)));
        bld.blit(part);
      }
      if (stage <= 5) {
        const sc = new Pix(m.width, m.height);
        scaffold({ ...c, body: sc }, Math.round(c.fy1 - Math.min(hgt, Math.max(0.3, bodyFrac) * hgt + 10)));
        bld.blit(sc);
      }
    }
  } else {
    bld.blit(c.body);
    bld.blit(c.roof);
  }

  // damage, then the dark outline around the silhouette (not the shadow)
  const fires = damage(bld, level, seed, P, opts.fire);
  bld.outline(P.outline);
  const final = new Pix(m.width, m.height);
  final.blit(c.shadow);
  final.blit(bld);
  for (const f of fires) c.hooks.fire.push(f);
  if (def.door) c.hooks.door = { x: SPRITE_PAD_X + (def.door.x + 0.5) * TILE_PX, y: c.fy1 };
  return { w: m.width, h: m.height, data: final.data, footX: m.footX, footY: m.footY, hooks: c.hooks, stage, level };
}

// ---------- browser raster + cache ----------

const cache = new Map();

export function spriteKeyOf(type, opts = {}) {
  const stage = stageOf(opts.progress === undefined ? 1 : opts.progress);
  const lvl = damageLevel(opts.damage || 0);
  return `${type}|${styleKey(opts.style)}|${stage}|${lvl}|${opts.mask || 0}|${opts.fire ? 1 : 0}|${opts.w || ''}x${opts.h || ''}|${opts.seed || 0}`;
}

// A cached canvas for the building. Progress and damage are quantised (8 stages, 4 damage levels).
export function getBuildingCanvas(type, opts = {}) {
  const key = spriteKeyOf(type, opts);
  let entry = cache.get(key);
  if (!entry) {
    // render at a representative progress for the stage so the cache key matches the picture
    const stage = stageOf(opts.progress === undefined ? 1 : opts.progress);
    const sprite = composeBuilding(type, { ...opts, progress: stage === 7 ? 1 : [0.05, 0.16, 0.3, 0.46, 0.63, 0.79, 0.93][stage] });
    const canvas = document.createElement('canvas');
    canvas.width = sprite.w;
    canvas.height = sprite.h;
    const ctx = canvas.getContext('2d');
    ctx.putImageData(new ImageData(new Uint8ClampedArray(sprite.data), sprite.w, sprite.h), 0, 0);
    entry = { canvas, w: sprite.w, h: sprite.h, footX: sprite.footX, footY: sprite.footY, hooks: sprite.hooks };
    cache.set(key, entry);
  }
  return entry;
}

export { ROOFS };
