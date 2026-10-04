import * as THREE from 'three';
import { CelestialBody } from './celestialBody.js';
import { SpacePhysicsEngine } from './spacePhysics.js';

export class SolarSystem {
  constructor(canvasContainer) {
    this.container = canvasContainer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.5, 3000);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // Physics Engine
    this.physics = new SpacePhysicsEngine(12000, 0.85);

    this.planets = [];
    this.selectedPlanet = null;
    this.currentSystemId = null;
    this.systemStates = new Map();   // systemId -> { planets, blackHoles, asteroids } while not loaded
    this.systemVisible = true;       // false in the galaxy / universe views
    this.focusPoint = new THREE.Vector3(0, 0, 0); // what the camera orbits when no planet is selected
    this.pickables = [];             // click targets: { object, onPick }
    this.targetCameraPos = new THREE.Vector3(0, 180, 260);
    this.targetLookAt = new THREE.Vector3(0, 0, 0);
    this.currentLookAt = new THREE.Vector3(0, 0, 0);

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.isDragging = false;
    this.prevMousePos = { x: 0, y: 0 };
    this.orbitAngles = { theta: 0.8, phi: 0.9, radius: 260 };

    this.sunGroup = new THREE.Group();
    this.scene.add(this.sunGroup);

    this.initLighting();
    this.initSun();
    this.initStarfield();
    this.initEvents();

    this.camera.position.set(0, 180, 260);
  }

  initLighting() {
    this.ambientLight = new THREE.AmbientLight(0x223355, 0.45);
    this.scene.add(this.ambientLight);

    this.sunLight = new THREE.PointLight(0xfff5e6, 2.8, 1800, 0.8);
    this.sunLight.castShadow = true;
    this.scene.add(this.sunLight);
  }

  initSun(starConfig = null) {
    // Clear old sun
    while (this.sunGroup.children.length > 0) {
      this.sunGroup.remove(this.sunGroup.children[0]);
    }

    const radius = starConfig ? starConfig.radius : 14;
    const color = starConfig ? starConfig.color : 0xffcc33;
    const lightCol = starConfig ? starConfig.lightColor : 0xfff5e6;
    const starMass = starConfig ? starConfig.mass : 12000;
    const starName = starConfig ? starConfig.name : 'the Sun';

    this.physics.updateStarProperties(starMass, radius, starName);
    this.sunLight.color.setHex(lightCol);
    this.sunLight.intensity = 2.8;

    const sunGeom = new THREE.SphereGeometry(radius, 48, 48);
    const sunMat = new THREE.MeshBasicMaterial({ color: color });
    this.sunMesh = new THREE.Mesh(sunGeom, sunMat);
    this.sunGroup.add(this.sunMesh);

    // Corona glow
    const glowGeom = new THREE.SphereGeometry(radius * 1.25, 32, 32);
    const glowMat = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide
    });
    const glowMesh = new THREE.Mesh(glowGeom, glowMat);
    this.sunGroup.add(glowMesh);

    // Faint Roche limit tidal danger ring
    const rocheRadius = radius * 2.2;
    const rocheGeom = new THREE.BufferGeometry();
    const rochePoints = [];
    for (let i = 0; i <= 64; i++) {
      const theta = (i / 64) * Math.PI * 2;
      rochePoints.push(new THREE.Vector3(Math.cos(theta) * rocheRadius, 0, Math.sin(theta) * rocheRadius));
    }
    rocheGeom.setFromPoints(rochePoints);
    const rocheMat = new THREE.LineBasicMaterial({
      color: 0xff4400,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending
    });
    const rocheLine = new THREE.Line(rocheGeom, rocheMat);
    this.sunGroup.add(rocheLine);
  }

  initStarfield() {
    const starsGeom = new THREE.BufferGeometry();
    const starCount = 3500;
    const positions = new Float32Array(starCount * 3);
    const colors = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount; i++) {
      const i3 = i * 3;
      const r = 700 + Math.random() * 900;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);

      positions[i3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i3 + 2] = r * Math.cos(phi);

      colors[i3] = 0.8 + Math.random() * 0.2;
      colors[i3 + 1] = 0.85 + Math.random() * 0.15;
      colors[i3 + 2] = 1.0;
    }

    starsGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    starsGeom.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const starMat = new THREE.PointsMaterial({
      size: 2.2,
      vertexColors: true,
      transparent: true,
      opacity: 0.85
    });

    this.scene.add(new THREE.Points(starsGeom, starMat));
  }

  // Every star system keeps its own planets, black holes and asteroids. Switching systems parks the
  // current one and restores the next, so a hazard never leaks into other systems and planets keep
  // their state (a consumed planet stays consumed).
  loadSystemData(systemData) {
    if (this.currentSystemId === systemData.id) return;
    this.detachCurrentSystem();
    this.currentSystemId = systemData.id;
    this.initSun(systemData.star);

    const saved = this.systemStates.get(systemData.id);
    if (saved) {
      this.systemStates.delete(systemData.id);
      for (const planet of saved.planets) this.attachPlanet(planet);
      this.physics.blackHoles = saved.blackHoles;
      this.physics.asteroids = saved.asteroids;
      for (const hazard of [...saved.blackHoles, ...saved.asteroids]) {
        if (hazard.mesh) this.scene.add(hazard.mesh);
      }
    } else {
      for (const pConfig of systemData.planets) {
        this.addPlanet(pConfig);
      }
    }

    if (this.planets.length > 0) {
      // Pick first habitable planet or first planet
      const bestPlanet = this.planets.find(p => p.isPopulated) || this.planets[0];
      this.selectPlanet(bestPlanet);
    }
  }

  // Parks the loaded system (see loadSystemData).
  detachCurrentSystem() {
    if (!this.currentSystemId) return;
    for (const planet of this.planets) {
      this.physics.unregisterBody(planet);
      this.scene.remove(planet.pivot);
      this.scene.remove(planet.orbitLine);
    }
    for (const hazard of [...this.physics.blackHoles, ...this.physics.asteroids]) {
      if (hazard.mesh) this.scene.remove(hazard.mesh);
    }
    this.systemStates.set(this.currentSystemId, {
      planets: this.planets,
      blackHoles: this.physics.blackHoles,
      asteroids: this.physics.asteroids
    });
    this.physics.blackHoles = [];
    this.physics.asteroids = [];
    this.physics.collisionEvents = [];
    this.planets = [];
    this.selectedPlanet = null;
    this.currentSystemId = null;
  }

  // Forgets every system (a new universe is being created).
  resetSystems() {
    this.detachCurrentSystem();
    this.systemStates.clear();
  }

  // The galaxy and universe views hide the current system so it does not draw on top of them.
  setSystemVisible(visible) {
    this.systemVisible = visible;
    this.sunGroup.visible = visible;
  }

  // Points the camera at `point` from `radius` away (used for click-to-fly in the space views).
  flyTo(point, radius) {
    this.focusPoint.copy(point);
    if (radius !== undefined) this.orbitAngles.radius = radius;
  }

  attachPlanet(planet) {
    this.planets.push(planet);
    this.physics.registerBody(planet);
    this.scene.add(planet.pivot);
    this.scene.add(planet.orbitLine);
  }

  addPlanet(config) {
    const planet = new CelestialBody(config);
    this.attachPlanet(planet);
    return planet;
  }

  selectPlanet(planet) {
    this.selectedPlanet = planet;
  }

  // --- COSMIC EVENTS ---

  // Trigger asteroid strike targeting a planet or random path
  launchCosmicAsteroid(targetPlanet = null) {
    const target = targetPlanet || this.selectedPlanet || this.planets[0];
    const spawnDistance = 250;
    const angle = Math.random() * Math.PI * 2;
    const startPos = new THREE.Vector3(Math.cos(angle) * spawnDistance, (Math.random() - 0.5) * 40, Math.sin(angle) * spawnDistance);

    const ast = this.physics.spawnAsteroid(startPos, target, 24);

    // Asteroid mesh
    const geom = new THREE.DodecahedronGeometry(ast.radius, 1);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x884422,
      roughness: 0.9,
      emissive: 0x441100
    });
    ast.mesh = new THREE.Mesh(geom, mat);
    ast.mesh.position.copy(startPos);
    this.scene.add(ast.mesh);

    return ast;
  }

  // Spawn black hole singularity into the system
  createSingularity(distance = 160) {
    const angle = Math.random() * Math.PI * 2;
    const pos = new THREE.Vector3(Math.cos(angle) * distance, 0, Math.sin(angle) * distance);
    const bh = this.physics.spawnBlackHole(pos, 45000, 10);

    const bhGroup = new THREE.Group();
    // Event horizon sphere
    const horizonGeom = new THREE.SphereGeometry(bh.radius, 32, 32);
    const horizonMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const horizonMesh = new THREE.Mesh(horizonGeom, horizonMat);
    bhGroup.add(horizonMesh);

    // Accretion disk
    const diskGeom = new THREE.RingGeometry(bh.radius * 1.3, bh.radius * 3.2, 64);
    const diskMat = new THREE.MeshBasicMaterial({
      color: 0xff6600,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending
    });
    const diskMesh = new THREE.Mesh(diskGeom, diskMat);
    diskMesh.rotation.x = Math.PI / 2 + 0.2;
    bhGroup.add(diskMesh);

    bhGroup.position.copy(pos);
    this.scene.add(bhGroup);
    bh.mesh = bhGroup;

    return bh;
  }

  triggerSolarFlare() {
    // Intense solar eruption flash when a planet is consumed
    if (this.sunLight) {
      this.sunLight.intensity = 6.0;
    }
  }

  initEvents() {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    const dom = this.renderer.domElement;

    dom.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.prevMousePos = { x: e.clientX, y: e.clientY };
    });

    // Pointer cursor over anything clickable in the space views
    dom.addEventListener('mousemove', (e) => {
      if (this.isDragging || this.pickables.length === 0) {
        dom.style.cursor = '';
        return;
      }
      this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const over = this.raycaster.intersectObjects(this.pickables.map(p => p.object)).length > 0;
      dom.style.cursor = over ? 'pointer' : '';
    });

    window.addEventListener('mousemove', (e) => {
      if (this.isDragging) {
        const dx = e.clientX - this.prevMousePos.x;
        const dy = e.clientY - this.prevMousePos.y;

        this.orbitAngles.theta -= dx * 0.008;
        this.orbitAngles.phi = Math.max(0.1, Math.min(Math.PI - 0.1, this.orbitAngles.phi + dy * 0.008));
        this.prevMousePos = { x: e.clientX, y: e.clientY };
      }
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
    });

    dom.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.orbitAngles.radius = Math.max(30, Math.min(1400, this.orbitAngles.radius + e.deltaY * (this.orbitAngles.radius > 500 ? 0.5 : 0.2)));
    }, { passive: false });

    dom.addEventListener('click', (e) => {
      this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
      this.raycaster.setFromCamera(this.mouse, this.camera);

      // Galaxy / universe views: click a star system or galaxy
      if (this.pickables.length > 0) {
        const hit = this.raycaster.intersectObjects(this.pickables.map(p => p.object))[0];
        if (hit) {
          const picked = this.pickables.find(p => p.object === hit.object);
          if (picked) picked.onPick();
        }
        return;
      }

      const targets = this.planets.filter(p => !p.isConsumed).map(p => p.mesh);
      const intersects = this.raycaster.intersectObjects(targets);

      if (intersects.length > 0) {
        const hitMesh = intersects[0].object;
        const hitPlanet = this.planets.find(p => p.mesh === hitMesh);
        if (hitPlanet) {
          this.selectPlanet(hitPlanet);
          if (window.onPlanetSelected) {
            window.onPlanetSelected(hitPlanet);
          }
        }
      }
    });
  }

  update(timeDelta, timeSpeedMultiplier = 1) {
    if (this.sunMesh) {
      this.sunMesh.rotation.y += 0.002 * timeDelta;
    }

    // Decay solar flare pulse back to baseline
    if (this.sunLight && this.sunLight.intensity > 2.8) {
      this.sunLight.intensity = Math.max(2.8, this.sunLight.intensity - timeDelta * 3.0);
    }

    // Step realistic space physics
    this.physics.step(timeDelta, timeSpeedMultiplier);

    // Planets, orbits and hazards are hidden in the galaxy / universe views
    const visible = this.systemVisible;
    for (const p of this.planets) {
      p.pivot.visible = visible;
      p.orbitLine.visible = visible;
    }
    for (const hazard of [...this.physics.blackHoles, ...this.physics.asteroids]) {
      if (hazard.mesh) hazard.mesh.visible = visible;
    }

    // Update visuals on planets
    for (const p of this.planets) {
      p.update(timeDelta, timeSpeedMultiplier);
    }

    // Rotate black hole accretion disks
    for (const bh of this.physics.blackHoles) {
      if (bh.mesh) {
        bh.mesh.rotation.y += 0.04 * timeDelta;
      }
    }

    // Camera follow
    if (this.selectedPlanet && !this.selectedPlanet.isConsumed) {
      const pPos = new THREE.Vector3();
      this.selectedPlanet.getWorldPosition(pPos);
      this.targetLookAt.lerp(pPos, 0.08);

      const targetX = pPos.x + this.orbitAngles.radius * Math.sin(this.orbitAngles.phi) * Math.sin(this.orbitAngles.theta);
      const targetY = pPos.y + this.orbitAngles.radius * Math.cos(this.orbitAngles.phi);
      const targetZ = pPos.z + this.orbitAngles.radius * Math.sin(this.orbitAngles.phi) * Math.cos(this.orbitAngles.theta);
      this.targetCameraPos.set(targetX, targetY, targetZ);
    } else {
      this.targetLookAt.copy(this.focusPoint);
      const targetX = this.focusPoint.x + this.orbitAngles.radius * Math.sin(this.orbitAngles.phi) * Math.sin(this.orbitAngles.theta);
      const targetY = this.focusPoint.y + this.orbitAngles.radius * Math.cos(this.orbitAngles.phi);
      const targetZ = this.focusPoint.z + this.orbitAngles.radius * Math.sin(this.orbitAngles.phi) * Math.cos(this.orbitAngles.theta);
      this.targetCameraPos.set(targetX, targetY, targetZ);
    }

    this.camera.position.lerp(this.targetCameraPos, 0.06);
    this.currentLookAt.lerp(this.targetLookAt, 0.08);
    this.camera.lookAt(this.currentLookAt);

    this.renderer.render(this.scene, this.camera);
  }
}
