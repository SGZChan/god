import * as THREE from 'three';

export class CelestialBody {
  constructor(config) {
    this.id = config.id || 'planet_' + Math.random().toString(36).substring(2, 9);
    this.name = config.name || 'Unnamed World';
    this.type = config.type || 'terrestrial'; // 'terrestrial', 'oceanic', 'desert', 'ice', 'volcanic', 'alien'
    this.radius = config.radius || 4;
    this.distance = config.distance || 40;
    this.orbitSpeed = config.orbitSpeed || 0.005;
    this.rotationSpeed = config.rotationSpeed || 0.01;
    this.angle = config.angle || Math.random() * Math.PI * 2;
    this.color = config.color || 0x2288ff;
    this.atmosphereColor = config.atmosphereColor || 0x88ccff;
    this.hasAtmosphere = config.hasAtmosphere !== undefined ? config.hasAtmosphere : true;
    this.hasRings = config.hasRings || false;
    this.ringColor = config.ringColor || 0xd2b48c;
    this.axialTilt = config.axialTilt || 0.4;
    this.isPopulated = config.isPopulated || false;

    // Physics Engine Properties
    this.physicsEnabled = true;
    this.mass = Math.pow(this.radius, 3) * 0.5;
    const startX = Math.cos(this.angle) * this.distance;
    const startZ = Math.sin(this.angle) * this.distance;
    this.physicsPos = new THREE.Vector3(startX, 0, startZ);

    // Initial tangential velocity for circular orbit: v = sqrt(G * M / r)
    const orbitalSpeed = Math.max(0.2, this.distance > 0 ? (65 / Math.sqrt(this.distance)) : 1.0);
    this.physicsVel = new THREE.Vector3(-Math.sin(this.angle) * orbitalSpeed, 0, Math.cos(this.angle) * orbitalSpeed);

    this.isRoguePlanet = false;
    this.isConsumed = false;
    this.consumedBy = null;

    // Simulation tracking for unloaded catch-up calculations
    this.lastObservedCosmicAge = 0;

    // Three.js groups
    this.pivot = new THREE.Group();
    this.meshGroup = new THREE.Group();
    this.mesh = null;
    this.cloudMesh = null;
    this.orbitLine = null;

    this.initMeshes();
  }

  initMeshes() {
    // Orbital path ring
    const orbitGeom = new THREE.BufferGeometry();
    const points = [];
    const segments = 128;
    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      points.push(new THREE.Vector3(Math.cos(theta) * this.distance, 0, Math.sin(theta) * this.distance));
    }
    orbitGeom.setFromPoints(points);
    this.orbitMat = new THREE.LineBasicMaterial({
      color: 0x446699,
      transparent: true,
      opacity: 0.25,
      blending: THREE.AdditiveBlending
    });
    this.orbitLine = new THREE.Line(orbitGeom, this.orbitMat);

    // Planet core mesh
    const geom = new THREE.SphereGeometry(this.radius, 48, 48);
    const mat = this.createPlanetMaterial();
    this.mesh = new THREE.Mesh(geom, mat);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.rotation.z = this.axialTilt;
    this.meshGroup.add(this.mesh);

    // Cloud layer
    if (this.hasAtmosphere && (this.type === 'terrestrial' || this.type === 'alien' || this.type === 'oceanic')) {
      const cloudGeom = new THREE.SphereGeometry(this.radius * 1.025, 36, 36);
      const cloudMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.38,
        blending: THREE.NormalBlending,
        roughness: 0.9
      });
      this.cloudMesh = new THREE.Mesh(cloudGeom, cloudMat);
      this.meshGroup.add(this.cloudMesh);
    }

    // Rings if applicable
    if (this.hasRings) {
      const ringGeom = new THREE.RingGeometry(this.radius * 1.4, this.radius * 2.3, 64);
      const ringMat = new THREE.MeshBasicMaterial({
        color: this.ringColor,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.7
      });
      const ringMesh = new THREE.Mesh(ringGeom, ringMat);
      ringMesh.rotation.x = Math.PI / 2 + this.axialTilt;
      this.meshGroup.add(ringMesh);
    }

    this.meshGroup.position.copy(this.physicsPos);
    this.pivot.add(this.meshGroup);
  }

  createPlanetMaterial() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    if (this.type === 'terrestrial') {
      ctx.fillStyle = '#0a2e5c';
      ctx.fillRect(0, 0, 512, 256);
      ctx.fillStyle = '#2d7f36';
      for (let i = 0; i < 30; i++) {
        const x = Math.random() * 512;
        const y = 30 + Math.random() * 196;
        const r = 20 + Math.random() * 45;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#e5deb0';
      ctx.fillRect(0, 0, 512, 24);
      ctx.fillRect(0, 232, 512, 24);
    } else if (this.type === 'desert') {
      ctx.fillStyle = '#b35422';
      ctx.fillRect(0, 0, 512, 256);
      ctx.fillStyle = '#d97d3a';
      for (let i = 0; i < 40; i++) {
        ctx.fillRect(Math.random() * 512, Math.random() * 256, Math.random() * 80, Math.random() * 20);
      }
    } else if (this.type === 'ice') {
      ctx.fillStyle = '#c5e8f7';
      ctx.fillRect(0, 0, 512, 256);
      ctx.fillStyle = '#7dbfe0';
      for (let i = 0; i < 35; i++) {
        ctx.beginPath();
        ctx.arc(Math.random() * 512, Math.random() * 256, Math.random() * 30 + 10, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (this.type === 'volcanic') {
      ctx.fillStyle = '#1c1514';
      ctx.fillRect(0, 0, 512, 256);
      ctx.fillStyle = '#ff4400';
      for (let i = 0; i < 50; i++) {
        ctx.fillRect(Math.random() * 512, Math.random() * 256, Math.random() * 60, Math.random() * 6);
      }
    } else if (this.type === 'alien') {
      ctx.fillStyle = '#22083a';
      ctx.fillRect(0, 0, 512, 256);
      ctx.fillStyle = '#00ffaa';
      for (let i = 0; i < 40; i++) {
        ctx.beginPath();
        ctx.arc(Math.random() * 512, Math.random() * 256, Math.random() * 35, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.fillStyle = typeof this.color === 'number' ? '#' + (this.color.toString(16).padStart(6, '0')) : this.color;
      ctx.fillRect(0, 0, 512, 256);
    }

    const texture = new THREE.CanvasTexture(canvas);
    return new THREE.MeshStandardMaterial({
      map: texture,
      emissiveMap: texture,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.32,
      roughness: 0.7,
      metalness: 0.1
    });
  }

  // Paints the globe with a canvas (the planet's real surface, see cosmos/surfaceMap.js)
  setSurfaceMap(canvas) {
    if (!this.mesh) return;
    const mat = this.mesh.material;
    if (mat.map) mat.map.dispose();
    mat.map = new THREE.CanvasTexture(canvas);
    mat.map.colorSpace = THREE.SRGBColorSpace;
    // the night side keeps a faint glow of the land (so no planet is ever a black disc)
    mat.emissiveMap = mat.map;
    mat.emissive = new THREE.Color(0xffffff);
    mat.emissiveIntensity = 0.32;
    mat.needsUpdate = true;
  }

  update(timeDelta, timeSpeedMultiplier = 1) {
    if (this.isConsumed) {
      if (this.meshGroup.parent) {
        this.meshGroup.parent.remove(this.meshGroup);
      }
      if (this.orbitLine && this.orbitLine.parent) {
        this.orbitLine.parent.remove(this.orbitLine);
      }
      return;
    }

    // Visual axial spin
    if (this.mesh) {
      this.mesh.rotation.y += this.rotationSpeed * timeDelta * (timeSpeedMultiplier > 100 ? 5 : timeSpeedMultiplier);
    }
    if (this.cloudMesh) {
      this.cloudMesh.rotation.y += this.rotationSpeed * 1.25 * timeDelta * (timeSpeedMultiplier > 100 ? 5 : timeSpeedMultiplier);
    }

    // Rogue planet visual warning: Orbit line turns red/fades
    if (this.isRoguePlanet && this.orbitMat) {
      this.orbitMat.color.setHex(0xff3333);
      this.orbitMat.opacity = 0.5;
    }
  }

  getWorldPosition(targetVec) {
    this.meshGroup.getWorldPosition(targetVec);
    return targetVec;
  }
}
