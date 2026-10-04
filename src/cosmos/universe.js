// The universe: several galaxies you can travel between. Real Galaxy objects (4500 stars plus star
// systems) are only built when you enter them; the intergalactic view shows light-weight proxies.
import * as THREE from 'three';
import { SeededRNG } from './seed.js';
import { Galaxy } from './galaxy.js';
import { makeLabelSprite, makePickSphere } from './labels.js';

export const GALAXY_COUNT = 6;
const GALAXY_NAMES = ['Milky Way', 'Andromeda', 'Triangulum', 'Sombrero', 'Whirlpool', 'Pinwheel'];

export class Universe {
  constructor(seed = 'Genesis-1337') {
    this.seed = String(seed);
    this.activeIndex = 0;
    this.group = new THREE.Group();   // intergalactic view
    this.pickTargets = [];            // { object, galaxyIndex }
    this.cache = new Map();           // galaxy index -> Galaxy

    // Galaxy 0 uses the universe seed itself, so worlds from older saves are unchanged
    const rng = new SeededRNG(`${this.seed}#universe`);
    this.defs = [];
    for (let i = 0; i < GALAXY_COUNT; i++) {
      const angle = (i / GALAXY_COUNT) * Math.PI * 2 + rng.range(-0.25, 0.25);
      const dist = i === 0 ? 0 : rng.range(330, 520);
      this.defs.push({
        index: i,
        name: GALAXY_NAMES[i],
        seed: i === 0 ? this.seed : `${this.seed}#galaxy${i}`,
        tint: i,
        position: new THREE.Vector3(Math.cos(angle) * dist, rng.range(-60, 60), Math.sin(angle) * dist),
        tilt: new THREE.Euler(rng.range(-0.9, 0.9), rng.range(0, Math.PI * 2), rng.range(-0.5, 0.5))
      });
    }
    this.buildProxies();
  }

  // Lazily builds and caches a real galaxy.
  getGalaxy(index) {
    if (index < 0 || index >= this.defs.length) throw new RangeError(`No galaxy ${index}`);
    let galaxy = this.cache.get(index);
    if (!galaxy) {
      const def = this.defs[index];
      galaxy = new Galaxy(def.seed, { index, name: def.name, tint: def.tint });
      this.cache.set(index, galaxy);
    }
    return galaxy;
  }

  // Finds the galaxy that owns a system or planet id (ids are prefixed per galaxy).
  galaxyIndexOfId(id) {
    const match = /^g(\d+)_/.exec(id);
    const index = match ? Number(match[1]) : 0;
    return index < this.defs.length ? index : 0;
  }

  buildProxies() {
    const TINT_COLORS = ['#fbbf24', '#93c5fd', '#f9a8d4', '#86efac', '#fdba74', '#c4b5fd'];
    for (const def of this.defs) {
      const proxy = new THREE.Group();
      proxy.position.copy(def.position);

      // A small spiral of points, tilted per galaxy
      const count = 700;
      const positions = new Float32Array(count * 3);
      const colors = new Float32Array(count * 3);
      const spin = new SeededRNG(`${def.seed}#proxy`);
      const tint = new THREE.Color(TINT_COLORS[def.tint % TINT_COLORS.length]);
      for (let i = 0; i < count; i++) {
        const r = Math.pow(spin.next(), 1.6) * 70 + 4;
        const a = ((i % 2) * Math.PI) + r * 0.05 + spin.range(-0.25, 0.25);
        positions[i * 3] = Math.cos(a) * r;
        positions[i * 3 + 1] = spin.range(-3, 3);
        positions[i * 3 + 2] = Math.sin(a) * r;
        const glow = 1 - Math.min(1, r / 80) * 0.5;
        colors[i * 3] = tint.r * glow;
        colors[i * 3 + 1] = tint.g * glow;
        colors[i * 3 + 2] = tint.b * glow;
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      const points = new THREE.Points(geometry, new THREE.PointsMaterial({
        size: 3, vertexColors: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false
      }));
      points.rotation.copy(def.tilt);
      proxy.add(points);

      const core = new THREE.Mesh(
        new THREE.SphereGeometry(5, 16, 16),
        new THREE.MeshBasicMaterial({ color: tint, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending })
      );
      proxy.add(core);

      const label = makeLabelSprite(def.name + (def.index === 0 ? '  (home)' : ''), { color: '#fde68a', width: 150 });
      if (label) {
        label.position.set(0, 62, 0);
        proxy.add(label);
      }

      const pick = makePickSphere(75);
      proxy.add(pick);
      this.pickTargets.push({ object: pick, galaxyIndex: def.index });
      this.group.add(proxy);
    }
  }
}
