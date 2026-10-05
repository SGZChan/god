// The planet as seen from space: a globe texture painted from the very same world the surface view shows.
// Land and sea come from the terrain generator's biomes (no chunks are made for it), cities and borders from the
// civilizations living there. The terrain part is drawn once per planet and kept; the cities are drawn on top each time.
const W = 512;
const H = 256;
const SAMPLE_W = 256; // terrain samples across (each covers 2x2 pixels)

const base = new WeakMap(); // terrain -> canvas of land and sea

function terrainLayer(terrain) {
  let c = base.get(terrain);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = SAMPLE_W;
  c.height = SAMPLE_W / 2;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(c.width, c.height);
  const gen = terrain.generator;
  const sx = terrain.width / c.width;
  const sy = terrain.height / c.height;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const t = gen.terrainAt(Math.floor((x + 0.5) * sx), Math.floor((y + 0.5) * sy));
      const [r, g, b] = t.biome.colorRgb || [80, 80, 80];
      const shade = t.biome.isWater ? 1 : 0.85 + 0.35 * Math.max(0, t.elevation - 0.5); // high ground a little lighter
      const i = (y * c.width + x) * 4;
      img.data[i] = Math.min(255, r * shade);
      img.data[i + 1] = Math.min(255, g * shade);
      img.data[i + 2] = Math.min(255, b * shade);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  base.set(terrain, c);
  return c;
}

// -> a canvas (512 x 256) to use as the planet's colour map
export function buildGlobeCanvas(terrain, society = null) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(terrainLayer(terrain), 0, 0, W, H);
  if (society) {
    const kx = W / terrain.width;
    const ky = H / terrain.height;
    for (const civ of society.civilizations || []) {
      if (!civ.isAlive) continue;
      for (const st of civ.settlements || []) {
        const x = st.x * kx;
        const y = st.y * ky;
        // the glow of the land they hold, then the city itself
        const glow = ctx.createRadialGradient(x, y, 0, x, y, 7);
        glow.addColorStop(0, `${civ.color}88`);
        glow.addColorStop(1, `${civ.color}00`);
        ctx.fillStyle = glow;
        ctx.fillRect(x - 7, y - 7, 14, 14);
        ctx.fillStyle = st.capital ? '#ffffff' : civ.color;
        ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, st.capital ? 3 : 2, st.capital ? 3 : 2);
      }
    }
  }
  return canvas;
}
