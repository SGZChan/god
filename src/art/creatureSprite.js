// Builds creature sprites from genes. composeSprite() is pure (it returns rows of palette letters) so it
// can be tested without a browser; the helpers below turn a sprite into a canvas or data URL.
import { PART_COUNTS } from '../life/genome.js';
import { HEADS, BODIES, LEGS, EARS, HORNS, WINGS, TAILS, MUTATIONS } from './creatureParts.js';

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
  // alien mutations are painted last, over everything
  const mutation = part('mutation');
  if (mutation > 0) {
    for (const [x, y, ch] of MUTATIONS[mutation](bob, frame)) {
      if (x >= 0 && x < SPRITE_W && y >= 0 && y < SPRITE_H && (mutation !== 7 || grid[y][x] !== '.')) grid[y][x] = ch;
    }
  }
  return grid.map(row => row.join(''));
}

// ---------- clan colours and held tools (sapients only) ----------

// A small pixel layer drawn over a sapient's sprite: a headband in the clan colour (with a cloth tail at the back) and a
// tool in the hand that shows the job. Pure data: [x, y, '#colour'] lists, so it can be tested without a browser.
const WOOD = '#8b5a2b';
const IRON = '#cbd5e1';
const DARK = '#475569';
const TAN = '#c9a46a';

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const c = k => Math.max(0, Math.min(255, Math.round(((n >> k) & 255) * f))).toString(16).padStart(2, '0');
  return `#${c(16)}${c(8)}${c(0)}`;
}

const line = (x0, y0, x1, y1, color) => {
  const out = [];
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= n; i++) out.push([Math.round(x0 + ((x1 - x0) * i) / Math.max(1, n)), Math.round(y0 + ((y1 - y0) * i) / Math.max(1, n)), color]);
  return out;
};

export const TOOLS = {
  hoe: () => [...line(17, 7, 17, 15, WOOD), [18, 7, IRON], [19, 7, IRON], [19, 8, IRON]],
  axe: () => [...line(17, 7, 17, 15, WOOD), [18, 7, IRON], [19, 7, IRON], [18, 8, IRON], [19, 8, IRON], [18, 9, IRON]],
  pick: () => [...line(17, 8, 17, 15, WOOD), ...line(15, 8, 19, 8, IRON), [15, 9, IRON], [19, 9, IRON]],
  hammer: () => [...line(17, 9, 17, 15, WOOD), [16, 8, DARK], [17, 8, DARK], [18, 8, DARK], [16, 9, DARK], [18, 9, DARK]],
  mallet: () => [...line(17, 9, 17, 15, WOOD), [16, 8, WOOD], [17, 8, WOOD], [18, 8, WOOD], [16, 9, '#a16207'], [18, 9, '#a16207']],
  spear: () => [...line(17, 4, 17, 15, WOOD), [17, 2, IRON], [17, 3, IRON], [16, 4, IRON], [18, 4, IRON]],
  staff: () => [...line(17, 5, 17, 15, WOOD), [18, 5, WOOD], [18, 6, WOOD]],
  crook: () => [...line(17, 6, 17, 15, WOOD), [18, 5, WOOD], [19, 5, WOOD], [19, 6, WOOD]],
  rod: () => [...line(16, 13, 19, 6, WOOD), [19, 7, IRON], [19, 8, '#e2e8f0']],
  basket: () => [[16, 12, TAN], [17, 12, TAN], [18, 12, TAN], [19, 12, TAN], [16, 13, WOOD], [17, 13, '#a16207'], [18, 13, WOOD], [19, 13, '#a16207'], [16, 14, '#a16207'], [17, 14, WOOD], [18, 14, '#a16207'], [19, 14, WOOD], [17, 11, WOOD], [18, 11, WOOD]],
  sack: () => [[17, 11, DARK], [16, 12, TAN], [17, 12, TAN], [18, 12, TAN], [19, 12, TAN], [16, 13, TAN], [17, 13, '#b08d57'], [18, 13, TAN], [19, 13, TAN], [16, 14, '#b08d57'], [17, 14, TAN], [18, 14, '#b08d57'], [19, 14, TAN], [17, 15, '#b08d57'], [18, 15, '#b08d57']],
  scroll: () => [[16, 11, '#f8fafc'], [17, 11, '#f8fafc'], [18, 11, '#f8fafc'], [16, 12, '#e2e8f0'], [17, 12, '#94a3b8'], [18, 12, '#e2e8f0'], [16, 13, '#f8fafc'], [17, 13, '#94a3b8'], [18, 13, '#f8fafc'], [16, 14, '#e2e8f0'], [17, 14, '#e2e8f0'], [18, 14, '#e2e8f0'], [15, 11, WOOD], [15, 14, WOOD]]
};

// Pixels to paint over the base sprite. `clanColor` is '#rrggbb' or null, `tool` a key of TOOLS or null.
// The headband sits on the head (row 3) and the sash across the shoulders (row 9); everything shifts down 1 px with the walking bob.
export function decorationPixels(clanColor, tool, bob = 0) {
  const out = [];
  if (clanColor) {
    const dark = shade(clanColor, 0.72);
    for (let x = 4; x <= 15; x++) out.push([x, 3, x % 4 === 0 ? dark : clanColor]);
    out.push([16, 3, clanColor], [17, 4, dark], [16, 4, clanColor]); // the cloth tail
    for (let x = 6; x <= 13; x++) out.push([x, 9, x % 3 === 0 ? dark : clanColor]);
  }
  if (tool && TOOLS[tool]) out.push(...TOOLS[tool]());
  return out.map(([x, y, c]) => [x, y + bob, c]);
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
    k: '#1c1822',
    g: hslToHex(traits.eyeHue + 0.5, 0.95, 0.62),
    a: hslToHex(traits.hue2, 0.45, 0.3)
  };
}

// ---------- rendering (browser) ----------

// Sprites with the same parts, colours (to a coarse step) and frame share one canvas.
export function spriteKey(traits, frame, clanColor = null, tool = null) {
  const parts = Object.keys(PART_COUNTS).map(g => Math.round(traits[g])).join('');
  const q = (v, n) => Math.min(n - 1, Math.floor(v * n));
  return `${parts}|${q(traits.hue, 24)}|${q(traits.sat, 4)}|${q(traits.light, 4)}|${q(traits.hue2, 4)}|${q(traits.eyeHue, 4)}|${frame}${clanColor || tool ? `|${clanColor || '-'}|${tool || '-'}` : ''}`;
}

const canvasCache = new Map();

// extras (sapients): { clanColor: '#rrggbb', tool: 'axe' ... } adds the clan headband and the held tool; cached by (traits, frame, clan colour, tool).
export function getCreatureCanvas(traits, frame = 0, extras = null) {
  const clanColor = extras ? extras.clanColor || null : null;
  const tool = extras ? extras.tool || null : null;
  const key = spriteKey(traits, frame, clanColor, tool);
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
    if (clanColor || tool) {
      for (const [x, y, color] of decorationPixels(clanColor, tool, frame === 1 ? 1 : 0)) {
        if (x < 0 || x >= SPRITE_W || y < 0 || y >= SPRITE_H) continue;
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 1, 1);
      }
    }
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
