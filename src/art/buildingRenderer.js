// Draws buildings and roads for planet/surfaceRenderer.js, kept in its own module so the renderer stays small.
//
//   const br = new BuildingRenderer(terrain, society);
//   br.drawRoad(ctx, tile, px, py, ts)                    // ground pass: autotiled dirt / gravel / cobble
//   br.begin(ctx, view, ts, zoom, time)                   // collects and depth-sorts the visible buildings
//   br.drawUpTo(y)  ...  br.flush()                       // called while creatures are drawn in y order, so a creature
//                                                         // standing behind a building is hidden by it, one in front is not
//
// A building's sort key is the front edge of its footprint (y + h). A creature whose feet are above that line (smaller y)
// is drawn first; the sprite then paints over it. Far out, buildings become coloured footprints (level of detail).
import { getBuildingCanvas } from './buildingSprites.js';
import { composeRoadTile } from './roadTiles.js';
import { BUILDING_TYPES, TILE_PX, SPRITE_PAD_BOTTOM } from '../world/buildings.js';

const LOD_PX_PER_TILE = 5;       // below this many screen pixels per tile buildings are flat footprints
const roadCanvases = new Map();

const CATEGORY_COLOR = {
  housing: '#a8693f', storage: '#b59a52', workshop: '#8f6a4a', farm: '#c9a63a', defense: '#7e87a6', civic: '#b5503a',
  religious: '#e0d6b0', extraction: '#7a7e88', dock: '#8a6a3a'
};

export function roadCanvas(kind, mask, variant) {
  const key = `${kind}|${mask}|${variant}`;
  let c = roadCanvases.get(key);
  if (!c) {
    const pix = composeRoadTile(kind, mask, variant);
    c = document.createElement('canvas');
    c.width = pix.w;
    c.height = pix.h;
    c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(pix.data), pix.w, pix.h), 0, 0);
    roadCanvases.set(key, c);
  }
  return c;
}

export class BuildingRenderer {
  constructor(terrain, society) {
    this.terrain = terrain;
    this.society = society;
    this.queue = [];
    this.cursor = 0;
    this.scratch = [];
    this.styles = new WeakMap(); // building -> { accent, style }
    this.civColors = new Map();
    this.lod = false;
    this.ctx = null;
    this.ts = 14;
    this.zoom = 1;
    this.time = 0;
    this.drawn = 0;
  }

  // ---------- roads ----------

  drawRoad(ctx, tile, px, py, ts) {
    const t = this.terrain;
    const x = tile.x;
    const y = tile.y;
    const has = (nx, ny) => nx >= 0 && ny >= 0 && nx < t.width && ny < t.height && Boolean(t.getTile(nx, ny).road);
    const mask = (has(x, y - 1) ? 1 : 0) | (has(x + 1, y) ? 2 : 0) | (has(x, y + 1) ? 4 : 0) | (has(x - 1, y) ? 8 : 0);
    const variant = ((Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0) & 3;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(roadCanvas(tile.road, mask, variant), px, py, ts, ts);
  }

  // ---------- buildings ----------

  styleOf(b) {
    const civ = b.civId ? this.civColors.get(b.civId) : null;
    const accent = civ || (b.style && b.style.accent) || '#c0392b';
    let s = this.styles.get(b);
    if (!s || s.accent !== accent || s.base !== b.style) {
      // a stable design variant per building, so a street of one age does not repeat (eraArchitecture.js)
      const variant = b.style && b.style.variant !== undefined ? b.style.variant : (Math.imul(b.id | 0, 2654435761) >>> 0) % 3;
      s = { accent, base: b.style, style: { ...(b.style || {}), accent, variant } };
      this.styles.set(b, s);
    }
    return s.style;
  }

  wallMask(b) {
    const def = BUILDING_TYPES[b.type];
    if (!def || def.connects !== 'wall') return 0;
    const t = this.terrain;
    const link = (x, y) => {
      if (!t.inBounds(x, y)) return 0;
      const s = t.getTile(x, y).structure;
      if (!s || s.buildingId === undefined) return 0;
      const od = BUILDING_TYPES[s.type];
      return od && od.connects === 'wall' ? 1 : 0;
    };
    // a 2x2 corner tower connects along its whole border; check the tiles just outside its edges
    let mask = 0;
    for (let i = 0; i < b.w; i++) {
      if (link(b.x + i, b.y - 1)) mask |= 1;
      if (link(b.x + i, b.y + b.h)) mask |= 4;
    }
    for (let j = 0; j < b.h; j++) {
      if (link(b.x + b.w, b.y + j)) mask |= 2;
      if (link(b.x - 1, b.y + j)) mask |= 8;
    }
    return mask;
  }

  begin(ctx, view, ts, zoom, time) {
    this.ctx = ctx;
    this.ts = ts;
    this.zoom = zoom;
    this.time = time;
    this.lod = ts * zoom < LOD_PX_PER_TILE;
    this.civColors.clear();
    for (const civ of this.society.civilizations) this.civColors.set(civ.id, civ.color);
    const list = this.terrain.buildingsInRect(view.minX, view.minY, view.maxX, view.maxY, this.scratch);
    const q = this.queue;
    q.length = 0;
    for (const b of list) q.push(b);
    q.sort((a, c) => (a.y + a.h) - (c.y + c.h) || a.x - c.x);
    this.cursor = 0;
    this.drawn = 0;
  }

  // Draws every queued building whose front edge is at or above `y` (tile units).
  drawUpTo(y) {
    const q = this.queue;
    while (this.cursor < q.length && q[this.cursor].y + q[this.cursor].h <= y) this.drawOne(q[this.cursor++]);
  }

  flush() {
    this.drawUpTo(Infinity);
  }

  drawOne(b) {
    const ctx = this.ctx;
    const ts = this.ts;
    const def = BUILDING_TYPES[b.type];
    if (!def) return;
    this.drawn++;
    if (this.lod) {
      const color = b.type === 'ruins' ? '#6b6a64' : (CATEGORY_COLOR[def.category] || '#999');
      ctx.fillStyle = b.progress < 1 ? 'rgba(220, 200, 150, 0.7)' : color;
      ctx.fillRect(b.x * ts, b.y * ts, b.w * ts, b.h * ts);
      if (b.progress >= 1 && def.ext >= 30) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
        ctx.fillRect(b.x * ts, b.y * ts, b.w * ts, ts * 0.35);
      }
      return;
    }
    const s = ts / TILE_PX;
    const sprite = getBuildingCanvas(b.type, {
      style: this.styleOf(b),
      progress: b.progress,
      damage: b.damage,
      mask: this.wallMask(b),
      w: b.type === 'ruins' ? b.w : undefined,
      h: b.type === 'ruins' ? b.h : undefined,
      seed: b.type === 'ruins' ? b.id % 7 : 0,
      fire: b.fire ? true : undefined
    });
    const dx = b.x * ts - sprite.footX * s;
    const dy = (b.y + b.h) * ts + SPRITE_PAD_BOTTOM * s - sprite.h * s;
    ctx.imageSmoothingEnabled = s < 1;
    ctx.drawImage(sprite.canvas, dx, dy, sprite.w * s, sprite.h * s);
    // chimney smoke: a few rising puffs (cosmetic, so Math-free and cheap)
    if (b.progress >= 1 && b.type !== 'ruins' && this.zoom > 0.7 && sprite.hooks.smoke.length) {
      const hooks = sprite.hooks.smoke;
      for (let k = 0; k < hooks.length; k++) {
        for (let i = 0; i < 3; i++) {
          const phase = ((this.time * 0.35 + i / 3 + b.id * 0.37 + k * 0.2) % 1);
          ctx.globalAlpha = 0.5 * (1 - phase);
          ctx.fillStyle = '#d7d9de';
          const r = (1.5 + phase * 3) * s;
          ctx.beginPath();
          ctx.arc(dx + hooks[k].x * s + Math.sin(phase * 6 + b.id) * 2 * s + phase * 3 * s, dy + hooks[k].y * s - phase * 20 * s, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }
  }
}
