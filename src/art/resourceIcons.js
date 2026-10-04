// Pixel-style resource icons and trees, drawn once with canvas primitives (no emoji, no image files)
// and cached as small canvases that the surface renderer blits.
import { RESOURCES } from '../world/resources.js';

const ICON = 16;
const iconCache = new Map();
const treeCache = new Map();

const make = (w, h) => {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  g.imageSmoothingEnabled = false;
  return { canvas, g };
};

const poly = (g, points, fill, stroke) => {
  g.beginPath();
  g.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) g.lineTo(points[i][0], points[i][1]);
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  if (stroke) {
    g.strokeStyle = stroke;
    g.lineWidth = 1;
    g.stroke();
  }
};

const circle = (g, x, y, r, fill) => {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = fill;
  g.fill();
};

function lighten(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const f = c => Math.max(0, Math.min(255, Math.round(c + (amount > 0 ? (255 - c) : c) * amount)));
  return `rgb(${f(n >> 16)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
}

// 16x16 marker for a resource type: a dark disc so it reads on any biome, with a shape for the material.
function paintIcon(g, type) {
  const info = RESOURCES[type];
  const c = info.color;
  const light = lighten(c, 0.45);
  const dark = lighten(c, -0.45);
  // backdrop
  circle(g, 8, 8, 7.5, 'rgba(8, 10, 18, 0.72)');
  g.strokeStyle = c;
  g.lineWidth = 1;
  g.beginPath();
  g.arc(8, 8, 7, 0, Math.PI * 2);
  g.stroke();

  switch (type) {
    case 'wood':
      g.fillStyle = '#6b4423';
      g.fillRect(7, 9, 2, 4);
      circle(g, 8, 6, 3.4, '#4a9d3f');
      circle(g, 7, 5, 1.4, '#7fd36b');
      break;
    case 'stone':
      poly(g, [[3.5, 11], [5, 6.5], [8.5, 5], [12, 7.5], [12.5, 11]], c, dark);
      poly(g, [[5, 6.5], [8.5, 5], [8, 8]], light);
      break;
    case 'clay':
      g.beginPath();
      g.ellipse(8, 9, 4.5, 3, 0, 0, Math.PI * 2);
      g.fillStyle = c;
      g.fill();
      g.beginPath();
      g.ellipse(7, 7.8, 2.2, 1.1, 0, 0, Math.PI * 2);
      g.fillStyle = light;
      g.fill();
      break;
    case 'flint':
      poly(g, [[8, 3.5], [11.5, 10.5], [8, 12.5], [4.5, 10.5]], '#2f3745', light);
      poly(g, [[8, 3.5], [8, 12.5], [4.5, 10.5]], '#5a667a');
      break;
    case 'fibre':
      g.strokeStyle = c;
      g.lineWidth = 1.3;
      for (const [x, lean] of [[5, -1.5], [8, 0], [11, 1.5]]) {
        g.beginPath();
        g.moveTo(x, 12.5);
        g.quadraticCurveTo(x, 8, x + lean, 4.5);
        g.stroke();
      }
      break;
    case 'berries':
      g.strokeStyle = '#3f8f3a';
      g.beginPath();
      g.moveTo(8, 12);
      g.lineTo(8, 6);
      g.stroke();
      circle(g, 6, 8, 2, c);
      circle(g, 10, 8.5, 2, c);
      circle(g, 8, 5.5, 2, light);
      break;
    case 'fish':
      g.beginPath();
      g.ellipse(7.5, 8, 3.8, 2.4, 0, 0, Math.PI * 2);
      g.fillStyle = c;
      g.fill();
      poly(g, [[10.5, 8], [13.5, 5.5], [13.5, 10.5]], c);
      g.fillStyle = '#0b1220';
      g.fillRect(5, 7, 1, 1);
      break;
    case 'freshwater':
      poly(g, [[8, 3], [11.5, 9], [10.5, 12], [5.5, 12], [4.5, 9]], c);
      circle(g, 8, 9.3, 3, c);
      circle(g, 7, 8.5, 1, '#ffffff');
      break;
    case 'salt':
      g.fillStyle = c;
      g.fillRect(4.5, 7.5, 4, 4);
      g.fillRect(8, 5, 3.5, 3.5);
      g.fillStyle = '#ffffff';
      g.fillRect(5, 8, 1.5, 1.5);
      g.fillRect(8.5, 5.5, 1.5, 1.5);
      g.fillStyle = '#b8c2d0';
      g.fillRect(8, 9.5, 3.5, 2);
      break;
    case 'sand':
      poly(g, [[3, 12], [6, 7.5], [8, 9], [10.5, 6], [13, 12]], c, dark);
      g.fillStyle = light;
      g.fillRect(6, 9, 1, 1);
      break;
    case 'obsidian':
      poly(g, [[8, 3], [11.5, 7], [10, 12.5], [6, 12.5], [4.5, 7]], '#1b0f33', c);
      poly(g, [[8, 3], [6, 12.5], [4.5, 7]], '#6d45b8');
      break;
    case 'copper':
    case 'tin':
    case 'iron': {
      // an ore nugget: rock with bright metal flecks
      poly(g, [[3.5, 11.5], [4.5, 6.5], [8, 4.5], [11.5, 6.5], [12.5, 11.5]], '#59606b', '#2c313a');
      g.fillStyle = c;
      g.fillRect(5.5, 7.5, 2, 2);
      g.fillRect(8.5, 6, 2, 2);
      g.fillRect(8, 9.5, 2.5, 2);
      g.fillStyle = light;
      g.fillRect(5.5, 7.5, 1, 1);
      g.fillRect(8.5, 6, 1, 1);
      break;
    }
    case 'coal':
      poly(g, [[4, 11.5], [5, 6.5], [8, 5], [11, 7], [12, 11.5]], '#10151d', '#3a4352');
      g.fillStyle = '#5f6b7e';
      g.fillRect(6, 7, 1.5, 1.5);
      g.fillRect(9, 9, 1.5, 1.5);
      break;
    case 'gold':
      circle(g, 6.5, 9.5, 2.6, c);
      circle(g, 10.5, 8.5, 2.2, c);
      circle(g, 8.5, 6.5, 2, light);
      g.fillStyle = '#ffffff';
      g.fillRect(5.5, 8.5, 1, 1);
      break;
    case 'gems':
      poly(g, [[8, 3.5], [12, 6.5], [10.5, 12.5], [5.5, 12.5], [4, 6.5]], c, dark);
      poly(g, [[8, 3.5], [8, 12.5], [4, 6.5]], light);
      g.fillStyle = '#ffffff';
      g.fillRect(6.5, 6, 1, 1);
      break;
    case 'oil':
      poly(g, [[8, 3], [11.5, 9], [10.5, 12], [5.5, 12], [4.5, 9]], '#161008', c);
      circle(g, 8, 9.3, 3, '#161008');
      circle(g, 7, 8.5, 1, c);
      break;
    case 'uranium':
      circle(g, 8, 8, 4, 'rgba(132, 204, 22, 0.35)');
      circle(g, 8, 8, 2.6, c);
      circle(g, 7.2, 7.2, 1, '#e4ffb0');
      g.strokeStyle = c;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(8, 2.5);
      g.lineTo(8, 4);
      g.moveTo(8, 12);
      g.lineTo(8, 13.5);
      g.moveTo(2.5, 8);
      g.lineTo(4, 8);
      g.moveTo(12, 8);
      g.lineTo(13.5, 8);
      g.stroke();
      break;
    default:
      circle(g, 8, 8, 3, c);
  }
}

// A 16x16 canvas with the icon of a resource type.
export function getResourceIcon(type) {
  let icon = iconCache.get(type);
  if (!icon) {
    const { canvas, g } = make(ICON, ICON);
    if (RESOURCES[type]) paintIcon(g, type);
    icon = canvas;
    iconCache.set(type, icon);
  }
  return icon;
}

// ---------- trees ----------

// Procedural pixel tree for a biome, `variant` 0-2 for variety. Canvas is 24 wide x 28 tall, trunk at the bottom.
export function getTreeSprite(biomeId, variant = 0) {
  const kind = biomeId === 'TAIGA' || biomeId === 'TUNDRA' ? 'pine'
    : biomeId === 'RAINFOREST' ? 'jungle'
      : biomeId === 'SAVANNA' ? 'acacia'
        : biomeId === 'ALIEN_BLOOM' ? 'alien'
          : biomeId === 'GRASSLAND' ? 'lone' : 'oak';
  const key = `${kind}:${variant}`;
  let sprite = treeCache.get(key);
  if (sprite) return sprite;
  const { canvas, g } = make(24, 28);
  const px = (x, y, w, h, color) => { g.fillStyle = color; g.fillRect(x, y, w, h); };
  const shift = variant - 1; // -1, 0, 1
  const palette = {
    oak: ['#1f5a24', '#2f7d32', '#4f9f45', '#7cc66a'],
    lone: ['#2d6b2c', '#3f8a38', '#5fae4c', '#86cf6e'],
    jungle: ['#0d4a24', '#136a30', '#1f8a3e', '#47b05a'],
    pine: ['#173d2c', '#235a40', '#2f7456', '#4c9a76'],
    acacia: ['#5e6a1e', '#7e8a2a', '#a1ad3c', '#c6d062'],
    alien: ['#3d1470', '#5a2a9a', '#8447cf', '#c58bff']
  }[kind];
  const trunk = kind === 'pine' ? '#4a3220' : (kind === 'alien' ? '#2c1648' : '#5a3a1e');
  // shadow
  g.fillStyle = 'rgba(0, 0, 0, 0.22)';
  g.beginPath();
  g.ellipse(12, 25, 7, 2.4, 0, 0, Math.PI * 2);
  g.fill();

  if (kind === 'pine') {
    px(11, 19, 2, 6, trunk);
    for (let i = 0; i < 4; i++) {
      const w = 6 + i * 4 + (shift > 0 ? 1 : 0);
      const y = 4 + i * 4.5;
      poly(g, [[12, y - 3], [12 + w / 2, y + 4], [12 - w / 2, y + 4]], palette[(i + 1) % 3]);
      poly(g, [[12, y - 3], [12 - w / 2, y + 4], [12, y + 4]], palette[0]);
    }
    px(12, 3, 1, 1, palette[3]);
  } else if (kind === 'acacia') {
    px(11, 12, 2, 12, trunk);
    px(8, 15, 3, 1, trunk);
    g.fillStyle = palette[1];
    g.beginPath();
    g.ellipse(12, 10, 11, 4.5, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = palette[2];
    g.beginPath();
    g.ellipse(11, 8.8, 8.5, 3, 0, 0, Math.PI * 2);
    g.fill();
    px(7, 8, 2, 1, palette[3]);
  } else {
    // broad canopy: a few overlapping discs, shaded from the top left
    const big = kind === 'jungle' ? 1.15 : (kind === 'lone' ? 0.8 : 1);
    px(11, 15, 2, 10, trunk);
    px(10, 23, 4, 2, trunk);
    const lobes = [[12, 10, 8], [7.5 + shift, 12.5, 5.8], [16.5 - shift, 12.5, 5.8], [12, 6, 6.2]];
    for (const [x, y, r] of lobes) circle(g, x, y, r * big, palette[1]);
    for (const [x, y, r] of lobes) circle(g, x - 1.5, y - 1.7, r * big * 0.72, palette[2]);
    circle(g, 9.5, 6.5, 2.2 * big, palette[3]);
    if (kind === 'jungle') {
      g.fillStyle = palette[0];
      g.fillRect(6, 15, 3, 2);
      g.fillRect(16, 16, 3, 2);
    }
    if (kind === 'alien') {
      circle(g, 15, 9, 1.4, '#f5d0fe');
      circle(g, 8, 13, 1.1, '#f5d0fe');
    }
  }
  sprite = canvas;
  treeCache.set(key, sprite);
  return sprite;
}

// A felled tree: a stump with a ring.
export function getStumpSprite() {
  let sprite = treeCache.get('stump');
  if (!sprite) {
    const made = make(24, 28);
    const g = made.g;
    g.fillStyle = 'rgba(0, 0, 0, 0.2)';
    g.beginPath();
    g.ellipse(12, 24, 5, 2, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#5a3a1e';
    g.fillRect(9, 19, 6, 5);
    g.fillStyle = '#c99a5b';
    g.beginPath();
    g.ellipse(12, 19, 3.2, 1.6, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#8a5f2d';
    g.lineWidth = 0.8;
    g.beginPath();
    g.ellipse(12, 19, 1.6, 0.8, 0, 0, Math.PI * 2);
    g.stroke();
    sprite = made.canvas;
    treeCache.set('stump', sprite);
  }
  return sprite;
}
