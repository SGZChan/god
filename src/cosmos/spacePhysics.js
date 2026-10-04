import * as THREE from 'three';

export class SpacePhysicsEngine {
  constructor(starMass = 12000, G = 0.85, starRadius = 14, starName = 'the Sun') {
    this.starMass = starMass;
    this.G = G;
    this.starRadius = starRadius;
    this.starName = starName;
    this.rocheLimit = this.starRadius * 2.2;
    this.starPos = new THREE.Vector3(0, 0, 0);

    this.bodies = []; // Active planets
    this.asteroids = []; // Active asteroids
    this.blackHoles = []; // Active black holes
    this.collisionEvents = []; // One-time impact events
  }

  updateStarProperties(mass, radius, name) {
    this.starMass = mass;
    this.starRadius = radius;
    this.starName = name || 'the Sun';
    this.rocheLimit = this.starRadius * 2.2;
  }

  registerBody(body) {
    if (!this.bodies.includes(body)) {
      this.bodies.push(body);
    }
  }

  unregisterBody(body) {
    const idx = this.bodies.indexOf(body);
    if (idx !== -1) this.bodies.splice(idx, 1);
  }

  spawnBlackHole(position, mass = 45000, radius = 9) {
    const bh = {
      id: 'bh_' + Math.random().toString(36).substring(2, 9),
      position: position.clone(),
      mass,
      radius,
      eventHorizon: radius * 1.6,
      mesh: null
    };
    this.blackHoles.push(bh);
    return bh;
  }

  removeBlackHole(bh) {
    const idx = this.blackHoles.indexOf(bh);
    if (idx !== -1) {
      if (bh.mesh && bh.mesh.parent) {
        bh.mesh.parent.remove(bh.mesh);
      }
      this.blackHoles.splice(idx, 1);
    }
  }

  spawnAsteroid(startPos, targetBody = null, speed = 22) {
    const pos = startPos ? startPos.clone() : new THREE.Vector3(
      (Math.random() - 0.5) * 350,
      (Math.random() - 0.5) * 20,
      (Math.random() - 0.5) * 350
    );

    let velocity = new THREE.Vector3();
    if (targetBody && targetBody.meshGroup) {
      const targetPos = new THREE.Vector3();
      targetBody.getWorldPosition(targetPos);
      velocity = targetPos.clone().sub(pos).normalize().multiplyScalar(speed);
    } else {
      velocity = new THREE.Vector3(
        (Math.random() - 0.5) * speed,
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * speed
      );
    }

    const asteroid = {
      id: 'ast_' + Math.random().toString(36).substring(2, 9),
      position: pos,
      velocity: velocity,
      radius: 2.2 + Math.random() * 1.8,
      mesh: null,
      isDead: false,
      targetBody: targetBody
    };

    this.asteroids.push(asteroid);
    return asteroid;
  }

  step(dt, timeSpeedMultiplier) {
    const effSpeed = Math.min(timeSpeedMultiplier, 50);
    const effDt = Math.min(dt * effSpeed, 0.08);
    if (effDt <= 0) return;

    // 1. Update Planets (Stable Keplerian dynamics + Black Hole gravitational pull)
    for (let i = this.bodies.length - 1; i >= 0; i--) {
      const body = this.bodies[i];
      if (body.isConsumed) continue;

      // If rogue, drift away linearly
      if (body.isRoguePlanet) {
        body.physicsPos.add(body.physicsVel.clone().multiplyScalar(effDt));
        body.meshGroup.position.copy(body.physicsPos);
        continue;
      }

      // Check distance from star for rogue escape
      if (body.distance > 420) {
        body.isRoguePlanet = true;
        // Tangential velocity carries it away
        const tangent = new THREE.Vector3(-Math.sin(body.angle), 0, Math.cos(body.angle)).multiplyScalar(12);
        body.physicsVel = tangent;
        continue;
      }

      // --- ACCURATE SOLAR TIDAL CAPTURE & GRAVITATIONAL SPIRAL ---
      const solarCaptureRadius = this.rocheLimit || (this.starRadius * 2.2);
      const solarImpactRadius = this.starRadius + (body.radius ? body.radius * 0.7 : 2.5);

      if (body.distance <= solarImpactRadius) {
        // PLUNGE INTO THE SUN: Direct solar consumption & vaporization
        body.isConsumed = true;
        body.consumedBy = `${this.starName || 'the Sun'} (Solar Incineration)`;
        this.collisionEvents.push({
          type: 'STAR_CONSUMED',
          body: body,
          starName: this.starName,
          position: body.physicsPos.clone()
        });
        this.unregisterBody(body);
        continue;
      } else if (body.distance < solarCaptureRadius) {
        // Inside Roche limit: coronal plasma drag and tidal gravity decay the orbit rapidly
        const proximity = 1 - (body.distance - solarImpactRadius) / (solarCaptureRadius - solarImpactRadius);
        const tidalDrag = (10.0 + Math.pow(proximity, 2) * 40.0) * effDt;
        body.distance = Math.max(solarImpactRadius, body.distance - tidalDrag);

        // Visual warning: Orbit turns fiery red from extreme solar proximity
        if (body.orbitMat) {
          body.orbitMat.color.setHex(0xff3300);
          body.orbitMat.opacity = 0.85;
        }
      }

      // Stable Keplerian orbital motion: omega = sqrt(G * M / r^3)
      const omega = Math.sqrt((this.G * this.starMass) / Math.pow(Math.max(solarImpactRadius, body.distance), 3));
      body.angle += omega * effDt * 0.85;

      const x = Math.cos(body.angle) * body.distance;
      const z = Math.sin(body.angle) * body.distance;
      body.physicsPos.set(x, 0, z);

      // Check Black Hole Gravitational Pull
      for (const bh of this.blackHoles) {
        const distToBh = body.physicsPos.distanceTo(bh.position);
        if (distToBh < bh.eventHorizon) {
          // Devoured ONCE and removed!
          body.isConsumed = true;
          body.consumedBy = 'Black Hole Singularity';
          this.collisionEvents.push({
            type: 'BLACK_HOLE_CONSUMED',
            body: body,
            blackHole: bh
          });
          this.unregisterBody(body);
          break;
        } else if (distToBh < 80) {
          // Warp orbit towards black hole
          const pull = bh.position.clone().sub(body.physicsPos).normalize().multiplyScalar((bh.mass / (distToBh * distToBh)) * effDt * 0.05);
          body.physicsPos.add(pull);
          body.distance = body.physicsPos.length();
        }
      }

      if (!body.isConsumed) {
        body.meshGroup.position.copy(body.physicsPos);
      }
    }

    // 2. Update Asteroids
    for (let i = this.asteroids.length - 1; i >= 0; i--) {
      const ast = this.asteroids[i];
      if (ast.isDead) {
        this.asteroids.splice(i, 1);
        continue;
      }

      // Move along velocity vector
      ast.position.add(ast.velocity.clone().multiplyScalar(effDt));
      if (ast.mesh) {
        ast.mesh.position.copy(ast.position);
      }

      // Check collision against all active planets
      for (const body of this.bodies) {
        if (body.isConsumed || !body.meshGroup) continue;

        const bPos = new THREE.Vector3();
        body.getWorldPosition(bPos);
        const dist = ast.position.distanceTo(bPos);

        if (dist < (body.radius + ast.radius + 1.0)) {
          // DIRECT IMPACT! Triggered EXACTLY ONCE
          ast.isDead = true;
          if (ast.mesh && ast.mesh.parent) {
            ast.mesh.parent.remove(ast.mesh);
          }

          this.collisionEvents.push({
            type: 'ASTEROID_IMPACT',
            planet: body,
            impactPos: ast.position.clone(),
            severity: ast.radius > 2.8 ? 'MASS_EXTINCTION' : 'MAJOR_CRATER'
          });
          break;
        }
      }

      // Boundary check to remove stray asteroids cleanly
      if (ast.position.length() > 650 || ast.position.distanceTo(this.starPos) < 14) {
        ast.isDead = true;
        if (ast.mesh && ast.mesh.parent) {
          ast.mesh.parent.remove(ast.mesh);
        }
        this.asteroids.splice(i, 1);
      }
    }
  }
}
