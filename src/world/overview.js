// Cheap, cached pictures of a planet drawn straight from the generator (no chunks are created):
//   * PlanetOverview: the whole planet in one small canvas (the minimap and the far-zoom backdrop).
//   * LodBlocks: square blocks of 64x64 samples at a chosen stride, for zoomed-out views of the surface.
// Both build progressively under a time budget so the game never hitches; call step(budgetMs) every frame.
import { BIOMES } from '../planet/biomes.js';

const BLOCK = 64;

// Shaded biome colour of a terrain sample -> [r, g, b]
function shade(t, out) {
  const rgb = t.biome.colorRgb;
  let f = 1;
  if (t.biome.isWater) f = 0.78 + Math.max(0, t.elevation - 0.15) * 0.5;
  else if (t.elevation > 0.62) f = 1 + (t.elevation - 0.62) * 0.9;
  out[0] = Math.min(255, rgb[0] * f);
  out[1] = Math.min(255, rgb[1] * f);
  out[2] = Math.min(255, rgb[2] * f);
}

function sampler(terrain) {
  const gen = terrain.generator;
  return typeof gen.terrainAt === 'function'
    ? (x, y) => gen.terrainAt(x, y)
    : (x, y) => gen.tile(x, y);
}

export class PlanetOverview {
  constructor(terrain, cols = 256, rows = 128) {
    this.terrain = terrain;
    this.cols = cols;
    this.rows = rows;
    this.canvas = document.createElement('canvas');
    this.canvas.width = cols;
    this.canvas.height = rows;
    this.ctx = this.canvas.getContext('2d');
    this.image = this.ctx.createImageData(cols, rows);
    this.row = 0; // rows completed
    this.sample = sampler(terrain);
    this.rgb = [0, 0, 0];
    // start with ocean so a half-built map looks fine
    const ocean = BIOMES.DEEP_OCEAN.colorRgb;
    for (let i = 0; i < cols * rows; i++) {
      this.image.data[i * 4] = ocean[0];
      this.image.data[i * 4 + 1] = ocean[1];
      this.image.data[i * 4 + 2] = ocean[2];
      this.image.data[i * 4 + 3] = 255;
    }
    this.ctx.putImageData(this.image, 0, 0);
  }

  get done() {
    return this.row >= this.rows;
  }

  step(budgetMs = 4) {
    if (this.done) return;
    const t0 = performance.now();
    const { cols, rows, terrain, image, rgb } = this;
    const startRow = this.row;
    while (this.row < rows && performance.now() - t0 < budgetMs) {
      const y = Math.floor((this.row + 0.5) / rows * terrain.height);
      for (let c = 0; c < cols; c++) {
        const x = Math.floor((c + 0.5) / cols * terrain.width);
        shade(this.sample(x, y), rgb);
        const i = (this.row * cols + c) * 4;
        image.data[i] = rgb[0];
        image.data[i + 1] = rgb[1];
        image.data[i + 2] = rgb[2];
      }
      this.row++;
    }
    if (this.row > startRow) this.ctx.putImageData(image, 0, 0, 0, startRow, cols, this.row - startRow);
  }
}

const overviews = new WeakMap();
export function getOverview(terrain) {
  let overview = overviews.get(terrain);
  if (!overview) {
    overview = new PlanetOverview(terrain);
    overviews.set(terrain, overview);
  }
  return overview;
}

// Blocks of 64x64 samples; one sample covers `stride` x `stride` tiles (stride 1, 2, 4 or 8).
export class LodBlocks {
  constructor(terrain, maxBlocks = 320) {
    this.terrain = terrain;
    this.sample = sampler(terrain);
    this.blocks = new Map();
    this.maxBlocks = maxBlocks;
    this.rgb = [0, 0, 0];
    this.tick = 0;
  }

  // The block covering block coordinates (bx, by) at `stride`, created (empty) if new.
  block(stride, bx, by) {
    const key = `${stride}:${bx}:${by}`;
    let b = this.blocks.get(key);
    if (!b) {
      const canvas = document.createElement('canvas');
      canvas.width = BLOCK;
      canvas.height = BLOCK;
      const ctx = canvas.getContext('2d');
      b = { key, stride, bx, by, canvas, ctx, image: ctx.createImageData(BLOCK, BLOCK), row: 0, used: 0 };
      this.blocks.set(key, b);
    }
    b.used = ++this.tick;
    return b;
  }

  // Builds rows of the given blocks (in order) until the time budget is spent.
  build(blocks, budgetMs = 6) {
    const t0 = performance.now();
    const { terrain, rgb } = this;
    for (const b of blocks) {
      if (b.row >= BLOCK) continue;
      const startRow = b.row;
      const s = b.stride;
      while (b.row < BLOCK && performance.now() - t0 < budgetMs) {
        const y = Math.min(terrain.height - 1, b.by * BLOCK * s + b.row * s + (s >> 1));
        for (let c = 0; c < BLOCK; c++) {
          const x = Math.min(terrain.width - 1, b.bx * BLOCK * s + c * s + (s >> 1));
          shade(this.sample(x, y), rgb);
          const i = (b.row * BLOCK + c) * 4;
          b.image.data[i] = rgb[0];
          b.image.data[i + 1] = rgb[1];
          b.image.data[i + 2] = rgb[2];
          b.image.data[i + 3] = 255;
        }
        b.row++;
      }
      if (b.row > startRow) b.ctx.putImageData(b.image, 0, 0, 0, startRow, BLOCK, b.row - startRow);
      if (performance.now() - t0 >= budgetMs) break;
    }
    if (this.blocks.size > this.maxBlocks) this.evict();
  }

  evict() {
    const list = [...this.blocks.values()].sort((p, q) => p.used - q.used);
    for (const b of list.slice(0, this.blocks.size - Math.floor(this.maxBlocks * 0.75))) this.blocks.delete(b.key);
  }

  static get BLOCK() {
    return BLOCK;
  }
}
