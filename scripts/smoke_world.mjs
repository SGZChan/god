// Headless check of the infinite world. Usage: node scripts/smoke_world.mjs <url> [screenshotDir]
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
if (shots) await page.screenshot({ path: `${shots}/world-home.png` });

const start = await page.evaluate(() => {
  const g = window.game;
  const sim = g.activeSim;
  let structures = 0;
  sim.terrain.forEachLoadedTile(t => { if (t.structure) structures++; });
  return { home: sim.terrain.home, structures, chunks: sim.terrain.chunks.size, civs: sim.society.civilizations.filter(c => c.isAlive).length };
});
check(start.civs > 0 && start.structures > 5, 'civilizations built something at home', `(${start.structures} structures, ${start.chunks} chunks)`);

// Explore: hop across 40 x 600 tiles, like a player scrolling a long way
const explored = await page.evaluate(async () => {
  const g = window.game;
  const r = g.activeSim.renderer;
  const ts = r.tileSize * r.camera.zoom;
  const home = g.activeSim.terrain.home;
  let maxChunks = 0;
  for (let i = 1; i <= 40; i++) {
    r.camera.x = r.canvas.width / 2 - (home.x + i * 600) * ts;
    r.camera.y = r.canvas.height / 2 - (home.y + i * 150) * ts;
    await new Promise(res => setTimeout(res, 250));
    maxChunks = Math.max(maxChunks, g.activeSim.terrain.chunks.size);
  }
  return { maxChunks, far: { x: home.x + 40 * 600, y: home.y + 40 * 150 } };
});
check(explored.far.x > 20000, `scrolled ${explored.far.x} tiles from home without a wall`);
await wait(2500);
const afterExplore = await page.evaluate(() => window.game.activeSim.terrain.chunks.size);
check(explored.maxChunks < 600 && afterExplore < 400, 'far chunks are evicted', `(peak ${explored.maxChunks}, now ${afterExplore})`);
if (shots) await page.screenshot({ path: `${shots}/world-far.png` });

// Come home: buildings must still be there
await page.evaluate(() => {
  const r = window.game.activeSim.renderer;
  r.centerCamera();
});
await wait(3000);
const back = await page.evaluate(() => {
  const sim = window.game.activeSim;
  let structures = 0;
  sim.terrain.forEachLoadedTile(t => { if (t.structure) structures++; });
  return { structures, civs: sim.society.civilizations.filter(c => c.isAlive).length };
});
check(back.structures >= start.structures * 0.8 && back.civs === start.civs, 'the home area is intact after the trip', `(${start.structures} -> ${back.structures})`);

// Zoomed out over land: a lot of chunks, must stay smooth
const perf = await page.evaluate(async () => {
  const r = window.game.activeSim.renderer;
  r.camera.zoom = 0.3;
  r.centerCamera();
  await new Promise(res => setTimeout(res, 2500));
  return new Promise(res => {
    let n = 0;
    const t0 = performance.now();
    const f = () => { n++; performance.now() - t0 < 3000 ? requestAnimationFrame(f) : res(n / 3); };
    requestAnimationFrame(f);
  });
});
check(perf > 12, `zoomed all the way out stays interactive (${Math.round(perf)} fps in a software renderer)`);
if (shots) await page.screenshot({ path: `${shots}/world-zoomed-out.png` });

await browser.close();
console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'No console errors.');
const failed = results.filter(r => !r).length + (errors.length ? 1 : 0);
console.log(failed ? `${failed} check(s) FAILED` : 'ALL WORLD CHECKS PASSED');
process.exit(failed ? 1 : 0);
