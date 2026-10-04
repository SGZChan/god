import { edit } from './_ed.mjs';
edit('src/life/entity.js', [
[`  requestPath(targetX, targetY, pathfinder) {
    if (!pathfinder) return;
    this.path = pathfinder.findPath(this.x, this.y, targetX, targetY);`, `  requestPath(targetX, targetY, pathfinder, maxIterations = 300) {
    if (!pathfinder) return;
    this.path = pathfinder.findPath(this.x, this.y, targetX, targetY, maxIterations);`],
]);
edit('src/civilization/jobs.js', [
[`    ent.requestPath(x + 0.5, y + 0.5, c.world.pathfinder);
  }
  if ((t.stuck || 0) >= 5) {`, `    // a goal behind an obstacle needs a wider search than the usual 300 nodes
    ent.requestPath(x + 0.5, y + 0.5, c.world.pathfinder, 300 + (t.stuck || 0) * 500);
  }
  if ((t.stuck || 0) >= 5) {`],
[`  for (const site of sites) {
    const fraction = deliveredFraction(site);`, `  const clock = c.civ.clock || 0;
  for (const site of sites) {
    if (site.blockedUntil > clock) continue; // unreachable for now
    const fraction = deliveredFraction(site);`],
[`      if (!walkTo(ent, c, spot.x, spot.y, 1.9)) return true;
      const def = BUILDING_TYPES[site.type];`, `      if (!walkTo(ent, c, spot.x, spot.y, 1.9)) {
        if (t.failed) abandonSite(c, ent, site);
        return true;
      }
      const def = BUILDING_TYPES[site.type];`],
[`    if (!walkTo(ent, c, spot.x, spot.y, 1.8)) {
      if (t.failed) { t.failed = false; if (returnLoad(ent, c)) t.siteId = undefined; }
      return true;
    }`, `    if (!walkTo(ent, c, spot.x, spot.y, 1.8)) {
      if (t.failed) { abandonSite(c, ent, site); if (returnLoad(ent, c)) t.siteId = undefined; }
      return true;
    }`],
[`function siteSpot(site) {`, `// A site nobody can walk to: skipped for a while; after three failures the plot is given up so the planner picks a better one.
function abandonSite(c, ent, site) {
  const t = ent.task;
  if (t) { t.failed = false; t.stuck = 0; }
  site.fails = (site.fails || 0) + 1;
  site.blockedUntil = (c.civ.clock || 0) + 40;
  if (site.fails >= 3 && site.progress < 0.5) {
    c.terrain.removeBuilding(site.id, { ruins: false });
    c.ecosystem.notifications.unshift({ text: \`\${c.st.name} abandoned an unreachable building plot.\`, minor: true, time: Date.now() });
  }
}

function siteSpot(site) {`],
[`      for (const [res, n] of Object.entries(fetch)) {
        const took = eco.take(st.stock, res, Math.min(n, room));
        eco.add(inv, res, took);
        room -= took;
        if (room <= 0) break;
      }`, `      const planned = (st._inbound && (st._inbound.get(site.id) || st._inbound.set(site.id, {}).get(site.id))) || null;
      for (const [res, n] of Object.entries(fetch)) {
        const took = eco.take(st.stock, res, Math.min(n, room));
        eco.add(inv, res, took);
        if (planned) planned[res] = (planned[res] || 0) + took; // others see it is already on its way
        room -= took;
        if (room <= 0) break;
      }`],
]);
