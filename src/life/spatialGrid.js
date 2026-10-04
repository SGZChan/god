// A uniform grid over the (infinite) map for fast "who is near here?" questions about creatures.
// Rebuilt every simulation step; with a few hundred creatures that is far cheaper than scanning
// everyone for every question.
export class SpatialGrid {
  constructor(cellSize = 8) {
    this.cellSize = cellSize;
    this.cells = new Map();
  }

  key(cx, cy) {
    return (cx + 32768) * 65536 + (cy + 32768); // exact for coordinates within about 260,000 tiles
  }

  rebuild(entities) {
    this.cells.clear();
    for (const entity of entities) {
      const key = this.key(Math.floor(entity.x / this.cellSize), Math.floor(entity.y / this.cellSize));
      const cell = this.cells.get(key);
      if (cell) cell.push(entity);
      else this.cells.set(key, [entity]);
    }
  }

  // Every creature within `radius` tiles of (x, y), alive or dead.
  within(x, y, radius) {
    const result = [];
    const r2 = radius * radius;
    const size = this.cellSize;
    const minX = Math.floor((x - radius) / size);
    const maxX = Math.floor((x + radius) / size);
    const minY = Math.floor((y - radius) / size);
    const maxY = Math.floor((y + radius) / size);
    for (let cy = minY; cy <= maxY; cy++) {
      for (let cx = minX; cx <= maxX; cx++) {
        const cell = this.cells.get(this.key(cx, cy));
        if (!cell) continue;
        for (const entity of cell) {
          const dx = entity.x - x;
          const dy = entity.y - y;
          if (dx * dx + dy * dy <= r2) result.push(entity);
        }
      }
    }
    return result;
  }
}
