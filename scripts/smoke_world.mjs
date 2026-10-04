// Headless check of the finite planet, resources, minimap and far-zoom view.
// Usage: node scripts/smoke_world.mjs <url> [screenshotDir]
import puppeteer from 'puppeteer-core';

const url = process.argv[2] || 'http://localhost:5173/';
const shots = process.argv[3];
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const wait = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (ok, label, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}: ${label} ${extra}`); };

const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
const errors = [];
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
const shot = async (name) => { if (shots) await page.screenshot({ path: `${shots}/${name}.png` }); };
const fps = (ms = 2500) => page.evaluate((span) => new Promise(res => {
  let n = 0;
  const t0 = performance.now();
  const f = () => { n++; performance.now() - t0 < span ? requestAnimationFrame(f) : res(n / (span / 1000)); };
  requestAnimationFrame(f);
}), ms);

await page.goto(url, { waitUntil: 'load' });
await page.evaluate(() => { window.game.autosaveEnabled = false; localStorage.clear(); });
await page.reload({ waitUntil: 'load' });
await wait(1200);

await page.evaluate(async () => {
  const g = window.game;
  for (const sys of g.galaxy.systems) {
    const planet = sys.planets.find(p => p.isPopulated);
    if (planet) { g.loadSystem(sys.id); g.setActivePlanet(planet.id); break; }
  }
  g.switchView('SURFACE');
  g.timeSpeed = 100;
  await new Promise(r => setTimeout(r, 8000));
  g.timeSpeed = 1;
});
await shot('world-home');

const start = await page.evaluate(() => {
  const g = window.game;
  const sim = g.activeSim;
  let structures = 0;
  sim.terrain.forEachLoadedTile(t => { if (t.structure) structures++; });
  return {
    home: sim.terrain.home, structures, chunks: sim.terrain.chunks.size,
    civs: sim.society.civilizations.filter(c => c.isAlive).length,
    w: sim.terrain.width, h: sim.terrain.height, radius: sim.planet.radius
  };
});
check(start.w === Math.round(1024 * start.radius) && start.h === Math.floor(start.w / 2), `planet is ${start.w}x${start.h} tiles for radius ${start.radius.toFixed(2)}`);
check(start.civs > 0 && start.structures > 5, 'civilizations built something at home', `(${start.structures} structures, ${start.chunks} chunks)`);

// Fly across the planet in big hops, the way the minimap would
const explored = await page.evaluate(async () => {
  const g = window.game;
  const r = g.activeSim.renderer;
  const t = g.activeSim.terrain;
  let maxChunks = 0;
  for (let i = 0; i < 30; i++) {
    r.jumpTo(((i * 977) % t.width), ((i * 619) % t.height));
    await new Promise(res => setTimeout(res, 200));
    maxChunks = Math.max(maxChunks, t.chunks.size);
  }
  return { maxChunks };
});
await wait(2500);
const afterExplore = await page.evaluate(() => window.game.activeSim.terrain.chunks.size);
check(explored.maxChunks < 600 && afterExplore < 400, 'far chunks are evicted', `(peak ${explored.maxChunks}, now ${afterExplore})`);

// The planet has edges: the camera cannot be dragged off the map
const edge = await page.evaluate(async () => {
  const r = window.game.activeSim.renderer;
  const t = window.game.activeSim.terrain;
  r.camera.zoom = 1;
  r.jumpTo(-5000, -5000);
  await new Promise(res => setTimeout(res, 300));
  const c = r.centerTile();
  r.jumpTo(t.width + 5000, 40);
  await new Promise(res => setTimeout(res, 300));
  const c2 = r.centerTile();
  return { c, c2, w: t.width };
});
check(edge.c.x >= 0 && edge.c.y >= 0 && edge.c2.x <= edge.w, 'the camera stays on the planet', `(${edge.c.x.toFixed(0)},${edge.c.y.toFixed(0)} / ${edge.c2.x.toFixed(0)})`);
await page.evaluate(() => { const r = window.game.activeSim.renderer; r.camera.zoom = 0.6; r.jumpTo(0, 600); });
await wait(1500);
await shot('world-west-edge');

// Come home: buildings must still be there
await page.evaluate(() => { const r = window.game.activeSim.renderer; r.camera.zoom = 0.85; r.centerCamera(); });
await wait(3000);
const back = await page.evaluate(() => {
  const sim = window.game.activeSim;
  let structures = 0;
  sim.terrain.forEachLoadedTile(t => { if (t.structure) structures++; });
  return { structures, civs: sim.society.civilizations.filter(c => c.isAlive).length };
});
check(back.structures >= start.structures * 0.8 && back.civs === start.civs, 'the home area is intact after the trip', `(${start.structures} -> ${back.structures})`);

// Minimap: visible, drawn, click moves the camera, lat/lon readout
await wait(1500);
const mini = await page.evaluate(() => {
  const el = document.getElementById('minimap-panel');
  const cv = document.getElementById('minimap-canvas');
  const data = cv.getContext('2d').getImageData(0, 0, 256, 128).data;
  let coloured = 0;
  for (let i = 0; i < data.length; i += 4) if (data[i] + data[i + 1] + data[i + 2] > 120) coloured++;
  const rect = cv.getBoundingClientRect();
  return { visible: !el.classList.contains('hidden'), coloured, rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height }, readout: document.getElementById('minimap-readout').textContent };
});
check(mini.visible && mini.coloured > 3000, 'the minimap shows the planet', `(${mini.coloured} bright pixels)`);
check(/\u00b0[NS] .*\u00b0[EW]/.test(mini.readout), `lat/lon readout: ${mini.readout}`);
const camBefore = await page.evaluate(() => window.game.activeSim.renderer.centerTile());
await page.mouse.click(mini.rect.x + mini.rect.w * 0.2, mini.rect.y + mini.rect.h * 0.4);
await wait(400);
const camAfter = await page.evaluate(() => window.game.activeSim.renderer.centerTile());
const tw = start.w;
check(Math.abs(camAfter.x - tw * 0.2) < tw * 0.03 && Math.abs(camAfter.x - camBefore.x) > 50, 'clicking the minimap jumps the camera', `(${camBefore.x.toFixed(0)} -> ${camAfter.x.toFixed(0)}, wanted ${(tw * 0.2).toFixed(0)})`);
await page.evaluate(() => { const r = window.game.activeSim.renderer; r.camera.zoom = 0.85; r.centerCamera(); });
await wait(800);
await shot('world-minimap');
// collapse and expand
await page.click('#minimap-toggle');
check(await page.evaluate(() => document.getElementById('minimap-body').classList.contains('hidden')), 'the minimap collapses');
await page.click('#minimap-toggle');

// Resources lens: key R toggles, markers are drawn, legend shows
await page.evaluate(() => { const r = window.game.activeSim.renderer; r.camera.zoom = 1.1; r.centerCamera(); });
await wait(800);
await page.keyboard.press('r');
await wait(1500);
const lens = await page.evaluate(() => ({
  on: window.game.activeSim.renderer.showResources,
  legend: !document.getElementById('lens-legend').classList.contains('hidden'),
  pressed: document.getElementById('lens-toggle').getAttribute('aria-pressed')
}));
check(lens.on && lens.legend && lens.pressed === 'true', 'key R turns the Resources lens on');
await shot('world-resources-lens');

// A deposit shown in the inspector
const inspect = await page.evaluate(() => {
  const g = window.game;
  const t = g.activeSim.terrain;
  const home = t.home;
  const spot = t.findNearestDeposit(home.x, home.y, 'stone', 300) || t.findNearestDeposit(home.x, home.y, 'wood', 300);
  g.inspector.inspect('tile', t.getTile(spot.x, spot.y));
  return { html: document.getElementById('inspector-drawer').innerHTML.includes('deposit-box'), type: spot.type };
});
check(inspect.html, `the tile inspector shows the ${inspect.type} deposit`);
await shot('world-inspector');
await page.evaluate(() => window.game.inspector.clear());
await page.keyboard.press('r');
check(await page.evaluate(() => !window.game.activeSim.renderer.showResources), 'key R turns the lens off again');

// A forest at close zoom: trees
const forest = await page.evaluate(async () => {
  const g = window.game;
  const t = g.activeSim.terrain;
  const home = t.home;
  let best = null;
  for (let r = 0; r < 600 && !best; r += 8) {
    for (let k = 0; k < 16; k++) {
      const x = Math.round(home.x + Math.cos(k) * r);
      const y = Math.round(home.y + Math.sin(k) * r);
      if (!t.inBounds(x, y)) continue;
      const biome = t.generator.terrainAt(x, y).biome.id;
      if (biome === 'TEMPERATE_FOREST' || biome === 'RAINFOREST' || biome === 'TAIGA') { best = { x, y, biome }; break; }
    }
  }
  const rr = g.activeSim.renderer;
  rr.camera.zoom = 2.6;
  rr.jumpTo(best.x, best.y);
  await new Promise(res => setTimeout(res, 1200));
  return best;
});
check(forest && forest.biome, `found a forest (${forest && forest.biome})`);
await shot('world-forest-trees');

// Mining changes the world
const mined = await page.evaluate(() => {
  const t = window.game.activeSim.terrain;
  const h = t.home;
  const tree = t.findNearestDeposit(h.x, h.y, 'wood', 300);
  const got = t.extract(tree.x, tree.y, 10000);
  return { got, left: t.getDeposit(tree.x, tree.y).amount };
});
check(mined.got > 0 && mined.left === 0, 'felling a tree leaves a stump');

// Far zoom: a continent at a time, and still interactive
const perf = {};
for (const z of [1, 0.3, 0.1, 0.04]) {
  await page.evaluate((zoom) => { const r = window.game.activeSim.renderer; r.camera.zoom = zoom; r.centerCamera(); }, z);
  await wait(z < 0.3 ? 5000 : 2000);
  perf[z] = await fps(2500);
  if (z === 0.1) await shot('world-continent');
  if (z === 0.04) await shot('world-zoomed-out');
}
console.log('fps by zoom:', Object.entries(perf).map(([z, f]) => `${z}:${Math.round(f)}`).join(' '));
check(perf[1] > 12 && perf[0.3] > 12 && perf[0.1] > 12 && perf[0.04] > 12, 'every zoom level stays interactive (software renderer)');

await browser.close();
console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'No console errors.');
const failed = results.filter(r => !r).length + (errors.length ? 1 : 0);
console.log(failed ? `${failed} check(s) FAILED` : 'ALL WORLD CHECKS PASSED');
process.exit(failed ? 1 : 0);
