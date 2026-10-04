import * as THREE from 'three';
import { SeededRNG } from './seed.js';
import { makeLabelSprite, makePickSphere } from './labels.js';

const GREEK = ['', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta'];
// Colour channel permutations so every galaxy has its own palette
const TINTS = [[0, 1, 2], [2, 1, 0], [1, 0, 2], [1, 2, 0], [2, 0, 1], [0, 2, 1]];

export class Galaxy {
  // options: { index, name, tint }. Galaxy 0 keeps the original ids so older saves still load;
  // other galaxies prefix their ids (g2_sys_0, g2_p_0_1) so ids are unique across the universe.
  constructor(seedString = 'MilkyWay-01', { index = 0, name = 'Home Galaxy', tint = 0 } = {}) {
    this.rng = new SeededRNG(seedString);
    this.index = index;
    this.name = name;
    this.tint = tint % TINTS.length;
    this.idPrefix = index === 0 ? '' : `g${index}_`;
    this.systems = [];
    this.activeSystemId = null;
    this.pickTargets = []; // clickable star-system nodes: { object, systemId }

    // Three.js visual objects for Galaxy View
    this.group = new THREE.Group();
    this.starPoints = null;
    this.centralBlackHole = null;

    this.initGalaxyStars();
    this.generateSystemsFromSeed();
  }

  reseed(newSeed) {
    this.rng.setSeed(newSeed);
    // Clear old systems
    this.systems = [];
    this.generateSystemsFromSeed();
  }

  initGalaxyStars() {
    const starCount = 4500;
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(starCount * 3);
    const colors = new Float32Array(starCount * 3);

    // 2-arm logarithmic spiral galaxy with core bulge
    const arms = 2;
    for (let i = 0; i < starCount; i++) {
      const i3 = i * 3;
      const r = Math.pow(this.rng.next(), 2) * 550 + 20;
      const spinAngle = r * 0.015;
      const armAngle = ((i % arms) * 2 * Math.PI) / arms;

      const randomX = Math.pow(this.rng.next(), 3) * (this.rng.bool() ? 1 : -1) * 35;
      const randomY = Math.pow(this.rng.next(), 3) * (this.rng.bool() ? 1 : -1) * 25;
      const randomZ = Math.pow(this.rng.next(), 3) * (this.rng.bool() ? 1 : -1) * 35;

      positions[i3] = Math.cos(armAngle + spinAngle) * r + randomX;
      positions[i3 + 1] = randomY;
      positions[i3 + 2] = Math.sin(armAngle + spinAngle) * r + randomZ;

      // Color gradation: Core is warm golden/amber, outer arms are electric blue/violet
      const coreMix = 1 - Math.min(1, r / 300);
      const base = [0.5 + coreMix * 0.5, 0.6 + coreMix * 0.3, 1.0 - coreMix * 0.5];
      const [cr, cg, cb] = TINTS[this.tint];
      colors[i3] = base[cr];
      colors[i3 + 1] = base[cg];
      colors[i3 + 2] = base[cb];
    }

    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: 2.4,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending
    });

    this.starPoints = new THREE.Points(geom, mat);
    this.group.add(this.starPoints);

    // Supermassive Black Hole at Galaxy Center with Accretion Disk
    const bhCoreGeom = new THREE.SphereGeometry(12, 32, 32);
    const bhCoreMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const bhMesh = new THREE.Mesh(bhCoreGeom, bhCoreMat);

    // Glowing Accretion Disk Ring
    const diskGeom = new THREE.RingGeometry(14, 38, 64);
    const diskMat = new THREE.MeshBasicMaterial({
      color: 0xffaa22,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending
    });
    const diskMesh = new THREE.Mesh(diskGeom, diskMat);
    diskMesh.rotation.x = Math.PI / 2 + 0.2;

    this.centralBlackHole = new THREE.Group();
    this.centralBlackHole.add(bhMesh);
    this.centralBlackHole.add(diskMesh);
    this.group.add(this.centralBlackHole);
  }

  generateSystemsFromSeed() {
    const starNames = [
      'Sol Prime', 'Alpha Centauri', 'Kepler-452', 'Vega Void',
      'Sirius Bastion', 'Proxima Gate', 'Trappist Realm', 'Cygnus Nexus'
    ];

    const starTypes = [
      { name: 'Yellow Dwarf', color: 0xffcc33, lightColor: 0xfff5e6, mass: 12000, radius: 14 },
      { name: 'Red Giant', color: 0xff4422, lightColor: 0xff8866, mass: 24000, radius: 22 },
      { name: 'Blue Supergiant', color: 0x66bbff, lightColor: 0xddeeff, mass: 35000, radius: 18 },
      { name: 'White Dwarf', color: 0xeeeeff, lightColor: 0xffffff, mass: 16000, radius: 8 },
      { name: 'Pulsar Neutron Star', color: 0xaa44ff, lightColor: 0xddaaff, mass: 45000, radius: 6 }
    ];

    const planetArchetypes = [
      { type: 'terrestrial', nameSuffix: 'Terra', habitableChance: 0.85 },
      { type: 'desert', nameSuffix: 'Sands', habitableChance: 0.2 },
      { type: 'ice', nameSuffix: 'Cryo', habitableChance: 0.15 },
      { type: 'volcanic', nameSuffix: 'Pyro', habitableChance: 0.05 },
      { type: 'alien', nameSuffix: 'Xeno', habitableChance: 0.65 }
    ];

    const suffix = GREEK[this.index % GREEK.length];
    for (let s = 0; s < starNames.length; s++) {
      const systemName = suffix ? `${starNames[s]} ${suffix}` : starNames[s];
      const sRng = new SeededRNG(`${this.rng.seedString}_sys_${s}`);
      const starType = sRng.choice(starTypes);

      // Orbital position in galaxy
      const gAngle = (s / starNames.length) * Math.PI * 2 + sRng.range(-0.3, 0.3);
      const gDist = sRng.range(120, 420);
      const galaxyPos = new THREE.Vector3(
        Math.cos(gAngle) * gDist,
        sRng.range(-15, 15),
        Math.sin(gAngle) * gDist
      );

      // Generate planets for this system
      const planetCount = sRng.rangeInt(3, 6);
      const planets = [];

      for (let p = 0; p < planetCount; p++) {
        const arch = sRng.choice(planetArchetypes);
        // Ensure innermost planet is generated safely outside the star's Roche tidal capture boundary
        const safeInnerDist = Math.max(50, starType.radius * 2.5);
        const dist = safeInnerDist + p * sRng.range(28, 44);

        // Goldilocks zone dynamically scaled for star type radius & luminosity
        const goldilocksInner = Math.max(55, starType.radius * 3.2);
        const goldilocksOuter = goldilocksInner + 70;
        const isGoldilocks = dist >= goldilocksInner && dist <= goldilocksOuter;
        const isPopulated = isGoldilocks && sRng.bool(arch.habitableChance);

        planets.push({
          id: `${this.idPrefix}p_${s}_${p}`,
          name: `${systemName} ${String.fromCharCode(65 + p)} (${arch.nameSuffix})`,
          type: arch.type,
          radius: sRng.range(3.2, 6.2),
          distance: dist,
          orbitSpeed: Math.sqrt(starType.mass * 0.8 / Math.pow(dist, 3)) * 0.08,
          axialTilt: sRng.range(0.05, 0.6),
          isPopulated: isPopulated,
          hasAtmosphere: arch.type === 'terrestrial' || arch.type === 'alien' || sRng.bool(0.4),
          seed: `${sRng.seedString}_planet_${p}`
        });
      }

      this.systems.push({
        id: `${this.idPrefix}sys_${s}`,
        name: systemName,
        galaxyIndex: this.index,
        star: starType,
        galaxyPosition: galaxyPos,
        planets: planets,
        isCustom: false
      });
    }

    this.activeSystemId = this.systems[0].id;
    this.buildSystemNodes();
  }

  // Clickable, labelled markers for every star system (shown in the galaxy view).
  buildSystemNodes() {
    if (this.nodeGroup) this.group.remove(this.nodeGroup);
    this.nodeGroup = new THREE.Group();
    this.pickTargets = [];

    for (const system of this.systems) {
      const node = new THREE.Group();
      node.position.copy(system.galaxyPosition);

      const core = new THREE.Mesh(
        new THREE.SphereGeometry(5.5, 16, 16),
        new THREE.MeshBasicMaterial({ color: system.star.color })
      );
      node.add(core);

      const halo = new THREE.Mesh(
        new THREE.SphereGeometry(11, 16, 16),
        new THREE.MeshBasicMaterial({
          color: system.star.color, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false
        })
      );
      node.add(halo);

      const inhabited = system.planets.some(p => p.isPopulated);
      if (inhabited) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(14, 16, 40),
          new THREE.MeshBasicMaterial({ color: 0x4ade80, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })
        );
        ring.rotation.x = Math.PI / 2;
        node.add(ring);
      }

      const label = makeLabelSprite(system.name + (inhabited ? '  •' : ''), { color: inhabited ? '#86efac' : '#e2e8f0', width: 130 });
      if (label) {
        label.position.set(0, 24, 0);
        node.add(label);
      }

      const pick = makePickSphere(22);
      node.add(pick);
      this.pickTargets.push({ object: pick, systemId: system.id });
      this.nodeGroup.add(node);
    }
    this.group.add(this.nodeGroup);
  }

  getActiveSystem() {
    return this.systems.find(s => s.id === this.activeSystemId) || this.systems[0];
  }

  update(dt) {
    if (this.starPoints) {
      this.starPoints.rotation.y += 0.0004 * dt;
    }
    if (this.centralBlackHole) {
      this.centralBlackHole.rotation.y += 0.01 * dt;
    }
  }
}
