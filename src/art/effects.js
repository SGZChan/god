// Animated canvas effects for god powers and disasters. Everything is drawn procedurally in world pixels
// (tile * tileSize) by the surface renderer: layered shapes, additive blending, easing. Particles are not stored:
// each one is computed from a hash of (effect, index) and the clock, so effects cost nothing when off screen.
//
//   drawGroundFx(ctx, fx, ts, time, view)  - decals under creatures: cracks, craters, lava, zone tints, pools
//   drawSkyFx(ctx, fx, ts, time, view)     - everything above: funnels, flames, bolts, domes, light beams
//   drawStatusFx(ctx, entities, ts, time, view) - auras on creatures (shield, charm, madness...)
//   drawPowerCursor(ctx, hover, power, ts, time) - brush ring that shows a power's radius
const TAU = Math.PI * 2;

const hash = (a, b = 0) => {
  const x = Math.sin(a * 127.1 + b * 311.7 + 17.3) * 43758.5453;
  return x - Math.floor(x);
};
const idNum = id => parseInt(String(id).replace(/\D/g, ''), 10) || 1;
const easeOut = t => 1 - Math.pow(1 - t, 3);
const easeIn = t => t * t;
const clamp01 = v => Math.max(0, Math.min(1, v));

const colorCache = new Map();
function rgb(hex) {
  let c = colorCache.get(hex);
  if (!c) {
    const h = hex.replace('#', '');
    c = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    colorCache.set(hex, c);
  }
  return c;
}
const rgba = (hex, a) => {
  const [r, g, b] = rgb(hex);
  return `rgba(${r},${g},${b},${a})`;
};

function glow(ctx, x, y, r, hex, a = 1) {
  if (r <= 0 || a <= 0) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(hex, a));
  g.addColorStop(0.45, rgba(hex, a * 0.4));
  g.addColorStop(1, rgba(hex, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

function add(ctx, fn) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  fn();
  ctx.restore();
}

function ring(ctx, x, y, r, hex, a, width) {
  ctx.strokeStyle = rgba(hex, a);
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.1, r), 0, TAU);
  ctx.stroke();
}

function star(ctx, x, y, r, hex, a) {
  ctx.fillStyle = rgba(hex, a);
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fill();
}

function inView(view, x, y, r) {
  return x + r >= view.x0 && x - r <= view.x1 && y + r >= view.y0 && y - r <= view.y1;
}

// A jagged line from (x1, y1) to (x2, y2)
function jag(ctx, x1, y1, x2, y2, seed, amp, parts = 9) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  ctx.moveTo(x1, y1);
  for (let i = 1; i < parts; i++) {
    const f = i / parts;
    const o = (hash(seed, i) - 0.5) * 2 * amp;
    ctx.lineTo(x1 + dx * f + nx * o, y1 + dy * f + ny * o);
  }
  ctx.lineTo(x2, y2);
}

// A rising flame tongue
function flame(ctx, x, y, h, w, t, seed) {
  const sway = Math.sin(t * 9 + seed * 7) * w * 0.35;
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y);
  ctx.quadraticCurveTo(x - w * 0.55 + sway * 0.4, y - h * 0.5, x + sway, y - h);
  ctx.quadraticCurveTo(x + w * 0.55 + sway * 0.4, y - h * 0.5, x + w / 2, y);
  ctx.closePath();
}

// ======================================================================
// Ground layer
// ======================================================================

const ZONE_TINT = {
  warm: ['#ff9a3c', 0.16], cool: ['#7dd3fc', 0.16], blizzard: ['#e0f2fe', 0.22], snow: ['#dbeafe', 0.2],
  dust: ['#b8812f', 0.22], blight: ['#3f6212', 0.28], acid: ['#a3e635', 0.18],
  healing: ['#38bdf8', 0.2], shield: ['#fde047', 0.1], fertility: ['#f9a8d4', 0.14], barren: ['#78716c', 0.2],
  madness: ['#ef4444', 0.14], haunt: ['#a5b4fc', 0.16], mushrooms: ['#c084fc', 0.14], charm: ['#f472b6', 0.12],
  rainbow: ['#ffffff', 0.05], aurora: ['#34d399', 0.05], fireworks: ['#ffffff', 0.0]
};

export function drawGroundFx(ctx, fx, ts, time, view) {
  // zone tints and pools
  for (const e of fx.list) {
    const cx = (e.x + 0.5) * ts;
    const cy = (e.y + 0.5) * ts;
    const r = e.radius * ts;
    if (!inView(view, cx, cy, r + ts * 2)) continue;
    const id = idNum(e.id);
    if (e.type === 'climate' || e.type === 'aura') {
      const tint = ZONE_TINT[e.visual];
      if (!tint) continue;
      const env = e.type === 'climate' ? (e.env || 0) : Math.min(1, e.age / 2, (e.duration - e.age) / 3);
      const a = tint[1] * clamp01(env);
      if (a <= 0.005) continue;
      const g = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
      g.addColorStop(0, rgba(tint[0], a));
      g.addColorStop(0.75, rgba(tint[0], a * 0.7));
      g.addColorStop(1, rgba(tint[0], 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, TAU);
      ctx.fill();
    }
    if (e.type === 'aura' && e.visual === 'healing') {
      // a shimmering pool with ripples
      const fade = Math.min(1, e.age / 1.5, (e.duration - e.age) / 3);
      const pr = Math.min(r * 0.75, ts * 3.6);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(1, 0.62);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, pr);
      g.addColorStop(0, rgba('#bae6fd', 0.85 * fade));
      g.addColorStop(0.7, rgba('#38bdf8', 0.7 * fade));
      g.addColorStop(1, rgba('#0284c7', 0.55 * fade));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, pr, 0, TAU);
      ctx.fill();
      for (let i = 0; i < 3; i++) {
        const u = (time * 0.5 + i / 3) % 1;
        ring(ctx, 0, 0, pr * (0.2 + u * 0.8), '#ffffff', (1 - u) * 0.6 * fade, 1.5);
      }
      ctx.restore();
    }
    if (e.type === 'aura' && e.visual === 'mushrooms') {
      const fade = Math.min(1, e.age / 1.5, (e.duration - e.age) / 3);
      for (let i = 0; i < 14; i++) {
        const a = hash(id, i) * TAU;
        const d = Math.sqrt(hash(id, i + 50)) * r * 0.85;
        const mx = cx + Math.cos(a) * d;
        const my = cy + Math.sin(a) * d;
        const sz = ts * (0.28 + hash(id, i + 9) * 0.25) * Math.min(1, e.age / 1.2 + 0.1);
        const hue = ['#f472b6', '#a78bfa', '#34d399', '#fbbf24'][i % 4];
        ctx.fillStyle = rgba('#f1f5f9', 0.9 * fade);
        ctx.fillRect(mx - sz * 0.12, my - sz * 0.1, sz * 0.24, sz * 0.5);
        ctx.fillStyle = rgba(hue, 0.95 * fade);
        ctx.beginPath();
        ctx.ellipse(mx, my - sz * 0.1, sz * 0.5, sz * 0.32, 0, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = rgba('#ffffff', 0.8 * fade);
        ctx.fillRect(mx - sz * 0.2, my - sz * 0.3, sz * 0.1, sz * 0.1);
        ctx.fillRect(mx + sz * 0.1, my - sz * 0.25, sz * 0.1, sz * 0.1);
      }
    }
    if (e.type === 'tornado') {
      // shadow and dust on the ground
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      ctx.ellipse(cx, cy + ts * 0.3, ts * 1.7, ts * 0.7, 0, 0, TAU);
      ctx.fill();
    }
  }

  // lava and burning ground
  for (const e of fx.list) {
    if (e.type === 'lava') {
      for (const c of e.cells) {
        const px = c[0] * ts;
        const py = c[1] * ts;
        if (!inView(view, px, py, ts)) continue;
        const heat = clamp01(1 - c[2] / 25);
        const pulse = 0.85 + 0.15 * Math.sin(time * 4 + c[0] * 1.3 + c[1]);
        ctx.fillStyle = `rgba(${Math.floor(60 + 195 * heat)},${Math.floor(20 + 110 * heat * pulse)},10,${0.55 + 0.4 * heat})`;
        ctx.fillRect(px - 1, py - 1, ts + 2, ts + 2);
        if (heat > 0.2) {
          add(ctx, () => glow(ctx, px + ts / 2, py + ts / 2, ts * 1.6, '#ff7a1a', 0.55 * heat * pulse));
        }
      }
    } else if (e.type === 'wildfire') {
      for (const c of e.cells) {
        const px = c[0] * ts;
        const py = c[1] * ts;
        if (!inView(view, px, py, ts)) continue;
        ctx.fillStyle = 'rgba(25,12,6,0.55)';
        ctx.fillRect(px, py, ts, ts);
        add(ctx, () => glow(ctx, px + ts / 2, py + ts / 2, ts * 1.4, '#ff6a00', 0.35));
      }
    }
  }

  // decals from visuals
  for (const v of fx.visuals) {
    const cx = v.x * ts;
    const cy = v.y * ts;
    const u = clamp01(v.age / v.life);
    if (v.kind === 'crater') {
      if (!inView(view, cx, cy, v.radius * ts)) continue;
      const a = u > 0.8 ? 1 - (u - 0.8) / 0.2 : 1;
      const r = v.radius * ts * Math.min(1, easeOut(Math.min(1, v.age / 0.4)));
      ctx.fillStyle = rgba('#1a0f0a', 0.7 * a);
      ctx.beginPath();
      ctx.ellipse(cx, cy, r, r * 0.8, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = rgba('#6b4a2f', 0.8 * a);
      ctx.lineWidth = Math.max(1.5, ts * 0.18);
      ctx.beginPath();
      ctx.ellipse(cx, cy, r * 1.05, r * 0.85, 0, 0, TAU);
      ctx.stroke();
      add(ctx, () => glow(ctx, cx, cy, r * 1.2, '#ff5a1a', 0.5 * (1 - u) * a));
    } else if (v.kind === 'crack') {
      if (!inView(view, cx, cy, v.radius * ts)) continue;
      const a = u > 0.6 ? 1 - (u - 0.6) / 0.4 : 1;
      const grow = easeOut(Math.min(1, v.age / 0.6));
      const seed = Math.floor(v.x * 31 + v.y * 17);
      const arms = 8;
      ctx.lineCap = 'round';
      for (const [w, col] of [[Math.max(2.5, ts * 0.28), rgba('#120a06', 0.85 * a)], [Math.max(1, ts * 0.1), v.glow ? rgba('#ff8a2a', a) : rgba('#3a2a1d', a)]]) {
        ctx.strokeStyle = col;
        ctx.lineWidth = w;
        ctx.beginPath();
        for (let i = 0; i < arms; i++) {
          const ang = (i / arms) * TAU + hash(seed, i) * 0.6;
          const len = v.radius * ts * (0.55 + hash(seed, i + 20) * 0.45) * grow;
          jag(ctx, cx, cy, cx + Math.cos(ang) * len, cy + Math.sin(ang) * len, seed + i, ts * 0.45, 8);
        }
        ctx.stroke();
      }
      ctx.lineCap = 'butt';
    }
  }
}

// ======================================================================
// Sky layer
// ======================================================================

function drawTornado(ctx, e, ts, time) {
  const cx = (e.x + 0.5) * ts;
  const base = (e.y + 0.5) * ts + ts * 0.3;
  const height = ts * 9;
  const fade = Math.min(1, e.age / 2, (e.duration - e.age) / 3);
  const id = idNum(e.id);
  // funnel: stacked rotating ellipses, narrow at the base and wide at the top
  const layers = 26;
  for (let i = 0; i < layers; i++) {
    const f = i / (layers - 1);
    const y = base - f * height;
    const w = ts * (0.4 + Math.pow(f, 1.6) * 3.8);
    const off = Math.sin(time * 1.3 + f * 4 + id) * ts * 0.35 * f + Math.sin(time * 0.7 + id) * ts * 0.2 * f;
    const spin = time * 6 - f * 5;
    const shade = 70 + f * 55;
    ctx.fillStyle = `rgba(${shade + 20},${shade + 22},${shade + 30},${(0.5 - f * 0.18) * fade})`;
    ctx.beginPath();
    ctx.ellipse(cx + off, y, w, w * 0.28, 0, 0, TAU);
    ctx.fill();
    // light and dark bands rotate around the funnel
    ctx.strokeStyle = `rgba(230,235,245,${0.35 * fade})`;
    ctx.lineWidth = Math.max(1, ts * 0.08);
    ctx.beginPath();
    ctx.ellipse(cx + off, y, w * 0.96, w * 0.27, 0, spin, spin + 1.5);
    ctx.stroke();
    ctx.strokeStyle = `rgba(30,35,50,${0.4 * fade})`;
    ctx.beginPath();
    ctx.ellipse(cx + off, y, w * 0.96, w * 0.27, 0, spin + Math.PI, spin + Math.PI + 1.2);
    ctx.stroke();
  }
  // storm cloud on top
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + time * 0.4;
    ctx.fillStyle = `rgba(55,60,78,${0.55 * fade})`;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * ts * 2, base - height - ts * 0.2 + Math.sin(a) * ts * 0.55, ts * 1.5, 0, TAU);
    ctx.fill();
  }
  // debris and dust orbiting
  for (let i = 0; i < 38; i++) {
    const f = (hash(id, i) + time * 0.12 * (0.6 + hash(id, i + 7))) % 1;
    const a = hash(id, i + 30) * TAU + time * (4 - f * 2);
    const w = ts * (0.5 + Math.pow(f, 1.4) * 3.6);
    const px = cx + Math.cos(a) * w;
    const py = base - f * height * 0.9 + Math.sin(a) * w * 0.28;
    const kind = i % 4;
    ctx.fillStyle = kind === 0 ? `rgba(110,75,40,${0.9 * fade})` : kind === 1 ? `rgba(70,120,50,${0.9 * fade})` : kind === 2 ? `rgba(190,185,170,${0.8 * fade})` : `rgba(160,130,90,${0.7 * fade})`;
    const s = ts * (0.1 + hash(id, i + 3) * 0.14);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(a * 2);
    ctx.fillRect(-s, -s / 2, s * 2, s);
    ctx.restore();
  }
  // dust ring at the base
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU + time * 3;
    ctx.fillStyle = `rgba(150,125,90,${0.3 * fade})`;
    ctx.beginPath();
    ctx.ellipse(cx + Math.cos(a) * ts * 1.3, base + Math.sin(a) * ts * 0.4, ts * 0.8, ts * 0.3, 0, 0, TAU);
    ctx.fill();
  }
}

function drawFlames(ctx, e, ts, time, view) {
  for (let ci = 0; ci < e.cells.length; ci++) {
    const c = e.cells[ci];
    const px = c[0] * ts;
    const py = c[1] * ts;
    if (!inView(view, px, py, ts * 3)) continue;
    const life = clamp01(c[2] / 4);
    const seed = c[0] * 13 + c[1] * 7;
    // smoke
    for (let k = 0; k < 2; k++) {
      const u = (time * 0.35 + hash(seed, k)) % 1;
      ctx.fillStyle = `rgba(40,36,34,${0.32 * (1 - u) * (0.4 + life)})`;
      ctx.beginPath();
      ctx.arc(px + ts / 2 + Math.sin(u * 6 + seed) * ts * 0.4, py + ts * 0.2 - u * ts * 3.2, ts * (0.4 + u * 0.7), 0, TAU);
      ctx.fill();
    }
    add(ctx, () => {
      for (let k = 0; k < 3; k++) {
        const fx0 = px + ts * (0.2 + 0.3 * k) + hash(seed, k + 3) * ts * 0.1;
        const h = ts * (1.4 + 1.0 * hash(seed, k)) * (0.55 + 0.5 * life) * (0.85 + 0.15 * Math.sin(time * 12 + seed + k * 2));
        const w = ts * 0.75;
        flame(ctx, fx0, py + ts * 0.9, h, w, time, seed + k);
        ctx.fillStyle = rgba('#ff4d0a', 0.55);
        ctx.fill();
        flame(ctx, fx0, py + ts * 0.9, h * 0.7, w * 0.66, time, seed + k + 2);
        ctx.fillStyle = rgba('#ffb020', 0.7);
        ctx.fill();
        flame(ctx, fx0, py + ts * 0.9, h * 0.4, w * 0.35, time, seed + k + 5);
        ctx.fillStyle = rgba('#fff2a8', 0.85);
        ctx.fill();
      }
      // sparks
      const u = (time * 0.9 + hash(seed, 9)) % 1;
      star(ctx, px + ts * (0.2 + hash(seed, 11) * 0.6) + Math.sin(u * 7) * ts * 0.3, py + ts * 0.6 - u * ts * 2.2, ts * 0.1, '#ffd27a', 1 - u);
    });
  }
}

function drawLocusts(ctx, e, ts, time) {
  const cx = (e.x + 0.5) * ts;
  const cy = (e.y + 0.5) * ts;
  const id = idNum(e.id);
  const fade = Math.min(1, e.age / 1.5, (e.duration - e.age) / 3);
  ctx.fillStyle = `rgba(20,14,6,${0.28 * fade})`;
  ctx.beginPath();
  ctx.ellipse(cx, cy + ts * 0.4, ts * 2.6, ts * 1.2, 0, 0, TAU);
  ctx.fill();
  for (let i = 0; i < 130; i++) {
    const a = hash(id, i) * TAU + time * (1.2 + hash(id, i + 1) * 1.8);
    const d = (0.3 + Math.sqrt(hash(id, i + 2)) * 2.4) * ts * (1 + 0.15 * Math.sin(time * 3 + i));
    const px = cx + Math.cos(a) * d + Math.sin(time * 9 + i) * ts * 0.12;
    const py = cy + Math.sin(a * 1.3) * d * 0.55 - ts * (0.3 + hash(id, i + 4) * 0.8);
    const flap = Math.sin(time * 40 + i * 2.1) > 0 ? 1 : 0.4;
    ctx.fillStyle = `rgba(${40 + hash(id, i) * 40},${28 + hash(id, i + 5) * 20},12,${0.9 * fade})`;
    const k = ts * 0.2;
    ctx.fillRect(px - k, py - k * 0.4, k * 2, k * 0.8);
    ctx.fillStyle = `rgba(215,190,90,${0.85 * fade})`;
    ctx.fillRect(px - k * 0.6, py - k * 1.5 * flap, k * 1.2, k * 0.9 * flap);
  }
}

function drawStreaks(ctx, e, ts, time, view) {
  // weather zone: rain, snow, blizzard, acid rain, dust
  const cx = (e.x + 0.5) * ts;
  const cy = (e.y + 0.5) * ts;
  const r = e.radius * ts;
  if (!inView(view, cx, cy, r)) return;
  const id = idNum(e.id);
  const env = clamp01(Math.min(1, e.age / 2.5, (e.duration - e.age) / 4)); // visual strength (the land changes slower)
  if (env < 0.03) return;
  const kind = e.visual;
  const count = Math.min(160, Math.floor(30 + e.radius * 9)) * (kind === 'blizzard' ? 1.4 : 1);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.clip();
  if (kind === 'blizzard') {
    ctx.fillStyle = `rgba(235,244,255,${0.2 * env})`;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  } else if (kind === 'dust') {
    ctx.fillStyle = `rgba(150,105,50,${0.1 * env})`;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
  for (let i = 0; i < count; i++) {
    const u = (time * (kind === 'snow' ? 0.3 : kind === 'blizzard' ? 0.8 : kind === 'dust' ? 0.5 : 1.6) * (0.6 + hash(id, i + 7) * 0.8) + hash(id, i)) % 1;
    const x0 = cx + (hash(id, i + 100) * 2 - 1) * r;
    const slant = kind === 'blizzard' ? r * 0.5 : kind === 'dust' ? r * 0.3 : kind === 'snow' ? Math.sin(time + i) * ts * 0.5 : -ts * 0.4;
    const px = x0 + slant * u * (kind === 'blizzard' ? 2.5 : 1);
    const py = cy - r + u * r * 2;
    if (kind === 'snow') {
      ctx.fillStyle = `rgba(255,255,255,${0.85 * env})`;
      ctx.fillRect(px, py, ts * 0.12 + hash(id, i) * 2, ts * 0.12 + hash(id, i) * 2);
    } else if (kind === 'blizzard') {
      ctx.strokeStyle = `rgba(255,255,255,${0.75 * env})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px - ts * 1.1, py - ts * 0.35);
      ctx.stroke();
    } else if (kind === 'acid') {
      ctx.strokeStyle = `rgba(190,240,60,${0.8 * env})`;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + ts * 0.15, py + ts * 0.65);
      ctx.stroke();
    } else if (kind === 'dust') {
      ctx.fillStyle = `rgba(190,140,70,${0.35 * env})`;
      ctx.beginPath();
      ctx.arc(px, cy + (hash(id, i + 3) - 0.5) * r, ts * 0.12, 0, TAU);
      ctx.fill();
    } else if (kind === 'blight') {
      ctx.fillStyle = `rgba(110,160,40,${0.4 * env})`;
      ctx.beginPath();
      ctx.arc(cx + (hash(id, i + 100) * 2 - 1) * r, cy + (hash(id, i + 50) * 2 - 1) * r - u * ts, ts * 0.14 + hash(id, i) * ts * 0.1, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
  if (kind === 'warm' || kind === 'cool') {
    add(ctx, () => {
      for (let i = 0; i < 18; i++) {
        const u = (time * 0.25 + hash(id, i)) % 1;
        const px = cx + (hash(id, i + 20) * 2 - 1) * r * 0.9;
        const py = cy + (hash(id, i + 60) * 2 - 1) * r * 0.9 - u * ts * 2 * (kind === 'warm' ? 1 : -1);
        star(ctx, px, py, ts * 0.18, kind === 'warm' ? '#ffb347' : '#a5e3ff', (1 - u) * 0.7 * env);
      }
    });
  }
}

function drawMeteorsEffect(ctx, e, ts, time, view) {
  for (const m of e.incoming) {
    const tx = (m.x + 0.5) * ts;
    const ty = (m.y + 0.5) * ts;
    if (!inView(view, tx, ty, ts * 14)) continue;
    const total = m.big ? 1.1 : 1.3;
    const u = clamp01(1 - m.eta / total);
    // warning ring on the ground
    ring(ctx, tx, ty, ts * m.r * (0.4 + 0.6 * u), '#ff5a1a', 0.35 + 0.4 * u, 1.5);
    drawMeteorStreak(ctx, tx, ty, u, ts * (m.big ? 1.6 : 0.8), ts);
  }
}

function drawMeteorStreak(ctx, tx, ty, u, size, ts) {
  const dist = ts * 26 * (1 - easeIn(u) * 0.98);
  const hx = tx + dist * 0.55;
  const hy = ty - dist;
  const trail = ts * 11;
  const tx2 = hx + trail * 0.55;
  const ty2 = hy - trail;
  add(ctx, () => {
    const g = ctx.createLinearGradient(hx, hy, tx2, ty2);
    g.addColorStop(0, 'rgba(255,200,90,0.95)');
    g.addColorStop(0.35, 'rgba(255,90,20,0.55)');
    g.addColorStop(1, 'rgba(255,60,10,0)');
    ctx.strokeStyle = g;
    ctx.lineCap = 'round';
    ctx.lineWidth = size;
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(tx2, ty2);
    ctx.stroke();
    ctx.lineCap = 'butt';
    glow(ctx, hx, hy, size * 3.2, '#ffb347', 0.95);
    glow(ctx, hx, hy, size * 1.4, '#ffffff', 1);
  });
  add(ctx, () => glow(ctx, hx, hy, size * 0.8, '#fff4c2', 1));
}

function drawBolt(ctx, v, ts) {
  const u = clamp01(v.age / v.life);
  const x = v.x * ts;
  const y = v.y * ts;
  const a = u < 0.15 ? 1 : Math.max(0, 1 - (u - 0.15) / 0.85);
  const seed = Math.floor((v.seed || 0.5) * 1000);
  const top = y - ts * 22;
  const sx = x + (hash(seed, 1) - 0.5) * ts * 6;
  // two-pass bolt: soft blue glow then white core
  for (const [w, col] of [[ts * 0.9, rgba('#7aa7ff', 0.35 * a)], [ts * 0.35, rgba('#c8dcff', 0.8 * a)], [Math.max(1.2, ts * 0.12), rgba('#ffffff', a)]]) {
    ctx.strokeStyle = col;
    ctx.lineWidth = w;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    jag(ctx, sx, top, x, y, seed, ts * 1.5, 14);
    ctx.stroke();
  }
  // a branch
  ctx.strokeStyle = rgba('#d8e6ff', 0.7 * a);
  ctx.lineWidth = Math.max(1, ts * 0.1);
  ctx.beginPath();
  const bx = x + (sx - x) * 0.45;
  const by = y + (top - y) * 0.45;
  jag(ctx, bx, by, bx + (hash(seed, 3) - 0.5) * ts * 7, by + ts * 5, seed + 5, ts * 0.8, 7);
  ctx.stroke();
  add(ctx, () => {
    glow(ctx, x, y, ts * 4.5 * (1.3 - u * 0.3), '#cfe0ff', 0.9 * a);
    if (v.flash || u < 0.2) glow(ctx, x, y, ts * 14, '#b7ccff', 0.28 * a);
  });
  // scorch mark
  ctx.fillStyle = rgba('#000000', 0.3 * (1 - u));
  ctx.beginPath();
  ctx.ellipse(x, y, ts * 0.9, ts * 0.5, 0, 0, TAU);
  ctx.fill();
}

function drawVisual(ctx, v, ts, time, view) {
  const cx = v.x * ts;
  const cy = v.y * ts;
  const R = (v.radius || 3) * ts;
  if (v.kind !== 'bolt' && v.kind !== 'meteor' && v.kind !== 'firebreath' && !inView(view, cx, cy, R * 2 + ts * 4)) return;
  const u = clamp01(v.age / v.life);
  const fade = 1 - u;
  const seed = Math.floor(v.x * 17 + v.y * 29);
  switch (v.kind) {
    case 'shockwave': {
      const e = easeOut(u);
      add(ctx, () => {
        ring(ctx, cx, cy, R * e, v.color || '#ffffff', fade * 0.9, ts * (0.5 + 0.7 * fade));
        ring(ctx, cx, cy, R * e * 0.8, v.color || '#ffffff', fade * 0.4, ts * 0.25);
        glow(ctx, cx, cy, R * 0.6 * (1 - u * 0.5), v.color || '#ffffff', 0.5 * fade * fade);
      });
      break;
    }
    case 'impact': {
      add(ctx, () => {
        glow(ctx, cx, cy, R * (0.4 + 0.6 * easeOut(Math.min(1, u * 3))), '#ffb347', 0.9 * Math.max(0, 1 - u * 2.5));
        ring(ctx, cx, cy, R * easeOut(u), '#ffe1a8', fade * 0.8, ts * 0.8 * fade + 1);
        ring(ctx, cx, cy, R * easeOut(u) * 0.7, '#ff7a1a', fade * 0.6, ts * 0.5);
      });
      // smoke column
      for (let i = 0; i < 8; i++) {
        const f = clamp01(u * 1.3 - i * 0.05);
        ctx.fillStyle = `rgba(45,38,34,${0.45 * (1 - f) * Math.min(1, u * 6)})`;
        ctx.beginPath();
        ctx.arc(cx + (hash(seed, i) - 0.5) * ts * 3, cy - f * ts * 5 - hash(seed, i + 9) * ts, ts * (0.9 + f * 1.4), 0, TAU);
        ctx.fill();
      }
      break;
    }
    case 'meteor': {
      drawMeteorStreak(ctx, cx, cy, u, ts * 1.6, ts);
      break;
    }
    case 'bolt':
      drawBolt(ctx, v, ts);
      break;
    case 'embers':
      add(ctx, () => {
        for (let i = 0; i < 40; i++) {
          const a = hash(seed, i) * TAU;
          const sp = (0.4 + hash(seed, i + 3)) * R;
          const t = u * (0.7 + hash(seed, i + 8) * 0.6);
          const px = cx + Math.cos(a) * sp * easeOut(t);
          const py = cy + Math.sin(a) * sp * easeOut(t) * 0.6 - Math.sin(Math.min(1, t) * Math.PI) * R * 0.7 + t * t * R * 0.5;
          ctx.fillStyle = rgba(i % 3 ? '#ff8a2a' : '#ffd27a', fade);
          ctx.fillRect(px - 1.2, py - 1.2, 2.4, 2.4);
        }
      });
      break;
    case 'sparkles':
      add(ctx, () => {
        const col = v.color || '#fde68a';
        for (let i = 0; i < 26; i++) {
          const a = hash(seed, i) * TAU;
          const d = Math.sqrt(hash(seed, i + 4)) * R;
          const t = (u * 1.4 + hash(seed, i + 9)) % 1;
          star(ctx, cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.7 - t * ts * 2.5, ts * (0.12 + hash(seed, i) * 0.16), col, Math.sin(t * Math.PI) * fade);
        }
        glow(ctx, cx, cy, R * 0.8, col, 0.25 * fade);
      });
      break;
    case 'godray':
      add(ctx, () => {
        const w = R * (0.5 + 0.5 * easeOut(Math.min(1, u * 4)));
        const a = Math.min(1, u * 5) * (u > 0.7 ? 1 - (u - 0.7) / 0.3 : 1);
        const col = v.color || '#fde68a';
        const g = ctx.createLinearGradient(0, cy - ts * 22, 0, cy);
        g.addColorStop(0, rgba(col, 0));
        g.addColorStop(0.7, rgba(col, 0.35 * a));
        g.addColorStop(1, rgba(col, 0.75 * a));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(cx - w * 0.5, cy - ts * 22);
        ctx.lineTo(cx + w * 0.5, cy - ts * 22);
        ctx.lineTo(cx + w * 0.9, cy);
        ctx.lineTo(cx - w * 0.9, cy);
        ctx.fill();
        // thin shafts
        for (let i = 0; i < 5; i++) {
          const o = (i - 2) * w * 0.3;
          const g2 = ctx.createLinearGradient(0, cy - ts * 22, 0, cy);
          g2.addColorStop(0, rgba('#ffffff', 0));
          g2.addColorStop(1, rgba('#ffffff', 0.35 * a * (0.6 + 0.4 * Math.sin(time * 2 + i))));
          ctx.fillStyle = g2;
          ctx.fillRect(cx + o - ts * 0.08, cy - ts * 22, ts * 0.16, ts * 22);
        }
        glow(ctx, cx, cy, w * 1.3, col, 0.7 * a);
        for (let i = 0; i < 14; i++) {
          const t = (time * 0.5 + hash(seed, i)) % 1;
          star(ctx, cx + (hash(seed, i + 3) - 0.5) * w * 1.4, cy - t * ts * 6, ts * 0.14, '#ffffff', a * (1 - t));
        }
      });
      break;
    case 'wave': {
      const e = easeOut(u);
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, R * (0.3 + 0.9 * e), 0, TAU);
      ctx.fillStyle = rgba('#38bdf8', 0.22 * fade);
      ctx.fill();
      ctx.strokeStyle = rgba('#e0f7ff', 0.85 * fade);
      ctx.lineWidth = ts * 0.4;
      ctx.beginPath();
      for (let i = 0; i <= 48; i++) {
        const a = (i / 48) * TAU;
        const rr = R * (0.3 + 0.9 * e) + Math.sin(a * 9 + time * 8) * ts * 0.25;
        const px = cx + Math.cos(a) * rr;
        const py = cy + Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.restore();
      break;
    }
    case 'implosion':
      add(ctx, () => {
        const rev = v.reverse;
        for (let i = 0; i < 4; i++) {
          const t = (u * 1.5 + i / 4) % 1;
          const rr = R * (rev ? t : 1 - t);
          ring(ctx, cx, cy, rr, v.color || '#8b5cf6', Math.sin(t * Math.PI) * 0.8, ts * 0.4);
        }
      });
      ctx.fillStyle = `rgba(8,0,20,${0.85 * Math.sin(u * Math.PI)})`;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.28 * Math.sin(u * Math.PI), 0, TAU);
      ctx.fill();
      break;
    case 'mist':
      for (let i = 0; i < 14; i++) {
        const a = hash(seed, i) * TAU;
        const d = Math.sqrt(hash(seed, i + 2)) * R * (0.5 + u * 0.5);
        ctx.fillStyle = rgba(v.color || '#4ade80', 0.18 * Math.sin(Math.min(1, u * 1.2) * Math.PI));
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.7 - u * ts, ts * (1 + hash(seed, i + 7) * 1.4), 0, TAU);
        ctx.fill();
      }
      break;
    case 'rain':
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, TAU);
      ctx.clip();
      for (let i = 0; i < 70; i++) {
        const t = (time * 1.8 + hash(seed, i)) % 1;
        const px = cx + (hash(seed, i + 3) * 2 - 1) * R;
        const py = cy - R + t * R * 2;
        ctx.strokeStyle = rgba('#8fd3ff', 0.75 * Math.sin(Math.min(1, u * 2) * Math.PI / 2) * fade * 1.4);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px - ts * 0.15, py + ts * 0.6);
        ctx.stroke();
      }
      ctx.restore();
      break;
    case 'spring':
      add(ctx, () => {
        for (let i = 0; i < 22; i++) {
          const t = (time * 1.2 + hash(seed, i)) % 1;
          const a = hash(seed, i + 4) * TAU;
          const d = t * R * 0.9;
          ctx.fillStyle = rgba('#bde8ff', (1 - t) * fade);
          ctx.beginPath();
          ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.5 - Math.sin(t * Math.PI) * ts * 2.4, ts * 0.12, 0, TAU);
          ctx.fill();
        }
        ring(ctx, cx, cy, R * easeOut(u), '#e0f7ff', fade * 0.8, ts * 0.3);
      });
      break;
    case 'leaves':
      for (let i = 0; i < 34; i++) {
        const t = (u * 1.3 + hash(seed, i)) % 1;
        const a = hash(seed, i + 2) * TAU;
        const d = Math.sqrt(hash(seed, i + 6)) * R;
        ctx.fillStyle = rgba(['#4ade80', '#22c55e', '#86efac', '#a3e635'][i % 4], Math.sin(t * Math.PI) * fade * 1.5);
        ctx.save();
        ctx.translate(cx + Math.cos(a) * d + Math.sin(t * 6 + i) * ts * 0.4, cy + Math.sin(a) * d * 0.7 - t * ts * 3);
        ctx.rotate(t * 5 + i);
        ctx.beginPath();
        ctx.ellipse(0, 0, ts * 0.22, ts * 0.1, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      break;
    case 'harvest':
      add(ctx, () => {
        for (let i = 0; i < 40; i++) {
          const t = (u * 1.3 + hash(seed, i)) % 1;
          const a = hash(seed, i + 2) * TAU;
          const d = Math.sqrt(hash(seed, i + 6)) * R;
          star(ctx, cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.7 - t * ts * 2.8, ts * 0.17, i % 2 ? '#fde047' : '#fbbf24', Math.sin(t * Math.PI) * fade * 1.4);
        }
        ring(ctx, cx, cy, R * easeOut(u), '#fde047', fade * 0.5, ts * 0.4);
      });
      break;
    case 'rot':
      for (let i = 0; i < 24; i++) {
        const t = (u * 1.4 + hash(seed, i)) % 1;
        const a = hash(seed, i + 2) * TAU;
        const d = Math.sqrt(hash(seed, i + 6)) * R;
        ctx.fillStyle = i % 3 ? rgba('#3f6212', 0.55 * Math.sin(t * Math.PI) * fade) : rgba('#1c1917', 0.5 * Math.sin(t * Math.PI) * fade);
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.7 - t * ts, ts * (0.2 + hash(seed, i) * 0.3), 0, TAU);
        ctx.fill();
      }
      break;
    case 'glint':
      add(ctx, () => {
        for (let i = 0; i < 16; i++) {
          const a = hash(seed, i) * TAU;
          const d = Math.sqrt(hash(seed, i + 3)) * R;
          const t = (u * 2 + hash(seed, i + 5)) % 1;
          star(ctx, cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8, ts * 0.5 * Math.sin(t * Math.PI), i % 2 ? '#e0f2fe' : '#fcd34d', fade);
        }
        ring(ctx, cx, cy, R * easeOut(u), '#fcd34d', fade * 0.5, ts * 0.3);
      });
      break;
    case 'resurrect':
      add(ctx, () => {
        const a = Math.sin(u * Math.PI);
        const g = ctx.createLinearGradient(0, cy - ts * 7, 0, cy + ts * 0.5);
        g.addColorStop(0, rgba('#fff7c2', 0));
        g.addColorStop(0.6, rgba('#fff7c2', 0.55 * a));
        g.addColorStop(1, rgba('#ffffff', 0.9 * a));
        ctx.fillStyle = g;
        ctx.fillRect(cx - ts * 0.9, cy - ts * 7, ts * 1.8, ts * 7.5);
        glow(ctx, cx, cy, ts * 3, '#fff7c2', 0.8 * a);
        ring(ctx, cx, cy + ts * 0.2, ts * 2.2 * easeOut(u), '#fff7c2', fade, ts * 0.3);
        for (let i = 0; i < 10; i++) {
          const t = (u + hash(seed, i)) % 1;
          star(ctx, cx + (hash(seed, i + 2) - 0.5) * ts * 2, cy - t * ts * 6, ts * 0.15, '#ffffff', a * (1 - t));
        }
      });
      break;
    case 'grow':
      add(ctx, () => {
        for (let i = 0; i < 3; i++) {
          const t = (u * 1.2 + i / 3) % 1;
          ring(ctx, cx, cy, ts * (v.reverse ? 2.2 * (1 - t) : 2.2 * t), v.reverse ? '#c084fc' : '#4ade80', (1 - t) * 0.9, ts * 0.22);
        }
      });
      break;
    case 'shapeshift':
      add(ctx, () => {
        for (let i = 0; i < 24; i++) {
          const a = hash(seed, i) * TAU + u * 8;
          const d = ts * 1.8 * (1 - u * 0.4) * (0.3 + hash(seed, i + 3));
          ctx.fillStyle = rgba(['#f472b6', '#60a5fa', '#a3e635', '#fbbf24', '#c084fc'][i % 5], fade);
          ctx.fillRect(cx + Math.cos(a) * d - 1.5, cy + Math.sin(a) * d * 0.8 - 1.5 - u * ts, 3, 3);
        }
        glow(ctx, cx, cy, ts * 2.2, '#c084fc', 0.5 * Math.sin(u * Math.PI));
      });
      break;
    case 'whirl':
      add(ctx, () => {
        for (let i = 0; i < 30; i++) {
          const t = (u * 1.5 + i / 30) % 1;
          const a = t * 14 + i;
          const d = R * (1 - t) * 0.9;
          ctx.fillStyle = rgba(i % 2 ? '#e0f2fe' : '#a5b4fc', Math.sin(t * Math.PI) * fade * 1.4);
          ctx.fillRect(cx + Math.cos(a) * d - 1.5, cy + Math.sin(a) * d * 0.6 - t * ts * 3 - 1.5, 3, 3);
        }
        ring(ctx, cx, cy, R * (0.4 + 0.6 * u), '#e0f2fe', fade * 0.6, ts * 0.25);
      });
      break;
    case 'fire_gift':
      add(ctx, () => {
        for (let i = 0; i < 4; i++) {
          const hh = ts * (2.6 + hash(seed, i) * 1.4) * Math.sin(Math.min(1, u * 1.5) * Math.PI / 2) * (u > 0.7 ? 1 - (u - 0.7) / 0.3 : 1);
          flame(ctx, cx + (i - 1.5) * ts * 0.45, cy + ts * 0.3, hh, ts * 0.8, time, seed + i);
          ctx.fillStyle = rgba(i % 2 ? '#ff7a1a' : '#ffc14d', 0.8);
          ctx.fill();
        }
        glow(ctx, cx, cy, ts * 4, '#ffb347', 0.5 * fade);
      });
      break;
    case 'firebreath': {
      const dx = (v.tx - v.x) * ts;
      const dy = (v.ty - v.y) * ts;
      const len = Math.hypot(dx, dy) || 1;
      const a0 = clamp01(u * 3) * (u > 0.7 ? 1 - (u - 0.7) / 0.3 : 1);
      add(ctx, () => {
        for (let i = 0; i < 40; i++) {
          const t = (hash(seed, i) + time * 2.5) % 1;
          const spread = t * ts * 1.4;
          const px = cx + (dx / len) * len * t * Math.min(1, u * 4) + (hash(seed, i + 4) - 0.5) * spread;
          const py = cy + (dy / len) * len * t * Math.min(1, u * 4) + (hash(seed, i + 8) - 0.5) * spread - ts * 0.7;
          glow(ctx, px, py, ts * (0.3 + t * 0.7), t < 0.4 ? '#ffe07a' : '#ff5a1a', 0.55 * a0 * (1 - t * 0.5));
        }
      });
      break;
    }
    default:
      break;
  }
}

function drawRainbow(ctx, e, ts, time) {
  const cx = (e.x + 0.5) * ts;
  const cy = (e.y + 0.5) * ts;
  const fade = Math.min(1, e.age / 2.5, (e.duration - e.age) / 4);
  const r = e.radius * ts * 0.9;
  const colors = ['#ef4444', '#f97316', '#facc15', '#4ade80', '#38bdf8', '#6366f1', '#a855f7'];
  const bw = ts * 0.42;
  ctx.save();
  ctx.lineCap = 'butt';
  for (let i = 0; i < colors.length; i++) {
    ctx.strokeStyle = rgba(colors[i], 0.55 * fade);
    ctx.lineWidth = bw + 0.5;
    ctx.beginPath();
    ctx.arc(cx, cy + r * 0.35, r - i * bw, Math.PI, TAU);
    ctx.stroke();
  }
  ctx.restore();
  add(ctx, () => {
    for (let i = 0; i < 18; i++) {
      const t = (time * 0.2 + hash(idNum(e.id), i)) % 1;
      const a = Math.PI + hash(idNum(e.id), i + 5) * Math.PI;
      star(ctx, cx + Math.cos(a) * (r - hash(idNum(e.id), i + 2) * bw * 7), cy + r * 0.35 + Math.sin(a) * (r - 3 * bw) - t * ts, ts * 0.12, '#ffffff', Math.sin(t * Math.PI) * fade);
    }
  });
}

function drawAurora(ctx, e, ts, time, view) {
  const cx = (e.x + 0.5) * ts;
  const cy = (e.y + 0.5) * ts;
  const fade = Math.min(1, e.age / 4, (e.duration - e.age) / 5);
  const w = e.radius * ts * 2.2;
  const top = cy - ts * 7;
  add(ctx, () => {
    for (let band = 0; band < 3; band++) {
      const col = ['#34d399', '#60a5fa', '#c084fc'][band];
      for (let i = 0; i < 44; i++) {
        const f = i / 43;
        const x = cx - w / 2 + f * w;
        const wave = Math.sin(f * 7 + time * 0.9 + band * 1.7) * ts * 1.6 + Math.sin(f * 15 - time * 1.4) * ts * 0.6;
        const h = ts * (4 + 3 * Math.sin(f * 5 + time * 0.5 + band)) * (0.5 + 0.5 * Math.sin(f * Math.PI));
        const y0 = top + band * ts * 1.1 + wave;
        const g = ctx.createLinearGradient(0, y0, 0, y0 + h);
        g.addColorStop(0, rgba(col, 0));
        g.addColorStop(0.25, rgba(col, 0.32 * fade));
        g.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = g;
        ctx.fillRect(x, y0, w / 43 + 1, h);
      }
    }
  });
}

function drawShield(ctx, e, ts, time) {
  const cx = (e.x + 0.5) * ts;
  const cy = (e.y + 0.5) * ts;
  const r = e.radius * ts;
  const fade = Math.min(1, e.age / 1, (e.duration - e.age) / 3);
  const flicker = e.duration - e.age < 5 ? 0.6 + 0.4 * Math.sin(time * 14) : 1;
  const a = fade * flicker;
  const g = ctx.createRadialGradient(cx, cy - r * 0.15, r * 0.1, cx, cy, r);
  g.addColorStop(0, rgba('#fff7c2', 0.04 * a));
  g.addColorStop(0.8, rgba('#fde047', 0.16 * a));
  g.addColorStop(1, rgba('#fbbf24', 0.5 * a));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.fill();
  add(ctx, () => {
    ring(ctx, cx, cy, r, '#fde68a', 0.9 * a, ts * 0.25);
    // rotating hex-ish lattice
    ctx.strokeStyle = rgba('#fff3b0', 0.32 * a);
    ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * TAU + time * 0.4;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r);
      ctx.stroke();
    }
    for (const k of [0.33, 0.66]) ring(ctx, cx, cy, r * k, '#fff3b0', 0.2 * a, 1);
    // highlight sweeping around the rim
    const s = time * 1.2;
    ctx.strokeStyle = rgba('#ffffff', 0.9 * a);
    ctx.lineWidth = ts * 0.2;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.97, s, s + 0.7);
    ctx.stroke();
  });
}

function drawGravity(ctx, e, ts, time) {
  const cx = (e.x + 0.5) * ts;
  const cy = (e.y + 0.5) * ts;
  const r = e.radius * ts;
  const fade = Math.min(1, e.age / 1, (e.duration - e.age) / 1.5);
  add(ctx, () => {
    for (let arm = 0; arm < 3; arm++) {
      for (let i = 0; i < 40; i++) {
        const t = (i / 40 + time * 0.25) % 1;
        const a = arm * (TAU / 3) + t * 9;
        const d = r * (1 - t);
        ctx.fillStyle = rgba(arm % 2 ? '#c4b5fd' : '#7dd3fc', Math.sin(t * Math.PI) * 0.9 * fade);
        ctx.fillRect(cx + Math.cos(a) * d - ts * 0.12, cy + Math.sin(a) * d * 0.7 - ts * 0.12, ts * 0.24, ts * 0.24);
      }
    }
    ring(ctx, cx, cy, r, '#a78bfa', 0.25 * fade, 1.5);
  });
  const core = ts * (0.9 + 0.2 * Math.sin(time * 6));
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, core * 2.2);
  g.addColorStop(0, `rgba(5,0,15,${0.95 * fade})`);
  g.addColorStop(0.5, `rgba(30,10,60,${0.7 * fade})`);
  g.addColorStop(1, 'rgba(60,20,120,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, core * 2.2, 0, TAU);
  ctx.fill();
}

function drawTimeBubble(ctx, e, ts, time) {
  const cx = (e.x + 0.5) * ts;
  const cy = (e.y + 0.5) * ts;
  const r = e.radius * ts;
  const fade = Math.min(1, e.age / 1, (e.duration - e.age) / 2);
  const g = ctx.createRadialGradient(cx, cy, r * 0.3, cx, cy, r);
  g.addColorStop(0, rgba('#67e8f9', 0.02 * fade));
  g.addColorStop(0.85, rgba('#22d3ee', 0.14 * fade));
  g.addColorStop(1, rgba('#a5f3fc', 0.45 * fade));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.fill();
  add(ctx, () => {
    ring(ctx, cx, cy, r, '#a5f3fc', 0.8 * fade, ts * 0.2);
    // clock hands that spin fast
    ctx.strokeStyle = rgba('#e0fbff', 0.8 * fade);
    ctx.lineCap = 'round';
    ctx.lineWidth = ts * 0.2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(time * 5) * r * 0.62, cy + Math.sin(time * 5) * r * 0.62);
    ctx.stroke();
    ctx.lineWidth = ts * 0.3;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(time * 0.9) * r * 0.4, cy + Math.sin(time * 0.9) * r * 0.4);
    ctx.stroke();
    ctx.lineCap = 'butt';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      ctx.fillStyle = rgba('#e0fbff', 0.7 * fade);
      ctx.fillRect(cx + Math.cos(a) * r * 0.88 - 1.5, cy + Math.sin(a) * r * 0.88 - 1.5, 3, 3);
    }
    for (let i = 0; i < 3; i++) {
      const u = (time * 0.6 + i / 3) % 1;
      ring(ctx, cx, cy, r * u, '#67e8f9', (1 - u) * 0.35 * fade, 1.5);
    }
  });
}

function drawAuraExtras(ctx, e, ts, time, view) {
  const cx = (e.x + 0.5) * ts;
  const cy = (e.y + 0.5) * ts;
  const r = e.radius * ts;
  if (!inView(view, cx, cy, r + ts * 12)) return;
  const id = idNum(e.id);
  const fade = Math.min(1, e.age / 1.5, (e.duration - e.age) / 3);
  switch (e.visual) {
    case 'healing':
      add(ctx, () => {
        for (let i = 0; i < 30; i++) {
          const t = (time * 0.45 + hash(id, i)) % 1;
          const a = hash(id, i + 3) * TAU;
          const d = Math.sqrt(hash(id, i + 8)) * r;
          star(ctx, cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.7 - t * ts * 3.5, ts * (0.12 + hash(id, i) * 0.15), i % 3 ? '#a5f3fc' : '#ffffff', Math.sin(t * Math.PI) * fade);
        }
        // a vertical column of light above the spring
        const g = ctx.createLinearGradient(0, cy - ts * 4, 0, cy);
        g.addColorStop(0, rgba('#bae6fd', 0));
        g.addColorStop(1, rgba('#bae6fd', 0.3 * fade));
        ctx.fillStyle = g;
        ctx.fillRect(cx - ts * 0.8, cy - ts * 4, ts * 1.6, ts * 4);
      });
      break;
    case 'shield':
      drawShield(ctx, e, ts, time);
      break;
    case 'fertility':
      add(ctx, () => {
        for (let i = 0; i < 26; i++) {
          const t = (time * 0.35 + hash(id, i)) % 1;
          const a = hash(id, i + 3) * TAU;
          const d = Math.sqrt(hash(id, i + 8)) * r;
          const hx = cx + Math.cos(a) * d + Math.sin(time + i) * ts * 0.3;
          const hy = cy + Math.sin(a) * d * 0.7 - t * ts * 2.5;
          ctx.fillStyle = rgba(i % 2 ? '#f9a8d4' : '#fde68a', Math.sin(t * Math.PI) * 0.9 * fade);
          // a tiny heart
          const s = ts * 0.1;
          ctx.beginPath();
          ctx.arc(hx - s, hy, s, 0, TAU);
          ctx.arc(hx + s, hy, s, 0, TAU);
          ctx.moveTo(hx - s * 2, hy + s * 0.3);
          ctx.lineTo(hx, hy + s * 2.4);
          ctx.lineTo(hx + s * 2, hy + s * 0.3);
          ctx.fill();
        }
      });
      break;
    case 'barren':
      for (let i = 0; i < 40; i++) {
        const t = (time * 0.2 + hash(id, i)) % 1;
        ctx.fillStyle = `rgba(150,145,140,${0.5 * (1 - t) * fade})`;
        ctx.fillRect(cx + (hash(id, i + 3) * 2 - 1) * r, cy - r * 0.6 + t * r * 1.3, 2, 2);
      }
      break;
    case 'madness':
      add(ctx, () => {
        for (let i = 0; i < 6; i++) {
          const a = hash(id, i) * TAU + time * 2;
          ctx.strokeStyle = rgba('#ef4444', 0.7 * fade);
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          jag(ctx, cx + Math.cos(a) * r * 0.2, cy + Math.sin(a) * r * 0.2, cx + Math.cos(a) * r * 0.95, cy + Math.sin(a) * r * 0.95, Math.floor(time * 8) + i, ts * 0.5, 7);
          ctx.stroke();
        }
        ring(ctx, cx, cy, r * (0.9 + 0.05 * Math.sin(time * 9)), '#ef4444', 0.5 * fade, ts * 0.2);
      });
      break;
    case 'haunt':
      for (let i = 0; i < 6; i++) {
        const t = (time * 0.18 + hash(id, i)) % 1;
        const a = hash(id, i + 3) * TAU + time * 0.3;
        const d = hash(id, i + 8) * r * 0.85;
        drawGhost(ctx, cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.7 - Math.sin(t * Math.PI) * ts, ts * (0.6 + hash(id, i) * 0.4), time + i, Math.sin(t * Math.PI) * 0.65 * fade);
      }
      break;
    case 'mushrooms':
      add(ctx, () => {
        for (let i = 0; i < 24; i++) {
          const t = (time * 0.3 + hash(id, i)) % 1;
          const a = hash(id, i + 3) * TAU;
          const d = Math.sqrt(hash(id, i + 8)) * r;
          ctx.fillStyle = rgba(['#f472b6', '#a78bfa', '#34d399', '#fbbf24', '#38bdf8'][i % 5], Math.sin(t * Math.PI) * 0.8 * fade);
          ctx.beginPath();
          ctx.arc(cx + Math.cos(a) * d + Math.sin(time * 2 + i) * ts * 0.4, cy + Math.sin(a) * d * 0.7 - t * ts * 3, ts * 0.12, 0, TAU);
          ctx.fill();
        }
      });
      break;
    case 'charm':
      add(ctx, () => {
        ring(ctx, cx, cy, r * (0.35 + 0.05 * Math.sin(time * 3)), '#f472b6', 0.5 * fade, ts * 0.2);
        for (let i = 0; i < 10; i++) {
          const t = (time * 0.35 + hash(id, i)) % 1;
          const a = (i / 10) * TAU + time * 0.8;
          ctx.fillStyle = rgba('#f472b6', Math.sin(t * Math.PI) * 0.85 * fade);
          const hx = cx + Math.cos(a) * r * 0.5;
          const hy = cy + Math.sin(a) * r * 0.35 - t * ts * 2;
          const s = ts * 0.12;
          ctx.beginPath();
          ctx.arc(hx - s, hy, s, 0, TAU);
          ctx.arc(hx + s, hy, s, 0, TAU);
          ctx.moveTo(hx - s * 2, hy + s * 0.3);
          ctx.lineTo(hx, hy + s * 2.4);
          ctx.lineTo(hx + s * 2, hy + s * 0.3);
          ctx.fill();
        }
      });
      break;
    case 'rainbow':
      drawRainbow(ctx, e, ts, time);
      break;
    case 'aurora':
      drawAurora(ctx, e, ts, time, view);
      break;
    case 'fireworks':
      add(ctx, () => {
        const burst = Math.floor(e.age / 0.9);
        for (let b = Math.max(0, burst - 2); b <= burst; b++) {
          const u = (e.age - b * 0.9) / 1.8;
          if (u < 0 || u > 1) continue;
          const bx = cx + (hash(id, b) * 2 - 1) * r * 0.8;
          const by = cy - ts * (3 + hash(id, b + 5) * 4);
          const col = ['#f472b6', '#fde047', '#60a5fa', '#4ade80', '#f97316'][(b + id) % 5];
          if (u < 0.12) {
            // the rocket climbing
            const k = u / 0.12;
            ctx.fillStyle = rgba('#fff7c2', 0.9);
            ctx.fillRect(bx - 1, cy - (cy - by) * k - 1, 2, 5);
            continue;
          }
          const k = (u - 0.12) / 0.88;
          for (let i = 0; i < 46; i++) {
            const a = (i / 46) * TAU;
            const sp = ts * (3.4 + hash(id + b, i) * 1.2) * easeOut(k);
            const px = bx + Math.cos(a) * sp;
            const py = by + Math.sin(a) * sp + k * k * ts * 2;
            ctx.fillStyle = rgba(i % 5 === 0 ? '#ffffff' : col, (1 - k) * 1.2);
            ctx.fillRect(px - 1.3, py - 1.3, 2.6, 2.6);
          }
          glow(ctx, bx, by, ts * 3 * (1 - k), col, 0.5 * (1 - k));
        }
      });
      break;
    default:
      break;
  }
}

function drawGhost(ctx, x, y, s, t, a) {
  ctx.fillStyle = rgba('#e0e7ff', a);
  ctx.beginPath();
  ctx.arc(x, y - s * 0.3, s * 0.45, Math.PI, 0);
  ctx.lineTo(x + s * 0.45, y + s * 0.5);
  for (let i = 0; i < 4; i++) ctx.lineTo(x + s * 0.45 - (i + 0.5) * s * 0.225, y + s * (0.5 + 0.12 * Math.sin(t * 6 + i)));
  ctx.lineTo(x - s * 0.45, y + s * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = rgba('#1e1b4b', a * 1.2);
  ctx.fillRect(x - s * 0.22, y - s * 0.38, s * 0.14, s * 0.2);
  ctx.fillRect(x + s * 0.08, y - s * 0.38, s * 0.14, s * 0.2);
}

function drawGuardian(ctx, e, ts, time) {
  const cx = (e.x + 0.5) * ts;
  const cy = (e.y + 0.5) * ts;
  const fade = Math.min(1, e.age / 1.5, (e.duration - e.age) / 3);
  add(ctx, () => {
    ring(ctx, cx, cy, e.radius * ts * (0.9 + 0.04 * Math.sin(time * 3)), '#fde68a', 0.35 * fade, ts * 0.15);
    for (let i = 0; i < 3; i++) {
      const a = time * 1.6 + (i / 3) * TAU;
      const ox = cx + Math.cos(a) * ts * 1.5;
      const oy = cy - ts * 1.2 + Math.sin(a) * ts * 0.6;
      glow(ctx, ox, oy, ts * 1.1, '#fff3b0', 0.9 * fade);
      glow(ctx, ox, oy, ts * 0.4, '#ffffff', fade);
      // wings
      ctx.fillStyle = rgba('#fff7c2', 0.55 * fade);
      ctx.beginPath();
      ctx.ellipse(ox - ts * 0.5, oy - ts * 0.1, ts * 0.5, ts * 0.18, -0.5 + Math.sin(time * 12 + i) * 0.3, 0, TAU);
      ctx.ellipse(ox + ts * 0.5, oy - ts * 0.1, ts * 0.5, ts * 0.18, 0.5 - Math.sin(time * 12 + i) * 0.3, 0, TAU);
      ctx.fill();
    }
  });
}

function drawGift(ctx, e, ts, time) {
  const cx = (e.x + 0.5) * ts;
  const cy = (e.y + 0.5) * ts;
  const fade = Math.min(1, e.age / 1.5, (e.duration - e.age) / 3);
  add(ctx, () => {
    for (let i = 0; i < 16; i++) {
      const t = (time * 0.5 + hash(idNum(e.id), i)) % 1;
      star(ctx, cx + (hash(idNum(e.id), i + 3) - 0.5) * ts * 4, cy - t * ts * 5, ts * 0.14, '#bae6fd', Math.sin(t * Math.PI) * fade);
    }
    glow(ctx, cx, cy, ts * 3, '#7dd3fc', 0.2 * fade);
  });
}

function drawStormClouds(ctx, e, ts, time, view) {
  const cx = (e.x + 0.5) * ts;
  const cy = (e.y + 0.5) * ts;
  const r = e.radius * ts;
  if (!inView(view, cx, cy, r)) return;
  const fade = Math.min(1, e.age / 2, (e.duration - e.age) / 3);
  ctx.fillStyle = `rgba(20,25,45,${0.28 * fade})`;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.fill();
  for (let i = 0; i < 12; i++) {
    const a = hash(idNum(e.id), i) * TAU + time * 0.05;
    const d = Math.sqrt(hash(idNum(e.id), i + 4)) * r * 0.8;
    ctx.fillStyle = `rgba(40,46,70,${0.28 * fade})`;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d - ts * 1.5, ts * (1.8 + hash(idNum(e.id), i) * 1.4), 0, TAU);
    ctx.fill();
  }
  // rain
  for (let i = 0; i < 60; i++) {
    const t = (time * 1.7 + hash(idNum(e.id), i + 40)) % 1;
    const px = cx + (hash(idNum(e.id), i + 90) * 2 - 1) * r;
    const py = cy - r * 0.6 + t * r * 1.2;
    if (Math.hypot(px - cx, py - cy) > r) continue;
    ctx.strokeStyle = `rgba(160,190,230,${0.5 * fade})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px - ts * 0.12, py + ts * 0.5);
    ctx.stroke();
  }
}

export function drawSkyFx(ctx, fx, ts, time, view) {
  for (const e of fx.list) {
    const cx = (e.x + 0.5) * ts;
    const cy = (e.y + 0.5) * ts;
    switch (e.type) {
      case 'tornado':
        if (inView(view, cx, cy - ts * 4, ts * 8)) drawTornado(ctx, e, ts, time);
        break;
      case 'wildfire':
        drawFlames(ctx, e, ts, time, view);
        break;
      case 'locusts':
        if (inView(view, cx, cy, ts * 6)) drawLocusts(ctx, e, ts, time);
        break;
      case 'climate':
        if (e.visual) drawStreaks(ctx, e, ts, time, view);
        break;
      case 'meteors':
        drawMeteorsEffect(ctx, e, ts, time, view);
        break;
      case 'lightning_storm':
        drawStormClouds(ctx, e, ts, time, view);
        break;
      case 'gravity':
        if (inView(view, cx, cy, e.radius * ts)) drawGravity(ctx, e, ts, time);
        break;
      case 'time_bubble':
        if (inView(view, cx, cy, e.radius * ts)) drawTimeBubble(ctx, e, ts, time);
        break;
      case 'aura':
        drawAuraExtras(ctx, e, ts, time, view);
        break;
      case 'guardian':
        if (inView(view, cx, cy, ts * 6)) drawGuardian(ctx, e, ts, time);
        break;
      case 'gift':
        if (inView(view, cx, cy, ts * 6)) drawGift(ctx, e, ts, time);
        break;
      default:
        break;
    }
  }
  for (const v of fx.visuals) {
    if (v.kind === 'crater' || v.kind === 'crack') continue;
    drawVisual(ctx, v, ts, time, view);
  }
}

// ======================================================================
// Creature status auras
// ======================================================================

export function drawStatusFx(ctx, entities, ts, time, view) {
  for (const ent of entities) {
    const s = ent.status;
    if (!s || !ent.alive) continue;
    const px = ent.x * ts;
    const py = ent.y * ts;
    if (!inView(view, px, py, ts * 3)) continue;
    const size = ts * 1.5 * ent.visualScale;
    const top = py - size * 0.85;
    const id = idNum(ent.id);
    if (s.shield > 0) {
      const a = Math.min(1, s.shield);
      ctx.fillStyle = rgba('#fde047', 0.14 * a);
      ctx.beginPath();
      ctx.ellipse(px, py - size * 0.3, size * 0.55, size * 0.62, 0, 0, TAU);
      ctx.fill();
      ring(ctx, px, py - size * 0.3, size * 0.58, '#fde68a', 0.8 * a, 1.5);
    }
    if (s.fertile > 0) add(ctx, () => glow(ctx, px, py - size * 0.3, size * 0.7, '#f9a8d4', 0.35 * Math.min(1, s.fertile)));
    if (s.joy > 0) {
      add(ctx, () => {
        for (let i = 0; i < 3; i++) {
          const t = (time * 1.2 + i / 3) % 1;
          star(ctx, px + Math.sin(t * 8 + i * 2) * size * 0.4, top - t * ts * 1.2, ts * 0.14, ['#fde047', '#f472b6', '#67e8f9'][i], 1 - t);
        }
      });
    }
    if (s.mad > 0) {
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = Math.max(1.5, ts * 0.12);
      const bx = px + size * 0.3;
      const by = top - ts * 0.1;
      ctx.beginPath();
      for (let k = 0; k < 4; k++) {
        const a = k * (Math.PI / 2) + 0.4;
        ctx.moveTo(bx + Math.cos(a) * ts * 0.1, by + Math.sin(a) * ts * 0.1);
        ctx.lineTo(bx + Math.cos(a) * ts * 0.3, by + Math.sin(a) * ts * 0.3);
      }
      ctx.stroke();
      add(ctx, () => glow(ctx, px, py - size * 0.4, size * 0.6, '#ef4444', 0.3 + 0.15 * Math.sin(time * 14)));
    }
    if (s.charm > 0) {
      const t = (time * 0.8 + hash(id, 1)) % 1;
      const hx = px;
      const hy = top - t * ts * 1.1;
      const q = ts * 0.13;
      ctx.fillStyle = rgba('#f472b6', 1 - t);
      ctx.beginPath();
      ctx.arc(hx - q, hy, q, 0, TAU);
      ctx.arc(hx + q, hy, q, 0, TAU);
      ctx.moveTo(hx - q * 2, hy + q * 0.3);
      ctx.lineTo(hx, hy + q * 2.4);
      ctx.lineTo(hx + q * 2, hy + q * 0.3);
      ctx.fill();
    }
    if (s.haunt > 0) drawGhost(ctx, px + size * 0.5, top, ts * 0.55, time + id, 0.5);
    if (s.shroom > 0) {
      add(ctx, () => {
        glow(ctx, px, py - size * 0.4, size * 0.7, ['#f472b6', '#a78bfa', '#34d399', '#fbbf24'][Math.floor(time * 4 + id) % 4], 0.35);
      });
    }
    if (s.burning > 0) {
      add(ctx, () => {
        for (let k = 0; k < 3; k++) {
          flame(ctx, px + (k - 1) * size * 0.25, py - size * 0.1, size * (0.45 + 0.2 * hash(id, k)), size * 0.3, time, id + k);
          ctx.fillStyle = rgba(k % 2 ? '#ff6a00' : '#ffc14d', 0.8);
          ctx.fill();
        }
      });
    }
    if (s.flung > 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 1.2;
      for (let k = 0; k < 3; k++) {
        const a = time * 12 + k * 2.1;
        ctx.beginPath();
        ctx.arc(px, py - size * 0.4, size * 0.5, a, a + 0.9);
        ctx.stroke();
      }
    }
  }
}

// ======================================================================
// Brush cursor
// ======================================================================

export function drawPowerCursor(ctx, hover, power, ts, time, color = '#38bdf8') {
  if (!hover || !power || !power.radius) return;
  const cx = (hover.x + 0.5) * ts;
  const cy = (hover.y + 0.5) * ts;
  const r = power.radius * ts;
  ctx.save();
  ctx.fillStyle = rgba(color, 0.07);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = rgba(color, 0.85);
  ctx.lineWidth = 1.5;
  ctx.setLineDash([ts * 0.6, ts * 0.45]);
  ctx.lineDashOffset = -time * ts * 1.2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = rgba(color, 0.9);
  ctx.beginPath();
  ctx.moveTo(cx - ts * 0.4, cy);
  ctx.lineTo(cx + ts * 0.4, cy);
  ctx.moveTo(cx, cy - ts * 0.4);
  ctx.lineTo(cx, cy + ts * 0.4);
  ctx.stroke();
  ctx.restore();
}
