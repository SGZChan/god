// Seeded 2D gradient (Perlin) noise and integer hashing for the infinite world.
// Everything is a pure function of (seed, x, y): the same inputs always give the same value, so a
// chunk can be thrown away and regenerated identically, and neighbouring chunks line up exactly.

// Hashes (seed, x, y) to an unsigned 32-bit integer.
export function hashInt(seed, x, y) {
  let h = (seed ^ Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return h >>> 0;
}

// Deterministic float in [0, 1) for a tile.
export function hash01(seed, x, y) {
  return hashInt(seed, x, y) / 4294967296;
}

const INV_SQRT2 = Math.SQRT1_2;
const GRADIENTS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [INV_SQRT2, INV_SQRT2], [-INV_SQRT2, INV_SQRT2], [INV_SQRT2, -INV_SQRT2], [-INV_SQRT2, -INV_SQRT2]
];

const fade = t => t * t * t * (t * (t * 6 - 15) + 10);

export class Noise2D {
  constructor(seed) {
    this.seed = seed >>> 0;
  }

  // Gradient noise, roughly in [-1, 1]
  noise(x, y) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const dot = (ix, iy, dx, dy) => {
      const g = GRADIENTS[hashInt(this.seed, ix, iy) & 7];
      return g[0] * dx + g[1] * dy;
    };
    const u = fade(xf);
    const v = fade(yf);
    const top = dot(xi, yi, xf, yf) * (1 - u) + dot(xi + 1, yi, xf - 1, yf) * u;
    const bottom = dot(xi, yi + 1, xf, yf - 1) * (1 - u) + dot(xi + 1, yi + 1, xf - 1, yf - 1) * u;
    return (top * (1 - v) + bottom * v) * 1.4142;
  }

  // Fractal noise normalised to [0, 1] (about 0.5 on average)
  fbm(x, y, octaves = 4, persistence = 0.5, lacunarity = 2) {
    let sum = 0;
    let amplitude = 1;
    let max = 0;
    let frequency = 1;
    for (let i = 0; i < octaves; i++) {
      sum += this.noise(x * frequency, y * frequency) * amplitude;
      max += amplitude;
      amplitude *= persistence;
      frequency *= lacunarity;
    }
    return Math.max(0, Math.min(1, 0.5 + 0.5 * (sum / max)));
  }

  // Ridged noise in [0, 1]: sharp crests where the underlying noise crosses zero (mountain chains)
  ridged(x, y, octaves = 3) {
    let sum = 0;
    let amplitude = 1;
    let max = 0;
    let frequency = 1;
    for (let i = 0; i < octaves; i++) {
      sum += (1 - Math.abs(this.noise(x * frequency, y * frequency))) * amplitude;
      max += amplitude;
      amplitude *= 0.5;
      frequency *= 2;
    }
    return Math.max(0, Math.min(1, sum / max));
  }
}
