import { edit } from './_ed.mjs';
edit('src/ai/pathfinding.js', [
[`  findPath(startX, startY, goalX, goalY, maxIterations = 300) {`, `  // landOnly: never step onto water (people do not swim); the start tile is exempt so a creature in the water can get out
  findPath(startX, startY, goalX, goalY, maxIterations = 300, landOnly = false) {`],
[`        // Lava / extreme hazard avoidance`, `        if (landOnly && tile.biome.isWater && !(nx === gx && ny === gy)) continue;

        // Lava / extreme hazard avoidance`],
]);
edit('src/life/entity.js', [
[`  requestPath(targetX, targetY, pathfinder, maxIterations = 300) {
    if (!pathfinder) return;
    this.path = pathfinder.findPath(this.x, this.y, targetX, targetY, maxIterations);`, `  // Sapients walk on land only (they do not swim across rivers); everyone else may wade.
  requestPath(targetX, targetY, pathfinder, maxIterations = 300, landOnly = this.isSapient) {
    if (!pathfinder) return;
    this.path = pathfinder.findPath(this.x, this.y, targetX, targetY, maxIterations, landOnly);`],
[`          this.requestPath(tile.x, tile.y, worldContext.pathfinder);
            return;`, `          this.requestPath(tile.x, tile.y, worldContext.pathfinder, 300, false);
            return;`],
]);
edit('src/civilization/society.js', [
[`    const path = this.ecosystem.pathfinder.findPath(a.x, a.y, b.x, b.y, 2500);`, `    const path = this.ecosystem.pathfinder.findPath(a.x, a.y, b.x, b.y, 3000, true);`],
]);
