// The categorized power palette: category tabs, a scrollable icon grid, search, tooltips, hotkeys 1-9,
// an active-power indicator in the hint banner and the optional divine-energy meter.
//
// Markup lives in index.html (#power-palette); this module fills the tabs and the grid and wires the events.
import { CATEGORIES, PLAYER_POWERS, POWER_BY_ID } from '../god/powerCatalog.js';
import { makePowerIcon } from '../art/powerIcons.js';
import { godSettings } from '../god/godSettings.js';

const SETTINGS_KEY = 'genesis-cosmos-god-settings';

export function loadGodSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
    if (saved) {
      if (typeof saved.sandbox === 'boolean') godSettings.sandbox = saved.sandbox;
      if (typeof saved.naturalDisasters === 'boolean') godSettings.naturalDisasters = saved.naturalDisasters;
    }
  } catch { /* private mode: keep the defaults */ }
}

function saveGodSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(godSettings)); } catch { /* ignore */ }
}

const isTyping = el => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);

export class PowerPalette {
  // options: { root, onSelect(power), isActive(): bool (hotkeys only work on the surface), getDivine(): manager|null }
  constructor({ root, onSelect, isActive = () => true, getDivine = () => null }) {
    this.root = root;
    this.onSelect = onSelect;
    this.isActive = isActive;
    this.getDivine = getDivine;
    this.category = 'blessings';
    this.query = '';
    this.activeId = 'INSPECT';
    this.cells = new Map();   // id -> button
    this.visible = [];        // ids shown now, in order

    this.tabsEl = root.querySelector('.pp-tabs');
    this.gridEl = root.querySelector('.pp-grid');
    this.searchEl = root.querySelector('.pp-search input');
    this.energyEl = root.querySelector('.pp-energy');
    this.energyFill = root.querySelector('.pp-energy-fill');
    this.energyText = root.querySelector('.pp-energy-text');
    this.tooltip = document.getElementById('pp-tooltip');
    this.bannerIcon = document.getElementById('power-hint-icon');
    this.bannerText = document.getElementById('power-hint-text');

    this.buildTabs();
    this.buildGrid();
    this.bindTools();
    this.bindSearch();
    this.bindHotkeys();
    this.refresh();
    this.setActive(POWER_BY_ID.INSPECT);
  }

  buildTabs() {
    this.tabsEl.innerHTML = '';
    this.tabs = new Map();
    for (const cat of CATEGORIES) {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'pp-tab';
      tab.setAttribute('role', 'tab');
      tab.dataset.category = cat.id;
      tab.textContent = cat.name;
      tab.title = cat.blurb;
      tab.addEventListener('click', () => {
        this.category = cat.id;
        this.query = '';
        if (this.searchEl) this.searchEl.value = '';
        this.refresh();
      });
      tab.addEventListener('keydown', (e) => {
        const ids = CATEGORIES.map(c => c.id);
        const i = ids.indexOf(cat.id);
        let next = null;
        if (e.key === 'ArrowRight') next = ids[(i + 1) % ids.length];
        else if (e.key === 'ArrowLeft') next = ids[(i + ids.length - 1) % ids.length];
        if (next) {
          e.preventDefault();
          this.tabs.get(next).focus();
          this.tabs.get(next).click();
        }
      });
      this.tabsEl.appendChild(tab);
      this.tabs.set(cat.id, tab);
    }
  }

  buildGrid() {
    this.gridEl.innerHTML = '';
    for (const power of PLAYER_POWERS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'power-btn pp-cell';
      btn.dataset.power = power.id;
      btn.dataset.category = power.category;
      btn.setAttribute('role', 'option');
      btn.setAttribute('aria-label', `${power.name}. ${power.description}`);
      btn.appendChild(makePowerIcon(power.icon, 30));
      const hot = document.createElement('span');
      hot.className = 'pp-hot';
      btn.appendChild(hot);
      const cost = document.createElement('span');
      cost.className = 'pp-cost';
      cost.textContent = power.cost ? String(power.cost) : '';
      btn.appendChild(cost);
      btn.addEventListener('click', () => this.choose(power.id));
      btn.addEventListener('mouseenter', () => this.showTip(power, btn));
      btn.addEventListener('mouseleave', () => this.hideTip());
      btn.addEventListener('focus', () => { if (btn.matches(':focus-visible')) this.showTip(power, btn); });
      btn.addEventListener('blur', () => this.hideTip());
      btn.addEventListener('keydown', e => this.gridKey(e, btn));
      this.gridEl.appendChild(btn);
      this.cells.set(power.id, btn);
    }
    this.gridEl.addEventListener('scroll', () => this.hideTip(), { passive: true });
  }

  bindTools() {
    // Inspect / Pan live outside the grid (static markup)
    for (const btn of this.root.querySelectorAll('.pp-tool[data-power]')) {
      const power = POWER_BY_ID[btn.dataset.power];
      if (btn.dataset.icon !== 'done') {
        btn.prepend(makePowerIcon(power.icon, 26));
        btn.dataset.icon = 'done';
      }
      btn.addEventListener('click', () => this.choose(power.id));
      btn.addEventListener('mouseenter', () => this.showTip(power, btn));
      btn.addEventListener('mouseleave', () => this.hideTip());
      btn.addEventListener('focus', () => { if (btn.matches(':focus-visible')) this.showTip(power, btn); });
      btn.addEventListener('blur', () => this.hideTip());
      this.cells.set(power.id, btn);
    }
    // the cosmic / workshop buttons get drawn icons too
    for (const btn of this.root.querySelectorAll('[data-icon-id]')) {
      btn.prepend(makePowerIcon(btn.dataset.iconId, 24));
    }
  }

  bindSearch() {
    if (!this.searchEl) return;
    this.searchEl.addEventListener('input', () => {
      this.query = this.searchEl.value.trim().toLowerCase();
      this.refresh();
    });
    this.searchEl.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.searchEl.value = '';
        this.query = '';
        this.searchEl.blur();
        this.refresh();
      } else if (e.key === 'Enter' && this.visible.length) {
        this.choose(this.visible[0]);
      }
    });
  }

  bindHotkeys() {
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target) || !this.isActive()) return;
      if (e.key >= '1' && e.key <= '9') {
        const id = this.visible[parseInt(e.key, 10) - 1];
        if (id) {
          e.preventDefault();
          this.choose(id);
        }
      } else if (e.key === 'Escape') {
        this.choose('INSPECT');
      } else if (e.key === '/' && this.searchEl) {
        e.preventDefault();
        this.searchEl.focus();
      }
    });
  }

  gridKey(e, btn) {
    const cells = this.visible.map(id => this.cells.get(id));
    const i = cells.indexOf(btn);
    let next = -1;
    if (e.key === 'ArrowRight') next = i + 1;
    else if (e.key === 'ArrowLeft') next = i - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = cells.length - 1;
    if (next >= 0 && next < cells.length) {
      e.preventDefault();
      cells[next].focus();
      cells[next].scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  // Show the powers of the current tab (or the search matches) and number the first nine
  refresh() {
    const q = this.query;
    this.visible = [];
    for (const power of PLAYER_POWERS) {
      const btn = this.cells.get(power.id);
      const match = q
        ? (power.name + ' ' + power.description + ' ' + power.category).toLowerCase().includes(q)
        : power.category === this.category;
      btn.hidden = !match;
      if (match) this.visible.push(power.id);
    }
    this.visible.forEach((id, i) => {
      this.cells.get(id).querySelector('.pp-hot').textContent = i < 9 ? String(i + 1) : '';
    });
    for (const [id, tab] of this.tabs) {
      const on = !q && id === this.category;
      tab.classList.toggle('active', on);
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on || (q && id === this.category) ? 0 : -1;
    }
    this.gridEl.classList.toggle('empty', this.visible.length === 0);
    this.gridEl.dataset.empty = this.visible.length === 0 ? 'No power matches that search.' : '';
    this.gridEl.scrollLeft = 0;
    this.hideTip();
  }

  choose(id) {
    const power = POWER_BY_ID[id];
    if (!power) return;
    this.onSelect(power);
    this.setActive(power);
    this.hideTip();
    // jump to its tab so the highlighted cell is visible
    if (power.category !== 'tools' && !this.query && power.category !== this.category) {
      this.category = power.category;
      this.refresh();
    }
  }

  // Marks `power` as the active one and updates the hint banner. Also accepts non-catalog powers (spawning).
  setActive(power) {
    this.activeId = power ? power.id : null;
    for (const [id, btn] of this.cells) {
      const on = id === this.activeId;
      btn.classList.toggle('active', on);
      btn.setAttribute(btn.getAttribute('role') === 'option' ? 'aria-selected' : 'aria-pressed', String(on));
    }
    if (!power) return;
    if (this.bannerIcon) {
      this.bannerIcon.textContent = '';
      this.bannerIcon.appendChild(makePowerIcon(power.icon || 'BLESSING', 22));
    }
    if (this.bannerText) {
      const cost = power.cost ? ` (${power.cost} energy)` : '';
      this.bannerText.textContent = power.category === 'tools' || !power.description
        ? `${power.name} — ${power.description || ''}`
        : `${power.name}${cost} — ${power.description}`;
    }
  }

  showTip(power, anchor) {
    const tip = this.tooltip;
    if (!tip) return;
    const cat = CATEGORIES.find(c => c.id === power.category);
    const idx = this.visible.indexOf(power.id);
    tip.innerHTML = '';
    const title = document.createElement('div');
    title.className = 'pp-tip-title';
    title.textContent = power.name;
    if (cat) {
      const chip = document.createElement('span');
      chip.className = 'pp-tip-chip pp-cat-' + cat.id;
      chip.textContent = cat.name;
      title.appendChild(chip);
    }
    const desc = document.createElement('div');
    desc.className = 'pp-tip-desc';
    desc.textContent = power.description;
    const meta = document.createElement('div');
    meta.className = 'pp-tip-meta';
    const bits = [];
    if (power.cost) bits.push(`Cost ${power.cost}`);
    if (power.radius) bits.push(`Radius ${power.radius}`);
    if (power.isDraggable) bits.push('Drag to paint');
    if (idx >= 0 && idx < 9) bits.push(`Key ${idx + 1}`);
    meta.textContent = bits.join('  ·  ');
    tip.append(title, desc);
    if (bits.length) tip.appendChild(meta);
    tip.hidden = false;
    const rect = anchor.getBoundingClientRect();
    const tw = tip.offsetWidth;
    const left = Math.max(8, Math.min(window.innerWidth - tw - 8, rect.left + rect.width / 2 - tw / 2));
    tip.style.left = left + 'px';
    const dockTop = this.root.getBoundingClientRect().top;
    tip.style.top = Math.max(8, Math.min(rect.top, dockTop) - tip.offsetHeight - 10) + 'px';
  }

  hideTip() {
    if (this.tooltip) this.tooltip.hidden = true;
  }

  // Energy meter and affordability, called a few times a second
  update() {
    const divine = this.getDivine();
    const sandbox = godSettings.sandbox;
    if (this.energyEl) {
      this.energyEl.classList.toggle('sandbox', sandbox);
      const pct = !divine || sandbox ? 100 : Math.round(divine.energy);
      this.energyFill.style.width = pct + '%';
      this.energyText.textContent = sandbox ? 'Sandbox' : `${pct}`;
      this.energyEl.title = sandbox ? 'Sandbox mode: unlimited divine energy (change in the menu)' : 'Divine energy. Bigger powers cost more; it refills over time.';
      this.energyEl.setAttribute('aria-label', sandbox ? 'Divine energy: unlimited (sandbox mode)' : `Divine energy ${pct} of 100`);
    }
    for (const power of PLAYER_POWERS) {
      const btn = this.cells.get(power.id);
      const poor = !sandbox && divine && divine.energy < power.cost;
      btn.classList.toggle('poor', Boolean(poor));
    }
  }
}

// Menu toggles for the god settings (sandbox energy, natural disasters)
export function bindGodMenu(onChange = () => {}) {
  for (const [id, key] of [['menu-sandbox', 'sandbox'], ['menu-disasters', 'naturalDisasters']]) {
    const item = document.getElementById(id);
    if (!item) continue;
    const sync = () => {
      item.setAttribute('aria-checked', String(godSettings[key]));
      item.classList.toggle('on', godSettings[key]);
    };
    sync();
    item.addEventListener('click', () => {
      godSettings[key] = !godSettings[key];
      saveGodSettings();
      sync();
      onChange(key, godSettings[key]);
    });
  }
}
