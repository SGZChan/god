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
import { sounds } from '../audio/soundFX.js';

const PRESETS = {
  prophet: {
    name: 'Seraphina', epithet: 'The Sacred Voice', gender: 'Female', aiSystem: 'LAYA', aura: '#38bdf8',
    personality: { openness: 0.95, conscientiousness: 0.7, extraversion: 0.85, agreeableness: 0.85, piety: 1 },
    proficiencies: { architecture: 50, warfare: 20, statesmanship: 90, farming: 50, science: 60, mysticism: 100 }
  },
  warlord: {
    name: 'Vulkan', epithet: 'The Divine Conqueror', gender: 'Male', aiSystem: 'LAYA', aura: '#ef4444',
    personality: { openness: 0.4, conscientiousness: 0.8, extraversion: 0.8, agreeableness: 0.2, piety: 0.85 },
    proficiencies: { architecture: 40, warfare: 100, statesmanship: 85, farming: 30, science: 35, mysticism: 50 }
  },
  architect: {
    name: 'Daedalus', epithet: 'Master of Foundations', gender: 'Male', aiSystem: 'LAYA', aura: '#10b981',
    personality: { openness: 0.8, conscientiousness: 1, extraversion: 0.5, agreeableness: 0.7, piety: 0.75 },
    proficiencies: { architecture: 100, warfare: 30, statesmanship: 60, farming: 60, science: 95, mysticism: 55 }
  },
  sage: {
    name: 'Ilyra', epithet: 'Sage of the Stars', gender: 'Female', aiSystem: 'LAYA', aura: '#a855f7',
    personality: { openness: 1, conscientiousness: 0.75, extraversion: 0.4, agreeableness: 0.8, piety: 0.6 },
    proficiencies: { architecture: 55, warfare: 15, statesmanship: 55, farming: 45, science: 100, mysticism: 85 }
  }
};

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
      proficiencies: { architecture: 80, warfare: 50, statesmanship: 95, farming: 70, science: 85, mysticism: 98 }
    };

    this.speciesConfig = {
      name: 'Star Chimera',
      type: 'herbivore',   // 'humanoid' makes a sapient species
      diet: 'herbivore',
      founders: 8,
      size: 1.2,
      speed: 1.4,
      lifespan: 40,
      coldResist: 0.7,
      heatResist: 0.6
    };
    this.look = randomLook();

    this.state = { champion: this.championConfig, species: this.speciesConfig, planet: this.planetCreator.config };
    this.canvas = root.querySelector('#ws-preview-canvas');
    this.spawnBtn = root.querySelector('#btn-spawn-creation');
    this.bind();
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
    for (const btn of root.querySelectorAll('.preset-btn[data-preset]')) {
      btn.addEventListener('click', () => this.applyPreset(btn.dataset.preset));
    }
    root.querySelector('#ws-reroll-look').addEventListener('click', () => {
      sounds.playUIClick();
      this.look = randomLook();
      this.refresh();
    });
    root.querySelector('#btn-close-workshop').addEventListener('click', () => this.close());
    root.querySelector('#btn-cancel-workshop').addEventListener('click', () => this.close());
    this.spawnBtn.addEventListener('click', () => this.create());
  }

  open(tab = this.activeTab) {
    this.root.classList.remove('hidden');
    this.selectTab(tab);
  }

  close() {
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

  applyPreset(key) {
    const preset = PRESETS[key];
    if (!preset) return;
    sounds.playUIClick();
    const c = this.championConfig;
    Object.assign(c, { name: preset.name, epithet: preset.epithet, gender: preset.gender, aiSystem: preset.aiSystem });
    c.appearance.auraColor = preset.aura;
    Object.assign(c.personality, preset.personality);
    Object.assign(c.proficiencies, preset.proficiencies);
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
        this.drawCreature(people.centroid, this.championConfig.appearance.auraColor, 6);
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
      sub.textContent = `${s.type === 'humanoid' ? 'Sapient' : 'Animal'} • ${s.diet}`;
      this.drawCreature(this.speciesPreviewTraits(), null, 3.5 + s.size * 1.5);
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

  drawCreature(traits, aura, scale) {
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
    ctx.drawImage(getCreatureCanvas(traits, 0), Math.round((width - w) / 2), Math.round((height - h) / 2), w, h);
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
      this.onSpawnReady({ type: 'champion', species: people, config: JSON.parse(JSON.stringify(this.championConfig)) });
    } else {
      sounds.playDivineBlessing();
      const species = sim.ecosystem.createCustomSpecies({ ...this.speciesConfig, look: { ...this.look } });
      this.onSpawnReady({ type: 'species', species, founders: this.speciesConfig.founders });
      this.look = randomLook(); // the next species gets its own look
    }
  }
}
