// 2D High-Performance Surface Canvas Renderer with Minecraft-Style Top-Down Structures, Smooth Pan/Zoom & Drag Brush
import { CHUNK_SIZE } from './terrain.js';
import { getCreatureCanvas, SPRITE_W, SPRITE_H } from '../art/creatureSprite.js';
import { JOB_INFO } from '../civilization/jobs.js';
import { itemColor } from '../civilization/economy.js';

const JOB_TOOLS = Object.fromEntries(Object.entries(JOB_INFO).map(([k, v]) => [k, v.tool]));
import { getResourceIcon, getTreeSprite, getStumpSprite } from '../art/resourceIcons.js';
import { getOverview, LodBlocks } from '../world/overview.js';
import { BuildingRenderer } from '../art/buildingRenderer.js';
import { timeOfDay, daylight, DAY_SECONDS } from '../simulation/dayCycle.js';

export const MIN_ZOOM = 0.04; // zoomed all the way out you see a continent (a few thousand tiles across)
export const MAX_ZOOM = 6.0;
const DETAIL_ZOOM = 0.3;      // below this the cached chunk images give way to cheap low-resolution blocks
import { drawGroundFx, drawSkyFx, drawStatusFx, drawPowerCursor } from '../art/effects.js';

export class SurfaceRenderer {
  constructor(canvas, terrain, ecosystem, society) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.terrain = terrain;
    this.ecosystem = ecosystem;
    this.society = society;

    this.tileSize = 14;
    this.camera = { x: 0, y: 0, zoom: 0.85 };
    this.isPanning = false;
    this.panStart = { x: 0, y: 0 };
    this.mouseDownPos = { x: 0, y: 0 };
    this.dragDistance = 0;
    this.waterAnimTime = 0;

    // Entity focus / tracking
    this.followingEntity = null;

    // Current Divine Power reference
    this.currentPower = null;
    this.onTileClicked = null;

    // Continuous brush dragging support
    this.isPainting = false;
    this.activePaintCallback = null;

    // Keyboard state
    this.keys = {};

    this.enabled = false;
    this.listeners = [];
    this.glyphCache = new Map(); // emoji sprites, see drawGlyph()
    this.chunkLayers = new Map(); // cached chunk images, see updateChunkLayers()
    this.layerPool = [];          // spare canvases for new chunk layers
    this.showResources = false;   // the Resources lens (key R): deposit markers on every tile
    this.onLensChange = null;
    this.buildingRenderer = new BuildingRenderer(terrain, society); // big sprites + roads, see art/buildingRenderer.js
    this.lod = new LodBlocks(terrain); // low-resolution blocks for far zoom (no chunks are generated for them)

    this.initCanvasSize();
    this.centerCamera();
    this.initEvents();
  }

  initCanvasSize() {
    this.canvas.width = this.canvas.clientWidth || window.innerWidth;
    this.canvas.height = this.canvas.clientHeight || window.innerHeight;
  }

  centerCamera() {
    this.followingEntity = null;
    // The world is infinite: start on the home area
    const home = this.terrain.home;
    this.camera.x = this.canvas.width / 2 - (home.x + 0.5) * this.tileSize * this.camera.zoom;
    this.camera.y = this.canvas.height / 2 - (home.y + 0.5) * this.tileSize * this.camera.zoom;
  }

  // Tile coordinates at the centre of the screen.
  centerTile() {
    const s = this.tileSize * this.camera.zoom;
    return { x: (this.canvas.width / 2 - this.camera.x) / s, y: (this.canvas.height / 2 - this.camera.y) / s };
  }

  // Puts tile (tx, ty) in the middle of the screen (minimap clicks, "go to").
  jumpTo(tx, ty) {
    this.followingEntity = null;
    const s = this.tileSize * this.camera.zoom;
    this.camera.x = this.canvas.width / 2 - tx * s;
    this.camera.y = this.canvas.height / 2 - ty * s;
    this.clampCamera();
  }

  // The planet has edges: the middle of the screen stays on the map.
  clampCamera() {
    const s = this.tileSize * this.camera.zoom;
    const c = this.centerTile();
    const nx = Math.max(0, Math.min(this.terrain.width, c.x));
    const ny = Math.max(0, Math.min(this.terrain.height, c.y));
    if (nx !== c.x) this.camera.x = this.canvas.width / 2 - nx * s;
    if (ny !== c.y) this.camera.y = this.canvas.height / 2 - ny * s;
  }

  setResourceLens(on) {
    this.showResources = Boolean(on);
    for (const layer of this.chunkLayers.values()) layer.age = Infinity; // redraw with/without markers
    if (this.onLensChange) this.onLensChange(this.showResources);
  }

  followEntity(entity) {
    this.followingEntity = entity;
    if (entity) {
      if (this.camera.zoom < 2.2) {
        this.camera.zoom = 2.8;
      }
    }
  }

  panBy(dx, dy) {
    this.followingEntity = null;
    this.camera.x += dx;
    this.camera.y += dy;
  }

  // Tracked listener so dispose() can remove it again
  listen(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    this.listeners.push([target, type, handler, options]);
  }

  // Only the planet being viewed reacts to input; the others share the same canvas
  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) {
      this.isPanning = false;
      this.isPainting = false;
    }
  }

  // Removes every listener this renderer registered (call before discarding it)
  dispose() {
    for (const [target, type, handler, options] of this.listeners) {
      target.removeEventListener(type, handler, options);
    }
    this.listeners = [];
    this.enabled = false;
  }

  initEvents() {
    this.listen(window, 'resize', () => {
      this.initCanvasSize();
    });

    this.listen(window, 'keydown', (e) => {
      this.keys[e.key.toLowerCase()] = true;
      if (this.enabled && e.key.toLowerCase() === 'r' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat
        && !['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName) && !document.querySelector('.modal-overlay:not(.hidden)')) {
        this.setResourceLens(!this.showResources);
      }
    });

    this.listen(window, 'keyup', (e) => {
      this.keys[e.key.toLowerCase()] = false;
    });

    // Mouse Controls: Left-drag pans in Inspect/Pan mode, paints in destructive/terraform modes
    this.listen(this.canvas, 'mousedown', (e) => {
      if (!this.enabled) return;
      this.mouseDownPos = { x: e.clientX, y: e.clientY };
      this.dragDistance = 0;
      this.pressedOnMap = true;

      const isPaintPower = this.currentPower && 
        this.currentPower.isDraggable && 
        this.currentPower.id !== 'INSPECT' && 
        this.currentPower.id !== 'PAN';

      // Middle click, right click, space/shift held, OR inspect/pan mode -> PAN
      if (e.button === 1 || e.button === 2 || e.shiftKey || e.code === 'Space' || !isPaintPower) {
        this.isPanning = true;
        this.followingEntity = null;
        this.panStart = { x: e.clientX - this.camera.x, y: e.clientY - this.camera.y };
        this.canvas.style.cursor = 'grabbing';
      } else if (e.button === 0 && isPaintPower) {
        this.isPainting = true;
        if (this.activePaintCallback) {
          const tile = this.screenToTile(e.clientX, e.clientY);
          this.activePaintCallback(tile.x, tile.y);
        }
      }
    });

    this.listen(window, 'mousemove', (e) => {
      if (!this.enabled) return;
      const hoverRect = this.canvas.getBoundingClientRect();
      this.hover = this.screenToTile(e.clientX - hoverRect.left, e.clientY - hoverRect.top); // brush preview
      this.dragDistance = Math.hypot(e.clientX - this.mouseDownPos.x, e.clientY - this.mouseDownPos.y);
      if (this.isPanning) {
        this.camera.x = e.clientX - this.panStart.x;
        this.camera.y = e.clientY - this.panStart.y;
        this.followingEntity = null;
      } else if (this.isPainting && this.activePaintCallback) {
        const rect = this.canvas.getBoundingClientRect();
        const tile = this.screenToTile(e.clientX - rect.left, e.clientY - rect.top);
        this.activePaintCallback(tile.x, tile.y);
      }
    });

    this.listen(window, 'mouseup', (e) => {
      if (!this.enabled) return;
      const dragDist = this.dragDistance;
      // mouseup is heard on the whole window: a press that began on a panel or button (the inspector's
      // Follow button, the power bar...) must not also click the map tile underneath it
      const pressedOnMap = this.pressedOnMap;
      this.pressedOnMap = false;
      this.isPanning = false;
      this.isPainting = false;

      // Reset cursor
      if (this.canvas) {
        this.canvas.style.cursor = (this.currentPower && this.currentPower.cursor) ? this.currentPower.cursor : 'grab';
      }

      // If user performed a click (drag distance < 10px) with Left Mouse Button
      if (e.button === 0 && pressedOnMap && dragDist < 10 && this.onTileClicked) {
        this.onTileClicked(e.clientX, e.clientY);
      }
    });

    // Zoom with Cursor Anchor (Zoom range: MIN_ZOOM to MAX_ZOOM)
    this.listen(this.canvas, 'wheel', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.18 : 0.85;
      const mouseX = e.clientX;
      const mouseY = e.clientY;

      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.camera.zoom * zoomFactor));

      this.camera.x = mouseX - (mouseX - this.camera.x) * (newZoom / this.camera.zoom);
      this.camera.y = mouseY - (mouseY - this.camera.y) * (newZoom / this.camera.zoom);
      this.camera.zoom = newZoom;
    }, { passive: false });

    this.listen(this.canvas, 'contextmenu', e => e.preventDefault());
  }

  // Smooth responsive keyboard panning (WASD and Arrows)
  updateKeyboardPan(dt) {
    const speedMultiplier = (this.keys['shift'] || this.keys['shiftleft'] || this.keys['shiftright']) ? 2.5 : 1.0;
    const panSpeed = 850 * speedMultiplier * dt;

    let moved = false;
    if (this.keys['w'] || this.keys['arrowup']) { this.camera.y += panSpeed; moved = true; }
    if (this.keys['s'] || this.keys['arrowdown']) { this.camera.y -= panSpeed; moved = true; }
    if (this.keys['a'] || this.keys['arrowleft']) { this.camera.x += panSpeed; moved = true; }
    if (this.keys['d'] || this.keys['arrowright']) { this.camera.x -= panSpeed; moved = true; }

    if (moved) {
      this.followingEntity = null;
    }

    // Smooth camera entity tracking
    if (this.followingEntity && !this.followingEntity.alive) this.followingEntity = null;
    if (this.followingEntity) {
      const targetScreenX = (this.canvas.width / 2) - (this.followingEntity.x * this.tileSize * this.camera.zoom);
      const targetScreenY = (this.canvas.height / 2) - (this.followingEntity.y * this.tileSize * this.camera.zoom);
      this.camera.x += (targetScreenX - this.camera.x) * Math.min(1.0, 9 * dt);
      this.camera.y += (targetScreenY - this.camera.y) * Math.min(1.0, 9 * dt);
    }
  }

  screenToTile(screenX, screenY) {
    const worldX = (screenX - this.camera.x) / (this.tileSize * this.camera.zoom);
    const worldY = (screenY - this.camera.y) / (this.tileSize * this.camera.zoom);
    return {
      x: Math.floor(worldX),
      y: Math.floor(worldY),
      worldX,
      worldY
    };
  }

  // Colour emoji are slow to rasterise with fillText every frame. Each one is drawn once into a
  // small offscreen canvas (at 2x for sharpness) and then blitted with drawImage.
  getGlyph(char, fontPx) {
    const key = char + '|' + fontPx;
    let glyph = this.glyphCache.get(key);
    if (!glyph) {
      const scale = 2;
      const size = Math.ceil(fontPx * 1.5 * scale);
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const g = canvas.getContext('2d');
      g.font = (fontPx * scale) + 'px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(char, size / 2, size / 2);
      glyph = { canvas, size: size / scale };
      this.glyphCache.set(key, glyph);
    }
    return glyph;
  }

  // Draws `char` centred on (x, y), like fillText with middle/center alignment.
  // 1 when a day lasts long enough on screen to watch (about 10 s or more), 0 when it would flicker (1 s or less)
  dayFade() {
    const speed = this.timeSpeed || 1;
    const seconds = DAY_SECONDS / Math.max(1, speed);
    return Math.max(0, Math.min(1, (seconds - 1) / 9));
  }

  drawGlyph(ctx, char, fontPx, x, y) {
    const glyph = this.getGlyph(char, fontPx);
    ctx.drawImage(glyph.canvas, x - glyph.size / 2, y - glyph.size / 2, glyph.size, glyph.size);
  }

  // Zoomed out, each visible chunk is drawn into its own offscreen image and blitted in one call; an
  // image is redrawn about 3 times a second (staggered, a few per frame) so water, borders and
  // buildings stay live. Returns the visible chunks' images.
  updateChunkLayers(minCx, maxCx, minCy, maxCy, dt, civStyles) {
    const ts = this.tileSize;
    const pixels = CHUNK_SIZE * ts;
    const visible = [];
    minCx = Math.max(0, minCx);
    minCy = Math.max(0, minCy);
    maxCx = Math.min((this.terrain.width - 1) >> 5, maxCx);
    maxCy = Math.min((this.terrain.height - 1) >> 5, maxCy);
    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const key = cx + ',' + cy;
        let layer = this.chunkLayers.get(key);
        if (!layer) {
          const canvas = this.layerPool.pop() || document.createElement('canvas');
          canvas.width = pixels;
          canvas.height = pixels;
          layer = { canvas, ctx: canvas.getContext('2d'), age: Infinity, built: false, cx, cy };
          layer.ctx.imageSmoothingEnabled = false; // icons stay crisp
          this.chunkLayers.set(key, layer);
        }
        layer.age += dt;
        visible.push(layer);
      }
    }

    // Redraw the stalest layers first (never-built ones before everything else), a few per frame
    const stale = visible.filter(l => l.age > 0.3).sort((p, q) => (p.built - q.built) || (q.age - p.age));
    const budget = stale.some(l => !l.built) ? 10 : 4;
    for (const layer of stale.slice(0, budget)) {
      const ox = layer.cx * pixels;
      const oy = layer.cy * pixels;
      layer.ctx.setTransform(1, 0, 0, 1, -ox, -oy);
      layer.ctx.clearRect(ox, oy, pixels, pixels);
      this.drawTiles(layer.ctx, layer.cx * CHUNK_SIZE, (layer.cx + 1) * CHUNK_SIZE, layer.cy * CHUNK_SIZE, (layer.cy + 1) * CHUNK_SIZE, false, civStyles);
      layer.age = Math.random() * 0.1; // spread the next redraws out
      layer.built = true;
    }

    // Forget layers that scrolled far away, keeping their canvases for reuse
    if (this.chunkLayers.size > 160) {
      const keep = new Set(visible);
      for (const [key, layer] of this.chunkLayers) {
        if (!keep.has(layer)) {
          this.chunkLayers.delete(key);
          this.layerPool.push(layer.canvas);
        }
      }
    }
    return visible;
  }

  // Draws tiles [minTileX, maxTileX) x [minTileY, maxTileY): biome, shading, territory, then (in a second pass,
  // so canopies and markers are never painted over by the next tile) trees, resource markers and buildings.
  drawTiles(ctx, minTileX, maxTileX, minTileY, maxTileY, isZoomedIn, civStyles) {
    const ts = this.tileSize;
    minTileX = Math.max(0, minTileX);
    minTileY = Math.max(0, minTileY);
    maxTileX = Math.min(this.terrain.width, maxTileX);
    maxTileY = Math.min(this.terrain.height, maxTileY);
    const standing = this._standing || (this._standing = []);
    standing.length = 0;

    for (let y = minTileY; y < maxTileY; y++) {
      for (let x = minTileX; x < maxTileX; x++) {
        const tile = this.terrain.getTile(x, y);
        if (!tile) continue;

        const px = x * ts;
        const py = y * ts;

        // Base Biome Color
        ctx.fillStyle = tile.biome.color;
        ctx.fillRect(px, py, ts, ts);

        // Water Wave Animation & Coastal Foam
        if (tile.biome.isWater) {
          const wave = Math.sin(x * 0.45 + y * 0.3 + this.waterAnimTime * 3.0);
          if (wave > 0.4) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
            ctx.fillRect(px, py, ts, ts);
          }
        } else {
          // Elevation 3D Contour Shading
          if (tile.elevation > 0.65) {
            const mountainShade = (tile.elevation - 0.65) * 0.7;
            ctx.fillStyle = `rgba(255, 255, 255, ${mountainShade})`;
            ctx.fillRect(px, py, ts, ts);
            // Drop shadow for cliffs
            ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
            ctx.fillRect(px + ts * 0.7, py, ts * 0.3, ts);
          }
        }

        // Territory Border Overlay
        if (tile.civId) {
          const civStyle = civStyles.get(tile.civId);
          if (civStyle) {
            ctx.fillStyle = civStyle.fill;
            ctx.fillRect(px, py, ts, ts);
            // Border line only where the territory ends (a grid of boxes hid the town and the grass)
            ctx.fillStyle = civStyle.stroke;
            const t = this.terrain;
            if (x === 0 || t.getTile(x - 1, y).civId !== tile.civId) ctx.fillRect(px, py, 1.5, ts);
            if (x >= t.width - 1 || t.getTile(x + 1, y).civId !== tile.civId) ctx.fillRect(px + ts - 1.5, py, 1.5, ts);
            if (y === 0 || t.getTile(x, y - 1).civId !== tile.civId) ctx.fillRect(px, py, ts, 1.5);
            if (y >= t.height - 1 || t.getTile(x, y + 1).civId !== tile.civId) ctx.fillRect(px, py + ts - 1.5, ts, 1.5);
          }
        }

        if (tile.road) this.buildingRenderer.drawRoad(ctx, tile, px, py, ts);

        if ((tile.structure && tile.structure.buildingId === undefined) || tile.deposit) standing.push(tile);
      }
    }

    const lens = this.showResources;
    for (const tile of standing) {
      const px = tile.x * ts;
      const py = tile.y * ts;
      // 2. Render Minecraft-Style Top-Down Detailed Buildings
      if (tile.structure && tile.structure.buildingId === undefined) {
        this.renderStructure(ctx, tile.structure, px, py, ts, isZoomedIn);
        continue;
      }
      const d = tile.deposit;
      if (d.type === 'wood') {
        if (isZoomedIn) {
          this.drawTree(ctx, tile, d, px, py, ts);
        } else if (d.amount > 0 && !lens) {
          // a small crown so forests read as forests from a distance
          ctx.fillStyle = 'rgba(12, 56, 20, 0.62)';
          ctx.beginPath();
          ctx.arc(px + ts * 0.5, py + ts * 0.46, ts * 0.27, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (lens && !(d.type === 'wood' && isZoomedIn)) {
        // The Resources lens: a marker per deposit, fading while a renewable has been harvested
        const icon = getResourceIcon(d.type);
        const frac = d.max ? Math.max(0.3, d.amount / d.max) : 1;
        ctx.globalAlpha = frac;
        ctx.drawImage(icon, px + ts * 0.1, py + ts * 0.1, ts * 0.8, ts * 0.8);
        ctx.globalAlpha = 1;
      } else if (lens) {
        const icon = getResourceIcon('wood');
        ctx.drawImage(icon, px + ts * 0.55, py + ts * 0.02, ts * 0.42, ts * 0.42);
      }
    }
  }

  // A procedural pixel tree standing on the tile (or its stump after felling; saplings are drawn smaller).
  drawTree(ctx, tile, deposit, px, py, ts) {
    ctx.imageSmoothingEnabled = false;
    if (deposit.amount <= 0) {
      ctx.drawImage(getStumpSprite(), px + ts * 0.5 - ts * 0.65, py + ts * 0.95 - ts * 1.52, ts * 1.3, ts * 1.52);
      return;
    }
    const variant = (Math.imul(tile.x, 73856093) ^ Math.imul(tile.y, 19349663)) >>> 0;
    const sprite = getTreeSprite(tile.biome.id, variant % 3);
    const grown = deposit.max ? 0.5 + 0.5 * Math.min(1, deposit.amount / deposit.max) : 1;
    const w = ts * 1.3 * grown;
    const h = ts * 1.52 * grown;
    ctx.drawImage(sprite, px + ts * 0.5 - w / 2, py + ts * 0.95 - h, w, h);
  }

  // Zoomed far out: low-resolution blocks drawn straight from the generator (no chunks are loaded), over a
  // whole-planet backdrop that is already there while the blocks are still being built. Then borders and capitals.
  renderFarTerrain(ctx, minTileX, maxTileX, minTileY, maxTileY, pxPerTile) {
    const ts = this.tileSize;
    const terrain = this.terrain;
    const overview = getOverview(terrain);
    overview.step(3);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(overview.canvas, 0, 0, terrain.width * ts, terrain.height * ts);

    // one sample per ~3 screen pixels at most
    const stride = pxPerTile >= 2.5 ? 1 : (pxPerTile >= 1.2 ? 2 : (pxPerTile >= 0.6 ? 4 : 8));
    const span = LodBlocks.BLOCK * stride; // tiles per block side
    const bx0 = Math.max(0, Math.floor(minTileX / span));
    const by0 = Math.max(0, Math.floor(minTileY / span));
    const bx1 = Math.min(Math.ceil(terrain.width / span) - 1, Math.floor(maxTileX / span));
    const by1 = Math.min(Math.ceil(terrain.height / span) - 1, Math.floor(maxTileY / span));
    const centre = this.centerTile();
    const blocks = [];
    for (let by = by0; by <= by1; by++) {
      for (let bx = bx0; bx <= bx1; bx++) blocks.push(this.lod.block(stride, bx, by));
    }
    // build the blocks nearest the middle of the screen first
    blocks.sort((p, q) => Math.hypot((p.bx + 0.5) * span - centre.x, (p.by + 0.5) * span - centre.y)
      - Math.hypot((q.bx + 0.5) * span - centre.x, (q.by + 0.5) * span - centre.y));
    this.lod.build(blocks, 6);
    const size = span * ts;
    for (const b of blocks) {
      if (b.row > 0) ctx.drawImage(b.canvas, b.bx * size, b.by * size, size + 0.7, size + 0.7);
    }
    ctx.imageSmoothingEnabled = true;

    // civilizations: borders as tinted tiles, capitals as rings
    const zoom = this.camera.zoom;
    for (const civ of this.society.civilizations) {
      if (!civ.isAlive) continue;
      ctx.fillStyle = civ.color + '88';
      for (const t of civ.territory) ctx.fillRect(t.x * ts, t.y * ts, ts, ts);
      ctx.strokeStyle = '#ffffff';
      ctx.fillStyle = civ.color;
      ctx.lineWidth = 1.5 / zoom;
      ctx.beginPath();
      ctx.arc((civ.capitalX + 0.5) * ts, (civ.capitalY + 0.5) * ts, 4.5 / zoom, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // the hamlets of its clans
      for (const st of civ.settlements || []) {
        if (st.capital) continue;
        ctx.beginPath();
        ctx.arc((st.x + 0.5) * ts, (st.y + 0.5) * ts, 3 / zoom, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
  }

  render(dt) {
    this.updateKeyboardPan(dt);
    this.clampCamera();
    this.waterAnimTime += dt;

    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.fillStyle = '#04060c'; // space beyond the edge of the planet
    ctx.fillRect(0, 0, w, h);

    // God-power effects: earthquakes shake the view
    const effects = this.terrain.effects;
    let shakeX = 0;
    let shakeY = 0;
    if (effects) {
      effects.updateVisuals(dt);
      const shake = effects.shakeAmount((w / 2 - this.camera.x) / (this.tileSize * this.camera.zoom), (h / 2 - this.camera.y) / (this.tileSize * this.camera.zoom));
      if (shake > 0) {
        shakeX = (Math.random() - 0.5) * shake * 2;
        shakeY = (Math.random() - 0.5) * shake * 2;
      }
    }

    ctx.save();
    ctx.translate(this.camera.x + shakeX, this.camera.y + shakeY);
    ctx.scale(this.camera.zoom, this.camera.zoom);

    const ts = this.tileSize;
    const fxView = { x0: -this.camera.x / this.camera.zoom, y0: -this.camera.y / this.camera.zoom, x1: (w - this.camera.x) / this.camera.zoom, y1: (h - this.camera.y) / this.camera.zoom };

    // Viewport Culling Bounds
    const minTileX = Math.floor(-this.camera.x / (ts * this.camera.zoom));
    const maxTileX = Math.ceil((w - this.camera.x) / (ts * this.camera.zoom));
    const minTileY = Math.floor(-this.camera.y / (ts * this.camera.zoom));
    const maxTileY = Math.ceil((h - this.camera.y) / (ts * this.camera.zoom));

    const isZoomedIn = this.camera.zoom > 1.6;
    const pxPerTile = ts * this.camera.zoom;
    const farView = this.camera.zoom < DETAIL_ZOOM;

    // One lookup per civ per frame (was a find() and two string concats for every owned tile)
    const civStyles = new Map();
    for (const civ of this.society.civilizations) {
      civStyles.set(civ.id, { fill: civ.color + '22', stroke: civ.color + 'cc' });
    }

    // 1. Terrain. Zoomed out, cached chunk images are blitted (re-issuing every tile fill each frame
    //    was the main cost). Zoomed in, only the few visible tiles are drawn directly so the
    //    detailed buildings stay crisp.
    if (farView) {
      this.renderFarTerrain(ctx, minTileX, maxTileX, minTileY, maxTileY, pxPerTile);
    } else if (!isZoomedIn) {
      const pixels = CHUNK_SIZE * ts;
      const layers = this.updateChunkLayers(
        minTileX >> 5, (maxTileX - 1) >> 5, minTileY >> 5, (maxTileY - 1) >> 5, dt, civStyles
      );
      ctx.imageSmoothingEnabled = false; // keep the blocky tiles sharp (and the blit cheap)
      for (const layer of layers) {
        if (layer.built) ctx.drawImage(layer.canvas, layer.cx * pixels, layer.cy * pixels, pixels + 0.6, pixels + 0.6);
      }
      ctx.imageSmoothingEnabled = true;
    } else {
      this.drawTiles(ctx, minTileX, maxTileX, minTileY, maxTileY, true, civStyles);
    }

    if (effects) drawGroundFx(ctx, effects, ts, this.waterAnimTime, fxView);

    // 3. Draw Living & Recently Fallen Entities
    const dots = pxPerTile < 1.5; // far away a creature is just a dot
    // Buildings and creatures share one depth order: a creature behind a building is hidden by it
    const br = this.buildingRenderer;
    if (!farView) br.begin(ctx, { minX: minTileX, maxX: maxTileX, minY: minTileY, maxY: maxTileY }, ts, this.camera.zoom, this.waterAnimTime);
    // clan colours for the headbands (rebuilt a few times a second)
    this._clanTick = (this._clanTick || 0) + 1;
    if (!this._clanColors || this._clanTick % 20 === 1) {
      const m = this._clanColors || (this._clanColors = new Map());
      m.clear();
      for (const civ of this.society.civilizations) for (const clan of civ.clans || []) m.set(clan.id, clan.color);
    }
    const clanColors = this._clanColors;
    const ents = this._sortedEnts || (this._sortedEnts = []);
    ents.length = 0;
    for (const e of this.ecosystem.entities) ents.push(e);
    if (!dots) ents.sort((p, q) => p.y - q.y);
    for (const ent of ents) {
      if (!farView && !dots) br.drawUpTo(ent.y);
      const px = ent.x * ts;
      const py = ent.y * ts;

      // Culling
      if (px < -this.camera.x / this.camera.zoom - 20 || px > (w - this.camera.x) / this.camera.zoom + 20) continue;
      if (py < -this.camera.y / this.camera.zoom - 20 || py > (h - this.camera.y) / this.camera.zoom + 20) continue;

      if (dots) {
        if (ent.alive) {
          ctx.fillStyle = ent.isSapient ? (clanColors.get(ent.clanId) || '#ffffff') : 'rgba(255, 224, 150, 0.85)';
          const d = (ent.isSapient ? 2.2 : 1.6) / this.camera.zoom;
          ctx.fillRect(px - d / 2, py - d / 2, d, d);
        }
        continue;
      }

      if (!ent.alive) {
        // Render fallen entity tombstone / memorial
        if (ent.decayTimer > 0) {
          ctx.save();
          ctx.globalAlpha = Math.max(0.3, Math.min(1.0, ent.decayTimer / 4.0));
          drawTombstone(ctx, px, py, ts * 0.8);
          if (isZoomedIn) {
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = `bold ${(10 / this.camera.zoom).toFixed(2)}px Outfit, sans-serif`;
            ctx.fillStyle = '#f87171';
            ctx.shadowColor = '#000000';
            ctx.shadowBlur = 3;
            ctx.fillText(`† ${ent.name}`, px, py - ts * 0.9);
            ctx.shadowBlur = 0;
          }
          ctx.restore();
        }
        continue;
      }

      // Champion Divine Aura
      if (ent.isSpecialIndividual) {
        ctx.fillStyle = ent.appearance.auraColor ? ent.appearance.auraColor + '55' : 'rgba(255, 215, 0, 0.4)';
        ctx.beginPath();
        ctx.arc(px, py, ts * 1.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = ent.appearance.auraColor || '#ffd700';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(px, py, ts * 1.6 + Math.sin(this.waterAnimTime * 4) * 2, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Drowning Splash Bubbles
      if (ent.isDrowning) {
        ctx.fillStyle = '#60a5fa';
        ctx.beginPath();
        ctx.arc(px + Math.sin(this.waterAnimTime * 10) * 3, py - 4, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // Entity body: a pixel-art sprite built from the creature's genes, walking and facing where it goes
      const spriteH = ts * 1.5 * ent.visualScale;
      const spriteW = spriteH * (SPRITE_W / SPRITE_H);
      // asleep: people indoors are out of sight (a drifting z over their house), people sleeping rough lie down
      const asleep = ent.isSapient && ent.state === 'SLEEP' && this.dayFade() > 0.5;
      if (asleep) {
        const home = ent.homeId ? this.terrain.getBuilding(ent.homeId) : null;
        if (home && Math.hypot(ent.x - (home.x + home.w / 2), ent.y - (home.y + home.h)) < 5) {
          this.drawGlyph(ctx, '💤', Math.floor(ts * 0.7), (home.x + home.w / 2) * ts, (home.y + 0.4) * ts + Math.sin(this.waterAnimTime * 2 + ent.homeX) * ts * 0.12);
          continue;
        }
      }
      const walking = !asleep && ent.path.length > 0;
      const frame = walking ? (Math.floor(this.waterAnimTime * 6 + ent.homeX) & 1) : 0;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.beginPath();
      ctx.ellipse(px, py + spriteH * 0.18, spriteW * 0.38, spriteH * 0.09, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      if (asleep) { ctx.translate(px, py); ctx.rotate(Math.PI / 2 * (ent.facing < 0 ? -1 : 1)); ctx.translate(-px, -py + spriteH * 0.25); }
      if (ent.facing < 0) {
        ctx.translate(px, 0);
        ctx.scale(-1, 1);
        ctx.translate(-px, 0);
      }
      // sapients wear their clan's colour and carry the tool of their job
      let extras = null;
      if (ent.isSapient && ent.civilization && ent.isAdult) {
        extras = this._extras || (this._extras = { clanColor: null, tool: null });
        extras.clanColor = clanColors.get(ent.clanId) || null;
        extras.tool = (ent.role === 'SOLDIER' && ent.civilization.warTarget) ? 'spear' : (JOB_TOOLS[ent.job] || null);
      } else if (ent.isSapient && ent.civilization) {
        extras = this._extras || (this._extras = { clanColor: null, tool: null });
        extras.clanColor = clanColors.get(ent.clanId) || null;
        extras.tool = null;
      }
      ctx.drawImage(getCreatureCanvas(ent.traits, frame, extras), px - spriteW / 2, py - spriteH * 0.8, spriteW, spriteH);
      ctx.restore();

      if (asleep) this.drawGlyph(ctx, '💤', Math.floor(ts * 0.6), px, py - spriteH * 0.7 + Math.sin(this.waterAnimTime * 2 + ent.homeX) * ts * 0.1);

      // goods on the carrier's back: a small bundle in the colour of what it carries (wood, stone, grain...)
      if (ent.isSapient && ent.inventory) {
        let load = null;
        for (const k in ent.inventory) { load = k; break; }
        if (load) {
          const s = Math.max(2, ts * 0.3);
          const bx = px - (ent.facing < 0 ? -1 : 1) * spriteW * 0.34 - s / 2;
          const by = py - spriteH * 0.5;
          ctx.fillStyle = 'rgba(0,0,0,0.45)';
          ctx.fillRect(bx - 0.5, by - 0.5, s + 1, s + 1);
          ctx.fillStyle = itemColor(load);
          ctx.fillRect(bx, by, s, s);
        }
      }

      // Small badges above the head for role & belief (and the champion's crown)
      let badge = null;
      if (ent.isSpecialIndividual) badge = '👑';
      else if (ent.role === 'SOLDIER') badge = '⚔️';
      else if (ent.role === 'GUARD') badge = '🛡️';
      else if (ent.role === 'CRIMINAL') badge = '🦹';
      else if (ent.belief.status === 'ATHEIST_HERETIC') badge = '⚡';
      if (badge) this.drawGlyph(ctx, badge, Math.floor(ts * (ent.isSpecialIndividual ? 0.9 : 0.6)), px, py - spriteH * 0.95);

      // Name / Title tags when zoomed in
      // (a fixed size on screen whatever the zoom; wild animals are not named individually)
      if (ent.isSapient && (isZoomedIn || ent.isSpecialIndividual)) {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `bold ${(11 / this.camera.zoom).toFixed(2)}px Outfit, sans-serif`;
        ctx.fillStyle = ent.isSpecialIndividual ? '#fef08a' : (ent.belief.status === 'ATHEIST_HERETIC' ? '#f87171' : '#ffffff');
        ctx.shadowColor = '#000000';
        ctx.shadowBlur = 4 / this.camera.zoom;
        ctx.fillText(ent.name, px, py - spriteH * 1.2);
        ctx.shadowBlur = 0;
      }
    }

    if (!farView) br.flush();

    if (effects) {
      drawStatusFx(ctx, this.ecosystem.entities, ts, this.waterAnimTime, fxView);
      drawSkyFx(ctx, effects, ts, this.waterAnimTime, fxView);
    }

    // 4. Draw Divine Impact Particles
    for (const p of this.terrain.particles) {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.beginPath();
      ctx.arc(p.x * ts, p.y * ts, 2.5 * p.life, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1.0;

    // 5. Night: the world darkens; windows, hearths and torches glow (simulation/dayCycle.js)
    // (one day is DAY_SECONDS of simulated time: at high speeds it would flash by, so the cycle fades to steady daylight)
    const fade = this.dayFade();
    const light = 1 - (1 - daylight(timeOfDay(this.ecosystem.timeYears))) * fade;
    if (light < 0.98) {
      const dark = (1 - light) * 0.48;
      const x0 = -this.camera.x / this.camera.zoom;
      const y0 = -this.camera.y / this.camera.zoom;
      ctx.fillStyle = `rgba(8, 14, 40, ${dark.toFixed(3)})`;
      ctx.fillRect(x0, y0, w / this.camera.zoom, h / this.camera.zoom);
      if (dark > 0.12 && !farView) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const glow = Math.min(1, (dark - 0.12) * 2.2);
        for (const b of this.buildingRenderer.queue) {
          if (b.progress < 1 || b.type === 'ruins' || b.type === 'farm' || b.type === 'pen') continue;
          const cx = (b.x + b.w / 2) * ts;
          const cy = (b.y + b.h - 0.6) * ts;
          const r = ts * (1.2 + b.w * 0.35);
          const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
          g.addColorStop(0, `rgba(255, 190, 90, ${(0.35 * glow).toFixed(3)})`);
          g.addColorStop(1, 'rgba(255, 190, 90, 0)');
          ctx.fillStyle = g;
          ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
        }
        ctx.restore();
      }
    }

    if (this.currentPower && this.currentPower.radius && this.hover && this.enabled) {
      drawPowerCursor(ctx, this.hover, this.currentPower, ts, this.waterAnimTime);
    }

    ctx.restore();
  }

  // Render Minecraft-like top-down blocky architectural structures
  renderStructure(ctx, structure, px, py, ts, isDetailed) {
    if (!isDetailed) {
      // Zoomed out: a small drawn marker in the structure's colour
      drawStructureMark(ctx, structure, px, py, ts);
      return;
    }

    // Zoomed in: Minecraft-style blocky roof & masonry rendering
    const pad = 2;
    const w = ts - pad * 2;
    const h = ts - pad * 2;
    const x = px + pad;
    const y = py + pad;

    switch (structure.type) {
      case 'house':
        // Wooden planks base
        ctx.fillStyle = '#78350f';
        ctx.fillRect(x, y, w, h);
        // Terracotta pitched roof
        ctx.fillStyle = '#b45309';
        ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
        // Roof ridge line
        ctx.strokeStyle = '#fef08a';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + w / 2, y + 2);
        ctx.lineTo(x + w / 2, y + h - 2);
        ctx.stroke();
        // Cobblestone chimney with smoke puff
        ctx.fillStyle = '#475569';
        ctx.fillRect(x + w - 4, y + 2, 3, 3);
        break;

      case 'tower':
        // Stone Fortress Keep with Crenellations
        ctx.fillStyle = '#64748b';
        ctx.fillRect(x, y, w, h);
        // Inner courtyard
        ctx.fillStyle = '#334155';
        ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
        // Crenellation corners
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(x, y, 3, 3);
        ctx.fillRect(x + w - 3, y, 3, 3);
        ctx.fillRect(x, y + h - 3, 3, 3);
        ctx.fillRect(x + w - 3, y + h - 3, 3, 3);
        break;

      case 'temple':
        // Sacred Temple with Golden Dome
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(x, y, w, h);
        // Golden sanctuary dome
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.arc(x + w / 2, y + h / 2, w / 2.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fef08a';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        break;

      case 'farm':
        // Furrowed soil crops
        ctx.fillStyle = '#78350f';
        ctx.fillRect(x, y, w, h);
        // Crops rows (green & golden wheat)
        ctx.fillStyle = '#84cc16';
        ctx.fillRect(x + 2, y + 2, w - 4, 2);
        ctx.fillRect(x + 2, y + 6, w - 4, 2);
        ctx.fillRect(x + 2, y + 10, w - 4, 2);
        break;

      case 'capital':
        // Grand Royal Palace
        ctx.fillStyle = '#3b82f6';
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = '#ffd700';
        ctx.beginPath();
        ctx.arc(x + w / 2, y + h / 2, w / 2.5, 0, Math.PI * 2);
        ctx.fill();
        drawCrown(ctx, x + w / 2, y + h / 2, w * 0.45);
        break;

      case 'ruins':
        // Crumbled stone blocks & moss
        ctx.fillStyle = '#475569';
        ctx.fillRect(x, y, w * 0.7, h * 0.6);
        ctx.fillStyle = '#15803d'; // Moss
        ctx.fillRect(x + 2, y + 2, 4, 3);
        ctx.fillStyle = '#334155';
        ctx.fillRect(x + w * 0.5, y + h * 0.4, w * 0.4, h * 0.5);
        break;

      default:
        drawStructureMark(ctx, structure, px, py, ts);
        break;
    }
  }
}

// ---------- small drawn marks (no emoji in the world view) ----------

// A grey headstone with a cross, centred on (cx, cy)
function drawTombstone(ctx, cx, cy, size) {
  const w = size * 0.55;
  const h = size * 0.7;
  const x = cx - w / 2;
  const y = cy - h / 2;
  ctx.fillStyle = '#64748b';
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + w / 2);
  ctx.arc(cx, y + w / 2, w / 2, Math.PI, 0);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#334155';
  ctx.fillRect(x - w * 0.15, y + h - size * 0.08, w * 1.3, size * 0.08);
  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(cx - size * 0.03, y + h * 0.22, size * 0.06, h * 0.45);
  ctx.fillRect(cx - w * 0.25, y + h * 0.34, w * 0.5, size * 0.06);
}

// A gold crown centred on (cx, cy), `w` wide
function drawCrown(ctx, cx, cy, w) {
  const h = w * 0.7;
  const x = cx - w / 2;
  const y = cy - h / 2;
  ctx.fillStyle = '#facc15';
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + h * 0.25);
  ctx.lineTo(x + w * 0.25, y + h * 0.55);
  ctx.lineTo(cx, y);
  ctx.lineTo(x + w * 0.75, y + h * 0.55);
  ctx.lineTo(x + w, y + h * 0.25);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#a16207';
  ctx.lineWidth = Math.max(1, w * 0.06);
  ctx.stroke();
}

const MARK_COLORS = { house: '#b45309', tower: '#64748b', temple: '#f59e0b', farm: '#84cc16', capital: '#3b82f6', ruins: '#475569' };

// Zoomed-out marker for a tile structure: a block in the structure's colour with a darker rim
function drawStructureMark(ctx, structure, px, py, ts) {
  const pad = Math.max(1, ts * 0.18);
  const color = MARK_COLORS[structure.type] || '#94a3b8';
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(px + pad - 1, py + pad - 1, ts - pad * 2 + 2, ts - pad * 2 + 2);
  ctx.fillStyle = color;
  ctx.fillRect(px + pad, py + pad, ts - pad * 2, ts - pad * 2);
  if (structure.type === 'capital') drawCrown(ctx, px + ts / 2, py + ts / 2, ts * 0.4);
}
