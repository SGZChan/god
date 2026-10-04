// Planet map: the whole planet downsampled from the generator, with civilization borders and capitals, the
// camera rectangle and a latitude/longitude readout. Click or drag to jump the surface camera there.
// Collapsible. The picture is built progressively (see world/overview.js) and cached per planet.
import { getOverview } from '../world/overview.js';

const MAP_W = 256;
const MAP_H = 128;

export function formatLatLon(x, y, width, height) {
  const lat = 90 - (y / height) * 180;
  const lon = (x / width) * 360 - 180;
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(1)}°${ns} ${Math.abs(lon).toFixed(1)}°${ew}`;
}

export class Minimap {
  constructor(root) {
    this.root = root;
    this.sim = null;
    this.collapsed = false;
    this.redrawTimer = 0;
    this.hover = null; // { x, y } in tiles while the pointer is over the map
    this.dragging = false;

    root.innerHTML = `
      <button class="minimap-head" id="minimap-toggle" aria-expanded="true" aria-controls="minimap-body">
        <span class="minimap-title">Planet map</span>
        <span class="minimap-readout" id="minimap-readout"></span>
        <svg class="icon chevron" aria-hidden="true"><use href="#i-chevron"/></svg>
      </button>
      <div class="minimap-body" id="minimap-body">
        <canvas id="minimap-canvas" width="${MAP_W}" height="${MAP_H}" title="Click or drag to move the camera"></canvas>
      </div>`;
    this.toggle = root.querySelector('#minimap-toggle');
    this.readout = root.querySelector('#minimap-readout');
    this.body = root.querySelector('#minimap-body');
    this.canvas = root.querySelector('#minimap-canvas');
    this.ctx = this.canvas.getContext('2d');

    this.toggle.addEventListener('click', () => this.setCollapsed(!this.collapsed));
    this.canvas.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.canvas.setPointerCapture(e.pointerId);
      this.jumpFromEvent(e);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      this.hover = this.tileFromEvent(e);
      if (this.dragging) this.jumpFromEvent(e);
    });
    this.canvas.addEventListener('pointerup', () => { this.dragging = false; });
    this.canvas.addEventListener('pointercancel', () => { this.dragging = false; });
    this.canvas.addEventListener('pointerleave', () => { if (!this.dragging) this.hover = null; });
    // keep wheel zooming from reaching the page while over the map
    this.canvas.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
    // short screens start with the map folded so it does not cover the overview panel
    if (window.innerHeight < 780) this.setCollapsed(true);
  }

  setVisible(visible) {
    this.root.classList.toggle('hidden', !visible);
  }

  setCollapsed(collapsed) {
    this.collapsed = collapsed;
    this.body.classList.toggle('hidden', collapsed);
    this.toggle.setAttribute('aria-expanded', String(!collapsed));
    this.root.classList.toggle('collapsed', collapsed);
  }

  setSim(sim) {
    this.sim = sim;
    this.hover = null;
    this.redrawTimer = 1;
  }

  tileFromEvent(e) {
    const rect = this.canvas.getBoundingClientRect();
    const fx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const fy = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const terrain = this.sim.terrain;
    return { x: fx * terrain.width, y: fy * terrain.height };
  }

  jumpFromEvent(e) {
    if (!this.sim) return;
    const t = this.tileFromEvent(e);
    this.sim.renderer.jumpTo(t.x, t.y);
    this.redrawTimer = 1;
  }

  // Called every frame while the surface is shown.
  update(dt) {
    if (!this.sim || this.collapsed) return;
    const overview = getOverview(this.sim.terrain);
    overview.step(3);
    this.redrawTimer += dt;
    if (this.redrawTimer < 0.2 && overview.done) return;
    this.redrawTimer = 0;
    this.draw(overview);
  }

  draw(overview) {
    const { terrain, renderer, society } = this.sim;
    const ctx = this.ctx;
    const kx = MAP_W / terrain.width;
    const ky = MAP_H / terrain.height;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(overview.canvas, 0, 0, MAP_W, MAP_H);

    // equator and tropics
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.13)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const lat of [0, 30, -30]) {
      const y = Math.round((0.5 - lat / 180) * MAP_H) + 0.5;
      ctx.moveTo(0, y);
      ctx.lineTo(MAP_W, y);
    }
    ctx.stroke();

    // civilization borders (one dot per map pixel) and capitals
    for (const civ of society.civilizations) {
      if (!civ.isAlive) continue;
      ctx.fillStyle = civ.color + 'cc';
      let last = -1;
      for (const t of civ.territory) {
        const key = Math.floor(t.y * ky) * MAP_W + Math.floor(t.x * kx);
        if (key === last) continue;
        last = key;
        ctx.fillRect(Math.floor(t.x * kx), Math.floor(t.y * ky), 1, 1);
      }
    }
    for (const civ of society.civilizations) {
      if (!civ.isAlive) continue;
      ctx.beginPath();
      ctx.arc(civ.capitalX * kx, civ.capitalY * ky, 3, 0, Math.PI * 2);
      ctx.fillStyle = civ.color;
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
    }

    // the camera
    const s = renderer.tileSize * renderer.camera.zoom;
    const x0 = -renderer.camera.x / s;
    const y0 = -renderer.camera.y / s;
    const w = renderer.canvas.width / s;
    const h = renderer.canvas.height / s;
    const rw = Math.max(4, w * kx);
    const rh = Math.max(3, h * ky);
    const rx = (x0 + w / 2) * kx - rw / 2;
    const ry = (y0 + h / 2) * ky - rh / 2;
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    ctx.strokeRect(rx, ry, rw, rh);
    ctx.strokeStyle = '#fde68a';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(rx, ry, rw, rh);

    // latitude / longitude of the pointer, else of the screen centre
    const spot = this.hover || renderer.centerTile();
    this.readout.textContent = formatLatLon(spot.x, spot.y, terrain.width, terrain.height);
  }
}
