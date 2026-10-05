import { VICES } from '../ai/temperament.js';
import { creatureDataURL } from '../art/creatureSprite.js';
import { RESOURCES, TIER_NAMES } from '../world/resources.js';
import { getResourceIcon } from '../art/resourceIcons.js';
import { JOB_INFO } from '../civilization/jobs.js';
import { itemName } from '../civilization/economy.js';
import { getSettlement } from '../civilization/settlements.js';
import { getClan } from '../civilization/clans.js';
import { familyOf } from '../civilization/families.js';
import { getReligion, deityLabel } from '../civilization/religion.js';
import { BUILDING_TYPES } from '../world/buildings.js';
import { PERSONAS, DECREES, approveCard, dismissCard, issueDecree, omni, layaState } from '../ai/layaEngine.js';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const iconUrls = new Map(); // the inspector re-renders every frame, so encode each icon once
const iconUrl = (type) => {
  if (!iconUrls.has(type)) iconUrls.set(type, getResourceIcon(type).toDataURL());
  return iconUrls.get(type);
};
// Real-time Inspector Panel for Beings, Tiles, Civilizations, and Laya AI minds

export class InspectorPanel {
  constructor(containerElement) {
    this.container = containerElement;
    this.currentTarget = null;
    this.targetType = null;
    this.sim = null; // set by the game loop: the simulation being shown (family lookups)
    this.pointerDown = false;

    // The panel is redrawn several times a second, so its buttons are recreated: listen on the container
    // (delegation) and hold redraws while a button is pressed, or the click would be lost.
    containerElement.addEventListener('pointerdown', () => { this.pointerDown = true; });
    window.addEventListener('pointerup', () => { this.pointerDown = false; });
    window.addEventListener('pointercancel', () => { this.pointerDown = false; });
    containerElement.addEventListener('click', (e) => {
      if (e.target.closest('.inspector-close-btn')) {
        this.clear();
      } else if (e.target.closest('#btn-follow-entity')) {
        if (this.targetType === 'entity' && this.currentTarget && this.onFollowEntity) this.onFollowEntity(this.currentTarget);
      } else if (e.target.closest('[data-decree]')) {
        if (this.targetType === 'entity' && this.currentTarget) issueDecree(this.currentTarget, e.target.closest('[data-decree]').dataset.decree);
        this.render();
      } else if (e.target.closest('[data-laya-act]')) {
        // The god's verdict on a champion's Action Card (Laya's approve / dismiss)
        const btn = e.target.closest('[data-laya-act]');
        if (this.targetType !== 'entity' || !this.currentTarget) return;
        if (btn.dataset.layaAct === 'approve') approveCard(this.currentTarget, btn.dataset.card);
        else dismissCard(this.currentTarget, btn.dataset.card);
        this.render();
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.currentTarget && !document.querySelector('.modal-overlay:not(.hidden)')) this.clear();
    });
  }

  // Job, clan, home, family, load and current task of a citizen.
  societyHTML(ent) {
    if (!ent.isSapient || !ent.civilization) return '';
    const civ = ent.civilization;
    const clan = getClan(civ, ent.clanId);
    const st = getSettlement(civ, ent.settlementId);
    const sim = this.sim;
    const home = ent.homeId && sim ? sim.terrain.getBuilding(ent.homeId) : null;
    let family = { mate: null, parents: [], children: [] };
    if (sim) family = familyOf(ent, sim.ecosystem.byId, sim.ecosystem.entities);
    const names = list => (list.length ? list.slice(0, 5).map(e => esc(e.name)).join(', ') + (list.length > 5 ? ` +${list.length - 5}` : '') : '—');
    const carried = Object.entries(ent.inventory || {}).filter(([, n]) => n > 0.05).map(([k, n]) => `${esc(itemName(k))} ${Math.round(n * 10) / 10}`).join(', ');
    const job = ent.job && JOB_INFO[ent.job] ? JOB_INFO[ent.job].name : (ent.isAdult ? 'No job' : 'Child');
    const guardian = ent.guardianId && sim ? sim.ecosystem.byId.get(ent.guardianId) : null;
    const faith = sim && sim.society ? getReligion(sim.society, ent.faithId) : null;
    return `
      <div class="society-section" style="--clan: ${clan ? clan.color : '#94a3b8'}">
        <div class="section-title">Society</div>
        <div class="society-row"><span>Job</span><span>${esc(job)}${ent.role === 'SOLDIER' || ent.role === 'GUARD' ? ` (${ent.role.toLowerCase()})` : ''}</span></div>
        <div class="society-row"><span>Doing</span><span>${esc(ent.activity || ent.state || '')}</span></div>
        <div class="society-row"><span>Faith</span><span>${faith ? `<i class="clan-swatch" style="background: ${faith.color}"></i>${esc(faith.name)}` : '—'}</span></div>
        ${faith ? `<div class="society-row"><span>Gods</span><span>${faith.deities.map(d => esc(deityLabel(d))).join(', ')}</span></div>` : ''}
        <div class="society-row"><span>Clan</span><span>${clan ? `<i class="clan-swatch"></i>${esc(clan.name)}` : '—'}</span></div>
        <div class="society-row"><span>Settlement</span><span>${st ? esc(st.name) : '—'} (${esc(civ.name)})</span></div>
        <div class="society-row"><span>Home</span><span>${home ? esc(BUILDING_TYPES[home.type].name) : (ent.isAdult ? 'Homeless — sleeps rough' : '—')}</span></div>
        <div class="society-row"><span>Mate</span><span>${family.mate ? esc(family.mate.name) : '—'}</span></div>
        <div class="society-row"><span>Parents</span><span>${guardian ? `guardian ${esc(guardian.name)}` : names(family.parents)}</span></div>
        <div class="society-row"><span>Children</span><span>${names(family.children)}</span></div>
        <div class="society-row"><span>Carrying</span><span>${carried || 'nothing'}</span></div>
      </div>`;
  }

  inspect(type, target) {
    this.targetType = type;
    this.currentTarget = target;
    this.container.classList.remove('hidden');
    this.render();
  }

  clear() {
    this.currentTarget = null;
    this.targetType = null;
    this.container.classList.add('hidden');
  }

  render() {
    if (!this.currentTarget) {
      this.clear();
      return;
    }
    if (this.pointerDown) return;

    if (this.targetType === 'entity') {
      this.renderEntity(this.currentTarget);
    } else if (this.targetType === 'tile') {
      this.renderTile(this.currentTarget);
    } else if (this.targetType === 'planet') {
      this.renderPlanet(this.currentTarget);
    }

  }

  // Laya AI panel: Omni summary, open Action Cards (approve / dismiss), learned persona trust, ratings
  layaHTML(ent, laya) {
    const state = layaState(ent);
    const o = omni(ent);
    const pri = ['P0 urgent', 'P1 high', 'P2', 'P3 low'];
    const cards = state.cards.map(c => `
      <div class="laya-card${c.approved ? ' approved' : ''}">
        <div class="laya-card-head">
          <span class="laya-persona">${PERSONAS[c.persona].icon} ${PERSONAS[c.persona].name}</span>
          <span class="laya-pri p${c.priority}">${pri[c.priority]}</span>
        </div>
        <div class="laya-card-title">${esc(c.title)}</div>
        <div class="laya-card-reason">${esc(c.reason)}</div>
        <div class="laya-card-actions">
          ${c.approved ? '<span class="laya-approved">✓ Approved — acting next</span>' : `<button class="laya-btn approve" data-laya-act="approve" data-card="${esc(c.id)}">✓ Approve</button>`}
          <button class="laya-btn dismiss" data-laya-act="dismiss" data-card="${esc(c.id)}">✕ Dismiss</button>
        </div>
      </div>`).join('');
    const trust = Object.entries(PERSONAS).map(([id, info]) => `
      <div class="trait-row" title="${info.name} (Laya's ${info.from} persona)"><span>${info.icon} ${info.name}:</span><div class="trait-bar"><div style="width: ${Math.min(100, (state.weights[id] || 1) / 2 * 100)}%"></div></div></div>`).join('');
    return `
          <div class="laya-section">
            <div class="section-title">✦ Laya AI</div>
            <div class="laya-omni">
              <div><span class="laya-omni-label">Attention</span>${esc(o.attention)}</div>
              <div><span class="laya-omni-label">Recent</span>${o.recent.length ? o.recent.map(esc).join(' → ') : '—'}</div>
              <div><span class="laya-omni-label">Milestones</span>${esc(o.milestones)}</div>
            </div>
            ${laya ? `<div class="laya-choice-box"><div class="choice-title">Now: <span class="highlight">${esc(laya.title || laya.action)}</span></div><div class="choice-reason">"${esc(laya.reason)}"</div></div>` : ''}
            <div class="judgment-header">Decree — order the champion directly</div>
            <div class="laya-decrees">
              ${Object.entries(DECREES).map(([id, d]) => `<button class="laya-btn" data-decree="${id}" title="${esc(d.title)}">${PERSONAS[d.persona].icon} ${esc(d.title.replace(' (decree)', ''))}</button>`).join('')}
            </div>
            <div class="judgment-header">Action Cards — approve to make it act sooner, dismiss to teach it</div>
            ${cards || '<div class="laya-empty">No open cards.</div>'}
            <div class="judgment-header" style="margin-top: 8px;">Learned trust per persona</div>
            ${trust}
            ${laya && laya.scores ? `
            <div class="laya-scores-grid" style="margin-top: 8px;">
              <div class="score-card"><span class="score-label">Piety</span><span class="score-number">${Math.floor(laya.scores.piety * 100)}%</span></div>
              <div class="score-card"><span class="score-label">Heroism</span><span class="score-number">${Math.floor(laya.scores.heroism * 100)}%</span></div>
              <div class="score-card"><span class="score-label">Leadership</span><span class="score-number">${Math.floor(laya.scores.leadership * 100)}%</span></div>
            </div>` : ''}
          </div>
`;
  }

  renderEntity(ent) {
    const isAnimal = !ent.isSapient;
    const isLaya = ent.aiSystem === 'LAYA';
    const p = ent.personality;
    const laya = ent.lastLayaDecision;
    const belief = ent.belief || { label: 'Secular Skeptic', symbol: '⚖️', status: 'SECULAR_SKEPTIC', desc: 'Focuses on mortal crafts.' };
    const maxAge = Math.round(ent.maxAge);
    const healthPct = Math.max(0, Math.min(100, Math.floor(ent.health / (ent.maxHealth || 100) * 100)));
    const agePercent = Math.min(100, (ent.age / ent.maxAge) * 100);
    const ageBarColor = agePercent > 80 ? '#ef4444' : agePercent > 60 ? '#f59e0b' : '#22c55e';

    const beliefClass = belief.status === 'ATHEIST_HERETIC' ? 'belief-atheist'
      : belief.status === 'DEVOUT_BELIEVER' ? 'belief-devout' : '';

    this.container.innerHTML = `
      <div class="inspector-card">
        <div class="card-header">
          <div class="avatar-badge" style="border-color: ${ent.appearance?.auraColor || '#ffd700'}">
            <img src="${creatureDataURL(ent.traits)}" alt="" style="width: 40px; height: 40px; image-rendering: pixelated;">
          </div>
          <div style="flex: 1;">
            <h2 class="entity-name">${ent.name}</h2>
            <div class="entity-sub">${isAnimal ? `${ent.species?.name} • Wildlife` : (ent.epithet || ent.species?.name || 'Inhabitant')} • ${ent.gender || 'Being'} • ${ent.stage}${ent.pregnancy ? ' • 🤰 expecting' : ''}</div>
          </div>
          <button class="inspector-close-btn" title="Close Panel">&times;</button>
        </div>

        ${!ent.alive ? `
          <div style="background: rgba(239,68,68,0.18); border: 1px solid rgba(239,68,68,0.45); border-radius: 8px; padding: 10px 14px; margin-bottom: 12px; color: #f87171; font-size: 0.85rem;">
            ☠️ <strong>Deceased — ${ent.causeOfDeath || 'Passed away'}</strong>
            <div style="font-size: 0.75rem; color: #fca5a5; margin-top: 3px;">Lived ${Math.floor(ent.age)} years before returning to the cosmic dust.</div>
          </div>` : ''}

        ${isAnimal ? `
          <!-- Wildlife Instinct & Diet -->
          <div class="belief-box">
            <span class="belief-icon">🐾</span>
            <div>
              <div class="belief-title">Wild Instinct (${ent.species?.diet === 'carnivore' ? 'Predator' : ent.species?.diet === 'omnivore' ? 'Forager' : 'Herbivore'})</div>
              <div class="belief-desc">${ent.species?.diet === 'carnivore' ? 'Hunts wildlife and stalks prey across the ecosystem.' : ent.species?.diet === 'omnivore' ? 'Eats plants and small prey, whatever the land offers.' : 'Grazer feeding on grassland flora, fruits, and foliage.'}</div>
            </div>
          </div>
        ` : `
          <!-- Belief & Faith Status -->
          <div class="belief-box ${beliefClass}">
            <span class="belief-icon">${belief.symbol}</span>
            <div>
              <div class="belief-title">${belief.label}</div>
              <div class="belief-desc">${belief.desc}</div>
            </div>
          </div>
        `}

        ${isLaya ? `
          ${this.layaHTML(ent, laya)}
        ` : ''}

        ${this.societyHTML(ent)}

        <!-- Follow Camera Action -->
        ${ent.alive ? `
        <div style="margin-bottom: 10px;">
          <button id="btn-follow-entity" class="btn-focus-primary" style="width: 100%; padding: 7px 12px; font-size: 0.78rem; display: flex; align-items: center; justify-content: center; gap: 6px;">
            ${this.getFollowing && this.getFollowing() === ent ? '⏹ Stop following' : '🎯 Track &amp; Follow Creature Camera'}
          </button>
        </div>` : ''}

        <!-- Social Role & AI Badges -->
        <div class="ai-badge-row">
          <span class="ai-badge ${isLaya ? 'badge-laya' : 'badge-mc'}">
            ${isLaya ? '✦ Laya AI' : (isAnimal ? '🧭 Instinctual Fauna AI' : '🧭 Needs & Jobs AI')}
          </span>
          <span class="role-badge role-${(ent.role || 'citizen').toLowerCase()}">${ent.role || (isAnimal ? 'WILDLIFE' : 'CITIZEN')}</span>
          <span class="state-badge">${ent.state}</span>
        </div>

        <!-- Vitals -->
        <div class="vitals-row">
          <div class="vital-item">
            <span class="vital-label">Health</span>
            <div class="bar-container"><div class="bar-fill health-bar" style="width: ${healthPct}%"></div></div>
            <span class="vital-val">${healthPct}%</span>
          </div>
          <div class="vital-item">
            <span class="vital-label">Energy</span>
            <div class="bar-container"><div class="bar-fill energy-bar" style="width: ${Math.max(0, ent.energy)}%"></div></div>
            <span class="vital-val">${Math.floor(ent.energy)}%</span>
          </div>
          <div class="vital-item">
            <span class="vital-label">Breath</span>
            <div class="bar-container"><div class="bar-fill breath-bar ${ent.isDrowning ? 'bar-drowning' : ''}" style="width: ${Math.max(0, ent.breath)}%"></div></div>
            <span class="vital-val">${ent.isDrowning ? 'DROWNING!' : Math.floor(ent.breath) + '%'}</span>
          </div>
          <div class="vital-item">
            <span class="vital-label">Age / Lifespan</span>
            <div class="bar-container"><div class="bar-fill" style="width: ${agePercent}%; background: ${ageBarColor};"></div></div>
            <span class="vital-val">${Math.floor(ent.age)} / ${maxAge} yrs</span>
          </div>
        </div>

        <!-- Genetics: every creature carries a genome -->
        <div class="tile-stats-grid">
          <div class="score-card">
            <span class="score-label">Generation</span>
            <span class="score-number">${ent.generation === 0 ? 'Founder' : '#' + ent.generation}</span>
          </div>
          <div class="score-card">
            <span class="score-label">Locomotion</span>
            <span class="score-number">${ent.stats.speedMult.toFixed(1)}x Speed</span>
          </div>
          <div class="score-card">
            <span class="score-label">Body Size</span>
            <span class="score-number">${ent.stats.sizeScale.toFixed(1)}x</span>
          </div>
        </div>
        <div class="personality-section">
          <div class="section-title">Genes</div>
          ${[['Intelligence', 'intelligence'], ['Aggression', 'aggression'], ['Sociality', 'sociality'], ['Herbivory', 'herbivory'], ['Carnivory', 'carnivory'], ['Cold tolerance', 'coldTol'], ['Heat tolerance', 'heatTol'], ['Fertility', 'fertility']]
            .map(([label, gene]) => `<div class="trait-row"><span>${label}:</span><div class="trait-bar"><div style="width: ${ent.traits[gene] * 100}%"></div></div></div>`).join('')}
        </div>


        ${!isAnimal && p ? `
          <div class="personality-section">
            <div class="section-title">Psychological Matrix</div>
            <div class="trait-row"><span>Devotion to God:</span><div class="trait-bar piety-bar"><div style="width: ${p.piety * 100}%"></div></div></div>
            <div class="trait-row"><span>Curiosity:</span><div class="trait-bar"><div style="width: ${p.openness * 100}%"></div></div></div>
            <div class="trait-row"><span>Work Ethic:</span><div class="trait-bar"><div style="width: ${p.conscientiousness * 100}%"></div></div></div>
            <div class="trait-row"><span>Empathy:</span><div class="trait-bar"><div style="width: ${p.agreeableness * 100}%"></div></div></div>
            ${ent.vices ? VICES.map(v => `<div class="trait-row"><span>${v.label}:</span><div class="trait-bar vice-bar"><div style="width: ${(ent.vices[v.id] || 0) * 100}%"></div></div></div>`).join('') : ''}
            ${ent.persona && ent.persona.text ? `<p class="persona-text">“${ent.persona.text.replace(/[<>&]/g, '')}”</p>` : ''}
            ${ent.persona && ent.persona.summary && ent.persona.summary.length ? `<p class="persona-text">Plays: ${ent.persona.summary.join('; ').replace(/[<>&]/g, '')}${ent.loot ? ` • loot ${Math.round(ent.loot)}` : ''}${ent.notoriety ? ` • caught ${ent.notoriety}×` : ''}</p>` : ''}
          </div>
        ` : ''}
      </div>
    `;
  }

  renderTile(tile) {
    this.container.innerHTML = `
      <div class="inspector-card">
        <div class="card-header">
          <div class="avatar-badge" style="background: ${tile.biome.color}">
            ${tile.biome.icon}
          </div>
          <div style="flex: 1;">
            <h2 class="entity-name">${tile.biome.name}</h2>
            <div class="entity-sub">Tile (${tile.x}, ${tile.y}) • Elevation: ${Math.floor(tile.elevation * 100)}%</div>
          </div>
          <button class="inspector-close-btn" title="Close Panel">&times;</button>
        </div>

        <div class="tile-stats-grid">
          <div class="score-card">
            <span class="score-label">Temperature</span>
            <span class="score-number">${Math.floor(tile.temperature * 100)}°</span>
          </div>
          <div class="score-card">
            <span class="score-label">Moisture</span>
            <span class="score-number">${Math.floor(tile.moisture * 100)}%</span>
          </div>
          <div class="score-card">
            <span class="score-label">Flora Biomass</span>
            <span class="score-number">${Math.floor(tile.flora)}%</span>
          </div>
        </div>

        ${tile.structure ? `
          <div class="structure-box">
            <div class="structure-title">${tile.structure.icon || '🏛️'} ${tile.structure.name}</div>
            <div class="structure-desc">Class: ${tile.structure.type.toUpperCase()} • Integrity: ${tile.structure.health !== undefined ? tile.structure.health + ' HP' : 'Intact'}</div>
          </div>
        ` : ''}

        ${this.depositHtml(tile.deposit)}
      </div>
    `;
  }

  // The resource deposit on a tile: what it is, how much is left, what tech it needs.
  depositHtml(deposit) {
    const info = deposit && RESOURCES[deposit.type];
    if (!info) return '';
    const renewable = deposit.max !== undefined;
    const amount = Math.round(deposit.amount * 10) / 10;
    const pct = renewable ? Math.round((deposit.amount / deposit.max) * 100) : 100;
    const stock = renewable
      ? (deposit.amount <= 0 && deposit.type === 'wood' ? 'Felled: a stump that will regrow' : `${amount} / ${deposit.max} (regrows)`)
      : `${amount} left (finite)`;
    return `
      <div class="deposit-box" style="--deposit-color: ${info.color}">
        <div class="deposit-head">
          <img class="deposit-icon" src="${iconUrl(deposit.type)}" alt="">
          <div>
            <div class="deposit-name">${info.name}</div>
            <div class="deposit-meta">${info.category} • ${TIER_NAMES[info.tier]} (tier ${info.tier})</div>
          </div>
        </div>
        <div class="deposit-bar"><span style="width: ${pct}%"></span></div>
        <div class="deposit-stock">${stock}</div>
        <div class="deposit-desc">${info.description}</div>
      </div>
    `;
  }

  renderPlanet(planet) {
    const isRogue = planet.isRoguePlanet;
    const isConsumed = planet.isConsumed;
    const curSpeed = planet.physicsVel ? planet.physicsVel.length().toFixed(2) : '0';
    const dist = planet.physicsPos ? planet.physicsPos.length().toFixed(1) : planet.distance;

    this.container.innerHTML = `
      <div class="inspector-card">
        <div class="card-header">
          <div class="avatar-badge" style="background: ${planet.color}">
            🪐
          </div>
          <div style="flex: 1;">
            <h2 class="entity-name">${planet.name}</h2>
            <div class="entity-sub">Type: ${planet.type.toUpperCase()} • Radius: ${planet.radius}</div>
          </div>
          <button class="inspector-close-btn" title="Close Panel">&times;</button>
        </div>

        <div class="ai-badge-row">
          <span class="ai-badge ${isConsumed ? 'badge-danger' : (isRogue ? 'badge-warning' : 'badge-laya')}">
            ${isConsumed ? '💀 ' + planet.consumedBy : (isRogue ? '⚠️ Rogue Planet (Drifting Into Void)' : '✅ Stable Keplerian Orbit')}
          </span>
        </div>

        <div class="vitals-row">
          <div class="vital-item">
            <span class="vital-label">Orbital Speed</span>
            <span class="vital-val" style="width:auto; color:#38bdf8">${curSpeed} km/s</span>
          </div>
          <div class="vital-item">
            <span class="vital-label">Solar Distance</span>
            <span class="vital-val" style="width:auto; color:#f59e0b">${dist} AU</span>
          </div>
          <div class="vital-item">
            <span class="vital-label">Atmosphere</span>
            <span class="vital-val" style="width:auto; color:#a855f7">${planet.hasAtmosphere ? 'Breathable / Dense' : 'Vacuum / None'}</span>
          </div>
        </div>

        <div class="tile-stats-grid">
          <div class="score-card">
            <span class="score-label">Biosphere Status</span>
            <span class="score-number">${planet.isPopulated ? 'Living' : 'Barren'}</span>
          </div>
          <div class="score-card">
            <span class="score-label">Rings</span>
            <span class="score-number">${planet.hasRings ? 'Present' : 'None'}</span>
          </div>
          <div class="score-card">
            <span class="score-label">Axial Tilt</span>
            <span class="score-number">${(planet.axialTilt * 57.3).toFixed(1)}°</span>
          </div>
        </div>
      </div>
    `;
  }
}
