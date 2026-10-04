// 2D High-Performance Surface Canvas Renderer with Minecraft-Style Top-Down Structures, Smooth Pan/Zoom & Drag Brush
import { CHUNK_SIZE } from './terrain.js';
import { getCreatureCanvas, SPRITE_W, SPRITE_H } from '../art/creatureSprite.js';
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
    });

    this.listen(window, 'keyup', (e) => {
      this.keys[e.key.toLowerCase()] = false;
    });

    // Mouse Controls: Left-drag pans in Inspect/Pan mode, paints in destructive/terraform modes
    this.listen(this.canvas, 'mousedown', (e) => {
      if (!this.enabled) return;
      this.mouseDownPos = { x: e.clientX, y: e.clientY };
      this.dragDistance = 0;

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
      this.isPanning = false;
      this.isPainting = false;

      // Reset cursor
      if (this.canvas) {
        this.canvas.style.cursor = (this.currentPower && this.currentPower.cursor) ? this.currentPower.cursor : 'grab';
      }

      // If user performed a click (drag distance < 10px) with Left Mouse Button
      if (e.button === 0 && dragDist < 10 && this.onTileClicked) {
        this.onTileClicked(e.clientX, e.clientY);
      }
    });

    // Zoom with Cursor Anchor (Zoom range: 0.25x to 6.0x)
    this.listen(this.canvas, 'wheel', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.18 : 0.85;
      const mouseX = e.clientX;
      const mouseY = e.clientY;

      const newZoom = Math.max(0.3, Math.min(6.0, this.camera.zoom * zoomFactor));

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
    if (this.followingEntity && this.followingEntity.alive) {
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
    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const key = cx + ',' + cy;
        let layer = this.chunkLayers.get(key);
        if (!layer) {
          const canvas = this.layerPool.pop() || document.createElement('canvas');
          canvas.width = pixels;
          canvas.height = pixels;
          layer = { canvas, ctx: canvas.getContext('2d'), age: Infinity, built: false, cx, cy };
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

  // Draws tiles [minTileX, maxTileX) x [minTileY, maxTileY): biome, shading, territory, buildings.
  drawTiles(ctx, minTileX, maxTileX, minTileY, maxTileY, isZoomedIn, civStyles) {
    const ts = this.tileSize;
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
            // Border outline
            ctx.strokeStyle = civStyle.stroke;
            ctx.lineWidth = 1;
            ctx.strokeRect(px + 0.5, py + 0.5, ts - 1, ts - 1);
          }
        }

        // 2. Render Minecraft-Style Top-Down Detailed Buildings
        if (tile.structure) {
          this.renderStructure(ctx, tile.structure, px, py, ts, isZoomedIn);
        }
      }
    }
  }

  render(dt) {
    this.updateKeyboardPan(dt);
    this.waterAnimTime += dt;

    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

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

    // One lookup per civ per frame (was a find() and two string concats for every owned tile)
    const civStyles = new Map();
    for (const civ of this.society.civilizations) {
      civStyles.set(civ.id, { fill: civ.color + '38', stroke: civ.color + 'aa' });
    }

    // 1. Terrain. Zoomed out, cached chunk images are blitted (re-issuing every tile fill each frame
    //    was the main cost). Zoomed in, only the few visible tiles are drawn directly so the
    //    detailed buildings stay crisp.
    if (!isZoomedIn) {
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
    for (const ent of this.ecosystem.entities) {
      const px = ent.x * ts;
      const py = ent.y * ts;

      // Culling
      if (px < -this.camera.x / this.camera.zoom - 20 || px > (w - this.camera.x) / this.camera.zoom + 20) continue;
      if (py < -this.camera.y / this.camera.zoom - 20 || py > (h - this.camera.y) / this.camera.zoom + 20) continue;

      if (!ent.alive) {
        // Render fallen entity tombstone / memorial
        if (ent.decayTimer > 0) {
          ctx.save();
          ctx.globalAlpha = Math.max(0.3, Math.min(1.0, ent.decayTimer / 4.0));
          this.drawGlyph(ctx, '🪦', Math.floor(ts * 0.95), px, py);
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
      const walking = ent.path.length > 0;
      const frame = walking ? (Math.floor(this.waterAnimTime * 6 + ent.homeX) & 1) : 0;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.beginPath();
      ctx.ellipse(px, py + spriteH * 0.18, spriteW * 0.38, spriteH * 0.09, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      if (ent.facing < 0) {
        ctx.translate(px, 0);
        ctx.scale(-1, 1);
        ctx.translate(-px, 0);
      }
      ctx.drawImage(getCreatureCanvas(ent.traits, frame), px - spriteW / 2, py - spriteH * 0.8, spriteW, spriteH);
      ctx.restore();

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

    if (this.currentPower && this.currentPower.radius && this.hover && this.enabled) {
      drawPowerCursor(ctx, this.hover, this.currentPower, ts, this.waterAnimTime);
    }

    ctx.restore();
  }

  // Render Minecraft-like top-down blocky architectural structures
  renderStructure(ctx, structure, px, py, ts, isDetailed) {
    if (!isDetailed) {
      // Zoomed out: Clean icon representation
      this.drawGlyph(ctx, structure.icon || '🏛️', Math.floor(ts * 0.9), px + ts / 2, py + ts / 2);
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
        this.drawGlyph(ctx, '👑', Math.floor(ts * 0.6), x + w / 2, y + h / 2);
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
        this.drawGlyph(ctx, structure.icon || '🏛️', Math.floor(ts * 0.9), x + w / 2, y + h / 2);
        break;
    }
  }
}
