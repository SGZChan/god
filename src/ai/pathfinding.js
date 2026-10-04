// Grid A* pathfinding over the infinite map (4-way movement, terrain costs, hazard avoidance).
// Uses a binary heap and numeric node keys: with hundreds of creatures choosing paths every second,
// the old list scan was the biggest cost in the simulation.

const key = (x, y) => (x + 32768) * 65536 + (y + 32768);

class MinHeap {
  constructor() {
    this.items = [];
  }

  get size() {
    return this.items.length;
  }

  push(node) {
    const items = this.items;
    items.push(node);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (items[parent].f <= node.f) break;
      items[i] = items[parent];
      i = parent;
    }
    items[i] = node;
  }

  pop() {
    const items = this.items;
    const top = items[0];
    const last = items.pop();
    if (items.length > 0) {
      let i = 0;
      const half = items.length >> 1;
      while (i < half) {
        let child = 2 * i + 1;
        if (child + 1 < items.length && items[child + 1].f < items[child].f) child++;
        if (items[child].f >= last.f) break;
        items[i] = items[child];
        i = child;
      }
      items[i] = last;
    }
    return top;
  }
}

export class Node {
  constructor(x, y, cost = 1.0) {
    this.x = x;
    this.y = y;
    this.cost = cost;
    this.g = 0;
    this.h = 0;
    this.f = 0;
    this.parent = null;
  }
}

// Slightly favouring nodes close to the goal makes the search head straight for it on open ground
// (far fewer nodes expanded) while paths stay as short as the terrain allows.
const H_WEIGHT = 1.08;
// Walking speed multiplier on roads (cost is its inverse); see world/buildings.js ROAD_SPEED
const ROAD_COST = { dirt: 0.82, gravel: 0.74, cobble: 0.67 };

const NEIGHBORS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export class AStarPathfinder {
  constructor(terrain) {
    this.terrain = terrain;
  }

  // landOnly: never step onto water (people do not swim); the start tile is exempt so a creature in the water can get out
  findPath(startX, startY, goalX, goalY, maxIterations = 300, landOnly = false) {
    const sx = Math.floor(startX);
    const sy = Math.floor(startY);
    const gx = Math.floor(goalX);
    const gy = Math.floor(goalY);

    if (sx === gx && sy === gy) return [];

    const open = new MinHeap();
    const nodes = new Map();   // every node generated so far
    const closed = new Set();

    // A creature standing inside a building (spawned or caught by construction) may walk out through its walls
    const startStruct = this.terrain.inBounds(sx, sy) ? this.terrain.getTile(sx, sy).structure : null;
    const startBuilding = startStruct && startStruct.solid ? startStruct.buildingId : undefined;

    const startNode = new Node(sx, sy, 0);
    startNode.h = this.heuristic(sx, sy, gx, gy);
    startNode.f = startNode.h * H_WEIGHT;
    nodes.set(key(sx, sy), startNode);
    open.push(startNode);
    let closest = startNode; // the node nearest the goal, used when the search runs out of iterations

    let iterations = 0;
    while (open.size > 0 && iterations < maxIterations) {
      const current = open.pop();
      const currentKey = key(current.x, current.y);
      if (closed.has(currentKey)) continue; // a stale heap entry
      closed.add(currentKey);
      iterations++;

      // Reached goal
      if (current.x === gx && current.y === gy) return this.reconstructPath(current);
      if (current.h < closest.h) closest = current;

      for (const [dx, dy] of NEIGHBORS) {
        const nx = current.x + dx;
        const ny = current.y + dy;
        if (!this.terrain.inBounds(nx, ny)) continue; // the map has edges: never path off the planet
        const nKey = key(nx, ny);
        if (closed.has(nKey)) continue;

        const tile = this.terrain.getTile(nx, ny);

        if (landOnly && tile.biome.isWater && !(nx === gx && ny === gy)) continue;

        // Lava / extreme hazard avoidance
        if (tile.biome.id === 'VOLCANIC' && tile.elevation > 0.8) continue;

        // Completed buildings block the way except through their door (and the goal tile itself)
        const st = tile.structure;
        if (st && st.solid && !(nx === gx && ny === gy) && st.buildingId !== startBuilding) continue;

        // Terrain cost (water slow down, mountains higher cost); roads are quick
        let moveCost = tile.biome.movementCost || 1.0;
        if (tile.road) moveCost *= ROAD_COST[tile.road] || 1;
        const tentativeG = current.g + moveCost;

        let node = nodes.get(nKey);
        if (!node) {
          node = new Node(nx, ny, moveCost);
          node.h = this.heuristic(nx, ny, gx, gy);
          nodes.set(nKey, node);
        } else if (tentativeG >= node.g) {
          continue;
        }
        node.g = tentativeG;
        node.f = node.g + node.h * H_WEIGHT;
        node.parent = current;
        open.push(node);
      }
    }

    // Return a partial path towards the goal if the iteration limit was reached
    if (closest !== startNode) return this.reconstructPath(closest);
    return [];
  }

  heuristic(x1, y1, x2, y2) {
    // Manhattan distance
    return Math.abs(x1 - x2) + Math.abs(y1 - y2);
  }

  reconstructPath(node) {
    const path = [];
    let curr = node;
    while (curr.parent) {
      path.push({ x: curr.x + 0.5, y: curr.y + 0.5 });
      curr = curr.parent;
    }
    return path.reverse();
  }
}
