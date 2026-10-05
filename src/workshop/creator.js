// The God Creation Workshop (#workshop-modal in index.html). Three things can be made:
// - a champion: a person of the planet's own people, with a Laya AI mind (src/ai/layaEngine.js) or the ordinary
//   needs-and-jobs brain, placed where the player clicks;
// - a species: a founding group built from genes (life/ecosystem.js createCustomSpecies), which then breeds and
//   evolves on its own;
// - a planet, added to the current star system (planetCreator.js).
// The preview draws the same sprite the creation will have on the surface (art/creatureSprite.js).
import { getCreatureCanvas, SPRITE_W, SPRITE_H } from '../art/creatureSprite.js';
import { ALL_GENES, BODY_GENES, COLOR_GENES, PART_COUNTS } from '../life/genome.js';
import { PlanetCreator } from './planetCreator.js';
import { PartsPicker, ColourControls, SheetPicker, ARCHETYPES } from './appearanceEditor.js';
import { blankVices, applyInterpretation, interpret } from '../ai/temperament.js';
import { drawSheet, WALK_FRAMES, loadCatalog, sheetInfo } from '../art/sheetSprites.js';
import { sounds } from '../audio/soundFX.js';

// One-click champions. vices: 0..1 (the rest stay low); text: the description the Laya mind is told to act out
const CHAMPIONS = [
  { id: 'prophet', label: '✨ Prophet of Light', name: 'Seraphina', epithet: 'The Sacred Voice', gender: 'Female', aura: '#38bdf8',
    personality: { openness: 0.95, conscientiousness: 0.7, extraversion: 0.85, agreeableness: 0.85, neuroticism: 0.2, piety: 1 },
    proficiencies: { architecture: 50, warfare: 20, statesmanship: 90, farming: 50, science: 60, mysticism: 100 },
    vices: { pride: 0.2 }, text: 'A devout, gentle prophet who preaches to everyone and prays at every shrine.' },
  { id: 'warlord', label: '⚔️ Divine Warmaster', name: 'Vulkan', epithet: 'The Divine Conqueror', gender: 'Male', aura: '#ef4444',
    personality: { openness: 0.4, conscientiousness: 0.8, extraversion: 0.8, agreeableness: 0.2, neuroticism: 0.3, piety: 0.85 },
    proficiencies: { architecture: 40, warfare: 100, statesmanship: 85, farming: 30, science: 35, mysticism: 50 },
    vices: { pride: 0.6, wrath: 0.8 }, text: 'A ruthless warlord who lives for battle and drills with the soldiers.' },
  { id: 'architect', label: '🏛️ Master Architect', name: 'Daedalus', epithet: 'Master of Foundations', gender: 'Male', aura: '#10b981',
    personality: { openness: 0.8, conscientiousness: 1, extraversion: 0.5, agreeableness: 0.7, neuroticism: 0.3, piety: 0.75 },
    proficiencies: { architecture: 100, warfare: 30, statesmanship: 60, farming: 60, science: 95, mysticism: 55 },
    vices: { pride: 0.4 }, text: 'A diligent builder and engineer, always at the workshops and quarries.' },
  { id: 'sage', label: '📜 Sage of the Stars', name: 'Ilyra', epithet: 'Sage of the Stars', gender: 'Female', aura: '#a855f7',
    personality: { openness: 1, conscientiousness: 0.75, extraversion: 0.4, agreeableness: 0.8, neuroticism: 0.3, piety: 0.6 },
    proficiencies: { architecture: 55, warfare: 15, statesmanship: 55, farming: 45, science: 100, mysticism: 85 },
    vices: {}, text: 'A wise, curious scholar who haunts the library and keeps to herself.' },
  { id: 'tyrant', label: '👑 Vain Tyrant', name: 'Maximus', epithet: 'The Unbowed King', gender: 'Male', aura: '#f59e0b',
    personality: { openness: 0.3, conscientiousness: 0.6, extraversion: 0.9, agreeableness: 0.1, neuroticism: 0.4, piety: 0.4 },
    proficiencies: { architecture: 50, warfare: 80, statesmanship: 90, farming: 20, science: 30, mysticism: 30 },
    vices: { pride: 0.95, wrath: 0.7, greed: 0.6, envy: 0.4 }, text: 'A proud, cruel tyrant who holds court, hates to bow, and never makes peace.' },
  { id: 'merchant', label: '💰 Greedy Merchant-Queen', name: 'Aurelia', epithet: 'Queen of Coin', gender: 'Female', aura: '#eab308',
    personality: { openness: 0.6, conscientiousness: 0.8, extraversion: 0.8, agreeableness: 0.4, neuroticism: 0.3, piety: 0.35 },
    proficiencies: { architecture: 60, warfare: 20, statesmanship: 85, farming: 40, science: 50, mysticism: 20 },
    vices: { greed: 0.95, pride: 0.6, envy: 0.5 }, text: 'A greedy, charming merchant who counts her gold at the market and hoards the stores.' },
  { id: 'glutton', label: '🍖 Glutton Friar', name: 'Brother Tuck', epithet: 'The Well-Fed', gender: 'Male', aura: '#fb923c',
    personality: { openness: 0.5, conscientiousness: 0.4, extraversion: 0.8, agreeableness: 0.75, neuroticism: 0.3, piety: 0.7 },
    proficiencies: { architecture: 30, warfare: 20, statesmanship: 40, farming: 80, science: 30, mysticism: 60 },
    vices: { gluttony: 0.95, sloth: 0.55, lust: 0.3 }, text: 'A jolly, sociable friar who loves feasts, ale and a good harvest.' },
  { id: 'lover', label: '💘 Lustful Bard', name: 'Casimir', epithet: 'The Silver Tongue', gender: 'Male', aura: '#ec4899',
    personality: { openness: 0.9, conscientiousness: 0.3, extraversion: 0.95, agreeableness: 0.6, neuroticism: 0.4, piety: 0.3 },
    proficiencies: { architecture: 20, warfare: 30, statesmanship: 60, farming: 20, science: 40, mysticism: 40 },
    vices: { lust: 0.95, pride: 0.5, gluttony: 0.4, sloth: 0.3 }, text: 'A charming romantic, a flirt and a party-lover who is never alone.' },
  { id: 'sloth', label: '🛌 Slothful Dreamer', name: 'Odo', epithet: 'The Late Riser', gender: 'Male', aura: '#94a3b8',
    personality: { openness: 0.8, conscientiousness: 0.1, extraversion: 0.3, agreeableness: 0.7, neuroticism: 0.2, piety: 0.5 },
    proficiencies: { architecture: 30, warfare: 10, statesmanship: 30, farming: 40, science: 70, mysticism: 60 },
    vices: { sloth: 0.95, gluttony: 0.4 }, text: 'A lazy, easygoing dreamer who would rather sleep than do anything.' },
  { id: 'usurper', label: '🐍 Envious Usurper', name: 'Iago', epithet: 'The Second Son', gender: 'Male', aura: '#22c55e',
    personality: { openness: 0.6, conscientiousness: 0.7, extraversion: 0.5, agreeableness: 0.15, neuroticism: 0.7, piety: 0.3 },
    proficiencies: { architecture: 40, warfare: 60, statesmanship: 80, farming: 20, science: 40, mysticism: 30 },
    vices: { envy: 0.95, pride: 0.5, wrath: 0.5, greed: 0.5 }, text: 'A jealous, bitter schemer who covets the great houses of others.' },
  { id: 'healer', label: '🌿 Humble Healer', name: 'Mara', epithet: 'Hands of Mercy', gender: 'Female', aura: '#34d399',
    personality: { openness: 0.6, conscientiousness: 0.85, extraversion: 0.5, agreeableness: 1, neuroticism: 0.2, piety: 0.8 },
    proficiencies: { architecture: 30, warfare: 5, statesmanship: 50, farming: 80, science: 70, mysticism: 70 },
    vices: { pride: 0, greed: 0, wrath: 0, sloth: 0 }, text: 'A kind, humble healer who tends the sick and is merciful to all.' },
  { id: 'ranger', label: '🏹 Wandering Hunter', name: 'Kael', epithet: 'Walker of the Wilds', gender: 'Male', aura: '#65a30d',
    personality: { openness: 0.9, conscientiousness: 0.6, extraversion: 0.2, agreeableness: 0.5, neuroticism: 0.2, piety: 0.5 },
    proficiencies: { architecture: 30, warfare: 70, statesmanship: 20, farming: 60, science: 40, mysticism: 40 },
    vices: { wrath: 0.2 }, text: 'A quiet hermit and explorer, a hunter who roams the land alone.' }
];

const FORMATS = {
  pct: v => `${Math.round(v * 100)}%`,
  int: v => String(Math.round(v)),
  x: v => `${Number(v).toFixed(2)}×`,
  dec: v => Number(v).toFixed(1),
  yrs: v => `${Math.round(v)} yrs`,
  au: v => `${Math.round(v)} AU`
};

const getPath = (obj, path) => path.reduce((o, k) => (o ? o[k] : undefined), obj);
const setPath = (obj, path, value) => {
  const last = path[path.length - 1];
  getPath(obj, path.slice(0, -1))[last] = value;
};

// A random body plan and colouring (UI randomness only: it must not consume the simulation's seeded stream)
function randomLook() {
  const look = {};
  for (const gene of BODY_GENES) look[gene] = gene === "mutation" ? (Math.random() < 0.8 ? 0 : 1 + Math.floor(Math.random() * (PART_COUNTS.mutation - 1))) : Math.floor(Math.random() * PART_COUNTS[gene]);
  for (const gene of COLOR_GENES) look[gene] = Math.random();
  return look;
}

export class CreationWorkshop {
  // options: { root, getSim(): the active simulation, getSystemName(): current star system name,
  //            onSpawnReady({ type, species, config?, founders? }), onPlanetReady(planetConfig) }
  constructor({ root, getSim, getSystemName = () => 'this system', onSpawnReady, onPlanetReady }) {
    this.root = root;
    this.getSim = getSim;
    this.getSystemName = getSystemName;
    this.onSpawnReady = onSpawnReady;
    this.activeTab = 'champion';
    this.planetCreator = new PlanetCreator(onPlanetReady);

    this.championConfig = {
      name: 'Eve',
      epithet: 'The Firstborn Prophet',
      gender: 'Female',
      aiSystem: 'LAYA', // 'LAYA' or 'MINECRAFT' (the needs-and-jobs brain every mortal has)
      appearance: { auraColor: '#ffd700' },
      personality: { openness: 0.85, conscientiousness: 0.9, extraversion: 0.75, agreeableness: 0.8, neuroticism: 0.2, piety: 0.98 },
      proficiencies: { architecture: 80, warfare: 50, statesmanship: 95, farming: 70, science: 85, mysticism: 98 },
      vices: { ...blankVices(), pride: 0.2 },
      persona: { text: '', tags: [] }
    };
    this.champLook = randomLook(); // the parts and colours of the champion (only the people's own parts are offered)

    this.speciesConfig = {
      name: 'Star Chimera',
      type: 'herbivore',   // 'humanoid' makes a sapient species
      diet: 'herbivore',
      founders: 8,
      size: 1.2,
      speed: 1.4,
      lifespan: 40,
      coldResist: 0.7,
      heatResist: 0.6,
      // fine control over the nature of the creature (0..1 genes)
      traits: { intelligence: 0.25, aggression: 0.3, sociality: 0.6, fertility: 0.6, perception: 0.6, metabolism: 0.5, prefTemp: 0.5 }
    };
    this.look = randomLook();
    // how it is drawn: from parts (the look above) or a ready-made sprite sheet (art/sheetSprites.js)
    this.sheetStyle = 'parts';
    this.sheetTarget = 'all';
    this.sheetPick = { all: null, M: null, F: null };
    this.champSheetStyle = 'people';
    this.animFrame = 0;

    this.championConfig.appearance.sheet = null;
    this.state = { champion: this.championConfig, species: this.speciesConfig, planet: this.planetCreator.config };
    this.canvas = root.querySelector('#ws-preview-canvas');
    this.spawnBtn = root.querySelector('#btn-spawn-creation');
    this.bind();
    this.mountEditors();
    this.syncForm();
  }

  bind() {
    const root = this.root;
    for (const tab of root.querySelectorAll('.ws-tab')) {
      tab.addEventListener('click', () => this.selectTab(tab.dataset.tab));
    }
    for (const el of root.querySelectorAll('[data-field]')) {
      const event = el.tagName === 'SELECT' || el.type === 'radio' ? 'change' : 'input';
      el.addEventListener(event, () => {
        if (el.type === 'radio' && !el.checked) return;
        let value = el.value;
        if (el.type === 'range' || el.dataset.type === 'number') value = parseFloat(value);
        else if (el.dataset.type === 'boolean') value = value === 'true';
        setPath(this.state, el.dataset.field.split('.'), value);
        this.updateOutput(el);
        this.refresh();
      });
    }
    root.querySelector('#ws-reroll-look').addEventListener('click', () => {
      sounds.playUIClick();
      this.look = randomLook();
      this.parts.setLook(this.look);
      this.colours.setLook(this.look);
      this.refresh();
    });
    root.querySelector('#btn-close-workshop').addEventListener('click', () => this.close());
    root.querySelector('#btn-cancel-workshop').addEventListener('click', () => this.close());
    this.spawnBtn.addEventListener('click', () => this.create());
  }

  // The look editors: part strips, colours, the sprite-sheet browsers and the archetype buttons
  mountEditors() {
    const root = this.root;
    this.parts = new PartsPicker(root.querySelector('#ws-parts'), this.look, () => this.refresh());
    this.colours = new ColourControls(root.querySelector('#ws-colours'), this.look, () => { this.parts.refresh(); this.refresh(); });
    this.sheetPicker = new SheetPicker(root.querySelector('#ws-sheet-picker'), {
      onPick: (id) => { this.sheetPick[this.sheetTarget] = id; this.updateSheetNote(); this.refresh(); }
    });
    this.champPicker = new SheetPicker(root.querySelector('#ws-champ-picker'), {
      categories: ['people', 'soldier', 'monster', 'other', 'boss', 'school', 'festive'],
      onPick: (id) => { this.championConfig.appearance.sheet = id; this.refresh(); }
    });
    // how the species is drawn
    for (const b of root.querySelectorAll('[data-style]')) {
      b.addEventListener('click', () => {
        this.sheetStyle = b.dataset.style;
        for (const o of root.querySelectorAll('[data-style]')) o.classList.toggle('active', o === b);
        root.querySelector('#ws-style-parts').hidden = this.sheetStyle !== 'parts';
        root.querySelector('#ws-style-sheet').hidden = this.sheetStyle !== 'sheet';
        this.refresh();
      });
    }
    for (const r of root.querySelectorAll('input[name="sheet-target"]')) {
      r.addEventListener('change', () => {
        if (!r.checked) return;
        this.sheetTarget = r.value;
        this.sheetPicker.select(this.sheetPick[this.sheetTarget]);
        this.updateSheetNote();
      });
    }
    // how the champion is drawn
    for (const b of root.querySelectorAll('[data-champ-style]')) {
      b.addEventListener('click', () => {
        this.champSheetStyle = b.dataset.champStyle;
        for (const o of root.querySelectorAll('[data-champ-style]')) o.classList.toggle('active', o === b);
        root.querySelector('#ws-champ-sheet').hidden = this.champSheetStyle !== 'sheet';
        root.querySelector('#ws-champ-people').hidden = this.champSheetStyle !== 'people';
        if (this.champSheetStyle === 'people') this.championConfig.appearance.sheet = null;
        else if (this.champPicker.selected) this.championConfig.appearance.sheet = this.champPicker.selected;
        this.refresh();
      });
    }
    // the champion's look and who they are
    const CHAMP_GENES = ['head', 'ears', 'tail', 'horns', 'pattern', 'mutation'];
    this.champParts = new PartsPicker(root.querySelector('#ws-champ-parts'), this.champLook, () => this.refresh(), CHAMP_GENES);
    this.champColours = new ColourControls(root.querySelector('#ws-champ-colours'), this.champLook, () => { this.champParts.refresh(); this.refresh(); });
    const cbox = root.querySelector('#ws-champ-archetypes');
    for (const c of CHAMPIONS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = c.label;
      b.addEventListener('click', () => this.applyChampion(c));
      cbox.appendChild(b);
    }
    const desc = root.querySelector('#ws-champ-desc');
    desc.addEventListener('input', () => { this.championConfig.persona = { text: desc.value, tags: interpret(desc.value).tags }; });
    root.querySelector('#ws-champ-read').addEventListener('click', () => {
      sounds.playUIClick();
      const r = applyInterpretation(this.championConfig, desc.value);
      const out = root.querySelector('#ws-champ-read-out');
      const bits = [];
      for (const [k, d] of Object.entries(r.vices)) if (d) bits.push(`${d > 0 ? '+' : '−'}${k}`);
      for (const [k, d] of Object.entries(r.personality)) if (d) bits.push(`${d > 0 ? '+' : '−'}${k}`);
      for (const [k, d] of Object.entries(r.proficiencies)) if (d) bits.push(`${d > 0 ? '+' : '−'}${k}`);
      out.textContent = r.matched.length ? `Laya understood: ${r.matched.join(', ')} → ${bits.join(' ')}${r.tags.length ? ' • interests: ' + r.tags.join(', ') : ''}` : 'Laya found nothing it knows in that. Try words like proud, greedy, gentle, lazy, warrior, scholar, hermit…';
      this.syncForm();
      this.refresh();
    });
    // starting points
    const box = root.querySelector('#ws-archetypes');
    for (const a of ARCHETYPES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = a.label;
      b.addEventListener('click', () => this.applyArchetype(a));
      box.appendChild(b);
    }
    this.updateSheetNote();
  }

  updateSheetNote() {
    const note = this.root.querySelector('#ws-sheet-chosen');
    const label = id => (id && sheetInfo(id) ? sheetInfo(id).label : 'none yet');
    const p = this.sheetPick;
    note.textContent = `Everyone: ${label(p.all)} • Females: ${label(p.F)} • Males: ${label(p.M)}. A sex without its own pick uses "everyone".`;
  }

  applyArchetype(a) {
    sounds.playUIClick();
    const c = this.speciesConfig;
    Object.assign(c, { name: a.cfg.name, type: a.cfg.type, diet: a.cfg.diet, size: a.cfg.size, speed: a.cfg.speed, lifespan: a.cfg.lifespan });
    if (a.cfg.coldResist !== undefined) c.coldResist = a.cfg.coldResist;
    if (a.cfg.heatResist !== undefined) c.heatResist = a.cfg.heatResist;
    c.traits = { intelligence: a.cfg.type === 'humanoid' ? 0.9 : 0.25, aggression: 0.3, sociality: 0.6, fertility: 0.6, perception: 0.6, metabolism: 0.5, prefTemp: 0.5, ...(a.traits || {}) };
    Object.assign(this.look, a.look);
    // an archetype is a parts-built species
    this.sheetStyle = 'parts';
    for (const o of this.root.querySelectorAll('[data-style]')) o.classList.toggle('active', o.dataset.style === 'parts');
    this.root.querySelector('#ws-style-parts').hidden = false;
    this.root.querySelector('#ws-style-sheet').hidden = true;
    this.parts.refresh();
    this.colours.refresh();
    this.syncForm();
    this.refresh();
  }

  open(tab = this.activeTab) {
    clearInterval(this.animTimer);
    this.animTimer = setInterval(() => { this.animFrame++; if (!this.root.classList.contains('hidden')) this.drawPreview(); }, 260);
    loadCatalog().then(() => { this.sheetPicker.renderGrid(); this.champPicker.renderGrid(); });
    // the champion starts as one of the people: their own parts and colours, to be changed from there
    const sim = this.getSim();
    const people = sim ? sim.ecosystem.sapientSpecies() : null;
    if (people && this.champLookFrom !== people.id) {
      this.champLookFrom = people.id;
      for (const g of Object.keys(this.champLook)) if (g in people.centroid) this.champLook[g] = people.centroid[g];
      this.champParts.refresh();
      this.champColours.refresh();
    }
    this.root.classList.remove('hidden');
    this.selectTab(tab);
  }

  close() {
    clearInterval(this.animTimer);
    sounds.playUIClick();
    this.root.classList.add('hidden');
  }

  selectTab(tab) {
    this.activeTab = tab;
    for (const btn of this.root.querySelectorAll('.ws-tab')) {
      const on = btn.dataset.tab === tab;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-selected', String(on));
    }
    for (const panel of this.root.querySelectorAll('[data-panel]')) panel.hidden = panel.dataset.panel !== tab;
    for (const box of this.root.querySelectorAll('.ws-preview-actions')) box.hidden = box.dataset.for !== tab;
    this.refresh();
  }

  // Puts the config values into the form (after construction and presets).
  syncForm() {
    for (const el of this.root.querySelectorAll('[data-field]')) {
      const value = getPath(this.state, el.dataset.field.split('.'));
      if (el.type === 'radio') el.checked = String(value) === el.value;
      else el.value = String(value);
      this.updateOutput(el);
    }
  }

  updateOutput(el) {
    const out = el.parentElement.querySelector('output');
    if (out && FORMATS[el.dataset.format]) out.textContent = FORMATS[el.dataset.format](parseFloat(el.value));
  }

  applyChampion(preset) {
    sounds.playUIClick();
    const c = this.championConfig;
    Object.assign(c, { name: preset.name, epithet: preset.epithet, gender: preset.gender });
    c.appearance.auraColor = preset.aura;
    Object.assign(c.personality, preset.personality);
    Object.assign(c.proficiencies, preset.proficiencies);
    c.vices = { ...blankVices(), ...preset.vices };
    c.persona = { text: preset.text, tags: interpret(preset.text).tags };
    this.root.querySelector('#ws-champ-desc').value = preset.text;
    this.root.querySelector('#ws-champ-read-out').textContent = '';
    this.syncForm();
    this.refresh();
  }

  // ---------- preview ----------

  // Traits of the custom species as it will be founded (mirrors ecosystem.createCustomSpecies)
  speciesPreviewTraits() {
    const traits = Object.fromEntries(ALL_GENES.map(g => [g, 0.5]));
    Object.assign(traits, this.look);
    if (this.speciesConfig.type === 'humanoid') Object.assign(traits, { legs: 1, wings: 0 });
    return traits;
  }

  refresh() {
    const sim = this.getSim();
    const title = this.root.querySelector('#ws-preview-title');
    const sub = this.root.querySelector('#ws-preview-sub');
    const note = this.root.querySelector('#ws-preview-note');
    const target = this.root.querySelector('#ws-target');
    const planetName = sim ? sim.planet.name : 'this planet';
    let canCreate = Boolean(sim);
    note.textContent = '';

    if (this.activeTab === 'champion') {
      const people = sim ? sim.ecosystem.sapientSpecies() : null;
      title.textContent = this.championConfig.name;
      sub.textContent = this.championConfig.epithet;
      if (people) {
        note.textContent = `One of the ${people.name}`;
        this.drawPreview();
      } else {
        note.textContent = `No people live on ${planetName} yet. Create a sapient species first.`;
        this.drawEmpty();
        canCreate = false;
      }
      target.textContent = `Placed on ${planetName}`;
      this.spawnBtn.textContent = '✨ Place champion';
    } else if (this.activeTab === 'species') {
      const s = this.speciesConfig;
      title.textContent = s.name;
      const swimmer = this.sheetStyle === 'parts' && [6, 13, 14].includes(Math.round(this.look.body));
      sub.textContent = `${s.type === 'humanoid' ? 'Sapient' : 'Animal'} • ${s.diet}${swimmer ? ' • lives in the sea' : ''}`;
      note.textContent = swimmer ? 'A swimmer: place its founders on water.' : '';
      this.drawPreview();
      target.textContent = `${s.founders} founders on ${planetName}`;
      this.spawnBtn.textContent = '✨ Place founders';
    } else {
      const p = this.planetCreator.config;
      title.textContent = p.name;
      sub.textContent = `${p.type} • ${Math.round(p.distance)} AU`;
      this.drawPlanet(p);
      target.textContent = `Added to ${this.getSystemName()}`;
      this.spawnBtn.textContent = '🪐 Create planet';
    }
    this.spawnBtn.disabled = !canCreate;
  }

  clearStage() {
    const ctx = this.canvas.getContext('2d');
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    return ctx;
  }

  drawEmpty() {
    const ctx = this.clearStage();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = '48px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', this.canvas.width / 2, this.canvas.height / 2);
  }

  drawCreature(traits, aura, scale, frame = 0) {
    const ctx = this.clearStage();
    const { width, height } = this.canvas;
    if (aura) {
      const glow = ctx.createRadialGradient(width / 2, height / 2, 8, width / 2, height / 2, width / 2);
      glow.addColorStop(0, aura + 'aa');
      glow.addColorStop(1, aura + '00');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);
    }
    const w = Math.round(SPRITE_W * scale);
    const h = Math.round(SPRITE_H * scale);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(getCreatureCanvas(traits, frame), Math.round((width - w) / 2), Math.round((height - h) / 2), w, h);
  }

  // The creature being made, walking on the spot (both the part-built look and the ready-made sheets)
  drawPreview() {
    if (this.activeTab === 'planet') return;
    const ctx = this.clearStage();
    const { width, height } = this.canvas;
    const frame = this.animFrame;
    ctx.imageSmoothingEnabled = false;
    const sheetOf = (id, dir) => id && sheetInfo(id) && drawSheet(ctx, id, dir, WALK_FRAMES[frame % 4], width / 2, height * 0.9, height * 0.85);
    const dirs = ['down', 'right', 'up', 'left'];
    const dir = dirs[Math.floor(frame / 6) % 4];
    if (this.activeTab === 'champion') {
      const aura = this.championConfig.appearance.auraColor;
      const glow = ctx.createRadialGradient(width / 2, height / 2, 8, width / 2, height / 2, width / 2);
      glow.addColorStop(0, aura + 'aa');
      glow.addColorStop(1, aura + '00');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);
      if (this.championConfig.appearance.sheet && sheetOf(this.championConfig.appearance.sheet, dir)) return;
      const sim = this.getSim();
      const people = sim ? sim.ecosystem.sapientSpecies() : null;
      if (people) this.drawCreature({ ...people.centroid, ...this.champLook, body: people.centroid.body, legs: people.centroid.legs, wings: people.centroid.wings }, null, 6, frame & 1);
      return;
    }
    const sp = this.speciesConfig;
    if (this.sheetStyle === 'sheet') {
      const id = this.sheetPick[this.sheetTarget] || this.sheetPick.all || this.sheetPick.F || this.sheetPick.M;
      if (!(id && sheetOf(id, dir))) {
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.font = '13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Pick a sprite below', width / 2, height / 2);
      }
      return;
    }
    this.drawCreature(this.speciesPreviewTraits(), null, 3.5 + sp.size * 1.5, frame & 1);
  }

  drawPlanet(p) {
    const ctx = this.clearStage();
    const { width, height } = this.canvas;
    const cx = width / 2;
    const cy = height / 2;
    const r = 18 + p.radius * 7;
    if (p.hasAtmosphere) {
      const atmo = ctx.createRadialGradient(cx, cy, r * 0.9, cx, cy, r * 1.25);
      atmo.addColorStop(0, 'rgba(125, 211, 252, 0.45)');
      atmo.addColorStop(1, 'rgba(125, 211, 252, 0)');
      ctx.fillStyle = atmo;
      ctx.fillRect(0, 0, width, height);
    }
    const ring = (front) => {
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(cx, cy, r * 1.7, r * 0.42, -0.35, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2);
      ctx.strokeStyle = 'rgba(212, 175, 55, 0.85)';
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.restore();
    };
    if (p.hasRings) ring(false);
    const body = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r);
    body.addColorStop(0, '#ffffff');
    body.addColorStop(0.15, p.color);
    body.addColorStop(1, '#020617');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    if (p.hasRings) ring(true);
  }

  // ---------- creating ----------

  create() {
    const sim = this.getSim();
    if (this.activeTab === 'planet') {
      this.root.classList.add('hidden');
      this.planetCreator.create();
      return;
    }
    if (!sim) return;
    sounds.playUIClick();
    if (this.activeTab === 'champion') {
      const people = sim.ecosystem.sapientSpecies();
      if (!people) return;
      this.onSpawnReady({ type: 'champion', species: people, config: { ...JSON.parse(JSON.stringify(this.championConfig)), look: this.champSheetStyle === 'people' ? { ...this.champLook } : null } });
    } else {
      sounds.playDivineBlessing();
      const sc = this.speciesConfig;
      const picks = this.sheetPick;
      const sheets = this.sheetStyle === 'sheet' && (picks.all || picks.F || picks.M)
        ? { any: picks.all || picks.F || picks.M, ...(picks.F ? { F: picks.F } : {}), ...(picks.M ? { M: picks.M } : {}) }
        : null;
      const species = sim.ecosystem.createCustomSpecies({ ...sc, look: { ...this.look }, sheets });
      this.onSpawnReady({ type: 'species', species, founders: this.speciesConfig.founders });
      this.look = randomLook(); // the next species gets its own look
      this.parts.setLook(this.look);
      this.colours.setLook(this.look);
    }
  }
}
