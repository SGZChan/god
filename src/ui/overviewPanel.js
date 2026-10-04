// World overview: a live summary of civilizations, wildlife and recent events.
// summarizeWorld() is a pure data model (testable in Node); OverviewPanel renders it.
import { ERAS } from '../civilization/techTree.js';
import { creatureDataURL } from '../art/creatureSprite.js';

export function civStatus(civ) {
  if (civ.warTarget) return { kind: 'war', label: `At war with ${civ.warTarget.name}` };
  if (civ.truce > 0) return { kind: 'truce', label: 'Truce' };
  return { kind: 'peace', label: 'Peace' };
}

// Progress (0-100) towards the next tech era.
export function eraProgress(civ) {
  const index = ERAS.findIndex(e => e.id === civ.era.id);
  const next = ERAS[index + 1];
  if (!next) return { percent: 100, nextName: null };
  const span = next.reqPoints - civ.era.reqPoints;
  const percent = ((civ.techPoints - civ.era.reqPoints) / span) * 100;
  return { percent: Math.max(0, Math.min(100, percent)), nextName: next.name };
}

export function summarizeWorld(sim) {
  const civs = sim.society.civilizations;
  const alive = civs.filter(c => c.isAlive);
  const extinct = sim.ecosystem.extinctions;

  return {
    planetName: sim.planet ? sim.planet.name : 'Unknown world',
    creatures: sim.ecosystem.entities.filter(e => e.alive).length,
    fallen: civs.length - alive.length,
    civs: alive.map(civ => ({
      id: civ.id,
      name: civ.name,
      symbol: civ.symbol,
      color: civ.color,
      government: civ.government.name,
      era: civ.era.name,
      citizens: civ.citizens,
      soldiers: civ.soldiers,
      territory: civ.territory.length,
      status: civStatus(civ),
      progress: eraProgress(civ)
    })),
    wildlife: sim.ecosystem.speciesCatalog
      .filter(s => s.type !== 'humanoid' && (s.population > 0 || extinct.includes(s.name)))
      .map(s => ({ id: s.id, symbol: s.symbol, traits: s.centroid, name: s.name, count: s.population, extinct: s.population === 0 }))
  };
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function icon(name) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.appendChild(use);
  return svg;
}

function stat(iconName, value, title) {
  const span = el('span');
  span.title = title;
  span.append(icon(iconName), document.createTextNode(String(value)));
  return span;
}

export class OverviewPanel {
  constructor(root, body, toggleButton) {
    this.root = root;
    this.body = body;
    this.toggleButton = toggleButton;
    toggleButton.addEventListener('click', () => {
      const collapsed = this.root.classList.toggle('collapsed');
      toggleButton.setAttribute('aria-expanded', String(!collapsed));
    });
  }

  get isCollapsed() {
    return this.root.classList.contains('collapsed');
  }

  setVisible(visible) {
    this.root.classList.toggle('hidden', !visible);
  }

  // All text goes in through textContent, so names can never inject markup.
  render(model, events) {
    const nodes = [];

    nodes.push(el('div', 'ov-summary',
      `${model.planetName} • ${model.civs.length} civilization${model.civs.length === 1 ? '' : 's'}`
      + `${model.fallen ? ` (${model.fallen} fallen)` : ''} • ${model.creatures} creatures`));

    for (const civ of model.civs) {
      const card = el('div', 'civ-card');
      card.style.setProperty('--civ', civ.color);

      const title = el('div', 'civ-title');
      title.append(el('span', 'civ-flag', civ.symbol), el('span', 'civ-name', civ.name),
        el('span', `civ-badge ${civ.status.kind}`, civ.status.kind === 'war' ? 'War' : civ.status.label));
      card.appendChild(title);
      if (civ.status.kind === 'war') card.appendChild(el('div', 'civ-meta', civ.status.label));

      card.appendChild(el('div', 'civ-meta', `${civ.government} • ${civ.era}`));

      const stats = el('div', 'civ-stats');
      stats.append(
        stat('people', civ.citizens, 'Citizens'),
        stat('sword', civ.soldiers, 'Soldiers'),
        stat('flag', civ.territory, 'Territory (tiles)')
      );
      card.appendChild(stats);

      const bar = el('div', 'era-bar');
      bar.title = civ.progress.nextName ? `Progress to the ${civ.progress.nextName}` : 'Highest era reached';
      const fill = el('div', 'era-fill');
      fill.style.width = `${civ.progress.percent.toFixed(1)}%`;
      bar.appendChild(fill);
      card.appendChild(bar);
      nodes.push(card);
    }

    if (model.wildlife.length) {
      const section = el('div');
      section.appendChild(el('div', 'ov-title', 'Wildlife'));
      const list = el('div', 'wild-list');
      for (const animal of model.wildlife) {
        const chip = el('span', `wild-chip${animal.extinct ? ' extinct' : ''}`);
        chip.title = animal.extinct ? `${animal.name} (extinct)` : animal.name;
        const portrait = document.createElement('img');
        portrait.src = creatureDataURL(animal.traits);
        portrait.alt = '';
        portrait.style.cssText = 'width: 18px; height: 18px; image-rendering: pixelated;';
        chip.append(portrait, document.createTextNode(animal.extinct ? 'extinct' : String(animal.count)));
        list.appendChild(chip);
      }
      section.appendChild(list);
      nodes.push(section);
    }

    const log = el('div');
    log.appendChild(el('div', 'ov-title', 'Recent events'));
    const items = el('ul', 'event-log');
    if (events.length === 0) items.appendChild(el('li', '', 'Nothing has happened yet.'));
    for (const text of events) items.appendChild(el('li', '', text));
    log.appendChild(items);
    nodes.push(log);

    this.body.replaceChildren(...nodes);
  }
}
