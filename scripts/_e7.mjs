import { edit } from './_ed.mjs';
edit('src/civilization/townPlanner.js', [
// helper
[`// ---------- placement ----------
`, `// ---------- placement ----------

// Can the settlement's people walk (on land) from the centre to tile (x, y)? Rivers and lakes cut plots off.
function reachable(terrain, st, x, y) {
  const pf = terrain.ecosystem && terrain.ecosystem.pathfinder;
  if (!pf) return true;
  if (Math.hypot(st.x - x, st.y - y) < 2) return true;
  const path = pf.findPath(st.x, st.y, x + 0.5, y + 0.5, 1400, true);
  if (!path.length) return false;
  const last = path[path.length - 1];
  return Math.hypot(last.x - (x + 0.5), last.y - (y + 0.5)) < 1.6;
}

// The best-scoring candidate (lowest score) that people can actually reach.
function bestReachable(terrain, st, cands, goalOf) {
  cands.sort((a, b) => a.score - b.score);
  for (let i = 0; i < Math.min(cands.length, 4); i++) {
    const g = goalOf(cands[i]);
    if (reachable(terrain, st, g.x, g.y)) return cands[i];
  }
  return null;
}
`],
// streetPlot
[`  let best = null;
  let bestScore = Infinity;
  for (let attempt = 0; attempt < 70; attempt++) {
    const row = rows[Math.floor(random() * rows.length)];`, `  const cands = [];
  for (let attempt = 0; attempt < 70; attempt++) {
    const row = rows[Math.floor(random() * rows.length)];`],
[`    const score = Math.hypot(x + def.w / 2 - town.cx, y + def.h - town.y0) + random() * 4;
    if (score < bestScore) { bestScore = score; best = { x, y, row }; }
  }
  if (!best) return null;
  const b = placeAt(terrain, civ, st, type, best.x, best.y, instant);`, `    const score = Math.hypot(x + def.w / 2 - town.cx, y + def.h - town.y0) + random() * 4;
    cands.push({ x, y, row, score });
  }
  const best = bestReachable(terrain, st, cands, c => ({ x: c.x + (def.door ? def.door.x : 0), y: c.row }));
  if (!best) return null;
  const b = placeAt(terrain, civ, st, type, best.x, best.y, instant);`],
// edgePlot
[`  const wantFertile = type === 'farm' || type === 'pen';
  let best = null;
  let bestScore = Infinity;
  for (let attempt = 0; attempt < 60; attempt++) {
    const side`, `  const wantFertile = type === 'farm' || type === 'pen';
  const cands = [];
  for (let attempt = 0; attempt < 60; attempt++) {
    const side`],
[`    const score = Math.hypot(x + def.w / 2 - town.cx, y + def.h / 2 - town.y0) + random() * 5;
    if (score < bestScore) { bestScore = score; best = { x, y }; }
  }
  return best ? placeAt(terrain, civ, st, type, best.x, best.y, instant) : null;
}`, `    const score = Math.hypot(x + def.w / 2 - town.cx, y + def.h / 2 - town.y0) + random() * 5;
    cands.push({ x, y, score });
  }
  const best = bestReachable(terrain, st, cands, c => ({ x: c.x + (def.door ? def.door.x : def.w >> 1), y: c.y + def.h }));
  return best ? placeAt(terrain, civ, st, type, best.x, best.y, instant) : null;
}`],
// depotPlot
[`  let best = null;
  let bestScore = Infinity;
  for (let attempt = 0; attempt < 60; attempt++) {
    const x = target.x + Math.round((random() * 2 - 1) * 7) - 1;`, `  const cands = [];
  for (let attempt = 0; attempt < 60; attempt++) {
    const x = target.x + Math.round((random() * 2 - 1) * 7) - 1;`],
[`    const score = Math.hypot(x + def.w / 2 - target.x, y + def.h / 2 - target.y) + random();
    if (score < bestScore) { bestScore = score; best = { x, y }; }
  }
  return best ? placeAt(terrain, civ, st, type, best.x, best.y, instant) : null;`, `    const score = Math.hypot(x + def.w / 2 - target.x, y + def.h / 2 - target.y) + random();
    cands.push({ x, y, score });
  }
  const best = bestReachable(terrain, st, cands, c => ({ x: c.x + (def.door ? def.door.x : def.w >> 1), y: c.y + def.h }));
  return best ? placeAt(terrain, civ, st, type, best.x, best.y, instant) : null;`],
]);
edit('src/civilization/settlements.js', [
[`    if (score > bestScore) { bestScore = score; best = { x: land.x, y: land.y }; }
  }
  return best;`, `    cands.push({ x: land.x, y: land.y, score });
  }
  // the best few must be reachable on foot from the parent (no rivers or seas in between)
  cands.sort((a, b) => b.score - a.score);
  const pf = terrain.ecosystem && terrain.ecosystem.pathfinder;
  for (let i = 0; i < Math.min(3, cands.length); i++) {
    const c = cands[i];
    if (!pf) return { x: c.x, y: c.y };
    const path = pf.findPath(from.x, from.y, c.x + 0.5, c.y + 0.5, 4000, true);
    const last = path[path.length - 1];
    if (last && Math.hypot(last.x - c.x - 0.5, last.y - c.y - 0.5) < 2) return { x: c.x, y: c.y };
  }
  return best;`],
[`  let best = null;
  let bestScore = -Infinity;
  for (let attempt = 0; attempt < 24; attempt++) {`, `  const best = null;
  const cands = [];
  for (let attempt = 0; attempt < 24; attempt++) {`],
]);
