// Builds creature sprites from genes. composeSprite() is pure (it returns rows of palette letters) so it
// can be tested without a browser; the helpers below turn a sprite into a canvas or data URL.
import { PART_COUNTS } from '../life/genome.js';
import { HEADS, BODIES, LEGS, EARS, HORNS, WINGS, TAILS } from './creatureParts.js';

export const SPRITE_W = 20;
export const SPRITE_H = 20;
const HALF = 8;           // columns in a part's left half
const BODY_X = 2;         // left edge of the body inside the 20 px canvas
const MIRROR_X = SPRITE_W - 1;

// ---------- composition ----------

function emptyGrid() {
  return Array.from({ length: SPRITE_H }, () => new Array(SPRITE_W).fill('.'));
}

// Paints `rows` at (x, y). With `mirror`, the rows are also painted flipped about the sprite's centre
// (`side` limits painting to the 'left' or 'right' copy). With `underlay`, only empty pixels are painted,
// so the part stays behind what is already there.
function blit(grid, rows, x, y, { mirror = false, underlay = false, side = 'both' } = {}) {
  const paint = (px, py, ch) => {
    if (ch === '.' || px < 0 || px >= SPRITE_W || py < 0 || py >= SPRITE_H) return;
    if (underlay && grid[py][px] !== '.') return;
    grid[py][px] = ch;
  };
  rows.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      if (side !== 'right') paint(x + c, y + r, row[c]);
      if (mirror && side !== 'left') paint(MIRROR_X - (x + c), y + r, row[c]);
    }
  });
}

// Decorations that depend on the pattern gene. Hash-based so a given species always looks the same.
function applyPattern(grid, pattern, seed) {
  const hash = (x, y) => {
    let h = Math.imul(x * 374761393 + y * 668265263 + seed * 2246822519, 1274126177);
    h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
  };
  for (let y = 1; y < SPRITE_H; y++) {
    for (let x = 0; x < SPRITE_W; x++) {
      const ch = grid[y][x];
      if (pattern === 1 && ch === 's') grid[y][x] = 'b';                              // plain: no belly
      if (pattern === 2) {                                                              // spots
        if (ch === 's') grid[y][x] = 'b';
        if (grid[y][x] === 'b' && hash(x >> 1, y >> 1) < 0.2) grid[y][x] = 's';
      }
      if (pattern === 3) {                                                              // stripes
        if (ch === 's') grid[y][x] = 'b';
        if (grid[y][x] === 'b' && y % 3 === 0) grid[y][x] = 's';
      }
      if (pattern === 4) {                                                              // patches
        if (ch === 's') grid[y][x] = 'b';
        if (grid[y][x] === 'b' && hash(x >> 2, y >> 2) < 0.35) grid[y][x] = 's';
      }
    }
  }
}

// traits: a creature phenotype (see Genome.phenotype). frame: 0 or 1 (walk cycle).
export function composeSprite(traits, frame = 0) {
  const grid = emptyGrid();
  const part = gene => Math.max(0, Math.min(PART_COUNTS[gene] - 1, Math.round(traits[gene])));
  const body = BODIES[part('body')];
  const head = HEADS[part('head')];
  const legs = LEGS[part('legs')];
  const bob = frame === 1 ? 1 : 0; // the body dips as the creature steps

  // body, head, ears and horns (symmetric)
  blit(grid, body, BODY_X, 8 + bob, { mirror: true });
  blit(grid, head, BODY_X, 1 + bob, { mirror: true });
  blit(grid, EARS[part('ears')], BODY_X, 0 + bob, { mirror: true });
  blit(grid, HORNS[part('horns')], BODY_X, 0 + bob, { mirror: true });

  // legs: the two sides take opposite frames so they alternate as the creature walks
  blit(grid, legs[frame], BODY_X, 16, { side: 'left' });
  blit(grid, legs[1 - frame], BODY_X, 16, { mirror: true, side: 'right' });

  // wings and tail sit behind everything
  blit(grid, WINGS[part('wings')], 0, 5 + bob, { mirror: true, underlay: true });
  blit(grid, TAILS[part('tail')], 16, 11 + bob, { underlay: true });

  applyPattern(grid, part('pattern'), Math.floor(traits.hue * 1000) + part('body') * 7);
  return grid.map(row => row.join(''));
}

// ---------- colours ----------

function hslToHex(h, s, l) {
  h = ((h % 1) + 1) % 1;
  const a = s * Math.min(l, 1 - l);
  const f = n => {
    const k = (n + h * 12) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * c).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

// Palette letters -> CSS colours, from the colour genes.
export function paletteFor(traits) {
  const sat = 0.35 + traits.sat * 0.55;
  const light = 0.3 + traits.light * 0.32;
  const hue2 = traits.hue + 0.08 + traits.hue2 * 0.5;
  return {
    b: hslToHex(traits.hue, sat, light),
    o: hslToHex(traits.hue, sat * 0.8, Math.max(0.08, light - 0.24)),
    l: hslToHex(traits.hue, sat * 0.9, Math.min(0.85, light + 0.18)),
    s: hslToHex(hue2, sat * 0.85, Math.min(0.8, light + 0.1)),
    e: hslToHex(traits.eyeHue, 0.7, 0.18),
    w: '#f8fafc',
    h: '#e9dfc2',
    k: '#1c1822'
  };
}

// ---------- rendering (browser) ----------

// Sprites with the same parts, colours (to a coarse step) and frame share one canvas.
export function spriteKey(traits, frame) {
  const parts = Object.keys(PART_COUNTS).map(g => Math.round(traits[g])).join('');
  const q = (v, n) => Math.min(n - 1, Math.floor(v * n));
  return `${parts}|${q(traits.hue, 24)}|${q(traits.sat, 4)}|${q(traits.light, 4)}|${q(traits.hue2, 4)}|${q(traits.eyeHue, 4)}|${frame}`;
}

const canvasCache = new Map();

export function getCreatureCanvas(traits, frame = 0) {
  const key = spriteKey(traits, frame);
  let canvas = canvasCache.get(key);
  if (!canvas) {
    const rows = composeSprite(traits, frame);
    const palette = paletteFor(traits);
    canvas = document.createElement('canvas');
    canvas.width = SPRITE_W;
    canvas.height = SPRITE_H;
    const ctx = canvas.getContext('2d');
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const color = palette[row[x]];
        if (!color) continue;
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 1, 1);
      }
    });
    canvasCache.set(key, canvas);
  }
  return canvas;
}

const urlCache = new Map();

// A PNG data URL for DOM <img> elements (inspector portrait, species chips).
export function creatureDataURL(traits) {
  const key = spriteKey(traits, 0);
  let url = urlCache.get(key);
  if (!url) {
    url = getCreatureCanvas(traits, 0).toDataURL();
    urlCache.set(key, url);
  }
  return url;
}
