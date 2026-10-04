// Headless check of the building system in the real game: towns, zoom levels, construction, roads.
// Usage: node scripts/smoke_buildings.mjs <url> [screenshotDir]
import puppeteer from 'puppeteer-core';

const url = process.argv[2] || 'http://localhost:5203/';
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
  g.timeSpeed = 60;
  await new Promise(r => setTimeout(r, 12000));
  g.timeSpeed = 1;
});

const info = await page.evaluate(() => {
  const sim = window.game.activeSim;
  const civ = sim.society.civilizations.find(c => c.isAlive);
  const by = {};
  for (const b of sim.terrain.buildings.values()) by[b.type] = (by[b.type] || 0) + 1;
  return { x: civ.capitalX, y: civ.capitalY, total: sim.terrain.buildings.size, by, name: civ.name };
});
console.log(JSON.stringify(info));
check(info.total >= 4, 'towns exist', `(${info.total} buildings)`);

for (const [zoom, name] of [[2.6, 'town-zoom-close'], [1.4, 'town-zoom-mid'], [0.8, 'town-zoom-wide'], [0.4, 'town-zoom-far'], [0.2, 'town-zoom-overview']]) {
  await page.evaluate((z, x, y) => {
    const r = window.game.activeSim.renderer;
    r.camera.zoom = z;
    r.jumpTo(x, y - 3);
  }, zoom, info.x, info.y);
  await wait(1500);
  await shot(name);
}
// a construction site in every stage next to the capital
await page.evaluate((x, y) => {
  const sim = window.game.activeSim;
  const t = sim.terrain;
  const r = sim.renderer;
  r.camera.zoom = 2.2;
  const types = ['stone_house', 'wooden_house', 'temple', 'longhouse', 'smithy', 'tavern'];
  let px = x - 22;
  const sites = [];
  for (let s = 0; s < 6; s++) {
    for (let tries = 0; tries < 80; tries++) {
      const type = types[s];
      const tx = px + (tries % 8);
      const ty = y + 10 + Math.floor(tries / 8) * 5;
      if (t.canPlaceBuilding(type, tx, ty)) { sites.push(t.placeBuilding(type, tx, ty, { progress: [0.05, 0.2, 0.4, 0.6, 0.8, 0.95][s] })); px = tx + 6; break; }
    }
  }
  window.__sites = sites.length;
  r.jumpTo(x - 10, y + 12);
}, info.x, info.y);
await wait(1500);
await shot('construction-stages');
const sites = await page.evaluate(() => window.__sites);
check(sites >= 4, 'construction sites placed', `(${sites})`);

const fps = await page.evaluate((ms) => new Promise(res => {
  let n = 0;
  const t0 = performance.now();
  const f = () => { n++; performance.now() - t0 < ms ? requestAnimationFrame(f) : res(n / (ms / 1000)); };
  requestAnimationFrame(f);
}), 2500);
check(fps > 20, 'frame rate with a town in view', `(${fps.toFixed(0)} fps)`);
check(errors.length === 0, 'no page errors', errors.slice(0, 3).join(' | '));
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
