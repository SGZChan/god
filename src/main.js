import * as THREE from 'three';
import { SeededRNG } from './cosmos/seed.js';
import { Universe } from './cosmos/universe.js';
import { SolarSystem } from './cosmos/solarSystem.js';
import { SurfaceRenderer } from './planet/surfaceRenderer.js';
import { DivinePowersManager } from './god/divinePowers.js';
import { PowerPalette, bindGodMenu, loadGodSettings } from './ui/powerPalette.js';
import { InspectorPanel } from './ui/inspector.js';
import { CreationWorkshop } from './workshop/creator.js';
import { catchUpEngine } from './simulation/catchUpEngine.js';
import { NotificationManager } from './ui/notificationManager.js';
import { OverviewPanel, summarizeWorld } from './ui/overviewPanel.js';
import { Minimap } from './ui/minimap.js';
import { ResourceLensPanel } from './ui/resourceLens.js';
import { sounds } from './audio/soundFX.js';
import { FixedStepper, runSimulationSteps, SIM_STEP } from './simulation/fixedStep.js';
import { random, setActiveRng } from './simulation/random.js';
import { createPlanetWorld } from './simulation/world.js';
import { SaveError, serializeGame, restoreSim, parseSave } from './persistence/saveGame.js';

const SAVE_KEY = 'genesis-cosmos-save-v3';
const AUTOSAVE_MS = 30000;

class GameApp {
  constructor() {
    this.currentView = 'SYSTEM'; // 'GALAXY', 'SYSTEM', or 'SURFACE'
    this.timeSpeed = 1; // 0, 1, 10, 100, 10000
    this.lastTime = performance.now();
    this.cosmicTimeAge = 0;
    this.stepper = new FixedStepper();
    this.customPlanets = [];          // [{ systemId, config }] planets the player created
    this.pendingSims = new Map();     // planetId -> saved sim data not yet restored
    this.autosaveEnabled = true;

    // DOM Elements
    this.solarContainer = document.getElementById('solar-canvas-container');
    this.surfaceContainer = document.getElementById('surface-canvas-container');
    this.surfaceCanvas = document.getElementById('surface-canvas');

    this.btnViewUniverse = document.getElementById('btn-view-universe');
    this.btnViewGalaxy = document.getElementById('btn-view-galaxy');
    this.galaxySelect = document.getElementById('galaxy-select');
    this.breadcrumb = document.getElementById('breadcrumb');
    this.warpOverlay = document.getElementById('warp-overlay');
    this.btnViewSystem = document.getElementById('btn-view-system');
    this.btnViewSurface = document.getElementById('btn-view-surface');
    this.btnOpenGuide = document.getElementById('btn-open-guide');

    this.currentSeedLabel = document.getElementById('current-seed-label');
    this.btnCopySeed = document.getElementById('btn-copy-seed');
    this.btnNewUniverse = document.getElementById('btn-new-universe');
    this.newUniverseModal = document.getElementById('new-universe-modal');
    this.createUniverseSeedInput = document.getElementById('create-universe-seed');
    this.btnModalRollSeed = document.getElementById('btn-modal-roll-seed');
    this.btnConfirmNewUniverse = document.getElementById('btn-confirm-new-universe');
    this.btnCancelNewUniverse = document.getElementById('btn-cancel-new-universe');
    this.btnCloseNewUniverse = document.getElementById('btn-close-new-universe');

    this.systemSelect = document.getElementById('system-select');
    this.planetSelect = document.getElementById('planet-select');
    this.epochDisplay = document.getElementById('epoch-display');
    this.yearDisplay = document.getElementById('year-display');
    this.lastHudRefresh = 0;
    this.lastChunkPrune = 0;
    this.lastInspectorRender = 0;
    document.body.dataset.view = this.currentView; // CSS shows each view's own controls (style.css "View chrome")

    // Quick-action card & Power banner
    this.planetFocusCard = document.getElementById('planet-action-card');
    this.focusPlanetName = document.getElementById('focus-planet-name');
    this.focusPlanetStatus = document.getElementById('focus-planet-status');
    this.btnFocusDescend = document.getElementById('btn-focus-descend');
    this.btnFocusWorkshop = document.getElementById('btn-focus-workshop');
    this.surfaceNavControls = document.getElementById('surface-nav-controls');

    // Notifications Manager (Throttling, Deduplication & Max limits)
    this.notifications = new NotificationManager(document.getElementById('notifications-stream'));

    // 1. Initialize Galaxy & Procedural Star Systems
    this.currentSeed = 'Genesis-1337';
    if (this.currentSeedLabel) this.currentSeedLabel.innerText = this.currentSeed;
    this.universe = new Universe(this.currentSeed);
    this.galaxy = this.universe.getGalaxy(0);

    // 2. Initialize 3D Solar System
    this.solarSystem = new SolarSystem(this.solarContainer);
    this.solarSystem.scene.add(this.galaxy.group);
    this.solarSystem.scene.add(this.universe.group);
    this.galaxy.group.visible = false;   // the game starts in the system view
    this.universe.group.visible = false;
    this.populateGalaxySelect();

    // Planet Simulations Map: planetId -> simulation object
    this.simulations = new Map();
    this.activeSim = null;

    // 3. Load Active Star System
    this.loadSystem(this.galaxy.getActiveSystem().id);

    // 4. Initialize UI & Workshops
    this.initUI();
    this.initWorkshop();
    this.initGuide();
    this.initPersistence();
    this.initMenu();
    this.initOverview();
    // Planet navigation: minimap and the Resources lens (surface view only)
    this.minimap = new Minimap(document.getElementById('minimap-panel'));
    this.lensPanel = new ResourceLensPanel(document.getElementById('lens-panel'));
    this.initNavigation();
    this.initPanelsToggle();
    this.initModals();

    // Audio init on first user click
    window.addEventListener('click', () => {
      sounds.init();
    }, { once: true });

    // Show initial welcome message
    this.notifications.push(`✨ Welcome, Creator! Your cosmos is active. Seed: "${this.currentSeed}"`);

    // Start Main Loop
    this.tick = this.tick.bind(this);
    requestAnimationFrame(this.tick);
  }

  loadSystem(systemId) {
    const sysData = this.galaxy.systems.find(s => s.id === systemId);
    if (!sysData) return;

    this.galaxy.activeSystemId = systemId;
    this.solarSystem.loadSystemData(sysData);

    // Update system dropdown
    this.systemSelect.innerHTML = '';
    for (const s of this.galaxy.systems) {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.innerText = `${s.name} (${s.star.name})`;
      if (s.id === systemId) opt.selected = true;
      this.systemSelect.appendChild(opt);
    }

    // Initialize or restore planetary simulations
    this.updatePlanetSelectOptions();
    this.updateBreadcrumb();

    // Select first populated or first planet
    if (this.solarSystem.planets.length > 0) {
      const targetPlanet = this.solarSystem.planets.find(p => p.isPopulated) || this.solarSystem.planets[0];
      this.setActivePlanet(targetPlanet.id);
    }
  }

  updatePlanetSelectOptions() {
    this.planetSelect.innerHTML = '';
    for (const p of this.solarSystem.planets) {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.innerText = `${p.name} [${p.isPopulated ? 'Life' : 'Barren'}]`;
      this.planetSelect.appendChild(opt);

      // Create simulation instance if not already cached
      if (!this.simulations.has(p.id)) {
        const saved = this.pendingSims.get(p.id);
        let world;
        if (saved) {
          world = restoreSim(saved);
          this.pendingSims.delete(p.id);
        } else {
          // Each planet owns a seeded stream, so it is the same world whatever order you visit them
          const planetSeed = `${this.currentSeed}:${p.seed || p.id}`;
          world = createPlanetWorld(new SeededRNG(planetSeed), {
            type: p.type,
            populated: p.isPopulated,
            seed: planetSeed,
            radius: p.radius // the planet's size sets the size of its map
          });
        }
        this.attachSim(p, world, Boolean(saved));
      }
    }
  }

  // Wraps a simulated world with its renderer and divine powers and registers it.
  attachSim(planet, world, everActive) {
    const { terrain, ecosystem, society } = world;
    const renderer = new SurfaceRenderer(this.surfaceCanvas, terrain, ecosystem, society);
    const divine = new DivinePowersManager(terrain, ecosystem, society);
    renderer.currentPower = divine.activePower;

    // Continuous drag painting when holding mouse down on draggable powers
    renderer.activePaintCallback = (tx, ty) => {
      if (divine.activePower && divine.activePower.isDraggable && divine.activePower.id !== 'INSPECT' && divine.activePower.id !== 'PAN') {
        divine.applyAt(tx, ty, true);
      }
    };

    // Single click (when mouse moved < 6px) to inspect creatures/tiles or cast instant powers
    // Guard: only allow inspection while on the planet surface view
    renderer.onTileClicked = (clientX, clientY) => {
      if (this.currentView !== 'SURFACE') return;
      const rect = this.surfaceCanvas.getBoundingClientRect();
      const screenX = clientX - rect.left;
      const screenY = clientY - rect.top;
      const tile = renderer.screenToTile(screenX, screenY);
      // brush powers were already cast on mouse-down
      const p = divine.activePower;
      if (p && p.isDraggable && p.id !== 'INSPECT' && p.id !== 'PAN') return;
      const result = divine.applyAt(tile.x, tile.y, false, tile.worldX, tile.worldY);
      if (divine.lastMessage) {
        this.notifications.push(divine.lastMessage, 'minor');
        divine.lastMessage = null;
      }
      if (result) {
        this.inspector.inspect(result.type, result.target);
      }
    };

    this.simulations.set(planet.id, {
      planet,
      terrain,
      ecosystem,
      society,
      rng: world.rng,
      renderer,
      divine,
      effects: divine.effects,
      everActive,
      eventLog: [],
      simSeconds: world.simSeconds || 0,
      lastActiveCosmicAge: world.lastActiveCosmicAge !== undefined ? world.lastActiveCosmicAge : this.cosmicTimeAge
    });
  }

  // Removes every simulation and its input listeners (new universe / load).
  disposeSimulations() {
    for (const sim of this.simulations.values()) sim.renderer.dispose();
    this.simulations.clear();
    this.pendingSims.clear();
    this.activeSim = null;
    if (this.inspector) this.inspector.clear();
  }

  setActivePlanet(planetId) {
    const sim = this.simulations.get(planetId);
    if (!sim) return;

    this.activeSim = sim;
    this.stepper.reset();
    this.updateBreadcrumb();
    setActiveRng(sim.rng);
    sim.everActive = true;
    // Planets share one canvas; only the one being viewed may react to the mouse
    for (const other of this.simulations.values()) other.renderer.setEnabled(other === sim);
    if (this.minimap) {
      this.minimap.setSim(sim);
      this.lensPanel.setRenderer(sim.renderer);
    }
    this.solarSystem.selectPlanet(sim.planet);
    this.planetSelect.value = planetId;

    // Update Floating Quick-Action Card
    this.updateFocusCard();

    // --- LAZY LOADING / CATCH-UP CALCULATION ---
    if (sim.lastActiveCosmicAge < this.cosmicTimeAge) {
      const deltaYears = (this.cosmicTimeAge - sim.lastActiveCosmicAge) * 1000;
      const report = catchUpEngine.fastForwardPlanet(sim, deltaYears, sim.rng);
      if (report && (report.civEvents.length > 0 || report.ecoEvents.length > 0)) {
        this.notifications.push(`📜 While you were away: ${report.yearsElapsed} years passed on ${sim.planet.name}.`);
        if (report.civEvents.length > 0) {
          this.notifications.push(`🏛️ ${report.civEvents[0]}`);
        }
      }
    }
    sim.lastActiveCosmicAge = this.cosmicTimeAge;

    if (this.palette) this.palette.setActive(sim.divine.activePower);
    // Inspector only opens on explicit user click — do NOT auto-open here.
  }

  updateFocusCard() {
    if (!this.activeSim) {
      this.planetFocusCard.style.display = 'none';
      return;
    }

    const p = this.activeSim.planet;
    this.focusPlanetName.innerText = p.name;
    if (p.isConsumed) {
      this.focusPlanetStatus.innerText = `💀 Destroyed by ${p.consumedBy}`;
      this.focusPlanetStatus.style.color = '#ef4444';
    } else if (p.isRoguePlanet) {
      this.focusPlanetStatus.innerText = `⚠️ Rogue World (Escaped Sun Gravity)`;
      this.focusPlanetStatus.style.color = '#f59e0b';
    } else if (p.isPopulated) {
      this.focusPlanetStatus.innerText = `🌱 Living Garden World • Active Civilizations`;
      this.focusPlanetStatus.style.color = '#4ade80';
    } else {
      this.focusPlanetStatus.innerText = `🌑 Barren & Uninhabited • ${p.type.toUpperCase()}`;
      this.focusPlanetStatus.style.color = '#94a3b8';
    }

    this.planetFocusCard.style.display = (this.currentView === 'SYSTEM') ? 'flex' : 'none';
  }

  initUI() {
    const inspectorDrawer = document.getElementById('inspector-drawer');
    this.inspector = new InspectorPanel(inspectorDrawer);
    this.inspector.clear(); // Always start closed and hidden

    const initialCloseBtn = document.getElementById('btn-initial-close-inspector');
    if (initialCloseBtn) {
      initialCloseBtn.addEventListener('click', () => {
        sounds.playUIClick();
        this.inspector.clear();
      });
    }

    // 3-Tier View Navigation
    this.btnViewUniverse.addEventListener('click', () => this.switchView('UNIVERSE'));
    this.btnViewGalaxy.addEventListener('click', () => this.switchView('GALAXY'));
    this.btnViewSystem.addEventListener('click', () => this.switchView('SYSTEM'));
    this.btnViewSurface.addEventListener('click', () => this.switchView('SURFACE'));

    // Planet Focus Card Buttons
    this.btnFocusDescend.addEventListener('click', () => {
      sounds.playUIClick();
      this.switchView('SURFACE');
    });

    this.btnFocusWorkshop.addEventListener('click', () => {
      sounds.playUIClick();
      this.workshop.open();
    });

    // Copy Seed to Clipboard
    if (this.btnCopySeed) {
      this.btnCopySeed.addEventListener('click', () => {
        sounds.playUIClick();
        navigator.clipboard.writeText(this.currentSeed);
        this.notifications.push(`📋 Universe seed "${this.currentSeed}" copied to clipboard!`);
      });
    }

    // New Universe Creation Modal
    if (this.btnNewUniverse) {
      this.btnNewUniverse.addEventListener('click', () => {
        sounds.playUIClick();
        this.createUniverseSeedInput.value = 'Cosmos_' + Math.floor(Math.random() * 900000 + 100000);
        this.newUniverseModal.classList.remove('hidden');
      });
    }

    if (this.btnModalRollSeed) {
      this.btnModalRollSeed.addEventListener('click', () => {
        sounds.playUIClick();
        this.createUniverseSeedInput.value = 'Seed_' + Math.floor(Math.random() * 900000 + 100000);
      });
    }

    if (this.btnConfirmNewUniverse) {
      this.btnConfirmNewUniverse.addEventListener('click', () => {
        const newSeed = this.createUniverseSeedInput.value.trim() || 'Genesis-1337';
        this.newUniverseModal.classList.add('hidden');
        this.applyNewSeed(newSeed);
        if (this.currentSeedLabel) {
          this.currentSeedLabel.innerText = newSeed;
        }
      });
    }

    if (this.btnCancelNewUniverse) {
      this.btnCancelNewUniverse.addEventListener('click', () => {
        sounds.playUIClick();
        this.newUniverseModal.classList.add('hidden');
      });
    }

    if (this.btnCloseNewUniverse) {
      this.btnCloseNewUniverse.addEventListener('click', () => {
        sounds.playUIClick();
        this.newUniverseModal.classList.add('hidden');
      });
    }

    // System selector dropdown
    this.systemSelect.addEventListener('change', (e) => {
      sounds.playUIClick();
      this.loadSystem(e.target.value);
      this.switchView('SYSTEM');
    });

    // Planet selector dropdown
    this.planetSelect.addEventListener('change', (e) => {
      sounds.playUIClick();
      this.setActivePlanet(e.target.value);
    });

    // Time speed buttons & step increments (+ / -)
    const timeBtns = document.querySelectorAll('.time-btn');

    const applySpeedTier = (speed) => {
      this.timeSpeed = speed;
      timeBtns.forEach(b => {
        if (parseInt(b.dataset.speed, 10) === speed) {
          b.classList.add('active');
        } else {
          b.classList.remove('active');
        }
      });
      sounds.playTimeWarp();
    };

    timeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        applySpeedTier(parseInt(btn.dataset.speed, 10));
      });
    });

    // Divine powers: categorized palette (src/ui/powerPalette.js)
    loadGodSettings();
    this.palette = new PowerPalette({
      root: document.getElementById('power-palette'),
      isActive: () => this.currentView === 'SURFACE' && Boolean(this.activeSim) && !document.querySelector('.modal-overlay:not(.hidden)'),
      getDivine: () => (this.activeSim ? this.activeSim.divine : null),
      onSelect: (power) => {
        if (!this.activeSim) return;
        this.activeSim.divine.setPower(power);
        this.activeSim.renderer.currentPower = power;
        this.surfaceCanvas.style.cursor = power.cursor || 'grab';
      }
    });
    bindGodMenu();

    // Camera follow entity callback from inspector
    // The follow button toggles: follow this creature, or let the camera go again
    this.inspector.getFollowing = () => (this.activeSim ? this.activeSim.renderer.followingEntity : null);
    this.inspector.onFollowEntity = (ent) => {
      if (!this.activeSim) return;
      const renderer = this.activeSim.renderer;
      if (renderer.followingEntity === ent) {
        renderer.followEntity(null);
        this.notifications.push(`Camera released.`, 'info', true);
      } else {
        renderer.followEntity(ent);
        this.notifications.push(`🎯 Following ${ent.name}. Drag the map or press W/A/S/D to stop.`, 'info', true);
      }
      this.inspector.render();
    };

    // Surface Navigation D-Pad Controls
    const navUp = document.getElementById('nav-pan-up');
    const navDown = document.getElementById('nav-pan-down');
    const navLeft = document.getElementById('nav-pan-left');
    const navRight = document.getElementById('nav-pan-right');
    const navCenter = document.getElementById('nav-pan-center');

    if (navUp) navUp.addEventListener('click', () => { if (this.activeSim) this.activeSim.renderer.panBy(0, 140); });
    if (navDown) navDown.addEventListener('click', () => { if (this.activeSim) this.activeSim.renderer.panBy(0, -140); });
    if (navLeft) navLeft.addEventListener('click', () => { if (this.activeSim) this.activeSim.renderer.panBy(140, 0); });
    if (navRight) navRight.addEventListener('click', () => { if (this.activeSim) this.activeSim.renderer.panBy(-140, 0); });
    if (navCenter) navCenter.addEventListener('click', () => { if (this.activeSim) this.activeSim.renderer.centerCamera(); });

    // Cosmic events: in the power bar on the surface, on the planet card in the system view
    const launchAsteroid = () => {
      sounds.playLightning();
      this.solarSystem.launchCosmicAsteroid(this.activeSim ? this.activeSim.planet : null);
      this.notifications.push(`☄️ Rogue asteroid launched on collision trajectory!`);
      if (this.currentView === 'SURFACE') this.switchView('SYSTEM');
    };
    const spawnBlackHole = () => {
      sounds.playMeteorImpact();
      this.solarSystem.createSingularity(160);
      this.notifications.push(`🕳️ Black Hole spawned! Gravitational forces are active.`);
      if (this.currentView === 'SURFACE') this.switchView('SYSTEM');
    };
    document.getElementById('btn-launch-asteroid').addEventListener('click', launchAsteroid);
    document.getElementById('btn-spawn-blackhole').addEventListener('click', spawnBlackHole);
    document.getElementById('btn-focus-asteroid').addEventListener('click', launchAsteroid);
    document.getElementById('btn-focus-blackhole').addEventListener('click', spawnBlackHole);

    window.onPlanetSelected = (planet) => {
      this.setActivePlanet(planet.id);
    };
  }

  // ---------- World streaming ----------

  // Keeps the chunks around the camera, every living creature and every civilization's land.
  pruneActiveTerrain() {
    const sim = this.activeSim;
    const renderer = sim.renderer;
    const ts = renderer.tileSize * renderer.camera.zoom;
    const focus = [{
      x: (renderer.canvas.width / 2 - renderer.camera.x) / ts,
      y: (renderer.canvas.height / 2 - renderer.camera.y) / ts,
      // (zoomed far out the view is drawn from low-resolution blocks, not chunks, so keep the radius modest)
      radius: Math.min(10, Math.ceil(Math.max(renderer.canvas.width, renderer.canvas.height) / ts / 32 / 2) + 2)
    }];
    for (const ent of sim.ecosystem.entities) focus.push({ x: ent.x, y: ent.y, radius: 1 });
    for (const civ of sim.society.civilizations) {
      if (civ.isAlive) focus.push({ x: civ.capitalX, y: civ.capitalY, radius: 2 });
    }
    sim.terrain.pruneChunks(focus);
  }

  // ---------- HUD ----------

  // One simulated year is 4 simulated seconds (matches creature aging)
  refreshHud() {
    if (this.palette) this.palette.update();
    const sim = this.activeSim;
    this.yearDisplay.textContent = 'Year ' + Math.floor(sim.simSeconds * 0.25).toLocaleString();
    if (this.currentView === 'SURFACE' && !this.overview.isCollapsed) {
      this.overview.render(summarizeWorld(sim), sim.eventLog.slice(0, 6));
    }
    this.fitOverview();
  }

  // The overview (top left) ends above the planet tools (bottom left), whatever their current height
  fitOverview() {
    const panel = document.getElementById('overview-panel');
    const tools = document.getElementById('planet-tools');
    if (this.currentView !== 'SURFACE' || !this.panelsShown || !panel || !tools) return;
    const toolsTop = tools.getBoundingClientRect().top;
    const room = Math.floor(toolsTop - panel.getBoundingClientRect().top - 10);
    if (room > 0 && toolsTop > 0) panel.style.maxHeight = `${Math.max(44, room)}px`;
  }

  initOverview() {
    this.overview = new OverviewPanel(
      document.getElementById('overview-panel'),
      document.getElementById('overview-body'),
      document.getElementById('overview-toggle')
    );
    this.overview.setVisible(this.currentView === 'SURFACE');
    // Small screens start with the panel folded away so it does not cover the map
    if (window.matchMedia('(max-width: 640px)').matches) this.overview.toggleButton.click();
  }

  initMenu() {
    const button = document.getElementById('btn-menu');
    const panel = document.getElementById('menu-panel');
    const loadItem = document.getElementById('menu-load');
    const fileInput = document.getElementById('menu-import-file');

    const setOpen = (open) => {
      panel.classList.toggle('hidden', !open);
      button.setAttribute('aria-expanded', String(open));
      if (open) {
        loadItem.disabled = !this.hasSave();
        const first = panel.querySelector('.menu-item:not(:disabled)');
        if (first) first.focus();
      }
    };

    button.addEventListener('click', (e) => {
      e.stopPropagation();
      sounds.playUIClick();
      setOpen(panel.classList.contains('hidden'));
    });
    document.addEventListener('click', (e) => {
      if (!panel.classList.contains('hidden') && !panel.contains(e.target)) setOpen(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !panel.classList.contains('hidden')) {
        setOpen(false);
        button.focus();
      }
    });
    // Choosing an item closes the menu (the seed copy button keeps it open)
    panel.addEventListener('click', (e) => {
      if (e.target.closest('.menu-item')) setOpen(false);
    });

    document.getElementById('menu-save').addEventListener('click', () => {
      sounds.playUIClick();
      this.saveGame({ announce: true });
    });
    loadItem.addEventListener('click', () => {
      sounds.playUIClick();
      if (window.confirm('Load the last saved universe? Progress since that save will be lost.')) {
        this.loadFromText(localStorage.getItem(SAVE_KEY));
      }
    });
    document.getElementById('menu-export').addEventListener('click', () => {
      sounds.playUIClick();
      this.exportSave();
    });
    document.getElementById('menu-import').addEventListener('click', () => {
      sounds.playUIClick();
      fileInput.click();
    });
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      fileInput.value = '';
      if (file) await this.importSave(file);
    });
  }

  // ---------- Save / load ----------

  hasSave() {
    try {
      return Boolean(localStorage.getItem(SAVE_KEY));
    } catch {
      return false;
    }
  }

  buildSaveText() {
    // Planets never visited regenerate from the seed, so only visited ones are stored
    const sims = new Map([...this.simulations].filter(([, sim]) => sim.everActive));
    const save = serializeGame({
      seed: this.currentSeed,
      cosmicTimeAge: this.cosmicTimeAge,
      galaxyIndex: this.universe.activeIndex,
      activeSystemId: this.galaxy.activeSystemId,
      activePlanetId: this.activeSim ? this.activeSim.planet.id : null,
      customPlanets: this.customPlanets,
      sims
    });
    // Visited planets of systems that were not re-entered yet are still waiting to be restored
    for (const [id, data] of this.pendingSims) {
      if (!save.sims[id]) save.sims[id] = data;
    }
    return JSON.stringify(save);
  }

  saveGame({ announce = false } = {}) {
    try {
      localStorage.setItem(SAVE_KEY, this.buildSaveText());
      if (announce) this.notifications.push('💾 Universe saved.', 'info', true);
      return true;
    } catch (err) {
      const full = err && err.name === 'QuotaExceededError';
      this.notifications.push(
        full ? '⚠️ Browser storage is full. Use Export to keep this universe.' : `⚠️ Could not save: ${err.message}`,
        'info',
        true
      );
      return false;
    }
  }

  exportSave() {
    const blob = new Blob([this.buildSaveText()], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `genesis-cosmos-${this.currentSeed.replace(/[^a-z0-9_-]+/gi, '_')}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    this.notifications.push('📤 Universe exported.', 'info', true);
  }

  async importSave(file) {
    return this.loadFromText(await file.text());
  }

  // Returns true when the save was loaded. Problems are reported as notifications.
  loadFromText(text) {
    let data;
    try {
      data = parseSave(text);
    } catch (err) {
      const message = err instanceof SaveError ? err.message : 'The save could not be read.';
      this.notifications.push(`⚠️ ${message}`, 'info', true);
      return false;
    }
    try {
      this.applyLoadedGame(data);
      this.notifications.push(`📂 Universe "${data.seed}" loaded.`, 'info', true);
      return true;
    } catch (err) {
      console.error('Failed to apply save', err);
      this.notifications.push('⚠️ The save is damaged. A fresh universe was started instead.', 'info', true);
      this.applyNewSeed('Genesis-1337');
      return false;
    }
  }

  applyLoadedGame(data) {
    this.disposeSimulations();
    this.currentSeed = data.seed;
    if (this.currentSeedLabel) this.currentSeedLabel.innerText = data.seed;
    this.resetUniverse(data.seed);
    this.setActiveGalaxy(Number.isInteger(data.galaxyIndex) ? data.galaxyIndex : this.universe.galaxyIndexOfId(data.activeSystemId));
    this.cosmicTimeAge = data.cosmicTimeAge;

    this.customPlanets = data.customPlanets;
    for (const { systemId, config } of this.customPlanets) {
      const system = this.galaxy.systems.find(sys => sys.id === systemId);
      if (system && !system.planets.some(p => p.id === config.id)) system.planets.push(config);
    }

    this.pendingSims = new Map(Object.entries(data.sims));
    this.loadSystem(data.activeSystemId);
    if (data.activePlanetId && this.simulations.has(data.activePlanetId)) {
      this.setActivePlanet(data.activePlanetId);
    }
    this.switchView('SYSTEM');
  }

  initPersistence() {
    window.game = this; // handy for debugging and automated checks

    const modal = document.getElementById('continue-modal');
    const info = document.getElementById('continue-info');
    const finish = () => {
      modal.classList.add('hidden');
      this.autosaveEnabled = true;
    };

    // A saved universe waits for the player's choice, and autosave stays off until then
    if (this.hasSave()) {
      this.autosaveEnabled = false;
      try {
        const saved = JSON.parse(localStorage.getItem(SAVE_KEY));
        info.textContent = `Seed "${saved.seed}" • saved ${new Date(saved.savedAt).toLocaleString()}`;
      } catch {
        info.textContent = 'A saved universe was found.';
      }
      modal.classList.remove('hidden');
    }

    document.getElementById('btn-continue-save').addEventListener('click', () => {
      sounds.playUIClick();
      this.loadFromText(localStorage.getItem(SAVE_KEY));
      finish();
    });
    document.getElementById('btn-discard-save').addEventListener('click', () => {
      sounds.playUIClick();
      finish();
    });

    setInterval(() => {
      if (this.autosaveEnabled) this.saveGame();
    }, AUTOSAVE_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.autosaveEnabled) this.saveGame();
    });
    window.addEventListener('beforeunload', () => {
      if (this.autosaveEnabled) this.saveGame();
    });
  }

  initGuide() {
    const guideModal = document.getElementById('guide-modal');
    const btnCloseGuide = document.getElementById('btn-close-guide');
    const btnDismissGuide = document.getElementById('btn-dismiss-guide');

    this.btnOpenGuide.addEventListener('click', () => {
      sounds.playUIClick();
      guideModal.classList.remove('hidden');
    });

    const closeGuide = () => {
      sounds.playUIClick();
      guideModal.classList.add('hidden');
    };

    btnCloseGuide.addEventListener('click', closeGuide);
    btnDismissGuide.addEventListener('click', closeGuide);
  }

  applyNewSeed(seed) {
    sounds.playDivineBlessing();
    this.currentSeed = seed;
    this.disposeSimulations();
    this.resetUniverse(seed);
    this.customPlanets = [];
    this.cosmicTimeAge = 0;
    this.loadSystem(this.galaxy.getActiveSystem().id);
    this.switchView('SYSTEM');
    this.notifications.push(`✨ Universe seeded: "${seed}"`);
  }

  // ---------- Navigation: universe > galaxy > system > planet surface ----------

  populateGalaxySelect() {
    this.galaxySelect.innerHTML = '';
    for (const def of this.universe.defs) {
      const opt = document.createElement('option');
      opt.value = String(def.index);
      opt.textContent = def.name;
      opt.selected = def.index === this.universe.activeIndex;
      this.galaxySelect.appendChild(opt);
    }
  }

  // Replaces the whole universe (new seed or loaded save).
  resetUniverse(seed) {
    this.solarSystem.resetSystems();
    this.solarSystem.scene.remove(this.universe.group);
    if (this.galaxy) this.solarSystem.scene.remove(this.galaxy.group);
    this.universe = new Universe(seed);
    this.galaxy = null;
    this.solarSystem.scene.add(this.universe.group);
    this.universe.group.visible = this.currentView === 'UNIVERSE';
    this.setActiveGalaxy(0);
  }

  setActiveGalaxy(index) {
    if (this.galaxy && this.galaxy.index === index) return;
    if (this.galaxy) this.solarSystem.scene.remove(this.galaxy.group);
    this.galaxy = this.universe.getGalaxy(index);
    this.universe.activeIndex = index;
    this.solarSystem.scene.add(this.galaxy.group);
    this.galaxy.group.visible = this.currentView === 'GALAXY';
    this.populateGalaxySelect();
  }

  enterGalaxy(index) {
    this.setActiveGalaxy(index);
    this.loadSystem(this.galaxy.activeSystemId);
    this.switchView('GALAXY');
  }

  enterSystem(systemId) {
    this.loadSystem(systemId);
    this.switchView('SYSTEM');
  }

  // Click-to-fly: the camera swoops towards the target, a short warp fade covers the switch.
  travel(point, radius, arrive) {
    this.solarSystem.flyTo(point, radius);
    this.warpOverlay.classList.add('on');
    clearTimeout(this.travelTimer);
    this.travelTimer = setTimeout(() => {
      arrive();
      this.warpOverlay.classList.remove('on');
    }, 520);
  }

  // The view one level up: surface -> system -> galaxy -> universe
  goUp() {
    const up = { SURFACE: 'SYSTEM', SYSTEM: 'GALAXY', GALAXY: 'UNIVERSE' }[this.currentView];
    if (up) this.switchView(up);
  }

  updateBreadcrumb() {
    if (!this.breadcrumb || !this.galaxy) return;
    const system = this.galaxy.systems.find(sys => sys.id === this.galaxy.activeSystemId);
    const levels = [
      { view: 'UNIVERSE', label: 'Universe' },
      { view: 'GALAXY', label: this.galaxy.name },
      { view: 'SYSTEM', label: system ? system.name : 'System' }
    ];
    if (this.activeSim) levels.push({ view: 'SURFACE', label: this.activeSim.planet.name });

    this.breadcrumb.replaceChildren();
    levels.forEach((level, i) => {
      if (i > 0) {
        const sep = document.createElement('span');
        sep.className = 'crumb-sep';
        sep.textContent = '›';
        this.breadcrumb.appendChild(sep);
      }
      const button = document.createElement('button');
      button.className = 'crumb';
      button.textContent = level.label;
      button.title = `Go to the ${level.view.toLowerCase()} view`;
      if (level.view === this.currentView) button.setAttribute('aria-current', 'page');
      button.addEventListener('click', () => this.switchView(level.view));
      this.breadcrumb.appendChild(button);
    });
  }

  initNavigation() {
    this.galaxySelect.addEventListener('change', (e) => {
      sounds.playUIClick();
      this.enterGalaxy(Number(e.target.value));
    });

    // 1-4 jump between views, Backspace goes up one level
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if (document.querySelector('.modal-overlay:not(.hidden)')) return;
      const views = { '1': 'UNIVERSE', '2': 'GALAXY', '3': 'SYSTEM', '4': 'SURFACE' };
      if (views[e.key] && !(this.currentView === 'SURFACE' && e.key >= '1' && e.key <= '9')) { // on the surface the digits pick powers (see ui/powerPalette.js)
        this.switchView(views[e.key]);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        this.goUp();
      }
    });
    this.updateBreadcrumb();
  }

  switchView(targetView) {
    sounds.playUIClick();
    this.currentView = targetView;
    document.body.dataset.view = targetView;
    const solar = this.solarSystem;
    const origin = new THREE.Vector3(0, 0, 0);

    [this.btnViewUniverse, this.btnViewGalaxy, this.btnViewSystem, this.btnViewSurface].forEach(b => b.classList.remove('active'));
    this.universe.group.visible = targetView === 'UNIVERSE';
    this.galaxy.group.visible = targetView === 'GALAXY';
    solar.setSystemVisible(targetView === 'SYSTEM');
    solar.pickables = [];

    const spaceView = targetView === 'UNIVERSE' || targetView === 'GALAXY' || targetView === 'SYSTEM';
    if (spaceView) {
      this.solarContainer.classList.remove('hidden');
      this.surfaceContainer.classList.add('hidden');
      if (this.surfaceNavControls) this.surfaceNavControls.classList.add('hidden');
      // Close inspector when leaving planet surface
      if (this.inspector) this.inspector.clear();
    }

    if (targetView === 'UNIVERSE') {
      this.btnViewUniverse.classList.add('active');
      solar.selectedPlanet = null;
      solar.flyTo(origin, 900);
      solar.pickables = this.universe.pickTargets.map(t => ({
        object: t.object,
        onPick: () => this.travel(this.universe.defs[t.galaxyIndex].position, 140, () => this.enterGalaxy(t.galaxyIndex))
      }));
    } else if (targetView === 'GALAXY') {
      this.btnViewGalaxy.classList.add('active');
      solar.selectedPlanet = null;
      solar.flyTo(origin, 550);
      solar.pickables = this.galaxy.pickTargets.map(t => ({
        object: t.object,
        onPick: () => {
          const system = this.galaxy.systems.find(sys => sys.id === t.systemId);
          this.travel(system.galaxyPosition, 70, () => this.enterSystem(t.systemId));
        }
      }));
    } else if (targetView === 'SYSTEM') {
      this.btnViewSystem.classList.add('active');
      solar.flyTo(origin);
      if (this.activeSim) {
        solar.selectPlanet(this.activeSim.planet);
        solar.orbitAngles.radius = 260;
      }
    } else if (targetView === 'SURFACE') {
      this.btnViewSurface.classList.add('active');
      this.solarContainer.classList.add('hidden');
      this.surfaceContainer.classList.remove('hidden');
      if (this.surfaceNavControls) this.surfaceNavControls.classList.remove('hidden');

      if (this.activeSim) {
        this.activeSim.renderer.initCanvasSize();
        this.activeSim.renderer.currentPower = this.activeSim.divine.activePower;
      }
    }

    if (this.overview) this.overview.setVisible(targetView === 'SURFACE');
    if (this.minimap) {
      this.minimap.setVisible(targetView === 'SURFACE');
      this.lensPanel.setVisible(targetView === 'SURFACE');
    }
    this.updateBreadcrumb();
    this.updateFocusCard();
  }

  initWorkshop() {
    const modal = document.getElementById('workshop-modal');
    this.workshop = new CreationWorkshop({
      root: modal,
      getSim: () => this.activeSim,
      getSystemName: () => this.galaxy.getActiveSystem().name,
      onSpawnReady: (spawnData) => {
        modal.classList.add('hidden');
        if (this.currentView !== 'SURFACE') {
          this.switchView('SURFACE');
        }
        this.activeSim.divine.armSpawn(spawnData);
        this.activeSim.renderer.currentPower = this.activeSim.divine.activePower;
        this.palette.setActive(this.activeSim.divine.activePower);
        this.surfaceCanvas.style.cursor = 'crosshair';
        this.notifications.push(`✨ Click anywhere on ${this.activeSim.planet.name} to place your creation!`, 'info', true);
      },
      onPlanetReady: (pConfig) => {
        const sysData = this.galaxy.getActiveSystem();
        sysData.planets.push(pConfig); // keeps the planet when you leave and re-enter the system
        this.customPlanets.push({ systemId: sysData.id, config: pConfig });
        const newPlanet = this.solarSystem.addPlanet(pConfig);
        this.updatePlanetSelectOptions();
        this.setActivePlanet(newPlanet.id);
        this.switchView('SYSTEM');
        this.notifications.push(`🪐 New planet "${newPlanet.name}" placed in orbit!`);
      }
    });

    document.getElementById('btn-open-workshop').addEventListener('click', () => {
      sounds.playUIClick();
      this.workshop.open();
    });
  }

  // Surface view starts uncluttered: the overview, planet map, Resources lens and pan pad are hidden until
  // the player opens them (panels button or H). The choice is remembered.
  initPanelsToggle() {
    const button = document.getElementById('btn-toggle-panels');
    this.panelsUnread = button.querySelector('.unread-dot');
    let shown = false;
    try { shown = localStorage.getItem('genesis-cosmos-panels') === 'shown'; } catch { /* storage blocked */ }
    const apply = (on) => {
      this.panelsShown = on;
      document.body.classList.toggle('panels-hidden', !on);
      button.setAttribute('aria-pressed', String(on));
      button.title = `${on ? 'Hide' : 'Show'} panels: world overview, planet map, resources (H)`;
      if (on) this.panelsUnread.hidden = true;
      try { localStorage.setItem('genesis-cosmos-panels', on ? 'shown' : 'hidden'); } catch { /* storage blocked */ }
    };
    apply(shown);
    button.addEventListener('click', () => {
      sounds.playUIClick();
      apply(!this.panelsShown);
    });
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || (e.key !== 'h' && e.key !== 'H')) return;
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if (document.querySelector('.modal-overlay:not(.hidden)')) return;
      apply(!this.panelsShown);
    });
  }

  // Every window closes with Esc or a click on the dimmed backdrop (the saved-universe question needs an answer).
  initModals() {
    const closable = () => [...document.querySelectorAll('.modal-overlay:not(.hidden)')].filter(m => m.id !== 'continue-modal');
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const open = closable();
      if (open.length) open[open.length - 1].classList.add('hidden');
    });
    for (const modal of document.querySelectorAll('.modal-overlay')) {
      if (modal.id === 'continue-modal') continue;
      let downOnBackdrop = false;
      modal.addEventListener('pointerdown', (e) => { downOnBackdrop = e.target === modal; });
      modal.addEventListener('click', (e) => {
        if (downOnBackdrop && e.target === modal) modal.classList.add('hidden');
      });
    }
  }

  tick(currentTime) {
    const dt = Math.min((currentTime - this.lastTime) / 1000, 0.1);
    this.lastTime = currentTime;
    if (this.activeSim) setActiveRng(this.activeSim.rng);

    if (this.timeSpeed > 0) {
      this.cosmicTimeAge += dt * (this.timeSpeed > 100 ? 50 : this.timeSpeed) * 0.001;
    }

    // 1. Update Galaxy & Solar System
    this.galaxy.update(dt);
    this.solarSystem.update(dt, this.timeSpeed);

    // 2. Handle Space Physics Collision Events (Deduplicated single-fire)
    while (this.solarSystem.physics.collisionEvents.length > 0) {
      const evt = this.solarSystem.physics.collisionEvents.pop();

      if (evt.type === 'ASTEROID_IMPACT') {
        sounds.playMeteorImpact();
        const p = evt.planet;
        const sim = this.simulations.get(p.id);

        if (sim) {
          // The strike lands near the start area, where the civilizations are
          const craterX = Math.floor(sim.terrain.home.x + (random() - 0.5) * 40);
          const craterY = Math.floor(sim.terrain.home.y + (random() - 0.5) * 30);
          sim.terrain.strikeMeteor(craterX, craterY);

          if (evt.severity === 'MASS_EXTINCTION') {
            for (const ent of sim.ecosystem.entities) {
              if (random() < 0.75) ent.die('Asteroid Extinction Cataclysm');
            }
            for (const civ of sim.society.civilizations) {
              civ.collapse(sim.terrain, 'Asteroid Cataclysm', sim.ecosystem);
            }
            this.notifications.push(`☄️ EXTINCTION EVENT: Asteroid impacted ${p.name}!`);
          } else {
            this.notifications.push(`☄️ Asteroid struck ${p.name}, causing seismic shockwaves!`);
          }
        }
      } else if (evt.type === 'BLACK_HOLE_CONSUMED') {
        sounds.playMeteorImpact();
        this.notifications.push(`🕳️ ${evt.body.name} was consumed by the Black Hole!`);
      } else if (evt.type === 'STAR_CONSUMED') {
        sounds.playMeteorImpact();
        if (this.solarSystem && this.solarSystem.triggerSolarFlare) {
          this.solarSystem.triggerSolarFlare();
        }
        this.notifications.push(`☀️ SOLAR INCINERATION: Planet "${evt.body.name}" was pulled past the Roche limit and swallowed by ${evt.starName || 'the Sun'}!`);
        if (this.activeSim && this.activeSim.planet.id === evt.body.id) {
          this.updateFocusCard();
          if (this.currentView === 'SURFACE') {
            this.switchView('SYSTEM');
          }
        }
      }
    }

    // 3. Update Active Planetary Simulation
    if (this.activeSim && this.timeSpeed > 0 && !this.activeSim.planet.isConsumed) {
      const { terrain, ecosystem } = this.activeSim;

      // Geology runs once per frame at the raw speed. Creatures and civilizations
      // advance in fixed steps so behaviour is identical at every speed.
      terrain.update(dt, this.timeSpeed);
      this.activeSim.divine.regen(dt);
      const steps = this.stepper.advance(dt, this.timeSpeed);
      const ran = runSimulationSteps(this.activeSim, steps, { budgetMs: 12 });
      this.activeSim.simSeconds += ran * SIM_STEP;

      // World news goes to the overview's event log, not to pop-ups; only replies to the player's own
      // actions are toasted. Unread news lights a dot on the panels button.
      while (ecosystem.notifications.length > 0) {
        const notif = ecosystem.notifications.pop();
        if (notif.player) this.notifications.push(notif.text, 'info');
        if (!notif.minor) {
          const log = this.activeSim.eventLog;
          log.unshift(notif.text);
          if (log.length > 30) log.length = 30;
          if (!notif.player && !this.panelsShown) this.panelsUnread.hidden = false;
        }
      }

      this.epochDisplay.innerText = `Epoch: ${terrain.timeAge.toFixed(1)} MYA`;
      this.activeSim.lastActiveCosmicAge = this.cosmicTimeAge;
    }

    // 4. Render Surface if active
    if (this.currentView === 'SURFACE' && this.activeSim) {
      this.activeSim.renderer.render(dt);
      this.minimap.update(dt);
    }

    // Chunks far from the camera, creatures and civilizations are evicted (their changes are remembered)
    if (this.activeSim && currentTime - this.lastChunkPrune > 2000) {
      this.lastChunkPrune = currentTime;
      this.pruneActiveTerrain();
    }

    // Years readout and world overview refresh a few times per second
    if (this.activeSim && currentTime - this.lastHudRefresh > 250) {
      this.lastHudRefresh = currentTime;
      this.refreshHud();
    }

    // 5. Live update inspector if inspecting and on planet surface
    if (this.inspector.currentTarget) {
      this.inspector.sim = this.activeSim; // family and settlement lookups
      if (this.currentView !== 'SURFACE') {
        this.inspector.clear();
      } else if (currentTime - this.lastInspectorRender > 200) {
        this.lastInspectorRender = currentTime;
        this.inspector.render();
      }
    }

    requestAnimationFrame(this.tick);
  }
}

// Start application
window.addEventListener('DOMContentLoaded', () => {
  new GameApp();
});
