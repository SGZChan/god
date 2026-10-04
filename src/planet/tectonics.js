import { random } from '../simulation/random.js';
// Tectonic plate simulation engine with continental drift
export class TectonicPlate {
  constructor(id, x, y, isContinental, width, height) {
    this.id = id;
    this.cx = x;
    this.cy = y;
    this.isContinental = isContinental;
    // Velocity vector for continental drift
    const speed = 0.05 + random() * 0.15;
    const angle = random() * Math.PI * 2;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.rotSpeed = (random() - 0.5) * 0.02;
    this.elevationBase = isContinental ? 0.65 : 0.22;
    this.density = isContinental ? 2.7 : 3.0; // oceanic crust is denser
    this.age = 0;
  }

  drift(dt, speedMultiplier, width, height) {
    const effSpeed = Math.min(speedMultiplier, 5000);
    this.cx = (this.cx + this.vx * dt * effSpeed + width) % width;
    this.cy = (this.cy + this.vy * dt * effSpeed + height) % height;
    this.age += dt * effSpeed;

    // Slight directional wobble over millions of years
    if (random() < 0.01) {
      this.vx += (random() - 0.5) * 0.05;
      this.vy += (random() - 0.5) * 0.05;
      const mag = Math.hypot(this.vx, this.vy);
      if (mag > 0.3) {
        this.vx = (this.vx / mag) * 0.3;
        this.vy = (this.vy / mag) * 0.3;
      }
    }
  }
}

export class TectonicsEngine {
  constructor(width, height, numPlates = 10) {
    this.width = width;
    this.height = height;
    this.plates = [];
    this.initPlates(numPlates);
  }

  initPlates(numPlates) {
    this.plates = [];
    for (let i = 0; i < numPlates; i++) {
      // 55% continental, 45% oceanic
      const isContinental = random() < 0.55;
      const x = random() * this.width;
      const y = random() * this.height;
      this.plates.push(new TectonicPlate(i, x, y, isContinental, this.width, this.height));
    }
  }

  update(dt, speedMultiplier) {
    for (const plate of this.plates) {
      plate.drift(dt, speedMultiplier, this.width, this.height);
    }
  }

  // Calculate plate influence and boundary stress for any point (x, y)
  getPlateAt(x, y) {
    let minDist1 = Infinity;
    let minDist2 = Infinity;
    let closestPlate = this.plates[0];
    let secondPlate = this.plates[0];

    for (const plate of this.plates) {
      // Toroidal distance wrapping
      const dx = Math.abs(x - plate.cx);
      const dy = Math.abs(y - plate.cy);
      const wrapDx = Math.min(dx, this.width - dx);
      const wrapDy = Math.min(dy, this.height - dy);
      const dist = Math.hypot(wrapDx, wrapDy);

      if (dist < minDist1) {
        minDist2 = minDist1;
        secondPlate = closestPlate;
        minDist1 = dist;
        closestPlate = plate;
      } else if (dist < minDist2) {
        minDist2 = dist;
        secondPlate = plate;
      }
    }

    // Boundary stress: how close to the collision/rift boundary between two plates
    const boundaryProximity = Math.max(0, 1 - (minDist2 - minDist1) / 8);

    // Compute relative velocity between plates for convergence / divergence
    let collisionStress = 0;
    if (closestPlate !== secondPlate) {
      const relVx = closestPlate.vx - secondPlate.vx;
      const relVy = closestPlate.vy - secondPlate.vy;
      const isConverging = (relVx * (closestPlate.cx - secondPlate.cx) + relVy * (closestPlate.cy - secondPlate.cy)) < 0;

      if (isConverging) {
        // Plates colliding -> mountain or subduction ridge
        collisionStress = boundaryProximity * 0.45;
      } else {
        // Plates separating -> rift valley / ocean trough
        collisionStress = -boundaryProximity * 0.35;
      }
    }

    return {
      plate: closestPlate,
      neighborPlate: secondPlate,
      dist: minDist1,
      boundaryStress: collisionStress
    };
  }
}
