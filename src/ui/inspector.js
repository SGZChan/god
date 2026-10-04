import { creatureDataURL } from '../art/creatureSprite.js';
import { RESOURCES, TIER_NAMES } from '../world/resources.js';
import { getResourceIcon } from '../art/resourceIcons.js';

const iconUrls = new Map(); // the inspector re-renders every frame, so encode each icon once
const iconUrl = (type) => {
  if (!iconUrls.has(type)) iconUrls.set(type, getResourceIcon(type).toDataURL());
  return iconUrls.get(type);
};
// Real-time Inspector Panel for Beings, Tiles, Civilizations, and JEV AI Brains

export class InspectorPanel {
  constructor(containerElement) {
    this.container = containerElement;
    this.currentTarget = null;
    this.targetType = null;
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

    if (this.targetType === 'entity') {
      this.renderEntity(this.currentTarget);
    } else if (this.targetType === 'tile') {
      this.renderTile(this.currentTarget);
    } else if (this.targetType === 'planet') {
      this.renderPlanet(this.currentTarget);
    }

    // Attach close button listener
    const closeBtn = this.container.querySelector('.inspector-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.clear();
      });
    }

    // Attach follow camera listener
    const followBtn = this.container.querySelector('#btn-follow-entity');
    if (followBtn && this.targetType === 'entity' && this.currentTarget) {
      followBtn.addEventListener('click', () => {
        if (this.onFollowEntity) {
          this.onFollowEntity(this.currentTarget);
        }
      });
    }
  }

  renderEntity(ent) {
    const isAnimal = !ent.isSapient;
    const isJev = ent.aiSystem === 'JEV';
    const p = ent.personality;
    const jev = ent.lastJevDecision;
    const belief = ent.belief || { label: 'Secular Skeptic', symbol: '⚖️', status: 'SECULAR_SKEPTIC', desc: 'Focuses on mortal crafts.' };
    const maxAge = Math.round(ent.maxAge);
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

        <!-- Follow Camera Action -->
        ${ent.alive ? `
        <div style="margin-bottom: 10px;">
          <button id="btn-follow-entity" class="btn-focus-primary" style="width: 100%; padding: 7px 12px; font-size: 0.78rem; display: flex; align-items: center; justify-content: center; gap: 6px;">
            🎯 Track &amp; Follow Creature Camera
          </button>
        </div>` : ''}

        <!-- Social Role & AI Badges -->
        <div class="ai-badge-row">
          <span class="ai-badge ${isJev ? 'badge-jev' : 'badge-mc'}">
            ${isJev ? '⚡ JEV System 1 AI' : (isAnimal ? '🧭 Instinctual Fauna AI' : '🧭 Minecraft Mob A* AI')}
          </span>
          <span class="role-badge role-${(ent.role || 'citizen').toLowerCase()}">${ent.role || (isAnimal ? 'WILDLIFE' : 'CITIZEN')}</span>
          <span class="state-badge">${ent.state}</span>
        </div>

        <!-- Vitals -->
        <div class="vitals-row">
          <div class="vital-item">
            <span class="vital-label">Health</span>
            <div class="bar-container"><div class="bar-fill health-bar" style="width: ${Math.max(0, ent.health)}%"></div></div>
            <span class="vital-val">${Math.floor(ent.health)}%</span>
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

        ${isJev && jev ? `
          <!-- JEV SYSTEM 1 STRUCTURED DECISION MATRIX -->
          <div class="jev-section">
            <div class="section-title">⚡ JEV Structured Evaluation</div>
            <div class="jev-choice-box">
              <div class="choice-title">Active Choice: <span class="highlight">${jev.action}</span></div>
              <div class="choice-reason">"${jev.reason}"</div>
            </div>
            <div class="jev-scores-grid">
              <div class="score-card"><span class="score-label">Piety Rubric</span><span class="score-number">${Math.floor(jev.scores.piety * 100)}%</span></div>
              <div class="score-card"><span class="score-label">Heroism</span><span class="score-number">${Math.floor(jev.scores.heroism * 100)}%</span></div>
              <div class="score-card"><span class="score-label">Leadership</span><span class="score-number">${Math.floor(jev.scores.leadership * 100)}%</span></div>
            </div>
            <div class="jev-noul-box">
              <div class="noul-header">Deterministic Noul (Boolean Judgments):</div>
              <div class="noul-tags">
                <span class="noul-tag ${jev.noul.willDefyMortalKing ? 'active' : ''}">Defy Mortal King: ${jev.noul.willDefyMortalKing ? 'YES' : 'NO'}</span>
                <span class="noul-tag ${jev.noul.readyForSelfSacrifice ? 'active' : ''}">Self-Sacrifice: ${jev.noul.readyForSelfSacrifice ? 'YES' : 'NO'}</span>
                <span class="noul-tag ${jev.noul.hasReceivedDivineVision ? 'active' : ''}">Divine Vision: ${jev.noul.hasReceivedDivineVision ? 'YES' : 'NO'}</span>
              </div>
            </div>
          </div>
        ` : ''}

        ${!isAnimal && p ? `
          <div class="personality-section">
            <div class="section-title">Psychological Matrix</div>
            <div class="trait-row"><span>Devotion to God:</span><div class="trait-bar piety-bar"><div style="width: ${p.piety * 100}%"></div></div></div>
            <div class="trait-row"><span>Curiosity:</span><div class="trait-bar"><div style="width: ${p.openness * 100}%"></div></div></div>
            <div class="trait-row"><span>Work Ethic:</span><div class="trait-bar"><div style="width: ${p.conscientiousness * 100}%"></div></div></div>
            <div class="trait-row"><span>Empathy:</span><div class="trait-bar"><div style="width: ${p.agreeableness * 100}%"></div></div></div>
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
          <span class="ai-badge ${isConsumed ? 'badge-danger' : (isRogue ? 'badge-warning' : 'badge-jev')}">
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
