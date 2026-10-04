// Power icons, drawn with canvas paths in the game's palette (no emoji, no image files).
// Every icon is drawn on a 32x32 grid by a small function; drawPowerIcon(ctx, id, size) scales it.
// makePowerIcon(id, size) returns a ready <canvas> for the palette.
const TAU = Math.PI * 2;

const C = {
  gold: '#f59e0b', goldLt: '#fde68a', cyan: '#38bdf8', cyanLt: '#bae6fd', blue: '#2563eb', purple: '#c084fc',
  purpleDk: '#6d28d9', red: '#ef4444', orange: '#fb923c', orangeDk: '#ea580c', green: '#4ade80', greenDk: '#15803d',
  slate: '#94a3b8', slateDk: '#475569', white: '#f8fafc', brown: '#a16207', pink: '#f472b6', ink: '#0f172a', lime: '#a3e635'
};

const fill = (g, color) => { g.fillStyle = color; g.fill(); };
const stroke = (g, color, w = 2) => { g.strokeStyle = color; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke(); };
const poly = (g, pts, close = true) => {
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  if (close) g.closePath();
};
const circle = (g, x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, TAU); };
const line = (g, x1, y1, x2, y2, color, w = 2) => { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); stroke(g, color, w); };
const sparkle = (g, x, y, r, color) => {
  g.beginPath();
  g.moveTo(x, y - r);
  g.quadraticCurveTo(x, y, x + r, y);
  g.quadraticCurveTo(x, y, x, y + r);
  g.quadraticCurveTo(x, y, x - r, y);
  g.quadraticCurveTo(x, y, x, y - r);
  fill(g, color);
};
const cloud = (g, color, y = 0) => {
  g.beginPath();
  g.arc(10, 15 + y, 5, Math.PI * 0.5, Math.PI * 1.5);
  g.arc(16, 10 + y, 6, Math.PI, 0);
  g.arc(22.5, 14 + y, 5, Math.PI * 1.5, Math.PI * 0.5);
  g.closePath();
  fill(g, color);
};
const drop = (g, x, y, s, color) => {
  g.beginPath();
  g.moveTo(x, y - s * 1.3);
  g.quadraticCurveTo(x + s, y, x, y + s * 0.8);
  g.quadraticCurveTo(x - s, y, x, y - s * 1.3);
  fill(g, color);
};
const flame = (g, x, y, h, w, c1, c2) => {
  g.beginPath();
  g.moveTo(x, y - h);
  g.bezierCurveTo(x + w * 0.2, y - h * 0.65, x + w, y - h * 0.5, x + w * 0.8, y - h * 0.15);
  g.bezierCurveTo(x + w * 0.6, y + h * 0.1, x - w * 0.6, y + h * 0.1, x - w * 0.8, y - h * 0.15);
  g.bezierCurveTo(x - w, y - h * 0.5, x - w * 0.15, y - h * 0.55, x, y - h);
  fill(g, c1);
  g.beginPath();
  g.moveTo(x, y - h * 0.5);
  g.bezierCurveTo(x + w * 0.5, y - h * 0.25, x + w * 0.45, y + h * 0.05, x, y + h * 0.05);
  g.bezierCurveTo(x - w * 0.45, y + h * 0.05, x - w * 0.5, y - h * 0.25, x, y - h * 0.5);
  fill(g, c2);
};
const snowflake = (g, cx, cy, r, color, w = 2) => {
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI;
    line(g, cx + Math.cos(a) * r, cy + Math.sin(a) * r, cx - Math.cos(a) * r, cy - Math.sin(a) * r, color, w);
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    const bx = cx + Math.cos(a) * r * 0.65;
    const by = cy + Math.sin(a) * r * 0.65;
    line(g, bx, by, bx + Math.cos(a + 0.8) * r * 0.3, by + Math.sin(a + 0.8) * r * 0.3, color, w * 0.75);
    line(g, bx, by, bx + Math.cos(a - 0.8) * r * 0.3, by + Math.sin(a - 0.8) * r * 0.3, color, w * 0.75);
  }
};
const person = (g, x, y, s, color) => {
  circle(g, x, y - 6 * s, 3 * s);
  fill(g, color);
  g.beginPath();
  g.moveTo(x - 4 * s, y + 8 * s);
  g.quadraticCurveTo(x - 4 * s, y - 2 * s, x, y - 2 * s);
  g.quadraticCurveTo(x + 4 * s, y - 2 * s, x + 4 * s, y + 8 * s);
  g.closePath();
  fill(g, color);
};
const arrow = (g, x, y, up, color) => {
  poly(g, [[x, y + (up ? -5 : 5)], [x - 4, y + (up ? 0 : 0)], [x - 1.6, y + (up ? 0 : 0)], [x - 1.6, y + (up ? 5 : -5)], [x + 1.6, y + (up ? 5 : -5)], [x + 1.6, y], [x + 4, y]]);
  fill(g, color);
};
const heart = (g, x, y, s, color) => {
  g.beginPath();
  g.moveTo(x, y + 6 * s);
  g.bezierCurveTo(x - 10 * s, y - 1 * s, x - 6 * s, y - 9 * s, x, y - 3 * s);
  g.bezierCurveTo(x + 6 * s, y - 9 * s, x + 10 * s, y - 1 * s, x, y + 6 * s);
  fill(g, color);
};

const ICONS = {
  INSPECT(g) {
    g.beginPath();
    g.moveTo(3, 16);
    g.quadraticCurveTo(16, 3, 29, 16);
    g.quadraticCurveTo(16, 29, 3, 16);
    fill(g, 'rgba(56,189,248,0.18)');
    stroke(g, C.cyan, 2);
    circle(g, 16, 16, 6);
    fill(g, C.cyan);
    circle(g, 16, 16, 2.8);
    fill(g, C.ink);
    circle(g, 18, 14, 1.4);
    fill(g, C.white);
  },
  PAN(g) {
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const tx = 16 + dx * 12;
      const ty = 16 + dy * 12;
      line(g, 16 + dx * 3, 16 + dy * 3, tx, ty, C.white, 2.2);
      poly(g, [[tx + dx * 3, ty + dy * 3], [tx - dy * 3 - dx * 1, ty + dx * 3 - dy * 1], [tx + dy * 3 - dx * 1, ty - dx * 3 - dy * 1]]);
      fill(g, C.white);
    }
    circle(g, 16, 16, 2.6);
    fill(g, C.cyan);
  },
  TERRAFORM_RAISE(g) {
    poly(g, [[2, 27], [12, 8], [18, 18], [22, 12], [30, 27]]);
    fill(g, '#78716c');
    poly(g, [[12, 8], [9.5, 13], [12, 12], [14, 14]]);
    fill(g, C.white);
    poly(g, [[22, 12], [20.5, 15], [22, 14.5], [23.5, 15.5]]);
    fill(g, C.white);
    poly(g, [[2, 27], [30, 27], [30, 29], [2, 29]]);
    fill(g, '#57534e');
    arrow(g, 26, 8, true, C.green);
  },
  TERRAFORM_LOWER(g) {
    poly(g, [[3, 9], [29, 9], [24, 22], [8, 22]]);
    fill(g, '#78716c');
    poly(g, [[7, 12], [25, 12], [22, 20], [10, 20]]);
    fill(g, C.blue);
    g.beginPath();
    g.moveTo(9, 15);
    g.quadraticCurveTo(12, 13, 15, 15);
    g.quadraticCurveTo(18, 17, 21, 15);
    stroke(g, C.cyanLt, 1.5);
    arrow(g, 16, 26, false, C.red);
  },
  TSUNAMI(g) {
    g.beginPath();
    g.moveTo(2, 26);
    g.bezierCurveTo(4, 12, 12, 4, 22, 5);
    g.bezierCurveTo(28, 6, 29, 12, 24, 13);
    g.bezierCurveTo(21, 14, 19, 12, 21, 10);
    g.bezierCurveTo(14, 10, 11, 18, 14, 26);
    g.closePath();
    fill(g, C.cyan);
    g.beginPath();
    g.moveTo(2, 26);
    g.bezierCurveTo(4, 14, 10, 8, 17, 7);
    g.bezierCurveTo(10, 11, 8, 19, 9, 26);
    g.closePath();
    fill(g, C.blue);
    for (const [x, y] of [[24, 8], [27, 11], [22, 5]]) { circle(g, x, y, 1.1); fill(g, C.white); }
    poly(g, [[2, 26], [30, 26], [30, 29], [2, 29]]);
    fill(g, C.blue);
  },
  VOLCANO(g) {
    poly(g, [[3, 28], [12, 12], [20, 12], [29, 28]]);
    fill(g, '#57534e');
    poly(g, [[12, 12], [20, 12], [18.5, 15], [16, 13], [13.5, 15]]);
    fill(g, C.orange);
    g.beginPath();
    g.moveTo(16, 13);
    g.quadraticCurveTo(14, 20, 15.5, 28);
    g.lineTo(18, 28);
    g.quadraticCurveTo(18.5, 20, 16, 13);
    fill(g, C.red);
    for (const [x, y, r] of [[13, 7, 3], [17, 4, 3.5], [21, 8, 2.5]]) { circle(g, x, y, r); fill(g, 'rgba(148,163,184,0.75)'); }
    for (const [x, y] of [[9, 8], [24, 4]]) { circle(g, x, y, 1.3); fill(g, C.orange); }
  },
  EARTHQUAKE(g) {
    poly(g, [[2, 14], [14, 14], [12, 18], [15, 22], [11, 30], [2, 30]]);
    fill(g, '#78716c');
    poly(g, [[30, 11], [18, 11], [20, 16], [17, 20], [20, 25], [30, 25]]);
    fill(g, '#a8a29e');
    g.beginPath();
    g.moveTo(14, 14); g.lineTo(18, 11); g.lineTo(20, 16); g.lineTo(17, 20); g.lineTo(20, 25); g.lineTo(15, 22); g.lineTo(12, 18);
    fill(g, C.ink);
    line(g, 4, 6, 8, 4, C.orange, 1.8);
    line(g, 8, 4, 12, 7, C.orange, 1.8);
    line(g, 20, 5, 24, 3, C.orange, 1.8);
    line(g, 24, 3, 28, 6, C.orange, 1.8);
  },
  LAVA_FLOW(g) {
    poly(g, [[2, 20], [11, 5], [18, 5], [24, 14], [30, 14], [30, 30], [2, 30]]);
    fill(g, '#57534e');
    g.beginPath();
    g.moveTo(14, 5);
    g.bezierCurveTo(12, 14, 18, 16, 16, 22);
    g.bezierCurveTo(15, 27, 22, 26, 22, 30);
    g.lineTo(28, 30);
    g.bezierCurveTo(28, 22, 20, 22, 21, 16);
    g.bezierCurveTo(22, 11, 17, 8, 17, 5);
    fill(g, C.orange);
    g.beginPath();
    g.moveTo(15.5, 6);
    g.bezierCurveTo(14, 14, 19, 16, 18, 22);
    stroke(g, '#fde68a', 1.5);
  },
  SPRING(g) {
    drop(g, 16, 11, 6.5, C.cyan);
    drop(g, 14, 9, 2, C.cyanLt);
    g.beginPath();
    g.moveTo(3, 24);
    g.quadraticCurveTo(8, 20, 13, 24);
    g.quadraticCurveTo(18, 28, 23, 24);
    g.quadraticCurveTo(26, 22, 29, 24);
    stroke(g, C.blue, 2.5);
    g.beginPath();
    g.moveTo(6, 29);
    g.quadraticCurveTo(11, 26, 16, 29);
    g.quadraticCurveTo(21, 32, 26, 29);
    stroke(g, C.cyan, 2);
    sparkle(g, 26, 8, 3, C.white);
  },
  DIVINE_RAIN(g) {
    cloud(g, C.slate, -1);
    for (const [x, y] of [[9, 22], [15, 25], [21, 22], [12, 29], [18, 29]]) drop(g, x, y, 2, C.cyan);
    sparkle(g, 26, 22, 3, C.goldLt);
  },
  PLANT_FOREST(g) {
    for (const [x, y, s] of [[10, 25, 1], [22, 25, 1.1], [16, 22, 1.3]]) {
      line(g, x, y, x, y + 4 * s, C.brown, 2);
      for (let i = 0; i < 3; i++) {
        poly(g, [[x, y - 11 * s + i * 4.5 * s], [x + (4 + i * 1.6) * s, y - 4 * s + i * 4 * s - 1], [x - (4 + i * 1.6) * s, y - 4 * s + i * 4 * s - 1]]);
        fill(g, i % 2 ? C.green : C.greenDk);
      }
    }
  },
  WARM_CLIMATE(g) {
    circle(g, 16, 16, 6);
    fill(g, C.gold);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      line(g, 16 + Math.cos(a) * 9, 16 + Math.sin(a) * 9, 16 + Math.cos(a) * 12.5, 16 + Math.sin(a) * 12.5, C.orange, 2);
    }
    circle(g, 16, 16, 3.4);
    fill(g, C.goldLt);
    arrow(g, 27, 26, true, C.red);
  },
  COOL_CLIMATE(g) {
    snowflake(g, 16, 16, 11, C.cyanLt, 2);
    circle(g, 16, 16, 2.4);
    fill(g, C.white);
    arrow(g, 27, 26, false, C.cyan);
  },
  CLEAR_SKIES(g) {
    circle(g, 13, 12, 6);
    fill(g, C.gold);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      line(g, 13 + Math.cos(a) * 8.5, 12 + Math.sin(a) * 8.5, 13 + Math.cos(a) * 11, 12 + Math.sin(a) * 11, C.goldLt, 1.8);
    }
    cloud(g, C.white, 10);
    sparkle(g, 26, 8, 3, C.cyanLt);
  },
  RAINBOW(g) {
    ['#ef4444', '#f59e0b', '#facc15', '#4ade80', '#38bdf8', '#a855f7'].forEach((col, i) => {
      g.beginPath();
      g.arc(16, 25, 13 - i * 2, Math.PI, TAU);
      stroke(g, col, 2.1);
    });
    circle(g, 4, 26, 3); fill(g, C.white);
    circle(g, 28, 26, 3); fill(g, C.white);
  },
  AURORA(g) {
    [['#34d399', 9], ['#60a5fa', 15], ['#c084fc', 21]].forEach(([col, y], i) => {
      g.beginPath();
      g.moveTo(3, y + 4);
      g.bezierCurveTo(9, y - 6 + i, 14, y + 8, 20, y - 2);
      g.bezierCurveTo(24, y - 8, 27, y, 29, y - 2);
      stroke(g, col, 3.4);
    });
    for (const [x, y] of [[6, 5], [24, 4], [27, 26]]) sparkle(g, x, y, 2, C.white);
  },
  MAGIC_MUSHROOMS(g) {
    g.beginPath();
    g.moveTo(14, 27); g.lineTo(14.5, 17); g.lineTo(19.5, 17); g.lineTo(20, 27);
    g.closePath();
    fill(g, C.goldLt);
    g.beginPath();
    g.ellipse(17, 16, 11, 8, 0, Math.PI, 0);
    g.closePath();
    fill(g, C.pink);
    for (const [x, y, r] of [[12, 13, 1.8], [17, 9.5, 2], [22, 13, 1.6]]) { circle(g, x, y, r); fill(g, C.white); }
    sparkle(g, 5, 8, 3, C.purple);
    sparkle(g, 28, 7, 2.2, C.cyan);
  },
  BLESSING(g) {
    sparkle(g, 16, 16, 12, C.goldLt);
    sparkle(g, 16, 16, 7, C.white);
    sparkle(g, 6, 7, 3.5, C.cyan);
    sparkle(g, 26, 24, 3.5, C.cyan);
  },
  INSPIRATION(g) {
    circle(g, 16, 13, 8);
    fill(g, C.goldLt);
    g.beginPath();
    g.moveTo(12, 19); g.lineTo(12, 24); g.lineTo(20, 24); g.lineTo(20, 19);
    fill(g, C.slate);
    line(g, 13, 27, 19, 27, C.slateDk, 2.2);
    g.beginPath();
    g.moveTo(13, 14); g.lineTo(16, 18); g.lineTo(19, 14);
    stroke(g, C.gold, 1.6);
    for (let i = 0; i < 5; i++) {
      const a = Math.PI * (1.15 + i * 0.175);
      line(g, 16 + Math.cos(a) * 11, 13 + Math.sin(a) * 11, 16 + Math.cos(a) * 14, 13 + Math.sin(a) * 14, C.gold, 1.8);
    }
  },
  BOUNTIFUL_HARVEST(g) {
    for (let i = -2; i <= 2; i++) {
      line(g, 16, 28, 16 + i * 5, 8 + Math.abs(i) * 1.5, C.brown, 1.4);
      for (let k = 0; k < 4; k++) {
        const px = 16 + i * 5 * (1 - k * 0.1) + (i > 0 ? 1 : -1) * 1.2;
        g.beginPath();
        g.ellipse(16 + i * (5 - k * 0.2) * (1 - 0.05 * k) + (i === 0 ? 0 : 0), 9 + Math.abs(i) * 1.6 + k * 2.6, 1.7, 2.7, i * 0.25, 0, TAU);
        fill(g, k % 2 ? C.gold : C.goldLt);
        void px;
      }
    }
    line(g, 9, 24, 23, 24, C.green, 2.4);
  },
  HEALING_SPRING(g) {
    g.beginPath();
    g.ellipse(16, 24, 12, 5, 0, 0, TAU);
    fill(g, C.cyan);
    g.beginPath();
    g.ellipse(16, 23, 8, 2.6, 0, 0, TAU);
    fill(g, C.cyanLt);
    poly(g, [[13.5, 5], [18.5, 5], [18.5, 10], [23.5, 10], [23.5, 15], [18.5, 15], [18.5, 20], [13.5, 20], [13.5, 15], [8.5, 15], [8.5, 10], [13.5, 10]]);
    fill(g, C.green);
    poly(g, [[14.5, 6.5], [17.5, 6.5], [17.5, 11.5], [22, 11.5], [22, 13.5], [17.5, 13.5], [17.5, 18.5], [14.5, 18.5], [14.5, 13.5], [10, 13.5], [10, 11.5], [14.5, 11.5]]);
    fill(g, '#bbf7d0');
  },
  DIVINE_SHIELD(g) {
    g.beginPath();
    g.moveTo(16, 3);
    g.lineTo(27, 7);
    g.quadraticCurveTo(27, 21, 16, 29);
    g.quadraticCurveTo(5, 21, 5, 7);
    g.closePath();
    fill(g, C.gold);
    g.beginPath();
    g.moveTo(16, 6);
    g.lineTo(24, 9);
    g.quadraticCurveTo(24, 19, 16, 26);
    g.quadraticCurveTo(8, 19, 8, 9);
    g.closePath();
    fill(g, C.cyan);
    g.beginPath();
    g.moveTo(16, 6); g.lineTo(24, 9); g.quadraticCurveTo(24, 19, 16, 26); g.closePath();
    fill(g, C.blue);
    sparkle(g, 16, 15, 5, C.white);
  },
  FERTILITY_BLESSING(g) {
    heart(g, 16, 15, 1.6, C.pink);
    heart(g, 13, 12, 0.5, C.white);
    line(g, 16, 26, 16, 30, C.green, 2);
    g.beginPath();
    g.ellipse(12, 28, 3.4, 1.7, -0.5, 0, TAU);
    fill(g, C.green);
    g.beginPath();
    g.ellipse(20, 28, 3.4, 1.7, 0.5, 0, TAU);
    fill(g, C.green);
    sparkle(g, 27, 6, 3, C.goldLt);
  },
  GIFT_OF_FIRE(g) {
    flame(g, 16, 28, 25, 11, C.orangeDk, C.orange);
    flame(g, 16, 28, 14, 6, C.gold, C.goldLt);
    sparkle(g, 26, 8, 3, C.goldLt);
    sparkle(g, 6, 12, 2.5, C.goldLt);
  },
  GIFT_OF_TOOLS(g) {
    const cx = 16;
    const cy = 16;
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a0 = (i / 8) * TAU;
      const a1 = a0 + TAU / 16;
      const a2 = a0 + TAU / 8 - TAU / 32;
      const R2 = 12.5;
      const r2 = 9.5;
      g.lineTo(cx + Math.cos(a0) * r2, cy + Math.sin(a0) * r2);
      g.lineTo(cx + Math.cos(a0 + 0.06) * R2, cy + Math.sin(a0 + 0.06) * R2);
      g.lineTo(cx + Math.cos(a1) * R2, cy + Math.sin(a1) * R2);
      g.lineTo(cx + Math.cos(a2) * r2, cy + Math.sin(a2) * r2);
    }
    g.closePath();
    fill(g, C.slate);
    circle(g, cx, cy, 4.5);
    fill(g, C.ink);
    circle(g, cx, cy, 2);
    fill(g, C.goldLt);
    sparkle(g, 26, 6, 3, C.goldLt);
  },
  REVEAL_ORE(g) {
    poly(g, [[16, 3], [27, 13], [16, 29], [5, 13]]);
    fill(g, C.cyan);
    poly(g, [[16, 3], [27, 13], [16, 13]]);
    fill(g, C.cyanLt);
    poly(g, [[16, 13], [27, 13], [16, 29]]);
    fill(g, C.blue);
    poly(g, [[5, 13], [16, 13], [16, 3]]);
    fill(g, '#7dd3fc');
    sparkle(g, 24, 5, 3, C.white);
    sparkle(g, 6, 24, 2.5, C.goldLt);
  },
  RESURRECTION(g) {
    // ankh with rays of light
    g.beginPath();
    g.ellipse(16, 10, 5, 6.5, 0, 0, TAU);
    stroke(g, C.goldLt, 3);
    line(g, 16, 16, 16, 29, C.goldLt, 3);
    line(g, 9, 20, 23, 20, C.goldLt, 3);
    for (let i = 0; i < 5; i++) {
      const a = Math.PI * (1.1 + i * 0.2);
      line(g, 16 + Math.cos(a) * 12, 10 + Math.sin(a) * 12, 16 + Math.cos(a) * 15, 10 + Math.sin(a) * 15, C.gold, 1.6);
    }
  },
  GUARDIAN_SPIRIT(g) {
    circle(g, 16, 17, 4.5);
    fill(g, C.white);
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(16 + s * 4, 16);
      g.bezierCurveTo(16 + s * 10, 4, 16 + s * 14, 9, 16 + s * 13, 14);
      g.bezierCurveTo(16 + s * 12, 18, 16 + s * 9, 20, 16 + s * 5, 20);
      fill(g, C.goldLt);
      g.beginPath();
      g.moveTo(16 + s * 5, 18);
      g.bezierCurveTo(16 + s * 9, 11, 16 + s * 11, 12, 16 + s * 10, 15);
      stroke(g, C.gold, 1.2);
    }
    g.beginPath();
    g.ellipse(16, 8, 4, 1.4, 0, 0, TAU);
    stroke(g, C.gold, 1.6);
  },
  PROPHET(g) {
    circle(g, 16, 7, 4);
    stroke(g, C.goldLt, 1.6);
    person(g, 16, 18, 1.1, C.slate);
    line(g, 25, 7, 25, 29, C.brown, 2);
    circle(g, 25, 6, 2.2);
    fill(g, C.goldLt);
    for (let i = 0; i < 4; i++) {
      const a = Math.PI * (1.15 + i * 0.23);
      line(g, 16 + Math.cos(a) * 9, 9 + Math.sin(a) * 9, 16 + Math.cos(a) * 13, 9 + Math.sin(a) * 13, C.gold, 1.4);
    }
  },
  PLAGUE(g) {
    circle(g, 16, 16, 12);
    fill(g, 'rgba(34,197,94,0.25)');
    stroke(g, C.green, 1.6);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU - Math.PI / 2;
      circle(g, 16 + Math.cos(a) * 7.5, 16 + Math.sin(a) * 7.5, 4.2);
      fill(g, C.lime);
      circle(g, 16 + Math.cos(a) * 7.5, 16 + Math.sin(a) * 7.5, 1.8);
      fill(g, C.greenDk);
    }
    circle(g, 16, 16, 2.6);
    fill(g, C.greenDk);
    for (const [x, y] of [[5, 6], [27, 26]]) { circle(g, x, y, 1.5); fill(g, C.lime); }
  },
  LIGHTNING(g) {
    poly(g, [[19, 2], [7, 18], [14, 18], [11, 30], [25, 12], [17, 12]]);
    fill(g, C.goldLt);
    poly(g, [[19, 2], [12, 15], [16, 15], [15, 22], [22, 12], [16.5, 12]]);
    fill(g, C.gold);
    sparkle(g, 26, 25, 2.5, C.cyanLt);
    sparkle(g, 5, 8, 2.5, C.cyanLt);
  },
  TORNADO(g) {
    [[3, 7, 26], [6, 12, 21], [9, 17, 15], [12, 22, 9], [14.5, 27, 4]].forEach(([x, y, w], i) => {
      g.beginPath();
      g.ellipse(16, y, w / 2, 2.4, 0, 0, TAU);
      fill(g, i % 2 ? C.slate : '#cbd5e1');
      void x;
    });
    for (const [x, y] of [[4, 4], [27, 11], [6, 21], [28, 5]]) { g.fillStyle = C.brown; g.fillRect(x, y, 2.4, 1.6); }
  },
  WILDFIRE(g) {
    flame(g, 10, 28, 17, 7, C.red, C.orange);
    flame(g, 22, 28, 14, 6, C.red, C.orange);
    flame(g, 16, 28, 26, 11, C.orangeDk, C.gold);
    flame(g, 16, 28, 13, 5.5, C.gold, C.goldLt);
  },
  BLIZZARD(g) {
    cloud(g, C.slate, -2);
    for (const [x, y, l] of [[8, 20, 4], [14, 24, 5], [20, 20, 4], [26, 25, 4], [10, 29, 3], [22, 29, 4]]) {
      line(g, x, y, x - l, y + l * 0.35, C.white, 1.8);
    }
    sparkle(g, 26, 18, 2.5, C.cyanLt);
  },
  ICE_AGE(g) {
    poly(g, [[16, 3], [22, 12], [20, 28], [12, 28], [10, 12]]);
    fill(g, C.cyan);
    poly(g, [[16, 3], [22, 12], [16, 14]]);
    fill(g, C.cyanLt);
    poly(g, [[10, 12], [16, 14], [12, 28]]);
    fill(g, '#7dd3fc');
    poly(g, [[3, 28], [7, 18], [11, 28]]);
    fill(g, C.cyanLt);
    poly(g, [[21, 28], [26, 16], [29, 28]]);
    fill(g, C.cyanLt);
    sparkle(g, 26, 6, 3, C.white);
  },
  DROUGHT(g) {
    poly(g, [[2, 20], [30, 20], [30, 30], [2, 30]]);
    fill(g, '#a16207');
    g.beginPath();
    g.moveTo(5, 21); g.lineTo(9, 24); g.lineTo(7, 28); g.moveTo(16, 21); g.lineTo(14, 25); g.lineTo(18, 29);
    g.moveTo(24, 21); g.lineTo(26, 25); g.lineTo(23, 29);
    stroke(g, C.ink, 1.6);
    circle(g, 16, 11, 5);
    fill(g, C.orange);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      line(g, 16 + Math.cos(a) * 7.5, 11 + Math.sin(a) * 7.5, 16 + Math.cos(a) * 10, 11 + Math.sin(a) * 10, C.gold, 1.8);
    }
  },
  LOCUSTS(g) {
    g.beginPath();
    g.ellipse(16, 17, 4, 8, 0.2, 0, TAU);
    fill(g, C.greenDk);
    g.beginPath();
    g.ellipse(18, 7, 3, 3, 0, 0, TAU);
    fill(g, C.green);
    for (const s of [-1, 1]) {
      g.beginPath();
      g.ellipse(16 + s * 8, 12, 7, 3, s * 0.6, 0, TAU);
      fill(g, 'rgba(226,232,240,0.7)');
      line(g, 16 + s * 2, 18, 16 + s * 9, 25, C.greenDk, 1.6);
      line(g, 16 + s * 2, 15, 16 + s * 8, 20, C.greenDk, 1.6);
    }
    line(g, 16, 5, 13, 1, C.slate, 1.3);
    line(g, 19, 5, 22, 1, C.slate, 1.3);
    circle(g, 19, 6.5, 0.9);
    fill(g, C.red);
  },
  FAMINE(g) {
    g.beginPath();
    g.moveTo(4, 14);
    g.lineTo(28, 14);
    g.quadraticCurveTo(26, 28, 16, 28);
    g.quadraticCurveTo(6, 28, 4, 14);
    fill(g, '#a8a29e');
    g.beginPath();
    g.ellipse(16, 14, 12, 3, 0, 0, TAU);
    fill(g, '#57534e');
    g.beginPath();
    g.moveTo(6, 8); g.quadraticCurveTo(8, 3, 11, 6);
    stroke(g, C.slateDk, 1.4);
    line(g, 22, 4, 26, 9, C.red, 2);
    line(g, 26, 4, 22, 9, C.red, 2);
  },
  BLIGHT(g) {
    g.beginPath();
    g.moveTo(5, 26);
    g.bezierCurveTo(4, 8, 16, 3, 28, 6);
    g.bezierCurveTo(29, 19, 20, 28, 5, 26);
    fill(g, '#65a30d');
    g.beginPath();
    g.moveTo(5, 26);
    g.bezierCurveTo(10, 18, 17, 12, 25, 8);
    stroke(g, '#365314', 1.6);
    for (const [x, y, r] of [[13, 12, 2.4], [20, 17, 2.8], [11, 20, 1.8], [22, 10, 1.6]]) { circle(g, x, y, r); fill(g, '#1c1917'); }
  },
  ACID_RAIN(g) {
    cloud(g, '#64748b', -2);
    for (const [x, y] of [[9, 22], [15, 26], [21, 22], [12, 30], [24, 28]]) drop(g, x, y, 2.1, C.lime);
    for (const [x, y] of [[9, 22], [21, 22]]) { circle(g, x, y + 1, 0.7); fill(g, C.ink); }
  },
  BARRENNESS(g) {
    heart(g, 16, 15, 1.7, C.slate);
    g.beginPath();
    g.moveTo(16, 6); g.lineTo(14, 12); g.lineTo(18, 15); g.lineTo(15, 22);
    stroke(g, C.ink, 1.8);
    line(g, 5, 5, 27, 27, C.red, 2.2);
  },
  MADNESS(g) {
    g.beginPath();
    for (let i = 0; i < 90; i++) {
      const a = i * 0.28;
      const r = 1 + i * 0.13;
      g.lineTo(16 + Math.cos(a) * r, 16 + Math.sin(a) * r);
    }
    stroke(g, C.purple, 2.2);
    for (const [x, y] of [[4, 6], [27, 5], [28, 26]]) {
      g.beginPath();
      g.moveTo(x - 2, y + 2); g.lineTo(x, y - 2); g.lineTo(x + 2, y + 2);
      stroke(g, C.red, 1.6);
    }
    circle(g, 16, 16, 2);
    fill(g, C.red);
  },
  HAUNT(g) {
    g.beginPath();
    g.moveTo(6, 28);
    g.lineTo(6, 14);
    g.arc(16, 14, 10, Math.PI, 0);
    g.lineTo(26, 28);
    g.lineTo(22, 24);
    g.lineTo(19, 28);
    g.lineTo(16, 24);
    g.lineTo(13, 28);
    g.lineTo(10, 24);
    g.closePath();
    fill(g, '#e0e7ff');
    g.beginPath(); g.ellipse(12.5, 14, 2, 3, 0, 0, TAU); fill(g, C.ink);
    g.beginPath(); g.ellipse(19.5, 14, 2, 3, 0, 0, TAU); fill(g, C.ink);
    g.beginPath(); g.ellipse(16, 21, 2, 2.6, 0, 0, TAU); fill(g, C.ink);
  },
  MONSTER(g) {
    // a dragon head in profile
    g.beginPath();
    g.moveTo(4, 22);
    g.bezierCurveTo(4, 14, 10, 9, 17, 9);
    g.bezierCurveTo(22, 9, 26, 12, 27, 16);
    g.lineTo(21, 17);
    g.lineTo(26, 19);
    g.bezierCurveTo(24, 24, 16, 27, 10, 26);
    g.closePath();
    fill(g, C.greenDk);
    poly(g, [[11, 10], [9, 3], [15, 8]]);
    fill(g, C.goldLt);
    poly(g, [[17, 9], [17, 3], [21, 9]]);
    fill(g, C.goldLt);
    g.beginPath(); g.ellipse(17, 14, 2.4, 1.6, 0, 0, TAU); fill(g, C.gold);
    circle(g, 17.4, 14, 0.9);
    fill(g, C.ink);
    flame(g, 29, 20, 8, 3, C.orange, C.goldLt);
    for (const x of [14, 18, 22]) poly(g, [[x, 22], [x + 1.3, 24.5], [x + 2.6, 22]]), fill(g, C.white);
  },
  GIANT_GROWTH(g) {
    person(g, 12, 22, 1.5, C.green);
    arrow(g, 26, 10, true, C.goldLt);
    arrow(g, 26, 22, true, C.goldLt);
    sparkle(g, 5, 6, 2.5, C.goldLt);
  },
  SHRINK(g) {
    person(g, 20, 25, 0.7, C.purple);
    person(g, 8, 20, 1.4, 'rgba(148,163,184,0.35)');
    arrow(g, 26, 8, false, C.red);
    arrow(g, 6, 8, false, C.red);
  },
  CHARM(g) {
    heart(g, 16, 15, 1.7, C.pink);
    g.beginPath();
    g.ellipse(16, 15, 6, 3.2, 0, 0, TAU);
    fill(g, C.white);
    circle(g, 16, 15, 2.4);
    fill(g, C.purpleDk);
    circle(g, 16, 15, 1);
    fill(g, C.ink);
    sparkle(g, 26, 6, 3, C.pink);
    sparkle(g, 5, 26, 2.5, C.purple);
  },
  SHAPESHIFT(g) {
    for (const s of [0, 1]) {
      g.beginPath();
      g.arc(16, 16, 9, s * Math.PI + 0.3, s * Math.PI + Math.PI - 0.5);
      stroke(g, s ? C.purple : C.cyan, 3);
      const a = s * Math.PI + Math.PI - 0.5;
      const ex = 16 + Math.cos(a) * 9;
      const ey = 16 + Math.sin(a) * 9;
      poly(g, [[ex + Math.cos(a + 1.57) * 4, ey + Math.sin(a + 1.57) * 4], [ex + Math.cos(a - 0.4) * 4.5, ey + Math.sin(a - 0.4) * 4.5], [ex + Math.cos(a - 1.57) * 4, ey + Math.sin(a - 1.57) * 4]]);
      fill(g, s ? C.purple : C.cyan);
    }
    sparkle(g, 16, 16, 4.5, C.goldLt);
  },
  LIGHTNING_STORM(g) {
    cloud(g, '#64748b', -3);
    poly(g, [[18, 14], [11, 24], [15, 24], [13, 31], [22, 20], [17.5, 20]]);
    fill(g, C.goldLt);
    poly(g, [[9, 21], [6, 26], [8.5, 26], [7, 30], [12, 24], [9.5, 24]]);
    fill(g, C.gold);
  },
  GRAVITY_WELL(g) {
    for (let a = 0; a < 3; a++) {
      g.beginPath();
      for (let i = 0; i < 40; i++) {
        const t = i / 39;
        const ang = a * (TAU / 3) + t * 4.5;
        const r = 13 * (1 - t) + 1;
        g.lineTo(16 + Math.cos(ang) * r, 16 + Math.sin(ang) * r);
      }
      stroke(g, a % 2 ? C.purple : C.cyan, 2);
    }
    circle(g, 16, 16, 3.4);
    fill(g, '#050014');
    circle(g, 16, 16, 3.4);
    stroke(g, C.purple, 1);
  },
  TIME_BUBBLE(g) {
    circle(g, 16, 16, 12.5);
    fill(g, 'rgba(34,211,238,0.18)');
    stroke(g, C.cyan, 2);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      line(g, 16 + Math.cos(a) * 10, 16 + Math.sin(a) * 10, 16 + Math.cos(a) * 11.2, 16 + Math.sin(a) * 11.2, C.cyanLt, 1.4);
    }
    line(g, 16, 16, 16, 8, C.white, 2);
    line(g, 16, 16, 22, 19, C.goldLt, 2);
    circle(g, 16, 16, 1.7);
    fill(g, C.white);
  },
  TELEPORT(g) {
    for (let a = 0; a < 2; a++) {
      g.beginPath();
      for (let i = 0; i < 30; i++) {
        const t = i / 29;
        const ang = a * Math.PI + t * 7;
        const r = 2 + t * 12;
        g.lineTo(16 + Math.cos(ang) * r, 16 + Math.sin(ang) * r * 0.85);
      }
      stroke(g, a ? C.cyanLt : C.slate, 2.2);
    }
    for (const [x, y] of [[5, 5], [27, 27], [27, 6]]) sparkle(g, x, y, 2.4, C.white);
  },
  FIREWORKS(g) {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU;
      line(g, 16 + Math.cos(a) * 4, 14 + Math.sin(a) * 4, 16 + Math.cos(a) * 11, 14 + Math.sin(a) * 11, ['#f472b6', '#fde047', '#38bdf8', '#4ade80', '#fb923c'][i % 5], 2);
      circle(g, 16 + Math.cos(a) * 12.5, 14 + Math.sin(a) * 12.5, 1.4);
      fill(g, C.white);
    }
    circle(g, 16, 14, 2.5);
    fill(g, C.white);
    line(g, 16, 30, 16, 25, C.goldLt, 1.6);
  },
  METEOR(g) {
    for (const [w, col, off] of [[7, 'rgba(251,146,60,0.35)', 0], [4.5, 'rgba(250,204,21,0.6)', 0]]) {
      g.beginPath();
      g.moveTo(21, 21);
      g.lineTo(3 + off, 3);
      stroke(g, col, w);
    }
    circle(g, 21, 21, 6.5);
    fill(g, '#78716c');
    circle(g, 19.5, 19.5, 6.5);
    fill(g, C.orange);
    circle(g, 19, 19, 4.2);
    fill(g, C.goldLt);
    for (const [x, y] of [[23, 20], [20, 24]]) { circle(g, x, y, 1.2); fill(g, '#57534e'); }
  },
  METEOR_SHOWER(g) {
    for (const [x, y, s] of [[22, 12, 1], [14, 21, 0.85], [27, 25, 0.7]]) {
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x - 11 * s, y - 11 * s);
      stroke(g, 'rgba(251,146,60,0.55)', 4 * s);
      circle(g, x, y, 3.5 * s);
      fill(g, C.goldLt);
      circle(g, x, y, 2 * s);
      fill(g, C.white);
    }
    sparkle(g, 5, 24, 2.5, C.cyanLt);
  },
  SINGULARITY(g) {
    circle(g, 16, 16, 12);
    fill(g, 'rgba(139,92,246,0.25)');
    stroke(g, C.purple, 2);
    circle(g, 16, 16, 8);
    stroke(g, C.cyan, 1.4);
    circle(g, 16, 16, 5);
    fill(g, '#050014');
    g.beginPath();
    g.arc(16, 16, 11, 0.3, 1.6);
    stroke(g, C.goldLt, 2);
    g.beginPath();
    g.arc(16, 16, 11, Math.PI + 0.3, Math.PI + 1.6);
    stroke(g, C.goldLt, 2);
  },
  STARWARD_VISION(g) {
    // a rocket climbing past a star
    g.beginPath();
    g.moveTo(16, 3); g.quadraticCurveTo(22, 9, 21, 19); g.lineTo(11, 19); g.quadraticCurveTo(10, 9, 16, 3);
    g.closePath();
    fill(g, C.white);
    stroke(g, C.slate, 1);
    circle(g, 16, 11, 2.4); fill(g, C.cyan);
    g.beginPath(); g.moveTo(11, 15); g.lineTo(7, 22); g.lineTo(11, 20); g.closePath(); fill(g, C.red);
    g.beginPath(); g.moveTo(21, 15); g.lineTo(25, 22); g.lineTo(21, 20); g.closePath(); fill(g, C.red);
    g.beginPath(); g.moveTo(13, 20); g.lineTo(16, 29); g.lineTo(19, 20); g.closePath(); fill(g, C.orange);
    sparkle(g, 26, 7, 2.5, C.goldLt);
    sparkle(g, 6, 9, 2, C.cyanLt);
  },
  // toolbar helpers
  ASTEROID(g) { ICONS.METEOR(g); },
  BLACKHOLE(g) { ICONS.SINGULARITY(g); },
  WORKSHOP(g) {
    poly(g, [[4, 24], [3, 9], [10, 16], [16, 6], [22, 16], [29, 9], [28, 24]]);
    fill(g, C.ink);
    poly(g, [[6, 22], [5.4, 12.5], [10.5, 18], [16, 9.5], [21.5, 18], [26.6, 12.5], [26, 22]]);
    fill(g, C.goldLt);
    line(g, 5, 27, 27, 27, C.ink, 3);
    for (const [x, y] of [[16, 15], [10, 20], [22, 20]]) { circle(g, x, y, 1.6); fill(g, C.red); }
  }
};

export function hasPowerIcon(id) {
  return Boolean(ICONS[id]);
}

// Draws icon `id` filling a size x size box at the context origin.
export function drawPowerIcon(ctx, id, size = 32) {
  const draw = ICONS[id];
  if (!draw) return false;
  ctx.save();
  ctx.scale(size / 32, size / 32);
  draw(ctx);
  ctx.restore();
  return true;
}

// A ready-made canvas (rendered at devicePixelRatio for crispness)
export function makePowerIcon(id, size = 28) {
  const canvas = document.createElement('canvas');
  const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  canvas.style.width = size + 'px';
  canvas.style.height = size + 'px';
  canvas.setAttribute('aria-hidden', 'true');
  const g = canvas.getContext('2d');
  g.scale(dpr, dpr);
  drawPowerIcon(g, id, size);
  return canvas;
}

export const ICON_IDS = Object.keys(ICONS);
