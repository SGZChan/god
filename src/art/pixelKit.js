// Tiny pure pixel toolkit for the procedural building art: an RGBA buffer plus the textures the sprites are made
// of (stone brick courses, log walls, shingle / thatch / tile roofs, planks). No DOM, so it runs in node tests.

export const hex = s => parseInt(s.replace('#', ''), 16);
export const rgbOf = c => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const clamp8 = v => Math.max(0, Math.min(255, Math.round(v)));
export const toHex = c => '#' + c.toString(16).padStart(6, '0');

// f < 1 darkens, f > 1 lightens toward white (f = 1.3 is a clear highlight)
export function shade(c, f) {
  const [r, g, b] = rgbOf(c);
  if (f <= 1) return (clamp8(r * f) << 16) | (clamp8(g * f) << 8) | clamp8(b * f);
  const t = f - 1;
  return (clamp8(r + (255 - r) * t) << 16) | (clamp8(g + (255 - g) * t) << 8) | clamp8(b + (255 - b) * t);
}

export function mix(a, b, t) {
  const [r1, g1, b1] = rgbOf(a);
  const [r2, g2, b2] = rgbOf(b);
  return (clamp8(r1 + (r2 - r1) * t) << 16) | (clamp8(g1 + (g2 - g1) * t) << 8) | clamp8(b1 + (b2 - b1) * t);
}

// Deterministic hash noise in [0, 1)
export function hash(x, y, seed = 0) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function seedOf(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

export class Pix {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.data = new Uint8ClampedArray(w * h * 4);
  }

  set(x, y, c, a = 255) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.data[i] = (c >> 16) & 255;
    this.data[i + 1] = (c >> 8) & 255;
    this.data[i + 2] = c & 255;
    this.data[i + 3] = a;
  }

  alpha(x, y) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.data[(y * this.w + x) * 4 + 3];
  }

  get(x, y) {
    if (!this.alpha(x, y)) return -1;
    const i = (y * this.w + x) * 4;
    return (this.data[i] << 16) | (this.data[i + 1] << 8) | this.data[i + 2];
  }

  erase(x, y) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.data[(y * this.w + x) * 4 + 3] = 0;
  }

  rect(x, y, w, h, c, a = 255) {
    x = Math.floor(x);
    y = Math.floor(y);
    w = Math.round(w);
    h = Math.round(h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c, a);
  }

  hline(x, y, w, c, a = 255) { this.rect(x, y, w, 1, c, a); }
  vline(x, y, h, c, a = 255) { this.rect(x, y, 1, h, c, a); }

  // Paints only where nothing is painted yet
  under(x, y, c) {
    if (!this.alpha(x, y)) this.set(x, y, c);
  }

  // Draws `other` on top of this buffer at (ox, oy)
  blit(other, ox = 0, oy = 0) {
    for (let y = 0; y < other.h; y++) {
      for (let x = 0; x < other.w; x++) {
        const i = (y * other.w + x) * 4;
        const a = other.data[i + 3];
        if (!a) continue;
        const tx = x + ox;
        const ty = y + oy;
        if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) continue;
        const j = (ty * this.w + tx) * 4;
        if (a === 255 || !this.data[j + 3]) {
          this.data[j] = other.data[i]; this.data[j + 1] = other.data[i + 1]; this.data[j + 2] = other.data[i + 2];
          this.data[j + 3] = a;
        } else {
          const t = a / 255;
          this.data[j] = this.data[j] * (1 - t) + other.data[i] * t;
          this.data[j + 1] = this.data[j + 1] * (1 - t) + other.data[i + 1] * t;
          this.data[j + 2] = this.data[j + 2] * (1 - t) + other.data[i + 2] * t;
          this.data[j + 3] = Math.max(this.data[j + 3], a);
        }
      }
    }
  }

  // Removes everything above row `y`
  clipAbove(y) {
    for (let j = 0; j < Math.min(this.h, y); j++) for (let i = 0; i < this.w; i++) this.erase(i, j);
  }

  bounds() {
    let top = this.h;
    let bottom = -1;
    let left = this.w;
    let right = -1;
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.alpha(x, y)) {
          if (y < top) top = y;
          if (y > bottom) bottom = y;
          if (x < left) left = x;
          if (x > right) right = x;
        }
      }
    }
    return bottom < 0 ? null : { top, bottom, left, right };
  }

  opaqueCount() {
    let n = 0;
    for (let i = 3; i < this.data.length; i += 4) if (this.data[i]) n++;
    return n;
  }

  // 1 px dark outline around the silhouette (the chunky look of the reference art)
  outline(c) {
    const add = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.alpha(x, y)) continue;
        if (this.alpha(x - 1, y) > 200 || this.alpha(x + 1, y) > 200 || this.alpha(x, y - 1) > 200 || this.alpha(x, y + 1) > 200) add.push(x, y);
      }
    }
    for (let i = 0; i < add.length; i += 2) this.set(add[i], add[i + 1], c);
  }
}

// ---------- textures ----------

// Stone brick courses in a rectangle: staggered bricks with highlight top/left, shadow bottom and a darker right side.
// pal: { mid, hi, lo, mortar }
export function brick(p, x0, y0, w, h, pal, seed = 0, { course = 5, bw = 8 } = {}) {
  for (let y = 0; y < h; y++) {
    const c = Math.floor(y / course);
    const ry = y % course;
    const off = (c % 2) * (bw >> 1);
    for (let x = 0; x < w; x++) {
      const bx = (x + off) % bw;
      const id = Math.floor((x + off) / bw);
      const v = hash(id, c, seed);
      let col;
      if (ry === course - 1) col = pal.mortar;
      else if (bx === bw - 1) col = pal.mortar;
      else if (ry === 0) col = pal.hi;
      else if (bx === 0) col = shade(pal.hi, 0.88);
      else col = v < 0.3 ? pal.lo : (v < 0.7 ? pal.mid : shade(pal.mid, 1.08));
      // overall light fall-off: lighter up top, darker toward the ground; the right edge is in shadow
      let f = 1.06 - 0.2 * (y / Math.max(1, h));
      if (x >= w - 3) f -= 0.13;
      else if (x >= w - 5) f -= 0.05;
      p.set(x0 + x, y0 + y, shade(col, f));
    }
  }
}

// Horizontal logs (each `th` px thick) with a lit top, shaded belly and notches.
export function logs(p, x0, y0, w, h, pal, seed = 0, th = 4) {
  for (let y = 0; y < h; y++) {
    const r = Math.floor(y / th);
    const ry = y % th;
    for (let x = 0; x < w; x++) {
      const v = hash(Math.floor(x / 9), r, seed);
      const base = shade(pal.mid, 0.92 + v * 0.16);
      let col = base;
      if (ry === 0) col = pal.hi;
      else if (ry === th - 1) col = pal.lo;
      else if (ry === 1) col = shade(base, 1.08);
      if (hash(x, y, seed + 9) > 0.965 && ry > 0 && ry < th - 1) col = pal.lo; // knots and checks
      if (x >= w - 3) col = shade(col, 0.86);
      p.set(x0 + x, y0 + y, col);
    }
    // ring ends at the wall corners
    p.set(x0, y0 + y, ry === 0 || ry === th - 1 ? pal.lo : pal.ring);
    p.set(x0 + w - 1, y0 + y, ry === 0 || ry === th - 1 ? pal.lo : pal.ring);
  }
}

// Vertical planks
export function planks(p, x0, y0, w, h, pal, seed = 0, pw = 4) {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = Math.floor(x / pw);
      const bx = x % pw;
      const v = hash(i, 3, seed);
      let col = shade(pal.mid, 0.9 + v * 0.2);
      if (bx === pw - 1) col = pal.lo;
      else if (bx === 0) col = shade(col, 1.1);
      if (hash(x, Math.floor(y / 3), seed) > 0.93) col = shade(col, 0.82);
      p.set(x0 + x, y0 + y, shade(col, 1.04 - 0.18 * (y / Math.max(1, h))));
    }
  }
}

// Half-timbered plaster: pale infill in a dark frame
export function plaster(p, x0, y0, w, h, pal, seed = 0) {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = hash(x >> 1, y >> 1, seed);
      let col = shade(pal.plaster, 0.97 + n * 0.07);
      if (x >= w - 3) col = shade(col, 0.84);
      p.set(x0 + x, y0 + y, shade(col, 1.03 - 0.12 * (y / Math.max(1, h))));
    }
  }
  const frame = pal.beam;
  p.rect(x0, y0, w, 2, frame);
  p.rect(x0, y0 + h - 2, w, 2, frame);
  p.rect(x0, y0, 2, h, frame);
  p.rect(x0 + w - 2, y0, 2, h, frame);
  const bays = Math.max(2, Math.round(w / 14));
  for (let i = 1; i < bays; i++) p.rect(x0 + Math.round((w * i) / bays) - 1, y0, 2, h, frame);
  // braces
  for (let i = 0; i < bays; i++) {
    const bx = x0 + Math.round((w * i) / bays) + 2;
    const bw = Math.round(w / bays) - 4;
    const bh = Math.min(h - 4, 7);
    for (let k = 0; k < bh; k++) p.set(bx + Math.round((k / bh) * bw * (i % 2 ? 1 : 0.9)), y0 + 2 + k, frame);
  }
}

// Roof plane as a trapezoid (hip roof seen from the front): rows from `top` to `bottom`, widening by `inset` px per side
export function roofPlane(p, x0, x1, top, bottom, inset, kind, cols, seed = 0) {
  const h = bottom - top + 1;
  for (let y = top; y <= bottom; y++) {
    const t = (y - top) / Math.max(1, h - 1);
    const ins = Math.round(inset * (1 - t));
    const l = x0 + ins;
    const r = x1 - ins;
    for (let x = l; x <= r; x++) {
      const c = roofPixel(kind, cols, x - x0, y - top, seed, t);
      let col = c;
      if (x <= l + 1) col = shade(c, 1.12);           // lit left rim
      else if (x >= r - 1) col = shade(c, 0.78);      // shaded right rim
      p.set(x, y, col);
    }
  }
  // ridge cap and dark eave
  const ins0 = Math.round(inset);
  p.hline(x0 + ins0, top, x1 - x0 - ins0 * 2 + 1, cols[0]);
  p.hline(x0, bottom, x1 - x0 + 1, cols[3]);
  if (h > 4) p.hline(x0, bottom - 1, x1 - x0 + 1, shade(cols[2], 0.9));
}

function roofPixel(kind, cols, x, y, seed, t) {
  const [hi, mid, dk, deep] = cols;
  const light = 1.1 - 0.22 * t; // the upper roof catches more light
  switch (kind) {
    case 'thatch': {
      const v = hash(x, Math.floor(y / 4) + (x % 3), seed);
      let c = v < 0.25 ? dk : (v < 0.7 ? mid : hi);
      if (hash(x, y, seed + 4) > 0.9) c = dk;
      if (y % 6 === 5) c = shade(dk, 0.92); // bound bundles
      return shade(c, light);
    }
    case 'tile': {
      const bx = x % 5;
      const row = Math.floor(y / 4);
      const off = (row % 2) * 2;
      const cx = (x + off) % 5;
      const ry = y % 4;
      let c = mid;
      if (ry === 3) c = dk;
      else if (cx === 0) c = hi;
      else if (cx === 4) c = dk;
      if (hash(row, Math.floor((x + off) / 5), seed) > 0.8) c = shade(c, 0.88);
      return shade(c, light + (bx === 0 && ry === 0 ? 0.05 : 0));
    }
    case 'slate':
    case 'shingle': {
      const rh = kind === 'slate' ? 5 : 4;
      const sw = kind === 'slate' ? 6 : 5;
      const row = Math.floor(y / rh);
      const off = (row % 2) * (sw >> 1);
      const cx = (x + off) % sw;
      const ry = y % rh;
      const v = hash(Math.floor((x + off) / sw), row, seed);
      let c = shade(mid, 0.9 + v * 0.22);
      if (ry === rh - 1) c = dk;
      else if (cx === sw - 1) c = shade(dk, 1.05);
      else if (ry === 0) c = shade(hi, 0.95);
      return shade(c, light);
    }
    case 'hide': {
      const v = hash(x >> 1, y >> 1, seed);
      let c = v < 0.3 ? dk : (v < 0.65 ? mid : hi);
      if ((x + y * 2) % 11 === 0) c = deep; // stitched seams
      return shade(c, light);
    }
    default:
      return mid;
  }
}

// Snow caps the upper part of a roof area given as the opaque pixels of `roofLayer`
export function snowOnRoof(roofLayer, seed, depthFrac = 0.6) {
  const b = roofLayer.bounds();
  if (!b) return;
  const span = b.bottom - b.top;
  for (let y = b.top; y <= b.bottom; y++) {
    for (let x = b.left; x <= b.right; x++) {
      if (!roofLayer.alpha(x, y)) continue;
      const t = (y - b.top) / Math.max(1, span);
      const edge = depthFrac + (hash(x >> 1, 7, seed) - 0.5) * 0.28;
      if (t < edge) {
        const c = hash(x, y, seed + 2) > 0.8 ? 0xdbe6f4 : 0xf7fafd;
        roofLayer.set(x, y, t > edge - 0.12 ? shade(c, 0.93) : c);
      } else if (t < edge + 0.07) {
        roofLayer.set(x, y, 0xb9cbe2); // meltwater shadow under the lip
      }
    }
  }
}
