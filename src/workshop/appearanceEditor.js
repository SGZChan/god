// Pieces of the God Creation Workshop that shape what a creature looks like and how it lives:
//   PartsPicker    one strip of thumbnails per body part (head, body, legs, ears, tail, horns, wings, markings, alien
//                  mutation); click a thumbnail to choose it, every thumbnail shows the creature with that part
//   ColourControls sliders (with colour previews) for the body colour, the markings and the eyes, plus palette swatches
//   SheetPicker    browser of the ready-made sprite sheets (art/sheetSprites.js): category chips, sex filter, grid
//   ARCHETYPES     one-click species to start from (elves, dwarves, dragonkin, wolves, sharks, aliens...)
import { getCreatureCanvas } from '../art/creatureSprite.js';
import { PART_COUNTS } from '../life/genome.js';
import { MUTATION_NAMES } from '../art/creatureParts.js';
import { CATEGORIES, loadCatalog, catalog, sheetInfo } from '../art/sheetSprites.js';

export const PART_ROWS = [
  { gene: 'head', label: 'Head' },
  { gene: 'body', label: 'Body' },
  { gene: 'legs', label: 'Legs' },
  { gene: 'ears', label: 'Ears' },
  { gene: 'tail', label: 'Tail' },
  { gene: 'horns', label: 'Horns & fins' },
  { gene: 'wings', label: 'Wings' },
  { gene: 'pattern', label: 'Markings' },
  { gene: 'mutation', label: 'Alien mutation' }
];

const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };

function hsl(h, s, l) { return `hsl(${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`; }

export class PartsPicker {
  // look: { head, body, ... , hue, ... } (mutated in place); onChange() after every change
  constructor(container, look, onChange) {
    this.container = container;
    this.look = look;
    this.onChange = onChange;
    this.rows = new Map();
    this.build();
  }

  setLook(look) { this.look = look; this.refresh(); }

  build() {
    this.container.replaceChildren();
    for (const row of PART_ROWS) {
      const wrap = el('div', 'part-row');
      const head = el('div', 'part-head');
      const label = el('span', 'part-label', row.label);
      const name = el('span', 'part-name');
      const prev = el('button', 'part-step', '◀');
      const next = el('button', 'part-step', '▶');
      prev.type = next.type = 'button';
      head.append(label, name, prev, next);
      const strip = el('div', 'part-strip');
      const thumbs = [];
      for (let v = 0; v < PART_COUNTS[row.gene]; v++) {
        const b = el('button', 'part-thumb');
        b.type = 'button';
        b.title = row.gene === 'mutation' ? MUTATION_NAMES[v] : `${row.label} ${v + 1}`;
        const c = document.createElement('canvas');
        c.width = 20; c.height = 20;
        b.appendChild(c);
        b.addEventListener('click', () => this.choose(row.gene, v));
        strip.appendChild(b);
        thumbs.push({ b, c, v });
      }
      const step = d => this.choose(row.gene, (Math.round(this.look[row.gene]) + d + PART_COUNTS[row.gene]) % PART_COUNTS[row.gene]);
      prev.addEventListener('click', () => step(-1));
      next.addEventListener('click', () => step(1));
      wrap.append(head, strip);
      this.container.appendChild(wrap);
      this.rows.set(row.gene, { thumbs, name });
    }
    this.refresh();
  }

  choose(gene, v) {
    this.look[gene] = v;
    this.refresh();
    this.onChange();
  }

  refresh() {
    for (const [gene, row] of this.rows) {
      const cur = Math.round(this.look[gene]);
      row.name.textContent = gene === 'mutation' ? MUTATION_NAMES[cur] : `${cur + 1} / ${PART_COUNTS[gene]}`;
      for (const t of row.thumbs) {
        // the creature as it is now, with only this part swapped
        const src = getCreatureCanvas({ ...this.look, [gene]: t.v }, 0);
        const ctx = t.c.getContext('2d');
        ctx.clearRect(0, 0, 20, 20);
        ctx.drawImage(src, 0, 0);
        t.b.classList.toggle('active', t.v === cur);
      }
    }
  }
}

const SWATCHES = [
  [0.05, 0.75, 0.5], [0.1, 0.7, 0.55], [0.14, 0.7, 0.6], [0.3, 0.55, 0.45], [0.45, 0.6, 0.45], [0.58, 0.65, 0.55],
  [0.7, 0.55, 0.55], [0.82, 0.55, 0.6], [0.95, 0.7, 0.6], [0.08, 0.35, 0.4], [0.1, 0.1, 0.25], [0.12, 0.1, 0.8]
];

export class ColourControls {
  constructor(container, look, onChange) {
    this.container = container;
    this.look = look;
    this.onChange = onChange;
    this.inputs = {};
    this.build();
  }

  setLook(look) { this.look = look; this.refresh(); }

  slider(key, label, bg) {
    const row = el('label', 'ws-slider colour-slider');
    const input = document.createElement('input');
    input.type = 'range'; input.min = '0'; input.max = '1'; input.step = '0.01';
    if (bg) input.style.background = bg;
    const out = el('output');
    input.addEventListener('input', () => { this.look[key] = parseFloat(input.value); this.refresh(); this.onChange(); });
    row.append(el('span', '', label), input, out);
    this.inputs[key] = { input, out };
    return row;
  }

  build() {
    this.container.replaceChildren();
    const rainbow = 'linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)';
    this.container.append(
      this.slider('hue', 'Body hue', rainbow),
      this.slider('sat', 'Body vividness'),
      this.slider('light', 'Body lightness'),
      this.slider('hue2', 'Markings shift'),
      this.slider('eyeHue', 'Eye colour', rainbow)
    );
    const sw = el('div', 'swatches');
    sw.appendChild(el('span', 'swatch-label', 'Palettes'));
    for (const [h, s, l] of SWATCHES) {
      const b = el('button', 'swatch');
      b.type = 'button';
      b.style.background = hsl(h, 0.35 + s * 0.55, 0.3 + l * 0.32);
      b.title = 'Use this colour';
      b.addEventListener('click', () => { Object.assign(this.look, { hue: h, sat: s, light: l }); this.refresh(); this.onChange(); });
      sw.appendChild(b);
    }
    this.container.appendChild(sw);
    this.refresh();
  }

  refresh() {
    for (const [key, { input, out }] of Object.entries(this.inputs)) {
      input.value = String(this.look[key] ?? 0.5);
      out.textContent = `${Math.round((this.look[key] ?? 0.5) * 100)}%`;
    }
  }
}

// Browser of the ready-made sprite sheets. options: { filter(sheet) -> bool (e.g. only people), categories: ids to offer }
export class SheetPicker {
  constructor(container, { onPick, categories = CATEGORIES.map(c => c.id), sexes = true } = {}) {
    this.container = container;
    this.onPick = onPick;
    this.categories = categories;
    this.cat = categories[0];
    this.sex = 'any';
    this.selected = null;
    this.sexes = sexes;
    this.build();
    loadCatalog().then(() => this.renderGrid());
  }

  build() {
    this.container.replaceChildren();
    const chips = el('div', 'sheet-chips');
    for (const c of CATEGORIES.filter(c => this.categories.includes(c.id))) {
      const b = el('button', 'sheet-chip', c.label);
      b.type = 'button';
      b.dataset.cat = c.id;
      b.addEventListener('click', () => { this.cat = c.id; this.renderGrid(); });
      chips.appendChild(b);
    }
    this.chips = chips;
    const tools = el('div', 'sheet-tools');
    if (this.sexes) {
      for (const [id, label] of [['any', 'Any'], ['F', '♀'], ['M', '♂']]) {
        const b = el('button', 'sheet-chip small', label);
        b.type = 'button';
        b.dataset.sex = id;
        b.addEventListener('click', () => { this.sex = id; this.renderGrid(); });
        tools.appendChild(b);
      }
    }
    this.count = el('span', 'sheet-count');
    tools.appendChild(this.count);
    this.grid = el('div', 'sheet-grid');
    this.container.append(chips, tools, this.grid);
    this.renderGrid();
  }

  select(id) {
    this.selected = id;
    for (const b of this.grid.children) b.classList.toggle('active', b.dataset.id === id);
  }

  renderGrid() {
    for (const b of this.chips.children) b.classList.toggle('active', b.dataset.cat === this.cat);
    for (const b of this.container.querySelectorAll('[data-sex]')) b.classList.toggle('active', b.dataset.sex === this.sex);
    const list = catalog().filter(s => s.cat === this.cat && (this.sex === 'any' || !s.sex || s.sex === this.sex));
    this.count.textContent = `${list.length} sheets`;
    this.grid.replaceChildren();
    for (const s of list) {
      const b = el('button', 'sheet-cell');
      b.type = 'button';
      b.title = s.label;
      b.dataset.id = s.id;
      // the standing frame, scaled up (the sheet is 3 x 4 frames: show the middle of the top row)
      const f = el('div', 'sheet-frame');
      f.style.backgroundImage = `url(sprites/pipoya/${s.file})`;
      f.style.backgroundSize = `${s.fw * 3 * 2}px ${s.fh * 4 * 2}px`;
      f.style.backgroundPosition = `-${s.fw * 2}px 0`;
      f.style.width = `${s.fw * 2}px`;
      f.style.height = `${s.fh * 2}px`;
      b.appendChild(f);
      if (s.id === this.selected) b.classList.add('active');
      b.addEventListener('click', () => { this.select(s.id); this.onPick && this.onPick(s.id, sheetInfo(s.id)); });
      this.grid.appendChild(b);
    }
  }
}

// One-click species. look: parts and colours (0..1 genes); traits: 0..1 genes; size/speed/lifespan as in the form
export const ARCHETYPES = [
  { id: 'human', label: '🧑 Human', cfg: { name: 'Humans', type: 'humanoid', diet: 'omnivore', size: 1, speed: 1, lifespan: 55 }, look: { head: 6, body: 5, legs: 1, ears: 0, tail: 0, horns: 0, wings: 0, pattern: 1, mutation: 0, hue: 0.07, sat: 0.55, light: 0.55, hue2: 0.25, eyeHue: 0.6 } },
  { id: 'elf', label: '🧝 Elf', cfg: { name: 'Elves', type: 'humanoid', diet: 'omnivore', size: 1.05, speed: 1.2, lifespan: 90 }, look: { head: 11, body: 5, legs: 1, ears: 6, tail: 0, horns: 0, wings: 0, pattern: 1, mutation: 0, hue: 0.1, sat: 0.35, light: 0.8, hue2: 0.6, eyeHue: 0.45 }, traits: { fertility: 0.3, perception: 0.9 } },
  { id: 'dwarf', label: '⛏️ Dwarf', cfg: { name: 'Dwarves', type: 'humanoid', diet: 'omnivore', size: 0.75, speed: 0.85, lifespan: 70, coldResist: 0.9 }, look: { head: 12, body: 9, legs: 1, ears: 0, tail: 0, horns: 0, wings: 0, pattern: 1, mutation: 0, hue: 0.06, sat: 0.6, light: 0.5, hue2: 0.05, eyeHue: 0.1 }, traits: { aggression: 0.5 } },
  { id: 'orc', label: '🪓 Orc', cfg: { name: 'Orcs', type: 'humanoid', diet: 'omnivore', size: 1.35, speed: 1.1, lifespan: 40 }, look: { head: 13, body: 2, legs: 1, ears: 8, tail: 0, horns: 0, wings: 0, pattern: 4, mutation: 0, hue: 0.28, sat: 0.55, light: 0.4, hue2: 0.4, eyeHue: 0.0 }, traits: { aggression: 0.8, fertility: 0.7 } },
  { id: 'goblin', label: '👺 Goblin', cfg: { name: 'Goblins', type: 'humanoid', diet: 'omnivore', size: 0.6, speed: 1.3, lifespan: 25 }, look: { head: 19, body: 5, legs: 1, ears: 8, tail: 0, horns: 0, wings: 0, pattern: 1, mutation: 0, hue: 0.25, sat: 0.7, light: 0.45, hue2: 0.3, eyeHue: 0.05 }, traits: { fertility: 0.9, sociality: 0.9 } },
  { id: 'dragonkin', label: '🐉 Dragonkin', cfg: { name: 'Dragonkin', type: 'humanoid', diet: 'carnivore', size: 1.4, speed: 1.1, lifespan: 120, heatResist: 0.95 }, look: { head: 11, body: 5, legs: 1, ears: 0, tail: 4, horns: 2, wings: 4, pattern: 3, mutation: 0, hue: 0.0, sat: 0.7, light: 0.5, hue2: 0.1, eyeHue: 0.12 }, traits: { aggression: 0.7 } },
  { id: 'beastfolk', label: '🐺 Beastfolk', cfg: { name: 'Beastfolk', type: 'humanoid', diet: 'omnivore', size: 1.1, speed: 1.3, lifespan: 45 }, look: { head: 7, body: 2, legs: 1, ears: 5, tail: 6, horns: 0, wings: 0, pattern: 2, mutation: 0, hue: 0.09, sat: 0.55, light: 0.5, hue2: 0.2, eyeHue: 0.15 } },
  { id: 'wolf', label: '🐺 Wolf', cfg: { name: 'Wolves', type: 'herbivore', diet: 'carnivore', size: 1, speed: 1.5, lifespan: 15 }, look: { head: 1, body: 0, legs: 2, ears: 1, tail: 6, horns: 0, wings: 0, pattern: 1, mutation: 0, hue: 0.07, sat: 0.1, light: 0.4, hue2: 0.1, eyeHue: 0.12 }, traits: { aggression: 0.8, sociality: 0.9 } },
  { id: 'deer', label: '🦌 Deer', cfg: { name: 'Deer', type: 'herbivore', diet: 'herbivore', size: 1.2, speed: 1.6, lifespan: 20 }, look: { head: 14, body: 1, legs: 7, ears: 5, tail: 1, horns: 5, wings: 0, pattern: 2, mutation: 0, hue: 0.07, sat: 0.55, light: 0.55, hue2: 0.1, eyeHue: 0.08 }, traits: { aggression: 0.1, sociality: 0.9 } },
  { id: 'bear', label: '🐻 Bear', cfg: { name: 'Bears', type: 'herbivore', diet: 'omnivore', size: 1.7, speed: 0.95, lifespan: 30, coldResist: 0.9 }, look: { head: 16, body: 2, legs: 2, ears: 2, tail: 1, horns: 0, wings: 0, pattern: 1, mutation: 0, hue: 0.06, sat: 0.5, light: 0.3, hue2: 0.1, eyeHue: 0.07 } },
  { id: 'rabbit', label: '🐇 Rabbit', cfg: { name: 'Hares', type: 'herbivore', diet: 'herbivore', size: 0.55, speed: 1.5, lifespan: 9 }, look: { head: 15, body: 0, legs: 2, ears: 7, tail: 1, horns: 0, wings: 0, pattern: 2, mutation: 0, hue: 0.1, sat: 0.2, light: 0.7, hue2: 0.1, eyeHue: 0.95 }, traits: { fertility: 0.95, sociality: 0.8 } },
  { id: 'shark', label: '🦈 Shark', cfg: { name: 'Sharks', type: 'herbivore', diet: 'carnivore', size: 1.8, speed: 1.6, lifespan: 40 }, look: { head: 20, body: 6, legs: 0, ears: 0, tail: 10, horns: 8, wings: 0, pattern: 1, mutation: 0, hue: 0.57, sat: 0.2, light: 0.5, hue2: 0.1, eyeHue: 0.9 }, traits: { aggression: 0.9 } },
  { id: 'whale', label: '🐋 Whale', cfg: { name: 'Whales', type: 'herbivore', diet: 'herbivore', size: 2, speed: 1, lifespan: 90 }, look: { head: 21, body: 13, legs: 0, ears: 0, tail: 9, horns: 0, wings: 0, pattern: 1, mutation: 0, hue: 0.6, sat: 0.4, light: 0.35, hue2: 0.1, eyeHue: 0.7 }, traits: { aggression: 0.05, fertility: 0.2 } },
  { id: 'alien', label: '👽 Grey alien', cfg: { name: 'Greys', type: 'humanoid', diet: 'omnivore', size: 0.85, speed: 1.1, lifespan: 150 }, look: { head: 18, body: 12, legs: 7, ears: 0, tail: 0, horns: 0, wings: 0, pattern: 1, mutation: 1, hue: 0.4, sat: 0.1, light: 0.7, hue2: 0.5, eyeHue: 0.0 }, traits: { intelligence: 1, perception: 0.95 } },
  { id: 'insect', label: '🪲 Insectoid', cfg: { name: 'Hive', type: 'herbivore', diet: 'omnivore', size: 0.8, speed: 1.4, lifespan: 12 }, look: { head: 17, body: 11, legs: 8, ears: 0, tail: 8, horns: 4, wings: 6, pattern: 3, mutation: 2, hue: 0.33, sat: 0.7, light: 0.35, hue2: 0.15, eyeHue: 0.0 }, traits: { fertility: 0.95, sociality: 0.95 } },
  { id: 'spore', label: '🍄 Glow beast', cfg: { name: 'Glowbeasts', type: 'herbivore', diet: 'herbivore', size: 1.1, speed: 0.9, lifespan: 30 }, look: { head: 5, body: 4, legs: 5, ears: 4, tail: 0, horns: 3, wings: 0, pattern: 2, mutation: 7, hue: 0.78, sat: 0.7, light: 0.4, hue2: 0.3, eyeHue: 0.45 } }
];
