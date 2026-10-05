// World overview: a live summary of civilizations, wildlife and recent events.
// summarizeWorld() is a pure data model (testable in Node); OverviewPanel renders it.
import { ERAS, missingForEra } from '../civilization/techTree.js';
import { creatureDataURL } from '../art/creatureSprite.js';
import { getResourceIcon } from '../art/resourceIcons.js';
import { RESOURCES } from '../world/resources.js';
import { itemName, itemColor, foodUnits } from '../civilization/economy.js';
import { JOB_INFO, seasonOf, SEASON_NAMES } from '../civilization/jobs.js';
import { exploredFraction } from '../civilization/exploration.js';
import { housingCapacityOfCiv } from '../civilization/settlements.js';
import { titleOf, rankOf } from '../civilization/statecraft.js';
import { currencyOf } from '../civilization/markets.js';
import { religionsOf, getReligion, deityLabel, DOMAINS } from '../civilization/religion.js';

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

// Society figures of one civilization for the overview (pure data): settlements, clans, jobs, stockpile, discoveries.
export function summarizeSociety(sim, civ) {
  const jobs = {};
  let homeless = 0;
  for (const e of sim.ecosystem.entities) {
    if (!e.alive || e.civilization !== civ || !e.isSapient) continue;
    if (e.job) jobs[e.job] = (jobs[e.job] || 0) + 1;
    if (e.isAdult && !e.homeId) homeless++;
  }
  const stock = {};
  for (const st of civ.settlements || []) for (const [k, v] of Object.entries(st.stock)) stock[k] = (stock[k] || 0) + v;
  let sites = 0;
  for (const b of sim.terrain.buildings.values()) if (b.civId === civ.id && b.progress < 1 && b.type !== 'ruins') sites++;
  const nextIndex = ERAS.findIndex(e => e.id === civ.era.id) + 1;
  const needs = ERAS[nextIndex] && sim.society.eraHave ? missingForEra(civ, ERAS[nextIndex].id, sim.society.eraHave(civ)) : [];
  return {
    settlements: (civ.settlements || []).length,
    clans: (civ.clans || []).length,
    jobs: Object.entries(jobs).sort((a, b) => b[1] - a[1]).map(([job, n]) => ({ job, name: JOB_INFO[job] ? JOB_INFO[job].name : job, n })),
    homeless,
    sites,
    housing: housingCapacityOfCiv(sim.terrain, civ),
    food: Math.round((civ.settlements || []).reduce((n, s) => n + foodUnits(s.stock), 0)),
    stock: Object.entries(stock).filter(([, v]) => v >= 1).sort((a, b) => b[1] - a[1]).slice(0, 7).map(([id, n]) => ({ id, name: itemName(id), n: Math.round(n), color: itemColor(id) })),
    discovered: (civ.discovered || []).filter(t => RESOURCES[t] && RESOURCES[t].tier >= 1 || t === 'obsidian'),
    explored: Math.round(exploredFraction(civ, sim.terrain) * 1000) / 10,
    needs
  };
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
      society: summarizeSociety(sim, civ),
      status: civStatus(civ),
      progress: eraProgress(civ),
      faith: getReligion(sim.society, civ.faithId) ? getReligion(sim.society, civ.faithId).name : null,
      rank: rankOf(civ),
      economy: { currency: currencyOf(civ), treasury: Math.round(civ.treasury || 0), gdp: Math.round(civ.gdp || 0), tax: Math.round((civ.taxRate || 0) * 100), routes: Object.keys(civ.tradeRoutes || {}).length, prices: Math.round((civ.priceLevel || 1) * 100) },
      ruler: (() => { const r = civ.rulerId ? sim.ecosystem.byId.get(civ.rulerId) : null; return r && r.alive ? `${titleOf(civ)} ${r.name}` : null; })(),
      legitimacy: Math.round(civ.legitimacy === undefined ? 70 : civ.legitimacy),
      unrest: Math.round((civ.unrest || 0) * 100),
      weariness: Math.round(civ.weariness || 0),
      colonyOf: civ.colonyOf || null,
      ships: civ.shipsLaunched || 0
    })),
    religions: religionsOf(sim.society)
      .filter(r => !r.extinct && r.adherents > 0)
      .sort((a, b) => b.adherents - a.adherents)
      .map(r => ({
        id: r.id,
        name: r.name,
        color: r.color,
        adherents: r.adherents,
        sect: Boolean(r.parentId),
        deities: r.deities.map(d => ({ label: deityLabel(d), symbol: DOMAINS[d.domain] ? DOMAINS[d.domain].symbol : '✦', trait: d.trait, origin: d.origin }))
      })),
    season: SEASON_NAMES[seasonOf(sim.ecosystem.timeYears)],
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
      + `${model.fallen ? ` (${model.fallen} fallen)` : ''} • ${model.creatures} creatures • ${model.season}`));

    for (const civ of model.civs) {
      const card = el('div', 'civ-card');
      card.style.setProperty('--civ', civ.color);

      const title = el('div', 'civ-title');
      title.append(el('span', 'civ-flag', civ.symbol), el('span', 'civ-name', civ.name),
        el('span', `civ-badge ${civ.status.kind}`, civ.status.kind === 'war' ? 'War' : civ.status.label));
      card.appendChild(title);
      if (civ.status.kind === 'war') card.appendChild(el('div', 'civ-meta', civ.status.label));

      card.appendChild(el('div', 'civ-meta', `${civ.rank} • ${civ.government} • ${civ.era}${civ.faith ? ` • ${civ.faith}` : ''}`));
      const ec = civ.economy;
      card.appendChild(el('div', 'civ-meta', ec.currency.money ? `💰 ${ec.treasury} ${ec.currency.unit}s • GDP ${ec.gdp} • Tax ${ec.tax}% • Prices ${ec.prices}% • ${ec.routes} trade partner${ec.routes === 1 ? '' : 's'}` : `🪙 ${ec.currency.name}: tribute in goods • GDP ${ec.gdp}`));
      card.appendChild(el('div', 'civ-meta', `${civ.ruler ? `👑 ${civ.ruler} • ` : ''}Legitimacy ${civ.legitimacy}% • Unrest ${civ.unrest}%${civ.weariness > 15 ? ` • War-weary ${civ.weariness}%` : ''}`));
      if (civ.colonyOf || civ.ships) card.appendChild(el('div', 'civ-meta', [civ.colonyOf ? `Colony of ${civ.colonyOf}` : '', civ.ships ? `🚀 ${civ.ships} ship${civ.ships === 1 ? '' : 's'} launched` : ''].filter(Boolean).join(' • ')));

      const stats = el('div', 'civ-stats');
      stats.append(
        stat('people', civ.citizens, 'Citizens'),
        stat('sword', civ.soldiers, 'Soldiers'),
        stat('flag', civ.territory, 'Territory (tiles)')
      );
      card.appendChild(stats);

      const soc = civ.society;
      if (soc) {
        card.appendChild(el('div', 'civ-meta', `${soc.settlements} settlement${soc.settlements === 1 ? '' : 's'} • ${soc.clans} clan${soc.clans === 1 ? '' : 's'} • ${soc.sites} under construction${soc.homeless ? ` • ${soc.homeless} homeless` : ''}`));
        if (soc.jobs.length) {
          const row = el('div', 'civ-chips');
          row.title = 'Jobs';
          for (const j of soc.jobs.slice(0, 8)) row.appendChild(el('span', 'civ-chip', `${j.name} ${j.n}`));
          card.appendChild(row);
        }
        if (soc.stock.length) {
          const row = el('div', 'civ-chips');
          row.title = 'Stockpiles';
          for (const s of soc.stock) {
            const chip = el('span', 'civ-chip', `${s.name} ${s.n}`);
            chip.style.setProperty('--dot', s.color);
            chip.classList.add('with-dot');
            row.appendChild(chip);
          }
          card.appendChild(row);
        }
        if (soc.discovered.length) {
          const row = el('div', 'civ-chips');
          row.title = `Discovered resources (${soc.explored}% of the planet explored)`;
          row.appendChild(el('span', 'civ-chip muted', `Found (${soc.explored}% explored)`));
          for (const t of soc.discovered) {
            const chip = el('span', 'civ-chip', RESOURCES[t].name);
            const img = document.createElement('img');
            img.src = getResourceIcon(t).toDataURL();
            img.alt = '';
            img.style.cssText = 'width: 12px; height: 12px; image-rendering: pixelated;';
            chip.prepend(img);
            row.appendChild(chip);
          }
          card.appendChild(row);
        }
        if (soc.needs.length && civ.progress.nextName) card.appendChild(el('div', 'civ-meta civ-needs', `Next era needs: ${soc.needs.join(', ')}`));
      }

      const bar = el('div', 'era-bar');
      bar.title = civ.progress.nextName ? `Progress to the ${civ.progress.nextName}` : 'Highest era reached';
      const fill = el('div', 'era-fill');
      fill.style.width = `${civ.progress.percent.toFixed(1)}%`;
      bar.appendChild(fill);
      card.appendChild(bar);
      nodes.push(card);
    }

    if (model.religions && model.religions.length) {
      const section = el('div');
      section.appendChild(el('div', 'ov-title', 'Faiths'));
      for (const r of model.religions) {
        const row = el('div', 'faith-row');
        row.style.setProperty('--faith', r.color);
        const head = el('div', 'faith-head');
        head.append(el('span', 'faith-name', `${r.sect ? '⚡ ' : ''}${r.name}`), el('span', 'faith-count', `${r.adherents} faithful`));
        row.appendChild(head);
        const gods = el('div', 'faith-gods');
        for (const d of r.deities) {
          const g = el('span', 'civ-chip', `${d.symbol} ${d.label}`);
          g.title = `Who ${d.trait}. First seen in ${d.origin}.`;
          gods.appendChild(g);
        }
        row.appendChild(gods);
        section.appendChild(row);
      }
      nodes.push(section);
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
